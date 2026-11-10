import { useContext, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx, rng } from './theme';
import { Plant } from './Plants';
import { Hedge, type HedgePlant } from './Lot';
import { leafCard, leafCardMaterial } from './Grounds';
import { Halo, carvedRow, carvedWord, facetedStar, goldMat } from './Signage';
import { atmo } from './atmosphere';
import { makeGlazing } from './Glazing';
import { type B, box, columnGeometry, dressedStone, limestone, masonry, slate, tiled, weather } from './surfaces';
import { SIGN_FONT, goldGradient, makeCanvasTexture, starShape } from './parts';

/*
 * The DrivingKlass building: cream stone, black slate roofs, warm LED cove lighting, tall glazed bays with lit offices,
 * an arched pediment with five gold stars and big gold lettering, round columns, double glass doors, topiary in planters.
 * World meters in building space: x across, y up, z toward the viewer. The main front wall is the plane z = 3 and the
 * building is 44.8 m wide. The portico and its steps reach z 7.2, the pavilions stand 0.6 m proud of the wall.
 *
 * Flicker rules: every window is a real opening cut through a wall of boxes, so there are no panels laid on a wall;
 * no two surfaces sit closer than 5 cm; thin trim is thick enough (7 cm and up) to survive the far zoom; the stone
 * texture has soft mortar lines and mipmaps; lettering is stacked in layers 3 cm apart for depth instead of one decal.
 */
const WALL_H = 6.4, PAV_H = 8.0, FRONT = 3, DEPTH = .9, HALF = 22.4, BACK = -2.95;   // BACK: the back wall's outer face, in building space

type Kind = 'tv' | 'meeting' | 'office' | 'hall' | 'lobby';

function lettersTexture(color: 'face' | 'side') {
  return makeCanvasTexture(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = `700 196px ${SIGN_FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    const text = 'DRIVINGKLASS', sp = 18, ws = [...text].map(c => g.measureText(c).width), total = ws.reduce((a, b) => a + b, 0) + sp * (text.length - 1);
    let x = (w - total) / 2;
    g.fillStyle = color === 'face' ? goldGradient(g, 30, 226) : '#8b6508';
    if (color === 'face') { g.strokeStyle = '#7a5606'; g.lineWidth = 5; g.lineJoin = 'round'; }
    [...text].forEach((c, i) => { if (color === 'face') g.strokeText(c, x, h / 2 + 8); g.fillText(c, x, h / 2 + 8); x += ws[i]! + sp; });
  }, 16);
}

function doorSignTexture(open: boolean) {
  return makeCanvasTexture(512, 256, (g, w, h) => {
    const rr = (x: number, y: number, ww: number, hh: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
    g.clearRect(0, 0, w, h); g.fillStyle = '#16181d'; rr(6, 6, w - 12, h - 12, 28); g.fill();
    g.strokeStyle = 'rgba(244,239,228,.6)'; g.lineWidth = 4; rr(6, 6, w - 12, h - 12, 28); g.stroke();
    const word = open ? 'OPEN' : 'CLOSED'; let size = 124; g.font = `700 ${size}px ${SIGN_FONT}`;
    while (g.measureText(word).width > w - 90 && size > 40) { size -= 4; g.font = `700 ${size}px ${SIGN_FONT}`; }
    g.fillStyle = open ? '#6fdc9a' : '#ee7b72'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(word, w / 2, h / 2 - 14);
    g.fillStyle = '#f4efe4'; g.font = `600 30px ${SIGN_FONT}`; g.fillText('9AM \u2013 6PM', w / 2, h - 52);
  }, 8);
}

/** Opening hours, Sunday first. Shown on the door beside the OPEN sign. */
const HOURS: [string, string][] = [['Sunday', '10 AM\u20136 PM'], ['Monday', '9 AM\u20136 PM'], ['Tuesday', '9 AM\u20136 PM'], ['Wednesday', '9 AM\u20136 PM'], ['Thursday', '9 AM\u20136 PM'], ['Friday', '9 AM\u20136 PM'], ['Saturday', '9 AM\u20136 PM']];
function hoursSignTexture() {
  return makeCanvasTexture(512, 768, (g, w, h) => {
    const rr = (x: number, y: number, ww: number, hh: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
    g.clearRect(0, 0, w, h); g.fillStyle = '#16181d'; rr(8, 8, w - 16, h - 16, 40); g.fill();
    g.strokeStyle = 'rgba(244,239,228,.6)'; g.lineWidth = 5; rr(8, 8, w - 16, h - 16, 40); g.stroke();
    g.fillStyle = '#e0b030'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 74px ${SIGN_FONT}`; g.fillText('HOURS', w / 2, 82);
    g.strokeStyle = 'rgba(224,176,48,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 136); g.lineTo(w - 60, 136); g.stroke();
    g.fillStyle = '#f4efe4'; g.font = `600 37px ${SIGN_FONT}`;
    HOURS.forEach(([day, time], i) => {
      const y = 196 + i * 78;
      g.textAlign = 'left'; g.fillText(day, 40, y); g.textAlign = 'right'; g.fillText(time, w - 40, y);
    });
    void h;
  }, 8);
}

