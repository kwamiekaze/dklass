/**
 * Every picture the Atlanta world is painted with, drawn on canvases at run time (no files to download): the pavement, the green guide signs with
 * their route shields, the amber message boards, the billboards and the skylines. All of it is deterministic, so a stage looks the same every time.
 */
import * as THREE from 'three';
import type { Arrow, GuideSign, Shield, Skyline } from './stageTypes';
import type { Layout } from './layout';
import { LANE } from './layout';
import overpassUrl from './fonts/overpass-latin-700-normal.woff2?url';

/** Every canvas texture is cached by key, so a recycled billboard or sign never makes a new one. Phones run out of canvas memory otherwise. */
const CACHE = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T { let v = CACHE.get(key) as T | undefined; if (v === undefined) { v = make(); CACHE.set(key, v); } return v; }
export function disposeAtlTextures() {
  for (const v of CACHE.values()) {
    const o = v as { map?: THREE.Texture; sil?: THREE.Texture; lit?: THREE.Texture; dispose?: () => void };
    o.dispose?.(); o.map?.dispose?.(); o.sil?.dispose?.(); o.lit?.dispose?.();
  }
  CACHE.clear();
}
const mkCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c: HTMLCanvasElement, srgb = true, aniso = 8) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
function rngOf(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ------------------------------------------------------------------ pavement ---
export const ROAD_TILE = 36;                  // metres of road per repeat of the texture
export interface RoadTex { map: THREE.CanvasTexture; x0: number; x1: number }

/** The player's carriageway (and, on a two-way road, the whole road). `x0..x1` is the span of the texture in metres. */
export function roadTexture(lay: Layout, opts: { concrete: boolean; hov: boolean; rural: boolean; seed: number; opposite?: boolean; passing?: boolean }): RoadTex {
  const own = !opts.opposite;
  const x0 = lay.kind === 'twoway' ? lay.edgeL : own ? lay.padL : lay.onPadL;
  const x1 = lay.kind === 'twoway' ? lay.edgeR : own ? lay.padR : lay.onPadR;
  const wm = x1 - x0, PX = 1024 / Math.max(wm, 6), W = 1024, H = 1536, ppmV = H / ROAD_TILE;
  const c = mkCanvas(W, H), g = c.getContext('2d')!;
  const r = rngOf(opts.seed);
  const X = (m: number) => (m - x0) * PX;
  // surface
  const base = opts.concrete ? [152, 154, 156] : opts.rural ? [58, 59, 62] : [52, 54, 60];
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, W, H);
  // grain
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * (opts.concrete ? 16 : 22); d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  // slabs or seams
  g.strokeStyle = opts.concrete ? 'rgba(60,62,66,.35)' : 'rgba(20,20,24,.25)'; g.lineWidth = opts.concrete ? 2 : 1.4;
  const step = opts.concrete ? 4.6 : 12;
  for (let y = 0; y < ROAD_TILE; y += step) { g.beginPath(); g.moveTo(0, y * ppmV); g.lineTo(W, y * ppmV); g.stroke(); }
  // patches and stains
  for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, w = 30 + r() * 120, h = 40 + r() * 220; { const v = r() > 0.5 ? 18 : 230; g.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.04})`; } g.fillRect(x, y, w, h); }
  // tyre paths in every lane
  const lanes = lay.kind === 'twoway' ? [...lay.xs, ...lay.onXs] : own ? lay.xs : lay.onXs;
  for (const lx of lanes) for (const o of [-0.85, 0.85]) { const gr = g.createLinearGradient(X(lx + o - 0.4), 0, X(lx + o + 0.4), 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${opts.concrete ? 0.09 : 0.14})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(X(lx + o - 0.4), 0, 0.8 * PX, H); }
  // paint
  const solid = (xm: number, color: string, wm2 = 0.16) => { g.fillStyle = color; g.fillRect(X(xm) - (wm2 * PX) / 2, 0, wm2 * PX, H); };
  const dashed = (xm: number, color: string, dash = 3, gap = 9, wm2 = 0.15) => { g.fillStyle = color; for (let y = 0; y < ROAD_TILE; y += dash + gap) g.fillRect(X(xm) - (wm2 * PX) / 2, y * ppmV, wm2 * PX, dash * ppmV); };
  const WHITE = '#f3f1ea', YEL = '#f0b81c';
  if (lay.kind === 'divided') {
    const laneL = (own ? lay.xs[0]! : lay.onXs[lay.onXs.length - 1]!) - LANE / 2;
    const laneR = (own ? lay.xs[lay.xs.length - 1]! : lay.onXs[0]!) + LANE / 2;
    const n = own ? lay.lanes : lay.onXs.length;
    // inside edge: yellow, on the side next to the median
    if (own) { solid(laneL, YEL); }
    else { solid(laneR, YEL); }
    solid(own ? laneR : laneL, WHITE);
    // lane dividers
    for (let i = 1; i < n; i++) {
      const xm = (own ? lay.xs[i - 1]! + LANE / 2 : lay.onXs[i - 1]! - LANE / 2);
      if (own && opts.hov && i === 1) { solid(xm - 0.1, WHITE, 0.13); solid(xm + 0.1, WHITE, 0.13); } else dashed(xm, WHITE);
    }
    // rumble strip beside the right edge line
    g.fillStyle = 'rgba(0,0,0,.28)';
    const rx = own ? laneR + 0.35 : laneL - 0.35;
    for (let y = 0; y < ROAD_TILE; y += 0.32) g.fillRect(X(rx) - 0.12 * PX, y * ppmV, 0.24 * PX, 3);
    // HOV diamonds
    if (own && opts.hov) {
      const cx = X(lay.xs[0]!); g.fillStyle = WHITE;
      for (let y = 6; y < ROAD_TILE; y += 18) { const cy = y * ppmV, hw = 0.55 * PX, hh = 1.6 * ppmV; g.beginPath(); g.moveTo(cx, cy - hh); g.lineTo(cx + hw, cy); g.lineTo(cx, cy + hh); g.lineTo(cx - hw, cy); g.closePath(); g.lineWidth = 6; g.strokeStyle = WHITE; g.stroke(); }
    }
  } else {
    // two-way road: double yellow, passing zones on rural roads, white edge lines
    const cx = lay.centre ?? 0;
    solid(cx - 0.09, YEL, 0.12); solid(cx + 0.09, YEL, 0.12);
    if (opts.passing) { g.fillStyle = c.getContext('2d') ? '' : ''; g.fillStyle = base ? `rgb(${base[0]},${base[1]},${base[2]})` : '#333'; g.fillRect(X(cx + 0.09) - 0.1 * PX, 0, 0.2 * PX, H / 2); dashed(cx + 0.09, YEL, 3, 9, 0.12); g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(X(cx + 0.09) - 0.1 * PX, H / 2, 0.2 * PX, 0); }
    solid(lay.edgeL + lay.shoulderL, WHITE, 0.14);
    solid(lay.xs[lay.xs.length - 1]! + LANE / 2 + (lay.shoulderR > lay.shoulderL ? 0 : 0), lay.shoulderR > lay.shoulderL + 1 ? '#f3f1ea' : WHITE, 0.14);
    for (let i = 1; i < lay.lanes; i++) dashed(lay.xs[i - 1]! + LANE / 2, WHITE, 3, 9, 0.13);
    for (let j = 1; j < lay.onXs.length; j++) dashed(lay.onXs[j - 1]! - LANE / 2, WHITE, 3, 9, 0.13);
    if (lay.shoulderR > lay.shoulderL + 1) { g.fillStyle = 'rgba(243,241,234,.7)'; const px0 = lay.xs[lay.xs.length - 1]! + LANE / 2 + 0.5; for (let y = 2; y < ROAD_TILE; y += 7) g.fillRect(X(px0) - 0.05 * PX, y * ppmV, 0.1 * PX, 2.2 * ppmV); }
  }
  const t = tex(c, true, 8); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return { map: t, x0, x1 };
}

/** Paint on the road that is not a repeat: crossings, stop bars, yield triangles, rails, the exit-only word. Drawn once, laid out in metres on a plane. */
function decalTexture_raw(kind: 'crosswalk' | 'stopbar' | 'yield' | 'rail' | 'rrx' | 'exitonly' | 'school' | 'gore'): { map: THREE.CanvasTexture; w: number; l: number } {
  const c = mkCanvas(1024, 512), g = c.getContext('2d')!; g.clearRect(0, 0, 1024, 512);
  const W = '#f3f1ea';
  let w = 14, l = 7;
  if (kind === 'crosswalk') {
    g.fillStyle = W; for (let i = 0; i < 18; i++) g.fillRect(40 + i * 54, 40, 30, 432); w = 14; l = 4.2;
  } else if (kind === 'stopbar') {
    g.fillStyle = W; g.fillRect(0, 180, 1024, 150); w = 14; l = 0.8;
  } else if (kind === 'yield') {
    g.fillStyle = W; const n = 14; for (let i = 0; i < n; i++) { const x = 20 + i * 72; g.beginPath(); g.moveTo(x, 30); g.lineTo(x + 52, 30); g.lineTo(x + 26, 470); g.closePath(); g.fill(); } w = 10; l = 1.6;
  } else if (kind === 'rail') {
    // ties and two rails across the road, with the crossing buck marks
    g.fillStyle = '#2c241d'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#4a3b2c'; for (let i = 0; i < 20; i++) g.fillRect(0, 12 + i * 25, 1024, 15);
    const rail = (y: number) => { const gr = g.createLinearGradient(0, y, 0, y + 28); gr.addColorStop(0, '#d9d7d1'); gr.addColorStop(0.5, '#8d8b86'); gr.addColorStop(1, '#4a4946'); g.fillStyle = gr; g.fillRect(0, y, 1024, 28); };
    rail(150); rail(334);
    w = 14; l = 4.6;
  } else if (kind === 'rrx') {
    // the yellow advance warning on the road: a ring around an X with an R on each side, stretched along the lane
    const Y = '#f0c02a'; g.strokeStyle = Y; g.fillStyle = Y; g.lineCap = 'butt';
    g.lineWidth = 18; g.beginPath(); g.ellipse(512, 256, 400, 224, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 26; g.beginPath(); g.moveTo(330, 90); g.lineTo(694, 422); g.moveTo(694, 90); g.lineTo(330, 422); g.stroke();
    g.font = '700 260px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(190, 256); g.fillText('R', 0, 0); g.restore(); g.save(); g.translate(834, 256); g.fillText('R', 0, 0); g.restore();
    w = 3.0; l = 7;
  } else if (kind === 'exitonly') {
    g.fillStyle = W; g.font = '700 220px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(512, 256); g.scale(1, 1.9); g.fillText('EXIT', 0, -60); g.font = '700 150px "Arial Black", Arial, sans-serif'; g.fillText('ONLY', 0, 90); g.restore(); w = 3.4; l = 9;
  } else if (kind === 'school') {
    g.fillStyle = W; g.font = '700 230px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(512, 256); g.scale(1, 1.7); g.fillText('SCHOOL', 0, 0); g.restore(); w = 6; l = 8;
  } else {
    // gore chevrons: white diagonal stripes between the mainline and the ramp
    g.fillStyle = W; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(0, i * 40); g.lineTo(1024, i * 40 + 190); g.lineTo(1024, i * 40 + 210); g.lineTo(0, i * 40 + 20); g.fill(); } w = 3.6; l = 40;
  }
  const t = tex(c, true, 8); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return { map: t, w, l };
}

// ------------------------------------------------------------------ shields and signs ---
// ------------------------------------------------------------------ guide signs ---
// Drawn the way the FHWA sign manual (MUTCD) and GDOT build them: FHWA green with a white border and rounded corners, Highway Gothic lettering
// (Overpass is the open font cut from it), mixed-case town names, the exit number on its own plaque at the top right, a yellow EXIT ONLY band
// with black arrows, real Interstate / US / Georgia route shields. Blue boards for services, brown for places to visit, a green mileage list.
const GREEN = '#006747', BLUE = '#003f87', BROWN = '#6a3b1c', YELLOW = '#ffcc00';
let FONT = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
const font = (px: number, w = 700) => `${w} ${px}px ${FONT}`;
/** signs drawn before the sign font arrived are drawn again when it does, on the same canvas */
const redraw: (() => void)[] = [];
let fontReady = false;
if (typeof document !== 'undefined' && typeof FontFace !== 'undefined') {
  const f = new FontFace('DK Highway', `url(${overpassUrl}) format('woff2')`, { weight: '700' });
  f.load().then((ff) => { (document.fonts as unknown as { add: (x: FontFace) => void }).add(ff); FONT = `"DK Highway", ${FONT}`; fontReady = true; for (const r of redraw.splice(0)) { try { r(); } catch { /* a disposed canvas: nothing to do */ } } }).catch(() => { fontReady = true; redraw.length = 0; });
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
/** a sign blank: colour, white border set in from the edge, rounded corners */
function blank(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, fg = '#fff', r = 30) {
  g.fillStyle = bg; rr(g, x, y, w, h, r); g.fill();
  g.strokeStyle = fg; g.lineWidth = 7; rr(g, x + 9, y + 9, w - 18, h - 18, r - 8); g.stroke();
}

function interstatePath(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
  g.beginPath(); g.moveTo(l, t + h * 0.1);
  g.bezierCurveTo(l + w * 0.12, t + h * 0.02, l + w * 0.34, t - h * 0.02, cx, t + h * 0.05);
  g.bezierCurveTo(r - w * 0.34, t - h * 0.02, r - w * 0.12, t + h * 0.02, r, t + h * 0.1);
  g.bezierCurveTo(r + w * 0.01, t + h * 0.34, r - w * 0.02, t + h * 0.58, r - w * 0.1, t + h * 0.72);
  g.bezierCurveTo(r - w * 0.2, t + h * 0.86, cx + w * 0.08, b - h * 0.04, cx, b);
  g.bezierCurveTo(cx - w * 0.08, b - h * 0.04, l + w * 0.2, t + h * 0.86, l + w * 0.1, t + h * 0.72);
  g.bezierCurveTo(l + w * 0.02, t + h * 0.58, l - w * 0.01, t + h * 0.34, l, t + h * 0.1);
  g.closePath();
}
function usPath(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const l = cx - w / 2, r = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
  g.beginPath(); g.moveTo(l + w * 0.06, t + h * 0.02);
  g.quadraticCurveTo(l + w * 0.2, t + h * 0.12, l + w * 0.32, t + h * 0.03);
  g.quadraticCurveTo(cx, t + h * 0.12, r - w * 0.32, t + h * 0.03);
  g.quadraticCurveTo(r - w * 0.2, t + h * 0.12, r - w * 0.06, t + h * 0.02);
  g.quadraticCurveTo(r - w * 0.02, t + h * 0.16, r, t + h * 0.27);
  g.bezierCurveTo(r - w * 0.1, t + h * 0.42, r + w * 0.06, t + h * 0.66, r - w * 0.16, t + h * 0.84);
  g.quadraticCurveTo(cx + w * 0.12, t + h * 0.9, cx, b);
  g.quadraticCurveTo(cx - w * 0.12, t + h * 0.9, l + w * 0.16, t + h * 0.84);
  g.bezierCurveTo(l - w * 0.06, t + h * 0.66, l + w * 0.1, t + h * 0.42, l, t + h * 0.27);
  g.quadraticCurveTo(l + w * 0.02, t + h * 0.16, l + w * 0.06, t + h * 0.02);
  g.closePath();
}
/** the outline of the state: Georgia's route marker is the state itself */
const GA_SHAPE: [number, number][] = [[0.04, 0.02], [0.6, 0.02], [0.63, 0.1], [0.75, 0.22], [0.87, 0.36], [0.98, 0.5], [0.95, 0.6], [0.91, 0.75], [0.87, 0.9], [0.84, 0.985], [0.76, 0.93], [0.72, 0.985], [0.66, 0.955], [0.24, 0.94], [0.17, 0.95], [0.15, 0.8], [0.11, 0.66], [0.13, 0.5], [0.1, 0.36]];
function gaPath(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) { g.beginPath(); GA_SHAPE.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](cx - w / 2 + x * w, cy - h / 2 + y * h)); g.closePath(); }

const shieldW = (s: Shield, h: number) => h * (s.t === 'GA' ? (s.n.length >= 3 ? 1.08 : 0.95) : s.n.length >= 3 ? 1.2 : 1.0);
/** Draw a route shield centred at cx,cy with the given height; returns its width. */
export function drawShield(g: CanvasRenderingContext2D, s: Shield, cx: number, cy: number, h: number): number {
  const w = shieldW(s, h);
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  if (s.t === 'I') {
    interstatePath(g, cx, cy, w, h); g.fillStyle = '#fff'; g.fill();
    interstatePath(g, cx, cy + h * 0.004, w * 0.92, h * 0.92); g.fillStyle = '#003f87'; g.fill();
    g.save(); interstatePath(g, cx, cy + h * 0.004, w * 0.92, h * 0.92); g.clip(); g.fillStyle = '#c1121f'; g.fillRect(cx - w, cy - h / 2, w * 2, h * 0.265); g.fillStyle = '#fff'; g.fillRect(cx - w, cy - h / 2 + h * 0.265, w * 2, h * 0.028); g.restore();
    g.fillStyle = '#fff'; g.font = font(h * 0.105); g.fillText('INTERSTATE', cx, cy - h * 0.335);
    g.font = font(h * (s.n.length >= 3 ? 0.46 : 0.56)); g.fillText(s.n, cx, cy + h * 0.115);
  } else if (s.t === 'US') {
    usPath(g, cx, cy, w, h); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = h * 0.035; g.stroke();
    g.fillStyle = '#111'; g.font = font(h * (s.n.length >= 3 ? 0.46 : 0.58)); g.fillText(s.n, cx, cy + h * 0.03);
  } else {
    gaPath(g, cx, cy, w, h); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#111'; g.lineWidth = h * 0.03; g.stroke();
    g.fillStyle = '#111'; g.font = font(h * (s.n.length >= 3 ? 0.4 : 0.5)); g.fillText(s.n, cx - w * 0.04, cy - h * 0.04);
  }
  if (s.b) { g.fillStyle = '#fff'; g.font = font(h * 0.2); g.fillText(s.b, cx, cy - h * 0.62); }
  g.restore();
  return w;
}
/** the MUTCD guide sign arrow: a long shaft with a broad head */
function drawArrow(g: CanvasRenderingContext2D, a: Arrow, cx: number, cy: number, s: number, color = '#fff') {
  g.save(); g.translate(cx, cy); g.fillStyle = color;
  const rot: Record<Arrow, number> = { up: 0, upright: Math.PI / 4, upleft: -Math.PI / 4, right: Math.PI / 2, left: -Math.PI / 2, down: Math.PI };
  g.rotate(rot[a]);
  g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(s * 0.36, -s * 0.06); g.lineTo(s * 0.2, -s * 0.06); g.lineTo(s * 0.105, -s * 0.2); g.lineTo(s * 0.105, s * 0.5); g.lineTo(-s * 0.105, s * 0.5); g.lineTo(-s * 0.105, -s * 0.2); g.lineTo(-s * 0.2, -s * 0.06); g.lineTo(-s * 0.36, -s * 0.06); g.closePath(); g.fill();
  g.restore();
}
/** text that shrinks until it fits */
function fit(g: CanvasRenderingContext2D, text: string, px: number, max: number, min = 26) { let f = px; g.font = font(f); while (g.measureText(text).width > max && f > min) { f -= 2; g.font = font(f); } return f; }
/** a cardinal direction, the first letter taller than the rest (NORTH) */
function cardinal(g: CanvasRenderingContext2D, word: string, x: number, y: number, px: number, align: 'left' | 'center' = 'left') {
  g.save(); g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const big = font(px), small = font(px * 0.82);
  g.font = big; const w0 = g.measureText(word[0]!).width; g.font = small; const w1 = g.measureText(word.slice(1)).width;
  const x0 = align === 'center' ? x - (w0 + w1) / 2 : x;
  g.font = big; g.fillText(word[0]!, x0, y); g.font = small; g.fillText(word.slice(1), x0 + w0 + 1, y);
  g.restore(); return w0 + w1;
}
const frac = (d: string) => d.replace('1/2', '½').replace('1/4', '¼').replace('3/4', '¾');

type PanelSpec = { shields?: Shield[]; dir?: string; dests: string[]; arrows?: Arrow[]; exitOnly?: boolean; tab?: string; dist?: string; left?: boolean };
const PW = 640, PH = 470, TAB = 104, GUT = 14;
function drawPanel(g: CanvasRenderingContext2D, p: PanelSpec, x: number, y: number, w: number, h: number) {
  blank(g, x, y, w, h, GREEN);
  const band = p.exitOnly ? 92 : 0, foot = p.dist ? 84 : p.arrows?.length && !p.exitOnly ? 112 : 0;
  const top = y + 26, bottom = y + h - 22 - band - foot;
  // what has to fit: one row of shields with the direction beside them, then the town lines
  const sh = p.shields?.length ? (p.dests.length > 2 ? 118 : p.dests.length > 1 ? 140 : 164) : 0;
  const lines = p.dests, room = bottom - top - (sh ? sh + 16 : 0);
  const lh = Math.min(lines.length > 2 ? 84 : 98, room / Math.max(1, lines.length)), fs = Math.min(86, lh * 0.9);
  const blockH = (sh ? sh + 16 : 0) + lh * lines.length;
  let cy = top + Math.max(0, (bottom - top - blockH) / 2);
  if (p.shields?.length) {
    const gap = 16, ws = p.shields.map((s) => shieldW(s, sh)), dirPx = 62;
    g.font = font(dirPx); const dw = p.dir ? g.measureText(p.dir).width * 0.9 + 18 : 0;
    const tw = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1) + dw;
    const k = Math.min(1, (w - 60) / tw);
    let sx = x + w / 2 - (tw * k) / 2;
    p.shields.forEach((s, i) => { drawShield(g, s, sx + (ws[i]! * k) / 2, cy + sh / 2 + (s.b ? 8 : 0), sh * k * (s.b ? 0.88 : 1)); sx += (ws[i]! + gap) * k; });
    if (p.dir) cardinal(g, p.dir, sx + 2, cy + sh / 2 + dirPx * 0.36, dirPx * k);
    cy += sh + 16;
  } else if (p.dir) { cardinal(g, p.dir, x + w / 2, cy + 52, 62, 'center'); cy += 66; }
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const ln of lines) { fit(g, ln, fs, w - 56); g.fillText(ln, x + w / 2, cy + lh / 2); cy += lh; }
  if (p.dist) { g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(62); g.fillText(frac(p.dist), x + w / 2, y + h - 22 - band - 38); }
  else if (p.arrows?.length && !p.exitOnly) { const n = p.arrows.length, sp = Math.min(130, (w - 120) / n); p.arrows.forEach((a, i) => drawArrow(g, a, x + w / 2 + (i - (n - 1) / 2) * sp, y + h - 22 - 56, 104)); }
  if (p.exitOnly) {
    // the yellow band across the foot of the sign: EXIT (arrow) ONLY in black
    const by = y + h - 18 - band, bx = x + 18, bw = w - 36;
    g.fillStyle = YELLOW; rr(g, bx, by, bw, band, 14); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; rr(g, bx + 5, by + 5, bw - 10, band - 10, 10); g.stroke();
    g.fillStyle = '#111'; g.textBaseline = 'middle'; g.font = font(50);
    g.textAlign = 'right'; g.fillText('EXIT', x + w / 2 - 56, by + band / 2 + 2); g.textAlign = 'left'; g.fillText('ONLY', x + w / 2 + 56, by + band / 2 + 2);
    drawArrow(g, p.arrows?.[0] ?? 'upright', x + w / 2, by + band / 2, 70, '#111');
  }
}
/** the exit number plaque: its own small sign on top of the panel, at the right for a right-hand exit, yellow LEFT at the left for a left-hand one */
function drawTab(g: CanvasRenderingContext2D, p: PanelSpec, x: number, w: number) {
  if (!p.tab) return;
  const isExit = /^EXIT/.test(p.tab);
  g.textBaseline = 'middle';
  if (!isExit) { const tw = Math.min(w - 40, 300), tx = x + (w - tw) / 2; blank(g, tx, 4, tw, TAB - 6, YELLOW, '#111', 18); g.fillStyle = '#111'; g.textAlign = 'center'; g.font = font(46); g.fillText(p.tab, tx + tw / 2, TAB / 2 + 2); return; }
  const m = /^EXIT\s+(\d+)\s*([A-Z-]*)$/.exec(p.tab), num = m?.[1] ?? p.tab.replace(/^EXIT\s*/, ''), suf = m?.[2] ?? '';
  g.font = font(54); const wE = g.measureText('EXIT').width; g.font = font(76); const wN = g.measureText(num).width; g.font = font(60); const wS = suf ? g.measureText(suf).width + 10 : 0;
  const lw = p.left ? 130 : 0, tw = wE + wN + wS + 66 + lw, tx = p.left ? x + 8 : x + w - tw - 8;
  blank(g, tx, 4, tw, TAB - 6, GREEN, '#fff', 18);
  if (p.left) { g.fillStyle = YELLOW; rr(g, tx + 14, 16, lw - 6, TAB - 30, 8); g.fill(); g.fillStyle = '#111'; g.textAlign = 'center'; g.font = font(40); g.fillText('LEFT', tx + 14 + (lw - 6) / 2, TAB / 2 + 2); }
  g.fillStyle = '#fff'; g.textAlign = 'left';
  let cx = tx + 26 + lw; g.font = font(54); g.fillText('EXIT', cx, TAB / 2 + 5); cx += wE + 14; g.font = font(76); g.fillText(num, cx, TAB / 2 + 3); cx += wN + 10; if (suf) { g.font = font(60); g.fillText(suf, cx, TAB / 2 + 5); }
}

// ---- the little pictures on the blue service board
function icon(g: CanvasRenderingContext2D, kind: string, cx: number, cy: number, s: number) {
  g.save(); g.translate(cx, cy); g.fillStyle = '#fff'; rr(g, -s / 2, -s / 2, s, s, s * 0.14); g.fill(); g.fillStyle = BLUE; g.strokeStyle = BLUE; g.lineWidth = s * 0.07; g.lineCap = 'round'; g.lineJoin = 'round';
  const u = s / 100;
  if (kind === 'GAS') { rr(g, -26 * u, -30 * u, 34 * u, 62 * u, 5 * u); g.fill(); g.fillStyle = '#fff'; g.fillRect(-20 * u, -23 * u, 22 * u, 16 * u); g.beginPath(); g.moveTo(8 * u, -6 * u); g.lineTo(22 * u, -6 * u); g.lineTo(22 * u, 22 * u); g.quadraticCurveTo(22 * u, 30 * u, 30 * u, 26 * u); g.lineTo(30 * u, -18 * u); g.lineTo(20 * u, -28 * u); g.stroke(); }
  else if (kind === 'FOOD') { g.beginPath(); g.moveTo(-18 * u, -32 * u); g.lineTo(-18 * u, 34 * u); g.moveTo(-28 * u, -32 * u); g.lineTo(-28 * u, -8 * u); g.quadraticCurveTo(-18 * u, 2 * u, -8 * u, -8 * u); g.lineTo(-8 * u, -32 * u); g.stroke(); g.beginPath(); g.moveTo(18 * u, 34 * u); g.lineTo(18 * u, -32 * u); g.quadraticCurveTo(34 * u, -20 * u, 30 * u, 4 * u); g.lineTo(18 * u, 4 * u); g.fill(); g.stroke(); }
  else if (kind === 'LODGING') { g.fillRect(-36 * u, -2 * u, 72 * u, 14 * u); g.fillRect(-36 * u, -24 * u, 8 * u, 50 * u); g.fillRect(28 * u, 4 * u, 8 * u, 22 * u); g.beginPath(); g.arc(-16 * u, -12 * u, 8 * u, 0, 7); g.fill(); rr(g, -4 * u, -16 * u, 36 * u, 14 * u, 5 * u); g.fill(); }
  else { g.font = font(s * 0.78); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 0, s * 0.04); }
  g.restore();
}
function drawService(g: CanvasRenderingContext2D, s: GuideSign, W: number, H: number) {
  blank(g, 0, 0, W, H, BLUE);
  const icons = s.icons ?? [], n = icons.length, sz = Math.min(150, (W - 60 - (n - 1) * 22) / n), tw = n * sz + (n - 1) * 22;
  icons.forEach((k, i) => { const cx = W / 2 - tw / 2 + sz / 2 + i * (sz + 22); icon(g, k, cx, 40 + sz / 2, sz); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(k.length > 6 ? 26 : 32); g.fillText(k, cx, 40 + sz + 26); });
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(66); g.fillText(s.tab ?? 'NEXT RIGHT', W / 2, H - 62);
}
function drawBrown(g: CanvasRenderingContext2D, s: GuideSign, W: number, H: number) {
  blank(g, 0, 0, W, H, BROWN);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = s.dests, lh = Math.min(84, (H - 150) / lines.length);
  lines.forEach((ln, i) => { fit(g, ln, 64, W - 70); g.fillText(ln, W / 2, 46 + lh / 2 + i * lh); });
  g.font = font(58); g.fillText(s.tab ?? 'NEXT RIGHT', W / 2, H - 58);
}
function drawMileage(g: CanvasRenderingContext2D, s: GuideSign, W: number, H: number) {
  blank(g, 0, 0, W, H, GREEN);
  const rows = s.rows ?? [], lh = (H - 60) / rows.length;
  g.fillStyle = '#fff'; g.textBaseline = 'middle';
  rows.forEach(([place, mi], i) => { const y = 30 + lh / 2 + i * lh; fit(g, place, 66, W - 250); g.textAlign = 'left'; g.fillText(place, 48, y); g.font = font(66); g.textAlign = 'right'; g.fillText(String(mi), W - 48, y); });
}
function drawWelcome(g: CanvasRenderingContext2D, s: GuideSign, W: number, H: number) {
  const ga = /Georgia/.test(s.dests.join(' '));
  if (ga) {
    // Georgia's line sign: a peach, "Welcome", and "We're glad Georgia's on your mind"
    blank(g, 0, 0, W, H, '#f7f3e8', '#1d3a6b');
    g.fillStyle = '#1d3a6b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 700 96px Georgia, "Times New Roman", serif`; g.fillText('Welcome', W / 2 + 70, 110);
    const px = 150, py = 118; const gr = g.createRadialGradient(px - 18, py - 18, 6, px, py, 70); gr.addColorStop(0, '#ffd08a'); gr.addColorStop(0.6, '#ff9a4a'); gr.addColorStop(1, '#e8632a');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, 62, 0, 7); g.fill(); g.strokeStyle = 'rgba(160,60,20,.5)'; g.lineWidth = 4; g.beginPath(); g.moveTo(px - 6, py - 60); g.quadraticCurveTo(px - 26, py, px - 4, py + 60); g.stroke();
    g.fillStyle = '#3f8f3a'; g.beginPath(); g.ellipse(px + 34, py - 62, 34, 13, -0.5, 0, 7); g.fill(); g.fillStyle = '#6b4a2a'; g.fillRect(px - 3, py - 78, 6, 20);
    g.fillStyle = '#1d3a6b'; rr(g, 26, 214, W - 52, H - 240, 16); g.fill();
    g.fillStyle = '#fff'; g.font = `italic 700 62px Georgia, "Times New Roman", serif`; g.fillText("We're glad Georgia's", W / 2, 274); g.fillText('on your mind', W / 2, 346);
    g.font = font(30); g.fillStyle = '#ffcf7a'; g.fillText('STATE LINE', W / 2, H - 46);
  } else {
    blank(g, 0, 0, W, H, '#0b4a8f');
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `italic 700 70px Georgia, "Times New Roman", serif`; g.fillText(s.dests[0] ?? 'Welcome to', W / 2, 110);
    g.font = `italic 700 84px Georgia, "Times New Roman", serif`; fitSerif(g, s.dests[1] ?? '', 84, W - 70); g.fillText(s.dests[1] ?? '', W / 2, 222);
    g.fillStyle = '#ffcf7a'; g.font = font(40); g.fillText('STATE LINE', W / 2, 330);
    g.fillStyle = '#fff'; g.font = font(30); g.fillText('The road turns back toward Atlanta', W / 2, H - 52);
  }
}
function fitSerif(g: CanvasRenderingContext2D, t: string, px: number, max: number) { let f = px; g.font = `italic 700 ${f}px Georgia, "Times New Roman", serif`; while (g.measureText(t).width > max && f > 30) { f -= 2; g.font = `italic 700 ${f}px Georgia, "Times New Roman", serif`; } }

