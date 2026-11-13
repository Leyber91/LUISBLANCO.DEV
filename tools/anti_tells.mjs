// Anti-tells: fail the build when a lab gains a look or a phrase that reads as generated.
//
// Two families. Visual tells (purple-to-blue or purple-to-pink gradients, gradient-filled text, frosted-glass
// panels, the default display fonts, cream with terracotta, emoji as markers) and copy tells (em-dash asides,
// "not X but Y" pivots, stock words). The site's voice rules are in SITE_RULES.md; the design vocabulary that
// replaces these looks is in .claude/skills/labs-design/SKILL.md.
//
// Today's hits are recorded in tools/anti_tells.baseline.json. A file may keep its recorded count of a tell and
// may lose some; it may not gain one. A new file starts at zero.
//
// usage:
//   node tools/anti_tells.mjs              check every lab file against the baseline (exit 1 on a new tell)
//   node tools/anti_tells.mjs scan <path>  list every tell in the given files or folders, baseline ignored
//   node tools/anti_tells.mjs baseline [--with <checkout>...]  rewrite the baseline from the files as they are now
//   node tools/anti_tells.mjs selftest     run the rule tests
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const BASELINE = path.join(ROOT, 'tools', 'anti_tells.baseline.json');
const SCOPE = 'labs';
const SKIP_DIR = /(^|\/)(data|vendor|lib|node_modules|claude-prep)(\/|$)/;   // generated or third-party, not authored here
const EXT = /\.(html|css|js|mjs)$/;

/* ---------------- colour helpers ---------------- */
const NAMED = { purple: '#800080', violet: '#ee82ee', indigo: '#4b0082', blueviolet: '#8a2be2', mediumpurple: '#9370db',
  rebeccapurple: '#663399', slateblue: '#6a5acd', mediumslateblue: '#7b68ee', blue: '#0000ff', royalblue: '#4169e1',
  dodgerblue: '#1e90ff', deepskyblue: '#00bfff', magenta: '#ff00ff', fuchsia: '#ff00ff', hotpink: '#ff69b4', deeppink: '#ff1493' };
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}
function colorsIn(text) {
  const out = [];
  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) { const rgb = hexToRgb(m[0]); if (rgb) out.push(rgbToHsl(rgb)); }
  for (const m of text.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) out.push(rgbToHsl([+m[1], +m[2], +m[3]]));
  for (const m of text.matchAll(/hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/g)) out.push([+m[1] % 360, +m[2] / 100, +m[3] / 100]);
  for (const m of text.matchAll(/\b([a-z]+)\b/g)) if (Object.hasOwn(NAMED, m[1])) out.push(rgbToHsl(hexToRgb(NAMED[m[1]])));
  return out;
}
const vivid = ([, s, l]) => s >= 0.35 && l >= 0.22 && l <= 0.82;
const isPurple = (c) => vivid(c) && c[0] >= 255 && c[0] <= 300;
const isBlue = (c) => vivid(c) && c[0] >= 195 && c[0] < 255;
const isPink = (c) => vivid(c) && c[0] > 300 && c[0] <= 345;
const isTerracotta = ([h, s, l]) => h >= 6 && h <= 24 && s >= 0.4 && s <= 0.8 && l >= 0.38 && l <= 0.62;
const isCream = ([h, s, l]) => h >= 28 && h <= 55 && s >= 0.2 && l >= 0.88 && l < 0.98;

/* the argument list of each gradient call, parentheses balanced */
function gradients(line) {
  const out = [];
  const re = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/g;
  let m;
  while ((m = re.exec(line))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < line.length && depth; i++) { if (line[i] === '(') depth++; else if (line[i] === ')') depth--; }
    out.push(line.slice(m.index, i));
  }
  return out;
}

/* ---------------- the rules ---------------- */
const STOCK = ['delve', 'delves', 'delving', 'tapestry', 'seamless', 'seamlessly', 'unleash', 'unleashes', 'empower',
  'empowering', 'empowers', 'revolutionize', 'revolutionizes', 'revolutionary', 'game-changer', 'game-changing',
  'cutting-edge', 'harness the power', "in today's", 'unlock the', 'embark', 'testament to', 'the realm of',
  'ever-evolving', 'dive into', 'deep dive', 'supercharge', 'effortlessly', 'next-level', 'world-class',
  'state-of-the-art', 'transformative', 'look no further', "whether you're", 'elevate your', 'blazing fast'];
