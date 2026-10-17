import { useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { NightCtx, radialTexture, rng } from '../../../components/nuhome2/world/theme';
import { atmo } from './atmo';

const R = 92;

/** Fades every material inside it with the day/night mix. */
function FadeGroup({ day, children }: { day: boolean; children: ReactNode }) {
  const mix = useContext(NightCtx);
  const ref = useRef<THREE.Group>(null);
  const last = useRef(-1);
  useFrame(() => {
    const g = ref.current; if (!g) return;
    const o = (day ? 1 - mix.current : mix.current) * (1 - .93 * atmo.look.cloud);
    if (Math.abs(o - last.current) < .004) return;
    last.current = o; g.visible = o > .01;
    g.traverse(obj => {
      const m = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (m) { const base = (m.userData.base ??= m.opacity); m.transparent = true; m.opacity = base * o; }
    });
  });
  return <group ref={ref}>{children}</group>;
}

export function SkyDome() {
  const mix = useContext(NightCtx);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMix: { value: 0 }, dTop: { value: new THREE.Color('#2b6fcf') }, dMid: { value: new THREE.Color('#86bdee') }, dLow: { value: new THREE.Color('#ffe8c2') }, nTop: { value: new THREE.Color('#02041a') }, nMid: { value: new THREE.Color('#0f1748') }, nLow: { value: new THREE.Color('#382a66') }, uCl: { value: 0 }, uDeep: { value: 0 }, uOver: { value: new THREE.Color('#b4bcc6') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform float uMix, uCl, uDeep; uniform vec3 dTop,dMid,dLow,nTop,nMid,nLow,uOver; void main(){ float h = clamp(abs(vP.y),0.0,1.0); vec3 d = mix(dLow,dMid,smoothstep(0.0,0.3,h)); d = mix(d,dTop,smoothstep(0.25,0.9,h)); vec3 n = mix(nLow,nMid,smoothstep(0.0,0.3,h)); n = mix(n,nTop,smoothstep(0.25,0.9,h)); vec3 col = mix(d,n,uMix); col *= 1.0 - uDeep * uMix * .62; col = mix(col, uOver * (.86 + .24 * (1.0 - h)), uCl); gl_FragColor = vec4(col,1.0); }',
  }), []);
  const over = useMemo(() => ({ d: new THREE.Color('#b9c1cb'), n: new THREE.Color('#0c1024'), s: new THREE.Color('#5d636d') }), []);
  useFrame(() => {
    const u = mat.uniforms, m = mix.current, L = atmo.look;
    u.uMix.value = m; u.uCl.value = Math.min(1, L.cloud * .92 + L.fog * .3); u.uDeep.value = atmo.deep;
    (u.uOver!.value as THREE.Color).copy(over.d).lerp(over.n, m).lerp(over.s, L.storm * (1 - m) * .8);
  });
  return <mesh material={mat} scale={R} renderOrder={-10}><sphereGeometry args={[1, 32, 20]} /></mesh>;
}