export interface SignTex { map: THREE.CanvasTexture; aspect: number }
const signCache = new Map<string, SignTex>();
function guideSignTexture_raw(s: GuideSign): SignTex {
  const key = JSON.stringify(s); const hit = signCache.get(key); if (hit) return hit;
  const style = s.style ?? 'guide';
  let W: number, H: number, paint: (g: CanvasRenderingContext2D) => void;
  if (style === 'guide') {
    const panels: PanelSpec[] = [{ shields: s.shields, dir: s.dir, dests: s.dests, arrows: s.arrows, exitOnly: s.exitOnly, tab: s.tab, dist: s.dist, left: s.left }, ...(s.also ?? [])];
    W = PW * panels.length + GUT * (panels.length - 1); H = PH + TAB;
    paint = (g) => { g.clearRect(0, 0, W, H); panels.forEach((p, i) => { const x = i * (PW + GUT); drawPanel(g, p, x, TAB, PW, PH); drawTab(g, p, x, PW); }); };
  } else if (style === 'service') { W = 640; H = 400; paint = (g) => { g.clearRect(0, 0, W, H); drawService(g, s, W, H); }; }
  else if (style === 'brown') { W = 640; H = 150 + 84 * s.dests.length; paint = (g) => { g.clearRect(0, 0, W, H); drawBrown(g, s, W, H); }; }
  else if (style === 'mileage') { W = 720; H = 60 + 96 * (s.rows?.length ?? 1); paint = (g) => { g.clearRect(0, 0, W, H); drawMileage(g, s, W, H); }; }
  else { W = 760; H = 440; paint = (g) => { g.clearRect(0, 0, W, H); drawWelcome(g, s, W, H); }; }
  const c = mkCanvas(W, H), g = c.getContext('2d')!; paint(g);
  const out = { map: tex(c, true, 8), aspect: W / H };
  if (!fontReady) redraw.push(() => { paint(g); out.map.needsUpdate = true; });
  signCache.set(key, out); return out;
}

