/* ============================================================
   tools/drives/folded-harden.mjs: hardening on Folded Space's page (Dimensions, level 1; BAR_L1 parts 10 and 11).

   It proves, on the example 4 the page opens on:
   - the first call on its sharpest corner is right;
   - "Harden the network" runs in a worker to its last step, posting its steps, and the page stays live;
   - the flip ledger's row shows a larger smallest step after than before (the kill test measured 0.042 to 0.352 on
     this digit with its own run; the page's run differs in its batches, so only the direction is checked);
   - the second call is on the hardened network's own corners and is marked by what its corner was read as.
   - a press in the strip answers within 200 ms (the INP bound for good, web.dev), at rest and during hardening,
     timed inside the page: from the press's own event time to the frame after the drawing changed (review 1: a
     latency read by polling every 150 ms counts the polling as lag).
   ============================================================ */

/* Press the strip's button k and time it in the page: the pointerdown's timeStamp to the next frame after
   document.body.dataset.digit becomes k. Returns the milliseconds, or null when it did not change within 5 s. */
async function pressLag(p, k) {
  await p.ev(`(() => { window.__lag = null; const b = document.querySelector('#strip').children[${k}]; b.scrollIntoView({ block: 'center' });
    b.addEventListener('pointerdown', (e) => { window.__t0 = e.timeStamp; }, { once: true, capture: true });
    const o = new MutationObserver(() => { if (document.body.dataset.digit === '${k}') { o.disconnect(); requestAnimationFrame(() => { window.__lag = performance.now() - window.__t0; }); } });
    o.observe(document.body, { attributes: true, attributeFilter: ['data-digit'] }); })()`);
  const r = await p.ev(`(() => { const b = document.querySelector('#strip').children[${k}].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await p.click(r.x, r.y);
  await p.until('window.__lag !== null', 5000);
  return p.ev('window.__lag === null ? null : Math.round(window.__lag)');
}

export default async function harden(p, { base }) {
  await p.go(`${base}/labs/folded.html`);
  p.check('the page is ready on the example 4', await p.until('document.body.dataset.state === "ready" && document.body.dataset.answer === "4"', 30000));
  const centre = (sel) => p.ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; })()`);
  let t = await centre('#cands button[data-kind="template"]');
  await p.click(t.x, t.y); await p.sleep(300);
  p.check('the first call on the sharpest corner is right', /^Right\./.test(await p.ev('document.getElementById("verdict").textContent')));

  const rest = await pressLag(p, 7);
  p.check('at rest a press in the strip answers within 200 ms', rest !== null && rest <= 200, `${rest} ms`);
  await pressLag(p, 4); // back to the example 4, called again below
  t = await centre('#cands button[data-kind="template"]');
  await p.click(t.x, t.y); await p.sleep(300);
  const h = await centre('#harden');
  p.check('Harden the network is a target of at least 44 px', !!h && h.h >= 44, h ? `${Math.round(h.h)} px` : 'not found');
  await p.click(h.x, h.y);
  p.check('hardening posts its steps while it runs', await p.until('+(document.body.dataset.hardenStep || 0) >= 50', 60000), await p.ev('document.getElementById("hardnote").textContent'));
  await p.shot('01-hardening');
  const lags = [];
  for (const [k, at] of [[7, 100], [4, 150], [7, 200], [4, 250]]) {
    await p.until(`+(document.body.dataset.hardenStep || 0) >= ${at} || document.body.dataset.hardened === '1'`, 60000);
    lags.push(await pressLag(p, k));
  }
  p.check('during hardening each press in the strip answers within 200 ms', lags.every((v) => v !== null && v <= 200), `${lags.join(', ')} ms`);
  p.check('hardening reaches its last step', await p.until('document.body.dataset.hardened === "1"', 180000), await p.ev('document.getElementById("hardnote").textContent'));
  await p.until('document.querySelectorAll("#ledger tr").length >= 1', 10000); // the row is drawn from the record the store returns
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
  const gold = await p.ev(`(() => { const run = document.querySelector('#plate line.run'); const lab = document.getElementById('pl-to'); return { run: run && run.getAttribute('class'), lab: lab.className, text: lab.textContent }; })()`);
  const changed = !/still read as/.test(r.res);
  p.check('gold only for what fired: the run is gold exactly when its corner changed the answer', changed ? gold.run === 'run' && !/quiet/.test(gold.lab) : gold.run === 'run quiet' && /quiet/.test(gold.lab), `${gold.run}; ${gold.lab}; ${gold.text}`);
  await p.shot('03-second-call');
}
