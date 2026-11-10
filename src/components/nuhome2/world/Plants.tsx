import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { rng } from './theme';
import { leafCard, leafCardMaterial } from './Grounds';

/*
 * Real-looking planting: every plant is a solid core wrapped in hundreds of small leaf clusters in a spread of greens,
 * lighter on top and on the sunny skin, darker deep inside. Shared geometry and material, one draw call per plant.
 */
export type PlantKind = 'cone' | 'ball' | 'tree' | 'small';

const coreMat = new THREE.MeshStandardMaterial({ color: '#1f4a27', roughness: 1 });
const barkMat = new THREE.MeshStandardMaterial({ color: '#5a4331', roughness: 1 });

type Blob = { p: THREE.Vector3; s: number; c: THREE.Color };
function build(kind: PlantKind, seed: number): { blobs: Blob[]; height: number } {
  const r = rng(seed * 131 + kind.length * 17), out: Blob[] = [];
  const col = (up: number, outer: number, cypress = false) => {
    const hue = cypress ? .33 + r() * .03 : r() > .9 ? .19 + r() * .03 : .25 + r() * .07;
    return new THREE.Color().setHSL(hue, (cypress ? .36 : .44) + r() * .2, (cypress ? .2 : .25) + up * .16 + outer * .08 + r() * .06);
  };
  if (kind === 'tree') {
    const lobes = [[0, 2.15, 0, .72], [.5, 2.0, .2, .55], [-.5, 2.05, -.15, .55], [.1, 2.65, -.1, .5], [-.1, 1.7, .5, .5]];
    lobes.forEach(([cx, cy, cz, R]) => { for (let i = 0; i < 46; i++) {
      const d = new THREE.Vector3(r() - .5, r() - .5, r() - .5).normalize(), k = Math.pow(r(), .45), up = Math.min(1, Math.max(0, (d.y * k + 1) / 2));
      out.push({ p: new THREE.Vector3(cx! + d.x * R! * k, cy! + d.y * R! * k * .85, cz! + d.z * R! * k), s: .17 + r() * .14, c: col(up, k) });
    } });
    return { blobs: out, height: 3 };
  }
  if (kind === 'ball') {
    for (let i = 0; i < 150; i++) {
      const d = new THREE.Vector3(r() - .5, r() - .5, r() - .5).normalize(), k = .78 + r() * .22;
      out.push({ p: new THREE.Vector3(d.x * .8 * k, .78 + d.y * .8 * k, d.z * .8 * k), s: .13 + r() * .1, c: col((d.y + 1) / 2, k) });
    }
    return { blobs: out, height: 1.6 };
  }
  const H = kind === 'cone' ? 2.7 : 1.2, R0 = kind === 'cone' ? .95 : .5, n = kind === 'cone' ? 190 : 80;
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r(), .85), rad = R0 * Math.pow(1 - t, .85) * (.5 + .5 * r()), a = r() * Math.PI * 2;
    out.push({ p: new THREE.Vector3(Math.cos(a) * rad, t * H, Math.sin(a) * rad), s: (.2 + r() * .13) * (kind === 'cone' ? 1 : .6) * (1 - t * .45), c: col(t, rad / R0, true) });
  }
  return { blobs: out, height: H };
}

export function Plant({ kind, y = 0, seed = 1, detail = 0, scale = 1 }: { kind: PlantKind; y?: number; seed?: number; detail?: 0 | 1; scale?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { blobs, height } = useMemo(() => build(kind, seed), [kind, seed]);
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D(), rr = rng(seed * 7 + 3);
    blobs.forEach((b, i) => { o.position.copy(b.p); const k = b.s * 2.1 * (1 + rr() * .4); o.scale.set(k, k, k); o.rotation.set(rr() * 3, rr() * 3, rr() * 3); o.updateMatrix(); m.setMatrixAt(i, o.matrix); m.setColorAt(i, b.c); });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
  }, [blobs, seed]);
  return <group position={[0, y, 0]} scale={scale}>
    {kind === 'tree' && <group>
      <mesh position={[0, .85, 0]} material={barkMat} castShadow><cylinderGeometry args={[.07, .13, 1.7, 8]} /></mesh>
      {[[.3, 1.55, .1, .5], [-.3, 1.6, -.1, -.5], [.05, 1.7, .3, .1]].map(([x, h, z, tilt], i) => <mesh key={i} position={[x! * .5, h!, z! * .5]} rotation={[z! * .8, 0, -tilt!]} material={barkMat}><cylinderGeometry args={[.025, .05, .7, 6]} /></mesh>)}
    </group>}
    <mesh position={kind === 'tree' ? [0, 2.1, 0] : kind === 'ball' ? [0, .78, 0] : [0, height * .4, 0]} scale={kind === 'tree' ? [.8, .7, .8] : kind === 'ball' ? [.68, .68, .68] : kind === 'cone' ? [.6, height * .38, .6] : [.34, height * .38, .34]} material={coreMat} castShadow><sphereGeometry args={[1, 10, 8]} /></mesh>
    <instancedMesh ref={ref} args={[leafCard(), leafCardMaterial(), blobs.length]} frustumCulled={false} castShadow={detail > 0} receiveShadow />
  </group>;
}
