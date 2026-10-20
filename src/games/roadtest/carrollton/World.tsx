/**
 * The Carrollton open world as a 3D scene: the town built from the map (see build.ts), the sky and the light with a day that really moves, the street furniture,
 * the traffic, the player's car, the people, the train. Every component reads the rules engine (sim.ts) and only draws it.
 *
 * How it stays steady on a phone:
 * - Everything that lies flat on the ground (grass, asphalt, paint, driveways) is drawn first, in a fixed order, without writing depth. Nothing can z-fight with
 *   anything at any distance, so no road flickers in or out however coarse the phone's depth buffer is.
 * - The town is cut into 400 m tiles; a tile is skipped when it is behind the camera or beyond the haze, and the haze and a ring of wooded hills hide the edge.
 */
import { createContext, Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { FleetCar, type CarSignal, type WheelState } from '../../../components/nuhome2/world/Fleet';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import type { Quality } from '../../../components/nuhome2/world/quality';
import { Stars } from '../g3d/sky';
import { GARAGE, type GarageId } from '../g3d/garage';
import { Beams, BrakeGlow } from '../g3d/cars';
import { clamp, damp } from '../g3d/util';
import { ALL_KINDS, MAX_PER_KIND, vehicleGeo } from '../atl/vehicles';
import { buildingAt, loadMap, pointOnPoly, rand01, type GameMap } from './map';
import { Acc, box, buildBuildings, buildDriveways, buildRail, buildRoads, cone, prism, WALL_STYLES, type Corner, type WallStyle } from './build';
import { asphaltTexture, beamTexture, blobTexture, chevronTexture, clockTexture, concreteTexture, facadeTextures, flatRoofTexture, FOLIAGE_UV, foliageAtlas, glowDot, grassTexture, macroNoiseTexture, shingleTexture, shopSignTexture } from './tex';
import { bladeAtlasFor, buildSigns, signBackAtlas, signFaceAtlas } from './signs';
import { signalState } from './traffic';
import { parkedWorld } from './parked';
import type { OpenSim } from './sim';

export interface Env { hour: number; night: number; day: number; elev: number; warm: number; sun: THREE.Vector3; }
export const makeEnv = (): Env => ({ hour: 10, night: 0, day: 1, elev: 0.8, warm: 0, sun: new THREE.Vector3(0.2, 0.8, 0.5) });
export const EnvCtx = createContext<Env>(makeEnv());

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const START_HOUR = q.get('hour') ? Number(q.get('hour')) : 9.5;
const FREEZE = q.get('freeze') === '1';
const SEC_PER_HOUR = 50;
export const hourOf = (t: number) => ((START_HOUR + (FREEZE ? 0 : t / SEC_PER_HOUR)) % 24 + 24) % 24;

const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const col = (h: string) => new THREE.Color(h);
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

/** draw order of the flat ground layers (they do not write depth, so this order is what decides who is on top) */
const LAYER = { ground: -60, lots: -50, drive: -48, road: -40, pad: -34, paint: -28, cross: -27, route: -20 } as const;
/** a tile is drawn while its nearest edge is closer than this; the haze is nearly total there and the hills stand in front */
const DRAW_DIST = 640;
const TILE = 400;
/** one wind clock for every tree */
const WIND = { value: 0 };

// ------------------------------------------------------------------ sky, sun and light ---
const SKY = {
  top: [col('#3b78c8'), col('#3a5591'), col('#04070f')] as const,
  mid: [col('#8db9e4'), col('#d99a78'), col('#0b1128')] as const,
  low: [col('#d3dfe6'), col('#f3b48a'), col('#141a30')] as const,
};
function skyColor(set: readonly [THREE.Color, THREE.Color, THREE.Color], warm: number, night: number, out: THREE.Color) { return out.copy(set[0]).lerp(set[1], warm).lerp(set[2], night); }

/** the sky: a gradient, the sun with its glow, and drifting clouds from a little noise in the shader (one draw, no textures) */
function SkyDome({ env }: { env: Env }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, low: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color('#fff2cc') }, sunK: { value: 1 }, cloudCol: { value: new THREE.Color('#ffffff') }, cloudShade: { value: new THREE.Color('#9aa6b4') }, t: { value: 0 }, night: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top,mid,low,sunDir,sunCol,cloudCol,cloudShade; uniform float sunK,t,night;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vP); float h = max(d.y,0.0);
        vec3 c = mix(low,mid,smoothstep(0.0,0.2,h)); c = mix(c,top,smoothstep(0.16,0.8,h));
        float s = max(dot(d,normalize(sunDir)),0.0);
        c += sunCol * (pow(s,1400.0)*3.0 + pow(s,40.0)*0.18 + pow(s,4.0)*0.08) * sunK;
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.08) * 1.6 + vec2(t*0.006, t*0.002);
          float n = fbm(uv) * 0.75 + fbm(uv*2.7 + 3.1) * 0.25;
          float cl = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.18, d.y);
          float lit = 0.6 + 0.4 * smoothstep(0.5, 0.95, fbm(uv*1.4 + normalize(sunDir).xz*0.4));
          vec3 cc = mix(cloudShade, cloudCol, lit) + sunCol * pow(s, 8.0) * 0.35 * sunK;
          c = mix(c, cc, cl * (0.92 - 0.5*night));
        }
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    skyColor(SKY.top, env.warm, env.night, u.top!.value as THREE.Color); skyColor(SKY.mid, env.warm, env.night, u.mid!.value as THREE.Color); skyColor(SKY.low, env.warm, env.night, u.low!.value as THREE.Color);
    (u.sunDir!.value as THREE.Vector3).copy(env.sun); (u.sunCol!.value as THREE.Color).set('#fff1d6').lerp(tmpA.set('#ff9a55'), env.warm); u.sunK!.value = env.day;
    (u.cloudCol!.value as THREE.Color).set('#ffffff').lerp(tmpA.set('#ffc49a'), env.warm).lerp(tmpB.set('#1c2238'), env.night);
    (u.cloudShade!.value as THREE.Color).set('#a3adb9').lerp(tmpA.set('#9a7d82'), env.warm).lerp(tmpB.set('#0d1120'), env.night);
    u.t!.value += Math.min(dt, 0.1); u.night!.value = env.night;
  });
  return <mesh material={mat} scale={900} renderOrder={-100} frustumCulled={false}><sphereGeometry args={[1, 32, 16]} /></mesh>;
}

function MoonSprite({ env }: { env: Env }) {
  const ref = useRef<THREE.Sprite>(null);
  const tex = useMemo(() => glowDot(), []);
  useFrame(() => { const s = ref.current; if (!s) return; s.position.set(-env.sun.x, -env.sun.y, -env.sun.z).multiplyScalar(800); (s.material as THREE.SpriteMaterial).opacity = env.night * clamp(-env.sun.y * 3 + 0.3, 0, 1) * 0.95; s.visible = env.night > 0.05; });
  return <sprite ref={ref} scale={[90, 90, 1]} renderOrder={-99}><spriteMaterial map={tex} color="#dfe8ff" transparent depthWrite={false} depthTest={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} /></sprite>;
}

/**
 * The wooded hills of West Georgia on the horizon: two rings of treeline that travel with the camera. They take the haze like everything else, so they read as
 * far away, and they close the view where the map ends.
 */
function Horizon({ env }: { env: Env }) {
  const g = useRef<THREE.Group>(null);
  const { geos, mats } = useMemo(() => {
    const ring = (R: number, base: number, amp: number, seed: number) => {
      const N = 360, pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const hill = base + amp * (0.5 + 0.5 * Math.sin(a * 3 + seed) * Math.sin(a * 5.3 + seed * 2.1)) + amp * 0.35 * Math.sin(a * 11 + seed * 0.7);
        const crowns = 2.6 * Math.abs(Math.sin(a * 140 + seed)) + 1.8 * Math.abs(Math.sin(a * 67 + seed * 3));
        pos.push(c * R, -3, s * R, c * R, hill + crowns, s * R);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); return geo;
    };
    const near = new THREE.MeshBasicMaterial({ color: '#2f4a2e', side: THREE.DoubleSide, fog: true }), far = new THREE.MeshBasicMaterial({ color: '#3f5a46', side: THREE.DoubleSide, fog: true });
    return { geos: [ring(560, 8, 22, 1.3), ring(760, 26, 44, 4.1)], mats: [near, far] };
  }, []);
  useFrame(({ camera }) => {
    g.current?.position.set(camera.position.x, 0, camera.position.z);
    const d = 0.25 + 0.75 * env.day;
    mats[0]!.color.set('#33502f').multiplyScalar(d); mats[1]!.color.set('#46614c').multiplyScalar(d);
  });
  return <group ref={g}>{geos.map((geo, i) => <mesh key={i} geometry={geo} material={mats[i]} renderOrder={-90} frustumCulled={false} />)}</group>;
}

function SkyKit({ env, lite }: { env: Env; lite: boolean }) {
  const g = useRef<THREE.Group>(null), stars = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { g.current?.position.copy(camera.position); if (stars.current) stars.current.visible = env.night > 0.25; });
  return <group ref={g}>
    <SkyDome env={env} />
    <group ref={stars}><Stars count={lite ? 1800 : 4200} /></group>
    <MoonSprite env={env} />
  </group>;
}

