/*
 * Sign Rush: the questions and the scoring. No drawing here, so it can be tested.
 *
 * Three ways to play:
 *   rush       against the clock, three strikes, a streak multiplier. Signs, shapes, colours, signals and lines.
 *   signsTest  the Georgia permit Road Signs test: 20 questions, 15 right to pass. No clock.
 *   rulesTest  the Georgia permit Road Rules test: 20 questions, 15 right to pass. No clock.
 *
 * Rush scoring, in full:
 *   a right answer   100 points x the streak multiplier, plus a speed bonus of up to 50 (not multiplied)
 *   the multiplier   x1, and one more for every 3 right in a row, up to x5
 *   a wrong answer   or running out of time: one strike, the streak goes back to zero, no points are taken away
 *   three strikes    the run is over
 *   10 in a row      gives one strike back (never more than three in hand)
 *   the clock        8 seconds a question, a quarter second less for every 5 right answers, never under 3.5
 */
import { SIGNS, SIGN_BY_ID, ASK, type SignDef } from './signs';

export type Mode = 'rush' | 'signsTest' | 'rulesTest';

export interface RuleQ { id: string; q: string; a: string; wrong: [string, string, string]; fact: string }
/** Georgia road rules, from the Georgia Drivers Manual and state law. */
export const RULES: RuleQ[] = [
  { id: 'fourway', q: 'Two cars reach a four-way stop at the same time. Who goes first?', a: 'The car on the right', wrong: ['The car on the left', 'The bigger vehicle', 'Whoever is going straight'], fact: 'First to stop goes first. If two stop together, the driver on the left yields to the driver on the right.' },
  { id: 'redright', q: 'In Georgia, may you turn right at a red light?', a: 'Yes, after a full stop, unless a sign says no', wrong: ['Yes, without stopping if it is clear', 'No, never', 'Only between sunrise and sunset'], fact: 'Stop completely, yield to people and cross traffic, then turn. A "No Turn on Red" sign takes that away.' },
  { id: 'schoolbus', q: 'A school bus stops with red lights flashing on a two-lane road. What must you do?', a: 'Stop, whichever direction you are driving', wrong: ['Slow to 15 mph and pass', 'Stop only if you are behind the bus', 'Honk and pass carefully'], fact: 'Both directions stop until the lights go off and the bus moves. Only traffic on the other side of a divided highway with a median may keep going.' },
  { id: 'moveover', q: 'A police car is stopped on the shoulder ahead with its lights flashing. Georgia\'s Move Over Law says:', a: 'Move over one lane, or slow down below the limit and be ready to stop', wrong: ['Speed up to clear the area', 'Stop in your lane behind it', 'Do nothing unless an officer waves'], fact: 'It covers police, fire, ambulances, tow trucks and utility crews. If you cannot change lanes safely, slow down below the speed limit.' },
  { id: 'siren', q: 'An ambulance comes up behind you with its siren on. What do you do?', a: 'Pull to the right edge of the road and stop', wrong: ['Speed up to stay ahead of it', 'Stop right where you are', 'Move to the left lane'], fact: 'Pull over to the right, clear of intersections, and stay stopped until it has passed.' },
  { id: 'crosswalk', q: 'A person is in the crosswalk on your side of the road. Georgia law says you must:', a: 'Stop and stay stopped until they have crossed', wrong: ['Slow down and drive around them', 'Honk so they hurry', 'Yield only at a traffic light'], fact: 'Georgia requires a full stop, not just a yield, and you stay stopped while the person is in your half of the road.' },
  { id: 'roundabout', q: 'Who has the right of way at a roundabout?', a: 'Traffic already in the circle', wrong: ['Traffic entering the circle', 'The car on the right', 'The faster car'], fact: 'Slow down, yield to cars and people already in the roundabout, then enter to the right and signal your exit.' },
  { id: 'headlights', q: 'When does Georgia law require headlights?', a: 'From half an hour after sunset to half an hour before sunrise, and in rain', wrong: ['Only when it is fully dark', 'Only on highways', 'Only when streetlights are off'], fact: 'Also any time you cannot see clearly 500 feet ahead. If your wipers are on for rain, your lights should be on.' },
  { id: 'dim', q: 'How close to an oncoming car must you dim your high beams?', a: 'Within 500 feet', wrong: ['Within 50 feet', 'Within 1,000 feet', 'Only if they flash you'], fact: 'Dim within 500 feet of oncoming traffic and within 200 feet when following another car.' },
  { id: 'handsfree', q: 'Under the Hands-Free Georgia Act, while driving you may not:', a: 'Hold or support a phone with any part of your body', wrong: ['Listen to the radio', 'Use a GPS mounted on the dash', 'Talk with a passenger'], fact: 'No holding the phone, no texting, no watching or recording video. Voice control and a mounted GPS are allowed.' },
  { id: 'bac21', q: 'For a driver under 21, Georgia treats it as DUI at a blood alcohol level of:', a: '0.02', wrong: ['0.08', '0.10', '0.05'], fact: 'Under 21 the limit is 0.02. For adults 21 and over it is 0.08, and 0.04 for commercial drivers.' },
  { id: 'superspeeder', q: 'Georgia\'s Super Speeder law adds a $200 state fee for driving:', a: '75 mph or more on a two-lane road, or 85 mph or more anywhere', wrong: ['10 mph over any limit', 'Over 55 mph in the rain', '5 mph over in a school zone'], fact: 'The fee is on top of the local fine. Not paying it suspends your license.' },
  { id: 'urban', q: 'With no sign posted, the speed limit in a Georgia urban or residential district is:', a: '30 mph', wrong: ['25 mph', '35 mph', '45 mph'], fact: '30 mph in urban and residential districts and 35 mph on unpaved county roads, unless a sign says otherwise.' },
  { id: 'hydrant', q: 'How close to a fire hydrant may you park in Georgia?', a: 'No closer than 15 feet', wrong: ['No closer than 5 feet', 'No closer than 30 feet', 'Right beside it, if you stay in the car'], fact: 'Also keep 20 feet from a crosswalk, 30 feet from a stop sign or signal, and 50 feet from railroad tracks.' },
  { id: 'belts', q: 'Who must wear a seat belt in Georgia?', a: 'Everyone in the front seat, and everyone under 18 in any seat', wrong: ['Only the driver', 'Only on the interstate', 'Only passengers under 8'], fact: 'Children under 8 ride in a child seat or booster in the back seat.' },
  { id: 'classd', q: 'With a Class D license, when may a 16 or 17 year old NOT drive?', a: 'Between midnight and 5 a.m.', wrong: ['Between 9 p.m. and 6 a.m.', 'On weekends', 'In the rain'], fact: 'There are no exceptions to the midnight to 5 a.m. rule. For the first six months, only immediate family may ride along.' },
  { id: 'joshua', q: 'Joshua\'s Law requires a teen applying for a Class D license to complete:', a: '30 hours of class, 6 hours behind the wheel, and 40 hours of supervised driving', wrong: ['Only the written test', '10 hours of driving with a parent', 'One year with a permit and nothing else'], fact: 'Six of the 40 supervised hours must be at night.' },
  { id: 'leftlane', q: 'On a multi-lane highway, you are in the left lane and a faster car comes up behind you. You should:', a: 'Move right and let it pass', wrong: ['Hold your lane if you are at the speed limit', 'Tap your brakes', 'Speed up'], fact: 'Georgia\'s "slowpoke" law makes the left lane a passing lane, even if you are driving the speed limit.' },
  { id: 'hydro', q: 'Your car starts to hydroplane on a wet road. What do you do?', a: 'Ease off the gas and steer straight until the tires grip', wrong: ['Brake hard', 'Turn the wheel sharply', 'Speed up to push through'], fact: 'Braking or turning hard makes the skid worse. Slow down in rain before it happens.' },
  { id: 'leftturn', q: 'You are turning left at a green light with no arrow. Who do you yield to?', a: 'Oncoming traffic and people in the crosswalk', wrong: ['Nobody, green means go', 'Only large trucks', 'Cars behind you'], fact: 'A plain green light lets you turn left only when the oncoming lanes and the crosswalk are clear.' },
  { id: 'railstop', q: 'The lights at a railroad crossing are flashing but you see no train. What do you do?', a: 'Stop and wait until the lights stop', wrong: ['Cross quickly', 'Slow down and look, then cross', 'Honk and cross'], fact: 'Stop at least 15 feet from the nearest rail. Never drive around a lowered gate.' },
  { id: 'funeral', q: 'A funeral procession with headlights on is passing through an intersection. You should:', a: 'Yield and let the whole procession pass', wrong: ['Join it', 'Cut through a gap', 'Go when your light turns green'], fact: 'Georgia law gives a funeral procession the right of way, and you may not drive between its cars.' },
];
const RULE_BY_ID: Record<string, RuleQ> = Object.fromEntries(RULES.map((r) => [r.id, r]));

