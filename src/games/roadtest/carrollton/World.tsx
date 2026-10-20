/**
 * The Carrollton open world as a 3D scene: the town built from the map (see build.ts), the sky and the light with a day that really moves, the street furniture,
 * the traffic, the player's car, the people, the train. Every component reads the rules engine (sim.ts) and only draws it.
 */
import { createContext, Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { FleetCar, type CarSignal, type WheelState } from '../../../components/nuhome2/world/Fleet';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import type { Quality } from '../../../components/nuhome2/world/quality';
import { Clouds, Stars } from '../g3d/sky';
import { GARAGE, type GarageId } from '../g3d/garage';
import { Beams, BrakeGlow } from '../g3d/cars';
import { clamp, damp } from '../g3d/util';
import { ALL_KINDS, MAX_PER_KIND, vehicleGeo } from '../atl/vehicles';
import { buildingAt, loadMap, pointOnPoly, rand01, type GameMap } from './map';
import { Acc, box, buildBuildings, buildRail, buildRoads, cone, prism, type Corner } from './build';
import { asphaltTexture, clockTexture, concreteTexture, facadeTextures, glowDot, grassTexture, shopSignTexture } from './tex';
import { bladeAtlasFor, buildSigns, signFaceAtlas } from './signs';
import { signalState } from './traffic';
import type { OpenSim } from './sim';

export interface Env { hour: number; night: number; day: number; elev: number; warm: number; sun: THREE.Vector3; }
export const makeEnv = (): Env => ({ hour: 10, night: 0, day: 1, elev: 0.8, warm: 0, sun: new THREE.Vector3(0.2, 0.8, 0.5) });
export const EnvCtx = createContext<Env>(makeEnv());

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const START_HOUR = q.get('hour') ? Number(q.get('hour')) : 9.5;
const FREEZE = q.get('freeze') === '1';
const SEC_PER_HOUR = 50;
export const hourOf = (t: number) => ((START_HOUR + (FREEZE ? 0 : t / SEC_PER_HOUR)) % 24 + 24) % 24;

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const col = (h: string) => new THREE.Color(h);

// ------------------------------------------------------------------ sky, sun and light ---
const SKY = {
  top: [col('#3f7fd0'), col('#34508f'), col('#050816')] as const, mid: [col('#8fc1ee'), col('#d9906e'), col('#0b1230')] as const, low: [col('#d4e6f3'), col('#ffb98a'), col('#141b36')] as const,
};
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function skyColor(set: readonly [THREE.Color, THREE.Color, THREE.Color], warm: number, night: number, out: THREE.Color) { return out.copy(set[0]).lerp(set[1], warm).lerp(set[2], night); }

function SkyDome({ env }: { env: Env }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff2cc') }, sunK: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top,mid,low,sunDir,sunCol; uniform float sunK; void main(){ float h = max(vP.y,0.0); vec3 c = mix(low,mid,smoothstep(0.0,0.22,h)); c = mix(c,top,smoothstep(0.18,0.85,h)); float s = max(dot(normalize(vP),normalize(sunDir)),0.0); c += sunCol * (pow(s,900.0)*2.5 + pow(s,12.0)*0.22 + pow(s,3.0)*0.07) * sunK; gl_FragColor = vec4(c,1.0); }',
  }), []);
  useFrame(({ camera }) => {
    const u = mat.uniforms;
    skyColor(SKY.top, env.warm, env.night, u.top!.value as THREE.Color); skyColor(SKY.mid, env.warm, env.night, u.mid!.value as THREE.Color); skyColor(SKY.low, env.warm, env.night, u.low!.value as THREE.Color);
    (u.sunDir!.value as THREE.Vector3).copy(env.sun); (u.sunCol!.value as THREE.Color).set('#fff3d8').lerp(tmpA.set('#ff9a55'), env.warm); u.sunK!.value = env.day;
    void camera;
  });
  return <mesh material={mat} scale={640} renderOrder={-10} frustumCulled={false}><sphereGeometry args={[1, 32, 20]} /></mesh>;
}

function MoonSprite({ env }: { env: Env }) {
  const ref = useRef<THREE.Sprite>(null);
  const tex = useMemo(() => glowDot(), []);
  useFrame(() => { const s = ref.current; if (!s) return; s.position.set(-env.sun.x, -env.sun.y, -env.sun.z).multiplyScalar(480); (s.material as THREE.SpriteMaterial).opacity = env.night * clamp(-env.sun.y * 3 + 0.3, 0, 1) * 0.95; s.visible = env.night > 0.05; });
  return <sprite ref={ref} scale={[70, 70, 1]}><spriteMaterial map={tex} color="#dfe8ff" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>;
}

function SkyKit({ env, lite }: { env: Env; lite: boolean }) {
  const g = useRef<THREE.Group>(null), stars = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { g.current?.position.copy(camera.position); if (stars.current) stars.current.visible = env.night > 0.25; });
  return <group ref={g}>
    <SkyDome env={env} />
    <group ref={stars}><Stars count={lite ? 1800 : 4200} /></group>
    <MoonSprite env={env} />
    <Clouds count={lite ? 8 : 16} />
  </group>;
}

