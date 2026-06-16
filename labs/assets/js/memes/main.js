/* ============================================================
   AI Meme Lab — "The Taste Filter".

   A reasoning model brainstorms comedic angles, drafts a slate of
   caption candidates, scores each against a named taste rubric,
   and commits to a winner — all streamed into the reasoning panel
   as the visible star. The meme is composited onto a same-origin
   event-horizon canvas (always exportable, offline-capable), with
   upload-your-own and an opt-in pollinations backdrop as alternates.

   Wired to the shared tiered backend (ollama -> worker -> echo).
   NOTE: worker.base is '' until the Cloudflare proxy is deployed,
   so the live tier is ECHO for everyone right now — the local
   comedy engine below is the main event, not a fallback, and is
   also the single source of truth for the parse-failure path.
   ============================================================ */

import { AIProvider } from '../ai/provider.js';
import { AI_CONFIG } from '../ai/config.js';

/* ---------- dom helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* ---------- refs ---------- */
const form        = $('#meme-form');
const topicEl     = $('#topic');
const toneEl      = $('#tone');
const seedEl      = $('#seed');
const genBtn      = $('#generate');
const stopBtn     = $('#stop');
const resting     = $('#resting');
const workEl      = $('#work');
const reasonWrap  = $('#reasoning-wrap');
const reasonBody  = $('#reasoning-body');
const reasonLabel = $('#reasoning-label');
const reasonTog   = $('#reasoning-toggle');
const memeCanvas  = $('#meme');
const composingEl = $('#composing');
const capTop      = $('#cap-top');
const capBottom   = $('#cap-bottom');
const captionEdit = $('#caption-edit');
const exportBar   = $('#export-bar');
const exportNote  = $('#export-note');
const angleChips  = $('#angle-chips');
const candidatesEl= $('#candidates');
const fallbackNote= $('#fallback-note');
const statusEl    = $('#ai-status');
const statusLabel = $('#ai-status-label');
const backendNote = $('#backend-note');
const uploadEl    = $('#upload');
const srcNote     = $('#src-note');
const copyBtn     = $('#copy');
const reasonStatus= $('#reasoning-status');
const footerTag   = $('#footer-tagline');
const downloadBtn = $('#download');

/* ---------- state ---------- */
const ai = new AIProvider();
let controller = null;
const S = {
  mode: 'canvas',      // 'canvas' | 'upload' | 'pollinations'
  bgImage: null,       // loaded HTMLImageElement for upload/pollinations
  meme: null,          // last parsed meme object
  size: { w: 1080, h: 1080 },
  tainted: false,
};

const TIER_TEXT = {
  ollama: () => ['local', `Local model · ${AI_CONFIG.ollama.defaultModel}`],
  worker: () => ['hosted', 'Hosted relay · Nemotron-3-Ultra (reasoning)'],
  echo:   () => ['offline', 'Offline · built-in comedy engine, no network'],
};

/* ============================================================
   status
   ============================================================ */
function paintStatus(mode) {
  const [short, long] = (TIER_TEXT[mode] || TIER_TEXT.echo)();
  statusEl.dataset.mode = mode;
  statusLabel.textContent = short;
  backendNote.textContent =
    `Backend: ${long}. The topic is sent only when you press the button; no keys touch the browser.`;
  if (footerTag) {
    footerTag.textContent = (mode === 'worker'
      ? 'Reasoning by Nemotron-3-Ultra'
      : mode === 'ollama'
        ? 'Reasoning by your local model'
        : 'Built-in comedy engine') + ' · a meme, not a manifesto.';
  }
}

/* ============================================================
   submit -> generate
   ============================================================ */
/* seed parse that preserves 0 and treats blank/NaN as the default */
function readSeed() {
  const raw = (seedEl.value || '').trim();
  const n = Number(raw);
  return (raw !== '' && Number.isFinite(n)) ? n : 1234;
}

function readInputs() {
  return {
    topic: (topicEl.value || '').trim() || 'AGI timelines',
    tone: toneEl.value,
    seed: readSeed(),
    source: S.mode,
  };
}

