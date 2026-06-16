/* ============================================================
   altverse/render/dossier.js — the credibility surface.
   The premise, the binding axioms, the first-order effect cascade,
   the CONTRAST read (ours -> theirs with the causal id-path), the
   fact index, and the HONEST consistency ledger (structural checks
   + the edges-audited note — never a fabricated "PASS").
   ============================================================ */

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const LADDER_CLASS = { ESTABLISHED: 'ok', THEORETICAL: 'horizon', SPECULATIVE: 'warm-dim', SF: 'warm' };
const tag = (l) => `<span class="av-tag ${LADDER_CLASS[l] || ''}">${l}</span>`;

export function renderDossier(world, mount) {
  mount.innerHTML = '';
  const wrap = el('div', 'av-dossier');

  // premise (guard: a skipped-into live world may not have it yet)
  if (world.premise) {
    const prem = el('section', 'av-card');
    prem.appendChild(el('h3', 'av-h', 'Premise'));
    prem.appendChild(el('p', 'av-lead', world.premise.text));
    prem.appendChild(el('p', 'av-mech', `Mechanism: ${world.premise.firstMechanism} ${tag(world.premise.ladder)}`));
    wrap.appendChild(prem);
  }

  // axioms
  const ax = el('section', 'av-card');
  ax.appendChild(el('h3', 'av-h', 'Binding axioms'));
  const axl = el('ul', 'av-axioms');
  world.axioms.forEach((a) => axl.appendChild(el('li', null, a)));
  ax.appendChild(axl);
  wrap.appendChild(ax);

  // first-order cascade
  const fx = el('section', 'av-card');
  fx.appendChild(el('h3', 'av-h', 'First-order consequences'));
  world.effects.firstOrder.forEach((e) => {
    const row = el('div', 'av-fx');
    row.appendChild(el('span', 'av-id', e.id));
    const body = el('div', 'av-fx-body');
    body.appendChild(el('p', 'av-fx-text', e.text));
    body.appendChild(el('p', 'av-fx-mech', `${e.mechanism} ${tag(e.ladder)}`));
    row.appendChild(body);
    fx.appendChild(row);
  });
  wrap.appendChild(fx);

  // contrast read (the proof)
  const ct = el('section', 'av-card av-contrast');
  ct.appendChild(el('h3', 'av-h', 'How it differs — and why'));
  world.contrast.forEach((c) => {
    const row = el('div', 'av-con');
    row.appendChild(el('div', 'av-con-ours', `<span class="lbl">Our reality</span>${c.ours}`));
    row.appendChild(el('div', 'av-con-theirs', `<span class="lbl">${world.name || 'This world'}</span>${c.theirs}`));
    row.appendChild(el('div', 'av-con-path', `causal path: ${c.path.map((p) => `<code>${p}</code>`).join(' → ')} ${tag(c.ladder)}`));
    ct.appendChild(row);
  });
  wrap.appendChild(ct);

  // civilizations (peoples)
  if ((world.civs || []).length) {
    const regionName = (rid) => (world.map.regions.find((r) => r.id === rid) || {}).name || rid;
    const cv = el('section', 'av-card');
    cv.appendChild(el('h3', 'av-h', 'Peoples'));
    world.civs.forEach((c) => {
      const row = el('div', 'av-civ');
      const rf = [c.rises ? `rises ${c.rises}` : '', c.falls ? `falls ${c.falls}` : ''].filter(Boolean).join(' · ');
      row.appendChild(el('div', 'av-civ-head',
        `<span class="nm">${c.name}</span><span class="rg">${regionName(c.regionId)}</span>`));
      if ((c.traits || []).length) row.appendChild(el('div', 'av-civ-traits', c.traits.join(' · ')));
      if (rf) row.appendChild(el('div', 'av-civ-rf', rf));
      cv.appendChild(row);
    });
    wrap.appendChild(cv);
  }

  // fact index chips
  const factNames = Object.keys(world.factIndex || {});
  if (factNames.length) {
    const fi = el('section', 'av-card');
    fi.appendChild(el('h3', 'av-h', 'Fact index'));
    const chips = el('div', 'av-chips');
    factNames.forEach((n) => {
      const f = world.factIndex[n];
      chips.appendChild(el('span', 'av-chip', `${n}: <b>${f.fact}</b>${f.mag ? ` (${f.mag})` : ''} ${tag(f.ladder)}`));
    });
    fi.appendChild(chips);
    wrap.appendChild(fi);
  }

  // consistency ledger (honest)
  const c = world.consistency;
  if (c) {
    const led = el('section', 'av-card av-ledger');
    led.appendChild(el('h3', 'av-h', 'Consistency ledger'));
    led.appendChild(el('p', 'av-ledger-top',
      `<b>${c.structuralPassed}/${c.structuralTotal}</b> structural checks passed · ` +
      `<b>${c.flagged}</b> flagged · edges audited: <b>${c.edgesAudited}</b>` +
      (c.note ? `<br><span class="av-note">${c.note}</span>` : '')));
    const rows = el('div', 'av-checks');
    c.checks.forEach((ck) => {
      rows.appendChild(el('div', `av-check ${ck.status}`,
        `<span class="st">${ck.status === 'pass' ? 'PASS' : 'FLAG'}</span>` +
        `<span class="rl">${ck.rule}</span><span class="nt">${ck.note || ''}</span>`));
    });
    led.appendChild(rows);
    wrap.appendChild(led);
  }

  mount.appendChild(wrap);
}