export function Atmosphere({ sim, env, shadow, mix }: { sim: OpenSim; env: Env; shadow: number; mix: { current: number } }) {
  const { scene, gl } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null), dir = useRef<THREE.DirectionalLight>(null), moon = useRef<THREE.DirectionalLight>(null);
  const fog = useMemo(() => new THREE.Fog('#d4e6f3', 70, 520), []);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  const c = useMemo(() => ({ sunC: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color() }), []);
  useFrame(() => {
    const h = hourOf(sim.time), ang = h >= 6.3 && h <= 19.7 ? ((h - 6.3) / 13.4) * Math.PI : Math.PI + ((((h - 19.7) % 24) + 24) % 24 / 10.6) * Math.PI;
    const elev = Math.sin(ang), y = elev * 0.88, mag = Math.sqrt(Math.max(0.05, 1 - y * y));
    env.hour = h; env.elev = elev; env.day = smooth(-0.04, 0.3, elev); env.night = 1 - smooth(-0.22, 0.06, elev);
    env.warm = smooth(0.45, 0.0, elev) * smooth(-0.22, 0.03, elev);
    env.sun.set(Math.cos(ang) * mag, y, Math.sin(ang) * mag * 0.6 + 0.12).normalize();
    mix.current = env.night;
    skyColor(SKY.low, env.warm, env.night, fog.color);
    fog.near = 60 + 40 * env.day; fog.far = 480 + 80 * env.day;
    scene.environmentIntensity = 0.12 + 0.9 * env.day;
    gl.toneMappingExposure = 0.95;
    const d = dir.current, m = moon.current, p = sim;
    if (d) {
      c.sunC.set('#fff3dc').lerp(tmpB.set('#ff9b55'), env.warm); d.color.copy(c.sunC); d.intensity = 3.1 * env.day;
      d.position.set(p.x + env.sun.x * 150, Math.max(10, env.sun.y * 150), p.z + env.sun.z * 150); d.target.position.set(p.x, 0, p.z); d.target.updateMatrixWorld(); d.castShadow = shadow > 0 && env.day > 0.15;
    }
    if (m) { m.intensity = 0.55 * env.night; m.position.set(p.x - env.sun.x * 90, 70, p.z - env.sun.z * 90 + 20); m.target.position.set(p.x, 0, p.z); m.target.updateMatrixWorld(); }
    if (hemi.current) {
      hemi.current.intensity = 0.3 + 0.62 * env.day + 0.1 * env.night;
      c.hemiS.set('#cfe3ff').lerp(tmpA.set('#27386a'), env.night).lerp(tmpB.set('#e6b894'), env.warm * 0.5); hemi.current.color.copy(c.hemiS);
      c.hemiG.set('#8a7d62').lerp(tmpA.set('#10131f'), env.night); hemi.current.groundColor.copy(c.hemiG);
    }
  });
  return <>
    <hemisphereLight ref={hemi} args={['#cfe3ff', '#8a7d62', 1]} />
    <directionalLight ref={dir} castShadow={shadow > 0} shadow-mapSize-width={shadow || 16} shadow-mapSize-height={shadow || 16} shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-near={1} shadow-camera-far={420} shadow-bias={-0.0004} shadow-normalBias={0.05} />
    <directionalLight ref={moon} color="#8fa8ff" />
    <Environment resolution={128}>
      <Lightformer intensity={2.0} position={[0, 8, 4]} scale={[24, 10, 1]} />
      <Lightformer intensity={1.6} color="#fff0d8" position={[-12, 3, 6]} scale={[18, 7, 1]} />
      <Lightformer intensity={1.2} color="#ffe2a0" position={[12, 3, 8]} scale={[16, 6, 1]} />
      <Lightformer intensity={1.7} color="#fff0d0" position={[0, 4, 22]} rotation-y={Math.PI} scale={[44, 9, 1]} />
    </Environment>
    <SkyKit env={env} lite={false} />
  </>;
}

// ------------------------------------------------------------------ the ground and the town ---
function Ground() {
  // a big plane would lose its depth precision up close (two huge triangles), so the ground is a finely cut sheet that follows the camera in whole texture tiles
  const tex = useMemo(() => { const t = grassTexture().clone(); t.repeat.set(200, 200); t.needsUpdate = true; return t; }, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => { const m = ref.current; if (m) m.position.set(Math.round(camera.position.x / 40) * 40, -0.06, Math.round(camera.position.z / 40) * 40); });
  return <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, -0.06, 0]} receiveShadow renderOrder={-2} frustumCulled={false}>
    <planeGeometry args={[1600, 1600, 80, 80]} /><meshStandardMaterial map={tex} color="#9bb37a" roughness={1} metalness={0} />
  </mesh>;
}

type G = THREE.BufferGeometry;
interface TownGeo {
  roads: [number, G[]][]; pads: [number, G[]][]; side: G[]; white: G[]; yellow: G[]; cross: G[]; lots: G[];
  houses: G[]; shops: G[]; roofs: G[]; extras: G[];
  ballast: G[]; steel: G[]; ties: G[];
  signs: ReturnType<typeof buildBuildings>['signs']; corners: Corner[]; heights: Map<number, number>; courthouse: ReturnType<typeof buildBuildings>['courthouse'];
}
export function useTownGeo(map: GameMap): TownGeo {
  return useMemo(() => {
    const r = buildRoads(map), b = buildBuildings(map), rl = buildRail(map);
    return {
      roads: [...r.roads.entries()].map(([k, a]) => [k, a.chunks()] as [number, G[]]), pads: [...r.pads.entries()].map(([k, a]) => [k, a.chunks()] as [number, G[]]),
      side: r.side.chunks(), white: r.paint.white.chunks(), yellow: r.paint.yellow.chunks(), cross: r.crosswalks.chunks(), lots: r.lots.chunks(),
      houses: b.houses.chunks(), shops: b.shops.chunks(), roofs: b.roofs.chunks(), extras: b.extras.chunks(), ballast: rl.ballast.chunks(), steel: rl.steel.chunks(), ties: rl.ties.chunks(),
      signs: b.signs, corners: r.corners, heights: b.heights, courthouse: b.courthouse,
    };
  }, [map]);
}

function M({ g, m, ro, cast = false, rec = true }: { g: G[]; m: THREE.Material; ro?: number; cast?: boolean; rec?: boolean }) {
  return <>{g.map((x, i) => <mesh key={i} geometry={x} material={m} renderOrder={ro} castShadow={cast} receiveShadow={rec} />)}</>;
}

