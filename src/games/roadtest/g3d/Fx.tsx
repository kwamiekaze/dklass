import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MPH_TO_MPS, type RunSim } from './sim';
import { hideInst, setInst } from './util';

/** Sparks, confetti, smoke, speed lines and skid marks. One pooled point cloud for the particles; everything is additive and cheap. */
const N = 700;

export interface Emit {
  x: number; y: number; d: number; n: number; color: number | number[];
  speed?: number; spread?: number; up?: number; fwd?: number; life?: number; size?: number; gravity?: number; drag?: number; ring?: boolean; alpha?: number; shape?: 'spark' | 'smoke' | 'confetti';
}

class Particles {
  px = new Float32Array(N); py = new Float32Array(N); pz = new Float32Array(N);
  vx = new Float32Array(N); vy = new Float32Array(N); vz = new Float32Array(N);
  life = new Float32Array(N); max = new Float32Array(N); size = new Float32Array(N); grav = new Float32Array(N); drag = new Float32Array(N);
  col = new Float32Array(N * 3); alpha = new Float32Array(N); kind = new Float32Array(N); base = new Float32Array(N);
  head = 0;
  emit(o: Emit) {
    const cols = Array.isArray(o.color) ? o.color : [o.color];
    for (let k = 0; k < o.n; k++) {
      const i = this.head; this.head = (this.head + 1) % N;
      const a = Math.random() * Math.PI * 2, e = o.ring ? 0 : Math.random();
      const sp = (o.speed ?? 6) * (0.4 + Math.random() * 0.8), spread = o.spread ?? 1;
      this.px[i] = o.x + (Math.random() - 0.5) * 0.2; this.py[i] = o.y; this.pz[i] = -o.d;
      this.vx[i] = Math.cos(a) * sp * spread * (o.ring ? 1 : 0.4 + e * 0.6);
      this.vy[i] = (o.up ?? 3) * (0.5 + Math.random() * 0.8) + (o.ring ? 0 : Math.random() * 2);
      this.vz[i] = Math.sin(a) * sp * spread * (o.ring ? 1 : 0.4 + e * 0.6) - (o.fwd ?? 0);
      this.life[i] = this.max[i] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.7);
      this.size[i] = (o.size ?? 0.35) * (0.6 + Math.random() * 0.8); this.grav[i] = o.gravity ?? 9; this.drag[i] = o.drag ?? 1.2;
      const c = new THREE.Color(cols[Math.floor(Math.random() * cols.length)]!);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; this.alpha[i] = 1; this.base[i] = o.alpha ?? 1;
      this.kind[i] = o.shape === 'smoke' ? 1 : o.shape === 'confetti' ? 2 : 0;
    }
  }
  step(dt: number, scrollZ: number) {
    for (let i = 0; i < N; i++) {
      if (this.life[i]! <= 0) { this.alpha[i] = 0; continue; }
      this.life[i]! -= dt;
      const dr = Math.exp(-this.drag[i]! * dt);
      this.vx[i] = this.vx[i]! * dr; this.vz[i] = this.vz[i]! * dr; this.vy[i] = (this.vy[i]! - this.grav[i]! * dt) * (this.kind[i] === 1 ? 1 : 1);
      this.px[i]! += this.vx[i]! * dt; this.py[i]! += this.vy[i]! * dt; this.pz[i]! += this.vz[i]! * dt;
      if (this.py[i]! < 0.03 && this.kind[i] !== 1) { this.py[i] = 0.03; this.vy[i] = -this.vy[i]! * 0.3; this.vx[i]! *= 0.7; this.vz[i]! *= 0.7; }
      const t = Math.max(0, this.life[i]! / this.max[i]!);
      this.alpha[i] = this.base[i]! * (this.kind[i] === 1 ? Math.min(1, t * 1.6) * 0.5 : Math.min(1, t * 2.2));
    }
    void scrollZ;
  }
}

export const fx = { p: null as Particles | null, emit(o: Emit) { this.p?.emit(o); } };

const VS = `attribute vec3 aCol; attribute float aAlpha; attribute float aSize; attribute float aKind; varying vec3 vC; varying float vA; varying float vK; uniform float uScale;
void main(){ vC = aCol; vA = aAlpha; vK = aKind; vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(.5, -mv.z); }`;
const FS = `varying vec3 vC; varying float vA; varying float vK; void main(){ vec2 p = gl_PointCoord - .5; float r = length(p) * 2.; float a;
if (vK > 1.5) { a = step(abs(p.x), .32) * step(abs(p.y), .18); } else if (vK > .5) { a = (1. - smoothstep(.1, 1., r)); } else { a = (1. - smoothstep(.0, 1., r)); a *= a; }
a *= vA; if (a < .01) discard; gl_FragColor = vec4(vC * (vK > .5 && vK < 1.5 ? 1. : 1.4), a); }`;

