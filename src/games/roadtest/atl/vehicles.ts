/**
 * Every vehicle of the Atlanta traffic is built here from extruded side profiles, boxes and cylinders, merged into four pieces per kind:
 *   paint   the coloured body (tinted per car by the instance colour)
 *   detail  glass, wheels, bumpers, mirrors, trim: fixed colours
 *   tail    the tail lamps (their glow follows the brake)
 *   head    the head lamps
 * The front of every vehicle points to -z, the way the road runs away from the camera.
 *
 * Bodies are real shapes: a side profile (hood, cowl, rake of the windscreen, roof, rear glass, deck) is extruded across the width with a soft
 * bevel, so the car has a nose, a bonnet that slopes up, tumblehome, wheel arches and a proper greenhouse, not a stack of boxes.
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
const fin = (g: THREE.BufferGeometry, hex: string): Part => ({ g: col(g.index ? g.toNonIndexed() : g, hex) });
const box = (w: number, h: number, l: number, x: number, y: number, z: number, hex = '#ffffff', rx = 0): Part => {
  const g = new THREE.BoxGeometry(w, h, l); if (rx) g.rotateX(rx); g.translate(x, y, z); return fin(g, hex);
};
/** a box whose long axis runs from (z0,y0) to (z1,y1) in the side view: pillars, windscreen frames, ramps */
const strut = (z0: number, y0: number, z1: number, y1: number, x: number, w: number, th: number, hex = '#ffffff'): Part => {
  const dz = z1 - z0, dy = y1 - y0, len = Math.hypot(dz, dy), a = Math.atan2(dy, dz);
  const g = new THREE.BoxGeometry(w, th, len); g.rotateX(-a); g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2); return fin(g, hex);
};
/** a side profile (z, y points, front to back) extruded across `width` with a soft bevel */
const prism = (pts: [number, number][], width: number, hex: string, bevel = 0.05, x = 0): Part => {
  const sh = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y))); sh.closePath();
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2); g.rotateY(-Math.PI / 2); g.translate(x, 0, 0);
  return fin(g, hex);
};
const cyl = (r: number, w: number, x: number, y: number, z: number, hex: string, seg = 14): Part => {
  const g = new THREE.CylinderGeometry(r, r, w, seg); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return fin(g, hex);
};
const vcyl = (r: number, h: number, x: number, y: number, z: number, hex: string, seg = 10): Part => {
  const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y, z); return fin(g, hex);
};
const merge = (ps: Part[]) => mergeGeometries(ps.map((p) => p.g), false)!;

const GLASS = '#0c141c', TYRE = '#111113', RIM = '#aeb4bb', HUB = '#3a3d42', DARK = '#17181b', CHROME = '#cfd3d8', PLATE = '#eceee9';

/** one wheel: a tyre, a rim, a hub, and a dark arch ring on the body behind it so the wheel sits in a well */
function wheelAt(r: number, tw: number, x: number, z: number, sx: number, out: { detail: Part[] }, arch = true, bodyHalf = 0, dual = false) {
  // with a body width given, the tyre sits flush with the body side (outer face a touch proud), so the wheel is seen and not buried in the shell
  const cx = bodyHalf ? sx * (bodyHalf + 0.03 - tw / 2) : x;
  out.detail.push(cyl(r, tw, cx, r, z, TYRE, 18), cyl(r * 0.64, tw + 0.025, cx, r, z, RIM, 14), cyl(r * 0.22, tw + 0.045, cx, r, z, HUB, 8));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; out.detail.push(cyl(r * 0.05, tw + 0.05, cx, r + Math.cos(a) * r * 0.42, z + Math.sin(a) * r * 0.42, '#2b2e33', 5)); }
  if (dual) out.detail.push(cyl(r, tw, cx - sx * (tw + 0.04), r, z, TYRE, 18));
  if (arch && bodyHalf) out.detail.push(cyl(r + 0.075, 0.012, sx * (bodyHalf + 0.006), r + 0.015, z, '#060608', 18));
}

