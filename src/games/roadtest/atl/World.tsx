/**
 * The Atlanta world: the road, the median, the barriers, the towers, the trees, the lamps, the bridges, the billboards and the skyline.
 * Everything bends with the road (see path.ts), so a straight rules engine drives a road that curves and rolls like I-285 or I-20.
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { Clouds, Moon, ShootingStars, SkyDome, Stars, Sun } from '../g3d/sky';
import { Weather } from '../g3d/weather';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import { apply as applyAtmo, atmo, tickAtmo, type WeatherKind } from '../g3d/atmo';
import type { Quality } from '../../../components/nuhome2/world/quality';
import { TOD_MIX, type TimeOfDay } from '../g3d/themes';
import { facade, groundTexture, glowTexture } from '../g3d/textures';
import { clamp, facadeBox, hash, hideInst, setInst, smooth } from '../g3d/util';
import type { RunSim } from '../g3d/sim';
import { Bloom } from '../g3d/Bloom';
import { bendMaterial, makeBend, PATHS, pathXd, stepBend, type BendUniforms, type PathSpec } from './path';
import { LANE } from './layout';
import { adTexture, ROAD_TILE, roadTexture, skylineTexture } from './textures';
import type { AtlSim } from './sim';
import type { AtlStage } from './stageTypes';

export const AHEAD = 260;
export const BEHIND = 45;

export interface Ctx { sim: AtlSim; stage: AtlStage; bend: BendUniforms; spec: PathSpec; quality: Quality; night: { current: number } }
export const AtlCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAtl = () => useContext(AtlCtx);

/** Make a material follow the road's bend once, whatever component made it. */
export function useBent<M extends THREE.Material>(mat: M | (() => M), deps: unknown[] = []): M {
  const { bend } = useAtl();
  return useMemo(() => bendMaterial(typeof mat === 'function' ? (mat as () => M)() : mat, bend), [bend, ...deps]);   // eslint-disable-line react-hooks/exhaustive-deps
}

// ------------------------------------------------------------------ light, fog and weather ---
const FOG: Record<TimeOfDay, string> = { day: '#f1e6cf', golden: '#f4d39a', dusk: '#c98f84', night: '#0d1440' };
const SUN: Record<TimeOfDay, { color: string; k: number }> = { day: { color: '#ffe6bf', k: 2.6 }, golden: { color: '#ffc983', k: 2.6 }, dusk: { color: '#ff9d6e', k: 1.6 }, night: { color: '#9db8ff', k: 0.55 } };
const ORDER: TimeOfDay[] = ['day', 'golden', 'dusk', 'night'];
const SUN_C = ORDER.map((t) => new THREE.Color(SUN[t].color)), FOG_C = ORDER.map((t) => new THREE.Color(FOG[t]));
function todAt(m: number, fog: THREE.Color, sun: THREE.Color): number {
  const keys = ORDER.map((t) => TOD_MIX[t]);
  let i = 0; while (i < keys.length - 2 && m > keys[i + 1]!) i++;
  const k = clamp((m - keys[i]!) / (keys[i + 1]! - keys[i]!), 0, 1);
  fog.copy(FOG_C[i]!).lerp(FOG_C[i + 1]!, k); sun.copy(SUN_C[i]!).lerp(SUN_C[i + 1]!, k);
  return SUN[ORDER[i]!].k + (SUN[ORDER[i + 1]!].k - SUN[ORDER[i]!].k) * k;
}

function Atmosphere({ shadow, mix }: { shadow: number; mix: { current: number } }) {
  const { stage } = useAtl();
  const { scene, gl } = useThree();
  const amb = useRef<THREE.AmbientLight>(null), hemi = useRef<THREE.HemisphereLight>(null), dir = useRef<THREE.DirectionalLight>(null), fill = useRef<THREE.DirectionalLight>(null);
  const c = useMemo(() => ({ fog: new THREE.Color(FOG[stage.tod]), sunC: new THREE.Color(SUN[stage.tod].color), grey: new THREE.Color('#b4bcc6'), greyN: new THREE.Color('#0d1226'), tmp: new THREE.Color() }), [stage.tod]);
  useEffect(() => { scene.fog = new THREE.Fog(FOG[stage.tod], 40, 250); scene.background = null; return () => { scene.fog = null; }; }, [scene, stage.tod]);
  useFrame((_, dt) => {
    tickAtmo(dt);
    mix.current += (TOD_MIX[stage.tod] - mix.current) * Math.min(1, dt * 2.5);
    const m = mix.current, L = atmo.look, deep = atmo.deep * smooth(0, 1, clamp((m - 0.8) / 0.2, 0, 1));
    const cl = L.cloud, dim = 1 - 0.5 * cl * (1 - m) - 0.12 * L.storm, flash = atmo.flash * L.storm;
    const fog = scene.fog as THREE.Fog | null;
    const sunK = todAt(m, c.fog, c.sunC);
    if (fog) {
      fog.color.copy(c.fog).lerp(c.tmp.copy(c.grey).lerp(c.greyN, m), Math.min(1, 0.55 * cl + 0.4 * L.fog) * (1 - 0.3 * smooth(0, 1, clamp(1 - Math.abs(m - 0.18) / 0.2, 0, 1))));
      if (flash > 0.01) fog.color.lerp(c.tmp.set('#dfe6ff'), flash * 0.5);
      fog.near = 46 - 40 * L.fog - 16 * L.rain - 12 * L.snow; fog.far = 255 - 205 * L.fog - 100 * L.rain - 80 * L.snow;
    }
    scene.environmentIntensity = (1 - 0.55 * deep) * (1 - 0.3 * Math.max(0, cl - 0.06)) * (1 - 0.1 * L.storm) * (1 - 0.4 * m) + flash * 0.5;
    gl.toneMappingExposure = (0.92 - 0.08 * deep) * (1 - 0.1 * L.storm);
    if (amb.current) amb.current.intensity = (0.5 - 0.3 * m) * (1 - 0.3 * deep) + flash * 1.6;
    if (hemi.current) hemi.current.intensity = (1.0 - 0.66 * m) * (1 - 0.4 * deep) * (0.9 + 0.1 * (1 - cl));
    if (dir.current) { dir.current.color.copy(c.sunC); dir.current.intensity = sunK * dim * (1 - 0.55 * deep) * (1 - 0.5 * L.rain * (1 - m)) + flash * 1.4; dir.current.position.set(-10, 17, 13); dir.current.target.position.set(0, 0, -6); dir.current.target.updateMatrixWorld(); }
    if (fill.current) fill.current.intensity = 0.5 * m * (1 - 0.55 * deep);
  });
  return <>
    <ambientLight ref={amb} color="#fff6ea" />
    <hemisphereLight ref={hemi} args={['#cfe6ff', '#d2c2a8', 1]} />
    <directionalLight ref={dir} castShadow={shadow > 0} shadow-mapSize-width={shadow || 16} shadow-mapSize-height={shadow || 16} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={18} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={60} shadow-bias={-0.0005} shadow-normalBias={0.04} />
    <directionalLight ref={fill} position={[10, 9, 8]} color="#b8c8ff" />
  </>;
}

