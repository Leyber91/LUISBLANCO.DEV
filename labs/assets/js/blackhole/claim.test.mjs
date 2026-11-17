/* ============================================================
   The lab's one-line claim, where a visitor reads it before the card: the page's opening line (COPY.sub), its
   meta description and the hub card. On 2026-11-17 all three said "the shadow measured against the Event Horizon
   Telescope" above M87*, the default object, for which the EHT measured no shadow (physics.js RULING). Where one
   of them names the EHT, Sgr A*, the object whose shadow it measured, is in the same clause, and none says
   "match". Kept apart from physics.test.mjs: the mutant runners run that file on a copy of this folder alone,
   where the page and the hub's config do not exist.
   ============================================================ */

import { readFileSync } from 'node:fs';
import * as CFG from './config.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (!cond) { fails++; console.log(`FAIL  ${name}${detail ? '  ' + detail : ''}`); }
};

let desc = '', hub = '';
try {
  const page = readFileSync(new URL('../../../bh_animation_page.html', import.meta.url), 'utf8');
  desc = (/<meta name="description" content="([^"]*)"/.exec(page) || [])[1] || '';
} catch (e) { ok('the page is read', false, e.message); }
try {
  hub = ((await import('../config/site.config.js')).ALL_PROJECTS.find((p) => p.id === 'black-hole') || {}).blurb || '';
} catch (e) { ok('the hub config is read', false, e.message); }

for (const [where, s] of [['the opening line', CFG.COPY ? CFG.COPY.sub : ''], ['the description', desc], ['the hub card', hub]]) {
  ok(`${where} is read`, s.length > 40, s);
  // in the EHT's own clause: the old hub card named Sgr A* in its list of objects and passed a looser check
  if (/Event Horizon Telescope|EHT/.test(s)) ok(`${where} names Sgr A* in the clause that names the EHT, and claims no match`, /(Event Horizon Telescope|EHT)[^,.;]*Sgr A\*/.test(s) && !/match/i.test(s), s);
}

console.log(fails ? `\n${fails} of ${checks} claim check(s) failed` : `\nall ${checks} claim checks passed`);
process.exit(fails ? 1 : 0);
