import { useMemo } from 'react';
import * as THREE from 'three';
import { DIRS, LEG, heading, rightOf, STOP_LINE, type Dir, type Layout } from './engine';
import { mulberry, type Style, type TimeOfDay } from './look';

/*
 * The street is one top-down painting (asphalt, painted lines, crosswalks, stop bars, sidewalks, lawn) laid on the ground,
 * plus raised slabs for the sidewalk blocks so the curbs are real and cast shadows. The painting and the slabs share one
 * coordinate system: world x,z in metres, texture coordinates u = (x+R)/2R, v = 1-(z+R)/2R.
 */
export const R = 42;                   // half the painted area, metres
const SLAB_R = 46;                     // the slabs run a little past it
const CURB = .15;
const R0 = 2.7;                        // curb radius at the corners
const SIDEWALK = 1.9;                  // band of concrete before the lawn

type Side = 'n' | 'e' | 's' | 'w';
type Corner = 'nw' | 'ne' | 'se' | 'sw';
type Region = { x0: number; x1: number; z0: number; z1: number; round: Corner[]; sides: Side[] };

export function regionsFor(legs: Dir[]): Region[] {
  const has = (d: Dir) => legs.includes(d), out: Region[] = [], E = SLAB_R;
  if (!has('N')) out.push({ x0: -E, x1: E, z0: -E, z1: -4, round: [], sides: ['s'] });
  if (!has('S')) out.push({ x0: -E, x1: E, z0: 4, z1: E, round: [], sides: ['n'] });
  if (!has('E')) out.push({ x0: 4, x1: E, z0: -E, z1: E, round: [], sides: ['w'] });
  if (!has('W')) out.push({ x0: -E, x1: -4, z0: -E, z1: E, round: [], sides: ['e'] });
  if (has('N') && has('E')) out.push({ x0: 4, x1: E, z0: -E, z1: -4, round: ['sw'], sides: ['w', 's'] });
  if (has('N') && has('W')) out.push({ x0: -E, x1: -4, z0: -E, z1: -4, round: ['se'], sides: ['e', 's'] });
  if (has('S') && has('E')) out.push({ x0: 4, x1: E, z0: 4, z1: E, round: ['nw'], sides: ['w', 'n'] });
  if (has('S') && has('W')) out.push({ x0: -E, x1: -4, z0: 4, z1: E, round: ['ne'], sides: ['e', 'n'] });
  return out;
}

/** The outline of a region, pushed `inset` metres in from the sides that border a road. */
export function outline(r: Region, inset: number): [number, number][] {
  const x0 = r.x0 + (r.sides.includes('w') ? inset : 0), x1 = r.x1 - (r.sides.includes('e') ? inset : 0);
  const z0 = r.z0 + (r.sides.includes('n') ? inset : 0), z1 = r.z1 - (r.sides.includes('s') ? inset : 0);
  const rad = Math.max(.05, R0 - inset), pts: [number, number][] = [], N = 14;
  const arc = (c: Corner) => {
    if (!r.round.includes(c)) { pts.push(c === 'nw' ? [x0, z0] : c === 'ne' ? [x1, z0] : c === 'se' ? [x1, z1] : [x0, z1]); return; }
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI / 2, s = Math.sin(a), co = Math.cos(a);
      if (c === 'nw') pts.push([x0 + rad - rad * co, z0 + rad - rad * s]);
      if (c === 'ne') pts.push([x1 - rad + rad * s, z0 + rad - rad * co]);
      if (c === 'se') pts.push([x1 - rad + rad * co, z1 - rad + rad * s]);
      if (c === 'sw') pts.push([x0 + rad - rad * s, z1 - rad + rad * co]);
    }
  };
  (['nw', 'ne', 'se', 'sw'] as Corner[]).forEach(arc);
  return pts;
}

const WALL: Record<Style, { band: string; joint: string; lawnA: string; lawnB: string }> = {
  suburb: { band: '#c9c6bd', joint: '#9d9a90', lawnA: '#6a9650', lawnB: '#5d8947' },
  town: { band: '#bcb8b0', joint: '#8d8981', lawnA: '#729c59', lawnB: '#678f50' },
  park: { band: '#cbc8be', joint: '#9f9c92', lawnA: '#659a4b', lawnB: '#588c40' },
};

