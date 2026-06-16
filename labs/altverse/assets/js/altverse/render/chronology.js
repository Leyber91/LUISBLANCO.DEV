/* ============================================================
   altverse/render/chronology.js — Phase 1 timeline.
   Eras as bands, turning-point events beneath each, on a drawn
   spine. (Phase 2 adds SVG era bands + on-demand causal arcs.)
   ============================================================ */

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };

function fmtYear(y) {
  const a = Math.abs(y);
  const trim = (x) => x.toFixed(1).replace(/\.0$/, '');
  let s;
  if (a >= 1e9) s = trim(a / 1e9) + ' Gyr';
  else if (a >= 1e6) s = trim(a / 1e6) + ' Myr';
  else if (a >= 1e3) s = trim(a / 1e3) + ' kyr';
  else s = String(a);
  return y < 0 ? s + ' ago' : 'yr ' + s;
}

const LADDER_CLASS = { ESTABLISHED: 'ok', THEORETICAL: 'horizon', SPECULATIVE: 'warm-dim', SF: 'warm' };

export function renderChronology(world, mount) {
  mount.innerHTML = '';
  const wrap = el('div', 'av-chrono');
  wrap.appendChild(el('div', 'av-chrono-spine'));

  world.chronology.eras.forEach((era) => {
    const events = world.chronology.events.filter((e) => e.eraId === era.id);
    const block = el('div', 'av-era');
    block.appendChild(el('div', 'av-era-head',
      `<span class="dot"></span><span class="name">${era.name}</span>` +
      `<span class="span">${fmtYear(era.start)} — ${fmtYear(era.end)}</span>`));
    const list = el('div', 'av-era-events');
    events.forEach((ev) => {
      const row = el('div', 'av-event');
      row.appendChild(el('span', 'av-event-year', fmtYear(ev.year)));
      row.appendChild(el('span', 'av-event-title', ev.title));
      row.appendChild(el('span', `av-tag ${LADDER_CLASS[ev.ladder] || ''}`, ev.ladder));
      row.appendChild(el('span', 'av-event-cause', `← ${ev.cause}`));
      list.appendChild(row);
    });
    if (!events.length) list.appendChild(el('div', 'av-empty', 'no recorded turning points'));
    block.appendChild(list);
    wrap.appendChild(block);
  });

  mount.appendChild(wrap);
}
