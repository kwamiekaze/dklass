/**
 * Everything that is on the road or beside it and is not the world itself: the traffic, the cones, the guide signs on their gantries, the regulatory signs,
 * the railroad crossings with their gates and trains, the traffic circles, the stoplights and stop signs, and the people in the crosswalks.
 */
import { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import { PlayerCar } from '../g3d/cars';
import type { GarageId } from '../g3d/garage';
import type { RunSim } from '../g3d/sim';
import { glowTexture } from '../g3d/textures';
import { clamp } from '../g3d/util';
import { bendMaterial } from './path';
import { LANE } from './layout';
import { decalTexture, guideSignTexture, regulatoryTexture, vmsTexture } from './textures';
import { DIM, type Veh } from './sim';
import { ALL_KINDS, MAX_PER_KIND, vehicleGeo } from './vehicles';
import { AHEAD, BEHIND, useAtl, useBent } from './World';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
function put(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, rz = 0, s = 1) {
  tmpE.set(0, ry, rz); tmpQ.setFromEuler(tmpE); tmpP.set(x, y, z); tmpS.set(s, s, s); tmpM.compose(tmpP, tmpQ, tmpS); m.setMatrixAt(i, tmpM);
}
const hide = (m: THREE.InstancedMesh, from: number, to: number) => { for (let i = from; i < to; i++) put(m, i, 0, -999, 0, 0, 0, 0.0001); };

// ------------------------------------------------------------------ the traffic ---
export function Traffic() {
  const { sim, bend, night } = useAtl();
  const root = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const paint = bendMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.5, envMapIntensity: 1.2 }), bend);
    const detail = bendMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }), bend);
    const tail = bendMaterial(new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }), bend);
    const head = bendMaterial(new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false }), bend);
    const siren = bendMaterial(new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), bend);
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colored: boolean) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; if (colored) m.setColorAt(0, new THREE.Color(1, 1, 1)); hide(m, 0, n); return m; };
    const byKind = ALL_KINDS.map((k) => { const g = vehicleGeo(k), n = MAX_PER_KIND[k]; return { k, paint: make(g.paint, paint, n, true), detail: make(g.detail, detail, n, false), tail: make(g.tail, tail, n, true), head: make(g.head, head, n, true), n }; });
    const sg = new THREE.BoxGeometry(0.5, 0.18, 0.28);
    const sirens = make(sg, siren, 56, true);
    return { byKind, sirens };
  }, [bend]);
  useEffect(() => {
    const g = root.current; if (!g) return;
    for (const b of parts.byKind) g.add(b.paint, b.detail, b.tail, b.head);
    g.add(parts.sirens);
    return () => { for (const b of parts.byKind) g.remove(b.paint, b.detail, b.tail, b.head); g.remove(parts.sirens); };
  }, [parts]);
  const counts = useRef(new Map<string, number>());
  useFrame(({ clock }) => {
    const g = root.current; if (!g) return;
    const T = sim.traveled, t = clock.elapsedTime;
    g.position.z = T;
    counts.current.clear();
    const nt = clamp(night.current * 1.3 - 0.1, 0, 1) + (atmo_dark()) ;
    const lampBase = 0.5 + 0.6 * Math.min(1, nt);
    let si = 0;
    for (const v of sim.vehicles) {
      const rel = v.d - T; if (rel > AHEAD + 20 || rel < -BEHIND - 30) continue;
      const b = parts.byKind.find((q) => q.k === v.kind) ?? parts.byKind[0]!;
      const i = counts.current.get(v.kind) ?? 0; if (i >= b.n) continue; counts.current.set(v.kind, i + 1);
      let ry = v.yaw, y = 0, rz = 0;
      if (v.fly) { y = Math.max(0, 1.1 * v.fly.t - 3.2 * v.fly.t * v.fly.t); rz = Math.min(0.5, v.fly.t * 0.6) * Math.sign(v.fly.vx || 1); ry = v.yaw; }
      else if (v.lcT > 0 && v.v > 2) { const f = Math.min(1, v.lcT), ds = (6 * f * (1 - f) / 2.4) * (v.tl - v.lcFrom) * LANE; ry = v.yaw - Math.atan2(ds, v.v) * 0.9; }
      put(b.paint, i, v.x, y, -v.d, ry, rz); put(b.detail, i, v.x, y, -v.d, ry, rz); put(b.tail, i, v.x, y, -v.d, ry, rz); put(b.head, i, v.x, y, -v.d, ry, rz);
      b.paint.setColorAt(i, tmpC.setHex(v.kind === 'police' ? 0xf4f6f8 : v.kind === 'taxi' ? 0xf2c14e : v.kind === 'tow' ? 0xf0b81c : v.kind === 'ambulance' ? 0xf4f6f8 : v.kind === 'bus' ? (v.look % 2 ? 0xf0f1f3 : 0xe3ebf3) : v.kind === 'semi' ? SEMI_COLOURS[v.look % SEMI_COLOURS.length]! : v.color));
      const rear = v.dir === -1 ? 0.0 : v.brake || v.still ? 1.5 : lampBase * 0.55;
      b.tail.setColorAt(i, tmpC.setScalar(v.dir === -1 ? 0.15 : rear));
      b.head.setColorAt(i, tmpC.setScalar(v.dir === -1 ? 0.55 + 0.9 * Math.min(1, nt) : 0.25 + 0.5 * Math.min(1, nt)));
      if (v.siren && si < 50) {
        const ph = Math.floor(t * 7) % 2, red = 0xff2a1a, blue = 0x2a6bff, cs = Math.cos(v.yaw), sn = Math.sin(v.yaw);
        const lamp = (dx: number, y: number, dz: number, c: number, sc: number) => { put(parts.sirens, si, v.x + dx * cs + dz * sn, y, -v.d - dx * sn + dz * cs, v.yaw, 0, sc); parts.sirens.setColorAt(si, tmpC.set(c)); si++; };
        if (v.kind === 'police') {
          // light bar domes, grille and windshield strobes, rear deck strobes: they trade red and blue
          const a = ph === 0 ? red : blue, b2 = ph === 0 ? blue : red;
          lamp(-0.34, 1.6, -0.05, a, 0.9); lamp(0.34, 1.6, -0.05, b2, 0.9);
          lamp(-0.6, 0.58, -2.5, a, 0.4); lamp(0.6, 0.58, -2.5, b2, 0.4); lamp(-0.5, 1.2, -0.95, b2, 0.34); lamp(0.5, 1.2, -0.95, a, 0.34);
          lamp(-0.55, 1.18, 1.25, a, 0.34); lamp(0.55, 1.18, 1.25, b2, 0.34);
        } else {
          const H = v.kind === 'tow' ? 2.9 : 2.2;
          for (const s2 of [-1, 1]) lamp(s2 * 0.3, H, 0, (s2 > 0) === (ph === 0) ? red : blue, 1);
        }
      }
    }
    for (const b of parts.byKind) {
      const n = counts.current.get(b.k) ?? 0;
      hide(b.paint, n, b.n); hide(b.detail, n, b.n); hide(b.tail, n, b.n); hide(b.head, n, b.n);
      for (const m of [b.paint, b.detail, b.tail, b.head]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    hide(parts.sirens, si, 56); parts.sirens.instanceMatrix.needsUpdate = true; if (parts.sirens.instanceColor) parts.sirens.instanceColor.needsUpdate = true;
  });
  return <group ref={root} />;
}
import { atmo } from '../g3d/atmo';
const SEMI_COLOURS = [0xf0f1f3, 0xc23b2f, 0x2b5aa8, 0x2f7a4a];
const atmo_dark = () => Math.max(0.55 * atmo.look.fog, 0.4 * atmo.look.storm, 0.3 * atmo.look.rain, 0.25 * atmo.look.snow);

// ------------------------------------------------------------------ cones, barrels and the arrow board ---
export function Props() {
  const { sim, bend } = useAtl();
  const root = useRef<THREE.Group>(null);
  const M = useMemo(() => {
    const cone = bendMaterial(new THREE.MeshStandardMaterial({ color: '#ff6a13', roughness: 0.55, emissive: new THREE.Color('#ff4a00'), emissiveIntensity: 0.12 }), bend);
    const band = bendMaterial(new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 }), bend);
    const cg = new THREE.ConeGeometry(0.2, 0.72, 10); cg.translate(0, 0.38, 0);
    const bg = new THREE.CylinderGeometry(0.3, 0.34, 0.95, 12); bg.translate(0, 0.475, 0);
    const bandG = new THREE.CylinderGeometry(0.31, 0.33, 0.14, 12); bandG.translate(0, 0.62, 0);
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, n: number) => { const x = new THREE.InstancedMesh(g, m, n); x.frustumCulled = false; hide(x, 0, n); return x; };
    return { cones: mk(cg, cone, 90), barrels: mk(bg, cone, 130), bands: mk(bandG, band, 130) };
  }, [bend]);
  const arrow = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d')!; g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffb21a'; g.shadowColor = '#ffb21a'; g.shadowBlur = 12; g.beginPath(); g.moveTo(40, 64); g.lineTo(100, 20); g.lineTo(100, 48); g.lineTo(220, 48); g.lineTo(220, 80); g.lineTo(100, 80); g.lineTo(100, 108); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return bendMaterial(new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), bend);
  }, [bend]);
  useEffect(() => { const g = root.current; if (!g) return; g.add(M.cones, M.barrels, M.bands); return () => { g.remove(M.cones, M.barrels, M.bands); }; }, [M]);
  const arrows = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const g = root.current; if (!g) return; const T = sim.traveled; g.position.z = T;
    let c = 0, b = 0;
    for (const p of sim.props) {
      const rel = p.d - T; if (rel > AHEAD || rel < -BEHIND) continue;
      if (p.k === 'cone' && c < 90) { put(M.cones, c++, p.x, p.fly ? Math.max(0, 1.1 * p.fly.t - 4 * p.fly.t * p.fly.t) : 0, -p.d, p.fly ? p.fly.t * p.fly.spin : 0, p.fly ? Math.min(1.4, p.fly.t * 2.5) : 0); }
      else if (p.k === 'barrel' && b < 130) { put(M.barrels, b, p.x, p.fly ? Math.max(0, 1.1 * p.fly.t - 4 * p.fly.t * p.fly.t) : 0, -p.d, 0, p.fly ? Math.min(1.4, p.fly.t * 2.5) : 0); put(M.bands, b, p.x, p.fly ? Math.max(0, 1.1 * p.fly.t - 4 * p.fly.t * p.fly.t) : 0, -p.d, 0, p.fly ? Math.min(1.4, p.fly.t * 2.5) : 0); b++; }
    }
    hide(M.cones, c, 90); hide(M.barrels, b, 130); hide(M.bands, b, 130);
    for (const m of [M.cones, M.barrels, M.bands]) m.instanceMatrix.needsUpdate = true;
    let ai = 0; for (const p of sim.props) if (p.k === 'arrow') { const m = arrows.current[ai++]; if (m) { m.position.set(p.x, 1.6, T - p.d); m.visible = Math.abs(p.d - T) < AHEAD; } }
    while (ai < 4) { const m = arrows.current[ai++]; if (m) m.visible = false; }
  });
  return <>
    <group ref={root} />
    {[0, 1, 2, 3].map((i) => <mesh key={i} ref={(m) => { arrows.current[i] = m; }} material={arrow} visible={false}><boxGeometry args={[2.4, 1.2, 0.12]} /></mesh>)}
  </>;
}

