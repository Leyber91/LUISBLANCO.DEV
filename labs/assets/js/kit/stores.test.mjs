/* ============================================================
   kit/stores.test.mjs — every store a lab opens in the browser is
   one the privacy page knows.

     node labs/assets/js/kit/stores.test.mjs

   The privacy page promises to name, export and erase what the
   labs keep in the browser. It does that from a list (the built
   labs/assets/js/os/extras.js, source labs-src/os/extras.ts). A
   list drifts: on 2026-11-14 six labs kept things in localStorage
   that the page's erase could not reach, one of them a visitor's
   own model key. This test fails when
     - a lab's code opens localStorage or IndexedDB and is not
       named below with the store it opens;
     - a store on the list has no lab file that carries its key,
       or the key in the file no longer matches the list;
     - a name below points at a file that stopped using storage.
   New state belongs in Labs OS (os.progress), which the privacy
   page already covers. A lab that must keep its own key adds the
   store to extras.ts and its file here, in the same change.

   The audit is a function of plain inputs, and the last block
   feeds it doctored inputs to prove each finding can fire.
   ============================================================ */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA_STORES } from '../os/extras.js';

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABS = path.resolve(JS, '..', '..');

/* The lab files that open the browser's storage, and the stores each one opens. */
const OPENS = {
  'ai/llm.js': ['model-key', 'model-wait'],
  'altverse/store.js': ['altverse-worlds'],
  'token-ekg/engine/traces.js': ['token-ekg-traces'],
  'trending/history.js': ['trending-history'],
  'honesty-decoder/model.js': ['honesty-route'],
};
/* The file that carries each store's key as a literal (a lab may hold it in a config file). */
const KEY_IN = {
  'model-key': 'ai/llm.js',
  'model-wait': 'ai/llm.js',
  'altverse-worlds': 'altverse/store.js',
  'token-ekg-traces': 'token-ekg/config.js',
  'trending-history': 'trending/constants.js',
  'honesty-route': 'honesty-decoder/config.js',
};
/* Stores no lab writes any more. A browser may still hold them, so the privacy page still erases them. */
const LEGACY = ['exomania-saved'];
/* Files whose text names storage without opening it: the platform itself, and the raters' evidence prose. */
const NOT_LAB_CODE = (rel) => rel.startsWith('os/') || rel === 'config/levels.data.js' || /(^|\/)(tests?|verify|selftest|self-test|check)\.mjs$/.test(rel) || rel.endsWith('.test.mjs');

/* Code without its comments, well enough for this search: block comments, then whole-line and trailing line comments. */
export const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[\s;{}(),])\/\/.*$/, '$1')).join('\n');
export const opensStorage = (text) => /\b(localStorage|indexedDB)\b/.test(code(text));

/**
 * files: Map of path (relative to labs/assets/js, or a page as "page:<name>") to text. Returns findings as strings.
 */
export function audit({ files, stores, opens, keyIn, legacy, labIds }) {
  const out = [];
  const byId = new Map(stores.map((s) => [s.id, s]));
  for (const [rel, text] of files) {
    if (NOT_LAB_CODE(rel)) continue;
    if (opensStorage(text) && !opens[rel]) out.push(`${rel} opens the browser's storage and the privacy page does not know of it`);
  }
  for (const [rel, ids] of Object.entries(opens)) {
    const text = files.get(rel);
    if (text === undefined) { out.push(`${rel} is named here and does not exist`); continue; }
    if (!opensStorage(text)) out.push(`${rel} is named here and no longer opens the browser's storage`);
    for (const id of ids) if (!byId.has(id)) out.push(`${rel} names the store "${id}", which is not on the list`);
  }
  const opened = new Set(Object.values(opens).flat());
  for (const s of stores) {
    if (s.lab !== null && !labIds.has(s.lab)) out.push(`the store "${s.id}" names the lab "${s.lab}", which the hub does not list`);
    if (!s.managedHere) continue;
    if (legacy.includes(s.id)) { if (opened.has(s.id) || keyIn[s.id]) out.push(`the store "${s.id}" is called legacy and a lab still opens it`); continue; }
    if (!opened.has(s.id)) out.push(`the store "${s.id}" is on the list and no lab file is named as opening it`);
    const where = keyIn[s.id];
    const text = where === undefined ? undefined : files.get(where);
    if (text === undefined) { out.push(`the store "${s.id}" has no file that carries its key`); continue; }
    for (const k of [...s.keys, ...s.prefixes]) if (!text.includes(`'${k}'`) && !text.includes(`"${k}"`)) out.push(`the key "${k}" of "${s.id}" is not in ${where}: the list and the lab disagree`);
  }
  for (const id of Object.keys(keyIn)) if (!byId.has(id)) out.push(`a key file is named for "${id}", which is not on the list`);
  for (const id of legacy) if (!byId.has(id)) out.push(`"${id}" is called legacy and is not on the list`);
  return out;
}

