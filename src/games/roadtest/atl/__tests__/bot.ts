import { AtlSim } from '../sim';
import { MPH_TO_MPS } from '../../g3d/sim';

/** A scripted driver for the rules engine. `clean` follows the rules the way a good student does; the options turn it into a bad one. */
export interface BotOpts {
  over?: number;          // drive this many mph over the limit
  ignoreStops?: boolean;  // roll through stop signs, red lights, rails, crosswalks
  ignoreSignal?: boolean; // change lanes without signalling
  weave?: boolean;        // drift over the lane lines
  tailgate?: boolean;     // sit on the bumper of the car ahead
  noKeepRight?: boolean;  // camp in the passing lane
  crash?: boolean;        // never brake for traffic and never avoid anything
  ignoreMoveOver?: boolean;
  takeExits?: boolean;
  lane?: number;          // preferred lane index
  slow?: number;          // mph below the limit
  gap?: number;           // following gap in seconds
}

type Ctl = { gas: boolean; brake: boolean; left: boolean; right: boolean };
const K = MPH_TO_MPS;
const brakeTo = (dist: number, margin = 3) => Math.sqrt(2 * 13 * Math.max(0, dist - margin)) / K;   // mph you can still stop from

export function makeBot(sim: AtlSim, o: BotOpts = {}) {
  const s: any = sim;
  const lay = sim.lay;
  let changing = 0; let signalWait = 0; let weaveT = 0; let target = sim.laneIdx;
  const desired = () => o.lane ?? (lay.kind === 'divided' ? Math.max(0, lay.lanes - 2 - (s.stage.hov ? 0 : 0)) : sim.laneIdx);
  target = Math.max(s.stage.hov ? 1 : 0, Math.min(lay.lanes - 1, desired()));
  if (o.noKeepRight) target = s.stage.hov ? 1 : 0;
  if (o.lane !== undefined) target = o.lane;

  const laneClear = (l: number, ahead = 28, behind = 32) => {
    for (const v of sim.vehicles) {
      if (v.dir !== 1 || v.fly || v.hit) continue;
      if (Math.abs(v.lane - l) > 0.7 && Math.abs(v.x - lay.xs[l]!) > 2.2) continue;
      const rel = v.d - sim.traveled;
      if (rel > -behind - Math.max(0, (v.v - sim.mph * K)) * 1.5 && rel < ahead + Math.max(0, (sim.mph * K - v.v)) * 1.8) return false;
    }
    return true;
  };

  return (dt: number): Ctl => {
    const T = sim.traveled, mph = sim.mph;
    const lim = sim.speedLimitNow + (o.over ?? 0);
    let tgt = lim - 2 - (o.slow ?? 0);
    let mustStop = false;
    const lower = (v: number) => { tgt = Math.min(tgt, v); };

    if (!o.ignoreStops) {
      for (const st of s.stops) if (!st.done) { const dist = st.d - T; if (dist > 0 && dist < 160) { if (!st.f && dist < 11) { lower(0); mustStop = true; } else lower(Math.max(dist < 11 ? 0 : 3, brakeTo(dist - 5.5, 0))); } }
      for (const l of s.lights) if (!l.done) { const dist = l.d - T; if (dist > 0 && dist < 220 && l.script === 'red') { if (l.state === 'green' && dist < 16 && l.stopped) { /* go */ } else lower(Math.max(0, brakeTo(dist - 6, 0))); if (dist < 22 && l.state !== 'green') { lower(0); } } }
      for (const r of s.rails) if (!r.done) {
        const dist = r.d - T; const active = r.phase === 'warn' || r.phase === 'down' || r.phase === 'train';
        if (dist > 0 && dist < 160) {
          if (r.train || r.gates) { if (active) { lower(Math.max(0, brakeTo(dist - 12, 0))); if (dist < 40) lower(0); } else if (r.phase === 'up') { lower(0); } else if (dist < 90) lower(Math.max(0, Math.min(25, brakeTo(dist - 12, 0)))); else lower(30); }
          else if (!r.stopped) lower(Math.min(18, Math.max(0, brakeTo(dist, 0)) + 18));
        }
      }
      for (const p of s.peds) if (p.state !== 'done') { const dist = p.d - T; if (dist > -3 && dist < 70) { if (p.state === 'walk' && dist < 40) lower(0); else if (dist < 35) lower(Math.min(8, Math.max(0, brakeTo(dist - 4, 0)))); else lower(10); } }
      for (const c of s.circles) if (!c.done) { const dist = c.d - 6 - T; if (dist > 0 && dist < 80) { const crossing = c.cross && c.cross.x > -16 && c.cross.x < 9; lower(crossing && dist < 20 ? Math.max(0, brakeTo(dist - 4, 0)) : Math.min(12, Math.max(4, brakeTo(dist, 0)))); } }
    }
    for (const p of s.polices) if (!p.done) { const dist = p.d - T; if (!o.ignoreMoveOver && dist > 0 && dist < 260 && sim.laneIdx === lay.lanes - 1 && target === lay.lanes - 1) lower(sim.stage.limit - 22); }
    // car ahead: hold a three second gap unless tailgating on purpose
    const gapWant = o.tailgate ? 0.55 : (o.gap ?? 2.4);
    if (sim.leaderGap < 90 && !o.crash) {
      const sp = Math.max(sim.leaderV, 0);
      if (sim.leaderGap < sp * gapWant + 6) lower(Math.max(0, sp / K - 4)); else if (!o.tailgate && sim.leaderGap < sp * 3.4 + 10) lower(Math.max(0, sp / K - 1));
      if (o.tailgate && sim.leaderGap < 4) lower(Math.max(0, sp / K - 6));
    }
    // lanes: closures ahead force a change, otherwise settle in the lane we like
    if (lay.kind === 'divided' && lay.lanes > 1) {
      const cur = sim.laneIdx;
      const closed = (l: number) => s.inClosure(l, T, 260);
      if (!o.crash && closed(cur) && changing === 0) { const open = [...Array(lay.lanes).keys()].filter((l) => !closed(l) && !(s.stage.hov && l === 0)).sort((a, b) => Math.abs(a - cur) - Math.abs(b - cur)); if (open.length) target = open[0]!; }
      else if (!closed(target) && changing === 0 && !(o.lane !== undefined)) { const want = o.noKeepRight ? (s.stage.hov ? 1 : 0) : Math.max(s.stage.hov ? 1 : 0, lay.lanes - 2); if (target !== want && !closed(want) && cur === target) target = want; }
    }
    const goalX = sim.laneX(target);
    let c: Ctl = { gas: false, brake: false, left: false, right: false };
    const dir = target > sim.laneIdx || (target === sim.laneIdx && goalX > sim.x + 0.4) ? 1 : target < sim.laneIdx || (target === sim.laneIdx && goalX < sim.x - 0.4) ? -1 : 0;
    const laneChange = target !== sim.laneIdx;
    if (laneChange && sim.mph > 8) {
      if (!o.ignoreSignal && sim.signalDir !== dir) { sim.setSignal(dir as -1 | 1); signalWait = 0.9; }
      signalWait -= dt;
      if ((signalWait <= 0 || o.ignoreSignal) && laneClear(target)) { changing = 1; }
      else if (signalWait <= -3.5) { target = sim.laneIdx; changing = 0; }
    } else changing = 0;
    // on the on-ramp: signal left, then go once there is a gap
    if (s.rampStart && !s.mergeDone) {
      const edge = lay.xs[lay.xs.length - 1]! + 1.7;
      if (sim.mph > sim.stage.limit - 12 && T > 330) { if (!o.ignoreSignal && sim.signalDir !== -1) sim.setSignal(-1); if (laneClear(lay.lanes - 1, 50, 30) || T > 520) c.left = true; }
      else if (T > 250 && !o.ignoreSignal && sim.signalDir === 0) { /* wait for speed */ }
      void edge;
    } else if (changing || Math.abs(goalX - sim.x) > 0.35) {
      if (goalX > sim.x + 0.3) c.right = true; else if (goalX < sim.x - 0.3) c.left = true;
    }
    if (o.weave) { weaveT += dt; const w = Math.sin(weaveT * 1.3); if (w > 0.6) { c.left = true; c.right = false; } else if (w < -0.6) { c.right = true; c.left = false; } }
    if (mustStop && mph < 1.0 && !o.ignoreStops) tgt = 0;
    // lights: after the full stop the light turns green by itself
    for (const l of s.lights) if (!l.done && l.state === 'green' && l.stopped) { tgt = Math.min(lim - 2, 25); }
    for (const st of s.stops) if (!st.done && st.f) { tgt = Math.min(lim - 2, 22); }
    if (mph < tgt) c.gas = true; else if (mph > tgt + 1.5) c.brake = true;
    return c;
  };
}

