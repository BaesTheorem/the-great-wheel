// Built structures: the bases, towers, towns and citadels that the books describe, made from
// simple solids so that each one keeps the shape its book gives it. look.build names the builder
// (see BUILDERS at the end); look.color and look.flame tune it. Each builder adds its parts under
// the node's pivot and can set node.update for parts that move or face the sun.
import * as THREE from "three";
import { meshParts, ROCKS, studioEnv } from "./models.js";
import { rng, hashStr, TAU, radialTex, canvasTex, sprite, fatLine } from "./gfx.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const texCache = new Map();

// ---------- materials ----------
// Hewn stone: light and dark grain with faint courses of blocks.
function stoneMap(base) {
  const key = `stone|${base}`;
  if (!texCache.has(key)) {
    const t = canvasTex(256, 256, (g, w, h) => {
      const R = rng(hashStr(key));
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${R() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + R() * 0.06})`;
        g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3);
      }
      g.strokeStyle = "rgba(0,0,0,.2)";
      for (let y = 0; y < h; y += 32) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        for (let x = (y / 32) % 2 ? 0 : 24; x < w; x += 48) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
const stone = (base, rough = 0.92) => new THREE.MeshStandardMaterial({ map: stoneMap("#a8a8a8"), color: new THREE.Color(base).multiplyScalar(1.45), roughness: rough });
const dot = () => {
  if (!texCache.has("dot")) texCache.set("dot", radialTex([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.5)"], [1, "rgba(0,0,0,0)"]], 64));
  return texCache.get("dot");
};
// Lit windows, lamps and beacons: soft points that grow with the structure when near.
function lights(list, color, size) {
  if (!list.length) return new THREE.Group();
  return new THREE.Points(new THREE.BufferGeometry().setFromPoints(list), new THREE.PointsMaterial({
    color, size, map: dot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
}
function crystalMat(color) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.9, flatShading: true });
}
function glassMat(renderer, tint = "#bfe6ff") {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, envMap: studioEnv(renderer), envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide });
}

// A magical flame: a tapering column of moving light (additive), for towers and braziers.
function flame(color, h, w) {
  const geo = new THREE.CylinderGeometry(w * 0.12, w, h, 18, 10, true).translate(0, h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float y = vUv.y, k = n(vec2(vUv.x * 9.0, y * 4.0 - time * 3.0)) * 0.6 + n(vec2(vUv.x * 19.0, y * 9.0 - time * 5.0)) * 0.4;
        float a = smoothstep(0.0, 0.08, y) * pow(1.0 - y, 1.4) * (0.35 + k);
        vec3 c = mix(color, vec3(1.0, 0.97, 0.9), pow(1.0 - y, 4.0) * 0.8);
        gl_FragColor = vec4(c * a * 1.6, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// Buildings: boxes with roofs, as two instanced meshes. spots: [{ p, s, h, a }] (place, width, height, turn).
function buildings(spots, wall, roof, roofKind = "pitched") {
  const g = new THREE.Group();
  if (!spots.length) return g;
  const box = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), wall, spots.length);
  const cap = roofKind === "dome" ? new THREE.SphereGeometry(0.62, 12, 6, 0, TAU, 0, Math.PI / 2) : new THREE.ConeGeometry(0.78, 0.6, 4).rotateY(Math.PI / 4).translate(0, 0.3, 0);
  const top = new THREE.InstancedMesh(cap, roof, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  spots.forEach((o, i) => {
    q.setFromAxisAngle(V(0, 1, 0), o.a || 0);
    m.compose(o.p, q, V(o.s, o.h, o.s));
    box.setMatrixAt(i, m);
    m.compose(o.p.clone().add(V(0, o.h, 0)), q, V(o.s, o.s, o.s));
    top.setMatrixAt(i, m);
  });
  g.add(box, top);
  return g;
}

// A round tower with a cone roof (or a flat top with merlons).
function tower(mat, roofMat, rad, h, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rad * (opts.taper ?? 0.9), rad, h, 16), mat);
  body.position.y = h / 2;
  g.add(body);
  if (opts.flat) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, mer = new THREE.Mesh(new THREE.BoxGeometry(rad * 0.3, rad * 0.35, rad * 0.3), mat);
      mer.position.set(Math.cos(a) * rad * 0.82, h + rad * 0.17, Math.sin(a) * rad * 0.82);
      g.add(mer);
    }
  } else {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad * 1.25, rad * (opts.spire ? 4 : 1.6), 16), roofMat);
    cone.position.y = h + rad * (opts.spire ? 2 : 0.8);
    g.add(cone);
  }
  return g;
}

// A rock to build on: one of the rock models, scaled to the radius, with its top cut level.
async function rockBase(r, seed, tint = "#8f8a84", topAt = 0.32) {
  const parts = await meshParts(ROCKS[seed % ROCKS.length]);
  if (!parts) return { mesh: new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.8, 2), stone("#6f6a64")), top: r * topAt };
  const g = parts.geometry.clone();
  g.computeBoundingBox();
  const size = g.boundingBox.getSize(V()), c = g.boundingBox.getCenter(V());
  const k = (2 * r) / Math.max(size.x, size.y, size.z);
  g.translate(-c.x, -c.y, -c.z).scale(k, k * 0.75, k);
  const top = r * topAt, pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top) pos.setY(i, top + (pos.getY(i) - top) * 0.04);
  g.computeVertexNormals();
  const mat = parts.material.clone();
  mat.color = new THREE.Color(tint);
  return { mesh: new THREE.Mesh(g, mat), top };
}

// Places on a level ground of radius rad, at height y: n spots for buildings, none at the center.
function scatter(R, n, rad, y, minR = 0, size = [0.06, 0.12], height = [0.6, 1.6]) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = minR + (rad - minR) * Math.sqrt(R()), s = size[0] + (size[1] - size[0]) * R();
    out.push({ p: V(Math.cos(a) * d, y, Math.sin(a) * d), s, h: s * (height[0] + (height[1] - height[0]) * R()), a: R() * TAU });
  }
  return out;
}
const windowsOf = (spots, R, per = 2) => spots.flatMap((o) => Array.from({ length: per }, () => o.p.clone().add(V((R() - 0.5) * o.s * 1.1, o.h * (0.3 + 0.5 * R()), (R() - 0.5) * o.s * 1.1))));
const addFlames = (node, list) => {
  const mats = list.map((f) => f.material);
  const old = node.update;
  node.update = (ctx) => { old?.(ctx); for (const m of mats) m.uniforms.time.value = ctx.t; };
};

// ---------- the builders ----------
// The Habitat (Greyspace): a dark blue-grey ellipsoid covered in cones, with yellow light from round windows.
function habitat(node, b, r, renderer) {
  const [sx, sy, sz] = b.look?.stretch || [1.4, 0.7, 0.7];
  const hull = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 64).scale(sx, sy, sz), new THREE.MeshStandardMaterial({ color: 0x3c4a60, roughness: 0.5, metalness: 0.55, envMap: studioEnv(renderer), envMapIntensity: 0.35 }));
  node.pivot.add(hull);
  const n = innerWidth < 760 ? 700 : 1500, cones = new THREE.InstancedMesh(new THREE.ConeGeometry(r * 0.035, r * 0.07, 8).translate(0, r * 0.035, 0), new THREE.MeshStandardMaterial({ color: 0x4d5d78, roughness: 0.55, metalness: 0.5 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), wins = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), a = i * golden;
    const unit = V(Math.cos(a) * rad, y, Math.sin(a) * rad), p = V(unit.x * sx, unit.y * sy, unit.z * sz).multiplyScalar(r);
    const normal = V(unit.x / sx, unit.y / sy, unit.z / sz).normalize();
    q.setFromUnitVectors(V(0, 1, 0), normal);
    m.compose(p, q, V(1, 1, 1));
    cones.setMatrixAt(i, m);
    if (i % 2) wins.push(p.clone().addScaledVector(normal, r * 0.03).add(V(Math.cos(a + 1.3) * r * 0.03, 0, Math.sin(a + 1.3) * r * 0.03)));
  }
  const winGeo = new THREE.CircleGeometry(r * 0.022, 12), winMesh = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false }), wins.length);
  wins.forEach((w, i) => {
    const unit = V(w.x / sx, w.y / sy, w.z / sz).normalize(), nrm = V(unit.x / sx, unit.y / sy, unit.z / sz).normalize();
    q.setFromUnitVectors(V(0, 0, 1), nrm);
    m.compose(V(unit.x * sx, unit.y * sy, unit.z * sz).multiplyScalar(r * 1.004), q, V(1, 1, 1));
    winMesh.setMatrixAt(i, m);
  });
  node.pivot.add(cones, winMesh, lights(wins, 0xffb63a, r * 0.06));
  // the barrier that pushes ships away: a faint shell of light
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r * 1.18, 48, 32).scale(sx, sy, sz), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(0.55, 0.7, 1.0) * f * 0.35, 1.0); }`,
  }));
  node.group.add(shell);
  node.slowTurn = 0.05;
}

