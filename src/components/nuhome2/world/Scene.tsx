import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { Estate } from './Estate';
import { Butterflies } from './Butterflies';
import { Clouds, Moon, ShootingStars, SkyDome, Stars, Sun, skyAnchor } from './Sky';
import { NightCtx } from './theme';
import { Weather } from './Weather';
import { atmo } from './atmosphere';
import { Rig } from './Rig';
import { detectTier, qualityFor, type Quality } from './quality';
import { carMoving, introAt } from './intro';
import { parkMoving } from './park';

export type Theme = 'day' | 'night';
export type SceneProps = {
  stage: number; theme: Theme; open: boolean; reducedMotion: boolean; skipIntro: boolean;
  onReady: () => void; onIntroDone: () => void; onLost: () => void;
};

/** Animates every light, the fog and the exposure between day and night. */
function ThemeDriver({ night, mix, shadow }: { night: boolean; mix: { current: number }; shadow: number }) {
  const { scene } = useThree();
  const amb = useRef<THREE.AmbientLight>(null), hemi = useRef<THREE.HemisphereLight>(null), dir = useRef<THREE.DirectionalLight>(null), fill = useRef<THREE.DirectionalLight>(null);
  const c = useMemo(() => ({
    fogD: new THREE.Color('#f3e4c6'), fogN: new THREE.Color('#0d1440'),
    ambD: new THREE.Color('#fff6ea'), ambN: new THREE.Color('#5a68b0'),
    hsD: new THREE.Color('#cfe6ff'), hsN: new THREE.Color('#4a5bb0'), hgD: new THREE.Color('#d2c2a8'), hgN: new THREE.Color('#1c1a38'),
    dirD: new THREE.Color('#ffe6bf'), dirN: new THREE.Color('#9db8ff'),
  }), []);
  useEffect(() => { scene.fog = new THREE.Fog('#f3e4c6', 70, 235); }, [scene]);
  const gl = useThree(s => s.gl), grey = useMemo(() => ({ d: new THREE.Color('#b4bcc6'), n: new THREE.Color('#0d1226'), deep: new THREE.Color('#03040d') }), []), tmp = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    const target = night ? 1 : 0;
    mix.current += (target - mix.current) * (1 - Math.exp(-2.2 * Math.min(dt, .05)));
    if (Math.abs(target - mix.current) < .0005) mix.current = target;
    const m = mix.current, L = atmo.look, deep = atmo.deep * m;                  // deep: the extra darkness after 9 pm (night theme only)
    const cl = L.cloud, dim = 1 - .55 * cl * (1 - m) - .12 * L.storm, flash = atmo.flash * L.storm;
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.copy(c.fogD).lerp(c.fogN, m).lerp(tmp.copy(grey.d).lerp(grey.n, m), Math.min(1, .55 * cl + .4 * L.fog)).lerp(grey.deep, deep * .75);
      fog.near = 70 - 66 * L.fog - 30 * L.rain - 22 * L.snow; fog.far = 235 - 190 * L.fog - 95 * L.rain - 80 * L.snow;
      if (flash > .01) fog.color.lerp(tmp.set('#dfe6ff'), flash * .5);
    }
    scene.environmentIntensity = (.85 + .15 * m) * (1 - .6 * deep) * (1 - .34 * Math.max(0, cl - .06)) * (1 - .12 * L.storm) + flash * .5;   // the sky's own light (it lights the lawn and the road most): dimmer under cloud and in the deep night
    gl.toneMappingExposure = (.9 - .1 * deep) * (1 - .1 * L.storm);
    if (amb.current) { amb.current.color.copy(c.ambD).lerp(c.ambN, m); amb.current.intensity = (.2 - .02 * m) * (1 - .35 * deep) * (1 - .12 * cl * (1 - m)) + flash * 1.6; }
    if (hemi.current) { hemi.current.color.copy(c.hsD).lerp(c.hsN, m); hemi.current.groundColor.copy(c.hgD).lerp(c.hgN, m); hemi.current.intensity = (.62 - .3 * m) * (1 - .42 * deep) * (.9 + .1 * (1 - cl)) * (1 - .1 * L.storm) + flash * .8; }
    if (dir.current) { dir.current.color.copy(c.dirD).lerp(c.dirN, m); dir.current.intensity = (3.4 - 2.8 * m) * dim * (1 - .6 * deep) * (1 - .5 * L.rain * (1 - m)) + flash * 1.4; }
    if (fill.current) fill.current.intensity = .5 * m * (1 - .55 * deep);
  });
  return <>
    <ambientLight ref={amb} />
    <hemisphereLight ref={hemi} />
    <directionalLight ref={dir} position={[-9, 12, 10]} castShadow={shadow > 0} shadow-mapSize-width={shadow || 16} shadow-mapSize-height={shadow || 16} shadow-camera-left={-34} shadow-camera-right={34} shadow-camera-top={30} shadow-camera-bottom={-30} shadow-camera-near={1} shadow-camera-far={110} shadow-bias={-.0002} shadow-normalBias={.025} />
    <directionalLight ref={fill} position={[10, 9, -8]} color="#b8c8ff" />
  </>;
}

/**
 * What the world reflects: a whole sky over a whole ground, not a few lamps in a black room. Car paint, glass and gilding pick up
 * blue from above, a pale horizon and the grey of the lot from below, and every shaded face is filled by sky light.
 */
