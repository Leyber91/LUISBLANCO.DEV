/* ============================================================
   labs-src/os/ui.ts — the visitor-facing pieces of Labs OS, drawn as
   plates (styles in labs/assets/css/os.css, classes "los-"):

     resumePlate      "since your last visit": the last lab, how
                      long ago, continue, and what's next with the
                      reason for each
     dataPanel        "Your data": the recording switch, what is
                      stored (labs by title), export, delete, and
                      the sharing choice with its erase
     consentBanner    the sharing question: what is sent, what never
                      is, where it is kept, and two choices of equal
                      weight with nothing pre-selected
     storageStamp     a one-line note of where the record is kept,
                      and whether usage is shared
     fixtureStamp     says the page runs on a seeded fixture

   Every string is set with textContent; nothing here parses HTML.
   ============================================================ */
import { dayMonth } from './util.js';
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === false)
            continue;
        if (k === 'class')
            el.className = String(v);
        else
            el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children)
        if (c !== null && c !== undefined && c !== false)
            el.append(c);
    return el;
}
/** The four gold corner brackets every plate carries. */
const brackets = () => ['tl', 'tr', 'bl', 'br'].map((p) => h('i', { class: `los-bk ${p}`, 'aria-hidden': 'true' }));
export function resumePlate(input) {
    const id = 'los-welcome-h';
    const head = h('header', { class: 'los-head' }, h('span', { class: 'los-label' }, `Plate ${input.plate ?? '0'} · Since your last visit`));
    const kept = (input.persistent ? 'kept in this browser' : 'kept until this tab closes') + (input.sharing ? ' · usage shared' : '');
    const on = input.recording !== false;
    const foot = h('footer', { class: `los-foot${on ? '' : ' off'}` }, h('span', { class: 'los-stamp' }, on
        ? (input.record ? `Record · ${input.record} · ${kept}` : `Record · ${kept}`)
        : `Recording off · the record is ${input.persistent ? 'kept only in this browser' : 'kept until this tab closes'}`), h('a', { class: 'los-link', href: input.dataHref ?? '#your-data' }, on ? 'Your data' : 'Turn it back on in Your data'));
    const last = input.last
        ? h('div', { class: 'los-last' }, h('span', { class: 'los-label' }, 'Last open'), h('h2', { class: 'los-display', id }, input.last.title), h('p', { class: 'los-meta' }, h('span', { class: 'los-tick', 'aria-hidden': 'true' }), input.last.when), h('a', { class: 'los-btn los-go', href: input.last.href }, input.last.resumeLabel ? `Continue at ${input.last.resumeLabel}` : 'Continue'))
        : null;
    const list = h('ol', { class: 'los-list' });
    input.next.forEach((s, i) => {
        list.append(h('li', { 'data-kind': s.kind }, h('a', { href: s.href, 'data-lab': s.lab }, h('span', { class: 'los-n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), h('span', { class: 'los-title' }, s.title), h('em', { class: 'los-world' }, s.worldName), h('span', { class: 'los-why' }, s.reason))));
    });
    const next = input.next.length
        ? h('div', { class: 'los-next' }, h('span', { class: 'los-label', id: last ? undefined : id }, "What's next"), list)
        : null;
    return h('section', { class: `los-plate los-welcome${last ? '' : ' no-last'}`, 'aria-labelledby': id }, ...brackets(), head, h('div', { class: 'los-welcome-grid' }, last, next), foot);
}
/* ---------------- stamps ---------------- */
export function storageStamp(s, recording = true, sharing = false) {
    return h('span', { class: `los-stamp${s.persistent && recording ? '' : ' warn'}`, title: s.note || undefined }, !s.persistent ? 'Not kept: this window blocks storage'
        : !recording ? 'Recording off'
            : sharing ? 'Record kept in this browser · usage shared' : 'Record kept in this browser');
}
export function fixtureStamp(s) {
    if (!s.fixture)
        return null;
    return h('div', { class: 'los-fixture', role: 'note' }, h('span', { class: 'los-label' }, `Fixture · ${s.fixture}`), h('span', {}, 'Fixture data in memory. Your own record is not read or written, and nothing is sent.'));
}
/* ---------------- consent ---------------- */
/** The sharing choice in words, with what it means right now. */
export function sharingWords(r, recording, recipient) {
    if (r.state === 'granted' && r.t !== null) {
        return recording
            ? `On since ${dayMonth(r.t)}: usage events go to ${recipient}.`
            : `Allowed on ${dayMonth(r.t)}, but recording is off, so nothing is recorded and nothing is sent.`;
    }
    if (r.state === 'denied' && r.t !== null)
        return `Off since ${dayMonth(r.t)}: nothing is sent.`;
    return 'Not chosen: nothing is sent.';
}
/** Two buttons of equal weight; neither is pressed until the visitor chooses. */
function choicePair(consent, after) {
    const allow = h('button', { type: 'button', class: 'los-btn', 'data-choice': 'granted', 'aria-pressed': 'false' }, 'Allow');
    const deny = h('button', { type: 'button', class: 'los-btn', 'data-choice': 'denied', 'aria-pressed': 'false' }, 'No thanks');
    const el = h('div', { class: 'los-choice', role: 'group', 'aria-label': 'Sharing choice' }, allow, deny);
    const set = (r) => {
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
export function consentCopy(config) {
    return {
        ask: 'Send usage of the labs to their author? If you choose Allow, this browser sends:',
        sent: [
            'which lab you open, and from where',
            'how long the page was visible',
            'which kinds of controls you used',
            'a random id for this browser',
        ],
        never: 'Never anything you type. No name, email or IP address is stored with the events.',
        kept: `They are kept in the EU, at ${config.recipient}, and raw events are reduced to daily counts after 90 days.`,
        change: 'Nothing is sent before you choose Allow, and you can change your answer in Your data.',
    };
}
export function mountConsentBanner(root, consent, config) {
    const copy = consentCopy(config);
    const pair = choicePair(consent, () => destroy());
    const el = h('section', { class: 'los-plate los-consent', role: 'region', 'aria-label': 'Sharing choice' }, ...brackets(), h('span', { class: 'los-label' }, 'Sharing · not chosen'), h('p', { class: 'los-copy' }, copy.ask), h('ul', { class: 'los-sent' }, ...copy.sent.map((line) => h('li', {}, line))), h('p', { class: 'los-copy' }, copy.never), h('p', { class: 'los-copy los-fine' }, `${copy.kept} ${copy.change} `, h('a', { class: 'los-link', href: config.privacyHref }, 'Privacy page')), pair.el);
    root.append(el);
    const destroy = () => el.remove();
    return { el, destroy };
}
/* ---------------- the "Your data" panel ---------------- */
const SETTING_NAMES = {
    'visit.last': 'last visit',
    consent: 'sharing choice',
    install: 'install id',
    'outbox.cursor': 'send position',
    recording: 'recording choice',
    'log.dropped': 'summary of earlier events',
};
const num = (n) => n.toLocaleString('en-US');
const count = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
export function dataPanel(os, opts = {}) {
    const now = opts.now ?? Date.now;
    const title = (lab) => opts.titleOf?.(lab) || lab;
    const rows = h('dl', { class: 'los-rows' });
    const status = h('p', { class: 'los-status', role: 'status', 'aria-live': 'polite' });
    const exportBtn = h('button', { type: 'button', class: 'los-btn', 'data-act': 'export' }, 'Export JSON');
    const deleteBtn = h('button', { type: 'button', class: 'los-btn', 'data-act': 'delete' }, 'Delete everything');
    // Close takes the focus when the panel opens, so a stray Enter never flips recording or starts a delete.
    const closeBtn = h('button', { type: 'button', class: 'los-btn los-quiet-btn', 'data-act': 'close', autofocus: true }, 'Close');
    const confirmYes = h('button', { type: 'button', class: 'los-btn', 'data-act': 'confirm' }, 'Delete');
    const confirmNo = h('button', { type: 'button', class: 'los-btn', 'data-act': 'keep' }, 'Keep');
    const confirmText = h('span', { class: 'los-confirm-text' });
    const confirm = h('div', { class: 'los-confirm', hidden: true }, confirmText, confirmNo, confirmYes);
    const actions = h('div', { class: 'los-actions' }, exportBtn, deleteBtn, closeBtn);
    const sends = os.sharing.available;
    const kept = sends
        ? 'The record stays in this browser; usage events leave it only if you allow that under Sharing.'
        : 'The record is kept only in this browser and nothing is sent anywhere.';
    const lead = h('p', { class: 'los-copy' }, 'Labs OS keeps a record of your visits so the labs can tell you where you left off. ', h('a', { class: 'los-link', href: os.config.privacyHref }, 'Privacy page'));
    const recBtn = h('button', { type: 'button', class: 'los-btn', 'data-act': 'recording' });
    const eraseBtn = h('button', { type: 'button', class: 'los-btn los-quiet-btn', 'data-act': 'erase' }, 'Erase what was sent');
    const el = h('dialog', { class: 'los-panel', 'aria-labelledby': 'los-data-h' }, h('div', { class: 'los-plate' }, ...brackets(), h('header', { class: 'los-head' }, h('span', { class: 'los-label' }, 'Plate D · Your data'), h('span', { class: 'los-label los-quiet' }, os.storage.fixture ? `Fixture · ${os.storage.fixture}` : 'This browser')), h('h2', { class: 'los-display', id: 'los-data-h' }, 'Your data'), lead, rows, actions, confirm, status));
    el.addEventListener('cancel', () => close());
    let total = 0;
    let everShared = false;
    let sharing = 'unset';
    async function refresh() {
        const s = await os.privacy.summary();
        const on = os.recording.on;
        const c = await os.consent.get();
        sharing = c.state;
        everShared = sends && await os.sharing.everOn();
        // the choices that say "off" survive a delete, so they are not among the records a delete removes
        total = s.counts.events + s.counts.progress + s.counts.meta
            - (on || !s.settings.includes('recording') ? 0 : 1) - (c.state === 'denied' ? 1 : 0);
        let span = s.firstEvent === null || s.lastEvent === null ? 'none yet'
            : `${count(s.counts.events, 'event', 'events')}, ${dayMonth(s.firstEvent)} to ${dayMonth(s.lastEvent)}`;
        span += `. Keeps the newest ${num(s.maxEvents)}.`;
        if (s.dropped) {
            const by = Object.entries(s.dropped.byLab).sort((a, b) => b[1] - a[1]).map(([lab, n]) => `${title(lab)} ${num(n)}`);
            span += ` ${count(s.dropped.total, 'earlier event', 'earlier events')} summarised (${dayMonth(s.dropped.since)} to ${dayMonth(s.dropped.until)}): ${by.join(', ')}.`;
        }
        const where = os.storage.persistent
            ? 'IndexedDB in this browser, until you delete it here or clear this site\'s data. A private window discards it when it closes.'
            : `Memory only: ${os.storage.note}.`;
        recBtn.textContent = on ? 'Stop recording' : 'Turn recording on';
        const recWords = on
            ? `On: the labs you open and what you do in them are logged. ${kept}`
            : `Off${os.recording.since ? ` since ${dayMonth(os.recording.since)}` : ''}: nothing new is logged, and what was logged before stays until you delete it. ${kept}`;
        const items = [
            ['Recording', h('span', { class: 'los-recording' }, h('span', {}, recWords), recBtn)],
            ['Kept in', where],
            ['Activity log', span],
            ['Saved progress', s.labs.length ? `${count(s.labs.length, 'lab', 'labs')}: ${s.labs.map(title).join(', ')}` : 'none yet'],
            ['Settings', s.settings.length ? s.settings.map((k) => SETTING_NAMES[k] ?? k).join(', ') : 'none'],
        ];
        if (os.config.consentUi && sends) {
            const pair = choicePair(os.consent, (r) => {
                status.textContent = r.state === 'granted'
                    ? `Sharing is on. Usage events recorded from now on go to ${os.config.recipient}.`
                    : 'Sharing is off. Nothing more is sent. What was sent before stays until you erase it.';
                void refresh();
            });
            pair.set(c);
            items.push(['Sharing', h('span', { class: 'los-sharing' }, h('span', {}, sharingWords(c, on, os.config.recipient)), pair.el, everShared && eraseBtn)]);
        }
        else if (os.config.consentUi && os.config.transport && !os.storage.persistent) {
            items.push(['Sharing', 'Off: this window keeps nothing, so an answer could not be remembered. Nothing is sent.']);
        }
        rows.replaceChildren(...items.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
        deleteBtn.disabled = total === 0;
        exportBtn.disabled = total === 0;
    }
    async function doExport() {
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
    function askDelete() {
        confirmText.textContent = `Delete ${count(total, 'record', 'records')} from this browser${everShared ? ' and erase the events it sent' : ''}?`;
        actions.hidden = true;
        confirm.hidden = false;
        confirmNo.focus();
    }
    async function doDelete() {
        const wasSharing = sharing === 'granted';
        const r = await os.privacy.deleteAll();
        confirm.hidden = true;
        actions.hidden = false;
        const gone = r.deleted.events + r.deleted.progress + r.deleted.meta;
        const left = r.remaining.events + r.remaining.progress + r.remaining.meta;
        const keptOff = r.kept.includes('recording');
        const here = r.ok
            ? `Deleted ${count(gone, 'record', 'records')}; none remain.`
            : `Deleted ${count(gone, 'record', 'records')}, but ${left - r.kept.length} remain. Close every lab tab and try again.`;
        const there = r.remote.state === 'erased' ? ' The events this browser sent were erased from the backend; it holds none.'
            : r.remote.state === 'failed'
                ? ` The events this browser sent could not be erased (${r.remote.detail}). Its install id is kept so the erase can be repeated: press Delete everything again when you are online.`
                : '';
        const after = keptOff ? ' Recording stays off.' : ' Nothing more is recorded on this page; to stop later visits too, stop recording.';
        status.textContent = here + there + (r.ok ? after : '') + (wasSharing ? ' Sharing is off until you allow it again.' : '');
        await refresh();
    }
    async function doErase() {
        eraseBtn.disabled = true;
        const r = await os.sharing.erase();
        eraseBtn.disabled = false;
        status.textContent = r.state === 'erased' ? 'Erased: the backend holds no events from this browser. The record here is unchanged.'
            : r.state === 'failed' ? `The events on the backend could not be erased (${r.detail}). Try again when you are online.`
                : 'Nothing was sent from this browser.';
        await refresh();
    }
    async function toggleRecording() {
        const r = await os.recording.set(!os.recording.on);
        status.textContent = r.on
            ? 'Recording is on. New visits are logged in this browser.'
            : 'Recording is off. Nothing new is logged until you turn it on.';
        await refresh();
    }
    recBtn.addEventListener('click', () => void toggleRecording());
    eraseBtn.addEventListener('click', () => void doErase());
    exportBtn.addEventListener('click', () => void doExport());
    deleteBtn.addEventListener('click', askDelete);
    confirmNo.addEventListener('click', () => { confirm.hidden = true; actions.hidden = false; deleteBtn.focus(); });
    confirmYes.addEventListener('click', () => void doDelete());
    closeBtn.addEventListener('click', () => close());
    (opts.root ?? document.body).append(el);
    function close() {
        confirm.hidden = true;
        actions.hidden = false;
        if (typeof el.close === 'function' && el.open)
            el.close();
        else
            el.removeAttribute('open');
    }
    return {
        el,
        async open() {
            status.textContent = '';
            await refresh();
            if (typeof el.showModal === 'function') {
                if (!el.open)
                    el.showModal();
            }
            else
                el.setAttribute('open', '');
        },
        close,
        refresh,
        destroy() { close(); el.remove(); },
    };
}
