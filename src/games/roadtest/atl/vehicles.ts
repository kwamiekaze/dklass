/**
 * Every vehicle of the Atlanta traffic is built here from boxes and cylinders, merged into four pieces per kind:
 *   paint   the coloured body (tinted per car by the instance colour)
 *   detail  glass, wheels, bumpers, mirrors: fixed colours
 *   tail    the tail lamps (their glow follows the brake)
 *   head    the head lamps
 * The front of every vehicle points to -z, the way the road runs away from the camera.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIM, type VehKind } from './sim';

type Part = { g: THREE.BufferGeometry };
const col = (g: THREE.BufferGeometry, hex: string) => {
  const c = new THREE.Color(hex); const n = g.getAttribute('position').count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const box = (w: number, h: number, l: number, x: number, y: number, z: number, hex = '#ffffff', rx = 0): Part => {
  const g = new THREE.BoxGeometry(w, h, l); if (rx) g.rotateX(rx); g.translate(x, y, z); return { g: col(g.toNonIndexed(), hex) };
};
const wheel = (r: number, w: number, x: number, z: number): Part => {
  const g = new THREE.CylinderGeometry(r, r, w, 14); g.rotateZ(Math.PI / 2); g.translate(x, r, z); return { g: col(g.toNonIndexed(), '#121214') };
};
const merge = (ps: Part[]) => mergeGeometries(ps.map((p) => p.g), false)!;

interface Spec { w: number; l: number; bodyH: number; cabH: number; cabL: number; cabZ: number; cabW: number; wr: number; clear: number; roofRake?: number }
const SPEC: Partial<Record<VehKind, Spec>> = {
  sedan: { w: 1.85, l: 4.7, bodyH: 0.62, cabH: 0.5, cabL: 2.3, cabZ: 0.25, cabW: 1.58, wr: 0.34, clear: 0.26 },
  taxi: { w: 1.85, l: 4.7, bodyH: 0.62, cabH: 0.52, cabL: 2.3, cabZ: 0.25, cabW: 1.58, wr: 0.34, clear: 0.26 },
  hatch: { w: 1.8, l: 4.1, bodyH: 0.6, cabH: 0.56, cabL: 2.3, cabZ: 0.55, cabW: 1.55, wr: 0.32, clear: 0.24 },
  suv: { w: 1.97, l: 4.9, bodyH: 0.8, cabH: 0.62, cabL: 2.9, cabZ: 0.5, cabW: 1.72, wr: 0.38, clear: 0.34 },
  pickup: { w: 2.0, l: 5.5, bodyH: 0.78, cabH: 0.62, cabL: 1.8, cabZ: -0.6, cabW: 1.74, wr: 0.4, clear: 0.36 },
  van: { w: 2.0, l: 5.4, bodyH: 1.05, cabH: 0.72, cabL: 4.3, cabZ: 0.3, cabW: 1.84, wr: 0.36, clear: 0.3 },
  police: { w: 1.95, l: 4.95, bodyH: 0.66, cabH: 0.52, cabL: 2.5, cabZ: 0.25, cabW: 1.66, wr: 0.36, clear: 0.28 },
  wreck: { w: 1.85, l: 4.6, bodyH: 0.62, cabH: 0.5, cabL: 2.3, cabZ: 0.25, cabW: 1.58, wr: 0.34, clear: 0.26 },
};

function carLike(kind: VehKind) {
  const s = SPEC[kind]!, L = s.l, hl = L / 2;
  const by = s.clear + s.bodyH / 2, top = s.clear + s.bodyH;
  const paint: Part[] = [box(s.w, s.bodyH, L, 0, by, 0)];
  const detail: Part[] = [];
  // cabin: glass band and a roof
  detail.push(box(s.cabW + 0.02, s.cabH * 0.78, s.cabL + 0.02, 0, top + s.cabH * 0.46, s.cabZ, '#10151c'));
  paint.push(box(s.cabW - 0.04, 0.07, s.cabL - 0.15, 0, top + s.cabH + 0.02, s.cabZ));
  paint.push(box(s.cabW - 0.06, 0.1, 0.1, 0, top + s.cabH * 0.5, s.cabZ - s.cabL / 2 + 0.04, '#ffffff', 0.4));
  if (kind === 'pickup') { paint.push(box(s.w, 0.28, 2.3, 0, top + 0.02, hl - 1.25)); detail.push(box(s.w - 0.3, 0.05, 2.1, 0, top + 0.2, hl - 1.25, '#1a1a1e')); }
  if (kind === 'van') { paint.push(box(s.w - 0.04, 0.3, L * 0.36, 0, top + s.cabH + 0.12, -hl + L * 0.2)); }
  // bumpers, grille, mirrors
  detail.push(box(s.w + 0.02, 0.22, 0.2, 0, s.clear + 0.14, -hl, '#222226'), box(s.w + 0.02, 0.22, 0.2, 0, s.clear + 0.14, hl, '#222226'));
  detail.push(box(s.w * 0.6, 0.16, 0.05, 0, s.clear + 0.45, -hl - 0.02, '#0b0b0d'));
  detail.push(box(0.14, 0.14, 0.22, s.cabW / 2 + 0.1, top + 0.12, -s.cabL / 2 + s.cabZ + 0.2, '#16161a'), box(0.14, 0.14, 0.22, -s.cabW / 2 - 0.1, top + 0.12, -s.cabL / 2 + s.cabZ + 0.2, '#16161a'));
  if (kind === 'taxi') detail.push(box(0.5, 0.14, 0.2, 0, top + s.cabH + 0.14, s.cabZ, '#f2c14e'));
  if (kind === 'police') { detail.push(box(s.w * 0.98, 0.3, 1.5, 0, s.clear + 0.22, -0.1, '#0a0a0c')); detail.push(box(0.7, 0.1, 0.22, 0, top + s.cabH + 0.1, s.cabZ - 0.15, '#2a2a2e')); }
  const wx = s.w / 2 - 0.18, wz = L / 2 - 0.95 - (kind === 'pickup' ? 0.1 : 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) detail.push(wheel(s.wr, 0.26, sx * wx, sz * wz));
  const tail: Part[] = [box(0.5, 0.12, 0.04, s.w / 2 - 0.34, s.clear + 0.55, hl + 0.01, '#ffffff'), box(0.5, 0.12, 0.04, -s.w / 2 + 0.34, s.clear + 0.55, hl + 0.01, '#ffffff')];
  const head: Part[] = [box(0.4, 0.12, 0.04, s.w / 2 - 0.3, s.clear + 0.55, -hl - 0.01, '#ffffff'), box(0.4, 0.12, 0.04, -s.w / 2 + 0.3, s.clear + 0.55, -hl - 0.01, '#ffffff')];
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

function box_truck() {
  const w = 2.5, L = 8.6, hl = L / 2;
  const paint: Part[] = [box(2.3, 1.7, 2.0, 0, 1.2, -hl + 1.0), box(w, 2.6, 6.3, 0, 2.15, hl - 3.15, '#ffffff')];
  const detail: Part[] = [box(2.32, 0.6, 0.06, 0, 1.55, -hl + 0.02, '#10151c'), box(2.4, 0.5, 8.4, 0, 0.55, 0, '#1d1d21'), box(w + 0.02, 0.2, 0.12, 0, 0.5, hl, '#222226')];
  for (const sx of [-1, 1]) { detail.push(wheel(0.5, 0.3, sx * 1.05, -hl + 1.35)); for (const z of [hl - 1.5, hl - 2.7]) detail.push(wheel(0.5, 0.3, sx * 1.05, z)); }
  return { paint: merge(paint), detail: merge(detail), tail: merge([box(0.3, 0.2, 0.04, 1.0, 0.8, hl + 0.02), box(0.3, 0.2, 0.04, -1.0, 0.8, hl + 0.02)]), head: merge([box(0.3, 0.2, 0.04, 0.8, 0.8, -hl - 0.02), box(0.3, 0.2, 0.04, -0.8, 0.8, -hl - 0.02)]) };
}
function semi() {
  const hl = 8.5, w = 2.6;
  const paint: Part[] = [box(2.5, 2.7, 2.6, 0, 1.7, -hl + 1.3), box(2.4, 1.0, 1.7, 0, 3.4, -hl + 1.6)];
  const detail: Part[] = [box(2.52, 0.8, 0.06, 0, 2.5, -hl + 0.02, '#10151c'), box(w, 3.6, 13.1, 0, 2.55, 1.9, '#e9eaed'), box(2.2, 0.35, 12.4, 0, 0.45, 2.2, '#1d1d21'), box(w, 0.5, 0.1, 0, 0.6, hl, '#222226')];
  for (const sx of [-1, 1]) { detail.push(wheel(0.5, 0.3, sx * 1.1, -hl + 1.6)); for (const z of [hl - 1.2, hl - 2.5, -1.5, -2.8]) detail.push(wheel(0.5, 0.3, sx * 1.1, z + 0.0)); }
  return { paint: merge(paint), detail: merge(detail), tail: merge([box(0.3, 0.2, 0.04, 1.0, 0.9, hl + 0.02), box(0.3, 0.2, 0.04, -1.0, 0.9, hl + 0.02)]), head: merge([box(0.4, 0.2, 0.04, 0.9, 1.0, -hl - 0.02), box(0.4, 0.2, 0.04, -0.9, 1.0, -hl - 0.02)]) };
}
function bus() {
  const hl = 6, w = 2.55;
  const paint: Part[] = [box(w, 2.4, 12, 0, 1.75, 0), box(w - 0.1, 0.1, 11.8, 0, 3.0, 0)];
  const detail: Part[] = [box(w + 0.02, 0.9, 11.4, 0, 2.2, 0, '#10151c'), box(w + 0.02, 0.3, 0.06, 0, 2.2, -hl, '#10151c'), box(2.0, 0.35, 11.5, 0, 0.55, 0, '#1d1d21'), box(1.0, 0.4, 2.6, 0, 3.25, 1.5, '#cfd2d6')];
  for (const sx of [-1, 1]) for (const z of [-3.9, 3.6]) detail.push(wheel(0.5, 0.3, sx * 1.05, z));
  return { paint: merge(paint), detail: merge(detail), tail: merge([box(0.3, 0.2, 0.04, 1.0, 0.9, hl + 0.02), box(0.3, 0.2, 0.04, -1.0, 0.9, hl + 0.02)]), head: merge([box(0.4, 0.2, 0.04, 0.9, 0.9, -hl - 0.02), box(0.4, 0.2, 0.04, -0.9, 0.9, -hl - 0.02)]) };
}
function tow() {
  const hl = 3.8, w = 2.4;
  const paint: Part[] = [box(2.3, 1.5, 2.2, 0, 1.2, -hl + 1.1), box(w, 0.4, 4.8, 0, 0.95, 1.2)];
  const detail: Part[] = [box(2.32, 0.5, 0.06, 0, 1.55, -hl + 0.02, '#10151c'), box(0.25, 1.5, 0.25, 0, 1.9, 2.2, '#2a2a2e'), box(0.2, 0.2, 2.6, 0, 2.5, 1.2, '#2a2a2e', 0)];
  for (const sx of [-1, 1]) for (const z of [-hl + 1.3, hl - 1.1, hl - 2.3]) detail.push(wheel(0.46, 0.3, sx * 1.0, z));
  return { paint: merge(paint), detail: merge(detail), tail: merge([box(0.3, 0.2, 0.04, 0.9, 0.8, hl + 0.02)]), head: merge([box(0.3, 0.2, 0.04, 0.8, 0.8, -hl - 0.02), box(0.3, 0.2, 0.04, -0.8, 0.8, -hl - 0.02)]) };
}
function ambulance() { const g = carLike('van'); return g; }

const cache = new Map<VehKind, ReturnType<typeof carLike>>();
export function vehicleGeo(kind: VehKind) {
  let g = cache.get(kind);
  if (!g) {
    g = kind === 'box' ? box_truck() : kind === 'semi' ? semi() : kind === 'bus' ? bus() : kind === 'tow' ? tow() : kind === 'ambulance' ? ambulance() : carLike(kind);
    cache.set(kind, g);
  }
  return g;
}
export const ALL_KINDS: VehKind[] = ['sedan', 'suv', 'pickup', 'van', 'hatch', 'box', 'semi', 'bus', 'police', 'wreck', 'tow', 'taxi'];
export const MAX_PER_KIND: Record<VehKind, number> = { sedan: 36, suv: 32, pickup: 20, van: 16, hatch: 20, box: 14, semi: 16, bus: 8, police: 6, wreck: 4, tow: 4, taxi: 12, ambulance: 2 };
void DIM;
