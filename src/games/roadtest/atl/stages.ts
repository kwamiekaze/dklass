/**
 * The Atlanta stages. Real roads of Georgia: the interstates of the metro (I-75, I-85, I-20, I-285, GA-400), the streets of Carrollton (30117),
 * Douglasville, Villa Rica, Marietta, Decatur, Midtown and Buckhead. The road names and the places on the green signs are real; the traffic, the
 * businesses on the billboards and the events along the way are made up for teaching.
 */
import type { LevelConfig } from '../game/types';
import type { AtlStage, GuideSign, Shield, StageEvent } from './stageTypes';

const I = (n: string): Shield => ({ t: 'I', n }), US = (n: string): Shield => ({ t: 'US', n }), GA = (n: string): Shield => ({ t: 'GA', n });
const sign = (at: number, shields: Shield[] | undefined, dir: string | undefined, dests: string[], extra: Partial<GuideSign> = {}): GuideSign => ({ at, shields, dir, dests, ...extra });
const LESS_HW = ['Keep up with the flow, but never above the posted limit. The left lane is for passing, not for cruising.', 'Look 12 seconds ahead. At highway speed that is about a quarter mile.', 'Georgia law: hands-free only. Phone down, eyes up.'];

const base = (s: Partial<AtlStage> & Pick<AtlStage, 'id' | 'name' | 'subtitle' | 'roadName' | 'region' | 'skyline' | 'lengthM' | 'guide' | 'events' | 'place'>): AtlStage => ({
  road: 'interstate', lanes: 4, limit: 70, maxSpeed: 86, tod: 'day', traffic: 0.8, trucks: 0.14, flow: 0.98, curves: 'gentle', lessons: LESS_HW, par: 1500, trees: 'mixed', walls: 'glass', ...s,
});

