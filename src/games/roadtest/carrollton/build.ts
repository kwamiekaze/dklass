/**
 * The geometry of Carrollton, built once from the map: asphalt ribbons, junction pads, sidewalks and kerbs, lane markings, stop lines, crosswalks, buildings with
 * windows, parking lots, the railroad. Everything is merged into a handful of meshes, so the whole town costs a few dozen draw calls.
 * World metres, x east, z south, y up. Map data (c) OpenStreetMap contributors.
 */
import * as THREE from 'three';
import { buildingAt, offsetPoly, pointOnPoly, rand01, type Building, type Edge, type GameMap, type Node } from './map';

export class Acc {
  pos: number[] = []; nor: number[] = []; col: number[] = []; uv: number[] = []; idx: number[] = [];
  get n() { return this.pos.length / 3; }
  v(x: number, y: number, z: number, c: THREE.Color, u = 0, v = 0, nx = 0, ny = 1, nz = 0) { this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(c.r, c.g, c.b); this.uv.push(u, v); return this.n - 1; }
  /** does the winding a,b,c face the way the vertex normal of a points? (DoubleSide lighting flips the normal on a back face, so a wrong winding would light the surface black) */
  private faces(a: number, b: number, c: number) {
    const p = this.pos, n = this.nor;
    const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!, vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    return nx * n[a * 3]! + ny * n[a * 3 + 1]! + nz * n[a * 3 + 2]! >= 0;
  }
  quad(a: number, b: number, c: number, d: number) { if (this.faces(a, b, c)) this.idx.push(a, b, c, a, c, d); else this.idx.push(a, c, b, a, d, c); }
  /** both windings, the same normals: a card seen from either side, lit as if it were round (foliage) */
  card(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d, a, c, b, a, d, c); }
  tri(a: number, b: number, c: number) { if (this.faces(a, b, c)) this.idx.push(a, b, c); else this.idx.push(a, c, b); }
  get empty() { return this.idx.length === 0; }
  /** the same mesh cut into square tiles (they share the vertex buffers), so the renderer can skip the tiles that are behind you or far away */
  chunks(cell = 300): THREE.BufferGeometry[] {
    const base = this.geo(); const cells = new Map<string, number[]>(); const p = this.pos, I = this.idx;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i]!, b = I[i + 1]!, c = I[i + 2]!;
      const cx = Math.floor(((p[a * 3]! + p[b * 3]! + p[c * 3]!) / 3) / cell), cz = Math.floor(((p[a * 3 + 2]! + p[b * 3 + 2]! + p[c * 3 + 2]!) / 3) / cell), k = `${cx},${cz}`;
      let l = cells.get(k); if (!l) { l = []; cells.set(k, l); } l.push(a, b, c);
    }
    const out: THREE.BufferGeometry[] = [];
    for (const l of cells.values()) {
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color', 'uv']) g.setAttribute(name, base.getAttribute(name));
      g.setIndex(l);
      const box = new THREE.Box3(); const v = new THREE.Vector3();
      for (const ix of l) { v.set(p[ix * 3]!, p[ix * 3 + 1]!, p[ix * 3 + 2]!); box.expandByPoint(v); }
      g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      out.push(g);
    }
    base.dispose();
    return out;
  }
  geo(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const C = (hex: number | string) => new THREE.Color(hex as THREE.ColorRepresentation);
const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t);

const SIDEWALK = 2.0, KERB = 0.14;

// ------------------------------------------------------------------------------------------------ the roads
export const ROAD_COL: Record<number, THREE.Color> = { 1: C(0x707274), 2: C(0x64676b), 3: C(0x5b5e63), 4: C(0x54575c), 5: C(0x4e5156) };

/** a flat ribbon along a polyline, `hw` each side of it, laid at height y */
function ribbon(a: Acc, p: number[], hw: number, y: number, col: THREE.Color, vScale = 8, off = 0, vStart = 0) {
  const L = offsetPoly(p, off - hw), R = offsetPoly(p, off + hw);
  let s = vStart; const n = p.length / 2; let prevL = -1, prevR = -1;
  for (let i = 0; i < n; i++) {
    if (i) s += Math.hypot(p[i * 2]! - p[i * 2 - 2]!, p[i * 2 + 1]! - p[i * 2 - 1]!);
    const l = a.v(L[i * 2]!, y, L[i * 2 + 1]!, col, 0, s / vScale), r = a.v(R[i * 2]!, y, R[i * 2 + 1]!, col, 1, s / vScale);
    if (i) { a.quad(prevL, prevR, r, l); }
    prevL = l; prevR = r;
  }
}

/** sample a sub-range of an edge's centreline (arc length s0..s1) at about `step` metres, offset sideways by `off` (positive: right of a->b) */
export function sampleEdge(e: Edge, s0: number, s1: number, off: number, step = 2.5): number[] {
  const out: number[] = []; const n = Math.max(1, Math.ceil((s1 - s0) / step));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n, q = pointOnPoly(e.p, e.cum, s);
    out.push(q.x - q.tz * off, q.z + q.tx * off);
  }
  return out;
}

export interface Corner { node: Node; kin: number[]; a1: Node['arms'][number]; a2: Node['arms'][number]; u1: number[]; u2: number[] }
export interface RoadParts { roads: Map<number, Acc>; pads: Map<number, Acc>; side: Acc; paint: { white: Acc; yellow: Acc }; crosswalks: Acc; lots: Acc; corners: Corner[] }

