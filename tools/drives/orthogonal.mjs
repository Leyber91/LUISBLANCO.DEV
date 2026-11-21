/* ============================================================
   tools/drives/orthogonal.mjs: the Orthogonal plate (Alternate
   Reality), by hand, at a desktop and a phone width.

   Run by `node tools/labs-wt.mjs drive altverse --tree <tree>
   --scenario tools/drives/orthogonal.mjs`, or by tools/drive.mjs
   against a server of the tree.

   What it proves, that a still cannot:
   - the plate opens on its artifact, the render loaded, the
     render's record read and its parameters matching it;
   - a press on a step chooses it: its ring, its Earth pair's ring,
     the reading in the footer, the link in the address bar; the
     footer keeps one height whatever step it reads;
   - the arrow keys walk the rows and cross to Earth's step and back;
   - a link opens the plate on its step, and a step that is not in
     the world opens the artifact;
   - the render missing is said in words, in the same box;
   - live, the gold strand draws itself and the render surfaces from
     the fog only after the strand reaches it; under reduced motion
     the plate opens finished;
   - the fog, read from the canvas's own pixels: none on Earth's
     branch or the root, some beside this world's branch, more on
     what has not happened; during the ignition the branch stands in
     fog that has condensed into its ink by the end;
   - the exercise (slice 2), by pointer and by keys: four steps leave
     their rows into the fog in the item's shuffled order, a press
     numbers a step, Backspace undoes, the arrows move and Enter
     picks, the fourth press is checked by the engine; a right
     answer's numbers are gold, a wrong one is drawn in ink with the
     pair ringed and its links traced, and the footer names the link
     the engine gave; the count reads back after a reload through the
     browser's real store, with the step last chosen and the next
     item; with storage refused the bar says so in the bindings'
     words and the exercise still counts for the visit;
   - the slice 2 fixes: each lifted step shows what it needs, not its
     role; a draw is the engine's for its item and its seed; a real
     reload after two presses opens the same draw with the two
     presses; the legend's sample is gold exactly when the drawing's
     strand is, in every mode; at 390 the footer has no empty band
     in any state of the exercise (its band in every state is
     measured and printed); the drawing, the bar and the footer do
     not move between the normal and storage-off states;
   - after every step: no sideways scroll, every target at least
     44 px at 390, every text legible, gold only on what fired.
   ============================================================ */
import { standard } from '../invariants.mjs';

const PAGE = '/labs/orthogonal.html';
// every step of the world, in the order the footer's reading is measured
// (grown by the engine since 2026-11-21: worlds/fungi-early.js buildWorld; the ids are the ones it gives the rows it grew)
const WORLD_IDS = ['ground', 'fungi', 'farmed', 'whaling', 'luminous', 'whaleoil', 'lamp', 'oillamp', 'trouble'];
// the steps gold marks: the driver and this world's own steps up to the artifact (engine.js stateOf)
// the engine builds this world's lamp and does not keep it (grow.js, fc0c06d), so gold stops at the culture
const FIRED = ['fungi', 'farmed', 'luminous'];
// the branch that fired, and the legend's swatch that says what that gold means (the corners are in the ink ladder
// since pass 3, by the hub's ruling of 2026-11-21 10:49); an order checked right is a decision, so its numbers and
// their rings are gold
const GOLD = ['.edge.fired', '.edge.thread', '.leader', '.node.fired .sq', '.lg-branch', 'svg.ord-right text.num', '.ord-right .node.picked .ring',
  // Labs OS's own consent banner (shared code, os/ui.js), on a page opened on the browser's real store until it is answered
  '.los-bk'];
const STORAGE_OFF = 'Your browser keeps nothing for this page, so your answers last until it reloads or closes. A link to a step still opens that step.';
const STORAGE_ON = 'Your answers are kept in this browser. The privacy page shows what is kept, and exports or erases it.';
/* The fog's peak alpha on the canvas, 0 to 255, and the most the world brief allows (config.js FOG_LIMIT, review H3):
   what the visitor sees, read from every pixel. */
const FOG_PEAK = (base) => `import('${base}/labs/assets/js/orthogonal/config.js').then((C) => {
  const c = document.getElementById('lineage-fog'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let m = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > m) m = d[i];
  return { peak: m, limit: Math.floor(255 * C.FOG_LIMIT), px: d.length / 4 };
})`;
const fogWithin = (f) => f.px > 1000 && f.peak > 10 && f.peak <= f.limit;
/* The fog's density as the canvas paints it, about a step's square moved by (dx, dy): the alpha of a 9 x 9 px window
   over the alpha the texture alone gives those pixels (kit/fog.js and engine.js fogTexel, drawn FOG.scale px a texel
   from the canvas's origin when the fog has not drifted, as under ?still). The texture is mottled five to one, more
   than the densities differ, so a window of alpha alone says where its mottling fell; this says what the canvas
   painted the density as. */
const FOG_SEEN = (base, id, dx = 0, dy = 0) => `Promise.all([import('${base}/labs/assets/js/kit/fog.js'), import('${base}/labs/assets/js/orthogonal/config.js'), import('${base}/labs/assets/js/orthogonal/engine.js')]).then(([K, C, E]) => {
  const v = K.fogNoise(C.FOG.seed, C.FOG.tile), T = C.FOG.tile, S = C.FOG.scale;
  const n = window.__orthogonal.layout().nodes.find((x) => x.id === '${id}');
  const x0 = Math.round(n.x + ${dx}) - 4, y0 = Math.round(n.y + ${dy}) - 4;
  const d = document.getElementById('lineage-fog').getContext('2d').getImageData(x0, y0, 9, 9).data;
  let a = 0, t = 0;
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) { a += d[4 * (j * 9 + i) + 3]; t += E.fogTexel(v[(Math.floor((y0 + j) / S) % T) * T + (Math.floor((x0 + i) / S) % T)]); }
  return a / t;
})`;
/* Every text of the header, the captions and the legend, as the live page has it: each inside a claim (data-claim) or
   a label (data-label), and every claim on the page carrying [REAL] or [ILLUSTRATIVE] (review H1). */
const CLAIMS = `(() => {
  const loose = [], texts = [];
  for (const r of document.querySelectorAll('.head, .art-cap, .earth-cap, .legend')) {
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.trim(); if (!t) continue; texts.push(t); if (!n.parentElement.closest('[data-claim], [data-label]')) loose.push(t); }
  }
  const claims = [...document.querySelectorAll('[data-claim]')].filter((e) => e.getClientRects().length).map((e) => e.textContent.replace(/\\s+/g, ' ').trim());
  return { texts: texts.length, loose, claims: claims.length, untagged: claims.filter((c) => !/\\[(REAL|ILLUSTRATIVE)\\]/.test(c)), first: claims.map((c) => c.slice(0, 24)) };
})()`;
/* The fog's mean alpha (0 to 255) along the line from step a to step b, on the line and 20 px either side of it, over
   15 windows of 7 x 7 px: the texture's own mottling averages out, and what is left is the density. */
