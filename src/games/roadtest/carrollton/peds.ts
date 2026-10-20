/**
 * People of Carrollton: at every marked crosswalk of the map somebody waits at the kerb, looks both ways and crosses once the cars are slow or far;
 * along the sidewalks others stroll. The ones in the crosswalks are what the driving examiner watches: you stop and wait, or you fail.
 */
import { pointOnPoly, rand01, type Crossing, type GameMap } from './map';
import type { Car, Mover } from './traffic';

export interface Ped {
  id: number; x: number; z: number; h: number; look: number;
  state: 'wait' | 'walk' | 'done';
  /** the crosswalk this person uses and the walk across */
  cw: Crossing; ax: number; az: number; bx: number; bz: number; len: number; u: number; speed: number; half: number;
  hit: boolean; judged: boolean; yield: number; onRoad: boolean; waitT: number; phase: number;
}
export interface Stroller { id: number; x: number; z: number; h: number; look: number; edge: number; s: number; dir: 1 | -1; side: 1 | -1; speed: number; phase: number }

let PID = 1;

export class Pedestrians {
  list: Ped[] = [];
  strollers: Stroller[] = [];
  /** the people in the crosswalks as obstacles for the traffic (rebuilt in place every step) */
  movers: Mover[] = [];
  private cool = new Map<Crossing, number>();
  private rnd: number;
  constructor(private map: GameMap, seed: number) {
    this.rnd = (seed >>> 0) || 1;
  }
  private r() { this.rnd = (Math.imul(this.rnd, 1664525) + 1013904223) >>> 0; return this.rnd / 4294967296; }

  private spawnAt(cw: Crossing) {
    const hit = this.map.roadAt(cw.x, cw.z);
    const half = (hit ? hit.edge.way.width : 8) / 2 + 2.0;
    const px = Math.cos(cw.ang), pz = -Math.sin(cw.ang);          // across the road
    const sgn = this.r() < 0.5 ? 1 : -1;
    const ax = cw.x - px * half * sgn, az = cw.z - pz * half * sgn, bx = cw.x + px * half * sgn, bz = cw.z + pz * half * sgn;
    this.list.push({
      id: PID++, x: ax, z: az, h: Math.atan2(bx - ax, bz - az), look: Math.floor(this.r() * 8), state: 'wait', cw, ax, az, bx, bz, len: half * 2, u: 0, speed: 1.25 + this.r() * 0.35, half,
      hit: false, judged: false, yield: 99, onRoad: false, waitT: 0, phase: this.r() * 6,
    });
  }

  /** far enough, or behind the driver: somewhere a person can appear without being seen to pop up */
  private hiddenSpawn(x: number, z: number, plr: Mover) {
    const dx = x - plr.x, dz = z - plr.z, d = Math.hypot(dx, dz);
    const ahead = (dx * Math.sin(plr.h) + dz * Math.cos(plr.h)) / (d || 1);
    return d > 120 || (d > 45 && ahead < -0.35);
  }
  /** behind the car and well away: the chase camera cannot see it */
  private outOfSight(x: number, z: number, plr: Mover) {
    const dx = x - plr.x, dz = z - plr.z, d = Math.hypot(dx, dz);
    const ahead = (dx * Math.sin(plr.h) + dz * Math.cos(plr.h)) / (d || 1);
    return d > 330 || (d > 70 && ahead < -0.3);
  }
  /** a walker reaches the end of a block: on round the corner onto the next street with a sidewalk, or back the way they came at a dead end */
  private turnCorner(s: Stroller): boolean {
    const e = this.map.edges[s.edge]!, node = s.dir === 1 ? e.b : e.a, wside = s.side * s.dir;
    const opts = node.arms.filter((a) => a.edge !== e && a.edge.way.drive && (a.edge.way.name || a.edge.way.rank >= 3) && a.edge.len > 8);
    if (!opts.length) { s.dir = (s.dir === 1 ? -1 : 1) as 1 | -1; s.s = Math.max(1.6, Math.min(e.len - 1.6, s.s)); return true; }
    const a = opts[Math.floor(this.r() * opts.length)]!;
    s.edge = a.edge.id; s.dir = a.end === 0 ? 1 : -1; s.s = a.end === 0 ? 1.6 : a.edge.len - 1.6;
    s.side = (wside * s.dir) as 1 | -1;
    return true;
  }
  /** a person who has crossed walks on along the sidewalk they stepped onto */
  private toSidewalk(p: Ped) {
    const hit = this.map.roadAt(p.x, p.z); if (!hit || !hit.edge.way.drive) return;
    const e = hit.edge, dir: 1 | -1 = this.r() < 0.5 ? 1 : -1, side: 1 | -1 = hit.side >= 0 ? 1 : -1;
    this.strollers.push({ id: p.id, x: p.x, z: p.z, h: p.h, look: p.look, edge: e.id, s: Math.max(1.6, Math.min(e.len - 1.6, hit.s)), dir, side, speed: p.speed * 0.85, phase: p.phase });
  }

