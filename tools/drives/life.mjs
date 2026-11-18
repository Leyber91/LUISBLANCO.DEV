// If there were life (life.js, views/life.js): the switch on sheet A, the sheet under the note, the cover the picture
// draws. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/life.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 600
//   and again at --width 390 --height 844
//
// Off by default: no sheet, no cover. On: the sheet says no life is known, names its case, draws its strip, and the
// values uploaded to the planet's shader program (uPlant, uLife, read back from WebGL) are the chosen reading's colour
// and amount as its swatch shows them; the address keeps it. An M dwarf's world opened with reading b from the address
// shows b chosen, and pressing a moves the uploaded cover and keeps the key focused. "Data only" uploads no cover and
// the sheet says so. Choosing a bare scenario for GJ 1061 d takes its life away on the sheet and in the picture. A
// giant shows its reason and no cover. Nothing on the sheet is gold. The page is no wider than the window.
import { seedRandom, buildPrograms } from './survey.mjs';

const sel = (n) => `((document.getElementById('ret-name') || {}).textContent || '').trim() === ${JSON.stringify(n)} && document.body.classList.contains('ready')`;
const STATE = `(() => {
  const s = document.getElementById('life-sheet'), sw = document.getElementById('btn-life'), e = window.__exoEngine, c = e && e.cfg;
  // what was uploaded to the program that draws this planet's look, read back from WebGL
  const ent = e && e.programs && c ? e.programs[c.type] : null, prog = ent && ent.prog, gl = e && e.gl;
  const uni = (n) => { if (!prog) return null; const l = gl.getUniformLocation(prog, n); if (!l) return null; const v = gl.getUniform(prog, l); return typeof v === 'number' ? v : [...v]; };
  // the chosen reading's swatch (the pressed key, or the only swatch), its colour as linear RGB and its cover in percent
  const chosen = s && (s.querySelector('button[data-reading][aria-pressed="true"]') || s.querySelector('.life-sw'));
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const rgb = chosen ? (chosen.querySelector('.chip').style.background.match(/\\d+/g) || []).map(Number).map(lin) : null;
  const pct = chosen ? +((chosen.textContent.match(/covers (\\d+)%/) || [])[1]) : null;
  // gold: the computed colours of the two gold tokens, matched against the text, fill and stroke of every element
  const probe = document.createElement('span'); document.body.append(probe);
  const golds = ['--accretion', '--accretion-soft'].map((t) => { probe.style.color = 'var(' + t + ')'; return getComputedStyle(probe).color; }); probe.remove();
  const isGold = (x) => { const cs = getComputedStyle(x); return [cs.color, cs.fill, cs.stroke, cs.borderLeftColor].some((v) => golds.includes(v)); };
  return { on: sw && sw.getAttribute('aria-checked'), hidden: s ? s.hidden : null, words: s ? s.textContent.replace(/\\s+/g, ' ').trim() : '',
    strip: !!(s && s.querySelector('svg.life-strip path.refl')), keys: s ? [...s.querySelectorAll('button[data-reading]')].map((b) => b.dataset.reading + ':' + b.getAttribute('aria-pressed')) : [],
    focused: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.reading || null : null,
    life: uni('uLife'), plant: uni('uPlant'), swatch: rgb, pct, plainLine: !!(s && s.querySelector('.life-plain')),
    gold: s ? [...s.querySelectorAll('*')].filter(isGold).length : 0,
    url: location.search, wide: document.documentElement.scrollWidth, win: window.innerWidth };
})()`;
const sameAsSheet = (r) => !!r.plant && !!r.swatch && r.swatch.length === 3 && r.plant.every((v, i) => Math.abs(v - r.swatch[i]) < 0.006) && Math.round(r.life * 100) === r.pct;

