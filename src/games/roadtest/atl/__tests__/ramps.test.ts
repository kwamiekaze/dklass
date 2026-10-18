import { describe, expect, it } from 'vitest';
import { AtlSim } from '../sim';
import { ACC, ACC_TOTAL, EXIT, accStrip, exitStrip, roadEdge, stripSpan } from '../ramps';
import { getAtlStage } from '../stages';
import { layoutFor, LANE } from '../layout';

const sfx = new Proxy({}, { get: () => () => {} }) as never;
const lay = layoutFor(getAtlStage('atl-i20-west'));
const edge = roadEdge(lay);

describe('ramp shapes', () => {
  it('an exit grows out of the road edge, then peels away with a widening paved gore', () => {
    expect(exitStrip(lay, -EXIT.pre - 1)).toBeNull();
    expect(exitStrip(lay, -EXIT.pre)!.w).toBeCloseTo(0, 5);
    let prev = 0;
    for (let dd = -EXIT.pre; dd <= 0; dd += 5) { const s = exitStrip(lay, dd)!; expect(s.l).toBeCloseTo(edge, 5); expect(s.w).toBeGreaterThanOrEqual(prev - 1e-9); prev = s.w; }
    expect(exitStrip(lay, 0)!.w).toBeCloseTo(LANE, 5);
    let gap = 0;
    for (let dd = 0; dd <= EXIT.len; dd += 5) { const s = exitStrip(lay, dd)!; expect(s.w).toBeCloseTo(LANE, 5); expect(s.gap).toBeGreaterThanOrEqual(gap - 1e-9); gap = s.gap; }
    expect(gap).toBeCloseTo(EXIT.off * 0.99, 0);
  });
  it('an on-ramp bends in, runs parallel, then its lane is squeezed to nothing', () => {
    expect(accStrip(lay, -ACC_TOTAL - 1)).toBeNull();
    expect(accStrip(lay, -ACC_TOTAL)!.gap).toBeCloseTo(ACC.off, 5);
    let gap = ACC.off + 1;
    for (let dd = -ACC_TOTAL; dd <= -ACC.par; dd += 3) { const s = accStrip(lay, dd)!; expect(s.gap).toBeLessThanOrEqual(gap + 1e-9); gap = s.gap; }
    for (let dd = -ACC.par; dd <= 0; dd += 5) { const s = accStrip(lay, dd)!; expect(s.gap).toBe(0); expect(s.l).toBeCloseTo(edge, 5); expect(s.w).toBeCloseTo(LANE, 5); }
    let w = LANE + 1;
    for (let dd = 0; dd <= ACC.taper; dd += 2) { const s = accStrip(lay, dd)!; expect(s.w).toBeLessThanOrEqual(w + 1e-9); w = s.w; }
    expect(accStrip(lay, ACC.taper)!.w).toBeCloseTo(0, 5);
  });
  it('a car may stand on a ramp lane but not in the gore between ramp and road', () => {
    const s = accStrip(lay, -ACC_TOTAL + 10)!, span = stripSpan(s)!;
    expect(span[0]).toBeGreaterThan(edge + s.gap - 0.01);
    expect(span[0]).toBeGreaterThan(edge + 5);
    expect(stripSpan(accStrip(lay, ACC.taper))).toBeNull();
  });
});

describe('merging', () => {
  it('a driver who starts on the ramp can signal, slide over and join the road with no strike and no edge line', () => {
    const sim = new AtlSim('atl-onramp-i20', 'easy' as never, sfx, 'clear');
    const xr = sim.lay.xs[sim.lay.xs.length - 1]!;
    expect(sim.x).toBeGreaterThan(xr + 2);
    const keys: string[] = []; let merged = false;
    for (let i = 0; i < 30 * 40 && !sim.finished; i++) {
      const T = sim.traveled;
      if (T > 150 && i % 30 === 0) sim.setSignal(-1);
      const left = T > 150 && sim.x > xr - 0.2;
      sim.step(1 / 30, { gas: sim.mph < 50, brake: sim.mph > 56, left, right: false });
      for (const e of sim.drain()) if ('label' in (e as object)) keys.push(String((e as { label?: string }).label));
      if (sim.x < xr + 0.3 && T > 150) merged = true;
    }
    expect(merged).toBe(true);
    expect(keys.some((k) => /EDGE LINE/.test(k))).toBe(false);
  });
  it('the ramp lane is open at the start and gone after the taper', () => {
    const sim = new AtlSim('atl-onramp-i20', 'easy' as never, sfx, 'clear');
    const on = (x: number) => (sim as unknown as { onRampLane: (x: number) => boolean }).onRampLane(x);
    const xr = sim.lay.xs[sim.lay.xs.length - 1]!;
    sim.step(1 / 30, { gas: false, brake: false, left: false, right: false });
    expect(on(sim.x)).toBe(true);
    sim.traveled = 880;
    sim.step(1 / 30, { gas: false, brake: false, left: false, right: false });
    expect(on(xr + 2.5)).toBe(false);
  });
});
