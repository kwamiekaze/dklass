import type { ReactNode } from 'react';

/*
 * Every road sign of the game, drawn as SVG to the shapes and colours of the federal sign manual (MUTCD), which Georgia uses.
 * Shape and colour carry meaning on the road, so they are exact here: red octagon, red-and-white triangle, yellow diamond,
 * orange diamond, yellow-green pentagon, yellow pennant, round yellow rail sign, white rectangle for rules.
 */
const Y = '#ffcc00', R = '#c8102e', K = '#111', W = '#fff', O = '#ff7a00', G = '#006747', B = '#003f87', SCHOOL = '#c8e000';

const Svg = ({ children, label }: { children: ReactNode; label?: string }) => <svg viewBox="0 0 100 100" role="img" aria-label={label ?? 'road sign'} className="sr-svg">{children}</svg>;
const Diamond = ({ c = Y, children }: { c?: string; children?: ReactNode }) => <>
  <rect x="17" y="17" width="66" height="66" rx="5" transform="rotate(45 50 50)" fill={c} />
  <rect x="21.5" y="21.5" width="57" height="57" rx="3" transform="rotate(45 50 50)" fill="none" stroke={K} strokeWidth="2.2" />
  {children}
</>;
const Plate = ({ children, w = 62, h = 80 }: { children?: ReactNode; w?: number; h?: number }) => <>
  <rect x={50 - w / 2} y={50 - h / 2} width={w} height={h} rx="5" fill={W} stroke={K} strokeWidth="1" />
  <rect x={50 - w / 2 + 3} y={50 - h / 2 + 3} width={w - 6} height={h - 6} rx="3" fill="none" stroke={K} strokeWidth="2.2" />
  {children}
