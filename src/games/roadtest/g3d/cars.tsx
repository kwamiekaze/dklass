import { Suspense, useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FleetCar, fleetFiles, type CarSignal, type WheelState } from '../../../components/nuhome2/world/Fleet';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import type { CastId } from '../../../components/nuhome2/world/cast';
import { atmo } from './atmo';
import { MPH_TO_MPS, type RunSim } from './sim';
import { GARAGE, type GarageId } from './garage';
import { glowTexture } from './textures';
import { damp } from './util';

/** The cars of the game are the homepage fleet, driven by the rules engine. */
export const SPEC_IDS: CastId[] = ['hero', 'camry', 'corolla', 'civic', 'elantra', 'sentra'];
const PLATE: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.plate]));
const SWATCH: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.swatch]));

/** Start fetching the files of the player's car (and the traffic) the moment the game screen opens. */
export function carFiles(id: string) { return fleetFiles(id); }

export interface TrafficSlot { group: THREE.Group; wheels: { current: WheelState }; spec: CastId; used: boolean }

const glow = () => glowTexture();

/** A red glow at each tail lamp that comes on with the brake (and dimly with the headlights). */
function BrakeGlow({ id, brake }: { id: GarageId; brake: { current: number } }) {
  const lamps = fleetFiles(id)?.lamps?.rear;
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  useFrame(() => {
    for (const s of refs.current) if (s) { const m = s.material as THREE.SpriteMaterial; m.opacity = brake.current; s.visible = brake.current > 0.02; }
  });
  if (!lamps) return null;
  const x = -Math.abs(lamps[0]) - 0.02, y = lamps[1], z = lamps[2];
  return <>
    {[-1, 1].map((sd, i) => <sprite key={i} ref={(s) => { refs.current[i] = s; }} position={[x, y, sd * z]} scale={[0.9, 0.55, 1]} visible={false}>
      <spriteMaterial map={glow()} color="#ff2a1a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </sprite>)}
  </>;
}


/** Headlight beams: soft cones of light that show up in the dark, in fog, rain and snow, plus a real light that paints the road ahead. */
function Beams({ id, sim }: { id: GarageId; sim: RunSim }) {
  const night = useContext(NightCtx);
  const lamps = fleetFiles(id)?.lamps?.front;
  const grp = useRef<THREE.Group>(null), spot = useRef<THREE.SpotLight>(null), tgt = useRef<THREE.Object3D>(null);
  useEffect(() => { if (spot.current && tgt.current) spot.current.target = tgt.current; });
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vU; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vU = clamp((position.y + 12.) / 24., 0., 1.); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; varying float vU; uniform float uA; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float along = pow(vU, 1.7); gl_FragColor = vec4(vec3(1., .93, .78), e * along * uA * .5); }',
  }), []);
  useFrame((_, dt) => {
    const L = atmo.look;
    const dark = Math.max(night.current, 0.55 * L.fog, 0.35 * L.storm, 0.3 * L.rain, 0.25 * L.snow);
    const want = clamp((dark - 0.15) / 0.5, 0, 1) * (sim.finished ? 0.3 : 1);
    mat.uniforms.uA!.value = damp(mat.uniforms.uA!.value as number, want, 5, dt);
    if (grp.current) grp.current.visible = (mat.uniforms.uA!.value as number) > 0.02;
    if (spot.current) spot.current.intensity = (mat.uniforms.uA!.value as number) * 38;
  });
  if (!lamps) return null;
  const x = Math.abs(lamps[0]) - 0.1, y = lamps[1], z = lamps[2];
  return <>
    <group ref={grp} visible={false}>
      {[-1, 1].map((sd) => <mesh key={sd} position={[x + 12, y - 0.05, sd * z]} rotation-z={-Math.PI / 2} material={mat} renderOrder={5}>
        <cylinderGeometry args={[0.12, 2.5, 24, 20, 1, true]} />
      </mesh>)}
    </group>
    <spotLight ref={spot} position={[x, y + 0.2, 0]} angle={0.5} penumbra={0.85} distance={46} decay={1.2} intensity={0} color="#fff1d6" />
    <object3D ref={tgt} position={[x + 20, 0, 0]} />
  </>;
}

