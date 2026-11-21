/* ============================================================
   tools/drives/honesty-decoder.mjs — the Half-Life plate says what
   its data file says, at the width it is run at.

     node tools/labs-wt.mjs drive honesty-decoder

   Checked against assets/data/honesty-decoder/half-life.json, read
   by the page's own fetch: the heading's count; every sentence's
   strike and margin note under two settings of the controls, chosen
   by real presses; the readout following a pressed cell; no
   sideways scroll. It checks only what the plate states.
   ============================================================ */

const DATA = 'assets/data/honesty-decoder/half-life.json';

// What the plate must show for one wording and rule, computed from the file alone.
const EXPECT = `(async (w, r) => {
  const d = await (await fetch('${DATA}')).json();
  const newest = d.models[d.models.length - 1];
  const held = d.sentences.filter((s) => d.wordings.every((x) => d.rules.every((q) => s.deaths[x.id][q].kind === 'alive'))).length;
  const rows = d.sentences.map((s) => {
    const x = s.deaths[w][r];
    const m = x.kind === 'alive' ? null : d.models.find((y) => y.name === x.model);
    return { struck: !!m, note: m ? 'dead by ' + m.short + ', ' + m.released.slice(0, 7) : 'held through ' + newest.short + ', ' + newest.released.slice(0, 7) };
  });
  return { held, total: d.sentences.length, rows };
})`;
const SHOWN = `(() => [...document.querySelectorAll('#half-life .hl-row:not(.hl-cols)')].map((r) => ({
  struck: r.querySelector('.hl-say').classList.contains('struck'), note: r.querySelector('.hl-note').textContent })))()`;

async function press(p, selector) {
  const at = await p.ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (!at) return false;
  await p.click(at.x, at.y);
  await p.sleep(150);
  return true;
}

export default async function honestyDecoder(p, { base, width }) {
  await p.go(`${base}/labs/honesty-decoder.html?still`);
  const drawn = await p.until(`document.querySelectorAll('#half-life .hl-row:not(.hl-cols)').length === 10`);
  p.check('the plate draws ten sentences from its data file', drawn, await p.ev(`document.querySelector('#half-life').innerText.slice(0, 160)`));
  if (!drawn) return;

  const e1 = await p.ev(`${EXPECT}('w1', 'exact')`);
  const head = await p.ev(`document.querySelector('#hl-h').textContent`);
  p.check('the heading counts the sentences that held under every wording and scoring', head.startsWith(`${e1.held} of ${e1.total} things`) && head.includes('under every wording and scoring'), `${head} | expected ${e1.held} of ${e1.total}`);
  p.check('plain and exact: every strike and margin note is the file\'s', JSON.stringify(await p.ev(SHOWN)) === JSON.stringify(e1.rows), JSON.stringify(await p.ev(SHOWN)).slice(0, 300));

  // the code-like wording and partial scoring, by presses on the controls
  const okW = await press(p, '#half-life .hl-ctl .scale:first-child [data-value="w4"]');
  const okR = await press(p, '#half-life .hl-ctl .scale:last-child [data-value="partial"]');
  const e4 = await p.ev(`${EXPECT}('w4', 'partial')`);
  const s4 = await p.ev(SHOWN);
  p.check('code-like and partial, chosen by presses: every strike and margin note is the file\'s', okW && okR && JSON.stringify(s4) === JSON.stringify(e4.rows), JSON.stringify(s4).slice(0, 300));
  p.check('the change of wording moved a date the file says it moves', JSON.stringify(e4.rows) !== JSON.stringify(e1.rows), 'the two settings show the same notes');

  // a press on a cell puts that cell in the readout
  await press(p, '#half-life .hl-row:not(.hl-cols) .hl-cell[data-i="0"]');
  const out = await p.ev(`document.querySelector('#half-life .hl-readout').textContent`);
  const first = await p.ev(`(async () => { const d = await (await fetch('${DATA}')).json(); const c = d.sentences[0].cells.w4.partial[0]; return { name: d.models[0].name, k: c.k, n: c.n }; })()`);
  p.check('a pressed cell is the one the readout names, with its count', out.startsWith(`${first.name}, released`) && out.includes(`${first.k} of ${first.n} right`), out.slice(0, 200));

  // the foot's counts: the replies (both sets), and the models taken out, each from the file
  const foot = await p.ev(`document.querySelector('#half-life .hl-foot').innerText`);
  const fx = await p.ev(`(async () => { const d = await (await fetch('${DATA}')).json(); return { total: (d.replies.drawA + d.replies.drawB).toLocaleString('en-US'), a: d.replies.drawA.toLocaleString('en-US'), b: d.replies.drawB.toLocaleString('en-US'), removed: d.removed.map((m) => m.short) }; })()`);
  p.check('the foot gives both sets of replies and names every model taken out, from the file', foot.includes(`from ${fx.total} recorded replies`) && foot.includes(`${fx.a} to the questions above`) && foot.includes(`${fx.b} to a second set`) && fx.removed.every((n) => foot.includes(n)), foot);

  const wide = await p.ev('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  p.check(`no sideways scroll at ${width} px`, wide <= 0, `${wide} px too wide`);
  const errs = p.errors().filter((e) => !/labs-model-route|net::ERR_|Failed to fetch|429|rate limit/i.test(e));
  p.check('the console is clean', errs.length === 0, errs.slice(0, 2).join(' | ').slice(0, 300));
}
