/**
 * The deterministic scene shared by both backends: instanced cubes placed by a hash of the
 * instance index (no random numbers), rotated by the frame number, shaded with a fixed-iteration
 * fragment loop. Same inputs → same frames on every run.
 */

/** 36 vertices × (position xyz, normal xyz). */
export function cubeVertices(): Float32Array<ArrayBuffer> {
  const faces: [number[], number[]][] = [
    [[0, 0, 1], [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1]],
    [[0, 0, -1], [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, -1, -1, -1, 1, -1, 1, 1, -1]],
    [[1, 0, 0], [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, -1, 1, 1, 1]],
    [[-1, 0, 0], [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, -1, -1, -1, 1, 1, -1, 1, -1]],
    [[0, 1, 0], [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, -1, 1, -1]],
    [[0, -1, 0], [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, -1, 1, -1, 1, -1, -1, 1]],
  ];
  const out: number[] = [];
  for (const [n, p] of faces) for (let i = 0; i < 6; i++) out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], n[0], n[1], n[2]);
  return new Float32Array(out);
}

export const GLSL_VERTEX = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform float uTime;
uniform float uAspect;
out vec3 vNormal;
out vec3 vWorld;
flat out int vId;
float hash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  float id = float(gl_InstanceID);
  vec3 p = vec3(hash(id * 1.31) - 0.5, hash(id * 2.17) - 0.5, hash(id * 3.73)) * vec3(16.0, 9.0, 30.0);
  float a = uTime * (0.3 + hash(id * 5.1)) + id;
  float b = a * 0.7;
  mat3 ry = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(b), sin(b), 0.0, -sin(b), cos(b));
  mat3 r = ry * rx;
  vec3 wp = r * (aPos * 0.18) + vec3(p.x, p.y, -4.0 - p.z);
  vNormal = r * aNormal;
  vWorld = wp;
  vId = gl_InstanceID;
  float f = 1.0 / tan(0.6);
  float n = 0.1;
  float fa = 60.0;
  gl_Position = vec4(wp.x * f / uAspect, wp.y * f, wp.z * (fa + n) / (n - fa) + 2.0 * fa * n / (n - fa), -wp.z);
}`;

export const GLSL_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
flat in int vId;
uniform float uTime;
uniform int uIterations;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float d = max(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0);
  vec2 q = vWorld.xy * 0.35;
  float acc = 0.0;
  for (int i = 0; i < uIterations; i++) {
    // Clamped: an unbounded iteration overflows to inf/NaN and the per-pixel cost would drift.
    q = clamp(vec2(q.x * q.x - q.y * q.y, 2.0 * q.x * q.y) * 0.5 + vec2(sin(float(i) * 0.37 + uTime), cos(float(i) * 0.21)), -4.0, 4.0);
    acc += exp(-dot(q, q));
  }
  vec3 base = 0.5 + 0.5 * cos(6.2831 * (float(vId % 7) / 7.0 + vec3(0.0, 0.33, 0.67)));
  outColor = vec4(base * (0.25 + 0.75 * d) * (0.6 + 0.4 * fract(acc)), 1.0);
}`;

export const WGSL = /* wgsl */ `
struct U { time: f32, aspect: f32, iterations: u32, pad: u32 };
@group(0) @binding(0) var<uniform> u: U;
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) normal: vec3f,
  @location(1) world: vec3f,
  @location(2) @interpolate(flat) id: u32,
};
fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }
@vertex fn vs(@location(0) aPos: vec3f, @location(1) aNormal: vec3f, @builtin(instance_index) iid: u32) -> VOut {
  let id = f32(iid);
  let p = vec3f(hash(id * 1.31) - 0.5, hash(id * 2.17) - 0.5, hash(id * 3.73)) * vec3f(16.0, 9.0, 30.0);
  let a = u.time * (0.3 + hash(id * 5.1)) + id;
  let b = a * 0.7;
  let ry = mat3x3f(vec3f(cos(a), 0.0, -sin(a)), vec3f(0.0, 1.0, 0.0), vec3f(sin(a), 0.0, cos(a)));
  let rx = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, cos(b), sin(b)), vec3f(0.0, -sin(b), cos(b)));
  let r = ry * rx;
  let wp = r * (aPos * 0.18) + vec3f(p.x, p.y, -4.0 - p.z);
  let f = 1.0 / tan(0.6);
  let n = 0.1;
  let fa = 60.0;
  var o: VOut;
  o.pos = vec4f(wp.x * f / u.aspect, wp.y * f, wp.z * fa / (n - fa) + fa * n / (n - fa), -wp.z);
  o.normal = r * aNormal;
  o.world = wp;
  o.id = iid;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let nrm = normalize(i.normal);
  let d = max(dot(nrm, normalize(vec3f(0.4, 0.8, 0.5))), 0.0);
  var q = i.world.xy * 0.35;
  var acc = 0.0;
  for (var k = 0u; k < u.iterations; k++) {
    q = clamp(vec2f(q.x * q.x - q.y * q.y, 2.0 * q.x * q.y) * 0.5 + vec2f(sin(f32(k) * 0.37 + u.time), cos(f32(k) * 0.21)), vec2f(-4.0), vec2f(4.0));
    acc += exp(-dot(q, q));
  }
  let base = 0.5 + 0.5 * cos(6.2831 * (f32(i.id % 7u) / 7.0 + vec3f(0.0, 0.33, 0.67)));
  return vec4f(base * (0.25 + 0.75 * d) * (0.6 + 0.4 * fract(acc)), 1.0);
}
`;
