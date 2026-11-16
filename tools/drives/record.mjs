// The lab's one record, across its two rooms (slice A of Exomania's level 2: tickets 2.02 and 2.08). Run with
// tools/drive.mjs:
//   node tools/drive.mjs tools/drives/record.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 420
//   (and again with --width 390 --height 844)
//
// The properties are written at the head of labs/assets/js/exoplanet/tests/record.contract.test.mjs. This scenario
// proves in a browser the ones a browser must show, each check named with its property:
//   P4 a record of version 2 and the survey's old local copy of the catalogue, as the live site left them, are read
//      at version 3 with every entry kept, the copy taken in and removed from localStorage, and "new since your last
//      visit" counted from it; a fixture store leaves the copy where it is;
//   P5 the erase the privacy page points to (the labs hub, "Your data", "Delete everything") leaves nothing of the
//      lab, and the export holds the record whole;
//   P7 the log's last words carry the health check;
//   P8 a clock opened on the sky is a visit "from the sky" in the survey's log, with the day the sky was at, unless
//      recording is off; the line's link opens the sky on that planet at that day, with a real pointer, and is no
//      visit itself.
// After every step on the lab's two rooms the rules of tools/drives/invariants.mjs hold (standard()). The hub, which
// this scenario visits only to press its erase, is not held to them here: on 2026-11-16 its shared chrome had a label
// at 2.27 to 1 and a gold "/ labs" on the privacy page, which belong to the site's frame and not to this slice.
//
// No model is called and nothing leaves the page's own origin: the guard below runs before the page's own scripts.

import { standard, gold } from './invariants.mjs';
import { SURVEY_GOLD } from './shapes.mjs';

const SKY_GOLD = { allow: ['.bp', '.los-bk', '.lamp.kept', '.tally-marks .tl-kept', '.fill.kept', '.lbr-panel'] };
const LEGACY = 'exo:seen:v1';
const PLANET = 'KELT-9 b', DAY = '2031-03-12';   // a planet of the sky the old record never held

/* ---- run before the page's own scripts ---- */
function guard() {
  const real = window.fetch.bind(window);
  window.fetch = (u, o = {}) => (new URL(typeof u === 'string' ? u : u.url, location.href).origin === location.origin ? real(u, o) : Promise.reject(new TypeError('refused by the drive')));
}

/* ---- run inside the page ---- */
function rawRecord() {
  return new Promise((resolve) => {
    const req = indexedDB.open('labs');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('progress', 'readonly'); const g = tx.objectStore('progress').get('exomania'); tx.oncomplete = () => { db.close(); resolve(g.result ? { v: g.result.v, data: g.result.data } : null); }; tx.onerror = () => { db.close(); resolve('read failed'); }; };
    req.onerror = () => resolve('open failed');
  });
}
function writeRaw(data, v) {
  return new Promise((resolve) => {
    const req = indexedDB.open('labs');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('progress', 'readwrite'); tx.objectStore('progress').put({ lab: 'exomania', v, data, updated: Date.now(), resume: null, due: [], finished: false }); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => { db.close(); resolve(String(tx.error)); }; };
    req.onerror = () => resolve('open failed');
  });
}
function eraseStore() {
  return new Promise((resolve) => {
    const req = indexedDB.open('labs');
    req.onsuccess = () => { const db = req.result; const tx = db.transaction(['events', 'progress', 'meta'], 'readwrite'); ['events', 'progress', 'meta'].forEach((s) => tx.objectStore(s).clear()); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => { db.close(); resolve(false); }; };
    req.onerror = () => resolve(false);
  });
}
function local(key, value) { if (value === undefined) return localStorage.getItem(key); if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); return true; }
async function fixture() { return (await fetch(new URL('assets/js/exoplanet/tests/fixtures/record_old.json', location.href).href)).json(); }
async function osDo(what, arg) {
  const os = (await import(new URL('assets/js/os/index.js', location.href).href)).LabsOS.instance;
  if (!os) return null;
  if (what === 'recording') { await os.recording.set(arg); return os.recording.on; }
  if (what === 'export') { const d = await os.privacy.exportAll(); return d.progress.filter((r) => r.lab === 'exomania').map((r) => ({ v: r.v, data: r.data })); }
  return null;
}
function noThanks() { const b = [...document.querySelectorAll('button')].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); return true; }
function logState() {
  const body = document.getElementById('log-body');
  const lines = [...document.querySelectorAll('#log-body [data-sec="visited"] .log-list li')].map((li) => {
    const a = li.querySelector('.log-sky'), r = a ? a.getBoundingClientRect() : null;
    return { name: (li.querySelector('.log-open') || {}).textContent || '', what: (li.querySelector('.log-what') || {}).textContent || '', link: a ? a.textContent : '', href: a ? a.getAttribute('href') : '',
      at: r ? { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, h: r.height, w: r.width } : null };
  });
  return { open: document.getElementById('log').open, line: document.getElementById('log-line').textContent, lines, foot: ((body && body.querySelector('.log-foot')) || {}).textContent || '' };
}
function newSwitch() { const s = document.querySelector('#filters [data-act="new"] .sw-name'); return s ? s.textContent : ''; }

