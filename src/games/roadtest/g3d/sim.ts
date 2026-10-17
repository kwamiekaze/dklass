/**
 * The Road Test Challenge rules, as a plain TypeScript simulation (no Phaser, no three).
 * It is a faithful port of game/DrivingScene.ts: the same scoring events, combo, faults, stop signs, lights,
 * pedestrians, dogs, pickups, endless ramp and finish rules, so every score, grade and leaderboard row stays comparable.
 * What changed is the space it runs in: metres, with the player driving up the road (distance d grows ahead).
 *
 *   1 original pixel of distance  = 0.1 m      (speed: 5.5 px/s per mph  ->  0.55 m/s per mph)
 *   1 original pixel across       = 0.02833 m  (the 120 px lane becomes a 3.4 m lane)
 *
 * The 3D scene only READS this object each frame; the sim never touches three, the DOM or Phaser.
 */
import { getLevel } from '../game/levels';
import { ScoreTracker, buildResult, type PointKey } from '../game/scoring';
import { getDifficulty, type Difficulty, type DifficultyConfig, type LevelConfig, type LevelResult, type ObstacleType } from '../game/types';

export const LANE_W = 3.4;
export const LANE_X = [-LANE_W, 0, LANE_W] as const;
export const DIVIDERS = [-LANE_W / 2, LANE_W / 2] as const;
export const ROAD_HALF = LANE_W * 1.5;                 // 5.1 m from the centre line to the kerb
export const PLAYER_CLAMP = ROAD_HALF - 0.8;
export const MPH_TO_MPS = 0.55;
export const K_D = 0.1;                                 // metres per original pixel of distance
export const K_X = LANE_W / 120;                        // metres per original pixel across
const DIFF_INDEX: Record<string, number> = { learner: 0, licensed: 1, instructor: 2, legend: 3 };
export const PLAYER_HW = 0.72;
export const PLAYER_HL = 2.15;
/** the car's nose is this far ahead of the point the rules measure from (the centre), so stop lines are drawn this far past it */
export const NOSE = 2.4;

const L = (px: number) => px * K_D;
const X = (px: number) => px * K_X;

/** A tiny seeded generator (mulberry32) so a lesson is the same course every time for the same difficulty. */
export function seeded(seed: string | number) {
  let h = 1779033703 ^ String(seed).length;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0 || 0x9e3779b9;
  const frac = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    frac,
    between: (lo: number, hi: number) => lo + Math.floor(frac() * (hi - lo + 1)),
    real: (lo: number, hi: number) => lo + frac() * (hi - lo),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(frac() * arr.length)]!,
  };
}
type Rnd = ReturnType<typeof seeded>;

export interface Ob {
  id: number;
  type: ObstacleType;
  d: number;            // metres along the road
  x: number;            // metres across (0 = centre line, + = the right)
  lane: number;         // -1 left sidewalk, 0..2 lanes, 3 right sidewalk
  look: number;         // which car / outfit / dog variant (renderer picks)
  mph?: number;         // traffic speed; for walkers the sideways speed in m/s
  phase?: number;
  state?: 'red' | 'yellow' | 'green';
  resolved?: boolean;
  hit?: boolean;
  stopped?: boolean;
  nearMissed?: boolean;
  telegraph?: number;
  crossed?: boolean;
  safeAwarded?: boolean;
  stroll?: boolean;
  strollV?: number;
  barked?: boolean;
  /** knocked-away animation (cones, shielded cars): seconds elapsed, sideways, forward and spin speeds */
  fly?: { t: number; vx: number; vd: number; spin: number };
  /** walking phase for the walker animation */
  walk?: number;
  goneAt?: number;
  ramped?: boolean;
  owner?: boolean;
}

export type Sfx = {
  [k: string]: (...a: number[]) => void;
};

export type SimEvent =
  | { k: 'float'; text: string; good: boolean; x: number; d: number }
  | { k: 'burst'; x: number; d: number; n: number; color: number; up?: boolean }
  | { k: 'shake'; amp: number; dur: number }
  | { k: 'flash'; color: number; dur: number }
  | { k: 'banner'; title: string; sub?: string; ms: number; tone?: 'gold' | 'red' | 'white' }
  | { k: 'crash'; x: number; d: number; big: boolean }
  | { k: 'finish'; endless: boolean }
  | { k: 'catastrophe'; dog: boolean }
  | { k: 'speedWarn' }
  | { k: 'milestone'; text: string }
  | { k: 'pickup'; type: 'magnet' | 'shield' | 'star' }
  | { k: 'complete'; result: LevelResult };

