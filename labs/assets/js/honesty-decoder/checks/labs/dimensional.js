/* Dimensional Test: the lab's own cube module, imported and counted
   against the closed forms, and the running lab's projection chain. */
import { REFERENCES } from '../../config.js';

export const PROBES = {
  'dm-cube': {
    what: 'importing the lab\'s n_dimensional_cube.js and counting vertices and edges for n = 4 to 7',
    fails: 'fails if any n gives other than 2^n vertices, n 2^(n-1) edges, or an edge that changes more than one coordinate',
    async run() {
      const { HyperCube } = await import('../../../dimensional_mania/n_dimensional_cube.js');
      const rows = [];
      for (let n = 4; n <= 7; n++) {
        const c = new HyperCube(n);
        const V = Math.pow(2, n), E = n * Math.pow(2, n - 1);
        let oneAxis = true;
        for (let e = 0; e < c.edgeCount; e++) {
          const a = c.edgeIndex[2 * e], b = c.edgeIndex[2 * e + 1];
          let diff = 0;
          for (let j = 0; j < n; j++) if (c.coords[a * n + j] !== c.coords[b * n + j]) diff++;
          if (diff !== 1) { oneAxis = false; break; }
        }
        rows.push({ n, v: c.vCount, e: c.edgeCount, ok: c.vCount === V && c.edgeCount === E && oneAxis });
      }
      const ok = rows.every((r) => r.ok);
      return {
        status: 'pass', verdict: ok ? 'supported' : 'unsupported',
        detail: rows.map((r) => `${r.n}D: ${r.v} vertices, ${r.e} edges`).join(' · ') + `; ${REFERENCES.hypercube.what} (${REFERENCES.hypercube.cite})`,
      };
    },
  },
  'dm-state': {
    heavy: true,
    onDemand: true,
    what: 'loading the lab at ?d=5&still in a hidden frame and reading its projection chain',
    fails: 'fails if the lab does not show 5D folding through 4D to 3D',
    async run(ctx) {
      const f = await ctx.frame('md_animation_page.html?d=5&still', { ready: (a) => /3D/.test(a.text('.dx-chain')) || a.$('.dx-nowebgl') });
      if (f.$('.dx-nowebgl')) return { status: 'error', detail: 'this browser gave the lab no WebGL context' };
      const chain = f.text('.dx-chain'), dim = f.text('.dx-dim-n'), name = f.text('.dx-dim-name');
      const ok = /5D/.test(dim) && /5D.*4D.*3D/.test(chain);
      return { status: 'pass', verdict: ok ? 'supported' : 'partial', detail: `the running lab at ?d=5 reads ${dim} ${name}, chain "${chain}"` };
    },
  },
};
