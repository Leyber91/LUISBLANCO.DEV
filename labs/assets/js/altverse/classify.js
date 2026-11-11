/* ============================================================
   altverse/classify.js — reads any typed divergence.
   Text in, a divergence spec out: which rule families it touches,
   the knob deltas with their magnitudes, the date it takes hold,
   and what in the text matched. No model is needed for this; a
   model pass later writes prose on top of what this decides.
   ============================================================ */

import { NUMBER_WORDS, DOWN_WORDS, UP_WORDS, NEGATION, TECH, EVENTS, DOMAINS } from './lexicon.js';
import { EARTH } from './config.js';

const num = (s) => Number(String(s).replace(/,/g, ''));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const WORDNUM = Object.keys(NUMBER_WORDS).join('|');

/* A factor relative to ours, from phrases like "30% stronger",
   "ten times slower", "1.5x", "twice", "half". null when none. */
export function readFactor(t) {
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(\w+)?/i);
  if (m) {
    const p = num(m[1]) / 100;
    const word = m[2] || '';
    if (DOWN_WORDS.test(word) || (!UP_WORDS.test(word) && DOWN_WORDS.test(t))) return { f: clamp(1 - p, 0.01, 100), how: m[0] };
    return { f: 1 + p, how: m[0] };
  }
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?|${WORDNUM})\\s*(?:times|x|×)\\s*(\\w+)?`, 'i'));
  if (m) {
    const n = /\d/.test(m[1]) ? num(m[1]) : NUMBER_WORDS[m[1].toLowerCase()];
    const word = m[2] || '';
    const down = DOWN_WORDS.test(word) || (/as (slow|weak|dim|small)/i.test(t));
    return { f: down ? 1 / n : n, how: m[0] };
  }
  m = t.match(/(?:x|×)\s*(\d+(?:\.\d+)?)/i);
  if (m) return { f: num(m[1]), how: m[0] };
  m = t.match(/\b(half|halved|halves|a third|a quarter|twice|doubles?|doubled|thrice|triples?|tripled)\b/i);
  if (m) {
    const w = m[1].toLowerCase().replace(/^a /, '');
    const f = NUMBER_WORDS[w] ?? NUMBER_WORDS[w.replace(/(d|s)$/, '')] ?? (/^halve/.test(w) ? 0.5 : 1);
    return { f, how: m[0] };
  }
  return null;
}

/* A calendar year from "600 CE", "300 BC", "66 million years ago",
   "in 1200", "the 9th century". null when none. */
export function readYear(t) {
  let m = t.match(/(\d+(?:\.\d+)?)\s*(million|billion|thousand)\s*years?\s*ago/i);
  if (m) { const mult = { thousand: 1e3, million: 1e6, billion: 1e9 }[m[2].toLowerCase()]; return { y: Math.round(2000 - num(m[1]) * mult), how: m[0] }; }
  m = t.match(/(\d[\d,]*)\s*years?\s*ago/i);
  if (m) return { y: 2000 - num(m[1]), how: m[0] };
  m = t.match(/(\d[\d,]*)\s*(bce|b\.c\.e?\.?|bc)\b/i);
  if (m) return { y: -num(m[1]), how: m[0] };
  m = t.match(/(\d[\d,]*)\s*(ce|c\.e\.|ad|a\.d\.)(?![a-z])/i) || t.match(/\bad\s*(\d{1,4})\b/i);
  if (m) return { y: num(m[1]), how: m[0] };
  m = t.match(/(\d{1,2})(?:st|nd|rd|th)\s*century\s*(bce|bc)?/i);
  if (m) { const c = num(m[1]); return { y: m[2] ? -(c * 100 - 50) : (c - 1) * 100 + 50, how: m[0] }; }
  m = t.match(/\b(?:in|by|around|from|after|since)\s+(\d{3,4})\b/i) || t.match(/\b(1\d{3}|20\d{2})\b/);
  if (m) return { y: num(m[1]), how: m[0] };
  return null;
}

/* "300 years earlier", "two centuries late", "a millennium sooner" */
function readLead(t) {
  const m = t.match(new RegExp(`(\\d[\\d,]*|${WORDNUM}|a)\\s*(years?|centur(?:y|ies)|millenni(?:um|a))\\s*(earlier|early|sooner|ahead|later|late|behind)`, 'i'));
  if (!m) return null;
  const n = m[1].toLowerCase() === 'a' ? 1 : (/\d/.test(m[1]) ? num(m[1]) : NUMBER_WORDS[m[1].toLowerCase()]);
  const unit = /centur/i.test(m[2]) ? 100 : /millenni/i.test(m[2]) ? 1000 : 1;
  const sign = /earl|soon|ahead/i.test(m[3]) ? -1 : 1;
  return { lead: sign * n * unit, how: m[0] };
}

const fmt = (x, d = 2) => Number(x).toFixed(d).replace(/\.?0+$/, '');

/* Each family: test, then read. read returns { knobs, label, year, matched, confidence, notes } */
const FAMILIES = [
  {
    id: 'alpha', scope: 'constant',
    test: (t) => /speed of light|light[- ]speed|\blight\b[^.]{0,40}\b(slow|fast|travels|moves)|\bc\s*(=|is)\s*\d|fine[- ]structure|\balpha\b|electromagnet/i.test(t),
    read(t) {
      let m = t.match(/(\d[\d,\.]*)\s*(?:km\/s|km per second|kilometres per second|kilometers per second)/i);
      if (/fine[- ]structure|\balpha\b|electromagnet/i.test(t) && !/light/i.test(t)) {
        let a = null;
        const inv = t.match(/1\s*\/\s*(\d+(?:\.\d+)?)/);
        if (inv) a = EARTH.alphaInv / num(inv[1]);
        const f = readFactor(t);
        if (!a && f) a = /electromagnet/i.test(t) && /weak/i.test(t) && f.f > 1 ? 1 / f.f : f.f;
        if (!a) a = /weak/i.test(t) ? 0.5 : 2;
        return { knobs: { alphaFactor: clamp(a, 0.01, 100) }, label: `fine-structure constant x ${fmt(a)}`,
          matched: [inv ? inv[0] : (f ? f.how : 'default x2')], confidence: inv || f ? 0.9 : 0.6 };
      }
      let cf = null, how = '';
      if (m) { cf = num(m[1]) / EARTH.cKms; how = m[0]; }
      else { const f = readFactor(t); if (f) { cf = f.f; how = f.how; } }
      if (!cf) { cf = /slow/i.test(t) ? 0.1 : 10; how = 'default'; }
      cf = clamp(cf, 1e-4, 1e4);
      return {
        knobs: { cFactor: cf, alphaFactor: 1 / cf },
        label: `speed of light x ${fmt(cf, 3)}, so alpha x ${fmt(1 / cf, 3)}`,
        matched: [how], confidence: how === 'default' ? 0.6 : 0.95,
        notes: ['Only dimensionless numbers are physical (Duff, Okun and Veneziano 2002). With charge and Planck\'s constant held fixed, a change in c is a change in the fine-structure constant, alpha = e^2/(4 pi eps0 hbar c). The engine follows alpha.'],
      };
    },
  },
  {
    id: 'ice', scope: 'planet',
    test: (t) => /\bice\b[^.]{0,40}\b(sink|sinks|sank|denser|heavier|does not float|doesn't float|never floats)|water[^.]{0,30}(density|anomal)|(no|without)[^.]{0,20}density (anomaly|maximum)/i.test(t),
    read(t) {
      const f = t.match(/(\d+(?:\.\d+)?)\s*%\s*denser/i);
      const d = f ? 1 + num(f[1]) / 100 : 1.09;
      return { knobs: { iceDensity: d }, label: `ice density ${fmt(d)} g/cm3 (ours 0.917): ice sinks`,
        matched: [f ? f[0] : 'ice sinks'], confidence: 0.95 };
    },
  },
  {
    id: 'gravity', scope: 'planet',
    test: (t) => /gravity|gravitational|\bg\s*(=|is)\s*\d|\d\s*g\b|m\/s2|m\/s²|times (its|the|earth'?s) mass|heavier (world|planet|earth)|weigh(s|t)? (more|less)/i.test(t),
    read(t) {
      let g = null, how = '';
      let m = t.match(/(\d+(?:\.\d+)?)\s*m\s*\/?\s*s(?:\^?2|²|-2)?/i);
      if (m && num(m[1]) > 0.5) { g = num(m[1]) / EARTH.g; how = m[0]; }
      if (!g) { m = t.match(/(\d+(?:\.\d+)?)\s*g\b/i); if (m && !/\d\s*g\/c/i.test(t)) { g = num(m[1]); how = m[0]; } }
      if (!g) { m = t.match(/(\d+(?:\.\d+)?)\s*(?:times|x)?\s*(?:its|the|earth'?s)?\s*mass/i); if (m) { g = num(m[1]); how = m[0]; } }
      if (!g) { const f = readFactor(t); if (f) { g = f.f; how = f.how; } }
      if (!g) { g = /weak|less|lower|light/i.test(t) ? 0.7 : 1.3; how = 'default'; }
      g = clamp(g, 0.1, 5);
      return { knobs: { gFactor: g }, label: `surface gravity x ${fmt(g)} (${fmt(EARTH.g * g)} m/s2)`,
        matched: [how], confidence: how === 'default' ? 0.6 : 0.95,
        notes: ['The engine keeps Earth\'s radius and scales its mass, so g, escape velocity and mean density move together.'] };
    },
  },
  {
    id: 'moon', scope: 'planet',
    test: (t) => /\bmoons?\b|\blunar\b/i.test(t),
    read(t) {
      if (/(no|without|never|lost|lose|loses|missing)[^.]{0,25}\bmoon|moonless|moon (never|does not|doesn't) (form|exist)/i.test(t)) {
        return { knobs: { moon: 0, dayHours: 10 }, label: 'no Moon', matched: ['no moon'], confidence: 0.95,
          notes: ['Without lunar tidal braking the day would be shorter than ours. How much is uncertain; the engine assumes 10 hours.'] };
      }
      if (/two moons/i.test(t)) return { knobs: { moon: 2 }, label: 'two Moons (tidal force x 2)', matched: ['two moons'], confidence: 0.8 };
      const close = t.match(/(closer|nearer|as close|as near|farther|further|as far)/i);
      const f = readFactor(t);
      if (close) {
        const k = f ? f.f : 2;
        const dist = /close|near/i.test(close[1]) ? 1 / Math.max(k, 1.01) : Math.max(k, 1.01);
        return { knobs: { moonDist: clamp(dist, 0.3, 3) }, label: `Moon at ${fmt(dist)} of its distance`, matched: [close[0]], confidence: 0.85 };
      }
      const k = f ? f.f : (/small|light/i.test(t) ? 0.5 : 2);
      return { knobs: { moon: clamp(k, 0, 8) }, label: `Moon mass x ${fmt(k)}`, matched: [f ? f.how : 'default'], confidence: f ? 0.85 : 0.6 };
    },
  },
  {
    id: 'tilt', scope: 'planet',
    test: (t) => /\btilt|obliquity|\baxis\b|on its side|upright/i.test(t),
    read(t) {
      let d = null, how = '';
      const m = t.match(/(\d+(?:\.\d+)?)\s*(?:°|degrees?|deg)\b/i);
      if (m) { d = num(m[1]); how = m[0]; }
      else if (/(no|zero)[^.]{0,12}(tilt|obliquity)|upright|untilted/i.test(t)) { d = 0; how = 'no tilt'; }
      else if (/on its side/i.test(t)) { d = 90; how = 'on its side'; }
      else { const f = readFactor(t); d = f ? EARTH.tiltDeg * f.f : 45; how = f ? f.how : 'default'; }
      d = clamp(d, 0, 90);
      return { knobs: { tiltDeg: d }, label: `axial tilt ${fmt(d, 1)} degrees (ours 23.4)`, matched: [how], confidence: how === 'default' ? 0.6 : 0.95 };
    },
  },
  {
    id: 'day', scope: 'planet',
    test: (t) => /\bdays?\b[^.]{0,40}(hours?|long|short|last)|\b(rotat|spins?)\b|hour[- ]day/i.test(t) && !/\bmoon/i.test(t),
    read(t) {
      let h = null, how = '';
      const m = t.match(/(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|h)\b/i);
      if (m) { h = num(m[1]); how = m[0]; }
      else if (/\ba week\b/i.test(t)) { h = 168; how = 'a week'; }
      else { const f = readFactor(t); if (f) { h = 24 * (/(faster|quicker)/i.test(t) ? 1 / f.f : f.f); how = f.how; } }
      if (!h) { h = /short|fast/i.test(t) ? 12 : 48; how = 'default'; }
      h = clamp(h, 2, 2000);
      return { knobs: { dayHours: h }, label: `day length ${fmt(h, 1)} hours`, matched: [how], confidence: how === 'default' ? 0.6 : 0.95 };
    },
  },
  {
    id: 'sun', scope: 'star',
    test: (t) => /\b(sun|solar|sunlight|star)\b[^.]{0,40}(bright|dim|faint|hot|cool|luminos|%|times|weaker|stronger)|(bright|dim|faint)(er)? sun/i.test(t),
    read(t) {
      const f = readFactor(t);
      let s = f ? f.f : (/dim|faint|cool|weak/i.test(t) ? 0.95 : 1.05);
      if (f && /dim|faint|cool|weak/i.test(t) && s > 1) s = 1 / s;
      s = clamp(s, 0.3, 3);
      return { knobs: { solar: s }, label: `sunlight x ${fmt(s, 3)} (${Math.round(EARTH.solarWm2 * s)} W/m2)`, matched: [f ? f.how : 'default'], confidence: f ? 0.95 : 0.6 };
    },
  },
  {
    id: 'sea', scope: 'surface',
    test: (t) => /sea[- ]level|ice caps?|water world|ocean planet|\bno (land|oceans?)\b|oceans? (cover|covers)|\d+\s*%\s*(of the surface\s*)?(is\s*)?(ocean|water)|(ocean|water)\s*(fraction|coverage)/i.test(t),
    read(t) {
      let m = t.match(/(\d+(?:\.\d+)?)\s*(?:m|metres|meters)\b[^.]{0,12}(higher|lower|up|down)/i);
      if (m) { const dz = num(m[1]) * (/lower|down/i.test(m[2]) ? -1 : 1); return { knobs: { seaLevelM: clamp(dz, -3000, 3000) }, label: `sea level ${dz > 0 ? '+' : ''}${dz} m`, matched: [m[0]], confidence: 0.95 }; }
      m = t.match(/(\d+(?:\.\d+)?)\s*%/);
      if (m && /ocean|water/i.test(t)) { const f = clamp(num(m[1]) / 100, 0, 1); return { knobs: { oceanFrac: f }, label: `ocean covers ${Math.round(f * 100)}% (ours 71%)`, matched: [m[0]], confidence: 0.9 }; }
      if (/no oceans?|dry planet|desert planet/i.test(t)) return { knobs: { oceanFrac: 0.0 }, label: 'no oceans', matched: ['no oceans'], confidence: 0.85 };
      if (/water world|ocean planet|no land/i.test(t)) return { knobs: { oceanFrac: 0.98 }, label: 'ocean covers 98%', matched: ['water world'], confidence: 0.85 };
      if (/ice caps?[^.]{0,20}(melt|gone|never)|no ice caps?/i.test(t)) return { knobs: { seaLevelM: 70 }, label: 'sea level +70 m (all land ice melted)', matched: ['ice caps melt'], confidence: 0.85 };
      return { knobs: { seaLevelM: /low/i.test(t) ? -120 : 70 }, label: 'sea level changed', matched: ['default'], confidence: 0.5 };
    },
  },
  {
    id: 'co2', scope: 'air',
    test: (t) => /\bco2\b|co₂|carbon dioxide|greenhouse gas/i.test(t),
    read(t) {
      let c = null, how = '';
      const m = t.match(/(\d[\d,]*)\s*ppm/i);
      if (m) { c = num(m[1]); how = m[0]; }
      else { const f = readFactor(t); if (f) { c = EARTH.co2ppm * f.f; how = f.how; } }
      if (!c) { c = /less|lower|half/i.test(t) ? 140 : 560; how = 'default'; }
      c = clamp(c, 10, 100000);
      return { knobs: { co2ppm: c }, label: `CO2 ${Math.round(c)} ppm (ours 280 pre-industrial)`, matched: [how], confidence: how === 'default' ? 0.6 : 0.95 };
    },
  },
  {
    id: 'o2', scope: 'air',
    test: (t) => /\boxygen\b|\bo2\b|o₂/i.test(t),
    read(t) {
      let o = null, how = '';
      const m = t.match(/(\d+(?:\.\d+)?)\s*%/);
      if (m) { o = num(m[1]) / 100; how = m[0]; }
      else { const f = readFactor(t); if (f) { o = EARTH.o2Frac * f.f; how = f.how; } }
      if (!o) { o = /less|low|thin/i.test(t) ? 0.13 : 0.30; how = 'default'; }
      o = clamp(o, 0.01, 0.6);
      return { knobs: { o2Frac: o }, label: `oxygen ${fmt(o * 100, 1)}% of the air (ours 20.9%)`, matched: [how], confidence: how === 'default' ? 0.6 : 0.95 };
    },
  },
  {
    id: 'impact', scope: 'deep',
    test: (t) => /asteroid|impactor|chicxulub|dinosaurs?/i.test(t),
    read(t) {
      return { knobs: { impact: false }, label: 'the K-Pg impactor misses (66.0 million years ago)', year: -6.6e7,
        matched: [(t.match(/asteroid|impactor|chicxulub|dinosaurs?/i) || ['dinosaurs'])[0]], confidence: 0.9 };
    },
  },
  {
    id: 'panama', scope: 'deep',
    test: (t) => /panama|isthmus/i.test(t),
    read() { return { knobs: { panama: false }, label: 'the Isthmus of Panama never closes', year: -2.8e6, matched: ['panama'], confidence: 0.9 }; },
  },
  {
    id: 'med', scope: 'deep',
    test: (t) => /mediterranean|messinian|gibraltar/i.test(t),
    read() { return { knobs: { medFlood: false, seaLevelM: 10 }, label: 'the Mediterranean never refills (dry since 5.96 million years ago)', year: -5.33e6, matched: ['mediterranean'], confidence: 0.9,
      notes: ['The Mediterranean holds about 3.75 million km3 of water; left in the world ocean it raises global sea level about 10 m.'] }; },
  },
  {
    id: 'event', scope: 'history',
    test: (t) => EVENTS.some((e) => e.re.test(t)),
    read(t) {
      const e = EVENTS.find((x) => x.re.test(t));
      const knobs = { ...e.knobs };
      if (e.base) knobs.removed = [e.base];
      return { knobs, label: `${e.subject}: ${NEGATION.test(t) || /surviv|endur|last/i.test(t) ? 'does not happen as in ours' : 'changes'}`,
        year: e.year, matched: [(t.match(e.re) || [e.id])[0]], confidence: 0.85, notes: [e.ours], eventId: e.id, domain: e.domain };
    },
  },
  {
    id: 'tech', scope: 'history',
    test: (t) => TECH.some((x) => x.re.test(t)) && /(invent|discover|arriv|appear|develop|earl|late|never|sooner|\bin\b|ce\b|ad\b|bc)/i.test(t),
    read(t) {
      const tech = TECH.find((x) => x.re.test(t));
      if (NEGATION.test(t) && /never|not|no\b/i.test(t) && !/earl|soon/i.test(t)) {
        return { knobs: { tech: { [tech.id]: 'never' } }, label: `${tech.name} never arrives`, year: tech.year, matched: [tech.id], confidence: 0.85 };
      }
      let shift = null, how = '';
      const y = readYear(t);
      if (y) { shift = y.y - tech.year; how = y.how; }
      const l = readLead(t);
      if (l) { shift = l.lead; how = l.how; }
      if (shift == null) { shift = /late|delay/i.test(t) ? 200 : -300; how = 'default'; }
      const year = tech.year + Math.min(0, shift);
      return { knobs: { tech: { [tech.id]: shift } }, label: `${tech.name} ${shift < 0 ? Math.abs(shift) + ' years earlier' : shift + ' years later'} (${fmtYear(tech.year + shift)}; ours ${fmtYear(tech.year)})`,
        year, matched: [tech.id, how], confidence: how === 'default' ? 0.6 : 0.9, techId: tech.id };
    },
  },
];

export function fmtYear(y) {
  if (y <= -1e9) return `${fmt(-y / 1e9, 2)} billion years ago`;
  if (y <= -1e6) return `${fmt(-y / 1e6, 1)} million years ago`;
  if (y <= -20000) return `${Math.round(-y / 1000)},000 years ago`;
  if (y < 0) return `${Math.round(-y)} BCE`;
  return `${Math.round(y)} CE`;
}

const DEFAULT_YEAR = { constant: -1.38e10, star: -4.6e9, planet: -4.54e9, air: -5.0e8, surface: -1.0e5, deep: null, history: null };

function mergeKnobs(into, add) {
  for (const [k, v] of Object.entries(add)) {
    if (k === 'tech') into.tech = { ...(into.tech || {}), ...v };
    else if (k === 'removed') into.removed = [...new Set([...(into.removed || []), ...v])];
    else into[k] = v;
  }
  return into;
}

/**
 * classify(text, { forkYear }) -> divergence spec
 * forkYear: when this is a fork, the year of the event it branches from.
 */
export function classify(text, { forkYear = null } = {}) {
  const t = String(text || '').trim().replace(/\s+/g, ' ').slice(0, 240);
  if (/^(no divergence|our world)\b/i.test(t)) {
    return { text: t, family: ['none'], scope: 'history', label: 'no divergence', knobs: {}, year: 2100, sudden: false, confidence: 1, matched: [], notes: [] };
  }
  const hits = FAMILIES.filter((f) => f.test(t));
  // history families must not swallow a physics reading of the same text
  const physical = hits.filter((f) => f.scope !== 'history');
  const used = physical.length ? physical : hits;

  const knobs = {};
  const parts = [];
  const notes = [];
  const matched = [];
  let year = null, conf = 0, scope = null, extra = {};
  for (const f of used) {
    const r = f.read(t);
    mergeKnobs(knobs, r.knobs);
    parts.push(r.label);
    matched.push(...(r.matched || []));
    (r.notes || []).forEach((n) => notes.push(n));
    conf = Math.max(conf, r.confidence || 0.5);
    if (r.year != null && (year == null || r.year < year)) year = r.year;
    if (!scope) scope = f.scope;
    if (r.eventId) extra.eventId = r.eventId;
    if (r.techId) extra.techId = r.techId;
    if (r.domain) extra.domain = r.domain;
  }

  let family = used.map((f) => f.id);
  if (!used.length) {
    // no family: read direction, domain and date, and hand the rest to the generic rules
    const dom = DOMAINS.find((d) => d.re.test(t));
    const y = readYear(t);
    const polarity = NEGATION.test(t) ? 'removed' : (/earl|soon|first/i.test(t) ? 'earlier' : 'changed');
    family = ['generic'];
    scope = 'history';
    year = y ? y.y : -10000;
    knobs.generic = { subject: t.replace(/[.!?]+$/, ''), polarity, domain: dom ? dom.id : 'society' };
    if (dom) {
      if (dom.tech) knobs.tech = { printing: dom.tech, steam: dom.tech, battery: dom.tech };
      if (dom.unity) knobs.unity = dom.unity;
      if (dom.pop) knobs.popFactor = dom.pop;
    }
    parts.push(`unmodelled change (${dom ? dom.id : 'society'}, ${polarity})`);
    matched.push(y ? y.how : 'undated');
    if (!y) notes.push('No date in the text. The engine dates an undated social change to the start of farming, 10,000 BCE, so it touches all of recorded history. Write a year to move it.');
    notes.push('No rule family covers this change. The engine fixes its date, direction and domain and applies its generic propagation rules; a model pass writes the specifics.');
    conf = 0.3;
  }

  if (year == null) year = DEFAULT_YEAR[scope] ?? -1e4;
  let clampedFrom = null;
  if (forkYear != null) {
    // a fork cannot reach back before its branch point
    const explicit = readYear(t);
    if (!explicit || year < forkYear) { if (explicit && year < forkYear) clampedFrom = year; year = forkYear; }
  }
  const sudden = year > -1e5 && used.some((f) => ['constant', 'planet', 'star', 'air', 'surface'].includes(f.scope));
  if (sudden) notes.push('A physical change this late arrives suddenly. The engine applies it from that year on; it does not model the transition itself.');
  if (clampedFrom != null) notes.push(`The text names ${fmtYear(clampedFrom)}, which is before this branch point. A fork only changes what comes after it, so the engine moves it to ${fmtYear(year)}.`);

  return {
    text: t,
    family,
    scope,
    label: parts.join(' + ') || 'no change',
    knobs,
    year,
    sudden,
    confidence: Math.round(conf * 100) / 100,
    matched: matched.filter(Boolean),
    notes,
    ...extra,
  };
}

/* Combine our knobs with each divergence in a path, in order. */
export function composeKnobs(base, specs) {
  const k = JSON.parse(JSON.stringify(base));
  for (const s of specs) mergeKnobs(k, s.knobs);
  return k;
}
