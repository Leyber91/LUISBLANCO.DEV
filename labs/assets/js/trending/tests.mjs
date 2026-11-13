#!/usr/bin/env node
/* ============================================================
   trending/tests.mjs — the lab's own tests, run by the site gate
   (tools/lab_tests.mjs). Pure logic on recorded API responses:
   scoring, intervals, baselines, acceleration, topics, history,
   verification, the model-reply checks, and the source contracts.

     node tests.mjs          recorded responses only (the gate)
     node tests.mjs --live   also fetch every source once and fail if a
                             field the source module reads has gone
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIVE = process.argv.includes('--live');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL', name); } };
const near = (a, b, tol, name) => ok(Math.abs(a - b) <= tol, `${name}: ${a} vs ${b}`);

const { TUNING, SOURCES } = await import('./constants.js');
const S = await import('./score.js');
const T = await import('./topics.js');
const Hm = await import('./history.js');
const Vf = await import('./verify.js');
const E = await import('./explain.js');
const { checkObs, partition } = await import('./schema.js');
const { LENSES } = await import('./lenses.js');
const { FIXTURE } = await import('./fixtures.js');
const { ARCHIVE } = await import('./archive.data.js');
const { restingFor } = await import('./archive.build.mjs');

/* ---------------- Poisson intervals and the ladder's fixture pair ---------------- */
{
  const [l8, h8] = S.garwood(8);
  near(l8, 3.4538, 1e-3, 'Garwood lower 8');
  near(h8, 15.7632, 1e-3, 'Garwood upper 8');
  near(S.garwood(60)[0], 45.7863, 1e-3, 'Garwood lower 60');
  near(S.garwood(0)[1], 3.6889, 1e-3, 'Garwood upper 0');
  near(S.normInv(0.975), 1.959964, 1e-5, 'normal quantile');
  const t = Date.UTC(2026, 10, 11, 12);
  const a = S.scoreItem({ id: 'hn:1', src: 'hn', title: 'a', url: 'https://x.org', t, count: 8, created: t - 24 * 60e3 });
  const b = S.scoreItem({ id: 'hn:2', src: 'hn', title: 'b', url: 'https://x.org', t, count: 60, created: t - 4 * 3.6e6 });
  near(a.rate, 20, 1e-9, 'raw rate 8 in 24 min');
  near(b.rate, 15, 1e-9, 'raw rate 60 in 4 h');
  near(a.lo, 8.63, 0.01, 'lower bound 8 in 24 min');
  near(b.lo, 11.45, 0.01, 'lower bound 60 in 4 h');
  ok(a.rate > b.rate && a.lo < b.lo, 'raw rate and lower bound order the pair differently');
  const r = S.rank([{ id: 'hn:1', src: 'hn', sc: a }, { id: 'hn:2', src: 'hn', sc: b }], 'lower', null);
  ok(r.items[0].id === 'hn:2' && !r.merged, 'the board ranks by the lower bound');
  const floor = S.scoreItem({ id: 'hn:3', src: 'hn', title: 'c', url: 'https://x.org', t, count: 4, created: t - 60e3 });
  near(floor.ageEff, TUNING.hnAgeFloorH, 1e-9, 'age floor applies to a 1-minute-old item');
  const gh = S.scoreItem({ id: 'gh:a/b', src: 'gh', title: 'a/b', url: 'https://github.com/a/b', t, count: 480, created: t - 48 * 3.6e6 });
  near(gh.rate, 240, 1e-9, 'GitHub stars per day');
}

/* ---------------- weekday baseline and "new" ---------------- */
{
  const series = [];
  const d0 = Date.UTC(2026, 9, 6);
  for (let i = 0; i <= 35; i++) series.push([new Date(d0 + i * 864e5).toISOString().slice(0, 10), i === 35 ? 5000 : (i % 7 === 0 ? 120 : 100)]);
  const day = series[35][0];
  const { weeks, base } = S.weekdayBaseline(series, day);
  ok(weeks.length === 4 && base === 120, 'same-weekday median from 4 prior weeks');
  const w = S.scoreItem({ id: 'wen:X', src: 'wen', title: 'X', url: 'https://en.wikipedia.org/wiki/X', t: Date.now(), count: 5000, day, prev: 100, series, created: null });
  near(w.rate, 5000 / 120, 1e-9, 'readership ratio over weekday median');
  const n = S.scoreItem({ id: 'wen:Y', src: 'wen', title: 'Y', url: 'https://en.wikipedia.org/wiki/Y', t: Date.now(), count: 900, day, prev: 0, series: [[day, 900]], created: null });
  ok(n.isNew && n.rate === null, 'no baseline: labelled new, never an infinite ratio');
}

