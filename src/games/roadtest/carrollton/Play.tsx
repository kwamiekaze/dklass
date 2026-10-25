/**
 * The Carrollton open world, the page around it: the canvas, the chase camera, the keys, the HUD, the minimap, the GPS and the loading screen.
 * It runs on its own rules engine (sim.ts) and touches nothing of the homepage.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PerformanceMonitor, useGLTF } from '@react-three/drei';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import { detectTier, qualityFor, type Quality } from '../../../components/nuhome2/world/quality';
import { fleetFiles } from '../../../components/nuhome2/world/Fleet';
import { touchControls } from '../game/controls';
import type { Difficulty, LevelResult } from '../game/types';
import { sound } from '../sound';
import { TIER_NAMES } from '../game/scoring';
import { Hud } from '../g3d/Hud';
import { SPEC_IDS } from '../g3d/cars';
import { newHud, type HudState } from '../g3d/hudBus';
import { addLifetimeStars, selectedCar, type GarageId } from '../g3d/garage';
import { clamp, damp, lerp, smooth } from '../g3d/util';
import '../g3d/g3d.css';
import '../atl/atl.css';
import './carrollton.css';
import { OpenSim, type OSimEvent, type Sfx } from './sim';
import { buildingAt, type GameMap } from './map';
import { Atmosphere, OpenWorld, PlayerRig, makeEnv, hourOf } from './World';
import { disposeCarrolltonTextures } from './tex';
import { disposeSignAtlases } from './signs';
import type { Route } from './route';

/** ?pm=0 keeps the quality fixed (for testing on slow software renderers) */
const NO_PM = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pm') === '0';
export const INTRO_SECONDS = 2.6;

