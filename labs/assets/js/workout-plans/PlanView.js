/* ============================================================
   workout-plans/PlanView.js — the view. Owns every DOM reference
   and is the ONLY thing that touches the page. Renders the header
   status line, the busy/idle button states, the streaming reasoning
   panel and the weekly plan grid — byte-for-byte the same DOM ids,
   classes and datasets the original built (the CSS keys off them).
   Pure presentation: it holds no plan logic.
   ============================================================ */

import {
  SEL, BTN_TEXT, COMPOSING_TEXT, REASON_LABEL, REASON_LABEL_FALLBACK,
  TIER_TEXT, BACKEND_NOTE, GOAL_LABEL, EQUIP_LABEL,
} from './constants.js';
import { $, el, setText, setValue } from './dom.js';
import { AI_CONFIG } from '../ai/config.js';

export class PlanView {
  constructor() {
    this.form        = $(SEL.form);
    this.genBtn      = $(SEL.generate);
    this.stopBtn     = $(SEL.stop);
    this.resting     = $(SEL.resting);
    this.planEl      = $(SEL.plan);
    this.reasonWrap  = $(SEL.reasonWrap);
    this.reasonBody  = $(SEL.reasonBody);
    this.reasonLabel = $(SEL.reasonLabel);
    this.reasonTog   = $(SEL.reasonToggle);
    this.statusEl    = $(SEL.aiStatus);
    this.statusLabel = $(SEL.aiStatusLabel);
    this.backendNote = $(SEL.backendNote);
  }

  /* ---- header: read the form, set the year, wire static handlers ---- */
  readInputs() {
    const f = new FormData(this.form);
    return {
      goal:        String(f.get('goal')),
      days:        Number(f.get('days')),
      minutes:     Number(f.get('minutes')),
      level:       String(f.get('level')),
      equipment:   String(f.get('equipment')),
      constraints: String(f.get('constraints') || '').trim(),
    };
  }

  setYear() { setText(SEL.year, String(new Date().getFullYear())); }

  onSubmit(handler) {
    this.form.addEventListener('submit', (e) => { e.preventDefault(); handler(this.readInputs()); });
  }

  onStop(handler) { this.stopBtn.addEventListener('click', handler); }

  bindReasoningToggle() {
    this.reasonTog.addEventListener('click', () => {
      const open = this.reasonTog.getAttribute('aria-expanded') === 'true';
      this.reasonTog.setAttribute('aria-expanded', String(!open));
    });
  }

  /* ---- header status line, per detected backend tier ---- */
  paintStatus(mode) {
    const [short, long] = (TIER_TEXT[mode] || TIER_TEXT.echo)(AI_CONFIG);
    this.statusEl.dataset.mode = mode;
    this.statusLabel.textContent = short;
    this.backendNote.textContent = BACKEND_NOTE(long);
  }

  /* ---- generate lifecycle ---- */
  beginGenerate(mode) {
    this.resting.hidden = true;
    this.planEl.innerHTML = '';
    this.reasonBody.textContent = '';
    this.reasonWrap.hidden = false;
    this.reasonWrap.dataset.active = 'true';
    this.reasonTog.setAttribute('aria-expanded', 'true');
    this.reasonLabel.textContent = REASON_LABEL[mode] || REASON_LABEL_FALLBACK;
    this.setBusy(true);
    this._showComposing();
  }

  _showComposing() {
    const composing = el('div', 'composing');
    composing.append(el('span', 'blip'), el('span', null, COMPOSING_TEXT));
    this.planEl.append(composing);
  }

  appendReasoning(text) {
    this.reasonBody.textContent += text;
    this.reasonBody.scrollTop = this.reasonBody.scrollHeight;
  }

  /* stream finished: stop the pulse, hide the panel if nothing came */
  endReasoning(gotReasoning) {
    this.reasonWrap.dataset.active = 'false';
    if (!gotReasoning) this.reasonWrap.hidden = true;
  }

  setBusy(busy) {
    this.genBtn.disabled = busy;
    this.genBtn.querySelector('span').textContent = busy ? BTN_TEXT.busy : BTN_TEXT.idle;
    this.stopBtn.hidden = !busy;
  }

  /* ---- the weekly grid ---- */
  renderPlan(plan, inputs, note) {
    this.planEl.innerHTML = '';

    if (plan.summary) this.planEl.append(el('p', 'plan-summary', plan.summary));
    this.planEl.append(this._meta(inputs));

    for (const d of plan.split) this.planEl.append(this._day(d, inputs));

    this.planEl.append(this._foot(plan, note));
  }

  _meta(inputs) {
    const meta = el('div', 'plan-meta');
    const tag = (label, val) => {
      const w = el('span');
      w.append(document.createTextNode(label + ' '), el('b', null, val));
      return w;
    };
    meta.append(
      tag('goal', GOAL_LABEL[inputs.goal] || inputs.goal),
      tag('days', String(inputs.days) + '/wk'),
      tag('session', inputs.minutes + ' min'),
      tag('level', inputs.level),
      tag('kit', EQUIP_LABEL[inputs.equipment] || inputs.equipment),
    );
    return meta;
  }

  _day(d, inputs) {
    const day = el('div', 'day');
    const head = el('div', 'day-head');
    head.append(
      el('span', 'day-name', d.day || ''),
      el('span', 'day-focus', d.focus || ''),
      el('span', 'day-mins', (d.minutes || inputs.minutes) + ' min'),
    );
    day.append(head);
    for (const ex of (d.exercises || [])) {
      const row = el('div', 'ex');
      const top = el('div', 'ex-top');
      top.append(el('span', 'ex-name', ex.name || ''), el('span', 'ex-dose', this._dose(ex)));
      row.append(top);
      if (ex.note) row.append(el('span', 'ex-note', ex.note));
      day.append(row);
    }
    return day;
  }

  _dose(ex) {
    const sets = ex.sets != null ? ex.sets : '';
    const reps = ex.reps != null ? ex.reps : '';
    let s = sets && reps ? `${sets} × ${reps}` : (reps || sets || '');
    if (ex.rpe) s += ` · RPE ${ex.rpe}`;
    return s;
  }

  _foot(plan, note) {
    const foot = el('div', 'plan-foot');
    if (plan.progression) foot.append(this._footBlock('Progression', plan.progression));
    if (plan.deload)      foot.append(this._footBlock('Deload', plan.deload));
    if (Array.isArray(plan.caveats) && plan.caveats.length) {
      const b = el('div', 'foot-block');
      b.append(el('span', 'k', 'Worked around'));
      const ul = el('ul', 'caveats');
      for (const c of plan.caveats) ul.append(el('li', null, c));
      b.append(ul);
      foot.append(b);
    }
    if (note) foot.append(this._footBlock('Note', note));
    return foot;
  }

  _footBlock(k, v) {
    const b = el('div', 'foot-block');
    b.append(el('span', 'k', k), el('span', 'v', v));
    return b;
  }

  /* ---- demo mode: reflect inputs into the form, paint a static block ---- */
  reflectInputs(inputs) {
    setValue(SEL.goal, inputs.goal);
    setValue(SEL.days, String(inputs.days));
    setValue(SEL.minutes, String(inputs.minutes));
    setValue(SEL.level, inputs.level);
    setValue(SEL.equipment, inputs.equipment);
    setValue(SEL.constraints, inputs.constraints);
  }

  showDemoReasoning(scriptText) {
    this.resting.hidden = true;
    this.reasonWrap.hidden = false;
    this.reasonWrap.dataset.active = 'false';
    this.reasonLabel.textContent = REASON_LABEL.worker;
    this.reasonBody.textContent = scriptText;
  }
}
