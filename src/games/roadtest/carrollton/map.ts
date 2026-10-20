/**
 * Carrollton, Georgia, from OpenStreetMap: the road network, the buildings, the rail line and the traffic controls (signals, stop signs, crosswalks, rail crossings)
 * of the real streets around Adamson Square. The raw file (carrollton.json) is compact on purpose: every polyline is one absolute point then deltas, in decimetres
 * east and north of the map origin. This module turns it into world metres (x east, z SOUTH, so north is -z the way the 3D scene looks), builds the road graph
 * the traffic and the rules use, and answers "where is this point on the road network".
 *
 * Map data (c) OpenStreetMap contributors, ODbL. The roads follow the real centrelines; the lane counts and speed limits are the ones mapped in OSM,
 * with the usual Georgia defaults where the map says nothing.
 */
import raw from './carrollton.json';

export const MPH = 0.44704;
export interface Pt { x: number; z: number }

// ------------------------------------------------------------------------------------------------ road classes
interface ClassSpec { rank: number; lanes: number; mph: number; lw: number; oneway?: boolean; drive: boolean; ai: boolean }
const CLS: Record<string, ClassSpec> = {
  primary: { rank: 5, lanes: 4, mph: 40, lw: 3.5, drive: true, ai: true },
  primary_link: { rank: 4, lanes: 1, mph: 30, lw: 3.6, oneway: true, drive: true, ai: true },
  secondary: { rank: 4, lanes: 2, mph: 35, lw: 3.4, drive: true, ai: true },
  secondary_link: { rank: 3, lanes: 1, mph: 25, lw: 3.6, oneway: true, drive: true, ai: true },
  tertiary: { rank: 3, lanes: 2, mph: 30, lw: 3.3, drive: true, ai: true },
  unclassified: { rank: 2, lanes: 2, mph: 30, lw: 3.1, drive: true, ai: true },
  residential: { rank: 2, lanes: 2, mph: 25, lw: 3.1, drive: true, ai: true },
  service: { rank: 1, lanes: 2, mph: 15, lw: 2.7, drive: true, ai: false },
  pedestrian: { rank: 0, lanes: 2, mph: 5, lw: 2.2, drive: false, ai: false },
};

export interface Way {
  id: number; cls: string; name: string; ref: string; rank: number;
  /** polyline, flat [x0, z0, x1, z1, ...] in metres */
  p: number[];
  oneway: boolean;
  /** lanes in each direction (a one-way road: its lanes) */
  lanes: number;
  /** a shared centre turn lane (odd lane count, two-way) */
  turnLane: boolean;
  lw: number;
  /** full pavement width */
  width: number;
  mph: number;
  drive: boolean; ai: boolean;
  alley: boolean;
}

export interface Arm { edge: Edge; /** 0: the edge starts here, 1: it ends here */ end: 0 | 1; /** bearing leaving the node (radians, 0 = +z, clockwise like the car heading) */ bearing: number; /** can traffic arrive from this arm */ inbound: boolean; outbound: boolean }
export interface Node {
  id: number; x: number; z: number; arms: Arm[];
  signal: boolean; phaseOffset: number;
  /** the radius of the junction box: cars wait outside it, the stop lines sit on it */
  clear: number;
  rank: number;
  deadEnd: boolean;
  /** phase of each arm, filled for signalised nodes */
  rail?: boolean;
}
export interface Edge {
  id: number; way: Way; a: Node; b: Node;
  /** polyline from a to b, flat */
  p: number[]; cum: number[]; len: number;
  /** a stop sign on arrivals at the end (index 0: at a, 1: at b) */
  stop: [boolean, boolean];
  /** the signal phase (0 or 1) for arrivals at a / b, -1 none */
  phase: [number, number];
  /** crosswalks on this edge: distances from a */
  walks: number[];
}

