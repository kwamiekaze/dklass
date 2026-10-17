import * as THREE from 'three';

/** All the pictures the 3D game paints in code, so the game ships no image files. Each is drawn once and cached by its key. */
const cache = new Map<string, THREE.Texture>();
const tex = (key: string, make: () => HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean; aniso?: number } = {}) => {
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(make());
    if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = opts.aniso ?? 8;
    cache.set(key, t);
  }
  return t;
};
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!] as const; };
let seed = 1;
const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const reseed = (s: number) => { seed = s % 2147483647 || 1; };

export const ROAD_TEX_W = 10.8;      // metres across
export const ROAD_TEX_L = 12;        // metres along (one dash + gap)

/** The tarmac, drawn once per colour: grain, worn wheel tracks, cracks, patches, the white dashes between lanes, the solid white edge and the yellow line on the left. */
export function roadTexture(base: string) {
  return tex('road-' + base, () => {
    reseed(11);
    const W = 512, H = 1024, [c, g] = canvas(W, H);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    // large soft blotches
    for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H, rad = 30 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rad); const dark = r() > 0.5; gr.addColorStop(0, dark ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.035)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); for (const oy of [-H, H]) { g.save(); g.translate(0, oy); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); } }
    // worn wheel tracks where the tyres go, in each lane
    const px = (m: number) => ((m + ROAD_TEX_W / 2) / ROAD_TEX_W) * W;
    for (const lx of [-3.4, 0, 3.4]) for (const off of [-0.85, 0.85]) { const x = px(lx + off); const gr = g.createLinearGradient(x - 24, 0, x + 24, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 24, 0, 48, H); }
    // grain
    for (let i = 0; i < 26000; i++) { const v = r(); g.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.02 + r() * 0.07})` : `rgba(0,0,0,${0.04 + r() * 0.12})`; g.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6); }
    // cracks
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.1;
    for (let i = 0; i < 9; i++) { let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (r() - 0.5) * 26; y += 10 + r() * 22; g.lineTo(x, y); } g.stroke(); }
    // patches of newer tarmac
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,.10)'; const w = 40 + r() * 60, h = 70 + r() * 120; g.fillRect(r() * (W - w), r() * (H - h), w, h); }
    // markings
    const line = (xm: number, wm: number, color: string, dash?: [number, number]) => {
      g.fillStyle = color; const x = px(xm) - (wm / ROAD_TEX_W) * W / 2, w = (wm / ROAD_TEX_W) * W;
      if (!dash) g.fillRect(x, 0, w, H); else g.fillRect(x, 0, w, (dash[0] / ROAD_TEX_L) * H);
    };
    line(-1.7, 0.15, 'rgba(244,244,236,.92)', [3, 9]);
    line(1.7, 0.15, 'rgba(244,244,236,.92)', [3, 9]);
    line(-5.0, 0.16, 'rgba(236,196,70,.95)');
    line(5.0, 0.16, 'rgba(244,244,236,.92)');
    // chipped paint on the lines
    g.globalCompositeOperation = 'destination-out';
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 260; i++) { g.fillStyle = base; g.globalAlpha = 0.5; const xs = [px(-1.7), px(1.7), px(-5.0), px(5.0)]; g.fillRect(xs[Math.floor(r() * 4)]! + (r() - 0.5) * 8, r() * H, 3 + r() * 3, 2 + r() * 8); g.globalAlpha = 1; }
    return c;
  }, { repeat: true, aniso: 12 });
}

/** Paving slabs for the sidewalk and the kerb top. 3 m square tile. */
export function pavingTexture(tint: string) {
  return tex('pave-' + tint, () => {
    reseed(5);
    const S = 512, [c, g] = canvas(S, S);
    g.fillStyle = tint; g.fillRect(0, 0, S, S);
    const n = 2, cell = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = (r() - 0.5) * 22; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`; g.fillRect(i * cell, j * cell, cell, cell); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke(); g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke(); }
    return c;
  }, { repeat: true });
}

/** A noisy ground / lawn tile. */
export function groundTexture(color: string) {
  return tex('ground-' + color, () => {
    reseed(9);
    const S = 256, [c, g] = canvas(S, S);
    g.fillStyle = color; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 16; i++) { const x = r() * S, y = r() * S, rad = 20 + r() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 6000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)'; g.fillRect(r() * S, r() * S, 1.6, 2.6); }
    return c;
  }, { repeat: true });
}

/** A facade tile: 4 columns of windows by 4 floors. The colour map and the emissive map (the lit windows at night) are two textures of the same tile. */
export function facade(kind: 'plain' | 'glass' | 'shop') {
  const key = 'facade-' + kind;
  const map = tex(key, () => {
    reseed(31);
    const S = 256, [c, g] = canvas(S, S);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.04)'; g.fillRect(r() * S, r() * S, 2, 2); }
    const cols = 4, rows = 4, cw = S / cols, rh = S / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = i * cw, y = j * rh;
      if (kind === 'glass') {
        g.fillStyle = '#3d4f66'; g.fillRect(x + 3, y + 5, cw - 6, rh - 10);
        const gr = g.createLinearGradient(x, y, x + cw, y + rh); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.12)'); g.fillStyle = gr; g.fillRect(x + 3, y + 5, cw - 6, rh - 10);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + cw / 2 - 1, y + 5, 2, rh - 10);
      } else {
        const gm = 11;
        g.fillStyle = '#26303f'; g.fillRect(x + gm, y + 12, cw - gm * 2, rh - 26);
        const gr = g.createLinearGradient(x, y, x + cw, y + rh); gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + gm, y + 12, cw - gm * 2, rh - 26);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x + gm - 3, y + 9, cw - gm * 2 + 6, 3); g.fillRect(x + gm - 3, y + rh - 14, cw - gm * 2 + 6, 4); g.fillRect(x + cw / 2 - 1, y + 12, 2, rh - 26);
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + gm - 3, y + rh - 10, cw - gm * 2 + 6, 3);
      }
    }
    return c;
  }, { repeat: true });
  const emis = tex(key + '-lit', () => {
    reseed(77);
    const S = 256, [c, g] = canvas(S, S);
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    const cols = 4, rows = 4, cw = S / cols, rh = S / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (r() < 0.38) continue;
      const warm = r() > 0.25;
      g.fillStyle = warm ? `rgba(255,${190 + Math.floor(r() * 40)},${110 + Math.floor(r() * 50)},1)` : 'rgba(180,210,255,1)';
      const gm = kind === 'glass' ? 3 : 11;
      g.fillRect(i * cw + gm, j * rh + (kind === 'glass' ? 5 : 12), cw - gm * 2, rh - (kind === 'glass' ? 10 : 26));
    }
    return c;
  }, { repeat: true });
  return { map, emis };
}

