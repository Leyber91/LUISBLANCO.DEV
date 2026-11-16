#!/usr/bin/env node
/* ============================================================
   tools/drive.mjs — drive a page with a real pointer and keyboard
   in one headless Chrome, and say what happened.

   `labs-wt shoot` takes still pictures. A still cannot tell whether
   a drag lifts a thing, whether a key does anything, or whether a
   reload keeps what was done. A drive is a script of gestures and
   checks, run against the served page through Chrome's debugging
   port: real mouse and key events, the page's own DOM read back,
   screenshots at the moments that matter, and every console error.

   Usage (Node 22 or later, Windows-first, no dependencies):
     node tools/drive.mjs <scenario.mjs> --base http://127.0.0.1:8804 [--out <dir>] [--width 1440] [--height 900] [--timeout 180] [--port 9333]
     node tools/labs-wt.mjs drive <lab>          serves the worktree, runs tools/drives/<lab>.mjs at two widths
     node tools/drive.mjs tools/drives/pages.mjs --base <url> --timeout 420     every lab page loads with a clean console

   A scenario is a module whose default export is
     async function (page, ctx) { ... }
   with ctx = { base, width, height } and page =
     go(url)                 navigate, wait for the document to finish loading
     before(source)          run a script in every document opened from now on, before the page's own scripts
                             (a guard on what the page may fetch belongs here: nothing of the page runs sooner)
     ev(expression)          evaluate in the page, return the value (promises are awaited)
     until(expression, ms)   wait until the expression is truthy; false on timeout
     sleep(ms)
     move(x, y) · down(x, y) · up(x, y) · drag(x0, y0, x1, y1, { steps, hold }) · click(x, y) · wheel(x, y, dy)
     swipe(x0, y0, x1, y1, { steps, hold })   one finger, as a phone sends it: the browser applies the
                             page's touch-action, so a swipe the page gives to scrolling scrolls
     key(key, { code, text })
     shot(name)              a PNG of the viewport in the out folder
     errors()                every console error and exception so far (a copy), to tell which page logged what
     check(name, cond, detail)   one line of the report; a false cond fails the drive
     media(features)         emulate media features, e.g. [{ name: 'prefers-reduced-motion', value: 'reduce' }]
     invariant(name, expression)   a rule that must hold after every step: the expression is evaluated in the
                             page and returns a list of what breaks it (an empty list when it holds). A step is
                             every gesture (go, click, drag, swipe, key, up) and every wait of 100 ms or more,
                             since a scenario waits after each change it makes through ev. Each distinct break
                             is one failed check, named with the step it followed; at the end one line says how
                             many steps each rule held for, or fails when there was no step. A rule that
                             returns anything but a list, or throws, is a break. tools/invariants.mjs has
                             the shared rules.
     step(label)             run the invariants now, after a change the scenario names
   Coordinates are CSS pixels of the viewport.

   Machine safety: one Chrome at a time on the machine, its own
   throwaway profile, killed on a timeout (180 s by default) whatever
   the scenario does. A drive waits for the lock file
   labs-drive-chrome.lock in the system's temp folder before it
   starts Chrome (20 minutes at most, LABS_DRIVE_WAIT_MS), takes it
   from a process that no longer runs, and gives it back at the end;
   a call to Chrome that is cut off when Chrome dies fails at once.

     node tools/drive.mjs selftest   the runner of the invariants and the lock, in one headless Chrome on port
                                     9362; tools/mutants/drive.json breaks each rule for tools/mutate.mjs

   Exit: 0 every check passed and the console is clean; 1 a check
   failed, the scenario threw or the page logged an error; 2 usage;
   3 timeout.
   ============================================================ */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHROME = process.env.LABS_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');   // equivalent: where Chrome is, per system; one machine runs one branch
const LOCK = path.join(os.tmpdir(), 'labs-drive-chrome.lock');
/* Every Chrome this process started and has not yet stopped: killed when the process exits, whatever ends it early. */
const LIVE = new Set();
process.on('exit', () => { for (const c of LIVE) c.kill(); });

/* One Chrome at a time on this machine: wait for the lock file, take it from a holder that no longer runs (or from
   one that died before it wrote its name), and return the function that gives it back; null when waitMs runs out. */
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };   // equivalent: EPERM, a process of another user, cannot be made here; it runs, so the lock is its
export async function holdChrome(waitMs = 20 * 60 * 1000, file = LOCK) {
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, t: Date.now() }));
      fs.closeSync(fd);
      return () => { try { if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.rmSync(file, { force: true }); } catch { /* already gone */ } };
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let holder = null, age = 0;
    try { age = Date.now() - fs.statSync(file).mtimeMs; holder = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* being written, or gone */ }
    if ((holder && !alive(holder.pid)) || (!holder && age > 10000)) { try { fs.rmSync(file, { force: true }); } catch { /* another took it first */ } continue; }
    if (Date.now() - t0 >= waitMs) return null;
    await sleep(250);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* The dev server has no favicon; that 404 is the server's, not the page's. */
