/**
 * The people of Carrollton on the road: cars that follow the lane paths of the real streets, keep a gap to the car ahead, stop at red lights and at stop signs,
 * wait for a gap before they turn left or pull out onto a busier road, and slow down for the curves and the turns.
 */
import { MPH, rand01, type GameMap, type Node } from './map';
import { connSeg, edgeSeg, followers, segAt, type Seg } from './paths';

export type Kind = 'sedan' | 'suv' | 'pickup' | 'van' | 'hatch' | 'box' | 'semi' | 'police' | 'taxi';
export const SIZE: Record<Kind, { l: number; w: number }> = {
  sedan: { l: 4.7, w: 1.85 }, suv: { l: 4.9, w: 1.97 }, pickup: { l: 5.5, w: 2.0 }, van: { l: 5.4, w: 2.0 }, hatch: { l: 4.1, w: 1.8 },
  box: { l: 8.6, w: 2.5 }, semi: { l: 17, w: 2.6 }, police: { l: 4.95, w: 1.95 }, taxi: { l: 4.7, w: 1.85 },
};
const PAINTS = [0xf4f4f2, 0x1c1d21, 0x9ba0a6, 0x7b1f24, 0x1f3a6b, 0xc9c3b3, 0x2f4a3a, 0x5c6168, 0xd8d8d8, 0x8a5a2e, 0x3a2f55, 0xe0b73a, 0x2a6e8f, 0xb23a2c];

export interface Mover { x: number; z: number; h: number; v: number; len: number; w: number }
export interface Car extends Mover {
  id: number; kind: Kind; color: number; look: number;
  seg: Seg; s: number; nextConn: Seg | null; nextOut: Seg | null; turn: number;
  pace: number; cleared: Seg | null; waitT: number; arrived: number; blockedT: number; ghostUntil: number;
  brake: boolean; sig: -1 | 0 | 1; hit: number; hazard: boolean; acc: number; parkedFor: number;
  siren: boolean;
  /** debug: what is holding the car */
  why?: string;
}

export type SigState = 'green' | 'yellow' | 'red';
const CYCLE = 36;
export function signalState(node: Node, phase: number, t: number): SigState {
  const u = (t + node.phaseOffset) % CYCLE;
  if (phase === 0) return u < 15 ? 'green' : u < 18.5 ? 'yellow' : 'red';
  return u >= 20 && u < 31 ? 'green' : u >= 31 && u < 34.5 ? 'yellow' : 'red';
}
/** seconds until the signal at `node` turns red for `phase` (for the countdown) */
export function signalRemaining(node: Node, phase: number, t: number): number {
  const u = (t + node.phaseOffset) % CYCLE;
  const end = phase === 0 ? 18.5 : 34.5;
  return ((end - u) % CYCLE + CYCLE) % CYCLE;
}

export interface Hooks {
  /** the player as a mover */
  player: Mover;
  time: number;
}

const AMAX = 2.4, BCOMF = 3.2, TGAP = 1.25, S0 = 2.2;
let CAR_ID = 1;

export class Traffic {
  cars: Car[] = [];
  /** things that are not cars but that cars must not drive through: the people in the crosswalks */
  obstacles: Mover[] = [];
  private spawnEdges: { edge: GameMap['edges'][number]; dir: 1 | -1 }[] = [];
  private rnd = 1; private dt = 1 / 60;
  constructor(public map: GameMap, public max = 34) {
    for (const e of map.edges) {
      if (!e.way.ai || e.len < 25) continue;
      if (!e.way.oneway || true) {
        // an edge is a spawn candidate in every direction the traffic is allowed to travel
        const fwdOk = e.a.arms.find((a) => a.edge === e && a.end === 0)?.outbound !== false;
        const bwdOk = !e.way.oneway;
        if (fwdOk) this.spawnEdges.push({ edge: e, dir: 1 });
        if (bwdOk) this.spawnEdges.push({ edge: e, dir: -1 });
      }
    }
  }
  private r() { this.rnd = (this.rnd * 1664525 + 1013904223) >>> 0; return this.rnd / 4294967296; }
  seed(n: number) { this.rnd = n >>> 0 || 1; }

