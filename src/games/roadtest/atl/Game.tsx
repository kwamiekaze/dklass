/**
 * One Atlanta run: the 3D canvas, the camera, the keys, the HUD and the loading screen. It runs on its own scene, its own rules engine and its own weather
 * store, and it does not touch the homepage in any way.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PerformanceMonitor, useGLTF, useProgress } from '@react-three/drei';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import { disposeAtlTextures } from './textures';
import { detectTier, qualityFor, type Quality } from '../../../components/nuhome2/world/quality';
import { fleetFiles } from '../../../components/nuhome2/world/Fleet';
import { touchControls } from '../game/controls';
import type { Difficulty, LevelResult } from '../game/types';
import { pickTrackForLevel, sound } from '../sound';
import type { Sfx, SimEvent } from '../g3d/sim';
import { TIER_NAMES } from '../game/scoring';
import { loadConditions } from '../g3d/conditions';
import { rollGeorgiaWeather, KIND_LABEL, KINDS, type WeatherKind } from '../g3d/atmo';
import { TOD_MIX, type TimeOfDay } from '../g3d/themes';
import { Hud } from '../g3d/Hud';
import { SkidMarks, Sparks, SpeedLines, fx } from '../g3d/Fx';
import { newHud, type HudState } from '../g3d/hudBus';
import { addLifetimeStars, selectedCar, type GarageId } from '../g3d/garage';
import { SPEC_IDS } from '../g3d/cars';
import { clamp, damp, lerp, smooth } from '../g3d/util';
import type { RunSim } from '../g3d/sim';
import '../g3d/g3d.css';
import './atl.css';
import { AtlSim, type LegEnd, type SimOpts } from './sim';
import { getAtlStage } from './stages';
import { AtlCtx, AtlWorld, makeCtx } from './World';
import { bridgeDuck, GIRDER_BOTTOM } from './Overpasses';
import { Circles, GuideSigns, Lights, MessageBoards, PlayerRig, Peds, Props, Rails, RoadSigns, Stops, Traffic } from './Actors';

export const INTRO_SECONDS = 2.3;
const WX_ICON: Record<string, string> = { clear: '☀', cloudy: '☁', fog: '🌫', rain: '🌧', storm: '⛈', snow: '❄' };

// ------------------------------------------------------------ input ---
const keys: Record<string, boolean> = {};
let keysBound = 0;
let signalHook: ((d: -1 | 1) => void) | null = null;
const keyDown = (e: KeyboardEvent) => {
  if (e.repeat) return; keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyQ' || e.code === 'KeyZ') signalHook?.(-1);
  if (e.code === 'KeyE' || e.code === 'KeyC') signalHook?.(1);
};
const keyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
const blur = () => { for (const k of Object.keys(keys)) keys[k] = false; };
function bindKeys() {
  if (keysBound++ === 0) { window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur); }
  return () => { if (--keysBound === 0) { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); blur(); } };
}
const readControls = () => ({
  gas: !!(keys.ArrowUp || keys.KeyW) || touchControls.gas,
  brake: !!(keys.ArrowDown || keys.KeyS || keys.Space) || touchControls.brake,
  left: !!(keys.ArrowLeft || keys.KeyA) || touchControls.left,
  right: !!(keys.ArrowRight || keys.KeyD) || touchControls.right,
});

export interface AtlHandle { sim: AtlSim; hud: HudState; paused: { current: boolean }; introT: number; skip: { current: boolean }; /** free roam: this scene continues a drive, so no countdown and no loading screen */ cont?: boolean; legNo?: number }

