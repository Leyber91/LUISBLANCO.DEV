// Which rocky worlds keep air: the article and the line under the planet's name. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/air.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 600
//   and again at --width 390 --height 844
//
// The rules of tools/drives/invariants.mjs hold after every step (the survey's gold list from shapes.mjs). The article
// loads clean, fits the width, carries its seventeen planets, and keeps the design revision of
// 2026-11-16 (upright names, no middle dots, no tracked capitals). On the survey: the line under the name is a short
// account of at most two lines, with the scenarios and their sources in a disclosure under it whose summary is a
// 44 px target on a phone; a scenario of the same look switches in one frame, says it was chosen and keeps the
// disclosure open; a link offered for another world does nothing; and where the browser cannot build a look in the
// background, only scenarios whose look is built are links.

import { standard } from './invariants.mjs';
import { SURVEY_GOLD, SURVEY_COVER } from './shapes.mjs';

// the survey's own gold (shapes.mjs says why each is allowed), and on the article the status word "observed" of a
// planet's scenarios, gold for the same reason as under the planet's name
const GOLD = { ...SURVEY_GOLD, allow: [...SURVEY_GOLD.allow, '.obs-sc .st-observed'] };

// Sheet A's corner blocks (the upper left, the inset, the key, the title block) and the line under the world do not
// overlap, nor does the open "scenarios and sources" lie over the inset, the key or the title block (the review of
// 8de5af2, F1: opened at 1440 the details grew the upper-left block until the world was a 3 px band and its line sat
// in the key; air.mjs had read the details' words and not their geometry). The line under the world is measured by
// its text; the open details lie over the world and its line by design. Kept here, not in invariants.mjs, while that
// file is being changed on another branch (tools/invariants-selftest).
const CORNERS = `(() => {
  const shown = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const box = (q) => { const e = document.querySelector(q); if (!shown(e)) return null; let r = e.getBoundingClientRect();
    if (q === '#bezel') { const g = document.createRange(); g.selectNodeContents(e); r = g.getBoundingClientRect(); }
    return r.width > 0.5 && r.height > 0.5 ? r : null; };
  const pairs = [['#ul', '#inset-wrap'], ['#ul', '#key'], ['#ul', '#tblock'], ['#ul', '#bezel'], ['#inset-wrap', '#key'], ['#inset-wrap', '#tblock'],
    ['#inset-wrap', '#bezel'], ['#key', '#tblock'], ['#key', '#bezel'], ['#tblock', '#bezel'],
    ['#ret-render .ret-more[open] .ret-more-body', '#inset-wrap'], ['#ret-render .ret-more[open] .ret-more-body', '#key'], ['#ret-render .ret-more[open] .ret-more-body', '#tblock']];
  const out = [];
  for (const [p, q] of pairs) {
    const a = box(p), c = box(q); if (!a || !c) continue;
    const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
    if (w > 0.5 && h > 0.5) out.push(p.replace('#ret-render .ret-more[open] .ret-more-body', 'the open details') + ' and ' + q + ' overlap by ' + Math.round(w) + 'x' + Math.round(h) + ' px');
  }
  return out;
})()`;
const GEOMETRY = `(() => { const R = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
  return { ul: R('#ul'), live: R('#live'), bezelY: getComputedStyle(document.getElementById('exo-stage')).getPropertyValue('--bezel-y').trim() }; })()`;

const sel = (n) => `((document.getElementById('ret-name') || {}).textContent || '').trim() === ${JSON.stringify(n)} && document.body.classList.contains('ready') && !document.getElementById('exo-note')`;
const shortOf = `(document.querySelector('#ret-render .ret-air') || {}).textContent || ''`;
const moreOf = `(document.querySelector('#ret-render .ret-more-body') || {}).textContent || ''`;
const links = `[...document.querySelectorAll('#ret-render a[data-air]')].map((a) => a.dataset.air + ':' + a.dataset.world)`;
const measure = `(() => { const s = document.querySelector('#ret-render .ret-air'), m = document.querySelector('#ret-render .ret-more');
  const lh = parseFloat(getComputedStyle(s).lineHeight), sum = m.querySelector('summary').getBoundingClientRect();
  return { lines: Math.round(s.getBoundingClientRect().height / lh * 100) / 100, open: m.open, summaryH: Math.round(sum.height), text: s.textContent }; })()`;
