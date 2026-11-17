/* ============================================================
   tools/invariants.mjs: rules a page must keep after every step of
   a drive. Register them with tools/drive.mjs:

     import { standard } from '../invariants.mjs';
     for (const [name, expr] of standard({ gold: { allow: ['.bp'] } })) p.invariant(name, expr);

   Each rule is an expression evaluated in the page that returns
   what breaks it, as a list of short strings (empty: it holds). The
   rules are functions of this module, written into the page with
   their helpers, so tools/dev/conditions.mjs reads their conditions
   like any other code.

     node tools/invariants.mjs selftest   fixture pages in one headless Chrome (tools/drive.mjs, port 9361): a
                                          case just inside and just outside every bound, every exemption with a
                                          case it must not cover; tools/mutants/invariants.json breaks each rule
                                          for tools/mutate.mjs

   Why it exists: on 2026-11-16 the review of pull request 42 found
   the sky scrolling sideways at 390 px once its table of transits
   was opened. The drive checked for that once, before it opened the
   table. A rule checked at one moment says nothing of the states
   the scenario walks through afterwards; these run after each one.
   It moved here from tools/drives/ so that tools/mutate.mjs, which
   tests the tools in tools/, can break it in a copy.

   The rules
   - overflow: the page never scrolls sideways (its width, or the
     body's when the body scrolls on its own, is at most the window's
     plus 1 px), and no block starts more than 1 px off the left edge
     while part of it is on the page, unless a box that cuts it (its
     containing block, or one above that), itself on the page, holds
     it.
   - targets: up to a width (400 px by default) every target a
     finger can press is at least 44 px tall and 24 px wide (each
     with 0.5 px of rounding), measured on the part the boxes that
     cut it let be seen (an absolute target is cut by its positioned
     ancestor, a fixed one only by a box a transform, a filter or
     containment makes its own), and what a finger meets at the
     middle of that part, when it is in the window, is the target or
     a part of it, not another element (covered), nor an ancestor
     through its ::before or ::after (placed out of the flow, taking
     the finger). An open dialog, a popup list or menu and a popover
     lie over the page by design; so does what is fixed or sticky to
     the window when the target is not pinned with it (it moves apart
     on a scroll: not fixed to the window too, not in the same sticky
     box) and its fixed or sticky box does not span the window (a
     veil). The page may name others, each with its reason. A target
     is a
     link, a button, a field, a summary, anything with the role of a
     button, link, checkbox, switch, radio, tab, slider, option, menu
     item, tree item or combo box, and anything in the tab order. Not
     measured: a link in a line of text (WCAG 2.2, 2.5.8: an inline
     target; a line holds two letters or more besides its targets, so
     a row of bare links is not one), a disabled control, and a target
     the boxes that cut it hide entirely (a skip link before its
     focus). A checkbox or radio in a label is measured by it.
   - contrast: every visible text is at least 4.5 to 1 against what
     is behind it (3 to 1 from 24 px, or from 18.66 px at a weight of
     700), as WCAG 2.2 1.4.3 asks, with 0.005 of rounding: the text of
     an element (its -webkit-text-fill-color, which paints over its
     color), the words of its ::before and ::after (a counter
     included), and SVG text by its fill. Colours are read in any CSS
     form (oklab, color-mix) through a canvas. Text and background are
     each worked out as they reach the screen: each box from the
     element out, its background under what it holds, the whole faded
     by its opacity, then over the page; so an ancestor's opacity
     fades its background as much as the text. A text in a transition
     or animation that ends is measured once it has ended; one that
     never ends is measured as it runs. Not measured: a disabled
     control, .sr, a box of 1 px or less.
   - gold: the site's gold (--accretion and its two tints, when the
     page defines them; each channel within 22, at an alpha of 40 of
     255 or more) is used by no element but the ones a page allows: in
     its text (color and -webkit-text-fill-color), its text shadow and
     decoration, its borders, outline, background and the stops of a
     background gradient, its box shadow, SVG stroke or fill, its
     accent-color on a checked box or radio, a range or a meter, its
     ::marker, or those of its ::before and ::after (a counter
     included). When a page asks, no pixel of any 2D canvas is gold
     either (alpha 64 of 255 or more, each channel within 22: under a
     quarter of opacity a pixel is a halo, the tail of a glow mixing
     with what lies under it, not a mark), with four allowances a
     page gives by selector: a canvas named with its reason (not
     read); a canvas whose condition holds (not read while it holds);
     a canvas that may hold one gold dot while its condition holds
     (its gold pixels within a box under 12 CSS px each way); a canvas
     drawn in a colour of its own, a star (pixels within 28 of it in
     every channel are not counted, nor pixels under 160 of alpha
     within 3 CSS px of those, its glow, which over another line can
     tint toward gold; a gold line or mark away from the star counts
     from an alpha of 64, a 1 px line included). A canvas the rule
     should read and cannot (no 2D context, pixels refused) is a
     break, and so is a canvas whose own colour is not found.
   Each rule lists twelve breaks at most (overflow, six).

   What the rules cannot see (limits, declared rather than guessed at):
   - a text cut by its parent (a nowrap word in an overflow:hidden
     box): not a sideways scroll; shapes.mjs checks truncation;
   - a target covered away from its middle, or covered while it is
     out of the window: only the middle of what is seen is tested;
   - a target that something fixed or sticky to the window covers
     where the page can scroll no further (a bar over the last button,
     a sticky header over a page that cannot scroll): such a cover is
     taken for one that moves with the scroll;
   - an element with the role of a dialog is taken to lie over the
     page by design, though it never closes (a banner given the role);
   - where an ancestor's ::before or ::after lies is not read: when
     the finger meets the ancestor at a target's middle and one of
     them is placed out of the flow and takes the finger, the target
     is taken to be covered by it;
   - a text over a picture, a background image or a drawing, or over
     an element behind it that is not its ancestor (a plate placed
     under it): it is measured against its ancestors' colours;
   - gold in a background image: an image's pixels are not read;
   - text drawn on a canvas: the labs' drives check the ink their
     code names for it;
   - a thin gold line on a star's canvas that passes within 3 CSS px
     of the star: it reads as the star's glow.
   ============================================================ */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ---------------- the helpers, run in the page ---------------- */

function shownFn(e) {   // no box (display none or contents), visibility hidden, opacity 0, under content-visibility: not seen
  return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}
function nameFn(e) {
  const text = e.textContent.trim();
  return (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '')) + (text ? ' "' + text.replace(/\s+/g, ' ').slice(0, 24) + '"' : '');
}
/* Any CSS colour as [r, g, b, a] (a from 0 to 1): rgb() and color(srgb) as written, every other form (oklab, lab,
   color-mix in another space) drawn on a 1 px canvas and read back. */
function colorFactory() {
  const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
  const x = cv.getContext('2d', { willReadFrequently: true });
  return (c) => {
    let m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(c);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    x.clearRect(0, 0, 1, 1); x.fillStyle = 'rgba(0, 0, 0, 0)'; x.fillStyle = c; x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
}
/* The words a ::before or ::after shows: the quoted strings of its content, with a # for each counter or attribute it
   prints; none for an image or no content. */
function wordsFn(p) {
  const parts = String(p.content).match(/"(?:[^"\\]|\\.)*"|counters?\([^)]*\)|attr\([^)]*\)/g) || [];
  return parts.map((t) => (t[0] === '"' ? t.slice(1, -1) : '#')).join('').trim();
}
/* The boxes whose overflow can cut an element: its containing block, then that box's, up the page. A static or
   relative box is held by its parent; an absolute one by its nearest positioned ancestor; a fixed one by none, unless
   an ancestor's transform, filter, perspective or containment makes it the containing block. */
function clippersFn(e) {
  const out = [];
  for (let n = e; ;) {
    const pos = getComputedStyle(n).position;
    let c = n.parentElement;
    if (pos === 'absolute' || pos === 'fixed') {
      const holds = (a) => { const s = getComputedStyle(a); return (pos === 'absolute' && s.position !== 'static') || s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' || /paint|layout|strict|content/.test(s.contain); };
      while (c && !holds(c)) c = c.parentElement;
    }
    if (!c) return out;
    out.push(c);
    n = c;
  }
}

/* ---------------- the rules, run in the page ---------------- */

function overflowRule(o, { shown, name, clippers }) {
  const d = document.documentElement, b = document.body, out = [];
  const w = Math.max(d.scrollWidth, b.scrollWidth);   // the body can scroll sideways on its own (html overflow hidden, body overflow auto)
  if (w > innerWidth + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed')
      .filter((e) => e.parentElement.getBoundingClientRect().right <= innerWidth + 1).slice(0, 3);
    out.push('the page is ' + w + ' px wide in a ' + innerWidth + ' px window' + (wide.length ? ': ' + wide.map((e) => name(e) + ' to ' + Math.round(e.getBoundingClientRect().right)).join(', ') : ''));
  }
  // a block pushed off the left edge: part of it before the page, part on it, and no box that cuts it (its containing
  // block or one above that) on the page
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (r.left >= -1 || r.right <= 1 || !shown(e)) continue;
    const held = clippers(e).some((n) => n !== b && n !== d && getComputedStyle(n).overflowX !== 'visible' && n.getBoundingClientRect().left >= -1);
    if (!held && (e.parentElement === b || e.parentElement.getBoundingClientRect().left >= -1)) out.push(name(e) + ' starts at ' + Math.round(r.left) + ' px, off the left edge');
  }
  return out.slice(0, 6);
}

