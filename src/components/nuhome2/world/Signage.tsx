import { useContext, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import serifBold from 'three/examples/fonts/droid/droid_serif_bold.typeface.json';
import { NightCtx, radialTexture } from './theme';

/*
 * Real signage: letters cut from a classical serif and extruded with a bevel, five-pointed stars with a ridge down every
 * point (so each one catches the light in facets, like cast metal), warm halos that come up at night. One merged mesh per
 * word and one per star row, so a whole sign is two or three draw calls on any phone.
 */
let FONT: Font | null = null;
const font = () => (FONT ??= new FontLoader().parse(serifBold as never));

/** A five point star with a raised ridge to every point and a flat back. Flat shaded, so the facets read as cast metal. */
export function facetedStar(R: number, thick = .34, ridge = .3): THREE.BufferGeometry {
  const rim: [number, number][] = Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? R * .42 : R; return [Math.cos(a) * r, Math.sin(a) * r]; });
  const t = R * thick * .5, h = R * ridge, pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < 10; i++) {
    const [x0, y0] = rim[i]!, [x1, y1] = rim[(i + 1) % 10]!;
    tri([0, 0, t + h], [x0, y0, t], [x1, y1, t]);                       // front facet, centre to the rim
    tri([x0, y0, 0], [x1, y1, 0], [0, 0, 0]);                           // flat back
    tri([x0, y0, 0], [x1, y1, t], [x0, y0, t]); tri([x0, y0, 0], [x1, y1, 0], [x1, y1, t]);   // edge
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

/** A row of stars, the middle one the biggest, merged into one geometry. `sizes` are radii, `gap` is the centre to centre distance. */
export function starRow(sizes: number[], gap: number, thick = .34): THREE.BufferGeometry {
  const parts = sizes.map((R, i) => facetedStar(R, thick).translate((i - (sizes.length - 1) / 2) * gap, 0, 0));
  return mergeGeometries(parts, false)!;
}

/** A word in the sign font, laid out letter by letter with tracking, centred on x, baseline on y = 0 and fitted to `width` metres. */
export function wordGeometry(text: string, width: number, depth: number, bevel: number, tracking = .06, seg = 6): THREE.BufferGeometry {
  const f = font(), size = 1, k = size / f.data.resolution, parts: THREE.BufferGeometry[] = [];
  let x = 0;
  for (const ch of text) {
    const glyph = f.data.glyphs[ch] ?? f.data.glyphs['?']!;
    if (ch !== ' ') {
      const g = new TextGeometry(ch, { font: f, size, depth, curveSegments: seg, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * .7, bevelOffset: 0, bevelSegments: 2 });
      g.translate(x, 0, 0); parts.push(g);
    }
    x += glyph.ha * k + tracking;
  }
  const g = mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p; }), false)!; g.computeBoundingBox();
  const bb = g.boundingBox!, s = width / (bb.max.x - bb.min.x);
  g.translate(-(bb.max.x + bb.min.x) / 2, 0, 0); g.scale(s, s, s); return g;
}

export const goldMat = (night = false) => new THREE.MeshStandardMaterial({ color: night ? '#c9962e' : '#d9ac3c', metalness: .8, roughness: .44, envMapIntensity: 1.05, emissive: '#ff9a1a', emissiveIntensity: 0 });
export const champagneMat = () => new THREE.MeshStandardMaterial({ color: '#e6d6b2', metalness: .9, roughness: .34, envMapIntensity: 1.5, emissive: '#ffcf80', emissiveIntensity: 0 });

/** Drives a metal's glow from the day and night mix: dark cast metal by day, warm backlit metal at night. */
export function useGlow(mats: THREE.MeshStandardMaterial[], day: number, night: number) {
  const mix = useContext(NightCtx);
  useFrame(() => { const v = day + (night - day) * mix.current; mats.forEach(m => { m.emissiveIntensity = v; }); });
}

/** A soft warm halo behind lettering that comes up at night. */
export function Halo({ position, size, color = '255,190,100', strength = .55 }: { position: [number, number, number]; size: [number, number]; color?: string; strength?: number }) {
  const mix = useContext(NightCtx);
  const ref = useRef<THREE.MeshBasicMaterial>(null);
  const map = useMemo(() => new THREE.CanvasTexture(radialTexture([[0, `rgba(${color},1)`], [.5, `rgba(${color},.38)`], [1, `rgba(${color},0)`]])), [color]);
  useFrame(() => { if (ref.current) ref.current.opacity = strength * (.08 + .92 * mix.current); });
  return <mesh position={position} renderOrder={3}><planeGeometry args={size} /><meshBasicMaterial ref={ref} map={map} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} /></mesh>;
}

