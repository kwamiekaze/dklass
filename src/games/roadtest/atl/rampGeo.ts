/**
 * Pavement and paint for one ramp: the lane itself, the dashed or solid line against the road, the yellow left and white right edge lines,
 * and the hatched gore between the ramp and the road. Built once from a strip function (ramps.ts) and reused as the car drives past.
 */
import * as THREE from 'three';
import { GORE_W, type Strip } from './ramps';

class Quads {
  pos: number[] = []; idx: number[] = []; private n = 0;
  /** a quad from (xa0,za) to (xa1,zb): left edge x0 and right edge x1 at the near end za, x0b / x1b at the far end zb */
  quad(y: number, x0: number, x1: number, za: number, x0b: number, x1b: number, zb: number) {
    this.pos.push(x0, y, za, x1, y, za, x0b, y, zb, x1b, y, zb);
    const a = this.n; this.n += 4; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  /** a free parallelogram from four (x, z) corners in order p0 p1 p2 p3 */
  poly(y: number, p0: number[], p1: number[], p2: number[], p3: number[]) {
    this.pos.push(p0[0]!, y, p0[1]!, p1[0]!, y, p1[1]!, p2[0]!, y, p2[1]!, p3[0]!, y, p3[1]!);
    const a = this.n; this.n += 4; this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setIndex(this.idx); g.computeVertexNormals(); return g; }
}

export interface RampGeo { asphalt: THREE.BufferGeometry; white: THREE.BufferGeometry; yellow: THREE.BufferGeometry }
export interface RampOpts {
  /** distance range to build, relative to the ramp's reference point */
  from: number; to: number;
  /** x of the road's right edge line */
  edge: number;
  /** the line against the road is solid (not dashed) for dd in this range, e.g. the last stretch before an exit nose */
  solid?: [number, number];
  step?: number;
}

const LW = 0.16;       // paint line width
const DASH = 3, PERIOD = 12;

export function buildRamp(fn: (dd: number) => Strip | null, o: RampOpts): RampGeo {
  const step = o.step ?? 3, A = new Quads(), W = new Quads(), Y = new Quads();
  const ys = { asphalt: 0.03, white: 0.05, yellow: 0.056 };
  const pts: { dd: number; s: Strip }[] = [];
  for (let dd = o.from; dd < o.to + step; dd += step) { const d = Math.min(dd, o.to), s = fn(d); if (s) pts.push({ dd: d, s }); if (d >= o.to) break; }
  const ok = (a: { dd: number; s: Strip }, b: { dd: number; s: Strip }) => b.dd - a.dd < step * 1.6;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!; if (!ok(a, b)) continue;
    const z0 = -a.dd, z1 = -b.dd;
    const la = a.s.gap <= 0.3 ? a.s.l - 0.25 : a.s.l - 0.08, lb = b.s.gap <= 0.3 ? b.s.l - 0.25 : b.s.l - 0.08;
    if (a.s.w > 0.02 || b.s.w > 0.02) A.quad(ys.asphalt, la, a.s.r, z0, lb, b.s.r, z1);
    // right edge line: white and solid
    if (a.s.w > 0.1 && b.s.w > 0.1) W.quad(ys.white, a.s.r - LW, a.s.r, z0, b.s.r - LW, b.s.r, z1);
    // left edge: yellow once the ramp has pulled away from the road, otherwise the lane line against the right lane
    if (a.s.gap > 0.08 && b.s.gap > 0.08) Y.quad(ys.yellow, a.s.l, a.s.l + LW, z0, b.s.l, b.s.l + LW, z1);
    else if (o.solid && a.dd >= o.solid[0] && b.dd <= o.solid[1] && a.s.w > 0.3) W.quad(ys.white, a.s.l - LW / 2, a.s.l + LW / 2, z0, b.s.l - LW / 2, b.s.l + LW / 2, z1);
    // the paved gore between the ramp and the road, with the road's own edge line along it
    if (a.s.gap > 0.08 && b.s.gap > 0.08 && a.s.gap <= GORE_W + 0.5 && b.s.gap <= GORE_W + 0.5) {
      A.quad(ys.asphalt, o.edge - 0.05, a.s.l, z0, o.edge - 0.05, b.s.l, z1);
      W.quad(ys.white, o.edge - LW / 2, o.edge + LW / 2, z0, o.edge - LW / 2, o.edge + LW / 2, z1);
    }
  }
  // dashes of the lane line, where the ramp lane runs right against the road
  const dd0 = Math.ceil(o.from / PERIOD) * PERIOD;
  for (let d = dd0; d < o.to; d += PERIOD) {
    const a = fn(d), b = fn(d + DASH); if (!a || !b || a.gap > 0.08 || b.gap > 0.08 || a.w < 0.6 || b.w < 0.6) continue;
    if (o.solid && d + DASH >= o.solid[0] && d <= o.solid[1]) continue;
    W.quad(ys.white, a.l - LW / 2, a.l + LW / 2, -d, b.l - LW / 2, b.l + LW / 2, -(d + DASH));
  }
  // hatching in the gore: slanted bars from the road's edge line to the ramp's edge line
  for (let d = Math.ceil(o.from / 4.5) * 4.5; d < o.to; d += 4.5) {
    const a = fn(d), b = fn(d + 5); if (!a || !b || a.gap <= 0.4 || b.gap <= 0.3 || a.gap > GORE_W || b.gap > GORE_W) continue;
    const x0 = o.edge + LW / 2, x1 = b.l - LW * 0.5, zz0 = -d, zz1 = -(d + 5), t = 0.2;
    W.poly(ys.white, [x0, zz0 + t], [x0, zz0 - t], [x1, zz1 + t], [x1, zz1 - t]);
  }
  return { asphalt: A.geo(), white: W.geo(), yellow: Y.geo() };
}