export function buildRoads(map: GameMap): RoadParts {
  const roads = new Map<number, Acc>(); const get = (r: number) => { let a = roads.get(r); if (!a) { a = new Acc(); roads.set(r, a); } return a; };
  const pads = new Map<number, Acc>(); const getPad = (r: number) => { let a = pads.get(r); if (!a) { a = new Acc(); pads.set(r, a); } return a; };
  const side = new Acc(), white = new Acc(), yellow = new Acc(), cross = new Acc(), lots = new Acc();
  // ---- asphalt
  for (const e of map.edges) {
    const w = e.way; if (!w.drive) continue;
    ribbon(get(w.rank), e.p, w.width / 2, 0.0, mix(ROAD_COL[w.rank] ?? ROAD_COL[2]!, C(0x686b6f), rand01(e.id * 7 + 1) * 0.35), 9);
  }
  // junction pads, so the corners where roads of different widths meet are filled
  for (const n of map.nodes) {
    if (n.arms.length < 3) continue;
    let wmax = 0, rk = 0; for (const a of n.arms) { wmax = Math.max(wmax, a.edge.way.width); rk = Math.max(rk, a.edge.way.rank); }
    const r = wmax * 0.5 + 1.4, a = getPad(rk), col = ROAD_COL[rk] ?? ROAD_COL[2]!;
    const c = a.v(n.x, 0, n.z, col, 0.5, 0.5);
    const K = 20; const ring: number[] = [];
    for (let i = 0; i < K; i++) { const t = (i / K) * Math.PI * 2; ring.push(a.v(n.x + Math.cos(t) * r, 0, n.z + Math.sin(t) * r, col, 0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5)); }
    for (let i = 0; i < K; i++) a.tri(c, ring[i]!, ring[(i + 1) % K]!);
  }
  // ---- parking lots
  for (const lot of map.lots) {
    const tris = THREE.ShapeUtils.triangulateShape(pairs(lot.p), []);
    const base = lots.n; const col = C(0x4d5054);
    for (let i = 0; i < lot.p.length; i += 2) lots.v(lot.p[i]!, 0.0, lot.p[i + 1]!, col, lot.p[i]! / 8, lot.p[i + 1]! / 8);
    for (const t of tris) lots.tri(base + t[0]!, base + t[1]!, base + t[2]!);
  }
  const corners = buildSidewalks(map, side);
  buildMarkings(map, white, yellow);
  buildCrosswalks(map, cross);
  return { roads, pads, side, paint: { white, yellow }, crosswalks: cross, lots, corners };
}
const pairs = (p: number[]) => { const o: THREE.Vector2[] = []; for (let i = 0; i < p.length; i += 2) o.push(new THREE.Vector2(p[i], p[i + 1])); return o; };

// ------------------------------------------------------------------------------------------------ sidewalks
function buildSidewalks(map: GameMap, a: Acc): Corner[] {
  const top = C(0xb9b8b2), kerb = C(0xa3a29c), grass = C(0x7a9a58);
  // for every arm of every junction: how far from the node the sidewalks on its two sides begin
  const trim = new Map<string, number>();            // `${edge}:${end}:${side}` side: 1 right of a->b, -1 left
  const key = (e: Edge, end: number, sd: number) => `${e.id}:${end}:${sd}`;
  const corners: { node: Node; k: number[]; kin: number[]; e1o: number[]; e2o: number[]; a1: Node['arms'][number]; a2: Node['arms'][number]; u1: number[]; u2: number[] }[] = [];
  for (const n of map.nodes) {
    if (n.arms.length < 2) continue;
    const arms = [...n.arms].sort((x, y) => x.bearing - y.bearing);
    const hwOf = (ar: typeof arms[number]) => ar.edge.way.width / 2;
    for (const ar of arms) for (const sd of [1, -1]) trim.set(key(ar.edge, ar.end, sd), n.arms.length >= 3 ? 1.5 : 0);
    if (arms.length < 3) continue;
    for (let i = 0; i < arms.length; i++) {
      const a1 = arms[i]!, a2 = arms[(i + 1) % arms.length]!;
      if (!a1.edge.way.name && a1.edge.way.rank < 3) continue;
      let dh = a2.bearing - a1.bearing; if (dh <= 0) dh += Math.PI * 2;
      // two arms that run straight on through the junction: the sidewalk on that side carries on unbroken
      if (Math.abs(dh - Math.PI) < 0.35) { trim.set(key(a1.edge, a1.end, a1.end === 0 ? -1 : 1), 0); trim.set(key(a2.edge, a2.end, a2.end === 0 ? 1 : -1), 0); continue; }
      if (dh < 0.55 || dh > Math.PI + 0.35) continue;
      const u1 = [Math.sin(a1.bearing), Math.cos(a1.bearing)], u2 = [Math.sin(a2.bearing), Math.cos(a2.bearing)];
      // n1: left of u1 (towards arm 2); n2: right of u2 (towards arm 1)
      const n1 = [u1[1]!, -u1[0]!], n2 = [-u2[1]!, u2[0]!];
      const solve = (d1: number, d2: number) => {
        // find X with (X-node).n1 = d1 and (X-node).n2 = d2
        const det = n1[0]! * n2[1]! - n1[1]! * n2[0]!; if (Math.abs(det) < 1e-4) return null;
        return [(d1 * n2[1]! - n1[1]! * d2) / det, (n1[0]! * d2 - d1 * n2[0]!) / det];
      };
      const d1 = hwOf(a1) + KERB, d2 = hwOf(a2) + KERB;
      const kin = solve(d1, d2), kout = solve(d1 + SIDEWALK, d2 + SIDEWALK); if (!kin || !kout) continue;
      // along-distance (on each arm) of the kerb corner
      const al1 = kin[0]! * u1[0]! + kin[1]! * u1[1]!, al2 = kin[0]! * u2[0]! + kin[1]! * u2[1]!;
      if (al1 < 0 || al2 < 0 || al1 > 40 || al2 > 40) continue;
      // arm 1's sidewalk on its left (towards 2); the side index is for the polyline a->b: arm end 0 points away from a, so left of u is left of a->b; end 1 points back along it, so left of u is right of a->b
      const s1 = a1.end === 0 ? -1 : 1, s2 = a2.end === 0 ? 1 : -1;
      trim.set(key(a1.edge, a1.end, s1), al1); trim.set(key(a2.edge, a2.end, s2), al2);
      const e1o = [u1[0]! * al1 + n1[0]! * (d1 + SIDEWALK), u1[1]! * al1 + n1[1]! * (d1 + SIDEWALK)];
      const e2o = [u2[0]! * al2 + n2[0]! * (d2 + SIDEWALK), u2[1]! * al2 + n2[1]! * (d2 + SIDEWALK)];
      corners.push({ node: n, k: kout, kin, e1o, e2o, a1, a2, u1, u2 });
    }
  }
  for (const c of corners) {
    const { node, kin, k, e1o, e2o } = c; const y = KERB;
    const A = a.v(node.x + kin[0]!, y, node.z + kin[1]!, top, 0, 0), B = a.v(node.x + e1o[0]!, y, node.z + e1o[1]!, top, 0, 1), Cc = a.v(node.x + k[0]!, y, node.z + k[1]!, top, 1, 1), D = a.v(node.x + e2o[0]!, y, node.z + e2o[1]!, top, 1, 0);
    a.quad(A, B, Cc, D);
  }
  for (const e of map.edges) {
    const w = e.way; if (!w.drive || !w.ai || (!w.name && w.rank < 3) || w.alley) continue;
    const hw = w.width / 2;
    for (const sd of [1, -1] as const) {
      const t0 = trim.get(key(e, 0, sd)) ?? 0, t1 = trim.get(key(e, 1, sd)) ?? 0;
      const s0 = t0, s1 = e.len - t1; if (s1 - s0 < 3) continue;
      const pts = sampleEdge(e, s0, s1, sd * (hw + KERB), 3), n = pts.length / 2;
      const outer = sampleEdge(e, s0, s1, sd * (hw + KERB + SIDEWALK), 3), inner = sampleEdge(e, s0, s1, sd * hw, 3);
      let prev: number[] | null = null; let s = 0;
      for (let i = 0; i < n; i++) {
        if (i) s += Math.hypot(pts[i * 2]! - pts[i * 2 - 2]!, pts[i * 2 + 1]! - pts[i * 2 - 1]!);
        const col = mix(top, grass, 0);
        // top surface (kerb edge .. outer edge), and the vertical kerb face (road level .. kerb height)
        const v0 = a.v(pts[i * 2]!, KERB, pts[i * 2 + 1]!, col, 0, s / 4), v1 = a.v(outer[i * 2]!, KERB, outer[i * 2 + 1]!, col, 1, s / 4);
        const f0 = a.v(inner[i * 2]!, 0, inner[i * 2 + 1]!, kerb, 0, s / 4, -sd, 0, 0), f1 = a.v(pts[i * 2]!, KERB, pts[i * 2 + 1]!, kerb, 1, s / 4, -sd, 0, 0);
        if (prev) { a.quad(prev[0]!, prev[1]!, v1, v0); a.quad(prev[2]!, prev[3]!, f1, f0); }
        prev = [v0, v1, f0, f1];
      }
    }
  }
  return corners.map((c) => ({ node: c.node, kin: c.kin, a1: c.a1, a2: c.a2, u1: c.u1, u2: c.u2 }));
}

