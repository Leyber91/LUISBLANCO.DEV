/* ============================================================
   dashboard/main.js — the owner's usage page (labs/dashboard.html).

   One drawing, seven states. The page always shows the same four
   plates at the same height: who is reading (A), totals for the
   chosen range (B), visitors and sessions per day (C), every lab
   (D). What changes with the state is the ink:

     signed-out   the sign-in form; every figure is a dash
     loading      signed in, the read is on its way
     error        the backend or the network failed; "Read again"
     not-owner    signed in, and the backend shows this account no
                  row: nothing is drawn, and the page says why
     empty        the owner, and nothing recorded yet
     data         the owner's rows, counted in ../os/usage.js

   The backend decides who reads what (row-level security); this
   page only draws what it was given. The session is kept in this
   tab's sessionStorage by ../os/owner.js and nowhere else.

   ?fixture=<name> swaps the backend for a stand-in (fixtures.js):
   no request leaves the page and the tab's session is untouched.

   Gold marks what fired: the pressed range, the tick beside a lab
   that was opened, today on the day axis. Everything else is ink.
   ============================================================ */

import { ownerClient, sessionFromFragment, isOwnerAddress } from '../os/owner.js';
import { buildUsage, RANGES, rangeDays } from '../os/usage.js';
import { duration } from '../os/util.js';
import { catalogue } from '../hub/os/catalogue.js';
import { OS_HUB } from '../hub/constants.js';
import { FIXTURES, fixtureClient } from './fixtures.js';
import { dayLabel, dayTable, mountChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const num = (n) => n.toLocaleString('en-US');
const NONE = '–';                                     // a figure that was not read
const VIA = ['card', 'rail', 'welcome'];              // where a link to a lab can sit on the hub (hub/os/Handoffs.js)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utcStamp = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
// every note fits the lines the access plate reserves for it (two on a wide screen, four on a phone)
const LINK_LIMITS = "The project's built-in mailer delivers to the owner's own address only, at most 2 links an hour.";
const short = (text, max = 80) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const STATE_LABEL = {
  'signed-out': 'Signed out', loading: 'Reading', error: 'Read failed', 'not-owner': 'Not the owner', empty: 'Nothing recorded', data: 'Read',
};
const CHART_STAMP = {
  'signed-out': 'SIGNED OUT · NOTHING READ', loading: 'READING', error: 'READ FAILED · NOTHING TO DRAW',
  'not-owner': 'NOT THE OWNER · NOTHING SHOWN', empty: 'NOTHING RECORDED YET',
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v); }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

class Dashboard {
  constructor() {
    const name = new URLSearchParams(location.search).get('fixture');
    this.labs = catalogue().map((c) => ({ id: c.id, title: c.title }));
    this.hub = { id: OS_HUB.lab, title: OS_HUB.title };
    this.fixture = name;
    this.client = name ? fixtureClient(FIXTURES.includes(name) ? name : 'signed-out', this.labs, Date.now()) : ownerClient();
    this.days = 30;
    this.phase = 'signed-out';
    this.note = '';                 // what the access plate says under the form or the account
    this.read = null;               // { byDay, raw, truncated } once the owner's rows are in
    this.readAt = null;
    this.sending = false;
    this.chart = mountChart($('dash-chart'));
  }

  async start() {
    this.wire();
    if (this.fixture) {
      const known = FIXTURES.includes(this.fixture);
      $('dash-fixture').replaceChildren(
        el('span', { class: 'los-label' }, `Fixture · ${this.fixture}`),
        el('span', {}, known
          ? 'Sample data built into the page. Nothing is read from the backend and no link is sent.'
          : `"${this.fixture}" is not a fixture; this page shows the signed-out state and reaches nothing.`));
      $('dash-fixture').hidden = false;
      if (this.client.phase === 'link-sent') this.note = `Link sent. Open it in this browser: it returns here signed in. ${LINK_LIMITS}`;
      if (this.client.phase === 'rate-limited') this.note = 'The mailer has sent its 2 links for this hour (429: email rate limit exceeded). Wait, then ask again.';
    } else {
      // a magic link returns with the session in the fragment: take it and clear the address bar at once
      const back = sessionFromFragment(location.hash, Date.now());
      if (back) history.replaceState(null, '', location.pathname + location.search);
      if (back && 'session' in back) this.client.adopt(back.session);
      if (back && 'error' in back) this.note = `The sign-in link did not work (${short(back.error)}). Ask for a new one.`;
    }
    this.render();
    if (this.client.session()) await this.load();
  }

