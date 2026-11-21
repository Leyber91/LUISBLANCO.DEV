/* ============================================================
   orthogonal/render-words.js: what the page says about the render
   and how it was made, held to the pipeline. No DOM.

   Why it exists: the review of 2026-11-21 (C1) found the render's
   alt text describing "fine ink lines" the render does not have.
   The parameter file draws no ink (ink.thickness_px is 0, and
   render_artifact.py turns its lines on only above 0); the sentence
   had been written for an earlier render, from intent, and nothing
   read it against the pipeline again. Here every word the page uses
   about the render stands on a fact of the parameter file (P), the
   render's record (R), the pipeline's own source (S) or the world's
   data (world), and tests.mjs reads every sentence on the page about
   the render against them:

   - RENDER_WORDS   each word, what it says of the render, and the
                    fact it stands on
   - ALT_PLAIN      the words of the alt text that name nothing in
                    the image. The alt text is held to a closed
                    vocabulary: each of its words is one of these or
                    a word of RENDER_WORDS that holds, so a word that
                    names something new in the image fails until a
                    fact is found for it
   - provenance     the caption's provenance line, written from the
                    record and nothing else
   - fallbackLine   what the caption says when the render does not
                    load
   - renderSentences  every sentence the world's data puts on the
                    page about the render or its making
   - renderWordFaults every word of those sentences that does not
                    hold, as sentences
   ============================================================ */

const caps = (P) => P.culture.front_caps + P.culture.back_caps;

/* Each word: a pattern over one sentence, what the word says of the render, the fact it stands on (a function of
   { P, R, S, world }) and where that fact is. A word that does not hold is a fault wherever it appears. */