const SH = new THREE.Vector3(), SR = new THREE.Vector3(), SU = new THREE.Vector3(), SF = new THREE.Vector3();
export function Atmosphere({ sim, env, shadow, active = true, mix, lite }: { sim: OpenSim; env: Env; shadow: number; active?: boolean; mix: { current: number }; lite: boolean }) {
  const { scene, gl } = useThree();
  const hemi = useRef<THREE.HemisphereLight>(null), dir = useRef<THREE.DirectionalLight>(null), moon = useRef<THREE.DirectionalLight>(null);
  const fog = useMemo(() => new THREE.FogExp2('#d3dfe6', 0.0026), []);
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  const c = useMemo(() => ({ sunC: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color() }), []);
  const R = shadow >= 2048 ? 70 : 48;
  useFrame(() => {
    const h = hourOf(sim.time), ang = h >= 6.3 && h <= 19.7 ? ((h - 6.3) / 13.4) * Math.PI : Math.PI + ((((h - 19.7) % 24) + 24) % 24 / 10.6) * Math.PI;
    const elev = Math.sin(ang), y = elev * 0.86, mag = Math.sqrt(Math.max(0.05, 1 - y * y));
    env.hour = h; env.elev = elev; env.day = smooth(-0.04, 0.3, elev); env.night = 1 - smooth(-0.22, 0.06, elev);
    env.warm = smooth(0.45, 0.0, elev) * smooth(-0.22, 0.03, elev);
    env.sun.set(Math.cos(ang) * mag, y, Math.sin(ang) * mag * 0.6 + 0.22).normalize();
    mix.current = env.night;
    skyColor(SKY.low, env.warm, env.night, fog.color);
    fog.density = 0.0024 + 0.0004 * env.warm + 0.0011 * env.night;
    scene.environmentIntensity = 0.1 + 0.42 * env.day;
    gl.toneMappingExposure = 1.0 - 0.08 * env.night;
    const d = dir.current, m = moon.current, p = sim;
    if (d) {
      c.sunC.set('#fff0d8').lerp(tmpB.set('#ff9b55'), env.warm); d.color.copy(c.sunC); d.intensity = 3.4 * env.day;
      // the shadow box follows the car, snapped to whole shadow-map texels so the edges do not crawl as you drive
      SF.copy(env.sun).negate(); SR.set(0, 1, 0).cross(SF).normalize(); SU.copy(SF).cross(SR).normalize();
      const texel = (2 * R) / Math.max(256, shadow || 1024);
      const fx = p.x + Math.sin(p.h) * R * 0.45, fz = p.z + Math.cos(p.h) * R * 0.45;
      SH.set(fx, 0, fz); const a = Math.round(SH.dot(SR) / texel) * texel, b = Math.round(SH.dot(SU) / texel) * texel, f = SH.dot(SF);
      SH.copy(SR).multiplyScalar(a).addScaledVector(SU, b).addScaledVector(SF, f);
      d.target.position.copy(SH); d.position.copy(SH).addScaledVector(env.sun, 160); d.target.updateMatrixWorld();
      d.castShadow = shadow > 0 && active && env.day > 0.12;
    }
    if (m) { m.intensity = 0.5 * env.night; m.position.set(p.x - env.sun.x * 90, 70, p.z - env.sun.z * 90 + 20); m.target.position.set(p.x, 0, p.z); m.target.updateMatrixWorld(); }
    if (hemi.current) {
      hemi.current.intensity = 0.3 + 0.42 * env.day + 0.12 * env.night;
      c.hemiS.set('#c9dcf2').lerp(tmpA.set('#2a3a6c'), env.night).lerp(tmpB.set('#e6b894'), env.warm * 0.5); hemi.current.color.copy(c.hemiS);
      c.hemiG.set('#7c7458').lerp(tmpA.set('#10131f'), env.night); hemi.current.groundColor.copy(c.hemiG);
    }
  });
  const sz = shadow || 16;
  return <>
    <hemisphereLight ref={hemi} args={['#c9dcf2', '#7c7458', 1]} />
    <directionalLight ref={dir} castShadow={shadow > 0} shadow-mapSize-width={sz} shadow-mapSize-height={sz} shadow-camera-left={-R} shadow-camera-right={R} shadow-camera-top={R} shadow-camera-bottom={-R} shadow-camera-near={1} shadow-camera-far={360} shadow-bias={-0.0006} shadow-normalBias={0.04} />
    <directionalLight ref={moon} color="#8fa8ff" />
    <Environment resolution={lite ? 64 : 128}>
      <Lightformer intensity={2.0} position={[0, 8, 4]} scale={[24, 10, 1]} />
      <Lightformer intensity={1.6} color="#fff0d8" position={[-12, 3, 6]} scale={[18, 7, 1]} />
      <Lightformer intensity={1.2} color="#ffe2a0" position={[12, 3, 8]} scale={[16, 6, 1]} />
      <Lightformer intensity={1.7} color="#fff0d0" position={[0, 4, 22]} rotation-y={Math.PI} scale={[44, 9, 1]} />
    </Environment>
    <SkyKit env={env} lite={lite} />
    <Horizon env={env} />
  </>;
}