/** Work out this run's weather and time of day from the player's choices (random by default, weighted the way Georgia's weather really goes). */
export function resolveRun(stageId: string): { weather: WeatherKind; tod: TimeOfDay | undefined } {
  const st = getAtlStage(stageId)!, c = loadConditions();
  let weather: WeatherKind;
  const pick = c.weather as string;
  if ((KINDS as string[]).includes(pick)) weather = pick as WeatherKind;
  else if ((pick === 'auto' || pick === 'random') && st.weather) weather = st.weather;
  else {
    // random weather, but gentle stages keep it gentle: the path gets rougher as the student improves
    const RANK: Record<WeatherKind, number> = { clear: 0, cloudy: 1, rain: 2, fog: 3, storm: 4, snow: 5 };
    const cap = st.wxCap ?? 5;
    weather = rollGeorgiaWeather();
    for (let i = 0; i < 24 && RANK[weather] > cap; i++) weather = rollGeorgiaWeather();
    if (RANK[weather] > cap) weather = cap >= 1 ? 'cloudy' : 'clear';
  }
  let tod: TimeOfDay | undefined;
  const tp = c.time as string;
  if (tp === 'day' || tp === 'golden' || tp === 'dusk' || tp === 'night') tod = tp;
  else if (tp === 'sunset') tod = 'dusk';
  else if (tp === 'surprise') tod = (['day', 'golden', 'dusk', 'night'] as TimeOfDay[])[Math.floor(Math.random() * 4)];
  return { weather, tod };
}

/** Build one scene handle. Free roam builds a new one for every leg and hands the score, the strikes and the speed on to it. */
export function makeAtlHandle(levelId: string, difficulty: Difficulty, run: { weather: WeatherKind; tod: TimeOfDay | undefined }, opts: SimOpts & { cont?: boolean; legNo?: number } = {}): AtlHandle {
  const sim = new AtlSim(levelId, difficulty, sound as unknown as Sfx, run.weather, run.tod, opts);
  const hud = newHud();
  hud.levelName = sim.level.name; hud.levelSub = sim.stage.subtitle; hud.difficulty = sim.difficulty.label; hud.mult = sim.difficulty.scoreMul; hud.limit = sim.stage.limit; hud.best = 0;
  if (opts.cont) { hud.score = hud.display = sim.tracker.score; }
  return { sim, hud, paused: { current: false }, introT: opts.cont ? 1 : 0, skip: { current: false }, cont: opts.cont, legNo: opts.legNo ?? 0 };
}

export function useAtlScene(levelId: string, difficulty: Difficulty): AtlHandle {
  return useMemo(() => makeAtlHandle(levelId, difficulty, resolveRun(levelId)), [levelId, difficulty]);
}

const shake = { amp: 0, t: 0, dur: 0.01, punch: 0 };

