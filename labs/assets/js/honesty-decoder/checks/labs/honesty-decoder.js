/* The Honesty Decoder grading itself: every check here measures this
   page's own rows, results and engine. ctx.self() is the live app state. */
import { BASES } from '../../config.js';
import { decompose, scoreSet } from '../../engine.js';

const FIGURE_KEYS = /^(figure|reality|percent|pct|score|real)$/i;

export const PROBES = {
  'hd-coverage': {
    what: 'counting rows against every entry in site.config.js',
    fails: 'supported only when every hub entry has a row',
    async run(ctx) {
      const { coverage } = ctx.self();
      const full = coverage.n === coverage.m;
      return { status: 'pass', verdict: full ? 'supported' : coverage.n / coverage.m >= 0.5 ? 'partial' : 'unsupported', detail: `${coverage.n} of ${coverage.m} hub entries have a row` };
    },
  },
  'hd-split': {
    what: 'counting the scored sub-claims of every counted row',
    fails: 'fails if any counted row has fewer than 3 scored sub-claims',
    async run(ctx) {
      const { counted } = ctx.self();
      const thin = counted.filter((r) => r.subs.filter((s) => s.type !== 'framing').length < 3);
      return { status: 'pass', verdict: thin.length ? 'partial' : 'supported', detail: `${counted.length} counted rows; ${thin.length ? `under 3: ${thin.map((r) => r.id).join(', ')}` : 'each has at least 3 scored sub-claims'}` };
    },
  },
  'hd-checked': {
    what: 'measuring the share of counted sub-claims whose verdict a passed check backs',
    fails: 'supported at 80% or more, partial at 50% or more, else unsupported',
    async run(ctx) {
      const { counted, results } = ctx.self();
      let all = 0, backed = 0;
      for (const r of counted) {
        for (const s of r.subs) {
          if (s.type === 'framing' || s.id === 'hd.checked') continue;
          all++;
          const keys = [`${s.id}#code`, `${s.id}#probe`, ...(s.shared ? [`shared:${s.shared}`] : [])].filter((k) => results[k]);
          const basis = s.basis || (keys.length ? 'code' : 'author');
          if (!BASES[basis]?.checked || basis === 'inspection') continue;
          if (keys.length && keys.every((k) => results[k].status === 'pass')) backed++;
        }
      }
      const share = all ? backed / all : 0;
      return {
        status: 'pass', verdict: share >= 0.8 ? 'supported' : share >= 0.5 ? 'partial' : 'unsupported', value: share,
        detail: `${backed} of ${all} counted sub-claims rest on a check that passed in this browser (${Math.round(100 * share)}%)`,
      };
    },
  },
  'hd-computed': {
    what: 'scanning every row for a stored figure',
    fails: 'fails if any row or sub-claim carries a figure field',
    async run(ctx) {
      const { counted } = ctx.self();
      const typed = [];
      for (const r of counted) {
        for (const [k, v] of Object.entries(r)) if (FIGURE_KEYS.test(k) && typeof v === 'number') typed.push(`${r.id}.${k}`);
        for (const s of r.subs) for (const [k, v] of Object.entries(s)) if (FIGURE_KEYS.test(k) && typeof v === 'number') typed.push(`${s.id}.${k}`);
      }
      return { status: 'pass', verdict: typed.length ? 'unsupported' : 'supported', detail: typed.length ? `typed figures: ${typed.join(', ')}` : 'no row holds a figure; every figure shown is computed by engine.js' };
    },
  },
  'hd-paste': {
    what: 'running the rule engine over the held-out half of the gold set',
    fails: 'supported needs F1 0.80 or more on a gold set someone independent annotated; partial at 0.50 or more',
    async run() {
      const { HELD, GOLD_INDEPENDENT } = await import('../../gold.js');
      const r = scoreSet(HELD, (g) => decompose(g.claim));
      return {
        status: 'pass', verdict: r.F1 >= 0.8 && GOLD_INDEPENDENT ? 'supported' : r.F1 >= 0.5 ? 'partial' : 'unsupported', value: r.F1,
        detail: `held-out half (${HELD.length} claims): precision ${r.P.toFixed(2)}, recall ${r.R.toFixed(2)}, F1 ${r.F1.toFixed(2)}${GOLD_INDEPENDENT ? '' : '; the gold set and the engine share one author, so this cannot earn supported'}`,
      };
    },
  },
};
