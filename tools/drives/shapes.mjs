// The survey's interface on the bar sheet of level 2 (slice D: tickets 2.09, 2.10 and three items of 1.07). Run with
// tools/drive.mjs:
//   node tools/drive.mjs tools/drives/shapes.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 600
//   (and again with --width 390 --height 844)
//
// The properties, written before the page was built (BAR_L2.md, its "Approved, with one revision", and the rater's
// failed clauses interface.2.2 to 2.4 of ticket 1.06):
//   1. the parts stand in the places of the composition: a bar, the finder, sheet A with four corners, the numbers
//      beside it, tours under it, the lettered sheets C, D and E below the fold at 1440 with their titles crossing it;
//      one column in reading order at 390, the inset dropped;
//   2. chosen is shown by geometry (an index, a lever, a frame), never by colour; gold only on a measured value's
//      tick, a world in the log and the site's frame; "Ask the model" is not gold;
//   3. world names and section titles in Fraunces upright, the survey note in Fraunces at its text size, the rest in
//      IBM Plex Mono; no tracked capitals, no strings joined by middle dots, no arrow after a label;
//   4. every main control at least 44 px tall at 390; a switch is one target with both words; the distance scale is
//      a radio group the arrow keys move; each keycap shows the key that does the same, the key works, and it is
//      guarded while typing;
//   5. the loading notice stands on a fixed line under the name and covers nothing; every state renders at the same
//      height; numbers never truncate; nothing overflows sideways at 390;
//   6. the log line is a tally that never wraps (1.07); long names in the log's saved rows keep one line at 390
//      (1.07); a refusal under "Add to log" is in view at 1440 (1.07);
//   7. the catalogue's thumbnails are drawn when the page is idle and no shader is being built;
//   8. a skip link, a global reduced-motion rule, a visible focus ring (reach 2.2 to 2.4);
//   9. no colour literal in the lab's stylesheets and drawing code; the controls are the kit's (no .btn, no .chip);
//      one number and one date convention (interface 2.2 to 2.4);
//  10. every part of ui_inventory.md part 6 is on the page.
// No model is called and nothing leaves the page's own origin.
//
// After every step the rules of tools/invariants.mjs hold: the page never scrolls sideways, every visible
// target is 44 px tall at 390, every text is 4.5 to 1, and gold is only where SURVEY_GOLD below allows it, in the DOM
// and in the pixels of every canvas it does not name.
//
// Every use of gold in the survey (grep for T.gold and accretion in labs/assets/js/exoplanet and its stylesheets,
// 2026-11-16), and why it is allowed:
//   views/common.js tokens()            reads --accretion and its tints: the tokens, no mark of its own
//   views/plot.js chosenMark            the chosen world's point when it is kept in the log: a saved world on a diagram
//   views/transit.js measured depth     the archive's measured depth and duration against the model's curve: a
//                                       measured value against a model
//   kit controls.css .iv-m .iv-tick     the tick of a measured value in the table of numbers
//   kit controls.css .tally-marks .tl-kept   a world kept in the log, its tall mark on the tally
//   kit controls.css .fill.kept         "In your log", the filled action of a kept world (main.js toggles .kept)
//   exoplanet.css .bp                   the site's four corner brackets
//   os.css .los-bk                      the corner brackets of a Labs OS plate (the sharing question), the same frame
//   #ret-render .st-observed            the status word "observed" of the planet's air (ticket 2.13, pull request 41)
//   #nums .sw-dot                       not gold: the star's own colour beside its temperature, its Planck spectrum, which
//                                       for a cool star falls within 22 of the gold tint in every channel (TOI-700)
// No other use: export.js drew the plate's brackets in gold until 2026-11-16, and plot.js the chosen world on the
// diagram and on the sky map; both are the bright ink now. SURVEY_GOLD.canvases says, with reasons, the one canvas
// the pixel scan does not read (the WebGL planet), the one it skips under a condition (the signal in transit mode),
// the one that may hold one gold dot (the diagram, its kept world) and the two whose star's own colour it leaves out.

import { standard, gold as goldRule, targets as targetRule } from '../invariants.mjs';

const KEPT = '(document.querySelector("[data-act=log]") || { classList: { contains: () => false } }).classList.contains("kept")';
const STAR = '(() => { const d = document.querySelector("#nums .sw-dot"); return d ? getComputedStyle(d).getPropertyValue("--star-col").trim() : ""; })()';
const TRANSIT = '(document.querySelector("#sheet-e [data-k=sig]") || { getAttribute: () => "false" }).getAttribute("aria-checked") !== "true"';
export const SURVEY_GOLD = {
  allow: ['.bp', '.los-bk', '.iv-m .iv-tick', '.tally-marks .tl-kept', '.fill.kept', '#ret-render .st-observed', '.lbr-panel', '#nums .sw-dot'],
  canvases: {
    scan: true,
    named: {
      '#exo-canvas': 'the world itself, a render of its own colours, not a mark (and a WebGL canvas, which has no 2D pixels to read)',
    },
    // the signal in transit mode: the archive's measured depth and duration against the model, gold by the rule; in
    // velocity mode it is read like every other canvas
    when: { '#sheet-e canvas.tr-cv': TRANSIT },
    // the catalogue diagram while the chosen world is kept: its point, one dot, and no other gold
    oneDot: { '#v-plot canvas.plot-cv': KEPT },
    // the star drawn in its own colour (its Planck spectrum, which can be as warm as a tint of gold): the pixels near
    // that colour, as the table's swatch gives it, are not counted; a gold orbit or mark still is
    ownColour: { '#inset': STAR, '#sheet-d canvas.sys-cv': STAR },
  },
};

/* ---- run before the page's own scripts ---- */
function guard() {
  const real = window.fetch.bind(window);
  window.fetch = (u, o = {}) => (new URL(typeof u === 'string' ? u : u.url, location.href).origin === location.origin ? real(u, o) : Promise.reject(new TypeError('refused by the drive')));
  // what the page asks of the next frame, counted: under reduced motion a settled page asks for none
  const raf = window.requestAnimationFrame.bind(window);
  window.__rafAsked = 0;
  window.requestAnimationFrame = (f) => { window.__rafAsked++; return raf(f); };
  // the thumbnails watched from outside the page's code: when each first holds a drawing, and whether the renderer
  // was building a shader at that moment (engine.building(), the renderer's own state)
  window.__thumbWatch = [];
  const t0 = Date.now();
  const watch = setInterval(() => {
    const cs = document.querySelectorAll('#v-plot [role="tab"] canvas');
    if (!cs.length) return;
    const lit = [...cs].map((c) => { try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 30) n++; return n; } catch { return -1; } });
    const e = window.__exoEngine, last = window.__thumbWatch[window.__thumbWatch.length - 1];
    const key = lit.join(',');
    if (!last || last.key !== key) window.__thumbWatch.push({ t: Date.now() - t0, key, lit, building: e ? e.building() : null, list: (window.__exoThumbs || {}).listed || null });
    if (Date.now() - t0 > 90000) clearInterval(watch);
  }, 40);
}

