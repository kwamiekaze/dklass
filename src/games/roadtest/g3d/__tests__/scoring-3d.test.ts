import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../game/levels';
import { RunSim } from '../sim';
import { runBot3d, silent } from './bot3d';

const classic = LEVELS.filter((l) => !l.id.startsWith('atl-') && !l.endless);

/** Every classic lesson, driven by a careful bot: whatever the lesson teaches must pay and nothing may be deducted. */
describe.each(classic.map((l) => [l.id, l] as const))('clean drive: %s', (id, lv) => {
  it('scores every area it teaches and loses nothing', () => {
    let r = runBot3d(id, {});
    for (const v of [{ buffer: 1, slow: 3 }, { buffer: 2, slow: 6 }, { buffer: 3, slow: 9 }]) if (r.lost > 0 || !r.finished) r = runBot3d(id, v);
    const c = r.counts, sim: any = r.sim;
    expect(r.finished).toBe(true); expect(r.strikes).toBe(0); expect(r.voided).toBe(false);
    expect(r.lost, JSON.stringify(c)).toBe(0);
    expect(c['Completed the course']).toBe(1);
    if (lv.features.includes('checkpoint')) expect(c['Checkpoint reached']).toBe(3);
    if (lv.features.includes('stopSign')) expect(c['Full stop at stop sign'] ?? 0).toBeGreaterThanOrEqual(1);
    if (lv.features.includes('trafficLight')) expect((c['Passed on green'] ?? 0) + (c['Full stop at stop sign'] ?? 0)).toBeGreaterThanOrEqual(1);
    if (lv.features.includes('star')) expect(c['Gold star collected'] ?? 0).toBeGreaterThanOrEqual(1);
    expect(c['Smooth lane-keeping'] ?? 0).toBeGreaterThanOrEqual(3);
    expect(c['Collision-free drive']).toBe(1); expect(c['Spotless record: zero violations']).toBe(1);
    expect(sim.tracker.events.reduce((a: number, e: any) => a + e.points, 0)).toBe(r.score);
  }, 60_000);
});

const mk = (id = 'neighborhood', bank = 60) => { const sim: any = new RunSim(id, 'learner' as never, silent); for (let i = 0; i < bank; i++) sim.tracker.add('CHECKPOINT'); sim.obstacles = []; return sim; };
const hold = (sim: any, mph: number, sec: number, c: any = {}) => { for (let i = 0; i < sec * 30; i++) { sim.mph = mph; sim.step(1 / 30, { gas: false, brake: false, left: false, right: false, ...c }); sim.drain(); if (sim.finished) break; } };
const watch = (sim: any, key: string) => { const out = { before: 0, after: 0, n: 0 }; const add = sim.tracker.add.bind(sim.tracker); sim.tracker.add = (k: string) => { if (k === key) { out.before = sim.tracker.score; const r = add(k); out.after = sim.tracker.score; out.n++; return r; } return add(k); }; return out; };
const put = (sim: any, type: string, ahead: number, x = sim.x, extra: any = {}) => { const ob = { id: 90000 + sim.obstacles.length, type, d: sim.traveled + ahead, x, lane: 1, ...extra }; sim.obstacles.push(ob); sim.obstacles.sort((a: any, b: any) => a.d - b.d); return ob; };

