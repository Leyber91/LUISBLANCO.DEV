/* AI Meme Lab: the demo slate as the running lab shows it. */
export const PROBES = {
  'mm-slate': {
    what: 'loading the lab at ?demo (no model call) and counting the candidate cards of its slate',
    fails: 'fails if the slate holds no candidates',
    async run(ctx) {
      const f = await ctx.frame('memes.html?demo', { ready: (a) => a.count('#candidates > *') >= 2 });
      const n = f.count('#candidates > *'), top = f.text('#cap-top'), bottom = f.text('#cap-bottom'), mode = f.text('#ai-status-label');
      return {
        status: n ? 'pass' : 'fail', verdict: 'supported',
        detail: `${n} candidates drafted; committed "${top} / ${bottom}"; route reads "${mode || 'detecting'}"`,
      };
    },
  },
};
