/**
 * Road signs of the open world, merged into two draw calls: one atlas for the regulatory signs (stop, speed limit, railroad crossing) and one for the green street
 * name blades. Every stop sign sits where the map has one; every speed sign shows the limit of its road; every blade shows a real Carrollton street name.
 */
import * as THREE from 'three';
import { pointOnPoly, type GameMap } from './map';
import { Acc, prism, type Corner } from './build';
import { regulatoryTexture } from '../atl/textures';
import { stopSignTexture } from '../g3d/textures';

export const SPEEDS = [15, 20, 25, 30, 35, 40, 45];
const CELL_W = 512, CELL_H = 640, COLS = 4;
const cellOf = (key: string) => { const order = ['stop', ...SPEEDS.map((s) => `s${s}`), 'trainx', 'yield', 'school', 'blank']; return order.indexOf(key); };

let faceAtlas: THREE.CanvasTexture | null = null, bladeAtlas: THREE.CanvasTexture | null = null;
const bladeSlots = new Map<string, number>();
export function disposeSignAtlases() { faceAtlas?.dispose(); bladeAtlas?.dispose(); faceAtlas = bladeAtlas = null; bladeSlots.clear(); }

export function signFaceAtlas(): THREE.CanvasTexture {
  if (faceAtlas) return faceAtlas;
  const c = document.createElement('canvas'); c.width = CELL_W * COLS; c.height = CELL_H * 3; const g = c.getContext('2d')!;
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, c.width, c.height);
  const put = (key: string, img: CanvasImageSource, fit: 'full' | 'square') => {
    const i = cellOf(key), x = (i % COLS) * CELL_W, y = Math.floor(i / COLS) * CELL_H;
    if (fit === 'square') g.drawImage(img, x, y + (CELL_H - CELL_W) / 2, CELL_W, CELL_W); else g.drawImage(img, x, y, CELL_W, CELL_H);
  };
  try { put('stop', stopSignTexture().image as CanvasImageSource, 'square'); } catch { /* ignore */ }
  for (const s of SPEEDS) put(`s${s}`, regulatoryTexture('speed', s).image as CanvasImageSource, 'full');
  put('trainx', regulatoryTexture('trainx').image as CanvasImageSource, 'full');
  put('yield', regulatoryTexture('yield').image as CanvasImageSource, 'full');
  put('school', regulatoryTexture('school').image as CanvasImageSource, 'full');
  faceAtlas = new THREE.CanvasTexture(c); faceAtlas.colorSpace = THREE.SRGBColorSpace; faceAtlas.anisotropy = 8; faceAtlas.needsUpdate = true;
  return faceAtlas;
}

const BLADE_W = 512, BLADE_H = 96, BCOLS = 4;
export function bladeAtlasFor(names: string[]): THREE.CanvasTexture {
  if (bladeAtlas) return bladeAtlas;
  const rows = Math.ceil(names.length / BCOLS), c = document.createElement('canvas'); c.width = BLADE_W * BCOLS; c.height = Math.max(1, rows) * BLADE_H; const g = c.getContext('2d')!;
  names.forEach((name, i) => {
    bladeSlots.set(name, i);
    const x = (i % BCOLS) * BLADE_W, y = Math.floor(i / BCOLS) * BLADE_H;
    g.fillStyle = '#0b6b3a'; g.fillRect(x, y, BLADE_W, BLADE_H); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.strokeRect(x + 4, y + 4, BLADE_W - 8, BLADE_H - 8);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const label = name.toUpperCase().replace(/ STREET$/, ' ST').replace(/ AVENUE$/, ' AVE').replace(/ ROAD$/, ' RD').replace(/ DRIVE$/, ' DR').replace(/ BOULEVARD$/, ' BLVD').replace(/ HIGHWAY$/, ' HWY');
    let f = 58; g.font = `700 ${f}px Arial, sans-serif`; while (g.measureText(label).width > BLADE_W - 40 && f > 22) { f -= 2; g.font = `700 ${f}px Arial, sans-serif`; }
    g.fillText(label, x + BLADE_W / 2, y + BLADE_H / 2 + 3);
  });
  bladeAtlas = new THREE.CanvasTexture(c); bladeAtlas.colorSpace = THREE.SRGBColorSpace; bladeAtlas.anisotropy = 8; bladeAtlas.needsUpdate = true;
  return bladeAtlas;
}

const POLE = new THREE.Color(0x8d9298);
/** a quad whose front faces `normal`, centred at (x, y, z), width w, height h, with the atlas rectangle (u0,v0)-(u1,v1) in 0..1 (v up) */
function quadAt(a: Acc, x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number) {
  const rx = -nz, rz = nx;                          // to the right of someone looking at the front (they look along -normal; their right is (-nz... see signs below)
  const col = new THREE.Color(1, 1, 1);
  const a0 = a.v(x - rx * w / 2, y - h / 2, z - rz * w / 2, col, u0, v0, nx, 0, nz), a1 = a.v(x + rx * w / 2, y - h / 2, z + rz * w / 2, col, u1, v0, nx, 0, nz);
  const a2 = a.v(x + rx * w / 2, y + h / 2, z + rz * w / 2, col, u1, v1, nx, 0, nz), a3 = a.v(x - rx * w / 2, y + h / 2, z - rz * w / 2, col, u0, v1, nx, 0, nz);
  a.quad(a0, a1, a2, a3);
}
export function faceUV(key: string): [number, number, number, number] {
  const i = cellOf(key), cx = i % COLS, cy = Math.floor(i / COLS), rows = 3;
  // the atlas canvas is drawn top row first; textures put v=1 at the top
  return [cx / COLS, 1 - (cy + 1) / rows, (cx + 1) / COLS, 1 - cy / rows];
}

