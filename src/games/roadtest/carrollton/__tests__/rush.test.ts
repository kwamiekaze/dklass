import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { cleanCode, cleanName, newCode } from '../rush/net';
import { applyState, finalTime, race, resetRace, standings, PENALTY } from '../rush/store';

const roster = [
  { id: 'b', name: 'Jay', car: 'elantra' as const, joinedAt: 20 },
  { id: 'a', name: 'Quamie', car: 'hero' as const, joinedAt: 10 },
  { id: 'c', name: 'Mia', car: 'civic' as const, joinedAt: 30 },
];
const st = (id: string, o: Partial<{ trip: number; pen: number; done: number; out: string }>) =>
  applyState({ t: 'st', id, x: 0, z: 0, h: 0, v: 0, sig: 0, trip: 0, pen: 0, faults: 0, strikes: 0, score: 0, done: 0, out: '', ...o });

describe('Carrollton Rush', () => {
  it('room codes and names are cleaned', () => {
    expect(cleanCode('ab-c1d')).toBe('ABCD');
    expect(cleanCode('xyz9q')).toBe('XYZ9');
    expect(newCode()).toMatch(/^[A-Z2-9]{4}$/);
    expect(cleanName('  <b>Quamie</b>  the great driver ')).toBe('bQuamie/b the');
  });

  it('grid slots follow the order people joined', () => {
    resetRace('b', roster, 3);
    expect([...race.racers.values()].map((r) => [r.id, r.slot])).toEqual([['a', 0], ['b', 1], ['c', 2]]);
    expect(race.racers.get('b')!.me).toBe(true);
  });

  it('penalties decide a close race: the cleaner driver beats the faster one', () => {
    resetRace('b', roster, 3);
    st('a', { trip: 3, done: 100, pen: PENALTY.strike! });           // fast but ran a red light: 120
    const me = race.racers.get('b')!; me.trip = 3; me.done = 112; me.pen = PENALTY.minor!;  // slower, one minor fault: 115
    st('c', { trip: 1 });
    expect(finalTime(me)).toBe(115);
    expect(standings().map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('drivers still racing rank by trips done, and anyone out of the race comes last', () => {
    resetRace('b', roster, 3);
    st('a', { trip: 1, out: 'SUSPENDED' });
    st('c', { trip: 2 });
    race.racers.get('b')!.trip = 1;
    expect(standings().map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('my own state is never overwritten by a message that claims to be me', () => {
    resetRace('b', roster, 3);
    st('b', { trip: 3, done: 1 });
    expect(race.racers.get('b')!.done).toBe(0);
  });
});
