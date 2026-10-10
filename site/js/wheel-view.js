// The Great Wheel: the planes of existence, drawn as a rose window in the silver Astral.
//
// The sixteen Outer Planes are the panes of the window, in a ring around the Outlands. Each pane has
// the tint of its alignment and its emblem. The Spire stands on the axis, with Sigil above it. Below,
// the Prime Material sits in the Ethereal, inside an armillary sphere of the Inner Planes.
//
// The style has three parts. The planes are glass. The frame (rings, scale, the armillary) is fine
// engraved silver. Each physical path between planes that a book names is drawn in light, with one
// motif for each kind: arches for the Great Road and the gate-towns, ribbons for the two rivers, a
// tree of light for Yggdrasil, a peak with caverns for Mount Olympus, a spiral of steps for the
// Infinite Staircase, funnels for the elemental vortices and discs for the color pools. When a plane
// or a path is in focus, the paths that touch it become brighter and the others dim. The map is a
// diagram, not to scale: the planes are infinite.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { starfield, radialTex, sprite, rng, hashStr, TAU, loadImage } from "./gfx.js";
import { resolve, linkPlanes } from "./atlas.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const RING_IN = 30, RING_OUT = 50, HUB = 13, SPIRE = 34, INNER_Y = -56, INNER_R = 12, POOL_R = 22;
const BEZEL_IN = 50.9, BEZEL_OUT = 57, ROAD_R = 52, LABEL_R = 62, ETHER_R = 6;
const TILT = 0.24, SEG = TAU / 16;
const RES = new THREE.Vector2(innerWidth / 2, innerHeight / 2);   // half the canvas, in CSS pixels

