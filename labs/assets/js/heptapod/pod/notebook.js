/* ============================================================
   heptapod/pod/notebook.js — the visitor's notebook.

   One entry per radical kept: the crop as it was cut (the same
   ink, at the thinning of that moment), a table of where it has
   appeared, and a line for a guess. The page never reads the
   guess and never grades it.

   The table is the day's world laid flat: six rows, one per thing
   on the tray, and seven columns, one per act and place (taken,
   held and set down at the glass or far from it, and given). A
   filled cell is a scene whose ring carried this radical; a hollow
   cell is a scene that happened without it; an empty cell has not
   happened yet. The key at the top carries the pictures.

   A bracket joins entries that no act on the record has yet told
   apart. After the evening's check the table also outlines every
   scene the radical can be used for.
   ============================================================ */

import { drawInk, palette, cappedDpr } from '../render.js';
import { OBJ, sceneOf } from './world.js';
import { ringSpec, soloSpec, podStrokes } from './ring.js';
import { GREETING, entryActs, brackets, specArgsOfAct, DAY } from './day.js';
import { objectImage, actImage, sceneName } from './objects.js';

export const COLS = [['lift', 'near'], ['lift', 'far'], ['hold', 'near'], ['hold', 'far'], ['putdown', 'near'], ['putdown', 'far'], ['give', 'near']];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const sceneAt = (row, col) => sceneOf(COLS[col][0], OBJ[row], COLS[col][1]);
/* What a cell stands for, for a screen reader and a tooltip: the visitor's own acts, in plain words. */
export const cellName = (row, col) => sceneName(sceneAt(row, col));

