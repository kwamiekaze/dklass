import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { atmo, tickAtmo, refreshLive, loadSite, debugOverride } from './atmosphere';
import { NightCtx, rng } from './theme';

/*
 * The weather you can see: falling rain (thin streaks that lean with the wind, fading with distance), snow (soft flakes that sway), lightning in a storm, and the light
 * (see Scene.tsx's ThemeDriver and Sky.tsx) that goes with each. Everything is driven by atmosphere.ts. The drops live in a box that follows the lens but stay where they are in the world,
 * so moving the camera never makes them swim with it. Nothing is drawn while there is no rain or snow.
 */
const BOX = new THREE.Vector3(84, 34, 84);

const RAIN_V = `
attribute vec2 aCorner; attribute vec3 aSeed;
uniform float uTime, uLen, uPx, uAmount; uniform vec3 uCam, uOrg, uBox, uVel; uniform vec2 uRes;
varying float vA;
void main() {
  vec3 base = aSeed * uBox, org = uOrg;
  vec3 w = mod(base + uVel * uTime - org, uBox) + org;
  vec3 dir = normalize(uVel);
  vec3 head = w, tail = w - dir * uLen * (.7 + .6 * fract(aSeed.x * 7.3));
  vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.), ct = projectionMatrix * viewMatrix * vec4(tail, 1.);
  vec2 sh = ch.xy / max(ch.w, .01), st = ct.xy / max(ct.w, .01);
  vec2 d = (sh - st) * uRes; float l = length(d); d = l > .0001 ? d / l : vec2(0., 1.);
  vec2 n = vec2(-d.y, d.x);
  vec4 c = mix(ct, ch, aCorner.y);
  c.xy += n * aCorner.x * uPx * c.w / uRes;
  gl_Position = c;
  float dist = distance(w, uCam);
  float keep = step(fract(aSeed.y * 13.7 + aSeed.z * 5.1), uAmount);          // thin the rain out for a light shower
  vA = keep * (1. - smoothstep(34., 62., dist)) * (.25 + .75 * aCorner.y) * smoothstep(.5, 3., dist);
}`;
const RAIN_F = `varying float vA; uniform vec3 uColor; uniform float uOpacity; void main() { gl_FragColor = vec4(uColor, vA * uOpacity); }`;

const SNOW_V = `
attribute vec3 aSeed; uniform float uTime, uSize, uAmount; uniform vec3 uCam, uOrg, uBox;
varying float vA;
void main() {
  vec3 base = aSeed * uBox, org = uOrg;
  vec3 vel = vec3(.45 * sin(aSeed.x * 40. + uTime * .6), -1.15 - aSeed.y * .9, .4 * cos(aSeed.z * 33. + uTime * .5));
  vec3 w = mod(base + vec3(0., -(1.15 + aSeed.y * .9) * uTime, 0.) - org, uBox) + org;
  w.x += sin(uTime * .7 + aSeed.x * 50.) * .6; w.z += cos(uTime * .6 + aSeed.z * 41.) * .6;
  vec4 mv = viewMatrix * vec4(w, 1.);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = clamp(uSize * (.6 + aSeed.y) / max(dist, .5), 1.5, 12.);
  float keep = step(fract(aSeed.x * 17.9 + aSeed.y * 3.3), uAmount);
  vA = keep * (1. - smoothstep(34., 64., dist)) * smoothstep(.4, 2., dist);
}`;
const SNOW_F = `varying float vA; uniform float uOpacity; void main() { vec2 p = gl_PointCoord - .5; float r = length(p) * 2.; float a = (1. - smoothstep(.2, 1., r)) * vA * uOpacity; if (a < .01) discard; gl_FragColor = vec4(.96, .97, 1., a); }`;