/** A Georgia mile marker: the direction, the route shield, MILE and the number, with the tenth below. */
function mileMarkerTexture_raw(route: Shield, dir: string, mile: number, tenth: number): THREE.CanvasTexture {
  const W = 200, H = 560, c = mkCanvas(W, H), g = c.getContext('2d')!;
  const paint = () => {
    g.clearRect(0, 0, W, H); blank(g, 0, 0, W, H, GREEN, '#fff', 18);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(54); g.fillText(dir[0] ?? '', W / 2, 52);
    drawShield(g, route, W / 2, 142, 104);
    g.fillStyle = '#fff'; g.font = font(40); g.fillText('MILE', W / 2, 232);
    const digits = String(mile); g.font = font(digits.length > 2 ? 78 : 100); g.fillText(digits, W / 2, 322);
    g.fillRect(34, 392, W - 68, 5); g.font = font(86); g.fillText(String(tenth), W / 2, 468);
  };
  paint(); const t = tex(c, true, 4); if (!fontReady) redraw.push(() => { paint(); t.needsUpdate = true; });
  return t;
}

/** The amber message board over the road (Georgia 511 style). */
function vmsTexture_raw(lines: string[]): THREE.CanvasTexture {
  const W = 1280, H = 360, c = mkCanvas(W, H), g = c.getContext('2d')!;
  g.fillStyle = '#07080a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#2a2d33'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(255,170,0,.85)'; g.shadowBlur = 16; g.fillStyle = '#ffb21a';
  const fs = lines.length > 2 ? 62 : 82; g.font = `700 ${fs}px "Courier New", monospace`;
  lines.slice(0, 3).forEach((ln, i) => { let f = fs; g.font = `700 ${f}px "Courier New", monospace`; while (g.measureText(ln).width > W - 80 && f > 30) { f -= 2; g.font = `700 ${f}px "Courier New", monospace`; } g.fillText(ln, W / 2, H / (lines.length + 1) * (i + 1)); });
  g.shadowBlur = 0; g.globalAlpha = 0.18; g.fillStyle = '#000'; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
  return tex(c);
}

