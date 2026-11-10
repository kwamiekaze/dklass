import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx, rng } from './theme';
import { palette } from './palette';
import { dressedStone, tiled } from './surfaces';

const stone = new THREE.MeshStandardMaterial({ color: '#efe4d6', roughness: .55, metalness: .02 });
let dressed = false;
/** The basin and bowls take the same dressed limestone as the building's trim (made on first use, in the browser). */
function dress() { if (dressed || typeof document === 'undefined') return; dressed = true; const d = dressedStone(256); stone.map = tiled(d.map, 6, 2); stone.normalMap = tiled(d.normalMap, 6, 2); stone.normalScale.set(.7, .7); stone.needsUpdate = true; }
const gold = new THREE.MeshStandardMaterial({ color: palette.goldBright, roughness: .22, metalness: 1 });

function lathe(points: [number, number][], seg = 56) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function noiseTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!; const r = rng(4);
  g.fillStyle = '#8080ff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) { const x = r() * 256, y = r() * 256, rad = 6 + r() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, rad); const a = r() > .5 ? '#9a9aff' : '#6a6aff'; gr.addColorStop(0, a); gr.addColorStop(1, '#8080ff'); g.fillStyle = gr; g.globalAlpha = .5; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 8; return t;
}

function streakTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d')!; g.clearRect(0, 0, 128, 256); const r = rng(8);
  for (let i = 0; i < 46; i++) { const x = r() * 128, w = 1 + r() * 3, y = r() * 256, h = 40 + r() * 140; const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(235,248,255,${.35 + r() * .5})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 1); return t;
}

