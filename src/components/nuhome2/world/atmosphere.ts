/**
 * The weather and the deep night of the scene, in one pure module (no React) that the lights, the sky, the rain and the lamps all read.
 *   deep      0..1   how much darker the night is: it comes in between 9 and 10 pm (the visitor's own clock) and goes between 5 and 6 am. It only shows in the night theme.
 *   look      the weather as five numbers (cloud, rain, fog, snow, storm), eased toward `goal` so a change of weather fades in and out and never jumps.
 * The weather is the real one for Carrollton, Georgia (Open-Meteo, no key), asked for at most every 15 minutes. If the answer cannot be had the scene stays clear.
 * An admin can set the weather pattern (and the deep night) for the whole site from the admin dashboard (Site controls), or from the home page menu: the choice is saved in the
 * `home_weather_settings` table and every visitor gets it. "Live" (the default, also used while the table cannot be read) means the real weather of Carrollton.
 */
import { supabase } from '@/integrations/supabase/client';
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

/** Carrollton, Georgia. (The town's zip is 30117; 30135 is Douglasville, 25 miles east: the weather there is the same to the eye.) */
export const PLACE = { name: 'Carrollton, GA', lat: 33.5801, lon: -85.0766 };

export type LiveWeather = { kind: WeatherKind; look: Look; tempF: number | null; at: number };
export type PreviewState = { weather: WeatherKind | 'live'; night: 'live' | 'deep' | 'normal' };

export const atmo = {
  deep: 0, deepGoal: 0,
  look: { ...LOOKS.clear } as Look, goal: { ...LOOKS.clear } as Look,
  live: null as LiveWeather | null,
  site: { weather: 'live', night: 'live' } as PreviewState,     // what the admins chose for the whole site (the home_weather_settings row)
  siteAt: 0, siteReady: false,
  preview: { weather: 'live', night: 'live' } as PreviewState,
  debug: false,                    // debug: a ?wx= / ?deep= link pins the look for screenshots
  flash: 0,                        // 0..1 lightning flash, set by the storm and decayed by whoever draws it
};

const listeners = new Set<() => void>();
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const emit = () => listeners.forEach(f => f());

// the new table is not in the generated types yet
type Loose = { from: (t: string) => any };   // eslint-disable-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as Loose;
const isKind = (v: unknown): v is WeatherKind => KINDS.includes(v as WeatherKind);

/** Read the site-wide choice (everyone can read it). If the table is not there yet or cannot be read, the site simply shows the live weather. */
export async function loadSite(force = false): Promise<void> {
  if (!force && atmo.siteReady && Date.now() - atmo.siteAt < 2 * 60 * 1000) return;
  atmo.siteAt = Date.now();
  try {
    const { data, error } = await sb.from('home_weather_settings').select('weather,night').eq('id', 1).maybeSingle();
    if (!error && data) atmo.site = { weather: isKind(data.weather) ? data.weather : 'live', night: data.night === 'deep' || data.night === 'normal' ? data.night : 'live' };
  } catch { /* keep what we had */ }
  atmo.siteReady = true; apply(); emit();
}
/** An admin sets the weather pattern and/or the night depth for the whole site. Returns an error message, or null when it was saved. */
export async function saveSite(p: Partial<PreviewState>): Promise<string | null> {
  const next = { ...atmo.site, ...p };
  try {
    const { error } = await sb.from('home_weather_settings').upsert({ id: 1, weather: next.weather, night: next.night, updated_at: new Date().toISOString() });
    if (error) return error.message || 'Could not save';
  } catch (e) { return e instanceof Error ? e.message : 'Could not save'; }
  atmo.site = next; atmo.siteAt = Date.now(); atmo.siteReady = true; apply(); emit(); return null;
}

/** The deep-night amount for a clock time: 0 until 9 pm, up to 1 by 10 pm, 1 until 5 am, back to 0 by 6 am. */
export function deepAt(d: Date): number {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 22 || h < 5) return 1;
  if (h >= 21) return h - 21;
  if (h < 6) return 6 - h;
  return 0;
}

