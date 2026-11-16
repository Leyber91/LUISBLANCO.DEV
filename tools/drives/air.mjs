// Which rocky worlds keep air: the article and the line under the planet's name. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/air.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 600
//   and again at --width 390 --height 844
//
// The article loads clean, fits the width, carries its seventeen planets, and keeps the design revision of
// 2026-11-16 (upright names, no middle dots, no tracked capitals). On the survey: the line under the name is
// sentences with the odds and their range; a scenario of the same look switches in one frame and says it was
// chosen; a link offered for another world does nothing; and where the browser cannot build a look in the
// background, only scenarios whose look is built are links.

const sel = (n) => `((document.getElementById('ret-name') || {}).textContent || '').trim() === ${JSON.stringify(n)} && document.body.classList.contains('ready') && !document.getElementById('exo-note')`;
const lineOf = `(document.querySelector('#ret-render .ret-air') || {}).textContent || ''`;
const links = `[...document.querySelectorAll('#ret-render .ret-air a[data-air]')].map((a) => a.dataset.air + ':' + a.dataset.world)`;

export default async function air(p, { base, width }) {
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

  // ---- the line under the name, and a switch within one look ----
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('LHS 3844 b')}`);
  const up = await p.until(sel('LHS 3844 b'), 90000);
  await p.sleep(3000);
  const l1 = await p.ev(lineOf);
  p.check('the line is sentences: drawn, statuses, observers, the odds of what the fit counts with their range, the article', up && /^Drawn as bare rock\. Thin air and thick air disfavoured\. Observed by Kreidberg 2019 and Zieba 2026\. The 2026 fit, extrapolated: chance it kept an atmosphere the fit counts \(thicker than about 1 to 10 bar\) [\d.]+%, 68% range [\d.]+ to [\d.]+%\. The rest is bare rock or thin air\. How the survey decides$/.test(l1) && !/·/.test(l1), l1);
  p.check('both open scenarios are links for this world', JSON.stringify(await p.ev(links)) === JSON.stringify(['thin:LHS 3844 b', 'thick:LHS 3844 b']), JSON.stringify(await p.ev(links)));
  await p.shot(`air-line-lhs-3844-b-${width}`);

  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('GJ 367 b')}`);
  await p.until(sel('GJ 367 b'), 90000);
  await p.sleep(3000);
  const sw = await p.ev(`new Promise((done) => {
    const a = document.querySelector('#ret-render a[data-air="thin"]');
    if (!a) { done({ missing: true }); return; }
    let prev = performance.now(), worst = 0, note = false; const t0 = prev;
    const tick = (t) => { worst = Math.max(worst, t - prev); prev = t; if (document.getElementById('exo-note')) note = true;
      if (t - t0 > 800) { done({ worst: Math.round(worst), note, line: document.querySelector('#ret-render .ret-air').textContent, url: location.search }); return; } requestAnimationFrame(tick); };
    a.click(); requestAnimationFrame(tick);
  })`);
  await p.sleep(400);
  p.check('a switch within one look (molten) draws at once, says it was chosen and goes into the address', !sw.missing && !sw.note && sw.worst < 250 && /^Drawn with thin air, though disfavoured, by your choice; the survey draws bare rock\./.test(sw.line) && /air=thin/.test(await p.ev('location.search')), JSON.stringify(sw));
  // a link offered for another world (a flight in between) does nothing
  const stale = await p.ev(`(() => { const a = document.createElement('a'); a.href = '#'; a.dataset.air = 'bare'; a.dataset.world = 'TRAPPIST-1 e';
    document.querySelector('#ret-render .ret-air').append(a); const before = document.querySelector('#ret-render .ret-air').textContent; a.click();
    return { same: document.querySelector('#ret-render .ret-air').textContent === before }; })()`);
  await p.sleep(400);
  p.check('a scenario link offered for another world changes nothing', stale.same && /air=thin/.test(await p.ev('location.search')), JSON.stringify(stale));

  // ---- a browser that cannot build in the background ----
  await p.before(`(() => { const hide = (C) => { if (!C) return; const g = C.prototype.getExtension; C.prototype.getExtension = function (n) { return n === 'KHR_parallel_shader_compile' ? null : g.call(this, n); }; };
    hide(window.WebGLRenderingContext); hide(window.WebGL2RenderingContext); })()`);
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('LHS 3844 b')}`);
  await p.until(sel('LHS 3844 b'), 120000);
  await p.sleep(3000);
  const held = await p.ev(`({ links: ${links}, line: ${lineOf} })`);
  p.check('without background builds, scenarios whose look is not built are not links, and the line says why', held.links.length === 0 && /^Drawn as bare rock\. Thin air and thick air disfavoured\./.test(held.line) && / Some scenarios are not a link here: this browser would build its look on the page's thread\./.test(held.line), JSON.stringify(held));
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('GJ 367 b')}`);
  await p.until(sel('GJ 367 b'), 120000);
  await p.sleep(3000);
  p.check('a scenario whose look is built (molten, the one drawn) stays a link', JSON.stringify(await p.ev(links)) === JSON.stringify(['thin:GJ 367 b']), JSON.stringify(await p.ev(links)));
}
