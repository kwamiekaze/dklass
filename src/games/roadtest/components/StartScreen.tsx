import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LEVELS } from '../game/levels';
import { ATL_STAGES, PHASES } from '../atl/stages';
import { FREE_ID, FREE_STARTS, getFreeStart, setFreeStart } from '../atl/freeroam';
import { SKILL_LABELS, computeRadarData, SKILL_KEYS, type ReportCardRatings } from '@/lib/reportCardGraphData';
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

  useEffect(() => {
    // Auto-show the install tutorial once for mobile browsers where the
    // browser chrome can hide the on-screen game controls.
    if (shouldAutoShowInstallTutorial()) {
      const t = setTimeout(() => setShowInstall(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const [weak, setWeak] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setSignedIn(false);
        setStreak(guestStreak());
        return;
      }
      setSignedIn(true);
      // the student's own report cards decide which Atlanta stages get a "recommended" tag
      try {
        let sid: string = data.user.id;
        try { const { data: canon } = await supabase.rpc('canonical_user_id', { _uid: sid }); if (typeof canon === 'string' && canon) sid = canon; } catch { /* keep own id */ }
        const { data: rc } = await supabase.from('report_cards').select(`id, created_at, overall, ${SKILL_KEYS.join(', ')}`).eq('student_id', sid).eq('report_card_status', 'completed').order('created_at', { ascending: true });
        const rows = (rc || []) as unknown as ReportCardRatings[];
        if (rows.length) {
          const rated = computeRadarData(rows).filter((r) => r.average > 0).sort((a, b) => a.average - b.average);
          setWeak(rated.filter((r) => r.average < 8.5).slice(0, 4).map((r) => r.skill));
        }
      } catch { /* the path works without report cards */ }
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
  const atlGroups = PHASES.map((ph) => ({ title: ph.title, note: ph.note, items: ATL_STAGES.filter((x) => x.phase === ph.n) }));
  const recommended = ATL_STAGES.filter((x) => (x.skills ?? []).some((k) => weak.includes(k)));
  const nextUp = ATL_STAGES.find((x) => !bestScores[x.id]);
  const weakLabels = weak.map((k) => SKILL_LABELS[k] ?? k);
  const [freePick, setFreePick] = useState(getFreeStart());
  const startLevel = (id: string) => { clickTick(); onStart(id); };


  return (
    <div className="screen start-screen">

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
            <p>The real roads of Georgia: the Downtown Connector, I-285, I-20, Carrollton 30117 and the streets around Metro Atlanta. Learn to signal, merge, keep your distance and cross the tracks the right way. It starts quiet and gets harder phase by phase, with rougher weather as you go.</p>
          </div>
        </div>
        {weak.length > 0 && (
          <div className="atl-rec">
            <b>Picked from your report cards</b>
            <span>Your focus skills: {weakLabels.join(', ')}. Stages marked <em>FOR YOU</em> practice them.</span>
          </div>
        )}
        <div className="atl-group atl-free cr-open">
          <h3>Carrollton Open World<small>NEW · the real map · drive anywhere · every rule applies</small></h3>
          <p className="atl-free-note">The whole town of Carrollton, Georgia, built from the real street map: Adamson Square, Bradley Street, Newnan Street, the railroad, every stop sign and traffic light. Drive wherever you like, take trips with GPS, stop for people in the crosswalks and for the train. Day turns to night as you drive.</p>
          <div className="atl-free-starts" role="group" aria-label="Open world">
            <button className="atl-card atl-free-card next" onClick={() => startLevel('atl-carrollton-open')}>
              <span className="atl-lim"><small>OPEN</small><b>GO</b></span>
              <span className="atl-info"><strong>Carrollton, GA</strong><small>Free drive · trips · day and night · real traffic</small></span>
              <span className="atl-best">{bestScores['atl-carrollton-open'] ? `Best ${bestScores['atl-carrollton-open']}` : 'Drive →'}</span>
            </button>
          </div>
        </div>
        <div className="atl-group atl-free">
          <h3>Free Roam<small>Endless · real Atlanta roads · exits, merges and left turns</small></h3>
          <p className="atl-free-note">No finish line. Take any exit, turn at any cross street, merge from the ramps and keep going. The real exit numbers and street names are on the signs. Three crashes ends the drive; a clean road drops one strike.</p>
          <div className="atl-free-starts" role="group" aria-label="Where to start">
            {FREE_STARTS.map((f) => (
              <button key={f.id} className={`atl-card atl-free-card${freePick === f.id ? ' next' : ''}`} onClick={() => { setFreeStart(f.id); setFreePick(f.id); startLevel(FREE_ID); }}>
                <span className="atl-lim"><small>START</small><b>GO</b></span>
                <span className="atl-info"><strong>{f.title}</strong><small>{f.sub}</small></span>
                <span className="atl-best">{bestScores[FREE_ID] ? `Best ${bestScores[FREE_ID]}` : 'Drive →'}</span>
              </button>
            ))}
          </div>
        </div>
        {atlGroups.map((g) => (
          <div className="atl-group" key={g.title}>
            <h3>{g.title}<small>{g.note}</small></h3>
            {g.items.map((st) => {
              const mine = (st.skills ?? []).filter((k) => weak.includes(k));
              return (
                <button key={st.id} className={`atl-card${mine.length ? ' rec' : ''}${nextUp?.id === st.id ? ' next' : ''}`} onClick={() => startLevel(st.id)}>
                  <span className="atl-lim"><small>LIMIT</small><b>{st.limit}</b></span>
                  <span className="atl-info">
                    <strong>{st.name}{nextUp?.id === st.id && <i className="atl-tag next">NEXT UP</i>}{mine.length > 0 && <i className="atl-tag rec">FOR YOU</i>}</strong>
                    <small>{st.subtitle}</small>
                    <em>{st.roadName}{st.weather ? ` · ${st.weather.toUpperCase()}` : ''}</em>
                    <span className="atl-skills">{(st.skills ?? []).slice(0, 3).map((k) => <u key={k} className={weak.includes(k) ? 'w' : ''}>{SKILL_LABELS[k] ?? k}</u>)}</span>
                  </span>
                  <span className="atl-best">{bestScores[st.id] ? `Best ${bestScores[st.id]}` : 'Drive →'}</span>
                </button>
              );
            })}
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
