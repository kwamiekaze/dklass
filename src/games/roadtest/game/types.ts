/** Shared types for the DrivingKlass Road Test Challenge. */

export type ObstacleType =
  | 'cone'
  | 'stopSign'
  | 'trafficLight'
  | 'parkedCar'
  | 'traffic'
  | 'checkpoint'
  | 'star'
  | 'pedestrian'
  | 'dog'
  | 'magnet'
  | 'shieldPickup';

export type Difficulty = 'learner' | 'licensed' | 'instructor' | 'legend';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  lengthMul: number;
  gapMul: number;
  trafficMul: number;
  speedMul: number;      // scales player top speed AND traffic base speed
  speedTolerance: number;
  scoreMul: number;
}

// IDs are kept stable ('learner'…'legend') so existing leaderboard rows
// remain valid; labels are the player-facing Easy/Medium/Hard/Expert tiers.
export const DIFFICULTIES: DifficultyConfig[] = [
  { id: 'learner',    label: 'Easy',   lengthMul: 1.0, gapMul: 1.0,  trafficMul: 1.0,  speedMul: 1.0,  speedTolerance: 3, scoreMul: 1.0  },
  { id: 'licensed',   label: 'Medium', lengthMul: 1.4, gapMul: 0.8,  trafficMul: 1.15, speedMul: 1.1,  speedTolerance: 2, scoreMul: 1.25 },
  { id: 'instructor', label: 'Hard',   lengthMul: 1.8, gapMul: 0.65, trafficMul: 1.3,  speedMul: 1.2,  speedTolerance: 1, scoreMul: 1.5  },
  { id: 'legend',     label: 'Expert', lengthMul: 2.3, gapMul: 0.5,  trafficMul: 1.5,  speedMul: 1.35, speedTolerance: 0, scoreMul: 2.0  },
];


export function getDifficulty(id: string | null | undefined): DifficultyConfig {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[0];
}

export interface LevelConfig {
  id: string;
  name: string;
  subtitle: string;
  length: number;
  speedLimit: number;
  maxSpeed: number;
  features: ObstacleType[];
  obstacleGap: number;
  parScore: number;
  shoulderColor: number;
  nightAlpha?: number;
  endless?: boolean;
  /** Optional: multiply pedestrian spawn density (default 1). */
  pedDensityMul?: number;
  /** Optional: multiply dog spawn density (default 1). Set 0 for no dogs. */
  dogDensityMul?: number;
  /** Optional: full-screen color tint overlay (rain/fog/snow). */
  weatherTint?: { color: number; alpha: number };
  /** Optional: mark as newly added — StartScreen shows a NEW badge. */
  isNew?: boolean;
}

export interface ScoreEvent {
  label: string;
  points: number;
  count: number;
}

export interface LevelResult {
  levelId: string;
  levelName: string;
  difficulty: Difficulty;
  score: number;          // final, post-multiplier
  rawScore: number;       // pre-multiplier
  multiplier: number;
  grade: string;
  events: ScoreEvent[];
  feedback: string[];
  passed: boolean;
  distance?: number;      // for endless mode
  /** Points earned and lost over the run, before the difficulty multiplier. */
  /** The par for this level at this difficulty, on the same scale as `score`. */
  parScore?: number;
  gained?: number;
  lost?: number;
  strikes?: number;
  maxCombo?: number;
  voided?: boolean;
  isNewBest?: boolean;
  previousBest?: number;
}

export const GAME_EVENTS = {
  LEVEL_COMPLETE: 'dk-level-complete',
  HUD_UPDATE: 'dk-hud-update'
} as const;
