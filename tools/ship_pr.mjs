#!/usr/bin/env node
// Merge a pull request only when the gates this site requires have run and every check that reported has passed.
//
// Pull request 19 was merged on 2026-11-13 before its checks had started. The first version of this guard waited
// for "any check", and a reviewer showed it would merge on an outside check alone, or with a gate skipped. A second
// reviewer showed that a push between the last look and the merge would be merged unchecked. So it names the checks
// it needs, waits for them, accepts only "pass", and pins the merge to the commit whose checks it read.
//
// usage: node tools/ship_pr.mjs <number> [--squash | --merge]
//        node tools/ship_pr.mjs selftest
// Without a flag it squashes, as SITE_RULES asks, and makes a merge commit only for the labs/foundation branch.
// Exit codes: 0 merged, 1 not merged, 2 wrong usage, 3 the gates did not finish in time.
import { spawnSync } from 'node:child_process';

/* The two jobs of .github/workflows/gates.yml. A pull request is not merged until both have reported. */
const REQUIRED = ['privacy', 'site'];
const FLAGS = ['--squash', '--merge'];
const WAIT_MS = 20 * 60 * 1000, POLL_MS = 10 * 1000;

// checks: [{name, bucket}] as `gh pr checks --json name,bucket` gives them. bucket is pass, fail, pending,
// skipping or cancel. Returns {state: 'wait' | 'refuse' | 'merge', why}.
export function verdict(checks, required = REQUIRED) {
  if (!Array.isArray(checks) || !checks.length) return { state: 'wait', why: 'no check has reported yet' };
  const names = new Set(checks.map((c) => c && c.name));
  const missing = required.filter((r) => !names.has(r));
  if (missing.length) return { state: 'wait', why: missing.length > 1 ? `the required checks ${missing.join(' and ')} have not started` : `the required check ${missing[0]} has not started` };
  const pending = checks.filter((c) => c.bucket === 'pending');
  if (pending.length) return { state: 'wait', why: `still running: ${pending.map((c) => c.name).join(', ')}` };
  const notPassed = checks.filter((c) => c.bucket !== 'pass');
  if (notPassed.length) return { state: 'refuse', why: `not passed: ${notPassed.map((c) => `${c.name} (${c.bucket})`).join(', ')}` };
  return { state: 'merge', why: `${checks.length} checks passed, ${required.join(' and ')} among them` };
}

// how to merge: the flag when one is given, a merge commit for labs/foundation, a squash for everything else
export function method(flag, head) {
  if (FLAGS.includes(flag)) return flag;
  return head === 'labs/foundation' ? '--merge' : '--squash';
}

const realGh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  return { code: r.error ? -1 : r.status, out: (r.stdout || '').trim(), err: (r.stderr || (r.error ? String(r.error.message) : '')).trim() };
};
const because = (r) => (r && r.err ? `: ${r.err.split(/\r?\n/)[0]}` : '');
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };

// Wait, decide, merge. io is injected so the selftest can play a pull request's checks without GitHub.
export async function ship(pr, flag, io = {}) {
  const gh = io.gh || realGh, sleep = io.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))), now = io.now || (() => Date.now()), say = io.say || console.log;
  if (flag !== undefined && !FLAGS.includes(flag)) { say(`NOT MERGED: "${flag}" is not --squash or --merge`); return 2; }
  const deadline = now() + WAIT_MS;
  let v, checks, head;
  for (;;) {
    // the head commit and its checks are read in one look, and the merge is pinned to that commit
    const view = gh(['pr', 'view', String(pr), '--json', 'headRefOid,headRefName,state']);
    head = parse(view.out);
    if (view.code !== 0 || !head || !head.headRefOid || !head.headRefName) { say(`NOT MERGED: gh could not read pull request ${pr}${because(view)}`); return 1; }
    if (head.state === 'MERGED') { say(`#${pr} is already merged`); return 0; }
    if (head.state !== 'OPEN') { say(`NOT MERGED: pull request ${pr} is ${head.state}`); return 1; }
    const c = gh(['pr', 'checks', String(pr), '--json', 'name,bucket']);
    checks = c.out ? parse(c.out) : null;
    if (!Array.isArray(checks)) {
      // gh says so on stderr while a pull request has no checks yet; anything else is a failure of gh itself
      if (/no checks reported/i.test(c.err)) checks = [];
      else { say(`NOT MERGED: gh could not read the checks of pull request ${pr}${because(c)}`); return 1; }
    }
    v = verdict(checks);
    if (v.state !== 'wait') break;
    if (now() >= deadline) { say(`NOT MERGED: ${v.why} after ${WAIT_MS / 60000} minutes`); return 3; }
    await sleep(POLL_MS);
  }
  for (const c of checks) say(`  ${c.name}: ${c.bucket}`);
  if (v.state === 'refuse') { say(`NOT MERGED: ${v.why}`); return 1; }
  const how = method(flag, head.headRefName);
  const m = gh(['pr', 'merge', String(pr), how, '--match-head-commit', head.headRefOid]);
  if (m.code !== 0) { say(`NOT MERGED: gh refused the merge${because(m)}`); return 1; }
  const after = parse(gh(['pr', 'view', String(pr), '--json', 'state,mergeCommit']).out);
  if (!after || after.state !== 'MERGED') { say(`NOT MERGED: after the merge call GitHub reports ${after ? after.state : 'nothing'}`); return 1; }
  say(`#${pr} MERGED ${String((after.mergeCommit && after.mergeCommit.oid) || '').slice(0, 7)} (${how.slice(2)}; ${v.why})`);
  return 0;
}

