/* ============================================================
   dataspace/measures.js — every measure the page shows, pure.

   No DOM, no network. Each function takes plain values and returns
   plain values, so tests.mjs checks them in Node and the page,
   the recorder and the exports all share one implementation.

   The accounting (one rule for source, capsule and baselines):
     tokens   GPT-2 byte-level BPE (bpe.js)
     bits     a two-part code (Rissanen 1978): the zeroth-order
              self-information of the token sequence over its own
              frequencies, sum of -log2(c/n) (Shannon 1948), PLUS the
              cost of spelling the vocabulary: 8 bits per byte of each
              distinct token and one terminator byte, and an Elias
              gamma code for its count. A decoder holding only these
              bits can rebuild the text, so the figure is a real code
              length and is comparable with a compressor's output.
     floor    DEFLATE (RFC 1951) output in bits, measured live.
   ============================================================ */

/* ---------- tokens ---------- */

export const isSpace = (t) => !/\S/.test(t.t);
export const norm = (t) => t.t.trim().toLowerCase();
const gammaLen = (n) => 2 * Math.floor(Math.log2(Math.max(1, n))) + 1;

/* ---------- bits ---------- */

/**
 * Two-part code length of a token sequence.
 * per[i]: the bits charged to token i; a type's spelling and count cost is charged to its first occurrence,
 * so per sums to total and the strip shows where the bits are spent.
 */
export function twoPartBits(tokens) {
  const n = tokens.length;
  const counts = new Map();
  for (const t of tokens) counts.set(t.s, (counts.get(t.s) || 0) + 1);
  const per = new Float64Array(n);
  const seen = new Set();
  let data = 0, vocab = 0;
  for (let i = 0; i < n; i++) {
    const t = tokens[i];
    const c = counts.get(t.s);
    const d = -Math.log2(c / n);
    data += d;
    per[i] = d;
    if (!seen.has(t.s)) {
      seen.add(t.s);
      const v = 8 * (t.s.length + 1) + gammaLen(c); // t.s holds one code unit per byte
      vocab += v;
      per[i] += v;
    }
  }
  const header = gammaLen(counts.size + 1);
  return { total: data + vocab + header, data, vocab, header, per, n, types: counts.size };
}

/** DEFLATE (raw, RFC 1951) through CompressionStream, the browser's zlib at its default level. Bits, or null. */
export async function deflateBits(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  w.write(bytes);
  w.close();
  const ab = await new Response(cs.readable).arrayBuffer();
  return ab.byteLength * 8;
}

/** Below this many bytes DEFLATE's block header and code tables dominate, and the floor reads high. */
export const DEFLATE_SHORT_BYTES = 50;

/* ---------- alignment (LCS over normalised tokens) ---------- */

/**
 * Longest common subsequence (Wagner and Fischer 1974) over the non-space tokens of a and b, compared
 * lower-cased with leading space removed. Inputs past `cap` content tokens are not scored.
 * Returns ops over the full token arrays (keep i j, drop i, add j), kept flags per source token, and counts.
 */
export function align(a, b, cap = 1600) {
  const ia = [], ib = [];
  for (let i = 0; i < a.length; i++) if (!isSpace(a[i])) ia.push(i);
  for (let j = 0; j < b.length; j++) if (!isSpace(b[j])) ib.push(j);
  const truncA = ia.length > cap, truncB = ib.length > cap;
  const A = ia.slice(0, cap), B = ib.slice(0, cap);
  const N = A.length, M = B.length;
  const na = A.map((i) => norm(a[i])), nb = B.map((j) => norm(b[j]));
  const W = M + 1;
  const dp = new Uint16Array((N + 1) * W);
  for (let i = 1; i <= N; i++) {
    const ai = na[i - 1];
    for (let j = 1; j <= M; j++) {
      dp[i * W + j] = ai === nb[j - 1] ? dp[(i - 1) * W + j - 1] + 1 : Math.max(dp[(i - 1) * W + j], dp[i * W + j - 1]);
    }
  }
  const rev = [];
  let i = N, j = M;
  while (i > 0 && j > 0) {
    if (na[i - 1] === nb[j - 1]) { rev.push({ op: 'keep', i: A[i - 1], j: B[j - 1] }); i--; j--; }
    else if (dp[(i - 1) * W + j] >= dp[i * W + j - 1]) { rev.push({ op: 'drop', i: A[i - 1] }); i--; }
    else { rev.push({ op: 'add', j: B[j - 1] }); j--; }
  }
  while (i > 0) { rev.push({ op: 'drop', i: A[i - 1] }); i--; }
  while (j > 0) { rev.push({ op: 'add', j: B[j - 1] }); j--; }
  const ops = rev.reverse();
  const keptSrc = new Uint8Array(a.length);
  const keptRec = new Uint8Array(b.length);
  let kept = 0;
  for (const o of ops) if (o.op === 'keep') { keptSrc[o.i] = 1; keptRec[o.j] = 1; kept++; }
  return {
    ops, keptSrc, keptRec, kept, N, M,
    dropped: N - kept, invented: M - kept,
    fidelity: N ? kept / N : 0, precision: M ? kept / M : 0,
    scored: new Set(A), truncated: truncA || truncB,
  };
}

