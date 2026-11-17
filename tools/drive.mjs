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
     node tools/drive.mjs <scenario.mjs> --base http://127.0.0.1:8804 [--out <dir>] [--width 1440] [--height 900] [--timeout 180]
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
     frames(except)          a rule on the pixels: after every step a frame is captured, and no pixel of it is fully
                             transparent. except: { '<selector>': '<reason>' }, the elements whose box may hold
                             such pixels, each with its reason. Every shot() is held to the same rule, with the
                             same exceptions, whether frames() was called or not. A frame that does not come back
                             within 6 tries of frameMs (5 s) is a break too, and the shot throws.
     background(rgba)        the colour Chrome paints under the page ({ r, g, b, a }), for a fixture
     crash()                 end the page's renderer, for a selftest of what a drive does after it
   Coordinates are CSS pixels of the viewport.

   Machine safety: one Chrome at a time on the machine, its own
   throwaway profile, killed on a timeout (180 s by default) whatever
   the scenario does. A drive waits for the lock file
   labs-drive-chrome.lock in the system's temp folder (or the path in
   LABS_DRIVE_LOCK; tools/mutate.mjs gives each copy it tests one of
   its own, and holds the machine's around each copy itself) before
   it starts Chrome (20 minutes at most, LABS_DRIVE_WAIT_MS),
   takes it from a process that no longer runs, and gives it back at
   the end. Chrome picks its own debugging port, read back from its
   profile, so a drive talks to no other Chrome (--port is accepted
   and not used). A call to Chrome that is cut off when Chrome dies
   fails at once. The Chromes a process started are killed when it
   exits, on SIGTERM and on SIGINT. Profiles over a day old are
   cleared. A process killed outright runs no handler: on Windows its
   Chrome ends with it all the same (Node puts the children it did
   not detach in a job that closes with it; on 2026-11-17 a drive
   killed so took its 12 Chrome processes with it within 3 s);
   elsewhere (SIGKILL) its Chrome is left running, with no lock held
   for it, a declared limit.
   Two notes. LABS_DRIVE_LOCK set in a shell makes that file the
   machine's lock for every drive and for tools/mutate.mjs started
   from that shell: one Chrome at a time then holds only among the
   processes that share the variable. The selftest's decoy answers
   /json on port 9333, the port drives used before Chrome chose its
   own: while it runs, a drive of an older copy of this file (main's
   until this lands, or a branch made before), which takes that port
   and no lock, connects to the decoy and fails; and when 9333 is
   taken, the decoy check fails.

     node tools/drive.mjs selftest   the runner of the invariants, the frame rule and the lock, in headless
                                     Chrome; tools/mutants/drive.json breaks each rule for tools/mutate.mjs.
                                     Stopped by its own limit it exits 124, which tools/mutate.mjs reads as
                                     timed out, not as caught.

   Exit: 0 every check passed and the console is clean; 1 a check
   failed, the scenario threw or the page logged an error; 2 usage;
   3 timeout.
   ============================================================ */

import { spawn } from 'node:child_process';
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHROME = process.env.LABS_CHROME || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');   // equivalent: where Chrome is, per system; one machine runs one branch
const lockPath = () => process.env.LABS_DRIVE_LOCK || path.join(os.tmpdir(), 'labs-drive-chrome.lock');
/* Every Chrome this process started and has not yet stopped: killed when the process exits, whatever ends it early,
   and on SIGTERM and SIGINT, after which Node would otherwise end without its exit handlers. */
const LIVE = new Set();
process.on('exit', () => { for (const c of LIVE) c.kill(); });
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130]]) process.on(sig, () => process.exit(code));
export const liveChromes = () => [...LIVE];
/* A selftest stopped by its own limit exits with this code; tools/mutate.mjs reads it as timed out, not as caught. */
export const WATCHDOG_EXIT = 124;
/* Profiles left by a drive that did not end (a process stopped from outside) are cleared once a day old. */
export function sweepProfiles(dir = os.tmpdir(), now = Date.now()) {
  const gone = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('lab-drive-')) continue;
    const at = path.join(dir, f);
    try { if (now - fs.statSync(at).mtimeMs > 24 * 3600 * 1000) { fs.rmSync(at, { recursive: true, force: true }); gone.push(f); } } catch { /* another took it */ }
  }
  return gone;
}

/* The pixels of a captured frame with no alpha at all, outside the boxes given ({ x0, y0, x1, y1 } in pixels): how
   many, and the box that holds them. A frame is a PNG of 8 bits a channel, RGB (no alpha, so none) or RGBA.
   Why: on 2026-11-16 every 390 px render of the survey showed a white box over the sharing question, a hole of fully
   transparent pixels where an opaque fixed plate sat over the opaque WebGL canvas in software-composited headless
   Chrome; the rules read the DOM and passed it. */
