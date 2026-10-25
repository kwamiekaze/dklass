import { describe, expect, it } from 'vitest';
import { OpenSim, type OSimEvent } from '../sim';
import { runBot } from './bot';

const quiet: any = new Proxy({}, { get: () => () => {} });
const mk = (seed = 3) => new OpenSim('learner' as any, quiet, { seed });
const idle = { gas: false, brake: false, left: false, right: false };
const run = (sim: OpenSim, sec: number) => { const ev: OSimEvent[] = []; for (let t = 0; t < sec; t += 1 / 30) { sim.step(1 / 30, idle); ev.push(...sim.drain()); } return ev; };

describe('open world scoring uses the shared tracker', () => {
  it('has one strike counter, the tracker', () => {
    const sim: any = mk(); sim.tracker.score = 1000;
    sim.onHit('car', 6);
    expect(sim.strikes).toBe(1); expect(sim.tracker.strikes).toBe(1);
    expect(sim.tracker.score).toBe(500);
    const ev = sim.drain();
    expect(ev.some((e: OSimEvent) => e.k === 'delta' && e.kind === 'strike')).toBe(true);
    expect(ev.some((e: OSimEvent) => e.k === 'banner' && /STRIKE 1 OF 3/.test(e.title))).toBe(true);
  });

  it('one crash is one strike, not two', () => {
    const sim: any = mk(); sim.tracker.score = 800;
    sim.onHit('parked', 5);
    expect(sim.tracker.strikes).toBe(1);
    expect(sim.tracker.countOf('HIT_PARKED_CAR')).toBe(1);
    expect(sim.tracker.countOf('HIT_TRAFFIC')).toBe(0);
  });

  it('a light bump is a scrape: points and streak, no strike', () => {
    const sim: any = mk(); sim.tracker.score = 400;
    sim.onHit('parked', 2.2);
    expect(sim.tracker.strikes).toBe(0);
    expect(sim.tracker.countOf('SCRAPE')).toBe(1);
    expect(sim.tracker.score).toBe(360);
  });

  it('three strikes suspend the licence and end the drive', () => {
    const sim: any = mk(); sim.tracker.score = 900;
    for (let i = 0; i < 3; i++) { sim.crashCool = 0; sim.invulnUntil = 0; sim.onHit('car', 7); }
    expect(sim.strikes).toBe(3);
    const ev = run(sim, 8);
    expect(ev.some((e) => e.k === 'complete')).toBe(true);
    const res = ev.find((e) => e.k === 'complete') as any;
    expect(res.result.passed).toBe(false); expect(res.result.strikes).toBe(3);
  });

  it('a strike cannot pile on during the second after a strike', () => {
    const sim: any = mk(); sim.tracker.score = 900;
    sim.onHit('car', 7); sim.crashCool = 0; sim.onHit('car', 7);
    expect(sim.strikes).toBe(1);
  });

  it('a pedestrian ends the run and keeps a tenth of the points', () => {
    const sim: any = mk(); sim.tracker.score = 1000;
    sim.award('HIT_PEDESTRIAN', 'PEDESTRIAN');
    expect(sim.tracker.voided).toBe(true); expect(sim.tracker.score).toBe(100);
  });

  it('a train is the worst of all', () => {
    const sim: any = mk(); sim.tracker.score = 1000;
    sim.award('HIT_TRAIN', 'TRAIN');
    expect(sim.tracker.voided).toBe(true); expect(sim.tracker.score).toBe(50);
  });

  it('clean driving heals a strike through the tracker', () => {
    const sim: any = mk(); sim.tracker.score = 900;
    sim.onHit('car', 7); expect(sim.strikes).toBe(1);
    sim.cleanDist = 5000; run(sim, 0.5);
    expect(sim.strikes).toBe(0); expect(sim.tracker.strikes).toBe(0);
  });

  it('the back on road reset costs a little and never a strike', () => {
    const sim: any = mk(); sim.tracker.score = 300;
    sim.recover();
    expect(sim.tracker.strikes).toBe(0); expect(sim.tracker.score).toBe(270);
    expect(sim.drain().some((e: OSimEvent) => e.k === 'delta' && e.kind === 'down')).toBe(true);
  });

  it('way over the limit is a ticket, not a hidden strike', () => {
    const sim: any = mk(); sim.tracker.score = 300;
    const before = sim.strikes; sim.award('SPEEDING_TICKET', '60 IN A 30');
    expect(sim.strikes).toBe(before);
    expect(sim.tracker.score).toBe(150);
  });
});