  // ------------------------------------------------------------------ spawning
  private kindFor(rank: number): Kind {
    const r = this.r();
    if (rank >= 5 && r < 0.05) return 'semi';
    if (r < 0.04) return 'police';
    if (r < 0.06) return 'taxi';
    if (r < 0.10) return 'box';
    if (r < 0.17) return 'van';
    if (r < 0.31) return 'pickup';
    if (r < 0.50) return 'suv';
    if (r < 0.62) return 'hatch';
    return 'sedan';
  }
  spawnOne(px: number, pz: number, minD: number, maxD: number, minAhead = false, pfx = 0, pfz = 0): Car | null {
    for (let tries = 0; tries < 24; tries++) {
      const c = this.spawnEdges[Math.floor(this.r() * this.spawnEdges.length)]!;
      const lane = Math.floor(this.r() * c.edge.way.lanes);
      const seg = edgeSeg(c.edge, c.dir, lane);
      if (seg.len < 14) continue;
      const s = seg.len * (0.12 + 0.76 * this.r());
      const p = segAt(seg, s);
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < minD || d > maxD) continue;
      if (minAhead) { const dot = ((p.x - px) * pfx + (p.z - pz) * pfz) / (d || 1); if ((dot > 0.55 && d < 200) || (dot > -0.25 && d < 150)) continue; }   // never appear where the driver is looking
      const kind = this.kindFor(c.edge.way.rank);
      const sz = SIZE[kind];
      let clear = true;
      for (const o of this.cars) if (Math.hypot(o.x - p.x, o.z - p.z) < (sz.l + o.len) / 2 + 9) { clear = false; break; }
      if (!clear) continue;
      const car: Car = {
        id: CAR_ID++, kind, color: PAINTS[Math.floor(this.r() * PAINTS.length)]!, look: Math.floor(this.r() * 8), seg, s, nextConn: null, nextOut: null, turn: 0,
        pace: 0.9 + this.r() * 0.18, cleared: null, waitT: 0, arrived: 0, blockedT: 0, ghostUntil: 0, brake: false, sig: 0, hit: 0, hazard: false, acc: 0, parkedFor: 0, siren: false,
        x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), v: Math.min(seg.mph * MPH * 0.8, 13) * (0.7 + 0.3 * this.r()), len: sz.l, w: sz.w,
      };
      if (kind === 'taxi') car.color = 0xf2c14e;
      if (kind === 'police') car.color = 0xf4f6f8;
      this.cars.push(car);
      return car;
    }
    return null;
  }
  populate(px: number, pz: number, fx: number, fz: number, n = this.max) {
    while (this.cars.length < n) { if (!this.spawnOne(px, pz, 70, 300, true, fx, fz)) break; }
  }

  // ------------------------------------------------------------------ choosing the way on
  private choose(c: Car) {
    const seg = c.seg;
    if (seg.kind !== 'edge') return;
    const opts = followers(this.map, seg);
    if (!opts.length) { c.nextConn = null; c.nextOut = null; c.turn = 0; return; }
    let tot = 0; const w = opts.map((o) => { const rk = o.out.edge!.way.rank; const f = (o.turn === 0 ? 3.2 : 1.1) * (0.6 + rk * 0.25); tot += f; return f; });
    let r = this.r() * tot, pick = opts[0]!;
    for (let i = 0; i < opts.length; i++) { r -= w[i]!; if (r <= 0) { pick = opts[i]!; break; } }
    // turn into the lane that suits the turn when the road we join has more lanes
    let out = pick.out;
    const lanes = out.edge!.way.lanes;
    if (lanes > 1) { const want = pick.turn === -1 ? 0 : pick.turn === 1 ? lanes - 1 : Math.min(lanes - 1, seg.lane ?? 0); if (want !== out.lane) { out = edgeSeg(out.edge!, out.dir!, want); } }
    c.nextOut = out; c.nextConn = connSeg(seg, out, seg.end!); c.turn = c.nextConn.turn ?? 0;
    c.sig = c.turn === -1 ? -1 : c.turn === 1 ? 1 : 0;
  }

  /** the position `dist` metres ahead of the car along its chosen path */
  private ahead(c: Car, dist: number): { x: number; z: number; tx: number; tz: number; seg: Seg } | null {
    let seg = c.seg, d = c.s + dist;
    if (d <= seg.len) return { ...segAt(seg, d), seg };
    d -= seg.len;
    const chain: (Seg | null)[] = seg.kind === 'edge' ? [c.nextConn, c.nextOut] : [c.nextOut];
    for (const nx of chain) {
      if (!nx) return null;
      if (d <= nx.len) return { ...segAt(nx, d), seg: nx };
      d -= nx.len;
    }
    return null;
  }

  // ------------------------------------------------------------------ the rules at a junction
  private arrivals(node: Node, c: Car, t: number, strict: boolean, others: Mover[], plr: Mover): boolean {
    // true when it is safe to enter the box of `node`
    const myArm = c.seg.arm;
    const myRank = myArm ? myArm.edge.way.rank : 0;
    for (const m of this.cars) {
      if (m === c) continue;
      const dx = node.x - m.x, dz = node.z - m.z, d = Math.hypot(dx, dz);
      if (d < node.clear * 0.85) return false;                           // someone is in the box
      if (d > 60) continue;
      const toward = (dx * Math.sin(m.h) + dz * Math.cos(m.h)) / (d || 1);
      if (toward < 0.5) continue;
      const eta = d / Math.max(2, m.v);
      if (m.v < 0.6 && d > node.clear + 3) continue;                    // a queued car further back is not coming
      const mArm = m.seg.arm; const mRank = mArm ? mArm.edge.way.rank : 0;
      // the other car has the right of way if its road outranks mine, or it was here first
      const theirs = mRank > myRank || (mRank === myRank && (m.arrived < c.arrived - 0.01 || (Math.abs(m.arrived - c.arrived) < 0.01 && m.id < c.id)));
      if (m.seg.node === node && m.seg.kind === 'conn') return false;
      if (theirs && eta < (strict ? 4.2 : 3.2)) return false;
    }
    void t; void others;
    // the player counts too
    const dx = node.x - plr.x, dz = node.z - plr.z, d = Math.hypot(dx, dz);
    if (d < node.clear * 0.9) return false;
    // a car pulling out needs a real gap: a left turn from a standstill across the player's lane takes the longest, going straight the least
    const turn = c.nextConn?.turn ?? 0, need = turn === -1 ? 6.2 : turn === 1 ? 4.8 : 4.4;
    if (d < Math.max(50, plr.v * need + 8) && plr.v > 2) { const toward = (dx * Math.sin(plr.h) + dz * Math.cos(plr.h)) / (d || 1); if (toward > 0.55 && d / plr.v < need) return false; }
    return true;
  }
  private oncomingLeft(node: Node, c: Car, plr: Mover): boolean {
    // true when an oncoming car is close enough that a left turn would cut it off
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const test = (m: Mover) => {
      const dx = node.x - m.x, dz = node.z - m.z, d = Math.hypot(dx, dz); if (d > 55 || d < 2) return false;
      const dir = Math.sin(m.h) * fx + Math.cos(m.h) * fz; if (dir > -0.6) return false;
      const toward = (dx * Math.sin(m.h) + dz * Math.cos(m.h)) / d; if (toward < 0.5) return false;
      return d / Math.max(2.5, m.v) < 4.2;
    };
    for (const m of this.cars) if (m !== c && test(m)) return true;
    return test(plr);
  }
  private boxRoom(c: Car): boolean {
    // true when the lane we are about to join has room for us: a stopped queue at its start would leave us stuck in the middle of the junction
    const o = c.nextOut; if (!o) return true;
    if (c.blockedT > 9) return true;                                     // drivers do block the box sometimes: no waiting for ever
    const need = c.len + 2;
    const p0 = segAt(o, 0), fx = p0.tx, fz = p0.tz;
    for (const m of this.cars) {
      if (m === c || m.v > 3) continue;
      const rx = m.x - p0.x, rz = m.z - p0.z;
      const along = rx * fx + rz * fz, lat = rx * -fz + rz * fx;
      if (Math.abs(lat) < 1.6 && along > -m.len / 2 && along < need + m.len / 2) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ one step
  step(dt: number, time: number, plr: Mover, near: (x: number, z: number, r: number) => boolean) {
    void near; this.dt = dt;
    const cars = this.cars;
    for (const c of cars) {
      if (c.hit > 0) { c.hit -= dt; c.v = Math.max(0, c.v - 7 * dt); c.brake = true; c.hazard = true; this.move(c, dt); continue; }
      c.hazard = false;
      if (!c.nextConn && c.seg.kind === 'edge') this.choose(c);
      // ---- what is ahead
      let accel = AMAX * (1 - Math.pow(c.v / Math.max(2, this.targetSpeed(c)), 4));
      let gap = Infinity, dv = 0, leadId = 0;
      const ghost = time < c.ghostUntil;
      if (!ghost) {
        const look = Math.min(52, 16 + c.v * 2.8);
        const margin = c.w / 2 + 0.28;
        for (let d = c.len / 2 + 0.6; d <= look; d += d < 14 ? 1.5 : 3) {
          const p = this.ahead(c, d); if (!p) break;
          let hit: Mover | null = null;
          for (const m of cars) {
            if (m === c) continue;
            const rx = p.x - m.x, rz = p.z - m.z;
            if (rx * rx + rz * rz > 160) continue;
            const along = rx * Math.sin(m.h) + rz * Math.cos(m.h), lat = rx * Math.cos(m.h) - rz * Math.sin(m.h);
            if (Math.abs(along) < m.len / 2 + 0.3 && Math.abs(lat) < m.w / 2 + margin) { hit = m; break; }
          }
          if (!hit) for (const m of this.obstacles) { const rx = p.x - m.x, rz = p.z - m.z; if (rx * rx + rz * rz > 9) continue; if (Math.abs(rx) < m.w / 2 + margin + 0.5 && Math.abs(rz) < m.len / 2 + margin + 0.5) { hit = m; break; } }
          if (!hit) { const rx = p.x - plr.x, rz = p.z - plr.z, along = rx * Math.sin(plr.h) + rz * Math.cos(plr.h), lat = rx * Math.cos(plr.h) - rz * Math.sin(plr.h); if (Math.abs(along) < plr.len / 2 + 0.3 && Math.abs(lat) < plr.w / 2 + margin) hit = plr; }
          if (hit) { const g = d - c.len / 2 - 0.2; if (g < gap) { gap = g; dv = c.v - hit.v; leadId = (hit as Car).id ?? -1; } break; }
        }
      }
      const idm = (g: number, rel: number) => { const sStar = S0 + Math.max(0, c.v * TGAP + (c.v * rel) / (2 * Math.sqrt(AMAX * BCOMF))); return -AMAX * Math.pow(sStar / Math.max(0.2, g), 2); };
      if (gap < Infinity) accel = Math.min(accel, AMAX * (1 - Math.pow(c.v / Math.max(2, this.targetSpeed(c)), 4)) + idm(gap, dv));
      // ---- the junction ahead
      const stop = this.junctionStop(c, time, plr);
      if (stop !== Infinity) {
        const g = Math.max(0.05, stop);
        accel = Math.min(accel, AMAX * (1 - Math.pow(c.v / Math.max(2, this.targetSpeed(c)), 4)) + idm(g, c.v));
        if (g < 1.2 && c.v < 0.3) { accel = -c.v / Math.max(dt, 0.001); }
      }
      c.why = stop !== Infinity ? `stop ${stop.toFixed(1)}` : gap < Infinity ? `lead ${leadId} gap ${gap.toFixed(1)}` : 'free';
      c.acc = Math.max(-9, Math.min(AMAX, accel));
      c.v = Math.max(0, c.v + c.acc * dt);
      if (gap < 0.6 && !ghost) c.v = Math.min(c.v, 0.2);
      c.brake = c.acc < -0.9 || (c.v < 0.3);
      c.blockedT = c.v < 0.3 ? c.blockedT + dt : 0;
      if (c.blockedT > 22) { if (this.unseen(c, plr, 70)) c.s = c.seg.len + 1e9; else if (c.blockedT > 34) { c.ghostUntil = time + 7; c.blockedT = 0; } }
      // a car waiting on the player's own parked car does not wait for ever: the queue behind it would never move again
      else if (leadId === -1 && c.blockedT > 14 && plr.v < 0.3) { c.ghostUntil = time + 5; c.blockedT = 0; }
      this.move(c, dt);
    }
    // ---- leave when the car has wandered far from the player or reached the end of the road
    // (a car only leaves where the chase camera cannot see it: far away, or behind you)
    for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i]!; if (c.s > 1e8 || c.seg.len < 0 || (Math.hypot(c.x - plr.x, c.z - plr.z) > 340 && this.unseen(c, plr, 90))) cars.splice(i, 1); }
  }
  /** out of the driver's sight: well behind the car, or very far */
  private unseen(c: Mover, plr: Mover, behind: number) {
    const dx = c.x - plr.x, dz = c.z - plr.z, d = Math.hypot(dx, dz);
    return d > 420 || (d > behind && (dx * Math.sin(plr.h) + dz * Math.cos(plr.h)) / (d || 1) < -0.3);
  }

  private targetSpeed(c: Car): number {
    const seg = c.seg;
    let v0 = seg.mph * MPH * c.pace;
    if (seg.kind === 'conn') v0 = Math.min(v0, seg.turn === 0 ? 11 : seg.turn === -1 ? 6.2 : seg.turn === 1 ? 4.8 : 4);
    else if (c.nextConn && c.nextConn.turn !== 0) {
      // brake early enough to take the turn
      const vt = c.nextConn.turn === -1 ? 6.2 : c.nextConn.turn === 1 ? 4.8 : 4, d = Math.max(0, seg.len - c.s - c.len / 2);
      v0 = Math.min(v0, Math.sqrt(vt * vt + 2 * 2.2 * d));
    }
    // road bends: ease off for the sharpest curve in the next 24 m
    const a = this.ahead(c, 4), b = this.ahead(c, 28);
    if (a && b) { let dh = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz); while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2; const k = Math.abs(dh) / 24; if (k > 0.004) v0 = Math.min(v0, Math.max(5, Math.sqrt(3.4 / k))); }
    return v0;
  }

  /** the distance (front bumper to the line) at which the car has to stop for the junction ahead, or Infinity */
  private junctionStop(c: Car, time: number, plr: Mover): number {
    const seg = c.seg;
    if (seg.kind !== 'edge' || !seg.end || !seg.arm || !seg.edge) return Infinity;
    const node = seg.end;
    if (node.deadEnd || node.arms.length < 3) return Infinity;
    const d = seg.len - c.s - c.len / 2 - 0.9;
    if (d > 70) return Infinity;
    const line = d + S0 - 0.45;       // the stopping gap of the following model is S0, so the car settles just short of the line
    if (c.cleared === seg) return Infinity;
    const endIdx = seg.arm.end;
    const edge = seg.edge;
    const turn = c.nextConn?.turn ?? 0;
    if (node.signal) {
      const st = signalState(node, edge.phase[endIdx], time);
      if (st === 'red') return line;
      if (st === 'yellow') { const brakeD = (c.v * c.v) / (2 * 3.4) + c.v * 0.2; if (d > brakeD + 2) return line; }
      if (d < 4 && (turn === -1 && this.oncomingLeft(node, c, plr))) return line;
      if (d < 4 && !this.boxRoom(c)) return line;
      return Infinity;
    }
    const stopSign = edge.stop[endIdx];
    const myRank = edge.way.rank;
    const minor = node.rank > myRank;
    const yieldIt = !stopSign && (minor || (node.rank === myRank && node.arms.length >= 4));
    if (!stopSign && !yieldIt) {
      if (d < 4 && turn === -1 && this.oncomingLeft(node, c, plr)) return line;
      return Infinity;
    }
    // stop or yield: come to a halt at the line, wait a beat, then go when the way is clear
    if (d < 1.3 && c.v < 0.4) {
      if (c.arrived === 0) c.arrived = time;
      c.waitT += this.dt;
      const need = stopSign ? 1.1 : 0.3;
      if (c.waitT >= need) {
        const ok = this.arrivals(node, c, time, stopSign, [], plr) && (turn !== -1 || !this.oncomingLeft(node, c, plr)) && this.boxRoom(c);
        if (ok || c.waitT > 22) { c.cleared = seg; c.waitT = 0; c.arrived = 0; return Infinity; }
      }
    } else if (d < 14 && c.arrived === 0) c.arrived = time + d * 0.01;
    return line;
  }

  private move(c: Car, dt: number) {
    c.s += c.v * dt;
    while (c.s >= c.seg.len) {
      c.s -= c.seg.len;
      if (c.seg.kind === 'edge') {
        const nx = c.nextConn; if (!nx) { c.seg = { ...c.seg, len: -1 } as Seg; return; }
        c.seg = nx; c.cleared = null; c.waitT = 0; c.arrived = 0;
      } else {
        const nx = c.nextOut; if (!nx) { c.seg = { ...c.seg, len: -1 } as Seg; return; }
        c.seg = nx; c.nextConn = null; c.nextOut = null; c.cleared = null; c.sig = 0; this.choose(c);
      }
    }
    const p = segAt(c.seg, c.s);
    c.x = p.x; c.z = p.z; c.h = Math.atan2(p.tx, p.tz);
  }
}
export { rand01 };