export interface RunReport { counts: Record<string, number>; score: number; strikes: number; finished: boolean; t: number; traveled: number; gained: number; lost: number; maxCombo: number; voided: boolean; cited: boolean }
export const silent: any = new Proxy({}, { get: () => () => {} });

export function runBot(stageId: string, o: BotOpts = {}, opts: { diff?: string; weather?: string; free?: boolean; maxSec?: number; seed?: string; setup?: (sim: AtlSim) => void } = {}): RunReport & { sim: AtlSim } {
  const sim = new AtlSim(stageId, (opts.diff ?? 'learner') as never, silent, opts.weather ?? 'clear', undefined, { seed: opts.seed });
  void 0;
  opts.setup?.(sim);
  const drive = makeBot(sim, o);
  let t = 0; const dt = 1 / 30;
  while (!sim.finished && t < (opts.maxSec ?? 420)) { sim.step(dt, drive(dt)); sim.drain(); t += dt; }
  // let the end-of-run timers run
  for (let i = 0; i < 30 * 4; i++) { sim.step(dt, { gas: false, brake: true, left: false, right: false }); sim.drain(); }
  const tr = sim.tracker; const counts: Record<string, number> = {};
  for (const e of tr.events) counts[e.label] = e.count;
  return { counts, score: tr.score, strikes: tr.strikes, finished: sim.finished, t, traveled: sim.traveled, gained: tr.gained, lost: tr.lost, maxCombo: tr.maxCombo, voided: tr.voided, cited: sim.cited, sim };
}
