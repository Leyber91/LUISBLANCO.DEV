/* ============================================================
   tools/drives/exomania.mjs — Overdue, by hand.

   Run by `node tools/labs-wt.mjs drive exomania` (tools/drive.mjs).

   What it proves: the two data files load and the sheet says so;
   the labs' sharing question is drawn in the labs' own plate and
   can be answered; the sky holds every lamp and the count in its
   corner is the count in the table; the map and the line of time
   that sets its date are both whole on the first screen; a lamp
   is named under the pointer and read when pressed, on the map
   and under the lens; the one label on the map counts the K2
   fields; dragging the line of time moves the date, and the sky,
   the count and the one clock follow it into the past and past
   today; a finger that scrolls over the line moves nothing; the
   line answers the keyboard; a planet opens by name and a wrong
   name is refused in words; the night is drawn on load for an
   example place, a place can be set, refused when it is not one,
   and forgotten; the table lists what it says it lists; the
   planet and the place survive a reload through the labs' store;
   the tally is the one the lab's tests compute; a link made by
   the survey before it moved still reaches the survey. Each check
   that names a fault is one an independent review found on
   2026-11-14.

   After every step the rules of tools/invariants.mjs hold
   on whichever page the drive is on: no sideways scroll, every
   target 44 px tall at 390, every text 4.5 to 1, and gold only
   where the page allows it. The sky's gold is the gold of a kept
   clock (overdue.css .lamp.kept, and the kit's tally and filled
   action); its canvases draw kept clocks in that gold by the
   sky's own rule, so their pixels are not scanned. On the survey
   the rules are the survey's (shapes.mjs SURVEY_GOLD). Added on
   2026-11-16, when the review of pull request 42 found the sky
   scrolling sideways at 390 once its table was open, a state the
   one check for it here ran before.
   ============================================================ */

import { overflow, targets, contrast, gold } from '../invariants.mjs';
import { SURVEY_GOLD, SURVEY_COVER } from './shapes.mjs';

const SKY_GOLD = { allow: ['.bp', '.los-bk', '.lamp.kept', '.tally-marks .tl-kept', '.fill.kept', '.lbr-panel'] };

/* The four rules on whichever page of the labs a drive is on: the survey's gold on the survey, the sky's on the sky;
   a page outside labs/ (a dev sheet of tools/dev) is not a visitor's and keeps none of them. search.mjs, log.mjs,
   orbit.mjs and planets.mjs register these too. */
export function exomaniaRules() {
  const labs = (e) => `(/\\/labs\\//.test(location.pathname) ? ${e} : [])`;
  return [
    ['invariant: the page never scrolls sideways', labs(overflow())],
    ['invariant: every visible target is at least 44 px tall and 24 px wide at 390', labs(targets({ cover: SURVEY_COVER }))],
    ['invariant: every visible text is at least 4.5 to 1 against what is behind it', labs(contrast())],
    ['invariant: gold only where the page allows it', labs(`(/exomania-survey\\.html$/.test(location.pathname) ? ${gold(SURVEY_GOLD)} : ${gold(SKY_GOLD)})`)],
  ];
}

