import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx, rng } from './theme';

/** True on any concrete or stone surface, grown by `margin` so leaning blades never overhang it. */
export function paved(x: number, z: number, margin = 0) {
  if (Math.abs(x) < 34.6 + margin && z > -15.4 - margin && z < 14.7 + margin) return true;   // lot, terrace, islands
  if (Math.abs(x) < 25 + margin && z < -14 + margin && z > -30) return true;                // plinth and building
  if (Math.abs(x) < 34.6 + margin && z < -26 + margin && z > -54.2 - margin) return true;   // the back lot
  if (Math.abs(Math.abs(x) - 31.7) < 2.9 + margin && z < -14.5 + margin && z > -26.5 - margin) return true;   // the two roads that lead to it
  if (z > 14.4 - margin && z < 35.2 + margin) return true;                                  // sidewalks and street
  if (Math.abs(x) < 6 + margin && z > 14) return true;                                       // the avenue
  return false;
}

/** Mown lawn texture with alternating stripes and blade level noise. */
export function lawnTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d')!; const r = rng(31);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#5d8a4a' : '#6b9954'; g.fillRect(0, i * 64, 1024, 64); }
  const img = g.getImageData(0, 0, 1024, 1024); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * 26; d[i] += n * .7; d[i + 1] += n; d[i + 2] += n * .6; }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${r() > .5 ? '150,190,90' : '40,80,40'},.25)`; g.fillRect(r() * 1024, r() * 1024, 2, 3 + r() * 6); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/** Thousands of swaying blades in one draw call. */
export function Grass({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);
  const geo = useMemo(() => {
    const w = .022, v = [-w, 0, 0, w, 0, 0, -w * .7, .5, 0, w * .7, .5, 0, 0, 1, 0];
    const col: number[] = []; [0, 0, .5, .5, 1].forEach(h => { const a = .35 + h * .65; col.push(.16 * a + .05, .34 * a + .08, .1 * a + .03); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]); g.computeVertexNormals(); return g;
  }, []);
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
        float sw = sin(uTime * 1.5 + wp.x * .4 + wp.z * .27) * .55 + sin(uTime * 2.4 + wp.z * .8 + wp.x * .2) * .25;
        transformed.x += sw * position.y * position.y * .55; transformed.z += sw * position.y * position.y * .25;`);
    };
    return m;
  }, [time]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return; const r = rng(77); const d = new THREE.Object3D(); const c = new THREE.Color(); let n = 0;
    while (n < count) {
      const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 44, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (paved(x, z, .9)) continue;
      d.position.set(x, 0, z); d.rotation.set((r() - .5) * .35, r() * Math.PI * 2, (r() - .5) * .35);
      const h = .38 + r() * .5; d.scale.set(1 + r() * .8, h, 1); d.updateMatrix(); m.setMatrixAt(n, d.matrix);
      c.setHSL(.24 + r() * .06, .5 + r() * .2, .78 + r() * .5); m.setColorAt(n, c); n++;
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [count]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  return <instancedMesh ref={ref} args={[geo, mat, count]} frustumCulled={false} receiveShadow />;
}

