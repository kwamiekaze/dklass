import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sound } from '../sound';
import { awardXpForRun } from '../game/rank';
import { SIGN_BY_ID } from './signs';
import { LEVELS, RULES, RUSH, TEST_LEN, TEST_PASS, answer, deck, levelFor, multFor, newRush, questionFor, rng, rushStars, timeFor, type Mode, type Outcome, type Question, type RushState } from './engine';
import { loadSaved, store } from './best';
import './signrush.css';

type Phase = 'home' | 'play' | 'reveal' | 'over';
const MODE_NAME: Record<Mode, string> = { rush: 'Sign Rush', signsTest: 'Road Signs Test', rulesTest: 'Road Rules Test' };

const Sign = ({ id, big }: { id: string; big?: boolean }) => <span className={`sr-sign${big ? ' big' : ''}`}>{SIGN_BY_ID[id]?.art}</span>;

export default function SignRush({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('home');
  const [mode, setMode] = useState<Mode>('rush');
  const [saved, setSaved] = useState(loadSaved);
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);
  const [, force] = useState(0);
  const st = useRef<RushState>(newRush());
  const cards = useRef<string[]>([]), at = useRef(0), rand = useRef(rng(1)), seed = useRef(1);
  const t0 = useRef(0), limit = useRef(RUSH.t0), bar = useRef<HTMLSpanElement>(null), raf = useRef(0), locked = useRef(false);
  const [xp, setXp] = useState(0), [newBest, setNewBest] = useState(false);
  const timed = mode === 'rush';
  const root = useRef<HTMLDivElement>(null);
  // every screen of the game starts at its top, clear of the site header
  useEffect(() => { if (phase !== 'reveal') root.current?.scrollIntoView({ block: 'start' }); }, [phase === 'reveal' ? 'play' : phase]);

  const next = useCallback(() => {
    if (at.current >= cards.current.length) {
      if (mode !== 'rush') { finish(); return; }
      seed.current += 7919; cards.current = deck('rush', seed.current); at.current = 0;
    }
    const card = cards.current[at.current++]!;
    setQ(questionFor(card, mode, rand.current)); setPicked(null); setOut(null); locked.current = false;
    limit.current = timeFor(st.current.correct); t0.current = performance.now(); setPhase('play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const start = (m: Mode) => {
    sound.init(); sound.uiTick();
    seed.current = (Date.now() % 2147483647) | 1; rand.current = rng(seed.current ^ 0x51ed);
    st.current = newRush(); cards.current = deck(m, seed.current); at.current = 0; setMode(m); setNewBest(false); setXp(0);
    const card = cards.current[at.current++]!;
    setQ(questionFor(card, m, rand.current)); setPicked(null); setOut(null); locked.current = false;
    limit.current = timeFor(0); t0.current = performance.now(); setPhase('play');
  };

  const finish = () => {
    cancelAnimationFrame(raf.current);
    const s = st.current, cur = loadSaved(); cur.runs++;
    let best = false, gained = 0;
    if (mode === 'rush') { if (s.score > cur.rush) { cur.rush = s.score; best = s.score > 0; } cur.streak = Math.max(cur.streak, s.best); gained = awardXpForRun(s.score, { stars: rushStars(s) }).gained; }
    else { const passed = s.correct >= TEST_PASS; if (s.correct > cur[mode]) { cur[mode] = s.correct; best = true; } gained = awardXpForRun(s.correct * 20, { passed }).gained; }
    store(cur); setSaved(cur); setNewBest(best); setXp(gained); setPhase('over');
    if (mode === 'rush' ? best : s.correct >= TEST_PASS) sound.fanfare(); else sound.tierDown();
  };

  const choose = (id: string | null) => {
    if (!q || locked.current) return; locked.current = true;
    cancelAnimationFrame(raf.current);
    const left = timed ? Math.max(0, 1 - (performance.now() - t0.current) / 1000 / limit.current) : 0;
    const right = id === q.answer;
    const o = answer(st.current, right, left, q.key);
    // a test never ends on strikes: it runs all 20 questions
    if (mode !== 'rush') o.over = false;
    setPicked(id ?? '__time'); setOut(o); setPhase('reveal');
    if (right) { sound.setSfxPitchStep(Math.min(8, st.current.streak - 1)); sound.starPickup(); if (o.restored) sound.tierUp(); } else sound.yieldBuzz();
  };

  // the clock
  useEffect(() => {
    if (phase !== 'play' || !timed) return;
    const tick = () => {
      const f = Math.max(0, 1 - (performance.now() - t0.current) / 1000 / limit.current);
      if (bar.current) { bar.current.style.transform = `scaleX(${f})`; bar.current.style.background = f > 0.5 ? '#2fbf87' : f > 0.25 ? '#f2c14e' : '#ff4d4f'; }
      if (f <= 0) { choose(null); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q, timed]);

  const proceed = () => { if (out?.over) { finish(); return; } if (mode !== 'rush' && st.current.asked >= TEST_LEN) { finish(); return; } next(); force((n) => n + 1); };
  // a right answer in Rush moves on by itself; a wrong one waits so the rule can be read
  useEffect(() => {
    if (phase !== 'reveal' || !out) return;
    if (mode === 'rush' && out.right) { const id = window.setTimeout(proceed, 850); return () => window.clearTimeout(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, out]);
  // keys 1 to 4 answer, Enter or Space continues
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (phase === 'play' && q && /^[1-4]$/.test(e.key)) { const o = q.options[Number(e.key) - 1]; if (o) choose(o.id); }
      else if (phase === 'reveal' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); proceed(); }
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q, out]);

  const s = st.current, mult = multFor(s.streak), level = levelFor(s.correct);
  const missed = useMemo(() => (phase === 'over' ? s.missed : []), [phase, s]);
  const passed = mode !== 'rush' && s.correct >= TEST_PASS;

  return <div className="sr-root" ref={root}>
    <div className="sr-top">
      <button className="sr-back" onClick={() => { sound.uiTick(); cancelAnimationFrame(raf.current); if (phase === 'home') onExit(); else setPhase('home'); }} aria-label={phase === 'home' ? 'Back to all games' : 'Leave this round'}>←</button>
      <div className="sr-title"><b>{phase === 'home' ? 'Sign Rush' : MODE_NAME[mode]}</b><small>{phase === 'home' ? 'Know every sign. Know every rule.' : mode === 'rush' ? LEVELS[level] : `Question ${Math.min(TEST_LEN, s.asked + (phase === 'play' ? 1 : 0))} of ${TEST_LEN} · ${TEST_PASS} to pass`}</small></div>
      {phase !== 'home' && phase !== 'over' && <div className="sr-score"><small>{mode === 'rush' ? 'SCORE' : 'RIGHT'}</small><b>{mode === 'rush' ? s.score.toLocaleString() : `${s.correct}`}</b></div>}
    </div>

    {phase === 'home' && <div className="sr-home">
      <div className="sr-hero">
        <div className="sr-hero-signs" aria-hidden><Sign id="yield" /><Sign id="stop" big /><Sign id="pedXing" /></div>
        <h2>How fast can you read the road?</h2>
        <p>Every sign, signal and line you will meet on the Georgia permit test and on the road, drawn exactly as it stands.</p>
      </div>
      <button className="sr-mode sr-m-rush" onClick={() => start('rush')}>
        <span className="sr-mode-ic"><Sign id="signalAhead" /></span>
        <span className="sr-mode-tx"><b>Sign Rush</b><small>Beat the clock. Three strikes and you are out. Streaks multiply your score.</small><i>{saved.rush ? `Best ${saved.rush.toLocaleString()} · longest streak ${saved.streak}` : 'Set your first score'}</i></span>
        <span className="sr-go">PLAY</span>
      </button>
      <button className="sr-mode" onClick={() => start('signsTest')}>
        <span className="sr-mode-ic"><Sign id="school" /></span>
        <span className="sr-mode-tx"><b>Road Signs Test</b><small>Like the Georgia permit test: {TEST_LEN} questions, {TEST_PASS} right to pass. No clock.</small><i>{saved.signsTest ? `Best ${saved.signsTest}/${TEST_LEN}${saved.signsTest >= TEST_PASS ? ' · passed' : ''}` : 'Not taken yet'}</i></span>
        <span className="sr-go">START</span>
      </button>
      <button className="sr-mode" onClick={() => start('rulesTest')}>
        <span className="sr-mode-ic"><Sign id="flashRed" /></span>
        <span className="sr-mode-tx"><b>Road Rules Test</b><small>Georgia law: right of way, school buses, Move Over, speed, signals. {TEST_LEN} questions, {TEST_PASS} to pass.</small><i>{saved.rulesTest ? `Best ${saved.rulesTest}/${TEST_LEN}${saved.rulesTest >= TEST_PASS ? ' · passed' : ''}` : `${RULES.length} rules in the bank`}</i></span>
        <span className="sr-go">START</span>
      </button>
      <div className="sr-how">
        <h3>How Sign Rush scores</h3>
        <ul>
          <li><b>+{RUSH.base}</b> for a right answer, times your streak multiplier</li>
          <li><b>x2 to x{RUSH.maxMult}</b> multiplier: one step up for every {RUSH.perTier} right in a row</li>
          <li><b>up to +{RUSH.speedMax}</b> speed bonus for answering fast</li>
          <li><b>Strike</b> for a wrong answer or running out of time. No points are taken, but the streak resets</li>
          <li><b>{RUSH.strikes} strikes</b> ends the run. <b>{RUSH.restoreEvery} in a row</b> earns a strike back</li>
          <li>The clock starts at {RUSH.t0} seconds and gets shorter as you go</li>
        </ul>
      </div>
    </div>}

    {(phase === 'play' || phase === 'reveal') && q && <div className="sr-play" key={`${q.key}-${at.current}`}>
      {mode === 'rush' ? <div className="sr-meter">
        <div className="sr-strikes" aria-label={`${s.strikes} of ${RUSH.strikes} strikes`}>{Array.from({ length: RUSH.strikes }, (_, i) => <span key={i} className={i < s.strikes ? 'x' : ''}>✕</span>)}</div>
        <div className={`sr-mult m${mult}`}><b>x{mult}</b><small>{s.streak} in a row</small></div>
        <div className="sr-pips" aria-hidden>{Array.from({ length: RUSH.perTier }, (_, i) => <span key={i} className={mult >= RUSH.maxMult || i < s.streak % RUSH.perTier ? 'on' : ''} />)}</div>
      </div> : <div className="sr-prog"><span style={{ width: `${(s.asked / TEST_LEN) * 100}%` }} /></div>}
      {timed && <div className="sr-clock"><span ref={bar} /></div>}

      <div className={`sr-card${phase === 'reveal' ? (out?.right ? ' ok' : ' bad') : ''}`}>
        {q.kind === 'meaning' && <><Sign id={q.signId!} big /><p className="sr-ask">{q.prompt}</p></>}
        {q.kind === 'pick' && <><p className="sr-ask sr-ask-sm">Tap the sign that means</p><p className="sr-want">{q.prompt}</p></>}
        {q.kind === 'rule' && <p className="sr-rule">{q.prompt}</p>}
        {phase === 'reveal' && out?.right && mode === 'rush' && <div className="sr-pop">+{out.points}{out.mult > 1 && <small>x{out.mult}</small>}</div>}
      </div>

      <div className={`sr-opts${q.kind === 'pick' ? ' pics' : ''}`}>
        {q.options.map((o, i) => {
          const state = phase === 'reveal' ? (o.id === q.answer ? ' right' : o.id === picked ? ' wrong' : ' dim') : '';
          return <button key={o.id} className={`sr-opt${state}`} disabled={phase === 'reveal'} onClick={() => choose(o.id)}>
            {o.signId ? <Sign id={o.signId} /> : <><kbd>{i + 1}</kbd><span>{o.text}</span></>}
            {phase === 'reveal' && o.id === q.answer && <em>✓</em>}{phase === 'reveal' && o.id === picked && o.id !== q.answer && <em>✕</em>}
          </button>;
        })}
      </div>

      {phase === 'reveal' && out && (!out.right || mode !== 'rush') && <div className={`sr-fact ${out.right ? 'ok' : 'bad'}`} role="status">
        <b>{out.right ? 'Correct' : picked === '__time' ? 'Out of time' : 'Not quite'}{!out.right && mode === 'rush' && ` · strike ${s.strikes} of ${RUSH.strikes}`}</b>
        <p>{q.fact}</p>
        <button className="sr-next" onClick={proceed} autoFocus>{out.over ? 'See my results' : mode !== 'rush' && s.asked >= TEST_LEN ? 'See my results' : 'Next'}</button>
      </div>}
      {phase === 'reveal' && out?.restored && <div className="sr-restore">Strike cleared. {RUSH.restoreEvery} in a row!</div>}
    </div>}

    {phase === 'over' && <div className="sr-over">
      {mode === 'rush' ? <>
        <div className="sr-stars" aria-label={`${rushStars(s)} of 5 stars`}>{'★'.repeat(rushStars(s))}<span>{'★'.repeat(5 - rushStars(s))}</span></div>
        <h2>{LEVELS[level]}</h2>
        <div className="sr-big">{s.score.toLocaleString()}</div>
        {newBest && <div className="sr-newbest">New best score</div>}
      </> : <>
        <div className={`sr-verdict ${passed ? 'pass' : 'fail'}`}>{passed ? 'PASSED' : 'NOT YET'}</div>
        <div className="sr-big">{s.correct}<small>/{TEST_LEN}</small></div>
        <p className="sr-sub">{passed ? `You needed ${TEST_PASS}. That is a pass on the real ${MODE_NAME[mode]}.` : `You need ${TEST_PASS} to pass. ${TEST_PASS - s.correct} more to go. Review the ones below and try again.`}</p>
      </>}
      <div className="sr-stats">
        <div><b>{s.correct}/{s.asked}</b><span>Right</span></div>
        <div><b>{s.asked ? Math.round((s.correct / s.asked) * 100) : 0}%</b><span>Accuracy</span></div>
        <div><b>{s.best}</b><span>Best streak</span></div>
        <div><b>+{xp}</b><span>Driver XP</span></div>
      </div>
      {missed.length > 0 && <div className="sr-review">
        <h3>Review these</h3>
        {missed.map((k) => { const sg = SIGN_BY_ID[k], r = RULES.find((x) => x.id === k); return <div key={k} className="sr-rev">
          {sg ? <Sign id={k} /> : <span className="sr-rev-q">?</span>}
          <div><b>{sg ? sg.name : r?.a}</b><p>{sg ? sg.fact : r?.fact}</p></div>
        </div>; })}
      </div>}
      {missed.length === 0 && s.asked > 0 && <p className="sr-sub">Nothing to review. A clean sheet.</p>}
      <div className="sr-actions"><button className="sr-primary" onClick={() => start(mode)}>Play again</button><button className="sr-ghost" onClick={() => setPhase('home')}>Other modes</button><button className="sr-ghost" onClick={onExit}>All games</button></div>
    </div>}
  </div>;
}