// ------------------------------------------------------------------ the big green guide signs, on gantries and on posts ---
function GuideRig({ g, d, index }: { g: import('./stageTypes').GuideSign; d: number; index: number }) {
  const { sim, stage, bend, night } = useAtl();
  const grp = useRef<THREE.Group>(null);
  const lay = sim.lay;
  const sign = useMemo(() => guideSignTexture(g), [g]);
  const mat = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ map: sign.map, emissiveMap: sign.map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.12, roughness: 0.4, transparent: true, alphaTest: 0.05 }), bend), [sign, bend]);
  const steel = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.45, metalness: 0.75 }), bend), [bend]);
  const overhead = stage.road === 'interstate' && (index % 3 !== 2 || (g.also?.length ?? 0) > 0);
  const nPanels = 1 + (g.also?.length ?? 0);
  const H = overhead ? 3.1 : 2.7, W = H * sign.aspect;
  const cx = (lay.padL + lay.padR) / 2, span = lay.padR - lay.padL + 1.6;
  useFrame(() => {
    const m = grp.current; if (!m) return; const rel = d - sim.traveled;
    m.visible = rel < AHEAD + 20 && rel > -BEHIND - 10; m.position.z = sim.traveled - d;
    mat.emissiveIntensity = 0.1 + clamp(night.current * 1.3 - 0.1, 0, 1) * 0.55;
  });
  void nPanels;
  return <group ref={grp}>
    {overhead
      ? <>
        <mesh material={steel} position={[lay.padL - 0.7, 4.5, 0]}><boxGeometry args={[0.45, 9.0, 0.45]} /></mesh>
        <mesh material={steel} position={[lay.padR + 0.7, 4.5, 0]}><boxGeometry args={[0.45, 9.0, 0.45]} /></mesh>
        <mesh material={steel} position={[cx, 8.9, 0]}><boxGeometry args={[span, 0.7, 0.55]} /></mesh>
        <mesh material={steel} position={[cx, 9.35, 0]}><boxGeometry args={[span, 0.12, 0.12]} /></mesh>
        <mesh material={mat} position={[cx + (g.left ? -1.5 : 0), 8.55 - H / 2, 0.32]}><planeGeometry args={[W, H]} /></mesh>
      </>
      : <>
        <mesh material={steel} position={[lay.edgeR + 2.6, 2.4, 0]}><boxGeometry args={[0.3, 4.8, 0.3]} /></mesh>
        <mesh material={steel} position={[lay.edgeR + 2.6 + W - 0.6, 2.4, 0]}><boxGeometry args={[0.3, 4.8, 0.3]} /></mesh>
        <mesh material={mat} position={[lay.edgeR + 2.6 + (W - 0.6) / 2, 4.8 - H / 2 + 0.6, 0.2]}><planeGeometry args={[W, H]} /></mesh>
      </>}
  </group>;
}
export function GuideSigns() {
  const { sim, stage } = useAtl();
  const L = sim.effectiveLength;
  return <>{stage.guide.map((g, i) => <GuideRig key={i} g={g} index={i} d={40 + g.at * (L - 90)} />)}</>;
}

