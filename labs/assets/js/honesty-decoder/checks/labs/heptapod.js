/* Heptapod Codec: the default encoding, distinct shapes for distinct
   meanings, and a falsification check: an unknown word must break it. */
const DEFAULT_GLYPHS = 6;

/* Parse the lexicon's feature vectors out of the deployed page. */
function vectors(html) {
  const out = [];
  const rx = /g:"([^"]+)",\s*f:\{([^}]*)\}/g;
  let m;
  while ((m = rx.exec(html))) {
    const f = { limbs: 0, closed: false, w: 0, neg: false, plural: false, orbit: false };
    for (const kv of m[2].split(',')) {
      const [k, v] = kv.split(':').map((s) => s && s.trim());
      if (!k || !(k in f)) continue;
      f[k] = v === 'true' ? true : v === 'false' ? false : Number(v);
    }
    out.push({ g: m[1], key: JSON.stringify(f) });
  }
  return out;
}

export const PROBES = {
  'hp-encode': {
    what: 'loading the lab (?still) in a hidden frame and counting the glyphs of its default sentence',
    fails: 'fails if the default sentence no longer encodes to glyphs',
    async run(ctx) {
      const f = await ctx.frame('heptapod.html?still', { ready: (a) => a.count('#glyphs .gcell') > 0 });
      const n = f.count('#glyphs .gcell'), shown = f.text('#rt_g'), dec = f.text('#decode');
      return {
        status: 'pass', verdict: n > 0 && String(n) === shown ? 'supported' : 'partial', value: n, expected: DEFAULT_GLYPHS,
        detail: `${n} glyphs for the default sentence (readout ${shown}); decode "${dec.slice(0, 90)}"`,
      };
    },
  },
  'hp-vectors': {
    what: 'parsing every lexicon entry\'s feature vector and looking for meanings that share one shape',
    fails: 'supported with 0 shared vectors, partial with up to 5 pairs, unsupported beyond',
    async run(ctx) {
      const { text, commit } = await ctx.file('labs/heptapod.html');
      const v = vectors(text);
      if (!v.length) return { status: 'fail', detail: 'no lexicon entries found' };
      const groups = {};
      v.forEach((x) => (groups[x.key] = groups[x.key] || []).push(x.g));
      const shared = Object.values(groups).filter((g) => g.length > 1);
      const pairs = shared.reduce((a, g) => a + (g.length * (g.length - 1)) / 2, 0);
      return {
        status: 'pass', commit, verdict: pairs === 0 ? 'supported' : pairs <= 5 ? 'partial' : 'unsupported', value: pairs,
        detail: `${v.length} entries; ${pairs} pair${pairs === 1 ? '' : 's'} of meanings share a feature vector: ${shared.map((g) => g.join(' = ')).join('; ') || 'none'}`,
      };
    },
  },
  'hp-break': {
    what: 'typing a sentence with an unknown word into the running lab',
    fails: 'fails if "banana" does not produce a marked fallback glyph: a codec that cannot break is not breakable',
    async run(ctx) {
      const f = await ctx.frame('heptapod.html?still', { ready: (a) => a.count('#glyphs .gcell') > 0 });
      const before = f.count('#glyphs .gcell.miss');
      const inp = f.$('#in');
      inp.value = 'the visitors offer a banana we do not understand';
      inp.dispatchEvent(new f.win.Event('input', { bubbles: true }));
      const after = await f.wait((a) => a.count('#glyphs .gcell.miss') > before && a.count('#glyphs .gcell.miss'), 2000);
      const dec = f.text('#decode');
      const ok = after > before && /banana/.test(dec);
      return { status: 'pass', verdict: ok ? 'supported' : 'unsupported', detail: `marked glyphs ${before} before, ${after || 0} after; decode "${dec.slice(0, 90)}"` };
    },
  },
};
