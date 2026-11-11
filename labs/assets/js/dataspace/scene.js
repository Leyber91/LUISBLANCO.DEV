/* ============================================================
   dataspace/scene.js — the horizon: a ray-marched lensed black hole
   whose disk is the source text, plus a 2D layer of marks.

   It takes a plain scene object (built by main.js from a run's
   measures) and draws it; it never computes a measure.

     bands      Float32Array(64*2): per band [bits per token, 0..1 normalised; kept share 0..1]
     bitsMax    the bits per token that maps to full brightness
     core       capsule bits / source bits (0..1+)
     lost       [{ text, bits, unit: bool, turn, i }] one mark per lost token or fact
     stage      0 at rest, 1 source measured, 2 capsule received, 3 rebuild received
     waiting    seconds until the public window opens, or 0

   Physics: null geodesics of the Schwarzschild metric, r_s = 1, integrated in Cartesian form as
   d2x/dl2 = -(3/2) |x cross v|^2 x / |x|^5 with an adaptive step, up to uSteps steps. The photon sphere sits at
   r = 1.5 and the shadow's edge at impact parameter 3*sqrt(3)/2. The disk is thin and Keplerian, with
   the relativistic Doppler factor and gravitational redshift; the boost exponent is illustrative.
   Everything the disk, core and marks encode is a chart of the run's numbers (see the metaphor map).
   ============================================================ */

import { MOTION, PALETTE as P } from './config.js';

const VERT = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';