function Town({ geo, env, shadow }: { geo: TownGeo; env: Env; shadow: boolean }) {
  const mats = useMemo(() => {
    const asphalt = asphaltTexture(), concrete = concreteTexture();
    const road = (rank: number, extra = 0) => new THREE.MeshStandardMaterial({ map: asphalt, vertexColors: true, roughness: 0.94, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -rank - extra, polygonOffsetUnits: -rank - extra });
    const paint = (hex: string, off: number) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.72, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off, emissive: hex, emissiveIntensity: 0.0 });
    const fh = facadeTextures('house'), fs = facadeTextures('shop');
    const wall = (f: { map: THREE.Texture; lit: THREE.Texture }) => new THREE.MeshStandardMaterial({ map: f.map, vertexColors: true, roughness: 0.82, metalness: 0.02, emissiveMap: f.lit, emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, side: THREE.DoubleSide });
    return {
      road: [1, 2, 3, 4, 5].map((r) => road(r)), pad: [1, 2, 3, 4, 5].map((r) => road(r, 0.5)),
      side: new THREE.MeshStandardMaterial({ map: concrete, vertexColors: true, roughness: 0.93, side: THREE.DoubleSide }),
      white: paint('#eeeeea', -9), yellow: paint('#e5b81c', -9), cross: paint('#f1f1ec', -10),
      lots: new THREE.MeshStandardMaterial({ map: asphalt, color: '#6a6d70', roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      house: wall(fh), shop: wall(fs),
      roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
      extras: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
      ballast: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
      ties: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    };
  }, []);
  useFrame(() => {
    const n = env.night;
    mats.house.emissiveIntensity = n * 0.9; mats.shop.emissiveIntensity = n * 1.1;
    mats.white.emissiveIntensity = n * 0.06; mats.yellow.emissiveIntensity = n * 0.08; mats.cross.emissiveIntensity = n * 0.06;
  });
  return <group>
    {geo.roads.map(([rank, g]) => <M key={rank} g={g} m={mats.road[rank - 1]!} ro={rank} />)}
    {geo.pads.map(([rank, g]) => <M key={`p${rank}`} g={g} m={mats.pad[rank - 1]!} ro={rank} />)}
    <M g={geo.lots} m={mats.lots} />
    <M g={geo.side} m={mats.side} cast={shadow} />
    <M g={geo.white} m={mats.white} ro={8} /><M g={geo.yellow} m={mats.yellow} ro={8} /><M g={geo.cross} m={mats.cross} ro={9} />
    <M g={geo.houses} m={mats.house} cast={shadow} /><M g={geo.shops} m={mats.shop} cast={shadow} /><M g={geo.roofs} m={mats.roof} cast={shadow} />
    <M g={geo.extras} m={mats.extras} cast={shadow} rec={false} />
    <M g={geo.ballast} m={mats.ballast} /><M g={geo.ties} m={mats.ties} /><M g={geo.steel} m={mats.steel} rec={false} />
  </group>;
}

/** the shop signs on the walls of the named businesses */
function ShopSigns({ geo, env }: { geo: TownGeo; env: Env }) {
  const items = useMemo(() => geo.signs.map((s) => {
    const w = clamp(s.w * 0.7, 3.5, 8), h = w / 4;
    const tex = shopSignTexture(s.b.name!);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
    return { s, w, h, mat };
  }), [geo]);
  useFrame(() => { for (const it of items) it.mat.emissiveIntensity = env.night * 1.2; });
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  return <group>{items.map(({ s, w, h, mat }, i) => <mesh key={i} geometry={plane} material={mat} scale={[w, h, 1]} position={[s.x + s.nx * 0.12, s.y, s.z + s.nz * 0.12]} rotation-y={Math.atan2(s.nx, s.nz)} />)}</group>;
}

/** street name blades, stop signs, speed limits and railroad warning signs: three draw calls */
function Signage({ geo, map }: { geo: TownGeo; map: GameMap }) {
  const parts = useMemo(() => buildSigns(map, geo.corners), [map, geo]);
  const objs = useMemo(() => {
    const face = signFaceAtlas(), blade = bladeAtlasFor(parts.names);
    return {
      face: parts.face.geo(), blade: parts.blade.geo(), pole: parts.pole.geo(),
      faceMat: new THREE.MeshStandardMaterial({ map: face, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide, emissiveMap: face, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }),
      bladeMat: new THREE.MeshStandardMaterial({ map: blade, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }),
      poleMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }),
    };
  }, [parts]);
  return <group>
    <mesh geometry={objs.face} material={objs.faceMat} castShadow /><mesh geometry={objs.blade} material={objs.bladeMat} /><mesh geometry={objs.pole} material={objs.poleMat} castShadow />
  </group>;
}

// ------------------------------------------------------------------ trees ---
export function streetTrees(map: GameMap): { x: number; z: number; s: number; k: number }[] {
  const out: { x: number; z: number; s: number; k: number }[] = [];
  for (const e of map.edges) {
    const w = e.way; if (!w.drive || !w.ai || w.rank > 3 || e.len < 40) continue;
    const off0 = w.width / 2 + 3.6; let side = rand01(e.id * 3.3) < 0.5 ? 1 : -1;
    for (let s = e.a.clear + 8 + rand01(e.id) * 10; s < e.len - e.b.clear - 8; s += 17 + rand01(e.id * 5 + s) * 12) {
      side = -side;
      const q = pointOnPoly(e.p, e.cum, s), off = side * off0, x = q.x - q.tz * off, z = q.z + q.tx * off;
      if (rand01(x * 1.3 + z * 0.7) < 0.3) continue;
      if (buildingAt(map, x, z, 1.4)) continue;
      const hit = map.roadAt(x, z); if (hit && hit.dist < hit.edge.way.width / 2 + 2.6) continue;
      out.push({ x, z, s: 0.75 + rand01(x * 9 + z) * 0.45, k: rand01(x + z * 3) < 0.7 ? 0 : 2 });
    }
  }
  return out;
}
export function treeSpots(map: GameMap): { x: number; z: number; s: number; k: number }[] {
  const out: { x: number; z: number; s: number; k: number }[] = [];
  const b = map.bounds, M = 260, STEP = 15;
  for (let x = b.x0 - M; x < b.x1 + M; x += STEP) for (let z = b.z0 - M; z < b.z1 + M; z += STEP) {
    const jx = x + (rand01(x * 3.1 + z) - 0.5) * STEP * 0.9, jz = z + (rand01(z * 5.7 + x) - 0.5) * STEP * 0.9;
    const hit = map.roadAt(jx, jz);
    if (hit && hit.dist < hit.edge.way.width / 2 + 4.6) continue;
    if (buildingAt(map, jx, jz, 3.5)) continue;
    // fewer trees in the busy middle, a forest at the edge
    const inner = jx > b.x0 + 60 && jx < b.x1 - 60 && jz > b.z0 + 60 && jz < b.z1 - 60;
    const dens = inner ? (hit ? 0.65 : 0.4) : 0.85;
    if (rand01(jx * 1.7 + jz * 2.3) > dens) continue;
    out.push({ x: jx, z: jz, s: 0.8 + rand01(jx * 9 + jz) * 0.7, k: Math.floor(rand01(jx * 13 + jz * 7) * 3) });
  }
  return out;
}
function treeGeos() {
  const mk = (build: (a: Acc) => void) => { const a = new Acc(); build(a); return a.geo(); };
  const trunk = col('#5b4631'), L1 = col('#3f6f2e'), L2 = col('#4e8438'), P1 = col('#2d5a35'), P2 = col('#356b3d');
  const oak = mk((a) => { prism(a, 0, 0, 0, 0.22, 0.14, 3.2, trunk, 6); for (const [x, y, z, r, c] of [[0, 5, 0, 2.6, L1], [1.2, 4.2, 0.5, 1.9, L2], [-1.2, 4.3, -0.7, 2.0, L2], [0.3, 6.2, 0.2, 1.8, L1], [0.2, 3.9, -1.5, 1.6, L2], [-0.4, 4.0, 1.5, 1.5, L1]] as [number, number, number, number, THREE.Color][]) ball(a, x, y, z, r, c); });
  const pine = mk((a) => { prism(a, 0, 0, 0, 0.2, 0.12, 4.5, trunk, 6); for (const [y, r, h, c] of [[2.6, 2.1, 3.0, P1], [4.4, 1.6, 2.7, P2], [6.0, 1.1, 2.4, P1], [7.4, 0.7, 2.0, P2]] as [number, number, number, THREE.Color][]) cone(a, 0, y, 0, r, h, c, 7); });
  const small = mk((a) => { prism(a, 0, 0, 0, 0.12, 0.08, 1.8, trunk, 5); ball(a, 0, 2.6, 0, 1.5, col('#6a9a42')); ball(a, 0.5, 3.2, 0.2, 1.0, col('#7aa64c')); });
  return [oak, pine, small];
}
function ball(a: Acc, cx: number, cy: number, cz: number, r: number, c: THREE.Color) {
  // a squashed low-poly blob: an icosahedron-ish octahedron subdivided once
  const g = new THREE.IcosahedronGeometry(r, 0); const pos = g.getAttribute('position'), idx = g.getIndex();
  const base = a.n;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i) * 0.82, z = pos.getZ(i); const sh = 0.86 + 0.14 * (y / r + 1) / 2 + rand01(i * 3 + cx * 7 + cz) * 0.08; a.v(cx + x, cy + y, cz + z, c.clone().multiplyScalar(sh), 0, 0, x / r, y / r, z / r); }
  if (idx) for (let i = 0; i < idx.count; i += 3) a.tri(base + idx.getX(i), base + idx.getX(i + 1), base + idx.getX(i + 2)); else for (let i = 0; i < pos.count; i += 3) a.tri(base + i, base + i + 1, base + i + 2);
  g.dispose();
}

