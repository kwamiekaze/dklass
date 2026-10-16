/*
 * The opening shot, written as one pure timeline so it can be tested without a browser.
 *
 *   0 s       the camera hangs high beside the avenue, as in the owner's reference recording, and watches the school car
 *             approach the stop sign; the right blinker is on before it gets there
 *   12.5 s    the car stops at the sign, blinker flashing. The camera has the stop sign, the car and, far behind them,
 *             the black DrivingKlass sign in one frame
 *   15.1 s    the car sets off. The camera tracks it from above through every turn and every blinker, right onto the
 *             street, left into the driveway, left into the aisle, right into the reserved stall, always with the lot
 *             and the signs in view
 *   ~35.7 s   only once the car is parked does the camera leave it: a smooth move to the black sign, up and forward to
 *             the OPEN / CLOSED sign on the door, back and down to the hours board, then all the way back
 *
 * Every number below was chosen so the camera never touches a thing; colliders.ts lists the solid objects and
 * scripts/check-intro.mjs walks the whole timeline against them.
 */
import { CAST, STALLS, type Stall } from './cast';
export type V3 = [number, number, number];
export type Pose = { p: V3; l: V3; fov: number };

export const T_STOP = 12.5, T_GAP = 1.4;   // the car is fully stopped from about T_STOP minus 0.6 s, so it waits 2 seconds at the sign, never more than 3
/** The moment the car sets off again from the stop sign. */
export const T_GO = T_STOP + T_GAP, T_PARK = T_GO;
/** The right blinker goes on this many seconds before the car arrives at the stop sign, and stays on through the wait and the turn. */
export const T_SIGNAL_LEAD = 3.5;
export const LANE_X = 2.05, STOP_Z = 39.5, START_Z = 62;

// ---------- monotone cubic interpolation: smooth, and it never overshoots a key, so the path stays where it was designed ----------
function pchip(ts: number[], vs: number[]) {
  const n = ts.length, h: number[] = [], d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = ts[i + 1]! - ts[i]!; d[i] = (vs[i + 1]! - vs[i]!) / (h[i] || 1); }
  if (n === 2) { m[0] = m[1] = d[0]!; }
  else {
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1]! * d[i]! <= 0) m[i] = 0;
      else { const w1 = 2 * h[i]! + h[i - 1]!, w2 = h[i]! + 2 * h[i - 1]!; m[i] = (w1 + w2) / (w1 / d[i - 1]! + w2 / d[i]!); }
    }
    const end = (h0: number, h1: number, d0: number, d1: number) => { let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1); if (s * d0 <= 0) s = 0; else if (d0 * d1 <= 0 && Math.abs(s) > 3 * Math.abs(d0)) s = 3 * d0; return s; };
    m[0] = end(h[0]!, h[1]!, d[0]!, d[1]!); m[n - 1] = end(h[n - 2]!, h[n - 3]!, d[n - 2]!, d[n - 3]!);
  }
  return (t: number) => {
    if (t <= ts[0]!) return vs[0]!; if (t >= ts[n - 1]!) return vs[n - 1]!;
    let i = 0; while (t > ts[i + 1]!) i++;
    const x = (t - ts[i]!) / h[i]!, x2 = x * x, x3 = x2 * x;
    return (2 * x3 - 3 * x2 + 1) * vs[i]! + (x3 - 2 * x2 + x) * h[i]! * m[i]! + (-2 * x3 + 3 * x2) * vs[i + 1]! + (x3 - x2) * h[i]! * m[i + 1]!;
  };
}
const series = (keys: { t: number; p: V3; l: V3; fov: number }[]) => {
  const ts = keys.map(k => k.t);
  const f = (get: (k: typeof keys[number]) => number) => pchip(ts, keys.map(get));
  return { px: f(k => k.p[0]), py: f(k => k.p[1]), pz: f(k => k.p[2]), lx: f(k => k.l[0]), ly: f(k => k.l[1]), lz: f(k => k.l[2]), fov: f(k => k.fov) };
};