/** The DrivingKlass billboard, in the brand colours. */
export function billboardTexture() {
  return tex('billboard', () => {
    const W = 1024, H = 384, [c, g] = canvas(W, H);
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0d0d12'); bg.addColorStop(1, '#1d1b26'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9971f'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28);
    g.strokeStyle = '#f2c14e'; g.lineWidth = 3; g.strokeRect(30, 30, W - 60, H - 60);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 150px "Bebas Neue", Impact, "Arial Narrow", sans-serif';
    g.fillStyle = '#ffffff'; const w1 = g.measureText('DRIVING').width, w2 = g.measureText('KLASS').width, gap = 22;
    const x0 = W / 2 - (w1 + w2 + gap) / 2;
    g.textAlign = 'left'; g.fillText('DRIVING', x0, 145); g.fillStyle = '#f2c14e'; g.fillText('KLASS', x0 + w1 + gap, 145);
    g.textAlign = 'center'; g.fillStyle = '#f2c14e'; g.font = '700 70px sans-serif'; g.fillText('★ ★ ★ ★ ★', W / 2, 250);
    g.fillStyle = '#e9dcc6'; g.font = '600 44px Inter, system-ui, sans-serif'; g.fillText('Book your road test lesson  ·  drivingklass.com', W / 2, 321);
    return c;
  });
}

/** A square sign face, drawn once. */
export function stopSignTexture() {
  return tex('stop', () => {
    const S = 256, [c, g] = canvas(S, S);
    g.translate(S / 2, S / 2);
    const oct = (rad: number) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i / 8) * Math.PI * 2; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath(); };
    g.fillStyle = '#ffffff'; oct(124); g.fill(); g.fillStyle = '#c8102e'; oct(112); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; oct(100); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 84px "Bebas Neue", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 0, 4);
    return c;
  });
}

export function speedSignTexture(mph: number) {
  return tex('speed' + mph, () => {
    const W = 192, H = 256, [c, g] = canvas(W, H);
    g.fillStyle = '#fafafa'; g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 16); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 6; g.beginPath(); g.roundRect(14, 14, W - 28, H - 28, 10); g.stroke();
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 42px "Bebas Neue", Impact, sans-serif'; g.fillText('SPEED', W / 2, 58); g.fillText('LIMIT', W / 2, 98);
    g.font = '700 110px "Bebas Neue", Impact, sans-serif'; g.fillText(String(mph), W / 2, 178);
    return c;
  });
}

export function schoolSignTexture() {
  return tex('school', () => {
    const S = 256, [c, g] = canvas(S, S);
    g.fillStyle = '#d6ff00'; g.beginPath(); g.moveTo(S / 2, 6); g.lineTo(S - 6, S / 2); g.lineTo(S / 2, S - 6); g.lineTo(6, S / 2); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 8; g.stroke();
    g.fillStyle = '#111'; g.font = '700 48px "Bebas Neue", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SCHOOL', S / 2, S / 2 - 10); g.fillText('ZONE', S / 2, S / 2 + 38);
    return c;
  });
}

/** A soft round glow, white; tint it with the sprite colour. */
export function glowTexture() {
  return tex('glow', () => {
    const S = 128, [c, g] = canvas(S, S);
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  });
}

/** A long soft streak (speed lines, skid fade). */
export function streakTexture() {
  return tex('streak', () => {
    const W = 16, H = 128, [c, g] = canvas(W, H);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(W / 2 - 2, 0, 4, H);
    return c;
  });
}

/** Painted parking bays for the lot lessons. */
export function baysTexture() {
  return tex('bays', () => {
    const S = 512, [c, g] = canvas(S, S);
    g.clearRect(0, 0, S, S); g.strokeStyle = 'rgba(244,244,236,.9)'; g.lineWidth = 8;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * (S / 4), 40); g.lineTo(i * (S / 4), S - 40); g.stroke(); }
    g.beginPath(); g.moveTo(0, S - 40); g.lineTo(S, S - 40); g.stroke();
    return c;
  }, { repeat: true });
}

/** The rounded-rectangle path is missing from old Safari canvases; give it a plain version. */
if (typeof CanvasRenderingContext2D !== 'undefined' && !('roundRect' in CanvasRenderingContext2D.prototype)) {
  (CanvasRenderingContext2D.prototype as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect = function (this: CanvasRenderingContext2D, x, y, w, h, rad) {
    this.moveTo(x + rad, y); this.arcTo(x + w, y, x + w, y + h, rad); this.arcTo(x + w, y + h, x, y + h, rad); this.arcTo(x, y + h, x, y, rad); this.arcTo(x, y, x + w, y, rad); this.closePath();
  };
}