export const RENDER_WORDS = Object.freeze([
  { id: 'ink', re: /\bink(ed)?\b/i, says: 'drafting lines drawn over the render',
    holds: ({ P }) => P.ink.thickness_px > 0, fact: 'ink.thickness_px > 0 (render_artifact.py render draws Freestyle lines only then)' },
  { id: 'night', re: /\bnight\b/i, says: 'no sun and no studio light, a faint sky only',
    holds: ({ P }) => P.air.rim_energy_w === 0 && P.air.sky_ambient > 0 && P.air.sky_ambient <= P.glow.flesh,
    fact: 'air.rim_energy_w is 0 and 0 < air.sky_ambient <= glow.flesh' },
  { id: 'fog', re: /\bfog(gy)?\b/i, says: 'fog in the air', holds: ({ P }) => P.air.fog_density > 0, fact: 'air.fog_density > 0' },
  { id: 'sky', re: /\bsky\b/i, says: 'the night sky recorded in the frame',
    holds: ({ P, R }) => P.air.sky_ambient > 0 && R.measure.light.sky_p50 > 0, fact: 'air.sky_ambient > 0 and the record measures the sky' },
  { id: 'faint', re: /\bfaint\b/i, says: 'the sky recorded faint',
    holds: ({ R }) => R.measure.light.sky_p50 < 0.1, fact: "the record's sky median luma under 0.1" },
  { id: 'glass', re: /\bglass\b/i, says: 'a glass column, and a glass flask',
    holds: ({ P, S }) => /cyl\("glass", col_r, col_h, col_z, glass/.test(S) && P.instrument.column_height_m > 0,
    fact: 'the pipeline builds the column of its glass material' },
  { id: 'column', re: /\bcolumn\b/i, says: 'a column', holds: ({ P }) => P.instrument.column_height_m > 0 && P.instrument.column_radius_m > 0,
    fact: 'instrument.column_height_m and column_radius_m > 0' },
  { id: 'plinth', re: /\bplinth\b/i, says: 'a plinth under the column', holds: ({ P }) => P.instrument.plinth_height_m > 0, fact: 'instrument.plinth_height_m > 0' },
  { id: 'ceramic', re: /\bceramic\b/i, says: 'a ceramic plinth and hood',
    holds: ({ S }) => /cyl\("plinth", plinth_r, plinth_h, plinth_h \/ 2, ceramic/.test(S), fact: 'the pipeline builds the plinth of its ceramic material' },
  { id: 'hood', re: /\bhood\b/i, says: 'a hood over the column', holds: ({ P }) => P.instrument.louvers.length > 0, fact: 'instrument.louvers is not empty' },
  { id: 'louver', re: /\blouv(er|ers|ered|re|res|red)\b|\bstacked\b|\brings?\b/i, says: 'a hood of stacked rings',
    holds: ({ P }) => P.instrument.louvers.length >= 2, fact: 'two or more instrument.louvers' },
  { id: 'spindle', re: /\bspindle\b/i, says: 'a spindle up the column', holds: ({ P }) => P.instrument.spindle_radius_m > 0, fact: 'instrument.spindle_radius_m > 0' },
  { id: 'wood', re: /\bwood(en)?\b/i, says: 'a wooden spindle',
    holds: ({ S }) => /cyl\("spindle", spindle_r, col_h, col_z, wood/.test(S), fact: 'the pipeline builds the spindle of its wood material' },
  { id: 'flask', re: /\bflasks?\b/i, says: 'a flask beside the plinth', holds: ({ P }) => P.instrument.flask_radius_m > 0, fact: 'instrument.flask_radius_m > 0' },
  { id: 'fungus', re: /\bfung(us|i|al)\b|\bculture\b/i, says: 'a culture of fungus', holds: ({ P }) => caps(P) > 0, fact: 'culture.front_caps + back_caps > 0' },
  { id: 'bracket', re: /\bbrackets?\b|\bshel(f|ves)\b/i, says: 'shelves of bracket fungus',
    holds: ({ P }) => P.family === 'shelf-culture-lamp' && caps(P) > 0, fact: 'the family shelf-culture-lamp, with caps' },
  { id: 'gill', re: /\bgill(s|ed)?\b/i, says: 'gills under the caps, glowing', holds: ({ P }) => P.bracket.full_gills[0] > 0 && P.glow.gill > 0,
    fact: 'bracket.full_gills and glow.gill > 0' },
  { id: 'rim', re: /\brims?\b|\bmargins?\b/i, says: 'rolled margins that glow', holds: ({ S }) => /the margin, rolled under/.test(S),
    fact: 'the pipeline rolls each margin under and gives it glow' },
  { id: 'glow', re: /\bglow(s|ing)?\b/i, says: 'the culture glows, the brightest thing in the frame',
    holds: ({ P, R }) => P.glow.gill > 0 && R.measure.light.culture_p99 > 3 * R.measure.light.beyond_column_p995,
    fact: "glow.gill > 0, and the record's culture_p99 over three times beyond_column_p995" },
  { id: 'blue-white', re: /\bblue-white\b/i, says: 'the glow drawn blue-white',
    holds: ({ P }) => { const [r, g, b] = P.glow.rgb; return b >= g && g >= r && r >= 0.6; }, fact: 'glow.rgb blue >= green >= red >= 0.6' },
  { id: 'cobble', re: /\bcobble(s|d)?\b|\bsetts?\b/i, says: 'a cobbled street',
    holds: ({ P, S }) => /ShaderNodeTexVoronoi/.test(S) && P.ground.joint_m > 0, fact: "the pipeline's street of Voronoi setts, ground.joint_m > 0" },
  { id: 'wet', re: /\bwet\b/i, says: 'wet ground', holds: ({ P }) => P.ground.wet_cover > 0, fact: 'ground.wet_cover > 0' },
  { id: 'pool', re: /\bpool\b/i, says: 'the culture lights only a small pool of the ground',
    holds: ({ P, R }) => P.air.rim_energy_w === 0 && R.measure.light.beyond_column_p995 < R.measure.light.culture_p99 / 3,
    fact: 'no studio light, and nothing outside the column a third as bright as the culture' },
  { id: 'dark', re: /\bdark\b/i, says: 'the hood dark against the sky', holds: ({ R }) => R.measure.light.hood_p10 < R.measure.light.sky_p50,
    fact: "the record's hood_p10 under its sky_p50" },
  { id: 'exposure', re: /\bexposure\b|\bexposed\b/i, says: 'exposed up, as a long exposure records a dim source',
    holds: ({ P, R }) => P.exposure.stops > 0 && R.exposure_stops === P.exposure.stops, fact: "exposure.stops > 0, the record's the file's" },
  { id: 'dimmer', re: /\bdimmer\b/i, says: 'to the eye dimmer than drawn', holds: ({ P }) => P.exposure.stops > 0, fact: 'exposure.stops > 0' },
  { id: 'sweep', re: /\bswe(ep|eps|pt)\b|\baxis\b|\bprofile\b/i, says: 'each cap a profile swept round an axis',
    holds: ({ P, S }) => /prof_pts\.append/.test(S) && /close both ends of the sweep/.test(S) && P.bracket.sweep_steps > 0,
    fact: "render_artifact.py's cap: a profile (prof_pts) swept through bracket.sweep_steps angles, its ends closed" },
  { id: 'grammar', re: /\bgrammars?\b|\bL-systems?\b|\brewrit\w*\b/i, says: 'forms grown by rewriting rules',
    holds: ({ S }) => /def \w*(grammar|rewrite|production)\w*\(/i.test(S), fact: 'the pipeline to define rewriting rules, and it defines none' },
  { id: 'seed', re: /\bseed(ed)?\b/i, says: 'built from the seed in its parameter file',
    holds: ({ P, R }) => Number.isInteger(P.seed) && R.seed === P.seed, fact: "the record's seed is the file's" },
  { id: 'blender', re: /\bblender\b/i, says: 'rendered in Blender', holds: ({ R }) => typeof R.blender === 'string' && /^\d+\.\d+/.test(R.blender),
    fact: "the record's blender version" },
  { id: 'samples', re: /\bsamples?\b/i, says: 'rendered at the samples printed', holds: ({ P, R }) => R.samples === P.render.samples,
    fact: "the record's samples are the file's" },
  { id: 'ground line', re: /\bground line\b/i, says: "Earth's lamp stands on the render's ground line",
    holds: ({ world, R }) => Math.abs(world.artifact.frame.ground - R.measure.frame.ground) <= 0.002, fact: "the world's frame.ground within 0.002 of the record's" },
]);

/* The words of the alt text that name nothing in the image: articles, prepositions, joins, and the verbs and places
   that say where a thing stands. A word that describes what is seen is not one of these: it is a word of
   RENDER_WORDS, with its fact. */
export const ALT_PLAIN = Object.freeze(new Set([
  'a', 'an', 'the', 'at', 'in', 'on', 'of', 'and', 'under', 'inside', 'along', 'their', 'its', 'it', 'is', 'side', 'top',
  'front', 'small', 'stands', 'reaches', 'light', 'against', 'central',
]));

const NB = ' ', DOT = ' · ';

/* The caption's provenance line from the render's record: its seed, Blender's version and the samples, then the time
   it took, rounded to the second and then split into minutes and seconds (so 179.6 s is 3 min 0 s, never 2 min 60 s).
   The second line ends where the page links "its parameters". */
export function provenance(record) {
  const total = Math.round(record.render_s);
  const mins = Math.floor(total / 60), secs = total % 60;
  return {
    head: `Seed${NB}${record.seed}${DOT}Blender${NB}${record.blender}${DOT}${record.samples}${NB}samples`,
    from: `Rendered in ${mins}${NB}min${NB}${secs}${NB}s from `,
  };
}

/* What the caption says when the render does not load: the outline drawn from the parameter file in its place, or,
   when the parameters did not load either, that. */
export const fallbackLine = (file, drawn) => (drawn
  ? `The render did not load; this outline is drawn from ${file} [ILLUSTRATIVE].`
  : `The render did not load, nor its parameters (${file}).`);

/* Every sentence the world's data and the record put on the page about the render or its making: the alt text (held
   to the closed vocabulary), the caption's notes, the artifact's note and evidence, the provenance line and the
   fallback. The page's markup adds its own (tests.mjs reads them from orthogonal.html). */
export function renderSentences(world, record) {
  const a = world.artifact;
  const node = world.nodes.find((n) => n.id === a.node);
  const p = provenance(record);
  const file = a.params.split('/').pop();
  return [
    { where: 'the alt text', text: a.alt, closed: true },
    { where: "the caption's exposure note", text: a.exposure },
    ...(a.colour ? [{ where: "the caption's colour note", text: a.colour.text }] : []),
    { where: "the artifact's note", text: node.note },
    ...node.evidence.map((e, k) => ({ where: `the artifact's evidence ${k + 1}`, text: e.text })),
    { where: 'the provenance line', text: `${p.head} ${p.from}its parameters` },
    { where: 'the fallback line', text: fallbackLine(file, true) },
    { where: 'the fallback line without parameters', text: fallbackLine(file, false) },
  ];
}

/* The words of a sentence, for the closed vocabulary: lower case, a possessive dropped, a hyphened word kept whole. */
export const wordsOf = (text) => String(text).toLowerCase().split(/[^a-z'-]+/).map((w) => w.replace(/'s$|'$/, '').replace(/^-+|-+$/g, '')).filter(Boolean);

/* Every word of `sentences` that does not hold on `facts` ({ P, R, S, world }), as sentences; an empty list when all
   hold. */
export function renderWordFaults(sentences, facts) {
  const out = [];
  for (const s of sentences) {
    for (const w of RENDER_WORDS) {
      if (w.re.test(s.text) && !w.holds(facts)) out.push(`${s.where}: "${w.id}" says ${w.says}, and the pipeline does not: it needs ${w.fact}`);
    }
    if (s.closed) {
      for (const t of wordsOf(s.text)) {
        if (!ALT_PLAIN.has(t) && !RENDER_WORDS.some((w) => w.re.test(t))) out.push(`${s.where}: "${t}" names something in the image that no fact of the pipeline stands for`);
      }
    }
  }
  return out;
}