function SkyKit({ lite }: { lite: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { g.current?.position.copy(camera.position); });
  return <group ref={g}>
    <SkyDome /><Stars count={lite ? 2200 : 5200} /><ShootingStars />
    <Sun position={[34, 30, -78]} /><Moon position={[-30, 32, -68]} /><Clouds count={lite ? 10 : 20} />
  </group>;
}

// ------------------------------------------------------------------ the skyline on the horizon ---
function Skyline() {
  const { stage, bend, spec, sim } = useAtl();
  const far = useRef<THREE.Mesh>(null), near = useRef<THREE.Mesh>(null);
  const farMat = useRef<THREE.MeshBasicMaterial>(null), nearMat = useRef<THREE.MeshBasicMaterial>(null), litMat = useRef<THREE.MeshBasicMaterial>(null);
  const night = useContext(NightCtx);
  const hills = useMemo(() => skylineTexture('hills', 3), []);
  const sky = useMemo(() => skylineTexture(stage.skyline === 'none' ? 'hills' : stage.skyline, 11), [stage.skyline]);
  const tint = useMemo(() => new THREE.Color(), []), haze = useMemo(() => new THREE.Color('#5d7088'), []);
  void bend;
  useFrame(({ camera, scene }) => {
    const fog = scene.fog as THREE.Fog | null;
    const h = pathXd(spec, sim.traveled) * 400;
    for (const [m, z, y, w, sc] of [[far.current, 300, 24, 1100, 0.9], [near.current, 262, 20, 900, 1]] as [THREE.Mesh | null, number, number, number, number][]) {
      if (!m) continue;
      m.position.set(camera.position.x * 0.9 - h * sc * 0.8, y + Math.max(0, camera.position.y - 3) * 0.5, camera.position.z - z);
      void w;
    }
    if (fog) {
      tint.copy(fog.color).multiplyScalar(0.84).lerp(haze, 0.2 * (1 - smooth(0, 160, fog.far - 90)));
      const op = clamp((fog.far - 70) / 150, 0, 0.95);
      if (farMat.current) { farMat.current.color.copy(tint).lerp(fog.color, 0.35); farMat.current.opacity = op * 0.7; }
      if (nearMat.current) { nearMat.current.color.copy(tint); nearMat.current.opacity = op; }
      if (litMat.current) litMat.current.opacity = clamp(night.current * 1.3 - 0.1, 0, 1) * op;
    }
  });
  const SH = 900 * (sky.height / sky.width) * 1.0;
  return <>
    <mesh ref={far} renderOrder={-6}><planeGeometry args={[1100, 1100 * (hills.height / hills.width)]} /><meshBasicMaterial ref={farMat} map={hills.sil} transparent depthWrite={false} fog={false} toneMapped={false} /></mesh>
    <mesh ref={near} renderOrder={-5}>
      <planeGeometry args={[900, SH]} /><meshBasicMaterial ref={nearMat} map={sky.sil} transparent depthWrite={false} fog={false} toneMapped={false} />
      <mesh position={[0, 0, 0.05]}><planeGeometry args={[900, SH]} /><meshBasicMaterial ref={litMat} map={sky.lit} transparent opacity={0} depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} /></mesh>
    </mesh>
  </>;
}

// ------------------------------------------------------------------ ground and road ---
const GROUND: Record<string, { c: string; k: number }> = { // [colour, how brown/green]
  carrollton: { c: '#8fae6c', k: 1 }, rural: { c: '#83a45e', k: 1 }, villarica: { c: '#7f9f5a', k: 1 }, douglasville: { c: '#86a763', k: 1 }, westside: { c: '#8a9a72', k: 1 }, downtown: { c: '#8d8f86', k: 0 }, midtown: { c: '#8d9084', k: 0 },
  buckhead: { c: '#8b9a7c', k: 1 }, perimeter: { c: '#8c9a7e', k: 1 }, airport: { c: '#9aa28a', k: 1 }, cobb: { c: '#86a068', k: 1 }, gwinnett: { c: '#88a46a', k: 1 }, henry: { c: '#8aa968', k: 1 }, stonemtn: { c: '#8aa26e', k: 1 }, intown: { c: '#889c70', k: 1 },
};

