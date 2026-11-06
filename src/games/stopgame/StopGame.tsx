import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { CAR_NAME, KIND_LABEL, KIND_OF, RULE_TEXT, blockersOf, explain, explainCorrect, makeRound, mayGo, type CarSpec, type Kind, type Reason, type Scenario } from './engine';
import { SKY, STYLES, TIMES, mulberry } from './look';
import { Sim } from './sim';
import type { Mark, Overlay } from './Cars';
import { camDirFor } from './Scene';
import './stopgame.css';

const Scene = lazy(() => import('./Scene'));

type Phase = 'title' | 'load' | 'watch' | 'ask' | 'wrong' | 'moving' | 'between' | 'summary';
const ROUND = 10;
const BEST_KEY = 'dk-stopgame-best';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nameOf = (c: CarSpec) => (c.you ? 'your car' : `the ${CAR_NAME[c.model]} car`);

/** Two quick tones: a rising ding for right, a low buzz for wrong. */
let ctx: AudioContext | null = null;
function tone(kind: 'ok' | 'bad' | 'go') {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = kind === 'ok' ? [[660, 0], [990, .09]] : kind === 'go' ? [[520, 0]] : [[190, 0], [150, .11]];
    notes.forEach(([f, d]) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain(), t = ctx!.currentTime + d!;
      o.type = kind === 'bad' ? 'sawtooth' : 'triangle'; o.frequency.value = f!; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'bad' ? .09 : .13, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .22);
      o.connect(g).connect(ctx!.destination); o.start(t); o.stop(t + .25);
    });
  } catch { /* no audio: fine */ }
}

const lookFor = (sc: Scenario, idx: number) => {
  const r = mulberry(sc.seed * 7 + idx + 3);
  // the first street of a round is a bright morning in a neighbourhood; after that the hour and the neighbourhood change
  return idx === 0 ? { time: 'day' as const, style: 'suburb' as const } : { time: TIMES[Math.floor(r() * TIMES.length)]!, style: STYLES[Math.floor(r() * STYLES.length)]! };
};

function Gate({ children }: { children: React.ReactNode }) {
  const { user, role, isLoading } = usePortalAuth();
  const location = useLocation();
  // development only: the screenshot scripts open the game without signing in (this line is removed from production builds)
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('devpreview') === '1') return <>{children}</>;
  if (isLoading) return <div className="sg-gate"><div className="sg-spin" /><p>Loading…</p></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!(role === 'admin' || role === 'staff' || role === 'instructor')) {
    return <div className="sg-gate"><div className="sg-gate-card"><h1>Coming soon</h1><p>Who Goes First is being built. It opens to everyone when it is finished.</p><Link to="/">Back to DrivingKlass</Link></div></div>;
  }
  return <>{children}</>;
}

export default function StopGame() { return <Gate><Game /></Gate>; }