// ------------------------------------------------------------------------------------------------ lane markings
function buildMarkings(map: GameMap, white: Acc, yellow: Acc) {
  const W = C(0xe9e9e4), Y = C(0xe5b81c); const y = 0.0;
  const solid = (acc: Acc, col: THREE.Color, e: Edge, off: number, s0: number, s1: number, width = 0.13) => {
    if (s1 - s0 < 0.6) return; const pts = sampleEdge(e, s0, s1, off, 3);
    if (pts.length < 4) return; ribbon(acc, pts, width / 2, y, col, 4);
  };
  const dashed = (acc: Acc, col: THREE.Color, e: Edge, off: number, s0: number, s1: number, dash = 3, gap = 6, width = 0.13) => {
    for (let s = s0; s + dash <= s1; s += dash + gap) { const pts = sampleEdge(e, s, s + dash, off, 1.6); ribbon(acc, pts, width / 2, y, col, 4); }
  };
  for (const e of map.edges) {
    const w = e.way; if (!w.drive || w.rank < 2 || !w.ai || w.alley) continue;
    const s0 = e.a.arms.length >= 3 ? e.a.clear + 0.6 : 1.5, s1 = e.len - (e.b.arms.length >= 3 ? e.b.clear + 0.6 : 1.5);
    if (s1 - s0 < 4) continue;
    const hw = w.width / 2, lw = w.lw;
    if (w.oneway) {
      for (let k = 1; k < w.lanes; k++) dashed(white, W, e, -hw + k * lw, s0, s1);
      if (w.rank >= 3) { solid(white, W, e, -hw + 0.25, s0, s1); solid(white, W, e, hw - 0.25, s0, s1); }
      continue;
    }
    const half = w.turnLane ? lw / 2 : 0;
    if (w.rank >= 3 || w.cls === 'unclassified') {
      if (w.turnLane) {
        for (const sd of [-1, 1]) { solid(yellow, Y, e, sd * (half + 0.1), s0, s1); dashed(yellow, Y, e, sd * (half - 0.1), s0, s1, 3, 6); }
      } else { solid(yellow, Y, e, -0.11, s0, s1); solid(yellow, Y, e, 0.11, s0, s1); }
    }
    for (let k = 1; k < w.lanes; k++) for (const sd of [-1, 1]) dashed(white, W, e, sd * (half + k * lw), s0, s1);
    if (w.rank >= 3) { solid(white, W, e, -hw + 0.25, s0, s1); solid(white, W, e, hw - 0.25, s0, s1); }
  }
  // stop lines at stop signs and signals
  for (const e of map.edges) {
    const w = e.way; if (!w.drive || !w.ai) continue;
    for (const end of [0, 1] as const) {
      const node = end === 1 ? e.b : e.a; if (node.arms.length < 3) continue;
      if (!(node.signal || e.stop[end])) continue;
      const arm = node.arms.find((a) => a.edge === e && a.end === end); if (arm && !arm.inbound) continue;
      const s = end === 1 ? e.len - node.clear - 0.1 : node.clear + 0.1, hw = w.width / 2, lw = w.lw;
      const sd = end === 1 ? 1 : -1;            // the side of the polyline this approach drives on
      const inner = w.oneway ? -hw + 0.25 : (w.turnLane ? lw / 2 : 0) + 0.12, outer = hw - 0.25;
      const q = pointOnPoly(e.p, e.cum, s), tx = q.tx, tz = q.tz;
      const lo = w.oneway ? inner : Math.min(sd * inner, sd * outer), hi = w.oneway ? outer : Math.max(sd * inner, sd * outer);
      const p0 = [q.x - tz * lo, q.z + tx * lo], p1 = [q.x - tz * hi, q.z + tx * hi];
      const hx = tx * 0.27, hz = tz * 0.27;
      const a = white.v(p0[0]! - hx, y, p0[1]! - hz, W), b = white.v(p1[0]! - hx, y, p1[1]! - hz, W), c = white.v(p1[0]! + hx, y, p1[1]! + hz, W), d = white.v(p0[0]! + hx, y, p0[1]! + hz, W);
      white.quad(a, b, c, d);
    }
  }
}

