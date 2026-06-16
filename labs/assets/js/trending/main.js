/* ============================================================
   Trending Topics — a live, in-browser agentic scan.

   It reaches the open web from the page itself (no backend, no
   keys), pulls real signals, ranks what is actually rising, and
   asks a keyless model WHY — streaming every step as a visible
   agent trace. All sources are public and CORS-clean:
     - Tech    : hn.algolia.com  (front page, ranked by velocity)
     - Culture : wikimedia.org   (most-read articles, prior day)
     - Dev     : api.github.com  (new repos by stars)
     - Reason  : text.pollinations.ai (keyless LLM; local heuristic fallback)

   If the network is unreachable it falls back to a clearly-labelled
   snapshot captured 2026-06-16, so the page is never a dead box.
   Live data is rendered with textContent only (never innerHTML).
   ============================================================ */

const SNAPSHOT_DATE = '2026-06-16';

/* ---------- dom helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- refs ---------- */
const form        = $('#scan-form');
const lensToggle  = $('#lens-toggle');
const lensWhat    = $('#lens-what');
const scanBtn     = $('#scan');
const stopBtn     = $('#stop');
const resting     = $('#resting');
const workEl      = $('#work');
const livePill    = $('#live-pill');
const liveText    = $('#live-text');
const metaSrc     = $('#meta-src');
const metaTime    = $('#meta-time');
const traceWrap   = $('#trace-wrap');
const traceBody   = $('#trace-body');
const traceTog    = $('#trace-toggle');
const featured    = $('#featured');
const featBadge   = $('#feat-badge');
const featMetric  = $('#feat-metric');
const featLink    = $('#feat-link');
const whyLabel    = $('#why-label');
const whyBody     = $('#why-body');
const board       = $('#board');
const boardNote   = $('#board-note');
const statusEl    = $('#ai-status');
const statusLabel = $('#ai-status-label');
const backendNote = $('#backend-note');
const scanStatus  = $('#scan-status');

/* ---------- state ---------- */
let controller = null;
let currentLens = 'tech';