async function generate(inputs) {
  controller?.abort();
  const myCtrl = controller = new AbortController();

  resting.hidden = true;
  workEl.hidden = false;
  angleChips.innerHTML = '';
  candidatesEl.innerHTML = '';
  fallbackNote.hidden = true;
  exportBar.hidden = true;
  captionEdit.hidden = true;
  exportNote.hidden = true;
  composingEl.hidden = false;
  reasonBody.textContent = '';
  reasonWrap.dataset.active = 'true';
  reasonTog.setAttribute('aria-expanded', 'true');
  reasonLabel.textContent =
    ai.mode === 'worker' ? 'Nemotron-3-Ultra · reasoning'
    : ai.mode === 'ollama' ? 'Local model · reasoning'
    : 'Comedy engine · reasoning';
  setBusy(true);
  reasonStatus.textContent = 'Reasoning started — drafting and scoring caption candidates.';

  let answer = '';
  let gotReasoning = false;

  try {
    await ai.chat({
      provider: ai.mode === 'worker' ? 'nvidia' : undefined,
      model: ai.mode === 'worker' ? 'nvidia/nemotron-3-ultra-550b-a55b' : undefined,
      messages: buildMessages(inputs),
      temperature: 0.7,
      maxTokens: 2048,
      signal: controller.signal,
      echo: buildEcho(inputs),
      onReasoning: (t) => { gotReasoning = true; reasonBody.textContent += t; reasonBody.scrollTop = reasonBody.scrollHeight; },
      onToken: (t) => { answer += t; },
      onDone: () => {},
    });
  } catch (err) {
    if (err?.name !== 'AbortError') console.warn('[memes] chat failed:', err);
  }

  // if a newer run superseded this one, bail without clobbering its DOM/state.
  // if it was a user Stop (no successor took the controller), reset the button.
  if (myCtrl.signal.aborted) {
    if (controller === myCtrl) setBusy(false);
    return;
  }

  reasonWrap.dataset.active = 'false';
  reasonWrap.hidden = !gotReasoning && ai.mode !== 'echo';

  let meme = extractMeme(answer);
  let note = null;
  if (!meme) {
    meme = buildLocalMeme(inputs);
    note = ai.mode === 'echo' ? null : 'Model output was not valid JSON, so the built-in engine scored the slate instead.';
  }
  await renderResult(meme, inputs, note);
  reasonStatus.textContent = `Reasoning complete — winner selected: ${meme.winner?.top || ''} ${meme.winner?.bottom || ''}`.trim();
  setBusy(false);
}

function setBusy(busy) {
  genBtn.disabled = busy;
  genBtn.querySelector('span').textContent = busy ? 'Reasoning…' : 'Reason out a meme';
  stopBtn.hidden = !busy;
}

/* ============================================================
   prompt construction
   ============================================================ */
function buildMessages(i) {
  const sys =
`You are a deadpan staff comedy writer with the taste of a senior engineer, writing memes about AI engineering and the singularity. You do not just write a caption — you run a VISIBLE four-phase taste filter, because a platform streams your reasoning to the reader and the reasoning IS the product.

PHASE 1 ANGLES: list 4-6 distinct comedic ANGLES on the topic (relatable-pain, unexpected-juxtaposition, self-own, doomer, corporate-cringe). One short labelled line each.
PHASE 2 SLATE: for the 3 strongest angles, draft a meme as TOP text / BOTTOM text. Punchy, under 8 words per line, all-caps meme register, no emoji.
PHASE 3 CRITIQUE: score EVERY candidate 0-5 on five named axes — punchy, funny (genuinely funny vs merely true), onTopic, notCringe (reject dad-jokes, ads, try-hard, and anything punching-down/slur/NSFW -> 0), readable (lands in 2 seconds). Narrate each cut in one line.
PHASE 4 COMMIT: pick the winner, state the ONE edit that sharpens it, emit the final caption, and choose a canvas scene motif that frames the joke.

Do all four phases in your reasoning. THEN output ONLY a single JSON object (no markdown fences, no prose around it) matching this schema exactly:
{"angles":["short label"],"candidates":[{"id":"A","top":"TOP","bottom":"BOTTOM","scores":{"punchy":4,"funny":3,"onTopic":5,"notCringe":4,"readable":5},"verdict":"one line why kept or cut"}],"winner":{"id":"A","top":"FINAL TOP","bottom":"FINAL BOTTOM"},"refinement":"the one edit you made","scene":{"motif":"event-horizon|accretion-disk|lone-observer|collapsing-stack|signal-in-noise","warmCold":0.6,"focal":"center","seed":${i.seed}}}
Rules: the scores object must have exactly those five integer keys (0-5). notCringe MUST be 0 for any hateful/NSFW/punching-down line. Tone register: ${i.tone}. Keep top/bottom under 8 words each.`;

  const usr = `Topic: ${i.topic}. Tone: ${i.tone}. Make the meme.`;
  return [{ role: 'system', content: sys }, { role: 'user', content: usr }];
}

