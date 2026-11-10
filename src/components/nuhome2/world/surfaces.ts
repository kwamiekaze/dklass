import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './theme';

/*
 * Real surfaces, made in the browser: every material here is a colour map plus a normal map cut from the same height field,
 * so the mortar joints, the slate laps and the stone grain catch the sun and throw their own small shadows. Nothing is
 * downloaded, the maps are small (512 px, 256 px on a light phone) and each one is built once and shared.
 */
export type Surface = { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture };

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c: HTMLCanvasElement, srgb: boolean, aniso = 8) => {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
};

/** Wrapping box blur, a few passes: softens the edges of a height field so a joint reads as a chamfer and not a cliff. */
function blur(h: Float32Array, W: number, H: number, passes: number) {
  const t = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = (h[y * W + ((x + W - 1) % W)]! + h[y * W + x]! * 2 + h[y * W + ((x + 1) % W)]!) / 4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = (t[((y + H - 1) % H) * W + x]! + t[y * W + x]! * 2 + t[((y + 1) % H) * W + x]!) / 4;
  }
}

/** A tangent-space normal map from a height field (canvas rows run down, so +v is toward the smaller row). */
function normals(h: Float32Array, W: number, H: number, strength: number) {
  const c = canvas(W, H), g = c.getContext('2d')!, img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = h[y * W + ((x + W - 1) % W)]!, r = h[y * W + ((x + 1) % W)]!, u = h[((y + H - 1) % H) * W + x]!, dn = h[((y + 1) % H) * W + x]!;
    let nx = (l - r) * strength, ny = (dn - u) * strength; const k = 1 / Math.hypot(nx, ny, 1); nx *= k; ny *= k;
    const i = (y * W + x) * 4; d[i] = (nx * .5 + .5) * 255; d[i + 1] = (ny * .5 + .5) * 255; d[i + 2] = (k * .5 + .5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}

/** Soft, tileable mottling: random values on a coarse wrapped grid, smoothly interpolated. */
function mottle(W: number, H: number, cells: number, seed: number) {
  const r = rng(seed), grid = new Float32Array(cells * cells); for (let i = 0; i < grid.length; i++) grid[i] = r();
  const out = new Float32Array(W * H), s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = (x / W) * cells, fy = (y / H) * cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = s(fx - x0), ty = s(fy - y0);
    const a = grid[(y0 % cells) * cells + (x0 % cells)]!, b = grid[(y0 % cells) * cells + ((x0 + 1) % cells)]!, c2 = grid[((y0 + 1) % cells) * cells + (x0 % cells)]!, d2 = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)]!;
    out[y * W + x] = a + (b - a) * tx + (c2 - a) * ty + (a - b - c2 + d2) * tx * ty;
  }
  return out;
}

const cache = new Map<string, Surface>();
const once = (key: string, make: () => Surface) => { let s = cache.get(key); if (!s) { s = make(); cache.set(key, s); } return s; };

/**
 * Dressed limestone in a running bond: 4 blocks by 4 courses a tile (the tile is 3.2 m by 1.6 m on the wall, so a block is
 * 80 cm by 40 cm). Each block has its own tone, the faces are lightly pitted and the joints are recessed.
 */