/* ---------- numbers, dates and times ---------- */

const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12 };
const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, dozen: 12, half: 0.5 };
const UNITS = [
  [/^(?:euros?|eur|€)$/i, 'eur'], [/^(?:dollars?|usd|\$)$/i, 'usd'], [/^(?:g|grams?)$/i, 'g'], [/^(?:kg|kilos?|kilograms?)$/i, 'kg'],
  [/^(?:ml|millilitres?|milliliters?)$/i, 'ml'], [/^(?:l|litres?|liters?)$/i, 'l'], [/^(?:mm)$/i, 'mm'], [/^(?:cm)$/i, 'cm'],
  [/^(?:km)$/i, 'km'], [/^(?:gb)$/i, 'GB'], [/^(?:mb)$/i, 'MB'], [/^(?:tb)$/i, 'TB'], [/^(?:ms|milliseconds?)$/i, 'ms'],
  [/^(?:s|secs?|seconds?)$/i, 's'], [/^(?:min|mins|minutes?)$/i, 'min'], [/^(?:h|hrs?|hours?)$/i, 'h'],
  [/^(?:days?)$/i, 'day'], [/^(?:nights?)$/i, 'night'], [/^(?:weeks?)$/i, 'week'], [/^(?:months?)$/i, 'month'],
  [/^(?:years?|yrs?)$/i, 'year'], [/^(?:vcpus?|cpus?|cores?)$/i, 'cpu'], [/^(?:people|persons?|of)$/i, 'people'],
  [/^(?:%|percent)$/i, '%'], [/^(?:teaspoons?|tsp)$/i, 'tsp'], [/^(?:tablespoons?|tbsp)$/i, 'tbsp'], [/^(?:balls?)$/i, 'ball'],
  [/^(?:x|times)$/i, 'x'],
];
const unitOf = (w) => { if (!w) return ''; for (const [re, u] of UNITS) if (re.test(w)) return u; return ''; };

function overlaps(spans, a, b) { return spans.some(([x, y]) => a < y && b > x); }

/**
 * Numbers, dates and times in a text, each with its span. A stated rule set, in this order:
 *   date range  "14 to 18 March", "14-18 March"      -> two dates
 *   date        "25 March", "March 25", "Feb 2023", "the 15th", a bare year 1900-2099
 *   time        "02:15"
 *   number      digits with thousands commas or decimals, or a number word (two, six ...), with the unit
 *               word that follows it when it is a known unit (euros, g, ml, s, minutes, GB, vCPUs ...)
 */
