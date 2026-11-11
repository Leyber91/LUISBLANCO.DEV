/* ============================================================
   workout-plans/PlanView.js — every DOM touch outside the chart,
   the body map and the graph. Presentation only: it reads the
   plan the engine produced and reports clicks back through
   callbacks. It holds no planning logic.
   ============================================================ */

import { $, $$, el, svg, clear, fmt } from './dom.js';
import {
  DAY_NAMES, DAY_LONG, GOALS, LEVELS, MINUTES, WEEKS, EQUIPMENT, INJURIES, SOURCES, LOAD_MODEL, SCHEME_LABEL, SCHEMES, REPLAN,
} from './constants.js';
import { EX, MUSCLE_LABEL, FEDB } from './library.js';

const CONTROLS = {
  goal: { opts: Object.entries(GOALS).map(([k, v]) => [k, v.label]) },
  level: { opts: Object.keys(LEVELS).map((k) => [k, k]) },
  days: { opts: DAY_NAMES.map((d, i) => [i, d.slice(0, 2), DAY_LONG[i]]) },
  minutes: { opts: MINUTES.map((m) => [m, String(m)]) },
  equipment: { opts: Object.entries(EQUIPMENT).map(([k, v]) => [k, v.label]) },
  injuries: { opts: Object.entries(INJURIES).map(([k, v]) => [k, v.label]) },
  weeks: { opts: WEEKS.map((w) => [w, String(w)]) },
  scheme: { opts: SCHEMES.map((s) => [s, s === 'auto' ? 'auto' : s === 'undulating' ? 'undulating' : s]) },
  mode: { opts: [['banister', 'fixed dose'], ['busso', 'variable dose'], ['pmc', '42/7 chart']] },
  bm: { opts: [['week', 'week'], ['session', 'session'], ['recovery', 'recovery']] },
};

const TAG = { REAL: 'real', ILLUSTRATIVE: 'illustrative' };
const rir = (rpe) => Math.max(0, Math.round((10 - rpe) * 2) / 2);
/* intensity has its own scale: RPE 6 to 10 on the ink ladder, never gold */
const rpeStep = (rpe) => Math.max(0, Math.min(4, Math.round(rpe) - 6));
const rpeCell = (rpe, text) => {
  const td = el('td', { class: 'rpe-c' });
  td.append(el('i', { class: 'rs r' + rpeStep(rpe), 'aria-hidden': 'true' }), document.createTextNode(text));
  return td;
};

export class PlanView {
  constructor() {
    this.announcer = $('#announce');
  }