function targetsRule(o, { shown, name, clippers }) {
  if (innerWidth > o.below) return [];
  const inline = (e) => {   // a link in a line of text: inline, in a block that holds two letters or more besides targets
    if (e.tagName !== 'A' || getComputedStyle(e).display !== 'inline') return false;
    let b = e.parentElement;
    while (getComputedStyle(b).display.startsWith('inline')) b = b.parentElement;
    let words = 0;
    const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) { const at = t.parentElement.closest(o.sel); if (!at || !b.contains(at)) words += t.textContent.replace(/\s+/g, '').length; }
    return words > 1;
  };
  // the part of a box the boxes that cut it let be seen
  // the part of a box the boxes that cut it let be seen: a box that hides or clips its overflow cuts for good, so its
  // cut is the target's size; a box that scrolls cuts only where it now stands, so its cut moves where a finger is
  // looked for but not the size, and a target it hides now is not looked at
  const seen = (e, r) => {
    let L = r.left, T = r.top, R = r.right, B = r.bottom, l = L, t = T, rr = R, b = B;
    for (const n of clippers(e)) {
      const s = getComputedStyle(n), q = n.getBoundingClientRect();
      if (/hidden|clip/.test(s.overflowX)) { L = Math.max(L, q.left); R = Math.min(R, q.right); }
      if (/hidden|clip/.test(s.overflowY)) { T = Math.max(T, q.top); B = Math.min(B, q.bottom); }
      if (s.overflowX !== 'visible') { l = Math.max(l, q.left); rr = Math.min(rr, q.right); }
      if (s.overflowY !== 'visible') { t = Math.max(t, q.top); b = Math.min(b, q.bottom); }
    }
    return { w: Math.max(0, R - L), h: Math.max(0, B - T), now: rr > l && b > t, x: (l + rr) / 2, y: (t + b) / 2 };
  };
  // what moves with the window as the page or a box scrolls: the nearest box fixed to it (one that a transform, a filter
  // or containment above holds is not: it moves with that box) or sticky, itself included, and what it moves with
  const pinned = (n) => {
    for (; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'sticky' || (p === 'fixed' && !clippers(n).length)) return { box: n, with: p === 'sticky' ? n : 'window' }; }
    return null;
  };
  // a cover fixed or sticky to the window and a target that move apart on a scroll: the target is not pinned with it
  // (on 2026-11-17 a toast fixed over a fixed bar's button passed, and so did every cover inside an app in a fixed
  // scroller), and the cover's box is not a veil, one that spans the window and takes the finger (an invisible veil left
  // behind passed); a layer over the whole window that lets the finger through to its panels is not one
  const apart = (t, self) => {
    const c = pinned(t), s = pinned(self);
    if (!c) return false;
    const q = c.box.getBoundingClientRect();
    if (getComputedStyle(c.box).pointerEvents !== 'none' && q.left <= 1 && q.top <= 1 && q.right >= innerWidth - 1 && q.bottom >= innerHeight - 1) return false;
    return !s || s.with !== c.with;
  };
  // an ancestor's ::before or ::after placed out of the flow that takes the finger: the one a finger meets there, or
  // undefined
  const pseudoOver = (a) => ['::before', '::after'].find((k) => { const p = getComputedStyle(a, k); return p.content !== 'none' && /absolute|fixed/.test(p.position) && p.pointerEvents !== 'none'; });
  const out = [];
  for (const e of document.querySelectorAll(o.sel)) {
    if (e.disabled || e.closest('[aria-disabled="true"], [inert]') || !shown(e) || inline(e)) continue;
    let r = e.getBoundingClientRect(), self = e;
    if ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) { self = e.closest('label'); r = self.getBoundingClientRect(); }   // the label is the target
    const v = seen(e, r);
    if (v.w === 0 || v.h === 0) continue;   // cut away entirely: not on the page now
    if (v.h < o.tall - 0.5 || v.w < o.wide - 0.5) out.push(name(e) + ' ' + Math.round(v.w) + 'x' + Math.round(v.h));
    // covered: what a finger meets at the middle of what is seen is another element, not the target or a part of it
    // (outside the window there is nothing to meet: elementFromPoint gives null there), or an ancestor through its
    // ::before or ::after (a card's overlay over its own button); not one that lies over the page by design (an open
    // dialog, a popup list or menu, a popover, what is fixed or sticky apart from the target), whose cover closes or
    // moves with the scroll; nor one the page names with its reason
    const top = v.now ? document.elementFromPoint(v.x, v.y) : null;
    if (!top || self.contains(top) || top.closest(o.cover)) continue;
    if (top.contains(self)) { const k = pseudoOver(top); if (k) out.push(name(e) + ' covered by the ' + k + ' of ' + name(top)); }
    else if (!top.closest('dialog[open], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"], [popover]') && !apart(top, self)) out.push(name(e) + ' covered by ' + name(top));
  }
  return [...new Set(out)].slice(0, 12);
}

function contrastRule(o, { shown, name, color, words }) {
  // straight-alpha "over": top on under, both maybe translucent
  const over = (t, u) => { const a = t[3] + u[3] * (1 - t[3]); if (a === 0) return [0, 0, 0, 0]; return [0, 1, 2].map((k) => (t[k] * t[3] + u[k] * u[3] * (1 - t[3])) / a).concat(a); };
  const fade = (c, op) => [c[0], c[1], c[2], c[3] * op];
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const base = over(color(getComputedStyle(document.body).backgroundColor), over(color(getComputedStyle(document.documentElement).backgroundColor), [255, 255, 255, 1]));
  /* What reaches the screen at a text, with its ink or without it: each box from the element out, its background under
     what it holds, the whole faded by its opacity, then over the page. An ancestor's opacity fades its background as
     much as the text. inner: layers inside the element ([background, opacity] of a ::before or ::after). */
  const paint = (e, ink, inner) => {
    let g = ink || [0, 0, 0, 0];
    for (const [bg, op] of inner) g = fade(over(g, bg), op);
    for (let n = e; n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); g = fade(over(g, color(s.backgroundColor)), +s.opacity); }
    return over(g, base);
  };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  // a text in a transition or an animation that ends is measured once it has ended: a fade is not a colour; one that
  // never ends never settles, so it is measured as it runs
  const moving = document.getAnimations().filter((a) => a.playState === 'running' && a.effect.getComputedTiming().endTime !== Infinity).map((a) => a.effect.target);
  const settling = (e) => moving.some((t) => t.contains(e));
  const need = (s) => { const px = parseFloat(s.fontSize); return px >= 24 || (px >= 18.66 && +s.fontWeight >= 700) ? o.large : o.min; };
  const ink = (s, svgText) => color(svgText ? s.fill : s.webkitTextFillColor);   // -webkit-text-fill-color paints over color, and is color when not set
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    const svgText = e instanceof SVGTextContentElement;
    if (e.closest('script, style, noscript, option, canvas, .sr, .visually-hidden') || (!svgText && e.closest('svg')) || !shown(e)) continue;
    if (e.closest('button:disabled, input:disabled, select:disabled, textarea:disabled, [aria-disabled="true"]') || settling(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    const s = getComputedStyle(e);
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const q = ratio(paint(e, ink(s, svgText), []), paint(e, null, []));
      if (q < need(s) - 0.005) out.push(name(e) + ' ' + q.toFixed(2) + ':1');
    }
    for (const pseudo of ['::before', '::after']) {
      const p = getComputedStyle(e, pseudo);
      if (!words(p) || p.visibility === 'hidden') continue;   // a pseudo element not displayed has content none, so no words
      const layer = [[color(p.backgroundColor), +p.opacity]];
      const q = ratio(paint(e, ink(p, false), layer), paint(e, null, layer));
      if (q < need(p) - 0.005) out.push(name(e) + ' ' + pseudo + ' "' + words(p).slice(0, 16) + '" ' + q.toFixed(2) + ':1');
    }
  }
  return [...new Set(out)].slice(0, 12);
}

function goldRule(o, { shown, name, color, words }) {
  const root = getComputedStyle(document.documentElement), probe = document.createElement('i');
  document.body.append(probe);
  const tok = ['--accretion', '--accretion-soft', '--accretion-dim'].filter((v) => root.getPropertyValue(v).trim()).map((v) => { probe.style.color = 'var(' + v + ')'; return color(getComputedStyle(probe).color); });
  probe.remove();
  const near = (c, k) => tok.some((g) => Math.abs(c[0] - g[0]) <= k && Math.abs(c[1] - g[1]) <= k && Math.abs(c[2] - g[2]) <= k);
  const isGold = (css) => { const c = color(css); return c[3] >= 40 / 255 && near(c, 22); };
  // the colours inside a value: shadows, and the stops of a gradient
  const colours = (v) => v.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/g) || [];
  const accented = (e) => (e.matches('input[type="checkbox"]:checked, input[type="radio"]:checked, input[type="range"], progress, meter'));
  const uses = (s, text, svg, e) => {
    const u = [];
    if (text) { u.push(s.webkitTextFillColor, ...colours(s.textShadow)); if (s.textDecorationLine !== 'none') u.push(s.textDecorationColor); }   // the fill is the color when not set
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + side + 'Width']) > 0) u.push(s['border' + side + 'Color']);   // a border of style none has a width of 0
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) u.push(s.outlineColor);   // Chrome gives an outline of style none a width (3 px), so its style is read
    u.push(s.backgroundColor, ...colours(s.boxShadow), ...colours(s.backgroundImage));
    if (svg) u.push(...[s.stroke, s.fill].filter((v) => v !== 'none'));
    if (e && accented(e)) u.push(s.accentColor);   // a checked box, a radio, a range or a meter in that colour ('auto' reads as no colour)
    if (e && s.display === 'list-item' && s.listStyleType !== 'none') u.push(getComputedStyle(e, '::marker').color);
    return u;
  };
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest(o.allow) || !shown(e)) continue;
    let hit = uses(getComputedStyle(e), [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()), e instanceof SVGElement, e).some(isGold);
    for (const pseudo of ['::before', '::after']) {
      const p = getComputedStyle(e, pseudo);
      if (p.content !== 'none' && p.display !== 'none' && uses(p, !!words(p), false, null).some(isGold)) hit = true;
    }
    if (hit) out.push(name(e));
  }
  const cv = o.canvases;
  if (cv && cv.scan) {
    const named = Object.keys(cv.named || {}), when = cv.when || {}, oneDot = cv.oneDot || {}, ownColour = cv.ownColour || {};
    const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    for (const c of document.querySelectorAll('canvas')) {
      if (!c.width || !c.height || !shown(c) || named.some((s) => c.matches(s))) continue;
      const cond = Object.keys(when).find((s) => c.matches(s));
      if (cond && (0, eval)(when[cond])) continue;
      // fails closed: a canvas the list does not name and whose pixels cannot be read is a break, not a pass
      const label = (c.id ? '#' + c.id : (c.parentElement && c.parentElement.closest('[id]') ? '#' + c.parentElement.closest('[id]').id + ' ' : '') + 'canvas.' + [...c.classList].join('.'));
      let d;
      try { const x = c.getContext('2d'); if (!x) { out.push(label + ': no 2D context, its pixels cannot be read'); continue; } d = x.getImageData(0, 0, c.width, c.height).data; }
      catch (err) { out.push(label + ': its pixels cannot be read (' + err.name + ')'); continue; }
      const dotSel = Object.keys(oneDot).find((s) => c.matches(s)), dot = !!dotSel && !!(0, eval)(oneDot[dotSel]);
      const ownSel = Object.keys(ownColour).find((s) => c.matches(s)), own = ownSel ? hexRgb((0, eval)(ownColour[ownSel])) : null;
      if (ownSel && !own) { out.push(label + ': the colour it is allowed was not found'); continue; }
      const k = c.width / Math.max(1, c.clientWidth);   // equivalent: a canvas the rule reads is shown, so its CSS width is not 0
      const W = c.width, H = c.height;
      const isOwn = (i) => own && Math.abs(d[i] - own[0]) <= 28 && Math.abs(d[i + 1] - own[1]) <= 28 && Math.abs(d[i + 2] - own[2]) <= 28;
      // the star's glow: within 3 CSS px of a pixel in its own colour, where over another line it can tint toward gold
      const glow = own ? new Uint8Array(W * H) : null;
      if (own) {
        const R = Math.ceil(3 * k);
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 64 || !isOwn(i)) continue;
          const p = i / 4, x = p % W, y = (p - x) / W;
          for (let Y = y - R; Y <= y + R; Y++) for (let X = Math.max(0, x - R); X <= Math.min(W - 1, x + R); X++) glow[Y * W + X] = 1;   // a row off the canvas is an index off the array, which it ignores; a column is not
        }
      }
      let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let i = 0; i < d.length; i += 4) {
        // a halo, not a mark: under a quarter of opacity; on a canvas drawn in a colour of its own, its pixels, and its
        // glow under 160 (TRAPPIST-1 under the Solar System: alpha 44 to 90, 1 px from the star)
        if (d[i + 3] < 64 || isOwn(i)) continue;
        if (glow && d[i + 3] < 160 && glow[i / 4]) continue;
        if (near([d[i], d[i + 1], d[i + 2]], 22)) {
          n++; const p = i / 4, x = p % W, y = Math.floor(p / W);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      if (dot && x1 - x0 < 12 * k && y1 - y0 < 12 * k) continue;   // the one dot it may hold (none at all passes too)
      if (n > 0) out.push(label + ': ' + n + ' gold pixels' + (dot ? ', more than one dot (' + Math.round((x1 - x0) / k) + ' x ' + Math.round((y1 - y0) / k) + ' px)' : ''));
    }
  }
  return [...new Set(out)].slice(0, 12);
}

