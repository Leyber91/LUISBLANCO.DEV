// The built transport against the real labs backend, the way a consenting browser uses it: two events under a
// throwaway install id, the same two again (a retry), then an erase, then the proof that nothing of that install
// remains. Outside the gate: it needs the network and writes to the live project.
//
// Run from the repository root, after `npm run build` in labs-src:   node labs-src/os/live-smoke.mjs
import { randomUUID } from 'node:crypto';
import { BACKEND, supabaseTransport } from '../../labs/assets/js/os/transport.js';

const install = randomUUID();
const other = randomUUID();
const transport = supabaseTransport();
const rest = `${BACKEND.url}/rest/v1`;
let n = 0, failed = 0;
const ok = (name, cond, detail = '') => { n++; console.log(`${cond ? 'pass' : 'FAIL'} ${name}${cond || !detail ? '' : `  ${detail}`}`); if (!cond) failed++; };

/** what a visitor may read: the two ids of the rows of the install in the header (as supabase/tests/anon_api.mjs does) */
const mine = async (id, header = id) => {
  const r = await fetch(`${rest}/usage_events?select=install_id,event_id&install_id=eq.${id}`, { headers: { apikey: BACKEND.key, 'x-install-id': header } });
  return { status: r.status, rows: r.ok ? await r.json() : null };
};

const t = Date.now();
const typed = 'this sentence was typed by a visitor and must never leave';
const events = [
  { v: 1, id: `smoke-${randomUUID()}`, t: t - 4000, lab: 'hub', type: 'lab.open', session: 'live-smoke', data: { path: '/labs/index.html' } },
  { v: 1, id: `smoke-${randomUUID()}`, t: t - 1000, lab: 'hub', type: 'lab.leave', session: 'live-smoke',
    data: { visibleMs: 3000, totalMs: 3000, final: true, note: typed, nested: { note: typed }, mail: 'someone@example.org' } },
];

try {
  await transport.send({ install, events });
  ok('the transport stores two events', true);
  let r = await mine(install);
  ok('the backend holds exactly those two', r.status === 200 && r.rows.length === 2
    && r.rows.map((x) => x.event_id).sort().join() === events.map((e) => e.id).sort().join(), `${r.status} ${JSON.stringify(r.rows)}`);

  await transport.send({ install, events });
  r = await mine(install);
  ok('a retry of the same two is accepted and stores nothing twice', r.status === 200 && r.rows.length === 2, `${r.status} ${r.rows && r.rows.length}`);

  await transport.send({ install, events: events.slice(0, 1) }, { keepalive: true });
  r = await mine(install);
  ok('a keepalive send of a stored event is accepted too', r.status === 200 && r.rows.length === 2, `${r.status} ${r.rows && r.rows.length}`);

  r = await mine(install, other);
  ok("another install's header sees none of them", r.status === 200 && r.rows.length === 0, `${r.status} ${r.rows && r.rows.length}`);

  const contents = await fetch(`${rest}/usage_events?select=data&install_id=eq.${install}`, { headers: { apikey: BACKEND.key, 'x-install-id': install } });
  ok('event contents cannot be read back, even by the install that sent them', contents.status >= 400, String(contents.status));

  const erased = await transport.erase(install);
  ok('the transport erases the install', erased.ok === true, JSON.stringify(erased));
  r = await mine(install);
  ok('after the erase 0 rows remain', r.status === 200 && r.rows.length === 0, `${r.status} ${r.rows && r.rows.length}`);
} catch (e) {
  ok('the smoke test ran to its end', false, e instanceof Error ? e.message : String(e));
} finally {
  // never leave a row behind, whatever failed above
  await fetch(`${rest}/usage_events?install_id=eq.${install}`, { method: 'DELETE', headers: { apikey: BACKEND.key, 'x-install-id': install } }).catch(() => undefined);
  const left = await mine(install).catch(() => ({ status: 0, rows: null }));
  ok('nothing is left behind', left.status === 200 && left.rows.length === 0, `${left.status} ${left.rows && left.rows.length}`);
}
console.log(`live smoke: ${n - failed}/${n} (install ${install}, erased)`);
process.exit(failed ? 1 : 0);
