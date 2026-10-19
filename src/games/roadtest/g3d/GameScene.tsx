import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PerformanceMonitor, useGLTF, useProgress } from '@react-three/drei';
import { detectTier, qualityFor, type Quality } from '../../../components/nuhome2/world/quality';
import { fleetFiles } from '../../../components/nuhome2/world/Fleet';
import { touchControls } from '../game/controls';
import type { Difficulty } from '../game/types';
import { sound } from '../sound';
import { TIER_NAMES } from '../game/scoring';
import { MPH_TO_MPS, RunSim, type Controls, type Sfx, type SimEvent } from './sim';
import { themeFor } from './themes';
import { FRONTS, FRONT_BANNER, loadConditions, resolveConditions, type Resolved } from './conditions';
import { apply as applyAtmo, atmo } from './atmo';
import { World } from './World';
import { Actors, Player } from './Actors';
import { SkidMarks, Sparks, SpeedLines, fx } from './Fx';
import { newHud, type HudState } from './hudBus';
import type { GarageId } from './garage';
import { SPEC_IDS } from './cars';
import { clamp, damp, lerp, smooth } from './util';

export const INTRO_SECONDS = 2.3;

// ------------------------------------------------------------ input ---
const keys: Record<string, boolean> = {};
let keysBound = 0;
const keyDown = (e: KeyboardEvent) => { if (e.repeat) return; keys[e.code] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); };
const keyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
const blur = () => { for (const k of Object.keys(keys)) keys[k] = false; };
function bindKeys() {
  if (keysBound++ === 0) { window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur); }
  return () => { if (--keysBound === 0) { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); blur(); } };
}
export const readControls = (): Controls => ({
  gas: !!(keys.ArrowUp || keys.KeyW) || touchControls.gas,
  brake: !!(keys.ArrowDown || keys.KeyS || keys.Space) || touchControls.brake,
  left: !!(keys.ArrowLeft || keys.KeyA) || touchControls.left,
  right: !!(keys.ArrowRight || keys.KeyD) || touchControls.right,
});

export interface SceneHandle { sim: RunSim; hud: HudState; paused: { current: boolean }; introT: number; skip: { current: boolean }; cond: Resolved }

const shakeState = { amp: 0, t: 0, dur: 0.01, punch: 0 };

