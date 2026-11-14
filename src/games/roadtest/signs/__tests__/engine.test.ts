import { describe, expect, it } from 'vitest';
import { SIGNS, SIGN_BY_ID } from '../signs';
import { RULES, RUSH, TEST_LEN, answer, deck, multFor, newRush, questionFor, rng, rushStars, timeFor } from '../engine';

describe('sign rush questions', () => {
  it('has a full bank: signs with unique ids, rules with one right answer and three different wrong ones', () => {
    expect(SIGNS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(SIGNS.map((s) => s.id)).size).toBe(SIGNS.length);
    for (const s of SIGNS) { expect(s.fact.length).toBeGreaterThan(20); for (const m of s.mix ?? []) expect(SIGN_BY_ID[m], `${s.id} mixes with ${m}`).toBeTruthy(); }
    expect(RULES.length).toBeGreaterThanOrEqual(20);
    for (const r of RULES) expect(new Set([r.a, ...r.wrong]).size).toBe(4);
  });
  it('never offers two answers that mean the same thing, and always includes the right one once', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      for (const card of deck('rush', seed)) {
        const q = questionFor(card, 'rush', r);
        expect(q.options).toHaveLength(4);
        expect(q.options.filter((o) => o.id === q.answer)).toHaveLength(1);
        const labels = q.options.map((o) => o.text ?? SIGN_BY_ID[o.signId!]!.name);
        expect(new Set(labels).size, `${card}: ${labels.join(' | ')}`).toBe(4);
      }
    }
  });
  it('deals tests of 20 without repeats: signs for the signs test, rules, signals and lines for the rules test', () => {
    const a = deck('signsTest', 3), b = deck('rulesTest', 3);
    expect(a).toHaveLength(TEST_LEN); expect(new Set(a).size).toBe(TEST_LEN); expect(a.every((c) => c.startsWith('s:'))).toBe(true);
    expect(a.some((c) => ['signal', 'marking'].includes(SIGN_BY_ID[c.slice(2)]!.cat))).toBe(false);
    expect(b).toHaveLength(TEST_LEN); expect(new Set(b).size).toBe(TEST_LEN); expect(b.some((c) => c.startsWith('r:'))).toBe(true);
    expect(questionFor(a[0]!, 'signsTest', rng(1)).kind).toBe('meaning');
  });
});

describe('sign rush scoring', () => {
  it('pays 100 times the multiplier plus the speed bonus', () => {
    const s = newRush();
    expect(answer(s, true, 1, 'a').points).toBe(150);        // x1, full speed bonus
    expect(answer(s, true, 0, 'b').points).toBe(100);        // x1, no speed bonus
    expect(answer(s, true, 0.5, 'c').points).toBe(125);
    expect(answer(s, true, 0, 'd')).toMatchObject({ mult: 2, points: 200 });   // three in a row lifts the fourth
    expect(s.score).toBe(575); expect(s.streak).toBe(4);
    expect(multFor(0)).toBe(1); expect(multFor(3)).toBe(2); expect(multFor(12)).toBe(RUSH.maxMult); expect(multFor(99)).toBe(RUSH.maxMult);
  });
  it('a wrong answer costs a strike and the streak, never points, and three ends the run', () => {
    const s = newRush(); for (let i = 0; i < 5; i++) answer(s, true, 0, `k${i}`);
    const before = s.score;
    expect(answer(s, false, 0.9, 'x')).toMatchObject({ points: 0, over: false });
    expect(s.score).toBe(before); expect(s.streak).toBe(0); expect(s.strikes).toBe(1); expect(s.missed).toEqual(['x']);
    expect(answer(s, false, 0, 'y').over).toBe(false);
    expect(answer(s, false, 0, 'z').over).toBe(true);
  });
  it('gives a strike back for ten in a row, and never holds more than three', () => {
    const s = newRush(); answer(s, false, 0, 'x');
    let restored = 0; for (let i = 0; i < 10; i++) if (answer(s, true, 0, `k${i}`).restored) restored++;
    expect(restored).toBe(1); expect(s.strikes).toBe(0);
    for (let i = 0; i < 10; i++) expect(answer(s, true, 0, `m${i}`).restored).toBe(false);
    expect(s.strikes).toBe(0);
  });
  it('shortens the clock as you go, down to a floor', () => {
    expect(timeFor(0)).toBe(8); expect(timeFor(4)).toBe(8); expect(timeFor(5)).toBe(7.75); expect(timeFor(1000)).toBe(RUSH.tMin);
    expect(rushStars(newRush())).toBe(0);
  });
});
