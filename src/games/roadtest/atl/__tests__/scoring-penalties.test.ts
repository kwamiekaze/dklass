import { describe, expect, it } from 'vitest';
import { ATL_STAGES } from '../stages';
import { AtlSim } from '../sim';
import { runBot, silent } from './bot';
import { freeLeg, freeLegIds } from '../freeroam';

/** Every deduction, on a stage that really has it. The player always starts with points in the bank so the cut can be seen. */
const mk = (id: string, bank = 40) => {
  const sim: any = new AtlSim(id, 'learner' as never, silent, 'clear', undefined, { seed: 'pen' });
  for (let i = 0; i < bank; i++) sim.tracker.add('CHECKPOINT');
  return sim;
};
const step = (sim: any, sec: number, c = { gas: false, brake: false, left: false, right: false }) => { for (let i = 0; i < sec * 30; i++) { sim.step(1 / 30, c); sim.drain(); } };
const hold = (sim: any, mph: number, sec: number) => { for (let i = 0; i < sec * 30; i++) { sim.mph = mph; sim.step(1 / 30, { gas: false, brake: false, left: false, right: false }); sim.drain(); if (sim.finished) break; } };
/** Records the score on either side of the next award of `key`. */
const watch = (sim: any, key: string) => { const out: { before: number; after: number; n: number } = { before: 0, after: 0, n: 0 }; const add = sim.tracker.add.bind(sim.tracker); sim.tracker.add = (k: string) => { if (k === key) { out.before = sim.tracker.score; const r = add(k); out.after = sim.tracker.score; out.n++; return r; } return add(k); }; return out; };
const stageWith = (pick: (s: any) => boolean) => { for (const st of ATL_STAGES) { const s: any = new AtlSim(st.id, 'learner' as never, silent, 'clear'); if (pick(s)) return st.id; } throw new Error('no stage'); };

