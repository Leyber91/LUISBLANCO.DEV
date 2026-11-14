/* ============================================================
   tools/drives/os.mjs — Labs OS on a page, by hand.

   Run by `node tools/drive.mjs tools/drives/os.mjs --base <url>`
   at a desktop and a phone width.

   What it proves about the sharing question, the one thing Labs
   OS puts on every lab page uninvited: on a first visit it is a
   strip at the foot of the window and leaves the page above it
   free; the question and the two answers are in view without a
   press; what is sent is one press away and lists four things;
   answered on one page, it is gone there and is not asked again
   on another.

   The first check is a fault measured on 2026-11-14: as a plate
   that showed all of its text it covered a lab's one control on a
   first visit at 390 px, and linked on The Pod it made 14 of that
   lab's 34 hand-driven checks fail.
   ============================================================ */

export default async function os(p, { base }) {
  const ask = () => p.ev(`(() => {
    const c = document.querySelector('.los-consent');
    if (!c || c.offsetParent === null && getComputedStyle(c).position !== 'fixed') return null;
    const b = c.getBoundingClientRect(), d = c.querySelector('details'), q = c.querySelector('.los-ask');
    const seen = (n) => { const r = n.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 1; };
    return { top: b.top, bottom: b.bottom, h: b.height, vh: window.innerHeight, fixed: getComputedStyle(c).position === 'fixed',
      open: !!(d && d.open), items: d ? d.querySelectorAll('.los-sent li').length : 0, itemsSeen: d ? [...d.querySelectorAll('.los-sent li')].filter(seen).length : 0,
      question: q ? q.textContent : '', questionSeen: !!q && seen(q), answers: [...c.querySelectorAll('.los-choice button')].filter(seen).map((x) => x.textContent) };
  })()`);
  const asked = () => p.ev('!!document.querySelector(".los-consent")');

  await p.go(`${base}/labs/index.html`);
  p.check('on a first visit the hub asks the sharing question', await p.until('!!document.querySelector(".los-consent")', 15000));
  await p.sleep(600);
  const closed = await ask();
  p.check('it is a strip at the foot of the window, no taller than a fifth of it', !!closed && closed.fixed && closed.h <= closed.vh / 5 && closed.bottom <= closed.vh && closed.top >= closed.vh * 0.75, closed ? `${Math.round(closed.h)} px of ${closed.vh}, from ${Math.round(closed.top)}` : 'no question');
  p.check('the question and both answers are in view without a press', !!closed && closed.questionSeen && /^Send usage of the labs to their author\? Nothing is sent before you choose Allow\.$/.test(closed.question) && closed.answers.join('|') === 'Allow|No thanks', closed ? `${closed.question} / ${closed.answers.join(', ')}` : '');
  p.check('what is sent is closed until asked for', !!closed && !closed.open && closed.items === 4 && closed.itemsSeen === 0, closed ? `${closed.items} items, ${closed.itemsSeen} in view` : '');
  await p.shot('01-question-closed');

  // one press: the summary, as a visitor would
  const sum = await p.ev('(() => { const s = document.querySelector(".los-what summary").getBoundingClientRect(); return { x: s.x + 20, y: s.y + s.height / 2 }; })()');
  await p.click(sum.x, sum.y); await p.sleep(300);
  const opened = await ask();
  p.check('one press shows the four things that are sent, with the answers still in view', !!opened && opened.open && opened.itemsSeen === 4 && opened.answers.length === 2 && opened.bottom <= opened.vh, opened ? `${opened.itemsSeen} items in view, ${Math.round(opened.h)} px` : '');
  await p.shot('02-question-opened');

  // "No thanks", pressed where it is
  const no = await p.ev('(() => { const b = [...document.querySelectorAll(".los-choice button")].find((x) => /no thanks/i.test(x.textContent)).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()');
  await p.click(no.x, no.y); await p.sleep(400);
  p.check('answered, it is gone', !(await asked()));
  await p.go(`${base}/labs/exomania.html?still`);
  await p.until('document.body.dataset.state === "ready"', 40000);
  await p.sleep(800);
  p.check('and it is not asked again on another lab', !(await asked()));
}
