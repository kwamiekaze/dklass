import * as THREE from 'three';

/**
 * Turning wheels for the fleet cars.
 *
 * The Meshy car files are one fused mesh: the wheels are real round geometry, but they are not separate objects. So at load time each wheel is cut out of that mesh: every
 * triangle whose three corners all lie inside a wheel's disc (and outboard of the axle, where the tyre and rim are) becomes a wheel; everything else stays the body. The
 * wheels share the file's own vertex buffers (no copy of the geometry, the body just gets a shorter index list), and each one hangs on a pivot at its own centre that
 * the car turns (steering, front pair) and spins (rolling, all four). The wheel discs are found per car and stored in IMPORTED_FLEET (Fleet.tsx), in the same car space
 * `prepare()` builds: length along x, up y, ground at y = 0.
 *
 * If a car has no fit, or the cut finds too little to be a wheel, nothing is split and the car is exactly the one it always was.
 */
export type WheelFit = {
  /** Axle at +x and at -x in car space: [x, centre height, radius]. */
  pos: [number, number, number];
  neg: [number, number, number];
  /** Wheels are the triangles at least this far from the car's centre line (default .5 of the half width is too much: .5 m works for every car). */
  zIn?: number;
  /** ...and no further than this (the fender skin sits just outside the tyre). */
  zOut?: number;
};

export type WheelPart = {
  /** Triangle index list (into the file's own vertex buffer). */
  idx: Uint32Array;
  /** Wheel centre in car space. */
  cx: number; cy: number; cz: number;
  /** Axle at +x (true) or -x (false), and the side of the car (+z or -z) in car space. */
  posAxle: boolean; side: 1 | -1;
  /** Nearest and furthest distance of the cut triangles from the car's centre line (car space, metres). */
  z0: number; z1: number;
};
/** `colors`: one linear RGB per vertex of the file (only wheel vertices are filled): near-black rubber for the tyre, dark graphite for the rim. Wheels are drawn with these, never with the file's baked (paint-stained) texture. */
export type WheelSplit = { body: Uint32Array; wheels: WheelPart[]; colors: Float32Array };
const TYRE: [number, number, number] = [.012, .012, .014], RIM: [number, number, number] = [.055, .055, .06], RIM_R = .64;   // the rim is everything inside .64 of the tyre's radius

const MIN_TRIS = 120;   // a wheel with fewer triangles than this is not a wheel: leave the car alone

/** Cut the wheels out of `index`. `toCar` takes the file's own coordinates (what the position attribute stores) to car space. Returns null when this car cannot be split. */
export function splitWheels(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: ArrayLike<number>, toCar: THREE.Matrix4, fit: WheelFit): WheelSplit | null {
  const n = position.count, e = toCar.elements, car = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    car[i * 3] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
    car[i * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
    car[i * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
  }
  const zIn = fit.zIn ?? .5, zOut = fit.zOut ?? 1.2, K = 1.04;
  const axles = [fit.pos, fit.neg] as const, tris = index.length / 3;
  const take: number[][] = [[], [], [], []];   // +x/+z, +x/-z, -x/+z, -x/-z
  const body: number[] = [];
  for (let t = 0; t < tris; t++) {
    const a = index[t * 3]!, b = index[t * 3 + 1]!, c = index[t * 3 + 2]!;
    let slot = -1;
    for (let ax = 0; ax < 2 && slot < 0; ax++) {
      const [cx, cy, r] = axles[ax]!, lim = r * K;
      let ok = true, zs = 0;
      for (const v of [a, b, c]) {
        const x = car[v * 3]!, y = car[v * 3 + 1]!, z = car[v * 3 + 2]!, az = Math.abs(z);
        if (Math.hypot(x - cx, y - cy) > lim || az < zIn || az > zOut) { ok = false; break; }
        zs += z;
      }
      if (ok) slot = ax * 2 + (zs > 0 ? 0 : 1);
    }
    if (slot < 0) body.push(a, b, c); else take[slot]!.push(a, b, c);
  }
  const wheels: WheelPart[] = [], colors = new Float32Array(n * 3);
  for (let s = 0; s < 4; s++) {
    const idx = take[s]!;
    if (idx.length / 3 < MIN_TRIS) return null;
    const ax = s >> 1, side: 1 | -1 = s % 2 === 0 ? 1 : -1, [cx, cy] = axles[ax]!;
    const zs: number[] = []; for (let i = 0; i < idx.length; i += 3) zs.push(Math.abs(car[idx[i]! * 3 + 2]!));
    zs.sort((p, q) => p - q);
    const r = axles[ax]![2];
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i]!, f = Math.hypot(car[v * 3]! - cx, car[v * 3 + 1]! - cy) / r, c = f < RIM_R ? RIM : TYRE;
      colors[v * 3] = c[0]; colors[v * 3 + 1] = c[1]; colors[v * 3 + 2] = c[2];
    }
    wheels.push({ idx: Uint32Array.from(idx), cx, cy, cz: side * zs[zs.length >> 1]!, posAxle: ax === 0, side, z0: zs[0]!, z1: zs[zs.length - 1]! });
  }
  return { body: Uint32Array.from(body), wheels, colors };
}

