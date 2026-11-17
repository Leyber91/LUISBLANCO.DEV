// The survey's search and its random button, as a visitor uses them. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/search.mjs --base http://127.0.0.1:<port> --out <dir> --width 1440 --height 900 --timeout 480
//   (and again with --width 390 --height 844)
//
// A question the page reads in full must give a list of results under the field, each named with the kind of
// world it is drawn as; opening one, with the mouse or the keys, must show the world that was listed; the
// kind found must be the kind drawn; "Another world" must stay inside the question's set. A question with a
// word the page cannot read ("not", a word about the star, an unknown word) must filter nothing and name the
// word. A filter changed by hand must take the question away with its note, its link and its tour.
//
// No model is called. Every request that leaves the page's own origin is refused, or answered by a stand-in
// inside the page that returns the reply the scenario gives it after the delay it gives. That is how the
// rules about a model's reading are tested: it is asked only for what the page left unread, a reply that
// arrives after the visitor moved on is set aside, and a reply that fails its checks changes nothing.
import { exomaniaRules } from './exomania.mjs';

/* ---- run inside the page ---- */

function install() {
  const real = window.fetch.bind(window);
  const model = window.__driveModel = { reply: null, delay: 0, calls: 0 };
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  window.fetch = (u, o = {}) => {
    const url = new URL(typeof u === 'string' ? u : u.url, location.href);
    if (url.origin === location.origin) return real(u, o);
    if ((o.method || 'GET') !== 'POST' || model.reply === null) return Promise.reject(new TypeError('refused by the drive'));
    model.calls++;
    const text = model.reply;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(json({ model: 'drive-model', message: { content: text }, choices: [{ message: { content: text } }] })), model.delay);
      if (o.signal) o.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); });
    });
  };
  // the page's model client is pointed at the local route, whose address the stand-in above answers
  return import(new URL('assets/js/ai/llm.js', location.href).href).then((m) => { m.LLM._ollamaModel = 'drive-model'; m.LLM._detecting = Promise.resolve('ollama'); return true; });
}

function pageState() {
  const $ = (id) => document.getElementById(id);
  const box = $('q-results'), q = $('q'), head = box.querySelector('li.head'), b = box.getBoundingClientRect();
  const rows = box.hidden ? [] : [...box.querySelectorAll('li[role="option"]')].map((l) => {
    const r = l.getBoundingClientRect();
    return { id: l.id, name: (l.querySelector('b') || {}).textContent || '', fact: (l.querySelector('span') || {}).textContent || '', ask: l.classList.contains('ask'), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const count = (document.querySelector('.f-count') || {}).textContent || '';
  const active = q.getAttribute('aria-activedescendant'), row = active ? $(active) : null, rr = row ? row.getBoundingClientRect() : null;
  const note = $('q-note');
  return {
    open: !box.hidden, rows, head: head ? head.textContent : '',
    headQuiet: head ? head.getAttribute('aria-hidden') === 'true' && head.getAttribute('role') === 'presentation' : null,
    note: note.textContent || '', noteShown: note.getBoundingClientRect().height > 0, noteLive: note.getAttribute('aria-live'),
    count, n: +count.replace(/[^\d]/g, ''), filtered: /match/.test(count),
    // the filter's tokens, the size band chosen (by its key; "all" for none), "tour these", and the replay switch's state
    chips: [...document.querySelectorAll('#filters [data-clear]')].map((c) => c.textContent.trim()),
    cls: (document.querySelector('#filters [data-cls][aria-pressed="true"]') || { dataset: {} }).dataset.cls || '',
    tourThese: !!document.querySelector('#filters [data-act="tourthese"]'), replay: (document.querySelector('#filters [data-act="replay"]') || { getAttribute: () => '' }).getAttribute('aria-checked') === 'true' ? 'replaying' : 'still',
    rangesOpen: !$('ranges').hidden,
    fits: b.left >= 0 && b.right <= innerWidth + 1, wide: document.documentElement.scrollWidth > innerWidth + 1,
    listInView: !box.hidden && b.top >= 0 && b.bottom <= innerHeight + 1, rowInView: !!rr && rr.top >= 0 && rr.bottom <= innerHeight + 1,
    field: q.value, expanded: q.getAttribute('aria-expanded'), active, activeExists: !!row, focus: document.activeElement ? document.activeElement.id : '',
    name: ($('ret-name') || {}).textContent || '', render: ($('ret-render') || {}).textContent || '',
    tour: !$('tourbar').hidden, tourK: $('tour-k').textContent, tourCap: $('tour-cap').textContent, tourRuns: $('tour-prog').classList.contains('run'),
    url: location.search, calls: (window.__driveModel || {}).calls,
  };
}

function typeInto(text) { const q = document.getElementById('q'); q.focus(); q.value = text; q.dispatchEvent(new Event('input', { bubbles: true })); }
function askRow() { const box = document.getElementById('q-results'); return box.hidden ? -1 : [...box.querySelectorAll('li[role="option"]')].findIndex((l) => l.classList.contains('ask')); }
function setModel(reply, delay) { const m = window.__driveModel; m.reply = reply; m.delay = delay; m.calls = 0; }
function press(selector) { const e = document.querySelector(selector); if (!e) return false; e.click(); return true; }
function change(selector, value) { const e = document.querySelector(selector); if (!e) return false; e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })); return true; }
function onFirstScreen() {
  const r = (id) => { const e = document.getElementById(id), b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; };
  return { q: r('q'), random: r('btn-random') };
}