function regulatoryTexture_raw(kind: 'speed' | 'keepright' | 'hov' | 'noTrucksLeft' | 'handsfree' | 'moveover' | 'trainx' | 'yield' | 'circle' | 'school' | 'workers' | 'rightLaneEnds', n = 70): THREE.CanvasTexture {
  const W = 512, H = 640, c = mkCanvas(W, H), g = c.getContext('2d')!; g.clearRect(0, 0, W, H);
  const plate = (bg: string, fg: string) => { g.fillStyle = '#111'; roundRect(g, 8, 8, W - 16, H - 16, 36); g.fill(); g.fillStyle = bg; roundRect(g, 22, 22, W - 44, H - 44, 28); g.fill(); g.strokeStyle = fg; g.lineWidth = 10; roundRect(g, 36, 36, W - 72, H - 72, 20); g.stroke(); };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'speed') { plate('#fff', '#111'); g.fillStyle = '#111'; g.font = '700 84px "Arial Narrow", Arial, sans-serif'; g.fillText('SPEED', W / 2, 150); g.fillText('LIMIT', W / 2, 235); g.font = '800 270px "Arial Black", Arial, sans-serif'; g.fillText(String(n), W / 2, 450); }
  else if (kind === 'keepright') { plate('#fff', '#111'); g.fillStyle = '#111'; g.font = '700 74px "Arial Narrow", Arial, sans-serif'; ['SLOWER', 'TRAFFIC', 'KEEP', 'RIGHT'].forEach((t, i) => g.fillText(t, W / 2, 130 + i * 100)); drawArrow2(g, W / 2 + 120, 540, 70, '#111'); }
  else if (kind === 'hov') { plate('#fff', '#111'); g.fillStyle = '#111'; g.font = '800 110px "Arial Black", Arial, sans-serif'; g.fillText('HOV', W / 2, 150); g.font = '700 80px Arial, sans-serif'; g.fillText('2+', W / 2, 260); g.font = '700 60px "Arial Narrow", Arial, sans-serif'; g.fillText('RIDERS', W / 2, 350); g.fillText('ONLY', W / 2, 420); drawDiamond(g, W / 2, 520, 44); }
  else if (kind === 'noTrucksLeft') { plate('#fff', '#111'); g.fillStyle = '#111'; g.font = '700 70px "Arial Narrow", Arial, sans-serif'; ['TRUCKS', 'USE RIGHT', '2 LANES'].forEach((t, i) => g.fillText(t, W / 2, 190 + i * 110)); }
  else if (kind === 'handsfree') { plate('#00694a', '#fff'); g.fillStyle = '#fff'; g.font = '800 82px "Arial Narrow", Arial, sans-serif'; g.fillText('HANDS-FREE', W / 2, 150); g.fillText('GEORGIA', W / 2, 245); g.font = '700 64px "Arial Narrow", Arial, sans-serif'; g.fillText('IT\'S THE LAW', W / 2, 360); g.fillText('PHONE DOWN', W / 2, 450); g.fillText('EYES UP', W / 2, 530); }
  else if (kind === 'moveover') { plate('#fff', '#111'); g.fillStyle = '#111'; g.font = '800 92px "Arial Narrow", Arial, sans-serif'; g.fillText('MOVE', W / 2, 160); g.fillText('OVER', W / 2, 270); g.font = '700 56px "Arial Narrow", Arial, sans-serif'; g.fillText('FOR EMERGENCY', W / 2, 390); g.fillText('VEHICLES', W / 2, 455); g.fillText('IT\'S THE LAW', W / 2, 525); }
  else if (kind === 'trainx') { g.fillStyle = '#111'; roundRect(g, 8, 8, W - 16, H - 16, 12); g.fill(); g.save(); g.translate(W / 2, 220); g.rotate(-0.62); g.fillStyle = '#f4f1ea'; g.fillRect(-250, -48, 500, 96); g.rotate(1.24); g.fillRect(-250, -48, 500, 96); g.restore(); g.fillStyle = '#111'; g.font = '800 54px Arial, sans-serif'; g.save(); g.translate(W / 2, 220); g.rotate(-0.62); g.fillText('RAILROAD', 0, 4); g.rotate(1.24); g.fillText('CROSSING', 0, 4); g.restore(); g.fillStyle = '#f4f1ea'; g.fillRect(70, 470, W - 140, 90); g.fillStyle = '#111'; g.font = '800 54px Arial, sans-serif'; g.fillText('2 TRACKS', W / 2, 516); }
  else if (kind === 'yield') { g.fillStyle = '#c8102e'; g.beginPath(); g.moveTo(40, 80); g.lineTo(W - 40, 80); g.lineTo(W / 2, H - 100); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(110, 130); g.lineTo(W - 110, 130); g.lineTo(W / 2, H - 200); g.closePath(); g.fill(); g.fillStyle = '#c8102e'; g.font = '800 82px Arial, sans-serif'; g.fillText('YIELD', W / 2, 210); }
  else if (kind === 'circle') { plate('#f2b705', '#111'); g.strokeStyle = '#111'; g.lineWidth = 16; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W / 2, H / 2, 120, i * 2.1 + 0.3, i * 2.1 + 1.6); g.stroke(); const a = i * 2.1 + 1.6; g.fillStyle = '#111'; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * 120 + 26 * Math.cos(a + 1.6), H / 2 + Math.sin(a) * 120 + 26 * Math.sin(a + 1.6)); g.lineTo(W / 2 + Math.cos(a) * 120 - 26 * Math.cos(a + 1.6), H / 2 + Math.sin(a) * 120 - 26 * Math.sin(a + 1.6)); g.lineTo(W / 2 + Math.cos(a + 0.45) * 120, H / 2 + Math.sin(a + 0.45) * 120); g.fill(); } }
  else if (kind === 'school') { plate('#e6ff2a', '#111'); g.fillStyle = '#111'; g.font = '800 70px "Arial Narrow", Arial, sans-serif'; g.fillText('SCHOOL', W / 2, 140); g.font = '800 160px "Arial Black", Arial, sans-serif'; g.fillText('25', W / 2, 330); g.font = '700 54px "Arial Narrow", Arial, sans-serif'; g.fillText('WHEN FLASHING', W / 2, 470); }
  else if (kind === 'workers') { g.fillStyle = '#ff7a1a'; g.save(); g.translate(W / 2, H / 2); g.rotate(Math.PI / 4); g.fillRect(-190, -190, 380, 380); g.restore(); g.fillStyle = '#111'; g.font = '800 74px "Arial Narrow", Arial, sans-serif'; g.fillText('ROAD', W / 2, H / 2 - 40); g.fillText('WORK', W / 2, H / 2 + 50); }
  else { g.fillStyle = '#f2b705'; g.save(); g.translate(W / 2, H / 2); g.rotate(Math.PI / 4); g.fillRect(-190, -190, 380, 380); g.restore(); g.fillStyle = '#111'; g.font = '800 62px "Arial Narrow", Arial, sans-serif'; g.fillText('RIGHT', W / 2, H / 2 - 50); g.fillText('LANE', W / 2, H / 2 + 10); g.fillText('ENDS', W / 2, H / 2 + 70); }
  return tex(c);
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawArrow2(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) { g.save(); g.translate(cx, cy); g.fillStyle = color; g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(s * 0.34, -s * 0.05); g.lineTo(s * 0.12, -s * 0.05); g.lineTo(s * 0.12, s * 0.5); g.lineTo(-s * 0.12, s * 0.5); g.lineTo(-s * 0.12, -s * 0.05); g.lineTo(-s * 0.34, -s * 0.05); g.closePath(); g.fill(); g.restore(); }
function drawDiamond(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) { g.fillStyle = '#111'; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.62, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.62, cy); g.closePath(); g.fill(); }

