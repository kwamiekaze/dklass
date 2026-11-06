import { useMemo } from 'react';
import * as THREE from 'three';
import { StopSign } from '../../components/nuhome2/world/StopSign';
import { Plant } from '../../components/nuhome2/world/Plants';
import { makeCanvasTexture } from '../../components/nuhome2/world/parts';
import { LEG, heading, rightOf, type Dir, type Layout } from './engine';
import { mulberry, type Style, type TimeOfDay } from './look';
import { SIDE_BAND } from './Ground';

const FONT = '"Poppins", "Arial Black", Arial, sans-serif';
const glow = (() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,214,140,1)'); r.addColorStop(.35, 'rgba(255,190,100,.35)'); r.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const CURB = .15;

/** The stop sign, as big as the one on the homepage reads on a phone, with an ALL WAY plaque where every leg stops. */
export function Sign({ from, allWay }: { from: Dir; allWay: boolean }) {
  const r = rightOf(heading(from)), L = LEG[from];
  const x = L[0] * 8.3 + r[0] * (4 + SIDE_BAND * .55), z = L[1] * 8.3 + r[1] * (4 + SIDE_BAND * .55);
  const plaque = useMemo(() => makeCanvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, w, h); g.fillStyle = '#c4161c'; g.fillRect(6, 6, w - 12, h - 12); g.fillStyle = '#f7f5ee'; g.fillRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#c4161c'; g.font = `800 ${h * .46}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ALL WAY', w / 2, h / 2 + 2);
  }, 8), []);
  return <group position={[x, CURB, z]} scale={3.1}>
    <StopSign position={[0, 0, 0]} rotationY={Math.atan2(L[0], L[1])} />
    {allWay && <mesh position={[0, 1.42, .004]} rotation-y={Math.atan2(L[0], L[1])}><planeGeometry args={[.5, .19]} /><meshStandardMaterial map={plaque} roughness={.5} /></mesh>}
  </group>;
}

/** A street lamp. At night it glows and throws a pool of light. */
export function Lamp({ x, z, face, night }: { x: number; z: number; face: number; night: boolean }) {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2c31', metalness: .6, roughness: .45 }), []);
  const head = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3d4', emissive: '#ffcf80', emissiveIntensity: night ? 3 : .08 }), [night]);
  return <group position={[x, CURB, z]} rotation-y={face}>
    <mesh position={[0, 3.3, 0]} material={metal} castShadow><cylinderGeometry args={[.07, .11, 6.6, 10]} /></mesh>
    <mesh position={[.9, 6.55, 0]} material={metal}><boxGeometry args={[1.9, .09, .09]} /></mesh>
    <mesh position={[1.7, 6.48, 0]} material={metal}><boxGeometry args={[.9, .14, .42]} /></mesh>
    <mesh position={[1.7, 6.4, 0]} material={head}><boxGeometry args={[.78, .04, .34]} /></mesh>
    {night && glow && <sprite position={[1.7, 6.2, 0]} scale={[5.5, 5.5, 1]}><spriteMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></sprite>}
    {night && <pointLight position={[1.7, 5.8, 0]} intensity={34} distance={19} decay={2} color="#ffd9a0" />}
  </group>;
}

function Hydrant({ x, z }: { x: number; z: number }) {
  return <group position={[x, CURB, z]}>
    <mesh position={[0, .32, 0]} castShadow><cylinderGeometry args={[.11, .13, .64, 12]} /><meshStandardMaterial color="#c9231d" roughness={.45} metalness={.2} /></mesh>
    <mesh position={[0, .68, 0]}><sphereGeometry args={[.125, 12, 8, 0, 6.3, 0, 1.6]} /><meshStandardMaterial color="#c9231d" roughness={.45} /></mesh>
    <mesh position={[0, .42, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[.07, .07, .42, 8]} /><meshStandardMaterial color="#b11c17" roughness={.5} /></mesh>
  </group>;
}

function Mailbox({ x, z, face }: { x: number; z: number; face: number }) {
  return <group position={[x, CURB, z]} rotation-y={face}>
    <mesh position={[0, .55, 0]} castShadow><boxGeometry args={[.1, 1.1, .1]} /><meshStandardMaterial color="#5b4a3a" roughness={.8} /></mesh>
    <mesh position={[0, 1.18, 0]} castShadow><boxGeometry args={[.28, .26, .52]} /><meshStandardMaterial color="#2e5aa8" roughness={.5} metalness={.3} /></mesh>
  </group>;
}

function Bench({ x, z, face }: { x: number; z: number; face: number }) {
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: .7 }), []);
  return <group position={[x, CURB, z]} rotation-y={face}>
    <mesh position={[0, .46, 0]} material={wood} castShadow><boxGeometry args={[1.7, .07, .5]} /></mesh>
    <mesh position={[0, .8, -.22]} rotation-x={-.12} material={wood} castShadow><boxGeometry args={[1.7, .4, .06]} /></mesh>
    {[-.75, .75].map(s => <mesh key={s} position={[s, .22, 0]}><boxGeometry args={[.07, .44, .45]} /><meshStandardMaterial color="#27272c" metalness={.6} roughness={.5} /></mesh>)}
  </group>;
}

