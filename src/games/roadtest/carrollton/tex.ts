/**
 * Canvas textures of the Carrollton open world, all drawn at load time (nothing to download): asphalt, grass, concrete, building facades in four styles (with a
 * tint mask, so the wall colour of each building tints the brick or the siding but not the glass and the trim, and a lit-windows map for the night), roofs,
 * leaves, shop signs, street name blades, the clock face and a few soft sprites.
 */
import * as THREE from 'three';
import { rand01 } from './map';

const cache = new Map<string, THREE.CanvasTexture>();
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function finish(c: HTMLCanvasElement, repeat = true, aniso = 8, srgb = true, mips = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = mips; if (!mips) t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true; return t;
}
const memo = (k: string, f: () => THREE.CanvasTexture) => { let t = cache.get(k); if (!t) { t = f(); cache.set(k, t); } return t; };
export function disposeCarrolltonTextures() { for (const t of cache.values()) t.dispose(); cache.clear(); }

/** a little deterministic random generator per texture */
const rng = (seed: number) => { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, seed: number, cols: string[], size = [1, 2.5]) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]!; const s = size[0]! + r() * (size[1]! - size[0]!); g.fillRect(r() * w, r() * h, s, s); }
}
/** smooth value noise, tileable, in 0..1 */
function noiseField(N: number, cells: number, seed: number): Float32Array {
  const r = rng(seed), grid = new Float32Array(cells * cells); for (let i = 0; i < grid.length; i++) grid[i] = r();
  const out = new Float32Array(N * N), f = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = (x / N) * cells, gy = (y / N) * cells, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = f(gx - x0), ty = f(gy - y0);
    const a = grid[(y0 % cells) * cells + (x0 % cells)]!, b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)]!, c = grid[((y0 + 1) % cells) * cells + (x0 % cells)]!, d = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]!;
    out[y * N + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  return out;
}

