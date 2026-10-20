/**
 * The parked cars of Carrollton and the driveways they sit on: a car in about half the driveways of the houses, and rows of cars in the parking lots.
 * Pure data (no three.js), so the rules engine can make them solid and the scene can draw them from the same list.
 */
import { buildingAt, rand01, type GameMap } from './map';

export type ParkedKind = 'sedan' | 'suv' | 'pickup' | 'hatch' | 'van';
export interface Parked { x: number; z: number; h: number; kind: ParkedKind; color: number }
export interface Driveway { x0: number; z0: number; x1: number; z1: number; w: number }
export interface Mailbox { x: number; z: number; h: number }
export interface StallLine { x0: number; z0: number; x1: number; z1: number }
export interface ParkedWorld { cars: Parked[]; driveways: Driveway[]; mailboxes: Mailbox[]; stalls: StallLine[] }

const PAINTS = [0xf4f4f2, 0x1c1d21, 0x9ba0a6, 0x7b1f24, 0x1f3a6b, 0xc9c3b3, 0x2f4a3a, 0x5c6168, 0xd8d8d8, 0x8a5a2e, 0x2a6e8f, 0xb23a2c, 0xe7e3da, 0x3d4247];
const KINDS: ParkedKind[] = ['sedan', 'sedan', 'suv', 'suv', 'pickup', 'pickup', 'hatch', 'van'];

function inPoly(p: number[], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) { const xi = p[i * 2]!, zi = p[i * 2 + 1]!, xj = p[j * 2]!, zj = p[j * 2 + 1]!; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; }
  return inside;
}

let cached: { map: GameMap; out: ParkedWorld } | null = null;
export function parkedWorld(map: GameMap): ParkedWorld {
  if (cached && cached.map === map) return cached.out;
  const cars: Parked[] = [], driveways: Driveway[] = [], mailboxes: Mailbox[] = [], stalls: StallLine[] = [];
  const pick = (seed: number) => ({ kind: KINDS[Math.floor(rand01(seed * 3.7) * KINDS.length)]!, color: PAINTS[Math.floor(rand01(seed * 5.3 + 1) * PAINTS.length)]! });
  // ---- driveways: beside each house, from the kerb to the side of the house
  for (const b of map.buildings) {
    if (!b.gable) continue;
    const hit = map.roadAt(b.cx, b.cz); if (!hit || hit.dist > 38 || hit.dist < 6) continue;
    const w = hit.edge.way; if (!w.drive || w.rank > 3) continue;
    const hw = w.width / 2, dx = (b.cx - hit.px) / hit.dist, dz = (b.cz - hit.pz) / hit.dist, tx = hit.tx, tz = hit.tz;
    const half = Math.sqrt(b.area) / 2;
    let done = false;
    for (const side of rand01(b.id * 1.9) < 0.5 ? [1, -1] : [-1, 1]) {
      const lat = side * (half + 2.2);
      const sx = hit.px + dx * (hw + 0.2) + tx * lat, sz = hit.pz + dz * (hw + 0.2) + tz * lat;
      const len = Math.min(26, hit.dist - hw + half * 0.4);
      if (len < 7) break;
      const ex = sx + dx * len, ez = sz + dz * len;
      // the drive must be clear of every building, and not cross another road
      let ok = true;
      for (let s = 0; s <= len; s += 1.5) { const x = sx + dx * s, z = sz + dz * s; if (buildingAt(map, x, z, 0.8)) { ok = false; break; } const rh = map.roadAt(x, z); if (rh && rh.edge !== hit.edge && rh.dist < rh.edge.way.width / 2 + 1) { ok = false; break; } }
      if (!ok) continue;
      driveways.push({ x0: sx, z0: sz, x1: ex, z1: ez, w: 3.2 });
      mailboxes.push({ x: sx - tx * side * 2.3 + dx * 0.6, z: sz - tz * side * 2.3 + dz * 0.6, h: Math.atan2(-dx, -dz) });
      if (rand01(b.id * 7.1) < 0.55) {
        const at = Math.max(4, len - 4.5), k = pick(b.id);
        // nose in towards the house, or backed in
        const hd = Math.atan2(dx, dz) + (rand01(b.id * 2.3) < 0.7 ? 0 : Math.PI);
        cars.push({ x: sx + dx * at, z: sz + dz * at, h: hd, ...k });
      }
      done = true; break;
    }
    void done;
  }
  // ---- the parking lots: double rows of stalls along the long side
  for (const lot of map.lots) {
    const p = lot.p, n = p.length / 2;
    let best = 0, bl = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(p[j * 2]! - p[i * 2]!, p[j * 2 + 1]! - p[i * 2 + 1]!); if (l > bl) { bl = l; best = i; } }
    const j0 = (best + 1) % n, ax = (p[j0 * 2]! - p[best * 2]!) / bl, az = (p[j0 * 2 + 1]! - p[best * 2 + 1]!) / bl, bx = -az, bz = ax;
    let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += p[i * 2]!; cz += p[i * 2 + 1]!; } cx /= n; cz /= n;
    let minA = 1e9, maxA = -1e9, minB = 1e9, maxB = -1e9;
    for (let i = 0; i < n; i++) { const ddx = p[i * 2]! - cx, ddz = p[i * 2 + 1]! - cz, pa = ddx * ax + ddz * az, pb = ddx * bx + ddz * bz; minA = Math.min(minA, pa); maxA = Math.max(maxA, pa); minB = Math.min(minB, pb); maxB = Math.max(maxB, pb); }
    const P = (pa: number, pb: number) => [cx + ax * pa + bx * pb, cz + az * pa + bz * pb] as const;
    const okAt = (pa: number, pb: number) => {
      for (const [da, db] of [[0, 0], [1.1, 2.5], [-1.1, 2.5], [1.1, -2.5], [-1.1, -2.5]] as const) { const [x, z] = P(pa + da, pb + db); if (!inPoly(p, x, z)) return false; if (buildingAt(map, x, z, 0.6)) return false; const rh = map.roadAt(x, z); if (rh && rh.dist < rh.edge.way.width / 2 + 1.2) return false; }
      return true;
    };
    let seed = 0;
    for (let pb = minB + 3; pb < maxB - 2.6; pb += 17.8) {
      for (const [rowB, face] of [[pb, 1], [pb + 5.4, -1]] as const) {
        for (let pa = minA + 2; pa < maxA - 1.4; pa += 2.75) {
          if (!okAt(pa, rowB)) continue;
          seed++;
          // the white stall line on the left of the stall
          const [l0x, l0z] = P(pa - 1.375, rowB - 2.5), [l1x, l1z] = P(pa - 1.375, rowB + 2.5);
          stalls.push({ x0: l0x, z0: l0z, x1: l1x, z1: l1z });
          if (rand01(seed * 4.1 + cx) < 0.6) { const [x, z] = P(pa, rowB); cars.push({ x, z, h: Math.atan2(bx * face, bz * face), ...pick(seed + Math.round(cx)) }); }
        }
      }
    }
  }
  const out = { cars, driveways, mailboxes, stalls };
  cached = { map, out };
  return out;
}