// ---------- the car ----------
const carZ1 = (t: number) => { const u = Math.min(1, t / T_STOP); return STOP_Z + (START_Z - STOP_Z) * Math.pow(1 - u, 2.5); };   // braking eases off to nothing, but it does arrive: the speed is 0.05 m/s or less for only the last 0.6 s, so there is no long crawl before the stop

/*
 * After the stop sign the car takes the owner's route, as drawn on the picture:
 *   1. up the avenue, a right turn onto the street into the right (south) lane, right blinker on
 *   2. east along the street to the lot's east driveway, a left turn up the driveway, left blinker on before the turn
 *   3. north up the driveway, a left turn west into the aisle in front of the building, left blinker on again
 *   4. west along the aisle, a right turn into the reserved stall, right blinker on before the turn
 * It slows for every corner and brakes to a stop in the stall. All lengths are in metres, x east, z south.
 */
const EAST_X = 31.7, STREET_Z = 28.3, AISLE_Z = -1.9, R1 = 4.5, R2 = 6, R3 = 3.2, R4 = 2.6;
const V_MAX = 11, A_ACC = 2.6, A_DEC = 3.2, A_LAT = 3.2;   // m/s, m/s2, m/s2 sideways
type Mark = 'r1s' | 'r1e' | 'l1s' | 'l1e' | 'l2s' | 'l2e' | 'r2s' | 'r2e';
/*
 * The drive is built to be perfectly smooth at any frame rate:
 *   - the route (straights and quarter circles) is sampled every 2 cm, then eased: the car follows the average of the route
 *     over the metre around it, so it steers into and out of every corner progressively instead of snapping onto the arc,
 *     and its heading is the true direction of that eased line (it turns continuously, never in steps)
 *   - the speed is planned along the route (corner grip, engine, brakes), starts from rest and ends at rest, and is itself
 *     eased so the car never lurches; time follows exactly from it, and position in time is a smooth cubic, not a staircase
 */