const STOCK_RE = new RegExp(`(^|[^a-z-])(${STOCK.map((w) => w.replace(/[-']/g, (c) => (c === '-' ? '-' : "['’]"))).join('|')})(?![a-z])`, 'i');
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2B50}\u{2705}\u{274C}\u{2728}\u{FE0F}]/u;

// family 'visual' runs on every line; family 'copy' runs only on lines that can carry visible text.
export const RULES = [
  { id: 'purple-gradient', family: 'visual', why: 'a gradient from purple to blue or pink',
    test: (line) => gradients(line).some((g) => { const c = colorsIn(g.slice(g.indexOf('(') + 1)); return c.some(isPurple) && c.some((x) => isBlue(x) || isPink(x)); }) },
  { id: 'gradient-text', family: 'visual', why: 'text filled with a gradient',
    test: (line) => /background-clip\s*:\s*text|backgroundClip\s*=\s*['"]text/.test(line) },
  { id: 'frosted-glass', family: 'visual', why: 'a frosted-glass panel',
    test: (line) => /backdrop-filter\s*:\s*[^;]*blur\(|backdropFilter\s*=\s*['"][^'"]*blur\(/.test(line) },
  { id: 'default-font', family: 'visual', why: 'a default display font (Inter, Poppins, Space Grotesk)',
    test: (line) => /font-family\s*:\s*['"]?(Inter|Poppins|Space Grotesk)\b|family=(Inter|Poppins|Space\+Grotesk)\b/.test(line) },
  { id: 'emoji', family: 'visual', why: 'an emoji', test: (line) => EMOJI_RE.test(line) },
  { id: 'em-dash', family: 'copy', why: 'an em-dash aside', test: (line) => line.includes('—') },
  { id: 'not-x-but-y', family: 'copy', why: 'a "not X, but Y" pivot',
    test: (line) => /\b(not just|not only|isn['’]t just|is not just|more than just)\b/i.test(line)
      || /\bit['’]?s not (?:about )?[^.,;:]{1,40}, it['’]?s\b/i.test(line) },
  { id: 'stock-word', family: 'copy', why: 'a stock word', test: (line) => STOCK_RE.test(line) },
];
// a file-level tell: cream grounds with terracotta accents
const FILE_RULES = [
  { id: 'cream-terracotta', why: 'cream with terracotta', test: (text) => { const c = colorsIn(text); return c.some(isCream) && c.some(isTerracotta); } },
];

/* lines that cannot show text: comments in scripts and styles, the inside of <style> in a page */
function copyMask(text, ext) {
  const lines = text.split(/\r?\n/);
  const mask = new Array(lines.length).fill(ext !== '.css');
  let inBlock = false, inStyle = false;
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (ext === '.html') {
      if (/<style[\s>]/i.test(t)) inStyle = true;
      if (inStyle) mask[i] = false;
      if (/<\/style>/i.test(t)) inStyle = false;
    }
    if (ext !== '.css') {
      if (inBlock) { mask[i] = false; if (t.includes('*/')) inBlock = false; return; }
      if (t.startsWith('/*')) { mask[i] = false; if (!t.includes('*/')) inBlock = true; return; }
      if (t.startsWith('//') || t.startsWith('*') || (ext === '.html' && t.startsWith('<!--'))) mask[i] = false;
    }
  });
  return { lines, mask };
}
const stripTrailingComment = (ln) => ln.replace(/\s\/\/\s.*$/, '');

export function scanText(text, ext) {
  const { lines, mask } = copyMask(text, ext);
  const hits = [];
  lines.forEach((ln, i) => {
    for (const r of RULES) {
      if (r.family === 'copy' && !mask[i]) continue;
      const subject = r.family === 'copy' && ext !== '.html' ? stripTrailingComment(ln) : ln;
      if (r.test(subject)) hits.push({ rule: r.id, line: i + 1, text: ln.trim().slice(0, 140) });
    }
  });
  for (const r of FILE_RULES) if (r.test(text)) hits.push({ rule: r.id, line: 0, text: '(whole file)' });
  return hits;
}

/* ---------------- files ---------------- */
function walk(dir, root = ROOT, out = []) {
  if (!fs.existsSync(dir)) return out;
  const st = fs.statSync(dir);
  if (st.isFile()) { if (EXT.test(dir)) out.push(dir); return out; }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = path.relative(root, p).split(path.sep).join('/');
    if (e.isDirectory()) { if (!SKIP_DIR.test(r)) walk(p, root, out); }
    else if (EXT.test(e.name) && !/\.min\.(js|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
function scanFiles(files, root = ROOT) {
  const res = {};
  for (const f of files) {
    const hits = scanText(fs.readFileSync(f, 'utf8'), path.extname(f));
    if (hits.length) res[path.relative(root, f).split(path.sep).join('/')] = hits;
  }
  return res;
}
const countBy = (hits) => hits.reduce((m, h) => ((m[h.rule] = (m[h.rule] || 0) + 1), m), {});
const WHY = Object.fromEntries([...RULES, ...FILE_RULES].map((r) => [r.id, r.why]));

/* ---------------- commands ---------------- */
function check() {
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')).files : {};
  const now = scanFiles(walk(path.join(ROOT, SCOPE)));
  const fails = [];
  let shrink = 0, files = 0;
  for (const [file, hits] of Object.entries(now)) {
    files++;
    const c = countBy(hits), b = base[file] || {};
    for (const [rule, n] of Object.entries(c)) {
      if (n > (b[rule] || 0)) fails.push({ file, rule, n, was: b[rule] || 0, hits: hits.filter((h) => h.rule === rule) });
      else if (n < (b[rule] || 0)) shrink++;
    }
  }
  for (const [file, b] of Object.entries(base)) {
    if (now[file] || !fs.existsSync(path.join(ROOT, file))) continue;   // files only on a lab branch are not counted here
    shrink += Object.keys(b).length;
  }
  if (fails.length) {
    console.log(`anti-tells: ${fails.length} new tell(s). Each line below is a look or a phrase that reads as generated.`);
    for (const f of fails) {
      console.log(`\n${f.file}: ${WHY[f.rule]} [${f.rule}], ${f.n} now, ${f.was} recorded`);
      for (const h of f.hits) console.log(`  ${h.line ? 'line ' + h.line : ''}  ${h.text}`);
    }
    console.log('\nReplace them with the labs-design vocabulary (.claude/skills/labs-design/SKILL.md). If a hit is a false');
    console.log('positive, fix the rule in tools/anti_tells.mjs with a selftest case, rather than raising the baseline.');
    process.exit(1);
  }
  console.log(`anti-tells: no new tells (${files} file(s) carry recorded ones${shrink ? `; ${shrink} count(s) are below the record` : ''}).`);
  if (shrink) console.log('To lock lower counts in, rewrite the baseline with every lab worktree: node tools/anti_tells.mjs baseline --with ../_labs_wt/*/');
}

// --with <checkout>... records the other checkouts too (the lab worktrees), keeping the larger count per file,
// so work already built on a lab branch can still ship; only tells added after the baseline fail.
function writeBaseline(extra) {
  const merged = {};
  for (const root of [ROOT, ...extra.map((d) => path.resolve(d))]) {
    for (const [f, h] of Object.entries(scanFiles(walk(path.join(root, SCOPE), root), root))) {
      const c = countBy(h), m = (merged[f] ||= {});
      for (const [rule, n] of Object.entries(c)) m[rule] = Math.max(m[rule] || 0, n);
    }
  }
  const files = Object.fromEntries(Object.entries(merged).sort());
  const total = Object.values(files).reduce((s, c) => s + Object.values(c).reduce((a, b) => a + b, 0), 0);
  fs.writeFileSync(BASELINE, JSON.stringify({ note: 'Recorded tells, written by node tools/anti_tells.mjs baseline. Counts may go down, never up.', total, files }, null, 1) + '\n');
  console.log(`baseline written: ${total} recorded tell(s) in ${Object.keys(files).length} file(s)`);
}

function scan(targets) {
  const files = targets.flatMap((t) => walk(path.resolve(t)));
  const res = scanFiles(files);
  let n = 0;
  for (const [file, hits] of Object.entries(res)) for (const h of hits) { n++; console.log(`${file}:${h.line}  [${h.rule}] ${h.text}`); }
  console.log(`${n} tell(s); ${files.length} file(s) scanned`);
  process.exit(n ? 1 : 0);
}

function selftest() {
  const cases = [
    ['css purple to blue', '.hero { background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%); }', '.css', ['purple-gradient']],
    ['css purple to pink, rgb', 'a { background: linear-gradient(90deg, rgb(139, 92, 246), rgb(236, 72, 153)); }', '.css', ['purple-gradient']],
    ['css named', 'b { background: radial-gradient(circle, violet, blue); }', '.css', ['purple-gradient']],
    ['site ground to gold is fine', 'c { background: linear-gradient(180deg, #05070E, #0A0E1A 60%, rgba(212,162,76,.2)); }', '.css', []],
    ['dark navy to blue is fine', 'd { background: linear-gradient(#1E2A42, #2563eb); }', '.css', []],
    ['gradient text', 'h1 { -webkit-background-clip: text; background-clip: text; }', '.css', ['gradient-text']],
    ['frosted glass', '.card { backdrop-filter: blur(12px); }', '.css', ['frosted-glass']],
    ['Inter as font', 'body { font-family: Inter, system-ui, sans-serif; }', '.css', ['default-font']],
    ['Interactive is not Inter', '<h1>Interactive Timeline</h1>', '.html', []],
    ['emoji in a page', '<button>\u{1F680} Launch</button>', '.html', ['emoji']],
    ['check mark is not an emoji', '<span>✓ done</span>', '.html', []],
    ['em dash in page copy', '<p>The model reads it — and answers.</p>', '.html', ['em-dash']],
    ['em dash in a script comment is fine', '// reads it — then answers', '.js', []],
    ['em dash in a block comment is fine', '/*\n * reads it — then answers\n */', '.js', []],
    ['em dash after code, in a trailing comment, is fine', 'const a = 1; // reads it — then answers', '.js', []],
    ['em dash in a script string', "el.textContent = 'reads it — then answers';", '.js', ['em-dash']],
    ['em dash in css', '.x::after { content: "—"; }', '.css', []],
    ['en dash for a range is fine', '<p>Levels 5–10</p>', '.html', []],
    ['not just', '<p>It is not just a chart.</p>', '.html', ['not-x-but-y']],
    ["it's not X, it's Y", "<p>It's not a toy, it's an instrument.</p>", '.html', ['not-x-but-y']],
    ['stock word', '<p>Delve into the data.</p>', '.html', ['stock-word']],
    ['curly apostrophe stock phrase', '<p>In today’s world</p>', '.html', ['stock-word']],
    ['seamless inside a word is fine', '<p>seamlessness</p>', '.html', []],
    ['plain copy', '<p>Black Hole renders a Kerr hole with exact null geodesics at 60 fps.</p>', '.html', []],
    ['style block is not copy', '<style>\n.a::after { content: "—"; }\n</style>', '.html', []],
    ['cream and terracotta', ':root { --bg: #FAF3E6; --accent: #C8553D; }', '.css', ['cream-terracotta']],
    ['cream alone is fine', ':root { --bg: #FAF3E6; --accent: #1E2A42; }', '.css', []],
  ];
  let fail = 0;
  for (const [name, text, ext, want] of cases) {
    const got = [...new Set(scanText(text, ext).map((h) => h.rule))].sort();
    const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
    if (!ok) { fail++; console.log(`FAIL ${name}: got [${got}] want [${want}]`); }
  }
  console.log(`anti-tells selftest: ${cases.length - fail}/${cases.length}`);
  process.exit(fail ? 1 : 0);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'check') check();
else if (cmd === 'baseline') writeBaseline(rest[0] === '--with' ? rest.slice(1) : []);
else if (cmd === 'scan') scan(rest.length ? rest : [path.join(ROOT, SCOPE)]);
else if (cmd === 'selftest') selftest();
else { console.log('usage: node tools/anti_tells.mjs [check|scan <path...>|baseline|selftest]'); process.exit(2); }
