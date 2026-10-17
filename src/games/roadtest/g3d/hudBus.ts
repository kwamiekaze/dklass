import type { LevelResult } from '../game/types';

/** What the 3D scene tells the on-screen HUD each frame. The HUD reads it on its own animation loop and writes straight to the DOM, so React never re-renders at 60 fps. */
export interface FloatMsg { text: string; good: boolean; sx: number; sy: number; born: number }
export interface Banner { title: string; sub?: string; ms: number; tone: 'gold' | 'red' | 'white'; born: number }

export interface HudState {
  score: number; display: number; mph: number; limit: number; over: boolean; speedWarn: number;
  combo: number; maxCombo: number; stars: number; progress: number; endless: boolean; strikes: number;
  magnet: number; shield: boolean; distance: number; best: number;
  levelName: string; levelSub: string; difficulty: string; mult: number;
  floats: FloatMsg[]; banners: Banner[]; flashes: { color: number; dur: number; born: number }[]; toasts: { text: string; born: number }[];
  countdown: number;          // 3,2,1,0 (GO) during the start; -1 once running
  finished: boolean; catastrophe: boolean;
  nearMisses: number;
  complete?: LevelResult;
}

export const newHud = (): HudState => ({
  score: 0, display: 0, mph: 0, limit: 25, over: false, speedWarn: 0, combo: 1, maxCombo: 1, stars: 0, progress: 0, endless: false, strikes: 0,
  magnet: 0, shield: false, distance: 0, best: 0, levelName: '', levelSub: '', difficulty: '', mult: 1,
  floats: [], banners: [], flashes: [], toasts: [], countdown: 3, finished: false, catastrophe: false, nearMisses: 0,
});
