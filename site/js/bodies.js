// One builder per kind of body. Each returns a node: { group, pivot, mesh, r, update? }.
// group is placed by the view every frame; pivot carries the body's own turn (spin, facing);
// update() handles what has to follow the scene (a comet's tails, the Spindle facing the sun).
// Models load in the background: a simple shape stands in until the model arrives.
import * as THREE from "three";
import { bodyTexture, radialTex, sprite, points, rng, gauss, hashStr, TAU, canvasTex, loadImage, srgb, recolor } from "./gfx.js";
import { modelClone, meshParts, ROCKS, ROCKS_LO, studioEnv } from "./models.js";
import { BlackHole } from "./blackhole.js";
import { bakeWorld } from "./planets.js";

const glow = (stops) => radialTex(stops, 256);
const ringTexCache = new Map();
const sunTexCache = new Map();   // star surfaces by color, shared by every star of that color
const V = () => new THREE.Vector3();

// Put a model under the pivot when it has loaded, in place of the stand-in shape.
function attach(node, url, scale, opts = {}) {
  return modelClone(url).then((m) => {
    if (!m) return null;
    m.scale.setScalar(scale);
    m.traverse((o) => {
      if (!o.isMesh) return;
      if (opts.material) o.material = opts.material;
      else if (opts.tint) { o.material = o.material.clone(); o.material.color.multiply(opts.tint); }
      if (opts.flat) o.material.flatShading = true;
    });
    if (opts.rotation) m.rotation.copy(opts.rotation);
    if (node.standin) { node.pivot.remove(node.standin); node.standin.geometry?.dispose(); node.standin = null; }
    node.pivot.add(m);
    node.model = m;
    return m;
  });
}

const tintOf = (b, fallback = "#ffffff") => new THREE.Color(b.look?.tint_color || b.look?.color || fallback);