async function selftest() {
  const P = (name, bucket = 'pass') => ({ name, bucket });
  const outside = P('GitGuardian Security Checks');
  const all = [outside, P('privacy'), P('site')];
  // A fake GitHub. polls: what successive looks at the checks return (a list, or {err} for a gh failure).
  // oids: the head commit at each look. Records every gh call and every merge.
  const fake = (polls, o = {}) => {
    let look = 0, t = 0; const calls = [], merges = [], said = [];
    const at = () => Math.min(look, polls.length - 1);
    return {
      calls, merges, said,
      io: {
        gh: (a) => {
          calls.push(a.join(' '));
          if (a[1] === 'view' && a.includes('headRefOid,headRefName,state')) {
            if (o.viewFails) return { code: 1, out: '', err: 'HTTP 404: Not Found' };
            const oid = (o.oids || ['aaa1111'])[Math.min(look, (o.oids || ['aaa1111']).length - 1)];
            return { code: o.viewCode || 0, out: JSON.stringify({ headRefOid: oid, headRefName: o.head === undefined ? 'claude/evolve-2026-11-14' : o.head, state: o.state || 'OPEN' }), err: o.viewCode ? 'exit status 1' : '' };
          }
          if (a[1] === 'checks') { const p = polls[at()]; look++; return Array.isArray(p) ? { code: 0, out: JSON.stringify(p), err: '' } : { code: 1, out: '', err: p.err }; }
          if (a[1] === 'merge') { merges.push(a.slice(3)); return o.mergeRefused ? { code: 1, out: '', err: 'Head branch was modified. Review and try the merge again.' } : { code: 0, out: '', err: '' }; }
          return { code: 0, out: JSON.stringify(merges.length && !o.mergeRefused && o.mergeWorks !== false ? { state: 'MERGED', mergeCommit: { oid: 'abc1234def' } } : { state: 'OPEN', mergeCommit: null }), err: '' };
        },
        sleep: async (ms) => { t += ms; }, now: () => t, say: (s) => said.push(s),
      },
    };
  };
  const go = async (polls, o, flag) => { const f = fake(polls, o); f.code = await ship(7, flag, f.io); return f; };
  const early = await go([{ err: "no checks reported on the 'x' branch" }, [outside], [outside, P('privacy'), P('site', 'pending')], all], { oids: ['aaa1111', 'aaa1111', 'aaa1111', 'bbb2222'] });
  const skipped = await go([[outside, P('privacy'), P('site', 'skipping')]]);
  const never = await go([[outside]]);
  const foundation = await go([all], { head: 'labs/foundation' });
  const stuck = await go([all], { mergeWorks: false });
  const refused = await go([all], { mergeRefused: true });
  const badFlag = await go([all], {}, '--rebase');
  const squashFlag = await go([all], { head: 'labs/foundation' }, '--squash');
  const noView = await go([all], { viewFails: true });
  const noHead = await go([all], { head: '' });
  const ghFailed = await go([all], { viewCode: 1 });
  const ghDown = await go([{ err: 'HTTP 502: Bad Gateway' }]);
  const closed = await go([all], { state: 'CLOSED' });
  const done = await go([all], { state: 'MERGED' });
  const cases = [
    ['no check reported: wait', verdict([]).state === 'wait' && verdict(null).state === 'wait' && verdict([], []).state === 'wait'],
    ['an outside check alone is not the gates: wait, and both gates are named', verdict([outside]).state === 'wait' && verdict([outside]).why === 'the required checks privacy and site have not started'],
    ['one required check missing: wait, and it is named', verdict([outside, P('privacy')]).state === 'wait' && verdict([outside, P('privacy')]).why === 'the required check site has not started'],
    ['a required check still running: wait', verdict([P('privacy'), P('site', 'pending')]).state === 'wait'],
    ['an outside check still running, with both gates passed: wait, not refuse', verdict([P('privacy'), P('site'), P('GitGuardian Security Checks', 'pending')]).state === 'wait'],
    ['a skipped gate is refused', verdict([P('privacy'), P('site', 'skipping')]).state === 'refuse'],
    ['a cancelled gate is refused', verdict([P('privacy', 'cancel'), P('site')]).state === 'refuse'],
    ['a failed gate is refused and named', (() => { const v = verdict([P('privacy', 'fail'), P('site')]); return v.state === 'refuse' && v.why.includes('privacy (fail)'); })()],
    ['a failed check that is not required still refuses', verdict([P('privacy'), P('site'), P('lint', 'fail')]).state === 'refuse'],
    ['every check passed with both gates present: merge', verdict(all).state === 'merge'],
    ['squash by default, a merge commit for labs/foundation, and a flag wins', method(undefined, 'claude/evolve-2026-11-14') === '--squash' && method(undefined, 'labs/foundation') === '--merge' && method('--squash', 'labs/foundation') === '--squash' && method('--merge', 'x') === '--merge'],
    ['a word that is not one of the two flags never chooses the method', method('--rebase', 'x') === '--squash' && method('merge', 'x') === '--squash'],
    ['it waits through no checks, an outside check and a running gate, then squashes once', early.code === 0 && early.merges.length === 1 && early.merges[0][0] === '--squash'],
    ['the merge is pinned to the commit whose checks it read last', early.merges[0][1] === '--match-head-commit' && early.merges[0][2] === 'bbb2222'],
    ['a skipped gate is never merged', skipped.code === 1 && skipped.merges.length === 0 && skipped.said.some((s) => s.startsWith('NOT MERGED'))],
    ['gates that never start are given up on at the deadline, not merged', never.code === 3 && never.merges.length === 0 && never.calls.filter((c) => c.includes('checks')).length === WAIT_MS / POLL_MS + 1],
    ['labs/foundation is merged with a merge commit', foundation.code === 0 && foundation.merges[0][0] === '--merge'],
    ['a flag on the command line overrides the branch', squashFlag.code === 0 && squashFlag.merges[0][0] === '--squash'],
    ['a flag that is not --squash or --merge is refused before anything is asked of GitHub', badFlag.code === 2 && badFlag.calls.length === 0],
    ['a merge that GitHub did not carry out is reported as not merged', stuck.code === 1 && stuck.merges.length === 1 && stuck.said.some((s) => s.includes('GitHub reports OPEN'))],
    ['a merge that gh refuses is reported with its reason', refused.code === 1 && refused.said.some((s) => s.includes('refused the merge: Head branch was modified'))],
    ['a pull request gh cannot read is not merged, and the reason is shown', noView.code === 1 && noView.merges.length === 0 && noView.said.some((s) => s.includes('HTTP 404'))],
    ['a pull request whose branch name did not come back is not merged', noHead.code === 1 && noHead.merges.length === 0],
    ['a gh that exits non-zero is not trusted, whatever it printed', ghFailed.code === 1 && ghFailed.merges.length === 0],
    ['a failure of gh is reported at once, not after twenty minutes', ghDown.code === 1 && ghDown.calls.length === 2 && ghDown.said.some((s) => s.includes('HTTP 502'))],
    ['a closed pull request is not merged, and one already merged is left alone', closed.code === 1 && closed.merges.length === 0 && done.code === 0 && done.merges.length === 0],
  ];
  const fail = cases.filter(([, v]) => !v);
  for (const [n] of fail) console.log('FAIL ' + n);
  console.log(`ship_pr selftest: ${cases.length - fail.length}/${cases.length}`);
  process.exit(fail.length ? 1 : 0);
}

const [first, flag, extra] = process.argv.slice(2);
if (first === 'selftest') await selftest();
else if (/^\d+$/.test(first || '') && extra === undefined) process.exit(await ship(first, flag));
else { console.log('usage: node tools/ship_pr.mjs <number> [--squash | --merge] | selftest'); process.exit(2); }
