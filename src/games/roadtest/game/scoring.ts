import type { LevelConfig, LevelResult, ScoreEvent, Difficulty, DifficultyConfig } from './types';

export const POINTS = {
  CHECKPOINT: 100,
  FULL_STOP: 75,
  GREEN_LIGHT: 25,
  SMOOTH_DRIVING: 25,
  FINISH_BONUS: 200,
  STAR: 25,
  NEAR_MISS: 15,
  PED_SAFE_PASS: 40,
  SIGNALLED: 12,
  SAFE_GAP: 20,
  MOVE_OVER: 120,
  RAIL_STOP: 140,
  CIRCLE_YIELD: 100,
  KEEP_RIGHT: 10,
  WORK_ZONE_OK: 80,
  EXIT_TAKEN: 60,
  LEFT_YIELD: 100,
  MERGE_CLEAN: 90,
  MERGE_YIELD: 60,
  WEATHER_CARE: 30,
  // End of run, only for a finished course. Flat, never multiplied.
  NO_CRASH_BONUS: 250,
  SPOTLESS_BONUS: 300,
  STREAK_MASTER: 150,

  // Minor: flat, costs one streak tier.
  HIT_CONE: -50,
  LANE_CROSS: -30,
  SPEEDING: -40,
  NO_SIGNAL: -15,
  TAILGATE: -25,
  HOV_SOLO: -60,
  BLOCK_PASSING: -15,
  TURN_TOO_FAST: -60,
  MERGE_TOO_SLOW: -40,
  // Major: flat, streak back to zero.
  RAN_STOP_SIGN: -100,
  NO_MOVE_OVER: -80,
  CIRCLE_CUTOFF: -100,
  SPEEDING_TICKET: -150,
  LEFT_NO_YIELD: -250,
  PULLED_OVER: -300,
  MERGE_CUTOFF: -100,
  // Strikes: the listed points are the floor, the real cost is a share of everything banked so far.
  HIT_PARKED_CAR: -100,
  HIT_TRAFFIC: -150,
  RAN_RED_LIGHT: -120,
  RAN_RAIL: -250,
  // Critical: the run ends, the score that is left is a small share of what was banked.
  FAILED_TO_YIELD: -500,
  HIT_PEDESTRIAN: 0,
  HIT_ANIMAL: 0,
  HIT_TRAIN: 0,
} as const;

const LABELS: Record<string, string> = {
  CHECKPOINT: 'Checkpoint reached',
  FULL_STOP: 'Full stop at stop sign',
  GREEN_LIGHT: 'Passed on green',
  SMOOTH_DRIVING: 'Smooth lane-keeping',
  FINISH_BONUS: 'Completed the course',
  STAR: 'Gold star collected',
  NEAR_MISS: 'Close call, nice reflexes',
  PED_SAFE_PASS: 'Yielded to a pedestrian',
  HIT_CONE: 'Hit a cone',
  LANE_CROSS: 'Drifted over lane line',
  SPEEDING: 'Exceeded speed limit',
  RAN_STOP_SIGN: 'Ran a stop sign',
  RAN_RED_LIGHT: 'Ran a red light',
  HIT_PARKED_CAR: 'Hit a parked car',
  HIT_TRAFFIC: 'Collided with traffic',
  HIT_PEDESTRIAN: '🛑 HIT A PEDESTRIAN, run ended',
  HIT_ANIMAL: '🛑 HIT AN ANIMAL, run ended',
  HIT_TRAIN: '🛑 STRUCK BY A TRAIN, run ended',
  SIGNALLED: 'Signalled before changing lanes',
  SAFE_GAP: 'Kept a safe following gap',
  MOVE_OVER: 'Moved over for emergency vehicles',
  RAIL_STOP: 'Stopped for the railroad crossing',
  CIRCLE_YIELD: 'Yielded in the traffic circle',
  KEEP_RIGHT: 'Kept right except to pass',
  WORK_ZONE_OK: 'Slow and steady through the work zone',
  NO_SIGNAL: 'Changed lanes without signalling',
  TAILGATE: 'Tailgating',
  HOV_SOLO: 'Solo driver in the HOV lane',
  NO_MOVE_OVER: 'Did not move over or slow down',
  RAN_RAIL: 'Crossed with the gates down',
  CIRCLE_CUTOFF: 'Cut off traffic in the circle',
  BLOCK_PASSING: 'Cruised in the passing lane',
  SPEEDING_TICKET: 'Speeding ticket',
  PULLED_OVER: 'Pulled over for speeding',
  FAILED_TO_YIELD: 'Did not pull over for police',
  EXIT_TAKEN: 'Took the exit safely',
  LEFT_YIELD: 'Yielded to oncoming traffic on a left turn',
  LEFT_NO_YIELD: 'Turned left in front of oncoming traffic',
  TURN_TOO_FAST: 'Took a turn too fast',
  MERGE_CLEAN: 'Merged smoothly at highway speed',
  MERGE_YIELD: 'Made room for merging traffic',
  WEATHER_CARE: 'Drove to the weather conditions',
  MERGE_TOO_SLOW: 'Merged too slowly',
  MERGE_CUTOFF: 'Cut off traffic while merging',
  NO_CRASH_BONUS: 'Collision-free drive',
  SPOTLESS_BONUS: 'Spotless record: zero violations',
  STREAK_MASTER: 'Reached the ×5 streak',
};