/* ---- run inside the page ---- */
function layout() {
  const q = (s) => document.querySelector(s);
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top + scrollY), r: Math.round(r.right), b: Math.round(r.bottom + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0;
  return {
    bar: R(q('.bar')), back: R(q('.bar .back')), door: R(q('.bar .door')), field: R(q('.finder .field')), random: R(q('#btn-random')), tally: R(q('#log-line')),
    sheet: R(q('#sheet-a')), ul: R(q('#sheet-a .ul')), name: R(q('#ret-name')), canvas: R(q('#exo-canvas')), ur: shown(q('#sheet-a .ur')) ? R(q('#sheet-a .ur')) : null,
    key: R(q('#key')), tblock: R(q('#tblock')), b: R(q('#sheet-b')), blab: R(q('#sheet-b .lab')), note: R(q('#report')), tours: R(q('#tours-sec')),
    c: R(q('#sheet-c')), d: R(q('#sheet-d')), e: R(q('#sheet-e')), ch: R(q('#sheet-c h2')), dh: R(q('#sheet-d h2')), eh: R(q('#sheet-e h2')),
    cdraw: R(q('#sheet-c .plot-cv')), ddraw: R(q('#sheet-d .sys-cv')), edraw: R(q('#sheet-e .tr-cv')), foot: R(q('.foot')),
    doorText: (q('.bar .door') || {}).innerText || '', wide: document.documentElement.scrollWidth > innerWidth + 1, iw: innerWidth, ih: innerHeight,
    backBorder: q('.bar .back') ? parseFloat(getComputedStyle(q('.bar .back')).borderTopWidth) + parseFloat(getComputedStyle(q('.bar .door')).borderTopWidth) : -1,
    render: q('#ret-render') ? { inUl: !!q('#ret-render').closest('#sheet-a .ul'), text: q('#ret-render').textContent } : null,
  };
}
function typeFaces() {
  const fam = (e) => (e ? getComputedStyle(e).fontFamily : '');
  const plexOk = [...document.querySelectorAll('main button, main input, main select, main td, main th, main .meta, .finder button, .bar a, .foot, #sheet-a .cls, #live')]
    .filter((e) => getComputedStyle(e).display !== 'none' && !e.closest('.st, .rp-body, #ret-name'))
    .filter((e) => !/^"?IBM Plex Mono/.test(fam(e))).map((e) => e.id || e.className || e.tagName).slice(0, 8);
  const st = [...document.querySelectorAll('h2.st')];
  return {
    name: { fam: fam(document.getElementById('ret-name')), style: getComputedStyle(document.getElementById('ret-name')).fontStyle },
    note: (() => { const p = document.querySelector('#report .rp-body'); const s = p ? getComputedStyle(p) : {}; return { fam: s.fontFamily, opsz: s.fontOpticalSizing, size: parseFloat(s.fontSize) }; })(),
    titles: st.map((h) => ({ fam: getComputedStyle(h).fontFamily, tt: getComputedStyle(h).textTransform, text: [...h.childNodes].filter((n) => !(n.nodeType === 1 && n.tagName === 'I')).map((n) => n.textContent).join('').trim() })),
    plexOk,
    link: (() => { const l = document.querySelector('link[href*="fonts.googleapis.com/css2"]'); return l ? { href: l.getAttribute('href'), onload: l.getAttribute('onload') || '', media: l.media } : null; })(),
  };
}
function labels() {
  const vis = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
  const skip = (e) => e.closest('.brand, dialog:not([open]), canvas, .lbr-panel, script, style, [hidden]');
  const caps = [], dots = [], arrows = [];
  for (const e of document.querySelectorAll('body *')) {
    if (skip(e) || !vis(e)) continue;
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (!own) continue;
    const s = getComputedStyle(e), ls = parseFloat(s.letterSpacing) || 0, fs = parseFloat(s.fontSize) || 12;
    if (s.textTransform === 'uppercase' || (ls / fs > 0.05 && own === own.toUpperCase() && /[A-Z]{3}/.test(own))) caps.push(`${e.id || e.className || e.tagName}: ${own.slice(0, 24)}`);
    if (/·/.test(own)) dots.push(`${e.id || e.className || e.tagName}: ${own.slice(0, 40)}`);
  }
  for (const e of document.querySelectorAll('a, button')) {
    if (skip(e) || !vis(e) || e.closest('.kact.bare, .key')) continue;
    const t = (e.innerText || '').trim();
    if (/[→↗›»▸➜]\s*$/.test(t) || (/^[←→]/.test(t) && !e.matches('.bar .back'))) arrows.push(t.slice(0, 30));
  }
  return { caps: caps.slice(0, 10), dots: dots.slice(0, 10), arrows: arrows.slice(0, 10) };
}
function switches() {
  return [...document.querySelectorAll('.switch')].filter((s) => s.getClientRects().length).map((s) => {
    const lv = s.querySelector('.sw-lever').getBoundingClientRect(), l = s.querySelector('.sw-l').getBoundingClientRect(), r = s.querySelector('.sw-r').getBoundingClientRect();
    const cx = lv.left + lv.width / 2, toR = Math.abs(cx - r.left) < Math.abs(cx - l.right);
    return { id: s.id || s.dataset.k || s.dataset.act || '', role: s.getAttribute('role'), checked: s.getAttribute('aria-checked'), words: !!(s.querySelector('.sw-l').textContent.trim() && s.querySelector('.sw-r').textContent.trim()), leverRight: toR };
  });
}
function scaleIndex() {
  const g = document.getElementById('distance'), on = g && g.querySelector('[aria-checked="true"]'), off = g && g.querySelector('[aria-checked="false"]');
  const after = (e) => { const s = getComputedStyle(e, '::after'); return s.content !== 'none' && parseFloat(s.borderTopWidth) > 0; };
  const lum = (e) => { const v = getComputedStyle(e).color.match(/[\d.]+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const offs = g ? [...g.querySelectorAll('[aria-checked="false"]')] : [];
  return { role: g && g.getAttribute('role'), radios: g ? g.querySelectorAll('[role="radio"]').length : 0, on: on && on.dataset.cam, onIndex: !!on && after(on), offIndex: offs.some(after),
    onLum: on ? +lum(on).toFixed(3) : 0, offLum: offs.length ? +Math.max(...offs.map(lum)).toFixed(3) : 0 };
}
function frames() {
  const tabs = [...document.querySelectorAll('#v-plot [role="tab"]')];
  const fr = (e) => { const s = getComputedStyle(e); return s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) >= 1 && s.borderTopColor !== 'rgba(0, 0, 0, 0)'; };
  const bands = [...document.querySelectorAll('#filters [data-cls]:not([data-cls="all"])')];
  const lever = (e) => parseFloat(getComputedStyle(e).borderBottomWidth);
  return { tabs: tabs.map((t) => ({ sel: t.getAttribute('aria-selected'), frame: fr(t), letter: (t.querySelector('.thumb-l') || {}).textContent || '' })), bands: bands.map((b) => ({ cls: b.dataset.cls, on: b.getAttribute('aria-pressed'), lever: lever(b) })) };
}
function sameHeights() {
  const h = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : -1; };
  return { msg: h('#sheet-msg'), tourline: h('#tourline'), qline: h('#q-line'), sheetTop: Math.round(document.getElementById('sheet-a').getBoundingClientRect().top + scrollY), note: (document.getElementById('exo-note') || {}).textContent || '' };
}
function noteCovers() {
  const n = document.getElementById('exo-note'); if (!n) return null;
  const a = n.getBoundingClientRect(), hit = [];
  for (const s of ['#ret-name', '#ret-class', '#ret-render', '#live', '#tours-sec', '#report', '.finder', '#key', '#tblock', '#sheet-b']) {
    const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect();
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hit.push(s);
  }
  return { inLine: !!n.closest('#sheet-msg'), hit, text: n.textContent };
}
function truncated() {
  const out = [];
  for (const e of document.querySelectorAll('#nums td, #tblock .tb-v, #live, .f-count, #log-line .tally-w')) {
    if (e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis') out.push(`${e.className}: ${e.textContent.trim().slice(0, 20)}`);
  }
  return out;
}
function tally() {
  const linesOf = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };   // the lines a text takes: the distinct tops of its boxes
  const b = document.getElementById('log-line'), w = b.querySelector('.tally-w'), r = b.getBoundingClientRect();
  return { text: w.textContent, lines: linesOf(w), right: Math.round(r.right), iw: innerWidth, clipped: w.scrollWidth > w.clientWidth + 1, marks: b.querySelectorAll('.tally-marks line').length, kept: b.querySelectorAll('.tally-marks .tl-kept').length };
}
function longRows() {
  const linesOf = (e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size; };   // the lines a text takes: the distinct tops of its boxes
  return [...document.querySelectorAll('#log-body [data-sec="saved"] .log-open')].map((e) => ({ name: e.textContent, lines: linesOf(e) }));
}

function said() {
  const s = document.querySelector('.tp-said'), b = document.querySelector('[data-act="log"]'), r = s.getBoundingClientRect(), br = b.getBoundingClientRect();
  return { text: s.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight, under: r.top >= br.bottom - 1, scrollY: Math.round(scrollY) };
}
function reach() {
  let rm = false;
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; }
    for (const r of rules) if (r.media && /prefers-reduced-motion:\s*reduce/.test(r.media.mediaText)) for (const x of r.cssRules) if (/^\*/.test(x.selectorText || '') && /animation/.test(x.cssText) && /transition/.test(x.cssText)) rm = true; }
  const skip = document.querySelector('a.skip');
  return { rm, skip: skip ? skip.getAttribute('href') : null };
}
function ring() { const a = document.activeElement, c = getComputedStyle(a); return { id: a.id || a.className, style: c.outlineStyle, width: parseFloat(c.outlineWidth) }; }
/* the focused element and whether its ring is seen: an outline of 2 px or more, or a ring drawn as a box shadow */
function focusNow() {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return { body: true };
  const c = getComputedStyle(a), r = a.getBoundingClientRect();
  const outline = c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) >= 2;
  const shadow = c.boxShadow && c.boxShadow !== 'none' && /[1-9]\d*px/.test(c.boxShadow);
  return { id: (a.id ? '#' + a.id : a.tagName.toLowerCase() + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : '')) + ' ' + (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 18), ring: outline || shadow, h: Math.round(r.height), skip: a.classList.contains('skip') };
}
function kitUse() {
  return { btn: document.querySelectorAll('.btn, .chip').length, css: !!document.querySelector('link[href$="controls.css"]'), switches: document.querySelectorAll('.switch').length, scales: document.querySelectorAll('.scale').length, keys: document.querySelectorAll('.kact').length, fills: document.querySelectorAll('.fill').length };
}
function isoInText() {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = []; let n;
  while ((n = walk.nextNode())) { const e = n.parentElement; if (!e || e.closest('script, style, dialog:not([open]), [hidden]')) continue; const m = n.textContent.match(/\b\d{4}-\d\d-\d\d\b/); if (m) hits.push(`${e.id || e.className}: ${m[0]}`); }
  const tb = (document.querySelector('#tblock') || {}).textContent || '';
  return { hits: hits.slice(0, 6), tb: tb.replace(/\s+/g, ' ').trim() };
}
function parts() {
  const need = {
    'skip link': 'a.skip', 'back to the labs': '.bar a.back[href="index.html"]', 'the side door': '.bar a.door[href="exomania.html"]', 'where I am': '.bar .here', 'the mark': '.bar .brand',
    'title block (stamp)': '#tblock .tb-cat', 'route lamp in the survey note': '#report #route', 'the planet in sheet A': '#sheet-a #exo-canvas', 'name and class': '#ret-name, #ret-class',
    'the loading line': '#sheet-msg', 'distance scale': '#distance[role="radiogroup"] [data-cam="surface"]', 'another world (R)': '#btn-random .key', 'clouds switch': '#btn-plain[role="switch"]',
    'instruments switch': '#btn-clean[role="switch"]', 'star elevation scale': '#ground #sun-elev', 'the finder with its key': '.finder .field #q', 'the tally': '#log-line .tally-marks', 'tours as lines': '#tours [data-tour] ~ svg, #tours svg',
    'the tour keys': '#tour-prev .key, #tour-next .key, #tour-end .key', 'the numbers table': '#nums', 'interval glyphs': '#nums svg.iv', 'albedo scale': '#albedo', 'add to log, filled': '.fill[data-act="log"]',
    'how inferred, in B\'s label row': '#sheet-b .lab [data-act="chain"]', 'pin, plain': '.plain[data-act="pin"]', 'PNG, CSV, link in the title block': '#tblock [data-act="plate"], #tblock [data-act="csv"], #tblock [data-act="link"]',
    'survey note': '#report .rp-body', 'ask the model, plain': '#report .plain[data-k="ask"]', 'diagram thumbnails': '#v-plot [role="tab"] canvas', 'ink, three positions': '#v-plot .scale[data-k="cby"]',
    'size bands': '#filters [data-cls="rocky"]', 'method filter': '#f-method', 'ranges': '#filters [data-act="ranges"]', 'replay discoveries': '#filters [data-act="replay"][role="switch"]',
    'the system, sheet D': '#sheet-d .sys-cv', 'play and the Solar System': '#sheet-d [data-k="play"][role="switch"], #sheet-d [data-k="solar"][role="switch"]', 'the signal, sheet E': '#sheet-e .tr-cv',
    'transit or velocity': '#sheet-e [data-k="sig"][role="switch"]', 'method and sources': '#btn-method', 'evidence tags and the line types': '.foot .lt', 'close is Esc': '[data-close="log"] .key, [data-close="compare"] .key, [data-close="chain"] .key, #method-close .key',
    'unpin all, plain': '#cmp-clear.plain', 'lettered tables, closed': '#sheet-c details, #sheet-d details, #sheet-e details', 'the inset': '#sheet-a .ur #inset',
  };
  // where a part is seen: on the page now, in a dialog when it opens, inside a closed table whose summary is seen, in
  // a running tour, or at the desk only (the inset and the site's mark are dropped below 1100 px)
  const where = { 'close is Esc': 'dialog', 'unpin all, plain': 'dialog', 'the tour keys': 'tour', 'lettered tables, closed': 'details', 'the inset': innerWidth < 1100 ? 'desk' : 'shown', 'the mark': innerWidth < 1100 ? 'desk' : 'shown', 'star elevation scale': 'ground' };
  const seen = (e) => !!e && e.getClientRects().length > 0 && e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && e.getBoundingClientRect().width > 0;
  const missing = [];
  for (const [k, s] of Object.entries(need)) {
    const w = where[k] || 'shown';
    for (const one of s.split(', ')) {
      const e = document.querySelector(one);
      if (!e) { missing.push(`${k} (${one}): not on the page`); break; }
      if (w === 'shown' && !seen(e)) { missing.push(`${k} (${one}): on the page but not seen`); break; }
      if (w === 'details') { const d = e.matches('details') ? e : e.closest('details'); if (!d || d.open || !seen(d.querySelector('summary'))) { missing.push(`${k} (${one}): its summary is not seen, or it is open`); break; } }
      if (w === 'dialog') { const d = e.closest('dialog'); if (!d) { missing.push(`${k} (${one}): not in a dialog`); break; } const was = d.open; if (!was) d.show(); const ok = seen(e); if (!was) d.close(); if (!ok) { missing.push(`${k} (${one}): not seen when its dialog opens`); break; } }
      if (w === 'tour' && !e.closest('#tourbar')) { missing.push(`${k} (${one}): not in the tour's bar`); break; }
      if (w === 'ground' && !e.closest('#ground')) { missing.push(`${k} (${one}): not in the ground's controls`); break; }
    }
  }
  return { missing, n: Object.keys(need).length };
}
function thumbs() {
  const w = window.__thumbWatch || [];
  const drawn = w.filter((x) => x.lit.length === 5 && x.lit.every((n) => n > 40));
  const tb = Number(((document.getElementById('tb-n') || {}).textContent || '').replace(/,/g, '').match(/^\d+/) || NaN);
  return { first: drawn[0] || null, before: w.filter((x) => drawn.length && x.t < drawn[0].t).map((x) => x.building), drawings: drawn.length, last: drawn[drawn.length - 1] || null, listed: (window.__exoThumbs || {}).listed, tb, whys: (window.__exoThumbs || {}).whys };
}
function noThanks() { const b = [...document.querySelectorAll('button')].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); return true; }
function typeInto(text) { const q = document.getElementById('q'); q.focus(); q.value = text; q.dispatchEvent(new Event('input', { bubbles: true })); }
function rawWrite(data) {
  return new Promise((resolve) => { const req = indexedDB.open('labs'); req.onsuccess = () => { const db = req.result; const tx = db.transaction('progress', 'readwrite'); tx.objectStore('progress').put({ lab: 'exomania', v: 2, data, updated: Date.now(), resume: null, due: [], finished: false }); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => { db.close(); resolve(false); }; }; req.onerror = () => resolve(false); });
}
async function names(k, from, longest) {
  const d = await (await fetch(new URL('assets/data/exomania/pscomppars-snapshot.json', location.href).href)).json();
  const all = d.rows.map((r) => r[0]);
  return longest ? all.slice().sort((a, b) => b.length - a.length).slice(0, k) : all.slice(from, from + k);
}

