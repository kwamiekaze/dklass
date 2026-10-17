import { useState } from 'react';
import { GARAGE, isUnlocked, lifetimeStars, selectCar, selectedCar, type GarageCar } from '../g3d/garage';
import { sound } from '../sound';

/**
 * "Your car": the homepage fleet, as a row of chips on the menu. Cars past the first three unlock with the gold stars you collect
 * across all your runs. Cosmetic only: every car drives the same, so scores stay fair on the leaderboard.
 */
export function GaragePicker() {
  const [cur, setCur] = useState(() => selectedCar().id);
  const stars = lifetimeStars();
  const pick = (c: GarageCar) => {
    sound.init(); sound.uiTick();
    if (!isUnlocked(c, stars)) return;
    selectCar(c.id); setCur(c.id);
  };
  const next = GARAGE.filter((c) => !isUnlocked(c, stars)).sort((a, b) => a.need - b.need)[0];
  return (
    <section className="garage" aria-label="Choose your car">
      <div className="garage-head">
        <strong>Your car</strong>
        <span className="garage-stars">★ {stars.toLocaleString()}</span>
      </div>
      <div className="garage-row" role="radiogroup">
        {GARAGE.map((c) => {
          const open = isUnlocked(c, stars);
          return (
            <button
              key={c.id}
              role="radio"
              aria-checked={cur === c.id}
              className={`garage-car${cur === c.id ? ' active' : ''}${open ? '' : ' locked'}`}
              onClick={() => pick(c)}
              title={open ? c.blurb : `Collect ${c.need} gold stars to unlock`}
            >
              <i className="garage-swatch" style={{ background: c.swatch }} />
              <span className="garage-name">{c.name}</span>
              <small>{open ? (cur === c.id ? 'Driving' : 'Select') : `🔒 ${c.need} ★`}</small>
            </button>
          );
        })}
      </div>
      {next && <p className="garage-next">Next car: <b>{next.name}</b> at {next.need} ★ ({Math.max(0, next.need - stars)} to go)</p>}
    </section>
  );
}
