/** Carrollton Rush: the other racers, drawn as their own cars with a name tag. They are ghosts to the rules engine: no crashes between racers, only the race. */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FleetCar, type CarSignal, type WheelState } from '../../../../components/nuhome2/world/Fleet';
import { GARAGE } from '../../g3d/garage';
import { damp } from '../../g3d/util';
import { race, STALE_MS, standings, type Racer } from './store';

const SWATCH: Record<string, string> = Object.fromEntries(GARAGE.map((g) => [g.id, g.swatch]));

/** a name tag that always faces the camera and keeps the same size on screen */
function tagTexture(name: string, pos: number, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 128);
  const r = 48, x = 8, y = 20, w = 496, h = 88;
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  g.fillStyle = 'rgba(10,13,18,0.86)'; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(242,193,78,0.9)'; g.stroke();
  // position badge in the car's own colour
  g.beginPath(); g.arc(x + 46, y + h / 2, 30, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 4; g.strokeStyle = '#0b0e12'; g.stroke();
  g.fillStyle = ['#f3f3f0', '#f2b92a', '#1fbf7a'].includes(color) ? '#0b0e12' : '#ffffff';
  g.font = 'bold 36px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(pos > 0 ? String(pos) : '·', x + 46, y + h / 2 + 2);
  g.fillStyle = '#ffffff'; g.font = 'bold 44px Inter, system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText(name.toUpperCase(), x + 92, y + h / 2 + 3, w - 110);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function RivalCar({ r, lite }: { r: Racer; lite: boolean }) {
  const pos = useRef<THREE.Group>(null), yaw = useRef<THREE.Group>(null), tag = useRef<THREE.Sprite>(null);
  const signal = useRef<CarSignal>({ left: false, right: false, head: true, reverse: false });
  const wheels = useRef<WheelState>({ steer: 0, dist: 0 });
  const [place, setPlace] = useState(0);
  const color = SWATCH[r.car] ?? '#f2b92a';
  const tex = useMemo(() => tagTexture(r.name, place, color), [r.name, place, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const lastSteer = useRef(0);
  useFrame(({ camera, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05), p = pos.current, y = yaw.current; if (!p || !y) return;
    const age = Math.min(0.6, (performance.now() - r.seen) / 1000);
    // where the car should be now: the last report carried forward at its speed, then eased towards
    const tx = r.x + Math.sin(r.h) * r.v * age, tz = r.z + Math.cos(r.h) * r.v * age;
    if (Math.hypot(tx - r.rx, tz - r.rz) > 25) { r.rx = tx; r.rz = tz; r.rh = r.h; }
    r.rx = damp(r.rx, tx, 9, dt); r.rz = damp(r.rz, tz, 9, dt);
    let dh = r.h - r.rh; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); r.rh += dh * (1 - Math.exp(-9 * dt));
    p.position.set(r.rx, 0, r.rz); y.rotation.y = r.rh - Math.PI / 2;
    const vis = performance.now() - r.seen < STALE_MS && r.out !== 'LEFT';
    p.visible = vis;
    wheels.current.dist += r.v * dt;
    lastSteer.current = damp(lastSteer.current, Math.max(-0.42, Math.min(0.42, dh * 3)), 8, dt); wheels.current.steer = lastSteer.current;
    signal.current.left = r.sig === -1; signal.current.right = r.sig === 1; signal.current.head = true;
    const t = tag.current;
    if (t) {
      const d = camera.position.distanceTo(p.position);
      t.visible = vis && d < 420;
      mat.opacity = d < 12 ? 0.55 : Math.max(0.35, 1 - (d - 160) / 260);
      t.position.y = 2.25 + Math.sin(clock.elapsedTime * 2 + r.slot) * 0.04;
    }
    // the place on the tag changes a few times a race, not every frame
    if (Math.floor(clock.elapsedTime * 2) % 2 === 0) { const i = standings().findIndex((s) => s.id === r.id) + 1; if (i !== place) setPlace(i); }
  });
  return <group ref={pos}>
    <group ref={yaw} rotation-y={Math.PI / 2}>
      <Suspense fallback={null}><FleetCar specId={r.car} color={color} plate={r.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7) || 'RUSH'} position={[0, 0, 0]} lite={lite} signal={signal} wheels={wheels} /></Suspense>
    </group>
    <sprite ref={tag} material={mat} scale={[0.24, 0.06, 1]} position={[0, 2.25, 0]} renderOrder={20} />
  </group>;
}

export function Rivals({ lite }: { lite: boolean }) {
  const [list, setList] = useState<Racer[]>(() => [...race.racers.values()].filter((r) => !r.me));
  useEffect(() => { const id = window.setInterval(() => { const l = [...race.racers.values()].filter((r) => !r.me); if (l.length !== list.length) setList(l); }, 1000); return () => window.clearInterval(id); }, [list.length]);
  return <>{list.map((r) => <RivalCar key={r.id} r={r} lite={lite} />)}</>;
}
