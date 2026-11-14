/* DATASPACE: the bit count against an independent Shannon sum over the
   same tokens, and the degradation readout of the running lab. */
import { REFERENCES } from '../../config.js';

const TEXT = 'the cat saw the dog and the dog saw the cat';
/* GPT-2 pre-tokenizer pattern (Radford et al., 2019), written out here
   independently of the lab's copy. */
const GPT2 = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
function shannon(text) {
  const t = text.match(GPT2) || [];
  const n = t.length, freq = {};
  t.forEach((x) => (freq[x] = (freq[x] || 0) + 1));
  return t.reduce((a, x) => a - Math.log2(freq[x] / n), 0);
}

export const PROBES = {
  'ds-bits': {
    what: 'typing a known sentence into the running lab and comparing its bit count with an independent Shannon sum',
    fails: 'fails if the lab\'s bits differ from -sum log2 p by more than 1 bit',
    async run(ctx) {
      const f = await ctx.frame('dataspace.html', { ready: (a) => a.$('#src') && /\d/.test(a.text('#m_src')) });
      const src = f.$('#src');
      src.value = TEXT;
      src.dispatchEvent(new f.win.Event('input', { bubbles: true }));
      const got = await f.wait((a) => { const v = a.text('#m_src'); return /^\d+$/.test(v) && Number(v) < 500 && v; }, 2500);
      if (!got) return { status: 'error', detail: 'the lab did not re-measure the typed text' };
      const lab = Number(got), mine = shannon(TEXT);
      return {
        status: 'pass', verdict: Math.abs(lab - mine) <= 1 ? 'partial' : 'unsupported', value: lab, expected: mine,
        detail: `"${TEXT}": the lab reads ${lab} bits, the independent sum gives ${mine.toFixed(2)} (${REFERENCES.shannon.cite}); word-frequency self-information, with no cost for the dictionary`,
      };
    },
  },
  'ds-fidelity': {
    what: 'loading the lab (?still) and reading fidelity and degradation',
    fails: 'fails if the readouts are gone or do not sum to 100%',
    async run(ctx) {
      const f = await ctx.frame('dataspace.html?still', { ready: (a) => /%/.test(a.text('#m_fid')) });
      const fid = parseFloat(f.text('#m_fid')), deg = parseFloat(f.text('#m_deg')), counts = f.text('#d_counts'), label = f.text('#src_t');
      const ok = Math.abs(fid + deg - 100) <= 1;
      return {
        status: ok ? 'pass' : 'fail', verdict: 'partial',
        detail: `fidelity ${fid}% and degradation ${deg}% (${counts}); the pair scored is labelled "${label}"`,
      };
    },
  },
};
