import { useCallback, useEffect, useRef, useState } from 'react';
import { StartScreen } from './components/StartScreen';
import { HowToPlay } from './components/HowToPlay';
import { GameCanvas } from './components/GameCanvas';
import { ReportCard } from './components/ReportCard';
import { LeaderboardModal } from './components/LeaderboardModal';
import { PublicLeaderboardModal } from './components/PublicLeaderboardModal';
import { BadgeCabinet } from './components/BadgeCabinet';
import { PlayerNamePrompt } from './components/PlayerNamePrompt';
import { MultiplayerRoot } from './multiplayer/MultiplayerRoot';
import { GuestScoreModal } from './GuestScoreModal';
import { UsernameModal } from './UsernameModal';
import { MyStatsModal } from './MyStatsModal';
import { AudioSettingsButton } from './components/AudioSettingsButton';
import { SiteHeader } from './components/SiteHeader';
import { submitScore } from './submitScore';
import { submitLeaderboard } from './submitLeaderboard';
import { getPlayerName } from './playerName';
import { LEVELS } from './game/levels';
import { getDailyChallenge, todayKey } from './game/dailyChallenge';
import { processRunResult, type RunAftermath } from './runComplete';
import { sound } from './sound';
import { lovable } from '@/integrations/lovable';
import type { Difficulty, LevelResult } from './game/types';
import './roadtest.css';

type Screen = 'menu' | 'playing' | 'report' | 'multiplayer';
const DIFF_KEY = 'dk-game-difficulty';

interface RoadTestGameProps {
  publicMode?: boolean;
}


/** Only game canvas + touch pedals get preventDefault. Everything else (buttons,
 *  menus, modals) keeps native tap → click synthesis on iOS. */
const GAME_SURFACE_SELECTOR = 'canvas, .game-host, .touch-controls';

