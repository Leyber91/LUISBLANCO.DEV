/* ============================================================
   blackhole.js — a ray-marched black-hole instrument.

   Raw WebGL1, one full-screen fragment shader. Per pixel we
   integrate a photon geodesic in the Schwarzschild field
   (the standard  a = -1.5 h^2 r / |r|^5  light-bending term),
   so the lensing, the photon ring and the disk seen "over the
   top" are physical, not faked.

   The black-hole *type* is driven by real-ish physics computed
   on the CPU (see _physics):
     - mass   -> inner-disk temperature -> colour (M^-1/4 scaling)
     - spin a -> ISCO radius (Kerr prograde), beaming, shadow
                 asymmetry (frame dragging), horizon radius
     - charge -> horizon + ISCO shrink (Reissner-Nordström)
     - mdot   -> luminosity + vertical thickness of the disk
   Geodesics are EXACT Schwarzschild; spin/charge act on the disk,
   horizon and shadow as physically-motivated approximations
   (not full Kerr null-geodesic tracing).

   The accretion disk is a procedural annulus: Novikov-Thorne
   radial temperature, blackbody-by-temperature colour, doppler
   beaming + gravitational redshift, and seam-free co-rotating
   turbulence (sampled in a sheared Cartesian frame, no atan).

   Units: Schwarzschild radius rs = 1, so M = 0.5. ISCO(a=0) = 3.
   API: new BlackHole(canvas, config); .start()/.stop();
        .set(key,val); .resize(); drag to orbit, wheel to zoom.
   ?still (window.__BH_STILL__) renders a single frame.
   ============================================================ */

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;          // camera position (rs units)
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBright;
uniform float uBgBright;
uniform float uExposure;
uniform float uSpin;         // disk rotation speed (visual)
uniform float uColorTemp;    // 0 warm .. 1 cold/blue bias (artistic)

// ---- physics (derived on CPU, see _physics) ----
uniform float uHorizon;      // event-horizon radius (rs units)
uniform float uRisco;        // inner-stable-orbit radius
uniform float uPhotonR;      // photon-sphere radius
uniform float uTnorm;        // 1 / Tprofile(peak) — normalises the NT profile
uniform float uSpinA;        // Kerr spin parameter a (0..0.998)
uniform float uMassTemp;     // 0 cool/orange (SMBH) .. 1 hot/blue (stellar)
uniform float uMdot;         // accretion rate -> brightness + thickness

#define STEPS 360
#define PI 3.14159265

// ---------- hash / noise ----------
float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  float n = mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                    mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                    mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  return n;
}
float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.02; a*=0.5; } return s; }

// interleaved-gradient noise — cheap per-pixel value to decorrelate the march
float ign(vec2 px){ return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }
// triangular-PDF dither (~1 LSB at 8-bit), animated so it never freezes as a pattern
float dither01(vec2 px){
  vec3 s = vec3(px, fract(uTime)*57.0);
  return (hash(s) + hash(s + 17.13)) - 1.0;
}

// blackbody-ish ramp keyed on normalised temperature t (0 cool .. 1 hot).
// A mass-driven TINT then shifts the whole palette: a stellar-mass hole
// burns blue-white (X-ray hot), a supermassive one glows amber — peak
// frequency scales ~ M^-1/4, so smaller holes are bluer.
vec3 temp2color(float t){
  vec3 ember = vec3(0.92, 0.16, 0.03);   // coolest visible disk
  vec3 amber = vec3(1.00, 0.52, 0.16);
  vec3 gold  = vec3(1.00, 0.82, 0.45);
  vec3 white = vec3(1.00, 0.97, 0.92);
  vec3 blue  = vec3(0.66, 0.82, 1.00);   // hottest inner edge
  float h = clamp(t, 0.0, 1.0);
  vec3 c;
  if      (h < 0.25) c = mix(ember, amber, h/0.25);
  else if (h < 0.55) c = mix(amber, gold,  (h-0.25)/0.30);
  else if (h < 0.80) c = mix(gold,  white, (h-0.55)/0.25);
  else               c = mix(white, blue,  (h-0.80)/0.20);
  // mass tint — decisive hue shift so the regimes read apart
  vec3 warm = vec3(1.08, 0.74, 0.42);
  vec3 cool = vec3(0.62, 0.80, 1.12);
  c *= mix(warm, cool, uMassTemp);
  // artistic warm<->cold override
  c = mix(c, c*vec3(0.66, 0.82, 1.10), uColorTemp);
  return c;
}

