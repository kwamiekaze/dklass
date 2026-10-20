/**
 * The railroad through downtown Carrollton. A freight comes through now and then; the lights flash and the gates come down at every level crossing before it
 * arrives and go up again once it has cleared. Drivers stop behind the line, and the traffic does too.
 */
import { pointOnPoly, type GameMap, type LevelX } from './map';
import type { Mover } from './traffic';

export interface TrainX {
  x: number; z: number; ang: number; lx: LevelX;
  /** 0 up .. 1 down */
  gate: number; warn: boolean; trainAt: boolean; gates: boolean;
  line: number; s: number;
}
export interface Piece { x: number; z: number; h: number; kind: 'loco' | 'box' | 'tank' | 'hopper' }
export interface Train { line: number; front: number; dir: 1 | -1; running: boolean; nextAt: number; speed: number; pieces: Piece[]; len: number; kinds: Piece['kind'][] }

const CAR_LEN = 17, GAP = 1.2, LOCO_LEN = 21;

export class Trains {
  crossings: TrainX[] = [];
  trains: Train[] = [];
  lines: { p: number[]; cum: number[]; len: number }[] = [];
  /** barriers across the road while the gates are down, for the traffic (rebuilt in place) */
  movers: Mover[] = [];
  private rnd: number;
  constructor(private map: GameMap, seed: number) {
    this.rnd = (seed >>> 0) || 1;
    for (const r of map.rails) {
      if (r.abandoned) continue;
      const cum = [0]; for (let i = 2; i < r.p.length; i += 2) cum.push(cum[cum.length - 1]! + Math.hypot(r.p[i]! - r.p[i - 2]!, r.p[i + 1]! - r.p[i - 1]!));
      const len = cum[cum.length - 1]!; if (len < 260) continue;
      this.lines.push({ p: r.p, cum, len });
    }
    // attach each level crossing to the nearest line
    for (const lx of map.levelXs) {
      let best = -1, bd = 22, bs = 0;
      this.lines.forEach((l, li) => {
        for (let i = 0; i + 3 < l.p.length; i += 2) {
          const x0 = l.p[i]!, z0 = l.p[i + 1]!, dx = l.p[i + 2]! - x0, dz = l.p[i + 3]! - z0, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((lx.x - x0) * dx + (lx.z - z0) * dz) / l2));
          const d = Math.hypot(lx.x - (x0 + dx * t), lx.z - (z0 + dz * t));
          if (d < bd) { bd = d; best = li; bs = l.cum[i / 2]! + t * Math.sqrt(l2); }
        }
      });
      if (best >= 0) this.crossings.push({ x: lx.x, z: lx.z, ang: lx.ang, lx, gate: 0, warn: false, trainAt: false, gates: true, line: best, s: bs });
    }
    // a train on every line that has a crossing, the first one a little after the start
    const used = new Set(this.crossings.map((c) => c.line));
    for (const li of used) {
      const kinds: Piece['kind'][] = ['loco'];
      const n = 7 + Math.floor(this.r() * 5);
      for (let i = 0; i < n; i++) kinds.push((['box', 'box', 'tank', 'hopper', 'box'] as const)[Math.floor(this.r() * 5)]!);
      const len = LOCO_LEN + n * (CAR_LEN + GAP);
      this.trains.push({ line: li, front: 0, dir: this.r() < 0.5 ? 1 : -1, running: false, nextAt: 55 + this.r() * 60 + li * 20, speed: 11 + this.r() * 3, pieces: [], len, kinds });
    }
  }
  private r() { this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0; return this.rnd / 4294967296; }

  /** position of the train's front measured along its own line, from the start in its direction of travel */
  step(dt: number, time: number) {
    for (const t of this.trains) {
      const L = this.lines[t.line]!;
      if (!t.running && time >= t.nextAt) { t.running = true; t.front = 0; }
      if (t.running) {
        t.front += t.speed * dt;
        if (t.front > L.len + t.len + 10) { t.running = false; t.dir = t.dir === 1 ? -1 : 1; t.nextAt = time + 90 + this.r() * 110; t.pieces.length = 0; }
      }
      if (t.running) {
        t.pieces.length = 0;
        let back = t.front;
        for (let i = 0; i < t.kinds.length; i++) {
          const len = i === 0 ? LOCO_LEN : CAR_LEN, mid = back - len / 2;
          if (mid >= -10 && mid <= L.len + 10) {
            const s = t.dir === 1 ? mid : L.len - mid, q = pointOnPoly(L.p, L.cum, s);
            t.pieces.push({ x: q.x, z: q.z, h: Math.atan2(q.tx * t.dir, q.tz * t.dir), kind: t.kinds[i]! });
          }
          back -= len + GAP;
        }
      }
    }
    // ---- the crossings
    this.movers.length = 0;
    for (const c of this.crossings) {
      let warn = false, at = false;
      for (const t of this.trains) {
        if (t.line !== c.line || !t.running) continue;
        const pos = t.dir === 1 ? c.s : this.lines[t.line]!.len - c.s;      // distance of the crossing along the direction of travel
        const ahead = pos - t.front;                                        // metres the front still has to go
        const behind = t.front - t.len - pos;                               // metres the tail is past the crossing
        if (ahead < 300 && behind < 24) warn = true;
        if (ahead <= 2.4 && behind <= 2.4) at = true;
      }
      c.warn = warn; c.trainAt = at;
      c.gate += ((warn ? 1 : 0) - c.gate) * Math.min(1, dt * 1.1);
      if (warn && c.gate < 1) c.gate = Math.min(1, c.gate + dt * 0.35);
      if (!warn && c.gate > 0) c.gate = Math.max(0, c.gate - dt * 0.3);
      if (c.gate > 0.55) {
        // barriers for the traffic: a row of posts across the road 9 m before the crossing on both sides
        const hit = this.map.roadAt(c.x, c.z);
        const half = (hit ? hit.edge.way.width : 8) / 2 + 0.5, tx = Math.sin(c.lx.ang), tz = Math.cos(c.lx.ang);
        for (const sgn of [-1, 1]) for (let o = -half; o <= half; o += 2.2) this.movers.push({ x: c.x + tx * 9 * sgn - tz * o, z: c.z + tz * 9 * sgn + tx * o, h: 0, v: 0, len: 1, w: 1 });
      }
    }
  }
}
