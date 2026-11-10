/* =========================================================================
   site_check.mjs — the site's own checks, run by the gates workflow.
   For every published HTML page (tracked, and not under a path segment
   starting with "_" or ".", which GitHub Pages' Jekyll build leaves out
   while the repository has no .nojekyll):
     - every local link, script, stylesheet and image it references resolves
       to a file in the repository (external URLs, anchors, data: and the
       like are skipped; a directory resolves to its index.html);
     - the page parses: a doctype, and every non-void, non-optional element
       that opens also closes, in order.
   And every labs/ page listed on the labs hub (labs/assets/js/config/
   site.config.js) exists.

   Run: node tools/site_check.mjs     (exit 0 clean, 1 findings)
   No dependencies.
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const HUB_CONFIG = 'labs/assets/js/config/site.config.js';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source',
  'track', 'wbr']);
// elements whose end tag HTML lets you leave out; not tracked on the stack
const OPTIONAL_END = new Set(['html', 'head', 'body', 'p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
  'option', 'optgroup', 'colgroup', 'caption', 'rt', 'rp']);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const REF_ATTRS = { a: ['href'], link: ['href'], script: ['src'], img: ['src', 'srcset'], source: ['src', 'srcset'],
  video: ['src', 'poster'], audio: ['src'], iframe: ['src'], image: ['href', 'xlink:href'], use: ['href', 'xlink:href'] };

const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const trackedSet = new Set(tracked);
const jekyll = !trackedSet.has('.nojekyll');
const published = (p) => !jekyll || !p.split('/').some((seg) => seg.startsWith('_') || seg.startsWith('.'));
const pages = tracked.filter((p) => p.endsWith('.html') && published(p));
const findings = [];

function isExternal(ref) {
  return ref === '' || ref.startsWith('#') || ref.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(ref) ||
    ref.includes('${') || ref.includes('{{');
}

// a repo-relative path exists when it is a published tracked file, or a directory holding a tracked index.html
function resolves(path) {
  if (!published(path)) return false; // a file Pages leaves out is a 404 on the site
  if (trackedSet.has(path)) return true;
  const dir = path.replace(/\/$/, '');
  if (trackedSet.has(posix.join(dir, 'index.html'))) return true;
  return path === '' && trackedSet.has('index.html');
}

function resolveRef(page, ref) {
  let clean = ref.split('#')[0].split('?')[0];
  try { clean = decodeURIComponent(clean); } catch { /* keep as written */ }
  const base = clean.startsWith('/') ? '' : posix.dirname(page);
  return posix.normalize(posix.join(base, clean.replace(/^\/+/, ''))).replace(/^\.\/?/, '');
}

function attrs(tagSource) {
  const out = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(tagSource))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

function lineOf(html, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (html.charCodeAt(i) === 10) n++;
  return n;
}

function checkPage(page) {
  const html = readFileSync(join(ROOT, page), 'utf8');
  if (!/^\s*(<!--[\s\S]*?-->\s*)*<!doctype html/i.test(html)) findings.push(`${page}: parse: missing <!doctype html>`);
  const stack = [];
  const tagRe = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const whole = m[0];
    if (whole.startsWith('<!--')) {
      if (!whole.endsWith('-->')) findings.push(`${page}:${lineOf(html, m.index)}: parse: unterminated comment`);
      continue;
    }
    if (!m[1]) continue;
    const name = m[1].toLowerCase();
    const closing = whole.startsWith('</');
    if (!closing) {
      const a = attrs(m[2]);
      for (const key of REF_ATTRS[name] || []) {
        if (!(key in a)) continue;
        if (name === 'a' && key === 'href' && 'download' in a && a.href.startsWith('blob:')) continue;
        const values = key === 'srcset' ? a[key].split(',').map((s) => s.trim().split(/\s+/)[0]) : [a[key].trim()];
        for (const ref of values) {
          if (isExternal(ref)) continue;
          if (name === 'link' && a.rel && /\b(preconnect|dns-prefetch|canonical|alternate)\b/i.test(a.rel)) continue;
          const target = resolveRef(page, ref);
          if (!resolves(target)) findings.push(`${page}: missing: <${name} ${key}="${ref}"> -> ${target || '(root)'}`);
        }
      }
      if (RAW_TEXT.has(name)) {
        const end = html.toLowerCase().indexOf(`</${name}`, tagRe.lastIndex);
        if (end === -1) { findings.push(`${page}:${lineOf(html, m.index)}: parse: <${name}> never closes`); break; }
        tagRe.lastIndex = end + name.length + 2;
        const gt = html.indexOf('>', tagRe.lastIndex);
        tagRe.lastIndex = gt === -1 ? html.length : gt + 1;
        continue;
      }
      if (VOID.has(name) || OPTIONAL_END.has(name) || /\/\s*$/.test(m[2])) continue;
      stack.push({ name, line: lineOf(html, m.index) });
    } else {
      if (VOID.has(name) || OPTIONAL_END.has(name)) continue;
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at === -1) { findings.push(`${page}:${lineOf(html, m.index)}: parse: </${name}> closes nothing`); continue; }
      for (const open of stack.splice(at).slice(1)) {
        findings.push(`${page}:${open.line}: parse: <${open.name}> not closed before </${name}>`);
      }
    }
  }
  for (const open of stack) findings.push(`${page}:${open.line}: parse: <${open.name}> never closes`);
}

function checkHub() {
  if (!trackedSet.has(HUB_CONFIG)) { findings.push(`${HUB_CONFIG}: missing: the labs hub config`); return; }
  const src = readFileSync(join(ROOT, HUB_CONFIG), 'utf8');
  const re = /href:\s*(['"`])([^'"`]+)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const ref = m[2];
    if (isExternal(ref)) continue;
    const target = resolveRef('labs/index.html', ref);
    if (!resolves(target)) findings.push(`${HUB_CONFIG}: missing: hub lists "${ref}" -> ${target}`);
  }
}

for (const page of pages) checkPage(page);
checkHub();

for (const f of findings) console.log(f);
console.log(`site_check: ${pages.length} pages, ${findings.length} findings`);
process.exit(findings.length ? 1 : 0);