// the five worlds the review read, and the catalogue's longest short line (air.test.mjs checks it is the longest)
const WORLDS = ['LHS 3844 b', 'TRAPPIST-1 e', 'Proxima Cen b', '55 Cnc e', 'Kepler-442 b', 'EPIC 201238110 b'];
const slug = (n) => n.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();

export default async function air(p, { base, width }) {
  // after every step, on both pages: no sideways scroll, 44 px targets at 390, text at 4.5 to 1, gold where allowed
  for (const [name, expr] of standard({ gold: GOLD, targets: { cover: SURVEY_COVER } })) p.invariant(name, expr);
  p.invariant('invariant: sheet A\'s corner blocks and the line under the world do not overlap, the details open or closed', CORNERS);
  p.frames();   // and no fully transparent pixel in any frame captured (tools/drive.mjs frames)

  // ---- the article ----
  await p.go(`${base}/labs/exomania-air.html`);
  await p.until('document.fonts && document.fonts.status === "loaded"', 15000);
  await p.sleep(600);
  const a = await p.ev(`(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth,
    plates: document.querySelectorAll('.plate-sec').length, obs: document.querySelectorAll('article.obs').length, drawn: document.querySelectorAll('.obs-sc li.drawn').length,
    quotes: document.querySelectorAll('.obs-quotes li').length,
    dots: ((document.querySelector('main').innerText + document.querySelector('.foot').innerText).match(/\\u00b7/g) || []).length,
    world: getComputedStyle(document.querySelector('.world')).fontStyle, h2: getComputedStyle(document.querySelector('.plate-sec h2')).fontFamily,
    caps: [...document.querySelectorAll('main *')].filter((e) => getComputedStyle(e).textTransform === 'uppercase' && !e.closest('.tg') && e.textContent.trim()).length,
    gold: [...document.querySelectorAll('main *')].filter((e) => /212, 162, 76|240, 198, 116/.test(getComputedStyle(e).color) && e.textContent.trim()).map((e) => e.className).filter((c, i, x) => x.indexOf(c) === i),
    statuses: [...new Set([...document.querySelectorAll('.obs-sc .st')].map((e) => e.textContent))].sort().join(' ') }))()`);
  p.check(`the article at ${width} px has no sideways scroll`, a.sw <= a.iw, `${a.sw} against ${a.iw}`);
  p.check('nine plates, seventeen planets, one scenario drawn for each, the papers\' words beside them', a.plates === 9 && a.obs === 17 && a.drawn === 17 && a.quotes >= 40, `${a.plates} ${a.obs} ${a.drawn} ${a.quotes}`);
  p.check('the four statuses are in use', a.statuses === 'allowed disfavoured excluded observed', a.statuses);
  p.check('no middle dot, world names upright, section titles in Fraunces, no tracked capitals', a.dots === 0 && a.world === 'normal' && /Fraunces/.test(a.h2) && a.caps === 0, JSON.stringify({ dots: a.dots, world: a.world, caps: a.caps }));
  p.check('gold marks only an observed status', a.gold.length > 0 && a.gold.every((c) => /st-observed/.test(c)), a.gold.join(' | '));
  await p.shot(`air-article-${width}`);

  // ---- the short line stays within two lines, closed, for the five worlds and the longest case ----
  const tall = [];
  for (const n of WORLDS) {
    await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent(n)}`);
    await p.until(sel(n), 90000);
    await p.sleep(2500);
    const m = await p.ev(measure);
    tall.push(`${n} ${m.lines}${m.open ? ' open' : ''} ${m.summaryH}px`);
    if (m.lines > 2.05 || m.open || (width < 700 && m.summaryH < 44)) tall.push('  ^ fails');
    if (['LHS 3844 b', 'TRAPPIST-1 e', 'Kepler-442 b'].includes(n)) await p.shot(`air-line-${slug(n)}-${width}`);
  }
  p.check(`closed, the line is at most two lines at ${width} px and its summary is a ${width < 700 ? '44 px' : 'visible'} target`, !tall.some((t) => /fails/.test(t)), tall.join('; '));

  // ---- the details: open them, then a switch within one look ----
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('LHS 3844 b')}`);
  await p.until(sel('LHS 3844 b'), 90000);
  await p.sleep(2500);
  const s1 = await p.ev(shortOf);
  p.check('the short line: drawn, why, and the chance of air with its range', /^Air: drawn as bare rock, from its paper\. Chance of air [\d.]+% \([\d.]+ to [\d.]+%\)\.$/.test(s1), s1);
  await p.ev(`document.querySelector('.los-consent') && document.querySelector('.los-consent').remove(), true`);   // the sharing question, answered in this tab only
  const g0 = await p.ev(GEOMETRY);
  await p.ev(`document.querySelector('#ret-render .ret-more summary').click()`);
  await p.sleep(2500);   // a resize of a block above the world reframes it on the next frame; wait past it
  const g1 = await p.ev(GEOMETRY);
  if (width > 1100) p.check('opened on a desk, the details leave the upper-left block, the radius line and the world\'s line where they were', JSON.stringify(g0) === JSON.stringify(g1), `${JSON.stringify(g0)} then ${JSON.stringify(g1)}`);
  else p.check('opened on a phone, the details push what follows down and leave the world\'s line in its frame', g1.ul[1] > g0.ul[1] && g1.bezelY === g0.bezelY, `${JSON.stringify(g0)} then ${JSON.stringify(g1)}`);
  const d1 = await p.ev(`({ open: document.querySelector('#ret-render .ret-more').open, more: ${moreOf}, links: ${links} })`);
  p.check('opened, the details give the conclusion, what each disfavoured scenario is disfavoured for, the papers, the fit and the article', d1.open && /^Drawn as bare rock\. Its paper concludes: “/.test(d1.more) && / Thick air disfavoured for any air from 10 bar, by energy balance \(Kreidberg 2019\)/.test(d1.more) && / Chance it kept an atmosphere, by the 2026 fit, extrapolated: [\d.]+% \(68% range /.test(d1.more) && /How the survey decides$/.test(d1.more) && JSON.stringify(d1.links) === JSON.stringify(['thin:LHS 3844 b', 'thick:LHS 3844 b']), JSON.stringify(d1));
  await p.shot(`air-details-lhs-3844-b-${width}`);

  // on the ground the key grows by the ground panel and the band above it falls under 120 px: the world keeps its
  // framing, and its line, which the ground hides (exoplanet.css), is still placed above the key, the details open or
  // closed, so it never shows inside the key (the corner rule runs after each wait and skips hidden text; the first
  // build of 2026-11-16's guard kept the line where the orbit had it, 144 px inside the grown key)
  const lineKey = `(() => { const k = document.getElementById('key').getBoundingClientRect(), g = document.createRange(); g.selectNodeContents(document.getElementById('bezel'));
    const b = g.getBoundingClientRect(); return { key: Math.round(k.top), line: [Math.round(b.top), Math.round(b.bottom)], shown: getComputedStyle(document.getElementById('bezel')).visibility, open: document.querySelector('#ret-render .ret-more').open }; })()`;
  await p.ev(`document.querySelector('[data-cam="surface"]').click()`);
  const landed = await p.until(`!document.getElementById('ground').hidden && /surface/i.test(document.getElementById('bezel').textContent) && !document.getElementById('exo-note')`, 180000);
  await p.sleep(2500);
  const gOpen = await p.ev(lineKey);
  await p.shot(`air-ground-lhs-3844-b-${width}`);
  await p.ev(`document.querySelector('#ret-render .ret-more summary').click()`);
  await p.sleep(2500);
  const gShut = await p.ev(lineKey);
  if (width > 1100) p.check('landed on a desk, the line under the world (hidden on the ground) is placed above the grown key, the details open and closed', landed && gOpen.open && !gShut.open && gOpen.line[1] <= gOpen.key && gShut.line[1] <= gShut.key, `${JSON.stringify(gOpen)} then ${JSON.stringify(gShut)}`);
  else p.check('landed on a phone, the ground comes up', landed, JSON.stringify(gShut));
  await p.ev(`document.querySelector('[data-cam="orbit"]').click()`);
  await p.sleep(1500);

  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('GJ 367 b')}`);
  await p.until(sel('GJ 367 b'), 90000);
  await p.sleep(3000);
  await p.ev(`document.querySelector('#ret-render .ret-more summary').click()`);
  await p.sleep(300);
  const sw = await p.ev(`new Promise((done) => {
    const a = document.querySelector('#ret-render a[data-air="thin"]');
    if (!a) { done({ missing: true }); return; }
    let prev = performance.now(), worst = 0, note = false; const t0 = prev;
    const tick = (t) => { worst = Math.max(worst, t - prev); prev = t; if (document.getElementById('exo-note')) note = true;
      if (t - t0 > 800) { done({ worst: Math.round(worst), note, short: ${shortOf}, more: ${moreOf}, open: document.querySelector('#ret-render .ret-more').open }); return; } requestAnimationFrame(tick); };
    a.click(); requestAnimationFrame(tick);
  })`);
  await p.sleep(400);
  p.check('a switch within one look (molten) draws at once, says it was chosen, keeps the details open and goes into the address', !sw.missing && !sw.note && sw.worst < 250 && sw.open && /^Air: drawn with thin air, by your choice\./.test(sw.short) && /^Drawn with thin air, though disfavoured for /.test(sw.more) && /the survey draws bare rock\./.test(sw.more) && /air=thin/.test(await p.ev('location.search')), JSON.stringify(sw).slice(0, 400));
  // a link offered for another world (a flight in between) does nothing
  const stale = await p.ev(`(() => { const a = document.createElement('a'); a.href = '#'; a.dataset.air = 'bare'; a.dataset.world = 'TRAPPIST-1 e';
    document.querySelector('#ret-render .ret-more-body').append(a); const before = ${shortOf}; a.click();
    return { same: ${shortOf} === before }; })()`);
  await p.sleep(400);
  p.check('a scenario link offered for another world changes nothing', stale.same && /air=thin/.test(await p.ev('location.search')), JSON.stringify(stale));

  // ---- a browser that cannot build in the background ----
  await p.before(`(() => { const hide = (C) => { if (!C) return; const g = C.prototype.getExtension; C.prototype.getExtension = function (n) { return n === 'KHR_parallel_shader_compile' ? null : g.call(this, n); }; };
    hide(window.WebGLRenderingContext); hide(window.WebGL2RenderingContext); })()`);
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('LHS 3844 b')}`);
  await p.until(sel('LHS 3844 b'), 120000);
  await p.sleep(3000);
  const held = await p.ev(`({ links: ${links}, more: ${moreOf} })`);
  p.check('without background builds, scenarios whose look is not built are not links, and the details say why', held.links.length === 0 && / Some scenarios are not a link here: this browser would build its look on the page's thread\./.test(held.more), JSON.stringify(held).slice(0, 300));
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('GJ 367 b')}`);
  await p.until(sel('GJ 367 b'), 120000);
  await p.sleep(3000);
  p.check('a scenario whose look is built (molten, the one drawn) stays a link', JSON.stringify(await p.ev(links)) === JSON.stringify(['thin:GJ 367 b']), JSON.stringify(await p.ev(links)));
}
