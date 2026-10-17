/**
 * What each lesson looks like in 3D. The art direction is the homepage's: warm cream light, gold accents, black and ivory
 * buildings, the same sun, sky, clouds, rain and snow. A lesson picks a place (kind), a time of day and a weather.
 */
import type { WeatherKind } from '../../../components/nuhome2/world/atmosphere';

export type Place = 'suburb' | 'city' | 'lot' | 'highway' | 'works' | 'plaza' | 'alley' | 'country' | 'school' | 'neon';
export type TimeOfDay = 'day' | 'golden' | 'dusk' | 'night';

export interface Theme {
  place: Place;
  tod: TimeOfDay;
  weather: WeatherKind;
  /** the paint of the town: building colours */
  walls: string[];
  ground: string;
  /** lawn / verge colour next to the sidewalk */
  verge: string;
  road: string;
  /** fog distance multiplier (1 = the homepage's) */
  fog: number;
  sidewalk: boolean;
  /** how packed the sides are with buildings or trees (0..1) */
  density: number;
}

const CREAM = ['#f6ede4', '#e9dcc6', '#f2e3c4', '#d9c9ad', '#fbf5ee'];
const WARM = ['#e8d3b0', '#d9b98a', '#c9a173', '#efe0c4', '#b88f5d'];
const GLASS = ['#9fb6c9', '#c9d3dc', '#7f93a6', '#d7c9a9', '#31384a'];
const BRICK = ['#a65a43', '#b9694f', '#8c4a38', '#d1a78a', '#7a4636'];
const NEON = ['#2a2150', '#1a2a50', '#3a1f4d', '#16203d', '#2b3358'];

const T = (p: Partial<Theme> & Pick<Theme, 'place' | 'tod'>): Theme => ({
  weather: 'clear', walls: CREAM, ground: '#9db878', verge: '#86a864', road: '#33333a', fog: 1, sidewalk: true, density: 0.7, ...p,
});

export const THEMES: Record<string, Theme> = {
  endless: T({ place: 'city', tod: 'golden', walls: WARM, ground: '#8fae6c', density: 0.9 }),
  'parking-lot': T({ place: 'lot', tod: 'day', ground: '#6f6f72', verge: '#7fa65e', sidewalk: false, density: 0.4 }),
  neighborhood: T({ place: 'suburb', tod: 'day', walls: CREAM }),
  'school-zone': T({ place: 'school', tod: 'day', walls: BRICK }),
  downtown: T({ place: 'city', tod: 'golden', walls: GLASS, ground: '#8d8d86', verge: '#7d8d70', density: 1 }),
  'rush-hour': T({ place: 'city', tod: 'dusk', walls: WARM, ground: '#8d8d86', density: 1 }),
  'night-shift': T({ place: 'city', tod: 'night', walls: GLASS, ground: '#4a5240', verge: '#3f4d3a', density: 0.9 }),
  'highway-run': T({ place: 'highway', tod: 'day', ground: '#a8b87c', verge: '#98ab6c', sidewalk: false, density: 0.5, fog: 1.25 }),
  construction: T({ place: 'works', tod: 'day', walls: WARM, ground: '#b7a27a', verge: '#a9946b', density: 0.6 }),
  'city-gauntlet': T({ place: 'city', tod: 'day', walls: CREAM, ground: '#8d8d86', density: 1 }),
  'road-test-final': T({ place: 'city', tod: 'golden', walls: WARM, density: 0.9 }),
  'roundabout-rookie': T({ place: 'suburb', tod: 'day', walls: CREAM }),
  'quick-turns-gauntlet': T({ place: 'city', tod: 'day', walls: BRICK, ground: '#8d8d86', density: 1 }),
  'rainy-slick-streets': T({ place: 'city', tod: 'day', weather: 'rain', walls: GLASS, ground: '#7c8a72', verge: '#6c7e62', road: '#2c2d33' }),
  'bus-stop-blockers': T({ place: 'city', tod: 'day', walls: WARM, ground: '#8d8d86', density: 1 }),
  'door-zone-alley': T({ place: 'alley', tod: 'day', walls: BRICK, ground: '#8a867c', density: 1 }),
  'emergency-make-way': T({ place: 'city', tod: 'dusk', walls: GLASS, ground: '#8d8d86', density: 1 }),
  'multi-stop-delivery': T({ place: 'suburb', tod: 'golden', walls: CREAM }),
  'foggy-backroads': T({ place: 'country', tod: 'day', weather: 'fog', ground: '#8aa070', verge: '#7a9262', sidewalk: false, density: 0.8 }),
  'snowbelt-skid': T({ place: 'country', tod: 'day', weather: 'snow', ground: '#e8eef2', verge: '#dde6ec', road: '#4a4d55', sidewalk: false, density: 0.7 }),
  'pedestrian-plaza': T({ place: 'plaza', tod: 'golden', walls: CREAM, ground: '#c9bfa8', verge: '#a9b887', density: 0.9 }),
  'two-lane-roundabout': T({ place: 'suburb', tod: 'dusk', walls: CREAM }),
  'late-night-diner': T({ place: 'neon', tod: 'night', walls: NEON, ground: '#2c2e44', verge: '#262a3d', density: 1 }),
  'precision-parking-final': T({ place: 'lot', tod: 'dusk', ground: '#a29f96', verge: '#7f9e5f', sidewalk: false, density: 0.4 }),
  'everything-at-once': T({ place: 'city', tod: 'dusk', weather: 'rain', walls: GLASS, ground: '#7e8a74', density: 1 }),
};

export function themeFor(levelId: string): Theme {
  return THEMES[levelId] ?? T({ place: 'suburb', tod: 'day' });
}

/** 0 = full day, 1 = full night (the homepage's NightCtx scale) for each time of day */
export const TOD_MIX: Record<TimeOfDay, number> = { day: 0, golden: 0.18, dusk: 0.55, night: 1 };
