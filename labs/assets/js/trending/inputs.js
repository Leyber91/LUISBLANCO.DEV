/* ============================================================
   trending/inputs.js — the exact inputs of the one model call for a
   scan at rest: the top signals in the default ranking, their facts,
   the engine context and the topics among them. Shared by the page
   (Trending.js) and the recorder (record.mjs reply), so a recorded
   reply and its test fixture line up with what the page shows.
   ============================================================ */

import { TUNING, SOURCES } from './constants.js';
import { rank, trajectory, measuredRate, acceleration, median } from './score.js';
import { factsFor, scanFactsOf } from './explain.js';

const keyOf = (it) => `${it.id}|${it.src}`;

/* scan: { items (with sc, terms), scalers, topics }; earlier(it) -> [{ t, c }] */
export function restingInputs(scan, enabled, earlier, mode = 'lower') {
  const all = scan.items.filter((it) => enabled.has(it.src)).map((it) => {
    const traj = trajectory(it, earlier(it));
    const per = SOURCES[it.src].kind === 'code' ? 24 : 1;
    return { ...it, key: keyOf(it), traj, measured: measuredRate(traj, per), accel: acceleration(traj, per) };
  });
  const { items } = rank(all, mode, scan.scalers);
  const top = items.slice(0, TUNING.explainTop);
  const poolMedian = (src) => median(scan.items.filter((i) => i.src === src).map((i) => i.sc.rate));
  const facts = top.map((it, i) => factsFor(it, {}, { key: `s${i + 1}`, measured: it.measured, accel: it.accel }));
  const ctxs = top.map((it) => ({ measured: it.measured, accel: it.accel, poolMedian: poolMedian(it.src) }));
  const ids = new Map(top.map((it, i) => [it.key, `s${i + 1}`]));
  const topics = (scan.topics || []).map((t) => ({ label: t.label, keys: t.members.map((m) => ids.get(m)).filter(Boolean), sources: t.sources }))
    .filter((t) => t.keys.length && (t.keys.length > 1 || t.sources.length > 1));
  return { top, facts, ctxs, topics, scanFacts: scanFactsOf(scan, enabled) };
}
