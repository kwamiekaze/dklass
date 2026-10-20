/**
 * The GPS: the quickest legal way from where the car is to a place on the map. A Dijkstra over the directed road graph (one-way streets respected, alleys and
 * service roads discouraged), turned into a polyline for the route line and a list of turns for the "In 300 ft turn right onto Newnan St" prompt.
 */
import { edgeAt, wrapAngle, type Edge, type GameMap, type Node } from './map';

export interface RouteTurn { x: number; z: number; /** -1 left, 0 straight, 1 right, 2 u-turn */ dir: number; at: number; street: string; node: Node }
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
      for (const arm of out.arms) {
        if (!arm.outbound) continue;
        if (arm.edge === st.e && arm.end === inEnd && out.arms.length > 1) continue;     // no u-turns except at a dead end
        const nd: 1 | -1 = arm.end === 0 ? 1 : -1;
        if (!allowed(arm.edge, nd)) continue;
        const id = sid(arm.edge, nd);
        const c = d + cost(arm.edge) + (out.signal ? 4 : 0) + (out.arms.length >= 3 && arm.edge.way.rank < st.e.way.rank ? 1.5 : 0);
        if (c < (dist.get(id) ?? 1e18)) { dist.set(id, c); prev.set(id, top.v); states.set(id, { e: arm.edge, dir: nd }); heap.push(c, id); }
      }
    }
    void goalIds;
    if (found < 0) return null;
    // ---- rebuild the chain
    const chain: State[] = []; for (let id: number | undefined = found; id !== undefined; id = prev.get(id)) chain.push(states.get(id)!);
    chain.reverse();
    // ---- polyline: from the car to the end of the first edge, whole edges after, the goal edge up to the goal point
    const pts: number[] = [x, z];
    const turns: RouteTurn[] = [];
    let length = 0, lx = x, lz = z;
    const add = (px: number, pz: number) => { length += Math.hypot(px - lx, pz - lz); lx = px; lz = pz; pts.push(px, pz); };
    const walk = (st: State, from: number, to: number) => {
      // from, to: distances along the edge in its own direction of travel
      const e = st.e;
      const step = 6;
      const a = st.dir === 1 ? from : e.len - from, b = st.dir === 1 ? to : e.len - to;
      const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
      for (let i = 1; i <= n; i++) { const s = a + (b - a) * (i / n); const p = edgeAt(e, s); add(p.x, p.z); }
    };
    for (let i = 0; i < chain.length; i++) {
      const st = chain[i]!;
      const isGoal = i === chain.length - 1;
      const from = i === 0 ? (st.dir === 1 ? hit.s : e0.len - hit.s) : 0;
      const to = isGoal ? (st.dir === 1 ? goalS : goal.len - goalS) : st.e.len;
      if (to > from) walk(st, from, to);
      if (!isGoal) {
        const nx = chain[i + 1]!, node = st.dir === 1 ? st.e.b : st.e.a;
        const tIn = edgeAt(st.e, st.dir === 1 ? st.e.len : 0), tOut = edgeAt(nx.e, nx.dir === 1 ? 0 : nx.e.len);
        const hIn = Math.atan2(tIn.tx * st.dir, tIn.tz * st.dir), hOut = Math.atan2(tOut.tx * nx.dir, tOut.tz * nx.dir);
        const dh = wrapAngle(hOut - hIn);
        const dir = Math.abs(dh) < 0.45 ? 0 : Math.abs(dh) > 2.6 ? 2 : dh < 0 ? 1 : -1;
        if (node.arms.length >= 3 || dir !== 0) turns.push({ x: node.x, z: node.z, dir, at: length, street: nx.e.way.name || (nx.e.way.cls === 'service' ? 'the private drive' : 'the side street'), node });
      }
    }
    return { pts, length, turns, edges: chain.map((c) => ({ edge: c.e, dir: c.dir })) };
  };
}
