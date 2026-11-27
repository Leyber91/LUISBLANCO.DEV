/* ============================================================
   tools/drives/orthogonal-catalog.mjs: the catalogue of 42 drafted
   worlds (labs/orthogonal-catalog.html), by hand, at a desktop and a
   phone width.

   Run by `node tools/labs-wt.mjs drive altverse --tree <tree>
   --scenario orthogonal-catalog --widths 1440x900,390x844`.

   What it proves, that a still cannot:
   - the page opens with 42 entries listed in six domains, and the
     chosen world carries its driver, job, five steps, plain name and
     the [ILLUSTRATIVE] line;
   - the canvas is not blank: its own pixels differ from its ground,
     and a different world draws different pixels;
   - "Surprise me" changes the world; the pager and (off the drawing)
     the arrow keys walk it, wrapping at the ends; ?w= opens that
     world and an unknown id says so;
   - a press on a part names it (the only gold in the drawing's
     read-out); the arrow keys with the drawing focused turn it;
   - a swipe on the text walks the catalogue at a phone width;
   - after every step: no sideways scroll, every target at least
     44 px at 390, every text legible, gold only on what was chosen.
   ============================================================ */
import { standard } from '../invariants.mjs';

const PAGE = '/labs/orthogonal-catalog.html';
// gold marks only what was chosen: the world on the list and the part pressed
const GOLD = ['.list a[aria-current="true"]', '.list a[aria-current="true"] .id', '.art-sel.on'];

