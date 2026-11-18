/* ============================================================
   blackhole/renderer.js — WebGL2. Owns the GPU; knows nothing
   about the DOM beyond its canvas.

   Pipeline
     TRACE  -> G-buffer (3 float targets), only when geodesics change.
               A low-resolution preview is traced at once; the full
               buffer (supersampled on the high tier) fills in bands
               over the next frames, so the page never stalls.
     SHADE  -> HDR target every frame: disk turbulence turning at the
               local Kepler rate, colour modes, stars, annotations.
     FINAL  -> bloom from the HDR mip chain, ACES tone map, dither.
   A still view with the animation paused issues no draw calls.

   Uniforms bind from one table (UNIFORMS below) evaluated against a
   frame object built from the state and the physics engine.
   ============================================================ */

import * as K from './kerr.js';
import { traceProgram, shadeProgram, FINAL, VERT, directProgram } from './shaders.js';
import { buildLUT, LOG_T0, LOG_T1, LUT_N } from './blackbody.js';
import { TIERS } from './config.js';
import { tanHalfV } from './physics.js';
import { flowCycle } from './flow.js';

const MODE_ID = { thermal: 0, true: 1, redshift: 2, order: 3, steps: 4 };
const EMIT_ID = { off: 0, thick: 1, thin: 2 };

