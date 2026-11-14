/* ============================================================
   dashboard/fixtures.js — stand-ins for the backend, so every
   state of the dashboard can be seen without signing in.

   labs/dashboard.html?fixture=<name> runs the page against one of
   these. A fixture never touches the network and never reads or
   writes the tab's session; the page shows a stamp saying so.

     signed-out    no session: the sign-in form
     link-sent     the form after a link was asked for
     rate-limited  the form after the mailer answered 429
     loading       signed in as the owner, the read not back yet
     error         signed in as the owner, the backend answered 503
     not-owner     signed in as someone else: zero rows
     empty         signed in as the owner, nothing recorded yet
     owner-data    signed in as the owner, 90 days of sample usage

   sampleUsage() makes rows in the shapes the Data API returns
   (usage_by_day and usage_events), from a seeded generator, so
   the page computes its figures from them with the same code as
   from real rows, and a given day always draws the same picture.
   The sample is small on purpose: a personal site, a few
   visitors a day, most labs reached from the hub, two labs
   recording their own sessions, a few labs nobody opened.
   No DOM here: tests.mjs runs this file in Node.
   ============================================================ */

export const FIXTURES = ['signed-out', 'link-sent', 'rate-limited', 'loading', 'error', 'not-owner', 'empty', 'owner-data'];

const DAY = 86_400_000, MIN = 60_000;
const DAYS = 90;
const INSTALLS = 58;
/** the two labs that, in the sample, record their own sessions (as the hub does) */
const RECORDING = ['heptapod', 'token-ekg'];
const VIA = ['card', 'card', 'card', 'card', 'rail', 'welcome'];

/** mulberry32: a small seeded generator, the same sequence on every machine */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (t) => new Date(t).toISOString();
const dayOf = (t) => iso(t).slice(0, 10);

/**
 * Ninety days of sample usage ending today.
 * @param {{id: string}[]} catalogue the labs a visitor can open, in hub order
 * @param {number} now ms since the epoch
 * @returns {{ byDay: object[], raw: object[] }}
 */