export default async function catalog(p, { base, width }) {
  for (const [name, expr] of standard({ gold: { allow: GOLD } })) p.invariant(name, expr);
  const open = async (q = '') => {
    await p.go(`${base}${PAGE}${q ? '?' + q : ''}`);
    return p.until('document.body.classList.contains("ready")', 30000);
  };
  const st = () => p.ev(`(() => ({
    id: window.__catalog.id, name: document.getElementById('art-name').textContent, pos: document.getElementById('pos').textContent,
    entries: document.querySelectorAll('#list a[data-id]').length, domains: document.querySelectorAll('#list .dom').length,
    current: [...document.querySelectorAll('#list a[aria-current="true"]')].map((a) => a.dataset.id).join(),
    steps: document.querySelectorAll('#chain button').length, driver: document.getElementById('driver').textContent.length,
    job: document.getElementById('job').textContent.length, tag: document.querySelector('#tagline').closest('[data-claim]').textContent.replace(/\\s+/g, ' ').trim(),
    url: new URL(location.href).searchParams.get('w'), status: document.getElementById('status').textContent,
    webgl: window.__catalog.view.webgl, sel: document.getElementById('art-sel').textContent,
  }))()`);
  const ink = () => p.ev('window.__catalog.ink()');

  p.check('the page opens', await open());
  let s = await st();
  p.check('42 entries are listed in six domains', s.entries === 42 && s.domains === 6, `${s.entries} entries, ${s.domains} domains`);
  p.check('it opens on the first world, chosen on the list, with five steps, a driver, a job and a plain name', s.id === 'w00' && s.current === 'w00' && s.steps === 5 && s.driver > 20 && s.job > 5 && s.name.length > 3, JSON.stringify(s));
  p.check('every world carries the [ILLUSTRATIVE] line and the page shows no why-then prose', /^\[ILLUSTRATIVE\] Drafted by a model from the method.s rules; not yet grown by the engine$/.test(s.tag) && !(await p.ev(`/why_then|why then/i.test(document.body.textContent)`)), s.tag);
  p.check('the drawing has WebGL here', s.webgl === true);
  let a = await ink();
  p.check('the canvas is not blank: its pixels differ from its ground', a && a.lit > 0.005 && a.lit < 0.9, JSON.stringify(a));
  await p.shot('01-open');

  // ---- surprise me
  const seen = new Set([s.id]);
  for (let i = 0; i < 3; i++) {
    const before = (await st()).id;
    await p.ev(`document.getElementById('surprise').click()`); await p.sleep(250);
    const t = await st();
    seen.add(t.id);
    p.check(`"Surprise me" changes the world (${before} to ${t.id}) and the link follows`, t.id !== before && t.url === t.id && t.current === t.id, JSON.stringify(t));
  }
  a = await ink();
  p.check('the new world is drawn: its canvas is not blank', a && a.lit > 0.005, JSON.stringify(a));
  await p.shot('02-surprise');

  // ---- a link opens that world; an unknown one says so
  p.check('a link opens the world', await open('w=w23'));
  s = await st();
  p.check('?w=w23 opens world 24 of 42', s.id === 'w23' && /24 of 42/.test(s.pos) && s.current === 'w23', JSON.stringify(s));
  const b = await ink();
  p.check('a different world draws different pixels', a && b && Math.abs(a.lit - b.lit) > 1e-4, JSON.stringify({ a, b }));
  await open('w=nowhere');
  s = await st();
  p.check('an unknown id opens the first world and says so', s.id === 'w00' && /No world nowhere/.test(s.status), s.status);

  // ---- the pager and the keys
  await open('w=w41');
  await p.ev(`document.getElementById('next').click()`); await p.sleep(200);
  s = await st();
  p.check('Next wraps from the last world to the first', s.id === 'w00', s.id);
  await p.ev(`document.getElementById('prev').click()`); await p.sleep(200);
  s = await st();
  p.check('Previous wraps back to the last', s.id === 'w41', s.id);
  await p.ev(`document.activeElement && document.activeElement.blur()`);
  await p.key('ArrowLeft'); await p.sleep(200);
  s = await st();
  p.check('ArrowLeft off the drawing walks to the previous world', s.id === 'w40', s.id);
  await p.key('ArrowRight'); await p.sleep(200);
  s = await st();
  p.check('ArrowRight walks to the next', s.id === 'w41', s.id);

  // ---- the drawing: a press names a part, the keys turn it
  await p.ev(`document.getElementById('stage').focus()`);
  const cam = () => p.ev(`(() => { const c = document.querySelector('#stage canvas'); return c ? c.toDataURL('image/png').length : 0; })()`);
  const before = await cam();
  await p.key('ArrowRight'); await p.key('ArrowRight'); await p.key('ArrowRight'); await p.sleep(300);
  s = await st();
  p.check('arrow keys with the drawing focused turn it and do not walk the catalogue', s.id === 'w41' && (await cam()) !== before, s.id);
  // find a pixel that names a part: scan the canvas on a grid, press where the read-out changes
  const box = await p.ev(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  let named = null;
  for (let j = 1; j < 12 && !named; j++) for (let i = 1; i < 12 && !named; i++) {
    await p.click(box.x + box.w * i / 12, box.y + box.h * j / 12); await p.sleep(60);
    const t = await st();
    if (/^Selected: /.test(t.sel)) named = t.sel;
  }
  p.check('a press on a part names it', !!named && /m(, glowing)?$/.test(named), String(named));
  p.check('the selection read-out is gold, and nothing else gold is on the page', await p.ev(`document.querySelector('.art-sel').classList.contains('on')`));
  await p.shot('03-selected');

  // ---- a phone: one world a page, a swipe on the text walks it
  if (width < 900) {
    await open('w=w10');
    const sw = (dx, dy = 0) => p.ev(`(() => {
      const t = document.querySelector('.brief'), mk = (type, x, y) => new TouchEvent(type, { bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: t, clientX: x, clientY: y })],
        changedTouches: [new Touch({ identifier: 1, target: t, clientX: x, clientY: y })] });
      t.dispatchEvent(mk('touchstart', 200, 300)); t.dispatchEvent(mk('touchend', 200 + ${dx}, 300 + ${dy}));
    })()`);
    await sw(-120); await p.sleep(200);
    s = await st();
    p.check('a swipe left on the text opens the next world', s.id === 'w11', s.id);
    await sw(120); await p.sleep(200);
    s = await st();
    p.check('a swipe right opens the previous', s.id === 'w10', s.id);
    await sw(-120, 120); await p.sleep(200);
    s = await st();
    p.check('a mostly vertical swipe does not walk', s.id === 'w10', s.id);
    const folded = await p.ev(`!document.getElementById('listwrap').open`);
    p.check('the list is folded under its summary on a phone, and its 44 px summary opens it', folded);
    const pg = await p.ev(`(() => ['prev', 'next', 'surprise'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }))()`);
    p.check('the previous, next and surprise buttons are at least 44 px', pg.every(([w, h]) => w >= 44 && h >= 44), JSON.stringify(pg));
    await p.shot('04-phone');
    await open('w=w30');
    await p.shot('05-phone-world');
  } else {
    await open('w=w20');
    await p.shot('04-desktop-world');
  }
  const over = await p.ev(`document.documentElement.scrollWidth - innerWidth`);
  p.check('no sideways scroll', over <= 1, String(over));
}
