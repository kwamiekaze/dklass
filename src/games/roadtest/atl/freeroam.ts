/**
 * Free Roam: an endless drive over a network of real Atlanta roads.
 *
 * The game runs one stretch of road at a time (a "leg"). When you take an exit, make a turn, pick a side of a fork, or reach the end of a leg,
 * the next leg is built and you carry on with your speed, score and strikes. Every leg is a real road with its real exit numbers and cross streets.
 * The legs are condensed: you will not find every block of the metro here, but the interchanges, exit numbers, route shields and street names you pass
 * are the ones on the real signs, and the roads connect the way the real ones do.
 *
 * Targets are written `id` (join the road as it is) or `id@` (join it from an on-ramp: you start on the ramp beside the right lane and must merge).
 */
import { rawAtlStage, registerAtlStage, getAtlStage } from './stages';
import type { AtlStage, ExitSpec, GuideSign, Shield, StageEvent } from './stageTypes';

export const FREE_ID = 'atl-free';
const P = 'atl-fr-';
const I = (n: string): Shield => ({ t: 'I', n }), GA = (n: string, b?: Shield['b']): Shield => ({ t: 'GA', n, b }), US = (n: string, b?: Shield['b']): Shield => ({ t: 'US', n, b });

type Go = Record<string, string | [string, string]>;
/** One exit, written the short way: number, sign legend ("A / B"), shields, and anything else an ExitSpec takes. */
type XS = [no: string, dests: string, shields?: Shield[], opt?: Partial<ExitSpec>];
interface Road {
  id: string; tpl: string; next: string; go?: Go;
  /** where an exit goes when `go` does not name it */
  via?: string;
  xs: XS[];
  name?: string; sub?: string; roadName?: string; guide?: GuideSign[]; lengthM?: number; limit?: number; region?: AtlStage['region']; skyline?: AtlStage['skyline']; lanes?: number;
  trees?: AtlStage['trees']; walls?: AtlStage['walls']; traffic?: number; trucks?: number; curves?: AtlStage['curves']; place?: string; hov?: boolean;
  /** green distance sign after the first exit: [place, miles] */
  miles?: [string, number][];
  /** the leg ends at the state line: a "Welcome to" sign for the next state stands at the end */
  stateLine?: string;
  /** the leg starts at the state line coming into Georgia */
  welcome?: boolean;
  /** blue service signs and brown attraction signs: exit number -> what is there */
  services?: Record<string, string[]>;
  brown?: Record<string, string>;
  tips?: StageEvent[];
}
interface Turn { at: number; kind: 'left' | 'right'; street: string; to: string }
interface Street { id: string; tpl: string; roadName: string; next: string; turns: Turn[]; name?: string; sub?: string; region?: AtlStage['region']; skyline?: AtlStage['skyline']; limit?: number; lanes?: number; trees?: AtlStage['trees']; walls?: AtlStage['walls'] }

const pull = (shields: Shield[], dir: string, dests: string[]): GuideSign[] => [{ at: 0.035, shields, dir, dests, arrows: ['up'] }];
const two = (s: Shield, d1: string, c1: string, d2: string, c2: string): Partial<ExitSpec> => ({ shields: [s], dir: d1, dests: c1.split(' / '), also: [{ shields: [s], dir: d2, dests: c2.split(' / ') }] });
const GAS = ['GAS', 'FOOD', 'LODGING'], GF = ['GAS', 'FOOD'], ALL = ['GAS', 'FOOD', 'LODGING', 'HOSPITAL'];