// angle of an Outer Plane on the wheel: Elysium (neutral good) at the top, law to the left, chaos to the right
export const ringAngle = (order) => Math.PI / 2 - (order - 2) * SEG;
// the panes rise toward the rim, like a shallow bowl; the bezel outside them is flat
const lift = (r) => Math.min(Math.max(0, r - RING_IN), RING_OUT - RING_IN) * TILT;
const RIM_Y = lift(RING_OUT);
const at = (a, r, up = 0) => V(Math.cos(a) * r, lift(r) + up, -Math.sin(a) * r);
export function wheelPoint(order, r, up = 0, da = 0) { return at(ringAngle(order) + da, r, up); }

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }`;

const curve = (pts, n = 48, type = "centripetal") => new THREE.CatmullRomCurve3(pts, false, type).getSpacedPoints(n);
const bezier = (a, b, c, d, n = 64) => new THREE.CubicBezierCurve3(a, b, c, d).getSpacedPoints(n);
function arcPts(a0, a1, r, up = 0, n = 64) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(at(a0 + (a1 - a0) * (i / n), r, up));
  return pts;
}
function circlePts(c, r, n = 48, axis = "y") {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, x = Math.cos(a) * r, y = Math.sin(a) * r;
    pts.push(c.clone().add(axis === "y" ? V(x, 0, y) : axis === "z" ? V(x, y, 0) : V(0, x, y)));
  }
  return pts;
}
// an arch (a portal): two posts and a round top, standing on base, across the given right vector
function archPts(base, right, w, h) {
  const r = w / 2, legs = Math.max(0, h - r), up = V(0, 1, 0), pts = [];
  pts.push(base.clone().addScaledVector(right, -r));
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI - i / 14 * Math.PI;
    pts.push(base.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, legs + Math.sin(a) * r));
  }
  pts.push(base.clone().addScaledVector(right, r));
  return pts;
}

// ---------- lines of light ----------
// Polylines drawn a fixed number of pixels wide (a little wider when near), with light that pulses
// along them. One mesh holds many lines; each line has its own color and width.
function flowLines(list, o = {}) {
  const pos = [], tan = [], col = [], side = [], dist = [], total = [], wid = [], idx = [];
  let base = 0;
  for (const L of list) {
    const P = L.pts, n = P.length;
    if (n < 2) continue;
    const c = new THREE.Color(L.color || o.color || "#ffffff").multiplyScalar(L.gain ?? 1);
    const ds = [0];
    for (let i = 1; i < n; i++) ds.push(ds[i - 1] + P[i].distanceTo(P[i - 1]));
    const off = L.offset || 0, len = ds[n - 1] + off;
    for (let i = 0; i < n; i++) {
      const t = P[Math.min(n - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
      const w = typeof L.width === "function" ? L.width(i / (n - 1)) : (L.width ?? o.width ?? 2);
      for (const s of [-1, 1]) {
        pos.push(P[i].x, P[i].y, P[i].z); tan.push(t.x, t.y, t.z); col.push(c.r, c.g, c.b);
        side.push(s); dist.push(ds[i] + off); total.push(len); wid.push(w);
      }
      if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    base += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("tangent3", new THREE.Float32BufferAttribute(tan, 3));
  g.setAttribute("color3", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute("dist", new THREE.Float32BufferAttribute(dist, 1));
  g.setAttribute("total", new THREE.Float32BufferAttribute(total, 1));
  g.setAttribute("wid", new THREE.Float32BufferAttribute(wid, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    uniforms: {
      res: { value: RES }, time: { value: 0 }, speed: { value: o.speed ?? 3 }, dash: { value: o.dash ?? 0 }, level: { value: 1 },
      fade: { value: o.fade ?? 0 }, pulse: { value: o.pulse ?? 1 }, gap: { value: o.gap ?? 10 },
    },
    vertexShader: `attribute vec3 tangent3, color3; attribute float side, dist, total, wid; uniform vec2 res;
      varying float vSide, vDist, vTotal; varying vec3 vCol;
      void main() {
        vSide = side; vDist = dist; vTotal = total; vCol = color3;
        vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 c1 = projectionMatrix * modelViewMatrix * vec4(position + tangent3 * 0.05, 1.0);
        vec2 dir = (c1.xy / c1.w - c0.xy / c0.w) * res;
        dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);
        float w = wid * clamp(120.0 / max(c0.w, 1.0), 0.8, 1.7);
        c0.xy += vec2(-dir.y, dir.x) * side * 0.5 * w / res * c0.w;
        gl_Position = c0;
      }`,
    fragmentShader: `uniform float time, speed, dash, level, fade, pulse, gap; varying float vSide, vDist, vTotal; varying vec3 vCol;
      void main() {
        float a = abs(vSide);
        float k = (1.0 - smoothstep(0.1, 0.6, a)) + (1.0 - a) * (1.0 - a) * 0.4;
        if (dash > 0.0) k *= smoothstep(0.42, 0.5, fract(vDist / dash));
        float p = fract((vDist - time * speed) / gap);
        k *= 1.0 + pulse * smoothstep(0.82, 1.0, p) * 1.4;
        if (fade > 0.0) k *= smoothstep(0.0, fade, vDist) * smoothstep(0.0, fade, vTotal - vDist);
        gl_FragColor = vec4(vCol * k * level, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = o.order ?? 6;
  return m;
}

// ---------- the panes ----------
function paneGeometry(order) {
  const a0 = ringAngle(order), half = SEG / 2 - 0.02, nr = 24, na = 24;
  const pos = [], polar = [], idx = [];
  for (let i = 0; i <= nr; i++) {
    const t = i / nr, r = RING_IN + (RING_OUT - RING_IN) * t;
    for (let j = 0; j <= na; j++) {
      const s = j / na * 2 - 1, a = a0 + s * half;
      pos.push(Math.cos(a) * r, lift(r), -Math.sin(a) * r);
      polar.push(t, s);
    }
  }
  for (let i = 0; i < nr; i++) for (let j = 0; j < na; j++) {
    const k = i * (na + 1) + j;
    idx.push(k, k + na + 1, k + 1, k + 1, k + na + 1, k + na + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("polar", new THREE.Float32BufferAttribute(polar, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function paneMaterial(color, emblem, layers, seed) {
  return new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { color: { value: new THREE.Color(color) }, emblem: { value: emblem }, layers: { value: layers }, time: { value: 0 }, glow: { value: 0 }, level: { value: 1 }, seed: { value: seed } },
    vertexShader: `attribute vec2 polar; varying vec2 vP; varying vec3 vN; varying vec3 vV;
      void main() { vP = polar; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform sampler2D emblem; uniform float layers, time, glow, level, seed; varying vec2 vP; varying vec3 vN; varying vec3 vV;
      ${NOISE}
      void main() {
        float r = vP.x, s = vP.y;
        // stained glass: deep at the hub side, luminous at the rim, with pale veins in the glass
        float v = fbm(vec2(r * 3.0 + seed, s * 2.0) + vec2(0.0, time * 0.03));
        float vein = smoothstep(0.62, 0.66, fbm(vec2(r * 5.0 - seed, s * 4.0 + seed)));
        vec3 c = mix(color * 0.035, color * 0.32, pow(r, 1.2)) * (0.65 + 0.7 * v) + color * vein * 0.06;
        // engraved arcs, one band per layer of the plane (an endless plane gets fine endless rings)
        float bands = clamp(layers, 1.0, 40.0);
        float f = abs(fract(r * bands) - 0.5);
        c += color * smoothstep(0.035, 0.0, f - 0.465) * (layers > 1.5 ? 0.3 : 0.0);
        // the lead came between the panes is dark; a fine line of light runs just inside it
        float dS = 1.0 - abs(s), dR = min(r, 1.0 - r) * 3.0, d = min(dS, dR);
        float came = smoothstep(0.035, 0.012, d);
        float line = smoothstep(0.03, 0.0, abs(d - 0.05));
        c = mix(c, mix(color, vec3(1.0), 0.45) * (1.0 + glow * 0.8), line * 0.8);
        c = mix(c, vec3(0.015, 0.016, 0.022), came);
        // the emblem, in the middle of the pane
        vec2 e = vec2(s * 0.55, (r - 0.5) * 1.05) + 0.5;
        float em = 0.0;
        if (e.x > 0.0 && e.x < 1.0 && e.y > 0.0 && e.y < 1.0) em = texture2D(emblem, e).a;
        c = mix(c, mix(color, vec3(1.0), 0.3) * 1.3, em * 0.92);
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
        c += color * fres * 0.12 + glow * color * 0.07;
        gl_FragColor = vec4(c * level, 0.9);
      }`,
  });
}

// An emblem as a texture: the SVG drawn white on a transparent canvas.
const emblemCache = new Map();
function emblemTexture(name) {
  if (emblemCache.has(name)) return emblemCache.get(name);
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  loadImage(`assets/emblems/${name}.svg`).then((im) => {
    if (!im) return;
    c.getContext("2d").drawImage(im, 0, 0, 512, 512);
    t.needsUpdate = true;
  });
  emblemCache.set(name, t);
  return t;
}

// ---------- engraved silver: the bezel around the wheel and the face of the Outlands ----------
const silver = (a) => `rgba(214, 222, 245, ${a})`;
const FONT = "Inter, system-ui, sans-serif";

// Text set along a circle, upright for a viewer at the bottom of the canvas (the near side).
function arcText(g, text, theta, r, px, style, track = 0.18) {
  g.font = `600 ${px}px ${FONT}`;
  g.fillStyle = style;
  g.textBaseline = "middle";
  const top = Math.sin(theta) < 0, sp = px * track;
  const ws = [...text].map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b + sp, -sp);
  let ang = theta + (top ? -1 : 1) * (total / 2) / r;
  [...text].forEach((ch, i) => {
    const mid = ang + (top ? 1 : -1) * (ws[i] / 2) / r;
    g.save();
    g.rotate(mid);
    g.translate(r, 0);
    g.rotate(top ? Math.PI / 2 : -Math.PI / 2);
    g.fillText(ch, -ws[i] / 2, 0);
    g.restore();
    ang += (top ? 1 : -1) * (ws[i] + sp) / r;
  });
}

function bezelTexture(planes) {
  const S = innerWidth < 760 ? 1024 : 2048, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), C = S / 2, k = C / BEZEL_OUT, u = S / 2048;
  g.translate(C, C);
  const ring = (r, w, a) => { g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.lineWidth = w * u; g.strokeStyle = silver(a); g.stroke(); };
  g.beginPath(); g.arc(0, 0, BEZEL_OUT * k, 0, TAU); g.arc(0, 0, BEZEL_IN * k, 0, TAU, true);
  g.fillStyle = "rgba(7, 9, 17, 0.86)"; g.fill();
  ring(BEZEL_IN + 0.1, 2, 0.5);
  ring(BEZEL_OUT - 0.12, 3, 0.75);
  ring(BEZEL_OUT - 0.5, 1.2, 0.35);
  ring(ROAD_R + 1.05, 1.2, 0.3);
  // the scale: a fine tick every 1/128 of the circle, longer at the edge of each pane
  for (let i = 0; i < 128; i++) {
    const a = -(ringAngle(0) + SEG / 2) + i * TAU / 128, major = i % 8 === 0, mid = i % 4 === 0;
    const r0 = BEZEL_OUT - 0.55, r1 = r0 - (major ? 1.5 : mid ? 0.8 : 0.42);
    g.beginPath(); g.moveTo(Math.cos(a) * r0 * k, Math.sin(a) * r0 * k); g.lineTo(Math.cos(a) * r1 * k, Math.sin(a) * r1 * k);
    g.lineWidth = (major ? 2.4 : 1.2) * u; g.strokeStyle = silver(major ? 0.85 : 0.42); g.stroke();
  }
  // the alignment of each pane, engraved in the ring: in full for the nine pure alignments, as initials between them
  for (const p of planes) {
    if (p.group !== "outer" || !p.alignment) continue;
    const words = p.alignment.split(/\s+and\s+/i), pure = words.length === 1;
    const text = pure ? p.alignment.toUpperCase() : words.map((w) => w.split(/\s+/).map((x) => x[0].toUpperCase()).join("")).join(" · ");
    arcText(g, text, -ringAngle(p.order), (BEZEL_OUT - 2.55) * k, (pure ? 30 : 24) * u, silver(pure ? 0.88 : 0.55));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function hubTexture(planes) {
  const S = 1024, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), C = S / 2, k = C / HUB;
  g.translate(C, C);
  // the nine rings of the Outlands around the Spire
  for (let i = 1; i <= 9; i++) {
    const r = 1.3 + (HUB - 2.2) * (i / 9);
    g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.lineWidth = i === 9 ? 2.4 : 1.2; g.strokeStyle = silver(0.18 + 0.03 * i); g.stroke();
  }
  // a road from the Spire to each gate-town
  for (const p of planes) {
    if (p.group !== "outer") continue;
    const a = -ringAngle(p.order);
    g.beginPath(); g.moveTo(Math.cos(a) * 1.3 * k, Math.sin(a) * 1.3 * k); g.lineTo(Math.cos(a) * (HUB - 0.9) * k, Math.sin(a) * (HUB - 0.9) * k);
    g.lineWidth = 1.4; g.setLineDash([6, 7]); g.strokeStyle = silver(0.4); g.stroke(); g.setLineDash([]);
    if (p.gate_town) arcText(g, p.gate_town.toUpperCase(), a + SEG * 0.26, (HUB - 1.45) * k, 15, silver(0.75), 0.2);
  }
  // a sixteen-point star around the foot of the Spire
  g.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = -ringAngle(0) + i * TAU / 32 - SEG / 2 + SEG / 2, r = (i % 2 ? 1.1 : i % 4 ? 2.1 : 3.0) * k;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.lineWidth = 1.6; g.strokeStyle = silver(0.6); g.stroke();
  g.fillStyle = "rgba(200, 210, 240, 0.05)"; g.fill();
  g.beginPath(); g.arc(0, 0, (HUB - 0.12) * k, 0, TAU); g.lineWidth = 5; g.strokeStyle = silver(0.9); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- the rivers ----------
// A flat strip that lies on the glass, with water that flows along it.
function ribbon(points, width, color, opts = {}) {
  const n = points.length - 1, pos = [], uv = [], idx = [];
  const up = V(0, 1, 0);
  let len = 0;
  const ds = [0];
  for (let i = 1; i <= n; i++) ds.push(len += points[i].distanceTo(points[i - 1]));
  for (let i = 0; i <= n; i++) {
    const p = points[i], tan = points[Math.min(n, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    pos.push(p.x - side.x * width / 2, p.y, p.z - side.z * width / 2, p.x + side.x * width / 2, p.y, p.z + side.z * width / 2);
    uv.push(ds[i], 0, ds[i], 1);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { color: { value: new THREE.Color(color) }, dark: { value: opts.dark ? 1 : 0 }, time: { value: 0 }, speed: { value: opts.speed ?? 1 }, level: { value: 1 }, len: { value: len } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 color; uniform float dark, time, speed, level, len; varying vec2 vUv;
      ${NOISE}
      void main() {
        float across = abs(vUv.y - 0.5) * 2.0;
        float flow = fbm(vec2(vUv.x * 0.9 - time * speed * 1.6, vUv.y * 3.0));
        float streak = smoothstep(0.55, 0.9, fbm(vec2(vUv.x * 2.5 - time * speed * 2.4, vUv.y * 9.0)));
        float body = (1.0 - smoothstep(0.55, 1.0, across)) * (0.45 + 0.55 * flow);
        float banks = smoothstep(0.62, 0.9, across) * (1.0 - smoothstep(0.9, 1.0, across));
        vec3 c = dark > 0.5 ? color * (0.18 * body + 1.5 * banks) + vec3(0.3, 0.95, 0.65) * streak * 0.22
                            : color * (0.85 * body + 0.9 * banks) + vec3(1.0) * streak * 0.32;
        float ends = smoothstep(0.0, 3.0, vUv.x) * smoothstep(0.0, 3.0, len - vUv.x);
        gl_FragColor = vec4(c * ends * level, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 5;
  return m;
}

// ---------- the view ----------
export class WheelView {
  constructor(app) {
    this.app = app;
    this.kind = "wheel";
    this.scene = new THREE.Scene();
    this.items = [];
    this.anim = [];
    this.parts = [];
    this.panes = [];
    this.pickables = [];
    this.ray = new THREE.Raycaster();
    this.hover = null;
  }

  dispose() {
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
    this.scene = new THREE.Scene();
    this.items = [];
    this.anim = [];
    this.parts = [];
    this.panes = [];
    this.pickables = [];
  }

  async build() {
    this.dispose();
    await document.fonts?.ready;
    const { atlas, edition } = this.app.state;
    const W = atlas.data.wheel || { planes: [], links: [] };
    const inEd = (x) => !x.editions || x.editions.includes(edition);
    const planes = (W.planes || []).map((p) => resolve(p, edition)).filter(inEd);
    const links = (W.links || []).map((l) => resolve(l, edition)).filter(inEd);
    this.planes = new Map(planes.map((p) => [p.id, p]));
    this.links = new Map(links.map((l) => [l.id, l]));
    this.outer = planes.filter((p) => p.group === "outer").sort((a, b) => a.order - b.order);
    const S = this.scene;
    this.stars = starfield(4200, 700, 99);
    S.add(this.stars);
    this.buildAstral();
    this.buildHub(planes);
    this.buildBezel(planes);
    for (const p of this.outer) this.buildPane(p);
    this.buildInner(planes.filter((p) => ["inner", "prime", "transitive", "echo"].includes(p.group)));
    for (const l of links) this.buildLink(l);
    this.R = 140;
    this.setupComposer();
  }

  // A part of the picture that belongs to a path, and to the planes it touches. It brightens when
  // the path or one of those planes is in focus. rest is its level when nothing is in focus.
  part(mesh, link, planes, rest = 1) {
    this.scene.add(mesh);
    const mats = [];
    mesh.traverse((o) => {
      if (o.material?.uniforms?.level) mats.push(o.material);
      if (o.isMesh || o.isPoints || o.isSprite) o.renderOrder = Math.max(o.renderOrder, 4);
    });
    this.parts.push({ mesh, mats, link, planes: new Set(planes), rest, level: rest });
    return mesh;
  }

  // the silver Astral: drifting motes of light around the wheel and down to the Prime
  buildAstral() {
    const R = rng(4242), pos = [], col = [], size = [];
    for (let i = 0; i < 2600; i++) {
      const a = R() * TAU, r = 6 + Math.sqrt(R()) * 70, y = 6 - R() * 74 * (1 - r / 110);
      const k = 0.06 + 0.3 * Math.pow(R(), 3);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      col.push(0.82 * k, 0.86 * k, 0.95 * k);
      size.push(1 + 2.5 * k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("acol", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("asize", new THREE.Float32BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { dpr: { value: Math.min(devicePixelRatio, 2) }, time: { value: 0 } },
      vertexShader: `attribute vec3 acol; attribute float asize; uniform float dpr, time; varying vec3 vC;
        void main() { vC = acol; vec3 p = position; p.y += sin(time * 0.15 + position.x * 0.05) * 0.6; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = min(asize * 60.0 / -mv.z, 7.0) * dpr; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = clamp(1.0 - r, 0.0, 1.0); gl_FragColor = vec4(vC * a * a, 1.0); }`,
    });
    this.scene.add(new THREE.Points(g, m));
    this.anim.push((t) => { m.uniforms.time.value = t; });
    // a faint halo of light under the wheel, so the glass reads against the dark
    const halo = sprite(radialTex([[0, "rgba(150,170,230,.07)"], [0.45, "rgba(110,120,200,.025)"], [1, "rgba(0,0,0,0)"]]), 190);
    halo.position.set(0, -14, 0);
    halo.renderOrder = -2;
    this.scene.add(halo);
  }

  // the Outlands: an engraved face with its nine rings, the Spire, and Sigil above it
  buildHub(planes) {
    const outlands = this.planes.get("outlands"), sigil = this.planes.get("sigil");
    const g = new THREE.CircleGeometry(HUB, 128).rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { face: { value: hubTexture(planes) }, level: { value: 1 }, glow: { value: 0 } },
      vertexShader: `varying vec2 vXZ; varying vec2 vUv; void main() { vXZ = position.xz; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D face; uniform float level, glow; varying vec2 vXZ; varying vec2 vUv; ${NOISE}
        void main() {
          float r = length(vXZ) / ${HUB.toFixed(1)};
          float land = fbm(vXZ * 0.35) * 0.6 + 0.4;
          vec3 c = mix(vec3(0.045, 0.045, 0.055), vec3(0.15, 0.14, 0.13), land) * (1.0 - r * 0.35);
          vec4 f = texture2D(face, vUv);
          c = mix(c, vec3(0.88, 0.9, 1.0), f.a * 0.85);
          c += vec3(0.85, 0.8, 0.7) * glow * 0.12;
          gl_FragColor = vec4(c * level, 0.96);
        }`,
    });
    const face = new THREE.Mesh(g, m);
    face.renderOrder = 2;
    face.userData.pick = { type: "plane", id: "outlands" };
    this.scene.add(face);
    this.pickables.push(face);
    this.hubMat = m;
    // the Spire: a needle of light on the axis, fading as it rises
    const sp = new THREE.CylinderGeometry(0.05, 0.65, SPIRE, 16, 1, true).translate(0, SPIRE / 2, 0);
    const smat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `varying float vY; void main() { vY = position.y / ${SPIRE.toFixed(1)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying float vY; void main() { gl_FragColor = vec4(vec3(0.92, 0.94, 1.0) * (1.1 - vY) * 0.85, 1.0); }`,
    });
    this.scene.add(new THREE.Mesh(sp, smat));
    // Sigil: the ring city on the tip of the Spire, with the blades of the Lady's halo
    const sig = new THREE.Group();
    sig.position.set(0, SPIRE + 2, 0);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.62, 24, 96), new THREE.MeshStandardMaterial({ color: 0x9a97ad, emissive: 0x3a3650, metalness: 0.6, roughness: 0.35 }));
    torus.rotation.x = Math.PI / 2;
    torus.userData.pick = { type: "plane", id: "sigil" };
    this.pickables.push(torus);
    sig.add(torus);
    const lights = [];
    const R = rng(77);
    for (let i = 0; i < 260; i++) { const a = R() * TAU, h = (R() - 0.5) * 0.5; lights.push(V(Math.cos(a) * (3.4 + (R() - 0.5) * 0.8), h, Math.sin(a) * (3.4 + (R() - 0.5) * 0.8))); }
    sig.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(lights), new THREE.PointsMaterial({ color: 0xffd9a6, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe8, emissive: 0x6a6f88, metalness: 0.85, roughness: 0.25 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU, b = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 4), bladeMat);
      b.position.set(Math.cos(a) * 4.7, 0, Math.sin(a) * 4.7);
      b.rotation.z = -Math.PI / 2;
      b.rotation.y = -a;
      sig.add(b);
    }
    sig.add(sprite(radialTex([[0, "rgba(255,240,220,.6)"], [0.3, "rgba(200,190,255,.18)"], [1, "rgba(0,0,0,0)"]]), 16));
    sig.add(new THREE.PointLight(0xe8e0ff, 1.2, 0, 0));
    this.scene.add(sig);
    this.anim.push((t, dt) => { if (!this.app.reducedMotion) sig.rotation.y += dt * 0.04; });
    this.scene.add(new THREE.AmbientLight(0xbac6e0, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(30, 60, 40);
    this.scene.add(key);
    if (outlands) this.items.push({ type: "plane", id: "outlands", p: outlands, world: V(0, 0, 0), r: HUB, label: V(0, 0.3, HUB * 0.55), below: true });
    if (sigil) this.items.push({ type: "plane", id: "sigil", p: sigil, world: V(0, SPIRE + 2, 0), r: 5.2 });
  }

  // the bezel: the engraved ring around the panes, with the alignment of each one
  buildBezel(planes) {
    const g = new THREE.RingGeometry(BEZEL_IN, BEZEL_OUT, 256, 1).rotateX(-Math.PI / 2).translate(0, RIM_Y + 0.02, 0);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: bezelTexture(planes), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    mesh.renderOrder = 3;
    this.scene.add(mesh);
  }

  buildPane(p) {
    const order = p.order ?? 0, layers = p.layers_count ?? (p.layers?.length || 1);
    const mat = paneMaterial(p.color || "#9db4ff", emblemTexture(p.emblem || p.id), layers, (hashStr(p.id) % 1000) / 100);
    const mesh = new THREE.Mesh(paneGeometry(order), mat);
    mesh.renderOrder = 2;
    mesh.userData.pick = { type: "plane", id: p.id };
    this.scene.add(mesh);
    this.pickables.push(mesh);
    this.panes.push({ p, mat, glow: 0, level: 1 });
    this.anim.push((t) => { mat.uniforms.time.value = t; });
    this.items.push({ type: "plane", id: p.id, p, world: wheelPoint(order, (RING_IN + RING_OUT) / 2, 0.5), r: 8, label: wheelPoint(order, LABEL_R, 0), outward: true, frameAt: wheelPoint(order, (RING_IN + RING_OUT) / 2, 4), frameD: 66 });
  }

  // the inner universe: the Prime in the Ethereal, in an armillary sphere of the Inner Planes
  buildInner(planes) {
    const c = V(0, INNER_Y, 0);
    const g = new THREE.Group();
    g.position.copy(c);
    this.scene.add(g);
    this.innerCenter = c;
    // the axis of the diagram, from the Prime up to the Outlands (the Astral lies all around it)
    const axis = [];
    for (let i = 0; i <= 60; i++) axis.push(V(0, c.y + INNER_R + 1 + (-c.y - INNER_R - 1.6) * (i / 60), 0));
    this.scene.add(flowLines([{ pts: axis, color: "#c9d4ee", width: 1.2, gain: 0.5 }], { dash: 0.9, speed: 2, gap: 14 }));
    // the armillary
    const rings = [];
    rings.push({ pts: circlePts(c, INNER_R, 128, "y") }, { pts: circlePts(c, INNER_R, 128, "z") }, { pts: circlePts(c, INNER_R, 128, "x") });
    rings.push({ pts: circlePts(c.clone().add(V(0, INNER_R * 0.707, 0)), INNER_R * 0.707, 96, "y") }, { pts: circlePts(c.clone().add(V(0, -INNER_R * 0.707, 0)), INNER_R * 0.707, 96, "y") });
    this.scene.add(flowLines(rings.map((x) => ({ ...x, color: "#9db4ff", width: 1.1, gain: 0.45 })), { pulse: 0 }));
    // the Ethereal: a veil of mist around the Prime
    const ethereal = this.planes.get("ethereal");
    const eth = new THREE.Mesh(new THREE.SphereGeometry(ETHER_R, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float time; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
        void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); float n = fbm(vec2(atan(vP.z, vP.x) * 2.0, vP.y * 0.6 - time * 0.05));
          gl_FragColor = vec4(vec3(0.62, 0.72, 0.85) * (f * 0.8 + n * 0.12), 1.0); }`,
    }));
    if (ethereal) { eth.userData.pick = { type: "plane", id: "ethereal" }; this.pickables.push(eth); }
    g.add(eth);
    this.anim.push((t) => { eth.material.uniforms.time.value = t; });
    // the Prime: crystal spheres adrift, in small
    const R = rng(1701);
    const beadMat = new THREE.MeshStandardMaterial({ color: 0xcfe0ff, emissive: 0x5a4aa0, roughness: 0.2, metalness: 0.3 });
    const primeCore = new THREE.Mesh(new THREE.SphereGeometry(3.1, 24, 16), new THREE.MeshBasicMaterial({ visible: false }));
    primeCore.userData.pick = { type: "plane", id: "prime" };
    g.add(primeCore);
    this.pickables.push(primeCore);
    for (let i = 0; i < 30; i++) {
      const u = R() * 2 - 1, a = R() * TAU, d = 2.8 * Math.cbrt(R()), s2 = Math.sqrt(1 - u * u);
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.16 + 0.24 * R(), 16, 12), beadMat.clone());
      bead.material.emissive.setHSL(0.55 + R() * 0.25, 0.7, 0.35);
      bead.position.set(Math.cos(a) * s2 * d, u * d, Math.sin(a) * s2 * d);
      g.add(bead);
    }
    g.add(sprite(radialTex([[0, "rgba(255,170,240,.55)"], [0.3, "rgba(140,170,255,.2)"], [1, "rgba(0,0,0,0)"]]), 10));
    // the Inner Planes on the armillary: the four elements on the equator, the paraelements between
    // them, the quasielements above (toward Positive) and below (toward Negative)
    const place = {
      air: [0, 0], fire: [90, 0], earth: [180, 0], water: [270, 0],
      smoke: [45, 0], magma: [135, 0], ooze: [225, 0], ice: [315, 0],
      lightning: [0, 45], radiance: [90, 45], minerals: [180, 45], steam: [270, 45],
      vacuum: [0, -45], ash: [90, -45], dust: [180, -45], salt: [270, -45],
      positive: [0, 90], negative: [0, -90],
    };
    const curtains = [];
    for (const p of planes) {
      if (p.group === "prime") { this.items.push({ type: "plane", id: p.id, p, world: c.clone(), r: 3.1, inner: true, major: true, frameD: 52 }); continue; }
      if (p.group === "transitive") {
        if (p.id === "astral") this.items.push({ type: "plane", id: p.id, p, world: V(-30, -27, 22), r: 0, region: true, frameAt: V(0, -22, 0), frameD: 175 });
        else if (p.id === "ethereal") this.items.push({ type: "plane", id: p.id, p, world: c.clone().add(V(0, -ETHER_R - 1.4, 0)), r: 0, region: true, inner: true, frameAt: c.clone(), frameD: 46 });
        else {
          // the Plane (or Demiplane) of Shadow: a dark orb in the deep Ethereal, next to the Prime
          const at = V(-7.2, -4.2, 4.5), orb = this.innerOrb({ ...p, slot: "negative" }, 1.0);
          orb.position.copy(at);
          orb.userData.pick = { type: "plane", id: p.id };
          this.pickables.push(orb);
          g.add(orb);
          this.items.push({ type: "plane", id: p.id, p, world: c.clone().add(at), r: 1.0, inner: true });
        }
        continue;
      }
      if (p.group === "echo") {
        // the echoes of the Material Plane (5e): two veiled orbs in the mist on either side of the Prime
        const fey = p.id === "feywild", at = V(fey ? 4.1 : -4.1, fey ? 1.2 : -1.2, fey ? -2.2 : 2.2);
        const orb = this.innerOrb({ ...p, slot: fey ? "fey" : "negative" }, 1.05);
        orb.position.copy(at);
        orb.userData.pick = { type: "plane", id: p.id };
        this.pickables.push(orb);
        g.add(orb);
        this.items.push({ type: "plane", id: p.id, p, world: c.clone().add(at), r: 1.05, inner: true, major: true });
        continue;
      }
      if ((p.slot || p.id) === "chaos") {
        // the Elemental Chaos (5e): a churning band of every color around the ring of the four elements
        const band = new THREE.Mesh(new THREE.TorusGeometry(INNER_R, 2.0, 32, 160).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide, uniforms: { time: { value: 0 } },
          vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV; void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
          fragmentShader: `uniform float time; varying vec3 vP; varying vec3 vN; varying vec3 vV; ${NOISE}
            void main() {
              float a = atan(vP.z, vP.x);
              float n = fbm(vec2(a * 4.0 + time * 0.12, vP.y * 0.6 - time * 0.05));
              vec3 c = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + n * 1.4 + a * 0.32));
              float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
              gl_FragColor = vec4(c * (0.02 + 0.15 * smoothstep(0.5, 0.85, n)) * (0.35 + f), 1.0);
            }`,
        }));
        band.userData.pick = { type: "plane", id: p.id };
        this.pickables.push(band);
        g.add(band);
        this.anim.push((t) => { band.material.uniforms.time.value = t; });
        this.items.push({ type: "plane", id: p.id, p, world: c.clone().add(V(-INNER_R - 2.6, 0, 0)), r: 1.2, inner: true, major: true, frameAt: c.clone(), frameD: 46 });
        continue;
      }
      const spot = place[p.slot || p.id];
      if (!spot) continue;
      const [lon, lat] = spot.map((x) => x * Math.PI / 180);
      const pos = V(Math.cos(lat) * Math.cos(lon) * INNER_R, Math.sin(lat) * INNER_R, -Math.cos(lat) * Math.sin(lon) * INNER_R);
      const kind = p.slot || p.id;
      const size = ["air", "fire", "earth", "water"].includes(kind) ? 1.4 : ["positive", "negative"].includes(kind) ? 1.7 : 0.85;
      const orb = this.innerOrb(p, size);
      orb.position.copy(pos);
      orb.userData.pick = { type: "plane", id: p.id };
      this.pickables.push(orb);
      g.add(orb);
      // the Border Ethereal touches every Inner Plane: a faint curtain of mist to each one
      const dir = pos.clone().normalize();
      curtains.push({ pts: [c.clone().addScaledVector(dir, ETHER_R), c.clone().addScaledVector(dir, INNER_R - size * 1.1)], color: p.color || "#cfd8ea", width: 1, gain: 0.35 });
      this.items.push({ type: "plane", id: p.id, p, world: c.clone().add(pos), r: size, inner: true, major: ["air", "fire", "earth", "water", "positive", "negative"].includes(kind) });
    }
    this.scene.add(flowLines(curtains, { pulse: 0.5, speed: 1.5, gap: 6 }));
  }

  innerOrb(p, size) {
    const col = new THREE.Color(p.color || "#cfd8ea");
    const kind = p.slot || p.id;
    const neg = kind === "negative" || ["vacuum", "ash", "dust", "salt"].includes(kind);
    const m = new THREE.ShaderMaterial({
      uniforms: { color: { value: col }, time: { value: 0 }, neg: { value: kind === "fey" ? 2 : neg ? 1 : 0 }, seed: { value: (hashStr(kind) % 100) / 10 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float time, neg, seed; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
        void main() {
          vec3 d = normalize(vP);
          float n = fbm(vec2(atan(d.z, d.x) * 2.0 + seed, d.y * 3.0) + time * 0.08);
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          vec3 c = neg > 0.5 ? color * 0.12 + color * f * 1.2 : color * (0.55 + 0.7 * n) + vec3(1.0) * f * 0.35;
          if (neg > 1.5) c = color * (0.25 + 0.5 * n) + mix(color, vec3(1.0), 0.5) * f * 1.4;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 24), m);
    this.anim.push((t) => { m.uniforms.time.value = t; });
    if (!neg || kind === "fey") orb.add(sprite(radialTex([[0, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},.5)`], [1, "rgba(0,0,0,0)"]]), size * 5));
    return orb;
  }

  // a point on or under a plane, where a path reaches it
  reachPoint(id, r = 40, da = 0) {
    const p = this.planes.get(id);
    if (p?.group === "outer") return wheelPoint(p.order, r, 0.35, da);
    const it = this.items.find((i) => i.id === id);
    return it ? it.world.clone() : this.innerCenter.clone();
  }

  // the center and the camera distance that show all of a path
  fit(pts) {
    if (!pts?.length) return {};
    const box = new THREE.Box3().setFromPoints(pts), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
    return { frameAt: c, frameD: Math.max(30, r * 3.1) };
  }

  // a portal ring where a path crosses into a plane, flat on its glass
  portalRing(at, color, r = 1.1) { return { pts: circlePts(at.clone().add(V(0, 0.1, 0)), r, 40), color, width: 2.2, gain: 1.2 }; }

  // ---------- the known paths between planes ----------
  buildLink(l) {
    const linkItem = (world, samples, extra = {}) => this.items.push({ type: "link", id: l.id, l, world, r: 2, samples, ...this.fit(samples), ...extra });
    const outerIds = this.outer.map((p) => p.id);
    const col = l.color || "#f2e2b8";
    if (l.kind === "road") {
      // the Great Road: the road around the rim, and an arch (a portal) between each pair of neighbors
      const samples = [];
      for (let i = 0; i < this.outer.length; i++) {
        const p = this.outer[i], q = this.outer[(i + 1) % this.outer.length];
        const a = ringAngle(p.order), b = a - SEG / 2;
        const road = arcPts(a + SEG / 2, a - SEG / 2, ROAD_R, 0.05, 24);
        this.part(flowLines([{ pts: road, color: col, width: 1.6, gain: 0.7 }], { speed: 2.5, gap: 7 }), l.id, [p.id]);
        const base = at(b, ROAD_R, 0.05), right = V(Math.cos(b), 0, -Math.sin(b));
        const arch = archPts(base, right, 1.5, 1.9);
        this.part(flowLines([{ pts: arch, color: col, width: 2, gain: 1.1 }], { pulse: 0 }), l.id, [p.id, q.id]);
        samples.push(...road.filter((_, k) => k % 3 === 0), base.clone().add(V(0, 1, 0)));
      }
      linkItem(at(ringAngle(12) - SEG * 0.5, BEZEL_OUT + 2.2, 0), samples, { labelAt: at(ringAngle(11) - SEG * 0.5, BEZEL_OUT + 3.5, 0) });
      return;
    }
    if (l.kind === "gates") {
      // a gate-town at the rim of the Outlands for each Outer Plane, and its road out to the plane
      const samples = [];
      for (const p of this.outer) {
        if (!p.gate_town) continue;
        const a = ringAngle(p.order), base = at(a, HUB + 0.35, 0.02), right = V(-Math.sin(a), 0, -Math.cos(a));
        const road = [at(a, HUB + 0.5, 0.06), at(a, RING_IN - 0.4, 0.06)];
        const pts = curve(road, 24, "chordal");
        this.part(flowLines([{ pts: archPts(base, right, 1.1, 1.45), color: p.color, width: 2, gain: 1.25 },
          { pts, color: p.color, width: 1.6, gain: 0.8 }], { speed: 3, gap: 6 }), l.id, [p.id, "outlands"]);
        samples.push(base.clone().add(V(0, 0.8, 0)), ...pts.filter((_, k) => k % 4 === 0));
      }
      linkItem(V(0, 0, 0), samples, { noLabel: true });
      return;
    }
    if (l.kind === "pools") {
      // a color pool for each Outer Plane, adrift in the Astral under the gap between hub and glass
      const samples = [];
      const extra = ["outlands", "ethereal", "prime"].map((id) => this.planes.get(id)).filter((p) => p?.pool);
      const spots = [...this.outer.map((p) => ({ p, c: at(ringAngle(p.order), POOL_R, -4.5), to: at(ringAngle(p.order), RING_IN - 1.2, 0.02) })),
        ...extra.map((p) => {
          const c = p.id === "outlands" ? V(0, -6.5, HUB * 0.62) : this.innerCenter.clone().add(V(p.id === "prime" ? 3.4 : -3.4, INNER_R + 5, 1.5));
          return { p, c, to: p.id === "outlands" ? V(0, -0.2, HUB * 0.62) : this.innerCenter.clone().add(V(0, p.id === "prime" ? 3.2 : ETHER_R, 0)) };
        })];
      for (const { p, c, to } of spots) {
        const tint = p.pool?.hex || p.color;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
          uniforms: { color: { value: new THREE.Color(tint) }, time: { value: 0 }, level: { value: 1 }, seed: { value: (hashStr(p.id) % 100) / 10 } },
          vertexShader: `varying vec2 vXZ; void main() { vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 color; uniform float time, level, seed; varying vec2 vXZ; ${NOISE}
            void main() {
              float r = length(vXZ) / 1.45, a = atan(vXZ.y, vXZ.x);
              float swirl = fbm(vec2(a * 1.5 + r * 3.0 - time * 0.4 + seed, r * 4.0 - time * 0.2));
              float rim = smoothstep(0.78, 0.94, r) * (1.0 - smoothstep(0.94, 1.0, r));
              vec3 c = color * (0.35 + 0.9 * swirl) * (1.0 - r * 0.5) + mix(color, vec3(1.0), 0.6) * rim * 1.3;
              gl_FragColor = vec4(c * level * (1.0 - smoothstep(0.97, 1.0, r)), 1.0);
            }`,
        }));
        disc.position.copy(c);
        disc.renderOrder = 1;
        disc.userData.pick = { type: "link", id: l.id };
        this.pickables.push(disc);
        this.anim.push((t) => { disc.material.uniforms.time.value = t; });
        const g = new THREE.Group();
        g.add(disc);
        g.add(flowLines([{ pts: [c.clone().add(V(0, 0.2, 0)), to], color: tint, width: 1, gain: 0.35 }], { dash: 0.5, pulse: 0 }));
        this.part(g, l.id, [p.id, "astral"]);
        samples.push(c);
      }
      linkItem(at(ringAngle(10), POOL_R, -4.5), samples, { noLabel: true });
      return;
    }
    if (l.kind === "portals") {
      // the portals of Sigil reach anywhere: threads from the city to each plane, shown when in focus
      const sig = V(0, SPIRE + 2, 0), threads = [];
      for (const p of this.outer) {
        const end = wheelPoint(p.order, 42, 0.3);
        threads.push({ pts: bezier(sig, sig.clone().lerp(end, 0.3).add(V(0, 6, 0)), end.clone().add(V(0, 10, 0)), end, 40), color: p.color, width: 1.2, gain: 0.7 });
      }
      this.part(flowLines(threads, { speed: 5, gap: 9 }), l.id, ["sigil"], 0);
      linkItem(sig.clone(), [], { noLabel: true });
      return;
    }
    if (l.kind === "river") {
      // a river runs from pane to pane, bending through each plane it waters
      const path = [], ids = (l.through || []).filter((id) => this.planes.get(id)?.group === "outer");
      ids.forEach((id, i) => {
        const p = this.planes.get(id), r = RING_IN + (RING_OUT - RING_IN) * (i % 2 ? 0.64 : 0.4);
        if (i === 0) path.push(wheelPoint(p.order, r, 0.45, SEG * 0.32));
        path.push(wheelPoint(p.order, r, 0.45));
        if (i === ids.length - 1) path.push(wheelPoint(p.order, r, 0.45, -SEG * 0.32));
      });
      if (path.length < 2) return;
      const pts = new THREE.CatmullRomCurve3(path, false, "centripetal").getSpacedPoints(path.length * 30);
      pts.forEach((q) => { q.y = lift(Math.hypot(q.x, q.z)) + 0.45; });
      const g = new THREE.Group();
      g.add(ribbon(pts, 1.9, col, { dark: l.style === "dark", speed: 0.6 }));
      g.add(flowLines([{ pts, color: col, width: 1.4, gain: l.style === "dark" ? 0.5 : 0.7 }], { speed: 4, gap: 12, fade: 3 }));
      this.part(g, l.id, ids);
      this.anim.push((t) => g.traverse((o) => { if (o.material?.uniforms?.time) o.material.uniforms.time.value = t; }));
      linkItem(pts[Math.floor(pts.length / 2)], pts.filter((_, k) => k % 3 === 0));
      return;
    }
    if (l.kind === "tree") return this.buildTree(l);
    if (l.kind === "mountain") return this.buildMountain(l);
    if (l.kind === "stair") return this.buildStair(l);
    if (l.kind === "vortices") {
      // a funnel of light from the Prime's mist to each Elemental Plane
      const c = this.innerCenter, samples = [];
      for (const r of l.reaches || []) {
        const it = this.items.find((i) => i.id === r.id);
        if (!it) continue;
        const dir = it.world.clone().sub(c).normalize(), A = c.clone().addScaledVector(dir, ETHER_R), B = it.world.clone().addScaledVector(dir, -it.r * 1.15);
        const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize(), w = new THREE.Vector3().crossVectors(dir, u);
        const pts = [];
        for (let i = 0; i <= 120; i++) {
          const t = i / 120, rad = 0.25 + 0.75 * Math.pow(1 - t, 1.5), a = t * TAU * 5;
          pts.push(A.clone().lerp(B, t).addScaledVector(u, Math.cos(a) * rad).addScaledVector(w, Math.sin(a) * rad));
        }
        const p = this.planes.get(r.id);
        this.part(flowLines([{ pts, color: p?.color || col, width: 1.6, gain: 1.1 }], { speed: 3, gap: 4 }), l.id, [r.id, "prime"]);
        samples.push(...pts.filter((_, k) => k % 6 === 0));
      }
      linkItem(c.clone().add(V(0, -INNER_R - 3, 0)), samples, { inner: true, noLabel: true });
    }
  }

  // Yggdrasil: a tree of light on the first layer of Ysgard. Its branches arch over the wheel to the
  // planes they reach and down through the Astral to the Prime; its roots run along the glass.
  buildTree(l) {
    const home = this.planes.get(l.home);
    if (!home) return;
    const R = rng(hashStr(l.id)), col = new THREE.Color(l.color || "#b6e07a"), bark = "#e7c98a", samples = [];
    const base = wheelPoint(home.order, 39, 0.1, -SEG * 0.26), H = 16;
    const body = [], tips = [];
    const trunkTop = base.clone().add(V(0.2, H * 0.38, 0));
    body.push({ pts: curve([base, base.clone().add(V(-0.3, H * 0.15, 0.2)), trunkTop], 20), width: 7, color: bark, gain: 0.9 });
    const branch = (from, dir, len, depth, w) => {
      const to = from.clone().addScaledVector(dir, len);
      const mid = from.clone().lerp(to, 0.5).add(V((R() - 0.5) * len * 0.2, len * 0.1, (R() - 0.5) * len * 0.2));
      body.push({ pts: curve([from, mid, to], 10), width: w, color: depth > 1 ? bark : col, gain: depth > 1 ? 0.8 : 0.9 });
      if (!depth) { tips.push(to); return; }
      const kids = depth > 1 ? 3 : 2;
      for (let i = 0; i < kids; i++) {
        const az = (i / kids) * TAU + R() * 1.2, spread = 0.42 + R() * 0.38;
        const side = V(Math.cos(az), 0, Math.sin(az));
        const nd = dir.clone().multiplyScalar(Math.cos(spread)).addScaledVector(side, Math.sin(spread));
        nd.y = Math.max(nd.y, 0.12);
        branch(to, nd.normalize(), len * (0.6 + R() * 0.14), depth - 1, w * 0.62);
      }
    };
    const leaders = [];
    for (let i = 0; i < 3; i++) {
      const az = i / 3 * TAU + 0.5, d = V(Math.cos(az) * 0.55, 1, Math.sin(az) * 0.55).normalize();
      leaders.push(trunkTop.clone().addScaledVector(d, H * 0.3));
      branch(trunkTop, d, H * 0.3, 3, 4.4);
    }
    const g = new THREE.Group();
    g.add(flowLines(body, { speed: 2.5, gap: 5, pulse: 0.8 }));
    // leaves: soft points of light at the tips
    const lp = [], lc = [];
    for (const t of tips) for (let k = 0; k < 16; k++) {
      lp.push(t.x + (R() - 0.5) * 2.4, t.y + (R() - 0.5) * 1.8, t.z + (R() - 0.5) * 2.4);
      const c2 = col.clone().lerp(new THREE.Color("#fff2c0"), R() * 0.5).multiplyScalar(0.5 + R() * 0.5);
      lc.push(c2.r, c2.g, c2.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute("color", new THREE.Float32BufferAttribute(lc, 3));
    g.add(new THREE.Points(lg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { level: { value: 1 }, dpr: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute vec3 color; uniform float dpr; varying vec3 vC;
        void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(150.0 / -mv.z, 1.5, 9.0) * dpr; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float level; varying vec3 vC; void main() { float r = length(gl_PointCoord - 0.5) * 2.0; float a = clamp(1.0 - r, 0.0, 1.0); gl_FragColor = vec4(vC * a * a * level, 1.0); }`,
    })));
    const bloom = sprite(radialTex([[0, "rgba(190,240,140,.26)"], [0.5, "rgba(120,200,110,.06)"], [1, "rgba(0,0,0,0)"]]), H * 1.3);
    bloom.position.copy(trunkTop).add(V(0, H * 0.32, 0));
    g.add(bloom);
    this.part(g, l.id, [home.id]);
    tips.forEach((t) => samples.push(t));
    body.forEach((b) => samples.push(b.pts[0], b.pts[Math.floor(b.pts.length / 2)]));
    // the paths: branches from the crown, roots from the foot
    const crown = leaders.sort((a, b) => b.y - a.y)[0];
    const reaches = l.reaches || [];
    const roots = reaches.filter((r) => r.by === "root"), boughs = reaches.filter((r) => r.by !== "root");
    boughs.forEach((r, i) => {
      const p = this.planes.get(r.id);
      if (!p) return;
      let pts;
      if (p.group === "outer") {
        const end = this.reachPoint(r.id, 44);
        const from = leaders[i % leaders.length];
        pts = bezier(from, from.clone().add(V(0, 7, 0)).lerp(end, 0.25), end.clone().add(V(0, 11, 0)), end, 70);
        this.part(flowLines([{ pts, color: col, width: 2.2, gain: 1 }, this.portalRing(end, p.color)], { speed: 4, gap: 8, fade: 1.5 }), l.id, [home.id, r.id]);
      } else {
        // down through the Astral to the Prime: out over the rim, then down
        const end = this.innerCenter.clone().add(this.innerCenter.clone().sub(base).setY(0).normalize().multiplyScalar(-ETHER_R * 0.8)).add(V(0, 1.5, 0));
        const out = base.clone().setY(0).normalize();
        pts = bezier(crown, crown.clone().addScaledVector(out, 22).add(V(0, 6, 0)), end.clone().addScaledVector(out, 34).add(V(0, 6, 0)), end, 120);
        this.part(flowLines([{ pts, color: col, width: 2, gain: 1 }], { speed: 5, gap: 10, fade: 2 }), l.id, [home.id, r.id], 0.45);
      }
      samples.push(...pts.filter((_, k) => k % 5 === 0));
    });
    // roots: along the inner part of the glass, like a track, with a portal at each plane they reach
    const a0 = ringAngle(home.order) - SEG * 0.12, ROOT_R = 33.6;
    let far = a0;
    for (const r of roots) { const p = this.planes.get(r.id); if (p) far = Math.min(far, ringAngle(p.order) + (ringAngle(p.order) > a0 ? -TAU : 0)); }
    if (roots.length) {
      const down = curve([base, at(a0, 40, 0.3), at(a0 - 0.05, ROOT_R + 1.5, 0.3), at(a0 - 0.12, ROOT_R, 0.3)], 30);
      const track = arcPts(a0 - 0.12, far, ROOT_R, 0.3, 200);
      const list = [{ pts: down.concat(track.slice(1)), color: bark, width: 2.6, gain: 1.15 }];
      const ends = [];
      for (const r of roots) {
        const p = this.planes.get(r.id);
        if (!p) continue;
        const e = at(ringAngle(p.order), ROOT_R, 0.3);
        list.push(this.portalRing(e, p.color, 0.9));
        ends.push(p.id);
      }
      this.part(flowLines(list, { speed: 3, gap: 7, fade: 1 }), l.id, [home.id, ...ends]);
      samples.push(...track.filter((_, k) => k % 6 === 0));
    }
    this.items.push({ type: "link", id: l.id, l, world: trunkTop, r: 3, samples, ...this.fit(samples), labelAt: crown.clone().add(V(0, 2.5, 0)), callout: 95, calloutAngle: -25 });
  }

  // Mount Olympus: a peak of glass on Arborea, with caverns (dashed, under the stone) to the planes it
  // reaches and a path down its slopes, through the Astral, to the Prime
  buildMountain(l) {
    const home = this.planes.get(l.home);
    if (!home) return;
    const col = l.color || "#f0c46a", samples = [];
    const base = wheelPoint(home.order, 38, 0, SEG * 0.06), H = 9;
    const geo = new THREE.ConeGeometry(3.9, H, 7, 1, true).translate(0, H / 2, 0);
    const pos = geo.attributes.position;
    // an uneven foot, the same for the two vertices at the seam
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > H - 0.01) continue;
      const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = 1 + 0.18 * Math.sin(3 * a + 1) + 0.08 * Math.sin(7 * a);
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    const peak = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a6420, emissive: 0x7a5014, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.5, flatShading: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    peak.position.copy(base);
    peak.userData.pick = { type: "link", id: l.id };
    this.pickables.push(peak);
    const edges = new THREE.EdgesGeometry(geo, 20), ep = edges.attributes.position, segs = [];
    for (let i = 0; i < ep.count; i += 2) segs.push({ pts: [V(ep.getX(i), ep.getY(i), ep.getZ(i)).add(base), V(ep.getX(i + 1), ep.getY(i + 1), ep.getZ(i + 1)).add(base)], color: col, width: 1.8, gain: 1.4 });
    const g = new THREE.Group();
    g.add(peak);
    g.add(flowLines(segs, { pulse: 0 }));
    const glint = sprite(radialTex([[0, "rgba(255,236,190,.9)"], [0.25, "rgba(240,196,106,.3)"], [1, "rgba(0,0,0,0)"]]), 3.5);
    glint.position.copy(base).add(V(0, H + 0.2, 0));
    g.add(glint);
    this.part(g, l.id, [home.id]);
    samples.push(base.clone().add(V(0, H * 0.5, 0)), base.clone().add(V(0, H, 0)));
    // caverns: a dashed track along the inner edge of the glass, with a portal at each plane
    const caverns = (l.reaches || []).filter((r) => r.by === "cavern"), CAVE_R = 31.6;
    const a0 = ringAngle(home.order) + SEG * 0.08;
    let far = a0;
    for (const r of caverns) { const p = this.planes.get(r.id); if (p) far = Math.min(far, ringAngle(p.order)); }
    if (caverns.length) {
      const down = curve([base, at(a0, 34.5, 0.25), at(a0 - 0.06, CAVE_R, 0.25)], 20);
      const track = arcPts(a0 - 0.06, far, CAVE_R, 0.25, 220);
      const list = [{ pts: down.concat(track.slice(1)), color: col, width: 2.6, gain: 1.2 }];
      const ends = [];
      for (const r of caverns) {
        const p = this.planes.get(r.id);
        if (!p) continue;
        list.push(this.portalRing(at(ringAngle(p.order), CAVE_R, 0.25), p.color, 0.9));
        ends.push(p.id);
      }
      this.part(flowLines(list.slice(0, 1), { dash: 0.7, speed: 2, gap: 6, fade: 1 }), l.id, [home.id, ...ends]);
      this.part(flowLines(list.slice(1), { pulse: 0 }), l.id, [home.id, ...ends]);
      samples.push(...track.filter((_, k) => k % 6 === 0));
    }
    // the slopes: a path from the mountain down through the Astral to the Prime
    for (const r of (l.reaches || []).filter((x) => x.by === "slope")) {
      const p = this.planes.get(r.id);
      if (!p) continue;
      const end = this.innerCenter.clone().add(V(ETHER_R * 0.5, 2.5, -ETHER_R * 0.4));
      const from = base.clone().add(V(0, H * 0.35, 0));
      const pts = bezier(from, from.clone().add(V(0, -6, 0)).multiplyScalar(0.92), end.clone().add(V(9, 18, -8)), end, 110);
      this.part(flowLines([{ pts, color: col, width: 1.8, gain: 0.9 }], { speed: 4, gap: 9, fade: 2 }), l.id, [home.id, r.id], 0.45);
      samples.push(...pts.filter((_, k) => k % 5 === 0));
    }
    this.items.push({ type: "link", id: l.id, l, world: base.clone().add(V(0, H * 0.5, 0)), r: 3.5, samples, ...this.fit(samples), labelAt: base.clone().add(V(0, H + 0.6, 0)), callout: 110, calloutAngle: -52 });
  }

  // the Infinite Staircase: a spiral stair of light (two rails, with a step between them every few
  // degrees) that rises from its site and fades out, without end
  buildStair(l) {
    const home = this.planes.get(l.home);
    const base = home ? wheelPoint(home.order, 35.5, 0.1, SEG * 0.26) : V(-40, -20, 20);
    const rise = 30, turns = 4, n = 320, col = l.color || "#dfe6f5";
    const inner = [], outer = [], rungs = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = t * TAU * turns, y = t * rise;
      inner.push(base.clone().add(V(Math.cos(a) * 0.55, y, Math.sin(a) * 0.55)));
      outer.push(base.clone().add(V(Math.cos(a) * 2.1, y + 0.25, Math.sin(a) * 2.1)));
      if (i % 4 === 0) rungs.push({ pts: [inner[i].clone(), outer[i].clone().add(V(0, -0.25, 0))], color: col, width: 1.3, gain: 0.8 * (1 - t) });
    }
    const g = new THREE.Group();
    g.add(flowLines([{ pts: inner, color: col, width: 1.2, gain: 0.55 }, { pts: outer, color: col, width: 1.5, gain: 0.8 }], { fade: 18, speed: 3, gap: 7 }));
    g.add(flowLines(rungs, { pulse: 0 }));
    this.part(g, l.id, home ? [home.id] : []);
    const samples = outer.filter((_, k) => k % 6 === 0 && k < n * 0.6);
    this.items.push({ type: "link", id: l.id, l, world: base.clone().add(V(0, 7, 0)), r: 2.5, samples, ...this.fit(samples), labelAt: base.clone().add(V(0, 12, 0)), callout: 200, calloutAngle: -20 });
  }

  setStars(on) { if (this.stars) this.stars.visible = on; }

  // ---------- focus, picking and the frame loop ----------
  focusOf() { return this.app.state.selected || this.hover; }

  updateFocus(dt) {
    const sel = this.app.state.selected, f = this.focusOf();
    const k = Math.min(1, dt * 7);
    for (const pt of this.parts) {
      let target = pt.rest;
      if (f) target = (f.type === "link" ? f.id === pt.link : pt.planes.has(f.id)) ? Math.max(1.35, pt.rest) : pt.rest * 0.3;
      pt.level += (target - pt.level) * k;
      for (const m of pt.mats) m.uniforms.level.value = pt.level;
      pt.mesh.visible = pt.level > 0.01;
    }
    const touched = f?.type === "link" ? linkPlanes(this.links.get(f.id) || {}, this.outer.map((p) => p.id)) : null;
    const fp = f?.type === "plane" ? this.planes.get(f.id) : null;
    for (const pane of this.panes) {
      const id = pane.p.id;
      const glow = sel?.id === id ? 1 : this.hover?.id === id ? 0.55 : touched?.has(id) ? 0.3 : 0;
      // a path in focus dims the planes it does not touch; an Outer Plane in focus dims the others a little
      const level = touched ? (touched.has(id) ? 1 : 0.55) : fp?.group === "outer" && fp.id !== id ? 0.75 : 1;
      pane.glow += (glow - pane.glow) * k;
      pane.level += (level - pane.level) * k;
      pane.mat.uniforms.glow.value = pane.glow;
      pane.mat.uniforms.level.value = pane.level;
    }
    if (this.hubMat) this.hubMat.uniforms.glow.value += ((sel?.id === "outlands" ? 1 : this.hover?.id === "outlands" ? 0.6 : 0) - this.hubMat.uniforms.glow.value) * k;
  }

  // The plane or path under a point of the screen: the paths first (they are thin), then the glass and the orbs.
  pick(x, y, camera) {
    const W = innerWidth, H = innerHeight, v = new THREE.Vector3();
    let best = null, bd = 9;
    for (const it of this.items) {
      if (it.type !== "link" || !it.samples?.length) continue;
      const pt = this.parts.find((p) => p.link === it.id);
      if (pt && pt.level < 0.05) continue;
      for (const p of it.samples) {
        v.copy(p).project(camera);
        if (v.z > 1) continue;
        const d = Math.hypot((v.x + 1) / 2 * W - x, (1 - v.y) / 2 * H - y);
        if (d < bd) { bd = d; best = it; }
      }
    }
    if (best) return { type: "link", id: best.id };
    this.ray.setFromCamera(new THREE.Vector2(x / W * 2 - 1, -(y / H) * 2 + 1), camera);
    const hit = this.ray.intersectObjects(this.pickables, false)[0];
    return hit ? { ...hit.object.userData.pick } : null;
  }

  setupComposer() {
    const r = this.app.renderer, size = r.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.app.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.8, 0.5, 0.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize(w, h) { RES.set(w / 2, h / 2); this.composer?.setSize(w, h); }

  update(day, dt, t) {
    const time = this.app.reducedMotion ? 0 : t;
    for (const f of this.anim) f(time, dt);
    for (const pt of this.parts) pt.mesh.traverse((o) => { if (o.material?.uniforms?.time) o.material.uniforms.time.value = time; });
    this.updateFocus(dt || 0.016);
  }

  render(renderer, camera) {
    if (this.composer) {
      this.composer.passes[0].camera = camera;
      this.composer.render();
    } else {
      renderer.clear();
      renderer.render(this.scene, camera);
    }
  }

  labelItems() {
    const out = [], sel = this.app.state.selected, cam = this.app.camera.position;
    const near = cam.distanceTo(this.innerCenter || V()) < 60;
    for (const it of this.items) {
      const isSel = sel && sel.id === it.id && sel.type === it.type;
      if (it.type === "plane") {
        const p = it.p;
        if (it.inner && p.group !== "prime" && !isSel && !near) continue;
        if (it.region) {
          out.push({ key: `plane:${p.id}`, text: p.name, world: it.world, r: 0, region: true, sel: isSel, prio: isSel ? 0 : 2.5 });
          continue;
        }
        const farPrime = p.group === "prime" && !near && !isSel;
        out.push({ key: `plane:${p.id}`, text: p.name, world: it.label || it.world, r: farPrime ? INNER_R * 0.92 : it.inner ? it.r : 0, color: p.color || "#cfd8ea", ring: !!it.inner && !farPrime, sel: isSel,
          below: !!it.below, outFrom: it.outward ? V(0, RIM_Y, 0) : null,
          sub: p.group === "prime" && !near && !isSel ? "and the Inner Planes" : "",
          dim: it.inner && !it.major && p.group !== "prime",
          prio: isSel ? 0 : p.group === "outer" ? 1 : ["hub", "city", "prime"].includes(p.group) ? 0.5 : it.major ? 1.8 : 2.2 });
      } else {
        if (it.noLabel && !isSel) continue;
        if (it.inner && !near && !isSel) continue;
        const c = new THREE.Color(it.l.color || "#cfd8ea").lerp(new THREE.Color("#ffffff"), 0.35);
        out.push({ key: `link:${it.l.id}`, text: it.l.name, world: it.labelAt || it.world, r: 0, tint: `#${c.getHexString()}`, flowLabel: !it.callout, callout: it.callout || 0, calloutAngle: it.calloutAngle, outFrom: it.callout ? V(0, RIM_Y, 0) : null, clickable: true, sel: isSel, prio: isSel ? 0 : it.callout ? 1.2 : 1.6 });
      }
    }
    return out;
  }

  frameDistance() { return 198; }
  frameTarget() { return V(0, -11, 0); }
  itemWorld(id) { return this.items.find((i) => i.id === id)?.world || null; }
}