export function mountNotebook({ list, key, count }, hooks) {
  const { sp } = hooks;
  const P = palette();
  const colors = { ink: P.ink, dim: P.dim, faint: P.faint };
  const specs = new Map();
  const specOf = (state, crop) => {
    if (!crop.solo && crop.act !== GREETING && !state.acts[crop.act]) return null;     // a record that lost its act draws nothing
    if (crop.solo && !sp.trits.has(crop.solo)) return null;
    const id = crop.solo ? 's' + crop.solo : crop.act === GREETING ? 'g' : `${state.acts[crop.act].scene}|${state.acts[crop.act].emph}`;
    if (!specs.has(id)) specs.set(id, crop.solo ? soloSpec(sp, crop.solo) : ringSpec(sp, ...specArgsOfAct(state, crop.act)));
    return specs.get(id);
  };

  /* The key: the table at reading size, with a picture on every row and column, and today's counts. */
  function drawKey(state) {
    key.textContent = '';
    const grid = el('div', 'nb-keygrid');
    grid.setAttribute('role', 'img');
    grid.setAttribute('aria-label', 'The table every notebook entry uses. Rows are the six things on the tray. Columns are what you did: taken at the glass, taken far from it, held up at the glass, held up far from it, set down at the glass, set down far from it, passed through the glass. A number is how many times you have done it today.');
    grid.append(el('span', 'nb-corner'));
    COLS.forEach(([act, place]) => { const i = new Image(); i.src = actImage(act, place, 30, colors); i.alt = ''; i.className = 'nb-ch'; grid.append(i); });
    const seen = new Array(42).fill(0);
    state.acts.forEach((a) => seen[a.scene]++);
    OBJ.forEach((o, r) => {
      const i = new Image(); i.src = objectImage(o, 30, colors); i.alt = ''; i.className = 'nb-rh'; grid.append(i);
      COLS.forEach((_, c) => { const n = seen[sceneAt(r, c)]; const cell = el('span', 'nb-kc' + (n ? ' seen' : ''), n ? String(n) : ''); cell.dataset.cell = `${r}-${c}`; cell.title = cellName(r, c); grid.append(cell); });
    });
    key.append(grid);
  }

  function drawCrop(cv, state, crop) {
    const n = Math.round(64 * cappedDpr());
    cv.width = cv.height = n;
    const ctx = cv.getContext('2d');
    const spec = specOf(state, crop);
    if (!spec || !crop.rect) return;
    const r = crop.rect, rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    const s = Math.min(n / rw, n / rh) * 0.94;
    const xf = { s, ox: n / 2 - s * (r.x0 + rw / 2), oy: n / 2 - s * (r.y0 + rh / 2) };
    ctx.save();
    ctx.beginPath(); ctx.rect(xf.ox + s * r.x0, xf.oy + s * r.y0, s * rw, s * rh); ctx.clip();
    drawInk(ctx, podStrokes(spec), xf, { p: 1, erode: crop.erode, widthScale: crop.erode > 0 ? 1 : 1.25 });
    ctx.restore();
  }

  function table(state, entry, acts, truth) {
    const g = el('div', 'nb-grid');
    const on = new Map();
    acts.forEach((i) => on.set(state.acts[i].scene, (on.get(state.acts[i].scene) || 0) + 1));
    const seen = new Set(state.acts.map((a) => a.scene));
    const can = truth && entry.tokens.length ? entry.tokens.map((t) => new Set(sp.ext.get(t) || [])) : null;
    for (let r = 0; r < OBJ.length; r++) for (let c = 0; c < COLS.length; c++) {
      const sc = sceneAt(r, c);
      const cell = el('i', on.has(sc) ? 'on' : seen.has(sc) ? 'off' : '');
      if (can && can.every((s) => s.has(sc))) cell.classList.add('can');
      cell.dataset.cell = `${r}-${c}`;
      g.append(cell);
    }
    g.setAttribute('role', 'img');
    const named = (scenes, max = 8) => scenes.slice(0, max).map(sceneName).join('; ') + (scenes.length > max ? `; and ${scenes.length - max} more` : '');
    let label = on.size ? `Appeared when: ${named([...on.keys()])}.` : 'Has not appeared in any ring about something you did.';
    if (can) { const all = [...can[0]].filter((sc) => can.every((s) => s.has(sc))); label += all.length ? ` It is used for ${all.length} of the 42 scenes: ${named(all)}.` : ' It is used for no scene of the tray.'; }
    g.setAttribute('aria-label', label);
    return g;
  }

  function entryNode(state, entry, truth, fresh) {
    const crop = state.crops.find((c) => c.id === entry.crop);
    const li = el('div', 'nb-entry' + (entry.tokens.length ? '' : ' scrap') + (fresh ? ' fresh' : ''));
    li.dataset.key = entry.key;
    const cv = el('canvas', 'nb-crop');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', entry.tokens.length ? `A crop holding ${entry.tokens.length === 1 ? 'one radical' : entry.tokens.length + ' radicals'}` : 'A scrap of ink');
    if (crop) drawCrop(cv, state, crop);
    const acts = entryActs(state, sp, entry);
    const body = el('div', 'nb-body');
    const meta = el('p', 'nb-meta');
    const from = crop && crop.act === GREETING ? 'cut from the greeting' : crop && crop.solo ? 'its reading of your mark' : '';
    if (!entry.tokens.length) meta.textContent = 'too little ink to know it again';
    else if (truth) {
      const ext = entry.tokens.map((t) => new Set(sp.ext.get(t) || [])).reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
      meta.textContent = ext.size ? `used for ${ext.size} of the 42 scenes; you saw ${new Set(acts.map((i) => state.acts[i].scene)).size}` : 'used for no scene of the tray';
    } else meta.textContent = acts.length ? `in ${acts.length} of ${state.acts.length} ring${state.acts.length === 1 ? '' : 's'}` : 'in no ring about the tray yet';
    if (from) meta.append(el('span', 'nb-from', from));
    const guess = el('input', 'nb-guess');
    guess.type = 'text'; guess.maxLength = DAY.GUESS_MAX; guess.value = entry.guess || ''; guess.placeholder = 'your guess, in pencil'; guess.spellcheck = false; guess.autocomplete = 'off';
    guess.setAttribute('aria-label', 'Your guess at what this radical is for. It is never graded.');
    guess.addEventListener('input', () => hooks.onGuess(entry.key, guess.value));
    const drop = el('button', 'nb-drop', 'drop');
    drop.type = 'button'; drop.setAttribute('aria-label', 'Remove this entry from the notebook');
    drop.addEventListener('click', () => hooks.onDrop(entry.key));
    const row = el('div', 'nb-row');
    row.append(guess, drop);
    body.append(meta, row);
    li.append(cv, entry.tokens.length ? table(state, entry, acts, truth) : el('div', 'nb-grid none'), body);
    return li;
  }

  /** Rebuild from the record. freshKey: the entry that just landed, shown once with a mark. */
  function render(freshKey = null) {
    const state = hooks.getState();
    const truth = state.phase === 'done';
    const active = document.activeElement;
    const focus = active && active.classList && active.classList.contains('nb-guess') ? { key: active.closest('.nb-entry')?.dataset.key, at: active.selectionStart } : null;
    drawKey(state);
    list.textContent = '';
    const kept = state.entries.filter((e) => e.tokens.length).length;
    count.textContent = kept ? `${kept} radical${kept === 1 ? '' : 's'} kept` : '';
    if (!state.entries.length) {
      list.append(el('p', 'nb-empty', 'Nothing kept yet. While a ring hangs on the glass, drag across a part of it. What you cut lands here.'));
      return;
    }
    const groups = truth ? [] : brackets(state, sp);
    const groupOf = new Map();
    groups.forEach((g, i) => g.forEach((k) => groupOf.set(k, i)));
    const done = new Set();
    for (const e of state.entries) {
      if (done.has(e.key)) continue;
      const gi = groupOf.get(e.key);
      if (gi == null) { list.append(entryNode(state, e, truth, e.key === freshKey)); done.add(e.key); continue; }
      const wrap = el('div', 'nb-group');
      wrap.append(el('p', 'nb-bracket', 'no ring yet tells these apart'));
      for (const k of groups[gi]) { const m = state.entries.find((x) => x.key === k); wrap.append(entryNode(state, m, truth, k === freshKey)); done.add(k); }
      list.append(wrap);
    }
    if (focus && focus.key) {
      const inp = [...list.querySelectorAll('.nb-entry')].find((n) => n.dataset.key === focus.key)?.querySelector('.nb-guess');
      if (inp) { inp.focus(); try { inp.setSelectionRange(focus.at, focus.at); } catch { /* not a text selection */ } }
    }
  }

  /* Pointing at a cell of any entry lights the same cell of the key, where its pictures are. */
  const point = (e) => {
    const id = e.target && e.target.dataset ? e.target.dataset.cell : null;
    key.querySelectorAll('.nb-kc.lit').forEach((n) => n.classList.remove('lit'));
    if (!id) { key.querySelectorAll('.lit').forEach((n) => n.classList.remove('lit')); return; }
    const k = key.querySelector(`.nb-kc[data-cell="${id}"]`);
    if (k) k.classList.add('lit');
    const [r, c] = id.split('-').map(Number);
    key.querySelectorAll('.nb-rh, .nb-ch').forEach((n) => n.classList.remove('lit'));
    key.querySelectorAll('.nb-rh')[r]?.classList.add('lit');
    key.querySelectorAll('.nb-ch')[c]?.classList.add('lit');
  };
  list.addEventListener('pointerover', point);
  list.addEventListener('pointerleave', point);

  /* After an entry is dropped its button is gone: the focus goes to the first entry left, or to the list. */
  const focusFirst = () => { const t = list.querySelector('.nb-guess') || list; t.focus({ preventScroll: true }); };
  return { render, focusFirst, destroy() { list.removeEventListener('pointerover', point); list.removeEventListener('pointerleave', point); } };
}
