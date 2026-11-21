/* ============================================================
   tools/drives/folded-harden.mjs: hardening on Folded Space's page (Dimensions, level 1; BAR_L1 parts 10 and 11).

   It proves, on the example 4 the page opens on:
   - the first call on its sharpest corner is right;
   - "Harden the network" runs in a worker to its last step, posting its steps, and the page stays live;
   - the flip ledger's row shows a larger smallest step after than before (the kill test measured 0.042 to 0.352 on
     this digit with its own run; the page's run differs in its batches, so only the direction is checked);
   - the second call is on the hardened network's own corners and is marked by what its corner was read as.
   ============================================================ */

export default async function harden(p, { base }) {
  await p.go(`${base}/labs/folded.html`);
  p.check('the page is ready on the example 4', await p.until('document.body.dataset.state === "ready" && document.body.dataset.answer === "4"', 30000));
  const centre = (sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()`);
  let t = await centre('#cands button[data-kind="template"]');
  await p.click(t.x, t.y); await p.sleep(300);
  p.check('the first call on the sharpest corner is right', /^Right\./.test(await p.ev('document.getElementById("verdict").textContent')));

  const h = await centre('#harden');
  p.check('Harden the network is a target of at least 44 px', !!h && h.h >= 44, h ? `${Math.round(h.h)} px` : 'not found');
  await p.click(h.x, h.y);
  p.check('hardening posts its steps while it runs', await p.until('+(document.body.dataset.hardenStep || 0) >= 50', 60000), await p.ev('document.getElementById("hardnote").textContent'));
  await p.shot('01-hardening');
  p.check('hardening reaches its last step', await p.until('document.body.dataset.hardened === "1"', 180000), await p.ev('document.getElementById("hardnote").textContent'));
  const led = await p.ev(`(() => ({ b: document.body.dataset.ledgerBefore, a: document.body.dataset.ledgerAfter, rows: document.querySelectorAll('#ledger tr').length, text: document.querySelector('#ledger tr')?.textContent }))()`);
  const before = Number(led.b), after = led.a === 'null' ? Infinity : Number(led.a);
  p.check('the ledger has one row, and the smallest step that changes the 4 grew', led.rows === 1 && Number.isFinite(before) && after > before, `${led.text} (before ${led.b}, after ${led.a})`);
  p.check('the second call waits, on the hardened network', await p.ev('!document.getElementById("verdict").textContent && /hardened/.test(document.getElementById("question").textContent) && document.querySelectorAll("#cands button:not([disabled])").length === 3'));
  await p.shot('02-hardened');

  t = await centre('#cands button[data-kind="template"]');
  await p.click(t.x, t.y); await p.sleep(300);
  const r = await p.ev(`(() => { const b = document.querySelector('#cands button[data-kind="template"] .cr'); return { res: b.textContent, any: [...document.querySelectorAll('#cands .cr')].some((c) => c.classList.contains('fired')), verdict: document.getElementById('verdict').textContent, tally: document.getElementById('tally').textContent }; })()`);
  const expect = !r.any ? /not counted/ : !/still read as/.test(r.res) ? /^Right\./ : /^Not this one\./;
  p.check('the second call is marked by what the hardened corner was read as', expect.test(r.verdict), `sharpest corner now: ${r.res}; verdict "${r.verdict}"; ${r.tally}`);
  await p.shot('03-second-call');
}
