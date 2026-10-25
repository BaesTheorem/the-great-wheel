// A sphere that holds nothing but one thinking mass of computronium, pressed against its sealed
// shell. The mass is a displaced icosphere: fractal noise makes it churn, and a set of probes
// (tendrils, and one wide surge) reach out to the shell, flatten against the glass, then pull
// back and try another place. Each probe chooses its next target near its last one, so the mass
// searches the shell methodically. The surface shows circuit traces, pulses that run along them,
// blinking cells, and contour lines of a moving noise field (its thought).
//
// A ward layer just inside the shell answers each contact: it flares gold where a probe presses,
// sends a ripple out from the point of first contact, and keeps a fading scar there. Three bands
// of glyphs (the seal) circle the shell and brighten with the total strain.
//
// Everything is built at unit size (1 = the shell) and scaled to the shell radius each frame.
import * as THREE from "three";
import { radialTex, sprite, rng, hashStr, TAU } from "./gfx.js";

const PROBES = 8;     // the shader's array size: probe 0 is the surge, the rest are tendrils
const RIPPLES = 16;   // past contacts that still show (ripple, then scar)

const NOISE = `
float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

const MASS_VERT = `
uniform float time;
uniform vec4 probes[${PROBES}];   // xyz: unit direction, w: reach (0 = home, 1 = touches the shell, more = pressed flat)
uniform float widths[${PROBES}];  // angular half-width of each probe, radians
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
varying float vReach;
varying float vR;
${NOISE}
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float field(vec3 d, out float reach) {
  float r = 0.42 + 0.14 * fbm(d * 1.7 + vec3(0.0, time * 0.06, time * 0.045)) + 0.035 * fbm(d * 6.0 - vec3(time * 0.18));
  reach = 0.0;
  for (int i = 0; i < ${PROBES}; i++) {
    float e = probes[i].w;
    if (e <= 0.001) continue;
    float ang = acos(clamp(dot(d, probes[i].xyz), -1.0, 1.0));
    float w = widths[i];
    // a tendril has a narrow core on a wider foot; it ripples as it reaches
    float wob = 1.0 + 0.25 * sin(ang * 40.0 - time * 5.0 + float(i));
    float core = exp(-pow(ang / (w * wob), 2.0));
    float foot = 0.3 * exp(-pow(ang / (w * 3.2), 2.0));
    float k = (core + foot) * e;
    r += k * (1.04 - r);
    reach = max(reach, core * min(e, 1.0));
  }
  // the glass stops it: a lobe that reaches the shell flattens and spreads on it
  return smin(r, 0.982, 0.035);
}
void main() {
  vec3 d = normalize(position);
  vec3 t1 = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0))), t2 = cross(d, t1);
  float reach, ra, rb;
  float r = field(d, reach);
  const float E = 0.006;
  vec3 da = normalize(d + t1 * E), db = normalize(d + t2 * E);
  vec3 p = d * r, pa = da * field(da, ra), pb = db * field(db, rb);
  vec3 n = normalize(cross(pa - p, pb - p));
  if (dot(n, d) < 0.0) n = -n;
  vObj = p; vReach = reach; vR = r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * n);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const MASS_FRAG = `
uniform float time;
uniform vec3 trace;   // circuit light
uniform vec3 hot;     // the strain at a probe's tip
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
varying float vReach;
varying float vR;
${NOISE}
// circuit lines on the face of the cube that the point projects to
float lines(vec3 p, float s, out vec3 cell) {
  vec3 a = abs(normalize(p));
  vec2 uv = a.x > a.y && a.x > a.z ? p.yz : a.y > a.z ? p.xz : p.xy;
  uv *= s;
  vec2 g = abs(fract(uv) - 0.5);
  cell = vec3(floor(uv), a.x > a.y && a.x > a.z ? 1.0 : a.y > a.z ? 2.0 : 3.0);
  return 1.0 - smoothstep(0.0, 0.035, 0.5 - max(g.x, g.y));
}
void main() {
  vec3 n = normalize(vN), v = normalize(vV);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 L = normalize(vec3(-0.4, 0.75, 0.55));
  float dif = 0.5 + 0.5 * dot(n, L);
  float spec = pow(max(dot(n, normalize(L + v)), 0.0), 60.0);
  // dark graphite, lit a little, darker in the deep folds
  float depth = smoothstep(0.3, 0.75, vR);
  vec3 col = vec3(0.028, 0.032, 0.042) * (0.4 + 0.9 * dif) * (0.35 + 0.65 * depth) + vec3(0.5, 0.6, 0.7) * spec * 0.25;

  vec3 c1, c2;
  float g1 = lines(vObj, 9.0, c1), g2 = lines(vObj, 31.0, c2);
  // pulses run along the traces
  float run = pow(0.5 + 0.5 * sin(dot(vObj, vec3(23.0, 17.0, 29.0)) - time * 3.5), 10.0);
  float run2 = pow(0.5 + 0.5 * sin(dot(vObj, vec3(-41.0, 37.0, 13.0)) - time * 5.1), 14.0);
  // thought: contour lines of a noise field that moves through the mass
  float th = fbm(vObj * 2.6 + vec3(time * 0.11, -time * 0.07, time * 0.05));
  float contour = smoothstep(0.455, 0.49, abs(fract(th * 7.0 - time * 0.22) - 0.5));
  // cells that blink, as on a board
  float hc = h31(c2 + 3.1);
  float blink = step(0.965, hc) * step(0.5, fract(hc * 91.0 + time * (0.4 + hc)));

  float lit = g1 * (0.1 + 1.4 * run) + g2 * (0.03 + 0.8 * run2) + contour * 0.7 + blink * 1.4;
  col += trace * lit * (0.25 + 0.75 * depth);
  // the strain of a reach: the tendril glows hotter toward the tip
  float strain = smoothstep(0.2, 1.0, vReach);
  col += hot * strain * (0.35 + 0.9 * g2 + 0.6 * run) ;
  col += mix(trace, hot, strain) * pow(1.0 - ndv, 3.0) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

const WARD_VERT = `
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
void main() {
  vObj = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const WARD_FRAG = `
uniform float time;
uniform vec3 ward;
uniform float strain;                 // all contacts together, 0..1
uniform vec4 contacts[${PROBES}];      // xyz direction, w press strength now
uniform vec4 ripples[${RIPPLES}];      // xyz direction of a first contact, w age in seconds (< 0 = empty)
uniform vec3 bands[3];                // the axes of the three seal bands
varying vec3 vObj;
varying vec3 vN;
varying vec3 vV;
${NOISE}
// distance to the edge of the nearest cell of a hex grid
float hexEdge(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5, b = mod(p - s * 0.5, s) - s * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  g = abs(g);
  return 0.5 - max(dot(g, s * 0.5), g.x);
}
void main() {
  vec3 n = normalize(vObj);
  vec3 a = abs(n);
  vec2 uv = a.x > a.y && a.x > a.z ? n.yz : a.y > a.z ? n.xz : n.xy;
  float hex = 1.0 - smoothstep(0.0, 0.03, hexEdge(uv * 26.0));
  float glow = 0.0, ring = 0.0, scar = 0.0;
  for (int i = 0; i < ${PROBES}; i++) {
    if (contacts[i].w <= 0.0) continue;
    float ang = acos(clamp(dot(n, contacts[i].xyz), -1.0, 1.0));
    glow += contacts[i].w * exp(-pow(ang / 0.16, 2.0));
  }
  for (int i = 0; i < ${RIPPLES}; i++) {
    float age = ripples[i].w;
    if (age < 0.0) continue;
    float ang = acos(clamp(dot(n, ripples[i].xyz), -1.0, 1.0));
    ring += exp(-pow((ang - age * 0.32) / 0.018, 2.0)) * exp(-age * 0.9);
    scar += exp(-pow(ang / 0.05, 2.0)) * exp(-age * 0.05);
  }
  // the seal: three bands of glyphs around the shell
  float seal = 0.0;
  for (int i = 0; i < 3; i++) {
    float y = dot(n, bands[i]);
    vec3 u = normalize(cross(bands[i], abs(bands[i].y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
    float lon = atan(dot(n, cross(bands[i], u)), dot(n, u));
    float k = lon * 70.0 + float(i) * 17.0;
    float glyph = step(0.35, h31(vec3(floor(k), floor(y * 900.0 / 6.0), float(i)))) * step(0.18, fract(k));
    float band = 1.0 - smoothstep(0.004, 0.012, abs(y));
    float edge = 1.0 - smoothstep(0.0, 0.0018, abs(abs(y) - 0.015));
    seal += band * glyph + edge * 0.8;
  }
  float flick = 0.85 + 0.15 * vnoise(n * 8.0 + time * 1.5);
  float k = 0.012 + hex * (0.02 + glow * 1.5 + ring * 1.2) + glow * 0.45 + ring * 0.5 + scar * (0.12 + 0.25 * hex)
          + seal * (0.1 + 0.5 * strain) * flick;
  // the glass faces the camera: a little rim light, as on the crystal shell
  float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0);
  gl_FragColor = vec4(ward * k + ward * fr * 0.05 * (1.0 + strain), 1.0);
}`;

// One probe: home -> reach -> press -> recoil -> home, then a new target near the last one.
class Probe {
  constructor(R, surge) {
    this.R = R;
    this.surge = surge;
    this.dir = randomDir(R);
    this.e = 0;
    this.state = "home";
    this.t = 0;
    this.dur = R() * 3;
    this.width = surge ? 0.5 + R() * 0.15 : 0.05 + R() * 0.07;
    this.touched = false;
  }
  step(dt, onContact) {
    const R = this.R, s = this.surge ? 1.9 : 1;
    this.t += dt;
    const k = Math.min(this.t / this.dur, 1);
    if (this.state === "home") {
      this.e = 0;
      if (k >= 1) {
        this.next();
        this.go("reach", (2.2 + R() * 2.8) * s);
      }
    } else if (this.state === "reach") {
      this.e = 1.06 * easeInOut(k);
      if (!this.touched && this.e > 0.96) { this.touched = true; onContact(this.dir); }
      if (k >= 1) this.go("press", (1.4 + R() * 2.4) * s);
    } else if (this.state === "press") {
      // it shoves, eases off, shoves again
      this.e = 1.06 + 0.1 * Math.max(0, Math.sin(this.t * (this.surge ? 3 : 7))) + 0.04 * Math.sin(this.t * 23);
      if (k >= 1) this.go("recoil", (0.8 + R() * 1.4) * s);
    } else {
      this.e = 1.06 * (1 - easeOut(k));
      if (k >= 1) this.go("home", 0.4 + R() * 2.6);
    }
  }
  go(state, dur) { this.state = state; this.t = 0; this.dur = dur; if (state === "reach") this.touched = false; }
  // most of the time it tries a place close to the last one (it searches the shell in order);
  // sometimes it jumps to a new region
  next() {
    const R = this.R;
    if (R() < 0.7) {
      const axis = randomDir(R).cross(this.dir).normalize();
      this.dir.applyAxisAngle(axis, 0.18 + R() * 0.35).normalize();
    } else this.dir = randomDir(R);
  }
  pressure() { return Math.max(0, Math.min(1, (this.e - 0.94) / 0.14)); }
}

function randomDir(R) {
  const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(Math.cos(a) * s, u, Math.sin(a) * s);
}
const easeInOut = (k) => k * k * (3 - 2 * k);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// Fill a node (from bodies.js) with the mass and the ward layer.
export function computronium(node, b) {
  const look = b.look?.computronium || {};
  const R = rng(hashStr(b.id + "probes"));
  const phone = innerWidth < 760;
  const probes = [new Probe(R, true), ...Array.from({ length: PROBES - 1 }, () => new Probe(R, false))];
  const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 1, 0, -1));
  let nextRipple = 0;

  const massU = {
    time: { value: 0 },
    probes: { value: probes.map(() => new THREE.Vector4()) },
    widths: { value: probes.map((p) => p.width) },
    trace: { value: new THREE.Color(look.trace || b.look?.color || "#5ff0ff") },
    hot: { value: new THREE.Color(look.hot || "#d27bff") },
  };
  const mass = new THREE.Mesh(new THREE.IcosahedronGeometry(1, phone ? 56 : 96), new THREE.ShaderMaterial({ uniforms: massU, vertexShader: MASS_VERT, fragmentShader: MASS_FRAG, toneMapped: false }));
  mass.frustumCulled = false;   // the shader moves the vertices out to the shell

  const bandR = rng(hashStr(b.id + "seal"));
  const wardU = {
    time: { value: 0 },
    ward: { value: new THREE.Color(look.ward || "#ffcf73") },
    strain: { value: 0 },
    contacts: { value: probes.map(() => new THREE.Vector4()) },
    ripples: { value: ripples },
    bands: { value: [0, 1, 2].map(() => randomDir(bandR)) },
  };
  const wardLayer = new THREE.Mesh(new THREE.SphereGeometry(0.994, 160, 120), new THREE.ShaderMaterial({
    uniforms: wardU, vertexShader: WARD_VERT, fragmentShader: WARD_FRAG,
    side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));

  const tr = massU.trace.value;
  const c = (a) => `rgba(${Math.round(tr.r * 255)},${Math.round(tr.g * 255)},${Math.round(tr.b * 255)},${a})`;
  const halo = sprite(radialTex([[0, c(0.16)], [0.45, c(0.07)], [1, "rgba(0,0,0,0)"]], 256), 2.1);

  const unit = new THREE.Group();
  unit.add(mass, wardLayer, halo);
  node.pivot.add(unit);
  node.mesh = mass;
  node.noSpin = true;

  let clock = 0;
  node.update = ({ dtReal, view }) => {
    const Rv = view.R;
    unit.scale.setScalar(Rv);
    node.extent = Rv * 0.9;
    node.frameR = Rv * 0.42;
    node.labelR = Rv * 0.62;
    // the mass never rests: it runs on its own clock, not the calendar (slow with reduced motion)
    const dt = Math.min(dtReal || 0, 0.1) * (view.app.reducedMotion ? 0.2 : 1);
    clock += dt;
    let strain = 0;
    probes.forEach((p, i) => {
      p.step(dt, (dir) => {
        ripples[nextRipple].set(dir.x, dir.y, dir.z, 0);
        nextRipple = (nextRipple + 1) % RIPPLES;
      });
      massU.probes.value[i].set(p.dir.x, p.dir.y, p.dir.z, p.e);
      const pr = p.pressure() * (p.surge ? 1.6 : 1);
      wardU.contacts.value[i].set(p.dir.x, p.dir.y, p.dir.z, pr);
      strain += pr;
    });
    for (const r of ripples) if (r.w >= 0) r.w = r.w > 90 ? -1 : r.w + dt;
    massU.time.value = wardU.time.value = clock;
    wardU.strain.value = Math.min(1, strain / 2.5);
  };
  return node;
}
