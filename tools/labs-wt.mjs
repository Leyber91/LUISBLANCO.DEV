#!/usr/bin/env node
/* ============================================================
   tools/labs-wt.mjs — one git worktree per lab, and every step
   of a lab's pass from creation to merge.

   Each lab gets its own worktree at <dev>/_labs_wt/<name>, its own
   branch labs/<name>, its own port and its own Chrome profile, so
   builders working at the same time never collide.

   Commands (Node 18+, Windows-first, no dependencies):
     status                   every lab worktree: branch, ahead/behind, dirty files, last commit
     add <name...> [--base B] create worktrees (default base: labs/foundation, else main)
     serve <name>             start http.server for the worktree on its port, left running (stop it with stop)
     stop <name|all>          stop the http.server listening on a lab's port, or on every lab port
     shoot <name> [page]      desktop 1440 and phone 390 screenshots + console errors; a server it
                              had to start is stopped when it finishes
     gates <name>             privacy selftest, site_check, levels check, in the worktree
     sync <name> [--from B]   merge B (default main) into the lab branch
     ship <name>              push, open a pull request to main, wait for the gates, squash-merge
     remove <name>            remove a worktree whose branch is merged into main
     ports                    the name, hub id, port and page table

   Ship publishes: a merge to main is live at luisblanco.dev within minutes.
   ============================================================ */

import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WT_ROOT = path.resolve(ROOT, '..', '_labs_wt');
const HOME = os.homedir().split(path.sep).join('/');
const SHOTS = process.env.LABS_SHOTS || `${HOME}/AppData/Local/Temp/lbrshots`;
const SHOOT_PS1 = process.env.LABS_SHOOT_PS1 || `${HOME}/.claude/skills/headless-verify/shoot.ps1`;
const CHROME = process.env.LABS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* name (worktree and branch) -> hub id, port, page */
export const LABS = [
  ['blackhole', 'black-hole', 8801, 'bh_animation_page.html'],
  ['exomania', 'exomania', 8802, 'exomania.html'],
  ['dimensions', 'dimensional', 8803, 'md_animation_page.html'],
  ['heptapod', 'heptapod', 8804, 'heptapod.html'],
  ['timeline', 'timeline', 8805, 'timeline.html'],
  ['last-witness', 'last-witness', 8806, 'last-witness.html'],
  ['altverse', 'alt-reality', 8807, 'altverse.html'],
  ['token-ekg', 'token-ekg', 8808, 'token-ekg.html'],
  ['ai-health', 'ai-health', 8809, 'ai-health.html'],
  ['workout-plans', 'workout-plans', 8810, 'workout-plans.html'],
  ['figure', 'the-figure', 8811, 'figure.html'],
  ['seed', 'primordial-seed', 8812, 'seed.html'],
  ['dataspace', 'dataspace', 8813, 'dataspace.html'],
  ['honesty-decoder', 'honesty-decoder', 8814, 'honesty-decoder.html'],
  ['roaster', 'roaster', 8815, 'roaster.html'],
  ['memes', 'memes', 8816, 'memes.html'],
  ['trending', 'trends', 8817, 'trending.html'],
  ['hub', 'hub', 8818, 'index.html'],
  ['content-gen', 'content-gen', 8819, 'content-gen.html'],
  ['learn-platform', 'learn-platform', 8820, 'learn-platform.html'],
  ['social-tool', 'social-tool', 8821, 'social-tool.html'],
  ['sports-predict', 'sports-predict', 8822, 'sports-predict.html'],
  ['mentorship', 'mentorship', 8823, 'mentorship.html'],
  ['pathways', 'pathways', 8824, 'pathways.html'],
  ['habits', 'habits', 8825, 'habits.html'],
  ['mindful', 'mindful', 8826, 'mindful.html'],
  ['pm-platform', 'pm-platform', 8827, 'pm-platform.html'],
  ['automation', 'automation', 8828, 'automation.html'],
  ['prototyping', 'prototyping', 8829, 'prototyping.html'],
  ['vr-fitness', 'vr-fitness', 8830, 'vr-fitness.html'],
  ['challenges', 'challenges', 8831, 'challenges.html'],
  ['ugc', 'ugc', 8832, 'ugc.html'],
].map(([name, hubId, port, page]) => ({ name, hubId, port, page }));

