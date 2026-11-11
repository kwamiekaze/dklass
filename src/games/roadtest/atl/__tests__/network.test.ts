import { beforeEach, describe, expect, it } from 'vitest';
import { allExits, freeLeg, freeLegIds, legTargets } from '../freeroam';
import { TRIPS, guide, loadPassport, passportStats, rankOf, resetPassport, stampExit, touchDay } from '../passport';
import { EXIT } from '../ramps';

const D = (st: { lengthM: number }, at: number) => 40 + at * (st.lengthM - 90);

describe('the Georgia exit network', () => {
  it('knows the real exits of the west and south-west corridors', () => {
    const has = (leg: string, no: string, text: RegExp) => { const e = freeLeg(leg).exits!.find((x) => x.no === no); expect(e, `${leg} exit ${no}`).toBeTruthy(); expect(e!.dests.join(' ')).toMatch(text); return e!; };
    expect(has('i20-w3', '11', /Bremen.*Carrollton/).shields).toEqual([{ t: 'US', n: '27', b: undefined }]);
    has('i20-w2', '24', /Villa Rica/); has('i20-w2', '34', /Bill Arp/); has('i20-w', '44', /Thornton/); has('i20-w3', '5', /Tallapoosa/);
    has('i85-sw3', '18', /LaGrange/); has('i85-sw3', '14', /LaGrange/); has('i85-sw3', '2', /West Point/); has('i85-sw2', '47', /Newnan/); has('i85-sw1', '61', /Fairburn/);
    expect(has('i85-sw2', '41', /Newnan/).shields?.[0]).toEqual({ t: 'US', n: '27', b: 'ALT' });
    expect(allExits().length).toBeGreaterThan(250);
  });
  it('gives every exit room for its own deceleration lane, and every sign its own place', () => {
    for (const id of freeLegIds()) {
      const st = freeLeg(id); if (st.road !== 'interstate') continue;
      const gores = (st.exits ?? []).map((e) => D(st, e.at));
      for (let i = 1; i < gores.length; i++) expect(gores[i]! - gores[i - 1]!, `${id} exits ${i - 1}/${i}`).toBeGreaterThan(EXIT.pre + EXIT.len + 60);
      if (gores.length) { expect(gores[0]!, `${id} first exit`).toBeGreaterThan(900); expect(st.lengthM - gores[gores.length - 1]!, `${id} last exit`).toBeGreaterThan(250); }
      const over = st.guide.filter((g) => !g.post).map((g) => D(st, g.at));
      for (let i = 1; i < over.length; i++) expect(over[i]! - over[i - 1]!, `${id} gantries`).toBeGreaterThanOrEqual(89);
      for (const g of st.guide) expect(1 + (g.also?.length ?? 0)).toBeLessThanOrEqual(3);
    }
  });
  it('joins a road past the exit you came up, with only the exits still ahead', () => {
    const whole = freeLeg('i20-w2'), part = freeLeg('i20-w2@34');
    expect(whole.exits!.map((e) => e.no)).toEqual(['36', '34', '30', '26', '24', '19']);
    expect(part.exits!.map((e) => e.no)).toEqual(['30', '26', '24', '19']);
    expect(part.startRamp).toBe(true);
    expect(freeLeg('i85-ne1@18').exits!.map((e) => e.no)).toEqual(['21', '28']);
    for (const id of freeLegIds()) for (const t of legTargets(freeLeg(id))) for (const u of legTargets(freeLeg(t))) expect(() => freeLeg(u)).not.toThrow();
  });
  it('signs an exit a half mile out when there is room and a quarter mile out when exits are close', () => {
    const rural = freeLeg('i85-sw2').guide.filter((g) => g.tab === 'EXIT 47' || g.also?.some((a) => a.tab === 'EXIT 47'));
    expect(rural.some((g) => g.dist === '1/2 MILE' || g.also?.some((a) => a.dist === '1/2 MILE'))).toBe(true);
    const city = freeLeg('i20-w0').guide.filter((g) => g.tab === 'EXIT 55A');
    expect(city.some((g) => g.dist === '1/4 MILE')).toBe(true);
    expect(freeLeg('i20-w3').guide.some((g) => g.style === 'welcome')).toBe(true);
    expect(freeLeg('i20-w').guide.some((g) => g.style === 'mileage' && g.rows?.[0]?.[0] === 'Douglasville')).toBe(true);
  });
});

describe('road trips and the passport', () => {
  beforeEach(() => resetPassport());
  it('finds a way for every trip, and the first step is something the driver can do', () => {
    for (const t of TRIPS) {
      const g = guide(freeLeg(t.start), t.dest);
      expect(g, t.id).toBeTruthy(); expect(g!.arrived).toBe(false); expect(g!.text.length).toBeGreaterThan(4);
    }
    expect(guide(freeLeg('lagrange'), 'lagrange')!.arrived).toBe(true);
  });
  it('routes Carrollton to LaGrange down US-27 and Atlanta to Carrollton out I-20 West', () => {
    expect(guide(freeLeg('maple'), 'lagrange')!.sub).toMatch(/US-27 South/);
    expect(guide(freeLeg('con-s'), 'maple')!.text).toBe('Take EXIT 247');
    // follow the GPS from the Connector to Carrollton: it must get there
    let st = freeLeg('con-s'), hops = 0;
    while (hops++ < 12) {
      const g = guide(st, 'maple')!; if (g.arrived) break;
      const e = (st.exits ?? []).find((x) => (g.text.startsWith('Take EXIT') && `Take EXIT ${x.no}` === g.text) || (g.text.startsWith('Turn') && x.street === g.sub));
      st = freeLeg(e?.to ?? st.next!);
    }
    expect(st.id).toBe('atl-fr-maple');
  });
  it('stamps an exit once for seeing it and once more for taking it, and keeps a daily streak', () => {
    const p = loadPassport(), e = allExits()[0]!;
    expect(stampExit(p, e, false)?.xp).toBe(10); expect(stampExit(p, e, false)).toBeNull();
    expect(stampExit(p, e, true)?.xp).toBe(30); expect(stampExit(p, e, true)).toBeNull();
    expect(passportStats(p).seen).toBe(1); expect(passportStats(p).taken).toBe(1);
    expect(touchDay(p, '2026-11-10')?.title).toBe('DAILY DRIVE'); expect(touchDay(p, '2026-11-10')).toBeNull();
    expect(touchDay(p, '2026-11-11')?.title).toBe('2 DAY STREAK'); expect(touchDay(p, '2026-11-14')?.title).toBe('DAILY DRIVE');
    expect(rankOf(0).name).toBe('Learner'); expect(rankOf(99999).next).toBeNull();
  });
});
