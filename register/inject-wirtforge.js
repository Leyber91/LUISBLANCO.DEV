#!/usr/bin/env node
/* =========================================================================
   inject-wirtforge.js — Inject WirthForge LLM-measurement concepts into
   the register.  WirthForge (AI Resonance, 2025-09-12) was the first
   instrument built to make LLM behaviour physically observable: spectral
   analysis of the token stream, cognitive radar profiling, real-time load
   patterns, and a composite health score.

   Source evidence:
     - WirthForge / AI Resonance dashboard screenshot (2025-09-12)
     - TokenGateKeeper/research_gemini.md (cognitive-load formula, R_t)
   Input:  work/02_assigned.json
   Output: work/02_assigned.json (appended with new WIRTHFORGE entries)
   ========================================================================= */
const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const WORK     = path.join(__dirname, 'work');
const ASSIGNED = path.join(WORK, '02_assigned.json');

/* ── IV-INTERFACE — instrument / interface concepts (cluster: AETHER) ── */
const INTERFACE_CONCEPTS = [
  {
    name:    'WIRTHFORGE — AI Resonance instrument',
    essence: 'Dashboard that makes LLM behaviour physically observable: spectral, cognitive-radar, load, and pattern panels unified under a single scientific-instrument UI.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    'A',
    cluster: 'AETHER',
    part:    'IV-INTERFACE'
  },
  {
    name:    'WIRTHFORGE — Spectral Analyzer panel',
    essence: 'Token stream rendered as frequency spectrum: dominant frequency, bandwidth, centroid, complexity score, composite health %. Each model has a characteristic spectral fingerprint visible without access to weights.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    'A',
    cluster: 'AETHER',
    part:    'IV-INTERFACE'
  },
  {
    name:    'WIRTHFORGE — Cognitive Radar profile',
    essence: 'Hexagonal/pentagonal capability fingerprint per model: Processing · Latency · Throughput · Coherence · Efficiency · Stochasticity. Makes LLM character visually comparable across models and sessions.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    'A',
    cluster: 'AETHER',
    part:    'IV-INTERFACE'
  },
  {
    name:    'WIRTHFORGE — Pattern Analysis panel',
    essence: 'Time-series visualisation of behavioural patterns across the session. Identifies named rhythm categories: ASYMPTOTIC_SLOW, STABLE, ERRATIC.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    null,
    cluster: 'AETHER',
    part:    'IV-INTERFACE'
  },
  {
    name:    'WIRTHFORGE — Load Meter (Scientific mode)',
    essence: 'Real-time cognitive load gauge with SCIENTIFIC / STANDARD display modes. Composite of token velocity, latency, and throughput; shows model under strain vs. steady cruise.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    null,
    cluster: 'AETHER',
    part:    'IV-INTERFACE'
  },
  {
    name:    'WIRTHFORGE — Observable-time doctrine',
    essence: 'LLM behaviour must be made perceptible in real time, not inferred post-hoc. Every inference session emits a physical record. Precursor to receipt culture and visible AI.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    'B',
    cluster: 'AETHER',
    part:    'IV-INTERFACE'
  }
];

/* ── VII-MEASURE — measurement algorithm concepts (cluster: HONESTY) ── */
const MEASURE_CONCEPTS = [
  {
    name:    'WIRTHFORGE — Token stream as spectral signal',
    essence: 'Token emission timing treated as a biological signal (EEG / EKG analogy). Fourier-style analysis yields dominant frequency, bandwidth, centroid, and complexity of the model\'s output cadence.',
    source:  'WirthForge/AI_Resonance_dashboard + TokenGateKeeper/research_gemini.md',
    tier:    'A',
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — LLM spectral fingerprint',
    essence: 'Each model produces a characteristic frequency profile from its token-timing distribution. Fingerprints are model-identifiable and session-comparable without weight access.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    'A',
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — Stochasticity as measurable axis',
    essence: 'Non-determinism (temperature / sampling variance) quantified as a Cognitive Radar axis — not an error to suppress but a dimension to profile, compare, and deliberately tune.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    'B',
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — Token velocity Rₜ',
    essence: 'Rate of token emission (tokens / second) as primary performance metric. Used to project cost runway, detect degradation before session end, and compare models under equal load.',
    source:  'TokenGateKeeper/research_gemini.md',
    tier:    'B',
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — Asymptotic load pattern',
    essence: 'Named LLM load pattern: model begins fast, plateaus, then asymptotically slows (PATTERN: ASYMPTOTIC_SLOW, RHYTHM: STABLE). Early warning sign preceding full degradation.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    null,
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — Pre-flight cost runway projection',
    essence: 'Calculate expected token spend and budget-exhaustion time BEFORE sending a prompt. Block or warn when runway is insufficient — active intervention, not post-hoc billing.',
    source:  'TokenGateKeeper/research_gemini.md',
    tier:    'B',
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — Cognitive load formula for AI-assisted dev',
    essence: 'L_total = C_d(M) + ∫₀ᵀ C_a(t) dt — total developer cognitive load equals model-selection decision load plus time-integrated auditing load. Quantifies "vibe coding fatigue" and "cognitive archaeology".',
    source:  'TokenGateKeeper/research_gemini.md',
    tier:    'A',
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  },
  {
    name:    'WIRTHFORGE — Health score (composite LLM observable)',
    essence: 'Single 0–100% composite health metric derived from spectral complexity, load stability, coherence, and throughput. First attempt at a model-agnostic vitality gauge readable at a glance.',
    source:  'WirthForge/AI_Resonance_dashboard (screenshot 2025-09-12)',
    tier:    null,
    cluster: 'HONESTY',
    part:    'VII-MEASURE'
  }
];

/* ── main ── */
const existing      = JSON.parse(fs.readFileSync(ASSIGNED, 'utf-8'));
const existingNames = new Set(existing.map(c => c.name.toLowerCase()));

let maxSeq = 0;
for (const c of existing) {
  const m = c.id && c.id.match(/CX-(\d+)/);
  if (m) maxSeq = Math.max(maxSeq, +m[1]);
}

const allNew = [...INTERFACE_CONCEPTS, ...MEASURE_CONCEPTS];
let added = 0, skipped = 0;

for (const e of allNew) {
  if (existingNames.has(e.name.toLowerCase())) { skipped++; continue; }
  maxSeq++;
  existing.push({
    id:          `CX-${String(maxSeq).padStart(4, '0')}`,
    name:        e.name,
    cluster:     e.cluster,
    part:        e.part,
    law:         null,
    tier:        e.tier || null,
    essence:     e.essence,
    status:      'paper-only',
    eras:        [],
    sources:     [e.source],
    aliases:     [],
    potential:   [],
    merged_from: ['inject-wirtforge'],
    links: {
      derives_from: [], enables:    [], requires: [], watches:    [],
      transports:   [], opposes:    [], implements: [], refines:  [], proves: []
    }
  });
  existingNames.add(e.name.toLowerCase());
  added++;
}

fs.writeFileSync(ASSIGNED, JSON.stringify(existing, null, 2));

console.log('=== INJECT-WIRTFORGE REPORT ===');
console.log('New entries added :', added);
console.log('Skipped (duplicate):', skipped);
console.log('Total concepts now :', existing.length);
const iv  = existing.filter(c => c.part === 'IV-INTERFACE').length;
const vii = existing.filter(c => c.part === 'VII-MEASURE').length;
console.log('IV-INTERFACE total :', iv);
console.log('VII-MEASURE  total :', vii);
console.log('Max CX- ID         :', `CX-${String(maxSeq).padStart(4, '0')}`);
console.log('\nWrote:', ASSIGNED);