export async function buildBody(b, r, renderer, opts = {}) {
  const color = new THREE.Color(b.look?.color || "#9fb0c8");
  const group = new THREE.Group(), pivot = new THREE.Group();
  group.add(pivot);
  const node = { group, pivot, r, spin: 0, update: null, mesh: pivot };
  const shape = b.shape || (["asteroid", "island", "dead-god"].includes(b.kind) ? "irregular" : "sphere");
  const look = b.look || {};

  if (b.kind === "star" && look.cluster > 1) return starCluster(node, b, r, color);
  if (b.kind === "star") {
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 64, 48), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    pivot.add(core);
    // the photo of the Sun is orange: a star of another color gets the photo in gray, tinted
    const hex = (look.color || "#fff3e0").toLowerCase(), tinted = hex !== "#fff3e0";
    loadImage("assets/textures/2k_sun.jpg").then((im) => {
      if (!im) return;
      if (!sunTexCache.has(hex)) {
        const rgbOf = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
        sunTexCache.set(hex, tinted ? recolor(im, rgbOf.map((v) => 0.55 + 1.15 * v), 0.08) : srgb(new THREE.Texture(im)));
      }
      core.material.map = sunTexCache.get(hex);
      if (tinted) {
        core.material.color = new THREE.Color(1.15, 1.15, 1.15);
      } else {
        core.material.color = color.clone().lerp(new THREE.Color("#ffffff"), 0.35).multiplyScalar(1.25);
      }
      core.material.needsUpdate = true;
    });
    const warm = color.clone().lerp(new THREE.Color("#ffb070"), tinted ? 0.12 : 0.5);
    const c = (k, a) => `rgba(${Math.round(warm.r * 255 * k)},${Math.round(warm.g * 255 * k)},${Math.round(warm.b * 255 * k)},${a})`;
    // a sun that circles another body (one of several suns) gets a smaller halo, so a sky of many
    // suns does not wash out
    const halo = opts.secondary ? 0.5 : 1;
    group.add(sprite(glow([[0, "rgba(255,252,246,1)"], [0.1, c(1, 0.9)], [0.3, c(1, 0.32)], [0.6, c(0.9, 0.08)], [1, c(0.8, 0)]]), r * 11 * halo));
    group.add(sprite(glow([[0, c(1, 0.22)], [0.35, c(1, 0.06)], [1, "rgba(0,0,0,0)"]]), r * 36 * halo * halo));
    // the light takes some of the star's color (a red sun lights its worlds red); a minor star
    // (look.light false) lights nothing
    if (look.light !== false) group.add(new THREE.PointLight(new THREE.Color("#fff3e4").lerp(color, 0.45), 3.4, 0, 0));
    if (shape === "cluster") fireKnot(node, b, r, color);
    if (look.pulse_hours > 0) {
      // a star that swells and shrinks (Heartspace's Heart): the beat follows the clock, slowed
      // to one beat in five seconds at most so that it reads as a beat
      let phase = 0;
      const w = TAU * 24 / look.pulse_hours;
      node.update = ({ dtReal, view }) => {
        const st = view.app.state, rate = st.playing ? st.rate : 0;
        phase += Math.min(Math.abs(rate * w), 1.25) * dtReal;
        const k = 1 + 0.1 * Math.sin(phase);
        pivot.scale.setScalar(k);
      };
    }
    if (b.day_hours > 0) node.spin = TAU / (b.day_hours / 24);  // Realmspace's sun: a 37-hour day
    node.noTumble = true;
    return node;
  }

  if (b.kind === "black-hole") {
    const disk = b.look?.disk || {};
    const phone = innerWidth < 760;
    const bh = new BlackHole({ rs: r, reach: disk.reach ?? 13, disk, tilt: ((disk.tilt_deg ?? 18) * Math.PI) / 180, steps: phone ? 90 : 150 });
    group.add(bh.mesh);
    // the glowing ring is the only light in its sphere: a dim, red light for the worlds around it
    group.add(new THREE.PointLight(new THREE.Color(disk.light || "#ff6a3a"), disk.light_power ?? 2.2, 0, 0));
    node.bh = bh;
    node.mesh = bh.mesh;
    node.extent = r * (disk.reach ?? 13);
    node.labelR = r * 2.7;   // the apparent edge of the shadow
    node.noSpin = true;
    node.update = ({ world, camera, view, t }) => bh.update(camera, view.scene, view.app.renderer, world, view.R, t, view.app.state.playing);
    return node;
  }

  if (b.kind === "nebula") {
    const cl = b.cloud || {};
    const L = 1.6 * (look.scale || 1) * Math.sqrt(Math.max(cl.length_mi || 2e6, 2e5) / 2e6);
    const tex = await nebulaTexture(b);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.85 }));
    s.scale.set(cl.shape === "fan" ? L * 2 : L * 1.4, cl.shape === "fan" ? L : L * 1.4, 1);
    group.add(s);
    node.pick = L * 0.6;
    return node;
  }

  if (b.kind === "ring") return node; // the view attaches rings to the parent (see ringMesh)
  if (b.kind === "asteroid-field") return node; // the view draws the rocks and dust (fieldPoints, fieldRocks)

  if (b.kind === "sargasso") {
    const mat = deadMagicMaterial();
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat));
    group.add(sprite(glow([[0, "rgba(0,0,0,0)"], [0.62, "rgba(0,0,0,0)"], [0.7, "rgba(150,110,230,.22)"], [1, "rgba(0,0,0,0)"]]), r * 2.9));
    node.update = ({ t }) => { mat.uniforms.t.value = t; };
    return node;
  }

  if (b.kind === "comet") return comet(node, b, r);

  // ----- solid bodies -----
  if (look.model) {
    node.standin = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.8, 1), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    pivot.add(node.standin);
    const isSkull = shape === "skull";
    attach(node, look.model, r * (isSkull ? 2 : 1) * (look.model_scale || 1),
      isSkull ? { material: new THREE.MeshStandardMaterial({ vertexColors: true, color: tintOf(b, "#efe6d2"), roughness: 0.85 }) } : {});
    if (isSkull) node.faceCenter = true;
    if (shape === "castle") node.slowTurn = 0.04;
  } else if (shape === "tree") {
    node.tree = true;   // the sphere view grows the tree (growTree), when it knows where its branches end
    node.noSpin = true;
  } else if (shape === "disc" || shape === "hemisphere") {
    if (look.spindle) discWorld(node, b, r);   // H'Catha: a sea with the Spindle at its center
    else await flatWorld(node, b, r, renderer, color, shape === "hemisphere");
  } else if (shape === "cluster") {
    rockCluster(node, b, r, color);
  } else if (shape === "irregular") {
    node.standin = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.85, 1), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    pivot.add(node.standin);
    attach(node, ROCKS[hashStr(b.id) % 4], r, { tint: color.clone().lerp(new THREE.Color("#ffffff"), 0.35) });
    node.tumble = 0.15;
  } else if (shape === "cylinder") {
    const metal = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.92, envMap: studioEnv(renderer), envMapIntensity: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 2.2, 32, 1), metal);
    pivot.add(body);
    for (const sy of [-1, 1]) {  // the two locked doors, one at each end
      const door = new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 24), new THREE.MeshStandardMaterial({ color: 0x4a6fa8, emissive: 0x1d3a6e, emissiveIntensity: 0.8, roughness: 0.4 }));
      door.position.y = sy * (r * 1.1 + 0.001);
      door.rotation.x = -sy * Math.PI / 2;
      body.add(door);
    }
    node.tumble = 0.45;
  } else if (shape === "castle" || (b.kind === "structure" && !b.shape)) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.9 });
    pivot.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 0.6, r * 0.35, 24), new THREE.MeshStandardMaterial({ color: 0x5d7a45, roughness: 1 })));
    const keep = new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, r * 0.6, r * 0.7), stone);
    keep.position.y = r * 0.45;
    pivot.add(keep);
  } else if (shape === "ship" || b.kind === "ship") {
    const hull = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 1.8, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 }));
    hull.rotation.z = Math.PI / 2;
    pivot.add(hull);
  } else {
    // a globe, or a solid of another shape with the same kind of surface (ellipsoid, crescent, torus, cube)
    const solid = ["ellipsoid", "crescent", "torus", "cube", "tetrahedron"].includes(shape) ? shape : "sphere";
    const { mat, clouds } = await worldMaterial(b, look, renderer, color);
    node.surface = new THREE.Mesh(worldGeometry(solid, r, look), mat);
    pivot.add(node.surface);
    node.texturedSphere = solid === "sphere" && !!mat.map;
    if (clouds && (solid === "sphere" || solid === "ellipsoid")) {
      const cg = worldGeometry(solid, r * 1.012, look);
      const layer = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: new THREE.Color(look.proc.cloud_color || "#ffffff"), alphaMap: clouds, transparent: true, depthWrite: false, roughness: 1 }));
      pivot.add(layer);
      node.update = ({ dtReal }) => { layer.rotation.y += 0.012 * dtReal; };
    }
  }

  if (look.atmosphere && (shape === "sphere" || shape === "ellipsoid" || shape === "cluster")) {
    const atm = new THREE.Color(look.atmosphere);
    group.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.004, 64, 48), rimMaterial(atm)));
    const limb = 1 / 1.34;
    group.add(sprite(radialTex([[0, "rgba(0,0,0,0)"], [limb - 0.02, "rgba(0,0,0,0)"], [limb, `rgba(${atm.r * 255 | 0},${atm.g * 255 | 0},${atm.b * 255 | 0},.42)`], [limb + 0.04, `rgba(${atm.r * 230 | 0},${atm.g * 230 | 0},${atm.b * 255 | 0},.16)`], [limb + 0.12, "rgba(70,130,255,.05)"], [1, "rgba(0,0,0,0)"]], 512), 2 * 1.34 * r));
  }
  if (look.islands) floatingIslands(node, b, r);
  if (look.moonlets) moonlets(node, b, r);
  if (b.day_hours > 0) node.spin = TAU / (b.day_hours / 24);
  return node;
}