// ------------------------------------------------------------------ amber message boards over the road ---
export function MessageBoards() {
  const { sim, stage, bend, night } = useAtl();
  const L = sim.effectiveLength, lay = sim.lay;
  const items = useMemo(() => stage.events.filter((e): e is Extract<typeof e, { t: 'vms' }> => e.t === 'vms').map((e) => ({ d: 40 + e.at * (L - 90) - 120, lines: e.text.split('|').map((s) => s.replace(/\s{2,}/g, ' ')) })), [stage, L]);
  if (stage.road !== 'interstate') return null;
  return <>{items.map((it, i) => <Board key={i} {...it} bend={bend} sim={sim} lay={lay} night={night} />)}</>;
}
function Board({ d, lines, bend, sim, lay, night }: { d: number; lines: string[]; bend: ReturnType<typeof useAtl>['bend']; sim: ReturnType<typeof useAtl>['sim']; lay: ReturnType<typeof useAtl>['sim']['lay']; night: { current: number } }) {
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => vmsTexture(lines), [lines]);
  const mat = useMemo(() => bendMaterial(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), bend), [tex, bend]);
  const steel = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.5, metalness: 0.7 }), bend), [bend]);
  const cx = (lay.padL + lay.padR) / 2, span = lay.padR - lay.padL + 1.6;
  useFrame(() => { const m = grp.current; if (!m) return; const rel = d - sim.traveled; m.visible = rel < AHEAD + 20 && rel > -BEHIND - 10; m.position.z = sim.traveled - d; mat.color.setScalar(0.75 + 0.25 * clamp(night.current * 1.3, 0, 1)); });
  return <group ref={grp}>
    <mesh material={steel} position={[lay.padL - 0.7, 3.6, 0]}><boxGeometry args={[0.45, 7.2, 0.45]} /></mesh>
    <mesh material={steel} position={[lay.padR + 0.7, 3.6, 0]}><boxGeometry args={[0.45, 7.2, 0.45]} /></mesh>
    <mesh material={steel} position={[cx, 7.2, 0]}><boxGeometry args={[span, 0.5, 0.6]} /></mesh>
    <mesh material={mat} position={[cx, 8.5, 0.32]}><planeGeometry args={[7.6, 2.14]} /></mesh>
    <mesh material={steel} position={[cx, 8.5, 0.18]}><boxGeometry args={[7.9, 2.34, 0.2]} /></mesh>
    <mesh material={steel} position={[cx, 7.6, 0]}><boxGeometry args={[0.3, 1.0, 0.3]} /></mesh>
  </group>;
}

// ------------------------------------------------------------------ small regulatory signs on posts ---
type SignKind = Parameters<typeof regulatoryTexture>[0];
interface RoadSignSpec { d: number; kind: SignKind; n?: number; side: 1 | -1; w?: number }
function RoadSign({ s }: { s: RoadSignSpec }) {
  const { sim, bend, night } = useAtl();
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => regulatoryTexture(s.kind, s.n ?? 70), [s.kind, s.n]);
  const mat = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.5, transparent: true, alphaTest: 0.05 }), bend), [tex, bend]);
  const post = useBent(() => new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.5, metalness: 0.7 }));
  const back = useBent(() => new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.55, metalness: 0.6 }));
  const lay = sim.lay, w = s.w ?? 0.9, h = w * 1.25, x = s.side > 0 ? lay.edgeR + (lay.sidewalks ? 1.0 : 1.3) : lay.edgeL - (lay.sidewalks ? 1.0 : 1.3);
  const xx = s.kind === 'speed' || s.kind === 'keepright' || s.kind === 'hov' || s.kind === 'handsfree' || s.kind === 'moveover' ? (s.side > 0 ? lay.padR + 1.0 : lay.padL - 1.0) : x;
  useFrame(() => { const m = grp.current; if (!m) return; const rel = s.d - sim.traveled; m.visible = rel < AHEAD && rel > -BEHIND; m.position.z = sim.traveled - s.d; mat.emissiveIntensity = 0.1 + clamp(night.current * 1.3 - 0.1, 0, 1) * 0.35; });
  return <group ref={grp} position={[xx, 0, 0]}>
    <mesh material={post} position={[0, 1.5, -0.09]}><boxGeometry args={[0.1, 3.0, 0.1]} /></mesh>
    <mesh material={back} position={[0, 2.3 + h / 2, -0.02]}><boxGeometry args={[w * 0.97, h * 0.97, 0.03]} /></mesh>
    <mesh material={mat} position={[0, 2.3 + h / 2, 0.005]}><planeGeometry args={[w, h]} /></mesh>
  </group>;
}
export function RoadSigns() {
  const { sim, stage } = useAtl();
  const L = sim.effectiveLength;
  const list = useMemo(() => {
    const out: RoadSignSpec[] = [];
    const every = stage.road === 'interstate' ? 1500 : 800;
    for (let d = 25; d < L; d += every) out.push({ d, kind: 'speed', n: sim.stage.limit, side: 1 });
    for (const z of sim.zones) { if (z.kind === 'circle') { out.push({ d: z.d0 + 20, kind: 'speed', n: 25, side: 1 }); continue; } out.push({ d: z.d0 + 12, kind: 'speed', n: z.limit, side: 1 }); out.push({ d: z.d0 + 12, kind: 'speed', n: z.limit, side: -1 }); out.push({ d: z.d1 + 25, kind: 'speed', n: sim.stage.limit, side: 1 }); if (z.kind === 'school') out.push({ d: z.d0 + 6, kind: 'school', side: -1, w: 1.0 }); }
    if (stage.road === 'interstate') for (let d = 700; d < L; d += 1100) { out.push({ d, kind: 'keepright', side: 1 }); }
    if (stage.hov) for (let d = 380; d < L; d += 520) out.push({ d, kind: 'hov', side: -1 });
    for (let d = 1000; d < L; d += 1700) out.push({ d, kind: 'handsfree', side: -1 });
    if (stage.road === 'interstate') out.push({ d: L * 0.28, kind: 'moveover', side: 1 });
    for (const r of sim.rails) { out.push({ d: r.d - 70, kind: 'trainx', side: 1 }); out.push({ d: r.d - 250, kind: 'trainx', side: 1 }); }
    for (const c of sim.circles) { out.push({ d: c.d - 7, kind: 'yield', side: 1, w: 1.0 }); out.push({ d: c.d - 150, kind: 'circle', side: 1 }); }
    for (const c of sim.closures) { out.push({ d: c.d0 - 240, kind: c.kind === 'work' ? 'workers' : 'rightLaneEnds', side: 1 }); out.push({ d: c.d0 - 120, kind: 'rightLaneEnds', side: 1 }); }
    return out;
  }, [sim, stage, L]);
  return <>{list.map((s, i) => <RoadSign key={i} s={s} />)}</>;
}