// Armon (Faeriespace): a city of giant mushrooms in the fork of the Great Tree, with the palace of
// Aelivere, the tallest, at its heart.
function mushroomCity(node, b, r) {
  const R = rng(hashStr(b.id)), caps = ["#c8553d", "#8a5cc0", "#3aa0a0", "#d8a83a", "#b0477a", "#6fae4a"];
  const stem = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.85 });
  const spots = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const Q = rng(7);
    for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(255,248,230,.95)"; g.beginPath(); g.arc(Q() * w, Q() * h * 0.8, 3 + Q() * 7, 0, TAU); g.fill(); }
  });
  const wins = [];
  const shroom = (x, z, h, cr, col) => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(cr * 0.18, cr * 0.26, h, 14), stem);
    s.position.set(x, h / 2, z);
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(col), map: spots, roughness: 0.6 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(cr, 28, 14, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1), capMat);
    cap.position.set(x, h, z);
    const gill = new THREE.Mesh(new THREE.CircleGeometry(cr * 0.98, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 1 }));
    gill.position.set(x, h + 0.001, z);
    for (let k = 0; k < 5; k++) wins.push(V(x + Math.cos(k * 1.3) * cr * 0.2, h * (0.25 + 0.14 * k), z + Math.sin(k * 1.3) * cr * 0.2));
    return [s, cap, gill];
  };
  const parts = [];
  parts.push(...shroom(0, 0, r * 1.0, r * 0.42, "#e05a8a"));   // the palace
  for (let i = 0; i < 13; i++) {
    const a = i / 13 * TAU + R() * 0.3, d = r * (0.45 + 0.4 * R()), h = r * (0.25 + 0.45 * R());
    parts.push(...shroom(Math.cos(a) * d, Math.sin(a) * d, h, r * (0.12 + 0.12 * R()), caps[i % caps.length]));
  }
  const city = new THREE.Group();
  city.add(...parts, lights(wins, 0xffcf8a, r * 0.07));
  city.position.y = -r * 0.25;
  node.pivot.add(city);
  node.noSpin = true;
}