export type PointKey = keyof typeof POINTS;
export const labelOf = (k: PointKey): string => LABELS[k] ?? k;

/** Positive events that build the clean streak. */
const POSITIVE_COMBO: PointKey[] = ['SIGNALLED', 'SAFE_GAP', 'MOVE_OVER', 'RAIL_STOP', 'CIRCLE_YIELD', 'WORK_ZONE_OK', 'EXIT_TAKEN', 'LEFT_YIELD', 'STAR', 'CHECKPOINT', 'FULL_STOP', 'GREEN_LIGHT', 'SMOOTH_DRIVING', 'NEAR_MISS', 'PED_SAFE_PASS', 'MERGE_CLEAN', 'MERGE_YIELD', 'KEEP_RIGHT', 'WEATHER_CARE'];
/** Flat bonuses paid when a course is finished. They never touch the streak. */
const FINISH_KEYS: PointKey[] = ['FINISH_BONUS', 'NO_CRASH_BONUS', 'SPOTLESS_BONUS', 'STREAK_MASTER'];

export type Severity = 'reward' | 'minor' | 'major' | 'strike' | 'critical';
const MINOR: PointKey[] = ['HIT_CONE', 'LANE_CROSS', 'SPEEDING', 'NO_SIGNAL', 'TAILGATE', 'HOV_SOLO', 'BLOCK_PASSING', 'TURN_TOO_FAST', 'MERGE_TOO_SLOW'];
const MAJOR: PointKey[] = ['RAN_STOP_SIGN', 'NO_MOVE_OVER', 'CIRCLE_CUTOFF', 'SPEEDING_TICKET', 'LEFT_NO_YIELD', 'PULLED_OVER', 'MERGE_CUTOFF'];
/** Strike events: share of the banked score that is lost. Collisions cost half, the first two times and the third. */
const STRIKE_SHARE: Partial<Record<PointKey, number>> = { HIT_PARKED_CAR: 0.5, HIT_TRAFFIC: 0.5, RAN_RAIL: 0.3, RAN_RED_LIGHT: 0.15 };
/** Critical events: share of the banked score that survives. */
const CRITICAL_KEEP: Partial<Record<PointKey, number>> = { HIT_PEDESTRIAN: 0.1, HIT_ANIMAL: 0.25, HIT_TRAIN: 0.05, FAILED_TO_YIELD: 0.4 };

export function severityOf(key: PointKey): Severity {
  if (key in CRITICAL_KEEP) return 'critical';
  if (key in STRIKE_SHARE) return 'strike';
  if (MAJOR.includes(key)) return 'major';
  if (MINOR.includes(key)) return 'minor';
  return 'reward';
}

export const MAX_STRIKES = 3;
/** Streak needed to enter multiplier tier n+1. ×2 at 3 clean events, ×3 at 7, ×4 at 12, ×5 at 18. */
export const TIER_START = [0, 3, 7, 12, 18] as const;
export const TIER_NAMES = ['', 'STEADY', 'SMOOTH', 'PRO', 'ELITE'] as const;
export function tierForStreak(streak: number): number {
  let t = 1; for (let i = 1; i < TIER_START.length; i++) if (streak >= TIER_START[i]) t = i + 1; return t;
}