export interface SignParts { face: Acc; blade: Acc; pole: Acc; names: string[] }

/** a regulatory sign on its own pole at the right-hand kerb of an approach: it faces the traffic coming towards it (travelling along d) */
function postSign(parts: SignParts, x: number, z: number, dx: number, dz: number, key: string, w: number, h: number, top = 2.35) {
  prism(parts.pole, x, 0, z, 0.035, 0.035, top, POLE, 5);
  // the viewer travels along d, the sign front faces -d; the viewer's right is (-dz, dx), which must be the +u direction of the quad. quadAt's right is (-nz, nx) with n = -d => (dz, -dx): the mirror, so pass n = d... then right = (-dz, dx)
  const [u0, v0, u1, v1] = faceUV(key);
  // we want the front to face the viewer, i.e. normal = -d, with right = (-dz, dx). quadAt gives right = (-nz, nx); with n = -d that is (dz, -dx): the opposite. Swap u0/u1 to mirror it back.
  quadAt(parts.face, x, top - h / 2 + 0.05, z, -dx, -dz, w, h, u1, v0, u0, v1);
}

export function buildSigns(map: GameMap, corners: Corner[]): SignParts {
  const parts: SignParts = { face: new Acc(), blade: new Acc(), pole: new Acc(), names: [] };
  // ---- stop signs at the stop line of every approach that has one
  for (const e of map.edges) {
    if (!e.way.ai) continue;
    for (const end of [0, 1] as const) {
      const node = end === 1 ? e.b : e.a; if (!e.stop[end] || node.arms.length < 3) continue;
      const sd = end === 1 ? 1 : -1, s = end === 1 ? e.len - node.clear - 1.0 : node.clear + 1.0, q = pointOnPoly(e.p, e.cum, s), hw = e.way.width / 2;
      const off = sd * (hw + 1.5), x = q.x - q.tz * off, z = q.z + q.tx * off, dx = q.tx * sd, dz = q.tz * sd;
      postSign(parts, x, z, dx, dz, 'stop', 0.78, 0.78, 2.3);
    }
  }
  // ---- speed limit signs shortly after every junction, on the right, for each direction
  for (const e of map.edges) {
    const w = e.way; if (!w.ai || !w.name || w.rank < 2 || e.len < 70) continue;
    const key = `s${SPEEDS.reduce((b, s) => (Math.abs(s - w.mph) < Math.abs(b - w.mph) ? s : b), SPEEDS[0]!)}`;
    for (const sd of [1, -1] as const) {
      if (w.oneway && sd === -1 && !e.a.arms.some((a) => a.edge === e && a.end === 0 && a.outbound)) continue;
      const startNode = sd === 1 ? e.a : e.b;
      const s = sd === 1 ? Math.min(e.len * 0.4, startNode.clear + 16) : e.len - Math.min(e.len * 0.4, startNode.clear + 16);
      const q = pointOnPoly(e.p, e.cum, s), off = sd * (w.width / 2 + 1.7), x = q.x - q.tz * off, z = q.z + q.tx * off;
      postSign(parts, x, z, q.tx * sd, q.tz * sd, key, 0.62, 0.78, 2.4);
    }
  }
  // ---- railroad crossing warning signs (crossbucks) 14 m before the tracks on each side
  for (const lx of map.levelXs) {
    const e = lx.edge, w = e.way, tx = Math.sin(lx.ang), tz = Math.cos(lx.ang);
    for (const sd of [1, -1] as const) {
      const s = lx.s - sd * 15; if (s < 2 || s > e.len - 2) continue;
      const q = pointOnPoly(e.p, e.cum, s), off = sd * (w.width / 2 + 1.7);
      postSign(parts, q.x - q.tz * off, q.z + q.tx * off, tx * sd, tz * sd, 'trainx', 0.8, 1.0, 2.5);
    }
  }
  // ---- street name blades at the kerb corners
  const names = new Set<string>();
  for (const c of corners) for (const a of [c.a1, c.a2]) if (a.edge.way.name) names.add(a.edge.way.name);
  parts.names = [...names].sort();
  const slot = new Map(parts.names.map((n, i) => [n, i]));
  const BR = Math.ceil(parts.names.length / BCOLS);
  const done = new Set<number>();
  for (const c of corners) {
    if (done.has(c.node.id)) continue;           // one pole per junction keeps the sidewalks from filling with posts
    if (!(c.node.signal || c.node.rank >= 3 || c.node.arms.some((a) => a.edge.stop[a.end]))) continue;
    done.add(c.node.id);
    const px = c.node.x + c.kin[0]! + (c.u1[0]! + c.u2[0]!) * 0.5, pz = c.node.z + c.kin[1]! + (c.u1[1]! + c.u2[1]!) * 0.5;
    prism(parts.pole, px, 0, pz, 0.04, 0.04, 3.4, POLE, 6);
    // each blade lies across the pole and faces the traffic that arrives along its street: it faces out along the arm
    for (const [a, u] of [[c.a1, c.u1], [c.a2, c.u2]] as const) {
      const name = a.edge.way.name; if (!name) continue;
      const i = slot.get(name)!, cx = i % BCOLS, cy = Math.floor(i / BCOLS);
      const u0 = cx / BCOLS, u1 = (cx + 1) / BCOLS, v1 = 1 - cy / BR, v0 = 1 - (cy + 1) / BR;
      // blade faces +u (out along the arm); its right-hand (as seen from the traffic coming along -u) is (u_z... ) : swap to mirror back
      quadAt(parts.blade, px + u[0]! * 0.02, 3.15 + (a === c.a1 ? 0.0 : 0.27), pz + u[1]! * 0.02, u[0]!, u[1]!, 1.3, 0.25, u1, v0, u0, v1);
    }
  }
  return parts;
}