function Driver({ handle, onComplete, onReady, onLeg }: { handle: AtlHandle; onComplete: (r: LevelResult) => void; onReady: () => void; onLeg?: (e: LegEnd) => void }) {
  const { sim, hud } = handle;
  const { camera, size } = useThree();
  const intro = useRef(handle.cont ? INTRO_SECONDS : 0), frames = useRef(0), ready = useRef(!!handle.cont), waited = useRef(0), legSent = useRef(false), errs = useRef(0), endWait = useRef(0);
  const prog = useProgress();
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => bindKeys(), []);
  useEffect(() => { signalHook = (d) => { if (intro.current >= INTRO_SECONDS && !sim.finished && !handle.paused.current) sim.setSignal(d); }; return () => { signalHook = null; }; }, [sim, handle]);
  const project = (x: number, y: number, d: number) => { v.set(x, y, -(d - sim.traveled)).project(camera); return { sx: (v.x * 0.5 + 0.5) * size.width, sy: (-v.y * 0.5 + 0.5) * size.height }; };
  const dispatch = (e: SimEvent) => {
    const now = performance.now();
    switch (e.k) {
      case 'float': { const p = project(e.x, 1.9, e.d); hud.floats.push({ text: e.text, good: e.good, sx: p.sx, sy: p.sy, born: now }); if (hud.floats.length > 8) hud.floats.shift(); break; }
      case 'crash':
        fx.emit({ x: e.x, y: 0.7, d: e.d, n: e.big ? 60 : 26, color: [0xffb347, 0xffffff, 0xff6a13, 0xf2c14e], speed: 7, up: 4, life: 0.8, size: 0.34, gravity: 12 });
        if (e.big) fx.emit({ x: e.x, y: 0.8, d: e.d, n: 14, color: 0x8a8a92, speed: 3, up: 2, life: 1.3, size: 1.6, gravity: -1, drag: 1.6, shape: 'smoke', alpha: 0.7 });
        shake.punch = Math.max(shake.punch, e.big ? 1 : 0.4); break;
      case 'shake': shake.amp = Math.max(shake.amp, e.amp); shake.t = shake.dur = e.dur; break;
      case 'flash': hud.flashes.push({ color: e.color, dur: e.dur, born: now }); break;
      case 'banner': hud.banners.push({ title: e.title, sub: e.sub, ms: e.ms, tone: e.tone ?? 'gold', born: now }); break;
      case 'finish': fx.emit({ x: sim.x, y: 5, d: sim.traveled + 6, n: 130, color: [0xf2c14e, 0xffffff, 0xff4d4d, 0x29e069, 0x4da6ff], speed: 6, up: 5, life: 2.4, size: 0.5, gravity: 4, shape: 'confetti', drag: 0.8 }); hud.finished = true; break;
      case 'catastrophe': hud.catastrophe = true; fx.emit({ x: sim.x, y: 1, d: sim.traveled + 2, n: 60, color: [0xff2a1a, 0xff8a6e], speed: 6, up: 4, life: 1.1, size: 0.5 }); break;
      case 'speedWarn': hud.speedWarn = now; break;
      case 'delta': hud.deltas.push({ kind: e.kind, chip: e.chip, sub: e.sub, born: now }); if (hud.deltas.length > 6) hud.deltas.shift(); if (e.tierUp) hud.toasts.push({ text: e.sub ?? 'STREAK UP', born: now }); break;
      case 'milestone': hud.toasts.push({ text: e.text, born: now }); break;
      case 'complete': hud.complete = e.result; onComplete(e.result); break;
      default: break;
    }
  };
  useFrame((_, rawDt) => {
    try {
    beat.t = performance.now();
    frames.current++;
    const dt = Math.min(rawDt, 0.05); waited.current += dt;
    if (!ready.current) { if (frames.current > 8 && ((!prog.active && waited.current > 1.0) || waited.current > 9)) { ready.current = true; onReady(); } else return; }
    if (!handle.paused.current) {
      if (intro.current < INTRO_SECONDS) {
        intro.current += dt;
        if (handle.skip.current && intro.current > 0.7) intro.current = INTRO_SECONDS;
        handle.introT = Math.min(1, intro.current / INTRO_SECONDS);
        const left = INTRO_SECONDS - intro.current;
        hud.countdown = left > 1.55 ? 3 : left > 0.95 ? 2 : left > 0.4 ? 1 : left > 0 ? 0 : -1;
        sim.step(0, { gas: false, brake: false, left: false, right: false });
      } else { hud.countdown = -1; handle.introT = 1; sim.step(dt, readControls()); }
      for (const e of sim.drain()) dispatch(e);
      // the run is over but the popup has not come: bring it up anyway
      if (sim.finished && !sim.isComplete) { if (!endWait.current) endWait.current = performance.now(); if (performance.now() - endWait.current > 2600) { sim.forceComplete(); for (const e of sim.drain()) dispatch(e); } }
    }
    errs.current = 0;
    if (sim.leg && sim.free && !legSent.current && onLeg) { legSent.current = true; onLeg(sim.leg); }
    hud.score = sim.tracker.score;
    const diff = hud.score - hud.display;
    if (diff !== 0) { const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 6))); hud.display = Math.abs(step) >= Math.abs(diff) ? hud.score : hud.display + step; }
    hud.mph = sim.mph; hud.over = sim.speeding; hud.combo = sim.tracker.combo; hud.maxCombo = sim.tracker.maxCombo; hud.stars = sim.tracker.starsCollected;
    hud.progress = sim.progress; hud.strikes = sim.strikes; hud.limit = sim.speedLimitNow; hud.distance = sim.travelPx; hud.tierProg = sim.tracker.tierProgress; hud.tierName = TIER_NAMES[sim.tracker.combo - 1] ?? '';
    } catch (err) {
      if (import.meta.env.DEV) console.error('atl frame', err);
      // a frame that keeps failing would freeze the game with no way out: end the run and show the options
      if (++errs.current > 24 && !sim.isComplete) { errs.current = 0; try { sim.forceComplete(); for (const e of sim.drain()) dispatch(e); } catch { /* ignore */ } }
    }
  }, -5);
  return null;
}

