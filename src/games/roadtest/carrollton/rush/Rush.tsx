/**
 * Carrollton Rush: live multiplayer in the real Carrollton, Georgia.
 * Everyone drives the same GPS trips across town on their own phone; every traffic law still counts,
 * and every fault adds seconds to your time, so the fastest driver only wins if they drive by the book.
 * No account needed: a 4 letter room code (or the link) and a name.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resetTouchControls } from '../../game/controls';
import { labelOf, type PointKey } from '../../game/scoring';
import { GARAGE, selectedCar, type GarageId } from '../../g3d/garage';
import { sound } from '../../sound';
import type { OSimEvent } from '../sim';
import type { OpenHandle } from '../Play';
import { cleanCode, cleanName, myId, newCode, openWire, roomLink, saveName, savedName, type RushMsg, type RushPlayer, type RushSettings, type Wire } from './net';
import { applyState, fmtTime, PENALTY, pushFeed, race, RACE_LIMIT_S, resetRace, STALE_MS, type Racer } from './store';
import './rush.css';

const RushRace = lazy(() => import('./RushRace'));

const SWATCH: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.swatch]));
const DIFF_LABEL: Record<string, string> = { learner: 'Easy traffic', licensed: 'Busy traffic', instructor: 'Rush hour' };
const HELLO_MS = 1500, GONE_MS = 6500;
/** after everyone has loaded the town: this long on the grid, then 3, 2, 1, GO */
const GO_IN_MS = 4500, READY_WAIT_MS = 25000;

type Phase = 'entry' | 'lobby' | 'race';
interface Seat extends RushPlayer { seen: number; lobby: boolean }