/** A three tier stone fountain with jets, falling sheets, ripples and night lighting. */
export function Fountain({ position, mobile, scale = 1 }: { position: [number, number, number]; mobile: boolean; scale?: number }) {
  const mix = useContext(NightCtx);
  useMemo(dress, []);
  const normal = useMemo(noiseTexture, []);
  const streaks = useMemo(streakTexture, []);
  const water = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#6fbad0', roughness: .06, metalness: .1, clearcoat: 1, transparent: true, opacity: .9, normalMap: normal, normalScale: new THREE.Vector2(.35, .35), envMapIntensity: 1.6, emissive: '#3aa0d0', emissiveIntensity: .05 }), [normal]);
  const sheet = useMemo(() => new THREE.MeshBasicMaterial({ map: streaks, transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false, color: '#e8f6ff', toneMapped: false }), [streaks]);
  const drop = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: .8, toneMapped: false }), []);
  const G = useMemo(() => ({
    basin: lathe([[0, 0], [3.25, 0], [3.3, .5], [3.15, .62], [3.05, .68], [3.0, .5], [2.95, .18], [0, .18]]),
    rim: lathe([[3.05, .68], [3.2, .68], [3.3, .6], [3.34, .5]], 64),
    col: lathe([[0, .18], [.55, .18], [.5, .38], [.3, .5], [.22, .9], [.3, 1.15], [.2, 1.4], [.24, 1.75], [.5, 1.85], [0, 1.85]], 32),
    bowl2: lathe([[0, 1.75], [.2, 1.78], [.9, 1.95], [1.55, 2.2], [1.6, 2.32], [1.5, 2.34], [1.42, 2.28], [.9, 2.08], [0, 2.02]], 48),
    stem: lathe([[0, 2.0], [.16, 2.0], [.13, 2.4], [.2, 2.7], [.11, 2.95], [0, 2.95]], 24),
    bowl3: lathe([[0, 2.85], [.12, 2.88], [.55, 3.0], [.9, 3.22], [.94, 3.32], [.86, 3.34], [.8, 3.28], [.5, 3.12], [0, 3.06]], 40),
    spire: lathe([[0, 3.05], [.1, 3.05], [.07, 3.4], [.12, 3.6], [.05, 3.9], [0, 3.95]], 16),
  }), []);
  const N = mobile ? 260 : 520;
  const inst = useRef<THREE.InstancedMesh>(null);
  const jets = useMemo(() => { const r = rng(12); return Array.from({ length: N }).map((_, i) => ({ k: i % 11, off: r(), sp: 1.5 + r() * .5, jx: (r() - .5) * .35, jz: (r() - .5) * .35, s: .55 + r() * .8 })); }, [N]);
  const ripples = useRef<THREE.Mesh[]>([]);
  const light = useRef<THREE.PointLight>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => { if (inst.current) inst.current.frustumCulled = false; }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, m = inst.current; if (!m) return;
    normal.offset.set(t * .012, t * .02); streaks.offset.y = -t * .9;
    for (let i = 0; i < N; i++) {
      const j = jets[i];
      if (j.k < 8) { // basin rim jets arc inward onto the middle bowl
        const life = .78, u = ((t * j.sp * .9 + j.off) % 1) * life, a = (j.k / 8) * Math.PI * 2;
        const rad = 2.95 - 2.05 * (u / life) * (1 + j.jx * .1);
        tmp.position.set(Math.cos(a) * rad + j.jx * u, .72 + 3.5 * u - 4.6 * u * u, Math.sin(a) * rad + j.jz * u);
      } else if (j.k === 8) { // tall centre plume
        const life = 1.15, u = ((t * j.sp * .75 + j.off) % 1) * life;
        tmp.position.set(j.jx * u * 1.6, 3.9 + 4.4 * u - 4.7 * u * u, j.jz * u * 1.6);
      } else { // upper bowl spill droplets
        const life = .55, u = ((t * j.sp * .8 + j.off) % 1) * life, a = (i * 2.399) % (Math.PI * 2);
        const rad = .9 + 1.1 * (u / life);
        tmp.position.set(Math.cos(a) * rad, 3.28 - 5.2 * u * u * 1.1, Math.sin(a) * rad);
        if (tmp.position.y < 2.3) tmp.position.y = 2.3 + (1 - u / life) * .02;
      }
      const s = .035 * j.s; tmp.scale.set(s, s * 1.5, s); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    ripples.current.forEach((r, i) => { if (!r) return; const p = ((t * .6 + i * .125) % 1); r.scale.setScalar(.4 + p * 1.0); (r.material as THREE.MeshBasicMaterial).opacity = (1 - p) * .55; });
    water.emissiveIntensity = .05 + .55 * mix.current;
    if (light.current) light.current.intensity = .3 + 5 * mix.current;
  });
  return <group position={position} scale={scale}>
    <mesh geometry={G.basin} material={stone} castShadow receiveShadow />
    <mesh geometry={G.rim} material={gold} />
    <mesh position={[0, .55, 0]} rotation-x={-Math.PI / 2} material={water}><circleGeometry args={[2.95, 56]} /></mesh>
    <mesh geometry={G.col} material={stone} castShadow />
    <mesh geometry={G.bowl2} material={stone} castShadow />
    <mesh geometry={G.stem} material={stone} castShadow />
    <mesh geometry={G.bowl3} material={stone} castShadow />
    <mesh geometry={G.spire} material={gold} />
    <mesh position={[0, 3.98, 0]} material={gold}><sphereGeometry args={[.1, 14, 10]} /></mesh>
    <mesh position={[0, 2.3, 0]} rotation-x={-Math.PI / 2} material={water}><circleGeometry args={[1.42, 40]} /></mesh>
    <mesh position={[0, 3.26, 0]} rotation-x={-Math.PI / 2} material={water}><circleGeometry args={[.84, 32]} /></mesh>
    {/* falling sheets of water */}
    <mesh position={[0, 1.45, 0]} material={sheet}><cylinderGeometry args={[1.56, 1.42, 1.65, 48, 1, true]} /></mesh>
    <mesh position={[0, 2.68, 0]} material={sheet}><cylinderGeometry args={[.9, .86, .9, 40, 1, true]} /></mesh>
    <instancedMesh ref={inst} args={[undefined, undefined, N]} material={drop}><sphereGeometry args={[1, 6, 5]} /></instancedMesh>
    {/* ripples where the jets land */}
    {Array.from({ length: 8 }).map((_, i) => <mesh key={i} ref={el => { if (el) ripples.current[i] = el; }} position={[Math.cos((i / 8) * Math.PI * 2) * 1.6, .59, Math.sin((i / 8) * Math.PI * 2) * 1.6]} rotation-x={-Math.PI / 2}><ringGeometry args={[.42, .5, 28]} /><meshBasicMaterial color="#ffffff" transparent opacity={.4} depthWrite={false} toneMapped={false} /></mesh>)}
    {!mobile && <pointLight ref={light} position={[0, .9, 0]} color="#7fd0ff" distance={11} intensity={.5} />}
  </group>;
}
