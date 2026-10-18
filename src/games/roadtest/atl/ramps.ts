/**
 * The shapes of exit ramps and on-ramps. The rules engine (sim.ts) and the scene (World.tsx) both read these, so the lane you can steer into
 * is the lane that is drawn. Distances are metres; dd is measured from the gore point (exits) or from the point where the acceleration lane
 * starts to taper away (on-ramps).
 *
 * Both follow the way US interstate ramps are built:
 *  - Exit: a taper that grows a lane out of the right edge, a parallel deceleration lane (dashed against the right lane, solid in the last 45 m),
 *    the gore nose, then the ramp peels away. The paved gore between the two roadways is hatched. The ramp's left edge is yellow, its right edge white.
 *  - On-ramp: a ramp that bends in from the right, a hatched gore wedge where it meets the road, a parallel acceleration lane (dashed against the
 *    right lane) and a long taper that squeezes the lane out so the ramp car has to merge before it ends.
 */
import { LANE, type Layout } from './layout';

export const sm = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const EXIT = { pre: 330, widen: 100, len: 200, sweep: 180, off: 22, solid: 45 };
export const ACC = { par: 280, taper: 110, app: 90, stub: 70, off: 11 };
/** how far from where the ramp starts to where it ends at the taper */
export const ACC_TOTAL = ACC.stub + ACC.app + ACC.par;
/** the paved, hatched gore between a ramp and the road is drawn while the gap is this narrow */
export const GORE_W = 5.2;

/** A ramp lane at one distance: its left and right edge and how far its left edge stands off the road's right edge line. */
export interface Strip { l: number; r: number; gap: number; c: number; w: number }
const mk = (l: number, r: number, gap: number): Strip => ({ l, r, gap, c: (l + r) / 2, w: r - l });

/** x of the road's right edge line (the right edge of the last lane) */
export const roadEdge = (lay: Layout) => lay.xs[lay.xs.length - 1]! + LANE / 2;

/** The deceleration lane and the ramp of an exit on the right, at dd metres from the gore. */
export function exitStrip(lay: Layout, dd: number): Strip | null {
  if (dd < -EXIT.pre || dd > EXIT.len) return null;
  const e = roadEdge(lay);
  if (dd <= 0) return mk(e, e + LANE * sm((dd + EXIT.pre) / EXIT.widen), 0);
  const gap = EXIT.off * sm(dd / EXIT.sweep);
  return mk(e + gap, e + gap + LANE, gap);
}

/** The on-ramp and acceleration lane that tapers into the right lane. dd = 0 is where the taper begins; the lane is gone at dd = taper. */
export function accStrip(lay: Layout, dd: number): Strip | null {
  if (dd < -ACC_TOTAL || dd > ACC.taper) return null;
  const e = roadEdge(lay);
  if (dd <= -ACC.par) { const gap = ACC.off * (1 - sm((dd + ACC_TOTAL - ACC.stub) / ACC.app)); return mk(e + gap, e + gap + LANE, gap); }
  if (dd <= 0) return mk(e, e + LANE, 0);
  return mk(e, e + LANE * (1 - sm(dd / ACC.taper)), 0);
}

/** the part of a strip a car may be in: from its left edge (a car may cross the dashed line there) to just inside its right edge */
export const stripSpan = (s: Strip | null): [number, number] | null => (s && s.w > 0.9 ? [s.l - (s.gap > 0.05 ? -0.7 : 0.4), s.r - 0.7] : null);
