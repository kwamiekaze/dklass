import { describe, expect, it } from 'vitest';
import { AtlSim } from '../sim';
import { freeLeg, freeLegIds, legTargets } from '../freeroam';
import { ATL_STAGES } from '../stages';

const sfx = new Proxy({}, { get: () => () => {} }) as never;

describe('free roam graph', () => {
  it('every leg builds and every exit, turn and next link leads to a real leg', () => {
    for (const id of freeLegIds()) {
      const st = freeLeg(`atl-fr-${id}`);
      for (const t of legTargets(st)) expect(() => freeLeg(t), `${st.id} -> ${t}`).not.toThrow();
    }
  });
  it('can be driven: an exit is taken and hands on to its leg', () => {
    const st = freeLeg('atl-fr-con-s');
    const sim = new AtlSim(st.id, 'easy' as never, sfx, 'clear', undefined, { free: true });
    const k = sim.branches.findIndex((b) => b.kind === 'exit');
    const b = sim.branches[k]!, xl = sim.lay.xs[sim.lay.xs.length - 1]!;
    sim.traveled = b.d - 700; sim.mph = 48;
    for (let i = 0; i < 30 * 90 && !sim.leg; i++) {
      const dd = sim.traveled - b.d;
      if (dd > -190 && i % 30 === 0) sim.setSignal(1);
      sim.step(1 / 30, { gas: sim.mph < 48, brake: sim.mph > 56, left: false, right: dd > -170 && sim.x < xl + 3.4 + (dd > 60 ? 4 : 0) - 0.2 });
      sim.drain();
    }
    expect(sim.leg?.kind).toBe('exit');
    expect(sim.leg?.to).toBeTruthy();
  });
  it('the campaign stages still expand their signs and keep real exit numbers', () => {
    const st = ATL_STAGES.find((s) => s.id === 'atl-connector-south')!;
    expect(st.exits?.some((e) => e.no === '247')).toBe(true);
    expect(st.limit).toBe(55);
  });
});