// ------------------------------------------------------------------ shared material tricks ---
/** flat ground layers: drawn first, in LAYER order, without writing depth (see the note at the top) */
function flat<T extends THREE.Material>(m: T, order: number): T { m.depthWrite = false; m.userData.order = order; return m; }
/** a multiply decal (contact shadows): darkens what is under it, and fades to "no change" in the haze instead of to the haze colour */
function multiplyDecal(opts: THREE.MeshBasicMaterialParameters) {
  const m = new THREE.MeshBasicMaterial({ ...opts, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogF = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.0 ), fogF );
    #endif`).replace('#include <colorspace_fragment>', '');
  };
  return m;
}
/** the wall colour tints the brick or the siding but not the glass and the trim: the facade carries a mask (white = tint) */
function tintedWall(set: { map: THREE.Texture; lit: THREE.Texture; mask: THREE.Texture }) {
  const m = new THREE.MeshStandardMaterial({ map: set.map, vertexColors: true, roughness: 0.84, metalness: 0.02, emissiveMap: set.lit, emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tintMask = { value: set.mask };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tintMask;')
      .replace('#include <color_fragment>', '#if defined( USE_COLOR ) && defined( USE_MAP )\n  diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, texture2D( tintMask, vMapUv ).r );\n#elif defined( USE_COLOR )\n  diffuseColor.rgb *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'tintedWall';
  return m;
}

// ------------------------------------------------------------------ the ground ---
function Ground() {
  // a finely cut sheet that follows the camera in whole texture tiles, with large soft patches mixed in so the lawn never looks tiled
  const mat = useMemo(() => {
    const tex = grassTexture().clone(); tex.repeat.set(160, 160); tex.needsUpdate = true;
    const macro = macroNoiseTexture();
    const m = flat(new THREE.MeshStandardMaterial({ map: tex, color: '#a6b886', roughness: 1, metalness: 0 }), LAYER.ground);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.macro = { value: macro };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;').replace('#include <project_vertex>', '#include <project_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D macro;\nvarying vec2 vWXZ;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float m1 = texture2D(macro, vWXZ / 230.0).r, m2 = texture2D(macro, vWXZ / 61.0 + 0.37).r, mm = m1 * 0.7 + m2 * 0.3;
          diffuseColor.rgb *= mix(vec3(0.74, 0.84, 0.66), vec3(1.12, 1.07, 0.9), smoothstep(0.25, 0.78, mm));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 1.06, 0.74), smoothstep(0.64, 0.82, m2) * 0.55);`);
    };
    m.customProgramCacheKey = () => 'crGround';
    return m;
  }, []);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => { const m = ref.current; if (m) m.position.set(Math.round(camera.position.x / 40) * 40, -0.02, Math.round(camera.position.z / 40) * 40); });
  return <mesh ref={ref} rotation-x={-Math.PI / 2} receiveShadow renderOrder={LAYER.ground} frustumCulled={false} material={mat}>
    <planeGeometry args={[1700, 1700, 34, 34]} />
  </mesh>;
}

// ------------------------------------------------------------------ the town, in tiles ---
type G = THREE.BufferGeometry;
interface TownGeo {
  roads: [number, G[]][]; pads: [number, G[]][]; side: G[]; white: G[]; yellow: G[]; cross: G[]; lots: G[]; drive: G[];
  walls: [WallStyle, G[]][]; roofsGable: G[]; roofsFlat: G[]; trim: G[]; awnings: G[]; contact: G[];
  ballast: G[]; steel: G[]; ties: G[];
  signs: ReturnType<typeof buildBuildings>['signs']; corners: Corner[]; heights: Map<number, number>; courthouse: ReturnType<typeof buildBuildings>['courthouse'];
}
export function useTownGeo(map: GameMap): TownGeo {
  return useMemo(() => {
    const r = buildRoads(map), b = buildBuildings(map), rl = buildRail(map), dw = buildDriveways(parkedWorld(map));
    // the stall lines are white paint like the rest
    const white = r.paint.white; { const base = white.n; for (let i = 0; i < dw.stalls.n; i++) white.v(dw.stalls.pos[i * 3]!, dw.stalls.pos[i * 3 + 1]!, dw.stalls.pos[i * 3 + 2]!, new THREE.Color(dw.stalls.col[i * 3]!, dw.stalls.col[i * 3 + 1]!, dw.stalls.col[i * 3 + 2]!)); for (const ix of dw.stalls.idx) white.idx.push(base + ix); }
    const ch = (a: Acc) => a.chunks(TILE);
    return {
      roads: [...r.roads.entries()].map(([k, a]) => [k, ch(a)] as [number, G[]]), pads: [...r.pads.entries()].map(([k, a]) => [k, ch(a)] as [number, G[]]),
      side: ch(r.side), white: ch(white), yellow: ch(r.paint.yellow), cross: ch(r.crosswalks), lots: ch(r.lots), drive: ch(dw.drive),
      walls: WALL_STYLES.map((s) => [s, ch(b.walls[s])] as [WallStyle, G[]]), roofsGable: ch(b.roofsGable), roofsFlat: ch(b.roofsFlat), trim: ch(b.trim), awnings: ch(b.awnings), contact: ch(b.contact),
      ballast: ch(rl.ballast), steel: ch(rl.steel), ties: ch(rl.ties),
      signs: b.signs, corners: r.corners, heights: b.heights, courthouse: b.courthouse,
    };
  }, [map]);
}

/** keep a list of objects visible only while they are near enough to the camera (centre and radius of each) */
function useDistanceCull(items: { o: THREE.Object3D; x: number; z: number; r: number }[], max = DRAW_DIST) {
  useFrame(({ camera }) => {
    const cx = camera.position.x, cz = camera.position.z;
    for (const it of items) { const d = Math.hypot(it.x - cx, it.z - cz) - it.r; it.o.visible = d < max; }
  });
}
function Chunks({ g, m, cast = false, rec = true, max = DRAW_DIST }: { g: G[]; m: THREE.Material; cast?: boolean; rec?: boolean; max?: number }) {
  const items = useMemo(() => g.map((geo) => {
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = cast; mesh.receiveShadow = rec; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    if (typeof m.userData.order === 'number') mesh.renderOrder = m.userData.order;
    const s = geo.boundingSphere!; return { o: mesh as THREE.Object3D, x: s.center.x, z: s.center.z, r: s.radius };
  }), [g, m, cast, rec]);
  useDistanceCull(items, max);
  return <>{items.map((it, i) => <primitive key={i} object={it.o} />)}</>;
}

function Town({ geo, env, shadow }: { geo: TownGeo; env: Env; shadow: boolean }) {
  const mats = useMemo(() => {
    const asphalt = asphaltTexture(), concrete = concreteTexture();
    const road = (order: number) => flat(new THREE.MeshStandardMaterial({ map: asphalt, vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }), order);
    const paint = (hex: string, order: number) => flat(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, metalness: 0, side: THREE.DoubleSide, emissive: hex, emissiveIntensity: 0 }), order);
    const walls = Object.fromEntries(WALL_STYLES.map((s) => [s, tintedWall(facadeTextures(s))])) as Record<WallStyle, THREE.MeshStandardMaterial>;
    const shingles = shingleTexture(), flatRoof = flatRoofTexture();
    return {
      road: [1, 2, 3, 4, 5].map((r) => road(LAYER.road + r)), pad: [1, 2, 3, 4, 5].map((r) => road(LAYER.pad + r)),
      side: new THREE.MeshStandardMaterial({ map: concrete, vertexColors: true, roughness: 0.93, side: THREE.DoubleSide }),
      white: paint('#eeeeea', LAYER.paint), yellow: paint('#e5b81c', LAYER.paint), cross: paint('#f1f1ec', LAYER.cross),
      lots: flat(new THREE.MeshStandardMaterial({ map: asphalt, color: '#77797c', roughness: 0.95, side: THREE.DoubleSide }), LAYER.lots),
      drive: flat(new THREE.MeshStandardMaterial({ map: concrete, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), LAYER.drive),
      walls,
      roofG: new THREE.MeshStandardMaterial({ map: shingles, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }),
      roofF: new THREE.MeshStandardMaterial({ map: flatRoof, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
      trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
      awning: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
      contact: multiplyDecal({ vertexColors: true }),
      ballast: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
      steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
      ties: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    };
  }, []);
  useFrame(() => {
    const n = env.night;
    mats.walls.siding.emissiveIntensity = mats.walls.brickhouse.emissiveIntensity = n * 0.95; mats.walls.brick.emissiveIntensity = mats.walls.stucco.emissiveIntensity = n * 1.15;
    mats.white.emissiveIntensity = n * 0.06; mats.yellow.emissiveIntensity = n * 0.08; mats.cross.emissiveIntensity = n * 0.06;
  });
  return <group>
    {geo.roads.map(([rank, g]) => <Chunks key={rank} g={g} m={mats.road[rank - 1]!} />)}
    {geo.pads.map(([rank, g]) => <Chunks key={`p${rank}`} g={g} m={mats.pad[rank - 1]!} />)}
    <Chunks g={geo.lots} m={mats.lots} /><Chunks g={geo.drive} m={mats.drive} />
    <Chunks g={geo.white} m={mats.white} max={420} /><Chunks g={geo.yellow} m={mats.yellow} max={420} /><Chunks g={geo.cross} m={mats.cross} max={420} />
    <Chunks g={geo.side} m={mats.side} />
    {geo.walls.map(([s, g]) => <Chunks key={s} g={g} m={mats.walls[s]} cast={shadow} />)}
    <Chunks g={geo.roofsGable} m={mats.roofG} cast={shadow} /><Chunks g={geo.roofsFlat} m={mats.roofF} cast={shadow} />
    <Chunks g={geo.trim} m={mats.trim} cast={shadow} /><Chunks g={geo.awnings} m={mats.awning} cast={shadow} />
    <Chunks g={geo.contact} m={mats.contact} rec={false} max={300} />
    <Chunks g={geo.ballast} m={mats.ballast} /><Chunks g={geo.ties} m={mats.ties} /><Chunks g={geo.steel} m={mats.steel} rec={false} />
  </group>;
}

/** the shop signs on the walls of the named businesses, above the awnings */
function ShopSigns({ geo, env }: { geo: TownGeo; env: Env }) {
  const items = useMemo(() => geo.signs.map((s) => {
    const w = clamp(s.w * 0.62, 3.2, 7.5), h = w / 4;
    const tex = shopSignTexture(s.b.name!);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
    return { s, w, h, mat, y: Math.max(s.y, 3.15 + h / 2) };
  }), [geo]);
  useFrame(() => { for (const it of items) it.mat.emissiveIntensity = env.night * 1.1; });
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const board = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.6 }), []);
  return <group>{items.map(({ s, w, h, mat, y }, i) => <group key={i} position={[s.x + s.nx * 0.14, y, s.z + s.nz * 0.14]} rotation-y={Math.atan2(s.nx, s.nz)}>
    <mesh geometry={plane} material={mat} scale={[w, h, 1]} position={[0, 0, 0.06]} />
    <mesh material={board} position={[0, 0, 0]}><boxGeometry args={[w + 0.12, h + 0.12, 0.1]} /></mesh>
  </group>)}</group>;
}

/** street name blades, stop signs, speed limits and railroad warning signs: four draw calls */
function Signage({ geo, map, env }: { geo: TownGeo; map: GameMap; env: Env }) {
  const parts = useMemo(() => buildSigns(map, geo.corners), [map, geo]);
  const objs = useMemo(() => {
    const face = signFaceAtlas(), blade = bladeAtlasFor(parts.names);
    const back = signBackAtlas();
    return {
      face: parts.face.geo(), back: parts.back.geo(), blade: parts.blade.geo(), pole: parts.pole.geo(),
      faceMat: new THREE.MeshStandardMaterial({ map: face, roughness: 0.45, metalness: 0.05, alphaTest: 0.5, emissiveMap: face, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }),
      backMat: new THREE.MeshStandardMaterial({ map: back, roughness: 0.6, metalness: 0.4, alphaTest: 0.5 }),
      bladeMat: new THREE.MeshStandardMaterial({ map: blade, roughness: 0.5, metalness: 0.1, emissiveMap: blade, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }),
      poleMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }),
    };
  }, [parts]);
  useFrame(() => { const n = env.night; objs.faceMat.emissiveIntensity = n * 0.35; objs.bladeMat.emissiveIntensity = n * 0.3; });
  return <group>
    <mesh geometry={objs.face} material={objs.faceMat} castShadow /><mesh geometry={objs.back} material={objs.backMat} castShadow />
    <mesh geometry={objs.blade} material={objs.bladeMat} /><mesh geometry={objs.pole} material={objs.poleMat} castShadow />
  </group>;
}

// ------------------------------------------------------------------ trees and bushes ---
type Spot = { x: number; z: number; s: number; k: number };
/** kinds: 0 oak, 1 loblolly pine, 2 ornamental (magnolia, crape myrtle), 3 bush */
export function streetTrees(map: GameMap): Spot[] {
  const out: Spot[] = [];
  for (const e of map.edges) {
    const w = e.way; if (!w.drive || !w.ai || w.rank > 3 || e.len < 40) continue;
    const off0 = w.width / 2 + 3.6; let side = rand01(e.id * 3.3) < 0.5 ? 1 : -1;
    for (let s = e.a.clear + 8 + rand01(e.id) * 10; s < e.len - e.b.clear - 8; s += 15 + rand01(e.id * 5 + s) * 10) {
      side = -side;
      const qd = pointOnPoly(e.p, e.cum, s), off = side * off0, x = qd.x - qd.tz * off, z = qd.z + qd.tx * off;
      if (rand01(x * 1.3 + z * 0.7) < 0.25) continue;
      if (buildingAt(map, x, z, 1.6)) continue;
      const hit = map.roadAt(x, z); if (hit && hit.dist < hit.edge.way.width / 2 + 2.6) continue;
      out.push({ x, z, s: 0.8 + rand01(x * 9 + z) * 0.4, k: rand01(x + z * 3) < 0.62 ? 0 : 2 });
    }
  }
  return out;
}
/** shrubs along the fronts and corners of the houses */
export function bushSpots(map: GameMap): Spot[] {
  const out: Spot[] = [];
  for (const b of map.buildings) {
    if (!b.gable) continue;
    const n = b.p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = b.p[i * 2]!, z0 = b.p[i * 2 + 1]!, x1 = b.p[j * 2]!, z1 = b.p[j * 2 + 1]!, L = Math.hypot(x1 - x0, z1 - z0); if (L < 5) continue;
      let nx = (z1 - z0) / L, nz = -(x1 - x0) / L; const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (buildingAt(map, mx + nx * 0.6, mz + nz * 0.6)) { nx = -nx; nz = -nz; }
      for (let t = 0.15; t < 0.9; t += 0.24) {
        if (rand01(b.id * 3 + i * 7 + t * 11) < 0.45) continue;
        const x = x0 + (x1 - x0) * t + nx * 0.9, z = z0 + (z1 - z0) * t + nz * 0.9;
        const hit = map.roadAt(x, z); if (hit && hit.dist < hit.edge.way.width / 2 + 2.4) continue;
        if (buildingAt(map, x, z, 0.3)) continue;
        out.push({ x, z, s: 0.7 + rand01(x * 3 + z) * 0.5, k: 3 });
      }
    }
  }
  return out;
}
export function treeSpots(map: GameMap): Spot[] {
  const out: Spot[] = [];
  const b = map.bounds, M = 300, STEP = 13;
  for (let x = b.x0 - M; x < b.x1 + M; x += STEP) for (let z = b.z0 - M; z < b.z1 + M; z += STEP) {
    const jx = x + (rand01(x * 3.1 + z) - 0.5) * STEP * 0.9, jz = z + (rand01(z * 5.7 + x) - 0.5) * STEP * 0.9;
    const hit = map.roadAt(jx, jz);
    if (hit && hit.dist < hit.edge.way.width / 2 + 4.6) continue;
    if (buildingAt(map, jx, jz, 3.5)) continue;
    // fewer trees in the busy middle, woods at the edge, and clumps everywhere (a soft noise decides)
    const inner = jx > b.x0 + 60 && jx < b.x1 - 60 && jz > b.z0 + 60 && jz < b.z1 - 60;
    const clump = 0.5 + 0.5 * Math.sin(jx * 0.021 + Math.sin(jz * 0.013) * 2) * Math.sin(jz * 0.017 + 1.3);
    const dens = (inner ? (hit ? 0.5 : 0.34) : 0.85) * (0.45 + clump);
    if (rand01(jx * 1.7 + jz * 2.3) > dens) continue;
    // Georgia: oaks in the yards, loblolly pines in the woods
    const pineBias = inner ? 0.25 : 0.55;
    const r = rand01(jx * 13 + jz * 7);
    out.push({ x: jx, z: jz, s: 0.85 + rand01(jx * 9 + jz) * 0.6, k: r < pineBias ? 1 : r < pineBias + 0.12 ? 2 : 0 });
  }
  return out;
}
/** foliage made of crossed leaf cards around a few clump centres; the normals point out from the middle of the crown, so it shades like a round tree */
function treeGeos(): G[] {
  const U = FOLIAGE_UV, white = new THREE.Color(1, 1, 1);
  const trunk = (a: Acc, h: number, r0: number, r1: number) => {
    const seg = 6, ring0: number[] = [], ring1: number[] = []; const [u0, v0, u1, v1] = U.bark;
    for (let i = 0; i <= seg; i++) { const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); ring0.push(a.v(c * r0, 0, s * r0, white, u0 + (u1 - u0) * (i / seg), v0, c, 0, s)); ring1.push(a.v(c * r1, h, s * r1, white, u0 + (u1 - u0) * (i / seg), v1, c, 0, s)); }
    for (let i = 0; i < seg; i++) a.quad(ring0[i]!, ring0[i + 1]!, ring1[i + 1]!, ring1[i]!);
  };
  const clump = (a: Acc, cx: number, cy: number, cz: number, r: number, uv: readonly number[], ctr: number[], tint: number, seed: number) => {
    const [u0, v0, u1, v1] = uv, c = new THREE.Color(tint, tint, tint);
    const N = (x: number, y: number, z: number) => { const nx = x - ctr[0]!, ny = y - ctr[1]! + 0.6, nz = z - ctr[2]!, l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l] as const; };
    const V = (x: number, y: number, z: number, u: number, v: number) => { const n = N(x, y, z); return a.v(x, y, z, c, u, v, n[0], n[1], n[2]); };
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI + rand01(seed + k) * 0.5, dx = Math.cos(ang) * r, dz = Math.sin(ang) * r;
      a.card(V(cx - dx, cy - r * 0.85, cz - dz, u0, v0), V(cx + dx, cy - r * 0.85, cz + dz, u1, v0), V(cx + dx, cy + r * 0.85, cz + dz, u1, v1), V(cx - dx, cy + r * 0.85, cz - dz, u0, v1));
    }
    // a near-horizontal card, so the crown is not hollow seen from above
    const t = rand01(seed * 3) * Math.PI;
    const ax = Math.cos(t) * r, az = Math.sin(t) * r, bx = -az, bz = ax;
    a.card(V(cx - ax - bx, cy + 0.2, cz - az - bz, u0, v0), V(cx + ax - bx, cy - 0.1, cz + az - bz, u1, v0), V(cx + ax + bx, cy + 0.2, cz + az + bz, u1, v1), V(cx - ax + bx, cy - 0.1, cz - az + bz, u0, v1));
  };
  const oak = new Acc(); trunk(oak, 4.2, 0.26, 0.17);
  const oc = [0, 6.2, 0];
  for (const [x, y, z, r, t] of [[0, 6.6, 0, 3.0, 1.0], [1.9, 5.6, 0.7, 2.4, 0.92], [-1.8, 5.8, -0.6, 2.5, 0.95], [0.4, 7.9, 0.3, 2.3, 1.08], [0.3, 5.2, -1.9, 2.2, 0.88], [-0.6, 5.4, 1.9, 2.2, 0.9], [1.2, 7.2, -1.1, 1.9, 1.04]] as number[][]) clump(oak, x!, y!, z!, r!, U.oak, oc, t!, x! * 7 + z! * 3);
  const pine = new Acc(); trunk(pine, 10.5, 0.24, 0.12);
  const pc = [0, 11.2, 0];
  for (const [x, y, z, r, t] of [[0, 11.4, 0, 2.3, 1.0], [1.3, 10.4, 0.4, 1.8, 0.92], [-1.2, 10.6, -0.5, 1.8, 0.95], [0.2, 12.9, 0.1, 1.6, 1.06], [0.3, 9.6, -1.3, 1.5, 0.88]] as number[][]) clump(pine, x!, y!, z!, r!, U.pine, pc, t!, x! * 5 + z! * 11);
  const orn = new Acc(); trunk(orn, 1.8, 0.14, 0.1);
  const mc = [0, 3.2, 0];
  for (const [x, y, z, r, t] of [[0, 3.3, 0, 1.9, 0.82], [0.9, 2.8, 0.4, 1.5, 0.78], [-0.8, 3.0, -0.4, 1.5, 0.8], [0.1, 4.3, 0.1, 1.4, 0.88]] as number[][]) clump(orn, x!, y!, z!, r!, U.oak, mc, t!, x! * 13 + z!);
  const bush = new Acc();
  const bc = [0, 0.4, 0];
  for (const [x, y, z, r, t] of [[0, 0.75, 0, 0.95, 1.0], [0.6, 0.6, 0.25, 0.75, 0.95], [-0.55, 0.62, -0.2, 0.75, 0.92]] as number[][]) clump(bush, x!, y!, z!, r!, U.bush, bc, t!, x! * 17 + z! * 5);
  return [oak.geo(), pine.geo(), orn.geo(), bush.geo()];
}
/** far away: two crossed cards for the whole crown and a thin trunk card (12 triangles a tree) */
function treeFarGeos(): G[] {
  const U = FOLIAGE_UV, white = new THREE.Color(1, 1, 1);
  const mk = (crownY: number, R: number, trunkH: number, uv: readonly number[], tint: number) => {
    const a = new Acc(), c = new THREE.Color(tint, tint, tint), [u0, v0, u1, v1] = uv, [b0, c0, b1, c1] = U.bark;
    for (let k = 0; k < 2; k++) {
      const ang = (k / 2) * Math.PI + 0.4, dx = Math.cos(ang) * R, dz = Math.sin(ang) * R;
      const V = (x: number, y: number, z: number, u: number, v: number) => a.v(x, y, z, c, u, v, x / R * 0.6, 0.8, z / R * 0.6);
      a.card(V(-dx, crownY - R * 0.95, -dz, u0, v0), V(dx, crownY - R * 0.95, dz, u1, v0), V(dx, crownY + R * 0.95, dz, u1, v1), V(-dx, crownY + R * 0.95, -dz, u0, v1));
      if (trunkH > 0) { const tx = Math.cos(ang) * 0.2, tz = Math.sin(ang) * 0.2; a.card(a.v(-tx, 0, -tz, white, b0, c0, 0, 0.3, 1), a.v(tx, 0, tz, white, b1, c0, 0, 0.3, 1), a.v(tx, trunkH, tz, white, b1, c1, 0, 0.3, 1), a.v(-tx, trunkH, -tz, white, b0, c1, 0, 0.3, 1)); }
    }
    return a.geo();
  };
  return [mk(6.4, 4.2, 4.6, U.oak, 0.95), mk(11.2, 2.9, 10.2, U.pine, 0.95), mk(3.3, 2.5, 1.8, U.oak, 0.82), mk(0.7, 1.2, 0, U.bush, 1.0)];
}
function windPatch(sh: THREE.WebGLProgramParametersWithUniforms) {
  sh.uniforms.uWind = WIND;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
    #ifdef USE_INSTANCING
      float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
    #else
      float wph = 0.0;
    #endif
    float wamp = max(0.0, position.y - 1.6) * 0.035;
    transformed.x += sin(uWind * 1.7 + wph) * wamp; transformed.z += sin(uWind * 1.3 + wph * 1.3) * wamp * 0.7;`);
}

function Trees({ map, count, shadow }: { map: GameMap; count: number; shadow: boolean }) {
  const { items, blobs } = useMemo(() => {
    const all = treeSpots(map), keep = Math.min(1, count / Math.max(1, all.length));
    const spots = (keep >= 1 ? all : all.filter((_, i) => rand01(i * 12.9898 + 7) < keep)).concat(streetTrees(map), bushSpots(map));
    if (import.meta.env.DEV) (window as unknown as { __trees?: number }).__trees = spots.length;
    const geos = treeGeos(), far = treeFarGeos(), atlas = foliageAtlas();
    const mat = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, alphaTest: 0.42, roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = windPatch; mat.customProgramCacheKey = () => 'crLeaves';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.42 });
    depth.onBeforeCompile = windPatch; depth.customProgramCacheKey = () => 'crLeavesDepth';
    // tiles: the ones behind you or far away are skipped
    const tiles = new Map<string, Spot[][]>();
    for (const s of spots) { const k = `${Math.floor(s.x / 300)},${Math.floor(s.z / 300)}`; let t = tiles.get(k); if (!t) { t = [[], [], [], []]; tiles.set(k, t); } t[s.k]!.push(s); }
    const out: { o: THREE.Object3D; x: number; z: number; r: number; far: THREE.Object3D }[] = [];
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const blob = new Acc(); const white = new THREE.Color(1, 1, 1);
    for (const by of tiles.values()) geos.forEach((g, i) => {
      const list = by[i]!; if (!list.length) return;
      const im = new THREE.InstancedMesh(g, mat, list.length); im.customDepthMaterial = depth;
      const fm = new THREE.InstancedMesh(far[i]!, mat, list.length); fm.castShadow = false; fm.receiveShadow = false;
      list.forEach((s, j) => {
        e.set(0, rand01(j * 7 + i + s.x) * 6.28, 0); qn.setFromEuler(e); pv.set(s.x, 0, s.z); sv.set(s.s, s.s * (0.9 + rand01(j + s.z) * 0.25), s.s); m.compose(pv, qn, sv); im.setMatrixAt(j, m); fm.setMatrixAt(j, m);
        const g2 = 0.82 + rand01(j * 3 + i) * 0.3; c.setRGB(g2 * (0.95 + rand01(j) * 0.1), g2, g2 * (0.9 + rand01(j * 5) * 0.12)); im.setColorAt(j, c); fm.setColorAt(j, c);
        // a soft dark patch on the ground under the crown
        if (i !== 3) { const R = (i === 1 ? 2.6 : i === 2 ? 2.0 : 3.6) * s.s; blob.quad(blob.v(s.x - R, 0.02, s.z - R, white, 0, 0), blob.v(s.x + R, 0.02, s.z - R, white, 1, 0), blob.v(s.x + R, 0.02, s.z + R, white, 1, 1), blob.v(s.x - R, 0.02, s.z + R, white, 0, 1)); }
      });
      im.computeBoundingSphere(); if (im.boundingSphere) im.boundingSphere.radius += 14;
      fm.computeBoundingSphere(); if (fm.boundingSphere) fm.boundingSphere.radius += 14;
      im.castShadow = shadow && i !== 3; im.receiveShadow = false;
      const bs = im.boundingSphere!; out.push({ o: im, far: fm, x: bs.center.x, z: bs.center.z, r: bs.radius });
    });
    return { items: out, blobs: blob.chunks(TILE) };
  }, [map, count, shadow]);
  // near tiles get the full trees, far tiles the cheap cards, beyond the haze nothing
  useFrame(({ camera }) => {
    const cx = camera.position.x, cz = camera.position.z;
    for (const it of items) { const d = Math.hypot(it.x - cx, it.z - cz) - it.r; it.o.visible = d < 110; it.far.visible = d >= 110 && d < DRAW_DIST - 60; }
  });
  useFrame((_, dt) => { WIND.value += Math.min(dt, 0.1); });
  const blobMat = useMemo(() => multiplyDecal({ map: blobTexture() }), []);
  return <>{items.map((m, i) => <group key={i}><primitive object={m.o} /><primitive object={m.far} /></group>)}<Chunks g={blobs} m={blobMat} rec={false} max={260} /></>;
}