function hipRoof(w: number, d: number, h: number) {
  const hw = w / 2, hd = d / 2, rr = (w - d) / 2;
  const A = [-hw, 0, -hd], B = [hw, 0, -hd], C = [hw, 0, hd], D = [-hw, 0, hd], E = [-rr, h, 0], F = [rr, h, 0];
  const tris = [D, C, F, D, F, E, B, A, E, B, E, F, A, D, E, C, B, F];
  const g = new THREE.BufferGeometry(), uv: number[] = [];
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  // slate courses run along each slope: project every face onto its own plane
  for (let i = 0; i < tris.length; i += 3) {
    const p0 = new THREE.Vector3(...(tris[i] as [number, number, number])), p1 = new THREE.Vector3(...(tris[i + 1] as [number, number, number])), p2 = new THREE.Vector3(...(tris[i + 2] as [number, number, number]));
    const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0)).normalize();
    const e1 = new THREE.Vector3(0, 1, 0).cross(n).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    [p0, p1, p2].forEach(p => uv.push(p.dot(e1) / 2.2, p.dot(e2) / 2.2));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function Bar({ a, b, r = .09, m }: { a: [number, number, number]; b: [number, number, number]; r?: number; m: THREE.Material }) {
  const { pos, q, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), dir = new THREE.Vector3().subVectors(vb, va), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: va.clone().add(vb).multiplyScalar(.5), q, len };
  }, [a, b]);
  return <mesh position={pos} quaternion={q} material={m} castShadow><cylinderGeometry args={[r, r, len, 8]} /></mesh>;
}

/** Ridge and hip caps, a fascia rim and chimney pots: the details that make a hip roof read as a real roof. */
function RoofTrim({ w, d, h, y, x = 0, z = 0, cap, fascia }: { w: number; d: number; h: number; y: number; x?: number; z?: number; cap: THREE.Material; fascia: THREE.Material }) {
  const hw = w / 2, hd = d / 2, rr = (w - d) / 2, P = (px: number, py: number, pz: number): [number, number, number] => [x + px, y + py, z + pz];
  return <group>
    <Bar a={P(-rr - .1, h, 0)} b={P(rr + .1, h, 0)} r={.13} m={cap} />
    <Bar a={P(-hw, 0, -hd)} b={P(-rr, h, 0)} m={cap} /><Bar a={P(-hw, 0, hd)} b={P(-rr, h, 0)} m={cap} />
    <Bar a={P(hw, 0, -hd)} b={P(rr, h, 0)} m={cap} /><Bar a={P(hw, 0, hd)} b={P(rr, h, 0)} m={cap} />
    {[-1, 1].map(s => <mesh key={`f${s}`} position={P(0, .07, s * hd)} material={fascia}><boxGeometry args={[w + .1, .16, .1]} /></mesh>)}
    {[-1, 1].map(s => <mesh key={`g${s}`} position={P(s * hw, .07, 0)} material={fascia}><boxGeometry args={[.1, .16, d + .1]} /></mesh>)}
  </group>;
}


type Opening = { cx: number; w: number; y0: number; y1: number };


/** A sidewalk A-frame: two white plastic panels hinged at the top, the same HOURS board printed on both faces. */
function AFrame({ position, rotY = 0, map }: { position: [number, number, number]; rotY?: number; map: THREE.Texture }) {
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: .42 }), []);
  const board = useMemo(() => new THREE.MeshBasicMaterial({ map, toneMapped: false }), [map]);
  const H = .98, W = .64, tilt = .21;
  const panel = <group position={[0, H, 0]} rotation-x={-tilt}>
    <mesh position={[0, -.03, 0]} material={white} castShadow><boxGeometry args={[W, .06, .035]} /></mesh>
    <mesh position={[0, -H + .03, 0]} material={white} castShadow><boxGeometry args={[W, .06, .035]} /></mesh>
    {[-1, 1].map(s => <mesh key={s} position={[s * (W / 2 - .0225), -H / 2, 0]} material={white} castShadow><boxGeometry args={[.045, H, .035]} /></mesh>)}
    <mesh position={[0, -H / 2, .019]} material={board}><planeGeometry args={[W - .09, H - .12]} /></mesh>
    <mesh position={[0, -H / 2, -.019]} rotation-y={Math.PI} material={white}><planeGeometry args={[W - .09, H - .12]} /></mesh>
    {[-1, 1].map(s => <mesh key={`f${s}`} position={[s * (W / 2 - .06), -H + .02, .03]} material={white}><boxGeometry args={[.1, .04, .08]} /></mesh>)}
  </group>;
  return <group position={position} rotation-y={rotY}>
    <group>{panel}</group>
    <group rotation-y={Math.PI}>{panel}</group>
    <mesh position={[0, H + .015, 0]} material={white}><boxGeometry args={[W * .9, .05, .1]} /></mesh>
    <mesh position={[0, H + .06, 0]} material={white}><boxGeometry args={[.17, .045, .04]} /></mesh>
  </group>;
}