// ------------------------------------------------------------ input ---
const keys: Record<string, boolean> = {};
let keysBound = 0;
let signalHook: ((d: -1 | 1) => void) | null = null;
let resetHook: (() => void) | null = null;
const keyDown = (e: KeyboardEvent) => {
  if (e.repeat) return; keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyQ' || e.code === 'KeyZ') signalHook?.(-1);
  if (e.code === 'KeyE' || e.code === 'KeyC') signalHook?.(1);
  if (e.code === 'KeyR') resetHook?.();
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

export interface OpenHandle { sim: OpenSim; hud: HudState; paused: { current: boolean }; introT: number; skip: { current: boolean } }

export function makeOpenHandle(difficulty: Difficulty): OpenHandle {
  const sim = new OpenSim(difficulty, sound as unknown as Sfx);
  const hud = newHud();
  hud.levelName = 'Carrollton'; hud.levelSub = 'Open world · the real streets'; hud.difficulty = sim.difficulty.label; hud.mult = sim.difficulty.scoreMul; hud.limit = 25; hud.endless = true; hud.best = 0;
  return { sim, hud, paused: { current: false }, introT: 0, skip: { current: false } };
}

const shake = { amp: 0, t: 0, dur: 0.01, punch: 0 };
const beat = { t: 0 };

// ------------------------------------------------------------ the loop ---
function Driver({ handle, onComplete, onReady }: { handle: OpenHandle; onComplete: (r: LevelResult) => void; onReady: () => void }) {
  const { sim, hud } = handle;
  const { camera, size } = useThree();
  const intro = useRef(0), frames = useRef(0), ready = useRef(false), waited = useRef(0), errs = useRef(0), endWait = useRef(0);
  const v = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => bindKeys(), []);
  useEffect(() => {
    signalHook = (d) => { if (intro.current >= INTRO_SECONDS && !sim.finished && !handle.paused.current) sim.setSignal(d); };
    resetHook = () => { if (intro.current >= INTRO_SECONDS && !sim.finished && !handle.paused.current) sim.recover(); };
    return () => { signalHook = null; resetHook = null; };
  }, [sim, handle]);
  const project = (x: number, y: number, z: number) => { v.set(x, y, z).project(camera); return { sx: (v.x * 0.5 + 0.5) * size.width, sy: (-v.y * 0.5 + 0.5) * size.height }; };
  const dispatch = (e: OSimEvent) => {
    const now = performance.now();
    switch (e.k) {
      case 'float': { const p = project(e.x, 2.1, e.z); hud.floats.push({ text: e.text, good: e.good, sx: p.sx, sy: p.sy, born: now }); if (hud.floats.length > 8) hud.floats.shift(); break; }
      case 'crash': shake.punch = Math.max(shake.punch, e.big ? 1 : 0.4); break;
      case 'shake': shake.amp = Math.max(shake.amp, e.amp); shake.t = shake.dur = e.dur; break;
      case 'flash': hud.flashes.push({ color: e.color, dur: e.dur, born: now }); break;
      case 'banner': hud.banners.push({ title: e.title, sub: e.sub, ms: e.ms, tone: e.tone ?? 'gold', born: now }); break;
      case 'delta': hud.deltas.push({ kind: e.kind, chip: e.chip, sub: e.sub, born: now }); if (hud.deltas.length > 6) hud.deltas.shift(); if (e.tierUp) hud.toasts.push({ text: e.sub ?? 'STREAK UP', born: now }); break;
      case 'toast': hud.toasts.push({ text: e.text, born: now }); break;
      case 'finish': hud.finished = true; break;
      case 'catastrophe': hud.catastrophe = true; break;
      case 'speedWarn': hud.speedWarn = now; break;
      case 'complete': hud.complete = e.result; onComplete(e.result); break;
      default: break;
    }
  };
  useFrame((_, rawDt) => {
    try {
      beat.t = performance.now();
      frames.current++;
      const dt = Math.min(rawDt, 0.05); waited.current += dt;
      if (!ready.current) { if (frames.current > 10 && waited.current > 1.2) { ready.current = true; onReady(); } else return; }
      if (!handle.paused.current) {
        if (intro.current < INTRO_SECONDS) {
          intro.current += dt;
          if (handle.skip.current && intro.current > 0.8) intro.current = INTRO_SECONDS;
          handle.introT = Math.min(1, intro.current / INTRO_SECONDS);
          const left = INTRO_SECONDS - intro.current;
          hud.countdown = left > 1.7 ? 3 : left > 1.05 ? 2 : left > 0.45 ? 1 : left > 0 ? 0 : -1;
          sim.step(0.0001, { gas: false, brake: false, left: false, right: false });
        } else { hud.countdown = -1; handle.introT = 1; sim.step(dt, readControls()); }
        for (const e of sim.drain()) dispatch(e);
        if (sim.finished && !sim.isComplete) { if (!endWait.current) endWait.current = performance.now(); if (performance.now() - endWait.current > 3200) { sim.forceComplete(); for (const e of sim.drain()) dispatch(e); } }
        sound.updateEngine(clamp(sim.mph / 90, 0, 1));
        if (sim.lateral > 0.6 && sim.mph > 18 && Math.random() < dt * 1.5) sound.tireScreech(0.5);
      }
      errs.current = 0;
      hud.score = sim.tracker.score;
      const diff = hud.score - hud.display;
      if (diff !== 0) { const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 6))); hud.display = Math.abs(step) >= Math.abs(diff) ? hud.score : hud.display + step; }
      hud.mph = sim.mph; hud.over = sim.speeding; hud.combo = sim.tracker.combo; hud.maxCombo = sim.tracker.maxCombo; hud.stars = sim.tracker.starsCollected;
      hud.progress = 0; hud.strikes = sim.strikes; hud.limit = sim.speedLimitNow; hud.distance = sim.travelPx; hud.endless = true; hud.tierProg = sim.tracker.tierProgress; hud.tierName = TIER_NAMES[sim.tracker.combo - 1] ?? '';
    } catch (err) {
      if (import.meta.env.DEV) console.error('carrollton frame', err);
      if (++errs.current > 24 && !sim.isComplete) { errs.current = 0; try { sim.forceComplete(); for (const e of sim.drain()) dispatch(e); } catch { /* ignore */ } }
    }
  }, -5);
  return null;
}

