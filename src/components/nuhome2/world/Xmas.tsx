import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NightCtx, radialTexture, rng } from './theme';
import { leafCard, softFoliage } from './Grounds';
import { facetedStar } from './Signage';

/*
 * Christmas at the estate. Everything here is drawn only on the Christmas page (see season.ts):
 *   a decorated fir in the fountain circle (needle sprays, gold ribbon, glass baubles, warm lights, a gilded star, presents),
 *   warm white lights along the eaves, hips and ridges, wreaths with velvet bows on the windows, the doors and the lamp posts,
 *   a garland swagged under the canopy, red ribbon wound round the columns, twinkling net lights on the hedges and candy canes
 *   along the avenue. Each kind of thing is one instanced draw, so the whole season costs a couple of dozen draw calls.
 */

// ------------------------------------------------------------------ shared pieces

let needleTex: THREE.CanvasTexture | null = null;
/** A fir branch: a stem, side shoots and hundreds of short needles in four greens, a little snow lying on the upper needles. */
function needles() {
  if (needleTex) return needleTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!, r = rng(808);
  g.lineCap = 'round';
  const shoot = (x0: number, y0: number, x1: number, y1: number, len: number, w: number) => {
    g.strokeStyle = '#3a2a18'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const n = Math.round(len / 2.4), dx = (x1 - x0) / n, dy = (y1 - y0) / n, a = Math.atan2(y1 - y0, x1 - x0);
    for (let i = 0; i < n; i++) {
      const x = x0 + dx * i, y = y0 + dy * i, k = 1 - i / n * .45;
      for (const sd of [-1, 1]) {
        const na = a + sd * (.75 + r() * .35), nl = (13 + r() * 7) * k, v = r();
        g.strokeStyle = v > .8 ? '#3f7a45' : v > .45 ? '#245a33' : v > .15 ? '#1a4428' : '#12321d';
        g.lineWidth = 1.6 + r() * .8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(na) * nl, y + Math.sin(na) * nl); g.stroke();
        if (sd < 0 && r() > .72) { g.strokeStyle = 'rgba(244,248,255,.85)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x + Math.cos(na) * nl * .4, y + Math.sin(na) * nl * .4); g.lineTo(x + Math.cos(na) * nl * .9, y + Math.sin(na) * nl * .9); g.stroke(); }
      }
    }
  };
  // the main stem runs up the card; side shoots leave it alternately and lean toward the tip
  shoot(S / 2, S - 4, S / 2, 6, S - 10, 3.2);
  for (let i = 0; i < 6; i++) { const y = S - 30 - i * 34, sd = i % 2 ? 1 : -1, L = 70 - i * 7; shoot(S / 2, y, S / 2 + sd * L * .8, y - L * .7, L, 2); shoot(S / 2, y - 14, S / 2 - sd * L * .7, y - 14 - L * .7, L * .9, 2); }
  needleTex = new THREE.CanvasTexture(c); needleTex.colorSpace = THREE.SRGBColorSpace; needleTex.anisotropy = 4;
  return needleTex;
}
let firMat: THREE.MeshStandardMaterial | null = null;
const fir = () => (firMat ??= softFoliage(new THREE.MeshStandardMaterial({ map: needles(), alphaTest: .45, side: THREE.DoubleSide, roughness: .86 })));

const velvet = () => new THREE.MeshPhysicalMaterial({ color: '#a20d18', roughness: .55, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color('#ff5a5a') });
const gilt = () => new THREE.MeshStandardMaterial({ color: '#e0b04a', metalness: .9, roughness: .24, envMapIntensity: 1.4, emissive: '#ff9a1a', emissiveIntensity: .05 });