export function groundTexture(layout: Layout, style: Style, time: TimeOfDay, seed: number, size: number) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, rnd = mulberry(seed * 13 + 5), K = size / (2 * R);
  const X = (x: number) => (x + R) * K, Z = (z: number) => (z + R) * K;
  const W = WALL[style];
  // asphalt: a dark base with grain, patches and wear
  g.fillStyle = '#34353b'; g.fillRect(0, 0, size, size);
  const id = g.getImageData(0, 0, size, size), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 20; d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.05; }
  g.putImageData(id, 0, 0);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '70,70,76' : '22,22,26'},${.05 + rnd() * .09})`; const w = (.6 + rnd() * 2.4) * K, h = (.6 + rnd() * 2.4) * K; g.fillRect(rnd() * size, rnd() * size, w, h); }
  // sidewalks and lawn
  const poly = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, z], i) => g[i ? 'lineTo' : 'moveTo'](X(x), Z(z))); g.closePath(); };
  for (const r of regionsFor(layout.legs)) {
    poly(outline(r, 0)); g.fillStyle = W.band; g.fill();
    g.save(); poly(outline(r, 0)); g.clip();
    // expansion joints across the band, one every 1.6 m, and the hair line along it
    g.strokeStyle = W.joint; g.lineWidth = Math.max(1, .035 * K); g.globalAlpha = .75;
    for (let t = -SLAB_R; t < SLAB_R; t += 1.6) { g.beginPath(); g.moveTo(X(t), Z(-SLAB_R)); g.lineTo(X(t), Z(SLAB_R)); g.stroke(); g.beginPath(); g.moveTo(X(-SLAB_R), Z(t)); g.lineTo(X(SLAB_R), Z(t)); g.stroke(); }
    g.globalAlpha = 1; g.restore();
    // the lawn
    g.save(); poly(outline(r, SIDEWALK)); g.clip();
    g.fillStyle = W.lawnA; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 40; i++) { g.fillStyle = i % 2 ? W.lawnB : W.lawnA; g.fillRect(0, Z(-R + i * 2.1), size, 1.05 * K); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > .5 ? 'rgba(160,200,100,.22)' : 'rgba(35,75,35,.22)'; g.fillRect(rnd() * size, rnd() * size, 1.4 * K / 10, (3 + rnd() * 6) * K / 22); }
    // flower beds and clover, in small clusters
    for (let i = 0; i < 90; i++) {
      const cx = (rnd() - .5) * 2 * 34, cz = (rnd() - .5) * 2 * 34, hue = ['#f2c14e', '#ff7aa8', '#ffffff', '#b78cff', '#ff8a3d'][Math.floor(rnd() * 5)]!;
      for (let k = 0; k < 14; k++) { g.fillStyle = hue; g.globalAlpha = .9; g.beginPath(); g.arc(X(cx + (rnd() - .5) * 1.1), Z(cz + (rnd() - .5) * 1.1), (.04 + rnd() * .05) * K, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    g.restore();
    // soft shade where the lawn meets the sidewalk, and a lighter, drier patch in the middle of big lawns
    g.save(); poly(outline(r, SIDEWALK)); g.clip(); g.lineJoin = 'round';
    for (let k = 0; k < 5; k++) { poly(outline(r, SIDEWALK)); g.strokeStyle = `rgba(20,45,20,${.1 - k * .018})`; g.lineWidth = (.9 - k * .16) * K * 2; g.stroke(); }
    g.restore();
    // the edge of the concrete is a little darker where the lawn meets it
    g.save(); poly(outline(r, SIDEWALK)); g.strokeStyle = 'rgba(40,60,30,.45)'; g.lineWidth = .1 * K; g.stroke(); g.restore();
    poly(outline(r, 0)); g.strokeStyle = 'rgba(70,66,60,.9)'; g.lineWidth = .08 * K; g.stroke();
  }
  // paint on the roads
  const YEL = '#f2c230', WHT = '#efeeea';
  const bar = (cx: number, cz: number, w: number, h: number, col: string, a = 1) => { g.globalAlpha = a; g.fillStyle = col; g.fillRect(X(cx - w / 2), Z(cz - h / 2), w * K, h * K); g.globalAlpha = 1; };
  const legs = layout.legs;
  for (const d of legs) {
    const L = LEG[d], horizontal = L[0] !== 0, sgn = horizontal ? L[0] : L[1];
    // put a paint mark at distance `a` along the leg (sgn) and offset `b` across it
    const at = (a: number, b: number): [number, number] => horizontal ? [sgn * a, b] : [b, sgn * a];
    const rect = (a0: number, a1: number, b0: number, b1: number, col: string, al = 1) => {
      const [x0, z0] = at((a0 + a1) / 2, (b0 + b1) / 2);
      bar(x0, z0, horizontal ? Math.abs(a1 - a0) : Math.abs(b1 - b0), horizontal ? Math.abs(b1 - b0) : Math.abs(a1 - a0), col, al);
    };
    // the double yellow centre line, from just past the crosswalk out to the edge
    rect(7.9, R, -.2, -.07, YEL); rect(7.9, R, .07, .2, YEL);
    // a ladder crosswalk 4.7 to 6.5 m from the middle: bars along the road, .5 wide with .5 gaps
    for (let b = -3.6; b <= 3.7; b += 1) { if (Math.abs(b) < .45) continue; rect(4.75, 6.45, b - .25, b + .25, WHT, .92); }
    // the stop bar and the painted word, only on the approach that has a stop sign (the right-hand lane of the leg)
    if (layout.stops.includes(d)) {
      const h = heading(d), r = rightOf(h);
      // the approaching lane is on the car's right: lateral sign from the leg's axes
      const lat = horizontal ? r[1] : r[0];
      const lane = (a0: number, a1: number, col: string, al = 1) => rect(a0, a1, lat > 0 ? .3 : -3.85, lat > 0 ? 3.85 : -.3, col, al);
      lane(STOP_LINE - .25, STOP_LINE + .25, WHT);
      // STOP in the lane, stretched along the road the way real pavement words are
      g.save(); const [px, pz] = at(14.5, lat * 2); g.translate(X(px), Z(pz));
      g.rotate(horizontal ? (sgn > 0 ? -Math.PI / 2 : Math.PI / 2) : (sgn > 0 ? 0 : Math.PI));
      g.scale(1, 3.1); g.fillStyle = WHT; g.globalAlpha = .88; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${1.15 * K}px Arial, Helvetica, sans-serif`;
      g.fillText('STOP', 0, 0); g.restore(); g.globalAlpha = 1;
    }
  }
  // the middle of the box: a manhole, oil stains, tyre wear along the paths
  g.globalAlpha = .35; for (let i = 0; i < 7; i++) { g.fillStyle = '#15151a'; g.beginPath(); g.ellipse(X((rnd() - .5) * 6), Z((rnd() - .5) * 6), (.3 + rnd() * .8) * K, (.2 + rnd() * .5) * K, rnd() * 3, 0, 7); g.fill(); } g.globalAlpha = 1;
  g.fillStyle = '#4b4c53'; g.beginPath(); g.arc(X(-1.1), Z(-1.5), .42 * K, 0, 7); g.fill(); g.strokeStyle = '#2a2a2f'; g.lineWidth = .05 * K; g.stroke();
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(X(-1.1 - .3), Z(-1.5 + i * .08)); g.lineTo(X(-1.1 + .3), Z(-1.5 + i * .08)); g.stroke(); }
  // a few cracks
  g.strokeStyle = 'rgba(15,15,18,.5)'; g.lineWidth = Math.max(1, .02 * K);
  for (let i = 0; i < 14; i++) { let x = (rnd() - .5) * 60, z = (rnd() - .5) * 60; g.beginPath(); g.moveTo(X(x), Z(z)); for (let k = 0; k < 5; k++) { x += (rnd() - .5) * 1.2; z += (rnd() - .5) * 1.2; g.lineTo(X(x), Z(z)); } g.stroke(); }
  // night wets the road a little: a darker, glossier tone is handled in the material
  void time;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