export interface Controls { gas: boolean; brake: boolean; left: boolean; right: boolean }

export class RunSim {
  readonly level: LevelConfig;
  readonly difficulty: DifficultyConfig;
  readonly tracker = new ScoreTracker();
  readonly effectiveLength: number;      // metres
  obstacles: Ob[] = [];
  events: SimEvent[] = [];

  // player
  x = 0;
  steerV = 0;
  yaw = 0;                // visual heading, radians (+ = turning right)
  mph = 0;
  prevMph = 0;
  traveled = 0;           // metres
  time = 0;               // sim seconds (slow-mo scales it)
  timeScale = 1;
  finished = false;
  invulnUntil = 0;
  braking = false;
  accel = 0;              // m/s^2 along the road, for the body to pitch
  speeding = false;
  locked = false;         // after a catastrophe the wheel is dead

  // pickups
  magnetUntil = 0;
  hasShield = false;
  strikes = 0;

  // stats the HUD and the end banner like
  nearMisses = 0;
  streakClean = 0;

  // internal
  private nextId = 1;
  private effectiveGap: number;
  private speedingTimer = 0;
  private speedWarned = false;
  private cleanTimer = 0;
  private laneCrossing = false;
  private laneCrossCooldown = 0;
  private lastRampAt = 0;
  private endlessSpawnCursor = L(500);
  private endlessTrafficMul = 1;
  private endlessGap: number;
  private lastDistChunk = 0;
  private lastIntensityStep = 0;
  private lastMilestone = 0;
  pbBestDistance = 0;         // original pixels, as stored
  private pbShown = false;
  private rnd: Rnd;
  private timers: { at: number; fn: () => void }[] = [];
  private realClock = 0;
  private pendingResult = false;

  constructor(levelId: string, difficulty: Difficulty, private sfx: Sfx) {
    this.level = getLevel(levelId);
    this.difficulty = getDifficulty(difficulty);
    this.effectiveLength = this.level.endless ? Infinity : L(this.level.length * this.difficulty.lengthMul);
    this.effectiveGap = L(this.level.obstacleGap * this.difficulty.gapMul);
    this.endlessGap = this.effectiveGap;
    this.rnd = seeded(this.level.endless ? `endless-${Date.now()}-${Math.random()}` : `${this.level.id}|${this.difficulty.id}`);
    if (this.level.endless) {
      try {
        const raw = parseInt(localStorage.getItem('dk-game-endless-best-' + this.level.id) ?? '0', 10);
        this.pbBestDistance = Number.isFinite(raw) ? raw : 0;
      } catch { /* ignore */ }
      this.appendEndlessChunk(L(500), L(4500));
    } else this.buildCourse();
    this.obstacles.sort((a, b) => a.d - b.d);
  }

  /** original-pixel distance, the unit scores and the leaderboard were always kept in */
  get travelPx() { return this.traveled / K_D; }
  get progress() { return this.level.endless ? 0 : Math.min(1, this.traveled / this.effectiveLength); }
  get magnetOn() { return this.time < this.magnetUntil; }
  get maxMph() { return this.level.maxSpeed * this.difficulty.speedMul; }
  get overLimit() { return this.mph > this.level.speedLimit + this.difficulty.speedTolerance; }

  private emit(e: SimEvent) { this.events.push(e); }
  private snd(name: string, ...a: number[]) { try { this.sfx[name]?.(...a); } catch { /* sound is never allowed to stop a run */ } }
  private after(sec: number, fn: () => void) { this.timers.push({ at: this.realClock + sec, fn }); }