export function Weather({ lite }: { lite: boolean }) {
  const { camera, size, gl } = useThree(), mix = useContext(NightCtx);
  const rainRef = useRef<THREE.Mesh>(null), snowRef = useRef<THREE.Points>(null);
  const bolt = useRef({ next: 4, t: 0, n: 0 });
  useEffect(() => { debugOverride(); void refreshLive(); void loadSite(); }, []);
  const nRain = lite ? 3500 : 8000, nSnow = lite ? 2600 : 6000;
  const rainGeo = useMemo(() => {
    const r = rng(77), g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const seed = new Float32Array(nRain * 3); for (let i = 0; i < seed.length; i++) seed[i] = r();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3)); g.instanceCount = nRain; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return g;
  }, [nRain]);
  const rainMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: RAIN_V, fragmentShader: RAIN_F, side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    uniforms: { uTime: { value: 0 }, uLen: { value: .9 }, uPx: { value: 1.2 }, uAmount: { value: 1 }, uCam: { value: new THREE.Vector3() }, uOrg: { value: new THREE.Vector3() }, uBox: { value: BOX }, uVel: { value: new THREE.Vector3(-2.2, -17, .9) }, uRes: { value: new THREE.Vector2(1, 1) }, uColor: { value: new THREE.Color('#cfd9e8') }, uOpacity: { value: .55 } },
  }), []);
  const snowGeo = useMemo(() => {
    const r = rng(91), g = new THREE.BufferGeometry(), seed = new Float32Array(nSnow * 3); for (let i = 0; i < seed.length; i++) seed[i] = r();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nSnow * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return g;
  }, [nSnow]);
  const snowMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: SNOW_V, fragmentShader: SNOW_F, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    uniforms: { uTime: { value: 0 }, uSize: { value: 140 }, uAmount: { value: 1 }, uCam: { value: new THREE.Vector3() }, uOrg: { value: new THREE.Vector3() }, uBox: { value: BOX }, uOpacity: { value: .9 } },
  }), []);
  const tmpC = useMemo(() => new THREE.Color(), []), fwd = useMemo(() => new THREE.Vector3(), []), org = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }, dt) => {
    tickAtmo(dt);
    camera.getWorldDirection(fwd); org.set(camera.position.x + fwd.x * 26 - BOX.x / 2, -1, camera.position.z + fwd.z * 26 - BOX.z / 2);   // the box sits ahead of the lens (the scene is looked at from a distance) and stands on the ground
    const L = atmo.look, t = clock.elapsedTime, px = gl.getPixelRatio();
    const rain = rainRef.current, snow = snowRef.current;
    if (rain) {
      const on = L.rain > .02; rain.visible = on;
      if (on) {
        const u = rainMat.uniforms; u.uTime.value = t; (u.uCam!.value as THREE.Vector3).copy(camera.position); (u.uOrg!.value as THREE.Vector3).copy(org);
        (u.uRes!.value as THREE.Vector2).set(size.width * px, size.height * px); u.uPx.value = (1.5 + .7 * L.rain) * px; u.uAmount.value = Math.min(1, .2 + L.rain);
        u.uLen.value = .55 + .7 * L.rain; (u.uVel!.value as THREE.Vector3).set(-1.6 - 2.4 * L.storm, -14 - 6 * L.rain, .8 + 1.2 * L.storm);
        u.uOpacity.value = .42 + .36 * L.rain;
        (u.uColor!.value as THREE.Color).set('#d4deee').lerp(tmpC.set('#a6b9e0'), mix.current);
      }
    }
    if (snow) {
      const on = L.snow > .02; snow.visible = on;
      if (on) { const u = snowMat.uniforms; u.uTime.value = t; (u.uCam!.value as THREE.Vector3).copy(camera.position); (u.uOrg!.value as THREE.Vector3).copy(org); u.uAmount.value = Math.min(1, .15 + L.snow); u.uSize.value = 150 * px; }
    }
    // lightning: a quick double flash every few seconds in a storm (the lights read atmo.flash)
    const b = bolt.current;
    if (L.storm > .5) { b.next -= dt; if (b.next <= 0) { b.n = 2 + Math.floor(Math.random() * 2); b.t = 0; b.next = 5 + Math.random() * 9; } }
    if (b.n > 0) { b.t -= dt; if (b.t <= 0) { atmo.flash = .7 + Math.random() * .3; b.n--; b.t = .08 + Math.random() * .16; } }
  });
  return <>
    <mesh ref={rainRef} geometry={rainGeo} material={rainMat} frustumCulled={false} visible={false} renderOrder={20} />
    <points ref={snowRef} geometry={snowGeo} material={snowMat} frustumCulled={false} visible={false} renderOrder={20} />
  </>;
}
