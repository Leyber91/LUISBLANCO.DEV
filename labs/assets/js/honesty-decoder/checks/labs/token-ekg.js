/* Token EKG: a measurement check. The running lab is fed a synthetic
   stream (no model is called: its fetch is replaced inside the frame),
   and its own readouts are compared with an independent timer over the
   same chunks. */
const N = 70, GAP_MS = 80, TOL = 0.15;
const CHUNK = 'data: {"choices":[{"delta":{"content":"x"}}]}\n';

export const PROBES = {
  'te-timer': {
    what: `feeding the running lab ${N} synthetic chunks ${GAP_MS} ms apart and timing them independently`,
    fails: `fails if the lab's mean interval or tokens per second is more than ${TOL * 100}% off the independent timer`,
    async run(ctx) {
      const f = await ctx.frame('token-ekg.html?still', { ready: (a) => a.$('#go') && a.text('#n') !== '', w: 420, h: 300 });
      const W = f.win;
      const stamps = [];
      let calls = 0;
      W.fetch = () => {
        calls++;
        const body = new W.ReadableStream({
          start(c) {
            const enc = new W.TextEncoder();
            let k = 0;
            const tick = () => {
              if (k >= N) { c.close(); return; }
              stamps.push(W.performance.now());
              c.enqueue(enc.encode(CHUNK));
              k++;
              W.setTimeout(tick, GAP_MS);
            };
            tick();
          },
        });
        return Promise.resolve(new W.Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
      };
      f.$('#go').click();
      const ok = await f.wait((a) => Number(a.text('#n').replace(/[^\d]/g, '')) >= N, N * GAP_MS + 5000);
      if (!ok) return { status: 'error', detail: `the lab counted ${f.text('#n')} of ${N} chunks in time` };
      await new Promise((r) => setTimeout(r, 120));
      const iv = stamps.slice(1).map((t, i) => t - stamps[i]).slice(-64);
      const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
      const dt = Number(f.text('#dt').replace(/[^\d.]/g, ''));
      const tps = Number(f.text('#tps').replace(/[^\d.]/g, ''));
      const eDt = Math.abs(dt - mean) / mean, eTps = Math.abs(tps - 1000 / mean) / (1000 / mean);
      const good = eDt <= TOL && eTps <= TOL && calls === 1;
      return {
        status: 'pass', verdict: good ? 'partial' : 'unsupported', value: dt, expected: mean,
        detail: `independent timer: mean ${mean.toFixed(1)} ms, ${(1000 / mean).toFixed(1)} per s; the lab reads ${dt} ms (${(100 * eDt).toFixed(1)}% off) and ${tps} per s (${(100 * eTps).toFixed(1)}% off). It stamps SSE lines, not tokens.`,
      };
    },
  },
};
