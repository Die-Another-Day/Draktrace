// Adapter: src/mock-data/threats.json -> the shape the Threat Intelligence tab renders.
// Timestamps are shifted so the newest dataset threat is as old now as it was at export (see timeline.js).
// The UI renders the relative label itself (<TimeAgo>), so it keeps counting while the app is open.
import threatsJson from '../mock-data/threats.json';
import { shiftIso } from './timeline';
import charts from '../mock-data/charts.json';

const TYPE = { ip: 'IP', domain: 'Domain', hash: 'Hash', url: 'URL', email: 'Email' };
const SEV = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const STATUS = { critical: 'Active', high: 'Investigating', medium: 'New', low: 'New' };

export function toUiThreat(t) {
  return {
    id: t.id,
    name: t.title,
    severity: SEV[t.severity] || 'Low',
    ioc: t.ioc,
    type: TYPE[t.iocType] || t.iocType,
    source: t.source.name,
    detectedAt: shiftIso(t.detectedAt),
    status: STATUS[t.severity] || 'New',
    description: t.description,
    confidence: t.confidence,
    category: t.category,
  };
}

export const seedThreats = threatsJson.map(toUiThreat);

// ---- live threats created by the crawler simulation (all placeholder values, reserved/demo ranges) ----
const rnd = (n) => Math.floor(Math.random() * n);
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[rnd(16)]).join('');
const MAKERS = {
  IP: () => `203.0.113.${1 + rnd(254)}`,
  Domain: () => `demo${hex(8)}.example`,
  Hash: () => hex(64),
  URL: () => `http://demo${hex(10)}.onion/${hex(4)}`,
  Email: () => `user${hex(5)}@demo.example`,
};
let liveId = 0;

export function makeLiveThreat(event, crawler) {
  const types = Object.keys(MAKERS);
  const type = types[rnd(types.length)];
  return {
    id: `live-${++liveId}`,
    name: event.text,
    severity: SEV[event.severity] || 'Low',
    ioc: MAKERS[type](),
    type,
    source: crawler.source.name,
    detectedAt: new Date().toISOString(),
    status: STATUS[event.severity] || 'New',
    description: `Indicator collected live by ${crawler.name} from ${crawler.source.name}. Review related hosts and check for exposure of internal assets.`,
    confidence: 60 + rnd(35),
    category: charts.threatCategories.labels[rnd(charts.threatCategories.labels.length)],
  };
}
