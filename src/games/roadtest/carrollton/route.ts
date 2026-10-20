/**
 * The GPS: the quickest legal way from where the car is to a place on the map. A Dijkstra over the directed road graph (one-way streets respected, alleys and
 * service roads discouraged), turned into a polyline for the route line and a list of turns for the "In 300 ft turn right onto Newnan St" prompt.
 */
import { edgeAt, offsetPoly, wrapAngle, type Edge, type GameMap, type Node } from './map';
import { laneOffset } from './paths';

export interface RouteTurn { x: number; z: number; /** -1 left, 0 straight, 1 right, 2 u-turn */ dir: number; at: number; street: string; node: Node; /** the lane to be in before the turn (0 = leftmost) and how many there are */ lane: number; lanes: number }
export interface Route { pts: number[]; length: number; turns: RouteTurn[]; edges: { edge: Edge; dir: 1 | -1 }[] }
export type Planner = (x: number, z: number, h: number, goal: Edge, goalS: number) => Route | null;

type State = { e: Edge; dir: 1 | -1 };
const sid = (e: Edge, dir: 1 | -1) => e.id * 2 + (dir === 1 ? 0 : 1);

class Heap {
  a: { k: number; v: number }[] = [];
  push(k: number, v: number) { const a = this.a; a.push({ k, v }); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p]!.k <= a[i]!.k) break; [a[p], a[i]] = [a[i]!, a[p]!]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop()!; if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l]!.k < a[m]!.k) m = l; if (r < a.length && a[r]!.k < a[m]!.k) m = r; if (m === i) break; [a[m], a[i]] = [a[i]!, a[m]!]; i = m; } } return top; }
  get size() { return this.a.length; }
}

const cost = (e: Edge) => e.len / (e.way.mph * 0.44704 * 0.8) * (e.way.ai ? 1 : 3) * (e.way.rank >= 3 ? 0.9 : 1);

function allowed(e: Edge, dir: 1 | -1): boolean {
  if (!e.way.drive) return false;
  if (!e.way.oneway) return true;
  return dir === 1 ? e.a.arms.find((a) => a.edge === e && a.end === 0)?.outbound !== false : true && e.b.arms.find((a) => a.edge === e && a.end === 1)?.outbound !== false;
}

