/*
 * Who goes first? The rules of a stop-controlled intersection, as code.
 *
 * World: the intersection is at the origin, +x is east, +z is south, so north is -z. Both roads are 8 m wide (two 4 m lanes),
 * traffic keeps right. A car is named by the leg it comes FROM (a car from 'S' drives north). Heading vector h, its right r = (-h.z, h.x).
 * Car yaw follows the homepage fleet: forward = (cos yaw, -sin yaw).
 *
 * The rules (the Georgia Driver's Manual ones students are tested on):
 *   1. Stop at the line. The car that stopped FIRST goes first.
 *   2. Stopped at the same time: yield to the car on your RIGHT.
 *   3. Stopped at the same time, facing each other: the car turning LEFT yields to the car going straight or turning right.
 *   4. A road with no stop sign does not stop. Its traffic keeps the right of way, and stopped cars wait for it.
 * Cars that cannot hit each other never have to wait for each other.
 */

export type Dir = 'N' | 'E' | 'S' | 'W';
export type Move = 'straight' | 'left' | 'right';
export type CarModel = 'hero' | 'camry' | 'corolla' | 'civic' | 'elantra' | 'sentra';
export type Vec = [number, number];

export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
/** Where each leg lies, as a unit vector from the middle of the intersection. */
export const LEG: Record<Dir, Vec> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const opposite = (d: Dir): Dir => ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[d];
/** Heading of a car that comes from this leg. */
export const heading = (d: Dir): Vec => [-LEG[d][0], -LEG[d][1]];
export const rightOf = (h: Vec): Vec => [-h[1], h[0]];
const legAt = (v: Vec): Dir => DIRS.find(d => LEG[d][0] === Math.round(v[0]) && LEG[d][1] === Math.round(v[1]))!;

/** The leg a car leaves by. */
export function exitLeg(from: Dir, move: Move): Dir {
  const h = heading(from), r = rightOf(h);
  return legAt(move === 'straight' ? h : move === 'right' ? r : [-r[0], -r[1]]);
}

export const ROAD_HALF = 4;          // half the road width: the intersection box runs from -4 to 4
export const LANE = 2;               // distance of a lane's centre from the road's middle
export const STOP_LINE = 6.9;        // distance of the stop bar from the middle of the intersection
export const LEAD = 60;              // how far before the box every path begins

export type Pt = { x: number; z: number; yaw: number };
export type Path = {
  /** Distance along the path where the car's middle enters and leaves the box. */
  enter: number; leave: number; len: number;
  at: (s: number) => Pt;
  /** Sampled middle line, inside the box only (for the conflict test). */
  box: Vec[];
};

const pathCache = new Map<string, Path>();

