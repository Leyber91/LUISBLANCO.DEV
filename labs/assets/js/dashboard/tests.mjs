// The dashboard's parts that run without a browser: the fixtures, the axis arithmetic, and the fixtures pushed
// through the same counting code as real rows. Run by tools/lab_tests.mjs (node, no dependencies).
import assert from 'node:assert/strict';
import { FIXTURES, fixtureClient, sampleUsage } from './fixtures.js';
import { countAxis, dayLabel, labelEvery } from './chart.js';
import { buildUsage, RANGES, SESSION_TYPES } from '../os/usage.js';

let checks = 0;
const ok = (cond, what) => { checks++; assert.ok(cond, what); };
const eq = (a, b, what) => { checks++; assert.deepEqual(a, b, what); };

const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);
const DAY = 86_400_000;
const hub = { id: 'hub', title: 'Labs hub' };
const catalogue = ['black-hole', 'dimensional', 'exomania', 'heptapod', 'alt-reality', 'the-figure', 'primordial-seed', 'token-ekg',
  'dataspace', 'ai-health', 'claude-prep', 'honesty-decoder', 'roaster', 'workout-plans', 'memes', 'trends'].map((id) => ({ id, title: id }));

// no fixture reaches the network: any request fails the run
let requests = 0;
globalThis.fetch = () => { requests++; return Promise.reject(new Error('a fixture reached the network')); };

/* ---- the sample ---- */
const sample = sampleUsage(catalogue, NOW);
eq(sampleUsage(catalogue, NOW), sample, 'the sample is the same on every call');
ok(sample.raw.length > 500 && sample.byDay.length > 100, 'the sample holds a quarter of usage');
for (const r of sample.raw) {
  eq(Object.keys(r), ['t', 'lab', 'type', 'install_id', 'session', 'data'], 'a session row has the columns the page asks for');
  ok(SESSION_TYPES.includes(r.type), `only session types are read as rows, got ${r.type}`);
  const t = Date.parse(r.t);
  ok(t <= NOW && t > NOW - 91 * DAY, 'every sample event lies in the last 90 days and not in the future');
}
for (const r of sample.byDay) {
  eq(Object.keys(r), ['day', 'lab', 'type', 'events', 'installs', 'sessions', 'visible_ms'], 'a daily row has the columns of usage_by_day');
  ok(r.events > 0, 'a daily count is positive');
}
ok(!JSON.stringify(sample).includes('@'), 'the sample holds no address');

/* ---- the sample through the counting code ---- */
for (const days of RANGES) {
  const m = buildUsage(sample.byDay, sample.raw, { days, now: NOW, catalogue, hub });
  eq(m.daily.length, days, `${days} days draw ${days} points`);
  ok(m.daily.every((d) => d.sessions >= d.visitors), 'a day never has more visitors than sessions');
  ok(m.totals.visitors > 0 && m.totals.sessions >= m.totals.visitors, 'the range has visitors, and at least as many sessions');
  ok(m.totals.visitors <= m.daily.reduce((n, d) => n + d.visitors, 0), 'visitors over a range never exceed the sum of the days');
  eq(m.labs.length, catalogue.length + 2, 'the hub, every lab and the rest are rows in every range');
  eq(m.labs[0].id, 'hub', 'the hub leads');
  ok(m.neverOpened.includes('trends') && m.neverOpened.includes('memes') && m.neverOpened.includes('workout-plans'), 'the last three labs are never opened');
  const heptapod = m.labs.find((l) => l.id === 'heptapod');
  ok(heptapod.sessions !== null && heptapod.visibleMs > 0 && heptapod.actions > 0, 'a lab that records itself has sessions, time in view and actions');
  const blackHole = m.labs.find((l) => l.id === 'black-hole');
  ok(blackHole.sessions === null && blackHole.actions === null && blackHole.opens > 0, 'a lab reached only from the hub has opens and nothing it did not record');
}
const m7 = buildUsage(sample.byDay, sample.raw, { days: 7, now: NOW, catalogue, hub });
const m90 = buildUsage(sample.byDay, sample.raw, { days: 90, now: NOW, catalogue, hub });
ok(m7.neverOpened.length > m90.neverOpened.length, 'a shorter range leaves more labs unopened');

/* ---- every fixture answers without the network ---- */
for (const name of FIXTURES) {
  const c = fixtureClient(name, catalogue, NOW);
  const signedIn = c.session() !== null;
  eq(signedIn, ['loading', 'error', 'not-owner', 'empty', 'owner-data'].includes(name), `${name}: signed in or not`);
  const link = await c.requestLink('someone@example.org', 'https://example.org/');
  eq(link.ok, name !== 'rate-limited', `${name}: the link request`);
  if (name === 'loading') {
    const first = await Promise.race([c.readUsage('2026-08-16').then(() => 'answered'), new Promise((r) => setTimeout(() => r('waiting'), 30))]);
    eq(first, 'waiting', 'loading never answers');
  } else if (name === 'error') {
    const e = await c.readUsage('2026-08-16').catch((x) => x);
    ok(e instanceof Error && e.kind === 'backend', 'error rejects the way the real client does');
  } else {
    const read = await c.readUsage('2026-08-16');
    eq(read.anyRows, name === 'owner-data', `${name}: rows or none`);
  }
  eq(c.owner, name !== 'not-owner', `${name}: the owner hint`);
  await c.signOut();
  eq(c.session(), null, `${name}: signed out`);
}
eq(requests, 0, 'no fixture reached the network');

/* ---- the count axis and the day labels ---- */
eq(countAxis(0).ticks, [0, 1], 'an empty range still has an axis');
eq(countAxis(3).ticks, [0, 1, 2, 3], 'small counts tick in ones');
eq(countAxis(14).ticks, [0, 5, 10, 15], 'the top is at or above the largest value');
eq(countAxis(18).ticks, [0, 5, 10, 15, 20], 'at most five ticks');
eq(countAxis(1234).ticks, [0, 500, 1000, 1500], 'large counts tick in round numbers');
for (let max = 0; max <= 5000; max += 7) {
  const a = countAxis(max);
  ok(a.top >= max && a.ticks.length <= 6 && a.ticks.every(Number.isInteger), `countAxis(${max}) covers its data in whole numbers`);
}
eq([labelEvery(7, 1000), labelEvery(30, 1000), labelEvery(90, 1000)], [1, 3, 14], 'a wide plot labels every day, third day, fortnight');
eq([labelEvery(7, 250), labelEvery(30, 250), labelEvery(90, 250)], [3, 14, 30], 'a narrow plot labels fewer days');
eq(dayLabel('2026-11-07'), '7 Nov', 'a day label');
eq(dayLabel('2026-01-31', true), '31 Jan 2026', 'a day label with its year');

console.log(`all ${checks} checks pass`);