// starfield + nebula sampled along an (already bent) direction
vec3 background(vec3 dir){
  vec3 d = normalize(dir);
  vec3 col = vec3(0.0);
  for(int k=0;k<2;k++){
    float sc = 220.0 + float(k)*420.0;
    vec3 id = floor(d*sc);
    float h = hash(id);
    if(h > 0.985){
      float b = (h-0.985)/0.015;
      vec3 cell = (id+0.5)/sc;
      float dd = 1.0 - clamp(length(normalize(cell)-d)*sc*0.9,0.0,1.0);
      float star = pow(dd, 6.0)*b;
      vec3 tint = mix(vec3(0.8,0.86,1.0), vec3(1.0,0.85,0.6), hash(id+7.0));
      col += star*tint*1.4;
    }
  }
  // nebula — kept dark so the shadow reads as a true void
  float n = fbm(d*3.0 + 10.0);
  float n2 = fbm(d*6.0 - 4.0);
  vec3 neb = mix(vec3(0.015,0.025,0.05), vec3(0.05,0.025,0.07), n2);
  neb += vec3(0.10,0.05,0.015)*pow(n,4.0);   // warm wisps
  neb += vec3(0.01,0.04,0.08)*pow(n2,4.0);   // cold wisps
  col += neb*0.55;
  return col*uBgBright;
}

// Novikov-Thorne thin-disk temperature: zero-torque inner edge, peak
// at ~1.36*r_in, then r^-3/4 falloff. Returns normalised t in ~[0,1].
float diskTemp(float r){
  if (r <= uRisco) return 0.0;
  float f = pow(r, -0.75) * pow(max(0.0, 1.0 - sqrt(uRisco / r)), 0.25);
  return clamp(f * uTnorm, 0.0, 1.0);
}

vec4 diskShade(vec3 hit, vec3 v){
  float r = length(hit.xz);
  float t01 = diskTemp(r);                 // normalised temperature
  vec3 base = temp2color(pow(t01, 0.85));

  // --- seam-free turbulence -------------------------------------------------
  // differential rotation: inner shells orbit faster (Keplerian-ish).
  // We rotate the SAMPLE POSITION by a radius-dependent angle, so the spiral
  // arms come from real shear. Cartesian sampling has no branch cut -> no seam.
  float omega = uSpin * 0.5 / pow(r, 1.5);
  float rot   = omega * uTime * 3.0;
  float cs = cos(rot), sn = sin(rot);
  vec2  q  = mat2(cs, -sn, sn, cs) * hit.xz;
  float lr = log(r);
  float turb = fbm(vec3(q * 0.55, lr * 1.6 + uTime * 0.04));
  turb += 0.5 * fbm(vec3(q * 1.7, lr * 3.0 - uTime * 0.07));
  turb = pow(clamp(turb, 0.0, 1.0), 1.7);
  float band = 0.18 + 1.5 * turb;          // lower floor -> defined filaments

  // --- relativistic beaming (doppler) --------------------------------------
  // orbital speed rises toward the ISCO; spin lets it reach closer & faster.
  vec3 vdir = normalize(cross(vec3(0.0,1.0,0.0), hit));
  float beta = clamp(sqrt(0.5 / max(r - 0.5, 0.18)) * (1.0 + 0.25*uSpinA), 0.0, 0.92);
  float mu = dot(vdir, -normalize(v));
  float doppler = 1.0 / (1.0 - mu*beta);
  float boost = pow(doppler, 2.7);

  // --- gravitational redshift (Schwarzschild approx) -----------------------
  float g = sqrt(max(0.05, 1.0 - 1.0 / max(r, 1.0001)));
  float redshift = mix(0.45, 1.0, g);      // dims + reddens deep in the well

  // hot brilliant inner edge, just outside the ISCO
  float innerGlow = smoothstep(uRisco + 2.2, uRisco, r);
  vec3 col = base * band * boost * redshift * uDiskBright * (0.6 + 0.4*uMdot);
  // inner edge glows toward the disk's own hot colour, not pure white,
  // so the regime's hue survives the bright core
  vec3 hotEdge = mix(vec3(1.0,0.95,0.88), temp2color(1.0), 0.5);
  col += hotEdge * innerGlow * innerGlow * 1.0 * uDiskBright;
  // blueshift the approaching limb
  col = mix(col, col*vec3(0.55,0.78,1.6), clamp((doppler-1.0)*1.2, 0.0, 1.0));
  // protect saturation: pull a little colour back out of the near-white core
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.18);

  // wider, smoother outer falloff (0.78 -> 0.62) + turbulence taper toward the
  // rim, so the disk fades into the sky as a clean halo, not a cut-off stipple
  float outerFall = smoothstep(uDiskOuter, uDiskOuter*0.62, r);
  float innerFall = smoothstep(0.0, 0.6, r - uRisco);
  float turbContrast = mix(0.30, 0.70, outerFall);
  float a = innerFall * outerFall * (1.0 - turbContrast + turbContrast*turb)
          * clamp(0.6 + 0.4*uMdot, 0.0, 1.0);
  return vec4(col, clamp(a, 0.0, 1.0));
}

