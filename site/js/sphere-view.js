// The inside of one sphere: its primary, every body on its orbit at the current date, the orbit
// lines, and the boundary (a crystal shell with stars on it in 2e, a silver haze in 5e).
import * as THREE from "three";
import * as O from "./orbits.js";
import { starfield, OrbitLine, hashStr, radialTex, sprite, TAU, rng } from "./gfx.js";
import { buildBody, ringMesh, fieldPoints, fieldRocks } from "./bodies.js";
import { disposeBaked, bakeWorld } from "./planets.js";

const V = () => new THREE.Vector3();

export class SphereView {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.nodes = new Map();
    this.order = [];
    this.kind = "sphere";
    this.sunPos = new THREE.Vector3();   // where the first star is (the light), for bodies that face it
  }

  dispose() {
    for (const n of this.order) n.bh?.dispose();
    disposeBaked();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose?.()); });
    this.scene = new THREE.Scene();
    this.nodes.clear();
    this.order = [];
  }

  async build(sphereId) {
    const { atlas, edition, scale, edit } = this.app.state;
    const renderer = this.app.renderer;
    this.dispose();
    this.sphereId = sphereId;
    this.sphere = atlas.spheres(edition, true).find((s) => s.id === sphereId);
    const bodies = atlas.bodies(sphereId, edition, edit);
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const order = [], seen = new Set();
    const visit = (b, depth = 0) => {
      if (seen.has(b.id) || depth > 32) return;
      if (b.parent && byId.has(b.parent)) visit(byId.get(b.parent), depth + 1);
      seen.add(b.id);
      order.push(b);
    };
    bodies.forEach((b) => visit(b));

    // the boundary: the shell radius from the data, or twice the farthest orbit (the sphere law)
    let far = 0;
    for (const b of bodies) {
      if (b.parent && byId.get(b.parent)?.parent) continue;
      if (b.orbit) { const el = O.elements(b.orbit); far = Math.max(far, el.a * (1 + el.e)); }
      if (b.fixed) far = Math.max(far, b.fixed.r_mi || 0);
    }
    const shellMi = this.sphere.shell_radius_mi || (far ? far * 2 : 1e9);
    this.R = O.primaryRadius(shellMi, scale);
    this.boundary = this.sphere.boundary?.[edition] || (edition === "2e" ? "shell" : "haze");
    this.buildBoundary(edition);

    this.ambient = new THREE.AmbientLight(0x9fb0d0, 0.16);
    this.scene.add(this.ambient);

    // the suns that light the sphere; every one after the first gets a smaller halo
    const lit = order.filter((b) => b.kind === "star" && b.look?.light !== false && !(b.look?.cluster > 1));
    for (const b of order) {
      const parent = b.parent ? this.nodes.get(b.parent) : null;
      const sat = !!(parent && parent.b.parent);
      const r = O.drawRadius(b, sat);
      const node = await buildBody(b, r, renderer, { secondary: lit.indexOf(b) > 0 });
      Object.assign(node, { b, parent, sat, el: b.orbit ? O.elements(b.orbit) : null, world: V(), angle: 0 });
      if (b.orbit && node.el.P && b.day_hours && Math.abs(b.day_hours / 24 - node.el.P) < 0.02 * node.el.P) node.locked = true;
      this.nodes.set(b.id, node);
      this.order.push(node);

      if (b.kind === "ring" && parent) {
        const m = await ringMesh(b, parent.r, renderer);
        parent.group.add(m);
        node.mesh = m;
        node.group = parent.group;
        node.ringOf = parent;
        continue;
      }
      if (b.kind === "portal") {
        node.group.add(sprite(radialTex([[0, "rgba(255,255,255,1)"], [0.2, "rgba(200,220,255,.7)"], [1, "rgba(0,0,0,0)"]]), 1.4));
        node.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        node.group.add(node.mesh);
      }
      if (b.kind === "sargasso" && b.orbit && (b.field?.count || 1) > 1) {
        // one orbit, several globes spaced evenly along it
        node.copies = [];
        for (let i = 1; i < b.field.count; i++) {
          const c = node.group.clone();
          this.scene.add(c);
          node.copies.push({ group: c, offset: i / b.field.count });
        }
      }
      if (b.field?.follows) {
        const lead = byId.get(b.field.follows);
        const leadEl = lead?.orbit ? O.elements(lead.orbit) : null;
        if (leadEl && parent) {
          const arc = (b.field.arc_deg || 70) / 360;
          const mapped = (d) => this.mapRel(O.positionAt({ ...leadEl, M0: 0, P: 0 }, 0, V()).applyAxisAngle(this.orbitNormal(leadEl), -d * arc * TAU), parent, sat);
          node.fieldOf = { lead: b.field.follows, el: leadEl };
          node.points = fieldPoints(b, mapped, hashStr(b.id), 0.7);
          node.group.add(node.points);
          node.group.add(fieldRocks(b, mapped, hashStr(b.id), parent.r * 0.022));
        }
      } else if (b.kind === "asteroid-field") {
        // a ring of rocks around the parent (or around the center of the sphere when it has none)
        const el = b.orbit ? O.elements(b.orbit) : { a: 1, e: 0, i: 0, node: 0, argp: 0, P: 0, M0: 0 };
        if (b.field?.fill || b.field?.shell) {
          // rocks all through the sphere out to the orbit radius (Passarspace, Kra'akenspace), or a
          // hollow shell of rocks all around the parent (Greyspace's Grinder), not a ring
          const fillIt = !!b.field.fill;
          const spot = (R) => {
            const u = R() * 2 - 1, a = R() * TAU, s2 = Math.sqrt(1 - u * u), d = fillIt ? el.a * Math.cbrt(0.02 + 0.98 * R()) : el.a;
            return this.mapRel(new THREE.Vector3(Math.cos(a) * s2, u, Math.sin(a) * s2).multiplyScalar(d), parent, sat);
          };
          const R1 = rng(hashStr(b.id + "dust")), R2 = rng(hashStr(b.id + "rocks"));
          node.points = fieldPoints(b, () => spot(R1), hashStr(b.id), fillIt ? 2 : 1.6);
          // real rocks too, or the dust reads as stars
          node.group.add(fieldRocks(b, () => spot(R2), hashStr(b.id), this.R * (fillIt ? 0.012 : 0.008)));
        } else {
          node.points = fieldPoints(b, (d) => this.mapRel(O.positionAt({ ...el, M0: d * TAU * 7.31, P: 0 }, 0, V()), parent, sat), hashStr(b.id));
        }
        node.fieldRing = { parent: parent || { world: new THREE.Vector3(), r: 0 }, radius: this.mapRel(new THREE.Vector3(el.a || 1, 0, 0), parent, sat).length() };
        node.group.add(node.points);
      }

      if (node.el && b.kind !== "asteroid-field") {
        const samples = O.samplePath(node.el, 360).map((s) => ({ p: this.mapRel(s.p, parent, sat), f: s.f }));
        const line = new OrbitLine(samples, b.look?.color || "#8fa0bc", sat ? 1.2 : 1.5, b.kind === "comet" ? { dashed: true, dash: 0.3, gap: 0.25, floor: 0.12 } : { floor: sat ? 0.1 : 0.17 });
        const holder = new THREE.Group();
        holder.add(line.line);
        this.scene.add(holder);
        node.orbit = { line, holder };
      }
      if (!node.ringOf) this.scene.add(node.group);
    }
    for (const n of this.order) if (n.tree) this.growTree(n);

    // A sphere with many suns (Faeriespace has sixteen) keeps four lights, because each light costs
    // every pixel of every world. The other suns still shine, and the ambient light stands in for them.
    const lights = [];
    this.scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    if (lights.length > 4) {
      lights.slice(4).forEach((l) => l.parent.remove(l));
      this.ambient.intensity = 0.16 + 0.04 * Math.min(lights.length - 4, 10);
    }
    // a sphere with no sun at all (Darkspace, Passarspace) gets enough ambient light to see its rocks
    if (!lights.length) this.ambient.intensity = 0.55;
    this.update(this.app.state.day, 0);
  }

  // A tree that fills the sphere (Faeriespace's Great Tree): a trunk through the center, and a
  // branch out to each body that rests on it or hangs from it (its children with a fixed place),
  // with leaves along the branches. The books give no shape, so this follows the bodies' places.
  growTree(n) {
    const kids = this.order.filter((c) => c.parent === n && c.b.fixed);
    const ends = kids.map((c) => ({ c, p: this.mapRel(O.fixedPosition(c.b.fixed), n, c.sat) }));
    const top = Math.max(4, ...ends.map((e) => Math.abs(e.p.y))) * 1.3;
    const R = rng(hashStr(n.b.id + "tree"));
    const bark = new THREE.MeshStandardMaterial({ color: new THREE.Color(n.b.look?.bark || "#6b4a30"), roughness: 1 });
    const trunkR = top * 0.035;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.7, trunkR * 1.25, top * 2, 24, 8), bark));
    // a tapered tube along a curve: thick at the trunk, thin at the end
    const branch = (curve, r0, r1) => {
      const g = new THREE.TubeGeometry(curve, 40, 1, 8, false), pos = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i <= 40; i++) {
        const c = curve.getPointAt(i / 40), rad = r0 + (r1 - r0) * (i / 40);
        for (let j = 0; j <= 8; j++) {
          const k = i * 9 + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rad).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
      }
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, bark));
    };
    const leaves = [];
    for (const { c, p } of ends) {
      const y0 = Math.max(-top * 0.85, Math.min(top * 0.85, p.y * 0.6));
      const start = new THREE.Vector3(0, y0, 0);
      const out = p.clone().setY(0).normalize();
      const end = p.clone().sub(p.clone().sub(start).normalize().multiplyScalar(c.r * 1.3));
      const mid = start.clone().lerp(end, 0.5).add(out.clone().multiplyScalar(start.distanceTo(end) * 0.12)).add(new THREE.Vector3(0, start.distanceTo(end) * 0.08, 0));
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const heavy = c.b.kind === "planet" ? 1 : 0.6;
      branch(curve, trunkR * 0.55 * heavy, trunkR * 0.12 * heavy);
      // two side shoots from each branch
      for (let k = 0; k < 2; k++) {
        const t = 0.35 + 0.4 * R(), a = curve.getPointAt(t);
        const dir = new THREE.Vector3(R() - 0.5, R() * 0.6, R() - 0.5).normalize();
        const b2 = a.clone().add(dir.multiplyScalar(start.distanceTo(end) * (0.15 + 0.15 * R())));
        branch(new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b2, 0.5).add(new THREE.Vector3(0, 0.3, 0)), b2), trunkR * 0.18 * heavy, trunkR * 0.04);
        for (let q = 0; q < 70; q++) leaves.push(b2.clone().add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(start.distanceTo(end) * 0.12)));
      }
      for (let q = 0; q < 140; q++) {
        const t = 0.5 + 0.5 * R();
        leaves.push(curve.getPointAt(t).add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(start.distanceTo(end) * 0.1)));
      }
    }
    const lg = new THREE.BufferGeometry().setFromPoints(leaves);
    const leafCols = new Float32Array(leaves.length * 3);
    for (let i = 0; i < leaves.length; i++) new THREE.Color().setHSL(0.24 + 0.1 * R(), 0.55, 0.3 + 0.15 * R()).toArray(leafCols, i * 3);
    lg.setAttribute("color", new THREE.BufferAttribute(leafCols, 3));
    group.add(new THREE.Points(lg, new THREE.PointsMaterial({ size: trunkR * 0.9, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })));
    n.group.add(group);
    n.extent = top;
    n.labelR = trunkR * 2;
  }

  // A position relative to the parent (true miles) -> view units, with the mapping for its level.
  mapRel(vMi, parent, sat) {
    if (!parent) return O.mapPrimary(vMi, this.app.state.scale, V());
    return sat ? O.mapSatellite(vMi, parent.r, V()) : O.mapPrimary(vMi, this.app.state.scale, V());
  }
  orbitNormal(el) { return new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), el.i).applyAxisAngle(new THREE.Vector3(0, 1, 0), el.node); }

  buildBoundary(edition) {
    const R = this.R;
    // a sphere whose shell holds land on its inner face (Herdspace: seas, mountains and farms all
    // around the sun), painted like a world and seen from inside
    const inner = this.sphere.inner;
    if (inner?.proc?.style && this.boundary === "shell") {
      const maps = bakeWorld(this.app.renderer, { proc: inner.proc }, this.sphereId + "-inner", { big: true });
      this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 128, 96), new THREE.MeshStandardMaterial({ map: maps.map, side: THREE.BackSide, roughness: 1 })));
    }
    if (this.boundary === "shell") {
      // 2e: the stars are openings in the shell, so they sit on it
      this.scene.add(starfield(this.sphere.stars ?? 6500, R * 0.995, hashStr(this.sphereId)));
      this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 5.0); gl_FragColor = vec4(vec3(0.55, 0.64, 1.0) * f * 0.35, 1.0); }`,
      })));
      this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.002, 96, 64), crystalMaterial()));
    } else {
      // 5e: no shell; a silver haze where wildspace meets the Astral Sea
      this.scene.add(starfield(this.sphere.stars ?? 6500, 900, hashStr(this.sphereId)));
      this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.ShaderMaterial({
        side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); gl_FragColor = vec4(vec3(0.78, 0.82, 0.92) * f * 0.42, 1.0); }`,
      })));
    }
  }

  update(day, dtReal) {
    const st = this.app.state, rate = st.playing ? st.rate : 0;
    const cam = this.app.camera;
    this.sunSeen = false;
    for (const n of this.order) {
      const b = n.b, p = n.parent;
      const pw = p ? p.world : V();
      if (n.ringOf) continue;
      if (n.fieldOf) {
        n.world.copy(pw);
        n.group.position.copy(pw);
        const lead = this.nodes.get(n.fieldOf.lead);
        if (lead?.el) {
          // turn the trail about the lead's orbit normal so it stays just behind the lead
          const axis = this.orbitNormal(lead.el);
          const a = O.positionAt({ ...lead.el, M0: 0, P: 0 }, 0, V()), now = O.positionAt(lead.el, day, V());
          const ang = Math.atan2(axis.dot(a.clone().cross(now)), a.dot(now));
          n.group.quaternion.setFromAxisAngle(axis, ang);
        }
        continue;
      }
      if (b.kind === "asteroid-field") {
        n.world.copy(pw);
        n.group.position.copy(pw);
        continue;
      }
      if (b.orbit && n.el) {
        const rel = this.mapRel(O.positionAt(n.el, day, V()), p, n.sat);
        n.world.copy(pw).add(rel);
        if (n.orbit) {
          n.orbit.holder.position.copy(pw);
          const sel = st.selected?.type === "body" ? st.selected.id : null;
          const boost = !sel || sel === b.id || sel === b.parent || this.nodes.get(sel)?.b.parent === b.id ? 1 : 0.3;
          const changed = boost !== n.orbit.line.boost;
          n.orbit.line.boost = boost;
          n.orbit.line.setHead((((O.meanAnomaly(n.el, day)) / TAU) % 1 + 1) % 1, changed);
        }
        if (n.copies) for (const c of n.copies) {
          const rc = this.mapRel(O.positionAt({ ...n.el, M0: n.el.M0 + c.offset * TAU }, day, V()), p, n.sat);
          c.group.position.copy(pw).add(rc);
        }
      } else if (b.fixed) {
        n.world.copy(pw).add(this.mapRel(O.fixedPosition(b.fixed), p, n.sat));
      } else n.world.copy(pw);
      n.group.position.copy(n.world);
      if (b.kind === "star" && b.look?.light !== false && !(b.look?.cluster > 1) && !this.sunSeen) { this.sunPos.copy(n.world); this.sunSeen = true; }
      if (n.update) n.update({ world: n.world, camera: cam, t: this.app.t, dtReal, view: this });
      const pv = n.pivot || n.mesh;
      if (pv && !n.noSpin) {
        if (n.faceCenter) pv.lookAt(0, 0, 0);
        else if (n.locked && p) pv.lookAt(p.world);
        else if (n.spin) {
          n.angle += Math.max(-0.15, Math.min(0.15, rate * n.spin)) * dtReal;
          pv.rotation.y = n.angle;
        }
        if (n.slowTurn) pv.rotation.y += n.slowTurn * dtReal;
        if (n.tumble) { pv.rotation.x += n.tumble * dtReal; pv.rotation.z += n.tumble * 0.6 * dtReal; }
      }
    }
  }

  // Everything the label layer should draw this frame.
  labelItems() {
    const cam = this.app.camera, items = [];
    const sel = this.app.state.selected;
    for (const n of this.order) {
      const b = n.b;
      if (b.kind === "ring") continue;
      let anchor = n.world, r = n.r;
      if (n.fieldOf) {
        const lead = this.nodes.get(n.fieldOf.lead);
        if (!lead) continue;
        const rel = lead.world.clone().sub(n.parent.world).applyAxisAngle(this.orbitNormal(lead.el), -1.05);
        anchor = n.parent.world.clone().add(rel);
        r = 0.05;
      }
      const near = n.parent ? cam.position.distanceTo(n.parent.world) < Math.max(n.parent.r * 26, 4) : true;
      const minor = n.sat || ["asteroid", "asteroid-field", "sargasso", "portal"].includes(b.kind);
      const isSel = sel?.type === "body" && sel.id === b.id;
      const show = isSel || (!minor ? true : near && this.app.state.layers.minor);
      if (!show) continue;
      if (n.labelR) r = n.labelR;
      items.push({ key: b.id, text: b.name, world: anchor, r, color: b.look?.color || "#9fb0c8", dim: minor && !n.sat ? true : b.kind === "nebula" || b.kind === "comet", ring: b.kind !== "asteroid-field", sel: isSel, kind: b.kind });
    }
    // surface pins when the camera is close to a textured world
    for (const n of this.order) {
      const pins = this.pinsOf(n.b);
      if (!pins.length || !n.mesh) continue;
      if (cam.position.distanceTo(n.world) > n.r * 16) continue;
      for (const pin of pins) {
        const phi = pin.u * TAU, th = pin.v * Math.PI;
        const local = new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)).multiplyScalar(n.r * 1.004);
        const w = n.mesh.localToWorld(local.clone());
        const facing = w.clone().sub(n.world).normalize().dot(cam.position.clone().sub(w).normalize()) > 0.08;
        if (facing) items.push({ key: `${n.b.id}:pin:${pin.name}`, text: pin.name, world: w, r: 0, pin: true, link: pin.link });
      }
    }
    return items;
  }

  render(renderer, camera) {
    renderer.clear();
    renderer.render(this.scene, camera);
  }

  // The pins on a world: its own from the atlas, then any that the page link gives (?pin=).
  pinsOf(b) {
    return [...(this.app.urlPins?.get(b.id) || []), ...(b.pins || [])];
  }

  // Turn a world on its axis so its first map pin faces the given direction.
  facePin(id, dir) {
    const n = this.nodes.get(id);
    const pin = n && this.pinsOf(n.b)[0];
    if (!pin || !n.mesh) return;
    const phi = pin.u * TAU, th = pin.v * Math.PI;
    const local = new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    n.angle = Math.atan2(dir.x, dir.z) - Math.atan2(local.x, local.z) - 0.25;
    n.mesh.rotation.y = n.angle;
  }

  // The middle of an asteroid trail, behind the body it follows.
  fieldAnchor(id) {
    const n = this.nodes.get(id), lead = n?.fieldOf && this.nodes.get(n.fieldOf.lead);
    if (!lead) return null;
    const rel = lead.world.clone().sub(n.parent.world).applyAxisAngle(this.orbitNormal(lead.el), -0.55);
    return n.parent.world.clone().add(rel);
  }

  bodyWorld(id) { return this.nodes.get(id)?.world || null; }
  bodyRadius(id) { return this.nodes.get(id)?.r || 0.5; }
  frameDistance() {
    let far = 3;
    // the worlds and suns that circle the primary or sit at fixed places (not comets, clouds or rocks)
    for (const n of this.order) if (!n.sat && n.parent && (n.b.orbit || n.b.fixed) && ["planet", "star", "moon", "structure", "other", "black-hole"].includes(n.b.kind)) far = Math.max(far, n.world.length());
    for (const n of this.order) if (n.extent) far = Math.max(far, n.extent * 1.15);
    return far * 2.5;
  }

  // Load the largest texture tier the screen can use for a world that the camera has focused on.
  async sharpen(id) {
    const n = this.nodes.get(id);
    if (!n?.texturedSphere || typeof n.b.look?.texture !== "object" || n.sharp) return;
    n.sharp = true;
    const { bodyTexture } = await import("./gfx.js");
    const tex = await bodyTexture(n.b.look, this.app.renderer, { maxTier: 16384 });
    if (tex && n.surface?.material) { n.surface.material.map = tex; n.surface.material.needsUpdate = true; }
  }
}