  step(dt: number, time: number, plr: Mover, cars: Car[]) {
    const near = (x: number, z: number, r: number) => (x - plr.x) ** 2 + (z - plr.z) ** 2 < r * r;
    // ---- spawn people at crosswalks around the player
    if (this.list.length < 9) {
      for (const cw of this.map.crossings) {
        if (!near(cw.x, cw.z, 190) || !this.hiddenSpawn(cw.x, cw.z, plr)) continue;
        if ((this.cool.get(cw) ?? 0) > time) continue;
        if (this.list.some((p) => p.cw === cw)) continue;
        this.cool.set(cw, time + 18 + this.r() * 40);
        if (this.r() < 0.55) { this.spawnAt(cw); if (this.list.length >= 9) break; }
      }
    }
    // ---- walk
    for (const p of this.list) {
      p.phase += dt * 6;
      if (p.state === 'wait') {
        p.waitT += dt;
        // cross when nothing comes: no moving car within 26 m of the crosswalk (and the player too)
        let clear = p.waitT > 1.2;
        if (clear) {
          const px = p.cw.x, pz = p.cw.z;
          const test = (m: Mover) => { const d = Math.hypot(m.x - px, m.z - pz); return d < 26 && Math.abs(m.v) > 2.4 && (m.x - px) * Math.sin(m.h) + (m.z - pz) * Math.cos(m.h) < 0; };
          for (const c of cars) if (test(c)) { clear = false; break; }
          if (clear && test(plr)) clear = false;
          // a car already stopped at the crosswalk does not scare a pedestrian: they go across in front of it
        }
        if (clear) p.state = 'walk';
      } else if (p.state === 'walk') {
        if (!p.hit) p.u += (p.speed * dt) / p.len;
        p.x = p.ax + (p.bx - p.ax) * p.u; p.z = p.az + (p.bz - p.az) * p.u;
        p.onRoad = Math.abs(p.u - 0.5) * p.len < p.half - 1.8;
        if (p.u >= 1) p.state = 'done';
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      if (p.state === 'done') { this.list.splice(i, 1); this.toSidewalk(p); continue; }
      // somebody still waiting at a kerb far behind you can go; nobody disappears where you can see them
      if (!near(p.cw.x, p.cw.z, 260) && this.outOfSight(p.x, p.z, plr)) this.list.splice(i, 1);
    }
    this.movers.length = 0;
    for (const p of this.list) if (p.state === 'walk' && p.onRoad) this.movers.push({ x: p.x, z: p.z, h: p.h, v: 0, len: 0.7, w: 0.7 });

    // ---- sidewalk strollers
    const T = this.strollers;
    for (let i = T.length - 1; i >= 0; i--) {
      const s = T[i]!; s.phase += dt * 6;
      let e = this.map.edges[s.edge]!; s.s += s.dir * s.speed * dt;
      if (s.s < 1.5 || s.s > e.len - 1.5) { if (!this.turnCorner(s)) { T.splice(i, 1); continue; } e = this.map.edges[s.edge]!; }
      const q = pointOnPoly(e.p, e.cum, s.s), off = e.way.width / 2 + 1.25;
      s.x = q.x - q.tz * off * s.side; s.z = q.z + q.tx * off * s.side; s.h = Math.atan2(q.tx * s.dir, q.tz * s.dir);
      if (!near(s.x, s.z, 230) && this.outOfSight(s.x, s.z, plr)) T.splice(i, 1);
    }
    if (T.length < 14 && ((time * 2) | 0) % 3 === 0) {
      for (let tries = 0; tries < 6; tries++) {
        const e = this.map.edges[Math.floor(this.r() * this.map.edges.length)]!;
        if (e.way.rank < 2 || e.len < 40 || !e.way.name) continue;
        const sd = 30 + this.r() * (e.len - 60); const q = pointOnPoly(e.p, e.cum, sd);
        if (!near(q.x, q.z, 200) || !this.hiddenSpawn(q.x, q.z, plr)) continue;
        T.push({ id: PID++, x: q.x, z: q.z, h: 0, look: Math.floor(this.r() * 8), edge: e.id, s: sd, dir: this.r() < 0.5 ? 1 : -1, side: this.r() < 0.5 ? 1 : -1, speed: 1.0 + this.r() * 0.6, phase: this.r() * 6 });
        break;
      }
    }
  }
}
export { rand01 };
