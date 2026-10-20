/**
 * The rules engine of the Carrollton open world. The player drives a real car (a bicycle-model body with grip, weight transfer and a brake that reverses) around the
 * streets of the real map. The traffic, the signals and the stop signs are the map's; the sim watches the player against them the way a licence examiner would:
 * the speed limit of the road you are on, the stop line, the red light, the one-way arrow, the centre line, the turn signal, the person in the crosswalk.
 */
import { ScoreTracker, buildResult, type PointKey } from '../game/scoring';
import { getDifficulty, type Difficulty, type DifficultyConfig, type LevelConfig, type LevelResult } from '../game/types';
import { MPH, loadMap, wrapAngle, type Edge, type GameMap, type Node, type RoadHit } from './map';
import { Traffic, signalState, type Mover, type SigState } from './traffic';
import { makeRoutePlanner, type Route } from './route';
import { Pedestrians } from './peds';
import { Trains } from './trains';

export const OPEN_ID = 'atl-carrollton-open';
export const M_PER_S_TO_MPH = 1 / MPH;

export interface Controls { gas: boolean; brake: boolean; left: boolean; right: boolean }
export type Sfx = { [k: string]: (...a: number[]) => void };
export type OSimEvent =
  | { k: 'float'; text: string; good: boolean; x: number; z: number }
  | { k: 'banner'; title: string; sub?: string; ms: number; tone?: 'gold' | 'red' | 'white' }
  | { k: 'flash'; color: number; dur: number }
  | { k: 'shake'; amp: number; dur: number }
  | { k: 'crash'; x: number; z: number; big: boolean }
  | { k: 'toast'; text: string }
  | { k: 'finish' }
  | { k: 'catastrophe' }
  | { k: 'speedWarn' }
  | { k: 'complete'; result: LevelResult };

const CAR = { len: 4.6, w: 1.86, wheelbase: 2.75, mass: 1400 };
const VMAX = 40;           // 90 mph
const VREV = 5;

export interface Mission { name: string; x: number; z: number; edge: Edge; s: number; ang: number; t0: number; kind?: string }

export const LANDMARK_NAMES = [
  'Carroll County Courthouse', 'Carrollton Art Center', 'Neva Lomason Memorial Library', 'Southwire', 'Dream City Brewing', 'Local Ties Brewing Company',
  'Buzzards Coffee', 'La Fiesta', 'Doctor Tracy P. Stallings Community Center', 'Carrollton Senior Center', 'Southeastern Quilt & Textile Museum', 'Carollton Fire Department Station 21',
  'Moores Chapel Methodist Church', 'Sprinkles Donuts', 'United Community Bank', 'Maple Street Mansion', 'The Depot on Bradley', 'Bank OZK', 'Howard B. Benson Building',
];

export class OpenSim {
  readonly map: GameMap;
  readonly traffic: Traffic;
  readonly peds: Pedestrians;
  readonly trains: Trains;
  readonly tracker: ScoreTracker;
  readonly difficulty: DifficultyConfig;
  readonly level: LevelConfig;
  events: OSimEvent[] = [];
  time = 0;
  finished = false;
  private completed = false;
  private result: LevelResult | null = null;
  // ---- the car
  x = 0; z = 0; h = 0; v = 0; steer = 0; yawRate = 0; lateral = 0;
  accel = 0; braking = false; reversing = false; reverseHold = 0;
  pitch = 0; roll = 0;
  signalDir: -1 | 0 | 1 = 0; signalAt = -99;
  invulnUntil = 0;
  maxMph = VMAX * M_PER_S_TO_MPH;
  strikes = 0; strikes0 = 0;
  traveled = 0; cleanDist = 0;
  /** the road under the car */
  hit: RoadHit | null = null; onRoad = false; dir: 1 | -1 = 1; roadName = ''; limit = 25; lane = 0; rightOff = 0;
  prompt = ''; promptAt = 0;
  mission: Mission | null = null; missions = 0; route: Route | null = null; routeAt = 0;
  paused = false;
  /** signal the nearest approach shows, for the HUD */
  nearSignal: { state: SigState; left: number; dist: number } | null = null;
  gapSec = 0;

