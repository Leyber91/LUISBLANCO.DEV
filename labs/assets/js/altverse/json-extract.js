/* ============================================================
   altverse/json-extract.js — pull a JSON object/array out of a
   model response that may carry prose, ```json fences, or leaked
   reasoning. Brace-depth scan for the first balanced value, with
   one lenient repair pass and length-truncation detection.
   Returns { ok, obj?, error?, truncated? }.
   ============================================================ */

export function extractJSON(text) {
  if (!text || typeof text !== 'string') return { ok: false, error: 'empty response' };
  let s = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  const start = s.search(/[\{\[]/);
  if (start < 0) return { ok: false, error: 'no JSON found' };

  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return { ok: false, error: 'unbalanced JSON (likely truncated)', truncated: true };

  const frag = s.slice(start, end + 1);
  try {
    return { ok: true, obj: JSON.parse(frag) };
  } catch (_) {
    // lenient: strip trailing commas, normalise smart quotes
    const fixed = frag
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    try { return { ok: true, obj: JSON.parse(fixed) }; }
    catch (e) { return { ok: false, error: 'parse failed: ' + e.message, raw: frag }; }
  }
}