/* ---------------- the real tree ---------------- */
function walk(dir, base = dir, out = new Map()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.set(path.relative(base, p).split(path.sep).join('/'), readFileSync(p, 'utf8'));
  }
  return out;
}
const files = walk(JS);
for (const e of readdirSync(LABS, { withFileTypes: true })) {
  if (!e.isFile() || !e.name.endsWith('.html')) continue;
  const html = readFileSync(path.join(LABS, e.name), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  if (inline.trim()) files.set(`page:${e.name}`, inline);
}
const labIds = new Set([...files.get('config/site.config.js').matchAll(/\bid:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]));

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };

const real = audit({ files, stores: EXTRA_STORES, opens: OPENS, keyIn: KEY_IN, legacy: LEGACY, labIds });
ok(real.length === 0, `the labs and the privacy page's list agree:\n    ${real.join('\n    ')}`);
ok(files.size > 150 && labIds.size > 30, `the search read the labs' code (${files.size} files, ${labIds.size} hub ids)`);
ok([...files.keys()].some((k) => k.startsWith('page:')), 'and the scripts written inside the pages');

/* ---------------- the audit can fail: one doctored input for each finding ---------------- */
{
  const base = () => ({ files: new Map(files), stores: EXTRA_STORES.map((s) => ({ ...s })), opens: structuredClone(OPENS), keyIn: { ...KEY_IN }, legacy: [...LEGACY], labIds: new Set(labIds) });
  const has = (inp, re) => audit(inp).some((f) => re.test(f));
  let d = base(); d.files.set('newlab/main.js', 'const v = localStorage.getItem("newlab.state");');
  ok(has(d, /newlab\/main\.js opens the browser's storage/), 'a lab that opens localStorage without being named is found');
  d = base(); d.files.set('newlab/db.js', 'const req = indexedDB.open("newlab");');
  ok(has(d, /newlab\/db\.js opens/), 'and one that opens IndexedDB');
  d = base(); d.files.set('page:newlab.html', 'window.localStorage.setItem("k", "v")');
  ok(has(d, /page:newlab\.html opens/), 'and a script written inside a page');
  d = base(); d.files.set('newlab/notes.js', '// the old page used localStorage here\n/* indexedDB was tried */\nexport const x = 1; // no localStorage\n');
  ok(!has(d, /newlab\/notes\.js/), 'a comment that names storage is not a use of it');
  d = base(); d.files.set('newlab/url.js', 'const u = "https://example.test/localStorage";');
  ok(has(d, /newlab\/url\.js opens/), 'a string is read as code: a lab that needs the word in a string names itself here, which keeps the search simple');
  d = base(); d.files.set('ai/llm.js', d.files.get('ai/llm.js').replace(/'lb\.llm\.ownkey'/g, "'lb.llm.key2'"));
  ok(has(d, /the key "lb\.llm\.ownkey" of "model-key" is not in ai\/llm\.js/), 'a lab that renames its key without the list is found');
  d = base(); d.stores.push({ id: 'ghost', lab: null, name: 'a store nobody opens', keys: ['ghost.key'], prefixes: [], secret: [], managedHere: true });
  ok(has(d, /"ghost" is on the list and no lab file is named/) && has(d, /"ghost" has no file that carries its key/), 'a store on the list that no lab opens is found');
  d = base(); d.files.set('trending/history.js', 'export const none = 1;');
  ok(has(d, /trending\/history\.js is named here and no longer opens/), 'a name here that went stale is found');
  d = base(); d.files.delete('altverse/store.js');
  ok(has(d, /altverse\/store\.js is named here and does not exist/), 'and a name for a file that is gone');
  d = base(); d.opens['ai/llm.js'] = ['model-key', 'nope'];
  ok(has(d, /names the store "nope", which is not on the list/), 'a store id that is not on the list is found');
  d = base(); d.stores.find((s) => s.id === 'trending-history').lab = 'trend';
  ok(has(d, /names the lab "trend", which the hub does not list/), 'a store that names a lab the hub does not have is found');
  d = base(); d.legacy.push('model-key');
  ok(has(d, /"model-key" is called legacy and a lab still opens it/), 'a store called legacy that a lab still opens is found');
  d = base(); d.legacy.push('never-was');
  ok(has(d, /"never-was" is called legacy and is not on the list/), 'and a legacy name that is not on the list');
  d = base(); d.keyIn.phantom = 'ai/llm.js';
  ok(has(d, /a key file is named for "phantom"/), 'and a key file named for a store that is not on the list');
  d = base(); d.stores.find((s) => s.id === 'claude-prep').prefixes = ['zzz.'];
  ok(audit(d).length === real.length, 'a store this page does not manage is not searched for: Claude Prep is not this code');
}

if (fails.length) { console.log(`stores tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`stores tests: ${passed} passed, 0 failed`);