const NOISE = /favicon\.ico/;

/**
 * Run one scenario. opts: base, out, width, height, timeoutMs, port, say (a line printer).
 * Returns { checks: [{ name, ok, detail }], errors: [string], timedOut }.
 */
export async function drive(scenario, opts = {}) {
  const { base, out = path.join(os.tmpdir(), 'lab-drive'), width = 1440, height = 900, timeoutMs = 180000, port = 9333, say = console.log,
    waitMs = Number(process.env.LABS_DRIVE_WAIT_MS) || 20 * 60 * 1000, lock = LOCK } = opts;
  const release = await holdChrome(waitMs, lock);
  if (!release) {
    const name = `Chrome was free within ${Math.round(waitMs / 1000)} s (another drive holds ${lock})`;
    say(`FAIL ${name}`);
    return { checks: [{ name, ok: false, detail: '' }], errors: [], timedOut: false };
  }
  try { return await driveHeld(scenario, { base, out, width, height, timeoutMs, port, say }); } finally { release(); }
}

async function driveHeld(scenario, { base, out, width, height, timeoutMs, port, say }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-drive-'));
  fs.mkdirSync(out, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--no-first-run', '--disable-gpu', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  LIVE.add(chrome); chrome.on('exit', () => LIVE.delete(chrome));   // equivalent: a Linux runner has no sandbox for Chrome; one machine runs one branch
  const checks = [], errors = [];
  const invariants = [];   // { name, expression, steps, seen }
  let timedOut = false, ws = null;
  const killer = setTimeout(() => { timedOut = true; chrome.kill(); }, timeoutMs);
  const check = (name, cond, detail = '') => { checks.push({ name, ok: !!cond, detail: String(detail) }); say(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
  try {
    let url = null;
    for (let i = 0; i < 60 && !url && !timedOut; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); url = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl || null; } catch { /* not up yet */ }
      if (!url) await sleep(250);
    }
    if (!url) throw new Error('Chrome did not open its debugging port');
    ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('could not connect to Chrome')); });
    let id = 0;
    const pending = new Map();   // id -> [resolve, reject]
    ws.onclose = () => { for (const [, [, rej]] of pending) rej(new Error('Chrome is gone')); pending.clear(); };   // a call cut off fails at once
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)[0](d.result || d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !NOISE.test(d.params.entry.url || '')) errors.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      if (timedOut || ws.readyState !== 1) return rej(new Error('Chrome is gone'));
      const i = ++id; pending.set(i, [res, rej]); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text) + ' in: ' + expression.slice(0, 120));
      return r.result.value;
    };
    const until = async (expression, ms = 12000) => { for (let t = 0; t < ms; t += 150) { if (await ev(expression).catch(() => false)) return true; await sleep(150); } return false; };
    let touchOn = false, lastEv = '';
    const evAndNote = async (expression) => { lastEv = expression; return ev(expression); };
    /* after a step: every invariant, each distinct break reported once, eight at most for a rule */
    const step = async (label) => {
      if (!invariants.length) return;   // equivalent: with no rule there is nothing to run, and the frame it would wait for changes nothing
      await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))').catch(() => false);   // the frame the change asked for is drawn
      for (const inv of invariants) {
        let bad;
        try { bad = await ev(inv.expression); } catch (e) { bad = [`the rule could not be read: ${String(e.message).slice(0, 160)}`]; }
        inv.steps++;
        // fails closed: a rule that returns anything but a list is a break, named, never a pass
        if (!Array.isArray(bad)) bad = [`the rule returned ${bad === null ? 'null' : typeof bad} instead of a list of breaks`];
        for (const b of bad) {
          const k = String(b);
          if (inv.seen.has(k)) continue;
          inv.seen.add(k);
          if (inv.seen.size <= 8) check(`${inv.name}, after ${label}`, false, k);
        }
      }
    };
    const afterEv = () => (lastEv ? `ev ${lastEv.replace(/\s+/g, ' ').slice(0, 90)}` : 'a wait');
    const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
    const page = {
      ev: evAndNote, until, check,
      async sleep(ms) { await sleep(ms); if (ms >= 100) await step(afterEv()); },
      errors: () => errors.slice(),
      invariant(name, expression) { invariants.push({ name, expression, steps: 0, seen: new Set() }); },
      step: (label) => step(label),
      async media(features) { await send('Emulation.setEmulatedMedia', { features }); },
      async before(source) { await send('Page.addScriptToEvaluateOnNewDocument', { source }); },
      async go(u) { await send('Page.navigate', { url: u }); if (!(await until('document.readyState === "complete"'))) throw new Error('the page did not finish loading: ' + u.slice(0, 120)); await step(`go ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)}`); },
      move: (x, y) => mouse('mouseMoved', x, y, 0),
      down: (x, y) => mouse('mousePressed', x, y, 1),
      async up(x, y) { await mouse('mouseReleased', x, y, 0); await step(`a release at ${Math.round(x)},${Math.round(y)}`); },
      async swipe(x0, y0, x1, y1, { steps = 14, hold = 0 } = {}) {
        if (!touchOn) { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); touchOn = true; }
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
        for (let i = 1; i <= steps; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] }); await sleep(16); }
        if (hold) await sleep(hold);
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await step(`a swipe from ${Math.round(x0)},${Math.round(y0)}`);
      },
      async drag(x0, y0, x1, y1, { steps = 14, hold = 0 } = {}) {
        await mouse('mouseMoved', x0, y0, 0);
        await mouse('mousePressed', x0, y0, 1);
        for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, 1); await sleep(16); }
        if (hold) await sleep(hold);
        await mouse('mouseReleased', x1, y1, 0);
        await step(`a drag from ${Math.round(x0)},${Math.round(y0)}`);
      },
      async wheel(x, y, dy) { await mouse('mouseMoved', x, y, 0); await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(120); await step(`a wheel of ${dy} at ${Math.round(x)},${Math.round(y)}`); },
      async click(x, y) { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); await step(`a click at ${Math.round(x)},${Math.round(y)}`); },
      async key(key, { code = key.length === 1 ? 'Key' + key.toUpperCase() : key, text = key.length === 1 ? key : key === 'Enter' ? '\r' : undefined } = {}) {
        const vk = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key];
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...(text ? { text } : {}), ...(vk ? { windowsVirtualKeyCode: vk } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, ...(vk ? { windowsVirtualKeyCode: vk } : {}) });
        await step(`the key ${key}`);
      },
      async shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; },
    };
    await scenario(page, { base, width, height });
    for (const inv of invariants) check(`${inv.name}: held after each of ${inv.steps} steps`, inv.seen.size === 0 && inv.steps > 0, inv.seen.size ? `${inv.seen.size} distinct breaks` : '');
    check('the console is clean', errors.length === 0, errors.slice(0, 4).join(' | ').slice(0, 400));
  } catch (e) {
    check(timedOut ? `finished inside ${timeoutMs / 1000} s` : 'the scenario ran to its end', false, String((e && e.message) || e).slice(0, 400));
  } finally {
    clearTimeout(killer);
    try { ws?.close(); } catch { /* already closed */ }
    chrome.kill();
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; the folder is in the temp directory */ }
  }
  return { checks, errors, timedOut };
}