// ------------------------------------------------------------------ power lines, hydrants, mailboxes ---
function Utilities({ map, corners, env }: { map: GameMap; corners: Corner[]; env: Env }) {
  const o = useMemo(() => {
    const poles = new Acc(), small = new Acc(), lampHeads = new Acc(); const wires: number[] = [], pools: number[] = [];
    const wood = col('#5f5246'), arm = col('#4c4238'), can = col('#8a8f94');
    for (const e of map.edges) {
      const w = e.way; if (!w.drive || !w.ai || w.rank > 2 || e.len < 70) continue;
      const side = rand01(e.id * 2.7) < 0.5 ? 1 : -1, off = side * (w.width / 2 + 3.3);
      let prev: number[] | null = null; let k = 0;
      for (let s = e.a.clear + 6; s < e.len - e.b.clear - 6; s += 38, k++) {
        const qd = pointOnPoly(e.p, e.cum, s), x = qd.x - qd.tz * off, z = qd.z + qd.tx * off;
        if (buildingAt(map, x, z, 1.2)) { prev = null; continue; }
        prism(poles, x, 0, z, 0.15, 0.11, 10.2, wood, 6);
        const rx = -qd.tz, rz = qd.tx, rot = Math.atan2(rx, rz);
        box(poles, x, 9.3, z, 0.14, 0.14, 2.6, arm, rot);
        if (k % 4 === 2) prism(poles, x + qd.tx * 0.35, 7.0, z + qd.tz * 0.35, 0.3, 0.3, 1.1, can, 8);
        if (k % 2 === 0) {
          // a cobra-head street light on the pole, reaching over the road
          const ox = qd.tz * side, oz = -qd.tx * side, L2 = 2.2;
          box(poles, x + ox * L2 / 2, 8.1, z + oz * L2 / 2, Math.abs(ox) * L2 + 0.08, 0.08, Math.abs(oz) * L2 + 0.08, arm);
          box(lampHeads, x + ox * L2, 7.95, z + oz * L2, Math.abs(ox) > Math.abs(oz) ? 0.7 : 0.3, 0.14, Math.abs(oz) > Math.abs(ox) ? 0.7 : 0.3, col('#ffffff'));
          pools.push(x + ox * (L2 + 0.5), z + oz * (L2 + 0.5));
        }
        const heads = [[x + rx * 1.15, 9.5, z + rz * 1.15], [x - rx * 1.15, 9.5, z - rz * 1.15], [x, 10.25, z], [x, 7.4, z]];
        if (prev) {
          for (let h = 0; h < 4; h++) {
            const a = prev.slice(h * 3, h * 3 + 3), b = heads[h]!, sag = 0.7 + h * 0.08, N = 8;
            for (let i = 0; i < N; i++) {
              const t0 = i / N, t1 = (i + 1) / N;
              wires.push(a[0]! + (b[0]! - a[0]!) * t0, a[1]! + (b[1]! - a[1]!) * t0 - sag * 4 * t0 * (1 - t0), a[2]! + (b[2]! - a[2]!) * t0, a[0]! + (b[0]! - a[0]!) * t1, a[1]! + (b[1]! - a[1]!) * t1 - sag * 4 * t1 * (1 - t1), a[2]! + (b[2]! - a[2]!) * t1);
            }
          }
        }
        prev = heads.flat();
      }
    }
    // fire hydrants at the corners, and the mailboxes at the end of the driveways
    const red = col('#c0312a'), cap = col('#d9d4c8'), post = col('#e8e4da'), black = col('#202226');
    for (const c of corners) {
      if (rand01(c.node.id * 3.3) > 0.4) continue;
      const bx = c.u1[0]! + c.u2[0]!, bz = c.u1[1]! + c.u2[1]!, l = Math.hypot(bx, bz) || 1, x = c.node.x + c.kin[0]! + (bx / l) * 1.1, z = c.node.z + c.kin[1]! + (bz / l) * 1.1;
      prism(small, x, 0.14, z, 0.17, 0.15, 0.62, red, 8); cone(small, x, 0.76, z, 0.19, 0.2, cap, 8); box(small, x, 0.45, z, 0.48, 0.12, 0.12, red);
    }
    for (const mb of parkedWorld(map).mailboxes) { box(small, mb.x, 0, mb.z, 0.09, 1.05, 0.09, post, mb.h); box(small, mb.x, 1.02, mb.z, 0.24, 0.24, 0.5, black, mb.h); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    return { poles: poles.chunks(TILE), small: small.chunks(TILE), heads: lampHeads.chunks(TILE), wires: wg, pools };
  }, [map, corners]);
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7d8187', toneMapped: false }), []);
  useFrame(() => { headMat.color.set('#7d8187').lerp(tmpA.set('#ffd9a0'), env.night); });
  const mats = useMemo(() => ({ pole: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), small: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }), wire: new THREE.LineBasicMaterial({ color: '#1d1e20', transparent: true, opacity: 0.85 }) }), []);
  return <>
    <Chunks g={o.poles} m={mats.pole} cast max={480} /><Chunks g={o.small} m={mats.small} max={220} />
    <lineSegments geometry={o.wires} material={mats.wire} frustumCulled={false} />
    <Chunks g={o.heads} m={headMat} max={480} /><LightPools pts={o.pools} env={env} size={14} k={0.5} />
  </>;
}