// ------------------------------------------------------------------ the ground ---
export const asphaltTexture = () => memo('asphalt', () => {
  const S = 512, c = mk(S, S), g = c.getContext('2d')!;
  const nf = noiseField(S, 8, 11), img = g.createImageData(S, S), r = rng(5);
  for (let i = 0; i < S * S; i++) { const v = 196 + (nf[i]! - 0.5) * 34 + (r() - 0.5) * 34; img.data[i * 4] = img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v + 3; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  // aggregate: light and dark stones
  speckle(g, S, S, 9000, 21, ['rgba(255,255,255,.22)', 'rgba(40,40,44,.25)', 'rgba(150,140,130,.25)'], [1, 2.2]);
  // sealed cracks and a patch or two
  const rr = rng(9); g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(25,25,28,.2)'; g.lineWidth = 1 + rr() * 1.5; g.beginPath(); let x = rr() * S, y = rr() * S; g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (rr() - 0.5) * 60; y += 10 + rr() * 30; g.lineTo(x, y); } g.stroke(); }
  return finish(c);
});
export const grassTexture = () => memo('grass', () => {
  const S = 512, c = mk(S, S), g = c.getContext('2d')!;
  const nf = noiseField(S, 6, 3), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const n = nf[i]!; img.data[i * 4] = 104 + n * 34; img.data[i * 4 + 1] = 140 + n * 30; img.data[i * 4 + 2] = 72 + n * 14; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  // blades: short strokes in many greens, with a few dry ones
  const r = rng(7);
  for (let i = 0; i < 22000; i++) {
    const x = r() * S, y = r() * S, k = r(), l = 3 + r() * 6;
    g.strokeStyle = k < 0.42 ? 'rgba(58,98,40,.55)' : k < 0.8 ? 'rgba(150,182,96,.45)' : k < 0.93 ? 'rgba(92,132,58,.55)' : 'rgba(170,158,104,.45)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - l); g.stroke();
  }
  return finish(c, true, 8);
});
/** large soft patches (0..1) to break up the repeat of the grass and darken the lawns unevenly */
export const macroNoiseTexture = () => memo('macro', () => {
  const S = 256, c = mk(S, S), g = c.getContext('2d')!, a = noiseField(S, 5, 41), b = noiseField(S, 13, 43), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = (a[i]! * 0.65 + b[i]! * 0.35) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0); return finish(c, true, 1, false);
});
export const concreteTexture = () => memo('concrete', () => {
  const S = 256, c = mk(S, S), g = c.getContext('2d')!;
  const nf = noiseField(S, 6, 17), img = g.createImageData(S, S), r = rng(19);
  for (let i = 0; i < S * S; i++) { const v = 222 + (nf[i]! - 0.5) * 26 + (r() - 0.5) * 16; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v - 4; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  speckle(g, S, S, 1600, 23, ['rgba(90,90,90,.18)', 'rgba(255,255,255,.3)']);
  // slab joints: the sidewalk texture spans 4 m along the walk (v) and the whole width (u)
  g.strokeStyle = 'rgba(70,70,70,.55)'; g.lineWidth = 2;
  for (const y of [0, S / 3, (2 * S) / 3]) { g.beginPath(); g.moveTo(0, y + 1); g.lineTo(S, y + 1); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, 10, S);       // the kerb edge, a little dirtier
  return finish(c);
});

// ------------------------------------------------------------------ facades ---
export type FacadeStyle = 'brick' | 'stucco' | 'siding' | 'brickhouse';
export interface FacadeSet { map: THREE.CanvasTexture; lit: THREE.CanvasTexture; mask: THREE.CanvasTexture }
/** the facade tile is 4 bays across and 3 floors up (v = 0 is the ground floor at the bottom of the canvas) */
const BW = 160, FH = 160;
function brickWall(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, seed: number) {
  const r = rng(seed), CH = 7, BWD = 18;
  g.fillStyle = '#e4dfd8'; g.fillRect(x0, y0, w, h);     // mortar
  for (let row = 0, y = y0; y < y0 + h; row++, y += CH) {
    const off = row % 2 ? BWD / 2 : 0;
    for (let x = x0 - off; x < x0 + w; x += BWD) {
      const v = 168 + r() * 52, warm = r() * 10;
      g.fillStyle = `rgb(${v + warm},${v - 6},${v - 12})`; g.fillRect(Math.max(x0, x + 1), y + 1, Math.min(BWD - 2, x0 + w - x - 1), CH - 2);
    }
  }
}
function windowPane(g: CanvasRenderingContext2D, m: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: string, mullion: 'cross' | 'sash' | 'store' | 'none') {
  // frame (untinted: mask black)
  g.fillStyle = frame; g.fillRect(x - 4, y - 4, w + 8, h + 8); m.fillStyle = '#000'; m.fillRect(x - 4, y - 4, w + 8, h + 8);
  const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h); gr.addColorStop(0, '#8fb0c8'); gr.addColorStop(0.35, '#4d6a82'); gr.addColorStop(1, '#1f2c38');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  // the inside: a hint of curtains and a dark room
  g.fillStyle = 'rgba(20,24,30,.35)'; g.fillRect(x, y + h * 0.55, w, h * 0.45);
  // sky reflection streaks
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(x, y + h * 0.62); g.lineTo(x + w * 0.62, y); g.lineTo(x + w * 0.84, y); g.lineTo(x, y + h * 0.9); g.fill();
  g.fillStyle = frame;
  if (mullion === 'cross') { g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h / 2 - 2, w, 4); }
  else if (mullion === 'sash') { g.fillRect(x, y + h / 2 - 3, w, 6); g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x + w / 4 - 1, y, 2, h / 2); g.fillRect(x + (3 * w) / 4 - 1, y, 2, h / 2); }
  else if (mullion === 'store') { g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.2, w, 4); }
}
export function facadeTextures(style: FacadeStyle): FacadeSet {
  const k = `facade:${style}`; const got = cache.get(k); if (got) return { map: got, lit: cache.get(k + ':lit')!, mask: cache.get(k + ':mask')! };
  const W = BW * 4, H = FH * 3, c = mk(W, H), g = c.getContext('2d')!, c2 = mk(W, H), l = c2.getContext('2d')!, c3 = mk(W, H), m = c3.getContext('2d')!;
  l.fillStyle = '#000'; l.fillRect(0, 0, W, H); m.fillStyle = '#fff'; m.fillRect(0, 0, W, H);
  const r = rng(style.length * 97 + 5);
  const isHouse = style === 'siding' || style === 'brickhouse';
  // ---- the wall
  if (style === 'brick' || style === 'brickhouse') brickWall(g, 0, 0, W, H, 31 + style.length);
  else if (style === 'stucco') { const nf = noiseField(256, 9, 61); const img = g.createImageData(W, H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = 228 + (nf[(y % 256) * 256 + (x % 256)]! - 0.5) * 22; const i = (y * W + x) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v - 3; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }
  else { g.fillStyle = '#ebe9e4'; g.fillRect(0, 0, W, H); for (let y = 0; y < H; y += 10) { g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(0, y + 8, W, 2); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, y, W, 2); } }
  // weathering: a darker band at the base, streaks under the sills
  for (let f = 0; f < 3; f++) { const gy = H - f * FH; const gr = g.createLinearGradient(0, gy - 24, 0, gy); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,.18)'); g.fillStyle = gr; g.fillRect(0, gy - 24, W, 24); }
  for (let f = 0; f < 3; f++) {
    const y0 = H - (f + 1) * FH;
    const ground = f === 0;
    for (let b = 0; b < 4; b++) {
      const x0 = b * BW, seed = f * 17 + b * 5;
      if (!isHouse && ground) {
        // ---- a storefront: sign band, transoms, display windows, kick plate, a door
        const trim = style === 'brick' ? '#2e3b33' : style === 'stucco' ? '#3a3f46' : '#3b3f44';
        g.fillStyle = trim; g.fillRect(x0 + 6, y0 + 14, BW - 12, 22); m.fillStyle = '#000'; m.fillRect(x0 + 6, y0 + 14, BW - 12, 22);   // the sign band and cornice of the storefront
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x0 + 6, y0 + 14, BW - 12, 3);
        const door = b === 1 || b === 3;
        if (door) {
          windowPane(g, m, x0 + 14, y0 + 48, 54, 40, trim, 'none');                       // transom over the door and the window beside it
          windowPane(g, m, x0 + 86, y0 + 48, 60, 82, trim, 'store');
          g.fillStyle = '#20262c'; g.fillRect(x0 + 14, y0 + 96, 54, H); m.fillStyle = '#000'; m.fillRect(x0 + 10, y0 + 92, 62, FH);      // the recessed entrance
          windowPane(g, m, x0 + 22, y0 + 100, 38, 48, trim, 'none');
          g.fillStyle = '#c9a54a'; g.fillRect(x0 + 54, y0 + 126, 4, 8);
        } else {
          windowPane(g, m, x0 + 12, y0 + 48, BW - 24, 18, trim, 'cross');
          windowPane(g, m, x0 + 12, y0 + 72, BW - 24, 64, trim, 'store');
        }
        g.fillStyle = trim; g.fillRect(x0 + 8, y0 + 140, BW - 16, FH - 140); m.fillStyle = '#000'; m.fillRect(x0 + 8, y0 + 140, BW - 16, FH - 140);  // kick plate
        // lit at night: the shop is open
        if (rand01(seed * 3 + 1) < 0.82) { l.fillStyle = rand01(seed) < 0.7 ? '#ffd79a' : '#e9f3ff'; l.fillRect(x0 + 12, y0 + 48, BW - 24, 88); }
        continue;
      }
      // ---- an upper-floor window, or a house window
      const frame = isHouse ? '#f4f2ec' : style === 'brick' ? '#efe9dc' : '#4a4f56';
      const ww = isHouse ? 54 : style === 'stucco' ? 96 : 60, wh = isHouse ? 70 : style === 'stucco' ? 74 : 92;
      const wx = x0 + (BW - ww) / 2, wy = y0 + (isHouse ? 42 : 34);
      if (isHouse && ground && b === 1) {
        // the front door with a little porch light
        g.fillStyle = '#f4f2ec'; g.fillRect(x0 + 46, y0 + 44, 68, FH - 44); m.fillStyle = '#000'; m.fillRect(x0 + 46, y0 + 44, 68, FH - 44);
        g.fillStyle = ['#7b2b26', '#23364f', '#2f4a36', '#3a3a3c'][Math.floor(r() * 4)]!; g.fillRect(x0 + 54, y0 + 52, 52, FH - 52);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x0 + 60, y0 + 60, 18, 40); g.fillRect(x0 + 82, y0 + 60, 18, 40);
        g.fillStyle = '#d4b25c'; g.fillRect(x0 + 96, y0 + 110, 5, 5);
        l.fillStyle = '#ffcf80'; l.fillRect(x0 + 118, y0 + 52, 8, 10);
        continue;
      }
      if (style === 'brick') {
        // an arched brick lintel and a stone sill
        g.fillStyle = '#b9b2a6'; g.fillRect(wx - 8, wy + wh + 4, ww + 16, 7); m.fillStyle = '#000'; m.fillRect(wx - 8, wy + wh + 4, ww + 16, 7);
        g.fillStyle = 'rgba(80,40,30,.35)'; g.beginPath(); g.ellipse(wx + ww / 2, wy - 2, ww / 2 + 8, 14, 0, Math.PI, 0); g.fill();
      } else if (isHouse) {
        // shutters, untinted
        const sc = ['#2c3a2e', '#24303f', '#3b2a26', '#1e1f22'][Math.floor(rand01(seed + style.length) * 4)]!;
        g.fillStyle = sc; g.fillRect(wx - 22, wy - 4, 16, wh + 8); g.fillRect(wx + ww + 6, wy - 4, 16, wh + 8);
        m.fillStyle = '#000'; m.fillRect(wx - 22, wy - 4, 16, wh + 8); m.fillRect(wx + ww + 6, wy - 4, 16, wh + 8);
        g.fillStyle = 'rgba(255,255,255,.1)'; for (let s = 0; s < wh + 8; s += 6) { g.fillRect(wx - 22, wy - 4 + s, 16, 1.5); g.fillRect(wx + ww + 6, wy - 4 + s, 16, 1.5); }
        g.fillStyle = '#f4f2ec'; g.fillRect(wx - 6, wy + wh + 4, ww + 12, 6); m.fillStyle = '#000'; m.fillRect(wx - 6, wy + wh + 4, ww + 12, 6);
      } else { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(wx - 6, wy + wh + 6, ww + 12, 4); }
      windowPane(g, m, wx, wy, ww, wh, frame, isHouse ? 'sash' : style === 'stucco' ? 'cross' : 'sash');
      // blinds in some windows
      if (r() < 0.35) { g.fillStyle = 'rgba(235,228,210,.55)'; g.fillRect(wx, wy, ww, wh * (0.2 + r() * 0.4)); }
      const on = rand01(seed * 3 + 1 + style.length) < (isHouse ? 0.45 : 0.3);
      if (on) { const warm = rand01(seed * 7 + 2) < 0.75; l.fillStyle = warm ? '#ffcf7a' : '#c4e2ff'; l.fillRect(wx, wy, ww, wh); l.fillStyle = 'rgba(0,0,0,.4)'; l.fillRect(wx + ww / 2 - 2, wy, 4, wh); l.fillRect(wx, wy + wh / 2 - 3, ww, 6); }
    }
    // a cornice line between floors on brick buildings
    if (style === 'brick' && f > 0) { g.fillStyle = 'rgba(70,40,30,.3)'; g.fillRect(0, y0 + FH - 4, W, 4); }
  }
  if (isHouse) { g.fillStyle = '#6f675e'; g.fillRect(0, H - 14, W, 14); m.fillStyle = '#000'; m.fillRect(0, H - 14, W, 14); }   // the foundation
  const map = finish(c, true, 8), lit = finish(c2, true, 4), mask = finish(c3, true, 4, false);
  cache.set(k, map); cache.set(k + ':lit', lit); cache.set(k + ':mask', mask);
  return { map, lit, mask };
}

