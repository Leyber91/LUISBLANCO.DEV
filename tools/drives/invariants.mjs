/* ============================================================
   tools/drives/invariants.mjs: rules a page must keep after every
   step of a drive. Register them with tools/drive.mjs:

     import { standard } from './invariants.mjs';
     for (const [name, expr] of standard({ gold: { allow: ['.bp'] } })) p.invariant(name, expr);

   Each rule is an expression evaluated in the page that returns
   what breaks it, as a list of short strings (empty: it holds).

   Why it exists: on 2026-11-16 the review of pull request 42 found
   the sky scrolling sideways at 390 px once its table of transits
   was opened. The drive checked for that once, before it opened the
   table. A rule checked at one moment says nothing of the states
   the scenario walks through afterwards; these run after each one.

   The rules
   - overflow: the page never scrolls sideways.
   - targets: below a width (400 px by default) every visible target
     a finger can press is at least 44 px tall and 24 px wide. A
     target is a link, a button, a field, a summary, anything with
     the role of a switch, radio, tab, slider, option or button, and
     anything in the tab order. A link in a line of text is the one
     exception (WCAG 2.2, 2.5.8: an inline target), and so is a
     disabled control.
   - contrast: every visible text is at least 4.5 to 1 against what
     is behind it (3 to 1 from 24 px, or 18.66 px bold), as WCAG 2.2
     1.4.3 asks; a disabled control is exempt. What is behind a text
     is the first opaque background among its ancestors, with the
     translucent ones over it composited, and the page's own
     background under all; a text over a drawing or a picture is
     measured against that, not against the picture, which is what
     this rule cannot see. A text in a running transition or
     animation (a fade) is measured once it has settled.
   - gold: the site's gold (--accretion and its two tints) is used
     by no element but the ones a page allows, in its text, borders,
     background, stroke or fill; and, when a page names canvases,
     no pixel of a canvas is gold unless the page names that canvas
     with its reason, or the condition the page gives for gold on
     it holds.
   ============================================================ */

/* ---- inside the page ---- */

const SHOWN = `(e) => !!e && e.getClientRects().length > 0 && (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : getComputedStyle(e).visibility !== 'hidden')`;
const NAME = `(e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')) + ((e.textContent || '').trim() ? ' "' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24) + '"' : '')`;

export const overflow = () => `(() => {
  const d = document.documentElement, b = document.body;
  const w = Math.max(d.scrollWidth, b ? b.scrollWidth : 0);
  if (w <= innerWidth + 1) return [];
  const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; })
    .filter((e) => !e.parentElement || e.parentElement.getBoundingClientRect().right <= innerWidth + 1).slice(0, 3);
  const name = ${NAME};
  return ['the page is ' + w + ' px wide in a ' + innerWidth + ' px window' + (wide.length ? ': ' + wide.map((e) => name(e) + ' to ' + Math.round(e.getBoundingClientRect().right)).join(', ') : '')];
})()`;

export const TARGETS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="switch"], [role="radio"], [role="tab"], [role="slider"], [role="option"], [role="button"], [tabindex]:not([tabindex="-1"])';

export const targets = ({ below = 400, tall = 44, wide = 24 } = {}) => `(() => {
  if (innerWidth > ${below}) return [];
  const shown = ${SHOWN}, name = ${NAME};
  const inline = (e) => {   // a link in a line of text: inline, in a block that holds words besides its own
    if (e.tagName !== 'A' || getComputedStyle(e).display !== 'inline') return false;
    let b = e.parentElement;
    while (b && getComputedStyle(b).display.startsWith('inline')) b = b.parentElement;
    if (!b) return false;
    const own = e.textContent.replace(/\\s+/g, ''), all = b.textContent.replace(/\\s+/g, '');
    return all.length > own.length + 1;
  };
  const out = [];
  for (const e of document.querySelectorAll(${JSON.stringify(TARGETS)})) {
    if (e.disabled || e.closest('[aria-disabled="true"], [inert]') || !shown(e) || inline(e)) continue;
    let r = e.getBoundingClientRect();
    if ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) r = e.closest('label').getBoundingClientRect();   // the label is the target
    if (r.height < ${tall} - 0.5 || r.width < ${wide} - 0.5) out.push(name(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return [...new Set(out)];
})()`;