// ------------------------------------------------------------------ decals on the road ---
function Decal({ kind, d, x, w, l, y = 0.03 }: { kind: Parameters<typeof decalTexture>[0]; d: number; x: number; w?: number; l?: number; y?: number }) {
  const { sim, bend } = useAtl();
  const grp = useRef<THREE.Mesh>(null);
  const dec = useMemo(() => decalTexture(kind), [kind]);
  const mat = useMemo(() => bendMaterial(new THREE.MeshBasicMaterial({ map: dec.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: true }), bend), [dec, bend]);
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(w ?? dec.w, l ?? dec.l, 1, 6); g.rotateX(-Math.PI / 2); return g; }, [w, l, dec]);
  const night = useContext(NightCtx);
  useFrame(() => { const m = grp.current; if (!m) return; const rel = d - sim.traveled; m.visible = rel < AHEAD && rel > -BEHIND; m.position.z = sim.traveled - d; mat.color.setScalar(0.78 + 0.22 * (1 - night.current)); });
  return <mesh ref={grp} geometry={geo} material={mat} position={[x, y, 0]} renderOrder={3} />;
}

/** A strip of cross street, a stop line and the zebra stripes beside it. */
function Crossing({ d, stopLine = true, zebra = true, street = true }: { d: number; stopLine?: boolean; zebra?: boolean; street?: boolean }) {
  const { sim, bend } = useAtl();
  const lay = sim.lay, cx = (lay.padL + lay.padR) / 2, w = lay.padR - lay.padL;
  const road = useRef<THREE.Mesh>(null);
  const mat = useBent(() => new THREE.MeshStandardMaterial({ color: '#3a3b40', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(200, 13, 20, 1); g.rotateX(-Math.PI / 2); return g; }, []);
  useFrame(() => { const m = road.current; if (!m) return; const rel = d - sim.traveled; m.visible = rel < AHEAD && rel > -BEHIND - 10; m.position.z = sim.traveled - d - 15; });
  void bend;
  return <>
    {street && <mesh ref={road} geometry={geo} material={mat} position={[(lay.edgeL + lay.edgeR) / 2, 0.012, 0]} renderOrder={2} />}
    {stopLine && <Decal kind="stopbar" d={d + 1.9 + 0.2} x={cx} w={w} l={0.6} />}
    {zebra && <Decal kind="crosswalk" d={d + 4.8} x={cx} w={w} l={3.2} />}
  </>;
}

// ------------------------------------------------------------------ railroad crossings ---
/** The crossbuck board: RAILROAD on one blade, CROSSING on the other, white with black letters. */
function crossbuckTexture(word: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 80; const g = c.getContext('2d')!;
  g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, 512, 80); g.strokeStyle = '#15171a'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 72);
  g.fillStyle = '#15171a'; g.font = '700 54px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, 256, 43);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** One freight train: a diesel with a cab and a nose, then boxcars, tank cars and container flats, on bogies with real wheels. Faces +x. */