export function Sparks({ sim }: { sim: RunSim }) {
  const grp = useRef<THREE.Group>(null);
  const { size, gl } = useThree();
  const P = useMemo(() => new Particles(), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P.px, 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [P]);
  const pos = useMemo(() => new Float32Array(N * 3), []);
  const mats = useMemo(() => {
    const add = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uScale: { value: 400 } } });
    const smoke = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, toneMapped: false, uniforms: { uScale: { value: 400 } } });
    return { add, smoke };
  }, []);
  useEffect(() => { fx.p = P; return () => { fx.p = null; }; }, [P]);
  const attrs = useMemo(() => {
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(P.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(P.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aKind', new THREE.BufferAttribute(P.kind, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return true;
  }, [geo, P, pos]);
  void attrs;
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) * sim.timeScale;
    if (grp.current) grp.current.position.z = sim.traveled;
    P.step(dt, sim.traveled);
    for (let i = 0; i < N; i++) { pos[i * 3] = P.px[i]!; pos[i * 3 + 1] = P.py[i]!; pos[i * 3 + 2] = P.pz[i]!; }
    for (const k of ['position', 'aCol', 'aAlpha', 'aSize', 'aKind']) (geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    const sc = size.height * gl.getPixelRatio() * 0.62;
    mats.add.uniforms.uScale!.value = sc; mats.smoke.uniforms.uScale!.value = sc;
  });
  return <group ref={grp}>
    <points geometry={geo} material={mats.add} frustumCulled={false} renderOrder={12} />
  </group>;
}

/** Thin white streaks flying past the lens when you are going fast. */
export function SpeedLines({ sim }: { sim: RunSim }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => Array.from({ length: 46 }, () => {
    return { x: (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 6), y: 0.25 + Math.random() * 3, z: -Math.random() * 70 + 6, len: 2 + Math.random() * 5 };
  }), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), []);
  const geo = useMemo(() => { const g = new THREE.BoxGeometry(0.035, 0.035, 1); return g; }, []);
  useFrame((_, rawDt) => {
    const m = mesh.current; if (!m) return;
    const dt = Math.min(rawDt, 0.05);
    const k = Math.min(1, Math.max(0, (sim.mph / sim.maxMph - 0.45) / 0.55));
    mat.opacity += (k * 0.5 - mat.opacity) * Math.min(1, dt * 6);
    m.visible = mat.opacity > 0.01;
    if (!m.visible) return;
    const v = sim.mph * MPH_TO_MPS * 1.1 + 12;
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!; d.z += v * dt;
      if (d.z > 8) { d.z = -66 - Math.random() * 10; d.x = (Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 6) + sim.x * 0.5; d.y = 0.25 + Math.random() * 3; d.len = 2 + Math.random() * 5 * (0.5 + k); }
      setInst(m, i, d.x, d.y, d.z, 0, 1, 1, d.len * (0.6 + k));
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, data.length]} frustumCulled={false} renderOrder={11} />;
}

/** Dark tyre marks laid on the road while braking hard; they age and shrink away. */
export function SkidMarks({ sim }: { sim: RunSim }) {
  const mesh = useRef<THREE.InstancedMesh>(null), grp = useRef<THREE.Group>(null);
  const R = 120;
  const marks = useRef<{ x: number; d: number; t: number }[]>([]);
  const last = useRef(0);
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(0.22, 1.1); g.rotateX(-Math.PI / 2); return g; }, []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#0a0a0c', transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), []);
  useFrame((_, rawDt) => {
    const m = mesh.current, g = grp.current; if (!m || !g) return;
    const dt = Math.min(rawDt, 0.05);
    g.position.z = sim.traveled;
    const hard = (sim.braking && sim.prevMph > 18) || Math.abs(sim.steerV) > 5.2 && sim.mph > 30;
    last.current -= dt;
    if (hard && last.current <= 0 && !sim.finished) {
      last.current = 0.045;
      for (const sx of [-0.78, 0.78]) { marks.current.push({ x: sim.x + sx, d: sim.traveled - 1.3, t: 0 }); }
      if (marks.current.length > R) marks.current.splice(0, marks.current.length - R);
    }
    const arr = marks.current;
    for (let i = 0; i < R; i++) {
      const s = arr[i];
      if (!s) { hideInst(m, i); continue; }
      s.t += dt;
      const f = s.t < 6 ? 1 : Math.max(0, 1 - (s.t - 6) / 1.5);
      if (f <= 0 || s.d < sim.traveled - 60) { arr[i] = undefined as unknown as typeof s; hideInst(m, i); continue; }
      setInst(m, i, s.x, 0.012, -s.d, 0, f, 1, 1.2);
    }
    marks.current = arr.filter(Boolean);
    m.instanceMatrix.needsUpdate = true;
  });
  return <group ref={grp}><instancedMesh ref={mesh} args={[geo, mat, R]} frustumCulled={false} renderOrder={3} /></group>;
}
