/**
 * Lane paths for the traffic: every directed lane of every road is a polyline, trimmed back from the junction boxes, and the turns through a junction are
 * curves that join one lane path to the next. The cars of the open world follow these paths, so they drive the real streets of the map in their own lanes.
 */
import { offsetPoly, type Arm, type Edge, type GameMap, type Node } from './map';

let SEG_ID = 1;
export interface Seg {
  id: number; kind: 'edge' | 'conn';
  xs: number[]; zs: number[]; cum: number[]; len: number;
  edge?: Edge; dir?: 1 | -1; lane?: number;
  /** the junction this segment ends at (edge segments), and the arm the traffic arrives by */
  end?: Node; arm?: Arm;
  /** the junction a connection crosses */
  node?: Node;
  /** the road this segment belongs to */
  mph: number;
  /** a connection's turn: -1 left, 0 straight, 1 right, 2 u-turn */
  turn?: number;
  next?: Seg[];
}

export const laneOffset = (w: Edge['way'], lane: number) => {
  if (w.oneway) return (lane + 0.5 - w.lanes / 2) * w.lw;
  return (w.turnLane ? w.lw / 2 : 0) + (lane + 0.5) * w.lw;
};

const cache = new Map<string, Seg>();
const connCache = new Map<string, Seg>();
export function resetPaths() { cache.clear(); connCache.clear(); }

const trim = (e: Edge, node: Node) => node.deadEnd ? 0 : Math.min(node.clear, e.len * 0.42);

function build(xs: number[], zs: number[], kind: Seg['kind'], mph: number): Seg {
  const cum = [0]; for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, zs[i]! - zs[i - 1]!));
  return { id: SEG_ID++, kind, xs, zs, cum, len: cum[cum.length - 1]!, mph };
}

/** the lane path of an edge in one direction (dir 1: a to b), trimmed back from the junction boxes at both ends */
export function edgeSeg(e: Edge, dir: 1 | -1, lane: number): Seg {
  const key = `${e.id}:${dir}:${lane}`;
  let s = cache.get(key); if (s) return s;
  let p = e.p;
  if (dir === -1) { const r: number[] = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i]!, p[i + 1]!); p = r; }
  const q = offsetPoly(p, laneOffset(e.way, lane));
  const n = q.length / 2; const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(q[i * 2]! - q[i * 2 - 2]!, q[i * 2 + 1]! - q[i * 2 - 1]!));
  const total = cum[n - 1]!;
  const start = dir === 1 ? e.a : e.b, end = dir === 1 ? e.b : e.a;
  const t0 = trim(e, start), t1 = trim(e, end);
  const s0 = t0, s1 = Math.max(s0 + 0.5, total - t1);
  const xs: number[] = [], zs: number[] = [];
  const at = (d: number) => {
    if (d <= 0) return [q[0]!, q[1]!]; if (d >= total) return [q[(n - 1) * 2]!, q[(n - 1) * 2 + 1]!];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m]! <= d) lo = m; else hi = m; }
    const l = cum[hi]! - cum[lo]!, t = l > 0 ? (d - cum[lo]!) / l : 0; return [q[lo * 2]! + (q[hi * 2]! - q[lo * 2]!) * t, q[lo * 2 + 1]! + (q[hi * 2 + 1]! - q[lo * 2 + 1]!) * t];
  };
  const a = at(s0); xs.push(a[0]!); zs.push(a[1]!);
  for (let i = 1; i < n - 1; i++) if (cum[i]! > s0 + 0.2 && cum[i]! < s1 - 0.2) { xs.push(q[i * 2]!); zs.push(q[i * 2 + 1]!); }
  const b = at(s1); xs.push(b[0]!); zs.push(b[1]!);
  s = build(xs, zs, 'edge', e.way.mph);
  s.edge = e; s.dir = dir; s.lane = lane; s.end = end;
  s.arm = end.arms.find((a2) => a2.edge === e && a2.end === (dir === 1 ? 1 : 0));
  cache.set(key, s);
  return s;
}

const tangentEnd = (s: Seg) => { const n = s.xs.length, dx = s.xs[n - 1]! - s.xs[n - 2]!, dz = s.zs[n - 1]! - s.zs[n - 2]!, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l] as const; };
const tangentStart = (s: Seg) => { const dx = s.xs[1]! - s.xs[0]!, dz = s.zs[1]! - s.zs[0]!, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l] as const; };