let bowG: THREE.BufferGeometry | null = null;
/** A ribbon bow about half a metre across: two loops, a knot and two tails, facing +z. */
function bowGeo() {
  if (bowG) return bowG;
  const parts: THREE.BufferGeometry[] = [];
  [-1, 1].forEach(s => {
    const loop = new THREE.TorusGeometry(.13, .045, 8, 20); loop.scale(1.25, .78, .45); loop.rotateZ(s * .35); loop.translate(s * .15, .02, 0); parts.push(loop);
    const tail = new THREE.BoxGeometry(.07, .32, .02); tail.translate(0, -.16, 0); tail.rotateZ(s * .32); tail.translate(s * .03, -.04, .01); parts.push(tail);
  });
  parts.push(new THREE.SphereGeometry(.065, 12, 10).scale(1, .9, .7));
  const all = parts.map(p => { const g = p.toNonIndexed(); Object.keys(g.attributes).forEach(k => { if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); }); return g; });
  bowG = mergeGeometries(all, false)!; bowG.computeVertexNormals();
  return bowG;
}

type Inst = { p: [number, number, number]; q?: THREE.Quaternion; s: number | [number, number, number]; c?: string };
/** One instanced mesh from a list of placements. */
function Many({ geo, mat, list, cast = false }: { geo: THREE.BufferGeometry; mat: THREE.Material; list: Inst[]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(), col = new THREE.Color();
    list.forEach((it, i) => { o.position.set(...it.p); if (it.q) o.quaternion.copy(it.q); else o.quaternion.identity(); const s = it.s; if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(...s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); if (it.c) m.setColorAt(i, col.set(it.c)); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} castShadow={cast} receiveShadow frustumCulled={false} />;
}

const GLOW_V = /* glsl */`
  attribute float aPhase; attribute vec3 aColor; uniform float uTime, uSize, uNight; varying vec3 vC; varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float tw = .72 + .28 * sin(uTime * (1.1 + fract(aPhase * 7.3) * 1.6) + aPhase * 6.283);
    gl_PointSize = min(uSize * (.75 + .25 * tw) / -mv.z, 56.0);
    vC = aColor; vA = tw * mix(.32, 1.0, uNight);
    gl_Position = projectionMatrix * mv;
  }`;
const GLOW_F = /* glsl */`
  varying vec3 vC; varying float vA;
  void main() { vec2 d = gl_PointCoord - .5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.0, r); a = a * a * .85 + smoothstep(.22, .0, r) * .9; gl_FragColor = vec4(vC * a * vA, 1.0); }`;

const PALETTE = { warm: '#ffd59a', gold: '#ffb54a', white: '#fff4e2', red: '#ff3b3b', green: '#3dff7a', blue: '#5aa8ff' };
type Bulb = [number, number, number];
/** Light bulbs: a bright little bead for each, and a soft twinkling glow round it that swells at night. */
function Bulbs({ at, colors, size = .045, glow = 1.0 }: { at: Bulb[]; colors: string[]; size?: number; glow?: number }) {
  const mix = useContext(NightCtx);
  const bead = useMemo(() => new THREE.SphereGeometry(size, 8, 6), [size]);
  const beadMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const list = useMemo<Inst[]>(() => at.map((p, i) => ({ p, s: 1, c: colors[i % colors.length] })), [at, colors]);
  const pts = useMemo(() => {
    const g = new THREE.BufferGeometry(), r = rng(at.length * 13 + 7), c = new THREE.Color();
    g.setAttribute('position', new THREE.Float32BufferAttribute(at.flat(), 3));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(at.map(() => r()), 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(at.flatMap((_, i) => c.set(colors[i % colors.length]!).toArray()), 3));
    g.computeBoundingSphere(); return g;
  }, [at, colors]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: GLOW_V, fragmentShader: GLOW_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uTime: { value: 0 }, uSize: { value: 300 }, uNight: { value: 0 } } }), []);
  useFrame(({ clock, gl, size: sz }) => {
    const n = mix.current; mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uNight.value = n;
    mat.uniforms.uSize.value = glow * sz.height * gl.getPixelRatio() * .62 * (.5 + .75 * n);
    beadMat.color.setScalar(1.05 + 1.2 * n);
  });
  return <group>
    <Many geo={bead} mat={beadMat} list={list} />
    <points geometry={pts} material={mat} frustumCulled={false} renderOrder={8} />
  </group>;
}