/** asphalt shingles: rows run along u (the eave), v climbs the slope; light grey, tinted by the roof colour */
export const shingleTexture = () => memo('shingle', () => {
  const S = 256, c = mk(S, S), g = c.getContext('2d')!, r = rng(71);
  g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, S, S);
  for (let y = 0, row = 0; y < S; y += 16, row++) {
    for (let x = (row % 2) * 16 - 16; x < S; x += 32) { const v = 170 + r() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1, y, 30, 15); }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, y + 14, S, 2);
  }
  speckle(g, S, S, 3000, 73, ['rgba(0,0,0,.18)', 'rgba(255,255,255,.2)'], [1, 1.6]);
  return finish(c);
});
export const flatRoofTexture = () => memo('flatroof', () => {
  const S = 256, c = mk(S, S), g = c.getContext('2d')!, nf = noiseField(S, 7, 81), img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = 200 + (nf[i]! - 0.5) * 40; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v - 2; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  speckle(g, S, S, 5000, 83, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.3)'], [1, 2]);
  g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2; for (let x = 0; x < S; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  return finish(c);
});

// ------------------------------------------------------------------ leaves ---
/** a clump of leaves on a transparent card (alpha-tested): denser in the middle, ragged at the edge. `kind` picks the leaf shape and greens */
export const leafTexture = (kind: 'oak' | 'pine' | 'bush') => memo(`leaf:${kind}`, () => {
  const S = 256, c = mk(S, S), g = c.getContext('2d')!, r = rng(kind.length * 31 + 7);
  const greens = kind === 'pine' ? ['#1f3d26', '#284d2f', '#335c38', '#1a3320', '#3d6b42'] : kind === 'bush' ? ['#3b6b2f', '#4a7d36', '#2f5a28', '#5b8c3e', '#6d9a48'] : ['#355f2a', '#46752f', '#2a4d22', '#5a8a3a', '#6c9c46', '#3e6a2c'];
  const N = kind === 'pine' ? 1500 : 1100;
  for (let i = 0; i < N; i++) {
    // positions biased to the centre: a soft disc
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.65) * (S * 0.47), x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * (kind === 'pine' ? 0.9 : 0.85);
    const shade = 1 - d / (S * 0.6);                     // darker at the centre bottom, lighter at the rim: the sun side reads later from the normals
    g.fillStyle = greens[Math.floor(r() * greens.length)]!; g.globalAlpha = 0.95;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    if (kind === 'pine') { g.fillRect(-1, -9, 2, 18); g.fillRect(-6, -1, 12, 2); }
    else { g.beginPath(); g.ellipse(0, 0, 7 + r() * 5, 3.5 + r() * 2.5, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
    if (shade > 0.7 && r() < 0.15) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y, 3, 3); }
  }
  g.globalAlpha = 1;
  // a few highlights
  for (let i = 0; i < 260; i++) { const a = r() * Math.PI * 2, d = Math.pow(r(), 0.5) * S * 0.44; g.fillStyle = kind === 'pine' ? 'rgba(120,160,110,.6)' : 'rgba(170,205,110,.7)'; g.beginPath(); g.ellipse(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.85, 3, 1.6, r() * 3, 0, Math.PI * 2); g.fill(); }
  return finish(c, false, 4);
});
export const barkTexture = () => memo('bark', () => {
  const c = mk(64, 128), g = c.getContext('2d')!; g.fillStyle = '#6a5848'; g.fillRect(0, 0, 64, 128);
  const r = rng(91); for (let i = 0; i < 70; i++) { g.fillStyle = r() < 0.5 ? 'rgba(30,22,16,.45)' : 'rgba(150,135,115,.3)'; g.fillRect(r() * 64, r() * 128, 2 + r() * 3, 10 + r() * 30); }
  return finish(c);
});