const DS = .02, EASE = 1.0;   // grid step, and half the length the route is eased over (metres)
function buildPath(st: Stall) {
  const raw: [number, number][] = [], marks = {} as Record<Mark, number>;
  let x = LANE_X, z = STOP_Z, hx = 0, hz = -1, s = 0;
  const push = (px: number, pz: number) => { if (raw.length) s += Math.hypot(px - raw[raw.length - 1]![0], pz - raw[raw.length - 1]![1]); raw.push([px, pz]); };
  const mark = (m: Mark) => { marks[m] = s; };
  const straight = (len: number) => { const n = Math.max(2, Math.round(len / DS)); for (let i = 1; i <= n; i++) push(x + hx * len * i / n, z + hz * len * i / n); x += hx * len; z += hz * len; };
  /** side +1 turns right, -1 turns left, a quarter circle of radius r. x east, z south: right of (hx,hz) is (-hz,hx). */
  const turn = (side: 1 | -1, r: number) => {
    const px = side > 0 ? -hz : hz, pz = side > 0 ? hx : -hx;      // unit vector toward the centre
    const v0x = -px * r, v0z = -pz * r, cx = x - v0x, cz = z - v0z, n = Math.ceil((r * Math.PI / 2) / DS);
    for (let i = 1; i <= n; i++) { const a = side * (Math.PI / 2) * i / n, c = Math.cos(a), sn = Math.sin(a); push(cx + v0x * c - v0z * sn, cz + v0x * sn + v0z * c); }
    const a = side * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
    x = cx + v0x * c - v0z * sn; z = cz + v0x * sn + v0z * c; const nx = hx * c - hz * sn, nz = hx * sn + hz * c; hx = Math.round(nx); hz = Math.round(nz);
  };
  const h0: [number, number] = [hx, hz];
  push(x, z);
  straight(STOP_Z - (STREET_Z + R1));
  mark('r1s'); turn(1, R1); mark('r1e');
  straight(EAST_X - R2 - x);
  mark('l1s'); turn(-1, R2); mark('l1e');
  straight(z - (AISLE_Z + R3));
  mark('l2s'); turn(-1, R3); mark('l2e');
  straight(x - (st.x + R4));                                         // west along the aisle to this car's own stall
  mark('r2s'); turn(st.side, R4); mark('r2e');                       // right into a row A stall (nose north), left into a row B stall (nose south)
  straight(Math.abs(z - st.z));
  const len = s, h1: [number, number] = [hx, hz];
  // the route on an even 2 cm grid, carried on straight for a little before the start and after the end so the easing is exact there
  const rc = [0]; for (let i = 1; i < raw.length; i++) rc.push(rc[i - 1]! + Math.hypot(raw[i]![0] - raw[i - 1]![0], raw[i]![1] - raw[i - 1]![1]));
  const at = (sd: number): [number, number] => {
    if (sd <= 0) return [raw[0]![0] + h0[0] * sd, raw[0]![1] + h0[1] * sd];
    if (sd >= len) { const e = raw[raw.length - 1]!; return [e[0] + h1[0] * (sd - len), e[1] + h1[1] * (sd - len)]; }
    let lo = 0, hi = rc.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rc[mid]! <= sd) lo = mid; else hi = mid; }
    const f = (sd - rc[lo]!) / ((rc[hi]! - rc[lo]!) || 1); return [raw[lo]![0] + (raw[hi]![0] - raw[lo]![0]) * f, raw[lo]![1] + (raw[hi]![1] - raw[lo]![1]) * f];
  };
  const K = Math.round(EASE / DS), N = Math.round(len / DS), G0 = -2 * K, G = N + 4 * K + 1;   // grid index g covers s = (g + G0) * DS
  const gx = new Float64Array(G), gz = new Float64Array(G);
  for (let g = 0; g < G; g++) { const p = at((g + G0) * DS); gx[g] = p[0]; gz[g] = p[1]; }
  const cx = new Float64Array(G + 1), cz = new Float64Array(G + 1);
  for (let g = 0; g < G; g++) { cx[g + 1] = cx[g]! + gx[g]!; cz[g + 1] = cz[g]! + gz[g]!; }
  // eased position (window mean), heading (direction across the window) and curvature, for k = 0..N (s = k * DS)
  const px = new Float64Array(N + 1), pz = new Float64Array(N + 1), yaw = new Float64Array(N + 1), kap = new Float64Array(N + 1);
  for (let k = 0; k <= N; k++) {
    const g = k - G0, a = g - K, b = g + K, n = b - a + 1;
    px[k] = (cx[b + 1]! - cx[a]!) / n; pz[k] = (cz[b + 1]! - cz[a]!) / n;
    let y = Math.atan2(-(gz[b]! - gz[a]!), gx[b]! - gx[a]!);
    if (k) { const prev = yaw[k - 1]!; while (y - prev > Math.PI) y -= 2 * Math.PI; while (y - prev < -Math.PI) y += 2 * Math.PI; }
    yaw[k] = y;
  }
  for (let k = 0; k <= N; k++) kap[k] = Math.abs(yaw[Math.min(N, k + 1)]! - yaw[Math.max(0, k - 1)]!) / ((Math.min(N, k + 1) - Math.max(0, k - 1)) * DS);
  // speed along the route: corner grip, then the engine from rest, then the brakes to rest, then eased
  const v0 = new Float64Array(N + 1);
  for (let k = 0; k <= N; k++) v0[k] = kap[k]! > 1e-6 ? Math.min(V_MAX, Math.sqrt(A_LAT / kap[k]!)) : V_MAX;
  v0[0] = 0; for (let k = 1; k <= N; k++) v0[k] = Math.min(v0[k]!, Math.sqrt(v0[k - 1]! ** 2 + 2 * A_ACC * DS));
  v0[N] = 0; for (let k = N - 1; k >= 0; k--) v0[k] = Math.min(v0[k]!, Math.sqrt(v0[k + 1]! ** 2 + 2 * A_DEC * DS));
  const vs = new Float64Array(N + 1), cv = new Float64Array(N + 2), M = Math.round(1.2 / DS);
  for (let k = 0; k <= N; k++) cv[k + 1] = cv[k]! + v0[k]!;
  for (let k = 0; k <= N; k++) { const w = Math.min(M, k, N - k); vs[k] = (cv[k + w + 1]! - cv[k - w]!) / (2 * w + 1); }
  // time at each grid point: exact for steady acceleration across a 2 cm step; the last step ends at rest
  const tm = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) tm[k] = tm[k - 1]! + 2 * DS / Math.max(1e-4, vs[k - 1]! + vs[k]!);
  return { N, len: N * DS, px, pz, yaw, vs, tm, T: tm[N]!, marks };
}
let PATH = buildPath(STALLS[CAST]);
/** The stall this page load's car parks in. */
export let STALL_NOW: Stall = STALLS[CAST];
/** How long the drive from the stop sign to the stall takes. */
export let T_DRIVE = PATH.T;
/** When the car comes to rest in the stall, and when the whole opening shot ends. */
export let T_PARKED = T_GO + PATH.T;
export let T_END = T_PARKED + 3.2 + 28.9;
const CACHE: { wide?: ReturnType<typeof series>; narrow?: ReturnType<typeof series> } = {};
/** Change the car's stall (used by tests; the page picks its stall once, from the cast). */
export function setStall(st: Stall) { STALL_NOW = st; PATH = buildPath(st); T_DRIVE = PATH.T; T_PARKED = T_GO + PATH.T; T_END = T_PARKED + 3.2 + 28.9; CACHE.wide = CACHE.narrow = undefined; }
const tAtS = (sd: number) => { const k = Math.max(0, Math.min(PATH.N - 1, Math.floor(sd / DS))), f = Math.max(0, Math.min(1, sd / DS - k)); return PATH.tm[k]! + (PATH.tm[k + 1]! - PATH.tm[k]!) * f; };
/** Distance along the drive at time tau: a cubic between grid points that matches both distance and speed, so motion is smooth at any frame rate. */
const sAt = (tau: number) => {
  const { tm, vs, N } = PATH; if (tau <= 0) return 0; if (tau >= PATH.T) return N * DS;
  let lo = 0, hi = N; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tm[mid]! <= tau) lo = mid; else hi = mid; }
  const h = tm[hi]! - tm[lo]!, u = (tau - tm[lo]!) / (h || 1), u2 = u * u, u3 = u2 * u;
  const sd = (2 * u3 - 3 * u2 + 1) * lo * DS + (u3 - 2 * u2 + u) * h * vs[lo]! + (-2 * u3 + 3 * u2) * hi * DS + (u3 - u2) * h * vs[hi]!;
  return Math.max(lo * DS, Math.min(hi * DS, sd));
};
const atTime = (tau: number) => {
  const { px, pz, yaw, N } = PATH, sd = sAt(Math.max(0, Math.min(PATH.T, tau)));
  const k = Math.min(N - 1, Math.floor(sd / DS)), f = sd / DS - k;
  return { x: px[k]! + (px[k + 1]! - px[k]!) * f, z: pz[k]! + (pz[k + 1]! - pz[k]!) * f, yaw: yaw[k]! + (yaw[k + 1]! - yaw[k]!) * f, s: sd };
};
/** Which blinker is on at a distance s along the drive: on before each turn, off a little after it. */
function signalAt(s: number) {
  const M = PATH.marks, within = (a: number, b: number) => s >= a && s <= b;
  const last = within(M.r2s - 8, M.r2e + 1.2);                       // the blinker for the turn into the stall, on the side the stall is on
  const right = within(0, M.r1e + 1.5) || (STALL_NOW.side > 0 && last);
  const left = within(M.l1s - 9, M.l1e + 2) || within(M.l2s - 7, M.l2e + 1.5) || (STALL_NOW.side < 0 && last);
  return { left, right };
}
/** The height of the ground under the car. The whole site is one level surface now, so it is the same everywhere. */
export function groundAt(_x?: number, _z?: number) {
  return .002;
}
/** Where the car is at time t. yaw is the model's rotation.y: pi/2 means nose toward the building. t3 is when it sets off from the stop sign. */
export function carAt(t: number, t3 = T_GO): { x: number; y: number; z: number; yaw: number; moving: boolean; left: boolean; right: boolean } {
  if (t < T_STOP) return { x: LANE_X, y: .002, z: carZ1(t), yaw: Math.PI / 2, moving: true, left: false, right: t >= T_STOP - T_SIGNAL_LEAD };
  if (t < t3) return { x: LANE_X, y: .002, z: STOP_Z, yaw: Math.PI / 2, moving: false, left: false, right: true };   // waiting at the sign to turn right
  const q = atTime(t - t3), sg = signalAt(q.s);
  return { x: q.x, y: groundAt(q.x, q.z), z: q.z, yaw: q.yaw, moving: t - t3 < PATH.T, left: sg.left, right: sg.right };
}