export default async function exomania(p, { base }) {
  for (const [n, e] of exomaniaRules()) p.invariant(n, e);
  p.frames();   // and no fully transparent pixel in any frame captured (tools/drive.mjs frames)
  const text = (id) => p.ev(`(document.getElementById(${JSON.stringify(id)}) || {}).textContent || ""`);
  const label = (id) => p.ev(`(document.getElementById(${JSON.stringify(id)}) || { getAttribute() { return ""; } }).getAttribute("aria-label") || ""`);
  const state = () => p.ev('document.body.dataset.state || ""');
  const rect = (id) => p.ev(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const ready = () => p.until('document.body.dataset.state === "ready"', 40000);
  const probe = () => p.ev('(() => { const q = document.getElementById("sky").probe(); return { lens: q.lens, wide: q.wide, lamps: q.lamps, lensLamps: q.lensLamps, star: q.star, date: q.date, k2: q.k2, named: q.named, up: q.up, papers: q.papers, same: q.same, live: q.live, nightHover: q.nightHover }; })()');
  const lampAt = (name) => p.ev(`document.getElementById("sky").probe().at(${JSON.stringify(name)})`);
  const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // the date shown, as the line's keyboard says it: in words (the kit's one convention for dates), read back as an ISO day
  const date = async () => { const t = String(await p.ev('document.getElementById("scrub").getAttribute("aria-valuetext") || ""')).replace(/\s+/g, ' ').trim(); const m = t.match(/^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/); return m && MONTHS.includes(m[2]) ? `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : `not a date in words: ${t}`; };
  const year = async () => Number((await date()).slice(0, 4));
  const setYear = (y) => p.ev(`(() => { const s = document.getElementById("scrub"); s.value = String(Math.round(2451545 + (${y} - 2000) * 365.25)); s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const open = (name) => p.ev(`(() => { const i = document.getElementById("pick"); i.value = ${JSON.stringify(name)}; document.getElementById("pick-form").requestSubmit(); })()`);
  const rowsShown = () => p.ev('document.querySelectorAll("#t-body tr").length');
  const total = async () => num(((await text('t-count')).match(/^([\d,]+) transit/) || [0, '0'])[1]);
  const upCount = async () => num(((await text('t-count')).match(/hours\. ([\d,]+) (is|are) up in the dark/) || [0, '0'])[1]);
  const show = (id) => p.ev(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: "center" })`);
  const today = () => p.ev('document.getElementById("to-today").click()');
  const DAY = '\\d+\\s[A-Z][a-z]+\\s';                                       // a date in words, up to its year: 14 November (its parts are held together by no-break spaces)
  const keyLive = () => p.ev('getComputedStyle(document.getElementById("key-live")).visibility');

  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the clocks and the published record load', await ready(), await state());
  const now = new Date(), isoToday = now.toISOString().slice(0, 10);

  // the labs' question about sharing usage: drawn as a plate of the labs, and answered like any visitor would
  const ask = await p.ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => /no thanks/i.test(x.textContent)); if (!b) return null; const plate = b.closest(".los-plate"); return { plate: !!plate, border: plate ? getComputedStyle(plate).borderTopStyle : "", family: getComputedStyle(b).fontFamily }; })()');
  p.check('the sharing question is drawn on the labs\' own plate, not as bare markup', !!ask && ask.plate && ask.border === 'solid' && /Plex Mono/.test(ask.family), JSON.stringify(ask));
  const under = await p.ev('(() => { const b = document.getElementById("band").getBoundingClientRect(); return [0.2, 0.5, 0.8].map((f) => { const n = document.elementFromPoint(b.x + b.width * f, b.y + b.height * 0.5); return n ? n.id || n.className : ""; }); })()');
  p.check('while it waits for an answer it leaves the line of time free, on a narrow sheet all of it', (await p.ev('window.innerWidth')) < 760 ? under.every((id) => id === 'band') : under.slice(0, 2).every((id) => id === 'band'), under.join(' | '));
  await p.ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); })()');
  await p.sleep(300);
  p.check('answered, it leaves the sheet', !(await p.ev('[...document.querySelectorAll("button")].some((x) => /no thanks/i.test(x.textContent) && x.offsetParent !== null)')));

  const q0 = await probe();
  p.check('the sky holds every lamp, on the map and again under the lens', q0.lamps + q0.lensLamps > 4729 + 1500 && (q0.lens ? q0.lensLamps === 0 : q0.lamps === 4729), `${q0.lamps} lamps on the sheet's canvas, ${q0.lensLamps} on the lens's own`);
  p.check('the count in the corner is a number of clocks, lost today', /^[\d,]+$/.test(await text('n-lost')) && /^of 4,729 transit clocks$/.test(await text('n-of')) && (await text('n-verb')) === 'are lost today' && (await text('n-if')) === '', `${await text('n-lost')} ${await text('n-of')} / ${await text('n-verb')}`);
  p.check('the line of time stands on today, and the title block carries the source', (await date()) === isoToday && q0.date === isoToday && /^NASA Exoplanet Archive, \d{1,2}\s(January|February|March|April|May|June|July|August|September|October|November|December)\s\d{4}$/.test(await text('tb-source')), `${await date()} / ${await text('tb-source')}`);
  const sky0 = await rect('sky'), band0 = await rect('band'), tall = await p.ev('window.innerHeight');
  p.check('the map and the line that sets its date are both whole on the first screen', sky0.y >= 0 && band0.y > sky0.y && band0.y + band0.h <= tall, `the map from ${Math.round(sky0.y)}, the line ends at ${Math.round(band0.y + band0.h)} of ${tall}`);
  const lostToday = num(await text('n-lost'));
  p.check('the count in the corner is the count in the table', (await text('s-lost')).startsWith(`${lostToday.toLocaleString('en-US')} (`) && /^2,431 \(/.test(await text('s-kept')) && /^1,910 \(/.test(await text('s-slipping')), `${await text('n-lost')} against ${await text('s-lost')}; kept ${await text('s-kept')}, slipping ${await text('s-slipping')}`);
  p.check('the sheet opens on the first transit timed, its name set upright', q0.star === 'HD 209458 b' && (await text('c-name')) === 'HD 209458 b' && /found 1999$/.test(await text('c-meta')) && (await p.ev('getComputedStyle(document.getElementById("c-name")).fontStyle')) === 'normal', await text('c-meta'));
  p.check('its clock is kept today, by a recent paper named once', /^The clock in use is from .+ 20\d\d\. Today it predicts the transit to ± [\d.]+ (ms|s|min), so the clock is kept\./.test(await text('c-status')) && !/(20\d\d), \1/.test(await text('c-status')), await text('c-status'));
  const seen = (await label('curve')).match(/a dip of ([\d.]+) %, where the transit itself is ([\d.]+) % deep/);
  p.check('the transit as light is said in words, and is never deeper than the transit', !!seen && Number(seen[1]) <= Number(seen[2]), await label('curve'));
  p.check('every published clock is a sentence in a list anybody can open, the one in use first', /^9 published clocks$/.test(await text('r-count')) && (await p.ev('document.querySelectorAll("#r-points li").length')) === 9 && /the clock in use/.test(await p.ev('document.querySelector("#r-points li").textContent')));
  p.check('and the drawing over the list holds the other eight, each as a mark of its own or counted on the clock\'s', q0.papers + q0.same === 8 && q0.papers >= 1, `${q0.papers} marks and ${q0.same} on the clock's own transit`);
  p.check('the key names the arc of a planet in transit while the sky shows it', q0.live && (await keyLive()) === 'visible', `live ${q0.live}, key ${await keyLive()}`);
  p.check('no planet\'s name is set in capitals, where its letter b would read as a companion star', !(await p.ev('[...document.querySelectorAll("summary, .mini, th")].some((n) => getComputedStyle(n).textTransform === "uppercase" && / [b-h]$| [b-h][ ,]/.test(n.textContent) && /\\d [b-h]\\b/.test(n.textContent))')));
  p.check('a drawing is named by labels on it: no sentence stands under one to explain it', (await p.ev('document.querySelectorAll("figcaption, #band-note, #oc-note, #night-note").length')) === 0);
  p.check('no name on the sheet shows raw markup', !(await p.ev('/&[a-z]+;|&#\\d+;/i.test(document.querySelector("main").textContent)')));
  p.check('text a visitor must read is not drawn in the faint ink', (await p.ev('[...document.querySelectorAll(".od-key li, #c-meta, #t-shown, .od-block dt, #n-if")].every((n) => getComputedStyle(n).color === "rgb(121, 130, 143)")')), await p.ev('getComputedStyle(document.getElementById("c-meta")).color'));
  p.check('the page does not scroll sideways', await p.ev('document.documentElement.scrollWidth <= window.innerWidth'), `${await p.ev('document.documentElement.scrollWidth')} of ${await p.ev('window.innerWidth')}`);
  const sizes = async () => [(await rect('sky')).h, (await rect('band')).h, (await rect('curve')).h, (await rect('oc')).h, (await rect('night')).h, (await rect('tally-view')).h].join(' ');
  const s0 = await sizes();
  await p.sleep(2500);
  p.check('no drawing grows after the page has loaded', (await sizes()) === s0, `${s0} then ${await sizes()}`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('01-sky-today');

  // the one label on the map: the K2 fields, counted on the date shown; words on the map where it has room, a line of text where it has not
  const k2Seen = await p.ev('(() => { const n = document.getElementById("k2"); const b = n.getBoundingClientRect(); return { text: n.textContent, onSheet: n.classList.contains("on-sheet"), tall: b.height }; })()');
  p.check('the sheet says how many K2 clocks are lost, once', q0.k2 && q0.k2.lost === 312 && q0.k2.of === 461 && k2Seen.text === '312 of 461 K2 clocks lost, the rings along the ecliptic' && k2Seen.onSheet === q0.k2.fits && (q0.k2.fits ? k2Seen.tall <= 2 : k2Seen.tall > 8), `${JSON.stringify(q0.k2)} ${JSON.stringify(k2Seen)}`);

  // a lamp under the pointer is named; pressed, it is read
  const w12 = await lampAt('WASP-12 b'), sk = await rect('sky');
  await p.move(sk.x + w12.x, sk.y + w12.y); await p.sleep(200);
  p.check('a lamp under the pointer is named, with its state and its error', !(await p.ev('document.getElementById("sky-tip").hidden')) && /^WASP-12 b, (kept|slipping|lost), ± /.test(await text('sky-tip')), await text('sky-tip'));
  const tipBox = await rect('sky-tip');
  p.check('its name stands beside the pointer, wherever the drawing begins on the sheet', Math.abs(tipBox.y - (sk.y + w12.y - 30)) < 40 && tipBox.x >= sk.x && tipBox.x + tipBox.w <= sk.x + sk.w + 2, `tip at ${Math.round(tipBox.x)}, ${Math.round(tipBox.y)}; lamp at ${Math.round(sk.x + w12.x)}, ${Math.round(sk.y + w12.y)}`);
  await p.click(sk.x + w12.x, sk.y + w12.y); await p.sleep(300);
  p.check('pressed, it is the clock being read', (await text('c-name')) === 'WASP-12 b' && (await probe()).star === 'WASP-12 b');
  p.check('WASP-12 b is read by a recent clock, where an earlier rule kept one from 2009', /^The clock in use is from .+ 20(19|2\d)\./.test(await text('c-status')) && !/Hebb/.test(await text('c-status')), await text('c-status'));
  if (q0.lens) {
    await p.move(sk.x + q0.lens.x, sk.y + q0.lens.y); await p.sleep(200);
    const under = (await text('sky-tip')).split(', ')[0];
    await p.click(sk.x + q0.lens.x, sk.y + q0.lens.y); await p.sleep(300);
    p.check('a lamp under the lens is named and read the same way', under.length > 3 && (await text('c-name')) === under, `${under} / ${await text('c-name')}`);
  } else {
    // a narrow sheet: the lens has a canvas of its own under the line of time, and a lamp on it is read by a press
    await show('lens2'); await p.sleep(250);
    const lz = await rect('lens2');
    await p.click(lz.x + lz.w / 2, lz.y + lz.w / 2); await p.sleep(300);
    p.check('a lamp under the lens, on its own canvas, is read by a press', lz.w > 100 && (await text('c-name')) !== 'WASP-12 b' && (await probe()).star === (await text('c-name')), `${await text('c-name')} from a lens ${Math.round(lz.w)} px wide`);
  }
  await open('HD 209458 b'); await p.sleep(300);

  // the line of time: drag it and the date follows, past today
  await show('band'); await p.sleep(250);
  const b = await rect('band');
  await p.drag(b.x + b.w * 0.5, b.y + b.h * 0.6, b.x + b.w * 0.78, b.y + b.h * 0.6, { steps: 12 });
  await p.sleep(250);
  p.check('dragging along the line moves the date toward 2040', (await year()) >= 2030, await date());
  const later = await probe();
  p.check('past today the sheet says what it is showing, and more clocks are lost', (await text('n-if')) === 'if nobody looks again' && new RegExp(`^lost by ${DAY}20[34]\\d$`).test(await text('n-verb')) && num(await text('n-lost')) > lostToday && later.k2.lost > 312, `${await text('n-lost')} ${await text('n-verb')}, ${await text('n-if')}; K2 ${later.k2.lost}`);
  p.check('and the one clock is read on that date, with the condition said', new RegExp(`If nobody looks again, on ${DAY}20[34]\\d it predicts the transit to ± .+, so the clock is (kept|slipping|lost)\\.`).test(await text('c-status')), await text('c-status'));
  p.check('and the key no longer names an arc the sky does not draw, keeping its place', (await keyLive()) === 'hidden' && (await p.ev('document.getElementById("key-live").getBoundingClientRect().height')) > 8, await keyLive());
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('02-sky-later');
  await today();
  p.check('"today" comes back', (await date()) === isoToday && num(await text('n-lost')) === lostToday && (await text('n-verb')) === 'are lost today', await date());

  // a finger: touching down moves nothing (the swipe may be a scroll); a tap sets the date
  const touchAt = (type, fx) => p.ev(`(() => { const c = document.getElementById("band"), r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerType: "touch", pointerId: 7, clientX: r.x + r.width * ${fx}, clientY: r.y + r.height * 0.5, bubbles: true })); })()`);
  await touchAt('pointerdown', 0.3); await touchAt('pointercancel', 0.3);
  p.check('a finger that touches the line and scrolls away moves no date', (await date()) === isoToday, await date());
  await touchAt('pointerdown', 0.3); await touchAt('pointerup', 0.3);
  p.check('a tap on the line sets the date', (await date()) !== isoToday && (await year()) < 2020, await date());
  await today();
  await p.ev('document.getElementById("scrub").focus()');
  for (let i = 0; i < 5; i++) await p.key('ArrowRight');
  await p.sleep(150);
  p.check('the line answers the arrow keys, thirty days a press', (await date()) !== isoToday && (await year()) <= now.getUTCFullYear() + 1, `${isoToday} -> ${await date()}`);

  // the past: lamps come on as their clocks were published
  await setYear(2012.5); await p.sleep(250);
  const then = await probe();
  p.check('in 2012 a few hundred clocks existed, the sky holds as many lamps, and K2 had not flown', num(await text('n-of')) > 100 && num(await text('n-of')) < 400 && then.lamps + then.lensLamps < 900 && (await text('k2')) === '' && /^were lost on \d+\sJune\s2012$/.test(await text('n-verb')), `${await text('n-lost')} ${await text('n-of')} ${await text('n-verb')}; ${then.lamps + then.lensLamps} lamps; k2 "${await text('k2')}"`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('03-sky-2012');
  await setYear(2000.5); await p.sleep(250);
  p.check('in the middle of 2000 one clock existed, and the sheet says whose table says so', /^of 1 transit clock$/.test(await text('n-of')) && new RegExp(`^By the archive's table the best clock on ${DAY}2000 was from (Charbonneau|Henry) et al\\. 2000\\. It predicted the transit to ± `).test(await text('c-status')), `${await text('n-of')} / ${await text('c-status')}`);
  await setYear(1999.2); await p.sleep(250);
  p.check('before the first paper there is no clock, and the sheet says so', /^of 0 transit clocks$/.test(await text('n-of')) && (await text('n-lost')) === '0' && new RegExp(`^No clock had been published for HD 209458 b by ${DAY}1999\\.$`).test(await text('c-status')), await text('c-status'));
  await today();

  // a planet by name, and a name that is none
  await open('Kepler-442 b'); await p.sleep(400);
  p.check('a planet opens by its name, and the field is empty again for the next one', (await text('c-name')) === 'Kepler-442 b' && /orbit 112 d/.test(await text('c-meta')) && (await p.ev('document.getElementById("pick").value')) === '' && (await p.ev('document.getElementById("pick").placeholder')) === 'find a planet', await text('c-meta'));
  await p.ev('document.getElementById("clock").scrollIntoView({ block: "start" })'); await p.sleep(250);
  await p.shot('04-one-clock');
  await open('<img src=x onerror=1>'); await p.sleep(200);
  p.check('a name that is no planet is refused in words, and nothing is injected', /^No transiting planet named "<img src=x onerror=1>"/.test(await text('pick-msg')) && (await p.ev('document.querySelectorAll("main img").length')) === 0 && (await text('c-name')) === 'Kepler-442 b', await text('pick-msg'));
  await open('K2-18 b'); await p.sleep(300);
  p.check('a clock below the target is called slipping, with the day it slipped, in whole sentences', new RegExp(`so the clock is slipping\\. It has been past a twelfth of the transit since ${DAY}20\\d\\d\\.`).test(await text('c-status')) && !/\d{4}-\d\d-\d\d/.test(await text('c-status')) && !/left alone/i.test(await text('c-status')), await text('c-status'));
  await open('WASP-12 b'); await p.sleep(300);

  // the next 24 hours: drawn on load, for an example place that is called one
  const n0 = await probe();
  p.check('the night is drawn on load for an example place, named as an example', /^[\d,]+ transits have their predicted middle in the next 24 hours\. [\d,]+ (is|are) up in the dark over Greenwich \(51\.48°, 0\.00°\), an example place\.$/.test(await text('t-count')) && (await upCount()) === n0.up && (await p.ev('document.getElementById("lat").value')) === '', (await text('t-count')).slice(0, 170));
  p.check('it names five transits at most (three on a narrow sheet), the ones whose stars are brightest, and says in words what it draws', n0.named.length >= Math.min(1, n0.up) && n0.named.length <= Math.min((await rect('night')).w < 520 ? 3 : 5, n0.up) && /^The dark hours of the next 24 over Greenwich .* up in the dark, each drawn as the height of its star/.test(await label('night')), `${n0.named.join(', ')} of ${n0.up}`);
  if (n0.named.length) {
    // a transit is named under the pointer anywhere along its line, not at its middle alone
    await show('night'); await p.sleep(250);
    const nr = await rect('night'), pts = await p.ev(`document.getElementById("sky").probe().trace(${JSON.stringify(n0.named[0])})`), far = pts[Math.max(0, Math.floor(pts.length * 0.12))];
    await p.move(nr.x + far.x, nr.y + far.y + 3); await p.sleep(200);
    p.check('a transit is named under the pointer anywhere along its line', (await probe()).nightHover === n0.named[0], `pointer near the start of ${n0.named[0]}: ${(await probe()).nightHover}`);
    await p.move(nr.x + 4, nr.y + nr.h - 4); await p.sleep(150);
  }
  p.check('the place is asked for only by whoever opens it, and the table is closed until opened', !(await p.ev('document.getElementById("place-box").open')) && !(await p.ev('document.getElementById("t-details").open')) && /^[\d,]+ transits$/.test(await text('t-cap')));
  await p.ev('document.getElementById("t-details").open = true'); await p.sleep(200);
  p.check('the table lists exactly the transits that are up in the dark, without saying so on every row', (await rowsShown()) === Math.max(1, await upCount()) && (await p.ev('getComputedStyle(document.querySelector("#t-table th.why")).display')) === 'none' && new RegExp(`^${(await upCount()).toLocaleString('en-US')} of ${(await total()).toLocaleString('en-US')} listed`).test(await text('t-shown')), `${await rowsShown()} rows, ${await upCount()} up; ${await text('t-shown')}`);
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(600);
  p.check('show all lists every transit with its altitude through the transit, its sky and why it is not up in the dark', (await rowsShown()) === (await total()) && (await total()) > 800 && (await p.ev('getComputedStyle(document.querySelector("#t-table th.why")).display')) !== 'none' && /°/.test(await p.ev('document.querySelector("#t-body tr td:nth-child(5)").textContent')) && (await p.ev('[...document.querySelectorAll("#t-body tr")].every((tr) => tr.children[3].textContent.length > 3)')), await p.ev('[...new Set([...document.querySelectorAll("#t-body tr")].map((tr) => tr.children[3].textContent))].join(", ")'));
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(300);
  p.check('and the short list comes back', (await rowsShown()) === Math.max(1, await upCount()));

  // a place
  await p.ev('document.getElementById("place-box").open = true'); await p.sleep(150);
  const place = (lat, lon) => p.ev(`(() => { document.getElementById("lat").value = ${JSON.stringify(lat)}; document.getElementById("lon").value = ${JSON.stringify(lon)}; document.getElementById("place-form").requestSubmit(); })()`);
  await place('941', '2.17'); await p.sleep(200);
  p.check('a latitude of 941 is refused in words, where the visitor is typing', /latitude from -90 to 90/.test(await text('place-msg')) && (await rect('place-msg')).h > 8, await text('place-msg'));
  await place('0x10', '2.17'); await p.sleep(200);
  p.check('a latitude written as 0x10 is refused, not read as 16, and the night stays where it was', /latitude from -90 to 90/.test(await text('place-msg')) && /an example place\.$/.test(await text('t-count')));
  await place('52.52', '13,40'); await p.sleep(700);
  p.check('a place is set, with a comma for the decimal point, and is no longer called an example', /[\d,]+ (is|are) up in the dark over 52\.52°, 13\.40°\.$/.test(await text('t-count')) && (await text('place-msg')) === '' && /over 52\.52°, 13\.40°\./.test(await label('night')), (await text('t-count')).slice(-60));
  await p.ev('document.getElementById("plate-c").scrollIntoView({ block: "start" })'); await p.sleep(300);
  await p.shot('05-night');
  p.check('the table can be reached and scrolled by keyboard, and has a caption', (await p.ev('document.getElementById("t-wrap").tabIndex')) === 0 && (await p.ev('document.getElementById("t-table").getAttribute("aria-labelledby")')) === 't-cap');
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(500);
  const firstRow = await p.ev('document.querySelector("#t-body tr button").textContent');
  await p.ev('document.querySelector("#t-body tr button").click()'); await p.sleep(400);
  p.check('opening a planet from the table moves the reader to it', (await p.ev('document.activeElement && document.activeElement.id')) === 'c-name' && (await text('c-name')) === firstRow, `${await p.ev('document.activeElement && document.activeElement.id')} / ${await text('c-name')}`);
  await open('WASP-12 b'); await p.sleep(300);

  // the planet and the place survive a reload
  await p.sleep(500);
  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the page comes up again', await ready());
  p.check('the sharing question, once answered, is not asked again', !(await p.ev('[...document.querySelectorAll("button")].some((x) => /no thanks/i.test(x.textContent) && x.offsetParent !== null)')));
  p.check('the planet survives a reload', (await text('c-name')) === 'WASP-12 b', await text('c-name'));
  p.check('the place survives a reload', (await p.ev('document.getElementById("lat").value')) === '52.52' && /52\.52°/.test(await text('t-count')));
  await p.ev('document.getElementById("forget").click()'); await p.sleep(300);
  p.check('the place can be forgotten, and the night goes back to the example', /an example place\.$/.test(await text('t-count')) && (await p.ev('document.getElementById("lat").value')) === '' && /forgotten/.test(await text('place-msg')), (await text('t-count')).slice(-70));

  // the tally
  p.check('the tally is the one the tests compute', (await text('y-real')) === '450' && (await text('y-blind')) === '3' && (await text('y-inside')).startsWith('201') && (await text('y-beyond')).startsWith('65') && (await text('y-same')) === '60', `${await text('y-real')} / ${await text('y-blind')} / ${await text('y-inside')} / ${await text('y-beyond')} / ${await text('y-same')}`);
  p.check('it names the catalogue it leans on, and the drawing says its finding in words', /Kokori/.test(await text('y-top-name')) && /one dot for each of 450 tests\. 45 % found it inside .* honest errors would put 68 %\. 14 % .* 0\.3 %\./.test(await label('tally-view')), await label('tally-view'));
  p.check('the working clocks are counted with what stands against them', /^141 \(/.test(await text('s-contested')) && (await text('s-alone')) === '352', `${await text('s-contested')} / ${await text('s-alone')}`);
  p.check('the rule for "up in the dark" is stated once, with the numbers in force, where the tag beside the count leads', /^From 30 minutes before the transit begins to 30 minutes after it ends, .* 20° up or more and the Sun 12° down or more; the transit is 3 windows long or more;/.test(await text('t-rule')) && (await p.ev('(document.querySelector("#plate-c .od-say a") || { getAttribute() { return ""; } }).getAttribute("href")')) === '#up-in-the-dark' && !!(await p.ev('document.getElementById("up-in-the-dark").contains(document.getElementById("t-rule"))')), (await text('t-rule')).slice(0, 90));
  await p.ev('document.getElementById("d-title").scrollIntoView({ block: "start" })'); await p.sleep(250);
  await p.shot('06-tally');

  // the way to the planets themselves: in the bar at every width, and from the clock being read to its own planet
  const door = await p.ev('(() => { const a = document.getElementById("to-planets"), b = a.getBoundingClientRect(); return { href: a.getAttribute("href"), w: b.width, h: b.height, top: b.top, text: [...a.querySelectorAll("span")].filter((s) => s.getBoundingClientRect().width > 0).map((s) => s.textContent).join("") }; })()');
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(150);
  p.check('the planet page can be reached from the bar at this width', door.href === 'exomania-survey.html' && door.w > 40 && door.h > 8 && /^(the survey of every planet|the planets)$/.test(door.text), JSON.stringify(door));
  p.check('and from the clock being read, to its own planet', (await p.ev('document.getElementById("c-world").getAttribute("href")')) === `exomania-survey.html?p=${encodeURIComponent('WASP-12 b')}` && (await rect('c-world')).h > 8, await p.ev('document.getElementById("c-world").getAttribute("href")'));

  // the planet page: its note writes itself out when a world is opened, with all of its text in the page from the start
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('WASP-12 b')}`);
  const noteSeen = () => p.ev('(() => { const b = document.querySelector("#report .rp-body"); if (!b) return null; const u = b.querySelector(".rp-unwritten"); return { all: b.textContent.length, unwritten: u ? u.textContent.length : 0, busy: b.getAttribute("aria-busy") === "true" }; })()');
  p.check('the planet page opens on the planet asked for', await p.until('(() => { const b = document.querySelector("#report .rp-body"); return !!b && b.textContent.length > 80; })()', 40000) && /WASP-12 b/.test(await p.ev('document.querySelector("#report .rp-body").textContent')));
  const seenNote = [await noteSeen()];
  for (let i = 0; i < 60 && seenNote[seenNote.length - 1].unwritten > 0; i++) { await p.sleep(120); seenNote.push(await noteSeen()); }      // a note of 240 characters takes under two seconds; a long one a few more
  const first = seenNote[0], last = seenNote[seenNote.length - 1];
  p.check('its note writes itself out: more of it is seen each moment, the whole of it is in the page throughout, and it ends complete', first.unwritten > 0 && first.busy && last.unwritten === 0 && !last.busy && seenNote.every((s) => s.all === first.all) && seenNote.every((s, i) => !i || s.unwritten <= seenNote[i - 1].unwritten), seenNote.map((s) => `${s.all - s.unwritten}/${s.all}`).join(' '));
  await p.go(`${base}/labs/exomania-survey.html?still&p=${encodeURIComponent('WASP-12 b')}`);
  await p.until('(() => { const b = document.querySelector("#report .rp-body"); return !!b && b.textContent.length > 80; })()', 40000);
  p.check('with motion turned off the note is there at once', (await noteSeen()).unwritten === 0 && !(await noteSeen()).busy);

  // links
  await p.go(`${base}/labs/exomania.html?still&planet=${encodeURIComponent('TRAPPIST-1 c')}&date=2035-06-01`);
  p.check('a link opens a planet at a date', (await ready()) && (await text('c-name')) === 'TRAPPIST-1 c' && (await date()) === '2035-06-01', `${await text('c-name')} ${await date()}`);
  await p.go(`${base}/labs/exomania.html?still&planet=Planet%20Nine&date=275760-09-13`);
  p.check('a link to a planet that does not exist says so, and a date past the sheet stops at its end', (await ready()) && /^No transiting planet named "Planet Nine".* Showing /.test(await text('pick-msg')) && (await date()) === '2040-01-01', `${await text('pick-msg')} / ${await date()}`);
  await p.go(`${base}/labs/exomania.html?p=${encodeURIComponent('Kepler-62 e')}`);
  await p.until('location.pathname.endsWith("exomania-survey.html")', 15000);
  p.check('a link made by the survey before it moved still reaches the survey, with its planet', (await p.ev('location.pathname.endsWith("exomania-survey.html")')) && /Kepler-62/.test(await p.ev('decodeURIComponent(location.search)')), await p.ev('location.pathname + location.search'));
}