// ------------------------------------------------------------------------------------------------ crosswalks
function buildCrosswalks(map: GameMap, a: Acc) {
  const W = C(0xeeeeea);
  for (const c of map.crossings) {
    const hit = map.roadAt(c.x, c.z); if (!hit) continue;
    const hw = hit.edge.way.width / 2, tx = Math.sin(c.ang), tz = Math.cos(c.ang), rx = -tz, rz = tx;
    const BAR = 0.55, GAPW = 0.65, LEN = 3.0;
    for (let o = -hw + 0.4; o <= hw - 0.4; o += BAR + GAPW) {
      const cx = c.x + rx * o, cz = c.z + rz * o;
      const v0 = a.v(cx - tx * LEN / 2 - rx * BAR / 2, 0, cz - tz * LEN / 2 - rz * BAR / 2, W), v1 = a.v(cx + tx * LEN / 2 - rx * BAR / 2, 0, cz + tz * LEN / 2 - rz * BAR / 2, W);
      const v2 = a.v(cx + tx * LEN / 2 + rx * BAR / 2, 0, cz + tz * LEN / 2 + rz * BAR / 2, W), v3 = a.v(cx - tx * LEN / 2 + rx * BAR / 2, 0, cz - tz * LEN / 2 + rz * BAR / 2, W);
      a.quad(v0, v1, v2, v3);
    }
  }
}

// ------------------------------------------------------------------------------------------------ buildings
export const FLOOR_H = 3.4, BAY_W = 3.3;
export type WallStyle = 'brick' | 'stucco' | 'siding' | 'brickhouse';
export const WALL_STYLES: WallStyle[] = ['brick', 'stucco', 'siding', 'brickhouse'];
export interface BuildingParts {
  walls: Record<WallStyle, Acc>; roofsGable: Acc; roofsFlat: Acc; trim: Acc; awnings: Acc; contact: Acc;
  signs: { b: Building; x: number; z: number; nx: number; nz: number; w: number; y: number }[]; courthouse: Building | null; heights: Map<number, number>;
}

const NAMED_TINT: Record<string, number> = {
  'Carroll County Courthouse': 0xdcd3bf, 'Southeastern Quilt & Textile Museum': 0xa4533c, 'Hudson Mill': 0x9c4a36, 'Carrollton Art Center': 0xc9b9a1, 'Neva Lomason Memorial Library': 0xc0724f,
  'Moores Chapel Methodist Church': 0xe8e2d4, 'Howard B. Benson Building': 0xb7694a, 'James Bonner Building': 0xb86a4a, 'Maple Street Mansion': 0xf0ead8, 'The Depot on Bradley': 0xa95c40,
};
/** brick colours, a little over 1 because the brick texture itself is mid grey */
const BRICKS = [0xd06a4e, 0xbb5a43, 0xc77a58, 0xa9553f, 0xd59a6e, 0xb8684c, 0xc98f6a];
const STUCCO = [0xf1e7d4, 0xe6dccb, 0xd9d4ca, 0xcfc4b0, 0xe9e1cf, 0xc6cfd4, 0xdad0bd];
const AWNING = [0x2f5d3a, 0x7a2230, 0x23395b, 0x8a6a2a, 0x34373b, 0x5b2a4a, 0x1f5a5a];
const isBrickColour = (c: number) => [0xb4553f, 0x8c5a45, 0x9b6b52, 0xa4533c, 0x9c4a36, 0xc0724f, 0xb7694a, 0xb86a4a, 0xa95c40].includes(c);

