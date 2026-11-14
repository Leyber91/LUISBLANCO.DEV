/* ============================================================
   heptapod/pod/panel.js — what sits under the glass: the slate
   and the lamp by day, the read-back and the six rings in the
   evening, and the count when the day is over.

   The evening's check is the day's only measure. Six rings about
   scenes the visitor did not see, each to be matched to one of
   three pictures, none of which the visitor saw either, so that
   remembering the day is no help and only the notebook is.
   Nothing is marked right or wrong until all six are answered,
   and the pencil guesses are never read.

   The panel is rebuilt on every change. It keeps the text being
   typed on the slate, puts the keyboard's focus back on the new
   controls, and ignores a press that lands within a third of a
   second of a rebuild, so a double click cannot answer two rings
   or confirm what it has not read.
   ============================================================ */

import { palette } from '../render.js';
import { DAY, canEnd, dayOver, markCounts, score } from './day.js';
import { sceneImage, sceneName } from './objects.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const tag = (real) => el('span', real ? 'tg r' : 'tg i', real ? 'real' : 'illustrative');
/* A reader who knows nothing picks one of three: the chance of matching 3 or more of 6 (binomial). */
const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
export const CHANCE_3_OF_6 = [3, 4, 5, 6].reduce((s, k) => s + C(6, k) * (1 / 3) ** k * (2 / 3) ** (6 - k), 0);
const SETTLE_MS = 350;

