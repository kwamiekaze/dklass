/**
 * The shapes of exit ramps and on-ramps. The rules engine (sim.ts) and the scene (World.tsx) both read these, so the lane you can steer into
 * is the lane that is drawn. Distances are metres; dd is measured from the gore point (exits) or from the merge point (on-ramps).
 */
import { LANE, type Layout } from './layout';

const sm = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export const EXIT = { pre: 230, widen: 110, len: 200, sweep: 180, off: 22 };
export const ACC = { par: 300, taper: 95 };

export interface Strip { c: number; w: number }

/** The deceleration lane and the ramp of an exit on the right: centre and width at dd metres from the gore. */
export function exitStrip(lay: Layout, dd: number): Strip | null {
  if (dd < -EXIT.pre || dd > EXIT.len) return null;
  const xl = lay.xs[lay.xs.length - 1]!;
  if (dd <= 0) { const w = LANE * sm((dd + EXIT.pre) / EXIT.widen); return { c: xl + LANE / 2 + w / 2, w }; }
  return { c: xl + LANE + EXIT.off * sm(dd / EXIT.sweep), w: LANE };
}

/** The on-ramp lane that runs beside the right lane and tapers into it at the merge point (dd = 0). */
export function accStrip(lay: Layout, dd: number): Strip | null {
  if (dd < -ACC.par || dd > ACC.taper) return null;
  const xl = lay.xs[lay.xs.length - 1]!, c0 = xl + LANE * 1.9;
  if (dd <= 0) return { c: c0, w: LANE };
  const s = sm(dd / ACC.taper);
  return { c: c0 + (xl - c0) * s, w: LANE * (1 - s) };
}

/** how far right / left the player's car may go because of a ramp (null: no ramp here) */
export const stripMax = (s: Strip | null) => (s ? s.c + s.w / 2 - 0.7 : null);
