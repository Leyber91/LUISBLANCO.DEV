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
   - after every step: no sideways scroll, every target at least
     44 px at 390, every text legible, gold only on what fired.
   ============================================================ */
import { standard } from '../invariants.mjs';

const PAGE = '/labs/orthogonal.html';
// the branch that fired, and the legend's swatch that says what that gold means (the corners are in the ink ladder
// since pass 3, by the hub's ruling of 2026-11-21 10:49); an order checked right is a decision, so its numbers and
// their rings are gold
const GOLD = ['.edge.fired', '.edge.thread', '.leader', '.node.fired .sq', '.lg-gold', 'svg.ord-right text.num', '.ord-right .node.picked .ring',
  // Labs OS's own consent banner (shared code, os/ui.js), on a page opened on the browser's real store until it is answered
  '.los-bk'];
const STORAGE_OFF = 'Your browser is not letting this page keep anything, so your world lasts until you close it. A link still shares it.';
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
  const named = await p.ev(`({ heads: [...document.querySelectorAll('.head-t')].map((t) => t.textContent).join('|'),
    legend: document.querySelector('.legend').textContent.replace(/\\s+/g, ' ').trim() })`);
  p.check('the two branches are named over their lanes, and a legend says what gold, clear ink and fog mean', named.heads === 'Earth|This world' && /branch this world took/.test(named.legend) && /Earth's branch: history/.test(named.legend) && /Fog: invented, or not yet happened/.test(named.legend), JSON.stringify(named));
  // the fog at rest, from the canvas's pixels
  const fogRest = await p.ev(`({ root: ${FOG_AT('lignin')}, buried: ${FOG_AT('buried')}, seams: ${FOG_AT('seams')}, gaslamp: ${FOG_AT('gaslamp')},
    besideNocoal: ${FOG_AT('nocoal', 20, 16)}, onNocoal: ${FOG_AT('nocoal')}, trouble: ${FOG_AT('trouble')} })`);
  p.check("no fog on Earth's branch or on the root both worlds share", fogRest.root === 0 && fogRest.buried === 0 && fogRest.seams === 0 && fogRest.gaslamp === 0, JSON.stringify(fogRest));
  const trunkFog = await p.ev(FOG_LINE('fungi', 'nocoal'));
  p.check("fog beside this world's branch, thinner along its ink", trunkFog.off > 6 && trunkFog.on < 0.8 * trunkFog.off, JSON.stringify(trunkFog));
  p.check('more fog on what has not happened than beside what was invented', fogRest.trouble > 1.5 * fogRest.besideNocoal, JSON.stringify(fogRest));
  p.check('every line of the branch is drawn in full on the finished frame', await p.ev(`[...document.querySelectorAll('.edge.fired, .edge.thread')].every((g) => g.getAttribute('data-p') === '1')`));
  if (width >= 1000) {
    const boxes = await p.ev(`(() => { const a = document.querySelector('.art-view').getBoundingClientRect(), e = document.querySelector('.earth-view').getBoundingClientRect();
      return { a: [Math.round(a.top), Math.round(a.bottom)], e: [Math.round(e.top), Math.round(e.bottom)] }; })()`);
    p.check("the render and Earth's ghost share one box, so the two lamps stand on one ground line", boxes.a[0] === boxes.e[0] && boxes.a[1] === boxes.e[1], JSON.stringify(boxes));
    // the hub's ruling of 2026-11-21 10:49: the plate fits one 1440 x 900 frame with the evidence footer visible
    const fit = await p.ev(`(() => { const r = document.getElementById('reading').getBoundingClientRect(), s = document.querySelector('.sheet').getBoundingClientRect();
      return { reading: Math.round(r.bottom), sheet: Math.round(s.bottom), view: innerHeight, scroll: document.documentElement.scrollHeight }; })()`);
    if (height <= 900) p.check('the whole plate, its evidence footer included, is in one frame', fit.sheet <= fit.view && fit.reading <= fit.view, JSON.stringify(fit));
  }
  const counts = await p.ev(`({ nodes: document.querySelectorAll('.node').length, gold: document.querySelectorAll('.node.fired').length,
    filled: [...document.querySelectorAll('.node.fired .sq')].filter((r) => getComputedStyle(r).fill !== 'rgb(6, 8, 13)').length,
    earth: document.querySelectorAll('.edge.earth').length, leader: !!document.querySelector('.leader') })`);
  p.check('the lineage draws every step of the data, five of them gold', counts.nodes === 11 && counts.gold === 5, JSON.stringify(counts));
  p.check('the driver and the artifact are the filled stamps', counts.filled === 2, String(counts.filled));
  p.check(width >= 1000 ? 'a gold leader joins the artifact to its render' : 'no leader where the render is not beside the lineage', counts.leader === (width >= 1000));
  await p.shot('01-open');

  // ---- a press chooses a step
  const h0 = s.readingH;
  await press('fungi');
  s = await state();
  p.check('a press on the driver chooses it', s.chosen === 'fungi' && s.reading === 'fungi' && s.url === 'fungi', JSON.stringify({ c: s.chosen, r: s.reading, u: s.url }));
  p.check("its Earth step is ringed beside it, joined by the row's rule", s.paired === 'buried' && s.rule);
  p.check('the reading tags each claim and names its sources', /\[REAL\]/.test(s.readingText) && /Nelsen, DiMichele, Peters and Boyce/.test(s.readingText) && /\[ILLUSTRATIVE\]/.test(s.readingText));
  p.check('the footer keeps its height', s.readingH === h0, `${h0} then ${s.readingH}`);
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
  p.check("ArrowLeft crosses to Earth's step for the same job", s.chosen === 'seams' && s.focus === 'seams' && /Earth/.test(s.readingText), s.chosen);
  await p.key('ArrowDown'); await p.sleep(200);
  s = await state();
  p.check("ArrowDown walks Earth's branch", s.chosen === 'coalgas', s.chosen);
  await p.key('ArrowRight'); await p.sleep(200);
  s = await state();
  p.check('ArrowRight crosses back', s.chosen === 'luminous' && s.paired === 'coalgas', s.chosen);
  p.check('the footer still keeps its height', s.readingH === h0, `${h0} then ${s.readingH}`);
  await p.shot('03-keys');

  // ---- links
  await open('node=gaslamp&still');
  s = await state();
  p.check('a link opens the plate on its step', s.chosen === 'gaslamp' && /^Gas street lamp · Earth/.test(s.readingText), s.readingText.slice(0, 40));
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
      offMsg: document.getElementById('drill-kept').hidden ? '' : document.getElementById('drill-kept').textContent }; })()`);
  /* A right order of the item's steps, from the engine's own links, and whether an order is right. */
  const rightOrder = (steps) => p.ev(`import('${ENGINE}').then((E) => { const w = window.__orthogonal.world, s = ${JSON.stringify(steps)}, out = [];
    // each time, the first step whose needs among the four are all placed
    while (out.length < s.length) out.push(s.find((a) => !out.includes(a) && s.every((b) => b === a || out.includes(b) || !E.needsOf(w, a).has(b))));
    return out; })`);
  const checkIn = (order) => p.ev(`import('${ENGINE}').then((E) => { const r = E.checkOrder(window.__orthogonal.world, ${JSON.stringify(order)}); return { right: r.right, line: r.pair ? E.needLine(window.__orthogonal.world, r.pair.path) : '' }; })`);
  const button = async (id) => { const c = await p.ev(`(() => { const b = document.getElementById('${id}'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await p.sleep(120); await p.click(c.x, c.y); await p.sleep(300); };
  /* The drawing in view and the steps' places read once the move has settled. */
  const view = () => p.ev(`(() => { const r = document.getElementById('lineage').getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) window.scrollBy(0, r.top - 8); return true; })()`);
  await p.go(`${base}${PAGE}?still`);
  p.check('the plate opens on the real store', await p.until('document.body.classList.contains("ready")', 30000));
  // Labs OS asks about sharing on a page with the real store; the question is answered no, so it covers nothing
  if (await p.until(`!!document.querySelector('.los-btn[data-choice="denied"]')`, 6000)) await p.ev(`document.querySelector('.los-btn[data-choice="denied"]').click()`);
  p.check('the record is read, and the exercise offered', await p.until(`!document.getElementById('drill-start').disabled`, 10000));
  let x = await dr();
  p.check('a first visit counts nothing yet, and is kept in the browser', x.count === '0 answered, 0 right' && x.kept === true && x.store === 'indexeddb' && !x.offMsg, JSON.stringify({ c: x.count, k: x.kept, s: x.store }));
  await press('nocoal');
  p.check('a step chosen in the reading is kept as an action of the explore mode', await p.until(`window.__orthogonal.record().log.some((e) => e.mode === 'explore' && e.kind === 'choose' && e.node === 'nocoal' && typeof e.t === 'number')`, 4000));
  await button('drill-start');
  await view();
  x = await dr();
  const goldNow = () => p.ev(`[...document.querySelectorAll('#lineage-svg .node.step .sq, #lineage-svg .node.step .lbl, #lineage-svg .node.step .ring')].filter((e) => getComputedStyle(e).visibility !== 'hidden' && /212, 162, 76/.test(getComputedStyle(e).stroke + getComputedStyle(e).fill)).length`);
  p.check('the exercise opens item 0 on the drawing: four steps out of their rows, the rest gone, the lines in fog', x.mode === 'order' && x.item.index === 0 && x.shown.length === 4 && x.item.steps.every((id) => x.shown.includes(id)) && x.edges === '0', JSON.stringify({ m: x.mode, shown: x.shown, e: x.edges }));
  const ys = await p.ev(`${JSON.stringify(x.item.steps)}.map((id) => document.querySelector('.node[data-id="' + id + '"] .sq').getBoundingClientRect().top)`);
  p.check("they stand down the drawing in the item's shuffled order, which the rows do not give away", ys.every((y, i) => i === 0 || y > ys[i - 1]) && !(await checkIn(x.item.steps)).right, JSON.stringify(ys));
  p.check('the footer says what to do', /Order these steps by what each needs/.test(x.footer) && /0 of 4 pressed/.test(x.footer), x.footer.slice(0, 120));
  p.check('while an order is given nothing on the steps is gold, and no role line gives the order away', (await goldNow()) === 0
    && (await p.ev(`[...document.querySelectorAll('#lineage-svg .node.step .role')].every((t) => getComputedStyle(t).visibility === 'hidden')`)), String(await goldNow()));
  await p.shot('07-order');
  const want0 = await rightOrder(x.item.steps);
  await press(want0[0]);
  await press(want0[1]);
  x = await dr();
  p.check('a press numbers a step in a ring, in the order pressed', x.picks.join() === want0.slice(0, 2).join() && x.nums.sort().join() === [`${want0[0]}=1`, `${want0[1]}=2`].sort().join() && /2 of 4 pressed/.test(x.footer), JSON.stringify({ p: x.picks, n: x.nums }));
  await p.shot('08-mid-order');
  await p.key('Backspace');
  await p.sleep(200);
  x = await dr();
  p.check('Backspace undoes the last press', x.picks.join() === want0[0], x.picks.join());
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
  }
  x = await dr();
  const gold = await p.ev(`getComputedStyle(document.querySelector('svg.ord-right text.num') || document.body).fill`);
  p.check('the fourth press is checked: right, the steps back in their rows, the lines back', x.mode === 'checked' && x.result && x.result.right && x.shown.length === 11 && x.edges === '1', JSON.stringify({ m: x.mode, r: x.result, s: x.shown.length, e: x.edges }));
  p.check("a right answer is a decision: its numbers are gold", /212, 162, 76|rgb\(212/.test(gold), gold);
  p.check('the footer says it is right and the count moves', x.verdict === 'right' && /^Order these steps.*Right: each step comes after every step it needs/.test(x.footer) && x.count === '1 answered, 1 right', `${x.count} | ${x.footer.slice(0, 90)}`);
  p.check('the answer is kept with its time and its mode', await p.until(`window.__orthogonal.record().log.some((e) => e.kind === 'answer' && e.mode === 'practice' && e.item === 0 && e.right === true && typeof e.t === 'number')`, 4000));
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
  await p.shot('10-wrong');
  // Escape leaves an order; then a reload reads the record back from the browser's store
  await button('drill-next');
  await p.key('Escape');
  await p.sleep(200);
  x = await dr();
  p.check('Escape leaves an order for the reading', x.mode === 'read' && x.shown.length === 11, x.mode);
  p.check('the writes reach the store', await p.until(`import('${base}/labs/assets/js/os/index.js').then((m) => m.LabsOS.instance.progress.get()).then((r) => !!r && r.data.answered === 2)`, 6000));
  await p.go(`${base}${PAGE}?still`);
  p.check('the page comes up again', await p.until('document.body.classList.contains("ready")', 30000) && await p.until(`!document.getElementById('drill-start').disabled`, 10000));
  x = await dr();
  const back = await p.ev(`({ chosen: window.__orthogonal.chosen(), next: window.__orthogonal.record().next, log: window.__orthogonal.record().log.map((e) => e.mode + ':' + e.kind) })`);
  p.check('after a reload the count reads back', x.count === '2 answered, 1 right', x.count);
  p.check('and the step last chosen, and the next item', back.chosen === 'nocoal' && back.next === 2, JSON.stringify(back));
  p.check('and the log of answers and actions, each with its mode: the orders started, the presses, the undo, the leave, the choice in the reading',
    back.log.filter((s) => s === 'practice:answer').length === 2 && back.log.includes('explore:choose') && back.log.filter((s) => s === 'practice:start').length === 3
    && back.log.filter((s) => s === 'practice:press').length === 9 && back.log.includes('practice:undo') && back.log.includes('practice:leave'), back.log.join(' '));
  await button('drill-start');
  x = await dr();
  p.check('the exercise goes on at the next item', x.mode === 'order' && x.item.index === 2, JSON.stringify(x.item));
  await p.key('Escape');
  await p.sleep(150);

  // ---- storage refused: the bindings' words, and the exercise still works for the visit
  await open('still&os-fixture=storage-unavailable');
  p.check('with storage refused the record is still read (for the visit)', await p.until(`!document.getElementById('drill-start').disabled`, 10000));
  x = await dr();
  p.check("the bar says so in the bindings' storage-off words", x.offMsg === STORAGE_OFF && x.kept === false, x.offMsg);
  await button('drill-start');
  const it2 = (await dr()).item;
  for (const id of await rightOrder(it2.steps)) await press(id);
  x = await dr();
  p.check('and the exercise still checks and counts', x.mode === 'checked' && x.result.right && x.count === '1 answered, 1 right', JSON.stringify({ m: x.mode, c: x.count }));
  await p.ev(`document.getElementById('drill-bar').scrollIntoView({ block: 'center' })`);
  await p.shot('11-storage-off');

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
