/**
 * The Atlanta rules engine. A plain TypeScript simulation (no three, no DOM): the player drives up a road made from an AtlStage while the
 * traffic around follows cars in front, changes lanes and merges. It scores the habits a new Georgia driver is graded on:
 * signalling, following distance, keeping right, moving over for emergency vehicles, railroad crossings, roundabouts, work zones, stop signs and lights.
 * The scene only reads this object each frame.
 */
import { buildResult, ScoreTracker, type PointKey } from '../game/scoring';
import { getDifficulty, type Difficulty, type DifficultyConfig, type LevelConfig, type LevelResult } from '../game/types';
import { getLevel } from '../game/levels';
import { MPH_TO_MPS, seeded, type Sfx, type SimEvent } from '../g3d/sim';
import { layoutFor, LANE, type Layout } from './layout';
import { getAtlStage } from './stages';
import type { AtlStage } from './stageTypes';

export type VehKind = 'sedan' | 'suv' | 'pickup' | 'van' | 'hatch' | 'box' | 'semi' | 'bus' | 'police' | 'wreck' | 'tow' | 'taxi' | 'ambulance';
export const DIM: Record<VehKind, { l: number; w: number; h: number }> = {
  sedan: { l: 4.7, w: 1.85, h: 1.45 }, suv: { l: 4.9, w: 1.97, h: 1.75 }, pickup: { l: 5.5, w: 2.0, h: 1.85 }, van: { l: 5.4, w: 2.0, h: 2.1 }, hatch: { l: 4.1, w: 1.8, h: 1.5 },
  box: { l: 8.6, w: 2.5, h: 3.4 }, semi: { l: 17, w: 2.6, h: 4.1 }, bus: { l: 12, w: 2.55, h: 3.2 }, police: { l: 4.95, w: 1.95, h: 1.5 }, wreck: { l: 4.6, w: 1.85, h: 1.4 }, tow: { l: 7.6, w: 2.4, h: 2.6 }, taxi: { l: 4.7, w: 1.85, h: 1.5 }, ambulance: { l: 6.2, w: 2.1, h: 2.7 },
};

export interface Veh {
  id: number; kind: VehKind; d: number; x: number; lane: number; tl: number; v: number; want: number; color: number; dir: 1 | -1;
  brake: boolean; sig: -1 | 0 | 1; lcT: number; lcFrom: number; lcWait: number; think: number; siren: boolean; still: boolean; hit: boolean; cop?: boolean; fly?: { t: number; vx: number; vd: number; spin: number }; side: boolean; yaw: number; look: number;
}
export interface Closure { d0: number; d1: number; lanes: number[]; kind: 'work' | 'crash' }
export interface Zone { d0: number; d1: number; limit: number; kind: 'work' | 'school' | 'circle' }
export interface Prop { id: number; k: 'cone' | 'barrel' | 'arrow'; d: number; x: number; hit: boolean; fly?: { t: number; vx: number; vd: number; spin: number } }
export interface Rail { d: number; train: boolean; gates: boolean; name: string; phase: 'idle' | 'warn' | 'down' | 'train' | 'up'; t: number; trainX: number; stopped: boolean; done: boolean }
export interface Circle { d: number; cross?: Veh; launched: boolean; done: boolean; seen: boolean }
export interface Light { d: number; state: 'red' | 'yellow' | 'green'; script: 'red' | 'green'; t: number; stoppedT: number; done: boolean; stopped: boolean; cross?: boolean }
export interface Stop { d: number; done: boolean }
export interface Ped { d: number; x: number; fromX: number; toX: number; t: number; state: 'wait' | 'walk' | 'done'; look: number; hit: boolean; slowed: boolean }
export interface Police { d: number; veh: Veh; done: boolean }
export interface Sign { at: number; d: number; shown: boolean }

const KMPH = MPH_TO_MPS;
const LOOKS = [0xf4f4f2, 0x1c1d21, 0x9ba0a6, 0x7b1f24, 0x1f3a6b, 0xc9c3b3, 0x2f4a3a, 0x5c6168, 0xd8d8d8, 0x8a5a2e, 0x3a2f55, 0xe0b73a];

export class AtlSim {
  readonly level: LevelConfig;
  readonly stage: AtlStage;
  readonly lay: Layout;
  readonly difficulty: DifficultyConfig;
  readonly tracker = new ScoreTracker();
  readonly effectiveLength: number;
  events: SimEvent[] = [];
  vehicles: Veh[] = [];
  props: Prop[] = [];
  closures: Closure[] = [];
  zones: Zone[] = [];
  // ---- speed patrol: over 80 mph for more than 5 seconds on an interstate brings a cruiser
  cop: Veh | null = null; patrolPhase: 'none' | 'chase' | 'beside' | 'pull' | 'stop' | 'leave' = 'none'; patrolKind: 'ticket' | 'stop' = 'ticket';
  patrolT = 0; fastT = 0; tickets = 0; patrolCool = 0; stopT = 0; cited = false; maxXNow = 0; copOff = 0;
  rails: Rail[] = []; circles: Circle[] = []; lights: Light[] = []; stops: Stop[] = []; peds: Ped[] = []; polices: Police[] = [];
  speedLimitNow: number;

  // player
  x = 0; steerV = 0; yaw = 0; mph = 0; prevMph = 0; traveled = 0; time = 0; finished = false; invulnUntil = 0; braking = false; accel = 0; locked = false; speeding = false; timeScale = 1;
  strikes = 0; nearMisses = 0;
  laneIdx = 0; signalDir: -1 | 0 | 1 = 0; signalAt = -99;
  gapSec = 0; leaderGap = 0; leaderV = 0;
  prompt = '';
  /** the weather the run was dealt (the scene sets it so the report can mention it) */
  weatherLabel = '';
  weatherKind = 'clear';
  readonly pbBestDistance = 0;
  maxMph: number;
  hasShield = false; magnetUntil = 0; magnetOn = false;
  get progress() { return Math.min(1, this.traveled / this.effectiveLength); }
  get travelPx() { return this.traveled * 10; }

  private rnd: ReturnType<typeof seeded>;
  private nextId = 1;
  private timers: { at: number; fn: () => void }[] = [];
  private speedingTimer = 0; private speedWarned = false;
  private tailT = 0; private tailCool = 0; private gapT = 0; private gapCool = 0;
  private leftT = 0; private leftCool = 0; private rightCool = 6; private hovT = 0; private hovCool = 0;
  private lastLane = 0; private crossCool = 0; private lastLaneChangeAt = -99;
  private spawnCool: number[] = [];
  private onCool = 0;
  private fired = new Set<number>();
  private signs: Sign[] = [];
  private carry: number[] = [];
  private evList: { at: number; run: () => void }[] = [];
  private catastrophe = false;