  /* ---------- controls ---------- */
  buildControls(onChange, onNotes) {
    for (const host of $$('.seg[data-k]')) {
      const k = host.dataset.k;
      const C = CONTROLS[k];
      if (!C) continue;
      host.setAttribute('role', 'group');
      for (const [v, label, aria] of C.opts) {
        const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', dataset: { v: String(v) }, 'aria-label': aria || null }, label);
        b.addEventListener('click', () => onChange(k, typeof v === 'number' ? v : String(v)));
        host.appendChild(b);
      }
    }
    const ta = $('#notes');
    let t = null;
    ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => onNotes(ta.value), 220); });
  }

  reflectControls(st, parsed) {
    for (const host of $$('.seg[data-k]')) {
      const k = host.dataset.k;
      for (const b of host.querySelectorAll('button')) {
        const v = b.dataset.v;
        let on;
        if (k === 'days') on = !!st.days[Number(v)];
        else if (k === 'injuries') on = st.injuries.includes(v);
        else on = String(st[k]) === v;
        b.setAttribute('aria-pressed', String(on));
        // a flag or a day the notes changed is marked on its chip
        const fromNotes = parsed && ((k === 'injuries' && !on && parsed.flags.includes(v)) || (k === 'days' && on && parsed.noDays.includes(Number(v))));
        b.dataset.notes = fromNotes ? (k === 'days' ? 'off' : 'on') : '';
        b.title = fromNotes ? (k === 'days' ? 'your notes rule this day out' : 'set by your notes') : '';
      }
    }
    const ta = $('#notes');
    if (document.activeElement !== ta && ta.value !== (st.notes || '')) ta.value = st.notes || '';
  }

  renderNotes(parsed) {
    const host = clear($('#nread'));
    if (!parsed.fired.length && !parsed.ignored.length) return;
    for (const f of parsed.fired) host.append(el('span', { class: 'nr-chip' + (f.kind === 'red' ? ' red' : '') }, `"${f.phrase}" ${f.kind === 'red' ? 'stops the planner' : 'reads as ' + f.wrote}`));
    for (const g of parsed.ignored) host.append(el('span', { class: 'nr-chip dim' }, `"${g.phrase}" ignored: ${g.why}`));
  }

  renderPaused(red) {
    const on = red && red.length > 0;
    $('#paused').hidden = !on;
    document.body.classList.toggle('paused', on);
    if (on) $('#pz-t').textContent = `Your notes mention ${red.join(' and ')}. The planner has stopped and shows no plan.`;
  }

  summary(plan) {
    const used = plan.chosen.map((d) => DAY_NAMES[d]).join(' ');
    $('#ctl-sum').textContent = `${plan.n} sessions on ${used} · ${SCHEME_LABEL[plan.scheme]} · ${plan.weeks.length} weeks`;
  }

  /* ---------- the week, and the block as one row per week ---------- */
  renderWeek(plan, lived, sel, log, onSelect, onHover) {
    const w = Math.floor(sel / 7);
    const week = lived.weeks[w];
    $('#wk-title').textContent = `week ${w + 1} of ${lived.weeks.length} · ${week.label}`;
    const host = clear($('#days7'));
    const maxL = Math.max(...lived.lived, 1);
    const weekDays = lived.days.slice(w * 7, w * 7 + 7);
    const hardest = weekDays.reduce((b, d) => (d.s && lived.lived[d.d] > (b ? lived.lived[b.d] : -1) ? d : b), null);
    for (let dow = 0; dow < 7; dow++) {
      const d = w * 7 + dow;
      const day = lived.days[d];
      const s = day.s;
      const e = log[d];
      const sets = s ? s.items.reduce((a, it) => a + it.sets, 0) : 0;
      const cls = 'dc' + (s ? ' on' : ' rest') + (d === sel ? ' sel' : '') + (e ? ' ' + e.kind : '') + (lived.changed.has(d) ? ' changed' : '') + (hardest && hardest.d === d ? ' top' : '');
      const b = el('button', { type: 'button', class: cls, 'aria-pressed': String(d === sel),
        'aria-label': `${DAY_LONG[dow]}, week ${w + 1}: ${s ? `${s.name}, ${s.minutes} minutes, ${sets} hard sets, ${lived.lived[d]} AU` : 'rest'}${e ? ', logged ' + e.kind : ''}` });
      b.append(el('span', { class: 'dc-d' }, DAY_NAMES[dow] + (hardest && hardest.d === d ? ' · hardest' : '')));
      if (s) {
        b.append(el('span', { class: 'dc-n' }, s.name.replace(' aerobic', '').replace('Full body', 'Full')));
        b.append(el('span', { class: 'dc-m' }, `${s.minutes} min${sets ? ` · ${sets} sets` : ''}`));
        const pl = plan.loads[d], lv = lived.lived[d];
        b.append(el('span', { class: 'dc-m' }, Math.abs(pl - lv) > 0.5 ? `${fmt(lv)} / ${fmt(pl)} AU` : `${fmt(lv)} AU`));
        const bar = el('span', { class: 'dc-b' });
        if (Math.abs(pl - lv) > 0.5) { const g = el('i', { class: 'ghost' }); g.style.width = (100 * pl / maxL) + '%'; bar.appendChild(g); }
        const i = el('i', { class: 'fill' });
        i.style.width = (100 * lv / maxL) + '%';
        bar.appendChild(i);
        b.append(bar);
        const mark = e?.kind === 'missed' ? 'missed' : e?.kind === 'hard' ? `hard · RPE ${e.rpe ?? ''}` : e?.kind === 'easy' ? 'easy' : e?.kind === 'done' ? 'done' : s.eased ? 'eased' : s.items.some((it) => it.carried) ? 'carried in' : s.items.some((it) => it.rule) ? 'autoregulated' : '';
        b.append(el('span', { class: 'dc-s' }, mark));
      } else {
        b.append(el('span', { class: 'dc-n dim' }, 'rest'));
      }
      b.addEventListener('click', () => onSelect(d));
      b.addEventListener('pointerenter', () => onHover(d));
      b.addEventListener('pointerleave', () => onHover(null));
      b.addEventListener('focus', () => onHover(d));
      b.addEventListener('blur', () => onHover(null));
      host.appendChild(b);
    }
    // weekly indices (Foster 1998), the contested rise flag, and the ACWR shown with its critique
    const ix = lived.model.weeksLive[w];
    const ixp = plan.model.weeksPlan[w];
    const box = clear($('#widx'));
    const item = (k, v, sub, cls = '') => {
      const it = el('div', { class: 'wi ' + cls });
      it.append(el('span', { class: 'wi-k' }, k), el('span', { class: 'wi-v' }, v), el('span', { class: 'wi-u' }, sub));
      box.appendChild(it);
    };
    item('week load', fmt(ix.sum), ix.sum !== ixp.sum ? `AU · plan ${fmt(ixp.sum)}` : 'AU, RPE x min');
    item('monotony', fmt(ix.monotony, 2), 'mean / sd daily load');
    item('strain', fmt(ix.strain), 'load x monotony');
    const flag = ix.rise > REPLAN.weekRiseFlag;
    item('vs prior 4 wk', (ix.rise >= 0 ? '+' : '') + fmt(ix.rise) + '%', flag ? `over ${REPLAN.weekRiseFlag}%: flagged, contested` : `flag at ${REPLAN.weekRiseFlag}%, contested`, flag ? 'flag' : '');
    item('acwr', fmt(ix.acwr, 2), 'shown, not used', 'dim');
    this.renderBlock(plan, lived, sel, log, onSelect);
  }

  renderBlock(plan, lived, sel, log, onSelect) {
    const host = clear($('#block'));
    const W = lived.weeks.length;
    const maxL = Math.max(...lived.lived, 1);
    const head = el('div', { class: 'bk-row bk-h', 'aria-hidden': 'true' });
    head.append(el('span', { class: 'bk-w' }, 'wk'), el('span', { class: 'bk-p' }, 'phase'));
    const cells = el('span', { class: 'bk-c' });
    for (const d of DAY_NAMES) cells.append(el('i', {}, d[0]));
    head.append(cells, el('span', { class: 'bk-l' }, 'load AU'), el('span', { class: 'bk-s' }, 'sets'));
    host.append(head);
    for (let w = 0; w < W; w++) {
      const wk = lived.weeks[w];
      const row = el('div', { class: `bk-row ph-${wk.phase}` + (Math.floor(sel / 7) === w ? ' cur' : '') });
      row.append(el('span', { class: 'bk-w' }, `W${w + 1}`), el('span', { class: 'bk-p' }, wk.label));
      const c = el('span', { class: 'bk-c' });
      let sets = 0;
      for (let dow = 0; dow < 7; dow++) {
        const d = w * 7 + dow;
        const day = lived.days[d];
        const e = log[d];
        if (day.s && e?.kind !== 'missed') sets += day.s.items.reduce((a, it) => a + it.sets, 0);
        const b = el('button', { type: 'button', class: 'bk-d' + (day.s ? ' on' : '') + (e ? ' ' + e.kind : '') + (d === sel ? ' sel' : '') + (lived.changed.has(d) ? ' changed' : ''),
          'aria-label': `Week ${w + 1} ${DAY_NAMES[dow]}${day.s ? ': ' + day.s.name : ': rest'}`, tabindex: '-1' });
        b.style.setProperty('--h', day.s ? (0.2 + 0.8 * lived.lived[d] / maxL).toFixed(3) : 0);
        b.addEventListener('click', () => onSelect(d));
        c.append(b);
      }
      const ix = lived.model.weeksLive[w];
      row.append(c, el('span', { class: 'bk-l' }, fmt(ix.sum)), el('span', { class: 'bk-s' }, String(sets)));
      host.append(row);
    }
  }

  /* ---------- the session ---------- */
  renderSession(plan, lived, sel, log, handlers) {
    const day = lived.days[sel];
    const s = day.s;
    const planned = plan.days[sel].s;
    const e = log[sel];
    $('#ss-title').textContent = `${DAY_LONG[day.dow]}, week ${day.w + 1}`;
    const meta = clear($('#ss-meta'));
    const body = clear($('#ss-body'));
    const row = clear($('#lb-row'));
    const note = $('#lb-note');
    if (!s) {
      meta.append(el('span', { class: 'sm-name' }, 'rest day'));
      body.append(el('p', { class: 'rest-note' }, `No session. In the model, fatigue decays with a ${LOAD_MODEL.tau2}-day time constant and fitness with a ${LOAD_MODEL.tau1}-day one, so form rises on days like this.`));
      row.append(el('span', { class: 'dim' }, 'Pick a session day to log it.'));
      note.textContent = '';
      $('#swap').hidden = true;
      return;
    }
    meta.append(el('span', { class: 'sm-name' }, s.name));
    const sets = s.items.reduce((a, it) => a + it.sets, 0);
    const bits = [day.s.label || lived.weeks[day.w].label, `${s.minutes} min`, ...(sets ? [`${sets} hard sets`] : []), `session RPE ${s.srpe}`,
      `${fmt(lived.lived[sel])} AU` + (Math.abs(lived.lived[sel] - plan.loads[sel]) > 0.5 ? ` (plan ${fmt(plan.loads[sel])})` : '')];
    for (const b of bits) meta.append(el('span', { class: 'sm-i' }, b));
    if (s.eased) meta.append(el('span', { class: 'sm-i gold' }, 're-planned: eased'));

    const t = el('table', { class: 'ex' });
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['exercise', 'sets x reps', 'RPE (RIR)', 'rest', 'trains']) hr.append(el('th', { scope: 'col' }, h));
    thead.append(hr);
    t.append(thead);
    const tb = el('tbody');
    if (s.cardio) {
      const c = s.cardio;
      const tr = el('tr', { class: 'cardio' });
      const td = el('td');
      td.append(el('span', { class: 'ex-n' }, `${c.modality}: ${c.name.toLowerCase()}`), el('span', { class: 'ex-sw' }, c.note));
      tr.append(td, el('td', {}, `${c.minutes} min`), rpeCell(c.rpe, String(c.rpe)), el('td', {}, '-'), el('td', { class: 'dim' }, 'aerobic'));
      tb.append(tr);
    }
    for (const it of s.items) {
      const tr = el('tr', { class: it.role + (it.carried ? ' carried' : '') });
      const td = el('td');
      td.append(el('span', { class: 'ex-n' }, it.name));
      if (it.pinned) td.append(el('span', { class: 'ex-sw gold' }, `your swap for ${EX[it.swap?.from || it.ex]?.name.toLowerCase() || 'the planner choice'}`));
      else if (it.swap) {
        const from = EX[it.swap.from];
        const why = it.swap.walk.rejected[it.swap.from]?.map((r) => r.text).join('; ');
        const a = el('button', { type: 'button', class: 'ex-sw link' }, `replaces ${from.name.toLowerCase()}: ${why}`);
        a.addEventListener('click', () => handlers.onWalk(it.swap.from + '>' + it.ex));
        td.append(a);
      }
      if (it.carried) td.append(el('span', { class: 'ex-sw gold' }, 'carried from the missed session'));
      if (it.rule) td.append(el('span', { class: 'ex-sw gold' }, it.rule === 'hold' ? 'autoregulated: hold load and sets' : `autoregulated: ${it.rule}, ${REPLAN.loadStep}`));
      if (!it.carried && it.k != null) {
        const sw = el('button', { type: 'button', class: 'ex-sw link swapbtn', 'aria-label': `Swap ${it.name}` }, 'swap');
        sw.addEventListener('click', () => handlers.onSwap(it));
        td.append(sw);
      }
      const pl = planned?.items.find((p) => p.ex === it.ex && p.role === it.role);
      const setTxt = `${it.sets} x ${it.reps}` + (pl && pl.sets !== it.sets ? ` (was ${pl.sets})` : '');
      tr.append(td, el('td', {}, setTxt), rpeCell(it.rpe, `${it.rpe} (${rir(it.rpe)})`), el('td', {}, `${it.rest} min`),
        el('td', { class: 'dim' }, EX[it.ex].p.map((m) => MUSCLE_LABEL[m]).join(', ')));
      tb.append(tr);
    }
    t.append(tb);
    body.append(t);
    const leg = el('div', { class: 'rpe-leg', 'aria-hidden': 'true' });
    leg.append(el('span', {}, 'RPE scale'));
    for (let r = 6; r <= 10; r++) { const s2 = el('span', { class: 'rl-i' }); s2.append(el('i', { class: 'rs r' + (r - 6) }), document.createTextNode(String(r))); leg.append(s2); }
    leg.append(el('span', {}, 'main lifts in bright ink; the hardest session of the week carries a top rule'));
    body.append(leg);

    // logging: what happened, the session RPE, and the minutes
    const kinds = [['done', 'as planned'], ['hard', 'harder'], ['easy', 'easier'], ['missed', 'missed']];
    for (const [k, label] of kinds) {
      const b = el('button', { type: 'button', class: 'chip' + (k === 'missed' ? ' warn' : ''), 'aria-pressed': String(e?.kind === k) }, label);
      b.addEventListener('click', () => handlers.onLog(k));
      row.append(b);
    }
    if (e && e.kind !== 'missed') {
      const step = (label, value, onDown, onUp, aria) => {
        const st = el('span', { class: 'rpe' });
        const minus = el('button', { type: 'button', class: 'chip sq', 'aria-label': 'Lower ' + aria }, '-');
        const plus = el('button', { type: 'button', class: 'chip sq', 'aria-label': 'Raise ' + aria }, '+');
        minus.addEventListener('click', onDown);
        plus.addEventListener('click', onUp);
        st.append(el('span', { class: 'rpe-k' }, label), minus, el('b', { 'aria-live': 'polite' }, String(value)), plus);
        row.append(st);
      };
      const rpe = e.rpe ?? planned.srpe;
      const min = e.min ?? s.minutes;
      step('session RPE', rpe, () => handlers.onRpe(Math.max(1, rpe - 0.5)), () => handlers.onRpe(Math.min(10, rpe + 0.5)), 'logged session RPE');
      step('minutes', min, () => handlers.onMin(Math.max(5, min - 5)), () => handlers.onMin(Math.min(240, min + 5)), 'logged minutes');
    }
    if (e) {
      const c = el('button', { type: 'button', class: 'link' }, 'clear');
      c.addEventListener('click', () => handlers.onLog(null));
      row.append(c);
    }
    const mine = lived.log.filter((r) => r.day === sel || (r.text.includes(`${DAY_NAMES[day.dow]} of week ${day.w + 1}`)));
    note.textContent = mine.length ? mine.map((r) => `${r.id}: ${r.text}`).join(' ') : (e ? '' : 'Log what happened. The rest of the block re-plans from it.');
  }

  /* the swap panel: same-pattern lifts from the graph, then from the open library */
  renderSwap(data, handlers) {
    const host = $('#swap');
    if (!data) { host.hidden = true; clear(host); return; }
    host.hidden = false;
    clear(host);
    const head = el('div', { class: 'sw-h' });
    head.append(el('span', {}, `swap ${data.item.name.toLowerCase()} in every ${data.tplName} (${data.patternLabel} slot)`));
    const close = el('button', { type: 'button', class: 'link' }, 'close');
    close.addEventListener('click', handlers.onClose);
    head.append(close);
    host.append(head);
    const group = (title, items, note) => {
      const g = el('div', { class: 'sw-g' });
      g.append(el('div', { class: 'sw-t' }, title));
      if (!items.length) g.append(el('span', { class: 'dim sw-none' }, note || 'nothing passes your constraints'));
      for (const c of items) {
        const b = el('button', { type: 'button', class: 'chip sm sw-c' });
        b.append(el('b', {}, c.name), el('span', {}, c.why));
        b.addEventListener('click', () => handlers.onPick(c));
        g.append(b);
      }
      host.append(g);
    };
    group('from the planner graph (joint attributes rated)', data.curated);
    group(`from the open library, ${data.libCount ? data.libCount + ' exercises' : 'loading'} (joints not rated; names screened)`, data.open, data.libCount ? 'no open-library entry matches the pattern, kit and flags' : 'the library is loading');
    if (data.pinned) {
      const r = el('button', { type: 'button', class: 'link' }, "go back to the planner's choice");
      r.addEventListener('click', handlers.onReset);
      host.append(r);
    }
  }

  /* ---------- decision log ---------- */
  renderLog(plan, lived, onPick) {
    const host = clear($('#log'));
    const all = plan.log.concat(lived.log);
    $('#log-count').textContent = `${plan.log.length} decisions · ${lived.log.length} re-plans`;
    for (const d of all) {
      const li = el('li', { class: 'le' + (d.id.startsWith('R') ? ' r' : ''), id: 'le-' + d.id, tabindex: '0', dataset: { id: d.id } });
      const head = el('span', { class: 'le-h' });
      head.append(el('b', { class: 'le-id' }, d.id), el('span', { class: 'le-tag ' + TAG[d.tag] }, '[' + TAG[d.tag] + ']'));
      li.append(head, el('span', { class: 'le-t' }, d.text));
      if (d.src && SOURCES[d.src]) li.append(el('span', { class: 'le-s' }, SOURCES[d.src].short));
      li.addEventListener('click', () => onPick(d));
      li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(d); } });
      host.append(li);
    }
  }

  litLog(id) {
    $$('.le').forEach((n) => n.classList.toggle('lit', n.dataset.id === id));
    const n = document.getElementById('le-' + id);
    const box = $('#log');
    if (n && box) box.scrollTo({ top: n.offsetTop - box.offsetTop - 8, behavior: 'smooth' });
  }

  /* ---------- narration ---------- */
  renderNarration(res, { stale = false, busy = '', onCite }) {
    const src = clear($('#nr-src'));
    const label = res.source === 'deterministic' ? 'planner narration, no model'
      : res.source === 'offline' ? 'no model route answered; the planner narration stands'
      : `${res.model} via ${res.source === 'ollama' ? 'your machine' : res.source === 'own-key' ? 'your key' : res.source === 'pollinations' ? 'the public route' : res.source}, ${fmt(res.ms / 1000, 1)} s`;
    src.append(el('span', { class: 'nr-l' + (res.source === 'deterministic' || res.source === 'offline' ? '' : ' gold') }, busy || label));
    src.append(el('span', { class: 'nr-c' }, `${res.ok} of ${res.sentences.length} sentences check out against the log`));
    if (res.note) src.append(el('span', { class: 'nr-c dim' }, res.note));
    if (stale) src.append(el('span', { class: 'nr-c dim' }, 'written for an earlier state of the plan'));
    const host = clear($('#nr'));
    for (const s of res.sentences) {
      const li = el('li', { class: 'ns' + (s.ok ? '' : ' bad') });
      li.append(el('span', { class: 'ns-t' }, s.say));
      const cs = el('span', { class: 'ns-c' });
      for (const c of s.cites) {
        const b = el('button', { type: 'button', class: 'cite' }, c);
        b.addEventListener('click', () => onCite(c));
        cs.append(b);
      }
      cs.append(el('span', { class: 'ns-k' + (s.ok ? '' : ' bad') }, s.ok ? 'checks out' : 'struck: ' + s.why));
      li.append(cs);
      host.append(li);
    }
  }

  setNarrateBusy(busy, label) {
    const b = $('#narrate');
    b.disabled = !!busy;
    b.textContent = busy ? label || 'asking the model' : 'ask the model to narrate';
    $('#nr-stop').hidden = !busy;
  }

  /* ---------- the model written out ---------- */
  renderMethod(plan, lived, sel, lib) {
    const p = LOAD_MODEL;
    const mode = plan.inp.mode;
    const t = $('#params');
    $$('tr', t).forEach((r) => r.remove());
    const rows = mode === 'pmc' ? [
      ['CTL', `${p.pmc.ctl} d`, 'chart convention: fitness as a 42-day average', null],
      ['ATL', `${p.pmc.atl} d`, 'chart convention: fatigue as a 7-day average', null],
      ['mapping', `k1 = 1/${p.pmc.ctl}, k2 = 1/${p.pmc.atl}`, `the Banister model with decay ${p.pmc.ctl - 1}/${p.pmc.ctl} and ${p.pmc.atl - 1}/${p.pmc.atl}`, 'banister1975'],
      ['prior', `${Math.round(p.prior[plan.inp.level] * 100)}% of week 1`, 'training before the block, illustrative', null],
    ] : [
      ['k1', p.k1, 'population default', 'hellard2006'],
      ['k2', mode === 'busso' ? `${p.k2Mean} on average, varies` : p.k2, 'population default', 'hellard2006'],
      ['tau1', `${p.tau1} d`, `default; elite swimmers ${p.hellard.tauA[0]} d, CI ${p.hellard.tauA[1]}-${p.hellard.tauA[2]}`, 'hellard2006'],
      ['tau2', `${p.tau2} d`, `default; elite swimmers ${p.hellard.tauF[0]} d, CI ${p.hellard.tauF[1]}-${p.hellard.tauF[2]}`, 'hellard2006'],
      ['tau3', `${p.tau3} d`, mode === 'busso' ? 'Busso mean fit, secondary source' : 'off in fixed dose', 'ceddia2025'],
      ['k3', mode === 'busso' ? lived.model.k3.toExponential(2) : '-', 'scaled to your plan, illustrative', null],
      ['prior', `${Math.round(p.prior[plan.inp.level] * 100)}% of week 1`, 'training before the block, illustrative', null],
    ];
    const hr = el('tr');
    for (const h of ['', 'value', 'status', 'source']) hr.append(el('th', { scope: 'col' }, h));
    t.append(hr);
    for (const [k, v, st, src] of rows) {
      const tr = el('tr');
      tr.append(el('td', { class: 'pk' }, k), el('td', {}, String(v)), el('td', { class: 'dim' }, st), el('td', { class: 'dim' }, src ? SOURCES[src].short : '-'));
      t.append(tr);
    }
    const w = Math.floor(sel / 7);
    const ix = lived.model.weeksLive[w];
    const box = clear($('#acwr'));
    box.append(el('div', { class: 'ac-k' }, `acute:chronic workload ratio, week ${w + 1}`));
    box.append(el('div', { class: 'ac-v' }, fmt(ix.acwr, 2)));
    box.append(el('p', {}, 'Computed coupled: this week over the mean of the last four, this week included. It is shown because coaches meet it everywhere, and no planner rule reads it. Impellizzeri et al. 2020 found no evidence for its use in load management to reduce injury risk, and showed that the ratio adds noise and creates statistical artifacts.'));
    box.append(el('p', { class: 'dim' }, 'The fitness-fatigue model has its own limits: its parameters are ill-conditioned and individual fits carry wide confidence intervals (Hellard et al. 2006). The curves show the shape of the plan; they do not forecast your performance.'));
    this.renderSensitivity(lived);
    this.renderGlossary();
    const lc = $('#libcred');
    lc.textContent = lib
      ? `Exercise library: ${lib.rows.length} exercises from free-exercise-db (The Unlicense, commit 79ca7b4, 2026-08-29), used in the swap menu. The planner's own choices come from ${Object.values(EX).filter((x) => !x.open).length} curated nodes that add joint-stress attributes and substitution edges; ${Object.keys(FEDB).length} of them map to a dataset entry, ${Object.values(FEDB).filter((v) => v.endsWith('~')).length} as close variants.`
      : 'Exercise library: loading free-exercise-db (The Unlicense).';
  }

  renderSensitivity(lived) {
    const host = clear($('#sens'));
    const band = lived.model.band;
    const cap = $('#sens-cap');
    if (!band) { cap.textContent = 'The 42/7 chart has fixed time constants; switch to fixed or variable dose to see the sensitivity.'; return; }
    const D = band.runs[0].form.length;
    const Wd = 520, Hd = 120, pad = 6;
    const root = svg('svg', { viewBox: `0 0 ${Wd} ${Hd}`, class: 'sens-svg', role: 'img', 'aria-label': `Form under five time-constant settings, each scaled to its own range. Peak days: ${band.runs.map((r) => `tau1 x${r.a}, tau2 x${r.b}: day ${r.peak + 1}`).join('; ')}.` });
    const x = (i) => pad + (i / (D - 1)) * (Wd - 2 * pad);
    for (let w = 1; w < D / 7; w++) root.append(svg('line', { x1: x(w * 7), x2: x(w * 7), y1: 0, y2: Hd, class: 'sens-wk' }));
    band.runs.forEach((r, k) => {
      const span = Math.max(1, r.max - r.min);
      const y = (v) => Hd - pad - ((v - r.min) / span) * (Hd - 2 * pad);
      const d = r.form.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      root.append(svg('path', { d, class: 'sens-l' + (k === 0 ? ' base' : '') }));
      root.append(svg('circle', { cx: x(r.peak), cy: y(r.form[r.peak]), r: k === 0 ? 3 : 2.2, class: 'sens-pk' + (k === 0 ? ' base' : '') }));
    });
    host.append(root);
    cap.textContent = `Each line is form under one setting of tau1 and tau2 (x0.5 or x1.5; gold is the default), scaled to its own range because the raw values differ by thousands of AU. The predicted peak lands anywhere across ${band.spread + 1} days of this block. Read the timing as fragile and the numbers as meaningless without a fit to you.`;
  }

  renderGlossary() {
    const host = $('#gloss');
    if (host.childElementCount) return;
    const G = [
      ['hard set', 'a prescribed working set, RPE 6 or above; warm-up sets do not count. Unit: sets.'],
      ['RPE (RIR)', 'effort on a 1-10 scale; for lifts, RPE = 10 - reps in reserve (Zourdos et al. 2016). RPE 8 leaves 2 reps.'],
      ['session RPE', 'one CR-10 rating for the whole session (Foster et al. 2001).'],
      ['session load', 'session RPE x minutes. Unit: arbitrary units, AU.'],
      ['weekly sets per muscle', 'sum of hard sets: 1 per set where the muscle is primary, 0.5 where it is secondary. Unit: sets per week.'],
      ['monotony', 'mean daily load / standard deviation of daily load over 7 days, rest days as 0 (Foster 1998). No unit.'],
      ['strain', 'weekly load x monotony. Unit: AU.'],
      ['fitness, fatigue', 'F and H above: impulse responses to each day\'s load with 45-day and 15-day decay. Unit: AU.'],
      ['form', 'F - H. A rising form means fatigue is clearing faster than fitness. Unit: AU.'],
      ['week rise', `this week's load against the mean of the 4 weeks before it, in %. Flagged above ${REPLAN.weekRiseFlag}%, a convention a graded 10%-rule programme did not support (Buist et al. 2008).`],
    ];
    for (const [k, v] of G) host.append(el('dt', {}, k), el('dd', {}, v));
  }

  renderRefs() {
    const host = clear($('#refs'));
    for (const s of Object.values(SOURCES)) host.append(el('li', {}, s.full));
  }

  /* ---------- the printable training sheet ---------- */
  renderPrint(plan, lived, log) {
    const host = clear($('#print'));
    host.append(el('h1', {}, 'Training block'), el('p', { class: 'pr-sub' }, plan.summary + '. Not medical advice; parameters are population defaults.'));
    for (let w = 0; w < lived.weeks.length; w++) {
      const sec = el('section', { class: 'pr-week' });
      sec.append(el('h2', {}, `Week ${w + 1} · ${lived.weeks[w].label}`));
      for (const day of lived.days.slice(w * 7, w * 7 + 7)) {
        if (!day.s || log[day.d]?.kind === 'missed') continue;
        const s = day.s;
        sec.append(el('h3', {}, `${DAY_LONG[day.dow]} · ${s.name} · ${s.minutes} min · session RPE ${s.srpe}`));
        const t = el('table');
        const hr = el('tr');
        for (const h of ['exercise', 'sets x reps', 'RPE', 'rest', 'log: reps @ load, per set']) hr.append(el('th', {}, h));
        t.append(hr);
        if (s.cardio) {
          const tr = el('tr');
          tr.append(el('td', {}, `${s.cardio.modality}: ${s.cardio.name}`), el('td', {}, `${s.cardio.minutes} min`), el('td', {}, String(s.cardio.rpe)), el('td', {}, '-'), el('td', {}, s.cardio.note));
          t.append(tr);
        }
        for (const it of s.items) {
          const tr = el('tr');
          const boxes = el('td', { class: 'pr-boxes' });
          for (let i = 0; i < it.sets; i++) boxes.append(el('span', { class: 'pr-box' }));
          tr.append(el('td', {}, it.name), el('td', {}, `${it.sets} x ${it.reps}`), el('td', {}, `${it.rpe} (${rir(it.rpe)} RIR)`), el('td', {}, `${it.rest} min`), boxes);
          t.append(tr);
        }
        sec.append(t, el('p', { class: 'pr-log' }, 'session RPE ____   minutes ____   notes ________________________'));
      }
      host.append(sec);
    }
  }

  /* ---------- small affordances ---------- */
  flash(view, scroll = false) {
    const map = { calendar: '#v-week', curves: '#v-curves', body: '#v-body', graph: '#v-graph', session: '#v-session', log: '#v-log', plan: '#v-curves' };
    const n = $(map[view] || '#v-curves');
    if (!n) return;
    n.classList.remove('flash');
    void n.offsetWidth;
    n.classList.add('flash');
    if (scroll) {
      const r = n.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  announce(text) {
    this.announcer.textContent = '';
    setTimeout(() => { this.announcer.textContent = text; }, 30);
  }

  message(text) {
    const m = $('#x-msg');
    m.textContent = text;
    clearTimeout(this._mt);
    this._mt = setTimeout(() => { m.textContent = ''; }, 4000);
  }
}
