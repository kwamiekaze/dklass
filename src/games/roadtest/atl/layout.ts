/**
 * Where everything sits across the road, per stage. Distances in metres; x runs left to right, 0 is the centre of the player's lanes (divided roads)
 * or the centre line (two-way roads). The rules engine and the scene both read this, so the lanes you steer in are the lanes that are drawn.
 */
import type { AtlStage } from './stageTypes';

export const LANE = 3.4;

export interface Layout {
  kind: 'divided' | 'twoway';
  lanes: number;
  xs: number[];                 // centre of each of the player's lanes, left to right
  /** the drivable range for the centre of the player's car */
  minX: number; maxX: number;
  /** pavement of the player's carriageway (lanes plus shoulders / parking) */
  padL: number; padR: number;
  /** the opposite carriageway: lane centres (decor traffic drives here the other way) */
  onXs: number[];
  /** pavement edges of the opposite carriageway, plus the median between */
  onPadL: number; onPadR: number;
  medianL: number; medianR: number;
  /** x of the double yellow line on a two-way road, otherwise null */
  centre: number | null;
  /** the very edge of all pavement on the left and on the right: where the roadside starts */
  edgeL: number; edgeR: number;
  shoulderL: number; shoulderR: number;
  median: 'barrier' | 'grass' | 'none';
  hovLane: number;              // index of the HOV lane (0) or -1
  sidewalks: boolean;
}

export function layoutFor(s: AtlStage): Layout {
  const L = s.lanes, W = LANE;
  if (s.road === 'interstate' || (s.road === 'arterial' && L >= 2)) {
    const inter = s.road === 'interstate';
    const half = (L * W) / 2;
    const xs = Array.from({ length: L }, (_, i) => -half + W / 2 + i * W);
    const shL = inter ? 2.4 : 0.5, shR = inter ? 3.4 : 0.6;
    const medW = inter ? 1.0 : 5.0;
    const padL = -half - shL, padR = half + shR;
    const onL = inter ? Math.max(3, L - (s.hov ? 0 : 0)) : Math.max(2, L);
    const onHalf = (onL * W) / 2;
    const medianR = padL, medianL = padL - medW;
    const onPadR = medianL, onPadL = onPadR - (inter ? 2.4 : 0.5) - onL * W - (inter ? 3.4 : 0.6);
    const onXs = Array.from({ length: onL }, (_, j) => onPadR - (inter ? 2.4 : 0.5) - W / 2 - j * W);
    void onHalf;
    return {
      kind: 'divided', lanes: L, xs, minX: -half + 0.3, maxX: half - 0.3, padL, padR, onXs, onPadL, onPadR, medianL, medianR, centre: null,
      edgeL: onPadL, edgeR: padR, shoulderL: shL, shoulderR: shR, median: inter ? 'barrier' : 'grass', hovLane: s.hov ? 0 : -1, sidewalks: !inter,
    };
  }
  // two-way: own lanes to the right of the double yellow, oncoming to the left
  const O = Math.max(1, L);
  const xs = Array.from({ length: L }, (_, i) => (i + 0.5) * W);
  const parking = s.road === 'local' ? 2.4 : 0;
  const shR = s.road === 'rural' ? 1.3 : 0.5;
  return {
    kind: 'twoway', lanes: L, xs, minX: -O * W + 0.7, maxX: L * W - 0.5, padL: 0, padR: L * W + parking + shR, onXs: Array.from({ length: O }, (_, j) => -(j + 0.5) * W),
    onPadL: -O * W - shR, onPadR: 0, medianL: 0, medianR: 0, centre: 0, edgeL: -O * W - shR, edgeR: L * W + parking + shR, shoulderL: shR, shoulderR: shR + parking, median: 'none', hovLane: -1, sidewalks: s.road === 'local' || s.road === 'arterial',
  };
}

/** x of a lane for a lane number that may be fractional (a car halfway through a lane change) */
export function laneXAt(lay: Layout, lane: number) {
  const l = Math.max(0, Math.min(lay.lanes - 1, lane)), i = Math.floor(l), f = l - i;
  return lay.xs[i]! + (lay.xs[Math.min(lay.lanes - 1, i + 1)]! - lay.xs[i]!) * f;
}
export function nearestLane(lay: Layout, x: number) {
  let b = 0, bd = Infinity; for (let i = 0; i < lay.lanes; i++) { const d = Math.abs(x - lay.xs[i]!); if (d < bd) { bd = d; b = i; } } return b;
}