/** Points along a polyline, every `step` metres, with an optional sag between clips (for draped strings). */
function along(path: Bulb[], step: number, sag = 0, clip = 0): Bulb[] {
  const out: Bulb[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!, b = path[i + 1]!, L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, cl = clip > 0 ? (t * L) % clip / clip : t;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * cl * (1 - cl), a[2] + (b[2] - a[2]) * t]);
    }
  }
  out.push(path[path.length - 1]!);
  return out;
}

const Y = new THREE.Vector3(0, 1, 0);
const quatTo = (d: THREE.Vector3, roll = 0) => { const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()); return roll ? q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll)) : q; };

// ------------------------------------------------------------------ wreaths

type WreathSpec = { p: Bulb; ry: number; R: number };
/** Wreaths: a dense ring of fir sprays round a dark core, red berries, warm lights wound through and a velvet bow at the foot. */
export function Wreaths({ list, lite }: { list: WreathSpec[]; lite: boolean }) {
  const core = useMemo(() => new THREE.TorusGeometry(1, .2, 8, 28), []);
  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0f2a18', roughness: 1 }), []);
  const berry = useMemo(() => new THREE.SphereGeometry(.035, 8, 6), []);
  const berryMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b3121c', roughness: .3, metalness: .1 }), []);
  const velvetMat = useMemo(velvet, []);
  const parts = useMemo(() => {
    const r = rng(77), sprays: Inst[] = [], berries: Inst[] = [], bows: Inst[] = [], cores: Inst[] = [], lights: Bulb[] = [];
    const v = new THREE.Vector3(), e = new THREE.Euler();
    list.forEach(w => {
      const rot = new THREE.Quaternion().setFromEuler(e.set(0, w.ry, 0)), at = (x: number, y: number, z: number): Bulb => { v.set(x, y, z).applyQuaternion(rot); return [w.p[0] + v.x, w.p[1] + v.y, w.p[2] + v.z]; };
      cores.push({ p: w.p, q: rot, s: [w.R, w.R, w.R] });
      const n = Math.round((lite ? 26 : 44) * w.R / .5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * .2, rr = w.R * (.9 + r() * .28), dir = new THREE.Vector3(-Math.sin(a), Math.cos(a), (r() - .3) * .6).applyQuaternion(rot);
        sprays.push({ p: at(Math.cos(a) * rr, Math.sin(a) * rr, .04 + r() * .06), q: quatTo(dir, r() * 3), s: w.R * (.62 + r() * .3) });
      }
      for (let i = 0; i < Math.round(14 * w.R / .5); i++) { const a = r() * Math.PI * 2, rr = w.R * (.75 + r() * .45); berries.push({ p: at(Math.cos(a) * rr, Math.sin(a) * rr, .16 + r() * .06), s: .8 + r() * .5 }); }
      for (let i = 0; i < Math.round(16 * w.R / .5); i++) { const a = (i / Math.round(16 * w.R / .5)) * Math.PI * 2, rr = w.R * (1 + (i % 2 ? .18 : -.12)); lights.push(at(Math.cos(a) * rr, Math.sin(a) * rr, .18)); }
      bows.push({ p: at(0, -w.R * 1.02, .2), q: rot, s: w.R * 1.25 });
    });
    return { sprays, berries, bows, cores, lights };
  }, [list, lite]);
  return <group>
    <Many geo={core} mat={coreMat} list={parts.cores} />
    <Many geo={leafCard()} mat={fir()} list={parts.sprays} />
    <Many geo={berry} mat={berryMat} list={parts.berries} />
    <Many geo={bowGeo()} mat={velvetMat} list={parts.bows} cast />
    <Bulbs at={parts.lights} colors={[PALETTE.warm, PALETTE.warm, PALETTE.gold]} size={.025} glow={.45} />
  </group>;
}

// ------------------------------------------------------------------ garland