export function limestone(size = 512): Surface {
  return once(`lime${size}`, () => {
    const S = size, cols = 4, rows = 4, bw = S / cols, bh = S / rows, r = rng(41);
    const c = canvas(S, S), g = c.getContext('2d')!, h = new Float32Array(S * S).fill(1);
    const jx = Math.max(2, Math.round(S / 128)), jy = Math.max(3, Math.round(S / 72));     // joint half-widths in px (the tile is twice as dense down as across)
    for (let row = 0; row < rows; row++) for (let col = -1; col <= cols; col++) {
      const x = col * bw + (row % 2) * bw / 2, y = row * bh, v = (r() - .5) * 13, warm = (r() - .5) * 5;
      g.fillStyle = `rgb(${233 + v + warm},${222 + v},${203 + v - warm})`; g.fillRect(x, y, bw, bh);
    }
    // mottling and fine grain on the faces
    const m1 = mottle(S, S, 6, 7), m2 = mottle(S, S, 22, 9), img = g.getImageData(0, 0, S, S), d = img.data, rr = rng(5);
    for (let i = 0; i < S * S; i++) {
      const n = (m1[i]! - .5) * 16 + (m2[i]! - .5) * 9 + (rr() - .5) * 7;
      d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n * .9;
      h[i] = 1 + (m2[i]! - .5) * .06 + (rr() - .5) * .05;
    }
    // small pits
    for (let k = 0; k < S * 1.4; k++) { const x = Math.floor(rr() * S), y = Math.floor(rr() * S); h[y * S + x]! -= .25 + rr() * .3; const i = (y * S + x) * 4; d[i] -= 16; d[i + 1] -= 16; d[i + 2] -= 14; }
    // joints: recessed in the height, a shade darker and greyer in the colour
    const joint = (x: number, y: number) => { const X = ((x % S) + S) % S, Y = ((y % S) + S) % S, i = Y * S + X; h[i] = 0; d[i * 4] = 176; d[i * 4 + 1] = 163; d[i * 4 + 2] = 143; };
    for (let row = 0; row < rows; row++) {
      for (let x = 0; x < S; x++) for (let k = -jy; k < jy; k++) joint(x, row * bh + k);
      for (let col = 0; col < cols; col++) { const x0 = Math.round(col * bw + (row % 2) * bw / 2); for (let y = 0; y < bh; y++) for (let k = -jx; k < jx; k++) joint(x0 + k, row * bh + y); }
    }
    blur(h, S, S, 2);
    // the shade that gathers in a joint, baked into the colour
    for (let i = 0; i < S * S; i++) { const a = .8 + .2 * Math.min(1, h[i]! * 1.15); d[i * 4] *= a; d[i * 4 + 1] *= a; d[i * 4 + 2] *= a; }
    g.putImageData(img, 0, 0);
    return { map: tex(c, true), normalMap: tex(normals(h, S, S, 3.2), false) };
  });
}

/** Smooth dressed stone for trim (cornices, sills, columns): the same warm stone without joints, only grain. */
export function dressedStone(size = 256): Surface {
  return once(`dress${size}`, () => {
    const S = size, c = canvas(S, S), g = c.getContext('2d')!, h = new Float32Array(S * S), r = rng(77);
    g.fillStyle = '#f1e8d6'; g.fillRect(0, 0, S, S);
    const m1 = mottle(S, S, 5, 3), m2 = mottle(S, S, 28, 4), img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < S * S; i++) { const n = (m1[i]! - .5) * 12 + (m2[i]! - .5) * 7 + (r() - .5) * 6; d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n * .9; h[i] = m2[i]! * .5 + r() * .5; }
    g.putImageData(img, 0, 0); blur(h, S, S, 1);
    return { map: tex(c, true), normalMap: tex(normals(h, S, S, .9), false) };
  });
}