</>;
const oct = (r: number) => Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`; }).join(' ');
const Txt = ({ x = 50, y, s, children, fill = K, w = 800 }: { x?: number; y: number; s: number; children: ReactNode; fill?: string; w?: number }) => <text x={x} y={y} fontSize={s} fontWeight={w} fill={fill} textAnchor="middle" fontFamily="'Arial Narrow', Arial, Helvetica, sans-serif" letterSpacing="0.3">{children}</text>;
/** an arrow from (x1,y1) to (x2,y2) with a solid head */
const Arrow = ({ d, head, c = K, sw = 6 }: { d: string; head: string; c?: string; sw?: number }) => <><path d={d} fill="none" stroke={c} strokeWidth={sw} strokeLinecap="butt" strokeLinejoin="round" /><polygon points={head} fill={c} /></>;
const Ban = ({ children }: { children: ReactNode }) => <Plate w={70} h={70}>{children}<circle cx="50" cy="50" r="25" fill="none" stroke={R} strokeWidth="6" /><line x1="32.5" y1="32.5" x2="67.5" y2="67.5" stroke={R} strokeWidth="6" /></Plate>;
/** a walking person, feet near (x, y) */
const Walker = ({ x, y, k = 1, c = K }: { x: number; y: number; k?: number; c?: string }) => <g transform={`translate(${x} ${y}) scale(${k})`} stroke={c} strokeWidth="4.2" strokeLinecap="round" fill="none">
  <circle cx="1" cy="-33" r="4.2" fill={c} stroke="none" />
  <path d="M0 -26 L-1 -12 M-1 -12 L-8 0 M-1 -12 L7 0 M0 -24 L-8 -15 M0 -24 L9 -18" />
</g>;
/** a signal head with one lit lens */
const Signal = ({ lit, x = 50, y = 50, k = 1, arrow }: { lit: 'r' | 'y' | 'g'; x?: number; y?: number; k?: number; arrow?: boolean }) => <g transform={`translate(${x} ${y}) scale(${k})`}>
  <rect x="-11" y="-30" width="22" height="60" rx="5" fill={K} />
  {(['r', 'y', 'g'] as const).map((c, i) => <circle key={c} cx="0" cy={-19 + i * 19} r="7" fill={lit === c ? (c === 'r' ? '#ff2d2d' : c === 'y' ? '#ffd21f' : '#27d36a') : '#3a3a3a'} />)}
  {arrow && <path d={`M5 ${lit === 'g' ? 19 : -19} h-9 m0 0 l4 -4 m-4 4 l4 4`} stroke={K} strokeWidth="2.6" fill="none" strokeLinecap="round" />}
</g>;
const Rays = ({ y, c }: { y: number; c: string }) => <g stroke={c} strokeWidth="3.4" strokeLinecap="round">{[[-26, 0, -38, 0], [26, 0, 38, 0], [-22, -13, -32, -21], [22, -13, 32, -21], [-22, 13, -32, 21], [22, 13, 32, 21]].map(([a, b, c2, d], i) => <line key={i} x1={50 + a!} y1={y + b!} x2={50 + c2!} y2={y + d!} />)}</g>;
const Road = ({ children }: { children: ReactNode }) => <><rect x="6" y="14" width="88" height="72" rx="8" fill="#3b3d44" />{children}</>;

export type SignCat = 'rule' | 'warning' | 'work' | 'shape' | 'guide' | 'signal' | 'marking';
export interface SignDef {
  id: string;
  /** the answer: what the sign means, short enough for a button */
  name: string;
  cat: SignCat;
  /** one or two plain sentences: what the driver must do, shown after every answer */
  fact: string;
  /** signs a learner mixes this one up with: they are offered as wrong answers first */
  mix?: string[];
  /** asked as "What does this shape mean?", "this signal", "this line": default is "this sign" */
  ask?: string;
  art: ReactNode;
}

export const SIGNS: SignDef[] = [
  // ---------------- regulatory: these are the law
  { id: 'stop', name: 'Stop', cat: 'rule', mix: ['yield', 'dne', 'allway'], fact: 'Come to a full stop at the stop line, the crosswalk, or before the intersection. Go only when it is clear.',
    art: <Svg label="stop sign"><polygon points={oct(46)} fill={W} /><polygon points={oct(43)} fill={R} /><polygon points={oct(39.5)} fill="none" stroke={W} strokeWidth="2.4" /><Txt y={59} s={23.5} fill={W}>STOP</Txt></Svg> },
  { id: 'allway', name: 'All-way stop: every direction stops', cat: 'rule', mix: ['stop', 'crossroad', 'yield'], fact: 'Every road at this intersection has a stop sign. The first car to stop goes first. If two stop together, the car on the right goes.',
    art: <Svg label="stop sign with all way plaque"><g transform="translate(0 -9) scale(0.86) translate(8 2)"><polygon points={oct(46)} fill={W} /><polygon points={oct(43)} fill={R} /><Txt y={59} s={24} fill={W}>STOP</Txt></g><rect x="24" y="80" width="52" height="16" rx="2.5" fill={R} stroke={W} strokeWidth="1.6" /><Txt y={92} s={11} fill={W}>ALL WAY</Txt></Svg> },
  { id: 'yield', name: 'Yield', cat: 'rule', mix: ['stop', 'yieldAhead', 'merge'], fact: 'Slow down and give the right of way to traffic and people already there. Stop if you have to.',
    art: <Svg label="yield sign"><polygon points="4,10 96,10 50,92" fill={R} stroke={W} strokeWidth="1" strokeLinejoin="round" /><polygon points="24,22 76,22 50,68" fill={W} /><Txt y={36} s={12.5} fill={R}>YIELD</Txt></Svg> },
  { id: 'speed25', name: 'Speed limit 25 mph', cat: 'rule', mix: ['speed70', 'schoolSpeed'], fact: 'The most you may drive here in good conditions. In rain, fog or traffic the safe speed is lower.',
    art: <Svg label="speed limit 25"><Plate><Txt y={27} s={12}>SPEED</Txt><Txt y={40} s={12}>LIMIT</Txt><Txt y={78} s={40}>25</Txt></Plate></Svg> },
  { id: 'speed70', name: 'Speed limit 70 mph', cat: 'rule', mix: ['speed25', 'interstate'], fact: 'The highest limit in Georgia, posted on rural interstates. It is a maximum, not a target.',
    art: <Svg label="speed limit 70"><Plate><Txt y={27} s={12}>SPEED</Txt><Txt y={40} s={12}>LIMIT</Txt><Txt y={78} s={40}>70</Txt></Plate></Svg> },
  { id: 'schoolSpeed', name: 'School zone speed limit', cat: 'rule', mix: ['school', 'speed25', 'pedXing'], fact: 'When the lights flash or during the posted hours, this lower limit is the law. Fines are higher in school zones.',
    art: <Svg label="school speed limit 25 when flashing"><rect x="19" y="4" width="62" height="20" rx="3" fill={SCHOOL} stroke={K} strokeWidth="1.6" /><Txt y={19} s={13}>SCHOOL</Txt><g transform="translate(0 12) scale(1 0.78) translate(0 8)"><Plate><Txt y={27} s={11}>SPEED</Txt><Txt y={39} s={11}>LIMIT</Txt><Txt y={70} s={32}>25</Txt></Plate></g><rect x="19" y="86" width="62" height="12" rx="2" fill={W} stroke={K} strokeWidth="1.4" /><Txt y={95} s={7.4}>WHEN FLASHING</Txt></Svg> },
  { id: 'dne', name: 'Do not enter', cat: 'rule', mix: ['wrongway', 'stop', 'oneway'], fact: 'You may not drive into this road or ramp. Traffic is coming toward you.',
    art: <Svg label="do not enter"><rect x="6" y="6" width="88" height="88" rx="6" fill={W} /><circle cx="50" cy="50" r="40" fill={R} /><rect x="18" y="43" width="64" height="14" fill={W} /><Txt y={36} s={10.5} fill={W}>DO NOT</Txt><Txt y={74} s={10.5} fill={W}>ENTER</Txt></Svg> },
  { id: 'wrongway', name: 'Wrong way', cat: 'rule', mix: ['dne', 'oneway', 'noUturn'], fact: 'You are driving against traffic. Pull over safely and turn around as soon as you can.',
    art: <Svg label="wrong way"><rect x="6" y="26" width="88" height="48" rx="5" fill={R} stroke={W} strokeWidth="2" /><Txt y={47} s={17} fill={W}>WRONG</Txt><Txt y={66} s={17} fill={W}>WAY</Txt></Svg> },
  { id: 'oneway', name: 'One way: go only the way the arrow points', cat: 'rule', mix: ['keepRight', 'dne', 'twoWay'], fact: 'All traffic on this street moves in the direction of the arrow. Never turn against it.',
    art: <Svg label="one way"><rect x="4" y="33" width="92" height="34" rx="4" fill={K} stroke={W} strokeWidth="2" /><polygon points="12,43 66,43 66,37 90,50 66,63 66,57 12,57" fill={W} /><Txt x={42} y={54.5} s={10.5}>ONE WAY</Txt></Svg> },
  { id: 'noUturn', name: 'No U-turn', cat: 'rule', mix: ['noLeft', 'noRight', 'wrongway'], fact: 'You may not turn around to go back the way you came at this spot.',
    art: <Svg label="no U turn"><Ban><Arrow d="M60 68 V46 a10 10 0 0 0 -20 0 V54" head="33,52 47,52 40,64" sw={6.5} /></Ban></Svg> },
  { id: 'noLeft', name: 'No left turn', cat: 'rule', mix: ['noRight', 'noUturn', 'leftOnly'], fact: 'Left turns are not allowed here. Go straight or turn right, and find another way around.',
    art: <Svg label="no left turn"><Ban><Arrow d="M60 68 V50 a6 6 0 0 0 -6 -6 H44" head="46,35 46,53 33,44" sw={6.5} /></Ban></Svg> },
  { id: 'noRight', name: 'No right turn', cat: 'rule', mix: ['noLeft', 'noUturn', 'noRed'], fact: 'Right turns are not allowed here, even on a green light.',
    art: <Svg label="no right turn"><Ban><Arrow d="M40 68 V50 a6 6 0 0 1 6 -6 H56" head="54,35 54,53 67,44" sw={6.5} /></Ban></Svg> },
  { id: 'noRed', name: 'No turn on red', cat: 'rule', mix: ['noRight', 'signalAhead', 'stop'], fact: 'In Georgia you may turn right on red after a full stop, unless this sign is posted. Here you wait for green.',
    art: <Svg label="no turn on red"><Plate w={66} h={80}><Txt y={30} s={15}>NO</Txt><Txt y={47} s={15}>TURN</Txt><Txt y={64} s={15}>ON</Txt><Txt y={81} s={15} fill={R}>RED</Txt></Plate><circle cx="72" cy="27" r="6" fill={R} /></Svg> },
  { id: 'keepRight', name: 'Keep right of the divider', cat: 'rule', mix: ['oneway', 'dividedBegins', 'merge'], fact: 'A median or island is ahead. Stay to the right of it.',
    art: <Svg label="keep right"><Plate><path d="M38 84 V54 q0 -16 12 -22" fill="none" stroke={K} strokeWidth="5.5" /><polygon points="44,26 60,22 55,38" fill={K} /><path d="M38 20 h10 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-10 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 z" transform="translate(0 30) scale(0.9) translate(4 0)" fill={K} /></Plate></Svg> },
  { id: 'leftOnly', name: 'This lane must turn left', cat: 'rule', mix: ['noLeft', 'oneway', 'curveLeft'], fact: 'If you are in this lane you have to turn left. Change lanes early if you want to go straight.',
    art: <Svg label="left turn only"><Plate><Arrow d="M60 62 V44 a8 8 0 0 0 -8 -8 H44" head="46,26 46,46 31,36" sw={7} /><Txt y={80} s={15}>ONLY</Txt></Plate></Svg> },
  { id: 'noParking', name: 'No parking', cat: 'rule', mix: ['hospital', 'dne', 'noUturn'], fact: 'You may not leave a car here. Georgia also bans parking within 15 feet of a fire hydrant and 20 feet of a crosswalk.',
    art: <Svg label="no parking"><Ban><Txt y={64} s={40}>P</Txt></Ban></Svg> },
  { id: 'crossbuck', name: 'Railroad crossing: yield to trains', cat: 'rule', mix: ['rrAdvance', 'crossroad', 'stop'], fact: 'The tracks are right here. Slow down, look both ways and listen. A train always has the right of way.',
    art: <Svg label="railroad crossbuck"><g transform="rotate(32 50 50)"><rect x="2" y="41" width="96" height="18" rx="2" fill={W} stroke={K} strokeWidth="1.6" /><text x="10" y="54.5" fontSize="11" fontWeight="800" fontFamily="'Arial Narrow', Arial, sans-serif">RAIL</text><text x="64" y="54.5" fontSize="11" fontWeight="800" fontFamily="'Arial Narrow', Arial, sans-serif">ROAD</text></g><g transform="rotate(-32 50 50)"><rect x="2" y="41" width="96" height="18" rx="2" fill={W} stroke={K} strokeWidth="1.6" /><text x="14" y="54.5" fontSize="11" fontWeight="800" fontFamily="'Arial Narrow', Arial, sans-serif">CROSS</text><text x="62" y="54.5" fontSize="11" fontWeight="800" fontFamily="'Arial Narrow', Arial, sans-serif">ING</text></g></Svg> },

  // ---------------- warning: yellow diamonds
  { id: 'signalAhead', name: 'Traffic signal ahead', cat: 'warning', mix: ['stopAhead', 'yieldAhead', 'flashRed'], fact: 'A traffic light is coming up that you may not see yet. Be ready to stop.',
    art: <Svg label="signal ahead"><Diamond><Signal lit="r" k={0.72} /><circle cx="50" cy="50" r="5" fill="#ffd21f" /><circle cx="50" cy="63.7" r="5" fill="#27d36a" /></Diamond></Svg> },
  { id: 'stopAhead', name: 'Stop sign ahead', cat: 'warning', mix: ['signalAhead', 'yieldAhead', 'stop'], fact: 'A stop sign is coming up. Start slowing down now.',
    art: <Svg label="stop ahead"><Diamond><polygon points={oct(15)} fill={R} transform="translate(0 9)" /><Arrow d="M50 40 V28" head="43,30 57,30 50,18" sw={5} /></Diamond></Svg> },
  { id: 'yieldAhead', name: 'Yield sign ahead', cat: 'warning', mix: ['stopAhead', 'signalAhead', 'yield'], fact: 'A yield sign is coming up. Slow down and be ready to give way.',
    art: <Svg label="yield ahead"><Diamond><polygon points="34,48 66,48 50,76" fill={R} /><polygon points="41,52.5 59,52.5 50,68" fill={W} /><Arrow d="M50 40 V28" head="43,30 57,30 50,18" sw={5} /></Diamond></Svg> },
  { id: 'merge', name: 'Traffic merges from the right', cat: 'warning', mix: ['laneEnds', 'addedLane', 'sideRoad'], fact: 'Another lane of traffic is about to join yours. Adjust your speed or move left to let it in.',
    art: <Svg label="merge"><Diamond><Arrow d="M46 78 V34" head="38,36 54,36 46,22" sw={7} /><path d="M66 78 q0 -18 -16 -28" fill="none" stroke={K} strokeWidth="6" /></Diamond></Svg> },
  { id: 'addedLane', name: 'Added lane: traffic joins without merging', cat: 'warning', mix: ['merge', 'laneEnds', 'dividedBegins'], fact: 'Traffic enters in its own new lane. You do not need to make room, but watch for early lane changes.',
    art: <Svg label="added lane"><Diamond><Arrow d="M42 78 V34" head="34,36 50,36 42,22" sw={7} /><path d="M66 78 q0 -14 -6 -22 V36" fill="none" stroke={K} strokeWidth="6" /><polygon points="52,38 68,38 60,24" fill={K} /></Diamond></Svg> },
  { id: 'laneEnds', name: 'Right lane ends: merge left', cat: 'warning', mix: ['merge', 'addedLane', 'dividedBegins'], fact: 'Your lane is about to disappear. Signal, find a gap, and move left before it ends.',
    art: <Svg label="lane ends"><Diamond><line x1="38" y1="24" x2="38" y2="78" stroke={K} strokeWidth="5" /><path d="M66 78 V58 L52 36 V24" fill="none" stroke={K} strokeWidth="5" strokeLinejoin="round" /><line x1="52" y1="50" x2="52" y2="78" stroke={K} strokeWidth="2.6" strokeDasharray="6 5" /></Diamond></Svg> },
  { id: 'dividedBegins', name: 'Divided highway begins', cat: 'warning', mix: ['keepRight', 'twoWay', 'laneEnds'], fact: 'A median is about to separate the two directions. Keep to the right of it.',
    art: <Svg label="divided highway begins"><Diamond><path d="M50 30 a7 7 0 0 1 7 7 v10 a7 7 0 0 1 -14 0 v-10 a7 7 0 0 1 7 -7 z" fill={K} /><Arrow d="M62 74 V60 q0 -8 6 -14" head="60,48 74,42 72,56" sw={4.5} /><Arrow d="M38 30 V44 q0 8 -6 14" head="24,52 26,66 40,60" sw={4.5} /></Diamond></Svg> },
  { id: 'twoWay', name: 'Two-way traffic ahead', cat: 'warning', mix: ['oneway', 'dividedBegins', 'crossroad'], fact: 'The one-way or divided road is ending. Traffic will be coming toward you in the next lane.',
    art: <Svg label="two way traffic"><Diamond><Arrow d="M40 30 V62" head="32,60 48,60 40,74" sw={6} /><Arrow d="M60 72 V40" head="52,42 68,42 60,28" sw={6} /></Diamond></Svg> },
  { id: 'curveRight', name: 'Curve to the right', cat: 'warning', mix: ['sharpRight', 'winding', 'curveLeft'], fact: 'The road bends right. Slow down before the curve, not in it.',
    art: <Svg label="curve right"><Diamond><Arrow d="M42 78 V58 q0 -18 16 -24" head="52,24 70,28 58,42" sw={7} /></Diamond></Svg> },
  { id: 'curveLeft', name: 'Curve to the left', cat: 'warning', mix: ['curveRight', 'winding', 'leftOnly'], fact: 'The road bends left. Slow down before the curve and stay in your lane.',
    art: <Svg label="curve left"><Diamond><Arrow d="M58 78 V58 q0 -18 -16 -24" head="48,24 30,28 42,42" sw={7} /></Diamond></Svg> },
  { id: 'sharpRight', name: 'Sharp right turn', cat: 'warning', mix: ['curveRight', 'winding', 'noRight'], fact: 'The road turns hard to the right. Slow down a lot more than for a curve.',
    art: <Svg label="sharp right turn"><Diamond><Arrow d="M40 78 V42 H58" head="56,31 56,53 72,42" sw={7} /></Diamond></Svg> },
  { id: 'winding', name: 'Winding road', cat: 'warning', mix: ['curveRight', 'slippery', 'sharpRight'], fact: 'Several curves in a row are ahead. Keep your speed down and do not pass.',
    art: <Svg label="winding road"><Diamond><Arrow d="M46 80 q-14 -12 0 -22 q14 -10 2 -22" head="38,36 56,34 46,20" sw={6.5} /></Diamond></Svg> },
  { id: 'slippery', name: 'Slippery when wet', cat: 'warning', mix: ['winding', 'hill', 'curveRight'], fact: 'The road gets slick in rain. Slow down, leave more room, and brake gently.',
    art: <Svg label="slippery when wet"><Diamond><rect x="38" y="28" width="24" height="20" rx="4" fill={K} /><rect x="42" y="32" width="16" height="7" rx="1.5" fill={Y} /><rect x="35" y="44" width="5" height="9" rx="1.5" fill={K} /><rect x="60" y="44" width="5" height="9" rx="1.5" fill={K} /><path d="M40 56 q-8 6 0 12 q8 6 0 12" fill="none" stroke={K} strokeWidth="3.4" /><path d="M60 56 q-8 6 0 12 q8 6 0 12" fill="none" stroke={K} strokeWidth="3.4" /></Diamond></Svg> },
  { id: 'pedXing', name: 'Pedestrian crossing', cat: 'warning', mix: ['school', 'flagger', 'schoolSpeed'], fact: 'People cross here. In Georgia you must stop, and stay stopped, for anyone in the crosswalk on your side of the road.',
    art: <Svg label="pedestrian crossing"><Diamond><Walker x={50} y={72} k={1.25} /></Diamond></Svg> },
  { id: 'school', name: 'School zone or school crossing', cat: 'warning', mix: ['pedXing', 'schoolSpeed', 'flagger'], fact: 'Children may be walking or crossing. Slow down and watch both sides of the road. This is the only five-sided sign.',
    art: <Svg label="school crossing"><polygon points="50,4 94,36 94,94 6,94 6,36" fill={SCHOOL} stroke={K} strokeWidth="1" strokeLinejoin="round" /><polygon points="50,10 89,38.5 89,89 11,89 11,38.5" fill="none" stroke={K} strokeWidth="2.2" strokeLinejoin="round" /><Walker x={38} y={82} k={1.05} /><Walker x={62} y={82} k={1.3} /></Svg> },
  { id: 'crossroad', name: 'Crossroad ahead', cat: 'warning', mix: ['sideRoad', 'tee', 'crossbuck'], fact: 'Another road crosses yours ahead. Watch for cars pulling out from the left and the right.',
    art: <Svg label="crossroad"><Diamond><line x1="50" y1="22" x2="50" y2="78" stroke={K} strokeWidth="9" /><line x1="24" y1="50" x2="76" y2="50" stroke={K} strokeWidth="7" /></Diamond></Svg> },
  { id: 'sideRoad', name: 'Side road enters from the right', cat: 'warning', mix: ['crossroad', 'merge', 'tee'], fact: 'A road joins from the right ahead. Watch for cars turning in and out.',
    art: <Svg label="side road"><Diamond><line x1="46" y1="22" x2="46" y2="78" stroke={K} strokeWidth="9" /><line x1="46" y1="50" x2="74" y2="50" stroke={K} strokeWidth="7" /></Diamond></Svg> },
  { id: 'tee', name: 'T intersection: the road ends ahead', cat: 'warning', mix: ['crossroad', 'sideRoad', 'dne'], fact: 'Your road ends at a cross street. You will have to turn left or right, and yield to the traffic on it.',
    art: <Svg label="T intersection"><Diamond><line x1="50" y1="40" x2="50" y2="78" stroke={K} strokeWidth="9" /><line x1="24" y1="40" x2="76" y2="40" stroke={K} strokeWidth="8" /></Diamond></Svg> },
  { id: 'roundabout', name: 'Roundabout ahead', cat: 'warning', mix: ['noUturn', 'winding', 'crossroad'], fact: 'A traffic circle is ahead. Slow down, yield to cars already in it, and go around to the right.',
    art: <Svg label="roundabout ahead"><Diamond>{[0, 120, 240].map((a) => <g key={a} transform={`rotate(${a} 50 50)`}><path d="M50 30 a20 20 0 0 1 17.3 10" fill="none" stroke={K} strokeWidth="6" /><polygon points="62,46 74,36 74,52" fill={K} /></g>)}</Diamond></Svg> },
  { id: 'hill', name: 'Steep hill ahead', cat: 'warning', mix: ['slippery', 'winding', 'laneEnds'], fact: 'A steep downgrade is ahead. Slow down early and use a lower gear so you do not ride the brakes.',
    art: <Svg label="hill"><Diamond><polygon points="24,68 76,68 76,40" fill={K} /><g transform="rotate(-28 52 48)"><rect x="34" y="34" width="24" height="12" rx="1.5" fill={K} /><rect x="58" y="38" width="9" height="8" rx="1.5" fill={K} /><circle cx="40" cy="48" r="3.4" fill={K} /><circle cx="60" cy="48" r="3.4" fill={K} /></g></Diamond></Svg> },
  { id: 'rrAdvance', name: 'Railroad crossing ahead', cat: 'warning', mix: ['crossbuck', 'crossroad', 'stopAhead'], fact: 'Tracks cross the road ahead. Slow down and be ready to stop. This is the only round yellow sign.',
    art: <Svg label="railroad advance warning"><circle cx="50" cy="50" r="45" fill={Y} stroke={K} strokeWidth="1" /><circle cx="50" cy="50" r="41" fill="none" stroke={K} strokeWidth="2.4" /><line x1="21" y1="21" x2="79" y2="79" stroke={K} strokeWidth="7" /><line x1="79" y1="21" x2="21" y2="79" stroke={K} strokeWidth="7" /><Txt x={27} y={56.5} s={19}>R</Txt><Txt x={73} y={56.5} s={19}>R</Txt></Svg> },

  // ---------------- work zones: orange
  { id: 'flagger', name: 'Flagger ahead: be ready to stop', cat: 'work', mix: ['pedXing', 'workZone', 'school'], fact: 'A worker is directing traffic ahead. Their signals are the law, and speeding fines are much higher in work zones.',
    art: <Svg label="flagger ahead"><Diamond c={O}><Walker x={46} y={74} k={1.25} /><line x1="57" y1="50" x2="68" y2="34" stroke={K} strokeWidth="2.4" /><polygon points="68,34 80,36 72,46" fill={K} /></Diamond></Svg> },
  { id: 'workZone', name: 'Road work ahead', cat: 'work', mix: ['flagger', 'laneEnds', 'slippery'], fact: 'Orange always means construction or maintenance. Slow down, watch for workers, and expect lane changes.',
    art: <Svg label="road work ahead"><Diamond c={O}><Txt y={42} s={13.5}>ROAD</Txt><Txt y={57} s={13.5}>WORK</Txt><Txt y={72} s={13.5}>AHEAD</Txt></Diamond></Svg> },

  // ---------------- shapes alone: a sign can be read from its back
  { id: 'shapeOct', name: 'Stop', cat: 'shape', ask: 'shape', mix: ['shapeTri', 'shapeDiamond', 'shapeRound'], fact: 'Only stop signs have eight sides, so you can tell one even from behind or covered in snow.',
    art: <Svg label="octagon"><polygon points={oct(43)} fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" /></Svg> },
  { id: 'shapeTri', name: 'Yield', cat: 'shape', ask: 'shape', mix: ['shapeOct', 'shapePennant', 'shapeDiamond'], fact: 'A triangle pointing down is always a yield sign.',
    art: <Svg label="downward triangle"><polygon points="6,12 94,12 50,90" fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" strokeLinejoin="round" /></Svg> },
  { id: 'shapeDiamond', name: 'Warning: a hazard ahead', cat: 'shape', ask: 'shape', mix: ['shapeRect', 'shapeOct', 'shapePent'], fact: 'Diamond signs warn you about what is coming: curves, crossings, merges, signals.',
    art: <Svg label="diamond"><rect x="19" y="19" width="62" height="62" rx="4" transform="rotate(45 50 50)" fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" /></Svg> },
  { id: 'shapePent', name: 'School zone or school crossing', cat: 'shape', ask: 'shape', mix: ['shapeDiamond', 'shapeOct', 'shapePennant'], fact: 'The five-sided sign, shaped like a schoolhouse, is used only for schools.',
    art: <Svg label="pentagon"><polygon points="50,6 92,37 92,92 8,92 8,37" fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" strokeLinejoin="round" /></Svg> },
  { id: 'shapePennant', name: 'No passing zone', cat: 'shape', ask: 'shape', mix: ['shapeTri', 'shapeDiamond', 'shapeRect'], fact: 'The sideways pennant stands on the left side of the road where a no passing zone begins.',
    art: <Svg label="pennant"><polygon points="8,20 94,50 8,80" fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" strokeLinejoin="round" /></Svg> },
  { id: 'shapeRound', name: 'Railroad crossing ahead', cat: 'shape', ask: 'shape', mix: ['shapeOct', 'shapeDiamond', 'shapePent'], fact: 'A round sign is the advance warning for railroad tracks.',
    art: <Svg label="circle"><circle cx="50" cy="50" r="42" fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" /></Svg> },
  { id: 'shapeRect', name: 'A rule you must obey', cat: 'shape', ask: 'shape', mix: ['shapeDiamond', 'shapePennant', 'shapeRound'], fact: 'Upright white rectangles are regulatory signs: speed limits, turn rules, lane rules. They are the law.',
    art: <Svg label="vertical rectangle"><rect x="22" y="8" width="56" height="84" rx="5" fill="#8d95a3" stroke="#e7ebf2" strokeWidth="2.5" /></Svg> },

  // ---------------- guide and service signs
  { id: 'interstate', name: 'Interstate highway route', cat: 'guide', mix: ['hospital', 'speed70', 'services'], fact: 'The red, white and blue shield marks an interstate. Even numbers run east and west, odd numbers north and south.',
    art: <Svg label="interstate shield"><path d="M8 20 Q28 12 50 17 Q72 12 92 20 Q94 50 84 70 Q72 88 50 96 Q28 88 16 70 Q6 50 8 20 Z" fill={W} /><path d="M12 23 Q30 16 50 21 Q70 16 88 23 Q90 50 81 68 Q70 84 50 91 Q30 84 19 68 Q10 50 12 23 Z" fill={B} /><path d="M12 23 Q30 16 50 21 Q70 16 88 23 L88.6 38 H11.4 Z" fill={R} /><rect x="11" y="37" width="78" height="2.4" fill={W} /><Txt y={33} s={9.5} fill={W}>INTERSTATE</Txt><Txt y={74} s={36} fill={W}>20</Txt></Svg> },
  { id: 'hospital', name: 'Hospital', cat: 'guide', mix: ['services', 'noParking', 'interstate'], fact: 'Blue signs point to services. The white H leads to a hospital with emergency care.',
    art: <Svg label="hospital"><rect x="10" y="10" width="80" height="80" rx="8" fill={B} stroke={W} strokeWidth="3" /><Txt y={74} s={66} fill={W}>H</Txt></Svg> },
  { id: 'services', name: 'Services: gas, food or lodging', cat: 'guide', ask: 'colour', mix: ['hospital', 'colourBrown', 'colourGreen'], fact: 'Blue is the colour for driver services: gas, food, lodging, rest areas and hospitals.',
    art: <Svg label="blue sign"><rect x="8" y="20" width="84" height="60" rx="7" fill={B} stroke={W} strokeWidth="3" /><rect x="17" y="29" width="66" height="42" rx="4" fill="none" stroke={W} strokeWidth="1.6" opacity=".7" /></Svg> },
  { id: 'colourGreen', name: 'Directions, exits and distances', cat: 'guide', ask: 'colour', mix: ['services', 'colourBrown', 'workZone'], fact: 'Green guide signs tell you where you are, which way to go, and how far it is.',
    art: <Svg label="green sign"><rect x="8" y="20" width="84" height="60" rx="7" fill={G} stroke={W} strokeWidth="3" /><rect x="17" y="29" width="66" height="42" rx="4" fill="none" stroke={W} strokeWidth="1.6" opacity=".7" /></Svg> },
  { id: 'colourBrown', name: 'Parks, recreation and historic sites', cat: 'guide', ask: 'colour', mix: ['services', 'colourGreen', 'workZone'], fact: 'Brown signs point to public parks, lakes, and places of cultural or historic interest.',
    art: <Svg label="brown sign"><rect x="8" y="20" width="84" height="60" rx="7" fill="#6a3b1c" stroke={W} strokeWidth="3" /><rect x="17" y="29" width="66" height="42" rx="4" fill="none" stroke={W} strokeWidth="1.6" opacity=".7" /></Svg> },

  // ---------------- signals
  { id: 'flashRed', name: 'Stop, then go when clear (like a stop sign)', cat: 'signal', ask: 'signal', mix: ['flashYellow', 'redArrow', 'signalAhead'], fact: 'A flashing red light means the same as a stop sign: full stop, then go when it is safe.',
    art: <Svg label="flashing red signal"><Rays y={22.5} c="#ff5a5a" /><Signal lit="r" k={1.45} /></Svg> },
  { id: 'flashYellow', name: 'Slow down and go with caution', cat: 'signal', ask: 'signal', mix: ['flashRed', 'greenArrow', 'yield'], fact: 'A flashing yellow light means slow down and be careful. You do not have to stop.',
    art: <Svg label="flashing yellow signal"><Rays y={50} c="#ffd84a" /><Signal lit="y" k={1.45} /></Svg> },
  { id: 'greenArrow', name: 'Protected turn: you may turn the way it points', cat: 'signal', ask: 'signal', mix: ['redArrow', 'flashYellow', 'leftOnly'], fact: 'A green arrow gives you the right of way to turn. Oncoming traffic has a red light.',
    art: <Svg label="green arrow signal"><Signal lit="g" arrow k={1.45} /></Svg> },
  { id: 'redArrow', name: 'No turn that way until it changes', cat: 'signal', ask: 'signal', mix: ['greenArrow', 'flashRed', 'noLeft'], fact: 'A red arrow means stop. You may not turn in the direction of the arrow until it is green.',
    art: <Svg label="red arrow signal"><Signal lit="r" arrow k={1.45} /></Svg> },

  // ---------------- pavement markings
  { id: 'doubleYellow', name: 'No passing in either direction', cat: 'marking', ask: 'line', mix: ['brokenYellow', 'solidBroken', 'brokenWhite'], fact: 'Two solid yellow lines: nobody may cross to pass. You may cross only to turn left into a driveway or street.',
    art: <Svg label="double solid yellow line"><Road><line x1="46.5" y1="14" x2="46.5" y2="86" stroke={Y} strokeWidth="3.4" /><line x1="53.5" y1="14" x2="53.5" y2="86" stroke={Y} strokeWidth="3.4" /></Road></Svg> },
  { id: 'brokenYellow', name: 'Passing is allowed when the way is clear', cat: 'marking', ask: 'line', mix: ['doubleYellow', 'solidBroken', 'brokenWhite'], fact: 'A broken yellow line separates opposite directions. You may pass when it is safe and the road ahead is clear.',
    art: <Svg label="broken yellow line"><Road><line x1="50" y1="14" x2="50" y2="86" stroke={Y} strokeWidth="3.6" strokeDasharray="13 10" /></Road></Svg> },
  { id: 'solidBroken', name: 'Only the side with the broken line may pass', cat: 'marking', ask: 'line', mix: ['doubleYellow', 'brokenYellow', 'brokenWhite'], fact: 'Solid on your side: do not pass. Broken on your side: you may pass when it is safe.',
    art: <Svg label="solid and broken yellow line"><Road><line x1="46.5" y1="14" x2="46.5" y2="86" stroke={Y} strokeWidth="3.4" /><line x1="53.5" y1="14" x2="53.5" y2="86" stroke={Y} strokeWidth="3.4" strokeDasharray="13 10" /></Road></Svg> },
  { id: 'brokenWhite', name: 'Lanes going the same way: change when safe', cat: 'marking', ask: 'line', mix: ['brokenYellow', 'doubleYellow', 'solidBroken'], fact: 'White lines separate lanes moving in the same direction. Broken means you may change lanes when it is safe.',
    art: <Svg label="broken white line"><Road><line x1="50" y1="14" x2="50" y2="86" stroke={W} strokeWidth="3.6" strokeDasharray="13 10" /></Road></Svg> },
];

export const SIGN_BY_ID: Record<string, SignDef> = Object.fromEntries(SIGNS.map((s) => [s.id, s]));
export const ASK: Record<string, string> = { sign: 'What does this sign mean?', shape: 'A sign with this shape always means…', colour: 'A sign this colour is for…', signal: 'What does this signal mean?', line: 'What does this line mean?' };