/** Roadside ads: all made up (the game never uses a real company's name), plus DrivingKlass's own. */
const ADS: { a: string; b: string; c: string; bg: string; fg: string }[] = [
  { a: 'DRIVINGKLASS', b: 'Where 5 Star Drivers Are Made', c: 'Carrollton · Book a Klass', bg: '#0c1634', fg: '#f2c14e' },
  { a: 'PEACH STATE HOMES', b: 'Move-in ready · Metro Atlanta', c: 'Tour today', bg: '#ff9a5c', fg: '#fff7ec' },
  { a: 'DRIVINGKLASS.COM', b: 'Learn to drive with confidence', c: 'Book your first lesson today', bg: '#14224a', fg: '#ffe08a' },
  { a: 'PECAN & PEACH DINER', b: 'Biscuits all day', c: 'Next exit', bg: '#7a2d1e', fg: '#ffe9bf' },
  { a: 'HANDS-FREE GEORGIA', b: 'Phone down · Eyes up', c: 'It\'s the law', bg: '#00694a', fg: '#ffffff' },
  { a: 'DRIVINGKLASS', b: 'Road test prep · Teens and adults', c: 'Georgia lessons · drivingklass.com', bg: '#0c1634', fg: '#f2c14e' },
  { a: 'CHATTAHOOCHEE OUTFITTERS', b: 'Kayaks · Tubes · Trails', c: 'Open daily', bg: '#16466e', fg: '#e8f4ff' },
  { a: 'MAGNOLIA REALTY', b: 'Home is where the porch is', c: 'Call us', bg: '#f4f1ea', fg: '#6a2f2f' },
  { a: 'DRIVINGKLASS', b: 'Parents: your teen is in good hands', c: 'Carrollton 30117 · Book a lesson', bg: '#1a0f33', fg: '#f2c14e' },
  { a: 'GEORGIA 511', b: 'Know before you go', c: 'Traffic · Weather · Cameras', bg: '#101820', fg: '#ffb21a' },
  { a: 'BOILED PEANUTS', b: 'Hot, salty, Georgia-grown', c: 'Fresh at the next stand', bg: '#6b4a2b', fg: '#fff1d6' },
  { a: 'SWEET TEA & BISCUITS', b: 'Y\'all come back now', c: 'Family kitchen · Open early', bg: '#b0302a', fg: '#fff3da' },
  { a: 'BUCKLE UP, GEORGIA', b: 'Click it before you pull out', c: 'Every seat · Every trip', bg: '#0f4c3a', fg: '#ffe08a' },
  { a: 'FRIDAY NIGHT LIGHTS', b: 'Cheer loud, drive sober', c: 'Go home safe after the game', bg: '#1b2a57', fg: '#ffd166' },
  { a: 'GEORGIA PEACHES', b: 'Sweet as summer · Roadside stand', c: 'Next right', bg: '#ff8a5b', fg: '#fffaf0' },
  { a: 'COTTON MILL LOFTS', b: 'Downtown living · Carrollton', c: 'Now leasing', bg: '#3b3f46', fg: '#f4efe6' },
  { a: 'MOVE OVER, GEORGIA', b: 'Slow down or change lanes', c: 'For police, tow and HERO trucks', bg: '#14224a', fg: '#ffb21a' },
  { a: 'WEST GEORGIA FARMERS MARKET', b: 'Pecans · Honey · Collards', c: 'Saturdays · Come hungry', bg: '#2e6b3a', fg: '#fff6d8' },
];
function adTexture_raw(i: number): THREE.CanvasTexture {
  const ad = ADS[((i % ADS.length) + ADS.length) % ADS.length]!;
  const W = 1536, H = 576, c = mkCanvas(W, H), g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, ad.bg); gr.addColorStop(1, shade(ad.bg, -0.25)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = ad.fg; g.globalAlpha = 0.8; g.lineWidth = 10; g.strokeRect(18, 18, W - 36, H - 36); g.globalAlpha = 1;
  g.fillStyle = ad.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let f = 120; g.font = `800 ${f}px "Arial Black", Arial, sans-serif`; while (g.measureText(ad.a).width > W - 140 && f > 40) { f -= 4; g.font = `800 ${f}px "Arial Black", Arial, sans-serif`; } g.fillText(ad.a, W / 2, 200);
  g.font = '600 66px Georgia, serif'; g.fillText(ad.b, W / 2, 330); g.font = '700 54px Arial, sans-serif'; g.globalAlpha = 0.85; g.fillText(ad.c, W / 2, 450);
  if (i % ADS.length === 0) { g.globalAlpha = 1; g.font = '700 64px Georgia, serif'; for (let k = 0; k < 5; k++) { g.fillStyle = '#f2c14e'; g.fillText('★', W / 2 - 160 + k * 80, 70); } }
  return tex(c);
}
const shade = (hex: string, k: number) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return `#${c.getHexString()}`; };

