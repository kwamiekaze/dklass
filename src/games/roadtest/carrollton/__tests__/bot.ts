import { OpenSim, M_PER_S_TO_MPH, type OSimEvent, type Controls } from '../sim';
import { wrapAngle } from '../map';
import { signalState } from '../traffic';

/** A scripted student for the open world: follows the GPS line, signals, stops at every sign and red light, yields to people and trains, keeps a gap. */
export interface BotOpts { over?: number; ignoreStops?: boolean; crash?: boolean; noSignal?: boolean }

const MPS = 1 / M_PER_S_TO_MPH;
const brakeTo = (dist: number, margin = 2.5) => Math.sqrt(2 * 5.5 * Math.max(0, dist - margin)) * M_PER_S_TO_MPH;

export function makeBot(sim: OpenSim, o: BotOpts = {}) {
  const s: any = sim;
  let hint = 0, lastRoute: unknown = null, stuck = 0, lastX = sim.x, lastZ = sim.z;
  const ctl: Controls = { gas: false, brake: false, left: false, right: false };

  return function think(): Controls {
    ctl.gas = ctl.brake = ctl.left = ctl.right = false;
    const r = sim.route; if (!r || !sim.mission) { ctl.brake = sim.mph > 4; return ctl; }
    if (r !== lastRoute) { lastRoute = r; hint = 0; }
    const pts = r.pts, n = pts.length / 2;
    // nearest point on the line (searching forward from the last hit)
    let bi = hint, bd = 1e12;
    for (let i = hint; i < Math.min(n, hint + 60); i++) { const d = (pts[i * 2]! - sim.x) ** 2 + (pts[i * 2 + 1]! - sim.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    hint = Math.max(0, bi - 3);
    // distance along the line to the car, and the turn ahead
    let sAlong = 0; for (let i = 1; i <= bi; i++) sAlong += Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!);
    const look = Math.max(5, sim.mph * MPS * 0.75 + 3);
    let acc = 0, ti = bi; while (ti < n - 1 && acc < look) { acc += Math.hypot(pts[ti * 2 + 2]! - pts[ti * 2]!, pts[ti * 2 + 3]! - pts[ti * 2 + 1]!); ti++; }
    const tx = pts[ti * 2]!, tz = pts[ti * 2 + 1]!;
    const err = wrapAngle(Math.atan2(tx - sim.x, tz - sim.z) - sim.h);
    const remaining = r.length - sAlong;
    if (remaining > 3) { if (err > 0.02) ctl.left = true; else if (err < -0.02) ctl.right = true; }

    // how sharp is the road coming up? slow for it
    let tight = 0;
    { let a = bi, d = 0, h0 = Math.atan2(pts[bi * 2 + 2]! - pts[bi * 2]!, pts[bi * 2 + 3]! - pts[bi * 2 + 1]!);
      while (a < n - 2 && d < 40) { d += Math.hypot(pts[a * 2 + 2]! - pts[a * 2]!, pts[a * 2 + 3]! - pts[a * 2 + 1]!); a++; const h1 = Math.atan2(pts[a * 2 + 2]! - pts[a * 2]!, pts[a * 2 + 3]! - pts[a * 2 + 1]!); tight = Math.max(tight, Math.abs(wrapAngle(h1 - h0))); } }

    let want = Math.max(8, sim.limit - 2) + (o.over ?? 0);
    if (tight > 0.5) want = Math.min(want, 9 + (tight < 0.9 ? 3 : 0));
    if (Math.abs(err) > 1.0) want = Math.min(want, 5);
    if (s.inJunction && Math.abs(err) > 0.12) want = Math.min(want, 13);
    if (remaining < 50) want = Math.min(want, Math.max(4, brakeTo(remaining - 10, 0)));
    // the turn signal, a good 100 feet before the turn
    const nt = r.turns.find((t) => t.at > sAlong - 4);
    if (nt && !o.noSignal && nt.dir !== 0) {
      const d = nt.at - sAlong, dir = nt.dir === 2 ? -1 : nt.dir as -1 | 1;
      if (d < 60 && d > -3 && sim.signalDir !== dir) sim.setSignal(dir);
    }

    if (!o.ignoreStops) {
      // signal or stop sign ahead, seen from far off like a person would see it
      const hit = sim.hit;
      if (hit) {
        const e = hit.edge, end: 0 | 1 = sim.dir === 1 ? 1 : 0, node = end === 1 ? e.b : e.a;
        const dist = end === 1 ? e.len - hit.s : hit.s, line = node.clear + 2.6, toLine = dist - line;
        const ap = s.ap && s.ap.node === node ? s.ap : null;
        if (toLine > -1 && toLine < 110 && !(ap && ap.judged)) {
          if (node.signal) {
            const t = Math.max(0, toLine) / Math.max(4, sim.v);
            const st = signalState(node, e.phase[end], sim.time + t * 0.8);
            if (st !== 'green' || signalState(node, e.phase[end], sim.time) !== 'green') want = Math.min(want, brakeTo(toLine, 0.2) + (toLine < 3 ? 0 : 2));
          } else if (e.stop[end] && !(ap && ap.stopped)) {
            want = Math.min(want, brakeTo(toLine, 0.2) + (toLine < 3 ? 0 : 2));
            if (toLine < 2.2) want = 0;
          }
        }
      }
      // people in a crosswalk ahead
      for (const p of sim.peds.list) {
        if (p.state !== 'walk') continue;
        const dx = p.x - sim.x, dz = p.z - sim.z, along = dx * Math.sin(sim.h) + dz * Math.cos(sim.h), lat = Math.abs(dx * Math.cos(sim.h) - dz * Math.sin(sim.h));
        if (along > -2 && along < 24 && lat < 9) want = Math.min(want, brakeTo(along, 5));
      }
      // railroad
      for (const c of sim.trains.crossings) {
        const dx = c.x - sim.x, dz = c.z - sim.z, along = dx * Math.sin(sim.h) + dz * Math.cos(sim.h), d = Math.hypot(dx, dz);
        if ((c.warn || c.gate > 0.1 || c.trainAt) && along > 0 && d < 45) want = Math.min(want, brakeTo(d, 12));
      }
    }
    // the car in front
    if (!o.crash) {
      let gap = 1e9;
      const fx = Math.sin(sim.h), fz = Math.cos(sim.h);
      for (const c of sim.traffic.cars) {
        const dx = c.x - sim.x, dz = c.z - sim.z, along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (along > 0 && lat < 2.4 + Math.min(1.5, along / 25)) gap = Math.min(gap, along - 4.6);
      }
      if (gap < 1e8) { const cap = brakeTo(gap, 3) ; want = Math.min(want, cap + 3); if (gap < 7) want = Math.min(want, 4); if (gap < 3.5) want = 0; }
      // a defensive driver also watches for the car that is about to pull out across the lane: where will we both be in the next three seconds?
      const pvx = Math.sin(sim.h) * sim.v, pvz = Math.cos(sim.h) * sim.v;
      for (const c of sim.traffic.cars) {
        const rx = c.x - sim.x, rz = c.z - sim.z; if (rx * rx + rz * rz > 55 * 55) continue;
        const cvx = Math.sin(c.h) * c.v, cvz = Math.cos(c.h) * c.v;
        const vx = cvx - pvx, vz = cvz - pvz, vv = vx * vx + vz * vz; if (vv < 0.5) continue;
        const tc = -(rx * vx + rz * vz) / vv; if (tc < 0.1 || tc > 3.2) continue;
        const dmin = Math.hypot(rx + vx * tc, rz + vz * tc);
        if (dmin < 3.4) { const dist = Math.hypot(rx, rz); want = Math.min(want, tc < 1.6 ? 0 : Math.max(0, brakeTo(dist, 6))); }
      }
      // parked cars and other obstacles sitting in the lane are avoided by the route offset; nothing to do
    }
    const err2 = sim.mph - want;
    if (err2 < -0.7) ctl.gas = true; else if (err2 > 1.5) ctl.brake = true;
    if (want === 0 && sim.mph < 0.4) ctl.gas = false;
    // not moving for ages? (a bad stuck spot) ask for the reset
    const moved = Math.hypot(sim.x - lastX, sim.z - lastZ); lastX = sim.x; lastZ = sim.z;
    stuck = moved < 0.01 && want > 3 ? stuck + 1 : 0;
    if (stuck > 90) { stuck = 0; sim.recover(); }
    return ctl;
  };
}

export interface RunOut { sim: OpenSim; events: OSimEvent[]; deltas: Extract<OSimEvent, { k: 'delta' }>[]; seconds: number }

/** Drives for `seconds` of sim time at 30 fps (or until the exam ends) and collects every event. */
export function runBot(seconds: number, o: BotOpts = {}, seed = 7, difficulty: 'learner' | 'standard' | 'pro' = 'learner'): RunOut {
  const snd: any = new Proxy({}, { get: () => () => {} });
  const sim = new OpenSim(difficulty as any, snd, { seed });
  const think = makeBot(sim, o);
  const events: OSimEvent[] = [];
  const dt = 1 / 30;
  for (let t = 0; t < seconds && !sim.finished; t += dt) { sim.step(dt, think()); events.push(...sim.drain()); }
  // let the last timers run, with the car held still
  for (let i = 0; i < 120; i++) { sim.step(dt, { gas: false, brake: sim.v > 0.3, left: false, right: false }); events.push(...sim.drain()); }
  return { sim, events, deltas: events.filter((e): e is Extract<OSimEvent, { k: 'delta' }> => e.k === 'delta'), seconds };
}