const CAPTURE_TRIES = 6;   // how many tries a frame has before the rule fails (each try's limit is drive's frameMs)

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export function transparentIn(png, skip = []) {
  // it refuses what it cannot read rather than guess: a refused frame fails the drive
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');
  let o = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, trns = false;
  const parts = [];
  while (o < png.length) {
    if (o + 12 > png.length) throw new Error('a PNG cut short');
    const n = png.readUInt32BE(o), t = png.toString('latin1', o + 4, o + 8);
    if (o + 12 + n > png.length) throw new Error('a PNG cut short');
    const d = png.subarray(o + 8, o + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12]; }
    if (t === 'IDAT') parts.push(d);
    if (t === 'tRNS') trns = true;
    o += 12 + n;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error(`a frame of colour type ${type} at ${depth} bits, which this reader does not read`);
  if (interlace !== 0) throw new Error('an interlaced frame, which this reader does not read');
  if (trns) throw new Error('a frame with a tRNS chunk (a colour made transparent), which this reader does not read');
  const out = { width: w, height: h, count: 0, box: null };
  if (type === 2) return out;   // no alpha channel: no pixel can be transparent
  const stride = w * 4, raw = zlib.inflateSync(Buffer.concat(parts));
  if (raw.length < h * (stride + 1)) throw new Error(`pixel data for ${Math.floor(raw.length / (stride + 1))} of ${h} lines`);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    if (f > 4) throw new Error(`a line filtered by ${f}, which PNG does not define`);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[x] = (line[x] + pred) & 255;
    }
    for (let x = 0; x < w; x++) {
      if (line[x * 4 + 3] !== 0 || skip.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) continue;
      out.count++;
      out.box = out.box ? { x0: Math.min(out.box.x0, x), y0: Math.min(out.box.y0, y), x1: Math.max(out.box.x1, x + 1), y1: Math.max(out.box.y1, y + 1) } : { x0: x, y0: y, x1: x + 1, y1: y + 1 };
    }
    prev = line;
  }
  return out;
}

/* One Chrome at a time on this machine: wait for the lock file, take it from a holder that no longer runs (or from
   one that died before it wrote its name), and return the function that gives it back; null when waitMs runs out.
   A process that holds it already holds it again at once, and that inner hold gives nothing back: a selftest holds
   the lock for its whole run, so that selftests run one after another rather than drive by drive in turn.
   A stale lock is removed only under a second lock (<file>.takeover), and only if it still reads as it did: two
   processes that saw the same stale holder could otherwise each remove it, the second removing the first's new lock. */
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };   // equivalent: EPERM, a process of another user, cannot be made here; it runs, so the lock is its
export function takeStale(file, seen) {
  const t = file + '.takeover';
  try { fs.closeSync(fs.openSync(t, 'wx')); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    try { if (Date.now() - fs.statSync(t).mtimeMs > 10000) fs.rmSync(t, { force: true }); } catch { /* gone */ }   // a takeover whose owner died
    return false;
  }
  try { if (fs.readFileSync(file, 'utf8') === seen) { fs.rmSync(file, { force: true }); return true; } return false; }
  catch { return false; }   // gone already
  finally { fs.rmSync(t, { force: true }); }
}
export async function holdChrome(waitMs = 20 * 60 * 1000, file = lockPath()) {
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, t: Date.now() }));
      fs.closeSync(fd);
      return () => { try { if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.rmSync(file, { force: true }); } catch { /* already gone */ } };
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let holder = null, age = 0, raw = null;
    try { age = Date.now() - fs.statSync(file).mtimeMs; raw = fs.readFileSync(file, 'utf8'); holder = JSON.parse(raw); } catch { /* being written, or gone */ }
    if (holder && holder.pid === process.pid) return () => {};
    if (((holder && !alive(holder.pid)) || (!holder && age > 10000)) && takeStale(file, raw)) continue;   // unread (null), it is never the file's text
    if (Date.now() - t0 >= waitMs) return null;
    await sleep(250);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* The dev server has no favicon; that 404 is the server's, not the page's. */
const NOISE = /favicon\.ico/;

/**
 * Run one scenario. opts: base, out, width, height, timeoutMs, say (a line printer), frameMs (each try at a frame),
 * waitMs and lock (the lock file). Returns { checks: [{ name, ok, detail }], errors: [string], timedOut, profile }.
 */
export async function drive(scenario, opts = {}) {
  const { base, out = path.join(os.tmpdir(), 'lab-drive'), width = 1440, height = 900, timeoutMs = 180000, say = console.log,
    waitMs = Number(process.env.LABS_DRIVE_WAIT_MS) || 20 * 60 * 1000, lock = lockPath(), frameMs = 5000 } = opts;
  const release = await holdChrome(waitMs, lock);
  if (!release) {
    const name = `Chrome was free within ${Math.round(waitMs / 1000)} s (another drive holds ${lock})`;
    say(`FAIL ${name}`);
    return { checks: [{ name, ok: false, detail: '' }], errors: [], timedOut: false };
  }
  try { sweepProfiles(); return await driveHeld(scenario, { base, out, width, height, timeoutMs, say, frameMs }); } finally { release(); }
}