  wire() {
    $('dash-signin').addEventListener('submit', (e) => { e.preventDefault(); void this.sendLink(); });
    $('dash-signout').addEventListener('click', () => void this.signOut());
    $('dash-retry').addEventListener('click', () => void this.load());
    for (const b of document.querySelectorAll('.dash-filters [data-days]')) {
      b.addEventListener('click', () => { this.days = Number(b.dataset.days); this.render(); });
    }
    const toggle = $('dash-table-toggle');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide table' : 'Table view';
      $('dash-table').hidden = !open;
    });
  }

  async sendLink() {
    const input = $('dash-email');
    const email = input.value.trim();
    if (!email || !input.checkValidity()) { this.note = 'Enter the owner\'s email address.'; this.render(); input.focus(); return; }
    this.sending = true;
    this.note = 'Asking the auth server for a link.';
    this.render();
    const r = await this.client.requestLink(email, location.origin + location.pathname);
    this.sending = false;
    this.note = r.ok ? `Link sent. Open it in this browser: it returns here signed in. ${LINK_LIMITS}`
      : r.reason === 'rate-limited' ? `The mailer has sent its 2 links for this hour (${short(r.detail, 50)}). Wait, then ask again.`
        : r.reason === 'network' ? `The auth server could not be reached (${short(r.detail)}). No link was sent.`
          : `The auth server refused (${short(r.detail, 50)}). ${LINK_LIMITS}`;
    this.render();
  }

  async signOut() {
    await this.client.signOut();
    this.read = null;
    this.readAt = null;
    this.phase = 'signed-out';
    this.note = 'Signed out. This tab has forgotten the session.';
    this.render();
  }

  async load() {
    this.phase = 'loading';
    this.note = 'Reading usage_by_day and usage_events.';
    this.render();
    try {
      const read = await this.client.readUsage(rangeDays(Math.max(...RANGES), Date.now())[0]);
      this.readAt = Date.now();
      if (read.anyRows) {
        this.read = read;
        this.phase = 'data';
        this.note = `Read ${utcStamp(this.readAt)}: ${num(read.raw.length)} session events and ${num(read.byDay.length)} daily counts of the last ${Math.max(...RANGES)} days.`
          + (read.truncated ? ' The read stopped at its limit, so the oldest days are short.' : '');
      } else {
        // zero rows means "not the owner" or "nothing recorded yet"; the address tells which to say
        const email = this.client.session()?.email ?? null;
        const owner = this.fixture ? this.client.owner : await isOwnerAddress(email);
        this.read = null;
        this.phase = owner ? 'empty' : 'not-owner';
        this.note = owner
          ? 'Signed in as the owner. No usage has been recorded yet: no visitor has allowed sharing, or none has returned since.'
          : 'This account is not the owner. Usage is readable by the owner only, so nothing is shown.';
      }
    } catch (e) {
      this.read = null;
      if (e && e.kind === 'signed-out') {
        this.phase = 'signed-out';
        this.note = 'The session has ended. Sign in again.';
      } else {
        this.phase = 'error';
        const where = e && e.kind === 'network' ? 'The backend could not be reached' : 'The backend did not answer the read';
        this.note = `${where} (${short(e instanceof Error ? e.message : String(e))}). Nothing below was read: the dashes are not zeros.`;
      }
    }
    this.render();
  }

  render() {
    const session = this.client.session();
    const live = this.phase === 'data' && this.read !== null;
    const model = buildUsage(live ? this.read.byDay : [], live ? this.read.raw : [], { days: this.days, now: Date.now(), catalogue: this.labs, hub: this.hub });
    const range = `last ${this.days} days`;
    document.body.dataset.state = this.phase;

    // Plate A
    $('dash-state').textContent = STATE_LABEL[this.phase];
    $('dash-signin').hidden = session !== null;
    $('dash-account').hidden = session === null;
    $('dash-send').disabled = this.sending;
    $('dash-who').textContent = session ? (session.email ?? 'an account with no address') : '';
    $('dash-retry').hidden = !(this.phase === 'error' || this.phase === 'data');
    $('dash-message').textContent = this.note || `Owner only. ${LINK_LIMITS}`;

    // the title block and the range
    $('dash-range-stamp').textContent = `${range} · ${dayLabel(model.from)} to ${dayLabel(model.to)}`;
    $('dash-read-stamp').textContent = live && this.readAt ? utcStamp(this.readAt) : 'not read';
    $('dash-b-range').textContent = range;
    for (const b of document.querySelectorAll('.dash-filters [data-days]')) b.setAttribute('aria-pressed', String(Number(b.dataset.days) === this.days));

    // Plate B
    const t = model.totals;
    const figure = (id, text) => { $(id).textContent = live ? text : NONE; };
    figure('dash-t-visitors', num(t.visitors));
    figure('dash-t-sessions', num(t.sessions));
    figure('dash-t-opens', num(t.labOpens));
    figure('dash-t-visible', duration(t.visibleMs));
    figure('dash-t-actions', num(t.actions));
    figure('dash-t-errors', num(t.errors));

    // Plate C
    this.chart.update({ daily: model.daily, live, stamp: CHART_STAMP[this.phase] ?? '' });
    $('dash-table').replaceChildren(dayTable(model.daily, live));
    $('dash-chart-note').textContent = live ? 'UTC days. The gold tick is today, still counting.' : 'UTC days.';

    // Plate D
    $('dash-labs').replaceChildren(...model.labs.map((lab) => this.labRow(lab, live)));
    // one short line in every state, so the plate's head never wraps
    $('dash-never').textContent = live
      ? (model.neverOpened.length ? `${model.neverOpened.length} of ${this.labs.length} never opened · ${this.days} days` : `all ${this.labs.length} opened · ${this.days} days`)
      : `${this.labs.length} labs`;

    // what the figures rest on; a tag belongs to figures, so a state that shows none carries none
    const basis = this.fixture
      ? (live ? ' Sample data built into this page (assets/js/dashboard/fixtures.js), counted by the same code as real rows. Nothing was read from the backend.'
        : 'A fixture: nothing was read from the backend, and no figure is shown.')
      : live ? ` Counted in this page from usage_by_day and usage_events (Supabase, EU West, Paris), read ${utcStamp(this.readAt)}. Raw events older than 90 days exist only as daily counts.`
        : 'Nothing has been read, so no figure is shown.';
    $('dash-evidence').replaceChildren(...(live ? [el('span', { class: 'lop-tag' }, this.fixture ? '[ILLUSTRATIVE]' : '[REAL]')] : []), basis);
  }

  labRow(lab, live) {
    const cell = (label, text, cls = 'n') => el('td', { role: 'cell', class: cls, 'data-label': label }, text);
    const n = (v) => (live && v !== null ? num(v) : NONE);
    const never = live && lab.kind === 'lab' && !lab.opened;
    const name = el('th', { role: 'rowheader', scope: 'row', class: 'lab' },
      el('i', { class: 'dash-tick', 'aria-hidden': 'true' }),
      el('span', { class: 'dash-lab-name' }, lab.title),
      never && el('span', { class: 'dash-flag' }, 'never opened'));
    // links followed to the lab from the hub, by where they sat; the hub itself has none
    const via = new Map(lab.from.map((f) => [f.via, f.n]));
    const other = lab.from.filter((f) => !VIA.includes(f.via)).reduce((sum, f) => sum + f.n, 0);
    const arrivals = live && lab.kind !== 'hub';
    const from = (label, count, edge = '') => cell(label, arrivals ? num(count) : NONE, `n via${edge}`);
    // the same four counts as one line, for the narrow layout where the table is a list
    const line = never ? 'never opened'
      : arrivals && lab.from.length ? [...VIA.map((v) => [v, via.get(v) ?? 0]), ['other', other]].filter(([, c]) => c > 0).map(([v, c]) => `${v} ${num(c)}`).join(' · ')
        : NONE;
    return el('tr', { role: 'row', 'data-kind': lab.kind, 'data-opened': live ? String(lab.opened) : undefined },
      name,
      cell('Visitors', n(lab.visitors)),
      cell('Sessions', n(lab.sessions)),
      cell('Opens', n(lab.opens)),
      cell('Visible time', live && lab.visibleMs !== null ? duration(lab.visibleMs) : NONE),
      cell('Actions', n(lab.actions)),
      cell('Errors', n(lab.errors), live && lab.errors !== null && lab.errors > 0 ? 'n hot' : 'n'),
      from('Card', via.get('card') ?? 0, ' via-first'),
      from('Rail', via.get('rail') ?? 0),
      from('Welcome', via.get('welcome') ?? 0),
      from('Other', other, ' via-last'),
      cell('From the hub', line, 'from-line'));
  }
}

void new Dashboard().start();
