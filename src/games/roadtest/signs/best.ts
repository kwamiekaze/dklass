/** Sign Rush bests, kept on the device. A tiny module of its own so the menu can show the best score without loading the game. */
export const BEST_KEY = 'dk-signrush-v1';
export interface Saved { rush: number; streak: number; signsTest: number; rulesTest: number; runs: number }
const zero = (): Saved => ({ rush: 0, streak: 0, signsTest: 0, rulesTest: 0, runs: 0 });
export const loadSaved = (): Saved => { try { return { ...zero(), ...JSON.parse(localStorage.getItem(BEST_KEY) || '{}') }; } catch { return zero(); } };
export const store = (s: Saved) => { try { localStorage.setItem(BEST_KEY, JSON.stringify(s)); } catch { /* storage blocked: the run still counts on screen */ } };
export const signRushBest = () => loadSaved().rush;