function Train({ bend, group }: { bend: ReturnType<typeof useAtl>['bend']; group: React.RefObject<THREE.Group> }) {
  const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => bendMaterial(new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.2, ...o }), bend);
  const M = useMemo(() => ({
    blue: mat('#1c3d78'), orange: mat('#f08a1c'), dark: mat('#23252a', { roughness: 0.7, metalness: 0.4 }), glass: mat('#1a2431', { roughness: 0.2, metalness: 0.6 }),
    gray: mat('#6d7279'), rust: mat('#8a3a28', { roughness: 0.8 }), rust2: mat('#6e3022', { roughness: 0.8 }), tank: mat('#2d3035', { roughness: 0.4, metalness: 0.5 }), tan: mat('#b9a98a', { roughness: 0.8 }),
    c1: mat('#1f6fb0'), c2: mat('#c8402a'), c3: mat('#2f8f5b'), c4: mat('#e0a82c'), steel: mat('#8d9096', { metalness: 0.7, roughness: 0.4 }),
    lamp: bendMaterial(new THREE.MeshBasicMaterial({ color: '#fff6d8', toneMapped: false }), bend), white: mat('#e8e6df'),
  }), [bend]);   // eslint-disable-line react-hooks/exhaustive-deps
  const wheelGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 18); g.rotateX(Math.PI / 2); return g; }, []);
  const axles = useMemo(() => {
    const out: number[] = []; // x of each axle along the train
    for (const dx of [-7.2, -5.4, -3.6, 3.6, 5.4, 7.2]) out.push(dx);
    for (let k = 0; k < 9; k++) { const cx = -(10 + 8.4 + k * 17.5); for (const dx of [-6.8, -5.1, 5.1, 6.8]) out.push(cx + dx); }
    return out;
  }, []);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const trucks = useRef<THREE.InstancedMesh>(null);
  const truckGeo = useMemo(() => new THREE.BoxGeometry(3.9, 0.34, 2.3), []);
  const truckX = useMemo(() => { const out = [-5.4, 5.4]; for (let k = 0; k < 9; k++) { const cx = -(10 + 8.4 + k * 17.5); out.push(cx - 5.9, cx + 5.9); } return out; }, []);
  useEffect(() => {
    const m = wheels.current, t = trucks.current; if (!m || !t) return;
    const q = new THREE.Matrix4(); let i = 0;
    for (const x of axles) for (const z of [-0.72, 0.72]) { q.makeTranslation(x, 0.68, z); m.setMatrixAt(i++, q); }
    m.instanceMatrix.needsUpdate = true;
    truckX.forEach((x, j) => { q.makeTranslation(x, 0.82, 0); t.setMatrixAt(j, q); }); t.instanceMatrix.needsUpdate = true;
  }, [axles, truckX]);
  const cars = Array.from({ length: 9 }, (_, k) => ({ k, x: -(10 + 8.4 + k * 17.5), type: ['box', 'tank', 'cont', 'box', 'box', 'tank', 'cont', 'box', 'cont'][k]! }));
  return <group ref={group} visible={false} position={[-200, 0, 0]}>
    <instancedMesh ref={wheels} args={[wheelGeo, M.steel, axles.length * 2]} frustumCulled={false} />
    <instancedMesh ref={trucks} args={[truckGeo, M.dark, truckX.length]} frustumCulled={false} />
    {/* the diesel: frame, long hood, cab with windows, short nose, stripe, headlight */}
    <mesh material={M.dark} position={[0, 1.2, 0]}><boxGeometry args={[20.4, 0.5, 2.9]} /></mesh>
    <mesh material={M.blue} position={[-3.5, 2.55, 0]}><boxGeometry args={[13, 2.2, 2.9]} /></mesh>
    <mesh material={M.orange} position={[-3.5, 2.2, 1.46]}><boxGeometry args={[13, 0.42, 0.04]} /></mesh>
    <mesh material={M.orange} position={[-3.5, 2.2, -1.46]}><boxGeometry args={[13, 0.42, 0.04]} /></mesh>
    <mesh material={M.gray} position={[-6.4, 3.85, 0]}><boxGeometry args={[3.2, 0.5, 1.9]} /></mesh>
    <mesh material={M.blue} position={[4.1, 3.0, 0]}><boxGeometry args={[5.4, 3.1, 2.9]} /></mesh>
    <mesh material={M.dark} position={[4.1, 4.62, 0]}><boxGeometry args={[5.6, 0.2, 3.1]} /></mesh>
    {[1, -1].map((sd) => <mesh key={sd} material={M.glass} position={[4.0, 3.6, sd * 1.46]}><boxGeometry args={[3.6, 1.05, 0.04]} /></mesh>)}
    <mesh material={M.glass} position={[6.82, 3.6, 0]}><boxGeometry args={[0.04, 1.05, 2.4]} /></mesh>
    <mesh material={M.orange} position={[4.1, 2.2, 1.46]}><boxGeometry args={[5.4, 0.42, 0.04]} /></mesh>
    <mesh material={M.orange} position={[4.1, 2.2, -1.46]}><boxGeometry args={[5.4, 0.42, 0.04]} /></mesh>
    <mesh material={M.blue} position={[8.4, 2.35, 0]}><boxGeometry args={[3.0, 1.8, 2.7]} /></mesh>
    <mesh material={M.lamp} position={[9.92, 2.7, 0]}><circleGeometry args={[0.2, 16]} /></mesh>
    <mesh material={M.lamp} position={[9.92, 1.9, 0.8]}><circleGeometry args={[0.1, 12]} /></mesh>
    <mesh material={M.lamp} position={[9.92, 1.9, -0.8]}><circleGeometry args={[0.1, 12]} /></mesh>
    {/* the cars */}
    {cars.map((c) => <group key={c.k} position={[c.x, 0, 0]}>
      <mesh material={M.dark} position={[0, 1.2, 0]}><boxGeometry args={[16.4, 0.4, 2.2]} /></mesh>
      <mesh material={M.steel} position={[8.8, 1.2, 0]}><boxGeometry args={[1.2, 0.25, 0.3]} /></mesh>
      {c.type === 'box' && <>
        <mesh material={c.k % 2 ? M.rust : M.rust2} position={[0, 3.2, 0]}><boxGeometry args={[15.6, 3.7, 3.0]} /></mesh>
        <mesh material={M.gray} position={[0, 5.1, 0]}><boxGeometry args={[15.8, 0.2, 2.5]} /></mesh>
        {[1, -1].map((sd) => <mesh key={sd} material={M.tan} position={[0, 3.1, sd * 1.52]}><boxGeometry args={[3.4, 3.2, 0.06]} /></mesh>)}
        {Array.from({ length: 9 }, (_, r) => [1, -1].map((sd) => <mesh key={`${r}${sd}`} material={M.dark} position={[-7 + r * 1.75, 3.2, sd * 1.52]}><boxGeometry args={[0.12, 3.5, 0.05]} /></mesh>))}
      </>}
      {c.type === 'tank' && <>
        <mesh material={M.tank} position={[0, 3.0, 0]} rotation-z={Math.PI / 2}><capsuleGeometry args={[1.55, 12.6, 6, 18]} /></mesh>
        <mesh material={M.dark} position={[0, 4.65, 0]}><cylinderGeometry args={[0.55, 0.65, 0.35, 10]} /></mesh>
        <mesh material={M.steel} position={[0, 4.95, 0]}><boxGeometry args={[11, 0.1, 0.5]} /></mesh>
      </>}
      {c.type === 'cont' && <>
        {[-3.9, 3.9].map((ox, j) => <mesh key={ox} material={[M.c1, M.c2, M.c3, M.c4][(c.k + j) % 4]!} position={[ox, 2.75, 0]}><boxGeometry args={[7.4, 2.6, 2.5]} /></mesh>)}
        {[-3.9, 3.9].flatMap((ox) => Array.from({ length: 7 }, (_, r) => [1, -1].map((sd) => <mesh key={`${ox}${r}${sd}`} material={M.dark} position={[ox - 3 + r, 2.75, sd * 1.27]}><boxGeometry args={[0.1, 2.4, 0.04]} /></mesh>)))}
      </>}
    </group>)}
  </group>;
}