/* Palette block: every shader colour, once (linear-ish RGB of the tokens.css inks and gold). */
const FRAG = `precision highp float;
// ---- palette (tokens.css: --horizon-dim, --horizon, --text-bright, --accretion-soft, starlight) ----
const vec3 INK_DIM = vec3(0.20, 0.23, 0.33);
const vec3 INK     = vec3(0.45, 0.58, 0.82);
const vec3 INK_HI  = vec3(0.86, 0.90, 0.98);
const vec3 GOLD    = vec3(0.94, 0.70, 0.32);
const vec3 STAR    = vec3(0.80, 0.85, 0.95);
uniform vec2 uRes; uniform vec2 uCenter; uniform float uTime; uniform vec3 uCam; uniform float uSteps;
uniform float uInner, uOuter, uExposure, uPhase, uCore, uWait, uJitter, uFade, uShadow;
uniform sampler2D uBands;
float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float a=0.5,s=0.0;for(int i=0;i<3;i++){s+=a*vnoise(p);p*=2.03;a*=0.5;}return s;}
vec3 sky(vec3 d){d=normalize(d);vec3 c=vec3(0.0);
 for(int k=0;k<2;k++){float sc=230.0+float(k)*410.0;vec3 id=floor(d*sc);float h=hash(id);
  if(h>0.988){float b=(h-0.988)/0.012;vec3 cell=(id+0.5)/sc;float dd=1.0-clamp(length(normalize(cell)-d)*sc*0.9,0.0,1.0);c+=pow(dd,6.0)*b*STAR*0.9;}}
 return c;}
vec3 accel(vec3 p,vec3 v){vec3 h=cross(p,v);return -1.5*dot(h,h)*p/pow(dot(p,p),2.5);}
// bits (0..1) -> ink ramp: dim slate, blue ink, near-white
vec3 ramp(float b){return b<0.5?mix(INK_DIM,INK,b*2.0):mix(INK,INK_HI,(b-0.5)*2.0);}
vec4 disk(vec3 hit,vec3 vin){
 float r=length(hit.xz);
 float coll=clamp(uPhase,0.0,1.0);            // 0 -> 1: the disk contracts into the capsule
 float reform=clamp(uPhase-1.0,0.0,1.0);      // 1 -> 2: the kept share re-forms
 float outer=mix(uOuter,uInner+0.35,coll*(1.0-reform));
 if(r<uInner||r>outer)return vec4(0.0);
 float t=clamp((r-uInner)/max(outer-uInner,1e-3),0.0,1.0);
 vec2 bk=texture2D(uBands,vec2(t*0.984+0.008,0.5)).rg; // r: bits, g: kept share
 float lit=mix(1.0,0.14+0.86*bk.g,reform);    // after the rebuild a band glows by the share that came back; lost stretches keep a ghost
 float omega=${MOTION.diskOmega.value.toFixed(3)}/pow(r,1.5);float rot=omega*uTime;float cs=cos(rot),sn=sin(rot);
 vec2 q=mat2(cs,-sn,sn,cs)*hit.xz;
 float turb=fbm3(vec3(q*0.7,log(r)*2.0));turb=0.55+0.45*turb;
 vec3 vdir=normalize(cross(vec3(0.0,1.0,0.0),hit));float beta=clamp(sqrt(0.5/max(r-0.5,0.2)),0.0,0.85);
 float mu=dot(vdir,-normalize(vin));float g=sqrt(1.0-beta*beta)/(1.0-mu*beta);
 float grav=sqrt(max(0.05,1.0-1.0/r));
 float boost=pow(g*grav,3.0);
 vec3 col=ramp(bk.r)*(0.25+1.35*bk.r)*turb*boost*lit*uFade;
 float edge=smoothstep(uInner,uInner+0.25,r)*smoothstep(outer,outer-0.6,r);
 col*=1.0+1.8*coll*(1.0-reform);
 return vec4(col,clamp(edge*(0.55+0.45*turb)*mix(1.0,0.25+0.75*lit,reform),0.0,1.0));}
void main(){
 vec2 fc=gl_FragCoord.xy;
 vec2 uv=(fc-uCenter)/uRes.y;
 vec3 ro=uCam;vec3 fwd=normalize(-ro);vec3 rgt=normalize(cross(fwd,vec3(0.0,1.0,0.0)));vec3 up=cross(rgt,fwd);
 vec3 rd=normalize(uv.x*rgt+uv.y*up+1.5*fwd);
 vec3 color=vec3(0.0);
 float b=length(cross(ro,rd));                // straight-line impact parameter
 if(b>uOuter+3.0){color=sky(rd);}             // far rays: no disk crossing, negligible bending
 else{
  float jit=uJitter*fract(52.9829189*fract(dot(fc,vec2(0.06711056,0.00583715))));
  // start the march where the ray enters r = 20; beyond it the bending is small and the space is empty
  float bq=dot(ro,rd),cq=dot(ro,ro)-400.0,disc=bq*bq-cq;
  float t0=(cq>0.0&&disc>0.0)?max(0.0,-bq-sqrt(disc)):0.0;
  vec3 p=ro+rd*(t0+jit*0.3);vec3 v=rd;float tr=1.0;float minr=1e9;bool esc=false;
  for(int i=0;i<240;i++){
   if(float(i)>=uSteps)break;
   float r=length(p);
   if(r<1.0){tr=0.0;break;}
   if(r>22.0&&dot(v,p)>0.0){esc=true;break;}
   vec3 vin=v;float dt=clamp(0.06*r,0.012,1.0);v=normalize(v+accel(p,v)*dt);vec3 pn=p+v*dt;
   minr=min(minr,r);
   if(p.y*pn.y<0.0){float k=p.y/(p.y-pn.y);vec3 hit=mix(p,pn,k);vec4 dc=disk(hit,vin);color+=dc.rgb*dc.a*tr;tr*=(1.0-dc.a);}
   p=pn;if(tr<0.02)break;}
  if(esc){color+=sky(v)*tr;float ring=smoothstep(0.35,0.0,abs(minr-1.5));color+=ring*ring*INK_HI*0.9*tr;}
 }
 // the capsule: a gold core whose glow is capsule bits / source bits
 float coreOn=clamp(uPhase,0.0,1.0);
 float pulse=uWait>0.0?0.75+0.25*sin(uTime*6.2832/${(MOTION.waitPulse.value / 1000).toFixed(2)}):1.0;
 float d=length(uv)/uShadow;                  // distance in shadow radii, so the core keeps its size as the camera moves
 float cg=coreOn*clamp(uCore,0.0,1.0)*pulse;
 color+=GOLD*cg*(exp(-d*d*34.0)*2.2+exp(-d*d*7.0)*0.4);
 color*=uExposure;
 color=color/(1.0+color);                     // Reinhard: keeps the disk under white
 color=pow(color,vec3(0.4545))*0.96;
 gl_FragColor=vec4(color,1.0);}`;

const BANDS = 64;