function Trees({ map, count }: { map: GameMap; count: number }) {
  const meshes = useMemo(() => {
    const all = treeSpots(map), keep = Math.min(1, count / Math.max(1, all.length));
    const spots = (keep >= 1 ? all : all.filter((_, i) => rand01(i * 12.9898 + 7) < keep)).concat(streetTrees(map));
    if (import.meta.env.DEV) (window as unknown as { __trees?: number }).__trees = spots.length;
    const geos = treeGeos(), mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    // tiles of 300 m, so the ones behind you or far away are skipped
    const tiles = new Map<string, typeof spots[]>();
    for (const s of spots) { const k = `${Math.floor(s.x / 300)},${Math.floor(s.z / 300)}`; let t = tiles.get(k); if (!t) { t = [[], [], []]; tiles.set(k, t); } t[s.k]!.push(s); }
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    for (const by of tiles.values()) geos.forEach((g, i) => {
      const list = by[i]!; if (!list.length) return;
      const im = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((s, j) => { e.set(0, rand01(j * 7 + i + s.x) * 6.28, 0); qn.setFromEuler(e); pv.set(s.x, 0, s.z); sv.set(s.s, s.s * (0.9 + rand01(j + s.z) * 0.3), s.s); m.compose(pv, qn, sv); im.setMatrixAt(j, m); c.setScalar(0.85 + rand01(j * 3 + i) * 0.3); im.setColorAt(j, c); });
      im.computeBoundingSphere(); if (im.boundingSphere) im.boundingSphere.radius += 12;
      im.castShadow = false; out.push(im);
    });
    return out;
  }, [map, count]);
  return <>{meshes.map((m, i) => <primitive key={i} object={m} />)}</>;
}

// ------------------------------------------------------------------ street lamps ---
function Lamps({ map, env }: { map: GameMap; env: Env }) {
  const o = useMemo(() => {
    const pole = new Acc(), head = new Acc(); const metal = col('#3b3f45'), lamp = col('#ffffff');
    const pools: number[] = [];
    for (const e of map.edges) {
      const w = e.way; if (!w.ai || w.rank < 3 || !w.name || e.len < 40) continue;
      const hw = w.width / 2; let flip = 1;
      for (let s = e.a.clear + 14; s < e.len - e.b.clear - 10; s += 42) {
        const qd = pointOnPoly(e.p, e.cum, s), off = flip * (hw + 1.7); flip = -flip;
        const x = qd.x - qd.tz * off, z = qd.z + qd.tx * off;
        prism(pole, x, 0, z, 0.07, 0.05, 7.4, metal, 6);
        // the arm reaches over the road
        const ax = -qd.tz * -Math.sign(off) * 1.5, az = qd.tx * -Math.sign(off) * 1.5;
        box(pole, x + ax / 2, 7.3, z + az / 2, Math.abs(ax) + 0.1, 0.1, Math.abs(az) + 0.1, metal);
        box(head, x + ax, 7.15, z + az, Math.abs(ax) > Math.abs(az) ? 0.9 : 0.35, 0.16, Math.abs(az) > Math.abs(ax) ? 0.9 : 0.35, lamp);
        pools.push(x + ax, z + az);
      }
    }
    return { pole: pole.geo(), head: head.geo(), pools };
  }, [map]);
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7d8187', toneMapped: false }), []);
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), []);
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowDot(), color: '#ffcf8a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 }), []);
  const pools = useMemo(() => {
    const n = o.pools.length / 2; const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, Math.max(1, n)); im.count = n; im.frustumCulled = false;
    const m = new THREE.Matrix4(); for (let i = 0; i < n; i++) { m.compose(new THREE.Vector3(o.pools[i * 2]!, 0.07, o.pools[i * 2 + 1]!), new THREE.Quaternion(), new THREE.Vector3(15, 1, 15)); im.setMatrixAt(i, m); }
    im.renderOrder = 7; return im;
  }, [o, poolMat]);
  useFrame(() => { headMat.color.set('#7d8187').lerp(tmpA.set('#ffe2a8'), env.night); poolMat.opacity = env.night * 0.5; pools.visible = env.night > 0.04; });
  return <>
    <mesh geometry={o.pole} material={poleMat} castShadow /><mesh geometry={o.head} material={headMat} /><primitive object={pools} />
  </>;
}