/* ---- the scenario ---- */
export default async function shapes(p, { base, width }) {
  await p.before(`(${guard})()`);
  for (const [n, e] of standard({ gold: SURVEY_GOLD })) p.invariant(n, e);
  const call = (fn, ...args) => p.ev(`(${fn})(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  const phone = width < 700;
  const NAMED = '(() => { const n = (document.getElementById("ret-name") || {}).textContent; return !!n && n.trim().length > 1 && n.trim() !== "…"; })()';
  const open = async (query = '', { still = true } = {}) => {
    await p.go(`${base}/labs/exomania-survey.html?${[still ? 'still' : '', query].filter(Boolean).join('&')}`);
    await p.until(NAMED, 90000);
    await p.until('!!document.getElementById("log").dataset.store', 30000);
    await p.sleep(800);
    await call(noThanks);
    await p.until('getComputedStyle(document.querySelector(".finder")).opacity === "1"', 10000);
    await p.ev('(scrollTo(0, 0), true)');
  };
  const name = () => p.ev('document.getElementById("ret-name").textContent');
  const j = (o) => JSON.stringify(o);

  await open(`p=${encodeURIComponent('Kepler-442 b')}`);
  await p.sleep(1500);
  const L = await call(layout);
  await p.shot(`shapes-${width}-first`);

  // ---- 1. the places ----
  p.check('the bar holds back, where, one side door and the mark, as words with no box', !!L.back && !!L.door && L.backBorder === 0 && (phone ? /^the sky$/.test(L.doorText.trim()) : /^the sky of clocks$/.test(L.doorText.trim())), `${L.doorText} | borders ${L.backBorder}`);
  p.check('the finder runs under the bar, with "Another world" and the tally beside it (on a phone the tally on its own row)', !!L.field && L.field.t > L.bar.b - 2 && L.sheet.t > L.field.b && (phone ? L.tally.t >= L.field.b - 2 : Math.abs(L.tally.t + L.tally.h / 2 - (L.field.t + L.field.h / 2)) < 14 && L.random.l > L.field.r - 4 && L.field.w > L.iw * 0.45), j({ field: L.field, random: L.random, tally: L.tally }));
  const corner = phone
    ? L.name.t < L.canvas.t && L.canvas.b <= L.key.t + 2 && L.key.b <= L.tblock.t + 2 && L.ur === null
    : L.ul.l - L.sheet.l < 20 && L.ul.t - L.sheet.t < 20 && !!L.ur && L.sheet.r - L.ur.r < 20 && L.ur.t - L.sheet.t < 20 && L.key.l - L.sheet.l < 20 && L.sheet.b - L.key.b < 20 && L.sheet.r - L.tblock.r < 20 && L.sheet.b - L.tblock.b < 20 && L.canvas.l <= L.sheet.l + 1 && L.canvas.r >= L.sheet.r - 1;
  p.check(phone ? 'sheet A on a phone: the name above the planet, the key and the title block under it, the inset dropped' : 'sheet A has its four corners: name upper left, the system upper right, the key lower left, the title block lower right, the planet behind them', corner, j({ sheet: L.sheet, ul: L.ul, ur: L.ur, key: L.key, tblock: L.tblock, canvas: L.canvas }));
  p.check('the line #ret-render stands in sheet A\'s upper-left block and names the drawn surface', !!L.render && L.render.inUl && /procedural surface: temperate world with seas/.test(L.render.text), j(L.render));
  if (!phone) {
    p.check('at 1440 the numbers stand beside the sheet and the tours under it', L.b.l >= L.sheet.r + 20 && L.tours.t >= L.sheet.b && L.tours.l <= L.sheet.l + 1, j({ sheet: L.sheet, b: L.b, tours: L.tours }));
    const cross = [L.ch, L.dh, L.eh].every((h) => h.t < 900 && h.t > 780);
    p.check('C, D and E stand below the fold, their titles on the first screen above their drawings, so the page shows it goes on', cross && [L.cdraw, L.ddraw, L.edraw].every((d) => d.t >= 900 - 40), j({ titles: [L.ch.t, L.dh.t, L.eh.t], drawings: [L.cdraw.t, L.ddraw.t, L.edraw.t] }));
  } else {
    const order = [L.bar.t, L.field.t, L.tally.t, L.name.t, L.canvas.t, L.key.t, L.tblock.t, L.blab.t, L.note.t, L.tours.t, L.c.t, L.d.t, L.e.t, L.foot.t];
    p.check('on a phone one column in reading order: bar, finder, tally, name, planet, key, title block, numbers, note, tours, C, D, E, foot', order.every((v, i) => i === 0 || v >= order[i - 1]) && !L.wide, order.join(' '));
  }

  // ---- 3. type ----
  const T = await call(typeFaces);
  p.check('the world\'s name is set in Fraunces, upright', /Fraunces/.test(T.name.fam) && T.name.style === 'normal', j(T.name));
  p.check('the survey note is set in Fraunces at its text optical size', /Fraunces/.test(T.note.fam || '') && T.note.opsz === 'auto' && T.note.size >= 14, j(T.note));
  p.check('section titles are words in Fraunces, in sentence case', T.titles.length >= 5 && T.titles.every((t) => /Fraunces/.test(t.fam) && t.tt === 'none' && /^[A-Z][a-z ]+$/.test(t.text)), j(T.titles));
  p.check('everything else a visitor reads or presses is in IBM Plex Mono', T.plexOk.length === 0, T.plexOk.join(', '));
  p.check('Fraunces joins the survey\'s fonts link, which never blocks first paint', !!T.link && /Fraunces/.test(T.link.href) && /IBM\+Plex\+Mono/.test(T.link.href) && /this\.media='all'/.test(T.link.onload) && T.link.media === 'all', j(T.link));
  const Lb = await call(labels);
  p.check('no label in tracked capitals, outside the site\'s mark', Lb.caps.length === 0, Lb.caps.join(' | '));
  p.check('no string joined by middle dots, outside the site\'s mark', Lb.dots.length === 0, Lb.dots.join(' | '));
  p.check('no arrow after a label: arrows only for a direction (back, a key)', Lb.arrows.length === 0, Lb.arrows.join(' | '));

  // ---- 2. geometry, not colour; gold ----
  const S0 = await call(scaleIndex);
  p.check('the distance scale is a radio group whose chosen view stands under its index, the only one with an index, and in the bright ink', S0.role === 'radiogroup' && S0.radios === 3 && S0.on === 'orbit' && S0.onIndex && !S0.offIndex && S0.onLum > S0.offLum, j(S0));
  const W0 = await call(switches);
  p.check('every switch is one button, role switch, with both words, and its lever on the side of its state', W0.length >= 6 && W0.every((s) => s.role === 'switch' && (s.checked === 'true' || s.checked === 'false') && s.words && s.leverRight === (s.checked === 'true')), j(W0));
  const F0 = await call(frames);
  p.check('the five diagrams are lettered thumbnails, the open one framed and the others not', F0.tabs.length === 5 && F0.tabs.map((t) => t.letter).join('') === 'abcde' && F0.tabs.filter((t) => t.sel === 'true').length === 1 && F0.tabs.every((t) => t.frame === (t.sel === 'true')), j(F0.tabs));
  const G0 = await p.ev(goldRule(SURVEY_GOLD));
  p.check('gold is only on a measured value\'s tick, a world in the log and the site\'s frame, and no canvas the list does not name has a gold pixel while the chosen world is not kept', G0.length === 0, G0.join(' | '));
  // every diagram read for gold, the chosen world not kept and then kept: no gold but the kept world's one dot
  const goldPx = '(() => { const c = document.querySelector("#v-plot canvas.plot-cv"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 90 && Math.abs(d[i] - 212) <= 22 && Math.abs(d[i + 1] - 162) <= 22 && Math.abs(d[i + 2] - 76) <= 22) n++; return n; })()';
  const diagrams = async () => {
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await p.ev(`document.querySelectorAll("#v-plot [role=tab]")[${i}].click()`); await p.sleep(700);
      seen.push({ plot: await p.ev(`document.querySelectorAll("#v-plot [role=tab]")[${i}].dataset.plot`), breaks: await p.ev(goldRule(SURVEY_GOLD)), gold: await p.ev(goldPx) });
    }
    await p.ev('document.querySelectorAll("#v-plot [role=tab]")[0].click()'); await p.sleep(500);
    return seen;
  };
  // the allowances do not over-allow: a gold orbit drawn on the system and on the inset, and gold on the signal once it
  // shows the velocity, are each caught; every canvas is put back as it was
  const plant = (sel, how) => `(() => { const c = document.querySelector(${JSON.stringify(sel)}), x = c.getContext("2d"); window.__kept = x.getImageData(0, 0, c.width, c.height); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accretion").trim(); x.lineWidth = 2; x.beginPath(); ${how} x.stroke(); x.restore(); return true; })()`;
  const unplant = (sel) => `(() => { const c = document.querySelector(${JSON.stringify(sel)}); c.getContext("2d").putImageData(window.__kept, 0, 0); return true; })()`;
  const caught = async (sel, how, word) => { await p.ev(plant(sel, how)); const b = await p.ev(goldRule(SURVEY_GOLD)); await p.ev(unplant(sel)); return b.some((x) => x.includes(word)); };
  const orbitSys = await caught('#sheet-d canvas.sys-cv', 'x.arc(c.width / 2, c.height / 2, c.height / 3, 0, Math.PI * 2);', 'sys-cv');
  const orbitInset = await caught('#inset', 'x.arc(c.width / 2, c.height / 2, c.height / 3, 0, Math.PI * 2);', 'inset');
  const trTransit = await caught('#sheet-e canvas.tr-cv', 'x.moveTo(10, 10); x.lineTo(c.width - 10, 10);', 'tr-cv');
  await p.ev('document.querySelector("#sheet-e [data-k=sig]").click()'); await p.sleep(500);
  const velClean = await p.ev(goldRule(SURVEY_GOLD));
  const trVelocity = await caught('#sheet-e canvas.tr-cv', 'x.moveTo(10, 10); x.lineTo(c.width - 10, 10);', 'tr-cv');
  await p.ev('document.querySelector("#sheet-e [data-k=sig]").click()'); await p.sleep(500);
  p.check('the gold scan is not blinded by its allowances: a gold orbit on the system or the inset is caught, and gold on the signal is allowed in transit mode only', orbitSys && (orbitInset || phone) && !trTransit && velClean.length === 0 && trVelocity, j({ orbitSys, orbitInset, trTransit, velClean, trVelocity }));   // the inset is not drawn on a phone
  const free = await diagrams();
  p.check('each of the five diagrams, the chosen world not kept: no gold on it, nor on any canvas the list does not name', free.length === 5 && free.every((d) => d.breaks.length === 0 && d.gold === 0), j(free));
  await p.ev('document.querySelector("[data-act=log]").click()');
  await p.until('document.querySelector("[data-act=log]").classList.contains("kept")', 6000); await p.sleep(400);
  const kept = await diagrams();
  const onIt = kept.filter((d) => ['valley', 'rp', 'sky'].includes(d.plot));
  p.check('each of the five diagrams, the chosen world kept: its point is the one gold, where it is drawn (a, b, e), and nothing else is gold', kept.length === 5 && kept.every((d) => d.breaks.length === 0) && onIt.length === 3 && onIt.every((d) => d.gold > 0 && d.gold < 120), j(kept));
  await p.ev('document.querySelector("[data-act=log]").click()');
  await p.until('!document.querySelector("[data-act=log]").classList.contains("kept")', 6000); await p.sleep(300);

  // a size band, once pressed, stands on its heavy rule; the others have none
  await p.ev('document.querySelector("#filters [data-cls=rocky]").click()'); await p.sleep(500);
  const F1 = await call(frames);
  const pressed = F1.bands.filter((b) => b.on === 'true'), rest = F1.bands.filter((b) => b.on !== 'true');
  // its two edges take Home and End: as far as each can go, the end of the axis or the other edge
  const edge = async (end, key) => { await p.ev(`document.getElementById("edge-${end}").focus()`); await p.key(key); await p.sleep(300); return p.ev('[document.getElementById("edge-lo"), document.getElementById("edge-hi")].map((e) => e ? +e.getAttribute("aria-valuenow") : null)'); };
  const k1 = await edge('hi', 'End'), k2 = await edge('lo', 'End'), k3 = await edge('lo', 'Home');
  p.check("a band's edges take Home and End: the high edge to the axis's end, the low edge up to the high one and back to the axis's start", k1[1] === 25 && k1[0] === 0.5 && k2[0] > 24 && k2[0] < 25 && k3[0] === 0.5 && k3[1] === 25, JSON.stringify({ k1, k2, k3 }));
  await p.ev('(() => { for (let i = 0; i < 10; i++) { const b = document.querySelector("#filters [data-clear]"); if (!b) break; b.click(); } return true; })()'); await p.sleep(400);
  await p.ev('document.querySelector("#filters [data-cls=rocky]").click()'); await p.sleep(400);
  p.check('a pressed size band is shown by the heavy rule under it, and no other band has one', F0.bands.every((b) => b.on !== 'true') && pressed.length === 1 && pressed[0].cls === 'rocky' && pressed[0].lever >= 2 && rest.every((b) => b.lever < pressed[0].lever), j({ before: F0.bands, after: F1.bands }));
  await p.ev('document.querySelector("#filters [data-cls=rocky]").click()'); await p.sleep(500);
  const ask = await p.ev('(() => { const a = document.querySelector("#report [data-k=ask]"), s = getComputedStyle(a); return { c: s.color, b: s.borderTopColor }; })()');
  const gold = await p.ev('(() => { const i = document.createElement("i"); document.body.append(i); const out = ["--accretion", "--accretion-soft", "--accretion-dim"].map((v) => { i.style.color = `var(${v})`; return getComputedStyle(i).color; }); i.remove(); return out; })()');
  p.check('"Ask the model" is not gold', !gold.includes(ask.c) && !gold.includes(ask.b), j(ask));

  // ---- 9. tokens and the kit ----
  const K = await call(kitUse);
  p.check('the survey\'s controls are the kit\'s: no .btn or .chip, the shared stylesheet linked, switches, scales, keys and one filled action', K.btn === 0 && K.css && K.switches >= 6 && K.scales >= 2 && K.keys >= 3 && K.fills === 1, j(K));
  const files = ['assets/css/exoplanet.css', 'assets/css/overdue.css', 'assets/css/controls.css', 'assets/js/exoplanet/views/common.js', 'assets/js/exoplanet/config.js', 'assets/js/exoplanet/export.js', 'assets/js/exoplanet/views/transit.js', 'assets/js/exoplanet/views/plot.js', 'assets/js/exoplanet/views/system.js', 'assets/js/exoplanet/views/target.js', 'assets/js/exoplanet/main.js', 'assets/js/exoplanet/report.js', 'assets/js/kit/controls.js'];
  const lits = await p.ev(`(async () => { const out = []; for (const f of ${j(files)}) { const t = await (await fetch(f)).text(); const m = t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').match(/#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b(?![-\\w])|rgba?\\(\\s*\\d/g) || []; if (m.length) out.push(f.split('/').pop() + ': ' + m.slice(0, 3).join(' ')); } return out; })()`);
  p.check('no colour literal in the lab\'s stylesheets and drawing code: every colour is a site token', lits.length === 0, lits.join(' | '));
  const D0 = await call(isoInText);
  p.check('one date convention: the title block dates the catalogue in words, and no ISO date is shown as text', D0.hits.length === 0 && /\d{1,2}\s(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{4}/.test(D0.tb), `${D0.hits.join(' | ')} | ${D0.tb}`);

  // ---- 10. every part ----
  const P = await call(parts);
  p.check(`every part of the survey's inventory is on the page (${P.n} looked for)`, P.missing.length === 0, P.missing.join(' | '));

  // ---- 4. controls ----
  const small = await p.ev(phone ? targetRule() : targetRule({ below: 99999, tall: 24, wide: 0 }));
  p.check(phone ? 'every visible target on the page is at least 44 px tall and 24 px wide' : 'every visible target on the page is at least 24 px tall', small.length === 0, small.join(', '));
  // a switch is one target: a press on either word turns it
  await p.ev('document.getElementById("btn-plain").scrollIntoView({ block: "center" })'); await p.sleep(200);
  const wl = await p.ev('(() => { const r = document.querySelector("#btn-plain .sw-l").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
  await p.click(wl[0], wl[1]); await p.sleep(300);
  const sw1 = await p.ev('document.getElementById("btn-plain").getAttribute("aria-checked")');
  const wr = await p.ev('(() => { const r = document.querySelector("#btn-plain .sw-r").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
  await p.click(wr[0], wr[1]); await p.sleep(300);
  const sw2 = await p.ev('document.getElementById("btn-plain").getAttribute("aria-checked")');
  p.check('a switch is one target: a press on either of its words turns it', sw1 === 'true' && sw2 === 'false', `${sw1} then ${sw2}`);
  // the arrow keys move the distance scale, and the view follows
  await p.ev('document.querySelector("#distance [aria-checked=true]").focus()');
  await p.key('ArrowRight'); await p.sleep(1500);
  const s1 = await call(scaleIndex), v1 = await p.ev('document.getElementById("bezel").textContent');
  await p.key('ArrowLeft'); await p.sleep(1500);
  const s2 = await call(scaleIndex), focusR = await p.ev('document.activeElement.dataset.cam || ""');
  p.check('the arrow keys move the distance scale and the view follows it', s1.on === 'closeorbit' && /low pass/i.test(v1) && s2.on === 'orbit' && focusR === 'orbit', `${s1.on} (${v1}) then ${s2.on}, focus ${focusR}`);
  await p.key('Tab');
  const rg = await call(ring);
  p.check('the focus is drawn with a visible ring on the next control, a switch', rg.style === 'solid' && rg.width >= 2 && /btn-plain/.test(rg.id), j(rg));
  // and on every control the tab order reaches, from the skip link round to it again
  await p.ev('(document.activeElement && document.activeElement.blur(), scrollTo(0, 0), true)');
  const walk = [];
  for (let k = 0; k < 260; k++) {
    await p.key('Tab');
    const f = await call(focusNow);
    if (f.body || (k > 0 && f.skip)) break;
    walk.push(f);
  }
  const noRing = walk.filter((f) => !f.ring);
  p.check(`every control the tab order reaches shows a ring when it has the focus (${walk.length} reached)`, walk.length > 30 && noRing.length === 0, noRing.slice(0, 8).map((f) => f.id).join(' | '));
  await p.ev('(document.activeElement && document.activeElement.blur(), scrollTo(0, 0), true)');
  // the keys, and their guard while typing
  await p.ev('(document.activeElement && document.activeElement.blur(), true)');
  const n0 = await name();
  await p.key('r'); await p.sleep(1200);
  const n1 = await name();
  await p.key('/', { code: 'Slash' }); await p.sleep(200);
  const inField = await p.ev('document.activeElement.id');
  await p.key('r'); await p.key('h'); await p.sleep(900);
  const typed = await p.ev('({ v: document.getElementById("q").value, name: document.getElementById("ret-name").textContent, clean: document.body.classList.contains("clean") })');
  await p.ev('(() => { const q = document.getElementById("q"); q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); q.blur(); return true; })()');
  await p.key('h'); await p.sleep(400);
  const hidden = await p.ev('({ clean: document.body.classList.contains("clean"), sw: document.getElementById("btn-clean").getAttribute("aria-checked"), finder: getComputedStyle(document.querySelector(".finder")).visibility })');
  await p.key('h'); await p.sleep(400);
  const back = await p.ev('({ clean: document.body.classList.contains("clean"), sw: document.getElementById("btn-clean").getAttribute("aria-checked") })');
  p.check('R opens another world, "/" goes to the finder, H hides the instruments and brings them back, and its switch follows', n1 !== n0 && inField === 'q' && hidden.clean && hidden.sw === 'true' && hidden.finder === 'hidden' && !back.clean && back.sw === 'false', j({ n0, n1, inField, hidden, back }));
  p.check('while typing in the finder the keys are letters: R and H do nothing else', typed.v === 'rh' && typed.name === n1 && !typed.clean, j(typed));
  const keyText = await p.ev('({ r: document.querySelector("#btn-random .key").textContent, h: (document.querySelector("#key .key") || {}).textContent, slash: document.querySelector(".finder .field .key").textContent, prev: document.querySelector("#tour-prev .key").textContent, next: document.querySelector("#tour-next .key").textContent, end: document.querySelector("#tour-end .key").textContent })');
  p.check('each keycap shows the key that does the same thing', keyText.r === 'R' && keyText.h === 'H' && keyText.slash === '/' && keyText.prev === '←' && keyText.next === '→' && keyText.end === 'Esc', j(keyText));
  // a tour: its line, its keys
  await p.ev('document.querySelector("#tours [data-tour=earthlike]").click()'); await p.sleep(1200);
  const t0 = await p.ev('({ k: document.getElementById("tour-k").textContent, name: document.getElementById("ret-name").textContent, ring: !!document.querySelector("#tours [data-row=earthlike] .stop-now") })');
  await p.ev('(document.activeElement && document.activeElement.blur(), true)');
  await p.key('ArrowRight'); await p.sleep(1200);
  const t1 = await p.ev('({ k: document.getElementById("tour-k").textContent, seen: document.querySelectorAll("#tours [data-row=earthlike] .stop-seen").length })');
  await p.key('ArrowLeft'); await p.sleep(1200);
  const t2 = await p.ev('document.getElementById("tour-k").textContent');
  await p.key('Escape'); await p.sleep(400);
  const t3 = await p.ev('document.getElementById("tourbar").hidden');
  p.check('a tour is drawn as its line with the current stop ringed; the arrow keys step it, the seen stops fill, and Esc ends it', t0.ring && /1 of 6/.test(t0.k) && /2 of 6/.test(t1.k) && t1.seen >= 1 && /1 of 6/.test(t2) && t3 === true, j({ t0, t1, t2, t3 }));

  // ---- 4b. the wheel, as a map's in a page (a pointer with a wheel: the desk) ----
  if (!phone) {
    await p.ev('(scrollTo(0, 0), true)'); await p.sleep(300);
    const cam = () => p.ev('Math.round(window.__exoEngine.cfg.camDist * 1000) / 1000');
    const st = () => p.ev('({ y: Math.round(scrollY), hint: !document.getElementById("wheel-hint").hidden, hintText: document.getElementById("wheel-hint").textContent })');
    const pc = await p.ev('(() => { const r = document.getElementById("exo-stage").getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()');
    const d0 = await cam();
    await p.wheel(pc[0], pc[1], 120); await p.sleep(250);
    const w1 = await st(), d1 = await cam();
    await p.sleep(2300);
    const w1b = await st();
    p.check('over a planet not yet clicked the wheel scrolls the page, the zoom stays, and a hint says for about 2 s how to zoom', w1.y > 0 && d1 === d0 && w1.hint && /click the planet to zoom with the wheel, or use \+ and −/i.test(w1.hintText) && !w1b.hint, j({ w1, w1b, d0, d1 }));
    await p.ev('(scrollTo(0, 0), true)'); await p.sleep(300);
    await p.click(pc[0], pc[1]); await p.sleep(200);
    await p.wheel(pc[0], pc[1], -120); await p.sleep(250);
    const w2 = await st(), d2 = await cam();
    p.check('once the planet is clicked the wheel zooms it and the page stays', w2.y === 0 && d2 < d0, j({ w2, d0, d2 }));
    await p.move(pc[0], 5); await p.sleep(200);   // the pointer leaves sheet A, above it
    await p.wheel(pc[0], pc[1], 120); await p.sleep(250);
    const w3 = await st(), d3 = await cam();
    await p.ev('(scrollTo(0, 0), true)'); await p.sleep(300);
    await p.click(pc[0], pc[1]); await p.sleep(200);
    await p.key('Escape'); await p.sleep(200);
    await p.wheel(pc[0], pc[1], 120); await p.sleep(250);
    const w4 = await st(), d4 = await cam();
    p.check('the pointer leaving sheet A, or Esc, ends it: the wheel scrolls the page again', w3.y > 0 && d3 === d2 && w4.y > 0 && d4 === d2, j({ w3, d3, w4, d4 }));
    await p.ev('(scrollTo(0, 0), document.activeElement && document.activeElement.blur(), true)'); await p.sleep(300);
    const e0 = await cam();
    await p.key('+', { code: 'Equal' }); await p.sleep(200);
    const e1 = await cam();
    await p.key('-', { code: 'Minus' }); await p.sleep(200);
    const e2 = await cam();
    const keysRow = await p.ev('(() => { const r = [...document.querySelectorAll("#method-body tr")].find((tr) => (tr.querySelector("th") || {}).textContent === "Keys"); return r ? "Keys " + r.querySelector("td").textContent : ""; })()');
    p.check('+ and − zoom with the focus anywhere but a field, and the method lists them and the wheel among the keys', e1 < e0 && e2 > e1 && /\+ and − the zoom/.test(keysRow) && /wheel/.test(keysRow), j({ e0, e1, e2, keysRow }));
  }

  // ---- 5. the loading line, and the same height in every state ----
  const h0 = await call(sameHeights);
  await open(`p=${encodeURIComponent('Kepler-442 b')}`, { still: false });
  const hA = await call(sameHeights);
  await p.ev('(() => { const e = window.__exoEngine; if (e) e._note("Preparing this kind of world…"); return !!e; })()');
  await p.sleep(200);
  const cov = await call(noteCovers), hB = await call(sameHeights);
  await p.shot(`shapes-${width}-notice`);
  p.check('the loading notice stands on its fixed line under the name and covers nothing, at the line\'s own height', !!cov && cov.inLine && cov.hit.length === 0 && hB.msg === hA.msg && hB.msg > 0, j({ cov, empty: hA.msg, shown: hB.msg }));
  await p.ev('(window.__exoEngine && window.__exoEngine._clearNote(), true)');
  await call(typeInto, 'cold planet'); await p.key('Enter'); await p.sleep(400); await p.key('Enter'); await p.sleep(1500);
  await p.ev('(document.activeElement && document.activeElement.blur(), true)'); await p.sleep(300);
  const hC = await call(sameHeights);
  p.check('a question\'s note, a running tour and an empty one leave the sheet where it was: every line keeps its height', hC.qline === h0.qline && hC.sheetTop === h0.sheetTop && hC.tourline === h0.tourline && h0.tourline > 0, j({ before: h0, after: hC }));
  const tr = await call(truncated);
  p.check('no number is cut: every cell of the table and the title block shows its whole value', tr.length === 0, tr.join(' | '));
  const wide = await p.ev('document.documentElement.scrollWidth > innerWidth + 1');
  p.check('nothing overflows sideways with a question\'s results on the page', !wide, String(wide));

  // ---- 7. heavy drawing when idle ----
  await p.until('!!window.__exoThumbs && /with a measured radius/.test(document.getElementById("tb-n").textContent)', 60000);
  await p.sleep(1500);
  const th = await call(thumbs);
  p.check('the five thumbnails are first drawn while no shader is being built, as the renderer itself says, and never before', !!th.first && th.first.building === false && th.before.every((b) => b !== null), j(th));
  p.check('once the weekly roster has joined, the thumbnails are drawn from the catalogue the title block counts', th.listed === th.tb && th.tb > 6000, j({ listed: th.listed, tb: th.tb, whys: th.whys, drawings: th.drawings }));

  // ---- 6. the log: a tally that never wraps, long names, a refusal in view ----
  const many = await call(names, 700, 1000, false), longest = await call(names, 5, 0, true);
  const t9 = Date.now();
  await call(rawWrite, { overdue: { planet: null, place: null }, log: { saved: [...longest.map((n, i) => ({ name: n, t: t9 - i, view: 'orbit' })), ...many.slice(0, 195).map((n, i) => ({ name: n, t: t9 - 10 - i, view: 'orbit' }))], visits: many.slice(0, 500).map((n, i) => ({ name: n, t: t9 - i * 1000, via: 'search', n: 1 })), pins: [], dropped: 1234 } });
  await open(`log=${encodeURIComponent(many.slice(600, 624).join('|'))}&p=${encodeURIComponent(many[650])}`);
  await p.until('/1,735 visited/.test(document.getElementById("log-line").textContent)', 8000);   // the link's world is one visit more
  const ty = await call(tally);
  p.check('the log line is a tally that keeps one line at any count, its words whole and inside the screen, with its marks where they fit', ty.lines === 1 && !ty.clipped && ty.right <= ty.iw && (phone || (ty.marks > 0 && ty.kept > 0)) && /^Log: 1,735 visited, 200 saved, 24 shared with you$/.test(ty.text), j(ty));
  await p.ev('(scrollTo(0, 0), true)'); await p.sleep(300);
  const addTop = await p.ev('document.querySelector("[data-act=log]").getBoundingClientRect().top');
  await p.ev('document.querySelector("[data-act=log]").click()');
  await p.until('!!document.querySelector(".tp-said").textContent', 6000);
  const sd = await call(said);
  await p.shot(`shapes-${width}-refusal`);
  if (!phone) p.check('a refusal under "Add to log" is in view at 1440, under the button, without a scroll', /was not added: the log holds 200 saved worlds/.test(sd.text) && sd.under && sd.bottom <= sd.ih && sd.scrollY === 0 && addTop < sd.ih, j(sd));
  else p.check('a refusal under "Add to log" stands under the button', /was not added: the log holds 200 saved worlds/.test(sd.text) && sd.under, j(sd));
  await p.ev('document.getElementById("log-line").click()'); await p.sleep(600);
  const rows = await call(longRows);
  await p.shot(`shapes-${width}-log`);
  const lw = await p.ev('document.documentElement.scrollWidth > innerWidth + 1');
  p.check('in the log\'s saved rows the five longest names in the catalogue keep one line each, and the dialog fits', rows.slice(0, 5).length === 5 && rows.slice(0, 5).every((r) => r.lines === 1) && !lw, j(rows.slice(0, 5)));
  await p.ev('document.querySelector("[data-close=log]").click()');
  await call(rawWrite, { overdue: { planet: null, place: null }, log: { saved: [], visits: [], pins: [], dropped: 0 } });

  // ---- 4. the filled action turns gold when the world is in the log ----
  await open(`p=${encodeURIComponent('Kepler-442 b')}`);
  const f0 = await p.ev('(() => { const b = document.querySelector("[data-act=log]"), s = getComputedStyle(b); return { kept: b.classList.contains("kept"), bg: s.backgroundColor, bc: s.borderTopColor, w: Math.round(b.getBoundingClientRect().width) }; })()');
  await p.ev('document.querySelector("[data-act=log]").click()');
  await p.until('document.querySelector("[data-act=log]").classList.contains("kept")', 6000);
  const f1 = await p.ev('(() => { const b = document.querySelector("[data-act=log]"), s = getComputedStyle(b); return { kept: b.classList.contains("kept"), bc: s.borderTopColor, text: b.textContent, w: Math.round(b.getBoundingClientRect().width) }; })()');
  const tk = await call(tally);
  // and the kept world's point on the diagram is the one gold the diagram draws (none while it was not kept: the invariant)
  await p.sleep(300);
  const keptPx = await p.ev('(() => { const c = document.querySelector("#v-plot canvas.plot-cv"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 90 && Math.abs(d[i] - 212) <= 22 && Math.abs(d[i + 1] - 162) <= 22 && Math.abs(d[i + 2] - 76) <= 22) n++; return n; })()');
  p.check('once the chosen world is kept, its point on the catalogue diagram turns gold', keptPx > 0, `${keptPx} gold pixels`);
  p.check('"Add to log" is filled, turns to the gold of a kept clock once the world is in the log, at the same width, and the tally gains a tall gold mark', !f0.kept && !gold.includes(f0.bg) && f1.kept && gold.includes(f1.bc) && f1.text === 'In your log' && f1.w === f0.w && tk.kept === 1, j({ f0, f1, tk }));
  await p.ev('document.querySelector("[data-act=log]").click()');
  await p.until('!document.querySelector("[data-act=log]").classList.contains("kept")', 6000);

  // ---- 8. reach ----
  const rc = await call(reach);
  p.check('a global rule stills every animation and transition under reduced motion', rc.rm, j(rc));
  // under reduced motion the page shows its finished frame: once it has settled it asks for no frame at all
  await p.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await open(`p=${encodeURIComponent('Kepler-442 b')}`, { still: false });
  await p.until('document.body.classList.contains("ready") && !(window.__exoEngine && window.__exoEngine.building())', 60000);
  await p.ev('new Promise((r) => setTimeout(r, 2500))');
  const rm0 = await p.ev('({ n: window.__rafAsked, veil: document.getElementById("veil").classList.contains("gone"), motion: matchMedia("(prefers-reduced-motion: reduce)").matches })');
  await p.ev('new Promise((r) => setTimeout(r, 2000))');
  const rm1 = await p.ev('window.__rafAsked');
  p.check('under reduced motion the page settles on its finished frame and then asks for no animation frame', rm0.motion && rm0.veil && rm1 === rm0.n, j({ ...rm0, after: rm1 }));
  await p.media([]);
  await p.ev('(document.activeElement && document.activeElement.blur(), scrollTo(0, 0), true)');
  await p.key('Tab');
  const sk = await p.ev('({ cls: document.activeElement.className, text: document.activeElement.textContent, href: document.activeElement.getAttribute("href") })');
  await p.key('Enter'); await p.sleep(300);
  const sk2 = await p.ev('document.activeElement.id');
  p.check('the first Tab shows a link that skips to the survey, and Enter takes the focus there', sk.cls === 'skip' && /Skip to the survey/.test(sk.text) && sk2 === 'survey', `${j(sk)} then ${sk2}`);
}
