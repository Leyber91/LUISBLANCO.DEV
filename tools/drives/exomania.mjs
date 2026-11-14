/* ============================================================
   tools/drives/exomania.mjs — Overdue, by hand.

   Run by `node tools/labs-wt.mjs drive exomania` (tools/drive.mjs).

   What it proves: the two data files load and the page says so;
   a clock is drawn and its readouts are numbers; the record keeps
   its size; dragging across it moves the date and the error widens
   with it; a finger that scrolls past moves nothing; the date
   buttons and the clock selector work, and another clock is looked
   at on the date already shown; a planet can be opened by name and
   a wrong name is refused in words; a place can be set, refused
   when it is not one, and forgotten; the table lists what it says
   it lists; the chosen planet and the place survive a reload
   through the labs' store; the tally is the one the lab's tests
   compute; a link made by the survey before it moved still reaches
   the survey. Each check that names a fault is one an independent
   review found on 2026-11-14.
   ============================================================ */

export default async function exomania(p, { base }) {
  const text = (id) => p.ev(`(document.getElementById(${JSON.stringify(id)}) || {}).textContent || ""`);
  const state = () => p.ev('document.body.dataset.state || ""');
  const rect = (id) => p.ev(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
  const ready = () => p.until('document.body.dataset.state === "ready"', 30000);
  const year = async () => Number((await text('r-date')).slice(0, 4));
  const rowsShown = () => p.ev('document.querySelectorAll("#t-body tr").length');
  const total = async () => Number(((await text('t-count')).match(/^([\d,]+) transit/) || [0, '0'])[1].replace(/,/g, ''));
  const open = (name) => p.ev(`(() => { const i = document.getElementById("pick"); i.value = ${JSON.stringify(name)}; document.getElementById("pick-form").requestSubmit(); })()`);

  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the clocks and the published record load', await ready(), await state());
  p.check('the page opens on a planet', (await p.ev('document.getElementById("pick").value')) === 'HD 209458 b');
  const today = new Date().toISOString().slice(0, 10);
  p.check('the date shown is today', (await text('r-date')) === today, await text('r-date'));
  p.check('the lamp is a number and the clock has a state', /^[\d,.]+$/.test(await text('r-lamp')) && ['read', 'fading', 'lost'].includes(await text('r-state')), `${await text('r-lamp')} / ${await text('r-state')}`);
  p.check('the error is stated with its unit', /^± [\d.]+ (ms|s|min|h|d|yr)$/.test(await text('r-window')), await text('r-window'));
  p.check('an error wider than the orbit is said to cover it', /covers the whole orbit/.test(await text('r-window-note')), await text('r-window-note'));
  p.check('later papers that came after the error covered the orbit are said to test nothing', /^\d+ later papers timed the transit after the two uncertainties together had reached a sixth of the orbit.* no test of this clock\.$/.test(await text('r-record')), await text('r-record'));
  p.check('a paper published beside the clock, timing a transit from before both, is not called a test', !/ of \d+ later paper/.test(await text('r-record')) && (await p.ev('[...document.querySelectorAll("#r-points li")].some((li) => /Henry/.test(li.textContent) && /no test/.test(li.textContent))')), await p.ev('([...document.querySelectorAll("#r-points li")].find((li) => /Henry/.test(li.textContent)) || {}).textContent'));
  p.check('the record carries its legend', /above the line it found the transit later .* Gold: a later paper that tests this clock/.test(await text('r-point')));
  p.check('every point of the record is also a sentence, in a list anybody can open', (await p.ev('document.querySelectorAll("#r-points li").length')) === 8 && /sigma/.test(await p.ev('document.querySelector("#r-points li").textContent')) && /8 other published solutions of HD 209458 b/.test(await text('r-count')), await text('r-count'));
  p.check('no name in the clock list shows raw markup', await p.ev('![...document.querySelectorAll("#clock option")].some((o) => /&[a-z]+;|&#\\d+;/i.test(o.textContent))'), await p.ev('document.querySelector("#clock").options.length'));
  p.check('the catalogue is counted', Number((await text('s-planets')).replace(/,/g, '')) > 4000 && /^[\d,]+ \([\d.]+ %\)$/.test(await text('s-lost')) && /^[\d,]+ \([\d.]+ %\)$/.test(await text('s-disputed')), `${await text('s-planets')} planets, ${await text('s-lost')} lost, ${await text('s-disputed')} disputed`);
  p.check('the tally is the one the tests compute', (await text('y-real')) === '450' && (await text('y-blind')) === '3' && (await text('y-inside')).startsWith('201') && (await text('y-beyond')).startsWith('65') && (await text('y-same')) === '60', `${await text('y-real')} / ${await text('y-blind')} / ${await text('y-inside')} / ${await text('y-beyond')} / ${await text('y-same')}`);
  p.check('the tally names the catalogue it leans on', /Kokori/.test(await text('y-top-name')) && /^\d+ \(\d+ %\)$/.test(await text('y-top')), `${await text('y-top-name')}: ${await text('y-top')}`);
  p.check('transits in the next 24 hours are listed, with the lost and the disputed counted', /transits have their predicted middle in the next 24 hours\. [\d,]+ of those predictions come from a clock that is lost, and [\d,]+ from a clock that another published solution contradicts/.test(await text('t-count')) && (await rowsShown()) === 40, (await text('t-count')).slice(0, 150));
  p.check('the table says how many of them it lists', new RegExp(`^40 of ${(await total()).toLocaleString('en-US')} listed$`).test(await text('t-shown')), await text('t-shown'));
  p.check('text a visitor must read is not drawn in the faint ink', (await p.ev('getComputedStyle(document.getElementById("r-point")).color')) === (await p.ev('getComputedStyle(document.getElementById("r-orbits")).color')) && (await p.ev('getComputedStyle(document.getElementById("t-rule")).color')) === (await p.ev('getComputedStyle(document.getElementById("r-orbits")).color')), await p.ev('getComputedStyle(document.getElementById("r-point")).color'));
  p.check('the page does not scroll sideways', await p.ev('document.documentElement.scrollWidth <= window.innerWidth'), `${await p.ev('document.documentElement.scrollWidth')} of ${await p.ev('window.innerWidth')}`);

  // the record keeps the size it was laid out with
  const h0 = (await rect('record')).h;
  await p.sleep(2500);
  const h1 = (await rect('record')).h, orbitH = (await rect('orbit')).h;
  p.check('the record does not grow after the page has loaded', Math.abs(h1 - h0) < 1 && h1 >= 280 && h1 < Math.max(orbitH, 300) + 140, `${h0} then ${h1} px; the orbit is ${orbitH} px`);
  await p.ev('document.getElementById("plate-a").scrollIntoView({ block: "start" })');
  await p.sleep(300);
  await p.shot('01-clock-today');

  // drag across the record: the date follows, and the error widens toward 2040
  const before = await text('r-window');
  await p.ev('document.getElementById("record").scrollIntoView({ block: "center" })');      // on a phone the record is a screen below the orbit
  await p.sleep(250);
  const r = await rect('record');
  await p.drag(r.x + r.w * 0.5, r.y + r.h * 0.5, r.x + r.w * 0.97, r.y + r.h * 0.5, { steps: 12 });
  await p.sleep(200);
  p.check('dragging across the record moves the date toward 2040', (await year()) >= 2037, await text('r-date'));
  p.check('and the error is stated anew', (await text('r-window')) !== before, `${before} -> ${await text('r-window')}`);
  await p.shot('02-clock-2039');
  await p.ev('document.getElementById("to-epoch").click()');
  p.check('"its epoch" goes back to the clock\'s own date', (await year()) < 2015, await text('r-date'));
  await p.ev('document.getElementById("to-end").click()');
  p.check('"2040" goes to the end', (await text('r-date')) === '2040-01-01', await text('r-date'));

  // another clock of the same planet, on the date already shown
  const c0 = await text('r-clock');
  await p.ev('(() => { const s = document.getElementById("clock"); s.value = "best"; s.dispatchEvent(new Event("change", { bubbles: true })); })()');
  await p.sleep(300);
  p.check('choosing the working clock changes what is drawn', (await text('r-clock')) !== c0 && /Kokori/.test(await text('r-clock')), (await text('r-clock')).slice(0, 120));
  p.check('and the date shown stays where it was', (await text('r-date')) === '2040-01-01', await text('r-date'));
  p.check('the clock line states each error with one unit', !/ s d|0\.0 s/.test(await text('r-clock')), await text('r-clock'));
  await p.ev('document.getElementById("to-today").click()');
  p.check('"today" comes back', (await text('r-date')) === today, await text('r-date'));

  // a finger: touching down moves nothing (the swipe may be a scroll); a tap sets the date
  const touchAt = (type, fx) => p.ev(`(() => { const c = document.getElementById("record"), b = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent(${JSON.stringify(type)}, { pointerType: "touch", pointerId: 7, clientX: b.x + b.width * ${fx}, clientY: b.y + b.height * 0.5, bubbles: true })); })()`);
  await touchAt('pointerdown', 0.3); await touchAt('pointercancel', 0.3);
  p.check('a finger that touches the record and scrolls away moves no date', (await text('r-date')) === today, await text('r-date'));
  await touchAt('pointerdown', 0.3); await touchAt('pointerup', 0.3);
  p.check('a tap on the record sets the date', (await text('r-date')) !== today && (await year()) < 2022, await text('r-date'));
  await p.ev('document.getElementById("to-today").click()');

  // the slider under the record does the same by keyboard
  await p.ev('document.getElementById("scrub").focus()');
  const d0 = await text('r-date');
  for (let i = 0; i < 5; i++) await p.key('ArrowRight');
  await p.sleep(150);
  p.check('the slider moves the date by keyboard', (await text('r-date')) !== d0, `${d0} -> ${await text('r-date')}`);

  // a planet by name, and a name that is none
  await open('WASP-12 b');
  await p.sleep(400);
  p.check('a planet opens by its name', /1\.0914/.test(await text('r-clock')), (await text('r-clock')).slice(0, 100));
  p.check('its record counts the later papers that test the clock', /^\d+ of \d+ later papers? that tests? this clock found the transit inside its 1-sigma window\./.test(await text('r-record')), await text('r-record'));
  await open('<img src=x onerror=1>');
  await p.sleep(200);
  p.check('a name that is no planet is refused in words, and nothing is injected', /^No transiting planet named "<img src=x onerror=1>"/.test(await text('pick-msg')) && (await p.ev('document.querySelectorAll("main img").length')) === 0, await text('pick-msg'));
  await open('WASP-12 b');
  await p.sleep(300);

  // the table, before a place: all of it, and back
  await p.ev('document.getElementById("t-all").click()');
  await p.sleep(400);
  p.check('show all lists every transit it counted', (await rowsShown()) === (await total()) && (await total()) > 800, `${await rowsShown()} rows for ${await total()} transits`);
  await p.ev('document.getElementById("t-all").click()');
  await p.sleep(200);
  p.check('and the first 40 come back', (await rowsShown()) === 40);

  // a place
  await p.ev('(() => { document.getElementById("lat").value = "941"; document.getElementById("lon").value = "2.17"; document.getElementById("place-form").requestSubmit(); })()');
  await p.sleep(200);
  p.check('a latitude of 941 is refused in words', /latitude from -90 to 90/.test(await text('place-msg')), await text('place-msg'));
  await p.ev('(() => { document.getElementById("lat").value = "0x10"; document.getElementById("lon").value = "2.17"; document.getElementById("place-form").requestSubmit(); })()');
  await p.sleep(200);
  p.check('a latitude written as 0x10 is refused, not read as 16', /latitude from -90 to 90/.test(await text('place-msg')) && (await p.ev('document.getElementById("t-table").classList.contains("no-place")')));
  await p.ev('(() => { document.getElementById("lat").value = "41.39"; document.getElementById("lon").value = "2,17"; document.getElementById("place-form").requestSubmit(); })()');
  await p.sleep(500);
  p.check('a place is set, with a comma for the decimal point', /[\d,]+ transits? can be watched from 41\.39°, 2\.17°\.$/.test(await text('t-count')), (await text('t-count')).slice(-60));
  const watch = Number(((await text('t-count')).match(/([\d,]+) transits? can be watched/) || [0, '0'])[1].replace(/,/g, ''));
  p.check('the table then lists exactly the transits that can be watched, each said so in words', (await rowsShown()) === Math.max(1, watch) && (watch === 0 || (await p.ev('[...document.querySelectorAll("#t-body tr")].every((tr) => tr.children[3].textContent === "can be watched")'))), `${await rowsShown()} rows, ${watch} watchable`);
  await p.ev('document.getElementById("t-all").click()');
  await p.sleep(400);
  p.check('show all lists every transit with its altitude through the transit, its sky and why it cannot be watched', (await rowsShown()) === (await total()) && /°/.test(await p.ev('document.querySelector("#t-body tr td:nth-child(5)").textContent')) && (await p.ev('[...document.querySelectorAll("#t-body tr")].every((tr) => tr.children[3].textContent.length > 3)')), await p.ev('[...new Set([...document.querySelectorAll("#t-body tr")].map((tr) => tr.children[3].textContent))].join(", ")'));
  p.check('the table can be reached and scrolled by keyboard, and has a caption', (await p.ev('document.getElementById("t-wrap").tabIndex')) === 0 && /Predicted transits in the next 24 hours/.test(await text('t-cap')));
  await p.ev('document.getElementById("plate-b").scrollIntoView({ block: "start" })');
  await p.sleep(300);
  await p.shot('03-tonight');
  await p.ev('document.querySelector("#t-body tr button").click()');
  await p.sleep(400);
  p.check('opening a planet from the table moves the reader to plate a', (await p.ev('document.activeElement && document.activeElement.id')) === 'a-title' && (await p.ev('document.getElementById("pick").value')) !== 'WASP-12 b', await p.ev('document.activeElement && document.activeElement.id'));
  await open('WASP-12 b');
  await p.sleep(300);

  // the planet and the place survive a reload
  await p.sleep(500);
  await p.go(`${base}/labs/exomania.html?still`);
  p.check('the page comes up again', await ready());
  p.check('the planet survives a reload', (await p.ev('document.getElementById("pick").value')) === 'WASP-12 b', await p.ev('document.getElementById("pick").value'));
  p.check('the place survives a reload', (await p.ev('document.getElementById("lat").value')) === '41.39' && /41\.39°/.test(await text('t-count')));
  await p.ev('document.getElementById("t-all").click()');
  await p.sleep(300);
  await p.ev('document.getElementById("forget").click()');
  await p.sleep(300);
  p.check('the place can be forgotten, and the table goes back to its first 40', /Set a place/.test(await text('t-count')) && (await p.ev('document.getElementById("lat").value')) === '' && (await rowsShown()) === 40, `${await rowsShown()} rows`);
  await p.ev('window.scrollTo(0, 0)');
  await p.sleep(200);
  await p.shot('04-top');
  await p.ev('document.getElementById("c-title").scrollIntoView({ block: "start" })');
  await p.sleep(200);
  await p.shot('05-tally');

  // links
  await p.go(`${base}/labs/exomania.html?still&planet=${encodeURIComponent('TRAPPIST-1 c')}&date=2035-06-01`);
  p.check('a link opens a planet at a date', (await ready()) && (await p.ev('document.getElementById("pick").value')) === 'TRAPPIST-1 c' && (await text('r-date')) === '2035-06-01', `${await p.ev('document.getElementById("pick").value')} ${await text('r-date')}`);
  await p.go(`${base}/labs/exomania.html?still&planet=Planet%20Nine&date=275760-09-13`);
  p.check('a link to a planet that does not exist says so, and a date past the drawing stops at its end', (await ready()) && /^No transiting planet named "Planet Nine".* Showing /.test(await text('pick-msg')) && (await text('r-date')) === '2040-01-01', `${await text('pick-msg')} / ${await text('r-date')}`);
  await p.go(`${base}/labs/exomania.html?p=${encodeURIComponent('Kepler-62 e')}`);
  await p.until('location.pathname.endsWith("exomania-survey.html")', 15000);
  p.check('a link made by the survey before it moved still reaches the survey, with its planet', (await p.ev('location.pathname.endsWith("exomania-survey.html")')) && /Kepler-62/.test(await p.ev('decodeURIComponent(location.search)')), await p.ev('location.pathname + location.search'));
}
