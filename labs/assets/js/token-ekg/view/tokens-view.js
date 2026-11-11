/* ============================================================
   token-ekg/view/tokens-view.js — the cost bench.
   The visitor's text split into its real tokens under any of four
   tokenizers, compared with a second one, and Article 1 of the UDHR
   in 23 translations measured under all four. Every count is made in
   the page when it loads; the reference check re-encodes 61 texts and
   compares ids with the reference libraries' output.
   ============================================================ */

import { TOKENIZERS, REFERENCE } from '../config.js';
import { loadTokenizer, tokenize, measureText } from '../engine/tokens.js';

const MAX_UNITS = 1600;
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
const def = (id) => TOKENIZERS.find((t) => t.id === id);

function visible(text) {
  return esc(text)
    .replace(/ /g, '<span class="ws">·</span>')
    .replace(/\t/g, '<span class="ws">→</span>')
    .replace(/\n/g, '<span class="ws">⏎</span>\n');
}

function chipsHTML(units) {
  let html = '';
  units.slice(0, MAX_UNITS).forEach((u, i) => {
    html += `<span class="chip${u.split ? ' split' : ''}" data-i="${i}" title="id ${u.ids.join(' + ')}">${visible(u.text)}${u.split ? `<sup>${u.ids.length}</sup>` : ''}</span><wbr>`;
  });
  if (units.length > MAX_UNITS) html += `<span class="ws"> ... ${fmt(units.length - MAX_UNITS)} more units counted, not drawn</span>`;
  return html || '<span class="ws">empty</span>';
}

export class TokenBench {
  constructor(el, { onChange, base } = {}) {
    this.el = el;
    this.onChange = onChange;
    this.base = base;
    this.tk = {};
    this.encId = TOKENIZERS[0].id;
    this.cmpId = TOKENIZERS[1].id;
    this.langs = [];
    this.rows = [];
    this.sel = null;
    this.units = [];
    this.units2 = [];
    this.focus = -1;
    this.view = 'chart';
    this._t = null;
    this._bind();
  }

  async init(udhr, { enc, cmp, lang } = {}) {
    if (enc && def(enc)) this.encId = enc;
    if (cmp && def(cmp) && cmp !== this.encId) this.cmpId = cmp;
    else if (this.cmpId === this.encId) this.cmpId = TOKENIZERS.find((t) => t.id !== this.encId).id;
    this.langs = udhr.languages;
    this.el.read.innerHTML = '<div class="ro"><div class="k">tokenizers</div><div class="v">loading</div><div class="h">about 2.5 MB, once</div></div>';
    this._renderSwitch();
    const loaded = await Promise.all(TOKENIZERS.map((t) => loadTokenizer(t.id, this.base).then((x) => [t.id, x]).catch((e) => [t.id, null, e])));
    for (const [id, x, e] of loaded) { if (x) this.tk[id] = x; else console.warn('tokenizer', id, e); }
    if (!this.tk[this.encId]) throw new Error('tokenizer did not load: ' + this.encId);
    this._measureLangs();
    const start = this.langs.find((l) => l.code === lang) || this.langs[0];
    this.select(start.code, false);
    this.ready = true;
    this._renderSwitch();
    return this;
  }