/** A thick fir garland swagged between hooks, warm lights through it and a bow at every hook. */
export function Garland({ hooks, sag, lite }: { hooks: Bulb[]; sag: number; lite: boolean }) {
  const velvetMat = useMemo(velvet, []);
  const parts = useMemo(() => {
    const r = rng(91), sprays: Inst[] = [], bows: Inst[] = [];
    const path = along(hooks, .12, sag, Math.hypot(hooks[1]![0] - hooks[0]![0], hooks[1]![2] - hooks[0]![2]));
    path.forEach((p, i) => {
      const nx = path[Math.min(path.length - 1, i + 1)]!, pv = path[Math.max(0, i - 1)]!, tan = new THREE.Vector3(nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]).normalize();
      for (let k = 0; k < (lite ? 2 : 3); k++) { const d = tan.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), (r() - .5) * 2.4).add(new THREE.Vector3(0, 0, (r() - .5) * .8)).normalize(); sprays.push({ p: [p[0] + (r() - .5) * .1, p[1] + (r() - .5) * .12, p[2] + (r() - .5) * .1], q: quatTo(d, r() * 3), s: .34 + r() * .16 }); }
    });
    hooks.forEach(h => bows.push({ p: [h[0], h[1] - .05, h[2] + .16], s: .85 }));
    return { sprays, bows, lights: along(hooks, .32, sag, Math.hypot(hooks[1]![0] - hooks[0]![0], hooks[1]![2] - hooks[0]![2])).map(p => [p[0], p[1] - .02, p[2] + .12] as Bulb) };
  }, [hooks, sag, lite]);
  return <group>
    <Many geo={leafCard()} mat={fir()} list={parts.sprays} />
    <Many geo={bowGeo()} mat={velvetMat} list={parts.bows} cast />
    <Bulbs at={parts.lights} colors={[PALETTE.warm, PALETTE.warm, PALETTE.gold]} size={.03} glow={.6} />
  </group>;
}

/** Red velvet ribbon wound round a column, with small lights following it. */
export function ColumnRibbon({ x, z, y0, y1, r: R, turns = 3.5 }: { x: number; z: number; y0: number; y1: number; r: number; turns?: number }) {
  const velvetMat = useMemo(velvet, []);
  const { geo, lights } = useMemo(() => {
    const pts: THREE.Vector3[] = [], N = 160;
    for (let i = 0; i <= N; i++) { const t = i / N, a = t * turns * Math.PI * 2; pts.push(new THREE.Vector3(x + Math.cos(a) * R, y0 + (y1 - y0) * t, z + Math.sin(a) * R)); }
    const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, 320, .045, 8, false); g.scale(1, 1, 1);
    const lights: Bulb[] = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * turns * Math.PI * 2 + .5; lights.push([x + Math.cos(a) * (R + .02), y0 + (y1 - y0) * t + .08, z + Math.sin(a) * (R + .02)]); }
    return { geo: g, lights };
  }, [x, z, y0, y1, R, turns]);
  return <group>
    <mesh geometry={geo} material={velvetMat} castShadow />
    <Bulbs at={lights} colors={[PALETTE.warm, PALETTE.gold]} size={.022} glow={.4} />
  </group>;
}

/** Warm white bulbs along roof lines (each line a polyline), as on a well kept house. */
export function RoofLights({ lines }: { lines: Bulb[][] }) {
  const at = useMemo(() => lines.flatMap(l => along(l, .3)), [lines]);
  return <Bulbs at={at} colors={[PALETTE.warm, PALETTE.warm, PALETTE.warm, PALETTE.gold]} size={.065} glow={1.2} />;
}

/** Net lights thrown over hedge tops: rows of twinkling beads, slightly uneven like a real net. */
export function HedgeLights({ boxes }: { boxes: { x0: number; x1: number; z: number; d: number; top: number }[] }) {
  const at = useMemo(() => {
    const r = rng(5), out: Bulb[] = [];
    boxes.forEach(b => { for (let x = b.x0 + .25; x < b.x1 - .2; x += .32) for (let k = 0; k < 3; k++) out.push([x + (r() - .5) * .14, b.top - .02 - (k === 2 ? .18 : 0) + (r() - .5) * .05, b.z + (k - 1) * b.d * .32 + (k === 2 ? b.d * .1 : 0)]); });
    return out;
  }, [boxes]);
  return <Bulbs at={at} colors={[PALETTE.warm, PALETTE.white, PALETTE.warm, PALETTE.gold]} size={.03} glow={.55} />;
}