export function buildBuildings(map: GameMap): BuildingParts {
  const walls = { brick: new Acc(), stucco: new Acc(), siding: new Acc(), brickhouse: new Acc() } as Record<WallStyle, Acc>;
  const roofsGable = new Acc(), roofsFlat = new Acc(), trim = new Acc(), awnings = new Acc(), contact = new Acc();
  const signs: BuildingParts['signs'] = []; let courthouse: Building | null = null; const heights = new Map<number, number>();
  const centre = map.buildings.find((b) => b.landmark === 'courthouse');
  const UP = [0, 1, 0];
  for (const b of map.buildings) {
    const named = b.name ? NAMED_TINT[b.name] : undefined;
    const isHouse = b.gable;
    const downtown = centre ? Math.hypot(b.cx - centre.cx, b.cz - centre.cz) < 420 : false;
    const r = rand01(b.id * 7.77 + 3);
    let style: WallStyle;
    if (isHouse) style = isBrickColour(b.color) || r < 0.22 ? 'brickhouse' : 'siding';
    else if (named !== undefined) style = isBrickColour(named) ? 'brick' : 'stucco';
    else style = isBrickColour(b.color) || (downtown ? r < 0.75 : r < 0.35) ? 'brick' : 'stucco';
    const tint = style === 'brick' || style === 'brickhouse'
      ? C(named !== undefined && isBrickColour(named) ? named : BRICKS[Math.floor(rand01(b.id * 3.1) * BRICKS.length)]!).multiplyScalar(1.22)
      : style === 'stucco' ? C(named ?? STUCCO[Math.floor(rand01(b.id * 3.3) * STUCCO.length)]!) : C(b.color).multiplyScalar(1.05);
    const roofCol = C(b.roof);
    const floors = Math.max(1, Math.round(b.h / FLOOR_H)), H = floors * FLOOR_H + (isHouse ? 0 : 0.9);
    heights.set(b.id, H);
    const acc = walls[style];
    const n = b.p.length / 2;
    let area = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += b.p[i * 2]! * b.p[j * 2 + 1]! - b.p[j * 2]! * b.p[i * 2 + 1]!; }
    const ord = area > 0 ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    const trimCol = style === 'brick' ? C(0xe2dccd) : style === 'stucco' ? tint.clone().multiplyScalar(0.82) : C(0xf2f0ea);
    let acc0 = 0;
    for (let k = 0; k < n; k++) {
      const i = ord[k]!, j = ord[(k + 1) % n]!;
      const x0 = b.p[i * 2]!, z0 = b.p[i * 2 + 1]!, x1 = b.p[j * 2]!, z1 = b.p[j * 2 + 1]!, L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) continue;
      const nxn = (z1 - z0) / L, nzn = -(x1 - x0) / L;
      const bays = Math.max(1, Math.round(L / BAY_W)), u0 = acc0 / 4, u1 = (acc0 + bays) / 4; acc0 += bays;
      const col = tint.clone().multiplyScalar(0.97 + rand01(b.id * 13 + k) * 0.06);
      const top = floors / 3 + (isHouse ? 0 : 0.9 / FLOOR_H / 3);
      const a = acc.v(x0, 0, z0, col, u0, 0, nxn, 0, nzn), bq = acc.v(x1, 0, z1, col, u1, 0, nxn, 0, nzn), c = acc.v(x1, H, z1, col, u1, top, nxn, 0, nzn), d = acc.v(x0, H, z0, col, u0, top, nxn, 0, nzn);
      acc.quad(a, bq, c, d);
      // ---- a cornice cap along the top of the wall of a flat-roofed building: a ledge that throws a line of shadow
      if (!isHouse) {
        const o = 0.32, y0 = H - 0.05, y1 = H + 0.28, ox = nxn * o, oz = nzn * o;
        const tc = trimCol.clone().multiplyScalar(1.02), tcd = trimCol.clone().multiplyScalar(0.7);
        trim.quad(trim.v(x0 + ox, y1, z0 + oz, tc, 0, 0, 0, 1, 0), trim.v(x1 + ox, y1, z1 + oz, tc, 0, 0, 0, 1, 0), trim.v(x1 - nxn * 0.3, y1, z1 - nzn * 0.3, tc, 0, 0, 0, 1, 0), trim.v(x0 - nxn * 0.3, y1, z0 - nzn * 0.3, tc, 0, 0, 0, 1, 0));
        trim.quad(trim.v(x0 + ox, y0, z0 + oz, tc, 0, 0, nxn, 0, nzn), trim.v(x1 + ox, y0, z1 + oz, tc, 0, 0, nxn, 0, nzn), trim.v(x1 + ox, y1, z1 + oz, tc, 0, 0, nxn, 0, nzn), trim.v(x0 + ox, y1, z0 + oz, tc, 0, 0, nxn, 0, nzn));
        trim.quad(trim.v(x0, y0, z0, tcd, 0, 0, 0, -1, 0), trim.v(x1, y0, z1, tcd, 0, 0, 0, -1, 0), trim.v(x1 + ox, y0, z1 + oz, tcd, 0, 0, 0, -1, 0), trim.v(x0 + ox, y0, z0 + oz, tcd, 0, 0, 0, -1, 0));
        // the storefront cornice: a thin ledge above the ground floor on brick and stucco shops
        if (L > 4) {
          const yb = FLOOR_H - 0.12, yt = FLOOR_H + 0.1, ob = 0.18;
          trim.quad(trim.v(x0 + nxn * ob, yb, z0 + nzn * ob, tcd, 0, 0, nxn, 0, nzn), trim.v(x1 + nxn * ob, yb, z1 + nzn * ob, tcd, 0, 0, nxn, 0, nzn), trim.v(x1 + nxn * ob, yt, z1 + nzn * ob, tc, 0, 0, nxn, 0, nzn), trim.v(x0 + nxn * ob, yt, z0 + nzn * ob, tc, 0, 0, nxn, 0, nzn));
          trim.quad(trim.v(x0, yt, z0, tc, 0, 0, 0, 1, 0), trim.v(x1, yt, z1, tc, 0, 0, 0, 1, 0), trim.v(x1 + nxn * ob, yt, z1 + nzn * ob, tc, 0, 0, 0, 1, 0), trim.v(x0 + nxn * ob, yt, z0 + nzn * ob, tc, 0, 0, 0, 1, 0));
        }
      }
      // ---- contact shadow on the ground around the base (a multiply decal: grey at the wall, white 2 m out)
      {
        const D = isHouse ? 1.6 : 2.2, inC = new THREE.Color().setScalar(0.66), outC = new THREE.Color().setScalar(1);
        const ext = 0.6, ex = (x1 - x0) / L * ext, ez = (z1 - z0) / L * ext;
        contact.quad(contact.v(x0 - ex, 0.15, z0 - ez, inC, 0, 0, 0, 1, 0), contact.v(x1 + ex, 0.15, z1 + ez, inC, 0, 0, 0, 1, 0), contact.v(x1 + ex + nxn * D, 0.15, z1 + ez + nzn * D, outC, 0, 0, 0, 1, 0), contact.v(x0 - ex + nxn * D, 0.15, z0 - ez + nzn * D, outC, 0, 0, 0, 1, 0));
      }
    }
    // ---- the wall that faces the street (for the porch, the awning and the sign)
    let front: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number; L: number; d: number } | null = null;
    for (let k = 0; k < n; k++) {
      const i = ord[k]!, j = ord[(k + 1) % n]!, x0 = b.p[i * 2]!, z0 = b.p[i * 2 + 1]!, x1 = b.p[j * 2]!, z1 = b.p[j * 2 + 1]!, L = Math.hypot(x1 - x0, z1 - z0); if (L < 4) continue;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
      const probe = map.roadAt(mx + nx * 6, mz + nz * 6); const d = probe ? probe.dist : 99;
      if (!front || d < front.d) front = { x0, z0, x1, z1, nx, nz, L, d };
    }
    // ---- roof
    if (isHouse) {
      let best = 0, bl = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(b.p[j * 2]! - b.p[i * 2]!, b.p[j * 2 + 1]! - b.p[i * 2 + 1]!); if (l > bl) { bl = l; best = i; } }
      const j0 = (best + 1) % n, ax = (b.p[j0 * 2]! - b.p[best * 2]!) / bl, az = (b.p[j0 * 2 + 1]! - b.p[best * 2 + 1]!) / bl, bx = -az, bz = ax;
      let minA = 1e9, maxA = -1e9, minB = 1e9, maxB = -1e9;
      for (let i = 0; i < n; i++) { const dx = b.p[i * 2]! - b.cx, dz = b.p[i * 2 + 1]! - b.cz, pa = dx * ax + dz * az, pb = dx * bx + dz * bz; minA = Math.min(minA, pa); maxA = Math.max(maxA, pa); minB = Math.min(minB, pb); maxB = Math.max(maxB, pb); }
      const ov = 0.5, rise = Math.min(3.6, (maxB - minB) * 0.36 + 0.6);
      const P = (pa: number, pb: number, y: number) => [b.cx + ax * pa + bx * pb, y, b.cz + az * pa + bz * pb] as const;
      const midB = (minB + maxB) / 2, half = (maxB - minB) / 2 + ov, sl = Math.hypot(rise, half), ny = half / sl, nb = rise / sl;
      const rc = roofCol.clone().multiplyScalar(1.15);
      const V = (pa: number, pb: number, y: number, side: number) => { const p = P(pa, pb, y); const slope = Math.abs(pb - midB) <= 1e-6 ? sl : (half - Math.abs(pb - midB)) / half * sl; return roofsGable.v(p[0], p[1], p[2], rc, pa / 4, slope / 4, bx * side * nb, ny, bz * side * nb); };
      roofsGable.quad(V(minA - ov, minB - ov, H - 0.15, -1), V(maxA + ov, minB - ov, H - 0.15, -1), V(maxA + ov, midB, H + rise, -1), V(minA - ov, midB, H + rise, -1));
      roofsGable.quad(V(maxA + ov, maxB + ov, H - 0.15, 1), V(minA - ov, maxB + ov, H - 0.15, 1), V(minA - ov, midB, H + rise, 1), V(maxA + ov, midB, H + rise, 1));
      // the fascia boards under the eaves
      const fasc = C(0xf2f0ea);
      for (const [pb, sd] of [[minB - ov, -1], [maxB + ov, 1]] as const) {
        const p0 = P(minA - ov, pb, H - 0.15), p1 = P(maxA + ov, pb, H - 0.15);
        trim.quad(trim.v(p0[0], H - 0.4, p0[2], fasc, 0, 0, bx * sd, 0, bz * sd), trim.v(p1[0], H - 0.4, p1[2], fasc, 0, 0, bx * sd, 0, bz * sd), trim.v(p1[0], H - 0.12, p1[2], fasc, 0, 0, bx * sd, 0, bz * sd), trim.v(p0[0], H - 0.12, p0[2], fasc, 0, 0, bx * sd, 0, bz * sd));
      }
      // gable ends in the wall colour, with the siding texture carried up
      for (const pa of [minA, maxA]) {
        const g0 = P(pa, minB, H), g1 = P(pa, maxB, H), g2 = P(pa, midB, H + rise * 0.92), sd = pa === minA ? -1 : 1;
        const t = [g0, g1, g2].map((g, i) => acc.v(g[0], g[1], g[2], tint, i === 0 ? 0 : i === 1 ? (maxB - minB) / BAY_W / 4 : (maxB - minB) / BAY_W / 8, i === 2 ? (H + rise) / FLOOR_H / 3 : H / FLOOR_H / 3, ax * sd, 0, az * sd));
        acc.tri(t[0]!, t[1]!, t[2]!);
      }
      // a brick chimney at one end of the ridge
      if (rand01(b.id * 4.4) < 0.6) { const cp = P((rand01(b.id) < 0.5 ? minA : maxA) * 0.7, midB + (maxB - minB) * 0.18, 0); box(trim, cp[0], H - 1, cp[2], 0.9, rise + 2.0, 0.9, C(0x9c5440), Math.atan2(ax, az)); box(trim, cp[0], H + rise + 0.95, cp[2], 1.05, 0.12, 1.05, C(0x6b6b6b), Math.atan2(ax, az)); }
      // the front porch: a little roof on posts, and the deck
      if (front && front.L > 6 && front.d < 30) {
        const pw = Math.min(front.L * 0.62, 8), mx = (front.x0 + front.x1) / 2, mz = (front.z0 + front.z1) / 2, tx = (front.x1 - front.x0) / front.L, tz = (front.z1 - front.z0) / front.L, depth = 2.2;
        const pc = rc.clone().multiplyScalar(0.95), white = C(0xf4f2ec), deck = C(0x9a8a76);
        const A = (lat: number, out: number, y: number, nrm = UP) => trim.v(mx + tx * lat + front!.nx * out, y, mz + tz * lat + front!.nz * out, pc, 0, 0, nrm[0]!, nrm[1]!, nrm[2]!);
        trim.quad(A(-pw / 2, 0, 3.0), A(pw / 2, 0, 3.0), A(pw / 2, depth, 2.6), A(-pw / 2, depth, 2.6));
        box(trim, mx + front.nx * (depth / 2), 0, mz + front.nz * (depth / 2), pw, 0.38, depth, deck, Math.atan2(tx, tz) + Math.PI / 2);
        for (const lat of [-pw / 2 + 0.2, pw / 2 - 0.2]) box(trim, mx + tx * lat + front.nx * (depth - 0.2), 0.38, mz + tz * lat + front.nz * (depth - 0.2), 0.16, 2.24, 0.16, white);
      }
    } else {
      // flat roof a little below the top of the walls: the walls become a parapet
      const tris = THREE.ShapeUtils.triangulateShape(pairs(b.p), []);
      const base = roofsFlat.n; const rc = C(0xbdbab4).multiplyScalar(0.85 + rand01(b.id) * 0.2);
      for (let i = 0; i < n; i++) roofsFlat.v(b.p[i * 2]!, H - 0.75, b.p[i * 2 + 1]!, rc, b.p[i * 2]! / 8, b.p[i * 2 + 1]! / 8);
      for (const t of tris) roofsFlat.tri(base + t[0]!, base + t[1]!, base + t[2]!);
      // roof equipment: an AC unit or two, a hatch
      if (b.area > 120) {
        const k = b.area > 600 ? 3 : 1;
        for (let q = 0; q < k; q++) {
          const bx = 1.4 + rand01(b.id * 3 + q) * 1.2, ox = (rand01(b.id * 5 + q) - 0.5) * Math.sqrt(b.area) * 0.4, oz = (rand01(b.id * 9 + q) - 0.5) * Math.sqrt(b.area) * 0.4;
          if (!buildingAt(map, b.cx + ox, b.cz + oz)) continue;
          box(trim, b.cx + ox, H - 0.75, b.cz + oz, bx, 1.0, bx * 0.8, C(0x9da1a6)); box(trim, b.cx + ox, H + 0.25, b.cz + oz, bx * 0.7, 0.1, bx * 0.55, C(0x55595e));
        }
      }
      // an awning over the storefront on the street side
      if (front && front.d < 14 && front.L > 5 && (b.name || rand01(b.id * 6.6) < 0.45) && floors <= 4) {
        const ac = C(AWNING[Math.floor(rand01(b.id * 8.8) * AWNING.length)]!), acd = ac.clone().multiplyScalar(0.72);
        const tx = (front.x1 - front.x0) / front.L, tz = (front.z1 - front.z0) / front.L, inset = Math.min(1.2, front.L * 0.1), out = 1.5;
        const ax0 = front.x0 + tx * inset, az0 = front.z0 + tz * inset, ax1 = front.x1 - tx * inset, az1 = front.z1 - tz * inset, ny2 = 0.8, nb2 = 0.6;
        const A = (x: number, z: number, o: number, y: number, c: THREE.Color, nrm: number[]) => awnings.v(x + front!.nx * o, y, z + front!.nz * o, c, 0, 0, nrm[0]!, nrm[1]!, nrm[2]!);
        const sn = [front.nx * nb2, ny2, front.nz * nb2], fn = [front.nx, 0, front.nz];
        awnings.quad(A(ax0, az0, 0, 2.95, ac, sn), A(ax1, az1, 0, 2.95, ac, sn), A(ax1, az1, out, 2.45, ac, sn), A(ax0, az0, out, 2.45, ac, sn));
        awnings.quad(A(ax0, az0, out, 2.45, acd, fn), A(ax1, az1, out, 2.45, acd, fn), A(ax1, az1, out, 2.2, acd, fn), A(ax0, az0, out, 2.2, acd, fn));
      }
    }
    if (b.landmark === 'courthouse') courthouse = b;
    // ---- the sign on the wall facing the street
    if (b.name && !isHouse && b.area > 90 && front && front.d < 30) {
      signs.push({ b, x: (front.x0 + front.x1) / 2, z: (front.z0 + front.z1) / 2, nx: front.nx, nz: front.nz, w: front.L, y: Math.min(H - 1.0, 4.3) });
    }
  }
  return { walls, roofsGable, roofsFlat, trim, awnings, contact, signs, courthouse, heights };
}

