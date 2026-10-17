import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { LEVELS } from '../game/levels';
import { ATL_STAGES } from '../atl/stages';
import '../atl/atl.css';
import { DIFFICULTIES, type Difficulty } from '../game/types';
import { sound } from '../sound';
import { InstallTutorial, shouldAutoShowInstallTutorial } from './InstallTutorial';
import { FeedbackModal } from './FeedbackModal';
import { DailyChallengeCard } from './DailyChallengeCard';
import { RankBar } from './RankBar';
import { MissionsPanel } from './MissionsPanel';
import { GaragePicker, ConditionsPicker } from './GaragePicker';

interface Props {
  bestScores: Record<string, number>;
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onStart: (levelId: string) => void;
  onStartDaily?: (levelId: string) => void;
  onHowToPlay: () => void;
  onLeaderboard: () => void;
  onPublicLeaderboard?: () => void;
  onBadgeCabinet?: () => void;
  onMultiplayer: () => void;
  onMyStats?: () => void;
  onSignInPrompt?: () => void;
  publicMode?: boolean; // when true, "back" goes to homepage not dashboard
}

const STREAK_KEY = 'dk-game-streak';
const STREAK_DAY_KEY = 'dk-game-streak-day';

function guestStreak(): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastDay = localStorage.getItem(STREAK_DAY_KEY);
    const raw = parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10) || 0;
    if (lastDay === today) return raw;
    let next = 1;
    if (lastDay) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      if (lastDay === yesterday) next = raw + 1;
    }
    localStorage.setItem(STREAK_KEY, String(next));
    localStorage.setItem(STREAK_DAY_KEY, today);
    return next;
  } catch { return 0; }
}

