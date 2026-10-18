import { describe, expect, it } from 'vitest';
import { AtlSim, DIM } from '../sim';

const sfx = new Proxy({}, { get: () => () => {} }) as never;

describe('speed patrol cruiser', () => {
  it('never drives through other cars while it chases, rides beside you and leaves', () => {
    for (const id of ['atl-i20-west', 'atl-i75-cobb', 'atl-i285-west']) {
      const sim = new AtlSim(id, 'easy' as never, sfx, 'clear', undefined, { seed: 'cop' });
      let overlap = 0, patrol = false;
      for (let i = 0; i < 30 * 80 && !sim.finished; i++) {
        sim.strikes = 0;
        sim.step(1 / 30, { gas: sim.mph < 88, brake: sim.mph > 92, left: false, right: false }); sim.drain();
        const cop = sim.cop; if (!cop) continue; patrol = true;
        const dc = DIM[cop.kind];
        for (const o of sim.vehicles) {
          if (o === cop || o.fly || o.hit || o.dir !== 1) continue;
          const dm = DIM[o.kind];
          if ((dc.l + dm.l) / 2 - Math.abs(o.d - cop.d) > 0.5 && (dc.w + dm.w) / 2 - Math.abs(o.x - cop.x) > 0.3) overlap++;
        }
      }
      expect(patrol, id).toBe(true);
      expect(overlap, id).toBe(0);
    }
  });
});