/** driveways (flat concrete) and the stall lines of the parking lots, from parked.ts */
export function buildDriveways(pw: { driveways: { x0: number; z0: number; x1: number; z1: number; w: number }[]; stalls: { x0: number; z0: number; x1: number; z1: number }[] }) {
  const drive = new Acc(), stalls = new Acc(); const cc = C(0xd8d5ce), W = C(0xeeeeea);
  for (const d of pw.driveways) {
    const L = Math.hypot(d.x1 - d.x0, d.z1 - d.z0) || 1, rx = -(d.z1 - d.z0) / L * d.w / 2, rz = (d.x1 - d.x0) / L * d.w / 2;
    drive.quad(drive.v(d.x0 - rx, 0, d.z0 - rz, cc, 0, 0), drive.v(d.x0 + rx, 0, d.z0 + rz, cc, 1, 0), drive.v(d.x1 + rx, 0, d.z1 + rz, cc, 1, L / 4), drive.v(d.x1 - rx, 0, d.z1 - rz, cc, 0, L / 4));
  }
  for (const s of pw.stalls) ribbon(stalls, [s.x0, s.z0, s.x1, s.z1], 0.06, 0, W, 4);
  return { drive, stalls };
}

export function box(a: Acc, cx: number, y0: number, cz: number, w: number, h: number, d: number, col: THREE.Color, rotY = 0) {
  const hx = w / 2, hz = d / 2, c = Math.cos(rotY), s = Math.sin(rotY);
  const P = (dx: number, dy: number, dz: number, n: number[], u = 0, v = 0) => a.v(cx + dx * c + dz * s, y0 + dy, cz - dx * s + dz * c, col, u, v, n[0]! * c + n[2]! * s, n[1]!, -n[0]! * s + n[2]! * c);
  const faces: [number[], number[][]][] = [
    [[0, 1, 0], [[-hx, h, -hz], [hx, h, -hz], [hx, h, hz], [-hx, h, hz]]],
    [[0, -1, 0], [[-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], [-hx, 0, -hz]]],
    [[0, 0, 1], [[-hx, 0, hz], [-hx, h, hz], [hx, h, hz], [hx, 0, hz]]],
    [[0, 0, -1], [[hx, 0, -hz], [hx, h, -hz], [-hx, h, -hz], [-hx, 0, -hz]]],
    [[1, 0, 0], [[hx, 0, hz], [hx, h, hz], [hx, h, -hz], [hx, 0, -hz]]],
    [[-1, 0, 0], [[-hx, 0, -hz], [-hx, h, -hz], [-hx, h, hz], [-hx, 0, hz]]],
  ];
  for (const [nrm, v] of faces) { const ids = v.map((p, i) => P(p[0]!, p[1]!, p[2]!, nrm, i < 2 ? 0 : 1, i % 2)); a.quad(ids[0]!, ids[1]!, ids[2]!, ids[3]!); }
}