  // ------------------------------------------------------------ course ---
  private spawn(type: ObstacleType, dPx: number, lane: number, rnd?: Rnd) {
    const r = rnd ?? this.rnd;
    const d = L(dPx);
    const ob: Ob = { id: this.nextId++, type, d, x: lane >= 0 && lane <= 2 ? LANE_X[lane]! : 0, lane, look: r.between(0, 99) };
    switch (type) {
      case 'parkedCar': ob.x = lane === 0 ? -(ROAD_HALF - X(30)) : ROAD_HALF - X(30); break;
      case 'traffic': {
        const baseTrafficMul = this.difficulty.trafficMul * (this.level.endless ? this.endlessTrafficMul : 1);
        ob.mph = this.level.speedLimit * (rnd ? rnd.real(0.45, 0.7) : 0.6) * baseTrafficMul * this.difficulty.speedMul;
        break;
      }
      case 'stopSign': ob.x = ROAD_HALF + 1.25; break;
      case 'trafficLight':
        ob.x = -(ROAD_HALF + 1.25); ob.phase = r.frac() * 8; ob.state = 'green'; break;
      case 'checkpoint': ob.x = 0; break;
      case 'pedestrian': {
        const fromLeft = r.frac() > 0.5;
        ob.x = fromLeft ? -(ROAD_HALF + 0.2) : ROAD_HALF + 0.2;
        const vx = (45 + (rnd ? rnd.between(0, 25) : 15)) * this.difficulty.speedMul * K_X;
        ob.mph = fromLeft ? vx : -vx;
        ob.telegraph = Math.max(0.35, 1.4 - 0.3 * DIFF_INDEX[this.difficulty.id]!);
        ob.walk = r.frac() * 6;
        break;
      }
      case 'dog': {
        const fromLeft = r.frac() > 0.5;
        ob.x = fromLeft ? -(ROAD_HALF + 0.2) : ROAD_HALF + 0.2;
        const vx = (85 + (rnd ? rnd.between(0, 40) : 20)) * this.difficulty.speedMul * K_X;
        ob.mph = fromLeft ? vx : -vx;
        ob.telegraph = Math.max(0.25, 0.9 - 0.2 * DIFF_INDEX[this.difficulty.id]!);
        ob.walk = r.frac() * 6;
        break;
      }
      default: break;
    }
    this.obstacles.push(ob);
    return ob;
  }

  private spawnStroller(dPx: number, rnd: Rnd) {
    const onLeft = rnd.frac() > 0.5;
    const x = onLeft ? -(ROAD_HALF + 1.1) : ROAD_HALF + 1.1;
    const v = rnd.pick([-20, -14, 12, 18]) * K_D;
    this.obstacles.push({ id: this.nextId++, type: 'pedestrian', d: L(dPx), x, lane: onLeft ? -1 : 3, look: rnd.between(0, 99), stroll: true, strollV: v, walk: rnd.frac() * 6 });
    if (rnd.frac() < 0.3) {
      this.obstacles.push({ id: this.nextId++, type: 'dog', d: L(dPx + 12), x: x + (onLeft ? 0.55 : -0.55), lane: onLeft ? -1 : 3, look: rnd.between(0, 99), stroll: true, strollV: v, walk: rnd.frac() * 6 });
    }
  }

  private spawnDog(dPx: number, rnd: Rnd) {
    this.spawn('dog', dPx, 1, rnd);
    if (rnd.frac() < 0.55) { const o = this.spawn('pedestrian', dPx + 40, 1, rnd); o.owner = true; }
  }

  private buildCourse() {
    const lvl = this.level;
    const has = (t: ObstacleType) => lvl.features.includes(t);
    const reserved: number[] = [];
    const reserve = (d: number) => reserved.push(d);
    const isFree = (d: number, pad = 220) => reserved.every((r) => Math.abs(r - d) > pad);
    const totalLen = (lvl.length * this.difficulty.lengthMul);          // original pixels: the generators keep their numbers
    const rnd = this.rnd;

    if (has('checkpoint')) for (let i = 1; i <= 3; i++) { const d = (totalLen * i) / 4; reserve(d); this.spawn('checkpoint', d, 1); }
    if (has('stopSign')) for (let d = 1400; d < totalLen - 800; d += 2600) { if (!isFree(d)) continue; reserve(d); this.spawn('stopSign', d, 2); }
    if (has('trafficLight')) for (let d = 2600; d < totalLen - 800; d += 3200) { if (!isFree(d)) continue; reserve(d); this.spawn('trafficLight', d, 0); }

    const pool: ObstacleType[] = [];
    if (has('cone')) pool.push('cone', 'cone');
    if (has('parkedCar')) pool.push('parkedCar');
    if (has('traffic')) pool.push('traffic');
    const gapPx = lvl.obstacleGap * this.difficulty.gapMul;
    for (let d = 700; d < totalLen - 600; d += gapPx + rnd.between(-80, 120)) {
      if (!isFree(d, 180) || pool.length === 0) continue;
      const type = rnd.pick(pool);
      const lane = type === 'parkedCar' ? rnd.pick([0, 2]) : rnd.between(0, 2);
      this.spawn(type, d, lane, rnd);
    }
    if (has('star')) for (let d = 500; d < totalLen - 300; d += 380 + rnd.between(-60, 120)) { if (!isFree(d, 90)) continue; this.spawn('star', d, rnd.between(0, 2)); }

    const pedMul = lvl.pedDensityMul ?? 1;
    const pedGap = Math.max(400, (1800 - 300 * DIFF_INDEX[this.difficulty.id]!) / pedMul);
    for (let d = 1000; d < totalLen - 500; d += pedGap + rnd.between(-200, 300)) { if (!isFree(d, 200)) continue; this.spawn('pedestrian', d, 1, rnd); }
    const strollGap = Math.max(320, 900 / pedMul);
    for (let d = 600; d < totalLen - 300; d += strollGap + rnd.between(-120, 200)) this.spawnStroller(d, rnd);
    const dogMul = lvl.dogDensityMul ?? 1;
    if (dogMul > 0) {
      const dogGap = Math.max(700, 2400 / dogMul);
      for (let d = 1500; d < totalLen - 600; d += dogGap + rnd.between(-200, 400)) { if (!isFree(d, 180)) continue; this.spawnDog(d, rnd); }
    }
    let flip = 0, lastPickup = -Infinity;
    for (let d = 1200; d < totalLen - 400; d += 2500 + rnd.between(-300, 300)) {
      if (!isFree(d, 200) || Math.abs(d - lastPickup) < 500) continue;
      this.spawn((flip++ % 2 === 0) ? 'magnet' : 'shieldPickup', d, rnd.between(0, 2));
      lastPickup = d;
    }
  }