const byName = (n) => {
  const lab = LABS.find((l) => l.name === n || l.hubId === n);
  if (!lab) die(`unknown lab "${n}". Run: node tools/labs-wt.mjs ports`);
  return lab;
};
const wtPath = (lab) => path.join(WT_ROOT, lab.name).replace(/\\/g, '/');

function die(msg, code = 1) { console.error(msg); process.exit(code); }

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false, ...opts });
  if (r.error) return { ok: false, out: '', err: String(r.error.message), code: -1 };
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), code: r.status };
}
const git = (args, cwd = ROOT) => run('git', args, { cwd });

function worktrees() {
  const r = git(['worktree', 'list', '--porcelain']);
  const out = [];
  let cur = null;
  for (const line of r.out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9).replace(/\\/g, '/') }; out.push(cur); }
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line.startsWith('HEAD ') && cur) cur.head = line.slice(5);
  }
  return out;
}

/* ---------- commands ---------- */

function cmdPorts() {
  console.log('name'.padEnd(16) + 'hub id'.padEnd(18) + 'port  page');
  for (const l of LABS) console.log(l.name.padEnd(16) + l.hubId.padEnd(18) + String(l.port).padEnd(6) + l.page);
}

function cmdStatus() {
  const wts = worktrees().filter((w) => w.path.toLowerCase().startsWith(WT_ROOT.replace(/\\/g, '/').toLowerCase()));
  if (!wts.length) { console.log('no lab worktrees under ' + WT_ROOT); return; }
  console.log('name'.padEnd(16) + 'ahead'.padEnd(7) + 'behind'.padEnd(8) + 'dirty'.padEnd(7) + 'last commit');
  for (const w of wts.sort((a, b) => a.path.localeCompare(b.path))) {
    const name = path.basename(w.path);
    const ahead = git(['rev-list', '--count', `labs/foundation..${w.branch}`]).out || '?';
    const behind = git(['rev-list', '--count', `${w.branch}..main`]).out || '?';
    const dirty = git(['status', '--porcelain'], w.path).out.split(/\r?\n/).filter(Boolean).length;
    const last = git(['log', '-1', '--format=%h %ar %s', w.branch]).out.slice(0, 70);
    console.log(name.padEnd(16) + String(ahead).padEnd(7) + String(behind).padEnd(8) + String(dirty).padEnd(7) + last);
  }
}

function cmdAdd(names, base) {
  const b = base || (git(['rev-parse', '--verify', 'labs/foundation']).ok ? 'labs/foundation' : 'main');
  fs.mkdirSync(WT_ROOT, { recursive: true });
  for (const n of names) {
    const lab = byName(n);
    const p = wtPath(lab);
    if (fs.existsSync(p)) { console.log(`exists ${lab.name} (${p})`); continue; }
    const exists = git(['rev-parse', '--verify', `labs/${lab.name}`]).ok;
    const r = exists ? git(['worktree', 'add', p, `labs/${lab.name}`]) : git(['worktree', 'add', '-b', `labs/${lab.name}`, p, b]);
    console.log(r.ok ? `added ${lab.name} at ${p} (labs/${lab.name} from ${exists ? 'existing branch' : b})` : `FAILED ${lab.name}: ${r.err}`);
  }
}

function cmdServe(n) {
  const lab = byName(n);
  const p = wtPath(lab);
  if (!fs.existsSync(p)) die(`no worktree for ${lab.name}; run add first`);
  const child = spawn('python', ['-m', 'http.server', String(lab.port), '--bind', '127.0.0.1'], {
    cwd: p, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  console.log(`serving ${p} at http://127.0.0.1:${lab.port}/labs/${lab.page} (pid ${child.pid})`);
}

async function portOpen(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) }); return r.ok || r.status === 404; }
  catch { return false; }
}