async function driveHeld(scenario, { base, out, width, height, timeoutMs, say, frameMs }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-drive-'));
  fs.mkdirSync(out, { recursive: true });
  // port 0: Chrome takes a free port and writes it to DevToolsActivePort in this profile, which no other Chrome uses
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--no-first-run', '--disable-gpu', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });   // equivalent: a Linux runner has no sandbox for Chrome; one machine runs one system
  let exited = false;
  LIVE.add(chrome); chrome.on('exit', () => { exited = true; LIVE.delete(chrome); });
  const checks = [], errors = [];
  const invariants = [];   // { name, expression, steps, seen }
  const frames = { on: false, except: {}, steps: 0, lost: 0, seen: new Set() };   // the rule on the pixels of a captured frame
  let timedOut = false, ws = null, tries = 0;
  const killer = setTimeout(() => { timedOut = true; chrome.kill(); }, timeoutMs);
  const check = (name, cond, detail = '') => { checks.push({ name, ok: !!cond, detail: String(detail) }); say(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
  try {
    let url = null;
    for (let i = 0; i < 60 && !url && !timedOut; i++) {
      try {
        const port = parseInt(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10);
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); url = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl || null;
      } catch { /* not up yet */ }
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
      if (d.id && pending.has(d.id)) { const [res, rej] = pending.get(d.id); pending.delete(d.id); if (d.error) rej(new Error(`${d.error.message} (${d.error.code})`)); else res(d.result); }   // a refused call fails with Chrome's words
      else if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !NOISE.test(d.params.entry.url || '')) errors.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      if (timedOut || ws.readyState !== 1) return rej(new Error('Chrome is gone'));   // equivalent: timedOut only answers sooner, as the timeout kills Chrome and its socket then closes
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
    /* the pixels of a frame: no fully transparent one outside the boxes of the elements excepted, each break once.
       No frame at all is a break too: the rule fails closed. */
    const frameCheck = async (label, png) => {
      if (!png) { frames.steps++; frames.lost++; check(`frame: a frame came back, after ${label}`, false, `none within ${tries} tries of ${frameMs / 1000} s`); return; }
      const skip = await ev(`(() => { const out = []; for (const s of ${JSON.stringify(Object.keys(frames.except))}) for (const e of document.querySelectorAll(s)) { const r = e.getBoundingClientRect(); out.push({ x0: Math.floor(r.left), y0: Math.floor(r.top), x1: Math.ceil(r.right), y1: Math.ceil(r.bottom) }); } return out; })()`).catch(() => []);   // a page gone by then excepts nothing
      const t = transparentIn(png, skip);
      frames.steps++;
      if (!t.count) return;
      const k = `${t.count} fully transparent pixels, in ${t.box.x1 - t.box.x0} x ${t.box.y1 - t.box.y0} px at ${t.box.x0},${t.box.y0}`;
      if (frames.seen.has(k)) return;
      frames.seen.add(k);
      if (frames.seen.size <= 8) check(`frame: no fully transparent pixel, after ${label}`, false, k);
    };
    /* a frame, or null. On 2026-11-16 a capture asked while the page moved to another document failed at once ("Not
       attached to an active page"), and the second load of the survey in one tab gave no frame for about 20 s, in
       headless Chrome drawing WebGL in software; with no limit the sky's drive waited out its whole time. So each try
       has its own limit, and a failed try is tried again. */
    const capture = async () => {
      for (let i = 0; i < CAPTURE_TRIES; i++) {
        tries = i + 1;
        let timer;
        const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }).catch(() => null), new Promise((res) => { timer = setTimeout(res, frameMs, null); })]);
        clearTimeout(timer);
        if (r && r.data) return Buffer.from(r.data, 'base64');
        await sleep(200);
      }
      return null;
    };
    /* after a step: the frame, then every invariant, each distinct break reported once, eight at most for a rule */
    const step = async (label) => {
      if (frames.on) await frameCheck(label, await capture());
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
      frames(except = {}) {
        for (const [sel, why] of Object.entries(except)) if (!(typeof why === 'string' && why.trim().length >= 8)) throw new Error(`frames: the exception ${sel} needs its reason`);
        frames.on = true; frames.except = except;
      },
      async background(color) { await send('Emulation.setDefaultBackgroundColorOverride', { color }); },
      async crash() { await Promise.race([send('Page.crash').catch(() => null), sleep(800)]); },
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
      async shot(name) {
        const png = await capture(), f = path.join(out, name + '.png');
        await frameCheck(`the shot ${name}`, png);
        if (!png) throw new Error(`the shot ${name}: no frame came back`);
        fs.writeFileSync(f, png); return f;
      },
    };
    await scenario(page, { base, width, height });
    for (const inv of invariants) check(`${inv.name}: held after each of ${inv.steps} steps`, inv.seen.size === 0 && inv.steps > 0, inv.seen.size ? `${inv.seen.size} distinct breaks` : '');
    if (frames.on || frames.steps) check(`frame: no fully transparent pixel in each of ${frames.steps} frames`, frames.seen.size === 0 && frames.lost === 0 && frames.steps > 0, frames.seen.size ? `${frames.seen.size} distinct breaks` : frames.lost ? `${frames.lost} frames did not come back` : '');
    check('the console is clean', errors.length === 0, errors.slice(0, 4).join(' | ').slice(0, 400));
  } catch (e) {
    check(timedOut ? `finished inside ${timeoutMs / 1000} s` : 'the scenario ran to its end', false, String((e && e.message) || e).slice(0, 400));
  } finally {
    clearTimeout(killer);
    try { ws?.close(); } catch { /* already closed */ }
    const ended = exited ? Promise.resolve() : new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([ended, sleep(5000)]);
    // Chrome's helpers may hold a file of the profile a moment after it ends: tried again for two seconds
    for (let i = 0; i < 10 && fs.existsSync(profile); i++) { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { await sleep(200); } }   // equivalent: how many tries is time; a profile let go of at once goes on the first
  }
  return { checks, errors, timedOut, profile };
}