  constructor(levelId: string, difficulty: Difficulty, private snd: Sfx, weather: string, tod?: AtlStage['tod']) {
    const st = getAtlStage(levelId); if (!st) throw new Error(`unknown Atlanta stage ${levelId}`);
    this.stage = tod ? { ...st, tod } : st; this.level = getLevel(levelId); this.difficulty = getDifficulty(difficulty); this.lay = layoutFor(st);
    this.effectiveLength = st.lengthM * this.difficulty.lengthMul;
    this.maxMph = st.maxSpeed * (this.difficulty.speedMul > 1 ? 1 + (this.difficulty.speedMul - 1) * 0.35 : 1);
    this.speedLimitNow = st.limit;
    this.rnd = seeded(`${levelId}:${difficulty}`);
    this.weatherKind = weather; this.weatherLabel = weather.charAt(0).toUpperCase() + weather.slice(1);
    this.x = this.lay.xs[Math.min(this.lay.lanes - 1, Math.max(0, Math.floor(this.lay.lanes / 2)))]!;
    this.laneIdx = this.nearest(this.x); this.lastLane = this.laneIdx;
    this.spawnCool = new Array(this.lay.lanes + 2).fill(0);
    this.buildEvents();
    // fill the road around the car before the first frame
    for (let i = 0; i < 40; i++) this.populate(true);
    this.time = 0;
  }

