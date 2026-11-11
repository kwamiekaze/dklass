import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Real butterflies of a Georgia garden, painted wing by wing: the Monarch, the Eastern Tiger Swallowtail (the state butterfly),
 * the Gulf Fritillary, the Red-spotted Purple and the Cabbage White. Each wing pair is one small painted texture (scales, veins,
 * margins, spots, the swallowtail's tails), cut out by its own alpha, on a body with a head, thorax, tapering abdomen and two
 * clubbed antennae. They fly the way butterflies do: a few quick beats, a short glide with the wings held up in a V, the body
 * pitching with every stroke.
 */
type Species = 'monarch' | 'swallowtail' | 'fritillary' | 'purple' | 'white';
const SPECIES: Species[] = ['monarch', 'swallowtail', 'fritillary', 'purple', 'white'];

/** One side's wings, seen from above: the body runs up the left edge, the head is toward the top. */
function wingTexture(kind: Species) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  const fore = () => { g.beginPath(); g.moveTo(4, 128); g.bezierCurveTo(20, 60, 120, 6, 236, 14); g.bezierCurveTo(250, 40, 232, 96, 176, 132); g.bezierCurveTo(120, 150, 50, 146, 4, 128); g.closePath(); };
  const hind = () => {
    g.beginPath(); g.moveTo(4, 126); g.bezierCurveTo(60, 120, 150, 122, 178, 150);
    if (kind === 'swallowtail') { g.bezierCurveTo(196, 180, 176, 214, 150, 222); g.bezierCurveTo(150, 236, 142, 250, 128, 254); g.bezierCurveTo(124, 244, 126, 232, 122, 226); g.bezierCurveTo(80, 232, 30, 200, 4, 150); }
    else { g.bezierCurveTo(198, 184, 168, 232, 112, 236); g.bezierCurveTo(60, 236, 22, 196, 4, 150); }
    g.closePath();
  };
  const P: Record<Species, { a: string; b: string; edge: string; vein: string; spots: string }> = {
    monarch: { a: '#f7a11a', b: '#e0590c', edge: '#120a06', vein: 'rgba(18,10,6,.95)', spots: '#fffaf0' },
    swallowtail: { a: '#ffe14a', b: '#f4c21e', edge: '#0e0a06', vein: 'rgba(20,14,6,.7)', spots: '#ffe14a' },
    fritillary: { a: '#ff8a1e', b: '#e8590a', edge: '#2a1206', vein: 'rgba(42,18,6,.8)', spots: '#1c0c04' },
    purple: { a: '#16284e', b: '#0a0e1c', edge: '#05060c', vein: 'rgba(4,6,12,.8)', spots: '#58c8f4' },
    white: { a: '#fdfdf4', b: '#eef0dc', edge: '#3a3a36', vein: 'rgba(120,124,104,.5)', spots: '#2a2a28' },
  };
  const p = P[kind];
  const paint = (shape: () => void, isFore: boolean) => {
    g.save(); shape(); g.clip();
    const gr = g.createRadialGradient(4, 128, 6, 4, 128, 240); gr.addColorStop(0, p.b); gr.addColorStop(.25, p.a); gr.addColorStop(1, p.b); g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // the scales: a fine grain that catches light
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},${.03 + (i % 7) * .008})`; g.fillRect((i * 97) % S, (i * 57) % S, 2, 1); }
    if (kind === 'swallowtail') {
      // four black tiger stripes across the forewing, one down the hindwing
      g.fillStyle = p.edge; if (isFore) [[40, 10], [80, 9], [118, 8], [152, 6]].forEach(([x, w]) => { g.save(); g.translate(x!, 0); g.rotate(.2); g.fillRect(0, 0, w!, 150); g.restore(); }); else { g.save(); g.translate(30, 120); g.rotate(-.5); g.fillRect(0, 0, 9, 110); g.restore(); }
    }
    if (kind === 'purple' && !isFore) { const sh = g.createRadialGradient(110, 190, 4, 110, 190, 90); sh.addColorStop(0, 'rgba(70,170,255,.85)'); sh.addColorStop(1, 'rgba(40,90,220,0)'); g.fillStyle = sh; g.fillRect(0, 110, S, 146); }
    // veins fan out from the root
    g.strokeStyle = p.vein; g.lineCap = 'round';
    const n = isFore ? 8 : 7;
    for (let i = 0; i < n; i++) { const a = isFore ? -1.05 + i * .17 : .12 + i * .2, L = 250; g.lineWidth = kind === 'monarch' ? 4.2 : 2; g.beginPath(); g.moveTo(4, 128); g.quadraticCurveTo(4 + Math.cos(a) * L * .5, 128 + Math.sin(a) * L * .42, 4 + Math.cos(a) * L, 128 + Math.sin(a) * L * .9); g.stroke(); }
    if (kind === 'monarch') { g.lineWidth = 3; g.beginPath(); if (isFore) { g.moveTo(70, 70); g.quadraticCurveTo(110, 96, 96, 138); } else { g.moveTo(60, 150); g.quadraticCurveTo(110, 160, 120, 200); } g.stroke(); }
    // the dark margin, then its rows of spots
    shape(); g.strokeStyle = p.edge; g.lineWidth = kind === 'white' ? 5 : kind === 'fritillary' ? 14 : 34; g.stroke();
    if (kind === 'monarch' && isFore) { g.fillStyle = p.edge; g.beginPath(); g.moveTo(150, 0); g.lineTo(256, 0); g.lineTo(256, 90); g.lineTo(200, 100); g.closePath(); g.fill(); g.fillStyle = '#f9b23c'; [[176, 44], [198, 60], [206, 34]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x!, y!, 9, 5, .5, 0, 7); g.fill(); }); }
    if (kind === 'white' && isFore) { g.fillStyle = 'rgba(58,58,54,.85)'; g.beginPath(); g.moveTo(190, 6); g.lineTo(256, 0); g.lineTo(250, 60); g.closePath(); g.fill(); g.fillStyle = p.spots; g.beginPath(); g.arc(150, 84, 8, 0, 7); g.fill(); }
    if (kind === 'fritillary') { g.fillStyle = p.spots; (isFore ? [[70, 86], [104, 66], [140, 54], [96, 110], [150, 96], [186, 70]] : [[70, 160], [110, 170], [140, 196], [90, 200]]).forEach(([x, y]) => { g.beginPath(); g.ellipse(x!, y!, 7, 5, .3, 0, 7); g.fill(); }); }
    g.restore();
    // spots sit in the margin, following the outer edge
    if (kind === 'monarch' || kind === 'swallowtail' || kind === 'purple') {
      g.save(); shape(); g.clip(); g.fillStyle = p.spots;
      const pts: [number, number][] = isFore ? [[228, 30], [232, 50], [226, 70], [212, 90], [194, 108], [172, 124], [140, 136]] : kind === 'swallowtail' ? [[174, 160], [178, 184], [164, 206], [108, 222], [70, 212], [40, 186]] : [[176, 162], [180, 188], [166, 212], [140, 226], [108, 228], [76, 220], [46, 198]];
      pts.forEach(([x, y], i) => { g.beginPath(); g.ellipse(x - 5, y, kind === 'monarch' ? 3.6 : 5.5, kind === 'monarch' ? 3.6 : 4, 0, 0, 7); g.fill(); if (kind === 'monarch' && i % 2 === 0) { g.beginPath(); g.arc(x - 15, y + 2, 2.6, 0, 7); g.fill(); } });
      if (kind === 'swallowtail' && !isFore) { g.fillStyle = '#3f7fe0'; [[150, 196], [124, 210], [92, 208]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x!, y!, 8, 5, 0, 0, 7); g.fill(); }); g.fillStyle = '#f0661a'; g.beginPath(); g.arc(34, 172, 6, 0, 7); g.fill(); }
      g.restore();
    }
  };
  paint(hind, false); paint(fore, true);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const wingMats = new Map<Species, THREE.MeshStandardMaterial>();
const wingMat = (k: Species) => { let m = wingMats.get(k); if (!m) { const t = wingTexture(k); m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: .15, alphaTest: .5, side: THREE.DoubleSide, roughness: .62, metalness: 0 }); wingMats.set(k, m); } return m; };
let wingGeos: [THREE.BufferGeometry, THREE.BufferGeometry] | null = null;
/** A wing pair as a lightly cupped sheet hinged on the body: u runs out from the body, v from tail to head. */
function wings() {
  if (wingGeos) return wingGeos;
  const mk = (side: 1 | -1) => { const g = new THREE.PlaneGeometry(1, 1, 3, 1), p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const u = uv.getX(i), v = uv.getY(i); p.setXYZ(i, v - .5, Math.sin(u * Math.PI) * .05, side * u); }
    g.computeVertexNormals(); return g; };
  return (wingGeos = [mk(1), mk(-1)]);
}
const bodyMat = new THREE.MeshStandardMaterial({ color: '#17120e', roughness: .8 });
const fuzzMat = new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1 });

type Fly = { active: boolean; t: number; dur: number; a: THREE.Vector3; b: THREE.Vector3; y: number; ph: number; wob: number; speed: number };

function Butterfly({ index, api }: { index: number; api: React.MutableRefObject<Fly[]> }) {
  const root = useRef<THREE.Group>(null), l = useRef<THREE.Group>(null), r = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const kind = SPECIES[index % SPECIES.length]!;
  const mat = useMemo(() => wingMat(kind), [kind]), [gl, gr] = useMemo(wings, []);
  const size = kind === 'white' ? .32 : kind === 'swallowtail' ? .5 : .42;
  const prev = useRef(new THREE.Vector3()), p = useMemo(() => new THREE.Vector3(), []), d = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const f = api.current[index]!, g = root.current; if (!g) return;
    if (!f.active) { g.visible = false; return; }
    g.visible = true; f.t += dt;
    const u = f.t / f.dur;
    if (u >= 1) { f.active = false; return; }
    // a butterfly beats in bursts and glides between them, wings held up in a shallow V
    const cyc = (f.t * .55 + f.ph) % 1, beating = cyc < .68, w = f.t * (kind === 'white' ? 26 : 19) + f.ph * 5;
    const beat = Math.sin(w), flap = beating ? .2 + beat * 1.05 : .5 + Math.sin(f.t * 3) * .06;
    p.lerpVectors(f.a, f.b, u);
    p.y = f.y + Math.sin(f.t * 1.3 + f.ph) * 1.1 + Math.sin(f.t * 3.1) * .18 + (beating ? -beat * .05 : 0);
    p.z += Math.sin(f.t * .8 + f.ph) * f.wob;
    d.copy(p).sub(prev.current);
    if (d.lengthSq() > 1e-6) { g.rotation.y = Math.atan2(-d.z, d.x); g.rotation.z = THREE.MathUtils.clamp(d.y * 6, -.5, .5) + (beating ? beat * .1 : 0); }
    prev.current.copy(p); g.position.copy(p);
    if (l.current) l.current.rotation.x = -flap; if (r.current) r.current.rotation.x = flap;
    if (body.current) body.current.rotation.z = beating ? -beat * .08 : 0;
  });
  return <group ref={root} visible={false} scale={size}>
    <group ref={body}>
      <mesh rotation-z={Math.PI / 2} position={[.07, 0, 0]} material={fuzzMat}><capsuleGeometry args={[.042, .12, 4, 10]} /></mesh>
      <mesh rotation-z={Math.PI / 2} position={[-.17, -.005, 0]} scale={[1, 1, .9]} material={bodyMat}><coneGeometry args={[.034, .36, 10]} /></mesh>
      <mesh position={[.19, .005, 0]} material={bodyMat}><sphereGeometry args={[.036, 10, 8]} /></mesh>
      {[1, -1].map(s => <group key={s} position={[.21, .02, s * .015]} rotation={[s * -.5, 0, -.5]}>
        <mesh rotation-z={-Math.PI / 2} position={[.11, 0, 0]} material={bodyMat}><cylinderGeometry args={[.004, .004, .22, 4]} /></mesh>
        <mesh position={[.225, 0, 0]} material={bodyMat}><sphereGeometry args={[.011, 6, 5]} /></mesh>
      </group>)}
    </group>
    <group ref={l}><mesh geometry={gl} material={mat} position={[.02, .02, .02]} /></group>
    <group ref={r}><mesh geometry={gr} material={mat} position={[.02, .02, -.02]} /></group>
  </group>;
}

/** Butterflies cross the whole scene every so often. */
export function Butterflies({ count = 8 }: { count?: number }) {
  const api = useRef<Fly[]>(Array.from({ length: Math.min(8, count) }).map(() => ({ active: false, t: 0, dur: 20, a: new THREE.Vector3(), b: new THREE.Vector3(), y: 3, ph: 0, wob: 2, speed: 3 })));
  const timer = useRef(2);
  const demo = useRef(import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('bfly'));
  useFrame((_, dt) => {
    if (demo.current) {   // dev only (?bfly): hold one of each species in front of the opening view, to check the artwork
      demo.current = false; timer.current = 1e9;
      api.current.slice(0, 5).forEach((f, i) => { f.active = true; f.t = 0; f.dur = 1e6; f.a.set(-13.4 + i * .85, 0, 29); f.b.set(4000, 0, 29); f.y = 5.9 + (i % 2) * .7; f.ph = i * 1.3; f.wob = .3; });
    }
    timer.current -= dt;
    if (timer.current > 0) return;
    timer.current = 7 + Math.random() * 10;
    const n = 1 + Math.floor(Math.random() * 3);
    const left = Math.random() > .5, z0 = -10 + Math.random() * 26;
    for (let i = 0; i < n; i++) {
      const f = api.current.find(x => !x.active); if (!f) break;
      const ex = 46;
      f.active = true; f.t = -i * .9; f.dur = 20 + Math.random() * 8;
      f.a.set(left ? -ex : ex, 0, z0 + i * 1.6); f.b.set(left ? ex : -ex, 0, z0 + (Math.random() - .5) * 14);
      f.y = 2.2 + Math.random() * 5; f.ph = Math.random() * 6; f.wob = 1.5 + Math.random() * 3;
    }
  });
  return <group>{api.current.map((_, i) => <Butterfly key={i} index={i} api={api} />)}</group>;
}
