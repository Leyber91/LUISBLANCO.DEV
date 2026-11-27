/* ============================================================
   orthogonal/catalog.js: the page of orthogonal-catalog.html.

   Reads worlds.json and parts.json (drafted offline by
   data/orthogonal/catalog/make_parts.py, no model at runtime),
   lists the 42 by domain, and shows the chosen world: driver, job,
   five steps, and its artifact drawn by artifact3d.js. The rules of
   the walk (?w=, previous, next, surprise) are catalog-model.js's.

   Keys: with the drawing focused the arrows turn it; anywhere else
   (not in a field) Left and Right walk the catalogue.
   ============================================================ */
import { el } from '../kit/dom.js';
import { createArtifactView } from './artifact3d.js';
import { groupByDomain, partLine, resolveWorld, step, surprise, validateTree } from './catalog-model.js';

const DATA = 'assets/data/orthogonal/catalog/';
const $ = (id) => document.getElementById(id);
const SWIPE = { dx: 60, dy: 45 };

const load = (name) => fetch(DATA + name).then((r) => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); });

async function main() {
  const status = $('status');
  let worlds, trees;
  try {
    [worlds, trees] = await Promise.all([load('worlds.json').then((j) => j.worlds), load('parts.json').then((j) => j.trees)]);
  } catch (err) {
    status.textContent = 'The catalogue could not be read: ' + err.message;
    return;
  }

  const view = createArtifactView($('stage'), {
    onSelect(i, part) {
      const s = $('art-sel');
      s.textContent = part ? `Selected: ${partLine(part)}` : 'Press a part to name it.';
      s.classList.toggle('on', !!part);
    },
  });

  let current = null, stepIx = 0;

  /* the list: six domains, each a heading over its worlds; a link opens the world without reloading */
  const list = $('list');
  for (const g of groupByDomain(worlds)) {
    const h = el('p', 'dom'); h.append(el('b', null, g.domain), ` (${g.worlds.length})`);
    list.append(h);
    for (const w of g.worlds) {
      const a = el('a'); a.href = `?w=${w.id}`; a.dataset.id = w.id;
      a.append(el('span', 'id', w.id.slice(1)), el('span', 'nm', w.artifact.name));
      list.append(a);
    }
  }
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-id]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go(a.dataset.id, true);
  });

  const chooseStep = (i) => {
    stepIx = i;
    [...$('chain').querySelectorAll('button')].forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    const n = $('needs'); n.replaceChildren(el('b', null, `Step ${i + 1} needs: `), current.steps[i].needs);
  };

  function show(w) {
    current = w;
    const tree = trees[w.id];
    const bad = validateTree(tree);
    $('driver').textContent = w.driver;
    $('job').textContent = w.job;
    $('art-name').textContent = w.artifact.name;
    $('art-fn').textContent = w.artifact.function;
    $('pos').textContent = `World ${worlds.indexOf(w) + 1} of ${worlds.length}`;
    $('stage').setAttribute('aria-label', `${w.artifact.name}, drawn live; arrow keys turn it`);
    $('chain').replaceChildren(...w.steps.map((s, i) => {
      const li = el('li'), b = el('button', null); b.type = 'button';
      b.append(el('span', 'n', `Step ${i + 1}`), s.technology);
      b.addEventListener('click', () => chooseStep(i));
      li.append(b);
      return li;
    }));
    chooseStep(0);
    list.querySelectorAll('a[data-id]').forEach((a) => {
      const on = a.dataset.id === w.id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    const cur = list.querySelector('a[aria-current]');
    if (cur) { const r = cur.getBoundingClientRect(), b = list.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom) cur.scrollIntoView({ block: 'nearest' }); }
    document.title = `${w.artifact.name} · Orthogonal catalogue`;
    if (bad.length) { status.textContent = `The parts list of ${w.id} is not valid: ${bad[0]}`; return; }
    view.setTree(tree);
  }

  function go(id, push) {
    const w = worlds.find((x) => x.id === id) || worlds[0];
    show(w);
    if (push) { const u = new URL(location.href); u.searchParams.set('w', w.id); history.pushState({ w: w.id }, '', u); }
    status.textContent = '';
  }

  const walk = (d) => go(step(worlds, current.id, d), true);
  $('prev').addEventListener('click', () => walk(-1));
  $('next').addEventListener('click', () => walk(1));
  $('surprise').addEventListener('click', () => go(surprise(worlds, current.id, Math.random()), true));
  window.addEventListener('popstate', () => go(resolveWorld(location.search, worlds).world.id, false));

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, #stage')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); walk(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); walk(1); }
  });

  /* a swipe on the text of the world walks the catalogue; the drawing keeps its own drags */
  const pane = $('world');
  let t0 = null;
  pane.addEventListener('touchstart', (e) => { t0 = e.target.closest('#stage') || e.touches.length !== 1 ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  pane.addEventListener('touchend', (e) => {
    if (!t0) return;
    const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
    t0 = null;
    if (Math.abs(dx) >= SWIPE.dx && Math.abs(dy) <= SWIPE.dy) walk(dx < 0 ? 1 : -1);
  }, { passive: true });

  if (window.matchMedia('(max-width: 899px)').matches) $('listwrap').open = false;

  const first = resolveWorld(location.search, worlds);
  go(first.world.id, false);
  if (!first.known) status.textContent = `No world ${new URLSearchParams(location.search).get('w')} in the catalogue; showing the first.`;

  window.__catalog = {
    worlds, view, get id() { return current.id; }, get step() { return stepIx; },
    /* the share of the canvas's pixels that differ from its ground: a blank canvas reads 0 */
    ink() {
      const c = view.canvas;
      if (!c) return null;
      const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
      const g = t.getContext('2d'); g.drawImage(c, 0, 0);
      const d = g.getImageData(0, 0, t.width, t.height).data, n = d.length / 4;
      let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 6) + Math.abs(d[i + 1] - 8) + Math.abs(d[i + 2] - 13) > 24) lit++;
      return { lit: lit / n, px: n };
    },
  };
  document.body.classList.add('ready');
}

main();