// ------------------------------------------------------------------ signs and sprites ---
const SIGN_PAL = ['#1b3a63', '#7a1f2a', '#1f5a3a', '#2a2a30', '#8a5a1c', '#3a2a63', '#0f5a66', '#6b1f5a'];
export const shopSignTexture = (name: string) => memo(`sign:${name}`, () => {
  const W = 1024, H = 256, c = mk(W, H), g = c.getContext('2d')!;
  const bg = SIGN_PAL[Math.floor(rand01(name.length * 31 + name.charCodeAt(0)) * SIGN_PAL.length)]!;
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(0,0,0,.2)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(232,206,140,.9)'; g.lineWidth = 8; g.strokeRect(12, 12, W - 24, H - 24);
  g.fillStyle = '#fbf6ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let f = 120; g.font = `800 ${f}px "Arial Narrow", Arial, sans-serif`; while (g.measureText(name).width > W - 90 && f > 30) { f -= 4; g.font = `800 ${f}px "Arial Narrow", Arial, sans-serif`; }
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowOffsetY = 4; g.shadowBlur = 6;
  g.fillText(name, W / 2, H / 2 + 4);
  return finish(c, false, 8);
});
export const streetBladeTexture = (name: string, num?: string) => memo(`blade:${name}:${num ?? ''}`, () => {
  const W = 1024, H = 192, c = mk(W, H), g = c.getContext('2d')!;
  g.fillStyle = '#0b6b3a'; g.fillRect(0, 0, W, H); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let f = 112; g.font = `700 ${f}px Arial, sans-serif`; const label = name.toUpperCase().replace(/ STREET$/, ' ST').replace(/ AVENUE$/, ' AVE').replace(/ ROAD$/, ' RD').replace(/ DRIVE$/, ' DR').replace(/ BOULEVARD$/, ' BLVD');
  while (g.measureText(label).width > W - 80 && f > 30) { f -= 4; g.font = `700 ${f}px Arial, sans-serif`; }
  g.fillText(label, W / 2, H / 2 + 4);
  void num; return finish(c, false, 8);
});
export const clockTexture = () => memo('clock', () => {
  const S = 256, c = mk(S, S), g = c.getContext('2d')!;
  g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#3a3a3e'; g.lineWidth = 10; g.stroke();
  g.fillStyle = '#222'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 30px Georgia, serif';
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; g.fillText(['I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i - 1]!, S / 2 + Math.cos(a) * 92, S / 2 + Math.sin(a) * 92); }
  g.strokeStyle = '#111'; g.lineCap = 'round'; g.lineWidth = 9; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(-1.1) * 58, S / 2 + Math.sin(-1.1) * 58); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(0.9) * 84, S / 2 + Math.sin(0.9) * 84); g.stroke();
  return finish(c, false, 4);
});
export const glowDot = () => memo('glowdot', () => {
  const S = 128, c = mk(S, S), g = c.getContext('2d')!; const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return finish(c, false, 1);
});
/** a soft dark disc for contact shadows, as a multiply factor: white at the rim (no change), grey in the middle */
export const blobTexture = () => memo('blob', () => {
  const S = 128, c = mk(S, S), g = c.getContext('2d')!; const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgb(105,105,105)'); gr.addColorStop(0.55, 'rgb(158,158,158)'); gr.addColorStop(0.8, 'rgb(215,215,215)'); gr.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return finish(c, false, 1, false);
});
/** the GPS chevrons on the road: white arrows pointing up the texture (v), alpha */
export const chevronTexture = () => memo('chevron', () => {
  const W = 64, H = 128, c = mk(W, H), g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(6, 0, W - 12, H);
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(8, 92); g.lineTo(W / 2, 40); g.lineTo(W - 8, 92); g.lineTo(W - 22, 92); g.lineTo(W / 2, 62); g.lineTo(22, 92); g.closePath(); g.fill();
  const t = finish(c, true, 4); t.wrapS = THREE.ClampToEdgeWrapping; return t;
});
/** a vertical fade for the trip beacon: opaque at the bottom, gone at the top */
export const beamTexture = () => memo('beam', () => {
  const c = mk(8, 128), g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.25, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 128); return finish(c, false, 1);
});

/** the four foliage textures in one 512 px atlas, so every tree is one material: oak (top left), pine (top right), bush (bottom left), bark (bottom right) */
export const FOLIAGE_UV = { oak: [0, 0.5, 0.5, 1], pine: [0.5, 0.5, 1, 1], bush: [0, 0, 0.5, 0.5], bark: [0.5, 0, 1, 0.5] } as const;
export const foliageAtlas = () => memo('foliage', () => {
  const c = mk(512, 512), g = c.getContext('2d')!;
  g.drawImage(leafTexture('oak').image as CanvasImageSource, 0, 0); g.drawImage(leafTexture('pine').image as CanvasImageSource, 256, 0); g.drawImage(leafTexture('bush').image as CanvasImageSource, 0, 256);
  const bark = barkTexture().image as CanvasImageSource; for (let y = 256; y < 512; y += 128) for (let x = 256; x < 512; x += 64) g.drawImage(bark, x, y);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t;
});