/* ---- the scenario ---- */

export default async function search(p, { base }) {
  for (const [n, e] of exomaniaRules()) p.invariant(n, e);
  p.frames();   // and no fully transparent pixel in any frame captured (tools/drive.mjs frames)   // after every step: tools/invariants.mjs, as exomania.mjs registers them
  const call = (fn, ...args) => p.ev(`(${fn})(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  const state = () => call(pageState);
  const open = async (query = '', still = true) => {
    await p.go(`${base}/labs/exomania-survey.html?${still ? 'still' : 'moving'}${query}`);
    await p.until('(() => { const n = (document.getElementById("ret-name") || {}).textContent; return !!n && n.trim().length > 1 && n.trim() !== "…"; })()', 60000);
    await p.sleep(1200);
    await p.ev('(() => { const b = [...document.querySelectorAll("button")].find((x) => /no thanks/i.test(x.textContent)); if (b) b.click(); })()');
    await call(install);
  };
  // type a question, move to "Ask the catalogue" with the keys, press Enter
  const ask = async (text, settle = 900) => {
    await call(typeInto, text);
    await p.sleep(150);
    const i = await call(askRow);
    for (let k = 0; k < i; k++) await p.key('ArrowDown');
    await p.key('Enter');
    await p.sleep(settle);
    return state();
  };
  // the state once no model is reading any more
  const read = async () => { await p.until('!/A model is reading it\\.$/.test(document.getElementById("q-note").textContent)', 20000); await p.sleep(300); return state(); };
  const ly = (r) => +r.fact.match(/([\d,]+) ly$/)[1].replace(/,/g, '');
  const rising = (v) => v.every((x, i) => i === 0 || x >= v[i - 1]);
  const facts = (s) => s.rows.map((r) => `${r.name}: ${r.fact}`).join(' | ');
  const PAGE = /read by this page's own rules\./;
  const unfiltered = (s, whole) => !s.open && s.rows.length === 0 && !s.filtered && s.n === whole.n && s.chips.length === 0;

  await open();
  const where = await call(onFirstScreen);
  p.check('the search field and the "Another world" button are on the first screen', where.q && where.random, JSON.stringify(where));
  const whole = await state();
  p.check('before any question the count is the whole catalogue, and the note is in the page, empty and not drawn', whole.n > 5000 && !whole.filtered && whole.chips.length === 0 && whole.note === '' && !whole.noteShown && whole.noteLive === 'polite', `${whole.count} | note "${whole.note}"`);

  // ---- "cold planet": a list of results, nearest first, each with the kind it is drawn as ----
  await call(setModel, '{"kinds":["molten"]}', 0);   // a model that would answer "lava" if it were asked
  const cold = await ask('cold planet', 1500);
  p.check('"cold planet" opens a list of eight results under the field', cold.open && cold.rows.length === 8 && /^[\d,]+ matches, nearest first, the first 8$/.test(cold.head), `${cold.head} | ${cold.rows.map((r) => r.name).join(', ')}`);
  p.check('the list fits the screen, all of it is in view, and the page does not scroll sideways', cold.fits && cold.listInView && !cold.wide, JSON.stringify({ fits: cold.fits, inView: cold.listInView, wide: cold.wide }));
  p.check('each result names the kind it is drawn as, or says what is not known, and its distance', cold.rows.every((r) => r.name && /^[a-z][a-z ,/-]+, [\d,]+ ly$/.test(r.fact)), facts(cold));
  p.check('the results are in order of distance', rising(cold.rows.map(ly)), cold.rows.map(ly).join(' '));
  p.check('the note says how the question was read, and the filter shows it as one chip', /cold: equilibrium temperature under 200 K, published or computed/.test(cold.note) && PAGE.test(cold.note) && cold.noteShown && cold.chips.length === 1 && cold.chips[0] === 'cold: under 200 K ×', `${cold.note} | ${cold.chips.join(', ')}`);
  p.check('the list counts what the filter counts, and that is fewer than the whole catalogue', cold.head.split(' ')[0] === cold.count.split(' ')[0] && cold.filtered && cold.n > 0 && cold.n < whole.n, `${cold.head} | ${cold.count}`);
  p.check('no world listed as cold is drawn as a hot one', cold.rows.every((r) => !/hot jupiter|lava|molten|warm gas giant/.test(r.fact)), facts(cold));
  p.check('the page read every word, so no model was asked', cold.calls === 0 && !/model/i.test(cold.note), `${cold.calls} calls | ${cold.note}`);
  p.check('the heading row is kept from a screen reader, and the field names the row that is chosen', cold.headQuiet === true && cold.expanded === 'true' && cold.active === cold.rows[0].id && cold.activeExists, JSON.stringify({ quiet: cold.headQuiet, expanded: cold.expanded, active: cold.active }));
  await p.shot('search-cold');

  // the arrow keys stop at the ends of the list, and the chosen row stays in view
  await p.key('ArrowUp');
  const top = await state();
  for (let k = 0; k < 11; k++) await p.key('ArrowDown');
  const bottom = await state();
  p.check('the arrow keys stop at the first and the last result, and the last is in view', top.active === cold.rows[0].id && bottom.active === cold.rows[7].id && bottom.open && bottom.rowInView, `${top.active} ${bottom.active} in view ${bottom.rowInView}`);

  // ---- open the second result with the mouse ----
  await p.click(bottom.rows[1].x, bottom.rows[1].y);
  await p.sleep(1200);
  const second = await state();
  p.check('a click on the second result opens that world', second.name === cold.rows[1].name, `${second.name} for ${cold.rows[1].name}`);
  p.check('the list closes, the question stays in the field and the filter stays', !second.open && second.expanded === 'false' && second.field === 'cold planet' && second.n === cold.n && second.chips.length === 1, JSON.stringify({ open: second.open, field: second.field, count: second.count }));
  p.check('the focus goes to the name of the world that opened', second.focus === 'ret-name', second.focus);
  p.check('the tour bar carries the listed results and says which one this is', second.tour && /cold planet/.test(second.tourK) && /2 of 8/.test(second.tourK) && /nearest first, among [\d,]+ matches\.$/.test(second.tourCap), `${second.tourK} | ${second.tourCap}`);
  await p.shot('search-opened');
  await call(press, '#tour-next');
  await p.sleep(900);
  const third = await state();
  p.check('the next stop is the third result of the list', third.name === cold.rows[2].name && /3 of 8/.test(third.tourK), `${third.name} for ${cold.rows[2].name} | ${third.tourK}`);

  // ---- a new question ends the tour of the one before ----
  const lavaAll = await ask('lava worlds');
  p.check('a new question ends the tour of the one before', !lavaAll.tour && lavaAll.rows.length === 8 && lavaAll.rows.every((r) => /^(lava world|molten-surface world)/.test(r.fact)), `tour ${lavaAll.tour} | ${facts(lavaAll)}`);

  // ---- the kind found is the kind drawn; the keys open a result ----
  const air = await ask('airless rock');
  p.check('"airless rock" lists eight worlds, every one drawn as airless rock', air.rows.length === 8 && air.rows.every((r) => /^airless rock(, radius not measured)?, [\d,]+ ly$/.test(r.fact)), facts(air));
  await p.key('ArrowDown'); await p.key('ArrowDown'); await p.key('Enter');
  await p.sleep(1200);
  const keyed = await state();
  p.check('two presses of the down arrow and Enter open the third result, drawn as airless rock, and the focus goes to its name', keyed.name === air.rows[2].name && /airless rock/.test(keyed.render) && !keyed.open && keyed.focus === 'ret-name', `${keyed.name}: ${keyed.render} | focus ${keyed.focus}`);
  const drawn = [];
  for (let i = 0; i < 4; i++) { await call(press, '#btn-random'); await p.sleep(700); drawn.push(await state()); }
  p.check('"Another world", four times, stays among airless rocks and leaves the question in the field', drawn.every((d) => /airless rock/.test(d.render) && d.field === 'airless rock') && new Set(drawn.map((d) => d.name)).size > 1, drawn.map((d) => `${d.name}: ${d.render}`).join(' | '));

  // ---- "near us" limits the distance; "nearest" only orders ----
  const lava = await ask('lava planets near us');
  p.check('"lava planets near us" lists molten worlds within 50 light-years', lava.rows.length > 0 && lava.rows.every((r) => /^(lava world|molten-surface world)(, radius not measured)?, [\d,]+ ly$/.test(r.fact) && ly(r) <= 50), `${lava.head} | ${facts(lava)}`);
  const nearest = await ask('nearest lava world');
  p.check('"nearest lava world" orders every molten world by distance and leaves none out', nearest.rows.length === 8 && nearest.n === lavaAll.n && nearest.n > lava.n && rising(nearest.rows.map(ly)) && nearest.rows[0].name === lava.rows[0].name && nearest.rows.some((r) => ly(r) > 50) && nearest.chips.length === 1,
    `${nearest.count} against ${lava.count} | ${facts(nearest)}`);

  // ---- an order by temperature uses the temperature "cold" is found by ----
  const coldest = await ask('coldest cold planets');
  const kelvin = (s) => s.rows.map((r) => { const m = r.fact.match(/, ([\d,]+) K( published)?$/); return m ? +m[1].replace(/,/g, '') : NaN; });
  p.check('"coldest cold planets" lists them coldest first, each with its temperature, all under 200 K', /coldest first/.test(coldest.head) && coldest.n === cold.n && kelvin(coldest).length === 8 && kelvin(coldest).every((k) => k < 200) && rising(kelvin(coldest)), `${coldest.head} | ${facts(coldest)}`);

  // ---- a question that only orders ----
  const biggest = await ask('largest planets');
  p.check('a question that only orders lists the whole catalogue in that order, counted as planets', biggest.open && /^[\d,]+ planets, largest first, the first 8$/.test(biggest.head) && biggest.head.split(' ')[0] === whole.count.split(' ')[0] && !biggest.filtered && biggest.rows.every((r) => / R⊕$/.test(r.fact)) && /every planet/.test(biggest.note),
    `${biggest.head} | ${biggest.count} | ${biggest.note}`);
  const coldestAll = await ask('coldest planets');
  p.check('"coldest planets" over the whole catalogue leads with worlds that have an equilibrium temperature, coldest first', coldestAll.rows.length === 8 && kelvin(coldestAll).every((k) => k >= 1 && k < 200) && rising(kelvin(coldestAll)), facts(coldestAll));

  // ---- one face to the star narrows a size ----
  const giants = await ask('giants');
  const lockedGiants = await ask('tidally locked giants');
  p.check('"tidally locked giants" is fewer worlds than "giants", read as both, with a chip for the lock in the note\'s words', lockedGiants.n > 0 && lockedGiants.n < giants.n && /drawn with one face to its star/.test(lockedGiants.note) && /giant: 8 R⊕ or more/.test(lockedGiants.note) && lockedGiants.chips.includes('one face to its star ×'),
    `${lockedGiants.count} against ${giants.count} | ${lockedGiants.note} | ${lockedGiants.chips.join(', ')}`);
  p.check('a question with numbers opens Ranges and says where to change them', lockedGiants.rangesOpen && /The numbers can be changed under Ranges\.$/.test(lockedGiants.note) && lockedGiants.chips.includes('1 range ×'), `${lockedGiants.rangesOpen} | ${lockedGiants.note}`);

  // ---- zero matches ----
  const none0 = await ask('desert giants');
  const stay = none0.name;
  await call(press, '#btn-random');
  await p.sleep(600);
  const still0 = await state();
  p.check('a question that matches nothing opens no list, says why, and offers no tour', !none0.open && none0.n === 0 && /; 0 matches,/.test(none0.note) && /No world that large is drawn with a surface\./.test(none0.note) && !none0.tourThese, `${none0.note} | ${none0.count} | tour these ${none0.tourThese}`);
  p.check('"Another world" with nothing to open stays where it is and says so', still0.name === stay && /No world matches the filter, so there is none to open\.$/.test(still0.note), `${still0.name} | ${still0.note}`);

  // ---- a new question starts from the whole catalogue ----
  await p.ev('document.querySelector("#filters [data-cls=rocky]").click()');   // a size band, chosen by hand
  await p.sleep(400);
  const sized = await state();
  const seas = await ask('ocean worlds');
  p.check('a size chosen with a chip is dropped by the next question', sized.cls !== 'all' && sized.cls !== '' && seas.cls === 'all' && seas.chips.length === 1 && seas.chips[0] === 'drawn with seas ×' && seas.rows.length > 0 && seas.rows.every((r) => /^(temperate world with seas|ocean world)/.test(r.fact)), `${sized.cls} then ${seas.cls} | ${seas.chips.join(', ')} | ${facts(seas)}`);
  await p.sleep(400);
  const linked = await state();
  await call(press, '#filters [data-clear="looks"]');
  await p.sleep(500);
  const cleared = await state();
  p.check('the question is in the link while it filters; clearing its chip takes it out of the link, the note and the field', /[?&]q=ocean/.test(linked.url) && !/[?&]q=/.test(cleared.url) && !cleared.filtered && cleared.n === whole.n && cleared.chips.length === 0 && cleared.note === 'The filter was changed by hand. “ocean worlds” no longer describes what is shown.' && cleared.field === '',
    `${linked.url} then ${cleared.url} | ${cleared.count} | note "${cleared.note}" | field "${cleared.field}"`);

  // ---- a filter changed by hand takes the question away, and what is left is what the screen says ----
  const coldGiants = await ask('cold giants');
  await call(press, '#filters [data-clear="cold"]');
  await p.sleep(500);
  const noCold = await state();
  p.check('one of a question\'s two chips cleared: the other filter stays, and the note and the link no longer claim the question', coldGiants.chips.length === 2 && coldGiants.n < giants.n && noCold.n === giants.n && noCold.chips.length === 1 && noCold.chips[0] === '1 range ×' && /^The filter was changed by hand\. “cold giants” no longer describes what is shown\.$/.test(noCold.note) && !/[?&]q=/.test(noCold.url),
    `${coldGiants.count} then ${noCold.count} | ${noCold.chips.join(', ')} | note "${noCold.note}" | ${noCold.url}`);
  await ask('cold planet');
  await call(change, '#f-method', 'Transit');
  await p.sleep(500);
  const byMethod = await state();
  p.check('the method chosen by hand under a question: the question goes, the count is the screen\'s', byMethod.n < cold.n && byMethod.n > 0 && /changed by hand\. “cold planet” no longer/.test(byMethod.note) && !/[?&]q=/.test(byMethod.url) && byMethod.chips.includes('cold: under 200 K ×'), `${byMethod.count} | note "${byMethod.note}" | ${byMethod.url}`);
  const near30 = await ask('rocky planets within 30 ly');
  await call(change, '#rg-dist-hi', '100');
  await p.sleep(500);
  const near100 = await state();
  p.check('a range edited by hand under a question: the question goes, the count is the screen\'s', near30.rangesOpen && near30.n > 0 && near100.n > near30.n && /changed by hand\. “rocky planets within 30 ly” no longer/.test(near100.note) && !/[?&]q=/.test(near100.url), `${near30.count} then ${near100.count} | note "${near100.note}"`);
  const zoned = await ask('habitable planets');
  const hots = await ask('hot planets');
  p.check('the zone and hot each have a chip', zoned.chips.length === 1 && zoned.chips[0] === 'conservative or optimistic zone ×' && zoned.n > 0 && hots.chips.length === 1 && hots.chips[0] === 'hot: 1,000 K or more ×' && hots.n > cold.n, `${zoned.chips.join(', ')} ${zoned.count} | ${hots.chips.join(', ')} ${hots.count}`);
  p.check('no world listed as hot is a directly imaged one drawn far from its star', hots.rows.length === 8 && hots.rows.every((r) => !/cold gas giant|warm gas giant|frozen/.test(r.fact)), facts(hots));

  // ---- a replay of discoveries stops when a question is asked ----
  await call(press, '#filters [data-act="replay"]');
  await p.sleep(700);
  const replaying = await state();
  const afterReplay = await ask('cold planet', 1600);
  p.check('a question stops a replay of discoveries', replaying.replay === 'replaying' && afterReplay.replay === 'still' && afterReplay.n === cold.n, `${replaying.replay} then ${afterReplay.replay} | ${afterReplay.count}`);

  // ---- questions the page cannot read in full: nothing is filtered, and the word is named ----
  await call(setModel, null, 0);   // no model answers
  await ask('purple planets with rings', 300);
  const odd = await read();
  p.check('a question of unknown words filters nothing, opens no list and names the words', unfiltered(odd, whole) && /: not read: purple, rings\. Nothing was filtered\./.test(odd.note), `${odd.note} | ${odd.count}`);
  p.check('with no model to ask, the note says none answered', /No model answered\.$/.test(odd.note), odd.note);
  await ask('cold planet');
  await ask('planets that are not cold', 300);
  const not = await read();
  p.check('a question with "not" in it filters nothing, drops the filter before it and names the word', unfiltered(not, whole) && /the word “not” is not read here, so nothing was filtered\./.test(not.note), `${not.note} | ${not.count} | ${not.chips.join(', ')}`);
  await p.shot('search-not');
  await ask('planets that arent hot', 300);
  const arent = await read();
  p.check('"arent" with no apostrophe is not read as its opposite', unfiltered(arent, whole) && /the word “arent” is not read here/.test(arent.note), `${arent.note} | ${arent.count}`);
  await ask('planets around cold stars', 300);
  const coldStars = await read();
  p.check('a word about the star is not read as the planet\'s', unfiltered(coldStars, whole) && /not read: cold, stars\. Nothing was filtered\./.test(coldStars.note), `${coldStars.note} | ${coldStars.count}`);
  await ask('hot and cold planets', 300);
  const both = await read();
  p.check('cold and hot together are said to be a doubt', unfiltered(both, whole) && /cold and hot are both asked for, so nothing was filtered\./.test(both.note), `${both.note} | ${both.count}`);
  await ask('the closest planet to its star', 300);
  const orbit = await read();
  p.check('"the closest planet to its star" is not ordered by the distance from here', unfiltered(orbit, whole) && /not read: to, its, star\./.test(orbit.note), `${orbit.note} | ${orbit.count}`);

  await ask('oldest planets', 300);
  const oldest = await read();
  p.check('"oldest planets" is not read as the earliest found', unfiltered(oldest, whole) && /not read: oldest\. Nothing was filtered\./.test(oldest.note), `${oldest.note} | ${oldest.count}`);
  await ask('icy ocean worlds', 300);
  const icySea = await read();
  p.check('"icy ocean worlds" is not read as either kind', unfiltered(icySea, whole) && /two kinds of world are named side by side, so nothing was filtered\./.test(icySea.note), `${icySea.note} | ${icySea.count}`);
  await ask('small red dwarfs', 300);
  const smallDwarfs = await read();
  p.check('"small red dwarfs" is not read as small planets', unfiltered(smallDwarfs, whole) && /not read: small\. Nothing was filtered\. Without it the question would read as: M dwarf host/.test(smallDwarfs.note), `${smallDwarfs.note} | ${smallDwarfs.count}`);
  await ask('planets around giants', 300);
  const aroundGiants = await read();
  p.check('"planets around giants" is not read as giant planets', unfiltered(aroundGiants, whole) && /not read: giants\./.test(aroundGiants.note), `${aroundGiants.note} | ${aroundGiants.count}`);
  const dwarfs = await ask('red dwarfs');
  const mType = await ask('m type stars');
  p.check('"red dwarfs" keeps out the giant stars of the same temperature that "m type stars" lets in, and says so', dwarfs.n > 400 && dwarfs.n < mType.n && /star of 0\.08 to 1\.5 R☉/.test(dwarfs.note) && dwarfs.chips.includes('2 ranges ×') && mType.chips.includes('1 range ×'), `${dwarfs.count} against ${mType.count} | ${dwarfs.note}`);
  const imagedHot = await ask('hottest imaged planets');
  p.check('an order no listed world has a value for is said to be the catalogue\'s', imagedHot.rows.length === 8 && /in catalogue order, since none of them has a value to order by/.test(imagedHot.head) && /in catalogue order, since none of them has a value to order by/.test(imagedHot.note) && imagedHot.rows.every((r) => /(no equilibrium temperature|seen by its own heat)$/.test(r.fact)),
    `${imagedHot.head} | ${imagedHot.note}`);
  const imagedCold = await ask('cold imaged planets');
  p.check('cold asked of imaged planets finds none and says why', imagedCold.n === 0 && /A directly imaged planet is seen by its own heat, and is given no equilibrium temperature here\./.test(imagedCold.note), `${imagedCold.count} | ${imagedCold.note}`);

  // ---- a scrap is sent to no model ----
  await call(setModel, '{"kinds":["molten"]}', 0);
  const scrap = await ask('?', 1200);
  p.check('a question with nothing in it is sent to no model', scrap.calls === 0 && unfiltered(scrap, whole) && /it names nothing to filter or to order by\.$/.test(scrap.note), `${scrap.calls} calls | ${scrap.note}`);

  // ---- a model reads what the page left ----
  await call(setModel, '{"ranges":{"Teq":[200,null]}}', 500);
  await ask('planets that aren’t cold', 300);
  const notRead = await read();
  p.check('a model is asked to read the negation, and its reading is applied and named', notRead.calls === 1 && /read by drive-model \(ollama\)/.test(notRead.note) && /Teq \(published\) from 200 K/.test(notRead.note) && notRead.filtered && notRead.n > 0 && notRead.n < whole.n && notRead.chips.includes('1 range ×'), `${notRead.calls} calls | ${notRead.note} | ${notRead.count} | ${notRead.chips.join(', ')}`);
  await call(setModel, '{"temperature":"cold","ranges":{"dist":[null,100]}}', 1500);
  const before = await ask('fluffy cold planets', 300);
  p.check('while the model reads, nothing is filtered and the note says what the rest would read as', unfiltered(before, whole) && /not read: fluffy\. Nothing was filtered\. Without it the question would read as: cold: .*\. A model is reading it\.$/.test(before.note), `${before.note} | ${before.count}`);
  const after = await read();
  p.check('the model\'s reading is then applied and named, and the list opens under the field', after.calls === 1 && /read by drive-model \(ollama\)/.test(after.note) && after.n > 0 && after.n < cold.n && after.chips.includes('cold: under 200 K ×') && after.chips.includes('1 range ×') && after.open && after.head.split(' ')[0] === after.count.split(' ')[0] && after.rows.every((r) => ly(r) <= 100),
    `${after.note} | ${after.count} | ${after.head} | ${after.chips.join(', ')}`);
  await p.shot('search-model');

  // ---- Escape does not stop a model that is reading, and Enter pressed again sends nothing more ----
  await call(setModel, '{"temperature":"cold"}', 1500);
  await ask('fluffy cold planets', 300);
  await p.key('Escape');
  await p.key('Enter'); await p.key('Enter'); await p.key('Enter');
  const kept = await read();
  p.check('Escape and three more presses of Enter while a model reads: one call, the field kept, the reading applied', kept.calls === 1 && kept.field === 'fluffy cold planets' && /read by drive-model \(ollama\)/.test(kept.note) && kept.n === cold.n, `${kept.calls} calls | field "${kept.field}" | ${kept.note}`);

  // ---- one word that starts a name brings the names back on Enter, and is sent to no model ----
  await call(setModel, '{"kinds":["molten"]}', 0);
  await call(typeInto, 'kepler-4');
  await p.sleep(250);
  const names1 = await state();
  await p.key('Escape');
  await p.key('Enter');
  await p.sleep(500);
  const names2 = await state();
  p.check('a name typed, the list closed with Escape, then Enter: the names come back and no model is asked', names1.rows.length > 1 && names1.rows.every((r) => !r.ask) && names2.open && names2.rows.length === names1.rows.length && names2.calls === 0 && names2.field === 'kepler-4', `${names1.rows.length} then ${names2.rows.length} rows | ${names2.calls} calls`);
  await p.key('Enter');
  await p.sleep(900);
  const named = await state();
  p.check('choosing a name opens that world and empties the field', named.name === names2.rows[0].name && named.field === '' && named.focus === 'ret-name', `${named.name} | field "${named.field}"`);

  // ---- a reply that arrives after the visitor moved on ----
  await call(setModel, '{"temperature":"cold","ranges":{"dist":[null,100]}}', 2500);
  await ask('fluffy cold planets', 300);
  await call(press, '#btn-random');
  const late = await read();
  p.check('a model\'s reading that arrives after another world was opened is set aside, and the note says so', late.calls === 1 && !late.filtered && late.n === whole.n && late.chips.length === 0 && /arrived after you had moved on, and was set aside\.$/.test(late.note), `${late.count} | ${late.chips.join(', ')} | ${late.note}`);
  await call(setModel, '{"temperature":"cold"}', 2000);
  await ask('fluffy cold planets', 300);
  await call(typeInto, 'fluffy cold planets and');
  const typed = await read();
  p.check('a model\'s reading that arrives after more was typed is set aside too', typed.calls === 1 && !typed.filtered && typed.field === 'fluffy cold planets and' && /was set aside\.$/.test(typed.note), `${typed.count} | field "${typed.field}" | ${typed.note}`);

  // ---- the next question takes the place of one still being read ----
  await call(setModel, '{"temperature":"cold"}', 2000);
  await ask('fluffy cold planets', 200);
  await call(setModel, '{"kinds":["molten"]}', 300);
  await ask('fluffy lava worlds', 300);
  const taken = await read();
  p.check('a question asked while another is being read takes its place, and the first reply is never applied', taken.calls === 1 && /“fluffy lava worlds” reads as lava world/.test(taken.note) && taken.n === lavaAll.n && taken.chips.length === 1 && taken.chips[0] === 'lava world ×', `${taken.calls} calls | ${taken.note} | ${taken.count} | ${taken.chips.join(', ')}`);

  // ---- a reply that matches nothing, and one that fails its checks ----
  await call(setModel, '{"ranges":{"R":[5000,null]}}', 300);
  await ask('fluffy cold planets', 300);
  const none = await read();
  p.check('a model\'s reading that matches no planet is set aside, and nothing is filtered', none.calls === 1 && unfiltered(none, whole) && /not read: fluffy\./.test(none.note) && /reading matched no planet and was set aside\.$/.test(none.note), `${none.count} | ${none.note}`);
  await call(setModel, '{"kinds":["jungle"]}', 300);
  await ask('fluffy cold planets', 300);
  const unsound = await read();
  p.check('a model\'s reply that fails its checks changes nothing, and the note says it failed', unsound.calls === 1 && unfiltered(unsound, whole) && /The model's reply failed its checks\.$/.test(unsound.note), `${unsound.count} | ${unsound.note}`);
  await call(setModel, null, 0);

  // ---- Escape and leaving the field close the list ----
  const again = await ask('cold planet');
  await p.key('Escape');
  await p.sleep(200);
  const escaped = await state();
  const once = await ask('cold planet');
  await p.ev('document.getElementById("q").blur()');
  await p.sleep(400);
  const left = await state();
  p.check('Escape closes the list and leaves the question in the field, with its filter and its note; leaving the field closes the list too', again.open && !escaped.open && escaped.field === 'cold planet' && escaped.n === cold.n && /cold planet/.test(escaped.note) && once.open && !left.open && left.field === 'cold planet',
    JSON.stringify({ again: again.open, escaped: escaped.open, field: escaped.field, count: escaped.count, once: once.open, left: left.open }));
  await call(typeInto, 'cold planet');
  await p.key('Escape'); await p.key('Escape');
  await p.sleep(200);
  const twice = await state();
  p.check('Escape with no list open leaves the field as it is', twice.field === 'cold planet' && twice.n === cold.n, `field "${twice.field}" | ${twice.count}`);

  // ---- with no question: text half typed is not wiped, and a remark about the old filter does not outlive it ----
  await call(press, '#filters [data-clear="cold"]');
  await p.ev('document.querySelector("#filters [data-cls=rocky]").click()');
  await p.sleep(300);
  await call(typeInto, 'my half typed');
  await p.ev('document.getElementById("q").blur()');
  await p.sleep(300);
  await call(press, '#filters [data-act="tourthese"]');
  await p.sleep(900);
  const halfTyped = await state();
  p.check('"Tour these" over a filter set by hand leaves text half typed in the field', halfTyped.tour && halfTyped.field === 'my half typed', `tour ${halfTyped.tour} | field "${halfTyped.field}"`);
  await call(press, '#tour-end');
  await p.ev('document.querySelector("#filters [data-cls=all]").click()');
  if (!(await state()).rangesOpen) await call(press, '#filters [data-act="ranges"]');
  await p.sleep(300);
  await call(change, '#rg-R-lo', '5000');
  await p.sleep(400);
  await call(press, '#btn-random');
  await p.sleep(400);
  const noneLeft = await state();
  await call(press, '#filters [data-clear="ranges"]');
  await p.sleep(400);
  const back = await state();
  p.check('"no world matches" is said for a filter set by hand, and is gone when the filter is', noneLeft.n === 0 && /No world matches the filter, so there is none to open\.$/.test(noneLeft.note) && back.n === whole.n && back.note === '', `${noneLeft.count} "${noneLeft.note}" then ${back.count} "${back.note}"`);

  // ---- a shared link with a question: the filter is applied and no list hangs open ----
  await open('&q=' + encodeURIComponent('cold planet'));
  const shared = await state();
  p.check('a link that carries a question applies it, puts it back in the field and opens no list', !shared.open && /cold: equilibrium temperature under 200 K/.test(shared.note) && shared.filtered && shared.n === cold.n && shared.chips.length === 1 && shared.field === 'cold planet', `${shared.note} | ${shared.count} | field "${shared.field}"`);
  await open('&q=' + encodeURIComponent('<img src=x onerror=window.__hit=1> not cold'));
  const marked = await state();
  const hit = await p.ev('window.__hit === 1 || !!document.querySelector("#q-note img, #filters img, #tourbar img")');
  p.check('markup in a shared question stays text, and its "not" filters nothing', !hit && !marked.filtered && /the word “not” is not read here/.test(marked.note) && /<img src=x/.test(marked.note), `${marked.note} | hit ${hit}`);

  // ---- with motion on: a result opened from the list waits; "Tour these" moves by itself and stops for typing ----
  await open('', false);
  const moving = await ask('cold planet');
  await p.click(moving.rows[0].x, moving.rows[0].y);
  await p.sleep(900);
  const waits = await state();
  await call(press, '#filters [data-act="tourthese"]');
  await p.sleep(900);
  const runs = await state();
  p.check('a result opened from the list waits for the visitor; "Tour these" advances by itself', waits.tour && !waits.tourRuns && waits.name === moving.rows[0].name && runs.tour && runs.tourRuns, JSON.stringify({ waits: waits.tourRuns, runs: runs.tourRuns, name: waits.name }));
  await call(typeInto, 'lava wor');
  await p.sleep(600);
  const typing = await state();
  p.check('typing in the field stops a tour that moves by itself, and what is typed stays', typing.tour && !typing.tourRuns && typing.field === 'lava wor', JSON.stringify({ runs: typing.tourRuns, field: typing.field }));
  await call(press, '#tour-end');
}
