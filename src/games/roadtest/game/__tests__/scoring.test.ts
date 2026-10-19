import { describe, expect, it } from 'vitest';
import { buildResult, parFor, deltaCue, POINTS, ScoreTracker, severityOf, tierForStreak, TIER_START, type PointKey } from '../scoring';
import { DIFFICULTIES } from '../types';
import { LEVELS as ALL } from '../levels';
const BASE_LEVELS = ALL;

const bank = (t: ScoreTracker, n: number) => { for (let i = 0; i < n; i++) t.add('CHECKPOINT'); };

describe('streak multiplier', () => {
  it('climbs in tiers as clean events stack and shows the real points', () => {
    const t = new ScoreTracker();
    const got: number[] = [];
    for (let i = 0; i < 20; i++) got.push(t.add('CHECKPOINT'));
    expect(got[0]).toBe(100);                       // x1
    expect(got[3]).toBe(200);                       // x2 after 3
    expect(got[7]).toBe(300);                       // x3 after 7
    expect(got[12]).toBe(400);                      // x4 after 12
    expect(got[19]).toBe(500);                      // x5 after 18
    expect(t.combo).toBe(5);
    expect(t.score).toBe(got.reduce((a, b) => a + b, 0));
  });
  it('tier thresholds are consistent', () => {
    expect(TIER_START.map((s) => tierForStreak(s))).toEqual([1, 2, 3, 4, 5]);
  });
  it('a minor fault costs exactly one tier, flat points', () => {
    const t = new ScoreTracker(); bank(t, 9);        // x3
    expect(t.combo).toBe(3);
    const before = t.score;
    expect(t.add('NO_SIGNAL')).toBe(-15);
    expect(t.score).toBe(before - 15);
    expect(t.combo).toBe(2);
    expect(t.last!.tierBefore).toBe(3); expect(t.last!.tierAfter).toBe(2);
    t.add('LANE_CROSS'); expect(t.combo).toBe(1);
    t.add('LANE_CROSS'); expect(t.combo).toBe(1);
  });
  it('a major fault drops the streak to zero', () => {
    const t = new ScoreTracker(); bank(t, 15);
    expect(t.combo).toBe(4);
    t.add('RAN_STOP_SIGN');
    expect(t.combo).toBe(1); expect(t.streak).toBe(0);
  });
});

describe('strikes', () => {
  it('a collision takes half of everything banked, twice, and the third ends the exam', () => {
    const t = new ScoreTracker();
    for (let i = 0; i < 30; i++) t.add('CHECKPOINT');
    const s0 = t.score;
    const p1 = t.add('HIT_TRAFFIC');
    expect(p1).toBe(-Math.round(s0 * 0.5)); expect(t.strikes).toBe(1); expect(t.examOver).toBe(false);
    expect(t.combo).toBe(1);
    const s1 = t.score;
    t.add('HIT_PARKED_CAR');
    expect(t.score).toBe(s1 - Math.round(s1 * 0.5)); expect(t.strikes).toBe(2); expect(t.examOver).toBe(false);
    t.add('HIT_TRAFFIC');
    expect(t.strikes).toBe(3); expect(t.examOver).toBe(true);
  });
  it('a crash never costs less than its floor and never more than you have', () => {
    const t = new ScoreTracker(); t.add('CHECKPOINT');   // 100
    expect(t.add('HIT_TRAFFIC')).toBe(-100);              // 50% = 50 but only 100 banked -> floor 150 capped to 100
    expect(t.score).toBe(0);
    expect(t.add('HIT_TRAFFIC')).toBe(0);
    expect(t.score).toBe(0);
  });
  it('red light and rail crossing are strikes with their own share', () => {
    const t = new ScoreTracker(); for (let i = 0; i < 20; i++) t.add('CHECKPOINT');
    const s = t.score; t.add('RAN_RED_LIGHT');
    expect(t.score).toBe(s - Math.round(s * 0.15)); expect(t.strikes).toBe(1);
    const s2 = t.score; t.add('RAN_RAIL');
    expect(t.score).toBe(s2 - Math.round(s2 * 0.3)); expect(t.strikes).toBe(2);
  });
  it('forgive() gives a strike back', () => { const t = new ScoreTracker(); bank(t, 5); t.add('HIT_TRAFFIC'); t.forgive(); expect(t.strikes).toBe(0); });
});

