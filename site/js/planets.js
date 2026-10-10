// Painted worlds. A world with "look.proc" gets a surface made on the GPU from 3D noise, once,
// when the sphere loads: the shader draws the whole globe into an equirectangular texture
// (the same layout as a texture file), so a world costs no more per frame than a photo map.
// Styles: terran (seas, land, ice caps), ocean, jungle, desert, ice, lava, gas (a banded giant),
// cloud (an air world), rock, crystal and living. Each style has default colors; look.proc.palette
// changes them. Worlds can also have a cloud layer (look.proc.clouds, 0 to 1). A terran world can
// take its coastlines from a published map: look.proc.mask is an equirectangular image, red for
// land and green for lava (tools/maps/mask.py makes one), and the noise adds the coast's detail and
// the terrain inside it.
//
// The simplex noise is by Ian McEwan and Stefan Gustavson (Ashima Arts, webgl-noise, MIT license):
// https://github.com/ashima/webgl-noise
import * as THREE from "three";
import { hashStr, rng } from "./gfx.js";

const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// mode: 0 color, 1 glow (emissive), 2 roughness, 3 cloud cover
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float style, sea, ice, warp, bands, scale, mode, octaves, clouds, isFlat, hasMask;
uniform sampler2D mask;
uniform vec3 seed;
uniform vec3 pal[6];
${NOISE}
float fbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (float(i) >= octaves) break; v += a * snoise(p); p = p * 2.03 + vec3(11.7, 3.1, 7.9); a *= 0.5; }
  return v;
}
float ridged(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) { if (float(i) >= octaves) break; float n = 1.0 - abs(snoise(p)); v += a * n * n; p = p * 2.07 + vec3(5.3, 9.1, 1.7); a *= 0.5; }
  return v;
}
// distance to the nearest of a few random cell centers (for crystal facets)
vec2 cells(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = fract(sin(vec3(dot(i + o, vec3(127.1, 311.7, 74.7)), dot(i + o, vec3(269.5, 183.3, 246.1)), dot(i + o, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
    float d = length(o + h - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
void main() {
  vec3 d;
  float lat;
  if (isFlat > 0.5) {
    // the top of a flat world: the disc is the texture's square, its rim at radius 1
    vec2 xy = vUv * 2.0 - 1.0;
    d = normalize(vec3(xy.x, 0.6, xy.y));
    lat = length(xy);
  } else {
    float phi = vUv.x * 6.28318530718, th = (1.0 - vUv.y) * 3.14159265359;
    d = vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
    lat = abs(d.y);
  }
  vec3 p = d * scale + seed;
  vec3 q = p + warp * vec3(fbm(p + 3.1), fbm(p + 7.7), fbm(p + 13.3));
  vec3 col = pal[0];
  float glow = 0.0, rough = 0.92, burn = 0.0;
  if (style < 0.5) {
    // terran: seas, coasts, lowland and dry land by moisture, highlands and snow, polar ice
    float e = fbm(q) * 0.5 + 0.5;
    if (hasMask > 0.5) {
      // the map gives land and sea; the noise gives the coast its detail and the land its relief
      vec3 m = texture2D(mask, vUv).rgb;
      e = sea + (m.r - 0.5) * 0.62 + (e - 0.5) * 0.24;
      burn = m.g;
    }
    float wet = fbm(q * 0.6 + 40.0) * 0.5 + 0.5;
    if (e < sea) {
      col = mix(pal[0], pal[1], smoothstep(sea - 0.2, sea, e));
      rough = 0.22;
    } else {
      float h = (e - sea) / max(1.0 - sea, 0.01);
      vec3 land = mix(pal[3], pal[2], smoothstep(0.35, 0.65, wet + (0.5 - lat) * 0.25));
      col = mix(land, pal[4], smoothstep(0.35, 0.9, h));
      col = mix(col, mix(pal[1], pal[3], 0.6), (1.0 - smoothstep(0.0, 0.04, h)) * 0.45);
      col = mix(col, pal[5], smoothstep(0.82, 0.95, h) * 0.85);
    }
    if (burn > 0.02) {
      // a sea of fire (Krynn's Great Burning Sea): dark crust, glowing cracks
      float r = ridged(q * 3.0);
      vec3 fire = mix(vec3(0.22, 0.04, 0.02), vec3(1.0, 0.42, 0.08), smoothstep(0.55, 0.9, r));
      col = mix(col, fire, smoothstep(0.1, 0.6, burn));
      glow = smoothstep(0.1, 0.6, burn) * smoothstep(0.6, 0.92, r);
      rough = mix(rough, 0.8, burn);
    }
    float cap = smoothstep(1.0 - ice - 0.05, 1.0 - ice + 0.05, lat + fbm(q * 2.3 + 9.0) * 0.07);
    if (ice > 0.001) { col = mix(col, pal[5], cap); rough = mix(rough, 0.55, cap); }
  } else if (style < 1.5) {
    // gas giant: bands bent by turbulence, fine streaks, a few storms
    float y = d.y + warp * 0.12 * fbm(vec3(d.x * 1.5, d.y * 4.0, d.z * 1.5) * scale + seed);
    float t = y * bands;
    float b1 = sin(t * 3.14159) * 0.5 + 0.5;
    float b2 = sin(t * 1.37 * 3.14159 + 1.3 + fbm(q * 0.8) * 1.5) * 0.5 + 0.5;
    col = mix(mix(pal[0], pal[1], b1), mix(pal[2], pal[3], b2), smoothstep(0.25, 0.75, fbm(vec3(t * 0.7, 0.3, 0.9) + seed) * 0.5 + 0.5));
    col *= 0.88 + 0.22 * (snoise(vec3(d.x * 2.0, y * 70.0, d.z * 2.0) + seed) * 0.5 + 0.5);
    for (int k = 0; k < 3; k++) {
      vec3 c = normalize(vec3(sin(seed.x + float(k) * 2.4), (fract(seed.y * 0.37 + float(k) * 0.31) - 0.5) * 1.1, cos(seed.x + float(k) * 2.4)));
      float s = smoothstep(0.16 - float(k) * 0.04, 0.0, length((d - c) * vec3(1.0, 2.2, 1.0)));
      col = mix(col, mix(pal[4], pal[5], s), s * 0.85);
    }
    col = mix(col, pal[2] * 0.6, smoothstep(0.75, 1.0, lat) * 0.5);
    rough = 1.0;
  } else if (style < 2.5) {
    // desert: sand seas with dune lines, rock plateaus, dry beds, pale caps
    float e = fbm(q) * 0.5 + 0.5;
    float dunes = sin((d.x * 3.0 + d.z * 2.0) * 22.0 * scale + fbm(q * 3.0) * 7.0) * 0.5 + 0.5;
    col = mix(pal[0], pal[1], smoothstep(0.3, 0.7, e));
    col *= 0.92 + 0.08 * dunes;
    col = mix(col, pal[2], smoothstep(0.62, 0.8, ridged(q * 1.4 + 2.0)));
    col = mix(col, pal[3], smoothstep(0.42, 0.3, e) * 0.6);
    if (ice > 0.001) col = mix(col, pal[4], smoothstep(1.0 - ice - 0.04, 1.0 - ice + 0.04, lat + fbm(q * 2.0) * 0.06));
  } else if (style < 3.5) {
    // ice: snowfields with blue cracks and darker ice
    float e = fbm(q) * 0.5 + 0.5;
    float cracks = smoothstep(0.86, 0.97, ridged(q * 1.7 + 5.0));
    col = mix(pal[0], pal[1], smoothstep(0.3, 0.75, e));
    col = mix(col, pal[2], cracks * 0.85);
    col = mix(col, pal[3], smoothstep(0.62, 0.8, fbm(q * 0.5 + 17.0) * 0.5 + 0.5) * 0.4);
    rough = 0.4;
  } else if (style < 4.5) {
    // lava: a dark crust broken by glowing rivers and fields
    float e = fbm(q) * 0.5 + 0.5;
    float r = ridged(q * 1.25);
    glow = smoothstep(0.72, 0.95, r) * (0.55 + 0.45 * e) + smoothstep(0.3, 0.18, e) * 0.6;
    glow = clamp(glow, 0.0, 1.0);
    col = mix(pal[0], pal[1], e) * (1.0 - glow * 0.6) + pal[2] * glow * 0.6;
    rough = 0.85;
  } else if (style < 5.5) {
    // cloud world: thick, swirled clouds with darker lanes
    float e = fbm(q * 1.1) * 0.5 + 0.5;
    float sw = fbm(q * 2.6 + fbm(q * 1.7) * 2.2) * 0.5 + 0.5;
    col = mix(mix(pal[0], pal[1], smoothstep(0.3, 0.7, e)), pal[2], smoothstep(0.55, 0.85, sw));
    col = mix(col, pal[3], smoothstep(0.32, 0.18, sw) * 0.6);
    rough = 1.0;
  } else if (style < 6.5) {
    // rock: bare stone, maria and bright ejecta lines
    float e = fbm(q) * 0.5 + 0.5;
    float rims = smoothstep(0.08, 0.0, abs(snoise(q * 3.5)));
    col = mix(pal[0], pal[1], smoothstep(0.35, 0.7, e));
    col = mix(col, pal[2], smoothstep(0.66, 0.85, fbm(q * 0.7 + 21.0) * 0.5 + 0.5) * 0.7);
    col *= 0.9 + 0.12 * rims;
  } else if (style < 7.5) {
    // crystal: flat facets with bright edges
    vec2 c = cells(q * 2.2);
    float edge = smoothstep(0.08, 0.0, c.y - c.x);
    float facet = fract(sin(dot(floor(q * 2.2), vec3(7.1, 3.3, 5.7))) * 437.5);
    col = mix(pal[0], pal[1], facet);
    col = mix(col, pal[2], edge);
    glow = edge * 0.35;
    rough = 0.15;
  } else {
    // living: tissue with veins
    float e = fbm(q) * 0.5 + 0.5;
    float veins = smoothstep(0.9, 0.98, ridged(q * 1.5 + 3.0));
    col = mix(pal[0], pal[1], smoothstep(0.3, 0.75, e));
    col = mix(col, pal[2], veins);
    glow = veins * 0.25;
    rough = 0.55;
  }
  if (isFlat > 0.5) col *= smoothstep(1.02, 0.97, lat);
  if (mode < 0.5) gl_FragColor = vec4(col, 1.0);
  else if (mode < 1.5) gl_FragColor = vec4((burn > 0.02 ? vec3(1.0, 0.45, 0.12) : pal[2]) * glow, 1.0);
  else if (mode < 2.5) gl_FragColor = vec4(vec3(rough), 1.0);
  else {
    float c = fbm(p * 1.6 + vec3(31.0) + warp * 0.6 * vec3(fbm(p * 2.0 + 5.0), fbm(p * 2.0 + 9.0), 0.0)) * 0.5 + 0.5;
    float a = smoothstep(1.0 - clouds, 1.0 - clouds + 0.25, c);
    gl_FragColor = vec4(vec3(a), 1.0);
  }
}`;

const STYLES = ["terran", "gas", "desert", "ice", "lava", "cloud", "rock", "crystal", "living"];

// Default colors per style: [deep, shallow, green, dry, high, snow] for terran and the others in
// the order the shader uses them.
const PALETTES = {
  terran: ["#0c2b57", "#2c74b8", "#4c7a3a", "#a89260", "#7d7062", "#eef3fa"],
  ocean: ["#0a2858", "#2f88cc", "#5a8a45", "#a8915a", "#7a7064", "#f0f6ff"],
  jungle: ["#0d3550", "#2a7a8a", "#1f5d26", "#4a7a2c", "#4f5a3c", "#e6efe6"],
  gas: ["#d8b48c", "#a77a53", "#efdcc2", "#8d5d3e", "#c9643c", "#f2d0b0"],
  desert: ["#c9985a", "#e4c58c", "#8a5c3c", "#a87a52", "#f2ead8", "#ffffff"],
  ice: ["#e6eef8", "#b3cbe6", "#4d78a8", "#8fb0d6", "#ffffff", "#ffffff"],
  lava: ["#180e0b", "#3c251a", "#ff7a1c", "#ffb347", "#ffffff", "#ffffff"],
  cloud: ["#e9e6f2", "#b9b2d2", "#ffffff", "#8a84a8", "#ffffff", "#ffffff"],
  rock: ["#8a857f", "#5e5954", "#b9b3aa", "#ffffff", "#ffffff", "#ffffff"],
  crystal: ["#bfe6ff", "#6aa8d8", "#ffffff", "#ffffff", "#ffffff", "#ffffff"],
  living: ["#7a3b3b", "#b0605a", "#e8b0a0", "#ffffff", "#ffffff", "#ffffff"],
};
const DEFAULTS = {
  terran: { sea: 0.55, ice: 0.12, warp: 0.55, scale: 1.5 },
  ocean: { sea: 0.78, ice: 0.1, warp: 0.6, scale: 1.7 },
  jungle: { sea: 0.4, ice: 0.0, warp: 0.6, scale: 1.6 },
  gas: { bands: 7, warp: 0.8, scale: 1.4 },
  desert: { ice: 0.05, warp: 0.5, scale: 1.3 },
  ice: { warp: 0.5, scale: 1.4 },
  lava: { warp: 0.7, scale: 1.6 },
  cloud: { warp: 0.9, scale: 1.3 },
  rock: { warp: 0.4, scale: 1.8 },
  crystal: { warp: 0.2, scale: 1.0 },
  living: { warp: 0.8, scale: 1.4 },
};

let bakeScene = null, bakeCam = null, bakeMat = null;
const live = new Set();   // the render targets of the worlds in the open sphere (freed when it closes)
function setup() {
  if (bakeScene) return;
  bakeMat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      style: { value: 0 }, sea: { value: 0.5 }, ice: { value: 0 }, warp: { value: 0.5 }, bands: { value: 7 }, scale: { value: 1.5 },
      mode: { value: 0 }, octaves: { value: 7 }, clouds: { value: 0 }, isFlat: { value: 0 }, seed: { value: new THREE.Vector3() },
      hasMask: { value: 0 }, mask: { value: null },
      pal: { value: Array.from({ length: 6 }, () => new THREE.Color()) },
    },
  });
  bakeScene = new THREE.Scene();
  bakeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat));
  bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

// look.proc.sea is the fraction of the globe under water. The shader compares the terrain noise
// with a sea level, and that noise spreads around 0.52 (about 0.13 wide, close to a normal curve),
// so the level for a fraction comes from the inverse normal curve (here its logistic approximation).
function seaLevel(f) {
  if (f <= 0.005) return -1;
  if (f >= 0.995) return 2;
  return 0.52 + 0.13 * (Math.log(f / (1 - f)) / 1.702);
}

// The settings a world's look gives, filled in with the style's defaults.
export function procSettings(look, id) {
  const pr = look.proc || {};
  const name = pr.style || "terran";
  const base = DEFAULTS[name] || DEFAULTS.terran;
  const pal = (PALETTES[name] || PALETTES.terran).map((c, i) => pr.palette?.[i] || c);
  const R = rng(hashStr(id + (pr.seed ?? "")));
  return {
    style: name === "ocean" || name === "jungle" ? 0 : Math.max(0, STYLES.indexOf(name)),
    sea: seaLevel(pr.sea ?? base.sea ?? 0.5), ice: pr.ice ?? base.ice ?? 0, warp: pr.warp ?? base.warp ?? 0.5,
    bands: pr.bands ?? base.bands ?? 7, scale: pr.scale ?? base.scale ?? 1.5, clouds: pr.clouds ?? 0,
    seed: new THREE.Vector3(R() * 100, R() * 100, R() * 100), pal, mask: maskCache.get(pr.mask) || null,
  };
}

// The land masks of worlds with look.proc.mask, loaded before the world is painted.
const maskCache = new Map();
export async function loadMask(url) {
  if (!url || maskCache.has(url)) return maskCache.get(url) || null;
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
  if (!im) { maskCache.set(url, null); return null; }
  const t = new THREE.Texture(im);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  maskCache.set(url, t);
  return t;
}

function bake(renderer, s, mode, w, h, flat = false) {
  setup();
  const u = bakeMat.uniforms;
  u.style.value = s.style; u.sea.value = s.sea; u.ice.value = s.ice; u.warp.value = s.warp; u.bands.value = s.bands;
  u.scale.value = s.scale; u.clouds.value = s.clouds; u.mode.value = mode; u.isFlat.value = flat ? 1 : 0; u.seed.value.copy(s.seed);
  u.hasMask.value = s.mask && !flat ? 1 : 0; u.mask.value = s.mask || null;
  u.octaves.value = innerWidth < 760 ? 6 : 7;
  s.pal.forEach((c, i) => u.pal.value[i].set(c));
  const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: mode === 0 || mode === 1 ? THREE.SRGBColorSpace : THREE.NoColorSpace, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
  const prev = renderer.getRenderTarget(), prevTone = renderer.toneMapping, prevAuto = renderer.autoClear;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.render(bakeScene, bakeCam);
  renderer.setRenderTarget(prev);
  renderer.toneMapping = prevTone;
  renderer.autoClear = prevAuto;
  rt.texture.anisotropy = 8;
  live.add(rt);
  return rt.texture;
}

// Free the GPU memory of every painted world (the sphere view calls this when it closes).
export function disposeBaked() {
  for (const rt of live) rt.dispose();
  live.clear();
}

// The maps for a world: { map, emissiveMap?, roughnessMap?, cloudMap? }.
export function bakeWorld(renderer, look, id, { big = false, flat = false } = {}) {
  const s = procSettings(look, id);
  const phone = innerWidth < 760;
  const w = flat ? (big && !phone ? 1536 : 1024) : big ? (phone ? 1024 : 2048) : phone ? 512 : 1024, h = flat ? w : w / 2;
  const out = { map: bake(renderer, s, 0, w, h, flat) };
  const name = look.proc?.style || "terran";
  if (["lava", "crystal", "living"].includes(name) || (s.mask && look.proc?.lava)) out.emissiveMap = bake(renderer, s, 1, w, h, flat);
  if (["terran", "ocean", "jungle", "ice", "crystal"].includes(name)) out.roughnessMap = bake(renderer, s, 2, w / 2, h / 2, flat);
  if (s.clouds > 0 && !flat) out.cloudMap = bake(renderer, s, 3, w, h);
  return out;
}