// ------------------------------------------------------------------ parked cars ---
const PARKED_KINDS = ['sedan', 'suv', 'pickup', 'hatch', 'van'] as const;
function ParkedCars({ map, max, shadow }: { map: GameMap; max: number; shadow: boolean }) {
  const o = useMemo(() => {
    const pw = parkedWorld(map);
    const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.5, envMapIntensity: 1.1 });
    const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
    const near = Object.fromEntries(PARKED_KINDS.map((k) => {
      const g = vehicleGeo(k), n = Math.max(1, pw.cars.filter((c) => c.kind === k).length);
      const ip = new THREE.InstancedMesh(g.paint, paint, n), id = new THREE.InstancedMesh(g.detail, detail, n);
      for (const im of [ip, id]) { im.frustumCulled = false; im.count = 0; im.castShadow = shadow; }
      ip.setColorAt(0, new THREE.Color(1, 1, 1));
      return [k, { ip, id }];
    })) as unknown as Record<typeof PARKED_KINDS[number], { ip: THREE.InstancedMesh; id: THREE.InstancedMesh }>;
    // the far version of a car: body and cabin, with dark glass (about 50 triangles)
    const pa = new Acc(), bodyC = new THREE.Color(1, 1, 1), glassC = new THREE.Color(0.08, 0.09, 0.11), tyre = new THREE.Color(0.05, 0.05, 0.05);
    box(pa, 0, 0.3, 0, 1.82, 0.72, 4.5, bodyC); box(pa, 0, 1.02, 0.25, 1.58, 0.5, 2.3, glassC); box(pa, 0, 1.5, 0.25, 1.5, 0.06, 2.0, bodyC); box(pa, 0, 0.0, 0, 1.9, 0.32, 3.3, tyre);
    const proxy = new THREE.InstancedMesh(pa.geo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), Math.max(1, pw.cars.length));
    proxy.frustumCulled = false; proxy.count = 0; proxy.setColorAt(0, new THREE.Color(1, 1, 1));
    const blob = new Acc(), white = new THREE.Color(1, 1, 1);
    const mats = pw.cars.map((p) => {
      const fx = Math.sin(p.h), fz = Math.cos(p.h), L = 3.1, W = 1.45, rx = fz * W, rz = -fx * W;
      blob.quad(blob.v(p.x - fx * L - rx, 0.03, p.z - fz * L - rz, white, 0, 0), blob.v(p.x + fx * L - rx, 0.03, p.z + fz * L - rz, white, 1, 0), blob.v(p.x + fx * L + rx, 0.03, p.z + fz * L + rz, white, 1, 1), blob.v(p.x - fx * L + rx, 0.03, p.z - fz * L + rz, white, 0, 1));
      return new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.h + Math.PI, 0)), new THREE.Vector3(1, 1, 1));
    });
    return { pw, near, proxy, mats, blobs: blob.chunks(TILE) };
  }, [map, shadow]);
  const root = useRef<THREE.Group>(null);
  useEffect(() => { const g = root.current; if (!g) return; const all = [o.proxy, ...Object.values(o.near).flatMap((n) => [n.ip, n.id])]; g.add(...all); return () => { g.remove(...all); }; }, [o]);
  const last = useRef({ x: 1e9, z: 1e9 });
  // every few metres the camera moves: the cars within 55 m get the full model, the rest out to `max` the simple one
  useFrame(({ camera }) => {
    const cx = camera.position.x, cz = camera.position.z;
    if (Math.hypot(cx - last.current.x, cz - last.current.z) < 4) return;
    last.current.x = cx; last.current.z = cz;
    const cnt: Record<string, number> = {}; let pi = 0;
    o.pw.cars.forEach((p, i) => {
      const d = Math.hypot(p.x - cx, p.z - cz); if (d > max) return;
      if (d < 55) { const n = o.near[p.kind]; const k = cnt[p.kind] ?? 0; cnt[p.kind] = k + 1; n.ip.setMatrixAt(k, o.mats[i]!); n.id.setMatrixAt(k, o.mats[i]!); n.ip.setColorAt(k, tmpC.setHex(p.color)); }
      else { o.proxy.setMatrixAt(pi, o.mats[i]!); o.proxy.setColorAt(pi, tmpC.setHex(p.color)); pi++; }
    });
    for (const k of PARKED_KINDS) { const n = o.near[k], c = cnt[k] ?? 0; for (const im of [n.ip, n.id]) { im.count = c; im.visible = c > 0; im.instanceMatrix.needsUpdate = true; } if (n.ip.instanceColor) n.ip.instanceColor.needsUpdate = true; }
    o.proxy.count = pi; o.proxy.visible = pi > 0; o.proxy.instanceMatrix.needsUpdate = true; if (o.proxy.instanceColor) o.proxy.instanceColor.needsUpdate = true;
  });
  const blobMat = useMemo(() => multiplyDecal({ map: blobTexture() }), []);
  return <><group ref={root} /><Chunks g={o.blobs} m={blobMat} rec={false} max={max} /></>;
}

// ------------------------------------------------------------------ pools of lamplight on the ground at night ---
function LightPools({ pts, env, size = 16, color = '#ffcf8a', k = 0.55 }: { pts: number[]; env: Env; size?: number; color?: string; k?: number }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: glowDot(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }), [color]);
  const im = useMemo(() => {
    const n = pts.length / 2; const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, Math.max(1, n)); m.count = n; m.frustumCulled = false;
    const mx = new THREE.Matrix4(); for (let i = 0; i < n; i++) { mx.compose(new THREE.Vector3(pts[i * 2]!, 0.16, pts[i * 2 + 1]!), new THREE.Quaternion(), new THREE.Vector3(size, 1, size)); m.setMatrixAt(i, mx); }
    return m;
  }, [pts, mat, size]);
  useFrame(() => { mat.opacity = env.night * k; im.visible = env.night > 0.04; });
  return <primitive object={im} />;
}

