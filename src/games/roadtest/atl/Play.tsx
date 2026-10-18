import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Difficulty, LevelResult } from '../game/types';
import { AtlGame, makeAtlHandle, resolveRun, useAtlScene, type AtlHandle } from './Game';
import { FREE_ID, freeLeg, getFreeStart, nextLegId } from './freeroam';
import { KINDS, type WeatherKind } from '../g3d/atmo';
import { loadConditions } from '../g3d/conditions';
import type { TimeOfDay } from '../g3d/themes';
import { ScoreTracker } from '../game/scoring';
import type { LegEnd } from './sim';

/** Mounts one Atlanta run and hands its controls up to the page (pause, finish early). Loaded on demand, so the other lessons never pay for it. */
export default function AtlPlay({ levelId, difficulty, onHandle, onComplete, onLost }: { levelId: string; difficulty: Difficulty; onHandle: (h: AtlHandle) => void; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  if (levelId === FREE_ID) return <FreeRoam difficulty={difficulty} onHandle={onHandle} onComplete={onComplete} onLost={onLost} />;
  return <SingleRun levelId={levelId} difficulty={difficulty} onHandle={onHandle} onComplete={onComplete} onLost={onLost} />;
}

function SingleRun({ levelId, difficulty, onHandle, onComplete, onLost }: { levelId: string; difficulty: Difficulty; onHandle: (h: AtlHandle) => void; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const handle = useAtlScene(levelId, difficulty);
  useEffect(() => { onHandle(handle); }, [handle, onHandle]);
  return <AtlGame handle={handle} onComplete={onComplete} onLost={onLost} />;
}

const CYCLE: TimeOfDay[] = ['day', 'day', 'golden', 'dusk', 'night', 'night', 'day'];
interface Leg { id: string; n: number; mph: number; strikes: number; miles: number }

/**
 * Free roam: the drive never ends until you quit or crash three times. Each leg is one stretch of real road (see freeroam.ts); taking an exit or a turn,
 * or reaching the end of the stretch, builds the next one. The score, strikes and speed carry over, the weather changes now and then and the day wears on.
 */
function FreeRoam({ difficulty, onHandle, onComplete, onLost }: { difficulty: Difficulty; onHandle: (h: AtlHandle) => void; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const tracker = useMemo(() => new ScoreTracker(), []);
  const wx = useRef<WeatherKind>('clear');
  const [leg, setLeg] = useState<Leg>(() => ({ id: freeLeg(getFreeStart()).id, n: 0, mph: 0, strikes: 0, miles: 0 }));
  const [fade, setFade] = useState(false);
  const busy = useRef(false);
  const handle = useMemo(() => {
    freeLeg(leg.id);
    const r = resolveRun(leg.id), c = loadConditions();
    // weather: the player's own pick wins, otherwise a new roll every third road. Time: their pick wins, otherwise the day wears on.
    if (leg.n % 3 === 0 || (KINDS as string[]).includes(c.weather as string)) wx.current = r.weather;
    const fixedTime = (['day', 'golden', 'dusk', 'night', 'sunset'] as string[]).includes(c.time as string);
    const tod: TimeOfDay | undefined = fixedTime ? r.tod : CYCLE[leg.n % CYCLE.length];
    return makeAtlHandle(leg.id, difficulty, { weather: wx.current, tod }, { free: true, tracker, startMph: leg.mph, strikes: leg.strikes, levelId: 'atl-free', levelName: 'Free Roam', seed: `:${leg.n}`, legNo: leg.n, miles: leg.miles, cont: leg.n > 0 });
  }, [leg, difficulty, tracker]);
  const hRef = useRef(handle); hRef.current = handle;
  useEffect(() => { onHandle(handle); }, [handle, onHandle]);
  const onLeg = useCallback((e: LegEnd) => {
    if (busy.current) return; busy.current = true;
    setFade(true);
    window.setTimeout(() => {
      const h = hRef.current, sim = h.sim;
      if (sim.finished) { busy.current = false; return; }
      const to = freeLeg(nextLegId(sim.stage, e.to)).id;
      const clean = sim.strikes <= (sim.strikes0);
      setLeg((p) => ({ id: to, n: p.n + 1, mph: Math.max(8, sim.mph), strikes: clean ? Math.max(0, sim.strikes - 1) : sim.strikes, miles: p.miles + sim.traveled / 1609 }));
      busy.current = false;
      window.setTimeout(() => setFade(false), 180);
    }, 340);
  }, []);
  return <AtlGame handle={handle} onComplete={onComplete} onLost={onLost} onLeg={onLeg} fade={fade} />;
}