/** What the last add() did, so every engine can show the same up or down cue. */
export interface ScoreDelta {
  key: PointKey;
  points: number;       // signed, what really changed
  severity: Severity;
  share?: number;       // for strikes and critical hits: share of the banked score lost
  tierBefore: number;
  tierAfter: number;
  strikes: number;      // strikes after this event
  examOver: boolean;
}

/** One description of an up or a down, so the three engines tell the player the same thing. */
export interface DeltaCue {
  kind: 'up' | 'down' | 'strike' | 'crit';
  chip: string;          // "+120" or "-1,250"
  sub?: string;
  tierUp: boolean;
  tierDown: boolean;
  tier: number;
  strikes: number;
}
export function deltaCue(d: ScoreDelta): DeltaCue {
  const n = Math.abs(d.points).toLocaleString('en-US');
  const zero = d.points === 0 && d.severity !== 'reward';
  const tierUp = d.tierAfter > d.tierBefore, tierDown = d.tierAfter < d.tierBefore;
  const base = { tierUp, tierDown, tier: d.tierAfter, strikes: d.strikes };
  if (d.severity === 'critical') return { ...base, kind: 'crit', chip: d.points === 0 ? 'RUN OVER' : `-${n}`, sub: `RUN OVER · ${Math.round((1 - (d.share ?? 1)) * 100)}% OF YOUR POINTS KEPT` };
  if (d.severity === 'strike') {
    const pct = Math.round((d.share ?? 0.5) * 100);
    const sub = d.examOver ? 'STRIKE 3 OF 3 · EXAM OVER' : `${pct === 50 ? 'HALF YOUR POINTS' : pct + '% OF YOUR POINTS'} · STRIKE ${d.strikes} OF ${MAX_STRIKES}`;
    return { ...base, kind: 'strike', chip: zero ? 'STRIKE' : `-${n}`, sub };
  }
  if (d.severity === 'major') return { ...base, kind: 'down', chip: zero ? 'FAULT' : `-${n}`, sub: tierDown ? 'STREAK LOST' : undefined };
  if (d.severity === 'minor') return { ...base, kind: 'down', chip: zero ? 'FAULT' : `-${n}`, sub: tierDown ? `STREAK ×${d.tierBefore} → ×${d.tierAfter}` : undefined };
  return { ...base, kind: 'up', chip: `+${n}`, sub: tierUp ? `STREAK ×${d.tierAfter} · ${TIER_NAMES[d.tierAfter - 1]}` : undefined };
}

export class ScoreTracker {
  private counts = new Map<PointKey, number>();
  private pts = new Map<PointKey, number>();
  private extras = 0; // e.g. distance bonus
  private settled = false;
  score = 0;
  combo = 1;
  streak = 0;
  starsCollected = 0;
  maxCombo = 1;
  maxStreak = 0;
  strikes = 0;
  gained = 0;
  lost = 0;
  voided = false; // a critical event (pedestrian, animal, train, ignored police) ended the run
  last: ScoreDelta | null = null;

  /** 0..1 progress toward the next multiplier tier (1 when maxed). */
  get tierProgress(): number {
    if (this.combo >= TIER_START.length) return 1;
    const a = TIER_START[this.combo - 1], b = TIER_START[this.combo];
    return Math.max(0, Math.min(1, (this.streak - a) / (b - a)));
  }

  /** True once the third strike or a critical event has ended the exam. */
  get examOver(): boolean { return this.voided || this.strikes >= MAX_STRIKES; }

  private bump(key: PointKey, p: number) {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.pts.set(key, (this.pts.get(key) ?? 0) + p);
    if (p > 0) this.gained += p; else this.lost -= p;
  }

  /** Adds an event; returns the points that really changed the score (signed). */
  add(key: PointKey): number {
    const sev = severityOf(key);
    if (sev === 'critical') return this.critical(key);
    const tierBefore = this.combo;
    const base: number = POINTS[key];
    let pts = 0;
    let share: number | undefined;
    if (sev === 'reward') {
      if (FINISH_KEYS.includes(key)) { pts = base; }
      else {
        pts = Math.round(base * this.combo);
        if (POSITIVE_COMBO.includes(key)) {
          this.streak++;
          this.maxStreak = Math.max(this.maxStreak, this.streak);
          this.combo = tierForStreak(this.streak);
          this.maxCombo = Math.max(this.maxCombo, this.combo);
        }
      }
      if (key === 'STAR') this.starsCollected++;
      this.score += pts;
    } else {
      let cost = -base;
      if (sev === 'strike') {
        share = STRIKE_SHARE[key] ?? 0.5;
        cost = Math.max(cost, Math.round(this.score * share));
        this.strikes++;
      }
      cost = Math.min(cost, this.score);
      pts = cost > 0 ? -cost : 0;
      this.score -= cost;
      if (sev === 'minor') this.streak = TIER_START[Math.max(0, this.combo - 2)];
      else this.streak = 0;
      this.combo = tierForStreak(this.streak);
    }
    this.bump(key, pts);
    this.last = { key, points: pts, severity: sev, share, tierBefore, tierAfter: this.combo, strikes: this.strikes, examOver: this.examOver };
    return pts;
  }