let leafTex: THREE.CanvasTexture | null = null;
/** A cluster of individual leaves on a transparent card, used for every tree and bush. */
export function leafCluster() {
  if (leafTex) return leafTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!; const r = rng(123);
  for (let i = 0; i < 230; i++) {
    const a = r() * Math.PI * 2, q = Math.pow(r(), .6) * S * .43, x = S / 2 + Math.cos(a) * q, y = S / 2 + Math.sin(a) * q * .9;
    const l = 70 + r() * 70; const sh = Math.floor(l);
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.fillStyle = `rgb(${sh},${sh},${sh})`; g.beginPath(); g.ellipse(0, 0, 9 + r() * 7, 4 + r() * 3, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke();
    g.restore();
  }
  // brighter leaves on the top edge for a sunlit rim
  for (let i = 0; i < 70; i++) { const a = -Math.PI * (.1 + r() * .8), q = S * (.3 + r() * .13), x = S / 2 + Math.cos(a) * q, y = S / 2 + Math.sin(a) * q * .9; g.save(); g.translate(x, y); g.rotate(r() * 6.28); g.fillStyle = `rgb(${200 + r() * 55},${200 + r() * 55},${190 + r() * 50})`; g.beginPath(); g.ellipse(0, 0, 8 + r() * 5, 3.5 + r() * 2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4;
  return leafTex;
}

let cardGeo: THREE.BufferGeometry | null = null;
/** Two leaf cards crossed at right angles, one unit across: from any side it reads as a spray of leaves, never as a flat card. */
export function leafCard() {
  if (cardGeo) return cardGeo;
  const a = new THREE.PlaneGeometry(1, 1), b = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), g = new THREE.BufferGeometry();
  const cat = (k: 'position' | 'normal' | 'uv', n: number) => { const out = new Float32Array((a.attributes[k]!.count + b.attributes[k]!.count) * n); out.set(a.attributes[k]!.array as Float32Array, 0); out.set(b.attributes[k]!.array as Float32Array, a.attributes[k]!.count * n); g.setAttribute(k, new THREE.BufferAttribute(out, n)); };
  cat('position', 3); cat('normal', 3); cat('uv', 2);
  const ia = Array.from(a.index!.array), nb = a.attributes.position!.count; g.setIndex([...ia, ...Array.from(b.index!.array).map(i => i + nb)]);
  return (cardGeo = g);
}
let cardMat: THREE.MeshStandardMaterial | null = null;
/** The one leaf material every hedge, topiary and planter shares. */
let sprayTex: THREE.CanvasTexture | null = null;
/** A spray of small clipped leaves for hedges and topiary: even in tone (the plant's own colour does the shading), dense in the middle, ragged at the edge. */
function leafSpray() {
  if (sprayTex) return sprayTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!; const r = rng(321);
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2, q = Math.pow(r(), .55) * S * .46, x = S / 2 + Math.cos(a) * q, y = S / 2 + Math.sin(a) * q, l = Math.floor(118 + r() * 62 + (i / 420) * 40);
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.fillStyle = `rgb(${l},${l},${l})`; g.beginPath(); g.ellipse(0, 0, 6 + r() * 5, 3 + r() * 2.2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
    g.restore();
  }
  sprayTex = new THREE.CanvasTexture(c); sprayTex.colorSpace = THREE.SRGBColorSpace; sprayTex.anisotropy = 4;
  return sprayTex;
}
export function leafCardMaterial() { return (cardMat ??= softFoliage(new THREE.MeshStandardMaterial({ map: leafSpray(), alphaTest: .42, side: THREE.DoubleSide, roughness: .82, metalness: 0 }))); }
/**
 * Foliage lit the way a mass of leaves is lit, not the way a flat card is: every card's normal is bent most of the way toward the
 * sky and is the same on both faces. The crown then shades as one soft volume (bright on top, darker where the colour says so)
 * and no single card flashes light or dark as the camera moves.
 */
export function softFoliage<T extends THREE.MeshStandardMaterial>(m: T): T {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n transformedNormal = normalize(transformedNormal * .3 + (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  m.customProgramCacheKey = () => 'softFoliage';
  return m;
}

function barkGeo() {
  // tapered trunk with a slight lean baked in
  const g = new THREE.CylinderGeometry(.55, 1, 1, 9, 4); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + .5; p.setX(i, p.getX(i) + Math.sin(y * 3) * .06); }
  g.computeVertexNormals(); return g;
}

type TreeSpec = { x: number; z: number; s: number; kind: 'oak' | 'cypress' | 'blossom' };

/** Trees built from leaf cards: thousands of leaves in two draw calls, soft silhouettes, shading by depth. */
export function Trees({ list, clumps }: { list: TreeSpec[]; clumps: number }) {
  const cards = useRef<THREE.InstancedMesh>(null), trunks = useRef<THREE.InstancedMesh>(null), limbs = useRef<THREE.InstancedMesh>(null);
  const per = (t: TreeSpec) => (t.kind === 'cypress' ? Math.ceil(clumps * 1.2) : clumps * 2);
  const total = list.reduce((a, t) => a + per(t), 0);
  const leafMat = useMemo(() => softFoliage(new THREE.MeshStandardMaterial({ map: leafCluster(), alphaTest: .45, side: THREE.DoubleSide, roughness: .85, metalness: 0 })), []);
  const trunk = useMemo(barkGeo, []);
  useLayoutEffect(() => {
    const f = cards.current, tr = trunks.current, lb = limbs.current; if (!f || !tr || !lb) return;
    const r = rng(99), d = new THREE.Object3D(), c = new THREE.Color(); let n = 0, nl = 0;
    list.forEach((t, ti) => {
      const th = t.kind === 'cypress' ? 1.0 * t.s : 2.4 * t.s;
      d.position.set(t.x, th / 2, t.z); d.rotation.set(0, r() * 6.28, 0); d.scale.set(.2 * t.s + .06, th, .2 * t.s + .06); d.updateMatrix(); tr.setMatrixAt(ti, d.matrix);
      if (t.kind !== 'cypress') for (let k = 0; k < 4; k++) { // main limbs into the crown
        const a = (k / 4) * 6.28 + r(); d.position.set(t.x + Math.cos(a) * .5 * t.s, th + .45 * t.s, t.z + Math.sin(a) * .5 * t.s); d.rotation.set(Math.sin(a) * .7, 0, -Math.cos(a) * .7); d.scale.set(.09 * t.s, 1.3 * t.s, .09 * t.s); d.updateMatrix(); lb.setMatrixAt(nl++, d.matrix);
      }
      const cnt = per(t); const base = t.kind === 'blossom' ? null : new THREE.Color().setHSL(.25 + (ti % 5) * .012, .38 + (ti % 3) * .05, .3);
      for (let i = 0; i < cnt; i++) {
        let px: number, py: number, pz: number, sz: number, depth: number;
        if (t.kind === 'cypress') { const u = Math.pow(r(), .9); py = th + u * 5.2 * t.s; const w = (1 - u) * .8 * t.s + .15; const a = r() * 6.28, q = Math.sqrt(r()); px = Math.cos(a) * w * q; pz = Math.sin(a) * w * q; sz = (.7 + r() * .4) * t.s; depth = q; }
        else {
          // several sub-crowns make an irregular, natural outline
          const lobe = Math.floor(r() * 4), la = lobe * 1.6 + ti, lr = lobe ? 1.0 * t.s : 0;
          const cx = Math.cos(la) * lr, cz = Math.sin(la) * lr, cy = th + 1.6 * t.s + (lobe ? -.3 + r() * .6 : .5) * t.s;
          const a = r() * 6.28, b = Math.acos(2 * r() - 1), q = Math.pow(r(), .35);
          px = cx + Math.sin(b) * Math.cos(a) * 1.5 * q * t.s; py = cy + Math.cos(b) * 1.2 * q * t.s; pz = cz + Math.sin(b) * Math.sin(a) * 1.5 * q * t.s; sz = (1.0 + r() * .6) * t.s; depth = q;
        }
        d.position.set(t.x + px, py, t.z + pz); d.rotation.set((r() - .5) * 1.2, r() * 6.28, (r() - .5) * 1.2); d.scale.set(sz, sz, sz); d.updateMatrix(); f.setMatrixAt(n, d.matrix);
        const up = (py - th) / (4.5 * t.s);
        if (t.kind === 'blossom') c.set(['#fff6f0', '#ffe9ef', '#ffffff', '#fbe3c8', '#fff0f4'][Math.floor(r() * 5)]).multiplyScalar(.75 + depth * .3 + up * .1);
        else c.copy(base!).offsetHSL((r() - .5) * .04, (r() - .5) * .08, (r() - .5) * .06 + depth * .1 + up * .08 - .06);
        f.setColorAt(n, c); n++;
      }
    });
    f.count = n; lb.count = nl; [f, tr, lb].forEach(m => { m.instanceMatrix.needsUpdate = true; }); if (f.instanceColor) f.instanceColor.needsUpdate = true;
  }, [list, clumps]);
  return <group>
    <instancedMesh ref={trunks} args={[trunk, undefined, list.length]} castShadow><meshStandardMaterial color="#5a4637" roughness={.95} /></instancedMesh>
    <instancedMesh ref={limbs} args={[undefined, undefined, list.length * 4]} castShadow><cylinderGeometry args={[.6, 1, 1, 6]} /><meshStandardMaterial color="#5a4637" roughness={.95} /></instancedMesh>
    <instancedMesh ref={cards} args={[undefined, leafMat, total]} castShadow receiveShadow><planeGeometry args={[1, 1]} /></instancedMesh>
  </group>;
}

/** Instanced flowers and bushes. */
export function Blooms({ spots }: { spots: { x: number; z: number; y?: number; r: number; n: number; kind: 'flower' | 'bush' }[] }) {
  const flowers = useRef<THREE.InstancedMesh>(null), bushes = useRef<THREE.InstancedMesh>(null);
  const nf = spots.filter(s => s.kind === 'flower').reduce((a, s) => a + s.n, 0), nb = spots.filter(s => s.kind === 'bush').reduce((a, s) => a + s.n, 0) * 7;
  const leafMat = useMemo(() => softFoliage(new THREE.MeshStandardMaterial({ map: leafCluster(), alphaTest: .45, side: THREE.DoubleSide, roughness: .85 })), []);
  useLayoutEffect(() => {
    const f = flowers.current, b = bushes.current; if (!f || !b) return; const r = rng(55), d = new THREE.Object3D(), c = new THREE.Color(); let i = 0, j = 0;
    spots.forEach(s => { for (let k = 0; k < s.n; k++) {
      const a = r() * 6.28, q = Math.sqrt(r()) * s.r, x = s.x + Math.cos(a) * q, z = s.z + Math.sin(a) * q;
      if (s.kind === 'flower') { d.position.set(x, (s.y ?? 0) + .12 + r() * .12, z); d.rotation.set(0, 0, 0); const sc = .06 + r() * .05; d.scale.set(sc, sc, sc); d.updateMatrix(); f.setMatrixAt(i, d.matrix); c.set(['#ffffff', '#fff6e4', '#ffe9a8', '#f8f4ff', '#ffffff'][Math.floor(r() * 5)]); f.setColorAt(i, c); i++; }
      else { const sc = .55 + r() * .3; for (let q = 0; q < 7; q++) { d.position.set(x + (r() - .5) * .5, .32 + r() * .35, z + (r() - .5) * .5); d.rotation.set((r() - .5) * 1.4, r() * 6.28, (r() - .5) * 1.4); d.scale.setScalar(sc * (.8 + r() * .5)); d.updateMatrix(); b.setMatrixAt(j, d.matrix); c.setHSL(.26 + r() * .03, .38, .26 + r() * .1); b.setColorAt(j, c); j++; } }
    } });
    f.count = i; b.count = j;   // draw only what was placed: an unused instance sits at the world origin, in the middle of the avenue
    [f, b].forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }, [spots]);
  return <group>
    <instancedMesh ref={flowers} args={[undefined, undefined, Math.max(1, nf)]}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial roughness={.6} /></instancedMesh>
    <instancedMesh ref={bushes} args={[undefined, leafMat, Math.max(1, nb)]} castShadow receiveShadow><planeGeometry args={[1, 1]} /></instancedMesh>
  </group>;
}