/** Welsh slate, laid in lapped courses: every slate is thickest at its lower edge, where it rides over the course below. */
export function slate(size = 512): Surface {
  return once(`slate${size}`, () => {
    const S = size, rows = 10, tw = S / 8, rh = S / rows, r = rng(17);
    const c = canvas(S, S), g = c.getContext('2d')!, h = new Float32Array(S * S);
    for (let y = 0; y < rows; y++) for (let x = -1; x <= 8; x++) {
      const x0 = Math.round(x * tw + (y % 2) * tw / 2), y0 = Math.round(y * rh), v = (r() - .5) * 22, tone = 60 + v, lift = r() * .18;
      g.fillStyle = `rgb(${tone},${tone + 3},${tone + 11})`; g.fillRect(x0, y0, tw, rh);
      if (r() > .84) { g.fillStyle = 'rgba(118,128,108,.16)'; g.fillRect(x0 + 3, y0 + 4, tw * .55, rh * .4); }      // a little lichen
      if (r() > .9) { g.fillStyle = 'rgba(150,120,96,.12)'; g.fillRect(x0 + tw * .3, y0 + 2, tw * .5, rh * .6); }      // a rust-toned slate
      for (let py = 0; py < rh; py++) for (let px = 1; px < tw - 1; px++) { const X = ((x0 + px) % S + S) % S, Y = (y0 + py) % S; h[Y * S + X] = .25 + .75 * (py / rh) + lift; }
    }
    const m = mottle(S, S, 40, 11), img = g.getImageData(0, 0, S, S), d = img.data, rr = rng(3);
    for (let i = 0; i < S * S; i++) { const n = (m[i]! - .5) * 14 + (rr() - .5) * 8; d[i * 4] += n; d[i * 4 + 1] += n; d[i * 4 + 2] += n; h[i]! += (m[i]! - .5) * .08; }
    // the shadow each course drops on the one below, and the sheen along each lower edge
    for (let y = 0; y < rows; y++) for (let py = 0; py < rh; py++) { const Y = Math.round(y * rh) + py; if (Y >= S) continue; const a = py < rh * .22 ? .62 + 1.7 * (py / rh) : py > rh * .9 ? 1.12 : 1; if (a === 1) continue; for (let x = 0; x < S; x++) { const i = (Y * S + x) * 4; d[i] *= a; d[i + 1] *= a; d[i + 2] *= a; } }
    g.putImageData(img, 0, 0); blur(h, S, S, 1);
    return { map: tex(c, true), normalMap: tex(normals(h, S, S, 2.6), false) };
  });
}

/** The fine stone of a road surface, as a normal map only: laid over the baked colour at a much tighter repeat. */
export function aggregateNormal(size = 256): THREE.CanvasTexture {
  return once(`agg${size}`, () => {
    const S = size, h = new Float32Array(S * S), r = rng(12);
    for (let i = 0; i < S * S; i++) h[i] = r() * .5;
    for (let k = 0; k < S * S * .08; k++) { const x = Math.floor(r() * S), y = Math.floor(r() * S), v = .5 + r() * .5; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) h[((y + a) % S) * S + ((x + b) % S)] = v; }
    blur(h, S, S, 1);
    const n = tex(normals(h, S, S, 1.5), false);
    return { map: n, normalMap: n };
  }).normalMap;
}

/** Turf: soft clumps and blade-scale noise, so the mown lawn is not a flat sheet under a low sun. */
export function turfNormal(size = 256): THREE.CanvasTexture {
  return once(`turf${size}`, () => {
    const S = size, a = mottle(S, S, 14, 31), b = mottle(S, S, 48, 32), h = new Float32Array(S * S), r = rng(8);
    for (let i = 0; i < S * S; i++) h[i] = a[i]! * .6 + b[i]! * .3 + r() * .25;
    const n = tex(normals(h, S, S, 1.8), false);
    return { map: n, normalMap: n };
  }).normalMap;
}

/** A clone that shares the image (one upload) but has its own repeat. */
export function tiled<T extends THREE.Texture>(t: T, rx: number, ry: number): T { const c = t.clone() as T; c.repeat.set(rx, ry); c.needsUpdate = true; return c; }

// ---------------------------------------------------------------- merged masonry

/** A box as [centre x, y, z, width, height, depth]. */
export type B = [number, number, number, number, number, number];
export const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): B => [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)];

/**
 * Texture coordinates laid from the position itself, in metres: a wall built from many pieces then shares one unbroken
 * pattern, so the courses of stone line up from pier to pier and round every corner.
 */
export function worldUV(g: THREE.BufferGeometry, tileW = 3.2, tileH = 1.6) {
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (az >= ax && az >= ay) { uv[i * 2] = p.getX(i) / tileW; uv[i * 2 + 1] = p.getY(i) / tileH; }
    else if (ax >= ay) { uv[i * 2] = p.getZ(i) / tileW; uv[i * 2 + 1] = p.getY(i) / tileH; }
    else { uv[i * 2] = p.getX(i) / tileW; uv[i * 2 + 1] = p.getZ(i) / tileH; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

/** Many boxes (and any other pieces) as one mesh: one draw call for a whole wall, a cornice or a row of dentils. */
export function masonry(boxes: B[], extra: THREE.BufferGeometry[] = [], tileW = 3.2, tileH = 1.6): THREE.BufferGeometry {
  const parts = boxes.filter(b => b[3] > .005 && b[4] > .005 && b[5] > .005).map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
  extra.forEach(e => { const g = e.index ? e.toNonIndexed() : e; Object.keys(g.attributes).forEach(k => { if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); }); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2)); parts.push(g); });
  const g = mergeGeometries(parts, false)!; parts.forEach(p => p.dispose());
  return worldUV(g, tileW, tileH);
}

