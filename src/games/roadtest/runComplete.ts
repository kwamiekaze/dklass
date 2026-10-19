/** Central place to award XP, achievements, and daily-mission progress after a run. */
import type { LevelResult } from './game/types';
import { LEVELS } from './game/levels';
import { awardXpForRun, type XpAward, getRankForXp, getXp } from './game/rank';
import { bumpAchievement, setAchievementCounter, type Achievement } from './game/achievements';
import { bumpMissionMetric } from './game/missions';
import { recordDailyPlay, getDailyChallenge, todayKey } from './game/dailyChallenge';

const TOTAL_STARS_KEY = 'dk-total-stars-v1';
const LESSONS_DONE_KEY = 'dk-lessons-done-v1';
const SAFE_PED_KEY = 'dk-safe-peds-v1';
const SAFE_DOG_KEY = 'dk-safe-dogs-v1';

function readN(k: string): number {
  try { return parseInt(localStorage.getItem(k) ?? '0', 10) || 0; } catch { return 0; }
}
function writeN(k: string, v: number) { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } }

function countOf(r: LevelResult, label: string): number {
  const ev = r.events.find((e) => e.label === label);
  return ev?.count ?? 0;
}

export interface RunAftermath {
  xp: XpAward;
  unlocked: Achievement[];
  completedMissions: { id: string; xp: number; label: string }[];
  isDailyChallenge: boolean;
  dailyBeat: boolean;
}

export function processRunResult(r: LevelResult): RunAftermath {
  const level = LEVELS.find((l) => l.id === r.levelId);
  const daily = getDailyChallenge();
  const isDaily = r.levelId === daily.levelId && r.difficulty === daily.difficulty;

  // Stars from event counts.
  const stars = countOf(r, 'Gold star collected');
  const safePeds = countOf(r, 'Yielded to a pedestrian');
  const collisions = countOf(r, 'Hit a cone') + countOf(r, 'Hit a parked car') + countOf(r, 'Collided with traffic');

  // Persistent counters.
  const totalStars = readN(TOTAL_STARS_KEY) + stars; writeN(TOTAL_STARS_KEY, totalStars);
  const totalSafePeds = readN(SAFE_PED_KEY) + safePeds; writeN(SAFE_PED_KEY, totalSafePeds);
  // Runaway dog "dodges" ≈ endless dog spawns minus catastrophic hit — approximate by
  // counting 1 per completed non-void run in a level with dogs. Additive-only heuristic.
  const dogsPassed = (!r.passed && !r.grade) ? 0 : (level?.dogDensityMul === 0 ? 0 : (r.passed ? 3 : 0));
  const totalSafeDogs = readN(SAFE_DOG_KEY) + dogsPassed; writeN(SAFE_DOG_KEY, totalSafeDogs);

  const lessonsDone = readN(LESSONS_DONE_KEY) + (r.passed && !level?.endless ? 1 : 0);
  writeN(LESSONS_DONE_KEY, lessonsDone);

  // Star rating 0-5 for XP.
  const par = r.parScore ?? level?.parScore ?? 1000;
  const starRating = r.voided ? 0 : Math.max(0, Math.min(5, Math.round((r.score / par) * 5)));
  const xp = awardXpForRun(r.score, { passed: r.passed, stars: starRating, daily: isDaily });

  // Achievements.
  const unlocked: Achievement[] = [];
  const push = (a: Achievement | null) => { if (a) unlocked.push(a); };

  if (stars > 0) push(bumpAchievement('first-star'));
  push(setAchievementCounter('star-hoarder', totalStars));
  push(setAchievementCounter('guardian-angel', totalSafePeds));
  push(setAchievementCounter('dog-whisperer', totalSafeDogs));

  if (level?.nightAlpha && r.passed) push(bumpAchievement('night-owl'));
  if (level?.weatherTint && r.passed) push(bumpAchievement('storm-rider'));
  if (level?.id === 'road-test-final' && r.passed && r.grade === 'A+') push(bumpAchievement('perfect-exam'));
  if (level?.endless && r.distance && r.distance >= 12000) push(bumpAchievement('marathon'));
  if (level?.endless && r.score >= 10000) push(bumpAchievement('endless-10k'));
  if (level?.endless && r.score >= 25000) push(bumpAchievement('endless-25k'));
  if (r.passed && !level?.endless) {
    push(bumpAchievement('first-lesson'));
    push(setAchievementCounter('five-lessons', lessonsDone));
    push(setAchievementCounter('ten-lessons', lessonsDone));
    push(setAchievementCounter('twenty-lessons', lessonsDone));
    if (collisions === 0) push(bumpAchievement('no-crash'));
  }

  // Rank-based achievements
  const rankId = getRankForXp(getXp()).rank.id;
  if (rankId === 'gold' || rankId === 'fivestar' || rankId === 'legend') push(bumpAchievement('rank-gold'));
  if (rankId === 'legend') push(bumpAchievement('rank-legend'));

  // Daily challenge tracking
  let dailyBeat = false;
  if (isDaily) {
    const st = recordDailyPlay(todayKey(), r.score);
    push(setAchievementCounter('daily-3', st.streak));
    push(setAchievementCounter('daily-7', st.streak));
    push(setAchievementCounter('daily-30', st.streak));
    if (r.score >= daily.parScore) { push(bumpAchievement('daily-champ')); dailyBeat = true; }
  }

  // Missions
  const completedMissions: { id: string; xp: number; label: string }[] = [];
  if (stars > 0) completedMissions.push(...bumpMissionMetric('stars', stars));
  if (safePeds > 0) completedMissions.push(...bumpMissionMetric('safePeds', safePeds));
  if (dogsPassed > 0) completedMissions.push(...bumpMissionMetric('safeDogs', dogsPassed));
  if (r.passed && !level?.endless) completedMissions.push(...bumpMissionMetric('runsCompleted', 1));
  if (r.passed && !level?.endless && collisions === 0) completedMissions.push(...bumpMissionMetric('noCrashRun', 1));
  if (level?.endless && r.distance) completedMissions.push(...bumpMissionMetric('distance', r.distance));

  // Grant mission XP through awardXpForRun-side effect (already applied to score-based only).
  // Add mission XP directly:
  if (completedMissions.length) {
    const bonus = completedMissions.reduce((s, m) => s + m.xp, 0);
    try {
      const cur = getXp();
      localStorage.setItem('dk-driver-xp-v1', String(cur + bonus));
      xp.after += bonus;
      xp.gained += bonus;
    } catch { /* ignore */ }
  }

  return { xp, unlocked: unlocked.filter(Boolean), completedMissions, isDailyChallenge: isDaily, dailyBeat };
}
