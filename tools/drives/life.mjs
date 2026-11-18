// If there were life (life.js, views/life.js): the switch on sheet A, the sheet under the note, the cover the picture
// draws. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/life.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 600
//   and again at --width 390 --height 844
//
// Off by default: no sheet, no cover. On: the sheet says no life is known, names its case, draws its strip, and the
// picture's cover is the first reading's colour and amount; the address keeps it. A red dwarf's second reading is a key
// that moves the cover. "Data only" (the clouds switch) takes the cover away and leaves the sheet. A giant shows its
// reason and no cover. Nothing on the sheet is gold. The page is no wider than the window.
import { seedRandom, buildPrograms } from './survey.mjs';

const sel = (n) => `((document.getElementById('ret-name') || {}).textContent || '').trim() === ${JSON.stringify(n)} && document.body.classList.contains('ready')`;
const STATE = `(() => {
  const s = document.getElementById('life-sheet'), sw = document.getElementById('btn-life'), e = window.__exoEngine, c = e && e.cfg;
  // the chosen reading's swatch (the pressed key, or the only swatch), its colour as linear RGB and its cover in percent
  const chosen = s && (s.querySelector('button[data-reading][aria-pressed="true"]') || s.querySelector('.life-sw'));
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const rgb = chosen ? (chosen.querySelector('.chip').style.background.match(/\\d+/g) || []).map(Number).map(lin) : null;
  const pct = chosen ? +((chosen.textContent.match(/covers (\\d+)%/) || [])[1]) : null;
  // gold: the computed colours of the two gold tokens, matched against every element of the sheet
  const probe = document.createElement('span'); document.body.append(probe);
  const golds = ['--accretion', '--accretion-soft'].map((t) => { probe.style.color = 'var(' + t + ')'; return getComputedStyle(probe).color; }); probe.remove();
  return { on: sw && sw.getAttribute('aria-checked'), hidden: s ? s.hidden : null, words: s ? s.textContent.replace(/\\s+/g, ' ').trim() : '',
    strip: !!(s && s.querySelector('svg.life-strip path.refl')), keys: s ? [...s.querySelectorAll('button[data-reading]')].map((b) => b.dataset.reading + ':' + b.getAttribute('aria-pressed')) : [],
    life: c ? c.life : null, plant: c && c.plant ? [...c.plant] : null, swatch: rgb, pct,
    gold: s ? [...s.querySelectorAll('*')].filter((x) => golds.includes(getComputedStyle(x).color)).length : 0,
    url: location.search, wide: document.documentElement.scrollWidth, win: window.innerWidth };
})()`;
// the picture draws what the sheet shows: the engine's cover colour within about one step in 255 of the swatch, its
// amount the swatch's percent
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

  p.check('a red dwarf\'s world opens with life on from the address', await open('K2-3 d', '&life=a'), '');
  await p.sleep(800);
  const a = await p.ev(STATE);
  p.check('two readings, a chosen', a.keys.join(' ') === 'a:true b:false', a.keys.join(' '));
  await p.ev(`document.querySelector('#life-sheet button[data-reading="b"]').click()`);
  await p.sleep(900);
  const b = await p.ev(STATE);
  p.check('pressing b chooses it, moves the cover to its colour and amount, and the address follows', b.keys.join(' ') === 'a:false b:true' && sameAsSheet(b) && sameAsSheet(a) && b.plant.join() !== a.plant.join() && /(^|[?&])life=b(&|$)/.test(b.url),
    `${b.keys.join(' ')} ${b.plant} ${b.life} ${b.url}`);
  await p.ev(`document.getElementById('btn-plain').click()`);
  await p.sleep(900);
  const plain = await p.ev(STATE);
  p.check('"data only" takes the cover away and leaves the sheet', plain.life === 0 && plain.hidden === false, `life ${plain.life}, hidden ${plain.hidden}`);

  p.check('a giant opens with life on', await open('Kepler-22 b', '&life=a'), '');
  await p.sleep(800);
  const g = await p.ev(STATE);
  p.check('a giant: its reason, no strip, no cover', /no surface/.test(g.words) && !g.strip && g.life === 0, `${g.words.slice(0, 220)} | life ${g.life}`);
}