const WALLS = ['#f1e6cf', '#cfe0ea', '#d7e2c5', '#e9c9b8', '#e8dcc0', '#c8d4e8', '#f0d9a8', '#d9c8b8'];
const ROOFS = ['#4a3b36', '#3a3f4a', '#5a3a30', '#2f3a38'];
const BRICK = ['#a8553f', '#9b4a3a', '#b86a4a', '#8d5140'];

/** A house that faces +z, set 8 m deep, with a gable roof, a porch, a chimney and a garage. */
export function House({ x, z, face, seed, night, low }: { x: number; z: number; face: number; seed: number; night: boolean; low?: boolean }) {
  const r = useMemo(() => mulberry(seed), [seed]);
  const wall = useMemo(() => WALLS[Math.floor(r() * WALLS.length)]!, [r]), roof = useMemo(() => ROOFS[Math.floor(r() * ROOFS.length)]!, [r]);
  const rg = useMemo(() => { const s = new THREE.Shape(); s.moveTo(-4.4, 0); s.lineTo(4.4, 0); s.lineTo(0, 2.1); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 11.4, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-5.7, 0, 0); return g; }, []);
  const H = low ? 3.2 : 3.6;
  return <group position={[x, CURB, z]} rotation-y={face}>
    <mesh position={[0, H / 2, 0]} castShadow receiveShadow><boxGeometry args={[10.4, H, 8]} /><meshStandardMaterial color={wall} roughness={.9} /></mesh>
    {[-3.2, 3.2].map(wx => <mesh key={wx} position={[wx, 1.9, 4.015]}><planeGeometry args={[1.9, 1.5]} /><meshStandardMaterial color={night ? '#ffcf86' : '#7da2c4'} emissive={night ? '#ffa845' : '#000'} emissiveIntensity={night ? 1.1 : 0} roughness={.25} metalness={.1} /></mesh>)}
    <mesh position={[0, 1.2, 4.02]}><boxGeometry args={[1.1, 2.1, .06]} /><meshStandardMaterial color="#6b3d2a" roughness={.7} /></mesh>
    <mesh position={[0, 2.6, 4.4]} castShadow><boxGeometry args={[2.6, .12, 1.6]} /><meshStandardMaterial color="#f4f1ea" roughness={.7} /></mesh>
    {[-1.1, 1.1].map(px => <mesh key={px} position={[px, 1.3, 5]} castShadow><boxGeometry args={[.12, 2.6, .12]} /><meshStandardMaterial color="#f4f1ea" /></mesh>)}
    <mesh position={[0, .08, 4.9]} receiveShadow><boxGeometry args={[2.8, .16, 1.9]} /><meshStandardMaterial color="#bdb9b0" roughness={.9} /></mesh>
    <mesh position={[0, H + .02, 0]} geometry={rg} castShadow><meshStandardMaterial color={roof} roughness={.9} /></mesh>
    <mesh position={[2.6, H + 1.7, -1.2]} castShadow><boxGeometry args={[.8, 1.8, .8]} /><meshStandardMaterial color="#8a5440" roughness={.9} /></mesh>
    {/* the garage, a low wing on the side */}
    <mesh position={[8, 1.4, 1]} castShadow receiveShadow><boxGeometry args={[5.6, 2.8, 6]} /><meshStandardMaterial color={wall} roughness={.9} /></mesh>
    <mesh position={[8, 2.84, 1]} castShadow><boxGeometry args={[6, .18, 6.4]} /><meshStandardMaterial color={roof} roughness={.9} /></mesh>
    <mesh position={[8, 1.1, 4.02]}><boxGeometry args={[3.6, 2.1, .06]} /><meshStandardMaterial color="#e8e5de" roughness={.6} /></mesh>
    {[0, 1, 2].map(i => <mesh key={i} position={[8, .5 + i * .6, 4.06]}><boxGeometry args={[3.5, .03, .02]} /><meshStandardMaterial color="#b9b6ae" /></mesh>)}
    <mesh position={[8, .06, 7.5]} receiveShadow><boxGeometry args={[4.2, .12, 7]} /><meshStandardMaterial color="#aaa7a0" roughness={.95} /></mesh>
  </group>;
}

