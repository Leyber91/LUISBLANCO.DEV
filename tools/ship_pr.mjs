#!/usr/bin/env node
// Merge a pull request only when the gates this site requires have run on what the merge will publish, and every
// check that reported has passed.
//
// Pull request 19 was merged on 2026-11-13 before its checks had started. Three reviews of this guard followed.
// The first version waited for "any check" and would have merged on an outside check alone, or with a gate
// skipped. The second did not pin the commit it had looked at. The third showed that checks which ran against an
// older main say nothing about a merge onto today's main. So the guard:
//   - names the checks it needs (privacy and site), waits for them, and accepts only "pass";
//   - reads the head commit before and after it reads the checks, and looks again when the branch moved between;
//   - refuses when main holds a commit the branch does not contain, because the gates never saw that merge;
//   - pins the merge to the commit it looked at;
//   - says "merged" only for a merge it made itself and GitHub confirmed.
// What it cannot close: main can still move in the instant between its last look and the merge. Only a branch
// protection rule on main (require privacy and site, require the branch to be up to date) closes that, and
// repository settings are Luis's.
//
// usage: node tools/ship_pr.mjs <number> [--squash | --merge]
//        node tools/ship_pr.mjs selftest
// Without a flag it squashes, as SITE_RULES asks, and makes a merge commit only for the labs/foundation branch.
// Exit codes: 0 merged by this run; 1 not merged; 2 wrong usage; 3 the gates did not finish in time;
//             4 found merged, but not by this run, so its checks and method were not verified;
//             5 the merge call was accepted and GitHub could not be read to confirm it.
import { spawnSync } from 'node:child_process';

/* The two jobs of .github/workflows/gates.yml. A pull request is not merged until both have reported. */
const REQUIRED = ['privacy', 'site'];
const FLAGS = ['--squash', '--merge'];
const WAIT_MS = 20 * 60 * 1000, POLL_MS = 10 * 1000, CALL_MS = 2 * 60 * 1000;
const VIEW = 'headRefOid,headRefName,baseRefName,state';

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

// one call of the gh command line; a call that does not return in two minutes counts as a failure
export function realGh(args, cmd = 'gh') {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: CALL_MS });
  return { code: r.error ? -1 : r.status, out: (r.stdout || '').trim(), err: (r.stderr || (r.error ? String(r.error.message) : '')).trim() };
}
const because = (r) => (r && r.err ? `: ${r.err.split(/\r?\n/)[0]}` : '');
const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };

// Wait, decide, merge. io is injected so the selftest can play a pull request's checks without GitHub.
export async function ship(pr, flag, io = {}) {
  const gh = io.gh || realGh, sleep = io.sleep || ((ms) => new Promise((r) => setTimeout(r, ms))), now = io.now || (() => Date.now()), say = io.say || console.log;
  if (flag !== undefined && !FLAGS.includes(flag)) { say(`NOT MERGED: "${flag}" is not --squash or --merge`); return 2; }
  const n = String(pr);
  const deadline = now() + WAIT_MS;
  // the pull request as GitHub has it now, or the exit code to stop with
  const look = () => {
    const r = gh(['pr', 'view', n, '--json', VIEW]);
    const h = parse(r.out);
    if (r.code !== 0 || !h || !h.headRefOid || !h.headRefName || !h.baseRefName) { say(`NOT MERGED: gh could not read pull request ${n}${because(r)}`); return { stop: 1 }; }
    if (h.state === 'MERGED') { say(`#${n} is merged, but not by this run: its checks and the way it was merged were not verified here`); return { stop: 4 }; }
    if (h.state !== 'OPEN') { say(`NOT MERGED: pull request ${n} is ${h.state}`); return { stop: 1 }; }
    return { head: h };
  };
  let v, checks, head;
  for (;;) {
    const before = look();
    if (before.stop) return before.stop;
    const c = gh(['pr', 'checks', n, '--json', 'name,bucket']);
    checks = c.out ? parse(c.out) : null;
    if (!Array.isArray(checks)) {
      // gh says so on stderr while a pull request has no checks yet; anything else is a failure of gh itself
      if (/no checks reported/i.test(c.err)) checks = [];
      else { say(`NOT MERGED: gh could not read the checks of pull request ${n}${because(c)}`); return 1; }
    }
    // the checks belong to whatever commit was the head when they were read: look at the head again, and accept
    // them only when it did not move in between
    const after = look();
    if (after.stop) return after.stop;
    head = after.head;
    v = before.head.headRefOid === head.headRefOid ? verdict(checks) : { state: 'wait', why: 'the branch moved while its checks were being read' };
    if (v.state !== 'wait') break;
    if (now() >= deadline) { say(`NOT MERGED: ${v.why} after ${WAIT_MS / 60000} minutes`); return 3; }
    await sleep(POLL_MS);
  }
  for (const c of checks) say(`  ${c.name}: ${c.bucket}`);
  if (v.state === 'refuse') { say(`NOT MERGED: ${v.why}`); return 1; }
  // The gates checked this head merged into the main of that moment. When main has since gained a commit the
  // branch does not contain, the merge would publish a tree no gate has seen.
  const cmp = gh(['api', `repos/{owner}/{repo}/compare/${head.baseRefName}...${head.headRefOid}`, '--jq', '.behind_by']);
  if (cmp.code !== 0 || !/^\d+$/.test(cmp.out)) { say(`NOT MERGED: gh could not compare the branch with ${head.baseRefName}${because(cmp)}`); return 1; }
  if (Number(cmp.out) > 0) { say(`NOT MERGED: ${head.baseRefName} holds ${cmp.out} commit(s) this branch does not contain, so the gates did not check what a merge would publish. Bring the branch up to date (gh pr update-branch ${n}) and let the gates run again`); return 1; }
  const how = method(flag, head.headRefName);
  const m = gh(['pr', 'merge', n, how, '--match-head-commit', head.headRefOid]);
  if (m.code !== 0) { say(`NOT MERGED: gh refused the merge${because(m)}`); return 1; }
  // gh exits 0 and only warns when the pull request was merged by someone else a moment before
  if (/already merged/i.test(m.err)) { say(`#${n} was merged by someone else during this run: its checks and the way it was merged were not verified here`); return 4; }
  const seen = gh(['pr', 'view', n, '--json', 'state,mergeCommit']);
  const end = parse(seen.out);
  if (seen.code !== 0 || !end) { say(`#${n}: the merge call was accepted, and GitHub could not be read to confirm it${because(seen)}. Look at the pull request before shipping it again`); return 5; }
  if (end.state !== 'MERGED') { say(`NOT MERGED: after the merge call GitHub reports ${end.state}`); return 1; }
  say(`#${n} MERGED ${String((end.mergeCommit && end.mergeCommit.oid) || '').slice(0, 7)} (${how.slice(2)}; ${v.why})`);
  return 0;
}

