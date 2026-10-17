import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { atmo } from '../../../components/nuhome2/world/atmosphere';
import type { RunSim } from './sim';

/**
 * Glow: lamps, signs, neon, the lightning and the gold stars bloom into the air. Only on strong devices; the rest keep the plain render.
 * The strength follows the light: a little by day, a lot at night, a flare at the flash of lightning, and a push at high speed.
 */
export function Bloom({ sim, mix }: { sim: RunSim; mix: { current: number } }) {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const b = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.35, 0.7, 0.92);
    c.addPass(b);
    c.addPass(new OutputPass());
    return { c, b };
  }, [gl, scene, camera]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { composer.c.setPixelRatio(gl.getPixelRatio()); composer.c.setSize(size.width, size.height); composer.b.resolution.set(size.width, size.height); }, [composer, gl, size]);
  useEffect(() => () => { composer.c.dispose(); }, [composer]);
  useFrame(() => {
    const m = mix.current, L = atmo.look;
    composer.b.strength = 0.28 + 0.55 * m + 0.9 * atmo.flash * L.storm + 0.25 * Math.min(1, sim.mph / Math.max(1, sim.maxMph)) * (0.4 + m);
    composer.b.threshold = 0.9 - 0.18 * m;
    composer.c.render();
  }, 1);
  return null;
}
