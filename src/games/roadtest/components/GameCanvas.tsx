import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { DrivingScene, GAME_W, GAME_H } from '../game/DrivingScene';
import { GAME_EVENTS, type Difficulty, type LevelResult } from '../game/types';
import { resetTouchControls } from '../game/controls';
import { sound } from '../sound';
import { TouchControls } from './TouchControls';
import { FeedbackModal } from './FeedbackModal';
import { Game3D } from '../g3d/Game3D';
import { useGameScene, type SceneHandle } from '../g3d/GameScene';

/** The 3D game needs WebGL. Anything that cannot give it (or a visitor who adds ?engine=2d) plays the original 2D game instead. */
function canUse3D(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('engine') === '2d') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

/** Mounts one 3D run and hands its controls up to the page (pause, finish early). */
function Play3D({ levelId, difficulty, onHandle, onComplete, onLost }: { levelId: string; difficulty: Difficulty; onHandle: (h: SceneHandle) => void; onComplete: (r: LevelResult) => void; onLost: () => void }) {
  const handle = useGameScene(levelId, difficulty);
  useEffect(() => { onHandle(handle); }, [handle, onHandle]);
  return <Game3D handle={handle} onComplete={onComplete} onLost={onLost} />;
}

interface Props {
  levelId: string;
  difficulty: Difficulty;
  onComplete: (result: LevelResult) => void;
  onQuit: () => void;
}

const FIRST_RUN_TOAST_KEY = 'dk-game-first-run-toast';