function RailX({ index }: { index: number }) {
  const { sim, bend, night } = useAtl();
  const r = sim.rails[index]!;
  const lay = sim.lay;
  const grp = useRef<THREE.Group>(null), gateR = useRef<THREE.Group>(null), gateL = useRef<THREE.Group>(null), train = useRef<THREE.Group>(null);
  const lampsOn = useRef<(THREE.Mesh | null)[]>([]), gateLamps = useRef<(THREE.Mesh | null)[]>([]);
  const M = useMemo(() => {
    const st = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => bendMaterial(new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o }), bend);
    return {
      red: bendMaterial(new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false }), bend), redOff: st('#4a1511', { roughness: 0.5 }), dark: st('#24262a', { roughness: 0.6, metalness: 0.5 }),
      white: st('#f4f1ea'), arm: st('#f4f1ea', { roughness: 0.55 }), armRed: st('#d3221a', { roughness: 0.55 }), pole: st('#9aa0a6', { roughness: 0.5, metalness: 0.7 }),
      rail: st('#8f8d89', { roughness: 0.35, metalness: 0.85 }), tie: st('#4b3a2b', { roughness: 0.95 }), ballast: st('#8a867e', { roughness: 1 }), panel: st('#2c2d31', { roughness: 0.9 }), panelEdge: st('#9a978f', { roughness: 0.9 }),
      cbA: bendMaterial(new THREE.MeshStandardMaterial({ map: crossbuckTexture('RAILROAD'), roughness: 0.5 }), bend), cbB: bendMaterial(new THREE.MeshStandardMaterial({ map: crossbuckTexture('CROSSING'), roughness: 0.5 }), bend),
    };
  }, [bend]);
  const span = lay.padR - lay.padL;
  const sw = lay.sidewalks ? 2.8 : 0.0;
  const xa = lay.padL - sw - 0.2, xb = lay.padR + sw + 0.2;       // the road between these x
  const gateSpan = span / 2 + 0.2;
  const ties = useRef<THREE.InstancedMesh>(null);
  const tieN = 110;
  const tieGeo = useMemo(() => new THREE.BoxGeometry(0.26, 0.16, 2.7), []);
  useEffect(() => {
    const m = ties.current; if (!m) return; const q = new THREE.Matrix4(); let i = 0;
    for (const side of [-1, 1]) for (let k = 0; k < tieN / 2; k++) { q.makeTranslation((side > 0 ? xb : xa) + side * (0.5 + k * 0.62), 0.07, 0); m.setMatrixAt(i++, q); }
    m.instanceMatrix.needsUpdate = true;
  }, [xa, xb]);
  useFrame(({ clock }) => {
    const g = grp.current; if (!g) return; const rel = r.d - sim.traveled; g.visible = rel < AHEAD && rel > -BEHIND; g.position.z = sim.traveled - r.d;
    const active = r.phase === 'warn' || r.phase === 'down' || r.phase === 'train';
    const flash = Math.floor(clock.elapsedTime * 1.6) % 2 === 0;
    lampsOn.current.forEach((m, i) => { if (m) m.visible = active && (i % 2 === 0 ? flash : !flash); });
    gateLamps.current.forEach((m, i) => { if (m) m.visible = active && (i % 2 === 0 ? flash : !flash); });
    const down = r.phase === 'down' || r.phase === 'train' ? 1 : r.phase === 'warn' ? clamp((r.t - 1.0) / 1.5, 0, 1) : r.phase === 'up' ? 1 - clamp(r.t / 1.6, 0, 1) : 0;
    const ang = (1 - down) * 1.4;
    if (gateR.current) gateR.current.rotation.z = -ang; if (gateL.current) gateL.current.rotation.z = ang;
    const tr = train.current; if (tr) { tr.visible = r.phase === 'train'; tr.position.x = r.trainX; }
    void night;
  });
  const lanesX = lay.xs;
  return <>
    {/* road surface across the tracks, markings before them (these sit outside the group: they place themselves) */}
    <Decal kind="stopbar" d={r.d - 6.6} x={(lanesX[0]! + lanesX[lanesX.length - 1]!) / 2} w={lanesX[lanesX.length - 1]! - lanesX[0]! + LANE} l={0.5} />
    {lanesX.map((lx, i) => <Decal key={i} kind="rrx" d={r.d - 14} x={lx} w={LANE - 0.5} l={7} />)}
    <group ref={grp}>
      {/* ballast, ties and rails: two steel rails running across the road, ties and gravel beyond the pavement */}
      <mesh material={M.ballast} position={[(xb + 200) / 2 - 0, 0.03, 0]}><boxGeometry args={[200 - xb, 0.08, 3.9]} /></mesh>
      <mesh material={M.ballast} position={[(xa - 200) / 2 + 0, 0.03, 0]}><boxGeometry args={[xa + 200, 0.08, 3.9]} /></mesh>
      <instancedMesh ref={ties} args={[tieGeo, M.tie, tieN]} frustumCulled={false} />
      {[-0.72, 0.72].map((z) => <mesh key={z} material={M.rail} position={[0, 0.12, z]}><boxGeometry args={[400, 0.17, 0.13]} /></mesh>)}
      {[-0.72, 0.72].map((z) => <mesh key={`b${z}`} material={M.rail} position={[0, 0.045, z]}><boxGeometry args={[400, 0.05, 0.3]} /></mesh>)}
      {/* the crossing surface: dark panels with a lighter edge, flush with the road */}
      <mesh material={M.panel} position={[(xa + xb) / 2, 0.026, 0]} renderOrder={3}><boxGeometry args={[xb - xa, 0.03, 3.6]} /></mesh>
      {[-1.9, 1.9].map((z) => <mesh key={z} material={M.panelEdge} position={[(xa + xb) / 2, 0.029, z]} renderOrder={3}><boxGeometry args={[xb - xa, 0.03, 0.22]} /></mesh>)}
      {[-1.18, -0.26, 0.26, 1.18].map((z) => <mesh key={`g${z}`} material={M.dark} position={[(xa + xb) / 2, 0.045, z]} renderOrder={4}><boxGeometry args={[xb - xa, 0.012, 0.1]} /></mesh>)}
      {/* a crossbuck, flashers and a gate on each side, on the near side of the tracks */}
      {[1, -1].map((s) => {
        const x = s > 0 ? lay.padR + 0.55 : lay.padL - 0.55; const gate = s > 0 ? gateR : gateL;
        return <group key={s} position={[x, 0, 5.2]}>
          <mesh material={M.pole} position={[0, 1.95, 0]}><cylinderGeometry args={[0.09, 0.11, 3.9, 10]} /></mesh>
          {/* crossbuck: two crossed blades in front of the mast */}
          <mesh material={M.cbA} position={[0, 3.55, 0.12]} rotation-z={0.62}><boxGeometry args={[1.9, 0.3, 0.05]} /></mesh>
          <mesh material={M.cbB} position={[0, 3.55, 0.17]} rotation-z={-0.62}><boxGeometry args={[1.9, 0.3, 0.05]} /></mesh>
          {/* the flasher bar: two red lamps in black hoods */}
          <mesh material={M.dark} position={[0, 2.55, 0.1]}><boxGeometry args={[1.25, 0.58, 0.1]} /></mesh>
          {[-0.34, 0.34].map((lx, li) => <group key={li} position={[lx, 2.55, 0.17]}>
            <mesh material={M.redOff} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.2, 0.2, 0.05, 18]} /></mesh>
            <mesh ref={(m) => { lampsOn.current[(s > 0 ? 0 : 2) + li] = m; }} material={M.red} rotation-x={Math.PI / 2} position={[0, 0, 0.03]} visible={false}><cylinderGeometry args={[0.19, 0.19, 0.05, 18]} /></mesh>
            <mesh material={M.dark} rotation-x={Math.PI / 2} position={[0, 0.17, 0.05]}><cylinderGeometry args={[0.24, 0.22, 0.05, 14, 1, true]} /></mesh>
          </group>)}
          {/* gate mechanism cabinet and the arm, striped red and white, with three lamps */}
          <mesh material={M.dark} position={[0, 0.55, -0.1]}><boxGeometry args={[0.45, 1.1, 0.4]} /></mesh>
          <group ref={gate} position={[0, 1.05, 0.2]}>
            <mesh material={M.arm} position={[(s > 0 ? -1 : 1) * gateSpan / 2, 0, 0]}><boxGeometry args={[gateSpan, 0.1, 0.06]} /></mesh>
            {Array.from({ length: 8 }, (_, k) => <mesh key={k} material={M.armRed} position={[(s > 0 ? -1 : 1) * (gateSpan * (0.07 + k * 0.125)), 0, 0.005]}><boxGeometry args={[gateSpan * 0.063, 0.105, 0.065]} /></mesh>)}
            {[0.3, 0.62, 0.94].map((f, li) => <mesh key={li} ref={(m) => { gateLamps.current[(s > 0 ? 0 : 3) + li] = m; }} material={M.red} position={[(s > 0 ? -1 : 1) * gateSpan * f, 0.1, 0.04]} visible={false}><sphereGeometry args={[0.09, 10, 8]} /></mesh>)}
            <mesh material={M.dark} position={[(s > 0 ? 1 : -1) * 0.35, 0, 0]}><boxGeometry args={[0.7, 0.3, 0.2]} /></mesh>
          </group>
        </group>;
      })}
      <Train bend={bend} group={train} />
    </group>
  </>;
}
export function Rails() { const { sim } = useAtl(); return <>{sim.rails.map((_, i) => <RailX key={i} index={i} />)}</>; }