  private ap: { edge: Edge; end: 0 | 1; node: Node; minV: number; stopped: boolean; h0: number; sig: number; seen: number; judged: boolean } | null = null;
  private inJunction: { node: Node; h0: number; sig: -1 | 0 | 1; at: number } | null = null;
  private speedT = 0; private speedCool = 0; private wrongT = 0; private wrongCool = 0; private sideT = 0; private sideCool = 0; private crashCool = 0; private offT = 0;
  private lastTurnSig = -99;
  private planner;
  private obs: Mover[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private rnd = 1;

  constructor(difficulty: Difficulty, private snd: Sfx, opts: { seed?: number; tracker?: ScoreTracker } = {}) {
    this.map = loadMap();
    this.difficulty = getDifficulty(difficulty);
    this.tracker = opts.tracker ?? new ScoreTracker();
    this.level = { id: OPEN_ID, name: 'Carrollton Open World', subtitle: 'The real streets of Carrollton, GA', length: 1e6, speedLimit: 35, maxSpeed: 90, features: [], obstacleGap: 300, parScore: 1800, shoulderColor: 0x35414a, endless: true } as LevelConfig;
    this.rnd = (opts.seed ?? (Math.random() * 1e9)) >>> 0 || 1;
    this.traffic = new Traffic(this.map, Math.round(34 * Math.min(1.5, this.difficulty.trafficMul)));
    this.traffic.seed(this.rnd);
    this.traffic.obstacles = this.obs;
    this.peds = new Pedestrians(this.map, this.rnd + 11);
    this.trains = new Trains(this.map, this.rnd + 23);
    this.planner = makeRoutePlanner(this.map);
    this.spawnPlayer();
    this.traffic.populate(this.x, this.z, Math.sin(this.h), Math.cos(this.h), this.traffic.max);
    this.banner('CARROLLTON', 'Drive anywhere. Follow every rule. The streets are the real ones', 4200, 'gold');
    this.newMission();
  }
  private r() { this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0; return this.rnd / 4294967296; }

  // ------------------------------------------------------------------ start
  private spawnPlayer() {
    // start in the right lane of Newnan Street, just south of Adamson Square, heading north (the way the signs read)
    const m = this.map;
    let best: { e: Edge; s: number; d: number } | null = null;
    const tx = 131, tz = 138;
    for (const e of m.edges) if (e.way.rank >= 2 && e.way.name) for (let s = 0; s < e.len; s += 4) {
      const i = Math.min(e.p.length / 2 - 1, Math.floor(s / e.len * (e.p.length / 2 - 1)));
      const d = Math.hypot(e.p[i * 2]! - tx, e.p[i * 2 + 1]! - tz); if (!best || d < best.d) best = { e, s, d };
    }
    const e = best!.e;
    const at = (s: number) => { let i = 0; while (i < e.cum.length - 2 && e.cum[i + 1]! < s) i++; const l = e.cum[i + 1]! - e.cum[i]! || 1, t = (s - e.cum[i]!) / l; return { x: e.p[i * 2]! + (e.p[i * 2 + 2]! - e.p[i * 2]!) * t, z: e.p[i * 2 + 1]! + (e.p[i * 2 + 3]! - e.p[i * 2 + 1]!) * t, tx: (e.p[i * 2 + 2]! - e.p[i * 2]!) / l, tz: (e.p[i * 2 + 3]! - e.p[i * 2 + 1]!) / l }; };
    const s0 = Math.min(Math.max(8, best!.s), e.len - 8);
    const p = at(s0);
    const lw = e.way.lw; const off = (e.way.turnLane ? lw / 2 : 0) + lw / 2;
    this.h = Math.atan2(p.tx, p.tz);
    this.x = p.x - p.tz * off; this.z = p.z + p.tx * off;
    this.v = 0; this.tx0 = this.x; this.tz0 = this.z;
  }
  private tx0 = 0; private tz0 = 0;

  // ------------------------------------------------------------------ helpers
  private emit(e: OSimEvent) { this.events.push(e); }
  drain(): OSimEvent[] { const e = this.events; this.events = []; return e; }
  private float(text: string, good: boolean, x = this.x, z = this.z) { this.emit({ k: 'float', text, good, x, z }); }
  banner(title: string, sub?: string, ms = 2600, tone: 'gold' | 'red' | 'white' = 'gold') { this.emit({ k: 'banner', title, sub, ms, tone }); }
  private award(key: PointKey, text?: string) {
    const pts = this.tracker.add(key);
    if (text) this.float(`${pts >= 0 ? '+' : ''}${pts} ${text}`, pts >= 0);
    if (pts > 0) this.snd.checkpoint?.(); else this.snd.yieldBuzz?.();
    if (pts < 0) { this.cleanDist = 0; }
    return pts;
  }
  private after(sec: number, fn: () => void) { this.timers.push({ at: this.time + sec, fn }); }
  private say(text: string) { this.prompt = text; this.promptAt = this.time; }
  setSignal(dir: -1 | 0 | 1) { this.signalDir = this.signalDir === dir ? 0 : dir; this.signalAt = this.time; this.snd.uiTick?.(); }
  get mph() { return Math.abs(this.v) * M_PER_S_TO_MPH; }
  get speedLimitNow() { return this.limit; }
  get speeding() { return this.onRoad && this.mph > this.limit + 3.5; }
  get signalOn() { return this.signalDir !== 0; }
  get isComplete() { return this.completed; }
  get progress() { return 0; }
  get travelPx() { return this.traveled * 10; }
  get sim() { return this; }
  endEarly() { this.finish(); }
  asMover(): Mover { return { x: this.x, z: this.z, h: this.h, v: this.v, len: CAR.len, w: CAR.w }; }

  /** strike: three of them end the drive; a long clean stretch drops one */
  private strike(why: string) {
    if (this.time < this.invulnUntil) return;
    this.strikes++; this.cleanDist = 0;
    this.invulnUntil = this.time + 2.2;
    this.emit({ k: 'flash', color: 0xff3a2a, dur: 0.5 });
    this.banner(`STRIKE ${this.strikes} OF 3`, why, 2800, 'red');
    if (this.strikes >= 3) this.after(1.4, () => this.finish('SUSPENDED'));
  }

  // ------------------------------------------------------------------ the step
  step(dt: number, c: Controls) {
    if (this.finished) { this.runTimers(); this.settle(dt); return; }
    dt = Math.min(dt, 0.05);
    const sub = dt > 1 / 55 ? 2 : 1, h = dt / sub;
    for (let i = 0; i < sub; i++) this.physics(h, c);
    this.time += dt;
    this.runTimers();
    this.hit = this.map.roadAt(this.x, this.z, this.h);
    this.readRoad();
    this.rules(dt);
    this.traffic.step(dt, this.time, this.asMover(), () => true);
    this.collideCars();
    if (this.traffic.cars.length < this.traffic.max * 0.9 && ((this.time * 4) | 0) % 2 === 0) this.traffic.spawnOne(this.x, this.z, 90, 300, true, Math.sin(this.h), Math.cos(this.h));
    this.peds.step(dt, this.time, this.asMover(), this.traffic.cars);
    this.trains.step(dt, this.time);
    this.obs.length = 0; for (const m of this.peds.movers) this.obs.push(m); for (const m of this.trains.movers) this.obs.push(m);
    this.pedRules(dt);
    this.railRules(dt);
    this.missionStep(dt);
    // clean driving heals a strike
    this.cleanDist += Math.abs(this.v) * dt;
    if (this.strikes > 0 && this.cleanDist > 1900) { this.strikes--; this.cleanDist = 0; this.banner('CLEAN DRIVING', 'One strike off your record', 2400, 'white'); }
    if (this.time - this.promptAt > 6) this.prompt = '';
    // auto-cancel the turn signal once the turn is made
    if (this.signalDir !== 0 && this.time - this.signalAt > 4 && Math.abs(this.steer) < 0.05 && !this.inJunction && this.mph > 8) {
      if (this.time - this.lastTurnSig > 1.2 && this.time - this.signalAt > 9) this.signalDir = 0;
    }
  }

  private settle(dt: number) { this.v *= Math.exp(-2.5 * dt); this.x += Math.sin(this.h) * this.v * dt; this.z += Math.cos(this.h) * this.v * dt; this.time += dt; this.traffic.step(dt, this.time, this.asMover(), () => true); }

  // ------------------------------------------------------------------ the car
  private physics(dt: number, c: Controls) {
    const grass = !this.onRoadSurface();
    // heading grows when the car turns left (forward is (sin h, cos h), right is (-cos h, sin h)), so left steers positive
    const steerIn = (c.left ? 1 : 0) + (c.right ? -1 : 0);
    // reverse: brake from a standstill, hold it and the car backs up
    this.braking = false;
    let a = 0;
    if (c.gas && !c.brake) {
      if (this.v < -0.3) { a = 11; this.braking = true; }
      else { const vmax = VMAX * (grass ? 0.55 : 1); a = 5.4 * Math.max(0, 1 - Math.pow(Math.max(0, this.v) / vmax, 1.7)); this.reverseHold = 0; }
    } else if (c.brake) {
      if (this.v > 0.4) { a = -10.5; this.braking = true; this.reverseHold = 0; }
      else { this.reverseHold += dt; if (this.reverseHold > 0.35 || this.v < -0.1) { a = -3.0 * Math.max(0, 1 - Math.abs(this.v) / VREV); } else { a = -Math.sign(this.v) * 3; this.braking = true; } }
    } else this.reverseHold = 0;
    // resistance: rolling, air and (off the road) grass
    const drag = 0.18 + 0.0009 * this.v * this.v + (grass ? 3.6 : 0);
    if (!c.gas && !c.brake) a -= Math.sign(this.v) * Math.min(Math.abs(this.v) / Math.max(dt, 1e-3), drag + 0.6);
    else a -= Math.sign(this.v) * Math.min(Math.abs(this.v) / Math.max(dt, 1e-3), drag);
    this.accel += (a - this.accel) * Math.min(1, dt * 9);
    this.v = Math.max(-VREV, Math.min(VMAX, this.v + a * dt));
    if (Math.abs(this.v) < 0.04 && !c.gas && !c.brake) this.v = 0;
    this.reversing = this.v < -0.3;
    // steering: lock shrinks with speed, the wheels ease in and out
    const lock = 0.62 / (1 + Math.pow(Math.abs(this.v) / 9.5, 1.6)) + 0.05;
    const want = steerIn * lock;
    const rate = (steerIn === 0 ? 3.6 : 1.9) * (1 + Math.min(1, Math.abs(this.v) / 25));
    this.steer += Math.max(-rate * dt, Math.min(rate * dt, want - this.steer));
    // bicycle model, limited by the grip of the tyres
    const L = CAR.wheelbase;
    let yaw = (this.v / L) * Math.tan(this.steer);
    const grip = 8.4 * (grass ? 0.6 : 1);
    const latA = Math.abs(yaw * this.v);
    if (latA > grip) { yaw *= grip / latA; this.lateral = Math.min(1, this.lateral + dt * 3); } else this.lateral = Math.max(0, this.lateral - dt * 3);
    this.yawRate += (yaw - this.yawRate) * Math.min(1, dt * 14);
    this.h = wrapAngle(this.h + this.yawRate * dt);
    // slide a little when you over-cook a corner
    this.x += Math.sin(this.h) * this.v * dt; this.z += Math.cos(this.h) * this.v * dt;
    this.traveled += Math.abs(this.v) * dt;
    // body lean for the camera and the model
    this.pitch += (Math.max(-0.05, Math.min(0.05, -a * 0.0042)) - this.pitch) * Math.min(1, dt * 7);
    this.roll += (Math.max(-0.07, Math.min(0.07, this.yawRate * this.v * 0.0016)) - this.roll) * Math.min(1, dt * 7);
    this.collideWalls();
    this.keepInMap(dt);
  }
  /** the edge of the map: the car slows to a stop against an invisible fence and the screen says why */
  private keepInMap(dt: number) {
    const b = this.map.bounds, M = 14;
    let out = false;
    if (this.x < b.x0 + M) { this.x = b.x0 + M; out = true; } else if (this.x > b.x1 - M) { this.x = b.x1 - M; out = true; }
    if (this.z < b.z0 + M) { this.z = b.z0 + M; out = true; } else if (this.z > b.z1 - M) { this.z = b.z1 - M; out = true; }
    if (out) { this.v *= Math.exp(-6 * dt); this.edgeT = this.time; if (this.time - this.edgeSaid > 5) { this.edgeSaid = this.time; this.say('Edge of the Carrollton map: turn around'); } }
  }
  private edgeT = -99; private edgeSaid = -99;
  /** stuck on the grass or against a wall: put the car back on the nearest road, facing along it. Costs a few points, not a strike. */
  recover() {
    if (this.finished) return;
    const hit = nearestDrivable(this.map, this.x, this.z, 500) ?? nearestDrivable(this.map, this.x, this.z, 4000); if (!hit) return;
    const e = hit.edge, lw = e.way.lw;
    // the lane that matches the way the car already faces
    const fwdDot = Math.sin(this.h) * Math.sin(hit.ang) + Math.cos(this.h) * Math.cos(hit.ang);
    let ang = fwdDot >= 0 ? hit.ang : hit.ang + Math.PI;
    if (e.way.oneway) ang = hit.ang;
    const off = (e.way.turnLane ? lw / 2 : 0) + lw / 2, sx = Math.sin(ang), sz = Math.cos(ang);
    this.x = hit.x - sz * off; this.z = hit.z + sx * off; this.h = wrapAngle(ang);
    this.v = 0; this.yawRate = 0; this.steer = 0; this.signalDir = 0;
    this.invulnUntil = this.time + 2.5; this.ap = null; this.inJunction = null;
    this.tracker.add('WRONG_SIDE' as PointKey); this.float('-60 RESET', false);
    this.banner('BACK ON THE ROAD', undefined, 1600, 'white');
  }
  private onRoadSurface() {
    const hit = this.hit; if (!hit) return false;
    return hit.dist <= hit.edge.way.width / 2 + 2.2 || this.nearPaved();
  }
  private nearPaved() { for (const l of this.map.lots) if (inPoly(l.p, this.x, this.z)) return true; return false; }

  private collideWalls() {
    const m = this.map;
    const cs = Math.cos(this.h), sn = Math.sin(this.h);
    for (const off of [-1.45, 0, 1.45]) {
      const cx = this.x + sn * off, cz = this.z + cs * off, r = 0.98;
      const cell = m.walls(cx, cz); if (!cell) continue;
      for (let i = 0; i < cell.length; i += 4) {
        const x0 = cell[i]!, z0 = cell[i + 1]!, x1 = cell[i + 2]!, z1 = cell[i + 3]!, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
        let t = ((cx - x0) * dx + (cz - z0) * dz) / l2; t = Math.max(0, Math.min(1, t));
        const px = x0 + dx * t, pz = z0 + dz * t, ddx = cx - px, ddz = cz - pz, d = Math.hypot(ddx, ddz);
        if (d < r && d > 1e-4) {
          const nx = ddx / d, nz = ddz / d, push = r - d;
          this.x += nx * push; this.z += nz * push;
          // normal speed of the car into the wall
          const vx = Math.sin(this.h) * this.v, vz = Math.cos(this.h) * this.v, into = -(vx * nx + vz * nz);
          if (into > 0.5) {
            const kill = Math.min(1, 0.35 + into / 14);
            this.v *= (1 - kill * 0.9);
            this.yawRate += (nx * cs - nz * sn) * into * 0.05;
            this.onHit('building', into);
          }
        }
      }
    }
  }
  private onHit(kind: 'building' | 'car', speed: number) {
    if (this.crashCool > this.time) return;
    this.crashCool = this.time + 1.3;
    const big = speed > 5;
    this.snd.collision?.();
    this.emit({ k: 'shake', amp: Math.min(1.6, 0.4 + speed / 8), dur: 0.4 });
    this.emit({ k: 'crash', x: this.x, z: this.z, big });
    if (kind === 'building') { if (speed > 2.5) { this.award('HIT_BUILDING', 'HIT'); if (big) this.strike('You hit a building'); } }
    else { this.award('HIT_TRAFFIC', 'COLLISION'); if (speed > 2.5) this.strike('You hit another car'); }
  }
  private collideCars() {
    const cs = Math.cos(this.h), sn = Math.sin(this.h);
    for (const car of this.traffic.cars) {
      const dx = car.x - this.x, dz = car.z - this.z;
      if (dx * dx + dz * dz > 100) continue;
      const ccs = Math.cos(car.h), csn = Math.sin(car.h);
      const n1 = 3, n2 = Math.max(2, Math.ceil(car.len / 2.2));
      for (let i = 0; i < n1; i++) {
        const o1 = (i - 1) * 1.5, ax = this.x + sn * o1, az = this.z + cs * o1;
        for (let j = 0; j < n2; j++) {
          const o2 = (j - (n2 - 1) / 2) * (car.len - 1.6) / Math.max(1, n2 - 1), bx = car.x + csn * o2, bz = car.z + ccs * o2;
          const rr = 0.95 + car.w / 2 - 0.05, ddx = ax - bx, ddz = az - bz, d = Math.hypot(ddx, ddz);
          if (d < rr && d > 1e-4) {
            const nx = ddx / d, nz = ddz / d, push = (rr - d);
            this.x += nx * push * 0.6; this.z += nz * push * 0.6;
            const rvx = Math.sin(this.h) * this.v - Math.sin(car.h) * car.v, rvz = Math.cos(this.h) * this.v - Math.cos(car.h) * car.v;
            const into = -(rvx * nx + rvz * nz);
            if (into > 1.1) {
              this.v *= Math.max(0.15, 1 - into / 16);
              car.hit = 2.8; car.v *= 0.2;
              this.onHit('car', into);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ the road under the car
  private readRoad() {
    const hit = this.hit;
    if (!hit) { this.onRoad = false; this.roadName = ''; return; }
    const w = hit.edge.way;
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const along = fx * hit.tx + fz * hit.tz;
    this.dir = along >= 0 ? 1 : -1;
    this.onRoad = hit.dist <= w.width / 2 + 0.6;
    if (this.onRoad) {
      this.roadName = w.name || (w.cls === 'service' ? 'Private drive' : 'Local street');
      // the limit of the road we are on, the busiest road at a junction
      this.limit = w.mph;
      // how far right of the centre line we are, in the direction of travel
      this.rightOff = hit.side * this.dir;
      const lw = w.lw; this.lane = w.oneway ? Math.max(0, Math.min(w.lanes - 1, Math.floor((this.rightOff + w.width / 2) / lw))) : Math.max(0, Math.floor((this.rightOff - (w.turnLane ? lw / 2 : 0)) / lw));
    }
  }

  // ------------------------------------------------------------------ the examiner
  private rules(dt: number) {
    const hit = this.hit; if (!hit || !this.onRoad) { this.offT = this.mph > 12 ? this.offT + dt : 0; this.sideT = 0; this.wrongT = 0; this.speedT = 0; if (this.offT > 2 && this.mph > 12) this.say('Stay on the road'); this.nearSignal = null; this.approach(dt); return; }
    this.offT = 0;
    const w = hit.edge.way;
    const mph = this.mph;
    // ---- speed
    const over = mph - this.limit;
    if (over > 3.5 && this.v > 0) { this.speedT += dt; if (this.speedT > 2.0 && this.time > this.speedCool) { this.speedCool = this.time + 7; this.award('SPEEDING', `${Math.round(mph)} IN A ${this.limit}`); this.emit({ k: 'speedWarn' }); if (over > 20) this.strike(`${Math.round(mph)} mph in a ${this.limit}`); } }
    else this.speedT = Math.max(0, this.speedT - dt * 2);
    // ---- one-way streets, driven the wrong way
    if (w.oneway && this.dir === -1 && this.v > 2.2) {
      this.wrongT += dt;
      if (this.wrongT > 1.1 && this.time > this.wrongCool) { this.wrongCool = this.time + 9; this.award('WRONG_WAY', 'WRONG WAY'); this.strike('Wrong way on a one-way street'); }
    } else this.wrongT = 0;
    // ---- the right side of a two-way road
    if (!w.oneway && this.v > 3 && !this.nearJunction(hit)) {
      const lw = w.lw, limit = w.turnLane ? -lw * 0.5 : -0.35;
      if (this.rightOff < limit - 0.2 && this.rightOff > -w.width / 2 - 0.5) {
        this.sideT += dt;
        if (this.sideT > 1.3 && this.time > this.sideCool) { this.sideCool = this.time + 5; this.award(this.rightOff < -lw * 0.9 ? 'WRONG_SIDE' : 'LANE_CROSS', this.rightOff < -lw * 0.9 ? 'WRONG SIDE' : 'CENTRE LINE'); this.say('Keep right of the centre line'); }
      } else this.sideT = Math.max(0, this.sideT - dt * 2);
    }
    this.approach(dt);
    this.junction(dt);
  }
  private nearJunction(hit: RoadHit) {
    const e = hit.edge;
    return hit.s < e.a.clear + 2 || hit.s > e.len - e.b.clear - 2;
  }

  /** the signal or stop sign ahead: judge the car as it crosses the stop line */
  private approach(dt: number) {
    const hit = this.hit;
    let ap = this.ap;
    if (hit && this.onRoad && !ap && this.v > 0.3) {
      const e = hit.edge, end: 0 | 1 = this.dir === 1 ? 1 : 0, node = end === 1 ? e.b : e.a;
      const dist = end === 1 ? e.len - hit.s : hit.s;
      const controlled = node.signal || e.stop[end];
      if (controlled && dist < node.clear + 30 && dist > node.clear - 1) {
        ap = this.ap = { edge: e, end, node, minV: this.mph, stopped: false, h0: this.h, sig: this.signalDir, seen: this.time, judged: false };
      }
    }
    if (!ap) { this.nearSignal = null; return; }
    // distance to the junction we are approaching (measured on the same edge as long as we stay on it)
    const e = ap.edge, node = ap.node;
    const nd = Math.hypot(node.x - this.x, node.z - this.z);
    const ahead = (node.x - this.x) * Math.sin(this.h) + (node.z - this.z) * Math.cos(this.h);
    const line = node.clear + CAR.len / 2 + 0.2;      // the front bumper reaches the stop line (drawn at the edge of the junction box) when the centre is this far from the node
    if (nd > node.clear + 42 || (ahead < -3 && nd > node.clear + 2)) { this.ap = null; return; }
    if (this.signalDir !== 0) ap.sig = this.signalDir;
    const sig = node.signal ? signalState(node, e.phase[ap.end], this.time) : null;
    if (node.signal) {
      const t0 = this.time;
      const left = ((e.phase[ap.end] === 0 ? 18.5 : 34.5) - ((t0 + node.phaseOffset) % 36) + 36) % 36;
      this.nearSignal = { state: sig!, left, dist: Math.max(0, nd - line) };
    } else this.nearSignal = null;
    if (nd < line + 8) ap.minV = Math.min(ap.minV, this.mph);
    if (nd < line + 4 && this.mph < 1.5) ap.stopped = true;
    if (!ap.judged && nd < line - 0.9 && ahead > -2) {
      ap.judged = true;
      if (node.signal) {
        if (sig === 'red') { this.award('RAN_RED_LIGHT', 'RED LIGHT'); this.strike('You ran a red light'); }
        else if (sig === 'green') this.award('GREEN_LIGHT', 'GREEN');
        else this.float('YELLOW: stop if you can', true);
      } else if (e.stop[ap.end]) {
        if (ap.stopped || ap.minV < 2.2) this.award('FULL_STOP', 'FULL STOP');
        else { this.award('RAN_STOP_SIGN', 'STOP SIGN'); this.say('Come to a full stop at the line'); }
      }
      // the junction starts here
      this.inJunction = { node, h0: this.h, sig: ap.sig as -1 | 0 | 1, at: this.time };
    }
    if (ap.judged && nd < node.clear * 0.6) this.ap = null;
    // prompts as the line comes up
    if (!ap.judged && nd < line + 24 && nd > line + 8) {
      if (node.signal && sig === 'red') this.say('Red light: stop at the line');
      else if (e.stop[ap.end]) this.say('Stop sign ahead: come to a complete stop');
    }
  }

  /** the turn through a junction: signalled, and not too fast */
  private junction(dt: number) {
    void dt;
    const j = this.inJunction; if (!j) {
      // junction without a control: detect entering any junction box
      const hit = this.hit; if (!hit) return;
      const e = hit.edge, end: 0 | 1 = this.dir === 1 ? 1 : 0, node = end === 1 ? e.b : e.a;
      if (node.arms.length >= 3) {
        const nd = Math.hypot(node.x - this.x, node.z - this.z);
        if (nd < node.clear * 0.8) this.inJunction = { node, h0: this.h, sig: this.signalDir, at: this.time };
      }
      return;
    }
    const n = j.node, nd = Math.hypot(n.x - this.x, n.z - this.z);
    if (this.signalDir !== 0 && this.time - this.signalAt < 8) j.sig = this.signalDir;
    if (nd > n.clear + 4) {
      const dh = wrapAngle(this.h - j.h0);
      if (Math.abs(dh) > 0.7 && this.v > 0) {
        // right turns make the heading smaller, left turns larger
        if (j.sig !== 0 && ((dh < 0 && j.sig === 1) || (dh > 0 && j.sig === -1))) { this.award('SIGNALLED', 'SIGNALLED'); this.signalDir = 0; }
        else if (j.sig === 0) { this.award('NO_SIGNAL', 'NO SIGNAL'); }
        this.lastTurnSig = this.time;
      }
      this.inJunction = null;
    } else if (nd < n.clear) {
      const dh = Math.abs(wrapAngle(this.h - j.h0));
      if (dh > 0.5 && this.v > 11 && this.time > this.speedCool - 6) { this.speedCool = this.time + 8; this.award('TURN_TOO_FAST', 'TURN TOO FAST'); }
    }
  }

  // ------------------------------------------------------------------ pedestrians and trains
  private pedRules(dt: number) {
    void dt;
    for (const p of this.peds.list) {
      const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
      if (d < 1.5 && this.mph > 2 && p.state === 'walk' && !p.hit) {
        p.hit = true; this.tracker.zeroOut('HIT_PEDESTRIAN'); this.emit({ k: 'catastrophe' }); this.snd.catastrophe?.();
        this.emit({ k: 'crash', x: p.x, z: p.z, big: true });
        this.after(1.6, () => this.finish('PEDESTRIAN')); this.finished = true; this.after(0.1, () => 0);
      }
      // the person is in the crosswalk ahead: yield
      if (p.state === 'walk' && !p.judged) {
        const fx = Math.sin(this.h), fz = Math.cos(this.h);
        const along = dx * fx + dz * fz;
        if (along > 0 && along < 16 && Math.abs(dx * fz - dz * fx) < 7) {
          p.yield = Math.min(p.yield, this.mph);
          this.say('Pedestrian in the crosswalk: stop and wait');
        }
        if (along < 1.2 && along > -3 && Math.abs(dx * fz - dz * fx) < 5.5 && p.onRoad) {
          p.judged = true;
          if (p.yield < 2.5 || this.mph < 2.5) this.award('PED_SAFE_PASS', 'YIELDED');
          else if (this.mph > 6) { this.award('PED_FAIL', 'DID NOT YIELD'); }
        }
      }
    }
  }
  private railState = new Map<LevelXKey, { stopped: boolean; judged: boolean; seen: number }>();
  private railRules(dt: number) {
    void dt;
    for (const lx of this.trains.crossings) {
      const k = lx as unknown as LevelXKey;
      let st = this.railState.get(k); if (!st) { st = { stopped: false, judged: false, seen: 0 }; this.railState.set(k, st); }
      const dx = lx.x - this.x, dz = lx.z - this.z, d = Math.hypot(dx, dz);
      if (d > 60) { st.stopped = false; st.judged = false; continue; }
      const down = lx.gate > 0.55;
      if (down && d < 22 && d > 7 && this.mph < 1) { if (!st.stopped) { st.stopped = true; this.award('RAIL_STOP', 'STOPPED FOR THE TRAIN'); } }
      if (down && d < 5 && this.v > 1 && !st.judged) { st.judged = true; this.award('RAN_RAIL', 'GATES DOWN'); this.strike('You drove around the gates'); }
      if (lx.trainAt && d < 4.2 && this.mph > 0.5) {
        this.tracker.zeroOut('HIT_PEDESTRIAN'); this.emit({ k: 'catastrophe' }); this.snd.catastrophe?.(); this.emit({ k: 'crash', x: this.x, z: this.z, big: true });
        this.banner('HIT BY A TRAIN', 'Never cross with the gates down', 3600, 'red');
        this.v = 0; this.after(1.8, () => this.finish('TRAIN')); this.finished = true;
      }
      if (!down && lx.warn && d < 40 && this.mph > 3) this.say('Train coming: lights flashing, stop behind the line');
    }
  }

  // ------------------------------------------------------------------ the mission: drive to a place by the book
  newMission() {
    const m = this.map;
    const named = m.buildings.filter((b) => b.name && LANDMARK_NAMES.some((n) => b.name!.startsWith(n.slice(0, 12))));
    const cands = (named.length ? named : m.buildings.filter((b) => b.name)).filter((b) => Math.hypot(b.cx - this.x, b.cz - this.z) > 220);
    if (!cands.length) { this.mission = null; return; }
    for (let k = 0; k < 8; k++) {
      const b = cands[Math.floor(this.r() * cands.length)]!;
      const spot = nearestDrivable(m, b.cx, b.cz, 90);
      if (!spot) continue;
      const route = this.planner(this.x, this.z, this.h, spot.edge, spot.s);
      if (!route) continue;
      this.mission = { name: b.name!, x: spot.x, z: spot.z, edge: spot.edge, s: spot.s, ang: spot.ang, t0: this.time };
      this.route = route; this.routeAt = this.time;
      this.banner('NEW TRIP', `Drive to ${b.name}`, 3600, 'gold');
      return;
    }
    this.mission = null;
  }
  private missionStep(dt: number) {
    void dt;
    const ms = this.mission; if (!ms) return;
    const d = Math.hypot(ms.x - this.x, ms.z - this.z);
    // re-plan the route now and then (you took a different turn)
    if (this.time - this.routeAt > 2.5 && this.hit && this.onRoad) { this.routeAt = this.time; const r = this.planner(this.x, this.z, this.h, ms.edge, ms.s); if (r) this.route = r; }
    if (d < 14 && this.mph < 10) {
      this.missions++;
      const t = this.time - ms.t0;
      this.award('MISSION', 'ARRIVED');
      if (this.mph < 1.5) this.award('PARKED_WELL', 'PERFECT STOP');
      this.banner('ARRIVED', `${ms.name} · ${Math.round(t)}s`, 3200, 'gold');
      this.snd.fanfare?.();
      this.mission = null; this.route = null;
      this.after(3.2, () => { if (!this.finished) this.newMission(); });
    }
  }

  // ------------------------------------------------------------------ the end
  private runTimers() { for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i]!.at <= this.time) { const t = this.timers.splice(i, 1)[0]!; t.fn(); } }
  finish(why?: string) {
    if (this.completed || this.result) { this.finished = true; return; }
    this.finished = true;
    this.snd.fanfare?.();
    this.emit({ k: 'finish' });
    const result = buildResult(this.level, this.tracker, this.difficulty, { distance: this.traveled * 10 });
    const t = this.tracker, out: string[] = [];
    out.push(`You drove ${(this.traveled / 1609).toFixed(1)} miles around Carrollton and finished ${this.missions} trip${this.missions === 1 ? '' : 's'}.`);
    if (why === 'SUSPENDED') out.push('Three strikes: your licence is suspended. Slow down, read the road and give every car a gap.');
    if (why === 'PEDESTRIAN') out.push('Instant fail: always stop for people in a crosswalk.');
    if (why === 'TRAIN') out.push('Instant fail: never cross railroad tracks with the gates down or the lights flashing.');
    if (t.countOf('RAN_RED_LIGHT') + t.countOf('RAN_STOP_SIGN') > 0) out.push('A complete stop means no movement at all, and a red light means stop behind the line.');
    else out.push('Every stop sign and signal obeyed.');
    if (t.countOf('SPEEDING') > 0) out.push('The posted limit changes from street to street. Check the sign every block.'); else out.push('Always at or below the posted limit.');
    if (t.countOf('NO_SIGNAL') > 0) out.push('Signal at least 100 feet before every turn (Q left, E right).');
    if (t.countOf('WRONG_WAY') > 0) out.push('One-way streets: look for the arrow and the sign before you turn in.');
    out.push(result.passed ? 'Instructor verdict: PASS. Ready for the next lesson!' : 'Instructor verdict: NEEDS PRACTICE. Book a lesson and try again!');
    result.feedback = out;
    this.result = result;
    this.after(0.9, () => this.emitComplete());
  }
  private emitComplete() { if (this.completed || !this.result) return; this.completed = true; this.emit({ k: 'complete', result: this.result }); }
  forceComplete() { if (!this.result) this.finish(); this.emitComplete(); }
}

type LevelXKey = object;

export function nearestDrivable(m: GameMap, x: number, z: number, maxD: number): { edge: Edge; s: number; x: number; z: number; ang: number } | null {
  let best: { edge: Edge; s: number; x: number; z: number; ang: number; d: number } | null = null;
  for (const e of m.edges) {
    if (!e.way.ai) continue;
    for (let i = 0; i + 3 < e.p.length; i += 2) {
      const x0 = e.p[i]!, z0 = e.p[i + 1]!, x1 = e.p[i + 2]!, z1 = e.p[i + 3]!, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      let t = ((x - x0) * dx + (z - z0) * dz) / l2; t = Math.max(0.1, Math.min(0.9, t));
      const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < maxD && (!best || d < best.d)) {
        const s = e.cum[i / 2]! + t * Math.sqrt(l2);
        if (s < e.a.clear + 3 || s > e.len - e.b.clear - 3) continue;
        best = { edge: e, s, x: px, z: pz, ang: Math.atan2(dx, dz), d };
      }
    }
  }
  return best;
}
export function inPoly(p: number[], x: number, z: number): boolean {
  let inside = false; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2]!, zi = p[i * 2 + 1]!, xj = p[j * 2]!, zj = p[j * 2 + 1]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
