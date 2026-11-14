/* ============================================================
   dataspace/lossless.worker.js — the lossless baselines, off the
   main thread: DEFLATE (the browser's CompressionStream), Brotli
   (brotli-wasm 3.0.1, the Rust brotli crate as WebAssembly, from
   cdn.jsdelivr.net, Apache-2.0) and the PPM context model primed on
   alice29.txt. Answers { op: 'measure', text } with bits per method,
   and once, the same compressors on alice29.txt for the reference check.
   ============================================================ */

import { PPM } from './ppm.js';

const BROTLI_URL = 'https://cdn.jsdelivr.net/npm/brotli-wasm@3.0.1/pkg.web/brotli_wasm.js';
let ppm = null, alice = null, brotli = null, ready = null;

async function deflate(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return (await new Response(cs.readable).arrayBuffer()).byteLength;
}

async function init(base) {
  const r = await fetch(base + 'alice29.txt');
  alice = new Uint8Array(await r.arrayBuffer());
  ppm = new PPM(4);
  const t0 = performance.now();
  const aliceBits = ppm.prime(alice);
  const primeMs = performance.now() - t0;
  let brotliErr = '';
  try {
    const mod = await import(BROTLI_URL);
    await mod.default();
    brotli = mod;
  } catch (e) { brotliErr = String(e.message || e); }
  const ref = { bytes: alice.length, ppmBits: aliceBits, primeMs, deflateBytes: await deflate(alice) };
  if (brotli) { const t1 = performance.now(); ref.brotliBytes = brotli.compress(alice, { quality: 11 }).length; ref.brotliMs = performance.now() - t1; }
  else ref.brotliErr = brotliErr;
  return ref;
}

self.onmessage = async (e) => {
  const { id, op } = e.data;
  try {
    if (op === 'init') { ready = init(e.data.base); self.postMessage({ id, ok: true, ref: await ready }); return; }
    await ready;
    if (op === 'measure') {
      const bytes = new TextEncoder().encode(e.data.text);
      const out = { bytes: bytes.length, deflateBits: (await deflate(bytes)) * 8 };
      const m = ppm.measure(bytes);
      out.ppmBits = m.bits;
      if (brotli) out.brotliBits = brotli.compress(bytes, { quality: 11 }).length * 8;
      self.postMessage({ id, ok: true, out });
    }
  } catch (err) { self.postMessage({ id, ok: false, error: String(err.message || err) }); }
};