// ------------------------------------------------------------------ signals ---
function Signals({ map, sim }: { map: GameMap; sim: OpenSim }) {
  const o = useMemo(() => {
    const pole = new Acc(), headBody = new Acc(); const metal = col('#2e3238'), black = col('#14161a'), hood = col('#101114');
    const lamps: { x: number; y: number; z: number; ux: number; uz: number; node: typeof map.nodes[number]; phase: number }[] = [];
    for (const n of map.nodes) {
      if (!n.signal) continue;
      for (const arm of n.arms) {
        if (!arm.inbound) continue;
        const e = arm.edge, hw = e.way.width / 2, ux = Math.sin(arm.bearing), uz = Math.cos(arm.bearing);
        // the approaching driver travels along -u; their right is (u_z, -u_x)
        const rx = uz, rz = -ux;
        const bx = n.x + ux * (n.clear + 2.2) + rx * (hw + 1.5), bz = n.z + uz * (n.clear + 2.2) + rz * (hw + 1.5);
        prism(pole, bx, 0, bz, 0.12, 0.09, 6.4, metal, 8);
        // the mast arm reaches over the approach lanes
        const armLen = hw * 0.9, hx = bx - rx * armLen, hz = bz - rz * armLen;
        box(pole, (bx + hx) / 2, 6.1, (bz + hz) / 2, Math.abs(rx) * armLen + 0.14, 0.14, Math.abs(rz) * armLen + 0.14, metal);
        for (const [px, pz, py] of [[hx, hz, 5.2], [bx - rx * 0.15, bz - rz * 0.15, 2.9]] as [number, number, number][]) {
          // a vertical three-lamp head facing the traffic (towards +u)
          const rotY = Math.atan2(ux, uz);
          box(headBody, px, py - 0.55, pz, 0.38, 1.1, 0.32, black, rotY);
          box(headBody, px + ux * 0.12, py + 0.52, pz + uz * 0.12, 0.44, 0.04, 0.5, hood, rotY);
          for (let k = 0; k < 3; k++) lamps.push({ x: px + ux * 0.17, y: py + 0.22 - k * 0.36, z: pz + uz * 0.17, ux, uz, node: n, phase: e.phase[arm.end] });
        }
      }
    }
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, lamps.length)); im.count = lamps.length; im.frustumCulled = false;
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), e = new THREE.Euler(); lamps.forEach((l, i) => { e.set(0, Math.atan2(l.ux, l.uz), 0); qn.setFromEuler(e); m.compose(new THREE.Vector3(l.x, l.y, l.z), qn, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(0x222222)); });
    return { pole: pole.geo(), body: headBody.geo(), im, lamps };
  }, [map]);
  const mats = useMemo(() => ({ metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }) }), []);
  const on = useMemo(() => [new THREE.Color('#ff3326').multiplyScalar(2.2), new THREE.Color('#ffc21a').multiplyScalar(2.2), new THREE.Color('#2dff7a').multiplyScalar(2.0)], []);
  const off = useMemo(() => [new THREE.Color('#2b0b08'), new THREE.Color('#2d2305'), new THREE.Color('#06210f')], []);
  useFrame(() => {
    const { im, lamps } = o; if (!lamps.length) return;
    for (let i = 0; i < lamps.length; i += 3) {
      const st = signalState(lamps[i]!.node, lamps[i]!.phase, sim.time), lit = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
      for (let k = 0; k < 3; k++) im.setColorAt(i + k, k === lit ? on[k]! : off[k]!);
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return <><mesh geometry={o.pole} material={mats.metal} castShadow /><mesh geometry={o.body} material={mats.metal} castShadow /><primitive object={o.im} /></>;
}

// ------------------------------------------------------------------ the railroad crossings: gates and flashers ---
function RailGates({ map, sim }: { map: GameMap; sim: OpenSim }) {
  const root = useRef<THREE.Group>(null);
  const spec = useMemo(() => sim.trains.crossings.map((c) => {
    const hit = map.roadAt(c.x, c.z), hw = (hit ? hit.edge.way.width : 8) / 2, tx = Math.sin(c.lx.ang), tz = Math.cos(c.lx.ang);
    return { c, hw, tx, tz };
  }), [map, sim]);
  const lampOn = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }), []);
  const lampOff = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3a0c08', toneMapped: false }), []);
  const arms = useRef<THREE.Group[]>([]), lamps = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    spec.forEach((s, i) => {
      for (let k = 0; k < 2; k++) {
        const a = arms.current[i * 2 + k]; if (a) a.rotation.x = -(1 - s.c.gate) * (Math.PI / 2) * 0.97;
        for (let j = 0; j < 2; j++) { const l = lamps.current[(i * 2 + k) * 2 + j]; if (l) l.material = s.c.warn && (Math.floor(t * 2.2) % 2 === j) ? lampOn : lampOff; }
      }
    });
  });
  return <group ref={root}>
    {spec.map((s, i) => [1, -1].map((sd, k) => {
      const rx = s.tz * sd, rz = -s.tx * sd;          // right of the traffic coming from side sd (it travels along -t*sd)
      const bx = s.c.x + s.tx * 9.5 * sd + rx * (s.hw + 1.3), bz = s.c.z + s.tz * 9.5 * sd + rz * (s.hw + 1.3);
      const armLen = s.hw + 0.4, dirx = -rx, dirz = -rz;
      return <group key={`${i}:${sd}`} position={[bx, 0, bz]}>
        <mesh position={[0, 1.2, 0]}><cylinderGeometry args={[0.07, 0.09, 2.4, 8]} /><meshStandardMaterial color="#d8d8d4" roughness={0.6} /></mesh>
        <group position={[0, 1.15, 0]} rotation-y={Math.atan2(dirx, dirz)}>
          <group ref={(g) => { if (g) arms.current[i * 2 + k] = g; }}>
            {Array.from({ length: 7 }).map((_, j) => <mesh key={j} position={[0, 0, (armLen / 7) * (j + 0.5)]}><boxGeometry args={[0.08, 0.14, armLen / 7]} /><meshStandardMaterial color={j % 2 ? '#f4f4f0' : '#d4281c'} roughness={0.6} /></mesh>)}
          </group>
        </group>
        {[0, 1].map((j) => <mesh key={j} ref={(m) => { if (m) lamps.current[(i * 2 + k) * 2 + j] = m; }} position={[0.28 * (j ? 1 : -1) * Math.abs(dirz) + 0.0, 2.1, 0.28 * (j ? 1 : -1) * Math.abs(dirx)]} material={lampOff}><circleGeometry args={[0.1, 12]} /></mesh>)}
      </group>;
    }))}
  </group>;
}

