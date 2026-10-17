/**
 * The line of the road. The rules engine runs on a straight track (distance and lane), so the bends and the hills are drawn: every
 * bendable material shifts each vertex sideways and up by how far the road's centre line has wandered from the straight ahead of the car.
 *   offset(dz) = C(T + dz) - C(T) - C'(T) * dz        (zero at the car, so the lane under the wheels always lines up with the rules)
 * The same numbers are used on the CPU (actors that are placed one by one) and in the shaders (everything that is instanced).
 */
import * as THREE from 'three';

export interface PathSpec { ampX: [number, number, number]; lenX: [number, number, number]; phX: [number, number, number]; ampY: [number, number, number]; lenY: [number, number, number]; phY: [number, number, number] }

const P = (ampX: [number, number, number], lenX: [number, number, number], ampY: [number, number, number], lenY: [number, number, number], seed = 0): PathSpec =>
  ({ ampX, lenX, phX: [seed * 1.7 + 0.4, seed * 2.3 + 1.1, seed * 0.9 + 2.2], ampY, lenY, phY: [seed * 1.3 + 0.9, seed * 2.9 + 0.2, seed * 1.1 + 1.7] });

export const PATHS: Record<string, PathSpec> = {
  straight: P([4, 0, 0], [1900, 700, 500], [0.6, 0, 0], [900, 500, 300], 1),
  gentle: P([34, 12, 0], [1500, 640, 500], [3.2, 1.0, 0], [820, 420, 300], 2),
  rolling: P([42, 16, 5], [1250, 560, 330], [7.5, 2.4, 0.8], [640, 330, 190], 3),
  winding: P([66, 26, 9], [980, 470, 260], [6.0, 2.2, 0.6], [520, 280, 170], 4),
};

const sum3 = (a: number[], l: number[], p: number[], d: number) => a[0]! * Math.sin(d / l[0]! + p[0]!) + a[1]! * Math.sin(d / l[1]! + p[1]!) + a[2]! * Math.sin(d / l[2]! + p[2]!);
const dsum3 = (a: number[], l: number[], p: number[], d: number) => (a[0]! / l[0]!) * Math.cos(d / l[0]! + p[0]!) + (a[1]! / l[1]!) * Math.cos(d / l[1]! + p[1]!) + (a[2]! / l[2]!) * Math.cos(d / l[2]!+ p[2]!);

export const pathX = (s: PathSpec, d: number) => sum3(s.ampX, s.lenX, s.phX, d);
export const pathY = (s: PathSpec, d: number) => sum3(s.ampY, s.lenY, s.phY, d);
export const pathXd = (s: PathSpec, d: number) => dsum3(s.ampX, s.lenX, s.phX, d);
export const pathYd = (s: PathSpec, d: number) => dsum3(s.ampY, s.lenY, s.phY, d);

/** how far the road at `dz` metres ahead of the car sits to the right of, and above, the straight line ahead */
export function bendAt(s: PathSpec, T: number, dz: number, out: { x: number; y: number }) {
  out.x = pathX(s, T + dz) - pathX(s, T) - pathXd(s, T) * dz;
  out.y = pathY(s, T + dz) - pathY(s, T) - pathYd(s, T) * dz;
  return out;
}

/** The uniforms every bendable material shares. One object per run; the scene updates it each frame. */
export interface BendUniforms {
  uT: { value: number };
  uC0: { value: THREE.Vector2 };      // C(T), H(T)
  uC1: { value: THREE.Vector2 };      // C'(T), H'(T)
  uAx: { value: THREE.Vector3 }; uKx: { value: THREE.Vector3 }; uPx: { value: THREE.Vector3 };
  uAy: { value: THREE.Vector3 }; uKy: { value: THREE.Vector3 }; uPy: { value: THREE.Vector3 };
  uOn: { value: number };
}

export function makeBend(spec: PathSpec): BendUniforms {
  const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  const inv = (a: number[]) => new THREE.Vector3(1 / a[0]!, 1 / a[1]!, 1 / a[2]!);
  return { uT: { value: 0 }, uC0: { value: new THREE.Vector2() }, uC1: { value: new THREE.Vector2() },
    uAx: { value: v3(spec.ampX) }, uKx: { value: inv(spec.lenX) }, uPx: { value: v3(spec.phX) },
    uAy: { value: v3(spec.ampY) }, uKy: { value: inv(spec.lenY) }, uPy: { value: v3(spec.phY) }, uOn: { value: 1 } };
}
export function stepBend(u: BendUniforms, s: PathSpec, T: number) {
  u.uT.value = T;
  u.uC0.value.set(pathX(s, T), pathY(s, T)); u.uC1.value.set(pathXd(s, T), pathYd(s, T));
}

const DECL = /* glsl */`
uniform float uT; uniform vec2 uC0; uniform vec2 uC1; uniform vec3 uAx; uniform vec3 uKx; uniform vec3 uPx; uniform vec3 uAy; uniform vec3 uKy; uniform vec3 uPy; uniform float uOn;
vec2 bendOff(float dz){
  float d = uT + dz;
  float x = dot(uAx, sin(uKx * d + uPx)) - uC0.x - uC1.x * dz;
  float y = dot(uAy, sin(uKy * d + uPy)) - uC0.y - uC1.y * dz;
  return vec2(x, y) * uOn;
}
`;

const patched = new WeakSet<THREE.Material>();
/** Make a material follow the bend. Safe to call twice on the same material. */
export function bendMaterial<M extends THREE.Material>(m: M, u: BendUniforms): M {
  if (patched.has(m)) return m;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}`)
      .replace('mvPosition = modelViewMatrix * mvPosition;', 'vec4 wpB = modelMatrix * mvPosition; vec2 bo = bendOff(-wpB.z); wpB.x += bo.x; wpB.y += bo.y; mvPosition = viewMatrix * wpB;');
  };
  m.customProgramCacheKey = () => `bend:${m.type}`;
  m.needsUpdate = true;
  return m;
}
export function bendTree(root: THREE.Object3D, u: BendUniforms) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh && !(o as THREE.Points).isPoints) return;
    const mat = mesh.material; if (Array.isArray(mat)) mat.forEach((x) => bendMaterial(x, u)); else if (mat && !(mat as THREE.ShaderMaterial).isShaderMaterial) bendMaterial(mat, u);
  });
}