// ------------------------------------------------------------------ street lamps ---
function Lamps({ map, env }: { map: GameMap; env: Env }) {
  const o = useMemo(() => {
    const pole = new Acc(), head = new Acc(); const metal = col('#3b3f45'), lamp = col('#ffffff');
    const pools: number[] = [];
    for (const e of map.edges) {
      const w = e.way; if (!w.ai || w.rank < 3 || !w.name || e.len < 40) continue;
      const hw = w.width / 2; let flip = 1;
      for (let s = e.a.clear + 14; s < e.len - e.b.clear - 10; s += 42) {
        const qd = pointOnPoly(e.p, e.cum, s), off = flip * (hw + 1.7); flip = -flip;
        const x = qd.x - qd.tz * off, z = qd.z + qd.tx * off;
        prism(pole, x, 0, z, 0.08, 0.05, 7.4, metal, 6);
        const ax = -qd.tz * -Math.sign(off) * 1.5, az = qd.tx * -Math.sign(off) * 1.5;
        box(pole, x + ax / 2, 7.3, z + az / 2, Math.abs(ax) + 0.1, 0.1, Math.abs(az) + 0.1, metal);
        box(head, x + ax, 7.15, z + az, Math.abs(ax) > Math.abs(az) ? 0.9 : 0.35, 0.16, Math.abs(az) > Math.abs(ax) ? 0.9 : 0.35, lamp);
        pools.push(x + ax, z + az);
      }
    }
    return { pole: pole.chunks(TILE), head: head.chunks(TILE), pools };
  }, [map]);
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#7d8187', toneMapped: false }), []);
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), []);
  useFrame(() => { headMat.color.set('#7d8187').lerp(tmpA.set('#ffe2a8'), env.night); });
  return <>
    <Chunks g={o.pole} m={poleMat} cast max={480} /><Chunks g={o.head} m={headMat} max={480} /><LightPools pts={o.pools} env={env} />
  </>;
}

// ------------------------------------------------------------------ signals ---
function Signals({ map, sim }: { map: GameMap; sim: OpenSim }) {
  const o = useMemo(() => {
    const pole = new Acc(), headBody = new Acc(); const metal = col('#2e3238'), black = col('#14161a'), hood = col('#101114');
    const lamps: { x: number; y: number; z: number; ux: number; uz: number; node: typeof map.nodes[number]; phase: number }[] = [];
    for (const n of map.nodes) {
      if (!n.signal) continue;
      for (const arm of n.arms) {
        if (!arm.inbound) continue;
        const e = arm.edge, hw = e.way.width / 2, ux = Math.sin(arm.bearing), uz = Math.cos(arm.bearing);
        const rx = uz, rz = -ux;
        const bx = n.x + ux * (n.clear + 2.2) + rx * (hw + 1.5), bz = n.z + uz * (n.clear + 2.2) + rz * (hw + 1.5);
        prism(pole, bx, 0, bz, 0.12, 0.09, 6.4, metal, 8);
        const armLen = hw * 0.9, hx = bx - rx * armLen, hz = bz - rz * armLen;
        box(pole, (bx + hx) / 2, 6.1, (bz + hz) / 2, Math.abs(rx) * armLen + 0.14, 0.14, Math.abs(rz) * armLen + 0.14, metal);
        for (const [px, pz, py] of [[hx, hz, 5.2], [bx + ux * 0.3, bz + uz * 0.3, 2.9]] as [number, number, number][]) {
          const rotY = Math.atan2(ux, uz);
          box(headBody, px, py - 0.55, pz, 0.38, 1.1, 0.32, black, rotY);
          box(headBody, px + ux * 0.12, py + 0.52, pz + uz * 0.12, 0.44, 0.04, 0.5, hood, rotY);
          for (let k = 0; k < 3; k++) lamps.push({ x: px + ux * 0.17, y: py + 0.22 - k * 0.36, z: pz + uz * 0.17, ux, uz, node: n, phase: e.phase[arm.end] });
        }
      }
    }
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, lamps.length)); im.count = lamps.length; im.frustumCulled = false;
    const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), e = new THREE.Euler(); lamps.forEach((l, i) => { e.set(0, Math.atan2(l.ux, l.uz), 0); qn.setFromEuler(e); m.compose(new THREE.Vector3(l.x, l.y, l.z), qn, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m); im.setColorAt(i, new THREE.Color(0x222222)); });
    return { pole: pole.geo(), body: headBody.geo(), im, lamps };
  }, [map]);
  const mats = useMemo(() => ({ metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }) }), []);
  const on = useMemo(() => [new THREE.Color('#ff3326').multiplyScalar(2.2), new THREE.Color('#ffc21a').multiplyScalar(2.2), new THREE.Color('#2dff7a').multiplyScalar(2.0)], []);
  const off = useMemo(() => [new THREE.Color('#2b0b08'), new THREE.Color('#2d2305'), new THREE.Color('#06210f')], []);
  useFrame(() => {
    const { im, lamps } = o; if (!lamps.length) return;
    for (let i = 0; i < lamps.length; i += 3) {
      const st = signalState(lamps[i]!.node, lamps[i]!.phase, sim.time), lit = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
      for (let k = 0; k < 3; k++) im.setColorAt(i + k, k === lit ? on[k]! : off[k]!);
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return <><mesh geometry={o.pole} material={mats.metal} castShadow /><mesh geometry={o.body} material={mats.metal} castShadow /><primitive object={o.im} /></>;
}

// ------------------------------------------------------------------ the railroad crossings: gates and flashers ---
function RailGates({ map, sim }: { map: GameMap; sim: OpenSim }) {
  const root = useRef<THREE.Group>(null);
  const spec = useMemo(() => sim.trains.crossings.map((c) => {
    const hit = map.roadAt(c.x, c.z), hw = (hit ? hit.edge.way.width : 8) / 2, tx = Math.sin(c.lx.ang), tz = Math.cos(c.lx.ang);
    return { c, hw, tx, tz };
  }), [map, sim]);
  const lampOn = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }), []);
  const lampOff = useMemo(() => new THREE.MeshBasicMaterial({ color: '#3a0c08', toneMapped: false }), []);
  const arms = useRef<THREE.Group[]>([]), lamps = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    spec.forEach((s, i) => {
      for (let k = 0; k < 2; k++) {
        const a = arms.current[i * 2 + k]; if (a) a.rotation.x = -(1 - s.c.gate) * (Math.PI / 2) * 0.97;
        for (let j = 0; j < 2; j++) { const l = lamps.current[(i * 2 + k) * 2 + j]; if (l) l.material = s.c.warn && (Math.floor(t * 2.2) % 2 === j) ? lampOn : lampOff; }
      }
    });
  });
  return <group ref={root}>
    {spec.map((s, i) => [1, -1].map((sd, k) => {
      const rx = s.tz * sd, rz = -s.tx * sd;
      const bx = s.c.x + s.tx * 9.5 * sd + rx * (s.hw + 1.3), bz = s.c.z + s.tz * 9.5 * sd + rz * (s.hw + 1.3);
      const armLen = s.hw + 0.4, dirx = -rx, dirz = -rz;
      return <group key={`${i}:${sd}`} position={[bx, 0, bz]}>
        <mesh position={[0, 1.2, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, 2.4, 8]} /><meshStandardMaterial color="#d8d8d4" roughness={0.6} /></mesh>
        <group position={[0, 1.15, 0]} rotation-y={Math.atan2(dirx, dirz)}>
          <group ref={(g) => { if (g) arms.current[i * 2 + k] = g; }}>
            {Array.from({ length: 7 }).map((_, j) => <mesh key={j} position={[0, 0, (armLen / 7) * (j + 0.5)]} castShadow><boxGeometry args={[0.08, 0.14, armLen / 7]} /><meshStandardMaterial color={j % 2 ? '#f4f4f0' : '#d4281c'} roughness={0.6} /></mesh>)}
          </group>
        </group>
        <group position={[0, 2.1, 0]} rotation-y={Math.atan2(s.tx * sd, s.tz * sd)}>
          <mesh position={[0, 0, 0.11]}><boxGeometry args={[0.86, 0.07, 0.05]} /><meshStandardMaterial color="#1c1d20" roughness={0.6} /></mesh>
          {[0, 1].map((j) => <group key={j} position={[0.3 * (j ? 1 : -1), 0, 0.14]}>
            <mesh><circleGeometry args={[0.2, 18]} /><meshStandardMaterial color="#111214" roughness={0.7} /></mesh>
            <mesh position={[0, 0, 0.01]} ref={(m) => { if (m) lamps.current[(i * 2 + k) * 2 + j] = m; }} material={lampOff}><circleGeometry args={[0.11, 14]} /></mesh>
          </group>)}
        </group>
      </group>;
    }))}
  </group>;
}

// ------------------------------------------------------------------ the courthouse clock tower ---
function Courthouse({ geo }: { geo: TownGeo }) {
  const b = geo.courthouse, H = b ? geo.heights.get(b.id) ?? 10 : 10;
  const o = useMemo(() => {
    if (!b) return null;
    const stone = new Acc(), roof = new Acc();
    const s = col('#e3dccb'), t = col('#cfc6b0'), cu = col('#5e9a86'), gold = col('#caa24a');
    box(stone, b.cx, H, b.cz, 8.4, 9, 8.4, s); box(stone, b.cx, H + 9, b.cz, 6.6, 3.4, 6.6, t); box(stone, b.cx, H + 12.4, b.cz, 5.2, 3.2, 5.2, s);
    box(stone, b.cx, H + 8.7, b.cz, 9.0, 0.35, 9.0, t); box(stone, b.cx, H + 12.2, b.cz, 7.0, 0.3, 7.0, s);
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [2.2, 2.2], [-2.2, 2.2]]) prism(stone, b.cx + dx!, H + 15.6, b.cz + dz!, 0.22, 0.22, 2.6, t, 8);
    cone(roof, b.cx, H + 18.2, b.cz, 3.4, 4.2, cu, 8); prism(roof, b.cx, H + 22.2, b.cz, 0.12, 0.05, 3, gold, 6);
    return { stone: stone.geo(), roof: roof.geo() };
  }, [b, H]);
  const clock = useMemo(() => clockTexture(), []);
  if (!b || !o) return null;
  return <group>
    <mesh geometry={o.stone} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={0.8} /></mesh>
    <mesh geometry={o.roof} castShadow><meshStandardMaterial vertexColors roughness={0.6} metalness={0.3} side={THREE.DoubleSide} /></mesh>
    {[0, 1, 2, 3].map((i) => { const a = (i * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a); return <mesh key={i} position={[b.cx + nx * 2.65, H + 14, b.cz + nz * 2.65]} rotation-y={a}><circleGeometry args={[1.15, 24]} /><meshStandardMaterial map={clock} emissiveMap={clock} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.5} /></mesh>; })}
  </group>;
}

// ------------------------------------------------------------------ the traffic ---
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();
function put(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry: number, s = 1, sx = s, sz = s) { tmpE.set(0, ry, 0); tmpQ.setFromEuler(tmpE); tmpP.set(x, y, z); tmpS.set(sx, s, sz); tmpM.compose(tmpP, tmpQ, tmpS); m.setMatrixAt(i, tmpM); }
const hideAt = (m: THREE.InstancedMesh, from: number, to: number) => { for (let i = from; i < to; i++) put(m, i, 0, -999, 0, 0, 0.0001); };

