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
const I = (n: string): Shield => ({ t: 'I', n }), GA = (n: string): Shield => ({ t: 'GA', n });

type Go = Record<string, string | [string, string]>;
interface Road { id: string; tpl: string; next: string; go?: Go; name?: string; sub?: string; exits?: ExitSpec[]; guide?: GuideSign[]; lengthM?: number; limit?: number; region?: AtlStage['region']; skyline?: AtlStage['skyline']; lanes?: number }
interface Turn { at: number; kind: 'left' | 'right'; street: string; to: string }
interface Street { id: string; tpl: string; roadName: string; next: string; turns: Turn[]; name?: string; sub?: string; region?: AtlStage['region']; skyline?: AtlStage['skyline']; limit?: number; lanes?: number; trees?: AtlStage['trees']; walls?: AtlStage['walls'] }

// ------------------------------------------------------------------------------------------------ interstates
const ROADS: Road[] = [
  { id: 'con-n', tpl: 'atl-connector-north', next: 'i75-cobb', go: { '249B': 'peachtree', '249D': 'peachtree', '250': 'peachtree', '251A': 'peachtree', '251B': ['i75-cobb', 'i85-n'] } },
  { id: 'con-s', tpl: 'atl-connector-south', next: 'i75-henry', go: { '250': 'peachtree', '249D': 'ponce', '247': 'i20-e@', '246': 'fulton', '245': 'capitol', '243': 'langford' } },
  { id: 'i75-henry', tpl: 'atl-i75-henry', next: 'con-n', go: { '224': 'hudson-bridge', '221': 'jonesboro', '218': 'mcdonough' } },
  { id: 'i75-cobb', tpl: 'atl-i75-cobb', next: 'con-s', go: { '260': 'windy-hill', '263': 'ga120', '268': 'i75-cobb@', '269': 'barrett' } },
  { id: 'i285-top-end', tpl: 'atl-i285-top-end', next: 'i285-east', go: { '27': 'ga400@', '29': 'ashford-dunwoody', '33': 'i85-n@' } },
  { id: 'i285-east', tpl: 'atl-i285-east', next: 'i285-airport', go: { '39': 'stone-mtn', '43': 'covington-hwy', '46': 'i20-e@' } },
  { id: 'i285-airport', tpl: 'atl-i285-airport', next: 'i285-west', go: { '58': 'i75-henry@', '60': 'riverdale', '61': 'con-n@' } },
  { id: 'i285-west', tpl: 'atl-i285-west', next: 'i285-top-end', go: { '15': 'south-cobb', '19': 'cobb-pkwy', '20': 'i75-cobb@', '22': 'northside-dr' } },
  { id: 'i20-e', tpl: 'atl-i20-east', next: 'i20-w', go: { '60': 'moreland', '65': 'candler', '67': 'i285-east@', '74': 'evans-mill' } },
  { id: 'i20-w', tpl: 'atl-i20-west', next: 'i20-w2', go: { '49': 'fulton-industrial', '44': 'thornton', '41': 'lee-rd', '37': 'fairburn' } },
  {
    id: 'i20-w2', tpl: 'atl-fog-i20', next: 'i20-e-in', name: 'I-20 West to Temple', sub: 'I-20 W · Douglasville, Villa Rica and out toward Alabama', lengthM: 4600, limit: 65, lanes: 3, region: 'douglasville',
    go: { '36': 'douglasville', '34': 'bill-arp', '26': 'ga61', '24': 'ga61', '19': 'temple' },
    exits: [
      { at: 0.16, no: '36', dests: ['Chapel Hill Rd'] },
      { at: 0.34, no: '34', shields: [GA('5')], dests: ['Bill Arp Rd', 'Douglasville'] },
      { at: 0.62, no: '26', dests: ['Liberty Rd', 'Villa Rica'] },
      { at: 0.78, no: '24', shields: [GA('61'), GA('101')], dests: ['Villa Rica', 'Dallas'] },
      { at: 0.94, no: '19', shields: [GA('113')], dests: ['Temple'] },
    ],
  },
  {
    id: 'i20-e-in', tpl: 'atl-i20-east', next: 'con-n', name: 'I-20 East to Atlanta', sub: 'I-20 E · Douglasville to the Perimeter and downtown', lengthM: 4600, limit: 65, region: 'westside', skyline: 'hills',
    go: { '37': 'fairburn', '41': 'lee-rd', '44': 'thornton', '49': 'fulton-industrial', '51': 'i285-west@', '53': 'langford' },
    exits: [
      { at: 0.1, no: '37', shields: [GA('92')], dests: ['Fairburn Rd', 'Douglasville'] },
      { at: 0.26, no: '41', dests: ['Lee Rd', 'Lithia Springs'] },
      { at: 0.42, no: '44', shields: [GA('6')], dests: ['Thornton Rd', 'Austell'] },
      { at: 0.58, no: '49', shields: [GA('70')], dests: ['Fulton Industrial Blvd'] },
      { at: 0.76, no: '51', shields: [I('285')], dests: ['Atlanta Bypass', 'Chattanooga'] },
      { at: 0.92, no: '53', shields: [GA('139')], dests: ['MLK Jr Dr'] },
    ],
  },
  { id: 'ga400', tpl: 'atl-ga400', next: 'i85-s', go: { '2': 'buckhead', '4': 'i285-top-end@', '5': 'abernathy-rd', '7': 'holcomb-bridge' } },
  { id: 'i85-n', tpl: 'atl-i85-gwinnett', next: 'i85-s', go: { '104': 'pleasant-hill', '106': 'ga316', '108': 'sugarloaf' } },
  {
    id: 'i85-s', tpl: 'atl-i85-gwinnett', next: 'con-s', name: 'I-85 South through Midtown', sub: 'I-85 S · Buckhead, Lenox and down into the Connector', lengthM: 4600, limit: 65, lanes: 5, region: 'midtown', skyline: 'midtown',
    go: { '95': 'i285-top-end@', '89': 'druid-hills', '88': 'lenox', '86': 'ga400@', '84': 'peachtree' },
    guide: [
      { at: 0.06, shields: [I('85')], dir: 'SOUTH', dests: ['Atlanta'], arrows: ['up'] },
      { at: 0.93, shields: [I('75'), I('85')], dir: 'SOUTH', dests: ['Downtown'], tab: 'TO', arrows: ['up'] },
    ],
    exits: [
      { at: 0.18, no: '95', shields: [I('285')], dests: ['Atlanta Bypass'] },
      { at: 0.36, no: '89', shields: [GA('42')], dests: ['North Druid Hills Rd', 'Oglethorpe Univ'] },
      { at: 0.5, no: '88', dests: ['Cheshire Bridge Rd', 'Lenox Rd'] },
      { at: 0.64, no: '86', shields: [GA('400')], dir: 'NORTH', dests: ['Buckhead', 'Cumming'] },
      { at: 0.8, no: '84', dests: ['17th St', '14th St', '10th St'] },
    ],
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
  { id: 'fulton-industrial', tpl: 'atl-airport-camp-creek', roadName: 'FULTON INDUSTRIAL BLVD', name: 'Fulton Industrial Blvd', region: 'westside', next: 'camp-creek', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  { id: 'thornton', tpl: 'atl-douglasville', roadName: 'THORNTON RD', name: 'Thornton Road', region: 'westside', next: 'lee-rd', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  { id: 'lee-rd', tpl: 'atl-douglasville', roadName: 'LEE RD', name: 'Lee Road', region: 'westside', next: 'thornton', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  { id: 'fairburn', tpl: 'atl-douglasville', roadName: 'FAIRBURN RD', name: 'Fairburn Road', next: 'douglasville', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w2@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  { id: 'douglasville', tpl: 'atl-douglasville', roadName: 'CHAPEL HILL RD', next: 'bankhead', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w2@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  { id: 'bill-arp', tpl: 'atl-douglasville', roadName: 'BILL ARP RD', name: 'Bill Arp Road', next: 'douglasville', turns: [{ at: 0.4, kind: 'right', street: 'I-20 West', to: 'i20-w2@' }, { at: 0.68, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }] },
  // Carrollton and the west Georgia country
  { id: 'bankhead', tpl: 'atl-bankhead-hwy', roadName: 'BANKHEAD HWY', next: 'maple', turns: [{ at: 0.32, kind: 'right', street: 'Lovvorn Rd', to: 'lovvorn' }, { at: 0.62, kind: 'left', street: 'Hays Mill Rd', to: 'hays-mill' }] },
  { id: 'lovvorn', tpl: 'atl-lovvorn', roadName: 'LOVVORN RD', next: 'maple', turns: [{ at: 0.52, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }] },
  { id: 'hays-mill', tpl: 'atl-first-drive', roadName: 'HAYS MILL RD', next: 'maple', turns: [{ at: 0.58, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }] },
  { id: 'maple', tpl: 'atl-carrollton-square', roadName: 'MAPLE ST', next: 'us27', turns: [{ at: 0.34, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }, { at: 0.62, kind: 'left', street: 'US-27', to: 'us27' }] },
  { id: 'us27', tpl: 'atl-us27-carrollton', roadName: 'US-27 SOUTH', next: 'ga61', turns: [{ at: 0.34, kind: 'left', street: 'GA-61', to: 'ga61' }, { at: 0.7, kind: 'right', street: 'Bankhead Hwy', to: 'bankhead' }] },
  { id: 'ga61', tpl: 'atl-villa-rica', roadName: 'GA-61', next: 'douglasville', turns: [{ at: 0.42, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }, { at: 0.72, kind: 'right', street: 'I-20 West', to: 'i20-w2@' }] },
  { id: 'temple', tpl: 'atl-villa-rica', roadName: 'GA-113', name: 'GA-113 to Temple', next: 'ga61', turns: [{ at: 0.4, kind: 'left', street: 'I-20 East', to: 'i20-e-in@' }, { at: 0.7, kind: 'right', street: 'I-20 West', to: 'i20-w2@' }] },
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

const bare = (t: string) => t.replace(/@$/, '');
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

function buildRoad(r: Road, ramp: boolean): AtlStage {
  const tpl = rawAtlStage(r.tpl); if (!tpl) throw new Error(`free roam: missing template ${r.tpl}`);
  const exits = (r.exits ?? tpl.exits ?? []).map((e): ExitSpec => {
    const g = e.no ? r.go?.[e.no] : undefined;
    const rest = { ...e }; delete rest.to; delete rest.toLeft;
    if (Array.isArray(g)) return { ...rest, toLeft: full(g[0]), to: full(g[1]) };
    return g ? { ...rest, to: full(g) } : rest;
  });
  return {
    ...tpl, id: full(r.id) + (ramp ? '@' : ''), name: r.name ?? tpl.name, subtitle: r.sub ?? tpl.subtitle, guide: r.guide ?? tpl.guide, exits, next: full(r.next), startRamp: ramp || undefined,
    lengthM: r.lengthM ?? tpl.lengthM, limit: r.limit ?? tpl.limit, lanes: r.lanes ?? tpl.lanes, region: r.region ?? tpl.region, skyline: r.skyline ?? tpl.skyline,
    phase: undefined, skills: undefined, wxCap: 5,
  };
}

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
  const ramp = key.endsWith('@'), id = bare(key).slice(P.length);
  const r = roadById.get(id), s = streetById.get(id);
  let st: AtlStage;
  if (r) st = buildRoad(r, ramp);
  else if (s) st = buildStreet(s);
  else throw new Error(`free roam: unknown leg ${target}`);
  if (!r && ramp) st = { ...st, id: key };
  registerAtlStage(st);
  cache.set(key, st);
  return getAtlStage(key) ?? st;
}

/** the leg that follows a finished one. `to` comes from the exit or turn you took, otherwise the road simply goes on. */
export function nextLegId(from: AtlStage, to?: string) { return to ?? from.next ?? full('peachtree'); }

export const FREE_STARTS: { id: string; title: string; sub: string }[] = [
  { id: 'peachtree', title: 'Midtown Atlanta', sub: 'Peachtree St · 10th, 14th and Ponce are all close' },
  { id: 'maple', title: 'Carrollton', sub: 'Maple St in 30117 · Bankhead Hwy and US-27 are close' },
  { id: 'i285-top-end', title: 'The Perimeter', sub: 'I-285 East · GA-400 and I-85 ahead' },
  { id: 'con-s', title: 'Downtown Connector', sub: 'I-75/85 South · I-20, Memorial Dr and the airport' },
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
