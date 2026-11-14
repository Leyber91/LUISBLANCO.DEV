#!/usr/bin/env node
/* ============================================================
   tools/levels.mjs — the labs' level system, as data and arithmetic.

   Each lab owns labs/levels/<id>.json: its own axes, each with a
   measurable metric and an eleven-rung ladder (levels 0 to 10)
   written for that lab, and the level each generation reached on
   each axis, with evidence. The ladders are fixed before a
   generation is graded, by someone other than its builder.

   Commands (Node 18+, no dependencies):
     node tools/levels.mjs check [<id>]   validate every file, or one; exit 1 on any error
     node tools/levels.mjs table          print the ratings table (markdown)
     node tools/levels.mjs sheet <id>     print one lab's generation sheet
     node tools/levels.mjs next [<id>]    the next rung to climb, per lab
     node tools/levels.mjs write          regenerate the table in LABS_LEVELS.md
                                          and labs/assets/js/config/levels.data.js
     node tools/levels.mjs selftest       run the validator on planted faults

   The arithmetic (stated in LABS_LEVELS.md):
     lab level = min(median of its axis levels, weakest axis + 2)
     The median is the lower median when the count is even.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'labs', 'levels');
const MD = path.join(ROOT, 'LABS_LEVELS.md');
const DATA_JS = path.join(ROOT, 'labs', 'assets', 'js', 'config', 'levels.data.js');

export const FRAMES = [
  'model', 'graphics', 'style', 'interaction', 'data',
  'intelligence', 'explanation', 'performance', 'architecture',
];
const GEN_RE = /^G(\d+)$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/* ---------- arithmetic ---------- */

