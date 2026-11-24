import { XMAS } from './season';
import { BL, BL_CONES, CONE_H, CONE_R, EXIT, LOT_SIGN, LOT_SIGNS } from './rearlot';
/** The solid things in the scene, in world metres, as the camera has to see them. Used to push a free camera out of objects and to test the opening shot. */
export type Solid = { n: string } & ({ k: 'box'; min: [number, number, number]; max: [number, number, number] } | { k: 'cyl'; x: number; z: number; r: number; y0: number; y1: number } | { k: 'wire'; a: [number, number]; b: [number, number] });
const box = (n: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid => ({ n, k: 'box', min: [x0, y0, z0], max: [x1, y1, z1] });
const cyl = (n: string, x: number, z: number, r: number, y0: number, y1: number): Solid => ({ n, k: 'cyl', x, z, r, y0, y1 });

export const POLE_H = 6.6;
export const WIRE_POLES: [number, number][] = [[-26, -12.4], [-35, -8], [-35, -.5], [-35, 6.5], [-27, 11.8], [-18, 11.8], [18, 11.8], [27, 11.8], [35, 6.5], [35, -.5], [35, -8], [26, -12.4]];
/** Height of the star string between two poles at fraction t, exactly as StarCanopy hangs it. */
export const wireY = (a: [number, number], b: [number, number], t: number) => POLE_H - Math.min(3.4, Math.max(.9, Math.hypot(b[0] - a[0], b[1] - a[1]) * .1)) * 4 * t * (1 - t) - .28;

export const SOLIDS: Solid[] = [
  // at Christmas the fountain circle holds a tree about 7 m tall: shots that would pass through it are left out
  ...(XMAS ? [cyl('christmas tree', 0, 6.6, 2.9, 0, 7.3)] : []),
  box('building', -22.6, 22.6, 0, 13, -26, -14.4),
  box('portico deck', -5.9, 5.9, 0, 1.0, -14.5, -11.1), box('steps', -4.2, 4.2, 0, .55, -11.1, -10.2),
  cyl('column L', -4.8, -11.8, .85, 0, 5.7), cyl('column R', 4.8, -11.8, .85, 0, 5.7),
  box('canopy beam', -7, 7, 5.2, 12, -14.5, -10.8),
  box('pilaster L', -4.2, -3.3, 0, 5.3, -14.5, -13.4), box('pilaster R', 3.3, 4.2, 0, 5.3, -14.5, -13.4),
  cyl('planter L', -2.85, -12.9, .95, 1.0, 3.6), cyl('planter R', 2.85, -12.9, .95, 1.0, 3.6),
  cyl('rail post L', -3.7, -10.4, .22, 0, 1.8), cyl('rail post R', 3.7, -10.4, .22, 0, 1.8),
  box('hedge row L', -23, -3.7, 0, 1.6, -9.8, -8.7), box('hedge row R', 3.7, 23, 0, 1.6, -9.8, -8.7),
  cyl('topiary L', -3.7, -9.25, .65, 0, 2.2), cyl('topiary R', 3.7, -9.25, .65, 0, 2.2),
  box('wing bed L', -21, -9.5, 0, 1.4, -15, -13.6), box('wing bed R', 9.5, 21, 0, 1.4, -15, -13.6),
  cyl('reserved sign pole', -1.75, -8.15, .3, 0, 1.8),
  box('hours A-frame', 2.25, 3.15, 0, 1.25, -9.8, -9.0),
  cyl('fountain', 0, 6.6, 4.3, 0, 4.0),
  box('monument', 6.1, 14.7, 0, 3.6, 14.1, 15.7),
  box('front hedge L', -29.6, -15.6, 0, 1.4, 14.3, 15.7), box('front hedge R', 15.6, 29.6, 0, 1.4, 14.3, 15.7),
  box('island L', -29.2, -4.7, 0, 5, 8.0, 13.6), box('island R', 4.7, 29.2, 0, 5, 8.0, 13.6),
  cyl('stop sign pole', 5.3, 37.5, .35, 0, 2.5), box('stop sign', 4.8, 5.8, 1.8, 2.6, 37.2, 37.8),
  cyl('exit stop sign pole', EXIT.signX, EXIT.signZ, .35, 0, 2.5), box('exit stop sign', EXIT.signX - .5, EXIT.signX + .5, 1.8, 2.6, EXIT.signZ - .3, EXIT.signZ + .3),
  box('car reserved', -1, 1, 0, 2.1, -8.5, -3.5), box('car A1', -6.5, -4.5, 0, 2.1, -8.5, -3.5), box('car A2', 7.25, 9.25, 0, 2.1, -8.5, -3.5), box('car A3', -17.5, -15.5, 0, 2.1, -8.5, -3.5),
  box('car B1', 10, 12, 0, 2.1, 3, 8), box('car B2', -14.75, -12.75, 0, 2.1, 3, 8),
  ...[[-13, 10.8], [13, 10.8], [-26, 10.8], [26, 10.8], [-24.4, -8.2], [24.4, -8.2]].map(([x, z]) => cyl('lot lamp', x!, z!, .3, 0, 8.4)),
  ...[46, 76, 106, 136, 166, 196].map((z, i) => cyl('avenue lamp', i % 2 ? -6.2 : 6.2, z, .3, 0, 8.4)),
  ...WIRE_POLES.map(([x, z]) => cyl('canopy pole', x, z, .35, 0, 7.8)),
  // the back lot: every cone of the training layout, and its four lamps
  ...BL_CONES.map(([x, z]) => cyl('cone', x, z, CONE_R, 0, CONE_H)),
  ...[[-18, BL.zn + 1.1], [12, BL.zn + 1.1], [-27.6, -21], [27.6, -21]].map(([x, z]) => cyl('back lot lamp', x!, z!, .3, 0, 8.4)),
  // the EXIT and ENTRANCE signs: two poles and the board each (the board is turned by rotY, so its box is the bounding box of the turned board)
  ...(['exit', 'entrance'] as const).flatMap(k => { const g = LOT_SIGNS[k], c = Math.cos(g.rotY), sn = Math.sin(g.rotY), hw = LOT_SIGN.W / 2, t = .04, hx = Math.abs(c) * hw + Math.abs(sn) * t, hz = Math.abs(sn) * hw + Math.abs(c) * t;
    return [-1, 1].map(sg => cyl(k + ' sign pole', g.x + sg * LOT_SIGN.POLE_DX * c, g.z - sg * LOT_SIGN.POLE_DX * sn, .06, 0, LOT_SIGN.POLE_H))
      .concat([box(k + ' sign', g.x - hx, g.x + hx, LOT_SIGN.Y - LOT_SIGN.H / 2, LOT_SIGN.Y + LOT_SIGN.H / 2, g.z - hz, g.z + hz)]); }),
];
/** The sagging star strings, so the camera can keep clear of them. */
for (let i = 0; i < WIRE_POLES.length - 1; i++) SOLIDS.push({ n: 'star string', k: 'wire', a: WIRE_POLES[i]!, b: WIRE_POLES[i + 1]! });

/** Distance from a point to the surface of a solid (0 when inside). */
export function clearance(s: Solid, p: [number, number, number]) {
  if (s.k === 'box') { const dx = Math.max(s.min[0] - p[0], 0, p[0] - s.max[0]), dy = Math.max(s.min[1] - p[1], 0, p[1] - s.max[1]), dz = Math.max(s.min[2] - p[2], 0, p[2] - s.max[2]); return Math.hypot(dx, dy, dz); }
  if (s.k === 'cyl') { const dr = Math.max(0, Math.hypot(p[0] - s.x, p[2] - s.z) - s.r), dy = Math.max(s.y0 - p[1], 0, p[1] - s.y1); return Math.hypot(dr, dy); }
  let best = 1e9;   // wire: a polyline, with the hanging stars about a metre round it
  for (let i = 0; i <= 48; i++) { const t = i / 48, x = s.a[0] + (s.b[0] - s.a[0]) * t, z = s.a[1] + (s.b[1] - s.a[1]) * t, y = wireY(s.a, s.b, t); best = Math.min(best, Math.hypot(p[0] - x, p[1] - y, p[2] - z) - 1); }
  return Math.max(0, best);
}
export const GROUND = .5;   // the lens never goes below this