// ------------------------------------------------------------------ traffic circles ---
function CircleX({ index }: { index: number }) {
  const { sim, bend } = useAtl();
  const c = sim.circles[index]!, lay = sim.lay;
  const ix = lay.kind === 'divided' ? (lay.medianL + lay.medianR) / 2 : -3.9;
  const grp = useRef<THREE.Group>(null);
  const M = useMemo(() => ({
    curb: bendMaterial(new THREE.MeshStandardMaterial({ color: '#d8d5cc', roughness: 0.9 }), bend), grass: bendMaterial(new THREE.MeshStandardMaterial({ color: '#6f9a4b', roughness: 1 }), bend),
    trunk: bendMaterial(new THREE.MeshStandardMaterial({ color: '#5b412c', roughness: 1 }), bend), leaf: bendMaterial(new THREE.MeshStandardMaterial({ color: '#4f8f46', roughness: 0.95, flatShading: true }), bend),
    ring: bendMaterial(new THREE.MeshBasicMaterial({ color: '#f3f1ea', transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), bend),
    stone: bendMaterial(new THREE.MeshStandardMaterial({ color: '#b4ac9c', roughness: 0.95 }), bend),
  }), [bend]);
  const ringGeo = useMemo(() => { const g = new THREE.RingGeometry(5.3, 5.5, 64, 1, 0, Math.PI * 1.7); g.rotateX(-Math.PI / 2); return g; }, []);
  useFrame(() => { const g = grp.current; if (!g) return; const rel = c.d + 4 - sim.traveled; g.visible = rel < AHEAD && rel > -BEHIND - 10; g.position.z = sim.traveled - (c.d + 4); });
  return <>
    <group ref={grp} position={[ix, 0, 0]}>
      <mesh material={M.curb} position={[0, 0.1, 0]}><cylinderGeometry args={[3.4, 3.5, 0.24, 36]} /></mesh>
      <mesh material={M.grass} position={[0, 0.24, 0]}><cylinderGeometry args={[3.1, 3.1, 0.1, 36]} /></mesh>
      <mesh material={M.stone} position={[0, 0.5, 0]}><cylinderGeometry args={[1.2, 1.4, 0.6, 14]} /></mesh>
      <mesh material={M.trunk} position={[0, 1.8, 0]}><cylinderGeometry args={[0.16, 0.26, 2.6, 7]} /></mesh>
      <mesh material={M.leaf} position={[0, 3.7, 0]}><icosahedronGeometry args={[1.9, 1]} /></mesh>
      <mesh material={M.ring} geometry={ringGeo} position={[0, 0.04, 0]} renderOrder={3} />
      {Array.from({ length: 6 }, (_, k) => <mesh key={k} material={M.curb} position={[Math.cos(k * 1.047) * 3.7, 0.3, Math.sin(k * 1.047) * 3.7]}><boxGeometry args={[0.4, 0.5, 0.4]} /></mesh>)}
    </group>
    <Decal kind="yield" d={c.d - 5.2} x={lay.xs[Math.min(lay.xs.length - 1, lay.xs.length - 1)]!} w={LANE} l={1.6} />
  </>;
}
export function Circles() { const { sim } = useAtl(); return <>{sim.circles.map((_, i) => <CircleX key={i} index={i} />)}</>; }

// ------------------------------------------------------------------ stoplights and stop signs ---
function LightX({ index }: { index: number }) {
  const { sim, bend } = useAtl();
  const l = sim.lights[index]!, lay = sim.lay;
  const grp = useRef<THREE.Group>(null), lamps = useRef<(THREE.Mesh | null)[]>([]);
  const M = useMemo(() => ({ pole: bendMaterial(new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.5, metalness: 0.6 }), bend), box: bendMaterial(new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.6 }), bend), r: bendMaterial(new THREE.MeshBasicMaterial({ color: '#ff3b2a', toneMapped: false }), bend), y: bendMaterial(new THREE.MeshBasicMaterial({ color: '#ffc21a', toneMapped: false }), bend), g: bendMaterial(new THREE.MeshBasicMaterial({ color: '#3dff7a', toneMapped: false }), bend), off: bendMaterial(new THREE.MeshBasicMaterial({ color: '#2a2a2e' }), bend) }), [bend]);
  useFrame(() => {
    const g = grp.current; if (!g) return; const rel = l.d - sim.traveled; g.visible = rel < AHEAD && rel > -BEHIND; g.position.z = sim.traveled - l.d;
    const st = l.state;
    [['red', 0], ['yellow', 1], ['green', 2]].forEach(([n, i]) => { const m = lamps.current[i as number]; if (m) m.material = st === n ? [M.r, M.y, M.g][i as number]! : M.off; });
  });
  const armX = lay.padR + 0.8, headX = lay.xs[lay.xs.length - 1]!;
  return <>
    <Crossing d={l.d} />
    <group ref={grp} position={[0, 0, -6]}>
      <mesh material={M.pole} position={[armX, 3.6, 0]}><cylinderGeometry args={[0.14, 0.2, 7.2, 8]} /></mesh>
      <mesh material={M.pole} position={[(armX + headX) / 2, 6.9, 0]}><boxGeometry args={[armX - headX + 0.6, 0.2, 0.2]} /></mesh>
      <group position={[headX, 6.1, 0.15]}>
        <mesh material={M.box}><boxGeometry args={[0.55, 1.5, 0.4]} /></mesh>
        {[0, 1, 2].map((i) => <mesh key={i} ref={(m) => { lamps.current[i] = m; }} material={M.off} position={[0, 0.45 - i * 0.45, 0.22]}><sphereGeometry args={[0.17, 12, 8]} /></mesh>)}
      </group>
      <group position={[lay.xs[0]! , 6.1, 0.15]}>
        <mesh material={M.box}><boxGeometry args={[0.55, 1.5, 0.4]} /></mesh>
        {[0, 1, 2].map((i) => <mesh key={i} ref={(m) => { lamps.current[3 + i] = m; if (m) { /* mirrors the main head */ } }} material={M.off} position={[0, 0.45 - i * 0.45, 0.22]}><sphereGeometry args={[0.17, 12, 8]} /></mesh>)}
      </group>
    </group>
    <MirrorLamps lamps={lamps} />
  </>;
}
function MirrorLamps({ lamps }: { lamps: { current: (THREE.Mesh | null)[] } }) {
  useFrame(() => { for (let i = 0; i < 3; i++) { const a = lamps.current[i], b = lamps.current[3 + i]; if (a && b) b.material = a.material; } });
  return null;
}
export function Lights() { const { sim } = useAtl(); return <>{sim.lights.map((_, i) => <LightX key={i} index={i} />)}</>; }

