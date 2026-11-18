/* ============================================================
   The test of the record card's test. Run from the repository
   root:
     node labs/assets/js/blackhole/tests/keep.mutants.test.mjs

   Each entry breaks one rule of keep.js: a press acts on what
   the visitor saw, presses do not cross, the second click of a
   double-click is not a press, the way back is the newest hole
   kept, a failure is said in its own words and cleared by a
   later success, the card's words follow the recording switch
   and the view's motion, a ray opens by its place. The third
   reader of slice 3 (review_s3c.md) found 12 of 14 such breaks
   passing keep.test.mjs; every one here must fail a check. The
   broken file is written to a copy of this lab and of Labs OS
   in the system's temp folder (kit/tests/mutants.mjs).

   Add an entry here with every new rule in keep.js, then run
   this and `node tools/dev/conditions.mjs` on keep.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const MUTANTS = [
  /* ---- a press, one at a time ---- */
  ['a press while one is written is taken (review_s3c M1)', `if (!loaded || busy) return;`, `if (!loaded) return;`],
  ['a press before the record is read is taken', `if (!loaded || busy) return;`, `if (busy) return;`],
  ['no busy at all (M2)', `try { busy = true; draw(); await job(); }`, `try { draw(); await job(); }`],
  ['the button on while busy (M3)', `btn.disabled = !loaded || !os || newer || busy;`, `btn.disabled = !loaded || !os || newer;`],
  ['the button on before the record is read', `btn.disabled = !loaded || !os || newer || busy;`, `btn.disabled = !os || newer || busy;`],
  ['the button on over a newer record', `btn.disabled = !loaded || !os || newer || busy;`, `btn.disabled = !loaded || !os || busy;`],
  ['busy never said (M4)', `    btn.setAttribute('aria-busy', String(busy));\n`, ``],
  ['the Take outs on while busy', `\${busy ? ' disabled' : ''}>Take out`, `>Take out`],
  ['a Take out not held by busy (M13)', `void press(async () => { const w = await change((r) => R.unkeep(r, q));`, `void (async () => { const w = await change((r) => R.unkeep(r, q));`],
  ['a double-click\'s second click is a press', `(e && e.detail > 1 ? undefined : keep())`, `keep()`],
  ['a click of any count past the first is a press', `(e && e.detail > 1 ? undefined : keep())`, `(e && e.detail > 2 ? undefined : keep())`],

  /* ---- what the press acts on ---- */
  ['the card\'s row without its picture', `<li>\${e.img ? \`<img class="bh-th" alt="" src="\${esc(e.img)}">\` : ''}<span>`, `<li><span>`],
  ['the picture asked with no link', `img = await thumb(q);`, `img = await thumb();`],
  ['the intent decided in the turn from the store (M5, finding A)', `const q = store.toQuery(), label = nameOf(q), wantKept = btn.getAttribute('aria-pressed') !== 'true';
    // the frame's picture (BAR_L1 C17), made inside the press (a still takes a moment; the card is busy meanwhile)
    let img = null;
    if (wantKept) { try { img = await thumb(q); } catch { img = null; } if (img && !R.isThumb(img)) img = null; }
    const w = wantKept
      ? await change((r) => R.keep(r, { q, t: now(), img }), { resume: { url: here(q), label: R.resumeLabel(q) } })
      : await change((r) => R.unkeep(r, q));`, `const q = store.toQuery(), label = nameOf(q); let wantKept = true;
    let img = null;
    const w = await change((r) => { wantKept = !R.isKept(r, q); return wantKept ? R.keep(r, { q, t: now(), img }) : R.unkeep(r, q); }, { resume: { url: here(q), label: R.resumeLabel(q) } });`],
  ['the way back written though the keep was refused (M7)', `? await change((r) => R.keep(r, { q, t: now(), img }), { resume: { url: here(q), label: R.resumeLabel(q) } })`, `? await change((r) => R.keep(r, { q, t: now(), img })).finally(() => os.progress.setResume(here(q), R.resumeLabel(q)).catch(() => {}))`],
  ['a picture made for a take out', `    if (wantKept) { try { img = await thumb(q); }`, `    if (true) { try { img = await thumb(); }`],
  ['a picture that is not a thumbnail kept', `if (img && !R.isThumb(img)) img = null; }`, `}`],
  ['a picture that fails stops the keep', `try { img = await thumb(q); } catch { img = null; }`, `img = await thumb(q);`],
  ['the strip not drawn again with the card', `    onDraw();
  }`, `  }`],
  ['Take out by its place in the list (M8, finding F)', `data-out="\${esc(e.q)}"`, `data-out="\${esc(String(stored.kept.indexOf(e)))}"`],

  /* ---- the way back ---- */
  ['a take out leaves the way back on the hole taken out', `    if (!wantKept) await wayBack();\n`, ``],
  ['a Take out from the list leaves the way back', `if (w && w.ok) { await wayBack(); said =`, `if (w && w.ok) { said =`],
  ['the last take out leaves the way back', `else await os.progress.clearResume();`, ``],

  /* ---- the card's words ---- */
  ["every write read as a newer version's", `take(w.record, w.why === R.NEWER);`, `take(w.record, w.why !== R.NEWER);`],
  ['"Show the 0 more" under a list that fits', `if (more > 0) out.push(`, `if (more >= 0) out.push(`],
  ['the empty card read as recording off', `const recording = os ? os.recording.on : true;`, `const recording = os ? !os.recording.on : true;`],
  ['Keep on over a newer record, as long as it is not busy', `btn.disabled = !loaded || !os || newer || busy;`, `btn.disabled = !loaded || !os || newer && busy;`],
  ['Keep on over a newer record whenever Labs OS started', `btn.disabled = !loaded || !os || newer || busy;`, `btn.disabled = !loaded || !os && newer || busy;`],
  ['Keep on when Labs OS did not start', `btn.disabled = !loaded || !os || newer || busy;`, `btn.disabled = !loaded && !os || newer || busy;`],
  ['no entry let go counted as some', `if (stored.dropped > 0) notes.push(`, `if (stored.dropped >= 0) notes.push(`],
  ['one entry let go counted as many', `\${stored.dropped === 1 ? 'entry was' : 'rays and falls were'}`, `\${stored.dropped !== 1 ? 'entry was' : 'rays and falls were'}`],
  ['a record in memory said to be kept in the browser', `os.storage.kind === 'memory' ?`, `os.storage.kind !== 'memory' ?`],
  ['a held ray written as a fall', `await (kind === 'ray' ? writeRay(x) : writeFall(x))`, `await (kind !== 'ray' ? writeRay(x) : writeFall(x))`],
  ['every failure said as a read (M9)', `if (err && err.stage === 'write')`, `if (false)`],
  ['the record read not shown after a refused write (M10)', `if (err.record) take(err.record, false); `, ``],
  ['"is out" said for a refused Take out (M11)', `if (w && w.ok) { await wayBack(); said =`, `{ await wayBack(); said =`],
  ['"is kept" said for a refused keep (M12)', `    if (!w || !w.ok) return;\n    if (wantKept`, `    if (!w) return;\n    if (wantKept`],
  ['a keep event for a take out (M14)', `if (wantKept && w.changed) track(`, `if (w.changed) track(`],
  ['every success clears the sentence (a ray wiped "is kept.")', `} else if (saidErr) { said = ''; saidErr = false; }`, `} else { said = ''; }`],
  ['no success clears a failure', `} else if (saidErr) { said = ''; saidErr = false; }`, `}`],
  ['a press that throws says nothing', `      said = 'That press could not be completed. The record shows what the store holds.'; saidErr = true;\n`, ``],
  ['the foot calls rays usage events with recording off', `foot.textContent = !os ? '' : os.recording.on\n`, `foot.textContent = !os ? '' : true\n`],
  ['a ray traced while the view moves is added', `      if (moving()) {`, `      if (false) {`],
  ['a ray opens at four digits of its place', `&ps=\${e.s[0].toFixed(5)},\${e.s[1].toFixed(5)}`, `&ps=\${e.s[0].toFixed(4)},\${e.s[1].toFixed(4)}`],
];

process.exit(await runMutants({ here, file: 'keep.js', test: '../keep.test.mjs', mutants: MUTANTS, also: ['os'] }));
