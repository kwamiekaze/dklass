/**
 * The Georgia Passport: what keeps a driver coming back to Free Roam.
 *
 * Every numbered exit of the network is a stamp. Driving past an exit sees it; taking it collects it. New roads, miles, finished road trips and a
 * daily streak all pay driver XP, and XP climbs a ladder of ranks. Road trips are real routes (Carrollton to LaGrange, Atlanta to the Alabama line)
 * with a GPS that reads the same exit numbers the signs show. Everything is kept on the device; nothing here changes the score of a drive.
 */
import { allExits, freeLeg, type ExitInfo } from './freeroam';
import type { AtlStage } from './stageTypes';

const KEY = 'dk-ga-passport-v1';
export interface PassportState {
  v: 1;
  /** exit key -> 1 seen (driven past), 2 taken */
  exits: Record<string, 1 | 2>;
  roads: Record<string, 1>;
  miles: number;
  xp: number;
  /** last day driven (YYYY-MM-DD, local) and the run of days in a row */
  day: string; streak: number;
  /** trip id -> times finished */
  trips: Record<string, number>;
}
const fresh = (): PassportState => ({ v: 1, exits: {}, roads: {}, miles: 0, xp: 0, day: '', streak: 0, trips: {} });

let mem: PassportState | null = null;
export function loadPassport(): PassportState {
  if (mem) return mem;
  try { const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null; if (raw) { const p = JSON.parse(raw) as PassportState; if (p && p.v === 1) return (mem = { ...fresh(), ...p }); } } catch { /* storage blocked or bad data: start over */ }
  return (mem = fresh());
}
export function savePassport(p: PassportState) { mem = p; try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }
/** tests only */
export function resetPassport() { mem = fresh(); }

export const XP = { seen: 10, taken: 40, road: 25, mile: 6, trip: 250, day: 40 };
export const RANKS: { xp: number; name: string }[] = [
  { xp: 0, name: 'Learner' }, { xp: 150, name: 'New Driver' }, { xp: 450, name: 'Road Rookie' }, { xp: 900, name: 'Lane Keeper' }, { xp: 1600, name: 'Highway Regular' },
  { xp: 2600, name: 'Interstate Pro' }, { xp: 4000, name: 'Metro Navigator' }, { xp: 6000, name: 'Perimeter Master' }, { xp: 8500, name: 'Georgia Road Scholar' }, { xp: 12000, name: '5-Star Legend' },
];
export function rankOf(xp: number) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1]!.xp) i++;
  const cur = RANKS[i]!, next = RANKS[i + 1];
  return { level: i + 1, name: cur.name, next: next?.name ?? null, into: xp - cur.xp, span: next ? next.xp - cur.xp : 1, frac: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayBefore = (s: string) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y!, m! - 1, d! - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };

export interface Gain { xp: number; title: string; sub: string; tone: 'exit' | 'road' | 'trip' | 'rank' | 'streak' }

/** The first drive of the day keeps the streak alive. */
export function touchDay(p: PassportState, now = today()): Gain | null {
  if (p.day === now) return null;
  p.streak = p.day && dayBefore(now) === p.day ? p.streak + 1 : 1; p.day = now;
  const xp = XP.day * Math.min(7, p.streak); p.xp += xp;
  return { xp, title: p.streak > 1 ? `${p.streak} DAY STREAK` : 'DAILY DRIVE', sub: p.streak > 1 ? 'Come back tomorrow to keep it going' : 'Drive again tomorrow to start a streak', tone: 'streak' };
}
export function stampExit(p: PassportState, info: ExitInfo, taken: boolean): Gain | null {
  const had = p.exits[info.key] ?? 0, want = taken ? 2 : 1;
  if (had >= want) return null;
  p.exits[info.key] = want as 1 | 2;
  const xp = taken ? XP.taken - (had ? XP.seen : 0) : XP.seen; p.xp += xp;
  return { xp, title: `${taken ? 'EXIT COLLECTED' : 'NEW EXIT'} · ${info.no}`, sub: `${info.road} · ${info.label}`, tone: 'exit' };
}
export function stampRoad(p: PassportState, id: string, name: string): Gain | null {
  if (p.roads[id]) return null; p.roads[id] = 1; p.xp += XP.road;
  return { xp: XP.road, title: 'NEW ROAD', sub: name, tone: 'road' };
}
export function addMiles(p: PassportState, miles: number) { if (miles > 0) { p.miles += miles; p.xp += Math.round(miles * XP.mile); } }

export function passportStats(p: PassportState) {
  const all = allExits(); let seen = 0, taken = 0;
  for (const e of all) { const v = p.exits[e.key]; if (v) seen++; if (v === 2) taken++; }
  return { total: all.length, seen, taken, roads: Object.keys(p.roads).length, miles: p.miles, rank: rankOf(p.xp), xp: p.xp, streak: p.day === today() || p.day === dayBefore(today()) ? p.streak : 0 };
}

