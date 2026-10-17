import { useEffect } from 'react';
import type { Difficulty, LevelResult } from '../game/types';
import { AtlGame, useAtlScene, type AtlHandle } from './Game';

/** Mounts one Atlanta run and hands its controls up to the page (pause, finish early). Loaded on demand, so the other lessons never pay for it. */
export default function AtlPlay({ levelId, difficulty, onHandle, onComplete, onLost }: { levelId: string; difficulty: Difficulty; onHandle: (h: AtlHandle) => void; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const handle = useAtlScene(levelId, difficulty);
  useEffect(() => { onHandle(handle); }, [handle, onHandle]);
  return <AtlGame handle={handle} onComplete={onComplete} onLost={onLost} />;
}
