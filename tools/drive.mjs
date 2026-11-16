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
                             many steps each rule held for. tools/drives/invariants.mjs has the shared rules.
     step(label)             run the invariants now, after a change the scenario names
   Coordinates are CSS pixels of the viewport.

   Machine safety: one Chrome, its own throwaway profile, killed on
   a timeout (180 s by default) whatever the scenario does.

   Exit: 0 every check passed and the console is clean; 1 a check
   failed, the scenario threw or the page logged an error; 2 usage;
   3 timeout.
   ============================================================ */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHROME = process.env.LABS_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* The dev server has no favicon; that 404 is the server's, not the page's. */
const NOISE = /favicon\.ico/;

/**
 * Run one scenario. opts: base, out, width, height, timeoutMs, port, say (a line printer).
 * Returns { checks: [{ name, ok, detail }], errors: [string], timedOut }.
 */
export async function drive(scenario, opts = {}) {
  const { base, out = path.join(os.tmpdir(), 'lab-drive'), width = 1440, height = 900, timeoutMs = 180000, port = 9333, say = console.log } = opts;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-drive-'));
  fs.mkdirSync(out, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
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
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
      else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !NOISE.test(d.params.entry.url || '')) errors.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      if (timedOut || ws.readyState !== 1) return rej(new Error('Chrome is gone'));
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text) + ' in: ' + expression.slice(0, 120));
      return r.result.value;
    };
    const until = async (expression, ms = 12000) => { for (let t = 0; t < ms; t += 150) { if (await ev(expression).catch(() => false)) return true; await sleep(150); } return false; };
    let touchOn = false, lastEv = '', inStep = false;
    const evAndNote = async (expression) => { lastEv = expression; return ev(expression); };
    /* after a step: every invariant, each distinct break reported once, eight at most for a rule */
    const step = async (label) => {
      if (!invariants.length || inStep || timedOut) return;
      inStep = true;
      try {
        await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))').catch(() => false);   // the frame the change asked for is drawn
        for (const inv of invariants) {
          let bad;
          try { bad = await ev(inv.expression); } catch (e) { bad = [`the rule could not be read: ${String(e.message || e).slice(0, 160)}`]; }
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
      } finally { inStep = false; }
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
      async go(u) { await send('Page.navigate', { url: u }); if (!(await until('document.readyState === "complete"'))) throw new Error('the page did not finish loading: ' + u); await step(`go ${u.replace(/^https?:\/\/[^/]+/, '')}`); },
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

/* ---------------- command line ---------------- */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
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