export function makeRoutePlanner(map: GameMap): Planner {
  void map;
  return (x, z, h, goal, goalS) => {
    const hit = map.roadAt(x, z, h); if (!hit) return null;
    const e0 = hit.edge, along = Math.sin(h) * hit.tx + Math.cos(h) * hit.tz;
    let dir0: 1 | -1 = along >= 0 ? 1 : -1;
    if (!allowed(e0, dir0)) dir0 = (dir0 === 1 ? -1 : 1);
    // the first edge: we can finish it, or (in two-way roads) turn round, which we don't plan for
    const dist = new Map<number, number>(); const prev = new Map<number, number>();
    const heap = new Heap();
    const s0 = sid(e0, dir0);
    const rest0 = dir0 === 1 ? e0.len - hit.s : hit.s;
    dist.set(s0, cost(e0) * (rest0 / e0.len)); heap.push(dist.get(s0)!, s0);
    const states = new Map<number, State>(); states.set(s0, { e: e0, dir: dir0 });
    // turning round where you are is allowed too (a two-way street), at the price of a U-turn: it is the only way out of a dead end you face into
    const back: 1 | -1 = dir0 === 1 ? -1 : 1;
    if (allowed(e0, back)) { const sb = sid(e0, back), rb = back === 1 ? e0.len - hit.s : hit.s; dist.set(sb, cost(e0) * (rb / e0.len) + 45); heap.push(dist.get(sb)!, sb); states.set(sb, { e: e0, dir: back }); }
    const goalIds = [sid(goal, 1), sid(goal, -1)];
    let found = -1;
    // the goal: arriving on the goal edge in either direction (we stop short of where the target is)
    let iter = 0;
    while (heap.size && iter++ < 20000) {
      const top = heap.pop()!;
      const d = dist.get(top.v)!; if (top.k > d + 1e-9) continue;
      const st = states.get(top.v)!;
      if (st.e === goal) {
        // are we on the right side of the goal point? the goal edge is reached at either end, so any state on it will do
        found = top.v; break;
      }
      const out = st.dir === 1 ? st.e.b : st.e.a, inEnd: 0 | 1 = st.dir === 1 ? 1 : 0;
      // a junction with no legal way on (the map is cut off there, or every other street is one-way towards you) lets you turn round
      const legalOn = out.arms.some((a) => a.outbound && !(a.edge === st.e && a.end === inEnd) && allowed(a.edge, a.end === 0 ? 1 : -1));
      for (const arm of out.arms) {
        if (!arm.outbound) continue;
        if (arm.edge === st.e && arm.end === inEnd && out.arms.length > 1 && legalOn) continue;     // no u-turns except where there is no other way
        const nd: 1 | -1 = arm.end === 0 ? 1 : -1;
        if (!allowed(arm.edge, nd)) continue;
        const id = sid(arm.edge, nd);
        const c = d + cost(arm.edge) + (out.signal ? 4 : 0) + (out.arms.length >= 3 && arm.edge.way.rank < st.e.way.rank ? 1.5 : 0) + turnCost(st, arm.edge, nd, out);
        if (c < (dist.get(id) ?? 1e18)) { dist.set(id, c); prev.set(id, top.v); states.set(id, { e: arm.edge, dir: nd }); heap.push(c, id); }
      }
    }
    void goalIds;
    if (found < 0) return null;
    // ---- rebuild the chain
    const chain: State[] = []; for (let id: number | undefined = found; id !== undefined; id = prev.get(id)) chain.push(states.get(id)!);
    chain.reverse();
    const startUturn = chain[0]!.dir !== (along >= 0 ? 1 : -1);
    // ---- the turn at the end of every edge of the chain
    const turnAt: number[] = [];
    for (let i = 0; i < chain.length - 1; i++) turnAt.push(turnBetween(chain[i]!, chain[i + 1]!));
    // ---- lanes: the lane to arrive in on each edge and the lane to be in when it ends (left turns from the left lane, right turns from the right lane)
    const lanesOf = (st: State) => Math.max(1, st.e.way.lanes);
    const laneFor = (st: State, turn: number, cur: number) => { const L = lanesOf(st); return turn === -1 ? 0 : turn === 1 ? L - 1 : Math.min(L - 1, Math.max(0, cur)); };
    const inLane: number[] = [], outLane: number[] = [];
    {
      // the lane the car is in now (counted from the left of its direction of travel)
      const L0 = lanesOf(chain[0]!), w0 = e0.way, off = hit.side * (dir0 === 1 ? 1 : -1);
      let cur = w0.oneway ? Math.floor((off + w0.width / 2) / w0.lw) : Math.floor((off - (w0.turnLane ? w0.lw / 2 : 0)) / w0.lw);
      cur = Math.max(0, Math.min(L0 - 1, cur));
      for (let i = 0; i < chain.length; i++) {
        const st = chain[i]!, L = lanesOf(st);
        if (i === 0) inLane.push(cur);
        else { const t = turnAt[i - 1]!; inLane.push(t === 1 ? L - 1 : t === -1 ? 0 : Math.min(L - 1, outLane[i - 1]!)); }
        // the last edge ends at the kerb side, where you stop
        outLane.push(i < chain.length - 1 ? laneFor(st, turnAt[i]!, inLane[i]!) : L - 1);
      }
    }
    // ---- the route line, in lane: each edge's lane path (with a lane change drawn before a turn that needs one), joined through the junctions by turning curves
    const pts: number[] = [];
    const turns: RouteTurn[] = [];
    let length = 0;
    const add = (px: number, pz: number) => { const n = pts.length; if (n) { const d = Math.hypot(px - pts[n - 2]!, pz - pts[n - 1]!); if (d < 0.05) return; length += d; } pts.push(px, pz); };
    let prevEnd: { x: number; z: number; tx: number; tz: number } | null = null;
    for (let i = 0; i < chain.length; i++) {
      const st = chain[i]!, e = st.e, isGoal = i === chain.length - 1;
      // distances along the edge in its own direction of travel
      const startNode = st.dir === 1 ? e.a : e.b, endNode = st.dir === 1 ? e.b : e.a;
      const t0 = trimAt(e, startNode), t1 = trimAt(e, endNode);
      let from = i === 0 ? (st.dir === 1 ? hit.s : e.len - hit.s) : t0;
      let to = isGoal ? (st.dir === 1 ? goalS : e.len - goalS) : e.len - t1;
      if (i > 0) from = Math.max(from, t0);
      if (!isGoal) to = Math.min(to, e.len - t1);
      if (to < from + 0.5) { to = Math.max(to, from + 0.5); }
      const path = lanePath(st, from, to, inLane[i]!, outLane[i]!);
      // the turn through the junction from the previous edge
      if (prevEnd && path.length >= 4) {
        const P1 = { x: path[0]!, z: path[1]! }, d1x = path[2]! - path[0]!, d1z = path[3]! - path[1]!, l1 = Math.hypot(d1x, d1z) || 1;
        const curve = turnCurve(prevEnd.x, prevEnd.z, prevEnd.tx, prevEnd.tz, P1.x, P1.z, d1x / l1, d1z / l1);
        const prev = chain[i - 1]!, node = prev.dir === 1 ? prev.e.b : prev.e.a, dir = turnAt[i - 1]!;
        const before = length;
        for (let k = 1; k < curve.length / 2 - 1; k++) add(curve[k * 2]!, curve[k * 2 + 1]!);
        const at = before + (length - before) * 0.5;
        // a straight-on junction is only worth a word when the street changes its name there
        const renamed = (st.e.way.name || '') !== (prev.e.way.name || '');
        if (dir !== 0 || (node.arms.length >= 3 && renamed && st.e.way.name)) turns.push({ x: node.x, z: node.z, dir, at: Math.max(0, before - 4), street: st.e.way.name || (st.e.way.cls === 'service' ? 'the private drive' : 'the side street'), node, lane: outLane[i - 1]!, lanes: lanesOf(prev) });
        void at;
      }
      for (let k = 0; k < path.length; k += 2) add(path[k]!, path[k + 1]!);
      const n = path.length;
      if (n >= 4) { const dx = path[n - 2]! - path[n - 4]!, dz = path[n - 1]! - path[n - 3]!, l = Math.hypot(dx, dz) || 1; prevEnd = { x: path[n - 2]!, z: path[n - 1]!, tx: dx / l, tz: dz / l }; }
      void endNode;
    }
    if (pts.length < 4) { pts.length = 0; pts.push(x, z, x + Math.sin(h), z + Math.cos(h)); length = 1; }
    if (startUturn) turns.unshift({ x, z, dir: 2, at: 0, street: e0.way.name || 'this street', node: e0.a, lane: 0, lanes: 1 });
    return { pts, length, turns, edges: chain.map((c) => ({ edge: c.e, dir: c.dir })) };
  };
}

