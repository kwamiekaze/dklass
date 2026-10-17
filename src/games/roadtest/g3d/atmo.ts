/**
 * The minigame's own weather. It is a copy of the idea behind the homepage's weather store, with nothing shared: its own numbers, its own goal, its own clock.
 * Nothing in the game reads or writes the homepage's store, and the homepage never reads this one, so editing or running the game can never change the homepage.
 *   look   the weather as five numbers (cloud, rain, fog, snow, storm), eased toward `goal` so a change of weather fades in and never jumps.
 *   deep   0..1 how much deeper the night is (only the night looks use it).
 * No network, no database: the weather of a run is picked in the browser (random by default, weighted the way Georgia's weather really goes).
 */
export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'storm' | 'snow';
export type Look = { cloud: number; rain: number; fog: number; snow: number; storm: number };
export const KINDS: WeatherKind[] = ['clear', 'cloudy', 'fog', 'rain', 'storm', 'snow'];
export const KIND_LABEL: Record<WeatherKind, string> = { clear: 'Clear', cloudy: 'Cloudy', fog: 'Fog', rain: 'Rain', storm: 'Storm', snow: 'Snow' };
export const LOOKS: Record<WeatherKind, Look> = {
  clear: { cloud: .06, rain: 0, fog: 0, snow: 0, storm: 0 },
  cloudy: { cloud: .85, rain: 0, fog: .08, snow: 0, storm: 0 },
  fog: { cloud: .7, rain: 0, fog: 1, snow: 0, storm: 0 },
  rain: { cloud: .92, rain: .75, fog: .22, snow: 0, storm: 0 },
  storm: { cloud: 1, rain: 1, fog: .3, snow: 0, storm: 1 },
  snow: { cloud: .88, rain: 0, fog: .35, snow: 1, storm: 0 },
};

type Preview = { weather: WeatherKind | 'live'; night: 'normal' | 'deep' | 'live' };

export const atmo = {
  deep: 0, deepGoal: 0,
  look: { ...LOOKS.clear } as Look, goal: { ...LOOKS.clear } as Look,
  /** what this run asked for (the game sets it; 'live' just means clear here: the game never asks the internet) */
  preview: { weather: 'clear', night: 'normal' } as Preview,
  debug: false,
  flash: 0,                        // 0..1 lightning flash, set by the storm and decayed by whoever draws it
};

/** Work out the goals from what this run asked for. */
export function apply() {
  const p = atmo.preview;
  atmo.goal = { ...LOOKS[p.weather === 'live' ? 'clear' : p.weather] };
  atmo.deepGoal = p.night === 'deep' ? 1 : 0;
}

/** Ease the numbers toward their goals; call once a frame. */
export function tickAtmo(dt: number) {
  const k = 1 - Math.exp(-.9 * Math.min(dt, .05));
  for (const key of Object.keys(atmo.look) as (keyof Look)[]) { const g = atmo.goal[key]; atmo.look[key] += (g - atmo.look[key]) * k; if (Math.abs(g - atmo.look[key]) < .002) atmo.look[key] = g; }
  atmo.deep += (atmo.deepGoal - atmo.deep) * (1 - Math.exp(-.7 * Math.min(dt, .05))); if (Math.abs(atmo.deepGoal - atmo.deep) < .002) atmo.deep = atmo.deepGoal;
  atmo.flash = Math.max(0, atmo.flash - dt * 3.2);
}

/** ?wx=rain pins the look for screenshots (visitors never see it). */
export function debugOverride() {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams(window.location.search), w = q.get('wx'), d = q.get('deep');
  if (w && (KINDS as string[]).includes(w)) { atmo.debug = true; atmo.preview.weather = w as WeatherKind; }
  if (d !== null) { atmo.debug = true; atmo.preview.night = d === '1' ? 'deep' : 'normal'; }
  if (atmo.debug) { apply(); atmo.look = { ...atmo.goal }; atmo.deep = atmo.deepGoal; }
}

/** How often each weather comes up in a random draw: the way Atlanta's days really go (mostly dry, a good share of rain, the odd storm, a foggy morning, and snow almost never). */
export const GEORGIA_ODDS: [WeatherKind, number][] = [['clear', 36], ['cloudy', 24], ['rain', 20], ['storm', 8], ['fog', 10], ['snow', 2]];
export function rollGeorgiaWeather(rnd: () => number = Math.random): WeatherKind {
  const total = GEORGIA_ODDS.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [k, w] of GEORGIA_ODDS) { if ((r -= w) < 0) return k; }
  return 'clear';
}