export function StartScreen({ bestScores, difficulty, setDifficulty, onStart, onStartDaily, onHowToPlay, onLeaderboard, onPublicLeaderboard, onBadgeCabinet, onMultiplayer, onMyStats, onSignInPrompt, publicMode }: Props) {
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-show the install tutorial once for mobile browsers where the
    // browser chrome can hide the on-screen game controls.
    if (shouldAutoShowInstallTutorial()) {
      const t = setTimeout(() => setShowInstall(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSignedIn(false);
        setStreak(guestStreak());
        return;
      }
      setSignedIn(true);
      const { data: profile } = await supabase
        .from('profiles')
        .select('current_streak, best_streak, last_played_on')
        .eq('id', data.user.id)
        .maybeSingle();
      // Server truth. If they haven't played today OR yesterday, current is stale — show it anyway; RPC will reset on next run.
      setStreak(profile?.current_streak ?? 0);
      setBestStreak(profile?.best_streak ?? 0);
    })();
  }, []);

  const clickTick = () => { sound.init(); sound.uiTick(); };
  const endless = LEVELS.find((l) => l.endless);
  const lessons = LEVELS.filter((l) => !l.endless && !l.id.startsWith('atl-'));
  const atlGroups = [
    { title: 'Interstates and freeways', note: 'Speed limit 70', items: ATL_STAGES.filter((x) => x.road === 'interstate') },
    { title: 'Carrollton and west Georgia', note: '30117 and neighbors', items: ATL_STAGES.filter((x) => x.road !== 'interstate' && ['carrollton', 'rural', 'villarica', 'douglasville'].includes(x.region)) },
    { title: 'Metro Atlanta streets', note: 'Lights, rail and circles', items: ATL_STAGES.filter((x) => x.road !== 'interstate' && !['carrollton', 'rural', 'villarica', 'douglasville'].includes(x.region)) },
  ];
  const startLevel = (id: string) => { clickTick(); onStart(id); };

  const goHome = async () => {
    clickTick();
    if (publicMode) { navigate('/'); return; }
    const { data } = await supabase.auth.getUser();
    if (!data.user) { navigate('/'); return; }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle();
    const role = roleRow?.role;
    if (role === 'admin') navigate('/admin');
    else if (role === 'instructor') navigate('/instructor');
    else navigate('/student');
  };

  return (
    <div className="screen start-screen">
      <header className="brand-header">
        <button
          type="button"
          onClick={goHome}
          className="brand-mark brand-mark-link"
          aria-label={publicMode ? 'Back to homepage' : 'Go to dashboard'}
        >
          DRIVING<span>KLASS</span>
        </button>
        <div className="brand-stars">★★★★★</div>
      </header>

      <div className="hero-card">
        <img
          src="/assets/drivingklass-hero.webp"
          alt="The gold five-star DrivingKlass training car"
          className="hero-img"
          loading="eager"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
        <div className="hero-overlay">
          <h1>Road Test Challenge</h1>
          <p>Hold your lane. Stop at the signs. Earn a 5-star report card.</p>
          {streak > 0 && (
            <div className="streak-badge">🔥 {streak}-day streak{bestStreak > streak ? ` · best ${bestStreak}` : ''}</div>
          )}
        </div>
      </div>

      <RankBar />

      {onStartDaily && (
        <DailyChallengeCard onStart={(id) => { clickTick(); onStartDaily(id); }} />
      )}

      <MissionsPanel />

      {!signedIn && onSignInPrompt && (
        <button
          className="dk-btn dk-btn-gold"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => { clickTick(); onSignInPrompt(); }}
        >
          Sign in with Google to save your scores & streak
        </button>
      )}

      <section className="difficulty-row" aria-label="Choose difficulty">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.id}
            className={`diff-chip${difficulty === d.id ? ' active' : ''}`}
            onClick={() => { clickTick(); setDifficulty(d.id); }}
          >
            {d.label}
            <small>×{d.scoreMul}</small>
          </button>
        ))}
      </section>

      <GaragePicker />
      <ConditionsPicker />

      {endless && (
        <button className="level-card endless" onClick={() => startLevel(endless.id)}>
          <span className="level-num">∞</span>
          <span className="level-info">
            <strong>{endless.name}</strong>
            <small>{endless.subtitle}</small>
          </span>
          <span className="level-best">
            {bestScores[endless.id] ? `Best ${bestScores[endless.id]}` : 'Start →'}
          </span>
        </button>
      )}

      <section className="atl-menu" aria-label="Atlanta Drive">
        <div className="atl-menu-hero">
          <div className="atl-menu-badge" aria-hidden="true"><b>I</b><i>75 85</i></div>
          <div>
            <h2>Atlanta Drive</h2>
            <p>The real roads of Georgia: the Downtown Connector, I-285, I-20, Carrollton 30117 and the streets around Metro Atlanta. Learn to signal, merge, keep your distance and cross the tracks the right way.</p>
          </div>
        </div>
        {atlGroups.map((g) => (
          <div className="atl-group" key={g.title}>
            <h3>{g.title}<small>{g.note}</small></h3>
            {g.items.map((st) => (
              <button key={st.id} className="atl-card" onClick={() => startLevel(st.id)}>
                <span className="atl-lim"><small>LIMIT</small><b>{st.limit}</b></span>
                <span className="atl-info">
                  <strong>{st.name}</strong>
                  <small>{st.subtitle}</small>
                  <em>{st.roadName}</em>
                </span>
                <span className="atl-best">{bestScores[st.id] ? `Best ${bestScores[st.id]}` : 'Drive →'}</span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section className="level-list" aria-label="Choose a lesson">
        {lessons.map((lvl, i) => (
          <button key={lvl.id} className="level-card" onClick={() => startLevel(lvl.id)}>
            <span className="level-num">{i + 1}</span>
            <span className="level-info">
              <strong>
                {lvl.name}
                {lvl.isNew && <span className="level-new-badge">NEW</span>}
              </strong>
              <small>{lvl.subtitle}</small>
            </span>
            <span className="level-best">
              {bestScores[lvl.id] ? `Best ${bestScores[lvl.id]}` : 'Start →'}
            </span>
          </button>
        ))}
      </section>

      <div className="btn-row">
        <button className="dk-btn dk-btn-gold" onClick={() => startLevel(lessons[0].id)}>Start Lesson</button>
        <button className="dk-btn dk-btn-outline" onClick={() => { clickTick(); onHowToPlay(); }}>How to Play</button>
        <button className="dk-btn dk-btn-outline" onClick={() => { clickTick(); onLeaderboard(); }}>Best · Me</button>
        {onPublicLeaderboard && (
          <button className="dk-btn dk-btn-outline" onClick={() => { clickTick(); onPublicLeaderboard(); }}>🏆 Global</button>
        )}
        {onBadgeCabinet && (
          <button className="dk-btn dk-btn-outline" onClick={() => { clickTick(); onBadgeCabinet(); }}>🏅 Badges</button>
        )}
        {signedIn && onMyStats && (
          <button className="dk-btn dk-btn-outline" onClick={() => { clickTick(); onMyStats(); }}>My Stats</button>
        )}
      </div>

      <button
        className="dk-btn dk-btn-gold mp-cta"
        onClick={() => {
          clickTick();
          if (!signedIn && onSignInPrompt) { onSignInPrompt(); return; }
          onMultiplayer();
        }}
      >
        Multiplayer: Star Rush {!signedIn && '· Sign in required'}
      </button>

      <a className="dk-btn dk-btn-black book-cta" href="https://drivingklass.com" target="_blank" rel="noopener noreferrer">
        Book a Driving Lesson
      </a>

      <button
        className="dk-btn dk-btn-gold-outline"
        style={{ width: '100%', marginTop: 4 }}
        onClick={() => { clickTick(); setShowInstall(true); }}
      >
        📱 Install app / fix hidden buttons
      </button>


      <button
        className="dk-btn dk-btn-gold-outline dk-btn-feedback"
        style={{ width: '100%', marginTop: 4 }}
        onClick={() => { clickTick(); setShowFeedback(true); }}
      >
        ★ Send Feedback
      </button>

      <footer className="fine-print">
        A mini-game by DrivingKlass · Real lessons at drivingklass.com
      </footer>

      {showInstall && <InstallTutorial onClose={() => setShowInstall(false)} />}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}