// ------------------------------------------------------------ the camera ---
/** is the line from (x0,y0,z0) to (x1,y1,z1) blocked by a building taller than the line at that point? */
function blocked(map: GameMap, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(L / 1.2));
  for (let i = 1; i <= n; i++) {
    const f = i / n, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, y = y0 + (y1 - y0) * f;
    const b = buildingAt(map, x, z, 0.35);
    if (b && y < Math.max(3.4, Math.round(b.h / 3.4) * 3.4) + 0.9) return true;
  }
  return false;
}
/** the chase positions to try, nearest-to-ideal first: when a building is in the way the camera climbs and closes in, so the car never drops out of the frame */
const CAM_STEPS = [[1, 1], [0.82, 1.25], [0.66, 1.55], [0.52, 1.95], [0.4, 2.4]] as const;

function CameraRig({ handle, map }: { handle: OpenHandle; map: GameMap }) {
  const { sim } = handle;
  const st = useRef({ hd: sim.h, fov: 58, k: 0, lx: sim.x, lz: sim.z, fin: 0 });
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), l: new THREE.Vector3() }), []);
  useFrame(({ camera, size, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05), c = st.current, pc = camera as THREE.PerspectiveCamera;
    const asp = size.width / size.height, port = clamp((1.15 - asp) / 0.65, 0, 1);
    const back = lerp(8.2, 11.2, port), up = lerp(3.2, 5.6, port), fovB = lerp(58, 66, port);
    const sp = clamp(sim.mph / 80, 0, 1);
    // the camera trails the heading of the car a little, so a turn is something you see; in reverse it holds still
    let dh = sim.h - c.hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    c.hd += dh * (1 - Math.exp(-(sim.v < -0.5 ? 1.0 : 5.0) * dt));
    c.lx = damp(c.lx, sim.x, 22, dt); c.lz = damp(c.lz, sim.z, 22, dt);
    const fx = Math.sin(c.hd), fz = Math.cos(c.hd);
    const e = smooth(0, 1, clamp(handle.introT * 1.1, 0, 1));
    const R = back + sp * 1.8, Hh = up + sp * 0.4;
    // pick the first chase position that sees the car over the roofs
    let want = CAM_STEPS.length - 1;
    for (let i = 0; i < CAM_STEPS.length; i++) {
      const [kr, kh] = CAM_STEPS[i]!;
      if (!blocked(map, sim.x, 1.1, sim.z, c.lx - fx * R * kr, Hh * kh, c.lz - fz * R * kr)) { want = i; break; }
    }
    // snap in quickly when a wall is coming, ease back out
    c.k = want > c.k ? Math.min(want, c.k + dt * 9) : Math.max(want, c.k - dt * 1.6);
    const i0 = Math.floor(c.k), i1 = Math.min(CAM_STEPS.length - 1, i0 + 1), fr = c.k - i0;
    const kr = lerp(CAM_STEPS[i0]![0], CAM_STEPS[i1]![0], fr), kh = lerp(CAM_STEPS[i0]![1], CAM_STEPS[i1]![1], fr);
    let px = c.lx - fx * R * kr, pz = c.lz - fz * R * kr, py = Hh * kh;
    // look a little ahead of the car; the closer and higher the camera, the nearer the aim, so the car stays in the lower third of the picture
    const close = clamp((1 - kr) / 0.6, 0, 1);
    let ahead = lerp(9 + sp * 10, 3.5, close), lookY = lerp(1.1, 0.6, close);
    if (e < 0.999) {
      // the opening: swing round from the front-left to the chase position behind
      const a = lerp(2.3, 0, e), RR = lerp(7.2, R * kr, e), s = Math.sin(c.hd + a), co = Math.cos(c.hd + a);
      px = sim.x - s * RR; pz = sim.z - co * RR; py = lerp(1.6, py, e); ahead = lerp(0, ahead, e); lookY = lerp(0.9, lookY, e);
    }
    if (sim.finished) {
      c.fin = Math.min(1.5, c.fin + dt); const a = c.fin * 0.8, RR = lerp(R * kr, 8, smooth(0, 1.2, c.fin));
      px = sim.x - Math.sin(c.hd + a) * RR; pz = sim.z - Math.cos(c.hd + a) * RR; py = lerp(py, 3.2, smooth(0, 1.2, c.fin)); ahead = lerp(ahead, 0, smooth(0, 1.2, c.fin)); lookY = 1;
    }
    tmp.p.set(px, py, pz);
    tmp.l.set(sim.x + fx * ahead, lookY, sim.z + fz * ahead);
    if (shake.t > 0) { shake.t -= dt; const fz2 = Math.max(0, shake.t / shake.dur) * shake.amp; tmp.p.x += (Math.random() - 0.5) * 0.3 * fz2; tmp.p.y += (Math.random() - 0.5) * 0.22 * fz2; if (shake.t <= 0) shake.amp = 0; }
    shake.punch = damp(shake.punch, 0, 7, dt);
    const rumble = sp * 0.01 * (sim.mph > 5 ? 1 : 0);
    tmp.p.y += Math.sin(clock.elapsedTime * 41) * rumble;
    if (import.meta.env.DEV) { const o = (window as unknown as { __cam?: { p: number[]; l: number[] } }).__cam; if (o) { tmp.p.set(o.p[0]!, o.p[1]!, o.p[2]!); tmp.l.set(o.l[0]!, o.l[1]!, o.l[2]!); } }
    camera.position.copy(tmp.p); camera.lookAt(tmp.l); camera.rotateZ(clamp(-sim.yawRate * 0.015, -0.03, 0.03) * e);
    c.fov = damp(c.fov, fovB + sp * 9 + shake.punch * 6, 5, dt);
    if (Math.abs(pc.fov - c.fov) > 0.01) { pc.fov = c.fov; pc.updateProjectionMatrix(); }
    pc.near = 0.4;
  });
  return null;
}

