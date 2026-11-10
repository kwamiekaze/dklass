import * as THREE from 'three';
import { makeCanvasTexture } from './parts';

/*
 * Real windows, on any phone. Each pane is one flat quad, but the shader behind it works out a whole room for every pixel
 * (interior mapping): a back wall, side walls, a floor, a lit ceiling and a row of furniture standing half way in, all with
 * true parallax, so the rooms slide past as the camera moves the way real rooms do. Over that lies the glass: it mirrors
 * the sky more and more toward a grazing angle (Fresnel), carries a tree line along its horizon, and by day is mostly
 * reflection while at night the lit room shows through. One draw call a window, two texture reads, no extra geometry.
 */
export type RoomKind = 'tv' | 'meeting' | 'office' | 'hall' | 'lobby';

const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

/** The far wall of a room: paint, a panelled dado, a cornice, and what hangs on it. */
function backWall(kind: RoomKind, S: number) {
  return makeCanvasTexture(S, S, (g, w, h) => {
    const wall = g.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, '#f4ead6'); wall.addColorStop(.62, '#eadcc2'); wall.addColorStop(1, '#d8c7a8');
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    // cornice, dado rail and panelled wainscot
    g.fillStyle = '#fbf5e8'; g.fillRect(0, 0, w, h * .045); g.fillStyle = 'rgba(90,70,40,.18)'; g.fillRect(0, h * .045, w, 3);
    const dado = h * .68; g.fillStyle = '#e6d8bd'; g.fillRect(0, dado, w, h - dado); g.fillStyle = '#fbf5e8'; g.fillRect(0, dado - 5, w, 10); g.fillStyle = 'rgba(90,70,40,.22)'; g.fillRect(0, dado + 5, w, 2);
    for (let i = 0; i < 4; i++) { const x = 16 + i * (w - 32) / 4, pw = (w - 32) / 4 - 14; g.strokeStyle = 'rgba(120,96,60,.35)'; g.lineWidth = 2; g.strokeRect(x, dado + 26, pw, h - dado - 52); g.strokeStyle = 'rgba(255,255,255,.5)'; g.strokeRect(x + 2, dado + 28, pw, h - dado - 52); }
    g.fillStyle = '#b89b6e'; g.fillRect(0, h - 14, w, 14);
    const frame = (x: number, y: number, fw: number, fh: number, art: (x: number, y: number, w: number, h: number) => void) => {
      g.fillStyle = 'rgba(60,40,10,.25)'; g.fillRect(x + 4, y + 6, fw, fh);
      const gold = g.createLinearGradient(x, y, x + fw, y + fh); gold.addColorStop(0, '#e9c869'); gold.addColorStop(.5, '#b98a25'); gold.addColorStop(1, '#e2bd5a'); g.fillStyle = gold; g.fillRect(x, y, fw, fh);
      g.fillStyle = '#fbf7ee'; g.fillRect(x + 7, y + 7, fw - 14, fh - 14); art(x + 16, y + 16, fw - 32, fh - 32);
    };
    const road = (x: number, y: number, aw: number, ah: number) => { const s = g.createLinearGradient(0, y, 0, y + ah); s.addColorStop(0, '#9cc4ea'); s.addColorStop(.55, '#f3dcb0'); s.addColorStop(.56, '#6f8f58'); s.addColorStop(1, '#4f6f42'); g.fillStyle = s; g.fillRect(x, y, aw, ah); g.fillStyle = '#3a3a40'; g.beginPath(); g.moveTo(x + aw * .46, y + ah * .56); g.lineTo(x + aw * .54, y + ah * .56); g.lineTo(x + aw * .8, y + ah); g.lineTo(x + aw * .2, y + ah); g.closePath(); g.fill(); g.fillStyle = '#e8c44a'; g.fillRect(x + aw * .49, y + ah * .7, aw * .02, ah * .1); g.fillRect(x + aw * .485, y + ah * .86, aw * .03, ah * .12); };
    const stars = (x: number, y: number, aw: number, ah: number) => { g.fillStyle = '#16233f'; g.fillRect(x, y, aw, ah); g.fillStyle = '#e2b53e'; for (let i = 0; i < 5; i++) { const cx = x + aw * (.14 + i * .18), cy = y + ah * .5, R = ah * (i === 2 ? .3 : .22); g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? R * .42 : R; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); g.fill(); } };
    if (kind === 'tv') {
      // a wall screen showing a lesson, a credenza under it
      g.fillStyle = '#0d1016'; rr(g, w * .2, h * .2, w * .6, h * .34, 8); g.fill();
      const sc = g.createLinearGradient(0, h * .2, 0, h * .54); sc.addColorStop(0, '#3f7fd6'); sc.addColorStop(1, '#1d3f86'); g.fillStyle = sc; g.fillRect(w * .215, h * .215, w * .57, h * .31);
      g.fillStyle = '#f4f6fb'; rr(g, w * .36, h * .36, w * .28, h * .075, 8); g.fill(); rr(g, w * .41, h * .31, w * .17, h * .07, 10); g.fill();
      g.fillStyle = '#10151f'; [w * .41, w * .59].forEach(x => { g.beginPath(); g.arc(x, h * .44, w * .026, 0, 7); g.fill(); });
      g.fillStyle = '#5a3d22'; g.fillRect(w * .24, h * .6, w * .52, h * .08); g.fillStyle = '#3d2814'; g.fillRect(w * .24, h * .6, w * .52, 4);
    } else if (kind === 'meeting') {
      frame(w * .08, h * .16, w * .36, h * .3, road); frame(w * .56, h * .16, w * .36, h * .3, stars);
      g.fillStyle = '#f7f7f4'; rr(g, w * .3, h * .5, w * .4, h * .12, 4); g.fill(); g.strokeStyle = '#9aa0a8'; g.lineWidth = 3; g.stroke();
    } else if (kind === 'office') {
      // a bookcase and a framed licence
      g.fillStyle = '#5a3d22'; g.fillRect(w * .06, h * .1, w * .42, h * .58); g.fillStyle = '#2c1c0e'; g.fillRect(w * .08, h * .12, w * .38, h * .54);
      for (let s = 0; s < 4; s++) { const y = h * (.12 + s * .135); g.fillStyle = '#5a3d22'; g.fillRect(w * .08, y + h * .12, w * .38, 5); let x = w * .09; let k = s * 7; while (x < w * .44) { const bw2 = 7 + ((k * 37) % 9), bh2 = h * (.07 + ((k * 13) % 5) * .008); g.fillStyle = ['#8b2f2a', '#28507a', '#d9b24a', '#2f6b4a', '#e8e0cf', '#5b3a6b'][k % 6]!; g.fillRect(x, y + h * .12 - bh2, bw2, bh2); x += bw2 + 2; k++; } }
      frame(w * .6, h * .18, w * .3, h * .26, stars);
    } else if (kind === 'hall') {
      frame(w * .2, h * .08, w * .6, h * .34, road);
      [w * .08, w * .92].forEach(x => { g.fillStyle = '#b98a25'; g.fillRect(x - 5, h * .3, 10, h * .1); const gl = g.createRadialGradient(x, h * .27, 0, x, h * .27, w * .16); gl.addColorStop(0, 'rgba(255,240,200,.95)'); gl.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gl; g.fillRect(x - w * .16, h * .11, w * .32, h * .32); });
      g.fillStyle = '#5a3d22'; g.fillRect(w * .3, h * .56, w * .4, h * .12);
    } else {
      // the lobby: a feature wall with the five stars and the name in gold, a pair of doors beyond
      g.fillStyle = '#1b2a4a'; g.fillRect(w * .14, h * .1, w * .72, h * .4);
      stars(w * .22, h * .14, w * .56, h * .16);
      g.fillStyle = '#e2b53e'; g.font = `700 ${Math.round(h * .085)}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('DRIVINGKLASS', w / 2, h * .4);
      const gl = g.createRadialGradient(w / 2, h * .08, 0, w / 2, h * .08, w * .5); gl.addColorStop(0, 'rgba(255,244,214,.55)'); gl.addColorStop(1, 'rgba(255,244,214,0)'); g.fillStyle = gl; g.fillRect(0, 0, w, h * .6);
    }
    // the corners of a room are always a little darker
    const v = g.createRadialGradient(w / 2, h * .42, w * .25, w / 2, h * .5, w * .78); v.addColorStop(0, 'rgba(40,24,6,0)'); v.addColorStop(1, 'rgba(40,24,6,.34)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  }, 4, false);
}

/** What stands in the middle of the room, on a clear sheet: desks, screens, chairs, plants, lamps. */
function furniture(kind: RoomKind, S: number) {
  const t = makeCanvasTexture(S, S, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const wood = (x: number, y: number, dw: number, dh: number) => { const gr = g.createLinearGradient(0, y, 0, y + dh); gr.addColorStop(0, '#7a5230'); gr.addColorStop(1, '#4a2f18'); g.fillStyle = gr; g.fillRect(x, y, dw, dh); g.fillStyle = '#93673e'; g.fillRect(x - 6, y - 8, dw + 12, 10); };
    const chair = (x: number, y: number, s: number) => { const gr = g.createLinearGradient(x, 0, x + s, 0); gr.addColorStop(0, '#1b1d24'); gr.addColorStop(.5, '#34373f'); gr.addColorStop(1, '#17181d'); g.fillStyle = gr; rr(g, x, y, s, s * 1.15, s * .22); g.fill(); g.fillStyle = '#101114'; g.fillRect(x + s * .44, y + s * 1.15, s * .12, s * .5); g.fillRect(x + s * .12, y + s * 1.62, s * .76, s * .08); };
    const monitor = (x: number, y: number, s: number) => { g.fillStyle = '#0c0e13'; rr(g, x, y, s, s * .62, 4); g.fill(); const sc = g.createLinearGradient(0, y, 0, y + s * .6); sc.addColorStop(0, '#9fc2f2'); sc.addColorStop(1, '#3d6fc0'); g.fillStyle = sc; g.fillRect(x + 4, y + 4, s - 8, s * .62 - 10); g.fillStyle = '#0c0e13'; g.fillRect(x + s * .44, y + s * .62, s * .12, s * .16); g.fillRect(x + s * .28, y + s * .76, s * .44, s * .05); };
    const plant = (x: number, y: number, s: number) => { g.fillStyle = '#e9e2d2'; g.beginPath(); g.moveTo(x - s * .3, y); g.lineTo(x + s * .3, y); g.lineTo(x + s * .22, y + s * .6); g.lineTo(x - s * .22, y + s * .6); g.closePath(); g.fill(); for (let i = 0; i < 16; i++) { const a = -Math.PI * (.08 + .84 * (i / 15)), L = s * (.7 + ((i * 7) % 5) * .12); g.strokeStyle = ['#2f6b34', '#3f8a45', '#255a2c'][i % 3]!; g.lineWidth = s * .13; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * .5, y + Math.sin(a) * L, x + Math.cos(a) * L, y + Math.sin(a) * L * .8); g.stroke(); } };
    const lamp = (x: number, y: number, s: number) => { g.fillStyle = '#b98a25'; g.fillRect(x - 2, y, 4, s); g.fillRect(x - s * .16, y + s, s * .32, 5); const gl = g.createRadialGradient(x, y, 0, x, y, s * .9); gl.addColorStop(0, 'rgba(255,236,190,.9)'); gl.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = gl; g.fillRect(x - s, y - s, s * 2, s * 2); g.fillStyle = '#fff3d6'; g.beginPath(); g.moveTo(x - s * .2, y - s * .28); g.lineTo(x + s * .2, y - s * .28); g.lineTo(x + s * .32, y + s * .08); g.lineTo(x - s * .32, y + s * .08); g.closePath(); g.fill(); };
    const fl = h * .985;   // the floor line of the sheet
    if (kind === 'tv') { wood(w * .1, fl - h * .2, w * .34, h * .2); chair(w * .16, fl - h * .34, w * .1); chair(w * .3, fl - h * .34, w * .1); wood(w * .58, fl - h * .2, w * .34, h * .2); chair(w * .66, fl - h * .34, w * .1); monitor(w * .76, fl - h * .34, w * .13); plant(w * .5, fl - h * .16, w * .12); }
    else if (kind === 'meeting') { wood(w * .1, fl - h * .19, w * .8, h * .19); [.14, .3, .46, .62, .78].forEach(x => chair(w * x, fl - h * .34, w * .095)); lamp(w * .93, fl - h * .5, w * .16); }
    else if (kind === 'office') { wood(w * .12, fl - h * .2, w * .62, h * .2); monitor(w * .2, fl - h * .35, w * .15); monitor(w * .44, fl - h * .35, w * .15); chair(w * .32, fl - h * .37, w * .11); plant(w * .88, fl - h * .2, w * .14); lamp(w * .68, fl - h * .34, w * .1); }
    else if (kind === 'hall') { plant(w * .16, fl - h * .2, w * .2); plant(w * .84, fl - h * .2, w * .2); g.fillStyle = '#2a2d35'; rr(g, w * .34, fl - h * .16, w * .32, h * .1, 10); g.fill(); g.fillRect(w * .37, fl - h * .06, w * .03, h * .06); g.fillRect(w * .6, fl - h * .06, w * .03, h * .06); }
    else { // reception desk with a gold line, two plants
      const gr = g.createLinearGradient(0, fl - h * .24, 0, fl); gr.addColorStop(0, '#22345c'); gr.addColorStop(1, '#131d36'); g.fillStyle = gr; rr(g, w * .24, fl - h * .24, w * .52, h * .24, 10); g.fill();
      g.fillStyle = '#e2b53e'; g.fillRect(w * .24, fl - h * .2, w * .52, 5); g.fillStyle = '#f4efe4'; g.fillRect(w * .22, fl - h * .26, w * .56, 9);
      monitor(w * .56, fl - h * .38, w * .12); plant(w * .1, fl - h * .2, w * .16); plant(w * .9, fl - h * .2, w * .16);
    }
  }, 4, false);
  return t;
}

const VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vO; varying vec3 vD; varying vec3 vWN; varying vec3 vWV; varying float vSeed; varying vec2 vSz;
  void main() {
    vO = position;
    vec3 camO = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vD = position - camO;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    vWV = cameraPosition - wp.xyz;
    vSz = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
    vSeed = fract(sin(dot(modelMatrix[3].xz + vSz, vec2(12.9898, 78.233))) * 43758.5453);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uBack, uMid;
  uniform float uNight, uLit, uTime;
  uniform vec3 uSkyTop, uSkyHor, uGround, uTrees, uWarm;
  varying vec3 vO; varying vec3 vD; varying vec3 vWN; varying vec3 vWV; varying float vSeed; varying vec2 vSz;
  const float DEPTH = 3.4;
  void main() {
    vec3 d = normalize(vD); vec3 o = vec3(vO.xy, 0.0);
    // the room is wider than the window and a little taller: half-width BX window-widths, floor and ceiling in window-heights
    float BX = max(.95, 2.6 / vSz.x), FL = -.5 - .35 / vSz.y, CE = .5 + .25 / vSz.y;
    float tx = ((d.x > 0.0 ? BX : -BX) - o.x) / d.x, ty = ((d.y > 0.0 ? CE : FL) - o.y) / d.y, tz = -DEPTH / min(d.z, -1e-4);
    float t = min(tz, min(tx, ty)); vec3 p = o + d * t;
    float deep = clamp(-p.z / DEPTH, 0.0, 1.0);
    vec2 m = vec2(p.x * vSz.x, p.z);                                    // metres across and into the room
    vec3 col;
    if (t == tz) { col = texture2D(uBack, vec2(p.x / (2.0 * BX) + .5, (p.y - FL) / (CE - FL))).rgb; }
    else if (t == ty && d.y < 0.0) {                                    // floor: boards running into the room, a soft sheen
      float b = fract(m.x * 2.4), seam = smoothstep(.0, .04, b) * smoothstep(1., .96, b);
      float tone = fract(sin(floor(m.x * 2.4) * 91.7) * 43.3);
      col = mix(vec3(.2, .115, .052), vec3(.31, .19, .092), tone) * (.72 + .28 * seam) * (1.25 - .5 * deep);
    } else if (t == ty) {                                               // ceiling: white, with a grid of downlights
      vec2 c = fract(vec2(m.x * .5, m.y * .62)) - .5; float spot = smoothstep(.2, .02, length(c));
      col = vec3(.78, .75, .69) + uWarm * spot * 1.6;
    } else {                                                            // side walls: paint above a dado
      float y01 = (p.y - FL) / (CE - FL); col = mix(vec3(.62, .54, .4), vec3(.83, .77, .64), smoothstep(.3, .34, y01)) * (1.05 - .3 * deep);
    }
    // light falls off into the room; corners gather shade
    float edge = min(min(BX - abs(p.x), p.y - FL), CE - p.y); col *= .62 + .38 * smoothstep(0.0, .22, edge + (t == tz ? .3 : 0.0));
    col *= 1.0 - .22 * deep;
    // the furniture, standing 45% of the way in
    float tm = -(DEPTH * .45) / min(d.z, -1e-4);
    if (tm < t) { vec3 q = o + d * tm; vec2 uv = vec2(q.x / (2.0 * BX) + .5, (q.y - FL) / (CE - FL)); if (uv.x > 0.0 && uv.x < 1.0) { vec4 f = texture2D(uMid, uv); col = mix(col, f.rgb * .9, f.a); } }
    // a roller blind drawn part of the way down some windows
    float blind = step(.45, vSeed) * (.1 + .22 * fract(vSeed * 7.3));
    float inBlind = step(.5 - blind, vO.y);
    // room light: daylight through the glass by day, the lamps at night (a few rooms are dark after hours)
    float on = mix(1.0, step(.4, fract(vSeed * 3.7)), uNight * (1.0 - uLit));
    vec3 room = col * mix(vec3(.5), uWarm * 2.3 * on + .06, uNight);
    room = mix(room, mix(vec3(.74, .7, .62), uWarm * 1.35 * on + .1, uNight), inBlind * .93);
    // the glass
    vec3 N = normalize(vWN), V = normalize(vWV), R = reflect(-V, N);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
    float az = atan(R.z, R.x), ridge = .03 + .02 * sin(az * 7.0 + 1.3) + .014 * sin(az * 17.0) + .008 * sin(az * 41.0);
    vec3 sky = mix(uSkyHor, uSkyTop, smoothstep(0.0, .55, R.y));
    sky = mix(uTrees, sky, smoothstep(ridge, ridge + .025, R.y));
    sky = mix(uGround, sky, smoothstep(-.02, .0, R.y));
    float k = mix(.3, 1.0, fres) * mix(1.0, .5, uNight);
    vec3 outc = mix(room * vec3(.93, .97, .96), sky, k);
    gl_FragColor = vec4(outc, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export type Glazing = { mats: Record<RoomKind, THREE.ShaderMaterial>; update: (night: number, deep: number, cloud: number, open: boolean) => void };

/** The five rooms of the building, as five materials that share their sky. Call update() once a frame. */
export function makeGlazing(lite = false): Glazing {
  const S = lite ? 256 : 512;
  const shared = {
    uNight: { value: 0 }, uLit: { value: 1 }, uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uTrees: { value: new THREE.Color() },
    uWarm: { value: new THREE.Color('#ffd9a0') },
  };
  const mk = (kind: RoomKind) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared, uBack: { value: backWall(kind, S) }, uMid: { value: furniture(kind, S) } },
  });
  const mats = { tv: mk('tv'), meeting: mk('meeting'), office: mk('office'), hall: mk('hall'), lobby: mk('lobby') };
  const C = { topD: new THREE.Color('#3f86dc'), topN: new THREE.Color('#060b2a'), horD: new THREE.Color('#e9eef2'), horN: new THREE.Color('#1c2350'), gD: new THREE.Color('#8a8a90'), gN: new THREE.Color('#0c0d16'), tD: new THREE.Color('#47663f'), tN: new THREE.Color('#05070c'), grey: new THREE.Color('#aab2bc') };
  return { mats, update(night, deep, cloud, open) {
    shared.uNight.value = night; shared.uLit.value = open ? 1 : .0;
    const dim = 1 - .55 * deep * night;
    shared.uSkyTop.value.copy(C.topD).lerp(C.grey, cloud * .85).lerp(C.topN, night).multiplyScalar(dim);
    shared.uSkyHor.value.copy(C.horD).lerp(C.grey, cloud * .6).lerp(C.horN, night).multiplyScalar(dim);
    shared.uGround.value.copy(C.gD).lerp(C.gN, night); shared.uTrees.value.copy(C.tD).lerp(C.tN, night);
  } };
}
