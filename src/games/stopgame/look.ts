/** The look of each hour of the day, and the street styles around the corners. */
export type TimeOfDay = 'day' | 'sunset' | 'overcast' | 'night';
export type Style = 'suburb' | 'town' | 'park';

export const TIMES: TimeOfDay[] = ['day', 'day', 'sunset', 'overcast', 'night'];
export const STYLES: Style[] = ['suburb', 'suburb', 'town', 'park'];

export type Sky = {
  top: string; mid: string; low: string; fog: string; near: number; far: number;
  sun: { pos: [number, number, number]; color: string; i: number };
  amb: { color: string; i: number };
  hemi: { sky: string; ground: string; i: number };
  exposure: number; env: number; lamps: boolean; label: string;
};

export const SKY: Record<TimeOfDay, Sky> = {
  day: { top: '#5f9bdc', mid: '#bcd9f2', low: '#e9f1f7', fog: '#d6e6f2', near: 70, far: 210, sun: { pos: [-14, 20, 12], color: '#fff0d2', i: 2.9 }, amb: { color: '#fff6ea', i: .5 }, hemi: { sky: '#cfe6ff', ground: '#cdbb98', i: 1.0 }, exposure: .92, env: 1, lamps: false, label: 'Morning' },
  sunset: { top: '#4d5ca8', mid: '#f0a46e', low: '#ffd7a0', fog: '#efc19c', near: 55, far: 190, sun: { pos: [22, 7, 8], color: '#ffa86a', i: 2.6 }, amb: { color: '#ffd9bd', i: .42 }, hemi: { sky: '#9fb2e6', ground: '#c28f6a', i: .85 }, exposure: .9, env: .8, lamps: false, label: 'Sunset' },
  overcast: { top: '#8895a6', mid: '#b7c0ca', low: '#d4dae0', fog: '#c3cbd3', near: 45, far: 170, sun: { pos: [-8, 18, 10], color: '#e6edf5', i: 1.1 }, amb: { color: '#eef2f7', i: .62 }, hemi: { sky: '#dde6f0', ground: '#aaa597', i: 1.0 }, exposure: .95, env: .85, lamps: false, label: 'Cloudy' },
  night: { top: '#050a22', mid: '#14204e', low: '#26336b', fog: '#0f1738', near: 40, far: 150, sun: { pos: [-10, 18, 8], color: '#9db8ff', i: .85 }, amb: { color: '#6a78c0', i: .22 }, hemi: { sky: '#4a5bb0', ground: '#1c1a38', i: .45 }, exposure: .92, env: .35, lamps: true, label: 'Night' },
};

export function mulberry(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
