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
                              had to start is stopped when it finishes; it waits for the machine's
                              one-Chrome lock, as a drive does, and holds it for the whole shot
     drive <name>             run tools/drives/<name>.mjs with a real pointer and keyboard at 1440 and
                              390 wide (tools/drive.mjs): what a still cannot show
     drive <name> [--tree <path | folder under _labs_wt>] [--scenario <name | path.mjs>[,...]]
           [--widths WxH[,...]] [--out <dir>] [--timeout <s a drive, 300>] [--budget <s, 540>]
           [--min-free-gb <n, 2>]
                              every scenario at every size on any tree, one Chrome at a time, within
                              a budget; exit 3 means run the same command again (see cmdDrivePairs)
     gates <name>             privacy selftest, site_check, levels check, in the worktree
     sync <name> [--from B]   merge B (default main) into the lab branch
     ship <name>              push, open a pull request to main, wait for the gates, squash-merge
     remove <name>            remove a worktree whose branch is merged into main
     ports                    the name, hub id, port and page table
     selftest                 the shot's lock: taken, held, given back, refused while another holds it

   Ship publishes: a merge to main is live at luisblanco.dev within minutes.
   ============================================================ */

import { spawnSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// run from the main checkout or from inside a worktree: both resolve to the same _labs_wt folder
const WT_ROOT = path.basename(path.dirname(ROOT)) === '_labs_wt' ? path.dirname(ROOT) : path.resolve(ROOT, '..', '_labs_wt');
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
  ['os', 'hub', 8833, 'index.html'],   // the Labs OS platform layer, shown through the hub
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

/* How long a shot waits for Chrome: a drive's wait, LABS_DRIVE_WAIT_MS, else 20 minutes. */
export const shotWaitMs = (env = process.env) => Number(env.LABS_DRIVE_WAIT_MS) || 20 * 60 * 1000;
/* An ending this tool chose and can say in one line; anything else is printed with its stack. */
const expected = (msg) => Object.assign(new Error(msg), { expected: true });
/* The leaves a shot ends in. The selftest stands in for them, and checks that each one here is the real thing. */
export const LEAVES = { exists: fs.existsSync, open: portOpen, start: startTempServer, wait: waitPort, stop: stopPid, shot: shootWith, say: (m) => console.log(m) };

/* One Chrome at a time on the machine. A shot starts browsers of its own (two shots through the screenshot script,
   each tried once more in classic mode when it leaves no picture, and one Chrome for the console), and until
   2026-11-17 it started them without looking at the lock a drive waits for (tools/drive.mjs holdChrome), so a shot
   could run beside another conversation's drive. It now takes that lock before fn and gives it back when fn's work
   has ended, by a return or a throw, and when the process exits inside fn (an exit, an uncaught error, Ctrl+C). A
   process killed outright gives nothing back: the next drive or shot takes the lock from a holder that no longer
   runs (holdChrome's rule). When another holds the lock it says so at once, then waits waitMs; when the lock is
   still not free it throws before fn runs. The lock is taken with the holdChrome beside this file, never a lab
   worktree's: a tree that has not merged main since the lock was written has none.
   opts: waitMs (shotWaitMs()), lock (the machine's lock file), say (console.log), hold (given only by the selftest). */
export async function withChromeLock(fn, opts = {}) {
  const { waitMs = shotWaitMs(), lock, say = console.log } = opts;
  const hold = opts.hold || (await import(new URL('./drive.mjs', import.meta.url).href)).holdChrome;
  let release = await hold(0, lock);
  if (!release) {
    say(`waiting up to ${Math.round(waitMs / 1000)} s for Chrome: another drive or shot holds the machine's lock`);
    release = await hold(waitMs, lock);
  }
  if (!release) throw expected(`Chrome was not free within ${Math.round(waitMs / 1000)} s: another drive or shot holds the machine's lock`);
  const atExit = () => release();
  process.on('exit', atExit);
  try { return await fn(); }
  finally { process.off('exit', atExit); release(); }
}

/* Exit code 1 with a line saying why: the page printed console errors, Chrome was not free in time, the server
   did not come up, or the lab has neither a worktree nor anything serving its port (said before the wait for
   Chrome, not after it). seams are given only by the selftest: any of LEAVES, and withChromeLock's opts. */
async function cmdShoot(n, pageArg, seams = {}) {
  const lab = byName(n);
  const t = { ...LEAVES, ...seams };
  try {
    if (!t.exists(wtPath(lab)) && !(await t.open(lab.port))) throw expected(`no worktree for ${lab.name}; run add first`);
    await withChromeLock(() => shootServed(lab, pageArg, t), t);
  } catch (e) { console.error(e.expected ? e.message : (e.stack || e.message)); process.exitCode = 1; }
}

async function shootServed(lab, pageArg, t) {
  const { open, start, wait, stop, shot, say } = t;
  let temp = null;
  if (!(await open(lab.port))) {
    temp = start(lab);
    if (!(await wait(lab.port, 8000))) { stop(temp.pid); throw expected(`server on ${lab.port} did not come up`); }
  }
  try { await shot(lab, pageArg); }
  finally {
    if (temp) { stop(temp.pid); say(`stopped the server this shot started on port ${lab.port}`); }
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

/* Gestures and checks against the served page, at desktop and phone width, one Chrome at a time. */
async function cmdDrive(n) {
  const lab = byName(n);
  const p = wtPath(lab);
  const file = path.join(p, 'tools', 'drives', `${lab.name}.mjs`);
  if (!fs.existsSync(file)) die(`no drive for ${lab.name}: write ${file} (see tools/drives/heptapod.mjs)`);
  const { drive } = await import(pathToFileURL(path.join(p, 'tools', 'drive.mjs')).href);
  const scenario = (await import(pathToFileURL(file).href)).default;
  let temp = null;
  if (!(await portOpen(lab.port))) {
    temp = startTempServer(lab);
    if (!(await waitPort(lab.port, 8000))) { stopPid(temp.pid); die(`server on ${lab.port} did not come up`); }
  }
  let bad = 0;
  try {
    for (const [tag, width, height] of [['desk', 1440, 900], ['phone', 390, 844]]) {
      console.log(`--- ${lab.name} at ${width} px`);
      const r = await drive(scenario, { base: `http://127.0.0.1:${lab.port}`, out: `${SHOTS}/${lab.name}/drive-${tag}`, width, height });
      const failed = r.checks.filter((c) => !c.ok).length;
      bad += failed;
      console.log(`${tag}: ${r.checks.length - failed} of ${r.checks.length} checks passed; console errors: ${r.errors.length}; pictures in ${SHOTS}/${lab.name}/drive-${tag}`);
    }
  } finally {
    if (temp) { stopPid(temp.pid); console.log(`stopped the server this drive started on port ${lab.port}`); }
  }
  if (bad) process.exitCode = 1;
}

/* ---------- drive on any tree: scenario-by-size pairs, within a budget, resumed by running the same command ---------- */

/* The flags that make a drive a run of pairs (cmdDrivePairs). With none of them, drive is cmdDrive above, unchanged. */
export const DRIVE_FLAGS = { '--tree': 'tree', '--scenario': 'scenario', '--widths': 'widths', '--out': 'out', '--timeout': 'timeout', '--budget': 'budget', '--min-free-gb': 'minFreeGb' };
/* A usage error: exit code 2, said in one line. */
const usage = (msg) => Object.assign(new Error(msg), { expected: true, code: 2 });

/* The words after "drive": one lab name, and any of DRIVE_FLAGS with a value. Anything else is a usage error, because a
   misspelt --budget that fell through to cmdDrive would drive with no budget, the failure the flags exist for. */
export function driveArgs(args) {
  const opts = {}, names = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { names.push(args[i]); continue; }
    const k = DRIVE_FLAGS[args[i]], v = args[i + 1];
    if (!k) throw usage(`drive: unknown flag ${args[i]}`);
    if (!v || v.startsWith('--')) throw usage(`drive: ${args[i]} needs a value`);
    opts[k] = v;
    i++;
  }
  if (names.length !== 1) throw usage(`drive takes one lab name, and was given ${names.length}${names.length ? `: ${names.join(' ')}` : ''}`);
  return { name: names[0], opts };
}
export const isPairRun = (opts) => Object.keys(opts).length > 0;

/* What a run of pairs was told, checked, with every bound in the message that refuses it. Times come back in ms and
   the memory floor in bytes. A list that selects no pair is refused: a run that tested nothing fails (ROAD_METHOD 17). */
export function drivePlan(o, lab) {
  const scenarios = (o.scenario ?? lab.name).split(',');
  const sizes = (o.widths ?? '1440x900,390x844').split(',');
  const each = Number(o.timeout ?? 300), budget = Number(o.budget ?? 540), floor = Number(o.minFreeGb ?? 2);
  if (scenarios.some((s) => !s)) throw usage(`--scenario takes names or paths separated by commas, and was given "${o.scenario}"`);
  const bad = sizes.find((s) => !/^[1-9]\d*x[1-9]\d*$/.test(s));
  if (bad !== undefined) throw usage(`--widths takes WxH,WxH (1440x900,390x844), and "${bad}" is not one`);
  if (!(each > 0)) throw usage(`--timeout takes seconds, more than 0, and was given "${o.timeout}"`);
  if (!(budget >= each)) throw usage(`--budget takes seconds, at least the ${each} s of --timeout so that a drive started at once fits it, and was given "${o.budget}"`);
  if (!(floor >= 0)) throw usage(`--min-free-gb takes gigabytes, 0 or more, and was given "${o.minFreeGb}"`);
  return { scenarios, sizes, each: each * 1000, budget: budget * 1000, floor: floor * 2 ** 30 };
}

/* A tree by its path, or by its folder under _labs_wt when it is a bare name (letters, digits, _ and -): the roads name
   trees for the job (_bh3, _rec), which a lab name cannot reach. */
export const treeOf = (t, cwd = process.cwd()) => (/^[\w-]+$/.test(t) ? path.join(WT_ROOT, t) : path.resolve(cwd, t)).replace(/\\/g, '/');

/* Where a checkout's working copy differs from its head: { head, root (the checkout's top), paths (from the top, sorted) }.
   A path is listed when it is changed, added, deleted, or untracked and not ignored; sorted, because status lists the
   staged before the untracked, and a file only staged is served as it was. Status runs without the optional
   index lock, so a road's own git command in the same tree is never refused because of it. Null when git cannot say:
   no checkout, no commit yet, no working tree, an index it cannot read. */
export function treeDiff(tree) {
  const head = run('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: tree });
  if (!head.ok) return null;
  const root = run('git', ['rev-parse', '--show-toplevel'], { cwd: tree });
  if (!root.ok) return null;
  const st = spawnSync('git', ['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all', '--no-renames'], { cwd: tree, maxBuffer: 1 << 28 });
  if (st.status !== 0) return null;
  return { head: head.out, root: root.out, paths: st.stdout.toString('utf8').split('\0').filter(Boolean).map((e) => e.slice(3)).sort() };
}
/* The state a result is kept under: the head, and when the working copy differs from it, a hash of every path that
   differs with its content on disk, which is what the server serves. Files git ignores are not in it. */
export function treeState(tree, diff = treeDiff(tree)) {
  if (!diff) return null;
  if (!diff.paths.length) return diff.head;
  const h = crypto.createHash('sha1');
  for (const f of diff.paths) {
    h.update(`${f}\0`);
    try { h.update(fs.readFileSync(path.join(diff.root, f))); } catch { h.update('\0no file\0'); }
    h.update('\0');
  }
  return `${diff.head}+${h.digest('hex').slice(0, 10)}`;
}

/* The port a python http.server says it serves on, from its first line ("Serving HTTP on 127.0.0.1 port 54321 ..."). */
export function servedPort(text) { const m = /^Serving HTTP on \S+ port (\d+) /m.exec(text); return m ? Number(m[1]) : 0; }
/* A server for one tree on a port the system picks (0): two runs are never handed one port, and the port is read from
   this server's own first line, so the server that answers is this one and never another tree's. Resolves
   { port, stop }; on no port within ms or an error it stops the server and throws, and on an early end it throws. cmd
   and end are given only by the selftest, which has no python and should not spend a second on each taskkill. */
function serveTree(tree, ms = 8000, cmd = ['python', ['-u', '-I', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', tree]], end = stopPid) {
  const child = spawn(cmd[0], cmd[1], { cwd: tree, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
  const stop = () => end(child.pid);
  return new Promise((resolve, reject) => {
    let text = '';
    const refuse = (why) => { clearTimeout(timer); reject(expected(`the server for ${tree} did not come up: ${why}`)); };
    const fail = (why) => { stop(); refuse(why); };
    const timer = setTimeout(() => fail(`it said no port within ${ms / 1000} s`), ms);
    child.on('error', (e) => fail(e.message));
    child.on('exit', (code) => refuse(`it ended with exit code ${code}`));
    child.stdout.on('data', (d) => {
      text += d;
      const port = servedPort(text);
      if (!port) return;
      clearTimeout(timer);
      resolve({ port, stop });
    });
  });
}

/* Whether a folder is outside a tree: up out of it, or on another drive. p is path; the selftest gives path.win32 and
   path.posix, so that each platform's case is tested on either. */
export function outside(tree, out, p = path) { const rel = p.relative(tree, out); return /^\.\.([\\/]|$)/.test(rel) || p.isAbsolute(rel); }

/* A pair's line of summary.tsv: state, scenario, scenario hash, size, status, checks passed, checks failed, seconds,
   time. The last line of a pair wins. A line cut short, or with a status other than ok and FAIL, is not read. */
const ROW = 9;
export function readPairs(file) {
  const rows = new Map();
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* no results yet */ }
  for (const line of text.split('\n')) {
    const c = line.replace(/\r$/, '').split('\t');
    if (c.length === ROW && (c[4] === 'ok' || c[4] === 'FAIL')) rows.set(c.slice(0, 4).join('\t'), c);
  }
  return rows;
}

/* The leaves a run of pairs ends in, as LEAVES are a shot's: the selftest stands in for them and checks that each one
   here is the real thing. A drive itself is never a leaf: it is always the tree's own tools/drive.mjs. */
export const PAIR_LEAVES = { state: treeState, serve: serveTree, free: os.freemem, now: Date.now, shots: SHOTS, wt: wtPath, say: (line) => console.log(line) };

/* Every scenario at every size, on any tree, one Chrome at a time, within a budget; the same command run again
   resumes. A pair is one scenario at one size. Its result is a line of <out>/summary.tsv kept under the tree's state
   (treeState) and the scenario's own hash; its pictures go to <out>/<scenario>-<WxH>/ and the drive's lines to
   <out>/<scenario>-<WxH>.txt. The default out is <shots>/<lab>/drive-<state>. A pair that passed under the same state
   and the same scenario is skipped; one that failed is driven again, after the pairs never driven. A result kept under
   another state or another copy of the scenario is never read.
   The budget: the first pair to drive starts at once if the lock is free; a later one starts only when the time so far
   and one drive's limit (--timeout) fit the budget. The lock is waited for only as long as the budget leaves for that,
   so an outer limit above the budget never cuts a drive. With the lock held and before the drive, free memory is read;
   under --min-free-gb nothing more starts. Each drive is the tree's own tools/drive.mjs, inside withChromeLock with the
   holdChrome beside this file. The one server is started for the tree after its drive.mjs and scenarios have loaded,
   and stopped when the run ends: by a return, a throw, or an exit inside a drive.
   Exit code: 0 when every pair has passed for this state; 1 when every pair has a result and one failed, or nothing
   could be driven (the server did not come up, an error); 2 usage; 3 when a pair has no result for this state yet
   (the budget, the memory floor or the lock stopped it): run the same command again. A drive that ran no check, or
   was stopped at its limit, failed. seams: any of PAIR_LEAVES, and hold (withChromeLock's), given only by the selftest. */
export async function cmdDrivePairs(n, opts = {}, seams = {}) {
  const t = { ...PAIR_LEAVES, ...seams };
  const lab = byName(n);
  try { return await drivePairs(lab, opts, t); }
  catch (e) { console.error(e.expected ? e.message : (e.stack || e.message)); return e.code === 2 ? 2 : 1; }
}

async function drivePairs(lab, o, t) {
  const t0 = t.now();
  const plan = drivePlan(o, lab);
  const tree = o.tree ? treeOf(o.tree) : t.wt(lab);
  if (!fs.existsSync(tree)) throw usage(`no tree at ${tree}`);
  const driver = path.join(tree, 'tools', 'drive.mjs');
  if (!fs.existsSync(driver)) throw usage(`no tools/drive.mjs in ${tree}`);
  const key = t.state(tree);
  if (!key) throw usage(`git cannot read the state of ${tree} (no checkout, or no commit), so its results cannot be kept apart from another state's`);
  const out = path.resolve(o.out ?? path.join(t.shots, lab.name, `drive-${key}`));
  if (!outside(tree, out)) throw usage(`--out ${out} is inside the tree: what a drive writes there would change the tree's state`);
  const files = plan.scenarios.map((s) => (s.endsWith('.mjs') ? path.resolve(s) : path.join(tree, 'tools', 'drives', `${s}.mjs`)));
  for (const f of files) if (!fs.existsSync(f)) throw usage(`no scenario at ${f}`);
  const pairs = [];
  for (const f of files) {
    const name = path.basename(f, '.mjs'), hash = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
    for (const size of plan.sizes) pairs.push({ f, name, size, id: [key, name, hash, size].join('\t') });
  }
  const named = pairs.map((p) => `${p.name} ${p.size}`);
  if (new Set(named).size !== named.length) throw usage(`a scenario at a size is asked for twice (${named.join(', ')}): they would write one folder`);
  fs.mkdirSync(out, { recursive: true });
  const sum = path.join(out, 'summary.tsv');
  const rows = readPairs(sum);
  const passed = (p) => rows.get(p.id)?.[4] === 'ok';
  const todo = [...pairs.filter((p) => !rows.has(p.id)), ...pairs.filter((p) => rows.has(p.id) && !passed(p))];
  let ran = 0, why = '';
  if (todo.length) {
    const { drive } = await import(pathToFileURL(driver).href);
    if (typeof drive !== 'function') throw expected(`${driver} exports no drive function`);
    const scenario = new Map();
    for (const f of new Set(todo.map((p) => p.f))) {
      const s = (await import(pathToFileURL(f).href)).default;
      if (typeof s !== 'function') throw usage(`${f} has no default export to run`);
      scenario.set(f, s);
    }
    const deadline = t0 + plan.budget;
    const srv = await t.serve(tree);
    const stopAtExit = () => srv.stop();
    process.on('exit', stopAtExit);
    try {
      for (const p of todo) {
        const now = t.now();
        if (ran && now + plan.each > deadline) { why = `the ${plan.budget / 1000} s budget has no room left for a drive of up to ${plan.each / 1000} s`; break; }
        let low = null, r = null, took = 0;
        const dir = path.join(out, `${p.name}-${p.size}`), log = `${dir}.txt`;
        try {
          await withChromeLock(async () => {
            const free = t.free();
            if (free < plan.floor) { low = free; return; }
            const [width, height] = p.size.split('x').map(Number), s0 = t.now();
            fs.writeFileSync(log, '');
            try { r = await drive(scenario.get(p.f), { base: `http://127.0.0.1:${srv.port}`, out: dir, width, height, timeoutMs: plan.each, say: (m) => fs.appendFileSync(log, `${m}\n`) }); }
            catch (e) { r = { checks: [{ name: 'the drive ran to its end', ok: false, detail: String((e && e.stack) || e) }], timedOut: false }; }
            took = Math.round((t.now() - s0) / 1000);
          }, { waitMs: Math.max(0, deadline - plan.each - now), say: t.say, hold: t.hold });
        } catch (e) { if (!e.expected) throw e; why = e.message; break; }
        if (low !== null) { why = `${(low / 2 ** 30).toFixed(2)} GB free, under the floor of ${plan.floor / 2 ** 30} GB`; break; }
        ran++;
        const bad = r.checks.filter((c) => !c.ok);
        const status = r.timedOut || !r.checks.length || bad.length ? 'FAIL' : 'ok';
        const row = [p.id, status, r.checks.length - bad.length, bad.length, took, new Date().toISOString()].join('\t');
        fs.appendFileSync(sum, `${row}\n`);
        rows.set(p.id, row.split('\t'));
        t.say(`${status.padEnd(4)} ${p.name} ${p.size}: ${r.checks.length - bad.length} ok, ${bad.length} FAIL, ${took} s; pictures in ${dir}, its lines in ${log}`);
        if (r.timedOut) t.say(`  FAIL stopped at its limit of ${plan.each / 1000} s`);
        if (!r.checks.length) t.say('  FAIL no check ran: a drive that tested nothing failed');
        for (const c of bad.slice(0, 8)) t.say(`  FAIL ${c.name}${c.detail ? ` :: ${c.detail.slice(0, 200)}` : ''}`);
      }
    } finally {
      process.off('exit', stopAtExit);
      srv.stop();
      t.say(`stopped the server this drive started on port ${srv.port}`);
    }
  }
  const left = pairs.filter((p) => !rows.has(p.id)), failed = pairs.filter((p) => rows.has(p.id) && !passed(p));
  for (const p of pairs) {
    const c = rows.get(p.id);
    t.say(c ? `${c[4].padEnd(4)} ${p.name} ${p.size}: ${c[5]} ok, ${c[6]} FAIL, ${c[7]} s` : `---- ${p.name} ${p.size}: no result yet`);
  }
  if (left.length) { t.say(`${left.length} of ${pairs.length} pairs have no result for ${key} yet${why ? ` (${why})` : ''}: run the same command again`); return 3; }
  if (failed.length) { t.say(`${failed.length} of ${pairs.length} pairs failed for ${key}${why ? `, not all driven again (${why})` : ''}; results in ${sum}`); return 1; }
  t.say(`all ${pairs.length} pairs passed for ${key}${ran ? '' : ', none driven now: each had passed before'}; results in ${sum}`);
  return 0;
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
  // One merge path for the whole site: tools/ship_pr.mjs waits for the privacy and site checks, merges only when
  // every check has passed, and pins the merge to the commit it checked. The loop that stood here until 2026-11-13
  // went on to merge when the checks never started, or when only an outside check had reported.
  const guard = path.join(ROOT, 'tools', 'ship_pr.mjs');
  if (!fs.existsSync(guard)) die(`tools/ship_pr.mjs is missing in ${ROOT}; pull request #${info.number} is open and was not merged`);
  const s = spawnSync(process.execPath, [guard, String(info.number), '--squash'], { cwd: p, stdio: 'inherit' });
  if (s.status === 4) die(`pull request #${info.number} is merged, but not by this run: the guard did not verify its checks`);
  if (s.status === 5) die(`pull request #${info.number}: the merge call was accepted and could not be confirmed; look at it before shipping again`);
  if (s.status !== 0) die(`pull request #${info.number} was not merged`);
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

/* ---------- selftest: a shot takes the machine's Chrome lock, holds it until its work has ended, gives it back ---------- */

const SELF = fileURLToPath(import.meta.url);
const driveTool = () => import(new URL('./drive.mjs', import.meta.url).href);

/* A selftest that hangs stops itself: with exit code 1 when a check had already failed (that check caught the
   break), else with tools/drive.mjs WATCHDOG_EXIT, which tools/mutate.mjs reads as timed out and not as
   caught. On 2026-11-17 a copy that did not read LABS_DRIVE_WAIT_MS failed its check and then waited on the next
   one past mutate's 180 s limit, twice. */
async function watchdog(ms, failed, before = () => {}) {
  const { WATCHDOG_EXIT } = await driveTool();
  return setTimeout(() => { before(); console.log(`FAIL  labs-wt selftest: not finished in ${Math.round(ms / 1000)} s`); process.exit(failed() ? 1 : WATCHDOG_EXIT); }, ms).unref();
}

/* The pieces of the selftest that need a process of their own to end. */
async function selftestPart(what, arg) {
  if (what === 'exit') await withChromeLock(() => process.exit(3), { waitMs: 1000, lock: arg, say: () => {} });
  if (what === 'pairs-exit') {   // arg: the selftest's scratch folder; the tree's drive ends the process, the server's stop leaves a file
    globalThis.labsWtDrive = () => process.exit(5);
    await cmdDrivePairs(LABS[0].name, { tree: path.join(arg, 'trees', 't1'), out: path.join(arg, 'exit', 'out'), scenario: 'a', widths: '390x844' },
      { state: () => 'k', serve: async () => ({ port: 1, stop: () => fs.writeFileSync(path.join(arg, 'exit', 'stopped'), 'yes') }), free: () => 2 ** 40, hold: async () => () => {}, say: () => {} });
  }
  if (what === 'watchdog-clean' || what === 'watchdog-failed') {
    console.log = () => {};
    await watchdog(50, () => (what === 'watchdog-failed' ? 1 : 0));
    setInterval(() => {}, 1000);   // a hang: something still to do, and nothing done
    await new Promise(() => {});
  }
  return 2;
}

async function selftest() {
  const { WATCHDOG_EXIT } = await driveTool();
  let passed = 0, failed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const J = JSON.stringify;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'labs-wt-self-'));
  const lock = path.join(scratch, 'chrome.lock');
  const holder = () => { try { return JSON.parse(fs.readFileSync(lock, 'utf8')).pid; } catch { return null; } };
  const other = () => fs.writeFileSync(lock, J({ pid: process.ppid, t: Date.now() }));   // a process that runs and is not this one
  const envWait = process.env.LABS_DRIVE_WAIT_MS;
  const err = console.error;
  // The command's own messages are kept, not printed. If the tool ends the process inside a check (an unknown lab
  // name does), the selftest says so with what was kept: its first run ended that way, after ten passes, with exit
  // code 1 and no line saying why. Whatever ends the process from inside, the scratch folder goes with it; a
  // process killed outright leaves it.
  const kept = [];
  let done = false;
  const clean = () => {
    console.error = err;
    if (envWait === undefined) delete process.env.LABS_DRIVE_WAIT_MS; else process.env.LABS_DRIVE_WAIT_MS = envWait;
    fs.rmSync(scratch, { recursive: true, force: true });
  };
  process.on('exit', (code) => { if (!done) err(`FAIL  labs-wt selftest: the process ended inside a check, exit code ${code}${kept.length ? `: ${kept.join(' | ')}` : ''}`); clean(); });
  // The whole selftest takes about 3 s. The limit was 30 s until 2026-11-17, when one run of every list reported
  // this selftest as failing before any mutation; in that run another list took 41 s for its usual 5. At eight
  // times slower, 3 s is 24 to 29 s, so the limit is the likely cause; it is not proven, and 70 runs since, 24 of
  // them eight at a time, all passed. The limit is tools/drive.mjs's 120 s now, under the 180 s tools/mutate.mjs
  // gives a copy.
  await watchdog(120000, () => failed, () => { done = true; });
  try {
    /* ---- the real lock (tools/drive.mjs holdChrome), on a lock file of the selftest's own ---- */
    let during = null, after = null;
    const got = await withChromeLock(async () => { during = holder(); await tick(); after = holder(); return 7; }, { waitMs: 1000, lock, say: () => {} });
    yes('a shot holds the lock in its own name when it starts', during === process.pid, `holder ${during}`);
    yes('and still holds it when its work ends, after a wait inside it', after === process.pid, `holder ${after}`);
    yes('a shot gives the lock back when it ends', !fs.existsSync(lock));
    yes('what the shot returns comes back', got === 7, String(got));

    other();
    let ran = false, why = null, said = [];
    const t0 = Date.now();
    try { await withChromeLock(async () => { ran = true; }, { waitMs: 600, lock, say: (m) => said.push(m) }); } catch (e) { why = e; }
    const waited = Date.now() - t0;
    yes('a shot does not start while another process holds the lock', !ran && !!why && why.expected === true && /^Chrome was not free within 1 s/.test(why.message), why ? why.message : 'no error');
    yes('it says that it waits, and for how long', said.length === 1 && /^waiting up to 1 s for Chrome/.test(said[0]), said.join(' | ') || 'nothing said');
    yes('it waits as long as it was told before it gives up', waited >= 600, `${waited} ms`);
    yes('giving up leaves the lock with its holder', holder() === process.ppid, `holder ${holder()}`);
    fs.rmSync(lock, { force: true });

    why = null;
    try { await withChromeLock(async () => { await tick(); throw new Error('the shot failed'); }, { waitMs: 1000, lock, say: () => {} }); } catch (e) { why = e; }
    yes('a shot that fails still gives the lock back', !fs.existsSync(lock));
    yes('a shot that fails says so itself', !!why && why.message === 'the shot failed' && !why.expected, why ? why.message : 'no error');

    const listeners = process.listenerCount('exit');
    for (let i = 0; i < 3; i++) await withChromeLock(async () => {}, { waitMs: 1000, lock, say: () => {} });
    yes('a shot leaves no exit listener behind', process.listenerCount('exit') === listeners, `${process.listenerCount('exit')} after three shots, ${listeners} before`);

    const child = spawnSync(process.execPath, [SELF, 'selftest-part', 'exit', lock], { encoding: 'utf8', timeout: 60000 });
    yes('a shot whose process exits inside it gives the lock back on the way out', child.status === 3 && !fs.existsSync(lock), `exit code ${child.status}, lock ${fs.existsSync(lock) ? 'left' : 'gone'}`);
    fs.rmSync(lock, { force: true });

    /* ---- what it asks of the lock, exactly: a stand-in for holdChrome that writes down each call ---- */
    const fake = (answers) => {
      const calls = [];
      let back = 0;
      return { calls, back: () => back, hold: async (ms, file) => { calls.push([ms, file]); return answers.shift() ? () => { back++; } : null; } };
    };
    let f = fake([true]);
    said = []; ran = false;
    await withChromeLock(async () => { ran = true; }, { waitMs: 123456, lock: 'L', hold: f.hold, say: (m) => said.push(m) });
    yes('a free lock is asked for once, without waiting, nothing is said, and it is given back once', ran && same(f.calls, [[0, 'L']]) && said.length === 0 && f.back() === 1, `${J(f.calls)}, said ${said.length}, given back ${f.back()}`);

    f = fake([false, true]);
    said = []; ran = false;
    const order = [];
    await withChromeLock(async () => { ran = true; }, { waitMs: 123456, lock: 'L', hold: (ms, file) => { order.push(`hold ${ms}`); return f.hold(ms, file); }, say: (m) => { order.push('say'); said.push(m); } });
    yes('a held lock is then waited for exactly as long as told, on the same file', ran && same(f.calls, [[0, 'L'], [123456, 'L']]) && f.back() === 1, `${J(f.calls)}, given back ${f.back()}`);
    yes('the line about waiting comes before the wait and gives its length', same(order, ['hold 0', 'say', 'hold 123456']) && said[0] === "waiting up to 123 s for Chrome: another drive or shot holds the machine's lock", `${J(order)} ${J(said)}`);

    f = fake([false, false]);
    ran = false; why = null;
    try { await withChromeLock(async () => { ran = true; }, { waitMs: 123456, lock: 'L', hold: f.hold, say: () => {} }); } catch (e) { why = e; }
    yes('a lock still held after the wait refuses the shot', !ran && !!why && why.expected === true && same(f.calls, [[0, 'L'], [123456, 'L']]) && f.back() === 0, `${J(f.calls)}, ${why ? why.message : 'no error'}`);

    delete process.env.LABS_DRIVE_WAIT_MS;
    f = fake([false, true]);
    await withChromeLock(async () => {}, { hold: f.hold, say: () => {} });
    yes('with no wait given and LABS_DRIVE_WAIT_MS unset, a shot waits 20 minutes, on the machine\'s lock', same(f.calls, [[0, null], [1200000, null]]), J(f.calls));
    process.env.LABS_DRIVE_WAIT_MS = '300';
    f = fake([false, true]);
    await withChromeLock(async () => {}, { hold: f.hold, say: () => {} });
    yes('with LABS_DRIVE_WAIT_MS set, it waits that long', same(f.calls, [[0, null], [300, null]]), J(f.calls));
    delete process.env.LABS_DRIVE_WAIT_MS;
    const waits = [shotWaitMs({}), shotWaitMs({ LABS_DRIVE_WAIT_MS: '300' }), shotWaitMs({ LABS_DRIVE_WAIT_MS: 'soon' }), shotWaitMs({ LABS_DRIVE_WAIT_MS: '0' })];
    yes('the wait is LABS_DRIVE_WAIT_MS when it reads as a number other than 0, else 20 minutes, as a drive reads it', same(waits, [1200000, 300, 1200000, 1200000]), J(waits));

    /* ---- the shoot command, with the lock, the server and the pictures stood in for ---- */
    console.error = (m) => { kept.push(String(m)); };
    const { name, port } = LABS[0];
    yes('the leaves the command ends in are the real ones', same(Object.keys(LEAVES), ['exists', 'open', 'start', 'wait', 'stop', 'shot', 'say']) && LEAVES.exists === fs.existsSync && LEAVES.open === portOpen && LEAVES.start === startTempServer && LEAVES.wait === waitPort && LEAVES.stop === stopPid && LEAVES.shot === shootWith, Object.keys(LEAVES).join(' '));
    const shoot = async (o = {}, page = undefined) => {
      const log = [], printed = [];
      const lk = fake(o.lock || [true]);
      const out = console.log;
      kept.length = 0;
      process.exitCode = 0;
      if (o.say === 'real') console.log = (m) => { printed.push(String(m)); };   // the command's own say, read here
      try {
        await cmdShoot(name, page, {
          exists: () => o.worktree !== false,
          open: async (p) => { log.push(`open ${p}`); return !!o.served; },
          start: (l) => { log.push(`start ${l.name}`); return { pid: 4242 }; },
          wait: async (p, ms) => { log.push(`wait ${p} ${ms}`); return o.comesUp !== false; },
          stop: (pid) => { log.push(`stop ${pid}`); },
          shot: async (l, pg) => { log.push(`shot starts ${l.name} ${pg}`); await tick(); if (o.shotFails) throw new Error('the pictures failed'); log.push('shot ends'); },
          hold: async (ms, file) => { log.push(`hold ${ms}`); const back = await lk.hold(ms, file); return back && (() => { log.push('lock given back'); back(); }); },
          ...(o.say === 'real' ? {} : { say: () => {} }),
        });
      } finally { console.log = out; }
      const code = process.exitCode || 0;
      process.exitCode = 0;
      return { log, code, kept: kept.slice(), printed };
    };

    let r = await shoot({ served: true }, 'page.html');
    yes('the command takes the lock, then shoots, and gives the lock back only after the shot has ended', same(r.log, ['hold 0', `open ${port}`, `shot starts ${name} page.html`, 'shot ends', 'lock given back']) && r.code === 0, `${J(r.log)}, exit code ${r.code}`);

    r = await shoot({ served: true, lock: [false, true], say: 'real' });
    yes('the command itself says that it waits', same(r.printed, ["waiting up to 1200 s for Chrome: another drive or shot holds the machine's lock"]), J(r.printed));
    yes('the command adds no wait of its own: a held lock is waited for 20 minutes', same(r.log.filter((l) => l.startsWith('hold')), ['hold 0', 'hold 1200000']) && r.log.includes('shot ends'), J(r.log));

    r = await shoot({ served: true, lock: [false, false] });
    yes('when Chrome is not free the command starts nothing, says why, and ends with exit code 1', same(r.log, ['hold 0', 'hold 1200000']) && r.code === 1 && same(r.kept, ["Chrome was not free within 1200 s: another drive or shot holds the machine's lock"]), `${J(r.log)}, exit code ${r.code}, ${J(r.kept)}`);

    r = await shoot({ served: false, comesUp: false });
    yes('a server that does not come up is stopped, nothing is shot, the lock is given back, exit code 1 with the reason', same(r.log, ['hold 0', `open ${port}`, `start ${name}`, `wait ${port} 8000`, 'stop 4242', 'lock given back']) && r.code === 1 && same(r.kept, [`server on ${port} did not come up`]), `${J(r.log)}, exit code ${r.code}, ${J(r.kept)}`);

    r = await shoot({ served: false, say: 'real' });
    yes('the command itself says that it stopped the server it started', same(r.printed, [`stopped the server this shot started on port ${port}`]), J(r.printed));
    yes('a server the shot started is stopped after the shot, and then the lock is given back', same(r.log, ['hold 0', `open ${port}`, `start ${name}`, `wait ${port} 8000`, `shot starts ${name} undefined`, 'shot ends', 'stop 4242', 'lock given back']) && r.code === 0, `${J(r.log)}, exit code ${r.code}`);

    r = await shoot({ served: false, shotFails: true });
    yes('a shot that throws: the server is still stopped, the lock given back, exit code 1 with the error and where it came from', same(r.log.slice(-2), ['stop 4242', 'lock given back']) && !r.log.includes('shot ends') && r.code === 1 && r.kept.length === 1 && /the pictures failed/.test(r.kept[0]) && /\n\s+at /.test(r.kept[0]), `${J(r.log)}, exit code ${r.code}, ${J(r.kept).slice(0, 34)}`);

    r = await shoot({ worktree: false, served: false });
    yes('a lab with no worktree and nothing on its port is refused before the wait for Chrome', same(r.log, [`open ${port}`]) && r.code === 1 && same(r.kept, [`no worktree for ${name}; run add first`]), `${J(r.log)}, exit code ${r.code}, ${J(r.kept)}`);

    r = await shoot({ worktree: false, served: true });
    yes('a lab with no worktree whose port is served is shot', same(r.log, [`open ${port}`, 'hold 0', `open ${port}`, `shot starts ${name} undefined`, 'shot ends', 'lock given back']) && r.code === 0, `${J(r.log)}, exit code ${r.code}`);

    /* ---- drive on any tree: its words, its plan, the tree, the tree's state, the server ---- */
    const norm = (p) => p.replace(/\\/g, '/');
    const outLog = console.log, said2 = [];
    console.log = (m) => { said2.push(String(m)); };
    try { PAIR_LEAVES.say('a line'); } finally { console.log = outLog; }
    yes('the leaves a run of pairs ends in are the real ones', same(Object.keys(PAIR_LEAVES), ['state', 'serve', 'free', 'now', 'shots', 'wt', 'say']) && PAIR_LEAVES.state === treeState && PAIR_LEAVES.serve === serveTree && PAIR_LEAVES.free === os.freemem && PAIR_LEAVES.now === Date.now && PAIR_LEAVES.shots === SHOTS && PAIR_LEAVES.wt === wtPath && same(said2, ['a line']), `${Object.keys(PAIR_LEAVES).join(' ')}; said ${J(said2)}`);

    const argsOf = (a) => { try { return driveArgs(a); } catch (e) { return { error: e.message, code: e.code, expected: e.expected }; } };
    yes('drive with a lab name and no flag has no option, so it is the drive it was before the flags', same(argsOf(['heptapod']), { name: 'heptapod', opts: {} }) && isPairRun({}) === false, J(argsOf(['heptapod'])));
    const every = argsOf(['--tree', 'T', '--scenario', 'a,b', 'heptapod', '--widths', '390x844', '--out', 'O', '--timeout', '9', '--budget', '99', '--min-free-gb', '1']);
    yes('each flag is read into its option, with the lab name anywhere among them', same(every, { name: 'heptapod', opts: { tree: 'T', scenario: 'a,b', widths: '390x844', out: 'O', timeout: '9', budget: '99', minFreeGb: '1' } }), J(every));
    yes('any one flag makes it a run of pairs', isPairRun({ budget: '60' }) === true);
    const refusals = [[['heptapod', '--widht', '390x844'], 'drive: unknown flag --widht'], [['heptapod', '--budget'], 'drive: --budget needs a value'],
      [['heptapod', '--budget', '--tree', 'x'], 'drive: --budget needs a value'], [['heptapod', '--tree', ''], 'drive: --tree needs a value'],
      [[], 'drive takes one lab name, and was given 0'], [['a', 'b'], 'drive takes one lab name, and was given 2: a b']];
    const refused = refusals.map(([a]) => argsOf(a));
    yes('a misspelt flag, a flag with no value, and no lab name or two are refused with exit code 2 and the reason', refused.every((x, i) => x.code === 2 && x.expected === true && x.error === refusals[i][1]), J(refused));

    const planOf = (o) => { try { return drivePlan(o, LABS[0]); } catch (e) { return { error: e.message, code: e.code }; } };
    yes('with no flag, a run drives the lab\'s own scenario at 1440x900 and 390x844, 300 s a drive, 540 s in all, with 2 GB free', same(planOf({}), { scenarios: [name], sizes: ['1440x900', '390x844'], each: 300000, budget: 540000, floor: 2 * 2 ** 30 }), J(planOf({})));
    const sizesIn = ['1x1', '1440x900,390x844'].map((w) => planOf({ widths: w }).sizes);
    const sizesOut = ['0x900', '1440x0', '1440', '1440x900x3', ' 1440x900', '01440x900', '1440x900,', 'x900'].map((w) => planOf({ widths: w }).code);
    yes('a size is WxH, each at least 1, and anything else is refused with exit code 2, an empty item too', same(sizesIn, [['1x1'], ['1440x900', '390x844']]) && sizesOut.every((c) => c === 2), `${J(sizesIn)} ${J(sizesOut)}`);
    const bounds = [planOf({ timeout: '0' }).code, planOf({ timeout: '0.001', budget: '1' }).each, planOf({ timeout: 'soon' }).code, planOf({ timeout: '100', budget: '100' }).budget,
      planOf({ timeout: '100', budget: '99.999' }).code, planOf({ budget: 'x' }).code, planOf({ minFreeGb: '0' }).floor, planOf({ minFreeGb: '-0.001' }).code, planOf({ minFreeGb: 'x' }).code, planOf({ minFreeGb: '3' }).floor];
    yes('a timeout above 0, a budget at least the timeout, a memory floor of 0 or more: just inside each is taken, just outside refused', same(bounds, [2, 1, 2, 100000, 2, 2, 0, 2, 2, 3 * 2 ** 30]), J(bounds));
    yes('a refusal says the bound and what it was given', planOf({ timeout: '100', budget: '99.999' }).error === '--budget takes seconds, at least the 100 s of --timeout so that a drive started at once fits it, and was given "99.999"' && planOf({ widths: '1440' }).error === '--widths takes WxH,WxH (1440x900,390x844), and "1440" is not one', `${planOf({ timeout: '100', budget: '99.999' }).error} | ${planOf({ widths: '1440' }).error}`);
    yes('a scenario list with an empty name is refused, and one without is taken; an empty --scenario or --widths is no default', planOf({ scenario: 'a,,b' }).code === 2 && planOf({ scenario: '' }).code === 2 && planOf({ widths: '' }).code === 2 && same(planOf({ scenario: 'a,b' }).scenarios, ['a', 'b']), J(planOf({ scenario: '' })));

    const trees = [treeOf('_bh3'), treeOf('lab-2_x'), treeOf(path.join(scratch, 'abs')), treeOf('sub/t', scratch), treeOf('.', scratch)];
    yes('a tree is its folder under _labs_wt when it is a bare name, else a path from where the command runs', same(trees, [norm(path.join(WT_ROOT, '_bh3')), norm(path.join(WT_ROOT, 'lab-2_x')), norm(path.join(scratch, 'abs')), norm(path.join(scratch, 'sub', 't')), norm(scratch)]), J(trees));

    const W = path.win32, P = path.posix;
    const outsides = [outside('C:/t', 'D:/o', W), outside('C:/t', 'C:/u', W), outside('C:/t', 'C:/t', W), outside('C:/t', 'C:/t/x', W), outside('C:/t', 'C:/t/..foo', W), outside('C:/t', 'c:/T/x', W),
      outside('C:/t/u', 'C:/t', W), outside('/t', '/u', P), outside('/t', '/', P), outside('/t', '/t/x', P), outside('/t', '/t/..foo', P), outside('/t', '/t', P)];
    yes('a folder is outside a tree when it is up out of it or on another drive; the tree, a folder in it and one named ..foo in it are inside', same(outsides, [true, true, false, false, false, false, true, true, true, false, false, false]), J(outsides));
    const ports = [servedPort('Serving HTTP on 127.0.0.1 port 58394 (http://127.0.0.1:58394/) ...\n'), servedPort('a line first\nServing HTTP on :: port 8000 (http://[::]:8000/) ...'), servedPort('Serving HTTP on 127.0.0.1 port '), servedPort('')];
    yes('the port is read from the server\'s own line wherever it comes, and is 0 when there is none', same(ports, [58394, 8000, 0, 0]), J(ports));

    // the server leaf, with a node script standing in for python: it writes its pid, and ends by itself after 20 s at most
    const pidFile = path.join(scratch, 'server.pid');
    const standIn = (body) => [process.execPath, ['-e', `require('fs').writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => process.exit(0), 20000); ${body}`, pidFile]];
    const pidOf = async () => { for (let i = 0; i < 30; i++) { try { return Number(fs.readFileSync(pidFile, 'utf8')); } catch { await tick(100); } } return 0; };
    const gone = async (pid) => { for (let i = 0; i < 30; i++) { try { process.kill(pid, 0); } catch { return true; } await tick(100); } return false; };
    const kill = (pid) => { try { process.kill(pid); } catch { /* gone */ } };
    const upSrv = await serveTree(scratch, 8000, standIn('console.log("Serving HTTP on 127.0.0.1 port 54321 (http://127.0.0.1:54321/) ...");'), kill);
    const upPid = await pidOf();
    let upLive = true;
    try { process.kill(upPid, 0); } catch { upLive = false; }
    upSrv.stop();
    yes('a server that says its port comes back with that port, and its stop ends it', upSrv.port === 54321 && upPid > 0 && upLive && (await gone(upPid)), `port ${upSrv.port}, pid ${upPid}, ${upLive ? 'running' : 'not running'} before the stop`);
    fs.rmSync(pidFile, { force: true });
    const lateT0 = Date.now();
    const late = await serveTree(scratch, 500, standIn(''), kill).then(() => 'came up', (e) => e);
    const lateTook = Date.now() - lateT0, latePid = await pidOf();   // 0: stopped before it wrote its pid
    yes('a server that says no port in its time is refused when the time is up, and stopped', late instanceof Error && late.expected === true && late.message === `the server for ${scratch} did not come up: it said no port within 0.5 s` && lateTook < 4000 && (latePid === 0 || (await gone(latePid))), `${late.message || late}, after ${lateTook} ms, pid ${latePid}`);
    const ends = [];
    const ended = await serveTree(scratch, 8000, standIn('process.exit(4);'), (pid) => ends.push(pid)).then(() => 'came up', (e) => e);
    yes('a server that ends before it says a port is refused with its exit code, and not stopped again', ended instanceof Error && ended.expected === true && ended.message === `the server for ${scratch} did not come up: it ended with exit code 4` && ends.length === 0, `${ended.message || ended}; stopped ${ends.length} times`);
    const none = await serveTree(scratch, 8000, ['no-such-server-labs-wt', []], kill).then(() => 'came up', (e) => e);
    yes('a server that cannot start is refused with the reason', none instanceof Error && none.expected === true && /^the server for .* did not come up: .*ENOENT/.test(none.message), none.message || none);

    // the tree's state: what git lists, from a checkout of the selftest's own (git told to read no configuration of the
    // machine's), then the hash of what is listed, from files alone
    const repo = path.join(scratch, 'repo');
    const real = (p) => norm(fs.realpathSync.native(p));   // git gives the long form of a path the temp folder names short
    fs.mkdirSync(path.join(repo, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(scratch, 'gitconfig'), '');
    const genv = { ...process.env, GIT_CONFIG_GLOBAL: path.join(scratch, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
    const g = (...a) => run('git', ['-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', ...a], { cwd: repo, env: genv });
    const put = (f, text) => fs.writeFileSync(path.join(repo, f), text);
    put('a.txt', 'one\n'); put('d.txt', 'd\n'); put('.gitignore', 'ignored/\n'); put('sub/c.txt', 'c\n');
    const inited = g('init', '-q').ok;
    const noCommit = treeDiff(repo);
    const made = inited && g('add', 'a.txt', 'd.txt', '.gitignore', 'sub/c.txt').ok && g('commit', '-q', '-m', 'one').ok;
    const clean = treeDiff(repo);
    put('a.txt', 'two\n'); fs.rmSync(path.join(repo, 'd.txt')); put('b b.txt', 'b\n'); fs.mkdirSync(path.join(repo, 'ignored')); put('ignored/x.txt', 'x\n'); fs.mkdirSync(path.join(repo, 'newdir')); put('newdir/n.txt', 'n\n');
    const dirtyD = treeDiff(repo), fromSub = treeDiff(path.join(repo, 'sub')), noTree = treeDiff(path.join(repo, '.git'));
    const unstaged = treeState(repo, dirtyD), staged = g('add', 'b b.txt').ok && treeState(repo);
    put('.git/index', 'not an index');
    const broken = treeDiff(repo);
    yes('git lists nothing for a clean checkout, and gives its head and top', made && !!clean && /^[0-9a-f]{12}$/.test(clean.head) && norm(clean.root) === real(repo) && same(clean.paths, []), J(clean));
    yes('it lists a changed, a deleted and an untracked file, one in a folder git does not track, a space in a name kept, and nothing git ignores', !!dirtyD && same(dirtyD.paths, ['a.txt', 'b b.txt', 'd.txt', 'newdir/n.txt']) && dirtyD.head === clean.head, J(dirtyD));
    yes('from a folder below the top, the paths and the top are the checkout\'s', !!fromSub && same(fromSub.paths, dirtyD.paths) && norm(fromSub.root) === real(repo), J(fromSub));
    yes('a new file staged and not committed leaves the state as it was: the server serves the same files', !!unstaged && unstaged === staged, J([unstaged, staged]));
    yes('git that cannot say (no commit yet, no working tree, an index it cannot read) gives nothing, and so no state', noCommit === null && noTree === null && broken === null && treeState(path.join(repo, '.git')) === null, J({ noCommit, noTree, broken }));
    const st = (paths) => treeState(null, { head: 'h', root: repo, paths });
    put('a.txt', 'one\n'); const k1 = st(['a.txt']);
    put('a.txt', 'two\n'); const k2 = st(['a.txt']);
    put('a.txt', ''); const kEmpty = st(['a.txt']);
    fs.rmSync(path.join(repo, 'a.txt')); const kDel = st(['a.txt']);
    const kGone = st(['gone.txt']), kGone2 = st(['gone2.txt']), kTwo = st(['b b.txt', 'sub/c.txt']);
    yes('a checkout with nothing listed is keyed by its head alone, else by the head and a hash of what is listed', st([]) === 'h' && [k1, k2, kEmpty, kDel, kGone, kTwo].every((k) => /^h\+[0-9a-f]{10}$/.test(k)), J([st([]), k1]));
    yes('the hash changes with a file\'s content and its name, an emptied file and the same file deleted apart', new Set([k1, k2, kEmpty, kDel, kGone, kGone2, kTwo]).size === 7, J([k1, k2, kEmpty, kDel, kGone, kGone2, kTwo]));

    /* ---- the run of pairs, with the tree's drive, the server, the clock, the memory and the lock stood in for ---- */
    // A tree here is a folder whose tools/drive.mjs hands each drive to globalThis.labsWtDrive, which each run sets.
    const mkTree = (dir, driver = 'export const drive = (...a) => globalThis.labsWtDrive(...a);\n') => {
      fs.mkdirSync(path.join(dir, 'tools', 'drives'), { recursive: true });
      if (driver) fs.writeFileSync(path.join(dir, 'tools', 'drive.mjs'), driver);
      for (const s of ['a', 'b', 'c', name]) fs.writeFileSync(path.join(dir, 'tools', 'drives', `${s}.mjs`), `export default async () => '${s}';\n`);
      return norm(dir);
    };
    const T1 = mkTree(path.join(scratch, 'trees', 't1')), T2 = mkTree(path.join(scratch, 'trees', 't2'), ''), T3 = mkTree(path.join(scratch, 'trees', 't3'), 'export const nothing = 1;\n');
    const WT = mkTree(path.join(scratch, 'wt', name));
    const okResult = () => ({ checks: [{ name: 'it works', ok: true, detail: '' }], errors: [], timedOut: false });
    const pairRun = async (o = {}) => {
      const log = [], printed = [], seen = [];
      let clock = 0, held = false, drives = 0, frees = 0;
      const answers = [...(o.lock || [])];
      globalThis.labsWtDrive = async (scenario, d) => {
        log.push(`drive ${await scenario()} ${d.width}x${d.height}${held ? '' : ' OUTSIDE THE LOCK'}`);
        seen.push({ base: d.base, out: norm(d.out), timeoutMs: d.timeoutMs });
        d.say('a line the drive said');
        const r = (o.result || okResult)(drives);
        clock += typeof o.takes === 'function' ? o.takes(drives) : (o.takes ?? 1000);
        drives++;
        if (r instanceof Error) throw r;
        return r;
      };
      kept.length = 0;
      const listeners = process.listenerCount('exit');
      const code = await cmdDrivePairs(o.lab || name, { tree: T1, out: path.join(scratch, o.outDir || 'out'), scenario: 'a', widths: '1440x900', ...o.opts }, {
        state: (tr) => { log.push(`state ${path.basename(tr)}`); clock += o.stateTakes || 0; return o.key === undefined ? 'k1' : o.key; },
        serve: async (tr) => { log.push(`serve ${path.basename(tr)}`); clock += o.setup || 0; if (o.serveFails) throw expected('the server did not come up'); return { port: 4242, stop: () => log.push('stop') }; },
        free: () => (typeof o.free === 'function' ? o.free(frees++) : (o.free ?? 8 * 2 ** 30)),
        now: () => clock,
        shots: path.join(scratch, 'shots'),
        wt: (lab) => (lab.name === name ? WT : path.join(scratch, 'wt', lab.name)),
        hold: async (ms) => { log.push(`hold ${ms}`); if (answers.length && !answers.shift()) return null; held = true; return () => { held = false; log.push('given back'); }; },
        say: (m) => printed.push(String(m)),
      });
      return { code, log, printed, seen, kept: kept.slice(), listeners: process.listenerCount('exit') - listeners };
    };
    const rowsIn = (dir) => { try { return fs.readFileSync(path.join(scratch, dir, 'summary.tsv'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t')); } catch { return []; } };
    const last = (x) => x.printed[x.printed.length - 1] || '';
    const drove = (x) => x.log.filter((l) => l.startsWith('drive '));

    let x = await pairRun({ outDir: 'o1', opts: { scenario: 'a,b', widths: '1440x900,390x844' } });
    yes('every scenario at every size is driven, in order, each inside the lock and given back after it, between one server\'s start and stop', x.code === 0 && same(x.log, ['state t1', 'serve t1', 'hold 0', 'drive a 1440x900', 'given back', 'hold 0', 'drive a 390x844', 'given back', 'hold 0', 'drive b 1440x900', 'given back', 'hold 0', 'drive b 390x844', 'given back', 'stop']), `exit ${x.code} ${J(x.log)}`);
    const o1 = norm(path.join(scratch, 'o1'));
    yes('each drive is told the server, a folder of its own and the time limit', same(x.seen.map((s) => [s.base, s.out, s.timeoutMs]), [['http://127.0.0.1:4242', `${o1}/a-1440x900`, 300000], ['http://127.0.0.1:4242', `${o1}/a-390x844`, 300000], ['http://127.0.0.1:4242', `${o1}/b-1440x900`, 300000], ['http://127.0.0.1:4242', `${o1}/b-390x844`, 300000]]), J(x.seen));
    let rows = rowsIn('o1');
    yes('each pair is a line of the summary under the state, with its status and counts', rows.length === 4 && same(rows.map((c) => [c[0], c[1], c[3], c[4], c[5], c[6], c.length]), [['k1', 'a', '1440x900', 'ok', '1', '0', 9], ['k1', 'a', '390x844', 'ok', '1', '0', 9], ['k1', 'b', '1440x900', 'ok', '1', '0', 9], ['k1', 'b', '390x844', 'ok', '1', '0', 9]]) && rows[0][2] !== rows[2][2], J(rows));
    yes('what a drive says goes to its own file', fs.readFileSync(path.join(scratch, 'o1', 'a-390x844.txt'), 'utf8') === 'a line the drive said\n');
    yes('the run says each pair, the server it stopped, and that every pair passed', x.printed.includes(`ok   a 1440x900: 1 ok, 0 FAIL, 1 s; pictures in ${path.join(scratch, 'o1', 'a-1440x900')}, its lines in ${path.join(scratch, 'o1', 'a-1440x900')}.txt`) && x.printed.includes('stopped the server this drive started on port 4242') && x.printed.includes('ok   b 390x844: 1 ok, 0 FAIL, 1 s') && last(x) === `all 4 pairs passed for k1; results in ${path.join(scratch, 'o1', 'summary.tsv')}` && x.listeners === 0, J(x.printed.slice(-3)));

    x = await pairRun({ outDir: 'o1', opts: { scenario: 'a,b', widths: '1440x900,390x844' } });
    yes('run again on the same state, the pairs that passed are skipped, no server starts, and it says so with exit code 0', x.code === 0 && same(x.log, ['state t1']) && last(x).startsWith('all 4 pairs passed for k1, none driven now'), `exit ${x.code} ${J(x.log)} ${last(x)}`);
    x = await pairRun({ outDir: 'o1', key: 'k2', opts: { scenario: 'a,b', widths: '1440x900,390x844' } });
    yes('a pair recorded under another state is never reused: all four are driven again', x.code === 0 && drove(x).length === 4, J(x.log));
    yes('a pair driven again starts its file of lines afresh', fs.readFileSync(path.join(scratch, 'o1', 'a-390x844.txt'), 'utf8') === 'a line the drive said\n');
    fs.writeFileSync(path.join(T1, 'tools', 'drives', 'b.mjs'), "export default async () => 'b';\n// changed\n");
    x = await pairRun({ outDir: 'o1', key: 'k2', opts: { scenario: 'a,b', widths: '1440x900,390x844' } });
    yes('a scenario whose file changed is driven again, the other is not', x.code === 0 && same(drove(x), ['drive b 1440x900', 'drive b 390x844']), J(x.log));

    x = await pairRun({ outDir: 'o2', opts: { scenario: 'a,b,c', timeout: '100', budget: '300' }, takes: (k) => (k === 0 ? 200000 : 1), lock: [false, true, false, true] });
    yes('a later pair starts when the time so far and one drive\'s limit just fit the budget, and not 1 ms past it: exit code 3', x.code === 3 && same(drove(x), ['drive a 1440x900', 'drive b 1440x900']) && x.log[x.log.length - 1] === 'stop' && x.printed.includes('---- c 1440x900: no result yet') && last(x) === '1 of 3 pairs have no result for k1 yet (the 300 s budget has no room left for a drive of up to 100 s): run the same command again', `exit ${x.code} ${J(x.log)} ${last(x)}`);
    yes('the lock is waited for as long as the budget leaves for a drive to start, and no longer', same(x.log.filter((l) => l.startsWith('hold')), ['hold 0', 'hold 200000', 'hold 0', 'hold 0']), J(x.log));
    x = await pairRun({ outDir: 'o2', opts: { scenario: 'a,b,c', timeout: '100', budget: '300' } });
    yes('the same command run again drives only the pair that had no result', x.code === 0 && same(drove(x), ['drive c 1440x900']), `exit ${x.code} ${J(x.log)}`);
    x = await pairRun({ outDir: 'o3', opts: { scenario: 'a,b', timeout: '100', budget: '100' }, setup: 5, lock: [false, true] });
    yes('the first pair starts though the setup took its first ms, waits for no lock it cannot fit, and the next does not start', x.code === 3 && same(drove(x), ['drive a 1440x900']) && same(x.log.filter((l) => l.startsWith('hold')), ['hold 0', 'hold 0']), J(x.log));

    x = await pairRun({ outDir: 'o4', lock: [false, false] });
    yes('a lock that stays held for the 240 s the budget leaves starts no drive, stops the server, says why, exit code 3', x.code === 3 && same(x.log, ['state t1', 'serve t1', 'hold 0', 'hold 240000', 'stop']) && x.printed.includes("waiting up to 240 s for Chrome: another drive or shot holds the machine's lock") && last(x).endsWith("(Chrome was not free within 240 s: another drive or shot holds the machine's lock): run the same command again"), `exit ${x.code} ${J(x.log)} ${last(x)}`);
    const floorRuns = [];
    for (const [free, gb] of [[2 * 2 ** 30, undefined], [2 * 2 ** 30 - 1, undefined], [3 * 2 ** 30, '3'], [3 * 2 ** 30 - 1, '3'], [0, '0'], [0, undefined]]) floorRuns.push(await pairRun({ outDir: `o5-${floorRuns.length}`, free, opts: gb === undefined ? {} : { minFreeGb: gb } }));
    yes('a drive starts with free memory at the floor (2 GB, or --min-free-gb), and not 1 byte under it: exit code 3, the server stopped', same(floorRuns.map((r) => [r.code, drove(r).length, r.log[r.log.length - 1]]), [[0, 1, 'stop'], [3, 0, 'stop'], [0, 1, 'stop'], [3, 0, 'stop'], [0, 1, 'stop'], [3, 0, 'stop']]) && last(floorRuns[1]) === '1 of 1 pairs have no result for k1 yet (2.00 GB free, under the floor of 2 GB): run the same command again', J(floorRuns.map((r) => [r.code, r.log])) + last(floorRuns[1]));
    x = await pairRun({ outDir: 'o6', opts: { scenario: 'a,b,c' }, free: (k) => (k === 1 ? 1 : 8 * 2 ** 30) });
    yes('free memory is read again before each pair, and under the floor no later pair starts', x.code === 3 && same(drove(x), ['drive a 1440x900']), J(x.log));
    x = await pairRun({ outDir: 'o16', opts: { timeout: '100', budget: '300' }, stateTakes: 7, lock: [false, true] });
    yes('the budget counts from the run\'s start, the time spent reading the tree\'s state included', x.code === 0 && same(x.log.filter((l) => l.startsWith('hold')), ['hold 0', 'hold 199993']), J(x.log));

    const failing = () => ({ checks: [{ name: 'it works', ok: true }, { name: 'it broke', ok: false, detail: 'why' }], errors: [], timedOut: false });
    x = await pairRun({ outDir: 'o7', opts: { scenario: 'a,b' }, result: (k) => (k === 0 ? failing() : okResult()) });
    rows = rowsIn('o7');
    yes('a pair with a failed check is recorded as failed, its failures said, exit code 1', x.code === 1 && same(rows.map((c) => [c[1], c[4], c[5], c[6]]), [['a', 'FAIL', '1', '1'], ['b', 'ok', '1', '0']]) && x.printed.includes('  FAIL it broke :: why') && last(x) === `1 of 2 pairs failed for k1; results in ${path.join(scratch, 'o7', 'summary.tsv')}`, `exit ${x.code} ${J(rows)} ${last(x)}`);
    x = await pairRun({ outDir: 'o7', opts: { scenario: 'c,a,b' } });
    yes('run again, a pair never driven comes first, then the one that failed, and the one that passed is skipped', x.code === 0 && same(drove(x), ['drive c 1440x900', 'drive a 1440x900']), J(x.log));
    x = await pairRun({ outDir: 'o8', opts: { scenario: 'a,b' }, result: () => failing() });
    x = await pairRun({ outDir: 'o8', opts: { scenario: 'a,b', timeout: '100', budget: '250' }, takes: 200000 });
    yes('when every pair has a result and the budget stops a failed one from being driven again, exit code 1, and it says so', x.code === 1 && same(drove(x), ['drive a 1440x900']) && last(x).startsWith('1 of 2 pairs failed for k1, not all driven again (the 250 s budget'), `exit ${x.code} ${last(x)}`);
    x = await pairRun({ outDir: 'o9', opts: { scenario: 'a,b', timeout: '100', budget: '250' }, takes: 200000, result: () => failing() });
    yes('a failed pair with pairs still to drive gives exit code 3', x.code === 3 && drove(x).length === 1, `exit ${x.code}`);
    const odd = [];
    for (const [result, line] of [[() => ({ checks: [], errors: [], timedOut: false }), '  FAIL no check ran: a drive that tested nothing failed'], [() => ({ checks: [{ name: 'it works', ok: true }], errors: [], timedOut: true }), '  FAIL stopped at its limit of 300 s']]) {
      const r = await pairRun({ outDir: `o10-${odd.length}`, result });
      odd.push([r.code, rowsIn(`o10-${odd.length}`).map((c) => c[4]).join(), r.printed.includes(line)]);
    }
    yes('a drive that ran no check failed, and so did one stopped at its limit with every check passed', same(odd, [[1, 'FAIL', true], [1, 'FAIL', true]]), J(odd));
    x = await pairRun({ outDir: 'o11', result: () => new Error('the drive broke') });
    rows = rowsIn('o11');
    yes('a drive that throws is a failed pair with the error, the lock given back and the server stopped', x.code === 1 && rows.length === 1 && rows[0][4] === 'FAIL' && x.printed.some((l) => l.startsWith('  FAIL the drive ran to its end :: Error: the drive broke') && /\n\s+at /.test(l)) && same(x.log.slice(-3), ['drive a 1440x900', 'given back', 'stop']), `exit ${x.code} ${J(x.log)}`);

    x = await pairRun({ outDir: 'o12', opts: { tree: path.join(scratch, 'trees', 'none') } });
    yes('a tree that is not there is refused with exit code 2, before its state is read', x.code === 2 && same(x.kept, [`no tree at ${norm(path.join(scratch, 'trees', 'none'))}`]) && x.log.length === 0, `exit ${x.code} ${J(x.kept)}`);
    x = await pairRun({ outDir: 'o12', opts: { tree: T2 } });
    yes('a tree with no tools/drive.mjs is refused with exit code 2, saying so', x.code === 2 && same(x.kept, [`no tools/drive.mjs in ${T2}`]) && x.log.length === 0, `exit ${x.code} ${J(x.kept)}`);
    x = await pairRun({ outDir: 'o12', key: null });
    yes('a tree whose state git cannot say is refused with exit code 2', x.code === 2 && /^git cannot read the state of /.test(x.kept[0] || '') && same(x.log, ['state t1']), `exit ${x.code} ${J(x.kept)}`);
    x = await pairRun({ opts: { tree: undefined, scenario: undefined, out: undefined } });
    yes('with no --tree it drives the lab\'s worktree, its own scenario, into a folder kept by lab and state', x.code === 0 && same(x.log.slice(0, 4), [`state ${name}`, `serve ${name}`, 'hold 0', `drive ${name} 1440x900`]) && fs.existsSync(path.join(scratch, 'shots', name, 'drive-k1', 'summary.tsv')), `exit ${x.code} ${J(x.log)} ${J(x.kept)}`);
    const ext = path.join(scratch, 'ext', 'x.mjs');
    fs.mkdirSync(path.dirname(ext), { recursive: true });
    fs.writeFileSync(ext, "export default async () => 'x';\n");
    x = await pairRun({ outDir: 'o13', opts: { scenario: `a,${ext}` } });
    yes('a scenario is a name in the tree\'s tools/drives, or a path to a .mjs anywhere', x.code === 0 && same(drove(x), ['drive a 1440x900', 'drive x 1440x900']), `exit ${x.code} ${J(x.log)} ${J(x.kept)}`);
    x = await pairRun({ outDir: 'o13', opts: { scenario: 'a,nope' } });
    yes('a scenario that is not there is refused with exit code 2', x.code === 2 && same(x.kept, [`no scenario at ${path.join(T1, 'tools', 'drives', 'nope.mjs')}`]), J(x.kept));
    fs.writeFileSync(path.join(T1, 'tools', 'drives', 'nodefault.mjs'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(T1, 'tools', 'drives', 'boom.mjs'), "throw new Error('boom at import');\n");
    fs.mkdirSync(path.join(scratch, 'ext', 'dir.mjs'));
    const bad = [await pairRun({ outDir: 'o14', opts: { scenario: 'nodefault' } }), await pairRun({ outDir: 'o14', opts: { scenario: 'boom' } }), await pairRun({ outDir: 'o14', opts: { tree: T3 } }), await pairRun({ outDir: 'o14', serveFails: true }), await pairRun({ outDir: 'o14', opts: { scenario: path.join(scratch, 'ext', 'dir.mjs') } })];
    yes('a scenario with no default export: exit code 2; one that throws as it loads, or a folder named as one: exit code 1 with where; a tree whose drive.mjs has no drive, or a server that does not come up: exit code 1, nothing driven', same(bad.map((r) => r.code), [2, 1, 1, 1, 1]) && /has no default export to run$/.test(bad[0].kept[0]) && /boom at import/.test(bad[1].kept[0]) && /\n\s+at /.test(bad[1].kept[0]) && /exports no drive function$/.test(bad[2].kept[0]) && bad[3].kept[0] === 'the server did not come up' && /EISDIR/.test(bad[4].kept[0]) && /\n\s+at /.test(bad[4].kept[0]) && bad.every((r) => drove(r).length === 0), J(bad.map((r) => [r.code, r.kept])).slice(0, 400));
    const outs = [];
    for (const out of [path.join(T1, 'x'), path.join(scratch, 'trees', 't1x')]) outs.push(await pairRun({ opts: { out } }));
    yes('an out folder inside the tree is refused with exit code 2 and the reason, and one beside it is taken', same(outs.map((r) => r.code), [2, 0]) && outs[0].kept[0] === `--out ${path.join(T1, 'x')} is inside the tree: what a drive writes there would change the tree's state`, J(outs.map((r) => [r.code, r.kept])));
    const twice = [await pairRun({ outDir: 'o15', opts: { scenario: 'a,a' } }), await pairRun({ outDir: 'o15', opts: { widths: '390x844,390x844' } }), await pairRun({ outDir: 'o15', opts: { scenario: `a,${path.join(T1, 'tools', 'drives', 'b.mjs')}` } })];
    yes('a scenario at a size asked for twice is refused with exit code 2, and two that differ are taken', same(twice.map((r) => r.code), [2, 2, 0]), J(twice.map((r) => [r.code, r.kept])));

    fs.mkdirSync(path.join(scratch, 'rows'), { recursive: true });
    const rowFile = path.join(scratch, 'rows', 'summary.tsv');
    fs.writeFileSync(rowFile, ['s\ta\th\t1x1\tok\t1\t0\t1', 's\tb\th\t1x1\tok\t1\t0\t1\tt\textra', 's\tc\th\t1x1\tokay\t1\t0\t1\tt', 's\tf\th\t1x1\tFAILED\t0\t1\t1\tt', 's\td\th\t1x1\tok\t1\t0\t1\tt\r', 's\te\th\t1x1\tFAIL\t0\t1\t1\tt', 's\te\th\t1x1\tok\t1\t0\t1\tt', ''].join('\n'));
    const read = readPairs(rowFile);
    yes('a summary line is read only with its nine fields and a status of ok or FAIL, a CR at its end dropped, and the last line of a pair wins', same([...read.keys()], ['s\td\th\t1x1', 's\te\th\t1x1']) && read.get('s\td\th\t1x1')[8] === 't' && read.get('s\te\th\t1x1')[4] === 'ok' && readPairs(path.join(scratch, 'rows', 'none.tsv')).size === 0, J([...read.entries()]));

    const exitDir = path.join(scratch, 'exit');
    const child2 = spawnSync(process.execPath, [SELF, 'selftest-part', 'pairs-exit', scratch], { encoding: 'utf8', timeout: 60000 });
    yes('a process that exits inside a drive stops the server on its way out', child2.status === 5 && fs.existsSync(path.join(exitDir, 'stopped')), `exit code ${child2.status}, ${fs.existsSync(path.join(exitDir, 'stopped')) ? 'stopped' : 'left running'} ${(child2.stderr || '').slice(0, 200)}`);
    delete globalThis.labsWtDrive;

    /* ---- the selftest's own limit ---- */
    const dog = (what) => spawnSync(process.execPath, [SELF, 'selftest-part', what], { encoding: 'utf8', timeout: 60000 }).status;
    const hung = dog('watchdog-clean'), hungFailed = dog('watchdog-failed');
    yes('a selftest that hangs with no failed check ends with the code mutate reads as timed out', hung === WATCHDOG_EXIT, `exit code ${hung}, WATCHDOG_EXIT ${WATCHDOG_EXIT}`);
    yes('a selftest that hangs after a failed check ends with exit code 1', hungFailed === 1, `exit code ${hungFailed}`);
  } finally { clean(); }
  done = true;
  if (!passed) { console.log('FAIL  labs-wt selftest: no check ran'); return 1; }
  console.log(`labs-wt selftest: ${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}

/* ---------- cli ---------- */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;
// each ends the process itself and says the code: a stand-in left waiting must not keep it open
if (isMain && process.argv[2] === 'selftest-part') process.exit(await selftestPart(process.argv[3], process.argv[4]));
if (isMain && process.argv[2] === 'selftest') process.exit(await selftest());
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
    case 'drive': {
      let a = null;
      try { a = driveArgs(rest); } catch (e) { die(e.message, 2); }
      if (isPairRun(a.opts)) process.exitCode = await cmdDrivePairs(a.name, a.opts);
      else await cmdDrive(a.name);
      break;
    }
    case 'gates': cmdGates(need()); break;
    case 'sync': cmdSync(need(), from || 'main'); break;
    case 'ship': await cmdShip(need()); break;
    case 'remove': cmdRemove(need()); break;
    default:
      console.log('commands: status | add <name...> [--base B] | serve <name> | stop <name|all> | shoot <name> [page] | drive <name> [--tree T --scenario a,b --widths WxH,... --out D --timeout s --budget s --min-free-gb n] | gates <name> | sync <name> [--from B] | ship <name> | remove <name> | ports | selftest');
      process.exitCode = cmd ? 2 : 0;
  }
}
