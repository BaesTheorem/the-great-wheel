// A tree that fills a sphere (Faeriespace's Great Tree). The books give no shape, so the tree follows
// the bodies on it: a trunk on the axis with roots below, three leaders where the trunk splits (at
// the city of Armon), and one branch to each body that rests on it or hangs from it. Planets sit on
// the end of their branch; suns hang from theirs on a stem, like fruit. Bark and leaves are photo
// textures from Poly Haven (CC0): bark_brown_02 and the leaves of island_tree_02.
import * as THREE from "three";
import { rng, hashStr, loadImage, srgb } from "./gfx.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

let barkTex = null, leafTex = null;
function textures() {
  if (!barkTex) {
    const load = (url, color) => {
      const t = new THREE.Texture();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      loadImage(url).then((im) => { if (im) { t.image = im; if (color) srgb(t); t.needsUpdate = true; } });
      return t;
    };
    barkTex = { map: load("assets/textures/bark_diff.jpg", true), normal: load("assets/textures/bark_nor.jpg", false) };
    leafTex = load("assets/textures/leaves_atlas.png", true);
  }
  return { bark: barkTex, leaf: leafTex };
}

// A tapered tube along a curve, with bark that tiles along its length.
function limb(curve, r0, r1, mat, segs = 48) {
  const g = new THREE.TubeGeometry(curve, segs, 1, 12, false);
  const pos = g.attributes.position, uv = g.attributes.uv, v = V();
  const len = curve.getLength(), around = Math.max(1, Math.round(Math.PI * (r0 + r1) / Math.max(len, 1e-6) * 6));
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs), t = i / segs, rad = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= 12; j++) {
      const k = i * 13 + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(rad).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
      uv.setXY(k, t * len / Math.max((r0 + r1) * 1.6, 1e-6) / around, uv.getY(k) * 2);
    }
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// A bending curve from a to b that rises a little in the middle, as a branch does.
function bough(a, b, lift = 0.12, sway = 0.1, R = Math.random) {
  const d = a.distanceTo(b), m1 = a.clone().lerp(b, 0.35), m2 = a.clone().lerp(b, 0.7);
  m1.y += d * lift; m2.y += d * lift * 0.6;
  m1.x += (R() - 0.5) * d * sway; m1.z += (R() - 0.5) * d * sway;
  return new THREE.CatmullRomCurve3([a.clone(), m1, m2, b.clone()]);
}