/** The driven line of one movement. Straight is a line; right is a quarter circle of radius 2; left is 2 m straight then a quarter circle of radius 4. */
export function buildPath(from: Dir, move: Move): Path {
  const key = from + move, hit = pathCache.get(key); if (hit) return hit;
  const h = heading(from), r = rightOf(h), l: Vec = [-r[0], -r[1]];
  const P = (a: number, b: number, c = 0, d = 0): Vec => [h[0] * a + r[0] * b + l[0] * c + h[0] * d, h[1] * a + r[1] * b + l[1] * c + h[1] * d];
  const pts: Vec[] = [];
  const line = (a: Vec, b: Vec, step = .25) => { const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let i = 0; i < n; i++) pts.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); };
  const E = P(-ROAD_HALF, LANE);                                            // entry of the box
  line(P(-ROAD_HALF - LEAD, LANE), E);
  const enterIdx = pts.length;
  let exitPt: Vec, exitDir: Vec;
  if (move === 'straight') { exitPt = P(ROAD_HALF, LANE); exitDir = h; line(E, exitPt); }
  else if (move === 'right') {
    const R = 2, C = P(-4, 4);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI / 2; pts.push([C[0] + R * (-r[0] * Math.cos(a) + h[0] * Math.sin(a)), C[1] + R * (-r[1] * Math.cos(a) + h[1] * Math.sin(a))]); }
    exitPt = [C[0] + R * h[0], C[1] + R * h[1]]; exitDir = r;
  } else {
    const R = 4, P0 = P(-2, 2), C: Vec = [P0[0] + l[0] * R, P0[1] + l[1] * R];
    line(E, P0);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI / 2; pts.push([C[0] + R * (r[0] * Math.cos(a) + h[0] * Math.sin(a)), C[1] + R * (r[1] * Math.cos(a) + h[1] * Math.sin(a))]); }
    exitPt = [C[0] + R * h[0], C[1] + R * h[1]]; exitDir = l;
  }
  line(exitPt, [exitPt[0] + exitDir[0] * 44, exitPt[1] + exitDir[1] * 44]);
  pts.push([exitPt[0] + exitDir[0] * 44, exitPt[1] + exitDir[1] * 44]);
  let leaveIdx = enterIdx; while (leaveIdx < pts.length - 1 && Math.max(Math.abs(pts[leaveIdx]![0]), Math.abs(pts[leaveIdx]![1])) <= ROAD_HALF + 1e-6) leaveIdx++;
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const at = (s: number): Pt => {
    const q = Math.max(0, Math.min(cum[cum.length - 1]!, s)); let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m]! <= q) lo = m; else hi = m; }
    const a = pts[lo]!, b = pts[hi]!, k = (q - cum[lo]!) / Math.max(1e-6, cum[hi]! - cum[lo]!);
    // smooth the heading over a short window so the car never snaps at the joints
    const w = (u: number) => { const i0 = Math.max(0, Math.min(pts.length - 2, lo + u)); return Math.atan2(-(pts[i0 + 1]![1] - pts[i0]![1]), pts[i0 + 1]![0] - pts[i0]![0]); };
    let y0 = w(-2), y1 = w(2); let dy = y1 - y0; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: y0 + dy * .5 };
  };
  const out: Path = { enter: cum[enterIdx]!, leave: cum[leaveIdx]!, len: cum[cum.length - 1]!, at, box: pts.slice(enterIdx, leaveIdx) };
  pathCache.set(key, out); return out;
}

/** Distance along the path where a car of length L stands when its nose is at the stop bar. */
export const stopS = (from: Dir, move: Move, L: number) => buildPath(from, move).enter - (STOP_LINE - ROAD_HALF) - L / 2 - .25;

// ------------------------------------------------------------------ conflicts

const conflictCache = new Map<string, boolean>();
/** Two movements conflict when their lines come within a car's width of each other anywhere in the box (cross, merge). */
export function conflicts(a: { from: Dir; move: Move }, b: { from: Dir; move: Move }): boolean {
  if (a.from === b.from) return true;                                      // one lane: never two cars of one approach at once
  const k = a.from + a.move + b.from + b.move, hit = conflictCache.get(k); if (hit !== undefined) return hit;
  // two opposite left turns pass in front of each other
  if (opposite(a.from) === b.from && a.move === 'left' && b.move === 'left') { conflictCache.set(k, false); return false; }
  const A = buildPath(a.from, a.move).box, B = buildPath(b.from, b.move).box;
  let yes = false;
  for (let i = 0; i < A.length && !yes; i++) for (let j = 0; j < B.length; j++) if (Math.hypot(A[i]![0] - B[j]![0], A[i]![1] - B[j]![1]) < 2.25) { yes = true; break; }
  conflictCache.set(k, yes); return yes;
}

// ------------------------------------------------------------------ the scenario

export type Layout = {
  /** 'all' every leg has a stop sign; 'minor' only the side street has one. */
  kind: 'all' | 'minor';
  legs: Dir[];
  stops: Dir[];
};

export type CarSpec = {
  id: string;
  from: Dir;
  move: Move;
  model: CarModel;
  /** Rank of the moment it stops: 0 first, equal ranks stop together. -1: no stop sign, it keeps rolling. */
  rank: number;
  you?: boolean;
};

export type Reason = 'first' | 'right' | 'left' | 'cross' | 'free';

export type Scenario = {
  id: string;
  layout: Layout;
  cars: CarSpec[];
  lesson: Reason;
  seed: number;
};