const FOG_LINE = (a, b) => `(() => {
  const L = window.__orthogonal.layout(), A = L.nodes.find((x) => x.id === '${a}'), B = L.nodes.find((x) => x.id === '${b}');
  const ctx = document.getElementById('lineage-fog').getContext('2d');
  const at = (x, y) => { const d = ctx.getImageData(Math.round(x) - 3, Math.round(y) - 3, 7, 7).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s / 49; };
  let on = 0, off = 0;
  for (let k = 1; k <= 15; k++) { const t = 0.15 + 0.7 * k / 16, x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t; on += at(x, y); off += (at(x - 20, y) + at(x + 20, y)) / 2; }
  return { on: on / 15, off: off / 15 };
})()`;
/* The fog's alpha (0 to 255) on the canvas, averaged over a 9 x 9 px window about a step's square, moved by (dx, dy):
   what the visitor sees, not the density the engine computed. */
const FOG_AT = (id, dx = 0, dy = 0) => `(() => {
  const n = window.__orthogonal.layout().nodes.find((x) => x.id === '${id}');
  const c = document.getElementById('lineage-fog');
  const x = Math.round(n.x + ${dx}) - 4, y = Math.round(n.y + ${dy}) - 4;
  const d = c.getContext('2d').getImageData(Math.max(0, x), Math.max(0, y), 9, 9).data;
  let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i];
  return a / (d.length / 4);
})()`;