export const contrast = ({ min = 4.5, large = 3 } = {}) => `(() => {
  const shown = ${SHOWN}, name = ${NAME};
  const rgba = (c) => {
    let m = /^rgba?\\(([^)]+)\\)$/.exec(c);
    if (m) { const v = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; }
    m = /^color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)(?: \\/ ([\\d.e-]+))?\\)$/.exec(c);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return null;
  };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const page = rgba(getComputedStyle(document.body).backgroundColor) || [0, 0, 0, 0];
  const base = page[3] > 0 ? over(page, rgba(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1]) : (rgba(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1]);
  const behind = (e) => {
    const layers = [];
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let bg = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : base;
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const opacityOf = (e) => { let o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  // a text whose element or an ancestor is in a running transition or animation is measured at a later step, once
  // it has settled: a fade is not a colour
  const moving = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target).map((a) => a.effect.target);
  const settling = (e) => moving.some((t) => t === e || (t.contains && t.contains(e)));
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('script, style, noscript, option, canvas, svg, [aria-hidden="true"] .sr, .sr, .visually-hidden') || !shown(e)) continue;
    if (e.closest('button:disabled, input:disabled, select:disabled, [aria-disabled="true"]') || settling(e)) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = e.getBoundingClientRect(); if (r.width <= 1 || r.height <= 1) continue;
    const s = getComputedStyle(e), fg = rgba(s.color); if (!fg) continue;
    const bg = behind(e), o = opacityOf(e);
    const ink = over([fg[0], fg[1], fg[2], fg[3] * o], bg);
    const L1 = lum(ink), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), bold = (+s.fontWeight || 400) >= 700, need = px >= 24 || (px >= 18.66 && bold) ? ${large} : ${min};
    if (ratio < need - 0.005) out.push(name(e) + ' ' + ratio.toFixed(2) + ':1');
  }
  return [...new Set(out)].slice(0, 12);
})()`;

/* gold: allow, the selectors of the elements that may be gold (each with its reason in the caller);
   canvases: { scan: true, named: { '<selector>': 'reason' }, when: { '<selector>': '<expression: gold allowed now>' } } */
export const gold = ({ allow = [], canvases = null } = {}) => `(() => {
  const shown = ${SHOWN}, name = ${NAME};
  const probe = document.createElement('i'); document.body.append(probe);
  const tok = ['--accretion', '--accretion-soft', '--accretion-dim'].map((v) => { probe.style.color = 'var(' + v + ')'; return getComputedStyle(probe).color; });
  probe.remove();
  const allowed = ${JSON.stringify(allow.join(', ') || ':not(*)')};
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest(allowed) || e.closest('dialog:not([open])') || !shown(e)) continue;
    const s = getComputedStyle(e), used = [];
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) used.push(s.color);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none') used.push(s['border' + side + 'Color']);
    used.push(s.backgroundColor);
    if (e instanceof SVGElement) { if (s.stroke && s.stroke !== 'none') used.push(s.stroke); if (s.fill && s.fill !== 'none') used.push(s.fill); }
    if (used.some((c) => tok.includes(c))) out.push(name(e));
  }
  const cv = ${JSON.stringify(canvases)};
  if (cv && cv.scan) {
    const rgb = tok.map((c) => c.match(/\\d+/g).slice(0, 3).map(Number));
    const named = Object.keys(cv.named || {}), when = cv.when || {};
    for (const c of document.querySelectorAll('canvas')) {
      if (!c.width || !c.height || !shown(c) || named.some((s) => c.matches(s))) continue;
      const cond = Object.keys(when).find((s) => c.matches(s));
      if (cond && (0, eval)(when[cond])) continue;
      let d; try { const x = c.getContext('2d'); if (!x) continue; d = x.getImageData(0, 0, c.width, c.height).data; } catch { continue; }
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 90) continue;
        for (const g of rgb) if (Math.abs(d[i] - g[0]) <= 22 && Math.abs(d[i + 1] - g[1]) <= 22 && Math.abs(d[i + 2] - g[2]) <= 22) { n++; break; }
      }
      if (n > 0) out.push((c.id ? '#' + c.id : (c.parentElement && c.parentElement.closest('[id]') ? '#' + c.parentElement.closest('[id]').id + ' ' : '') + 'canvas.' + [...c.classList].join('.')) + ': ' + n + ' gold pixels');
    }
  }
  return [...new Set(out)].slice(0, 12);
})()`;

/* the four rules, as [name, expression] for page.invariant */
export function standard({ gold: g = {}, targets: t = {}, contrast: c = {} } = {}) {
  return [
    ['invariant: the page never scrolls sideways', overflow()],
    ['invariant: every visible target is at least 44 px tall and 24 px wide at 390', targets(t)],
    ['invariant: every visible text is at least 4.5 to 1 against what is behind it', contrast(c)],
    ['invariant: gold only where the page allows it', gold(g)],
  ];
}
