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
   - after every step: no sideways scroll, every target at least
     44 px at 390, every text legible, gold only on what fired.
   ============================================================ */
import { standard } from '../invariants.mjs';

const PAGE = '/labs/orthogonal.html';
// the plate's corners, the branch that fired, and the legend's swatch that says what that gold means
const GOLD = ['.corner', '.edge.fired', '.edge.thread', '.leader', '.node.fired .sq', '.lg.gold'];

export default async function orthogonal(p, { base, width }) {
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
  p.check('the two branches are named over their lanes, and a legend says what gold, dots and dashes mean', named.heads === 'Earth|This world' && /branch this world took/.test(named.legend) && /Earth's branch/.test(named.legend), JSON.stringify(named));
  if (width >= 1000) {
    const boxes = await p.ev(`(() => { const a = document.querySelector('.art-view').getBoundingClientRect(), e = document.querySelector('.earth-view').getBoundingClientRect();
      return { a: [Math.round(a.top), Math.round(a.bottom)], e: [Math.round(e.top), Math.round(e.bottom)] }; })()`);
    p.check("the render and Earth's ghost share one box, so the two lamps stand on one ground line", boxes.a[0] === boxes.e[0] && boxes.a[1] === boxes.e[1], JSON.stringify(boxes));
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
    const dash = [...document.querySelectorAll('.edge.fired')].map((e) => parseFloat(getComputedStyle(e).strokeDashoffset) || 0);
    // what the visitor sees, not a class: the mask's radius on the render (0 px: none of it shows)
    const reveal = parseFloat(getComputedStyle(document.getElementById('art-img')).getPropertyValue('--reveal'));
    return { fog: document.getElementById('art').classList.contains('fog') && reveal < 40, reveal, drawing: dash.filter((d) => d > 1).length,
      ms: Math.round(performance.now() - o.startedAt), revealAt: o.revealAt };
  })()`);
  p.check('live, the gold strand is still drawing and the render waits in the fog', early.fog && early.drawing > 0, JSON.stringify(early));
  await p.shot('05-ignition');
  p.check('and surfaces once the strand has reached it', await p.until('!document.getElementById("art").classList.contains("fog")', 8000));
  const lifted = await p.ev(`Number(document.getElementById('art').dataset.liftedAt) - window.__orthogonal.startedAt`);
  p.check('never before the strand reaches the artifact', lifted >= early.revealAt - 5, `${Math.round(lifted)} ms, the strand arrives at ${early.revealAt} ms`);
  await p.sleep(1600);
  await p.shot('06-surfaced');

  // ---- reduced motion: the finished frame at once
  await p.media([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await open('x=2');
  s = await state();
  p.check('under reduced motion the plate opens finished', !s.fog && (await p.ev(`document.getElementById('lineage-svg').getAnimations({ subtree: true }).length`)) === 0);
  await p.media([]);
}