// A constellation of Clusterspace: a stone tower 5,000 miles tall, topped by pillars of magical flame.
function flameTower(node, b, r) {
  const R = rng(hashStr(b.id)), col = b.look?.flame || new THREE.Color().setHSL((hashStr(b.id) % 360) / 360, 0.85, 0.6).getStyle();
  const mat = stone("#b9b0a2"), dark = stone("#6f675e");
  const g = new THREE.Group(), H = r * 2.4;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.3, H, 8, 1), mat);
  shaft.position.y = H / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.5, r * 0.22, 8), dark);
  foot.position.y = r * 0.11;
  g.add(shaft, foot);
  for (const f of [0.3, 0.58, 0.82]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * (0.29 - f * 0.12), r * 0.025, 8, 8), dark);
    band.rotation.x = Math.PI / 2;
    band.position.y = H * f;
    g.add(band);
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.17, r * 0.16, 8), dark);
  crown.position.y = H + r * 0.08;
  g.add(crown);
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU, fl = flame(col, r * (0.9 + 0.5 * R()), r * 0.09);
    fl.position.set(Math.cos(a) * r * 0.18, H + r * 0.16, Math.sin(a) * r * 0.18);
    flames.push(fl);
    g.add(fl);
  }
  const core = flame(col, r * 1.7, r * 0.13);
  core.position.y = H + r * 0.16;
  flames.push(core);
  g.add(core);
  const halo = sprite(radialTex([[0, "rgba(255,255,255,.9)"], [0.2, "rgba(255,255,255,.25)"], [1, "rgba(0,0,0,0)"]]), r * 2.2, 0.8, new THREE.Color(col));
  halo.position.y = H + r * 0.8;
  g.add(halo);
  const wins = [];
  for (let i = 0; i < 40; i++) { const y = H * (0.05 + 0.9 * R()), a = R() * TAU, rr = r * (0.3 - 0.14 * (y / H)); wins.push(V(Math.cos(a) * rr, y, Math.sin(a) * rr)); }
  g.add(lights(wins, 0xffd9a0, r * 0.05));
  g.position.y = -H * 0.45;
  node.pivot.add(g);
  node.noSpin = true;
  node.frameR = r * 1.7;
  node.frameLift = r * 0.95;
  addFlames(node, flames);
}

