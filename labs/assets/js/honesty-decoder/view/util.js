/* ============================================================
   honesty-decoder/view/util.js — small shared pieces of the view:
   escaping, number format, and the verdict marks. One mark per
   verdict, distinguished by shape, used identically in every view:
     supported   filled disc
     partial     half-filled disc
     unsupported ring with a slash
     unverified  dashed ring
     framing     hollow diamond (not checkable)
   ============================================================ */

import { esc } from '../../kit/dom.js';
export { esc };
export const fmt = (x) => (x == null || Number.isNaN(x) ? '—' : String(Math.round(x)));
export const sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(Math.round(x));

export const VCLASS = { supported: 'v-sup', partial: 'v-par', unsupported: 'v-uns', unverified: 'v-unv', framing: 'v-frm' };
export const vclass = (eff) => (eff?.excluded ? 'v-frm' : VCLASS[eff?.verdict] || 'v-unv');

export function mark(cls, title = '') {
  const t = title ? `<title>${esc(title)}</title>` : '';
  const body = {
    'v-sup': '<circle cx="7" cy="7" r="5.2" fill="currentColor"/>',
    'v-par': '<circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M7 1.8a5.2 5.2 0 0 0 0 10.4z" fill="currentColor"/>',
    'v-uns': '<circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.3 10.7 10.7 3.3" stroke="currentColor" stroke-width="1.2"/>',
    'v-unv': '<circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>',
    'v-frm': '<path d="M7 1.6 12.4 7 7 12.4 1.6 7z" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  }[cls] || '';
  return `<svg class="mk ${cls}" viewBox="0 0 14 14" role="img" aria-label="${esc(title || cls)}">${t}${body}</svg>`;
}

export function statusMark(status) {
  if (status === 'pending') return '<svg class="st pending" viewBox="0 0 12 12" aria-label="check running"><path d="M6 1a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  if (status === 'pass') return '<svg class="st" viewBox="0 0 12 12" aria-label="check passed"><path d="M2 6.4 4.8 9 10 3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  if (status === 'fail' || status === 'error') return '<svg class="st" viewBox="0 0 12 12" aria-label="check failed"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="currentColor" stroke-width="1.4"/></svg>';
  if (status === 'skipped') return '<svg class="st" viewBox="0 0 12 12" aria-label="deep check not run"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="1.6 1.6"/></svg>';
  return '<svg class="st" viewBox="0 0 12 12" aria-label="no check"><path d="M2 6h8" stroke="currentColor" stroke-width="1.2"/></svg>';
}

export const BASIS_LABEL = {
  reference: 'reference', state: 'lab state', route: 'route', code: 'code', self: 'self check',
  inspection: 'inspection', author: 'author', framing: 'framing',
};

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]still/.test(location.search);

/* Count a number up into an element, or set it at once under reduced motion. */
export function countTo(el, target, ms = 560) {
  if (!el) return;
  if (target == null) { el.textContent = '—'; return; }
  const to = Math.round(target);
  if (reduceMotion()) { el.textContent = String(to); return; }
  const from = Number(el.dataset.v || 0);
  el.dataset.v = String(to);
  if (from === to) { el.textContent = String(to); return; }
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    el.textContent = String(Math.round(from + (to - from) * ease(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
