/** Carrollton Rush: one race on this phone. The open world with the other racers in it, the race HUD and the results. */
import { useEffect, useMemo, useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { AudioSettingsButton } from '../../components/AudioSettingsButton';
import { TouchControls } from '../../components/TouchControls';
import { GARAGE } from '../../g3d/garage';
import { sound } from '../../sound';
import { makeOpenHandle, minimapExtras, OpenGame, type OpenHandle } from '../Play';
import { Rivals } from './Rivals';
import { useRaceLogic, type RaceProps } from './Rush';
import { finalTime, fmtTime, ordinal, race, RACE_LIMIT_S, standings, type Racer } from './store';

const SWATCH: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.swatch]));
const OUT_TEXT: Record<string, string> = { SUSPENDED: 'Suspended', OUT: 'Out', DNF: 'Out of time', LEFT: 'Left', PEDESTRIAN: 'Out', TRAIN: 'Out' };

function RushHud({ handle, goPerf, me }: { handle: OpenHandle; goPerf: { current: number }; me: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((n) => (n + 1) % 1e6), 100); return () => window.clearInterval(id); }, []);
  const now = performance.now(), t = (now - goPerf.current) / 1000;
  const list = standings(), mineIdx = list.findIndex((r) => r.me), mine = list[mineIdx];
  const total = list.length;
  const left = -t;
  return <div className="rush-hud" aria-live="off">
    {left > 3 && <div className="rush-grid-card">
      <small>CARROLLTON RUSH · {race.trips} TRIPS</small>
      <b>{isFinite(left) ? `Race starts in ${Math.ceil(left)}` : `Loading the grid · ${race.ready.size}/${total} ready`}</b>
      <span>Every fault adds seconds. Signal, stop, and keep to the limit.</span>
      <ol>{list.slice().sort((a, b) => a.slot - b.slot).map((r) => <li key={r.id}><i style={{ background: SWATCH[r.car] }} />{r.name}{r.me ? ' (you)' : ''}</li>)}</ol>
    </div>}
    {t >= 0 && mine && <div className="rush-pill">
      <b>{mine.out ? OUT_TEXT[mine.out] ?? 'Out' : `P${mineIdx + 1}`}<small>/{total}</small></b>
      <span>{fmtTime(mine.done || Math.max(0, Math.min(t, RACE_LIMIT_S)))}</span>
      {mine.pen > 0 && <em>+{mine.pen}s</em>}
    </div>}
    {t >= 0 && <ol className="rush-board">
      {list.map((r: Racer, i) => <li key={r.id} className={`${r.me ? 'me' : ''}${r.out ? ' out' : ''}${r.done ? ' done' : ''}`}>
        <u>{i + 1}</u><i style={{ background: SWATCH[r.car] }} /><span>{r.name}</span>
        <em>{r.out ? OUT_TEXT[r.out] ?? 'Out' : r.done ? fmtTime(finalTime(r)) : `${r.trip}/${race.trips}`}</em>
        {r.pen > 0 && !r.out && <small>+{r.pen}s</small>}
      </li>)}
    </ol>}
    <div className="rush-feed">
      {race.feed.filter((f) => now - f.at < 6000).slice(-3).map((f) => <p key={f.id} className={f.tone}>{f.text}</p>)}
    </div>
    {mine?.done ? <div className="rush-done">FINISHED {ordinal(mineIdx + 1).toUpperCase()} · waiting for the others</div> : null}
    {void me}
    {void handle}
  </div>;
}