  _bind() {
    const E = this.el;
    E.text.addEventListener('input', () => { clearTimeout(this._t); this._t = setTimeout(() => this._update(true), 70); });
    E.chips.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) this._inspect(Number(c.dataset.i)); });
    E.chips2.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) this._inspect(Number(c.dataset.i), true); });
    E.chips.addEventListener('keydown', (e) => {
      if (!this.units.length) return;
      const shown = Math.min(this.units.length, MAX_UNITS);
      const go = { ArrowRight: this.focus + 1, ArrowLeft: this.focus - 1, Home: 0, End: shown - 1 }[e.key];
      if (go != null) { this._inspect(Math.max(0, Math.min(shown - 1, go))); e.preventDefault(); }
    });
    E.langs.addEventListener('click', (e) => { const b = e.target.closest('[data-code]'); if (b) this.select(b.dataset.code, true); });
    E.langs.addEventListener('keydown', (e) => {
      const items = [...E.langs.querySelectorAll('.lg')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowDown') { items[Math.min(items.length - 1, i + 1)].focus(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { items[Math.max(0, i - 1)].focus(); e.preventDefault(); }
    });
    E.viewsw?.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      this.view = b.dataset.v;
      E.viewsw.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.v === this.view)));
      this._renderLangs();
    });
    E.cmp?.addEventListener('change', () => {
      this.cmpId = E.cmp.value;
      this._update(false);
      this.onChange?.(this.state());
    });
  }

  _renderSwitch() {
    const E = this.el;
    E.encsw.innerHTML = TOKENIZERS.map((t) =>
      `<button type="button" role="radio" data-enc="${t.id}" aria-checked="${t.id === this.encId}" ${this.ready && !this.tk[t.id] ? 'disabled' : ''}
        title="${esc(t.family + '; ' + t.version + ', ' + t.licence)}">${t.short}<small>${esc(t.family)}</small></button>`).join('');
    E.encsw.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      this.encId = b.dataset.enc;
      if (this.cmpId === this.encId) this.cmpId = TOKENIZERS.find((t) => t.id !== this.encId && this.tk[t.id]).id;
      E.encsw.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.enc === this.encId)));
      this._renderCmp();
      if (this.ready) { this._renderLangs(); this._update(false); }
      this.onChange?.(this.state());
    };
    this._renderCmp();
  }

  _renderCmp() {
    if (!this.el.cmp) return;
    this.el.cmp.innerHTML = TOKENIZERS.filter((t) => t.id !== this.encId)
      .map((t) => `<option value="${t.id}"${t.id === this.cmpId ? ' selected' : ''}${this.ready && !this.tk[t.id] ? ' disabled' : ''}>${t.short} (${esc(t.family)})</option>`).join('');
  }

  state() { return { enc: this.encId, cmp: this.cmpId, lang: this.sel }; }

  _measureLangs() {
    this.rows = this.langs.map((l) => {
      const m = measureText(l.text, l.lang);
      const tok = {}, pieces = {};
      for (const t of TOKENIZERS) {
        const k = this.tk[t.id];
        if (!k) continue;
        const { ids, units } = tokenize(k, l.text);
        tok[t.id] = ids.length;
        pieces[t.id] = units.filter((u) => u.split).reduce((s, u) => s + u.ids.length, 0);
      }
      return { ...l, ...m, tok, pieces };
    });
    this._renderLangs();
  }

  _renderLangs() {
    const id = this.encId;
    const ids = TOKENIZERS.map((t) => t.id).filter((x) => this.tk[x]);
    const base = this.rows.find((r) => r.code === 'eng');
    const sorted = [...this.rows].sort((a, b) => a.tok[id] - b.tok[id]);
    if (this.view === 'table') {
      const head = ids.map((x) => `<th scope="col" colspan="3">${esc(def(x).short)}</th>`).join('');
      const sub = ids.map(() => '<th>tok</th><th>x en</th><th>c/t</th>').join('');
      const body = sorted.map((r) => `<tr data-code="${r.code}" class="${r.code === this.sel ? 'on' : ''}"><th scope="row">${esc(r.name)} <small>${r.script}</small></th>` +
        ids.map((x) => `<td>${r.tok[x]}</td><td>${(r.tok[x] / base.tok[x]).toFixed(2)}</td><td>${(r.chars / r.tok[x]).toFixed(2)}</td>`).join('') +
        `<td>${r.pieces[id]}</td></tr>`).join('');
      this.el.langs.innerHTML = `<div class="mx-wrap"><table class="mx"><thead><tr><th></th>${head}<th>pieces</th></tr><tr><th>language</th>${sub}<th>${esc(def(id).short)}</th></tr></thead><tbody>${body}</tbody></table></div>`;
      this.el.hint.textContent = 'tok = tokens; x en = tokens relative to English; c/t = characters per token; pieces = tokens that carry part of a character, in the selected tokenizer';
      this._summary();
      return;
    }
    const max = Math.max(...this.rows.flatMap((r) => ids.map((x) => r.tok[x]))) * 1.04;
    this.el.langs.innerHTML = sorted.map((r) => {
      const vals = ids.map((x) => r.tok[x]);
      const lo = Math.min(...vals) / max * 100, hi = Math.max(...vals) / max * 100;
      const ratio = r.tok[id] / base.tok[id];
      const dots = ids.map((x) => `<i class="dot ${x === id ? 'o' : 'c'} d-${TOKENIZERS.findIndex((t) => t.id === x)}" style="left:${(r.tok[x] / max * 100).toFixed(2)}%" title="${esc(def(x).short)}: ${r.tok[x]}"></i>`).join('');
      return `<button type="button" class="lg" role="option" data-code="${r.code}" aria-selected="${r.code === this.sel}"
        aria-label="${esc(r.name)}: ${ids.map((x) => `${def(x).short} ${r.tok[x]}`).join(', ')} tokens; ${ratio.toFixed(2)} times English in ${def(id).short}">
        <span class="ln">${esc(r.name)}<small>${r.script}</small></span>
        <span class="bar" aria-hidden="true"><i class="rng" style="left:${lo.toFixed(2)}%;width:${(hi - lo).toFixed(2)}%"></i>${dots}</span>
        <span class="rt">${r.tok[id]}<small> x${ratio.toFixed(2)}</small></span>
      </button>`;
    }).join('');
    this.el.hint.innerHTML = `tokens per translation, sorted by ${esc(def(id).short)} (filled dot); ` +
      ids.filter((x) => x !== id).map((x) => `<span class="key d-${TOKENIZERS.findIndex((t) => t.id === x)}"></span>${esc(def(x).short)}`).join(' ') + '; x = times English';
    this._summary();
  }

  _summary() {
    const id = this.encId;
    const ids = TOKENIZERS.map((t) => t.id).filter((x) => this.tk[x]);
    const base = this.rows.find((r) => r.code === 'eng');
    const others = this.rows.filter((r) => r.code !== 'eng');
    const med = (k) => {
      const v = others.map((r) => r.tok[k] / base.tok[k]).sort((a, b) => a - b);
      return v[Math.floor(v.length / 2)];
    };
    const worst = [...this.rows].sort((a, b) => b.tok[id] - a.tok[id])[0];
    const spread = ids.map((x) => `${esc(def(x).short)} <b>x${med(x).toFixed(2)}</b>`).join(', ');
    const fits = (n) => Math.floor(131072 / n).toLocaleString('en-US');
    this.el.sum.innerHTML =
      `In ${esc(def(id).short)}, English costs <b>${base.tok[id]}</b> tokens and ${esc(worst.name)} <b>${worst.tok[id]}</b> ` +
      `(x${(worst.tok[id] / base.tok[id]).toFixed(2)}); a 131,072-token window holds the sentence ${fits(base.tok[id])} times in English and ${fits(worst.tok[id])} times in ${esc(worst.name)}. ` +
      `The median of the other ${others.length} translations, relative to English: ${spread}.`;
  }

  select(code, user) {
    const l = this.langs.find((x) => x.code === code);
    if (!l) return;
    this.sel = code;
    const E = this.el;
    E.text.value = l.text;
    E.text.dir = l.dir === 'rtl' ? 'rtl' : 'ltr';
    E.text.lang = l.lang;
    for (const c of [E.chips, E.chips2]) { c.dir = E.text.dir; c.lang = l.lang; }
    E.langs.querySelectorAll('[data-code]').forEach((b) => {
      if (b.classList.contains('lg')) b.setAttribute('aria-selected', String(b.dataset.code === code));
      else b.classList.toggle('on', b.dataset.code === code);
    });
    this._update(false);
    if (user) this.onChange?.(this.state());
  }

  /** Count any text with any loaded tokenizer (used by the cadence section's cross-check). */
  count(id, text) { const k = this.tk[id]; return k ? k.encode(text).length : NaN; }

  _update(edited) {
    const E = this.el;
    const text = E.text.value;
    const l = this.langs.find((x) => x.code === this.sel);
    const isOrig = l && text === l.text;
    E.langLabel.textContent = l ? (isOrig ? `UDHR Article 1, ${l.name}` : `edited, started from ${l.name}`) : 'your text';
    const enc = this.tk[this.encId], enc2 = this.tk[this.cmpId];
    const t0 = performance.now();
    const { ids, units } = tokenize(enc, text);
    const ms = performance.now() - t0;
    const other = enc2 ? tokenize(enc2, text) : { ids: [], units: [] };
    this.units = units;
    this.units2 = other.units;
    this.focus = -1;
    const m = measureText(text, l?.lang);
    const cell = (k, v, small, h, cls = '') => `<div class="ro ${cls}"><div class="k">${k}</div><div class="v">${v}${small ? `<small>${small}</small>` : ''}</div><div class="h">${h}</div></div>`;
    E.read.innerHTML =
      cell('tokens', fmt(ids.length), def(this.encId).short, `encoded here in ${fmt(ms, 1)} ms`) +
      cell('tokens', fmt(other.ids.length), def(this.cmpId).short, 'the comparison tokenizer') +
      cell('characters', fmt(m.chars), '', 'Unicode code points') +
      cell('bytes', fmt(m.bytes), 'UTF-8', 'what a byte-level tokenizer reads') +
      cell('chars / token', ids.length ? fmt(m.chars / ids.length, 2) : '-', '', `bytes / token ${ids.length ? fmt(m.bytes / ids.length, 2) : '-'}`) +
      cell('words', fmt(m.words), '', 'Intl.Segmenter word count');
    E.chips.innerHTML = chipsHTML(units);
    E.chips2.innerHTML = chipsHTML(other.units);
    E.h1.textContent = `${def(this.encId).short}: ${fmt(ids.length)} tokens`;
    E.h2.textContent = `${def(this.cmpId).short}: ${fmt(other.ids.length)} tokens`;
    const splitN = units.filter((u) => u.split).reduce((s, u) => s + u.ids.length, 0);
    const prefix = enc.addsPrefixSpace ? ' SentencePiece marks the start of the text with a space, drawn as the first dot.' : '';
    E.inspect.innerHTML = units.length
      ? `${fmt(ids.length)} tokens drew as ${fmt(units.length)} units. ${splitN ? `<b>${fmt(splitN)}</b> tokens are pieces of characters the vocabulary cuts apart (dashed underline; the superscript counts the pieces).` : 'No character is cut across tokens.'}${prefix} Select a token, or focus the strip and use the arrow keys.`
      : '';
    if (edited) this.onChange?.(this.state());
  }

  _inspect(i, second = false) {
    const u = (second ? this.units2 : this.units)[i];
    if (!u) return;
    const box = second ? this.el.chips2 : this.el.chips;
    [this.el.chips, this.el.chips2].forEach((b) => b.querySelectorAll('.chip.on').forEach((c) => c.classList.remove('on')));
    const c = box.querySelector(`.chip[data-i="${i}"]`);
    if (c) { c.classList.add('on'); c.scrollIntoView({ block: 'nearest' }); }
    if (!second) this.focus = i;
    const id = second ? this.cmpId : this.encId;
    this.el.inspect.innerHTML =
      `unit ${fmt(i + 1)}: <b>${esc(JSON.stringify(u.text))}</b> = token${u.ids.length > 1 ? 's' : ''} <b>${u.ids.map((x) => fmt(x)).join(' + ')}</b> of ${fmt(def(id).vocab)} ` +
      `in ${esc(def(id).short)}; ${u.bytes.length} UTF-8 byte${u.bytes.length === 1 ? '' : 's'}: ${hex(u.bytes)}. ` +
      (u.split ? `One character cut into ${u.ids.length} tokens: the vocabulary has no single entry for these bytes. ` : '') +
      (def(id).kind === 'sentencepiece' ? 'In this vocabulary the id is a piece index; merge order is a separate list.' : 'The id is also the merge rank: the encoder joins lower-ranked pairs first.');
  }

  /** Re-encode the reference texts with every loaded tokenizer and compare ids. */
  async verify() {
    const ref = await (await fetch(new URL(REFERENCE.file, this.base))).json();
    const out = [];
    for (const t of TOKENIZERS) {
      const k = this.tk[t.id];
      if (!k) { out.push({ id: t.id, ok: 0, n: ref.cases.length, missing: true, bad: [] }); continue; }
      let ok = 0;
      const bad = [];
      for (const c of ref.cases) {
        const got = k.encode(c.text), want = c[t.id];
        if (got.length === want.length && got.every((x, j) => x === want[j])) ok++; else bad.push(c.name);
      }
      out.push({ id: t.id, ok, n: ref.cases.length, bad, ref: ref.references[t.id] });
    }
    return { made: ref.made, results: out };
  }
}