// A star that is a cluster of fire bodies of many colors circling each other (Clusterspace's
// Firefall): bright globes on tilted circles around the core.
function fireKnot(node, b, r, color) {
  const R = rng(hashStr(b.id + "knot")), hues = [0.02, 0.08, 0.13, 0.55, 0.62, 0.8, 0.95];
  const holder = new THREE.Group();
  node.group.add(holder);
  const rings = [];
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Group();
    ring.rotation.set(R() * 3, R() * 3, R() * 3);
    const c = new THREE.Color().setHSL(hues[i], 0.85, 0.62);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r * (0.16 + 0.12 * R()), 24, 16), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
    ball.position.x = r * (1.05 + 0.5 * R());
    ball.add(sprite(glow([[0, "rgba(255,255,255,.9)"], [0.25, "rgba(255,255,255,.3)"], [1, "rgba(0,0,0,0)"]]), r * 1.6, 0.8, c));
    ring.add(ball);
    ring.userData.w = (0.3 + 0.5 * R()) * (R() < 0.5 ? 1 : -1);
    holder.add(ring);
    rings.push(ring);
  }
  node.extent = r * 2;
  node.update = ({ dtReal }) => { for (const g of rings) g.rotation.y += g.userData.w * dtReal; };
}

// A group of small stars that count as one body (Greyspace's Sisters): bright points with halos,
// and no light of their own.
function starCluster(node, b, r, color) {
  const R = rng(hashStr(b.id + "stars")), n = Math.min(b.look.cluster, 40);
  const warm = color.clone().lerp(new THREE.Color("#ffffff"), 0.4);
  const halo = glow([[0, "rgba(255,255,255,1)"], [0.15, "rgba(255,255,255,.55)"], [0.45, "rgba(255,255,255,.08)"], [1, "rgba(0,0,0,0)"]]);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * TAU, d = r * 2.2 * Math.cbrt(R()), s2 = Math.sqrt(1 - u * u);
    const k = r * (0.12 + 0.12 * R());
    const core = new THREE.Mesh(new THREE.SphereGeometry(k, 16, 12), new THREE.MeshBasicMaterial({ color: warm, toneMapped: false }));
    core.position.set(Math.cos(a) * s2 * d, u * d * 0.6, Math.sin(a) * s2 * d);
    const h = sprite(halo, k * 9, 0.8, color);
    h.position.copy(core.position);
    node.group.add(core, h);
  }
  node.noSpin = true;
  node.extent = r * 2.6;
  return node;
}