/** Last time the scene loop ticked. A watchdog remounts the canvas if a phone's GPU stalls or loses its context. */
const beat = { t: 0 };

function CameraRig({ handle }: { handle: AtlHandle }) {
  const { sim } = handle;
  const cam = useRef({ x: sim.x, t: handle.cont ? 1 : 0, fov: 56, fin: 0, duck: 0 });
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3() }), []);
  useFrame(({ camera, size, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05), c = cam.current, pc = camera as THREE.PerspectiveCamera;
    const asp = size.width / size.height, k = clamp((1.15 - asp) / 0.65, 0, 1);
    const back = lerp(8.6, 13.6, k), up = lerp(3.2, 8.8, k), fovB = lerp(54, 66, k), lookZ = lerp(-17, -10, k), lookY = lerp(1.15, 0.5, k);
    const sp = clamp(sim.mph / sim.maxMph, 0, 1);
    c.x = damp(c.x, sim.x, 7, dt);
    c.t = damp(c.t, handle.introT >= 1 ? 1 : clamp(handle.introT * 1.12, 0, 1), 9, dt);
    const e = smooth(0, 1, c.t);
    c.duck = damp(c.duck, bridgeDuck(sim.traveled, back), 5, dt);
    const over = Math.max(0, c.x - 5.8); let px = c.x * 0.6 + over * 0.9, py = up, pz = back, lx = c.x * 0.4 + over * 0.8, ly = lookY, lz = lookZ;
    if (e < 0.999) { const a = lerp(2.5, 0, e), R = lerp(6.4, back, e), h = lerp(1.25, up, e); px = sim.x + Math.sin(a) * R * 0.9; pz = Math.cos(a) * R; py = h; lx = lerp(sim.x, c.x * 0.4, e); ly = lerp(0.85, lookY, e); lz = lerp(0, lookZ, e); }
    if (sim.finished) {
      c.fin = Math.min(1.5, c.fin + dt); const a = c.fin * 0.9, R = lerp(back, 7.5, smooth(0, 1.2, c.fin));
      if (handle.hud.catastrophe) { px = sim.x + 2.2; pz = 4.2; py = 1.9; lx = sim.x; ly = 0.7; lz = -2; }
      else { px = sim.x + Math.sin(a) * R; pz = Math.cos(a) * R * 0.85; py = lerp(up, 2.6, smooth(0, 1.2, c.fin)); lx = sim.x; ly = 1.0; lz = -2 - 8 * (1 - smooth(0, 1.2, c.fin)); }
    }
    // under a bridge the chase camera drops below the girders and the view comes down with it, so it never passes through the deck
    if (!sim.finished && e > 0.999 && c.duck > 0.001) { const lowY = Math.min(py, GIRDER_BOTTOM - 1.3); py = lerp(py, lowY, c.duck); ly = lerp(ly, Math.min(ly, 0.9), c.duck); }
    tmp.p.set(px, py, pz); tmp.l.set(lx, ly, lz);
    if (shake.t > 0) { shake.t -= dt; const f = Math.max(0, shake.t / shake.dur) * shake.amp; tmp.p.x += (Math.random() - 0.5) * 0.28 * f; tmp.p.y += (Math.random() - 0.5) * 0.22 * f; tmp.l.x += (Math.random() - 0.5) * 0.3 * f; if (shake.t <= 0) shake.amp = 0; }
    shake.punch = damp(shake.punch, 0, 7, dt);
    const rumble = sp * 0.012 * (sim.mph > 5 ? 1 : 0);
    tmp.p.y += Math.sin(clock.elapsedTime * 41) * rumble; tmp.p.x += Math.sin(clock.elapsedTime * 33) * rumble * 0.6;
    if (import.meta.env.DEV) { const o = (window as unknown as { __cam?: { p: number[]; l: number[] } }).__cam; if (o) { tmp.p.set(o.p[0]!, o.p[1]!, o.p[2]!); tmp.l.set(o.l[0]!, o.l[1]!, o.l[2]!); } }
    camera.position.copy(tmp.p); camera.lookAt(tmp.l); camera.rotateZ(-sim.steerV * 0.0045 * e);
    c.fov = damp(c.fov, fovB + sp * 11 + shake.punch * 6, 5, dt);
    if (Math.abs(pc.fov - c.fov) > 0.01) { pc.fov = c.fov; pc.updateProjectionMatrix(); }
    pc.near = 0.3;
  });
  return null;
}