// ------------------------------------------------------------------ road trips and the GPS ---
export interface Trip { id: string; title: string; sub: string; start: string; dest: string; destName: string }
export const TRIPS: Trip[] = [
  { id: 'car-lag', title: 'Carrollton to LaGrange', sub: 'US-27 South through Roopville and Franklin', start: 'maple', dest: 'lagrange', destName: 'Downtown LaGrange' },
  { id: 'atl-car', title: 'Atlanta to Carrollton', sub: 'The Connector, I-20 West, then US-27 or GA-113', start: 'con-s', dest: 'maple', destName: 'Downtown Carrollton' },
  { id: 'lag-atl', title: 'LaGrange to Midtown', sub: 'I-85 North past Newnan and the airport', start: 'lagrange', dest: 'peachtree', destName: 'Peachtree Street' },
  { id: 'car-air', title: 'Carrollton to the Airport', sub: 'I-20 East, the Perimeter, Camp Creek Parkway', start: 'maple', dest: 'camp-creek', destName: 'Camp Creek Parkway' },
  { id: 'atl-al', title: 'Midtown to the Alabama line', sub: 'I-20 West to the end of Georgia', start: 'peachtree', dest: 'i20-e-out', destName: 'the state line' },
  { id: 'doug-new', title: 'Douglasville to Newnan', sub: 'Across the south side to Bullsboro Drive', start: 'douglasville', dest: 'newnan', destName: 'Newnan' },
  { id: 'lag-car', title: 'LaGrange to Carrollton', sub: 'US-27 North, the back way home', start: 'lagrange', dest: 'maple', destName: 'Downtown Carrollton' },
  { id: 'mid-kenn', title: 'Midtown to Kennesaw', sub: 'I-75 North through Cobb County', start: 'peachtree', dest: 'barrett', destName: 'Barrett Parkway' },
];
let tripId: string | null = null;
try { tripId = typeof window !== 'undefined' ? window.sessionStorage.getItem('atl-free-trip') : null; } catch { /* ignore */ }
export const getTrip = (): Trip | null => TRIPS.find((t) => t.id === tripId) ?? null;
export function setTrip(id: string | null) { tripId = id; try { if (id) window.sessionStorage.setItem('atl-free-trip', id); else window.sessionStorage.removeItem('atl-free-trip'); } catch { /* ignore */ } }

const baseOf = (legId: string) => legId.replace(/^atl-fr-/, '').replace(/@.*$/, '');
export interface Guidance { arrived: boolean; text: string; sub: string; icon: 'up' | 'right' | 'left' | 'flag'; meters: number; hops: number }

/** The shortest way from this leg to the destination, and what to do on this leg. Dijkstra over the leg graph; distances are the condensed metres. */
export function guide(from: AtlStage, dest: string): Guidance | null {
  if (baseOf(from.id) === dest) return { arrived: true, text: 'You have arrived', sub: '', icon: 'flag', meters: 0, hops: 0 };
  type Edge = { to: string; cost: number; text: string; sub: string; icon: Guidance['icon'] };
  const edges = (st: AtlStage): Edge[] => {
    const L = st.lengthM, out: Edge[] = [];
    for (const e of st.exits ?? []) {
      const kind = e.kind ?? 'exit', cost = e.at * L, sub = e.dests.join(' · ');
      if (kind === 'exit' && e.to) out.push({ to: e.to, cost, text: `Take EXIT ${e.no ?? ''}`.trim(), sub, icon: 'right' });
      else if (kind === 'fork') { if (e.toLeft) out.push({ to: e.toLeft, cost, text: 'Keep LEFT at the split', sub, icon: 'left' }); if (e.to) out.push({ to: e.to, cost, text: 'Keep RIGHT at the split', sub: e.also?.[0]?.dests.join(' · ') ?? sub, icon: 'right' }); }
      else if (e.to) out.push({ to: e.to, cost, text: `Turn ${kind === 'left' ? 'LEFT' : 'RIGHT'}`, sub: e.street ?? sub, icon: kind === 'left' ? 'left' : 'right' });
    }
    if (st.next) out.push({ to: st.next, cost: L, text: `Stay on ${st.roadName}`, sub: 'Keep going to the end of this stretch', icon: 'up' });
    return out;
  };
  const dist = new Map<string, number>([[from.id, 0]]), first = new Map<string, Edge>(), hops = new Map<string, number>([[from.id, 0]]), done = new Set<string>();
  for (let guard = 0; guard < 900; guard++) {
    let cur: string | null = null, best = Infinity;
    for (const [k, v] of dist) if (!done.has(k) && v < best) { best = v; cur = k; }
    if (cur === null) return null;
    done.add(cur);
    if (cur !== from.id && baseOf(cur) === dest) { const f = first.get(cur)!; return { arrived: false, text: f.text, sub: f.sub, icon: f.icon, meters: best, hops: hops.get(cur) ?? 1 }; }
    let st: AtlStage; try { st = freeLeg(cur); } catch { continue; }
    for (const e of edges(st)) {
      let toId: string; try { toId = freeLeg(e.to).id; } catch { continue; }
      const nd = best + e.cost;
      if (nd < (dist.get(toId) ?? Infinity)) { dist.set(toId, nd); first.set(toId, cur === from.id ? e : first.get(cur)!); hops.set(toId, (hops.get(cur) ?? 0) + 1); }
    }
  }
  return null;
}