// ---------- surfaces and solids ----------
// The surface of a world: painted on the GPU (look.proc), a texture file, or a plain painted globe.
async function worldMaterial(b, look, renderer, color) {
  if (look.proc?.style) {
    const maps = bakeWorld(renderer, look, b.id, { big: "GHIJ".includes(b.size_class || "") });
    const mat = new THREE.MeshStandardMaterial({ map: maps.map, roughness: maps.roughnessMap ? 1 : 0.92, roughnessMap: maps.roughnessMap || null, metalness: 0 });
    if (maps.emissiveMap) Object.assign(mat, { emissiveMap: maps.emissiveMap, emissive: new THREE.Color(0xffffff), emissiveIntensity: look.proc.glow ?? 1.6 });
    return { mat, clouds: maps.cloudMap || null };
  }
  const map = b.kind !== "structure" ? await bodyTexture(look, renderer) : null;
  return { mat: new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : color, roughness: 0.92, metalness: 0 }), clouds: null };
}

// The solid for a world's shape. An ellipsoid is a stretched globe (look.stretch [x, y, z]); a
// crescent is a globe with a round bite out of one side; a torus lies flat in its orbit plane.
function worldGeometry(shape, r, look = {}) {
  if (shape === "ellipsoid") {
    const g = new THREE.SphereGeometry(r, 64, 48);
    const [x, y, z] = look.stretch || [1.3, 0.78, 0.92];
    return g.scale(x, y, z);
  }
  if (shape === "crescent") {
    const g = new THREE.SphereGeometry(r, 192, 144);
    const p = g.attributes.position, cx = r * 0.6, R = r * 0.86;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rho2 = y * y + z * z;
      // a point inside the bite moves along x onto the near face of the bite, which hollows that side
      if ((x - cx) * (x - cx) + rho2 < R * R) p.setX(i, cx - Math.sqrt(R * R - rho2));
    }
    g.computeVertexNormals();
    return g.rotateZ(Math.PI / 2 - 0.75);   // the bite looks up and to one side: a crescent from most views
  }
  if (shape === "torus") return new THREE.TorusGeometry(r * 0.72, r * 0.3, 48, 128).rotateX(Math.PI / 2);
  if (shape === "cube") return new THREE.BoxGeometry(r * 1.45, r * 1.45, r * 1.45, 8, 8, 8);
  if (shape === "tetrahedron") return new THREE.TetrahedronGeometry(r * 1.35, 0);
  return new THREE.SphereGeometry(r, 64, 48);
}

// A flat world: a thick disc with a painted top and bottom and a rock rim. A hemisphere world
// (Clusterspace's flat worlds) is a dome of rock with its painted flat side to the sun.
async function flatWorld(node, b, r, renderer, color, hemisphere = false) {
  const look = b.look || {};
  const top = look.proc?.style ? bakeWorld(renderer, look, b.id, { flat: true, big: "GHIJ".includes(b.size_class || "") }).map : await bodyTexture(look, renderer);
  const face = new THREE.MeshStandardMaterial({ map: top, color: top ? 0xffffff : color, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.rim_color || "#6d6458"), roughness: 1 });
  const spinner = new THREE.Group();
  if (hemisphere) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 48, 0, TAU, Math.PI / 2, Math.PI / 2), rim);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r, 128).rotateX(-Math.PI / 2), face);
    cap.position.y = 0.001;
    spinner.add(dome, cap);
  } else {
    spinner.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.97, r * 0.09, 160, 1), [rim, face, face]));
  }
  node.pivot.add(spinner);
  // the disc keeps its face turned to the sun, a little from above, so its day side shows
  const spin = b.day_hours > 0 ? TAU / (b.day_hours / 24) : 0, up = new THREE.Vector3(0, 1, 0);
  node.update = ({ world, dtReal, view }) => {
    const toSun = (view.sunPos || V()).clone().sub(world).normalize().add(new THREE.Vector3(0, 0.45, 0)).normalize();
    node.pivot.quaternion.setFromUnitVectors(up, toSun);
    const st = view.app.state, rate = st.playing ? st.rate : 0, step = Math.max(-0.15, Math.min(0.15, rate * spin)) * dtReal;
    if (look.flip) spinner.rotation.x += step;   // it turns over and over, like a tossed coin
    else spinner.rotation.y += step;
  };
  node.noSpin = true;
}