/** A soft ring of light under the car and a gold halo when the star magnet is on. */
function Auras({ sim }: { sim: RunSim }) {
  const shield = useRef<THREE.Mesh>(null), magnet = useRef<THREE.Group>(null), ring = useRef<THREE.Mesh>(null);
  const shieldMat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
    uniforms: { uT: { value: 0 }, uA: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uT; uniform float uA; void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.4); float hex = .5 + .5 * sin(vP.x * 9. + uT * 2.) * sin(vP.y * 9. - uT * 1.4) * sin(vP.z * 9.); vec3 c = mix(vec3(.25,.55,1.), vec3(1.,.82,.35), f); gl_FragColor = vec4(c, (f * .85 + hex * .08) * uA); }',
  }), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (shield.current) {
      const on = sim.hasShield;
      shieldMat.uniforms.uA!.value = damp(shieldMat.uniforms.uA!.value as number, on ? 1 : 0, 10, dt);
      shieldMat.uniforms.uT!.value = t;
      shield.current.visible = (shieldMat.uniforms.uA!.value as number) > 0.02;
    }
    if (magnet.current) {
      const on = sim.magnetOn;
      magnet.current.visible = on;
      if (on) { magnet.current.rotation.y = t * 2.4; const k = 1 + Math.sin(t * 6) * 0.04; magnet.current.scale.set(k, 1, k); }
    }
    if (ring.current) ring.current.visible = sim.magnetOn;
  });
  return <>
    <mesh ref={shield} position={[0, 0.65, 0]} scale={[2.9, 1.25, 1.55]} material={shieldMat} visible={false}><sphereGeometry args={[1, 28, 18]} /></mesh>
    <group ref={magnet} position={[0, 0.5, 0]} visible={false}>
      {[2.6, 3.2].map((r, i) => <mesh key={i} rotation-x={-Math.PI / 2} position={[0, i * 0.5, 0]}>
        <torusGeometry args={[r, 0.035, 6, 48]} /><meshBasicMaterial color="#f2c14e" transparent opacity={0.55 - i * 0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>)}
    </group>
    <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} visible={false}>
      <ringGeometry args={[2.2, 2.45, 48]} /><meshBasicMaterial color="#f2c14e" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  </>;
}