  private appendEndlessChunk(from: number, to: number) {
    const has = (t: ObstacleType) => this.level.features.includes(t);
    const rnd = this.rnd;
    const f = from / K_D, t = to / K_D, gap = this.endlessGap / K_D;     // back to original pixels for the generators
    for (let d = f + 800; d < t; d += 2200 + rnd.between(-200, 300)) {
      const type: ObstacleType = rnd.pick(['stopSign', 'trafficLight'] as const);
      this.spawn(type, d, type === 'stopSign' ? 2 : 0);
    }
    const pool: ObstacleType[] = ['cone', 'cone', 'parkedCar', 'traffic', 'traffic'];
    for (let d = f; d < t; d += gap + rnd.between(-40, 60)) {
      const type = rnd.pick(pool);
      this.spawn(type, d, type === 'parkedCar' ? rnd.pick([0, 2]) : rnd.between(0, 2), rnd);
    }
    if (has('star')) for (let d = f + 200; d < t; d += 320 + rnd.between(-40, 80)) this.spawn('star', d, rnd.between(0, 2));
    const pedGap = Math.max(500, 1500 / this.endlessTrafficMul);
    for (let d = f + 400; d < t; d += pedGap + rnd.between(-100, 200)) this.spawn('pedestrian', d, 1, rnd);
    for (let d = f + 200; d < t; d += 700 + rnd.between(-150, 250)) this.spawnStroller(d, rnd);
    for (let d = f + 900; d < t; d += 2200 + rnd.between(-300, 500)) this.spawnDog(d, rnd);
    const base = Math.floor(f / 2500);
    [f + 1000, f + 3000].forEach((p, i) => {
      const d = p + rnd.between(-120, 120);
      if (d <= f || d >= t) return;
      this.spawn(((base + i) % 2 === 0) ? 'magnet' : 'shieldPickup', d, rnd.between(0, 2));
    });
    this.endlessSpawnCursor = to;
    this.obstacles.sort((a, b) => a.d - b.d);
  }

  // ---------------------------------------------------------- scoring ---
  private float(text: string, good: boolean, x = this.x, d = this.traveled + 4) { this.emit({ k: 'float', text, good, x, d }); }

  award(key: PointKey, label?: string): number {
    const pts = this.tracker.add(key);
    const sign = pts >= 0 ? '+' : '';
    const comboTag = pts > 0 && this.tracker.combo > 1 ? ` x${this.tracker.combo}` : '';
    this.float(`${label ?? ''} ${sign}${pts}${comboTag}`.trim(), pts >= 0);
    if (pts < 0) {
      this.cleanTimer = 0;
      this.emit({ k: 'shake', amp: 0.5, dur: 0.15 });
    }
    this.snd('setSfxPitchStep', Math.max(0, this.tracker.combo - 1));
    return pts;
  }