// A cluster world: several rocks that travel together as one body.
function rockCluster(node, b, r, color) {
  const R = rng(hashStr(b.id + "cl")), n = Math.min(b.look?.pieces || 9, 80);
  const tint = color.clone().lerp(new THREE.Color("#ffffff"), 0.3);
  for (let i = 0; i < n; i++) {
    // the rocks fill a ball, the biggest near the middle; more pieces are smaller
    const u = R() * 2 - 1, a = R() * TAU, d = r * 0.85 * Math.cbrt(R()), s2 = Math.sqrt(1 - u * u);
    const k = r * (i === 0 ? 0.42 : (0.1 + 0.24 * R() * R()) * Math.min(1, 3 / Math.sqrt(n)));
    const h = u * d * 0.7;
    const rot = new THREE.Euler(R() * 6, R() * 6, R() * 6);
    const holder = new THREE.Group();
    holder.position.set(Math.cos(a) * d * s2, i === 0 ? 0 : h, Math.sin(a) * d * s2);
    if (i === 0) holder.position.set(0, 0, 0);
    const stand = new THREE.Mesh(new THREE.IcosahedronGeometry(k * 0.9, 1), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    holder.add(stand);
    node.pivot.add(holder);
    modelClone(ROCKS[i % 4]).then((m) => {
      if (!m) return;
      m.scale.setScalar(k);
      m.rotation.copy(rot);
      m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(tint); } });
      holder.remove(stand);
      stand.geometry.dispose();
      holder.add(m);
    });
  }
  node.tumble = 0.05;
}

// ---------- H'Catha: a flat disc of water with the Spindle at its center ----------
function discWorld(node, b, r) {
  // the sea seen from above: deep blue, lighter toward the rim, wave streaks in rings, and
  // six faint spokes from the Spindle to the edge ("like a giant wagon wheel", Realmspace p.47)
  const sea = canvasTex(1024, 1024, (g, w, h) => {
    const R = rng(hashStr(b.id + "sea")), cx = w / 2, cy = h / 2;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    gr.addColorStop(0, "#123f86"); gr.addColorStop(0.55, "#1d5fb3"); gr.addColorStop(0.92, "#3f8fd8"); gr.addColorStop(1, "#d8ecff");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const rr = Math.sqrt(R()) * w * 0.48, a = R() * TAU;
      g.strokeStyle = `rgba(${R() < 0.6 ? "190,225,255" : "8,30,80"},${0.05 + R() * 0.08})`;
      g.lineWidth = 1 + R() * 2;
      g.beginPath(); g.arc(cx, cy, rr, a, a + 0.04 + R() * 0.12); g.stroke();
    }
    g.strokeStyle = "rgba(200,232,255,.13)"; g.lineWidth = 10;
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * w * 0.08, cy + Math.sin(a) * w * 0.08); g.lineTo(cx + Math.cos(a) * w * 0.49, cy + Math.sin(a) * w * 0.49); g.stroke(); }
    g.strokeStyle = "rgba(200,232,255,.1)"; g.lineWidth = 7;
    for (const rr of [0.18, 0.33]) { g.beginPath(); g.arc(cx, cy, w * rr, 0, TAU); g.stroke(); }
  });
  const top = new THREE.MeshStandardMaterial({ map: sea, roughness: 0.2, metalness: 0.05 });
  const side = new THREE.MeshStandardMaterial({ color: 0x7fb7f0, roughness: 0.4, emissive: 0x102846, emissiveIntensity: 0.4 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.12, 128, 1), [side, top, top]);
  const foam = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.022, 8, 160), new THREE.MeshStandardMaterial({ color: 0xf2f7ff, roughness: 0.6, transparent: true, opacity: 0.8 }));
  foam.rotation.x = Math.PI / 2;
  foam.position.y = r * 0.06;
  const spinner = new THREE.Group();
  spinner.add(disc, foam);
  // the six beholder ports around the base of the Spindle
  const lights = [];
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; lights.push({ p: [Math.cos(a) * r * 0.2, r * 0.065, Math.sin(a) * r * 0.2], c: [1, 0.78, 0.45], s: 3.2 }); }
  spinner.add(points(lights));
  node.pivot.add(spinner);
  node.standin = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.8, 20), new THREE.MeshStandardMaterial({ color: 0x8a7a66, roughness: 1 }));
  node.standin.position.y = r * 0.46;
  node.pivot.add(node.standin);
  modelClone("assets/models/spindle.glb").then((m) => {
    if (!m) return;
    m.scale.setScalar(r * 0.95);
    m.position.y = r * 0.06 + r * 0.95 * 0.5 - r * 0.02;
    node.pivot.remove(node.standin);
    node.pivot.add(m);
  });
  // The Spindle always points at the Sun, so the disc faces it.
  node.update = ({ world }) => node.pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), world.clone().negate().normalize());
  node.noSpin = true;
}