function slabGeometry(r: Region) {
  const pts = outline(r, 0), shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: CURB, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + R) / (2 * R), 1 - (p.getZ(i) + R) / (2 * R));
  return geo;
}

/** Ground, painted street and raised sidewalk blocks. */
export function Ground({ layout, style, time, seed, lite }: { layout: Layout; style: Style; time: TimeOfDay; seed: number; lite: boolean }) {
  const tex = useMemo(() => groundTexture(layout, style, time, seed, lite ? 2048 : 3072), [layout, style, time, seed, lite]);
  const regions = useMemo(() => regionsFor(layout.legs), [layout]);
  const geos = useMemo(() => regions.map(slabGeometry), [regions]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: .93, metalness: 0, envMapIntensity: .35 }), [tex]);
  const wet = time === 'night' ? .75 : .93;
  mat.roughness = wet;
  const big = useMemo(() => { const g = new THREE.PlaneGeometry(1400, 1400); const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + R) / (2 * R), 1 - (-p.getY(i) + R) / (2 * R)); return g; }, []);
  return <group>
    <mesh rotation-x={-Math.PI / 2} geometry={big} material={mat} receiveShadow />
    {geos.map((g, i) => <mesh key={i} geometry={g} material={mat} receiveShadow castShadow />)}
  </group>;
}

export const SIDE_BAND = SIDEWALK;
export { DIRS };