/* ---------------- CUSUM burst onset ---------------- */
{
  const ser = [];
  const d0 = Date.UTC(2026, 9, 1);
  for (let i = 0; i < 35; i++) ser.push([new Date(d0 + i * 864e5).toISOString().slice(0, 10), i < 31 ? 1000 + (i % 3) * 40 : 30000]);
  const c = S.cusum(ser);
  ok(c.burst && c.onset === ser[31][0], `CUSUM dates the onset on the first high day (${c?.onset})`);
  const flat = ser.map(([d], i) => [d, 1000 + (i % 3) * 40]);
  ok(S.cusum(flat).burst === false, 'CUSUM stays quiet on a flat series');
  ok(S.cusum(ser.slice(0, 10)) === null, 'CUSUM needs 21 days');
}

/* ---------------- trajectories, measured rate, acceleration ---------------- */
{
  const t = Date.UTC(2026, 10, 11, 12);
  const o = { id: 'hn:9', src: 'hn', t, count: 160, created: t - 3 * 3.6e6 };
  const tr = S.trajectory(o, [{ t: t - 2 * 3.6e6, c: 40 }, { t: t - 3.6e6, c: 80 }]);
  ok(tr.length === 4 && tr[0].kind === 'origin', 'trajectory starts at creation');
  const m = S.measuredRate(tr);
  near(m.rate, 80, 1e-9, 'measured rate since the last stored scan');
  const acc = S.acceleration(tr);
  ok(acc.label === 'accelerating' && Math.abs(acc.rho - 1) < 1e-9, 'acceleration from three observations');
  const flat = S.acceleration(S.trajectory({ ...o, count: 120 }, [{ t: t - 2 * 3.6e6, c: 40 }, { t: t - 3.6e6, c: 80 }]));
  ok(flat.label === 'steady', 'steady within the threshold');
  ok(S.acceleration(S.trajectory(o, [])) === null, 'two observations give no acceleration');
}

/* ---------------- shared unit ---------------- */
{
  const sc = S.robustScaler([0, 1, 2, 3, 4].map((x) => Math.log(10 * 2 ** x)));
  near(sc.z(40), 0, 1e-9, 'z of the median is 0');
  ok(sc.z(160) > 0 && sc.z(10) < 0, 'z is signed around the median');
}

/* ---------------- topics ---------------- */
{
  ok(T.tokenSeq('Show HN: Node.js & C++ in Zürich').join(' ') === 'show hn node.js c++ in zurich', 'normalize keeps node.js and c++, folds accents');
  ok(T.contentTerms('The Rise of the Rust Compiler').join(',') === 'rise,rust,compiler', 'stopwords removed');
  const items = [
    { id: 'hn:1', src: 'hn', title: 'Jensen Huang says Nvidia will build chips in Texas', t: 1, count: 50 },
    { id: 'wen:Jensen_Huang', src: 'wen', title: 'Jensen Huang', t: 1, count: 500000 },
    { id: 'wde:Jensen_Huang', src: 'wde', title: 'Jensen Huang', t: 1, count: 40000 },
    { id: 'gh:a/rust-tool', src: 'gh', title: 'a/rust-tool', meta: { desc: 'A fast compiler cache for Rust' }, t: 1, count: 10 },
    { id: 'hn:2', src: 'hn', title: 'A fast compiler cache for Rust projects', t: 1, count: 20 },
    { id: 'hn:3', src: 'hn', title: 'Smart home devices should work offline', t: 1, count: 30 },
  ];
  const { topics, terms } = T.clusterTopics(items);
  const jh = topics.find((x) => x.label === 'Jensen Huang');
  ok(jh && jh.sources.includes('hn') && jh.sources.includes('wen') && jh.sources.includes('wde'), 'one subject in HN and two Wikipedia editions is one topic');
  ok(jh?.rule === 'entity', 'joined by the entity rule');
  const rt = topics.find((x) => x.members.includes('gh:a/rust-tool|gh'));
  ok(rt && rt.members.includes('hn:2|hn') && rt.rule === 'terms', 'term overlap joins a repository and a story');
  ok(!topics.some((x) => x.members.includes('hn:3|hn')), 'an unrelated story stays alone');
  ok((terms.get('hn:1|hn') || []).length >= 1 && terms.get('hn:1|hn').length <= 3, '1 to 3 key terms per signal');
  const d = T.dedupe([{ id: 'a', src: 'hn', title: 'Same Title!', count: 3 }, { id: 'b', src: 'hn', title: 'same title', count: 9 }]);
  ok(d.length === 1 && d[0].id === 'b' && d[0].dupes[0] === 'a', 'duplicate titles in one source merge');
  ok(!T.linksTo({ src: 'hn', title: 'how home automation works' }, T.entityPhrase('Home')), 'a short generic title does not link');
}