/* ============================================================
   lens definitions — each fetch() returns ranked, normalized items
   ============================================================ */
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k';
  return String(n);
};
const humanAge = (h) => h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${h.toFixed(1)}h` : `${Math.round(h / 24)}d`;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d, sep = '/') => `${d.getUTCFullYear()}${sep}${pad(d.getUTCMonth() + 1)}${sep}${pad(d.getUTCDate())}`;
const daysAgoUTC = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };

async function fetchWithTimeout(url, signal, ms, headers) {
  const to = new AbortController();
  const timer = setTimeout(() => to.abort(), ms);
  const onAbort = () => to.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, { signal: to.signal, headers, cache: 'no-store', referrerPolicy: 'no-referrer' });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const LENSES = {
  tech: {
    label: 'Tech', source: 'Hacker News', host: 'hn.algolia.com', badge: 'HN',
    endpointLabel: 'front page', rankLabel: 'velocity (pts/hr)', theme: 'software and AI',
    what: 'Hacker News front page, ranked by velocity — points per hour since posting. The truest "rising right now" signal here.',
    async fetch(signal) {
      const t0 = performance.now();
      const res = await fetchWithTimeout('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30', signal, 12000);
      if (!res.ok) throw new Error('HN ' + res.status);
      const data = await res.json();
      const now = Date.now() / 1000;
      const items = (data.hits || []).filter((h) => h.title).map((h) => {
        const ageH = Math.max(0.4, (now - h.created_at_i) / 3600);
        const velocity = Math.round(h.points / ageH);
        return {
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          metricLabel: 'points', metricValue: h.points,
          sub: `${h.points} pts · ${h.num_comments || 0} comments · ${humanAge(ageH)} old`,
          ageText: `posted ${humanAge(ageH)} ago`,
          score: velocity,
        };
      }).sort((a, b) => b.score - a.score).slice(0, 12);
      return { items, ms: Math.round(performance.now() - t0), count: (data.hits || []).length };
    },
  },
  culture: {
    label: 'Culture', source: 'Wikipedia', host: 'wikimedia.org', badge: 'WIKI',
    endpointLabel: 'most-read, prior full day', rankLabel: 'page views', theme: 'public attention',
    what: "Wikipedia's most-read articles over the prior full day — what the world is actually reading. Daily totals, not real-time.",
    async fetch(signal) {
      const t0 = performance.now();
      let data = null, used = null;
      for (const back of [1, 2, 3]) {
        const d = ymd(daysAgoUTC(back));
        const r = await fetchWithTimeout(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d}`, signal, 12000);
        if (r.ok) { data = await r.json(); used = d; break; }
      }
      if (!data) throw new Error('Wikipedia unavailable');
      const arts = (data.items?.[0]?.articles || [])
        .filter((a) => a.article && a.article !== 'Main_Page' && a.article !== '-' && !a.article.includes(':'));
      const items = arts.slice(0, 12).map((a) => ({
        title: a.article.replace(/_/g, ' '),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(a.article)}`,
        metricLabel: 'views', metricValue: a.views,
        sub: `${fmt(a.views)} views · rank #${a.rank}`,
        ageText: `over ${used}`,
        score: a.views,
      }));
      return { items, ms: Math.round(performance.now() - t0), count: arts.length };
    },
  },
  dev: {
    label: 'Dev', source: 'GitHub', host: 'api.github.com', badge: 'GH',
    endpointLabel: 'repos created in the last 2 weeks, by stars', rankLabel: 'stars (new repos)', theme: 'developer tooling',
    what: 'GitHub repositories created in the last two weeks, sorted by stars — new projects climbing fast. Unauthenticated, so rate-limited to ~10 scans/min.',
    async fetch(signal) {
      const t0 = performance.now();
      const since = ymd(daysAgoUTC(14), '-');
      const res = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&order=desc&per_page=20`,
        signal, 12000, { Accept: 'application/vnd.github+json' });
      if (res.status === 403) throw new Error('GitHub rate limit (10/min unauth)');
      if (!res.ok) throw new Error('GitHub ' + res.status);
      const data = await res.json();
      const items = (data.items || []).map((r) => ({
        title: r.full_name,
        url: r.html_url,
        metricLabel: 'stars', metricValue: r.stargazers_count,
        sub: `${fmt(r.stargazers_count)} stars · ${r.language || '—'} · new since ${since}`,
        ageText: 'created in the last two weeks',
        score: r.stargazers_count,
      })).slice(0, 12);
      return { items, ms: Math.round(performance.now() - t0), count: (data.items || []).length };
    },
  },
};

/* ============================================================
   the agentic scan
   ============================================================ */
async function scan(lensKey) {
  const lens = LENSES[lensKey];
  controller?.abort();
  const myCtrl = controller = new AbortController();

  resting.hidden = true;
  workEl.hidden = false;
  traceBody.innerHTML = '';
  board.innerHTML = '';
  featured.hidden = true;
  boardNote.hidden = true;
  whyBody.textContent = '';
  traceWrap.dataset.active = 'true';
  traceTog.setAttribute('aria-expanded', 'true');
  setBusy(true);
  scanStatus.textContent = `Scanning ${lens.source} for what is rising.`;

  let res = null, live = true;
  step('req', 'GET ', { b: lens.host }, ` — ${lens.endpointLabel}`);
  try {
    res = await lens.fetch(myCtrl.signal);
    if (myCtrl.signal.aborted) return abortCleanup(myCtrl);
    step('ok', `${res.count} signals fetched`, { dur: `${res.ms}ms` });
  } catch (e) {
    if (myCtrl.signal.aborted) return abortCleanup(myCtrl);
    step('warn', `live fetch failed (${e.message}) — using the labelled snapshot`);
    res = { items: SNAPSHOT[lensKey].map((x) => ({ ...x })), ms: 0, count: SNAPSHOT[lensKey].length };
    live = false;
  }

  if (!res.items.length) {
    step('warn', 'no usable signals returned — using the labelled snapshot');
    res = { items: SNAPSHOT[lensKey].map((x) => ({ ...x })), ms: 0, count: SNAPSHOT[lensKey].length };
    live = false;
  }

  step('think', 'ranking by ', { b: lens.rankLabel });
  const items = res.items;
  step('ok', 'top signal: ', { b: items[0].title }, ` — ${lens.rankLabel.split(' ')[0]} ${fmt(items[0].score)}`);

  renderMeta(live, lens);
  renderFeatured(items[0], lens);
  renderBoard(items, lens);

  // reason about the top signal
  step('req', 'asking a model: why is ', { b: shorten(items[0].title) }, ' rising?');
  const r = await reasonWhy(items[0], lens, myCtrl.signal);
  if (myCtrl.signal.aborted) return abortCleanup(myCtrl);
  step('ok', `reasoning complete ${r.live ? '(pollinations, live)' : '(built-in heuristic)'}`);

  if (!live) { boardNote.textContent = `Network was unreachable, so this is a snapshot captured ${SNAPSHOT_DATE}, not live data.`; boardNote.hidden = false; }

  traceWrap.dataset.active = 'false';
  paintReasonStatus(live, r.live);
  scanStatus.textContent = `Scan complete. Top of ${lens.source}: ${items[0].title}.`;
  setBusy(false);
}

function abortCleanup(myCtrl) {
  if (controller === myCtrl) { traceWrap.dataset.active = 'false'; setBusy(false); }
}

function setBusy(busy) {
  scanBtn.disabled = busy;
  scanBtn.querySelector('span').textContent = busy ? 'Scanning…' : 'Scan what is rising';
  stopBtn.hidden = !busy;
}

/* ---------- trace (XSS-safe: live strings only via textContent) ---------- */
function step(kind, ...parts) {
  const li = el('li', 'trace-step'); li.dataset.kind = kind;
  li.append(el('span', 'tk'));
  const tx = el('span', 'tx');
  for (const p of parts) {
    if (typeof p === 'string') tx.append(document.createTextNode(p));
    else if (p.b != null) tx.append(el('b', null, p.b));
    else if (p.dur != null) tx.append(el('span', 'dur', p.dur));
  }
  li.append(tx);
  traceBody.append(li);
  traceBody.scrollTop = traceBody.scrollHeight;
  return li;
}
const shorten = (s) => (s.length > 48 ? s.slice(0, 46) + '…' : s);

/* ---------- render ---------- */
function renderMeta(live, lens) {
  livePill.dataset.live = live ? 'live' : 'snapshot';
  liveText.textContent = live ? 'live' : 'snapshot';
  metaSrc.textContent = `${lens.source} · ${lens.endpointLabel}`;
  metaTime.textContent = live ? `fetched ${clockNow()}` : `captured ${SNAPSHOT_DATE}`;
}
function clockNow() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

function renderFeatured(top, lens) {
  featBadge.textContent = lens.badge;
  featMetric.textContent = `${lens.rankLabel.split(' ')[0]} ${fmt(top.score)} · ${top.metricLabel} ${fmt(top.metricValue)}`;
  featLink.textContent = top.title;
  featLink.href = top.url;
  featured.hidden = false;
}

function renderBoard(items, lens) {
  board.innerHTML = '';
  const max = items[0].score || 1;
  items.forEach((it, i) => {
    const row = el('li', 'row');
    row.append(el('span', 'row-rank', pad(i + 1)));

    const main = el('div', 'row-main');
    const a = el('a', 'row-title', it.title);
    a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
    main.append(a, el('div', 'row-sub', it.sub));
    row.append(main);

    const right = el('div', 'row-right');
    right.append(el('div', 'row-metric', `${fmt(it.metricValue)} ${it.metricLabel}`));
    const heat = el('div', 'heat');
    const fill = el('span', 'fill');
    fill.style.width = Math.max(4, Math.round((it.score / max) * 100)) + '%';
    heat.append(fill);
    right.append(heat);
    row.append(right);

    board.append(row);
  });
}

function paintReasonStatus(dataLive, reasonLive) {
  const mode = reasonLive ? 'live' : 'local';
  statusEl.dataset.mode = mode;
  statusLabel.textContent = reasonLive ? 'live' : 'local';
  backendNote.textContent = reasonLive
    ? 'Reasoning: text.pollinations.ai (keyless, live). Data + reasoning both fetched from your browser; no keys, no backend.'
    : 'Reasoning: built-in heuristic (the model was unreachable). Data is ' + (dataLive ? 'live' : 'a labelled snapshot') + '.';
}

/* ============================================================
   reasoning — keyless live model, with a local heuristic fallback
   ============================================================ */
async function reasonWhy(item, lens, signal) {
  whyLabel.textContent = 'reasoning…';
  whyBody.classList.add('thinking');
  whyBody.textContent = '';
  const prompt =
    `A signal is rising on ${lens.source}: "${item.title}" (${item.metricLabel}: ${item.metricValue}` +
    `${item.ageText ? ', ' + item.ageText : ''}). In 2 to 3 concrete sentences, explain why it is likely ` +
    `climbing right now and what it signals about where ${lens.theme} is heading. No hype, no preamble, no lists.`;
  try {
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&referrer=l212`;
    const res = await fetchWithTimeout(url, signal, 25000);
    if (!res.ok) throw new Error('pollinations ' + res.status);
    const text = (await res.text()).trim();
    if (signal?.aborted) return { live: false };
    if (text.length < 24 || /^\s*(error|\{)/i.test(text)) throw new Error('empty');
    await typeInto(whyBody, text, signal);
    whyLabel.textContent = 'why it is rising · pollinations (live)';
    return { live: true };
  } catch (e) {
    if (signal?.aborted) return { live: false };
    await typeInto(whyBody, whyLocal(item, lens), signal);
    whyLabel.textContent = 'why it is rising · built-in heuristic';
    return { live: false };
  } finally {
    whyBody.classList.remove('thinking');
  }
}

async function typeInto(node, text, signal) {
  node.textContent = '';
  if (prefersReduced()) { node.textContent = text; return; }
  const stepN = 3;
  for (let i = 0; i < text.length; i += stepN) {
    if (signal?.aborted) { node.textContent = text; return; }
    node.textContent += text.slice(i, i + stepN);
    await wait(14);
  }
}

function whyLocal(item, lens) {
  const v = fmt(item.metricValue);
  if (lens.badge === 'HN') {
    return `At ${v} points climbing this fast, it has cleared the front-page baseline by a wide margin — on Hacker News that velocity usually means a launch, an outage, or a strong opinion landing at the right moment. The pace reflects practitioner interest, not just headline curiosity, which is the signal worth watching in ${lens.theme}.`;
  }
  if (lens.badge === 'WIKI') {
    return `With ${v} reads in a single day it is one of the most-looked-up things in the world right now — a spike like this is almost always downstream of a news event, a release, or a moment that sent people to look it up. It is a clean proxy for where ${lens.theme} actually went, rather than where commentary said it would.`;
  }
  return `A repository this new pulling ${v} stars is climbing far faster than the median project — early star velocity like this tracks developer conviction, usually a tool that removes a real, shared pain. It is an early read on where ${lens.theme} is heading before the trend is obvious.`;
}

/* ============================================================
   labelled offline snapshot — REAL items captured 2026-06-16,
   shown only when the network is unreachable (never as "live")
   ============================================================ */
const SNAPSHOT = {
  tech: [
    { title: 'Iroh 1.0', url: 'https://news.ycombinator.com/item?id=48542480', metricLabel: 'points', metricValue: 982, sub: '982 pts · 293 comments · top of front page', ageText: 'on the front page', score: 982 },
    { title: 'A backdoor in a LinkedIn job offer', url: 'https://news.ycombinator.com/item?id=48546294', metricLabel: 'points', metricValue: 790, sub: '790 pts · 155 comments · climbing fast', ageText: 'fresh', score: 790 },
    { title: 'Ask HN: Has anyone replaced Claude/GPT with a local model for daily coding?', url: 'https://news.ycombinator.com/item?id=48542100', metricLabel: 'points', metricValue: 735, sub: '735 pts · 351 comments · heavy discussion', ageText: 'today', score: 735 },
    { title: 'TinyWind: a pixel pirate sailing game with real wind physics', url: 'https://news.ycombinator.com/item?id=48543475', metricLabel: 'points', metricValue: 638, sub: '638 pts · 132 comments', ageText: 'today', score: 638 },
    { title: 'Hetzner Price Adjustment', url: 'https://news.ycombinator.com/item?id=48540844', metricLabel: 'points', metricValue: 351, sub: '351 pts · 504 comments · contested', ageText: 'today', score: 351 },
    { title: 'Salesforce to Acquire Fin (formerly Intercom) for $3.6B', url: 'https://news.ycombinator.com/item?id=48540126', metricLabel: 'points', metricValue: 284, sub: '284 pts · 211 comments', ageText: 'today', score: 284 },
  ],
  culture: [
    { title: 'Oliver Tree', url: 'https://en.wikipedia.org/wiki/Oliver_Tree', metricLabel: 'views', metricValue: 1508668, sub: '1.5M views · rank #2', ageText: 'over the prior day', score: 1508668 },
    { title: 'Jalen Brunson', url: 'https://en.wikipedia.org/wiki/Jalen_Brunson', metricLabel: 'views', metricValue: 1326341, sub: '1.3M views · rank #3', ageText: 'over the prior day', score: 1326341 },
    { title: 'Curaçao', url: 'https://en.wikipedia.org/wiki/Cura%C3%A7ao', metricLabel: 'views', metricValue: 1215504, sub: '1.2M views · rank #4', ageText: 'over the prior day', score: 1215504 },
    { title: '2026 FIFA World Cup', url: 'https://en.wikipedia.org/wiki/2026_FIFA_World_Cup', metricLabel: 'views', metricValue: 777070, sub: '777k views · rank #6', ageText: 'over the prior day', score: 777070 },
  ],
  dev: [
    { title: 'DietrichGebert/ponytail', url: 'https://github.com/DietrichGebert/ponytail', metricLabel: 'stars', metricValue: 17068, sub: '17k stars · JavaScript · new', ageText: 'new', score: 17068 },
    { title: 'XiaomiMiMo/MiMo-Code', url: 'https://github.com/XiaomiMiMo/MiMo-Code', metricLabel: 'stars', metricValue: 9068, sub: '9.1k stars · TypeScript · new', ageText: 'new', score: 9068 },
    { title: 'shadcn/improve', url: 'https://github.com/shadcn/improve', metricLabel: 'stars', metricValue: 4887, sub: '4.9k stars · new', ageText: 'new', score: 4887 },
    { title: 'diffusionstudio/lottie', url: 'https://github.com/diffusionstudio/lottie', metricLabel: 'stars', metricValue: 2981, sub: '3.0k stars · TypeScript · new', ageText: 'new', score: 2981 },
    { title: 'omnigent-ai/omnigent', url: 'https://github.com/omnigent-ai/omnigent', metricLabel: 'stars', metricValue: 1975, sub: '2.0k stars · Python · new', ageText: 'new', score: 1975 },
    { title: 'NoopApp/noop', url: 'https://github.com/NoopApp/noop', metricLabel: 'stars', metricValue: 1690, sub: '1.7k stars · Swift · new', ageText: 'new', score: 1690 },
  ],
};

const DEMO_WHY = 'Iroh hitting a stable 1.0 lands just as teams are tiring of fragile, centralized networking glue and want direct peer-to-peer connections that simply work. A 1.0 is a public bet that the project is production-ready — exactly the trust threshold that moves a tool from weekend experiments into real stacks. Expect more infrastructure to quietly assume peer-to-peer by default rather than treating it as exotic.';

/* ============================================================
   interactions
   ============================================================ */
function setLens(key) {
  currentLens = key;
  lensToggle.querySelectorAll('.lens').forEach((b) => {
    const on = b.dataset.lens === key;
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
  });
  lensWhat.textContent = LENSES[key].what;
}

function wire() {
  traceTog.addEventListener('click', () => {
    const open = traceTog.getAttribute('aria-expanded') === 'true';
    traceTog.setAttribute('aria-expanded', String(!open));
  });
  lensToggle.addEventListener('click', (e) => {
    const b = e.target.closest('.lens'); if (!b) return;
    setLens(b.dataset.lens);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); scan(currentLens); });
  stopBtn.addEventListener('click', () => controller?.abort());
}