/** Does `a` have to be let go before `b`? 1: yes, -1: b first, 0: nothing decides it. Only asked of cars that conflict. */
export function before(a: CarSpec, b: CarSpec): 1 | -1 | 0 {
  if (a.rank !== b.rank) return a.rank < b.rank ? 1 : -1;
  if (opposite(a.from) === b.from) {
    const la = a.move === 'left', lb = b.move === 'left';
    if (la && !lb) return -1; if (!la && lb) return 1; return 0;
  }
  const ra = rightOf(heading(a.from)), rb = rightOf(heading(b.from));
  // a is to the right of b when b's right-hand side points at a's leg
  if (rb[0] === LEG[a.from][0] && rb[1] === LEG[a.from][1]) return 1;
  if (ra[0] === LEG[b.from][0] && ra[1] === LEG[b.from][1]) return -1;
  return 0;
}

/** Why `winner` goes before `loser`: the rule that decides it. */
export function ruleBetween(winner: CarSpec, loser: CarSpec): Reason {
  if (winner.rank === -1 && loser.rank !== -1) return 'cross';
  if (winner.rank !== loser.rank) return 'first';
  if (opposite(winner.from) === loser.from) return 'left';
  return 'right';
}

/** Cars that may go now: nobody left behind conflicts with them and has the right of way. null when the situation is a dead end. */
export function mayGo(left: CarSpec[]): CarSpec[] | null {
  const ok: CarSpec[] = [];
  for (const c of left) {
    let blocked = false;
    for (const o of left) {
      if (o === c || !conflicts(c, o)) continue;
      const b = before(o, c);
      if (b !== -1) { blocked = true; break; }   // o goes first, or nothing decides it
    }
    if (!blocked) ok.push(c);
  }
  return ok.length ? ok : null;
}

/** The cars that stand in the way of `c`: they conflict with it and go first (or nothing decides it). */
export function blockersOf(left: CarSpec[], c: CarSpec): CarSpec[] {
  return left.filter(o => o !== c && conflicts(c, o) && before(o, c) !== -1);
}

/** The whole order the cars go in, one at a time; null if it ever dead-ends. Ties between cars that do not matter break the same way every time. */
export function fullOrder(cars: CarSpec[]): CarSpec[] | null {
  const left = [...cars], out: CarSpec[] = [];
  while (left.length) {
    const ok = mayGo(left); if (!ok) return null;
    ok.sort((a, b) => a.rank - b.rank || DIRS.indexOf(a.from) - DIRS.indexOf(b.from));
    out.push(ok[0]!); left.splice(left.indexOf(ok[0]!), 1);
  }
  return out;
}

/** Say why `pick` has to wait, and why `right` may go, in plain words. */
export function explain(cars: CarSpec[], pick: CarSpec, right: CarSpec, name: (c: CarSpec) => string): { why: string; rule: Reason } {
  const others = cars.filter(c => c !== right);
  const rule = ruleBetween(right, pick);
  const R = name(right), P = name(pick);
  void others;
  switch (rule) {
    case 'cross': return { rule, why: `${R} has no stop sign, so it keeps the right of way. Stopped cars wait until the road is clear.` };
    case 'first': return { rule, why: `${R} stopped before ${P}. First to stop is first to go.` };
    case 'left': return { rule, why: `${R} is going ${right.move === 'right' ? 'right' : 'straight'} and ${P} is turning left. A left turn yields to oncoming traffic.` };
    default: return { rule, why: `They stopped together, and ${R} is on ${P}'s right. Yield to the car on your right.` };
  }
}

export function explainCorrect(cars: CarSpec[], right: CarSpec, name: (c: CarSpec) => string): { why: string; rule: Reason } {
  const rivals = cars.filter(c => c !== right && conflicts(c, right));
  if (!rivals.length) return { rule: 'free', why: `${name(right)} does not cross anyone's path, so it is free to go.` };
  // the strongest reason: prefer an arrival-order rule, then the tie rules
  const pri = (r: Reason) => ({ cross: 0, first: 1, left: 2, right: 3, free: 4 }[r]);
  const best = rivals.map(o => ({ o, rule: ruleBetween(right, o) })).sort((a, b) => pri(a.rule) - pri(b.rule))[0]!;
  const R = name(right), O = name(best.o);
  switch (best.rule) {
    case 'cross': return { rule: 'cross', why: `${R} has no stop sign and keeps rolling, so it goes first. Stopped cars wait for it.` };
    case 'first': return { rule: 'first', why: `${R} stopped before ${O}. First to stop is first to go.` };
    case 'left': return { rule: 'left', why: `${O} is turning left, so it yields to ${R}, which is going ${right.move === 'right' ? 'right' : 'straight'}.` };
    default: return { rule: 'right', why: `${R} and ${O} stopped together, and ${R} is on the right. Yield to the car on your right.` };
  }
}