// ------------------------------------------------------------------ skylines ---
export interface SkylineTex { sil: THREE.CanvasTexture; lit: THREE.CanvasTexture; width: number; height: number }
type Top = 'flat' | 'spire' | 'pyramid' | 'dome' | 'crown' | 'step' | 'antenna' | 'slant';
const skyCache = new Map<string, SkylineTex>();

function skylineTexture_raw(kind: Skyline, seed = 7): SkylineTex {
  const key = `${kind}:${seed}`; const hit = skyCache.get(key); if (hit) return hit;
  const W = 2048, H = 320, c = mkCanvas(W, H), g = c.getContext('2d')!, c2 = mkCanvas(W, H), l = c2.getContext('2d')!;
  const r = rngOf(seed + strHash(kind));
  g.clearRect(0, 0, W, H); l.clearRect(0, 0, W, H);
  const ground = H - 4;
  const windows = (x: number, y: number, w: number, h: number, density = 0.55) => {
    const cols = Math.max(2, Math.floor(w / 9)), rows = Math.max(2, Math.floor(h / 11));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (r() < density) { l.fillStyle = r() > 0.2 ? 'rgba(255,214,140,.95)' : 'rgba(210,230,255,.9)'; l.fillRect(x + 4 + i * ((w - 8) / cols), y + 6 + j * ((h - 12) / rows), Math.max(2, (w - 8) / cols - 3), Math.max(2, (h - 12) / rows - 4)); }
  };
  const tower = (x: number, w: number, h: number, top: Top = 'flat', shade2 = 1, win = 0.55) => {
    const y = ground - h; g.fillStyle = `rgba(255,255,255,${shade2})`; g.fillRect(x, y, w, h);
    const cx = x + w / 2;
    if (top === 'spire') { g.fillRect(cx - 1.5, y - h * 0.18, 3, h * 0.18); g.beginPath(); g.moveTo(x + w * 0.1, y); g.lineTo(cx, y - h * 0.08); g.lineTo(x + w * 0.9, y); g.fill(); }
    if (top === 'pyramid') { g.beginPath(); g.moveTo(x, y); g.lineTo(cx, y - w * 0.9); g.lineTo(x + w, y); g.fill(); g.fillRect(cx - 1.5, y - w * 0.9 - 26, 3, 26); l.fillStyle = 'rgba(255,205,110,.95)'; l.beginPath(); l.moveTo(x + 3, y - 1); l.lineTo(cx, y - w * 0.9 + 2); l.lineTo(x + w - 3, y - 1); l.fill(); }
    if (top === 'dome') { g.beginPath(); g.arc(cx, y, w / 2, Math.PI, 0); g.fill(); }
    if (top === 'crown') { g.fillRect(x + w * 0.15, y - 16, w * 0.7, 16); g.fillRect(x + w * 0.3, y - 30, w * 0.4, 14); g.fillRect(cx - 1.5, y - 52, 3, 22); }
    if (top === 'step') { g.fillRect(x + w * 0.12, y - h * 0.08, w * 0.76, h * 0.08); g.fillRect(x + w * 0.28, y - h * 0.15, w * 0.44, h * 0.07); }
    if (top === 'antenna') { g.fillRect(cx - 1.2, y - 44, 2.4, 44); }
    if (top === 'slant') { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y - 24); g.lineTo(x + w, y); g.fill(); }
    windows(x, y, w, h, win);
  };
  const hills = (amp: number, base: number, shade2: number, freq = 1) => { g.fillStyle = `rgba(255,255,255,${shade2})`; g.beginPath(); g.moveTo(0, ground); for (let x = 0; x <= W; x += 8) g.lineTo(x, ground - base - amp * (0.5 + 0.5 * Math.sin(x / (210 * freq) + seed)) - amp * 0.35 * Math.sin(x / (73 * freq) + 2)); g.lineTo(W, ground); g.closePath(); g.fill(); };
  const pines = (y0: number, density: number, hmin = 18, hmax = 46, shade2 = 1) => { g.fillStyle = `rgba(255,255,255,${shade2})`; for (let x = 0; x < W; x += 5 + r() * (14 / density)) { const h = hmin + r() * (hmax - hmin), w = h * 0.34; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + w / 2, y0 - h); g.lineTo(x + w, y0); g.fill(); } };

  if (kind === 'downtown' || kind === 'midtown' || kind === 'buckhead' || kind === 'perimeter') {
    // a far layer of mid-rise, then the signature towers, then the near layer
    for (let x = 0; x < W; x += 22 + r() * 40) tower(x, 24 + r() * 46, 40 + r() * 70, 'flat', 0.55, 0.3);
    const big = kind === 'downtown' ? [
      { x: 880, w: 74, h: 262, top: 'pyramid' as Top },          // the tallest: a slim tower with a pyramid crown and a mast
      { x: 740, w: 60, h: 200, top: 'step' as Top }, { x: 1010, w: 66, h: 214, top: 'crown' as Top }, { x: 1130, w: 56, h: 176, top: 'slant' as Top },
      { x: 620, w: 70, h: 160, top: 'flat' as Top }, { x: 1250, w: 62, h: 150, top: 'step' as Top }, { x: 520, w: 48, h: 120, top: 'antenna' as Top },
    ] : kind === 'midtown' ? [
      { x: 560, w: 56, h: 240, top: 'spire' as Top }, { x: 700, w: 64, h: 214, top: 'flat' as Top }, { x: 840, w: 52, h: 262, top: 'slant' as Top }, { x: 980, w: 70, h: 190, top: 'step' as Top }, { x: 1120, w: 60, h: 226, top: 'antenna' as Top }, { x: 1260, w: 66, h: 170, top: 'crown' as Top },
    ] : kind === 'buckhead' ? [
      { x: 640, w: 58, h: 200, top: 'slant' as Top }, { x: 780, w: 64, h: 228, top: 'flat' as Top }, { x: 930, w: 54, h: 188, top: 'step' as Top }, { x: 1070, w: 62, h: 214, top: 'spire' as Top }, { x: 1210, w: 58, h: 172, top: 'flat' as Top },
    ] : [
      { x: 700, w: 80, h: 150, top: 'flat' as Top }, { x: 860, w: 70, h: 176, top: 'slant' as Top }, { x: 1000, w: 90, h: 140, top: 'flat' as Top }, { x: 1170, w: 66, h: 164, top: 'step' as Top },
    ];
    for (const b of big) tower(b.x, b.w, b.h, b.top, 1, 0.5);
    if (kind === 'downtown') {
      // the round hotel tower with a domed top, the gold-domed capitol, and the stadium's low roof
      g.fillStyle = '#fff'; g.fillRect(810, ground - 190, 52, 190); g.beginPath(); g.arc(836, ground - 190, 26, Math.PI, 0); g.fill(); windows(810, ground - 190, 52, 190, 0.5);
      g.fillStyle = '#fff'; g.fillRect(1380, ground - 52, 96, 52); g.beginPath(); g.arc(1428, ground - 52, 26, Math.PI, 0); g.fill(); g.fillRect(1426, ground - 98, 4, 22);
      l.fillStyle = 'rgba(255,200,90,1)'; l.beginPath(); l.arc(1428, ground - 52, 26, Math.PI, 0); l.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(1500, ground); g.quadraticCurveTo(1560, ground - 120, 1680, ground - 22); g.lineTo(1680, ground); g.fill(); g.beginPath(); g.moveTo(1500, ground); g.quadraticCurveTo(1590, ground - 76, 1760, ground); g.fill();
    }
    for (let x = 0; x < W; x += 30 + r() * 60) if (r() > 0.4) tower(x, 30 + r() * 40, 30 + r() * 64, 'flat', 0.9, 0.4);
  } else if (kind === 'carrollton' || kind === 'suburb' || kind === 'hills') {
    hills(36, 50, 0.5, 1.6); hills(24, 26, 0.8, 1.1); pines(ground - 20, 1.4, 20, 52, 1);
    if (kind === 'carrollton') {
      // the courthouse clock tower, a church spire, a water tower and a few low brick blocks
      g.fillStyle = '#fff'; g.fillRect(900, ground - 112, 40, 112); g.fillRect(895, ground - 126, 50, 14); g.beginPath(); g.moveTo(900, ground - 126); g.lineTo(920, ground - 168); g.lineTo(940, ground - 126); g.fill(); l.fillStyle = 'rgba(255,230,170,1)'; l.fillRect(912, ground - 104, 16, 16);
      g.fillRect(1180, ground - 78, 34, 78); g.beginPath(); g.moveTo(1176, ground - 78); g.lineTo(1197, ground - 150); g.lineTo(1218, ground - 78); g.fill();
      g.fillRect(480, ground - 96, 6, 96); g.fillRect(530, ground - 96, 6, 96); g.beginPath(); g.ellipse(508, ground - 112, 38, 24, 0, 0, Math.PI * 2); g.fill(); g.fillRect(470, ground - 128, 76, 6);
      for (let k = 0; k < 14; k++) { const x = 600 + r() * 900; tower(x, 30 + r() * 40, 26 + r() * 40, 'flat', 0.85, 0.35); }
    }
  } else if (kind === 'airport') {
    for (let x = 0; x < W; x += 60 + r() * 90) tower(x, 40 + r() * 70, 22 + r() * 26, 'flat', 0.75, 0.2);
    // control tower
    g.fillStyle = '#fff'; g.fillRect(1000, ground - 220, 14, 220); g.beginPath(); g.moveTo(980, ground - 220); g.lineTo(1034, ground - 220); g.lineTo(1050, ground - 252); g.lineTo(964, ground - 252); g.closePath(); g.fill(); g.fillRect(996, ground - 280, 22, 28); g.fillRect(1006, ground - 320, 3, 40);
    l.fillStyle = 'rgba(255,230,170,1)'; l.fillRect(972, ground - 248, 70, 6);
    for (let k = 0; k < 5; k++) { const x = 300 + k * 330; g.fillStyle = '#fff'; g.fillRect(x, ground - 38, 240, 38); g.beginPath(); g.moveTo(x, ground - 38); g.quadraticCurveTo(x + 120, ground - 70, x + 240, ground - 38); g.fill(); windows(x, ground - 38, 240, 38, 0.5); }
    pines(ground - 4, 1.8, 10, 26, 0.7);
  } else if (kind === 'stonemtn') {
    pines(ground - 6, 1.6, 16, 40, 0.6);
    // a huge bare granite dome
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(180, ground); g.bezierCurveTo(420, ground - 170, 720, ground - 230, 980, ground - 205); g.bezierCurveTo(1280, ground - 190, 1480, ground - 120, 1740, ground); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 12; k++) { const x = 320 + r() * 1300; g.fillRect(x, ground - 60 - r() * 120, 4 + r() * 18, 2); } g.globalCompositeOperation = 'source-over';
    pines(ground - 2, 1.8, 12, 30, 1);
  } else if (kind === 'cobb') {
    hills(30, 40, 0.55, 1.8); g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(1180, ground); g.quadraticCurveTo(1420, ground - 160, 1700, ground); g.fill();
    for (let x = 300; x < 1000; x += 30 + r() * 50) tower(x, 36 + r() * 40, 60 + r() * 120, r() > 0.6 ? 'spire' : 'flat', 0.9, 0.5);
    pines(ground - 4, 1.4, 16, 40, 1);
  } else { pines(ground - 4, 1.2, 20, 50, 1); }
  const sil = tex(c, true, 4), lit = tex(c2, true, 4);
  sil.wrapS = lit.wrapS = THREE.RepeatWrapping;
  const out = { sil, lit, width: W, height: H }; skyCache.set(key, out); return out;
}