function buildEcho(i) {
  const local = buildLocalMeme(i);
  return { thought: buildReasoningScript(i, local), speech: [JSON.stringify(local)] };
}

/* ============================================================
   parse the model's JSON answer
   ============================================================ */
function extractMeme(text) {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b === -1 || b <= a) return null;
  try {
    const obj = JSON.parse(s.slice(a, b + 1));
    const okCands = Array.isArray(obj.candidates) && obj.candidates.length;
    const okWin = obj.winner && (obj.winner.top || obj.winner.bottom);
    if (!okCands || !okWin) return null;
    if (!obj.angles) obj.angles = [];
    if (!obj.scene) obj.scene = defaultScene();
    return obj;
  } catch { return null; }
}

/* ============================================================
   render the slate + composite the meme
   ============================================================ */
async function renderResult(meme, inputs, note) {
  composingEl.hidden = true;

  // angle chips
  angleChips.innerHTML = '';
  for (const a of (meme.angles || [])) angleChips.append(el('span', 'angle-chip', a));

  // candidate cards — winner first, then the cut ones (explicit partition,
  // not a sort: an identity comparator isn't a valid total order)
  candidatesEl.innerHTML = '';
  const winId = meme.winner?.id;
  const win = meme.candidates.filter((c) => c.id === winId);
  const rest = meme.candidates.filter((c) => c.id !== winId);
  if (win.length) {
    candidatesEl.append(candCard(win[0], true, meme.winner));
  } else {
    // model named a winner id that matches no candidate — synthesize the card
    candidatesEl.append(candCard({ id: meme.winner?.id || 'A', scores: {} }, true, meme.winner));
  }
  for (const c of rest) candidatesEl.append(candCard(c, false, null));

  // caption edit fields = winner text
  capTop.value = (meme.winner?.top || '').toUpperCase();
  capBottom.value = (meme.winner?.bottom || '').toUpperCase();
  captionEdit.hidden = false;

  // note
  if (note) { fallbackNote.textContent = note; fallbackNote.hidden = false; }

  // paint the canvas
  S.meme = meme;
  await composite();

  exportBar.hidden = false;
}

const AXES = [
  ['punchy', 'punchy'], ['funny', 'funny'], ['onTopic', 'on-topic'],
  ['notCringe', 'clean'], ['readable', 'readable'],
];

function candCard(c, isWin, winner) {
  const card = el('div', 'cand-card' + (isWin ? ' winner' : ' cut'));
  const head = el('div', 'cand-head');
  head.append(el('span', 'cand-id', c.id || '?'));
  head.append(el('span', 'cand-tag', isWin ? 'winner' : 'cut'));
  card.append(head);

  const text = el('div', 'cand-text');
  const top = (winner ? winner.top : c.top) || '';
  const bot = (winner ? winner.bottom : c.bottom) || '';
  if (top) text.append(el('span', 'half', top.toUpperCase()));
  if (bot) text.append(el('span', 'half dim', bot.toUpperCase()));
  card.append(text);

  const scores = el('div', 'scores');
  const sc = c.scores || {};
  for (const [key, label] of AXES) {
    const v = Math.max(0, Math.min(5, Number(sc[key]) || 0));
    const s = el('div', 'score');
    s.append(el('span', 'axis', label));
    const track = el('span', 'track');
    const fill = el('span', 'fill');
    fill.style.width = (v / 5 * 100) + '%';
    track.append(fill);
    s.append(track);
    s.title = `${label}: ${v}/5`;
    scores.append(s);
  }
  card.append(scores);

  if (c.verdict) card.append(el('div', 'cand-verdict', c.verdict));
  return card;
}

/* ============================================================
   canvas painter — same-origin event-horizon art, exportable
   ============================================================ */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const css = getComputedStyle(document.documentElement);
const tok = (name, fb) => (css.getPropertyValue(name).trim() || fb);
const PALETTE = () => ({
  void:      tok('--void', '#060709'),
  surface:   tok('--surface', '#0B0E13'),
  accretion: tok('--accretion', '#F2A93B'),
  accSoft:   tok('--accretion-soft', '#F6C271'),
  accDim:    tok('--accretion-dim', '#97681F'),
  horizon:   tok('--horizon', '#5BB0D6'),
  horSoft:   tok('--horizon-soft', '#93D0EB'),
  bright:    tok('--text-bright', '#EDF1F7'),
  dim:       tok('--text-dim', '#79828F'),
  faint:     tok('--text-faint', '#424B57'),
});

