import { fleetFiles } from '../../components/nuhome2/world/Fleet';
import { ARRIVE_T, buildPath, stopS, watchEnd, type CarSpec, type Path, type Scenario } from './engine';

/*
 * The motion of the cars. Before anyone is asked, every car follows a fixed timeline: stopped cars brake to a halt exactly at their
 * moment (cars with the same rank stop in the same instant), the car without a stop sign cruises up to the crosswalk and holds there
 * (the scene is paused while you decide). When a car is let go it accelerates from where it stands, slows for its turn, and drives off.
 */
export const VMAX = 7.2, ACCEL = 2.7, TURN_V = 4.4, CRUISE = 6.5, WB = 2.7, STEER_MAX = .55;

export type Run = {
  spec: CarSpec; path: Path; L: number;
  sStop: number; T: number; D: number;
  /** the distance along the path where a car without a stop sign waits for you */
  sHold: number;
  goTime: number | null;     // set when released
  s: number; v: number; accel: number;
  /** pose, steering and rolling for the wheels */
  x: number; z: number; yaw: number; steer: number; dist: number;
  cleared: boolean;
};

export const carLength = (model: string) => fleetFiles(model)?.length ?? 4.7;

export class Sim {
  scenario: Scenario | null = null;
  runs: Run[] = [];
  time = 0;
  Tw = 0;
  /** true once every car has settled and the scene is waiting for an answer */
  get ready() { return this.time >= this.Tw - 1e-6; }

  load(sc: Scenario) {
    this.scenario = sc; this.time = 0; this.Tw = watchEnd(sc.cars);
    this.runs = sc.cars.map(spec => {
      const path = buildPath(spec.from, spec.move), L = carLength(spec.model);
      const T = ARRIVE_T(spec.rank), sStop = stopS(spec.from, spec.move, L);
      const D = Math.max(12, Math.min(26, 3.6 * T));
      const sHold = path.enter - 11;
      const r: Run = { spec, path, L, sStop, T, D, sHold, goTime: null, s: 0, v: 0, accel: 0, x: 0, z: 0, yaw: 0, steer: 0, dist: 0, cleared: false };
      this.place(r, true); return r;
    });
  }

  /** the scripted position of a car that has not been released yet */
  private scripted(r: Run, t: number) {
    if (r.spec.rank < 0) {
      const s = r.sHold - CRUISE * Math.max(0, this.Tw - t);
      return { s, v: t < this.Tw ? CRUISE : 0 };
    }
    if (t >= r.T) return { s: r.sStop, v: 0 };
    const u = 1 - t / r.T;
    return { s: r.sStop - r.D * u * u, v: (2 * r.D / r.T) * u };
  }

  private place(r: Run, snap = false) {
    const prev = { x: r.x, z: r.z, yaw: r.yaw };
    const p = r.path.at(r.s);
    r.x = p.x; r.z = p.z; r.yaw = p.yaw;
    if (snap) { r.dist = 0; r.steer = 0; return; }
    const ds = (r.x - prev.x) * Math.cos(r.yaw) - (r.z - prev.z) * Math.sin(r.yaw);
    let dy = r.yaw - prev.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    if (Math.abs(ds) > 2 || Math.abs(dy) > .6) return;
    r.dist += ds;
    const target = Math.abs(ds) > 2e-4 ? Math.max(-STEER_MAX, Math.min(STEER_MAX, Math.atan(WB * dy / ds))) : r.steer;
    r.steer += (target - r.steer) * .35;
  }

  /** Let a car go. */
  release(id: string) {
    const r = this.runs.find(q => q.spec.id === id); if (!r || r.goTime !== null) return;
    const now = this.scripted(r, this.time);
    r.goTime = this.time; r.s = now.s; r.v = r.spec.rank < 0 ? CRUISE : 0;
  }

  /** Move everything on by dt seconds. */
  step(dt: number) {
    dt = Math.min(dt, .05);
    if (this.time < this.Tw) this.time = Math.min(this.Tw, this.time + dt);
    for (const r of this.runs) {
      if (r.goTime === null) {
        const q = this.scripted(r, this.time); const v0 = r.v; r.s = q.s; r.v = q.v; r.accel = dt > 0 ? (r.v - v0) / dt : 0;
        if (this.time < this.Tw || r.spec.rank >= 0) this.place(r);
        continue;
      }
      if (r.cleared) { r.s += r.v * dt; this.place(r); continue; }
      const inBox = r.s > r.path.enter - 1.5 && r.s < r.path.leave + 1.5;
      const vt = inBox && r.spec.move !== 'straight' ? TURN_V : VMAX;
      const dv = vt - r.v, a = Math.max(-5, Math.min(ACCEL, dv / Math.max(dt, 1e-3)));
      r.accel = a; r.v += a * dt; r.s += r.v * dt;
      if (r.s > r.path.leave + r.L / 2 + 1.2) r.cleared = true;
      this.place(r);
    }
  }

  /** Is every released car out of the intersection? */
  get clear() { return this.runs.every(r => r.goTime === null || r.cleared); }
  get busy() { return this.runs.some(r => r.goTime !== null && !r.cleared); }
  remaining() { return this.runs.filter(r => r.goTime === null).map(r => r.spec); }
  reset() { if (this.scenario) this.load(this.scenario); }
}