// ------------------------------------------------------------------ the tree

export const TREE_H = 6.4;
/** The estate's Christmas tree, base at the origin: about 6.4 m of fir to the tip and a gilded star above it. */
export function ChristmasTree({ lite }: { lite: boolean }) {
  const mix = useContext(NightCtx);
  const H = TREE_H, R0 = 2.55;
  const radius = (y: number) => R0 * Math.pow(Math.max(0, 1 - y / H), .92) + .08;
  const velvetMat = useMemo(velvet, []);
  const giltMat = useMemo(gilt, []);
  const parts = useMemo(() => {
    const r = rng(2024), sprays: Inst[] = [], baubles: Inst[] = [], lights: Bulb[] = [];
    // fir: whorl after whorl of branches, longer and droopier toward the foot
    for (let y = .55; y < H - .15; y += lite ? .24 : .17) {
      const rr = radius(y), n = Math.max(5, Math.round(2 * Math.PI * rr / (lite ? .5 : .34))), off = r() * 6;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2 + (r() - .5) * .2, droop = .2 + .25 * (1 - y / H) + r() * .15, L = Math.min(1.15, .32 + rr * .42) * (.85 + r() * .3);
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(droop), -Math.sin(droop) + .25, Math.sin(a) * Math.cos(droop)).normalize();
        const base = rr * (.55 + r() * .2);
        sprays.push({ p: [Math.cos(a) * base + dir.x * L * .5, y + dir.y * L * .5, Math.sin(a) * base + dir.z * L * .5], q: quatTo(dir, r() * 6), s: L });
      }
    }
    for (let k = 0; k < 6; k++) sprays.push({ p: [(r() - .5) * .1, H - .25 + k * .05, (r() - .5) * .1], q: quatTo(new THREE.Vector3((r() - .5) * .5, 1, (r() - .5) * .5)), s: .5 });
    // glass baubles in red, gold, champagne and the brand's navy, hung just inside the outline
    const cols = ['#b3121f', '#d4a03a', '#c8152a', '#e9d3a4', '#1f3a8a', '#d4a03a', '#9c0f1c', '#f2e6cc'];
    for (let i = 0; i < (lite ? 80 : 150); i++) { const y = .8 + r() * (H - 1.5), a = r() * Math.PI * 2, rr = radius(y) * (.86 + r() * .1); baubles.push({ p: [Math.cos(a) * rr, y - .1, Math.sin(a) * rr], s: (.1 + r() * .07) * (1.3 - y / H * .5), c: cols[i % cols.length] }); }
    // lights scattered over the whole outline
    for (let i = 0; i < (lite ? 260 : 520); i++) { const y = .6 + Math.pow(r(), .85) * (H - .9), a = r() * Math.PI * 2, rr = radius(y) * (.9 + r() * .12); lights.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); }
    // the gold ribbon spiralling down
    const rib: THREE.Vector3[] = []; for (let i = 0; i <= 200; i++) { const t = i / 200, y = H - .7 - t * (H - 1.2), a = t * 4.2 * Math.PI * 2; rib.push(new THREE.Vector3(Math.cos(a) * (radius(y) + .04), y, Math.sin(a) * (radius(y) + .04))); }
    const ribbon = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rib), 400, .05, 6, false); ribbon.scale(1, .55, 1).translate(0, 0, 0);
    return { sprays, baubles, lights, ribbon };
  }, [lite]);   // eslint-disable-line react-hooks/exhaustive-deps
  const bauble = useMemo(() => new THREE.SphereGeometry(1, 18, 14), []);
  const baubleMat = useMemo(() => new THREE.MeshPhysicalMaterial({ metalness: .75, roughness: .12, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.6 }), []);
  const core = useMemo(() => new THREE.ConeGeometry(R0 * .78, H * .96, 28, 1, true).translate(0, H * .48 + .3, 0), []);   // eslint-disable-line react-hooks/exhaustive-deps
  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b2213', roughness: 1, side: THREE.DoubleSide }), []);
  // the star, its glow, and the presents
  const star = useMemo(() => facetedStar(.48, .34, .32), []);
  const starMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1c75a', metalness: .85, roughness: .22, emissive: '#ffb02e', emissiveIntensity: .35, envMapIntensity: 1.5 }), []);
  const glowTex = useMemo(() => new THREE.CanvasTexture(radialTexture([[0, 'rgba(255,214,140,1)'], [.35, 'rgba(255,190,100,.45)'], [1, 'rgba(255,170,80,0)']])), []);
  const glowMat = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [glowTex]);
  const starRef = useRef<THREE.Group>(null);
  const gifts = useMemo(() => {
    const r = rng(12), box: Inst[] = [], ribbon: Inst[] = [], bows: Inst[] = [];
    const looks: [string, string][] = [['#b3121f', '#e8c260'], ['#16285a', '#e8c260'], ['#f4efe4', '#b3121f'], ['#1f5a36', '#e8c260'], ['#d9a73a', '#9c0f1c'], ['#b3121f', '#f4efe4'], ['#16285a', '#f4efe4'], ['#e8dcc0', '#1f5a36'], ['#9c0f1c', '#e8c260'], ['#1f5a36', '#b3121f']];
    for (let i = 0; i < (lite ? 7 : 11); i++) {
      const a = (i / (lite ? 7 : 11)) * Math.PI * 2 + r() * .3, rr = 2.6 + r() * .6, w = .45 + r() * .45, h = .3 + r() * .4, d = .4 + r() * .4, [bc, rc] = looks[i % looks.length]!;
      const q = new THREE.Quaternion().setFromAxisAngle(Y, r() * 3), p: Bulb = [Math.cos(a) * rr, .24 + h / 2, Math.sin(a) * rr];
      box.push({ p, q, s: [w, h, d], c: bc });
      ribbon.push({ p, q, s: [w + .012, h + .012, .09], c: rc }, { p, q, s: [.09, h + .014, d + .012], c: rc });
      bows.push({ p: [p[0], .24 + h + .07, p[2]], q: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.2)), s: .7 + w * .5 });
    }
    return { box, ribbon, bows };
  }, [lite]);
  const unit = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const giftMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: .45, metalness: .05 }), []);
  const satin = useMemo(() => new THREE.MeshStandardMaterial({ roughness: .3, metalness: .35 }), []);
  useFrame(({ clock }) => {
    const n = mix.current;
    if (starRef.current) starRef.current.rotation.y = clock.elapsedTime * .35;
    starMat.emissiveIntensity = .35 + 1.6 * n; glowMat.opacity = .35 + .65 * n;
  });
  return <group>
    {/* snow over the stone ring, a velvet skirt and the trunk */}
    <mesh position={[0, .215, 0]} receiveShadow><cylinderGeometry args={[3.72, 3.72, .03, 64]} /><meshStandardMaterial color="#f4f7fb" roughness={.9} /></mesh>
    <mesh position={[0, .25, 0]} receiveShadow material={velvetMat}><cylinderGeometry args={[2.3, 2.45, .05, 48]} /></mesh>
    <mesh position={[0, .28, 0]} rotation-x={Math.PI / 2} material={giltMat}><torusGeometry args={[2.38, .035, 6, 64]} /></mesh>
    <mesh position={[0, .55, 0]} castShadow><cylinderGeometry args={[.2, .26, .7, 12]} /><meshStandardMaterial color="#3b2717" roughness={1} /></mesh>
    <mesh geometry={core} material={coreMat} />
    <Many geo={leafCard()} mat={fir()} list={parts.sprays} cast />
    <mesh geometry={parts.ribbon} material={giltMat} castShadow />
    <Many geo={bauble} mat={baubleMat} list={parts.baubles} cast />
    <Bulbs at={parts.lights} colors={[PALETTE.warm, PALETTE.warm, PALETTE.white, PALETTE.gold]} size={.035} glow={.75} />
    <group ref={starRef} position={[0, H + .25, 0]}>
      <mesh geometry={star} material={starMat} castShadow />
      <mesh geometry={star} material={starMat} rotation-y={Math.PI} />
    </group>
    <sprite material={glowMat} position={[0, H + .25, 0]} scale={[2.6, 2.6, 1]} />
    <Many geo={unit} mat={giftMat} list={gifts.box} cast />
    <Many geo={unit} mat={satin} list={gifts.ribbon} />
    <Many geo={bowGeo()} mat={satin} list={gifts.bows.map((b, i) => ({ ...b, c: gifts.ribbon[i * 2]!.c }))} />
  </group>;
}

