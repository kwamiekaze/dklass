/**
 * Every picture the Atlanta world is painted with, drawn on canvases at run time (no files to download): the pavement, the green guide signs with
 * their route shields, the amber message boards, the billboards and the skylines. All of it is deterministic, so a stage looks the same every time.
 */
import * as THREE from 'three';
import type { Arrow, GuideSign, Shield, Skyline } from './stageTypes';
import type { Layout } from './layout';
import { LANE } from './layout';

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
const GREEN = '#00694a';
function shieldPath(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2 + h * 0.12);
  g.quadraticCurveTo(cx - w / 2, cy - h / 2, cx - w * 0.28, cy - h / 2);
  g.quadraticCurveTo(cx, cy - h / 2 + h * 0.08, cx + w * 0.28, cy - h / 2);
  g.quadraticCurveTo(cx + w / 2, cy - h / 2, cx + w / 2, cy - h / 2 + h * 0.12);
  g.lineTo(cx + w / 2, cy + h * 0.1);
  g.quadraticCurveTo(cx + w / 2, cy + h * 0.38, cx, cy + h / 2);
  g.quadraticCurveTo(cx - w / 2, cy + h * 0.38, cx - w / 2, cy + h * 0.1);
  g.closePath();
}
/** Draw a route shield centred at cx,cy with the given height; returns its width. */
export function drawShield(g: CanvasRenderingContext2D, s: Shield, cx: number, cy: number, h: number): number {
  const w = h * (s.n.length >= 3 ? 1.12 : 0.98);
  if (s.t === 'I') {
    shieldPath(g, cx, cy, w, h); g.fillStyle = '#ffffff'; g.fill();
    shieldPath(g, cx, cy, w * 0.9, h * 0.9); g.fillStyle = '#0a3f95'; g.fill();
    g.save(); shieldPath(g, cx, cy, w * 0.9, h * 0.9); g.clip(); g.fillStyle = '#c8102e'; g.fillRect(cx - w, cy - h / 2, w * 2, h * 0.26); g.restore();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${h * 0.13}px Arial, sans-serif`; g.fillText('INTERSTATE', cx, cy - h * 0.34 + 2);
    g.font = `800 ${h * (s.n.length >= 3 ? 0.4 : 0.5)}px "Arial Black", Arial, sans-serif`; g.fillText(s.n, cx, cy + h * 0.14);
  } else if (s.t === 'US') {
    shieldPath(g, cx, cy, w * 0.96, h); g.fillStyle = '#111'; g.fill();
    shieldPath(g, cx, cy, w * 0.86, h * 0.9); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${h * 0.5}px "Arial Black", Arial, sans-serif`; g.fillText(s.n, cx, cy + h * 0.02);
  } else {
    g.beginPath(); g.arc(cx, cy, h * 0.5, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill();
    g.beginPath(); g.arc(cx, cy, h * 0.45, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${h * 0.17}px Arial, sans-serif`; g.fillText('GEORGIA', cx, cy - h * 0.27);
    g.font = `800 ${h * 0.4}px "Arial Black", Arial, sans-serif`; g.fillText(s.n, cx, cy + h * 0.1);
  }
  return w;
}
function drawArrow(g: CanvasRenderingContext2D, a: Arrow, cx: number, cy: number, s: number) {
  g.save(); g.translate(cx, cy); g.fillStyle = '#fff';
  const rot: Record<Arrow, number> = { up: 0, upright: Math.PI / 4, upleft: -Math.PI / 4, right: Math.PI / 2, left: -Math.PI / 2, down: Math.PI };
  g.rotate(rot[a]);
  g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(s * 0.34, -s * 0.05); g.lineTo(s * 0.12, -s * 0.05); g.lineTo(s * 0.12, s * 0.5); g.lineTo(-s * 0.12, s * 0.5); g.lineTo(-s * 0.12, -s * 0.05); g.lineTo(-s * 0.34, -s * 0.05); g.closePath(); g.fill();
  g.restore();
}
type PanelSpec = { shields?: Shield[]; dir?: string; dests: string[]; arrows?: Arrow[]; exitOnly?: boolean; tab?: string; dist?: string };
function drawPanel(g: CanvasRenderingContext2D, p: PanelSpec, x: number, y: number, w: number, h: number) {
  g.fillStyle = GREEN; g.fillRect(x, y, w, h);
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
  let cy = y + 36;
  if (p.dir) { g.fillStyle = '#fff'; g.font = '700 46px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(p.dir, x + w / 2, cy); cy += 52; }
  if (p.shields?.length) {
    const sh = 118, gap = 20; let tw = 0; const ws = p.shields.map((s) => sh * (s.n.length >= 3 ? 1.12 : 0.98)); tw = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
    let sx = x + w / 2 - tw / 2; p.shields.forEach((s, i) => { drawShield(g, s, sx + ws[i]! / 2, cy + sh / 2, sh); sx += ws[i]! + gap; }); cy += sh + 14;
  }
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'top';
  const fs = p.dests.length > 2 ? 52 : 62;
  for (const dline of p.dests) { g.font = `700 ${fs}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; let f = fs; while (g.measureText(dline).width > w - 70 && f > 28) { f -= 2; g.font = `700 ${f}px "Arial Narrow", Arial, sans-serif`; } g.fillText(dline, x + w / 2, cy); cy += fs + 8; }
  if (p.dist) { g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 46px Arial, sans-serif'; g.fillText(p.dist, x + w / 2, y + h - 50); }
  else if (p.arrows?.length) { const n = p.arrows.length, sp = Math.min(130, (w - 120) / n); p.arrows.forEach((a, i) => drawArrow(g, a, x + w / 2 + (i - (n - 1) / 2) * sp, y + h - 82, 96)); }
  if (p.exitOnly) { g.fillStyle = '#f2b705'; g.fillRect(x + w / 2 - 110, y + h - 54, 220, 40); g.fillStyle = '#111'; g.font = '700 30px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('EXIT ONLY', x + w / 2, y + h - 33); }
}
export interface SignTex { map: THREE.CanvasTexture; aspect: number }
const signCache = new Map<string, SignTex>();
function guideSignTexture_raw(s: GuideSign): SignTex {
  const key = JSON.stringify(s); const hit = signCache.get(key); if (hit) return hit;
  const panels: PanelSpec[] = [{ shields: s.shields, dir: s.dir, dests: s.dests, arrows: s.arrows, exitOnly: s.exitOnly, tab: s.tab, dist: s.dist }, ...(s.also ?? [])];
  const PW = 640, PH = 500, TAB = 78, W = PW * panels.length, H = PH + TAB;
  const c = mkCanvas(W, H), g = c.getContext('2d')!; g.clearRect(0, 0, W, H);
  panels.forEach((p, i) => { drawPanel(g, p, i * PW, TAB, PW, PH); if (i) { g.fillStyle = '#fff'; g.fillRect(i * PW - 4, TAB + 10, 8, PH - 20); } });
  panels.forEach((p, i) => {
    if (!p.tab) return;
    const green = /^EXIT/.test(p.tab), tw = Math.min(PW - 48, green ? 270 : 330), tx = i * PW + 24;
    g.fillStyle = green ? GREEN : '#f2b705'; g.fillRect(tx, 6, tw, TAB - 10);
    g.strokeStyle = green ? '#fff' : '#111'; g.lineWidth = green ? 5 : 4; g.strokeRect(tx + 2, 8, tw - 4, TAB - 14);
    g.fillStyle = green ? '#fff' : '#111'; g.font = '700 42px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.tab, tx + tw / 2, TAB / 2 + 1);
  });
  const out = { map: tex(c, true, 8), aspect: W / H }; signCache.set(key, out); return out;
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