/* A server that lives only as long as this command: attached, and stopped in a finally. */
function startTempServer(lab) {
  const p = wtPath(lab);
  if (!fs.existsSync(p)) die(`no worktree for ${lab.name}; run add first`);
  return spawn('python', ['-m', 'http.server', String(lab.port), '--bind', '127.0.0.1'], {
    cwd: p, detached: false, stdio: 'ignore', windowsHide: true,
  });
}
function stopPid(pid) {
  if (!pid) return;
  if (process.platform === 'win32') run('taskkill', ['/PID', String(pid), '/T', '/F']);
  else { try { process.kill(pid); } catch { /* already gone */ } }
}
async function waitPort(port, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await portOpen(port)) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
}

async function cmdShoot(n, pageArg) {
  const lab = byName(n);
  let temp = null;
  if (!(await portOpen(lab.port))) {
    temp = startTempServer(lab);
    if (!(await waitPort(lab.port, 8000))) { stopPid(temp.pid); die(`server on ${lab.port} did not come up`); }
  }
  try { await shootWith(lab, pageArg); }
  finally {
    if (temp) { stopPid(temp.pid); console.log(`stopped the server this shot started on port ${lab.port}`); }
  }
}

async function shootWith(lab, pageArg) {
  const page = pageArg || lab.page;
  const url = `http://127.0.0.1:${lab.port}/labs/${page}`;
  const dir = `${SHOTS}/${lab.name}`;
  fs.mkdirSync(dir, { recursive: true });
  // Headless Chrome will not lay a window out narrower than about 484 px, so a "390 px window" renders a wider
  // layout and clips it. The phone shot instead loads the page inside a 390 px iframe, whose viewport (and every
  // media query) is exactly 390 px wide.
  const harness = `${SHOTS}/_phone.html`;
  fs.writeFileSync(harness, '<!doctype html><html><head><meta charset="utf-8"></head>' +
    '<body style="margin:0;background:#000"><iframe id="f" style="border:0;width:390px;height:1680px;display:block" ' +
    'allow="autoplay"></iframe><script>document.getElementById("f").src=decodeURIComponent(location.hash.slice(1));' +
    '</script></body></html>');
  const phoneUrl = 'file:///' + harness.replace(/^\/+/, '') + '#' + encodeURIComponent(url);
  const shots = [
    ['desk', url, ['-Mode', 'webgl', '-Width', '1440', '-Height', '900']],
    ['phone', phoneUrl, ['-Mode', 'webgl', '-Width', '500', '-Height', '1700']],
  ];
  for (const [tag, target, extra] of shots) {
    const out = `${dir}/${tag}.png`;
    let r = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SHOOT_PS1, '-Url', target, '-Out', out,
      ...extra, '-VirtualTime', '6000', '-TimeoutSec', '60', '-ProfileDir', `${SHOTS}/prof-${lab.name}`]);
    if (!fs.existsSync(out)) {
      r = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SHOOT_PS1, '-Url', target, '-Out', out,
        ...extra, '-Classic', '-VirtualTime', '5000', '-TimeoutSec', '60', '-ProfileDir', `${SHOTS}/prof-${lab.name}`]);
    }
    console.log(fs.existsSync(out) ? `shot ${tag}: ${out}` : `shot ${tag}: FAILED (${(r.err || r.out).split('\n').pop()})`);
  }
  // console: every message the page printed, errors first
  const c = run(CHROME, ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--hide-scrollbars', `--user-data-dir=${SHOTS}/prof-${lab.name}-c`, '--enable-logging=stderr', '--v=0',
    '--window-size=1440,900', '--virtual-time-budget=6000', `--screenshot=${dir}/console.png`, url], { timeout: 90000 });
  const lines = (c.err || '').split(/\r?\n/).filter((l) => l.includes(':CONSOLE')).map((l) => l.replace(/^.*?:CONSOLE[^\]]*\]\s*/, ''));
  const bad = lines.filter((l) => /Uncaught|Error|Failed to load|404/i.test(l));
  console.log(`console: ${lines.length} messages, ${bad.length} errors`);
  for (const l of bad.slice(0, 12)) console.log('  ' + l.slice(0, 220));
  if (bad.length) process.exitCode = 1;
}

