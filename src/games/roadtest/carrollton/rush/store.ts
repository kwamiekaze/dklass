/** Carrollton Rush: what this phone knows about everyone in the race. Plain mutable state, read every frame by the 3D rivals, the minimap and the HUD. */
import type { GarageId } from '../../g3d/garage';
import type { RushMsg, RushPlayer } from './net';

export interface Racer {
  id: string; name: string; car: GarageId; slot: number; me: boolean;
  /** last reported pose, and the smoothed pose that is drawn */
  x: number; z: number; h: number; v: number; sig: number; rx: number; rz: number; rh: number; seen: number; hasPose: boolean;
  trip: number; pen: number; faults: number; strikes: number; score: number;
  /** race time in seconds when the last trip was done (0 = still driving) */
  done: number;
  /** why the drive ended early: '' | 'SUSPENDED' | 'PEDESTRIAN' | 'TRAIN' | 'LEFT' | 'DNF' */
  out: string;
}

export interface FeedItem { id: number; text: string; tone: 'good' | 'bad' | 'info'; at: number }

/** seconds added to the race time for each kind of fault: the faster driver can still lose to the cleaner one */
export const PENALTY: Record<string, number> = { minor: 3, major: 8, strike: 20 };
export const RACE_LIMIT_S = 8 * 60;
export const STALE_MS = 9000;

export const race = {
  on: false,
  myId: '',
  trips: 3,
  racers: new Map<string, Racer>(),
  feed: [] as FeedItem[],
  goAt: 0,           // performance.now() of the green light
  seq: 0,
  ready: new Set<string>(),
};

export function resetRace(myId: string, roster: RushPlayer[], trips: number) {
  race.on = true; race.myId = myId; race.trips = trips; race.feed = []; race.goAt = 0; race.seq = 0; race.ready = new Set();
  race.racers.clear();
  const sorted = [...roster].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  sorted.forEach((p, i) => race.racers.set(p.id, {
    id: p.id, name: p.name, car: p.car, slot: i, me: p.id === myId,
    x: 0, z: 0, h: 0, v: 0, sig: 0, rx: 0, rz: 0, rh: 0, seen: performance.now(), hasPose: false,
    trip: 0, pen: 0, faults: 0, strikes: 0, score: 0, done: 0, out: '',
  }));
}

export function pushFeed(text: string, tone: FeedItem['tone']) {
  race.feed.push({ id: ++race.seq, text, tone, at: performance.now() });
  if (race.feed.length > 6) race.feed.shift();
}

/** a state message from another phone */
export function applyState(m: Extract<RushMsg, { t: 'st' }>) {
  const r = race.racers.get(m.id); if (!r || r.me) return;
  if (!r.hasPose) { r.rx = m.x; r.rz = m.z; r.rh = m.h; r.hasPose = true; }
  r.x = m.x; r.z = m.z; r.h = m.h; r.v = m.v; r.sig = m.sig; r.seen = performance.now();
  r.trip = m.trip; r.pen = m.pen; r.faults = m.faults; r.strikes = m.strikes; r.score = m.score;
  if (m.done && !r.done) r.done = m.done;
  if (m.out && r.out !== m.out) r.out = m.out;
}

/** the final time of a racer (raw time + penalties), Infinity while not finished */
export const finalTime = (r: Racer) => (r.done > 0 ? r.done + r.pen : Infinity);

/** live order: finished first by final time, then by trips done, then fewer penalties; those out of the race last */
export function standings(): Racer[] {
  const list = [...race.racers.values()];
  return list.sort((a, b) => {
    const ao = a.out ? 1 : 0, bo = b.out ? 1 : 0;
    if (ao !== bo) return ao - bo;
    const af = finalTime(a), bf = finalTime(b);
    if (af !== bf) return af - bf;
    if (a.trip !== b.trip) return b.trip - a.trip;
    if (a.pen !== b.pen) return a.pen - b.pen;
    return b.score - a.score;
  });
}

export const fmtTime = (s: number) => { if (!isFinite(s)) return '--:--'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
