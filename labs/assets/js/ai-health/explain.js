/* ============================================================
   ai-health/explain.js — one model call that turns the computed
   facts into plain language, and a deterministic audit of the reply.

   The call carries every fact the engine computed, each with an id:
   the patient's values, the risk, every contribution, the NEWS2 total,
   and a summary of the ward at the current hour. The reply is JSON:
   sentences, each citing the fact ids it uses, a list of factors, and
   one sentence about the ward. One call per visitor action.

   The audit, sentence by sentence:
     numbers     every number must match a computed value; a number
                 that matches nothing is struck through
     features    every feature named must be a top contribution
                 (a change in pulse counts as pulse)
     direction   a sentence that names one feature and says it raises
                 or lowers risk must agree with the contribution's sign
     advice      a sentence that reads as clinical advice is blocked
     citations   a sentence that cites no fact is marked unsupported
   When no route answers, a template writes the same structure from the
   same facts, and the same audit runs on it.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { FEATURES, FEATURE_BY_KEY } from './config.js';

export const TOP_K = 4;
const MIN_CONTRIB = 0.04;   // log-odds; smaller contributions are not "factors"

const pct = (p) => (100 * p).toFixed(p < 0.1 ? 1 : 0);

export function fmtValue(key, v) {
  const f = FEATURE_BY_KEY[key];
  if (key === 'o2') return v ? 'on oxygen' : 'on air';
  if (key === 'cvpu') return v ? 'new confusion' : 'alert';
  if (f.binary) return v ? 'yes' : 'no';
  if (key === 'temp') return (+v).toFixed(1) + ' °C';
  if (key === 'slope') return (v >= 0 ? '+' : '') + (+v).toFixed(2) + ' pts/h';
  if (key === 'gap') return (+v).toFixed(1) + ' h';
  if (f.derived && key.startsWith('d_')) return (v >= 0 ? '+' : '') + Math.round(v) + ' ' + f.unit;
  return Math.round(v * 10) / 10 + (f.unit ? ' ' + f.unit : '');
}

/* A feature and its value as a reader would say it. */
export function phrase(key, v) {
  switch (key) {
    case 'rr': return `a respiration rate of ${v} per minute`;
    case 'spo2': return `an SpO2 of ${v}%`;
    case 'o2': return v ? 'being on supplemental oxygen' : 'not being on oxygen';
    case 'sbp': return `a systolic blood pressure of ${v} mmHg`;
    case 'hr': return `a pulse of ${v} per minute`;
    case 'cvpu': return v ? 'new confusion' : 'being fully alert (no new confusion)';
    case 'temp': return `a temperature of ${(+v).toFixed(1)} °C`;
    case 'age': return `age ${v}`;
    case 'copd': return v ? 'COPD' : 'no COPD';
    case 'hf': return v ? 'heart failure' : 'no heart failure';
    case 'bb': return v ? 'a beta-blocker' : 'no beta-blocker';
    case 'd_rr': return `a change in respiration rate of ${fmtValue(key, v)} since the last set`;
    case 'd_hr': return `a change in pulse of ${fmtValue(key, v)} since the last set`;
    case 'd_sbp': return `a change in systolic blood pressure of ${fmtValue(key, v)} since the last set`;
    case 'd_spo2': return `a change in SpO2 of ${fmtValue(key, v)} since the last set`;
    case 'slope': return `a NEWS2 trend of ${fmtValue(key, v)}`;
    case 'gap': return `${fmtValue(key, v)} since the previous observation`;
    case 'miss': return v ? `${v} value carried forward` : 'no values carried forward';
    default: return `${key} ${v}`;
  }
}

export function rankContribs(expl) {
  return expl.phi.slice().sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .map((f, i) => ({ ...f, rank: i + 1, label: FEATURE_BY_KEY[f.key].label }));
}

export function topSet(ranked) {
  return ranked.filter((f, i) => i < TOP_K && Math.abs(f.c) >= MIN_CONTRIB);
}