// Skyport (Pirtelspace): a stone disk 500 yards across with a walled town, a 300-foot tower at the
// hub and 17 stone wharves around the rim.
function discTown(node, b, r) {
  const R = rng(hashStr(b.id)), mat = stone("#9a9590"), wallMat = stone("#7d7872");
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, r * 0.12, 64), mat);
  disk.position.y = -r * 0.06;
  node.pivot.add(disk);
  const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 0.5, 48).rotateX(Math.PI), wallMat);
  under.position.y = -r * 0.37;
  node.pivot.add(under);
  for (let i = 0; i < 24; i++) {   // the town wall, with a tower at every third section
    const a = i / 24 * TAU, seg = new THREE.Mesh(new THREE.BoxGeometry(r * 0.2, r * 0.07, r * 0.03), wallMat);
    seg.position.set(Math.cos(a) * r * 0.62, r * 0.035, Math.sin(a) * r * 0.62);
    seg.rotation.y = -a + Math.PI / 2;
    node.pivot.add(seg);
    if (i % 3 === 0) { const t = tower(wallMat, wallMat, r * 0.035, r * 0.11, { flat: true }); t.position.set(Math.cos(a) * r * 0.62, 0, Math.sin(a) * r * 0.62); node.pivot.add(t); }
  }
  const spots = scatter(R, 70, r * 0.56, 0, r * 0.12, [r * 0.035, r * 0.065]);
  node.pivot.add(buildings(spots, stone("#c9b99a"), new THREE.MeshStandardMaterial({ color: 0x6d4a3a, roughness: 0.8 })));
  const keep = tower(stone("#a8a29a"), new THREE.MeshStandardMaterial({ color: 0x3f5770, roughness: 0.6 }), r * 0.07, r * 0.36, { spire: true });
  node.pivot.add(keep);
  for (let i = 0; i < 17; i++) {   // the wharves
    const a = i / 17 * TAU + 0.1, w = new THREE.Mesh(new THREE.BoxGeometry(r * 0.22, r * 0.025, r * 0.035), mat);
    w.position.set(Math.cos(a) * r * 1.08, -r * 0.01, Math.sin(a) * r * 1.08);
    w.rotation.y = -a;
    node.pivot.add(w);
  }
  const wins = windowsOf(spots, R, 1).concat([V(0, r * 0.3, 0), V(0, r * 0.2, r * 0.07)]);
  node.pivot.add(lights(wins, 0xffcc80, r * 0.04));
  node.slowTurn = 0.04;
}

// A castle on an asteroid (Oloth Kulggen, the drow "Shield of Darkness"): curtain wall, towers and a keep.
async function rockCastle(node, b, r) {
  const R = rng(hashStr(b.id)), dark = b.look?.stone || "#4d4858", glowCol = b.look?.light || 0xb48cff;
  const { mesh, top } = await rockBase(r, hashStr(b.id), "#7a7470");
  node.pivot.add(mesh);
  const mat = stone(dark), roof = new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.6, metalness: 0.2 });
  const g = new THREE.Group();
  g.position.y = top;
  const ring = r * 0.42, n = 6;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, b2 = (i + 1) / n * TAU, p = V(Math.cos(a) * ring, 0, Math.sin(a) * ring), q = V(Math.cos(b2) * ring, 0, Math.sin(b2) * ring);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(p.distanceTo(q), r * 0.14, r * 0.05), mat);
    wall.position.copy(p).lerp(q, 0.5).add(V(0, r * 0.07, 0));
    wall.rotation.y = -Math.atan2(q.z - p.z, q.x - p.x);
    const t = tower(mat, roof, r * 0.07, r * (0.24 + 0.08 * R()), { spire: true });
    t.position.copy(p);
    g.add(wall, t);
  }
  const keep = tower(mat, roof, r * 0.13, r * 0.42, { spire: true, taper: 0.8 });
  g.add(keep);
  const wins = [];
  for (let i = 0; i < 26; i++) { const a = R() * TAU, rr = R() < 0.4 ? r * 0.13 : ring; wins.push(V(Math.cos(a) * rr, r * (0.06 + 0.3 * R()), Math.sin(a) * rr)); }
  g.add(lights(wins, glowCol, r * 0.05));
  node.pivot.add(g);
  node.slowTurn = 0.03;
}