// ------------------------------------------------------------------ the courthouse clock tower ---
function Courthouse({ geo }: { geo: TownGeo }) {
  const b = geo.courthouse, H = b ? geo.heights.get(b.id) ?? 10 : 10;
  const o = useMemo(() => {
    if (!b) return null;
    const stone = new Acc(), roof = new Acc();
    const s = col('#e3dccb'), t = col('#cfc6b0'), cu = col('#5e9a86'), gold = col('#caa24a');
    box(stone, b.cx, H, b.cz, 8.4, 9, 8.4, s); box(stone, b.cx, H + 9, b.cz, 6.6, 3.4, 6.6, t); box(stone, b.cx, H + 12.4, b.cz, 5.2, 3.2, 5.2, s);
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) prism(stone, b.cx + dx!, H + 15.6, b.cz + dz!, 0.22, 0.22, 2.6, t, 8);
    cone(roof, b.cx, H + 18.2, b.cz, 3.4, 4.2, cu, 8); prism(roof, b.cx, H + 22.2, b.cz, 0.12, 0.05, 3, gold, 6);
    return { stone: stone.geo(), roof: roof.geo() };
  }, [b, H]);
  const clock = useMemo(() => clockTexture(), []);
  if (!b || !o) return null;
  return <group>
    <mesh geometry={o.stone} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.8} /></mesh>
    <mesh geometry={o.roof} castShadow><meshStandardMaterial vertexColors roughness={0.6} metalness={0.3} side={THREE.DoubleSide} /></mesh>
    {[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a); return <mesh key={i} position={[b.cx + nx * 2.65, H + 14, b.cz + nz * 2.65]} rotation-y={a}><circleGeometry args={[1.15, 24]} /><meshStandardMaterial map={clock} emissiveMap={clock} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.5} /></mesh>; })}
  </group>;
}

// ------------------------------------------------------------------ the traffic ---
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
function put(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, s = 1) { tmpE.set(0, ry, 0); tmpQ.setFromEuler(tmpE); tmpP.set(x, y, z); tmpS.set(s, s, s); tmpM.compose(tmpP, tmpQ, tmpS); m.setMatrixAt(i, tmpM); }
const hideAt = (m: THREE.InstancedMesh, from: number, to: number) => { for (let i = from; i < to; i++) put(m, i, 0, -999, 0, 0, 0.0001); };

export function TrafficCars({ sim, env }: { sim: OpenSim; env: Env }) {
  const root = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.5, envMapIntensity: 1.2 });
    const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
    const tail = new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false });
    const head = new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false });
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colored: boolean) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; if (colored) m.setColorAt(0, new THREE.Color(1, 1, 1)); hideAt(m, 0, n); return m; };
    return ALL_KINDS.map((k) => { const g = vehicleGeo(k), n = MAX_PER_KIND[k]; const pm = make(g.paint, paint, n, true); pm.castShadow = true; return { k, paint: pm, detail: make(g.detail, detail, n, false), tail: make(g.tail, tail, n, true), head: make(g.head, head, n, true), n }; });
  }, []);
  useEffect(() => {
    const g = root.current; if (!g) return;
    for (const b of parts) g.add(b.paint, b.detail, b.tail, b.head);
    return () => { for (const b of parts) g.remove(b.paint, b.detail, b.tail, b.head); };
  }, [parts]);
  const counts = useRef(new Map<string, number>());
  useFrame(({ clock }) => {
    counts.current.clear();
    const n = env.night, lamp = 0.5 + 0.6 * n;
    for (const c of sim.traffic.cars) {
      const b = parts.find((p) => p.k === c.kind) ?? parts[0]!;
      const i = counts.current.get(c.kind) ?? 0; if (i >= b.n) continue; counts.current.set(c.kind, i + 1);
      const ry = c.h + Math.PI;
      // a hit car sits a little askew
      const skew = c.hit > 0 ? Math.sin(clock.elapsedTime * 30) * 0.02 : 0;
      put(b.paint, i, c.x, 0, c.z, ry + skew); put(b.detail, i, c.x, 0, c.z, ry + skew); put(b.tail, i, c.x, 0, c.z, ry + skew); put(b.head, i, c.x, 0, c.z, ry + skew);
      b.paint.setColorAt(i, tmpC.setHex(c.color));
      b.tail.setColorAt(i, tmpC.setScalar(c.brake || c.v < 0.3 ? 1.5 : lamp * 0.55));
      b.head.setColorAt(i, tmpC.setScalar(0.25 + 0.9 * n));
    }
    for (const b of parts) {
      const cnt = counts.current.get(b.k) ?? 0;
      for (const m of [b.paint, b.detail, b.tail, b.head]) { m.count = cnt; m.visible = cnt > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  });
  return <group ref={root} />;
}

// ------------------------------------------------------------------ the player's car ---
const SWATCH: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.swatch]));
const PLATE: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.plate]));
export function PlayerRig({ sim, carId, lite }: { sim: OpenSim; carId: GarageId; lite: boolean }) {
  const night = useContext(NightCtx);
  const pos = useRef<THREE.Group>(null), yaw = useRef<THREE.Group>(null), lean = useRef<THREE.Group>(null);
  const signal = useRef<CarSignal>({ left: false, right: false, head: true, reverse: false });
  const wheels = useRef<WheelState>({ steer: 0, dist: 0 });
  const brake = useRef(0);
  useFrame(({ clock }, dt) => {
    const p = pos.current, y = yaw.current, l = lean.current; if (!p || !y || !l) return;
    dt = Math.min(dt, 0.05); const t = clock.elapsedTime;
    p.position.set(sim.x, 0, sim.z);
    y.rotation.y = sim.h - Math.PI / 2;
    l.rotation.z = clamp(-sim.pitch * 1.0, -0.06, 0.06); l.rotation.x = clamp(sim.roll, -0.07, 0.07);
    l.position.y = Math.sin(t * 26) * 0.005 * Math.min(1, sim.mph / 30);
    wheels.current.steer = damp(wheels.current.steer, clamp(sim.steer / 0.62, -1, 1) * 0.42, 14, dt);
    wheels.current.dist += sim.v * dt; wheels.current.pitch = l.rotation.z; wheels.current.roll = l.rotation.x;
    signal.current.left = sim.signalDir === -1; signal.current.right = sim.signalDir === 1; signal.current.reverse = sim.reversing; signal.current.head = true;
    p.visible = !(sim.time < sim.invulnUntil && Math.floor(t * 14) % 2 === 0);
    brake.current = damp(brake.current, sim.braking && !sim.finished ? 1 : night.current > 0.3 ? 0.35 : 0, 25, dt);
  });
  return <group ref={pos}>
    <group ref={yaw} rotation-y={Math.PI / 2}>
      <group ref={lean}>
        <Suspense fallback={null}><FleetCar specId={carId} color={SWATCH[carId] ?? '#f2b92a'} plate={PLATE[carId] ?? 'DK00GO'} position={[0, 0, 0]} lite={lite} signal={signal} wheels={wheels} /></Suspense>
        <BrakeGlow id={carId} brake={brake} />
      </group>
      <Beams id={carId} sim={sim} />
    </group>
  </group>;
}