/** Thousands of twinkling stars plus a soft milky way band. */
export function Stars({ count = 7000 }: { count?: number }) {
  const mix = useContext(NightCtx);
  const gl = useThree(s => s.gl);
  const { geo, mat } = useMemo(() => {
    const r = rng(7), N = count, band0 = Math.floor(N * .657);
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
    const tints = [new THREE.Color('#ffffff'), new THREE.Color('#cfe0ff'), new THREE.Color('#ffe9c8'), new THREE.Color('#ffd6e8')];
    const nx = new THREE.Vector3(.3, .8, .5).normalize();
    const u = new THREE.Vector3(1, 0, 0).cross(nx).normalize(), v = nx.clone().cross(u);
    for (let i = 0; i < N; i++) {
      let x: number, y: number, z: number;
      if (i < band0) {
        const yy = Math.pow(r(), .85) * .98 + .02, a = r() * Math.PI * 2, rr = Math.sqrt(1 - yy * yy);
        x = Math.cos(a) * rr; y = yy; z = Math.sin(a) * rr;
      } else {
        const a = r() * Math.PI * 2, g = (r() + r() + r() - 1.5) * .16;
        const p = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a))).add(nx.clone().multiplyScalar(g)).normalize();
        x = p.x; y = Math.abs(p.y) + .02; z = p.z;
      }
      pos.set([x * 86, y * 86, z * 86], i * 3);
      const t = tints[Math.floor(r() * tints.length)];
      const band = i >= band0;
      const c = band ? new THREE.Color('#b9b3ff').lerp(t, .4) : t;
      col.set([c.r, c.g, c.b], i * 3);
      const k = r();
      size[i] = band ? 1.1 + r() * 1.2 : k > .985 ? 6 + r() * 3 : k > .9 ? 3 + r() * 1.6 : 1.3 + r() * 1.3;
      phase[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uMix: { value: 0 }, uPx: { value: 1 } },
      vertexShader: 'attribute float aSize; attribute float aPhase; attribute vec3 aColor; uniform float uTime,uMix,uPx; varying vec3 vC; varying float vA; void main(){ vC = aColor; float tw = .6 + .4 * sin(uTime * (.5 + aPhase * 1.8) + aPhase * 60.0); vA = tw * uMix; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uPx;  gl_Position.z = gl_Position.w * .99999; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); float a = pow(smoothstep(.5,0.,d),1.7); gl_FragColor = vec4(vC, a * vA); }',
    });
    return { geo: g, mat: m };
  }, [count]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; mat.uniforms.uMix.value = Math.max(0, (mix.current - .25) / .75) * (1 - .97 * Math.min(1, atmo.look.cloud * 1.05)); mat.uniforms.uPx.value = gl.getPixelRatio() * 1.1; });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-9} />;
}

export function ShootingStars() {
  const mix = useContext(NightCtx);
  const ref = useRef<THREE.Mesh>(null);
  const st = useRef({ t: -1, next: 3, dir: new THREE.Vector3(), from: new THREE.Vector3() });
  useFrame((_, dt) => {
    const m = ref.current; if (!m) return;
    const s = st.current;
    if (mix.current < .7) { m.visible = false; return; }
    if (s.t < 0) {
      s.next -= dt;
      if (s.next <= 0) {
        s.t = 0; s.next = 5 + Math.random() * 9;
        const a = Math.random() * Math.PI * 2;
        s.from.set(Math.cos(a) * 70, 40 + Math.random() * 22, Math.sin(a) * 70 - 10);
        s.dir.set(-Math.sin(a), -.22, Math.cos(a)).normalize();
        if (Math.random() > .5) s.dir.multiplyScalar(-1);
      }
      m.visible = false; return;
    }
    s.t += dt;
    const life = s.t / 1.1;
    if (life >= 1) { s.t = -1; m.visible = false; return; }
    m.visible = true;
    m.position.copy(s.from).addScaledVector(s.dir, s.t * 60);
    m.lookAt(0, 0, 0);
    m.rotateZ(Math.atan2(s.dir.y, 1));
    (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(life * Math.PI);
  });
  const tex = useMemo(() => { const c = document.createElement('canvas'); c.width = 256; c.height = 8; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 8); return new THREE.CanvasTexture(c); }, []);
  return <mesh ref={ref} visible={false}><planeGeometry args={[14, .22]} /><meshBasicMaterial map={tex} transparent depthWrite={false} fog={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>;
}

function moonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const b = g.createRadialGradient(200, 190, 20, 256, 256, 280);
  b.addColorStop(0, '#fffdf2'); b.addColorStop(.7, '#eee7d2'); b.addColorStop(1, '#cfc6b4');
  g.fillStyle = b; g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 9; i++) { const x = 90 + r() * 330, y = 90 + r() * 330, rad = 40 + r() * 70; const m = g.createRadialGradient(x, y, 0, x, y, rad); m.addColorStop(0, 'rgba(150,145,150,.34)'); m.addColorStop(1, 'rgba(150,145,150,0)'); g.fillStyle = m; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  for (let i = 0; i < 40; i++) { const x = r() * 512, y = r() * 512, rad = 5 + r() * 16; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.strokeStyle = 'rgba(120,115,120,.28)'; g.lineWidth = 2; g.stroke(); g.fillStyle = 'rgba(170,165,170,.16)'; g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Sun and moon live at infinity: their depth is pinned to the far plane, so a tower or a roof can never fall behind them. */
/** The sky group follows the camera. The rig moves it after the camera has settled for the frame, so the sun never lags or jitters. */
export const skyAnchor: { current: THREE.Group | null } = { current: null };

function pinFar(mat: THREE.Material) {
  mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n gl_Position.z = gl_Position.w * 0.99999;'); };
  mat.customProgramCacheKey = () => 'pinfar';
  mat.needsUpdate = true;
}
/** Every part sits at the same far depth, so none may depth-test against another: they paint in JSX order instead (glow, rays, disc, lenses, smile), which is what keeps the sunglasses solid. */
function FarDepth({ children, order = -6 }: { children: ReactNode; order?: number }) {
  const g = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    let n = 0;
    g.current?.traverse(o => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      mesh.renderOrder = order + (n++) * .01;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => { pinFar(m); m.transparent = true; m.depthWrite = false; });
    });
  }, [order]);
  return <group ref={g}>{children}</group>;
}