// A ruined outpost on a small asteroid (Darkwatch): a broken wall ring, pale elven towers broken off
// at different heights, the great spire fallen against the rock, and no lights.
async function rockRuin(node, b, r) {
  const R = rng(hashStr(b.id));
  const { mesh, top } = await rockBase(r, hashStr(b.id) + 1, "#77736e");
  node.pivot.add(mesh);
  const mat = stone(b.look?.stone || "#c4cad8"), g = new THREE.Group();
  g.position.y = top;
  const ring = r * 0.4;
  for (let i = 0; i < 14; i++) {   // the wall, with gaps where it fell
    if (R() < 0.3) continue;
    const a = i / 14 * TAU, h = r * (0.04 + 0.1 * R());
    const seg = new THREE.Mesh(new THREE.BoxGeometry(r * 0.17, h, r * 0.035), mat);
    seg.position.set(Math.cos(a) * ring, h / 2, Math.sin(a) * ring);
    seg.rotation.y = -a + Math.PI / 2;
    g.add(seg);
  }
  for (let i = 0; i < 5; i++) {   // towers broken off at different heights, with jagged tops
    const a = i / 5 * TAU + 0.3, h = r * (0.1 + 0.32 * R()), t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.055, r * 0.065, h, 10), mat);
    t.position.set(Math.cos(a) * ring, h / 2, Math.sin(a) * ring);
    t.rotation.set((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.12);
    g.add(t);
    const jag = new THREE.Mesh(new THREE.ConeGeometry(r * 0.05, r * 0.07, 5), mat);
    jag.position.set(Math.cos(a) * ring + r * 0.02, h + r * 0.02, Math.sin(a) * ring);
    jag.rotation.z = 0.6;
    g.add(jag);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(r * 0.07, r * 0.85, 10), mat);
  spire.position.set(r * 0.05, r * 0.16, 0);
  spire.rotation.z = 1.15;   // the great spire, fallen across the courtyard
  g.add(spire);
  node.pivot.add(g);
  node.slowTurn = 0.03;
}

// An outpost and spaceport on an asteroid (Port Kazdeyn): piers, sheds and a beacon tower.
async function rockPort(node, b, r) {
  const R = rng(hashStr(b.id));
  const { mesh, top } = await rockBase(r, hashStr(b.id) + 2, "#857d74");
  node.pivot.add(mesh);
  const g = new THREE.Group();
  g.position.y = top;
  const spots = scatter(R, 18, r * 0.45, 0, r * 0.08, [r * 0.06, r * 0.1], [0.5, 1.1]);
  g.add(buildings(spots, stone("#b8b2a6"), new THREE.MeshStandardMaterial({ color: 0x2f4f7a, roughness: 0.7 })));
  for (let i = 0; i < 5; i++) {   // piers, out from the edge of the level ground
    const a = i / 5 * TAU + 0.3, pier = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.025, r * 0.05), stone("#8e8478"));
    pier.position.set(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6);
    pier.rotation.y = -a;
    g.add(pier);
  }
  const beacon = tower(stone("#d8d2c6"), new THREE.MeshStandardMaterial({ color: 0x2f4f7a }), r * 0.05, r * 0.42, { flat: true });
  g.add(beacon);
  g.add(lights(windowsOf(spots, R, 1), 0xffd8a0, r * 0.045), lights([V(0, r * 0.5, 0)], 0x9fd0ff, r * 0.3));
  node.pivot.add(g);
  node.slowTurn = 0.03;
}