export function mountPanel(host, hooks) {
  const { sp } = hooks;
  const P = palette();
  const colors = { ink: P.ink, dim: P.dim, faint: P.faint };
  let note = '', draft = '', confirmNew = false, drawnAt = 0;
  /* A button whose press is ignored just after the panel was rebuilt under the pointer. */
  const btn = (cls, text, on) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', () => { if (performance.now() - drawnAt >= SETTLE_MS) on(); }); return b; };
  const picture = (scene, w = 132, h = 92) => { const i = new Image(); i.src = sceneImage(scene, w, h, colors); i.width = w; i.height = h; i.alt = ''; return i; };

  function day(state) {
    const wrap = el('div', 'pp pp-day');
    const row = el('form', 'pp-slate');
    row.autocomplete = 'off';
    const lab = el('label', 'mini', 'your slate'); lab.htmlFor = 'slate';
    const inp = el('input'); inp.id = 'slate'; inp.type = 'text'; inp.maxLength = DAY.MARK_MAX; inp.placeholder = 'a mark of your own'; inp.spellcheck = false; inp.value = draft;
    inp.addEventListener('input', () => { draft = inp.value; });
    const raise = el('button', 'act ghost', 'raise it'); raise.type = 'submit';
    row.append(lab, inp, raise);
    row.addEventListener('submit', (e) => { e.preventDefault(); note = hooks.onRaise(inp.value) || ''; if (!note) draft = ''; render(); host.querySelector('#slate')?.focus(); });
    const marks = el('div', 'pp-marks');
    for (const m of markCounts(state)) marks.append(el('span', 'pp-mark', `${m.mark} · ${m.n}`));
    if (!state.marks.length) marks.append(el('span', 'pp-none', note || 'Write a mark and raise it after an act. The being counts what it had just written against it.'));
    else if (note) marks.append(el('span', 'pp-none', note));
    const lamp = el('div', 'pp-lamp');
    const n = state.acts.length;
    const line = el('span', 'mini', `ring ${n} of ${DAY.ACTS}`);
    const bar = el('span', 'pp-bar'); const fill = el('i'); fill.style.width = `${(100 * n) / DAY.ACTS}%`; bar.append(fill);
    bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${n} of the day's ${DAY.ACTS} rings are written`);
    const end = btn('act', dayOver(state) ? 'the lamp is out: go to the evening' : 'end the day', () => hooks.onEnd());
    end.disabled = !canEnd(state);
    end.title = canEnd(state) ? '' : `The day can end after ${DAY.MIN_ACTS} rings.`;
    lamp.append(line, bar, end);
    wrap.append(row, marks, lamp);
    return wrap;
  }

  function readback(state) {
    const wrap = el('div', 'pp pp-eve');
    const rb = state.readback;
    wrap.append(el('p', 'mini', 'evening · its reading of you'));
    const text = el('p', 'pp-text', `Before the lamp goes out it writes one radical back: its reading of your mark "${rb.mark}", which you raised on ${rb.n} rings. That radical was in ${rb.c} of them. `);
    text.append(tag(false));
    wrap.append(text);
    const row = el('div', 'pp-actions');
    row.append(btn('act', 'go on', () => hooks.onReadbackSeen()));
    const has = state.entries.some((e) => e.tokens.length === 1 && e.tokens[0] === sp.code.get(rb.id));
    if (has) row.append(el('span', 'pp-none', 'This radical is already in your notebook.'));
    else row.append(btn('act ghost', 'keep it in the notebook', () => hooks.onKeepSolo(rb.id)));
    wrap.append(row);
    return wrap;
  }

  function check(state) {
    const i = state.check.answers.length, it = state.check.items[i];
    const wrap = el('div', 'pp pp-eve');
    wrap.append(el('p', 'mini', `evening · ring ${i + 1} of ${state.check.items.length}`));
    wrap.append(el('p', 'pp-text', state.check.fallbacks
      ? 'It writes about things you could have done. You did so much today that some of these pictures show something you did. Which one is this ring about?'
      : 'It writes about something you did not do today, and none of these three pictures is something you did. Which one is this ring about? Your notebook is all you have.'));
    const opts = el('div', 'pp-opts');
    it.options.forEach((sc, k) => {
      const b = btn('pp-opt', '', () => hooks.onAnswer(i, sc));
      b.setAttribute('aria-label', `Picture ${k + 1} of 3: ${sceneName(sc)}`);
      b.append(picture(sc));
      opts.append(b);
    });
    wrap.append(opts);
    return wrap;
  }

  function done(state) {
    const wrap = el('div', 'pp pp-done');
    const s = score(state), n = state.check.items.length;
    wrap.append(el('p', 'mini', 'the day is over'));
    const head = el('p', 'pp-score');
    head.append(el('b', '', `${s} of ${n}`), document.createTextNode(' rings matched to what they were about.'));
    wrap.append(head);
    const chance = el('p', 'pp-text', `A reader with no decoder at all would match 2 of ${n} on average, and 3 or more ${(100 * CHANCE_3_OF_6).toFixed(0)} times in 100. `);
    chance.append(tag(true));
    wrap.append(chance);
    const rows = el('div', 'pp-rows');
    state.check.items.forEach((it, i) => {
      const r = el('div', 'pp-res');
      r.append(el('span', 'mini', String(i + 1)));
      it.options.forEach((sc) => {
        const f = el('span', 'pp-pic' + (sc === it.target ? ' right' : '') + (sc === state.check.answers[i] ? ' yours' : ''));
        f.append(picture(sc, 84, 58));
        r.append(f);
      });
      r.setAttribute('role', 'img');
      const yours = state.check.answers[i];
      r.setAttribute('aria-label', `Ring ${i + 1} was about ${sceneName(it.target)}. ${yours === it.target ? 'You matched it.' : `You chose ${sceneName(yours)}.`}`);
      rows.append(r);
    });
    wrap.append(rows);
    wrap.append(el('p', 'pp-legend', 'A gold frame is the scene the ring was about. The dashed line is under your choice.'));
    // the greeting, read with the day's decoder: counted from the rings of this day, not from what a day could hold
    const g = sp.greeting.tokens;
    const today = new Set(state.acts.flatMap((a) => sp.rings[a.scene].tokens));
    const back = g.filter((t) => today.has(t));
    const never = g.filter((t) => (sp.ext.get(t) || []).length === 0);
    const kept = back.filter((t) => state.entries.some((e) => e.tokens.includes(t))).length;
    const rest = g.length - back.length - never.length;
    const greet = el('p', 'pp-text', `On the glass again is the ring it wrote when you arrived. It carries ${g.length} radicals. ${back.length} of them came back in the rings of your day, and your notebook holds ${kept} of those. ${never.length} belong to no scene of the tray, so nothing on it could point at them.${rest > 0 ? ` ${rest} more could have come back and did not, because of what you did not do.` : ''} `);
    greet.append(tag(true));
    wrap.append(greet);
    wrap.append(el('p', 'pp-text', 'The notebook now outlines in gold every scene each of your radicals is used for. Compare the outlines with your pencil.'));
    const row = el('div', 'pp-actions');
    if (confirmNew) {
      row.append(btn('act ghost', 'keep this day', () => { confirmNew = false; render(); }));
      row.append(btn('act', 'clear the notebook and begin', () => hooks.onNewDay()));
    } else row.append(btn('act', 'begin another day, with another being', () => { confirmNew = true; render(); }));
    wrap.append(row);
    return wrap;
  }

  function render() {
    const state = hooks.getState();
    const active = document.activeElement;
    const had = host.contains(active);
    const slate = had && active.id === 'slate' ? { a: active.selectionStart, b: active.selectionEnd } : null;
    host.textContent = '';
    if (state.phase === 'day') host.append(day(state));
    else if (state.phase === 'evening') host.append(state.readback && !state.rbSeen ? readback(state) : check(state));
    else host.append(done(state));
    drawnAt = performance.now();
    if (!had) return;
    // the control that had the focus is gone: hand the focus to its successor
    const next = slate ? host.querySelector('#slate') : host.querySelector('.pp-opt, .act:not([disabled]), input');
    if (next) { next.focus({ preventScroll: true }); if (slate) { try { next.setSelectionRange(slate.a, slate.b); } catch { /* not a text field */ } } }
  }
  return { render };
}
