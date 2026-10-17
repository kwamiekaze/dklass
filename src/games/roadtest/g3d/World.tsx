import { Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { Clouds, Moon, ShootingStars, SkyDome, Stars, Sun } from '../../../components/nuhome2/world/Sky';
import { Weather } from '../../../components/nuhome2/world/Weather';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import { apply as applyAtmo, atmo, tickAtmo } from '../../../components/nuhome2/world/atmosphere';
import type { Quality } from '../../../components/nuhome2/world/quality';
import { ROAD_HALF, type RunSim } from './sim';
import { TOD_MIX, type Theme, type TimeOfDay } from './themes';
import { ROAD_TEX_L, ROAD_TEX_W, billboardTexture, facade, groundTexture, pavingTexture, roadTexture, speedSignTexture, schoolSignTexture, glowTexture } from './textures';
import { clamp, facadeBox, hash, hideInst, mod, setInst, smooth } from './util';

/** The world around the road: the homepage's sky, light and weather, the tarmac, and the town on both sides. Everything is built once and recycled as the car moves. */

export const AHEAD = 230;          // metres of road drawn in front
const BEHIND = 40;

// ------------------------------------------------------------ lights & fog ---
const FOG: Record<TimeOfDay, string> = { day: '#f3e4c6', golden: '#f4d39a', dusk: '#c98f84', night: '#0d1440' };
const SUN: Record<TimeOfDay, { color: string; k: number }> = {
  day: { color: '#ffe6bf', k: 2.7 }, golden: { color: '#ffc983', k: 2.7 }, dusk: { color: '#ff9d6e', k: 1.7 }, night: { color: '#9db8ff', k: 0.55 },
};

function Atmosphere({ theme, mix, shadow, sim }: { theme: Theme; mix: { current: number }; shadow: number; sim: RunSim }) {
  const { scene, gl } = useThree();
  const amb = useRef<THREE.AmbientLight>(null), hemi = useRef<THREE.HemisphereLight>(null), dir = useRef<THREE.DirectionalLight>(null), fill = useRef<THREE.DirectionalLight>(null);
  const c = useMemo(() => ({ fog: new THREE.Color(FOG[theme.tod]), grey: new THREE.Color('#b4bcc6'), greyN: new THREE.Color('#0d1226'), tmp: new THREE.Color() }), [theme.tod]);
  useEffect(() => { scene.fog = new THREE.Fog(FOG[theme.tod], 40, 235); scene.background = null; return () => { scene.fog = null; }; }, [scene, theme.tod]);
  useFrame((_, dt) => {
    tickAtmo(dt);
    mix.current = TOD_MIX[theme.tod];
    const m = mix.current, L = atmo.look, deep = atmo.deep * (theme.tod === 'night' ? 1 : 0);
    const cl = L.cloud, dim = 1 - 0.5 * cl * (1 - m) - 0.12 * L.storm, flash = atmo.flash * L.storm;
    const fog = scene.fog as THREE.Fog | null;
    const sun = SUN[theme.tod];
    if (fog) {
      fog.color.copy(c.fog).lerp(c.tmp.copy(c.grey).lerp(c.greyN, m), Math.min(1, 0.55 * cl + 0.4 * L.fog) * (theme.tod === 'golden' ? 0.7 : 1));
      if (flash > 0.01) fog.color.lerp(c.tmp.set('#dfe6ff'), flash * 0.5);
      const f = theme.fog;
      fog.near = (46 - 40 * L.fog - 16 * L.rain - 12 * L.snow) * f; fog.far = (240 - 190 * L.fog - 90 * L.rain - 70 * L.snow) * f;
    }
    scene.environmentIntensity = (1 - 0.55 * deep) * (1 - 0.3 * Math.max(0, cl - 0.06)) * (1 - 0.1 * L.storm) * (1 - 0.35 * m) + flash * 0.5;
    gl.toneMappingExposure = (0.9 - 0.08 * deep) * (1 - 0.1 * L.storm);
    if (amb.current) amb.current.intensity = (0.5 - 0.3 * m) * (1 - 0.3 * deep) + flash * 1.6;
    if (hemi.current) hemi.current.intensity = (1.0 - 0.66 * m) * (1 - 0.4 * deep) * (0.9 + 0.1 * (1 - cl));
    if (dir.current) {
      dir.current.color.set(sun.color);
      dir.current.intensity = sun.k * dim * (1 - 0.55 * deep) * (1 - 0.5 * L.rain * (1 - m)) + flash * 1.4;
      // the sun's shadow follows the car
      dir.current.position.set(-10, 17, sim.traveled * 0 + 13); dir.current.target.position.set(0, 0, -6); dir.current.target.updateMatrixWorld();
    }
    if (fill.current) fill.current.intensity = 0.5 * m * (1 - 0.55 * deep);
  });
  return <>
    <ambientLight ref={amb} color="#fff6ea" />
    <hemisphereLight ref={hemi} args={['#cfe6ff', '#d2c2a8', 1]} />
    <directionalLight ref={dir} castShadow={shadow > 0} shadow-mapSize-width={shadow || 16} shadow-mapSize-height={shadow || 16}
      shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={18} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={60} shadow-bias={-0.0005} shadow-normalBias={0.04} />
    <directionalLight ref={fill} position={[10, 9, 8]} color="#b8c8ff" />
  </>;
}

/** The sky, sun, moon and clouds are the homepage's own. They ride along with the camera so they hold still on the horizon. */
function SkyKit({ lite }: { lite: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { g.current?.position.copy(camera.position); });
  return <group ref={g}>
    <SkyDome />
    <Stars count={lite ? 2200 : 5200} />
    <ShootingStars />
    <Sun position={[34, 30, -78]} />
    <Moon position={[-30, 32, -68]} />
    <Clouds count={lite ? 10 : 20} />
  </group>;
}

// ------------------------------------------------------------------ ground & road ---
function Ground({ theme, sim }: { theme: Theme; sim: RunSim }) {
  const tex = useMemo(() => { const t = groundTexture(theme.ground).clone(); t.needsUpdate = true; t.repeat.set(70, 70); return t; }, [theme.ground]);
  useFrame(() => { tex.offset.y = (sim.traveled / 8) % 1 * 1; });
  return <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, -120]} receiveShadow>
    <planeGeometry args={[560, 560]} />
    <meshStandardMaterial map={tex} roughness={1} metalness={0} color={theme.ground === '#e8eef2' ? '#c9c9c9' : '#8e8e8e'} />
  </mesh>;
}