/* Stop the python http.server listening on a lab's port (or every lab port). Nothing else is touched. */
function cmdStop(n) {
  const labs = n === 'all' ? LABS : [byName(n)];
  const ports = labs.map((l) => l.port).join(',');
  const ps = `$ports=@(${ports}); foreach($p in $ports){ $c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue;` +
    ` foreach($x in $c){ $pr=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $x.OwningProcess);` +
    ` if($pr -and $pr.CommandLine -match 'http\\.server'){ Stop-Process -Id $x.OwningProcess -Force; Write-Output ("stopped " + $p + " pid " + $x.OwningProcess) }` +
    ` elseif($pr){ Write-Output ("left " + $p + ": not an http.server (" + $pr.Name + ")") } } }`;
  const r = run('powershell', ['-NoProfile', '-Command', ps]);
  console.log(r.out || `no http.server listening on ${n === 'all' ? 'any lab port' : 'port ' + labs[0].port}`);
}

function cmdGates(n) {
  const lab = byName(n);
  const p = wtPath(lab);
  const checks = [
    ['privacy selftest', 'python', ['tools/privacy_gate.py', '--selftest']],
    ['site check', 'node', ['tools/site_check.mjs']],
    ['levels check', 'node', ['tools/levels.mjs', 'check']],
  ];
  let fail = 0;
  for (const [label, cmd, args] of checks) {
    if (args[0].endsWith('levels.mjs') && !fs.existsSync(path.join(p, args[0]))) { console.log(`${label}: skipped (no tools/levels.mjs in this worktree)`); continue; }
    const r = run(cmd, args, { cwd: p });
    const tail = (r.out || r.err).split(/\r?\n/).slice(-1)[0];
    console.log(`${label}: ${r.ok ? 'pass' : 'FAIL'} (${tail})`);
    if (!r.ok) { fail++; console.log((r.out + '\n' + r.err).split(/\r?\n/).slice(-15).join('\n')); }
  }
  if (fail) process.exitCode = 1;
}

function cmdSync(n, from = 'main') {
  const lab = byName(n);
  const p = wtPath(lab);
  if (git(['status', '--porcelain'], p).out) die(`${lab.name} has uncommitted changes; commit them first`);
  // A branch cut before the latest foundation commit takes the foundation first, so a squash-merged
  // main does not meet it as a set of "both added" conflicts.
  if (from === 'main' && git(['rev-parse', '--verify', 'labs/foundation']).ok &&
      !git(['merge-base', '--is-ancestor', 'labs/foundation', 'HEAD'], p).ok) {
    const f = git(['merge', '--no-edit', 'labs/foundation'], p);
    if (!f.ok) {
      git(['merge', '--abort'], p);
      die(`merge of labs/foundation into labs/${lab.name} conflicted and was aborted:\n${f.out}`);
    }
  }
  const r = git(['merge', '--no-edit', from], p);
  if (r.ok) { regenerate(p, lab, `merged ${from} into labs/${lab.name}`); return; }
  const conflicts = git(['diff', '--name-only', '--diff-filter=U'], p).out.split(/\r?\n/).filter(Boolean);
  const plan = conflicts.map((f) => ({ f, how: resolution(f, p) }));
  const stuck = plan.filter((x) => !x.how);
  if (stuck.length) {
    git(['merge', '--abort'], p);
    console.log(`FAILED: merge of ${from} into labs/${lab.name} conflicted and was aborted; the worktree is unchanged.\n` +
      `files that need a person:\n${stuck.map((x) => '  ' + x.f).join('\n')}`);
    process.exitCode = 1;
    return;
  }
  for (const { f, how } of plan) {
    if (how === 'entries') {
      fs.writeFileSync(path.join(p, f), mergeEntries(git(['show', `:2:${f}`], p).out, git(['show', `:3:${f}`], p).out));
      git(['add', '--', f], p);
      console.log(`  resolved ${f}: kept every entry from both sides, the branch's new ones first`);
      continue;
    }
    git(['checkout', how === 'ours' ? '--ours' : '--theirs', '--', f], p);
    git(['add', '--', f], p);
    console.log(`  resolved ${f}: ${how === 'ours' ? 'kept the branch copy (it equals labs/foundation, newer than main)' : 'took main, to regenerate'}`);
  }
  const c = git(['commit', '--no-edit'], p);
  if (!c.ok) { git(['merge', '--abort'], p); die('could not commit the resolved merge: ' + c.err); }
  regenerate(p, lab, `merged ${from} into labs/${lab.name} (conflicts resolved by rule)`);
}