export function growTree(view, n) {
  const kids = view.order.filter((c) => c.parent === n && c.b.fixed);
  const ends = kids.map((c) => ({ c, p: view.mapRel(new THREE.Vector3().copy(fixedPos(c.b.fixed)), n, c.sat) }));
  const top = Math.max(4, ...ends.map((e) => Math.abs(e.p.y))) * 1.25;
  const R = rng(hashStr(n.b.id + "tree"));
  const tx = textures();
  const bark = new THREE.MeshStandardMaterial({ map: tx.bark.map, normalMap: tx.bark.normal, normalScale: new THREE.Vector2(1.4, 1.4), color: new THREE.Color(n.b.look?.bark || "#b89a7a"), roughness: 1 });
  const trunkR = top * 0.045;
  const group = new THREE.Group();

  // the city (Armon) where the trunk splits in three, if a body sits on the axis above the center
  const crown = ends.find((e) => e.c.b.kind === "structure" && Math.abs(e.p.x) + Math.abs(e.p.z) < top * 0.05);
  const splitY = crown ? crown.p.y : top * 0.25;

  // the trunk, with a flare at the roots, up to the split
  group.add(limb(new THREE.CatmullRomCurve3([V(0, -top, 0), V(0, -top * 0.4, 0), V(0, splitY, 0)]), trunkR * 1.6, trunkR, bark, 32));
  // roots: thick and twisting below the trunk
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R() * 0.4, out = top * (0.25 + 0.2 * R());
    const start = V(0, -top * (0.82 + 0.1 * R()), 0);
    const end = V(Math.cos(a) * out, -top * (1.05 + 0.25 * R()), Math.sin(a) * out);
    group.add(limb(bough(start, end, -0.15, 0.25, R), trunkR * 0.7, trunkR * 0.08, bark, 24));
  }
  // three leaders above the split
  const leaders = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4, spread = top * 0.18;
    const end = V(Math.cos(a) * spread, top, Math.sin(a) * spread);
    const curve = bough(V(0, splitY, 0), end, 0.05, 0.15, R);
    leaders.push(curve);
    group.add(limb(curve, trunkR * 0.75, trunkR * 0.25, bark, 32));
  }

  const leaves = [];   // clump centers and sizes
  for (const { c, p } of ends) {
    if (c === crown?.c) continue;
    const isSun = c.b.kind === "star";
    // start on the trunk (or a leader, above the split) at about the body's height
    const y0 = Math.max(-top * 0.8, Math.min(top * 0.92, p.y * 0.55));
    let start = V(0, y0, 0);
    if (y0 > splitY) {
      const best = leaders.map((L) => L.getPointAt(Math.min(1, (y0 - splitY) / (top - splitY)))).sort((a, b) => a.distanceTo(p) - b.distanceTo(p))[0];
      start = best;
    }
    // a planet sits on the end of its branch; a sun hangs below the end of its branch on a stem
    const end = isSun ? p.clone().add(V(0, c.r * 3.2, 0)) : p.clone().add(V(0, -c.r * 1.05, 0));
    const main = bough(start, end, 0.1, 0.12, R);
    const heavy = isSun ? 0.55 : 0.8;
    group.add(limb(main, trunkR * 0.5 * heavy, trunkR * 0.08 * heavy, bark));
    if (isSun) group.add(limb(new THREE.LineCurve3(end, p.clone().add(V(0, c.r * 0.9, 0))), trunkR * 0.05, trunkR * 0.03, bark, 4));
    else {
      // a cradle of twigs under the planet
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + R();
        const tip = p.clone().add(V(Math.cos(a) * c.r * 0.9, -c.r * 0.4, Math.sin(a) * c.r * 0.9));
        group.add(limb(new THREE.QuadraticBezierCurve3(end, end.clone().lerp(tip, 0.5).add(V(0, -c.r * 0.2, 0)), tip), trunkR * 0.06, trunkR * 0.02, bark, 8));
      }
    }
    // side shoots, each ending in leaves
    const len = start.distanceTo(end);
    for (let k = 0; k < 4; k++) {
      const t = 0.3 + 0.6 * R(), a = main.getPointAt(t);
      const dir = V(R() - 0.5, R() * 0.7 - 0.1, R() - 0.5).normalize();
      const b2 = a.clone().add(dir.multiplyScalar(len * (0.1 + 0.12 * R())));
      group.add(limb(bough(a, b2, 0.15, 0.2, R), trunkR * 0.16 * heavy, trunkR * 0.03, bark, 16));
      leaves.push({ at: b2, size: len * (0.06 + 0.04 * R()) });
    }
    for (let k = 0; k < 3; k++) leaves.push({ at: main.getPointAt(0.55 + 0.3 * R()), size: len * (0.05 + 0.04 * R()) });
  }
  for (const L of leaders) leaves.push({ at: L.getPointAt(0.97), size: top * 0.12 }, { at: L.getPointAt(0.7), size: top * 0.09 });

  // leaf cards: each card shows the whole atlas of leaves, so a few dozen cards make a full clump
  const perClump = innerWidth < 760 ? 18 : 34;
  const card = new THREE.PlaneGeometry(1, 1);
  const leafMat = new THREE.MeshStandardMaterial({ map: tx.leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  const im = new THREE.InstancedMesh(card, leafMat, leaves.length * perClump);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), e = new THREE.Euler(), col = new THREE.Color();
  let i = 0;
  for (const L of leaves) {
    for (let k = 0; k < perClump; k++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, rr = L.size * Math.cbrt(R()), s2 = Math.sqrt(1 - u * u);
      const pos = L.at.clone().add(V(Math.cos(a) * s2 * rr, u * rr * 0.75, Math.sin(a) * s2 * rr));
      e.set(R() * Math.PI, R() * Math.PI, R() * Math.PI);
      q.setFromEuler(e);
      const k2 = L.size * (0.5 + 0.5 * R());
      m.compose(pos, q, s.set(k2, k2, k2));
      im.setMatrixAt(i, m);
      im.setColorAt(i, col.setHSL(0.2 + 0.08 * R(), 0.45 + 0.2 * R(), 0.42 + 0.18 * R()));
      i++;
    }
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  group.add(im);
  n.group.add(group);
  n.extent = top;
  n.labelR = trunkR * 2;
}

function fixedPos(f) {
  const r = f.r_mi || 0, lon = (f.lon_deg || 0) * Math.PI / 180, lat = (f.lat_deg || 0) * Math.PI / 180;
  return V(r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon));
}