function Ground() {
  const { stage, sim } = useAtl();
  const g = GROUND[stage.region] ?? GROUND.carrollton!;
  const tex = useMemo(() => { const t = groundTexture(g.c).clone(); t.needsUpdate = true; t.repeat.set(80, 70); return t; }, [g.c]);
  const mat = useBent(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: '#8e8e8e' }), [tex]);
  const mesh = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => { const p = new THREE.PlaneGeometry(900, 640, 3, 160); p.rotateX(-Math.PI / 2); return p; }, []);
  useFrame(() => { tex.offset.y = ((sim.traveled / 8) % 1); });
  void mesh;
  return <mesh geometry={geo} position={[0, -0.06, -250]} material={mat} receiveShadow />;
}

function RoadSurface() {
  const { stage, sim } = useAtl();
  const lay = sim.lay;
  const night = useContext(NightCtx);
  const own = useMemo(() => roadTexture(lay, { concrete: stage.road === 'interstate' && stage.region !== 'downtown' && stage.region !== 'midtown' && hash(stage.id.length, 4) > 0.55 && false, hov: !!stage.hov, rural: stage.road === 'rural', seed: 7 + stage.id.length, passing: stage.road === 'rural' }), [lay, stage]);
  const opp = useMemo(() => (lay.kind === 'divided' ? roadTexture(lay, { concrete: false, hov: false, rural: false, seed: 19 + stage.id.length, opposite: true }) : null), [lay, stage]);
  const mats = useMemo(() => [own, opp].filter(Boolean).map((r) => new THREE.MeshStandardMaterial({ map: r!.map, roughness: 0.9, metalness: 0, color: '#ffffff' })), [own, opp]);
  const { bend } = useAtl();
  useMemo(() => mats.forEach((m) => bendMaterial(m, bend)), [mats, bend]);
  const LEN = 420, SEG = 140;
  const geoFor = (x0: number, x1: number) => { const g = new THREE.PlaneGeometry(x1 - x0, LEN, 1, SEG); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, -(LEN / 2 - 60)); return g; };
  const geos = useMemo(() => [geoFor(own.x0, own.x1), ...(opp ? [geoFor(opp.x0, opp.x1)] : [])], [own, opp]);   // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    const rain = atmo.look.rain, snow = atmo.look.snow;
    const off = (sim.traveled / ROAD_TILE) % 1;
    [own, opp].forEach((r, i) => { if (!r) return; r.map.repeat.set(1, LEN / ROAD_TILE); r.map.offset.y = off; const m = mats[i]!; m.roughness = 0.92 - 0.55 * rain; m.metalness = 0.0; m.color.setScalar(1 - 0.22 * rain + 0.0); if (snow > 0.2) m.color.lerp(new THREE.Color('#d8dde4'), snow * 0.4); });
    void night;
  });
  return <>{geos.map((g, i) => <mesh key={i} geometry={g} material={mats[i]!} position={[0, 0.0, 0]} receiveShadow renderOrder={1} />)}</>;
}

/** The ribbon beside the pavement: sidewalks on city streets, gravel on the shoulder of country roads, a grass median in the middle of a boulevard. */
function Edges() {
  const { sim, stage, bend } = useAtl();
  const lay = sim.lay;
  const mats = useMemo(() => ({
    walk: bendMaterial(new THREE.MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.95 }), bend),
    curb: bendMaterial(new THREE.MeshStandardMaterial({ color: '#d7d4cb', roughness: 0.9 }), bend),
    grass: bendMaterial(new THREE.MeshStandardMaterial({ color: '#7fa05b', roughness: 1 }), bend),
    gravel: bendMaterial(new THREE.MeshStandardMaterial({ color: '#8a7f6c', roughness: 1 }), bend),
  }), [bend]);
  const LEN = 420, SEG = 140;
  const strip = (x0: number, x1: number, y = 0.02) => { const g = new THREE.PlaneGeometry(x1 - x0, LEN, 1, SEG); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, -(LEN / 2 - 60)); return g; };
  const geos = useMemo(() => {
    const out: { g: THREE.BufferGeometry; m: THREE.Material }[] = [];
    if (lay.sidewalks) {
      out.push({ g: strip(lay.edgeR, lay.edgeR + 2.6, 0.14), m: mats.walk }, { g: strip(lay.edgeL - 2.6, lay.edgeL, 0.14), m: mats.walk });
    } else if (stage.road === 'rural') { out.push({ g: strip(lay.edgeR, lay.edgeR + 2.4, 0.01), m: mats.gravel }, { g: strip(lay.edgeL - 2.4, lay.edgeL, 0.01), m: mats.gravel }); }
    if (lay.kind === 'divided' && stage.road === 'arterial') out.push({ g: strip(lay.medianL, lay.medianR, 0.16), m: mats.grass });
    return out;
  }, [lay, stage.road, mats]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <>{geos.map((o, i) => <mesh key={i} geometry={o.g} material={o.m} receiveShadow />)}</>;
}

// ------------------------------------------------------------------ recycled scenery ---
export interface Slot { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; color?: THREE.Color }

/**
 * Scenery that repeats. The world is cut into cells of `spacing` metres; the meshes hold a fixed window of cells and rewrite their instances
 * when the car crosses a cell boundary. Between boundaries only the parent group moves, so a long road costs almost nothing.
 */