/** Runs the rules engine each frame, turns its events into effects, sound and HUD messages, and feeds the HUD. */
function Driver({ handle, onComplete, onReady }: { handle: SceneHandle; onComplete: (r: import('../game/types').LevelResult) => void; onReady: () => void }) {
  const { sim, hud } = handle;
  const { camera, size } = useThree();
  const intro = useRef(0);
  const frames = useRef(0);
  const prog = useProgress();
  const ready = useRef(false);
  const waited = useRef(0);
  const front = useRef(0);
  const frontStart = useRef(handle.cond.weather === 'cloudy' ? 1 : 0);
  const introDone = () => intro.current >= INTRO_SECONDS;
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => bindKeys(), []);
  const project = (x: number, y: number, d: number) => {
    v.set(x, y, -(d - sim.traveled)).project(camera);
    return { sx: (v.x * 0.5 + 0.5) * size.width, sy: (-v.y * 0.5 + 0.5) * size.height };
  };
  const dispatch = (e: SimEvent) => {
    const now = performance.now();
    switch (e.k) {
      case 'float': { if (e.text.includes('CLOSE')) { shakeState.punch = Math.max(shakeState.punch, 0.6); fx.emit({ x: e.x, y: 0.9, d: e.d, n: 10, color: [0xffffff, 0xf2c14e], speed: 4, up: 1.2, life: 0.5, size: 0.22, gravity: 1 }); } const p = project(e.x, 1.9, e.d); hud.floats.push({ text: e.text, good: e.good, sx: p.sx, sy: p.sy, born: now }); if (hud.floats.length > 8) hud.floats.shift(); break; }
      case 'burst': fx.emit({ x: e.x, y: 1.1, d: e.d, n: e.n * 3, color: [e.color, 0xfff3c4, 0xffffff], speed: 5.5, up: e.up ? 5 : 2.5, life: 0.9, size: 0.4, gravity: 7, ring: false }); break;
      case 'crash':
        fx.emit({ x: e.x, y: 0.7, d: e.d, n: e.big ? 60 : 26, color: [0xffb347, 0xffffff, 0xff6a13, 0xf2c14e], speed: 7, up: 4, life: 0.8, size: 0.34, gravity: 12 });
        if (e.big) fx.emit({ x: e.x, y: 0.8, d: e.d, n: 14, color: 0x8a8a92, speed: 3, up: 2, life: 1.3, size: 1.6, gravity: -1, drag: 1.6, shape: 'smoke', alpha: 0.7 });
        shakeState.punch = Math.max(shakeState.punch, e.big ? 1 : 0.4); break;
      case 'shake': shakeState.amp = Math.max(shakeState.amp, e.amp); shakeState.t = shakeState.dur = e.dur; break;
      case 'flash': hud.flashes.push({ color: e.color, dur: e.dur, born: now }); break;
      case 'banner': hud.banners.push({ title: e.title, sub: e.sub, ms: e.ms, tone: e.tone ?? 'gold', born: now }); break;
      case 'finish':
        fx.emit({ x: sim.x, y: 5, d: sim.traveled + 6, n: 130, color: [0xf2c14e, 0xffffff, 0xff4d4d, 0x29e069, 0x4da6ff], speed: 6, up: 5, life: 2.4, size: 0.5, gravity: 4, shape: 'confetti', drag: 0.8 });
        hud.finished = true; break;
      case 'catastrophe': hud.catastrophe = true; fx.emit({ x: sim.x, y: 1, d: sim.traveled + 2, n: 60, color: [0xff2a1a, 0xff8a6e], speed: 6, up: 4, life: 1.1, size: 0.5 }); break;
      case 'speedWarn': hud.speedWarn = now; break;
      case 'delta': hud.deltas.push({ kind: e.kind, chip: e.chip, sub: e.sub, born: now }); if (hud.deltas.length > 6) hud.deltas.shift(); if (e.tierUp) hud.toasts.push({ text: e.sub ?? 'STREAK UP', born: now }); break;
      case 'milestone': hud.toasts.push({ text: e.text, born: now }); break;
      case 'pickup': shakeState.punch = Math.max(shakeState.punch, 0.18); break;
      case 'complete': hud.complete = e.result; onComplete(e.result); break;
    }
  };
  useFrame((_, rawDt) => {
    frames.current++;
    const dt = Math.min(rawDt, 0.05);
    waited.current += dt;
    // the countdown waits until the cars and the first stretch of road have come in (never longer than 9 seconds)
    if (!ready.current) {
      if (frames.current > 8 && ((!prog.active && waited.current > 1.0) || waited.current > 9)) { ready.current = true; onReady(); }
      else return;
    }
    if (!handle.paused.current) {
      if (intro.current < INTRO_SECONDS) {
        intro.current += dt;
        if (handle.skip.current && intro.current > 0.7) intro.current = INTRO_SECONDS;
        handle.introT = Math.min(1, intro.current / INTRO_SECONDS);
        const left = INTRO_SECONDS - intro.current;
        hud.countdown = left > 1.55 ? 3 : left > 0.95 ? 2 : left > 0.4 ? 1 : left > 0 ? 0 : -1;
        sim.step(0, { gas: false, brake: false, left: false, right: false });
      } else {
        hud.countdown = -1; handle.introT = 1;
        sim.step(dt, readControls());
      }
      for (const e of sim.drain()) dispatch(e);
    }
    // rolling weather: a new front every stretch of the drive (every 450 m in endless)
    if (handle.cond.rolling && !sim.finished && introDone()) {
      const step = sim.level.endless ? Math.floor(sim.traveled / 450) : Math.floor(sim.progress * 4);
      if (step > front.current) {
        front.current = step;
        const kind = FRONTS[(frontStart.current + step) % FRONTS.length]!;
        atmo.preview = { weather: kind, night: 'normal' }; applyAtmo();
        const b = FRONT_BANNER[kind]; hud.banners.push({ title: b[0], sub: b[1], ms: 2000, tone: 'white', born: performance.now() });
      }
    }
    // HUD snapshot
    hud.score = sim.tracker.score;
    const diff = hud.score - hud.display;
    if (diff !== 0) { const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 6))); hud.display = Math.abs(step) >= Math.abs(diff) ? hud.score : hud.display + step; }
    hud.mph = sim.mph; hud.over = sim.overLimit; hud.combo = sim.tracker.combo; hud.maxCombo = sim.tracker.maxCombo; hud.stars = sim.tracker.starsCollected;
    hud.progress = sim.progress; hud.strikes = sim.strikes; hud.magnet = Math.max(0, sim.magnetUntil - sim.time); hud.shield = sim.hasShield;
    hud.distance = sim.travelPx; hud.nearMisses = sim.nearMisses; hud.tierProg = sim.tracker.tierProgress; hud.tierName = TIER_NAMES[sim.tracker.combo - 1] ?? '';
    // keep the effects tied to the car
    if (!sim.finished && frames.current % 2 === 0) {
      if (sim.tracker.combo >= 4 && sim.mph > 8) fx.emit({ x: sim.x + (Math.random() - 0.5) * 0.5, y: 0.55, d: sim.traveled - 2.2, n: 1, color: [0xffb300, 0xf2c14e, 0xff6a13], speed: 0.7, up: 1.3, fwd: -2, life: 0.45, size: 0.55, gravity: -2, drag: 2 });
      if (sim.magnetOn) fx.emit({ x: sim.x + (Math.random() - 0.5) * 3, y: 0.7 + Math.random() * 1.2, d: sim.traveled + (Math.random() - 0.5) * 4, n: 1, color: 0xf2c14e, speed: 0.4, up: 0.8, life: 0.6, size: 0.3, gravity: -1 });
      if (sim.braking && sim.prevMph > 24) for (const sx of [-0.8, 0.8]) fx.emit({ x: sim.x + sx, y: 0.1, d: sim.traveled - 1.4, n: 1, color: 0xdddddd, speed: 0.6, up: 0.6, life: 0.7, size: 1.1, gravity: -0.5, drag: 1.5, shape: 'smoke', alpha: 0.55 });
    }
  }, -5);
  return null;
}