// The crystal shell seen from outside in the sphere view: clear glass with a rainbow rim, so the
// system inside stays visible. (The phlogiston map draws the shells as opaque beads.)
export function crystalMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main(){
        float ndv = clamp(dot(vN, vV), 0.0, 1.0), fr = pow(1.0 - ndv, 3.2);
        vec3 iri = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vN.y * 0.55 + vN.x * 0.35));
        vec3 col = mix(vec3(0.7, 0.78, 1.0), iri, 0.55) * fr * 0.55 + vec3(0.02, 0.025, 0.04);
        vec3 Lh = normalize(normalize(vec3(-0.45, 0.65, 0.7)) + vV);
        col += pow(max(dot(vN, Lh), 0.0), 400.0) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// The outside of a crystal shell: dark ceramic with a rainbow rim (the phlogiston's light).
export function beadMaterial(tint = [0.028, 0.032, 0.05]) {
  return new THREE.ShaderMaterial({
    uniforms: { base: { value: new THREE.Vector3(...tint) }, fogNear: { value: 1e6 }, fogFar: { value: 2e6 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vDepth;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 base; uniform float fogNear; uniform float fogFar; varying vec3 vN; varying vec3 vV; varying float vDepth;
      void main(){
        float ndv = clamp(dot(vN, vV), 0.0, 1.0), fr = pow(1.0 - ndv, 3.0);
        vec3 iri = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + vN.y * 0.55 + vN.x * 0.35));
        vec3 col = base * (0.4 + 0.6 * ndv) + mix(vec3(0.78, 0.84, 1.0), iri, 0.6) * fr * 1.25;
        vec3 Lh = normalize(normalize(vec3(-0.45, 0.65, 0.7)) + vV);
        col += pow(max(dot(vN, Lh), 0.0), 600.0) * 0.45;
        col *= 1.0 - 0.72 * smoothstep(fogNear, fogFar, vDepth);  // far beads dim, so the depth reads
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