/* ---------------- selftest: the runner of the invariants, the lock, a Chrome that dies ---------------- */
async function selftest() {
  // a selftest that hangs (a broken copy under tools/mutate.mjs) ends here, its Chrome killed and the lock left to be taken
  setTimeout(() => { console.log('FAIL  drive selftest: not finished in 90 s'); process.exit(1); }, 90000).unref();
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const J = JSON.stringify;
  const PAGE = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body style="margin:0"><button id="b" style="position:absolute;left:10px;top:10px;width:100px;height:50px">b</button></body></html>');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-self-'));
  try {
    /* the lock, on a lock file of its own */
    const lockFile = path.join(scratch, 'chrome.lock');
    const rel = await holdChrome(1000, lockFile);
    const mine = fs.existsSync(lockFile) && JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid;
    rel();
    yes('a free lock is taken with this process\'s name, and given back', typeof rel === 'function' && mine && !fs.existsSync(lockFile));
    fs.writeFileSync(lockFile, J({ pid: 999999999, t: Date.now() }));
    const rel2 = await holdChrome(1000, lockFile);
    yes('a lock whose holder no longer runs is taken', typeof rel2 === 'function' && JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid === process.pid);
    fs.writeFileSync(lockFile, J({ pid: process.ppid, t: Date.now() }));
    rel2();
    yes('giving the lock back leaves a lock another process now holds', fs.existsSync(lockFile));
    let t0 = Date.now();
    const rel3 = await holdChrome(600, lockFile);
    yes('a lock a running process holds is waited for, and the wait gives up at its limit', rel3 === null && Date.now() - t0 >= 550, `${Date.now() - t0} ms`);
    fs.writeFileSync(lockFile, '');
    const nine = (Date.now() - 9000) / 1000;
    fs.utimesSync(lockFile, nine, nine);
    const rel4 = await holdChrome(600, lockFile);
    yes('an empty lock 9 s old is waited for (its holder may still be writing it)', rel4 === null);
    let threw = '';
    try { await holdChrome(300, path.join(scratch, 'no such folder', 'chrome.lock')); } catch (e) { threw = e.code; }
    yes('a lock that cannot be written is an error, not a wait', threw === 'ENOENT', threw);
    const old = (Date.now() - 11000) / 1000;
    fs.utimesSync(lockFile, old, old);
    const rel5 = await holdChrome(1000, lockFile);
    yes('an empty lock over 10 s old is taken (its holder died before it wrote its name)', typeof rel5 === 'function');
    rel5 && rel5();
    fs.writeFileSync(lockFile, J({ pid: process.ppid, t: Date.now() }));
    let ran = false;
    t0 = Date.now();
    const blocked = await drive(async () => { ran = true; }, { lock: lockFile, waitMs: 400, port: 9362, say: () => {} });
    yes('a drive that cannot have Chrome says so, and starts nothing', !ran && blocked.checks.length === 1 && !blocked.checks[0].ok && /^Chrome was free within/.test(blocked.checks[0].name), J(blocked.checks));
    process.env.LABS_DRIVE_WAIT_MS = '300';
    t0 = Date.now();
    const blocked2 = await drive(async () => { ran = true; }, { lock: lockFile, port: 9362, say: () => {} });
    delete process.env.LABS_DRIVE_WAIT_MS;
    yes('the wait for Chrome is LABS_DRIVE_WAIT_MS when it is set', !ran && !blocked2.checks[0].ok && Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
    fs.rmSync(lockFile, { force: true });

    /* the runner of the invariants */
    const counts = {};
    const r = await drive(async (p) => {
      p.invariant('counts its runs', '(window.__runs = (window.__runs || 0) + 1, [])');
      p.invariant('returns null', 'null');
      p.invariant('returns a string', '"broken"');
      p.invariant('throws', '(() => { throw new Error("thrown on purpose"); })()');
      p.invariant('repeats a break', '["a", "a", "b"]');
      p.invariant('breaks ten ways', 'Array.from({ length: 10 }, (_, i) => "break " + i)');
      const n = () => p.ev('window.__runs || 0');
      await p.go(PAGE); counts.go = await n();
      await p.sleep(99); counts.sleep99 = await n();
      await p.sleep(100); counts.sleep100 = await n();
      await p.click(50, 30); counts.click = await n();
      await p.key('a'); counts.key = await n();
      await p.drag(20, 20, 40, 40, { steps: 2 }); counts.drag = await n();
      await p.down(5, 5); counts.down = await n();
      await p.up(5, 5); counts.up = await n();
      await p.move(6, 6); counts.move = await n();
      await p.swipe(30, 30, 30, 60, { steps: 2 }); counts.swipe = await n();
      await p.wheel(30, 30, 10); counts.wheel = await n();
      await p.step('a step the scenario names'); counts.step = await n();
    }, { width: 390, height: 600, port: 9362, timeoutMs: 60000, say: () => {} });
    const of = (rule) => r.checks.filter((c) => c.name.startsWith(rule + ', after '));
    const end = (rule) => r.checks.find((c) => c.name.startsWith(rule + ': held after each of '));
    yes('the rules run after go, a wait of 100 ms, a click, a key, a drag, a release, a swipe, a wheel and a named step; not after a wait of 99 ms, a press or a move',
      J(counts) === J({ go: 1, sleep99: 1, sleep100: 2, click: 3, key: 4, drag: 5, down: 5, up: 6, move: 6, swipe: 7, wheel: 8, step: 9 }), J(counts));
    yes('a rule that holds after every step ends on one passing line that counts the steps', !!end('counts its runs') && end('counts its runs').ok && /each of 9 steps/.test(end('counts its runs').name) && !of('counts its runs').length);
    yes('fails closed: a rule that returns null is a break that says so, once', of('returns null').length === 1 && /returned null instead of a list/.test(of('returns null')[0].detail) && /after go /.test(of('returns null')[0].name) && !end('returns null').ok, J(of('returns null')));
    yes('fails closed: a rule that returns a string is a break that says so', of('returns a string').length === 1 && /returned string instead of a list/.test(of('returns a string')[0].detail));
    yes('a rule that throws is a break with its error', of('throws').length === 1 && /the rule could not be read: .*thrown on purpose/.test(of('throws')[0].detail) && !end('throws').ok);
    yes('each distinct break is one failed check, however often it comes back', of('repeats a break').length === 2 && J(of('repeats a break').map((c) => c.detail)) === J(['a', 'b']) && /2 distinct breaks/.test(end('repeats a break').detail));
    yes('eight breaks of one rule are listed at most, and the end line counts them all', of('breaks ten ways').length === 8 && /10 distinct breaks/.test(end('breaks ten ways').detail) && !end('breaks ten ways').ok);
    const none = await drive(async (p) => { p.invariant('never run', '[]'); await p.ev('1'); }, { width: 390, height: 600, port: 9362, timeoutMs: 60000, say: () => {} });
    const nr = none.checks.find((c) => c.name.startsWith('never run: held after each of 0 steps'));
    yes('a rule that never ran fails: no step is no proof', !!nr && !nr.ok, J(none.checks));

    /* what the page says: an exception, an error and a warning on its console, a resource that fails; not a note,
       not the favicon */
    const noisy = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body><img src="http://127.0.0.1:9/favicon.ico"><img src="http://127.0.0.1:9/missing.png"><script>console.error("an error"); console.warn("a warning"); console.log("a note"); setTimeout(() => { throw new Error("thrown late"); }, 0);</script></body></html>');
    const loud = await drive(async (p) => { await p.go(noisy); await p.ev('new Promise((r) => setTimeout(() => r(true), 1500))'); }, { width: 390, height: 600, port: 9362, timeoutMs: 60000, say: () => {} });
    const E = loud.errors;
    yes('the console is read: an exception, an error, a warning and a failed resource; a note and the favicon are not', E.some((x) => /^exception: .*thrown late/.test(x)) && E.includes('error: an error') && E.includes('warning: a warning') && E.some((x) => /^log: .*missing\.png/.test(x)) && !E.some((x) => /^log: .*favicon/.test(x) || /^\w+: a note/.test(x)), J(E));
    yes('and the drive fails on it', loud.checks.some((c) => c.name === 'the console is clean' && !c.ok) && none.checks.some((c) => c.name === 'the console is clean' && c.ok));

    /* a Chrome that dies under a call */
    t0 = Date.now();
    const dead = await drive(async (p) => { await p.go(PAGE); await p.ev('new Promise(() => {})'); }, { width: 390, height: 600, port: 9362, timeoutMs: 6000, say: () => {} });
    const took = Date.now() - t0;
    yes('a call that never answers ends with the timeout: Chrome is killed, the call fails at once and the drive returns', dead.timedOut && took < 20000 && dead.checks.some((c) => !c.ok && /^finished inside 6 s/.test(c.name)), `${took} ms ${J(dead.checks).slice(0, 200)}`);
    yes('the machine lock is given back after each drive', !fs.existsSync(LOCK) || JSON.parse(fs.readFileSync(LOCK, 'utf8') || '{}').pid !== process.pid);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  console.log(`drive selftest: ${passed} passed, ${failed} failed`);
  return failed ? 1 : 0;
}

/* ---------------- command line ---------------- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv[2] === 'selftest') process.exit(await selftest());
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (name, fb) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fb; };
  const file = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
  const base = flag('base', null);
  if (!file || !base) { console.error('usage: node tools/drive.mjs <scenario.mjs> --base <url> [--out <dir>] [--width 1440] [--height 900] [--timeout 180]'); process.exit(2); }
  if (!fs.existsSync(file)) { console.error(`no scenario at ${file}`); process.exit(2); }
  const scenario = (await import(pathToFileURL(path.resolve(file)).href)).default;
  if (typeof scenario !== 'function') { console.error(`${file} has no default export to run`); process.exit(2); }
  const r = await drive(scenario, { base, out: flag('out', undefined), width: Number(flag('width', 1440)), height: Number(flag('height', 900)), timeoutMs: 1000 * Number(flag('timeout', 180)), port: Number(flag('port', 9333)) });
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`drive: ${r.checks.length - bad} of ${r.checks.length} checks passed; console errors: ${r.errors.length}`);
  process.exit(r.timedOut ? 3 : bad ? 1 : 0);
}