export function Repeat({ geometry, material, spacing, per = 1, ahead = AHEAD, behind = BEHIND, make, shadow = false, order }: {
  geometry: THREE.BufferGeometry; material: THREE.Material; spacing: number; per?: number; ahead?: number; behind?: number; make: (cell: number, k: number) => Slot | null; shadow?: boolean; order?: number;
}) {
  const { sim, bend } = useAtl();
  const cellsAhead = Math.ceil(ahead / spacing), cellsBehind = Math.ceil(behind / spacing);
  const n = (cellsAhead + cellsBehind + 1) * per;
  const holder = useRef<THREE.Group>(null), mesh = useRef<THREE.InstancedMesh>(null), first = useRef(-1e9), colored = useRef(false);
  const mat = useMemo(() => bendMaterial(material, bend), [material, bend]);
  useLayoutEffect(() => { if (mesh.current) { mesh.current.frustumCulled = false; first.current = -1e9; } }, [n, make]);
  useFrame(() => {
    const m = mesh.current, g = holder.current; if (!m || !g) return;
    g.position.z = sim.traveled;
    const f = Math.floor((sim.traveled - cellsBehind * spacing) / spacing);
    if (f === first.current) return; first.current = f;
    let i = 0;
    for (let c = f; c < f + cellsAhead + cellsBehind + 1; c++) for (let k = 0; k < per; k++) {
      const s = make(c, k);
      if (!s) { hideInst(m, i++); continue; }
      setInst(m, i, s.x, s.y, -(c * spacing + s.z), s.ry, s.sx, s.sy, s.sz);
      if (s.color) { m.setColorAt(i, s.color); colored.current = true; }
      i++;
    }
    m.instanceMatrix.needsUpdate = true; if (colored.current && m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <group ref={holder}><instancedMesh ref={mesh} args={[geometry, mat, n]} castShadow={shadow} receiveShadow={shadow} renderOrder={order} /></group>;
}

const colOf = (hex: string, j = 0, seed = 0) => { const c = new THREE.Color(hex); if (j) c.offsetHSL(0, 0, (hash(seed, 3) - 0.5) * j); return c; };
const FLOORS = [3, 5, 8, 12, 18, 26, 38];
const URBAN: Record<string, { floors: number[]; gap: number; row2: boolean; glass: number }> = {
  downtown: { floors: [3, 4, 5, 6], gap: 0.1, row2: true, glass: 0.8 }, midtown: { floors: [2, 3, 4, 5, 6], gap: 0.15, row2: true, glass: 0.8 }, buckhead: { floors: [1, 2, 3, 4, 5], gap: 0.25, row2: true, glass: 0.7 },
  perimeter: { floors: [1, 2, 3, 4], gap: 0.3, row2: true, glass: 0.8 }, airport: { floors: [0, 1], gap: 0.5, row2: false, glass: 0.4 }, cobb: { floors: [0, 1, 2], gap: 0.45, row2: false, glass: 0.4 },
  intown: { floors: [0, 1, 1], gap: 0.4, row2: false, glass: 0.3 }, gwinnett: { floors: [0, 1, 1], gap: 0.45, row2: false, glass: 0.4 }, westside: { floors: [0, 0, 1], gap: 0.6, row2: false, glass: 0.2 },
};

function Scenery() {
  const { sim, stage, quality, night } = useAtl();
  const lay = sim.lay, lite = quality.lite;
  const inter = stage.road === 'interstate', city = ['downtown', 'midtown', 'buckhead', 'perimeter'].includes(stage.region);
  const M = useMemo(() => {
    const f1 = facade('plain'), f2 = facade('glass');
    return {
      wall: new THREE.MeshStandardMaterial({ map: f1.map, emissiveMap: f1.emis, emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, roughness: 0.88 }),
      glass: new THREE.MeshStandardMaterial({ map: f2.map, emissiveMap: f2.emis, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.3, metalness: 0.3, envMapIntensity: 1.3 }),
      trunk: new THREE.MeshStandardMaterial({ color: '#5b412c', roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: stage.trees === 'fall' ? '#c1722b' : '#4f8f46', roughness: 0.95, flatShading: true }),
      leaf2: new THREE.MeshStandardMaterial({ color: '#6aa656', roughness: 0.95, flatShading: true }),
      pine: new THREE.MeshStandardMaterial({ color: '#2f6a3a', roughness: 0.95, flatShading: true }),
      pole: new THREE.MeshStandardMaterial({ color: '#8d9298', roughness: 0.45, metalness: 0.7 }),
      darkPole: new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.5, metalness: 0.6 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0.3, roughness: 0.4 }),
      concrete: new THREE.MeshStandardMaterial({ color: '#c3c1ba', roughness: 0.95 }),
      concreteDark: new THREE.MeshStandardMaterial({ color: '#a9a7a0', roughness: 0.95 }),
      guard: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.5, metalness: 0.75 }),
      brick: new THREE.MeshStandardMaterial({ color: '#9a5a44', roughness: 0.95 }),
      white: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 }),
      roof: new THREE.MeshStandardMaterial({ color: '#5d4a40', roughness: 0.9, flatShading: true }),
      awning: new THREE.MeshStandardMaterial({ color: '#2c5b3a', roughness: 0.8 }),
      glow: new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffcf80', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
      pool: new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffd28a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
  }, [stage.trees]);
  const G = useMemo(() => ({
    trunk: (() => { const g = new THREE.CylinderGeometry(0.18, 0.3, 2.6, 7); g.translate(0, 1.3, 0); return g; })(),
    crown: (() => { const g = new THREE.IcosahedronGeometry(1.9, 1); g.translate(0, 4.0, 0); return g; })(),
    crown2: (() => { const g = new THREE.IcosahedronGeometry(1.35, 1); g.translate(0.3, 5.5, 0.1); return g; })(),
    pine: (() => { const g = new THREE.ConeGeometry(1.5, 8, 8); g.translate(0, 5.6, 0); return g; })(),
    pine2: (() => { const g = new THREE.ConeGeometry(1.1, 5, 8); g.translate(0, 8.4, 0); return g; })(),
    pole: (() => { const g = new THREE.CylinderGeometry(0.12, 0.2, 14, 8); g.translate(0, 7, 0); return g; })(),
    mast: (() => { const g = new THREE.CylinderGeometry(0.08, 0.14, 8.4, 8); g.translate(0, 4.2, 0); return g; })(),
    arm: (() => { const g = new THREE.BoxGeometry(2.4, 0.14, 0.14); g.translate(1.2, 8.35, 0); return g; })(),
    head: (() => { const g = new THREE.BoxGeometry(0.9, 0.14, 0.38); g.translate(2.3, 8.28, 0); return g; })(),
    arm2: (() => { const g = new THREE.BoxGeometry(5.4, 0.14, 0.14); g.translate(0, 13.9, 0); return g; })(),
    head2: (() => { const g = new THREE.BoxGeometry(1.1, 0.16, 0.4); g.translate(0, 13.8, 0); return g; })(),
    glow: new THREE.PlaneGeometry(3.4, 3.4),
    pool: (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; })(),
    jersey: (() => { const g = new THREE.BoxGeometry(0.6, 0.95, 6.0); g.translate(0, 0.475, 0); return g; })(),
    wall: (() => { const g = new THREE.BoxGeometry(0.5, 4.6, 8); g.translate(0, 2.3, 0); return g; })(),
    rail: (() => { const g = new THREE.BoxGeometry(0.16, 0.34, 6); g.translate(0, 0.62, 0); return g; })(),
    post: (() => { const g = new THREE.BoxGeometry(0.14, 0.7, 0.14); g.translate(0, 0.35, 0); return g; })(),
    box: (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })(),
    roof: (() => { const g = new THREE.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; })(),
    deck: (() => { const g = new THREE.BoxGeometry(1, 1.5, 15); g.translate(0, 0, 0); return g; })(),
    pier: (() => { const g = new THREE.BoxGeometry(1.4, 1, 3); g.translate(0, 0.5, 0); return g; })(),
    awning: (() => { const g = new THREE.BoxGeometry(1, 0.12, 1); g.translate(0, 0, 0.5); return g; })(),
    ramp: (() => { const g = new THREE.BoxGeometry(5, 0.9, 1); g.translate(0, 0, 0); return g; })(),
  }), []);
  const bGeo = useMemo(() => FLOORS.map((f) => facadeBox(f)), []);
  useFrame(() => {
    const nt = clamp(night.current * 1.25 - 0.1, 0, 1) + atmo.deep * 0.3;
    M.wall.emissiveIntensity = M.glass.emissiveIntensity = nt * 1.25;
    M.lamp.emissiveIntensity = 0.25 + nt * 2.4;
    M.glow.opacity = nt * 0.85; M.pool.opacity = nt * 0.5 * (1 - 0.4 * atmo.look.rain);
  });
  const urban = URBAN[stage.region];
  const right = lay.edgeR, left = lay.edgeL;
  const rightOff = lay.sidewalks ? 3 : inter ? 1.8 : 1.4, leftOff = lay.sidewalks ? 3 : inter ? 1.8 : 1.4;
  const treeProb = stage.trees === 'none' ? 0 : inter ? 0.6 : 0.7;
  const pines = stage.trees === 'pine' || (stage.trees === 'mixed' && false);
  const treeSlot = (cell: number, k: number): Slot | null => {
    const s = k === 0 ? -1 : 1; const h = hash(cell, 40 + k);
    if (h > treeProb) return null;
    const base = s > 0 ? right + rightOff + 3 : left - leftOff - 3;
    const dist = Math.abs(base) + hash(cell, 5 + k) * (inter ? 24 : 14);
    const sc = 0.85 + hash(cell, 9 + k) * 0.8;
    return { x: s * dist * (s > 0 ? 1 : 1) + (s > 0 ? 0 : 0) + (s > 0 ? (base > 0 ? 0 : 0) : 0), y: 0, z: hash(cell, 11 + k) * 8, ry: hash(cell, 13) * 6, sx: sc, sy: sc * (0.9 + hash(cell, 17) * 0.5), sz: sc, color: colOf(hash(cell, 19) > 0.5 ? '#ffffff' : '#dcebd0', 0.2, cell * 7 + k) };
  };
  // trees must sit outside the road on each side
  const treeSlotFixed = (cell: number, k: number): Slot | null => {
    const t = treeSlot(cell, k); if (!t) return null;
    const s = k === 0 ? -1 : 1; const off = s > 0 ? right + rightOff + 2.5 : left - leftOff - 2.5;
    return { ...t, x: off + s * (hash(cell, 5 + k) * (inter ? 26 : 14)) };
  };
  const lampSpace = inter ? 42 : 30;
  const wallsOn = inter && (city || stage.region === 'airport' || stage.region === 'cobb' || stage.region === 'intown');
  return <>
    {/* trees (pines in the pines of west Georgia, hardwoods and crowns elsewhere) */}
    {stage.trees !== 'none' && <>
      <Repeat geometry={G.trunk} material={M.trunk} spacing={8} per={2} make={treeSlotFixed} shadow={!lite} />
      {pines || stage.region === 'villarica' || stage.region === 'rural' || stage.region === 'henry'
        ? <><Repeat geometry={G.pine} material={M.pine} spacing={8} per={2} make={treeSlotFixed} shadow={!lite} /><Repeat geometry={G.pine2} material={M.pine} spacing={8} per={2} make={treeSlotFixed} /></>
        : <><Repeat geometry={G.crown} material={M.leaf} spacing={8} per={2} make={treeSlotFixed} shadow={!lite} /><Repeat geometry={G.crown2} material={M.leaf2} spacing={8} per={2} make={treeSlotFixed} /></>}
    </>}

    {/* the median: a concrete jersey barrier on an interstate, with tall double lamps standing on it */}
    {lay.kind === 'divided' && inter && <>
      <Repeat geometry={G.jersey} material={M.concrete} spacing={6} per={1} make={() => ({ x: (lay.medianL + lay.medianR) / 2, y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
      <Repeat geometry={G.pole} material={M.pole} spacing={lampSpace} per={1} make={() => ({ x: (lay.medianL + lay.medianR) / 2, y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
      <Repeat geometry={G.arm2} material={M.pole} spacing={lampSpace} per={1} make={() => ({ x: (lay.medianL + lay.medianR) / 2, y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
      <Repeat geometry={G.head2} material={M.lamp} spacing={lampSpace} per={2} make={(c, k) => ({ x: (lay.medianL + lay.medianR) / 2 + (k ? 2.4 : -2.4), y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
      <Repeat geometry={G.glow} material={M.glow} spacing={lampSpace} per={2} order={5} make={(c, k) => ({ x: (lay.medianL + lay.medianR) / 2 + (k ? 2.4 : -2.4), y: 13.2, z: 0, ry: 0, sx: 2.4, sy: 2.4, sz: 1 })} />
      <Repeat geometry={G.pool} material={M.pool} spacing={lampSpace} per={2} order={4} make={(c, k) => ({ x: lay.xs[Math.min(lay.xs.length - 1, k ? 1 : 0)]! + (k ? 0 : 0), y: 0.03, z: 0, ry: 0, sx: 12, sy: 1, sz: 24 })} />
    </>}
    {/* grass-median boulevards have lamps on the median instead */}
    {lay.kind === 'divided' && !inter && <Repeat geometry={G.mast} material={M.darkPole} spacing={lampSpace} per={1} make={() => ({ x: (lay.medianL + lay.medianR) / 2, y: 0, z: 0, ry: 0, sx: 1, sy: 0.9, sz: 1 })} />}

    {/* the edges of the road: guardrail on a country interstate, sound walls through the city, plain posts on a street */}
    {inter && !wallsOn && <>
      <Repeat geometry={G.rail} material={M.guard} spacing={6} per={2} make={(c, k) => ({ x: k ? right - 0.15 : left + 0.15, y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
      <Repeat geometry={G.post} material={M.concreteDark} spacing={3} per={2} make={(c, k) => ({ x: k ? right - 0.15 : left + 0.15, y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    </>}
    {inter && wallsOn && <Repeat geometry={G.wall} material={M.concrete} spacing={8} per={1} make={(c) => (hash(c, 2) < 0.12 ? null : { x: right + 0.8, y: 0, z: 0, ry: 0, sx: 1, sy: 0.75 + hash(c, 4) * 0.5, sz: 1 })} />}
    {inter && <Repeat geometry={G.pole} material={M.pole} spacing={lampSpace * 1.5} per={1} make={(c) => ({ x: right + (wallsOn ? 2.2 : 1.6), y: 0, z: 6 + hash(c, 1) * 0, ry: 0, sx: 0.8, sy: 0.7, sz: 0.8 })} />}
    {inter && <Repeat geometry={G.head} material={M.lamp} spacing={lampSpace * 1.5} per={1} make={(c) => ({ x: right + (wallsOn ? 2.2 : 1.6), y: 0, z: 6, ry: Math.PI, sx: 0.8, sy: 0.7, sz: 0.8 })} />}

    {/* streetlights and poles on city streets */}
    {!inter && [-1, 1].map((s) => {
      const mk = (cell: number): Slot => ({ x: s > 0 ? right + (lay.sidewalks ? 1.2 : 1.8) : left - (lay.sidewalks ? 1.2 : 1.8), y: 0, z: (s > 0 ? 0 : lampSpace / 2), ry: s > 0 ? Math.PI : 0, sx: 1, sy: 1, sz: 1 });
      return <group key={s}>
        <Repeat geometry={G.mast} material={M.darkPole} spacing={lampSpace} make={mk} />
        <Repeat geometry={G.arm} material={M.darkPole} spacing={lampSpace} make={mk} />
        <Repeat geometry={G.head} material={M.lamp} spacing={lampSpace} make={mk} />
        <Repeat geometry={G.glow} material={M.glow} spacing={lampSpace} order={5} make={(c) => { const q = mk(c); return { ...q, x: q.x + (q.ry ? -2.3 : 2.3), y: 8.2, ry: 0 }; }} />
        <Repeat geometry={G.pool} material={M.pool} spacing={lampSpace} order={4} make={(c) => { const q = mk(c); return { ...q, x: q.x + (q.ry ? -3 : 3), y: 0.04, ry: 0, sx: 10, sy: 1, sz: 14 }; }} />
      </group>;
    })}

    {/* towers and buildings */}
    {urban && FLOORS.map((fl, ci) => (
      <Repeat key={ci} geometry={bGeo[ci]!} material={(ci > 0 && hash(ci, 91) < urban.glass ? M.glass : M.wall)} spacing={city ? 40 : 52} per={city ? 4 : 2} shadow={false}
        make={(cell, k) => {
          const row2 = k >= 2, s = k % 2 === 0 ? -1 : 1;
          if (row2 && !urban.row2) return null;
          if (hash(cell, 60 + k) < urban.gap) return null;
          const tallBias = row2 ? 1.0 : 0;
          const pool = urban.floors; const want = Math.floor((hash(cell, 70 + k) * pool.length)); const base = pool[Math.min(pool.length - 1, want)]!;
          const cls = Math.min(FLOORS.length - 1, base + (row2 && hash(cell, 71) < 0.45 ? 1 : 0) + (stage.region === 'downtown' && row2 && hash(cell, 72) < 0.5 ? 1 : 0) + Math.round(tallBias * 0));
          if (cls !== ci) return null;
          const w = 22 + hash(cell, 80 + k) * 22, d = 20 + hash(cell, 90 + k) * 18;
          const edge = s > 0 ? right : left; const setb = (inter ? 16 : 7) + (row2 ? 56 : 0) + hash(cell, 100 + k) * 14;
          return { x: edge + s * (setb + w / 2), y: 0, z: hash(cell, 3) * 10, ry: 0, sx: w, sy: FLOORS[ci]! * 3.4, sz: d, color: colOf(['#e8dccb', '#d6d3cb', '#c9ced4', '#e0cfb4', '#f0eadc', '#b8b0a4'][Math.floor(hash(cell, 110 + k) * 6)]!, 0.05, cell + k) };
        }} />
    ))}
    {/* low buildings, warehouses and retail along the suburbs and the airport */}
    {!urban && (stage.walls === 'houses' || stage.walls === 'retail' || stage.walls === 'warehouse' || stage.walls === 'brick' || stage.walls === 'cream') && <>
      <Repeat geometry={G.box} material={stage.walls === 'brick' ? M.brick : M.wall} spacing={26} per={2}
        make={(cell, k) => { const s = k === 0 ? -1 : 1; if (hash(cell, 150 + k) > (stage.road === 'local' || stage.road === 'arterial' ? 0.88 : 0.55)) return null; const w = stage.walls === 'houses' ? 11 + hash(cell, 3) * 4 : 16 + hash(cell, 3) * 14, h = stage.walls === 'houses' ? 5 + hash(cell, 6) * 1.5 : stage.walls === 'brick' ? 7 + hash(cell, 6) * 3 : 5 + hash(cell, 6) * 3; const edge = s > 0 ? right : left; const setb = (stage.walls === 'houses' ? 12 : stage.walls === 'brick' ? 4.5 : 10) + hash(cell, 8 + k) * 5; return { x: edge + s * (setb + w / 2 + (lay.sidewalks ? 2.6 : 0)), y: 0, z: 4 + hash(cell, 8 + k) * 6, ry: 0, sx: w, sy: h, sz: 11 + hash(cell, 9) * 4, color: colOf(stage.walls === 'brick' ? '#a0604a' : ['#f6ede4', '#e9dcc6', '#f2e3c4', '#d9c9ad'][Math.floor(hash(cell, 12 + k) * 4)]!, 0.08, cell) }; }} />
      {stage.walls === 'houses' && <Repeat geometry={G.roof} material={M.roof} spacing={26} per={2}
        make={(cell, k) => { const s = k === 0 ? -1 : 1; if (hash(cell, 150 + k) > (stage.road === 'local' || stage.road === 'arterial' ? 0.88 : 0.55)) return null; const w = 11 + hash(cell, 3) * 4, h = 5 + hash(cell, 6) * 1.5; const edge = s > 0 ? right : left; const setb = 12 + hash(cell, 8 + k) * 5; return { x: edge + s * (setb + w / 2 + (lay.sidewalks ? 2.6 : 0)), y: h, z: 4 + hash(cell, 8 + k) * 6, ry: 0, sx: w * 1.1, sy: 3, sz: (11 + hash(cell, 9) * 4) * 1.12, color: colOf(hash(cell, 14) > 0.5 ? '#6b4a3a' : '#4d4f57', 0.1, cell) }; }} />}
      {stage.walls === 'brick' && <Repeat geometry={G.awning} material={M.awning} spacing={26} per={2} make={(cell, k) => { const s = k === 0 ? -1 : 1; if (hash(cell, 150 + k) > 0.88) return null; const edge = s > 0 ? right : left; const w = 16 + hash(cell, 3) * 14; return { x: edge + s * (4.2 + (lay.sidewalks ? 2.6 : 0)), y: 3.0, z: 4 + hash(cell, 8 + k) * 6, ry: s > 0 ? Math.PI / 2 : -Math.PI / 2, sx: w * 0.8, sy: 1, sz: 1.6 }; }} />}
    </>}

    {/* overpasses: a bridge over the interstate every few hundred metres */}
    {lay.kind === 'divided' && inter && <>
      <Repeat geometry={G.deck} material={M.concrete} spacing={470} ahead={AHEAD} per={1} make={(c) => (hash(c, 31) < 0.15 ? null : { x: (left + right) / 2, y: 6.9, z: 100 + hash(c, 32) * 200, ry: 0, sx: right - left + 18, sy: 1, sz: 1 })} />
      <Repeat geometry={G.pier} material={M.concreteDark} spacing={470} per={3} make={(c, k) => (hash(c, 31) < 0.15 ? null : { x: [left - 3, (lay.medianL + lay.medianR) / 2, right + 3][k]!, y: 0, z: 100 + hash(c, 32) * 200, ry: 0, sx: 1, sy: 6.3, sz: 1 })} />
      <Repeat geometry={G.box} material={M.concreteDark} spacing={470} per={2} make={(c, k) => (hash(c, 31) < 0.15 ? null : { x: (left + right) / 2, y: 7.55, z: 100 + hash(c, 32) * 200 + (k ? 7.2 : -7.2), ry: 0, sx: right - left + 18, sy: 0.9, sz: 0.3 })} />
    </>}
    {/* the long elevated ramps of the big interchanges */}
    {lay.kind === 'divided' && inter && (city || stage.region === 'airport' || stage.region === 'intown') && <>
      <Repeat geometry={G.ramp} material={M.concrete} spacing={700} per={2} make={(c, k) => (hash(c, 41 + k) < 0.3 ? null : { x: (k ? 1 : -1) * ((k ? right : -left) + 26 + hash(c, 5) * 18) * (k ? 1 : 1) + (k ? 0 : 0), y: 10.5 + hash(c, 6) * 4, z: 60 + hash(c, 7) * 360, ry: (k ? -1 : 1) * (0.07 + hash(c, 8) * 0.12), sx: 1, sy: 1, sz: 130 })} />
      <Repeat geometry={G.pier} material={M.concreteDark} spacing={700} per={4} make={(c, k) => (hash(c, 41 + (k >> 1)) < 0.3 ? null : { x: ((k & 1) ? 1 : -1) * 0 + ((k >> 1) ? 1 : -1) * 0 + 0, y: -99, z: 0, ry: 0, sx: 0.0001, sy: 0.0001, sz: 0.0001 })} />
    </>}
  </>;
}

// ------------------------------------------------------------------ roadside billboards (made-up advertisers and DrivingKlass) ---
function Billboards() {
  const { sim, stage, bend } = useAtl();
  const lay = sim.lay, pool = useRef<(THREE.Group | null)[]>([]);
  const COUNT = 3;
  const mats = useMemo(() => Array.from({ length: COUNT }, () => bendMaterial(new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.15, color: '#ffffff' }), bend)), [bend]);
  const post = useMemo(() => bendMaterial(new THREE.MeshStandardMaterial({ color: '#6c7076', roughness: 0.6, metalness: 0.6 }), bend), [bend]);
  const night = useContext(NightCtx);
  const lastCell = useRef<number[]>([]);
  useFrame(() => {
    const T = sim.traveled, sp = stage.road === 'interstate' ? 520 : 650;
    const base = Math.floor((T - 40) / sp);
    for (let i = 0; i < COUNT; i++) {
      const c = base + i, g = pool.current[i]; if (!g) continue;
      const d = c * sp + 120 + hash(c, 1) * 160, side = hash(c, 2) > 0.5 ? 1 : -1;
      g.position.set(side > 0 ? lay.edgeR + 7.5 + hash(c, 3) * 6 : lay.edgeL - 7.5 - hash(c, 3) * 6, 0, T - d);
      g.rotation.y = side > 0 ? -0.3 : 0.3;
      g.visible = d - T < AHEAD && d - T > -BEHIND;
      if (lastCell.current[i] !== c) { lastCell.current[i] = c; const m = mats[i]!; const t = adTexture(c + (stage.id.length * 3)); m.map = t; m.emissiveMap = t; m.needsUpdate = true; }
      mats[i]!.emissiveIntensity = 0.12 + clamp(night.current * 1.25 - 0.1, 0, 1) * 0.8;
    }
  });
  return <>{mats.map((m, i) => <group key={i} ref={(g) => { pool.current[i] = g; }}>
    <mesh position={[0, 9.2, 0]} material={m}><planeGeometry args={[14, 5.25]} /></mesh>
    <mesh position={[0, 4.4, -0.1]} material={post}><boxGeometry args={[0.7, 8.8, 0.7]} /></mesh>
    <mesh position={[0, 6.6, -0.05]} material={post}><boxGeometry args={[14.4, 0.3, 0.3]} /></mesh>
  </group>)}</>;
}

// ------------------------------------------------------------------ the whole world ---
export function AtlWorld({ quality, bloom, mixRef }: { quality: Quality; bloom: boolean; mixRef: { current: number } }) {
  const { sim, stage, bend, spec } = useAtl();
  const lite = quality.lite;
  const fin = useRef(false);
  void fin;
  useLayoutEffect(() => {
    atmo.debug = true; atmo.preview = { weather: (sim.weatherKind as WeatherKind), night: 'normal' }; applyAtmo();
    atmo.look = { ...atmo.goal }; atmo.deep = atmo.deepGoal;
    return () => { atmo.debug = false; atmo.preview = { weather: 'clear', night: 'normal' }; applyAtmo(); };
  }, [sim]);
  useFrame(() => { stepBend(bend, spec, sim.traveled); }, -6);
  return <>
    <Atmosphere shadow={quality.shadow} mix={mixRef} />
    <Environment resolution={lite ? 128 : 256}>
      <Lightformer intensity={2.2} position={[0, 8, 4]} scale={[24, 10, 1]} />
      <Lightformer intensity={1.8} color={stage.tod === 'night' ? '#9db4ff' : '#fff0d8'} position={[-12, 3, 6]} scale={[18, 7, 1]} />
      <Lightformer intensity={1.3} color="#ffe2a0" position={[12, 3, 8]} scale={[16, 6, 1]} />
      <Lightformer intensity={1.9} color="#fff0d0" position={[0, 4, 22]} rotation-y={Math.PI} scale={[44, 9, 1]} />
    </Environment>
    <SkyKit lite={lite} />
    <Skyline />
    <Ground />
    <RoadSurface />
    <Edges />
    <Scenery />
    <Billboards />
    <Weather lite={lite} />
    {bloom && <Bloom sim={sim as unknown as RunSim} mix={mixRef} />}
  </>;
}

export function makeCtx(sim: AtlSim, quality: Quality, night: { current: number }): Ctx {
  const spec = PATHS[sim.stage.curves] ?? PATHS.gentle!;
  return { sim, stage: sim.stage, bend: makeBend(spec), spec, quality, night };
}
void LANE;