// ---------- the camera ----------
type Key = { t: number; p: V3; l: V3; fov: number };
const MON: V3 = [10.4, 1.9, 15.2];   // the black DrivingKlass sign
const ease3 = (u: number) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
function keysFor(narrow: boolean): Key[] {
  const f = (w: number, n: number) => (narrow ? n : w), fv = (w: V3, n: V3): V3 => (narrow ? n : w);
  const out: Key[] = [], fov = f(40, 56);
  // A. a high roadside post, a little before the stop sign: the car comes toward it and the camera pans to keep it in view
  const C0: V3 = fv([-7, 14, 64], [-8, 16, 70]);
  const post = (t: number): V3 => [C0[0] + .12 * t, C0[1] + .06 * t, C0[2] + .1 * t];
  // the slow push in on the stop sign: it starts while the car is still braking and is still easing in after the car pulls away,
  // so it never stops and the hand-over to the tracking shot is a long, gentle blend
  const NEAR: V3 = fv([-1.8, 6.6, 50.5], [-2.4, 7.8, 54.5]), MID: V3 = [3.6, 1.5, 38.6];
  const Z0 = 6.5, Z1 = T_GO + 3.5, zoom = (t: number) => { const u = Math.min(1, Math.max(0, (t - Z0) / (Z1 - Z0))); return u * u * u * (u * (6 * u - 15) + 10); };
  const drift = (t: number): V3 => { const a = post(Math.min(t, Z1)), k = zoom(t); return [a[0] + (NEAR[0] - a[0]) * k, a[1] + (NEAR[1] - a[1]) * k, a[2] + (NEAR[2] - a[2]) * k]; };
  const lookA = (t: number): V3 => { const tt = Math.min(t, T_STOP), carL: V3 = [LANE_X + 2.2 * (tt / T_STOP), 3.2, carZ1(tt) - 4 - 4 * (tt / T_STOP)], k = zoom(t); return [carL[0] + (MID[0] - carL[0]) * k, carL[1] + (MID[1] - carL[1]) * k, carL[2] + (MID[2] - carL[2]) * k]; };
  for (let t = 0; t < T_GO + 1e-6; t += .1) out.push({ t, p: drift(t), l: lookA(t), fov });
  // B. tracking the drive from above. SW of the car through the first turns, then across to a south-east vantage that holds the
  //    whole lot, the black sign and the stall in one frame while the car crosses in front of the building
  const off1: V3 = fv([-9.5, 11.5, 17], [-11, 13, 20]), off2: V3 = fv([-13, 12.5, 14], [-14, 14.5, 17]);
  const M = PATH.marks, tl1e = T_GO + tAtS(M.l1e), tl2s = T_GO + tAtS(M.l2s), tl2e = T_GO + tAtS(M.l2e);
  const sx = STALL_NOW.x, V1: V3 = fv([24 + .3 * sx, 10.5, 28], [27 + .3 * sx, 12.5, 36]);   // the vantage leans toward the stall the car is heading for
  for (let t = T_GO + .1; t <= T_PARKED + 1e-6; t += .1) {   // dense keys: the camera tracks the car exactly, no interpolation sag between keys
    const c = carAt(t, T_GO), cp: V3 = [c.x, .002, c.z];   // the lens ignores the 13 cm driveway apron, so the frame never bobs
    const uw = Math.min(1, Math.max(0, (t - T_GO - .4) / 7)), w0 = uw * uw * uw * (uw * (6 * uw - 15) + 10);   // the long hand-over
    const w1 = ease3((t - tl1e) / 3.2);                         // off1 -> off2 once it is heading up the driveway
    const o: V3 = [off1[0] + (off2[0] - off1[0]) * w1, off1[1] + (off2[1] - off1[1]) * w1, off1[2] + (off2[2] - off1[2]) * w1];
    const follow: V3 = [cp[0] + o[0], cp[1] + o[1], cp[2] + o[2]], hold = drift(t);
    const base: V3 = [hold[0] + (follow[0] - hold[0]) * w0, hold[1] + (follow[1] - hold[1]) * w0, hold[2] + (follow[2] - hold[2]) * w0];
    const w2 = ease3((t - tl2s) / (tl2e + 2.4 - tl2s)), dv = Math.max(0, t - tl2s);
    const vant: V3 = [V1[0] - .3 * dv, V1[1] + .02 * dv, V1[2] - .15 * dv];
    const p: V3 = [base[0] + (vant[0] - base[0]) * w2, base[1] + (vant[1] - base[1]) * w2, base[2] + (vant[2] - base[2]) * w2];
    const lead = Math.min(1, (t - T_GO) / 1.5);
    const lf: V3 = [cp[0] + (MON[0] - cp[0]) * .06 * w2, cp[1] + .9, cp[2] + (MON[2] - cp[2]) * .05 * w2], la = lookA(t);
    out.push({ t, p, l: [la[0] + (lf[0] - la[0]) * w0, la[1] + (lf[1] - la[1]) * w0, la[2] + (lf[2] - la[2]) * w0], fov: fov * (1 + .0 * lead) });
  }
  // C. the car is parked: only now does the camera let go of it
  const signD = f(24.6, 31), signFov = f(40, 54), swoopFov = f(40, 54), tp = T_PARKED, base = tp + 3.2;
  out.push({ t: base, p: [9.6, 2.4, signD], l: [10.4, 1.9, 15.2], fov: signFov });
  out.push({ t: base + 2.2, p: [9.6, 2.4, signD], l: [10.4, 1.9, 15.2], fov: signFov });
  out.push({ t: base + 3.4, p: [6.2, 8.6, 18.0], l: [4.0, 3.0, 4.0], fov: signFov });
  out.push({ t: base + 5.6, p: [1.2, 8.2, 8.0], l: [1.2, 2.6, -6.0], fov: swoopFov });
  out.push({ t: base + 7.8, p: [.8, 3.4, -8.6], l: [1.3, 2.7, -14.4], fov: f(34, 46) });
  const doorZ = f(-12.9, -12.0), doorFov = f(31, 46);   // close enough that OPEN (or CLOSED) fills the screen, with the whole sign in view
  out.push({ t: base + 9.4, p: [1.05, 2.72, doorZ], l: [1.45, 2.86, -14.4], fov: doorFov });
  out.push({ t: base + 11.4, p: [1.05, 2.72, doorZ], l: [1.45, 2.86, -14.4], fov: doorFov });
  out.push({ t: base + 13.4, p: [1.5, 2.3, -11.0], l: [2.2, 1.4, -9.8], fov: f(30, 44) });
  out.push({ t: base + 15.6, p: [2.0, 1.45, -6.7], l: [2.7, .83, -9.45], fov: f(34, 46) });   // the hours board sits in the clear band between the header and the buttons
  out.push({ t: base + 18.4, p: [2.0, 1.45, -6.7], l: [2.7, .83, -9.45], fov: f(34, 46) });
  out.push({ t: base + 21.4, p: [1.4, 6.0, -1.5], l: [.5, 3.0, -14.0], fov: f(38, 54) });
  out.push({ t: base + 23.9, p: [3.0, 9.8, 10.5], l: [0, 6.0, -15.0], fov: f(40, 56) });
  out.push({ t: base + 26.4, p: [14.0, 10.5, 22.0], l: [-2, 8.0, -14.0], fov: f(40, 58) });
  out.push({ t: T_END, p: [34, 7.5, 33], l: [-2, 8.2, -15], fov: f(40, 58) });
  return out;
}
/** The camera pose at time t. Narrow is the portrait phone framing. */
export function introAt(t: number, narrow = false): Pose {
  const S = (CACHE[narrow ? 'narrow' : 'wide'] ??= series(keysFor(narrow)));
  return { p: [S.px(t), S.py(t), S.pz(t)], l: [S.lx(t), S.ly(t), S.lz(t)], fov: S.fov(t) };
}