// ------------------------------------------------------------------ people ---
const SHIRTS = ['#c0392b', '#2c6fbb', '#2e8b57', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#34495e', '#d35498'], SKIN = ['#f1c8a5', '#e0ac82', '#c68a5d', '#8d5a3a', '#6b4128'], PANTS = ['#2a2f3a', '#3b4a63', '#4b3b2e', '#1d1d1f', '#5a5f66'];
export function People({ sim }: { sim: OpenSim }) {
  const N = 48;
  const o = useMemo(() => {
    const mk = (g: THREE.BufferGeometry, hex = '#ffffff') => { const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }), N); im.frustumCulled = false; im.setColorAt(0, new THREE.Color(1, 1, 1)); hideAt(im, 0, N); return im; };
    return { torso: mk(new THREE.BoxGeometry(0.42, 0.62, 0.24).translate(0, 1.18, 0)), head: mk(new THREE.SphereGeometry(0.115, 10, 8).translate(0, 1.64, 0)), legL: mk(new THREE.BoxGeometry(0.17, 0.82, 0.19).translate(0, -0.41, 0)), legR: mk(new THREE.BoxGeometry(0.17, 0.82, 0.19).translate(0, -0.41, 0)) };
  }, []);
  const root = useRef<THREE.Group>(null);
  useEffect(() => { const g = root.current; if (!g) return; g.add(o.torso, o.head, o.legL, o.legR); return () => { g.remove(o.torso, o.head, o.legL, o.legR); }; }, [o]);
  const e = useMemo(() => new THREE.Euler(), []), qn = useMemo(() => new THREE.Quaternion(), []), m = useMemo(() => new THREE.Matrix4(), []), one = useMemo(() => new THREE.Vector3(1, 1, 1), []), pv = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    let i = 0; const list: { x: number; z: number; h: number; look: number; phase: number; moving: boolean }[] = [];
    for (const p of sim.peds.list) list.push({ x: p.x, z: p.z, h: p.h, look: p.look, phase: p.phase, moving: p.state === 'walk' && !p.hit });
    for (const s of sim.peds.strollers) list.push({ x: s.x, z: s.z, h: s.h, look: s.look, phase: s.phase, moving: true });
    for (const p of list) {
      if (i >= N) break;
      const sw = p.moving ? Math.sin(p.phase) * 0.55 : 0, bob = p.moving ? Math.abs(Math.sin(p.phase)) * 0.03 : 0;
      const set = (im: THREE.InstancedMesh, rx: number, y: number, zoff = 0) => { e.set(rx, p.h, 0, 'YXZ'); qn.setFromEuler(e); pv.set(p.x, y + bob, p.z); void zoff; m.compose(pv, qn, one); im.setMatrixAt(i, m); };
      set(o.torso, 0, 0); set(o.head, 0, 0); set(o.legL, sw, 0.84); set(o.legR, -sw, 0.84);
      o.torso.setColorAt(i, tmpC.set(SHIRTS[p.look % SHIRTS.length]!)); o.head.setColorAt(i, tmpC.set(SKIN[p.look % SKIN.length]!)); o.legL.setColorAt(i, tmpC.set(PANTS[(p.look + 2) % PANTS.length]!)); o.legR.setColorAt(i, tmpC);
      i++;
    }
    for (const im of [o.torso, o.head, o.legL, o.legR]) { im.count = i; im.visible = i > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  });
  return <group ref={root} />;
}