/** shadow map size for this device: real sun shadows everywhere, sharper on stronger machines; ?shadows=0 turns them off */
export function shadowSizeFor(tier: Quality['tier']) {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('shadows') === '0') return 0;
  return tier === 'high' ? 2048 : tier === 'mid' ? 1536 : 1024;
}

function Scene({ handle, carId, quality, lvl, onComplete, onReady }: { handle: OpenHandle; carId: GarageId; quality: Quality; lvl: number; onComplete: (r: LevelResult) => void; onReady: () => void }) {
  const sim = handle.sim, map = sim.map;
  const env = useMemo(() => makeEnv(), []);
  const mix = useRef(0);
  const shadowSize = useMemo(() => shadowSizeFor(quality.tier), [quality.tier]);
  const { scene } = useThree();
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __scene?: THREE.Scene }).__scene = scene; }, [scene]);
  return <NightCtx.Provider value={mix}>
    <Suspense fallback={null}>
      <Atmosphere sim={sim} env={env} shadow={shadowSize} active={lvl < 2} mix={mix} lite={quality.tier === 'lite'} />
      <OpenWorld sim={sim} env={env} quality={quality} shadowOn={shadowSize > 0} />
      <PlayerRig sim={sim} carId={carId} lite={quality.lite} />
    </Suspense>
    <Driver handle={handle} onComplete={onComplete} onReady={onReady} />
    <CameraRig handle={handle} map={map} />
  </NightCtx.Provider>;
}

