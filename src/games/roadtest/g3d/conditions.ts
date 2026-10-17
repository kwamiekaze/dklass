/**
 * Conditions: what the player can dial in before a run. Weather and time of day override the lesson's own look. "Rolling" weather
 * rolls fronts in as you drive; "Sunset drive" takes the sky from day to night over one run. All cosmetic: the rules never change.
 */
import type { WeatherKind } from '../../../components/nuhome2/world/atmosphere';
import type { TimeOfDay } from './themes';

export type WeatherPick = 'auto' | 'rolling' | 'surprise' | WeatherKind;
export type TimePick = 'auto' | 'sunset' | 'surprise' | TimeOfDay;
export interface Conditions { weather: WeatherPick; time: TimePick }

export const WEATHER_OPTIONS: { id: WeatherPick; label: string; icon: string }[] = [
  { id: 'auto', label: 'Lesson', icon: '📍' }, { id: 'clear', label: 'Clear', icon: '☀️' }, { id: 'cloudy', label: 'Cloudy', icon: '☁️' },
  { id: 'rain', label: 'Rain', icon: '🌧️' }, { id: 'storm', label: 'Storm', icon: '⛈️' }, { id: 'snow', label: 'Snow', icon: '❄️' },
  { id: 'fog', label: 'Fog', icon: '🌫️' }, { id: 'rolling', label: 'Rolling', icon: '🌦️' }, { id: 'surprise', label: 'Surprise', icon: '🎲' },
];
export const TIME_OPTIONS: { id: TimePick; label: string; icon: string }[] = [
  { id: 'auto', label: 'Lesson', icon: '📍' }, { id: 'day', label: 'Day', icon: '🌞' }, { id: 'golden', label: 'Golden', icon: '🌇' },
  { id: 'dusk', label: 'Dusk', icon: '🌆' }, { id: 'night', label: 'Night', icon: '🌙' }, { id: 'sunset', label: 'Sunset drive', icon: '🌅' }, { id: 'surprise', label: 'Surprise', icon: '🎲' },
];

const KEY = 'dk-rt-cond';
const WEATHERS: WeatherPick[] = ['auto', 'rolling', 'surprise', 'clear', 'cloudy', 'fog', 'rain', 'storm', 'snow'];
const TIMES: TimePick[] = ['auto', 'sunset', 'surprise', 'day', 'golden', 'dusk', 'night'];

export function loadConditions(): Conditions {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Conditions>;
    return { weather: WEATHERS.includes(o.weather as WeatherPick) ? (o.weather as WeatherPick) : 'auto', time: TIMES.includes(o.time as TimePick) ? (o.time as TimePick) : 'auto' };
  } catch { return { weather: 'auto', time: 'auto' }; }
}
export function saveConditions(c: Conditions) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } }

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
/** The fronts that roll through in "Rolling" weather, in order. */
export const FRONTS: WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'cloudy', 'fog', 'snow', 'clear'];
export const FRONT_BANNER: Record<WeatherKind, [string, string]> = {
  clear: ['SKIES CLEARING', 'Sun is back'], cloudy: ['CLOUDS BUILDING', 'Keep your eyes up'], rain: ['RAIN ROLLING IN', 'Wet road ahead'],
  storm: ['STORM FRONT', 'Thunder and heavy rain'], snow: ['SNOW FALLING', 'Easy on the pedals'], fog: ['FOG BANK', 'Visibility dropping'],
};

export interface Resolved { weather: WeatherKind | null; tod: TimeOfDay | null; sunset: boolean; rolling: boolean }
/** Turn the player's picks into this run's overrides (null = keep the lesson's own). */
export function resolveConditions(c: Conditions): Resolved {
  let weather: WeatherKind | null = null, rolling = false, tod: TimeOfDay | null = null, sunset = false;
  if (c.weather === 'surprise') weather = pick<WeatherKind>(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog']);
  else if (c.weather === 'rolling') { rolling = true; weather = pick<WeatherKind>(['clear', 'cloudy']); }
  else if (c.weather !== 'auto') weather = c.weather;
  if (c.time === 'surprise') tod = pick<TimeOfDay>(['day', 'golden', 'dusk', 'night']);
  else if (c.time === 'sunset') { sunset = true; tod = 'golden'; }
  else if (c.time !== 'auto') tod = c.time;
  return { weather, tod, sunset, rolling };
}