/* ---------- the facts, with ids ---------- */
export function buildFacts(ctx) {
  const { patient, ranked, prob, baseProb, modelName, flagged, threshold, news, ward } = ctx;
  const facts = [];
  const add = (text, value) => { const id = 'F' + (facts.length + 1); facts.push({ id, text, value }); return id; };
  add(`model: ${modelName}`, null);
  add(`risk of deterioration within 24 hours: ${pct(prob)}%`, prob * 100);
  add(`baseline risk (average training patient): ${pct(baseProb)}%`, baseProb * 100);
  add(`alert threshold: ${pct(threshold)}%; ${flagged ? 'flagged' : 'not flagged'}`, threshold * 100);
  add(`NEWS2 total: ${news.total} (${news.risk.label})`, news.total);
  add(`age: ${patient.age}`, patient.age);
  ranked.forEach((f) => add(`${f.label}: ${fmtValue(f.key, f.value)}; contribution ${f.c >= 0 ? '+' : ''}${f.c.toFixed(2)} log-odds (${f.c >= 0 ? 'raises' : 'lowers'} risk), rank ${f.rank}`,
    FEATURE_BY_KEY[f.key].binary ? null : +(+f.value).toFixed(2)));
  const wardFacts = [];
  if (ward) {
    const w = (text, value) => { const id = 'W' + (wardFacts.length + 1); wardFacts.push({ id, text, value }); return id; };
    w(`ward time: ${ward.clock}`, null);
    w(`beds flagged by NEWS2 so far: ${ward.newsFlagged}`, ward.newsFlagged);
    w(`beds flagged by the model so far: ${ward.modelFlagged}`, ward.modelFlagged);
    w(`deteriorations so far: ${ward.events}`, ward.events);
    w(`beds on the ward: ${ward.beds}`, ward.beds);
  }
  return { facts, wardFacts };
}

const fmtNum = (f) => (f.key === 'temp' ? (+f.value).toFixed(1) : FEATURE_BY_KEY[f.key].derived ? f.value : Math.round(f.value));

/* ---------- the deterministic explanation ---------- */
export function templateExplanation(ctx) {
  const { ranked, prob, baseProb, modelName, flagged, threshold, news, ward } = ctx;
  const { facts } = buildFacts(ctx);
  const top = topSet(ranked);
  const fid = (key) => facts.find((f) => f.text.startsWith(FEATURE_BY_KEY[key].label + ':'))?.id;
  const up = top.filter((f) => f.c > 0), down = top.filter((f) => f.c < 0);
  const sentences = [];
  sentences.push({ text: `The ${modelName} puts this synthetic patient's risk of deterioration within 24 hours at ${pct(prob)}%, against a baseline of ${pct(baseProb)}%, so it ${flagged ? 'flags' : 'does not flag'} them at its ${pct(threshold)}% threshold.`, facts: ['F2', 'F3', 'F4'] });
  if (up.length) sentences.push({ text: `Risk is raised most by ${up.map((f) => phrase(f.key, fmtNum(f))).join(', then ')}.`, facts: up.map((f) => fid(f.key)) });
  if (down.length) sentences.push({ text: `Risk is lowered by ${down.map((f) => phrase(f.key, fmtNum(f))).join(' and ')}.`, facts: down.map((f) => fid(f.key)) });
  if (!top.length) sentences.push({ text: 'No single input moves the risk far from the baseline.', facts: ['F3'] });
  sentences.push({ text: `NEWS2 scores the same observations ${news.total}, ${news.risk.label.toLowerCase()} clinical risk.`, facts: ['F5'] });
  const out = { sentences, factors: top.map((f) => ({ feature: f.label, direction: f.c > 0 ? 'raises' : 'lowers' })) };
  if (ward) out.ward = { text: `At ${ward.clock}, NEWS2 has flagged ${ward.newsFlagged} beds and the model ${ward.modelFlagged}, with ${ward.events} deteriorations so far.`, facts: ['W1', 'W2', 'W3', 'W4'] };
  return out;
}

/* ---------- the prompt: one call, one JSON object ---------- */
export function buildRequest(ctx) {
  const { facts, wardFacts } = buildFacts(ctx);
  const system = 'You explain the output of a risk model on a SYNTHETIC patient in an educational interpretability demo. ' +
    'Use only the facts given, and cite the id of every fact a sentence uses. Describe what the model computed; ' +
    'never recommend tests, treatment, escalation or any clinical action. ' +
    `Name at most ${TOP_K} factors, largest contributions first, using the exact feature names in the facts. ` +
    'A positive contribution raises the risk; a negative one lowers it.';
  const prompt = 'Patient facts:\n' + facts.map((f) => `${f.id}: ${f.text}`).join('\n') +
    (wardFacts.length ? '\n\nWard facts:\n' + wardFacts.map((f) => `${f.id}: ${f.text}`).join('\n') : '') +
    '\n\nReturn JSON: {"sentences": [{"text": "one plain sentence", "facts": ["F2", "F7"]}] (two to four sentences, at most 80 words in total), ' +
    '"factors": [{"feature": "<exact feature name>", "direction": "raises" | "lowers"}]' +
    (wardFacts.length ? ', "ward": {"text": "one sentence about the ward", "facts": ["W2"]}' : '') + '}';
  return { system, prompt, facts, wardFacts };
}