export default async function orthogonal(p, { base, width, height }) {
  for (const [name, expr] of standard({ gold: { allow: GOLD } })) p.invariant(name, expr);
  const open = async (q) => {
    await p.go(`${base}${PAGE}?${q}&os-fixture=sharing-off`);
    return p.until('document.body.classList.contains("ready")', 30000);
  };
  const state = () => p.ev(`(() => {
    const r = document.getElementById('reading');
    const chosen = document.querySelector('.node.chosen');
    const paired = document.querySelector('.node.paired');
    const img = document.getElementById('art-img');
    return {
      chosen: chosen && chosen.getAttribute('data-id'), paired: paired && paired.getAttribute('data-id'),
      pressed: [...document.querySelectorAll('.node[aria-pressed="true"]')].map((g) => g.getAttribute('data-id')),
      reading: r.dataset.node, readingH: r.offsetHeight, readingText: r.textContent,
      url: new URL(location.href).searchParams.get('node'), rule: document.querySelector('.pair-rule').classList.contains('on'),
      focus: document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-id'),
      img: img.complete && img.naturalWidth, fog: document.getElementById('art').classList.contains('fog'),
      failed: document.getElementById('art').classList.contains('failed'), status: document.getElementById('art-status').textContent,
      prov: document.getElementById('provenance').dataset.state, provText: document.getElementById('provenance').textContent,
    };
  })()`);
  /* Where a step's label is on screen, brought into view first: a press goes where a finger would. */
  const at = (id) => p.ev(`(() => {
    const g = document.querySelector('.node[data-id="${id}"]');
    g.scrollIntoView({ block: 'center' });
    const t = g.querySelector('.lbl').getBoundingClientRect();
    return { x: t.x + Math.min(t.width / 2, 30), y: t.y + 7 };
  })()`);
  const press = async (id) => { const c = await at(id); await p.sleep(150); await p.click(c.x, c.y); await p.sleep(250); };

  // ---- the plate at rest
  p.check('the plate opens', await open('still'));
  p.check('the render loads', await p.until('document.getElementById("art-img").naturalWidth > 0', 20000));
  p.check("the render's record is read", await p.until('document.getElementById("provenance").dataset.state !== "loading"', 20000));
  let s = await state();
  p.check('it opens on the artifact, chosen and read', s.chosen === 'lamp' && s.reading === 'lamp' && s.pressed.join() === 'lamp', JSON.stringify(s.pressed));
  p.check("the render's record matches the parameters on the site, and says so in one line", s.prov === 'ok' && /its parameters$/.test(s.provText), s.provText);
  // the provenance line on the page is the one function's, from the record the site serves (review C1)
  const provWant = await p.ev(`Promise.all([import('${base}/labs/assets/js/orthogonal/render-words.js'), fetch(window.__orthogonal.world.artifact.record).then((r) => r.json())])
    .then(([W, R]) => { const w = W.provenance(R); return w.head + w.from + 'its parameters'; })`);
  p.check('the provenance line is written from the render\'s record by the one function the tests read', s.provText.endsWith(provWant) && provWant.length > 40, `${s.provText} | ${provWant}`);
  const named = await p.ev(`({ heads: [...document.querySelectorAll('.head-t')].map((t) => t.textContent).join('|'),
    legend: document.querySelector('.legend').textContent.replace(/\\s+/g, ' ').trim() })`);
  p.check('the two branches are named over their lanes, and a legend says what gold, clear ink and fog mean', named.heads === 'Earth|This world' && /branch this world took/.test(named.legend) && /Earth's branch: history/.test(named.legend) && /Fog: invented, or not yet happened/.test(named.legend), JSON.stringify(named));
  // the fog at rest, from the canvas's pixels
  const fogRest = await p.ev(`({ root: ${FOG_AT('ground')}, whaling: ${FOG_AT('whaling')}, whaleoil: ${FOG_AT('whaleoil')}, oillamp: ${FOG_AT('oillamp')},
    besideFarmed: ${FOG_AT('farmed', 20, 16)}, onFarmed: ${FOG_AT('farmed')}, trouble: ${FOG_AT('trouble')} })`);
  p.check("no fog on Earth's branch or on the root both worlds share", fogRest.root === 0 && fogRest.whaling === 0 && fogRest.whaleoil === 0 && fogRest.oillamp === 0, JSON.stringify(fogRest));
  const trunkFog = await p.ev(FOG_LINE('fungi', 'farmed'));
  p.check("fog beside this world's branch, thinner along its ink", trunkFog.off > 6 && trunkFog.on < 0.8 * trunkFog.off, JSON.stringify(trunkFog));
  // read as density, the texture divided out (FOG_SEEN): a window of alpha alone passed or failed by where the
  // texture's mottling fell once the caption strip moved the lineage (this pass, H4)
  const seen = { trouble: await p.ev(FOG_SEEN(base, 'trouble')), besideFarmed: await p.ev(FOG_SEEN(base, 'farmed', 20, 16)) };
  p.check('more fog on what has not happened than beside what was invented, as the canvas paints it', seen.trouble > 1.5 * seen.besideFarmed && seen.trouble > 0.8, JSON.stringify({ seen, alpha: fogRest }));
  const peakRest = await p.ev(FOG_PEAK(base));
  p.check("at rest the fog's densest pixel is within the world brief's 0.16 alpha", fogWithin(peakRest), JSON.stringify(peakRest));
  p.check('every line of the branch is drawn in full on the finished frame', await p.ev(`[...document.querySelectorAll('.edge.fired, .edge.thread')].every((g) => g.getAttribute('data-p') === '1')`));
  if (width >= 1000) {
    const boxes = await p.ev(`(() => { const a = document.querySelector('.art-view').getBoundingClientRect(), e = document.querySelector('.earth-view').getBoundingClientRect();
      return { a: [Math.round(a.top), Math.round(a.bottom)], e: [Math.round(e.top), Math.round(e.bottom)] }; })()`);
    p.check("the render and Earth's ghost share one box, so the two lamps stand on one ground line", boxes.a[0] === boxes.e[0] && boxes.a[1] === boxes.e[1], JSON.stringify(boxes));
    // the render's note names its three departures (review H4) and so takes more lines: every caption still ends inside
    // its figure, the strip they share
    const capFit = await p.ev(`(() => { const out = {}; for (const sel of ['figure.art', 'figure.earth']) { const f = document.querySelector(sel), cap = f.querySelector('figcaption');
      const kids = [...cap.querySelectorAll('*')].filter((c) => c.getClientRects().length);
      out[sel] = { n: kids.length, content: Math.round(Math.max(...kids.map((c) => c.getBoundingClientRect().bottom))), box: Math.round(f.getBoundingClientRect().bottom), img: Math.round(f.querySelector('.art-view, .earth-view').getBoundingClientRect().width) }; } return out; })()`);
    p.check("every line of the render's caption and of Earth's ends inside the strip they share", Object.values(capFit).every((c) => c.n >= 3 && c.content <= c.box), JSON.stringify(capFit));
    // the hub's ruling of 2026-11-21 10:49: the plate fits one 1440 x 900 frame with the evidence footer visible
    const fit = await p.ev(`(() => { const r = document.getElementById('reading').getBoundingClientRect(), s = document.querySelector('.sheet').getBoundingClientRect();
      return { reading: Math.round(r.bottom), sheet: Math.round(s.bottom), view: innerHeight, scroll: document.documentElement.scrollHeight }; })()`);
    if (height <= 900) p.check('the whole plate, its evidence footer included, is in one frame', fit.sheet <= fit.view && fit.reading <= fit.view, JSON.stringify(fit));
    // the engine's verdict (brief engine_b.md 3): one line under the header, in the frame, its text the one the engine
    // computes from the table the page loaded, each clause after its tag
    const verdict = await p.ev(`Promise.all([import('${base}/labs/assets/js/orthogonal/worlds/fungi-early.js'), fetch('${base}/labs/assets/data/orthogonal/tech/light.json').then((r) => r.json())])
      .then(([W, T]) => { const v = document.getElementById('verdict'), r = v.getBoundingClientRect(), lh = parseFloat(getComputedStyle(v).lineHeight);
        const text = v.textContent.replace(/\\s+/g, ' ').trim(), want = W.buildWorld(T).verdict.line;
        return { h: Math.round(r.height), lh, top: Math.round(r.top), bottom: Math.round(r.bottom), view: innerHeight, text, want, ok: text === 'The engine: ' + want }; })`);
    p.check('the engine\'s verdict is one line, in the frame, and the line the engine computes', verdict.h <= verdict.lh * 1.5 && verdict.bottom <= verdict.view && verdict.ok, JSON.stringify(verdict));
  }
  // the eras line under it (worlds/fungi-early.js erasOf): the count, the misses and their figures are the engine's, computed from
  // the table the page loaded; one line at 1440 x 900, in the frame
  const erasLine = await p.ev(`Promise.all([import('${base}/labs/assets/js/orthogonal/worlds/fungi-early.js'), fetch('${base}/labs/assets/data/orthogonal/tech/light.json').then((r) => r.json())])
    .then(([W, T]) => { const v = document.getElementById('eras'), r = v.getBoundingClientRect(), lh = parseFloat(getComputedStyle(v).lineHeight), want = W.erasOf(T).line;
      const text = v.textContent.replace(/\s+/g, ' ').trim(); return { h: Math.round(r.height), lh, bottom: Math.round(r.bottom), view: innerHeight, text, want, ok: text === "Earth's eras: " + want }; })`);
  p.check('the eras line is the line the engine computes from the table', erasLine.ok, JSON.stringify(erasLine));
  if (width >= 1200) p.check('the eras line is one line, in the frame', erasLine.h <= erasLine.lh * 1.5 && erasLine.bottom <= erasLine.view, JSON.stringify(erasLine));
  // at every width the verdict's box is as tall as its text: on a phone the header is a column, where a basis of 100%
  // once stretched it into a band of empty sky above the render (the first drive of 2026-11-21's second engine pass)
  const vbox = await p.ev(`(() => { const v = document.getElementById('verdict'), r = document.createRange(); r.selectNodeContents(v);
    return { box: Math.round(v.getBoundingClientRect().height), text: Math.round(r.getBoundingClientRect().height) }; })()`);
  p.check('the verdict\'s box is as tall as its text', vbox.box <= vbox.text + 4, JSON.stringify(vbox));
  const counts = await p.ev(`({ nodes: document.querySelectorAll('.node').length, gold: document.querySelectorAll('.node.fired').length,
    filled: [...document.querySelectorAll('.node.fired .sq')].filter((r) => getComputedStyle(r).fill !== 'rgb(6, 8, 13)').length,
    earth: document.querySelectorAll('.edge.earth').length, leader: !!document.querySelector('.leader') })`);
  p.check(`the lineage draws every step of the data, ${FIRED.length} of them gold`, counts.nodes === WORLD_IDS.length && counts.gold === FIRED.length, JSON.stringify(counts));
  p.check('the driver is the filled stamp; the artifact, built and not kept, is not', counts.filled === 1, String(counts.filled));
  // Earth's branch is dotted as the bindings ask (review H2): the drawn dash read back against the one rule's numbers
  const dots = await p.ev(`Promise.all([import('${base}/labs/assets/js/orthogonal/config.js')]).then(([C]) => {
    const want = '0px, ' + C.EARTH_DOTS.gap + 'px';
    const lines = [...document.querySelectorAll('#lineage-svg .edge.earth')].map((g) => { const d = g.querySelector('.dots'), cs = d && getComputedStyle(d);
      return { dots: !!d, dash: cs && cs.strokeDasharray, cap: cs && cs.strokeLinecap, width: cs && parseFloat(cs.strokeWidth), fill: cs && cs.fill, brush: g.querySelectorAll('path:not(.dots)').length }; });
    const lg = getComputedStyle(document.getElementById('lg-earth'));
    return { want, w: C.INK.earth, lines, legend: lg.strokeDasharray }; })`);
  p.check("Earth's branch is drawn dotted: each of its four lines round dots of the rule's size and spacing, no brush stroke, and the legend's sample the same",
    dots.lines.length === 3 && dots.lines.every((l) => l.dots && l.brush === 0 && l.dash === dots.want && l.cap === 'round' && l.width === dots.w && l.fill === 'none') && dots.legend === dots.want, JSON.stringify(dots));
  const cl = await p.ev(CLAIMS);
  p.check('every text of the header, the captions and the legend is a claim or a label, and every claim carries its tag (the evidence line, the note, the provenance, Earth\'s tag)',
    cl.texts >= 12 && cl.claims >= 4 && cl.loose.length === 0 && cl.untagged.length === 0, JSON.stringify(cl));
  p.check(width >= 1000 ? 'a gold leader joins the artifact to its render' : 'no leader where the render is not beside the lineage', counts.leader === (width >= 1000));
  await p.shot('01-open');

  // ---- a press chooses a step
  const h0 = s.readingH;
  await press('fungi');
  s = await state();
  p.check('a press on the driver chooses it', s.chosen === 'fungi' && s.reading === 'fungi' && s.url === 'fungi', JSON.stringify({ c: s.chosen, r: s.reading, u: s.url }));
  p.check('the driver has no Earth step beside it, so nothing is ringed across its row', !s.paired && !s.rule, JSON.stringify({ p: s.paired, r: s.rule }));
  p.check('the reading tags each claim and names its sources', /\[REAL\]/.test(s.readingText) && /Nelsen, DiMichele, Peters and Boyce/.test(s.readingText) && /\[ILLUSTRATIVE\]/.test(s.readingText));
  // a wide plate keeps one footer height for every reading; on a phone the reading is the last block and takes the
  // height of what it says (item 8), so there it is held to its content: no band below its last line
  const fits = async () => (await p.ev(`(() => { const r = document.getElementById('reading'); const b = Math.max(...[...r.children].map((k) => k.getBoundingClientRect().bottom)); return Math.round(r.getBoundingClientRect().bottom - b); })()`)) <= 1;
  p.check(width >= 1000 ? 'the footer keeps its height' : 'the footer takes the height of what it says', width >= 1000 ? s.readingH === h0 : await fits(), `${h0} then ${s.readingH}`);
  const rtop = await p.ev(`Math.round(document.getElementById('reading').getBoundingClientRect().top - innerHeight)`);
  // a narrow plate scrolls the reading up to its first claims; a wide one has the reading beside the evidence, its head
  // and first lines in the window
  const room = width >= 1000 ? 100 : 150;
  p.check(`after a press the reading has its head and first lines in the window (${room} px of it)`, rtop <= -room, `${rtop} px from the window's foot`);
  await p.shot('02-driver');

  // ---- the keys
  await p.key('ArrowDown'); await p.sleep(200);
  s = await state();
  p.check('ArrowDown moves to the next row', s.chosen === 'farmed' && s.focus === 'farmed', `${s.chosen}, focus ${s.focus}`);
  await p.key('ArrowDown'); await p.sleep(200);
  await p.key('ArrowLeft'); await p.sleep(200);
  s = await state();
  p.check("ArrowLeft crosses to Earth's step for the same job", s.chosen === 'whaleoil' && s.focus === 'whaleoil' && /Earth/.test(s.readingText), s.chosen);
  await p.key('ArrowDown'); await p.sleep(200);
  s = await state();
  p.check("ArrowDown walks Earth's branch", s.chosen === 'oillamp', s.chosen);
  await p.key('ArrowRight'); await p.sleep(200);
  s = await state();
  p.check("ArrowRight crosses back, its Earth step ringed beside it and joined by the row's rule", s.chosen === 'lamp' && s.paired === 'oillamp' && s.rule, JSON.stringify({ c: s.chosen, p: s.paired, r: s.rule }));
  p.check(width >= 1000 ? 'the footer still keeps its height' : 'the footer still takes the height of what it says', width >= 1000 ? s.readingH === h0 : await fits(), `${h0} then ${s.readingH}`);
  await p.shot('03-keys');

  // ---- links
  await open('node=oillamp&still');
  s = await state();
  p.check('a link opens the plate on its step', s.chosen === 'oillamp' && /^Whale-oil lamp · Earth/.test(s.readingText), s.readingText.slice(0, 40));
  await open('node=nowhere&still');
  s = await state();
  p.check('a step not in the world opens the artifact', s.chosen === 'lamp');

  // ---- the render missing
  await p.ev(`document.getElementById('art-img').src = 'data:image/webp;base64,AAAA'`);
  await p.until('document.getElementById("art").classList.contains("failed")', 8000);
  s = await state();
  p.check('a missing render is said in words', s.failed && /did not load/.test(s.status), s.status);
  p.check('and the lamp is drawn in ink from its parameters in its place', await p.until(`!document.getElementById('art-ink').hidden && document.getElementById('art-ink').childElementCount > 20`, 8000));
  p.check('the strand that pointed at the render is no longer gold', await p.ev(`document.getElementById('lineage').classList.contains('no-art')`));
  const clMissing = await p.ev(CLAIMS);
  p.check('with the render missing, its outline line is a claim with its tag, and every text is still a claim or a label', clMissing.loose.length === 0 && clMissing.untagged.length === 0
    && clMissing.first.some((c) => c.startsWith('The render did not load')), JSON.stringify(clMissing));
  const artH = await p.ev(`document.getElementById('art').offsetHeight`);
  p.check('in a box of the same height', artH > 300, String(artH));
  await p.shot('04-render-missing');

  // ---- live: the strand draws, then the render surfaces
  await open('x=1');
  const early = await p.ev(`(() => {
    const o = window.__orthogonal;
    // each stroke's progress as it is drawn this frame (view.js applyStrand writes it beside the mask it sets)
    const prog = [...document.querySelectorAll('.edge.fired')].map((g) => Number(g.getAttribute('data-p')));
    // what the visitor sees, not a class: the mask's radius on the render (0 px: none of it shows)
    const reveal = parseFloat(getComputedStyle(document.getElementById('art-img')).getPropertyValue('--reveal'));
    return { fog: document.getElementById('art').classList.contains('fog') && reveal < 40, reveal, drawing: prog.filter((v) => v < 1).length,
      drawn: prog.filter((v) => v > 0).length, ms: Math.round(performance.now() - o.startedAt), revealAt: o.revealAt,
      luminous: ${FOG_AT('luminous')}, faint: [...document.querySelectorAll('.node.unreached')].length };
  })()`);
  if (width >= 1000) {
    p.check('live, the gold strand is still drawing and the render waits in the fog', early.fog && early.drawing > 0, JSON.stringify(early));
    p.check('and the branch the strand has not reached stands in fog, its steps faint squares with no words', early.luminous > 8 && early.faint > 0, JSON.stringify(early));
    const peakIgnite = await p.ev(FOG_PEAK(base));
    p.check("during the ignition the fog's densest pixel is within the world brief's 0.16 alpha", fogWithin(peakIgnite), JSON.stringify(peakIgnite));
    await p.shot('05-ignition');
    p.check('and surfaces once the strand has reached it', await p.until('!document.getElementById("art").classList.contains("fog")', 8000));
    const lifted = await p.ev(`Number(document.getElementById('art').dataset.liftedAt) - window.__orthogonal.startedAt`);
    p.check('never before the strand reaches the artifact', lifted >= early.revealAt - 5, `${Math.round(lifted)} ms, the strand arrives at ${early.revealAt} ms`);
    await p.sleep(1600);
    await p.shot('06-surfaced');
    const later = await p.ev(FOG_AT('luminous'));
    p.check('the fog it stood in has condensed into its ink by the end', later < early.luminous / 2, `${early.luminous} then ${later}`);
    const a1 = await p.ev(FOG_AT('trouble', 24, -10));
    await p.sleep(800);
    const a2 = await p.ev(FOG_AT('trouble', 24, -10));
    p.check('at rest the fog drifts where it stands', a1 !== a2, `${a1} then ${a2}`);
  } else {
    // a narrow plate puts the render first and its lineage below it: the render shows at once, and the strand waits
    // for the visitor to reach it, so the two never run in the wrong order
    await p.sleep(900);
    const first = await p.ev(`({ fog: document.getElementById('art').classList.contains('fog'),
      drawn: [...document.querySelectorAll('.edge.fired')].filter((g) => Number(g.getAttribute('data-p')) > 0).length,
      below: Math.round(document.getElementById('lineage').getBoundingClientRect().top - innerHeight) })`);
    p.check('on a phone the render shows at once, out of its fog', !first.fog, JSON.stringify(first));
    p.check('and the strand below the first screen has not drawn while out of sight', first.below > 0 && first.drawn === 0, JSON.stringify(first));
    await p.ev(`document.getElementById('lineage').scrollIntoView({ block: 'start' })`);
    await p.sleep(250);
    const peakIgnite = await p.ev(FOG_PEAK(base));
    p.check("during the ignition the fog's densest pixel is within the world brief's 0.16 alpha", fogWithin(peakIgnite), JSON.stringify(peakIgnite));
    await p.shot('05-ignition');
    p.check('brought into view, the strand draws itself', await p.until(`[...document.querySelectorAll('.edge.fired, .edge.thread')].every((g) => g.getAttribute('data-p') === '1')`, 8000));
    await p.sleep(400);
    await p.shot('06-surfaced');
  }

  // ---- the exercise, on the browser's real store (the drive's own profile), the sharing question answered no
  const ENGINE = `${base}/labs/assets/js/orthogonal/engine.js`;
  const dr = () => p.ev(`(() => { const d = window.__orthogonal.drill(), r = window.__orthogonal.record();
    return { ...d, count: document.getElementById('drill-count').textContent, kept: r && r.kept, store: r && r.store,
      footer: document.getElementById('reading').textContent, verdict: document.getElementById('reading').dataset.drill || null,
      shown: [...document.querySelectorAll('.node')].filter((g) => getComputedStyle(g).visibility !== 'hidden' && getComputedStyle(g).opacity !== '0').map((g) => g.getAttribute('data-id')),
      edges: getComputedStyle(document.querySelector('.edges')).opacity, nums: [...document.querySelectorAll('.node .num')].map((t) => t.closest('.node').getAttribute('data-id') + '=' + t.textContent),
      offMsg: document.getElementById('drill-kept').hasAttribute('data-off') ? document.getElementById('drill-kept').textContent : '', keptMsg: document.getElementById('drill-kept').textContent }; })()`);
  /* A right order of the item's steps, from the engine's own links, and whether an order is right. */
  const rightOrder = (steps) => p.ev(`import('${ENGINE}').then((E) => { const w = window.__orthogonal.world, s = ${JSON.stringify(steps)}, out = [];
    // each time, the first step whose needs among the four are all placed
    while (out.length < s.length) out.push(s.find((a) => !out.includes(a) && s.every((b) => b === a || out.includes(b) || !E.needsOf(w, a).has(b))));
    return out; })`);
  const checkIn = (order) => p.ev(`import('${ENGINE}').then((E) => { const r = E.checkOrder(window.__orthogonal.world, ${JSON.stringify(order)}); return { right: r.right, line: r.pair ? E.needLine(window.__orthogonal.world, r.pair.path) : '' }; })`);
  const button = async (id) => { const c = await p.ev(`(() => { const b = document.getElementById('${id}'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await p.sleep(120); await p.click(c.x, c.y); await p.sleep(300); };
  /* The drawing in view and the steps' places read once the move has settled. */
  const view = () => p.ev(`(() => { const r = document.getElementById('lineage').getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) window.scrollBy(0, r.top - 8); return true; })()`);
  /* Whether the legend's sample is gold, whether the drawing's strand is (a line of the branch or a step of it, as the
     visitor sees it), and what the page's one rule says. */
  const goldPair = () => p.ev(`(() => { const isGold = (c) => /212, 162, 76/.test(c);
    const seen = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false; } return true; };
    const legend = isGold(getComputedStyle(document.getElementById('lg-branch')).fill);
    const lines = [...document.querySelectorAll('.edge.fired path, .edge.thread path')].some((e) => seen(e) && isGold(getComputedStyle(e).fill));
    const steps = [...document.querySelectorAll('.node.fired .sq')].some((e) => seen(e) && isGold(getComputedStyle(e).stroke));
    return { legend, strand: lines || steps, rule: window.__orthogonal.gold() }; })()`);
  const goldAgrees = async (where) => { const g = await goldPair(); p.check(`${where}: the legend's sample is gold exactly when the drawing's strand is, by the one rule`, g.legend === g.strand && g.legend === g.rule, JSON.stringify(g)); return g; };
  /* The empty band at the foot of the footer: its bottom less the bottom of the last thing in it, in px. */
  const band = () => p.ev(`(() => { const r = document.getElementById('reading'); const b = Math.max(...[...r.children].map((k) => k.getBoundingClientRect().bottom)); return Math.round(r.getBoundingClientRect().bottom - b); })()`);
  const bands = [];
  const noteBand = async (state) => { bands.push([state, await band()]); };
  /* Where the drawing, a step of it, the bar and the footer are on the page (document coordinates). */
  const place = () => p.ev(`(() => { const R = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; };
    return { lin: R(document.getElementById('lineage')), lamp: R(document.querySelector('.node[data-id="lamp"] .sq')), bar: R(document.getElementById('drill-bar')), reading: R(document.getElementById('reading')), kept: document.getElementById('drill-kept').textContent }; })()`);
  await p.go(`${base}${PAGE}?still`);
  p.check('the plate opens on the real store', await p.until('document.body.classList.contains("ready")', 30000));
  // Labs OS asks about sharing on a page with the real store; the question is answered no, so it covers nothing
  if (await p.until(`!!document.querySelector('.los-btn[data-choice="denied"]')`, 6000)) await p.ev(`document.querySelector('.los-btn[data-choice="denied"]').click()`);
  p.check('the record is read, and the exercise offered', await p.until(`!document.getElementById('drill-start').disabled`, 10000));
  let x = await dr();
  p.check('a first visit counts nothing yet, and is kept in the browser', x.count === '0 answered, 0 right' && x.kept === true && x.store === 'indexeddb' && !x.offMsg, JSON.stringify({ c: x.count, k: x.kept, s: x.store }));
  const saltReal = await p.ev('window.__orthogonal.record().salt');
  p.check('the record has a salt of its own, 32 bits (review C2)', Number.isInteger(saltReal) && saltReal >= 0 && saltReal <= 0xFFFFFFFF, String(saltReal));
  await press('luminous');
  p.check('a step chosen in the reading is kept as an action of the explore mode', await p.until(`window.__orthogonal.record().log.some((e) => e.mode === 'explore' && e.kind === 'choose' && e.node === 'luminous' && typeof e.t === 'number')`, 4000));
  await button('drill-start');
  await view();
  x = await dr();
  const goldNow = () => p.ev(`[...document.querySelectorAll('#lineage-svg .node.step .sq, #lineage-svg .node.step .lbl, #lineage-svg .node.step .ring')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && /212, 162, 76/.test(getComputedStyle(e).stroke + getComputedStyle(e).fill)).length`);
  p.check('the exercise opens item 0 on the drawing: four steps out of their rows, the rest gone, the lines in fog', x.mode === 'order' && x.item.index === 0 && x.shown.length === 4 && x.item.steps.every((id) => x.shown.includes(id)) && x.edges === '0', JSON.stringify({ m: x.mode, shown: x.shown, e: x.edges }));
  const ys = await p.ev(`${JSON.stringify(x.item.steps)}.map((id) => document.querySelector('.node[data-id="' + id + '"] .sq').getBoundingClientRect().top)`);
  const salt0 = await p.ev('window.__orthogonal.record().salt');
  const engineDraw = await p.ev(`import('${ENGINE}').then((E) => E.item(window.__orthogonal.world, ${x.item.index}, ${x.item.seed}, ${salt0}).steps)`);
  p.check("they stand down the drawing in the draw's order, the engine's for the item, the attempt's seed and the record's salt", ys.every((y, i) => i === 0 || y > ys[i - 1]) && engineDraw.join() === x.item.steps.join() && Number.isInteger(x.item.seed) && x.item.salt === salt0, JSON.stringify({ ys, seed: x.item.seed, salt: x.item.salt, rec: salt0 }));
  p.check('and that salt is the one the record had when the page first read it: made once, kept by the first write', salt0 === saltReal, JSON.stringify({ first: saltReal, now: salt0 }));
  const needs = await p.ev(`${JSON.stringify(x.item.steps)}.map((id) => { const g = document.querySelector('.node[data-id="' + id + '"]'); const t = g.querySelector('text.need'); const role = g.querySelector('.role');
    return { id, shown: !!t && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0, text: t ? t.textContent : '', role: role ? getComputedStyle(role).visibility : 'none' }; })`);
  const wantNeeds = await p.ev(`${JSON.stringify(x.item.steps)}.map((id) => { const n = window.__orthogonal.world.nodes.find((m) => m.id === id); return (n.role === 'trouble' ? 'grows from ' : 'needs ') + n.needs; })`);
  // the line's tspans read back joined, so the two are compared without their spaces
  p.check('each step shows what it needs, from the world\'s data, in place of its role', needs.every((n, i) => n.shown && n.text.replace(/\s+/g, '') === wantNeeds[i].replace(/\s+/g, '') && n.role !== 'visible'), JSON.stringify(needs));
  await goldAgrees('while an order is given');
  await noteBand('order, 0 pressed');
  p.check('the footer says what to do', /Order these steps by what each needs/.test(x.footer) && /0 of 4 pressed/.test(x.footer), x.footer.slice(0, 120));
  p.check('while an order is given nothing on the steps is gold, and no role line gives the order away', (await goldNow()) === 0
    && (await p.ev(`[...document.querySelectorAll('#lineage-svg .node.step .role')].every((t) => getComputedStyle(t).visibility === 'hidden')`)), String(await goldNow()));
  const peakOrder = await p.ev(FOG_PEAK(base));
  p.check("while an order is given the fog's densest pixel is within the world brief's 0.16 alpha", fogWithin(peakOrder), JSON.stringify(peakOrder));
  await p.shot('07-order');
  const want0 = await rightOrder(x.item.steps);
  await press(want0[0]);
  await noteBand('order, 1 pressed');
  await press(want0[1]);
  await noteBand('order, 2 pressed');
  x = await dr();
  p.check('a press numbers a step in a ring, in the order pressed', x.picks.join() === want0.slice(0, 2).join() && x.nums.sort().join() === [`${want0[0]}=1`, `${want0[1]}=2`].sort().join() && /2 of 4 pressed/.test(x.footer), JSON.stringify({ p: x.picks, n: x.nums }));
  p.check('the two presses are in the store, in the order in progress', await p.until(`import('${base}/labs/assets/js/os/index.js').then((m) => m.LabsOS.instance.progress.get()).then((r) => !!r && !!r.data.open && r.data.open.picks.join() === ${JSON.stringify(want0.slice(0, 2).join())})`, 6000));
  await p.shot('08-mid-order');
  // a real reload of the page, mid-item: the same draw comes back with its two presses
  const before = x;
  const href = await p.ev('location.href');
  await p.go(href);
  p.check('after a reload mid-item the page comes up in the order in progress', await p.until('document.body.classList.contains("ready")', 30000) && await p.until(`window.__orthogonal.drill().mode === 'order'`, 10000));
  await view();
  x = await dr();
  p.check('the same draw: the item, its seed, and the four steps in the same places', x.item.index === before.item.index && x.item.seed === before.item.seed && x.item.steps.join() === before.item.steps.join(), JSON.stringify({ was: before.item, now: x.item }));
  const ys2 = await p.ev(`${JSON.stringify(x.item.steps)}.map((id) => document.querySelector('.node[data-id="' + id + '"] .sq').getBoundingClientRect().top)`);
  p.check('standing down the drawing in that order', ys2.every((y, i) => i === 0 || y > ys2[i - 1]), JSON.stringify(ys2));
  p.check('with its two presses, numbered on the drawing and listed in the footer', x.picks.join() === want0.slice(0, 2).join() && x.nums.sort().join() === [`${want0[0]}=1`, `${want0[1]}=2`].sort().join() && /2 of 4 pressed/.test(x.footer), JSON.stringify({ p: x.picks, n: x.nums, f: x.footer.slice(0, 80) }));
  await goldAgrees('after the reload, while an order is given');
  await noteBand('order, 2 pressed, after a reload');
  await p.shot('08b-reloaded');
  await p.key('Backspace');
  await p.sleep(200);
  x = await dr();
  p.check('Backspace undoes the last press', x.picks.join() === want0[0], x.picks.join());
  await noteBand('order, 1 pressed after an undo');
  // the rest by keys: the arrows walk the steps in the order they stand, Enter picks
  for (const id of want0.slice(1)) {
    const at0 = await p.ev(`window.__orthogonal.drill().item.steps.indexOf(document.activeElement && document.activeElement.getAttribute('data-id'))`);
    const to = x.item.steps.indexOf(id);
    const from = at0 < 0 ? 0 : at0;
    if (at0 < 0) await p.ev(`document.querySelector('.node.step[tabindex="0"]').focus()`);
    for (let k = 0; k < Math.abs(to - from); k++) await p.key(to > from ? 'ArrowDown' : 'ArrowUp');
    await p.sleep(80);
    const f = await p.ev(`document.activeElement && document.activeElement.getAttribute('data-id')`);
    if (f !== id) { p.check(`the arrows reach ${id}`, false, `focus on ${f}`); break; }
    await p.key('Enter');
    await p.sleep(200);
    if ((await dr()).picks.length === 3) await noteBand('order, 3 pressed');
  }
  x = await dr();
  const gold = await p.ev(`getComputedStyle(document.querySelector('svg.ord-right text.num') || document.body).fill`);
  p.check('the fourth press is checked: right, the steps back in their rows, the lines back', x.mode === 'checked' && x.result && x.result.right && x.shown.length === WORLD_IDS.length && x.edges === '1', JSON.stringify({ m: x.mode, r: x.result, s: x.shown.length, e: x.edges }));
  p.check("a right answer is a decision: its numbers are gold", /212, 162, 76|rgb\(212/.test(gold), gold);
  p.check('the footer says it is right and the count moves', x.verdict === 'right' && /^Order these steps.*Right: each step comes after every step it needs/.test(x.footer) && x.count === '1 answered, 1 right', `${x.count} | ${x.footer.slice(0, 90)}`);
  p.check('the answer is kept with its time and its mode', await p.until(`window.__orthogonal.record().log.some((e) => e.kind === 'answer' && e.mode === 'practice' && e.item === 0 && e.right === true && typeof e.t === 'number')`, 4000));
  await goldAgrees('an order checked right');
  await noteBand('checked, right');
  await p.shot('09-right');
  await button('drill-next');
  await view();
  x = await dr();
  p.check('the next item is item 1', x.mode === 'order' && x.item.index === 1, JSON.stringify(x.item));
  const wrong1 = (await rightOrder(x.item.steps)).slice().reverse();
  const expect1 = await checkIn(wrong1);
  for (const id of wrong1) await press(id);
  x = await dr();
  const ink = await p.ev(`({ num: getComputedStyle(document.querySelector('.node .num')).fill, why: document.querySelectorAll('.node.why').length, lines: document.querySelectorAll('.why-line').length, gold: !!document.querySelector('svg.ord-right') })`);
  p.check('a wrong order is marked wrong', x.mode === 'checked' && x.result && x.result.right === false && x.verdict === 'wrong' && !expect1.right, JSON.stringify(x.result));
  p.check('the footer names the first pair out of order and the link that orders them, as the engine gives it', x.footer.includes(`Not in order: ${expect1.line}.`), `${expect1.line} | ${x.footer.slice(0, 160)}`);
  p.check('drawn in ink: the pair ringed, its links traced, no gold on the numbers', ink.why === 2 && ink.lines >= 1 && !ink.gold && !/rgb\(212/.test(ink.num), JSON.stringify(ink));
  p.check('the count moves: two answered, one right', x.count === '2 answered, 1 right', x.count);
  await goldAgrees('an order checked wrong');
  await noteBand('checked, wrong');
  await p.shot('10-wrong');
  // Escape leaves an order; then a reload reads the record back from the browser's store
  await button('drill-next');
  await p.key('Escape');
  await p.sleep(200);
  x = await dr();
  p.check('Escape leaves an order for the reading', x.mode === 'read' && x.shown.length === WORLD_IDS.length, x.mode);
  await goldAgrees('back in the reading');
  p.check('the writes reach the store', await p.until(`import('${base}/labs/assets/js/os/index.js').then((m) => m.LabsOS.instance.progress.get()).then((r) => !!r && r.data.answered === 2)`, 6000));
  await p.go(`${base}${PAGE}?still`);
  p.check('the page comes up again', await p.until('document.body.classList.contains("ready")', 30000) && await p.until(`!document.getElementById('drill-start').disabled`, 10000));
  x = await dr();
  const back = await p.ev(`({ chosen: window.__orthogonal.chosen(), next: window.__orthogonal.record().next, log: window.__orthogonal.record().log.map((e) => e.mode + ':' + e.kind) })`);
  p.check('after a reload the count reads back', x.count === '2 answered, 1 right', x.count);
  p.check('and the step last chosen, and the next item', back.chosen === 'luminous' && back.next === 2, JSON.stringify(back));
  p.check('and the log of answers and actions, each with its mode: the orders started, the presses, the undo, the leave, the choice in the reading',
    back.log.filter((s) => s === 'practice:answer').length === 2 && back.log.includes('explore:choose') && back.log.filter((s) => s === 'practice:start').length === 3
    && back.log.filter((s) => s === 'practice:press').length === 9 && back.log.includes('practice:undo') && back.log.includes('practice:leave'), back.log.join(' '));
  // the plate on the browser's real store, in the reading, for the storage-off state to be held to
  await p.ev('window.scrollTo(0, 0)');
  await p.sleep(150);
  const normal = await place();
  await p.shot('11a-normal');
  // the band of the footer in each reading, a step pressed at a time
  for (const id of WORLD_IDS) { await press(id); await noteBand(`reading ${id}`); }
  if (width < 1000) {
    // the road's call before the review (item 8): on a phone the reading is the last block and sizes to what it says
    const readBands = bands.filter(([st]) => st.startsWith('reading'));
    p.check(`on a phone each of the ${WORLD_IDS.length} readings takes the height of what it says: no empty band below its last line`, readBands.length === WORLD_IDS.length && readBands.every(([, b]) => b <= 1), JSON.stringify(readBands));
    const below = await p.ev(`(() => { const r = document.getElementById('reading').getBoundingClientRect(), sheet = document.querySelector('.sheet');
      const els = [...sheet.querySelectorAll('*')].filter((e) => !e.closest('#reading') && !e.classList.contains('corner') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).position !== 'fixed');
      const low = els.filter((e) => e.getBoundingClientRect().bottom > r.bottom + 0.5).map((e) => e.id || (typeof e.className === 'string' ? e.className : e.tagName));
      return { n: els.length, low: low.slice(0, 6), reading: Math.round(r.bottom), sheet: Math.round(sheet.getBoundingClientRect().bottom) }; })()`);
    p.check('and the reading is the last block: nothing the visitor sees sits below it', below.n > 50 && below.low.length === 0, JSON.stringify(below));
  }
  await button('drill-start');
  x = await dr();
  p.check('the exercise goes on at the next item', x.mode === 'order' && x.item.index === 2, JSON.stringify(x.item));
  await p.key('Escape');
  await p.sleep(150);

  // ---- storage refused: the bindings' words, and the exercise still works for the visit
  // the same step read as in the normal state, so the two states are held to each other on the same footer
  await open(`still&node=${back.chosen}&os-fixture=storage-unavailable`);
  p.check('with storage refused the record is still read (for the visit)', await p.until(`!document.getElementById('drill-start').disabled`, 10000));
  x = await dr();
  p.check("the bar says so in the bindings' storage-off words", x.offMsg === STORAGE_OFF && x.kept === false, x.offMsg);
  const saltOff = await p.ev('window.__orthogonal.record().salt');
  p.check('a visit with storage refused starts a record of its own: a new salt, not the stored record\'s', Number.isInteger(saltOff) && saltOff !== saltReal, JSON.stringify({ saltReal, saltOff }));
  await p.ev('window.scrollTo(0, 0)');
  await p.sleep(150);
  const off = await place();
  p.check('the drawing does not move between the normal and the storage-off states', JSON.stringify(off.lin) === JSON.stringify(normal.lin) && JSON.stringify(off.lamp) === JSON.stringify(normal.lamp), JSON.stringify({ normal: [normal.lin, normal.lamp], off: [off.lin, off.lamp] }));
  // both states put a line beside the count (where the answers are kept, or the storage-off diagnosis): the bar and the
  // footer stay where they were, at their heights, at both widths (item 9; the review's M3 found 55 px at 390)
  p.check('the storage-off line takes the place of the line about what is kept: the bar and the footer stay where they were, at their heights',
    JSON.stringify(off.bar) === JSON.stringify(normal.bar) && JSON.stringify(off.reading) === JSON.stringify(normal.reading) && normal.kept === STORAGE_ON && off.kept === STORAGE_OFF,
    JSON.stringify({ normal: [normal.bar, normal.reading, normal.kept.slice(0, 20)], off: [off.bar, off.reading, off.kept.slice(0, 20)] }));
  if (width >= 1000) p.check('and the diagnosis sits on one line beside the count', await p.ev(`(() => { const k = document.getElementById('drill-kept').getBoundingClientRect(), c = document.getElementById('drill-count').getBoundingClientRect(); return k.height < 20 && Math.abs(k.top - c.top) < 4; })()`));
  else p.check('and on a phone the line holds the height of the longer of its two states, so neither moves what is below it', await p.ev(`(() => { const k = document.getElementById('drill-kept'); return k.offsetHeight >= 30 && Math.abs(parseFloat(k.style.minHeight) - k.offsetHeight) <= 1; })()`));
  await p.shot('11b-storage-off');
  await button('drill-start');
  const it2 = (await dr()).item;
  for (const id of await rightOrder(it2.steps)) await press(id);
  x = await dr();
  p.check('and the exercise still checks and counts', x.mode === 'checked' && x.result.right && x.count === '1 answered, 1 right', JSON.stringify({ m: x.mode, c: x.count }));
  await p.ev(`document.getElementById('drill-bar').scrollIntoView({ block: 'center' })`);
  await p.shot('11-storage-off');

  // ---- the footer's empty band in every state, measured; at 390 no state of the exercise has one
  p.check(`the footer's band in each state, px: ${bands.map(([st, b]) => `${st} ${b}`).join('; ')}`, true);
  if (width < 1000) {
    // the footer is reserved for the exercise's tallest state, a wrong answer with the longest reason an item can give
    // (engine.js reasons); the other states fill it with what they hold, the pressed list's four places among it
    const drillBands = bands.filter(([st]) => !st.startsWith('reading') && st !== 'checked, wrong');
    p.check('at 390 no state of an order being given, nor a right answer, leaves an empty band in the footer taller than one line of its text (20 px)', drillBands.length >= 7 && drillBands.every(([, b]) => b <= 20), JSON.stringify(drillBands));
    // a wrong answer's band is what its reason is shorter than the longest: at most two lines of the note (2 x 18 px)
    const wrongBand = bands.find(([st]) => st === 'checked, wrong');
    p.check('and a wrong answer leaves no more than its reason is shorter than the longest an item can give, two lines of the note at most (36 px)', !!wrongBand && wrongBand[1] <= 36, JSON.stringify(wrongBand));
  }

  // ---- reduced motion: the finished frame at once
  await p.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await open('x=2');
  s = await state();
  p.check('under reduced motion the plate opens finished', !s.fog && (await p.ev(`document.getElementById('lineage-svg').getAnimations({ subtree: true }).length`)) === 0
    && (await p.ev(`[...document.querySelectorAll('.edge.fired, .edge.thread')].every((g) => g.getAttribute('data-p') === '1')`)));
  const still1 = await p.ev(FOG_AT('trouble', 20, 0));
  await p.sleep(700);
  p.check('and its fog does not drift', (await p.ev(FOG_AT('trouble', 20, 0))) === still1);
  await p.media([]);
}
