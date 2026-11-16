/* ============================================================
   dataspace/run-guard.js — a run that arrives in a share link or
   in an imported file is made harmless before the page uses it.

   The page writes a run's fields into its markup. A run from the
   lab's own files is trusted. A run packed into a link (#x=) or
   read from a file a visitor imports is written by whoever made
   the link or the file. On 2026-11-14 an audit showed that such a
   run could carry markup in a field the page printed as a number,
   and so run script on the site's origin when the page loaded.

   cleanRun keeps what the run schema names (run.schema.json):
   - the level must be a whole number from 1 to 5, or the run is
     refused;
   - numbers are numbers or they are dropped;
   - the capsule, the rebuild and the source are the measured text
     and stay exactly as written (the views escape them);
   - every other string is made inert, and fields the schema does
     not name are dropped, as are the stored measures and call
     records: the page computes its own.
   ============================================================ */

import { inert, noTags, finite, intIn } from '../kit/guard.js';

const TEXT_MAX = 120000;                         // characters of a capsule, a rebuild or a source
const text = (v) => (typeof v === 'string' ? v.slice(0, TEXT_MAX) : null);
const word = (v, max = 160) => (v == null ? undefined : inert(String(v)).slice(0, max));
const PROVENANCE_WORDS = ['route', 'model', 'digest', 'quant', 'params', 'ollamaVersion', 'date', 'promptVersion', 'compressCall', 'rebuildCall'];

export function cleanRun(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const level = intIn(r.level, 1, 5);
  if (level == null) return null;
  const pv = r.provenance && typeof r.provenance === 'object' && !Array.isArray(r.provenance) ? r.provenance : {};
  const provenance = {};
  for (const k of PROVENANCE_WORDS) if (pv[k] != null) provenance[k] = word(pv[k]);
  for (const k of ['seed', 'repeat']) { const n = intIn(pv[k], 0, 1e9); if (n != null) provenance[k] = n; }
  const temp = finite(pv.temperature);
  if (temp != null) provenance.temperature = temp;
  const out = {
    id: word(r.id || 'run', 120), kind: word(r.kind || 'imported', 40), level,
    budgetWords: intIn(r.budgetWords, 0, 1e7) ?? 0,
    capsule: text(r.capsule), rebuild: text(r.rebuild), provenance,
  };
  if (r.schema != null) out.schema = word(r.schema, 60);
  if (r.preset != null) out.preset = word(r.preset, 60);
  if (typeof r.source === 'string') out.source = text(r.source);
  if (r.status != null) out.status = word(r.status, 40);
  if (r.note != null) out.note = noTags(String(r.note)).slice(0, 600);
  return out;
}