/* ---------- the audit ---------- */
const LEX = FEATURES.flatMap((f) => f.syn.map((s) => ({ key: f.key, group: f.group, s }))).sort((a, b) => b.s.length - a.s.length);
const ADVICE = /\b(should|must|recommend\w*|advis\w*|administer\w*|prescrib\w*|dose|dosing|diagnos\w*|treat(ment|ed|ing)?|give (fluids|oxygen|antibiotics)|start(ing)? (antibiotics|oxygen|fluids)|consult|refer(ral)?|call (the|a) (doctor|team))\b/i;
const UP = /\b(rais\w*|increas\w*|push\w* (it |the risk )?up|higher|adds?|add(ing|ed)|elevat\w*|drives? up)\b/i;
const DOWN = /\b(lower\w*|reduc\w*|decreas\w*|pull\w* (it |the risk )?down|offset\w*|protect\w*|reassur\w*)\b/i;

function featureOf(name) {
  const n = String(name || '').toLowerCase().replace(/₂/g, '2').trim();
  const exact = FEATURES.find((f) => f.label.toLowerCase().replace(/₂/g, '2') === n || f.short.toLowerCase() === n || f.key === n);
  if (exact) return exact.key;
  const hit = LEX.find((e) => n.includes(e.s));
  return hit ? hit.key : null;
}

export function mentions(text) {
  let t = ' ' + String(text).toLowerCase().replace(/₂/g, '2').replace(/[^a-z0-9.%° -]/g, ' ') + ' ';
  const found = [];
  for (const e of LEX) {
    const re = new RegExp('(^|[^a-z])' + e.s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-z]|$)', 'g');
    if (re.test(t)) {
      if (!found.some((f) => f.group === e.group)) found.push({ key: e.key, group: e.group, word: e.s });
      t = t.replace(re, '$1 ');
    }
  }
  return found;
}

function knownNumbers(ctx) {
  const { patient, ranked, prob, baseProb, threshold, news, ward } = ctx;
  const out = [prob * 100, baseProb * 100, threshold * 100, news.total, patient.age, 24,
    ...['rr', 'spo2', 'sbp', 'hr', 'temp'].map((k) => +patient[k]),
    ...ranked.map((f) => Math.abs(+f.value)), ...ranked.map((f) => Math.abs(f.c))];
  if (ward) out.push(ward.newsFlagged, ward.modelFlagged, ward.events, ward.beds, ward.hour + 8);
  return out.filter(Number.isFinite);
}

function auditSentence(text, cites, ctx, top, byGroup, ids) {
  const checks = [];
  const known = knownNumbers(ctx);
  const struck = [];
  const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20 };
  const tokens = [...String(text).matchAll(/\d+(?:\.\d+)?|\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\b/gi)];
  for (const m of tokens) {
    const s = m[0], v = /\d/.test(s) ? parseFloat(s) : WORDS[s.toLowerCase()];
    if (/\d/.test(s) && s.length === 1 && v <= TOP_K) continue;
    const ok = known.some((k) => Math.abs(k - v) <= Math.max(0.6, Math.abs(k) * 0.02));
    checks.push({ kind: 'number', ok, text: ok ? `${s} matches a computed value` : `${s} matches no computed value` });
    if (!ok) struck.push(s);
  }
  const named = mentions(text);
  const topGroups = new Set(top.map((f) => FEATURE_BY_KEY[f.key].group));
  for (const m of named) {
    const f = byGroup[m.group];
    const ok = topGroups.has(m.group);
    checks.push({ kind: 'feature', ok, word: m.word, group: m.group,
      text: ok ? `names ${FEATURE_BY_KEY[f.key].label.toLowerCase()}, rank ${f.rank}`
        : f ? `names ${FEATURE_BY_KEY[f.key].label.toLowerCase()} ("${m.word}"), rank ${f.rank}, not a top contribution` : `names "${m.word}", which this model does not read` });
  }
  if (named.length === 1 && byGroup[named[0].group]) {
    const up = UP.test(text), down = DOWN.test(text);
    if (up !== down) {
      const f = byGroup[named[0].group];
      const ok = Math.sign(f.c) === (up ? 1 : -1);
      checks.push({ kind: 'direction', ok, text: `says ${FEATURE_BY_KEY[f.key].label.toLowerCase()} ${up ? 'raises' : 'lowers'} risk; contribution ${f.c >= 0 ? '+' : ''}${f.c.toFixed(2)}` });
    }
  }
  const adv = String(text).match(ADVICE);
  if (adv) checks.push({ kind: 'advice', ok: false, blocked: true, text: `blocked: reads as clinical advice ("${adv[0]}")` });
  const cited = (Array.isArray(cites) ? cites : []).map(String);
  if (!cited.length) checks.push({ kind: 'cite', ok: false, soft: true, text: 'cites no fact' });
  else {
    const bad = cited.filter((c) => !ids.has(c));
    if (bad.length) checks.push({ kind: 'cite', ok: false, text: `cites unknown facts ${bad.join(', ')}` });
  }
  return { text: String(text), checks, struck, blocked: !!adv };
}