/** Pivot matrix, in the file's own coordinates: steer about the car's up axis, then spin about the axle, both through the wheel's centre. */
const T1 = new THREE.Matrix4(), T2 = new THREE.Matrix4(), R1 = new THREE.Matrix4(), R2 = new THREE.Matrix4();
export function wheelMatrix(out: THREE.Matrix4, centre: THREE.Vector3, up: THREE.Vector3, axle: THREE.Vector3, steer: number, spin: number) {
  T1.makeTranslation(centre.x, centre.y, centre.z); T2.makeTranslation(-centre.x, -centre.y, -centre.z);
  R1.makeRotationAxis(up, steer); R2.makeRotationAxis(axle, spin);
  return out.copy(T1).multiply(R1).multiply(R2).multiply(T2);
}

/** Materials shared by every wheel: tyre rubber is plain black (no texture, almost no reflection), the rim a dark graphite metal. */
let rubberMat: THREE.MeshStandardMaterial | null = null, rimMat: THREE.MeshStandardMaterial | null = null;
export function wheelMaterials() {
  rubberMat ??= new THREE.MeshStandardMaterial({ color: '#070708', roughness: .86, metalness: 0, envMapIntensity: .08 });
  rimMat ??= new THREE.MeshStandardMaterial({ color: '#2b2c31', roughness: .38, metalness: .85, envMapIntensity: .55 });
  return { rubber: rubberMat, rim: rimMat };
}

/**
 * A clean wheel built in code, axle along z, centred on the origin, `r` the outer radius and `w` the width: a round black tyre (flat tread, rounded shoulders, bulging sidewalls)
 * with a dark five spoke rim set in each side. The car files' own wheels are lumpy and carry the body paint in their texture, so they are cut out and these take their place.
 */
export function buildWheel(r: number, w: number, lite: boolean): THREE.Group {
  const { rubber, rim } = wheelMaterials(), g = new THREE.Group(), seg = lite ? 28 : 56, h = w / 2, rr = r * .6;
  // tyre profile, (radius, height along the axle): from the inner bead out over the tread and back to the other bead
  const prof: THREE.Vector2[] = [[rr, -h * .8], [r * .82, -h * .98], [r * .93, -h * 1.0], [r * .985, -h * .78], [r, -h * .5], [r, h * .5], [r * .985, h * .78], [r * .93, h * 1.0], [r * .82, h * .98], [rr, h * .8], [rr, -h * .8]].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, seg), rubber); tyre.rotation.x = Math.PI / 2; tyre.castShadow = !lite; g.add(tyre);
  // barrel (inside the rim) so nothing shows through, then a dished face and spokes on both sides
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, w * .8, seg, 1, true), rim); barrel.rotation.x = Math.PI / 2; g.add(barrel);
  for (const sd of [1, -1]) {
    const z = sd * h * .62, face = new THREE.Mesh(new THREE.CircleGeometry(rr * .96, seg), rim); face.position.z = z - sd * h * .12; if (sd < 0) face.rotation.y = Math.PI; g.add(face);
    const lip = new THREE.Mesh(new THREE.RingGeometry(rr * .88, rr * 1.02, seg), rim); lip.position.z = z + sd * h * .02; if (sd < 0) lip.rotation.y = Math.PI; g.add(lip);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(rr * .2, rr * .2, h * .3, 16), rim); hub.rotation.x = Math.PI / 2; hub.position.z = z + sd * h * .02; g.add(hub);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(rr * .78, rr * .17, h * .2), rim), a = (i / 5) * Math.PI * 2 + (sd < 0 ? Math.PI / 5 : 0), grp = new THREE.Group();
      sp.position.x = rr * .5; grp.add(sp); grp.rotation.z = a; grp.position.z = z; g.add(grp);
    }
  }
  return g;
}
