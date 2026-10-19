/**
 * Interstate overpasses, built like the ones on I-20, I-75 and I-285: precast girders under a thin deck, a concrete parapet with a pedestrian fence,
 * round-column bents with a cap beam, sloped concrete abutments that climb to the seat, an approach embankment, cobra-head lamps and lit undersides.
 * Everything is instanced (a handful of draw calls for every bridge in view) and the fence, lamps and underside lights are skipped on low-end phones.
 * `bridgeField` tells the camera where the decks are so it can duck under them instead of passing through.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { hash } from '../g3d/util';
import { groundTexture } from '../g3d/textures';
import { AHEAD, Repeat, useAtl, type Slot } from './World';

const SPACING = 470;
/** distance (m, along the road) of the bridge in a cell, or null if the cell has none */
export const bridgeOffset = (c: number) => c * SPACING + 100 + hash(c, 32) * 200;
export const DECK_HALF = 7.7;          // half the depth of the deck along the road
export const GIRDER_BOTTOM = 5.5;       // underside of the girders above the road
export const DECK_TOP = 7.1;

/** set by the scenery so the camera knows where the bridges are on the current stage */
export const bridgeField: { has: (c: number) => boolean } = { has: () => false };

/**
 * 0 when the camera is in the open, 1 when a deck is over the car or the camera. It rises over the 30 m before the deck and falls once the
 * camera is clear of it, so the chase view dips under a bridge smoothly rather than snapping.
 */
export function bridgeDuck(traveled: number, back: number): number {
  let w = 0;
  const c0 = Math.floor((traveled - back - 60) / SPACING);
  for (let c = c0; c <= c0 + 2; c++) {
    if (!bridgeField.has(c)) continue;
    const d = bridgeOffset(c);
    const frontToDeck = (d - DECK_HALF) - (traveled + 3);          // gap between the car's nose and the near edge of the deck
    const camPast = (traveled - back) - (d + DECK_HALF);             // how far the camera is beyond the far edge
    const inB = frontToDeck < 30 ? Math.min(1, (30 - frontToDeck) / 30) : 0;
    const outB = camPast > 0 ? Math.max(0, 1 - camPast / 18) : 1;
    w = Math.max(w, Math.min(inB, outB));
  }
  return w * w * (3 - 2 * w);
}

function concreteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b9b7b0'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1100; i++) {
    const v = 140 + Math.floor(hash(i, 1) * 80);
    g.fillStyle = `rgba(${v},${v - 2},${v - 7},${0.07 + hash(i, 2) * 0.2})`;
    g.fillRect(hash(i, 3) * 128, hash(i, 4) * 128, 1 + hash(i, 5) * 5, 1 + hash(i, 6) * 5);
  }
  for (let i = 0; i < 16; i++) {                                    // rain streaks running down the faces
    const x = hash(i, 7) * 128, gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(52,48,42,0.16)'); gr.addColorStop(1, 'rgba(52,48,42,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 1.5 + hash(i, 8) * 5, 128);
  }
  g.strokeStyle = 'rgba(70,66,60,0.35)'; g.lineWidth = 1;           // form-board seams
  for (const y of [32, 96]) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function fenceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(150,156,162,0.95)'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(0, 64); g.lineTo(64, 0); g.moveTo(-32, 32); g.lineTo(32, 96); g.moveTo(32, -32); g.lineTo(96, 32); g.moveTo(32, 96); g.lineTo(96, 32); g.moveTo(-32, 32); g.lineTo(32, -32); g.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** a box with real dimensions whose texture repeats every `tile` metres, so a 60 m girder is not one smeared 128 px image; sits on y = 0 */