function Road({ theme, sim }: { theme: Theme; sim: RunSim }) {
  const len = AHEAD + BEHIND + 20;
  const road = useMemo(() => { const t = roadTexture(theme.road).clone(); t.needsUpdate = true; t.repeat.set(1, len / ROAD_TEX_L); return t; }, [theme.road, len]);
  const walk = useMemo(() => { const t = pavingTexture('#cbbfa8').clone(); t.needsUpdate = true; t.repeat.set(1.1, len / 3); return t; }, [len]);
  const kerbTex = useMemo(() => { const t = pavingTexture('#d9d0be').clone(); t.needsUpdate = true; t.repeat.set(0.1, len / 3); return t; }, [len]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const T = sim.traveled;
    road.offset.y = mod(T / ROAD_TEX_L, 1);
    walk.offset.y = mod(T / 3, 1); kerbTex.offset.y = mod(T / 3, 1);
    if (mat.current) { const wet = Math.min(1, atmo.look.rain * 1.2 + atmo.look.snow * 0.2); mat.current.roughness = 0.92 - 0.5 * wet; mat.current.envMapIntensity = 0.5 + 1.1 * wet; }
  });
  const zc = -(AHEAD - BEHIND) / 2 - 10;
  return <group>
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.0, zc]} receiveShadow>
      <planeGeometry args={[ROAD_TEX_W, len]} />
      <meshStandardMaterial ref={mat} map={road} roughness={0.92} metalness={0} envMapIntensity={0.5} />
    </mesh>
    {theme.sidewalk && [-1, 1].map((s) => <group key={s}>
      <mesh position={[s * (ROAD_TEX_W / 2 + 0.12), 0.07, zc]} receiveShadow castShadow={false}>
        <boxGeometry args={[0.24, 0.14, len]} />
        <meshStandardMaterial map={kerbTex} roughness={0.8} />
      </mesh>
      <mesh position={[s * (ROAD_TEX_W / 2 + 0.24 + 1.6), 0.075, zc]} receiveShadow>
        <boxGeometry args={[3.2, 0.15, len]} />
        <meshStandardMaterial map={walk} roughness={0.9} />
      </mesh>
    </group>)}
    {!theme.sidewalk && [-1, 1].map((s) => <mesh key={s} rotation-x={-Math.PI / 2} position={[s * (ROAD_TEX_W / 2 + 1.4), 0.002, zc]}>
      <planeGeometry args={[2.8, len]} /><meshStandardMaterial color={theme.road} roughness={1} />
    </mesh>)}
  </group>;
}

