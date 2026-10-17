import * as THREE from 'three';

/** Deterministic 0..1 noise from two integers, so recycled scenery looks the same every time you drive past. */
export const hash = (i: number, salt = 0) => {
  const s = Math.sin(i * 127.1 + salt * 311.7 + 17.13) * 43758.5453;
  return s - Math.floor(s);
};
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (cur: number, target: number, k: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-k * dt));
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mod = (n: number, m: number) => ((n % m) + m) % m;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
/** Write one instance's matrix: position, y rotation, non-uniform scale. */
export function setInst(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, sx: number, sy = sx, sz = sx) {
  _e.set(0, ry, 0); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
}
export const hideInst = (mesh: THREE.InstancedMesh, i: number) => setInst(mesh, i, 0, -999, 0, 0, 0.0001);

/** A unit box whose texture coordinates are scaled so a facade tile keeps its size on a wall of this many floors. */
export function facadeBox(floors: number, wBays = 1.1) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices each
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) { uv.setXY(i, uv.getX(i) * wBays, uv.getY(i) * wBays); continue; }
    uv.setXY(i, uv.getX(i) * wBays, uv.getY(i) * (floors / 4));
  }
  g.translate(0, 0.5, 0);      // sits on the ground
  return g;
}

export function disposeAll(...things: ({ dispose?: () => void } | null | undefined)[]) { for (const t of things) try { t?.dispose?.(); } catch { /* ignore */ } }

/** A shared shape: the gold five-point star, extruded a little with a bevel. */
export function starGeometry(outer = 0.62, inner = 0.27, depth = 0.16) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rad = i % 2 ? inner : outer;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