export function Building({ position, lite, open }: { position: [number, number, number]; lite: boolean; open: boolean }) {
  const mix = useContext(NightCtx);
  const lime = useMemo(() => limestone(lite ? 256 : 512), [lite]);
  const stoneMats = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), []);
  const stoneMat = (rx: number, ry: number) => { const t = tiled(lime.map, rx, ry); return new THREE.MeshStandardMaterial({ map: t, normalMap: tiled(lime.normalMap, rx, ry), normalScale: new THREE.Vector2(1.15, 1.15), emissiveMap: t, emissive: '#ffcf80', emissiveIntensity: .05, roughness: .86, color: '#efe3c9' }); };
  const stone = (w: number, h: number) => {
    const k = `${w.toFixed(1)}x${h.toFixed(1)}`; let m = stoneMats.get(k);
    if (!m) { m = stoneMat(Math.max(.25, w / 3.2), Math.max(.25, h / 1.6)); stoneMats.set(k, m); }
    return m;
  };
  // the walls are single meshes with the stone laid in world metres, so the courses run unbroken; each carries its own weathering
  const wallMat = useMemo(() => { const m = weather(stoneMat(1, 1), .16, WALL_H); stoneMats.set('wall', m); return m; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const pavMat = useMemo(() => { const m = weather(stoneMat(1, 1), .16, PAV_H); stoneMats.set('pav', m); return m; }, []);      // eslint-disable-line react-hooks/exhaustive-deps
  const baseMat = useMemo(() => { const m = stoneMat(1, 1); m.color.set('#d9ccb1'); m.normalScale.set(1.5, 1.5); m.roughness = .92; stoneMats.set('base', m); return m; }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const M = useMemo(() => ({
    trim: new THREE.MeshStandardMaterial({ color: '#f5ecdc', roughness: .6 }),
    roof: (() => { const sl = slate(lite ? 256 : 512); return new THREE.MeshStandardMaterial({ map: sl.map, normalMap: sl.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), color: '#ffffff', roughness: .46, metalness: .16, side: THREE.DoubleSide }); })(),
    dress: (() => { const d = dressedStone(256); return new THREE.MeshStandardMaterial({ map: d.map, normalMap: d.normalMap, normalScale: new THREE.Vector2(.6, .6), color: '#fbf3e4', roughness: .62, emissiveMap: d.map, emissive: '#ffcf80', emissiveIntensity: .03 }); })(),
    black: new THREE.MeshStandardMaterial({ color: '#15161a', roughness: .45, metalness: .3 }),
    led: new THREE.MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd070', emissiveIntensity: .8, roughness: .5 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff0d0', emissive: '#ffbf70', emissiveIntensity: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d9a93a', roughness: .5, metalness: .3 }),
    crown: new THREE.MeshStandardMaterial({ color: '#e0a21a', emissive: '#ff9d00', emissiveIntensity: .3, roughness: .45, metalness: .25 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#2f6b34', roughness: .95, flatShading: true }),
    leaf2: new THREE.MeshStandardMaterial({ color: '#3d8a42', roughness: .95, flatShading: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#5a3b20', roughness: .9 }),
  }), [lite]);
  const tex = useMemo(() => ({
    face: lettersTexture('face'), side: lettersTexture('side'), door: { open: doorSignTexture(true), closed: doorSignTexture(false) }, hours: hoursSignTexture(),
  }), []);
  const glz = useMemo(() => makeGlazing(lite), [lite]), glass = glz.mats;
  const pane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const letterFace = useMemo(() => new THREE.MeshBasicMaterial({ map: tex.face, transparent: true, toneMapped: false, depthWrite: false }), [tex]);
  const letterSide = useMemo(() => new THREE.MeshBasicMaterial({ map: tex.side, transparent: true, toneMapped: false, depthWrite: false }), [tex]);

  useFrame(() => {
    const n = mix.current;
    M.led.emissiveIntensity = .7 + 3.4 * n; M.lamp.emissiveIntensity = .7 + 2.0 * n; M.crown.emissiveIntensity = .3 + 1.5 * n;
    stoneMats.forEach(m => { m.emissiveIntensity = .03 + .26 * n; }); M.dress.emissiveIntensity = .03 + .24 * n;
    glz.update(n, atmo.deep, atmo.look.cloud, open);
  });

  const archShape = useMemo(() => {
    const s = new THREE.Shape(), R = 5.55, cy = .55 + 2.3 - R;
    s.moveTo(-5.3, 0); s.lineTo(5.3, 0); s.lineTo(5.3, .4); s.quadraticCurveTo(4.7, .45, 4.4, .6);
    for (let i = 0; i <= 40; i++) { const x = 4.4 - (8.8 * i) / 40; s.lineTo(x, cy + Math.sqrt(R * R - x * x)); }
    s.quadraticCurveTo(-4.7, .45, -5.3, .4); s.closePath(); return s;
  }, []);
  const archLed = useMemo(() => { const R = 5.55, cy = .55 + 2.3 - R, pts: THREE.Vector3[] = []; for (let i = 0; i <= 48; i++) { const x = -4.1 + (8.2 * i) / 48; pts.push(new THREE.Vector3(x, cy + Math.sqrt(R * R - x * x) - .3, 0)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, .08, 6, false); }, []);
  const capM = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e6dfd0', roughness: .55 }), []), fasM = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2d34', roughness: .5, metalness: .3 }), []);
  const roofs = useMemo(() => ({ main: hipRoof(45, 6.6, 1.9), center: hipRoof(14, 6.4, 4.1), pav: hipRoof(7.2, 7.1, 2.5) }), []);
  // The sign is carved into the stone, built as real geometry so nothing can flicker: a stone face with the letters and the five stars
  // cut out of it, the letters seen as gilded cavities (inside walls and floor), the stars as gilded V-cuts.
  // Faces never overlap at the same depth: face z 5.0 | cavity floor 4.84 | band body ends at 4.78 | arch body ends at 4.75.
  const signGold = useMemo(() => goldMat(), []);
  const cavityGold = useMemo(() => { const m = goldMat(); m.side = THREE.BackSide; return m; }, []);
  const signStone = useMemo(() => { const m = stone(12.8, 1.7).clone(); m.emissiveIntensity = .02; return m; }, []);      // eslint-disable-line react-hooks/exhaustive-deps
  const archStone = useMemo(() => { const m = stone(10.6, 3).clone(); m.emissiveIntensity = .02; return m; }, []);        // eslint-disable-line react-hooks/exhaustive-deps
  const word = useMemo(() => carvedWord('DRIVINGKLASS', 10.6, 12.76, 1.66, -.5, .16, .07, lite ? 4 : 8), [lite]);
  const stars = useMemo(() => carvedRow([.46, .58, .86, .58, .46], 1.45, [-.16, -.05, 0, -.05, -.16], .2), []);
  const archBody = useMemo(() => { const g = new THREE.ExtrudeGeometry(archShape, { depth: .75, bevelEnabled: false }); g.computeVertexNormals(); return g; }, [archShape]);
  const archFace = useMemo(() => {
    const sh = archShape.clone(); sh.holes = stars.outlines.map(o => new THREE.Path(o.map(v => new THREE.Vector2(v.x, v.y + .6))));   // star centres sit at 8.2 = arch origin 7.6 + .6
    const g = new THREE.ExtrudeGeometry(sh, { depth: .25, bevelEnabled: false }); g.computeVertexNormals();
    // stone texture coordinates 0..1 across the arch, as the plain arch had
    const p = g.attributes.position as THREE.BufferAttribute, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + 5.3) / 10.6; uv[i * 2 + 1] = p.getY(i) / 3; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
  }, [archShape, stars]);
  useFrame(() => { const n = mix.current; signGold.emissiveIntensity = cavityGold.emissiveIntensity = .02 + .26 * n; });
  const crownGeo = useMemo(() => { const g = new THREE.ExtrudeGeometry(starShape(1, .46), { depth: .34, bevelEnabled: true, bevelThickness: .12, bevelSize: .06, bevelSegments: 2 }); g.translate(0, 0, -.17); g.computeVertexNormals(); return g; }, []);

  /** A wall built from boxes with real openings, so every window has depth. */
  const wallBoxes = (x0: number, x1: number, y0: number, y1: number, z: number, d: number, openings: Opening[]): B[] => {
    const ops = [...openings].sort((a, b) => a.cx - b.cx), out: B[] = []; let cur = x0;
    ops.forEach(o => { const l = o.cx - o.w / 2, r = o.cx + o.w / 2; out.push(box(cur, l, y0, y1, z - d, z), box(l, r, y0, o.y0, z - d, z), box(l, r, o.y1, y1, z - d, z)); cur = r; });
    out.push(box(cur, x1, y0, y1, z - d, z)); return out;
  };

  /** Black window frame with mullions, glass showing the interior texture behind it. */
  const Bay = ({ cx, w, y0, y1, z, kind, rows = 2 }: { cx: number; w: number; y0: number; y1: number; z: number; kind: keyof typeof glass; rows?: number }) => {
    const h = y1 - y0, zf = z - .12, f = .13;
    return <group>
      <mesh position={[cx, (y0 + y1) / 2, z - .16]} scale={[w, h, 1]} geometry={pane} material={glass[kind]} />
      {[-1, 1].map(s => <mesh key={s} position={[cx + s * (w / 2 - f / 2), (y0 + y1) / 2, zf]} material={M.black}><boxGeometry args={[f, h, .22]} /></mesh>)}
      {[y0 + f / 2, y1 - f / 2].map(y => <mesh key={y} position={[cx, y, zf]} material={M.black}><boxGeometry args={[w, f, .22]} /></mesh>)}
      <mesh position={[cx, (y0 + y1) / 2, zf]} material={M.black}><boxGeometry args={[.08, h, .2]} /></mesh>
      {Array.from({ length: rows - 1 }).map((_, i) => <mesh key={i} position={[cx, y0 + (h * (i + 1)) / rows, zf]} material={M.black}><boxGeometry args={[w, .08, .2]} /></mesh>)}
    </group>;
  };

  /** The same frame and lit room as the front windows, on the back wall (local z -2.95), looking out over the patio, with a stone sill. */
  const BackBay = ({ cx, w, y0, y1, kind, rows = 2, sill = true }: { cx: number; w: number; y0: number; y1: number; kind: keyof typeof glass; rows?: number; sill?: boolean }) => {
    const h = y1 - y0, zf = BACK - .1, f = .13;
    return <group>
      <mesh position={[cx, (y0 + y1) / 2, BACK - .03]} rotation-y={Math.PI} scale={[w, h, 1]} geometry={pane} material={glass[kind]} />
      {[-1, 1].map(s => <mesh key={s} position={[cx + s * (w / 2 - f / 2), (y0 + y1) / 2, zf]} material={M.black}><boxGeometry args={[f, h, .22]} /></mesh>)}
      {[y0 + f / 2, y1 - f / 2].map(y => <mesh key={y} position={[cx, y, zf]} material={M.black}><boxGeometry args={[w, f, .22]} /></mesh>)}
      <mesh position={[cx, (y0 + y1) / 2, zf]} material={M.black}><boxGeometry args={[.08, h, .2]} /></mesh>
      {Array.from({ length: rows - 1 }).map((_, i) => <mesh key={i} position={[cx, y0 + (h * (i + 1)) / rows, zf]} material={M.black}><boxGeometry args={[w, .08, .2]} /></mesh>)}
      {sill && <mesh position={[cx, y0 - .08, BACK - .2]} material={M.trim} castShadow><boxGeometry args={[w + .5, .14, .42]} /></mesh>}
      {sill && <mesh position={[cx, y1 + .14, BACK - .12]} material={M.trim}><boxGeometry args={[w + .4, .18, .26]} /></mesh>}
    </group>;
  };

  const Planter = ({ x, z, kind }: { x: number; z: number; kind: 'cone' | 'ball' | 'tree' | 'small' }) => {
    const ph = kind === 'small' ? .5 : .95, pw = kind === 'small' ? .9 : 1.5;
    return <group position={[x, 0, z]}>
      <mesh position={[0, ph / 2 + .16, 0]} material={M.trim} castShadow><boxGeometry args={[pw, ph, pw]} /></mesh>
      <Plant kind={kind} y={ph + .16} seed={Math.round(Math.abs(x) * 10 + z * 3)} detail={lite ? 0 : 1} />
      <mesh position={[pw / 2 - .05, ph + .2, pw / 2 - .05]} material={M.lamp}><boxGeometry args={[.14, .08, .14]} /></mesh>
    </group>;
  };

  // openings through the main front wall
  const wallOps: Opening[] = [
    { cx: 0, w: 3.8, y0: 1.0, y1: 4.7 },
    ...[-1, 1].flatMap(s => [{ cx: s * 6.55, w: 2.1, y0: 1.0, y1: 4.9 }, { cx: s * 10.5, w: 2.0, y0: 1.0, y1: 6.0 }, { cx: s * 15.4, w: 2.1, y0: 1.0, y1: 4.9 }, { cx: s * 19.4, w: 2.1, y0: 1.0, y1: 4.9 }]),
  ];
  const pavOps = (s: number): Opening[] => [{ cx: s * 10.5, w: 2.0, y0: 1.0, y1: 6.0 }];
  /*
   * The masonry, merged: the two kinds of wall, the rusticated base, and one "kit" of dressed stone that carries every moulding
   * (window surrounds with sills, keystones and caps, the entablature with its dentils, quoins, pavilion pilasters, chimneys,
   * dormer fronts). Five draw calls for all of it, and the stone is laid in world metres so every course lines up.
   */
  const kit = useMemo(() => {
    const Z = FRONT, PZ = FRONT + .6, t: B[] = [], base: B[] = [], extra: THREE.BufferGeometry[] = [];
    const main = [...wallBoxes(-HALF, HALF, .16, WALL_H, Z, DEPTH, wallOps), box(-HALF, HALF, .16, WALL_H, BACK, Z - DEPTH)];
    const pav = [-1, 1].flatMap(s => [...wallBoxes(s < 0 ? -13.1 : 7.7, s < 0 ? -7.7 : 13.1, .16, PAV_H, PZ, .9, pavOps(s)), box(s * 7.7, s * 13.1, WALL_H, PAV_H, -2.7, 1.5)]);
    const tri = (cx: number, y: number, z: number, half: number, rise: number, depth: number) => { const sh = new THREE.Shape(); sh.moveTo(-half, 0); sh.lineTo(half, 0); sh.lineTo(0, rise); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(cx, y, z); extra.push(g); };
    /** An architrave round an opening: jambs, head, keystone, a projecting cap and a sill; a pediment over the grand ones. */
    const surround = (cx: number, w: number, y0: number, y1: number, z: number, sill = true, grand = false) => {
      const j = .2;
      [-1, 1].forEach(sd => t.push(box(cx + sd * w / 2, cx + sd * (w / 2 + j), y0, y1 + j, z - .03, z + .09)));
      t.push(box(cx - w / 2, cx + w / 2, y1, y1 + j, z - .03, z + .09), box(cx - .17, cx + .17, y1 - .03, y1 + j, z - .03, z + .15));
      t.push(box(cx - w / 2 - j - .12, cx + w / 2 + j + .12, y1 + j, y1 + j + .1, z - .03, z + .2));
      if (sill) t.push(box(cx - w / 2 - j - .06, cx + w / 2 + j + .06, y0 - .1, y0 + .02, z - .03, z + .3));
      if (grand) tri(cx, y1 + j + .1, z - .02, w / 2 + j + .3, .58, .2);
    };
    surround(0, 3.8, 1.0, 4.7, Z, false);
    [-1, 1].forEach(s => {
      [6.55, 15.4, 19.4].forEach(x => surround(s * x, 2.1, 1.0, 4.9, Z));
      surround(s * 10.5, 2.0, 1.0, 6.0, PZ, true, true);
      // rusticated base under a moulded cap: wings, pavilion, the gable end and the back
      const seg = (a: number, b: number) => { base.push(box(s * a, s * b, .16, .9, Z - .03, Z + .12)); t.push(box(s * a, s * b, .88, 1.0, Z - .03, Z + .18)); };
      seg(5.8, 7.58); seg(13.22, HALF);
      base.push(box(s * 7.58, s * 13.22, .16, .9, 2.9, PZ + .12)); t.push(box(s * 7.52, s * 13.28, .88, 1.0, 2.9, PZ + .18));
      base.push(box(s * (HALF - .03), s * (HALF + .12), .16, .9, BACK - .12, Z + .12)); t.push(box(s * (HALF - .03), s * (HALF + .18), .88, 1.0, BACK - .18, Z + .18));
      base.push(box(s * 3.1, s * HALF, .16, .78, BACK - .12, BACK + .03)); t.push(box(s * 3.1, s * HALF, .74, .84, BACK - .17, BACK + .03));
      // entablature on the wing: dentils under the cornice
      for (let x = 13.4; x < 22.2; x += .44) t.push(box(s * x, s * (x + .22), 6.04, 6.24, Z - .02, Z + .17));
      // pavilion: corner pilasters with caps, dentils, a cornice that oversails the face, a top fillet
      [7.7, 12.6].forEach(xe => { t.push(box(s * xe, s * (xe + .5), 1.0, 7.78, PZ - .03, PZ + .09), box(s * (xe - .06), s * (xe + .56), 7.58, 7.78, PZ - .03, PZ + .15)); });
      for (let x = 8.42; x < 12.3; x += .44) t.push(box(s * x, s * (x + .22), 7.72, 7.92, PZ - .02, PZ + .16));
      t.push(box(s * 7.7, s * 13.1, 7.92, 8.0, PZ - .03, PZ + .2), box(s * 7.35, s * 13.45, 8.0, 8.6, 3.3, PZ + .35), box(s * 7.0, s * 13.8, 8.6, 8.68, -3.3, PZ + .55));
      // quoins on the two gable corners, front and back: long and short turn about up the corner
      for (let i = 0, y = 1.06; y + .36 < 5.45; i++, y += .44) { const fw = i % 2 ? .8 : .5, dw = i % 2 ? .5 : .8; t.push(box(s * (HALF - fw), s * (HALF + .07), y, y + .36, Z - dw, Z + .07), box(s * (HALF - fw), s * (HALF + .07), y, y + .36, BACK - .07, BACK + dw)); }
      // the door's pilaster: base and cap
      t.push(box(s * 3.3, s * 4.2, 1.0, 1.2, Z - .03, Z + .76), box(s * 3.3, s * 4.2, 5.06, 5.25, Z - .03, Z + .76));
      // a chimney behind the ridge, and a dormer on the wing's front slope
      t.push(box(s * 14.5, s * 15.4, 7.3, 9.9, -1.75, -.95), box(s * 14.4, s * 15.5, 9.9, 10.03, -1.85, -.85), box(s * 14.62, s * 15.28, 10.03, 10.25, -1.63, -1.07));
      t.push(box(s * 16.65, s * 18.15, 7.25, 8.1, 1.0, 2.35), box(s * 16.57, s * 18.23, 7.4, 7.49, 2.2, 2.45)); tri(s * 17.4, 8.1, 2.4, .86, .44, .08);
    });
    // across the whole front: an architrave line, the bed mould under the cornice, and a fillet over it (in three lengths, clear of the pavilions)
    t.push(box(-HALF - .03, HALF + .03, 5.5, 5.6, Z - .03, Z + .07), box(-HALF - .1, HALF + .1, 6.24, 6.4, BACK - .26, Z + .26));
    [[-22.82, -13.1], [-7.7, 7.7], [13.1, 22.82]].forEach(([a, b]) => t.push(box(a!, b!, 6.9, 6.98, -3.62, 3.62)));
    t.push(box(-6.9, 6.9, 5.895, 5.97, Z - .03, 6.6));                       // the canopy's own top fillet
    // dormer roofs: two slopes of slate each, the courses running along the little ridge
    const dr: number[] = [], du: number[] = [];
    [-1, 1].forEach(s => { const cx = s * 17.4, y = 8.1, z0 = .3, z1 = 2.52, hw = .98, rise = .5, L = Math.hypot(hw, rise);
      [-1, 1].forEach(sd => { const A = [cx + sd * hw, y, z0], Bq = [cx + sd * hw, y, z1], Cq = [cx, y + rise, z1], D = [cx, y + rise, z0];
        const quad = sd > 0 ? [A, Bq, Cq, A, Cq, D] : [A, Cq, Bq, A, D, Cq]; quad.forEach(v => { dr.push(...(v as number[])); du.push((v as number[])[2]! / 2.2, (v as number[])[1] === y ? 0 : L / 2.2); }); }); });
    const dormRoof = new THREE.BufferGeometry(); dormRoof.setAttribute('position', new THREE.Float32BufferAttribute(dr, 3)); dormRoof.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2)); dormRoof.computeVertexNormals();
    return { main: masonry(main), pav: masonry(pav), base: masonry(base, [], 4.8, 2.4), trim: masonry(t, extra), dormRoof };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const pl = useMemo<HedgePlant>(() => ({ core: new THREE.MeshStandardMaterial({ color: '#27452a', roughness: 1 }), blob: leafCard(), leaf: leafCardMaterial(), k: lite ? .32 : .8 }), [lite]);
  const colGeo = useMemo(() => columnGeometry(4.345, .52), []);
  const pavStar = useMemo(() => facetedStar(.32, .3), []);
  const finial = useMemo(() => new THREE.LatheGeometry([[0, 0], [.16, 0], [.17, .06], [.07, .14], [.12, .26], [.15, .36], [.11, .47], [.035, .56], [.02, .95], [0, 1.0]].map(([r, y]) => new THREE.Vector2(r!, y!)), 14), []);
  const lampOn = open;

  return <group position={position}>
    {/* body, cornice and roofs */}
    <mesh geometry={kit.main} material={wallMat} castShadow receiveShadow />
    <mesh geometry={kit.pav} material={pavMat} castShadow receiveShadow />
    <mesh geometry={kit.base} material={baseMat} castShadow receiveShadow />
    <mesh geometry={kit.trim} material={M.dress} castShadow receiveShadow />
    <mesh geometry={kit.dormRoof} material={M.roof} castShadow />
    {/* gilded finials on the ridge of the centre roof and at the point of each pavilion roof */}
    {[[-3.8, WALL_H + 4.55, -.2], [3.8, WALL_H + 4.55, -.2], [-10.4, PAV_H + 3.05, .45], [10.4, PAV_H + 3.05, .45]].map(([x, y, z]) => <mesh key={`fin${x}`} geometry={finial} material={signGold} position={[x!, y!, z!]} castShadow />)}
    <mesh position={[0, WALL_H + .25, 0]} material={M.trim} castShadow><boxGeometry args={[HALF * 2 + .4, .5, 7]} /></mesh>
    <mesh geometry={roofs.main} material={M.roof} position={[0, WALL_H + .5, 0]} castShadow />
    <mesh geometry={roofs.center} material={M.roof} position={[0, WALL_H + .5, -.2]} castShadow />
    <RoofTrim w={45} d={6.6} h={1.9} y={WALL_H + .5} cap={capM} fascia={fasM} />
    <RoofTrim w={14} d={6.4} h={4.1} y={WALL_H + .5} z={-.2} cap={capM} fascia={fasM} />

    {/* pavilions: taller, proud of the wall, each with a tall lit window and its own pyramid roof */}
    {[-1, 1].map(s => <group key={s}>
      <mesh position={[s * 10.4, PAV_H + .3, -.3]} material={M.trim} castShadow><boxGeometry args={[6.1, .6, 7.2]} /></mesh>
      <mesh geometry={roofs.pav} material={M.roof} position={[s * 10.4, PAV_H + .6, .45]} castShadow />
      <RoofTrim w={7.2} d={7.1} h={2.5} y={PAV_H + .6} x={s * 10.4} z={.45} cap={capM} fascia={fasM} />
      <mesh geometry={pavStar} material={signGold} position={[s * 10.5, 7.3, FRONT + .62]} />
      <mesh position={[s * 17.4, 7.78, 2.37]} scale={[1.0, .5, 1]} geometry={pane} material={glass.office} />
      <Bay cx={s * 10.5} w={2.0} y0={1.0} y1={6.0} z={FRONT + .6} kind="hall" rows={3} />
      <Bay cx={s * 6.55} w={2.1} y0={1.0} y1={4.9} z={FRONT} kind={s < 0 ? 'tv' : 'meeting'} />
      <Bay cx={s * 15.4} w={2.1} y0={1.0} y1={4.9} z={FRONT} kind="office" />
      <Bay cx={s * 19.4} w={2.1} y0={1.0} y1={4.9} z={FRONT} kind={s < 0 ? 'meeting' : 'tv'} />
      {/* low hedges under the far windows and a round, a cone and a tree at each end */}
      <Hedge x={s * 17.4} y={.16} z={FRONT + .9} w={8.8} d={.9} h={.8} seed={41 + s} pl={pl} />
      <Hedge x={s * 6.55} y={.16} z={FRONT + .8} w={3.2} d={.8} h={.7} seed={45 + s} pl={pl} />
      <Planter x={s * 8.6} z={FRONT + 2.2} kind="cone" /><Planter x={s * 13.4} z={FRONT + 2.4} kind="tree" /><Planter x={s * 12.2} z={FRONT + 2.2} kind="small" />
      {/* the steps' handrails: two posts and a sloped top rail beside each flight */}
      <mesh position={[s * 3.7, 1.45, 6.25]} material={M.black}><cylinderGeometry args={[.045, .045, .9, 8]} /></mesh>
      <mesh position={[s * 3.7, .89, 7.15]} material={M.black}><cylinderGeometry args={[.045, .045, .9, 8]} /></mesh>
      <mesh position={[s * 3.7, 1.64, 6.7]} rotation={[Math.atan2(.56, .9), 0, 0]} material={M.black}><boxGeometry args={[.08, .08, 1.06]} /></mesh>
    </group>)}

    {/* entrance: doors, pilasters, canopy, columns, sign panel, arch, stars, letters */}
    <Bay cx={0} w={3.8} y0={1.0} y1={4.7} z={FRONT} kind="lobby" rows={3} />
    {[-1.9, -.95, 0, .95, 1.9].map(x => <mesh key={x} position={[x, 2.85, FRONT - .12]} material={M.black}><boxGeometry args={[x === 0 ? .1 : .1, 3.7, .2]} /></mesh>)}
    {[-.14, .14].map(x => <mesh key={x} position={[x * 1.4, 2.3, FRONT - .04]} material={M.gold}><boxGeometry args={[.07, .8, .09]} /></mesh>)}
    <mesh position={[1.45, 2.7, FRONT + .1]} material={undefined}><planeGeometry args={[.95, .48]} /><meshBasicMaterial map={lampOn ? tex.door.open : tex.door.closed} transparent toneMapped={false} /></mesh>
    <AFrame position={[2.7, .16, 8.1]} rotY={-.12} map={tex.hours} />
    {[-1, 1].map(s => <group key={s}>
      <mesh position={[s * 3.75, 3.1, FRONT + .35]} material={stone(.8, 4.3)} castShadow><boxGeometry args={[.8, 4.3, .7]} /></mesh>
      <mesh position={[s * 2.7, 3.9, FRONT + .25]} material={M.black}><boxGeometry args={[.16, .5, .16]} /></mesh>
      <mesh position={[s * 2.7, 3.9, FRONT + .43]} material={M.lamp}><boxGeometry args={[.22, .42, .22]} /></mesh>
      <mesh geometry={colGeo} position={[s * 4.8, 1.0, 5.7]} material={M.dress} castShadow receiveShadow />
      <Planter x={s * 2.85} z={4.6} kind="ball" />
    </group>)}
    <mesh position={[0, .58, 4.7]} material={stone(11.6, .9)} receiveShadow><boxGeometry args={[11.6, .84, 3.4]} /></mesh>
    <mesh position={[0, .3, 6.95]} material={stone(8, .3)}><boxGeometry args={[8, .28, .5]} /></mesh>
    <mesh position={[0, .44, 6.55]} material={stone(7.4, .3)}><boxGeometry args={[7.4, .56, .5]} /></mesh>
    <mesh position={[0, 5.62, 4.75]} material={M.trim} castShadow><boxGeometry args={[13.6, .55, 3.5]} /></mesh>
    <mesh position={[0, 5.26, 6.45]} material={M.led}><boxGeometry args={[13.4, .12, .12]} /></mesh>
    {[-4.4, -2.2, 2.2, 4.4].map(x => <mesh key={x} position={[x, 5.3, 5.0]} rotation-x={Math.PI / 2} material={M.lamp}><circleGeometry args={[.13, 14]} /></mesh>)}
    {/* the band: a stone body, a thin stone rim, the face with the letters cut out of it, the gilded letter cavities and the stone inside A, D, R */}
    <mesh position={[0, 6.75, 3.89]} material={signStone} castShadow><boxGeometry args={[12.8, 1.7, 1.78]} /></mesh>
    {[[12.8, .02, 0, .84], [12.8, .02, 0, -.84], [.02, 1.66, 6.39, 0], [.02, 1.66, -6.39, 0]].map(([bw, bh, bx, by], i) => <mesh key={i} position={[bx!, 6.75 + by!, 4.89]} material={signStone}><boxGeometry args={[bw!, bh!, .22]} /></mesh>)}
    <mesh geometry={word.face} material={signStone} position={[0, 6.75, 5.0]} />
    <mesh geometry={word.islands} material={signStone} position={[0, 6.75, 5.0]} />
    <mesh geometry={word.cavity} material={cavityGold} position={[0, 6.75, 5.0]} />
    {/* the arch: a stone body and a face with the five stars cut out, each star a gilded V-cut */}
    <mesh geometry={archBody} material={archStone} position={[0, 7.6, 4.0]} castShadow />
    <mesh geometry={archFace} material={archStone} position={[0, 7.6, 4.75]} castShadow />
    <mesh geometry={archLed} material={M.led} position={[0, 7.6, 5.04]} />
    {/* a soft warm halo behind the lettering and the stars at night, kept gentle so the sign never glares */}
    <Halo position={[0, 6.75, 5.03]} size={[13.5, 2.6]} strength={.1} />
    <Halo position={[0, 8.35, 5.03]} size={[9, 3]} strength={.08} />
    <mesh geometry={stars.cut} material={signGold} position={[0, 8.2, 5.0]} />
    {/* the back: the same lit windows as the front, a back door with its own small portico over the patio, lanterns and a light line under the cornice */}
    {[-1, 1].map(sg => <group key={`bw${sg}`}>
      <BackBay cx={sg * 6.55} w={2.1} y0={1.0} y1={4.9} kind={sg < 0 ? 'meeting' : 'tv'} />
      <BackBay cx={sg * 10.5} w={2.0} y0={1.0} y1={6.0} kind="hall" rows={3} />
      <BackBay cx={sg * 15.4} w={2.1} y0={1.0} y1={4.9} kind="office" />
      <BackBay cx={sg * 19.4} w={2.1} y0={1.0} y1={4.9} kind={sg < 0 ? 'tv' : 'meeting'} />
    </group>)}
    <BackBay cx={0} w={3.4} y0={.98} y1={4.4} kind="lobby" rows={3} sill={false} />
    {[-.34, .34].map(x => <mesh key={x} position={[x, 2.45, BACK - .27]} material={M.gold}><boxGeometry args={[.07, .9, .07]} /></mesh>)}
    {/* landing and three steps down to the patio, no rails to hide the door */}
    <mesh position={[0, .48, BACK - .575]} material={stone(6.2, .96)} castShadow receiveShadow><boxGeometry args={[6.2, .96, 1.15]} /></mesh>
    {[.72, .48, .24].map((top, i) => <mesh key={top} position={[0, top / 2, BACK - 1.15 - .19 - i * .38]} material={stone(6.2, top)} castShadow receiveShadow><boxGeometry args={[6.2, top, .38]} /></mesh>)}
    {/* two columns and a flat canopy with a light line and downlights */}
    {[-1, 1].map(sg => <group key={`bc${sg}`}>
      <mesh geometry={colGeo} position={[sg * 3.9, .96, BACK - 1.0]} scale={[.76, 4.19 / 4.345, .76]} material={M.dress} castShadow receiveShadow />
      <mesh position={[sg * 2.7, 3.35, BACK - .1]} material={M.black}><boxGeometry args={[.14, .06, .2]} /></mesh>
      <mesh position={[sg * 2.7, 3.2, BACK - .16]} material={M.lamp}><boxGeometry args={[.2, .4, .2]} /></mesh>
    </group>)}
    <mesh position={[0, 5.4, BACK - 1.45]} material={M.trim} castShadow><boxGeometry args={[9.4, .5, 2.9]} /></mesh>
    <mesh position={[0, 5.12, BACK - 2.88]} material={M.led}><boxGeometry args={[9.2, .1, .1]} /></mesh>
    {[-3, -1.5, 0, 1.5, 3].map(x => <mesh key={x} position={[x, 5.13, BACK - 1.3]} rotation-x={Math.PI / 2} material={M.lamp}><circleGeometry args={[.12, 14]} /></mesh>)}
    <mesh position={[0, WALL_H - .08, BACK - .6]} material={M.led}><boxGeometry args={[HALF * 2 + .2, .12, .12]} /></mesh>
    <mesh position={[0, WALL_H - .08, FRONT - 2]} visible={false}><boxGeometry args={[.01, .01, .01]} /></mesh>
  </group>;
}