export default function RoadTestGame({ publicMode }: RoadTestGameProps = {}) {
  const [screen, setScreen] = useState<Screen>('menu');
  const [levelId, setLevelId] = useState('parking-lot');
  const [difficulty, setDifficultyState] = useState<Difficulty>('learner');
  const [dailyRun, setDailyRun] = useState(false);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [aftermath, setAftermath] = useState<RunAftermath | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showPublicLb, setShowPublicLb] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showMyStats, setShowMyStats] = useState(false);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState<{ mode: 'daily' | 'endless'; result: LevelResult } | null>(null);
  const [bestScores, setBestScores] = useState<Record<string, number>>({});
  const [guestPromptResult, setGuestPromptResult] = useState<LevelResult | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);


  // Non-passive touchstart: only preventDefault on the actual game surfaces so
  // iOS still synthesizes click events for buttons/menus/modals.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      sound.ensureRunning();
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(GAME_SURFACE_SELECTOR) && e.cancelable) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchstart', handler, { passive: false });
    const pd = () => sound.ensureRunning();
    el.addEventListener('pointerdown', pd);
    return () => {
      el.removeEventListener('touchstart', handler);
      el.removeEventListener('pointerdown', pd);
    };
  }, []);

  useEffect(() => {
    try {
      const d = localStorage.getItem(DIFF_KEY) as Difficulty | null;
      if (d) setDifficultyState(d);
    } catch { /* ignore */ }
  }, []);

  const setDifficulty = useCallback((d: Difficulty) => {
    setDifficultyState(d);
    try { localStorage.setItem(DIFF_KEY, d); } catch { /* ignore */ }
  }, []);

  const start = useCallback((id: string, opts: { daily?: boolean } = {}) => {
    setLevelId(id);
    setDailyRun(!!opts.daily);
    if (opts.daily) {
      const ch = getDailyChallenge();
      if (ch.difficulty !== difficulty) {
        setDifficultyState(ch.difficulty);
        try { localStorage.setItem(DIFF_KEY, ch.difficulty); } catch { /* ignore */ }
      }
    }
    setScreen('playing');
  }, [difficulty]);

  const handleComplete = useCallback((r: LevelResult) => {
    setBestScores((prev) => ({ ...prev, [r.levelId]: Math.max(prev[r.levelId] ?? 0, r.score) }));
    // the report card must always come up, even if saving the run is slow or fails
    setResult(r);
    setScreen('report');
    try { setAftermath(processRunResult(r)); } catch (e) { console.error(e); }

    // Public leaderboard submission for endless mode + daily challenge.
    const level = LEVELS.find((l) => l.id === r.levelId);
    const isEndless = !!level?.endless;
    if ((dailyRun || isEndless) && r.score > 0) {
      const cachedName = getPlayerName();
      if (cachedName) {
        submitLeaderboard({
          mode: dailyRun ? 'daily' : 'endless',
          levelId: r.levelId,
          score: r.score,
          playerName: cachedName,
          day: dailyRun ? todayKey() : null,
        });
      } else {
        setShowNamePrompt({ mode: dailyRun ? 'daily' : 'endless', result: r });
      }
    }

    submitScore(r)
      .then(({ isNewBest, previousBest, isGuest, needsUsername }) => {
        setResult({ ...r, isNewBest, previousBest: previousBest ?? undefined });
        if (isGuest) setGuestPromptResult(r);
        else if (needsUsername) setShowUsernamePrompt(true);
      })
      .catch((err) => {
        console.error(err);
        setResult(r);
      });
    setScreen('report');
  }, [dailyRun]);

  const signInWithGoogle = useCallback(async () => {
    try {
      await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin + '/play' });
    } catch (e) { console.error(e); }
  }, []);


  const [trackToast, setTrackToast] = useState<string | null>(null);
  useEffect(() => {
    const off = sound.onTrackChange((_id, label) => {
      setTrackToast(label);
      window.setTimeout(() => setTrackToast((cur) => (cur === label ? null : cur)), 2500);
    });
    return () => { off(); };
  }, []);

  // Menu music — start Showroom on the menu screen. Multiplayer/gameplay
  // screens set their own tracks via their scenes.
  useEffect(() => {
    if (screen !== 'menu') return;
    sound.init();
    if (!sound.muted && !sound.musicMuted) sound.playTrack('showroom');
  }, [screen]);

  return (
    <div className="dk-game" ref={rootRef}>
      {screen !== 'playing' && <SiteHeader />}
      {screen !== 'playing' && <div className="rt-audio-float"><AudioSettingsButton /></div>}
      {trackToast && (
        <div className="dk-track-toast" role="status">♪ {trackToast}</div>
      )}
      <div className="app-shell">
        {screen === 'menu' && (
          <StartScreen
            bestScores={bestScores}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onStart={(id) => start(id)}
            onStartDaily={(id) => start(id, { daily: true })}
            onHowToPlay={() => setShowHowTo(true)}
            onLeaderboard={() => setShowLeaderboard(true)}
            onPublicLeaderboard={() => setShowPublicLb(true)}
            onBadgeCabinet={() => setShowBadges(true)}
            onMultiplayer={() => setScreen('multiplayer')}
            onMyStats={() => setShowMyStats(true)}
            onSignInPrompt={signInWithGoogle}
            publicMode={publicMode}
          />
        )}

        {screen === 'multiplayer' && (
          <MultiplayerRoot onExit={() => setScreen('menu')} />
        )}

        {screen === 'playing' && (
          <GameCanvas
            levelId={levelId}
            difficulty={difficulty}
            onComplete={handleComplete}
            onQuit={() => setScreen('menu')}
          />
        )}

        {screen === 'report' && result && (
          <ReportCard
            result={result}
            aftermath={aftermath}
            onRetry={() => start(result.levelId, { daily: dailyRun })}
            onNext={(nextId) => start(nextId)}
            onMenu={() => setScreen('menu')}
          />
        )}

        {showHowTo && <HowToPlay onClose={() => setShowHowTo(false)} />}
        {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
        {showPublicLb && <PublicLeaderboardModal onClose={() => setShowPublicLb(false)} />}
        {showBadges && <BadgeCabinet onClose={() => setShowBadges(false)} />}
        {showMyStats && <MyStatsModal onClose={() => setShowMyStats(false)} />}
        {showUsernamePrompt && (
          <UsernameModal
            onDone={() => setShowUsernamePrompt(false)}
            onSkip={() => setShowUsernamePrompt(false)}
          />
        )}
        {guestPromptResult && (
          <GuestScoreModal
            result={guestPromptResult}
            onDone={() => setGuestPromptResult(null)}
            onSkip={() => setGuestPromptResult(null)}
          />
        )}
        {showNamePrompt && (
          <PlayerNamePrompt
            title={showNamePrompt.mode === 'daily' ? 'Post your Daily Challenge score' : 'Post your Endless score'}
            onClose={() => setShowNamePrompt(null)}
            onSave={(name) => {
              const p = showNamePrompt;
              setShowNamePrompt(null);
              submitLeaderboard({
                mode: p.mode,
                levelId: p.result.levelId,
                score: p.result.score,
                playerName: name,
                day: p.mode === 'daily' ? todayKey() : null,
              });
            }}
          />
        )}

      </div>
    </div>
  );
}