/** the curve through a junction from the end of one lane path to the start of the next */
export function connSeg(a: Seg, b: Seg, node: Node): Seg {
  const key = `${a.id}>${b.id}`;
  let c = connCache.get(key); if (c) return c;
  const P0x = a.xs[a.xs.length - 1]!, P0z = a.zs[a.zs.length - 1]!, P1x = b.xs[0]!, P1z = b.zs[0]!;
  const [t0x, t0z] = tangentEnd(a), [t1x, t1z] = tangentStart(b);
  const dx = P1x - P0x, dz = P1z - P0z, dist = Math.hypot(dx, dz);
  const det = t0x * t1z - t0z * t1x;
  let cx = (P0x + P1x) / 2, cz = (P0z + P1z) / 2;
  if (Math.abs(det) > 0.02) {
    const A = (dx * t1z - dz * t1x) / det, B = (t0x * dz - t0z * dx) / det;
    if (A > 0 && B > 0 && A < dist * 2.2 && B < dist * 2.2) { cx = P0x + t0x * A; cz = P0z + t0z * A; }
  }
  const xs: number[] = [], zs: number[] = [];
  const N = Math.max(4, Math.min(22, Math.ceil(dist / 1.4)));
  for (let i = 0; i <= N; i++) { const t = i / N, u = 1 - t; xs.push(u * u * P0x + 2 * u * t * cx + t * t * P1x); zs.push(u * u * P0z + 2 * u * t * cz + t * t * P1z); }
  c = build(xs, zs, 'conn', b.mph);
  c.node = node;
  // left / right / straight from the heading change (the heading of a car is atan2(dx, dz); the forward vector is (sin h, cos h), so a turn to the right makes h smaller)
  const h0 = Math.atan2(t0x, t0z), h1 = Math.atan2(t1x, t1z); let d = h1 - h0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  c.turn = Math.abs(d) < 0.38 ? 0 : Math.abs(d) > 2.6 ? 2 : d < 0 ? 1 : -1;
  connCache.set(key, c);
  return c;
}

/** every lane path that can follow `s` through its junction, with the connection that gets there */
export function followers(map: GameMap, s: Seg): { conn: Seg; out: Seg; turn: number }[] {
  const n = s.end; if (!n || !s.edge || !s.arm) return [];
  const res: { conn: Seg; out: Seg; turn: number }[] = [];
  for (const arm of n.arms) {
    if (!arm.outbound) continue;
    if (arm.edge === s.edge && arm.end === s.arm.end && n.arms.length > 1) continue;      // no u-turn
    const w = arm.edge.way; if (!w.ai) continue;
    const dir: 1 | -1 = arm.end === 0 ? 1 : -1;
    // the outgoing lane: left turns from the inner lane, right turns from the outer, otherwise the same lane index
    const lanes = w.lanes;
    const mine = s.lane ?? 0;
    // preview the turn type from the bearings to pick the lane
    let dh = arm.bearing - s.arm.bearing; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
    // bearing of the outgoing arm minus the bearing of the arrival arm (which points back down the road we came on): ~pi = straight
    const straight = Math.abs(Math.abs(dh) - Math.PI);
    const lane = Math.min(lanes - 1, Math.max(0, mine));
    const out = edgeSeg(arm.edge, dir, lane);
    const conn = connSeg(s, out, n);
    void straight; void map;
    res.push({ conn, out, turn: conn.turn ?? 0 });
  }
  return res;
}

/** a point on a segment */
export function segAt(s: Seg, d: number): { x: number; z: number; tx: number; tz: number } {
  const n = s.cum.length;
  if (d <= 0) { const l = Math.hypot(s.xs[1]! - s.xs[0]!, s.zs[1]! - s.zs[0]!) || 1; return { x: s.xs[0]!, z: s.zs[0]!, tx: (s.xs[1]! - s.xs[0]!) / l, tz: (s.zs[1]! - s.zs[0]!) / l }; }
  if (d >= s.len) { const l = Math.hypot(s.xs[n - 1]! - s.xs[n - 2]!, s.zs[n - 1]! - s.zs[n - 2]!) || 1; return { x: s.xs[n - 1]!, z: s.zs[n - 1]!, tx: (s.xs[n - 1]! - s.xs[n - 2]!) / l, tz: (s.zs[n - 1]! - s.zs[n - 2]!) / l }; }
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.cum[m]! <= d) lo = m; else hi = m; }
  const l = s.cum[hi]! - s.cum[lo]!, t = l > 0 ? (d - s.cum[lo]!) / l : 0;
  return { x: s.xs[lo]! + (s.xs[hi]! - s.xs[lo]!) * t, z: s.zs[lo]! + (s.zs[hi]! - s.zs[lo]!) * t, tx: (s.xs[hi]! - s.xs[lo]!) / (l || 1), tz: (s.zs[hi]! - s.zs[lo]!) / (l || 1) };
}