export class Horizon {
  constructor({ gl: canvas, marks, tip, tier, nogl, still, reduce }) {
    this.canvas = canvas; this.marksCanvas = marks; this.tipEl = tip; this.tierEl = tier; this.noglEl = nogl;
    this.still = still; this.reduce = reduce;
    this.views = [];                 // one or two scene objects (split view when two)
    this.yaw = 0.62; this.pitch = 0.22; this.dist = 34;
    this.scale = still ? 1 : 0.75; this.steps = 170; this.frames = [];
    this.running = true; this.visible = true; this.t0 = performance.now(); this.hover = null;
    this.ctx2 = marks.getContext('2d');
    this.initGL();
    this.bindInput();
    document.addEventListener('visibilitychange', () => { this.visible = !document.hidden; if (this.visible) this.loop(); });
    this.resize();
    addEventListener('resize', () => this.resize());
    this.loop();
  }

  initGL() {
    const c = this.canvas;
    const gl = c.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: this.still }) || c.getContext('experimental-webgl');
    if (!gl) { this.gl = null; this.noglEl.hidden = false; return; }
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);
      this.prog = p;
    } catch (e) {
      this.gl = null; this.noglEl.hidden = false;
      this.noglEl.textContent = 'WebGL shader error, so a flat 2D stand-in draws the encodings: ' + String(e.message || e).slice(0, 200);
      return;
    }
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.U = {};
    for (const n of ['uRes', 'uCenter', 'uTime', 'uCam', 'uSteps', 'uInner', 'uOuter', 'uExposure', 'uPhase', 'uCore', 'uWait', 'uJitter', 'uFade', 'uShadow', 'uBands'])
      this.U[n] = gl.getUniformLocation(this.prog, n);
    this.tex = [gl.createTexture(), gl.createTexture()];
    for (const t of this.tex) {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, BANDS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(BANDS * 4));
    }
    gl.uniform1i(this.U.uBands, 0);
    this.gl = gl;
  }

  /** views: [scene, scene?]; each scene object as documented at the top. */
  set(views) {
    const now = performance.now();
    this.views = views.map((v, k) => ({ ...v, phase: v.stage < (this.views[k]?.stage ?? 0) ? 0 : (this.views[k]?.phase ?? 0),
      measuredAt: v.stage === 1 && (this.views[k]?.stage ?? 0) !== 1 ? now : (this.views[k]?.measuredAt ?? 0), stageAt: now,
      prevStage: this.views[k]?.stage ?? 0, motes: this.layoutMotes(v.lost || []) }));
    if (this.gl) this.views.forEach((v, k) => this.upload(k, v));
    this.kick();
  }

  upload(k, v) {
    const gl = this.gl, px = new Uint8Array(BANDS * 4);
    for (let i = 0; i < BANDS; i++) {
      px[i * 4] = Math.round(255 * Math.max(0, Math.min(1, v.bands[i * 2])));
      px[i * 4 + 1] = Math.round(255 * Math.max(0, Math.min(1, v.bands[i * 2 + 1])));
      px[i * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[k]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, BANDS, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }

  /* The target phase for a stage: 0 at rest and measured, 1 with the capsule, 2 after the rebuild. */
  target(v) { return v.stage >= 3 ? 2 : v.stage === 2 ? 1 : 0; }

  /* Deterministic mote layout: angle and start radius from the token index. */
  layoutMotes(lost) {
    return lost.map((m, n) => {
      const h = Math.sin((m.i + 1) * 12.9898 + n * 78.233) * 43758.5453;
      const f = h - Math.floor(h);
      const g = (Math.sin((m.i + 3) * 39.3468 + n * 11.135) * 24634.6345) % 1;
      return { ...m, ang: f * Math.PI * 2, reach: 0.25 + 0.95 * Math.abs(g), drift: 0.6 + 0.4 * ((n * 0.37) % 1) };
    });
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
    // a narrow, square scene (phones) moves the camera in so the disk fills it; the visitor's own zoom wins after that
    if (!this.zoomed) this.dist = this.cssW < 700 ? 21 : 34;
    const dpr = Math.min(devicePixelRatio || 1, this.still ? 1 : 1.5);
    this.canvas.width = Math.floor(this.cssW * dpr * this.scale); this.canvas.height = Math.floor(this.cssH * dpr * this.scale);
    this.marksCanvas.width = Math.floor(this.cssW * dpr); this.marksCanvas.height = Math.floor(this.cssH * dpr);
    this.dpr = dpr;
    this.kick();
  }

  bindInput() {
    const c = this.canvas, pts = new Map();
    let pinch = 0;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) { this.hoverAt(e); return; }
      const p = pts.get(e.pointerId);
      if (pts.size === 1) { this.orbit((e.clientX - p.x) * MOTION.dragOrbit.value, (e.clientY - p.y) * MOTION.dragOrbit.value); }
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a2, b2] = [...pts.values()];
        const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (pinch && d0 > 0) this.zoom((d0 - d1) * MOTION.pinchZoom.value);
        pinch = 1;
        return;
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
    c.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') this.hoverAt(e); up(e); });
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { if (!pts.size) this.hoverAt(null); });
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(Math.sign(e.deltaY) * MOTION.zoomKey.value); }, { passive: false });
    c.addEventListener('keydown', (e) => {
      const s = MOTION.orbitKey.value;
      if (e.key === 'ArrowLeft') this.orbit(-s * 1.5, 0); else if (e.key === 'ArrowRight') this.orbit(s * 1.5, 0);
      else if (e.key === 'ArrowUp') this.orbit(0, -s); else if (e.key === 'ArrowDown') this.orbit(0, s);
      else if (e.key === '+' || e.key === '=') this.zoom(-MOTION.zoomKey.value); else if (e.key === '-' || e.key === '_') this.zoom(MOTION.zoomKey.value);
      else return;
      e.preventDefault();
    });
  }
  orbit(dx, dy) { this.yaw -= dx; this.pitch = Math.max(0.05, Math.min(1.25, this.pitch + dy)); this.kick(); }
  zoom(d) { this.zoomed = true; this.dist = Math.max(16, Math.min(48, this.dist + d)); this.kick(); }

  /* Screen geometry of one view: its rectangle in CSS pixels. */
  rect(k) {
    const n = Math.max(1, this.views.length);
    const f = this.focus || { x: 0, w: this.cssW };
    const w = f.w / n;
    return { x: f.x + w * k, y: 0, w, h: this.cssH };
  }
  /* Two horizons share the stage: the camera backs off so each fits its half. */
  camDist() { return this.views.length > 1 ? this.dist * 1.75 : this.dist; }

  /* Where a lost mark sits now, in CSS pixels. */
  moteXY(v, m, k, now) {
    const R = this.rect(k);
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    const age = this.still || this.reduce ? 6 : Math.max(0, (now - v.stageAt) / 1000);
    const unit = R.h;
    const shadow = 1.5 * 2.598 / this.camDist();          // shadow edge, in screen heights
    const disk = 1.5 * 8.0 / this.camDist();              // the disk's outer edge, in screen heights
    // each mote leaves the photon ring and drifts out to its own reach, from a quarter of the disk to just past its edge
    const out = v.stage >= 3 ? Math.min((disk - shadow) * m.reach, MOTION.radiate.value * m.drift * age) : 0;
    const rad = (shadow + Math.max(0, out)) * unit;
    return { x: cx + Math.cos(m.ang) * rad, y: cy + Math.sin(m.ang) * rad * 0.55 };
  }

  hoverAt(e) {
    if (!e) { this.hover = null; this.tipEl.hidden = true; return; }
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
    let best = null, bd = 18;
    this.views.forEach((v, k) => {
      if (v.stage < 3) return;
      for (const m of v.motes) {
        const p = this.moteXY(v, m, k, now);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = { m, p }; }
      }
    });
    this.hover = best;
    if (!best) { this.tipEl.hidden = true; return; }
    this.tipEl.hidden = false;
    this.tipEl.innerHTML = '';
    const t = document.createElement('b'); t.textContent = best.m.text;
    const s = document.createElement('span');
    s.textContent = best.m.unit ? `lost ${best.m.kind} · turn ${best.m.turn || '?'}` : `lost token · ${best.m.bits.toFixed(1)} bits · turn ${best.m.turn || '?'}`;
    this.tipEl.append(t, s);
    this.tipEl.style.left = Math.min(this.cssW - 200, best.p.x + 12) + 'px';
    this.tipEl.style.top = Math.max(0, best.p.y - 36) + 'px';
  }

  /** The part of the canvas the horizon owns (CSS px): between the side panels on a wide screen, all of it on a phone. */
  setFocus(f) { this.focus = f; this.kick(); }

  kick() { if (this.still || this.reduce) this.drawOnce(); }

  loop() {
    if (this.raf) return;
    const step = (now) => {
      this.raf = 0;
      if (!this.visible) return;            // stopped while the tab is hidden; resumes on visibilitychange
      this.frame(now);
      if (!this.still && !this.reduce) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  drawOnce() { requestAnimationFrame((now) => this.frame(now)); }

  frame(now) {
    const dtFrame = this.last ? now - this.last : 16;
    this.last = now;
    for (const v of this.views) {
      v.fade = this.still || this.reduce || v.stage === 0 ? 1 : Math.min(1, (now - (v.measuredAt || 0)) / MOTION.infall.value);
      const goal = this.target(v);
      if (this.still || this.reduce) v.phase = goal;
      else {
        const dur = v.phase < 1 && goal >= 1 ? MOTION.crush.value : MOTION.reform.value;
        const stepP = dtFrame / dur;
        v.phase = v.phase < goal ? Math.min(goal, v.phase + stepP) : Math.max(goal, v.phase - stepP * 2);
      }
    }
    if (this.gl) this.drawGL(now); else this.draw2D(now);
    this.drawMarks(now);
    if (!this.still && !this.reduce) this.adapt(dtFrame);
  }

  /* Performance tiers: render scale and step count follow the measured frame time. */
  adapt(dt) {
    this.frames.push(dt);
    const total = this.frames.reduce((a, b) => a + b, 0);
    if (this.frames.length < MOTION.tierFrames.value && total < MOTION.tierWindow.value) return;
    const avg = total / this.frames.length;
    this.frames = [];
    const tiers = [[1, 220], [0.85, 200], [0.75, 170], [0.62, 140], [0.5, 120], [0.4, 100]];
    let i = tiers.findIndex((t) => t[0] <= this.scale + 1e-6 && t[1] <= this.steps);
    if (i < 0) i = 2;
    if (avg > 40) i = Math.min(tiers.length - 1, i + 2);
    else if (avg > 18.5) i = Math.min(tiers.length - 1, i + 1);
    else if (avg < 9 && i > 0) i--;
    const [s, st] = tiers[i];
    if (s !== this.scale) { this.scale = s; this.resize(); }
    this.steps = st;
    this.tierEl.textContent = `render ${s.toFixed(2)}x · ${st} steps · ${avg.toFixed(1)} ms/frame`;
  }

  drawGL(now) {
    const gl = this.gl, U = this.U;
    const time = this.still ? 4.0 : (now - this.t0) / 1000;
    const D = this.camDist();
    const cam = [D * Math.cos(this.pitch) * Math.cos(this.yaw), D * Math.sin(this.pitch), D * Math.cos(this.pitch) * Math.sin(this.yaw)];
    const W = this.canvas.width, H = this.canvas.height, n = Math.max(1, this.views.length);
    const sx = W / this.cssW;
    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, W, H);
    for (let k = 0; k < n; k++) {
      const v = this.views[k] || { phase: 0, core: 0, waiting: 0 };
      const R = this.rect(k);
      // the first view also owns the sky left of the stage, the last one the sky right of it
      const x0 = k === 0 ? 0 : Math.round(R.x * sx), x1 = k === n - 1 ? W : Math.round((R.x + R.w) * sx);
      gl.scissor(x0, 0, x1 - x0, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[k] || this.tex[0]);
      gl.uniform2f(U.uRes, W, H); gl.uniform2f(U.uCenter, (R.x + R.w / 2) * sx, H / 2);
      gl.uniform1f(U.uTime, time); gl.uniform3f(U.uCam, cam[0], cam[1], cam[2]);
      gl.uniform1f(U.uSteps, this.steps); gl.uniform1f(U.uInner, 2.4); gl.uniform1f(U.uOuter, 8.0);
      gl.uniform1f(U.uExposure, 1.05); gl.uniform1f(U.uPhase, v.phase); gl.uniform1f(U.uCore, v.core || 0);
      gl.uniform1f(U.uWait, v.waiting > 0 ? 1 : 0); gl.uniform1f(U.uJitter, this.still ? 0 : 1);
      gl.uniform1f(U.uFade, v.fade ?? 1); gl.uniform1f(U.uShadow, 1.5 * 2.598 / D);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  /* Without WebGL: the same encodings, flat. Bands as ellipses, core, marks. */
  draw2D(now) {
    const c = this.canvas, g = c.getContext('2d');
    if (!g) return;
    const W = c.width, H = c.height, n = Math.max(1, this.views.length);
    g.fillStyle = P.void; g.fillRect(0, 0, W, H);
    for (let k = 0; k < n; k++) {
      const v = this.views[k]; if (!v) continue;
      const R = this.rect(k), sx = W / this.cssW;
      const cx = (R.x + R.w / 2) * sx, cy = H / 2, s = Math.min(R.w * sx, H) / 26;
      const reform = Math.max(0, Math.min(1, v.phase - 1)), coll = Math.max(0, Math.min(1, v.phase));
      const outer = 8.0 - (8.0 - 2.75) * coll * (1 - reform);
      for (let i = BANDS - 1; i >= 0; i--) {
        const r = 2.4 + (outer - 2.4) * (i / BANDS);
        const bits = v.bands[i * 2], kept = v.bands[i * 2 + 1];
        const lit = 1 - reform + reform * (0.14 + 0.86 * kept);
        g.globalAlpha = 0.25 + 0.6 * lit; g.strokeStyle = bits > 0.66 ? P.bright : bits > 0.33 ? P.horizon : P.horizonDim;
        g.lineWidth = s * (outer - 2.4) / BANDS * 1.1;
        g.beginPath(); g.ellipse(cx, cy, r * s * 1.6, r * s * 0.5, 0, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = P.void; g.beginPath(); g.arc(cx, cy, 2.6 * s, 0, Math.PI * 2); g.fill();
      const cg = coll * Math.min(1, v.core || 0);
      g.globalAlpha = cg; g.fillStyle = P.goldSoft; g.beginPath(); g.arc(cx, cy, 3 + 6 * cg, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    }
  }

  drawMarks(now) {
    const g = this.ctx2, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.cssW, this.cssH);
    g.font = '11px "IBM Plex Mono", monospace';
    this.views.forEach((v, k) => {
      const R = this.rect(k);
      if (this.views.length > 1) {
        const cap = (k === 0 ? 'A  ' : 'B  ') + (v.caption || '');
        const tw = Math.min(R.w - 16, g.measureText(cap).width + 14);
        g.fillStyle = P.scrim; g.fillRect(R.x + R.w / 2 - tw / 2, 44, tw, 22);
        g.fillStyle = P.ink; g.textAlign = 'center'; g.fillText(cap, R.x + R.w / 2, 59); g.textAlign = 'left';
        if (k > 0) { g.strokeStyle = P.line; g.beginPath(); g.moveTo(R.x, 0); g.lineTo(R.x, R.h); g.stroke(); }
      }
      // countdown arc while the public window is closed
      if (v.waiting > 0) {
        const cx = R.x + R.w / 2, cy = R.h / 2, rr = (1.5 * 2.598 / this.camDist()) * R.h * 1.25;
        g.strokeStyle = P.goldSoft; g.lineWidth = 1.5;
        g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (v.waiting / (v.window || 45))); g.stroke();
        g.fillStyle = P.goldSoft; g.textAlign = 'center';
        g.fillText(`public window opens in ${v.waiting} s`, cx, cy + rr + 18); g.textAlign = 'left';
      }
      if (v.stage < 3) return;
      for (const m of v.motes) {
        const p = this.moteXY(v, m, k, now);
        if (p.x < R.x || p.x > R.x + R.w) continue;
        const hot = this.hover && this.hover.m === m;
        if (m.unit) {
          g.strokeStyle = hot ? P.goldSoft : P.bright; g.lineWidth = 1;
          g.beginPath(); g.arc(p.x, p.y, 4.5, 0, Math.PI * 2); g.stroke();
          g.fillStyle = P.scrim;
          const tw = g.measureText(m.text).width;
          const left = p.x > R.x + R.w / 2;
          const tx = left ? p.x - 11 - tw : p.x + 11;
          g.fillRect(tx - 4, p.y - 9, tw + 8, 15);
          g.fillStyle = P.bright; g.fillText(m.text, tx, p.y + 2);
        } else {
          g.fillStyle = hot ? P.goldSoft : P.bright;
          g.beginPath(); g.arc(p.x, p.y, hot ? 3 : 1.8, 0, Math.PI * 2); g.fill();
        }
      }
    });
  }
}
