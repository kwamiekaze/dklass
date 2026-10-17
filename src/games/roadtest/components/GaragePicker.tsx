import { useState } from 'react';
import { GARAGE, lifetimeStars, selectCar, selectedCar, type GarageCar } from '../g3d/garage';
import { TIME_OPTIONS, WEATHER_OPTIONS, loadConditions, saveConditions, type Conditions } from '../g3d/conditions';
import { sound } from '../sound';

const IMG = (id: string) => `${import.meta.env.BASE_URL}rt-cars/${id}.jpg`;

/** "Your car": the whole homepage fleet, every car open from the first drive. Cosmetic only, so scores stay fair on the leaderboard. */
export function GaragePicker() {
  const [cur, setCur] = useState(() => selectedCar().id);
  const stars = lifetimeStars();
  const pick = (c: GarageCar) => { sound.init(); sound.uiTick(); selectCar(c.id); setCur(c.id); };
  return (
    <section className="garage" aria-label="Choose your car">
      <div className="garage-head">
        <strong>Pick your car</strong>
        <span className="garage-stars">★ {stars.toLocaleString()} collected</span>
      </div>
      <div className="garage-row" role="radiogroup">
        {GARAGE.map((c) => (
          <button key={c.id} role="radio" aria-checked={cur === c.id} className={`garage-car${cur === c.id ? ' active' : ''}`} onClick={() => pick(c)} title={c.blurb}>
            <span className="garage-pic" style={{ backgroundImage: `url(${IMG(c.id)})` }}><i className="garage-swatch" style={{ background: c.swatch }} /></span>
            <span className="garage-name">{c.name}</span>
            <small>{cur === c.id ? '✓ Driving' : c.tag}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function Chips<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string; icon: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="cond-block">
      <span className="cond-label">{label}</span>
      <div className="cond-row" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} className={`cond-chip${value === o.id ? ' active' : ''}`} onClick={() => onPick(o.id)}>
            <span aria-hidden="true">{o.icon}</span>{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Weather and time of day for the drive. Cosmetic: the rules never change. */
export function ConditionsPicker() {
  const [c, setC] = useState<Conditions>(() => loadConditions());
  const set = (p: Partial<Conditions>) => { sound.init(); sound.uiTick(); const n = { ...c, ...p }; setC(n); saveConditions(n); };
  return (
    <section className="conditions" aria-label="Choose the conditions">
      <div className="garage-head"><strong>Conditions</strong><span className="garage-stars">your drive, your sky</span></div>
      <Chips label="Weather" value={c.weather} options={WEATHER_OPTIONS} onPick={(v) => set({ weather: v })} />
      <Chips label="Time of day" value={c.time} options={TIME_OPTIONS} onPick={(v) => set({ time: v })} />
    </section>
  );
}
