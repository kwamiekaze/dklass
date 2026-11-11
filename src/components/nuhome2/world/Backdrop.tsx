import { useContext, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx, rng } from './theme';
import { atmo } from './atmosphere';

/*
 * The city beyond the trees, seen the way a long lens sees it: every tower is drawn in full (curtain walls floor by floor,
 * stone piers and punched windows, setbacks, crowns, plant rooms, masts, a water tank here and there) and then thrown out of
 * focus, so it sits behind the estate as soft, deep background. At night the lit windows are painted as discs of light,
 * the bokeh a fast lens makes of a far city. Two rings at two distances slide against each other as the camera moves.
 * Each ring is one draw call with one painted texture; nothing is downloaded.
 */
type Ring = { day: THREE.CanvasTexture; lights: THREE.CanvasTexture };

/** Where the city may stand, by compass angle in degrees (0 = east, 90 = toward the street): the back half and two front corners. */
const allowed = (deg: number) => deg >= 180 || (deg > 33 && deg < 60) || (deg > 120 && deg < 147);

function paintRing(W: number, H: number, mPerPx: number, seed: number, far: boolean): Ring {
  const day = document.createElement('canvas'); day.width = W; day.height = H; const g = day.getContext('2d')!;
  const lit = document.createElement('canvas'); lit.width = W; lit.height = H; const l = lit.getContext('2d')!;
  l.globalCompositeOperation = 'lighter';
  const r = rng(seed), px = (m: number) => m / mPerPx, ground = H - px(2);
  const bokeh = (x: number, y: number, rad: number, col: string, a: number) => {
    const gr = l.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.72, `rgba(${col},${a * .92})`); gr.addColorStop(.9, `rgba(${col},${a * 1.15})`); gr.addColorStop(1, `rgba(${col},0)`);
    l.fillStyle = gr; l.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  const glassTints = [[92, 132, 178], [70, 112, 150], [116, 150, 176], [84, 120, 132], [60, 92, 140], [128, 146, 166]];
  const stoneTints = [[206, 192, 170], [186, 170, 150], [170, 128, 108], [214, 206, 196], [150, 140, 132]];
  const tower = (x: number, w: number, h: number, depthShade: number) => {
    const kind = r(), glass = kind < .74, tint = (glass ? glassTints : stoneTints)[Math.floor(r() * (glass ? 6 : 5))]!;
    // distance lays blue air over everything: each tower's own colour is mixed toward the haze, the far ring most of all
    const hz = far ? .56 : .36, air = [176, 200, 230];
    const col = (k: number, a = 1) => `rgba(${[0, 1, 2].map(i => Math.round(Math.min(255, tint[i]! * k * depthShade) * (1 - hz) + air[i]! * hz)).join(',')},${a})`;
    const side = w * (.22 + r() * .14), floorH = px(3.4), bay = px(glass ? 1.6 : 2.6);
    // massing: up to three tiers, each set back from the one below
    const tiers = h > px(26) && r() > .35 ? (r() > .5 ? 3 : 2) : 1; let y = ground, tw = w, tx = x;
    for (let t = 0; t < tiers; t++) {
      const th = tiers === 1 ? h : h * (t === 0 ? .58 : t === 1 ? (tiers === 2 ? .42 : .27) : .15), top = y - th, ts = side * (tw / w);
      // the lit face and the face in shade
      const face = g.createLinearGradient(0, top, 0, y); face.addColorStop(0, col(1.1)); face.addColorStop(1, col(.82));
      g.fillStyle = face; g.fillRect(tx, top, tw - ts, th); g.fillStyle = col(.58); g.fillRect(tx + tw - ts, top, ts, th);
      if (glass) {
        // the sky lying across the curtain wall, then floor by floor: vision glass, a spandrel, mullions
        const sk = g.createLinearGradient(tx, top, tx + tw, y); sk.addColorStop(0, 'rgba(226,240,255,.34)'); sk.addColorStop(.45, 'rgba(226,240,255,.04)'); sk.addColorStop(1, 'rgba(20,34,60,.2)'); g.fillStyle = sk; g.fillRect(tx, top, tw - ts, th);
        for (let fy = top + floorH; fy < y; fy += floorH) { g.fillStyle = 'rgba(18,28,46,.4)'; g.fillRect(tx, fy - floorH * .26, tw, floorH * .26); }
        g.fillStyle = 'rgba(236,244,255,.3)'; for (let bx = tx; bx < tx + tw - ts; bx += bay) g.fillRect(bx, top, Math.max(1, bay * .12), th);
        for (let fy = top + floorH * .2; fy < y - floorH; fy += floorH) for (let bx = tx + bay * .15; bx < tx + tw - ts - bay * .5; bx += bay) { const v = r(); if (v > .78) { g.fillStyle = `rgba(240,248,255,${.14 + r() * .3})`; g.fillRect(bx, fy, bay * .8, floorH * .5); } else if (v < .16) { g.fillStyle = 'rgba(10,20,40,.3)'; g.fillRect(bx, fy, bay * .8, floorH * .5); } }
      } else {
        // masonry: piers, a cornice at each tier, punched windows with a glint of sky
        g.fillStyle = col(1.2); g.fillRect(tx - 1, top, tw + 2, Math.max(2, floorH * .3));
        for (let fy = top + floorH * .55; fy < y - floorH * .6; fy += floorH) for (let bx = tx + bay * .3; bx < tx + tw - ts - bay * .5; bx += bay) { g.fillStyle = r() > .7 ? 'rgba(168,196,226,.9)' : 'rgba(44,58,82,.9)'; g.fillRect(bx, fy, bay * .5, floorH * .52); }
        for (let fy = top + floorH * .55; fy < y - floorH * .6; fy += floorH) for (let bx = tx + tw - ts + bay * .2; bx < tx + tw - bay * .3; bx += bay * .8) { g.fillStyle = 'rgba(28,36,54,.85)'; g.fillRect(bx, fy, bay * .36, floorH * .52); }
      }
      // night: most floors have someone working late; each lit window is a disc of light
      for (let fy = top + floorH * .5; fy < y - floorH * .4; fy += floorH) { const busy = r() > .22 ? .4 + r() * .4 : .06; for (let bx = tx + bay * .4; bx < tx + tw - bay * .3; bx += bay * (glass ? 1.4 : 1)) if (r() < busy * .6) { const c = r(); bokeh(bx, fy, floorH * (.26 + r() * .26) * (far ? .85 : 1.05), c > .8 ? '190,212,255' : c > .3 ? '255,190,110' : '255,222,160', .26 + r() * .36); } }
      y = top; const inset = tw * (.1 + r() * .1); tx += inset; tw -= inset * 2;
    }
    // the roofline: a crown, a plant room, a mast, a water tank
    const k = r();
    if (k < .22) { g.fillStyle = col(.9); g.beginPath(); g.moveTo(tx, y); g.lineTo(tx + tw / 2, y - tw * .34); g.lineTo(tx + tw, y); g.closePath(); g.fill(); g.fillStyle = col(.62); g.beginPath(); g.moveTo(tx + tw / 2, y - tw * .34); g.lineTo(tx + tw, y); g.lineTo(tx + tw * .62, y); g.closePath(); g.fill(); }
    else if (k < .5) { g.fillStyle = col(.7); g.fillRect(tx + tw * .2, y - px(4), tw * .5, px(4)); g.fillStyle = 'rgba(70,78,92,.95)'; g.fillRect(tx + tw * .44, y - px(4) - px(9 + r() * 14), Math.max(1.5, px(.5)), px(24)); bokeh(tx + tw * .45, y - px(13 + r() * 8), px(1.6), '255,70,60', .9); }
    else if (k < .64) { g.fillStyle = 'rgba(96,70,52,.95)'; g.fillRect(tx + tw * .3, y - px(5.5), px(4), px(4)); g.beginPath(); g.moveTo(tx + tw * .3 - 1, y - px(5.5)); g.lineTo(tx + tw * .3 + px(2), y - px(7.6)); g.lineTo(tx + tw * .3 + px(4) + 1, y - px(5.5)); g.fill(); g.fillStyle = 'rgba(60,60,66,.9)'; g.fillRect(tx + tw * .3 + px(.4), y - px(1.6), px(.4), px(1.6)); g.fillRect(tx + tw * .3 + px(3.2), y - px(1.6), px(.4), px(1.6)); }
    else if (k < .8) { g.fillStyle = col(1.15); g.fillRect(tx - 1, y - px(1.2), tw + 2, px(1.2)); }
  };
  // back to front, so nearer towers overlap farther ones
  const list: { x: number; w: number; h: number; d: number }[] = [];
  for (let x = 0; x < W;) {
    // the cylinder's u runs from the street side round by east: turn a pixel column into a compass angle
    const at = (X: number) => (((90 - (X / W) * 360) % 360) + 360) % 360;
    const deg = at(x), w = px(14 + r() * 22), gap = px(r() * 12 - 5);
    if (allowed(deg) && allowed(at(x + w))) {
      // the skyline swells toward the middle of each district and thins at its edges
      const mid = deg >= 180 ? Math.sin(((deg - 180) / 180) * Math.PI) : Math.sin(((deg > 90 ? deg - 120 : deg - 33) / 27) * Math.PI);
      const h = px((far ? 17 : 11) + r() * (far ? 24 : 19) * (.4 + .6 * mid) + (r() > .9 ? 13 * mid : 0));
      list.push({ x, w, h, d: r() });
    }
    x += w + gap;
  }
  list.sort((a, b) => a.d - b.d).forEach(t => tower(t.x, t.w, Math.min(t.h, ground - 6), far ? .94 : .86 + t.d * .14));
  // the far tree line that every city sits in: soft crowns all the way round
  for (let x = -20; x < W + 20; x += px(3 + r() * 4)) { const rad = px(2.6 + r() * 3.4), yy = ground - rad * (.5 + r() * .6); const v = r(); g.fillStyle = `rgba(${34 + v * 30},${66 + v * 40},${36 + v * 20},1)`; g.beginPath(); g.arc(x, yy, rad, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(40,72,40,1)'; g.fillRect(0, ground - px(2), W, H);
  // out of focus: a few passes through a smaller copy soften every edge, window and outline alike
  const soft = (src: HTMLCanvasElement, ctx: CanvasRenderingContext2D, k: number) => { const t = document.createElement('canvas'); t.width = Math.max(1, Math.round(W / k)); t.height = Math.max(1, Math.round(H / k)); const tc = t.getContext('2d')!; tc.imageSmoothingQuality = 'high'; tc.drawImage(src, 0, 0, t.width, t.height); ctx.save(); ctx.globalCompositeOperation = 'copy'; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(t, 0, 0, W, H); ctx.restore(); };
  soft(day, g, far ? 3.4 : 2.4); soft(day, g, far ? 2.2 : 1.7);
  const mk = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { day: mk(day), lights: mk(lit) };
}

export function Backdrop({ lite = false }: { lite?: boolean }) {
  const mix = useContext(NightCtx);
  const rings = useMemo(() => {
    const W = lite ? 2048 : 4096, mk = (radius: number, height: number, seed: number, far: boolean) => {
      const H = Math.round(W * height / (Math.PI * 2 * radius)), tex = paintRing(W, H, (Math.PI * 2 * radius) / W, seed, far);
      const geo = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true); geo.translate(0, height / 2 - 2, 0);
      const day = new THREE.MeshBasicMaterial({ map: tex.day, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false });
      const lights = new THREE.MeshBasicMaterial({ map: tex.lights, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
      return { geo, day, lights };
    };
    return [mk(176, 72, 61, true), mk(142, 56, 23, false)];
  }, [lite]);
  const C = useMemo(() => ({ d: new THREE.Color('#ffffff'), n: new THREE.Color('#262c58'), grey: new THREE.Color('#aab0ba') }), []);
  useFrame(() => {
    const m = mix.current, L = atmo.look, veil = Math.min(1, L.fog + L.rain * .5 + L.snow * .5);
    rings.forEach((r, i) => {
      r.day.color.copy(C.d).lerp(C.grey, Math.min(1, L.cloud * .5)).lerp(C.n, m).multiplyScalar(1 - .45 * atmo.deep * m);
      r.day.opacity = (i === 0 ? .9 : 1) * (1 - .8 * veil);
      r.lights.opacity = m * (i === 0 ? .7 : 1) * (1 - .7 * veil) * (1 - .35 * atmo.deep); r.lights.visible = m > .02;
    });
  });
  return <group>
    {rings.map((r, i) => <group key={i}><mesh geometry={r.geo} material={r.day} renderOrder={-4 + i} frustumCulled={false} /><mesh geometry={r.geo} material={r.lights} renderOrder={-3 + i} frustumCulled={false} /></group>)}
  </group>;
}
