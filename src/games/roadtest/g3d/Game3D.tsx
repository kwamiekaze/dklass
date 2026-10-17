import { useEffect, useRef, useState } from 'react';
import { pickTrackForLevel, sound } from '../sound';
import type { LevelResult } from '../game/types';
import { GameScene, type SceneHandle } from './GameScene';
import { Hud } from './Hud';
import { addLifetimeStars, selectedCar } from './garage';
import './g3d.css';

/** The 3D Road Test Challenge: the scene, the HUD, the sound and the loading screen around one run. */
export function Game3D({ handle, onComplete, onLost }: { handle: SceneHandle; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const [ready, setReady] = useState(false);
  const [carId] = useState(() => selectedCar().id);
  const done = useRef(onComplete);
  done.current = onComplete;

  // development only: the browser console and the screenshot scripts can reach the run
  useEffect(() => { if (import.meta.env.DEV) { (window as unknown as { __rt?: SceneHandle }).__rt = handle; return () => { delete (window as unknown as { __rt?: SceneHandle }).__rt; }; } }, [handle]);

  // sound: the START tap unlocked audio; begin the engine and the lesson's track, like the 2D game did
  useEffect(() => {
    const lvl = handle.sim.level;
    const track = pickTrackForLevel(lvl);
    sound.init(); sound.startEngine();
    if (!sound.muted && !sound.musicMuted) sound.playTrack(track);
    const unlock = () => {
      sound.init();
      if (sound.isReady()) { sound.startEngine(); if (!sound.muted && !sound.musicMuted) sound.playTrack(track); }
    };
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => { window.removeEventListener('keydown', unlock); window.removeEventListener('pointerdown', unlock); sound.stopEngine(); sound.stopMusic(); };
  }, [handle]);

  // a tap or a key during the countdown skips the rest of it
  useEffect(() => {
    const skip = () => { handle.skip.current = true; };
    window.addEventListener('keydown', skip); window.addEventListener('pointerdown', skip);
    return () => { window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
  }, [handle]);

  return <div className="rt3d-root">
    <GameScene
      handle={handle}
      carId={carId}
      onReady={() => setReady(true)}
      onLost={onLost}
      onComplete={(r) => { addLifetimeStars(handle.sim.tracker.starsCollected); done.current(r); }}
    />
    <Hud handle={handle} />
    <div className={`rt3d-loading${ready ? ' done' : ''}`} aria-hidden={ready}>
      <div className="rt3d-spin" />
      <h3>{handle.sim.level.name}</h3>
      <p>Warming up the car…</p>
    </div>
  </div>;
}
