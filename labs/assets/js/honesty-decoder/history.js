/* ============================================================
   honesty-decoder/history.js — the record.

   ASSERTED: the figures the G0 decoder printed, read from the git
   history of labs/honesty-decoder.html (commit, date, value). They
   were typed in by hand; they are kept as history, never as a row's
   figure. The G1 and live points are computed by engine.js at render.

   CORRECTIONS: every change to a row's figure or text since G0, with
   date, old value, new value and reason. 'new' values that are
   figures read 'computed' here and are rendered from the engine.
   ============================================================ */

export const ASSERTED = {
  'black-hole': [['2026-06-17', '6e421c3', 88], ['2026-06-18', 'e439a51', 88]],
  exomania: [['2026-06-17', '6e421c3', 88], ['2026-06-18', 'e439a51', 88]],
  dataspace: [['2026-06-17', '6e421c3', 80], ['2026-06-18', 'e439a51', 80]],
  'token-ekg': [['2026-06-17', '6e421c3', 55], ['2026-06-17', 'd4277b0', 75], ['2026-06-18', 'e439a51', 75]],
  'alt-reality': [['2026-06-17', '6e421c3', 34], ['2026-06-18', 'e439a51', 34]],
  'the-figure': [['2026-06-17', '6e421c3', 28], ['2026-06-17', '42fcf0e', 60], ['2026-06-18', 'e439a51', 66]],
  'primordial-seed': [['2026-06-17', 'ccb2d72', 85], ['2026-06-18', 'e439a51', 85]],
  heptapod: [['2026-06-18', '2b14826', 78], ['2026-06-18', 'e439a51', 78]],
  aea: [['2026-06-17', '6e421c3', 50], ['2026-06-18', 'e439a51', 50]],
  ouroboros: [['2026-06-17', '6e421c3', 45], ['2026-06-18', 'e439a51', 45]],
  'agi-ryzen': [['2026-06-17', '6e421c3', 18], ['2026-06-18', 'e439a51', 18]],
};

const D = '2026-11-11';
export const CORRECTIONS = [
  { date: D, id: '*', field: 'claim', old: 'a myth line written for the decoder', new: 'the lab\'s live hub blurb from site.config.js', reason: 'the hub\'s own copy is what a visitor reads, so it is what gets graded' },
  { date: D, id: '*', field: 'figure', old: 'a percentage typed into the row', new: 'computed', reason: 'the figure is now the weighted mean of checked sub-claim verdicts (engine.js figureOf)' },
  { date: D, id: 'black-hole', field: 'row', old: 'one row shared with Exomania', new: 'its own row, keyed by hub id', reason: 'a row naming two labs covered only one of them' },
  { date: D, id: 'exomania', field: 'row', old: 'one row shared with Black Hole', new: 'its own row, keyed by hub id', reason: 'a row naming two labs covered only one of them' },
  { date: D, id: 'exomania', field: 'figure', old: '88 (asserted)', new: 'computed', reason: 'the blurb says "fly between" and "fed daily"; worlds swap instantly and the refresh is weekly' },
  { date: D, id: 'the-figure', field: 'mechanism', old: 'The default Run is a REAL live orchestration', new: 'four sequential calls; on the public route the second is refused and the authored echo plays', reason: 'the public route answers 1 reply per 45 s per IP (measured 2026-11-11)' },
  { date: D, id: 'the-figure', field: 'figure', old: '66 (asserted)', new: 'computed', reason: '"recursive" and "run live" do not hold: one layer, and 4 calls per run on a 1-per-45-s route' },
  { date: D, id: 'dataspace', field: 'mechanism', old: 'The default is a live keyless round-trip', new: 'two chained calls; the reconstruction is refused on the public route and an authored pair is scored', reason: 'collapse() chains two calls with no wait (measured 2026-11-11)' },
  { date: D, id: 'dataspace', field: 'figure', old: '80 (asserted)', new: 'computed', reason: 'the round trip cannot complete on the public route, and "every lost word" lists at most 8' },
  { date: D, id: 'token-ekg', field: 'mechanism', old: 'Now streams a real keyless model BY DEFAULT on load', new: 'streams on load, spending the public window; a random cadence runs before and after every stream', reason: 'simStep() resumes 700 ms after each stream ends' },
  { date: D, id: 'token-ekg', field: 'figure', old: '75 (asserted)', new: 'computed', reason: 'it stamps SSE lines, not tokens, and measures arrival in the browser, network and cache included' },
  { date: D, id: 'alt-reality', field: 'figure', old: '34 (asserted)', new: 'computed', reason: 'graded on the hub blurb, which promises a constant to change; there is none' },
  { date: D, id: 'primordial-seed', field: 'figure', old: '85 (asserted)', new: 'computed', reason: '"the motif it repeats most" is the motif that saves most; minted rules are frozen; fonts come from the network' },
  { date: D, id: 'heptapod', field: 'figure', old: '78 (asserted)', new: 'computed', reason: 'graded on the hub blurb; distinct meanings share feature vectors, and hover does not bloom' },
  { date: D, id: 'honesty-decoder', field: 'footer', old: 'every exhibit in this lab carries a decoder row; this is where they live', new: 'removed', reason: 'no other page read the decoder, and 6 of 13 built labs had no row (G0 audit)' },
  { date: D, id: 'honesty-decoder', field: 'meta line', old: '8 systems · zero network', new: 'removed', reason: 'the page loads its typeface from Google Fonts and now fetches every lab\'s files to check them' },
  { date: D, id: 'honesty-decoder', field: 'hub blurb', old: 'Every system in this lab, decoded: the myth it could be sold as, the plain mechanism, and an honest reality-percentage between them.', new: 'Every lab\'s hub blurb, split into atomic sub-claims and checked against the running code (the new blurb in site.config.js)', reason: 'the old figure was a percentage typed by the author' },
];
