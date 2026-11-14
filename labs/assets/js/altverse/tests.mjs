/* ============================================================
   altverse/tests.mjs — what enters as a world carries no markup.

     node labs/assets/js/altverse/tests.mjs

   The views of this lab write a world's text into the page as
   HTML. A world can arrive in a #w= share link, which anyone can
   write. On 2026-11-14 such a link ran script on the site's
   origin. store.js now replaces "<" and ">" wherever a world
   enters; these checks hold that door shut.
   ============================================================ */

/* store.js reads the page's address and its storage: stand-ins, since this runs in Node. */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
globalThis.location = { href: 'https://example.test/labs/altverse.html' };

const { cleanWorld, encodeShare, decodeShareHash, shareURL, saveWorld, loadWorld, listWorlds } = await import('./store.js');

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
/* every string in a value, keys included */
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); }
  return out;
};
const tagless = (v) => strings(v).every((s) => !/[<>]/.test(s));

const hostile = {
  id: 'w-1', name: 'X<img src=x onerror="document.title=1">', motto: '</div><script>1</script>', tier: 'echo', createdAt: 5,
  divergence: { statement: 'S<b id="n">bold</b>', domain: 'physics' },
  premise: { text: 'a < b and c > d', firstMechanism: '<svg onload=1>' },
  facts: { 'k<i>': { fact: '<u>f</u>', mag: 3 } },
  map: { regions: [{ name: '<a href="javascript:1">r</a>', dominantBiome: 'taiga' }] },
  log: ['<p>dropped</p>'],
};

/* ---- the share link ---- */
const back = decodeShareHash('#w=' + encodeShare(hostile));
ok(back && tagless(back), 'a world decoded from a share link has no "<" or ">" in any string or key');
eq(back.name, 'X‹img src=x onerror="document.title=1"›', 'a tag in a name is shown as text with look-alike brackets');
eq(back.premise.text, 'a ‹ b and c › d', 'a plain comparison keeps its sense');
eq(back.createdAt, 5, 'numbers pass unchanged');
ok(Object.keys(back.facts)[0] === 'k‹i›', 'keys are cleaned, since the dossier prints them');
ok(tagless(decodeShareHash(shareURL(hostile).split('#')[1] ? '#' + shareURL(hostile).split('#')[1] : '')), 'the same through shareURL');
eq(decodeShareHash('#w=bm90IGpzb24'), null, 'a link that is not a world is refused');
eq(decodeShareHash('#w=' + Buffer.from('[1,2]').toString('base64')), null, 'a link that decodes to a list is refused');
eq(decodeShareHash('#w=' + Buffer.from('"<b>"').toString('base64')), null, 'a link that decodes to a string is refused');
eq(decodeShareHash(''), null, 'no link, no world');

/* ---- nesting cannot carry a tag past the cleaner ---- */
let deep = '<img src=x onerror=1>';
for (let i = 0; i < 200; i++) deep = { a: [deep] };
ok(tagless(cleanWorld(deep)), 'a tag nested 200 levels down does not come through');
ok(tagless(cleanWorld({ a: { b: { c: ['<x>', { d: '<y>' }] } } })), 'tags in lists and objects are all replaced');
eq(JSON.stringify(cleanWorld({ a: 1, b: [true, null, 'ok'], c: { d: 'fine' } })), JSON.stringify({ a: 1, b: [true, null, 'ok'], c: { d: 'fine' } }), 'a world without tags is unchanged');

/* ---- storage ---- */
ok(saveWorld(hostile), 'a world is saved');
ok(tagless(JSON.parse(mem.get('altverse:world:w-1'))), 'what is stored has no tags');
ok(tagless(loadWorld('w-1')) && loadWorld('w-1').name.startsWith('X'), 'what is loaded has no tags');
ok(tagless(listWorlds()) && listWorlds().length === 1, 'the list of saved worlds has no tags');
mem.set('altverse:world:w-2', JSON.stringify({ name: '<img src=x onerror=1>', divergence: { statement: '<i>s</i>' } }));
ok(tagless(loadWorld('w-2')), 'a world written into storage by something else is cleaned when it is read');
mem.set('altverse:index', JSON.stringify([{ id: 'w-3', title: '<img src=x onerror=1>', divergenceSummary: '<b>x</b>' }, null, 7]));
ok(tagless(listWorlds()) && listWorlds().length === 1, 'an index written by something else is cleaned, and its broken rows dropped');
mem.set('altverse:index', '{"not":"a list"}');
eq(listWorlds().length, 0, 'an index that is not a list reads as empty');
mem.set('altverse:world:w-4', '"just a string"');
eq(loadWorld('w-4'), null, 'a stored world that is not an object reads as none');

if (fails.length) { console.log(`altverse tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`altverse tests: ${passed} passed, 0 failed`);
