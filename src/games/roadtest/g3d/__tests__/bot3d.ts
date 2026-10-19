import { RunSim, LANE_X, MPH_TO_MPS } from '../sim';
import { LEVELS } from '../../game/levels';

export interface Bot3dOpts { buffer?: number; slow?: number; over?: number; ignoreStops?: boolean; crash?: boolean; weave?: boolean; noStars?: boolean }
type Ctl = { gas: boolean; brake: boolean; left: boolean; right: boolean };
const K = MPH_TO_MPS;
const brakeTo = (dist: number) => Math.sqrt(2 * 14 * Math.max(0, dist)) / K;
export const silent: any = new Proxy({}, { get: () => () => {} });

export function makeBot3d(sim: RunSim, o: Bot3dOpts = {}) {
  const s: any = sim;
  let wt = 0;
  return (dt: number): Ctl => {
    const T = sim.traveled, lim = sim.level.speedLimit + (o.over ?? 0);
    let tgt = lim - 1.5 - (o.slow ?? 0);
    const lower = (v: number) => { tgt = Math.min(tgt, v); };
    const hazards: any[] = [];
    for (const ob of s.obstacles) {
      if (ob.fly || ob.hit) continue;
      const ahead = ob.d - T;
      if (ahead < -8 || ahead > 130) continue;
      switch (ob.type) {
        case 'cone': case 'parkedCar': case 'traffic': if (!ob.resolved) hazards.push(ob); break;
        case 'stopSign': if (!o.ignoreStops && !ob.resolved && ahead > 0) { if (ob.stopped) lower(14); else lower(Math.max(ahead < 14 ? 0 : 4, brakeTo(ahead - 3))); } break;
        case 'trafficLight': if (!o.ignoreStops && !ob.resolved && ahead > 0) { const stopNow = ob.state === 'red' || (ob.state === 'yellow' && ahead > sim.mph * K * 1.6 + 6); if (stopNow) lower(Math.max(ahead < 14 ? 0 : 4, brakeTo(ahead - 3))); } break;
        case 'pedestrian': case 'dog': if (!o.ignoreStops && !ob.stroll && !ob.resolved && !ob.crossed && ahead > -2 && ahead < 55) lower(ahead < 30 ? Math.max(0, brakeTo(ahead - 6)) : 12); break;
      }
    }
    const unsafe = (l: number) => s.obstacles.some((ob: any) => !ob.resolved && !ob.hit && (((ob.type === 'traffic' || ob.type === 'parkedCar') && ob.lane === l && ob.d - T > -14 && ob.d - T < 30) || (ob.type === 'pedestrian' && !ob.stroll && Math.abs(ob.x - LANE_X[l]!) < 8 && Math.abs(ob.d - T) < 24)));
    const path = (a: number, b: number) => { const r: number[] = []; for (let m = a + Math.sign(b - a); ; m += Math.sign(b - a)) { r.push(m); if (m === b) break; } return r; };
    // lane choice: look for the first thing in each lane, move to the lane with the most room, never cut across a lane that is blocked right here
    const first = (l: number) => hazards.reduce((m, h) => { const ahead = h.d - T; return Math.abs(h.x - LANE_X[l]!) < 2.0 + (o.buffer ?? 0) * 0.2 && ahead > -3 ? Math.min(m, ahead) : m; }, 999);
    const cur = LANE_X.reduce((b, x, i) => (Math.abs(sim.x - x) < Math.abs(sim.x - LANE_X[b]!) ? i : b), 0);
    const react = 10 + sim.mph * K * 1.7 + (o.buffer ?? 0) * 7;
    let goal = cur;
    const fc = first(cur);
    if (!o.crash) {
      if (fc < react) {
        const opts = [0, 1, 2].filter((l) => l !== cur && path(cur, l).every((m) => !unsafe(m)) && first(l) > Math.max(fc + 8, react * 0.8) && [0, 1, 2].filter((m) => (m - cur) * (m - l) < 0).every((m) => first(m) > 12)).sort((a, b) => first(b) - first(a));
        if (opts.length) goal = opts[0]!; else lower(Math.max(5, (fc - 4) / (K * 1.4)));
      } else if (!o.noStars) {
        for (const ob of s.obstacles) if (ob.type === 'star' && !ob.resolved) { const ahead = ob.d - T; if (ahead > 8 && ahead < 55) { const l = [0, 1, 2].reduce((b, i) => (Math.abs(ob.x - LANE_X[i]!) < Math.abs(ob.x - LANE_X[b]!) ? i : b), 0); if (first(l) > react * 1.4 && l !== cur && path(cur, l).every((m) => !unsafe(m)) && [0, 1, 2].filter((m) => (m - cur) * (m - l) < 0).every((m) => first(m) > 14)) { goal = l; break; } } }
      }
    }
    const gx = LANE_X[goal]!;
    // keep within the lane while the far lane is being picked: only steer when a change is wanted or off-centre
    const c: Ctl = { gas: false, brake: false, left: false, right: false };
    if (sim.x < gx - 0.25) c.right = true; else if (sim.x > gx + 0.25) c.left = true;
    if (o.weave) { wt += dt; const w = Math.sin(wt * 1.5); if (w > 0.5) { c.left = true; c.right = false; } else if (w < -0.5) { c.right = true; c.left = false; } }
    if (sim.mph < tgt) c.gas = true; else if (sim.mph > tgt + 1) c.brake = true;
    return c;
  };
}

export function runBot3d(levelId: string, o: Bot3dOpts = {}, opts: { diff?: string; maxSec?: number } = {}) {
  const lv = LEVELS.find((l) => l.id === levelId)!;
  const sim = new RunSim(lv.id, (opts.diff ?? "learner") as never, silent);
  const drive = makeBot3d(sim, o);
  let t = 0; const dt = 1 / 30;
  while (!sim.finished && t < (opts.maxSec ?? (lv.endless ? 120 : 400))) { sim.step(dt, drive(dt)); sim.drain(); t += dt; }
  for (let i = 0; i < 30 * 4; i++) { sim.step(dt, { gas: false, brake: true, left: false, right: false }); sim.drain(); }
  const tr = sim.tracker; const counts: Record<string, number> = {};
  for (const e of tr.events) counts[e.label] = e.count;
  return { counts, score: tr.score, strikes: tr.strikes, finished: sim.finished, t, traveled: sim.traveled, gained: tr.gained, lost: tr.lost, maxCombo: tr.maxCombo, voided: tr.voided, sim, level: lv };
}