function Scene({ handle, carId, quality, bloom, onComplete, onReady, onLeg }: { handle: AtlHandle; carId: GarageId; quality: Quality; bloom: boolean; onComplete: (r: LevelResult) => void; onReady: () => void; onLeg?: (e: LegEnd) => void }) {
  const mix = useRef(TOD_MIX[handle.sim.stage.tod]);
  const ctx = useMemo(() => makeCtx(handle.sim, quality, mix), [handle, quality]);
  const rig = useRef<THREE.Group | null>(null);
  const sim = handle.sim as unknown as RunSim;
  return <NightCtx.Provider value={mix}>
    <AtlCtx.Provider value={ctx}>
      <Suspense fallback={null}>
        <AtlWorld quality={quality} bloom={bloom} mixRef={mix} />
        <Traffic /><Props /><GuideSigns /><MessageBoards /><RoadSigns /><Rails /><Circles /><Lights /><Stops /><Peds />
        <PlayerRig carId={carId} lite={quality.lite} rig={rig} />
        <Sparks sim={sim} /><SpeedLines sim={sim} /><SkidMarks sim={sim} />
      </Suspense>
      <Driver handle={handle} onComplete={onComplete} onReady={onReady} onLeg={onLeg} />
      <CameraRig handle={handle} />
    </AtlCtx.Provider>
  </NightCtx.Provider>;
}