/** a vertical cylinder/prism: poles, trunks, tower shafts */
export function prism(a: Acc, cx: number, y0: number, cz: number, r0: number, r1: number, h: number, col: THREE.Color, seg = 8) {
  const ring0: number[] = [], ring1: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    ring0.push(a.v(cx + c * r0, y0, cz + s * r0, col, i / seg, 0, c, 0.15, s)); ring1.push(a.v(cx + c * r1, y0 + h, cz + s * r1, col, i / seg, 1, c, 0.15, s));
  }
  for (let i = 0; i < seg; i++) a.quad(ring0[i]!, ring0[i + 1]!, ring1[i + 1]!, ring1[i]!);
}
export function cone(a: Acc, cx: number, y0: number, cz: number, r: number, h: number, col: THREE.Color, seg = 8, y1r = 0) {
  const tip = a.v(cx, y0 + h, cz, col, 0.5, 1, 0, 1, 0); const ring: number[] = [];
  for (let i = 0; i <= seg; i++) { const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); ring.push(a.v(cx + c * r, y0, cz + s * r, col, i / seg, 0, c * 0.7, 0.7, s * 0.7)); }
  for (let i = 0; i < seg; i++) a.tri(ring[i]!, ring[i + 1]!, tip);
  void y1r;
}

// ------------------------------------------------------------------------------------------------ railroad
export function buildRail(map: GameMap) {
  const ballast = new Acc(), steel = new Acc(), ties = new Acc();
  const B = C(0x77726a), S = C(0x4a4b50), T = C(0x4a3b2c);
  for (const r of map.rails) {
    if (r.abandoned) continue;
    const cum = [0]; for (let i = 2; i < r.p.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(r.p[i]! - r.p[i - 2]!, r.p[i + 1]! - r.p[i - 1]!));
    const total = cum[cum.length - 1]!;
    // ballast in pieces, skipping the level crossings (the road runs over them)
    const nearX = (x: number, z: number) => map.levelXs.some((l) => Math.hypot(l.x - x, l.z - z) < 6.2);
    const pieces: number[][] = []; let cur: number[] = [];
    for (let s = 0; s <= total; s += 4) { const q = pointOnPoly(r.p, cum, s); if (nearX(q.x, q.z)) { if (cur.length >= 4) pieces.push(cur); cur = []; } else cur.push(q.x, q.z); }
    if (cur.length >= 4) pieces.push(cur);
    for (const pc of pieces) ribbon(ballast, pc, 1.7, 0.05, B, 6);
    for (const off of [-0.72, 0.72]) ribbon(steel, (() => { const o: number[] = []; for (let s = 0; s <= total; s += 3) { const q = pointOnPoly(r.p, cum, s); o.push(q.x, q.z); } return o; })(), 0.07, 0.2, S, 6, off);
    for (let s = 0; s < total; s += 1.1) {
      const q = pointOnPoly(r.p, cum, s); if (nearX(q.x, q.z) && false) continue;
      const hx = q.tx * 0.14, hz = q.tz * 0.14, wx = -q.tz * 1.25, wz = q.tx * 1.25;
      const a = ties.v(q.x - hx - wx, 0.12, q.z - hz - wz, T), b2 = ties.v(q.x + hx - wx, 0.12, q.z + hz - wz, T), c2 = ties.v(q.x + hx + wx, 0.12, q.z + hz + wz, T), d2 = ties.v(q.x - hx + wx, 0.12, q.z - hz + wz, T);
      ties.quad(a, b2, c2, d2);
    }
  }
  return { ballast, steel, ties };
}