/** Shared clock: the rig advances it, the car reads it. Lets the car carry on if the visitor takes the camera. */
export const intro = { t: 0, t3: T_GO, done: false };
/** The opening shot's clock waits while the splash video covers the scene; the page lets it go as the splash fades. */
export const introHold = { v: false };
/** True once the scene's files are in and every shader is compiled and drawn once: the splash waits for it before it lets go. */
export const sceneWarm = { v: false };
/** True while the school car is actually rolling (on the avenue, or between the stop sign and its stall). */
export function carMoving() { return !intro.done && (intro.t < T_STOP || (intro.t >= intro.t3 && intro.t < intro.t3 + T_DRIVE + .3)); }
/** Called when the visitor takes the camera mid-shot: the car carries on with its route (no waiting for the tour). */
export function releaseCar() { if (intro.t < T_GO) intro.t3 = Math.max(T_STOP + .6, intro.t + (intro.t < T_STOP ? 0 : .4)); }
/** No opening shot (repeat visit, reduced motion, ?intro=0): the car is simply parked in its stall. */
export function parkCarNow() { intro.t = T_END + T_DRIVE + 1; intro.t3 = 0; intro.done = true; }

/** The car's own state during the drive from the stop sign to the stall: distance along the route, speed, and where the route's turns are (for the PARKING sign). */
export function introCarState(t = intro.t, t3 = intro.t3) {
  const c = carAt(t, t3);
  if (t < t3) return { x: c.x, z: c.z, yaw: c.yaw, left: c.left, right: c.right, s: -1, v: 0 };
  const q = atTime(t - t3), k = Math.min(PATH.N - 1, Math.floor(q.s / DS)), f = q.s / DS - k;
  return { x: c.x, z: c.z, yaw: c.yaw, left: c.left, right: c.right, s: q.s, v: PATH.vs[k]! + (PATH.vs[k + 1]! - PATH.vs[k]!) * f };
}
/** Distances along the route: the left turn up the driveway ends at l1e; the left turn into the aisle starts at l2s. */
export const introMarks = () => PATH.marks;
/** Is the car at rest in its stall? */
export const introParked = () => intro.done || intro.t >= intro.t3 + T_DRIVE + .3;