export interface Option { id: string; text?: string; signId?: string }
export interface Question {
  /** meaning: a sign is shown, pick what it means. pick: a meaning is shown, tap the sign. rule: words only. */
  kind: 'meaning' | 'pick' | 'rule';
  key: string;
  prompt: string;
  signId?: string;
  options: Option[];
  answer: string;
  fact: string;
}

export function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = <T,>(a: T[], r: () => number) => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j]!, o[i]!]; } return o; };

/** three wrong signs for this one: the ones it gets mixed up with first, then others of its kind, never one with the same meaning */
function wrongSigns(s: SignDef, r: () => number): SignDef[] {
  const out: SignDef[] = [], names = new Set([s.name]);
  const take = (c: SignDef | undefined) => { if (c && c.id !== s.id && !names.has(c.name) && out.length < 3) { names.add(c.name); out.push(c); } };
  shuffle(s.mix ?? [], r).forEach((id) => take(SIGN_BY_ID[id]));
  shuffle(SIGNS.filter((c) => c.cat === s.cat), r).forEach(take);
  shuffle(SIGNS, r).forEach(take);
  return out;
}

export function signQuestion(s: SignDef, r: () => number, allowPick: boolean): Question {
  const wrong = wrongSigns(s, r);
  // "tap the sign" only where the picture, not the words on it, has to be recognised
  const pick = allowPick && !s.ask && r() < 0.34 && wrong.every((w) => !w.ask);
  if (pick) return { kind: 'pick', key: s.id, prompt: s.name, options: shuffle([s, ...wrong], r).map((o) => ({ id: o.id, signId: o.id })), answer: s.id, fact: s.fact };
  return { kind: 'meaning', key: s.id, prompt: ASK[s.ask ?? 'sign']!, signId: s.id, options: shuffle([s, ...wrong], r).map((o) => ({ id: o.id, text: o.name })), answer: s.id, fact: s.fact };
}
export function ruleQuestion(q: RuleQ, r: () => number): Question {
  const opts = shuffle([{ id: 'a', text: q.a }, ...q.wrong.map((t, i) => ({ id: `w${i}`, text: t }))], r);
  return { kind: 'rule', key: q.id, prompt: q.q, options: opts, answer: 'a', fact: q.fact };
}

