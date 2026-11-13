/* ============================================================
   labs-src/os/ui.ts — the visitor-facing pieces of Labs OS, drawn as
   plates (styles in labs/assets/css/os.css, classes "los-"):

     resumePlate      "since your last visit": the last lab, how
                      long ago, continue, and what's next with the
                      reason for each
     dataPanel        "Your data": what is stored, export, delete,
                      and the sharing choice when consent is on
     consentBanner    the sharing question, two choices of equal
                      weight, nothing pre-selected
     storageStamp     a one-line note of where the record is kept
     fixtureStamp     says the page runs on a seeded fixture

   Every string is set with textContent; nothing here parses HTML.
   ============================================================ */

import type { OSConfig } from './config.js';
import type { Consent, ConsentRecord } from './consent.js';
import type { LabsOSInstance, StorageInfo } from './index.js';
import type { Suggestion } from './resume.js';
import { dayMonth } from './util.js';

type Attrs = Record<string, string | boolean | undefined>;
type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** The four gold corner brackets every plate carries. */
const brackets = (): HTMLElement[] =>
  ['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: `los-bk ${p}`, 'aria-hidden': 'true' }));

/* ---------------- the resume plate ---------------- */

export interface PlateLast {
  readonly title: string;
  readonly href: string;
  /** "2 hours ago · 14 min in view" */
  readonly when: string;
  /** the lab's own resume label, when it set one */
  readonly resumeLabel: string | null;
}

export interface ResumePlateInput {
  readonly last: PlateLast | null;
  readonly next: readonly Suggestion[];
  /** the plate's letter in the page's sequence */
  readonly plate?: string;
  readonly persistent: boolean;
  /** what the record holds, for the plate's title block ("14 events since 9 Nov") */
  readonly record?: string | null;
  /** where "Your data" opens (default #your-data) */
  readonly dataHref?: string;
}

export function resumePlate(input: ResumePlateInput): HTMLElement {
  const id = 'los-welcome-h';
  const head = h('header', { class: 'los-head' },
    h('span', { class: 'los-label' }, `Plate ${input.plate ?? '0'} · Since your last visit`));
  const kept = input.persistent ? 'kept in this browser' : 'kept until this tab closes';
  const foot = h('footer', { class: 'los-foot' },
    h('span', { class: 'los-stamp' }, input.record ? `Record · ${input.record} · ${kept}` : `Record · ${kept}`),
    h('a', { class: 'los-link', href: input.dataHref ?? '#your-data' }, 'Your data'));

  const last = input.last
    ? h('div', { class: 'los-last' },
      h('span', { class: 'los-label' }, 'Last open'),
      h('h2', { class: 'los-display', id }, input.last.title),
      h('p', { class: 'los-meta' }, h('span', { class: 'los-tick', 'aria-hidden': 'true' }), input.last.when),
      h('a', { class: 'los-btn los-go', href: input.last.href },
        input.last.resumeLabel ? `Continue at ${input.last.resumeLabel}` : 'Continue'))
    : null;

  const list = h('ol', { class: 'los-list' });
  input.next.forEach((s, i) => {
    list.append(h('li', { 'data-kind': s.kind },
      h('a', { href: s.href, 'data-lab': s.lab },
        h('span', { class: 'los-n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'los-title' }, s.title),
        h('em', { class: 'los-world' }, s.worldName),
        h('span', { class: 'los-why' }, s.reason))));
  });
  const next = input.next.length
    ? h('div', { class: 'los-next' },
      h('span', { class: 'los-label', id: last ? undefined : id }, "What's next"),
      list)
    : null;

  return h('section', { class: `los-plate los-welcome${last ? '' : ' no-last'}`, 'aria-labelledby': id },
    ...brackets(), head, h('div', { class: 'los-welcome-grid' }, last, next), foot);
}

/* ---------------- stamps ---------------- */

export function storageStamp(s: StorageInfo): HTMLElement {
  return h('span', { class: `los-stamp${s.persistent ? '' : ' warn'}`, title: s.note || undefined },
    s.persistent ? 'Record kept in this browser' : 'Not kept: this window blocks storage');
}

export function fixtureStamp(s: StorageInfo): HTMLElement | null {
  if (!s.fixture) return null;
  return h('div', { class: 'los-fixture', role: 'note' },
    h('span', { class: 'los-label' }, `Fixture · ${s.fixture}`),
    h('span', {}, 'Fixture data in memory. Your own record is not read or written.'));
}

/* ---------------- consent ---------------- */

function consentWords(r: ConsentRecord): string {
  if (r.state === 'granted' && r.t !== null) return `Allowed on ${dayMonth(r.t)}`;
  if (r.state === 'denied' && r.t !== null) return `Refused on ${dayMonth(r.t)}`;
  return 'Not chosen';
}

/** Two buttons of equal weight; neither is pressed until the visitor chooses. */
function choicePair(consent: Consent, after?: (r: ConsentRecord) => void): { el: HTMLElement; set(r: ConsentRecord): void } {
  const allow = h('button', { type: 'button', class: 'los-btn', 'data-choice': 'granted', 'aria-pressed': 'false' }, 'Allow sending');
  const deny = h('button', { type: 'button', class: 'los-btn', 'data-choice': 'denied', 'aria-pressed': 'false' }, 'Keep it here');
  const el = h('div', { class: 'los-choice', role: 'group', 'aria-label': 'Sharing choice' }, allow, deny);
  const set = (r: ConsentRecord) => {
    allow.setAttribute('aria-pressed', String(r.state === 'granted'));
    deny.setAttribute('aria-pressed', String(r.state === 'denied'));
  };
  for (const b of [allow, deny]) {
    b.addEventListener('click', async () => {
      const r = await consent.set(b.dataset['choice'] === 'granted' ? 'granted' : 'denied');
      set(r);
      after?.(r);
    });
  }
  return { el, set };
}

export function consentCopy(config: OSConfig): string {
  return `Labs can send your activity record (the labs you open, for how long, and what each lab saves) to ${config.recipient}. ` +
    'That would carry your progress to your other devices and show the author which labs are used. ' +
    'Nothing is sent unless you allow it, and you can change your answer under Your data.';
}

export function mountConsentBanner(root: HTMLElement, consent: Consent, config: OSConfig): { el: HTMLElement; destroy(): void } {
  const pair = choicePair(consent, () => destroy());
  const el = h('section', { class: 'los-plate los-consent', role: 'region', 'aria-label': 'Sharing choice' },
    ...brackets(),
    h('span', { class: 'los-label' }, 'Sharing · not chosen'),
    h('p', { class: 'los-copy' }, consentCopy(config)),
    pair.el);
  root.append(el);
  const destroy = () => el.remove();
  return { el, destroy };
}

/* ---------------- the "Your data" panel ---------------- */

const SETTING_NAMES: Record<string, string> = {
  'visit.last': 'last visit',
  consent: 'sharing choice',
  install: 'install id',
  'outbox.cursor': 'send position',
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface DataPanel {
  readonly el: HTMLDialogElement;
  open(): Promise<void>;
  close(): void;
  refresh(): Promise<void>;
  destroy(): void;
}

export function dataPanel(os: LabsOSInstance, opts: { root?: HTMLElement; now?: () => number } = {}): DataPanel {
  const now = opts.now ?? Date.now;
  const rows = h('dl', { class: 'los-rows' });
  const status = h('p', { class: 'los-status', role: 'status', 'aria-live': 'polite' });
  const exportBtn = h('button', { type: 'button', class: 'los-btn', 'data-act': 'export' }, 'Export JSON');
  const deleteBtn = h('button', { type: 'button', class: 'los-btn', 'data-act': 'delete' }, 'Delete everything');
  const closeBtn = h('button', { type: 'button', class: 'los-btn los-quiet-btn', 'data-act': 'close' }, 'Close');
  const confirmYes = h('button', { type: 'button', class: 'los-btn', 'data-act': 'confirm' }, 'Delete');
  const confirmNo = h('button', { type: 'button', class: 'los-btn', 'data-act': 'keep' }, 'Keep');
  const confirmText = h('span', { class: 'los-confirm-text' });
  const confirm = h('div', { class: 'los-confirm', hidden: true }, confirmText, confirmNo, confirmYes);
  const actions = h('div', { class: 'los-actions' }, exportBtn, deleteBtn, closeBtn);
  const sends = !!os.outbox.transport;
  const lead = h('p', { class: 'los-copy' },
    'Labs OS keeps a record in this browser so the labs can tell you where you left off. ' +
    (sends ? `It sends that record to ${os.config.recipient} only if you allow it below.` : 'It sends nothing anywhere.'));

  const el = h('dialog', { class: 'los-panel', 'aria-labelledby': 'los-data-h' },
    h('div', { class: 'los-plate' },
      ...brackets(),
      h('header', { class: 'los-head' },
        h('span', { class: 'los-label' }, 'Plate D · Your data'),
        h('span', { class: 'los-label los-quiet' }, os.storage.fixture ? `Fixture · ${os.storage.fixture}` : 'This browser')),
      h('h2', { class: 'los-display', id: 'los-data-h' }, 'Your data'),
      lead, rows, actions, confirm, status));
  el.addEventListener('cancel', () => close());

  let total = 0;
  async function refresh(): Promise<void> {
    const s = await os.privacy.summary();
    total = s.counts.events + s.counts.progress + s.counts.meta;
    const span = s.firstEvent === null || s.lastEvent === null ? 'none yet'
      : `${count(s.counts.events, 'event', 'events')}, ${dayMonth(s.firstEvent)} to ${dayMonth(s.lastEvent)}`;
    const where = os.storage.persistent
      ? 'IndexedDB in this browser, until you delete it here or clear this site\'s data. A private window discards it when it closes.'
      : `Memory only: ${os.storage.note}.`;
    const items: [string, string | HTMLElement][] = [
      ['Kept in', where],
      ['Activity log', span],
      ['Saved progress', s.labs.length ? `${count(s.labs.length, 'lab', 'labs')}: ${s.labs.join(', ')}` : 'none yet'],
      ['Settings', s.settings.length ? s.settings.map((k) => SETTING_NAMES[k] ?? k).join(', ') : 'none'],
    ];
    if (os.config.consentUi) {
      const c = await os.consent.get();
      const pair = choicePair(os.consent, () => void refresh());
      pair.set(c);
      items.push(['Sharing', h('span', { class: 'los-sharing' }, h('span', {}, consentWords(c)), pair.el)]);
    }
    rows.replaceChildren(...items.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    deleteBtn.disabled = total === 0;
    exportBtn.disabled = total === 0;
  }

  async function doExport(): Promise<void> {
    const file = await os.privacy.exportAll();
    const name = `labs-data-${new Date(now()).toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: name, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    status.textContent = `Exported ${count(file.counts.events, 'event', 'events')}, ` +
      `${count(file.counts.progress, 'progress record', 'progress records')} and ${count(file.counts.meta, 'setting', 'settings')} as ${name}.`;
  }

  function askDelete(): void {
    confirmText.textContent = `Delete ${count(total, 'record', 'records')} from this browser?`;
    actions.hidden = true;
    confirm.hidden = false;
    confirmNo.focus();
  }

  async function doDelete(): Promise<void> {
    const r = await os.privacy.deleteAll();
    confirm.hidden = true;
    actions.hidden = false;
    const gone = r.deleted.events + r.deleted.progress + r.deleted.meta;
    const left = r.remaining.events + r.remaining.progress + r.remaining.meta;
    status.textContent = r.ok
      ? `Deleted ${count(gone, 'record', 'records')}; none remain. Nothing more is recorded on this page.`
      : `Deleted ${count(gone, 'record', 'records')}, but ${left} remain. Close every lab tab and try again.`;
    await refresh();
  }

  exportBtn.addEventListener('click', () => void doExport());
  deleteBtn.addEventListener('click', askDelete);
  confirmNo.addEventListener('click', () => { confirm.hidden = true; actions.hidden = false; deleteBtn.focus(); });
  confirmYes.addEventListener('click', () => void doDelete());
  closeBtn.addEventListener('click', () => close());

  (opts.root ?? document.body).append(el);

  function close(): void {
    confirm.hidden = true;
    actions.hidden = false;
    if (typeof el.close === 'function' && el.open) el.close();
    else el.removeAttribute('open');
  }

  return {
    el,
    async open() {
      status.textContent = '';
      await refresh();
      if (typeof el.showModal === 'function') { if (!el.open) el.showModal(); }
      else el.setAttribute('open', '');
    },
    close,
    refresh,
    destroy() { close(); el.remove(); },
  };
}