/* ---------------- selftest: the runner of the invariants, the lock, a Chrome that dies ---------------- */
async function selftest() {
  /* the lock is the file LABS_DRIVE_LOCK names, checked before anything waits for a lock: under tools/mutate.mjs a copy
     that took the machine's lock instead would wait for mutate, which holds that lock around the copy */
  const envBefore = process.env.LABS_DRIVE_LOCK, envLock = path.join(os.tmpdir(), `drive-self-env-${process.pid}.lock`);
  process.env.LABS_DRIVE_LOCK = envLock;
  const relEnv = await holdChrome(500);
  const envTaken = fs.existsSync(envLock);
  if (relEnv) relEnv();
  if (envBefore === undefined) delete process.env.LABS_DRIVE_LOCK; else process.env.LABS_DRIVE_LOCK = envBefore;
  const envOk = envTaken && !fs.existsSync(envLock);
  if (!envOk) { console.log('FAIL  drive selftest: the lock is not the file LABS_DRIVE_LOCK names'); return 1; }
  /* the whole run holds the machine's lock, and its time starts once it has it: under tools/mutate.mjs, copies run a few
     at a time and would otherwise take Chrome in turn, drive by drive, each outrunning its time */
  const whole = await holdChrome();
  if (!whole) { console.log('FAIL  drive selftest: Chrome was not free within 20 minutes'); return 1; }
  /* a selftest that hangs (a broken copy under tools/mutate.mjs) ends here, its Chrome killed and the lock left to be
     taken, with the code tools/mutate.mjs reads as timed out. 120 s for a run of 30 to 50 (it reached 60 once on
     2026-11-16 with 2 GB of memory free), inside mutate's 180 s; mutate runs this list's copies one at a time */
  setTimeout(() => { console.log('FAIL  drive selftest: not finished in 120 s'); process.exit(failed ? 1 : WATCHDOG_EXIT); }, 120000).unref();   // a check that failed before the hang has caught it
  let failed = 0, passed = 0;
  const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
  const J = JSON.stringify;
  const PAGE = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body style="margin:0"><button id="b" style="position:absolute;left:10px;top:10px;width:100px;height:50px">b</button></body></html>');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-self-'));
  try {
    /* the code it stops itself with is the one tools/mutate.mjs, beside it, reads as timed out */
    const { WATCHDOG } = await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mutate.mjs')).href);
    yes('a selftest stopped by its own limit exits with the code tools/mutate.mjs reads as timed out', WATCHDOG_EXIT === WATCHDOG, `${WATCHDOG_EXIT} and ${WATCHDOG}`);
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
    const rel3 = await Promise.race([holdChrome(600, lockFile), sleep(3000).then(() => 'no end in 3 s')]);
    yes('a lock a running process holds is waited for, and the wait gives up at its limit, not before and not long after', rel3 === null && Date.now() - t0 >= 550 && Date.now() - t0 < 1100, `${Date.now() - t0} ms`);
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
    const blocked = await drive(async () => { ran = true; }, { lock: lockFile, waitMs: 400, say: () => {} });
    const ownLock = path.join(scratch, 'own.lock');
    await drive(async () => {}, { lock: ownLock, timeoutMs: 30000, say: () => {} });
    yes('a drive gives its lock back at its end', !fs.existsSync(ownLock));
    yes('a drive that cannot have Chrome says so, and starts nothing', !ran && blocked.checks.length === 1 && !blocked.checks[0].ok && /^Chrome was free within/.test(blocked.checks[0].name), J(blocked.checks));
    process.env.LABS_DRIVE_WAIT_MS = '300';
    t0 = Date.now();
    const blocked2 = await Promise.race([drive(async () => { ran = true; }, { lock: lockFile, say: () => {} }), sleep(5000).then(() => null)]);
    delete process.env.LABS_DRIVE_WAIT_MS;
    yes('the wait for Chrome is LABS_DRIVE_WAIT_MS when it is set', !ran && !!blocked2 && !blocked2.checks[0].ok && Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
    fs.rmSync(lockFile, { force: true });
    // a stale lock is removed only under the takeover lock, and only if it still reads as it was seen
    const stale = J({ pid: 999999999, t: 1 }), fresh = J({ pid: process.ppid, t: 2 });
    fs.writeFileSync(lockFile, fresh);
    const keptLive = takeStale(lockFile, stale) === false && fs.readFileSync(lockFile, 'utf8') === fresh;
    fs.writeFileSync(lockFile, stale);
    fs.writeFileSync(lockFile + '.takeover', '');
    const keptBusy = takeStale(lockFile, stale) === false && fs.existsSync(lockFile) && fs.existsSync(lockFile + '.takeover');
    const t9 = (Date.now() - 9500) / 1000, t11 = (Date.now() - 11000) / 1000;
    fs.utimesSync(lockFile + '.takeover', t9, t9);
    const keptYoung = takeStale(lockFile, stale) === false && fs.existsSync(lockFile + '.takeover');
    fs.utimesSync(lockFile + '.takeover', t11, t11);
    const clearedOld = takeStale(lockFile, stale) === false && !fs.existsSync(lockFile + '.takeover');
    const removed = takeStale(lockFile, stale) === true && !fs.existsSync(lockFile) && !fs.existsSync(lockFile + '.takeover');
    yes('a stale lock is removed under the takeover lock, only while it reads as it was seen; a takeover 9.5 s old is waited for, one 11 s old is cleared', keptLive && keptBusy && keptYoung && clearedOld && removed, J([keptLive, keptBusy, keptYoung, clearedOld, removed]));
    let noTake = '';
    try { takeStale(path.join(scratch, 'no such folder', 'chrome.lock'), stale); noTake = 'no error'; } catch (e) { noTake = e.code; }
    yes('a takeover lock that cannot be written is an error, not a wait', noTake === 'ENOENT', noTake);
    // the lock file is LABS_DRIVE_LOCK when that is set (tools/mutate.mjs gives each copy its own): checked first, above
    yes('the lock is the file LABS_DRIVE_LOCK names when it is set', envOk);
    // profiles a day old are cleared, younger ones and other folders kept
    const tmp = path.join(scratch, 'tmp');
    for (const f of ['lab-drive-old', 'lab-drive-young', 'lab-drive', 'other-old']) fs.mkdirSync(path.join(tmp, f), { recursive: true });
    const now = Date.now();
    for (const [f, h] of [['lab-drive-old', 24.1], ['lab-drive-young', 23.9], ['lab-drive', 48], ['other-old', 48]]) fs.utimesSync(path.join(tmp, f), (now - h * 3600000) / 1000, (now - h * 3600000) / 1000);
    const swept = sweepProfiles(tmp, now);
    yes('a profile 24.1 hours old is cleared; one 23.9 hours old, the out folder and other folders are kept', J(swept) === J(['lab-drive-old']) && J(fs.readdirSync(tmp).sort()) === J(['lab-drive', 'lab-drive-young', 'other-old']), J(swept));

    /* this process holds the machine lock for the whole run: holding it again is at once, and gives nothing back */
    const held = () => fs.existsSync(lockPath()) && JSON.parse(fs.readFileSync(lockPath(), 'utf8') || '{}').pid === process.pid;
    t0 = Date.now();
    const again = await holdChrome(500);
    const againAtOnce = typeof again === 'function' && Date.now() - t0 < 300;
    if (again) again();
    yes('a process that holds the lock holds it again at once, and that inner hold gives nothing back', againAtOnce && held(), `${Date.now() - t0} ms`);

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
    }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
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
    const none = await drive(async (p) => { p.invariant('never run', '[]'); await p.ev('1'); await p.shot('none'); }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    const nr = none.checks.find((c) => c.name.startsWith('never run: held after each of 0 steps'));
    yes('a rule that never ran fails: no step is no proof', !!nr && !nr.ok, J(none.checks));
    const shotOnly = none.checks.find((c) => c.name === 'frame: no fully transparent pixel in each of 1 frames');
    yes('a shot is held to the frame rule even when frames() was not asked, and ends on its line', !!shotOnly && shotOnly.ok, J(none.checks));
    const noFrame = await drive(async (p) => { p.frames(); await p.ev('1'); }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    yes('a drive removes its Chrome\'s profile at its end', !!noFrame.profile && !fs.existsSync(noFrame.profile), noFrame.profile);
    const nf = noFrame.checks.find((c) => c.name === 'frame: no fully transparent pixel in each of 0 frames');
    yes('a frame rule that never saw a frame fails', !!nf && !nf.ok, J(noFrame.checks));

    /* what the page says: an exception, an error and a warning on its console, a resource that fails; not a note,
       not the favicon */
    const noisy = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body><img src="http://127.0.0.1:9/favicon.ico"><img src="http://127.0.0.1:9/missing.png"><script>console.error("an error"); console.warn("a warning"); console.log("a note"); setTimeout(() => { throw new Error("thrown late"); }, 0);</script></body></html>');
    const loud = await drive(async (p) => { await p.go(noisy); await p.ev('new Promise((r) => setTimeout(() => r(true), 800))'); }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    const E = loud.errors;
    yes('the console is read: an exception, an error, a warning and a failed resource; a note and the favicon are not', E.some((x) => /^exception: .*thrown late/.test(x)) && E.includes('error: an error') && E.includes('warning: a warning') && E.some((x) => /^log: .*missing\.png/.test(x)) && !E.some((x) => /^log: .*favicon/.test(x) || /^\w+: a note/.test(x)), J(E));
    yes('and the drive fails on it', loud.checks.some((c) => c.name === 'the console is clean' && !c.ok) && none.checks.some((c) => c.name === 'the console is clean' && c.ok));

    /* the pixels of a frame: the reader, on PNGs made here with every filter; then frames in Chrome */
    const png = (w, h, type, rows) => {   // rows: [filter, [bytes...]] for each line
      const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
      const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
      const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = type;
      const raw = Buffer.concat(rows.map(([f, bytes]) => Buffer.from([f, ...bytes])));
      return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    };
    // the same 3 x 3 image, opaque but for (1,1) and (2,2), written with each filter: the encoded bytes are worked out here
    const img = [[[9, 9, 9, 255], [8, 8, 8, 255], [7, 7, 7, 255]], [[6, 6, 6, 255], [0, 0, 0, 0], [5, 5, 5, 255]], [[4, 4, 4, 255], [3, 3, 3, 255], [1, 2, 3, 0]]];
    const encOf = (im, f) => im.map((row, y) => {
      const cur = row.flat(), up = y ? im[y - 1].flat() : new Array(row.length * 4).fill(0);
      return [f, cur.map((v, x) => {   // the PNG predictors, written out on their own (the reader must agree with them)
        const left = x < 4 ? 0 : cur[x - 4], above = up[x], corner = x < 4 ? 0 : up[x - 4];
        const p = left + above - corner, dl = Math.abs(p - left), da = Math.abs(p - above), dc = Math.abs(p - corner);
        const paeth = dl <= da && dl <= dc ? left : (da <= dc ? above : corner);
        return (v - [0, left, above, Math.floor((left + above) / 2), paeth][f]) & 255;
      })];
    });
    const enc = (f) => encOf(img, f);
    const read = [0, 1, 2, 3, 4].map((f) => transparentIn(png(3, 3, 6, enc(f))));
    yes('the frame reader finds the two transparent pixels of an RGBA frame and their box, whatever filter wrote each line', read.every((t) => t.count === 2 && J(t.box) === J({ x0: 1, y0: 1, x1: 3, y1: 3 }) && t.width === 3 && t.height === 3), J(read));
    yes('a pixel inside a box given is not counted, one outside it is', transparentIn(png(3, 3, 6, enc(4)), [{ x0: 1, y0: 1, x1: 2, y1: 2 }]).count === 1 && transparentIn(png(3, 3, 6, enc(4)), [{ x0: 0, y0: 0, x1: 3, y1: 3 }]).count === 0);
    // (2,2) is transparent: a box ends before its x1 and its y1, and starts at its x0 and its y0
    const edge = (box) => transparentIn(png(3, 3, 6, enc(4)), [box]).count;
    yes('a box holds the pixels from its first edge up to, not including, its last: one past it on each side is counted',
      edge({ x0: 0, y0: 2, x1: 2, y1: 3 }) === 2 && edge({ x0: 2, y0: 0, x1: 3, y1: 2 }) === 2 && edge({ x0: 2, y0: 3, x1: 3, y1: 4 }) === 2 && edge({ x0: 3, y0: 2, x1: 4, y1: 3 }) === 2 && edge({ x0: 2, y0: 2, x1: 3, y1: 3 }) === 1,
      J([edge({ x0: 0, y0: 2, x1: 2, y1: 3 }), edge({ x0: 2, y0: 0, x1: 3, y1: 2 }), edge({ x0: 2, y0: 3, x1: 3, y1: 4 }), edge({ x0: 3, y0: 2, x1: 4, y1: 3 })]));
    // a paeth tie: above and the corner equally near, the corner farther; the PNG rule takes above (alpha 0), not the corner (100)
    const tie = [[[0, 0, 0, 100], [0, 0, 0, 0]], [[0, 0, 0, 150], [0, 0, 0, 0]]];
    yes('a paeth tie is broken as the PNG rule breaks it', transparentIn(png(2, 2, 6, encOf(tie, 4))).count === 2, J(transparentIn(png(2, 2, 6, encOf(tie, 4)))));
    yes('only alpha 0 is transparent: alpha 1 is not', transparentIn(png(2, 1, 6, [[0, [0, 0, 0, 1, 0, 0, 0, 0]]])).count === 1, J(transparentIn(png(2, 1, 6, [[0, [0, 0, 0, 1, 0, 0, 0, 0]]]))));
    yes('an RGB frame has no transparent pixel, and a frame of another kind is refused for its kind', transparentIn(png(1, 1, 2, [[0, [1, 2, 3]]])).count === 0 && (() => { try { transparentIn(png(1, 1, 0, [[0, [5]]])); return false; } catch (e) { return /colour type 0 at 8 bits/.test(e.message); } })());
    // what the reader cannot read it refuses, with its reason
    const refusal = (b) => { try { transparentIn(b); return 'read'; } catch (e) { return e.message; } };
    const withHeader = (b, at, v) => { const c = Buffer.from(b); c[at] = v; return c; };   // IHDR's data starts at 16: interlace is byte 28
    const crcFix = (b) => { const c = Buffer.from(b); const crcTable = Array.from({ length: 256 }, (_, n) => { let k = n; for (let j = 0; j < 8; j++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1; return k >>> 0; }); let x = 0xffffffff; for (const v of c.subarray(12, 29)) x = crcTable[(x ^ v) & 255] ^ (x >>> 8); c.writeUInt32BE((x ^ 0xffffffff) >>> 0, 29); return c; };
    const one = png(1, 1, 6, [[0, [0, 0, 0, 0]]]);
    const trns = (() => { const b = png(2, 1, 2, [[0, [0, 0, 0, 255, 255, 255]]]); const t = Buffer.from([0, 0, 0, 6, 116, 82, 78, 83, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); return Buffer.concat([b.subarray(0, 33), t, b.subarray(33)]); })();
    const shortData = png(1, 3, 6, [[0, [9, 9, 9, 255]]]), threeLines = png(1, 3, 6, [[0, [9, 9, 9, 255]], [0, [9, 9, 9, 255]], [0, [9, 9, 9, 255]]]);
    const cut = one.subarray(0, one.length - 6), cut9 = one.subarray(0, one.length - 9), cutIdat = one.subarray(0, 48);
    const shortBy1 = png(1, 3, 6, [[0, [9, 9, 9, 255]], [0, [9, 9, 9, 255]]]);
    const why = { notPng: refusal(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70])), interlaced: refusal(crcFix(withHeader(one, 28, 1))), trns: refusal(trns), short: refusal(shortData), cut: refusal(cut),
      f5: refusal(png(1, 1, 6, [[5, [0, 0, 0, 0]]])), f4: refusal(png(1, 1, 6, [[4, [0, 0, 0, 0]]])), whole: refusal(threeLines), cut9: refusal(cut9), cutIdat: refusal(cutIdat), shortBy1: refusal(shortBy1) };
    yes('the reader refuses a file that is not a PNG, an interlaced frame, a colour made transparent by tRNS, pixel data short of its lines, a file cut short, and a filter above 4; filter 4 and whole data are read',
      why.notPng === 'not a PNG' && /interlaced/.test(why.interlaced) && /tRNS/.test(why.trns) && why.short === 'pixel data for 1 of 3 lines' && why.shortBy1 === 'pixel data for 2 of 3 lines' && why.cut === 'a PNG cut short' && why.cut9 === 'a PNG cut short' && why.cutIdat === 'a PNG cut short' && /filtered by 5/.test(why.f5) && why.f4 === 'read' && why.whole === 'read', J(why));
    let refused = '', took8 = '', badColour = '';
    await drive(async (p) => {
      try { p.frames({ '#x': 'seven c' }); } catch (e) { refused = e.message; }
      try { p.frames({ '#x': 'eight ch' }); took8 = 'taken'; } catch (e) { took8 = e.message; }
      try { await p.background({ r: 'not a number', g: 0, b: 0, a: 1 }); badColour = 'answered'; } catch (e) { badColour = e.message; }
    }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    yes('an exception to the frame rule needs its reason: 7 letters are refused, 8 are taken', /needs its reason/.test(refused) && took8 === 'taken', `${refused} | ${took8}`);
    yes('a call Chrome refuses fails with Chrome\'s words, not an answer', /^Invalid parameters.*\(-32602\)$/.test(badColour), badColour);
    const PLAIN = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body style="margin:0"><p style="margin:0;height:300px">no canvas here</p></body></html>');
    const BARE = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent"><div id="hole" style="height:100px"></div><div style="height:500px;background:#123"></div></body></html>');
    const PLATE = (opacity) => 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><html><body style="margin:0;background:#000"><canvas id="gl" width="390" height="600" style="display:block"></canvas>
      <div style="position:fixed;left:20px;bottom:20px;width:300px;height:120px;background:#0b0e13;opacity:${opacity}">a plate</div>
      <script>const g = document.getElementById('gl').getContext('webgl', { alpha: false }); const f = () => { g.clearColor(0.1, 0.2, 0.4, 1); g.clear(g.COLOR_BUFFER_BIT); requestAnimationFrame(f); }; f();</script></body></html>`);
    const pixels = {};
    const fr = await drive(async (p) => {
      p.frames({ '#hole': 'a test of the exception, a box left bare on purpose' });
      await p.go(PLAIN); await p.shot('plain');
      await p.background({ r: 0, g: 0, b: 0, a: 0 });
      await p.go(BARE); await p.sleep(100);
      p.frames({});
      await p.sleep(100);
      await p.background({ r: 255, g: 255, b: 255, a: 1 });
      for (const o of ['1', '0.98']) { await p.go(PLATE(o)); await p.ev('new Promise((r) => setTimeout(r, 400))'); pixels[o] = transparentIn(Buffer.from(fs.readFileSync(await p.shot('plate-' + o)))).count; }
    }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    const fails = fr.checks.filter((c) => /^frame: no fully transparent pixel, after/.test(c.name));
    yes('a page with no canvas passes, and a bare box an exception names with its reason passes: the first break is the bare box once its exception is gone', fails.length > 0 && /after a wait$/.test(fails[0].name) && /^39000 fully transparent pixels, in 390 x 100 px at 0,0$/.test(fails[0].detail), J(fails));
    yes('a page that leaves pixels bare is a break once nothing excepts them, named with their box', fails.some((c) => /390 x 100 px at 0,0/.test(c.detail)), J(fails));
    yes('an opaque fixed plate over an opaque WebGL canvas is a break where this machine leaves a hole, and the same plate at 98% is not', (pixels['1'] === 0 || fails.some((c) => c.detail === `${pixels['1']} fully transparent pixels, in 300 x 120 px at 20,20`)) && pixels['0.98'] === 0 && fails.length === (pixels['1'] ? 2 : 1), `hole here: ${pixels['1']} pixels; at 98%: ${pixels['0.98']}`);
    const endF = fr.checks.find((c) => /^frame: no fully transparent pixel in each of \d+ frames$/.test(c.name));
    yes('the frame rule ends on one line that counts its frames, failing when a frame broke it', !!endF && !endF.ok && /distinct breaks/.test(endF.detail), J(endF));
    let shotThrew = '';
    const t1 = Date.now(), lostPng = path.join(os.tmpdir(), 'lab-drive', 'lost.png');
    fs.rmSync(lostPng, { force: true });
    const lost = await drive(async (p) => { p.frames(); await p.go(PLAIN); try { await p.shot('lost'); } catch (e) { shotThrew = e.message; } }, { width: 390, height: 600, timeoutMs: 60000, frameMs: 1, say: () => {} });
    const lostF = lost.checks.filter((c) => /^frame: a frame came back, after /.test(c.name));
    const lostEnd = lost.checks.find((c) => /^frame: no fully transparent pixel in each of 2 frames$/.test(c.name));
    yes('a frame that does not come back in its time is a break after each step, the shot throws, and the drive goes on', lostF.length === 2 && lostF.every((c) => !c.ok && /^none within 6 tries of 0.001 s$/.test(c.detail)) && /no frame came back/.test(shotThrew) && !fs.existsSync(lostPng) && Date.now() - t1 < 30000, J(lost.checks) + ' ' + shotThrew);
    yes('when no frame came back, the end line fails and says so', !!lostEnd && !lostEnd.ok && lostEnd.detail === '2 frames did not come back', J(lostEnd));

    /* a drive talks to its own Chrome and to no other: a server that answers /json on 9333, the port every drive shared
       before Chrome chose its own (--port's default), stands for another drive's Chrome. One Chrome only: a selftest
       never starts two */
    const decoy = { asked: 0 };
    const server = http.createServer((q, s) => { decoy.asked++; s.setHeader('content-type', 'application/json'); s.end(J([{ type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/decoy' }])); });
    decoy.bound = await new Promise((res) => { server.once('error', () => res(false)); server.listen(9333, '127.0.0.1', () => res(true)); });
    if (decoy.bound) await drive(async (p) => { await p.go('data:text/html,' + encodeURIComponent('<title>mine</title>')); decoy.title = await p.ev('document.title'); }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    await new Promise((res) => server.close(() => res()));
    yes('a drive talks to its own Chrome: a server answering /json on 9333, as another drive\'s Chrome would, is never asked', decoy.bound && decoy.title === 'mine' && decoy.asked === 0, J(decoy));

    /* a Chrome that ends under the scenario: the next call fails at once */
    let after = '', scenarioEnd = 0;
    await drive(async (p) => {
      await p.ev('1');
      const [c] = liveChromes(); c.kill();
      await new Promise((r) => c.once('exit', r)); await new Promise((r) => setTimeout(r, 300));
      after = await Promise.race([p.ev('1').then(() => 'answered', (e) => 'failed: ' + e.message), new Promise((r) => setTimeout(() => r('no answer in 3 s'), 3000))]);
      scenarioEnd = Date.now();
    }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    const endTook = Date.now() - scenarioEnd;
    yes('a call made after Chrome has gone fails at once', after === 'failed: Chrome is gone', after);
    yes('a drive whose Chrome has already ended does not wait for it at the end', endTook < 3000, `${endTook} ms`);

    /* a capture Chrome refuses (the page's renderer has crashed) is tried again at once, and fails as no frame */
    let crashed = '', shotTook = 0;
    await drive(async (p) => { await p.crash(); const t = Date.now(); try { await p.shot('crashed'); crashed = 'a frame'; } catch (e) { crashed = e.message; } shotTook = Date.now() - t; }, { width: 390, height: 600, timeoutMs: 60000, say: () => {} });
    yes('a capture Chrome refuses is a frame that did not come back, tried again at once, not at its limit', /^the shot crashed: no frame came back$/.test(crashed) && shotTook < 4000, `${crashed}, ${shotTook} ms`);

    /* SIGTERM ends a process with its Chromes */
    const child = path.join(scratch, 'child.mjs');
    fs.writeFileSync(child, `import { writeSync } from 'node:fs'; import { drive, liveChromes } from ${J(pathToFileURL(fileURLToPath(import.meta.url)).href)};
await drive(async () => { writeSync(1, 'pid ' + liveChromes()[0].pid + String.fromCharCode(10)); process.emit('SIGTERM'); await new Promise(() => {}); }, { lock: ${J(path.join(scratch, 'child.lock'))}, width: 390, height: 600, timeoutMs: 15000, say: () => {} });`);
    const ran2 = await new Promise((res) => { const k = spawn(process.execPath, [child], { stdio: ['ignore', 'pipe', 'ignore'] }); let out = ''; k.stdout.on('data', (d) => { out += d; }); k.on('exit', (code) => res({ code, out })); });
    const chromePid = +((/pid (\d+)/.exec(ran2.out) || [])[1] || 0);
    let chromeGone = false;
    for (let i = 0; i < 25 && chromePid && !chromeGone; i++) { try { process.kill(chromePid, 0); await new Promise((r) => setTimeout(r, 200)); } catch { chromeGone = true; } }
    yes('on SIGTERM a process ends with code 143 and its Chrome ends with it', ran2.code === 143 && chromePid > 0 && chromeGone, J({ code: ran2.code, chromePid, chromeGone }));

    /* a Chrome that dies under a call */
    t0 = Date.now();
    const dead = await Promise.race([drive(async (p) => { await p.go(PAGE); await p.ev('new Promise(() => {})'); }, { width: 390, height: 600, timeoutMs: 3000, say: () => {} }), sleep(20000).then(() => ({ timedOut: false, checks: [] }))]);
    const took = Date.now() - t0;
    yes('a call that never answers ends with the timeout: Chrome is killed, the call fails at once and the drive returns', dead.timedOut && took < 15000 && dead.checks.some((c) => !c.ok && /^finished inside 3 s/.test(c.name)), `${took} ms ${J(dead.checks).slice(0, 200)}`);
    yes('a drive inside this process\'s hold of the machine lock does not give it back (and did not wait for it: the drives above ran)', held());
    whole();
    yes('the hold gives the machine lock back', !held());
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); whole(); }
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
