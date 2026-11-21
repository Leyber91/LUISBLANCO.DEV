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
  p.check('three candidates wait for a call, and the tally is empty', s0.cands === 3 && /Calls right: 0 of 0/.test(s0.tally), `${s0.cands} candidates, "${s0.tally}"`);
  await p.shot('01-at-rest');

  const centre = (sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()`);
  const t = await centre('#cands button[data-kind="template"]');
  p.check('the template candidate is a target of at least 44 px', !!t && t.h >= 44, t ? `${Math.round(t.h)} px` : 'not found');
  await p.click(t.x, t.y); await p.sleep(300);
  const s1 = await at();
  const res = await p.ev(`[...document.querySelectorAll('#cands button')].map((b) => ({ kind: b.dataset.kind, text: b.querySelector('.cr').textContent, fired: b.querySelector('.cr').classList.contains('fired'), off: b.disabled }))`);
  const tRes = res.find((r) => r.kind === 'template');
  p.check('the call on the sharpest corner is marked right, and the tally counts it', /^Right\./.test(s1.verdict) && /Calls right: 1 of 1/.test(s1.tally) && tRes.fired, `"${s1.verdict}" "${s1.tally}" ${tRes.text}`);
  p.check('the run is drawn with one tick per wall the title block counts', s1.runs === 1 && s1.ticks === s1.walls && s1.walls > 0, `${s1.ticks} ticks, ${s1.walls} walls`);
  p.check('after the call every candidate shows what it was read as, and none can be pressed again', res.every((r) => r.off && /read as \d/.test(r.text)), res.map((r) => `${r.kind}: ${r.text}`).join('; '));
  const lab = await p.ev(`(() => { const a = document.getElementById('pl-from'), b = document.getElementById('pl-to'); return { a: parseFloat(getComputedStyle(a).fontSize), b: parseFloat(getComputedStyle(b).fontSize), text: b.textContent }; })()`);
  p.check('the plate’s labels are 12 px or more at this width', lab.a >= 12 && lab.b >= 12 && /read \d/.test(lab.text), `${lab.a} px and ${lab.b} px, "${lab.text}"`);
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
}