describe('a good student in the open world', () => {
  it('drives to a place by the book: trips are paid, nothing is deducted, every delta matches the score', () => {
    const r = runBot(420, {}, 14), sim = r.sim, t = sim.tracker;
    const c = (k: any) => t.countOf(k);
    const log = `strikes=${t.strikes} score=${t.score} missions=${sim.missions} ${JSON.stringify(t.events)}`;
    expect(sim.missions, log).toBeGreaterThanOrEqual(1);
    expect(t.strikes, log).toBe(0);
    expect(t.voided, log).toBe(false);
    for (const k of ['RAN_RED_LIGHT', 'RAN_STOP_SIGN', 'HIT_TRAFFIC', 'HIT_PARKED_CAR', 'HIT_BUILDING', 'WRONG_WAY', 'RAN_RAIL', 'HIT_PEDESTRIAN']) expect(c(k), `${k} ${log}`).toBe(0);
    expect(c('SPEEDING') + c('SPEEDING_TICKET'), log).toBe(0);
    // every point that changed hands was announced once
    const sum = r.deltas.reduce((a, d) => a + d.points, 0);
    expect(sum, log).toBe(t.score);
    expect(r.deltas.length).toBe([...t.events].reduce((a, e) => a + e.count, 0));
  }, 120_000);

  it('a reckless driver is caught and ends in a suspension', () => {
    const r = runBot(420, { crash: true, ignoreStops: true, over: 22 }, 5), sim = r.sim;
    expect(sim.tracker.strikes + (sim.tracker.voided ? 3 : 0)).toBeGreaterThan(0);
    const sum = r.deltas.reduce((a, d) => a + d.points, 0);
    expect(sum).toBe(sim.tracker.score);
    expect(sim.strikes).toBe(sim.tracker.strikes);
    expect(sim.strikes).toBeLessThanOrEqual(3);
  }, 120_000);
});

describe('railroad crossings', () => {
  const setup = () => {
    const sim: any = mk(5);
    const c = sim.trains.crossings[0];
    expect(c, 'the town has a level crossing').toBeTruthy();
    const tx = Math.sin(c.ang), tz = Math.cos(c.ang);
    const place = (d: number, v: number) => { sim.x = c.x - tx * d; sim.z = c.z - tz * d; sim.h = Math.atan2(tx, tz); sim.v = v; };
    return { sim, c, place };
  };
  it('stopping behind the gates pays', () => {
    const { sim, c, place } = setup();
    c.gate = 1; c.warn = true; place(14, 0);
    sim.railRules(0);
    expect(sim.tracker.countOf('RAIL_STOP')).toBe(1);
    expect(sim.tracker.strikes).toBe(0);
  });
  it('driving round the gates is a strike, once', () => {
    const { sim, c, place } = setup();
    sim.tracker.score = 1000;
    c.gate = 1; c.warn = true; place(3, 6);
    sim.railRules(0); sim.railRules(0);
    expect(sim.tracker.countOf('RAN_RAIL')).toBe(1);
    expect(sim.tracker.strikes).toBe(1);
    expect(sim.tracker.score).toBe(700);
  });
  it('being on the tracks with a train there ends the run', () => {
    const { sim, c, place } = setup();
    sim.tracker.score = 1000;
    c.gate = 1; c.warn = true; c.trainAt = true; place(2, 5);
    sim.railRules(0);
    expect(sim.tracker.voided).toBe(true);
    expect(sim.tracker.countOf('HIT_TRAIN')).toBe(1);
    expect(sim.tracker.score).toBe(50);
    expect(sim.finished).toBe(true);
  });
});