export function lowerMedian(nums) {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

export function labLevel(levels) {
  if (!levels.length) return null;
  const med = lowerMedian(levels);
  const min = Math.min(...levels);
  return Math.min(med, min + 2);
}

/* Generations present in a lab, in order (G0, G1, ...). */
export function gens(lab) {
  const set = new Set();
  for (const a of lab.axes || []) for (const g of Object.keys(a.levels || {})) set.add(g);
  return [...set].filter((g) => GEN_RE.test(g)).sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
}

export function genSummary(lab, g) {
  const rows = (lab.axes || []).filter((a) => a.levels?.[g]);
  if (rows.length !== (lab.axes || []).length) return null; // a generation counts only when every axis is graded
  const lv = rows.map((a) => a.levels[g].level);
  const med = lowerMedian(lv);
  const min = Math.min(...lv);
  const weakest = rows.filter((a) => a.levels[g].level === min).map((a) => a.id);
  return { gen: g, level: Math.min(med, min + 2), median: med, min, weakest, capped: min + 2 < med };
}

/* The next rung: the weakest axis at the latest graded generation, and the text of its next rung. */
export function nextRungs(lab) {
  const gs = gens(lab).filter((g) => genSummary(lab, g));
  if (!gs.length) return [];
  const g = gs[gs.length - 1];
  const sum = genSummary(lab, g);
  return lab.axes
    .filter((a) => a.levels[g].level === sum.min && sum.min < 10)
    .map((a) => ({ axis: a.id, name: a.name, from: sum.min, to: sum.min + 1, rung: a.ladder[sum.min + 1] }));
}

/* ---------- validation ---------- */

export function validate(lab, file = '') {
  const errs = [];
  const e = (m) => errs.push(`${file || lab?.id || '?'}: ${m}`);
  if (!lab || typeof lab !== 'object') { e('not an object'); return errs; }
  if (!ID_RE.test(lab.id || '')) e('id must be kebab-case');
  if (file && path.basename(file, '.json') !== lab.id) e(`file name must be ${lab.id}.json`);
  if (!lab.title || typeof lab.title !== 'string') e('title missing');
  if (!('page' in lab)) e('page missing (null for a lab with no page yet)');
  if (!lab.thesis || lab.thesis.length < 20) e('thesis missing or too short (what the lab is at level 10)');
  const axes = lab.axes;
  if (!Array.isArray(axes)) { e('axes must be an array'); return errs; }
  if (axes.length < 6 || axes.length > 12) e(`axes: ${axes.length}, must be 6 to 12`);
  const ids = new Set();
  const frames = new Set();
  for (const [i, a] of axes.entries()) {
    const at = `axis ${a?.id || i}`;
    if (!ID_RE.test(a?.id || '')) e(`${at}: id must be kebab-case`);
    if (ids.has(a.id)) e(`${at}: duplicate id`);
    ids.add(a.id);
    if (!a.name) e(`${at}: name missing`);
    if (!FRAMES.includes(a.frame)) e(`${at}: frame "${a.frame}" is not one of ${FRAMES.join(', ')}`);
    else frames.add(a.frame);
    if (!a.metric || a.metric.length < 25) e(`${at}: metric missing or too short (what is measured, unit, how)`);
    if (!Array.isArray(a.ladder) || a.ladder.length !== 11) e(`${at}: ladder must have 11 rungs (levels 0 to 10)`);
    else {
      a.ladder.forEach((r, k) => { if (typeof r !== 'string' || r.trim().length < 12) e(`${at}: rung ${k} empty or too short`); });
      if (new Set(a.ladder.map((r) => r.trim().toLowerCase())).size !== 11) e(`${at}: rungs must be distinct`);
    }
    const lv = a.levels;
    if (!lv || typeof lv !== 'object' || !lv.G0) e(`${at}: levels.G0 missing`);
    for (const [g, v] of Object.entries(lv || {})) {
      if (!GEN_RE.test(g)) { e(`${at}: generation key "${g}" must look like G0, G1`); continue; }
      if (!Number.isInteger(v?.level) || v.level < 0 || v.level > 10) e(`${at} ${g}: level must be an integer 0 to 10`);
      if (!v?.evidence || v.evidence.length < 15) e(`${at} ${g}: evidence missing or too short`);
    }
  }
  for (const f of FRAMES) if (!frames.has(f)) e(`no axis rolls up to frame "${f}"`);
  if (lab.history && !Array.isArray(lab.history)) e('history must be an array');
  return errs;
}

/* ---------- io ---------- */

function loadAll() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'atlas.json').sort().map((f) => {
    const file = path.join(DIR, f);
    try { return { file: f, lab: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
    catch (err) { return { file: f, lab: null, parseError: err.message }; }
  });
}

function hubOrder() {
  // Order labs as the hub lists them; unknown ids go last.
  try {
    const src = fs.readFileSync(path.join(ROOT, 'labs', 'assets', 'js', 'config', 'site.config.js'), 'utf8');
    return [...src.matchAll(/\{\s*id:\s*'([a-z0-9-]+)',\s*title:/g)].map((m) => m[1]);
  } catch { return []; }
}

function sorted(items) {
  const order = hubOrder();
  const rank = (id) => (id === 'hub' ? -1 : order.indexOf(id) < 0 ? 999 : order.indexOf(id));
  return items.slice().sort((a, b) => rank(a.lab.id) - rank(b.lab.id) || a.lab.id.localeCompare(b.lab.id));
}

/* ---------- renderers ---------- */

function table(items) {
  const lines = [
    '| Lab | Axes | G0 | Latest | Level | Weakest axis | Next rung |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const { lab } of items) {
    const gs = gens(lab).map((g) => genSummary(lab, g)).filter(Boolean);
    const g0 = gs[0];
    const last = gs[gs.length - 1];
    const nx = nextRungs(lab)[0];
    const lvl = (s) => (s ? `${s.level}${s.capped ? ' (capped)' : ''}` : '-');
    lines.push(`| ${lab.title} | ${lab.axes.length} | ${lvl(g0)} | ${last ? last.gen : '-'} | ${lvl(last)} | ` +
      `${last ? last.weakest.join(', ') + ' at ' + last.min : '-'} | ${nx ? nx.rung.replace(/\|/g, '/') : '-'} |`);
  }
  return lines.join('\n');
}

function sheet(lab) {
  const gs = gens(lab);
  const head = ['axis', 'frame', ...gs, gs.length > 1 ? 'delta' : null].filter(Boolean);
  const w = [28, 13, ...gs.map(() => 5), 6];
  const pad = (s, n) => String(s).padEnd(n);
  const out = [`LEVEL SHEET: ${lab.title}`, lab.thesis, '', head.map((h, i) => pad(h, w[i])).join('')];
  for (const a of lab.axes) {
    const vals = gs.map((g) => a.levels[g]?.level ?? '-');
    const d = gs.length > 1 && typeof vals[0] === 'number' && typeof vals[vals.length - 1] === 'number'
      ? (vals[vals.length - 1] - vals[0] >= 0 ? '+' : '') + (vals[vals.length - 1] - vals[0]) : '';
    out.push([pad(a.name.slice(0, 27), 28), pad(a.frame, 13), ...vals.map((v) => pad(v, 5)), d].join(''));
  }
  out.push('');
  for (const g of gs) {
    const s = genSummary(lab, g);
    if (s) out.push(`${g}: level ${s.level} (median ${s.median}, weakest ${s.min}: ${s.weakest.join(', ')}${s.capped ? '; capped by the weakest axis' : ''})`);
    else out.push(`${g}: incomplete (not every axis graded)`);
  }
  const nx = nextRungs(lab);
  if (nx.length) {
    out.push('', 'NEXT RUNG');
    for (const n of nx) out.push(`  ${n.name} ${n.from} -> ${n.to}: ${n.rung}`);
  }
  return out.join('\n');
}

function dataModule(items) {
  const rows = items.map(({ lab }) => {
    const gs = gens(lab).map((g) => genSummary(lab, g)).filter(Boolean);
    return {
      id: lab.id, title: lab.title, page: lab.page, thesis: lab.thesis,
      generations: gs.map((s) => ({ gen: s.gen, level: s.level, median: s.median, min: s.min })),
      axes: lab.axes.map((a) => ({
        id: a.id, name: a.name, frame: a.frame,
        levels: Object.fromEntries(Object.entries(a.levels).map(([g, v]) => [g, v.level])),
      })),
      next: nextRungs(lab).map((n) => ({ axis: n.axis, to: n.to, rung: n.rung })),
    };
  });
  return '/* Generated by tools/levels.mjs from labs/levels/*.json. Do not edit by hand. */\n' +
    'export const LEVELS = ' + JSON.stringify(rows) + ';\n';
}

const BEGIN = '<!-- levels:table:begin -->';
const END = '<!-- levels:table:end -->';

function writeAll(items) {
  const md = fs.readFileSync(MD, 'utf8');
  const block = `${BEGIN}\n${table(items)}\n${END}`;
  const next = md.includes(BEGIN) && md.includes(END)
    ? md.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block)
    : md.replace(/\n## Generation sheets/, `\n## Ratings by lab axes\n\n${block}\n\n## Generation sheets`);
  fs.writeFileSync(MD, next);
  fs.writeFileSync(DATA_JS, dataModule(items));
}

/* ---------- selftest: the validator must catch planted faults ---------- */

function selftest() {
  const ladder = Array.from({ length: 11 }, (_, i) => `rung ${i}: a concrete state number ${i}`);
  const axis = (id, frame, level) => ({
    id, name: id, frame, metric: 'measured quantity with its unit and the way to measure it',
    ladder, levels: { G0: { level, evidence: 'evidence of at least fifteen chars' } },
  });
  const good = {
    id: 'demo', title: 'Demo', page: null, thesis: 'what this demo lab would be at level ten',
    axes: FRAMES.map((f, i) => axis('a' + i, f, 3)),
  };
  const cases = [
    ['valid lab', good, 0],
    ['missing frame', { ...good, axes: good.axes.slice(0, 8).concat(axis('x', 'model', 3)) }, 1],
    ['ten rungs', { ...good, axes: good.axes.map((a, i) => (i ? a : { ...a, ladder: ladder.slice(0, 10) })) }, 1],
    ['level 11', { ...good, axes: good.axes.map((a, i) => (i ? a : { ...a, levels: { G0: { level: 11, evidence: 'evidence of at least fifteen chars' } } })) }, 1],
    ['no evidence', { ...good, axes: good.axes.map((a, i) => (i ? a : { ...a, levels: { G0: { level: 2, evidence: '' } } })) }, 1],
    ['duplicate rungs', { ...good, axes: good.axes.map((a, i) => (i ? a : { ...a, ladder: ladder.map(() => 'the same rung text') })) }, 1],
    ['five axes', { ...good, axes: good.axes.slice(0, 5) }, 1],
  ];
  let pass = 0;
  for (const [name, lab, wantErrors] of cases) {
    const n = validate(lab).length;
    const ok = wantErrors === 0 ? n === 0 : n > 0;
    pass += ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${n} errors)`);
  }
  // arithmetic
  const arith = [
    [[3, 3, 3, 3, 3, 3, 3, 3, 3], 3],
    [[7, 7, 7, 7, 7, 7, 7, 7, 1], 3],     // one axis at 1 caps a median-7 lab at 3
    [[5, 5, 6, 8, 9, 9], 6],              // lower median of six, no cap
    [[2, 4, 6, 8, 9, 9], 4],              // lower median 6, capped by weakest 2 -> 4
    [[5, 6, 7, 8, 8, 8, 9, 9, 3], 5],     // median 8, weakest 3 -> 5
  ];
  for (const [lv, want] of arith) {
    const got = labLevel(lv);
    const ok = got === want;
    pass += ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} labLevel(${lv.join(',')}) = ${got}, want ${want}`);
  }
  const total = cases.length + arith.length;
  console.log(`levels selftest: ${pass} of ${total}`);
  return pass === total;
}