/** Chase camera: behind and above on a wide screen, higher and further back on a phone held upright so all three lanes stay in view. Opens with a sweep around the car; ends with a slow orbit. */
function CameraRig({ handle }: { handle: SceneHandle }) {
  const { sim } = handle;
  const cam = useRef({ x: 0, t: 0, fov: 56, fin: 0 });
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3() }), []);
  useFrame(({ camera, size, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const c = cam.current, pc = camera as THREE.PerspectiveCamera;
    const asp = size.width / size.height;
    const k = clamp((1.15 - asp) / 0.65, 0, 1);
    const back = lerp(8.4, 13.4, k), up = lerp(3.1, 8.6, k), fovB = lerp(54, 66, k), lookZ = lerp(-16, -10, k), lookY = lerp(1.05, 0.5, k);
    const sp = clamp(sim.mph / sim.maxMph, 0, 1);
    c.x = damp(c.x, sim.x, 7, dt);
    c.t = damp(c.t, handle.introT >= 1 ? 1 : clamp(handle.introT * 1.12, 0, 1), 9, dt);
    const e = smooth(0, 1, c.t);
    let px = c.x * 0.6, py = up, pz = back, lx = c.x * 0.4, ly = lookY, lz = lookZ;
    // 1) opening: start in front of the car, low, and swing round behind it
    if (e < 0.999) {
      const a = lerp(2.5, 0, e), R = lerp(6.4, back, e), h = lerp(1.25, up, e);
      px = sim.x + Math.sin(a) * R * 0.9; pz = Math.cos(a) * R; py = h;
      lx = lerp(sim.x, c.x * 0.4, e); ly = lerp(0.85, lookY, e); lz = lerp(0, lookZ, e);
    }
    // 2) the end: a slow orbit round the car
    if (sim.finished) {
      c.fin = Math.min(1.5, c.fin + dt);
      const a = c.fin * 0.9, R = lerp(back, 7.5, smooth(0, 1.2, c.fin));
      if (handle.hud.catastrophe) { px = sim.x + 2.2; pz = 4.2; py = 1.9; lx = sim.x; ly = 0.7; lz = -2; }
      else { px = sim.x + Math.sin(a) * R; pz = Math.cos(a) * R * 0.85; py = lerp(up, 2.6, smooth(0, 1.2, c.fin)); lx = sim.x; ly = 1.0; lz = -2 - 8 * (1 - smooth(0, 1.2, c.fin)); }
    }
    tmp.p.set(px, py, pz); tmp.l.set(lx, ly, lz);
    // shake and the little kick of a collision or a pickup
    if (shakeState.t > 0) { shakeState.t -= dt; const f = Math.max(0, shakeState.t / shakeState.dur) * shakeState.amp; tmp.p.x += (Math.random() - 0.5) * 0.28 * f; tmp.p.y += (Math.random() - 0.5) * 0.22 * f; tmp.l.x += (Math.random() - 0.5) * 0.3 * f; if (shakeState.t <= 0) shakeState.amp = 0; }
    shakeState.punch = damp(shakeState.punch, 0, 7, dt);
    // the road hum at speed
    const rumble = sp * 0.012 * (sim.mph > 5 ? 1 : 0);
    tmp.p.y += Math.sin(clock.elapsedTime * 41) * rumble; tmp.p.x += Math.sin(clock.elapsedTime * 33) * rumble * 0.6;
    camera.position.copy(tmp.p); camera.lookAt(tmp.l);
    camera.rotateZ(-sim.steerV * 0.0045 * e);
    const tf = fovB + sp * 11 + shakeState.punch * 6 + (handle.hud.catastrophe ? -10 : 0);
    c.fov = damp(c.fov, tf, 5, dt);
    if (Math.abs(pc.fov - c.fov) > 0.01) { pc.fov = c.fov; pc.updateProjectionMatrix(); }
    pc.near = 0.3;
  });
  return null;
}

