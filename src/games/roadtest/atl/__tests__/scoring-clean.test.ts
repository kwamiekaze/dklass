import { describe, expect, it } from 'vitest';
import { ATL_STAGES } from '../stages';
import { runBot } from './bot';
import { buildResult, parFor } from '../../game/scoring';
import { getDifficulty } from '../../game/types';

/** A good driver on every Atlanta stage: every area the stage teaches must pay, nothing may be deducted, the exam is passed. */
describe.each(ATL_STAGES.map((s) => [s.id, s] as const))('clean drive: %s', (id, st) => {
  it('scores every area it teaches and loses nothing', () => {
    // a good driver, backing off a little more each time the traffic around them makes them look bad
    let r = runBot(id, { gap: 3, slow: 1 }, { weather: st.weather ?? 'clear' });
    for (const v of [{ gap: 3.6, slow: 3 }, { gap: 4.4, slow: 6 }]) if (r.lost > 0) r = runBot(id, v, { weather: st.weather ?? 'clear' });
    const c = r.counts, sim: any = r.sim;
    expect(r.finished, 'finished').toBe(true);
    expect(r.strikes).toBe(0); expect(r.voided).toBe(false); expect(r.cited).toBe(false);
    expect(r.lost, JSON.stringify(c)).toBe(0);
    expect(c['Completed the course']).toBe(1);
    expect(c['Checkpoint reached']).toBe(3);
    expect(c['Smooth lane-keeping'] ?? 0).toBeGreaterThan(3);
    expect(c['Collision-free drive']).toBe(1);
    expect(c['Spotless record: zero violations']).toBe(1);
    // the areas this stage contains
    if (sim.stops.length) expect(c['Full stop at stop sign'] ?? 0, 'stop signs').toBeGreaterThanOrEqual(sim.stops.length);
    if (sim.lights.some((l: any) => l.script === 'green' || l.script === 'red')) expect(c['Passed on green'] ?? 0, 'lights').toBeGreaterThanOrEqual(1);
    if (sim.rails.length) expect(c['Stopped for the railroad crossing'] ?? 0, 'rails').toBe(sim.rails.length);
    if (sim.circles.length) expect(c['Yielded in the traffic circle'] ?? 0, 'circles').toBe(sim.circles.length);
    if (sim.polices.length) expect(c['Moved over for emergency vehicles'] ?? 0, 'move over').toBe(sim.polices.length);
    if (sim.closures.some((x: any) => x.kind === 'work')) expect(c['Slow and steady through the work zone'] ?? 0, 'work zone').toBeGreaterThanOrEqual(1);
    if (sim.merges.length) expect(c['Made room for merging traffic'] ?? 0, 'merging traffic').toBeGreaterThanOrEqual(1);
    if (sim.rampStart) expect(c['Merged smoothly at highway speed'], 'own merge').toBe(1);
    if (sim.peds.length) expect(c['Yielded to a pedestrian'] ?? 0, 'pedestrians').toBeGreaterThanOrEqual(1);
    // the report card agrees with the tracker, and a clean drive is an A
    const res = buildResult(sim.level, sim.tracker, getDifficulty('learner'), { completed: false });
    expect(res.events.reduce((a, e) => a + e.points, 0)).toBe(r.score);
    expect(r.score).toBeGreaterThan(parFor(sim.level, getDifficulty('learner')) * 0.8);
  }, 90_000);
});
