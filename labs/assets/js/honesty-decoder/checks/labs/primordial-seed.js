/* Primordial Seed: determinism by two independent loads, and the minted rules. */
const read = (f) => ({ gen: f.text('#r_gen'), seg: f.text('#r_seg'), carry: f.text('#r_carry'), rules: f.text('#rl_count') });

export const PROBES = {
  'ps-determinism': {
    what: 'loading the lab (?still) twice in separate frames and comparing every readout',
    fails: 'fails if two loads of the same preset disagree on any count',
    async run(ctx) {
      const ready = (a) => a.text('#r_seg') && a.text('#r_seg') !== '0';
      const a = read(await ctx.frame('seed.html?still', { ready }));
      ctx.runner.disposeFrames();
      const b = read(await ctx.frame('seed.html?still', { ready }));
      const same = JSON.stringify(a) === JSON.stringify(b);
      return { status: 'pass', verdict: same ? 'supported' : 'unsupported', detail: `two loads: generation ${a.gen} and ${b.gen}, segments ${a.seg} and ${b.seg}, carried ${a.carry} and ${b.carry}` };
    },
  },
  'ps-minted': {
    what: 'loading the lab (?still) and counting the rules it crystallised',
    fails: 'unsupported if no rule is minted; partial while minted rules are frozen and never re-grown',
    async run(ctx) {
      const f = await ctx.frame('seed.html?still', { ready: (a) => a.count('#rules .rule') > 0 });
      const minted = f.count('#rules .rule.cr'), label = f.text('#rl_count');
      const { text } = await ctx.file('labs/seed.html');
      const frozen = text.includes('if(S.minted[c]) out.push(c);');
      return {
        status: 'pass', verdict: minted === 0 ? 'unsupported' : frozen ? 'partial' : 'supported',
        detail: `${minted} minted rules (${label.replace(/^·\s*/, '')}); ${frozen ? 'rewrite() copies minted symbols unchanged, so they are frozen' : 'minted symbols are rewritten'}`,
      };
    },
  },
};