// ---------- a comet: rock nucleus, coma, a straight ion tail and a curved dust tail ----------
function comet(node, b, r) {
  node.standin = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.8, 1), new THREE.MeshStandardMaterial({ color: 0xcfd8e6, roughness: 1, flatShading: true }));
  node.pivot.add(node.standin);
  attach(node, ROCKS[2], r * 0.9, { tint: new THREE.Color("#dfe8f6") });
  node.group.add(sprite(glow([[0, "rgba(235,245,255,.9)"], [0.22, "rgba(170,200,255,.28)"], [1, "rgba(0,0,0,0)"]]), r * 10));
  const tailTex = (inner, outer, curve) => canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(0, h / 2 - 3);
    g.quadraticCurveTo(w * 0.5, h / 2 - 8 - curve * 0.3, w, h * 0.08 - curve);
    g.lineTo(w, h * 0.92 - curve * 0.2);
    g.quadraticCurveTo(w * 0.5, h / 2 + 10 - curve * 0.2, 0, h / 2 + 3);
    g.fill();
  });
  const mk = (tex, width) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, width), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    m.geometry.translate(0.5, 0, 0);
    node.group.add(m);
    return m;
  };
  const ion = mk(tailTex("rgba(190,215,255,.95)", "rgba(80,140,255,0)", 0), 0.12);
  const dust = mk(tailTex("rgba(255,244,225,.85)", "rgba(255,220,180,0)", 26), 0.34);
  let prev = null;
  const basis = (dir, cam, pos, m) => {
    const x = dir.clone().normalize();
    const toCam = cam.clone().sub(pos);
    const z = toCam.sub(x.clone().multiplyScalar(toCam.dot(x))).normalize();
    const y = z.clone().cross(x);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  node.update = ({ world, camera }) => {
    const away = world.clone().normalize();
    const d = world.length();
    const len = Math.max(0.5, 6 / Math.max(d, 1.1));
    const vel = prev ? world.clone().sub(prev) : V();
    prev = world.clone();
    ion.scale.set(len * 1.1, len * 1.1, 1);
    dust.scale.set(len * 0.85, len * 0.85, 1);
    basis(away, camera.position, world, ion);
    const lag = vel.lengthSq() > 1e-12 ? away.clone().addScaledVector(vel.normalize(), -0.35).normalize() : away;
    basis(lag, camera.position, world, dust);
  };
  node.noSpin = true;
  node.tumble = 0.2;
  return node;
}

// ---------- decorations ----------
// Coliar's floating islands of earth and water, close around the core.
function floatingIslands(node, b, r) {
  const n = b.look.islands.count || 40;
  const ring = new THREE.Group();
  ring.rotation.set(0.35, 0, 0.18);
  node.group.add(ring);
  meshParts(ROCKS_LO[1]).then((parts) => {
    if (!parts) return;
    const mat = parts.material.clone();
    mat.color = new THREE.Color(b.look.islands.color || "#8fa37a");
    const im = new THREE.InstancedMesh(parts.geometry, mat, n);
    const R = rng(hashStr(b.id + "isl")), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, rad = r * (1.08 + R() * 0.55), h = gauss(R) * r * 0.12;
      q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3));
      const k = r * (0.025 + 0.05 * R() * R());
      m.compose(new THREE.Vector3(Math.cos(a) * rad, h, Math.sin(a) * rad), q, s.set(k, k * 0.6, k));
      im.setMatrixAt(i, m);
    }
    ring.add(im);
  });
  const old = node.update;
  node.update = (ctx) => { old?.(ctx); ring.rotation.y += 0.02 * ctx.dtReal; };
}

// Small moons that circle a body (Garden's twelve).
function moonlets(node, b, r) {
  const n = b.look.moonlets || 12;
  const holder = new THREE.Group();
  node.group.add(holder);
  meshParts(ROCKS_LO[3]).then((parts) => {
    if (!parts) return;
    const R = rng(hashStr(b.id + "ml"));
    for (let i = 0; i < n; i++) {
      const orbit = new THREE.Group();
      orbit.rotation.set(gauss(R) * 0.5, R() * TAU, gauss(R) * 0.4);
      const mesh = new THREE.Mesh(parts.geometry, parts.material);
      const k = r * (0.05 + 0.06 * R());
      mesh.scale.setScalar(k);
      mesh.position.set(r * (1.7 + R() * 1.2), 0, 0);
      orbit.add(mesh);
      orbit.userData.w = (0.04 + R() * 0.1) * (R() < 0.5 ? 1 : -1);
      holder.add(orbit);
    }
  });
  const old = node.update;
  node.update = (ctx) => { old?.(ctx); for (const o of holder.children) o.rotation.y += o.userData.w * ctx.dtReal; };
}

// ---------- materials and textures ----------
// Fresnel rim for an atmosphere, brighter on the day side.
export function rimMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { c: { value: color } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vP;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        vW = normalize((modelMatrix * vec4(normal, 0.0)).xyz); vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 c; varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec3 vP;
      void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.4); vec3 sun = normalize(-vP); float day = smoothstep(-0.35, 0.5, dot(vW, sun));
        gl_FragColor = vec4(c * f * (0.2 + 0.75 * day), 1.0); }`,
  });
}

// A dead-magic zone: a dark globe whose violet rim crawls with static.
function deadMagicMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { t: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vO = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        float ndv = clamp(dot(vN, vV), 0.0, 1.0), rim = pow(1.0 - ndv, 2.2);
        vec3 p = normalize(vO) * 4.0;
        float n = n3(p + vec3(t * 0.15, 0.0, t * 0.1)) * 0.6 + n3(p * 2.3 - vec3(0.0, t * 0.22, 0.0)) * 0.4;
        vec3 col = mix(vec3(0.015, 0.0, 0.03), vec3(0.42, 0.22, 0.72), rim) + vec3(0.32, 0.14, 0.55) * smoothstep(0.55, 0.9, n) * (0.25 + rim);
        gl_FragColor = vec4(col, 0.6 + 0.35 * rim);
      }`,
  });
}

