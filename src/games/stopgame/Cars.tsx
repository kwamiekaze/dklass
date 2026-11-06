import { memo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { FleetCar, type CarSignal, type WheelState } from '../../components/nuhome2/world/Fleet';
import { PLATES } from '../../components/nuhome2/world/cast';
import { CAR_NAME, type Move } from './engine';
import type { Run, Sim } from './sim';

export type Mark = 'ok' | 'bad' | 'answer' | null;
export type Overlay = { ask: boolean; arrows: boolean; order: boolean; marks: Record<string, Mark>; onPick: (id: string) => void };

const ARROW: Record<Move, string> = { straight: '↑', left: '↰', right: '↱' };
const WORD: Record<Move, string> = { straight: 'Straight', left: 'Left', right: 'Right' };

const Body = memo(function Body({ model, lite, signal, wheels }: { model: Run['spec']['model']; lite: boolean; signal: MutableRefObject<CarSignal>; wheels: MutableRefObject<WheelState> }) {
  return <FleetCar specId={model} color="#f2b92a" plate={PLATES[model]} position={[0, 0, 0]} rotationY={0} lite={lite} signal={signal} wheels={wheels} />;
});

/** One car of the street. It reads its pose from the simulation every frame; the labels float on it. */
function CarActor({ run, sim, lite, night, ov, orderOf }: { run: Run; sim: Sim; lite: boolean; night: boolean; ov: MutableRefObject<Overlay>; orderOf: number }) {
  const g = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const signal = useRef<CarSignal>({ left: run.spec.move === 'left', right: run.spec.move === 'right', head: true, reverse: false });
  const wheels = useRef<WheelState>({ steer: 0, dist: 0, pitch: 0, roll: 0 });
  const lean = useRef({ pitch: 0, roll: 0 });
  useFrame((_, dt) => {
    const m = g.current; if (!m) return;
    m.position.set(run.x, 0, run.z); m.rotation.y = run.yaw;
    const w = wheels.current; w.steer = run.steer; w.dist = run.dist;
    // blinker on until the turn is done
    const turning = run.spec.move !== 'straight' && !(run.goTime !== null && run.s > run.path.leave + 1);
    signal.current.left = turning && run.spec.move === 'left'; signal.current.right = turning && run.spec.move === 'right';
    signal.current.head = true;
    const k = 1 - Math.exp(-6 * Math.min(dt, .05)), L = lean.current;
    L.pitch += (Math.max(-.035, Math.min(.035, .011 * run.accel)) - L.pitch) * k;
    w.pitch = L.pitch; w.roll = 0;
    if (body.current) body.current.rotation.z = L.pitch;
  });
  const spec = run.spec;
  return <group ref={g} position={[run.x, 0, run.z]} rotation-y={run.yaw}>
    <group ref={body}><Body model={spec.model} lite={lite} signal={signal} wheels={wheels} /></group>
    <Labels run={run} ov={ov} orderOf={orderOf} night={night} />
  </group>;
}

/** The labels that float over a car. They read the overlay settings from a ref, so a tap or a toggle never rebuilds the street. */
function Labels({ run, ov, orderOf, night }: { run: Run; ov: MutableRefObject<Overlay>; orderOf: number; night: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const spec = run.spec;
  // the DOM is refreshed by the parent's re-render through `key` below; this component only lays the pieces out
  void night;
  return <Html center position={[0, 1.6, 0]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
    <div ref={el} className="sg-label" data-car={spec.id}>
      <LabelBody run={run} ov={ov} orderOf={orderOf} />
    </div>
  </Html>;
}

function LabelBody({ run, ov, orderOf }: { run: Run; ov: MutableRefObject<Overlay>; orderOf: number }) {
  const o = ov.current, spec = run.spec, mark = o.marks[spec.id] ?? null, gone = run.goTime !== null && mark === null;
  return <>
    {spec.you && <span className="sg-you">YOU</span>}
    {o.arrows && !gone && <span className="sg-arrow" title={WORD[spec.move]}><b>{ARROW[spec.move]}</b></span>}
    {o.order && spec.rank >= 0 && <span className="sg-order">{orderOf}</span>}
    {o.order && spec.rank < 0 && <span className="sg-order sg-free">no stop</span>}
    {o.ask && !gone && <button className="sg-ring" aria-label={`${CAR_NAME[spec.model]} car`} onClick={() => o.onPick(spec.id)} style={{ pointerEvents: 'auto' }}><i /></button>}
    {mark && <span className={`sg-mark sg-${mark}`}>{mark === 'bad' ? '✕' : '✓'}</span>}
  </>;
}

/** Every car of the scenario. `tick` changes whenever the labels should be redrawn. */
export const Cars = memo(function Cars({ sim, lite, night, ov, tick }: { sim: Sim; lite: boolean; night: boolean; ov: MutableRefObject<Overlay>; tick: number }) {
  // order of arrival among the stopped cars, 1 for the first rank
  const ranks = [...new Set(sim.runs.filter(r => r.spec.rank >= 0).map(r => r.spec.rank))].sort((a, b) => a - b);
  void tick;
  return <>{sim.runs.map(r => <CarActor key={`${sim.scenario?.id}-${r.spec.id}`} run={r} sim={sim} lite={lite} night={night} ov={ov} orderOf={ranks.indexOf(r.spec.rank) + 1} />)}</>;
});