/* name, type, getter(frame) */
const UNIFORMS = [
  ['uA', '1f', (f) => f.a], ['uQ', '1f', (f) => f.q], ['uRh', '1f', (f) => f.rh], ['uK', '1f', (f) => f.k],
  ['uMaxSteps', '1i', (f) => f.maxSteps], ['uRin', '1f', (f) => f.rin], ['uRout', '1f', (f) => f.rout],
  ['uEmit', '1i', (f) => f.emit], ['uREsc', '1f', (f) => f.resc],
  ['uCU', '4fv', (f) => f.cam.U], ['uCR', '4fv', (f) => f.cam.R], ['uCUp', '4fv', (f) => f.cam.Up], ['uCF', '4fv', (f) => f.cam.F],
  ['uCamPos', '3fv', (f) => f.cam.pos],
  ['uLogT', '2f', () => [LOG_T0, LOG_T1]],
  ['uPixAng', '1f', (f) => f.pixAng], ['uAz', '1f', (f) => f.az], ['uSkyGain', '1f', (f) => f.skyGain],
  ['uTime', '1f', (f) => f.time], ['uTdisp', '1f', (f) => f.tdisp], ['uTpeakK', '1f', (f) => f.tpeakK],
  ['uFcol', '1f', (f) => f.fcol], ['uStretch', '1f', (f) => f.stretch], ['uIgnite', '1f', (f) => f.ignite], ['uCycle', '1f', (f) => f.cycle],
  ['uHot', '3fv', (f) => f.hot], ['uMode', '1i', (f) => f.mode], ['uNotes', '1i', (f) => f.notes], ['uHL', '1f', (f) => f.hl],
  ['uExpo', '1f', (f) => f.expo], ['uFrame', '1f', (f) => f.frame],
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    // ?gpu=low asks for the low-power (integrated) GPU on dual-GPU machines, for battery or measurement
    const lowPower = /[?&]gpu=low/.test(location.search);
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: lowPower ? 'low-power' : 'high-performance' });
    this.gl = gl;
    if (!gl) { this.error = 'WebGL2 is not available in this browser.'; return; }
    this.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    // a software rasteriser (SwiftShader, llvmpipe) starts on the minimal tier
    try {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      this.gpuName = String(name || '');
      this.software = /swiftshader|llvmpipe|software|basic render/i.test(this.gpuName);
    } catch { this.software = false; }
    gl.getExtension('OES_texture_float_linear');
    try {
      if (this.floatRT) {
        this.pTrace = this._program(traceProgram());
        this.pShade = this._program(shadeProgram());
        this.pFinal = this._program(FINAL);
      } else {
        this.pDirect = this._program(directProgram());
      }
    } catch (e) {
      this.error = 'Shader compile failed: ' + e.message;
      console.error(e);
      return;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // blackbody table
    this.lut = this._tex(LUT_N, 1, gl.RGBA16F, gl.RGBA, gl.FLOAT, buildLUT(), gl.LINEAR);
    this.profile = this._tex(512, 1, gl.R16F, gl.RED, gl.FLOAT, new Float32Array(512), gl.LINEAR);
    this.preview = null; this.main = null; this.hdr = null;
    this.bandRows = 64; this.bandY = 0; this.mainDone = false;
    this.frameNo = 0;
    this.tier = TIERS.mid;
    this.lastFrame = null;
  }

  ok() { return !!this.gl && !this.error; }

  /* ---------- GL helpers ---------- */
  _program(fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
        const m = /ERROR: \d+:(\d+)/.exec(log || '');
        const ctx = m ? lines.slice(Math.max(0, +m[1] - 3), +m[1] + 2).join('\n') : '';
        throw new Error(log + '\n' + ctx);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); loc[u.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, u.name); }
    return { p, loc };
  }

  _tex(w, h, ifmt, fmt, type, data, filter) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _gbuffer(w, h) {
    const gl = this.gl;
    const tex = [0, 1, 2].map(() => this._tex(w, h, gl.RGBA32F, gl.RGBA, gl.FLOAT, null, gl.NEAREST));
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    tex.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (st !== gl.FRAMEBUFFER_COMPLETE) throw new Error('G-buffer incomplete: ' + st);
    return { w, h, tex, fbo };
  }

  _free(b) {
    if (!b) return;
    const gl = this.gl;
    (b.tex || [b.t]).forEach((t) => gl.deleteTexture(t));
    gl.deleteFramebuffer(b.fbo);
  }

  _hdrTarget(w, h) {
    const gl = this.gl;
    const levels = 1 + Math.floor(Math.log2(Math.max(w, h)));
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { w, h, t, fbo };
  }

  _bind(prog, frame) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    for (const [name, type, get] of UNIFORMS) {
      const l = prog.loc[name];
      if (l === undefined || l === null) continue;
      const v = get(frame);
      if (type === '1f') gl.uniform1f(l, v);
      else if (type === '1i') gl.uniform1i(l, v);
      else if (type === '2f') gl.uniform2f(l, v[0], v[1]);
      else if (type === '3fv') gl.uniform3fv(l, v);
      else if (type === '4fv') gl.uniform4fv(l, v);
    }
  }

  /* ---------- sizing ---------- */
  setTier(t) { this.tier = t; this.resize(true); }

  resize(force = false) {
    if (!this.ok()) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.dprCap);
    const w = Math.max(2, Math.round(this.canvas.clientWidth * dpr * this.tier.scale));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr * this.tier.scale));
    if (!force && this.canvas.width === w && this.canvas.height === h && this.hdr) return;
    this.canvas.width = w; this.canvas.height = h;
    if (!this.floatRT) { this.dirtyGeo = true; return; }
    this._free(this.hdr); this._free(this.main); this._free(this.preview);
    this.hdr = this._hdrTarget(w, h);
    const ss = this.tier.ss;
    this.main = this._gbuffer(w * ss, h * ss); this.main.ss = ss;
    const ps = w * h > 600000 ? 0.4 : w * h < 220000 ? 0.75 : 0.55;
    this.preview = this._gbuffer(Math.max(2, Math.round(w * ps)), Math.max(2, Math.round(h * ps)));
    this.preview.scale = ps;
    this.dirtyGeo = true;
  }

  /* ---------- the frame object (all uniforms come from here) ---------- */
  buildGeometry(view) {
    // view: { a, q, incl (deg), rcam, fov (deg), tilt (deg), observer, rout, emit }
    const a = view.a, q = view.q || 0;
    const incl = view.incl * Math.PI / 180;
    const pos = K.ksPosition(a, view.rcam, incl, 0);
    const cam = K.observerFrame(a, pos, { q, observer: view.observer, tilt: (view.tilt || 0) * Math.PI / 180 });
    const toF32 = (v) => Float32Array.from(v);
    const geo = {
      a, q, rh: K.horizon(a, q), rin: K.isco(a, 1, q), rout: view.rout, cycle: flowCycle(a, q),
      emit: EMIT_ID[view.emit] ?? 1,
      cam: { U: toF32(cam.U), R: toF32(cam.R), Up: toF32(cam.Up), F: toF32(cam.F), pos: toF32(cam.pos), raw: cam },
      tanHalf: tanHalfV(view.fov, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)),
      resc: Math.max(view.rcam * 1.02, 80),
    };
    return geo;
  }

  setGeometry(geo, profile) {
    this.geo = geo;
    if (profile) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.profile);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 1, gl.RED, gl.FLOAT, profile);
    }
    this.dirtyGeo = true;
  }

  _screenMap(buf, extra = {}) {
    const th = this.geo.tanHalf;
    const W = buf.w, H = buf.h;
    return {
      origin: [-W / H * th, -th], stepX: [2 * th / H, 0], stepY: [0, 2 * th / H], jit: [0, 0], ...extra,
    };
  }

  _traceInto(buf, frame, y0 = 0, rows = null, mapOverride = null) {
    const gl = this.gl;
    const map = mapOverride || this._screenMap(buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, buf.fbo);
    gl.viewport(0, 0, buf.w, buf.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, y0, buf.w, rows ?? buf.h);
    this._bind(this.pTrace, { ...frame, pixAng: 2 * this.geo.tanHalf / buf.h });
    const L = this.pTrace.loc;
    gl.uniform2f(L.uOrigin, map.origin[0], map.origin[1]);
    gl.uniform2f(L.uStepX, map.stepX[0], map.stepX[1]);
    gl.uniform2f(L.uStepY, map.stepY[0], map.stepY[1]);
    gl.uniform2f(L.uJit, map.jit[0], map.jit[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  /**
   * Render one frame. frame: the uniform values that change per frame (time, look).
   * interacting: true while the visitor drags or a transition runs (preview only).
   * Returns what was done, for the frame-time readout.
   */
  render(frame, { interacting = false, full = false } = {}) {
    if (!this.ok() || !this.geo) return null;
    const gl = this.gl;
    const f = { ...this.geo, ...frame, k: this.tier.k, maxSteps: this.tier.maxSteps, mode: MODE_ID[frame.modeName] ?? 0, frame: this.frameNo++ };
    gl.bindVertexArray(this.vao);
    if (!this.floatRT) {
      // fallback: everything per frame at the canvas resolution
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this._bind(this.pDirect, { ...f, pixAng: 2 * this.geo.tanHalf / this.canvas.height });
      const map = this._screenMap({ w: this.canvas.width, h: this.canvas.height });
      const L = this.pDirect.loc;
      gl.uniform2f(L.uOrigin, map.origin[0], map.origin[1]);
      gl.uniform2f(L.uStepX, map.stepX[0], map.stepX[1]);
      gl.uniform2f(L.uStepY, map.stepY[0], map.stepY[1]);
      gl.uniform2f(L.uJit, 0, 0);
      this._bindTex(this.pDirect, 'uLUT', this.lut, 0);
      this._bindTex(this.pDirect, 'uProfile', this.profile, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return { traced: 'direct' };
    }
    let traced = null;
    if (this.dirtyGeo) {
      this._traceInto(this.preview, f);
      this.dirtyGeo = false;
      this.bandY = 0; this.mainDone = false;
      traced = 'preview';
    }
    if (full && !this.mainDone) {
      // single-frame capture: fill the whole full-resolution buffer now
      this._traceInto(this.main, f, this.bandY, this.main.h - this.bandY);
      this.bandY = this.main.h; this.mainDone = true; traced = 'full';
    } else if (!traced && !this.mainDone && !interacting) {
      const rows = Math.min(this.bandRows, this.main.h - this.bandY);
      this._traceInto(this.main, f, this.bandY, rows);
      this.bandY += rows;
      if (this.bandY >= this.main.h) this.mainDone = true;
      traced = 'band';
    }
    const src = this.mainDone ? this.main : this.preview;
    const scale = this.mainDone ? this.main.ss : this.preview.scale;
    const ss = this.mainDone ? this.main.ss : 1;
    // shade -> HDR
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdr.fbo);
    gl.viewport(0, 0, this.hdr.w, this.hdr.h);
    this._bind(this.pShade, { ...f, pixAng: 2 * this.geo.tanHalf / src.h });
    const L = this.pShade.loc;
    gl.uniform1f(L.uScale, scale);
    gl.uniform1i(L.uSS, ss);
    gl.uniform2i(L.uGSize, src.w, src.h);
    src.tex.forEach((t, i) => this._bindTex(this.pShade, 'uG' + i, t, i));
    this._bindTex(this.pShade, 'uLUT', this.lut, 3);
    this._bindTex(this.pShade, 'uProfile', this.profile, 4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, this.hdr.t);
    gl.generateMipmap(gl.TEXTURE_2D);
    // final -> canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.pFinal.p);
    this._bindTex(this.pFinal, 'uHDR', this.hdr.t, 0);
    gl.uniform2f(this.pFinal.loc.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.pFinal.loc.uBloom, frame.bloom ?? 0.55);
    gl.uniform1f(this.pFinal.loc.uFrame, this.frameNo % 64);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return { traced, refined: this.mainDone, progress: this.mainDone ? 1 : this.bandY / (this.main?.h || 1) };
  }

  _bindTex(prog, name, tex, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (prog.loc[name] != null) gl.uniform1i(prog.loc[name], unit);
  }

  /** Adapt the band height to the measured frame time (ms). */
  adaptBands(dt) {
    if (!this.main) return;
    const floor = this.software ? Math.ceil(this.main.h / 10) : 4;
    if (dt > 34) this.bandRows = Math.max(floor, Math.floor(this.bandRows * 0.7));
    else if (dt < 20) this.bandRows = Math.min(this.main.h, Math.ceil(this.bandRows * 1.3) + 1);
  }

  /**
   * Measure the shadow from the renderer's own rays: trace a 4096-texel row through the
   * screen centre and a column through the shadow's horizontal centre with the emitter off,
   * read the fates back, and return the edges as tangent-plane coordinates.
   */
  measureStrip(frame, N = 4096) {
    if (!this.ok() || !this.floatRT || !this.geo) return null;
    const gl = this.gl;
    const row = this._gbuffer(N, 1), col = this._gbuffer(1, N);
    const th = this.geo.tanHalf, aspect = this.canvas.width / this.canvas.height;
    const f = { ...this.geo, ...frame, emit: 0, k: this.tier.k, maxSteps: 720, mode: 0, frame: 0 };
    gl.bindVertexArray(this.vao);
    const span = th * Math.max(aspect, 1) * 1.0;
    this._traceInto(row, f, 0, 1, { origin: [-span, 0], stepX: [2 * span / N, 0], stepY: [0, 0], jit: [0, 0] });
    const px = new Float32Array(N * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, row.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, N, 1, gl.RGBA, gl.FLOAT, px);
    const edges = (arr, n, s0, ds) => {
      let first = -1, last = -1;
      for (let i = 0; i < n; i++) if (arr[i * 4 + 3] > -1.5 && arr[i * 4 + 3] < -0.5) { if (first < 0) first = i; last = i; }
      if (first < 0) return null;
      // edge = midway between the last escaped texel and the first captured one
      return { lo: s0 + (first) * ds, hi: s0 + (last + 1) * ds, res: ds };
    };
    const h = edges(px, N, -span, 2 * span / N);
    if (!h) { this._free(row); this._free(col); return null; }
    const sc = 0.5 * (h.lo + h.hi);
    this._traceInto(col, f, 0, N, { origin: [sc, -span], stepX: [0, 0], stepY: [0, 2 * span / N], jit: [0, 0] });
    gl.bindFramebuffer(gl.FRAMEBUFFER, col.fbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, 1, N, gl.RGBA, gl.FLOAT, px);
    const v = edges(px, N, -span, 2 * span / N);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._free(row); this._free(col);
    this.dirtyGeo = this.dirtyGeo || false;
    return { h, v, center: sc };
  }

  /**
   * Render a still at width W (height from the canvas aspect) and return an ImageData-ready
   * Uint8ClampedArray, top row first. Traces in bands synchronously; ss 2 on request.
   */
  async renderStill(frame, W, { ss = 2, onProgress } = {}) {
    if (!this.ok() || !this.floatRT) return null;
    const gl = this.gl;
    const H = Math.round(W * this.canvas.height / this.canvas.width);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    ss = Math.min(ss, Math.floor(maxTex / Math.max(W, H)));
    const gb = this._gbuffer(W * ss, H * ss);
    const hdr = this._hdrTarget(W, H);
    const out = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, out);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
    const ofb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, ofb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
    const f = { ...this.geo, ...frame, k: Math.min(this.tier.k, 0.08), maxSteps: 600, mode: MODE_ID[frame.modeName] ?? 0, frame: 0 };
    gl.bindVertexArray(this.vao);
    const rows = Math.max(8, Math.floor(65536 / gb.w));
    for (let y = 0; y < gb.h; y += rows) {
      this._traceInto(gb, f, y, Math.min(rows, gb.h - y));
      gl.finish();
      onProgress?.(y / gb.h);
      await new Promise((r) => setTimeout(r, 0));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fbo);
    gl.viewport(0, 0, W, H);
    this._bind(this.pShade, { ...f, pixAng: 2 * this.geo.tanHalf / gb.h });
    const L = this.pShade.loc;
    gl.uniform1f(L.uScale, ss); gl.uniform1i(L.uSS, ss); gl.uniform2i(L.uGSize, gb.w, gb.h);
    gb.tex.forEach((t, i) => this._bindTex(this.pShade, 'uG' + i, t, i));
    this._bindTex(this.pShade, 'uLUT', this.lut, 3);
    this._bindTex(this.pShade, 'uProfile', this.profile, 4);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, hdr.t);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ofb);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.pFinal.p);
    this._bindTex(this.pFinal, 'uHDR', hdr.t, 0);
    gl.uniform2f(this.pFinal.loc.uRes, W, H);
    gl.uniform1f(this.pFinal.loc.uBloom, frame.bloom ?? 0.55);
    gl.uniform1f(this.pFinal.loc.uFrame, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this._free(gb); this._free(hdr);
    gl.deleteTexture(out); gl.deleteFramebuffer(ofb);
    // flip to top-first rows
    const flipped = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) flipped.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    this.dirtyGeo = true;   // the main buffer is intact, but rebind sizes next frame
    return { data: flipped, width: W, height: H };
  }
}
