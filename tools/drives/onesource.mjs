// One number, one source (ticket 2.14): the survey's DOM prints what the functions tests/onesource.test.mjs reads.
// Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/onesource.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 300
//   and again at --width 390 --height 844
//
// The Node test reads the pure functions for all 6,464 planets; this drive checks, for the worlds whose numbers the
// ticket changed, that the page shows those functions' words: sheet B's starlight, Teq and zone rows, the line under
// the name, view D's caption, the survey note and the compare bench. The expected text is computed here, in Node, from
// the same modules and the same snapshot the page loads. The rules of tools/drives/invariants.mjs hold after every step.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { standard } from './invariants.mjs';
import { SURVEY_GOLD } from './shapes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAB = join(ROOT, 'labs/assets/js/exoplanet');
const imp = (f) => import(pathToFileURL(join(LAB, f)).href);

// WASP-17 b: a star whose mass is from Stassun et al. 2017, so the archive's orbit; Kepler-47 c: a planet of two stars
const WORLDS = ['Kepler-1649 c', 'HD 28109 b', 'TRAPPIST-1 e', 'Teegarden\'s Star b', '55 Cnc e', 'Proxima Cen b', 'WASP-17 b', 'Kepler-47 c'];
const slug = (n) => n.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

async function expected() {
  const json = JSON.parse(readFileSync(join(ROOT, 'labs/assets/data/exomania/pscomppars-snapshot.json'), 'utf8'));
  const keep = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  try {
    const { loadSnapshot } = await imp('catalog.js');
    const { sheetRows, reticleZone } = await imp('views/target.js');
    const { systemModel, systemCaption, insetModel } = await imp('views/system.js');
    const { byOrbit } = await imp('starlight.js');
    const { fmt } = await imp('views/common.js');
    const { compareHTML } = await imp('panels.js');
    const { facts, deterministicNote } = await imp('report.js');
    const { list } = await loadSnapshot();
    const out = {};
    for (const n of WORLDS) {
      const p = list.find((x) => x.name === n), rows = sheetRows(p, 0.3), all = [...rows.measured, ...rows.inferred];
      const r = (k) => all.find((x) => x.key === k) || {};
      const sys = byOrbit(list.filter((q) => q.host === p.host));   // the order main.js keeps a system in
      const im = insetModel(p, sys);
      const bench = compareHTML([p], { name: 'Earth', host: 'Sun', R: 1, Rerr: 0, M: 1, Mprov: 'Mass', Mlim: 0, P: 365.25, a: 1, ecc: 0.0167, S: 1, Teq: 255, Teff: 5772, Rs: 1, Ms: 1, logL: 0, dist: null, refs: {}, lim: {}, measuredR: true }, 0.3);
      const cell = (h) => { const m = bench.match(new RegExp(`<tr><th>${h}</th><td>.*?</td><td>(.*?)</td></tr>`)); return m ? flat(m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")) : null; };
      out[n] = {
        S: { v: r('S').v, pm: r('S').pm || '' }, T: { v: r('teq').v, pm: r('teq').pm || '' }, zone: r('zone').v, a: r('a').v,
        inset: `The ${p.host} system in miniature: ${im.orbits.length === 1 ? 'one orbit' : `${im.orbits.length} orbits`}${im.hz ? `, habitable zone ${fmt(im.hz.inner, 2)} to ${fmt(im.hz.outer, 2)} AU` : ''}`,
        reticle: reticleZone(p), caption: systemCaption(systemModel(p, sys), false), note: deterministicNote(p, facts(p, 0.3), true),
        bench: { S: cell('Insolation'), T: cell('Teq'), zone: cell('Zone') },
      };
    }
    return out;
  } finally { globalThis.fetch = keep; }
}

const READ = `(() => {
  const t = (q) => { const e = document.querySelector(q); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; };
  const row = (k) => ({ v: t('#nums tr[data-row="' + k + '"] td.v'), pm: t('#nums tr[data-row="' + k + '"] td.pm') || '' });
  const inset = document.getElementById('inset');
  return { S: row('S'), T: row('teq'), a: row('a').v, inset: inset && inset.getClientRects().length ? inset.getAttribute('aria-label') : null, zone: t('#nums tr[data-row="zone"] td.v'), reticle: t('#ret-class'), caption: t('[data-k="syscap"]'), note: t('#report [data-k="body"]'), name: t('#ret-name') };
})()`;
const BENCH = (n) => `(() => {
  const tb = document.querySelector('#compare-body table'); if (!tb) return null;
  const heads = [...tb.querySelectorAll('thead th')].map((th) => th.textContent);
  const i = heads.findIndex((h) => h.includes(${JSON.stringify(n)})); if (i < 0) return null;
  const cell = (k) => { const tr = [...tb.querySelectorAll('tbody tr')].find((r) => r.querySelector('th').textContent === k); return tr ? tr.children[i].textContent.replace(/\\s+/g, ' ').trim() : null; };
  return { S: cell('Insolation'), T: cell('Teq'), zone: cell('Zone') };
})()`;
const ready = (n) => `((document.getElementById('ret-name') || {}).textContent || '').trim() === ${JSON.stringify(n)} && document.body.classList.contains('ready') && !!document.querySelector('#nums tr[data-row="zone"]')`;

export default async function onesource(p, { base, width }) {
  for (const [name, expr] of standard({ gold: SURVEY_GOLD })) p.invariant(name, expr);
  const want = await expected();
  for (const n of WORLDS) {
    await p.go(`${base}/labs/exomania-survey.html?still&p=${encodeURIComponent(n)}`);
    const ok = await p.until(ready(n), 30000);
    p.check(`${n} opens`, ok, n);
    await p.sleep(400);
    const got = await p.ev(READ), w = want[n];
    p.check(`${n}: sheet B prints the starlight the function gives, with its range`, got.S.v === w.S.v && got.S.pm === w.S.pm, `${JSON.stringify(got.S)} against ${JSON.stringify(w.S)}`);
    p.check(`${n}: sheet B prints the equilibrium temperature the function gives, with its range`, got.T.v === w.T.v && got.T.pm === w.T.pm, `${JSON.stringify(got.T)} against ${JSON.stringify(w.T)}`);
    p.check(`${n}: sheet B's zone word`, got.zone === w.zone, `${got.zone} against ${w.zone}`);
    p.check(`${n}: sheet B prints the page's one orbit`, got.a === w.a, `${got.a} against ${w.a}`);
    // sheet A's inset is drawn at desktop widths only; where it is, its label is insetModel's
    if (got.inset !== null) p.check(`${n}: sheet A's inset draws the system and zone insetModel gives`, got.inset === w.inset, `${got.inset} || ${w.inset}`);
    p.check(`${n}: the line under the name ends with its zone`, !!got.reticle && got.reticle.endsWith(w.reticle), `${got.reticle} against ${w.reticle}`);
    p.check(`${n}: view D's caption`, got.caption === flat(w.caption), `${got.caption} || ${flat(w.caption)}`);
    p.check(`${n}: the survey note`, got.note === flat(w.note), `${got.note} || ${flat(w.note)}`);
    // the bench: pin the world, which opens the compare dialog, and read its column
    const pinOn = await p.until(`!!document.querySelector('[data-act="pin"]') && !document.querySelector('[data-act="pin"]').disabled`, 15000);
    if (pinOn) {
      await p.ev(`document.querySelector('[data-act="pin"]').click()`);
      await p.until(`document.getElementById('compare').open`, 5000);
      await p.sleep(300);
      const b = await p.ev(BENCH(n));
      p.check(`${n}: the bench prints the same starlight, Teq and zone`, !!b && b.S === w.bench.S && b.T === w.bench.T && b.zone === w.bench.zone, `${JSON.stringify(b)} against ${JSON.stringify(w.bench)}`);
      await p.ev(`document.getElementById('compare').close()`);
    } else p.check(`${n}: the pin is offered once the log is read`, false, 'the pin stayed off');
    if (n === 'Kepler-1649 c') {
      await p.ev(`document.getElementById('sheet-b').scrollIntoView({ block: 'start' })`);
      await p.sleep(400);
      await p.shot(`${slug(n)}-sheet-b-${width}`);
      await p.ev(`document.getElementById('sheet-d').scrollIntoView({ block: 'start' })`);
      await p.sleep(600);
      await p.shot(`${slug(n)}-system-${width}`);
    }
  }
}
