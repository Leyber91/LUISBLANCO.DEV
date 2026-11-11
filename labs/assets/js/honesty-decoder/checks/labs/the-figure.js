/* The Figure: the router's clustering as the running lab shows it, and
   whether its result ever reaches the aggregator prompt. */
export const PROBES = {
  'fg-route': {
    what: 'loading the lab (?still) in a hidden frame and reading the router line, then reading the aggregator prompt for it',
    fails: 'supported only if the clustering is shown and its result reaches the aggregator; partial if shown only',
    async run(ctx) {
      const f = await ctx.frame('figure.html?still', { ready: (a) => /agree:/.test(a.text('#a_route')) });
      const line = f.text('#a_route');
      const { text } = await ctx.file('labs/figure.html');
      const head = 'You have been given responses from three persona-framed passes';
      const at = text.indexOf(head);
      const block = at < 0 ? '' : text.slice(at + head.length, at + head.length + 700);
      const routed = /agg\.route|clusters?\b|computeClusters/.test(block);
      return {
        status: 'pass', verdict: /agree:.*dissent:/.test(line) ? (routed ? 'supported' : 'partial') : 'unsupported',
        detail: `the running lab shows "${line}"; the aggregator prompt ${routed ? 'receives' : 'never receives'} the clustering`,
      };
    },
  },
};
