import { describe, expect, it } from 'vitest';
import { buildPath, conflicts, exitLeg, fullOrder, makeRound, makeScenario, mayGo, KIND_OF, type CarSpec } from '../engine';

const car = (from: CarSpec['from'], move: CarSpec['move'], rank: number): CarSpec => ({ id: from + move, from, move, model: 'hero', rank });

describe('stop sign rules', () => {
  it('exit legs', () => {
    expect(exitLeg('S', 'straight')).toBe('N'); expect(exitLeg('S', 'right')).toBe('E'); expect(exitLeg('S', 'left')).toBe('W');
    expect(exitLeg('W', 'right')).toBe('S'); expect(exitLeg('N', 'left')).toBe('E');
  });
  it('first to stop goes first', () => {
    const a = car('S', 'straight', 0), b = car('W', 'straight', 1);
    expect(mayGo([a, b])).toEqual([a]);
  });
  it('tie: the car on the right goes', () => {
    const a = car('S', 'straight', 0), b = car('W', 'straight', 0);   // S is on W's right
    expect(mayGo([a, b])).toEqual([a]);
  });
  it('tie, opposite: left yields', () => {
    const a = car('S', 'left', 0), b = car('N', 'straight', 0);
    expect(mayGo([a, b])).toEqual([b]);
  });
  it('opposite straight cars both go', () => {
    expect(mayGo([car('S', 'straight', 0), car('N', 'straight', 0)])).toHaveLength(2);
  });
  it('four straight cars together is a dead end', () => {
    expect(fullOrder(['N', 'E', 'S', 'W'].map(d => car(d as never, 'straight', 0)))).toBeNull();
  });
  it('cross traffic without a sign goes first', () => {
    const stopped = car('S', 'straight', 0), free = car('W', 'straight', -1);
    expect(mayGo([stopped, free])).toEqual([free]);
  });
  it('geometry: crossing and merging paths conflict, parallel ones do not', () => {
    expect(conflicts(car('S', 'straight', 0), car('W', 'straight', 0))).toBe(true);
    expect(conflicts(car('S', 'straight', 0), car('N', 'straight', 0))).toBe(false);
    expect(conflicts(car('S', 'right', 0), car('N', 'left', 0))).toBe(true);
    expect(conflicts(car('S', 'right', 0), car('N', 'right', 0))).toBe(false);
  });
  it('paths start before the box and run through it', () => {
    const p = buildPath('S', 'left');
    const a = p.at(p.enter), b = p.at(p.leave);
    expect(Math.abs(a.x - 2)).toBeLessThan(.3); expect(a.z).toBeCloseTo(4, 0);
    expect(b.x).toBeCloseTo(-4, 0); expect(b.z).toBeCloseTo(-2, 0); expect(p.leave).toBeGreaterThan(p.enter + 8);
  });
  it('every generated scenario has an answer at every step', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 120; s++) {
      const sc = makeScenario(s);
      expect(fullOrder(sc.cars)).not.toBeNull();
      expect(sc.cars.length).toBeGreaterThanOrEqual(2);
      sc.cars.forEach(c => expect(sc.layout.legs).toContain(exitLeg(c.from, c.move)));
      sc.cars.forEach(c => expect(sc.layout.legs).toContain(c.from));
      sc.cars.filter(c => c.rank >= 0).forEach(c => expect(sc.layout.stops).toContain(c.from));
      seen.add(KIND_OF(sc));
    }
    expect(seen.size).toBe(4);
  });
  it('rounds vary', () => { expect(new Set(makeRound(5).map(s => s.id)).size).toBe(10); });
});