// ------------------------------------------------------------------ candy canes

/** Candy canes lining the avenue: a striped crook, about a metre and a quarter tall. */
export function CandyCanes({ at }: { at: { p: Bulb; ry: number }[] }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector3(0, i / 20 * 1.05, 0));
    for (let i = 1; i <= 16; i++) { const a = (i / 16) * Math.PI; pts.push(new THREE.Vector3(.18 - Math.cos(a) * .18, 1.05 + Math.sin(a) * .18, 0)); }
    pts.push(new THREE.Vector3(.36, .95, 0));
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, .045, 10, false);
    return g;
  }, []);
  const mat = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d')!;
    g.fillStyle = '#fbf7f0'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = '#c8102e'; for (let i = -4; i < 16; i++) { g.beginPath(); g.moveTo(0, i * 22); g.lineTo(64, i * 22 - 28); g.lineTo(64, i * 22 - 18); g.lineTo(0, i * 22 + 10); g.closePath(); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 1); t.rotation = Math.PI / 2;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: .25, clearcoat: 1, clearcoatRoughness: .1 });
  }, []);
  const velvetMat = useMemo(velvet, []);
  const list = useMemo<Inst[]>(() => at.map(c => ({ p: c.p, q: new THREE.Quaternion().setFromAxisAngle(Y, c.ry), s: 1 })), [at]);
  const bows = useMemo<Inst[]>(() => at.map(c => { const q = new THREE.Quaternion().setFromAxisAngle(Y, c.ry); const o = new THREE.Vector3(0, .82, .05).applyQuaternion(q); return { p: [c.p[0] + o.x, c.p[1] + o.y, c.p[2] + o.z], q, s: .5 }; }), [at]);
  return <group><Many geo={geo} mat={mat} list={list} cast /><Many geo={bowGeo()} mat={velvetMat} list={bows} /></group>;
}