export function TrafficCars({ sim, env }: { sim: OpenSim; env: Env }) {
  const root = useRef<THREE.Group>(null);
  const parts = useMemo(() => {
    const paint = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.5, envMapIntensity: 1.2 });
    const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
    const tail = new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false });
    const head = new THREE.MeshBasicMaterial({ color: '#fff1c8', toneMapped: false });
    const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colored: boolean) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; if (colored) m.setColorAt(0, new THREE.Color(1, 1, 1)); hideAt(m, 0, n); return m; };
    return ALL_KINDS.map((k) => { const g = vehicleGeo(k), n = MAX_PER_KIND[k]; const pm = make(g.paint, paint, n, true); pm.castShadow = true; return { k, paint: pm, detail: make(g.detail, detail, n, false), tail: make(g.tail, tail, n, true), head: make(g.head, head, n, true), n }; });
  }, []);
  // a soft shadow under every car, so they sit on the road even where the sun's shadow does not reach
  const blobs = useMemo(() => { const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), multiplyDecal({ map: blobTexture() }), 96); im.frustumCulled = false; im.count = 0; return im; }, []);
  // far cars: a simple body and cabin (the detailed models cost ~2000 triangles each)
  const proxy = useMemo(() => {
    const pa = new Acc(), bodyC = new THREE.Color(1, 1, 1), glassC = new THREE.Color(0.08, 0.09, 0.11), tyre = new THREE.Color(0.05, 0.05, 0.05);
    box(pa, 0, 0.3, 0, 1.82, 0.72, 4.5, bodyC); box(pa, 0, 1.02, 0.25, 1.58, 0.5, 2.3, glassC); box(pa, 0, 1.5, 0.25, 1.5, 0.06, 2.0, bodyC); box(pa, 0, 0.0, 0, 1.9, 0.32, 3.3, tyre);
    const im = new THREE.InstancedMesh(pa.geo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 }), 96); im.frustumCulled = false; im.count = 0; im.setColorAt(0, new THREE.Color(1, 1, 1)); return im;
  }, []);
  // at night: the light of the headlights on the road ahead of each car
  const beams = useMemo(() => { const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowDot(), color: '#fff0cf', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false }), 96); im.frustumCulled = false; im.count = 0; return im; }, []);
  useEffect(() => {
    const g = root.current; if (!g) return;
    for (const b of parts) g.add(b.paint, b.detail, b.tail, b.head);
    g.add(blobs, beams, proxy);
    return () => { for (const b of parts) g.remove(b.paint, b.detail, b.tail, b.head); g.remove(blobs, beams, proxy); };
  }, [parts, blobs, beams, proxy]);
  const counts = useRef(new Map<string, number>());
  useFrame(({ clock, camera }) => {
    counts.current.clear();
    const n = env.night, lamp = 0.5 + 0.6 * n;
    let bi = 0, pi = 0;
    const cx = camera.position.x, cz = camera.position.z;
    for (const c of sim.traffic.cars) {
      const far = Math.hypot(c.x - cx, c.z - cz) > 85 && c.kind !== 'box';
      if (far && pi < 96) {
        put(proxy, pi, c.x, 0, c.z, c.h, 1, (c.w ?? 1.85) / 1.82, (c.len ?? 4.6) / 4.5); proxy.setColorAt(pi, tmpC.setHex(c.color)); pi++;
        if (bi < 96) { put(blobs, bi, c.x, 0.05, c.z, c.h, 1, (c.w ?? 1.9) + 1.0, (c.len ?? 4.6) + 1.4); const ahead = (c.len ?? 4.6) / 2 + 6.5; put(beams, bi, c.x + Math.sin(c.h) * ahead, 0.17, c.z + Math.cos(c.h) * ahead, c.h, 1, 5.5, 13); bi++; }
        continue;
      }
      const b = parts.find((p) => p.k === c.kind) ?? parts[0]!;
      const i = counts.current.get(c.kind) ?? 0; if (i >= b.n) continue; counts.current.set(c.kind, i + 1);
      const ry = c.h + Math.PI;
      const skew = c.hit > 0 ? Math.sin(clock.elapsedTime * 30) * 0.02 : 0;
      put(b.paint, i, c.x, 0, c.z, ry + skew); put(b.detail, i, c.x, 0, c.z, ry + skew); put(b.tail, i, c.x, 0, c.z, ry + skew); put(b.head, i, c.x, 0, c.z, ry + skew);
      b.paint.setColorAt(i, tmpC.setHex(c.color));
      b.tail.setColorAt(i, tmpC.setScalar(c.brake || c.v < 0.3 ? 1.5 : lamp * 0.55));
      b.head.setColorAt(i, tmpC.setScalar(0.25 + 0.9 * n));
      if (bi < 96) { put(blobs, bi, c.x, 0.05, c.z, c.h, 1, (c.w ?? 1.9) + 1.0, (c.len ?? 4.6) + 1.4); const ahead = (c.len ?? 4.6) / 2 + 6.5; put(beams, bi, c.x + Math.sin(c.h) * ahead, 0.17, c.z + Math.cos(c.h) * ahead, c.h, 1, 5.5, 13); bi++; }
    }
    blobs.count = bi; blobs.instanceMatrix.needsUpdate = true;
    proxy.count = pi; proxy.visible = pi > 0; proxy.instanceMatrix.needsUpdate = true; if (proxy.instanceColor) proxy.instanceColor.needsUpdate = true;
    beams.count = n > 0.25 ? bi : 0; beams.visible = n > 0.25; (beams.material as THREE.MeshBasicMaterial).opacity = 0.42 * n; beams.instanceMatrix.needsUpdate = true;
    for (const b of parts) {
      const cnt = counts.current.get(b.k) ?? 0;
      for (const m of [b.paint, b.detail, b.tail, b.head]) { m.count = cnt; m.visible = cnt > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  });
  return <group ref={root} />;
}

// ------------------------------------------------------------------ the player's car ---
const SWATCH: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.swatch]));
const PLATE: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.plate]));
export function PlayerRig({ sim, carId, lite }: { sim: OpenSim; carId: GarageId; lite: boolean }) {
  const night = useContext(NightCtx);
  const pos = useRef<THREE.Group>(null), yaw = useRef<THREE.Group>(null), lean = useRef<THREE.Group>(null), blob = useRef<THREE.Mesh>(null);
  const signal = useRef<CarSignal>({ left: false, right: false, head: true, reverse: false });
  const wheels = useRef<WheelState>({ steer: 0, dist: 0 });
  const brake = useRef(0);
  const blobMat = useMemo(() => multiplyDecal({ map: blobTexture() }), []);
  useFrame(({ clock }, dt) => {
    const p = pos.current, y = yaw.current, l = lean.current; if (!p || !y || !l) return;
    dt = Math.min(dt, 0.05); const t = clock.elapsedTime;
    p.position.set(sim.x, 0, sim.z);
    y.rotation.y = sim.h - Math.PI / 2;
    l.rotation.z = clamp(-sim.pitch * 1.0, -0.06, 0.06); l.rotation.x = clamp(sim.roll, -0.07, 0.07);
    l.position.y = Math.sin(t * 26) * 0.005 * Math.min(1, sim.mph / 30);
    wheels.current.steer = damp(wheels.current.steer, clamp(sim.steer / 0.62, -1, 1) * 0.42, 14, dt);
    wheels.current.dist += sim.v * dt; wheels.current.pitch = l.rotation.z; wheels.current.roll = l.rotation.x;
    signal.current.left = sim.signalDir === -1; signal.current.right = sim.signalDir === 1; signal.current.reverse = sim.reversing; signal.current.head = true;
    p.visible = !(sim.time < sim.invulnUntil && Math.floor(t * 14) % 2 === 0);
    brake.current = damp(brake.current, sim.braking && !sim.finished ? 1 : night.current > 0.3 ? 0.35 : 0, 25, dt);
  });
  return <group ref={pos}>
    <group ref={yaw} rotation-y={Math.PI / 2}>
      <mesh ref={blob} material={blobMat} position={[0, 0.06, 0]} rotation-x={-Math.PI / 2} scale={[7.6, 3.8, 1]} renderOrder={1}><planeGeometry args={[1, 1]} /></mesh>
      <group ref={lean}>
        <Suspense fallback={null}><FleetCar specId={carId} color={SWATCH[carId] ?? '#f2b92a'} plate={PLATE[carId] ?? 'DK00GO'} position={[0, 0, 0]} lite={lite} signal={signal} wheels={wheels} /></Suspense>
        <BrakeGlow id={carId} brake={brake} />
      </group>
      <Beams id={carId} sim={sim} />
    </group>
  </group>;
}

// ------------------------------------------------------------------ people ---
const SHIRTS = ['#c0392b', '#2c6fbb', '#2e8b57', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#34495e', '#d35498'], SKIN = ['#f1c8a5', '#e0ac82', '#c68a5d', '#8d5a3a', '#6b4128'], PANTS = ['#2a2f3a', '#3b4a63', '#4b3b2e', '#1d1d1f', '#5a5f66'];
export function People({ sim }: { sim: OpenSim }) {
  const N = 48;
  const o = useMemo(() => {
    const mk = (g: THREE.BufferGeometry, hex = '#ffffff') => { const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }), N); im.frustumCulled = false; im.castShadow = true; im.setColorAt(0, new THREE.Color(1, 1, 1)); hideAt(im, 0, N); return im; };
    return {
      torso: mk(new THREE.CapsuleGeometry(0.19, 0.42, 3, 8).scale(1, 1, 0.65).translate(0, 1.2, 0)), head: mk(new THREE.SphereGeometry(0.115, 10, 8).translate(0, 1.66, 0)),
      legL: mk(new THREE.CapsuleGeometry(0.075, 0.68, 2, 6).translate(0.09, -0.42, 0)), legR: mk(new THREE.CapsuleGeometry(0.075, 0.68, 2, 6).translate(-0.09, -0.42, 0)),
    };
  }, []);
  const root = useRef<THREE.Group>(null);
  useEffect(() => { const g = root.current; if (!g) return; g.add(o.torso, o.head, o.legL, o.legR); return () => { g.remove(o.torso, o.head, o.legL, o.legR); }; }, [o]);
  const e = useMemo(() => new THREE.Euler(), []), qn = useMemo(() => new THREE.Quaternion(), []), m = useMemo(() => new THREE.Matrix4(), []), one = useMemo(() => new THREE.Vector3(1, 1, 1), []), pv = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    let i = 0; const list: { x: number; z: number; h: number; look: number; phase: number; moving: boolean; base: number }[] = [];
    for (const p of sim.peds.list) list.push({ x: p.x, z: p.z, h: p.h, look: p.look, phase: p.phase, moving: p.state === 'walk' && !p.hit, base: p.onRoad ? 0 : 0.14 });
    for (const s of sim.peds.strollers) list.push({ x: s.x, z: s.z, h: s.h, look: s.look, phase: s.phase, moving: true, base: 0.14 });
    for (const p of list) {
      if (i >= N) break;
      const sw = p.moving ? Math.sin(p.phase) * 0.5 : 0, bob = p.moving ? Math.abs(Math.sin(p.phase)) * 0.03 : 0;
      const base = p.base;
      const set = (im: THREE.InstancedMesh, rx: number, y: number) => { e.set(rx, p.h, 0, 'YXZ'); qn.setFromEuler(e); pv.set(p.x, y + bob + base, p.z); m.compose(pv, qn, one); im.setMatrixAt(i, m); };
      set(o.torso, 0, 0); set(o.head, 0, 0); set(o.legL, sw, 0.84); set(o.legR, -sw, 0.84);
      o.torso.setColorAt(i, tmpC.set(SHIRTS[p.look % SHIRTS.length]!)); o.head.setColorAt(i, tmpC.set(SKIN[p.look % SKIN.length]!)); o.legL.setColorAt(i, tmpC.set(PANTS[(p.look + 2) % PANTS.length]!)); o.legR.setColorAt(i, tmpC);
      i++;
    }
    for (const im of [o.torso, o.head, o.legL, o.legR]) { im.count = i; im.visible = i > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  });
  return <group ref={root} />;
}

