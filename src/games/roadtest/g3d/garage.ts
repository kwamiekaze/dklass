/** The cars you can drive in the Road Test Challenge: the same fleet as the homepage. Cosmetic only: every car drives the same, so scores stay fair. */
export type GarageId = 'hero' | 'corolla' | 'elantra' | 'camry' | 'civic' | 'sentra';
export interface GarageCar { id: GarageId; name: string; blurb: string; swatch: string; need: number; plate: string; tag: string }

export const GARAGE: GarageCar[] = [
  { id: 'hero', name: 'Solar Gold', blurb: 'The yellow sports car from the lot.', swatch: '#f2b92a', need: 0, plate: 'DK29OR', tag: 'Guyana yellow' },
  { id: 'corolla', name: 'Ivory Bolt', blurb: 'White, low and fast.', swatch: '#f3f3f0', need: 0, plate: 'DK24CO', tag: 'Grand tourer' },
  { id: 'elantra', name: 'Crimson Rush', blurb: 'The red sports car.', swatch: '#ce1126', need: 0, plate: 'DK26OR', tag: 'Hot hatch red' },
  { id: 'camry', name: 'Midnight Vault', blurb: 'The school\'s black car.', swatch: '#1b1c22', need: 0, plate: 'DK27RR', tag: 'The school car' },
  { id: 'civic', name: 'Emerald GT', blurb: 'Guyana green, track tuned.', swatch: '#009e49', need: 0, plate: 'DK25ML', tag: 'Track tuned' },
  { id: 'sentra', name: 'Jade Runner', blurb: 'The first green sports car.', swatch: '#1fbf7a', need: 0, plate: 'DK28GA', tag: 'The original' },
];

const CAR_KEY = 'dk-rt-car';
const STARS_KEY = 'dk-rt-stars';

export function lifetimeStars(): number {
  try { return Math.max(0, parseInt(localStorage.getItem(STARS_KEY) ?? '0', 10) || 0); } catch { return 0; }
}
export function addLifetimeStars(n: number) {
  if (n <= 0) return;
  try { localStorage.setItem(STARS_KEY, String(lifetimeStars() + n)); } catch { /* ignore */ }
}
/** Every car of the homepage fleet is open from the first run. */
export function isUnlocked(_c: GarageCar, _stars = 0) { return true; }
export function selectedCar(): GarageCar {
  try {
    const id = localStorage.getItem(CAR_KEY);
    const c = GARAGE.find((g) => g.id === id);
    if (c && isUnlocked(c)) return c;
  } catch { /* ignore */ }
  return GARAGE[0]!;
}
export function selectCar(id: GarageId) { try { localStorage.setItem(CAR_KEY, id); } catch { /* ignore */ } }
