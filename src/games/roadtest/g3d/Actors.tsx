import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NightCtx } from '../../../components/nuhome2/world/theme';
import { AHEAD } from './World';
import { K_D, MPH_TO_MPS, type Ob, type RunSim } from './sim';
import { PlayerCar, TrafficPool, type TrafficSlot } from './cars';
import { makeKit } from './props';
import type { GarageId } from './garage';
import { lerp } from './util';

/** Hands every nearby obstacle of the rules engine to the right pooled object, every frame. */
const TRAFFIC_SLOTS = 9;

export function Actors({ sim, carId, lite, playerRig }: { sim: RunSim; carId: GarageId; lite: boolean; playerRig: { current: THREE.Group | null } }) {
  const night = useContext(NightCtx);
  const world = useRef<THREE.Group>(null);
  const kit = useMemo(() => makeKit(), []);
  const slots = useRef<TrafficSlot[]>([]);
  const lo = useRef(0);
  useEffect(() => { world.current?.add(kit.root); return () => { world.current?.remove(kit.root); }; }, [kit]);

  useFrame(({ clock }, rawDt) => {
    const g = world.current; if (!g) return;
    const dt = Math.min(rawDt, 0.05), T = sim.traveled, now = sim.time, t = clock.elapsedTime;
    g.position.z = T;
    kit.setNight(night.current);
    kit.begin();
    const list = sim.obstacles;
    // first obstacle still within sight behind the car (the list is nearly sorted by distance; traffic drifts only slightly)
    let i = Math.min(lo.current, list.length);
    while (i > 0 && list[i - 1]!.d > T - 30) i--;
    while (i < list.length && list[i]!.d < T - 30) i++;
    lo.current = i;
    for (const s of slots.current) if (s) s.used = false;
    let carNext = 0;
    const far = T + AHEAD;
    for (let k = i; k < list.length; k++) {
      const o = list[k]!;
      if (o.d > far) { if (o.d - T > 400) break; continue; }
      switch (o.type) {
        case 'cone': kit.cone(o, t); break;
        case 'star': kit.star(o, t, now); break;
        case 'magnet': case 'shieldPickup': kit.pickup(o, t, now); break;
        case 'stopSign': kit.stopSign(o); break;
        case 'trafficLight': kit.light(o); break;
        case 'checkpoint': kit.gate('checkpoint', o.d, !!o.resolved); break;
        case 'pedestrian': kit.walker(o, t); break;
        case 'dog': kit.dog(o, t); break;
        case 'parkedCar': case 'traffic': {
          // a free slot, preferring the look this car was dealt
          while (carNext < slots.current.length && (!slots.current[carNext] || slots.current[carNext]!.used)) carNext++;
          const s = slots.current[carNext]; if (!s) break;
          s.used = true; carNext++;
          s.group.visible = true;
          let x = o.x, y = 0, rz = 0, ry = 0;
          if (o.fly) { const f = o.fly; y = Math.max(0, 1.8 * f.t - 4 * f.t * f.t) * 0.5; ry = Math.min(2.2, f.t * f.spin * 0.45) * Math.sign(f.vx || 1); rz = Math.min(0.25, f.t * 0.4) * Math.sign(f.vx || 1); }
          s.group.position.set(x, y, -o.d); s.group.rotation.set(0, ry, rz);
          const v = o.type === 'traffic' ? (o.mph ?? 0) * MPH_TO_MPS : 0;
          s.wheels.current.dist += v * dt;
          break;
        }
      }
    }
    for (const s of slots.current) if (s && !s.used) s.group.visible = false;
    if (!sim.level.endless) kit.gate('finish', sim.effectiveLength + 2.4, false);
    else if (sim.pbBestDistance > 0) kit.gate('best', sim.pbBestDistance * K_D, sim.travelPx > sim.pbBestDistance);
    kit.end();
    void lerp;
  });

  return <group ref={world}>
    <TrafficPool count={TRAFFIC_SLOTS} slots={slots} playerId={carId} />
  </group>;
}

export function Player({ sim, carId, lite, rig }: { sim: RunSim; carId: GarageId; lite: boolean; rig: { current: THREE.Group | null } }) {
  return <PlayerCar sim={sim} carId={carId} lite={lite} rig={rig} />;
}

export type { Ob };