describe('deductions in the 3D lessons', () => {
  it('a cone costs 50, flat', () => { const sim = mk(); put(sim, 'cone', 10); const w = watch(sim, 'HIT_CONE'); hold(sim, 20, 2); expect(w.n).toBe(1); expect(w.after).toBe(w.before - 50); expect(sim.strikes).toBe(0); });
  it('a parked car: half of everything, then half again, the third strike ends the exam', () => {
    const sim = mk(); const w = watch(sim, 'HIT_PARKED_CAR');
    put(sim, 'parkedCar', 10); hold(sim, 20, 2); expect(w.n).toBe(1); expect(w.after).toBe(w.before - Math.round(w.before * 0.5)); expect(sim.strikes).toBe(1);
    hold(sim, 0, 1.5); put(sim, 'parkedCar', 10); hold(sim, 20, 2); expect(w.n).toBe(2); expect(w.after).toBe(w.before - Math.round(w.before * 0.5)); expect(sim.strikes).toBe(2); expect(sim.finished).toBe(false);
    hold(sim, 0, 1.5); put(sim, 'parkedCar', 10); hold(sim, 20, 3); hold(sim, 0, 3); expect(sim.strikes).toBe(3); expect(sim.finished).toBe(true);
  });
  it('traffic is a strike too', () => { const sim = mk(); put(sim, 'traffic', 10, sim.x, { mph: 0 }); const w = watch(sim, 'HIT_TRAFFIC'); hold(sim, 20, 2); expect(w.n).toBe(1); expect(sim.strikes).toBe(1); expect(w.after).toBe(w.before - Math.round(w.before * 0.5)); });
  it('a stop sign rolled through costs 100 and the streak', () => {
    const sim = mk(); const ob = put(sim, 'stopSign', 30, 6.3); const w = watch(sim, 'RAN_STOP_SIGN'); const combo = sim.tracker.combo; hold(sim, 20, 4);
    expect(w.n).toBe(1); expect(w.after).toBe(w.before - 100); expect(combo).toBeGreaterThan(1); expect(sim.tracker.combo).toBe(1); void ob;
  });
  it('a red light is a strike and takes 15%', () => {
    const sim = mk(); const ob: any = put(sim, 'trafficLight', 30, -6.3, { phase: 0 }); sim.lightState = (o: any) => { o.state = 'red'; };
    const w = watch(sim, 'RAN_RED_LIGHT'); hold(sim, 20, 4); expect(w.n).toBe(1); expect(sim.strikes).toBe(1); expect(w.after).toBe(w.before - Math.round(w.before * 0.15)); void ob;
  });
  it('speeding costs 40 and a tier', () => { const sim = mk(); const tier = sim.tracker.combo; const w = watch(sim, 'SPEEDING'); hold(sim, sim.level.speedLimit + 15, 3); expect(w.n).toBeGreaterThanOrEqual(1); expect(w.after).toBe(w.before - 40); expect(sim.tracker.combo).toBeLessThan(tier); });
  it('a pedestrian keeps 10% and fails the run', () => {
    const sim = mk(); put(sim, 'pedestrian', 8, 0.5, { mph: 0.0001, telegraph: 0 }); const w = watch(sim, 'HIT_PEDESTRIAN'); hold(sim, 15, 2); hold(sim, 0, 3);
    expect(w.n).toBe(1); expect(w.after).toBe(Math.round(w.before * 0.1)); expect(sim.tracker.voided).toBe(true); expect(sim.finished).toBe(true);
  });
  it('an animal keeps 25%', () => {
    const sim = mk(); put(sim, 'dog', 8, 0.5, { mph: 0.0001, telegraph: 0 }); const w = watch(sim, 'HIT_ANIMAL'); hold(sim, 15, 2); hold(sim, 0, 3);
    expect(w.n).toBe(1); expect(w.after).toBe(Math.round(w.before * 0.25)); expect(sim.tracker.voided).toBe(true);
  });
  it('a shield absorbs the first crash and costs nothing', () => { const sim = mk(); sim.hasShield = true; put(sim, 'parkedCar', 10); const w = watch(sim, 'HIT_PARKED_CAR'); const s = sim.tracker.score; hold(sim, 20, 2); expect(w.n).toBe(0); expect(sim.tracker.score).toBe(s); expect(sim.strikes).toBe(0); });
});

describe('endless', () => {
  it('pays distance and a perfect streak, three crashes end the run', () => {
    const r = runBot3d('endless', { buffer: 1, slow: 3 }, { maxSec: 60 });
    expect(r.counts['Distance bonus'] ?? 0).toBeGreaterThan(0);
    const sim = mk('endless', 20); const w = watch(sim, 'HIT_TRAFFIC');
    for (let k = 0; k < 3; k++) { put(sim, 'parkedCar', 10); hold(sim, 20, 2); hold(sim, 0, 1.5); }
    hold(sim, 0, 3); expect(sim.strikes).toBe(3); expect(sim.finished).toBe(true); void w;
  });
});