// ------------------------------------------------------------------ recycled scenery ---
type Slot = { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; color?: THREE.Color };

/**
 * Scenery that repeats forever. The world is cut into cells of `spacing` metres. The meshes hold a fixed window of cells; when the
 * car crosses a cell boundary the window slides and each instance is rewritten from the cell's noise. Between boundaries only the
 * parent group moves (one assignment per frame), so a long street costs almost nothing.
 */
function Scatter({ sim, geometry, material, spacing, per = 1, cellsAhead, cellsBehind = 2, make, shadow = false, order }: {
  sim: RunSim; geometry: THREE.BufferGeometry; material: THREE.Material; spacing: number; per?: number; cellsAhead?: number; cellsBehind?: number;
  make: (cell: number, k: number) => Slot | null; shadow?: boolean; order?: number;
}) {
  const ahead = cellsAhead ?? Math.ceil(AHEAD / spacing);
  const n = (ahead + cellsBehind + 1) * per;
  const holder = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const first = useRef(-1e9);
  const colored = useRef(false);
  useLayoutEffect(() => { if (mesh.current) { mesh.current.frustumCulled = false; first.current = -1e9; } }, [n]);
  useFrame(() => {
    const m = mesh.current, g = holder.current; if (!m || !g) return;
    g.position.z = sim.traveled;
    const f = Math.floor((sim.traveled - cellsBehind * spacing) / spacing);
    if (f === first.current) return;
    first.current = f;
    let i = 0;
    for (let c = f; c < f + ahead + cellsBehind + 1; c++) for (let k = 0; k < per; k++) {
      const s = make(c, k);
      if (!s) { hideInst(m, i++); continue; }
      setInst(m, i, s.x, s.y, -(c * spacing + s.z), s.ry, s.sx, s.sy, s.sz);
      if (s.color) { m.setColorAt(i, s.color); colored.current = true; }
      i++;
    }
    m.instanceMatrix.needsUpdate = true;
    if (colored.current && m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return <group ref={holder}>
    <instancedMesh ref={mesh} args={[geometry, material, n]} castShadow={shadow} receiveShadow={shadow} renderOrder={order} />
  </group>;
}

const col = (hex: string, jitter = 0, seed = 0) => { const c = new THREE.Color(hex); if (jitter) c.offsetHSL(0, 0, (hash(seed, 3) - 0.5) * jitter); return c; };

function useMats(theme: Theme) {
  return useMemo(() => {
    const f1 = facade('plain'), f2 = facade('glass');
    const wall = new THREE.MeshStandardMaterial({ map: f1.map, emissiveMap: f1.emis, emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, roughness: 0.88, color: '#ffffff' });
    const glass = new THREE.MeshStandardMaterial({ map: f2.map, emissiveMap: f2.emis, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0, roughness: 0.35, metalness: 0.25, color: '#ffffff', envMapIntensity: 1.3 });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#6b4a3a', roughness: 0.9, flatShading: true });
    const trunk = new THREE.MeshStandardMaterial({ color: '#6a4a32', roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: theme.place === 'country' && theme.weather === 'snow' ? '#f2f6f8' : '#4f8f46', roughness: 0.95, flatShading: true });
    const leaf2 = new THREE.MeshStandardMaterial({ color: theme.weather === 'snow' ? '#e8eef2' : '#6aa656', roughness: 0.95, flatShading: true });
    const pole = new THREE.MeshStandardMaterial({ color: '#16161c', roughness: 0.5, metalness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: '#c9971f', roughness: 0.35, metalness: 0.85 });
    const lampHead = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0.3, roughness: 0.4 });
    const concrete = new THREE.MeshStandardMaterial({ color: '#c8c6c0', roughness: 0.95 });
    const orange = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.7 });
    return { f1, f2, wall, glass, roofMat, trunk, leaf, leaf2, pole, gold, lampHead, concrete, orange, white };
  }, [theme.place, theme.weather]);
}

const FLOORS = [2, 3, 4, 6, 9, 13, 18];

