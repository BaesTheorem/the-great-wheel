// A black hole drawn by ray tracing, in a camera-facing quad around it. Each pixel follows a light
// ray along its Schwarzschild orbit (the Binet equation u'' = -u + 1.5 u^2, in units of the
// Schwarzschild radius), so light bends around the hole: the far side of the accretion disk shows
// above and below the shadow, and a thin photon ring circles it. Rays that fall below the event
// horizon stay black. Rays that escape continue in a straight line to the crystal shell and take
// their color from a cube map of the sphere, so the stars behind the hole are lensed. The disk is
// brighter on the side that moves toward the camera (relativistic beaming).
//
// The method (integrate u(phi) in the plane of each ray) follows Otto Seiskari's black-hole ray
// tracer, https://github.com/oseiskar/black-hole (MIT license).
import * as THREE from "three";

const VERT = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = `
precision highp float;
#define PI 3.141592653589793
uniform vec3 camPos;        // world
uniform vec3 center;        // world
uniform float rs;           // Schwarzschild radius in world units
uniform float reach;        // radius of the ray-traced region, in rs
uniform float shellR;       // radius of the crystal shell, in rs
uniform vec3 diskN;         // disk normal (world, unit)
uniform vec3 diskX;         // a unit vector in the disk plane, for the disk's angle
uniform float diskIn;       // inner edge of the disk, in rs
uniform float diskOut;      // outer edge of the disk, in rs
uniform vec3 hot;           // disk color near the inner edge
uniform vec3 cool;          // disk color near the outer edge
uniform float glow;         // disk brightness
uniform float time;
uniform samplerCube sky;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// The disk's own light at radius r and angle a: a sharp, hot inner edge, cooling and fading
// outward (about r^-2.4), with streaks drawn out along the orbit; the inner gas orbits faster
// (Kepler: angular speed ~ r^-1.5), so the streaks shear as they turn.
vec3 diskEmission(float r, float a) {
  float x = (r - diskIn) / (diskOut - diskIn);
  float spin = a + time * 0.5 * pow(diskIn / r, 1.5);
  vec2 q = vec2(cos(spin), sin(spin));   // the angle as a point on a circle, so the pattern has no seam
  float rings = noise(q * 1.6 + vec2(r * 9.0, r * 2.3)) * 0.65 + noise(q * 3.2 + vec2(r * 23.0, 7.0)) * 0.35;
  float clumps = 0.6 + 0.4 * noise(q * 4.5 + vec2(r * 1.3, 3.0));
  float detail = mix(0.35, 1.25, rings) * clumps;
  float edge = smoothstep(0.0, 0.025, x) * (1.0 - smoothstep(0.55, 1.0, x));
  vec3 c = mix(hot, cool, smoothstep(0.0, 0.85, pow(clamp(x, 0.0, 1.0), 0.55)));
  return c * detail * edge * glow * pow(diskIn / r, 2.4);
}

void main() {
  vec3 dir = normalize(vWorld - camPos);
  vec3 o = (camPos - center) / rs;            // camera in black-hole units
  // where the ray enters the traced region (a sphere of radius reach)
  float b = dot(o, dir), c = dot(o, o) - reach * reach, disc = b * b - c;
  if (disc < 0.0) discard;
  float tEnter = max(-b - sqrt(disc), 0.0);
  vec3 pos = o + dir * tEnter;

  // the ray's plane: radial unit n and tangent t, with u = 1/r as a function of the angle phi
  vec3 n = normalize(pos);
  vec3 tg = cross(cross(n, dir), n);
  float tl = length(tg);
  if (tl < 1e-5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }   // straight at the hole
  tg /= tl;
  float u = 1.0 / length(pos);
  float du = -dot(dir, n) / dot(dir, tg) * u;
  float phi = 0.0;

  vec3 color = vec3(0.0);
  float through = 1.0;        // how much light still passes (the disk is partly opaque)
  vec3 old = pos;
  bool escaped = false;
  vec3 outDir = dir;
  const int STEPS = {{STEPS}};
  for (int i = 0; i < STEPS; i++) {
    float h = 0.035;
    // shorter steps near the hole, where the path bends most
    h = min(h, 0.012 + 0.08 * (1.0 - min(u * 1.5, 1.0)));
    // leapfrog step of u'' = -u + 1.5 u^2
    u += du * h;
    du += (-u + 1.5 * u * u) * h;
    phi += h;
    if (u <= 0.0 || (u < 1.0 / reach && du < 0.0)) { escaped = true; break; }
    vec3 p = (cos(phi) * n + sin(phi) * tg) / u;
    // crossing of the disk plane
    float s0 = dot(old, diskN), s1 = dot(p, diskN);
    if (s0 * s1 < 0.0) {
      vec3 hit = mix(old, p, s0 / (s0 - s1));
      float r = length(hit);
      if (r > diskIn && r < diskOut) {
        vec3 ray = normalize(p - old);
        // orbital velocity of the gas (fraction of c), and the Doppler factor toward the camera
        vec3 vdir = normalize(cross(diskN, hit));
        float speed = min(sqrt(0.5 / max(r - 1.0, 0.05)), 0.7);
        float g = 1.0 / sqrt(1.0 - speed * speed);
        float dop = g * (1.0 + dot(ray, vdir * speed));
        float beam = 1.0 / (dop * dop * dop);
        float a = atan(dot(hit, cross(diskN, diskX)), dot(hit, diskX));
        vec3 e = diskEmission(r, a) * beam * sqrt(max(1.0 - 1.0 / r, 0.0));
        // approaching gas looks hotter (whiter), receding gas cooler (redder)
        e = mix(e, e.rrr * vec3(1.0, 0.85, 0.7), clamp((1.0 - dop) * 1.6, 0.0, 0.6));
        color += e * through;
        through *= 0.22;
      }
    }
    old = p;
    if (u > 1.0) break;        // below the event horizon: no light comes back
  }
  if (escaped && through > 0.01) {
    vec3 p = (cos(phi) * n + sin(phi) * tg) / max(u, 1e-4);
    vec3 d = normalize(p - old);
    // go on in a straight line to the crystal shell, and look the shell up from the center,
    // so the stars line up with the unbent view outside the traced region
    float bb = dot(p, d), cc = dot(p, p) - shellR * shellR;
    float tt = -bb + sqrt(max(bb * bb - cc, 0.0));
    vec3 q = p + d * tt;
    color += textureCube(sky, normalize(q)).rgb * through;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

export class BlackHole {
  constructor({ rs, reach = 13, disk = {}, tilt = 0.32, steps = 150 }) {
    this.rs = rs;
    this.reach = reach;
    this.cube = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.cubeCam = new THREE.CubeCamera(0.05, 4000, this.cube);
    const n = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).normalize();
    const x = new THREE.Vector3(1, 0, 0).sub(n.clone().multiplyScalar(n.x)).normalize();
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG.replace("{{STEPS}}", String(steps)),
      uniforms: {
        camPos: { value: new THREE.Vector3() }, center: { value: new THREE.Vector3() },
        rs: { value: rs }, reach: { value: reach }, shellR: { value: 1000 },
        diskN: { value: n }, diskX: { value: x },
        diskIn: { value: disk.inner ?? 3.0 }, diskOut: { value: disk.outer ?? 11.0 },
        hot: { value: new THREE.Color(disk.hot || "#ffd2a0") }, cool: { value: new THREE.Color(disk.cool || "#7a1408") },
        glow: { value: disk.glow ?? 2.2 }, time: { value: 0 }, sky: { value: this.cube.texture },
      },
      depthWrite: true, depthTest: true, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.scale.setScalar(rs * reach * 1.02);
    this.mesh.frustumCulled = false;
    this.lastCube = -1;
  }

  // Each frame: face the camera, pass it in, and redraw the sky behind the hole now and then.
  update(camera, scene, renderer, center, shellWorldR, t, playing) {
    this.mesh.position.copy(center);
    this.mesh.quaternion.copy(camera.quaternion);
    const u = this.material.uniforms;
    u.camPos.value.copy(camera.position);
    u.center.value.copy(center);
    u.shellR.value = shellWorldR / this.rs;
    u.time.value = t;
    if (this.lastCube < 0 || (playing && t - this.lastCube > 2)) {
      this.mesh.visible = false;
      this.cubeCam.position.copy(center);
      this.cubeCam.update(renderer, scene);
      this.mesh.visible = true;
      this.lastCube = t;
    }
  }

  dispose() {
    this.cube.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