export interface Building { id: number; p: number[]; h: number; color: number; roof: number; name?: string; kind?: string; area: number; cx: number; cz: number; gable: boolean; landmark?: string }
export interface Crossing { x: number; z: number; kind: string; signal: boolean; ang: number }
export interface RailLine { p: number[]; abandoned: boolean }
export interface LevelX { x: number; z: number; edge: Edge; s: number; ang: number; gates: boolean }
export interface Lot { p: number[] }

// ------------------------------------------------------------------------------------------------ decoding
const ORIGIN = raw.o as [number, number];
export const ORIGIN_LATLON = { lat: ORIGIN[0], lon: ORIGIN[1] };
function dec(p: string): number[] {
  const out: number[] = []; let x = 0, y = 0, i = 0;
  for (const t of p.split(' ')) {
    const c = t.indexOf(','); const a = +t.slice(0, c), b = +t.slice(c + 1);
    if (i++ === 0) { x = a; y = b; } else { x += a; y += b; }
    out.push(x / 10, -y / 10);
  }
  return out;
}
const hash = (n: number) => { let h = (n | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const rand01 = hash;

function mphOf(s: string | undefined, d: number) { if (!s) return d; const m = /(\d+)/.exec(s); return m ? +m[1]! : d; }

// ------------------------------------------------------------------------------------------------ the map
export interface GameMap {
  ways: Way[]; nodes: Node[]; edges: Edge[]; buildings: Building[]; lots: Lot[]; rails: RailLine[]; crossings: Crossing[]; levelXs: LevelX[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** segment grid for "where is this point" queries */
  grid: Map<number, number[]>; segEdge: Edge[]; segIdx: number[];
  /** building wall segments grid for collisions: each entry is [x0,z0,x1,z1] flat */
  wallGrid: Map<number, number[]>;
  nearestNode(x: number, z: number, maxD?: number): Node | null;
  roadAt(x: number, z: number, heading?: number): RoadHit | null;
  walls(x: number, z: number): number[] | undefined;
}
export interface RoadHit { edge: Edge; seg: number; s: number; t: number; dist: number; /** signed: >0 = to the right of the a->b direction */ side: number; tx: number; tz: number; px: number; pz: number; inside: boolean }

const CELL = 24;
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
export const cellOf = (v: number) => Math.floor(v / CELL);
export const cellKey = (x: number, z: number) => key(cellOf(x), cellOf(z));

let cached: GameMap | null = null;
export function loadMap(): GameMap {
  if (cached) return cached;
  // ---- ways
  const ways: Way[] = [];
  for (const r of raw.roads as { i: number; h: string; p: string; n?: string; r?: string; s?: string; l?: number; ow?: string; sv?: string }[]) {
    const c = CLS[r.h]; if (!c) continue;
    const p = dec(r.p); if (p.length < 4) continue;
    const oneway = r.ow === 'yes' || !!c.oneway;
    const total = r.l && r.l > 0 ? r.l : (oneway ? c.lanes : c.lanes);
    let lanes = oneway ? Math.max(1, total) : Math.max(1, Math.floor(total / 2));
    const turnLane = !oneway && total % 2 === 1 && total >= 3;
    if (!oneway && total === 1) lanes = 1;
    const lw = c.lw;
    const width = oneway ? lanes * lw : (lanes * 2 + (turnLane ? 1 : 0)) * lw;
    ways.push({ id: r.i, cls: r.h, name: r.n ?? '', ref: r.r ?? '', rank: c.rank, p, oneway, lanes, turnLane, lw, width, mph: mphOf(r.s, c.mph), drive: c.drive, ai: c.ai && r.sv !== 'alley' && r.sv !== 'driveway' && r.sv !== 'parking_aisle', alley: r.sv === 'alley' });
  }
  // ---- nodes: a vertex is a junction when two ways share it, a way ends there, or it is the join of two different ways
  const nk = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
  const deg = new Map<string, { x: number; z: number; n: number; ways: Set<number> }>();
  for (const w of ways) {
    if (!w.drive) continue;
    for (let i = 0; i < w.p.length; i += 2) {
      const k = nk(w.p[i]!, w.p[i + 1]!);
      let d = deg.get(k); if (!d) { d = { x: w.p[i]!, z: w.p[i + 1]!, n: 0, ways: new Set() }; deg.set(k, d); }
      d.n += (i === 0 || i === w.p.length - 2) ? 1 : 2; d.ways.add(w.id);
    }
  }
  const nodes: Node[] = []; const nodeOf = new Map<string, Node>();
  const mkNode = (x: number, z: number) => {
    const k = nk(x, z); let n = nodeOf.get(k);
    if (!n) { n = { id: nodes.length, x, z, arms: [], signal: false, phaseOffset: 0, clear: 6, rank: 0, deadEnd: false }; nodes.push(n); nodeOf.set(k, n); }
    return n;
  };
  for (const [k, d] of deg) if (d.n >= 3 || d.n === 1 || d.ways.size > 1) mkNode(d.x, d.z), void k;
  // ---- edges: cut every way at its junction vertices
  const edges: Edge[] = [];
  for (const w of ways) {
    if (!w.drive) continue;
    let startIdx = 0; let startNode = nodeOf.get(nk(w.p[0]!, w.p[1]!))!;
    for (let i = 2; i < w.p.length; i += 2) {
      const n = nodeOf.get(nk(w.p[i]!, w.p[i + 1]!));
      if (!n && i < w.p.length - 2) continue;
      const end = n ?? mkNode(w.p[i]!, w.p[i + 1]!);
      const p = w.p.slice(startIdx, i + 2);
      if (p.length >= 4) {
        const cum = [0]; for (let k = 2; k < p.length; k += 2) cum.push(cum[cum.length - 1]! + Math.hypot(p[k]! - p[k - 2]!, p[k + 1]! - p[k - 1]!));
        const len = cum[cum.length - 1]!;
        if (len > 0.5) {
          const e: Edge = { id: edges.length, way: w, a: startNode, b: end, p, cum, len, stop: [false, false], phase: [-1, -1], walks: [] };
          edges.push(e);
        }
      }
      startIdx = i; startNode = end;
    }
  }
  const bearing = (dx: number, dz: number) => Math.atan2(dx, dz);
  for (const e of edges) {
    const look = Math.min(8, e.len * 0.5);
    const at = (s: number) => pointOnPoly(e.p, e.cum, s);
    const a0 = at(0), a1 = at(look), b0 = at(e.len), b1 = at(e.len - look);
    e.a.arms.push({ edge: e, end: 0, bearing: bearing(a1.x - a0.x, a1.z - a0.z), inbound: true, outbound: true });
    e.b.arms.push({ edge: e, end: 1, bearing: bearing(b1.x - b0.x, b1.z - b0.z), inbound: true, outbound: true });
    // one-way roads: only one direction is allowed
    if (e.way.oneway) { const [aa, bb] = [e.a.arms[e.a.arms.length - 1]!, e.b.arms[e.b.arms.length - 1]!]; aa.inbound = false; bb.outbound = false; }
  }
  // junction box size from the widest road that meets there
  for (const n of nodes) {
    let wmax = 0, rank = 0; for (const a of n.arms) { wmax = Math.max(wmax, a.edge.way.width); rank = Math.max(rank, a.edge.way.rank); }
    n.rank = rank; n.deadEnd = n.arms.length === 1;
    n.clear = n.arms.length >= 3 ? Math.max(6.5, wmax * 0.5 + 3.2) : Math.max(4, wmax * 0.5 + 1.5);
  }

  // ---- traffic controls
  const pts = raw.pts as { k: string; x: number; y: number; d?: string; c?: string; cs?: string; g?: number }[];
  const nearestVertex = (x: number, z: number, maxD: number) => {
    let best: { e: Edge; i: number; d: number } | null = null;
    for (const e of edges) {
      for (let i = 0; i < e.p.length; i += 2) {
        const d = Math.hypot(e.p[i]! - x, e.p[i + 1]! - z); if (d < maxD && (!best || d < best.d)) best = { e, i, d };
      }
    }
    return best;
  };
  const nodeNear = (x: number, z: number, maxD: number, ok?: (n: Node) => boolean) => { let b: Node | null = null, bd = maxD; for (const n of nodes) { if (ok && !ok(n)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = n; } } return b; };
  const crossings: Crossing[] = []; const levelXs: LevelX[] = [];
  for (const q of pts) {
    const x = q.x / 10, z = -q.y / 10;
    if (q.k === 'traffic_signals') {
      const n = nodeNear(x, z, 25, (m) => m.arms.length >= 3); if (n) n.signal = true;
    }
  }
  // signal phases: the busiest road gets phase 0, the cross streets phase 1
  for (const n of nodes) {
    if (!n.signal) continue;
    let main = n.arms[0]!; for (const a of n.arms) if (a.edge.way.rank > main.edge.way.rank || (a.edge.way.rank === main.edge.way.rank && a.edge.way.width > main.edge.way.width)) main = a;
    for (const a of n.arms) {
      let d = Math.abs(a.bearing - main.bearing) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
      a.edge.phase[a.end] = d < 0.62 ? 0 : 1;
    }
    n.phaseOffset = hash(n.id * 31 + 7) * 40;
  }
  for (const q of pts) {
    const x = q.x / 10, z = -q.y / 10;
    if (q.k === 'stop') {
      const v = nearestVertex(x, z, 4); if (!v) continue;
      const vx = v.e.p[v.i]!, vz = v.e.p[v.i + 1]!;
      // every edge that has a vertex at this spot; the stop belongs to the minor road when roads of different rank meet here
      const hits: { e: Edge; i: number }[] = [];
      for (const e of edges) for (let i = 0; i < e.p.length; i += 2) if (Math.hypot(e.p[i]! - vx, e.p[i + 1]! - vz) < 0.35) hits.push({ e, i });
      let lo = 99, hi = 0; for (const h of hits) { lo = Math.min(lo, h.e.way.rank); hi = Math.max(hi, h.e.way.rank); }
      const fwd = q.d !== 'backward', bwd = q.d !== 'forward';
      for (const h of hits) {
        if (hi > lo && h.e.way.rank !== lo) continue;
        const sV = h.e.cum[h.i / 2]!;
        if (fwd && sV > 0 && h.e.len - sV < 40) h.e.stop[1] = true;
        if (bwd && sV < h.e.len && sV < 40) h.e.stop[0] = true;
      }
    } else if (q.k === 'crossing') {
      const v = nearestVertexSeg(edges, x, z, 6); if (!v) continue;
      const c = q.c ?? 'unmarked';
      crossings.push({ x: v.px, z: v.pz, kind: c, signal: c === 'traffic_signals' || q.cs === 'yes', ang: Math.atan2(v.tx, v.tz) });
      v.e.walks.push(v.s);
    } else if (q.k === 'level_crossing') {
      const v = nearestVertexSeg(edges, x, z, 7); if (!v) continue;
      levelXs.push({ x: v.px, z: v.pz, edge: v.e, s: v.s, ang: Math.atan2(v.tx, v.tz), gates: !!q.g });
    }
  }
  // a stop sign at a node that already has a signal is pointless; and a junction that is all residential gets no implied control
  for (const e of edges) { if (e.a.signal) e.stop[0] = false; if (e.b.signal) e.stop[1] = false; }

  // ---- buildings and lots
  const buildings: Building[] = []; const lots: Lot[] = [];
  const WALLS = [0xb4553f, 0xc9a77f, 0xd9d2c3, 0xa8a9ad, 0x8c5a45, 0xcbb894, 0xe4dccb, 0x9b6b52, 0xbfbdb5, 0x7f8f9a];
  const ROOFS = [0x5a504a, 0x47423e, 0x6a5a50, 0x3f464d, 0x72675c];
  for (const [i, b] of (raw.bld as { p: string; n?: string; a?: string; sh?: string; h?: number }[]).entries()) {
    const p = dec(b.p); if (p.length < 6) continue;
    if (b.a === 'parking') { lots.push({ p }); continue; }
    let area = 0, cx = 0, cz = 0; const n = p.length / 2;
    for (let k = 0; k < n; k++) { const j = (k + 1) % n; const cr = p[k * 2]! * p[j * 2 + 1]! - p[j * 2]! * p[k * 2 + 1]!; area += cr; cx += (p[k * 2]! + p[j * 2]!) * cr; cz += (p[k * 2 + 1]! + p[j * 2 + 1]!) * cr; }
    area *= 0.5; if (Math.abs(area) < 6) continue; cx /= 6 * area; cz /= 6 * area;
    const A = Math.abs(area), r = hash(i * 17 + 3);
    let h = b.h ?? 0;
    if (!h) {
      if (b.a === 'shelter' || b.a === 'toilets') h = 3;
      else if (A < 70) h = 3.2 + r * 1.2;
      else if (A < 260) h = 4.6 + r * 2.2;
      else if (A < 900) h = 5.5 + r * 3.5;
      else h = 7 + r * 6;
    }
    const house = A >= 70 && A < 330 && n === 4 && !b.n && !b.sh && !b.a;
    const col = house ? [0xd9d2c3, 0xcbb894, 0xe4dccb, 0xa9b4a0, 0x9fb0be, 0xbfa58e, 0xb4553f][Math.floor(r * 7)]! : WALLS[Math.floor(r * WALLS.length)]!;
    buildings.push({ id: i, p, h, color: col, roof: ROOFS[Math.floor(hash(i * 5 + 1) * ROOFS.length)]!, name: b.n, kind: b.a ?? b.sh, area: A, cx, cz, gable: house, landmark: b.n === 'Carroll County Courthouse' ? 'courthouse' : undefined });
  }
  const rails: RailLine[] = (raw.rail as { r: string; p: string }[]).map((r) => ({ p: dec(r.p), abandoned: r.r !== 'rail' }));

  // ---- spatial indexes
  const grid = new Map<number, number[]>(); const segEdge: Edge[] = []; const segIdx: number[] = [];
  const addSeg = (x0: number, z0: number, x1: number, z1: number, id: number) => {
    const c0 = cellOf(Math.min(x0, x1) - 8), c1 = cellOf(Math.max(x0, x1) + 8), r0 = cellOf(Math.min(z0, z1) - 8), r1 = cellOf(Math.max(z0, z1) + 8);
    for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) { const k = key(cx, cz); let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(id); }
  };
  for (const e of edges) for (let i = 0; i + 3 < e.p.length; i += 2) { const id = segEdge.length; segEdge.push(e); segIdx.push(i / 2); addSeg(e.p[i]!, e.p[i + 1]!, e.p[i + 2]!, e.p[i + 3]!, id); }
  const wallGrid = new Map<number, number[]>();
  for (const b of buildings) {
    const n = b.p.length / 2;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n, x0 = b.p[k * 2]!, z0 = b.p[k * 2 + 1]!, x1 = b.p[j * 2]!, z1 = b.p[j * 2 + 1]!;
      const c0 = cellOf(Math.min(x0, x1) - 2), c1 = cellOf(Math.max(x0, x1) + 2), r0 = cellOf(Math.min(z0, z1) - 2), r1 = cellOf(Math.max(z0, z1) + 2);
      for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) { const kk = key(cx, cz); let a = wallGrid.get(kk); if (!a) { a = []; wallGrid.set(kk, a); } a.push(x0, z0, x1, z1); }
    }
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const e of edges) for (let i = 0; i < e.p.length; i += 2) { x0 = Math.min(x0, e.p[i]!); x1 = Math.max(x1, e.p[i]!); z0 = Math.min(z0, e.p[i + 1]!); z1 = Math.max(z1, e.p[i + 1]!); }

  const map: GameMap = {
    ways, nodes, edges, buildings, lots, rails, crossings, levelXs, bounds: { x0, x1, z0, z1 }, grid, segEdge, segIdx, wallGrid,
    nearestNode: (x, z, maxD = 40) => nodeNear(x, z, maxD),
    walls: (x, z) => wallGrid.get(key(cellOf(x), cellOf(z))),
    roadAt: (x, z, heading) => roadAtImpl(map, x, z, heading),
  };
  cached = map;
  return map;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
export function pointOnPoly(p: number[], cum: number[], s: number): { x: number; z: number; tx: number; tz: number; seg: number } {
  const n = cum.length;
  if (s <= 0) { const dx = p[2]! - p[0]!, dz = p[3]! - p[1]!, l = Math.hypot(dx, dz) || 1; return { x: p[0]!, z: p[1]!, tx: dx / l, tz: dz / l, seg: 0 }; }
  if (s >= cum[n - 1]!) { const i = (n - 1) * 2, dx = p[i]! - p[i - 2]!, dz = p[i + 1]! - p[i - 1]!, l = Math.hypot(dx, dz) || 1; return { x: p[i]!, z: p[i + 1]!, tx: dx / l, tz: dz / l, seg: n - 2 }; }
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m]! <= s) lo = m; else hi = m; }
  const l = cum[hi]! - cum[lo]!, t = l > 0 ? (s - cum[lo]!) / l : 0;
  const x0 = p[lo * 2]!, z0 = p[lo * 2 + 1]!, x1 = p[hi * 2]!, z1 = p[hi * 2 + 1]!;
  const d = l || 1;
  return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tx: (x1 - x0) / d, tz: (z1 - z0) / d, seg: lo };
}
function nearestVertexSeg(edges: Edge[], x: number, z: number, maxD: number): { e: Edge; s: number; px: number; pz: number; tx: number; tz: number } | null {
  let best: { e: Edge; s: number; px: number; pz: number; tx: number; tz: number; d: number } | null = null;
  for (const e of edges) {
    for (let i = 0; i + 3 < e.p.length; i += 2) {
      const x0 = e.p[i]!, z0 = e.p[i + 1]!, x1 = e.p[i + 2]!, z1 = e.p[i + 3]!, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      let t = ((x - x0) * dx + (z - z0) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < maxD && (!best || d < best.d)) { const l = Math.sqrt(l2); best = { e, s: e.cum[i / 2]! + t * l, px, pz, tx: dx / l, tz: dz / l, d }; }
    }
  }
  return best;
}
function roadAtImpl(map: GameMap, x: number, z: number, heading?: number): RoadHit | null {
  let best: RoadHit | null = null, bestScore = 1e9;
  const cx = cellOf(x), cz = cellOf(z);
  const fx = heading === undefined ? 0 : Math.sin(heading), fz = heading === undefined ? 0 : Math.cos(heading);
  const seen = new Set<number>();
  const ids = map.grid.get(key(cx, cz)); if (!ids) return null;
  for (const id of ids) {
    if (seen.has(id)) continue; seen.add(id);
    const e = map.segEdge[id]!, si = map.segIdx[id]!, i = si * 2;
    const x0 = e.p[i]!, z0 = e.p[i + 1]!, x1 = e.p[i + 2]!, z1 = e.p[i + 3]!, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
    let t = ((x - x0) * dx + (z - z0) * dz) / l2; t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t, pz = z0 + dz * t, d = Math.hypot(x - px, z - pz), l = Math.sqrt(l2);
    const half = e.way.width / 2;
    const tx = dx / l, tz = dz / l;
        const side = -(x - px) * tz + (z - pz) * tx;      // >0: right of the direction of the polyline (the right-hand normal of (tx,tz) is (-tz,tx))
    let score = Math.max(0, d - half) * 4 + d * 0.05;
    if (heading !== undefined) { const al = Math.abs(fx * tx + fz * tz); score += (1 - al) * 1.2; }
    if (e.way.rank === 0) score += 3;
    if (score < bestScore) { bestScore = score; best = { edge: e, seg: si, s: e.cum[si]! + t * l, t, dist: d, side, tx, tz, px, pz, inside: d <= half + 0.4 }; }
  }
  return best;
}

