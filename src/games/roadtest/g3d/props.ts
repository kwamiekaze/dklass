/**
 * Everything on the road that is not a car: cones, gold stars, pickups, stop signs, traffic lights, gates, walkers and dogs.
 * Built once as plain three objects and pooled; each frame the actors loop hands every nearby rules-engine obstacle to the
 * matching pool. Positions are in the "world group" frame: x across, -z forward (the group itself rides along with the car).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOSE, ROAD_HALF, type Ob } from './sim';
import { glowTexture, stopSignTexture } from './textures';
import { starGeometry } from './util';

const colorize = (g: THREE.BufferGeometry, hex: string) => {
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.index) g = g.toNonIndexed();
  return g;
};
const merge = (parts: THREE.BufferGeometry[]) => {
  const ng = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const g of ng) { if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2)); }
  return mergeGeometries(ng, false)!;
};
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
}
const ZERO = (mesh: THREE.InstancedMesh, i: number) => put(mesh, i, 0, -999, 0, 0, 0, 0, 0.0001);

// ---------------------------------------------------------------- walkers ---
const OUTFITS: { shirt: string; pants: string; skin: string; hair: string }[] = [
  { shirt: '#e04a3a', pants: '#2b2f45', skin: '#f0c8a0', hair: '#3a2a20' },
  { shirt: '#2f9bb3', pants: '#3b3b40', skin: '#8d5a3b', hair: '#15110f' },
  { shirt: '#f2c14e', pants: '#4a3f6b', skin: '#d9a679', hair: '#6b3f1f' },
  { shirt: '#7fbf5f', pants: '#26324a', skin: '#5a3a28', hair: '#0e0b0a' },
  { shirt: '#d6ff00', pants: '#2c2c32', skin: '#f0c8a0', hair: '#c9a25a' },   // hi-vis vest
  { shirt: '#b04fd1', pants: '#202a44', skin: '#e0b48c', hair: '#2a1a12' },
  { shirt: '#f4f1ea', pants: '#7a5a3a', skin: '#c68a5e', hair: '#222' },
  { shirt: '#ff7a1a', pants: '#303040', skin: '#a9714a', hair: '#1a1210' },
];
function personGeos(o: (typeof OUTFITS)[number]) {
  const torso = new THREE.CapsuleGeometry(0.19, 0.34, 4, 10); torso.scale(1, 1, 0.68); torso.translate(0, 1.12, 0);
  const head = new THREE.SphereGeometry(0.14, 12, 10); head.translate(0, 1.66, 0);
  const hair = new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56); hair.translate(0, 1.675, -0.005);
  const pack = new THREE.BoxGeometry(0.28, 0.34, 0.14); pack.translate(0, 1.18, -0.16);
  const body = merge([colorize(torso, o.shirt), colorize(head, o.skin), colorize(hair, o.hair), colorize(pack, '#3a4a6a')]);
  const leg = new THREE.CapsuleGeometry(0.078, 0.5, 3, 8); leg.translate(0, -0.33, 0);
  const shoe = new THREE.BoxGeometry(0.13, 0.07, 0.24); shoe.translate(0, -0.68, 0.05);
  const legs = merge([colorize(leg, o.pants), colorize(shoe, '#1a1a1e')]);
  const arm = new THREE.CapsuleGeometry(0.052, 0.4, 3, 8); arm.translate(0, -0.25, 0);
  const hand = new THREE.SphereGeometry(0.055, 8, 6); hand.translate(0, -0.52, 0);
  const arms = merge([colorize(arm, o.shirt), colorize(hand, o.skin)]);
  return { body, legs, arms };
}

const DOGS = [
  { fur: '#8a5a32', dark: '#4a3020' }, { fur: '#1c1c20', dark: '#0c0c0e' }, { fur: '#e8dcc2', dark: '#b8a888' }, { fur: '#d4a24a', dark: '#8a6420' },
];
function dogGeos(o: (typeof DOGS)[number]) {
  const body = new THREE.BoxGeometry(0.24, 0.26, 0.62); body.translate(0, 0.42, 0);
  const head = new THREE.BoxGeometry(0.2, 0.2, 0.2); head.translate(0, 0.62, 0.38);
  const snout = new THREE.BoxGeometry(0.11, 0.1, 0.14); snout.translate(0, 0.58, 0.5);
  const earL = new THREE.BoxGeometry(0.05, 0.12, 0.07); earL.translate(0.09, 0.74, 0.34);
  const earR = earL.clone(); earR.translate(-0.18, 0, 0);
  const tail = new THREE.BoxGeometry(0.05, 0.05, 0.28); tail.rotateX(-0.6); tail.translate(0, 0.56, -0.38);
  const nose = new THREE.BoxGeometry(0.05, 0.05, 0.03); nose.translate(0, 0.6, 0.58);
  const bodyG = merge([colorize(body, o.fur), colorize(head, o.fur), colorize(snout, o.dark), colorize(earL, o.dark), colorize(earR, o.dark), colorize(tail, o.fur), colorize(nose, '#111')]);
  const leg = new THREE.BoxGeometry(0.075, 0.3, 0.075); leg.translate(0, -0.15, 0);
  return { body: bodyG, leg: colorize(leg, o.fur) };
}

function exclaimTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.fillStyle = '#f2c14e'; g.beginPath(); g.moveTo(64, 8); g.lineTo(122, 112); g.lineTo(6, 112); g.closePath(); g.fill();
  g.strokeStyle = '#101014'; g.lineWidth = 8; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = '#101014'; g.font = '700 74px "Bebas Neue", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 64, 78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

type Walker = { root: THREE.Group; inner: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; warn: THREE.Sprite; used: boolean };
type DogRig = { root: THREE.Group; inner: THREE.Group; legs: THREE.Group[]; warn: THREE.Sprite; used: boolean };

function gateTexture(kind: 'checkpoint' | 'finish' | 'best') {
  const W = 1024, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  if (kind === 'finish') {
    const s = 32; for (let i = 0; i < W / s; i++) for (let j = 0; j < H / s; j++) { g.fillStyle = (i + j) % 2 ? '#101014' : '#f4f1ea'; g.fillRect(i * s, j * s, s, s); }
    g.fillStyle = 'rgba(16,16,20,.82)'; g.fillRect(W / 2 - 250, 10, 500, H - 20);
    g.fillStyle = '#f2c14e'; g.font = '700 92px "Bebas Neue", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', W / 2, H / 2 + 4);
  } else {
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#101014'); gr.addColorStop(0.5, '#1d1b26'); gr.addColorStop(1, '#101014'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f2c14e'; g.lineWidth = 8; g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = '#f2c14e'; g.font = '700 84px "Bebas Neue", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(kind === 'best' ? '★  YOUR BEST  ★' : '★  CHECKPOINT  ★', W / 2, H / 2 + 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export interface Kit {
  root: THREE.Group;
  begin(): void;
  end(): void;
  cone(o: Ob, t: number): void;
  star(o: Ob, t: number, now: number): void;
  pickup(o: Ob, t: number, now: number): void;
  stopSign(o: Ob): void;
  light(o: Ob): void;
  gate(kind: 'checkpoint' | 'finish' | 'best', d: number, passed: boolean): void;
  walker(o: Ob, t: number): void;
  dog(o: Ob, t: number): void;
  setNight(n: number): void;
}

export function makeKit(): Kit {
  const root = new THREE.Group();
  const glowTex = glowTexture();

  // cones: a dark base, an orange body, two white stripes; one instanced mesh
  const coneGeo = (() => {
    const base = new THREE.BoxGeometry(0.62, 0.05, 0.62); base.translate(0, 0.025, 0);
    const body = new THREE.CylinderGeometry(0.055, 0.25, 0.7, 16); body.translate(0, 0.05 + 0.35, 0);
    const rr = (h: number) => 0.25 - 0.195 * (h / 0.7);
    const s1 = new THREE.CylinderGeometry(rr(0.31) + 0.01, rr(0.19) + 0.01, 0.12, 16); s1.translate(0, 0.05 + 0.25, 0);
    const s2 = new THREE.CylinderGeometry(rr(0.55) + 0.01, rr(0.43) + 0.01, 0.12, 16); s2.translate(0, 0.05 + 0.49, 0);
    return merge([colorize(base, '#202026'), colorize(body, '#ff6a13'), colorize(s1, '#f6f3ec'), colorize(s2, '#f6f3ec')]);
  })();
  const coneMesh = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), 48);
  coneMesh.frustumCulled = false; coneMesh.castShadow = true; root.add(coneMesh);
  let nCone = 0;

  // stars: gold, metallic, with a soft halo behind each
  const starMesh = new THREE.InstancedMesh(starGeometry(), new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.85, roughness: 0.28, emissive: '#a06a00', emissiveIntensity: 0.7 }), 40);
  starMesh.frustumCulled = false; root.add(starMesh);
  const haloGeo = new THREE.PlaneGeometry(2.4, 2.4);
  const haloMesh = new THREE.InstancedMesh(haloGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffd45e', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), 40);
  haloMesh.frustumCulled = false; root.add(haloMesh);
  let nStar = 0;

  // pickups: magnet (a red horseshoe with silver tips) and shield (blue with a gold rim), each on a gold beacon
  const magnetGeo = (() => {
    const arch = new THREE.TorusGeometry(0.4, 0.13, 10, 20, Math.PI); arch.translate(0, 0.22, 0);
    const tipL = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 12); tipL.translate(0.4, 0.09, 0);
    const tipR = tipL.clone(); tipR.translate(-0.8, 0, 0);
    const capL = new THREE.CylinderGeometry(0.135, 0.135, 0.12, 12); capL.translate(0.4, -0.08, 0);
    const capR = capL.clone(); capR.translate(-0.8, 0, 0);
    return merge([colorize(arch, '#d7263d'), colorize(tipL, '#d9dde3'), colorize(tipR, '#d9dde3'), colorize(capL, '#f2f2f4'), colorize(capR, '#f2f2f4')]);
  })();
  const shieldGeo = (() => {
    const mk = (k: number) => {
      const s = new THREE.Shape();
      s.moveTo(0, 0.5 * k); s.bezierCurveTo(0.42 * k, 0.46 * k, 0.5 * k, 0.4 * k, 0.5 * k, 0.28 * k); s.bezierCurveTo(0.5 * k, -0.16 * k, 0.26 * k, -0.4 * k, 0, -0.52 * k);
      s.bezierCurveTo(-0.26 * k, -0.4 * k, -0.5 * k, -0.16 * k, -0.5 * k, 0.28 * k); s.bezierCurveTo(-0.5 * k, 0.4 * k, -0.42 * k, 0.46 * k, 0, 0.5 * k);
      return s;
    };
    const rim = new THREE.ExtrudeGeometry(mk(1), { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); rim.translate(0, 0, -0.05);
    const face = new THREE.ExtrudeGeometry(mk(0.82), { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.03, bevelSegments: 2 }); face.translate(0, 0, 0.0);
    const star = starGeometry(0.24, 0.1, 0.06); star.translate(0, 0.02, 0.1);
    return merge([colorize(rim, '#f2c14e'), colorize(face, '#2f6fed'), colorize(star, '#fff3c4')]);
  })();
  const pickMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.35, emissive: '#443300', emissiveIntensity: 0.6 });
  const magnetMesh = new THREE.InstancedMesh(magnetGeo, pickMat, 6); magnetMesh.frustumCulled = false; root.add(magnetMesh);
  const shieldMesh = new THREE.InstancedMesh(shieldGeo, pickMat, 6); shieldMesh.frustumCulled = false; root.add(shieldMesh);
  const beamGeo = (() => { const g = new THREE.CylinderGeometry(0.55, 0.55, 8, 20, 1, true); g.translate(0, 4, 0); return g; })();
  const beamMesh = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffd45e', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), 14);
  beamMesh.frustumCulled = false; root.add(beamMesh);
  let nMag = 0, nShield = 0, nBeam = 0;

  // stop signs: a grey pole and the red octagon; the stop line is a white bar across the road
  const stopFace = new THREE.CircleGeometry(0.46, 8, Math.PI / 8);
  const stopTex = stopSignTexture();
  const poolOf = <T,>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));
  const signs = poolOf(3, () => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.1, 8), new THREE.MeshStandardMaterial({ color: '#8d9099', metalness: 0.6, roughness: 0.4 })); pole.position.y = 1.55; g.add(pole);
    const face = new THREE.Mesh(stopFace, new THREE.MeshStandardMaterial({ map: stopTex, roughness: 0.45 })); face.position.set(0, 2.85, 0.05); g.add(face);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.46, 8, Math.PI / 8), new THREE.MeshStandardMaterial({ color: '#777b84' })); back.rotation.y = Math.PI; back.position.set(0, 2.85, 0.04); g.add(back);
    g.visible = false; root.add(g); return { g, used: false };
  });
  const lineGeo = new THREE.PlaneGeometry(ROAD_HALF * 2, 0.5); lineGeo.rotateX(-Math.PI / 2);
  const lineMat = new THREE.MeshBasicMaterial({ color: '#f4f1ea', transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const lines = poolOf(6, () => { const m = new THREE.Mesh(lineGeo, lineMat); m.visible = false; m.position.y = 0.02; root.add(m); return { m, used: false }; });

  // traffic lights: a mast over the road with a three-lamp head, plus a head on the pole
  const lensGeo = new THREE.CircleGeometry(0.15, 20);
  const lights = poolOf(3, () => {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: '#16161c', roughness: 0.5, metalness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 6.2, 10), dark); pole.position.y = 3.1; g.add(pole);
    const gold = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.14, 10), new THREE.MeshStandardMaterial({ color: '#c9971f', metalness: 0.85, roughness: 0.3 })); gold.position.y = 1.2; g.add(gold);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.1), dark); arm.position.set(0.5, 6.0, 0); arm.userData.arm = true; g.add(arm);
    const heads: { lenses: THREE.Mesh[]; halos: THREE.Sprite[] }[] = [];
    const mkHead = (x: number, y: number) => {
      const h = new THREE.Group(); h.position.set(x, y, 0);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.32, 0.34), dark); h.add(box);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), dark); hood.position.set(0, 0.69, 0.04); h.add(hood);
      const lenses: THREE.Mesh[] = [], halos: THREE.Sprite[] = [];
      ['#ff2a1a', '#ffb300', '#29e069'].forEach((c, i) => {
        const l = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); l.position.set(0, 0.42 - i * 0.42, 0.175); h.add(l); lenses.push(l);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.scale.set(1.5, 1.5, 1); s.position.set(0, 0.42 - i * 0.42, 0.3); h.add(s); halos.push(s);
      });
      g.add(h); heads.push({ lenses, halos });
    };
    mkHead(0.0, 5.0);
    mkHead(0.0, 5.0);   // replaced below: the mast head is positioned per use
    g.visible = false; root.add(g); return { g, heads, arm, used: false };
  });
  // the second head hangs at the end of the mast arm: placed when the light is placed (the arm length depends on the side)

  // gates
  const gateTex = { checkpoint: gateTexture('checkpoint'), finish: gateTexture('finish'), best: gateTexture('best') };
  const gateMk = (kind: 'checkpoint' | 'finish' | 'best') => {
    const g = new THREE.Group();
    const post = new THREE.MeshStandardMaterial({ color: '#16161c', metalness: 0.6, roughness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: '#c9971f', metalness: 0.85, roughness: 0.3 });
    [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6.4, 0.4), post); p.position.set(s * (ROAD_HALF + 0.55), 3.2, 0); g.add(p); const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), gold); c.position.set(s * (ROAD_HALF + 0.55), 6.5, 0); g.add(c); });
    const bw = ROAD_HALF * 2 + 1.1;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 8), new THREE.MeshStandardMaterial({ map: gateTex[kind], emissiveMap: gateTex[kind], emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide })); banner.position.set(0, 5.9, 0); g.add(banner);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.22, 0.3), gold); bar.position.set(0, 6.55, 0); g.add(bar);
    // a pool of gold light on the road
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.2), new THREE.MeshBasicMaterial({ color: kind === 'finish' ? '#f4f1ea' : '#f2c14e', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.025; g.add(floor);
    g.visible = false; root.add(g); return { g, used: false, banner };
  };
  const gates = { checkpoint: poolOf(4, () => gateMk('checkpoint')), finish: [gateMk('finish')], best: [gateMk('best')] };

  // walkers
  const personGeoSets = OUTFITS.map(personGeos);
  const personMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const warnTex = exclaimTexture();
  const walkers: Walker[] = poolOf(16, (i) => {
    const gs = personGeoSets[i % OUTFITS.length]!;
    const rootG = new THREE.Group(), inner = new THREE.Group(); rootG.add(inner);
    const body = new THREE.Mesh(gs.body, personMat); body.castShadow = true; inner.add(body);
    const mkLimb = (geo: THREE.BufferGeometry, x: number, y: number) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(new THREE.Mesh(geo, personMat)); inner.add(p); return p; };
    const legL = mkLimb(gs.legs, -0.1, 0.86), legR = mkLimb(gs.legs, 0.1, 0.86);
    const armL = mkLimb(gs.arms, -0.27, 1.4), armR = mkLimb(gs.arms, 0.27, 1.4);
    const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex, transparent: true, depthWrite: false, toneMapped: false })); warn.scale.set(0.62, 0.62, 1); warn.position.y = 2.25; warn.visible = false; rootG.add(warn);
    rootG.visible = false; root.add(rootG);
    return { root: rootG, inner, legL, legR, armL, armR, warn, used: false };
  });
  const dogMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const dogGeoSets = DOGS.map(dogGeos);
  const dogs: DogRig[] = poolOf(8, (i) => {
    const gs = dogGeoSets[i % DOGS.length]!;
    const rootG = new THREE.Group(), inner = new THREE.Group(); rootG.add(inner);
    inner.add(new THREE.Mesh(gs.body, dogMat));
    const legs = [[-0.08, 0.3], [0.08, 0.3], [-0.08, -0.22], [0.08, -0.22]].map(([x, z]) => { const p = new THREE.Group(); p.position.set(x!, 0.3, z!); p.add(new THREE.Mesh(gs.leg, dogMat)); inner.add(p); return p; });
    const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex, transparent: true, depthWrite: false, toneMapped: false })); warn.scale.set(0.55, 0.55, 1); warn.position.y = 1.35; warn.visible = false; rootG.add(warn);
    rootG.visible = false; root.add(rootG);
    return { root: rootG, inner, legs, warn, used: false };
  });
  let nWalk = 0, nDog = 0, nSign = 0, nLine = 0, nLight = 0;
  const gateUse = { checkpoint: 0, finish: 0, best: 0 };
  let night = 0;

  const coneTumble = (o: Ob) => {
    const f = o.fly!; const t = f.t;
    const y = Math.max(0, 2.6 * t - 5 * t * t);
    const lying = t > 0.5;
    return { y, rx: lying ? 0 : t * f.spin * 0.7, rz: lying ? Math.PI / 2 * Math.sign(f.vx || 1) : -t * f.spin * Math.sign(f.vx || 1), lift: lying ? 0.2 : 0 };
  };

  return {
    root,
    setNight(n) { night = n; },
    begin() {
      nCone = nStar = nMag = nShield = nBeam = nWalk = nDog = nSign = nLine = nLight = 0; gateUse.checkpoint = gateUse.finish = gateUse.best = 0;
    },
    end() {
      for (let i = nCone; i < coneMesh.count; i++) ZERO(coneMesh, i);
      for (let i = nStar; i < starMesh.count; i++) { ZERO(starMesh, i); ZERO(haloMesh, i); }
      for (let i = nMag; i < magnetMesh.count; i++) ZERO(magnetMesh, i);
      for (let i = nShield; i < shieldMesh.count; i++) ZERO(shieldMesh, i);
      for (let i = nBeam; i < beamMesh.count; i++) ZERO(beamMesh, i);
      coneMesh.instanceMatrix.needsUpdate = starMesh.instanceMatrix.needsUpdate = haloMesh.instanceMatrix.needsUpdate = magnetMesh.instanceMatrix.needsUpdate = shieldMesh.instanceMatrix.needsUpdate = beamMesh.instanceMatrix.needsUpdate = true;
      for (let i = nWalk; i < walkers.length; i++) walkers[i]!.root.visible = false;
      for (let i = nDog; i < dogs.length; i++) dogs[i]!.root.visible = false;
      for (let i = nSign; i < signs.length; i++) signs[i]!.g.visible = false;
      for (let i = nLine; i < lines.length; i++) lines[i]!.m.visible = false;
      for (let i = nLight; i < lights.length; i++) lights[i]!.g.visible = false;
      (['checkpoint', 'finish', 'best'] as const).forEach((k) => { for (let i = gateUse[k]; i < gates[k].length; i++) gates[k][i]!.g.visible = false; });
    },
    cone(o, t) {
      if (nCone >= coneMesh.count) return;
      if (o.fly) {
        const k = coneTumble(o);
        if (o.fly.t > 2.5) return;
        put(coneMesh, nCone++, o.x, k.y + k.lift, -o.d, k.rx, 0, k.rz, 1);
      } else put(coneMesh, nCone++, o.x, 0, -o.d, 0, 0, 0, 1);
      void t;
    },
    star(o, t, now) {
      if (nStar >= starMesh.count) return;
      let sc = 1, y = 1.15 + Math.sin(t * 2.4 + o.id) * 0.13;
      if (o.resolved) { const a = now - (o.goneAt ?? now); if (a > 0.3) return; sc = 1 + a * 3; y += a * 5; sc *= 1 - a / 0.3; }
      put(starMesh, nStar, o.x, y, -o.d, 0, t * 2.2 + o.id, 0, 0.82 * sc);
      put(haloMesh, nStar, o.x, y, -o.d + 0.1, 0, 0, 0, sc * 0.9);
      nStar++;
    },
    pickup(o, t, now) {
      let sc = 1, y = 1.35 + Math.sin(t * 2.1 + o.id) * 0.1;
      if (o.resolved) { const a = now - (o.goneAt ?? now); if (a > 0.35) return; y += a * 6; sc = Math.max(0, 1 - a / 0.35) * (1 + a * 2); }
      if (o.type === 'magnet') { if (nMag < magnetMesh.count) put(magnetMesh, nMag++, o.x, y, -o.d, Math.PI, t * 1.6, 0, 1.1 * sc); }
      else if (nShield < shieldMesh.count) put(shieldMesh, nShield++, o.x, y, -o.d, 0, Math.sin(t * 1.4) * 0.6, 0, 1.5 * sc);
      if (!o.resolved && nBeam < beamMesh.count) put(beamMesh, nBeam++, o.x, 0, -o.d, 0, 0, 0, 1);
    },
    stopSign(o) {
      if (nSign >= signs.length) return;
      const s = signs[nSign++]!; s.g.visible = true; s.g.position.set(o.x, 0, -(o.d + NOSE + 0.6));
      if (nLine < lines.length) { const l = lines[nLine++]!; l.m.visible = true; l.m.position.set(0, 0.02, -(o.d + NOSE)); }
    },
    light(o) {
      if (nLight >= lights.length) return;
      const L = lights[nLight++]!; L.g.visible = true; L.g.position.set(o.x, 0, -(o.d + NOSE + 0.6));
      // the mast arm reaches out over the road; one head hangs at its end (over the middle lane), one sits on the pole
      const reach = Math.abs(o.x) - 0.2; L.arm.scale.x = reach; L.arm.position.x = -Math.sign(o.x) * reach / 2;
      L.heads[0]!.lenses[0]!.parent!.position.set(-Math.sign(o.x) * reach, 5.2, 0);
      L.heads[1]!.lenses[0]!.parent!.position.set(-Math.sign(o.x) * 0.38, 4.1, 0.05);
      const st = o.state ?? 'green';
      for (const h of L.heads) h.lenses.forEach((m, i) => {
        const on = (i === 0 && st === 'red') || (i === 1 && st === 'yellow') || (i === 2 && st === 'green');
        (m.material as THREE.MeshBasicMaterial).color.set(['#ff2a1a', '#ffb300', '#29e069'][i]!).multiplyScalar(on ? 1.8 : 0.1);
        (h.halos[i]!.material as THREE.SpriteMaterial).opacity = on ? 0.9 : 0;
      });
      if (nLine < lines.length) { const l = lines[nLine++]!; l.m.visible = true; l.m.position.set(0, 0.02, -(o.d + NOSE)); }
    },
    gate(kind, d, passed) {
      const pool = gates[kind]; const i = gateUse[kind]; if (i >= pool.length) return; gateUse[kind]++;
      const G = pool[i]!; G.g.visible = true; G.g.position.set(0, 0, -d);
      (G.banner.material as THREE.MeshStandardMaterial).emissiveIntensity = passed ? 0.2 : 0.6 + night * 0.5;
    },
    walker(o, t) {
      if (nWalk >= walkers.length) return;
      const w = walkers[nWalk++]!; w.root.visible = true;
      const kid = o.look % 5 === 0, sc = kid ? 0.78 : 0.94 + (o.look % 7) * 0.014;
      w.root.scale.setScalar(sc);
      let yaw = 0, swing = 0, wait = false;
      if (o.stroll) { yaw = (o.strollV ?? 0) > 0 ? Math.PI : 0; swing = 0.55; }
      else if ((o.telegraph ?? 0) > 0) { yaw = o.x < 0 ? Math.PI / 2 : -Math.PI / 2; wait = true; }
      else if (o.mph != null && !o.crossed) { yaw = o.mph > 0 ? Math.PI / 2 : -Math.PI / 2; swing = 0.8; }
      else yaw = o.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      w.root.position.set(o.x, 0, -o.d); w.root.rotation.y = yaw;
      const ph = o.walk ?? 0, s = Math.sin(ph * 1.7) * swing;
      w.legL.rotation.x = s; w.legR.rotation.x = -s; w.armL.rotation.x = -s * 0.85; w.armR.rotation.x = s * 0.85;
      w.inner.position.y = Math.abs(Math.sin(ph * 1.7)) * 0.035 * (swing ? 1 : 0);
      w.inner.rotation.z = wait ? Math.sin(t * 3 + o.id) * 0.04 : 0;
      if (wait) { w.armR.rotation.x = -2.5 + Math.sin(t * 6) * 0.25; }   // a hand up: "wait, I'm going"
      w.warn.visible = wait; if (wait) w.warn.position.y = (kid ? 1.85 : 2.25) + Math.sin(t * 8) * 0.05;
      if (o.fly) { const f = o.fly; w.root.position.x += 0; w.root.position.y = Math.max(0, 2.4 * f.t - 5 * f.t * f.t); w.root.rotation.x = Math.min(1.5, f.t * f.spin * 0.4); }
    },
    dog(o, t) {
      if (nDog >= dogs.length) return;
      const d = dogs[nDog++]!; d.root.visible = true;
      let yaw = 0, run = 0, wait = false;
      if (o.stroll) { yaw = (o.strollV ?? 0) > 0 ? Math.PI : 0; run = 0.5; }
      else if ((o.telegraph ?? 0) > 0) { yaw = o.x < 0 ? Math.PI / 2 : -Math.PI / 2; wait = true; }
      else if (o.mph != null && !o.crossed) { yaw = o.mph > 0 ? Math.PI / 2 : -Math.PI / 2; run = 1; }
      else yaw = o.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      d.root.position.set(o.x, 0, -o.d); d.root.rotation.y = yaw;
      const s = Math.sin((o.walk ?? 0) * 1.4) * 0.9 * run;
      d.legs[0]!.rotation.x = s; d.legs[1]!.rotation.x = -s; d.legs[2]!.rotation.x = -s; d.legs[3]!.rotation.x = s;
      d.inner.position.y = Math.abs(Math.sin((o.walk ?? 0) * 1.4)) * 0.05 * run;
      d.warn.visible = wait; if (wait) d.warn.position.y = 1.3 + Math.sin(t * 9) * 0.05;
      if (o.fly) { const f = o.fly; d.root.position.y = Math.max(0, 2.2 * f.t - 5 * f.t * f.t); d.root.rotation.z = Math.min(1.5, f.t * f.spin * 0.4); }
    },
  };
}
