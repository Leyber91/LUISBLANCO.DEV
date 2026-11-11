/* ============================================================
   altverse/render/tour.js — a five-step guided first run, from the
   divergence through one causal chain. Skippable (Esc), replayable
   from the "guided tour" button.
   ============================================================ */

import { el, esc } from './svg.js';

const STEPS = [
  ['#dv-form', 'The divergence', 'Type any change or pick an example. The line under the box is how the engine reads it: which rule families, what size, from when, and how many of our recorded events fall after that date.'],
  ['#pipe-graph', 'The multipath', 'Nine stages, each reading the ones before it. A stage glows gold while it runs and turns bright when done; a dashed stage was pruned because what it needs does not exist. Click a stage to read its card.'],
  ['#map-wrap', 'The ground', 'Generated from the divergence: sea level, ice, rivers, settlements and routes. Gold stipple marks every cell whose land, sea or ice differs from ours on the same seed; the dashed line is our coast.'],
  ['#river', 'The river of time', 'Ours runs dim, this world bright from the divergence on. Tethers join an invention\'s date in ours to its date here. Pick an event to read why it happened and to fork a new world from it.'],
  ['#causal', 'The causal record', 'Every consequence names its cause. Hover one to light its path back to the change in gold. The ledger below shows the rules every line passed.'],
];

export function startTour({ reduced } = {}) {
  let i = 0;
  const card = el('div', 'tour');
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Guided tour');
  document.body.appendChild(card);
  const clear = () => document.querySelectorAll('.tour-on').forEach((n) => n.classList.remove('tour-on'));
  const close = () => { clear(); card.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', onKey);
  function go(d) { i = Math.max(0, Math.min(STEPS.length - 1, i + d)); paint(); }
  function paint() {
    clear();
    const [sel, title, body] = STEPS[i];
    const t = document.querySelector(sel);
    if (t) { t.classList.add('tour-on'); t.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); }
    card.innerHTML = `<div class="tour-n">${i + 1} / ${STEPS.length}</div><div class="tour-t">${esc(title)}</div><p>${esc(body)}</p>
      <div class="tour-b"><button type="button" class="ghost" data-a="skip">skip</button><span><button type="button" class="ghost" data-a="prev" ${i === 0 ? 'disabled' : ''}>back</button> <button type="button" class="go" data-a="next">${i === STEPS.length - 1 ? 'done' : 'next'}</button></span></div>`;
    card.querySelector('[data-a=skip]').onclick = close;
    card.querySelector('[data-a=prev]').onclick = () => go(-1);
    card.querySelector('[data-a=next]').onclick = () => (i === STEPS.length - 1 ? close() : go(1));
    card.querySelector('[data-a=next]').focus();
  }
  paint();
}