// ------------------------------------------------------------------ generation

export const MODELS: CarModel[] = ['hero', 'camry', 'corolla', 'civic', 'elantra', 'sentra'];
export const CAR_NAME: Record<CarModel, string> = { hero: 'yellow', camry: 'teal', corolla: 'white', civic: 'mint', elantra: 'red', sentra: 'green' };
export const CAR_HEX: Record<CarModel, string> = { hero: '#f7c600', camry: '#1f7a7a', corolla: '#f3f3f0', civic: '#46d19a', elantra: '#e0262e', sentra: '#2cb34a' };
export const CAR_SYNONYM: Partial<Record<CarModel, CarModel>> = { civic: 'sentra', sentra: 'civic' };   // the two greens never share a street

function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = <T,>(a: T[], r: () => number) => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j]!, o[i]!]; } return o; };
const pickOne = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)]!;

export type Kind = 'four-all' | 'three-all' | 'four-minor' | 'three-minor';
export const KIND_LABEL: Record<Kind, string> = { 'four-all': '4-way stop', 'three-all': '3-way stop', 'four-minor': 'Stop sign on your street only', 'three-minor': 'T-intersection, side street stops' };

function layoutFor(kind: Kind, r: () => number): Layout {
  if (kind === 'four-all') return { kind: 'all', legs: [...DIRS], stops: [...DIRS] };
  if (kind === 'three-all') { const gone = pickOne(DIRS, r); const legs = DIRS.filter(d => d !== gone); return { kind: 'all', legs, stops: legs }; }
  if (kind === 'four-minor') { const ns = r() < .5; return { kind: 'minor', legs: [...DIRS], stops: ns ? ['N', 'S'] : ['E', 'W'] }; }
  // T: the stem is the only stopped leg
  const stem = pickOne(DIRS, r); const legs = DIRS.filter(d => d !== opposite(stem));
  return { kind: 'minor', legs, stops: [stem] };
}

const movesFrom = (layout: Layout, from: Dir): Move[] => (['straight', 'left', 'right'] as Move[]).filter(m => layout.legs.includes(exitLeg(from, m)));