  /** Run-ending event. Keeps only a small share of what was banked, the exam is a fail. */
  critical(key: PointKey = 'HIT_PEDESTRIAN'): number {
    const keep = CRITICAL_KEEP[key] ?? 0.1;
    const tierBefore = this.combo;
    const after = Math.round(this.score * keep);
    const pts = after - this.score;
    this.score = after;
    this.bump(key, pts);
    this.streak = 0; this.combo = 1;
    this.voided = true;
    this.last = { key, points: pts, severity: 'critical', share: 1 - keep, tierBefore, tierAfter: 1, strikes: this.strikes, examOver: true };
    return pts;
  }

  /** Older name for critical(), kept for the engines that call it. */
  zeroOut(key: PointKey = 'HIT_PEDESTRIAN') { return this.critical(key); }

  /** Forgive one strike, used by free roam after a clean leg. */
  forgive() { this.strikes = Math.max(0, this.strikes - 1); }

  /** Pays the end-of-course bonuses once. Only call for a finished course. */
  settle(): number {
    if (this.settled || this.examOver) return 0;
    this.settled = true;
    let total = 0;
    const faults = [...this.counts.keys()].filter((k) => severityOf(k) !== 'reward' && severityOf(k) !== 'critical');
    if (this.countOf('HIT_PARKED_CAR') + this.countOf('HIT_TRAFFIC') + this.countOf('RAN_RAIL') === 0) total += this.add('NO_CRASH_BONUS');
    if (faults.length === 0) total += this.add('SPOTLESS_BONUS');
    if (this.maxCombo >= 5) total += this.add('STREAK_MASTER');
    return total;
  }

  addDistanceBonus(pts: number) {
    this.extras += pts;
    this.score += pts;
    this.gained += pts;
  }

  get events(): ScoreEvent[] {
    const arr = [...this.counts.entries()]
      .map(([key, count]) => ({
        label: LABELS[key],
        points: this.pts.get(key) ?? 0,
        count
      }));
    if (this.extras > 0) arr.push({ label: 'Distance bonus', points: this.extras, count: 1 });
    return arr.sort((a, b) => b.points - a.points);
  }

  countOf(key: PointKey): number {
    return this.counts.get(key) ?? 0;
  }
}

/** Par on the raw (pre-multiplier) scale. A longer course has more to score, so par grows with the course. */
export const parFor = (level: LevelConfig, difficulty: DifficultyConfig) => Math.round(level.parScore * difficulty.lengthMul);

function gradeFor(score: number, par: number): { grade: string; passed: boolean } {
  const r = score / par;
  if (r >= 1.0) return { grade: 'A+', passed: true };
  if (r >= 0.85) return { grade: 'A', passed: true };
  if (r >= 0.7) return { grade: 'B', passed: true };
  if (r >= 0.55) return { grade: 'C', passed: true };
  if (r >= 0.4) return { grade: 'D', passed: false };
  return { grade: 'F', passed: false };
}

