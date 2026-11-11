/* Check data/events.json against data/events.schema.json and the cross-references the schema
   cannot express (sources, physics, causes, parallels, characters, the ceiling, ESTABLISHED and
   THEORETICAL physics carrying a DOI or saying why not). No dependencies.
   node labs/assets/js/timeline/checks/check-data.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const lab = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(lab, 'data', 'events.json'), 'utf8'));
const schema = JSON.parse(readFileSync(join(lab, 'data', 'events.schema.json'), 'utf8'));
const ceiling = JSON.parse(readFileSync(join(lab, 'data', 'ceiling.json'), 'utf8')).ceiling.tier;
const errs = [];

/* a small validator for the subset of JSON Schema the schema uses */
function check(v, s, path) {
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: ${JSON.stringify(v)} not in ${JSON.stringify(s.enum)}`);
  const types = s.type ? [].concat(s.type) : null;
  const typeOf = (x) => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  if (types && !types.some((t) => t === typeOf(v) || (t === 'number' && typeof v === 'number'))) { errs.push(`${path}: type ${typeOf(v)}, expected ${types.join('|')}`); return; }
  if (s.pattern && typeof v === 'string' && !new RegExp(s.pattern).test(v)) errs.push(`${path}: does not match ${s.pattern}`);
  if (s.maxLength != null && typeof v === 'string' && v.length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength}`);
  if (s.minimum != null && typeof v === 'number' && v < s.minimum) errs.push(`${path}: below ${s.minimum}`);
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) errs.push(`${path}: ${v.length} items, at least ${s.minItems} required`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => check(x, s.items, `${path}[${i}]`));
  } else if (v && typeof v === 'object') {
    for (const r of s.required || []) if (!(r in v)) errs.push(`${path}: missing ${r}`);
    for (const [k, x] of Object.entries(v)) {
      if (s.properties?.[k]) check(x, s.properties[k], `${path}.${k}`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') check(x, s.additionalProperties, `${path}.${k}`);
    }
  }
}
check(data, schema, 'data');

/* cross-references */
const ids = new Set(data.events.map((e) => e.id));
if (ids.size !== data.events.length) errs.push('events: duplicate ids');
const chars = new Set(data.characters.map((c) => c.id));
for (const e of data.events) {
  if (!data.sources[e.src]) errs.push(`${e.id}: unknown source ${e.src}`);
  for (const p of e.phys || []) if (!data.physics[p]) errs.push(`${e.id}: unknown physics ${p}`);
  for (const c of e.cause || []) if (!ids.has(c.id)) errs.push(`${e.id}: unknown cause ${c.id}`);
  if (e.par && !ids.has(e.par)) errs.push(`${e.id}: unknown parallel ${e.par}`);
  for (const w of e.who || []) if (!chars.has(w)) errs.push(`${e.id}: unknown character ${w}`);
  if (e.tier > ceiling) errs.push(`${e.id}: tier ${e.tier} above the ceiling ${ceiling}`);
  if ((e.y0 != null) !== (e.y1 != null) || (e.y0 != null && !(e.y0 <= e.y && e.y <= e.y1))) errs.push(`${e.id}: range does not contain its year`);
  if (e.tag === 'REAL' && e.src !== 'real' && !/real|published/.test(e.sec) && !e.real) errs.push(`${e.id}: REAL tag without real flag`);
}
for (const [k, p] of Object.entries(data.physics)) {
  if (!data.sources[p.src]) errs.push(`physics ${k}: unknown source ${p.src}`);
  if (['ESTABLISHED', 'THEORETICAL'].includes(p.rung) && !p.calc) {
    if (!p.refs?.length) errs.push(`physics ${k}: ${p.rung} without a reference`);
    for (const r of p.refs || []) if (!r.doi && !r.book) errs.push(`physics ${k}: reference without a DOI and not marked as a book`);
  }
}
for (const c of data.characters) if (c.tier > ceiling) errs.push(`character ${c.id}: above the ceiling`);

for (const e of errs) console.log(e);
console.log(`check-data: ${data.events.length} events, ${Object.keys(data.physics).length} physics notes, ${errs.length} errors`);
process.exit(errs.length ? 1 : 0);