function Results({ me, amHost, onAgain, onLobby, onQuit }: { me: string; amHost: boolean; onAgain: () => void; onLobby: () => void; onQuit: () => void }) {
  const list = standings();
  const top = list.slice(0, 3);
  const mineIdx = list.findIndex((r) => r.id === me);
  const podium = [top[1], top[0], top[2]];
  useEffect(() => { if (mineIdx === 0 && !list[0]?.out) sound.fanfare?.(); }, [mineIdx, list]);
  return <div className="rush-results" role="dialog" aria-label="Race results">
    <div className="rush-results-card">
      <small>CARROLLTON RUSH · RESULTS</small>
      <h2>{mineIdx === 0 && !list[0]?.out ? 'You won the race!' : mineIdx >= 0 ? `You finished ${ordinal(mineIdx + 1)}` : 'Race over'}</h2>
      <div className="rush-podium">
        {podium.map((r, i) => r ? <div key={r.id} className={`step s${[2, 1, 3][i]}`}>
          <i style={{ background: SWATCH[r.car] }} /><b>{r.name}</b>
          <span>{r.out ? OUT_TEXT[r.out] ?? 'Out' : fmtTime(finalTime(r))}</span>
          <div className="block">{[2, 1, 3][i]}</div>
        </div> : <div key={i} className="step empty" />)}
      </div>
      <table className="rush-table">
        <thead><tr><th>#</th><th>Driver</th><th>Time</th><th>Faults</th><th>Total</th></tr></thead>
        <tbody>{list.map((r, i) => <tr key={r.id} className={r.id === me ? 'me' : ''}>
          <td>{i + 1}</td><td><i style={{ background: SWATCH[r.car] }} />{r.name}</td>
          <td>{r.done ? fmtTime(r.done) : `${r.trip}/${race.trips} trips`}</td>
          <td>{r.faults}{r.pen ? ` · +${r.pen}s` : ''}</td>
          <td><b>{r.out ? OUT_TEXT[r.out] ?? 'Out' : fmtTime(finalTime(r))}</b></td>
        </tr>)}</tbody>
      </table>
      <p className="rush-tip">Total = drive time + penalty seconds. A clean drive beats a fast one.</p>
      <div className="btn-row rush-btns">
        {amHost ? <button className="dk-btn dk-btn-gold" onClick={onAgain}>Race again</button> : <button className="dk-btn dk-btn-gold" onClick={onLobby}>Back to the room</button>}
        <button className="dk-btn dk-btn-outline" onClick={onQuit}>Leave</button>
      </div>
    </div>
  </div>;
}

export default function RushRace(props: RaceProps) {
  const { start, me, wire, amHost, onLobby, onQuit } = props;
  const slot = useMemo(() => [...start.roster].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).findIndex((p) => p.id === me), [start, me]);
  const my = start.roster.find((p) => p.id === me);
  const handle = useMemo(() => makeOpenHandle(start.s.difficulty, { seed: start.seed, trips: start.s.trips, slot: Math.max(0, slot) }), [start, slot]);
  const { over, goPerf } = useRaceLogic(props, handle);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    minimapExtras.dots = () => [...race.racers.values()].filter((r) => !r.me && r.hasPose && !r.out).map((r) => ({ x: r.rx, z: r.rz, color: SWATCH[r.car] ?? '#f2b92a' }));
    return () => { minimapExtras.dots = null; };
  }, []);
  const again = () => { wire.send({ t: 'lobby' }); onLobby(); };
  return <div className="game-wrap rt3d-on rush-race">
    <SiteHeader bar onBrand={() => setAsk(true)} actions={<>
      <button type="button" className="n2-book rt-quit" onClick={() => setAsk(true)} aria-label="Leave the race">← Leave</button>
      <AudioSettingsButton />
    </>} />
    <div className="game-topbar-hint">↑ gas · ↓ brake/reverse · ←→ steer · Q/E signal · R back on road</div>
    <div className="game-host rt3d-host">
      <OpenGame handle={handle} onComplete={() => { /* the race shows its own results */ }} onLost={onQuit} extra3d={<Rivals lite />} overlay={<RushHud handle={handle} goPerf={goPerf} me={me} />} track="rushHour" title="Carrollton Rush" carOverride={my?.car} />
    </div>
    <TouchControls />
    {over && <Results me={me} amHost={amHost} onAgain={again} onLobby={onLobby} onQuit={onQuit} />}
    {ask && <div className="dk-modal-backdrop" onClick={() => setAsk(false)}>
      <div className="dk-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
        <h2 style={{ marginTop: 0 }}>Leave the race?</h2>
        <p style={{ opacity: 0.85 }}>The others keep racing. You can rejoin the room with the same code.</p>
        <div className="btn-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button className="dk-btn dk-btn-ghost" onClick={() => setAsk(false)}>Keep racing</button>
          <button className="dk-btn dk-btn-outline" onClick={onQuit}>Leave</button>
        </div>
      </div>
    </div>}
  </div>;
}