/* A rule as an expression for the page: the rule, its settings and its helpers. */
const inPage = (rule, o) => `(${rule})(${JSON.stringify(o)}, { shown: ${shownFn}, name: ${nameFn}, color: (${colorFactory})(), words: ${wordsFn}, clippers: ${clippersFn} })`;

export const TARGETS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="slider"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="treeitem"], [role="combobox"], [tabindex]:not([tabindex="-1"])';
export const overflow = () => inPage(overflowRule, {});
/* targets: cover, the elements that may lie over a target, each with its reason: { '<selector>': 'reason' } */
export function targets({ below = 400, tall = 44, wide = 24, cover = {} } = {}) {
  for (const [sel, why] of Object.entries(cover)) if (!(typeof why === 'string' && why.trim().length >= 8)) throw new Error(`targets: the cover ${sel} needs its reason`);
  return inPage(targetsRule, { below, tall, wide, sel: TARGETS, cover: Object.keys(cover).join(', ') || ':not(*)' });
}
export const contrast = ({ min = 4.5, large = 3 } = {}) => inPage(contrastRule, { min, large });
/* gold: allow, the selectors of the elements that may be gold (each with its reason in the caller);
   canvases: { scan: true, named: { '<selector>': 'reason' }, when: { '<selector>': '<expression: gold allowed now>' },
     oneDot: { '<selector>': '<expression: one gold dot allowed now>' }, ownColour: { '<selector>': '<expression: a colour>' } } */
export const gold = ({ allow = [], canvases = null } = {}) => inPage(goldRule, { allow: allow.join(', ') || ':not(*)', canvases });

/* the four rules, as [name, expression] for page.invariant */
export function standard({ gold: g = {}, targets: t = {}, contrast: c = {} } = {}) {
  return [
    ['invariant: the page never scrolls sideways', overflow()],
    ['invariant: every visible target is at least 44 px tall and 24 px wide at 390', targets(t)],
    ['invariant: every visible text is at least 4.5 to 1 against what is behind it', contrast(c)],
    ['invariant: gold only where the page allows it', gold(g)],
  ];
}

/* ---------------- selftest ---------------- */

/* A grey (a touch of blue to tune it) whose contrast against black lies 0.006 to 0.012 on the side asked of `want`.
   Its own luminance formula, so a broken one in the rule shows. */
function greyFor(want, side) {
  const f = (v) => Math.pow((v / 255 + 0.055) / 1.055, 2.4);   // every grey here is above the curve's knee (40 of 255 is 0.157)
  for (let v = 40; v < 230; v++) for (let db = 0; db <= 16; db++) {
    const q = (0.2126 * f(v) + 0.7152 * f(v) + 0.0722 * f(v + db) + 0.05) / 0.05, off = (q - want) * side;
    if (off > 0.006 && off < 0.012) return { css: `rgb(${v}, ${v}, ${v + db})`, q };
  }
  throw new Error(`no grey near ${want}`);
}

const PAGE = (body, css = '', script = '', tokens = true) => (`<!doctype html><html><head><meta charset="utf-8"><style>
  ${tokens ? ':root { --accretion: #D4A24C; --accretion-soft: #F0C674; --accretion-dim: #97681F; }' : ''}
  html, body { margin: 0; background: #000; color: #fff; font: 16px/1.4 monospace; }
  button { box-sizing: border-box; padding: 0; border: 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  ${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`);   /* a page written in place, not loaded: a fixture takes a few ms */

