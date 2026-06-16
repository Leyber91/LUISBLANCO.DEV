/* ============================================================
   narrative.js — the AI field report at the bottom of the HUD.

   Reuses the project's AIProvider (ollama -> worker -> echo).
   When a model is reachable it writes immersive prose from the
   planet's real numbers; offline, the echo path types out a
   deterministic, science-grounded description built from the same
   physics that drives the render — so it is always meaningful.
   ============================================================ */

import { AIProvider } from '../ai/provider.js';
import { classify, derived, physics } from './data.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const f0 = (v) => Math.round(v).toLocaleString();

function spectral(teff) {
  if (teff >= 30000) return ['O', 'blue'];
  if (teff >= 10000) return ['B', 'blue-white'];
  if (teff >= 7500) return ['A', 'white'];
  if (teff >= 6000) return ['F', 'yellow-white'];
  if (teff >= 5200) return ['G', 'yellow'];
  if (teff >= 3700) return ['K', 'orange'];
  return ['M', 'deep-red'];
}
function sunSize(deg) {
  const sun = 0.53;
  const x = deg / sun;
  if (x > 9) return 'a vast wall of fire filling much of the sky';
  if (x > 4) return 'an enormous disc, several times the size of our Sun';
  if (x > 1.6) return 'noticeably larger than our Sun looks from Earth';
  if (x > 0.6) return 'about the size our Sun appears from Earth';
  return 'a brilliant, hard point of light';
}
function surfaceWords(c) {
  const { klass, state } = c;
  if (klass >= 4) return c.physics.Teq > 1200 ? 'glowing banded cloud decks seething with heat' : 'broad banded cloud belts over a deep hydrogen sky';
  if (klass === 3) return 'a smooth methane-blue cloud deck';
  if (klass === 2) return 'a thick, featureless haze layer — no solid ground in view';
  if (state === 'lava') return 'a fractured black crust webbed with rivers of glowing magma';
  if (state === 'partial') return 'a dim red surface where rock is just beginning to melt';
  if (state === 'ice') return 'an unbroken shell of ice and frozen rock';
  if (klass === 1 && c.physics.Teq < 420) return 'deep global oceans broken by scattered land and cloud';
  return 'a rocky, weathered surface with thin seas and drifting cloud';
}
function atmoWords(c) {
  const a = c.atmDensity;
  if (c.klass >= 2) return 'It is wrapped in an enormous hydrogen-helium envelope';
  if (a > 0.6) return 'It holds a substantial atmosphere';
  if (a > 0.2) return 'A thin atmosphere clings to it';
  return 'It is all but airless, stripped by its star';
}

function buildSentences(p) {
  const c = classify(p);
  const d = derived(p);
  const ph = physics(p);
  const [type, color] = spectral(ph.Teff);
  const s = [];
  const dist = p.sy_dist ? `${f0(d.lightyears)} light-years away` : 'at an unmeasured distance';
  s.push(`${p.pl_name} is a ${c.label.toLowerCase()} orbiting ${p.hostname}, a ${color} ${type}-type star ${dist}.`);
  s.push(`That sun burns near ${f0(ph.Teff)} kelvin and hangs in the sky as ${sunSize(d.starAngleDeg)}.`);
  const cel = Math.round(ph.Tsurf - 273.15);
  s.push(`The surface settles around ${f0(ph.Tsurf)} K (${cel > 0 ? '+' : ''}${cel} C) — ${surfaceWords(c)}.`);
  s.push(`${atmoWords(c)}${d.gravity ? `, under about ${d.gravity.toFixed(2)} g of gravity` : ''}.`);
  if (c.habitable) s.push(`It falls inside the star's habitable zone, where liquid water could persist — a candidate for life.`);
  else if (c.klass <= 1 && ph.Teq > 1000) s.push(`Far too hot for water; this is a scorched, sterile world.`);
  return { sentences: s, facts: factLine(p, c, d, ph, type) };
}

function factLine(p, c, d, ph, type) {
  return [
    `name=${p.pl_name}`, `host=${p.hostname} (${type}-type, ${f0(ph.Teff)}K)`,
    p.sy_dist ? `distance=${f0(d.lightyears)} ly` : null,
    `class=${c.label}`,
    `radius=${p.pl_rade?.toFixed(2)} Earth radii${ph.estMass ? '' : `, mass=${p.pl_masse?.toFixed(1)} Earth masses`}`,
    d.gravity ? `gravity=${d.gravity.toFixed(2)} g` : null,
    `equilibrium temp=${f0(ph.Teq)}K, est. surface=${f0(ph.Tsurf)}K`,
    p.pl_orbper ? `orbital period=${p.pl_orbper.toFixed(1)} days` : null,
    `atmosphere=${ph.atmDensity > 0.6 ? 'substantial' : ph.atmDensity > 0.2 ? 'thin' : 'negligible'}`,
    `apparent size of its sun in the sky=${d.starAngleDeg.toFixed(2)} deg (Sun from Earth=0.53)`,
    c.habitable ? 'in the habitable zone' : null,
  ].filter(Boolean).join('; ');
}

export function buildNarrator(host) {
  const panel = el('div', 'hud-panel report-panel');
  panel.appendChild(el('div', 'hud-head', `<span>Field Report</span><span class="rep-mode" id="rep-mode">…</span>`));
  const body = el('div', 'report-body');
  panel.appendChild(body);
  host.appendChild(panel);
  const modeEl = panel.querySelector('#rep-mode');

  const ai = new AIProvider();
  let ready = ai.detect().then((m) => { modeEl.textContent = m === 'echo' ? 'offline' : m; return m; });
  let ctrl = null;

  return {
    async describe(p) {
      if (ctrl) ctrl.abort();
      ctrl = new AbortController();
      const { sentences, facts } = buildSentences(p);
      body.textContent = '';
      await ready;
      ai.chat({
        signal: ctrl.signal,
        messages: [
          { role: 'system', content: 'You are a planetary scientist narrating the view from a starship window. Given a planet\'s real measured data, write 3 vivid, scientifically accurate sentences about what this world is and what it would be like to see. No preamble, no lists, no markdown.' },
          { role: 'user', content: facts },
        ],
        echo: { speech: [sentences.join(' ')], thought: [] },
        onToken: (t) => { body.textContent += t; },
        onDone: () => {},
      }).catch(() => { body.textContent = sentences.join(' '); });
    },
  };
}