export function GameCanvas({ levelId, difficulty, onComplete, onQuit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const wakeLockRef = useRef<any>(null);
  const [showQuitPrompt, setShowQuitPrompt] = useState(false);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [use3d, setUse3d] = useState(canUse3D);
  const handle3d = useRef<SceneHandle | null>(null);
  const setHandle = useCallback((h: SceneHandle) => { handle3d.current = h; }, []);
  const goFlat = useCallback(() => { handle3d.current = null; setUse3d(false); }, []);

  // Show a one-time "sound on" toast on the very first run per device.
  useEffect(() => {
    try {
      if (!localStorage.getItem(FIRST_RUN_TOAST_KEY)) {
        localStorage.setItem(FIRST_RUN_TOAST_KEY, '1');
        setShowToast(true);
        const t = setTimeout(() => setShowToast(false), 3000);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  // Request a screen wake lock so phones don't dim mid-lesson.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wl = (navigator as any).wakeLock;
        if (wl?.request) {
          const lock = await wl.request('screen');
          if (cancelled) { try { await lock.release(); } catch { /* ignore */ } return; }
          wakeLockRef.current = lock;
        }
      } catch { /* unsupported — skip */ }
    })();
    const onVis = async () => {
      // Re-acquire on return (browsers auto-release on hide).
      if (document.visibilityState === 'visible' && !wakeLockRef.current) {
        try {
          const wl = (navigator as any).wakeLock;
          if (wl?.request) wakeLockRef.current = await wl.request('screen');
        } catch { /* ignore */ }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      try { wakeLockRef.current?.release?.(); } catch { /* ignore */ }
      wakeLockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (use3d) { resetTouchControls(); return () => resetTouchControls(); }
    if (!hostRef.current) return;
    resetTouchControls();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: GAME_W,
      height: GAME_H,
      backgroundColor: '#2e2e33',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [],
    });
    gameRef.current = game;
    game.scene.add('driving', DrivingScene, true, { levelId, difficulty });

    const handler = (result: LevelResult) => onCompleteRef.current(result);
    game.events.on(GAME_EVENTS.LEVEL_COMPLETE, handler);

    return () => {
      game.events.off(GAME_EVENTS.LEVEL_COMPLETE, handler);
      game.destroy(true);
      gameRef.current = null;
      resetTouchControls();
    };
  }, [levelId, difficulty, use3d]);

  // Auto-pause on tab hide (single-player). Countdown 3-2-1 on resume.
  useEffect(() => {
    const onVis = () => {
      if (handle3d.current) {
        if (document.visibilityState === 'hidden' && !handle3d.current.sim.finished) { handle3d.current.paused.current = true; resetTouchControls(); setPaused(true); }
        return;
      }
      const scene = gameRef.current?.scene.getScene('driving') as Phaser.Scene | undefined;
      if (!scene) return;
      if (document.visibilityState === 'hidden') {
        try { scene.scene.pause(); } catch { /* ignore */ }
        resetTouchControls();
        setPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const resumeFromPause = () => {
    if (countdown !== null) return;
    sound.ensureRunning();
    setCountdown(3);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (handle3d.current) handle3d.current.paused.current = false;
      const scene = gameRef.current?.scene.getScene('driving') as Phaser.Scene | undefined;
      try { scene?.scene.resume(); } catch { /* ignore */ }
      setPaused(false);
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800);
    return () => clearTimeout(t);
  }, [countdown]);

  const saveAndQuit = () => {
    if (handle3d.current) {
      setShowQuitPrompt(false);
      handle3d.current.paused.current = false;
      handle3d.current.sim.endEarly();
      return;
    }
    const scene = gameRef.current?.scene.getScene('driving') as DrivingScene | undefined;
    if (scene?.endEarly) {
      setShowQuitPrompt(false);
      try { scene.scene.resume(); } catch { /* ignore */ }
      scene.endEarly();
    } else {
      onQuit();
    }
  };

  return (
    <div className={`game-wrap${use3d ? ' rt3d-on' : ''}`}>
      <div className="game-topbar">
        <button
          className="dk-btn dk-btn-ghost dk-btn-small"
          onClick={() => { if (handle3d.current) handle3d.current.paused.current = true; setShowQuitPrompt(true); }}
        >
          ← Quit lesson
        </button>
        <span className="game-topbar-hint">↑ gas · ↓ brake · ←→ steer</span>
        <button
          className="dk-btn dk-btn-gold-outline dk-btn-small"
          onClick={() => setShowFeedback(true)}
          aria-label="Send feedback"
        >
          ★ Feedback
        </button>
      </div>
      {use3d
        ? <div className="game-host rt3d-host">
            <Play3D levelId={levelId} difficulty={difficulty} onHandle={setHandle} onComplete={(r) => onCompleteRef.current(r)} onLost={goFlat} />
          </div>
        : <div ref={hostRef} className="game-host" />}
      <TouchControls />

      {showToast && (
        <div className="dk-first-toast" role="status">
          🔊 Sound on — tap the speaker to mute
        </div>
      )}

      {paused && (
        <div
          className="dk-pause-overlay"
          role="dialog"
          aria-label="Paused"
          onPointerDown={resumeFromPause}
          onClick={resumeFromPause}
        >
          {countdown === null ? (
            <div>
              <h2>PAUSED</h2>
              <p>Tap anywhere to continue</p>
            </div>
          ) : (
            <div className="dk-pause-count">{countdown === 0 ? 'GO!' : countdown}</div>
          )}
        </div>
      )}

      {showQuitPrompt && (
        <div className="dk-modal-backdrop" onClick={() => { if (handle3d.current) handle3d.current.paused.current = false; setShowQuitPrompt(false); }}>
          <div className="dk-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <h2 style={{ marginTop: 0 }}>Quit lesson?</h2>
            <p style={{ opacity: 0.85 }}>
              End the run now and save your score to the leaderboard, or discard and go back to the menu.
            </p>
            <div className="btn-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <button className="dk-btn dk-btn-ghost" onClick={() => { if (handle3d.current) handle3d.current.paused.current = false; setShowQuitPrompt(false); }}>
                Keep Playing
              </button>
              <button className="dk-btn dk-btn-outline" onClick={onQuit}>
                Discard & Quit
              </button>
              <button className="dk-btn dk-btn-gold" onClick={saveAndQuit}>
                Save Score & Quit
              </button>
            </div>
          </div>
        </div>
      )}

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}
