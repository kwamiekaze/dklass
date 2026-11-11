import { useContext, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx, rng } from './theme';
import { Building } from './Building';
import { Fountain } from './Fountain';
import { StarCanopy } from './StarCanopy';
import { CAR_POS, ISLANDS, ISLAND_TREES, Lot } from './Lot';
import { Blooms, Grass, Trees, lawnTexture } from './Grounds';
import type { Quality } from './quality';
import { atmo } from './atmosphere';
import { Backdrop } from './Backdrop';
import { aggregateNormal, tiled, turfNormal } from './surfaces';

function asphaltTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!; const r = rng(12);
  g.fillStyle = '#7d7d85'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3400; i++) { const v = 96 + r() * 72; g.fillStyle = `rgba(${v},${v},${v + 6},.55)`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(190,190,196,${.1 + r() * .15})`; g.fillRect(r() * 256, r() * 256, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
/** The lot, baked once: grain, sealed seams, patched repairs, hairline cracks, oil stains by the stalls and tire wear down the aisles. */
function lotTexture(lite: boolean) {
  const W = lite ? 1024 : 2048, H = lite ? 512 : 1024, c = document.createElement('canvas'); c.width = W; c.height = H; let g = c.getContext('2d')!; const r = rng(31);
  const X = (x: number) => ((x + 34.6) / 69.2) * W, Z = (z: number) => ((z + 14.7) / 29) * H, sx = W / 69.2, sz = H / 29;
  g.fillStyle = '#7b7b83'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < (lite ? 20000 : 70000); i++) { const v = 94 + r() * 74; g.fillStyle = `rgba(${v},${v},${v + 6},.5)`; g.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6); }
  // everything dark (seams, patches, tire tracks, oil, cracks) goes on its own layer, so a clean zone can be cut around the fountain
  const ground = g, layer = document.createElement('canvas'); layer.width = W; layer.height = H; g = layer.getContext('2d')!;
  // (seams, patches, tyre tracks, oil stains and cracks are all left off: the lot is clean)
  // keep the paving round the fountain spotless: fully clean out to 11 m, fading back to the worn lot by 16 m
  g.save(); g.globalCompositeOperation = 'destination-out'; g.translate(X(FOUNTAIN_AT.x), Z(FOUNTAIN_AT.z)); g.scale(1, sz / sx);
  const hole = g.createRadialGradient(0, 0, sx * 11, 0, 0, sx * 16); hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole; g.fillRect(-sx * 17, -sx * 17, sx * 34, sx * 34); g.restore();
  ground.drawImage(layer, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** The lot ends at z 14.3; the road beyond it runs along x until the fog takes it. */
const PLAZA = { x: 69.2, z: 29, cz: -.2 };
const FOUNTAIN = { x: 0, z: 6.6 };
const FOUNTAIN_AT = FOUNTAIN;
export const FLOOR_Y = .002;
export const HQ_Z = -17.5;
export { CAR_POS };

type TreeSpec = { x: number; z: number; s: number; kind: 'oak' | 'cypress' | 'blossom' };

export function Estate({ quality, open, children }: { quality: Quality; open: boolean; children?: React.ReactNode }) {
  const mix = useContext(NightCtx);
  const { lite } = quality;
  const lawnTex = useMemo(() => { const t = lawnTexture(); t.repeat.set(1 / 8, 1 / 8); return t; }, []);
  const grain = useMemo(() => aggregateNormal(256), []);
  const asphalt = useMemo(() => new THREE.MeshStandardMaterial({ map: asphaltTexture(), normalMap: tiled(grain, 12, 12), normalScale: new THREE.Vector2(.55, .55), color: '#ffffff', roughness: .88 }), [grain]);
  const lawnMat = useMemo(() => { const m = new THREE.MeshStandardMaterial({ map: lawnTex, normalMap: tiled(turfNormal(256), 1 / 1.6, 1 / 1.6), normalScale: new THREE.Vector2(.8, .8), roughness: .95, emissive: '#dfe8f5', emissiveIntensity: 0 });
    // no two stretches of a real lawn are the same green: broad, slow drifts of tone laid over the tile from the world position
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec2 vLawn;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLawn = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vLawn;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n float lw = sin(vLawn.x * .11 + sin(vLawn.y * .07) * 2.0) * sin(vLawn.y * .13 + sin(vLawn.x * .05) * 2.4); diffuseColor.rgb *= vec3(1.0 + lw * .1, 1.0 + lw * .07, 1.0 + lw * .12);');
    };
    m.customProgramCacheKey = () => 'lawn';
    return m; }, [lawnTex]);
  const lotMat = useMemo(() => new THREE.MeshStandardMaterial({ map: lotTexture(lite), normalMap: tiled(grain, 84, 36), normalScale: new THREE.Vector2(.55, .55), color: '#ffffff', roughness: .86 }), [lite, grain]);
  const dayC = useMemo(() => new THREE.Color('#d2d2d6'), []), nightC = useMemo(() => new THREE.Color('#55556a'), []), white = useMemo(() => new THREE.Color('#f4f7ff'), []);
  useFrame(() => {
    const m = mix.current;

    lawnMat.emissiveIntensity = atmo.look.snow * .55 * (1 - .75 * m);
    const A = atmo.look, wet = Math.min(1, A.rain * 1.1 + A.storm * .2), snowy = A.snow;
    asphalt.color.copy(dayC).lerp(nightC, m).multiplyScalar(1 - .22 * wet - .35 * atmo.deep * m).lerp(white, snowy * .55); lotMat.color.copy(asphalt.color);
    asphalt.roughness = lotMat.roughness = (.88 - .5 * wet); asphalt.envMapIntensity = lotMat.envMapIntensity = 1 + .8 * wet;
  });

  const lawnGeo = useMemo(() => {
    const s = new THREE.Shape(); s.absarc(0, 0, 290, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); const x = PLAZA.x / 2, z0 = PLAZA.cz - PLAZA.z / 2, z1 = PLAZA.cz + PLAZA.z / 2;
    hole.moveTo(-x, -z1); hole.lineTo(x, -z1); hole.lineTo(x, -z0); hole.lineTo(-x, -z0); hole.closePath(); s.holes.push(hole);
    return new THREE.ShapeGeometry(s, 64);
  }, []);
  const ring = useMemo<TreeSpec[]>(() => {
    const r = rng(15); const out: TreeSpec[] = [];
    for (let i = 0; out.length < quality.trees && i < 900; i++) {
      const a = r() * Math.PI * 2, rad = 38 + r() * 30, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.abs(x) < 46 && z > -64 && z < 14.5) continue;       // lot and the back lot
      if (z > 12 && z < 40) continue;                              // street and sidewalks
      if (Math.abs(x) < 14 && z > 0) continue;                     // the avenue
      const k = r(); out.push({ x, z, s: .9 + r() * .7, kind: k < .14 ? 'cypress' : k < .3 ? 'blossom' : 'oak' });
    }
    return out;
  }, [quality.trees]);
  const framing = useMemo<TreeSpec[]>(() => [[-41, -16, 1.2, 'oak'], [41, -16, 1.15, 'blossom'], [-43, -30, 1.35, 'oak'], [43, -30, 1.3, 'oak'], [-40, 2, 1.3, 'blossom'], [40, 3, 1.25, 'oak'], [-46, -20, 1.4, 'oak'], [46, -21, 1.35, 'cypress'], [-18, -62, 1.5, 'oak'], [17, -62, 1.5, 'oak'], [0, -66, 1.6, 'oak'], [-38, 40, 1.4, 'oak'], [38, 42, 1.4, 'blossom'], [-24, 52, 1.5, 'oak'], [26, 56, 1.4, 'oak']].map(([x, z, s, kind]) => ({ x, z, s, kind }) as TreeSpec), []);
  const young = useMemo<TreeSpec[]>(() => ISLAND_TREES.map(([x, z], i) => ({ x, z, s: .52 + (i % 3) * .05, kind: (i % 3 === 1 ? 'blossom' : 'oak') as TreeSpec['kind'] })), []);
  const spots = useMemo(() => {
    const out: { x: number; z: number; y?: number; r: number; n: number; kind: 'flower' | 'bush' }[] = [];
    ISLANDS.forEach(i => { for (let x = i.x - i.w / 2 + 1.2; x < i.x + i.w / 2 - 1; x += 1.3) out.push({ x, z: i.z - .5, y: .38, r: .6, n: lite ? 5 : 11, kind: 'flower' }); });
    for (let x = -29; x <= 29; x += 1.5) { if (Math.abs(x) < 15) continue; out.push({ x, z: 13.9, y: .2, r: .5, n: lite ? 4 : 9, kind: 'flower' }); }
    for (let x = -20; x <= 20; x += 1.4) { if (Math.abs(x) < 10) continue; out.push({ x, z: -12.9, y: .24, r: .5, n: lite ? 4 : 8, kind: 'flower' }); }
    return out;
  }, [lite]);

  return <group>
    {/* a dark ground underlay: if two ground pieces ever leave a hairline gap, this shows instead of the sky */}
    <mesh rotation-x={-Math.PI / 2} position={[0, -.16, 0]}><planeGeometry args={[900, 900]} /><meshStandardMaterial color="#2b3d26" roughness={1} /></mesh>
    <mesh geometry={lawnGeo} rotation-x={-Math.PI / 2} position={[0, -.07, 0]} receiveShadow material={lawnMat} />
    <mesh rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, PLAZA.cz]} material={lotMat} receiveShadow><planeGeometry args={[PLAZA.x + 1.2, PLAZA.z + 1.2]} /></mesh>
    <Backdrop lite={lite} />
    <Building position={[0, 0, HQ_Z]} lite={lite} open={open} />
    <StarCanopy lite={lite} />
    {/* the fountain: a roundabout in the entry avenue, between the two planted islands */}
    <group position={[FOUNTAIN.x, 0, FOUNTAIN.z]}>
      <mesh position={[0, .05, 0]} receiveShadow><cylinderGeometry args={[4, 4, .1, 64]} /><meshStandardMaterial color="#cfc9bd" roughness={.6} /></mesh>
      <mesh position={[0, .1, 0]} receiveShadow><cylinderGeometry args={[3.7, 3.7, .2, 64]} /><meshStandardMaterial color="#e8dcc8" roughness={.7} /></mesh>
      <Fountain position={[0, .2, 0]} mobile={lite} scale={.8} />
    </group>
    <Lot lite={lite} tier={quality.tier} asphalt={asphalt} />
    <group position={CAR_POS}>{children}</group>
    <Grass count={quality.grass} />
    <Trees list={ring} clumps={quality.clumps} />
    <Trees list={framing} clumps={quality.clumps * 3} />
    <Trees list={young} clumps={Math.max(10, Math.round(quality.clumps * .8))} />
    <Blooms spots={spots} />
  </group>;
}
