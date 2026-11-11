import { useEffect, useMemo, useRef, useState } from 'react';
import type { AtlHandle } from './Game';
import { allExits, exitKey } from './freeroam';
import { addMiles, getTrip, guide, loadPassport, passportStats, rankOf, savePassport, setTrip, stampExit, stampRoad, touchDay, XP, type Gain, type Guidance } from './passport';

/**
 * The Free Roam layer over the game: the GPS line for a road trip, the stamps that pop when an exit or a road is new, and the passport meter.
 * It only watches the drive (which exits have gone by, which leg this is); it never touches the score or the rules.
 */
export function FreeHud({ handle, legNo }: { handle: AtlHandle; legNo: number }) {
  const sim = handle.sim, st = sim.stage;
  const byKey = useMemo(() => new Map(allExits().map((e) => [e.key, e])), []);
  const [toasts, setToasts] = useState<(Gain & { id: number })[]>([]);
  const [stats, setStats] = useState(() => passportStats(loadPassport()));
  const [nav, setNav] = useState<Guidance | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const nextId = useRef(1), lastMiles = useRef(0);
  const push = (g: Gain | null) => { if (!g) return; const id = nextId.current++; setToasts((t) => [...t.slice(-2), { ...g, id }]); window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600); };

  // a new leg: the day's streak, a new road, and the GPS for this stretch
  useEffect(() => {
    const p = loadPassport(), before = rankOf(p.xp).level;
    if (legNo === 0) push(touchDay(p));
    push(stampRoad(p, st.id.replace(/^atl-fr-/, '').replace(/@.*$/, ''), st.name));
    const trip = getTrip();
    if (trip) {
      const g = guide(st, trip.dest);
      if (g?.arrived) {
        p.trips[trip.id] = (p.trips[trip.id] ?? 0) + 1; p.xp += XP.trip; setTrip(null); setNav(null); setArrived(trip.destName);
        push({ xp: XP.trip, title: 'ROAD TRIP COMPLETE', sub: trip.title, tone: 'trip' });
        window.setTimeout(() => setArrived(null), 5200);
      } else setNav(g);
    } else setNav(null);
    const after = rankOf(p.xp); if (after.level > before) push({ xp: 0, title: `RANK UP · LEVEL ${after.level}`, sub: after.name, tone: 'rank' });
    savePassport(p); setStats(passportStats(p)); lastMiles.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.id, legNo]);

  // watch the exits go by
  useEffect(() => {
    const seen = new Set<string>();
    const id = window.setInterval(() => {
      const p = loadPassport(); let changed = false; const before = rankOf(p.xp).level;
      for (const b of sim.branches) {
        if (b.kind !== 'exit' || !b.no) continue;
        const k = exitKey(st, b.no); if (seen.has(k + (b.entered ? ':t' : ''))) continue;
        const info = byKey.get(k); if (!info) continue;
        if (b.entered) { seen.add(k + ':t'); const g = stampExit(p, info, true); if (g) { push(g); changed = true; } }
        else if (sim.traveled > b.d + 25) { seen.add(k); const g = stampExit(p, info, false); if (g) { push(g); changed = true; } }
      }
      const mi = sim.traveled / 1609; if (mi - lastMiles.current > 0.25) { addMiles(p, mi - lastMiles.current); lastMiles.current = mi; changed = true; }
      if (changed) { const after = rankOf(p.xp); if (after.level > before) push({ xp: 0, title: `RANK UP · LEVEL ${after.level}`, sub: after.name, tone: 'rank' }); savePassport(p); setStats(passportStats(p)); }
    }, 300);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, st.id]);

  const trip = getTrip();
  const miles = nav ? Math.max(0.1, nav.meters / 1609) : 0;
  return <div className="fh-layer" aria-live="polite">
    {nav && trip && <div className={`fh-gps fh-${nav.icon}`}>
      <span className="fh-gps-ic" aria-hidden>{nav.icon === 'left' ? '↰' : nav.icon === 'right' ? '↱' : '↑'}</span>
      <span className="fh-gps-tx"><b>{nav.text}</b><small>{nav.sub}</small></span>
      <span className="fh-gps-to"><small>TO</small><b>{trip.destName}</b><i>{miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi</i></span>
    </div>}
    {arrived && <div className="fh-arrived"><span>★</span><b>You have arrived</b><small>{arrived} · +{XP.trip} XP</small></div>}
    <div className="fh-toasts">{toasts.map((t) => <div key={t.id} className={`fh-toast fh-t-${t.tone}`}><b>{t.title}</b><small>{t.sub}</small>{t.xp > 0 && <i>+{t.xp} XP</i>}</div>)}</div>
    <div className="fh-pass" title="Georgia Passport">
      <span className="fh-pass-lv">{stats.rank.level}</span>
      <span className="fh-pass-tx"><b>{stats.rank.name}</b><small>{stats.seen}/{stats.total} exits{stats.streak > 1 ? ` · ${stats.streak} day streak` : ''}</small><span className="fh-bar"><span style={{ width: `${Math.round(stats.rank.frac * 100)}%` }} /></span></span>
    </div>
  </div>;
}