  // -------------------------------------------------------------- step ---
  step(rawDt: number, c: Controls) {
    const real = Math.min(rawDt, 0.05);
    this.realClock += real;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.realClock >= this.timers[i]!.at) { const t = this.timers[i]!; this.timers.splice(i, 1); t.fn(); }
    }
    if (this.finished) { this.mph = Math.max(0, this.mph - 40 * real); this.traveled += this.mph * MPH_TO_MPS * real * 0.4; return; }
    const dt = real * this.timeScale;
    this.time += dt;

    this.prevMph = this.mph;
    this.drive(dt, c);
    this.snd('updateEngine', Math.min(1, this.mph / this.level.maxSpeed));

    if (this.level.endless) this.updateEndless(); else this.updateRamp();
    this.updateObstacles(dt);
    this.laneDiscipline(dt);
    this.checkSpeeding(dt);
    this.checkSmooth(dt);
    if (!this.level.endless && this.traveled >= this.effectiveLength) this.finish();
  }

  private drive(dt: number, c: Controls) {
    if (this.locked) c = { gas: false, brake: true, left: false, right: false };
    if (c.gas) this.mph += 32 * dt; else if (c.brake) this.mph -= 70 * dt; else this.mph -= 9 * dt;
    this.mph = Math.min(Math.max(this.mph, 0), this.maxMph);
    this.braking = c.brake && this.prevMph > 1;
    this.accel = ((this.mph - this.prevMph) / Math.max(dt, 1e-4)) * MPH_TO_MPS;
    this.traveled += this.mph * MPH_TO_MPS * dt;

    // steering: the original's 240 px/s (6.8 m/s) once rolling, now eased in and out so the car leans into it
    const top = 240 * K_X * Math.min(1, Math.max(0, this.mph / 18));
    const want = ((c.right ? 1 : 0) - (c.left ? 1 : 0)) * top;
    this.steerV += (want - this.steerV) * (1 - Math.exp(-dt * 14));
    this.x += this.steerV * dt;
    if (this.x < -PLAYER_CLAMP) { this.x = -PLAYER_CLAMP; if (this.steerV < 0) this.steerV = 0; }
    if (this.x > PLAYER_CLAMP) { this.x = PLAYER_CLAMP; if (this.steerV > 0) this.steerV = 0; }
    const yawWant = Math.max(-0.2, Math.min(0.2, (this.steerV / (240 * K_X)) * 0.2));
    this.yaw += (yawWant - this.yaw) * (1 - Math.exp(-dt * 10));

    if (this.mph > 35 && ((c.left || c.right) && this.mph > this.level.speedLimit - 5)) this.snd('tireScreech', Math.min(1, this.mph / this.level.maxSpeed));
    else if (c.brake && this.prevMph > 40 && this.mph < this.prevMph - 2) this.snd('tireScreech', 0.6);
  }

  private updateRamp() {
    const p = Math.min(1, Math.max(0, this.traveled / Math.max(1, this.effectiveLength)));
    for (const ob of this.obstacles) {
      if (ob.type === 'traffic' && ob.mph && !ob.ramped) { ob.mph *= 1 + 0.2 * p; ob.ramped = true; }
    }
    this.effectiveGap = L(this.level.obstacleGap * this.difficulty.gapMul) * (1 - 0.25 * p);
  }

  private updateEndless() {
    const px = this.travelPx;
    const step = Math.floor(px / 500);
    if (step > this.lastRampAt) {
      this.lastRampAt = step;
      this.endlessGap = Math.max(L(140), this.endlessGap * 0.96);
      this.endlessTrafficMul = Math.min(2.2, this.endlessTrafficMul * 1.02);
    }
    if (this.traveled + L(4000) > this.endlessSpawnCursor) this.appendEndlessChunk(this.endlessSpawnCursor, this.endlessSpawnCursor + L(4000));
    const chunk = Math.floor(px / 100);
    if (chunk > this.lastDistChunk) { this.tracker.addDistanceBonus((chunk - this.lastDistChunk) * 10); this.lastDistChunk = chunk; }
    const intensity = Math.min(3, Math.floor(px / 2000));
    if (intensity !== this.lastIntensityStep) { this.lastIntensityStep = intensity; this.snd('setEndlessIntensity', intensity); }
    const ms = Math.floor(px / 5000);
    if (ms > this.lastMilestone) { this.lastMilestone = ms; this.emit({ k: 'milestone', text: `${ms * 500} m` }); }
    if (!this.pbShown && this.pbBestDistance > 0 && px >= this.pbBestDistance) {
      this.pbShown = true;
      this.snd('personalBest');
      this.emit({ k: 'banner', title: 'NEW BEST!', ms: 2000, tone: 'gold' });
    }
    // forget what is long behind us
    if (this.obstacles.length > 400) {
      const keep = this.traveled - L(400);
      this.obstacles = this.obstacles.filter((o) => o.d >= keep);
    }
  }

  // ----------------------------------------------------------- actors ---
  private updateObstacles(dt: number) {
    for (const ob of this.obstacles) {
      if (ob.type === 'traffic' && ob.mph) ob.d += ob.mph * MPH_TO_MPS * dt;
      if (ob.fly) {
        ob.fly.t += dt;
        ob.x += ob.fly.vx * dt; ob.d += ob.fly.vd * dt;
      }
      const ahead = ob.d - this.traveled;
      // only things near the player need thinking about
      if (ahead > 260 || ahead < -60) {
        if (ob.type === 'trafficLight') this.lightState(ob);
        if (ob.stroll && ob.strollV != null) ob.d += ob.strollV * dt;
        continue;
      }
      switch (ob.type) {
        case 'trafficLight': this.lightState(ob); this.stopZone(ob, true); break;
        case 'stopSign': this.stopZone(ob, false); break;
        case 'checkpoint':
          if (!ob.resolved && this.traveled >= ob.d) { ob.resolved = true; this.award('CHECKPOINT', 'CHECKPOINT'); this.snd('checkpoint'); this.emit({ k: 'burst', x: 0, d: ob.d + 3, n: 16, color: 0xf2c14e, up: true }); }
          break;
        case 'star': this.handleStar(ob, dt); break;
        case 'pedestrian':
        case 'dog':
          if (ob.stroll) { if (ob.strollV != null) ob.d += ob.strollV * dt; ob.walk = (ob.walk ?? 0) + dt * 6; }
          else this.handleWalker(ob, dt);
          break;
        case 'cone': case 'parkedCar': case 'traffic': this.handleCollision(ob); break;
        case 'magnet': case 'shieldPickup': this.handlePickup(ob); break;
      }
    }
  }

  private lightState(ob: Ob) {
    const t = (this.time + (ob.phase ?? 0)) % 8.2;
    ob.state = t < 4 ? 'green' : t < 5.2 ? 'yellow' : 'red';
  }

  private stopZone(ob: Ob, isLight: boolean) {
    if (ob.resolved) return;
    const dist = ob.d - this.traveled;          // measured from the car's centre; the line itself is drawn NOSE further on, so the NOSE stops at it
    if (dist > 0 && dist < L(150) && this.mph <= 2) ob.stopped = true;
    if (dist <= 0) {
      ob.resolved = true;
      if (isLight) {
        if (ob.state === 'red') { this.award('RAN_RED_LIGHT', 'RED LIGHT!'); this.snd('yieldBuzz'); }
        else if (ob.state === 'green') { this.award('GREEN_LIGHT', 'GREEN LIGHT'); this.snd('checkpoint'); }
      } else if (ob.stopped) { this.award('FULL_STOP', 'FULL STOP'); this.snd('stopDing'); this.emit({ k: 'burst', x: this.x, d: this.traveled + 1, n: 10, color: 0xffffff }); }
      else { this.award('RAN_STOP_SIGN', 'STOP SIGN!'); this.snd('yieldBuzz'); }
    }
  }

  private handleStar(ob: Ob, dt: number) {
    if (ob.resolved) return;
    const dx = this.x - ob.x;
    let dd = ob.d - this.traveled;
    if (this.magnetOn && Math.abs(dx) < X(180)) {
      const pull = Math.min(Math.abs(dx), 10.2 * dt * 1.6);
      ob.x += Math.sign(dx) * pull;
      const pd = Math.min(Math.abs(dd), 24 * dt);
      if (dd > 0 && dd < L(220)) ob.d -= pd;
      dd = ob.d - this.traveled;
      if (Math.hypot(this.x - ob.x, dd) < L(40) + 0.6) return this.collectStar(ob);
    }
    if (Math.abs(this.x - ob.x) < 1.15 && Math.abs(dd) < 2.7) this.collectStar(ob);
  }

  private collectStar(ob: Ob) {
    ob.resolved = true; ob.goneAt = this.time;
    this.award('STAR', 'STAR');
    this.snd('starPickup');
    this.emit({ k: 'pickup', type: 'star' });
    this.emit({ k: 'burst', x: ob.x, d: ob.d, n: 8, color: 0xf2c14e, up: true });
  }

  private handlePickup(ob: Ob) {
    if (ob.resolved) return;
    if (Math.abs(this.x - ob.x) > 1.3 || Math.abs(ob.d - this.traveled) > 3.4) return;
    ob.resolved = true; ob.goneAt = this.time;
    if (ob.type === 'magnet') {
      this.magnetUntil = this.time + 10; this.snd('magnetPickup'); this.float('MAGNET', true); this.emit({ k: 'pickup', type: 'magnet' });
    } else {
      this.hasShield = true; this.snd('shieldPickup'); this.float('SHIELD', true); this.emit({ k: 'pickup', type: 'shield' });
    }
    this.emit({ k: 'burst', x: ob.x, d: ob.d, n: 14, color: 0xf2c14e, up: true });
  }

  private handleWalker(ob: Ob, dt: number) {
    if (ob.resolved) return;
    const ahead = ob.d - this.traveled;
    if (ob.type === 'dog' && !ob.barked && ahead < 110 && ahead > -4) { ob.barked = true; this.snd('dogBark'); }
    if ((ob.telegraph ?? 0) > 0) { ob.telegraph! -= dt; return; }
    if (ob.mph != null && !ob.crossed) {
      ob.x += ob.mph * dt;
      ob.walk = (ob.walk ?? 0) + dt * (ob.type === 'dog' ? 14 : 8);
      const past = (ob.mph > 0 && ob.x > ROAD_HALF + 0.2) || (ob.mph < 0 && ob.x < -(ROAD_HALF + 0.2));
      if (past) {
        ob.crossed = true; ob.resolved = true;
        if (!ob.hit && !ob.safeAwarded && this.traveled > ob.d + 2) {
          ob.safeAwarded = true;
          this.award('PED_SAFE_PASS', 'YIELDED'); this.snd('checkpoint');
          this.emit({ k: 'burst', x: ob.x, d: ob.d, n: 8, color: 0xf2c14e, up: true });
        }
        return;
      }
    }
    if (!ob.hit && this.time > this.invulnUntil) {
      if (Math.abs(this.x - ob.x) < 0.95 && Math.abs(ob.d - this.traveled) < 2.6) { ob.hit = true; this.catastrophe(ob); return; }
    }
    if (!ob.hit && !ob.safeAwarded && this.traveled > ob.d + 3 && (ob.telegraph ?? 0) <= 0) {
      ob.safeAwarded = true; this.award('PED_SAFE_PASS', 'YIELDED'); this.snd('checkpoint');
    }
  }

  private catastrophe(ob: Ob) {
    const dog = ob.type === 'dog';
    this.tracker.zeroOut('HIT_PEDESTRIAN');
    this.snd('catastrophe');
    if (dog) this.snd('ownerShout');
    try { navigator.vibrate?.([80, 40, 120]); } catch { /* ignore */ }
    this.emit({ k: 'shake', amp: 1.6, dur: 0.5 });
    this.emit({ k: 'flash', color: 0xff2820, dur: 0.4 });
    this.emit({ k: 'catastrophe', dog });
    this.emit({ k: 'banner', title: dog ? 'GAME OVER - HIT A DOG!' : 'GAME OVER - PEDESTRIAN!', ms: 2400, tone: 'red' });
    this.timeScale = 0.35;
    this.locked = true;
    ob.fly = { t: 0, vx: ob.mph && ob.mph > 0 ? 2 : -2, vd: 4, spin: 6 };
    this.mph = 0;
    this.after(1.2, () => { this.timeScale = 1; this.finish(); });
  }

  private handleCollision(ob: Ob) {
    if (ob.fly) return;
    const dd = ob.d - this.traveled;
    if (!ob.hit && !ob.nearMissed && !ob.resolved && dd > -3 && dd < 6) {
      const dx = Math.abs(this.x - ob.x);
      if (dx > 1.5 && dx < 2.45 && this.mph > 10) {
        ob.nearMissed = true;
        this.nearMisses++;
        this.award('NEAR_MISS', 'CLOSE!');
        this.snd('nearMissWhoosh');
      }
    }
    if (ob.hit || this.time < this.invulnUntil) return;
    const cone = ob.type === 'cone';
    const hw = cone ? 0.32 : 0.74, hl = cone ? 0.35 : 2.1;
    if (Math.abs(this.x - ob.x) >= PLAYER_HW + hw || Math.abs(dd) >= PLAYER_HL + hl) return;

    ob.hit = true;
    this.emit({ k: 'crash', x: ob.x, d: ob.d, big: !cone });

    if (this.hasShield && (ob.type === 'traffic' || ob.type === 'parkedCar')) {
      this.hasShield = false;
      this.snd('shieldBreak');
      this.float('SHIELD ABSORBED', true);
      this.invulnUntil = this.time + 0.9;
      this.emit({ k: 'flash', color: 0xf2c14e, dur: 0.25 });
      this.emit({ k: 'shake', amp: 0.45, dur: 0.2 });
      ob.fly = { t: 0, vx: (ob.x < this.x ? -1 : 1) * 14, vd: 8, spin: 7 };
      return;
    }
    if (cone) {
      this.award('HIT_CONE', 'CONE');
      this.snd('collision');
      ob.fly = { t: 0, vx: (ob.x < this.x ? -1 : 1) * (3 + this.rnd.frac() * 5), vd: 10 + this.mph * 0.25, spin: 12 };
    } else {
      this.award(ob.type === 'traffic' ? 'HIT_TRAFFIC' : 'HIT_PARKED_CAR', 'CRASH');
      this.snd('collision');
      this.mph *= 0.35;
      this.invulnUntil = this.time + 1.2;
      this.emit({ k: 'shake', amp: 1.1, dur: 0.35 });
      this.emit({ k: 'flash', color: 0xff5a4e, dur: 0.18 });
      try { navigator.vibrate?.(60); } catch { /* ignore */ }
      if (this.level.endless) {
        this.strikes++;
        if (this.strikes >= 3) this.after(0.6, () => this.finish());
      }
    }
  }

  private laneDiscipline(dt: number) {
    this.laneCrossCooldown = Math.max(0, this.laneCrossCooldown - dt);
    const onDivider = DIVIDERS.some((d) => Math.abs(this.x - d) < X(18));
    if (onDivider && this.mph > 6) {
      if (!this.laneCrossing && this.laneCrossCooldown === 0) {
        this.laneCrossing = true;
        this.laneCrossCooldown = 1.2;
        let target = 0, best = Infinity;
        for (let i = 0; i < 3; i++) { const d = Math.abs(this.x - LANE_X[i]!); if (d < best) { best = d; target = i; } }
        let unsafe = false, reason = 'UNSAFE LANE CHANGE';
        for (const ob of this.obstacles) {
          if (ob.resolved || ob.hit) continue;
          const ahead = ob.d - this.traveled;
          if (ahead > 40 || ahead < -15) continue;
          if (ob.type === 'traffic' || ob.type === 'parkedCar') {
            if (ob.lane === target && ahead > -L(90) && ahead < L(220)) { unsafe = true; reason = ob.type === 'parkedCar' ? 'UNSAFE LANE CHANGE' : 'CUT OFF A CAR'; break; }
          } else if (ob.type === 'pedestrian' && !ob.stroll) {
            if (Math.abs(ob.x - LANE_X[target]!) < X(60) && Math.abs(ahead) < L(160)) { unsafe = true; break; }
          }
        }
        if (unsafe) this.award('LANE_CROSS', reason);
      }
    } else if (!onDivider) this.laneCrossing = false;
  }

  private checkSpeeding(dt: number) {
    this.speeding = this.overLimit;
    if (this.speeding) {
      this.speedingTimer += dt;
      if (this.speedingTimer >= 1 && !this.speedWarned) { this.speedWarned = true; this.emit({ k: 'speedWarn' }); }
      if (this.speedingTimer >= 2) { this.speedingTimer = 0; this.speedWarned = false; this.award('SPEEDING', 'SPEEDING'); this.emit({ k: 'flash', color: 0xffffff, dur: 0.12 }); }
    } else { this.speedingTimer = 0; this.speedWarned = false; }
  }

  private checkSmooth(dt: number) {
    if (this.mph > 8) this.cleanTimer += dt;
    this.streakClean = this.cleanTimer;
    if (this.cleanTimer >= 6) { this.cleanTimer = 0; this.award('SMOOTH_DRIVING', 'SMOOTH'); }
  }

  endEarly() { this.finish(); }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    if (!this.level.endless) this.tracker.add('FINISH_BONUS');
    this.snd('fanfare'); this.snd('setSfxPitchStep', 0); this.snd('setEndlessIntensity', 0);
    if (this.level.endless) {
      try {
        const d = Math.round(this.travelPx);
        if (d > this.pbBestDistance) localStorage.setItem('dk-game-endless-best-' + this.level.id, String(d));
      } catch { /* ignore */ }
    }
    this.emit({ k: 'finish', endless: !!this.level.endless });
    this.emit({ k: 'banner', title: this.level.endless ? 'RUN OVER' : 'FINISH!', ms: 1500, tone: 'gold' });
    this.after(1.5, () => {
      this.pendingResult = true;
      this.emit({ k: 'complete', result: buildResult(this.level, this.tracker, this.difficulty, { distance: Math.round(this.travelPx) }) });
    });
  }

  get resultSent() { return this.pendingResult; }

  drain(): SimEvent[] { const e = this.events; this.events = []; return e; }
}
