import { useState } from 'react';
import { CalendarDays, Compass, GraduationCap, Infinity as InfinityIcon, Map as MapIcon, Octagon, Route, Star, Users } from 'lucide-react';

type Filter = 'all' | 'multiplayer' | 'solo' | 'endless';

export interface ModeTile {
  id: string;
  title: string;
  sub: string;
  tags: Filter[];
  /** the pill in the corner */
  kind: string;
  icon: 'users' | 'map' | 'infinity' | 'star' | 'route' | 'compass' | 'grad' | 'calendar' | 'sign';
  stat: string;
  cta: string;
  hue: string;
  onPick: () => void;
}

const ICONS = { users: Users, map: MapIcon, infinity: InfinityIcon, star: Star, route: Route, compass: Compass, grad: GraduationCap, calendar: CalendarDays, sign: Octagon } as const;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All modes' },
  { id: 'multiplayer', label: 'Multiplayer' },
  { id: 'solo', label: 'Solo' },
  { id: 'endless', label: 'Endless' },
];

/** The lobby of the game: every way to play, in one grid, with the live multiplayer race on top. */
export function GameModes({ featured, tiles }: { featured: ModeTile | null; tiles: ModeTile[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = tiles.filter((t) => filter === 'all' || t.tags.includes(filter));
  const showFeatured = featured && (filter === 'all' || featured.tags.includes(filter));
  return (
    <section className="gm" id="rt-modes" aria-label="Game modes">
      <div className="gm-head">
        <h2>Pick a game</h2>
        <span>{tiles.length + (featured ? 1 : 0)} ways to play</span>
      </div>
      <div className="gm-chips" role="tablist" aria-label="Filter game modes">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={`gm-chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      <div className="gm-grid">
        {showFeatured && featured && (
          <button className="gm-tile gm-featured" style={{ ['--h' as string]: featured.hue }} onClick={featured.onPick}>
            <span className="gm-live"><i aria-hidden="true" />LIVE</span>
            <span className="gm-ico" aria-hidden="true"><Users size={30} /></span>
            <span className="gm-body">
              <span className="gm-kind">{featured.kind}</span>
              <strong>{featured.title}</strong>
              <small>{featured.sub}</small>
            </span>
            <span className="gm-go">{featured.cta}</span>
          </button>
        )}
        {shown.map((t) => {
          const Icon = ICONS[t.icon];
          return (
            <button key={t.id} className="gm-tile" style={{ ['--h' as string]: t.hue }} onClick={t.onPick}>
              <span className="gm-top">
                <span className="gm-ico" aria-hidden="true"><Icon size={22} /></span>
                <span className="gm-kind">{t.kind}</span>
              </span>
              <strong>{t.title}</strong>
              <small>{t.sub}</small>
              <span className="gm-foot"><b>{t.stat}</b><em>{t.cta}</em></span>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && !showFeatured && <p className="gm-empty">No modes in this group.</p>}
    </section>
  );
}