export function verify(reply, ctx) {
  const { ranked } = ctx;
  const top = topSet(ranked);
  const byGroup = {};
  for (const f of ranked) { const g = FEATURE_BY_KEY[f.key].group; if (!byGroup[g] || Math.abs(f.c) > Math.abs(byGroup[g].c)) byGroup[g] = f; }
  const byKey = Object.fromEntries(ranked.map((f) => [f.key, f]));
  const { facts, wardFacts } = buildFacts(ctx);
  const ids = new Set([...facts, ...wardFacts].map((f) => f.id));
  let sentences = Array.isArray(reply?.sentences) ? reply.sentences : null;
  if (!sentences && typeof reply?.summary === 'string') sentences = [{ text: reply.summary, facts: [] }];
  sentences = (sentences || []).filter((x) => x && typeof x.text === 'string' && x.text.trim()).slice(0, 8);
  const out = sentences.map((x) => auditSentence(x.text, x.facts, ctx, top, byGroup, ids));
  const factorChecks = [];
  const factors = Array.isArray(reply?.factors) ? reply.factors.slice(0, 8) : [];
  if (!factors.length) factorChecks.push({ kind: 'factor', ok: false, text: 'the reply listed no factors' });
  const topKeys = new Set(top.map((f) => f.key));
  for (const fc of factors) {
    const key = featureOf(fc?.feature);
    const f = key && byKey[key];
    if (!f) { factorChecks.push({ kind: 'factor', ok: false, text: `"${fc?.feature}" is not an input of this model` }); continue; }
    const dir = /lower|decreas|reduc|down/i.test(fc.direction || '') ? -1 : 1;
    const ok = topKeys.has(key) && Math.sign(f.c) === dir;
    factorChecks.push({ kind: 'factor', ok, text: `${f.label}: rank ${f.rank}, ${f.c >= 0 ? '+' : ''}${f.c.toFixed(2)} log-odds` +
      (!topKeys.has(key) ? `, outside the top ${top.length}` : '') + (Math.sign(f.c) !== dir ? `, but listed as ${dir > 0 ? 'raising' : 'lowering'} risk` : '') });
  }
  const ward = reply?.ward && typeof reply.ward.text === 'string' ? auditSentence(reply.ward.text, reply.ward.facts, ctx, top, byGroup, ids) : null;
  const all = [...out.flatMap((s) => s.checks), ...factorChecks, ...(ward ? ward.checks : [])];
  const hard = all.filter((c) => !c.ok && !c.soft);
  const claims = all.filter((c) => ['number', 'feature', 'direction', 'factor'].includes(c.kind));
  const verifiedGroups = new Set(out.flatMap((s) => s.checks.filter((c) => c.kind === 'feature' && c.ok).map((c) => c.group)));
  return {
    sentences: out, factorChecks, ward, ok: hard.length === 0, bad: hard.length, total: all.length,
    claims: { n: claims.length, verified: claims.filter((c) => c.ok).length, wrong: claims.filter((c) => !c.ok).length },
    verifiedGroups,
  };
}

/* ---------- one call ---------- */
export async function explainWithModel(ctx, { signal } = {}) {
  const { system, prompt } = buildRequest(ctx);
  const t = templateExplanation(ctx);
  const r = await LLM.complete({
    system, prompt, json: true, temperature: 0.2, seed: 7, signal, maxWaitMs: 50000, timeoutMs: 60000,
    fallback: () => t,
  });
  let reply = r.json;
  let usedTemplate = r.source === 'offline';
  const usable = reply && (Array.isArray(reply.sentences) ? reply.sentences.some((x) => x && typeof x.text === 'string') : typeof reply.summary === 'string');
  if (!usable) { reply = t; usedTemplate = true; }
  return { reply, source: usedTemplate ? 'offline' : r.source, model: r.model, ms: r.ms, errors: r.errors, audit: verify(reply, ctx), template: t };
}