// ------------------------------------------------------------------------------------------------ interstates
// Exit numbers, route shields and sign legends follow the GDOT signs on each road, in the order you pass them in that direction.
const ROADS: Road[] = [
  // ---- the Downtown Connector
  {
    id: 'con-n', tpl: 'atl-connector-north', next: 'i75-nw', via: 'peachtree', lengthM: 9000,
    go: { '247': 'i20-e@', '248C': 'ponce', '248B': 'capitol', '248A': 'capitol', '249A': 'fulton', '251B': ['i75-nw', 'i85-n1'] },
    guide: pull([I('75'), I('85')], 'NORTH', ['Chattanooga', 'Greenville']),
    xs: [
      ['247', 'Augusta', [I('20')], { dir: 'EAST', also: [{ shields: [I('20')], dir: 'WEST', dests: ['Birmingham'] }] }],
      ['248A', 'M L King Jr Dr / State Capitol'],
      ['248B', 'Edgewood Ave / Auburn Ave / J W Dobbs Ave'],
      ['248C', 'Freedom Pkwy / Carter Center', [GA('10')], { dir: 'EAST' }],
      ['249A', 'Courtland St / Georgia State Univ'],
      ['249B', 'Pine St / Peachtree St / Civic Center'],
      ['249C', 'Williams St / World Congress Ctr'],
      ['249D', 'Spring St / West Peachtree St', [US('19'), US('29')]],
      ['250', '10th St / 14th St / Georgia Tech'],
      ['251A', '17th St / Midtown'],
      ['251B', 'Marietta / Chattanooga', [I('75')], { kind: 'fork', dir: 'NORTH', also: [{ shields: [I('85')], dir: 'NORTH', dests: ['Greenville'], arrows: ['upright'] }], name: 'I-75 NORTH · Marietta' }],
    ],
    brown: { '249C': 'Georgia Aquarium|Mercedes-Benz Stadium', '248B': 'M L King Jr|Natl Historical Park' },
  },
  {
    id: 'con-s', tpl: 'atl-connector-south', next: 'i75-s1', via: 'peachtree', lengthM: 9000,
    go: { '249D': 'ponce', '248C': 'ponce', '247': 'i20-w0@', '246': 'fulton', '245': 'capitol', '244': 'capitol', '243': 'langford', '242': ['i75-s1', 'i85-sw1'] },
    guide: pull([I('75'), I('85')], 'SOUTH', ['Macon', 'Montgomery']),
    xs: [
      ['250', '16th St / 14th St / 10th St'],
      ['249D', 'North Ave / Georgia Tech', [US('29'), US('78')]],
      ['249C', 'Williams St / World Congress Ctr'],
      ['249A', 'Courtland St / Georgia State Univ'],
      ['248C', 'Freedom Pkwy / Carter Center', [GA('10')], { dir: 'EAST' }],
      ['248A', 'M L King Jr Dr / State Capitol'],
      ['247', 'Birmingham', [I('20')], { dir: 'WEST', also: [{ shields: [I('20')], dir: 'EAST', dests: ['Augusta'] }] }],
      ['246', 'Fulton St / Central Ave / Downtown'],
      ['244', 'University Ave / Pryor St'],
      ['243', 'Langford Pkwy / East Point', [GA('166')]],
      ['242', 'Macon / Tampa', [I('75')], { kind: 'fork', dir: 'SOUTH', also: [{ shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta Airport', 'Montgomery'], arrows: ['upright'] }], name: 'I-75 SOUTH · Macon' }],
    ],
    brown: { '249C': 'Georgia Aquarium|World of Coca-Cola', '246': 'Georgia State Stadium' },
  },
  // ---- I-75 south of Atlanta
  {
    id: 'i75-s1', tpl: 'atl-i75-henry', next: 'i75-henry', via: 'riverdale', name: 'I-75 South to Stockbridge', sub: 'I-75 S · The airport, Forest Park and Morrow', region: 'airport', skyline: 'airport', lanes: 5,
    go: { '238': 'i285-airport@58', '228': 'jonesboro' },
    guide: pull([I('75')], 'SOUTH', ['Macon']),
    xs: [
      ['241', 'Cleveland Ave'],
      ['239', 'Central Ave / Intl Terminal', [US('19'), US('41')]],
      ['238', 'Augusta / Greenville', [I('285')], { dir: 'EAST', also: [{ shields: [I('285')], dir: 'WEST', dests: ['Atlanta Airport', 'Birmingham'] }] }],
      ['237A', 'Riverdale', [GA('85')], { dir: 'SOUTH' }],
      ['237', 'Forest Pkwy / Forest Park', [GA('331')]],
      ['235', 'Tara Blvd / Jonesboro / Griffin', [US('19'), US('41')]],
      ['233', 'Morrow / Lake City', [GA('54')]],
      ['231', 'Mt Zion Blvd'],
      ['228', 'Stockbridge / Jonesboro', [GA('138')]],
    ],
    services: { '233': GAS, '228': ALL }, miles: [['Stockbridge', 9], ['McDonough', 18], ['Macon', 76]],
  },
  {
    id: 'i75-henry', tpl: 'atl-i75-henry', next: 'i75-n-in', via: 'jonesboro', lengthM: 6200,
    go: { '224': 'hudson-bridge', '222': 'hudson-bridge', '221': 'jonesboro', '218': 'mcdonough', '216': 'mcdonough', '212': 'mcdonough', '205': 'mcdonough' },
    guide: pull([I('75')], 'SOUTH', ['Macon']),
    xs: [
      ['224', 'Hudson Bridge Rd / Eagles Landing Pkwy'],
      ['222', 'Jodeco Rd'],
      ['221', 'Jonesboro Rd / Lovejoy'],
      ['218', 'McDonough / Hampton', [GA('20'), GA('81')]],
      ['216', 'McDonough', [GA('155')]],
      ['212', 'Bill Gardner Pkwy / Locust Grove'],
      ['205', 'Griffin / Jackson', [GA('16')]],
    ],
    services: { '224': ALL, '218': GAS, '212': GAS }, brown: { '218': 'Atlanta Motor|Speedway' }, miles: [['Locust Grove', 9], ['Forsyth', 34], ['Macon', 58]],
  },
  {
    id: 'i75-n-in', tpl: 'atl-i75-henry', next: 'con-n', via: 'jonesboro', roadName: 'I-75 NORTH', name: 'I-75 North to Atlanta', sub: 'I-75 N · Henry County up to the airport and downtown', lengthM: 8800, lanes: 5,
    go: { '218': 'mcdonough', '224': 'hudson-bridge', '238': 'i285-airport@58', '237': 'riverdale', '239': 'riverdale', '241': 'riverdale', '243': 'langford' },
    guide: pull([I('75')], 'NORTH', ['Atlanta']),
    xs: [
      ['212', 'Bill Gardner Pkwy / Locust Grove'],
      ['216', 'McDonough', [GA('155')]],
      ['218', 'McDonough / Hampton', [GA('20'), GA('81')]],
      ['221', 'Jonesboro Rd / Lovejoy'],
      ['224', 'Hudson Bridge Rd / Eagles Landing Pkwy'],
      ['227', 'Augusta / Greenville', [I('675')], { dir: 'NORTH' }],
      ['228', 'Stockbridge / Jonesboro', [GA('138')]],
      ['233', 'Morrow / Lake City', [GA('54')]],
      ['235', 'Tara Blvd / Jonesboro', [US('19'), US('41')]],
      ['237', 'Forest Pkwy / Forest Park', [GA('331')]],
      ['238', 'Augusta / Greenville', [I('285')], { dir: 'EAST', also: [{ shields: [I('285')], dir: 'WEST', dests: ['Atlanta Airport', 'Birmingham'] }] }],
      ['241', 'Cleveland Ave'],
      ['243', 'Langford Pkwy / East Point', [GA('166')]],
    ],
    services: { '224': ALL, '228': ALL }, miles: [['Stockbridge', 14], ['Atlanta', 32]],
  },
  // ---- I-75 north of Atlanta
  {
    id: 'i75-nw', tpl: 'atl-i75-cobb', next: 'i75-cobb', via: 'northside-dr', name: 'I-75 North to the Perimeter', sub: 'I-75 N · Northside Drive, Howell Mill and Cumberland', region: 'buckhead', skyline: 'buckhead', lanes: 5,
    go: { '259': 'i285-west@20', '258': 'cobb-pkwy' },
    guide: pull([I('75')], 'NORTH', ['Marietta', 'Chattanooga']),
    xs: [
      ['252A', 'Northside Dr', [US('41')]],
      ['252B', 'Howell Mill Rd'],
      ['254', 'Moores Mill Rd'],
      ['255', 'West Paces Ferry Rd / Northside Pkwy', [US('41')]],
      ['256', 'Mt Paran Rd'],
      ['258', 'Cumberland Blvd'],
      ['259', 'Birmingham / Tampa', [I('285')], { dir: 'WEST', also: [{ shields: [I('285')], dir: 'EAST', dests: ['Augusta', 'Greenville'] }] }],
    ],
    brown: { '258': 'Truist Park|The Battery Atlanta' },
  },
  {
    id: 'i75-cobb', tpl: 'atl-i75-cobb', next: 'con-s', via: 'ga120', lengthM: 8200,
    go: { '260': 'windy-hill', '261': 'windy-hill', '263': 'ga120', '265': 'marietta', '267': 'marietta', '268': 'i75-cobb@268', '269': 'barrett', '271': 'barrett', '273': 'barrett', '277': 'barrett', '278': 'barrett' },
    guide: pull([I('75')], 'NORTH', ['Chattanooga']),
    xs: [
      ['260', 'Windy Hill Rd / Smyrna'],
      ['261', 'Delk Rd / Dobbins ARB', [GA('280')]],
      ['263', 'Marietta / Roswell', [GA('120')]],
      ['265', 'N Marietta Pkwy', [GA('120')]],
      ['267', 'Canton Rd', [GA('5')]],
      ['268', 'Canton / Ball Ground', [I('575')], { dir: 'NORTH' }],
      ['269', 'Barrett Pkwy / Kennesaw', [GA('5')]],
      ['271', 'Chastain Rd / Kennesaw State Univ'],
      ['273', 'Wade Green Rd'],
      ['277', 'Acworth / Woodstock', [GA('92')]],
      ['278', 'Glade Rd / Acworth'],
    ],
    services: { '263': ALL, '269': GAS, '277': GAS }, brown: { '269': 'Kennesaw Mountain|Natl Battlefield Park', '263': 'Marietta Square' }, miles: [['Kennesaw', 9], ['Cartersville', 28], ['Chattanooga', 104]],
  },
  // ---- the Perimeter, clockwise: I-20 west side, up to the top end, down the east side, along the south side
  {
    id: 'i285-west', tpl: 'atl-i285-west', next: 'i285-top-end', via: 'south-cobb', lengthM: 7400,
    go: { '10': 'i20-w@51', '12': 'bankhead', '15': 'south-cobb', '19': 'cobb-pkwy', '20': 'i75-cobb@', '22': 'northside-dr' },
    guide: pull([I('285')], 'NORTH', ['Chattanooga', 'Greenville']),
    xs: [
      ['10', 'Birmingham', [I('20')], { dir: 'WEST', also: [{ shields: [I('20')], dir: 'EAST', dests: ['Atlanta'] }] }],
      ['12', 'D L Hollowell Pkwy', [US('78'), US('278')]],
      ['13', 'Bolton Rd'],
      ['15', 'South Cobb Dr / Smyrna', [GA('280')]],
      ['16', 'Atlanta Rd / Smyrna'],
      ['18', 'Paces Ferry Rd / Vinings'],
      ['19', 'Cobb Pkwy / Dobbins ARB', [US('41')]],
      ['20', 'Chattanooga', [I('75')], { dir: 'NORTH', also: [{ shields: [I('75')], dir: 'SOUTH', dests: ['Atlanta'] }] }],
      ['22', 'Northside Dr / Powers Ferry Rd'],
    ],
    brown: { '19': 'Truist Park', '18': 'Vinings' },
  },
  {
    id: 'i285-top-end', tpl: 'atl-i285-top-end', next: 'i285-east', via: 'ashford-dunwoody', lengthM: 8200,
    go: { '25': 'buckhead', '27': 'ga400@4', '28': 'abernathy-rd', '29': 'ashford-dunwoody', '33': 'i85-n@95' },
    guide: pull([I('285')], 'EAST', ['Greenville', 'Augusta']),
    xs: [
      ['24', 'Riverside Dr'],
      ['25', 'Roswell Rd / Sandy Springs', [US('19')]],
      ['26', 'Glenridge Dr'],
      ['27', 'Alpharetta / Cumming', [GA('400')], { dir: 'NORTH', also: [{ shields: [GA('400')], dir: 'SOUTH', dests: ['Atlanta'] }] }],
      ['28', 'Peachtree Dunwoody Rd'],
      ['29', 'Ashford Dunwoody Rd'],
      ['30', 'Chamblee Dunwoody Rd / N Shallowford Rd'],
      ['31', 'Peachtree Blvd / Chamblee', [GA('141')]],
      ['32', 'Buford Hwy / Doraville', [US('23')]],
      ['33', 'Greenville', [I('85')], { dir: 'NORTH', also: [{ shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta'] }] }],
    ],
    brown: { '29': 'Perimeter Mall' },
  },
  {
    id: 'i285-east', tpl: 'atl-i285-east', next: 'i285-airport', via: 'stone-mtn', lengthM: 8800,
    go: { '39': 'stone-mtn', '40': 'ponce', '41': 'ponce', '43': 'covington-hwy', '46': 'i20-e2@67' },
    guide: pull([I('285')], 'SOUTH', ['Macon', 'Augusta']),
    xs: [
      ['34', 'Chamblee Tucker Rd'],
      ['36', 'Northlake Pkwy'],
      ['37', 'LaVista Rd / Tucker', [GA('236')]],
      ['38', 'Lawrenceville Hwy', [US('29')]],
      ['39', 'Stone Mountain Fwy / Athens', [US('78')], { dir: 'EAST', also: [{ shields: [US('78')], dir: 'WEST', dests: ['Decatur', 'Atlanta'] }] }],
      ['40', 'E Ponce de Leon Ave / Clarkston'],
      ['41', 'Memorial Dr / Avondale Estates', [GA('10')]],
      ['43', 'Covington Hwy', [US('278')]],
      ['44', 'Glenwood Rd'],
      ['46', 'Augusta', [I('20')], { dir: 'EAST', also: [{ shields: [I('20')], dir: 'WEST', dests: ['Atlanta'] }] }],
    ],
    brown: { '39': 'Stone Mountain Park' },
  },
  {
    id: 'i285-airport', tpl: 'atl-i285-airport', next: 'i285-sw', via: 'riverdale', lengthM: 8200,
    go: { '53': 'moreland', '58': 'i75-henry@', '60': 'riverdale', '61': 'i85-sw1@70', '62': 'camp-creek' },
    guide: pull([I('285')], 'WEST', ['Atlanta Airport', 'Birmingham']),
    xs: [
      ['48', 'Flat Shoals Rd / Candler Rd', [GA('155')]],
      ['51', 'Bouldercrest Rd'],
      ['52', 'Macon', [I('675')], { dir: 'SOUTH' }],
      ['53', 'Moreland Ave / Ft Gillem', [US('23')]],
      ['55', 'Jonesboro Rd / Forest Park', [GA('54')]],
      ['58', 'Macon / Tampa', [I('75')], { dir: 'SOUTH', also: [{ shields: [I('75')], dir: 'NORTH', dests: ['Atlanta'] }] }],
      ['59', 'Clark Howell Hwy / Air Cargo'],
      ['60', 'Riverdale Rd', [GA('139')]],
      ['61', 'Montgomery / Columbus', [I('85')], { dir: 'SOUTH', also: [{ shields: [I('85')], dir: 'NORTH', dests: ['Atlanta'] }] }],
      ['62', 'Old National Hwy', [GA('279')]],
    ],
    brown: { '61': 'Hartsfield-Jackson|Domestic Terminals' },
  },
  {
    id: 'i285-sw', tpl: 'atl-i285-west', next: 'i285-west', via: 'camp-creek', name: 'Southwest Perimeter', sub: 'I-285 N · Camp Creek, Langford Parkway and Cascade', region: 'airport', skyline: 'suburb', lanes: 4, lengthM: 5200,
    go: { '2': 'camp-creek', '5': 'langford', '9': 'langford' },
    guide: pull([I('285')], 'NORTH', ['Birmingham', 'Chattanooga']),
    xs: [
      ['1', 'Washington Rd'],
      ['2', 'Camp Creek Pkwy / Atlanta Airport', [GA('6')]],
      ['5', 'Langford Pkwy / Campbellton Rd', [GA('166')]],
      ['7', 'Cascade Rd'],
      ['9', 'M L King Jr Dr / Adamsville', [GA('139')]],
    ],
    services: { '2': ALL },
  },
  // ---- I-20: the Alabama line, Carrollton country, Douglasville, downtown, and east to Lithonia
  {
    id: 'i20-w0', tpl: 'atl-i20-east', next: 'i20-w', via: 'langford', roadName: 'I-20 WEST', name: 'I-20 West through the West End', sub: 'I-20 W · From the Connector out to the Perimeter', region: 'westside', skyline: 'downtown', lanes: 4, lengthM: 6600, limit: 55,
    go: { '51': 'i285-west@10', '52': 'bankhead' },
    guide: pull([I('20')], 'WEST', ['Birmingham']),
    xs: [
      ['56B', 'Windsor St / Spring St'],
      ['56A', 'McDaniel St', [US('19'), US('29')]],
      ['55B', 'Lee St / Atlanta Univ Center'],
      ['55A', 'Lowery Blvd / West End'],
      ['54', 'Langhorn St / Cascade Rd'],
      ['53', 'M L King Jr Dr', [GA('139')]],
      ['52', 'H E Holmes Dr', [GA('280')]],
      ['51', 'Chattanooga / Greenville', [I('285')], { dir: 'NORTH', also: [{ shields: [I('285')], dir: 'SOUTH', dests: ['Macon', 'Montgomery'] }] }],
    ],
    brown: { '56B': 'Mercedes-Benz Stadium|State Farm Arena' },
  },
  {
    id: 'i20-w', tpl: 'atl-i20-west', next: 'i20-w2', via: 'thornton', lengthM: 5600,
    go: { '49': 'fulton-industrial', '47': 'thornton', '46': 'thornton', '44': 'thornton', '41': 'lee-rd', '37': 'fairburn' },
    guide: pull([I('20')], 'WEST', ['Douglasville', 'Birmingham']),
    xs: [
      ['49', 'Fulton Industrial Blvd', [GA('70')]],
      ['47', 'Six Flags Pkwy'],
      ['46', 'Riverside Pkwy / Six Flags Dr'],
      ['44', 'Thornton Rd / Lithia Springs', [GA('6')]],
      ['41', 'Lee Rd / Lithia Springs'],
      ['37', 'Fairburn Rd / Douglasville', [GA('92')]],
    ],
    services: { '44': ALL, '37': GAS }, brown: { '47': 'Six Flags|Over Georgia', '44': 'Sweetwater Creek|State Park' }, miles: [['Douglasville', 8], ['Villa Rica', 20], ['Birmingham', 134]],
  },
  {
    id: 'i20-w2', tpl: 'atl-fog-i20', next: 'i20-w3', via: 'douglasville', name: 'I-20 West to Temple', sub: 'I-20 W · Douglasville, Villa Rica and Temple', lengthM: 5800, limit: 70, lanes: 3, region: 'douglasville',
    go: { '36': 'douglasville', '34': 'bill-arp', '30': 'bill-arp', '26': 'ga61', '24': 'ga61', '19': 'temple' },
    guide: pull([I('20')], 'WEST', ['Birmingham']),
    xs: [
      ['36', 'Chapel Hill Rd / Campbellton St'],
      ['34', 'Bill Arp Rd / Douglasville', [GA('5')]],
      ['30', 'Post Rd'],
      ['26', 'Liberty Rd / Villa Rica'],
      ['24', 'Villa Rica / Dallas', [GA('61'), GA('101')]],
      ['19', 'Temple / Carrollton', [GA('113')]],
    ],
    services: { '34': ALL, '24': GAS, '19': GF }, brown: { '34': 'Arbor Place Mall' }, miles: [['Villa Rica', 9], ['Bremen', 22], ['Birmingham', 122]],
  },
  {
    id: 'i20-w3', tpl: 'atl-i20-west', next: 'i20-e-out', via: 'bremen', name: 'I-20 West to Alabama', sub: 'I-20 W · Bremen, Waco and Tallapoosa, then the state line', region: 'rural', skyline: 'hills', lanes: 2, lengthM: 4600, limit: 70, traffic: 0.45, trucks: 0.34, curves: 'rolling', place: 'Haralson County',
    go: { '11': 'us27-s0', '9': 'bremen', '5': 'bremen' },
    guide: pull([I('20')], 'WEST', ['Birmingham']),
    xs: [
      ['11', 'Bremen / Carrollton', [US('27')]],
      ['9', 'Waco Rd'],
      ['5', 'Tallapoosa / Bowdon', [GA('100')]],
    ],
    services: { '11': ALL, '5': GAS }, brown: { '11': 'Univ of West Georgia', '9': 'West Georgia|Technical College' }, miles: [['Tallapoosa', 7], ['Anniston', 52], ['Birmingham', 106]], stateLine: 'Alabama',
    tips: [{ t: 'tip', at: 0.88, title: 'Alabama state line', sub: 'This is as far west as Georgia goes. The road turns back toward Atlanta here.' }],
  },
  {
    id: 'i20-e-out', tpl: 'atl-i20-west', next: 'i20-e-in', via: 'bremen', roadName: 'I-20 EAST', name: 'I-20 East from Alabama', sub: 'I-20 E · Tallapoosa, Bremen, Villa Rica and Douglasville', region: 'rural', skyline: 'hills', lanes: 3, lengthM: 8600, limit: 70, traffic: 0.5, trucks: 0.3, curves: 'rolling', place: 'West Georgia', welcome: true,
    go: { '11': 'us27-s0', '19': 'temple', '24': 'ga61', '26': 'ga61', '30': 'bill-arp', '34': 'bill-arp', '36': 'douglasville' },
    guide: pull([I('20')], 'EAST', ['Atlanta']),
    xs: [
      ['5', 'Tallapoosa / Bowdon', [GA('100')]],
      ['9', 'Waco Rd'],
      ['11', 'Bremen / Carrollton', [US('27')]],
      ['19', 'Temple / Carrollton', [GA('113')]],
      ['24', 'Villa Rica / Dallas', [GA('61'), GA('101')]],
      ['26', 'Liberty Rd / Villa Rica'],
      ['30', 'Post Rd'],
      ['34', 'Bill Arp Rd / Douglasville', [GA('5')]],
      ['36', 'Chapel Hill Rd / Campbellton St'],
    ],
    services: { '11': ALL, '24': GAS, '34': ALL }, brown: { '11': 'Univ of West Georgia', '34': 'Arbor Place Mall' }, miles: [['Villa Rica', 24], ['Douglasville', 34], ['Atlanta', 54]],
  },
  {
    id: 'i20-e-in', tpl: 'atl-i20-east', next: 'i20-e-dt', via: 'thornton', name: 'I-20 East to Atlanta', sub: 'I-20 E · Douglasville to the Perimeter', lengthM: 7000, limit: 65, region: 'westside', skyline: 'hills',
    go: { '37': 'fairburn', '41': 'lee-rd', '44': 'thornton', '49': 'fulton-industrial', '51': 'i285-west@10', '52': 'bankhead' },
    guide: pull([I('20')], 'EAST', ['Atlanta']),
    xs: [
      ['37', 'Fairburn Rd / Douglasville', [GA('92')]],
      ['41', 'Lee Rd / Lithia Springs'],
      ['44', 'Thornton Rd / Austell', [GA('6')]],
      ['46', 'Riverside Pkwy / Six Flags Dr'],
      ['47', 'Six Flags Pkwy'],
      ['49', 'Fulton Industrial Blvd', [GA('70')]],
      ['51', 'Macon / Montgomery', [I('285')], { dir: 'SOUTH', also: [{ shields: [I('285')], dir: 'NORTH', dests: ['Chattanooga', 'Greenville'] }] }],
      ['52', 'H E Holmes Dr', [GA('280')]],
    ],
    services: { '44': ALL }, brown: { '46': 'Six Flags|Over Georgia', '44': 'Sweetwater Creek|State Park' }, miles: [['Six Flags', 5], ['Atlanta', 18]],
  },
  {
    id: 'i20-e-dt', tpl: 'atl-i20-east', next: 'i20-e', via: 'langford', name: 'I-20 East into Downtown', sub: 'I-20 E · The West End to the Connector', lengthM: 5200, limit: 55, region: 'westside', skyline: 'downtown',
    go: { '57': 'con-n@' },
    guide: pull([I('20')], 'EAST', ['Atlanta', 'Augusta']),
    xs: [
      ['53', 'M L King Jr Dr', [GA('139')]],
      ['55A', 'Lowery Blvd / West End'],
      ['55B', 'Lee St / Ft McPherson'],
      ['56A', 'McDaniel St', [US('19'), US('29')]],
      ['56B', 'Windsor St / Spring St'],
      ['57', 'Chattanooga / Greenville', [I('75'), I('85')], { dir: 'NORTH', also: [{ shields: [I('75'), I('85')], dir: 'SOUTH', dests: ['Macon', 'Montgomery'] }] }],
    ],
    brown: { '56B': 'Mercedes-Benz Stadium|State Farm Arena' },
  },
  {
    id: 'i20-e', tpl: 'atl-i20-east', next: 'i20-e2', via: 'moreland', lengthM: 7400, region: 'intown', skyline: 'downtown',
    name: 'I-20 East through East Atlanta', sub: 'I-20 E · The Capitol, Zoo Atlanta, Moreland and Gresham',
    go: { '58A': 'capitol', '58B': 'capitol', '60': 'moreland' },
    guide: pull([I('20')], 'EAST', ['Augusta']),
    xs: [
      ['58A', 'Capitol Ave / Downtown'],
      ['58B', 'Hill St / Georgia State Stadium'],
      ['59A', 'Boulevard / Zoo Atlanta'],
      ['59B', 'Memorial Dr / Glenwood Ave'],
      ['60', 'Moreland Ave', [US('23')]],
      ['61A', 'Maynard Terrace'],
      ['61B', 'Glenwood Ave', [GA('260')]],
      ['62', 'Flat Shoals Rd'],
      ['63', 'Gresham Rd'],
    ],
    brown: { '59A': 'Zoo Atlanta|Grant Park' },
  },
  {
    id: 'i20-e2', tpl: 'atl-i20-east', next: 'i20-w-dk', via: 'candler', name: 'I-20 East to Lithonia', sub: 'I-20 E · Candler Road, the Perimeter, Panola and Stonecrest', lengthM: 6200, limit: 65,
    go: { '65': 'candler', '67': 'i285-east@46', '74': 'evans-mill', '75': 'evans-mill' },
    guide: pull([I('20')], 'EAST', ['Augusta']),
    xs: [
      ['65', 'Candler Rd / Decatur', [GA('155')]],
      ['66', 'Columbia Dr'],
      ['67', 'Chattanooga / Greenville', [I('285')], { dir: 'NORTH', also: [{ shields: [I('285')], dir: 'SOUTH', dests: ['Macon', 'Atlanta Airport'] }] }],
      ['68', 'Wesley Chapel Rd / Snapfinger Rd'],
      ['71', 'Panola Rd'],
      ['74', 'Evans Mill Rd / Lithonia'],
      ['75', 'Turner Hill Rd', [US('278'), GA('124')]],
    ],
    services: { '68': ALL, '71': GAS }, brown: { '75': 'Mall at Stonecrest', '74': 'Arabia Mountain' }, miles: [['Conyers', 7], ['Covington', 17], ['Augusta', 128]],
  },
  {
    id: 'i20-w-dk', tpl: 'atl-i20-east', next: 'i20-w0', via: 'candler', roadName: 'I-20 WEST', name: 'I-20 West into Atlanta', sub: 'I-20 W · DeKalb County back to the Connector', lengthM: 9000, limit: 55, region: 'intown', skyline: 'downtown',
    go: { '74': 'evans-mill', '67': 'i285-east@46', '65': 'candler', '60': 'moreland', '58A': 'capitol', '57': 'con-n@' },
    guide: pull([I('20')], 'WEST', ['Atlanta']),
    xs: [
      ['74', 'Evans Mill Rd / Lithonia'],
      ['71', 'Panola Rd'],
      ['68', 'Wesley Chapel Rd / Snapfinger Rd'],
      ['67', 'Macon / Atlanta Airport', [I('285')], { dir: 'SOUTH', also: [{ shields: [I('285')], dir: 'NORTH', dests: ['Chattanooga', 'Greenville'] }] }],
      ['66', 'Columbia Dr'],
      ['65', 'Candler Rd / Decatur', [GA('155')]],
      ['63', 'Gresham Rd / Flat Shoals Rd'],
      ['61B', 'Glenwood Ave', [GA('260')]],
      ['60', 'Moreland Ave', [US('23')]],
      ['59A', 'Boulevard / Zoo Atlanta'],
      ['58B', 'Hill St / Georgia State Stadium'],
      ['58A', 'Capitol Ave / Downtown'],
      ['57', 'Macon / Montgomery', [I('75'), I('85')], { dir: 'SOUTH', also: [{ shields: [I('75'), I('85')], dir: 'NORTH', dests: ['Chattanooga', 'Greenville'] }] }],
    ],
    brown: { '59A': 'Zoo Atlanta|Grant Park' }, miles: [['Atlanta', 12]],
  },
  // ---- I-85 south-west: the airport, Newnan, LaGrange and the Alabama line
  {
    id: 'i85-sw1', tpl: 'atl-i285-airport', next: 'i85-sw2', via: 'riverdale', roadName: 'I-85 SOUTH', name: 'I-85 South past the Airport', sub: 'I-85 S · Hartsfield-Jackson, Union City and Fairburn', lengthM: 9000, limit: 65, lanes: 5, place: 'South Fulton',
    go: { '72': 'camp-creek', '71': 'riverdale', '70': 'i285-sw@', '68': 'i285-sw@', '69': 'camp-creek', '64': 'union-city', '61': 'union-city' },
    guide: pull([I('85')], 'SOUTH', ['Atlanta Airport', 'Montgomery']),
    xs: [
      ['77', 'Langford Pkwy', [GA('166')]],
      ['76', 'Cleveland Ave / East Point'],
      ['75', 'Sylvan Rd / Hapeville'],
      ['73', 'Virginia Ave / College Park'],
      ['72', 'Camp Creek Pkwy / Domestic Terminals', [GA('6')]],
      ['71', 'Riverdale Rd / Domestic Terminals', [GA('139')]],
      ['70', 'Macon / Augusta', [I('285')], { dir: 'EAST' }],
      ['69', 'South Fulton Pkwy', [GA('14', 'CONN')]],
      ['68', 'Birmingham / Chattanooga', [I('285')], { dir: 'WEST' }],
      ['66', 'Flat Shoals Rd'],
      ['64', 'Union City / Jonesboro', [GA('138')]],
      ['61', 'Fairburn / Peachtree City', [GA('74')]],
    ],
    services: { '73': ALL, '64': ALL, '61': GAS }, brown: { '72': 'Hartsfield-Jackson|Atlanta Intl Airport', '73': 'Delta Flight Museum' }, miles: [['Newnan', 24], ['LaGrange', 55], ['Montgomery', 148]],
  },
  {
    id: 'i85-sw2', tpl: 'atl-i20-west', next: 'i85-sw3', via: 'newnan', roadName: 'I-85 SOUTH', name: 'I-85 South to Newnan', sub: 'I-85 S · Palmetto, Newnan, Grantville and Hogansville', region: 'rural', skyline: 'hills', lanes: 3, lengthM: 7000, limit: 70, traffic: 0.55, trucks: 0.3, curves: 'rolling', place: 'Coweta County',
    go: { '56': 'union-city', '51': 'newnan', '47': 'newnan', '44': 'newnan', '41': 'ga16', '35': 'hogansville', '28': 'hogansville' },
    guide: pull([I('85')], 'SOUTH', ['Columbus', 'Montgomery']),
    xs: [
      ['56', 'Collinsworth Rd / Palmetto'],
      ['51', 'Sharpsburg', [GA('154')]],
      ['47', 'Newnan / Peachtree City', [GA('34')]],
      ['44', 'Poplar Rd'],
      ['41', 'Newnan / Moreland', [US('27', 'ALT'), US('29')]],
      ['35', 'Grantville / Moreland', [US('29')]],
      ['28', 'Hogansville / Luthersville', [GA('54'), GA('100')]],
    ],
    services: { '47': ALL, '41': GAS, '28': GAS }, brown: { '47': 'Historic Downtown|Newnan', '41': 'Chattahoochee Bend|State Park' }, miles: [['Newnan', 9], ['LaGrange', 39], ['Columbus', 80]],
  },
  {
    id: 'i85-sw3', tpl: 'atl-i20-west', next: 'i85-ne1', via: 'ga109', roadName: 'I-85 SOUTH', name: 'I-85 South to LaGrange', sub: 'I-85 S · I-185, LaGrange and West Point, then the state line', region: 'rural', skyline: 'hills', lanes: 2, lengthM: 6400, limit: 70, traffic: 0.45, trucks: 0.34, curves: 'gentle', place: 'Troup County',
    go: { '21': 'i85-ne1@21', '18': 'ga109', '14': 'us27-lag', '13': 'lagrange', '6': 'west-point', '2': 'west-point' },
    guide: pull([I('85')], 'SOUTH', ['Montgomery']),
    xs: [
      ['21', 'Columbus / Ft Benning', [I('185')], { dir: 'SOUTH' }],
      ['18', 'LaGrange / Greenville', [GA('109')]],
      ['14', 'LaGrange', [US('27')]],
      ['13', 'LaGrange', [GA('219')]],
      ['6', 'Kia Blvd'],
      ['2', 'West Point / Pine Mountain', [GA('18')]],
    ],
    services: { '18': ALL, '14': GAS, '2': GAS }, brown: { '18': 'LaGrange College|Lafayette Square', '13': 'West Point Lake', '2': 'Callaway Gardens' }, miles: [['LaGrange', 6], ['West Point', 20], ['Montgomery', 98]], stateLine: 'Alabama',
    tips: [{ t: 'tip', at: 0.9, title: 'Alabama state line', sub: 'West Point is the last town in Georgia. The road turns back toward Atlanta here.' }],
  },
  {
    id: 'i85-ne1', tpl: 'atl-i20-west', next: 'i85-ne2', via: 'ga109', roadName: 'I-85 NORTH', name: 'I-85 North from Alabama', sub: 'I-85 N · West Point, LaGrange and Hogansville', region: 'rural', skyline: 'hills', lanes: 2, lengthM: 7000, limit: 70, traffic: 0.45, trucks: 0.34, curves: 'gentle', place: 'Troup County', welcome: true,
    go: { '2': 'west-point', '6': 'west-point', '13': 'lagrange', '14': 'us27-lag', '18': 'ga109', '21': 'i85-sw3@21', '28': 'hogansville' },
    guide: pull([I('85')], 'NORTH', ['Atlanta']),
    xs: [
      ['2', 'West Point / Pine Mountain', [GA('18')]],
      ['6', 'Kia Blvd'],
      ['13', 'LaGrange', [GA('219')]],
      ['14', 'LaGrange', [US('27')]],
      ['18', 'LaGrange / Greenville', [GA('109')]],
      ['21', 'Columbus / Ft Benning', [I('185')], { dir: 'SOUTH' }],
      ['28', 'Hogansville / Luthersville', [GA('54'), GA('100')]],
    ],
    services: { '2': GAS, '18': ALL, '28': GAS }, brown: { '2': 'Callaway Gardens', '13': 'West Point Lake', '18': 'LaGrange College|Lafayette Square' }, miles: [['LaGrange', 12], ['Newnan', 44], ['Atlanta', 78]],
  },
  {
    id: 'i85-ne2', tpl: 'atl-i20-west', next: 'i85-ne3', via: 'newnan', roadName: 'I-85 NORTH', name: 'I-85 North to Fairburn', sub: 'I-85 N · Grantville, Newnan, Palmetto and Fairburn', region: 'rural', skyline: 'hills', lanes: 3, lengthM: 7000, limit: 70, traffic: 0.6, trucks: 0.28, curves: 'rolling', place: 'Coweta County',
    go: { '35': 'hogansville', '41': 'ga16', '56': 'union-city', '61': 'union-city' },
    guide: pull([I('85')], 'NORTH', ['Atlanta']),
    xs: [
      ['35', 'Grantville / Moreland', [US('29')]],
      ['41', 'Newnan / Moreland', [US('27', 'ALT'), US('29')]],
      ['44', 'Poplar Rd'],
      ['47', 'Newnan / Peachtree City', [GA('34')]],
      ['51', 'Sharpsburg', [GA('154')]],
      ['56', 'Collinsworth Rd / Palmetto'],
      ['61', 'Fairburn / Peachtree City', [GA('74')]],
    ],
    services: { '41': GAS, '47': ALL, '61': GAS }, brown: { '47': 'Historic Downtown|Newnan' }, miles: [['Fairburn', 26], ['Atlanta Airport', 34], ['Atlanta', 44]],
  },
  {
    id: 'i85-ne3', tpl: 'atl-i285-airport', next: 'con-n', via: 'riverdale', roadName: 'I-85 NORTH', name: 'I-85 North to Atlanta', sub: 'I-85 N · Union City, the airport and into the Connector', lengthM: 8200, limit: 65, lanes: 5, place: 'South Fulton',
    go: { '64': 'union-city', '68': 'i285-sw@', '70': 'i285-airport@61', '69': 'camp-creek', '72': 'camp-creek', '77': 'langford' },
    guide: pull([I('85')], 'NORTH', ['Atlanta']),
    xs: [
      ['64', 'Union City / Jonesboro', [GA('138')]],
      ['66', 'Flat Shoals Rd'],
      ['68', 'Birmingham / Chattanooga', [I('285')], { dir: 'WEST' }],
      ['69', 'South Fulton Pkwy / Old National Hwy', [GA('14', 'CONN'), GA('279')]],
      ['70', 'Macon / Augusta', [I('285')], { dir: 'EAST' }],
      ['71', 'Riverdale Rd / Domestic Terminals', [GA('139')]],
      ['72', 'Camp Creek Pkwy / Air Cargo', [GA('6')]],
      ['73', 'Virginia Ave / College Park'],
      ['75', 'Sylvan Rd / Central Ave'],
      ['76', 'Cleveland Ave / East Point'],
      ['77', 'Langford Pkwy', [GA('166')]],
    ],
    services: { '64': ALL, '73': ALL }, brown: { '72': 'Hartsfield-Jackson|Atlanta Intl Airport' }, miles: [['Atlanta Airport', 6], ['Atlanta', 16]],
  },
  // ---- I-85 north-east and GA-400
  {
    id: 'i85-n1', tpl: 'atl-i85-gwinnett', next: 'i85-n', via: 'druid-hills', name: 'I-85 North to the Perimeter', sub: 'I-85 N · Buford Highway, Lenox, Clairmont and Doraville', region: 'midtown', skyline: 'midtown', lengthM: 7000,
    go: { '87': 'ga400@', '88': 'lenox', '89': 'druid-hills', '95': 'i285-east@33' },
    guide: pull([I('85')], 'NORTH', ['Greenville']),
    xs: [
      ['86', 'Buford Hwy', [GA('13')]],
      ['87', 'Buckhead / Cumming', [GA('400')], { dir: 'NORTH' }],
      ['88', 'Lenox Rd / Cheshire Bridge Rd'],
      ['89', 'North Druid Hills Rd', [GA('42')]],
      ['91', 'Clairmont Rd / Decatur', [US('23')]],
      ['93', 'Shallowford Rd / Doraville'],
      ['94', 'Chamblee Tucker Rd'],
      ['95', 'Augusta / Macon', [I('285')], { dir: 'EAST', also: [{ shields: [I('285')], dir: 'WEST', dests: ['Chattanooga', 'Birmingham'] }] }],
    ],
    brown: { '88': 'Lenox Square' },
  },
  {
    id: 'i85-n', tpl: 'atl-i85-gwinnett', next: 'i85-s', via: 'pleasant-hill', lengthM: 9000,
    go: { '104': 'pleasant-hill', '106': 'ga316', '108': 'sugarloaf', '109': 'sugarloaf', '111': 'sugarloaf', '115': 'sugarloaf' },
    guide: pull([I('85')], 'NORTH', ['Greenville']),
    xs: [
      ['96', 'Pleasantdale Rd / Northcrest Rd'],
      ['99', 'Jimmy Carter Blvd / Norcross', [GA('140')]],
      ['101', 'Indian Trail Rd / Lilburn Rd'],
      ['102', 'Beaver Ruin Rd / Lilburn', [GA('378')]],
      ['103', 'Steve Reynolds Blvd'],
      ['104', 'Pleasant Hill Rd'],
      ['106', 'Lawrenceville / Athens', [GA('316')], { dir: 'EAST' }],
      ['107', 'Duluth / Lawrenceville', [GA('120')]],
      ['108', 'Sugarloaf Pkwy'],
      ['109', 'Old Peachtree Rd'],
      ['111', 'Suwanee / Lawrenceville', [GA('317')]],
      ['113', 'Gainesville', [I('985')], { dir: 'NORTH' }],
      ['115', 'Buford / Lawrenceville', [GA('20')]],
    ],
    services: { '104': ALL, '111': GAS }, brown: { '108': 'Gas South Arena', '115': 'Mall of Georgia|Lake Lanier' }, miles: [['Suwanee', 12], ['Commerce', 44], ['Greenville', 122]],
  },
  {
    id: 'i85-s', tpl: 'atl-i85-gwinnett', next: 'con-s', via: 'druid-hills', roadName: 'I-85 SOUTH', name: 'I-85 South through Midtown', sub: 'I-85 S · Gwinnett, Doraville, Lenox and down into the Connector', lengthM: 8600, limit: 65, lanes: 5, region: 'midtown', skyline: 'midtown',
    go: { '104': 'pleasant-hill', '95': 'i285-top-end@33', '89': 'druid-hills', '88': 'lenox', '86': 'ga400@', '84': 'peachtree' },
    guide: [{ at: 0.035, shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['up'] }, { at: 0.97, shields: [I('75'), I('85')], dir: 'SOUTH', dests: ['Downtown'], tab: 'TO', arrows: ['up'] }],
    xs: [
      ['104', 'Pleasant Hill Rd'],
      ['102', 'Beaver Ruin Rd / Lilburn', [GA('378')]],
      ['101', 'Indian Trail Rd / Lilburn Rd'],
      ['99', 'Jimmy Carter Blvd / Norcross', [GA('140')]],
      ['96', 'Pleasantdale Rd / Northcrest Rd'],
      ['95', 'Atlanta Bypass', [I('285')]],
      ['94', 'Chamblee Tucker Rd'],
      ['93', 'Shallowford Rd / Doraville'],
      ['91', 'Clairmont Rd / Decatur', [US('23')]],
      ['89', 'North Druid Hills Rd', [GA('42')]],
      ['88', 'Cheshire Bridge Rd / Lenox Rd'],
      ['86', 'Buckhead / Cumming', [GA('400')], { dir: 'NORTH' }],
      ['84', '17th St / 14th St / 10th St'],
    ],
    brown: { '88': 'Lenox Square' },
  },
  {
    id: 'ga400', tpl: 'atl-ga400', next: 'i85-s', via: 'abernathy-rd', lengthM: 8200,
    go: { '2': 'buckhead', '4': 'i285-top-end@27', '5': 'abernathy-rd', '7': 'holcomb-bridge', '8': 'holcomb-bridge' },
    guide: pull([GA('400'), US('19')], 'NORTH', ['Alpharetta', 'Cumming']),
    xs: [
      ['2', 'Lenox Rd / Buckhead', [GA('141')]],
      ['3', 'Glenridge Connector'],
      ['4', 'Greenville / Augusta', [I('285')], { dir: 'EAST', also: [{ shields: [I('285')], dir: 'WEST', dests: ['Chattanooga', 'Birmingham'] }] }],
      ['4C', 'Hammond Dr'],
      ['5', 'Abernathy Rd / Sandy Springs'],
      ['6', 'Northridge Rd'],
      ['7', 'Holcomb Bridge Rd / Roswell', [GA('140')]],
      ['8', 'Mansell Rd'],
      ['9', 'Haynes Bridge Rd'],
      ['10', 'Old Milton Pkwy / Alpharetta', [GA('120')]],
      ['11', 'Windward Pkwy'],
    ],
    services: { '7': ALL, '10': ALL }, brown: { '9': 'Avalon|North Point Mall', '2': 'Lenox Square|Phipps Plaza' }, miles: [['Alpharetta', 8], ['Cumming', 22], ['Dahlonega', 50]],
  },
];

// ------------------------------------------------------------------------------------------------ streets
const S: Street[] = [
  // Atlanta
  { id: 'peachtree', tpl: 'atl-peachtree-street', roadName: 'PEACHTREE ST', next: 'buckhead', turns: [{ at: 0.22, kind: 'right', street: 'Ponce de Leon Ave', to: 'ponce' }, { at: 0.46, kind: 'right', street: '14th St', to: 'con-n@' }, { at: 0.72, kind: 'left', street: '10th St', to: 'con-s@' }] },
  { id: 'buckhead', tpl: 'atl-buckhead', roadName: 'ROSWELL RD', next: 'ponce', turns: [{ at: 0.3, kind: 'right', street: 'Lenox Rd', to: 'ga400@' }, { at: 0.62, kind: 'left', street: 'East Paces Ferry Rd', to: 'peachtree' }] },
  { id: 'ponce', tpl: 'atl-ponce', roadName: 'PONCE DE LEON AVE', next: 'stone-mtn', turns: [{ at: 0.3, kind: 'right', street: 'Moreland Ave', to: 'moreland' }, { at: 0.56, kind: 'left', street: 'Peachtree St', to: 'peachtree' }] },
  { id: 'stone-mtn', tpl: 'atl-stone-mountain', roadName: 'STONE MOUNTAIN HWY', next: 'ponce', turns: [{ at: 0.3, kind: 'left', street: 'Ponce de Leon Ave', to: 'ponce' }, { at: 0.58, kind: 'right', street: 'I-285 South', to: 'i285-east@' }] },
  { id: 'moreland', tpl: 'atl-ponce', roadName: 'MORELAND AVE', name: 'Moreland Avenue', next: 'ponce', turns: [{ at: 0.4, kind: 'right', street: 'I-20 East', to: 'i20-e@' }, { at: 0.7, kind: 'left', street: 'Ponce de Leon Ave', to: 'ponce' }] },
  { id: 'fulton', tpl: 'atl-peachtree-street', roadName: 'FULTON ST', name: 'Fulton Street', region: 'downtown', skyline: 'downtown', next: 'capitol', turns: [{ at: 0.35, kind: 'right', street: 'I-75/85 South', to: 'i75-henry@' }, { at: 0.66, kind: 'left', street: 'I-75/85 North', to: 'con-n@' }] },
  { id: 'capitol', tpl: 'atl-peachtree-street', roadName: 'CAPITOL AVE', name: 'Capitol Avenue', region: 'downtown', skyline: 'downtown', next: 'peachtree', turns: [{ at: 0.35, kind: 'right', street: 'I-75/85 South', to: 'i75-henry@' }, { at: 0.66, kind: 'left', street: 'I-75/85 North', to: 'con-n@' }] },
  { id: 'langford', tpl: 'atl-airport-camp-creek', roadName: 'LANGFORD PKWY', name: 'Langford Parkway', next: 'camp-creek', turns: [{ at: 0.4, kind: 'right', street: 'I-75/85 South', to: 'i75-henry@' }, { at: 0.7, kind: 'left', street: 'I-75/85 North', to: 'con-n@' }] },
  { id: 'camp-creek', tpl: 'atl-airport-camp-creek', roadName: 'CAMP CREEK PKWY', next: 'fulton-industrial', turns: [{ at: 0.34, kind: 'left', street: 'Fulton Industrial Blvd', to: 'fulton-industrial' }, { at: 0.62, kind: 'right', street: 'I-285', to: 'i285-airport@' }] },
  // west
  { id: 'fulton-industrial', tpl: 'atl-airport-camp-creek', roadName: 'FULTON INDUSTRIAL BLVD', name: 'Fulton Industrial Blvd', region: 'westside', next: 'camp-creek', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w@49' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@49' }] },
  { id: 'thornton', tpl: 'atl-douglasville', roadName: 'THORNTON RD', name: 'Thornton Road', region: 'westside', next: 'lee-rd', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w@44' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@44' }] },
  { id: 'lee-rd', tpl: 'atl-douglasville', roadName: 'LEE RD', name: 'Lee Road', region: 'westside', next: 'thornton', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w@41' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@41' }] },
  { id: 'fairburn', tpl: 'atl-douglasville', roadName: 'FAIRBURN RD', name: 'Fairburn Road', next: 'douglasville', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w2@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@37' }] },
  { id: 'douglasville', tpl: 'atl-douglasville', roadName: 'CHAPEL HILL RD', next: 'bankhead', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w2@36' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  { id: 'bill-arp', tpl: 'atl-douglasville', roadName: 'BILL ARP RD', name: 'Bill Arp Road', next: 'douglasville', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w2@34' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-out@34' }] },
  // Carrollton and the west Georgia country
  { id: 'bankhead', tpl: 'atl-bankhead-hwy', roadName: 'BANKHEAD HWY', next: 'maple', turns: [{ at: 0.32, kind: 'right', street: 'Lovvorn Rd', to: 'lovvorn' }, { at: 0.62, kind: 'left', street: 'Hays Mill Rd', to: 'hays-mill' }] },
  { id: 'lovvorn', tpl: 'atl-lovvorn', roadName: 'LOVVORN RD', next: 'maple', turns: [{ at: 0.52, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }] },
  { id: 'hays-mill', tpl: 'atl-first-drive', roadName: 'HAYS MILL RD', next: 'maple', turns: [{ at: 0.58, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }] },
  { id: 'maple', tpl: 'atl-carrollton-square', roadName: 'MAPLE ST', next: 'us27', turns: [{ at: 0.24, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }, { at: 0.5, kind: 'left', street: 'US-27 North · Bremen', to: 'us27-n' }, { at: 0.76, kind: 'right', street: 'US-27 South · LaGrange', to: 'us27-s1' }] },
  { id: 'us27', tpl: 'atl-us27-carrollton', roadName: 'US-27 SOUTH', next: 'ga61', turns: [{ at: 0.3, kind: 'left', street: 'GA-61', to: 'ga61' }, { at: 0.55, kind: 'left', street: 'GA-16 East · Newnan', to: 'ga16-e' }, { at: 0.8, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }] },
  { id: 'ga61', tpl: 'atl-villa-rica', roadName: 'GA-61', next: 'douglasville', turns: [{ at: 0.42, kind: 'left', street: 'I-20 East', to: 'i20-e-out@24' }, { at: 0.72, kind: 'right', street: 'I-20 West', to: 'i20-w2@24' }] },
  { id: 'temple', tpl: 'atl-villa-rica', roadName: 'GA-113', name: 'GA-113 to Temple', next: 'ga61', turns: [{ at: 0.4, kind: 'left', street: 'I-20 East', to: 'i20-e-out@19' }, { at: 0.7, kind: 'right', street: 'I-20 West', to: 'i20-w2@19' }] },
  // Carrollton to Bremen, Franklin, LaGrange and Newnan
  { id: 'us27-n', tpl: 'atl-us27-carrollton', roadName: 'US-27 NORTH', name: 'US-27 North to Bremen', sub: 'US-27 N · Carrollton up to I-20 at Bremen', next: 'bremen', turns: [{ at: 0.5, kind: 'right', street: 'I-20 East · Atlanta', to: 'i20-e-out@11' }, { at: 0.78, kind: 'left', street: 'I-20 West · Birmingham', to: 'i20-w3@11' }] },
  { id: 'us27-s0', tpl: 'atl-us27-carrollton', roadName: 'US-27 SOUTH', name: 'US-27 South to Carrollton', sub: 'US-27 S · I-20 at Bremen down to Carrollton', next: 'maple', turns: [{ at: 0.52, kind: 'left', street: 'GA-166 · Douglasville', to: 'ga166' }, { at: 0.8, kind: 'right', street: 'Maple St · Carrollton', to: 'maple' }] },
  { id: 'bremen', tpl: 'atl-villa-rica', roadName: 'US-27 BREMEN', name: 'Bremen', sub: 'US-27 · Haralson County', region: 'rural', next: 'us27-s0', turns: [{ at: 0.4, kind: 'left', street: 'I-20 West · Birmingham', to: 'i20-w3@11' }, { at: 0.7, kind: 'right', street: 'I-20 East · Atlanta', to: 'i20-e-out@11' }] },
  { id: 'us27-s1', tpl: 'atl-us27-carrollton', roadName: 'US-27 SOUTH', name: 'US-27 South to Franklin', sub: 'US-27 S · Roopville, Centralhatchee and Franklin', region: 'rural', next: 'us27-s2', turns: [{ at: 0.34, kind: 'left', street: 'GA-5 · Roopville', to: 'ga16-e' }, { at: 0.74, kind: 'left', street: 'GA-34 · Newnan', to: 'ga34' }] },
  { id: 'us27-s2', tpl: 'atl-us27-carrollton', roadName: 'US-27 SOUTH', name: 'US-27 South to LaGrange', sub: 'US-27 S · Heard County down into Troup County', region: 'rural', next: 'lagrange', turns: [{ at: 0.6, kind: 'left', street: 'GA-54 · Hogansville', to: 'hogansville' }] },
  { id: 'lagrange', tpl: 'atl-carrollton-square', roadName: 'LAFAYETTE PKWY', name: 'Downtown LaGrange', sub: 'Lafayette Square · LaGrange College', next: 'ga109', turns: [{ at: 0.26, kind: 'right', street: 'US-27 South · I-85', to: 'us27-lag' }, { at: 0.56, kind: 'left', street: 'US-27 North · Carrollton', to: 'us27-n1' }] },
  { id: 'ga109', tpl: 'atl-bankhead-hwy', roadName: 'LAFAYETTE PKWY', name: 'Lafayette Parkway (GA-109)', sub: 'GA-109 · LaGrange out to I-85', next: 'lagrange', turns: [{ at: 0.42, kind: 'right', street: 'I-85 North · Atlanta', to: 'i85-ne1@18' }, { at: 0.7, kind: 'left', street: 'I-85 South · Montgomery', to: 'i85-sw3@18' }] },
  { id: 'us27-lag', tpl: 'atl-us27-carrollton', roadName: 'US-27 SOUTH', name: 'US-27, LaGrange', sub: 'US-27 S · LaGrange to I-85', region: 'rural', next: 'lagrange', turns: [{ at: 0.45, kind: 'right', street: 'I-85 South · Montgomery', to: 'i85-sw3@14' }, { at: 0.72, kind: 'left', street: 'I-85 North · Atlanta', to: 'i85-ne1@14' }] },
  { id: 'us27-n1', tpl: 'atl-us27-carrollton', roadName: 'US-27 NORTH', name: 'US-27 North to Franklin', sub: 'US-27 N · LaGrange up through Heard County', region: 'rural', next: 'us27-n2', turns: [{ at: 0.4, kind: 'right', street: 'GA-54 · Hogansville', to: 'hogansville' }] },
  { id: 'us27-n2', tpl: 'atl-us27-carrollton', roadName: 'US-27 NORTH', name: 'US-27 North to Carrollton', sub: 'US-27 N · Franklin, Centralhatchee and Roopville', region: 'rural', next: 'maple', turns: [{ at: 0.3, kind: 'right', street: 'GA-34 · Newnan', to: 'ga34' }, { at: 0.72, kind: 'right', street: 'GA-5 · Roopville', to: 'ga16-e' }] },
  { id: 'ga34', tpl: 'atl-villa-rica', roadName: 'GA-34', name: 'GA-34 to Newnan', sub: 'GA-34 · Franklin across the Chattahoochee to Newnan', region: 'rural', next: 'newnan', turns: [] },
  { id: 'newnan', tpl: 'atl-douglasville', roadName: 'BULLSBORO DR', name: 'Bullsboro Drive, Newnan', sub: 'GA-34 · Newnan out to I-85', region: 'douglasville', next: 'ga16', turns: [{ at: 0.4, kind: 'right', street: 'I-85 South · LaGrange', to: 'i85-sw2@47' }, { at: 0.68, kind: 'left', street: 'I-85 North · Atlanta', to: 'i85-ne2@47' }] },
  { id: 'ga16', tpl: 'atl-villa-rica', roadName: 'GA-16 WEST', name: 'GA-16 to Carrollton', sub: 'GA-16 · Newnan, Whitesburg and on to Carrollton', region: 'rural', next: 'maple', turns: [] },
  { id: 'ga16-e', tpl: 'atl-villa-rica', roadName: 'GA-16 EAST', name: 'GA-16 to Newnan', sub: 'GA-16 · Carrollton, Whitesburg and on to Newnan', region: 'rural', next: 'newnan', turns: [] },
  { id: 'ga166', tpl: 'atl-bankhead-hwy', roadName: 'GA-166', name: 'GA-166 to Douglasville', sub: 'GA-166 · Carrollton east toward Douglas County', next: 'bill-arp', turns: [{ at: 0.6, kind: 'left', street: 'GA-5 · Bill Arp Rd', to: 'bill-arp' }] },
  { id: 'hogansville', tpl: 'atl-villa-rica', roadName: 'GA-54', name: 'Hogansville', sub: 'GA-54 · Troup County', region: 'rural', next: 'lagrange', turns: [{ at: 0.4, kind: 'right', street: 'I-85 South · LaGrange', to: 'i85-sw3@' }, { at: 0.7, kind: 'left', street: 'I-85 North · Atlanta', to: 'i85-ne2@' }] },
  { id: 'west-point', tpl: 'atl-villa-rica', roadName: 'GA-18', name: 'West Point', sub: 'GA-18 · On the Chattahoochee at the Alabama line', region: 'rural', next: 'lagrange', turns: [{ at: 0.4, kind: 'right', street: 'I-85 North · Atlanta', to: 'i85-ne1@2' }, { at: 0.7, kind: 'left', street: 'I-85 South · Montgomery', to: 'i85-sw3@2' }] },
  { id: 'union-city', tpl: 'atl-douglasville', roadName: 'JONESBORO RD', name: 'Union City (GA-138)', sub: 'GA-138 · South Fulton', region: 'airport', skyline: 'suburb', next: 'camp-creek', turns: [{ at: 0.4, kind: 'right', street: 'I-85 South · Newnan', to: 'i85-sw1@64' }, { at: 0.68, kind: 'left', street: 'I-85 North · Atlanta', to: 'i85-ne3@64' }] },
  // Cobb
  { id: 'cobb-pkwy', tpl: 'atl-douglasville', roadName: 'COBB PKWY', name: 'Cobb Parkway (US-41)', region: 'cobb', skyline: 'cobb', next: 'marietta', turns: [{ at: 0.36, kind: 'left', street: 'Roswell St', to: 'marietta' }, { at: 0.66, kind: 'right', street: 'I-285', to: 'i285-west@' }] },
  { id: 'marietta', tpl: 'atl-marietta-square', roadName: 'ROSWELL ST', next: 'cobb-pkwy', turns: [{ at: 0.4, kind: 'right', street: 'Cobb Pkwy', to: 'cobb-pkwy' }] },
  { id: 'south-cobb', tpl: 'atl-douglasville', roadName: 'SOUTH COBB DR', name: 'South Cobb Drive', region: 'cobb', skyline: 'cobb', next: 'cobb-pkwy', turns: [{ at: 0.4, kind: 'right', street: 'I-285 North', to: 'i285-west@' }, { at: 0.68, kind: 'left', street: 'I-285 South', to: 'i285-airport@' }] },
  { id: 'windy-hill', tpl: 'atl-douglasville', roadName: 'WINDY HILL RD', name: 'Windy Hill Road', region: 'cobb', skyline: 'cobb', next: 'ga120', turns: [{ at: 0.4, kind: 'right', street: 'I-75 North', to: 'i75-cobb@' }, { at: 0.68, kind: 'left', street: 'I-75 South', to: 'con-s@' }] },
  { id: 'ga120', tpl: 'atl-douglasville', roadName: 'GA-120', name: 'GA-120 Marietta', region: 'cobb', skyline: 'cobb', next: 'windy-hill', turns: [{ at: 0.4, kind: 'right', street: 'I-75 North', to: 'i75-cobb@' }, { at: 0.68, kind: 'left', street: 'I-75 South', to: 'con-s@' }] },
  { id: 'barrett', tpl: 'atl-douglasville', roadName: 'BARRETT PKWY', name: 'Barrett Parkway', region: 'cobb', skyline: 'cobb', next: 'ga120', turns: [{ at: 0.4, kind: 'right', street: 'I-75 North', to: 'i75-cobb@' }, { at: 0.68, kind: 'left', street: 'I-75 South', to: 'con-s@' }] },
  { id: 'northside-dr', tpl: 'atl-buckhead', roadName: 'NORTHSIDE DR', name: 'Northside Drive', next: 'buckhead', turns: [{ at: 0.4, kind: 'right', street: 'I-285 East', to: 'i285-top-end@' }, { at: 0.68, kind: 'left', street: 'I-285 West', to: 'i285-airport@' }] },
  // Perimeter and north
  { id: 'ashford-dunwoody', tpl: 'atl-buckhead', roadName: 'ASHFORD DUNWOODY RD', name: 'Ashford Dunwoody Road', region: 'perimeter', skyline: 'perimeter', next: 'abernathy-rd', turns: [{ at: 0.4, kind: 'right', street: 'I-285 East', to: 'i285-top-end@' }, { at: 0.68, kind: 'left', street: 'GA-400 North', to: 'ga400@' }] },
  { id: 'abernathy-rd', tpl: 'atl-buckhead', roadName: 'ABERNATHY RD', name: 'Abernathy Road', region: 'perimeter', skyline: 'perimeter', next: 'ashford-dunwoody', turns: [{ at: 0.4, kind: 'right', street: 'GA-400 North', to: 'ga400@' }, { at: 0.68, kind: 'left', street: 'GA-400 South', to: 'i85-s@' }] },
  { id: 'holcomb-bridge', tpl: 'atl-buckhead', roadName: 'HOLCOMB BRIDGE RD', name: 'Holcomb Bridge Road', region: 'perimeter', skyline: 'perimeter', next: 'abernathy-rd', turns: [{ at: 0.4, kind: 'right', street: 'GA-400 North', to: 'ga400@' }, { at: 0.68, kind: 'left', street: 'GA-400 South', to: 'i85-s@' }] },
  { id: 'druid-hills', tpl: 'atl-ponce', roadName: 'N DRUID HILLS RD', name: 'North Druid Hills Road', next: 'ponce', turns: [{ at: 0.4, kind: 'right', street: 'I-85 North', to: 'i85-n@' }, { at: 0.68, kind: 'left', street: 'I-85 South', to: 'i85-s@' }] },
  { id: 'lenox', tpl: 'atl-buckhead', roadName: 'LENOX RD', name: 'Lenox Road', next: 'buckhead', turns: [{ at: 0.4, kind: 'right', street: 'I-85 North', to: 'i85-n@' }, { at: 0.68, kind: 'left', street: 'I-85 South', to: 'i85-s@' }] },
  // Gwinnett
  { id: 'pleasant-hill', tpl: 'atl-douglasville', roadName: 'PLEASANT HILL RD', name: 'Pleasant Hill Road', region: 'gwinnett', skyline: 'suburb', next: 'sugarloaf', turns: [{ at: 0.4, kind: 'right', street: 'I-85 North', to: 'i85-n@' }, { at: 0.68, kind: 'left', street: 'I-85 South', to: 'i85-s@' }] },
  { id: 'ga316', tpl: 'atl-douglasville', roadName: 'GA-316', name: 'GA-316 University Pkwy', region: 'gwinnett', skyline: 'suburb', next: 'pleasant-hill', turns: [{ at: 0.4, kind: 'right', street: 'I-85 North', to: 'i85-n@' }, { at: 0.68, kind: 'left', street: 'I-85 South', to: 'i85-s@' }] },
  { id: 'sugarloaf', tpl: 'atl-douglasville', roadName: 'SUGARLOAF PKWY', name: 'Sugarloaf Parkway', region: 'gwinnett', skyline: 'suburb', next: 'ga316', turns: [{ at: 0.4, kind: 'right', street: 'I-85 North', to: 'i85-n@' }, { at: 0.68, kind: 'left', street: 'I-85 South', to: 'i85-s@' }] },
  // east
  { id: 'candler', tpl: 'atl-ponce', roadName: 'CANDLER RD', name: 'Candler Road', next: 'moreland', turns: [{ at: 0.4, kind: 'right', street: 'I-20 East', to: 'i20-e@' }, { at: 0.68, kind: 'left', street: 'I-20 West', to: 'i20-w@' }] },
  { id: 'evans-mill', tpl: 'atl-stone-mountain', roadName: 'EVANS MILL RD', name: 'Evans Mill Road', region: 'stonemtn', next: 'stone-mtn', turns: [{ at: 0.4, kind: 'right', street: 'I-20 East', to: 'i20-e@' }, { at: 0.68, kind: 'left', street: 'I-20 West', to: 'i20-w@' }] },
  { id: 'covington-hwy', tpl: 'atl-stone-mountain', roadName: 'COVINGTON HWY', name: 'Covington Highway (US-278)', region: 'stonemtn', next: 'stone-mtn', turns: [{ at: 0.4, kind: 'right', street: 'I-285 South', to: 'i285-east@' }, { at: 0.68, kind: 'left', street: 'I-285 North', to: 'i285-top-end@' }] },
  // south
  { id: 'riverdale', tpl: 'atl-airport-camp-creek', roadName: 'RIVERDALE RD', name: 'Riverdale Road (GA-139)', next: 'camp-creek', turns: [{ at: 0.4, kind: 'right', street: 'I-285 West', to: 'i285-airport@' }, { at: 0.68, kind: 'left', street: 'I-285 East', to: 'i285-east@' }] },
  { id: 'hudson-bridge', tpl: 'atl-douglasville', roadName: 'HUDSON BRIDGE RD', name: 'Hudson Bridge Road', region: 'henry', skyline: 'suburb', next: 'jonesboro', turns: [{ at: 0.4, kind: 'right', street: 'I-75 North', to: 'con-n@' }, { at: 0.68, kind: 'left', street: 'I-75 South', to: 'i75-henry@' }] },
  { id: 'jonesboro', tpl: 'atl-douglasville', roadName: 'JONESBORO RD', name: 'Jonesboro Road', region: 'henry', skyline: 'suburb', next: 'hudson-bridge', turns: [{ at: 0.4, kind: 'right', street: 'I-75 North', to: 'con-n@' }, { at: 0.68, kind: 'left', street: 'I-75 South', to: 'i75-henry@' }] },
  { id: 'mcdonough', tpl: 'atl-douglasville', roadName: 'GA-20 / GA-81', name: 'GA-20 to McDonough', region: 'henry', skyline: 'suburb', next: 'jonesboro', turns: [{ at: 0.4, kind: 'right', street: 'I-75 North', to: 'con-n@' }, { at: 0.68, kind: 'left', street: 'I-75 South', to: 'i75-henry@' }] },
];

// ------------------------------------------------------------------------------------------------ builders
const roadById = new Map(ROADS.map((r) => [r.id, r])), streetById = new Map(S.map((s) => [s.id, s]));
const cache = new Map<string, AtlStage>();

/** a target is `id`, `id@` (join from the on-ramp at the start) or `id@NO` (join from the on-ramp just past exit NO) */
const parse = (t: string) => { const k = t.startsWith(P) ? t.slice(P.length) : t, i = k.indexOf('@'); return i < 0 ? { id: k, ramp: false, after: '' } : { id: k.slice(0, i), ramp: true, after: k.slice(i + 1) }; };
const full = (t: string) => P + t;

/** all the ids a target can name: the road as it is, and the road joined from an on-ramp */
export const freeLegIds = () => [...ROADS.map((r) => r.id), ...S.map((s) => s.id)];
export const isFreeLeg = (id: string) => id.startsWith(P);

const eventSpan = (e: StageEvent, L: number) => ('len' in e ? e.len / L : 0);
/** move a turn off any rail, light, stop sign or school zone on the template */
function clearSpot(at: number, events: StageEvent[], L: number, taken: number[]) {
  const bad = (a: number) => a > 0.93 || a < 0.1 || events.some((e) => a > e.at - 0.055 && a < e.at + 0.055 + eventSpan(e, L)) || taken.some((t) => Math.abs(t - a) < 0.14);
  if (!bad(at)) return at;
  for (let k = 1; k < 16; k++) { for (const a of [at + 0.03 * k, at - 0.03 * k]) if (!bad(a)) return a; }
  return at;
}

/** Exits sit about 720 m apart: close enough that there is always a sign to read, far enough for a full deceleration lane each. */
const GAP = 720;
const lenFor = (n: number) => (n === 0 ? 2400 : Math.max(3400, Math.round(1000 + (n - 1) * GAP + 420)));
function layExits(xs: XS[], L: number): ExitSpec[] {
  const n = xs.length, span = L - 90, a0 = Math.max(0.1, 960 / span), a1 = 1 - 330 / span;
  return xs.map(([no, dests, shields, opt], i) => ({ at: +(n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * i) / (n - 1)).toFixed(4), no, dests: dests.split(' / '), shields, ...opt }));
}
/** on-ramps wherever two exits leave room for a full acceleration lane between them */
function autoMerges(exits: ExitSpec[], L: number): StageEvent[] {
  const D = (at: number) => 40 + at * (L - 90), out: StageEvent[] = [];
  for (let i = 0; i + 1 < exits.length; i++) { const g = D(exits[i]!.at), h = D(exits[i + 1]!.at); if (h - g >= 1300 && exits[i]!.kind !== 'fork') out.push({ t: 'merge', at: (g + 690 - 40) / (L - 90) }); }
  return out;
}

function buildRoad(r: Road, ramp: boolean, after: string): AtlStage {
  const tpl = rawAtlStage(r.tpl); if (!tpl) throw new Error(`free roam: missing template ${r.tpl}`);
  const k = after ? r.xs.findIndex((x) => x[0] === after) : -1;
  const xs = k >= 0 ? r.xs.slice(k + 1) : r.xs;
  const L = k >= 0 ? lenFor(xs.length) : (r.lengthM ?? lenFor(xs.length));
  const exits = layExits(xs, L).map((e): ExitSpec => {
    const g = (e.no ? r.go?.[e.no] : undefined) ?? r.via;
    if (Array.isArray(g)) return { ...e, toLeft: full(g[0]), to: full(g[1]) };
    return g ? { ...e, to: full(g) } : e;
  });
  const keep = tpl.events.filter((e) => e.t === 'vms' || e.t === 'police').filter((e) => !exits.some((x) => Math.abs(x.at - e.at) < 0.07));
  const tips = (r.tips ?? tpl.events.filter((e) => e.t === 'tip').slice(0, 1));
  const roadName = r.roadName ?? tpl.roadName;
  return {
    ...tpl, id: full(r.id) + (ramp ? `@${k >= 0 ? after : ''}` : ''), name: r.name ?? tpl.name, subtitle: r.sub ?? tpl.subtitle, roadName, guide: r.guide ?? tpl.guide, exits, next: full(r.next), startRamp: ramp || undefined,
    lengthM: L, limit: r.limit ?? tpl.limit, lanes: r.lanes ?? tpl.lanes, region: r.region ?? tpl.region, skyline: r.skyline ?? tpl.skyline, hov: r.hov ?? tpl.hov,
    trees: r.trees ?? tpl.trees, walls: r.walls ?? tpl.walls, traffic: r.traffic ?? tpl.traffic, trucks: r.trucks ?? tpl.trucks, curves: r.curves ?? tpl.curves, place: r.place ?? tpl.place,
    maxSpeed: Math.max(tpl.maxSpeed, (r.limit ?? tpl.limit) + 16), weather: r.tpl === 'atl-fog-i20' ? tpl.weather : undefined,
    events: [...keep, ...tips, ...autoMerges(exits, L)].sort((a, b) => a.at - b.at),
    extras: { miles: r.miles, stateLine: k >= 0 && !xs.length ? undefined : r.stateLine, welcome: k >= 0 ? undefined : r.welcome, services: r.services, brown: r.brown },
    phase: undefined, skills: undefined, wxCap: 5,
  };
}

/** Every numbered exit of the network, once per road and direction: the Georgia Passport counts these. */
export interface ExitInfo { key: string; road: string; no: string; label: string; leg: string }
let exitList: ExitInfo[] | null = null;
export function allExits(): ExitInfo[] {
  if (exitList) return exitList;
  const out: ExitInfo[] = [], seen = new Set<string>();
  for (const r of ROADS) { const road = r.roadName ?? rawAtlStage(r.tpl)?.roadName ?? r.id; for (const x of r.xs) { const key = `${road}|${x[0]}`; if (seen.has(key)) continue; seen.add(key); out.push({ key, road, no: x[0], label: x[1].replace(/ \/ /g, ' · '), leg: r.id }); } }
  return (exitList = out);
}
export const exitKey = (st: AtlStage, no: string) => `${st.roadName}|${no}`;

function buildStreet(s: Street): AtlStage {
  const tpl = rawAtlStage(s.tpl); if (!tpl) throw new Error(`free roam: missing template ${s.tpl}`);
  const taken: number[] = [];
  const exits: ExitSpec[] = s.turns.map((t) => { const at = clearSpot(t.at, tpl.events, tpl.lengthM, taken); taken.push(at); return { at, kind: t.kind, street: t.street, dests: [t.street], to: full(t.to), name: t.street }; });
  const lanes = s.lanes ?? (tpl.road === 'arterial' ? 2 : 1);
  return {
    ...tpl, id: full(s.id), name: s.name ?? tpl.name, subtitle: s.sub ?? tpl.subtitle, roadName: s.roadName, region: s.region ?? tpl.region, skyline: s.skyline ?? tpl.skyline, limit: s.limit ?? tpl.limit,
    lanes, twoway: tpl.road === 'arterial' && lanes >= 2 ? true : undefined, exits, next: full(s.next), trees: s.trees ?? tpl.trees, walls: s.walls ?? tpl.walls, lengthM: Math.max(tpl.lengthM, 2600),
    phase: undefined, skills: undefined, wxCap: 5,
  };
}

/** the stage for a free roam target (`id` or `id@`). It is built once and registered with the engine. */
export function freeLeg(target: string): AtlStage {
  const key = target.startsWith(P) ? target : full(target);
  const hit = cache.get(key); if (hit) return hit;
  const { id, ramp, after } = parse(key);
  const r = roadById.get(id), sdef = streetById.get(id);
  let st: AtlStage;
  if (r) st = buildRoad(r, ramp, after);
  else if (sdef) st = buildStreet(sdef);
  else throw new Error(`free roam: unknown leg ${target}`);
  if (!r && ramp) st = { ...st, id: key };
  if (st.id !== key) { const again = cache.get(st.id); if (again) { cache.set(key, again); return again; } }
  registerAtlStage(st);
  const out = getAtlStage(st.id) ?? st;
  cache.set(key, out); cache.set(st.id, out);
  return out;
}

/** the leg that follows a finished one. `to` comes from the exit or turn you took, otherwise the road simply goes on. */
export function nextLegId(from: AtlStage, to?: string) { return to ?? from.next ?? full('peachtree'); }

export const FREE_STARTS: { id: string; title: string; sub: string }[] = [
  { id: 'peachtree', title: 'Midtown Atlanta', sub: 'Peachtree St · 10th, 14th and Ponce are all close' },
  { id: 'maple', title: 'Carrollton', sub: 'Maple St in 30117 · Bankhead Hwy and US-27 are close' },
  { id: 'i285-top-end', title: 'The Perimeter', sub: 'I-285 East · GA-400 and I-85 ahead' },
  { id: 'con-s', title: 'Downtown Connector', sub: 'I-75/85 South · I-20, the airport and the I-85 split' },
  { id: 'i20-w', title: 'I-20 West', sub: 'Six Flags, Douglasville, Villa Rica · on to Carrollton and Alabama' },
  { id: 'i85-sw1', title: 'I-85 South', sub: 'The airport, Newnan · on to LaGrange and West Point' },
  { id: 'lagrange', title: 'LaGrange', sub: 'Lafayette Square · US-27 north to Carrollton, I-85 to Atlanta' },
];
let startId = 'peachtree';
try { const v = typeof window !== 'undefined' ? window.sessionStorage.getItem('atl-free-start') : null; if (v && FREE_STARTS.some((x) => x.id === v)) startId = v; } catch { /* storage may be blocked */ }
export const getFreeStart = () => startId;
export const setFreeStart = (id: string) => { if (FREE_STARTS.some((x) => x.id === id)) { startId = id; try { window.sessionStorage.setItem('atl-free-start', id); } catch { /* ignore */ } } };

/** every id a leg can send you to, for the tests: all exits, turns, forks and `next` links */
export function legTargets(st: AtlStage): string[] {
  const t = new Set<string>(); if (st.next) t.add(st.next);
  for (const e of st.exits ?? []) { if (e.to) t.add(e.to); if (e.toLeft) t.add(e.toLeft); }
  return [...t];
}
