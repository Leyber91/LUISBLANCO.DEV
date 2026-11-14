/* ============================================================
   tools/drives/exomania.mjs — Overdue, by hand.

   Run by `node tools/labs-wt.mjs drive exomania` (tools/drive.mjs).

   What it proves: the two data files load and the sheet says so;
   the labs' sharing question is drawn in the labs' own plate and
   can be answered; the sky holds every lamp and the count in its
   corner is the count in the table; a lamp is named under the
   pointer and read when pressed, on the map and under the lens;
   the one label on the map counts the K2 fields; dragging the
   line of time moves the date, and the sky, the count and the one
   clock follow it into the past and past today; a finger that
   scrolls over the line moves nothing; the line answers the
   keyboard; a planet opens by name and a wrong name is refused in
   words; the night is drawn on load for an example place, a place
   can be set, refused when it is not one, and forgotten; the
   table lists what it says it lists; the planet and the place
   survive a reload through the labs' store; the tally is the one
   the lab's tests compute; a link made by the survey before it
   moved still reaches the survey. Each check that names a fault
   is one an independent review found on 2026-11-14.
   ============================================================ */

export default async function exomania(p, { base }) {
  const text = (id) => p.ev(`(document.getElementById(${JSON.stringify(id)}) || {}).textContent || ""`);
  const label = (id) => p.ev(`(document.getElementById(${JSON.stringify(id)}) || { getAttribute() { return ""; } }).getAttribute("aria-label") || ""`);
  const state = () => p.ev('document.body.dataset.state || ""');
  const rect = (id) => p.ev(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const ready = () => p.until('document.body.dataset.state === "ready"', 40000);
  const probe = () => p.ev('(() => { const q = document.getElementById("sky").probe(); return { lens: q.lens, wide: q.wide, lamps: q.lamps, star: q.star, date: q.date, k2: q.k2, named: q.named, up: q.up, papers: q.papers }; })()');
  const lampAt = (name) => p.ev(`document.getElementById("sky").probe().at(${JSON.stringify(name)})`);
  const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
  const date = () => p.ev('document.getElementById("scrub").getAttribute("aria-valuetext") || ""');       // the date shown, as the line's keyboard says it
  const year = async () => Number((await date()).slice(0, 4));
  const setYear = (y) => p.ev(`(() => { const s = document.getElementById("scrub"); s.value = String(Math.round(2451545 + (${y} - 2000) * 365.25)); s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  const open = (name) => p.ev(`(() => { const i = document.getElementById("pick"); i.value = ${JSON.stringify(name)}; document.getElementById("pick-form").requestSubmit(); })()`);
  const rowsShown = () => p.ev('document.querySelectorAll("#t-body tr").length');
  const total = async () => num(((await text('t-count')).match(/^([\d,]+) transit/) || [0, '0'])[1]);
  const upCount = async () => num(((await text('t-count')).match(/hours\. ([\d,]+) (is|are) up in the dark/) || [0, '0'])[1]);
  const show = (id) => p.ev(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: "center" })`);
  const today = () => p.ev('document.getElementById("to-today").click()');

  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the clocks and the published record load', await ready(), await state());
  const now = new Date(), isoToday = now.toISOString().slice(0, 10);

  // the labs' question about sharing usage: drawn as a plate of the labs, and answered like any visitor would
  const ask = await p.ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => /no thanks/i.test(x.textContent)); if (!b) return null; const plate = b.closest(".los-plate"); return { plate: !!plate, border: plate ? getComputedStyle(plate).borderTopStyle : "", family: getComputedStyle(b).fontFamily }; })()');
  p.check('the sharing question is drawn on the labs\' own plate, not as bare markup', !!ask && ask.plate && ask.border === 'solid' && /Plex Mono/.test(ask.family), JSON.stringify(ask));
  await p.ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); })()');
  await p.sleep(300);
  p.check('answered, it leaves the sheet', !(await p.ev('[...document.querySelectorAll("button")].some((x) => /no thanks/i.test(x.textContent) && x.offsetParent !== null)')));

  const q0 = await probe();
  p.check('the sky holds every lamp, on the map and again under the lens', q0.lamps > 4729 + 1500, `${q0.lamps} lamps drawn`);
  p.check('the count in the corner is a number of clocks, lost today', /^[\d,]+$/.test(await text('n-lost')) && /^of 4,729 transit clocks$/.test(await text('n-of')) && (await text('n-verb')) === 'are lost today' && (await text('n-if')) === '', `${await text('n-lost')} ${await text('n-of')} / ${await text('n-verb')}`);
  p.check('the line of time stands on today, and the title block carries the source', (await date()) === isoToday && q0.date === isoToday && /NASA Exoplanet Archive · \d{4}-\d\d-\d\d/.test(await text('tb-source')), `${await date()} / ${await text('tb-source')}`);
  const lostToday = num(await text('n-lost'));
  p.check('the count in the corner is the count in the table', (await text('s-lost')).startsWith(`${lostToday.toLocaleString('en-US')} (`) && /^2,431 \(/.test(await text('s-kept')) && /^1,910 \(/.test(await text('s-slipping')), `${await text('n-lost')} against ${await text('s-lost')}; kept ${await text('s-kept')}, slipping ${await text('s-slipping')}`);
  p.check('the sheet opens on the first transit timed, its name set upright', q0.star === 'HD 209458 b' && (await text('c-name')) === 'HD 209458 b' && /found 1999/.test(await text('c-meta')) && (await p.ev('getComputedStyle(document.getElementById("c-name")).fontStyle')) === 'normal', await text('c-meta'));
  p.check('its clock is kept today, by a recent paper named once', /^Clock: .+ 20\d\d\. Predicted to ± [\d.]+ (ms|s|min) on \d{4}-\d\d-\d\d: kept\./.test(await text('c-status')) && !/(20\d\d), \1/.test(await text('c-status')), await text('c-status'));
  const seen = (await label('curve')).match(/a dip of ([\d.]+) %, where the transit itself is ([\d.]+) % deep/);
  p.check('the transit as light is said in words, and is never deeper than the transit', !!seen && Number(seen[1]) <= Number(seen[2]), await label('curve'));
  p.check('every published clock is a sentence in a list anybody can open, the one in use first', /^the 9 published clocks of HD 209458 b, against the one in use$/.test(await text('r-count')) && (await p.ev('document.querySelectorAll("#r-points li").length')) === 9 && /the clock in use/.test(await p.ev('document.querySelector("#r-points li").textContent')));
  p.check('and the drawing over the list holds the other eight', q0.papers === 8 && /The 8 other papers/.test(await text('oc-note')), `${q0.papers} / ${await text('oc-note')}`);
  p.check('no name on the sheet shows raw markup', !(await p.ev('/&[a-z]+;|&#\\d+;/i.test(document.querySelector("main").textContent)')));
  p.check('text a visitor must read is not drawn in the faint ink', (await p.ev('["band-note", "oc-note", "t-rule", "night-note", "c-meta"].every((id) => getComputedStyle(document.getElementById(id)).color === "rgb(121, 130, 143)")')), await p.ev('getComputedStyle(document.getElementById("band-note")).color'));
  p.check('the page does not scroll sideways', await p.ev('document.documentElement.scrollWidth <= window.innerWidth'), `${await p.ev('document.documentElement.scrollWidth')} of ${await p.ev('window.innerWidth')}`);
  const sizes = async () => [(await rect('sky')).h, (await rect('band')).h, (await rect('curve')).h, (await rect('oc')).h, (await rect('night')).h, (await rect('tally-view')).h].join(' ');
  const s0 = await sizes();
  await p.sleep(2500);
  p.check('no drawing grows after the page has loaded', (await sizes()) === s0, `${s0} then ${await sizes()}`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('01-sky-today');

  // the one label on the map: the K2 fields, counted on the date shown; words on the map where it has room, a line of text where it has not
  const k2Seen = await p.ev('(() => { const n = document.getElementById("k2"); const b = n.getBoundingClientRect(); return { text: n.textContent, onSheet: n.classList.contains("on-sheet"), tall: b.height }; })()');
  p.check('the sheet says how many K2 clocks are lost, once', q0.k2 && q0.k2.lost === 312 && q0.k2.of === 461 && k2Seen.text === 'K2 fields: 312 of 461 lost' && k2Seen.onSheet === q0.k2.drawn && (q0.k2.drawn ? k2Seen.tall <= 2 : k2Seen.tall > 8), `${JSON.stringify(q0.k2)} ${JSON.stringify(k2Seen)}`);

  // a lamp under the pointer is named; pressed, it is read
  const w12 = await lampAt('WASP-12 b'), sk = await rect('sky');
  await p.move(sk.x + w12.x, sk.y + w12.y); await p.sleep(200);
  p.check('a lamp under the pointer is named, with its state and its error', !(await p.ev('document.getElementById("sky-tip").hidden')) && /^WASP-12 b · (kept|slipping|lost) · ± /.test(await text('sky-tip')), await text('sky-tip'));
  const tipBox = await rect('sky-tip');
  p.check('its name stands beside the pointer, wherever the drawing begins on the sheet', Math.abs(tipBox.y - (sk.y + w12.y - 30)) < 40 && tipBox.x >= sk.x && tipBox.x + tipBox.w <= sk.x + sk.w + 2, `tip at ${Math.round(tipBox.x)}, ${Math.round(tipBox.y)}; lamp at ${Math.round(sk.x + w12.x)}, ${Math.round(sk.y + w12.y)}`);
  await p.click(sk.x + w12.x, sk.y + w12.y); await p.sleep(300);
  p.check('pressed, it is the clock being read', (await text('c-name')) === 'WASP-12 b' && (await probe()).star === 'WASP-12 b');
  p.check('WASP-12 b is read by a recent clock, where an earlier rule kept one from 2009', /^Clock: .+ 20(19|2\d)\./.test(await text('c-status')) && !/Hebb/.test(await text('c-status')), await text('c-status'));
  await p.move(sk.x + q0.lens.x, sk.y + q0.lens.y); await p.sleep(200);
  const under = (await text('sky-tip')).split(' · ')[0];
  await p.click(sk.x + q0.lens.x, sk.y + q0.lens.y); await p.sleep(300);
  p.check('a lamp under the lens is named and read the same way', under.length > 3 && (await text('c-name')) === under, `${under} / ${await text('c-name')}`);
  await open('HD 209458 b'); await p.sleep(300);

  // the line of time: drag it and the date follows, past today
  await show('band'); await p.sleep(250);
  const b = await rect('band');
  await p.drag(b.x + b.w * 0.5, b.y + b.h * 0.6, b.x + b.w * 0.9, b.y + b.h * 0.6, { steps: 12 });
  await p.sleep(250);
  p.check('dragging along the line moves the date toward 2040', (await year()) >= 2034, await date());
  const later = await probe();
  p.check('past today the sheet says what it is showing, and more clocks are lost', (await text('n-if')) === 'if nobody looks again' && /^lost by \d+ [A-Z][a-z]+ 20[34]\d$/.test(await text('n-verb')) && num(await text('n-lost')) > lostToday && later.k2.lost > 312, `${await text('n-lost')} ${await text('n-verb')}, ${await text('n-if')}; K2 ${later.k2.lost}`);
  p.check('and the one clock is read on that date, with the condition said', /on 20[34]\d-\d\d-\d\d, if nobody looks again: (kept|slipping|lost)\./.test(await text('c-status')), await text('c-status'));
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
  p.check('in 2012 a few hundred clocks existed, the sky holds as many lamps, and K2 had not flown', num(await text('n-of')) > 100 && num(await text('n-of')) < 400 && (await probe()).lamps < 900 && (await text('k2')) === '' && /^were lost on \d+ June 2012$/.test(await text('n-verb')), `${await text('n-lost')} ${await text('n-of')} ${await text('n-verb')}; ${(await probe()).lamps} lamps; k2 "${await text('k2')}"`);
  await p.ev('window.scrollTo(0, 0)'); await p.sleep(250);
  await p.shot('03-sky-2012');
  await setYear(2000.5); await p.sleep(250);
  p.check('in the middle of 2000 one clock existed, and the sheet says whose table says so', /^of 1 transit clock$/.test(await text('n-of')) && /^By the archive's table the best clock on 2000-\d\d-\d\d was (Charbonneau|Henry) et al\. 2000\. Predicted to ± /.test(await text('c-status')), `${await text('n-of')} / ${await text('c-status')}`);
  await setYear(1999.2); await p.sleep(250);
  p.check('before the first paper there is no clock, and the sheet says so', /^of 0 transit clocks$/.test(await text('n-of')) && (await text('n-lost')) === '0' && /^No clock had been published for HD 209458 b by 1999/.test(await text('c-status')), await text('c-status'));
  await today();

  // a planet by name, and a name that is none
  await open('Kepler-442 b'); await p.sleep(400);
  p.check('a planet opens by its name', (await text('c-name')) === 'Kepler-442 b' && /orbit 112 d/.test(await text('c-meta')), await text('c-meta'));
  await p.ev('document.getElementById("clock").scrollIntoView({ block: "start" })'); await p.sleep(250);
  await p.shot('04-one-clock');
  await open('<img src=x onerror=1>'); await p.sleep(200);
  p.check('a name that is no planet is refused in words, and nothing is injected', /^No transiting planet named "<img src=x onerror=1>"/.test(await text('pick-msg')) && (await p.ev('document.querySelectorAll("main img").length')) === 0 && (await text('c-name')) === 'Kepler-442 b', await text('pick-msg'));
  await open('K2-18 b'); await p.sleep(300);
  p.check('a clock below the target is called slipping, with the day it slipped', /: slipping\. Past a twelfth of the transit since 20\d\d-\d\d-\d\d/.test(await text('c-status')), await text('c-status'));
  await open('WASP-12 b'); await p.sleep(300);

  // the next 24 hours: drawn on load, for an example place that is called one
  const n0 = await probe();
  p.check('the night is drawn on load for an example place, named as an example', /^[\d,]+ transits have their predicted middle in the next 24 hours\. [\d,]+ (is|are) up in the dark over Barcelona \(41\.39°, 2\.17°\), an example place\.$/.test(await text('t-count')) && (await upCount()) === n0.up && (await p.ev('document.getElementById("lat").value')) === '', (await text('t-count')).slice(0, 170));
  p.check('it names five transits at most, the ones whose stars are brightest', n0.named.length === Math.min(5, n0.up) && /^Each line is a transit|^No transit/.test(await text('night-note')), `${n0.named.join(', ')} of ${n0.up}`);
  p.check('the table is there for whoever opens it, and is closed until then', !(await p.ev('document.getElementById("t-details").open')) && /^the [\d,]+ transits of the next 24 hours, as a table$/.test(await text('t-cap')));
  await p.ev('document.getElementById("t-details").open = true'); await p.sleep(200);
  p.check('it lists exactly the transits that are up in the dark, without saying so on every row', (await rowsShown()) === Math.max(1, await upCount()) && (await p.ev('getComputedStyle(document.querySelector("#t-table th.why")).display')) === 'none' && new RegExp(`^${(await upCount()).toLocaleString('en-US')} of ${(await total()).toLocaleString('en-US')} listed`).test(await text('t-shown')), `${await rowsShown()} rows, ${await upCount()} up; ${await text('t-shown')}`);
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(600);
  p.check('show all lists every transit with its altitude through the transit, its sky and why it is not up in the dark', (await rowsShown()) === (await total()) && (await total()) > 800 && (await p.ev('getComputedStyle(document.querySelector("#t-table th.why")).display')) !== 'none' && /°/.test(await p.ev('document.querySelector("#t-body tr td:nth-child(5)").textContent')) && (await p.ev('[...document.querySelectorAll("#t-body tr")].every((tr) => tr.children[3].textContent.length > 3)')), await p.ev('[...new Set([...document.querySelectorAll("#t-body tr")].map((tr) => tr.children[3].textContent))].join(", ")'));
  await p.ev('document.getElementById("t-all").click()'); await p.sleep(300);
  p.check('and the short list comes back', (await rowsShown()) === Math.max(1, await upCount()));

  // a place
  const place = (lat, lon) => p.ev(`(() => { document.getElementById("lat").value = ${JSON.stringify(lat)}; document.getElementById("lon").value = ${JSON.stringify(lon)}; document.getElementById("place-form").requestSubmit(); })()`);
  await place('941', '2.17'); await p.sleep(200);
  p.check('a latitude of 941 is refused in words', /latitude from -90 to 90/.test(await text('place-msg')), await text('place-msg'));
  await place('0x10', '2.17'); await p.sleep(200);
  p.check('a latitude written as 0x10 is refused, not read as 16, and the night stays where it was', /latitude from -90 to 90/.test(await text('place-msg')) && /an example place\.$/.test(await text('t-count')));
  await place('52.52', '13,40'); await p.sleep(700);
  p.check('a place is set, with a comma for the decimal point, and is no longer called an example', /[\d,]+ (is|are) up in the dark over 52\.52°, 13\.40°\.$/.test(await text('t-count')) && (await text('place-msg')) === '', (await text('t-count')).slice(-60));
  await show('night'); await p.sleep(250);
  const nv = await rect('night');
  await p.move(nv.x + nv.w * 0.3, nv.y + nv.h * 0.4); await p.sleep(150);
  p.check('the night drawing says what it draws', /^Each line is a transit|^No transit|star \d+° to \d+° up/.test(await text('night-note')), (await text('night-note')).slice(0, 110));
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
  await p.ev('document.getElementById("d-title").scrollIntoView({ block: "start" })'); await p.sleep(250);
  await p.shot('06-tally');

  // links
  await p.go(`${base}/labs/exomania.html?still&planet=${encodeURIComponent('TRAPPIST-1 c')}&date=2035-06-01`);
  p.check('a link opens a planet at a date', (await ready()) && (await text('c-name')) === 'TRAPPIST-1 c' && (await date()) === '2035-06-01', `${await text('c-name')} ${await date()}`);
  await p.go(`${base}/labs/exomania.html?still&planet=Planet%20Nine&date=275760-09-13`);
  p.check('a link to a planet that does not exist says so, and a date past the sheet stops at its end', (await ready()) && /^No transiting planet named "Planet Nine".* Showing /.test(await text('pick-msg')) && (await date()) === '2040-01-01', `${await text('pick-msg')} / ${await date()}`);
  await p.go(`${base}/labs/exomania.html?p=${encodeURIComponent('Kepler-62 e')}`);
  await p.until('location.pathname.endsWith("exomania-survey.html")', 15000);
  p.check('a link made by the survey before it moved still reaches the survey, with its planet', (await p.ev('location.pathname.endsWith("exomania-survey.html")')) && /Kepler-62/.test(await p.ev('decodeURIComponent(location.search)')), await p.ev('location.pathname + location.search'));
}