let _fontsP = null;
function fontsReady() {
  if (_fontsP) return _fontsP;
  _fontsP = (document.fonts && document.fonts.ready)
    ? document.fonts.load('700 64px "Space Grotesk"')
        .then(() => document.fonts.load('500 24px "IBM Plex Mono"'))
        .then(() => document.fonts.ready)
        .catch(() => {})
    : Promise.resolve();
  return _fontsP;
}

function defaultScene() { return { motif: 'event-horizon', warmCold: 0.55, focal: 'center', seed: readSeed() }; }

async function composite() {
  await fontsReady();
  const c = memeCanvas, ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const P = PALETTE();

  if ((S.mode === 'upload' || S.mode === 'pollinations') && S.bgImage) {
    drawCover(ctx, S.bgImage, w, h);
  } else {
    const scene = { ...(S.meme?.scene || defaultScene()), seed: readSeed() };
    drawBackdrop(ctx, scene, w, h, P);
  }
  drawCaption(ctx, capTop.value, capBottom.value, w, h, P);
  drawCredit(ctx, w, h, P);

  // keep the canvas's text alternative in sync with the rendered caption
  const t = capTop.value.trim(), b = capBottom.value.trim();
  memeCanvas.setAttribute('aria-label', (t || b)
    ? `Meme: top text "${capTop.value}", bottom text "${capBottom.value}"`
    : 'Generated meme');

  // a remote backdrop can taint the canvas — detect it now, not at click time
  if (S.mode === 'pollinations' && S.bgImage) probeTaint(ctx);
}

/* cheap taint probe so a blocked download is shown before the user clicks */
function probeTaint(ctx) {
  try {
    ctx.getImageData(0, 0, 1, 1);
    S.tainted = false; exportNote.hidden = true;
    downloadBtn.disabled = false; copyBtn.disabled = false;
  } catch {
    taintFallback();
  }
}