/** Weather code (WMO) + cloud cover + precipitation to a kind and a look. */
export function classify(code: number, cloudPct: number, precipMm: number): { kind: WeatherKind; look: Look } {
  const cloud = Math.min(1, Math.max(.04, cloudPct / 100));
  let kind: WeatherKind = cloud > .6 ? 'cloudy' : 'clear', look: Look = { cloud, rain: 0, fog: 0, snow: 0, storm: 0 };
  if (code === 45 || code === 48) { kind = 'fog'; look = { cloud: Math.max(cloud, .6), rain: 0, fog: 1, snow: 0, storm: 0 }; }
  else if ((code >= 51 && code <= 57)) { kind = 'rain'; look = { cloud: Math.max(cloud, .85), rain: .3, fog: .15, snow: 0, storm: 0 }; }
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) { const r = code === 61 || code === 80 ? .55 : code === 63 || code === 81 ? .8 : 1; kind = 'rain'; look = { cloud: Math.max(cloud, .9), rain: Math.max(r, Math.min(1, precipMm / 4)), fog: .22, snow: 0, storm: 0 }; }
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { kind = 'snow'; look = { cloud: Math.max(cloud, .85), rain: 0, fog: .35, snow: code === 71 || code === 85 ? .6 : 1, storm: 0 }; }
  else if (code >= 95) { kind = 'storm'; look = { cloud: 1, rain: 1, fog: .3, snow: 0, storm: 1 }; }
  else if (code === 3) { kind = 'cloudy'; look = { cloud: Math.max(cloud, .8), rain: 0, fog: .08, snow: 0, storm: 0 }; }
  else if (code === 2) { kind = 'cloudy'; look = { cloud: Math.min(.7, Math.max(cloud, .45)), rain: 0, fog: 0, snow: 0, storm: 0 }; }
  return { kind, look };
}

let fetching = false;
/** Ask for the live weather (at most every 15 minutes; a failure leaves what we had, or clear). */
export async function refreshLive(force = false): Promise<void> {
  if (fetching || typeof fetch === 'undefined') return;
  if (!force && atmo.live && Date.now() - atmo.live.at < 15 * 60 * 1000) return;
  fetching = true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=temperature_2m,weather_code,cloud_cover,precipitation&temperature_unit=fahrenheit&timezone=auto`;
    const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) throw new Error(String(res.status));
    const j = await res.json(), c = j.current; if (!c) throw new Error('no data');
    const { kind, look } = classify(Number(c.weather_code), Number(c.cloud_cover ?? 0), Number(c.precipitation ?? 0));
    atmo.live = { kind, look, tempF: typeof c.temperature_2m === 'number' ? Math.round(c.temperature_2m) : null, at: Date.now() };
  } catch { if (!atmo.live) atmo.live = { kind: 'clear', look: { ...LOOKS.clear }, tempF: null, at: Date.now() - 12 * 60 * 1000 }; }   // (tries again in 3 minutes)
  fetching = false; apply(); emit();
}

/** Work out the goals from the live weather, the clock and the admins' choice for the site. */
export function apply() {
  const p = atmo.debug ? atmo.preview : atmo.site;
  atmo.goal = p.weather === 'live' ? { ...(atmo.live?.look ?? LOOKS.clear) } : { ...LOOKS[p.weather] };
  atmo.deepGoal = p.night === 'deep' ? 1 : p.night === 'normal' ? 0 : deepAt(new Date());
}

/** The weather the scene is showing now (the admins' pattern if they set one, otherwise the live weather). */
export const effectiveKind = (): WeatherKind => { const w = atmo.debug ? atmo.preview.weather : atmo.site.weather; return w !== 'live' ? w : atmo.live?.kind ?? 'clear'; };

let clockT = 0;
/** Ease the numbers toward their goals; call once a frame. */
export function tickAtmo(dt: number) {
  const k = 1 - Math.exp(-.9 * Math.min(dt, .05));
  for (const key of Object.keys(atmo.look) as (keyof Look)[]) { const g = atmo.goal[key]; atmo.look[key] += (g - atmo.look[key]) * k; if (Math.abs(g - atmo.look[key]) < .002) atmo.look[key] = g; }
  atmo.deep += (atmo.deepGoal - atmo.deep) * (1 - Math.exp(-.7 * Math.min(dt, .05))); if (Math.abs(atmo.deepGoal - atmo.deep) < .002) atmo.deep = atmo.deepGoal;
  clockT += dt; if (clockT > 20) { clockT = 0; apply(); if (!atmo.live || Date.now() - atmo.live.at > 15 * 60 * 1000) void refreshLive(); void loadSite(); }
  atmo.flash = Math.max(0, atmo.flash - dt * 3.2);
}

/** ?wx=rain&deep=1 pins the look for screenshots (visitors never see it). */
export function debugOverride() {
  if (typeof window === 'undefined') return;
  const q = new URLSearchParams(window.location.search), w = q.get('wx'), d = q.get('deep');
  if (w && (KINDS as string[]).includes(w)) { atmo.debug = true; atmo.preview.weather = w as WeatherKind; }
  if (d !== null) { atmo.debug = true; atmo.preview.night = d === '1' ? 'deep' : 'normal'; }
  if (atmo.debug) { apply(); atmo.look = { ...atmo.goal }; atmo.deep = atmo.deepGoal; }
}