function texBox(w: number, h: number, d: number, tile = 3.2) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  const uv = g.attributes.uv!, nrm = g.attributes.normal!;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    const [su, sv] = ax > 0.5 ? [d, h] : ay > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  return g;
}
/** a trapezoid prism: profile points are (u outward, y up), extruded along the road to `depth` metres */
function prism(pts: [number, number][], depth: number, flip: boolean) {
  const p = flip ? pts.map(([u, y]) => [-u, y] as [number, number]).reverse() : pts;
  const s = new THREE.Shape(p.map(([u, y]) => new THREE.Vector2(u, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export function Overpasses({ left, right, medianX, nearRamp }: { left: number; right: number; medianX: number; nearRamp: (d: number) => boolean }) {
  const { quality } = useAtl();
  const lite = quality.lite;
  const has = useMemo(() => (c: number) => !(hash(c, 31) < 0.15 || nearRamp(bridgeOffset(c))), [nearRamp]);
  useEffect(() => {
    bridgeField.has = has;
    if (import.meta.env.DEV) (window as unknown as { __bridgeD?: (c: number) => number | null }).__bridgeD = (c) => (has(c) ? bridgeOffset(c) : null);
    return () => { bridgeField.has = () => false; };
  }, [has]);

  const SL = 4.5, RUN = 8.2, FILL = 26;                              // slope starts this far outside the edge; climbs over RUN; the fill carries the road on
  const cx = (left + right) / 2, W = right - left + 2 * (SL + RUN);
  const M = useMemo(() => {
    const tex = concreteTexture();
    const fence = fenceTexture();
    const grass = groundTexture('#6d7d4c').clone(); grass.needsUpdate = true; grass.repeat.set(0.16, 0.16);
    return {
      slab: new THREE.MeshStandardMaterial({ map: tex, color: '#8d8b86', roughness: 0.96 }),
      girder: new THREE.MeshStandardMaterial({ map: tex, color: '#6c6a66', roughness: 0.97 }),
      parapet: new THREE.MeshStandardMaterial({ map: tex, color: '#b3b1aa', roughness: 0.92 }),
      slope: new THREE.MeshStandardMaterial({ map: tex, color: '#c0beb6', roughness: 0.95 }),
      pier: new THREE.MeshStandardMaterial({ map: tex, color: '#a09e98', roughness: 0.95 }),
      asphalt: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.93 }),
      walk: new THREE.MeshStandardMaterial({ map: tex, color: '#c9c7c0', roughness: 0.95 }),
      fill: new THREE.MeshStandardMaterial({ map: grass, color: '#8a9a62', roughness: 1 }),
      line: new THREE.MeshStandardMaterial({ color: '#d9b53c', roughness: 0.7 }),
      metal: new THREE.MeshStandardMaterial({ color: '#8d9298', roughness: 0.45, metalness: 0.7 }),
      fixture: new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: new THREE.Color('#ffd98a'), emissiveIntensity: 0.4, roughness: 0.4 }),
      fence: new THREE.MeshStandardMaterial({ map: fence, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }),
    };
  }, []);
  const G = useMemo(() => {
    const box = (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })();
    const col = (() => { const g = new THREE.CylinderGeometry(0.62, 0.78, 1, 14); g.translate(0, 0.5, 0); return g; })();
    const mast = (() => { const g = new THREE.CylinderGeometry(0.07, 0.12, 8.4, 8); g.translate(0, 4.2, 0); return g; })();
    const arm = (() => { const g = new THREE.BoxGeometry(2.6, 0.12, 0.12); g.translate(1.3, 8.35, 0); return g; })();
    const head = (() => { const g = new THREE.BoxGeometry(0.95, 0.14, 0.4); g.translate(2.5, 8.25, 0); return g; })();
    const fenceSeg = (() => { const g = new THREE.PlaneGeometry(10, 2.4); const uv = g.attributes.uv!; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 20, uv.getY(i) * 4.8); return g; })();
    const sl: [number, number][] = [[0, 0], [RUN, 0], [RUN, GIRDER_BOTTOM - 0.1]];
    const fl: [number, number][] = [[RUN, 0], [FILL + 12, 0], [FILL, DECK_TOP], [RUN, DECK_TOP]];
    const slopeR = prism(sl, 15.4, false), slopeL = prism(sl, 15.4, true);
    const fillR = prism(fl, 17.5, false), fillL = prism(fl, 17.5, true);
    const wide = W + 2 * (FILL - RUN);
    const girder = texBox(W, 1.05, 0.62), slab = texBox(W, 0.55, 15.4), diaph = texBox(0.7, 1.55, 15.2), parapet = texBox(wide, 0.95, 0.42), walk = texBox(wide, 0.2, 1.9), cap = texBox(1.9, 1.15, 13.4), crash = texBox(1.2, 1.0, 12.4);
    return { box, girder, slab, diaph, parapet, walk, cap, crash, col, mast, arm, head, fenceSeg, slopeR, slopeL, fillR, fillL };
  }, [W]);

  const slot = (c: number, s: Omit<Slot, 'z'> & { dz?: number }): Slot | null => (has(c) ? { ...s, z: 100 + hash(c, 32) * 200 + (s.dz ?? 0) } : null);
  const nF = Math.ceil((W + 2 * (FILL - RUN)) / 10);
  const girderZ = [-6, -4, -2, 0, 2, 4, 6];
  const piers = [left - 3, medianX, right + 3];
  const lampX = [-0.36, -0.12, 0.12, 0.36];

  return <>
    {/* girders and deck */}
    <Repeat geometry={G.girder} material={M.girder} spacing={SPACING} ahead={AHEAD} per={girderZ.length} make={(c, k) => slot(c, { x: cx, y: GIRDER_BOTTOM, ry: 0, sx: 1, sy: 1, sz: 1, dz: girderZ[k] })} />
    <Repeat geometry={G.slab} material={M.slab} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: cx, y: GIRDER_BOTTOM + 1.05, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    {/* end diaphragms: the deep beams across the girder ends */}
    <Repeat geometry={G.diaph} material={M.girder} spacing={SPACING} ahead={AHEAD} per={2} make={(c, k) => slot(c, { x: cx + (k ? 1 : -1) * (W / 2 - 0.35), y: GIRDER_BOTTOM - 0.1, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    {/* roadway, sidewalks, curbs, parapets */}
    <Repeat geometry={G.box} material={M.asphalt} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: cx, y: DECK_TOP - 0.02, ry: 0, sx: W + 2 * (FILL - RUN), sy: 0.06, sz: 11.4 })} />
    <Repeat geometry={G.box} material={M.line} spacing={SPACING} ahead={AHEAD} per={2} make={(c, k) => slot(c, { x: cx, y: DECK_TOP + 0.03, ry: 0, sx: W + 2 * (FILL - RUN) - 4, sy: 0.02, sz: 0.1, dz: k ? 0.16 : -0.16 })} />
    <Repeat geometry={G.walk} material={M.walk} spacing={SPACING} ahead={AHEAD} per={2} make={(c, k) => slot(c, { x: cx, y: DECK_TOP - 0.02, ry: 0, sx: 1, sy: 1, sz: 1, dz: k ? 6.6 : -6.6 })} />
    <Repeat geometry={G.parapet} material={M.parapet} spacing={SPACING} ahead={AHEAD} per={2} make={(c, k) => slot(c, { x: cx, y: DECK_TOP + 0.1, ry: 0, sx: 1, sy: 1, sz: 1, dz: k ? 7.55 : -7.55 })} />
    <Repeat geometry={G.box} material={M.metal} spacing={SPACING} ahead={AHEAD} per={2} make={(c, k) => slot(c, { x: cx, y: DECK_TOP + 1.05, ry: 0, sx: W + 2 * (FILL - RUN), sy: 0.09, sz: 0.1, dz: k ? 7.55 : -7.55 })} />
    {/* abutments: sloped concrete from the shoulder up to the bridge seat, then the approach fill that carries the cross street */}
    <Repeat geometry={G.slopeR} material={M.slope} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: right + SL, y: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    <Repeat geometry={G.slopeL} material={M.slope} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: left - SL, y: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    <Repeat geometry={G.fillR} material={M.fill} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: right + SL, y: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    <Repeat geometry={G.fillL} material={M.fill} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: left - SL, y: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    {/* bents: round columns under a cap beam, in the median and just off each shoulder */}
    <Repeat geometry={G.col} material={M.pier} spacing={SPACING} ahead={AHEAD} per={9} make={(c, k) => slot(c, { x: piers[Math.floor(k / 3)]!, y: 0, ry: 0, sx: 1, sy: GIRDER_BOTTOM - 1.2, sz: 1, dz: [-4.4, 0, 4.4][k % 3] })} />
    <Repeat geometry={G.cap} material={M.pier} spacing={SPACING} ahead={AHEAD} per={3} make={(c, k) => slot(c, { x: piers[k]!, y: GIRDER_BOTTOM - 1.2, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    {/* crash walls guarding the median bent */}
    <Repeat geometry={G.crash} material={M.parapet} spacing={SPACING} ahead={AHEAD} per={1} make={(c) => slot(c, { x: medianX, y: 0, ry: 0, sx: 1, sy: 1, sz: 1 })} />
    {!lite && <>
      {/* pedestrian fence above the parapets */}
      <Repeat geometry={G.fenceSeg} material={M.fence} spacing={SPACING} ahead={AHEAD} per={nF * 2} make={(c, k) => slot(c, { x: cx - (nF * 10) / 2 + 5 + (k >> 1) * 10, y: DECK_TOP + 1.1, ry: 0, sx: 1, sy: 1, sz: 1, dz: k & 1 ? 7.6 : -7.6 })} />
      {/* cobra-head lamps on the deck */}
      <Repeat geometry={G.mast} material={M.metal} spacing={SPACING} ahead={AHEAD} per={lampX.length * 2} make={(c, k) => slot(c, { x: cx + lampX[k >> 1]! * W, y: DECK_TOP, ry: 0, sx: 1, sy: 1, sz: 1, dz: k & 1 ? 7.3 : -7.3 })} />
      <Repeat geometry={G.arm} material={M.metal} spacing={SPACING} ahead={AHEAD} per={lampX.length * 2} make={(c, k) => slot(c, { x: cx + lampX[k >> 1]! * W, y: DECK_TOP, ry: k & 1 ? Math.PI : 0, sx: 1, sy: 1, sz: 1, dz: k & 1 ? 7.3 : -7.3 })} />
      <Repeat geometry={G.head} material={M.fixture} spacing={SPACING} ahead={AHEAD} per={lampX.length * 2} make={(c, k) => slot(c, { x: cx + lampX[k >> 1]! * W, y: DECK_TOP, ry: k & 1 ? Math.PI : 0, sx: 1, sy: 1, sz: 1, dz: k & 1 ? 7.3 : -7.3 })} />
      {/* underside lights between the girders */}
      <Repeat geometry={G.box} material={M.fixture} spacing={SPACING} ahead={AHEAD} per={8} make={(c, k) => slot(c, { x: cx + ((k >> 1) - 1.5) * ((right - left) / 3.2), y: GIRDER_BOTTOM - 0.16, ry: 0, sx: 1.1, sy: 0.1, sz: 0.34, dz: k & 1 ? 3 : -3 })} />
    </>}
  </>;
}