/* ---------- cli ---------- */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd = 'check', arg] = process.argv.slice(2);
  if (cmd === 'selftest') process.exit(selftest() ? 0 : 1);
  let all = loadAll();
  if (cmd === 'check' && arg) all = all.filter((x) => x.file === arg + '.json');
  if (cmd === 'check' && arg && !all.length) { console.log(`levels: no file labs/levels/${arg}.json`); process.exit(1); }
  const errs = [];
  for (const { file, lab, parseError } of all) {
    if (parseError) errs.push(`${file}: JSON parse error: ${parseError}`);
    else errs.push(...validate(lab, file));
  }
  const good = sorted(all.filter((x) => x.lab && !x.parseError));
  if (cmd === 'check') {
    if (errs.length) { console.log(errs.join('\n')); console.log(`levels: ${errs.length} errors in ${all.length} files`); process.exit(1); }
    console.log(`levels: ${all.length} labs, 0 errors`);
  } else if (cmd === 'table') {
    console.log(table(good));
  } else if (cmd === 'sheet') {
    const it = good.find((x) => x.lab.id === arg);
    if (!it) { console.error('no lab ' + arg); process.exit(1); }
    console.log(sheet(it.lab));
  } else if (cmd === 'next') {
    for (const { lab } of good.filter((x) => !arg || x.lab.id === arg)) {
      for (const n of nextRungs(lab)) console.log(`${lab.id} · ${n.name} ${n.from}->${n.to}: ${n.rung}`);
    }
  } else if (cmd === 'write') {
    if (errs.length) { console.log(errs.join('\n')); console.log('not written: fix the errors first'); process.exit(1); }
    writeAll(good);
    console.log(`wrote ${path.relative(ROOT, MD)} and ${path.relative(ROOT, DATA_JS)} (${good.length} labs)`);
  } else {
    console.error('commands: check | table | sheet <id> | next [<id>] | write | selftest');
    process.exit(2);
  }
}