function EnvSky({ night }: { night: boolean }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, gnd: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top, hor, gnd; void main(){ float y = normalize(vP).y; vec3 c = y > 0.0 ? mix(hor, top, smoothstep(0.0, .6, y)) : mix(hor * .6, gnd, smoothstep(0.0, -.12, y)); gl_FragColor = vec4(c, 1.0); }',
  }), []);
  mat.uniforms.top!.value.set(night ? '#070b24' : '#2e6fd0'); mat.uniforms.hor!.value.set(night ? '#1c2452' : '#cfe0ee'); mat.uniforms.gnd!.value.set(night ? '#0b0c12' : '#5b5a58');
  return <mesh material={mat} scale={60}><sphereGeometry args={[1, 24, 16]} /></mesh>;
}

/** The sky travels with the camera, so it holds from the far end of the avenue to the back lawn. */
function SkyFollow({ children }: { children: React.ReactNode }) {
  return <group ref={n => { skyAnchor.current = n; }}>{children}</group>;
}

function World({ quality, shadow, ...p }: Omit<SceneProps, 'onReady' | 'onLost'> & { quality: Quality; shadow: number; onTier: () => void; onUp: () => void }) {
  const { onTier, theme } = p as typeof p & { onTier: () => void };
  const night = theme === 'night';
  const mix = useRef(night ? 1 : 0);
  const lite = quality.lite;
  return <NightCtx.Provider value={mix}>
    <PerformanceMonitor ms={350} iterations={8} flipflops={3} onDecline={onTier} onIncline={p.onUp} />
    <ThemeDriver night={night} mix={mix} shadow={shadow} />
    <Environment resolution={lite ? 128 : 256}>
      <EnvSky night={night} />
      <Lightformer intensity={2.2} position={[0, 8, 4]} scale={[24, 10, 1]} />
      <Lightformer intensity={1.8} color={night ? '#9db4ff' : '#fff0d8'} position={[-12, 3, 6]} scale={[18, 7, 1]} />
      <Lightformer intensity={1.3} color="#ffe2a0" position={[12, 3, 8]} scale={[16, 6, 1]} />
      <Lightformer intensity={1.9} color="#fff0d0" position={[0, 4, 22]} rotation-y={Math.PI} scale={[44, 9, 1]} />
    </Environment>
    <SkyFollow><SkyDome lite={lite} /><Stars count={lite ? 2600 : 6000} /><ShootingStars />
    <Sun position={[40, 36, -74]} /><Moon position={[30, 32, -66]} />
    <Clouds count={lite ? 12 : 22} /></SkyFollow>
    <Suspense fallback={null}><Estate quality={quality} open={p.open} /></Suspense>
    <Butterflies count={lite ? 5 : 9} />
    <Weather lite={lite} />
    <Rig stage={p.stage} reducedMotion={p.reducedMotion} skipIntro={p.skipIntro} onIntroDone={p.onIntroDone} />
    <OrbitControls makeDefault enablePan enableZoom zoomSpeed={.7} panSpeed={.6} rotateSpeed={.55} minDistance={1} maxDistance={120} minPolarAngle={.1} maxPolarAngle={1.9} enableDamping dampingFactor={.07} target={[0, 5, -17.5]} />
  </NightCtx.Provider>;
}

function Ready({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => { if (n.current < 4 && ++n.current === 4) onReady(); });
  return null;
}

/** Applies a held pixel ratio change as soon as the car is not rolling. */
function SettleDpr({ pend, apply }: { pend: { current: number }; apply: (d: number) => void }) {
  useFrame(() => { if (pend.current && !carMoving() && !parkMoving()) { const d = pend.current; pend.current = 0; apply(d); } });
  return null;
}

/** ?dpr=1 pins the pixel ratio, for screenshots on machines without a GPU. Visitors never see it. */
function dprOverride(): number | null { if (typeof window === 'undefined') return null; const v = Number(new URLSearchParams(window.location.search).get('dpr')); return v >= .5 && v <= 3 ? v : null; }

export default function Scene({ onReady, onLost, ...rest }: SceneProps) {
  const [tier] = useState(detectTier);
  const first = useRef(tier);
  const quality = qualityFor(tier);       // fixed for the whole visit: swapping geometry mid-animation is what made frames hitch
  const fixed = qualityFor(first.current);
  // the pixel ratio is the only thing that adapts: a notch down when frames drop, a notch back up when they recover (never during the first seconds)
  const cap = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, typeof window !== 'undefined' && window.innerWidth < 900 ? 1.5 : quality.dpr[1]);
  const [level, setLevel] = useState(0);
  const dprNow = Math.max(1, +(cap * (1 - .17 * level)).toFixed(2));
  const born = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  // a pixel ratio change resizes the canvas, which costs a frame: it waits until the car is not rolling, so the drive never hitches
  const pend = useRef(0);
  const apply = (d: number) => setLevel(l => Math.max(0, Math.min(3, l + d)));
  const down = () => { if (carMoving() || parkMoving()) pend.current = 1; else apply(1); };
  const up = () => { if (performance.now() - born.current <= 8000) return; if (carMoving() || parkMoving()) pend.current = -1; else apply(-1); };
  const narrow = typeof window !== 'undefined' && (window.innerWidth < 700 || window.innerWidth / window.innerHeight < .8);
  const k0 = introAt(0, narrow);
  const lost = useRef(onLost);
  useEffect(() => { lost.current = onLost; }, [onLost]);
  return <Canvas
    className="n2-canvas"
    shadows={fixed.shadow > 0 ? (fixed.tier === 'high' ? 'soft' : true) : false}
    dpr={dprOverride() ?? dprNow}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    camera={{ position: k0.p, fov: k0.fov, near: .5, far: 320 }}
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = .9;
      gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost.current(); }, { once: true });
    }}
    fallback={<div />}
  >
    <World {...rest} quality={quality} shadow={fixed.shadow} onTier={down} onUp={up} />
    <Ready onReady={onReady} />
    <SettleDpr pend={pend} apply={apply} />
  </Canvas>;
}