/*
 * Carved lettering and stars, built as real geometry (no stencil, no coplanar faces, so nothing can flicker):
 *   - the stone face is a flat plate with the letters (and star outlines) cut out of it
 *   - behind each cut-out letter sits a gilded cavity: its inside walls and floor, one tidy extrusion seen from inside
 *   - the little islands of stone inside A, D, R ... are flat caps level with the face
 * Everything that meets does so edge to edge on shared points, and nothing overlaps at the same depth.
 */
type Outline = { outer: THREE.Vector2[]; holes: THREE.Vector2[][] };
/** A word's glyph outlines, tracked, centred on x, baseline at y = 0, fitted to `width` metres. */
function wordOutlines(text: string, width: number, tracking: number, div: number): Outline[] {
  const f = font(), k = 1 / f.data.resolution, out: Outline[] = [];
  let x = 0;
  for (const ch of text) {
    const glyph = f.data.glyphs[ch] ?? f.data.glyphs['?']!;
    if (ch !== ' ') for (const sh of f.generateShapes(ch, 1)) { const e = sh.extractPoints(div); out.push({ outer: e.shape.map(v => new THREE.Vector2(v.x + x, v.y)), holes: e.holes.map(h => h.map(v => new THREE.Vector2(v.x + x, v.y))) }); }
    x += glyph.ha * k + tracking;
  }
  let x0 = 1e9, x1 = -1e9; out.forEach(o => o.outer.forEach(v => { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); }));
  const sc = width / (x1 - x0), cx = (x0 + x1) / 2;
  const fit = (v: THREE.Vector2) => new THREE.Vector2((v.x - cx) * sc, v.y * sc);
  return out.map(o => ({ outer: o.outer.map(fit), holes: o.holes.map(h => h.map(fit)) }));
}
const flatUV = (g: THREE.BufferGeometry, w: number, h: number, cx: number, cy: number) => {   // stone texture coordinates 0..1 across the face
  const p = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - cx) / w + .5; uv[i * 2 + 1] = (p.getY(i) - cy) / h + .5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
};
/**
 * A carved word on a rectangular face (`w` by `h`, centred on the origin, front at z = 0), letters `depth` deep:
 *   face: the stone with the letters cut out;  islands: stone inside the counters;  cavity: gilded walls and floor (use BackSide).
 * `y` is the baseline height inside the face.
 */
export function carvedWord(text: string, textWidth: number, w: number, h: number, y: number, depth: number, tracking = .07, div = 8) {
  const glyphs = wordOutlines(text, textWidth, tracking, div).map(o => ({ outer: o.outer.map(v => new THREE.Vector2(v.x, v.y + y)), holes: o.holes.map(hh => hh.map(v => new THREE.Vector2(v.x, v.y + y))) }));
  const plate = new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2)]);
  glyphs.forEach(g => plate.holes.push(new THREE.Path(g.outer)));
  const face = flatUV(new THREE.ShapeGeometry(plate), w, h, 0, 0);
  const isl = glyphs.flatMap(g => g.holes.map(hh => new THREE.ShapeGeometry(new THREE.Shape(hh))));
  const islands = isl.length ? flatUV(mergeGeometries(isl, false)!, w, h, 0, 0) : new THREE.BufferGeometry();
  const letters = glyphs.map(g => { const s = new THREE.Shape(g.outer); g.holes.forEach(hh => s.holes.push(new THREE.Path(hh))); return s; });
  const cavity = new THREE.ExtrudeGeometry(letters, { depth, bevelEnabled: false, curveSegments: 1 }); cavity.translate(0, 0, -depth); cavity.computeVertexNormals();
  return { face, islands, cavity };
}
/** A star carved into stone: a V-cut, each point a pair of facets sloping down to a centre `depth` behind the surface. */
export function carvedStar(R: number, depth: number): THREE.BufferGeometry {
  const rim = starRim(R), pos: number[] = [];
  for (let i = 0; i < 10; i++) { const [x0, y0] = rim[i]!, [x1, y1] = rim[(i + 1) % 10]!; pos.push(0, 0, -depth, x0, y0, 0, x1, y1, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
const starRim = (R: number): [number, number][] => Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? R * .42 : R; return [Math.cos(a) * r, Math.sin(a) * r]; });
/** A row of V-cut stars (centre star biggest, outer ones a little lower so the row follows the arch) and the matching outlines to cut out of the face. */
export function carvedRow(sizes: number[], gap: number, drop: number[], depth: number) {
  const at = (i: number) => ({ x: (i - (sizes.length - 1) / 2) * gap, y: drop[i] ?? 0 });
  const cut = mergeGeometries(sizes.map((R, i) => { const g = carvedStar(R, depth * R / Math.max(...sizes)), q = at(i); return g.translate(q.x, q.y, 0); }), false)!;
  const outlines = sizes.map((R, i) => { const q = at(i); return starRim(R).map(([x, y]) => new THREE.Vector2(x + q.x, y + q.y)); });
  return { cut, outlines };
}