export function extractNumbers(text) {
  const out = [];
  const taken = [];
  const add = (u) => { if (!overlaps(taken, u.a, u.b)) { out.push(u); taken.push([u.a, u.b]); } };
  const T = String(text);
  let m;
  const range = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:to|-|–|and)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b(?:\\s+(\\d{4}))?`, 'gi');
  while ((m = range.exec(T))) {
    const mo = MONTHS[m[3].toLowerCase()], yr = m[4] ? +m[4] : undefined;
    const s1 = m.index, s2 = m.index + m[0].indexOf(m[2], m[1].length);
    add({ kind: 'date', day: +m[1], month: mo, year: yr, text: m[0], a: s1, b: s1 + m[0].length });
    out.push({ kind: 'date', day: +m[2], month: mo, year: yr, text: m[0], a: s2, b: s1 + m[0].length });
  }
  const dmy = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b(?:,?\\s+(\\d{4}))?`, 'gi');
  while ((m = dmy.exec(T))) add({ kind: 'date', day: +m[1], month: MONTHS[m[2].toLowerCase()], year: m[3] ? +m[3] : undefined, text: m[0], a: m.index, b: m.index + m[0].length });
  const mdy = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\d)(?:,?\\s+(\\d{4}))?`, 'gi');
  while ((m = mdy.exec(T))) { if (+m[2] <= 31) add({ kind: 'date', day: +m[2], month: MONTHS[m[1].toLowerCase()], year: m[3] ? +m[3] : undefined, text: m[0], a: m.index, b: m.index + m[0].length }); }
  const my = new RegExp(`\\b(${MONTH_RE})\\.?\\s*(\\d{4})\\b`, 'gi');
  while ((m = my.exec(T))) add({ kind: 'date', month: MONTHS[m[1].toLowerCase()], year: +m[2], text: m[0], a: m.index, b: m.index + m[0].length });
  const ord = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/gi;
  while ((m = ord.exec(T))) add({ kind: 'date', day: +m[1], text: m[0], a: m.index + m[0].indexOf(m[1]), b: m.index + m[0].length });
  const tm = /\b(\d{1,2}):(\d{2})\b/g;
  while ((m = tm.exec(T))) add({ kind: 'time', value: m[1].padStart(2, '0') + ':' + m[2], text: m[0], a: m.index, b: m.index + m[0].length });
  const yr = /\b(19\d{2}|20\d{2})\b/g;
  while ((m = yr.exec(T))) add({ kind: 'date', year: +m[1], text: m[0], a: m.index, b: m.index + m[0].length });
  // a unit may be attached ("40s", "30GB"); any other letters glued to the digits make it an identifier, not a number
  const num = /(?<![\w.:-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?!:\d)(\s*)(€|%|[A-Za-z]+)?/g;
  while ((m = num.exec(T))) {
    const v = parseFloat(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
    const u = unitOf(m[4]);
    if (m[4] && !m[3] && !u && m[4] !== '€' && m[4] !== '%') continue;
    if (!m[4] && /^\w/.test(T.slice(m.index + m[0].length))) continue;
    const len = u ? m[0].length : (m[1] + (m[2] ? '.' + m[2] : '')).length;
    add({ kind: 'number', value: v, unit: u, text: T.slice(m.index, m.index + len), a: m.index, b: m.index + len });
  }
  const words = new RegExp(`\\b(${Object.keys(NUMWORDS).join('|')})\\b(?:\\s+([A-Za-z%]+))?`, 'gi');
  while ((m = words.exec(T))) {
    const w = m[1].toLowerCase();
    const before = T.slice(Math.max(0, m.index - 8), m.index).toLowerCase();
    if (w === 'one' && /(each|no|any|every|some|the|this|that|which)\s+$/.test(before)) continue;
    if (w === 'half' && !m[2]) continue;
    const u = unitOf(m[2]);
    const len = u ? m[0].length : m[1].length;
    add({ kind: 'number', value: NUMWORDS[w], unit: u, text: T.slice(m.index, m.index + len), a: m.index, b: m.index + len });
  }
  return out.sort((x, y) => x.a - y.a);
}

export const unitKey = (u) =>
  u.kind === 'date' ? `date:${u.day ?? ''}/${u.month ?? ''}/${u.year ?? ''}` :
  u.kind === 'time' ? `time:${u.value}` :
  u.kind === 'number' ? `num:${u.value}${u.unit ? ' ' + u.unit : ''}` :
  `ent:${u.key}`;

/* ---------- named entities ---------- */

const MONTH_WORDS = new Set(Object.keys(MONTHS).map((m) => m[0].toUpperCase() + m.slice(1)));
const DAY_WORDS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const SPEAKERS = new Set(['USER', 'ASSISTANT', 'SYSTEM']);

/**
 * Named entities by a stated rule set:
 *   E1  a capitalised word inside a sentence (not its first word), except I, months and weekdays;
 *       neighbouring capitalised words join into one name
 *   E2  a capitalised first word of a sentence whose lower-case form is not one GPT-2 token (common English words
 *       are) and is never written lower-case in the same text
 *   E3  an upper-case word of 2 or more letters (acronyms: WAL, AEA), except speaker labels and units
 *   E4  an identifier: snake_case, a --flag, or camelCase
 * isCommon(word) answers E2; without it E2 is skipped.
 */
export function extractEntities(text, isCommon) {
  const T = String(text);
  const out = [];
  const taken = [];
  const add = (e) => { if (!overlaps(taken, e.a, e.b)) { out.push(e); taken.push([e.a, e.b]); } };
  let m;
  const ident = /(?:--[a-z][a-z0-9-]+|\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\b[a-z]+[A-Z][A-Za-z0-9]+\b)/g;
  while ((m = ident.exec(T))) add({ kind: 'entity', rule: 'E4', key: m[0].toLowerCase(), text: m[0], a: m.index, b: m.index + m[0].length });
  const caps = /\b[A-Z][A-Z0-9]+(?:[ -][A-Z][A-Z0-9]+)*\b/g;
  while ((m = caps.exec(T))) {
    const parts = m[0].split(/[ -]/).filter((w) => !SPEAKERS.has(w) && !/^(GB|MB|TB|KB|OK|AM|PM)$/.test(w) && /[A-Z]{2}/.test(w));
    if (!parts.length) continue;
    const s = parts.join(' ');
    const a = m.index + m[0].indexOf(parts[0]);
    add({ kind: 'entity', rule: 'E3', key: s.toLowerCase(), text: s, a, b: a + s.length });
  }
  const lowerSeen = new Set((T.match(/\b[a-z][a-z'-]+\b/g) || []));
  const word = /\b[A-Z][a-z][A-Za-z'-]*(?:\s+[A-Z][a-z][A-Za-z'-]*)*/g;
  while ((m = word.exec(T))) {
    const before = T.slice(0, m.index).replace(/[ \t]+$/, '');
    const sentenceStart = before === '' || /[.!?:;\n"(]$/.test(before) || /\b(?:USER|ASSISTANT|SYSTEM)\s*:$/.test(before);
    let words = m[0].split(/\s+/);
    let a = m.index;
    if (sentenceStart) {
      const first = words[0];
      const low = first.toLowerCase();
      const e2 = isCommon && !isCommon(low) && !lowerSeen.has(low);
      if (!e2) { a += first.length; words = words.slice(1); while (T[a] === ' ' || T[a] === '\t') a++; }
    }
    words = words.filter((w) => w !== 'I');
    if (!words.length) continue;
    if (words.length === 1 && (MONTH_WORDS.has(words[0]) || DAY_WORDS.has(words[0]))) continue;
    const s = T.slice(a, m.index + m[0].length).trim();
    if (!s || MONTH_WORDS.has(s)) continue;
    add({ kind: 'entity', rule: sentenceStart && a === m.index ? 'E2' : 'E1', key: s.toLowerCase(), text: s, a, b: a + s.length });
  }
  return out.sort((x, y) => x.a - y.a);
}

/* ---------- survival of units ---------- */

const sameDateFields = (s, r) => ['day', 'month', 'year'].every((f) => s[f] === undefined || s[f] === r[f]);
const shareDateField = (s, r) => ['day', 'month', 'year'].some((f) => s[f] !== undefined && s[f] === r[f]);

/**
 * Each distinct source unit (numbers, dates, times, entities) marked survived, altered or lost in the reconstruction.
 *   number  survived: the same value appears (and the same unit when both carry one); altered: same value, other unit
 *   date    survived: a date carries every field the source date has; altered: a date shares one of them
 *           ('Feb 2023' read back as '2023' is altered); lost: none
 *   time    survived: same hh:mm; lost otherwise
 *   entity  survived: the name appears as a whole word (case-insensitive); altered: a multi-word name appears in part,
 *           or an identifier appears with its separators changed; lost otherwise
 */
export function survival(srcUnits, recText, recUnits) {
  const groups = new Map();
  const united = srcUnits.filter((u) => !(u.kind === 'number' && !u.unit));
  const bare = srcUnits.filter((u) => u.kind === 'number' && !u.unit);
  for (const u of united.concat(bare)) {
    let k = unitKey(u);
    if (u.kind === 'number' && !u.unit) {
      const g = [...groups.values()].find((x) => x.unit.kind === 'number' && x.unit.value === u.value);
      if (g) k = g.key;
    }
    if (!groups.has(k)) groups.set(k, { key: k, unit: u, spans: [] });
    groups.get(k).spans.push([u.a, u.b]);
  }
  for (const g of groups.values()) g.spans.sort((x, y) => x[0] - y[0]);
  const rows = [];
  for (const g of groups.values()) {
    const u = g.unit;
    let status = 'lost', match = [];
    if (u.kind === 'number') {
      const same = recUnits.filter((r) => r.kind === 'number' && r.value === u.value);
      const exact = same.filter((r) => !u.unit || !r.unit || r.unit === u.unit);
      if (exact.length) { status = 'survived'; match = exact; } else if (same.length) { status = 'altered'; match = same; }
    } else if (u.kind === 'date') {
      const full = recUnits.filter((r) => r.kind === 'date' && sameDateFields(u, r));
      const part = recUnits.filter((r) => r.kind === 'date' && shareDateField(u, r));
      if (full.length) { status = 'survived'; match = full; } else if (part.length) { status = 'altered'; match = part; }
    } else if (u.kind === 'time') {
      const same = recUnits.filter((r) => r.kind === 'time' && r.value === u.value);
      if (same.length) { status = 'survived'; match = same; }
    } else if (u.kind === 'entity') {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const whole = (s) => { const re = new RegExp(`(?<![\\w-])${esc(s)}(?![\\w-])`, 'gi'); const hits = []; let mm; while ((mm = re.exec(recText))) hits.push({ a: mm.index, b: mm.index + mm[0].length }); return hits; };
      const hits = whole(u.text);
      if (hits.length) { status = 'survived'; match = hits; }
      else {
        const parts = u.text.split(/[\s_-]+/).filter((p) => p.length > 1 && !/^-+$/.test(p));
        const partHits = parts.length > 1 ? parts.flatMap((p) => whole(p)) : [];
        const loose = u.rule === 'E4' ? whole(u.text.replace(/^-+/, '').replace(/[_-]+/g, ' ')) : [];
        if (partHits.length || loose.length) { status = 'altered'; match = partHits.concat(loose); }
      }
    }
    rows.push({ key: g.key, kind: u.kind, rule: u.rule, text: u.text, spans: g.spans, status, recSpans: match.map((r) => [r.a, r.b]), unit: u });
  }
  return rows.sort((x, y) => x.spans[0][0] - y.spans[0][0]);
}

export function survivalSummary(rows) {
  const s = (kind) => {
    const r = rows.filter((x) => (kind === 'numbers' ? x.kind !== 'entity' : x.kind === 'entity'));
    const c = (st) => r.filter((x) => x.status === st).length;
    const total = r.length;
    return { total, survived: c('survived'), altered: c('altered'), lost: c('lost'),
      score: total ? (c('survived') + 0.5 * c('altered')) / total : null };
  };
  return { numbers: s('numbers'), entities: s('entities') };
}

/* ---------- turns ---------- */

const TURN_RE = /^[ \t]*\**(USER|ASSISTANT|SYSTEM|User|Assistant|[A-Z][A-Za-z]{1,15})\**[ \t]*:/gm;

/** Turns: a line that starts with a speaker label and a colon opens a turn; it runs to the next label. */
export function parseTurns(text) {
  const T = String(text);
  const heads = [...T.matchAll(TURN_RE)];
  return heads.map((h, k) => ({
    speaker: h[1].toUpperCase(),
    a: h.index, b: k + 1 < heads.length ? heads[k + 1].index : T.length,
  }));
}

function lcsLen(x, y) {
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++)
    dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[x.length][y.length];
}

/** One row per source turn: its lexical fidelity and its surviving numbers and entities; plus order and count. */
export function turnScores(srcText, recText, srcTokens, al, unitRows) {
  const st = parseTurns(srcText), rt = parseTurns(recText);
  const rows = st.map((t, k) => {
    let n = 0, kept = 0;
    srcTokens.forEach((tok, i) => { if (tok.a >= t.a && tok.a < t.b && al.scored.has(i)) { n++; kept += al.keptSrc[i]; } });
    const inTurn = unitRows.filter((r) => r.spans.some(([a]) => a >= t.a && a < t.b));
    const nums = inTurn.filter((r) => r.kind !== 'entity'), ents = inTurn.filter((r) => r.kind === 'entity');
    return {
      turn: k + 1, speaker: t.speaker, a: t.a, b: t.b, tokens: n, fidelity: n ? kept / n : 0,
      numbers: { total: nums.length, survived: nums.filter((r) => r.status === 'survived').length },
      entities: { total: ents.length, survived: ents.filter((r) => r.status === 'survived').length },
    };
  });
  const ss = st.map((t) => t.speaker), rs = rt.map((t) => t.speaker);
  const order = Math.max(ss.length, rs.length) ? lcsLen(ss, rs) / Math.max(ss.length, rs.length) : 1;
  return { rows, srcCount: st.length, recCount: rt.length, order, countMatch: st.length === rt.length };
}

/* ---------- who restored what: prior, capsule, decoder ---------- */

/**
 * Splits the source tokens the reconstruction kept into three shares of the scored source:
 *   prior    kept, and also produced by the same model rebuilding from an empty capsule
 *   literal  kept, present in the capsule itself, not in the prior
 *   decoder  kept, in neither: the model restored it from what the capsule implied
 */
export function splitShare(alRec, alCap, alPrior) {
  const N = alRec.N || 1;
  let prior = 0, literal = 0, decoder = 0;
  for (const i of alRec.scored) {
    if (!alRec.keptSrc[i]) continue;
    if (alPrior && alPrior.keptSrc[i]) prior++;
    else if (alCap.keptSrc[i]) literal++;
    else decoder++;
  }
  return { prior: prior / N, literal: literal / N, decoder: decoder / N };
}

/* ---------- baselines at a matched bit budget ---------- */

const joinTokens = (toks) => toks.map((t) => t.t).join('').replace(/\s+/g, ' ').trim();

/** The longest prefix of the source whose two-part code fits in `budget` bits. */
export function headTruncation(srcTokens, budget, retokenize) {
  let lo = 0, hi = srcTokens.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const text = joinTokens(srcTokens.slice(0, mid));
    if (twoPartBits(retokenize(text)).total <= budget) lo = mid; else hi = mid - 1;
  }
  return joinTokens(srcTokens.slice(0, lo));
}

/**
 * Extractive capsule: the source tokens with the highest bit cost (per[]) kept in their original order, as many as fit
 * in `budget` bits (the token-pruning idea of LLMLingua, Jiang et al. 2023, run with this page's bit model).
 */
export function extractive(srcTokens, per, budget, retokenize) {
  const idx = srcTokens.map((t, i) => i).filter((i) => !isSpace(srcTokens[i])).sort((x, y) => per[y] - per[x] || x - y);
  const build = (k) => joinTokens(idx.slice(0, k).sort((x, y) => x - y).map((i) => srcTokens[i]));
  let lo = 0, hi = idx.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (twoPartBits(retokenize(build(mid))).total <= budget) lo = mid; else hi = mid - 1;
  }
  return build(lo);
}

/**
 * The offline engine's capsule: source tokens in their original order, up to a word budget, chosen facts first.
 * Tokens inside a number, date or name (spans) rank above all others; within each group the most expensive go first.
 */
export function extractiveWords(srcTokens, per, words, spans = []) {
  const inFact = (t) => spans.some(([a, b]) => t.a < b && t.b > a);
  const rank = (i) => (inFact(srcTokens[i]) ? 1e6 : 0) + per[i];
  const idx = srcTokens.map((t, i) => i).filter((i) => /[\p{L}\p{N}]/u.test(srcTokens[i].t)).sort((x, y) => rank(y) - rank(x) || x - y);
  const keep = idx.slice(0, Math.max(1, words)).sort((x, y) => x - y);
  return joinTokens(keep.map((i) => srcTokens[i]));
}

/* ---------- distortion registry ----------
   Every distortion the plot, the tables and the exports offer. A new measure is one entry here: the select, the axis
   label, the level table and the CSV pick it up. of(m) reads a scored run and returns 0..1, or null when it does not apply. */
export const DISTORTIONS = [
  { id: 'lexical', label: 'lexical (1 - tokens kept)', axis: 'distortion: 1 - lexical fidelity', of: (m) => 1 - m.lex.fidelity },
  { id: 'numbers', label: 'numbers and dates lost', axis: 'distortion: numbers and dates lost', of: (m) => (m.summary.numbers.score == null ? null : 1 - m.summary.numbers.score) },
  { id: 'entities', label: 'names lost', axis: 'distortion: names lost', of: (m) => (m.summary.entities.score == null ? null : 1 - m.summary.entities.score) },
  { id: 'meaning', label: 'meaning (numbers and names)', axis: 'distortion: meaning (numbers and names)',
    of: (m) => { const p = [m.summary.numbers.score, m.summary.entities.score].filter((x) => x != null); return p.length ? 1 - p.reduce((a, b) => a + b, 0) / p.length : null; } },
  { id: 'turns', label: 'turn order lost', axis: 'distortion: 1 - speaker order kept', of: (m) => 1 - m.turns.order },
];

/* ---------- one run, fully scored ---------- */

/**
 * Scores one round trip. ctx: { tokenize(text) -> tokens, isCommon(word) -> bool }.
 * run: { source, capsule, rebuild, prior? (an empty-capsule reconstruction by the same model) }.
 * Returns a plain measurement object (no DOM); the views and exports read only this.
 */
export function scoreRun(run, ctx, limits = {}) {
  const cap = limits.scoreTokens || 1600;
  const tk = ctx.tokenize;
  const src = tk(run.source), capT = tk(run.capsule || ''), rec = tk(run.rebuild || '');
  const bSrc = twoPartBits(src), bCap = twoPartBits(capT);
  const al = align(src, rec, cap);
  const alCap = align(src, capT, cap);
  const alPrior = run.prior != null ? align(src, tk(run.prior), cap) : null;
  const srcUnits = extractNumbers(run.source).concat(extractEntities(run.source, ctx.isCommon));
  const recUnits = extractNumbers(run.rebuild || '').concat(extractEntities(run.rebuild || '', ctx.isCommon));
  const units = survival(srcUnits, run.rebuild || '', recUnits);
  const capUnits = survival(srcUnits, run.capsule || '', extractNumbers(run.capsule || '').concat(extractEntities(run.capsule || '', ctx.isCommon)));
  const sum = survivalSummary(units);
  const turns = turnScores(run.source, run.rebuild || '', src, al, units);
  const out = {
    tokens: { src, cap: capT, rec },
    bits: { src: bSrc, cap: bCap },
    rate: bSrc.total ? bCap.total / bSrc.total : 0,
    lex: al, literal: alCap, prior: alPrior,
    units, capUnits, summary: sum, capSummary: survivalSummary(capUnits), turns,
    split: splitShare(al, alCap, alPrior),
    truncated: al.truncated,
  };
  out.distortion = Object.fromEntries(DISTORTIONS.map((d) => [d.id, d.of(out)]));
  return out;
}

/** The compact numbers a run file stores as its snapshot (tests.mjs re-derives them and compares). */
export function snapshot(m) {
  const r = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
  return {
    srcBits: r(m.bits.src.total), capBits: r(m.bits.cap.total), rate: r(m.rate),
    fidelity: r(m.lex.fidelity), kept: m.lex.kept, dropped: m.lex.dropped, invented: m.lex.invented,
    numbers: m.summary.numbers, entities: m.summary.entities,
    turns: { src: m.turns.srcCount, rec: m.turns.recCount, order: r(m.turns.order) },
    split: { prior: r(m.split.prior), literal: r(m.split.literal), decoder: r(m.split.decoder) },
  };
}
