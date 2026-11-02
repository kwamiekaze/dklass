import { describe, expect, it } from 'vitest';
import { OpenSim, racePlan, GRID, type OSimEvent, type Sfx } from '../sim';
import { makeBot } from './bot';

const quiet = new Proxy({}, { get: () => () => {} }) as unknown as Sfx;
const mk = (seed: number, slot: number, trips = 2) => new OpenSim('learner', quiet, { seed, race: { trips, slot } });

describe('Carrollton Rush race mode', () => {
  it('every phone gets the same trips for the same seed, whatever its grid slot', () => {
    const plans = Array.from({ length: GRID }, (_, s) => mk(91, s, 3).plan);
    for (const p of plans) expect(p).toEqual(plans[0]);
    expect(plans[0]!.length).toBe(3);
    expect(new Set(plans[0]).size).toBe(3);
    expect(mk(92, 0, 3).plan).not.toEqual(plans[0]);
  });

  it('the grid lines cars up in one lane, a car and a half apart, facing the same way', () => {
    const a = mk(5, 0), b = mk(5, 1), f = mk(5, GRID - 1);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(7, 0);
    expect(Math.hypot(a.x - f.x, a.z - f.z)).toBeCloseTo(7 * (GRID - 1), 0);
    expect(Math.abs(Math.atan2(Math.sin(a.h - f.h), Math.cos(a.h - f.h)))).toBeLessThan(0.05);
    // slot 0 is in front: driving forward from the back car reaches the front one
    const fx = Math.sin(f.h), fz = Math.cos(f.h);
    expect((a.x - f.x) * fx + (a.z - f.z) * fz).toBeGreaterThan(30);
  });

  it('racePlan is pure', () => {
    const s = mk(3, 0);
    expect(racePlan(s.map, 10, 20, 44, 4)).toEqual(racePlan(s.map, 10, 20, 44, 4));
  });

  it('a clean driver finishes the race: trip events in order, then the drive ends as RACE_DONE', () => {
    const sim = mk(14, 2, 2), think = makeBot(sim);
    const trips: Extract<OSimEvent, { k: 'trip' }>[] = []; const stars: number[] = []; let faults = 0, complete = false;
    for (let t = 0; t < 600 && !complete; t += 1 / 30) {
      sim.step(1 / 30, think());
      for (const e of sim.drain()) {
        if (e.k === 'trip') trips.push(e);
        if (e.k === 'tripStars') stars.push(e.stars);
        if (e.k === 'delta' && e.kind !== 'up') faults++;
        if (e.k === 'complete') complete = true;
      }
    }
    expect(trips.map((t) => t.name)).toEqual(sim.plan);
    expect(trips.map((t) => t.last)).toEqual([false, true]);
    expect(complete).toBe(true);
    expect(sim.mission).toBeNull();
    expect(faults).toBeLessThanOrEqual(2);
    // every trip is rated one to three stars, and the stars count towards the stars of the drive
    expect(stars.length).toBe(2);
    for (const n of stars) expect(n).toBeGreaterThanOrEqual(1);
    expect(sim.tripStars).toEqual(stars);
    expect(sim.tracker.starsCollected).toBeGreaterThanOrEqual(stars.reduce((a, b) => a + b, 0));
  }, 120000);
});
