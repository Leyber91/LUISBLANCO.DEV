/* ============================================================
   memes/ComedyEngine.js — the deterministic local comedy engine.
   Single source of truth for the echo tier AND the parse-failure
   fallback: given {topic, tone, seed} it drafts a slate, scores
   each candidate against the taste rubric, picks a winner, and can
   narrate the four-phase reasoning. Pure logic — no DOM, no canvas.
   ============================================================ */

import {
  TONE_FLAVOR, TONE_FALLBACK, MOTIFS, CRINGE, CAND_IDS, SCORE, VERDICTS,
  LOCAL_REFINEMENT, DEFAULT_SCENE,
} from './constants.js';
import { mulberry32, hashMotif } from './random.js';

const clamp5 = (n) => Math.max(0, Math.min(5, Math.round(n)));
const total = (s) => s.punchy + s.funny + s.onTopic + s.notCringe + s.readable;

export class ComedyEngine {
  /** seed-driven, deterministic meme object matching the model JSON schema */
  build(i) {
    const rnd = mulberry32((i.seed | 0) + hashMotif(i.tone));
    const pool = this._templates(i.topic, i.tone);

    // seed-driven pick of N distinct candidates
    const idx = [];
    while (idx.length < SCORE.candidateCount && idx.length < pool.length) {
      const k = Math.floor(rnd() * pool.length);
      if (!idx.includes(k)) idx.push(k);
    }

    const candidates = idx.map((k, n) => {
      const t = pool[k];
      const scores = this._score(t, i.topic);
      return { id: CAND_IDS[n], top: t.top, bottom: t.bottom, angle: t.angle, scores,
        verdict: this._verdict(scores) };
    });

    const winner = [...candidates].sort((a, b) => total(b.scores) - total(a.scores))[0];
    const motif = MOTIFS[Math.floor(rnd() * MOTIFS.length)];

    return {
      angles: candidates.map((c) => c.angle),
      candidates: candidates.map(({ angle, ...c }) => c),   // strip angle from cards
      winner: { id: winner.id, top: winner.top, bottom: winner.bottom },
      refinement: LOCAL_REFINEMENT,
      scene: { motif, warmCold: 0.45 + rnd() * 0.35, focal: 'center', seed: i.seed },
    };
  }

  /** the four-phase reasoning narration that drives the echo tier's thought stream */
  script(i, local) {
    const f = TONE_FLAVOR[i.tone] || TONE_FLAVOR[TONE_FALLBACK];
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

  /* ---- snowclone templates -> {top, bottom, angle} from a topic + tone ---- */
  _templates(topic, tone) {
    const T = topic.toUpperCase();
    const f = TONE_FLAVOR[tone] || TONE_FLAVOR[TONE_FALLBACK];
    return [
      { angle: `the relatable-pain take on ${topic}`, top: 'NOBODY:', bottom: `ME EXPLAINING ${T} AGAIN` },
      { angle: `the hubris take on ${topic}`, top: 'ONE DOES NOT SIMPLY', bottom: `SHIP ${T} ON A FRIDAY` },
      { angle: `the self-own take on ${topic}`, top: `THEY DON'T KNOW I STILL`, bottom: `DON'T UNDERSTAND ${T}` },
      { angle: `the expectation-vs-reality take on ${topic}`, top: `${T}: THE PITCH`, bottom: 'THE 3AM PAGER ALERT' },
      { angle: `the ${f.tag} take on ${topic}`, top: `${T} WILL FIX EVERYTHING`, bottom: f.closer },
      { angle: `the over-eager take on ${topic}`, top: `${T}?`, bottom: `${T} ALL THE THINGS` },
    ];
  }

  _score(cand, topic) {
    const text = `${cand.top} ${cand.bottom}`.toLowerCase();
    const words = text.split(/\s+/).filter(Boolean).length;
    const tline = Math.max(cand.top.split(/\s+/).length, cand.bottom.split(/\s+/).length);
    const punchy = clamp5(6 - Math.max(0, tline - SCORE.punchyLineFloor));
    const onTopic = topic.toLowerCase().split(/\s+/).some((t) => t.length > 2 && text.includes(t))
      ? SCORE.onTopicHit : SCORE.onTopicMiss;
    const notCringe = CRINGE.some((c) => text.includes(c)) ? SCORE.cringeHit : SCORE.cringeClean;
    const readable = clamp5(6 - Math.max(0, words - SCORE.readableWordFloor) * SCORE.readableWordPenalty);
    // funny: rewards surprise (juxtaposition / self-own), penalizes flatness
    let funny = SCORE.funnyBase;
    if (SCORE.surpriseA.test(text)) funny += 1;
    if (SCORE.surpriseB.test(text)) funny += 1;
    funny = clamp5(funny);
    return { punchy, funny, onTopic, notCringe, readable };
  }

  /* verdict from an ordered strategy list — first matching rule wins (no if/else chain) */
  _verdict(s) {
    const t = total(s);
    return VERDICTS.find((v) => v.test(s, t)).text;
  }
}

/* the schema-completing default scene, shared with the painter + parser */
export const defaultScene = (seed) => ({ ...DEFAULT_SCENE, seed });
