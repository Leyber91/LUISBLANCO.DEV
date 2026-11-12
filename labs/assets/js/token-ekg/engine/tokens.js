/* ============================================================
   token-ekg/engine/tokens.js — real tokenizers, in the page.

   Loads the three tokenizers listed in config.js on demand (OpenAI's
   o200k_base and cl100k_base through gpt-tokenizer 3.4.0, MIT; Qwen3
   through engine/bpe.js) and splits text into its actual tokens.

   Display units. A token is a run of bytes, and a byte-pair
   vocabulary is free to cut a character in the middle: one Burmese
   or Amharic letter can cost two or three tokens. tokenize() groups
   tokens into units that each end on a whole UTF-8 character, so a
   unit is either one token, or several tokens that together make a
   character (marked split). Bytes come from the encoder's own table
   (bytePairEncodingCoreProcessor.tryDecodeToken, an internal of the
   pinned version); decode() is not used per token because in 3.4.0
   it shares one streaming TextDecoder across calls, which carries a
   partial character into the next call.
   ============================================================ */

import { TOKENIZERS, GPT_TOKENIZER } from '../config.js';
import { byteLevelFromText } from './bpe.js';

const loading = new Map();
const utf8 = new TextEncoder();

/**
 * A fix for gpt-tokenizer 3.4.0, found by the reference test (data/tokenizer-reference.json,
 * text "zero-width"): it disagreed with tiktoken on a byte-order mark. Clears its merge cache.
 */
export function patchBom(core) {
  if (!core || typeof core.getBpeRankFromString !== 'function' || core._bomPatched) return;
  // gpt-tokenizer looks byte runs up by decoding them with a default TextDecoder, which drops a
  // leading byte-order mark: EF BB BF alone becomes "" (so o200k token 5574 is never found) and
  // EF BB BF + "bom" becomes "bom" (a false match). Decode with the mark kept, then fall back to
  // the table of byte-only tokens.
  const keep = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  core.getBpeRankFromBytes = (key) => {
    let s;
    try { s = keep.decode(key); } catch { s = undefined; }
    if (s !== undefined) {
      const r = core.getBpeRankFromString(s);
      if (r !== undefined) return r;
    }
    const i = core.binarySearch(key);
    return i !== -1 ? core.bytePairNonUtfSortedEncoder[i][1] : undefined;
  };
  if (core.mergeCache) core.mergeCache.clear();
  core._bomPatched = true;
}

/** Load an encoding module once. Resolves to { encode, decode, vocabularySize, raw }. */
export function loadEncoding(id) {
  if (!loading.has(id)) {
    const p = import(/* @vite-ignore */ GPT_TOKENIZER.url(id)).then((m) => {
      const api = m.default || m;
      const core = api.bytePairEncodingCoreProcessor;
      patchBom(core);
      return {
        id,
        encode: m.encode,
        vocabularySize: m.vocabularySize,
        bytesOf: core && typeof core.tryDecodeToken === 'function'
          ? (tok) => {
              const v = core.tryDecodeToken(tok);
              return typeof v === 'string' ? utf8.encode(v) : v ? Uint8Array.from(v) : new Uint8Array(0);
            }
          : null,
        decode: m.decode,
      };
    });
    loading.set(id, p);
    p.catch(() => loading.delete(id));
  }
  return loading.get(id);
}

/**
 * Load any of the tokenizers in config.js by its id, once. Every result has the same face:
 * { id, encode(text) -> ids, bytesOf(id) -> Uint8Array, vocabularySize }.
 * base: the URL the data/ files are relative to (the module's own folder).
 */
export function loadTokenizer(id, base) {
  const def = TOKENIZERS.find((t) => t.id === id);
  if (!def) return Promise.reject(new Error('unknown tokenizer ' + id));
  if (def.kind === 'gpt-tokenizer') return loadEncoding(id).then((e) => ({ ...e, vocabularySize: def.vocab }));
  if (def.kind !== 'bytelevel') return Promise.reject(new Error(`no loader for tokenizer kind ${def.kind}`));
  if (!loading.has(id)) {
    const p = fetch(new URL(def.file, base)).then((r) => {
      if (!r.ok) throw new Error(`${def.file}: http ${r.status}`);
      return r.text();
    }).then((txt) => byteLevelFromText(id, txt));
    loading.set(id, p);
    p.catch(() => loading.delete(id));
  }
  return loading.get(id);
}

/** Length of the UTF-8 sequence a lead byte starts, or 0 for a continuation byte. */
function seqLen(b) {
  if (b < 0x80) return 1;
  if (b >= 0xF0) return 4;
  if (b >= 0xE0) return 3;
  if (b >= 0xC0) return 2;
  return 0;
}

/** True when the bytes end exactly on a character boundary. */
function endsWhole(bytes) {
  const n = bytes.length;
  for (let back = 1; back <= 4 && back <= n; back++) {
    const L = seqLen(bytes[n - back]);
    if (L) return back >= L;
  }
  return true; // only continuation bytes: invalid, treat as closed so the run cannot grow forever
}

const textDec = new TextDecoder('utf-8');

/**
 * Split text into tokens.
 * @returns {{ ids:number[], units:Array<{text:string, ids:number[], bytes:number[], split:boolean}> }}
 */
export function tokenize(enc, text) {
  const ids = enc.encode(text);
  if (!enc.bytesOf) {
    return { ids, units: [{ text, ids, bytes: [], split: false }] };
  }
  const units = [];
  let accIds = [], accBytes = [];
  for (const id of ids) {
    const b = enc.bytesOf(id);
    accIds.push(id);
    for (const x of b) accBytes.push(x);
    if (endsWhole(accBytes) || accIds.length >= 8) {
      units.push({
        text: textDec.decode(Uint8Array.from(accBytes)),
        ids: accIds,
        bytes: accBytes,
        split: accIds.length > 1,
      });
      accIds = [];
      accBytes = [];
    }
  }
  if (accIds.length) units.push({ text: textDec.decode(Uint8Array.from(accBytes)), ids: accIds, bytes: accBytes, split: accIds.length > 1 });
  return { ids, units };
}

const segCache = new Map();
function segmenter(lang, granularity) {
  const key = lang + '|' + granularity;
  if (!segCache.has(key)) {
    let s = null;
    try { s = new Intl.Segmenter(lang || undefined, { granularity }); } catch { s = null; }
    segCache.set(key, s);
  }
  return segCache.get(key);
}

/** Characters (code points), graphemes, words and UTF-8 bytes of a text. Words use Intl.Segmenter. */
export function measureText(text, lang) {
  const chars = [...text].length;
  const bytes = utf8.encode(text).length;
  let graphemes = chars, words = NaN;
  const g = segmenter(lang, 'grapheme');
  if (g) { graphemes = 0; for (const _ of g.segment(text)) graphemes++; }
  const w = segmenter(lang, 'word');
  if (w) { words = 0; for (const s of w.segment(text)) if (s.isWordLike) words++; }
  return { chars, graphemes, words, bytes };
}

/** Count tokens without building display units. */
export function count(enc, text) {
  return enc.encode(text).length;
}