// Nebula textures: a galleon under sail (the shape is the galleon icon by Lorc, game-icons.net,
// CC BY 3.0), a fan like a color spray spell, or a plain cloud. Colors come from cloud.colors.
const nebulaCache = new Map();
async function nebulaTexture(b) {
  const cl = b.cloud || {};
  const key = `${cl.shape}|${(cl.colors || []).join(",")}|${b.id}`;
  if (nebulaCache.has(key)) return nebulaCache.get(key);
  const S = 512, cols = (cl.colors?.length ? cl.colors : [b.look?.color || "#9db4ff"]).map((c) => new THREE.Color(c));
  // mask: where the cloud is
  const mask = document.createElement("canvas");
  mask.width = mask.height = S;
  const mg = mask.getContext("2d");
  mg.fillStyle = "#000"; mg.fillRect(0, 0, S, S);
  if (cl.shape === "galleon") {
    const im = await loadImage("assets/shapes/galleon.svg");
    if (im) { mg.filter = "blur(10px)"; mg.drawImage(im, S * 0.08, S * 0.08, S * 0.84, S * 0.84); mg.filter = "blur(3px)"; mg.globalCompositeOperation = "lighter"; mg.globalAlpha = 0.55; mg.drawImage(im, S * 0.08, S * 0.08, S * 0.84, S * 0.84); mg.globalAlpha = 1; mg.globalCompositeOperation = "source-over"; mg.filter = "none"; }
  } else if (cl.shape === "fan") {
    const gr = mg.createLinearGradient(0, 0, S, 0);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.75, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    mg.filter = "blur(10px)";
    mg.fillStyle = gr;
    mg.beginPath(); mg.moveTo(S * 0.03, S * 0.5); mg.lineTo(S * 0.97, S * 0.08); mg.lineTo(S * 0.97, S * 0.92); mg.closePath(); mg.fill();
    mg.filter = "none";
  } else {
    const gr = mg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    mg.fillStyle = gr; mg.fillRect(0, 0, S, S);
  }
  // a second, much wider blur gives the faint outer veil around the shape
  const veil = document.createElement("canvas");
  veil.width = veil.height = S;
  const vg = veil.getContext("2d");
  vg.filter = "blur(26px)";
  vg.drawImage(mask, 0, 0);
  const md = mg.getImageData(0, 0, S, S).data, vd = vg.getImageData(0, 0, S, S).data;
  // smooth value noise; fbm of five octaves for the gas, and a ridged one for dark dust lanes
  const R = rng(hashStr(b.id + "neb")), G = 256, grid = Float32Array.from({ length: G * G }, () => R());
  const noise = (x, y) => {
    x = ((x % G) + G) % G; y = ((y % G) + G) % G;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, jx = (ix + 1) % G, jy = (iy + 1) % G;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = grid[iy * G + ix], b2 = grid[iy * G + jx], c = grid[jy * G + ix], d2 = grid[jy * G + jx];
    return (a * (1 - sx) + b2 * sx) * (1 - sy) + (c * (1 - sx) + d2 * sx) * sy;
  };
  const fbm = (x, y, o = 5) => { let v = 0, amp = 0.5, f = 1, n = 0; for (let k = 0; k < o; k++) { v += amp * noise(x * f, y * f); n += amp; amp *= 0.5; f *= 2.03; } return v / n; };
  const tex = canvasTex(S, S, (g) => {
    const out = g.createImageData(S, S), o = out.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, u = x / S, v = y / S;
      const m = Math.max(md[i] / 255, (vd[i] / 255) * 0.45);
      if (m < 0.004) continue;
      // domain warp so the gas swirls instead of sitting in a grid
      const wx = fbm(u * 6 + 3.1, v * 6 + 1.7, 3), wy = fbm(u * 6 + 8.3, v * 6 + 2.9, 3);
      const n = fbm(u * 9 + wx * 2.2, v * 9 + wy * 2.2);
      const lanes = 1 - Math.pow(Math.abs(fbm(u * 5 + wy, v * 5 + wx, 4) - 0.5) * 2, 0.6);
      const pick = cl.shape === "fan" ? Math.max(0, Math.min(1, (Math.atan2(v - 0.5, u + 0.02) / 0.9 + 0.5))) * (cols.length - 1)
        : cl.shape === "galleon" ? Math.max(0, Math.min(1, v * 1.05 + (n - 0.5) * 0.7)) * (cols.length - 1)  // sails at the top, hull at the bottom
        : (n * 1.25 + wx * 0.35) * (cols.length - 1);
      const k = Math.max(0, Math.min(cols.length - 1, pick)), i0 = Math.floor(k), i1 = Math.min(cols.length - 1, i0 + 1), f = k - i0;
      const c = cols[i0].clone().lerp(cols[i1], f);
      let a = m * Math.pow(n, 1.6) * 1.9 * (0.55 + 0.45 * (1 - lanes * 0.8));
      if (R() < 0.0009 * m) a += 1.5;  // a few stars caught in the gas
      o[i] = Math.min(255, c.r * 255 * a); o[i + 1] = Math.min(255, c.g * 255 * a); o[i + 2] = Math.min(255, c.b * 255 * a); o[i + 3] = 255;
    }
    g.putImageData(out, 0, 0);
  });
  nebulaCache.set(key, tex);
  return tex;
}

