// The anonymous path of labs backend v0, tested over the real Data API with the publishable key, the way a
// browser on the site uses it. It writes a few rows under a throwaway install id and erases them again.
// Run: node supabase/tests/anon_api.mjs      (needs network; not part of the site gate)
import { randomUUID } from 'node:crypto';

const URL_ = 'https://uguiiwmhlqcitxrgqqmh.supabase.co/rest/v1';
const KEY = 'sb_publishable_GCSwvHNL3ulWiDRjaOxFMA_biQPXnsV';   // public by design; row-level security is the guard
const base = { apikey: KEY, 'Content-Type': 'application/json' };
const T1 = randomUUID(), T2 = randomUUID();
const now = () => new Date().toISOString();
let n = 0, failed = 0;
const ok = (name, cond, detail = '') => { n++; if (!cond) { failed++; console.log(`FAIL ${name} ${detail}`); } };
const call = async (method, path, { headers = {}, body } = {}) => {
  const r = await fetch(URL_ + path, { method, headers: { ...base, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; const text = await r.text(); try { j = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: r.status, j, text };
};
const ev = (install, id, extra = {}) => ({ install_id: install, event_id: id, t: now(), lab: 'hub', type: 'lab.open', session: 'apitest', data: null, ...extra });
const mine = (install) => call('GET', `/usage_events?select=install_id,event_id&install_id=eq.${install}`, { headers: { 'x-install-id': install } });

try {
  // inserts
  let r = await call('POST', '/usage_events', { headers: { Prefer: 'return=minimal' }, body: [ev(T1, 'apitest-0001'), ev(T1, 'apitest-0002', { type: 'lab.leave', data: { visibleMs: 1200, totalMs: 3000, final: true } })] });
  ok('anon inserts a batch', r.status === 201, `${r.status} ${r.text}`);
  // A retry skips what is already stored. Skipping means comparing against stored rows, which the visitor may
  // only do for their own install, so the request must carry the install header (the client always sends it).
  r = await call('POST', '/usage_events?on_conflict=install_id,event_id', { headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' }, body: [ev(T1, 'apitest-0001'), ev(T1, 'apitest-0003')] });
  ok('a retry without the install header is refused', r.status >= 400, `${r.status} ${r.text}`);
  r = await call('POST', '/usage_events?on_conflict=install_id,event_id', { headers: { 'x-install-id': T2, Prefer: 'return=minimal,resolution=ignore-duplicates' }, body: [ev(T1, 'apitest-0001'), ev(T1, 'apitest-0003')] });
  ok("a retry under another install's header is refused", r.status >= 400, `${r.status} ${r.text}`);
  r = await call('POST', '/usage_events?on_conflict=install_id,event_id', { headers: { 'x-install-id': T1, Prefer: 'return=minimal,resolution=ignore-duplicates' }, body: [ev(T1, 'apitest-0001'), ev(T1, 'apitest-0003')] });
  ok('a retry with one stored and one new event succeeds', r.status === 201 || r.status === 200, `${r.status} ${r.text}`);
  r = await mine(T1);
  ok('the visitor sees the ids of their own install: 3 rows', r.status === 200 && Array.isArray(r.j) && r.j.length === 3, `${r.status} ${r.text}`);

  // reads that must fail or return nothing
  r = await call('GET', '/usage_events?select=install_id');
  ok('without the install header no row is visible', r.status === 200 && Array.isArray(r.j) && r.j.length === 0, `${r.status} ${r.text}`);
  r = await call('GET', `/usage_events?select=install_id&install_id=eq.${T1}`, { headers: { 'x-install-id': T2 } });
  ok("another install's header shows none of these rows", r.status === 200 && r.j.length === 0, `${r.status} ${r.text}`);
  r = await call('GET', '/usage_events?select=lab,type,data', { headers: { 'x-install-id': T1 } });
  ok('event contents are not readable, even for the own install', r.status >= 400, `${r.status} ${r.text.slice(0, 120)}`);
  r = await call('GET', '/usage_events?select=*', { headers: { 'x-install-id': T1 } });
  ok('select * is refused', r.status >= 400, `${r.status}`);
  for (const t of ['usage_by_day', 'progress', 'events', 'profiles']) {
    r = await call('GET', `/${t}?select=*`);
    ok(`anon cannot read ${t}`, r.status >= 400 || (Array.isArray(r.j) && r.j.length === 0), `${r.status} ${r.text.slice(0, 120)}`);
    ok(`anon gets an error, not an empty list, from ${t}`, r.status >= 400, `${r.status}`);
  }
  r = await call('POST', '/rpc/is_admin', { body: {} });
  ok('is_admin is not callable through the API', r.status >= 400, `${r.status}`);
  r = await call('POST', '/rpc/rls_auto_enable', { body: {} });
  ok('the platform helper is not callable by anon', r.status >= 400, `${r.status}`);

  // writes that must fail
  const bad = [
    ['a future event', ev(T1, 'apitest-0101', { t: new Date(Date.now() + 3 * 864e5).toISOString() })],
    ['an event older than 30 days', ev(T1, 'apitest-0102', { t: new Date(Date.now() - 60 * 864e5).toISOString() })],
    ['a malformed type', ev(T1, 'apitest-0103', { type: 'DROP TABLE' })],
    ['a malformed lab', ev(T1, 'apitest-0104', { lab: 'Not A Lab!' })],
    ['an oversized payload', ev(T1, 'apitest-0105', { data: { x: 'y'.repeat(3000) } })],
    ['a non-uuid install', ev('not-a-uuid', 'apitest-0106')],
    ['a short event id', ev(T1, 'x')],
  ];
  for (const [name, row] of bad) {
    r = await call('POST', '/usage_events', { headers: { Prefer: 'return=minimal' }, body: [row] });
    ok(`${name} is refused`, r.status >= 400, `${r.status}`);
  }
  r = await call('POST', '/usage_events', { headers: { Prefer: 'return=minimal' }, body: [ev(T1, 'apitest-0001')] });
  ok('the same event again without ignore-duplicates is refused', r.status === 409, `${r.status}`);
  r = await call('PATCH', `/usage_events?install_id=eq.${T1}`, { headers: { 'x-install-id': T1, Prefer: 'return=minimal' }, body: { lab: 'changed' } });
  ok('usage events cannot be updated', r.status >= 400, `${r.status}`);
  r = await call('POST', '/progress', { headers: { Prefer: 'return=minimal' }, body: [{ user_id: randomUUID(), lab: 'hub', v: 1, data: {} }] });
  ok('anon cannot write progress', r.status >= 400, `${r.status}`);
  r = await call('POST', '/profiles', { headers: { Prefer: 'return=minimal' }, body: [{ id: randomUUID() }] });
  ok('anon cannot write profiles', r.status >= 400, `${r.status}`);
  r = await mine(T1);
  ok('none of the refused writes landed: still 3 rows', r.j.length === 3, `${r.j && r.j.length}`);

  // erasure
  r = await call('DELETE', `/usage_events?install_id=eq.${T1}`);
  r = await mine(T1);
  ok('a delete without the install header removes nothing', r.j.length === 3, `${r.j && r.j.length}`);
  r = await call('DELETE', `/usage_events?install_id=eq.${T1}`, { headers: { 'x-install-id': T2 } });
  r = await mine(T1);
  ok("a delete with another install's header removes nothing", r.j.length === 3, `${r.j && r.j.length}`);
  r = await call('DELETE', '/usage_events', { headers: { 'x-install-id': T1 } });
  ok('a delete with no filter is refused by the API', r.status >= 400, `${r.status}`);
  r = await call('DELETE', `/usage_events?install_id=eq.${T1}`, { headers: { 'x-install-id': T1 } });
  ok('a visitor erases their own install', r.status === 204, `${r.status} ${r.text}`);
  r = await mine(T1);
  ok('after erasure nothing of the install remains', r.status === 200 && r.j.length === 0, `${r.status} ${r.text}`);
} finally {
  // never leave test rows behind, whatever failed above
  await call('DELETE', `/usage_events?install_id=eq.${T1}`, { headers: { 'x-install-id': T1 } });
  await call('DELETE', `/usage_events?install_id=eq.${T2}`, { headers: { 'x-install-id': T2 } });
}
console.log(`anon API tests: ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