/* ---------------- schema ---------------- */
{
  const good = { id: 'hn:1', src: 'hn', title: 'x', url: 'https://x.org/a', t: 2, count: 1, created: 1 };
  ok(checkObs(good) === null, 'a valid observation passes');
  ok(/https/.test(checkObs({ ...good, url: 'http://x.org' })), 'http url rejected');
  ok(/finite/.test(checkObs({ ...good, count: -1 })), 'negative count rejected');
  ok(partition([good, { ...good, title: '' }]).bad.length === 1, 'partition reports the bad item');
}

/* ---------------- source adapters on recorded responses (mocked fetch) ---------------- */
const RESP = path.join(HERE, 'data', 'responses');
const rec = (name) => {
  const f = fs.readdirSync(RESP).filter((x) => x.startsWith(name + '-')).sort().pop();
  return { json: JSON.parse(fs.readFileSync(path.join(RESP, f), 'utf8')), file: f };
};
{
  const real = globalThis.fetch;
  const route = (u) => {
    if (u.includes('tags=front_page')) return rec('hn-front').json;
    if (u.includes('tags=show_hn')) return rec('hn-show').json;
    if (u.includes('api.github.com')) return rec('gh-search').json;
    if (u.includes('/top/')) return rec('wiki-top').json;
    if (u.includes('/per-article/')) return rec('wiki-article').json;
    if (u.includes('tags=comment')) return rec('hn-comments').json;
    return null;
  };
  globalThis.fetch = async (u) => {
    const body = route(String(u));
    return { status: body ? 200 : 404, ok: !!body, text: async () => JSON.stringify(body || {}), headers: { get: (h) => (h === 'x-ratelimit-remaining' ? '9' : null) } };
  };
  const ctx = { now: Date.UTC(2026, 10, 11, 12), ledger: null };
  const hn = await LENSES.hn.fetch(ctx);
  ok(hn.items.length > 0 && partition(hn.items).bad.length === 0, `HN adapter parses ${rec('hn-front').file}`);
  const gh = await LENSES.gh.fetch(ctx);
  ok(gh.items.length > 0 && partition(gh.items).bad.length === 0, `GitHub adapter parses ${rec('gh-search').file}`);
  const wi = await LENSES.wen.fetch(ctx);
  ok(wi.pool.length > 0 && !wi.pool.some((p) => p.title === 'Main Page' || p.title.startsWith('Special:')), 'Wikipedia adapter drops the main page and special pages');
  const withSeries = await LENSES.wen.series(ctx, wi, wi.pool.slice(0, 1));
  ok(withSeries[0].series.length > 20, 'per-article series parsed');
  globalThis.fetch = real;
}

/* ---------------- contracts: the fields each source module reads ---------------- */
const CONTRACT = {
  'hn-front': (j) => j.hits.every((h) => 'objectID' in h && 'title' in h && 'points' in h && 'created_at_i' in h && 'num_comments' in h),
  'hn-show': (j) => j.hits.every((h) => 'objectID' in h && 'title' in h && 'points' in h && 'created_at_i' in h),
  'gh-search': (j) => j.items.every((x) => 'full_name' in x && 'html_url' in x && 'stargazers_count' in x && 'created_at' in x && 'forks_count' in x),
  'wiki-top': (j) => j.items[0].articles.every((a) => 'article' in a && 'views' in a && 'rank' in a),
  'wiki-article': (j) => j.items.every((p) => 'timestamp' in p && 'views' in p),
  'hn-comments': (j) => j.hits.every((h) => 'comment_text' in h),
};
for (const [name, check] of Object.entries(CONTRACT)) ok(check(rec(name).json), `contract holds on recorded ${rec(name).file}`);
if (LIVE) {
  const f = 'title,url,points,num_comments,created_at_i,author';
  const urls = {
    'hn-front': `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=3&attributesToRetrieve=${f}`,
    'hn-show': `https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=3&attributesToRetrieve=${f}`,
    'gh-search': 'https://api.github.com/search/repositories?q=created:%3E2026-01-01&sort=stars&per_page=2',
    'wiki-top': `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10).replace(/-/g, '/')}`,
    'wiki-article': 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Albert_Einstein/daily/2026010100/2026010700',
  };
  for (const [name, u] of Object.entries(urls)) {
    const r = await fetch(u, { headers: { 'User-Agent': 'luisblanco.dev-labs-trending-tests/1.0' } });
    const j = await r.json().catch(() => null);
    ok(r.ok && j && CONTRACT[name](j), `LIVE contract holds for ${name}`);
  }
}