  // -------------------------------------------------------------------- helpers
  laneX(lane: number) {
    const xs = this.lay.xs, n = xs.length;
    if (lane <= 0) return xs[0]! + lane * LANE;
    if (lane >= n - 1) return xs[n - 1]! + (lane - (n - 1)) * LANE;
    const i = Math.floor(lane), f = lane - i; return xs[i]! + (xs[i + 1]! - xs[i]!) * f;
  }
  private nearest(x: number) { let b = 0, bd = 1e9; for (let i = 0; i < this.lay.xs.length; i++) { const d = Math.abs(x - this.lay.xs[i]!); if (d < bd) { bd = d; b = i; } } return b; }
  private emit(e: SimEvent) { this.events.push(e); }
  private float(text: string, good: boolean, x = this.x, d = this.traveled + 4) { this.emit({ k: 'float', text, good, x, d }); }
  private banner(title: string, sub?: string, ms = 2600, tone: 'gold' | 'red' | 'white' = 'gold') { this.emit({ k: 'banner', title, sub, ms, tone }); }
  private award(key: PointKey, text?: string, x?: number) {
    const pts = this.tracker.add(key);
    if (text) this.float(`${pts >= 0 ? '+' : ''}${pts} ${text}`, pts >= 0, x);
    if (pts > 0) this.snd.checkpoint?.(); return pts;
  }
  private after(sec: number, fn: () => void) { this.timers.push({ at: this.time + sec, fn }); }
  /** Runs due timers. It also runs after the run is over, because the end-of-run popup is itself a timer. */
  private runTimers() { for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i]!.at <= this.time) { const t = this.timers.splice(i, 1)[0]!; t.fn(); } }
  setSignal(dir: -1 | 0 | 1) { this.signalDir = this.signalDir === dir ? 0 : dir; this.signalAt = this.time; this.snd.uiTick?.(); }
  get signalOn() { return this.signalDir !== 0; }
  endEarly() { this.finish(); }
  drain(): SimEvent[] { const e = this.events; this.events = []; return e; }
  private zoneLimit(d: number) { let lim = this.stage.limit; for (const z of this.zones) if (d >= z.d0 && d <= z.d1) lim = Math.min(lim, z.limit); return lim; }
  private inClosure(lane: number, d: number, ahead = 0) { for (const c of this.closures) if (c.lanes.includes(lane) && d + ahead >= c.d0 && d <= c.d1) return c; return null; }

  // -------------------------------------------------------------------- events from the stage
  private buildEvents() {
    const L = this.effectiveLength, st = this.stage, lay = this.lay, r = this.rnd;
    const D = (at: number) => 40 + at * (L - 90);
    for (const g of st.guide) this.signs.push({ at: g.at, d: D(g.at), shown: false });
    st.events.forEach((e, i) => {
      const d = D(e.at);
      switch (e.t) {
        case 'vms': this.evList.push({ at: d - 220, run: () => this.banner('GEORGIA 511', e.text.replace(/\|/g, ' · ').replace(/\s{2,}/g, ' '), 3600, 'white') }); break;
        case 'tip': this.evList.push({ at: d, run: () => { this.banner(e.title, e.sub, 4200, 'gold'); this.prompt = e.sub; } }); break;
        case 'exit': this.evList.push({ at: d - 120, run: () => this.banner(`EXIT ${e.no ?? ''} ${e.name}`.trim(), e.lesson, 3200, 'white') }); break;
        case 'merge': this.evList.push({ at: d - 40, run: () => this.spawnMerger(d + 90) }); break;
        case 'work': {
          const lanes = [lay.lanes - 1]; if (lay.lanes >= 5 && e.len >= 600) lanes.push(lay.lanes - 2);
          this.closures.push({ d0: d, d1: d + e.len, lanes, kind: 'work' });
          this.zones.push({ d0: d - 180, d1: d + e.len + 20, limit: Math.max(45, st.limit - 15), kind: 'work' });
          for (const ln of lanes) {
            const x = this.lay.xs[ln]!;
            // taper: a diagonal of cones across the lane before the closure, then two columns of barrels down the closed lane
            const xb = this.lay.xs[ln]! - LANE / 2;
            for (let k = 0; k < 9; k++) this.props.push({ id: this.nextId++, k: 'cone', d: d - 90 + k * 10, x: xb - LANE * 0.5 + (k / 8) * LANE, hit: false });
            for (let dd = d; dd < d + e.len; dd += 9) for (const off of [-0.95, 0.95]) this.props.push({ id: this.nextId++, k: 'barrel', d: dd + (off > 0 ? 4.5 : 0), x: this.lay.xs[ln]! + off, hit: false });
          }
          this.props.push({ id: this.nextId++, k: 'arrow', d: d - 70, x: lay.xs[lay.lanes - 1]!, hit: false });
          this.evList.push({ at: d - 240, run: () => this.banner('ROAD WORK AHEAD', `Right lane closed · ${this.zoneLimit(d + 5)} mph · fines doubled`, 3400, 'red') });
          this.evList.push({ at: d + e.len, run: () => { if (this.tracker.countOf('SPEEDING') === 0 && this.tracker.countOf('HIT_CONE') === 0) this.award('WORK_ZONE_OK', 'WORK ZONE'); } });
          break;
        }
        case 'crash': {
          const ln = lay.lanes - 1;
          this.closures.push({ d0: d - 40, d1: d + 20, lanes: [ln], kind: 'crash' });
          const mk = (kind: VehKind, dd: number, xx: number, yaw: number, siren: boolean) => { const v = this.makeVeh(kind, dd, ln, 0); v.still = true; v.v = 0; v.want = 0; v.x = xx; v.yaw = yaw; v.siren = siren; v.look = 0; this.vehicles.push(v); return v; };
          const a = mk('wreck', d, lay.xs[ln]! - 0.3, 0.45, false); a.color = 0x6a1f2c; const b = mk('wreck', d + 6, lay.xs[ln]! + 0.5, -0.7, false); b.color = 0xd0d2d6; mk('police', d - 12, lay.xs[ln]! + 1.3, 0.12, true); mk('tow', d + 15, lay.xs[ln]! + 1.6, 0.05, true);
          for (let k = 0; k < 8; k++) this.props.push({ id: this.nextId++, k: 'cone', d: d - 64 + k * 6, x: lay.xs[ln]! + LANE * 0.5 - k * 0.38, hit: false });
          this.evList.push({ at: d - 230, run: () => { this.banner('ACCIDENT AHEAD', 'Right lane blocked · signal and move left', 3600, 'red'); this.prompt = 'Signal, check the mirror, then move left. Slow down for the scene.'; } });
          this.zones.push({ d0: d - 180, d1: d + 60, limit: Math.max(45, st.limit - 20), kind: 'work' });
          break;
        }
        case 'police': {
          const v = this.makeVeh('police', d, lay.lanes - 1, 0); v.still = true; v.v = 0; v.want = 0; v.x = lay.xs[lay.lanes - 1]! + LANE * 0.5 + Math.min(lay.shoulderR, 3.2) * 0.62; v.siren = true; v.look = 0; v.lane = lay.lanes - 0.4; v.tl = -9;
          this.vehicles.push(v); this.polices.push({ d, veh: v, done: false });
          this.evList.push({ at: d - 260, run: () => this.banner('MOVE OVER', 'Emergency vehicle ahead · move over or slow down', 3200, 'white') });
          break;
        }
        case 'rail': this.rails.push({ d, train: e.train, gates: e.gates, name: e.name ?? '', phase: 'idle', t: 0, trainX: -200, stopped: false, done: false });
          this.evList.push({ at: d - 220, run: () => this.banner('RAILROAD CROSSING', e.train ? 'Gates and lights ahead · stop 15 ft back' : 'Slow down · look both ways', 3000, 'white') });
          break;
        case 'circle':
          this.circles.push({ d, launched: false, done: false, seen: false });
          this.zones.push({ d0: d - 120, d1: d + 40, limit: 25, kind: 'circle' });
          this.evList.push({ at: d - 200, run: () => this.banner('ROUNDABOUT AHEAD', 'Slow to 25 · yield to traffic already in the circle', 3200, 'white') });
          break;
        case 'school': this.zones.push({ d0: d, d1: d + e.len, limit: 25, kind: 'school' }); this.evList.push({ at: d - 150, run: () => this.banner('SCHOOL ZONE', '25 mph while flashing · children present', 3000, 'gold') }); break;
        case 'stop': this.stops.push({ d, done: false }); break;
        case 'light': { const l: Light = { d, state: 'green', script: r.frac() < 0.62 ? 'red' : 'green', t: 0, stoppedT: 0, done: false, stopped: false, cross: true }; this.lights.push(l); break; }
        case 'ped': this.peds.push({ d, x: lay.padR + 1.0, fromX: lay.padR + 1.0, toX: lay.padL - 0.3, t: 0, state: 'wait', look: i, hit: false, slowed: false }); break;
      }
    });
    this.evList.sort((a, b) => a.at - b.at);
  }

  private makeVeh(kind: VehKind, d: number, lane: number, v: number): Veh {
    const r = this.rnd;
    return { id: this.nextId++, kind, d, x: this.laneX(lane), lane, tl: lane, v, want: v, color: LOOKS[Math.floor(r.frac() * LOOKS.length)]!, dir: 1, brake: false, sig: 0, lcT: 0, lcFrom: lane, lcWait: 2 + r.frac() * 5, think: r.frac(), siren: false, still: false, hit: false, side: false, yaw: 0, look: Math.floor(r.frac() * 4) };
  }
  private pickKind(lane: number): VehKind {
    const r = this.rnd.frac(), st = this.stage, right = lane >= this.lay.lanes - 2;
    if (right && r < st.trucks * 0.55) return this.rnd.frac() < 0.55 ? 'semi' : this.rnd.frac() < 0.6 ? 'box' : 'bus';
    const k = this.rnd.frac();
    return k < 0.34 ? 'sedan' : k < 0.58 ? 'suv' : k < 0.7 ? 'pickup' : k < 0.8 ? 'hatch' : k < 0.88 ? 'van' : k < 0.94 ? 'taxi' : 'sedan';
  }
  private spawnMerger(d: number) {
    const lay = this.lay; if (lay.kind !== 'divided') return;
    const v = this.makeVeh('sedan', d, lay.lanes + 0.9, Math.max(10, this.mph * KMPH * 0.8)); v.want = this.stage.limit * KMPH * 0.9; v.tl = lay.lanes - 1; v.lcT = 0.0001; v.lcFrom = lay.lanes + 0.9; v.sig = -1; v.lcWait = 0.5;
    this.vehicles.push(v);
  }

  // -------------------------------------------------------------------- traffic
  private populate(initial = false) {
    const lay = this.lay, st = this.stage, T = this.traveled, own = lay.lanes;
    const spacing = 58 / Math.max(0.3, st.traffic * this.difficulty.trafficMul) ;
    for (let ln = 0; ln < own; ln++) {
      if (st.hov && ln === 0) continue;
      const flowMph = st.limit * st.flow * (1 + 0.05 * (own - 1 - ln) / Math.max(1, own - 1));
      const lo = initial ? T - 70 : T - 95, hi = initial ? T + 250 : T + 275;
      // count cars in the lane in the live window
      let cnt = 0, minD = 1e9, maxD = -1e9;
      for (const v of this.vehicles) if (!v.still && v.dir === 1 && Math.round(v.lane) === ln) { cnt++; if (v.d < minD) minD = v.d; if (v.d > maxD) maxD = v.d; }
      const want = (hi - lo) / spacing;
      if (cnt >= want) continue;
      const fromBehind = !initial && this.mph > flowMph * 1.02 ? false : !initial && this.mph < flowMph * 0.9;
      const d = initial ? lo + this.rnd.frac() * (hi - lo) : fromBehind ? T - 92 : T + 272;
      if (initial === false && this.spawnCool[ln]! > this.time) continue;
      // clear?
      let clear = true; for (const v of this.vehicles) if (Math.abs(v.d - d) < 26 && Math.abs(v.lane - ln) < 0.8) { clear = false; break; }
      if (!clear) continue;
      if (Math.abs(d - T) < 34 && Math.abs(this.laneX(ln) - this.x) < LANE * 1.6) continue;
      if (this.inClosure(ln, d, 60) || this.inClosure(ln, d, 0)) continue;
      const kind = this.pickKind(ln), v = this.makeVeh(kind, d, ln, 0);
      const slow = kind === 'semi' || kind === 'box' || kind === 'bus' ? 0.9 : 1;
      v.want = Math.max(5, flowMph * KMPH * slow * (0.93 + this.rnd.frac() * 0.14));
      v.v = initial ? v.want : fromBehind ? v.want : Math.min(v.want, Math.max(this.mph * KMPH * 0.9, v.want * 0.7));
      this.vehicles.push(v); this.spawnCool[ln] = this.time + 0.6;
    }
    // oncoming traffic (decor on a divided road, real on a two-way road)
    if (this.time >= this.onCool || initial) {
      this.onCool = this.time + 0.4;
      const nOn = lay.onXs.length;
      for (let j = 0; j < nOn; j++) {
        const lo = initial ? T - 80 : T - 60, hi = T + 300;
        let cnt = 0; for (const v of this.vehicles) if (v.dir === -1 && v.lane === j) cnt++;
        const sp = 70 / Math.max(0.3, st.traffic * 0.7);
        if (cnt >= (hi - lo) / sp) continue;
        const d = initial ? lo + this.rnd.frac() * (hi - lo) : T + 302 + this.rnd.frac() * 12;
        let clear = true; for (const v of this.vehicles) if (v.dir === -1 && v.lane === j && Math.abs(v.d - d) < 30) { clear = false; break; }
        if (!clear) continue;
        if (this.circles.some((c) => Math.abs(c.d - d) < 70)) continue;
        const k = this.pickKind(0), v = this.makeVeh(k, d, 0, 0); v.dir = -1; v.lane = j; v.tl = j; v.x = lay.onXs[j]!; v.v = (st.limit * 0.9 + this.rnd.frac() * 6) * KMPH; v.want = v.v; v.yaw = Math.PI;
        this.vehicles.push(v);
      }
    }
  }

  private stepTraffic(dt: number) {
    const lay = this.lay, T = this.traveled, own = lay.lanes;
    // buckets of live same-direction cars per lane, sorted by d
    const lanes: Veh[][] = Array.from({ length: own + 2 }, () => []);
    for (const v of this.vehicles) if (v.dir === 1 && !v.side) { const li = Math.max(0, Math.min(own + 1, Math.round(v.lane))); (lanes[li] ??= []).push(v); }
    for (const b of lanes) b.sort((a, c) => a.d - c.d);
    const playerLane = this.laneIdx, pD = T, pL = 4.7;
    const leaderOf = (v: Veh, lane: number): { gap: number; v: number } | null => {
      let best: { gap: number; v: number } | null = null;
      const b = lanes[Math.max(0, Math.min(own + 1, Math.round(lane)))] ?? [];
      for (const o of b) if (o !== v && o.d > v.d) { best = { gap: o.d - o.v * 0 - DIM[o.kind].l / 2 - v.d - DIM[v.kind].l / 2, v: o.v }; break; }
      // the player counts when their body is in the lane
      if (Math.abs(this.x - this.laneX(lane)) < 1.9 && pD > v.d) { const g = pD - pL / 2 - v.d - DIM[v.kind].l / 2; if (!best || g < best.gap) best = { gap: g, v: this.mph * KMPH }; }
      // a closed lane is a wall
      for (const c of this.closures) if (c.lanes.includes(lane) && c.d0 > v.d) { const g = c.d0 - v.d - DIM[v.kind].l / 2 - 4; if (!best || g < best.gap) best = { gap: g, v: 0 }; }
      return best;
    };
    const gapBehind = (v: Veh, lane: number) => {
      let g = 1e9; const b = lanes[Math.max(0, Math.min(own + 1, Math.round(lane)))] ?? [];
      for (const o of b) if (o !== v && o.d <= v.d + 6) g = Math.min(g, v.d - o.d - DIM[o.kind].l / 2 - DIM[v.kind].l / 2 + 6 - Math.max(0, (o.v - v.v)) * 1.6);
      if (Math.abs(this.x - this.laneX(lane)) < 2.2 && pD <= v.d + 6) g = Math.min(g, v.d - pD - pL / 2 - 2 - Math.max(0, this.mph * KMPH - v.v) * 1.6);
      return g;
    };
    for (const v of this.vehicles) {
      if (v.fly) { v.fly.t += dt; v.d += v.fly.vd * dt; v.x += v.fly.vx * dt; v.yaw += v.fly.spin * dt; v.fly.vd *= 0.97; continue; }
      if (v.still) { continue; }
      if (v.dir === -1) { v.d -= v.v * dt; continue; }
      if (v.side) continue;
      const lead = leaderOf(v, v.lcT > 0 && v.lcT < 0.5 ? v.lcFrom : v.tl);
      // intelligent driver model
      const a0 = 2.4, b = 3.6, s0 = 2.6, Th = 1.25 + (this.stage.isRush ? 0.2 : 0);
      let a = a0 * (1 - Math.pow(v.v / Math.max(1, v.want), 4));
      if (lead) {
        const dv = v.v - lead.v, sStar = s0 + Math.max(0, v.v * Th + (v.v * dv) / (2 * Math.sqrt(a0 * b)));
        a -= a0 * Math.pow(sStar / Math.max(0.5, lead.gap), 2);
      }
      v.v = Math.max(0, v.v + Math.max(-9, a) * dt); v.brake = a < -1.4;
      v.d += v.v * dt;
      // lane change
      if (v.lcT > 0) {
        v.lcT += dt / 2.4;
        const f = Math.min(1, v.lcT), s = f * f * (3 - 2 * f);
        v.lane = v.lcFrom + (v.tl - v.lcFrom) * s;
        if (f >= 1) { v.lcT = 0; v.lane = v.tl; v.sig = 0; v.lcWait = 4 + this.rnd.frac() * 8; }
      } else {
        v.lcWait -= dt;
        if (v.lcWait <= 0 && this.mph >= 0) {
          const L = Math.round(v.lane);
          const blocked = lead && lead.gap < 55 && lead.v < v.want - 2.5;
          const must = this.inClosure(L, v.d, 230);
          if (blocked || must) {
            const opts = [L - 1, L + 1].filter((n) => n >= 0 && n < own && !(this.stage.hov && n === 0) && !this.inClosure(n, v.d, 230) && !(((v.kind === 'semi' || v.kind === 'box' || v.kind === 'bus') && n < own - 2)));
            let done = false;
            for (const n of must ? opts.sort((p, q) => Math.abs(p - L) - Math.abs(q - L)) : opts) {
              const ahead = leaderOf(v, n), behind = gapBehind(v, n);
              if ((!ahead || ahead.gap > 24 + (blocked ? 0 : 8)) && behind > 16 && (!ahead || ahead.v > lead!.v * 0.8 || must)) {
                v.lcFrom = v.lane; v.tl = n; v.lcT = 0.0001; v.sig = n < L ? -1 : 1; done = true; break;
              }
            }
            if (!done) v.lcWait = 1.2 + this.rnd.frac() * 1.5;
          } else v.lcWait = 1 + this.rnd.frac() * 2;
        }
      }
      v.x = this.laneX(v.lane);
    }
    // cars leave the window
    this.vehicles = this.vehicles.filter((v) => v.d > T - 130 && v.d < T + 340 && !(v.fly && v.fly.t > 2.4));
  }

  // -------------------------------------------------------------------- the player
  step(dt: number, c: { gas: boolean; brake: boolean; left: boolean; right: boolean }) {
    if (this.finished) { this.time += dt; this.runTimers(); return; }
    if (dt <= 0) { return; }
    this.time += dt; this.prevMph = this.mph;
    if (this.locked) c = { gas: false, brake: true, left: false, right: false };
    if (c.gas) this.mph += 30 * dt; else if (c.brake) this.mph -= 66 * dt; else this.mph -= 6 * dt;
    this.mph = Math.min(Math.max(this.mph, 0), this.maxMph);
    this.braking = c.brake && this.prevMph > 1;
    this.accel = ((this.mph - this.prevMph) / Math.max(dt, 1e-4)) * KMPH;
    this.traveled += this.mph * KMPH * dt;
    const top = 6.4 * Math.min(1, Math.max(0, this.mph / 18)) * (this.mph > 60 ? 0.9 : 1);
    const want = ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * top;
    this.steerV += (want - this.steerV) * (1 - Math.exp(-dt * 14));
    this.x += this.steerV * dt;
    const lay = this.lay;
    if (this.x < lay.minX) { this.x = lay.minX; if (this.steerV < 0) this.steerV = 0; }
    const maxX = Math.max(lay.maxX, this.maxXNow);
    if (this.x > maxX) { this.x = maxX; if (this.steerV > 0) this.steerV = 0; }
    this.yaw += (Math.max(-0.2, Math.min(0.2, (this.steerV / 6.4) * 0.2)) - this.yaw) * (1 - Math.exp(-dt * 10));
    if (this.mph > 35 && (c.left || c.right) && this.mph > this.stage.limit - 8) this.snd.tireScreech?.(Math.min(1, this.mph / this.maxMph));
    this.speedLimitNow = this.zoneLimit(this.traveled);
    this.snd.updateEngine?.(Math.min(1, this.mph / this.maxMph));

    // timers and staged events
    this.runTimers();
    while (this.evList.length && this.evList[0]!.at <= this.traveled) this.evList.shift()!.run();
    for (const s of this.signs) if (!s.shown && this.traveled > s.d - 12) s.shown = true;

    this.populate();
    this.stepTraffic(dt);
    this.collisions(dt);
    this.stepProps(dt);
    this.laneRules(dt);
    this.followRules(dt);
    this.speedRules(dt);
    this.stepRails(dt); this.stepCircles(dt); this.stepLights(dt); this.stepStops(); this.stepPeds(dt); this.stepPolice(); this.stepPatrol(dt);
    // signal cancels itself
    if (this.signalDir !== 0 && this.time - this.signalAt > 6) this.signalDir = 0;
    if (!this.finished && this.traveled >= this.effectiveLength) this.finish();
  }

  // ---- collisions
  private crash(x: number, d: number, big: boolean, veh?: Veh, cone?: Prop) {
    if (this.time < this.invulnUntil) return;
    this.invulnUntil = this.time + 1.8;
    this.snd.collision?.();
    this.emit({ k: 'crash', x, d, big }); this.emit({ k: 'shake', amp: big ? 1 : 0.5, dur: big ? 0.6 : 0.3 }); this.emit({ k: 'flash', color: 0xff3030, dur: 0.25 });
    if (cone) { this.award('HIT_CONE', 'CONE'); const s = Math.sign(this.x - cone.x) || 1; cone.fly = { t: 0, vx: 6 * s, vd: this.mph * KMPH * 1.2, spin: 9 }; cone.hit = true; this.mph *= 0.92; return; }
    this.award('HIT_TRAFFIC', 'CRASH');
    this.strikes++;
    if (veh) { veh.hit = true; const s = Math.sign(veh.x - this.x) || 1; veh.fly = { t: 0, vx: 3 * s, vd: Math.max(2, this.mph * KMPH * 0.5), spin: 1.2 * s }; veh.still = false; veh.v = 0; }
    this.mph = Math.max(0, this.mph * 0.45 - 6);
    this.banner(this.strikes >= 3 ? 'TOO MANY CRASHES' : 'CRASH', this.strikes >= 3 ? 'The exam ends here' : `Strike ${this.strikes} of 3 · leave more space`, 2200, 'red');
    if (this.strikes >= 3) this.after(0.7, () => this.finish());
  }
  private collisions(dt: number) {
    const px = this.x, pd = this.traveled, pw = 1.9, pl = 4.7;
    for (const v of this.vehicles) {
      if (v.fly || v.hit) continue;
      if (v.cop && this.patrolPhase !== 'pull' && this.patrolPhase !== 'stop') continue;
      const dm = DIM[v.kind], vw = v.side ? dm.l : dm.w, vl = v.side ? dm.w : dm.l;
      if (Math.abs(v.d - pd) < (pl + vl) / 2 - 0.15 && Math.abs(v.x - px) < (pw + vw) / 2 - 0.1) {
        if (lay_isDecor(this.lay, v) ) continue;
        this.crash((px + v.x) / 2, (pd + v.d) / 2, true, v);
      }
    }
    for (const p of this.props) if (!p.hit && Math.abs(p.d - pd) < 2.9 && Math.abs(p.x - px) < 1.15 && p.k !== 'arrow') this.crash(p.x, p.d, false, undefined, p);
    // pass by signals to near misses
    void dt;
  }
  private stepProps(dt: number) {
    const T = this.traveled;
    for (const p of this.props) if (p.fly) { p.fly.t += dt; p.d += p.fly.vd * dt; p.x += p.fly.vx * dt; }
    if (this.props.length > 0 && Math.random() < 0.02) this.props = this.props.filter((p) => p.d > T - 120 && !(p.fly && p.fly.t > 2));
  }

  // ---- lane discipline
  private laneRules(dt: number) {
    const lay = this.lay, st = this.stage;
    // lane index with a little hysteresis
    let idx = this.laneIdx;
    const cur = lay.xs[idx]!;
    if (Math.abs(this.x - cur) > LANE * 0.62) idx = this.nearest(this.x);
    if (idx !== this.laneIdx) {
      const dir = idx < this.laneIdx ? -1 : 1;
      this.laneIdx = idx;
      if (lay.kind === 'divided' && lay.lanes > 1 && this.time - this.lastLaneChangeAt > 0.8 && this.mph > 8) {
        this.lastLaneChangeAt = this.time;
        if (this.signalDir === dir && this.time - this.signalAt < 6) { this.award('SIGNALLED', 'SIGNALLED'); this.signalDir = 0; }
        else this.award('NO_SIGNAL', 'NO SIGNAL');
      }
    }
    // double yellow / wrong side on a two-way road
    this.crossCool -= dt;
    if (lay.kind === 'twoway' && this.x - 0.92 < -0.02 && this.mph > 5 && this.crossCool <= 0) { this.crossCool = 3.2; this.award('LANE_CROSS', 'CENTER LINE'); }
    if (lay.kind === 'divided' && (this.x > lay.maxX - 0.05 || this.x < lay.minX + 0.05) && this.mph > 15 && this.crossCool <= 0) { this.crossCool = 3; this.award('LANE_CROSS', 'EDGE LINE'); }
    // HOV: a solo driver stays out
    if (st.hov && this.laneIdx === 0 && this.mph > 5) { this.hovT += dt; if (this.hovT > 2.2 && this.time > this.hovCool) { this.hovCool = this.time + 8; this.award('HOV_SOLO', 'HOV: 2+ RIDERS'); } } else this.hovT = Math.max(0, this.hovT - dt);
    // keep right except to pass
    const leftmost = st.hov ? 1 : 0;
    if (lay.kind === 'divided' && lay.lanes >= 3 && st.road === 'interstate') {
      let slowerAhead = false; for (const v of this.vehicles) if (v.dir === 1 && v.d > this.traveled && v.d < this.traveled + 90 && Math.abs(v.x - this.x) < 2 && v.v < this.mph * KMPH - 1) { slowerAhead = true; break; }
      if (this.laneIdx === leftmost && !slowerAhead && this.mph > 20) { this.leftT += dt; if (this.leftT > 16 && this.time > this.leftCool) { this.leftCool = this.time + 16; this.award('BLOCK_PASSING', 'KEEP RIGHT'); this.prompt = 'Georgia: the left lane is for passing. Move right when the way is clear.'; } }
      else this.leftT = Math.max(0, this.leftT - dt * 2);
      this.rightCool -= dt;
      if (this.laneIdx >= lay.lanes - 2 && this.rightCool <= 0 && this.mph > 25) { this.rightCool = 28; this.award('KEEP_RIGHT', 'KEEP RIGHT'); }
    }
  }
  private followRules(dt: number) {
    // nearest car ahead in our lane
    let best = 1e9, bv = 0;
    for (const v of this.vehicles) if (v.dir === 1 && !v.fly && v.d > this.traveled && Math.abs(v.x - this.x) < 1.7) { const g = v.d - DIM[v.kind].l / 2 - this.traveled - 2.35; if (g < best) { best = g; bv = v.v; } }
    this.leaderGap = best; this.leaderV = bv;
    const sp = Math.max(this.mph * KMPH, 0.1);
    this.gapSec = best < 120 ? Math.max(0, best / sp) : 9;
    this.tailCool -= dt; this.gapCool -= dt;
    if (best < 90 && this.mph > 35 && this.gapSec < 1.0 && bv > 3) { this.tailT += dt; if (this.tailT > 2.4 && this.tailCool <= 0) { this.tailCool = 7; this.tailT = 0; this.award('TAILGATE', 'TAILGATING'); this.prompt = 'Keep a 3 second gap: pick a sign and count after the car ahead passes it.'; } } else this.tailT = Math.max(0, this.tailT - dt);
    if (best < 70 && this.mph > 30 && this.gapSec > 1.9 && this.gapSec < 5 && bv > 8) { this.gapT += dt; if (this.gapT > 7 && this.gapCool <= 0) { this.gapCool = 9; this.gapT = 0; this.award('SAFE_GAP', 'SAFE GAP'); } } else this.gapT = Math.max(0, this.gapT - dt * 0.5);
  }
  private speedRules(dt: number) {
    const lim = this.speedLimitNow, tol = this.difficulty.speedTolerance;
    this.speeding = this.mph > lim + tol;
    if (this.speeding) {
      this.speedingTimer += dt;
      if (!this.speedWarned) { this.speedWarned = true; this.emit({ k: 'speedWarn' }); }
      if (this.speedingTimer > 1.4) {
        this.speedingTimer = 0; this.award('SPEEDING', `OVER ${lim}`);
        if (this.zones.some((z) => z.kind === 'work' && this.traveled >= z.d0 && this.traveled <= z.d1)) this.award('SPEEDING');
        if (this.zones.some((z) => z.kind === 'school' && this.traveled >= z.d0 && this.traveled <= z.d1)) this.award('SPEEDING');
      }
    } else { this.speedingTimer = Math.max(0, this.speedingTimer - dt); this.speedWarned = false; }
  }

  // ---- railroad crossings
  private stepRails(dt: number) {
    const lay = this.lay;
    for (const r of this.rails) {
      const dist = r.d - this.traveled, line = r.d - 7;
      if (r.train && r.phase === 'idle' && dist < Math.max(100, this.mph * KMPH * 6.8) && dist > 0) { r.phase = 'warn'; r.t = 0; this.snd.stopDing?.(); }
      if (r.phase !== 'idle') {
        r.t += dt;
        if (r.phase === 'warn' && r.t > 2.6) { r.phase = 'down'; }
        if (r.phase === 'down' && r.t > 4.6) { r.phase = 'train'; r.trainX = lay.edgeL - 150; }
        if (r.phase === 'train') { r.trainX += 27 * dt; if (r.trainX > lay.edgeR + 150) { r.phase = 'up'; r.t = 0; } }
        if (r.phase === 'up' && r.t > 1.8) { r.phase = 'idle'; r.done = true; r.train = false; }
      }
      const active = r.phase === 'warn' || r.phase === 'down' || r.phase === 'train';
      if (!r.stopped && active && dist < 40 && dist > 7 && this.mph < 1.2) { r.stopped = true; this.award('RAIL_STOP', 'STOPPED AT THE TRACKS'); }
      if (!r.done && this.traveled > r.d - 4.2 && this.traveled < r.d + 3 && !(r as Rail & { x?: boolean }).x) {
        (r as Rail & { x?: boolean }).x = true;
        if (active) {
          if (r.phase === 'train') { this.emit({ k: 'crash', x: this.x, d: r.d, big: true }); this.emit({ k: 'catastrophe', dog: false }); this.tracker.zeroOut(); this.locked = true; this.banner('TRAIN STRIKE', 'Never cross when the gates are down', 3000, 'red'); this.after(1.2, () => this.finish()); }
          else { this.award('RAN_RAIL', 'GATES DOWN'); this.strikes++; this.banner('RAN THE GATES', 'Stop at least 15 feet back', 2600, 'red'); }
        } else if (!r.stopped && !r.train && r.gates === false && this.mph <= 22) { r.stopped = true; this.award('RAIL_STOP', 'LOOKED BOTH WAYS'); }
        else if (!r.stopped && r.done) { r.stopped = true; this.award('RAIL_STOP', 'CLEAR TRACKS'); }
      }
      void line;
    }
  }
  // ---- roundabouts
  private stepCircles(dt: number) {
    void dt;
    for (const c of this.circles) {
      if (c.done) continue;
      const dist = c.d - 6 - this.traveled;
      if (!c.launched && dist < Math.max(34, this.mph * KMPH * 3.2) && dist > 4) {
        c.launched = true;
        const v = this.makeVeh(this.rnd.frac() < 0.5 ? 'suv' : 'sedan', c.d - 3, 0, 8); v.side = true; v.x = -9; v.v = 8; v.want = 8; v.yaw = -Math.PI / 2; v.dir = 1; v.tl = -7; v.lane = -7; v.still = true;
        c.cross = v; this.vehicles.push(v);
      }
      if (c.cross) {
        c.cross.x += 7.2 * (1 / 60) * 60 * dt; c.cross.d = c.d - 3;
        if (c.cross.x > this.lay.edgeR + 6) { this.vehicles = this.vehicles.filter((q) => q !== c.cross); c.cross = undefined; }
      }
      if (this.traveled > c.d - 6) {
        c.done = true;
        const cx = c.cross?.x ?? 99;
        if (this.mph <= 14 && !c.seen) { c.seen = true; this.award('CIRCLE_YIELD', 'YIELDED'); }
        else if (c.cross && cx > -5 && cx < 6.5) this.award('CIRCLE_CUTOFF', 'CUT OFF');
      }
    }
  }
  // ---- traffic lights
  private stepLights(dt: number) {
    for (const l of this.lights) {
      if (l.done) continue;
      const dist = l.d - this.traveled;
      if (l.script === 'red' && l.state === 'green' && dist < Math.max(95, this.mph * KMPH * 4.5)) { l.state = 'yellow'; l.t = 0; }
      if (l.state === 'yellow') { l.t += dt; if (l.t > 2.4) { l.state = 'red'; l.t = 0; } }
      if (l.state === 'red' && dist > 0 && dist < 20 && this.mph < 1.2) { l.stoppedT += dt; l.stopped = true; if (l.stoppedT > 2.4) { l.state = 'green'; } }
      if (this.traveled > l.d - 0.5) {
        l.done = true;
        if (l.state === 'red') { this.award('RAN_RED_LIGHT', 'RED LIGHT'); this.strikes++; this.banner('RAN A RED LIGHT', 'Cross traffic has the right of way', 2400, 'red'); }
        else { this.award('GREEN_LIGHT', 'GREEN'); if (l.stopped) this.award('FULL_STOP', 'STOPPED'); }
        l.cross = false;
      }
    }
  }
  private stepStops() {
    for (const s of this.stops) {
      if (s.done) continue;
      const dist = s.d - this.traveled;
      if (dist < 11 && dist > 0.5 && this.mph < 1.2 && !(s as Stop & { f?: boolean }).f) { (s as Stop & { f?: boolean }).f = true; this.award('FULL_STOP', 'FULL STOP'); }
      if (this.traveled > s.d) { s.done = true; if (!(s as Stop & { f?: boolean }).f) { this.award('RAN_STOP_SIGN', 'STOP SIGN'); this.banner('ROLLING STOP', 'A full stop means no movement', 2400, 'red'); } }
    }
  }
  // ---- pedestrians
  private stepPeds(dt: number) {
    for (const p of this.peds) {
      if (p.state === 'done') continue;
      const dist = p.d - this.traveled;
      if (p.state === 'wait' && dist < Math.max(48, this.mph * KMPH * 3.0)) { p.state = 'walk'; }
      if (p.state === 'walk') {
        p.t += dt; p.x += Math.sign(p.toX - p.fromX) * 1.45 * dt;
        if ((p.toX - p.fromX) * (p.toX - p.x) <= 0) { p.state = 'done'; if (!p.hit && p.slowed) { this.award('PED_SAFE_PASS', 'YIELDED'); } }
        const onMyRoad = p.x > this.lay.padL + 0.2 && p.x < this.lay.padR - 0.2;
        if (onMyRoad && dist < 20 && dist > 0 && this.mph < 14) p.slowed = true;
        if (!p.hit && Math.abs(p.d - this.traveled) < 2.7 && Math.abs(p.x - this.x) < 1.15) {
          p.hit = true; this.emit({ k: 'crash', x: this.x, d: p.d, big: true }); this.emit({ k: 'catastrophe', dog: false }); this.tracker.zeroOut(); this.locked = true; this.banner('STRUCK A PEDESTRIAN', 'Always yield in a crosswalk', 3000, 'red'); this.after(1.1, () => this.finish());
        }
      }
    }
  }
  // ---- move over
  private stepPolice() {
    for (const p of this.polices) {
      if (p.done) continue;
      const dist = p.d - this.traveled;
      if (dist < 22) {
        p.done = true;
        const right = this.laneIdx === this.lay.lanes - 1;
        if (!right) this.award('MOVE_OVER', 'MOVED OVER');
        else if (this.mph <= this.stage.limit - 20) this.award('MOVE_OVER', 'SLOWED DOWN');
        else { this.award('NO_MOVE_OVER', 'MOVE OVER'); this.banner('MOVE OVER LAW', 'Change lanes or slow 20 under the limit', 2600, 'red'); }
      }
    }
  }


  // ------------------------------------------------------------------ speed patrol
  private startPatrol() {
    const lay = this.lay, T = this.traveled, pv = this.mph * KMPH;
    this.patrolKind = this.tickets >= 2 ? 'stop' : 'ticket';
    // the cruiser comes up the lane next to you that has the most room
    const cands = [this.laneIdx - 1, this.laneIdx + 1].filter((l) => l >= 0 && l < lay.lanes);
    let lane = cands[0] ?? this.laneIdx, best = -1;
    for (const l of cands) { let clear = 1e9; for (const o of this.vehicles) if (o.dir === 1 && !o.cop && Math.abs(o.lane - l) < 0.6) clear = Math.min(clear, Math.abs(o.d - T)); if (clear > best) { best = clear; lane = l; } }
    this.copOff = best < 14 ? (best < 7 ? -9 : -6) : 0;
    const v = this.makeVeh('police', T - 95, lane, pv + 6);
    v.still = true; v.siren = true; v.cop = true; v.look = 0; v.x = this.laneX(lane); v.lane = lane; v.tl = lane;
    this.vehicles.push(v); this.cop = v; this.patrolPhase = 'chase'; this.patrolT = 0;
    this.snd.siren?.();
    this.banner('POLICE BEHIND YOU', this.patrolKind === 'stop' ? 'Third time. Stay calm and follow the officer' : 'Over 80 mph for too long. Ease off the gas', 3200, 'red');
    this.emit({ k: 'flash', color: 0x3070ff, dur: 0.35 });
  }
  private endPatrol(cool: number) {
    if (this.cop) { const i = this.vehicles.indexOf(this.cop); if (i >= 0) this.vehicles.splice(i, 1); }
    this.cop = null; this.patrolPhase = 'none'; this.patrolCool = cool; this.fastT = 0; this.maxXNow = 0;
  }
  private stepPatrol(dt: number) {
    if (this.stage.road !== 'interstate' || this.finished) return;
    const lay = this.lay;
    if (this.patrolPhase === 'none') {
      if (this.patrolCool > 0) this.patrolCool -= dt;
      if (this.mph > 80) this.fastT += dt; else this.fastT = Math.max(0, this.fastT - dt * 1.5);
      if (this.fastT > 5 && this.patrolCool <= 0 && this.time > 6 && !this.locked) this.startPatrol();
      return;
    }
    const cop = this.cop; if (!cop) { this.patrolPhase = 'none'; return; }
    const T = this.traveled, pv = this.mph * KMPH, lastX = lay.xs[lay.lanes - 1]!;
    const shoulderX = lastX + LANE * 0.5 + 1.3;
    this.patrolT += dt;
    const follow = (off: number, k = 4) => { cop.d += (cop.v * dt); cop.d += (T + off - cop.d) * Math.min(1, dt * k); };
    switch (this.patrolPhase) {
      case 'chase': {
        cop.v = pv + 11 + Math.max(0, (T - cop.d)) * 0.1; cop.d += cop.v * dt;
        if (cop.d >= T + this.copOff - 1.5) { this.patrolPhase = 'beside'; this.patrolT = 0; cop.v = pv; }
        if (this.patrolT > 25) this.endPatrol(10);
        break;
      }
      case 'beside': {
        cop.v = pv; follow(this.copOff);
        if (this.patrolT > 1.8) {
          this.patrolT = 0;
          if (this.patrolKind === 'ticket') {
            this.tickets++;
            this.award('SPEEDING_TICKET', `TICKET ${this.tickets}`);
            this.banner(`SPEEDING TICKET ${this.tickets} OF 2`, this.tickets >= 2 ? 'One more and you get pulled over. Slow down now' : 'Over 80 mph on the interstate. Hold the limit', 4200, 'red');
            this.emit({ k: 'shake', amp: 0.5, dur: 0.4 });
            this.patrolPhase = 'leave';
          } else {
            this.patrolPhase = 'pull';
            this.banner('PULL OVER', 'Signal right, slow down and stop on the shoulder', 5200, 'red');
            this.signalDir = 0;
          }
        }
        break;
      }
      case 'leave': {
        cop.v = Math.max(0, pv - 9); cop.d += cop.v * dt;
        if (this.patrolT > 1.6) cop.x += (this.laneX(Math.max(0, Math.min(lay.lanes - 1, Math.round(cop.lane)))) - cop.x) * Math.min(1, dt * 2);
        if (cop.d < T - 120 || this.patrolT > 14) this.endPatrol(14);
        break;
      }
      case 'pull': {
        this.maxXNow = shoulderX - 0.7;
        // the cruiser moves ahead into your lane, then slides onto the shoulder and slows to a stop
        const t = this.patrolT, targetX = t < 2.5 ? this.x : t < 5 ? this.x + (shoulderX - this.x) * ((t - 2.5) / 2.5) : shoulderX;
        cop.x += (targetX - cop.x) * Math.min(1, dt * 2.6);
        const ahead = cop.d - T;
        if (t < 5) cop.v = pv + Math.max(-3, Math.min(7, (24 - ahead) * 0.7)); else cop.v = Math.max(0, cop.v - 3.6 * dt * (t > 6 ? 1 : 0.4));
        cop.d += cop.v * dt;
        // done when you have stopped, ideally on the right
        if (this.mph < 2) { this.stopT += dt; if (this.stopT > 1.1) { this.patrolPhase = 'stop'; this.patrolT = 0; this.onPulledOver(this.x > lastX + LANE * 0.5 - 1.2); } } else this.stopT = 0;
        if (t > 9 && t < 9.1) this.banner('KEEP SLOWING', 'Stop behind the cruiser on the shoulder', 2400, 'red');
        if (t > 24 && this.mph > 8) {
          this.award('FAILED_TO_YIELD', 'DID NOT STOP'); this.tracker.zeroOut(); this.cited = true; this.locked = true;
          this.banner('FAILED TO YIELD', 'Always pull over for blue lights', 3600, 'red'); this.emit({ k: 'catastrophe', dog: false }); this.patrolPhase = 'stop'; this.after(2.2, () => this.finish());
        }
        break;
      }
      case 'stop': {
        cop.v = 0; this.maxXNow = shoulderX - 0.7;
        break;
      }
    }
  }
  private onPulledOver(onShoulder: boolean) {
    this.cited = true; this.locked = true;
    this.award('PULLED_OVER', 'PULLED OVER');
    this.banner('TRAFFIC STOP', onShoulder ? 'You pulled over safely. Hands on the wheel, window down' : 'Stopped in the lane. Next time move fully onto the shoulder', 4200, 'white');
    this.after(3.4, () => this.finish());
  }

  private finish() {
    if (this.finished) return; this.finished = true;
    this.snd.fanfare?.();
    this.emit({ k: 'finish', endless: false });
    const early = this.traveled < this.effectiveLength - 5;
    if (!early && !this.tracker.voided) { this.tracker.add('FINISH_BONUS'); }
    const result = buildResult(this.level, this.tracker, this.difficulty);
    if (this.cited) result.passed = false;
    result.feedback = this.feedback(result);
    this.result = result;
    this.after(0.9, () => this.emitComplete());
  }
  private result: LevelResult | null = null; private completed = false;
  private emitComplete() { if (this.completed || !this.result) return; this.completed = true; this.emit({ k: 'complete', result: this.result }); }
  /** Safety net: the renderer calls this if the end popup has not appeared a moment after the run ended. */
  forceComplete() { if (!this.finished) this.finish(); this.emitComplete(); }
  get isComplete() { return this.completed; }
  private feedback(r: LevelResult): string[] {
    const t = this.tracker, out: string[] = [];
    if (t.voided) { out.push('Instant fail: always stop for people in a crosswalk and never cross railroad tracks with gates down.'); }
    const crashes = t.countOf('HIT_TRAFFIC');
    out.push(crashes === 0 ? 'No collisions. You drove like a pro.' : `${crashes} collision${crashes === 1 ? '' : 's'}. Leave a 3 second gap and look further ahead.`);
    const lc = t.countOf('SIGNALLED'), nl = t.countOf('NO_SIGNAL');
    if (this.lay.kind === 'divided') out.push(nl === 0 && lc > 0 ? `Signalled all ${lc} lane changes. That is a real road-test habit.` : nl > 0 ? `You changed lanes without signalling ${nl} time${nl === 1 ? '' : 's'}. Signal first (Q or E), check the mirror, then move.` : 'Practice signalling before every lane change (Q left, E right).');
    if (t.countOf('TAILGATE') > 0) out.push('You followed too closely. Use the 3 second rule.'); else if (t.countOf('SAFE_GAP') > 0) out.push('Good following distance. That is what stops crashes.');
    if (t.countOf('SPEEDING') > 0) out.push(`Watch the speed. The limit here is ${this.stage.limit} mph, lower in work and school zones.`); else out.push(`Held the speed limit the whole way.`);
    if (this.stage.hov && t.countOf('HOV_SOLO') > 0) out.push('The far left lane is for HOV. Two or more riders only.');
    if (t.countOf('NO_MOVE_OVER') > 0) out.push('Georgia\'s Move Over law: change lanes or slow down for emergency vehicles.'); else if (t.countOf('MOVE_OVER') > 0) out.push('You moved over for the emergency vehicle. Thank you.');
    if (t.countOf('RAN_RAIL') > 0) out.push('Never go around gates. Stop 15 feet back and wait for the train.'); else if (t.countOf('RAIL_STOP') > 0) out.push('Handled the railroad crossing safely.');
    if (t.countOf('CIRCLE_CUTOFF') > 0) out.push('Yield to traffic already in the roundabout.'); else if (t.countOf('CIRCLE_YIELD') > 0) out.push('You yielded in the roundabout. Slow, look left, go.');
    if (t.countOf('RAN_STOP_SIGN') + t.countOf('RAN_RED_LIGHT') > 0) out.push('Obey every stop sign and signal. A full stop means no movement.');
    if (this.cited) out.push(this.patrolKind === 'stop' ? 'You were pulled over for speeding on the interstate. Over 80 mph, signal, slow down and stop on the right shoulder.' : 'Tickets end here.');
    else if (this.tickets > 0) out.push(`${this.tickets} speeding ticket${this.tickets === 1 ? '' : 's'}. The limit is ${this.stage.limit}. Tickets raise insurance and can suspend a license.`);
    out.push(`Weather this run: ${this.weatherLabel}. ${this.stage.lessons[0] ?? ''}`.trim());
    out.push(r.passed ? 'Instructor verdict: PASS. Ready for the next lesson!' : 'Instructor verdict: NEEDS PRACTICE. Book a lesson and try again!');
    return out;
  }
  nextHint() { return this.stage.lessons[0] ?? ''; }
}

function lay_isDecor(lay: Layout, v: Veh) { return lay.kind === 'divided' && v.dir === -1; }