// ------------------------------------------------------------------ helpers for the in-lane route line
/** the heading change from one chain state to the next: -1 left, 0 straight, 1 right, 2 u-turn */
function turnBetween(a: State, b: State): number {
  const tIn = edgeAt(a.e, a.dir === 1 ? a.e.len : 0), tOut = edgeAt(b.e, b.dir === 1 ? 0 : b.e.len);
  const hIn = Math.atan2(tIn.tx * a.dir, tIn.tz * a.dir), hOut = Math.atan2(tOut.tx * b.dir, tOut.tz * b.dir);
  const dh = wrapAngle(hOut - hIn);
  return Math.abs(dh) < 0.45 ? 0 : Math.abs(dh) > 2.6 ? 2 : dh < 0 ? 1 : -1;
}
/** seconds a turn costs a real driver: lefts wait for a gap, rights are quick, straight on is free */
function turnCost(st: State, next: Edge, nd: 1 | -1, node: Node): number {
  if (node.arms.length < 3) return 0;
  const t = turnBetween(st, { e: next, dir: nd });
  return t === -1 ? (node.signal ? 7 : 5) : t === 1 ? 1.5 : t === 2 ? 60 : 0;
}
/** how far the lane paths stop short of a junction (the same trim as the traffic's lane paths) */
function trimAt(e: Edge, node: Node) { return node.deadEnd ? 0 : Math.min(node.clear, e.len * 0.42); }
/** a lane path along an edge between two distances (in its direction of travel), changing lane smoothly before the end when `laneOut` differs */
function lanePath(st: State, from: number, to: number, laneIn: number, laneOut: number): number[] {
  const e = st.e, w = e.way;
  let p = e.p;
  if (st.dir === -1) { const r: number[] = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i]!, p[i + 1]!); p = r; }
  const cum = [0]; for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!));
  const oIn = laneOffset(w, laneIn), oOut = laneOffset(w, laneOut);
  // the lane change happens in the 30 m before the last 18 m of the edge, or in the middle of a short one
  const c1 = Math.max(from, to - 18), c0 = Math.max(from, c1 - 30);
  const offAt = (s: number) => { if (oIn === oOut || c1 <= c0) return oOut; const t = Math.max(0, Math.min(1, (s - c0) / (c1 - c0))); return oIn + (oOut - oIn) * t * t * (3 - 2 * t); };
  const out: number[] = []; const n = Math.max(2, Math.ceil((to - from) / 3));
  for (let i = 0; i <= n; i++) {
    const s = from + ((to - from) * i) / n;
    let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m]! <= s) lo = m; else hi = m; }
    const l = cum[hi]! - cum[lo]! || 1, t = Math.max(0, Math.min(1, (s - cum[lo]!) / l));
    const x0 = p[lo * 2]!, z0 = p[lo * 2 + 1]!, x1 = p[hi * 2]!, z1 = p[hi * 2 + 1]!, tx = (x1 - x0) / l, tz = (z1 - z0) / l;
    const off = offAt(s);
    out.push(x0 + (x1 - x0) * t - tz * off, z0 + (z1 - z0) * t + tx * off);
  }
  return out;
}
/** the curve through a junction from one lane to the next (the same curve the traffic drives) */
function turnCurve(P0x: number, P0z: number, t0x: number, t0z: number, P1x: number, P1z: number, t1x: number, t1z: number): number[] {
  const dx = P1x - P0x, dz = P1z - P0z, dist = Math.hypot(dx, dz);
  const det = t0x * t1z - t0z * t1x;
  let cx = (P0x + P1x) / 2, cz = (P0z + P1z) / 2;
  if (Math.abs(det) > 0.02) {
    const A = (dx * t1z - dz * t1x) / det, B = (t0x * dz - t0z * dx) / det;
    if (A > 0 && B > 0 && A < dist * 2.2 && B < dist * 2.2) { cx = P0x + t0x * A; cz = P0z + t0z * A; }
  }
  const out: number[] = []; const N = Math.max(4, Math.min(24, Math.ceil(dist / 1.2)));
  for (let i = 0; i <= N; i++) { const t = i / N, u = 1 - t; out.push(u * u * P0x + 2 * u * t * cx + t * t * P1x, u * u * P0z + 2 * u * t * cz + t * t * P1z); }
  return out;
}
void offsetPoly;