function Game() {
  const [phase, setPhase] = useState<Phase>('title');
  const dev = useMemo(() => (import.meta.env.DEV ? new URLSearchParams(window.location.search) : null), []);   // development only: ?seed= ?kind= ?time= ?style= pin a street for screenshots
  const [seed, setSeed] = useState(() => Number(dev?.get('seed')) || Math.floor(Math.random() * 1e5) + 1);
  const round = useMemo(() => makeRound(seed, ROUND, (dev?.get('kind') as Kind | null) ?? undefined), [seed, dev]);
  const [idx, setIdx] = useState(0);
  const sc = round[idx]!;
  const look = useMemo(() => { const l = lookFor(sc, idx); return { time: (dev?.get('time') as typeof l.time | null) ?? l.time, style: (dev?.get('style') as typeof l.style | null) ?? l.style }; }, [sc, idx, dev]);
  const sim = useMemo(() => { const s = new Sim(); s.load(sc); return s; }, [sc]);
  const camDir = useMemo(() => camDirFor(sc), [sc]);
  const [born, setBorn] = useState(0);
  const [tick, setTick] = useState(0);
  const [arrows, setArrows] = useState(true);
  const [order, setOrder] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [score, setScore] = useState(0), [streak, setStreak] = useState(0), [best, setBest] = useState(() => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } });
  const [stats, setStats] = useState({ right: 0, total: 0, missed: {} as Partial<Record<Reason, number>> });
  const [toast, setToast] = useState<{ good: boolean; head: string; body: string; rule?: Reason } | null>(null);
  const [replays, setReplays] = useState(0);
  const paused = useRef(true);
  // development only: the screenshot scripts can fast-forward the street
  useEffect(() => { if (import.meta.env.DEV) (window as unknown as { __sg?: unknown }).__sg = { sim, step: (n: number) => { for (let i = 0; i < n; i++) sim.step(.05); } }; }, [sim]);
  const hintUsed = useRef(false);
  const rightRef = useRef<CarSpec | null>(null);

  const ov = useRef<Overlay>({ ask: false, arrows: true, order: false, marks: {}, onPick: () => {} });
  ov.current.ask = phase === 'ask'; ov.current.arrows = arrows; ov.current.order = order; ov.current.marks = marks;
  useEffect(() => { setTick(t => t + 1); }, [phase, arrows, order, marks]);

  paused.current = phase === 'title' || phase === 'load' || phase === 'summary';

  // wait for the street to draw, then start the clock
  const ready = useCallback(() => { setPhase(p => (p === 'load' ? 'watch' : p)); }, []);
  useEffect(() => {
    if (phase !== 'watch' && phase !== 'moving') return;
    const id = window.setInterval(() => {
      if (phase === 'watch' && sim.ready) { window.clearInterval(id); setPhase('ask'); }
      if (phase === 'moving' && sim.clear) { window.clearInterval(id); settle(); }
    }, 90);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sim]);

  const remaining = () => sim.remaining();

  /** A car has cleared the intersection: ask again, or finish the street. */
  const settle = () => {
    setMarks({}); setToast(null);
    const left = remaining();
    if (left.length === 0) { setPhase('between'); return; }
    if (left.length === 1) { sim.release(left[0]!.id); tone('go'); setPhase('moving'); return; }     // the last car just goes
    hintUsed.current = false; setPhase('ask');
  };

  const pick = (id: string) => {
    if (phase !== 'ask') return;
    const left = remaining(), chosen = left.find(c => c.id === id)!, ok = mayGo(left) ?? [];
    const correct = ok.some(c => c.id === id);
    setStats(s => ({ ...s, total: s.total + 1, right: s.right + (correct ? 1 : 0) }));
    if (correct) {
      const why = explainCorrect(left, chosen, nameOf);
      const gain = (hintUsed.current ? 50 : 100) + 10 * Math.min(streak, 5);
      setScore(v => v + gain); setStreak(v => v + 1); tone('ok');
      setMarks({ [id]: 'ok' }); setToast({ good: true, head: `Correct  +${gain}`, body: cap(why.why), rule: why.rule });
      sim.release(id); setPhase('moving');
    } else {
      // who stands in the way of the car that was picked, and who in the end may go
      const bl = blockersOf(left, chosen); let chain: CarSpec | undefined = bl[0], guard = 0;
      while (chain && !ok.includes(chain) && guard++ < 6) chain = blockersOf(left, chain)[0];
      const right = chain ?? ok[0]!, first = bl.includes(right) ? right : bl[0] ?? right;
      const why = explain(left, chosen, first, nameOf);
      rightRef.current = right; setStreak(0); tone('bad');
      setStats(s => ({ ...s, missed: { ...s.missed, [why.rule]: (s.missed[why.rule] ?? 0) + 1 } }));
      setMarks({ [id]: 'bad', [right.id]: 'answer' });
      setToast({ good: false, head: `Not yet. ${cap(nameOf(right))} goes next.`, body: cap(why.why), rule: why.rule });
      setPhase('wrong');
    }
  };
  ov.current.onPick = pick;

  const gotIt = () => { const r = rightRef.current; if (!r) return; setToast(null); setMarks({ [r.id]: 'ok' }); sim.release(r.id); tone('go'); setPhase('moving'); };

  // between streets
  useEffect(() => {
    if (phase !== 'between') return;
    const id = window.setTimeout(() => {
      if (idx + 1 >= ROUND) { setPhase('summary'); setToast(null); return; }
      setToast(null); setMarks({}); setOrder(false); setIdx(i => i + 1); setBorn(b => b + 1); setPhase('load');
    }, 1100);
    return () => window.clearTimeout(id);
  }, [phase, idx]);

  useEffect(() => {
    if (phase !== 'summary') return;
    try { if (score > best) { localStorage.setItem(BEST_KEY, String(score)); setBest(score); } } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => { tone('go'); setPhase('load'); setBorn(b => b + 1); };
  const again = () => { setSeed(Math.floor(Math.random() * 1e5) + 1); setIdx(0); setScore(0); setStreak(0); setStats({ right: 0, total: 0, missed: {} }); setMarks({}); setToast(null); setOrder(false); setReplays(0); setBorn(b => b + 1); setPhase('load'); };
  const replay = () => { if (phase !== 'ask' || sim.runs.some(r => r.goTime !== null)) return; sim.reset(); setReplays(n => n + 1); setMarks({}); hintUsed.current = false; setPhase('watch'); };
  const toggleOrder = () => { setOrder(v => !v); hintUsed.current = true; };

  const acc = stats.total ? Math.round((stats.right / stats.total) * 100) : 100;
  const stars = acc >= 95 ? 5 : acc >= 85 ? 4 : acc >= 70 ? 3 : acc >= 50 ? 2 : 1;
  const kind = KIND_OF(sc);
  const left = phase === 'ask' ? sim.remaining().length : 0, total = sc.cars.length;
  const first = left === total;
  const noteForKind = sc.layout.kind === 'all' ? 'Every road has a stop sign.' : 'Only the stopped road has a sign. The other road keeps going.';
  const night = SKY[look.time].lamps;

  return <div className={`sg-root sg-${look.time}`}>
    {phase !== 'title' && <Suspense fallback={null}>
      <Scene key={`${sc.id}-${born}`} sc={sc} look={look} sim={sim} ov={ov} tick={tick} paused={paused} camDir={camDir} born={born} onReady={ready} />
    </Suspense>}

    {/* top bar */}
    {phase !== 'title' && phase !== 'summary' && <header className="sg-top">
      <Link to="/" className="sg-exit" aria-label="Leave the game">✕</Link>
      <div className="sg-pill"><span>Street</span><b>{idx + 1}<small>/{ROUND}</small></b></div>
      <div className="sg-pill sg-gold"><span>Score</span><b>{score}</b></div>
      <div className={`sg-pill${streak > 1 ? ' sg-hot' : ''}`}><span>Streak</span><b>{streak}{streak > 1 ? ' 🔥' : ''}</b></div>
      <div className="sg-tools">
        <button className={arrows ? 'on' : ''} onClick={() => setArrows(v => !v)} aria-pressed={arrows} title="Show which way each car is going">↰↱</button>
        <button className={order ? 'on' : ''} onClick={toggleOrder} aria-pressed={order} title="Show the order the cars arrived (half points)">①②</button>
      </div>
    </header>}

    {phase !== 'title' && phase !== 'summary' && <div className="sg-kind"><b>{KIND_LABEL[kind]}</b><span>{noteForKind}</span>{night && <i>🌙</i>}</div>}
    <div className="sg-badge">STAFF PREVIEW</div>

    {/* the question */}
    {(phase === 'load' || phase === 'watch') && <div className="sg-card sg-watch"><div className="sg-dots"><i /><i /><i /></div><h2>{phase === 'load' ? 'Setting up the street…' : 'Watch the cars arrive'}</h2><p>Notice who stops first, and who stops together.</p></div>}
    {phase === 'ask' && <div className="sg-card sg-ask"><h2>{first ? 'Who goes first?' : 'Who goes next?'}</h2><p>Tap the car whose turn it is.{left < total ? ` ${left} left.` : ''}</p>
      {first && <div className="sg-actions"><button onClick={replay}>↻ Watch again{replays ? ` (${replays})` : ''}</button></div>}</div>}
    {phase === 'moving' && toast?.good && <div className="sg-card sg-good" role="status"><div className="sg-tick">✓</div><div><h2>{toast.head}</h2><p>{toast.body}</p></div></div>}
    {phase === 'moving' && !toast?.good && <div className="sg-card sg-quiet"><p>Here it goes…</p></div>}
    {phase === 'wrong' && toast && <div className="sg-card sg-bad" role="alert"><div className="sg-tick">✕</div><div><h2>{toast.head}</h2><p>{toast.body}</p>{toast.rule && <p className="sg-rule"><b>{RULE_TEXT[toast.rule].title}.</b> {RULE_TEXT[toast.rule].body}</p>}<button className="sg-primary" onClick={gotIt}>Got it. Show me</button></div></div>}
    {phase === 'between' && <div className="sg-card sg-quiet"><p>{idx + 1 >= ROUND ? 'That was the last street!' : 'Next street…'}</p></div>}

    {/* title */}
    {phase === 'title' && <div className="sg-title">
      <div className="sg-stars" aria-hidden>★★★★★</div>
      <h1>Who Goes First?</h1>
      <p className="sg-sub">The right-of-way game for stop signs</p>
      <ul>
        <li><b>Watch</b> the cars roll up to the stop signs.</li>
        <li><b>Tap</b> the car whose turn it is. Get it wrong and we show you why.</li>
        <li><b>Learn</b> first to stop, the car on the right, left turns and roads with no sign.</li>
      </ul>
      <button className="sg-primary sg-big" onClick={start}>Start · {ROUND} streets</button>
      {best > 0 && <p className="sg-best">Best score {best}</p>}
      <p className="sg-staff">Only admins and instructors can see this game for now.</p>
    </div>}

    {/* summary */}
    {phase === 'summary' && <div className="sg-title sg-summary">
      <div className="sg-stars big">{'★'.repeat(stars)}<span>{'★'.repeat(5 - stars)}</span></div>
      <h1>{['', 'Keep practicing', 'Getting there', 'Good driver', 'Great driver', '5-Star Driver!'][stars]}</h1>
      <div className="sg-stats"><div><b>{score}</b><span>Score</span></div><div><b>{acc}%</b><span>Right</span></div><div><b>{stats.right}/{stats.total}</b><span>Calls</span></div></div>
      {score >= best && score > 0 && <p className="sg-best">New best score!</p>}
      {Object.keys(stats.missed).length > 0 ? <div className="sg-review"><h3>Practice these</h3>{(Object.keys(stats.missed) as Reason[]).map(r => <p key={r}><b>{RULE_TEXT[r].title}</b><span>{RULE_TEXT[r].body}</span></p>)}</div> : <p className="sg-sub">No mistakes. You know your right of way.</p>}
      <div className="sg-actions"><button className="sg-primary sg-big" onClick={again}>Play again</button><Link className="sg-ghost" to="/">Done</Link></div>
    </div>}
  </div>;
}
