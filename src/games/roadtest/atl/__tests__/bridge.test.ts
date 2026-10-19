import { describe, expect, it } from 'vitest';
import { bridgeDuck, bridgeField, bridgeOffset, DECK_HALF } from '../Overpasses';

describe('camera under bridges', () => {
  bridgeField.has = (c) => c === 1;
  const d = bridgeOffset(1);
  it('stays up in open road', () => { expect(bridgeDuck(d - 200, 13.6)).toBe(0); expect(bridgeDuck(d + 200, 13.6)).toBe(0); });
  it('is fully down while the car or the camera is under the deck', () => {
    for (const t of [d - DECK_HALF - 3, d - 3, d, d + DECK_HALF, d + DECK_HALF + 10]) expect(bridgeDuck(t, 13.6), String(t)).toBeGreaterThan(0.97);
  });
  it('eases in before the deck and out after it, never jumping', () => {
    let prev = bridgeDuck(d - 80, 13.6);
    for (let t = d - 80; t < d + 80; t += 0.5) { const w = bridgeDuck(t, 13.6); expect(Math.abs(w - prev)).toBeLessThan(0.08); prev = w; }
  });
  it('is back in the open once the camera has cleared the far edge', () => { expect(bridgeDuck(d + DECK_HALF + 13.6 + 20, 13.6)).toBe(0); });
});
