/* =========================================================================
   lumen.engine.js — the GPGPU engine. Owns all WebGL2 state for one field
   instance; exposes a small imperative API the orchestrator drives. No DOM,
   no rAF, no lifecycle — just: build, seed, step, render, lerp, resize, destroy.
   Reads window.LUMEN.CONFIG (presets) + window.LUMEN.GLSL (shaders).
   Augments window.LUMEN.Engine = { create(opts) }.
   ========================================================================= */
(function(){
  "use strict";
  const LUMEN = (window.LUMEN = window.LUMEN || {});
  const CONFIG = LUMEN.CONFIG, GLSL = LUMEN.GLSL;

  // create one engine bound to an existing WebGL2 context + canvas.
  function create({ gl, canvas, dpr, tierKey }){
    tierKey = tierKey || CONFIG.DEFAULT_TIER;
    const texSize = CONFIG.TIERS[tierKey].texSize;
    const count = texSize * texSize;

    let texPos = [], texVel = [], fbo = [];     // ping-pong (MRT: pos@0, vel@1)
    let read = 0, write = 1;
    let quadVAO, emptyVAO, quadBuf;
    let seedProg, simProg, renderProg;
    let t0 = 0;

    // live (lerped) + target field params; orchestrator sets the target.
    const curP = Object.assign({}, CONFIG.PRESETS.hero);
    const tgtP = Object.assign({}, CONFIG.PRESETS.hero);

    // ── gl helpers ─────────────────────────────────────────────────────────
    function compile(type, src){
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
        console.warn('[LUMEN] shader compile failed:', gl.getShaderInfoLog(sh)); return null;
      }
      return sh;
    }
    function link(vsSrc, fsSrc){
      const vs = compile(gl.VERTEX_SHADER, vsSrc), fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      if(!vs || !fs) return null;
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
        console.warn('[LUMEN] program link failed:', gl.getProgramInfoLog(p)); return null;
      }
      return p;
    }
    function makeStateTex(){
      const tx = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texSize, texSize, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tx;
    }
    function buildStateTargets(){
      texPos = []; texVel = []; fbo = [];
      for(let i=0;i<2;i++){
        texPos[i] = makeStateTex();
        texVel[i] = makeStateTex();
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texPos[i], 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texVel[i], 0);
        fbo[i] = f;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const now = () => (performance.now() - t0) / 1000;
    function runQuad(prog){ gl.useProgram(prog); gl.bindVertexArray(quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); }

    // ── build: link programs + VAOs + ping-pong targets ──────────────────────
    function build(){
      seedProg   = link(GLSL.VERT_QUAD,   GLSL.FRAG_SEED);
      simProg    = link(GLSL.VERT_QUAD,   GLSL.FRAG_SIM);
      renderProg = link(GLSL.VERT_RENDER, GLSL.FRAG_RENDER);
      if(!seedProg || !simProg || !renderProg) return false;

      quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
      quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
      const aSeed = gl.getAttribLocation(seedProg, 'aPos');
      gl.enableVertexAttribArray(aSeed); gl.vertexAttribPointer(aSeed, 2, gl.FLOAT, false, 0, 0);
      emptyVAO = gl.createVertexArray();   // attribute-less draw for the point pass
      gl.bindVertexArray(null);

      buildStateTargets();
      t0 = performance.now();
      return true;
    }

    // ── passes ───────────────────────────────────────────────────────────────
    function seed(){
      gl.viewport(0,0,texSize,texSize);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[read]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.useProgram(seedProg);
      gl.uniform1i(gl.getUniformLocation(seedProg, 'uTexSize'), texSize);
      runQuad(seedProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function step(dtSec){
      gl.viewport(0,0,texSize,texSize);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[write]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.useProgram(simProg);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPos[read]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texVel[read]);
      const u = n => gl.getUniformLocation(simProg, n);
      gl.uniform1i(u('uPos'), 0);
      gl.uniform1i(u('uVel'), 1);
      gl.uniform1f(u('uDt'), dtSec);
      gl.uniform1f(u('uTime'), now());
      gl.uniform1f(u('uScale'), curP.scale);
      gl.uniform1f(u('uSpeed'), curP.speed);
      gl.uniform1f(u('uDrift'), curP.drift);
      gl.uniform1f(u('uDamp'),  curP.damp);
      gl.uniform1i(u('uMode'),  curP.mode|0);
      gl.uniform2f(u('uCenter'), curP.cx, curP.cy);
      runQuad(simProg);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      read ^= 1; write ^= 1;
    }
    function render(){
      gl.viewport(0,0,canvas.width, canvas.height);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);   // premultiplied additive
      gl.useProgram(renderProg);
      const u = n => gl.getUniformLocation(renderProg, n);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPos[read]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texVel[read]);
      gl.uniform1i(u('uPos'), 0);
      gl.uniform1i(u('uVel'), 1);
      gl.uniform1i(u('uTexSize'), texSize);
      gl.uniform1f(u('uDpr'), dpr);
      gl.uniform1f(u('uTime'), now());
      gl.bindVertexArray(emptyVAO);
      gl.drawArrays(gl.POINTS, 0, count);
    }

    // ── preset easing (orchestrator sets the target; this eases toward it) ───
    function lerp(dtMs){
      const k = Math.min(1, dtMs / CONFIG.PRESET_LERP_MS);
      curP.scale += (tgtP.scale-curP.scale)*k;
      curP.speed += (tgtP.speed-curP.speed)*k;
      curP.drift += (tgtP.drift-curP.drift)*k;
      curP.damp  += (tgtP.damp -curP.damp )*k;
      curP.cx    += (tgtP.cx   -curP.cx   )*k;
      curP.cy    += (tgtP.cy   -curP.cy   )*k;
      curP.mode   = tgtP.mode;                 // mode snaps; params ease
    }
    function setPresetTarget(p){
      if(!p) return;
      tgtP.scale=p.scale; tgtP.speed=p.speed; tgtP.drift=p.drift;
      tgtP.damp=p.damp; tgtP.mode=p.mode; tgtP.cx=p.cx; tgtP.cy=p.cy;
    }

    function resize(newDpr){ dpr = newDpr; seed(); }   // positions are normalized → reseed

    function destroy(){
      [seedProg,simProg,renderProg].forEach(p=>p&&gl.deleteProgram(p));
      texPos.concat(texVel).forEach(t=>t&&gl.deleteTexture(t));
      fbo.forEach(f=>f&&gl.deleteFramebuffer(f));
      if(quadBuf) gl.deleteBuffer(quadBuf);
      if(quadVAO) gl.deleteVertexArray(quadVAO);
      if(emptyVAO) gl.deleteVertexArray(emptyVAO);
    }

    return {
      build, seed, step, render, lerp, setPresetTarget, resize, destroy,
      get count(){ return count; }, get tier(){ return tierKey; },
    };
  }

  LUMEN.Engine = { create };
})();