export const TEST_LEN = 20, TEST_PASS = 15;
/** The deck for a mode: every card once, shuffled. Rush reshuffles when it runs out; a test is the first 20. */
export function deck(mode: Mode, seed: number): string[] {
  const r = rng(seed);
  if (mode === 'rulesTest') return shuffle([...RULES.map((q) => `r:${q.id}`), ...SIGNS.filter((s) => s.cat === 'signal' || s.cat === 'marking').map((s) => `s:${s.id}`)], r).slice(0, TEST_LEN);
  if (mode === 'signsTest') return shuffle(SIGNS.filter((s) => s.cat !== 'signal' && s.cat !== 'marking').map((s) => `s:${s.id}`), r).slice(0, TEST_LEN);
  return shuffle(SIGNS.map((s) => `s:${s.id}`), r);
}
export function questionFor(card: string, mode: Mode, r: () => number): Question {
  const id = card.slice(2);
  return card.startsWith('r:') ? ruleQuestion(RULE_BY_ID[id]!, r) : signQuestion(SIGN_BY_ID[id]!, r, mode === 'rush');
}

// ------------------------------------------------------------------ rush scoring
export const RUSH = { base: 100, speedMax: 50, strikes: 3, perTier: 3, maxMult: 5, restoreEvery: 10, t0: 8, tMin: 3.5, tStep: 0.25, tEvery: 5 };
export const multFor = (streak: number) => Math.min(RUSH.maxMult, 1 + Math.floor(streak / RUSH.perTier));
export const timeFor = (correct: number) => Math.max(RUSH.tMin, RUSH.t0 - RUSH.tStep * Math.floor(correct / RUSH.tEvery));

export interface RushState { score: number; streak: number; best: number; correct: number; asked: number; strikes: number; missed: string[] }
export const newRush = (): RushState => ({ score: 0, streak: 0, best: 0, correct: 0, asked: 0, strikes: 0, missed: [] });
export interface Outcome { right: boolean; points: number; mult: number; speed: number; restored: boolean; over: boolean }
/** Apply one answer. `left` is the share of the clock still left (0 to 1); a timeout is a wrong answer with left = 0. */
export function answer(s: RushState, right: boolean, left: number, key: string): Outcome {
  s.asked++;
  if (!right) {
    s.strikes++; s.streak = 0; if (!s.missed.includes(key)) s.missed.push(key);
    return { right, points: 0, mult: 1, speed: 0, restored: false, over: s.strikes >= RUSH.strikes };
  }
  // the multiplier is the one earned BEFORE this answer, so the third in a row is what lifts the fourth
  const mult = multFor(s.streak), speed = Math.round(RUSH.speedMax * Math.max(0, Math.min(1, left))), points = RUSH.base * mult + speed;
  s.score += points; s.streak++; s.correct++; s.best = Math.max(s.best, s.streak);
  const restored = s.streak % RUSH.restoreEvery === 0 && s.strikes > 0;
  if (restored) s.strikes--;
  return { right, points, mult, speed, restored, over: false };
}

export const LEVELS = ['Learner', 'Permit Ready', 'Sign Reader', 'Road Scholar', 'Sign Master', '5-Star Driver'];
export const levelFor = (correct: number) => Math.min(LEVELS.length - 1, Math.floor(correct / 10));
/** stars for a rush run, from how many it got right and how clean it was */
export function rushStars(s: RushState): number {
  const acc = s.asked ? s.correct / s.asked : 0;
  return s.correct >= 40 && acc >= 0.9 ? 5 : s.correct >= 28 ? 4 : s.correct >= 18 ? 3 : s.correct >= 9 ? 2 : s.correct >= 3 ? 1 : 0;
}