/** The extras of the Atlanta HUD: road shield, weather, signal buttons, the following-gap meter and the lesson line. */
function AtlHud({ handle }: { handle: AtlHandle }) {
  const { sim } = handle;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, lastPrompt = '', promptAt = 0, lastLimit = -1;
    const q = (s: string) => root.current?.querySelector(s) as HTMLElement | null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const lim = Math.round(sim.speedLimitNow);
      if (lim !== lastLimit) { lastLimit = lim; const el = document.querySelector('.rt3d-limit b'); if (el) el.textContent = String(lim); }
      const on = sim.signalDir, blink = Math.floor(now / 380) % 2 === 0;
      q('.atl-sig-l')?.classList.toggle('on', on === -1 && blink); q('.atl-sig-r')?.classList.toggle('on', on === 1 && blink);
      q('.atl-sig-l')?.classList.toggle('armed', on === -1); q('.atl-sig-r')?.classList.toggle('armed', on === 1);
      const g = q('.atl-gap');
      if (g) { const s = sim.gapSec; const show = s < 8 && sim.mph > 12; g.style.opacity = show ? '1' : '0.35'; g.dataset.s = !show ? 'none' : s < 1 ? 'bad' : s < 2 ? 'warn' : s < 5 ? 'good' : 'far'; const b = g.querySelector('b'); if (b) b.textContent = show ? `${s.toFixed(1)}s` : '--'; }
      const rd = q('.atl-radar');
      if (rd) {
        const live = sim.stage.road === 'interstate', ph = sim.patrolPhase;
        rd.dataset.s = !live ? 'off' : ph !== 'none' && !sim.finished ? 'cop' : sim.fastT > 0.15 ? 'warn' : sim.tickets > 0 || sim.mph > 74 ? 'idle' : 'off';
        const u = rd.querySelector('u') as HTMLElement | null; if (u) u.style.width = `${Math.min(100, (ph !== 'none' ? 1 : sim.fastT / 5) * 100)}%`;
        rd.querySelectorAll('s').forEach((el, i) => el.classList.toggle('on', i < sim.tickets));
        const t = rd.querySelector('b'); if (t) t.textContent = ph === 'none' ? (sim.fastT > 0.15 ? `OVER 80 · ${Math.max(0, 5 - sim.fastT).toFixed(1)}s` : sim.tickets > 0 ? 'TICKETS' : 'SPEED WATCH') : ph === 'pull' || ph === 'stop' ? 'PULL OVER' : 'POLICE';
      }
      const cf = q('.atl-copflash'); if (cf) cf.dataset.on = sim.patrolPhase !== 'none' && !sim.finished ? (Math.floor(now / 170) % 2 ? 'a' : 'b') : '';   // the lights stop with the run
      if (sim.prompt !== lastPrompt) { lastPrompt = sim.prompt; promptAt = now; const p = q('.atl-prompt'); if (p) { p.textContent = sim.prompt; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); } }
      if (now - promptAt > 7500) q('.atl-prompt')?.classList.remove('show');
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim]);
  const press = (d: -1 | 1) => (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); sound.ensureRunning(); if (!sim.finished && !handle.paused.current) sim.setSignal(d); };
  return <div className="atl-hud" ref={root}>
    <div className="atl-road"><i className="atl-wx">{WX_ICON[sim.weatherKind] ?? ''}</i><span>{sim.stage.roadName}</span><em>{KIND_LABEL[sim.weatherKind as WeatherKind] ?? ''}</em></div>
    <div className="atl-sig">
      <button className="atl-sig-l" onPointerDown={press(-1)} aria-label="Left signal (Q)">◀<small>SIGNAL</small></button>
      <div className="atl-gap" data-s="none"><small>GAP</small><b>--</b></div>
      <button className="atl-sig-r" onPointerDown={press(1)} aria-label="Right signal (E)">▶<small>SIGNAL</small></button>
    </div>
    <div className="atl-radar" data-s="off"><small>🚨</small><b>SPEED WATCH</b><i><u /></i><span><s /><s /></span></div>
    <div className="atl-copflash" data-on="" />
    <div className="atl-prompt" />
  </div>;
}