/** The player's car. The rules engine says where it is and how it is moving; this only dresses that up: lean, wheel angle, blinkers, lamps. */
export function PlayerCar({ sim, carId, lite, rig }: { sim: RunSim; carId: GarageId; lite: boolean; rig: { current: THREE.Group | null } }) {
  const night = useContext(NightCtx);
  const pos = useRef<THREE.Group>(null), yaw = useRef<THREE.Group>(null), lean = useRef<THREE.Group>(null);
  const signal = useRef<CarSignal>({ left: false, right: false, head: false, reverse: false });
  const wheels = useRef<WheelState>({ steer: 0, dist: 0 });
  const brake = useRef(0);
  const L = useRef({ pitch: 0, roll: 0, bounce: 0, bump: 0, sig: 0, sigT: 0 });
  useEffect(() => { rig.current = pos.current; return () => { rig.current = null; }; }, [rig]);
  useFrame(({ clock }, dt) => {
    const p = pos.current, y = yaw.current, l = lean.current; if (!p || !y || !l) return;
    const l0 = L.current, t = clock.elapsedTime;
    p.position.x = sim.x;
    y.rotation.y = Math.PI / 2 - sim.yaw;
    // the body rolls into a turn and pitches with the throttle and the brake
    const k = 1 - Math.exp(-7 * Math.min(dt, 0.05));
    l0.pitch += (clamp(0.0085 * sim.accel, -0.05, 0.05) * (sim.braking ? 1.4 : 1) - l0.pitch) * k;
    l0.roll += (clamp(sim.steerV * 0.012, -0.06, 0.06) - l0.roll) * k;
    const speedK = Math.min(1, sim.mph / 40);
    const bounce = Math.sin(t * 26) * 0.006 * speedK + Math.sin(t * 11.3) * 0.004 * speedK;
    l.rotation.z = l0.pitch; l.rotation.x = l0.roll;
    l.position.y = bounce;
    wheels.current.steer = damp(wheels.current.steer, clamp(sim.steerV / 6.8, -1, 1) * 0.42, 14, dt);
    wheels.current.dist += sim.mph * MPH_TO_MPS * Math.min(dt, 0.05);
    wheels.current.pitch = l0.pitch; wheels.current.roll = l0.roll;
    // blinkers for lane changes
    if (Math.abs(sim.steerV) > 1.6) { l0.sigT = 0.9; l0.sig = Math.sign(sim.steerV); } else l0.sigT = Math.max(0, l0.sigT - dt);
    signal.current.left = l0.sigT > 0 && l0.sig < 0; signal.current.right = l0.sigT > 0 && l0.sig > 0;
    signal.current.head = true;
    // flicker while invulnerable after a crash
    p.visible = !(sim.time < sim.invulnUntil && Math.floor(t * 14) % 2 === 0);
    const wantBrake = sim.braking && !sim.finished ? 1 : night.current > 0.3 ? 0.35 : 0;
    brake.current = damp(brake.current, wantBrake, 25, dt);
    void atmo;
  });
  return <group ref={pos}>
    <group ref={yaw} rotation-y={Math.PI / 2}>
      <group ref={lean}>
        <Suspense fallback={null}>
          <FleetCar specId={carId} color={SWATCH[carId] ?? '#f2b92a'} plate={PLATE[carId] ?? 'DK00GO'} position={[0, 0, 0]} lite={lite} signal={signal} wheels={wheels} />
        </Suspense>
        <BrakeGlow id={carId} brake={brake} />
        <Beams id={carId} sim={sim} />
      </group>
    </group>
    <Auras sim={sim} />
  </group>;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** A pool of traffic and parked cars. Each slot is a real fleet car (the light copy of the file); the actors loop moves a slot onto each car the rules engine puts on the road. */
export function TrafficPool({ count, slots, playerId }: { count: number; slots: { current: TrafficSlot[] }; playerId: GarageId }) {
  const order = useMemo(() => { const o = SPEC_IDS.filter((s) => s !== playerId); return o.length ? o : SPEC_IDS; }, [playerId]);
  return <>
    {Array.from({ length: count }, (_, i) => {
      const spec = order[i % order.length]! as CastId;
      return <TrafficCar key={i} spec={spec} index={i} slots={slots} />;
    })}
  </>;
}

function TrafficCar({ spec, index, slots }: { spec: CastId; index: number; slots: { current: TrafficSlot[] } }) {
  const g = useRef<THREE.Group>(null);
  const wheels = useRef<WheelState>({ steer: 0, dist: 0 });
  useEffect(() => {
    const s: TrafficSlot = { group: g.current!, wheels, spec, used: false };
    slots.current[index] = s;
    g.current!.visible = false;
    return () => { delete slots.current[index]; };
  }, [index, slots, spec]);
  // Traffic cars do not wear the gold roof sign (that is the player's): find the sign once the car has loaded and hide it. The homepage's own car code is untouched.
  const stripped = useRef(false), tick = useRef(0);
  useFrame(() => {
    if (stripped.current || !g.current || ++tick.current % 15) return;
    g.current.traverse((o) => {
      const m = o as THREE.Mesh, p = (m.geometry as THREE.CylinderGeometry | undefined)?.parameters;
      if (m.isMesh && p && Math.abs((p.radiusTop ?? 0) - 0.085) < 1e-6 && m.parent?.parent && m.parent.parent !== g.current) { m.parent.parent.visible = false; stripped.current = true; }
    });
  });
  return <group ref={g} visible={false}>
    <group rotation-y={Math.PI / 2}>
      <Suspense fallback={null}>
        <FleetCar specId={spec} color={SWATCH[spec] ?? '#888'} plate={PLATE[spec] ?? ''} position={[0, 0, 0]} lite wheels={wheels} />
      </Suspense>
    </group>
  </group>;
}
