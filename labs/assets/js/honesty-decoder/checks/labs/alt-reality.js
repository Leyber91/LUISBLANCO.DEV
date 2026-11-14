/* Alternate Reality Scenarios: the consistency ledger as the running lab shows it. */
export const PROBES = {
  'av-ledger': {
    what: 'loading the lab at ?still&tab=dossier in a hidden frame and reading its consistency ledger',
    fails: 'supported needs every structural check passed and at least one causal edge audited; partial with 0 audited',
    async run(ctx) {
      const f = await ctx.frame('altverse.html?still&tab=dossier', { ready: (a) => /\d+\s*\/\s*\d+/.test(a.text('.av-ledger-top')) });
      const t = f.text('.av-ledger-top'), name = f.text('.av-world-name'), tier = f.text('.av-tier');
      const m = t.match(/(\d+)\s*\/\s*(\d+)/), aud = t.match(/edges audited:\s*(\d+)/i);
      const all = m && m[1] === m[2], audited = aud ? Number(aud[1]) : 0;
      return {
        status: 'pass', verdict: all && audited > 0 ? 'supported' : all ? 'partial' : 'unsupported',
        detail: `world ${name} (${tier}): ${m ? `${m[1]}/${m[2]} structural checks` : 'no ledger count'}, ${audited} causal edges audited`,
      };
    },
  },
};