// ------------------------------------------------------------------ the train ---
export function TrainView({ sim }: { sim: OpenSim }) {
  const N = 48;
  const o = useMemo(() => {
    const mk = (g: THREE.BufferGeometry) => { const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), N); im.frustumCulled = false; hideAt(im, 0, N); im.castShadow = true; return im; };
    const loco = new Acc(), boxcar = new Acc(), tank = new Acc(), hopper = new Acc();
    const red = col('#9c2a22'), dark = col('#222428'), yel = col('#e0b02a'), rust = col('#7a4a32'), blk = col('#1b1c1f'), grey = col('#8b8f94'), tan = col('#c2b79a');
    // each piece runs along +z, 3 m wide
    const boxZ = (a: Acc, w: number, h: number, l: number, y: number, c: THREE.Color, dz = 0) => box(a, 0, y, dz, w, h, l, c);
    boxZ(loco, 2.9, 3.2, 17, 1.0, red); boxZ(loco, 2.7, 1.2, 4.2, 4.2, red, 5.8); boxZ(loco, 3.0, 0.3, 17.4, 0.9, yel); boxZ(loco, 2.7, 0.9, 6.5, 4.2, dark, -3.5);
    boxZ(boxcar, 3.0, 3.6, 15.6, 1.2, rust); boxZ(boxcar, 3.1, 0.25, 15.8, 4.8, grey); boxZ(boxcar, 0.1, 3.2, 2.4, 1.3, dark, 0);
    tank.n; prismZ(tank, 1.5, 15, 1.0, grey); boxZ(tank, 2.2, 0.5, 15.6, 0.95, blk);
    boxZ(hopper, 3.0, 2.4, 15, 1.8, tan); boxZ(hopper, 2.4, 1.6, 15, 0.7, grey);
    for (const a of [loco, boxcar, tank, hopper]) for (const dz of [-5.5, 5.5]) boxZ(a, 2.4, 0.9, 2.6, 0.15, blk, dz);
    return { loco: mk(loco.geo()), box: mk(boxcar.geo()), tank: mk(tank.geo()), hopper: mk(hopper.geo()) };
  }, []);
  const root = useRef<THREE.Group>(null);
  useEffect(() => { const g = root.current; if (!g) return; g.add(o.loco, o.box, o.tank, o.hopper); return () => { g.remove(o.loco, o.box, o.tank, o.hopper); }; }, [o]);
  useFrame(() => {
    const cnt = { loco: 0, box: 0, tank: 0, hopper: 0 };
    for (const t of sim.trains.trains) for (const pc of t.pieces) { const k = pc.kind as keyof typeof cnt; const im = o[k]; const i = cnt[k]++; if (i < N) put(im, i, pc.x, 0.1, pc.z, pc.h + (t.dir === 1 ? 0 : 0)); }
    for (const k of ['loco', 'box', 'tank', 'hopper'] as const) { o[k].count = Math.min(N, cnt[k]); o[k].visible = cnt[k] > 0; o[k].instanceMatrix.needsUpdate = true; }
  });
  return <group ref={root} />;
}
/** a horizontal tank: a prism along z */
function prismZ(a: Acc, r: number, l: number, y: number, c: THREE.Color) {
  const seg = 12, ring0: number[] = [], ring1: number[] = [];
  for (let i = 0; i <= seg; i++) { const t = (i / seg) * Math.PI * 2, cx = Math.cos(t) * r, cy = y + r + Math.sin(t) * r; ring0.push(a.v(cx, cy, -l / 2, c, i / seg, 0, Math.cos(t), Math.sin(t), 0)); ring1.push(a.v(cx, cy, l / 2, c, i / seg, 1, Math.cos(t), Math.sin(t), 0)); }
  for (let i = 0; i < seg; i++) a.quad(ring0[i]!, ring0[i + 1]!, ring1[i + 1]!, ring1[i]!);
}

// ------------------------------------------------------------------ the trip: beacon and route line ---
export function Beacon({ sim }: { sim: OpenSim }) {
  const grp = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null), line = useRef<THREE.Mesh>(null);
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }), []);
  const lineMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3da8ff', transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -14, polygonOffsetUnits: -14 }), []);
  const lastRoute = useRef<unknown>(null); const geoRef = useRef<THREE.BufferGeometry | null>(null);
  useFrame(({ clock }) => {
    const ms = sim.mission, g = grp.current; if (!g) return;
    g.visible = !!ms;
    if (ms) { g.position.set(ms.x, 0, ms.z); if (ring.current) { ring.current.rotation.z = clock.elapsedTime * 1.2; const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.06; ring.current.scale.set(s, s, 1); } }
    const l = line.current; if (!l) return;
    const r = sim.route;
    if (r && (lastRoute.current !== r || (sim.time * 4 | 0) % 4 === 0)) {
      lastRoute.current = r;
      // from the point nearest the car to 450 m on
      let bi = 0, bd = 1e9; for (let k = 0; k < r.pts.length; k += 2) { const d = Math.hypot(r.pts[k]! - sim.x, r.pts[k + 1]! - sim.z); if (d < bd) { bd = d; bi = k; } }
      const pts: number[] = []; let acc = 0;
      for (let k = bi; k < r.pts.length; k += 2) { pts.push(r.pts[k]!, r.pts[k + 1]!); if (k > bi) acc += Math.hypot(r.pts[k]! - r.pts[k - 2]!, r.pts[k + 1]! - r.pts[k - 1]!); if (acc > 450) break; }
      const a = new Acc(); const W = 0.55;
      for (let k = 0; k < pts.length; k += 2) {
        const px = pts[k]!, pz = pts[k + 1]!, nx = pts[Math.min(k + 2, pts.length - 2)]! - pts[Math.max(k - 2, 0)]!, nz = pts[Math.min(k + 3, pts.length - 1)]! - pts[Math.max(k - 1, 1)]!, ln = Math.hypot(nx, nz) || 1, rx = -nz / ln * W, rz = nx / ln * W;
        const v0 = a.v(px - rx, 0.09, pz - rz, new THREE.Color(1, 1, 1)), v1 = a.v(px + rx, 0.09, pz + rz, new THREE.Color(1, 1, 1));
        if (k) a.quad(v0 - 2, v1 - 2, v1, v0);
      }
      geoRef.current?.dispose(); geoRef.current = a.empty ? new THREE.BufferGeometry() : a.geo(); l.geometry = geoRef.current;
    }
    l.visible = !!r;
  });
  return <>
    <group ref={grp}>
      <mesh position={[0, 20, 0]} material={beam}><cylinderGeometry args={[2.2, 2.2, 40, 24, 1, true]} /></mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}><ringGeometry args={[4.4, 5.2, 40]} /><meshBasicMaterial color="#f2c14e" transparent opacity={0.8} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} /></mesh>
    </group>
    <mesh ref={line} material={lineMat} renderOrder={12} frustumCulled={false}><bufferGeometry /></mesh>
  </>;
}

// ------------------------------------------------------------------ everything together ---
export function OpenWorld({ sim, env, quality }: { sim: OpenSim; env: Env; quality: Quality }) {
  const map = useMemo(() => loadMap(), []);
  const geo = useTownGeo(map);
  const shadow = quality.shadow > 0 && quality.tier === 'high';
  return <>
    <Ground />
    <Town geo={geo} env={env} shadow={shadow} />
    <ShopSigns geo={geo} env={env} />
    <Signage geo={geo} map={map} />
    <Courthouse geo={geo} />
    <Trees map={map} count={quality.lite ? 3000 : quality.tier === 'high' ? 7000 : 5000} />
    <Lamps map={map} env={env} />
    <Signals map={map} sim={sim} />
    <RailGates map={map} sim={sim} />
    <TrafficCars sim={sim} env={env} />
    <People sim={sim} />
    <TrainView sim={sim} />
    <Beacon sim={sim} />
  </>;
}
export { box };
