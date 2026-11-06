import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { NightCtx } from '../../components/nuhome2/world/theme';
import { detectTier, qualityFor } from '../../components/nuhome2/world/quality';
import { Ground } from './Ground';
import { Props } from './Props';
import { Cars, type Overlay } from './Cars';
import { LEG, type Dir, type Scenario } from './engine';
import { SKY, mulberry, type Style, type TimeOfDay } from './look';
import type { Sim } from './sim';

export type Look = { time: TimeOfDay; style: Style };

/** The sky: a dome with a gradient, and stars at night. It travels with the camera. */
function SkyDome({ time }: { time: TimeOfDay }) {
  const ref = useRef<THREE.Group>(null);
  const sky = SKY[time];
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(520, 32, 20), p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3);
    const top = new THREE.Color(sky.top), mid = new THREE.Color(sky.mid), low = new THREE.Color(sky.low), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 520; if (y > 0) c.copy(low).lerp(mid, Math.min(1, y * 4)).lerp(top, Math.pow(Math.max(0, y), .7)); else c.copy(low); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  }, [sky]);
  const stars = useMemo(() => {
    if (time !== 'night') return null;
    const r = mulberry(7), n = 700, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = Math.acos(.15 + r() * .85); a[i * 3] = 480 * Math.sin(ph) * Math.cos(th); a[i * 3 + 1] = 480 * Math.cos(ph); a[i * 3 + 2] = 480 * Math.sin(ph) * Math.sin(th); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); return g;
  }, [time]);
  const cam = useThree(s => s.camera);
  useFrame(() => { ref.current?.position.copy(cam.position); });
  return <group ref={ref}>
    <mesh geometry={geo}><meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} /></mesh>
    {stars && <points geometry={stars}><pointsMaterial color="#ffffff" size={1.8} sizeAttenuation={false} fog={false} transparent opacity={.85} depthWrite={false} /></points>}
  </group>;
}

function Lights({ time, shadow }: { time: TimeOfDay; shadow: number }) {
  const sky = SKY[time], { scene, gl } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog(sky.fog, sky.near, sky.far); scene.environmentIntensity = sky.env; gl.toneMappingExposure = sky.exposure;
    return () => { scene.fog = null; };
  }, [scene, gl, sky]);
  return <>
    <ambientLight color={sky.amb.color} intensity={sky.amb.i} />
    <hemisphereLight args={[sky.hemi.sky, sky.hemi.ground, sky.hemi.i]} />
    <directionalLight position={sky.sun.pos} color={sky.sun.color} intensity={sky.sun.i} castShadow={shadow > 0}
      shadow-mapSize-width={shadow || 16} shadow-mapSize-height={shadow || 16} shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-near={1} shadow-camera-far={90} shadow-bias={-.0004} shadow-normalBias={.04} />
    {time === 'night' && <directionalLight position={[10, 9, -8]} color="#b8c8ff" intensity={.45} />}
  </>;
}

/** The camera: behind the YOU car (so left and right match the driver's), high enough to see every car, with a slow drift and a swoop in at the start of each street. */
function Rig({ camDir, born }: { camDir: [number, number]; born: number }) {
  const { camera, size } = useThree();
  const t0 = useRef(performance.now());
  useEffect(() => { t0.current = performance.now(); }, [born]);
  useFrame(() => {
    const age = (performance.now() - t0.current) / 1000, e = Math.min(1, age / 2.4), ease = 1 - Math.pow(1 - e, 3);
    const aspect = size.width / size.height, portrait = aspect < .9;
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = portrait ? 46 : 34;
    // distance that fits about 12 m either side of the middle
    const half = portrait ? 14.5 : 23, tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * Math.min(aspect, 1.9);
    const D = Math.max(portrait ? 38 : 36, half / tanH) * (1 + .5 * (1 - ease));
    const el = THREE.MathUtils.degToRad(50 + 16 * (1 - ease) + Math.sin(age * .23) * 1.6);
    const az = Math.atan2(camDir[0], camDir[1]) + Math.sin(age * .17) * .09 + (1 - ease) * .55;
    const hx = Math.sin(az), hz = Math.cos(az), hd = D * Math.cos(el);
    cam.position.set(hx * hd, D * Math.sin(el), hz * hd);
    cam.lookAt(0, 0, 0);
    // on a phone the question card covers the bottom: shift the picture up
    const off = (portrait ? .13 : .1) * size.height;
    cam.setViewOffset(size.width, size.height, 0, off, size.width, size.height);
    cam.near = 1; cam.far = 700; cam.updateProjectionMatrix();
  });
  return null;
}

/** Steps the simulation, once per frame, whatever else happens. */
function Stepper({ sim, paused }: { sim: Sim; paused: MutableRefObject<boolean> }) {
  useFrame((_, dt) => { if (!paused.current) sim.step(dt); });
  return null;
}

export default function Scene({ sc, look, sim, ov, tick, paused, camDir, born, onReady }: {
  sc: Scenario; look: Look; sim: Sim; ov: MutableRefObject<Overlay>; tick: number; paused: MutableRefObject<boolean>; camDir: [number, number]; born: number; onReady: () => void;
}) {
  const tier = useMemo(detectTier, []), q = qualityFor(tier), night = look.time === 'night';
  const mix = useRef(night ? 1 : 0); mix.current = night ? 1 : 0;
  const cap = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.75 : 2) : 1;
  const ready = useRef(false);
  return <Canvas className="sg-canvas" shadows={q.shadow > 0} dpr={[1, cap]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 30, 30], fov: 34, near: 1, far: 700 }}
    onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = SKY[look.time].exposure; }}
    fallback={<div />}>
    <NightCtx.Provider value={mix}>
      <PerformanceMonitor ms={350} iterations={6} flipflops={2} />
      <Lights time={look.time} shadow={q.shadow} />
      <Environment resolution={q.lite ? 64 : 128}>
        <Lightformer intensity={2.2} position={[0, 8, 4]} scale={[24, 10, 1]} />
        <Lightformer intensity={1.6} color={night ? '#9db4ff' : '#fff0d8'} position={[-12, 3, 6]} scale={[18, 7, 1]} />
        <Lightformer intensity={1.2} color="#ffe2a0" position={[12, 3, 8]} scale={[16, 6, 1]} />
      </Environment>
      <SkyDome time={look.time} />
      <Suspense fallback={null}>
        <Ground layout={sc.layout} style={look.style} time={look.time} seed={sc.seed} lite={q.lite} />
        <Props layout={sc.layout} style={look.style} time={look.time} seed={sc.seed} camDir={camDir} />
        <Cars sim={sim} lite={q.lite} night={night} ov={ov} tick={tick} />
        <ReadyPing onReady={() => { if (!ready.current) { ready.current = true; onReady(); } }} />
      </Suspense>
      <Rig camDir={camDir} born={born} />
      <Stepper sim={sim} paused={paused} />
    </NightCtx.Provider>
  </Canvas>;
}

/** Fires after the street and the cars have drawn a few frames. */
function ReadyPing({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => { if (n.current < 6 && ++n.current === 6) onReady(); });
  return null;
}

export const camDirFor = (sc: Scenario): [number, number] => {
  const you = sc.cars.find(c => c.you);
  const d: Dir = you ? you.from : sc.layout.legs[Math.floor(mulberry(sc.seed)() * sc.layout.legs.length)]!;
  return [LEG[d][0], LEG[d][1]];
};