export function Moon({ position }: { position: [number, number, number] }) {
  const map = useMemo(moonTexture, []);
  const halo = useMemo(() => new THREE.CanvasTexture(radialTexture([[0, 'rgba(205,222,255,.85)'], [.25, 'rgba(170,195,255,.35)'], [1, 'rgba(120,150,255,0)']])), []);
  const spin = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => { if (spin.current) spin.current.rotation.y += dt * .01; });
  return <FadeGroup day={false}><FarDepth><group position={position}>
    <Billboard><mesh position={[0, 0, -1]}><planeGeometry args={[46, 46]} /><meshBasicMaterial map={halo} transparent depthWrite={false} fog={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh></Billboard>
    <mesh ref={spin} rotation={[.2, 2.4, 0]}><sphereGeometry args={[6, 48, 32]} /><meshBasicMaterial map={map} fog={false} toneMapped={false} /></mesh>
  </group></FarDepth></FadeGroup>;
}

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r * 2.2);
  s.quadraticCurveTo(x + w, y + h, x + w - r * 2.2, y + h); s.lineTo(x + r * 2.2, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r * 2.2); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** The Style Van sun, drawn once to a single plate: gradient disc, sixteen rays, sunglasses, smile, blush. Nothing in it moves or layers in 3D, so nothing in it can flicker. */
function sunArt() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2); g.scale(S / 24, -S / 24);
  g.fillStyle = '#ffd23f';
  for (let i = 0; i < 16; i++) { g.save(); g.rotate((i / 16) * Math.PI * 2); g.beginPath(); g.moveTo(-.74, 7.7); g.lineTo(.74, 7.7); g.lineTo(0, 11.1); g.closePath(); g.fill(); g.restore(); }
  const d = g.createRadialGradient(0, 0, 0, 0, 0, 6.6); d.addColorStop(0, '#fff7c2'); d.addColorStop(.7, '#ffd84f'); d.addColorStop(1, '#ffb62e');
  g.fillStyle = d; g.beginPath(); g.arc(0, 0, 6.6, 0, Math.PI * 2); g.fill();
  const lens = (sx: number) => { const w = 3.1, h = 2.1, r = .55, x = sx * 1.95 - w / 2, y = .7 - h / 2; g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r * 2.2, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r * 2.2); g.quadraticCurveTo(x + w, y + h, x + w - r * 2.2, y + h); g.lineTo(x + r * 2.2, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r * 2.2); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); g.fill(); };
  g.fillStyle = '#14101c';
  [-1, 1].forEach(sx => { lens(sx); g.fillRect(sx * 3.67 - 1.3, .74, 2.6, .22); });
  g.fillRect(-.45, .83, .9, .24);
  [-1, 1].forEach(sx => { g.save(); g.translate(sx * 1.95 - sx * .55, 1.15); g.rotate(sx * .5); g.fillStyle = 'rgba(143,134,184,.75)'; g.fillRect(-.45, -.08, .9, .16); g.restore(); });
  g.strokeStyle = '#b5541f'; g.lineWidth = .34; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  for (let k = 0; k <= 24; k++) { const a = Math.PI + (k / 24) * Math.PI * .8, x = 1.85 * Math.cos(a), y = -.9 + 1.85 * Math.sin(a); k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  g.fillStyle = 'rgba(255,156,138,.55)'; [-1, 1].forEach(sx => { g.beginPath(); g.arc(sx * 3.5, -.6, .62, 0, Math.PI * 2); g.fill(); });
  return c;
}