export function buildResult(
  level: LevelConfig,
  tracker: ScoreTracker,
  difficulty: DifficultyConfig,
  extras?: { distance?: number; completed?: boolean }
): LevelResult {
  // Bonuses for a clean drive are paid only when the course was really finished.
  const completed = extras?.completed ?? (!tracker.examOver && !level.endless);
  if (completed) tracker.settle();
  const rawScore = tracker.score;
  const finalScore = Math.round(rawScore * difficulty.scoreMul);
  const parRaw = parFor(level, difficulty);
  const failedOut = tracker.voided || tracker.strikes >= MAX_STRIKES;
  const { grade, passed } = tracker.voided
    ? { grade: 'F', passed: false }
    : failedOut ? { grade: gradeFor(rawScore, parRaw).grade === 'F' ? 'F' : 'D', passed: false }
    : gradeFor(rawScore, parRaw);

  const feedback: string[] = [];
  const c = (k: PointKey) => tracker.countOf(k);

  if (c('HIT_PEDESTRIAN')) {
    feedback.push('🛑 You struck a pedestrian. In a real road test that is an instant fail.');
    feedback.push('Slow down, scan the sidewalks, and always yield at crossings.');
  }
  if (c('HIT_ANIMAL')) feedback.push('🛑 You hit an animal. Scan ahead, ease off, and brake early, never swerve into traffic.');
  if (c('HIT_TRAIN')) feedback.push('🛑 Never cross railroad tracks when the gates are down or lights are flashing. Stop 15 feet back.');
  if (c('FAILED_TO_YIELD')) feedback.push('🛑 When an officer signals you, signal, slow down and pull to the right shoulder.');
  if (!tracker.voided && tracker.strikes >= MAX_STRIKES) feedback.push('Three strikes. The exam ends when the safety record runs out, so a bad habit cost the whole run.');

  const crashes = c('HIT_PARKED_CAR') + c('HIT_TRAFFIC');
  if (crashes === 0) feedback.push('Zero collisions. Excellent vehicle control.');
  else if (crashes <= 2) feedback.push(`${crashes === 1 ? 'A collision' : 'Two collisions'} cost you half of your points each time. Leave more space.`);
  else feedback.push('Too many collisions. Slow down and scan further ahead.');

  if (c('RAN_STOP_SIGN') + c('RAN_RED_LIGHT') === 0) {
    feedback.push('Perfect on signs and signals. That is real road-test discipline.');
  } else {
    feedback.push('Come to a complete stop. Rolling stops fail a real road test.');
  }

  if (c('SPEEDING') + c('SPEEDING_TICKET') === 0) {
    feedback.push(`Held the ${level.speedLimit} mph limit the whole way. Nice.`);
  } else {
    feedback.push(`Watch the speedometer. The limit here is ${level.speedLimit} mph.`);
  }

  if (c('LANE_CROSS') <= 1) feedback.push('Strong lane discipline.');
  else feedback.push('Keep the car centered. You crossed lane lines several times.');

  if (c('NO_SIGNAL') > 0) feedback.push('Signal every lane change, exit and turn. It is free points and a safer habit.');
  if (c('MERGE_CUTOFF') + c('MERGE_TOO_SLOW') > 0) feedback.push('On the ramp, match highway speed and merge into a real gap. Do not stop or cut anyone off.');
  if (c('MERGE_CLEAN') > 0 && c('MERGE_CUTOFF') + c('MERGE_TOO_SLOW') === 0) feedback.push('Clean merges: signalled, matched speed, found the gap.');

  if (tracker.starsCollected > 0) {
    feedback.push(`Collected ${tracker.starsCollected} gold star${tracker.starsCollected === 1 ? '' : 's'}. Bonus points!`);
  }
  if (tracker.maxCombo >= 2) feedback.push(`Best streak: ×${tracker.maxCombo} ${TIER_NAMES[tracker.maxCombo - 1] ?? ''}. Clean driving multiplies your points. Any mistake cuts it.`.replace('  ', ' '));
  if (c('NO_CRASH_BONUS')) feedback.push(`Bonus: collision-free drive +${POINTS.NO_CRASH_BONUS}.`);
  if (c('SPOTLESS_BONUS')) feedback.push(`Bonus: not a single violation +${POINTS.SPOTLESS_BONUS}. That is a perfect drive.`);

  feedback.push(passed
    ? 'Instructor verdict: PASS. Ready for the next lesson!'
    : 'Instructor verdict: NEEDS PRACTICE. Book a lesson and try again!');

  return {
    levelId: level.id,
    levelName: level.name,
    difficulty: difficulty.id,
    score: finalScore,
    rawScore,
    multiplier: difficulty.scoreMul,
    grade,
    events: tracker.events,
    feedback,
    passed,
    distance: extras?.distance,
    parScore: Math.round(parRaw * difficulty.scoreMul),
    gained: tracker.gained,
    lost: tracker.lost,
    strikes: tracker.strikes,
    maxCombo: tracker.maxCombo,
    voided: tracker.voided,
  };
}