// ------------------------------------------------------------------ snow on roofs and lawn

/**
 * Snow lying on a material: white gathers on every face that looks up, in drifts that thin and break up toward the edges, so a
 * slate roof reads as freshly snowed on and a lawn as frosted with patches of green showing through.
 */
export function snowOn<T extends THREE.MeshStandardMaterial>(m: T, amount: number, scale = .35, key = 'snow'): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uSnow = { value: amount };
    sh.vertexShader = 'varying vec3 vSnowW; varying vec3 vSnowN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSnowW = (modelMatrix * vec4(transformed, 1.0)).xyz; vSnowN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'varying vec3 vSnowW; varying vec3 vSnowN; uniform float uSnow;\nfloat sHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat sNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sHash(i), sHash(i + vec2(1.,0.)), f.x), mix(sHash(i + vec2(0.,1.)), sHash(i + vec2(1.,1.)), f.x), f.y); }\n'
      + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float up = smoothstep(.25, .7, vSnowN.y);
        vec2 sp = vSnowW.xz * ${scale.toFixed(3)};
        float n = sNoise(sp) * .55 + sNoise(sp * 3.1 + 7.0) * .3 + sNoise(sp * 9.0 + 3.0) * .15;
        float cover = smoothstep(.62 - uSnow * .55, .78 - uSnow * .5, n + uSnow * .25) * up;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.93, .95, .99), cover);`);
  };
  m.customProgramCacheKey = () => key + amount;
  m.needsUpdate = true;
  return m;
}