/** The sun, wearing sunglasses. */
export function Sun({ position }: { position: [number, number, number] }) {
  const glow = useMemo(() => new THREE.CanvasTexture(radialTexture([[0, 'rgba(255,244,190,.95)'], [.3, 'rgba(255,224,130,.4)'], [1, 'rgba(255,200,90,0)']])), []);
  const art = useMemo(() => { const t = new THREE.CanvasTexture(sunArt()); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }, []);
  return <FadeGroup day><FarDepth><group position={position}><Billboard>
    <mesh position={[0, 0, -.3]}><planeGeometry args={[62, 62]} /><meshBasicMaterial map={glow} transparent depthWrite={false} fog={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    <mesh><planeGeometry args={[24, 24]} /><meshBasicMaterial map={art} transparent depthWrite={false} fog={false} toneMapped={false} /></mesh>
  </Billboard></group></FarDepth></FadeGroup>;
}

/** Soft cloud puffs drifting slowly around the whole scene. */
export function Clouds({ count = 26 }: { count?: number }) {
  const mix = useContext(NightCtx);
  const grp = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: .35, roughness: 1, transparent: true, opacity: .96 }), []);
  const dayC = useMemo(() => new THREE.Color('#ffffff'), []), nightC = useMemo(() => new THREE.Color('#8d96bd'), []);
  const grey = useMemo(() => new THREE.Color('#7e858f'), []);
  const dayE = useMemo(() => new THREE.Color('#fff4e6'), []), nightE = useMemo(() => new THREE.Color('#252c5c'), []);
  const clouds = useMemo(() => {
    const r = rng(21);
    return Array.from({ length: count }).map((_, i) => {
      const a = (i / count) * Math.PI * 2 + r() * .3, rad = 44 + r() * 40, y = 16 + r() * 24, s = 1.0 + r() * 1.8;
      const puffs = Array.from({ length: 8 + Math.floor(r() * 4) }).map((_, k) => ({ p: [(k - 4) * (.8 + r() * .5), (r() - .35) * 1.1, (r() - .5) * 1.6] as [number, number, number], s: [1.3 + r() * 1.2, .9 + r() * .9, 1.1 + r() * .8] as [number, number, number] }));
      return { pos: [Math.cos(a) * rad, y, Math.sin(a) * rad] as [number, number, number], rot: a + Math.PI / 2, s, puffs };
    });
  }, [count]);
  useFrame((_, dt) => {
    if (grp.current) { grp.current.rotation.y += dt * .0055; const k = 1 + .3 * atmo.look.cloud; grp.current.scale.set(k, 1 + .6 * atmo.look.cloud, k); }
    const m = mix.current, L = atmo.look;
    mat.color.copy(dayC).lerp(nightC, m).lerp(grey, Math.min(1, L.cloud * .55 + L.storm * .35) * (1 - .4 * m)).multiplyScalar(1 - .5 * atmo.deep * m);
    mat.emissive.copy(dayE).lerp(nightE, m); mat.emissiveIntensity = (.38 + .3 * m) * (1 - .45 * L.cloud * (1 - m)) * (1 - .6 * atmo.deep * m);
  });
  return <group ref={grp}>
    {clouds.map((c, i) => <group key={i} position={c.pos} rotation-y={c.rot} scale={c.s}>
      {c.puffs.map((q, k) => <mesh key={k} position={q.p} scale={q.s} material={mat}><sphereGeometry args={[1, 14, 10]} /></mesh>)}
    </group>)}
  </group>;
}