async function selftest() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const { drive, holdChrome, WATCHDOG_EXIT } = await import(pathToFileURL(path.join(here, 'drive.mjs')).href);
  // the machine's lock first, so that the time below is this run's own and not a wait for another drive (tools/drive.mjs)
  const whole = await holdChrome();
  if (!whole) { console.log('FAIL  invariants selftest: Chrome was not free within 20 minutes'); return 1; }
  // a selftest that hangs (a broken copy under tools/mutate.mjs) ends here, its Chrome killed and the lock left to be
  // taken: timed out for tools/mutate.mjs, unless a check had already failed and so caught it
  setTimeout(() => { console.log('FAIL  invariants selftest: not finished in 60 s'); process.exit(failed ? 1 : WATCHDOG_EXIT); }, 60000).unref();
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const has = (list, id) => list.some((x) => new RegExp(`^#${id}(?![\\w-])`).test(String(x)));
  const J = JSON.stringify;

  // the four rules and their settings, without a page
  const four = standard();
  yes('standard gives the four rules in order, each with its name and an expression', four.length === 4 && /scrolls sideways/.test(four[0][0]) && four[0][1].includes('overflowRule') && /44 px/.test(four[1][0]) && four[1][1].includes('targetsRule') && /4\.5 to 1/.test(four[2][0]) && four[2][1].includes('contrastRule') && /gold/.test(four[3][0]) && four[3][1].includes('goldRule'));
  let noReason = '', reason8 = '';
  try { targets({ cover: { '#x': 'seven c' } }); } catch (e) { noReason = e.message; }
  try { targets({ cover: { '#x': 'eight ch' } }); reason8 = 'taken'; } catch (e) { reason8 = e.message; }
  let numReason = '';
  try { targets({ cover: { '#x': 123456789 } }); numReason = 'taken'; } catch (e) { numReason = e.message; }
  yes('an element that may cover targets needs its reason, in words: 7 letters are refused, 8 are taken, a number is refused', /needs its reason/.test(noReason) && reason8 === 'taken' && /needs its reason/.test(numReason), `${noReason} | ${reason8} | ${numReason}`);
  yes('standard passes each rule its own settings, and the defaults are 400, 44, 24, 4.5 and 3', standard({ targets: { below: 777 } })[1][1].includes('"below":777') && standard({ contrast: { min: 7 } })[2][1].includes('"min":7') && standard({ gold: { allow: ['.zz', '.yy'] } })[3][1].includes('".zz, .yy"')
    && four[1][1].includes('{"below":400,"tall":44,"wide":24,') && four[1][1].includes('"cover":":not(*)"') && four[2][1].includes('{"min":4.5,"large":3}') && four[3][1].includes('"allow":":not(*)"'));

  const c449 = greyFor(4.5, -1), c451 = greyFor(4.5, 1), c299 = greyFor(3, -1), c301 = greyFor(3, 1);
  yes('the greys stand 0.006 to 0.012 on each side of 4.5 and of 3', [[c449, 4.5, -1], [c451, 4.5, 1], [c299, 3, -1], [c301, 3, 1]].every(([g, w, side]) => (g.q - w) * side > 0.006 && (g.q - w) * side < 0.012), [c449, c451, c299, c301].map((g) => g.q.toFixed(4)).join(' '));
  const r = await drive(async (p) => {
    const run = async (html, expr) => { await p.ev(`(document.open(), document.write(${J(html)}), document.close(), true)`); await p.ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))'); return p.ev(expr); };

    /* ---- overflow ---- */
    const wide = (k) => PAGE('<div id="w" style="height:10px"><div id="wchild" style="width:100%;height:2px"></div></div><div id="fixedwide" style="position:fixed;top:0;left:0;width:200vw;height:2px"></div>', '', `document.getElementById('w').style.width = (innerWidth + ${k}) + 'px';`);
    const o1 = await run(wide(1), overflow()), o2 = await run(wide(2), overflow());
    const o0 = await run(PAGE('<div id="c" style="height:10px"><div id="cc" style="height:2px"></div></div>', '', "document.getElementById('c').style.width = (innerWidth + 1) + 'px'; document.getElementById('cc').style.width = (innerWidth + 2) + 'px';"), overflow());
    yes('the block named is the one that passes the window by more than 1 px, inside a parent that does not', /: #cc to 392$/.test(o0[0] || ''), J(o0));
    yes('a page 1 px wider than its window passes, and 2 px wider is a break that names the outermost wide block, not a fixed one', J(o1) === '[]' && o2.length === 1 && /^the page is 392 px wide in a 390 px window: #w to 392$/.test(o2[0]), J([o1, o2]));
    const o3 = await run(PAGE(`<div id="left" style="position:relative;left:-20px;width:100px">pushed</div><a class="skip" id="skip" href="#x" style="position:absolute;left:-999px">skip</a>
      <div style="overflow:hidden"><div id="held" style="position:relative;left:-20px;width:100px">held</div></div><div id="edge" style="position:relative;left:-1px;width:100px">edge</div>
      <div id="edge2" style="position:relative;left:-2px;width:100px">2 px</div><div id="ghostleft" style="position:relative;left:-20px;width:100px;visibility:hidden">hidden</div><div id="sliver" style="position:relative;left:-100px;width:101px;height:4px"></div><div id="sliver2" style="position:relative;left:-100px;width:102px;height:4px"></div>`), overflow());
    yes('a block pushed off the left edge is a break (2 px is, 1 px is not); one wholly off the page, one with 1 px on it, and one an ancestor on the page clips are not; 2 px on it is', has(o3, 'left') && has(o3, 'edge2') && has(o3, 'sliver2') && !has(o3, 'skip') && !has(o3, 'ghostleft') && !has(o3, 'held') && !has(o3, 'edge') && !has(o3, 'sliver') && o3.length === 3, J(o3));
    const o4 = await run(PAGE(`<div id="outer" style="position:relative;left:-30px;width:200px"><div id="inner" style="width:150px">x</div></div>
      <div id="offholder" style="position:relative;left:-30px;overflow:hidden;width:200px"><div style="position:relative;left:30px"><div id="deep" style="position:relative;left:-50px;width:100px">deep</div></div></div>`), overflow());
    yes('of blocks pushed off together the outermost is named, and a clipping ancestor that is itself off the page holds nothing', has(o4, 'outer') && !has(o4, 'inner') && has(o4, 'offholder') && has(o4, 'deep'), J(o4));
    const o6 = await run(PAGE('<div id="lost" style="position:relative;left:-20px;width:100px">lost</div>', 'html, body { overflow-x: hidden; }'), overflow());
    yes('a block off the left edge is a break even when the page hides its own overflow', has(o6, 'lost'), J(o6));
    const o7 = await run(PAGE('<div id="underbody" style="width:100px">under the body</div>', 'body { position: relative; left: -20px; }'), overflow());
    yes('a block straight under a body that is itself off the page is named', has(o7, 'underbody'), J(o7));
    const o8 = await run(PAGE('<div id="bodywide" style="width:800px;height:20px">wide</div>', 'html { overflow: hidden; height: 100%; } body { height: 100%; overflow-x: auto; }'), overflow());
    yes('a body that scrolls sideways on its own is a page that scrolls sideways', o8.length === 1 && /^the page is 800 px wide in a 390 px window/.test(o8[0]), J(o8));
    const o9 = await run(PAGE(`<div style="overflow:hidden"><div id="absleft" style="position:absolute;left:-20px;top:100px;width:100px">pushed</div></div>
      <div style="position:relative;overflow:hidden;width:200px;height:40px"><div id="absheld" style="position:absolute;left:-20px;top:0;width:100px">held</div></div>
      <div id="clipm1" style="position:relative;left:-1px;overflow:hidden;width:200px"><div style="position:relative;left:1px"><div id="kidm1" style="position:relative;left:-30px;width:100px">x</div></div></div>
      <div id="clipm2" style="position:relative;left:-2px;overflow:hidden;width:200px"><div style="position:relative;left:2px"><div id="kidm2" style="position:relative;left:-30px;width:100px">x</div></div></div>
      <div id="parm1" style="position:relative;left:-1px;width:200px"><div id="kidp1" style="position:relative;left:-30px;width:100px">x</div></div>
      <div id="parm2" style="position:relative;left:-2px;width:200px"><div id="kidp2" style="position:relative;left:-30px;width:100px">x</div></div>`), overflow());
    yes('an absolute block is held by its positioned ancestor that cuts it, not by a static one between', has(o9, 'absleft') && !has(o9, 'absheld'), J(o9));
    yes('a box that cuts a block holds it 1 px off the page, not 2 px off', !has(o9, 'kidm1') && !has(o9, 'clipm1') && has(o9, 'kidm2') && has(o9, 'clipm2'), J(o9));
    yes('a block is named when its parent is 1 px off the page, and left to its parent at 2 px', has(o9, 'kidp1') && !has(o9, 'parm1') && !has(o9, 'kidp2') && has(o9, 'parm2'), J(o9));
    const o5 = await run(PAGE(Array.from({ length: 7 }, (_, i) => `<div id="many${i}" style="position:relative;left:-20px;width:100px">${i}</div>`).join('')), overflow());
    yes('the rule lists six breaks at most', o5.length === 6 && has(o5, 'many5') && !has(o5, 'many6'), String(o5.length));

    /* ---- targets ---- */
    const TA = PAGE(`      <button id="h434" style="height:43.4px;width:60px">a</button><button id="h436" style="height:43.6px;width:60px">b</button>
      <button id="w234" style="height:50px;width:23.4px">c</button><button id="w236" style="height:50px;width:23.6px">d</button>
      <p>words before <a id="inl" href="#x">an inline link</a> and after</p><p>words before <span><a id="inl2" href="#x">a link in a span</a></span> and after</p><p><a id="inl3" href="#x">a link</a>.</p><p><a id="inl4" href="#x">a link</a> ok</p><p>words before <span id="spanlink" role="link" tabindex="0">a span link</span> and after</p>
      <div><a id="alone" href="#x" style="display:inline-block;height:20px">alone</a></div><div><a id="alone2" href="#x">alone too</a></div>
      <button id="dis" disabled style="height:20px">e</button><div aria-disabled="true"><button id="adis" style="height:20px">f</button></div><div inert><button id="inrt" style="height:20px">g</button></div>
      <button id="en" style="height:20px">h</button>
      <label style="display:block;height:50px"><input id="inlab" type="checkbox"> in a label</label><input id="nolab" type="checkbox">
      <label style="display:block;height:50px"><input id="radlab" type="radio"> a radio in a label</label><input id="radnolab" type="radio">`);
    const TB = PAGE(`      <div id="rlink" role="link" style="height:20px">role link</div><div id="rcheck" role="checkbox" style="height:20px">role checkbox</div>
      <div id="rmenu" role="menuitem" style="height:20px">m</div><div id="rtree" role="treeitem" style="height:20px">t</div><div id="rcombo" role="combobox" style="height:20px">c</div>
      <div id="rbtn" role="button" style="height:20px">b</div><div id="rsw" role="switch" style="height:20px">s</div><div id="rrad" role="radio" style="height:20px">r</div><div id="rtab" role="tab" style="height:20px">t</div><div id="rsl" role="slider" style="height:20px">s</div><div id="ropt" role="option" style="height:20px">o</div>`);
    const TC = PAGE(`      <button id="none" style="display:none">n</button><button id="vis" style="visibility:hidden;height:20px">v</button><button id="op" style="opacity:0;height:20px">o</button>
      <div id="tab0" tabindex="0" style="height:20px">tab</div><div id="tabm" tabindex="-1" style="height:20px">no tab</div>
      <summary id="sum" style="display:block;height:20px">s</summary><select id="sel" style="height:20px"><option>x</option></select><input id="fld" style="height:20px"><textarea id="ta" style="height:20px"></textarea>`);
    const TD = PAGE(`      <div style="height:18px;overflow:hidden"><button id="clip" style="height:44px;width:60px">clipped</button></div>
      <div style="height:60px;width:20px;overflow:hidden"><button id="xclip" style="height:44px;width:60px">x</button></div>
      <div style="height:60px;width:100px;overflow:hidden;padding-left:0"><button id="lclip" style="height:44px;width:60px;margin-left:-50px">l</button></div>
      <div style="height:60px;overflow:hidden"><button id="tclip" style="height:44px;width:60px;position:relative;top:-30px">t</button></div>
      <div style="height:60px;overflow:clip"><button id="cclip" style="height:44px;width:60px;position:relative;top:-30px">c</button></div>
      <div style="height:18px;overflow:auto"><button id="sclip" style="height:44px;width:60px">s</button></div>
      <div style="position:relative;height:60px;width:100px;overflow:auto"><div style="height:100px"></div><button id="sgone" style="height:44px;width:60px">g</button></div><div style="position:relative;top:-60px;height:60px;width:100px;background:#000"></div>
      <div style="position:relative;height:30px;width:100px;overflow:auto"><div style="height:20px"></div><button id="shalf" style="height:44px;width:60px">h</button></div><div id="shalflid" style="position:relative;height:10px;width:100px;background:#000;margin-top:-10px"></div>
      <div style="position:relative;height:50px;width:100px"><div style="width:30px;height:50px;overflow-x:auto;overflow-y:hidden;white-space:nowrap"><button id="shalfx" style="margin-left:20px;width:60px;height:44px">x</button></div><div id="shalfxlid" style="position:absolute;left:20px;top:0;width:10px;height:50px;background:#000"></div></div>
      <div style="position:relative;height:50px;width:100px"><div style="width:30px;height:50px;overflow-x:auto;overflow-y:hidden;white-space:nowrap"><button id="sgonex" style="margin-left:100px;width:60px;height:44px">g</button></div><div style="position:absolute;left:30px;top:0;width:70px;height:50px;background:#000"></div></div>
      <div style="height:0;overflow:hidden"><button id="gone" style="height:44px">cut away</button></div>
      <div style="height:60px;width:100px;overflow:hidden;position:relative"><button id="outside" style="position:absolute;left:200px;height:44px;width:60px">o</button></div>
      <div style="height:60px;width:100px;overflow:hidden;position:relative"><button id="below" style="position:absolute;top:200px;height:44px;width:60px">b</button></div>`);
    const TE = PAGE(`      <div style="display:flex"><button id="withspan" style="height:50px;width:60px"><span style="display:block;height:50px">s</span></button><a id="withspanlink" href="#x" style="display:block;height:50px;width:60px"><span style="display:block;height:50px">s</span></a></div>
      <div style="position:relative;height:60px"><div style="overflow:hidden;height:0"><button id="absclip" style="position:absolute;top:0;left:0;height:20px;width:60px">abs</button></div></div>
      <div style="overflow:hidden;width:10px;height:10px"><button id="fixclip" style="position:fixed;top:600px;left:100px;height:20px;width:60px">fixed</button></div>
      <div style="transform:translateZ(0);overflow:hidden;width:10px;height:10px"><button id="fixheld" style="position:fixed;top:0;left:0;height:44px;width:60px">held</button></div>
      <div style="position:relative;overflow:hidden;width:10px;height:10px"><button id="fixrel" style="position:fixed;top:700px;left:200px;height:20px;width:60px">rel</button></div>
      <div style="filter:brightness(1);overflow:hidden;width:10px;height:10px"><button id="fixfilt" style="position:fixed;top:0;left:0;height:44px;width:60px">f</button></div>
      <div style="perspective:100px;overflow:hidden;width:10px;height:10px"><button id="fixpersp" style="position:fixed;top:0;left:0;height:44px;width:60px">p</button></div>
      <div style="contain:layout;overflow:hidden;width:10px;height:10px"><button id="fixlay" style="position:fixed;top:0;left:0;height:44px;width:60px">l</button></div>
      <div style="height:18px;overflow:hidden"><div><button id="gclip" style="height:44px;width:60px">g</button></div></div>
      <div role="button" style="height:50px"><p>words before <a id="inrole" href="#x">a link</a> and after</p></div>
      <div><button id="penone" style="pointer-events:none;height:50px;width:60px">p</button></div>
      <div style="height:50px;width:100px"><button id="underfixed" style="height:50px;width:60px">f</button></div>
      <div style="height:50px;width:100px"><button id="understicky" style="height:50px;width:60px">s</button></div>
      <div style="position:relative;height:50px;width:100px"><button id="underlist" style="height:50px;width:60px">l</button><ul role="listbox" style="position:absolute;inset:0;margin:0;background:#000"><li>x</li></ul></div>
      <div style="position:relative;height:50px;width:100px"><button id="underdialog" style="height:50px;width:60px">d</button><div role="dialog" style="position:absolute;inset:0;background:#000"><span>x</span></div></div>
      <div style="position:relative;height:50px;width:100px"><button id="undermenu" style="height:50px;width:60px">m</button><div role="menu" style="position:absolute;inset:0;background:#000"></div></div>
      <div style="position:relative;height:50px;width:100px"><button id="underpop" style="height:50px;width:60px">p</button><div popover style="display:block;position:absolute;inset:0;width:100px;height:50px;margin:0;border:0;padding:0;background:#000"></div></div>
      <nav><p><a id="n1" href="#a">Home</a> <a id="n2" href="#b">Labs</a> <a id="n3" href="#c">About</a></p></nav>
      <div style="position:relative;height:50px;width:100px"><button id="under" style="height:50px;width:60px">u</button><div id="lid" style="position:absolute;inset:0;background:#000"></div></div>
      <div style="position:relative;height:50px;width:100px"><button id="glass" style="height:50px;width:60px">g</button><div style="position:absolute;inset:0;pointer-events:none"></div></div>

      <div style="height:2000px"></div><button id="faraway" style="height:50px;width:60px">f</button><div style="position:relative;top:-50px;height:50px;width:60px;background:#000"></div>`);
    // a fixed lid and a sticky one laid over two buttons once the page is drawn (their places known then)
    const lids = `for (const [id, pos] of [['underfixed', 'fixed'], ['understicky', 'sticky']]) { const b = document.getElementById(id), r = b.getBoundingClientRect(), d = document.createElement('div');
      d.id = id + '-lid'; d.style.cssText = 'position:' + pos + ';left:' + r.left + 'px;top:' + r.top + 'px;width:60px;height:50px;background:#000;z-index:5;' + (pos === 'sticky' ? 'margin-top:-50px;' : ''); d.innerHTML = '<span style="display:block;height:50px"></span>'; (pos === 'sticky' ? b.parentElement : document.body).append(d); }`;
    const t1 = [...await run(TA, targets()), ...await run(TB, targets()), ...await run(TC, targets()), ...await run(TD, targets()), ...await run(TE.replace('</body>', `<script>${lids}</script></body>`), targets())];
    const at1 = (id) => t1.find((x) => new RegExp(`^#${id}(?![\\w-])`).test(x)) || '';
    yes('43.4 px tall is a break and 43.6 is not', has(t1, 'h434') && !has(t1, 'h436'), J([at1('h434')]));
    yes('23.4 px wide is a break and 23.6 is not', has(t1, 'w234') && !has(t1, 'w236'), J([at1('w234')]));
    yes('a link in a line of text is not measured (in a span too, and beside two letters); a link alone in its block, or beside one letter, is, and so is an inline role link that is not a link element', !has(t1, 'inl') && !has(t1, 'inl2') && !has(t1, 'inl4') && has(t1, 'inl3') && has(t1, 'alone') && has(t1, 'alone2') && has(t1, 'spanlink'), J([at1('inl3'), at1('alone2'), at1('spanlink')]));
    yes('a disabled control, one under aria-disabled and one under inert are not measured; the same control enabled is', !has(t1, 'dis') && !has(t1, 'adis') && !has(t1, 'inrt') && has(t1, 'en'));
    yes('a checkbox or a radio is measured by its label when it has one', !has(t1, 'inlab') && has(t1, 'nolab') && !has(t1, 'radlab') && has(t1, 'radnolab'));
    yes('roles a finger presses are targets with or without a tab stop: link, checkbox, menu item, tree item, combo box, button, switch, radio, tab, slider, option', ['rlink', 'rcheck', 'rmenu', 'rtree', 'rcombo', 'rbtn', 'rsw', 'rrad', 'rtab', 'rsl', 'ropt'].every((id) => has(t1, id)), J(t1));
    yes('fields, a select, a text area, a summary and a tab stop are targets; a tabindex of -1 is not', ['fld', 'sel', 'ta', 'sum', 'tab0'].every((id) => has(t1, id)) && !has(t1, 'tabm'));
    yes('a button its parent cuts is measured on what is seen: below, on the right, on the left, above, by clip', /x18$/.test(at1('clip')) && /^#xclip "x" 20x44$/.test(at1('xclip')) && /^#lclip "l" 10x44$/.test(at1('lclip')) && /^#tclip "t" 60x14$/.test(at1('tclip')) && /^#cclip "c" 60x14$/.test(at1('cclip')), J([at1('clip'), at1('xclip'), at1('lclip'), at1('tclip'), at1('cclip')]));
    yes('a button cut away entirely, by a box of no height or by lying past its box, is not measured', !has(t1, 'gone') && !has(t1, 'outside') && !has(t1, 'below'));
    yes('a target not shown (display none, visibility hidden, opacity 0) is not measured', !has(t1, 'none') && !has(t1, 'vis') && !has(t1, 'op'));
    yes('an absolute target is cut by its positioned ancestor, not a static one between; a fixed one by none, not even a positioned one, unless a transform, a filter, a perspective or layout containment makes a box its own', /^#absclip "abs" 60x20$/.test(at1('absclip')) && /^#fixclip "fixed" 60x20$/.test(at1('fixclip')) && /^#fixrel "rel" 60x20$/.test(at1('fixrel')) && ['fixheld', 'fixfilt', 'fixpersp', 'fixlay'].every((id) => / 10x10$/.test(at1(id))), J(['absclip', 'fixclip', 'fixrel', 'fixheld', 'fixfilt', 'fixpersp', 'fixlay'].map(at1)));
    yes('a box that cuts a target from further up cuts it too', / 60x18$/.test(at1('gclip')), at1('gclip'));
    yes('a box that scrolls does not make a target small: it is measured whole; one it hides now is not looked at for a cover, and one it shows in part is looked at where it shows', !has(t1, 'sclip') && !t1.some((x) => /^#sgone/.test(x)) && !t1.some((x) => /^#sgonex/.test(x)) && t1.includes('#shalf "h" covered by #shalflid') && t1.includes('#shalfx "x" covered by #shalfxlid'), J(t1.filter((x) => /^#s(clip|gone|half)/.test(x))));
    yes('words in a line count though a target holds the line: a link there is inline', !has(t1, 'inrole'), at1('inrole'));
    yes('a row of bare links is not a line of text: each is measured', has(t1, 'n1') && has(t1, 'n2') && has(t1, 'n3'), J([at1('n1'), at1('n3')]));
    yes('a target under another element at its middle is covered; under one that lets the finger through, under its own part, or letting the finger through itself, it is not; one off the window is not looked at', t1.includes('#under "u" covered by #lid') && !t1.some((x) => /^#(glass|withspan|withspanlink|penone|faraway) .*covered/.test(x)), J(t1.filter((x) => /covered/.test(x))));
    yes('what lies over the page by design covers no target: something fixed or sticky, a part of it, a popup list, a dialog, a menu, a popover', !t1.some((x) => /^#under(fixed|sticky|list|dialog|menu|pop) .*covered/.test(x)), J(t1.filter((x) => /covered/.test(x))));
    const t6 = await run(TE, targets({ cover: { '#lid': 'a test of the allowance, a lid on purpose' } }));
    yes('an element the page names, with its reason, may lie over a target', !t6.some((x) => /covered by #lid/.test(x)) && has(t6, 'n1'), J(t6.filter((x) => /covered/.test(x))));
    /* covers that never scroll away (a review of 2026-11-17: F1 to F5 passed when each is a break, F4 a declared limit) */
    const TF = PAGE(`      <header id="hdr4" style="position:sticky;top:0;height:60px;background:#111;z-index:2">bar</header><button id="f4btn" style="position:absolute;top:0;left:200px;width:60px;height:50px">4</button>
      <div id="card5"><button id="f5btn" style="width:60px;height:50px">a</button></div><div id="cardbefore"><button id="beforebtn" style="width:60px;height:50px">b</button></div><div id="cardfix"><button id="fixbtn" style="width:60px;height:50px">c</button></div>
      <div id="cardglass"><button id="glassbtn" style="width:60px;height:50px">d</button></div><div id="cardflow"><button id="flowbtn" style="pointer-events:none;width:60px;height:50px">e</button></div><div id="cardnone"><button id="nonebtn" style="pointer-events:none;width:60px;height:50px">f</button></div><div id="cardpass"><button id="passbtn" style="pointer-events:none;width:60px;height:50px">k</button></div>
      <div style="transform:translateZ(0);position:relative;height:60px;width:100px"><button id="tfbtn" style="width:60px;height:50px">g</button><div id="tflid" style="position:fixed;left:0;top:0;width:100px;height:60px;background:#222"></div></div>
      <div style="position:relative"><div style="position:sticky;top:0;height:50px;width:100px;z-index:1"><button id="stkbtn" style="width:60px;height:50px">h</button></div><div id="stklid" style="position:sticky;top:0;height:50px;width:100px;margin-top:-50px;z-index:2;background:#222"></div></div>
      <div style="position:sticky;top:0;height:50px;width:100px;z-index:1"><button id="insticky" style="width:60px;height:50px">i</button><div id="instickylid" style="position:absolute;left:0;top:0;width:100px;height:50px;background:#222"></div></div>
      <nav style="position:fixed;left:0;right:0;bottom:0;height:60px;background:#111"><button id="barbtn" style="width:60px;height:50px">j</button></nav><div id="toast" style="position:fixed;left:0;bottom:0;width:100px;height:56px;background:#333;z-index:2">toast</div>`,
      `#card5, #cardbefore, #cardglass, #cardfix, #cardpass { position: relative; height: 60px; width: 100px; } #cardfix { transform: translateZ(0); }
      #card5::after, #cardglass::after, #cardpass::after { content: ""; position: absolute; inset: 0; } #cardglass::after, #cardpass::after { pointer-events: none; } #cardbefore::before { content: ""; position: absolute; inset: 0; z-index: 1; }
      #cardfix::after { content: ""; position: fixed; inset: 0; } #cardflow::before { content: "x"; } #cardnone { position: relative; } #cardnone::after { content: none; position: absolute; inset: 0; }`);
    const TG = PAGE(`      <div id="app" style="position:fixed;inset:0;overflow:auto"><header id="apphdr" style="position:sticky;top:0;height:60px;background:#111;z-index:2">bar</header>
      <div style="position:relative;height:2000px"><button id="hdrbtn" style="position:absolute;top:-60px;left:150px;width:60px;height:50px">h</button><button id="f3btn" style="position:absolute;top:100px;left:0;width:60px;height:50px">b</button><div id="plate3" style="position:absolute;left:0;top:100px;width:100px;height:60px;background:#222"></div></div></div>`);
    const VEIL = (l, t, r, b) => PAGE(`<button id="vbtn" style="position:absolute;left:150px;top:300px;width:60px;height:50px">v</button><div id="veil" style="position:fixed;left:${l}px;top:${t}px;right:${r}px;bottom:${b}px"></div>`);
    const t7 = await run(TF, targets()), t8 = await run(TG, targets()), veils = [];
    for (const at of [[0, 0, 0, 0], [1, 1, 1, 1], [2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0], [0, 0, 0, 2]]) veils.push((await run(VEIL(...at), targets())).some((x) => x === '#vbtn "v" covered by #veil'));
    const hud = await run(PAGE(`<button id="hudbtn" style="position:absolute;left:150px;top:300px;width:60px;height:50px">u</button><div style="position:fixed;inset:0;pointer-events:none"><div id="hudpanel" style="position:absolute;left:100px;top:280px;width:200px;height:100px;pointer-events:auto;background:#222"></div></div>`), targets());
    yes('a fixed cover that spans the window is a break, an invisible one too, within 1 px of each edge; 2 px short of any edge, it is fixed apart from the target', J(veils) === '[true,true,false,false,false,false]', J(veils));
    yes('a panel of a layer over the whole window that lets the finger through is fixed apart from the target, not a veil', !hud.some((x) => /^#hudbtn .*covered/.test(x)), J(hud));
    yes('a toast fixed over a button of a fixed bar is a break: both are fixed to the window', t7.includes('#barbtn "j" covered by #toast "toast"'), J(t7.filter((x) => /covered/.test(x))));
    yes('in an app inside a fixed scroller, a plate over a button is a break; the app\'s sticky header over one of its buttons is not', t8.includes('#f3btn "b" covered by #plate3') && !t8.some((x) => /^#hdrbtn .*covered/.test(x)), J(t8.filter((x) => /covered/.test(x))));
    yes('a sticky header over a button where the page cannot scroll is taken for one that moves with the scroll (a declared limit)', !t7.some((x) => /^#f4btn .*covered/.test(x)), J(t7.filter((x) => /covered/.test(x))));
    yes('an ancestor\'s ::after or ::before over its own target is a break, placed absolute or fixed; one that lets the finger through (over the target, or over a target that lets it through too), one in the flow and one with no content are not',
      t7.includes('#f5btn "a" covered by the ::after of #card5 "a"') && t7.includes('#beforebtn "b" covered by the ::before of #cardbefore "b"') && t7.includes('#fixbtn "c" covered by the ::after of #cardfix "c"') && !t7.some((x) => /^#(glassbtn|passbtn|flowbtn|nonebtn) .*covered/.test(x)), J(t7.filter((x) => /covered/.test(x))));
    yes('what a transform holds is not fixed to the window; two sticky boxes move apart, and one sticky box holding the target and its cover does not', t7.includes('#tfbtn "g" covered by #tflid') && !t7.some((x) => /^#stkbtn .*covered/.test(x)) && t7.includes('#insticky "i" covered by #instickylid'), J(t7.filter((x) => /covered/.test(x))));
    const t2 = await run(TA, targets({ below: 389 })), t3 = await run(TA, targets({ below: 390 })), t4 = [...await run(TA, targets({ tall: 20, wide: 0 })), ...await run(TD, targets({ tall: 20, wide: 0 }))];
    yes('the rule applies up to its width and not 1 px past it (a 390 px window: below 390 applies, below 389 does not)', J(t2) === '[]' && has(t3, 'h434'), `${t2.length} | ${t3.length}`);
    yes('its sizes are its settings: at 20 by 0, 20 px tall passes and so does 43.4', !has(t4, 'en') && !has(t4, 'h434') && !has(t4, 'w234') && has(t4, 'clip'), J(t4));
    const t5 = await run(PAGE(Array.from({ length: 13 }, (_, i) => `<button id="tiny${i}" style="height:10px;width:30px">${i}</button>`).join('')), targets());
    yes('the rule lists twelve breaks at most', t5.length === 12 && has(t5, 'tiny11') && !has(t5, 'tiny12'), String(t5.length));

    /* ---- contrast ---- */
    const C = PAGE(`
      <p id="c449" style="color:${c449.css}">just under 4.5</p><p id="c451" style="color:${c451.css}">just over 4.5</p>
      <p id="l299" style="font-size:24px;color:${c299.css}">large, under 3</p><p id="l301" style="font-size:24px;color:${c301.css}">large, over 3</p>
      <p id="m235" style="font-size:23.5px;color:${c301.css}">not quite large</p>
      <p id="b1866" style="font-size:18.66px;font-weight:700;color:${c301.css}">bold, large</p><p id="n1866" style="font-size:18.66px;font-weight:600;color:${c301.css}">not bold</p><p id="b1865" style="font-size:18.65px;font-weight:700;color:${c301.css}">bold, not large</p>
      <p class="sr" id="srp" style="color:#222">screen reader only</p><p class="sr" id="srbig" style="color:#222;width:200px;height:20px">sr at full size</p><p class="visually-hidden" id="vhbig" style="color:#222;clip-path:inset(50%)">hidden at full size</p><p id="vhid" style="color:#222;visibility:hidden">hidden</p><p id="nosr" style="color:#222">the same, shown</p><p class="visually-hidden" id="vhp" style="color:#222;width:1px;height:1px;overflow:hidden">hidden</p>
      <button id="dbtn" disabled style="color:#222">disabled</button><div aria-disabled="true"><p id="adp" style="color:#222">under aria-disabled</p></div>
      <p id="tiny" style="color:#222;width:1px;height:20px;overflow:hidden">1 px wide</p><p id="flat" style="color:#222;height:1px;overflow:hidden;margin:0">1 px tall</p>
      <dialog><p id="indlg" style="color:#222">in a closed dialog</p></dialog>`);
    const k1 = await run(C, contrast());
    yes('4.49 to 1 at 16 px is a break, 4.51 is not', has(k1, 'c449') && !has(k1, 'c451'), `${c449.q.toFixed(3)} ${c451.q.toFixed(3)} | ${J(k1.filter((x) => /c45|c44/.test(x)))}`);
    yes('at 24 px 2.99 is a break, 3.01 is not; at 23.5 px 3.01 is one', has(k1, 'l299') && !has(k1, 'l301') && has(k1, 'm235'), `${c299.q.toFixed(3)} ${c301.q.toFixed(3)}`);
    yes('18.66 px at 700 is large; at 600, or at 18.65 px, it is not', !has(k1, 'b1866') && has(k1, 'n1866') && has(k1, 'b1865'));
    yes('.sr and .visually-hidden text, a disabled control and text under aria-disabled are not measured; the same text shown is', !has(k1, 'srp') && !has(k1, 'srbig') && !has(k1, 'vhp') && !has(k1, 'vhbig') && !has(k1, 'vhid') && !has(k1, 'dbtn') && !has(k1, 'adp') && has(k1, 'nosr'), J(k1));
    yes('a box 1 px wide or 1 px tall is not measured, and a closed dialog is not seen', !has(k1, 'tiny') && !has(k1, 'flat') && !has(k1, 'indlg'));
    const k2 = await run(C, contrast({ min: 2, large: 2 }));
    yes('its ratios are its settings: at 2 to 1 the greys near 4.5 and 3 pass', !has(k2, 'c449') && !has(k2, 'l299') && !has(k2, 'm235') && has(k2, 'nosr'));
    const C2 = PAGE(`
      <p id="okl" style="color:oklab(0.3 0 0)">oklab grey</p><p id="oklhi" style="color:oklab(0.97 0 0)">oklab near white</p><p id="oklghost" style="color:oklab(0.97 0 0 / 0.2)">oklab near white, faint</p><p id="mix" style="color:color-mix(in oklab, #000 80%, #fff)">mixed grey</p>
      <p id="ghost" style="color:rgba(255,255,255,0.2)">faint white</p><p id="ghost2" style="color:color-mix(in srgb, #fff 20%, transparent)">faint white, mixed</p><p id="solid" style="color:color-mix(in srgb, #fff 90%, #000)">white, mixed</p>
      <p id="pse"></p><p id="psa"></p><p id="psnone"></p><p id="pshid"></p><p id="psbg"></p><p id="psop"></p><p id="psblank"></p>
      <svg width="200" height="40"><text id="svt" x="0" y="20" fill="#222">svg words</text><text id="svtok" x="100" y="20" fill="#fff" style="color:#222">svg white</text></svg>`,
      `#pse::before { content: "before words"; color: #222; } #psa::after { content: "after words"; color: #222; }
       #psnone::before { content: "none"; color: #222; display: none; } #pshid::before { content: "hidden"; color: #222; visibility: hidden; }
       #psbg::before { content: "dark on white"; color: #222; background: #fff; } #psop::before { content: "faded white"; color: #fff; opacity: 0.2; }
       #psblank::before { content: ""; color: #222; display: block; height: 4px; }`);
    const k5 = await run(C2, contrast());
    yes('a colour written in oklab or mixed in oklab is read, with its alpha: dark is a break, near white passes, near white at 20% is a break', has(k5, 'okl') && has(k5, 'mix') && !has(k5, 'oklhi') && has(k5, 'oklghost'), J(k5.filter((x) => /okl|mix/.test(x))));
    yes('the alpha of a colour counts, written in rgba() or mixed in srgb', has(k5, 'ghost') && has(k5, 'ghost2') && !has(k5, 'solid'), J(k5.filter((x) => /ghost|solid/.test(x))));
    yes('the words of a ::before and an ::after are measured, with the pseudo\'s background and opacity; one not displayed, hidden, or with no words is not', k5.some((x) => /^#pse ::before "before words"/.test(x)) && k5.some((x) => /^#psa ::after "after words"/.test(x)) && !has(k5, 'psnone') && !has(k5, 'pshid') && !has(k5, 'psbg') && has(k5, 'psop') && !has(k5, 'psblank') && k5.filter((x) => /::/.test(x)).length === 3, J(k5.filter((x) => /::|ps/.test(x))));
    yes('SVG text is measured by its fill, not its colour', has(k5, 'svt') && !has(k5, 'svtok'));
    const k3 = await run(PAGE(`<div style="opacity:0.3"><p id="dim" style="color:#fff">under an opacity</p></div>
      <div style="background:#fff"><p id="onwhite" style="color:#fff">white on white</p></div>
      <div style="background:rgba(255,255,255,0.5)"><p id="half" style="color:#777">grey on half white</p></div>
      <div style="background:#fff"><div style="background:rgba(0,0,0,0.5)"><p id="halfblack" style="color:#fff">white on half black over white</p></div></div><div style="background:#fff"><div style="background:rgba(0,0,0,0.5)"><p id="darkhalf" style="color:#000">black on half black over white</p></div></div>
      <div style="background:#fff"><p id="dark" style="color:#000">black on white</p></div>
      <p id="spin" class="spin" style="color:#222">endless</p><p id="fade" class="fade" style="color:#222">fading</p>`,
      `@keyframes spin { from { opacity: 1 } to { opacity: 0.99 } } .spin { animation: spin 1s linear infinite; } .fade { transition: color 60s; }`,
      `requestAnimationFrame(() => { document.getElementById('fade').style.color = '#fff'; });`), contrast());
    yes('an ancestor\'s opacity, an opaque background and translucent ones over it are counted; black on white passes', has(k3, 'dim') && has(k3, 'onwhite') && has(k3, 'half') && has(k3, 'halfblack') && !has(k3, 'darkhalf') && !has(k3, 'dark'), J(k3));
    yes('a text in an animation that never ends is measured; one in a transition still running is not, yet', has(k3, 'spin') && !has(k3, 'fade'));
    const k8 = await run(PAGE(`<div style="opacity:0.5;background:#000"><p id="og" style="color:#fff;margin:0">white on faded black</p></div><p id="bk" style="color:#000">black on white</p>`, 'html, body { background: #fff; color: #000; }'), contrast());
    yes('an ancestor\'s opacity fades its background as much as the text: white on black at half opacity over white is a break', has(k8, 'og') && !has(k8, 'bk'), J(k8));
    // white text whose own opacity puts it 0.0005 inside and 0.0005 outside the 0.005 of rounding under 4.5 to 1
    const opFor = (q) => 1.055 * Math.pow(0.05 * q - 0.05, 1 / 2.4) - 0.055;
    const back = (a) => 20 * Math.pow((a + 0.055) / 1.055, 2.4) + 1;
    const tin = opFor(4.4955), tout = opFor(4.4945);
    const k9 = await run(PAGE(`<p id="tolin" style="color:#fff;opacity:${tin}">inside the rounding</p><p id="tolout" style="color:#fff;opacity:${tout}">outside it</p>
      <p id="tfc" style="color:#fff;-webkit-text-fill-color:#111">painted near black</p><p id="tfcok" style="color:#111;-webkit-text-fill-color:#fff">painted white</p>
      <ol><li id="cnt" class="c">item</li></ol><p id="w15" style="color:#222;width:1.5px;height:20px;overflow:hidden">1.5 px wide</p><p id="h15" style="color:#222;height:1.5px;overflow:hidden;margin:0">1.5 px tall</p>`,
      '.c::before { content: counter(list-item) ". "; color: #222; } .c { color: #fff; }'), contrast());
    yes('4.4955 to 1 is inside the 0.005 of rounding and passes; 4.4945 is outside it and is a break', Math.abs(back(tin) - 4.4955) < 1e-9 && Math.abs(back(tout) - 4.4945) < 1e-9 && !has(k9, 'tolin') && has(k9, 'tolout'), J(k9.filter((x) => /tol/.test(x))));
    yes('-webkit-text-fill-color is the ink, over color', has(k9, 'tfc') && !has(k9, 'tfcok'), J(k9.filter((x) => /tfc/.test(x))));
    yes('a counter shown by a ::before is measured', k9.some((x) => /^#cnt "item" ::before "#\." /.test(x)), J(k9.filter((x) => /cnt/.test(x))));
    yes('a box 1.5 px wide or 1.5 px tall is measured', has(k9, 'w15') && has(k9, 'h15'), J(k9.filter((x) => /15/.test(x))));
    const k6 = await run(PAGE('<p id="onpage" style="color:#000">black</p>', 'html { background: #fff; } body { background: transparent; }'), contrast());
    yes('with no background of its own the page shows the root\'s: black on a white root passes', J(k6) === '[]', J(k6));
    const k7 = await run(PAGE('<p id="onhalf" style="color:#000">black</p>', 'html { background: #fff; } body { background: rgba(0, 0, 0, 0.5); }'), contrast());
    yes('a translucent page over a white root is counted once: black on that grey passes', J(k7) === '[]', J(k7));
    const k4 = await run(PAGE(Array.from({ length: 13 }, (_, i) => `<p id="many${i}" style="color:#222">${i}</p>`).join('')), contrast());
    yes('the rule lists twelve breaks at most', k4.length === 12 && has(k4, 'many11') && !has(k4, 'many12'), String(k4.length));

    /* ---- gold, on the page ---- */
    const G = PAGE(`
      <p id="gtext" style="color:var(--accretion)">gold words</p><p id="gok" class="ok" style="color:var(--accretion)">allowed gold</p><p class="ok2"><span id="gok2" style="color:var(--accretion)">allowed by its parent</span></p>
      <p id="gsoft" style="color:var(--accretion-soft)">soft</p><p id="gdim" style="color:var(--accretion-dim)">dim</p>
      <p id="nearR" style="color:rgb(234,162,76)">R 22 off</p><p id="farR" style="color:rgb(235,162,76)">R 23 off</p>
      <p id="nearG" style="color:rgb(212,184,76)">G 22 off</p><p id="farG" style="color:rgb(212,185,76)">G 23 off</p>
      <p id="nearB" style="color:rgb(212,162,98)">B 22 off</p><p id="farB" style="color:rgb(212,162,99)">B 23 off</p>
      <p id="a16" style="color:rgba(212,162,76,0.16)">gold at 16%</p><p id="a15" style="color:rgba(212,162,76,0.15)">gold at 15%</p>`);
    const g1 = await run(G, gold({ allow: ['.ok', '.ok2'] }));
    yes('gold text in each of the three tokens is a break; text the page allows, or under what it allows, is not', has(g1, 'gtext') && has(g1, 'gsoft') && has(g1, 'gdim') && !has(g1, 'gok') && !has(g1, 'gok2'), J(g1));
    yes('a colour 22 off gold in any one channel is gold, 23 off is not', has(g1, 'nearR') && !has(g1, 'farR') && has(g1, 'nearG') && !has(g1, 'farG') && has(g1, 'nearB') && !has(g1, 'farB'), J(g1));
    yes('gold at an alpha of 16% (40 of 255 is 15.7%) is gold, at 15% it is too faint', has(g1, 'a16') && !has(g1, 'a15'));
    const g2 = await run(PAGE(`<div id="gborder" style="border-left:1px solid var(--accretion);height:4px"></div><div id="gbg" style="background:var(--accretion);height:4px"></div>
      <div id="goutline" style="outline:2px solid var(--accretion);height:4px"></div><p id="gdeco" style="text-decoration:underline;text-decoration-color:var(--accretion)">underlined</p>
      <div id="gshadow" style="box-shadow:0 0 0 2px var(--accretion);height:4px"></div>
      <svg width="20" height="20"><circle id="gsvg" cx="10" cy="10" r="5" stroke="#D4A24C" fill="none"/></svg><svg width="20" height="20"><circle id="gfill" cx="10" cy="10" r="5" fill="#D4A24C"/></svg>
      <div id="nodeco" style="color:#fff;text-decoration-color:var(--accretion)">no line drawn</div><div id="nooutline" style="outline:0 solid var(--accretion);height:4px"></div><div id="noborder" style="border:0 solid var(--accretion);height:4px"></div>
      <div id="gnotext" style="color:var(--accretion);height:4px"></div><span id="fillspan" style="fill:var(--accretion);stroke:var(--accretion)">an HTML fill</span><div id="gonone" style="color:var(--accretion);outline-style:none;outline-width:3px;height:4px"></div><div id="gbnone" style="color:var(--accretion);border-style:none;border-width:3px;height:4px"></div>
      <p id="gbefore"></p><div id="gafter" style="height:4px"></div><div id="gnocontent" style="height:4px"></div><div id="gpsnone" style="height:4px"></div>
      <dialog><p id="gclosed" style="color:var(--accretion)">closed dialog</p></dialog><dialog open><p id="gopen" style="color:var(--accretion)">open dialog</p></dialog>`,
      `#gbefore::before { content: "gold before"; color: var(--accretion); } #gafter::after { content: ""; display: block; height: 2px; background: var(--accretion); }
       #gnocontent::before { background: var(--accretion); } #gpsnone::before { content: ""; display: none; background: var(--accretion); }`), gold());
    yes('gold in a border, a background, an outline, a text decoration, a box shadow, an SVG stroke and an SVG fill is a break', ['gborder', 'gbg', 'goutline', 'gdeco', 'gshadow', 'gsvg', 'gfill'].every((id) => has(g2, id)), J(g2));
    yes('a decoration colour with no line, an outline or a border of no width, an outline or a border of no style, and the colour of an element with no text are not gold', !has(g2, 'nodeco') && !has(g2, 'nooutline') && !has(g2, 'noborder') && !has(g2, 'gnotext') && !has(g2, 'gonone') && !has(g2, 'gbnone') && !has(g2, 'fillspan'), J(g2));
    yes('gold drawn by a ::before (its words) or an ::after (a box) is a break; a pseudo with no content, or not displayed, is not', has(g2, 'gbefore') && has(g2, 'gafter') && !has(g2, 'gnocontent') && !has(g2, 'gpsnone'));
    yes('gold in a closed dialog is not seen, in an open one it is', !has(g2, 'gclosed') && has(g2, 'gopen'));
    const g5 = await run(PAGE(`<p id="gts" style="color:#fff;text-shadow:0 0 8px var(--accretion)">glow</p><p id="gtsok" style="color:#fff;text-shadow:0 0 8px #fff">white glow</p>
      <input id="gac" type="checkbox" checked style="accent-color:var(--accretion)"><input id="gacoff" type="checkbox" style="accent-color:var(--accretion)"><input id="gacrange" type="range" style="accent-color:var(--accretion)">
      <p id="gtf" style="color:#fff;-webkit-text-fill-color:var(--accretion)">gold paint</p><ol><li id="gcnt" class="gc">item</li></ol>
      <div id="ggrad" style="height:4px;background:linear-gradient(90deg, #000, var(--accretion))"></div><div id="ggradok" style="height:4px;background:linear-gradient(90deg, #000, #fff)"></div>
      <ul><li id="gmark" class="gm">a gold marker</li><li id="gmarknone" class="gm" style="list-style:none">no marker</li></ul>`,
      '.gc::before { content: counter(list-item) ". "; color: var(--accretion); } .gc { color: #fff; } .gm { color: #fff; } .gm::marker { color: var(--accretion); }'), gold());
    yes('gold in a text shadow, a checked box or a range by accent-color, -webkit-text-fill-color, a counter in a ::before, a gradient stop and a ::marker is a break', ['gts', 'gac', 'gacrange', 'gtf', 'gcnt', 'ggrad', 'gmark'].every((id) => has(g5, id)), J(g5));
    yes('a white shadow, an unchecked box, a gradient with no gold and a list item with no marker are not gold', !has(g5, 'gtsok') && !has(g5, 'gacoff') && !has(g5, 'ggradok') && !has(g5, 'gmarknone'), J(g5));
    const g3 = await run(PAGE('<p id="white" style="color:#fff">white</p><p id="ochre" style="color:#D4A24C">this page has no gold</p>', '', '', false), gold());
    yes('a page that defines no gold has none, whatever its colours', J(g3) === '[]', J(g3));
    const g4 = await run(PAGE(Array.from({ length: 13 }, (_, i) => `<p id="gold${i}" style="color:var(--accretion)">${i}</p>`).join('')), gold());
    yes('the gold rule lists twelve breaks at most', g4.length === 12 && has(g4, 'gold11') && !has(g4, 'gold12'), String(g4.length));

    /* ---- gold, in canvases ---- */
    const px = (id, rgba, xy = [[2, 2]]) => `(() => { const c = document.getElementById(${J(id)}), x = c.getContext('2d'), d = x.createImageData(1, 1); d.data.set(${J(rgba)}); for (const [a, b] of ${J(xy)}) x.putImageData(d, a, b); })();`;
    const G0 = [212, 162, 76];
    const ownCases = [['R', [184, 162, 76], [213, 162, 76]], ['G', [212, 134, 76], [212, 163, 76]], ['B', [212, 162, 48], [212, 162, 77]]];
    const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    const K1 = PAGE(`
      <canvas id="k22" width="20" height="20"></canvas><canvas id="k23" width="20" height="20"></canvas><canvas id="k22g" width="20" height="20"></canvas><canvas id="k23g" width="20" height="20"></canvas><canvas id="k22b" width="20" height="20"></canvas><canvas id="k23b" width="20" height="20"></canvas>
      <canvas id="ka64" width="20" height="20"></canvas><canvas id="ka63" width="20" height="20"></canvas>
      <canvas id="knamed" width="20" height="20"></canvas><canvas id="kwhen" width="20" height="20"></canvas><canvas id="kwhenno" width="20" height="20"></canvas>
      <canvas id="kdot" width="40" height="40"></canvas><canvas id="kdot11" width="40" height="40"></canvas><canvas id="kdot12x" width="40" height="40"></canvas><canvas id="kdot12y" width="40" height="40"></canvas><canvas id="kdotoff" width="40" height="40"></canvas><canvas id="kdotnone" width="40" height="40"></canvas>
      <canvas id="kscaled" width="40" height="40" style="width:20px;height:20px"></canvas>`, '',
      px('k22', [234, 162, 76, 255]) + px('k23', [235, 162, 76, 255]) + px('k22g', [212, 184, 76, 255]) + px('k23g', [212, 185, 76, 255]) + px('k22b', [212, 162, 98, 255]) + px('k23b', [212, 162, 99, 255])
      + px('ka64', [...G0, 64]) + px('ka63', [...G0, 63]) + px('knamed', [...G0, 255]) + px('kwhen', [...G0, 255]) + px('kwhenno', [...G0, 255])
      + px('kdot', [...G0, 255], [[5, 5], [15, 15]]) + px('kdot11', [...G0, 255], [[5, 5], [16, 16]]) + px('kdot12x', [...G0, 255], [[5, 5], [17, 5]]) + px('kdot12y', [...G0, 255], [[5, 5], [5, 17]]) + px('kdotoff', [...G0, 255], [[5, 5]])
      + px('kscaled', [...G0, 255], [[2, 2], [22, 22]]));
    const K2 = PAGE(`
      ${ownCases.map(([c]) => `<canvas id="kown${c}28" width="20" height="20"></canvas><canvas id="kown${c}29" width="20" height="20"></canvas>`).join('')}
      <canvas id="kownlost" width="20" height="20"></canvas><canvas id="kownA160" width="20" height="20"></canvas><canvas id="kownA159" width="20" height="20"></canvas>
      <canvas id="kbitmap" width="20" height="20"></canvas><canvas id="krefuse" width="20" height="20"></canvas>
      <canvas id="khidden" width="20" height="20" style="display:none"></canvas><canvas id="kempty" width="20" height="20"></canvas>
      <canvas id="kzero" width="0" height="20"></canvas><canvas id="kflat" width="20" height="0"></canvas><canvas id="klast" width="20" height="20"></canvas>`, '',
      ownCases.map(([c, , out]) => px(`kown${c}28`, [...G0, 255]) + px(`kown${c}29`, [...out, 255])).join('') + px('kownlost', [...G0, 255]) + px('kownA160', [...G0, 160]) + px('kownA159', [...G0, 159]) + px('khidden', [...G0, 255]) + px('klast', [...G0, 255], [[19, 19]])

      + `document.getElementById('kbitmap').getContext('bitmaprenderer'); document.getElementById('krefuse').getContext = () => { throw new DOMException('refused', 'SecurityError'); };`);
    // the glow of a star drawn in its own colour (#4060a0 here): its own pixel at (5, 5), faint gold beside it
    const K3 = PAGE(`
      <canvas id="kglow3" width="20" height="20"></canvas><canvas id="kglow4" width="20" height="20"></canvas><canvas id="kglow160" width="20" height="20"></canvas><canvas id="kown63" width="20" height="20"></canvas>
      <canvas id="kglowk6" width="40" height="40" style="width:20px;height:20px"></canvas><canvas id="kglowk7" width="40" height="40" style="width:20px;height:20px"></canvas><canvas id="kthin" width="100" height="20"></canvas>
      <canvas id="kglowk5" width="30" height="30" style="width:20px;height:20px"></canvas><canvas id="kglowfaint" width="20" height="20"></canvas><canvas id="kglow64" width="20" height="20"></canvas>
      <canvas id="kwrap" width="20" height="20"></canvas><canvas id="kwrap2" width="20" height="20"></canvas><canvas id="kglowlast" width="20" height="20"></canvas>
      <canvas id="kglowup" width="20" height="20"></canvas><canvas id="kglowdown" width="20" height="20"></canvas><canvas id="kglow159" width="20" height="20"></canvas>`, '',
      ['kglow3', 'kglow4', 'kglow160', 'kglowk6', 'kglowk7'].map((id) => px(id, [64, 96, 160, 255], [[5, 5]])).join('') + px('kglow3', [...G0, 120], [[8, 5]]) + px('kglow4', [...G0, 120], [[9, 5]]) + px('kglow160', [...G0, 160], [[6, 5]])
      + px('kown63', [...G0, 63]) + px('kglowk6', [...G0, 120], [[11, 5]]) + px('kglowk7', [...G0, 120], [[12, 5]])
      + px('kglowk5', [64, 96, 160, 255], [[5, 5]]) + px('kglowk5', [...G0, 120], [[10, 5]]) + px('kglowfaint', [64, 96, 160, 63], [[5, 5]]) + px('kglowfaint', [...G0, 120], [[6, 5]]) + px('kglow64', [64, 96, 160, 64], [[5, 5]]) + px('kglow64', [...G0, 120], [[6, 5]])
      + px('kwrap', [64, 96, 160, 255], [[0, 5]]) + px('kwrap', [...G0, 120], [[19, 4]]) + px('kwrap2', [64, 96, 160, 255], [[19, 5]]) + px('kwrap2', [...G0, 120], [[0, 6]]) + px('kglowlast', [64, 96, 160, 255], [[19, 19]]) + px('kglowlast', [...G0, 120], [[17, 19]])
      + px('kglow159', [64, 96, 160, 255], [[5, 5]]) + px('kglow159', [...G0, 159], [[6, 5]]) + px('kglowup', [64, 96, 160, 255], [[5, 5]]) + px('kglowup', [...G0, 120], [[5, 2]]) + px('kglowdown', [64, 96, 160, 255], [[5, 5]]) + px('kglowdown', [...G0, 120], [[5, 8]])
      + `{ const x = document.getElementById('kthin').getContext('2d'); x.fillStyle = '#4060a0'; x.fillRect(0, 0, 4, 4); x.strokeStyle = '#D4A24C'; x.lineWidth = 1; x.beginPath(); x.moveTo(10, 10); x.lineTo(90, 10); x.stroke(); }`);
    const cfg = { scan: true, named: { '#knamed': 'a test' }, when: { '#kwhen': 'true', '#kwhenno': 'false' },
      oneDot: { '#kdot': 'true', '#kdot11': 'true', '#kdot12x': 'true', '#kdot12y': 'true', '#kdotoff': 'false', '#kdotnone': 'true', '#kscaled': 'true' },
      ownColour: { ...Object.fromEntries(ownCases.flatMap(([c, own]) => [[`#kown${c}28`, J(c === 'R' ? hex(own).slice(1).toUpperCase() : hex(own))], [`#kown${c}29`, J(hex(own))]])), '#kownlost': '""', '#kownA160': '"#4060a0"', '#kownA159': '"#4060a0"', ...Object.fromEntries(['#kglow3', '#kglow4', '#kglow160', '#kown63', '#kglowk6', '#kglowk7', '#kthin', '#kglowk5', '#kglowfaint', '#kglow64', '#kwrap', '#kwrap2', '#kglowlast', '#kglowup', '#kglowdown', '#kglow159'].map((s) => [s, '"#4060a0"'])) } };   // red's written B8A24C
    const k = [...await run(K1, gold({ canvases: cfg })), ...await run(K2, gold({ canvases: cfg })), ...await run(K3, gold({ canvases: cfg }))];
    const at = (id) => k.find((x) => x.startsWith('#' + id + ':')) || '';
    yes('a pixel 22 off gold in any one channel is gold, 23 off is not', ['k22', 'k22g', 'k22b'].every((id) => /gold pixels/.test(at(id))) && ['k23', 'k23g', 'k23b'].every((id) => !at(id)), J(k));
    yes('a pixel at alpha 64 is read, at 63 it is a halo', /gold pixels/.test(at('ka64')) && !at('ka63'), J([at('ka64'), at('ka63')]));
    yes('a canvas named with its reason is not read; an unnamed one with the same gold is', !at('knamed') && /gold pixels/.test(at('kwhenno')));
    yes('a canvas whose condition holds is not read, one whose condition does not hold is', !at('kwhen') && /gold pixels/.test(at('kwhenno')));
    yes('one dot is two pixels up to 11 px apart each way; 12 apart either way is two dots; where no dot is allowed, one dot is a break; no gold at all passes', !at('kdot') && !at('kdot11') && /more than one dot \(12 x 0 px\)/.test(at('kdot12x')) && /more than one dot \(0 x 12 px\)/.test(at('kdot12y')) && /^#kdotoff: 1 gold pixels$/.test(at('kdotoff')) && !at('kdotnone'), J([at('kdot11'), at('kdot12x'), at('kdot12y'), at('kdotoff')]));
    yes('a canvas drawn at half its size is measured in CSS pixels: 20 of its pixels apart is 10 px, one dot', !at('kscaled'), at('kscaled'));
    yes('pixels within 28 of a canvas\'s own colour in every channel are left out, and 29 off in any one is gold again', ownCases.every(([c]) => !at(`kown${c}28`) && /^#kown\w29: 1 gold pixels$/.test(at(`kown${c}29`))), J(k.filter((x) => /kown/.test(x))));
    yes('an own colour not found is a break', /colour it is allowed was not found/.test(at('kownlost')));
    yes('on a canvas with its own colour, gold away from the star is read from an alpha of 64; at 63 it is not', /^#kownA160: 1 gold pixels$/.test(at('kownA160')) && /^#kownA159: 1 gold pixels$/.test(at('kownA159')) && !at('kown63'), J([at('kownA160'), at('kownA159'), at('kown63')]));
    yes('faint gold within 3 CSS px of the star\'s own pixels, beside, above or below, is its glow, at 4 px it is read, and at an alpha of 160 it is read beside the star', !at('kglow3') && !at('kglowup') && !at('kglowdown') && !at('kglow159') && /^#kglow4: 1 gold pixels$/.test(at('kglow4')) && /^#kglow160: 1 gold pixels$/.test(at('kglow160')), J([at('kglow3'), at('kglowup'), at('kglowdown'), at('kglow4'), at('kglow160')]));
    yes('on a canvas drawn at twice its size the glow reaches 6 of its pixels, not 7; at one and a half times, 5 (4.5 rounded up)', !at('kglowk6') && /^#kglowk7: 1 gold pixels$/.test(at('kglowk7')) && !at('kglowk5'), J([at('kglowk6'), at('kglowk7'), at('kglowk5')]));
    yes('a pixel of the star\'s colour at an alpha of 64 has a glow, one at 63 has none', !at('kglow64') && /^#kglowfaint: 1 gold pixels$/.test(at('kglowfaint')), J([at('kglow64'), at('kglowfaint')]));
    yes('the glow stops at the canvas\'s left and right edges, does not wrap onto the next row, and reaches from its last pixel', /^#kwrap: 1 gold pixels$/.test(at('kwrap')) && /^#kwrap2: 1 gold pixels$/.test(at('kwrap2')) && !at('kglowlast'), J([at('kwrap'), at('kwrap2'), at('kglowlast')]));
    yes('a 1 px gold line on a canvas with its own colour is read, though its pixels are at half opacity', /^#kthin: \d+ gold pixels$/.test(at('kthin')) && +at('kthin').split(' ')[1] >= 150, at('kthin'));
    yes('fails closed: a canvas with no 2D context and one that refuses its pixels are breaks', /no 2D context/.test(at('kbitmap')) && /cannot be read \(SecurityError\)/.test(at('krefuse')), J([at('kbitmap'), at('krefuse')]));
    yes('a hidden canvas, an empty one, and one of no width or no height are not breaks', !at('khidden') && !at('kempty') && !at('kzero') && !at('kflat'), J(k.filter((x) => /khidden|kempty|kzero|kflat/.test(x))));
    yes('the last pixel of a canvas is read', /^#klast: 1 gold pixels$/.test(at('klast')), at('klast'));
    const kb = [...await run(K1, gold({ canvases: { scan: true } })), ...await run(K2, gold({ canvases: { scan: true } }))];
    yes('a page that names no allowance has every canvas read', ['k22', 'knamed', 'kwhen', 'kdot', 'kownR28'].every((id) => kb.some((x) => x.startsWith('#' + id + ':'))), J(kb));
    const k0 = [...await run(K1, gold({ canvases: { ...cfg, scan: false } })), ...await run(K2, gold({ canvases: { ...cfg, scan: false } }))], kn = [...await run(K1, gold()), ...await run(K2, gold())];
    yes('canvases are read only when the page asks', !k0.some((x) => /^#k/.test(x)) && !kn.some((x) => /^#k/.test(x)), J([k0, kn]));
  }, { width: 390, height: 844, timeoutMs: 120000, say: () => {} });
  const lost = r.checks.filter((c) => !c.ok);
  yes('the fixture pages ran in one Chrome to their end, with a clean console', !r.timedOut && !lost.length, J(lost).slice(0, 400));
  whole();

  console.log(`invariants selftest: ${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}

/* Run as a command only; the drives import the rules. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {   // equivalent: the module's entry, not a rule; broken, the selftest does not run and tools/mutate.mjs reads that as a pass, its limit
  if (process.argv[2] === 'selftest') process.exit(await selftest());
  else { console.error('usage: node tools/invariants.mjs selftest   (the rules are imported by the drives)'); process.exit(2); }
}
