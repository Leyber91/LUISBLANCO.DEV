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
     ev(expression)          evaluate in the page, return the value (promises are awaited)
     until(expression, ms)   wait until the expression is truthy; false on timeout
     sleep(ms)
     move(x, y) · down(x, y) · up(x, y) · drag(x0, y0, x1, y1, { steps, hold }) · click(x, y)
     key(key, { code, text })
     shot(name)              a PNG of the viewport in the out folder
     errors()                every console error and exception so far (a copy), to tell which page logged what
     check(name, cond, detail)   one line of the report; a false cond fails the drive
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
    const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
    const page = {
      ev, until, sleep, check,
      errors: () => errors.slice(),
      async go(u) { await send('Page.navigate', { url: u }); if (!(await until('document.readyState === "complete"'))) throw new Error('the page did not finish loading: ' + u); },
      move: (x, y) => mouse('mouseMoved', x, y, 0),
      down: (x, y) => mouse('mousePressed', x, y, 1),
      up: (x, y) => mouse('mouseReleased', x, y, 0),
      async drag(x0, y0, x1, y1, { steps = 14, hold = 0 } = {}) {
        await mouse('mouseMoved', x0, y0, 0);
        await mouse('mousePressed', x0, y0, 1);
        for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, 1); await sleep(16); }
        if (hold) await sleep(hold);
        await mouse('mouseReleased', x1, y1, 0);
      },
      async click(x, y) { await mouse('mouseMoved', x, y, 0); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y, 0); },
      async key(key, { code = key.length === 1 ? 'Key' + key.toUpperCase() : key, text = key.length === 1 ? key : undefined } = {}) {
        const vk = { Enter: 13, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key];
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, ...(text ? { text } : {}), ...(vk ? { windowsVirtualKeyCode: vk } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, ...(vk ? { windowsVirtualKeyCode: vk } : {}) });
      },
      async shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(out, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; },
    };
    await scenario(page, { base, width, height });
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
  const r = await drive(scenario, { base, out: flag('out', undefined), width: Number(flag('width', 1440)), height: Number(flag('height', 900)), timeoutMs: 1000 * Number(flag('timeout', 180)) });
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`drive: ${r.checks.length - bad} of ${r.checks.length} checks passed; console errors: ${r.errors.length}`);
  process.exit(r.timedOut ? 3 : bad ? 1 : 0);
}
