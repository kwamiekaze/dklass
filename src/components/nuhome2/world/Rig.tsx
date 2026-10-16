import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { FOV, PAN, STAGES, type Stop, type V3 } from './views';
import { OrbitGuard } from './orbitGuard';
import { T_END, T_DRIVE, T_GO, carMoving, intro, introAt, introHold, parkCarNow, releaseCar, sceneWarm } from './intro';
import { usableShots, type Shot } from './shots';
import { cinema, stopReel } from './reel';
import { engine } from '../music/engine';
import { skyAnchor } from './Sky';
import { finishPark, park, parkMoving, parkTotal, startPark, tickEnter, tickExit } from './park';
import { parkCamAt } from './parkcam';

type Controls = {
  target: THREE.Vector3; enabled: boolean; autoRotate: boolean; autoRotateSpeed: number; getAzimuthalAngle: () => number;
  addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void;
};
type Mode = 'intro' | 'pan' | 'fly' | 'free' | 'cinema' | 'park';
/** After the opening has run and the visitor has left the scene alone this long, it starts cutting between its angles by itself. */
const IDLE_BEFORE_CUTS = 12;
const shuffle = (n: number, seed: number) => { const a = Array.from({ length: n }, (_, i) => i); let x = seed; for (let i = n - 1; i > 0; i--) { x = (x * 1664525 + 1013904223) >>> 0; const j = x % (i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; };
const curve = (pts: V3[]) => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal');

/**
 * One camera brain. Intro and Pan are scripted, unbroken moves (see views.ts). NEXT VIEW glides to a stop. As soon as the
 * visitor touches the scene it becomes free: orbit, zoom, a slow drift that yields to the hand. Every hand-over keeps
 * the lens exactly where it was, so nothing ever jumps.
 */
export function Rig({ stage, reducedMotion, skipIntro, onIntroDone }: { stage: number; reducedMotion: boolean; skipIntro: boolean; onIntroDone: () => void }) {
  const { camera, size, gl } = useThree();
  const progress = useProgress();
  const controls = useThree(s => s.controls) as unknown as Controls | null;
  const narrow = size.width < 700 || size.width / size.height < .8;
  const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const hasStage = q.get('stage') !== null, hasCam = q.get('cam') !== null;
  const shotQ = q.get('shot') !== null ? Number(q.get('shot')) : null, shotU = Number(q.get('shotU') ?? .5);   // ?shot=12&shotU=.5 freezes a cut (for checking)
  const introT = q.get('introT') !== null ? Number(q.get('introT')) : null;      // ?introT=30 freezes the opening shot at 30 seconds (for checking)
  const parkT = q.get('parkT') !== null ? Number(q.get('parkT')) : null;         // ?parkT=40 freezes the parallel-parking drive at 40 seconds (for checking)
  const mode = useRef<Mode>(parkT !== null ? 'park' : shotQ !== null ? 'cinema' : introT !== null ? 'intro' : reducedMotion || hasStage ? 'fly' : skipIntro ? 'pan' : 'intro');
  const started = useRef(false);
  const cut = useRef({ pos: 0, idx: -1, t: 0, consumed: cinema.beatCuts, order: [] as number[], list: [] as Shot[], narrow: false });
  if (!started.current) { started.current = true; if (mode.current === 'intro') { intro.t = introT ?? Number(q.get('introFrom') ?? 0); intro.t3 = T_GO; intro.done = false; } else parkCarNow(); if (parkT !== null) { const pk = q.get('park'), from = q.get('parkFrom'); if (from === 'box') park.loc = 'box'; if (from === 'entry') park.loc = 'entry'; if (pk === 'turn') park.loc = 'bay'; if (pk === 'back') park.loc = 'line'; if (pk === 'exit') park.loc = from === 'entry' || from === 'box' || from === 'bay' || from === 'line' || from === 'front' ? from : 'rear'; startPark(pk === 'bay' || pk === 'turn' || pk === 'back' || pk === 'exit' || pk === 'enter' ? pk : 'parallel'); park.t = parkT; if (parkT >= parkTotal()) finishPark(); } }   // ?park=bay (&parkFrom=box) picks the other drive
  const parkFrom = useRef<{ p: THREE.Vector3; l: THREE.Vector3; fov: number; seq: number; at?: number } | null>(null), awayRef = useRef(false);
  const panClock = useRef(0), first = useRef(true), snapped = useRef(false), guard = useRef(new OrbitGuard()), dragging = useRef(false), done = useRef(false);
  const tp = useRef(new THREE.Vector3()), tl = useRef(new THREE.Vector3());
  const C = useMemo(() => ({ pp: curve(PAN.p), pl: curve(PAN.l) }), []);
  const fovNow = narrow ? FOV.narrow : FOV.wide;
  const stopOf = (i: number): Stop => { const s = STAGES[i] ?? STAGES[0]!; return narrow ? s.narrow : s.wide; };

  useEffect(() => {
    if (!controls || snapped.current || mode.current === 'intro') return;
    snapped.current = true;
    const persp = camera as THREE.PerspectiveCamera;
    if (mode.current === 'pan') { camera.position.copy(C.pp.getPoint(0)); controls.target.copy(C.pl.getPoint(0)); persp.fov = fovNow; }
    else { const s = stopOf(stage); camera.position.set(...s.p); controls.target.set(...s.l); persp.fov = s.fov; }
    camera.lookAt(controls.target); persp.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);
  useEffect(() => {
    const v = q.get('cam')?.split(',').map(Number); if (!v || !controls) return;
    camera.position.set(v[0]!, v[1]!, v[2]!); controls.target.set(v[3]!, v[4]!, v[5]!); camera.lookAt(v[3]!, v[4]!, v[5]!); mode.current = 'free'; snapped.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, camera]);
  useEffect(() => { if (first.current) { first.current = false; return; } mode.current = 'fly'; }, [stage, narrow]);
  useEffect(() => {
    if (!controls) return;
    const grab = () => { if (mode.current === 'intro') releaseCar(); stopReel(); if (mode.current !== 'free') mode.current = 'free'; };   // the parking drive carries on by its own clock
    const down = () => { dragging.current = true; }, up = () => { dragging.current = false; };
    controls.addEventListener('start', grab); controls.addEventListener('start', down); controls.addEventListener('end', up);
    return () => { controls.removeEventListener('start', grab); controls.removeEventListener('start', down); controls.removeEventListener('end', up); };
  }, [controls]);

  // Re-center (the button in RecenterButton.tsx): the lens glides back onto the driving car and follows it again
  useEffect(() => {
    if (!controls) return;
    const back = () => {
      if (park.phase !== 'run') return;
      mode.current = 'park';
      parkFrom.current = { p: camera.position.clone(), l: controls.target.clone(), fov: (camera as THREE.PerspectiveCamera).fov, seq: park.seq, at: -1 };
    };
    window.addEventListener('dk:recenter', back);
    return () => window.removeEventListener('dk:recenter', back);
  }, [controls, camera]);

  // The opening's clock is ticked before everything else every frame (negative priority) from a smoothed frame time, and it is held until the
  // scene's files are in and its shaders are compiled, so the car never pops in late and no hitch lands in the middle of the drive.
  const gate = useRef({ frames: 0, ready: false, dt: 1 / 60, since: 0 });
  useFrame((state, delta) => {
    const g = gate.current; g.frames++;
    g.dt += (Math.min(delta, .1) - g.dt) * .12;                         // a running average: one slow frame no longer jolts the whole shot
    if (!g.ready) {
      g.since += delta;
      if ((!progress.active && g.frames > 24 && g.since > .9) || g.since > 7) {
        // warm-up: compile every shader, then draw the whole estate once with culling off, so every mesh and texture is already
        // on the GPU. Otherwise each one uploads the first time it comes into view, and that stall lands mid-drive.
        const culled: THREE.Object3D[] = [];
        state.scene.traverse(o => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
        try { gl.compile(state.scene, camera); gl.shadowMap.needsUpdate = true; gl.render(state.scene, camera); } catch { /* ignore */ }
        culled.forEach(o => { o.frustumCulled = true; });
        g.ready = true; g.frames = 0; sceneWarm.v = true;
      }
      return;
    }
    // shadows refresh every frame while the car rolls (its shadow must move with it), every other frame once nothing moves
    gl.shadowMap.autoUpdate = false; if (carMoving() || parkMoving() || g.frames % 2 === 0) gl.shadowMap.needsUpdate = true;
    if (park.phase === 'run' && parkT === null) { park.t += Math.min(Math.max(g.dt, 1 / 250), .05); if (park.t >= parkTotal()) finishPark(); }
    if (!intro.done && introT === null && !introHold.v) { intro.t += Math.min(Math.max(g.dt, 1 / 250), .05); if (intro.t >= intro.t3 + T_DRIVE && intro.t >= T_END) intro.done = true; }
  }, -5);
  useFrame((state, delta) => {
    if (!controls) return;
    const sstep = (u: number) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
    const dt = Math.min(gate.current.dt, .05) || Math.min(delta, .05), time = state.clock.elapsedTime, persp = camera as THREE.PerspectiveCamera;
    engine.tick(time);
    tickExit(); tickEnter();                                                  // a PARKING request made mid-drive is carried out here, at the right moment
    if (shotQ === null && cinema.reel && mode.current !== 'cinema') { if (mode.current === 'intro') releaseCar(); mode.current = 'cinema'; cut.current.idx = -1; }
    else if (shotQ === null && !cinema.reel && !cinema.auto && mode.current === 'cinema') mode.current = 'free';
    if (park.phase === 'run' && parkFrom.current?.seq !== park.seq) { if (mode.current === 'intro') releaseCar(); cinema.auto = false; stopReel(); mode.current = 'park'; }
    if (park.phase === 'run' && parkFrom.current?.seq !== park.seq) parkFrom.current = { p: camera.position.clone(), l: controls.target.clone(), fov: (camera as THREE.PerspectiveCamera).fov, seq: park.seq };
    const m = mode.current;
    const away = park.phase === 'run' && m === 'free';                          // the drive goes on but the lens is no longer on the car (the visitor moved it): the Re-center button shows
    if (away !== awayRef.current) { awayRef.current = away; window.dispatchEvent(new CustomEvent('dk:cam-away', { detail: away })); }
    if (m !== 'free') controls.autoRotate = false;                              // (in free mode the orbit guard decides, below)
    const glide = (p: THREE.Vector3) => { p.x += Math.sin(time * .9) * .03; p.y += Math.sin(time * .7 + 1) * .025; p.z += Math.sin(time * .8 + 2) * .03; };
    const fovTo = (f: number, k = .08) => { if (Math.abs(persp.fov - f) > .01) { persp.fov += (f - persp.fov) * k; persp.updateProjectionMatrix(); } };
    if (m === 'intro') {
      const pose = introAt(intro.t, narrow);
      camera.position.set(...pose.p); controls.target.set(...pose.l); camera.lookAt(controls.target);
      if (Math.abs(persp.fov - pose.fov) > .005) { persp.fov = pose.fov; persp.updateProjectionMatrix(); }
      if (introT === null && intro.t >= T_END) { mode.current = 'pan'; panClock.current = 0; }
    } else if (m === 'park') {
      // the parallel-parking drive: a scripted camera (parkcam.ts) that starts from wherever the lens was, and hands the scene back to the visitor when the car is parked
      const pose = parkCamAt(Math.min(park.t, parkTotal()), narrow), from = parkFrom.current, k = from && parkT === null ? (from.at !== undefined ? (from.at < 0 && (from.at = time), sstep((time - from.at) / 1.1)) : sstep(park.t / 2.4)) : 1;
      if (from && k < 1) { camera.position.set(from.p.x + (pose.p[0] - from.p.x) * k, from.p.y + (pose.p[1] - from.p.y) * k, from.p.z + (pose.p[2] - from.p.z) * k); controls.target.set(from.l.x + (pose.l[0] - from.l.x) * k, from.l.y + (pose.l[1] - from.l.y) * k, from.l.z + (pose.l[2] - from.l.z) * k); persp.fov = from.fov + (pose.fov - from.fov) * k; }
      else { camera.position.set(...pose.p); controls.target.set(...pose.l); persp.fov = pose.fov; }
      camera.lookAt(controls.target); persp.updateProjectionMatrix();
      if (parkT === null && park.phase === 'done') mode.current = park.kind === 'exit' ? 'fly' : 'free';   // after the car has left the scene the lens glides back to the page's own view
    } else if (m === 'pan') {
      panClock.current += dt; const u = .5 - .5 * Math.cos((panClock.current / PAN.period) * Math.PI * 2);
      tp.current.copy(C.pp.getPoint(u)); glide(tp.current); tl.current.copy(C.pl.getPoint(u));
      camera.position.copy(tp.current); controls.target.copy(tl.current); camera.lookAt(tl.current);
      fovTo(fovNow);
      if (!reducedMotion && panClock.current > IDLE_BEFORE_CUTS) { cinema.auto = true; mode.current = 'cinema'; cut.current.idx = -1; }
    } else if (m === 'cinema') {
      const c = cut.current;
      if (c.narrow !== narrow || !c.list.length) { c.narrow = narrow; c.list = usableShots(narrow); c.order = shuffle(c.list.length, 7 + (narrow ? 1 : 0)); c.idx = -1; }
      if (!c.list.length) { mode.current = 'free'; }
      else if (shotQ !== null) { const sh = c.list[shotQ % c.list.length]!, pose = sh.at(shotU, narrow); camera.position.set(...pose.p); controls.target.set(...pose.l); camera.lookAt(controls.target); persp.fov = pose.fov; persp.updateProjectionMatrix(); }
      else {
        c.t += dt;
        const cur = c.idx >= 0 ? c.list[c.idx]! : null;
        const beatCut = cinema.playing && cinema.beatCuts !== c.consumed && c.t > 1.4, clockCut = cur ? c.t >= (cinema.playing ? cur.dur * 2.2 : cur.dur) : true;
        if (!cur || beatCut || clockCut) { c.consumed = cinema.beatCuts; c.idx = c.order[c.pos++ % c.order.length]!; c.t = 0; }
        const sh = c.list[c.idx]!, pose = sh.at(Math.min(1, c.t / sh.dur), narrow);
        camera.position.set(...pose.p); controls.target.set(...pose.l); camera.lookAt(controls.target);
        if (Math.abs(persp.fov - pose.fov) > .005) { persp.fov = pose.fov; persp.updateProjectionMatrix(); }
      }
    } else if (m === 'fly') {
      const st = stopOf(stage), k = reducedMotion ? 1 : 1 - Math.exp(-2.2 * dt);
      tp.current.set(...st.p); tl.current.set(...st.l);
      fovTo(st.fov, Math.min(1, k * 1.4));
      camera.position.lerp(tp.current, k); controls.target.lerp(tl.current, k);
      if (camera.position.distanceTo(tp.current) < .06) mode.current = 'free';
    } else {
      controls.target.y += Math.sin(time * .35) * .0012;
      // the lens never goes into anything solid or under the ground, and never sits pressed against one: the slow orbit looks ahead and turns round before it gets there, a hand that pushes into something is pushed out and rebounds (orbitGuard.ts)
      guard.current.frame(camera.position, controls, dt, { auto: !reducedMotion && !hasCam, drag: dragging.current });
    }
    if (!done.current && m !== 'intro') { done.current = true; onIntroDone(); }
    if (skyAnchor.current) skyAnchor.current.position.set(camera.position.x, 0, camera.position.z);
    if (m !== 'intro' && m !== 'cinema' && m !== 'park') { const t = controls.target; t.x = THREE.MathUtils.clamp(t.x, -45, 45); t.z = THREE.MathUtils.clamp(t.z, -45, 45); t.y = THREE.MathUtils.clamp(t.y, .4, 16); }
  });
  return null;
}