function drawCover(ctx, img, w, h) {
  const ir = img.width / img.height, cr = w / h;
  let dw, dh;
  if (ir > cr) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawBackdrop(ctx, scene, w, h, P) {
  const rnd = mulberry32((scene.seed | 0) + hashMotif(scene.motif));
  const cx = w * (scene.focal === 'left' ? 0.32 : scene.focal === 'right' ? 0.68 : 0.5);
  const cy = h * 0.46;
  const warm = Math.max(0, Math.min(1, scene.warmCold ?? 0.55));

  // void base
  ctx.fillStyle = P.void; ctx.fillRect(0, 0, w, h);

  // deep glow — warm accretion biased by warmCold
  const R = Math.max(w, h) * 0.75;
  const glow = ctx.createRadialGradient(cx, cy, R * 0.04, cx, cy, R);
  glow.addColorStop(0, mix(P.accSoft, P.horizon, 1 - warm));
  glow.addColorStop(0.18, hexA(P.accretion, 0.55));
  glow.addColorStop(0.5, hexA(P.accDim, 0.16));
  glow.addColorStop(1, hexA(P.void, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

  // starfield
  const stars = Math.round((w * h) / 14000);
  for (let i = 0; i < stars; i++) {
    const x = rnd() * w, y = rnd() * h, s = rnd() * 1.6 + 0.2;
    ctx.globalAlpha = 0.15 + rnd() * 0.6;
    ctx.fillStyle = rnd() > 0.85 ? P.horSoft : P.bright;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;

  drawMotif(ctx, scene.motif, cx, cy, Math.min(w, h), P, rnd, warm);
}

function drawMotif(ctx, motif, cx, cy, D, P, rnd, warm) {
  const r = D * 0.22;
  ctx.save();
  if (motif === 'accretion-disk') {
    ctx.translate(cx, cy); ctx.rotate(-0.32);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.strokeStyle = hexA(i % 2 ? P.accretion : P.horizon, 0.5 - i * 0.07);
      ctx.lineWidth = D * 0.012;
      ctx.ellipse(0, 0, r * (1 + i * 0.34), r * (0.34 + i * 0.10), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (motif === 'lone-observer') {
    eventHorizon(ctx, cx, cy - D * 0.04, r * 0.9, P);
    ctx.fillStyle = P.void;
    const ox = cx, oy = cy + D * 0.34, hr = D * 0.03;
    ctx.beginPath(); ctx.arc(ox, oy, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(ox - hr * 0.8, oy + hr, hr * 1.6, D * 0.12);
    ctx.strokeStyle = hexA(P.horizon, 0.7); ctx.lineWidth = D * 0.006;
    ctx.beginPath(); ctx.arc(ox, oy, hr, 0, Math.PI * 2); ctx.stroke();
  } else if (motif === 'collapsing-stack') {
    ctx.translate(cx, cy);
    for (let i = 0; i < 7; i++) {
      const bw = r * (2.0 - i * 0.22), bh = D * 0.028;
      ctx.fillStyle = hexA(i < 3 ? P.accretion : P.horizon, 0.6 - i * 0.05);
      ctx.fillRect(-bw / 2 + (rnd() - 0.5) * D * 0.05 * i, -D * 0.18 + i * bh * 1.7, bw, bh);
    }
  } else if (motif === 'signal-in-noise') {
    ctx.strokeStyle = hexA(P.horSoft, 0.85); ctx.lineWidth = D * 0.008;
    ctx.beginPath();
    for (let x = 0; x <= D * 2; x += 4) {
      const px = cx - D + x;
      const py = cy + Math.sin(x * 0.03) * D * 0.06 + (rnd() - 0.5) * D * 0.012;
      x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else {
    eventHorizon(ctx, cx, cy, r, P);
  }
  ctx.restore();
}

function eventHorizon(ctx, cx, cy, r, P) {
  // bright accretion rim around a black core
  const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r * 1.25);
  rim.addColorStop(0, hexA(P.void, 0));
  rim.addColorStop(0.6, hexA(P.accretion, 0.9));
  rim.addColorStop(0.78, hexA(P.accSoft, 0.7));
  rim.addColorStop(1, hexA(P.void, 0));
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = P.void;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hexA(P.horSoft, 0.5); ctx.lineWidth = r * 0.012;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.stroke();
}

function drawCaption(ctx, top, bottom, w, h, P) {
  const family = '"Space Grotesk"';
  const margin = w * 0.07;
  const maxW = w - margin * 2;
  const base = Math.round(h * 0.092);

  // legibility scrims
  scrim(ctx, 0, 0, w, h * 0.34, P.void, true);
  scrim(ctx, 0, h * 0.66, w, h * 0.34, P.void, false);

  ctx.textAlign = 'center';
  if (top) drawBand(ctx, top, w / 2, h * 0.045, maxW, base, family, 'top', P);
  if (bottom) drawBand(ctx, bottom, w / 2, h - h * 0.045, maxW, base, family, 'bottom', P);
}

function drawBand(ctx, text, x, y, maxW, base, family, anchor, P) {
  const { lines, font } = fitLines(ctx, text, maxW, base, family);
  ctx.font = `700 ${font}px ${family}`;
  ctx.textBaseline = anchor === 'top' ? 'top' : 'bottom';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = P.void;
  ctx.lineWidth = font * 0.16;
  ctx.fillStyle = P.bright;
  const lh = font * 1.04;
  const arr = anchor === 'top' ? lines : [...lines].reverse();
  arr.forEach((ln, idx) => {
    const yy = anchor === 'top' ? y + idx * lh : y - idx * lh;
    ctx.strokeText(ln, x, yy);
    ctx.fillText(ln, x, yy);
  });
}

function fitLines(ctx, raw, maxW, base, family) {
  const text = (raw || '').toUpperCase().trim();
  if (!text) return { lines: [], font: base };
  for (let font = base; font > base * 0.5; font -= 2) {
    ctx.font = `700 ${font}px ${family}`;
    if (ctx.measureText(text).width <= maxW) return { lines: [text], font };
    const words = text.split(/\s+/);
    if (words.length > 1) {
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        const wid = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || wid < best.wid) best = { a, b, wid };
      }
      if (best && best.wid <= maxW) return { lines: [best.a, best.b], font };
    }
  }
  // still too wide at the floor font: greedy-wrap into as many lines as needed,
  // truncating any single word that can't fit (never overflow the frame)
  const font = Math.round(base * 0.5);
  ctx.font = `700 ${font}px ${family}`;
  return { lines: greedyWrap(ctx, text, maxW), font };
}

function greedyWrap(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const w = truncWord(ctx, word, maxW);
    const trial = line ? line + ' ' + w : w;
    if (line && ctx.measureText(trial).width > maxW) { lines.push(line); line = w; }
    else line = trial;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function truncWord(ctx, word, maxW) {
  if (ctx.measureText(word).width <= maxW) return word;
  let w = word;
  while (w.length > 1 && ctx.measureText(w + '…').width > maxW) w = w.slice(0, -1);
  return w + '…';
}

function drawCredit(ctx, w, h, P) {
  ctx.font = `500 ${Math.round(h * 0.018)}px "IBM Plex Mono"`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = hexA(P.dim, 0.95);
  ctx.fillText('github.com/Leyber91 · taste filter', w - w * 0.02, h - h * 0.012);
}

function scrim(ctx, x, y, w, h, color, fromTop) {
  const g = ctx.createLinearGradient(0, fromTop ? y : y + h, 0, fromTop ? y + h : y);
  g.addColorStop(0, hexA(color, 0.78));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

/* color utils */
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function mix(h1, h2, t) {
  const p = (h) => { const x = h.replace('#', ''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; };
  const a = p(h1), b = p(h2);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hashMotif(m) { let h = 0; for (const ch of (m || '')) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) % 9973; }

/* ============================================================
   export — download + copy (untainted for canvas/upload)
   ============================================================ */
function download() {
  try {
    memeCanvas.toBlob((blob) => {
      if (!blob) return taintFallback();
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u; a.download = `l212-meme-${readSeed()}.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1500);
    }, 'image/png');
  } catch (e) { taintFallback(); }
}

async function copy() {
  if (!window.ClipboardItem || !navigator.clipboard?.write) {
    showExportNote('Clipboard copy needs https — Download is the always-works path.');
    return;
  }
  try {
    memeCanvas.toBlob(async (blob) => {
      if (!blob) return taintFallback();
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        flash(copyBtn, 'Copied');
      } catch { showExportNote('Copy was blocked here — use Download.'); }
    }, 'image/png');
  } catch (e) { taintFallback(); }
}

function taintFallback() {
  S.tainted = true;
  showExportNote('This backdrop came from a remote service without CORS headers, so the browser blocks saving the composited file. Switch to event-horizon art or your own upload for a one-click download.');
}

function showExportNote(msg) { exportNote.textContent = msg; exportNote.hidden = false; }
function flash(btn, label) {
  const html = btn.innerHTML; btn.textContent = label;
  setTimeout(() => { btn.innerHTML = html; }, 1200);
}

/* ============================================================
   the local comedy engine — deterministic, the live tier today.
   Single source of truth for echo AND parse-failure fallback.
   ============================================================ */
const TONE_FLAVOR = {
  deadpan:   { tag: 'deadpan', kicker: 'AS ONE DOES', closer: 'WORKING AS INTENDED' },
  absurdist: { tag: 'absurdist', kicker: 'AND THEN THE TOASTER SPOKE', closer: 'NOBODY ASKED THE TOASTER' },
  wholesome: { tag: 'wholesome', kicker: 'AND THAT IS OKAY', closer: 'YOU ARE DOING GREAT' },
  corporate: { tag: 'corporate', kicker: 'PER MY LAST STANDUP', closer: 'LET US CIRCLE BACK' },
  doomer:    { tag: 'doomer', kicker: 'WE ARE NOT READY', closer: 'IT IS FINE. IT IS FINE.' },
};
const MOTIFS = ['event-horizon', 'accretion-disk', 'lone-observer', 'collapsing-stack', 'signal-in-noise'];
const CRINGE = ['lol', 'epic', 'rockstar', 'ninja', 'guru', 'synergy'];

/* snowclone templates -> {top, bottom, angle} from a topic + tone */
function templates(topic, tone) {
  const T = topic.toUpperCase();
  const f = TONE_FLAVOR[tone] || TONE_FLAVOR.deadpan;
  return [
    { angle: `the relatable-pain take on ${topic}`, top: 'NOBODY:', bottom: `ME EXPLAINING ${T} AGAIN` },
    { angle: `the hubris take on ${topic}`, top: 'ONE DOES NOT SIMPLY', bottom: `SHIP ${T} ON A FRIDAY` },
    { angle: `the self-own take on ${topic}`, top: `THEY DON'T KNOW I STILL`, bottom: `DON'T UNDERSTAND ${T}` },
    { angle: `the expectation-vs-reality take on ${topic}`, top: `${T}: THE PITCH`, bottom: 'THE 3AM PAGER ALERT' },
    { angle: `the ${f.tag} take on ${topic}`, top: `${T} WILL FIX EVERYTHING`, bottom: f.closer },
    { angle: `the over-eager take on ${topic}`, top: `${T}?`, bottom: `${T} ALL THE THINGS` },
  ];
}

function scoreCandidate(cand, topic) {
  const text = `${cand.top} ${cand.bottom}`.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const tline = Math.max(cand.top.split(/\s+/).length, cand.bottom.split(/\s+/).length);
  const punchy = clamp5(6 - Math.max(0, tline - 4));
  const onTopic = topic.toLowerCase().split(/\s+/).some((t) => t.length > 2 && text.includes(t)) ? 5 : 3;
  const notCringe = CRINGE.some((c) => text.includes(c)) ? 1 : 5;
  const readable = clamp5(6 - Math.max(0, words - 7) * 0.7);
  // funny: rewards surprise (juxtaposition / self-own), penalizes flatness
  let funny = 3;
  if (/all the things|3am|pager|friday|nobody:/.test(text)) funny += 1;
  if (/don't understand|will fix everything/.test(text)) funny += 1;
  funny = clamp5(funny);
  return { punchy, funny, onTopic, notCringe, readable };
}
function clamp5(n) { return Math.max(0, Math.min(5, Math.round(n))); }
function total(s) { return s.punchy + s.funny + s.onTopic + s.notCringe + s.readable; }

function buildLocalMeme(i) {
  const rnd = mulberry32((i.seed | 0) + hashMotif(i.tone));
  const pool = templates(i.topic, i.tone);
  // seed-driven pick of 4 distinct candidates
  const idx = [];
  while (idx.length < 4 && idx.length < pool.length) {
    const k = Math.floor(rnd() * pool.length);
    if (!idx.includes(k)) idx.push(k);
  }
  const ids = ['A', 'B', 'C', 'D'];
  const candidates = idx.map((k, n) => {
    const t = pool[k];
    const scores = scoreCandidate(t, i.topic);
    return { id: ids[n], top: t.top, bottom: t.bottom, angle: t.angle, scores,
      verdict: verdictFor(scores) };
  });
  const winner = [...candidates].sort((a, b) => total(b.scores) - total(a.scores))[0];
  const motif = MOTIFS[Math.floor(rnd() * MOTIFS.length)];
  return {
    angles: candidates.map((c) => c.angle),
    candidates: candidates.map(({ angle, ...c }) => c),   // strip angle from cards
    winner: { id: winner.id, top: winner.top, bottom: winner.bottom },
    refinement: 'tightened the bottom line to land in two seconds',
    scene: { motif, warmCold: 0.45 + rnd() * 0.35, focal: 'center', seed: i.seed },
  };
}

function verdictFor(s) {
  if (total(s) >= 22) return 'lands the joint — keep';
  if (s.funny <= 2) return 'true but not funny — cut';
  if (s.notCringe <= 2) return 'reads as try-hard — cut';
  if (s.readable <= 3) return 'too wordy to land in 2s — cut';
  return 'fine, but a runner-up';
}

function buildReasoningScript(i, local) {
  const f = TONE_FLAVOR[i.tone] || TONE_FLAVOR.deadpan;
  const out = [];
  out.push(`PHASE 1 — angles on "${i.topic}" (${f.tag}):`);
  local.angles.forEach((a, n) => out.push(`  ${n + 1}. ${a}`));
  out.push('');
  out.push('PHASE 2 — drafting the slate:');
  local.candidates.forEach((c) => out.push(`  ${c.id}: ${c.top} / ${c.bottom}`));
  out.push('');
  out.push('PHASE 3 — taste critique (punchy / funny / on-topic / clean / readable, 0-5):');
  local.candidates.forEach((c) => {
    const s = c.scores;
    out.push(`  ${c.id}: ${s.punchy} ${s.funny} ${s.onTopic} ${s.notCringe} ${s.readable} -> ${c.verdict}`);
  });
  out.push('');
  out.push(`PHASE 4 — commit: ${local.winner.id} wins. Refinement: ${local.refinement}.`);
  out.push(`Final: ${local.winner.top} / ${local.winner.bottom}`);
  return out;
}

/* ============================================================
   interactions
   ============================================================ */
function wire() {
  reasonTog.addEventListener('click', () => {
    const open = reasonTog.getAttribute('aria-expanded') === 'true';
    reasonTog.setAttribute('aria-expanded', String(!open));
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); generate(readInputs()); });
  stopBtn.addEventListener('click', () => controller?.abort());

  $('#topic-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    topicEl.value = b.dataset.topic;
  });

  $('#dice').addEventListener('click', () => { seedEl.value = Math.floor(Math.random() * 999999); if (S.meme) composite(); });

  $('#source-toggle').addEventListener('click', (e) => {
    const b = e.target.closest('.src'); if (!b) return;
    setSource(b.dataset.src);
  });
  uploadEl.addEventListener('change', onUpload);

  $('#sizes').addEventListener('click', (e) => {
    const b = e.target.closest('.size'); if (!b) return;
    $('#sizes').querySelectorAll('.size').forEach((s) => s.classList.toggle('on', s === b));
    S.size = { w: Number(b.dataset.w), h: Number(b.dataset.h) };
    memeCanvas.width = S.size.w; memeCanvas.height = S.size.h;
    if (S.meme) composite();
  });

  capTop.addEventListener('input', () => S.meme && composite());
  capBottom.addEventListener('input', () => S.meme && composite());

  $('#reroll-art').addEventListener('click', () => { seedEl.value = Math.floor(Math.random() * 999999); composite(); });
  $('#remix').addEventListener('click', () => generate(readInputs()));
  $('#download').addEventListener('click', download);
  copyBtn.addEventListener('click', copy);
}

function setSource(src) {
  S.mode = src;
  $('#source-toggle').querySelectorAll('.src').forEach((s) =>
    s.setAttribute('aria-pressed', String(s.dataset.src === src)));
  if (src === 'upload') { uploadEl.click(); srcNote.hidden = true; reEnableExport(); }
  else if (src === 'pollinations') {
    srcNote.hidden = false;
    srcNote.textContent = 'Network fetch. The composited meme stays downloadable when the service returns CORS headers; if not, saving is blocked (the meme still shows) — use art or upload to save.';
    S.bgImage = null;
    if (S.meme) loadPollinations();
  } else {
    srcNote.hidden = true; S.bgImage = null; reEnableExport();
    if (S.meme) composite();
  }
}

function reEnableExport() {
  S.tainted = false; exportNote.hidden = true;
  downloadBtn.disabled = false; copyBtn.disabled = false;
}

function onUpload(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const img = new Image();
  img.onload = () => { S.bgImage = img; reEnableExport(); if (S.meme) composite(); };
  img.src = URL.createObjectURL(file);
}

function loadPollinations() {
  const prompt = `${(S.meme?.scene?.motif || 'event horizon')}, dark cinematic, ${capTop.value} ${capBottom.value}`;
  // crossOrigin before src + a per-request cache-buster so a previously-cached
  // non-CORS copy can't silently taint the canvas (the classic taint trap).
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    + `?width=${S.size.w}&height=${S.size.h}&nologo=true&seed=${readSeed()}&_cb=${Date.now()}`;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { S.bgImage = img; if (S.meme) composite(); };
  img.onerror = () => {
    srcNote.textContent = "Couldn't load a backdrop (no response, or blocked by CORS) — staying on event-horizon art.";
    setSource('canvas');
  };
  // composite instantly over canvas backdrop so the box is never blank
  S.bgImage = null; if (S.meme) composite();
  img.src = url;
}

/* ============================================================
   demo mode — instant deterministic render for screenshots
   ============================================================ */
async function renderDemo() {
  const inputs = { topic: 'AGI timelines', tone: 'doomer', seed: 1234, source: 'canvas' };
  topicEl.value = inputs.topic; toneEl.value = inputs.tone; seedEl.value = String(inputs.seed);

  resting.hidden = true; workEl.hidden = false; composingEl.hidden = true;
  reasonWrap.dataset.active = 'false';
  reasonLabel.textContent = 'Comedy engine · reasoning';   // honest: worker tier is unreachable (worker.base='')
  const local = buildLocalMeme(inputs);
  reasonBody.textContent = buildReasoningScript(inputs, local).join('\n');
  await renderResult(local, inputs, null);                 // await the canvas paint -> deterministic screenshot
}

/* ============================================================
   init — LAST, so every const data table above is live first
   ============================================================ */
(async function init() {
  const y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());
  if (!window.ClipboardItem) copyBtn.hidden = true;
  wire();

  const params = new URLSearchParams(location.search);
  if (params.has('demo')) await renderDemo();

  const mode = await ai.detect();
  paintStatus(mode);
})();