// ------------------------------------------------------------------ the train ---
export function TrainView({ sim }: { sim: OpenSim }) {
  const N = 48;
  const o = useMemo(() => {
    const mk = (g: THREE.BufferGeometry) => { const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), N); im.frustumCulled = false; hideAt(im, 0, N); im.castShadow = true; return im; };
    const loco = new Acc(), boxcar = new Acc(), tank = new Acc(), hopper = new Acc();
    const red = col('#9c2a22'), dark = col('#222428'), yel = col('#e0b02a'), rust = col('#7a4a32'), blk = col('#1b1c1f'), grey = col('#8b8f94'), tan = col('#c2b79a'), glass = col('#2b3a48');
    const boxZ = (a: Acc, w: number, h: number, l: number, y: number, c: THREE.Color, dz = 0, dx = 0) => box(a, dx, y, dz, w, h, l, c);
    // the locomotive: long hood, a cab with windows near the front, a yellow stripe, handrails, the fuel tank between the trucks
    boxZ(loco, 2.9, 3.0, 16.4, 1.15, red); boxZ(loco, 3.05, 0.3, 17.6, 0.9, yel); boxZ(loco, 3.1, 0.75, 4.2, 1.2, dark, -6.2);
    boxZ(loco, 3.0, 1.3, 4.0, 4.15, red, 6.2); boxZ(loco, 3.06, 0.62, 3.2, 4.45, glass, 6.2); boxZ(loco, 2.6, 0.62, 0.08, 4.45, glass, 8.25);
    boxZ(loco, 2.2, 0.5, 3.0, 4.15, dark, -2.5); boxZ(loco, 0.6, 0.5, 0.6, 4.6, dark, -5.5);
    for (const sx of [-1.52, 1.52]) boxZ(loco, 0.04, 0.04, 16.4, 2.3, yel, 0, sx);
    boxZ(boxcar, 3.0, 3.6, 15.6, 1.2, rust); boxZ(boxcar, 3.1, 0.25, 15.8, 4.8, grey); boxZ(boxcar, 3.08, 3.0, 2.6, 1.4, rust.clone().multiplyScalar(0.8), 0);
    for (let k = -6; k <= 6; k += 1.5) boxZ(boxcar, 3.04, 3.4, 0.08, 1.3, rust.clone().multiplyScalar(0.85), k);
    prismZ(tank, 1.5, 15, 1.0, grey); boxZ(tank, 2.2, 0.5, 15.6, 0.95, blk); boxZ(tank, 1.0, 0.3, 1.0, 4.0, grey);
    boxZ(hopper, 3.0, 2.4, 15, 1.8, tan); boxZ(hopper, 2.4, 1.6, 15, 0.7, grey);
    for (let k = -5; k <= 5; k += 2.5) boxZ(hopper, 3.04, 2.3, 0.1, 1.85, tan.clone().multiplyScalar(0.85), k);
    for (const a of [loco, boxcar, tank, hopper]) for (const dz of [-5.5, 5.5]) { boxZ(a, 2.4, 0.9, 2.6, 0.15, blk, dz); for (const sx of [-0.72, 0.72]) for (const wz of [-0.85, 0.85]) boxZ(a, 0.14, 0.82, 0.82, 0.1, blk, dz + wz, sx); }
    return { loco: mk(loco.geo()), box: mk(boxcar.geo()), tank: mk(tank.geo()), hopper: mk(hopper.geo()) };
  }, []);
  const root = useRef<THREE.Group>(null);
  useEffect(() => { const g = root.current; if (!g) return; g.add(o.loco, o.box, o.tank, o.hopper); return () => { g.remove(o.loco, o.box, o.tank, o.hopper); }; }, [o]);
  useFrame(() => {
    const cnt = { loco: 0, box: 0, tank: 0, hopper: 0 };
    for (const t of sim.trains.trains) for (const pc of t.pieces) { const k = pc.kind as keyof typeof cnt; const im = o[k]; const i = cnt[k]++; if (i < N) put(im, i, pc.x, 0.1, pc.z, pc.h); }
    for (const k of ['loco', 'box', 'tank', 'hopper'] as const) { o[k].count = Math.min(N, cnt[k]); o[k].visible = cnt[k] > 0; o[k].instanceMatrix.needsUpdate = true; }
  });
  return <group ref={root} />;
}
function prismZ(a: Acc, r: number, l: number, y: number, c: THREE.Color) {
  const seg = 12, ring0: number[] = [], ring1: number[] = [];
  for (let i = 0; i <= seg; i++) { const t = (i / seg) * Math.PI * 2, cx = Math.cos(t) * r, cy = y + r + Math.sin(t) * r; ring0.push(a.v(cx, cy, -l / 2, c, i / seg, 0, Math.cos(t), Math.sin(t), 0)); ring1.push(a.v(cx, cy, l / 2, c, i / seg, 1, Math.cos(t), Math.sin(t), 0)); }
  for (let i = 0; i < seg; i++) a.quad(ring0[i]!, ring0[i + 1]!, ring1[i + 1]!, ring1[i]!);
}

// ------------------------------------------------------------------ the trip: beacon and route arrows ---
const ROUTE_AHEAD = 220;
export function Beacon({ sim }: { sim: OpenSim }) {
  const grp = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null), line = useRef<THREE.Mesh>(null);
  const beam = useMemo(() => new THREE.MeshBasicMaterial({ map: beamTexture(), color: '#ffcf5a', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }), []);
  const chev = useMemo(() => chevronTexture(), []);
  const lineMat = useMemo(() => new THREE.MeshBasicMaterial({ map: chev, color: '#56b8ff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, vertexColors: true }), [chev]);
  const lastRoute = useRef<unknown>(null); const geoRef = useRef<THREE.BufferGeometry | null>(null);
  useFrame(({ clock, camera }, dt) => {
    const ms = sim.mission, g = grp.current; if (!g) return;
    g.visible = !!ms;
    if (ms) {
      g.position.set(ms.x, 0, ms.z);
      const d = Math.hypot(camera.position.x - ms.x, camera.position.z - ms.z);
      beam.opacity = 0.55 * clamp((d - 12) / 40, 0.15, 1);
      if (ring.current) { ring.current.rotation.z = clock.elapsedTime * 1.2; const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.06; ring.current.scale.set(s, s, 1); }
    }
    chev.offset.y -= Math.min(dt, 0.05) * 0.9;
    const l = line.current; if (!l) return;
    const r = sim.route;
    if (r && (lastRoute.current !== r || (sim.time * 4 | 0) % 4 === 0)) {
      lastRoute.current = r;
      let bi = 0, bd = 1e9; for (let k = 0; k < r.pts.length; k += 2) { const d = Math.hypot(r.pts[k]! - sim.x, r.pts[k + 1]! - sim.z); if (d < bd) { bd = d; bi = k; } }
      const pts: number[] = []; let acc = 0;
      for (let k = bi; k < r.pts.length; k += 2) { pts.push(r.pts[k]!, r.pts[k + 1]!); if (k > bi) acc += Math.hypot(r.pts[k]! - r.pts[k - 2]!, r.pts[k + 1]! - r.pts[k - 1]!); if (acc > ROUTE_AHEAD) break; }
      // a strip of arrows 1.1 m wide in the lane, fading in near the car and out at the far end
      const pos: number[] = [], uv: number[] = [], cl: number[] = [], idx: number[] = []; const W = 0.55; let s = 0;
      for (let k = 0; k < pts.length; k += 2) {
        if (k) s += Math.hypot(pts[k]! - pts[k - 2]!, pts[k + 1]! - pts[k - 1]!);
        const px = pts[k]!, pz = pts[k + 1]!, nx = pts[Math.min(k + 2, pts.length - 2)]! - pts[Math.max(k - 2, 0)]!, nz = pts[Math.min(k + 3, pts.length - 1)]! - pts[Math.max(k - 1, 1)]!, ln = Math.hypot(nx, nz) || 1, rx = -nz / ln * W, rz = nx / ln * W;
        const a = clamp((s - 4) / 10, 0, 1) * clamp((ROUTE_AHEAD - s) / 60, 0, 1);
        pos.push(px - rx, 0.16, pz - rz, px + rx, 0.16, pz + rz); uv.push(0, s / 3.2, 1, s / 3.2); cl.push(1, 1, 1, a, 1, 1, 1, a);
        if (k) { const v = (k / 2) * 2; idx.push(v - 2, v - 1, v + 1, v - 2, v + 1, v); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cl, 4)); geo.setIndex(idx);
      geoRef.current?.dispose(); geoRef.current = geo; l.geometry = geo;
    }
    l.visible = !!r;
  });
  return <>
    <group ref={grp}>
      <mesh position={[0, 14, 0]} material={beam} renderOrder={30}><cylinderGeometry args={[1.5, 1.5, 28, 24, 1, true]} /></mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.18, 0]} material={ringMat}><ringGeometry args={[4.4, 5.0, 48]} /></mesh>
    </group>
    <mesh ref={line} material={lineMat} renderOrder={12} frustumCulled={false}><bufferGeometry /></mesh>
  </>;
}

// ------------------------------------------------------------------ everything together ---
export function OpenWorld({ sim, env, quality, shadowOn }: { sim: OpenSim; env: Env; quality: Quality; shadowOn: boolean }) {
  const map = useMemo(() => loadMap(), []);
  const geo = useTownGeo(map);
  const lite = quality.tier === 'lite';
  return <>
    <Ground />
    <Town geo={geo} env={env} shadow={shadowOn} />
    <ShopSigns geo={geo} env={env} />
    <Signage geo={geo} map={map} env={env} />
    <Courthouse geo={geo} />
    <Trees map={map} count={lite ? 3200 : quality.tier === 'high' ? 7500 : 5200} shadow={shadowOn} />
    <Utilities map={map} corners={geo.corners} env={env} />
    <ParkedCars map={map} max={lite ? 190 : 280} shadow={shadowOn && !lite} />
    <Lamps map={map} env={env} />
    <Signals map={map} sim={sim} />
    <RailGates map={map} sim={sim} />
    <TrafficCars sim={sim} env={env} />
    <People sim={sim} />
    <TrainView sim={sim} />
    <Beacon sim={sim} />
  </>;
}
export { box };