// A pirate hideout dug into an asteroid: a landing pit, a repair shop and a greenhouse dome for air.
async function rockHideout(node, b, r, renderer) {
  const R = rng(hashStr(b.id));
  const { mesh, top } = await rockBase(r, hashStr(b.id) + 3, "#6d655d");
  node.pivot.add(mesh);
  const g = new THREE.Group();
  g.position.y = top;
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.18, r * 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 1 }));
  pit.position.set(r * 0.15, r * 0.005, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.22, r * 0.012, 6, 48), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.6, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(pit.position);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 32, 16, 0, TAU, 0, Math.PI / 2), glassMat(renderer, "#cfe8d0"));
  dome.position.set(-r * 0.22, 0, -r * 0.08);
  const green = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 20, 10, 0, TAU, 0, Math.PI / 2).scale(1, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x3f8a3a, emissive: 0x1d4a1a, roughness: 1 }));
  green.position.copy(dome.position);
  const shed = buildings([{ p: V(-r * 0.05, 0, r * 0.25), s: r * 0.14, h: r * 0.09, a: 0.4 }], stone("#7d6f60"), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, metalness: 0.4 }));
  g.add(pit, ring, dome, green, shed, lights([pit.position.clone().add(V(r * 0.22, r * 0.02, 0)), pit.position.clone().add(V(-r * 0.22, r * 0.02, 0)), V(-r * 0.05, r * 0.12, r * 0.25)], 0xff5a3a, r * 0.06));
  node.pivot.add(g);
  node.slowTurn = 0.03;
}

// Gamaro Base (Moragspace): the shell and bones of a dead gamaroid, a giant turtle-like monster,
// made into a scro base and left in ruins.
function shellBase(node, b, r) {
  const R = rng(hashStr(b.id));
  const plates = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#4a4632"; g.fillRect(0, 0, w, h);
    const Q = rng(11);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 12; col++) {
      const cx = (col + (row % 2) * 0.5) * (w / 12), cy = row * (h / 6) + 18, rr = w / 26;
      g.beginPath();
      for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9); }
      g.fillStyle = `rgb(${70 + Q() * 30},${66 + Q() * 25},${44 + Q() * 18})`; g.fill();
      g.strokeStyle = "rgba(20,18,12,.8)"; g.lineWidth = 4; g.stroke();
    }
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 24, 0, TAU, 0, Math.PI * 0.42).scale(1.15, 0.55, 0.95), new THREE.MeshStandardMaterial({ map: plates, roughness: 0.85, side: THREE.DoubleSide }));
  node.pivot.add(shell);
  const bone = new THREE.MeshStandardMaterial({ color: 0xd9cfb4, roughness: 0.75 });
  for (let i = -3; i <= 3; i++) {   // ribs under the shell
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.03, 8, 32, Math.PI * 0.9), bone);
    rib.position.set(i * r * 0.2, -r * 0.05, 0);
    rib.rotation.set(Math.PI, Math.PI / 2, 0);
    node.pivot.add(rib);
  }
  const spine = [];
  for (let i = 0; i < 9; i++) spine.push(V(r * (1.05 + i * 0.13), -r * (0.02 + 0.015 * i * i), 0));   // the neck, sagging
  spine.forEach((p, i) => { const v = new THREE.Mesh(new THREE.SphereGeometry(r * (0.07 - i * 0.003), 12, 8), bone); v.position.copy(p); node.pivot.add(v); });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 20, 14).scale(1.5, 0.75, 1), bone);
  skull.position.copy(spine[spine.length - 1]).add(V(r * 0.2, -r * 0.02, 0));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0b0b0b }));
  eye.position.copy(skull.position).add(V(r * 0.08, r * 0.04, r * 0.12));
  node.pivot.add(skull, eye);
  // huts of the scro on the shell, and the pale glow of the fungus that ruined them
  const spots = scatter(R, 14, r * 0.55, 0, r * 0.05, [r * 0.06, r * 0.1], [0.5, 1]);
  for (const o of spots) o.p.y = r * 0.55 * Math.sqrt(Math.max(0, 1 - (o.p.x / (1.15 * r)) ** 2 - (o.p.z / (0.95 * r)) ** 2)) - r * 0.02;
  node.pivot.add(buildings(spots, new THREE.MeshStandardMaterial({ color: 0x5b5148, roughness: 0.7, metalness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0x3b332c, metalness: 0.5 })));
  const fungus = [];
  for (let i = 0; i < 60; i++) { const a = R() * TAU, d = r * Math.sqrt(R()) * 0.9; fungus.push(V(Math.cos(a) * d * 1.15, r * 0.55 * Math.sqrt(Math.max(0, 1 - (d / r) ** 2)) + r * 0.01, Math.sin(a) * d * 0.95)); }
  node.pivot.add(lights(fungus, 0x9cff7a, r * 0.07));
  node.slowTurn = 0.03;
}