/* ---------------- history: compact, hydrate, migrate, diff, export ---------------- */
{
  const store = Hm.memoryStore();
  const h = new Hm.History(store);
  const t = Date.UTC(2026, 10, 11, 10);
  const mk = (t0, counts) => ({
    t: t0, done: t0, origin: 'live', enabled: ['hn'], sources: { hn: { status: 'ok', fetchedAt: t0, urls: ['https://hn.algolia.com/x'] } },
    items: counts.map(([id, c]) => ({ id, src: 'hn', title: id, url: 'https://x.org/' + id, t: t0, count: c, created: t - 3.6e6, third: 1 })).map((o) => ({ ...o, sc: S.scoreItem(o) })),
    scalers: {}, pools: {}, topics: [],
  });
  h.add(mk(t, [['hn:a', 10], ['hn:b', 50], ['hn:c', 5]]));
  h.add(mk(t + 3.6e6, [['hn:a', 90], ['hn:b', 60], ['hn:d', 8]]));
  ok(h.count() === 2 && h.sizeKB() > 0, 'two scans stored with their size');
  const h2 = new Hm.History(store);
  ok(h2.count() === 2, 'history survives a reload');
  const [A, B] = h2.scans().map(Hm.hydrate);
  ok(A.items[0].sc && Number.isFinite(A.items[0].sc.rate), 'hydrate recomputes scores');
  const d = Hm.diffScans(A, B);
  ok(d.entered.length === 1 && d.left.length === 1 && d.moved.length === 2, 'diff counts entered, left and moved');
  ok(h2.earlier('hn:a', 'hn', t + 3.6e6).length === 1, 'earlier observations of one item');
  const csv = h2.exportCSV().trim().split('\n');
  ok(csv[0] === 'time_utc,source,item,metric,unit' && csv.length === 7, 'CSV has one row per observation');
  const h3 = new Hm.History(Hm.memoryStore());
  ok(h3.importJSON(h2.exportJSON()) === 2 && h3.count() === 2, 'exported JSON imports into an empty store');
  const v1 = Hm.migrate([{ t: 1, sources: {}, items: [{ id: 'x', src: 'hn', count: 3, created: 0 }] }]);
  ok(v1.version === 2 && v1.scans[0].items[0].c === 3, 'v1 history migrates to v2');
  const rv = Vf.revisit(A, B, 'hn');
  ok(rv.some((r) => r.id === 'hn:a' && r.label === 'rose'), 'an earlier call is revisited as rose');
  const pairs = Vf.pairsFromScans([A, B], 'hn');
  ok(pairs.length === 1 && pairs[0].med === 45 && Math.abs(pairs[0].gapH - 1) < 1e-9, 'scan pair with median gain and gap');
}

