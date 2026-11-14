/* The Roaster: the running lab with a named system and no model call. */
export const PROBES = {
  'rs-state': {
    what: 'loading the lab at ?sys=0&still (no model call) and reading the named system and its grade',
    fails: 'fails if no system can be named or no claim box exists',
    async run(ctx) {
      const f = await ctx.frame('roaster.html?sys=0&still', { ready: (a) => a.text('#sys') && a.text('#sys') !== '—' });
      const sys = f.text('#sys'), pct = f.text('#pct'), box = !!f.$('#claim');
      return {
        status: sys && box ? 'pass' : 'fail', verdict: 'supported',
        detail: `named system "${sys}" with a grade of ${pct}, read from the page's own table; free-text box ${box ? 'present' : 'missing'}`,
      };
    },
  },
};