// Vocath's base (Doomspace): a floating rock of gray and black stone with crystals under it, a
// gladiator arena, a crystal dome, docks and a private tower.
function floatingBase(node, b, r, renderer) {
  const R = rng(hashStr(b.id));
  const geo = new THREE.ConeGeometry(r, r * 1.3, 40, 8).rotateX(Math.PI);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {   // a rough underside; the top stays level
    const y = pos.getY(i);
    if (y > r * 0.64) continue;
    const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = 1 + 0.12 * Math.sin(a * 5 + y * 3) + 0.08 * Math.sin(a * 11 - y * 7);
    pos.setXYZ(i, pos.getX(i) * k, y, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, stone("#4c4a4e"));
  rock.position.y = -r * 0.65;
  node.pivot.add(rock);
  const cmat = crystalMat("#7fe3ff"), cmat2 = crystalMat("#c58bff");
  for (let i = 0; i < 18; i++) {   // crystal formations from the underside, standing out of the rock
    const a = R() * TAU, d = r * (0.12 + 0.72 * R()), len = r * (0.25 + 0.5 * R());
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(r * 0.06, len, r * 0.06), i % 3 ? cmat : cmat2);
    c.position.set(Math.cos(a) * d * 0.9, -1.3 * r * (1 - d / r) - len * 0.3, Math.sin(a) * d * 0.9);
    c.rotation.set((R() - 0.5) * 0.8, R() * TAU, (R() - 0.5) * 0.8);
    node.pivot.add(c);
  }
  const top = new THREE.Group();
  // the arena: a ring of arches around a sand floor
  const sand = new THREE.Mesh(new THREE.CircleGeometry(r * 0.24, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9a774, roughness: 1 }));
  sand.position.set(-r * 0.25, 0.002 * r, 0);
  const tiers = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.38, r * 0.1, 40, 1, true), stone("#5e5a5e"));
  tiers.position.set(-r * 0.25, r * 0.05, 0);
  const arches = [];
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; arches.push(V(-r * 0.25 + Math.cos(a) * r * 0.37, r * 0.07, Math.sin(a) * r * 0.37)); }
  top.add(sand, tiers, lights(arches, 0xffb070, r * 0.04));
  // the crystal dome and the private tower
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 32, 16, 0, TAU, 0, Math.PI / 2), glassMat(renderer, "#a8ecff"));
  dome.position.set(r * 0.32, 0, r * 0.12);
  const t = tower(stone("#3e3c40"), new THREE.MeshStandardMaterial({ color: 0x1d1b20, metalness: 0.4 }), r * 0.06, r * 0.5, { spire: true });
  t.position.set(r * 0.3, 0, -r * 0.3);
  top.add(dome, t);
  for (let i = 0; i < 4; i++) {   // the docks, out over the edge
    const a = -0.6 + i * 0.4, d = new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, r * 0.02, r * 0.05), stone("#5a575c"));
    d.position.set(Math.cos(a) * r * 1.0, 0, Math.sin(a) * r * 1.0);
    d.rotation.y = -a;
    top.add(d);
  }
  top.add(lights([V(r * 0.3, r * 0.45, -r * 0.3), V(r * 0.32, r * 0.1, r * 0.12)], 0x9fe8ff, r * 0.08));
  node.pivot.add(top);
  node.slowTurn = 0.025;
}