/** a soft round light for lamps and tail lights */
function softDot_raw(): THREE.CanvasTexture {
  const c = mkCanvas(64, 64), g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c, true, 1);
}

export const decalTexture = (kind: Parameters<typeof decalTexture_raw>[0]) => memo(`d:${kind}`, () => decalTexture_raw(kind));
export const guideSignTexture = (sg: GuideSign) => memo(`g:${JSON.stringify(sg)}`, () => guideSignTexture_raw(sg));
export const vmsTexture = (lines: string[]) => memo(`v:${lines.join('|')}`, () => vmsTexture_raw(lines));
export const regulatoryTexture = (kind: Parameters<typeof regulatoryTexture_raw>[0], n = 70) => memo(`r:${kind}:${n}`, () => regulatoryTexture_raw(kind, n));
export const adTexture = (i: number) => memo(`a:${((i % ADS.length) + ADS.length) % ADS.length}`, () => adTexture_raw(i));
export const skylineTexture = (kind: Skyline, seed = 7) => memo(`s:${kind}:${seed}`, () => skylineTexture_raw(kind, seed));
export const softDot = () => memo('dot', () => softDot_raw());
export const mileMarkerTexture = (route: Shield, dir: string, mile: number, tenth: number) => memo(`mm:${route.t}${route.n}:${dir}:${mile}:${tenth}`, () => mileMarkerTexture_raw(route, dir, mile, tenth));
