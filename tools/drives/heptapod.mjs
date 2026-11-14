/* ============================================================
   tools/drives/heptapod.mjs — one day in the pod, by hand.

   Run by `node tools/labs-wt.mjs drive heptapod` (tools/drive.mjs).
   Every position comes from the page's own probe (the canvas
   element's probe(), set in pod/main.js), so this file holds no
   copy of the scene's layout.

   What it proves: a ring can be cropped, a thing can be taken, set
   down, held up and passed through the glass, one gesture is one
   act, the keyboard does the same, a mark can be raised, the day
   and a pencil guess survive a reload through the labs' store, and
   the evening runs to its count.
   ============================================================ */

export default async function heptapod(p, { base }) {
  const probe = () => p.ev('document.getElementById("pod").probe()');
  const ringNo = () => p.ev('(document.querySelector("#panel .pp-lamp .mini") || {}).textContent || ""');
  const entries = () => p.ev('document.querySelectorAll("#nb .nb-entry").length');
  const panelHead = () => p.ev('(document.querySelector("#panel .mini") || {}).textContent || ""');
  const ready = () => p.until('!!document.querySelector("#panel .pp") && typeof document.getElementById("pod").probe === "function"');
  /* a crop of one side of the ring: the rectangle around a point at angle deg (clockwise from the top) */
  const cropSide = async (g, deg) => {
    const a = (deg * Math.PI) / 180, cx = g.ring.x + Math.sin(a) * g.ring.R, cy = g.ring.y - Math.cos(a) * g.ring.R, h = 0.55 * g.ring.R;
    await p.drag(cx - h, cy - h, cx + h, cy + h);
    await p.sleep(250);
  };
  const first = (g, place) => Object.entries(g.things).find(([, t]) => t.place === place);

  await p.go(`${base}/labs/heptapod.html`);
  p.check('the page comes up', await ready());
  await p.ev('document.getElementById("pod").scrollIntoView({ block: "center" })');
  await p.sleep(400);
  let g = await probe();
  p.check('the day starts at ring 0', (await ringNo()).includes('ring 0 of 40'), await ringNo());

  // the greeting stays on the glass until the first act: keep its lower part
  p.check('the greeting is on the glass and can be cropped', await p.until('document.getElementById("pod").probe().crop', 6000));
  await p.shot('01-greeting');
  await cropSide(g, 180);
  p.check('a crop of the greeting lands in the notebook', (await entries()) === 1, `${await entries()} entries`);

  // take a thing from the plate at the glass
  let [name, t] = first(g, 'near');
  await p.drag(t.x, t.y, t.x, t.y - 0.11 * g.height, { steps: 12 });      // up into the air, short of the glass
  await p.sleep(200);
  p.check('taking a thing writes ring 1', (await ringNo()).includes('ring 1 of 40'), await ringNo());
  p.check('the greeting gave way to the new ring', await p.until('document.getElementById("pod").probe().crop', 6000));
  await p.sleep(700);
  await p.shot('02-ring-hangs');
  await cropSide(g, 90);
  p.check('a crop of the right side lands in the notebook', (await entries()) === 2, `${await entries()} entries`);
  // who takes is written on the left, and it is the radical at the foot of the greeting: the notebook knows it again
  await cropSide(g, 270);
  const said = await p.ev('document.getElementById("say").textContent');
  p.check('the left of ring 1 is the radical at the foot of the greeting', (await entries()) === 2 && said.includes('already in the notebook'), `${await entries()} entries; "${said}"`);
  // late in the thinning only hairlines are left on that side: a crop of them is a scrap
  await p.until('!document.getElementById("pod").probe().ink', 12000);
  p.check('the ring thins away', !(await probe()).ink);

  // set the held thing down on the far plate
  g = await probe();
  t = g.things[name];
  p.check('the thing is in the hand', t.held, name);
  await p.drag(t.x, t.y, g.plates.far.x - 0.2 * g.width, g.plates.far.y - 0.01 * g.height, { steps: 16 });
  await p.sleep(200);
  p.check('setting it down far writes ring 2', (await ringNo()).includes('ring 2 of 40'), await ringNo());
  g = await probe();
  p.check('the thing is on the far plate', g.things[name].place === 'far', g.things[name].place);

  // raise a mark
  await p.ev('(() => { const i = document.getElementById("slate"); i.value = "Down"; i.form.requestSubmit(); })()');
  await p.sleep(300);
  p.check('a raised mark is listed, lower-cased, with its count', (await p.ev('(document.querySelector(".pp-mark") || {}).textContent || ""')).startsWith('down'), await p.ev('(document.querySelector(".pp-mark") || {}).textContent || ""'));

  // one gesture is one act: a thing dragged from its plate all the way onto the glass is taken, and stays in the hand
  [name, t] = first(g, 'near');
  await p.drag(t.x, t.y, t.x, g.glass.y, { steps: 20 });
  await p.sleep(350);
  p.check('dragging a thing onto the glass only takes it: ring 3', (await ringNo()).includes('ring 3 of 40'), await ringNo());
  g = await probe();
  p.check('it is in the hand, not given', g.things[name].held, name);
  // a second gesture passes it through the glass
  t = g.things[name];
  await p.drag(t.x, t.y, t.x, g.glass.y, { steps: 14 });
  await p.sleep(250);
  p.check('the second gesture gives it: ring 4', (await ringNo()).includes('ring 4 of 40'), await ringNo());
  await p.sleep(1700);
  g = await probe();
  p.check('a given thing comes back to the plate at the glass', g.things[name].place === 'near', g.things[name].place);

  // take a thing from the far plate, then hold it up at the glass with a second gesture
  [name, t] = first(g, 'far');
  await p.drag(t.x, t.y, t.x, t.y - 0.14 * g.height, { steps: 12 });
  await p.sleep(350);
  p.check('taking from the far plate writes ring 5', (await ringNo()).includes('ring 5 of 40'), await ringNo());
  g = await probe();
  t = g.things[name];
  await p.drag(t.x, t.y, g.air.near.x + 0.06 * g.width, g.air.near.y - 0.03 * g.height, { steps: 14 });
  await p.sleep(300);
  p.check('holding it up at the glass writes ring 6', (await ringNo()).includes('ring 6 of 40'), await ringNo());
  await p.until('document.getElementById("pod").probe().crop', 6000);
  await p.sleep(500);
  await p.shot('04-held-at-the-glass');

  // the keyboard: W keeps the top of the ring, Enter sets the thing down
  await p.ev('document.getElementById("pod").focus()');
  const before = await entries();
  await p.key('w');
  await p.sleep(250);
  p.check('W keeps the top of the ring', (await entries()) === before + 1, `${before} -> ${await entries()}`);
  await p.key('Enter');
  await p.sleep(250);
  p.check('Enter sets the thing down and writes ring 7', (await ringNo()).includes('ring 7 of 40'), await ringNo());

  // a pencil guess and the day survive a reload
  await p.ev('(() => { const i = document.querySelector(".nb-guess"); i.value = "the one who takes?"; i.dispatchEvent(new Event("input", { bubbles: true })); })()');
  await p.sleep(600);
  await p.ev('window.scrollTo(0, 0)');
  await p.shot('05-notebook');
  await p.go(`${base}/labs/heptapod.html`);
  p.check('the page comes up again', await ready());
  p.check('the day survives a reload', (await ringNo()).includes('ring 7 of 40'), await ringNo());
  p.check('the guess survives a reload', (await p.ev('(document.querySelector(".nb-guess") || {}).value || ""')) === 'the one who takes?');
  p.check('the notebook survives a reload', (await entries()) === before + 1, `${await entries()} entries`);

  // the evening, from a recorded day
  // a link that picks the species is played and never stored: the kept day is still there afterwards
  await p.go(`${base}/labs/heptapod.html?species=1`);
  p.check('a species link comes up as a day of its own', (await ready()) && (await ringNo()).includes('ring 0 of 40'), await ringNo());
  g = await probe();
  [name, t] = first(g, 'near');
  await p.drag(t.x, t.y, t.x, t.y - 0.11 * g.height, { steps: 10 });
  await p.sleep(300);
  await p.go(`${base}/labs/heptapod.html`);
  p.check('and it did not replace the kept day', (await ready()) && (await ringNo()).includes('ring 7 of 40'), await ringNo());

  await p.go(`${base}/labs/heptapod.html?species=0&at=evening`);
  p.check('a recorded evening comes up', await ready());
  await p.sleep(500);
  await p.shot('06-evening');
  p.check('the evening opens on the being\'s reading of a mark', (await panelHead()).includes('reading of you'), await panelHead());
  await p.ev('[...document.querySelectorAll("#panel .act")].find((b) => b.textContent === "go on").click()');
  await p.sleep(400);
  p.check('then the six rings', (await panelHead()).includes('ring 1 of 6'), await panelHead());
  await p.ev('document.getElementById("stage").scrollIntoView({ block: "start" })');
  await p.sleep(300);
  await p.shot('07-check');
  // a press within a third of a second of the panel being rebuilt is ignored, so that a double click cannot answer two rings
  await p.ev('document.querySelector("#panel .pp-opt").click(); document.querySelector("#panel .pp-opt").click()');
  await p.sleep(500);
  p.check('a double click answers one ring, not two', (await panelHead()).includes('ring 2 of 6'), await panelHead());
  for (let i = 1; i < 6; i++) { await p.ev('document.querySelector("#panel .pp-opt").click()'); await p.sleep(500); }
  await p.sleep(400);
  p.check('six answers end the day', (await panelHead()).includes('the day is over'), await p.ev('(document.querySelector("#panel .pp-score") || {}).textContent || ""'));
  p.check('the notebook then outlines what each radical is used for', (await p.ev('document.querySelectorAll("#nb .nb-grid i.can").length')) > 0);
  await p.shot('08-done');
}