export function AtlGame({ handle, onComplete, onLost, onLeg, fade }: { handle: AtlHandle; onComplete: (r: LevelResult) => void; onLost: () => void; onLeg?: (e: LegEnd) => void; fade?: boolean }) {
  const [ready, setReady] = useState(!!handle.cont);
  const [carId] = useState(() => selectedCar().id);
  const done = useRef(onComplete); done.current = onComplete;
  const lost = useRef(onLost); useEffect(() => { lost.current = onLost; }, [onLost]);
  const tierName = useMemo(() => detectTier(), []);
  const quality: Quality = qualityFor(tierName);
  const [lvl, setLvl] = useState(0);
  useEffect(() => () => disposeAtlTextures(), []);
  const [ckey, setCkey] = useState(0);
  const readyRef = useRef(false); readyRef.current = ready;
  useEffect(() => {
    beat.t = performance.now();
    const id = window.setInterval(() => {
      if (!readyRef.current || document.hidden) { beat.t = performance.now(); return; }
      if (performance.now() - beat.t > 6500) { beat.t = performance.now(); setCkey((k) => k + 1); }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const dprQ = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('dpr') : null;
  const cap = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.5 : quality.dpr[1]) : 1;
  const dpr = dprQ ? Number(dprQ) : Math.max(1, +(cap * (1 - 0.17 * lvl)).toFixed(2));
  const tip = useMemo(() => handle.sim.stage.lessons[Math.floor(Math.random() * handle.sim.stage.lessons.length)] ?? '', [handle]);
  useEffect(() => { if (import.meta.env.DEV) { (window as unknown as { __atl?: AtlHandle }).__atl = handle; return () => { delete (window as unknown as { __atl?: AtlHandle }).__atl; }; } }, [handle]);
  useEffect(() => { const f = fleetFiles(carId); if (f) useGLTF.preload(quality.lite ? f.lite : f.full); for (const s of SPEC_IDS) { const g = fleetFiles(s); if (g) useGLTF.preload(g.lite); } }, [carId, quality.lite]);
  useEffect(() => {
    const track = pickTrackForLevel({ id: handle.sim.level.id, nightAlpha: handle.sim.stage.tod === 'night' ? 0.3 : undefined });
    sound.init(); sound.startEngine(); if (!sound.muted && !sound.musicMuted) sound.playTrack(track);
    const unlock = () => { sound.init(); if (sound.isReady()) { sound.startEngine(); if (!sound.muted && !sound.musicMuted) sound.playTrack(track); } };
    window.addEventListener('keydown', unlock, { once: true }); window.addEventListener('pointerdown', unlock, { once: true });
    return () => { window.removeEventListener('keydown', unlock); window.removeEventListener('pointerdown', unlock); sound.stopEngine(); sound.stopMusic(); };
  }, [handle.sim.level.id]);
  useEffect(() => {
    const skip = () => { handle.skip.current = true; };
    window.addEventListener('keydown', skip); window.addEventListener('pointerdown', skip);
    return () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
  }, [handle]);
  const onCompleteCb = useCallback((r: LevelResult) => { addLifetimeStars(handle.sim.tracker.starsCollected); done.current(r); }, [handle]);
  const bloom = tierName === 'high' && (typeof window === 'undefined' || (window.innerWidth >= 900 && new URLSearchParams(window.location.search).get('bloom') !== '0'));
  const st = handle.sim.stage;
  return <div className="rt3d-root atl-root">
    <Canvas
      key={ckey}
      className="rt3d-canvas"
      shadows={quality.shadow > 0 && tierName === 'high'}
      dpr={dpr}
      gl={{ antialias: typeof window === 'undefined' || window.innerWidth >= 900, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: [0, 3.2, 8.6], fov: 56, near: 0.3, far: 360 }}
      onCreated={({ gl }) => { if (import.meta.env.DEV) (window as unknown as { __gl?: unknown }).__gl = gl; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.92; gl.setClearColor('#e9dcc2'); gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setCkey((k) => k + 1); }, { once: true }); }}
    >
      <PerformanceMonitor ms={350} iterations={8} flipflops={3} onDecline={() => setLvl((l) => clamp(l + 1, 0, 3))} onIncline={() => setLvl((l) => clamp(l - 1, 0, 3))} />
      <Scene key={`${handle.sim.stage.id}:${handle.legNo ?? 0}`} handle={handle} carId={carId} quality={quality} bloom={bloom} onComplete={onCompleteCb} onReady={() => setReady(true)} onLeg={onLeg} />
    </Canvas>
    <Hud handle={handle as unknown as Parameters<typeof Hud>[0]['handle']} />
    <AtlHud handle={handle} />
    {onLeg && <div className={`atl-fade${fade ? ' on' : ''}`} />}
    <div className={`rt3d-loading atl-loading${ready ? ' done' : ''}`} aria-hidden={ready}>
      <div className="rt3d-spin" />
      <h3>{st.name}</h3>
      <p>{st.place} · {st.roadName} · {st.limit} mph</p>
      <p className="atl-load-wx">{WX_ICON[handle.sim.weatherKind]} {KIND_LABEL[handle.sim.weatherKind as WeatherKind]} today</p>
      <p className="atl-load-tip">{tip}</p>
    </div>
  </div>;
}
