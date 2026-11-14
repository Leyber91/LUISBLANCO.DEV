/* ============================================================
   tools/drives/exomania.mjs — Overdue, by hand.

   Run by `node tools/labs-wt.mjs drive exomania` (tools/drive.mjs).

   What it proves: the two data files load and the sheet says so;
   the sky holds every lamp and the count in its corner is the
   count in the table; a lamp is named under the pointer and read
   when pressed, on the map and under the lens; the lamps the
   sheet names are buttons; dragging the band moves the date, and
   the sky, the count and the one clock follow it into the past
   and past today; a finger that scrolls over the band moves
   nothing; a planet opens by name and a wrong name is refused in
   words; a place can be set, refused when it is not one, and
   forgotten; the table lists what it says it lists; the planet
   and the place survive a reload through the labs' store; the
   tally is the one the lab's tests compute; a link made by the
   survey before it moved still reaches the survey. Each check
   that names a fault is one an independent review found on
   2026-11-14.
   ============================================================ */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default async function exomania(p, { base }) {
  const text = (id) => p.ev(`(document.getElementById(${JSON.stringify(id)}) || {}).textContent || ""`);
  const state = () => p.ev('document.body.dataset.state || ""');
  const rect = (id) => p.ev(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const ready = () => p.until('document.body.dataset.state === "ready"', 40000);
  const probe = () => p.ev('(() => { const q = document.getElementById("sky").probe(); return { lens: q.lens, wide: q.wide, lamps: q.lamps, star: q.star }; })()');
  const lampAt = (name) => p.ev(`document.getElementById("sky").probe().at(${JSON.stringify(name)})`);
  const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
  const year = async () => Number((await text('tb-date')).slice(0, 4));
  const setYear = (y) => p.ev(`(() => { const s = document.getElementById("scrub"); s.value = String(Math.round(2451545 + (${y} - 2000) * 365.25)); s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const open = (name) => p.ev(`(() => { const i = document.getElementById("pick"); i.value = ${JSON.stringify(name)}; document.getElementById("pick-form").requestSubmit(); })()`);
  const rowsShown = () => p.ev('document.querySelectorAll("#t-body tr").length');
  const total = async () => num(((await text('t-count')).match(/^([\d,]+) transit/) || [0, '0'])[1]);
  const show = (id) => p.ev(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: "center" })`);

  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the clocks and the published record load', await ready(), await state());
  const now = new Date(), today = now.toISOString().slice(0, 10), longToday = `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const q0 = await probe();
  p.check('the sky holds every lamp, on the map and again under the lens', q0.lamps > 4801 + 1500, `${q0.lamps} lamps drawn`);
  p.check('the count in the corner is a number of clocks, on today\'s date', /^[\d,]+$/.test(await text('n-lost')) && /^of 4,729 transit clocks$/.test(await text('n-of')) && (await text('n-date')) === longToday, `${await text('n-lost')} ${await text('n-of')} / ${await text('n-date')}`);
  p.check('the title block carries the source and the date shown', (await text('tb-date')) === today && /NASA Exoplanet Archive · \d{4}-\d\d-\d\d/.test(await text('tb-source')), `${await text('tb-source')} / ${await text('tb-date')}`);
  const lostToday = num(await text('n-lost'));
  p.check('the count in the corner is the count in the table', (await text('s-lost')).startsWith(`${lostToday.toLocaleString('en-US')} (`), `${await text('n-lost')} against ${await text('s-lost')}`);
  p.check('the sheet opens on the first transit timed', q0.star === 'HD 209458 b' && (await text('c-name')) === 'HD 209458 b' && /found 1999/.test(await text('c-meta')), await text('c-meta'));
  p.check('its clock is read today, by a recent paper', /^Read by .+, 20\d\d\. On \d{4}-\d\d-\d\d its transit is predicted to ± [\d.]+ (ms|s|min)\: the clock is read\./.test(await text('c-status')), await text('c-status'));
  p.check('the transit as light is said in words, and is never deeper than the transit', (() => true)() && /The faint line is the transit itself, ([\d.]+) % deep\..* a dip of ([\d.]+) %\.$/.test(await text('c-curve')) && num((await text('c-curve')).match(/a dip of ([\d.]+)/)[1]) <= num((await text('c-curve')).match(/itself, ([\d.]+)/)[1]), await text('c-curve'));
  p.check('every published solution is a sentence in a list anybody can open', /^the 9 published solutions of HD 209458 b, against its first clock$/.test(await text('r-count')) && (await p.ev('document.querySelectorAll("#r-points li").length')) === 9);
  p.check('a paper published beside the first clock, timing a transit from before both, is not called a test', await p.ev('[...document.querySelectorAll("#r-points li")].some((li) => /Henry/.test(li.textContent) && /no test/.test(li.textContent))'), await p.ev('([...document.querySelectorAll("#r-points li")].find((li) => /Henry/.test(li.textContent)) || {}).textContent'));
  p.check('no name on the sheet shows raw markup', !(await p.ev('/&[a-z]+;|&#\\d+;/i.test(document.querySelector("main").textContent)')));
  p.check('text a visitor must read is not drawn in the faint ink', (await p.ev('["band-note", "c-curve", "t-rule", "night-note", "c-meta"].every((id) => getComputedStyle(document.getElementById(id)).color === "rgb(121, 130, 143)")')), await p.ev('getComputedStyle(document.getElementById("band-note")).color'));
  p.check('the page does not scroll sideways', await p.ev('document.documentElement.scrollWidth <= window.innerWidth'), `${await p.ev('document.documentElement.scrollWidth')} of ${await p.ev('window.innerWidth')}`);
  const sizes = async () => [(await rect('sky')).h, (await rect('band')).h, (await rect('curve')).h, (await rect('night')).h, (await rect('tally-view')).h].join(' ');
  const s0 = await sizes();
  await p.sleep(2500);
  p.check('no drawing grows after the page has loaded', (await sizes()) === s0, `${s0} then ${await sizes()}`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('01-sky-today');

  // the lamps the sheet names are buttons where the page is wide enough to carry them
  const marks = await p.ev('[...document.querySelectorAll("#marks button")].filter((b) => !b.hidden && getComputedStyle(b.parentElement).display !== "none").map((b) => b.textContent)');
  p.check('the sheet names three lamps, as buttons, on a wide page and none on a narrow one', q0.wide ? marks.length === 3 && /HD 209458 b · the first transit timed/.test(marks.join('|')) : marks.length === 0, marks.join(' | '));

  // a lamp under the pointer is named; pressed, it is read
  const w12 = await lampAt('WASP-12 b'), sk = await rect('sky');
  await p.move(sk.x + w12.x, sk.y + w12.y); await p.sleep(200);
  p.check('a lamp under the pointer is named, with its state and its error', !(await p.ev('document.getElementById("sky-tip").hidden')) && /^WASP-12 b · (read|fading|lost) · ± /.test(await text('sky-tip')), await text('sky-tip'));
  await p.click(sk.x + w12.x, sk.y + w12.y); await p.sleep(300);
  p.check('pressed, it is the clock being read', (await text('c-name')) === 'WASP-12 b' && (await probe()).star === 'WASP-12 b');
  p.check('WASP-12 b is read by a recent clock, where an earlier rule kept one from 2009', /^Read by .+, 20(19|2\d)\./.test(await text('c-status')) && !/Hebb/.test(await text('c-status')), await text('c-status'));
  await p.move(sk.x + q0.lens.x, sk.y + q0.lens.y); await p.sleep(200);
  const under = (await text('sky-tip')).split(' · ')[0];
  await p.click(sk.x + q0.lens.x, sk.y + q0.lens.y); await p.sleep(300);
  p.check('a lamp under the lens is named and read the same way', under.length > 3 && (await text('c-name')) === under, `${under} / ${await text('c-name')}`);
  await open('HD 209458 b'); await p.sleep(300);

  // the band: drag it and the date follows, past today
  await show('band'); await p.sleep(250);
  const b = await rect('band');
  await p.drag(b.x + b.w * 0.5, b.y + b.h * 0.6, b.x + b.w * 0.95, b.y + b.h * 0.6, { steps: 12 });
  await p.sleep(250);
  p.check('dragging across the band moves the date toward 2040', (await year()) >= 2037, await text('tb-date'));
  p.check('past today the sheet says what it is showing, and more clocks are lost', /if nobody looks again$/.test(await text('n-date')) && num(await text('n-lost')) > lostToday, `${await text('n-lost')} on ${await text('n-date')}`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('02-sky-later');
  await p.ev('document.getElementById("to-today").click()');
  p.check('"today" comes back', (await text('tb-date')) === today && num(await text('n-lost')) === lostToday, await text('tb-date'));

  // a finger: touching down moves nothing (the swipe may be a scroll); a tap sets the date
  const touchAt = (type, fx) => p.ev(`(() => { const c = document.getElementById("band"), r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerType: "touch", pointerId: 7, clientX: r.x + r.width * ${fx}, clientY: r.y + r.height * 0.5, bubbles: true })); })()`);
  await touchAt('pointerdown', 0.3); await touchAt('pointercancel', 0.3);
  p.check('a finger that touches the band and scrolls away moves no date', (await text('tb-date')) === today, await text('tb-date'));
  await touchAt('pointerdown', 0.3); await touchAt('pointerup', 0.3);
  p.check('a tap on the band sets the date', (await text('tb-date')) !== today && (await year()) < 2020, await text('tb-date'));
  await p.ev('document.getElementById("to-today").click()');
  await p.ev('document.getElementById("scrub").focus()');
  for (let i = 0; i < 5; i++) await p.key('ArrowRight');
  await p.sleep(150);
  p.check('the slider moves the date by keyboard', (await text('tb-date')) !== today, `${today} -> ${await text('tb-date')}`);

  // the past: lamps come on as their clocks were published
  await setYear(2012.5); await p.sleep(250);
  p.check('in 2012 a few hundred clocks existed, and the sky holds as many lamps', num(await text('n-of')) > 100 && num(await text('n-of')) < 400 && (await probe()).lamps < 900, `${await text('n-lost')} ${await text('n-of')}; ${(await probe()).lamps} lamps`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('03-sky-2012');
  await setYear(2000.5); await p.sleep(250);
  p.check('in the middle of 2000 one clock existed, read by one of the two first papers', /^of 1 transit clock$/.test(await text('n-of')) && /^Read by (Charbonneau|Henry) et al\. 2000, 2000\./.test(await text('c-status')), `${await text('n-of')} / ${await text('c-status')}`);
  await setYear(1999.2); await p.sleep(250);
  p.check('before the first paper there is no clock, and the sheet says so', /^of 0 transit clocks$/.test(await text('n-of')) && (await text('n-lost')) === '0' && /^No clock had been published for HD 209458 b by 1999/.test(await text('c-status')), await text('c-status'));
  await p.ev('document.getElementById("to-today").click()');

  // a planet by name, and a name that is none
  await open('Kepler-442 b'); await p.sleep(400);
  p.check('a planet opens by its name', (await text('c-name')) === 'Kepler-442 b' && /orbit 112 d/.test(await text('c-meta')), await text('c-meta'));
  await show('clock'); await p.sleep(250);
  await p.shot('04-one-clock');
  await open('<img src=x onerror=1>'); await p.sleep(200);
  p.check('a name that is no planet is refused in words, and nothing is injected', /^No transiting planet named "<img src=x onerror=1>"/.test(await text('pick-msg')) && (await p.ev('document.querySelectorAll("main img").length')) === 0 && (await text('c-name')) === 'Kepler-442 b', await text('pick-msg'));
  await open('WASP-12 b'); await p.sleep(300);

  // the next 24 hours, before a place
  p.check('transits in the next 24 hours are counted, with the lost and the contested', /transits have their predicted middle in the next 24 hours\. [\d,]+ of those predictions come from a clock that is lost, and [\d,]+ from a clock most other papers disagree with\. Set a place/.test(await text('t-count')), (await text('t-count')).slice(0, 170));
  p.check('the table says how many of them it lists', (await rowsShown()) === 12 && new RegExp(`^12 of ${(await total()).toLocaleString('en-US')} listed$`).test(await text('t-shown')), await text('t-shown'));
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(500);
  p.check('show all lists every transit it counted', (await rowsShown()) === (await total()) && (await total()) > 800, `${await rowsShown()} rows for ${await total()} transits`);
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(250);
  p.check('and the first twelve come back', (await rowsShown()) === 12);

  // a place
  const place = (lat, lon) => p.ev(`(() => { document.getElementById("lat").value = ${JSON.stringify(lat)}; document.getElementById("lon").value = ${JSON.stringify(lon)}; document.getElementById("place-form").requestSubmit(); })()`);
  await place('941', '2.17'); await p.sleep(200);
  p.check('a latitude of 941 is refused in words', /latitude from -90 to 90/.test(await text('place-msg')), await text('place-msg'));
  await place('0x10', '2.17'); await p.sleep(200);
  p.check('a latitude written as 0x10 is refused, not read as 16', /latitude from -90 to 90/.test(await text('place-msg')) && (await p.ev('document.getElementById("t-table").classList.contains("no-place")')));
  await place('41.39', '2,17'); await p.sleep(700);
  p.check('a place is set, with a comma for the decimal point', /[\d,]+ transits? can be watched from 41\.39°, 2\.17°\.$/.test(await text('t-count')), (await text('t-count')).slice(-60));
  const watch = num(((await text('t-count')).match(/([\d,]+) transits? can be watched/) || [0, '0'])[1]);
  p.check('the table then lists exactly the transits that can be watched, without saying so on every row', (await rowsShown()) === Math.max(1, watch) && (await p.ev('getComputedStyle(document.querySelector("#t-table th.why")).display')) === 'none', `${await rowsShown()} rows, ${watch} watchable`);
  await show('night'); await p.sleep(250);
  const nv = await rect('night');
  await p.move(nv.x + nv.w * 0.5, nv.y + nv.h * 0.5); await p.sleep(150);
  p.check('the night drawing says what it draws', /gold line|star \d+° to \d+° up/.test(await text('night-note')), (await text('night-note')).slice(0, 110));
  await p.ev('document.getElementById("plate-b").scrollIntoView({ block: "start" })'); await p.sleep(300);
  await p.shot('05-night');
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(600);
  p.check('show all lists every transit with its altitude through the transit, its sky and why it cannot be watched', (await rowsShown()) === (await total()) && (await p.ev('getComputedStyle(document.querySelector("#t-table th.why")).display')) !== 'none' && /°/.test(await p.ev('document.querySelector("#t-body tr td:nth-child(5)").textContent')) && (await p.ev('[...document.querySelectorAll("#t-body tr")].every((tr) => tr.children[3].textContent.length > 3)')), await p.ev('[...new Set([...document.querySelectorAll("#t-body tr")].map((tr) => tr.children[3].textContent))].join(", ")'));
  p.check('the table can be reached and scrolled by keyboard, and has a caption', (await p.ev('document.getElementById("t-wrap").tabIndex')) === 0 && /Predicted transits in the next 24 hours/.test(await text('t-cap')));
  const firstRow = await p.ev('document.querySelector("#t-body tr button").textContent');
  await p.ev('document.querySelector("#t-body tr button").click()'); await p.sleep(400);
  p.check('opening a planet from the table moves the reader to it', (await p.ev('document.activeElement && document.activeElement.id')) === 'c-name' && (await text('c-name')) === firstRow, `${await p.ev('document.activeElement && document.activeElement.id')} / ${await text('c-name')}`);
  await open('WASP-12 b'); await p.sleep(300);

  // the planet and the place survive a reload
  await p.sleep(500);
  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the page comes up again', await ready());
  p.check('the planet survives a reload', (await text('c-name')) === 'WASP-12 b', await text('c-name'));
  p.check('the place survives a reload', (await p.ev('document.getElementById("lat").value')) === '41.39' && /41\.39°/.test(await text('t-count')));
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(400);
  await p.ev('document.getElementById("forget").click()'); await p.sleep(300);
  p.check('the place can be forgotten, and the table goes back to its first twelve', /Set a place/.test(await text('t-count')) && (await p.ev('document.getElementById("lat").value')) === '' && (await rowsShown()) === 12, `${await rowsShown()} rows`);

  // the tally
  p.check('the tally is the one the tests compute', (await text('y-real')) === '450' && (await text('y-blind')) === '3' && (await text('y-inside')).startsWith('201') && (await text('y-beyond')).startsWith('65') && (await text('y-same')) === '60', `${await text('y-real')} / ${await text('y-blind')} / ${await text('y-inside')} / ${await text('y-beyond')} / ${await text('y-same')}`);
  p.check('it names the catalogue it leans on, and says the finding in one sentence', /Kokori/.test(await text('y-top-name')) && /^45 % of the later papers .* honest errors would put 68 %\. 14 % .* 0\.3 %\.$/.test(await text('y-headline')), await text('y-headline'));
  p.check('the working clocks are counted with what stands against them', /^141 \(/.test(await text('s-contested')) && (await text('s-alone')) === '352', `${await text('s-contested')} / ${await text('s-alone')}`);
  await p.ev('document.getElementById("c-title").scrollIntoView({ block: "start" })'); await p.sleep(250);
  await p.shot('06-tally');

  // links
  await p.go(`${base}/labs/exomania.html?still&planet=${encodeURIComponent('TRAPPIST-1 c')}&date=2035-06-01`);
  p.check('a link opens a planet at a date', (await ready()) && (await text('c-name')) === 'TRAPPIST-1 c' && (await text('tb-date')) === '2035-06-01', `${await text('c-name')} ${await text('tb-date')}`);
  await p.go(`${base}/labs/exomania.html?still&planet=Planet%20Nine&date=275760-09-13`);
  p.check('a link to a planet that does not exist says so, and a date past the sheet stops at its end', (await ready()) && /^No transiting planet named "Planet Nine".* Showing /.test(await text('pick-msg')) && (await text('tb-date')) === '2040-01-01', `${await text('pick-msg')} / ${await text('tb-date')}`);
  await p.go(`${base}/labs/exomania.html?p=${encodeURIComponent('Kepler-62 e')}`);
  await p.until('location.pathname.endsWith("exomania-survey.html")', 15000);
  p.check('a link made by the survey before it moved still reaches the survey, with its planet', (await p.ev('location.pathname.endsWith("exomania-survey.html")')) && /Kepler-62/.test(await p.ev('decodeURIComponent(location.search)')), await p.ev('location.pathname + location.search'));
}