export default function RushRoot({ onExit, initialCode = '', onRacing }: { onExit: () => void; initialCode?: string; onRacing?: (racing: boolean) => void }) {
  const me = useMemo(() => myId(), []);
  const [phase, setPhase] = useState<Phase>('entry');
  const [name, setName] = useState(() => savedName());
  const [car, setCar] = useState<GarageId>(() => selectedCar().id);
  const [codeIn, setCodeIn] = useState(initialCode);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [link, setLink] = useState<'live' | 'down' | 'wait'>('wait');
  const [settings, setSettings] = useState<RushSettings>({ trips: 3, difficulty: 'learner' });
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  const [startMsg, setStartMsg] = useState<Extract<RushMsg, { t: 'start' }> | null>(null);
  const [lateRace, setLateRace] = useState(false);
  const joinedAt = useRef(Date.now());
  const seats = useRef(new Map<string, Seat>());
  const wire = useRef<Wire | null>(null);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const raceTap = useRef<((m: RushMsg) => void) | null>(null);
  useEffect(() => { onRacing?.(phase === 'race'); }, [phase, onRacing]);
  useEffect(() => () => onRacing?.(false), [onRacing]);

  const meSeat = useCallback((): Seat => ({ id: me, name: cleanName(name) || 'Driver', car, joinedAt: joinedAt.current, seen: Date.now(), lobby: phaseRef.current !== 'race' }), [me, name, car]);
  const hostId = () => {
    const list = [...seats.current.values()].filter((s) => s.lobby);
    list.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    return list[0]?.id ?? me;
  };

  // ---- the wire: open when a room is chosen, close on the way out
  useEffect(() => {
    if (!code) return;
    setLink('wait');
    const w = openWire(code, me, (m) => {
      switch (m.t) {
        case 'hello': seats.current.set(m.p.id, { ...m.p, name: cleanName(m.p.name) || 'Driver', seen: Date.now(), lobby: m.lobby }); bump((n) => n + 1); break;
        case 'bye': seats.current.delete(m.id); bump((n) => n + 1); if (phaseRef.current === 'race') raceTap.current?.(m); break;
        case 'cfg': if (hostId() !== me) setSettings(m.s); break;
        case 'start':
          if (phaseRef.current === 'race') break;
          if (!m.roster.some((p) => p.id === me)) { setLateRace(true); break; }
          setLateRace(false); setSettings(m.s); setStartMsg(m); setPhase('race'); break;
        case 'lobby': if (phaseRef.current === 'race') backToLobby(); break;
        default: if (phaseRef.current === 'race') raceTap.current?.(m); break;
      }
    }, (s) => setLink(s));
    wire.current = w;
    return () => { try { w.send({ t: 'bye', id: me }); } catch { /* ignore */ } w.close(); wire.current = null; };
  }, [code, me]);

  // ---- say hello now and then, forget anyone who went quiet
  useEffect(() => {
    if (!code) return;
    const tick = () => {
      const s = meSeat(); seats.current.set(me, s);
      wire.current?.send({ t: 'hello', p: { id: s.id, name: s.name, car: s.car, joinedAt: s.joinedAt }, lobby: s.lobby });
      const now = Date.now(); let changed = false;
      for (const [id, x] of seats.current) if (id !== me && now - x.seen > GONE_MS) { seats.current.delete(id); changed = true; }
      if (changed) bump((n) => n + 1);
      if (hostId() === me && phaseRef.current === 'lobby') wire.current?.send({ t: 'cfg', s: settingsRef.current });
    };
    tick();
    const id = window.setInterval(tick, HELLO_MS);
    return () => window.clearInterval(id);
  }, [code, me, meSeat]);

  const enter = (c: string) => {
    const n = cleanName(name);
    if (!n) { setErr('Type your name first'); return; }
    if (c.length !== 4) { setErr('Room codes are 4 letters'); return; }
    saveName(n); setErr(''); joinedAt.current = Date.now(); seats.current.clear(); setCode(c); setPhase('lobby');
    try { const u = new URL(window.location.href); u.searchParams.set('room', c); window.history.replaceState(null, '', u.toString()); } catch { /* ignore */ }
    sound.ensureRunning();
  };
  const leaveRoom = () => {
    setCode(''); setPhase('entry'); seats.current.clear();
    try { const u = new URL(window.location.href); u.searchParams.delete('room'); window.history.replaceState(null, '', u.toString()); } catch { /* ignore */ }
  };
  const share = async () => {
    const url = roomLink(code), text = `Race me through Carrollton, GA in the DrivingKlass game. Room ${code}`;
    try { if (navigator.share) { await navigator.share({ title: 'Carrollton Rush', text, url }); return; } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };
  const start = () => {
    const roster = [...seats.current.values()].filter((s) => s.lobby).map(({ id, name: nm, car: c, joinedAt: j }) => ({ id, name: nm, car: c, joinedAt: j }));
    if (!roster.some((p) => p.id === me)) roster.push({ id: me, name: cleanName(name) || 'Driver', car, joinedAt: joinedAt.current });
    const m: Extract<RushMsg, { t: 'start' }> = { t: 'start', seed: (Math.random() * 2 ** 31) >>> 0, startAt: 0, s: settings, roster: roster.slice(0, 6) };
    wire.current?.send(m);
    setStartMsg(m); setPhase('race');
  };
  const backToLobby = useCallback(() => { setStartMsg(null); setPhase('lobby'); bump((n) => n + 1); }, []);

  const list = [...seats.current.values()].filter((s) => s.id !== me || code);
  if (code && !seats.current.has(me)) list.unshift(meSeat());
  list.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  const amHost = hostId() === me;

  if (phase === 'race' && startMsg && wire.current) {
    return <Suspense fallback={<div className="rush-loading"><div className="rt3d-spin" /><p>Loading Carrollton…</p></div>}>
      <RushRace key={startMsg.seed} me={me} wire={wire.current} start={startMsg} amHost={[...startMsg.roster].sort((x, y) => x.joinedAt - y.joinedAt || x.id.localeCompare(y.id))[0]?.id === me} tapRef={raceTap} onLobby={backToLobby} onQuit={() => { leaveRoom(); onExit(); }} />
    </Suspense>;
  }

  return <div className="screen rush-screen">
    <div className="rush-hero">
      <div className="rush-badge" aria-hidden="true"><b>RUSH</b><i>CARROLLTON · GA</i></div>
      <h1>Carrollton Rush</h1>
      <p>Race your friends live through the real streets of Carrollton. Same trips, same traffic laws. Every fault adds seconds to your time, so the cleanest fast driver wins.</p>
    </div>

    {phase === 'entry' && <section className="rush-card">
      <label className="rush-label" htmlFor="rush-name">Your name</label>
      <input id="rush-name" className="rush-input" value={name} maxLength={14} placeholder="e.g. Quamie" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
      <div className="rush-label">Your car</div>
      <div className="rush-cars" role="radiogroup" aria-label="Your car">
        {GARAGE.map((g) => <button key={g.id} role="radio" aria-checked={car === g.id} className={`rush-car${car === g.id ? ' on' : ''}`} onClick={() => setCar(g.id)} title={g.name}>
          <i style={{ background: g.swatch }} /><span>{g.name}</span>
        </button>)}
      </div>
      {initialCode.length === 4 && <button className="dk-btn dk-btn-gold rush-big rush-join-link" onClick={() => enter(initialCode)}>Join room {initialCode}</button>}
      {initialCode.length !== 4 && <button className="dk-btn dk-btn-gold rush-big rush-create" onClick={() => enter(newCode())}>Create a room</button>}
      <div className="rush-or"><span>{initialCode.length === 4 ? 'or another room' : 'or join a friend'}</span></div>
      <div className="rush-join">
        <input className="rush-input rush-code" value={codeIn} placeholder="CODE" maxLength={4} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Room code"
          onChange={(e) => setCodeIn(cleanCode(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') enter(codeIn); }} />
        <button className="dk-btn dk-btn-outline rush-join-btn" onClick={() => enter(codeIn)} disabled={codeIn.length !== 4}>Join</button>
      </div>
      {initialCode.length === 4 && <button className="dk-btn dk-btn-ghost rush-create" onClick={() => enter(newCode())}>Create a new room instead</button>}
      {err && <p className="rush-err" role="alert">{err}</p>}
      <ul className="rush-rules">
        <li><b>2 to 6 drivers.</b> Everyone gets the same GPS trips.</li>
        <li><b>Every law counts.</b> Minor fault +3s, major +8s, strike +20s. Three strikes and your licence is suspended.</li>
        <li><b>No sign-in.</b> Share the link, pick a name, drive.</li>
      </ul>
      <button className="dk-btn dk-btn-ghost" onClick={onExit}>← Back to the menu</button>
    </section>}

    {phase === 'lobby' && <section className="rush-card">
      <div className="rush-code-big"><small>ROOM</small><b>{code}</b></div>
      <div className="rush-share">
        <button className="dk-btn dk-btn-gold" onClick={share}>{copied ? 'Link copied ✓' : 'Invite friends'}</button>
        <span className="rush-link">{roomLink(code).replace(/^https?:\/\//, '')}</span>
      </div>
      <p className={`rush-net ${link}`}>{link === 'live' ? '● Connected' : link === 'down' ? '● Connection lost, retrying…' : '● Connecting…'}</p>
      <div className="rush-label">Drivers ({list.length}/6)</div>
      <ul className="rush-players">
        {list.map((p, i) => <li key={p.id} className={p.id === me ? 'me' : ''}>
          <i style={{ background: SWATCH[p.car] ?? '#f2b92a' }} />
          <span>{p.name}{p.id === me && <em> (you)</em>}</span>
          {i === 0 && <u title="Host">HOST</u>}
          {!p.lobby && <u className="racing">RACING</u>}
        </li>)}
      </ul>
      {lateRace && <p className="rush-note">A race is already running in this room. You will be on the grid for the next one.</p>}
      {amHost ? <>
        <div className="rush-label">Race</div>
        <div className="rush-opts">
          {[2, 3, 4].map((n) => <button key={n} className={`rush-opt${settings.trips === n ? ' on' : ''}`} onClick={() => setSettings((s) => ({ ...s, trips: n }))}>{n} trips</button>)}
        </div>
        <div className="rush-opts">
          {(['learner', 'licensed', 'instructor'] as const).map((d) => <button key={d} className={`rush-opt${settings.difficulty === d ? ' on' : ''}`} onClick={() => setSettings((s) => ({ ...s, difficulty: d }))}>{DIFF_LABEL[d]}</button>)}
        </div>
        <button className="dk-btn dk-btn-gold rush-big" onClick={start} disabled={link !== 'live'}>{list.length > 1 ? `Start the race · ${list.length} drivers` : 'Start solo (practice)'}</button>
        {list.length < 2 && <p className="rush-note">Waiting for friends. Send them the link, or start alone to learn the route.</p>}
      </> : <p className="rush-wait">{settings.trips} trips · {DIFF_LABEL[settings.difficulty]}. Waiting for <b>{list[0]?.name ?? 'the host'}</b> to start the race…</p>}
      <button className="dk-btn dk-btn-ghost" onClick={leaveRoom}>Leave the room</button>
    </section>}
  </div>;
}

// ------------------------------------------------------------------ the race itself (same file keeps the flow readable; RushRace.tsx mounts it)
export interface RaceProps { me: string; wire: Wire; start: Extract<RushMsg, { t: 'start' }>; amHost: boolean; tapRef: { current: ((m: RushMsg) => void) | null }; onLobby: () => void; onQuit: () => void }

export function useRaceLogic({ me, wire, start, tapRef, amHost }: RaceProps, handle: OpenHandle) {
  const [over, setOver] = useState(false);
  const [, bump] = useState(0);
  const mine = useRef<Racer | null>(null);
  // the green light, on this phone's clock: unknown (Infinity) until the host has seen everyone load the town
  const goPerf = useRef(Infinity);
  const t0 = useRef(performance.now());
  const setGo = useCallback((at: number) => { goPerf.current = at; handle.holdUntil = at; race.goAt = at; }, [handle]);

  useEffect(() => {
    resetRace(me, start.roster, start.s.trips);
    mine.current = race.racers.get(me) ?? null;
    t0.current = performance.now();
    handle.holdUntil = Infinity; goPerf.current = Infinity;
    resetTouchControls();
    return () => { race.on = false; tapRef.current = null; };
  }, [me, start, handle, tapRef]);

  // ---- messages from the others
  useEffect(() => {
    tapRef.current = (m) => {
      if (m.t === 'ready') { race.ready.add(m.id); }
      else if (m.t === 'go') { if (!isFinite(goPerf.current)) setGo(performance.now() + m.inMs); }
      else if (m.t === 'st') applyState(m);
      else if (m.t === 'ev') { const r = race.racers.get(m.id); pushFeed(`${r?.name ?? 'Someone'} ${m.text}`, m.tone); if (m.tone === 'good') sound.checkpoint?.(); }
      else if (m.t === 'bye') { const r = race.racers.get(m.id); if (r && !r.done && !r.out) { r.out = 'LEFT'; pushFeed(`${r.name} left the race`, 'info'); } }
    };
  }, [tapRef, setGo]);

  // ---- my faults, trips and the end of my drive
  useEffect(() => {
    const say = (text: string, tone: 'good' | 'bad' | 'info') => { const r = mine.current; if (!r) return; pushFeed(`${r.name} ${text}`, tone); wire.send({ t: 'ev', id: me, text, tone }); };
    handle.tap = (e: OSimEvent) => {
      const r = mine.current; if (!r || r.done || r.out) return;
      if (e.k === 'delta' && e.kind !== 'up') {
        const sec = PENALTY[e.sev ?? ''] ?? 0;
        r.faults++; r.pen += sec; r.strikes = e.strikes;
        if (sec > 0) { const what = e.key ? labelOf(e.key as PointKey) : 'broke a rule'; say(`${what.charAt(0).toLowerCase()}${what.slice(1)} · +${sec}s`, 'bad'); handle.hud.toasts.push({ text: `+${sec}s PENALTY`, born: performance.now() }); }
      } else if (e.k === 'trip') {
        r.trip = e.n;
        const t = (performance.now() - goPerf.current) / 1000;
        if (e.last) { r.done = t; say(`finished! ${fmtTime(t)} + ${r.pen}s`, 'good'); }
        else say(`reached ${e.name} (${e.n}/${race.trips})`, 'info');
      } else if (e.k === 'complete' && !r.done) {
        r.out = handle.sim.strikes >= 3 ? 'SUSPENDED' : 'OUT';
        say(r.out === 'SUSPENDED' ? 'got three strikes: licence suspended' : 'is out of the race', 'bad');
      }
    };
    return () => { handle.tap = undefined; };
  }, [handle, me, wire]);

  // ---- tell the others where I am, 8 times a second; decide when the race is over
  useEffect(() => {
    let lastReady = 0, lastGo = 0, lastStart = performance.now();
    const id = window.setInterval(() => {
      const r = mine.current, s = handle.sim; if (!r) return;
      const pnow = performance.now();
      // the start: everybody says when the town is loaded; the host gives the green light when all are in (or after a fair wait)
      if (handle.ready) { race.ready.add(me); if (!isFinite(goPerf.current) && pnow - lastReady > 1500) { lastReady = pnow; wire.send({ t: 'ready', id: me }); } }
      if (amHost) {
        // say "start" again for a few seconds, for anyone whose first message got lost (the others ignore repeats)
        if (pnow - t0.current < 9000 && pnow - lastStart > 1200) { lastStart = pnow; wire.send(start); }
        const all = start.roster.every((p) => race.ready.has(p.id) || race.racers.get(p.id)?.out);
        if (!isFinite(goPerf.current) && handle.ready && (all || pnow - t0.current > READY_WAIT_MS)) setGo(pnow + GO_IN_MS);
        // repeat the green light for a while, for anyone whose message got lost
        if (isFinite(goPerf.current) && pnow - goPerf.current < 30000 && pnow - lastGo > 1000) { lastGo = pnow; wire.send({ t: 'go', inMs: goPerf.current - pnow }); }
      }
      r.x = s.x; r.z = s.z; r.h = s.h; r.v = s.v; r.sig = s.signalDir; r.score = s.tracker.score; r.seen = performance.now(); r.hasPose = true;
      wire.send({ t: 'st', id: me, x: +s.x.toFixed(2), z: +s.z.toFixed(2), h: +s.h.toFixed(3), v: +s.v.toFixed(2), sig: s.signalDir, trip: r.trip, pen: r.pen, faults: r.faults, strikes: r.strikes, score: s.tracker.score, done: r.done, out: r.out });
      const t = (performance.now() - goPerf.current) / 1000;
      // out of time: anybody still driving does not finish
      if (t > RACE_LIMIT_S) for (const x of race.racers.values()) if (!x.done && !x.out) x.out = 'DNF';
      for (const x of race.racers.values()) if (!x.me && !x.done && !x.out && performance.now() - x.seen > STALE_MS * 2 && t > 20) x.out = 'LEFT';
      const everyone = [...race.racers.values()].every((x) => x.done > 0 || !!x.out);
      if (everyone && !over) setOver(true);
      bump((n) => (n + 1) % 1e6);
    }, 125);
    return () => window.clearInterval(id);
  }, [handle, me, wire, over, amHost, start, setGo]);

  return { over, mine, goPerf };
}