export default async function life(p, { base, width }) {
  await seedRandom(p);
  await buildPrograms(p, { base });   // before any frame is judged (tools/drives/survey.mjs, ticket 2.22)
  const open = async (n, q = '') => { await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent(n)}${q}&still&os-fixture=sharing-off`); return p.until(sel(n), 90000); };

  p.check('a temperate world opens with life off', await open('Kepler-1512 b'), '');
  await p.sleep(800);
  const off = await p.ev(STATE);
  p.check('off: the switch reads off, the sheet is hidden and the picture draws no cover', off.on === 'false' && off.hidden === true && off.life === 0, JSON.stringify({ on: off.on, hidden: off.hidden, life: off.life }));
  await p.ev(`document.getElementById('btn-life').click()`);
  await p.sleep(900);
  const on = await p.ev(STATE);
  p.check('on: the sheet says no life is known and names its case, with its strip', on.on === 'true' && on.hidden === false && /No life is known on any planet but Earth/.test(on.words) && / case of Kiang et al\. 2007/.test(on.words) && on.strip, on.words.slice(0, 200));
  p.check('on: the picture draws the cover the sheet shows, its colour and amount', on.life > 0 && sameAsSheet(on), `${on.plant} ${on.life} against ${on.swatch} ${on.pct}%`);
  p.check('on: the address keeps it', /(^|[?&])life=a(&|$)/.test(on.url), on.url);
  p.check(`on: nothing on the sheet is gold, and the page is no wider than the window at ${width}`, on.gold === 0 && on.wide <= on.win, `gold ${on.gold}, ${on.wide} in ${on.win}`);

  p.check('an M dwarf\'s world opens with reading b from the address', await open('TOI-700 d', '&life=b'), '');
  await p.sleep(800);
  const b = await p.ev(STATE);
  p.check('two readings, b chosen, and the uploaded cover is b\'s', b.keys.join(' ') === 'a:false b:true' && sameAsSheet(b), `${b.keys.join(' ')} ${b.plant} ${b.life} against ${b.swatch} ${b.pct}%`);
  await p.ev(`document.querySelector('#life-sheet button[data-reading="a"]').click()`);
  await p.sleep(900);
  const a = await p.ev(STATE);
  p.check('pressing a chooses it, uploads its colour and amount, keeps the key focused, and the address follows', a.keys.join(' ') === 'a:true b:false' && sameAsSheet(a) && a.plant.join() !== b.plant.join() && a.focused === 'a' && /(^|[?&])life=a(&|$)/.test(a.url),
    `${a.keys.join(' ')} focus ${a.focused} ${a.plant} ${a.life} ${a.url}`);
  await p.ev(`document.getElementById('btn-plain').click()`);
  await p.sleep(900);
  const plain = await p.ev(STATE);
  p.check('"data only" uploads no cover, and the sheet stays and says so', plain.life === 0 && plain.hidden === false && plain.plainLine, `life ${plain.life}, hidden ${plain.hidden}, line ${plain.plainLine}`);

  p.check('GJ 1061 d opens with life on', await open('GJ 1061 d', '&life=a'), '');
  await p.sleep(800);
  const d0 = await p.ev(STATE);
  const bare = await p.ev(`(() => { const a = document.querySelector('#ret-render a[data-air="bare"]'); if (a) a.click(); return !!a; })()`);
  await p.sleep(1200);
  const d1 = await p.ev(STATE);
  p.check('choosing the bare scenario takes its life away on the sheet and in the picture', d0.strip && d0.life > 0 && bare && !d1.strip && /keeps no air to hold water/.test(d1.words) && !d1.life && /(^|[?&])air=bare(&|$)/.test(d1.url),
    `before: strip ${d0.strip} life ${d0.life}; link ${bare}; after: strip ${d1.strip} life ${d1.life} ${d1.url} | ${d1.words.slice(0, 160)}`);

  p.check('a giant opens with life on', await open('51 Peg b', '&life=a'), '');
  await p.sleep(800);
  const g = await p.ev(STATE);
  p.check('a giant: its reason alone, no strip, no cover', /gas giant with no surface/.test(g.words) && !g.strip && !g.life, `${g.words.slice(0, 220)} | life ${g.life}`);
}