// A planetary ring around a parent of drawn radius pr.
export async function ringMesh(b, pr, renderer) {
  const ring = b.ring || {};
  const inner = pr * (ring.inner || 1.45), outer = pr * (ring.outer || 2.45);
  const g = new THREE.RingGeometry(inner, outer, 160, 1);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - inner) / (outer - inner), 0.5);
  let map = null;
  const t = b.look?.texture;
  if (typeof t === "string" && !t.startsWith("proc:")) {
    if (!ringTexCache.has(t)) ringTexCache.set(t, bodyTexture({ texture: t }, renderer));
    map = await ringTexCache.get(t);
  }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, color: new THREE.Color(b.look?.color || "#dfe5f0"), transparent: true, opacity: map ? 1 : 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
  m.rotation.x = -Math.PI / 2 + ((ring.tilt_deg ?? 24) * Math.PI / 180);
  return m;
}

// Particles for an asteroid field. "follows": a trail behind another body on its orbit.
// Otherwise a ring of rocks at the field's own orbit radius around the parent.
export function fieldPoints(b, pathPoints, seed, countScale = 1) {
  const f = b.field || {};
  const R = rng(seed), list = [];
  const n = Math.min(Math.round((f.count || 600) * countScale), 4000), spread = f.spread ?? 0.05;
  const c = new THREE.Color(b.look?.color || "#e9eefc");
  for (let i = 0; i < n; i++) {
    const d = Math.pow(R(), 1.6);
    const base = pathPoints(d);
    const radial = base.clone().normalize().multiplyScalar(gauss(R) * spread * base.length());
    const q = base.add(radial).add(new THREE.Vector3(0, gauss(R) * spread * 0.5 * base.length(), 0));
    const k = f.follows ? Math.pow(1 - d * 0.92, 1.2) : 0.5 + 0.5 * R();
    list.push({ p: q.toArray(), c: [c.r * k, c.g * k, c.b * k], s: 0.9 + 2.2 * R() * (0.35 + 0.65 * k) });
  }
  return points(list);
}

// Real rocks for an asteroid field: instanced photoscanned moon rocks along the same path as the
// dust, bigger near the head of the trail, with a few warm lights where people live.
export function fieldRocks(b, pathPoints, seed, unit) {
  const f = b.field || {};
  const group = new THREE.Group();
  const n = Math.min(f.rocks ?? 420, 1500), spread = f.spread ?? 0.05;
  Promise.all(ROCKS_LO.map(meshParts)).then((parts) => {
    const R = rng(seed + 17), per = parts.map(() => []);
    for (let i = 0; i < n; i++) {
      const d = Math.pow(R(), 1.5), base = pathPoints(d);
      const L = base.length();
      const pos = base.add(base.clone().normalize().multiplyScalar(gauss(R) * spread * L)).add(new THREE.Vector3(0, gauss(R) * spread * 0.5 * L, 0));
      const k = unit * (0.25 + 1.6 * Math.pow(R(), 4)) * (1.15 - d * 0.6);
      per[Math.floor(R() * parts.length)].push({ pos, k, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)) });
    }
    const m = new THREE.Matrix4(), s = new THREE.Vector3();
    parts.forEach((p, j) => {
      if (!p || !per[j].length) return;
      const mat = p.material.clone();
      mat.color = new THREE.Color(b.look?.rock_color || "#d8d4cc");
      const im = new THREE.InstancedMesh(p.geometry, mat, per[j].length);
      per[j].forEach((x, i) => { m.compose(x.pos, x.q, s.set(x.k, x.k, x.k)); im.setMatrixAt(i, m); });
      group.add(im);
    });
    // settlements: small warm lights on a few rocks
    const R2 = rng(seed + 29), lights = [];
    for (let i = 0; i < (f.lights ?? 26); i++) {
      const d = Math.pow(R2(), 1.3), base = pathPoints(d);
      lights.push({ p: base.toArray(), c: [1, 0.78, 0.48].map((x) => x * 0.9), s: 2.2 + R2() * 1.6 });
    }
    group.add(points(lights));
  });
  return group;
}