// ------------------------------------------------------------ the extras of the HUD ---
const feet = (m: number) => m * 3.281;
const distText = (m: number) => { const ft = feet(m); return ft < 1000 ? `${Math.max(50, Math.round(ft / 50) * 50)} ft` : `${(ft / 5280).toFixed(1)} mi`; };
const routeCum = new WeakMap<Route, number[]>();
function routeProgress(r: Route, x: number, z: number, hint: number): { s: number; idx: number; off: number } {
  let cum = routeCum.get(r);
  if (!cum) { cum = [0]; for (let i = 2; i < r.pts.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(r.pts[i]! - r.pts[i - 2]!, r.pts[i + 1]! - r.pts[i - 1]!)); routeCum.set(r, cum); }
  let best = 1e9, bs = 0, bi = 0;
  const n = r.pts.length / 2;
  for (let i = Math.max(0, hint - 40); i < Math.min(n - 1, hint + 400); i++) {
    const x0 = r.pts[i * 2]!, z0 = r.pts[i * 2 + 1]!, dx = r.pts[i * 2 + 2]! - x0, dz = r.pts[i * 2 + 3]! - z0, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - x0) * dx + (z - z0) * dz) / l2, 0, 1), d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t));
    if (d < best) { best = d; bs = cum[i]! + t * Math.sqrt(l2); bi = i; }
  }
  return { s: bs, idx: bi, off: best };
}

const ARROWS: Record<string, string> = { '-1': '↰', '0': '↑', '1': '↱', '2': '↶' };