/** A random scenario that has a clean answer at every step: no deadlock, and the first question has exactly one right car most of the time. */
export function makeScenario(seed: number, want?: Kind): Scenario {
  for (let attempt = 0; attempt < 400; attempt++) {
    const r = mulberry(seed * 977 + attempt * 131 + 7);
    const kinds: Kind[] = ['four-all', 'four-all', 'three-all', 'four-minor', 'three-minor'];
    const kind = want ?? pickOne(kinds, r);
    const layout = layoutFor(kind, r);
    const stopped = layout.stops, free = layout.legs.filter(d => !layout.stops.includes(d));
    const nStop = Math.min(stopped.length, 2 + Math.floor(r() * 3));
    const nFree = layout.kind === 'minor' ? (r() < .55 ? 1 : 0) + (r() < .2 ? 1 : 0) : 0;
    if (nStop + nFree < 2 || nStop + nFree > 4) continue;
    const froms = [...shuffle(stopped, r).slice(0, nStop), ...shuffle(free, r).slice(0, nFree)];
    // ranks: stopped cars share some ranks (ties teach the right-hand rule); a rank is a moment, not a number of seconds
    const maxRank = Math.max(0, Math.min(nStop - 1, 1 + Math.floor(r() * 2)));
    const models = shuffle(MODELS, r); const used = new Set<CarModel>(); const picked: CarModel[] = [];
    for (const m of models) { if (used.has(CAR_SYNONYM[m]!)) continue; used.add(m); picked.push(m); }
    const cars: CarSpec[] = froms.map((from, i) => {
      const moves = movesFrom(layout, from);
      const mv = pickOne(moves.length > 1 && r() < .6 ? moves : [...moves, ...moves.filter(m => m === 'straight')], r);
      const isFree = layout.stops.includes(from) === false;
      return { id: `c${i}`, from, move: mv, model: picked[i]!, rank: isFree ? -1 : Math.floor(r() * (maxRank + 1)) };
    });
    // the ranks used by stopped cars must be 0..k with no gaps
    const used2 = [...new Set(cars.filter(c => c.rank >= 0).map(c => c.rank))].sort((a, b) => a - b);
    cars.forEach(c => { if (c.rank >= 0) c.rank = used2.indexOf(c.rank); });
    const order = fullOrder(cars); if (!order) continue;
    const first = mayGo(cars)!;
    if (first.length > 1 && r() < .75) continue;       // mostly questions with one right answer
    // a tie only teaches when the tied cars matter to each other
    const stoppedCars = cars.filter(c => c.rank >= 0);
    const tied = stoppedCars.some(a => stoppedCars.some(b => a !== b && a.rank === b.rank && conflicts(a, b)));
    const hasCross = cars.some(c => c.rank === -1);
    const left = cars.some(c => c.move === 'left' && cars.some(o => o !== c && opposite(o.from) === c.from && o.rank === c.rank && o.move !== 'left'));
    const lesson: Reason = hasCross ? 'cross' : left ? 'left' : tied ? 'right' : 'first';
    // a car that is you: one of the stopped ones, most of the time
    if (r() < .7) { const mine = pickOne(stoppedCars, r); mine.you = true; }
    return { id: `s${seed}-${attempt}`, layout, cars, lesson, seed };
  }
  // cannot happen in practice; a safe, simple fallback
  return { id: `fallback-${seed}`, layout: { kind: 'all', legs: [...DIRS], stops: [...DIRS] }, lesson: 'first', seed, cars: [
    { id: 'a', from: 'S', move: 'straight', model: 'hero', rank: 0, you: true }, { id: 'b', from: 'W', move: 'straight', model: 'elantra', rank: 1 },
  ] };
}

/** A varied round of scenarios: the rules mixed so that no two in a row feel alike. */
export function makeRound(seed: number, n = 10, force?: Kind): Scenario[] {
  const plan: (Kind | undefined)[] = ['four-all', 'four-minor', 'three-all', 'four-all', 'three-minor', 'four-all', 'four-minor', 'three-all', undefined, undefined];
  const out: Scenario[] = [];
  for (let i = 0; i < n; i++) out.push(makeScenario(seed * 31 + i * 17 + 1, force ?? plan[i % plan.length]));
  return out;
}

export const KIND_OF = (s: Scenario): Kind => (s.layout.legs.length === 4 ? (s.layout.kind === 'all' ? 'four-all' : 'four-minor') : (s.layout.kind === 'all' ? 'three-all' : 'three-minor'));

/** When each car stops (seconds from the start of the scene). Tied cars share one moment. */
export const ARRIVE_T = (rank: number) => 3.1 + Math.max(0, rank) * 1.7;
export function watchEnd(cars: CarSpec[]) { return Math.max(...cars.map(c => ARRIVE_T(c.rank))) + .9; }

export const RULE_TEXT: Record<Reason, { title: string; body: string }> = {
  first: { title: 'First to stop, first to go', body: 'When more than one car is at the stop line, the car that stopped first goes first.' },
  right: { title: 'Same time: yield to the right', body: 'If two cars stop at the same moment, the car on the left yields to the car on its right.' },
  left: { title: 'Left turns yield', body: 'A car turning left gives way to oncoming traffic that is going straight or turning right.' },
  cross: { title: 'No sign, no stop', body: 'Traffic on a road with no stop sign keeps going. Cars at a stop sign wait until it is clear.' },
  free: { title: 'No conflict, go', body: 'If your path does not cross anyone else, you may go.' },
};
