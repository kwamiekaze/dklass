// Wheel to ground check: every car, every drive (the opening drive, then each park drive from the stall, the box, the bay and the line), 60 frames a second.
// The body leans (pitch and roll, eased exactly as IntroCar.tsx does it) about its middle; Fleet.tsx then lifts the car by the drop of its lowest tyre.
// For each wheel contact patch this prints the lowest height above the road (the road is level), WITHOUT and WITH that lift. The car rides LIFT (5 cm) above the road at rest.
// run: npx tsx scripts/check-wheels.mjs
import { parkTotal, parkCarAt, setParkStall, setParkMode } from '../src/components/nuhome2/world/park.ts';
import { STALLS } from '../src/components/nuhome2/world/cast.ts';
import { setStall } from '../src/components/nuhome2/world/intro.ts';
const LIFT = .05;
// wheel centres (x along the nose, as the car drives; the model's own axle table, signs resolved so + is the nose) and the half track
const AX = { hero: [1.35, -1.41], camry: [1.27, -1.53], corolla: [1.49, -1.46], civic: [1.59, -1.37], elantra: [1.33, -1.49], sentra: [1.51, -1.47] };
const HALF_TRACK = .86;
const modes = ['parallel', 'bayFront', 'bayBox', 'turn', 'back', 'exit', 'enterStall'];
let fail = 0;
for (const [id, st] of Object.entries(STALLS)) {
  const ax = AX[id], wheels = [[ax[0], HALF_TRACK], [ax[0], -HALF_TRACK], [ax[1], HALF_TRACK], [ax[1], -HALF_TRACK]];
  let worstBefore = 9, worstAfter = 9, where = '';
  for (const mode of modes) {
    setParkStall(st); setStall(st);
    try { setParkMode(mode); } catch { continue; }
    const T = parkTotal(); let pitch = 0, roll = 0;
    for (let t = 0; t <= T; t += 1 / 60) {
      const c = parkCarAt(t), k = 1 - Math.exp(-6 / 60);
      pitch += (Math.max(-.035, Math.min(.035, .011 * c.accel)) - pitch) * k; roll += (Math.max(-.03, Math.min(.03, .0045 * c.lat)) - roll) * k;
      let drop = 0, low = 9;
      for (const [x, z] of wheels) drop = Math.max(drop, -(x * Math.sin(pitch) - z * Math.sin(roll)));
      for (const [x, z] of wheels) { const h = LIFT + (x * Math.sin(pitch) - z * Math.sin(roll)); low = Math.min(low, h); }
      const before = low, after = low + drop;
      if (before < worstBefore) { worstBefore = before; where = `${mode} t=${t.toFixed(1)}`; }
      worstAfter = Math.min(worstAfter, after);
    }
  }
  const ok = worstAfter >= LIFT - 1e-6; if (!ok) fail++;
  console.log(`${id.padEnd(8)} lowest tyre above the road: without the seat ${(worstBefore * 100).toFixed(1)} cm (${where}), with it ${(worstAfter * 100).toFixed(1)} cm  ${ok ? 'ok' : 'FAIL'}`);
}
console.log(fail ? `${fail} car(s) fail` : 'all wheels stay on or above the road');
process.exit(fail ? 1 : 0);
