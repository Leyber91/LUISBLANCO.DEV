/* ============================================================
   dataspace/copy.js — the page's explanations. Static text plus
   functions that fill in the selected run's own numbers, so every
   claim on screen is about the text the visitor is looking at.
   ============================================================ */

const pct = (x, d = 0) => (x == null || !isFinite(x) ? '-' : (x * 100).toFixed(d) + '%');
const fmt = (b) => (b == null || !isFinite(b) ? '-' : Math.round(b).toLocaleString('en-US'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const DEFS = {
  srcBits: '<b>Source bits.</b> The conversation in GPT-2 tokens, coded in two parts. Each token costs -log2(count/n) bits, its surprise under the text\'s own token frequencies (Shannon 1948). Each distinct token is also spelled once, at 8 bits per byte plus a terminator byte and an Elias gamma code for its count. A decoder holding only these bits rebuilds the text exactly.',
  capBits: '<b>Capsule bits.</b> The capsule in the same two-part code, so capsule and source divide cleanly. Gold marks the capsule everywhere on the page.',
  rate: '<b>Rate.</b> Capsule bits divided by source bits. A rate of 0.10 means the capsule spends a tenth of what the source costs in this code.',
  floor: '<b>Lossless floor.</b> The source compressed with DEFLATE (RFC 1951) in this browser, in bits. A lossless coder gives back every byte, so this is the honest baseline: what keeping everything costs. The source figure sits above it because the two-part code spells each new word in raw bytes, where DEFLATE reuses repeated strings. The capsule sits below both because it is lossy and drops what the model is expected to restore.',
  lexical: '<b>Lexical fidelity.</b> The share of source tokens that come back, in order, in the rebuild: the longest common subsequence of the two token lists (lower-cased, spaces ignored) over the source\'s token count. It reads letters. A paraphrase that keeps the meaning scores as loss.',
  numbers: '<b>Numbers.</b> Numbers, dates and times found by the rules in the methods section, each marked survived, altered or lost in the rebuild. \'Feb 2023\' read back as \'2023\' counts as altered.',
  entities: '<b>Names.</b> Proper names, acronyms and identifiers found by rules E1 to E4 (methods). A name survives when it appears as a whole word in the rebuild.',
  turns: '<b>Turns.</b> Lines that open with USER: or ASSISTANT:. The source count, the rebuild count, and the share of the speaker order kept (an LCS over the speaker sequence).',
};

export function concepts() {
  return `
<span class="k">bit</span>
<p>One yes-or-no answer. A token that appears once in a 150-token text costs about 7 bits of surprise plus the bits to spell it; a word that repeats costs less each time. <button class="try" type="button" data-try="bit">Hover a token in the ledger</button> and read its bits.</p>
<span class="k">entropy</span>
<p>The average surprise per token under a model of the text. The page uses the text's own token counts (zeroth order) and, in the floor table, a context model that has read Alice's Adventures in Wonderland first. A better model expects more and pays fewer bits.</p>
<span class="k">lossless floor</span>
<p>What a real compressor needs to give the text back byte for byte. <button class="try" type="button" data-try="floor">Compare DEFLATE, Brotli and PPM</button> on your text. <button class="try" type="button" data-try="short">Try a two-line text</button> and watch DEFLATE's fixed overhead push the floor above the source figure.</p>
<span class="k">capsule</span>
<p>A lossy code that only a model can read. It throws letters away and bets that the reader can put them back. <button class="try" type="button" data-try="edit">Edit a capsule by hand</button> and rebuild it to see what each word carries.</p>
<span class="k">fidelity</span>
<p>How much came back. Lexical fidelity counts tokens; the survival tables count facts. They disagree when the rebuild paraphrases, and the page shows where.</p>
<span class="k">rate and distortion</span>
<p>Spend fewer bits and more is lost. <button class="try" type="button" data-try="gentle">Load the gentle capsule</button>, then <button class="try" type="button" data-try="brutal">the brutal one</button>, then <button class="try" type="button" data-try="rd">read the curve on meaning</button>.</p>`;
}

export function metaphorRows() {
  return [
    ['bent light, shadow, photon ring', 'physics', 'Null geodesics of the Schwarzschild metric (r_s = 1), integrated numerically in 3D with an adaptive step, at most 220 steps per pixel. The ring sits near r = 1.5 and the shadow edge near impact parameter 2.6. The integrator is approximate; no other relativity is claimed.'],
    ['disk brightening on one side', 'physics, illustrative strength', 'Relativistic Doppler factor and gravitational redshift of a thin Keplerian disk; brightness goes as g cubed, an illustrative exponent.'],
    ['disk bands', 'chart', 'The source in order, first turn innermost, 64 bands; brightness is the mean bits per token of that slice, 4 bits dim to 40 bits bright.'],
    ['disk re-forming after the rebuild', 'chart', 'Each band stays lit by the share of its tokens the rebuild kept.'],
    ['gold core', 'chart', 'Capsule bits over source bits; full glow at a rate of 0.5.'],
    ['horizon size', 'fixed', 'Always r = 1. It carries no data.'],
    ['motes drifting out ("Hawking radiation")', 'metaphor', 'Each mote is one lost source token; ringed motes are lost facts. Real Hawking radiation is thermal emission from a horizon (Hawking, Nature 248, 1974); nothing here models it.'],
    ['disk rotation, stars', 'ambient', 'Keplerian spin and a procedural starfield. No data.'],
  ];
}

export function methods(cites) {
  const c = (id) => esc(cites.find((x) => x.id === id)?.text || id);
  return `<ol>
<li><b>Tokens.</b> GPT-2 byte-level BPE, its 50,000 merges bundled with the page; counts and tokens match the Hugging Face tokenizers library on four test strings (tests.mjs). ${c('gpt2')}</li>
<li><b>Bits.</b> <code>L(x) = sum over tokens of -log2(c_t / n) + sum over types of [8 (bytes_t + 1) + gamma(c_t)] + gamma(V + 1)</code>, where gamma(k) = 2 floor(log2 k) + 1 is the Elias gamma length. Source, capsule and baselines share this code. ${c('shannon48')} ${c('mdl')} ${c('elias')}</li>
<li><b>Lossless floor.</b> DEFLATE through CompressionStream('deflate-raw'), the browser's zlib at level 6; Brotli through brotli-wasm 3.0.1 at quality 11; PPM-C order 4 over bytes with full exclusion and update exclusion, primed on alice29.txt, reported as its ideal code length. On alice29.txt each compressor is compared with the command-line tool at the same settings. ${c('rfc1951')} ${c('rfc7932')} ${c('ppm')} ${c('ppmc')} ${c('canterbury')}</li>
<li><b>Rate.</b> <code>R = L(capsule) / L(source)</code>. The floor's rate is DEFLATE bits over L(source).</li>
<li><b>Lexical fidelity.</b> <code>F = |LCS(s, r)| / |s|</code> over non-space tokens, lower-cased with the leading space removed, by the Wagner and Fischer dynamic program; both sides cut at 1,600 tokens. Invented tokens are counted separately and do not lower F. ${c('lcs')}</li>
<li><b>Numbers and dates.</b> Rules in order: date ranges ("14 to 18 March"), dates ("25 March", "Feb 2023", "the 15th", a bare year), times ("02:15"), numbers with thousands separators or decimals or as words, each with a known unit that follows. A number survives with the same value (and unit when both have one), is altered with the same value and another unit; a date survives when a rebuilt date carries all its fields, is altered when one shares a field.</li>
<li><b>Names.</b> E1 a capitalised word inside a sentence, except I, months and weekdays; E2 a sentence's first word when its lower-case form is not a single GPT-2 token and is never written lower-case in the text; E3 an upper-case word of two letters or more, except speaker labels and units; E4 snake_case, --flags and camelCase. A name survives as a whole word, is altered when part of a multi-word name or a respaced identifier appears. Unit scores count altered as half.</li>
<li><b>Who restored what.</b> The kept source tokens split three ways: kept by the same model's rebuild of an empty capsule (prior), present in the capsule (literal), and the rest (decoder).</li>
<li><b>Rate and distortion.</b> Shannon's rate-distortion function <code>R(D) = min I(X; Y) subject to E d(X, Y) &lt;= D</code> is the least rate a source model allows at distortion D. The page measures round trips and draws them as points with distortion <code>1 - F</code> or one minus a unit score; it does not compute R(D). ${c('shannon59')}</li>
<li><b>Baselines at matched rate.</b> Head cut: the longest start of the source whose code fits the median capsule's bits at that level. Extractive: the source tokens with the highest bit cost, kept in order, up to the same bits. Both scored as written. ${c('llmlingua')}</li>
<li><b>Compression and prediction.</b> A model that predicts text well compresses it well; an arithmetic coder driven by a language model is a lossless compressor (Deletang et al.). The capsule is different: it is lossy and needs the model to decode it. ${c('lmc')}</li>
</ol>`;
}

export function floorProse({ src, floorBits, lossless, run, m, mode }) {
  if (!src) return '';
  const n = src.tokens.length;
  const chars = src.tokens.length ? src.tokens[src.tokens.length - 1].b : 0;
  const best = Math.min(...[floorBits, lossless?.brotliBits, lossless?.ppmBits].filter((x) => x != null));
  const bestName = best === lossless?.ppmBits ? 'PPM' : best === lossless?.brotliBits ? 'Brotli' : 'DEFLATE';
  let s = `<p>This conversation is <b>${fmt(src.bits.total)} bits</b> in the page's two-part code: ${n} tokens, ${fmt(src.bits.data)} bits of token surprise and ${fmt(src.bits.vocab)} bits to spell ${src.bits.types} distinct tokens. ` +
    (floorBits ? `DEFLATE stores the same ${chars.toLocaleString('en-US')} characters in <b>${fmt(floorBits)} bits</b> (${(floorBits / Math.max(1, chars)).toFixed(2)} bits per character)` : 'DEFLATE is measuring') +
    (isFinite(best) && best !== floorBits ? `, and ${bestName} in <b>${fmt(best)} bits</b>` : '') + '.</p>';
  s += '<p>A lossless coder must return every byte, so the smallest of these is the honest floor: it is what keeping everything costs here. The two-part figure sits above it because it spells each word in raw bytes, where DEFLATE and PPM reuse repeated letter strings.</p>';
  if (run?.capsule && m) {
    const below = floorBits ? floorBits / m.bits.cap.total : null;
    s += `<p>The selected capsule spends <b>${fmt(m.bits.cap.total)} bits</b>, a rate of ${m.rate.toFixed(3)}` + (below ? `, ${below.toFixed(1)} times below the DEFLATE floor` : '') + '. ';
    if (mode === 'rebuild') {
      s += `The rebuild from it keeps ${pct(m.lex.fidelity)} of the source tokens, ${m.summary.numbers.survived} of ${m.summary.numbers.total} numbers and ${m.summary.entities.survived} of ${m.summary.entities.total} names. ` +
        'It beats the floor on size because it is lossy: the model keeps the parts it can predict back and drops the letters, and the rebuild pays for that in tokens it has to guess.</p>';
    } else s += 'Its rebuild has not run, so nothing is claimed about what it keeps.</p>';
  }
  return s;
}

/** The scorer's own limits, shown with this run's example. */
export function limitsNote(m, run) {
  const src = m.tokens.src;
  const recText = run.rebuild || run.capsule || '';
  // prefer the clearest disagreement: an altered fact, then one that came back in other words, then any
  const cands = [];
  for (const u of m.units) {
    if (u.status === 'lost') continue;
    const toks = src.map((t, i) => i).filter((i) => u.spans.some(([a, b]) => src[i].a < b && src[i].b > a) && /\S/.test(src[i].t));
    const dropped = toks.filter((i) => m.lex.scored.has(i) && !m.lex.keptSrc[i]);
    if (!dropped.length) continue;
    const back = u.recSpans.length ? recText.slice(u.recSpans[0][0], u.recSpans[0][1]) : '';
    const rank = u.status === 'altered' ? 0 : back.toLowerCase() !== u.text.toLowerCase() ? 1 : 2;
    cands.push({ u, toks, dropped, back, rank });
  }
  cands.sort((a, b) => a.rank - b.rank || b.dropped.length - a.dropped.length);
  const c = cands[0];
  if (c) {
    const how = c.rank === 2
      ? `It came back word for word elsewhere in the rebuild, but the alignment matched ${c.dropped.length} of its ${c.toks.length} token${c.toks.length > 1 ? 's' : ''} to nothing, so the lexical score counts them as dropped`
      : `The lexical score counts ${c.dropped.length} of its ${c.toks.length} token${c.toks.length > 1 ? 's' : ''} as dropped`;
    return `<b>What the lexical score missed in this run:</b> '${esc(c.u.text)}' came back as '${esc(c.back)}'. ${how}; the ${c.u.kind === 'entity' ? 'name' : c.u.kind} table reads it as <b>${c.u.status}</b>. ` +
      `The lexical score also never penalises the ${m.lex.invented} invented tokens.`;
  }
  return `<b>The scorer's limits on this run:</b> every fact the tables call kept was also kept token for token, so the two measures agree here. The lexical score still ignores the ${m.lex.invented} invented tokens, and neither measure judges whether a rebuilt sentence is true.`;
}

export function tourSteps({ e, src, floorBits }) {
  const m = e?.m, r = e?.run;
  return [
    { target: '#plate .figs', title: 'The source, in bits',
      body: src ? `This conversation costs <b>${fmt(src.bits.total)} bits</b> in the page's code. DEFLATE stores it in ${fmt(floorBits)} bits: that is the floor a lossless coder reaches.` : '' },
    { target: '#capsulePanel', title: 'The capsule',
      body: r && m ? `The model was asked for at most ${r.budgetWords} words and wrote ${r.capsule ? r.capsule.split(/\s+/).length : 0}. In the same code that is <b>${fmt(m.bits.cap.total)} bits</b>, a rate of ${m.rate.toFixed(3)}.` : 'Run a collapse first.' },
    { target: '#ledger .twocol', title: 'The rebuild, token by token',
      body: m ? `A fresh call saw only the capsule. Plain tokens came back, struck ones were dropped, underlined ones were invented. Lexical fidelity: <b>${pct(m.lex.fidelity)}</b>.` : '' },
    { target: '#survived', title: 'The facts',
      body: m ? `Numbers and names are scored as units: ${m.summary.numbers.survived} of ${m.summary.numbers.total} numbers and ${m.summary.entities.survived} of ${m.summary.entities.total} names survived. The note at the top shows where the lexical score and the tables disagree.` : '' },
    { target: '#rd .plotwrap', title: 'Every run is a point',
      body: 'Lower is better at the same rate. Dashed lines are what cutting the start or keeping the rarest tokens gets for the same bits; the gap is what the model buys.' },
  ];
}

/** An end card: what was lost first as strength rose, and what held. */
export function findings({ runs, preset, levels }) {
  if (!runs.length) return { html: '<p>No scored runs on this text yet. Run a sweep first.</p>', text: 'No scored runs yet.' };
  const by = levels.map((l) => runs.filter((e) => e.run.level === l.id)).map((rs, k) => ({ level: levels[k].id, name: levels[k].name, rs }));
  const mean = (rs, f) => (rs.length ? rs.reduce((a, e) => a + f(e), 0) / rs.length : null);
  const lines = by.filter((b) => b.rs.length).map((b) => ({
    ...b, lex: mean(b.rs, (e) => e.m.lex.fidelity), num: mean(b.rs, (e) => e.m.summary.numbers.score ?? 0), ent: mean(b.rs, (e) => e.m.summary.entities.score ?? 0),
  }));
  // a unit dies at the lowest level where most runs lose it
  const death = new Map();
  for (const b of lines) {
    const counts = new Map();
    for (const e of b.rs) for (const u of e.m.units) { const c = counts.get(u.text) || { lost: 0, n: 0, kind: u.kind }; c.n++; if (u.status === 'lost') c.lost++; counts.set(u.text, c); }
    for (const [t, c] of counts) if (c.lost / c.n > 0.5 && !death.has(t)) death.set(t, { level: b.level, kind: c.kind });
  }
  const allUnits = new Set(runs.flatMap((e) => e.m.units.map((u) => u.text)));
  const held = [...allUnits].filter((t) => !death.has(t));
  const first = [...death.entries()].sort((a, b) => a[1].level - b[1].level).slice(0, 5);
  const lo = lines[0], hi = lines[lines.length - 1];
  const models = [...new Set(runs.map((e) => e.run.provenance?.model))].join(', ');
  const text = [
    `DATASPACE finding, ${preset || 'own text'}, ${runs.length} scored runs (${models}).`,
    `From L${lo.level} ${lo.name} to L${hi.level} ${hi.name}, lexical fidelity fell from ${pct(lo.lex)} to ${pct(hi.lex)}; numbers from ${pct(lo.num)} to ${pct(hi.num)}; names from ${pct(lo.ent)} to ${pct(hi.ent)}.`,
    first.length ? `Lost first: ${first.map(([t, d]) => `'${t}' (${d.kind === 'entity' ? 'name' : d.kind}, gone by L${d.level})`).join('; ')}.` : 'No fact was lost by most runs at any level.',
    held.length ? `Held at every level: ${held.slice(0, 8).map((t) => `'${t}'`).join(', ')}.` : 'No fact held at every level.',
  ].join('\n');
  return { text, html: text.split('\n').map((l, k) => (k === 0 ? `<p><b>${esc(l)}</b></p>` : `<p>${esc(l)}</p>`)).join('') };
}
