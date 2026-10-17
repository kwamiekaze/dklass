/** Daily Challenge — deterministic level+difficulty derived from date. */
import { LEVELS } from './levels';
import { DIFFICULTIES, type Difficulty } from './types';

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DailyChallenge {
  day: string;
  levelId: string;
  levelName: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  flavor: string;
  parScore: number;
}

const FLAVORS = [
  'Beat the daily par to earn bonus XP.',
  'Instructor\'s Pick of the Day — no retries for the leaderboard!',
  'Prove your five-star drive under today\'s conditions.',
  'Same challenge for every driver worldwide today.',
  'Fresh route, fresh conditions — one shot for the top.',
];

export function getDailyChallenge(day = todayKey()): DailyChallenge {
  const seed = hashStr('dk-daily-' + day);
  const rng = seededRng(seed);
  // Exclude the endless level for daily challenge (needs a bounded run).
  const pool = LEVELS.filter((l) => !l.endless && !l.id.startsWith('atl-'));
  const level = pool[Math.floor(rng() * pool.length)];
  const diff = DIFFICULTIES[Math.floor(rng() * DIFFICULTIES.length)];
  const flavor = FLAVORS[Math.floor(rng() * FLAVORS.length)];
  return {
    day,
    levelId: level.id,
    levelName: level.name,
    difficulty: diff.id,
    difficultyLabel: diff.label,
    flavor,
    parScore: Math.round(level.parScore * diff.scoreMul),
  };
}

/** Milliseconds until next local midnight. */
export function msUntilMidnight(now = new Date()): number {
  const n = new Date(now);
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, next.getTime() - n.getTime());
}

export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// --- Daily play tracking (score + streak) ---
const DAILY_KEY = 'dk-daily-state-v1';
interface DailyState {
  lastDay: string | null;
  lastScore: number;
  bestScore: number;
  streak: number;
  playedDays: string[]; // rolling last 60
}

function loadDaily(): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { lastDay: null, lastScore: 0, bestScore: 0, streak: 0, playedDays: [] };
}
function saveDaily(s: DailyState) {
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function getDailyState(): DailyState { return loadDaily(); }

export function recordDailyPlay(day: string, score: number): DailyState {
  const s = loadDaily();
  const alreadyPlayedToday = s.lastDay === day;
  if (!alreadyPlayedToday) {
    // streak: consecutive with yesterday?
    const y = new Date(day + 'T00:00:00');
    y.setDate(y.getDate() - 1);
    const yesterday = todayKey(y);
    s.streak = s.lastDay === yesterday ? s.streak + 1 : 1;
    s.lastDay = day;
    s.lastScore = score;
    if (!s.playedDays.includes(day)) s.playedDays.push(day);
    s.playedDays = s.playedDays.slice(-60);
  } else {
    s.lastScore = Math.max(s.lastScore, score);
  }
  s.bestScore = Math.max(s.bestScore, score);
  saveDaily(s);
  return s;
}