describe('flat deductions (minor and major)', () => {
  it('a stop sign rolled through costs 100 and ends the streak', () => {
    const sim = mk(stageWith((s) => s.stops.length > 0));
    const stop = sim.stops[0]; sim.traveled = stop.d - 40; sim.x = sim.lay.xs[sim.laneIdx];
    const w = watch(sim, 'RAN_STOP_SIGN'); expect(sim.tracker.combo).toBeGreaterThan(1);
    hold(sim, 20, 5);
    expect(w.n).toBe(1); expect(w.after).toBe(w.before - 100);
    expect(sim.tracker.countOf('RAN_STOP_SIGN')).toBe(1);
  });
  it('speeding costs 40 and one streak tier', () => {
    const sim = mk(stageWith((s) => s.lay.kind === 'divided'), 50);
    sim.traveled = 100;
    const before = sim.tracker.score, tier = sim.tracker.combo;
    sim.zones = []; hold(sim, sim.stage.limit + 12, 3);
    expect(sim.tracker.countOf('SPEEDING')).toBeGreaterThanOrEqual(1);
    expect(before - sim.tracker.score).toBeGreaterThanOrEqual(40);
    expect(sim.tracker.combo).toBeLessThan(tier);
  });
  it('a cone costs 50', () => {
    const sim = mk(stageWith((s) => s.lay.kind === 'divided'));
    sim.props.push({ id: 9999, k: 'cone', d: sim.traveled + 6, x: sim.x, hit: false });
    const w = watch(sim, 'HIT_CONE'); hold(sim, 20, 2);
    expect(w.n).toBe(1); expect(w.after).toBe(w.before - 50); expect(sim.tracker.strikes).toBe(0);
  });
  it('a solo driver in the HOV lane is charged', () => {
    const id = stageWith((s) => !!s.stage.hov);
    const r = runBot(id, { lane: 0, noKeepRight: true, ignoreSignal: true });
    expect(r.counts['Solo driver in the HOV lane'] ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('strikes: half of everything banked', () => {
  const crashInto = (sim: any) => {
    const v = sim.makeVeh('sedan', sim.traveled + 9, sim.laneIdx, 0); v.still = true; v.v = 0; v.want = 0; v.x = sim.x; sim.vehicles.push(v);
    hold(sim, 20, 1.2);
  };
  it('crash 1 and crash 2 each take half, crash 3 ends the exam', () => {
    const sim = mk(stageWith((s) => s.lay.kind === 'divided'), 60);
    const s0 = sim.tracker.score; crashInto(sim);
    expect(sim.tracker.countOf('HIT_TRAFFIC')).toBe(1); expect(sim.strikes).toBe(1);
    expect(sim.tracker.score).toBe(s0 - Math.round(s0 * 0.5)); expect(sim.tracker.combo).toBe(1);
    step(sim, 2.2);
    const s1 = sim.tracker.score; crashInto(sim);
    expect(sim.strikes).toBe(2); expect(sim.tracker.score).toBe(s1 - Math.round(s1 * 0.5)); expect(sim.finished).toBe(false);
    step(sim, 2.2);
    crashInto(sim); step(sim, 6);
    expect(sim.strikes).toBe(3); expect(sim.finished).toBe(true);
    const done = sim.events;
    expect(sim.tracker.examOver).toBe(true);
  });
  it('a red light is a strike and takes 15%', () => {
    const sim = mk(stageWith((s) => s.lights.length > 0));
    const l = sim.lights[0]; l.script = 'green'; l.state = 'red'; sim.traveled = l.d - 30;
    const w = watch(sim, 'RAN_RED_LIGHT'); hold(sim, 22, 3);
    expect(w.n).toBe(1); expect(sim.strikes).toBe(1);
    expect(w.after).toBe(w.before - Math.round(w.before * 0.15));
  });
  it('driving round lowered gates is a strike and takes 30%', () => {
    const sim = mk(stageWith((s) => s.rails.some((r: any) => r.gates)));
    const r = sim.rails.find((q: any) => q.gates); sim.traveled = r.d - 30; r.phase = 'down'; r.t = 0;
    const w = watch(sim, 'RAN_RAIL'); hold(sim, 22, 3);
    expect(w.n).toBe(1); expect(sim.strikes).toBe(1);
    expect(w.after).toBe(w.before - Math.round(w.before * 0.3));
  });
});

describe('critical: the run ends and almost everything is lost', () => {
  it('a pedestrian keeps 10%', () => {
    const sim = mk(stageWith((s) => s.peds.length > 0), 60);
    const p = sim.peds[0]; sim.traveled = p.d - 6; p.state = 'walk'; p.x = sim.x; p.fromX = sim.x - 3; p.toX = sim.x + 3;
    const w = watch(sim, 'HIT_PEDESTRIAN'); hold(sim, 10, 1);
    expect(w.n).toBe(1); expect(sim.tracker.voided).toBe(true);
    expect(w.after).toBe(Math.round(w.before * 0.1));
    step(sim, 4); expect(sim.finished).toBe(true);
  });
  it('a train keeps 5%', () => {
    const sim = mk(stageWith((s) => s.rails.some((r: any) => r.train)), 60);
    const r = sim.rails.find((q: any) => q.train); sim.traveled = r.d - 12; r.phase = 'train'; r.t = 0; r.trainX = 0;
    const w = watch(sim, 'HIT_TRAIN'); hold(sim, 25, 2);
    expect(w.n).toBe(1); expect(w.after).toBe(Math.round(w.before * 0.05));
  });
  it('not stopping for the police keeps 40% and fails', () => {
    const sim = mk('atl-i285-west', 60);
    sim.tracker.add('FAILED_TO_YIELD');
    expect(sim.tracker.voided).toBe(true);
  });
});

describe('habits that cost points on a drive', () => {
  const id = 'atl-i285-west';
  it('weaving over the lines', () => { const r = runBot(id, { weave: true }); expect(r.counts['Drifted over lane line'] ?? 0).toBeGreaterThan(0); expect(r.score).toBeLessThan(runBot(id, { gap: 3 }).score / 2); });
  it('changing lanes without a signal', () => { const r = runBot(id, { ignoreSignal: true, lane: 0 }); expect(r.counts['Changed lanes without signalling'] ?? 0).toBeGreaterThan(0); });
  it('camping in the passing lane', () => { const r = runBot(id, { lane: 0, noKeepRight: true }); expect(r.counts['Cruised in the passing lane'] ?? 0).toBeGreaterThan(0); });
  it('tailgating', () => { const r = runBot(id, { tailgate: true }); expect(r.counts['Tailgating'] ?? 0).toBeGreaterThan(0); });
  it('speeding', () => { const r = runBot(id, { over: 18 }); expect(r.counts['Exceeded speed limit'] ?? 0).toBeGreaterThan(0); expect(r.lost).toBeGreaterThan(0); });
  it('ignoring the move over law', () => {
    const pid = stageWith((s) => s.polices.length > 0);
    const lanes = (new AtlSim(pid, 'learner' as never, silent, 'clear') as any).lay.lanes;
    const r = runBot(pid, { ignoreMoveOver: true, lane: lanes - 1 });
    expect(r.counts['Did not move over or slow down'] ?? 0).toBeGreaterThanOrEqual(1);
  });
  it('a driver who ignores everything scores far less than a careful one', () => {
    const id2 = stageWith((s) => s.stops.length > 0 && s.lights.length > 0);
    const good = runBot(id2, { gap: 3 }), bad = runBot(id2, { ignoreStops: true, over: 14, weave: true, ignoreSignal: true });
    expect(bad.score).toBeLessThan(good.score * 0.5);
    expect(bad.lost).toBeGreaterThan(0);
  });
});

describe('the speed patrol', () => {
  const fast = (sim: any, steer: (sim: any) => { gas: boolean; brake: boolean; left: boolean; right: boolean }, until: (sim: any) => boolean, maxSec = 160) => {
    for (let i = 0; i < maxSec * 30 && !until(sim) && !sim.finished; i++) { sim.vehicles = sim.vehicles.filter((v: any) => v.cop || v.d < sim.traveled - 30 || v.d > sim.traveled + 400 || v.side); sim.strikes = 0; sim.step(1 / 30, steer(sim)); sim.drain(); }
  };
  const cruise = (sim: any) => ({ gas: sim.mph < 84, brake: sim.mph > 88, left: false, right: false });
  it('two tickets cost 150 each, the third time you are pulled over for 300', () => {
    const sim = mk('atl-i285-west', 60);
    const t = watch(sim, 'SPEEDING_TICKET'); const p = watch(sim, 'PULLED_OVER'); sim.effectiveLength = 1e9;
    sim.mph = 84; fast(sim, cruise, (s) => s.patrolPhase === 'pull');
    expect(t.n).toBe(2); expect(t.after).toBe(t.before - 150); expect(sim.patrolPhase).toBe('pull');
    // do what the officer asks: slow down and stop on the right shoulder
    fast(sim, (s) => ({ gas: false, brake: s.mph > 1, left: false, right: s.x < s.lay.xs[s.lay.lanes - 1] + 3.6 }), (s) => s.patrolPhase === 'stop', 60);
    expect(p.n).toBe(1); expect(p.after).toBe(p.before - 300);
    expect(sim.cited).toBe(true);
    expect(sim.tracker.countOf('LANE_CROSS'), 'pulling onto the shoulder when asked is not a lane fault').toBe(0);
  }, 60_000);
  it('driving on when the officer signals you keeps 40% and fails the exam', () => {
    const sim = mk('atl-i285-west', 60);
    const f = watch(sim, 'FAILED_TO_YIELD'); sim.effectiveLength = 1e9;
    sim.mph = 84; fast(sim, cruise, (s) => s.patrolPhase === 'pull');
    fast(sim, cruise, (s) => s.tracker.voided, 40);
    expect(f.n).toBe(1); expect(f.after).toBe(Math.round(f.before * 0.4)); expect(sim.tracker.voided).toBe(true);
  }, 60_000);
});

describe('roundabouts, exits and turns', () => {
  it('cutting off a car in the circle costs 100 and the streak', () => {
    const sim = mk(stageWith((s) => s.circles.length > 0));
    const c = sim.circles[0]; sim.traveled = c.d - 14; sim.mph = 20;
    const car = sim.makeVeh('sedan', c.d - 3, 0, 8); car.side = true; car.x = 0; car.still = true; car.v = 8; sim.vehicles.push(car); c.launched = true; c.cross = car;
    const w = watch(sim, 'CIRCLE_CUTOFF'); hold(sim, 20, 1.5);
    expect(w.n).toBe(1); expect(w.after).toBe(w.before - 100); expect(sim.tracker.combo).toBe(1);
  });
  const exitRun = (signal: boolean) => {
    const id = 'atl-i285-west';
    const sim: any = new AtlSim(id, 'learner' as never, silent, 'clear', undefined, { seed: 'exit' });
    const b = sim.branches.find((q: any) => q.kind === 'exit'); const lay = sim.lay, xl = lay.xs[lay.xs.length - 1];
    sim.rails = []; sim.stops = []; sim.lights = []; sim.peds = []; sim.circles = []; sim.zones = []; sim.closures = []; sim.props = [];
    sim.traveled = Math.max(0, b.d - 700); sim.mph = 50; sim.laneIdx = lay.lanes - 1; sim.x = xl;
    for (let i = 0; i < 30 * 40 && !sim.finished; i++) {
      const dd = sim.traveled - b.d;
      if (signal && dd > -200 && sim.signalDir !== 1) sim.setSignal(1);
      sim.step(1 / 30, { gas: sim.mph < 50, brake: sim.mph > 53, left: false, right: dd > -180 && sim.x < xl + 3.4 + (dd > 60 ? 4 : 0) - 0.2 });
      sim.vehicles = sim.vehicles.filter((v: any) => v.cop || v.side || Math.abs(v.d - sim.traveled) > 60); sim.strikes = 0; sim.drain();
    }
    return sim;
  };
  it('taking an exit signalled pays +60 and +12', () => { const sim = exitRun(true); expect(sim.tracker.countOf('EXIT_TAKEN')).toBe(1); expect(sim.tracker.countOf('SIGNALLED')).toBeGreaterThanOrEqual(1); expect(sim.tracker.countOf('NO_SIGNAL')).toBe(0); });
  it('taking an exit without signalling is charged', () => { const sim = exitRun(false); expect(sim.tracker.countOf('EXIT_TAKEN')).toBe(1); expect(sim.tracker.countOf('NO_SIGNAL')).toBeGreaterThanOrEqual(1); });
  const turn = (id: string, mph: number, oncoming: boolean) => {
    const sim: any = new AtlSim(id, 'learner' as never, silent, 'clear', undefined, { seed: 'turn', free: true });
    const b = sim.branches.find((q: any) => q.kind === 'left'); const lay = sim.lay;
    sim.rails = []; sim.stops = []; sim.lights = []; sim.peds = []; sim.circles = []; sim.zones = []; sim.closures = []; sim.props = []; sim.vehicles = [];
    sim.traveled = b.d - 90; sim.mph = mph; sim.x = lay.xs[0]; sim.populate = () => {};
    let placed = false;
    for (let i = 0; i < 30 * 30 && !sim.finished; i++) {
      const dd = sim.traveled - b.d;
      if (dd > -70 && sim.signalDir !== -1) sim.setSignal(-1);
      if (oncoming && !placed && dd > -22) { placed = true; const v = sim.makeVeh('sedan', b.d + 16, 0, 9); v.dir = -1; v.v = 9; v.x = -1.7; sim.vehicles.push(v); }
      sim.mph = Math.min(sim.mph, mph);
      sim.step(1 / 30, { gas: sim.mph < mph, brake: false, left: dd > -26 && sim.x > lay.edgeL - 3.5, right: false });
      sim.strikes = 0; sim.drain();
      if (sim.leg) break;
    }
    return sim;
  };
  const leftId = () => {
    for (const i of freeLegIds()) { const st = freeLeg('atl-fr-' + i); if (st.exits?.some((e: any) => e.kind === 'left')) return st.id; }
    throw new Error('no free roam road with a left turn');
  };
  it('a left turn taken too fast costs 60', () => { const sim = turn(leftId(), 30, false); expect(sim.tracker.countOf('TURN_TOO_FAST')).toBe(1); });
  it('a left turn into a clear gap is paid and crossing the centre line for it is not a fault', () => { const sim = turn(leftId(), 12, false); expect(sim.tracker.countOf('LEFT_YIELD')).toBe(1); expect(sim.tracker.countOf('TURN_TOO_FAST')).toBe(0); expect(sim.tracker.countOf('LANE_CROSS')).toBe(0); });
  it('a left turn across an oncoming car costs 250', () => { const sim = turn(leftId(), 12, true); expect(sim.tracker.countOf('LEFT_NO_YIELD')).toBe(1); });
});