// The Imperial Citadel (Xaryxispace): a city of the astral elves on a platform of hewn stone shaped
// like a moth, a mile wide. A beam of light joins its temple crystal to the star.
function mothCitadel(node, b, r) {
  const R = rng(hashStr(b.id)), s = new THREE.Shape();
  // the outline, drawn for the right half and mirrored: head at +y, wings out to the sides
  const right = [[0, 1.05], [0.1, 0.92], [0.16, 0.62], [0.55, 0.88], [1.15, 0.86], [1.62, 0.6], [1.48, 0.22], [1.05, -0.02], [0.4, 0.05], [0.95, -0.22], [1.1, -0.62], [0.78, -0.9], [0.32, -0.62], [0.12, -0.75], [0.05, -1.15], [0, -1.2]];
  const pts = [...right.map(([x, y]) => new THREE.Vector2(x, y)), ...right.slice(1, -1).reverse().map(([x, y]) => new THREE.Vector2(-x, y))];
  s.setFromPoints(new THREE.SplineCurve([...pts, pts[0]]).getPoints(220));
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2).translate(0, -0.05, 0).scale(r * 0.62, r * 0.62, r * 0.62);
  const deck = new THREE.Mesh(geo, stone("#d9cfb6"));
  node.pivot.add(deck);
  const inside = (x, z) => {   // the deck's outline, for placing buildings on it
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = -pts[i].y, xj = pts[j].x, yj = -pts[j].y;
      if (((yi > z) !== (yj > z)) && x < ((xj - xi) * (z - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const spots = [];
  while (spots.length < 150) {
    const x = (R() * 2 - 1) * 1.6, z = (R() * 2 - 1) * 1.2;
    if (!inside(x * 1.08, z * 1.08)) continue;
    const near = Math.abs(x) < 0.25 ? 1 : 0.6, sz = r * (0.03 + 0.04 * R()) * near;
    spots.push({ p: V(x * r * 0.62, r * 0.042, z * r * 0.62), s: sz, h: sz * (1 + 2.5 * R() * near), a: R() * TAU });
  }
  node.pivot.add(buildings(spots, stone("#efe8d8"), new THREE.MeshStandardMaterial({ color: 0x8fb8d8, roughness: 0.35, metalness: 0.3 }), "dome"));
  for (let i = 0; i < 9; i++) {   // elven spires along the body
    const z = (-0.7 + i * 0.17) * r * 0.62, h = r * (0.25 + 0.25 * R());
    const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.025, h, 8), stone("#f4efe2"));
    sp.position.set((i % 2 ? 0.12 : -0.12) * r * 0.62, r * 0.04 + h / 2, z);
    node.pivot.add(sp);
  }
  // the temple crystal on the thorax, and its beam to the star
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(r * 0.09, r * 0.28, r * 0.09), crystalMat("#dff4ff"));
  crystal.position.set(0, r * 0.32, -r * 0.3 * 0.62);
  node.pivot.add(crystal, lights(windowsOf(spots, R, 1), 0xfff0c8, r * 0.035));
  const glowS = sprite(radialTex([[0, "rgba(255,255,255,.8)"], [0.15, "rgba(210,236,255,.25)"], [1, "rgba(0,0,0,0)"]]), r * 0.9, 0.7);
  glowS.position.copy(crystal.position);
  node.pivot.add(glowS);
  const beam = fatLine([[0, 0, 0], [0, 1, 0]], [[0.9, 0.96, 1], [0.25, 0.3, 0.4]], 2.2);
  beam.frustumCulled = false;
  node.group.add(beam);
  const from = V(), dir = V();
  node.update = ({ world }) => {
    // the beam starts at the crystal and ends at the star, at the center of the sphere
    crystal.getWorldPosition(from);
    const local = node.group.worldToLocal(from.clone());
    dir.copy(world).negate();
    const len = Math.max(dir.length() - r, r);
    beam.position.copy(local);
    beam.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
    beam.scale.set(1, len, 1);
  };
  node.noSpin = true;
}

export const BUILDERS = {
  habitat, "mushroom-city": mushroomCity, "flame-tower": flameTower, "disc-town": discTown, "rock-castle": rockCastle,
  "rock-ruin": rockRuin, "rock-port": rockPort, "rock-hideout": rockHideout, "shell-base": shellBase, "floating-base": floatingBase,
  "moth-citadel": mothCitadel,
};

export async function buildStructure(node, b, r, renderer) {
  const fn = BUILDERS[b.look?.build];
  if (!fn) return false;
  await fn(node, b, r, renderer);
  return true;
}