interface CarCfg {
  kind: VehKind; w: number; l: number; clear: number; bodyH: number; cabH: number; wr: number;
  /** z of the windscreen base, run of the windscreen, z of the rear glass base, run of the rear glass */
  zf: number; rakeF: number; zr: number; rakeR: number;
  hood: number; trunk?: 'sedan' | 'hatch' | 'suv' | 'van' | 'bed'; wbOff?: number; cabW?: number; tyreW?: number;
}
const CFG: Partial<Record<VehKind, CarCfg>> = {
  sedan: { kind: 'sedan', w: 1.85, l: 4.7, clear: 0.24, bodyH: 0.66, cabH: 0.52, wr: 0.33, zf: -1.0, rakeF: 0.85, zr: 1.5, rakeR: 0.7, hood: 0.1, trunk: 'sedan' },
  taxi: { kind: 'taxi', w: 1.85, l: 4.7, clear: 0.24, bodyH: 0.66, cabH: 0.54, wr: 0.33, zf: -1.0, rakeF: 0.85, zr: 1.5, rakeR: 0.7, hood: 0.1, trunk: 'sedan' },
  wreck: { kind: 'wreck', w: 1.85, l: 4.6, clear: 0.24, bodyH: 0.64, cabH: 0.5, wr: 0.33, zf: -0.95, rakeF: 0.85, zr: 1.45, rakeR: 0.7, hood: 0.1, trunk: 'sedan' },
  police: { kind: 'police', w: 1.95, l: 4.95, clear: 0.26, bodyH: 0.66, cabH: 0.52, wr: 0.35, zf: -1.08, rakeF: 0.88, zr: 1.6, rakeR: 0.7, hood: 0.1, trunk: 'sedan' },
  hatch: { kind: 'hatch', w: 1.8, l: 4.1, clear: 0.24, bodyH: 0.64, cabH: 0.62, wr: 0.31, zf: -0.85, rakeF: 0.85, zr: 1.9, rakeR: 0.62, hood: 0.12, trunk: 'hatch' },
  suv: { kind: 'suv', w: 1.97, l: 4.9, clear: 0.32, bodyH: 0.78, cabH: 0.62, wr: 0.38, zf: -0.95, rakeF: 0.8, zr: 2.3, rakeR: 0.22, hood: 0.06, trunk: 'suv' },
  pickup: { kind: 'pickup', w: 2.0, l: 5.5, clear: 0.36, bodyH: 0.74, cabH: 0.66, wr: 0.4, zf: -1.3, rakeF: 0.72, zr: 0.55, rakeR: 0.1, hood: 0.06, trunk: 'bed', wbOff: 0.12 },
  van: { kind: 'van', w: 2.0, l: 5.4, clear: 0.28, bodyH: 0.86, cabH: 0.9, wr: 0.35, zf: -1.15, rakeF: 1.1, zr: 2.6, rakeR: 0.28, hood: 0.2, trunk: 'van' },
};