/**
 * A classical column, base on y = 0: a square plinth, a moulded base, a fluted shaft that narrows a little toward the top
 * (entasis), a rounded capital and a square abacus. One geometry; scale it for a smaller order.
 */
export function columnGeometry(H: number, R: number, flutes = 20, seg = 5): THREE.BufferGeometry {
  const baseH = R * .62, capH = R * .66, y0 = baseH, y1 = H - capH, rs = flutes * seg, parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(1, 1, y1 - y0, rs, 8, true), p = shaft.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / (y1 - y0) + .5, a = Math.atan2(p.getZ(i), p.getX(i));
    const taper = R * (1 - .13 * t * t), flute = 1 - .05 * Math.pow(.5 + .5 * Math.cos(a * flutes), .7);
    p.setXYZ(i, Math.cos(a) * taper * flute, p.getY(i) + (y0 + y1) / 2, Math.sin(a) * taper * flute);
  }
  shaft.computeVertexNormals(); parts.push(shaft.toNonIndexed());
  const lathe = (pts: [number, number][]) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 40); g.computeVertexNormals(); return g.toNonIndexed(); };
  const P = R * .16;   // plinth height
  parts.push(new THREE.BoxGeometry(R * 2.9, P, R * 2.9).translate(0, P / 2, 0).toNonIndexed());
  // attic base: torus, scotia, torus
  parts.push(lathe([[R * 1.38, P], [R * 1.42, P + baseH * .1], [R * 1.4, P + baseH * .24], [R * 1.26, P + baseH * .32], [R * 1.14, P + baseH * .4], [R * 1.12, P + baseH * .5], [R * 1.2, P + baseH * .58], [R * 1.22, P + baseH * .66], [R * 1.16, P + baseH * .74], [R * 1.02, P + baseH * .8], [R, baseH]]));
  // capital: astragal, necking, echinus
  const rt = R * .87;
  parts.push(lathe([[rt, y1], [rt * 1.08, y1 + capH * .06], [rt * 1.08, y1 + capH * .14], [rt, y1 + capH * .2], [rt, y1 + capH * .4], [rt * 1.12, y1 + capH * .5], [rt * 1.38, y1 + capH * .66], [rt * 1.5, y1 + capH * .76], [rt * 1.5, y1 + capH * .8]]));
  parts.push(new THREE.BoxGeometry(R * 2.85, capH * .2, R * 2.85).translate(0, H - capH * .1, 0).toNonIndexed());
  const g = mergeGeometries(parts, false)!; parts.forEach(q => q.dispose());
  // the stone grain wraps the shaft: a simple cylindrical unwrap in metres
  const pos = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2)) * 3; uv[i * 2 + 1] = pos.getY(i) / 1.4; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}

/**
 * Baked-in weathering for a wall material: a little darker at the foot, where rain splashes, and under the cornice, where the
 * sky never reaches. It is two smoothsteps on the world height, so it costs nothing and never flickers.
 */
export function weather(m: THREE.MeshStandardMaterial, footY: number, eaveY: number) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uFoot = { value: footY }; sh.uniforms.uEave = { value: eaveY };
    sh.vertexShader = 'varying float vWy;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWy = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = 'varying float vWy; uniform float uFoot, uEave;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(.86, 1., smoothstep(uFoot, uFoot + 1.5, vWy)) * mix(1., .88, smoothstep(uEave - 1.1, uEave, vWy));');
  };
  m.customProgramCacheKey = () => `weather${footY}${eaveY}`;
  return m;
}
