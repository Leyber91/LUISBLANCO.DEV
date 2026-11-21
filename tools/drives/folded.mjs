/* ============================================================
   tools/drives/folded.mjs: Folded Space's first slice (Dimensions, level 1, BAR_L1.md), by hand.

   Run by `node tools/labs-wt.mjs drive dimensions --tree folded --scenario tools/drives/folded.mjs`, at a desktop
   and a phone width. It proves:
   - the page loads the network and draws the exact cells with the certificate holding, at rest, before any press;
   - a call on the corner that changes the answer is marked right, the tally counts it, and the run is drawn with
     one tick per wall the title block counts;
   - a second call on another drawing is marked by what its corner was read as, whichever way that falls;
   - the plate's labels stay readable at every width (the bar sheet's defect at 390).
   ============================================================ */

export default async function folded(p, { base }) {
  await p.go(`${base}/labs/folded.html`);
  p.check('the page loads the network and is ready', await p.until('document.body.dataset.state === "ready"', 30000));
  const at = () => p.ev(`(() => { const d = document.body.dataset; return { cells: +d.cells, walls: +d.walls, cert: +d.cert, answer: +d.answer,
    runs: document.querySelectorAll('#plate line.run').length, ticks: document.querySelectorAll('#plate line.tick').length,
    polys: document.querySelectorAll('#plate polygon.wall').length, tally: document.getElementById('tally').textContent,
    verdict: document.getElementById('verdict').textContent, cands: document.querySelectorAll('#cands button').length }; })()`);
  const s0 = await at();
  p.check('at rest the plate shows its exact cells, certified, with no run yet', s0.cells > 0 && s0.polys === s0.cells && s0.cert === 0 && s0.runs === 0, `${s0.cells} cells, ${s0.polys} drawn, certificate failures ${s0.cert}, runs ${s0.runs}`);
  p.check('three candidates wait for a call, and the tally is empty', s0.cands === 3 && /^Calls right: 0 of 0$/.test(s0.tally), `${s0.cands} candidates, "${s0.tally}"`);
  const rest = await p.ev(`(() => ({ labels: [...document.querySelectorAll('#cands .cl')].map((x) => x.textContent), tpl: document.getElementById('tplbox').hidden,
    next: document.getElementById('nextline').tagName + ' ' + document.getElementById('nextline').getAttribute('href'),
    kact: ['next', 'clear'].map((id) => document.getElementById(id).className + ':' + !!document.querySelector('#' + id + ' kbd.key')).join(' '),
    ledgernote: !document.getElementById('ledgernote').hidden && document.getElementById('ledgernote').textContent }))()`);
  p.check('before the call the corners are named by place only, and the template is not shown', rest.labels.join('|') === 'Corner 1|Corner 2|Corner 3' && rest.tpl === true, rest.labels.join(', '));
  p.check('the next action is a link to the call', rest.next === 'A #call', rest.next);
  p.check('Next and Clear are the kit\u2019s keycap actions', rest.kact === 'kact:true kact:true', rest.kact);
  p.check('the empty ledger says what fills it', /^Harden the network to fill this table/.test(rest.ledgernote || ''), rest.ledgernote);
  const earlier = await p.ev(`(async () => { const a = document.querySelector('.earlier a'); if (!a) return null; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); const res = await fetch(a.getAttribute('href'), { method: 'HEAD' }); return { href: a.getAttribute('href'), h: r.height, w: r.width, inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth, status: res.status }; })()`);
  p.check('the seed page stays one link away, in view and a 44 px target', !!earlier && earlier.href === 'md_animation_page.html' && earlier.status === 200 && earlier.inView && earlier.h >= 44, earlier ? `${earlier.href} ${earlier.status}, ${Math.round(earlier.w)} by ${Math.round(earlier.h)} px` : 'no link');
  await p.ev('window.scrollTo(0, 0)');
  await p.shot('01-at-rest');

  const centre = (sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()`);
  const t = await centre('#cands button[data-kind="template"]');
  p.check('the template candidate is a target of at least 44 px', !!t && t.h >= 44, t ? `${Math.round(t.h)} px` : 'not found');
  await p.click(t.x, t.y); await p.sleep(300);
  const s1 = await at();
  const res = await p.ev(`[...document.querySelectorAll('#cands button')].map((b) => ({ kind: b.dataset.kind, text: b.querySelector('.cr').textContent, fired: b.querySelector('.cr').classList.contains('fired'), off: b.disabled }))`);
  const tRes = res.find((r) => r.kind === 'template');
  p.check('the call on the sharpest corner is marked right, and the tally counts it', /^Right\./.test(s1.verdict) && /^Calls right: 1 of 1$/.test(s1.tally) && tRes.fired, `"${s1.verdict}" "${s1.tally}" ${tRes.text}`);
  p.check('the run is drawn with one tick per wall the title block counts', s1.runs === 1 && s1.ticks === s1.walls && s1.walls > 0, `${s1.ticks} ticks, ${s1.walls} walls`);
  p.check('after the call every candidate shows what it was read as, and none can be pressed again', res.every((r) => r.off && /read as \d/.test(r.text)), res.map((r) => `${r.kind}: ${r.text}`).join('; '));
  const lab = await p.ev(`(() => { const a = document.getElementById('pl-from'), b = document.getElementById('pl-to'); return { a: parseFloat(getComputedStyle(a).fontSize), b: parseFloat(getComputedStyle(b).fontSize), text: b.textContent }; })()`);
  p.check('the plate’s labels are 12 px or more at this width', lab.a >= 12 && lab.b >= 12 && /read \d/.test(lab.text), `${lab.a} px and ${lab.b} px, "${lab.text}"`);
  p.check('after the call the corners carry their names and the template is shown with its sentence', await p.ev(`[...document.querySelectorAll('#cands .cl')].some((x) => /template/.test(x.textContent)) && !document.getElementById('tplbox').hidden && /score for [0-9] against [0-9] is this picture/.test(document.getElementById('tplnote').textContent)`));
  const why = await p.ev(`({ v: document.getElementById('verdict').textContent, prov: document.getElementById('prov').textContent })`);
  p.check('the verdict says why, from computed values', /^Right[.] This corner changes the answer to [0-9][.] It raised [0-9]'s score over [0-9]'s by -?[0-9]+[.][0-9] [(]the cell.s map predicted -?[0-9]+[.][0-9][)], the most of the three[.]$/.test(why.v), why.v);
  p.check('the network names its source, its test accuracy and its file version', /^The network: 784, 64, 64, 10 neurons, ReLU, trained on MNIST [(]Yann LeCun, Corinna Cortes and Christopher J[.]C[.] Burges; yann[.]lecun[.]com.exdb.mnist[)][.] Test accuracy 96[.]71% on MNIST.s 10,000 test digits, as recorded in its file[.] File version [0-9a-f]{12}[.] .REAL.$/.test(why.prov), why.prov);
  await p.shot('02-called-right');

  const nx = await centre('#next');
  await p.click(nx.x, nx.y);
  p.check('the next drawing gets a fresh call', await p.until('document.querySelectorAll("#plate line.run").length === 0 && !document.getElementById("verdict").textContent', 10000));
  const r2 = await centre('#cands button[data-kind="random"]');
  await p.click(r2.x, r2.y); await p.sleep(300);
  const s2 = await at();
  const res2 = await p.ev(`[...document.querySelectorAll('#cands button')].find((b) => b.dataset.kind === 'random').querySelector('.cr').textContent`);
  const changed = !/still read as/.test(res2);
  const anyChanged = await p.ev(`[...document.querySelectorAll('#cands .cr')].some((c) => c.classList.contains('fired'))`);
  const expect = !anyChanged ? /not counted/ : changed ? /^Right\./ : /^Not this one\./;
  p.check('the second call is marked by what its corner was read as', expect.test(s2.verdict), `random corner: ${res2}; verdict "${s2.verdict}"; tally "${s2.tally}"`);
  await p.shot('03-second-call');

  // The product rungs of level 1 and 2 the page carries (atlas reach.2, interface.2.1, orientation.2, records.1 and 2.4).
  p.check('both calls are kept by the store', await p.until('document.body.dataset.kept === "2"', 10000), await p.ev('document.getElementById("health").textContent'));
  const rungs = await p.ev(`(() => {
    const rm = [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.media && /prefers-reduced-motion: reduce/.test(r.media.mediaText) && /\\*/.test(r.cssText) && /animation-duration/.test(r.cssText)); } catch { return false; } });
    const font = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
    const skip = document.querySelector('a.skip');
    return { rm, fontMedia: font && font.getAttribute('media'), skip: skip && skip.getAttribute('href'), next: document.getElementById('nextline').textContent, health: document.getElementById('health').textContent };
  })()`);
  p.check('one global rule collapses animations and transitions under reduced motion', rungs.rm);
  p.check('the fonts load without blocking first paint', rungs.fontMedia === 'print' || rungs.fontMedia === 'all', `media ${rungs.fontMedia}`);
  p.check('a skip link jumps to the call', rungs.skip === '#call', rungs.skip);
  p.check('the page names one next action', /^Next: [^.]+\.$/.test(rungs.next), rungs.next);
  p.check('the health line names the record version, what is kept and where', /^Record version 2: 2 calls, 1 action, \d+ drawings?, \d+ ledger rows?, (kept in this browser|kept only until this tab closes)/.test(rungs.health), rungs.health);

  await p.go(`${base}/labs/folded.html`);
  p.check('after a reload the calls are read back from the store', await p.until('document.body.dataset.state === "ready" && document.body.dataset.kept === "2"', 20000), await p.ev('document.getElementById("health").textContent'));
  const t3 = await p.ev('document.getElementById("tally").textContent');
  p.check('and the tally is drawn from them, its words whole', /^Calls right: 1 of [12]$/.test(t3), t3);
  await p.shot('04-after-reload');
}