function carLike(kind: VehKind) {
  const c = CFG[kind]!, hl = c.l / 2, w = c.w, cl = c.clear, top = cl + c.bodyH, cabW = c.cabW ?? w - 0.2;
  const paint: Part[] = [], detail: Part[] = [], tail: Part[] = [], head: Part[] = [];
  const roofY = top + c.cabH, zRoofF = c.zf + c.rakeF, zRoofR = c.zr - c.rakeR;

  // ---- lower body: nose, bonnet, deck, tail, in one profile
  const deckY = c.trunk === 'sedan' ? top + 0.04 : top;
  const body: [number, number][] = [
    [-hl + 0.06, cl + 0.12], [-hl, cl + 0.22], [-hl, top - c.hood - 0.13], [-hl + 0.12, top - c.hood - 0.04], [-hl + 0.8, top - c.hood * 0.55], [c.zf - 0.35, top - c.hood * 0.2], [c.zf, top],
  ];
  if (c.trunk === 'bed') {
    const floor = top - 0.2;
    body.push([c.zr + 0.04, top], [c.zr + 0.04, floor], [hl - 0.04, floor], [hl, floor - 0.06], [hl, cl + 0.16]);
  } else if (c.trunk === 'sedan') {
    body.push([c.zr, top], [c.zr + 0.55, deckY], [hl - 0.12, deckY - 0.01], [hl, deckY - 0.12], [hl, cl + c.bodyH * 0.55], [hl, cl + 0.14]);
  } else {
    body.push([hl - 0.12, top], [hl, top - 0.12], [hl, cl + c.bodyH * 0.5], [hl, cl + 0.14]);
  }
  body.push([hl - 0.12, cl + 0.05], [-hl + 0.12, cl + 0.05]);
  paint.push(prism(body, w, '#ffffff', 0.07));
  // dark underbody and side sills so the car does not float
  detail.push(box(w - 0.3, 0.26, c.l - 0.6, 0, cl + 0.08, 0, '#0a0a0c'), box(w + 0.01, 0.09, c.l - 1.5, 0, cl + 0.12, 0, '#1a1b1e'));

  // ---- greenhouse: glass, a painted roof and painted pillars
  const gl: [number, number][] = [[c.zf + 0.04, top - 0.03], [zRoofF, roofY - 0.02], [zRoofR, roofY - 0.02], [c.zr, top - 0.03]];
  detail.push(prism(gl, cabW, GLASS, 0.035));
  const roof: [number, number][] = [[zRoofF - 0.03, roofY - 0.04], [zRoofF + 0.08, roofY + 0.035], [zRoofR - 0.08, roofY + 0.035], [zRoofR + 0.03, roofY - 0.04]];
  paint.push(prism(roof, cabW - 0.03, '#ffffff', 0.025));
  const side = cabW / 2 + 0.005;
  const bz = (zRoofF + zRoofR) / 2 + (c.trunk === 'bed' ? -0.05 : 0.1);
  for (const sx of [-1, 1]) {
    paint.push(strut(c.zf + 0.03, top - 0.02, zRoofF, roofY, sx * side, 0.06, 0.075));          // A pillar
    paint.push(strut(c.zr - 0.01, top - 0.02, zRoofR, roofY, sx * side, 0.06, c.trunk === 'suv' || c.trunk === 'van' || c.trunk === 'hatch' ? 0.16 : 0.12)); // C pillar
    if (c.trunk !== 'bed') paint.push(strut(bz - 0.04, top - 0.02, bz - 0.02, roofY - 0.01, sx * side, 0.06, 0.07)); // B pillar
    paint.push(box(0.05, 0.045, zRoofR - zRoofF, sx * side, roofY - 0.02, (zRoofF + zRoofR) / 2));   // roof rail
    detail.push(box(0.04, 0.025, zRoofR - zRoofF - 0.15, sx * (side + 0.012), top + 0.04, (zRoofF + zRoofR) / 2 + 0.02, CHROME)); // window sill chrome
    // door shut lines, handles, mirrors
    for (const dz of [c.zf + 0.1, bz, c.zr - 0.2]) detail.push(box(0.012, c.bodyH - 0.22, 0.014, sx * (w / 2 + 0.004), cl + 0.18 + (c.bodyH - 0.22) / 2, dz, '#0d0d10'));
    for (const dz of [bz - 0.55, bz + 0.5]) detail.push(box(0.025, 0.035, 0.2, sx * (w / 2 + 0.01), top - 0.08, dz, '#2a2c30'));
    detail.push(box(0.04, 0.05, 0.16, sx * (cabW / 2 + 0.08), top + 0.12, c.zf + 0.28, DARK), box(0.1, 0.13, 0.2, sx * (cabW / 2 + 0.15), top + 0.17, c.zf + 0.3, DARK));
  }
  if (c.trunk === 'suv' || c.trunk === 'van' || c.trunk === 'hatch') {
    for (const sx of [-1, 1]) paint.push(box(0.045, 0.045, zRoofR - zRoofF - 0.3, sx * (cabW / 2 - 0.06), roofY + 0.05, (zRoofF + zRoofR) / 2)); // roof rails
    paint.push(box(cabW - 0.1, 0.04, 0.34, 0, roofY + 0.03, zRoofR + 0.1)); // roof spoiler lip
  }
  if (c.trunk === 'suv') for (const sx of [-1, 1]) detail.push(box(0.025, 0.2, c.l - 1.8, sx * (w / 2 + 0.008), cl + 0.2, 0, '#1b1c1f')); // black cladding
  if (c.trunk === 'sedan') paint.push(box(w - 0.5, 0.025, 0.14, 0, deckY + 0.03, hl - 0.4)); // small decklid lip
  if (c.trunk === 'hatch') paint.push(box(w - 0.4, 0.035, 0.18, 0, top + 0.02, hl - 0.06)); // tailgate spoiler

  // ---- pickup bed and tailgate
  if (c.trunk === 'bed') {
    const floor = top - 0.2, wallTop = top + 0.16, bl = hl - c.zr - 0.05, bzC = c.zr + 0.04 + bl / 2;
    detail.push(box(w - 0.3, 0.04, bl, 0, floor + 0.03, bzC, '#202226'));
    for (const sx of [-1, 1]) paint.push(box(0.1, wallTop - floor, bl, sx * (w / 2 - 0.05), (floor + wallTop) / 2, bzC), box(0.06, 0.05, bl, sx * (w / 2 - 0.05), wallTop + 0.02, bzC));
    paint.push(box(w - 0.04, wallTop - floor, 0.08, 0, (floor + wallTop) / 2, c.zr + 0.07), box(w - 0.04, wallTop - floor - 0.02, 0.07, 0, (floor + wallTop) / 2 - 0.01, hl - 0.04));
    detail.push(box(0.5, 0.05, 0.015, 0, floor + 0.28, hl + 0.01, '#2b2d31'), box(w * 0.6, 0.06, 0.34, 0, cl + 0.2, hl + 0.14, '#2a2c30'));  // handle, hitch bar
    detail.push(box(0.12, 0.05, 0.12, 0.3, cl + 0.24, hl + 0.28, '#35383d'));
  }
  // ---- minivan sliding-door tracks and big glass
  if (c.trunk === 'van') for (const sx of [-1, 1]) detail.push(box(0.02, 0.05, 1.6, sx * (w / 2 + 0.01), cl + 0.55, 0.4, '#25272b'));

  // ---- front end
  detail.push(box(w * 0.56, 0.15, 0.06, 0, cl + c.bodyH * 0.5, -hl - 0.012, '#08080a'), box(w * 0.66, 0.09, 0.07, 0, cl + 0.2, -hl - 0.008, '#0c0c0e'));
  detail.push(box(w * 0.5, 0.02, 0.07, 0, cl + c.bodyH * 0.5 + 0.1, -hl - 0.012, CHROME));
  detail.push(box(0.4, 0.06, 0.02, 0, cl + 0.12, -hl - 0.02, '#202226'));
  for (const sx of [-1, 1]) {
    detail.push(box(0.5, 0.13, 0.05, sx * (w / 2 - 0.34), cl + c.bodyH * 0.62, -hl + 0.04, '#e4ebf0'));                // headlamp lens
    head.push(box(0.4, 0.09, 0.03, sx * (w / 2 - 0.36), cl + c.bodyH * 0.62, -hl - 0.012, '#ffffff'));
    detail.push(box(0.12, 0.06, 0.05, sx * (w / 2 - 0.1), cl + 0.22, -hl + 0.02, '#c8892a'));                           // side marker / fog
    // rear lamps and plate
    detail.push(box(0.55, 0.15, 0.05, sx * (w / 2 - 0.34), cl + c.bodyH * 0.64, hl - 0.01, '#4a0a0d'));
    tail.push(box(0.46, 0.1, 0.03, sx * (w / 2 - 0.34), cl + c.bodyH * 0.64, hl + 0.02, '#ffffff'));
    detail.push(cyl(0.04, 0.16, sx * 0.42, cl + 0.1, hl + 0.02, '#8d9298', 8));                                       // exhaust tip
  }
  detail.push(box(0.5, 0.16, 0.014, 0, cl + c.bodyH * 0.5, hl + 0.006, PLATE), box(w * 0.74, 0.08, 0.06, 0, cl + 0.2, hl + 0.01, '#101113'));
  tail.push(box(0.5, 0.04, 0.02, 0, cl + c.bodyH * 0.72, hl + 0.02, '#ffffff')); // third brake light strip

  // ---- wheels
  const wx = w / 2 - 0.2, wz = hl - 0.92 - (c.wbOff ?? 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheelAt(c.wr, c.tyreW ?? 0.26, sx * wx, sz * wz, sx, { detail }, true, w / 2);

  // ---- per-kind extras
  if (kind === 'taxi') {
    detail.push(box(0.55, 0.15, 0.22, 0, roofY + 0.12, (zRoofF + zRoofR) / 2, '#f4f0dc'), box(0.57, 0.04, 0.24, 0, roofY + 0.045, (zRoofF + zRoofR) / 2, '#222'));
    detail.push(box(c.l * 0.4, 0.07, 0.014, 0, cl + c.bodyH * 0.55, 0, '#111'));  // checker band
  }
  if (kind === 'wreck') {
    // a dented, dull car: crumpled bonnet line, a cracked screen and a flat tyre
    detail.push(box(w - 0.3, 0.05, 0.9, 0, top - c.hood + 0.05, -hl + 0.9, '#5a5d61', 0.12), box(0.5, 0.012, 0.4, 0.3, top + 0.12, c.zf + 0.2, '#454a52'));
  }
  if (kind === 'police') policeKit(c, { paint, detail }, w, hl, cl, top, roofY, zRoofF, zRoofR);
  void zRoofF;
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

/** Georgia cruiser livery: dark doors, gold stripe, roof light bar, push bumper, spotlights, steel wheels */
function policeKit(c: CarCfg, o: { paint: Part[]; detail: Part[] }, w: number, hl: number, cl: number, top: number, roofY: number, zRoofF: number, zRoofR: number) {
  const dark = '#0b1020', gold = '#f2c14e', mid = (zRoofF + zRoofR) / 2;
  o.detail.push(box(w + 0.016, 0.36, 2.9, 0, cl + 0.26, 0.15, dark), box(w + 0.02, 0.04, 2.9, 0, cl + 0.47, 0.15, gold));
  o.detail.push(box(w - 0.2, 0.014, 1.2, 0, top + 0.01, -hl + 0.85, dark), box(w - 0.24, 0.014, 0.8, 0, top + 0.05, hl - 0.55, dark));
  for (const sx of [-1, 1]) {
    o.detail.push(box(0.03, 0.26, 0.26, sx * (w / 2 + 0.012), cl + 0.36, -0.55, gold), box(0.035, 0.15, 0.15, sx * (w / 2 + 0.014), cl + 0.36, -0.55, dark));
    o.detail.push(box(0.06, 0.06, 0.18, sx * (c.w / 2 - 0.1 + 0.02), top + 0.4, c.zf + 0.55, '#2a2a2e'));      // A pillar spotlight
    o.detail.push(box(0.05, 0.34, 0.05, sx * (w * 0.28), cl + 0.32, -hl - 0.12, '#111114'));
  }
  o.detail.push(box(w * 0.62, 0.07, 0.07, 0, cl + 0.46, -hl - 0.13, '#111114'), box(w * 0.62, 0.07, 0.07, 0, cl + 0.2, -hl - 0.13, '#111114'));   // push bumper
  o.detail.push(box(1.2, 0.07, 0.38, 0, roofY + 0.08, mid - 0.1, '#15171c'), box(0.46, 0.11, 0.34, -0.34, roofY + 0.15, mid - 0.1, '#d3231a'), box(0.46, 0.11, 0.34, 0.34, roofY + 0.15, mid - 0.1, '#1e56e0'), box(0.2, 0.09, 0.32, 0, roofY + 0.14, mid - 0.1, '#f4f6f8'));
  o.detail.push(box(0.02, 0.5, 0.02, 0.55, roofY + 0.32, hl - 1.1, '#111114'));
  for (const sx of [-1, 1]) o.detail.push(cyl(c.wr * 0.62, 0.285, sx * (w / 2 - 0.11), c.wr, hl - 0.92, '#c8ccd2', 12), cyl(c.wr * 0.62, 0.285, sx * (w / 2 - 0.11), c.wr, -hl + 0.92, '#c8ccd2', 12));
}

// ------------------------------------------------------------------------------------------------ trucks ---
function box_truck() {
  const w = 2.5, hl = 4.3, paint: Part[] = [], detail: Part[] = [], tail: Part[] = [], head: Part[] = [];
  // cab: a short, rounded, cab-forward shape with a raked windscreen
  paint.push(prism([[-hl, 0.62], [-hl, 1.7], [-hl + 0.16, 2.0], [-hl + 0.7, 3.0], [-2.25, 3.05], [-2.1, 2.9], [-2.1, 0.62]], 2.32, '#ffffff', 0.09));
  detail.push(prism([[-hl + 0.1, 1.98], [-hl + 0.64, 2.9], [-3.55, 2.92], [-3.5, 1.98]], 2.28, GLASS, 0.03));
  for (const sx of [-1, 1]) {
    detail.push(box(0.03, 0.88, 0.95, sx * 1.165, 2.42, -3.15, GLASS), box(0.015, 1.1, 0.014, sx * 1.166, 1.5, -2.75, '#0d0d10'), box(0.03, 0.05, 0.2, sx * 1.17, 1.65, -3.0, '#2a2c30'));
    detail.push(box(0.06, 0.85, 0.06, sx * 1.4, 2.0, -hl + 0.55, DARK), box(0.22, 0.42, 0.1, sx * 1.52, 2.35, -hl + 0.55, DARK)); // mirror arm and head
  }
  detail.push(box(1.7, 0.45, 0.06, 0, 1.0, -hl - 0.01, '#0a0a0c'), box(1.5, 0.08, 0.06, 0, 1.42, -hl - 0.01, CHROME), box(2.45, 0.32, 0.22, 0, 0.55, -hl - 0.03, '#26272b'), box(1.1, 0.08, 0.02, 0, 1.55, -hl - 0.02, '#e9ecef'));
  // box body: a big rounded cargo box, a dark frame under it, a door seam and ribs
  detail.push(prism([[-1.95, 0.95], [-1.95, 3.55], [hl, 3.55], [hl, 0.95]], w, '#eceef1', 0.1));
  paint.push(box(w + 0.02, 0.55, 6.1, 0, 1.6, 1.1), box(w + 0.02, 0.1, 6.1, 0, 2.05, 1.1));   // a coloured band along the white box
  detail.push(box(2.2, 0.35, 6.4, 0, 0.78, 1.1, '#1b1b1f'), box(w - 0.1, 0.04, 0.02, 0, 2.2, hl + 0.01, '#8d9298'), box(0.03, 2.4, 0.02, 0, 2.2, hl + 0.012, '#8d9298'), box(w + 0.02, 0.24, 0.16, 0, 0.62, hl + 0.06, '#26272b'));
  detail.push(box(w + 0.012, 0.16, 6.5, 0, 3.52, 1.15, '#c9ccd1'));   // roof edge cap
  const rib = 0; void rib;
  tail.push(box(0.3, 0.2, 0.04, 1.0, 1.0, hl + 0.03, '#ffffff'), box(0.3, 0.2, 0.04, -1.0, 1.0, hl + 0.03, '#ffffff'));
  head.push(box(0.36, 0.18, 0.04, 0.82, 0.92, -hl - 0.03, '#ffffff'), box(0.36, 0.18, 0.04, -0.82, 0.92, -hl - 0.03, '#ffffff'));
  detail.push(box(0.4, 0.22, 0.05, 0.82, 0.92, -hl + 0.02, '#e4ebf0'), box(0.4, 0.22, 0.05, -0.82, 0.92, -hl + 0.02, '#e4ebf0'), box(0.55, 0.14, 0.015, 0, 0.9, hl + 0.075, PLATE));
  const o = { detail };
  for (const sx of [-1, 1]) { wheelAt(0.5, 0.3, sx * 1.02, -hl + 1.25, sx, o, true, 1.25); wheelAt(0.5, 0.3, sx * 1.02, hl - 1.5, sx, o, true, 1.25, true); detail.push(box(0.04, 0.5, 0.5, sx * 1.1, 0.35, hl - 0.4, '#0a0a0c')); }
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

function semi() {
  const hl = 8.5, paint: Part[] = [], detail: Part[] = [], tail: Part[] = [], head: Part[] = [];
  const TW = 2.5;
  // tractor: long conventional hood, tall cab, sleeper, roof fairing
  paint.push(prism([[-hl, 0.95], [-hl, 2.15], [-hl + 0.3, 2.45], [-6.2, 2.6], [-6.1, 2.55], [-6.1, 0.95]], 2.32, '#ffffff', 0.1));         // hood
  paint.push(prism([[-6.3, 1.0], [-6.3, 2.5], [-5.8, 3.95], [-5.2, 4.05], [-3.7, 4.05], [-3.55, 3.9], [-3.55, 1.0]], TW, '#ffffff', 0.09));    // cab and sleeper
  paint.push(prism([[-5.9, 4.1], [-5.6, 4.1], [-3.8, 4.55], [-3.7, 4.1]], 2.3, '#ffffff', 0.05));                                              // roof deflector
  detail.push(prism([[-6.2, 2.5], [-5.78, 3.88], [-5.0, 3.93], [-5.0, 2.5]], 2.34, GLASS, 0.03));                                              // windscreen and doors' glass
  for (const sx of [-1, 1]) {
    detail.push(box(0.03, 0.8, 1.3, sx * 1.255, 3.3, -5.55, GLASS), box(0.014, 1.6, 0.016, sx * 1.256, 2.25, -4.9, '#0d0d10'), box(0.03, 0.06, 0.24, sx * 1.26, 2.35, -5.5, '#2a2c30'));
    detail.push(box(0.04, 0.7, 0.04, sx * 1.45, 2.8, -6.1, DARK), box(0.14, 0.9, 0.24, sx * 1.55, 2.9, -6.15, DARK));                      // big mirrors
    detail.push(vcyl(0.09, 2.4, sx * 1.2, 3.0, -3.45, CHROME), vcyl(0.12, 0.2, sx * 1.2, 4.3, -3.45, '#6d7075'));                              // exhaust stacks
    detail.push(cyl(0.4, 1.5, sx * 1.25, 0.88, -4.55, '#b9bec5', 14), box(0.4, 0.06, 0.8, sx * 1.15, 1.2, -5.9, '#2a2c30'));                   // fuel tanks, steps
    detail.push(box(0.2, 0.34, 0.12, sx * 0.85, 1.55, -hl + 0.1, '#e4ebf0'), box(0.2, 0.18, 0.5, sx * 1.22, 2.05, -hl + 0.1, '#8a6a1c'));
    head.push(box(0.3, 0.14, 0.04, sx * 0.85, 1.58, -hl - 0.012, '#ffffff'));
  }
  // grille: chrome shell with dark slats, a big chrome bumper, a plate
  detail.push(box(1.6, 1.15, 0.1, 0, 1.55, -hl - 0.02, CHROME));
  for (let i = -3; i <= 3; i++) detail.push(box(0.1, 0.95, 0.03, i * 0.2, 1.55, -hl - 0.09, '#0b0b0d'));
  detail.push(box(2.5, 0.32, 0.26, 0, 0.7, -hl - 0.06, CHROME), box(0.5, 0.16, 0.015, 0, 0.7, -hl - 0.2, PLATE), box(2.2, 0.18, 0.4, 0, 0.9, -7.7, '#1b1b1f'));
  // chassis, fifth wheel, trailer with ribs, a colour stripe, rear doors, bumper, mud flaps, landing gear
  detail.push(box(1.1, 0.35, 11, 0, 0.72, -1.0, '#1a1a1d'), box(1.8, 0.1, 1.6, 0, 1.0, -3.0, '#2c2e32'));
  detail.push(prism([[-3.2, 0.95], [-3.2, 4.4], [hl - 0.05, 4.4], [hl - 0.05, 0.95]], 2.6, '#e8eaed', 0.06));
  for (let z = -2.6; z < hl - 0.3; z += 1.0) detail.push(box(2.62, 3.3, 0.035, 0, 2.7, z, '#cfd2d6'));
  paint.push(box(2.63, 0.5, 11.2, 0, 1.9, 2.3), box(2.63, 0.12, 11.2, 0, 1.45, 2.3));
  detail.push(box(2.5, 0.06, 0.02, 0, 2.7, hl, '#8d9298'), box(0.03, 3.3, 0.02, 0, 2.7, hl + 0.004, '#8d9298'), box(2.6, 0.22, 0.18, 0, 0.88, hl + 0.02, '#202226'), box(2.4, 0.07, 0.07, 0, 0.7, hl - 0.2, '#202226'));
  detail.push(box(0.55, 0.15, 0.015, 0, 1.15, hl + 0.015, PLATE));
  tail.push(box(0.3, 0.2, 0.04, 1.05, 1.28, hl + 0.03, '#ffffff'), box(0.3, 0.2, 0.04, -1.05, 1.28, hl + 0.03, '#ffffff'));
  head.push();
  const o = { detail };
  for (const sx of [-1, 1]) {
    wheelAt(0.5, 0.3, sx * 1.05, -hl + 1.35, sx, o, false);
    for (const z of [-4.55, -3.4]) wheelAt(0.5, 0.28, sx * 1.12, z, sx, o, false, 0, true);
    for (const z of [hl - 1.35, hl - 2.5]) wheelAt(0.5, 0.28, sx * 1.12, z, sx, o, false, 0, true);
    detail.push(box(0.04, 0.7, 0.5, sx * 1.25, 0.5, hl - 0.4, '#0a0a0c'), box(0.5, 0.08, 6.0, sx * 1.2, 0.95, 4.2, '#26282c'), box(0.1, 0.8, 0.1, sx * 0.9, 0.55, -2.6, '#2c2e32'));
  }
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

function bus() {
  const hl = 6, w = 2.55, paint: Part[] = [], detail: Part[] = [], tail: Part[] = [], head: Part[] = [];
  paint.push(prism([[-hl, 0.6], [-hl, 2.5], [-hl + 0.1, 3.0], [-hl + 0.45, 3.2], [hl - 0.4, 3.2], [hl - 0.05, 3.0], [hl, 2.5], [hl, 0.6]], w, '#ffffff', 0.13));
  // windows: a dark band cut by pillars, plus the big windscreen and rear glass
  detail.push(box(w + 0.01, 0.95, 10.7, 0, 2.28, 0.2, GLASS), box(w - 0.35, 1.05, 0.1, 0, 2.5, -hl - 0.02, GLASS), box(w - 0.5, 0.7, 0.05, 0, 2.5, hl + 0.01, GLASS));
  for (let z = -4.4; z <= 5.2; z += 1.2) paint.push(box(w + 0.025, 1.0, 0.1, 0, 2.28, z));
  paint.push(box(w + 0.02, 0.1, 10.7, 0, 1.74, 0.2), box(w + 0.02, 0.07, 10.7, 0, 2.78, 0.2));
  // destination sign, doors, stripe, roof AC, mirrors
  detail.push(box(1.7, 0.3, 0.06, 0, 3.0, -hl - 0.025, '#14110a'), box(1.4, 0.16, 0.03, 0, 3.0, -hl - 0.05, '#ffb000'));
  detail.push(box(w + 0.014, 0.18, 11.4, 0, 1.2, 0, '#232a52'), box(w + 0.014, 0.08, 11.4, 0, 1.0, 0, '#e8872a'));
  for (const dz of [-4.5, 0.6]) detail.push(box(0.03, 2.0, 0.95, w / 2 + 0.012, 1.75, dz, GLASS), box(0.03, 2.05, 0.05, w / 2 + 0.014, 1.75, dz - 0.5, '#1a1c20'));
  detail.push(box(1.5, 0.28, 3.0, 0, 3.34, 1.8, '#c9ccd0'), box(1.0, 0.2, 1.6, 0, 3.32, -2.6, '#b8bcc1'));
  for (const sx of [-1, 1]) detail.push(box(0.05, 0.9, 0.05, sx * 1.5, 2.55, -hl + 0.3, DARK), box(0.16, 0.7, 0.2, sx * 1.6, 2.55, -hl + 0.3, DARK));
  detail.push(box(w - 0.4, 0.3, 0.1, 0, 0.52, -hl - 0.03, '#202226'), box(w - 0.3, 0.3, 0.1, 0, 0.52, hl + 0.03, '#202226'), box(0.55, 0.14, 0.015, 0, 0.92, hl + 0.01, PLATE));
  head.push(box(0.4, 0.2, 0.04, 0.9, 0.95, -hl - 0.03, '#ffffff'), box(0.4, 0.2, 0.04, -0.9, 0.95, -hl - 0.03, '#ffffff'));
  detail.push(box(0.46, 0.24, 0.05, 0.9, 0.95, -hl + 0.02, '#e4ebf0'), box(0.46, 0.24, 0.05, -0.9, 0.95, -hl + 0.02, '#e4ebf0'));
  tail.push(box(0.26, 0.5, 0.04, 1.05, 1.3, hl + 0.03, '#ffffff'), box(0.26, 0.5, 0.04, -1.05, 1.3, hl + 0.03, '#ffffff'));
  const o = { detail };
  for (const sx of [-1, 1]) { wheelAt(0.5, 0.3, sx * 1.05, -3.9, sx, o, true, w / 2); wheelAt(0.5, 0.3, sx * 1.05, 3.5, sx, o, true, w / 2, true); }
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

function tow() {
  // a flatbed wrecker: a pickup cab, a long flat deck with rails, a beacon bar and a boom
  const hl = 3.8, w = 2.4, paint: Part[] = [], detail: Part[] = [], tail: Part[] = [], head: Part[] = [];
  paint.push(prism([[-hl, 0.62], [-hl, 1.55], [-hl + 0.4, 1.75], [-hl + 1.25, 1.95], [-hl + 1.5, 2.1], [-hl + 2.0, 3.0], [-hl + 3.1, 3.0], [-hl + 3.2, 2.9], [-hl + 3.2, 0.62]], 2.3, '#ffffff', 0.08));
  detail.push(prism([[-hl + 1.55, 2.12], [-hl + 2.05, 2.92], [-hl + 3.05, 2.92], [-hl + 3.1, 2.12]], 2.26, GLASS, 0.03));
  detail.push(box(2.3, 0.18, 4.6, 0, 1.05, 1.5, '#2a2c30'), box(2.35, 0.12, 4.7, 0, 1.2, 1.5, '#5d6066'));
  for (const sx of [-1, 1]) {
    paint.push(box(0.08, 0.34, 4.6, sx * 1.15, 1.45, 1.5)); detail.push(box(0.05, 0.1, 4.6, sx * 1.16, 1.65, 1.5, '#a9adb3'));
    detail.push(box(0.04, 0.05, 0.5, sx * 1.17, 2.4, -2.1, '#2a2c30'), box(0.16, 0.5, 0.2, sx * 1.4, 2.4, -hl + 1.3, DARK));
    head.push(box(0.4, 0.12, 0.04, sx * 0.8, 1.35, -hl - 0.01, '#ffffff'));
    detail.push(box(0.44, 0.15, 0.05, sx * 0.8, 1.35, -hl + 0.04, '#e4ebf0'));
  }
  detail.push(box(1.5, 0.3, 0.06, 0, 1.1, -hl - 0.012, '#08080a'), box(2.3, 0.3, 0.2, 0, 0.62, -hl - 0.03, '#26272b'), box(0.5, 0.14, 0.015, 0, 0.7, hl + 0.01, PLATE));
  detail.push(box(1.2, 0.1, 0.3, 0, 3.08, -hl + 2.6, '#15171c'), box(0.5, 0.12, 0.28, -0.3, 3.18, -hl + 2.6, '#f0a800'), box(0.5, 0.12, 0.28, 0.3, 3.18, -hl + 2.6, '#f0a800'));
  detail.push(box(0.3, 0.9, 0.3, 0, 1.85, -0.2, '#2a2c30'), strut(-0.2, 2.2, 1.6, 2.9, 0, 0.18, 0.18, '#2a2c30'));
  tail.push(box(0.3, 0.16, 0.04, 0.9, 0.95, hl + 0.01, '#ffffff'), box(0.3, 0.16, 0.04, -0.9, 0.95, hl + 0.01, '#ffffff'));
  const o = { detail };
  for (const sx of [-1, 1]) { wheelAt(0.46, 0.3, sx * 1.0, -hl + 1.35, sx, o, true, 1.15); for (const z of [hl - 1.3]) wheelAt(0.46, 0.3, sx * 1.0, z, sx, o, true, 1.15, true); }
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

function ambulance() {
  const hl = 3.1, w = 2.1, paint: Part[] = [], detail: Part[] = [], tail: Part[] = [], head: Part[] = [];
  paint.push(prism([[-hl, 0.45], [-hl, 1.3], [-hl + 0.3, 1.45], [-hl + 1.0, 1.55], [-hl + 1.8, 2.5], [hl - 0.1, 2.5], [hl, 2.4], [hl, 0.45]], w, '#ffffff', 0.09));
  detail.push(prism([[-hl + 1.05, 1.58], [-hl + 1.75, 2.35], [-hl + 2.3, 2.35], [-hl + 2.3, 1.58]], w - 0.06, GLASS, 0.03));
  detail.push(box(w + 0.01, 0.26, 3.2, 0, 1.55, 1.2, '#d3231a'), box(w + 0.01, 0.07, 3.2, 0, 1.78, 1.2, '#ffffff'), box(0.5, 0.5, 0.015, 0, 2.0, hl + 0.01, '#d3231a'));
  detail.push(box(1.1, 0.12, 0.34, 0, 2.58, -hl + 2.2, '#15171c'), box(0.5, 0.12, 0.3, -0.3, 2.66, -hl + 2.2, '#d3231a'), box(0.5, 0.12, 0.3, 0.3, 2.66, -hl + 2.2, '#1e56e0'));
  detail.push(box(w * 0.6, 0.14, 0.06, 0, 1.0, -hl - 0.01, '#08080a'), box(w, 0.26, 0.2, 0, 0.55, -hl - 0.02, '#26272b'));
  for (const sx of [-1, 1]) { head.push(box(0.36, 0.12, 0.04, sx * 0.7, 1.15, -hl - 0.01, '#ffffff')); tail.push(box(0.12, 0.5, 0.04, sx * 0.94, 1.5, hl + 0.01, '#ffffff')); }
  const o = { detail };
  for (const sx of [-1, 1]) { wheelAt(0.38, 0.26, sx * 0.88, -hl + 1.0, sx, o, true, 1.05); wheelAt(0.38, 0.26, sx * 0.88, hl - 1.0, sx, o, true, 1.05); }
  return { paint: merge(paint), detail: merge(detail), tail: merge(tail), head: merge(head) };
}

const cache = new Map<VehKind, ReturnType<typeof carLike>>();
export function vehicleGeo(kind: VehKind) {
  let g = cache.get(kind);
  if (!g) {
    g = kind === 'box' ? box_truck() : kind === 'semi' ? semi() : kind === 'bus' ? bus() : kind === 'tow' ? tow() : kind === 'ambulance' ? ambulance() : carLike(kind);
    cache.set(kind, g);
  }
  return g;
}
export const ALL_KINDS: VehKind[] = ['sedan', 'suv', 'pickup', 'van', 'hatch', 'box', 'semi', 'bus', 'police', 'wreck', 'tow', 'taxi', 'ambulance'];
export const MAX_PER_KIND: Record<VehKind, number> = { sedan: 36, suv: 32, pickup: 20, van: 16, hatch: 20, box: 14, semi: 16, bus: 8, police: 6, wreck: 4, tow: 4, taxi: 12, ambulance: 2 };
void DIM;