/** Picks a pixel ratio that suits the screen and steps it down if the frame rate drops. */
function Dpr({ cap, onDecline, onIncline }: { cap: number; onDecline: () => void; onIncline: () => void }) {
  void cap;
  return <PerformanceMonitor ms={350} iterations={8} flipflops={3} onDecline={onDecline} onIncline={onIncline} />;
}

export function useGameScene(levelId: string, difficulty: Difficulty): SceneHandle {
  return useMemo(() => {
    const sim = new RunSim(levelId, difficulty, sound as unknown as Sfx);
    const hud = newHud();
    hud.levelName = sim.level.name; hud.levelSub = sim.level.subtitle; hud.difficulty = sim.difficulty.label; hud.mult = sim.difficulty.scoreMul;
    hud.limit = sim.level.speedLimit; hud.endless = !!sim.level.endless; hud.best = sim.pbBestDistance;
    return { sim, hud, paused: { current: false }, introT: 0, skip: { current: false }, cond: resolveConditions(loadConditions()) } as SceneHandle;
  }, [levelId, difficulty]);
}

export interface GameSceneProps { handle: SceneHandle; carId: GarageId; onComplete: (r: import('../game/types').LevelResult) => void; onReady: () => void; onLost: () => void }

export function GameScene({ handle, carId, onComplete, onReady, onLost }: GameSceneProps) {
  const { sim } = handle;
  const theme = useMemo(() => themeFor(sim.level.id, handle.cond), [sim, handle]);
  const tierName = useMemo(() => detectTier(), []);
  const quality: Quality = qualityFor(tierName);
  const playerRig = useRef<THREE.Group | null>(null);
  const cap = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.75 : quality.dpr[1]) : 1;
  const level = useRef(0);
  const dprQ = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('dpr');
  const [dprState, setDpr] = useDprState(cap, dprQ ? Number(dprQ) : null);
  void level;
  const lost = useRef(onLost);
  useEffect(() => { lost.current = onLost; }, [onLost]);
  // get the player's car and the first traffic cars downloading at once
  useEffect(() => {
    const f = fleetFiles(carId); if (f) useGLTF.preload(quality.lite ? f.lite : f.full);
    for (const s of SPEC_IDS) { const g = fleetFiles(s); if (g) useGLTF.preload(g.lite); }
  }, [carId, quality.lite]);
  return <Canvas
    className="rt3d-canvas"
    shadows={quality.shadow > 0 && tierName === 'high'}
    dpr={dprState}
    gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    camera={{ position: [0, 3.1, 8.4], fov: 56, near: 0.3, far: 340 }}
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.9;
      gl.setClearColor('#f3e4c6');
      gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost.current(); }, { once: true });
    }}
  >
    <Dpr cap={cap} onDecline={() => setDpr(-1)} onIncline={() => setDpr(1)} />
    <Suspense fallback={null}>
      <World sim={sim} theme={theme} quality={quality} bloom={tierName === 'high' && window.innerWidth >= 900 && new URLSearchParams(window.location.search).get('bloom') !== '0'} />
      <Actors sim={sim} carId={carId} lite={quality.lite} playerRig={playerRig} />
      <Player sim={sim} carId={carId} lite={quality.lite} rig={playerRig} />
      <Sparks sim={sim} />
      <SpeedLines sim={sim} />
      <SkidMarks sim={sim} />
    </Suspense>
    <Driver handle={handle} onComplete={onComplete} onReady={onReady} />
    <CameraRig handle={handle} />
  </Canvas>;
}

import { useState } from 'react';
function useDprState(cap: number, forced: number | null) {
  const [lvl, setLvl] = useState(0);
  const dpr = forced ?? Math.max(1, +(cap * (1 - 0.17 * lvl)).toFixed(2));
  return [dpr, (d: number) => setLvl((l) => clamp(l + d, 0, 3))] as const;
}
void MPH_TO_MPS;