const RAW: AtlStage[] = [
  base({
    id: 'atl-connector-north', limit: 55, name: 'Downtown Connector North', subtitle: 'I-75/85 N · Five lanes through the heart of Atlanta', roadName: 'I-75/85 NORTH', region: 'downtown', skyline: 'downtown', lanes: 5, hov: true, lengthM: 4200, tod: 'dusk', traffic: 1.0, curves: 'rolling', par: 1700, walls: 'glass', place: 'Downtown Atlanta',
    guide: [
      sign(0.07, [I('75'), I('85')], 'NORTH', ['Chattanooga', 'Greenville'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.4, no: '249B', dests: ['Peachtree St', 'Civic Center'] },
      { at: 0.52, no: '249D', shields: [US('19'), US('29')], dests: ['Spring St', 'West Peachtree St'] },
      { at: 0.64, no: '250', dests: ['10th St', '14th St', 'Georgia Tech'] },
      { at: 0.76, no: '251A', dests: ['17th St', 'Midtown'] },
      { at: 0.95, kind: 'fork', no: '251B', shields: [I('75')], dir: 'NORTH', dests: ['Marietta', 'Chattanooga'], also: [{ shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], arrows: ['upright'] }], to: 'free-i85n', toLeft: 'free-i75n', name: 'I-75 NORTH · Marietta' },
    ],
    events: [{ t: 'vms', at: 0.04, text: 'CONNECTOR  SLOW  USE  CAUTION' }, { t: 'tip', at: 0.1, title: 'Welcome to the Connector', sub: 'Up to 14 lanes wide near the 14th Street Bridge. The far left lane is HOV, two or more riders only.' }, { t: 'merge', at: 0.3 }, { t: 'merge', at: 0.62 }, { t: 'tip', at: 0.8, title: 'Left exit ahead', sub: 'I-75 North peels off to the left at the Brookwood split. Read the sign early.' }],
    lessons: ['Downtown traffic bunches up. Leave a 3 second gap behind the car ahead.', 'Ramps feed in from the right. Make room if you can do it safely.', 'Never cut across the white gore stripes to catch an exit.'],
  }),
  base({
    id: 'atl-connector-south', limit: 55, name: 'Downtown Connector South', subtitle: 'I-75/85 S · Skyline in the mirror, airport ahead', roadName: 'I-75/85 SOUTH', region: 'downtown', skyline: 'downtown', lanes: 5, lengthM: 4200, tod: 'golden', traffic: 1.0, curves: 'rolling', par: 1700, place: 'Downtown Atlanta',
    guide: [
      sign(0.06, [I('75'), I('85')], 'SOUTH', ['Macon', 'Montgomery'], { arrows: ['up'] }),
      sign(0.42, undefined, undefined, ['Memorial Drive'], { tab: 'LEFT · HOV EXIT', dist: '1 MILE' }),
      sign(0.5, [I('20')], undefined, ['Augusta', 'Birmingham'], { tab: 'EXIT 247', dist: '1 MILE', also: [{ dests: ['Fulton St', 'Central Ave', 'Ga State Univ'], tab: 'EXIT 246', dist: '3/4 MILE' }, { dests: ['Abernathy Blvd', 'Capitol Ave', 'Turner Field'], tab: 'EXIT 245', dist: '1/4 MILE' }] }),
    ],
    exits: [
      { at: 0.2, no: '250', dests: ['16th St', '14th St', '10th St'] },
      { at: 0.34, no: '249D', shields: [US('78')], dests: ['North Ave', 'Georgia Tech'] },
      { at: 0.6, no: '247', shields: [I('20')], dests: ['Augusta', 'Birmingham'], quiet: true },
      { at: 0.7, no: '246', dests: ['Fulton St', 'Central Ave', 'Ga State Univ'], quiet: true },
      { at: 0.8, no: '245', dests: ['Abernathy Blvd', 'Capitol Ave', 'Turner Field'], quiet: true },
      { at: 0.94, no: '243', shields: [GA('166')], dests: ['Langford Pkwy', 'East Point'] },
    ],
    events: [{ t: 'tip', at: 0.12, title: 'Pick your lane early', sub: 'Drivers hunting for the airport and I-20 make late lane changes. Choose your lane early and hold it.' }, { t: 'merge', at: 0.28 }, { t: 'police', at: 0.5 }, { t: 'merge', at: 0.7 }, { t: 'vms', at: 0.12, text: 'USE  I-285  TO  BYPASS|DOWNTOWN' }],
  }),
  base({
    id: 'atl-i20-west', limit: 65, name: 'I-20 West to Douglasville', subtitle: 'I-20 W · Out past the Westside toward Carrollton country', roadName: 'I-20 WEST', region: 'westside', skyline: 'hills', lanes: 4, lengthM: 4600, tod: 'day', traffic: 0.75, trucks: 0.22, curves: 'rolling', trees: 'pine', walls: 'warehouse', par: 1500, place: 'Westside to Douglas County',
    guide: [
      sign(0.08, [I('20')], 'WEST', ['Birmingham'], { arrows: ['up'] }),
      sign(0.34, [I('20')], 'WEST', ['Birmingham'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '49', shields: [GA('70')], dests: ['Fulton Industrial Blvd'] },
      { at: 0.64, no: '44', shields: [GA('6')], dests: ['Thornton Rd', 'Lithia Springs'] },
      { at: 0.8, no: '41', dests: ['Lee Rd', 'Lithia Springs'] },
      { at: 0.95, no: '37', shields: [GA('92')], dests: ['Fairburn Rd', 'Douglasville'] },
    ],
    events: [{ t: 'tip', at: 0.1, title: 'Trucks everywhere', sub: 'Heavy trucks need far more room to stop. Do not cut in front of one.' }, { t: 'merge', at: 0.34 }, { t: 'police', at: 0.62 }],
    lessons: ['Trucks have big blind spots. If you cannot see the driver\'s mirror, they cannot see you.', 'Pass on the left, then return to the right lane.', 'Keep right except to pass is Georgia law.'],
  }),
  base({
    id: 'atl-i285-top-end', limit: 65, name: 'Top End Perimeter', subtitle: 'I-285 · Sandy Springs to Dunwoody under the office towers', roadName: 'I-285 EAST', region: 'perimeter', skyline: 'perimeter', lanes: 5, lengthM: 4400, tod: 'day', traffic: 1.05, trucks: 0.18, curves: 'gentle', par: 1650, place: 'Sandy Springs and Dunwoody',
    guide: [
      sign(0.06, [I('285')], 'EAST', ['Dunwoody', 'Chamblee'], { arrows: ['up'] }),
      sign(0.3, [I('285')], 'EAST', ['Dunwoody', 'Chamblee'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '27', shields: [GA('400')], dir: 'NORTH', dests: ['Alpharetta', 'Cumming'], also: [{ shields: [GA('400')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
      { at: 0.65, no: '29', dests: ['Ashford Dunwoody Rd', 'Dunwoody'] },
      { at: 0.88, no: '33', shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], also: [{ shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'The Top End', sub: 'The busiest stretch of I-285. Traffic joins from GA-400 and I-75, so expect weaving. Check your mirrors often.' }, { t: 'merge', at: 0.3 }, { t: 'merge', at: 0.58 }, { t: 'crash', at: 0.82 }],
  }),
  base({
    id: 'atl-i285-west', limit: 65, name: 'West Wall Perimeter', subtitle: 'I-285 N · Cobb Parkway to the Chattahoochee', roadName: 'I-285 NORTH', region: 'cobb', skyline: 'cobb', lanes: 4, lengthM: 4400, tod: 'day', traffic: 0.9, curves: 'rolling', trees: 'hardwood', par: 1500, place: 'Cobb County, west side',
    guide: [
      sign(0.07, [I('285')], 'NORTH', ['I-75', 'Chattanooga'], { arrows: ['up'] }),
      sign(0.3, [I('285')], 'NORTH', ['I-75', 'Chattanooga'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '15', shields: [GA('280')], dests: ['South Cobb Dr', 'Smyrna'] },
      { at: 0.64, no: '19', shields: [US('41')], dests: ['Cobb Pkwy', 'Dobbins ARB'] },
      { at: 0.8, no: '20', shields: [I('75')], dir: 'NORTH', dests: ['Chattanooga'], also: [{ shields: [I('75')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
      { at: 0.94, no: '22', dests: ['Northside Dr', 'Powers Ferry Rd'] },
    ],
    events: [{ t: 'work', at: 0.35, len: 520 }, { t: 'merge', at: 0.7 }, { t: 'tip', at: 0.5, title: 'Crossing the river', sub: 'Bridges ice first and wind pushes light cars. Hold the wheel steady.' }],
  }),
  base({
    id: 'atl-i285-airport', limit: 65, name: 'Airport Approach', subtitle: 'I-285 W · The busiest airport in the world next door', roadName: 'I-285 WEST', region: 'airport', skyline: 'airport', lanes: 5, lengthM: 4200, tod: 'dusk', traffic: 1.1, trucks: 0.2, curves: 'straight', trees: 'none', walls: 'warehouse', par: 1650, place: 'Hartsfield-Jackson',
    guide: [
      sign(0.06, [I('285')], 'WEST', ['Atlanta Airport'], { arrows: ['up'] }),
      sign(0.3, [I('285')], 'WEST', ['Atlanta Airport'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '58', shields: [I('75')], dir: 'SOUTH', dests: ['Macon'], also: [{ shields: [I('75')], dir: 'NORTH', dests: ['Atlanta'], arrows: ['upright'] }] },
      { at: 0.66, no: '60', shields: [GA('139')], dests: ['Riverdale Rd'] },
      { at: 0.86, no: '61', shields: [I('85')], dir: 'SOUTH', dests: ['Montgomery'], also: [{ shields: [I('85')], dir: 'NORTH', dests: ['Atlanta'], arrows: ['upright'] }] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'Airport traffic', sub: 'Rental cars and shuttles brake late. Keep a longer gap and watch the signs for the airport exits.' }, { t: 'vms', at: 0.1, text: 'AIRPORT  TRAFFIC|EXPECT  DELAYS' }, { t: 'merge', at: 0.4 }, { t: 'merge', at: 0.7 }, { t: 'police', at: 0.78 }],
  }),
  base({
    id: 'atl-i285-east', limit: 65, name: 'East Side Perimeter', subtitle: 'I-285 S · DeKalb County and the Stone Mountain Freeway', roadName: 'I-285 SOUTH', region: 'intown', skyline: 'suburb', lanes: 4, lengthM: 4300, tod: 'golden', traffic: 0.85, curves: 'gentle', trees: 'hardwood', walls: 'retail', par: 1500, place: 'DeKalb County',
    guide: [
      sign(0.07, [I('285')], 'SOUTH', ['I-20', 'Macon'], { arrows: ['up'] }),
      sign(0.3, [I('285')], 'SOUTH', ['I-20', 'Macon'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.5, no: '39', shields: [US('78')], dests: ['Stone Mountain Fwy', 'Athens'] },
      { at: 0.76, no: '43', shields: [US('278')], dests: ['Covington Hwy'] },
      { at: 0.94, no: '46', shields: [I('20')], dir: 'EAST', dests: ['Augusta'], also: [{ shields: [I('20')], dir: 'WEST', dests: ['Atlanta'], arrows: ['upright'] }] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'Stone Mountain Freeway', sub: 'US-78 splits off the Perimeter here. Read the green signs early, not at the gore.' }, { t: 'merge', at: 0.3 }, { t: 'crash', at: 0.55 }, { t: 'merge', at: 0.8 }],
  }),
  base({
    id: 'atl-i75-cobb', limit: 65, name: 'I-75 to Marietta', subtitle: 'I-75 N · Cobb County and the Chattahoochee bridge', roadName: 'I-75 NORTH', region: 'cobb', skyline: 'cobb', lanes: 4, lengthM: 4600, tod: 'day', traffic: 0.95, curves: 'rolling', trees: 'pine', walls: 'retail', par: 1550, place: 'Cobb Parkway corridor',
    guide: [
      sign(0.07, [I('75')], 'NORTH', ['Marietta', 'Chattanooga'], { arrows: ['up'] }),
      sign(0.3, [I('75')], 'NORTH', ['Marietta', 'Chattanooga'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '260', dests: ['Windy Hill Rd', 'Smyrna'] },
      { at: 0.64, no: '263', shields: [GA('120')], dests: ['Marietta', 'Roswell'] },
      { at: 0.8, no: '268', shields: [I('575')], dir: 'NORTH', dests: ['Canton', 'Ball Ground'] },
      { at: 0.94, no: '269', shields: [GA('5')], dests: ['Barrett Pkwy', 'Kennesaw'] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'Chattahoochee bridge', sub: 'The river bridge leaves no room to swerve. Hold your lane and keep your space.' }, { t: 'merge', at: 0.28 }, { t: 'work', at: 0.5, len: 600 }, { t: 'merge', at: 0.78 }],
  }),
  base({
    id: 'atl-i75-henry', limit: 65, name: 'I-75 South to McDonough', subtitle: 'I-75 S · Clayton and Henry counties', roadName: 'I-75 SOUTH', region: 'henry', skyline: 'hills', lanes: 4, lengthM: 4800, tod: 'day', traffic: 0.7, trucks: 0.25, curves: 'gentle', trees: 'pine', walls: 'warehouse', par: 1450, place: 'Henry County',
    guide: [
      sign(0.08, [I('75')], 'SOUTH', ['Macon'], { arrows: ['up'] }),
      sign(0.4, [I('75')], 'SOUTH', ['Macon'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.5, no: '224', dests: ['Hudson Bridge Rd', 'Eagles Landing Pkwy'] },
      { at: 0.72, no: '221', dests: ['Jonesboro Rd', 'Lovejoy'] },
      { at: 0.93, no: '218', shields: [GA('20'), GA('81')], dests: ['McDonough', 'Hampton'] },
    ],
    events: [{ t: 'police', at: 0.4 }, { t: 'merge', at: 0.45 }, { t: 'tip', at: 0.65, title: 'Open road, big trucks', sub: 'Trucks may drift at the edge of their lane. Give them space.' }],
  }),
  base({
    id: 'atl-i85-gwinnett', limit: 65, name: 'I-85 North to Gwinnett', subtitle: 'I-85 N · Doraville, Norcross and Duluth', roadName: 'I-85 NORTH', region: 'gwinnett', skyline: 'suburb', lanes: 5, lengthM: 4600, tod: 'golden', traffic: 1.0, curves: 'gentle', trees: 'mixed', walls: 'retail', par: 1650, place: 'Gwinnett County',
    guide: [
      sign(0.06, [I('85')], 'NORTH', ['Greenville'], { arrows: ['up'] }),
      sign(0.3, [I('85')], 'NORTH', ['Greenville'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.5, no: '104', dests: ['Pleasant Hill Rd', 'Gwinnett Place'] },
      { at: 0.7, no: '106', shields: [GA('316')], dir: 'EAST', dests: ['Lawrenceville', 'Athens'] },
      { at: 0.9, no: '108', dests: ['Sugarloaf Pkwy'] },
    ],
    events: [{ t: 'tip', at: 0.12, title: 'Express lanes', sub: 'The toll lane in the median needs a Peach Pass. Stay in the regular lanes.' }, { t: 'merge', at: 0.38 }, { t: 'merge', at: 0.7 }],
    lessons: ['The median toll lanes are for Peach Pass users. Never cross the double white lines to enter or leave them.', 'Gwinnett traffic compresses fast. Watch brake lights two cars ahead.', 'Keep right except to pass. Move over for faster traffic.'],
  }),
  base({
    id: 'atl-i20-east', limit: 55, name: 'I-20 East to Stone Mountain', subtitle: 'I-20 E · Past the Capitol, toward the granite dome', roadName: 'I-20 EAST', region: 'stonemtn', skyline: 'stonemtn', lanes: 4, lengthM: 4500, tod: 'dusk', traffic: 0.85, curves: 'rolling', trees: 'hardwood', walls: 'houses', par: 1500, place: 'East Atlanta and DeKalb',
    guide: [
      sign(0.07, [I('20')], 'EAST', ['Augusta'], { arrows: ['up'] }),
      sign(0.3, [I('20')], 'EAST', ['Augusta'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '60', shields: [US('23')], dests: ['Moreland Ave'] },
      { at: 0.64, no: '65', shields: [GA('155')], dests: ['Candler Rd', 'Decatur'] },
      { at: 0.8, no: '67', shields: [I('285')], dir: 'NORTH', dests: ['Greenville'], also: [{ shields: [I('285')], dir: 'SOUTH', dests: ['Macon', 'Atlanta Airport'], arrows: ['upright'] }] },
      { at: 0.95, no: '74', dests: ['Evans Mill Rd', 'Lithonia'] },
    ],
    events: [{ t: 'merge', at: 0.33 }, { t: 'crash', at: 0.6 }, { t: 'tip', at: 0.82, title: 'Stone Mountain ahead', sub: 'Big and bare, you can see it for miles. Keep your eyes on the road, though.' }],
  }),
  base({
    id: 'atl-ga400', name: 'GA-400 to Alpharetta', subtitle: 'GA-400 N · Buckhead to Roswell, toll free', roadName: 'GA-400 NORTH', region: 'buckhead', skyline: 'buckhead', lanes: 4, lengthM: 4400, tod: 'day', limit: 65, maxSpeed: 82, traffic: 0.95, curves: 'rolling', trees: 'hardwood', walls: 'glass', par: 1500, place: 'Buckhead and North Fulton',
    guide: [
      sign(0.07, [GA('400')], 'NORTH', ['Alpharetta', 'Cumming'], { arrows: ['up'] }),
      sign(0.3, [GA('400')], 'NORTH', ['Alpharetta', 'Cumming'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '2', shields: [GA('141')], dests: ['Lenox Rd', 'Buckhead'] },
      { at: 0.6, no: '4', shields: [I('285')], dir: 'EAST', dests: ['Greenville'], also: [{ shields: [I('285')], dir: 'WEST', dests: ['Chattanooga'], arrows: ['upright'] }] },
      { at: 0.76, no: '5', dests: ['Abernathy Rd', 'Dunwoody'] },
      { at: 0.92, no: '7', shields: [GA('140')], dests: ['Holcomb Bridge Rd', 'Roswell'] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'GA-400', sub: 'The toll booth is long gone, but merges come fast around Buckhead. Signal early and match speed.' }, { t: 'merge', at: 0.36 }, { t: 'police', at: 0.58 }, { t: 'merge', at: 0.78 }],
  }),
  base({
    id: 'atl-rush-hour', limit: 55, name: 'Connector Rush Hour', subtitle: 'I-75/85 · Stop and go at 5 pm. Stay calm', roadName: 'I-75/85 NORTH', region: 'midtown', skyline: 'midtown', lanes: 5, lengthM: 3400, tod: 'dusk', traffic: 1.5, flow: 0.45, trucks: 0.1, curves: 'rolling', par: 1600, place: 'Midtown Atlanta', isRush: true,
    guide: [
      sign(0.1, [I('75'), I('85')], 'NORTH', ['Chattanooga', 'Greenville'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.42, no: '249D', shields: [US('19'), US('29')], dests: ['Spring St', 'West Peachtree St'] },
      { at: 0.62, no: '250', dests: ['10th St', '14th St', 'Georgia Tech'] },
      { at: 0.95, kind: 'fork', no: '251B', shields: [I('75')], dir: 'NORTH', dests: ['Marietta', 'Chattanooga'], also: [{ shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], arrows: ['upright'] }], to: 'free-i85n', toLeft: 'free-i75n', name: 'I-75 NORTH · Marietta' },
    ],
    events: [{ t: 'vms', at: 0.05, text: 'HEAVY  TRAFFIC|EXPECT  DELAYS' }, { t: 'merge', at: 0.3 }, { t: 'tip', at: 0.5, title: 'Stop-and-go', sub: 'Do not tailgate. Roll, do not stab the brakes.' }],
    lessons: ['In slow traffic, keep a full car length at a stop so you can steer around.', 'Keep your eyes moving: mirrors, brake lights, signs.', 'Do not weave. You will not get there faster.'],
  }),
  base({
    id: 'atl-night-285', limit: 65, name: 'Night Run on the Perimeter', subtitle: 'I-285 · Lights glowing, trucks hauling, eyes open', roadName: 'I-285 NORTH', region: 'perimeter', skyline: 'perimeter', lanes: 4, lengthM: 4400, tod: 'night', traffic: 0.8, trucks: 0.3, curves: 'gentle', par: 1500, place: 'Sandy Springs, after dark',
    guide: [
      sign(0.07, [I('285')], 'NORTH', ['I-75', 'Chattanooga'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.5, no: '19', shields: [US('41')], dests: ['Cobb Pkwy', 'Smyrna'] },
      { at: 0.75, no: '20', shields: [I('75')], dir: 'NORTH', dests: ['Chattanooga'], also: [{ shields: [I('75')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
      { at: 0.93, no: '22', dests: ['Northside Dr', 'Powers Ferry Rd'] },
    ],
    events: [{ t: 'tip', at: 0.08, title: 'Night driving', sub: 'Headlights on. Do not outdrive them: slow down so you can stop in the light you see.' }, { t: 'police', at: 0.5 }, { t: 'crash', at: 0.75 }],
    lessons: ['Dim your high beams for cars ahead and behind.', 'Look to the right edge of the lane when oncoming lights glare.', 'Tired? Take the next exit and rest.'],
  }),
  base({
    id: 'atl-sunset-20', limit: 55, name: 'Sunset on I-20', subtitle: 'I-20 W · Glare, long shadows and a golden skyline', roadName: 'I-20 WEST', region: 'westside', skyline: 'downtown', lanes: 4, lengthM: 4300, tod: 'dusk', traffic: 0.8, curves: 'rolling', par: 1450, place: 'West of the Connector',
    guide: [
      sign(0.07, [I('20')], 'WEST', ['Birmingham'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.46, no: '53', shields: [GA('139')], dests: ['MLK Jr Dr'] },
      { at: 0.64, no: '52', shields: [GA('280')], dests: ['Hamilton E Holmes Dr'] },
      { at: 0.84, no: '51', shields: [I('285')], dir: 'SOUTH', dests: ['Macon'], also: [{ shields: [I('285')], dir: 'NORTH', dests: ['Chattanooga'], arrows: ['upright'] }] },
    ],
    events: [{ t: 'tip', at: 0.1, title: 'Sun glare', sub: 'Sun visor down, sunglasses on, and slow a touch.' }, { t: 'merge', at: 0.5 }],
  }),
  base({
    id: 'atl-storm-connector', limit: 55, name: 'Storm Over the Connector', subtitle: 'I-75/85 S · Thunder, wipers, hydroplaning risk', roadName: 'I-75/85 SOUTH', region: 'downtown', skyline: 'downtown', lanes: 5, lengthM: 3800, tod: 'dusk', weather: 'storm', traffic: 0.8, flow: 0.8, curves: 'rolling', par: 1500, place: 'Downtown Atlanta, stormy',
    guide: [
      sign(0.08, [I('75'), I('85')], 'SOUTH', ['Macon', 'Montgomery'], { arrows: ['up'] }),
      sign(0.45, [I('20')], undefined, ['Augusta', 'Birmingham'], { tab: 'EXIT 247', dist: '1 MILE', also: [{ dests: ['Fulton St', 'Central Ave', 'Ga State Univ'], tab: 'EXIT 246', dist: '3/4 MILE' }, { dests: ['Abernathy Blvd', 'Capitol Ave', 'Turner Field'], tab: 'EXIT 245', dist: '1/4 MILE' }] }),
    ],
    exits: [
      { at: 0.55, no: '247', shields: [I('20')], dests: ['Augusta', 'Birmingham'], quiet: true },
      { at: 0.65, no: '246', dests: ['Fulton St', 'Central Ave', 'Ga State Univ'], quiet: true },
      { at: 0.75, no: '245', dests: ['Abernathy Blvd', 'Capitol Ave', 'Turner Field'], quiet: true },
      { at: 0.9, no: '243', shields: [GA('166')], dests: ['Langford Pkwy', 'East Point'] },
    ],
    events: [{ t: 'vms', at: 0.05, text: 'FLASH  FLOOD  WARNING|SLOW  DOWN' }, { t: 'tip', at: 0.18, title: 'Hydroplaning', sub: 'Ease off the gas. Do not slam the brakes in standing water.' }, { t: 'crash', at: 0.62 }],
    lessons: ['In heavy rain slow 5 to 10 mph below the limit. Georgia drivers are allowed to.', 'Headlights on in rain. It is Georgia law with wipers.', 'Skip cruise control on wet roads.'],
  }),
  base({
    id: 'atl-work-zone', limit: 65, name: 'Work Zone on I-75', subtitle: 'I-75 S · Lane closures, cones and doubled fines', roadName: 'I-75 SOUTH', region: 'henry', skyline: 'suburb', lanes: 4, lengthM: 4000, tod: 'day', traffic: 0.8, curves: 'gentle', walls: 'warehouse', par: 1450, place: 'Henry County',
    guide: [
      sign(0.06, [I('75')], 'SOUTH', ['Macon'], { arrows: ['up'] }),
      sign(0.3, undefined, undefined, ['Road Work', '1 Mile'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.55, no: '224', dests: ['Hudson Bridge Rd', 'Eagles Landing Pkwy'] },
      { at: 0.82, no: '221', dests: ['Jonesboro Rd', 'Lovejoy'] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'Georgia work zones', sub: 'Fines are doubled where crews are working. Slow down, merge early and never tailgate.' }, { t: 'work', at: 0.3, len: 700 }, { t: 'work', at: 0.7, len: 500 }, { t: 'merge', at: 0.5 }],
    lessons: ['Fines are doubled in work zones in Georgia. The workers are real people.', 'Merge early. Do not wait for the cones.', 'Watch for sudden stops. Look over the car ahead.'],
  }),
  base({
    id: 'atl-move-over', limit: 65, name: 'Move Over Law', subtitle: 'I-285 · Police and tow trucks on the shoulder', roadName: 'I-285 EAST', region: 'perimeter', skyline: 'perimeter', lanes: 4, lengthM: 4000, tod: 'day', traffic: 0.7, curves: 'gentle', par: 1450, place: 'North Atlanta',
    guide: [
      sign(0.06, [I('285')], 'EAST', ['Dunwoody', 'Chamblee'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.55, no: '27', shields: [GA('400')], dir: 'NORTH', dests: ['Alpharetta', 'Cumming'], also: [{ shields: [GA('400')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
      { at: 0.88, no: '33', shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], also: [{ shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'Move Over, Georgia', sub: 'Change lanes if you can, or slow down, for stopped police, tow and highway-help trucks.' }, { t: 'police', at: 0.2 }, { t: 'police', at: 0.45 }, { t: 'crash', at: 0.62 }, { t: 'police', at: 0.82 }],
    lessons: ['Georgia law: move over one lane for emergency vehicles on the shoulder, or slow down if you cannot.', 'Signal first, check the mirror, then move.', 'Slow to 20 under the limit if you cannot change lanes.'],
  }),
  base({
    id: 'atl-fog-i20', limit: 65, name: 'Foggy Morning on I-20', subtitle: 'I-20 W · Valley fog near the Chattahoochee', roadName: 'I-20 WEST', region: 'douglasville', skyline: 'hills', lanes: 3, lengthM: 3800, tod: 'day', weather: 'fog', traffic: 0.55, flow: 0.8, curves: 'gentle', trees: 'pine', par: 1400, place: 'Douglas County',
    guide: [
      sign(0.1, [I('20')], 'WEST', ['Birmingham'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.5, no: '44', shields: [GA('6')], dests: ['Thornton Rd', 'Lithia Springs'] },
      { at: 0.8, no: '41', dests: ['Lee Rd', 'Lithia Springs'] },
    ],
    events: [{ t: 'tip', at: 0.18, title: 'Valley fog', sub: 'Fog settles low near the river. Use low beams, never high beams, and slow down.' }, { t: 'vms', at: 0.05, text: 'DENSE  FOG|SLOW  DOWN  LOW  BEAMS' }, { t: 'crash', at: 0.55 }],
    lessons: ['Low beams in fog, never high beams. They bounce back at you.', 'Slow down enough to stop within what you can see.', 'Use the white edge line to stay on the road.'],
  }),

  // ---- Carrollton and the west side ---
  base({
    id: 'atl-carrollton-square', name: 'Downtown Carrollton', subtitle: '30117 · Adamson Square, Maple Street and Newnan Street', roadName: 'MAPLE ST', road: 'local', region: 'carrollton', skyline: 'carrollton', lanes: 1, lengthM: 2400, limit: 25, maxSpeed: 40, tod: 'day', traffic: 0.5, trucks: 0.04, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'brick', par: 1000, place: 'Carrollton, Georgia',
    guide: [sign(0.1, undefined, undefined, ['Adamson Square', 'Downtown'], { arrows: ['up'] }), sign(0.5, [US('27')], undefined, ['Newnan St', 'Villa Rica'], { arrows: ['right'] }), sign(0.82, [GA('61')], undefined, ['Villa Rica', 'University of West Georgia'], { arrows: ['up'] })],
    events: [{ t: 'ped', at: 0.18 }, { t: 'stop', at: 0.32 }, { t: 'rail', at: 0.48, train: true, gates: true, name: 'Dixie St' }, { t: 'ped', at: 0.62 }, { t: 'light', at: 0.78 }, { t: 'tip', at: 0.05, title: 'Carrollton, 30117', sub: 'Green Belt, brick storefronts, and the Adamson Square courthouse.' }],
    lessons: ['A full stop at a stop sign means the wheels stop moving.', 'Pedestrians in a crosswalk have the right of way.', 'At a railroad crossing with flashing lights, stop at least 15 feet back.'],
  }),
  base({
    id: 'atl-carrollton-circle', name: 'Maple Street Roundabout', subtitle: '30117 · Yield, look left, then go', roadName: 'MAPLE ST', road: 'local', region: 'carrollton', skyline: 'carrollton', lanes: 1, lengthM: 2200, limit: 30, maxSpeed: 45, tod: 'golden', traffic: 0.5, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'houses', par: 1000, place: 'Carrollton, Georgia',
    guide: [sign(0.14, undefined, undefined, ['Roundabout ahead'], { arrows: ['up'] }), sign(0.55, [GA('166')], undefined, ['Bankhead Hwy', 'Lovvorn Rd'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.07, title: 'Yield at the entry', sub: 'Traffic already in the circle goes first. Look left, enter when clear, signal your exit.' }, { t: 'circle', at: 0.3 }, { t: 'ped', at: 0.45 }, { t: 'circle', at: 0.7 }],
    lessons: ['Slow down, look left, yield to traffic already in the circle.', 'Never stop inside a roundabout.', 'Signal right when you leave.'],
  }),
  base({
    id: 'atl-us27-carrollton', name: 'US-27 to Carrollton', subtitle: 'US-27 · Rolling farmland and pines toward town', roadName: 'US-27 SOUTH', road: 'rural', region: 'rural', skyline: 'hills', lanes: 1, lengthM: 3200, limit: 55, maxSpeed: 70, tod: 'day', traffic: 0.45, trucks: 0.14, flow: 0.95, curves: 'winding', trees: 'pine', walls: 'houses', par: 1200, place: 'Carroll County',
    guide: [sign(0.08, [US('27')], 'SOUTH', ['Carrollton', 'Newnan'], { arrows: ['up'] }), sign(0.52, [GA('113')], undefined, ['Carrollton'], { arrows: ['upright'] }), sign(0.85, undefined, undefined, ['Carrollton 3', 'Villa Rica'], { arrows: ['up'] })],
    events: [{ t: 'rail', at: 0.4, train: false, gates: false }, { t: 'school', at: 0.62, len: 300 }, { t: 'tip', at: 0.08, title: 'Two-lane road', sub: 'No center line crossing. A solid yellow means no passing.' }],
    lessons: ['Solid yellow on your side means do not pass.', 'Slow for curves; the posted speed is a maximum.', 'Deer are active at dusk. Scan the ditches.'],
  }),
  base({
    id: 'atl-bankhead-hwy', name: 'Bankhead Highway', subtitle: 'US-78 · Four lanes of Georgia strip road', roadName: 'BANKHEAD HWY', road: 'arterial', region: 'carrollton', skyline: 'carrollton', lanes: 2, lengthM: 3000, limit: 45, maxSpeed: 62, tod: 'day', traffic: 0.7, flow: 0.95, curves: 'gentle', trees: 'mixed', walls: 'retail', par: 1200, place: 'Carrollton to Villa Rica',
    guide: [sign(0.1, [US('78')], undefined, ['Bankhead Hwy', 'Villa Rica'], { arrows: ['up'] }), sign(0.5, [GA('61')], undefined, ['Villa Rica', 'Carrollton'], { arrows: ['upright'] }), sign(0.8, [GA('8')], undefined, ['Douglasville', 'Temple'], { arrows: ['up'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Bankhead Highway', sub: 'One of the first paved cross-country routes. Today it is full of driveways, so watch for turning cars.' }, { t: 'light', at: 0.2 }, { t: 'light', at: 0.45 }, { t: 'rail', at: 0.62, train: true, gates: true, name: 'Bankhead' }, { t: 'light', at: 0.85 }],
    lessons: ['Yellow means stop if you safely can.', 'Watch for cars turning into driveways.', 'Left lane on a four-lane road is for passing.'],
  }),
  base({
    id: 'atl-villa-rica', name: 'Villa Rica Backroads', subtitle: 'GA-61 · Curvy two-lane through Carroll County pines', roadName: 'GA-61', road: 'rural', region: 'villarica', skyline: 'hills', lanes: 1, lengthM: 3000, limit: 45, maxSpeed: 62, tod: 'golden', traffic: 0.4, trucks: 0.1, flow: 0.95, curves: 'winding', trees: 'pine', walls: 'houses', par: 1150, place: 'Villa Rica, Georgia',
    guide: [sign(0.1, [GA('61')], 'NORTH', ['Villa Rica'], { arrows: ['up'] }), sign(0.6, [US('78')], undefined, ['Bankhead Hwy'], { arrows: ['upright'] })],
    events: [{ t: 'rail', at: 0.42, train: true, gates: true, name: 'Villa Rica' }, { t: 'tip', at: 0.1, title: 'Curves ahead', sub: 'Yellow signs suggest a safe speed. Believe them.' }],
  }),
  base({
    id: 'atl-douglasville', name: 'Chapel Hill Road', subtitle: 'Douglasville · Railroad crossings and four lanes', roadName: 'CHAPEL HILL RD', road: 'arterial', region: 'douglasville', skyline: 'suburb', lanes: 2, lengthM: 2800, limit: 40, maxSpeed: 58, tod: 'day', traffic: 0.75, flow: 0.95, curves: 'gentle', trees: 'mixed', walls: 'retail', par: 1200, place: 'Douglasville, Georgia',
    guide: [sign(0.1, [GA('5')], undefined, ['Douglasville', 'Dallas'], { arrows: ['up'] }), sign(0.55, [I('20')], 'EAST', ['Atlanta'], { arrows: ['upright'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Railroad crossings', sub: 'Stop at least 15 feet from the nearest rail. Never change lanes or stop on the tracks.' }, { t: 'light', at: 0.2 }, { t: 'rail', at: 0.38, train: true, gates: true, name: 'Chapel Hill' }, { t: 'ped', at: 0.58 }, { t: 'light', at: 0.74 }, { t: 'circle', at: 0.88 }],
  }),
  base({
    id: 'atl-peachtree-street', name: 'Peachtree Street', subtitle: 'Midtown · Stoplights, buses and Georgia Tech students', roadName: 'PEACHTREE ST', road: 'arterial', region: 'midtown', skyline: 'midtown', lanes: 2, lengthM: 2600, limit: 35, maxSpeed: 52, tod: 'dusk', traffic: 0.85, flow: 0.9, curves: 'straight', trees: 'hardwood', walls: 'glass', par: 1150, place: 'Midtown Atlanta',
    guide: [sign(0.1, undefined, undefined, ['Peachtree St', 'Midtown'], { arrows: ['up'] }), sign(0.5, undefined, undefined, ['10th Street', 'Piedmont Park'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Midtown crosswalks', sub: 'Buses, students and scooters. Stop for people in the crosswalk and stay stopped until they clear.' }, { t: 'light', at: 0.14 }, { t: 'ped', at: 0.25 }, { t: 'light', at: 0.42 }, { t: 'ped', at: 0.58 }, { t: 'light', at: 0.74 }, { t: 'stop', at: 0.9 }],
    lessons: ['Look both ways even on green. Red-light runners exist.', 'Scooter riders and walkers share Midtown. Slow down.', 'Do not block the box: stay out of an intersection you cannot clear.'],
  }),
  base({
    id: 'atl-buckhead', name: 'Roswell Road, Buckhead', subtitle: 'Buckhead · Busy lanes, valets and rain-slicked brick', roadName: 'ROSWELL RD', road: 'arterial', region: 'buckhead', skyline: 'buckhead', lanes: 2, lengthM: 2600, limit: 35, maxSpeed: 52, tod: 'night', traffic: 0.9, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'glass', par: 1200, place: 'Buckhead',
    guide: [sign(0.1, undefined, undefined, ['Roswell Rd', 'Buckhead'], { arrows: ['up'] }), sign(0.55, undefined, undefined, ['Peachtree Rd', 'Lenox'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Wet brick', sub: 'Rain on brick pavers is slick. Brake early and gently, and give valets room.' }, { t: 'light', at: 0.18 }, { t: 'ped', at: 0.3 }, { t: 'light', at: 0.5 }, { t: 'ped', at: 0.66 }, { t: 'light', at: 0.84 }],
  }),
  base({
    id: 'atl-ponce', name: 'Ponce de Leon Avenue', subtitle: 'Decatur · Rail crossing and the city streets', roadName: 'PONCE DE LEON AVE', road: 'arterial', region: 'intown', skyline: 'suburb', lanes: 2, lengthM: 2700, limit: 35, maxSpeed: 52, tod: 'golden', traffic: 0.8, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'brick', par: 1200, place: 'Decatur, Georgia',
    guide: [sign(0.1, [US('278')], undefined, ['Decatur', 'Ponce de Leon'], { arrows: ['up'] }), sign(0.55, [GA('155')], undefined, ['Clairmont Rd'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Decatur buses', sub: 'MARTA buses stop often. Expect brake lights and watch for people stepping off.' }, { t: 'light', at: 0.16 }, { t: 'rail', at: 0.36, train: true, gates: true, name: 'Ponce' }, { t: 'ped', at: 0.54 }, { t: 'circle', at: 0.72 }, { t: 'light', at: 0.88 }],
  }),
  base({
    id: 'atl-marietta-square', name: 'Marietta Square', subtitle: 'Marietta · Train tracks, circles and Cobb charm', roadName: 'ROSWELL ST', road: 'local', region: 'cobb', skyline: 'cobb', lanes: 1, lengthM: 2300, limit: 25, maxSpeed: 40, tod: 'day', traffic: 0.55, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'brick', par: 1000, place: 'Marietta, Georgia',
    guide: [sign(0.1, undefined, undefined, ['Marietta Square'], { arrows: ['up'] }), sign(0.6, [US('41')], undefined, ['Cobb Pkwy'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Marietta Square', sub: 'Train tracks, circles and angle parking. Slow down, look twice, yield in the circle.' }, { t: 'circle', at: 0.2 }, { t: 'ped', at: 0.34 }, { t: 'rail', at: 0.5, train: true, gates: true, name: 'Square' }, { t: 'stop', at: 0.7 }, { t: 'school', at: 0.82, len: 220 }],
  }),
  base({
    id: 'atl-stone-mountain', name: 'Stone Mountain Highway', subtitle: 'US-78 · School zones and the granite dome', roadName: 'STONE MOUNTAIN HWY', road: 'arterial', region: 'stonemtn', skyline: 'stonemtn', lanes: 2, lengthM: 2800, limit: 45, maxSpeed: 62, tod: 'day', traffic: 0.7, flow: 0.95, curves: 'rolling', trees: 'pine', walls: 'retail', par: 1200, place: 'Stone Mountain, Georgia',
    guide: [sign(0.1, [US('78')], undefined, ['Stone Mountain', 'Snellville'], { arrows: ['up'] }), sign(0.6, [GA('10')], undefined, ['Memorial Dr'], { arrows: ['upright'] })],
    events: [{ t: 'tip', at: 0.07, title: 'School zones', sub: 'The lower limit applies when the lights flash or children are present. Slow down early.' }, { t: 'school', at: 0.25, len: 300 }, { t: 'light', at: 0.5 }, { t: 'rail', at: 0.66, train: false, gates: false }, { t: 'ped', at: 0.82 }],
  }),
  base({
    id: 'atl-airport-camp-creek', name: 'Camp Creek Parkway', subtitle: 'College Park · Hotels, shuttles and a rail line', roadName: 'CAMP CREEK PKWY', road: 'arterial', region: 'airport', skyline: 'airport', lanes: 2, lengthM: 2700, limit: 45, maxSpeed: 62, tod: 'dusk', traffic: 0.9, flow: 0.95, curves: 'straight', trees: 'none', walls: 'retail', par: 1200, place: 'College Park',
    guide: [sign(0.1, [GA('6')], undefined, ['Camp Creek Pkwy', 'Airport'], { arrows: ['up'] }), sign(0.6, [I('285')], undefined, ['Airport', 'Macon'], { arrows: ['upright'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Hotels and shuttles', sub: 'Shuttles stop without warning. Keep your gap and cover the brake near driveways.' }, { t: 'light', at: 0.18 }, { t: 'rail', at: 0.4, train: true, gates: true, name: 'Camp Creek' }, { t: 'ped', at: 0.6 }, { t: 'light', at: 0.8 }],
  }),
  // ---- added for the learning path ---
  base({
    id: 'atl-first-drive', name: 'First Drive: Hays Mill Road', subtitle: '30117 · Quiet streets, your first stop sign', roadName: 'HAYS MILL RD', road: 'local', region: 'carrollton', skyline: 'carrollton', lanes: 1, lengthM: 1500, limit: 25, maxSpeed: 35, tod: 'day', traffic: 0.15, trucks: 0, flow: 0.85, curves: 'straight', trees: 'hardwood', walls: 'houses', par: 700, place: 'Carrollton, Georgia',
    guide: [sign(0.3, undefined, undefined, ['Hays Mill Rd'], { arrows: ['up'] }), sign(0.72, undefined, undefined, ['Downtown Carrollton'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.04, title: 'Your first drive', sub: 'Hands at 9 and 3. Ease the gas, stay right of the yellow line.' }, { t: 'stop', at: 0.42 }, { t: 'ped', at: 0.72 }],
    lessons: ['Look where you want to go. The car follows your eyes.', 'Ease onto the gas and ease onto the brake.', 'Stay inside the lane and a little right of center.'],
  }),
  base({
    id: 'atl-lovvorn', name: 'Neighborhood Streets: Lovvorn Road', subtitle: '30117 · School zone, stop signs and a light', roadName: 'LOVVORN RD', road: 'local', region: 'carrollton', skyline: 'carrollton', lanes: 1, lengthM: 1900, limit: 30, maxSpeed: 42, tod: 'day', traffic: 0.3, trucks: 0.02, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'houses', par: 850, place: 'Carrollton, Georgia',
    guide: [sign(0.25, undefined, undefined, ['Lovvorn Rd'], { arrows: ['up'] }), sign(0.65, [GA('166')], undefined, ['Bankhead Hwy'], { arrows: ['right'] })],
    events: [{ t: 'tip', at: 0.18, title: 'Neighborhood streets', sub: 'Kids and bikes appear fast. Stay at or under the limit and cover the brake at driveways.' }, { t: 'stop', at: 0.2 }, { t: 'school', at: 0.4, len: 220 }, { t: 'ped', at: 0.62 }, { t: 'light', at: 0.82 }],
    lessons: ['School zone: 25 while the lights flash. Children can appear from anywhere.', 'Stop before the white line, not on it.', 'A yellow light means stop if you safely can.'],
  }),
  base({
    id: 'atl-onramp-i20', limit: 65, startRamp: true, name: 'On-Ramp and Merge', subtitle: 'I-20 W · Speed up on the ramp, then blend in', roadName: 'I-20 WEST', region: 'westside', skyline: 'hills', lanes: 3, lengthM: 3000, tod: 'day', traffic: 0.4, trucks: 0.1, flow: 0.98, curves: 'gentle', trees: 'pine', par: 1100, place: 'West Atlanta',
    guide: [
      sign(0.1, [I('20')], 'WEST', ['Birmingham'], { arrows: ['up'] }),
      sign(0.5, [I('20')], 'WEST', ['Birmingham'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.84, no: '49', shields: [GA('70')], dests: ['Fulton Industrial Blvd'] },
    ],
    events: [{ t: 'tip', at: 0.04, title: 'Merging', sub: 'Match the speed of traffic on the ramp, signal, check your mirror, then slide in.' }, { t: 'merge', at: 0.2 }, { t: 'merge', at: 0.45 }, { t: 'merge', at: 0.7 }],
    lessons: ['Use the whole ramp to match highway speed.', 'Never stop on a ramp unless traffic forces you.', 'Signal early and find a gap, do not force one.'],
  }),
  base({
    id: 'atl-rain-ponce', name: 'Ponce in the Rain', subtitle: 'Decatur · Wet brick, slick rails and long stops', roadName: 'PONCE DE LEON AVE', road: 'arterial', region: 'intown', skyline: 'suburb', lanes: 2, lengthM: 2600, limit: 35, maxSpeed: 52, tod: 'dusk', weather: 'rain', traffic: 0.7, flow: 0.9, curves: 'gentle', trees: 'hardwood', walls: 'brick', par: 1200, place: 'Decatur, Georgia, rainy',
    guide: [sign(0.2, undefined, undefined, ['Decatur', 'Clairmont Rd'], { arrows: ['up'] }), sign(0.6, [US('78')], undefined, ['Stone Mountain'], { arrows: ['up'] })],
    events: [{ t: 'tip', at: 0.04, title: 'Wet roads', sub: 'Double your following distance. Brake early and gently, especially on rails.' }, { t: 'light', at: 0.2 }, { t: 'rail', at: 0.4, train: true, gates: true, name: 'Ponce' }, { t: 'ped', at: 0.6 }, { t: 'light', at: 0.82 }],
    lessons: ['Wet roads double stopping distance.', 'Painted lines and steel rails are slick in rain.', 'Headlights on whenever wipers are on.'],
  }),
  base({
    id: 'atl-fog-villa-rica', name: 'Foggy Backroads: Villa Rica', subtitle: 'GA-61 · Low beams and slow curves', roadName: 'GA-61', road: 'rural', region: 'villarica', skyline: 'hills', lanes: 1, lengthM: 2800, limit: 45, maxSpeed: 62, tod: 'day', weather: 'fog', traffic: 0.3, trucks: 0.08, flow: 0.85, curves: 'winding', trees: 'pine', walls: 'houses', par: 1150, place: 'Villa Rica, Georgia, foggy',
    guide: [sign(0.2, [GA('61')], undefined, ['Villa Rica', 'Carrollton'], { arrows: ['up'] })],
    events: [{ t: 'tip', at: 0.05, title: 'Fog', sub: 'Low beams, slow down and use the right edge line as your guide.' }, { t: 'rail', at: 0.5, train: false, gates: false }],
    lessons: ['Never use high beams in fog.', 'Slow until you can stop inside what you can see.', 'Do not stop on the road. Pull completely off.'],
  }),
  base({
    id: 'atl-snow-285', limit: 65, name: 'Rare Snow Day on I-285', subtitle: 'I-285 · Georgia roads when the flakes fall', roadName: 'I-285 EAST', region: 'perimeter', skyline: 'perimeter', lanes: 4, lengthM: 3600, tod: 'day', weather: 'snow', traffic: 0.45, flow: 0.6, trucks: 0.08, curves: 'gentle', par: 1400, place: 'North Atlanta, snowy',
    guide: [
      sign(0.08, [I('285')], 'EAST', ['Dunwoody', 'Chamblee'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.6, no: '33', shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], also: [{ shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['upright'] }] },
    ],
    events: [{ t: 'vms', at: 0.04, text: 'ICY  ROADS|BRIDGES  FREEZE  FIRST' }, { t: 'tip', at: 0.15, title: 'Snow and ice', sub: 'Smooth inputs only. Triple your following distance. Bridges freeze first.' }, { t: 'crash', at: 0.6 }],
    lessons: ['Triple your following distance on ice.', 'If it is not safe, stay home. Georgia roads are not ready for snow.', 'Brake gently. Steer gently. Do everything slowly.'],
  }),
  base({
    id: 'atl-master-storm', limit: 55, name: 'Master Class: Night Storm Rush', subtitle: 'I-75/85 · Everything at once. The final exam', roadName: 'I-75/85 NORTH', region: 'midtown', skyline: 'midtown', lanes: 5, lengthM: 5200, tod: 'night', weather: 'storm', traffic: 1.35, flow: 0.55, trucks: 0.2, curves: 'rolling', par: 2000, place: 'Atlanta, midnight storm',
    guide: [
      sign(0.08, [I('75'), I('85')], 'NORTH', ['Chattanooga', 'Greenville'], { arrows: ['up'] }),
    ],
    exits: [
      { at: 0.36, no: '249D', shields: [US('19'), US('29')], dests: ['Spring St', 'West Peachtree St'] },
      { at: 0.5, no: '250', dests: ['10th St', '14th St', 'Georgia Tech'] },
      { at: 0.64, no: '251A', dests: ['17th St', 'Midtown'] },
      { at: 0.95, kind: 'fork', no: '251B', shields: [I('75')], dir: 'NORTH', dests: ['Marietta', 'Chattanooga'], also: [{ shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], arrows: ['upright'] }], to: 'free-i85n', toLeft: 'free-i75n', name: 'I-75 NORTH · Marietta' },
    ],
    events: [{ t: 'vms', at: 0.04, text: 'SEVERE  STORM|REDUCE  SPEED' }, { t: 'merge', at: 0.18 }, { t: 'work', at: 0.3, len: 600 }, { t: 'police', at: 0.55 }, { t: 'merge', at: 0.62 }, { t: 'crash', at: 0.74 }, { t: 'tip', at: 0.92, title: 'Almost there', sub: 'Keep calm, keep your space, keep your signal on.' }],
    lessons: ['Calm hands, soft eyes, early signals.', 'Leave space and the road does half the work.', 'The best drivers are the ones nobody notices.'],
  }),
];

/**
 * The learning path. Easy first, then harder and harder, and the weather gets rougher as you go.
 * `skills` are report card keys, so the menu can point a student at what their own report cards say to practice.
 */
const PATH: { id: string; phase: number; skills: string[]; wxCap: number }[] = [
  { id: 'atl-first-drive', phase: 1, skills: ['acceleration', 'braking', 'lane_maintenance', 'speed_maintenance'], wxCap: 0 },
  { id: 'atl-lovvorn', phase: 1, skills: ['braking', 'road_sign_awareness', 'speed_maintenance'], wxCap: 0 },
  { id: 'atl-carrollton-square', phase: 2, skills: ['road_sign_awareness', 'braking', 'distractions', 'right_turns', 'left_turns'], wxCap: 1 },
  { id: 'atl-carrollton-circle', phase: 2, skills: ['right_turns', 'left_turns', 'signal_usage', 'blind_spots'], wxCap: 1 },
  { id: 'atl-us27-carrollton', phase: 2, skills: ['speed_maintenance', 'lane_maintenance', 'road_sign_awareness'], wxCap: 1 },
  { id: 'atl-villa-rica', phase: 2, skills: ['lane_maintenance', 'speed_maintenance', 'acceleration'], wxCap: 1 },
  { id: 'atl-bankhead-hwy', phase: 3, skills: ['changing_lanes', 'following_distance', 'signal_usage', 'braking'], wxCap: 2 },
  { id: 'atl-marietta-square', phase: 3, skills: ['right_turns', 'left_turns', 'signal_usage', 'road_sign_awareness'], wxCap: 2 },
  { id: 'atl-douglasville', phase: 3, skills: ['following_distance', 'changing_lanes', 'blind_spots', 'signal_usage'], wxCap: 2 },
  { id: 'atl-stone-mountain', phase: 3, skills: ['speed_maintenance', 'braking', 'road_sign_awareness', 'distractions'], wxCap: 2 },
  { id: 'atl-airport-camp-creek', phase: 4, skills: ['changing_lanes', 'following_distance', 'blind_spots', 'merging'], wxCap: 2 },
  { id: 'atl-ponce', phase: 4, skills: ['braking', 'left_turns', 'right_turns', 'signal_usage'], wxCap: 2 },
  { id: 'atl-rain-ponce', phase: 4, skills: ['following_distance', 'braking', 'speed_maintenance'], wxCap: 2 },
  { id: 'atl-peachtree-street', phase: 4, skills: ['distractions', 'blind_spots', 'changing_lanes', 'following_distance'], wxCap: 2 },
  { id: 'atl-fog-villa-rica', phase: 4, skills: ['speed_maintenance', 'lane_maintenance', 'following_distance'], wxCap: 3 },
  { id: 'atl-buckhead', phase: 4, skills: ['blind_spots', 'changing_lanes', 'distractions', 'following_distance'], wxCap: 3 },
  { id: 'atl-onramp-i20', phase: 5, skills: ['merging', 'interstate', 'acceleration', 'signal_usage', 'blind_spots'], wxCap: 1 },
  { id: 'atl-i75-henry', phase: 5, skills: ['interstate', 'speed_maintenance', 'lane_maintenance'], wxCap: 2 },
  { id: 'atl-i20-west', phase: 5, skills: ['interstate', 'changing_lanes', 'following_distance'], wxCap: 2 },
  { id: 'atl-i285-east', phase: 6, skills: ['interstate', 'changing_lanes', 'blind_spots', 'signal_usage'], wxCap: 3 },
  { id: 'atl-i75-cobb', phase: 6, skills: ['interstate', 'merging', 'following_distance'], wxCap: 3 },
  { id: 'atl-i285-west', phase: 6, skills: ['interstate', 'changing_lanes', 'following_distance'], wxCap: 3 },
  { id: 'atl-i20-east', phase: 6, skills: ['interstate', 'speed_maintenance', 'road_sign_awareness'], wxCap: 3 },
  { id: 'atl-ga400', phase: 6, skills: ['interstate', 'merging', 'speed_maintenance'], wxCap: 3 },
  { id: 'atl-i85-gwinnett', phase: 6, skills: ['interstate', 'road_sign_awareness', 'changing_lanes'], wxCap: 3 },
  { id: 'atl-i285-top-end', phase: 7, skills: ['interstate', 'changing_lanes', 'blind_spots', 'following_distance'], wxCap: 5 },
  { id: 'atl-i285-airport', phase: 7, skills: ['interstate', 'merging', 'road_sign_awareness', 'distractions'], wxCap: 5 },
  { id: 'atl-connector-south', phase: 7, skills: ['interstate', 'changing_lanes', 'following_distance', 'merging'], wxCap: 5 },
  { id: 'atl-connector-north', phase: 7, skills: ['interstate', 'changing_lanes', 'road_sign_awareness', 'blind_spots'], wxCap: 5 },
  { id: 'atl-move-over', phase: 8, skills: ['blind_spots', 'signal_usage', 'changing_lanes', 'interstate'], wxCap: 5 },
  { id: 'atl-work-zone', phase: 8, skills: ['speed_maintenance', 'merging', 'following_distance', 'distractions'], wxCap: 5 },
  { id: 'atl-sunset-20', phase: 8, skills: ['speed_maintenance', 'distractions', 'following_distance'], wxCap: 5 },
  { id: 'atl-fog-i20', phase: 8, skills: ['following_distance', 'speed_maintenance', 'lane_maintenance'], wxCap: 5 },
  { id: 'atl-night-285', phase: 8, skills: ['distractions', 'following_distance', 'blind_spots'], wxCap: 5 },
  { id: 'atl-snow-285', phase: 8, skills: ['following_distance', 'braking', 'speed_maintenance', 'acceleration'], wxCap: 5 },
  { id: 'atl-storm-connector', phase: 8, skills: ['following_distance', 'speed_maintenance', 'braking', 'interstate'], wxCap: 5 },
  { id: 'atl-rush-hour', phase: 9, skills: ['following_distance', 'distractions', 'braking', 'changing_lanes'], wxCap: 5 },
  { id: 'atl-master-storm', phase: 9, skills: ['interstate', 'following_distance', 'merging', 'blind_spots', 'signal_usage', 'distractions'], wxCap: 5 },
];

export const PHASES: { n: number; title: string; note: string }[] = [
  { n: 1, title: 'Phase 1 · First drive', note: 'Quiet streets, clear skies' },
  { n: 2, title: 'Phase 2 · Carrollton and country roads', note: 'Roundabouts, signs and curves' },
  { n: 3, title: 'Phase 3 · Town driving', note: 'Lights, rail crossings, school zones' },
  { n: 4, title: 'Phase 4 · Busy Atlanta streets', note: 'Rain, fog and night in the city' },
  { n: 5, title: 'Phase 5 · Meet the interstate', note: 'Ramps, merging and highway speed' },
  { n: 6, title: 'Phase 6 · Metro interstates', note: 'I-285, I-75, I-85, I-20 and GA-400' },
  { n: 7, title: 'Phase 7 · Big Atlanta interstates', note: 'The Connector, the airport, the Perimeter' },
  { n: 8, title: 'Phase 8 · Hazards and weather', note: 'Work zones, Move Over, fog, snow and storms' },
  { n: 9, title: 'Phase 9 · Master class', note: 'Rush hour and a night storm' },
];

const MILE = 1609;
/**
 * Write the green signs for a stage's exits, forks and turns. Real interstates sign an exit three times: a mile out, half a mile out, and at the
 * gore point where the lane peels off. Everything is built from the one `exits` list so the signs and the ramp in the road can never disagree.
 */
export function expandExits(st: AtlStage): AtlStage {
  if (!st.exits?.length) return st;
  const L = st.lengthM, D = (at: number) => 40 + at * (L - 90), A = (d: number) => Math.max(0.01, Math.min(0.99, (d - 40) / (L - 90)));
  const extra: GuideSign[] = [];
  for (const e of st.exits) {
    const d = D(e.at), kind = e.kind ?? 'exit', tab = e.no ? `EXIT ${e.no}` : undefined;
    if (kind === 'exit') {
      if (e.quiet) { extra.push(sign(A(d - 150), e.shields, e.dir, e.dests, { tab, arrows: ['upright'], exitOnly: true, also: e.also })); continue; }
      if (d - MILE > 120) extra.push(sign(A(d - MILE), e.shields, e.dir, e.dests, { tab, dist: '1 MILE', also: e.also }));
      if (d - MILE / 2 > 120) extra.push(sign(A(d - MILE / 2), e.shields, e.dir, e.dests, { tab, dist: '1/2 MILE', also: e.also }));
      extra.push(sign(A(d - 150), e.shields, e.dir, e.dests, { tab, arrows: ['upright'], exitOnly: true, also: e.also?.map((a) => ({ ...a, arrows: ['upright' as const] })) }));
    } else if (kind === 'fork') {
      if (d - MILE > 120) extra.push(sign(A(d - MILE), e.shields, e.dir, e.dests, { tab, dist: '1 MILE', also: e.also }));
      extra.push(sign(A(d - MILE * 0.45), e.shields, e.dir, e.dests, { tab, dist: '1/2 MILE', also: e.also }));
      extra.push(sign(A(d - 140), e.shields, e.dir, e.dests, { tab, arrows: ['upleft'], also: e.also }));
    } else if (e.street) {
      extra.push(sign(A(d - 9), undefined, undefined, [e.street], { arrows: [kind === 'left' ? 'left' : 'right'] }));
    }
  }
  return { ...st, guide: [...st.guide, ...extra].sort((a, b) => a.at - b.at) };
}

/** the hand-written stage before its signs are expanded (free roam clones these) */
export const rawAtlStage = (id: string): AtlStage | undefined => RAW.find((r) => r.id === id);
const DYN = new Map<string, AtlStage>();
/** free roam builds its legs at run time and registers them here so the engine finds them by id */
export function registerAtlStage(st: AtlStage) { DYN.set(st.id, expandExits(st)); return st.id; }

export const ATL_STAGES: AtlStage[] = PATH.map((p) => {
  const st = RAW.find((r) => r.id === p.id);
  if (!st) throw new Error(`atl path: missing stage ${p.id}`);
  return expandExits({ ...st, phase: p.phase, skills: p.skills, wxCap: p.wxCap });
});

export const ATL_PREFIX = 'atl-';
export const isAtlId = (id: string) => id.startsWith(ATL_PREFIX);
export const getAtlStage = (id: string): AtlStage | undefined => ATL_STAGES.find((s) => s.id === id) ?? DYN.get(id);

/** Each Atlanta stage as an ordinary lesson card, so the menu, the scores and the report card handle it like any other. */
export function atlLevels(): LevelConfig[] {
  return ATL_STAGES.map((s, i) => ({
    id: s.id, name: s.name, subtitle: `${s.subtitle}`, length: s.lengthM * 10, speedLimit: s.limit, maxSpeed: s.maxSpeed, features: [], obstacleGap: 300, parScore: s.par,
    shoulderColor: 0x35414a, isNew: i < 12 || undefined,
  } as LevelConfig));
}
export type { StageEvent };

/** a lesson card for a stage that was made at run time (free roam legs) */
export function levelOfStage(s: AtlStage): LevelConfig {
  return { id: s.id, name: s.name, subtitle: s.subtitle, length: s.lengthM * 10, speedLimit: s.limit, maxSpeed: s.maxSpeed, features: [], obstacleGap: 300, parScore: s.par, shoulderColor: 0x35414a } as LevelConfig;
}