export const wrapAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** the unit tangent of an edge at distance s */
export const edgeAt = (e: Edge, s: number) => pointOnPoly(e.p, e.cum, s);

/** Offset a polyline sideways (positive: to the right of its direction of travel) with mitred joins. */
export function offsetPoly(p: number[], off: number): number[] {
  const n = p.length / 2, out: number[] = [];
  for (let i = 0; i < n; i++) {
    let nx = 0, nz = 0;
    if (i > 0) { const dx = p[i * 2]! - p[i * 2 - 2]!, dz = p[i * 2 + 1]! - p[i * 2 - 1]!, l = Math.hypot(dx, dz) || 1; nx += -dz / l; nz += dx / l; }
    if (i < n - 1) { const dx = p[i * 2 + 2]! - p[i * 2]!, dz = p[i * 2 + 3]! - p[i * 2 + 1]!, l = Math.hypot(dx, dz) || 1; nx += -dz / l; nz += dx / l; }
    // (nx,nz) is the sum of the unit right-hand normals of the neighbouring segments
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    // miter length: 1/cos(half the turn)
    let k = 1;
    if (i > 0 && i < n - 1) { const ax = p[i * 2]! - p[i * 2 - 2]!, az = p[i * 2 + 1]! - p[i * 2 - 1]!, bx = p[i * 2 + 2]! - p[i * 2]!, bz = p[i * 2 + 3]! - p[i * 2 + 1]!; const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; const c = (ax * bx + az * bz) / (la * lb); k = Math.min(1.8, 1 / Math.max(0.55, Math.sqrt((1 + c) / 2))); }
    out.push(p[i * 2]! + nx * off * k, p[i * 2 + 1]! + nz * off * k);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ which building covers a point
let bGrid: Map<number, Building[]> | null = null; let bGridFor: GameMap | null = null;
export function buildingAt(map: GameMap, x: number, z: number, pad = 0): Building | null {
  if (bGridFor !== map || !bGrid) {
    bGrid = new Map(); bGridFor = map;
    for (const b of map.buildings) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < b.p.length; i += 2) { x0 = Math.min(x0, b.p[i]!); x1 = Math.max(x1, b.p[i]!); z0 = Math.min(z0, b.p[i + 1]!); z1 = Math.max(z1, b.p[i + 1]!); }
      for (let cx = cellOf(x0 - 4); cx <= cellOf(x1 + 4); cx++) for (let cz = cellOf(z0 - 4); cz <= cellOf(z1 + 4); cz++) { const k = key(cx, cz); let a = bGrid.get(k); if (!a) { a = []; bGrid.set(k, a); } a.push(b); }
    }
  }
  const list = bGrid.get(cellKey(x, z)); if (!list) return null;
  for (const b of list) {
    const p = b.p; let inside = false;
    for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) { const xi = p[i * 2]!, zi = p[i * 2 + 1]!, xj = p[j * 2]!, zj = p[j * 2 + 1]!; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
    if (inside) return b;
    if (pad > 0) {
      // within `pad` metres of a wall
      for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
        const x0 = p[j * 2]!, z0 = p[j * 2 + 1]!, x1 = p[i * 2]!, z1 = p[i * 2 + 1]!, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)); if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < pad) return b;
      }
    }
  }
  return null;
}
