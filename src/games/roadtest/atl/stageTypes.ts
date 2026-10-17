/**
 * Types for the Atlanta stages. Pure data shapes, no runtime code, so game/types.ts can point at them without a cycle.
 */
import type { TimeOfDay } from '../g3d/themes';
import type { WeatherKind } from '../g3d/atmo';

/** Where in Georgia the stage is. It picks the skyline, the trees, the buildings and the street furniture. */
export type Region =
  | 'carrollton' | 'rural' | 'villarica' | 'douglasville' | 'westside' | 'downtown' | 'midtown' | 'buckhead'
  | 'perimeter' | 'airport' | 'cobb' | 'gwinnett' | 'henry' | 'stonemtn' | 'intown';

export type RoadKind = 'interstate' | 'arterial' | 'local' | 'rural';
export type Skyline = 'downtown' | 'midtown' | 'buckhead' | 'perimeter' | 'carrollton' | 'airport' | 'stonemtn' | 'cobb' | 'suburb' | 'hills' | 'none';

export interface Shield { t: 'I' | 'US' | 'GA'; n: string }
export type Arrow = 'up' | 'upright' | 'upleft' | 'right' | 'left' | 'down';

/** One overhead or roadside green guide sign. `at` is 0..1 along the stage. */
export interface GuideSign {
  at: number;
  shields?: Shield[];
  /** NORTH / SOUTH / EAST / WEST over the shield */
  dir?: string;
  dests: string[];
  arrows?: Arrow[];
  /** the yellow tab: an exit number, "LEFT", "EXIT ONLY" */
  tab?: string;
  exitOnly?: boolean;
  left?: boolean;
  dist?: string;
  /** a second panel next to the first (the big gantries carry two or three) */
  also?: { shields?: Shield[]; dir?: string; dests: string[]; arrows?: Arrow[]; exitOnly?: boolean }[];
}

export type StageEvent =
  | { t: 'rail'; at: number; train: boolean; gates: boolean; name?: string }
  | { t: 'circle'; at: number }
  | { t: 'exit'; at: number; name: string; no?: string; lesson?: string }
  | { t: 'police'; at: number }
  | { t: 'crash'; at: number }
  | { t: 'work'; at: number; len: number }
  | { t: 'merge'; at: number }
  | { t: 'school'; at: number; len: number }
  | { t: 'stop'; at: number }
  | { t: 'light'; at: number }
  | { t: 'ped'; at: number }
  | { t: 'vms'; at: number; text: string }
  | { t: 'tip'; at: number; title: string; sub: string };

export interface AtlStage {
  id: string;
  name: string;
  subtitle: string;
  region: Region;
  road: RoadKind;
  /** lanes in your direction (HOV lane included) */
  lanes: number;
  /** the left lane is an HOV lane: 2 or more riders, so a solo driver stays out */
  hov?: boolean;
  limit: number;
  maxSpeed: number;
  /** length of the course in metres at Easy */
  lengthM: number;
  /** the road's name on the VMS and the banners, e.g. "I-75/85 NORTH" */
  roadName: string;
  skyline: Skyline;
  tod: TimeOfDay;
  /** a stage can insist on a weather (a thunderstorm stage); the player's own pick still wins */
  weather?: WeatherKind;
  /** 0..1.6 how busy the road is; <0.4 is light, >1 is a parking lot */
  traffic: number;
  /** share of trucks and buses 0..1 */
  trucks: number;
  /** the typical speed of traffic as a share of the limit (0.4 in a rush hour crawl, 1.05 on an open road) */
  flow: number;
  guide: GuideSign[];
  events: StageEvent[];
  /** curve and hill character of the road */
  curves: 'straight' | 'gentle' | 'winding' | 'rolling';
  lessons: string[];
  par: number;
  /** wall palette and tree mix of the roadside */
  trees: 'pine' | 'hardwood' | 'mixed' | 'fall' | 'palm' | 'none';
  walls: 'brick' | 'cream' | 'glass' | 'warehouse' | 'houses' | 'retail';
  /** where the player is, in the words of the stage: used on the loading screen */
  place: string;
  isRush?: boolean;
}