function StopX({ index }: { index: number }) {
  const { sim, bend } = useAtl();
  const s = sim.stops[index]!, lay = sim.lay;
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); } g.closePath(); g.fill(); g.fillStyle = '#c8102e'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); } g.closePath(); g.fill(); g.fillStyle = '#fff'; g.font = '800 78px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 128, 134); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }, []);
  const mat = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, transparent: true, alphaTest: 0.1, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.1 }), bend), [tex, bend]);
  const post = useBent(() => new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.5, metalness: 0.7 }));
  useFrame(() => { const g = grp.current; if (!g) return; const rel = s.d - sim.traveled; g.visible = rel < AHEAD && rel > -BEHIND; g.position.z = sim.traveled - s.d; });
  return <>
    <Crossing d={s.d} />
    <group ref={grp} position={[lay.edgeR + (lay.sidewalks ? 1.1 : 1.4), 0, -3]}>
      <mesh material={post} position={[0, 1.4, -0.09]}><boxGeometry args={[0.1, 2.8, 0.1]} /></mesh>
      <mesh material={mat} position={[0, 2.9, 0.005]}><planeGeometry args={[0.9, 0.9]} /></mesh>
    </group>
  </>;
}
export function Stops() { const { sim } = useAtl(); return <>{sim.stops.map((_, i) => <StopX key={i} index={i} />)}</>; }

// ------------------------------------------------------------------ people in the crosswalk ---
function PedX({ index }: { index: number }) {
  const { sim, bend } = useAtl();
  const p = sim.peds[index]!, lay = sim.lay, cx = (lay.padL + lay.padR) / 2;
  const grp = useRef<THREE.Group>(null), legs = useRef<(THREE.Mesh | null)[]>([]);
  const colors = ['#c8102e', '#1f6fd0', '#f2c14e', '#2e9b5f', '#7a3fb8', '#e85d1c'];
  const body = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ color: colors[p.look % colors.length]!, roughness: 0.8 }), bend), [bend, p.look]);   // eslint-disable-line react-hooks/exhaustive-deps
  const skin = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ color: ['#e0b48a', '#b9835a', '#8a5a3a', '#f0cba5'][p.look % 4]!, roughness: 0.7 }), bend), [bend, p.look]);
  const dark = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ color: '#2a2d3a', roughness: 0.8 }), bend), [bend]);
  const sign = useBent(() => new THREE.MeshStandardMaterial({ color: '#e6ff2a', roughness: 0.6 }));
  const post = useBent(() => new THREE.MeshStandardMaterial({ color: '#8f959b', roughness: 0.5, metalness: 0.7 }));
  const signRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = grp.current; if (!g) return; const rel = p.d - sim.traveled; g.visible = rel < AHEAD && rel > -BEHIND && p.state !== 'done';
    g.position.set(p.x, 0, sim.traveled - p.d); g.rotation.y = Math.sign(p.toX - p.fromX) * -Math.PI / 2 * 0 + (p.toX < p.fromX ? Math.PI / 2 : -Math.PI / 2);
    const w = p.state === 'walk' ? Math.sin(clock.elapsedTime * 7 + p.look) * 0.5 : 0; legs.current.forEach((m, i) => { if (m) m.rotation.x = w * (i ? -1 : 1); });
    const s = signRef.current; if (s) { s.visible = rel < AHEAD && rel > -BEHIND; s.position.z = sim.traveled - p.d; }
  });
  return <>
    <Crossing d={p.d - 4.8 + 4.8 - 4.8 + 4.8} stopLine={false} street={false} />
    <group ref={grp}>
      <mesh material={body} position={[0, 1.15, 0]}><capsuleGeometry args={[0.22, 0.62, 4, 8]} /></mesh>
      <mesh material={skin} position={[0, 1.78, 0]}><sphereGeometry args={[0.15, 12, 10]} /></mesh>
      {[-0.1, 0.1].map((lx, i) => <mesh key={i} ref={(m) => { legs.current[i] = m; }} material={dark} position={[lx, 0.4, 0]}><capsuleGeometry args={[0.08, 0.5, 3, 6]} /></mesh>)}
    </group>
    <group ref={signRef} position={[lay.padR + 0.9, 0, 0]}>
      <mesh material={post} position={[0, 1.5, -0.1]}><boxGeometry args={[0.1, 3.0, 0.1]} /></mesh>
      <mesh material={sign} position={[0, 2.9, 0]} rotation-z={Math.PI / 4}><boxGeometry args={[0.9, 0.9, 0.05]} /></mesh>
    </group>
    <group visible={false} position={[cx, 0, 0]} />
  </>;
}
export function Peds() { const { sim } = useAtl(); return <>{sim.peds.map((_, i) => <PedX key={i} index={i} />)}</>; }

// ------------------------------------------------------------------ the player's own car ---
export function PlayerRig({ carId, lite, rig }: { carId: GarageId; lite: boolean; rig: { current: THREE.Group | null } }) {
  const { sim } = useAtl();
  return <Suspense fallback={null}><PlayerCar sim={sim as unknown as RunSim} carId={carId} lite={lite} rig={rig} /></Suspense>;
}
void DIM;
export type { Veh };
