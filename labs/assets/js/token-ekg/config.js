/* ============================================================
   token-ekg/config.js — constants, presets and sources.
   No DOM here: record-traces.mjs and tests/run.mjs import it under Node.
   Endpoints come from the site's shared model config (ai/config.js).
   ============================================================ */

import { AI_CONFIG } from '../ai/config.js';

/* ---- tokenizers -----------------------------------------------------------------------------
   Four vocabularies from three families, each loaded only when first needed.
   tiktoken pair: gpt-tokenizer 3.4.0 by Bazyli Brzoska, MIT (github.com/niieani/gpt-tokenizer),
   pinned, from jsDelivr; o200k_base is about 0.8 MB of ranks (brotli), cl100k_base about 0.4 MB.
   The other two are this repo's re-implementation (engine/bpe.js) of Hugging Face tokenizer.json
   files, Apache-2.0 (data/tokenizers/LICENSE-Apache-2.0.txt); 0.6 MB and 0.4 MB gzipped.
   "used" for the tiktoken pair follows gpt-tokenizer's map (esm/modelsMap.js, after tiktoken's
   model.py). Vocabulary sizes include special tokens.                                            */
export const TOKENIZERS = [
  { id: 'o200k_base', short: 'o200k', family: 'tiktoken byte-level BPE', kind: 'gpt-tokenizer', vocab: 200019,
    version: 'gpt-tokenizer 3.4.0', licence: 'MIT', used: 'GPT-4o, o1, GPT-5; gpt-oss uses the same merges' },
  { id: 'cl100k_base', short: 'cl100k', family: 'tiktoken byte-level BPE', kind: 'gpt-tokenizer', vocab: 100277,
    version: 'gpt-tokenizer 3.4.0', licence: 'MIT', used: 'GPT-4, GPT-3.5-turbo, text-embedding-3' },
  { id: 'qwen3', short: 'Qwen3', family: 'Hugging Face byte-level BPE', kind: 'bytelevel', vocab: 151669,
    file: 'data/tokenizers/qwen3.bpe.txt', version: 'Qwen/Qwen3-8B tokenizer.json @ b968826', licence: 'Apache-2.0',
    used: 'Qwen3 models (qwen3:* in Ollama)', match: /^qwen3/i },
  { id: 'mistral-v03', short: 'Mistral', family: 'SentencePiece BPE, byte fallback', kind: 'sentencepiece', vocab: 32768,
    file: 'data/tokenizers/mistral-v03.bpe.txt', version: 'mistralai/Mistral-7B-Instruct-v0.3 tokenizer.json @ c170c70',
    licence: 'Apache-2.0', used: 'Mistral 7B v0.3 (mistral:7b in Ollama)', match: /^mistral/i },
];
export const GPT_TOKENIZER = {
  version: '3.4.0',
  url: (enc) => `https://cdn.jsdelivr.net/npm/gpt-tokenizer@3.4.0/esm/encoding/${enc}.js`,
};
// kept for older imports
export const TOKENIZER = { version: GPT_TOKENIZER.version, url: GPT_TOKENIZER.url, encodings: TOKENIZERS.slice(0, 2) };
export const REFERENCE = { file: 'data/tokenizer-reference.json' };

/* ---- the parallel text ----------------------------------------------------------------------
   Universal Declaration of Human Rights, Article 1, from the UDHR in XML project
   (https://github.com/eric-muller/udhr, commit 588b3f4, 2026-07-28), which reproduces the OHCHR
   translations. The project: "The UDHR and all its translations are obviously part of our
   commons." Article 1 was extracted verbatim from each udhr_<code>.xml.                         */
export const PARALLEL = {
  file: 'data/udhr-article1.json',
  source: 'UDHR Article 1, UDHR in XML project (eric-muller/udhr @ 588b3f4), OHCHR translations',
  baseline: 'eng',
};

/* ---- the local model server: from the shared config ------------------------------------------ */
export const OLLAMA = {
  base: AI_CONFIG.ollama?.base || 'http://localhost:11434',
  prefer: ['llama3.1:8b', 'qwen3:8b', 'mistral:7b', 'qwen3:4b', 'qwen3:0.6b'],
  probeMs: 12000, // /api/tags took 1.5 s, and 8.2 s under heavy load, on the recording machine
  originsHint: 'OLLAMA_ORIGINS=https://luisblanco.dev ollama serve',
};

/* ---- prompts --------------------------------------------------------------------------------
   short, long and oneshot are the prompts the shipped recordings used, so a visitor with a local
   model can rerun a recording and compare. The others are built to provoke different cadence.  */
export const PROMPTS = {
  short: { label: 'short answer', text: 'Explain in about 120 words why a language model streams its answer one token at a time.' },
  long: {
    label: 'long context (UDHR, 10.6k chars)',
    // the context document (the full UDHR in English) is prepended at run time; see longContext()
    text: 'Using only the document above, which article protects freedom of movement, and what does it say? Answer in two sentences.',
  },
  code: { label: 'long code', text: 'Write a Python function that parses an ISO 8601 date string without any imports, with a docstring and three test cases.' },
  list: { label: 'numbered list', text: 'List the numbers from 1 to 60, one per line, each followed by its square.' },
  script: { label: 'non-Latin script', text: 'Translate into Hindi, Japanese and Arabic, one line each: "Every token arrives at its own time."' },
  reason: { label: 'reasoning task', text: 'A train leaves at 14:05 and arrives at 17:50, stopping twice for 7 minutes each. How long is it moving? Think step by step, then give the answer.' },
  oneshot: { label: 'one reply', text: 'In three sentences, explain what a token is to a language model.' },
};
export const LIVE_PRESETS = ['short', 'long', 'code', 'list', 'script', 'reason'];

export function longContext(doc, question) {
  return `${doc.trim()}\n\n---\n\n${question}`;
}

/* ---- interval analysis ----------------------------------------------------------------------
   A stall is an inter-chunk interval longer than STALL_K times the median interval of the same
   stream, and at least STALL_MIN_MS. An interval under BUFFER_MS is a buffered arrival: the chunks
   left the reader together. Both thresholds are choices made for this page, not standards.   */
export const ANALYSIS = {
  STALL_K: 4,
  STALL_MIN_MS: 40,
  BUFFER_MS: 2,
  HIST_BINS: 28,
};

/* ---- the sweep ------------------------------------------------------------------------------
   Ten major divisions across the strip, as on electrocardiograph paper. ms per major division. */
export const SWEEP = {
  divisions: 10,
  presets: [5, 25, 100, 250, 1000],
  initial: 250,
  minorPerMajor: 5,
};

/* ---- the trace shelf ------------------------------------------------------------------------- */
export const SHELF = {
  storeKey: 'lb.tokenekg.traces.v1',
  maxSaved: 24,
  maxChunks: 6000,
};