const SHOPS = ['CAFE', 'BAKERY', 'BOOKS', 'PIZZA', 'FLOWERS', 'HARDWARE', 'DINER', 'MARKET'];
function Shop({ x, z, face, seed, night, low }: { x: number; z: number; face: number; seed: number; night: boolean; low?: boolean }) {
  const r = useMemo(() => mulberry(seed), [seed]);
  const brick = useMemo(() => BRICK[Math.floor(r() * BRICK.length)]!, [r]);
  const name = useMemo(() => SHOPS[Math.floor(r() * SHOPS.length)]!, [r]);
  const awn = useMemo(() => ['#c4161c', '#2459a8', '#2f8f4e', '#e8a31c'][Math.floor(r() * 4)]!, [r]);
  const H = low ? 3.4 : 5.2;
  const sign = useMemo(() => makeCanvasTexture(512, 128, (g, w, h) => { g.fillStyle = '#1b1b22'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c14e'; g.font = `800 ${h * .56}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 + 4); }, 8), [name]);
  const stripes = useMemo(() => makeCanvasTexture(256, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f6f2ea' : awn; g.fillRect(i * w / 8, 0, w / 8, h); } }, 4, false), [awn]);
  return <group position={[x, CURB, z]} rotation-y={face}>
    <mesh position={[0, H / 2, 0]} castShadow receiveShadow><boxGeometry args={[12, H, 8]} /><meshStandardMaterial color={brick} roughness={.95} /></mesh>
    <mesh position={[0, H + .25, 0]} castShadow><boxGeometry args={[12.4, .5, 8.4]} /><meshStandardMaterial color="#d8d3c8" roughness={.8} /></mesh>
    <mesh position={[-2.3, 1.7, 4.02]}><planeGeometry args={[6.2, 2.5]} /><meshStandardMaterial color={night ? '#ffd48a' : '#8fb4d0'} emissive={night ? '#ffa845' : '#000'} emissiveIntensity={night ? 1 : 0} roughness={.15} metalness={.2} /></mesh>
    <mesh position={[3.9, 1.35, 4.02]}><boxGeometry args={[1.5, 2.6, .06]} /><meshStandardMaterial color="#2a2a30" roughness={.5} /></mesh>
    <mesh position={[-2.3, 3.45, 4.02]}><planeGeometry args={[6.4, 1]} /><meshStandardMaterial map={sign} roughness={.5} emissive={night ? '#f2c14e' : '#000'} emissiveMap={night ? sign : null} emissiveIntensity={night ? .5 : 0} /></mesh>
    <mesh position={[-2.3, 2.95, 4.55]} rotation-x={.45} castShadow><boxGeometry args={[6.6, .06, 1.35]} /><meshStandardMaterial map={stripes} roughness={.8} /></mesh>
  </group>;
}

/** Street trees and a few shrubs: low and round so they never hide a car. */
function Trees({ list }: { list: { x: number; z: number; s: number; seed: number }[] }) {
  return <>{list.map((t, i) => <group key={i} position={[t.x, CURB, t.z]}><Plant kind="tree" seed={t.seed} scale={t.s} /></group>)}</>;
}

/** Yaw that turns a building's front (+z) toward the road: the east-west one, or the north-south one. */
/** Low round shrubs along the inner edge of the sidewalk. */
function bushes(sx: number, sz: number, seed: number, low: boolean) {
  const r = mulberry(seed ^ 0x9e37), out: { x: number; z: number; s: number; seed: number }[] = [];
  for (let v = 10; v < 34; v += 2.8 + r() * 2.2) { if (r() < .35) continue; out.push({ x: sx * 6.6, z: sz * v, s: (low ? .5 : .75) + r() * .25, seed: Math.floor(r() * 60) + 1 }); }
  for (let u = 10; u < 34; u += 2.8 + r() * 2.2) { if (r() < .35) continue; out.push({ x: sx * u, z: sz * 6.6, s: (low ? .5 : .75) + r() * .25, seed: Math.floor(r() * 60) + 1 }); }
  return out;
}
const faceRoad = (x: number, z: number, ew: boolean) => (ew ? (z > 0 ? Math.PI : 0) : (x > 0 ? -Math.PI / 2 : Math.PI / 2));

/** Everything around the street: signs, lamps, hydrants, and the corner lots in the chosen style. */
export function Props({ layout, style, time, seed, camDir }: { layout: Layout; style: Style; time: TimeOfDay; seed: number; camDir: [number, number] }) {
  const night = time === 'night';
  const quads = useMemo(() => {
    const out: { sx: number; sz: number; near: boolean }[] = [];
    for (const sx of [1, -1]) for (const sz of [1, -1]) out.push({ sx, sz, near: sx * camDir[0] + sz * camDir[1] > .1 });
    return out;
  }, [camDir]);
  const lots = useMemo(() => {
    const r = mulberry(seed * 31 + 9);
    return quads.map(q => {
      const trees: { x: number; z: number; s: number; seed: number }[] = [];
      // a row of street trees along each road, between the sidewalk and the lots
      for (let k = 0; k < 3; k++) {
        const t = 12 + k * 10 + r() * 3;
        trees.push({ x: q.sx * 8.2, z: q.sz * t, s: q.near ? 1 : 1.35, seed: 3 + k + Math.floor(r() * 40) });
        trees.push({ x: q.sx * t, z: q.sz * 8.2, s: q.near ? 1 : 1.35, seed: 8 + k + Math.floor(r() * 40) });
      }
      const kind = style === 'park' ? 'park' : style === 'town' ? 'town' : 'house';
      return { q, trees, kind, lotSeed: Math.floor(r() * 1e6) };
    });
  }, [quads, style, seed]);
  return <group>
    {layout.stops.map(d => <Sign key={d} from={d} allWay={layout.kind === 'all'} />)}
    {lots.map(({ q, trees, kind, lotSeed }, i) => {
      const lx = q.sx, lz = q.sz, low = q.near;
      const ew = (lotSeed & 1) === 0, cornerLamp = <Lamp x={lx * 5.2} z={lz * 5.2} face={Math.atan2(lz, -lx)} night={night} />;
      return <group key={i}>
        {cornerLamp}
        <Hydrant x={lx * 5.0} z={lz * 15} />
        {kind === 'house' && <>
          <House x={lx * (ew ? 22 : 15)} z={lz * (ew ? 15 : 22)} face={faceRoad(lx, lz, ew)} seed={lotSeed} night={night} low={low} />
          <Mailbox x={lx * 5.4} z={lz * 22} face={Math.PI / 2 * (lx > 0 ? -1 : 1)} />
        </>}
        {kind === 'town' && <>
          <Shop x={lx * 17} z={lz * 12.5} face={Math.PI * (lz > 0 ? 0 : 1)} seed={lotSeed} night={night} low={low} />
          <Shop x={lx * 12.5} z={lz * 29} face={Math.PI * (lz > 0 ? 0 : 1)} seed={lotSeed + 5} night={night} low={low} />
          <Bench x={lx * 5} z={lz * 11} face={lx > 0 ? -Math.PI / 2 : Math.PI / 2} />
        </>}
        {kind === 'park' && <>
          <Bench x={lx * 7.2} z={lz * 12} face={lx > 0 ? -Math.PI / 2 : Math.PI / 2} />
          <Bench x={lx * 12} z={lz * 7.2} face={lz > 0 ? Math.PI : 0} />
          {[[16, 16], [22, 13], [13, 24], [26, 26]].map(([u, v], k) => <group key={k} position={[lx * u!, CURB, lz * v!]}><Plant kind={k % 2 ? 'ball' : 'tree'} seed={lotSeed % 90 + k} scale={q.near ? 1 : 1.5} /></group>)}
        </>}
        <Trees list={trees} />
        {bushes(lx, lz, lotSeed, low).map((b, k) => <group key={k} position={[b.x, CURB, b.z]}><Plant kind="ball" seed={b.seed} scale={b.s} /></group>)}
      </group>;
    })}
  </group>;
}
