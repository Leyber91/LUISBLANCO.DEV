/* ============================================================
   tools/drives/pages.mjs — every lab page loads, and its console
   is clean.

     node tools/drive.mjs tools/drives/pages.mjs --base http://127.0.0.1:<port> --timeout 420

   For a change to code that several labs share (the kit, Labs OS,
   the model route's client): a broken import shows up here as an
   exception on the page that imports it, which no Node test of one
   lab can see. Each page is opened with ?still, so nothing has to
   animate, and is given a moment to run its modules.

   What it does not show: that a page works. It shows that the page
   came up, drew something, and logged no error while doing so.
   ============================================================ */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const LABS = fileURLToPath(new URL('../../labs/', import.meta.url));
/* The model route is asked once by some pages as they load; from a dev server it can refuse, and that is
   the route's answer, not a fault of the page. */
const EXPECTED = /labs-model-route|net::ERR_|Failed to fetch|429|rate limit/i;

export default async function pages(p, { base }) {
  const names = fs.readdirSync(LABS).filter((f) => f.endsWith('.html')).sort();
  p.check('there are lab pages to open', names.length > 5, `${names.length} pages`);
  for (const name of names) {
    const before = p.errors().length;
    let up = true;
    try { await p.go(`${base}/labs/${name}?still`); } catch { up = false; }
    await p.sleep(1400);
    const text = up ? await p.ev('document.body ? document.body.innerText.trim().length : 0').catch(() => 0) : 0;
    const errs = p.errors().slice(before).filter((e) => !EXPECTED.test(e));
    p.check(`${name} loads with a clean console`, up && text > 40 && errs.length === 0, !up ? 'did not finish loading' : text <= 40 ? `only ${text} characters of text on the page` : errs.slice(0, 2).join(' | ').slice(0, 300));
  }
}