function OpenHud({ handle }: { handle: OpenHandle }) {
  const { sim } = handle;
  const root = useRef<HTMLDivElement>(null), mapRef = useRef<HTMLCanvasElement>(null);
  const roads = useMemo(() => {
    const out: { p: number[]; w: number; rank: number }[] = [];
    for (const e of sim.map.edges) if (e.way.rank >= 1) out.push({ p: e.p, w: e.way.width, rank: e.way.rank });
    return out;
  }, [sim]);
  useEffect(() => {
    let raf = 0, lastPrompt = '', promptAt = 0, lastLimit = -1, lastGps = '', lastMission = '', hint = 0, lastRoute: Route | null = null, mapT = 0;
    const q = (s: string) => root.current?.querySelector(s) as HTMLElement | null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const lim = Math.round(sim.speedLimitNow);
      if (lim !== lastLimit) { lastLimit = lim; const el = document.querySelector('.rt3d-limit b'); if (el) el.textContent = String(lim); }
      const on = sim.signalDir, blink = Math.floor(now / 380) % 2 === 0;
      q('.atl-sig-l')?.classList.toggle('on', on === -1 && blink); q('.atl-sig-r')?.classList.toggle('on', on === 1 && blink);
      q('.atl-sig-l')?.classList.toggle('armed', on === -1); q('.atl-sig-r')?.classList.toggle('armed', on === 1);
      const sn = q('.cr-street'); if (sn) { const t = sim.onRoad ? sim.roadName || 'Unnamed road' : 'Off road'; if (sn.textContent !== t) sn.textContent = t; }
      // the clock of the day
      const clock = q('.cr-clock'); if (clock) { const h = hourOf(sim.time), hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ap = hh >= 12 ? 'PM' : 'AM', t = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`; if (clock.textContent !== t) clock.textContent = t; }
      // prompt
      if (sim.prompt !== lastPrompt) { lastPrompt = sim.prompt; promptAt = now; const p = q('.atl-prompt'); if (p) { p.textContent = sim.prompt; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); } }
      if (now - promptAt > 7500) q('.atl-prompt')?.classList.remove('show');
      // the trip card and the GPS
      const ms = sim.mission, r = sim.route;
      const card = q('.cr-trip');
      let gps = '', arrow = '', sub = '', lane = '';
      if (ms && r) {
        if (r !== lastRoute) { lastRoute = r; hint = 0; }
        const pr = routeProgress(r, sim.x, sim.z, hint); hint = Math.max(0, pr.idx - 20);
        const left = Math.max(0, r.length - pr.s);
        const nt = r.turns.find((t) => t.at > pr.s - 6);
        if (pr.off > 40) { gps = 'Recalculating…'; arrow = '⟳'; }
        else if (nt && nt.at - pr.s < left - 12) {
          const d = nt.at - pr.s, word = nt.dir === -1 ? 'Turn left' : nt.dir === 1 ? 'Turn right' : nt.dir === 2 ? 'Make a U-turn' : 'Continue straight';
          gps = d < 35 ? `${word}${nt.street ? ` onto ${nt.street}` : ''}` : `In ${distText(d)}, ${word.toLowerCase()}${nt.street ? ` onto ${nt.street}` : ''}`;
          arrow = ARROWS[String(nt.dir)] ?? '↑';
          // lane guidance on roads with more than one lane each way
          if (nt.lanes > 1 && d < 260 && (nt.dir === -1 || nt.dir === 1)) lane = nt.lane === 0 ? 'Use the left lane' : nt.lane === nt.lanes - 1 ? 'Use the right lane' : 'Use a middle lane';
        } else { gps = left < 40 ? `Arriving at ${ms.name}` : `Continue ${distText(left)} to ${ms.name}`; arrow = '↑'; }
        sub = `${ms.name} · ${distText(left)}`;
      } else if (ms) { gps = ms.name; sub = ms.name; arrow = '↑'; }
      if (card) { card.dataset.on = ms ? '1' : ''; }
      const key = gps + '|' + arrow + '|' + sub + '|' + lane;
      if (key !== lastGps) { lastGps = key; const a = q('.cr-gps-a'), t = q('.cr-gps-t'), s = q('.cr-gps-s'), l = q('.cr-lane'); if (a) a.textContent = arrow; if (t) t.textContent = gps; if (s) s.textContent = sub; if (l) l.textContent = lane; }
      const mk = ms ? ms.name + sim.missions : ''; if (mk !== lastMission) { lastMission = mk; const m = q('.cr-trips'); if (m) m.textContent = `Trips ${sim.missions}`; }
      // the signal countdown / state at the next light
      const ns = sim.nearSignal, sg = q('.cr-light');
      if (sg) { sg.dataset.s = ns && ns.dist < 70 ? ns.state : ''; }
      // the minimap, a few times a second less than the frame rate
      if (now - mapT > 33) { mapT = now; drawMap(mapRef.current, sim, roads); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, roads]);
  const press = (d: -1 | 1) => (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); sound.ensureRunning(); if (!sim.finished && !handle.paused.current) sim.setSignal(d); };
  const reset = (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); if (!sim.finished && !handle.paused.current) sim.recover(); };
  return <div className="atl-hud cr-hud" ref={root}>
    <div className="atl-road cr-roadbar"><i className="atl-wx">☀</i><span className="cr-street">Carrollton</span><em className="cr-clock">9:30 AM</em></div>
    <div className="cr-trip" data-on="">
      <i className="cr-gps-a">↑</i>
      <div><b className="cr-gps-t" /><small className="cr-gps-s" /><i className="cr-lane" /></div>
      <em className="cr-trips">Trips 0</em>
    </div>
    <div className="atl-sig">
      <button className="atl-sig-l" onPointerDown={press(-1)} aria-label="Left signal (Q)">◀<small>SIGNAL</small></button>
      <button className="cr-reset" onPointerDown={reset} aria-label="Back on the road (R)" title="Back on the road (R)">⟲</button>
      <button className="atl-sig-r" onPointerDown={press(1)} aria-label="Right signal (E)">▶<small>SIGNAL</small></button>
    </div>
    <div className="cr-light" data-s="" />
    <div className="atl-prompt" />
    <canvas className="cr-map" ref={mapRef} width={300} height={300} aria-label="Map" />
    <div className="cr-attrib">Map data © OpenStreetMap contributors</div>
  </div>;
}

const RANK_W = [0, 1.2, 1.7, 2.3, 3, 3.6];
function drawMap(cv: HTMLCanvasElement | null, sim: OpenSim, roads: { p: number[]; w: number; rank: number }[]) {
  if (!cv) return;
  const g = cv.getContext('2d'); if (!g) return;
  const S = cv.width, C = S / 2, R = C - 4, PPM = 0.9;      // pixels per metre at 300 px
  g.clearRect(0, 0, S, S);
  g.save(); g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = 'rgba(12,16,22,.86)'; g.fillRect(0, 0, S, S);
  g.translate(C, C + 34); g.rotate(sim.h - Math.PI); g.scale(PPM, PPM); g.translate(-sim.x, -sim.z);
  const range = (R / PPM) * 1.3;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (const r of roads) {
      const p = r.p; let inside = false;
      for (let i = 0; i < p.length; i += 2) if (Math.abs(p[i]! - sim.x) < range && Math.abs(p[i + 1]! - sim.z) < range) { inside = true; break; }
      if (!inside) continue;
      g.beginPath(); g.moveTo(p[0]!, p[1]!); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
      const w = Math.max(3.5, r.w * 0.9) * (RANK_W[r.rank]! > 2 ? 1 : 0.9);
      if (pass === 0) { g.lineWidth = w + 2; g.strokeStyle = '#05080c'; } else { g.lineWidth = w; g.strokeStyle = r.rank >= 4 ? '#f2c14e' : r.rank === 3 ? '#e9edf2' : '#8e99a6'; }
      g.stroke();
    }
  }
  // the railroad
  g.setLineDash([6, 6]); g.strokeStyle = '#6b7380'; g.lineWidth = 2.2;
  for (const rl of sim.map.rails) { const p = rl.p; g.beginPath(); g.moveTo(p[0]!, p[1]!); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!); g.stroke(); }
  g.setLineDash([]);
  // the route
  const rt = sim.route;
  if (rt) { g.strokeStyle = '#3da8ff'; g.lineWidth = 7; g.globalAlpha = 0.95; g.beginPath(); g.moveTo(rt.pts[0]!, rt.pts[1]!); for (let i = 2; i < rt.pts.length; i += 2) g.lineTo(rt.pts[i]!, rt.pts[i + 1]!); g.stroke(); g.globalAlpha = 1; }
  // the other cars
  g.fillStyle = 'rgba(255,255,255,.55)';
  for (const c of sim.traffic.cars) if (Math.abs(c.x - sim.x) < range && Math.abs(c.z - sim.z) < range) g.fillRect(c.x - 1.6, c.z - 1.6, 3.2, 3.2);
  // the destination
  const ms = sim.mission;
  if (ms) {
    let dx = ms.x - sim.x, dz = ms.z - sim.z; const d = Math.hypot(dx, dz), lim = (R - 14) / PPM;
    let mx = ms.x, mz = ms.z; if (d > lim) { mx = sim.x + (dx / d) * lim; mz = sim.z + (dz / d) * lim; }
    g.fillStyle = '#f2c14e'; g.strokeStyle = '#0b0e12'; g.lineWidth = 2.5; g.beginPath(); g.arc(mx, mz, 9, 0, Math.PI * 2); g.fill(); g.stroke(); dx = 0; dz = 0;
  }
  g.restore();
  // the car, always pointing up
  g.save(); g.translate(C, C + 34); g.fillStyle = '#ffffff'; g.strokeStyle = '#0b0e12'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath(); g.stroke(); g.fill(); g.restore();
  g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.strokeStyle = 'rgba(242,193,78,.9)'; g.lineWidth = 3; g.stroke();
}

// ------------------------------------------------------------ the page ---
export function OpenGame({ handle, onComplete, onLost }: { handle: OpenHandle; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const [ready, setReady] = useState(false);
  const [carId] = useState(() => selectedCar().id);
  const done = useRef(onComplete); done.current = onComplete;
  const lost = useRef(onLost); useEffect(() => { lost.current = onLost; }, [onLost]);
  const tierName = useMemo(() => detectTier(), []);
  const quality: Quality = qualityFor(tierName);
  const [lvl, setLvl] = useState(0);
  const [ckey, setCkey] = useState(0);
  const readyRef = useRef(false); readyRef.current = ready;
  useEffect(() => () => { disposeCarrolltonTextures(); disposeSignAtlases(); }, []);
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
  useEffect(() => { if (import.meta.env.DEV) { (window as unknown as { __cr?: OpenHandle }).__cr = handle; return () => { delete (window as unknown as { __cr?: OpenHandle }).__cr; }; } }, [handle]);
  useEffect(() => { const f = fleetFiles(carId); if (f) useGLTF.preload(quality.lite ? f.lite : f.full); for (const s of SPEC_IDS) { const g = fleetFiles(s); if (g) useGLTF.preload(g.lite); } }, [carId, quality.lite]);
  useEffect(() => {
    const track = 'sunnyCruise' as const;
    sound.init(); sound.startEngine(); if (!sound.muted && !sound.musicMuted) sound.playTrack(track);
    const unlock = () => { sound.init(); if (sound.isReady()) { sound.startEngine(); if (!sound.muted && !sound.musicMuted) sound.playTrack(track); } };
    window.addEventListener('keydown', unlock, { once: true }); window.addEventListener('pointerdown', unlock, { once: true });
    return () => { window.removeEventListener('keydown', unlock); window.removeEventListener('pointerdown', unlock); sound.stopEngine(); sound.stopMusic(); };
  }, []);
  useEffect(() => {
    const skip = () => { handle.skip.current = true; };
    window.addEventListener('keydown', skip); window.addEventListener('pointerdown', skip);
    return () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
  }, [handle]);
  const onCompleteCb = useCallback((r: LevelResult) => { addLifetimeStars(handle.sim.tracker.starsCollected); done.current(r); }, [handle]);
  return <div className="rt3d-root atl-root cr-root">
    <Canvas
      key={ckey}
      className="rt3d-canvas"
      shadows={shadowSizeFor(tierName) > 0 ? 'percentage' : false}
      dpr={dpr}
      gl={{ antialias: typeof window === 'undefined' || window.innerWidth >= 900, alpha: false, powerPreference: 'high-performance' }}
      camera={{ position: [handle.sim.x, 3.3, handle.sim.z + 8], fov: 58, near: 0.4, far: 1000 }}
      onCreated={({ gl }) => { if (import.meta.env.DEV) (window as unknown as { __gl?: unknown }).__gl = gl; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; gl.setClearColor('#cfdbe2'); gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setCkey((k) => k + 1); }, { once: true }); }}
    >
      {!NO_PM && <PerformanceMonitor ms={350} iterations={8} flipflops={3} onDecline={() => setLvl((l) => clamp(l + 1, 0, 3))} onIncline={() => setLvl((l) => clamp(l - 1, 0, 3))} />}
      <Scene handle={handle} carId={carId} quality={quality} lvl={lvl} onComplete={onCompleteCb} onReady={() => setReady(true)} />
    </Canvas>
    <Hud handle={handle as unknown as Parameters<typeof Hud>[0]['handle']} />
    <OpenHud handle={handle} />
    <div className={`rt3d-loading atl-loading${ready ? ' done' : ''}`} aria-hidden={ready}>
      <div className="rt3d-spin" />
      <h3>Carrollton, Georgia</h3>
      <p>Open world · the real streets · every rule applies</p>
      <p className="atl-load-tip">Building the town… Q and E are your turn signals. Press R if you get stuck.</p>
    </div>
  </div>;
}

/** Mounts one open-world drive and hands its controls up to the page (pause, finish early). */
export default function CarrolltonPlay({ difficulty, onHandle, onComplete, onLost }: { difficulty: Difficulty; onHandle: (h: OpenHandle) => void; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const handle = useMemo(() => makeOpenHandle(difficulty), [difficulty]);
  useEffect(() => { onHandle(handle); }, [handle, onHandle]);
  return <OpenGame handle={handle} onComplete={onComplete} onLost={onLost} />;
}