async function selftest() {
  const P = (name, bucket = 'pass') => ({ name, bucket });
  const outside = P('GitGuardian Security Checks');
  const all = [outside, P('privacy'), P('site')];
  // A fake GitHub. polls: what successive reads of the checks return (a list, or {err} for a gh failure).
  // oids: the head commit at each view call, in order (the last one repeats). Records every call and every merge.
  const fake = (polls, o = {}) => {
    let reads = 0, views = 0, t = 0; const calls = [], merges = [], said = [];
    const oids = o.oids || ['aaa1111'];
    return {
      calls, merges, said,
      io: {
        gh: (a) => {
          calls.push(a.join(' '));
          if (a[1] === 'view' && a.includes(VIEW)) {
            if (o.viewFails) return { code: 1, out: '', err: 'HTTP 404: Not Found' };
            const oid = oids[Math.min(views++, oids.length - 1)];
            const state = o.mergedAtView && views >= o.mergedAtView ? 'MERGED' : o.state || 'OPEN';
            return { code: o.viewCode || 0, out: JSON.stringify({ headRefOid: oid, headRefName: o.head === undefined ? 'claude/evolve-2026-11-14' : o.head, baseRefName: o.base === undefined ? 'main' : o.base, state }), err: o.viewCode ? 'exit status 1' : '' };
          }
          if (a[1] === 'checks') { const p = polls[Math.min(reads++, polls.length - 1)]; return Array.isArray(p) ? { code: 0, out: JSON.stringify(p), err: '' } : { code: 1, out: '', err: p.err }; }
          if (a[0] === 'api') return o.compareFails ? { code: 1, out: '', err: 'HTTP 502: Bad Gateway' } : { code: 0, out: String(o.behind || 0), err: '' };
          if (a[1] === 'merge') {
            merges.push(a.slice(3));
            if (o.mergeRefused) return { code: 1, out: '', err: 'Head branch was modified. Review and try the merge again.' };
            if (o.mergedElsewhere) return { code: 0, out: '', err: '! Pull request #7 was already merged' };
            return { code: 0, out: '', err: '' };
          }
          if (o.confirmFails) return { code: 1, out: '', err: 'HTTP 502: Bad Gateway' };
          return { code: 0, out: JSON.stringify(merges.length && !o.mergeRefused && o.mergeWorks !== false ? { state: 'MERGED', mergeCommit: { oid: 'abc1234def' } } : { state: 'OPEN', mergeCommit: null }), err: '' };
        },
        sleep: async (ms) => { t += ms; }, now: () => t, say: (s) => said.push(s),
      },
    };
  };
  const go = async (polls, o, flag) => { const f = fake(polls, o); f.code = await ship(7, flag, f.io); f.text = f.said.join('\n'); return f; };
  const early = await go([{ err: "no checks reported on the 'x' branch" }, [outside], [outside, P('privacy'), P('site', 'pending')], all], { oids: ['aaa1111', 'aaa1111', 'aaa1111', 'aaa1111', 'aaa1111', 'aaa1111', 'bbb2222'] });
  const moved = await go([all, all], { oids: ['aaa1111', 'ccc3333', 'ccc3333', 'ccc3333'] });
  const skipped = await go([[outside, P('privacy'), P('site', 'skipping')]]);
  const never = await go([[outside]]);
  const foundation = await go([all], { head: 'labs/foundation' });
  const stuck = await go([all], { mergeWorks: false });
  const refused = await go([all], { mergeRefused: true });
  const badFlag = await go([all], {}, '--rebase');
  const squashFlag = await go([all], { head: 'labs/foundation' }, '--squash');
  const noView = await go([all], { viewFails: true });
  const noHead = await go([all], { head: '' });
  const noBase = await go([all], { base: '' });
  const ghFailed = await go([all], { viewCode: 1 });
  const ghDown = await go([{ err: 'HTTP 502: Bad Gateway' }]);
  const closed = await go([all], { state: 'CLOSED' });
  const done = await go([all], { state: 'MERGED' });
  const byHand = await go([[outside, P('privacy'), P('site', 'pending')], all], { mergedAtView: 3 });
  const behind = await go([all], { behind: 2 });
  const noCompare = await go([all], { compareFails: true });
  const elsewhere = await go([all], { mergedElsewhere: true });
  const unconfirmed = await go([all], { confirmFails: true });
  const child = (code) => realGh(['-e', `process.stdout.write("out"); process.stderr.write("why"); process.exit(${code})`], process.execPath);
  const cases = [
    ['no check reported: wait', verdict([]).state === 'wait' && verdict(null).state === 'wait' && verdict([], []).state === 'wait'],
    ['an outside check alone is not the gates: wait, and both gates are named', verdict([outside]).state === 'wait' && verdict([outside]).why === 'the required checks privacy and site have not started'],
    ['one required check missing: wait, and it is named', verdict([outside, P('privacy')]).state === 'wait' && verdict([outside, P('privacy')]).why === 'the required check site has not started'],
    ['a required check still running: wait', verdict([P('privacy'), P('site', 'pending')]).state === 'wait'],
    ['an outside check still running, with both gates passed: wait, not refuse', verdict([P('privacy'), P('site'), P('GitGuardian Security Checks', 'pending')]).state === 'wait'],
    ['a skipped gate is refused', verdict([P('privacy'), P('site', 'skipping')]).state === 'refuse'],
    ['a cancelled gate is refused', verdict([P('privacy', 'cancel'), P('site')]).state === 'refuse'],
    ['an outside check that was skipped or cancelled refuses too', verdict([P('privacy'), P('site'), P('GitGuardian Security Checks', 'skipping')]).state === 'refuse' && verdict([P('privacy'), P('site'), P('lint', 'cancel')]).state === 'refuse'],
    ['a failed gate is refused and named', (() => { const v = verdict([P('privacy', 'fail'), P('site')]); return v.state === 'refuse' && v.why.includes('privacy (fail)'); })()],
    ['a failed check that is not required still refuses', verdict([P('privacy'), P('site'), P('lint', 'fail')]).state === 'refuse'],
    ['every check passed with both gates present: merge', verdict(all).state === 'merge'],
    ['squash by default, also for a lab branch; a merge commit only for labs/foundation; a flag wins', method(undefined, 'claude/evolve-2026-11-14') === '--squash' && method(undefined, 'labs/heptapod') === '--squash' && method(undefined, 'labs/foundation') === '--merge' && method('--squash', 'labs/foundation') === '--squash' && method('--merge', 'x') === '--merge'],
    ['a word that is not one of the two flags never chooses the method', method('--rebase', 'x') === '--squash' && method('merge', 'x') === '--squash'],
    ['it waits through no checks, an outside check and a running gate, then squashes once', early.code === 0 && early.merges.length === 1 && early.merges[0][0] === '--squash' && early.text.includes('MERGED abc1234 (squash;')],
    ['the merge is pinned to the commit it looked at last', early.merges[0][1] === '--match-head-commit' && early.merges[0][2] === 'bbb2222'],
    ['checks read while the branch moved are not used: it looks again', moved.code === 0 && moved.calls.filter((c) => c.includes('checks')).length === 2 && moved.merges[0][2] === 'ccc3333'],
    ['a skipped gate is never merged', skipped.code === 1 && skipped.merges.length === 0 && skipped.text.includes('NOT MERGED')],
    ['gates that never start are given up on at the deadline, not merged', never.code === 3 && never.merges.length === 0 && never.calls.filter((c) => c.includes('checks')).length === WAIT_MS / POLL_MS + 1],
    ['labs/foundation is merged with a merge commit, and the report says so', foundation.code === 0 && foundation.merges[0][0] === '--merge' && foundation.text.includes('(merge;')],
    ['a flag on the command line overrides the branch', squashFlag.code === 0 && squashFlag.merges[0][0] === '--squash'],
    ['a flag that is not --squash or --merge is refused before anything is asked of GitHub', badFlag.code === 2 && badFlag.calls.length === 0],
    ['a branch that does not contain today\'s main is not merged, and the way out is named', behind.code === 1 && behind.merges.length === 0 && behind.text.includes('holds 2 commit(s) this branch does not contain') && behind.text.includes('gh pr update-branch 7')],
    ['when the branch cannot be compared with main, nothing is merged', noCompare.code === 1 && noCompare.merges.length === 0 && noCompare.text.includes('HTTP 502')],
    ['a merge that GitHub did not carry out is reported as not merged', stuck.code === 1 && stuck.merges.length === 1 && stuck.text.includes('GitHub reports OPEN')],
    ['a merge that gh refuses is reported with its reason', refused.code === 1 && refused.text.includes('refused the merge: Head branch was modified')],
    ['a merge call accepted and then not confirmed is its own result, never "merged" and never "not merged"', unconfirmed.code === 5 && !unconfirmed.text.includes('NOT MERGED') && !unconfirmed.text.includes(' MERGED ') && unconfirmed.text.includes('could not be read to confirm')],
    ['a pull request someone else merged at the last moment is not reported as this run\'s merge', elsewhere.code === 4 && !elsewhere.text.includes('(squash;')],
    ['a pull request found merged is exit 4, whether at the start or during the wait', done.code === 4 && done.merges.length === 0 && byHand.code === 4 && byHand.merges.length === 0],
    ['a pull request gh cannot read is not merged, and the reason is shown', noView.code === 1 && noView.merges.length === 0 && noView.text.includes('HTTP 404')],
    ['a pull request whose branch or base name did not come back is not merged', noHead.code === 1 && noHead.merges.length === 0 && noBase.code === 1 && noBase.merges.length === 0],
    ['a gh that exits non-zero is not trusted, whatever it printed', ghFailed.code === 1 && ghFailed.merges.length === 0],
    ['a failure of gh is reported at once, not after twenty minutes', ghDown.code === 1 && ghDown.calls.length === 2 && ghDown.text.includes('HTTP 502')],
    ['a closed pull request is not merged', closed.code === 1 && closed.merges.length === 0],
    ['the exit status and the error text of the real command come back', (() => { const a = child(3), b = child(0); return a.code === 3 && a.err === 'why' && a.out === 'out' && b.code === 0 && realGh(['x'], 'no-such-command-on-this-machine').code === -1; })()],
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