/* ---------------- verification statistics ---------------- */
{
  ok(Math.abs(Vf.spearman([1, 2, 3, 4], [10, 20, 30, 40]).rho - 1) < 1e-12, 'Spearman of a monotone pair is 1');
  ok(Math.abs(Vf.spearman([1, 2, 3, 4], [4, 3, 2, 1]).rho + 1) < 1e-12, 'Spearman of a reversed pair is -1');
  const g = [1, 2, 3, 4, 5, 6, 7, 8];
  const b1 = Vf.bootstrap(g, (s) => s.reduce((a, x) => a + x, 0) / s.length, { seed: 7 });
  const b2 = Vf.bootstrap(g, (s) => s.reduce((a, x) => a + x, 0) / s.length, { seed: 7 });
  ok(b1[0] === b2[0] && b1[0] < 4.5 && b1[1] > 4.5, 'seeded bootstrap is repeatable and brackets the mean');
  const bt = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'backtest-wen.json'), 'utf8'));
  const sum = Vf.summarize(Vf.pairsFromBacktest(bt));
  ok(sum.pairs >= 20 && sum.methods.method.calls >= 200 && !sum.methods.method.tooFew, 'Wikipedia backtest gives at least 200 calls');
  ok(sum.methods.total.rate != null && sum.methods.alt.rate != null, 'both naive rankings are scored on the same days');
  ok(ARCHIVE.verify.wen.summary.methods.method.calls === sum.methods.method.calls, 'the shipped record matches a rerun of the backtest');
  const few = Vf.summarize(Vf.pairsFromBacktest({ ...bt, days: bt.days.slice(0, 2) }));
  ok(few.methods.method.tooFew, 'fewer than 30 calls is labelled too few to judge');
}

/* ---------------- the model reply: schema, fact-check, fallback ---------------- */
{
  const { top, facts, ctxs, topics, scan, scanFacts } = restingFor(ARCHIVE);
  ok(top.length === TUNING.explainTop, 'five signals go to the model');
  const engine = E.engineReply(top, ctxs, topics, scan, {});
  ok(engine.signals.every((e) => E.validateEntry(e, ['s1', 's2', 's3', 's4', 's5']) === null), 'every engine entry passes the schema');
  const out = E.reconcile(FIXTURE.reply, top, facts, engine, scanFacts);
  const eng = E.reconcile(engine, top, facts, engine, scanFacts);
  ok(E.factCheck(eng.digest, { items: facts, scan: scanFacts }).length === 0, 'the engine digest quotes only numbers from the facts');
  const s3 = out.entries.find((e) => e.key === 's3');
  ok(s3.origin === 'engine' && /fixed list/.test(s3.note), 'fixture: the malformed entry falls back to the engine, not a blank');
  const s2 = out.entries.find((e) => e.key === 's2');
  ok(s2.flags.some((f) => f.text === FIXTURE.planted.now), 'fixture: the planted wrong number is flagged');
  ok(out.entries.filter((e) => e.key !== 's2').every((e) => !e.flags.length), 'fixture: no correct entry is flagged');
  ok(E.factCheck('It had 1,234 views on 2026-11-10.', { v: 1234, day: '2026-11-10' }).length === 0, 'fact-check accepts a number and date from the facts');
  ok(E.factCheck('It had 9,999 views on 2026-11-09.', { v: 1234, day: '2026-11-10' }).length === 2, 'fact-check flags a wrong number and a wrong date');
  ok(E.causeByRules({ src: 'hn', title: 'Linus Torvalds dies at 60' }).cause === 'death', 'keyword rule: death');
  ok(E.causeByRules({ src: 'hn', title: 'Salesforce to acquire Fin for $3.6B' }).cause === 'news event', 'keyword rule: a price is not a release');
  ok(E.reconcile({ nope: 1 }, top, facts, engine).entries.every((e) => e.origin === 'engine'), 'a reply with no signals array falls back for every item');
  const whole = JSON.stringify(FIXTURE.reply);
  ok(E.parseReply('Here you go:\n```json\n' + whole + '\n```').signals.length === 5, 'a fenced reply parses whole');
  const cut = whole.slice(0, whole.indexOf('"id":"s4"') + 12);
  const salv = E.parseReply(cut);
  ok(salv?.salvaged && salv.signals.length === 3, 'a reply cut off inside entry 4 keeps its 3 complete entries');
  const mixed = E.reconcile(salv, top, facts, engine, scanFacts);
  ok(mixed.entries.filter((e) => e.origin === 'engine').length === 3, 'salvage: s3 (planted fault), s4 and s5 fall back to the engine');
  ok(E.parseReply('I cannot help with that.') === null, 'prose with no JSON is unreadable, never an explanation');
  const { scan: rs } = restingFor(ARCHIVE);
  ok(rs.topics.some((t) => t.sources.some((s) => SOURCES[s].kind === 'forum') && t.sources.some((s) => SOURCES[s].kind === 'readership')), 'the recorded scan (?demo) joins an HN story and a Wikipedia article in one topic');
}

console.log(`trending tests: ${pass} passed, ${fail} failed${LIVE ? ' (with live contracts)' : ''}`);
process.exit(fail ? 1 : 0);
