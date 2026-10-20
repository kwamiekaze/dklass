/** Canvas textures of the Carrollton open world: asphalt, grass, concrete, building facades (with the matching lit-windows map for the night), shop signs, street name blades. */
import * as THREE from 'three';
import { rand01 } from './map';

const cache = new Map<string, THREE.CanvasTexture>();
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function finish(c: HTMLCanvasElement, repeat = true, aniso = 4, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true; return t;
}
const memo = (k: string, f: () => THREE.CanvasTexture) => { let t = cache.get(k); if (!t) { t = f(); cache.set(k, t); } return t; };
export function disposeCarrolltonTextures() { for (const t of cache.values()) t.dispose(); cache.clear(); }

function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, light = true) {
  for (let i = 0; i < n; i++) { const v = Math.floor(rand01(i * 7 + w) * 255); g.fillStyle = `rgba(${light ? v : 255 - v},${light ? v : 255 - v},${light ? v : 255 - v},${a})`; g.fillRect(rand01(i * 13 + 1) * w, rand01(i * 29 + 5) * h, 1 + rand01(i) * 2, 1 + rand01(i * 3) * 2); }
}

export const asphaltTexture = () => memo('asphalt', () => {
  const c = mk(256, 256), g = c.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 2600, 0.12, false); noise(g, 256, 256, 1400, 0.1, true);
  // a few tar seams and patches
  g.strokeStyle = 'rgba(30,30,32,.16)'; g.lineWidth = 1.2; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(rand01(i + 40) * 256, 0); g.bezierCurveTo(rand01(i + 41) * 256, 80, rand01(i + 42) * 256, 170, rand01(i + 43) * 256, 256); g.stroke(); }
  return finish(c);
});
export const grassTexture = () => memo('grass', () => {
  const c = mk(256, 256), g = c.getContext('2d')!; g.fillStyle = '#7f9d5a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) { const k = rand01(i * 5 + 2); g.fillStyle = k < 0.5 ? 'rgba(70,110,50,.45)' : k < 0.8 ? 'rgba(150,175,95,.4)' : 'rgba(110,95,60,.28)'; g.fillRect(rand01(i * 3 + 1) * 256, rand01(i * 11 + 7) * 256, 2, 2 + rand01(i) * 4); }
  return finish(c, true, 8);
});
export const concreteTexture = () => memo('concrete', () => {
  const c = mk(128, 128), g = c.getContext('2d')!; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  noise(g, 128, 128, 700, 0.1, false);
  g.strokeStyle = 'rgba(80,80,80,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
  return finish(c);
});

/** A facade tile: 4 bays across and 3 floors high. `shop` has a glass storefront on the ground floor. The `lit` twin has the windows lit up at random, for the night. */
export function facadeTextures(kind: 'house' | 'shop'): { map: THREE.CanvasTexture; lit: THREE.CanvasTexture } {
  const k = `facade:${kind}`; const m = cache.get(k), l = cache.get(k + ':lit'); if (m && l) return { map: m, lit: l };
  const BW = 128, FH = 128, W = BW * 4, H = FH * 3;
  const c = mk(W, H), g = c.getContext('2d')!, c2 = mk(W, H), g2 = c2.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g2.fillStyle = '#000'; g2.fillRect(0, 0, W, H);
  noise(g, W, H, 3200, 0.06, false);
  if (kind === 'shop') for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(120,70,50,.05)'; g.fillRect(0, y, W, 1); }
  // floors are drawn from the bottom: the texture's v=0 is the ground floor at the bottom of the canvas
  for (let f = 0; f < 3; f++) {
    const y0 = H - (f + 1) * FH;
    for (let b = 0; b < 4; b++) {
      const x0 = b * BW; const seed = f * 17 + b * 5 + (kind === 'shop' ? 100 : 0);
      const store = kind === 'shop' && f === 0;
      const wx = store ? x0 + 10 : x0 + (kind === 'house' ? 34 : 26), ww = store ? BW - 20 : (kind === 'house' ? 60 : 76);
      const wy = store ? y0 + 38 : y0 + (kind === 'house' ? 26 : 22), wh = store ? 76 : (kind === 'house' ? 70 : 76);
      // wall detail: lintel and sill
      g.fillStyle = 'rgba(90,70,60,.22)'; g.fillRect(wx - 5, wy - 7, ww + 10, 7); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(wx - 6, wy + wh, ww + 12, 6);
      // glass
      const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#6f8ba6'); gr.addColorStop(0.55, '#2e4256'); gr.addColorStop(1, '#1e2b38');
      g.fillStyle = '#e9e6df'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      // sky reflection streak
      g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(wx, wy + wh * 0.5); g.lineTo(wx + ww * 0.55, wy); g.lineTo(wx + ww * 0.8, wy); g.lineTo(wx, wy + wh * 0.8); g.fill();
      // mullions
      g.fillStyle = '#e9e6df'; if (!store) { g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); g.fillRect(wx, wy + wh / 2 - 1.5, ww, 3); } else { for (let q = 1; q < 3; q++) g.fillRect(wx + (ww * q) / 3 - 1.5, wy, 3, wh); }
      if (kind === 'house' && f === 0 && b === 1) { g.fillStyle = '#5a3d2b'; g.fillRect(x0 + 26, y0 + 40, 36, 88); g.fillStyle = '#d7b46a'; g.fillRect(x0 + 52, y0 + 86, 4, 4); }
      // night: lit or dark
      const on = rand01(seed * 3 + 1) < (store ? 0.8 : kind === 'house' ? 0.38 : 0.3);
      if (on) { const warm = rand01(seed * 7 + 2) < 0.7; g2.fillStyle = warm ? '#ffcf7a' : '#bfe1ff'; g2.fillRect(wx, wy, ww, wh); g2.fillStyle = 'rgba(0,0,0,.35)'; g2.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); }
    }
  }
  const map = finish(c, true, 8), lit = finish(c2, true, 4);
  cache.set(k, map); cache.set(k + ':lit', lit); return { map, lit };
}

const SIGN_PAL = ['#1b3a63', '#7a1f2a', '#1f5a3a', '#2a2a30', '#8a5a1c', '#3a2a63', '#0f5a66', '#6b1f5a'];
export const shopSignTexture = (name: string) => memo(`sign:${name}`, () => {
  const W = 1024, H = 256, c = mk(W, H), g = c.getContext('2d')!;
  const bg = SIGN_PAL[Math.floor(rand01(name.length * 31 + name.charCodeAt(0)) * SIGN_PAL.length)]!;
  g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let f = 120; g.font = `800 ${f}px "Arial Narrow", Arial, sans-serif`; while (g.measureText(name).width > W - 90 && f > 30) { f -= 4; g.font = `800 ${f}px "Arial Narrow", Arial, sans-serif`; }
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