/* ============================================================
   demo mode — instant, deterministic snapshot render for screenshots
   ============================================================ */
function renderDemo() {
  setLens('tech');
  resting.hidden = true; workEl.hidden = false; traceWrap.dataset.active = 'false';
  const lens = LENSES.tech;
  const items = SNAPSHOT.tech.map((x) => ({ ...x }));

  // a representative frozen trace
  step('req', 'GET ', { b: lens.host }, ` — ${lens.endpointLabel}`);
  step('ok', '30 signals fetched', { dur: '214ms' });
  step('think', 'ranking by ', { b: lens.rankLabel });
  step('ok', 'top signal: ', { b: items[0].title }, ` — points ${fmt(items[0].score)}`);
  step('req', 'asking a model: why is ', { b: shorten(items[0].title) }, ' rising?');
  step('ok', 'reasoning complete (pollinations, live)');

  renderMeta(false, lens);          // demo uses the snapshot, labelled honestly
  metaTime.textContent = `captured ${SNAPSHOT_DATE}`;
  renderFeatured(items[0], lens);
  renderBoard(items, lens);
  whyLabel.textContent = 'why it is rising · sample';
  whyBody.textContent = DEMO_WHY;
  boardNote.textContent = `Sample view (a snapshot captured ${SNAPSHOT_DATE}). Press “Scan what is rising” for a live run.`;
  boardNote.hidden = false;
  statusEl.dataset.mode = 'local'; statusLabel.textContent = 'sample';
}

/* ============================================================
   init — LAST, after every const above is initialized
   ============================================================ */
(function init() {
  const y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());
  wire();
  setLens('tech');
  backendNote.textContent = 'Press scan to fetch live signals and reason about them — entirely from your browser, no keys.';

  const params = new URLSearchParams(location.search);
  if (params.has('demo')) { renderDemo(); return; }
  if (params.has('scan') && LENSES[params.get('scan')]) {
    setLens(params.get('scan'));
    scan(params.get('scan'));   // live, in-browser — used to verify the agentic path end-to-end
  }
})();