// Schwarzschild light-bending acceleration
vec3 accel(vec3 p, vec3 v){
  vec3 h = cross(p, v);
  float h2 = dot(h, h);
  float r2 = dot(p, p);
  return -1.5 * h2 * p / pow(r2, 2.5);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;

  // camera basis (look at origin)
  vec3 ro = uCam;
  vec3 fwd = normalize(-ro);
  vec3 rgt = normalize(cross(fwd, vec3(0.0,1.0,0.0)));
  vec3 up  = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x*rgt + uv.y*up + 1.5*fwd);

  // jitter the march start by a fraction of the first step so the step lattice
  // decorrelates between neighbours -> no coherent stair-stepping on the arcs
  float jit = ign(gl_FragCoord.xy + fract(uTime) * 17.0);
  float dt0 = clamp(0.055 * length(ro), 0.01, 0.7);
  vec3 p = ro + rd * (jit * dt0);
  vec3 v = rd;
  vec3 color = vec3(0.0);
  float transmit = 1.0;
  float minr = 1e9;
  bool escaped = false;

  // vertical half-thickness of the disk slab (puffs up with accretion rate)
  float slab = mix(0.05, 0.55, clamp(uMdot - 0.5, 0.0, 1.0)) * (uDiskOuter*0.07);

  for(int i=0;i<STEPS;i++){
    float r = length(p);

    // frame-dragging shadow asymmetry: prograde photons (co-rotating with the
    // spin) skim closer before capture; retrograde ones fall sooner. This
    // flattens the shadow on one side — the Kerr signature, approximated.
    float Lz = p.x*v.z - p.z*v.x;                   // angular momentum about spin (y) axis
    float side = clamp(Lz / (length(p.xz)+0.001), -1.0, 1.0);
    float capR = uHorizon * (1.0 - uSpinA * 0.22 * side);
    if(r < capR){ transmit = 0.0; break; }          // event horizon
    if(r > 60.0 && dot(v,p) > 0.0){ escaped = true; break; }   // escaped to sky

    vec3 vIn = v;                                   // direction entering this segment
    float dt = clamp(0.055*r, 0.01, 0.7);
    vec3 a = accel(p, v);
    v = normalize(v + a*dt);
    vec3 pn = p + v*dt;

    // true closest approach: project the origin onto this segment so the photon
    // ring is a continuous function of pixel -> no contour stair-steps
    vec3 seg = pn - p;
    float segl2 = max(dot(seg, seg), 1e-9);
    float tproj = clamp(-dot(p, seg) / segl2, 0.0, 1.0);
    minr = min(minr, min(r, length(p + seg * tproj)));

    // disk crossing (y = 0), thickened by a vertical slab for high mdot.
    // Shade with vIn (the incoming direction) so beaming/redshift don't wobble
    // with the integrator step.
    if(p.y*pn.y < 0.0){
      float k = p.y/(p.y - pn.y);
      vec3 hit = mix(p, pn, k);
      float rd2 = length(hit.xz);
      if(rd2 > uRisco && rd2 < uDiskOuter){
        vec4 dc = diskShade(hit, vIn);
        color += dc.rgb*dc.a*transmit;
        transmit *= (1.0 - dc.a);
      }
    } else if(slab > 0.08 && abs(p.y) < slab){
      // soft volumetric haze above/below the plane (only matters when puffy)
      float rd2 = length(p.xz);
      if(rd2 > uRisco && rd2 < uDiskOuter){
        // jitter sampled height so 1-3 coarse steps don't band on fixed shells
        float jh = (hash(vec3(gl_FragCoord.xy, uTime)) - 0.5);
        float yj = p.y + jh * dt * v.y;
        vec4 dc = diskShade(vec3(p.x, 0.0, p.z), vIn);
        float vfall = exp(-(yj*yj)/(slab*slab)) * 0.30;
        // density per unit length * (dt/slab) -> step-size-independent opacity
        float ha = clamp(dc.a * vfall * (dt / slab), 0.0, 1.0);
        color += dc.rgb*ha*transmit;
        transmit *= (1.0 - ha);
      }
    }
    p = pn;
    if(transmit < 0.02) break;
  }

  // only rays that truly reached the sky see the background
  if(escaped) color += background(v)*transmit;
  // photon ring: rays that grazed the photon sphere and escaped
  if(escaped){
    float ring = smoothstep(0.5, 0.0, abs(minr - uPhotonR));
    color += ring*ring*vec3(1.0,0.93,0.82)*1.7*(0.7+0.5*uMdot);
  }

  // exposure + filmic-ish tonemap
  color *= uExposure;
  color = color/(color+vec3(1.0));
  color = pow(color, vec3(0.4545));
  // TPDF dither in display space (after gamma): scatters the 8-bit rounding
  // error so the smooth disk->sky gradient stops contouring
  color += dither01(gl_FragCoord.xy) * (1.0/255.0);
  gl_FragColor = vec4(color, 1.0);
}
`;

const DEFAULTS = {
  // ---- physical parameters (the "type" of hole) ----
  mass: 6.5,        // log10(M / Msun): ~6.5 supermassive (Gargantua-ish)
  spinA: 0.0,       // Kerr spin parameter a (0..0.998)
  charge: 0.0,      // Reissner-Nordström Q/M (0..1)
  mdot: 1.0,        // accretion rate -> brightness + thickness

  // ---- disk geometry / look ----
  diskInner: 3.0,   // overwritten by ISCO when physics updates
  diskOuter: 14.0,
  diskBright: 1.15,
  bgBright: 0.9,
  exposure: 1.25,
  spin: 1.0,        // disk rotation speed (visual)
  colorTemp: 0.0,   // artistic warm->cold override

  // ---- camera ----
  camDist: 16.0,
  yaw: 0.6,
  pitch: 0.16,      // small tilt -> the iconic over-the-top disk
  resScale: 0.85,   // render below native for perf; CSS upscales
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cbrt = (x) => Math.cbrt(x);

export class BlackHole {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.cfg = { ...DEFAULTS, ...config };
    this.phys = {};
    this.still = !!window.__BH_STILL__;
    this.t0 = performance.now();
    this.running = false;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
            || canvas.getContext('experimental-webgl');
    if (!gl) { this._noWebGL(); return; }
    this.gl = gl;

    this.prog = this._program(VERT, FRAG);
    if (!this.prog) { this._noWebGL(); return; }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    ['uRes','uTime','uCam','uDiskInner','uDiskOuter','uDiskBright','uBgBright',
     'uExposure','uSpin','uColorTemp','uHorizon','uRisco','uPhotonR','uTnorm',
     'uSpinA','uMassTemp','uMdot']
      .forEach((n) => this.u[n] = gl.getUniformLocation(this.prog, n));

    this._physics();
    this._bindPointer();
    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    window.addEventListener('resize', this._resize, { passive: true });
    this._resize();
  }

  ok() { return !!this.gl; }

  /* Derive horizon, ISCO, photon sphere, NT normalisation and disk colour
     from the physical parameters. rs = 1 so M = 0.5; ISCO(a=0) = 3 rs. */
  _physics() {
    const a = clamp(this.cfg.spinA, 0, 0.998);
    const q = clamp(this.cfg.charge, 0, 0.999);

    // Kerr-Newman horizon, in M units r+/M = 1 + sqrt(1 - a^2 - q^2); ×M(=0.5)
    const disc = Math.max(0, 1 - a*a - q*q);
    const horizon = 0.5 * (1 + Math.sqrt(disc));

    // Kerr prograde ISCO (Bardeen), in M units; ×0.5 -> rs units
    const z1 = 1 + cbrt(1 - a*a) * (cbrt(1 + a) + cbrt(1 - a));
    const z2 = Math.sqrt(3*a*a + z1*z1);
    let riscoM = 3 + z2 - Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2*z2)));
    let risco = 0.5 * riscoM * (1 - 0.45*q*q);   // charge pulls ISCO inward too
    risco = Math.max(risco, horizon + 0.05);

    // photon sphere: 1.5 rs (Schwarzschild); nudge in with spin (prograde)
    const photonR = 1.5 - 0.35*a - 0.2*q;

    // normalise Novikov-Thorne profile so its peak (~1.36 r_in) maps to ~1
    const rPeak = (49/36) * risco;
    const tPeak = Math.pow(rPeak, -0.75) * Math.pow(Math.max(0, 1 - Math.sqrt(risco/rPeak)), 0.25);
    const tNorm = tPeak > 1e-6 ? 1 / tPeak : 1;

    // mass -> palette bias: stellar (logM~1) hot/blue, SMBH (logM~9.5) amber
    const massTemp = clamp((9.0 - this.cfg.mass) / 8.0, 0, 1);

    this.phys = { horizon, risco, photonR, tNorm, a, massTemp };
    // the visible inner edge tracks the ISCO so the animation reflects spin/charge
    this.cfg.diskInner = risco;
  }

  _program(vs, fs) {
    const gl = this.gl;
    const c = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const v = c(gl.VERTEX_SHADER, vs), f = c(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    gl.useProgram(p);
    return p;
  }

  _camPos() {
    const { camDist, yaw, pitch } = this.cfg;
    return [
      camDist * Math.cos(pitch) * Math.cos(yaw),
      camDist * Math.sin(pitch),
      camDist * Math.cos(pitch) * Math.sin(yaw),
    ];
  }

  set(key, val) {
    this.cfg[key] = val;
    if (key === 'mass' || key === 'spinA' || key === 'charge') this._physics();
    if (this.still) this._draw();
  }

  _resize() {
    if (!this.gl) return;
    const scale = this.still ? 1.0 : this.cfg.resScale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    if (!this.running) this._draw();
  }

  start() {
    if (!this.gl || this.running) return;
    if (this.still) { this._draw(); return; }
    this.running = true;
    requestAnimationFrame(this._frame);
  }
  stop() { this.running = false; }

  _frame() {
    if (!this.running) return;
    this._draw();
    requestAnimationFrame(this._frame);
  }

  _draw() {
    const gl = this.gl; if (!gl) return;
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.u.uTime, (performance.now() - this.t0) / 1000);
    const cam = this._camPos();
    gl.uniform3f(this.u.uCam, cam[0], cam[1], cam[2]);
    gl.uniform1f(this.u.uDiskInner, this.cfg.diskInner);
    gl.uniform1f(this.u.uDiskOuter, this.cfg.diskOuter);
    gl.uniform1f(this.u.uDiskBright, this.cfg.diskBright);
    gl.uniform1f(this.u.uBgBright, this.cfg.bgBright);
    gl.uniform1f(this.u.uExposure, this.cfg.exposure);
    gl.uniform1f(this.u.uSpin, this.cfg.spin);
    gl.uniform1f(this.u.uColorTemp, this.cfg.colorTemp);
    gl.uniform1f(this.u.uMdot, this.cfg.mdot);
    // derived physics
    gl.uniform1f(this.u.uHorizon, this.phys.horizon);
    gl.uniform1f(this.u.uRisco, this.phys.risco);
    gl.uniform1f(this.u.uPhotonR, this.phys.photonR);
    gl.uniform1f(this.u.uTnorm, this.phys.tNorm);
    gl.uniform1f(this.u.uSpinA, this.phys.a);
    gl.uniform1f(this.u.uMassTemp, this.phys.massTemp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _bindPointer() {
    const cv = this.canvas;
    const ZMIN = 4.0, ZMAX = 90.0;            // wide multiplicative zoom range
    const redraw = () => { if (this.still) this._draw(); };
    const zoomBy = (factor) => { this.cfg.camDist = Math.max(ZMIN, Math.min(ZMAX, this.cfg.camDist * factor)); redraw(); };

    let down = false, lx = 0, ly = 0;
    const dn = (x, y) => { down = true; lx = x; ly = y; };
    const mv = (x, y) => {
      if (!down) return;
      this.cfg.yaw   -= (x - lx) * 0.006;
      this.cfg.pitch = Math.max(-1.45, Math.min(1.45, this.cfg.pitch + (y - ly) * 0.006));
      lx = x; ly = y;
      redraw();
    };
    const up = () => { down = false; };
    cv.addEventListener('mousedown', (e) => dn(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => mv(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);

    // touch: 1 finger orbits, 2 fingers pinch-zoom
    let pinch = 0;
    const pdist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    cv.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) { pinch = pdist(e.touches); down = false; }
      else { const t = e.touches[0]; dn(t.clientX, t.clientY); }
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const d = pdist(e.touches);
        if (pinch > 0 && d > 0) zoomBy(pinch / d);   // spread -> zoom in
        pinch = d;
      } else if (e.touches.length === 1) { const t = e.touches[0]; mv(t.clientX, t.clientY); }
    }, { passive: false });
    cv.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = 0; if (e.touches.length === 0) up(); }, { passive: true });

    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  }

  _noWebGL() {
    const m = document.createElement('div');
    m.className = 'bh-nowebgl';
    m.textContent = 'WebGL is required to render the black hole.';
    this.canvas?.replaceWith(m);
  }
}