function Town({ sim, theme, quality }: { sim: RunSim; theme: Theme; quality: Quality }) {
  const mix = useContext(NightCtx);
  const M = useMats(theme);
  const lite = quality.lite;
  const bGeo = useMemo(() => FLOORS.map((f) => facadeBox(f)), []);
  const treeTrunk = useMemo(() => { const g = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7); g.translate(0, 1.2, 0); return g; }, []);
  const treeTop = useMemo(() => { const g = new THREE.IcosahedronGeometry(1.7, 1); g.translate(0, 3.6, 0); return g; }, []);
  const treeTop2 = useMemo(() => { const g = new THREE.IcosahedronGeometry(1.2, 1); g.translate(0.2, 5.0, 0.1); return g; }, []);
  const pine = useMemo(() => { const g = new THREE.ConeGeometry(1.5, 5.2, 8); g.translate(0, 4.2, 0); return g; }, []);
  const lampPole = useMemo(() => { const g = new THREE.CylinderGeometry(0.07, 0.11, 7.2, 8); g.translate(0, 3.6, 0); return g; }, []);
  const lampArm = useMemo(() => { const g = new THREE.BoxGeometry(1.5, 0.1, 0.1); g.translate(0.75, 7.15, 0); return g; }, []);
  const lampHead = useMemo(() => { const g = new THREE.BoxGeometry(0.7, 0.12, 0.3); g.translate(1.5, 7.08, 0); return g; }, []);
  const houseBody = useMemo(() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; }, []);
  const roofGeo = useMemo(() => { const g = new THREE.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; }, []);
  const fenceGeo = useMemo(() => { const g = new THREE.BoxGeometry(5.6, 0.9, 0.08); g.translate(0, 0.45, 0); return g; }, []);
  const barrierGeo = useMemo(() => { const g = new THREE.BoxGeometry(0.5, 0.9, 4); g.translate(0, 0.45, 0); return g; }, []);
  const barrelGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.32, 0.38, 0.95, 12); g.translate(0, 0.475, 0); return g; }, []);
  const awning = useMemo(() => { const g = new THREE.BoxGeometry(1, 0.12, 1); g.translate(0, 0, 0.5); return g; }, []);
  const glowTex = useMemo(() => glowTexture(), []);
  const glowGeo = useMemo(() => new THREE.PlaneGeometry(3.2, 3.2), []);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffcf80', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), [glowTex]);
  const poolGeo = useMemo(() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; }, []);
  const poolMat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffd28a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [glowTex]);
  const signGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const boardMat = useMemo(() => new THREE.MeshStandardMaterial({ map: billboardTexture(), roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveMap: billboardTexture(), emissiveIntensity: 0.0 }), []);
  const speedMat = useMemo(() => new THREE.MeshStandardMaterial({ map: speedSignTexture(sim.level.speedLimit), roughness: 0.55 }), [sim]);
  const schoolMat = useMemo(() => new THREE.MeshStandardMaterial({ map: schoolSignTexture(), roughness: 0.55 }), []);
  const postGeo = useMemo(() => { const g = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6); g.translate(0, 1.3, 0); return g; }, []);

  useFrame(() => {
    const m = mix.current, night = clamp(m * 1.25 - 0.1, 0, 1) + atmo.deep * 0.3;
    M.wall.emissiveIntensity = M.glass.emissiveIntensity = night * 1.25;
    M.lampHead.emissiveIntensity = 0.25 + night * 2.2;
    glowMat.opacity = night * 0.85;
    poolMat.opacity = night * 0.5 * (1 - 0.4 * atmo.look.rain);
    boardMat.emissiveIntensity = 0.12 + night * 0.7;
  });

  const place = theme.place;
  const city = place === 'city' || place === 'neon' || place === 'alley';
  const wallMat = place === 'city' && theme.walls[0] === '#9fb6c9' ? M.glass : M.wall;
  const dense = theme.density;
  const lampSpace = place === 'highway' ? 48 : 26;
  const sideOff = place === 'alley' ? 7.6 : 9.0;
  const bSpace = place === 'alley' ? 14 : 19;

  const treeSlot = (cell: number, k: number): Slot | null => {
    const s = k === 0 ? -1 : 1;
    const h = hash(cell, 40 + k);
    const gap = place === 'country' ? 0.15 : place === 'highway' ? 0.55 : city ? 0.5 : place === 'lot' ? 0.5 : 0.28;
    if (h < gap) return null;
    const dist = (place === 'country' ? 8 : city ? 6.9 : 7.4) + hash(cell, 5 + k) * (place === 'country' ? 20 : city ? 1.2 : 9);
    const sc = 0.85 + hash(cell, 9 + k) * 0.75;
    return { x: s * dist, y: 0, z: hash(cell, 11 + k) * 6, ry: hash(cell, 13) * 6, sx: sc, sy: sc * (0.9 + hash(cell, 17) * 0.4), sz: sc, color: col(hash(cell, 19) > 0.5 ? '#ffffff' : '#e8f2dd', 0.18, cell * 7 + k) };
  };

  return <>
    {/* trees: trunk + two crowns (or pines in the countryside) */}
    <Scatter sim={sim} geometry={treeTrunk} material={M.trunk} spacing={7} per={2} make={treeSlot} shadow={!lite} />
    {place === 'country' || (place === 'highway' && hash(1, 1) > 2)
      ? <Scatter sim={sim} geometry={pine} material={M.leaf} spacing={7} per={2} make={treeSlot} shadow={!lite} />
      : <>
        <Scatter sim={sim} geometry={treeTop} material={M.leaf} spacing={7} per={2} make={treeSlot} shadow={!lite} />
        <Scatter sim={sim} geometry={treeTop2} material={M.leaf2} spacing={7} per={2} make={treeSlot} />
      </>}

    {/* lamp posts: black and gold, both sides, with a glow and a pool of light on the road at night */}
    {[-1, 1].map((s) => {
      const mk = (cell: number): Slot | null => (cell % 1 === 0 ? { x: s * (ROAD_HALF + 0.6), y: 0, z: hash(cell, 2) * 0.1 + (s > 0 ? 0 : lampSpace / 2), ry: s > 0 ? Math.PI : 0, sx: 1, sy: 1, sz: 1 } : null);
      return <group key={s}>
        <Scatter sim={sim} geometry={lampPole} material={M.pole} spacing={lampSpace} make={mk} shadow={false} />
        <Scatter sim={sim} geometry={lampArm} material={M.pole} spacing={lampSpace} make={mk} />
        <Scatter sim={sim} geometry={lampHead} material={M.lampHead} spacing={lampSpace} make={mk} />
        <Scatter sim={sim} geometry={glowGeo} material={glowMat} spacing={lampSpace} order={5}
          make={(c) => { const q = mk(c)!; return { ...q, x: q.x + (q.ry ? -1.5 : 1.5), y: 7.0, sx: 1, sy: 1, sz: 1, ry: 0 }; }} />
        <Scatter sim={sim} geometry={poolGeo} material={poolMat} spacing={lampSpace} order={4}
          make={(c) => { const q = mk(c)!; return { ...q, x: q.x + (q.ry ? -3 : 3), y: 0.03, ry: 0, sx: 11, sy: 1, sz: 15 }; }} />
      </group>;
    })}

    {/* buildings: every place has a different kind of street, all in the homepage's cream, black and gold */}
    {(city || place === 'plaza' || place === 'school') && FLOORS.map((fl, ci) => (
      <Scatter key={ci} sim={sim} geometry={bGeo[ci]!} material={wallMat} spacing={bSpace} per={2} shadow={false}
        make={(cell, k) => {
          const s = k === 0 ? -1 : 1;
          const h = hash(cell, 60 + k);
          if (h > dense + 0.15) return null;
          const maxFl = place === 'alley' ? 4 : place === 'plaza' ? 3 : place === 'school' ? 2 : 6;
          const want = Math.floor(hash(cell, 70 + k) * (city && place !== 'alley' ? FLOORS.length : 3 + (maxFl > 3 ? 2 : 0)));
          const cls = Math.min(FLOORS.length - 1, want);
          if (cls !== ci) return null;
          const w = (place === 'alley' ? 10 : 13) + hash(cell, 80 + k) * 5, d = 12 + hash(cell, 90 + k) * 4;
          return { x: s * (sideOff + (place === 'school' ? 4 : 0) + w / 2 + hash(cell, 100 + k) * (place === 'alley' ? 0.3 : 1.5)), y: 0, z: 0, ry: 0, sx: w, sy: fl * 3.4, sz: d, color: col(theme.walls[Math.floor(hash(cell, 110 + k) * theme.walls.length)]!, 0.04, cell + k) };
        }} />
    ))}
    {/* shop awnings on the street level of the city blocks */}
    {city && <Scatter sim={sim} geometry={awning} material={M.gold} spacing={bSpace} per={2}
      make={(cell, k) => { const s = k === 0 ? -1 : 1; if (hash(cell, 60 + k) > dense + 0.15 || hash(cell, 130 + k) > 0.55) return null; return { x: s * (sideOff - 0.1), y: 3.2, z: 0, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2, sx: 8, sy: 1, sz: 1.6 }; }} />}

    {/* houses: a white body and a roof */}
    {(place === 'suburb' || place === 'school') && <>
      <Scatter sim={sim} geometry={houseBody} material={M.wall} spacing={22} per={2} shadow={!lite}
        make={(cell, k) => { const s = k === 0 ? -1 : 1; if (hash(cell, 150 + k) > 0.85) return null; const w = 9 + hash(cell, 3) * 3; return { x: s * (14.5 + hash(cell, 4 + k) * 3), y: 0, z: 4 + hash(cell, 8 + k) * 8, ry: 0, sx: w, sy: 5 + hash(cell, 6) * 1.5, sz: 9, color: col(theme.walls[Math.floor(hash(cell, 12 + k) * theme.walls.length)]!, 0.05, cell) }; }} />
      <Scatter sim={sim} geometry={roofGeo} material={M.roofMat} spacing={22} per={2} shadow={!lite}
        make={(cell, k) => { const s = k === 0 ? -1 : 1; if (hash(cell, 150 + k) > 0.85) return null; const w = 9 + hash(cell, 3) * 3, h = 5 + hash(cell, 6) * 1.5; return { x: s * (14.5 + hash(cell, 4 + k) * 3), y: h, z: 4 + hash(cell, 8 + k) * 8, ry: 0, sx: w * 1.12, sy: 2.9, sz: 9 * 1.12, color: col(hash(cell, 14) > 0.5 ? '#6b4a3a' : '#4d4f57', 0.1, cell) }; }} />
      <Scatter sim={sim} geometry={fenceGeo} material={M.white} spacing={5.6} per={2}
        make={(cell, k) => ({ x: (k === 0 ? -1 : 1) * 8.7, y: 0, z: 0, ry: Math.PI / 2, sx: 1, sy: 1, sz: 1 })} />
    </>}

    {/* highway: barriers along both sides */}
    {place === 'highway' && <Scatter sim={sim} geometry={barrierGeo} material={M.concrete} spacing={4} per={2}
      make={(cell, k) => ({ x: (k === 0 ? -1 : 1) * (ROAD_HALF + 1.0), y: 0, z: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />}

    {/* construction: rows of barrels */}
    {place === 'works' && <Scatter sim={sim} geometry={barrelGeo} material={M.orange} spacing={6} per={2}
      make={(cell, k) => (hash(cell, 3 + k) > 0.12 ? { x: (k === 0 ? -1 : 1) * (ROAD_HALF + 0.55 + hash(cell, 9) * 0.3), y: 0, z: hash(cell, 5) * 2, ry: 0, sx: 1, sy: 1, sz: 1 } : null)} />}

    {/* roadside signs */}
    <Scatter sim={sim} geometry={signGeo} material={speedMat} spacing={260} per={1} cellsAhead={1}
      make={(cell) => ({ x: ROAD_HALF + 1.7, y: 2.1, z: 20, ry: 0, sx: 0.75, sy: 1, sz: 1 })} />
    <Scatter sim={sim} geometry={postGeo} material={M.pole} spacing={260} per={1} cellsAhead={1}
      make={() => ({ x: ROAD_HALF + 1.7, y: 0, z: 20.05, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    {place === 'school' && <Scatter sim={sim} geometry={signGeo} material={schoolMat} spacing={130} per={1} cellsAhead={2}
      make={() => ({ x: -(ROAD_HALF + 1.8), y: 2.3, z: 40, ry: 0, sx: 1.1, sy: 1.1, sz: 1 })} />}

    {/* DrivingKlass billboards */}
    <Scatter sim={sim} geometry={signGeo} material={boardMat} spacing={380} per={1} cellsAhead={1}
      make={(cell) => { const s = hash(cell, 1) > 0.5 ? 1 : -1; return { x: s * (ROAD_HALF + 7.4), y: 6.2, z: 90, ry: s > 0 ? -0.28 : 0.28, sx: 10.6, sy: 4, sz: 1 }; }} />
    <Scatter sim={sim} geometry={postGeo} material={M.pole} spacing={380} per={1} cellsAhead={1}
      make={(cell) => { const s = hash(cell, 1) > 0.5 ? 1 : -1; return { x: s * (ROAD_HALF + 7.4), y: 0, z: 90, ry: 0, sx: 2.2, sy: 2.4, sz: 2.2 }; }} />
  </>;
}

// ------------------------------------------------------------------ backdrop ---
/** A far skyline or hills, painted once on a wide plane that rides ahead of the car and fades into the fog. */
function Backdrop({ theme }: { theme: Theme }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const tex = useMemo(() => {
    const W = 2048, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
    let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    g.fillStyle = '#fff';
    const city = theme.place === 'city' || theme.place === 'neon' || theme.place === 'plaza' || theme.place === 'alley';
    if (city) {
      let x = 0; while (x < W) { const w = 40 + r() * 90, h = 50 + r() * 150 * (r() > 0.8 ? 1.6 : 1); g.fillRect(x, H - h, w, h); if (r() > 0.7) g.fillRect(x + w * 0.4, H - h - 24, 6, 24); x += w + r() * 14; }
    } else {
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) g.lineTo(x, H - 40 - 30 * Math.sin(x / 190) - 22 * Math.sin(x / 71 + 1) - 18 * Math.sin(x / 33 + 2) - (theme.place === 'country' ? 36 : 0));
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [theme.place]);
  const tint = useMemo(() => new THREE.Color(), []), haze = useMemo(() => new THREE.Color('#586a82'), []);
  useFrame(({ camera, scene }) => {
    const m = mesh.current; if (!m) return;
    m.position.set(camera.position.x * 0.9, 20, camera.position.z - 215);
    const fog = scene.fog as THREE.Fog | null;
    if (fog && mat.current) {
      tint.copy(fog.color).multiplyScalar(0.8).lerp(haze, 0.18 * (1 - smooth(0, 150, fog.far - 90)));
      mat.current.color.copy(tint);
      mat.current.opacity = clamp((fog.far - 80) / 160, 0, 0.92);
    }
  });
  return <mesh ref={mesh} renderOrder={-5}>
    <planeGeometry args={[760, 95]} />
    <meshBasicMaterial ref={mat} map={tex} transparent depthWrite={false} fog={false} toneMapped={false} />
  </mesh>;
}

// ------------------------------------------------------------------ the whole world ---
export function World({ sim, theme, quality }: { sim: RunSim; theme: Theme; quality: Quality }) {
  const mix = useRef(TOD_MIX[theme.tod]);
  const lite = quality.lite;
  // pin the homepage's weather store to this lesson (and give the homepage its own back afterwards)
  useLayoutEffect(() => {
    atmo.debug = true; atmo.preview = { weather: theme.weather, night: 'normal' }; applyAtmo();
    atmo.look = { ...atmo.goal }; atmo.deep = atmo.deepGoal;
    return () => { atmo.debug = false; atmo.preview = { weather: 'live', night: 'live' }; applyAtmo(); };
  }, [theme.weather]);
  return <NightCtx.Provider value={mix}>
    <Atmosphere theme={theme} mix={mix} shadow={quality.shadow} sim={sim} />
    <Environment resolution={lite ? 128 : 256}>
      <Lightformer intensity={2.2} position={[0, 8, 4]} scale={[24, 10, 1]} />
      <Lightformer intensity={1.8} color={theme.tod === 'night' ? '#9db4ff' : '#fff0d8'} position={[-12, 3, 6]} scale={[18, 7, 1]} />
      <Lightformer intensity={1.3} color="#ffe2a0" position={[12, 3, 8]} scale={[16, 6, 1]} />
      <Lightformer intensity={1.9} color="#fff0d0" position={[0, 4, 22]} rotation-y={Math.PI} scale={[44, 9, 1]} />
    </Environment>
    <SkyKit lite={lite} />
    <Backdrop theme={theme} />
    <Ground theme={theme} sim={sim} />
    <Road theme={theme} sim={sim} />
    <Suspense fallback={null}><Town sim={sim} theme={theme} quality={quality} /></Suspense>
    <Weather lite={lite} offline />
  </NightCtx.Provider>;
}