/* EVOLUTION.md is a log of "## " entries, newest first. Two branches that each added an entry at the top do not
   really conflict: keep main's file and put the branch's entries that main lacks above them. */
function mergeEntries(ours, theirs) {
  const NL = '\n';
  const split = (t) => {
    const i = t.indexOf(NL + '## ');
    const head = i < 0 ? t : t.slice(0, i + 1);
    const body = i < 0 ? '' : t.slice(i + 1);
    return { head, entries: body.split(/\n(?=## )/).map((e) => e.trimEnd()).filter(Boolean) };
  };
  const o = split(ours.replace(/\r\n/g, NL));
  const t = split(theirs.replace(/\r\n/g, NL));
  const key = (e) => e.split(NL)[0].trim();
  const have = new Set(t.entries.map(key));
  const mine = o.entries.filter((e) => !have.has(key(e)));
  return t.head + [...mine, ...t.entries].join(NL + NL) + NL;
}

/* Which side wins a conflict, by rule. null means a person decides. */
const GENERATED = ['LABS_LEVELS.md', 'labs/assets/js/config/levels.data.js'];
const FOUNDATION_OWNED = [/^tools\//, /^labs\/assets\/js\/ai\//, /^\.github\/workflows\//];
function resolution(file, p) {
  if (GENERATED.includes(file)) return 'theirs';
  if (file === 'EVOLUTION.md') return 'entries';
  // Main may hold this file at an older version of this same branch (an earlier pull request of the branch was
  // squash-merged). If main's copy appears in the branch's own history, the branch has moved past it: keep ours.
  const theirs = git(['rev-parse', `:3:${file}`], p).out;
  if (theirs) {
    const commits = git(['rev-list', 'HEAD', '--', file], p).out.split(/\r?\n/).filter(Boolean);
    for (const c of commits) if (git(['rev-parse', `${c}:${file}`], p).out === theirs) return 'ours';
  }
  if (FOUNDATION_OWNED.some((re) => re.test(file))) {
    // Keep the branch copy only when it is exactly the foundation's current copy.
    const mine = git(['rev-parse', `HEAD:${file}`], p).out;
    const found = git(['rev-parse', `labs/foundation:${file}`]).out;
    return mine && mine === found ? 'ours' : null;
  }
  return null;
}

/* Regenerate the level table and hub data from the ladder files, and commit if they changed. */
function regenerate(p, lab, msg) {
  if (fs.existsSync(path.join(p, 'tools', 'levels.mjs'))) {
    const w = run('node', ['tools/levels.mjs', 'write'], { cwd: p });
    if (w.ok && git(['status', '--porcelain', '--', ...GENERATED], p).out) {
      git(['add', '--', ...GENERATED], p);
      // Line-ending normalisation can make status report a change that add then erases.
      if (!git(['diff', '--cached', '--quiet', '--', ...GENERATED], p).ok) {
        git(['commit', '-m', 'levels: regenerate table and hub data'], p);
        msg += '; regenerated the level table';
      }
    }
  }
  console.log(msg);
}

async function cmdShip(n) {
  const lab = byName(n);
  const p = wtPath(lab);
  const br = `labs/${lab.name}`;
  if (git(['status', '--porcelain'], p).out) die(`${lab.name} has uncommitted changes; commit them first`);
  const push = git(['push', '-u', 'origin', br], p);
  if (!push.ok) die('push failed: ' + push.err);
  let pr = run('gh', ['pr', 'view', br, '--json', 'number,state,url'], { cwd: p });
  // A branch whose last pull request was already merged gets a new one.
  if (pr.ok && JSON.parse(pr.out).state !== 'OPEN') pr = { ok: false };
  if (!pr.ok) {
    const title = git(['log', '-1', '--format=%s', br]).out || `labs: ${lab.name}`;
    const body = `One lab per pull request. Level sheet: \`node tools/levels.mjs sheet ${lab.hubId}\`.\n\n` +
      `Generated with [Claude Code](https://claude.com/claude-code)`;
    const c = run('gh', ['pr', 'create', '--base', 'main', '--head', br, '--title', title, '--body', body], { cwd: p });
    if (!c.ok) die('pr create failed: ' + c.err);
    pr = run('gh', ['pr', 'view', br, '--json', 'number,state,url'], { cwd: p });
  }
  const info = JSON.parse(pr.out);
  console.log(`pull request #${info.number}: ${info.url}`);
  // Checks can take minutes to appear; watch until they finish.
  for (let i = 0; i < 60; i++) {
    const w = run('gh', ['pr', 'checks', String(info.number), '--watch', '--interval', '20'], { cwd: p, timeout: 900000 });
    const txt = w.out + '\n' + w.err;
    if (/no checks reported/i.test(txt)) { await new Promise((r) => setTimeout(r, 20000)); continue; }
    console.log(txt.split(/\r?\n/).filter(Boolean).slice(-10).join('\n'));
    if (!w.ok) die('checks did not all pass; not merging');
    break;
  }
  const m = run('gh', ['pr', 'merge', String(info.number), '--squash', '--delete-branch=false'], { cwd: p });
  if (!m.ok) die('merge failed: ' + m.err);
  console.log(`merged #${info.number} (squash). Live at https://luisblanco.dev/labs/${lab.page} once Pages rebuilds.`);
}

function cmdRemove(n) {
  const lab = byName(n);
  const p = wtPath(lab);
  const br = `labs/${lab.name}`;
  git(['fetch', '-q', 'origin', 'main']);
  // A squash merge leaves no ancestry; compare trees instead: the branch's lab files must equal main's.
  const diff = git(['diff', '--stat', `origin/main...${br}`]).out;
  const merged = git(['branch', '-r', '--contains', br]).out.includes('origin/main') ||
    run('gh', ['pr', 'view', br, '--json', 'state'], { cwd: ROOT }).out.includes('MERGED');
  if (!merged) die(`labs/${lab.name} is not merged into main (diff vs main:\n${diff})\nnot removed`);
  const r = git(['worktree', 'remove', p]);
  console.log(r.ok ? `removed ${p}` : `remove failed: ${r.err}`);
}

/* ---------- cli ---------- */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (k) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const base = flag('--base');
  const from = flag('--from');
  const [cmd, ...rest] = argv;
  const need = () => { if (!rest[0]) die(`${cmd} needs a lab name`); return rest[0]; };
  switch (cmd) {
    case 'ports': cmdPorts(); break;
    case 'status': cmdStatus(); break;
    case 'add': if (!rest.length) die('add needs lab names'); cmdAdd(rest, base); break;
    case 'serve': cmdServe(need()); break;
    case 'stop': cmdStop(need()); break;
    case 'shoot': await cmdShoot(need(), rest[1]); break;
    case 'gates': cmdGates(need()); break;
    case 'sync': cmdSync(need(), from || 'main'); break;
    case 'ship': await cmdShip(need()); break;
    case 'remove': cmdRemove(need()); break;
    default:
      console.log('commands: status | add <name...> [--base B] | serve <name> | stop <name|all> | shoot <name> [page] | gates <name> | sync <name> [--from B] | ship <name> | remove <name> | ports');
      process.exitCode = cmd ? 2 : 0;
  }
}
