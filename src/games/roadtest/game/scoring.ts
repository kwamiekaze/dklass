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

  HIT_CONE: -50,
  LANE_CROSS: -30,
  SPEEDING: -40,
  RAN_STOP_SIGN: -100,
  RAN_RED_LIGHT: -120,
  HIT_PARKED_CAR: -100,
  HIT_TRAFFIC: -150,
  NO_SIGNAL: -15,
  TAILGATE: -25,
  HOV_SOLO: -60,
  NO_MOVE_OVER: -80,
  RAN_RAIL: -250,
  CIRCLE_CUTOFF: -100,
  BLOCK_PASSING: -15,
  SPEEDING_TICKET: -150,
  PULLED_OVER: -300,
  FAILED_TO_YIELD: -500,
  LEFT_NO_YIELD: -250,
  TURN_TOO_FAST: -60,
  HIT_PEDESTRIAN: 0, // catastrophic — ends run but preserves earned score
} as const;

const LABELS: Record<string, string> = {
  CHECKPOINT: 'Checkpoint reached',
  FULL_STOP: 'Full stop at stop sign',
  GREEN_LIGHT: 'Passed on green',
  SMOOTH_DRIVING: 'Smooth lane-keeping',
  FINISH_BONUS: 'Completed the course',
  STAR: 'Gold star collected',
  NEAR_MISS: 'Close call — nice reflexes',
  PED_SAFE_PASS: 'Yielded to a pedestrian',
  HIT_CONE: 'Hit a cone',
  LANE_CROSS: 'Drifted over lane line',
  SPEEDING: 'Exceeded speed limit',
  RAN_STOP_SIGN: 'Ran a stop sign',
  RAN_RED_LIGHT: 'Ran a red light',
  HIT_PARKED_CAR: 'Hit a parked car',
  HIT_TRAFFIC: 'Collided with traffic',
  HIT_PEDESTRIAN: '🛑 HIT A PEDESTRIAN — run ended',
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
};

export type PointKey = keyof typeof POINTS;

/** Positive events that build the combo meter. */
const POSITIVE_COMBO: PointKey[] = ['SIGNALLED', 'SAFE_GAP', 'MOVE_OVER', 'RAIL_STOP', 'CIRCLE_YIELD', 'WORK_ZONE_OK', 'EXIT_TAKEN', 'LEFT_YIELD', 'STAR', 'CHECKPOINT', 'FULL_STOP', 'GREEN_LIGHT', 'SMOOTH_DRIVING', 'NEAR_MISS', 'PED_SAFE_PASS'];

export class ScoreTracker {
  private counts = new Map<PointKey, number>();
  private extras = 0; // e.g. distance bonus
  score = 0;
  combo = 1;
  starsCollected = 0;
  maxCombo = 1;
  voided = false; // set true if a run-ending event (pedestrian hit) occurred

  /** Adds an event; returns actual points awarded (after combo multiplier). */
  add(key: PointKey): number {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    const base: number = POINTS[key];
    let pts: number = base;
    if (base > 0) {
      pts = Math.round(base * this.combo);
      if (POSITIVE_COMBO.includes(key)) {
        this.combo = Math.min(5, this.combo + 1);
        this.maxCombo = Math.max(this.maxCombo, this.combo);
      }
    } else {
      this.combo = 1; // any fault resets
    }
    if (key === 'STAR') this.starsCollected++;
    this.score = Math.max(0, this.score + pts);
    return pts;
  }

  /** Catastrophic event — ends the run but PRESERVES the earned score. */
  zeroOut(key: PointKey = 'HIT_PEDESTRIAN') {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.combo = 1;
    this.voided = true;
  }


  addDistanceBonus(pts: number) {
    this.extras += pts;
    this.score += pts;
  }

  get events(): ScoreEvent[] {
    const arr = [...this.counts.entries()]
      .map(([key, count]) => ({
        label: LABELS[key],
        points: POINTS[key] * count,
        count
      }));
    if (this.extras > 0) arr.push({ label: 'Distance bonus', points: this.extras, count: 1 });
    return arr.sort((a, b) => b.points - a.points);
  }

  countOf(key: PointKey): number {
    return this.counts.get(key) ?? 0;
  }
}

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
  extras?: { distance?: number }
): LevelResult {
  const rawScore = tracker.score;
  const finalScore = Math.round(rawScore * difficulty.scoreMul);
  const { grade, passed } = tracker.voided
    ? { grade: 'F', passed: false }
    : gradeFor(finalScore, level.parScore);

  const feedback: string[] = [];

  if (tracker.voided) {
    feedback.push('🛑 You struck a pedestrian. In a real road test that is an instant fail.');
    feedback.push('Slow down, scan the sidewalks, and always yield at crossings.');
  }


  const faults =
    tracker.countOf('HIT_CONE') +
    tracker.countOf('HIT_PARKED_CAR') +
    tracker.countOf('HIT_TRAFFIC');

  if (faults === 0) feedback.push('Zero collisions — excellent vehicle control.');
  else if (faults <= 2) feedback.push('A couple of bumps. Leave more space around obstacles.');
  else feedback.push('Too many collisions. Slow down and scan further ahead.');

  if (tracker.countOf('RAN_STOP_SIGN') + tracker.countOf('RAN_RED_LIGHT') === 0) {
    feedback.push('Perfect on signs and signals. That is real road-test discipline.');
  } else {
    feedback.push('Come to a complete stop — rolling stops fail a real road test.');
  }

  if (tracker.countOf('SPEEDING') === 0) {
    feedback.push(`Held the ${level.speedLimit} mph limit the whole way. Nice.`);
  } else {
    feedback.push(`Watch the speedometer — the limit here is ${level.speedLimit} mph.`);
  }

  if (tracker.countOf('LANE_CROSS') <= 1) feedback.push('Strong lane discipline.');
  else feedback.push('Keep the car centered — you crossed lane lines several times.');

  if (tracker.starsCollected > 0) {
    feedback.push(`Collected ${tracker.starsCollected} gold star${tracker.starsCollected === 1 ? '' : 's'}. Bonus points!`);
  }
  if (tracker.maxCombo >= 3) feedback.push(`Best combo streak: ×${tracker.maxCombo}. Momentum matters!`);

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
  };
}
