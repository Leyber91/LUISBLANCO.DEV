/* Trending Topics: the labelled snapshot path of the running lab. The
   live scan is not run here: it would contact hosts this page does not
   use; the live endpoints are checked as cited lines instead. */
export const PROBES = {
  'tr-board': {
    what: 'loading the lab at ?demo (no network, no model) and reading its board and snapshot label',
    fails: 'fails if the fallback board is not labelled with its capture date',
    async run(ctx) {
      const f = await ctx.frame('trending.html?demo', { ready: (a) => a.count('#board li.row') > 0 });
      const n = f.count('#board li.row'), when = f.text('#meta-time'), lead = f.text('#feat-link');
      const dated = /\d{4}-\d{2}-\d{2}/.test(when);
      return {
        status: dated ? 'pass' : 'fail', verdict: 'supported',
        detail: `${n} rows on the fallback board, led by "${lead}", labelled "${when}"; live scans fetch three public APIs (cited lines)`,
      };
    },
  },
};