describe('critical hits', () => {
  it.each([['HIT_PEDESTRIAN', 0.1], ['HIT_ANIMAL', 0.25], ['HIT_TRAIN', 0.05], ['FAILED_TO_YIELD', 0.4]] as [PointKey, number][])('%s keeps only a share and fails the run', (key, keep) => {
    const t = new ScoreTracker(); for (let i = 0; i < 40; i++) t.add('CHECKPOINT');
    const s = t.score;
    t.add(key);
    expect(t.score).toBe(Math.round(s * keep));
    expect(t.voided).toBe(true); expect(t.examOver).toBe(true); expect(t.combo).toBe(1);
    const r = buildResult(BASE_LEVELS[0]!, t, DIFFICULTIES[0]!);
    expect(r.grade).toBe('F'); expect(r.passed).toBe(false); expect(r.voided).toBe(true);
    expect(r.events.some((e) => e.points < 0)).toBe(true);
  });
  it('a voided run pays no finish bonuses', () => {
    const t = new ScoreTracker(); bank(t, 5); t.add('HIT_PEDESTRIAN');
    const s = t.score; expect(t.settle()).toBe(0); expect(t.score).toBe(s);
  });
});

describe('finish bonuses', () => {
  it('pay a collision-free and a spotless drive once, never multiplied', () => {
    const t = new ScoreTracker(); for (let i = 0; i < 20; i++) t.add('CHECKPOINT');
    const s = t.score;
    const paid = t.settle();
    expect(paid).toBe(POINTS.NO_CRASH_BONUS + POINTS.SPOTLESS_BONUS + POINTS.STREAK_MASTER);
    expect(t.score).toBe(s + paid);
    expect(t.settle()).toBe(0);
  });
  it('a fault removes the spotless bonus, a crash removes both', () => {
    const a = new ScoreTracker(); bank(a, 4); a.add('NO_SIGNAL');
    expect(a.settle()).toBe(POINTS.NO_CRASH_BONUS);
    const b = new ScoreTracker(); bank(b, 4); b.add('HIT_PARKED_CAR');
    expect(b.settle()).toBe(0);
  });
});

describe('events and result', () => {
  it('event points add up to the score the player sees', () => {
    const t = new ScoreTracker();
    bank(t, 10); t.add('NO_SIGNAL'); t.add('MERGE_CLEAN'); t.add('HIT_CONE'); t.add('STAR'); t.add('HIT_TRAFFIC'); t.addDistanceBonus(30);
    expect(t.events.reduce((a, e) => a + e.points, 0)).toBe(t.score);
  });
  it('gained minus lost equals the score', () => {
    const t = new ScoreTracker(); bank(t, 12); t.add('TAILGATE'); t.add('HIT_TRAFFIC'); t.add('FULL_STOP');
    expect(t.gained - t.lost).toBe(t.score);
  });
  it('the difficulty multiplier and par scale together', () => {
    const t = new ScoreTracker(); bank(t, 10);
    for (const d of DIFFICULTIES) { const r = buildResult(BASE_LEVELS[0]!, t, d, { completed: false }); expect(r.score).toBe(Math.round(t.score * d.scoreMul)); expect(r.parScore).toBe(Math.round(parFor(BASE_LEVELS[0]!, d) * d.scoreMul)); }
  });
  it('three strikes is a fail even with a big score', () => {
    const t = new ScoreTracker(); for (let i = 0; i < 80; i++) t.add('CHECKPOINT');
    t.add('HIT_TRAFFIC'); t.add('HIT_TRAFFIC'); t.add('HIT_TRAFFIC');
    const r = buildResult(BASE_LEVELS[0]!, t, DIFFICULTIES[0]!);
    expect(r.passed).toBe(false); expect(r.strikes).toBe(3);
  });
});

describe('every point key has a severity and a sensible sign', () => {
  it('rewards are positive, everything else is negative or a critical zero', () => {
    for (const k of Object.keys(POINTS) as PointKey[]) {
      const sev = severityOf(k);
      if (sev === 'reward') expect(POINTS[k], k).toBeGreaterThan(0);
      else if (sev === 'critical') expect(POINTS[k] <= 0, k).toBe(true);
      else expect(POINTS[k], k).toBeLessThan(0);
    }
  });
  it('cues tell up from down', () => {
    const t = new ScoreTracker(); bank(t, 2); t.add('CHECKPOINT');
    expect(deltaCue(t.last!).kind).toBe('up'); expect(deltaCue(t.last!).tierUp).toBe(true);
    t.add('HIT_TRAFFIC'); expect(deltaCue(t.last!).kind).toBe('strike'); expect(deltaCue(t.last!).sub).toContain('HALF');
    t.add('LANE_CROSS'); expect(deltaCue(t.last!).kind).toBe('down');
  });
});