export function sampleUsage(catalogue, now) {
  const rnd = seeded(20261113);
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const ids = catalogue.map((c) => c.id);
  // the last three labs of the catalogue are never opened; the two before them only in the first month of the sample
  const never = new Set(ids.slice(-3));
  const early = new Set(ids.slice(-5, -3));
  const weight = (id, i, age) => (never.has(id) || (early.has(id) && age < 60) ? 0 : 1 / (1 + i * 0.35));
  const raw = [];
  const counts = new Map();                      // "day|lab|type" -> events
  const bump = (t, lab, type, n = 1) => { const k = `${dayOf(t)}|${lab}|${type}`; counts.set(k, (counts.get(k) || 0) + n); };
  const row = (t, lab, type, install, session, data) => { raw.push({ t: iso(t), lab, type, install_id: install, session, data }); bump(t, lab, type); };
  let s = 0;

  for (let age = DAYS - 1; age >= 0; age--) {
    const start = today - age * DAY;
    const weekday = new Date(start).getUTCDay();
    // a slow rise over the quarter, quieter weekends, and a busy week after a post went out
    const base = 1.2 + (DAYS - age) * 0.045 + (weekday === 0 || weekday === 6 ? -0.9 : 0.6) + (age >= 18 && age <= 23 ? 4.5 : 0);
    const visitors = Math.max(0, Math.round(base + (rnd() - 0.5) * 3));
    const seen = new Set();
    for (let v = 0; v < visitors; v++) {
      const install = `sample-${String(1 + Math.floor(rnd() * INSTALLS)).padStart(2, '0')}`;
      if (seen.has(install)) continue;
      seen.add(install);
      const sessions = rnd() < 0.3 ? 2 : 1;
      for (let k = 0; k < sessions; k++) {
        const session = `sample-s${++s}`;
        let t = start + Math.floor((8 + rnd() * 13) * 60) * MIN;
        if (age === 0) t = Math.min(t, now - 5 * MIN);
        row(t, 'hub', 'lab.open', install, session, { path: '/labs/index.html' });
        bump(t, 'hub', 'lab.action', Math.floor(rnd() * 4));
        let visible = Math.round((20 + rnd() * 160) * 1000);
        if (rnd() < 0.25) row(t + visible, 'hub', 'lab.leave', install, session, { visibleMs: visible, totalMs: visible + 4000, final: false });
        const handoffs = rnd() < 0.72 ? 1 + Math.floor(rnd() * 2.2) : 0;
        for (let h = 0; h < handoffs; h++) {
          const w = ids.map((id, i) => weight(id, i, age));
          let pick = rnd() * w.reduce((a, b) => a + b, 0), to = ids[0];
          for (let i = 0; i < ids.length; i++) { pick -= w[i]; if (pick <= 0) { to = ids[i]; break; } }
          visible += Math.round(rnd() * 30_000);
          const at = t + visible;
          row(at, 'hub', 'lab.handoff', install, session, { to, via: VIA[Math.floor(rnd() * VIA.length)] });
          if (RECORDING.includes(to)) {
            const own = `sample-s${++s}`;
            const stay = Math.round((1 + rnd() * 14) * MIN);
            row(at + 1500, to, 'lab.open', install, own, { path: `/labs/${to}.html` });
            bump(at, to, 'lab.action', 2 + Math.floor(rnd() * 14));
            bump(at, to, 'lab.outcome', Math.floor(rnd() * 3));
            if (rnd() < 0.06) bump(at, to, 'lab.error', 1);
            row(at + 1500 + stay, to, 'lab.leave', install, own, { visibleMs: Math.round(stay * (0.6 + rnd() * 0.4)), totalMs: stay, final: true });
          }
        }
        row(t + visible + 2000, 'hub', 'lab.leave', install, session, { visibleMs: visible, totalMs: visible + 2000, final: true });
      }
    }
  }

  const byDay = [...counts].filter(([, n]) => n > 0).map(([k, events]) => {
    const [day, lab, type] = k.split('|');
    return { day, lab, type, events, installs: 0, sessions: 0, visible_ms: 0 };
  }).sort((a, b) => a.day.localeCompare(b.day) || a.lab.localeCompare(b.lab) || a.type.localeCompare(b.type));
  raw.sort((a, b) => b.t.localeCompare(a.t));
  return { byDay, raw };
}

const SESSION = (email) => ({ accessToken: 'fixture', refreshToken: 'fixture', expiresAt: Number.MAX_SAFE_INTEGER, email });

/**
 * The page's backend client, played by a fixture. Same methods as ownerClient() in ../os/owner.js, plus
 * `owner` (what the owner hint would say) and `phase` (a state of the sign-in form to start in).
 */
export function fixtureClient(name, catalogue, now) {
  const signedIn = ['loading', 'error', 'not-owner', 'empty', 'owner-data'].includes(name);
  let session = signedIn ? SESSION(name === 'not-owner' ? 'someone@example.org' : 'owner@example.org') : null;
  return {
    fixture: name,
    owner: name !== 'not-owner',
    phase: name === 'link-sent' || name === 'rate-limited' ? name : null,
    session: () => session,
    adopt: (s) => { session = s; },
    async signOut() { session = null; },
    async requestLink() {
      return name === 'rate-limited'
        ? { ok: false, reason: 'rate-limited', detail: '429: email rate limit exceeded' }
        : { ok: true };
    },
    readUsage() {
      if (name === 'loading') return new Promise(() => { /* never answers */ });
      if (name === 'error') {
        const e = new Error('the backend answered 503');
        e.kind = 'backend';
        return Promise.reject(e);
      }
      if (name === 'owner-data') return Promise.resolve({ ...sampleUsage(catalogue, now), anyRows: true, truncated: false });
      return Promise.resolve({ byDay: [], raw: [], anyRows: false, truncated: false });
    },
  };
}