/* ---- the scenario ---- */
export default async function record(p, { base }) {
  await p.before(`(${guard})()`);
  // the lab's two rooms, the survey and the sky, each with its own gold; the hub is visited for its erase only
  const ROOM = '/\\/exomania(-survey)?\\.html$/.test(location.pathname)';
  const rules = standard();
  for (const [name, expr] of rules.slice(0, 3)) p.invariant(name, `(${ROOM} ? ${expr} : [])`);
  p.invariant(rules[3][0], `(/exomania-survey\\.html$/.test(location.pathname) ? ${gold(SURVEY_GOLD)} : /exomania\\.html$/.test(location.pathname) ? ${gold(SKY_GOLD)} : [])`);
  const call = (fn, ...args) => p.ev(`(${fn})(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const survey = async (query = '') => {
    await p.go(`${base}/labs/exomania-survey.html?still${query ? '&' + query : ''}`);
    await p.until('(() => { const n = (document.getElementById("ret-name") || {}).textContent; return !!n && n.trim().length > 1 && n.trim() !== "…"; })()', 90000);
    await p.until('!!document.getElementById("log").dataset.store', 30000);   // the stored log has been read
    await p.sleep(500);
    await call(noThanks);
  };
  const sky = async (query = '') => {
    await p.go(`${base}/labs/exomania.html?still${query ? '&' + query : ''}`);
    await p.until('document.body.dataset.state === "ready"', 60000);
    await call(noThanks);
  };
  const probe = () => p.ev('(() => { const q = document.getElementById("sky").probe(); return { star: q.star, date: q.date }; })()');
  const pick = (name) => p.ev(`(() => { const i = document.getElementById("pick"); i.value = ${JSON.stringify(name)}; document.getElementById("pick-form").requestSubmit(); return true; })()`);
  const openLog = async () => { await p.ev('(document.getElementById("log-line").click(), true)'); await p.until('document.getElementById("log").open && !!document.querySelector("#log-body .log-foot")', 6000); return call(logState); };
  const topIs = (name) => `(${rawRecord})().then((r) => !!r && !!r.data && !!r.data.log && !!r.data.log.visits[0] && r.data.log.visits[0].name === ${JSON.stringify(name)})`;

  // ---- P4: the record of version 2 and the old local copy, as the live site left them ----
  await survey();
  const old = await call(fixture);
  await call(eraseStore);
  await call(writeRaw, old.v2.data, 2);
  await call(local, LEGACY, old.local.value);
  await survey();
  const up = await call(rawRecord), gone = await call(local, LEGACY);
  p.check('P4: the stored record of version 2 is read at version 3, with the sky\'s slice, every saved world, visit and pin, and the count of dropped visits, as they were',
    !!up && up.v === 3 && same(up.data.overdue, old.v2.data.overdue) && same(up.data.log, old.v2.data.log), JSON.stringify(up && { v: up.v, visits: up.data.log.visits.length, saved: up.data.log.saved.length, pins: up.data.log.pins }));
  p.check('P4: the survey\'s old local copy of the catalogue is taken into the record and is gone from localStorage', gone === null && !!up && !!up.data.seen && up.data.seen.day !== undefined, `localStorage ${gone === null ? 'empty' : 'still holds it'} | seen ${up && up.data.seen && up.data.seen.day}`);
  await p.until(`(${newSwitch})() !== ""`, 30000);
  const fresh = await call(newSwitch), planets = Number(String(await p.ev('document.getElementById("tb-n").textContent')).match(/^[\d,]+/)[0].replace(/,/g, ''));
  const was = JSON.parse(old.local.value).names.length;
  p.check('P4: "new since your last visit" counts the worlds the old copy did not have', fresh === `${(planets - was).toLocaleString('en-US')} new since your last visit`, `${fresh} | ${planets} planets, ${was} in the old copy`);
  const lines0 = await openLog();
  p.check('P4: the log lists the visits of the old record, with their ways', lines0.lines.length === old.v2.data.log.visits.length - 1 && lines0.lines.every((l) => l.what.length > 2 && !l.link), `${lines0.lines.length} lines | ${lines0.line}`);
  p.check('P7: the log\'s last words carry the health check', lines0.foot.includes('This page writes version 3 of the record, and the stored record is version 3. No copy is synced to another device.'), lines0.foot);
  await p.ev('(document.querySelector("[data-close=log]").click(), true)');
  await p.until('!!document.getElementById("tb-n") && /measured radius/.test(document.getElementById("tb-n").textContent)', 30000);   // the weekly roster has joined
  await p.sleep(2500);
  await survey();
  await p.until('/measured radius/.test(document.getElementById("tb-n").textContent)', 30000);
  await p.sleep(3000);
  p.check('P4: on the next visit nothing is new: the record holds the catalogue it saw', (await call(newSwitch)) === '', await call(newSwitch));

  // ---- P8: a clock opened on the sky is a visit from the sky, at the sky's day ----
  await sky(`date=${DAY}`);
  const at0 = await probe();
  await pick(PLANET);
  const wrote = await p.until(topIs(PLANET), 8000);
  const afterSky = await call(rawRecord), top = afterSky && afterSky.data.log.visits[0];
  p.check('P8: the sky was at the day of its address when the clock was opened', at0.date === DAY, at0.date);
  p.check('P8: the clock opened on the sky is a visit from the sky, with the day the sky was at, and the sky\'s planet is kept', wrote && same(top, { name: PLANET, t: top.t, via: 'sky', n: 1, at: DAY }) && afterSky.data.overdue.planet === PLANET,
    JSON.stringify(top));
  p.check('P8: and the rest of the log is as it was', same(afterSky.data.log.saved, up.data.log.saved) && same(afterSky.data.log.pins, up.data.log.pins) && same(afterSky.data.log.visits.slice(1), up.data.log.visits), `${afterSky.data.log.visits.length} visits`);

  // ---- P8: the survey's log shows it, and its line reopens the clock there ----
  await survey();
  const lg = await openLog();
  const line = lg.lines.find((l) => l.name === PLANET);
  const words = `its clock on 12${String.fromCharCode(160)}March${String.fromCharCode(160)}2031`;
  p.check('P8: the survey\'s log lists the sky\'s visit first, "from the sky", with a link to its clock on that day', !!line && lg.lines[0].name === PLANET && line.what === 'from the sky' && line.link === words && line.href === `exomania.html?planet=${encodeURIComponent(PLANET)}&date=${DAY}`,
    JSON.stringify(line));
  p.check('P8: only the sky\'s visit carries such a link', lg.lines.filter((l) => l.link).length === 1, lg.lines.filter((l) => l.link).map((l) => l.name).join(', '));
  await p.ev(`(() => { const a = document.querySelector('#log-body .log-sky'); a.scrollIntoView({ block: 'center' }); return true; })()`);
  await p.sleep(400);
  await p.shot('record-log-sky');
  const lg2 = await call(logState), target = lg2.lines.find((l) => l.name === PLANET).at;
  await p.click(target.x, target.y);
  await p.until('location.pathname.endsWith("/exomania.html") && document.body.dataset.state === "ready"', 60000);
  await p.sleep(600);
  const back = await probe();
  p.check('P8: a press on the line opens the sky on that planet at that day', back.star === PLANET && back.date === DAY && (await p.ev('location.search')) === `?planet=${encodeURIComponent(PLANET)}&date=${DAY}`, JSON.stringify(back));
  await p.shot('record-sky-reopened');
  const afterLink = await call(rawRecord);
  p.check('P8: the clock the link opened is no new visit', afterLink.data.log.visits[0].name === PLANET && afterLink.data.log.visits[0].n === 1 && afterLink.data.log.visits[0].t === top.t, JSON.stringify(afterLink.data.log.visits[0]));

  // ---- P8: with recording off the sky keeps its planet and writes no visit ----
  await call(osDo, 'recording', false);
  const before = afterLink.data.log.visits.find((v) => v.name === 'HD 209458 b');
  await pick('HD 209458 b');
  await p.until(`(${rawRecord})().then((r) => !!r && r.data.overdue.planet === "HD 209458 b")`, 8000);
  await p.sleep(400);
  const off = await call(rawRecord);
  p.check('P8: with recording off the sky keeps the planet opened and writes no visit', off.data.overdue.planet === 'HD 209458 b' && same(off.data.log.visits, afterLink.data.log.visits) && same(off.data.log.visits.find((v) => v.name === 'HD 209458 b'), before),
    JSON.stringify(off.data.log.visits[0]));
  await call(osDo, 'recording', true);

  // ---- P5: the export holds the record whole, and the erase the privacy page points to leaves none of it ----
  await p.go(`${base}/labs/index.html`);
  await p.until('!!document.querySelector(".los-btn[data-act=delete]") && !document.querySelector(".los-btn[data-act=delete]").disabled', 60000);
  await call(noThanks);
  const exported = await call(osDo, 'export'), stored = await call(rawRecord);
  p.check('P5: the export holds the lab\'s one record whole, the catalogue seen and the sky\'s visit included', !!exported && exported.length === 1 && same(exported[0], stored) && !!stored.data.seen && stored.data.log.visits.some((v) => v.via === 'sky'), `${exported && exported.length} records`);
  await p.ev('(document.querySelector(".los-btn[data-act=delete]").click(), true)');
  await p.until('!!document.querySelector(".los-btn[data-act=confirm]") && !document.querySelector(".los-confirm").hidden', 5000);
  await p.ev('(document.querySelector(".los-btn[data-act=confirm]").click(), true)');
  await p.until(`(${rawRecord})().then((r) => r === null)`, 8000);
  const erased = await call(rawRecord), legacy = await call(local, LEGACY);
  p.check('P5: the hub\'s "Delete everything" leaves no record of the lab and no old local copy', erased === null && legacy === null, `${JSON.stringify(erased)} | ${legacy}`);
  await survey();
  const empty = await p.ev('document.getElementById("log-line").textContent');
  p.check('P5: and the survey\'s log is empty after it', /Log: 0 visited, 0 saved/.test(empty), empty);

  // ---- P4: a fixture store leaves the old local copy where it is ----
  // (the survey loaded just now, with recording on, has kept its catalogue in the visitor's own store: that record is
  // the one the fixture page must leave as it is)
  const realBefore = await call(rawRecord);
  await call(local, LEGACY, old.local.value);
  await survey('os-fixture=first-visit');
  await p.until('/measured radius/.test(document.getElementById("tb-n").textContent)', 30000);
  await p.sleep(2500);
  const kept = await call(local, LEGACY), real = await call(rawRecord);
  p.check('P4: on a fixture store the old local copy is neither taken in nor removed, and the visitor\'s own store is left as it was', kept === old.local.value && same(real, realBefore),
    `${kept === old.local.value ? 'kept' : 'changed'} | own store ${same(real, realBefore) ? 'as it was' : 'changed'}`);
  await call(local, LEGACY, null);
}
