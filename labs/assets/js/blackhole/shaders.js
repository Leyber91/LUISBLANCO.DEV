/* ============================================================
   blackhole/shaders.js — GLSL ES 3.00, assembled from named chunks.

     metric      Kerr-Newman in Kerr-Schild form: ksR(), rhs()   (kerr.js rhs, line for line)
     integrator  RK4 and the step rule                         (kerr.js rk4, stepSize)
     trace       one ray per G-buffer texel, three outputs:
                   G0 = (r_hit, phi_hit, g, code)   code: n >= 0 disk image order,
                                                    -1 captured, -2 escaped
                   G1 = (sky direction xyz, g_sky)
                   G2 = (thin-emission intensity, mu, steps / max, log10 |H|)
     noise, sky, color, emission, tonemap
   Programs: TRACE (expensive, only when geodesics change), SHADE (every frame:
   disk animation, colour modes, stars, annotations) and FINAL (bloom + tone map).
   DIRECT fuses all three for GPUs without float render targets.
   A new metric is a new METRICS entry exposing ksR() and rhs(); a new emission
   model is a new EMISSION entry; neither touches the integrator or the trace loop.
   Every colour constant comes from palette.js: the lab's own marks
   from the tokens that draw them (none gold), the physical maps as
   they were (fix_s2_brief C4; palette.test.mjs reads this GLSL).
   ============================================================ */

import { glslMark, glslConst, PHYSICAL, LAB, DIAG_EXPO, DRIFT_LIMIT } from './palette.js';
import { FLOW } from './flow.js';

const header = `#version 300 es
precision highp float;
precision highp int;
`;

/* ---------------- metric: Kerr-Newman, Kerr-Schild Cartesian ---------------- */
const metricKN = `
uniform float uA;      // spin a/M
uniform float uQ;      // charge Q/M
float ksR(vec3 X){
  float a2 = uA*uA;
  float w = dot(X,X) - a2;
  return sqrt(0.5*(w + sqrt(w*w + 4.0*a2*X.z*X.z)));
}
// Hamilton's equations for H = 1/2 g^mn p_m p_n, g^mn = eta^mn - f k^m k^n.
float rhs(vec3 X, vec3 P, float pt, out vec3 dX, out vec3 dP){
  float a = uA, a2 = a*a, q2 = uQ*uQ;
  float w = dot(X,X) - a2;
  float r2 = 0.5*(w + sqrt(w*w + 4.0*a2*X.z*X.z));
  float r = sqrt(r2);
  float A = r2 + a2;
  float den = r2*r2 + a2*X.z*X.z;
  float iden = 1.0/den;
  float N = 2.0*r2*r - q2*r2;
  float f = N*iden;
  vec3 k = vec3((r*X.x + a*X.y)/A, (r*X.y - a*X.x)/A, X.z/r);
  float L = dot(k,P) - pt;
  dX = P - f*L*k;
  vec3 dr = vec3(X.x*r2*r, X.y*r2*r, X.z*r*A)*iden;
  float Np = 6.0*r2 - 2.0*q2*r;
  vec3 df = (Np*den - N*4.0*r2*r)*iden*iden*dr - vec3(0.0, 0.0, N*2.0*a2*X.z*iden*iden);
  float cS = (X.x*P.x + X.y*P.y - 2.0*r*(k.x*P.x + k.y*P.y))/A - P.z*X.z/r2;
  vec3 dS = cS*dr + vec3((r*P.x - a*P.y)/A, (r*P.y + a*P.x)/A, P.z/r);
  dP = 0.5*L*L*df + f*L*dS;
  return r;
}
float hamiltonian(vec3 X, vec3 P, float pt){
  float a = uA, a2 = a*a;
  float r = ksR(X), r2 = r*r, A = r2 + a2;
  float f = r2*(2.0*r - uQ*uQ)/(r2*r2 + a2*X.z*X.z);
  vec3 k = vec3((r*X.x + a*X.y)/A, (r*X.y - a*X.x)/A, X.z/r);
  float L = dot(k,P) - pt;
  return 0.5*(-pt*pt + dot(P,P) - f*L*L);
}
// Prograde circular equatorial orbit of Kerr-Newman (BL r): Omega, u^t.
vec2 circularOrbit(float r){
  float a = uA, q2 = uQ*uQ;
  float w = sqrt(max(r - q2, 1e-6));
  float Om = w/(r*r + a*w);
  float F = (2.0*r - q2)/(r*r);
  float gtt = -(1.0 - F), gtp = -a*F, gpp = r*r + a*a + a*a*F;
  float N = -(gtt + 2.0*Om*gtp + Om*Om*gpp);
  return vec2(Om, 1.0/sqrt(max(N, 1e-8)));
}
// ZAMO lapse and frame-dragging rate in the equatorial plane.
vec2 zamoEq(float r){
  float a = uA, q2 = uQ*uQ;
  float D = r*r - 2.0*r + a*a + q2;
  float S = (r*r + a*a)*(r*r + a*a) - a*a*D;
  return vec2(sqrt(max(D*r*r/S, 1e-10)), a*(2.0*r - q2)/S);
}
`;

/* ---------------- integrator ---------------- */
const integrator = `
uniform float uRh;     // outer horizon
uniform float uK;      // step constant
uniform int uMaxSteps;
float stepSize(float r){ return uK*max(r - 0.92*uRh, 0.04)*clamp(r/3.0, 0.45, 1.0) + 0.002; }
void rk4(inout vec3 X, inout vec3 P, float pt, float h){
  vec3 dx1, dp1, dx2, dp2, dx3, dp3, dx4, dp4;
  rhs(X, P, pt, dx1, dp1);
  rhs(X + 0.5*h*dx1, P + 0.5*h*dp1, pt, dx2, dp2);
  rhs(X + 0.5*h*dx2, P + 0.5*h*dp2, pt, dx3, dp3);
  rhs(X + h*dx3, P + h*dp3, pt, dx4, dp4);
  X += (h/6.0)*(dx1 + 2.0*dx2 + 2.0*dx3 + dx4);
  P += (h/6.0)*(dp1 + 2.0*dp2 + 2.0*dp3 + dp4);
}
`;

/* ---------------- emission chunks used inside the trace ---------------- */
const emissionTrace = `
uniform float uRin, uRout;  // disk annulus (BL r)
uniform int uEmit;          // 0 off, 1 optically thick NT disk, 2 optically thin equatorial emitter
// redshift factor for an emitter in the plane at r: circular orbit outside the ISCO,
// a zero-angular-momentum emitter inside it (illustrative for the thin model)
float emitterG(float r, float pt, float pphi){
  if (r >= uRin) {
    vec2 c = circularOrbit(r);
    return 1.0/(c.y*(-pt - c.x*pphi));
  }
  vec2 z = zamoEq(r);
  return z.x/(-pt - z.y*pphi);
}
// optically thin emissivity: j ~ r^-2 between 1.05 r_h and the outer edge (illustrative)
float thinJ(float r){
  float inner = smoothstep(uRh*1.02, uRh*1.25, r);
  float outer = 1.0 - smoothstep(uRout*0.7, uRout, r);
  return inner*outer*36.0/(r*r);
}
`;

/* ---------------- the trace ---------------- */
const trace = `
uniform vec4 uCU, uCR, uCUp, uCF;   // observer frame covectors (t,x,y,z)
uniform vec3 uCamPos;
uniform float uREsc;
uniform vec2 uOrigin, uStepX, uStepY, uJit;   // texel -> tangent-plane screen coordinates
#define MAXLOOP 720
void traceRay(vec2 frag, out vec4 G0, out vec4 G1, out vec4 G2){
  vec2 s = uOrigin + (frag.x + uJit.x)*uStepX + (frag.y + uJit.y)*uStepY;
  vec3 n = normalize(vec3(s, 1.0));
  vec4 p4 = uCU + n.x*uCR + n.y*uCUp + n.z*uCF;
  float pt = p4.x;
  vec3 P = p4.yzw;
  vec3 X = uCamPos;
  float pphi = X.x*P.y - X.y*P.x;          // conserved axial angular momentum
  G0 = vec4(0.0, 0.0, 0.0, -1.0);
  G1 = vec4(0.0);
  float thin = 0.0, mu = 0.0, ncross = 0.0;
  int steps = 0;
  for (int i = 0; i < MAXLOOP; i++) {
    if (i >= uMaxSteps) break;
    steps = i;
    float r = ksR(X);
    if (r < uRh*0.98) { G0.w = -1.0; break; }
    if (r > uREsc && dot(X, P) > 0.0) {
      G0.w = -2.0;
      G1 = vec4(normalize(vec3(P.x, -P.y, P.z)), 1.0/max(-pt, 1e-4));
      break;
    }
    float h = stepSize(r);
    vec3 X0 = X, P0 = P;
    rk4(X, P, pt, h);
    if (X0.z*X.z < 0.0) {
      // land on the plane: redo the step with the fraction that reaches z = 0
      float t = X0.z/(X0.z - X.z);
      vec3 Xc = X0, Pc = P0;
      rk4(Xc, Pc, pt, h*t);
      float rc = sqrt(max(Xc.x*Xc.x + Xc.y*Xc.y - uA*uA, 0.0));
      if (uEmit == 1 && rc >= uRin && rc <= uRout) {
        float g = emitterG(rc, pt, pphi);
        G0 = vec4(rc, -atan(Xc.y, Xc.x), g, ncross);
        // cosine of the emission angle to the disk normal in the emitter frame:
        // at z = 0 the KS z-direction is a unit spacelike normal, so mu = |p_z| g
        mu = clamp(abs(Pc.z)*g, 0.0, 1.0);
        X = Xc; P = Pc;
        break;
      }
      if (uEmit == 2 && rc > uRh*1.02 && rc <= uRout) {
        float g = emitterG(rc, pt, pphi);
        thin += thinJ(rc)*g*g*g;                 // I_nu ~ g^3 j_nu, flat spectrum
        if (G0.x == 0.0) G0.xyz = vec3(rc, -atan(Xc.y, Xc.x), g);
      }
      ncross += 1.0;
    }
  }
  float H = abs(hamiltonian(X, P, pt));
  G2 = vec4(thin, mu, float(steps)/float(uMaxSteps), log(H + 1e-12)/log(10.0));
}
`;

/* ---------------- noise ---------------- */
const noise = `
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y)*p.z); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
`;

/* ---------------- colour: blackbody table ---------------- */
const color = `
uniform sampler2D uLUT;      // 256 x 1: rgb chromaticity (Y = 1), a = log10 visible fraction
uniform vec2 uLogT;          // (log10 T0, log10 T1) of the table
vec4 bb(float T){
  float u = clamp((log(max(T, 1.0))/log(10.0) - uLogT.x)/(uLogT.y - uLogT.x), 0.0, 1.0);
  return texture(uLUT, vec2(u*(255.0/256.0) + 0.5/256.0, 0.5));
}
`;

/* ---------------- sky ---------------- */
const sky = `
uniform float uPixAng;      // radians per G-buffer texel at the screen centre
uniform float uAz;          // camera azimuth (rad): the scene turns, the geodesics do not
uniform float uSkyGain;
vec3 rotZ(vec3 d, float a){ float c = cos(a), s = sin(a); return vec3(c*d.x - s*d.y, s*d.x + c*d.y, d.z); }
vec3 starLayer(vec3 d, float sc, float density, float bright){
  vec3 p = d*sc;
  vec3 id = floor(p);
  float h = hash13(id);
  if (h > density) return vec3(0.0);
  vec3 jit = vec3(hash13(id + 11.3), hash13(id + 23.7), hash13(id + 37.1));
  vec3 sd = normalize(id + 0.2 + 0.6*jit);
  float sig = max(uPixAng*0.75, 0.00004);
  float dd = length(d - sd);
  float m = exp(-0.5*dd*dd/(sig*sig));
  float mag = pow(hash13(id + 5.9), 7.0);          // a few bright, many faint
  float T = mix(3200.0, 12000.0, pow(hash13(id + 71.0), 1.6));
  vec3 c = mix(vec3(1.0), bb(T).rgb, 0.65);
  // keep total flux fixed when the star is smaller than a texel
  float scale = min(1.0, (0.0009*0.0009)/(sig*sig));
  return c*m*bright*(0.08 + 3.2*mag)*mix(1.0, scale, 0.6);
}
vec3 skyColor(vec3 dir, float gsky){
  vec3 d = rotZ(dir, uAz);
  vec3 c = vec3(0.0);
  c += starLayer(d, 70.0, 0.03, 1.0);
  c += starLayer(d, 190.0, 0.018, 0.5);
  c += starLayer(d, 520.0, 0.01, 0.28);
  // a faint band across the sky so its lensed image shows the bending (illustrative)
  vec3 bandN = normalize(vec3(0.35, 0.6, 0.72));
  float b = dot(d, bandN);
  float band = exp(-b*b/0.03)*(0.5 + 0.8*fbm(d*7.0));
  c += ${glslConst(LAB.skyBand)}*band*0.016;
  // hovering deep in the well the whole sky is blueshifted and brightened (g_sky^4)
  float gs = clamp(gsky, 0.2, 4.0);
  return c*uSkyGain*gs*gs*gs*gs;
}
`;

/* ---------------- emission: optically thick Novikov-Thorne disk ---------------- */
const emissionShade = `
uniform sampler2D uProfile;  // T/T_peak on u = sqrt((r - rin)/(rout - rin))
uniform float uTime;         // animation time in M
uniform float uTdisp;        // display temperature of the peak (thermal mode), K
uniform float uTpeakK;       // physical peak temperature, K (true colour mode)
uniform float uFcol;         // colour-correction factor (true colour)
uniform float uStretch;      // display stretch exponent
uniform float uIgnite;       // 0..1 the disk fading in on load, everywhere at once
uniform float uCycle;        // M a copy of the disk's pattern is carried along the orbits (flow.js flowCycle)
uniform vec3 uHot;           // hot spot: (r, phi(t), on)
uniform int uMode;           // 0 thermal 1 true 2 redshift 3 order 4 steps
float profileT(float r){
  float u = sqrt(clamp((r - uRin)/(uRout - uRin), 0.0, 1.0));
  return texture(uProfile, vec2(u*(511.0/512.0) + 0.5/512.0, 0.5)).r;
}
// one copy of the disk's pattern at an angle in the co-moving frame, from one of flow.js's seeds (illustrative structure)
float diskPattern(float ang, float lr, float seed){
  vec3 p = vec3(cos(ang)*5.5, sin(ang)*5.5, lr*16.0) + vec3(seed*13.7, seed*7.9, 0.0);   // seeds far apart: independent copies
  float body = fbm(p*vec3(1.0, 1.0, 0.5));
  float ridge = 1.0 - abs(2.0*fbm(p*vec3(1.7, 1.7, 1.3) + 4.0) - 1.0);   // filaments
  float lanes = 0.5 + 0.5*sin(lr*42.0 + 3.0*body);                         // thin lanes along the orbits
  return 0.30 + 1.05*body*body*2.0*(0.55 + 0.75*ridge*ridge) * (0.75 + 0.35*lanes);
}
float turbulence(float r, float phiW){
  // Each annulus turns at its own Kerr orbital frequency. One pattern carried along wound into rings finer than the
  // pixels, and a turning spiral read as the disk expanding and contracting (2026-11-18). Two copies are carried, each
  // for one cycle from a fresh seed, and crossfaded with the copy at its reset weighing nothing (flow.js flowPhases,
  // line for line; Neyret 2003), so the shear stays bounded and an inner feature is seen going round.
  float Om = circularOrbit(max(r, uRin)).x;
  float lr = log(r);
  float T = uCycle;
  float c0 = floor(uTime/T), c1 = floor(uTime/T + 0.5);
  float t0 = uTime - c0*T, t1 = uTime + 0.5*T - c1*T;
  float w0 = 1.0 - abs(2.0*t0/T - 1.0), w1 = 1.0 - w0;
  float v0 = diskPattern(phiW - Om*t0, lr, mod(c0*2.0, ${FLOW.seeds.toFixed(1)}));
  float v1 = diskPattern(phiW - Om*t1, lr, mod(c1*2.0 + 1.0, ${FLOW.seeds.toFixed(1)}));
  // two independent copies blended around the pattern's own mean, their spread kept (flow.js flowBlend)
  float m = ${FLOW.patternMean.toFixed(4)};
  return max(0.05, m + (w0*(v0 - m) + w1*(v1 - m))*inversesqrt(w0*w0 + w1*w1 + ${(2 * FLOW.copyCorrelation).toFixed(4)}*w0*w1));
}
vec3 diskColor(vec4 g0, vec4 g2){
  float r = g0.x, phiW = g0.y + uAz, g = max(g0.z, 1e-3);
  float n = g0.w;
  float Tn = profileT(r);
  float tob = g*Tn;                                   // observed T / T_peak
  float limb = (1.0 + 2.06*g2.y)/3.06*1.5;            // Chandrasekhar electron-scattering limb law
  float turb = turbulence(r, phiW);
  float ign = smoothstep(0.0, 1.0, uIgnite);          // in place: lit from the ISCO outward, it read as the disk expanding
  float outer = 1.0 - smoothstep(uRout*0.72, uRout, r);
  float spot = 0.0;
  if (uHot.z > 0.5) {
    float d2 = r*r + uHot.x*uHot.x - 2.0*r*uHot.x*cos(phiW - uHot.y);
    spot = exp(-d2/0.5);
  }
  vec3 col;
  if (uMode == 1) {
    float Tc = uFcol*uTpeakK*tob;
    vec4 b = bb(Tc), b0 = bb(uFcol*uTpeakK);
    float I = pow(tob, 4.0)*pow(10.0, b.a - b0.a);    // visible luminance of the observed blackbody
    col = b.rgb*pow(max(I, 0.0), uStretch);
  } else if (uMode == 2) {
    // diverging map of g: amber below 1 (redshift), blue-white above (blueshift), dim grey at 1
    float x = clamp((g - 1.0)/0.5, -1.0, 1.0);
    vec3 warm = ${glslConst(PHYSICAL.redshiftWarm.rgb)}, cold = ${glslConst(PHYSICAL.redshiftCold.rgb)};
    col = mix(${glslConst(PHYSICAL.redshiftMid.rgb)}, (x < 0.0 ? warm : cold)*0.85, pow(abs(x), 0.7))*(0.55 + 0.45*Tn);
  } else if (uMode == 3) {
    // image order in the ink ladder (palette.js MARKS): n = 0 --text-dim, n = 1 --text-bright, n >= 2 --horizon,
    // each at most its token (the temperature dims it), with no limb law, so the legend's swatch is the colour seen
    vec3 c0 = ${glslMark('order0', DIAG_EXPO)}, c1 = ${glslMark('order1', DIAG_EXPO)}, c2 = ${glslMark('order2', DIAG_EXPO)};
    col = (n < 0.5 ? c0 : (n < 1.5 ? c1 : c2))*(0.55 + 0.45*Tn);
  } else {
    vec4 b = bb(uTdisp*tob);
    float I = pow(tob, 4.0);                          // bolometric I = g^4 I_emit
    col = b.rgb*pow(I, uStretch);
  }
  col *= (uMode == 3 ? 1.0 : limb)*(uMode >= 2 ? 1.0 : turb)*ign*outer;
  col += spot*${glslConst(PHYSICAL.hotSpot.rgb)}*pow(max(g, 0.0), 4.0)*1.6*ign;
  return col;
}
vec3 thinColor(float I){
  // optically thin emitter, displayed as a warm intensity map (illustrative)
  float v = pow(max(I, 0.0)*0.11, uStretch);
  return ${glslConst(PHYSICAL.thin.rgb)}*v + ${glslConst(PHYSICAL.thinTop.rgb)}*max(v - 0.8, 0.0)*0.9;
}
vec3 stepsColor(vec4 g2){
  float s = g2.z;
  vec3 c = mix(${glslConst(LAB.stepsFloor)}, ${glslMark('steps', DIAG_EXPO)}, pow(s, 0.6));
  // a drift above the limit is a failure of the integrator: --danger, flat, its words in the legend (palette.js)
  if (g2.w > ${Math.log10(DRIFT_LIMIT).toFixed(1)}) c = ${glslMark('drift', DIAG_EXPO)};
  return c;
}
`;

/* ---------------- tone map ---------------- */
const tonemap = `
vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0.0, 1.0); }  // Narkowicz 2015
vec3 toSRGB(vec3 c){ return mix(12.92*c, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float ign2(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

/* ---------------- programs ---------------- */

export const VERT = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const METRICS = { kn: metricKN };
export const EMISSION = { trace: emissionTrace, shade: emissionShade };

export function traceProgram(metric = 'kn') {
  return header + METRICS[metric] + integrator + EMISSION.trace + trace + `
layout(location = 0) out vec4 oG0;
layout(location = 1) out vec4 oG1;
layout(location = 2) out vec4 oG2;
void main(){ traceRay(gl_FragCoord.xy, oG0, oG1, oG2); }
`;
}

const shadeCore = `
uniform int uNotes;
uniform float uHL;            // highlighted radius (0 = none)
vec3 shadeTexel(vec4 g0, vec4 g1, vec4 g2){
  vec3 col = vec3(0.0);
  if (uMode == 4) return stepsColor(g2);
  if (g0.w >= 0.0 && uEmit == 1) col = diskColor(g0, g2);
  else if (g0.w < -1.5) col = skyColor(g1.xyz, g1.w);
  if (uEmit == 2) col += thinColor(g2.x);
  return col;
}
`;

export function shadeProgram(metric = 'kn') {
  return header + METRICS[metric] + `uniform float uRh;\n` + emissionTrace.replace(/float emitterG[\s\S]*$/, '') + noise + color + sky + EMISSION.shade + shadeCore + `
uniform sampler2D uG0, uG1, uG2;
uniform float uScale;         // G-buffer texels per output pixel
uniform int uSS;              // supersamples per axis
uniform ivec2 uGSize;
uniform float uExpo;
out vec4 oColor;
void main(){
  vec2 base = (gl_FragCoord.xy - 0.5)*uScale;
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
    if (i >= uSS || j >= uSS) continue;
    ivec2 tc = clamp(ivec2(base + (vec2(i, j) + 0.5)*uScale/float(uSS)), ivec2(0), uGSize - 1);
    acc += shadeTexel(texelFetch(uG0, tc, 0), texelFetch(uG1, tc, 0), texelFetch(uG2, tc, 0));
  }
  vec3 col = acc/float(uSS*uSS)*uExpo;
  // annotation layer: the annulus a visitor points at. The shadow's edge (telescope view) is drawn by the overlay from
  // traced points (probe.js outline); the per-texel edge and ISCO lines that sat on the black's rim are gone
  // (2026-11-18)
  if (uNotes == 1) {
    ivec2 c0 = clamp(ivec2(base + 0.5*uScale), ivec2(0), uGSize - 1);
    int st = max(1, int(uScale + 0.5));
    vec4 m = texelFetch(uG0, c0, 0);
    vec4 nx = texelFetch(uG0, clamp(c0 + ivec2(st, 0), ivec2(0), uGSize - 1), 0);
    vec4 ny = texelFetch(uG0, clamp(c0 + ivec2(0, st), ivec2(0), uGSize - 1), 0);
    if (m.w > -0.5 && m.w < 0.5) {
      float dr = max(abs(m.x - nx.x)*step(-0.5, nx.w), abs(m.x - ny.x)*step(-0.5, ny.w)) + 1e-4;
      // in ink, never gold (palette.js MARKS)
      if (uHL > 0.0 && abs(m.x - uHL) < dr*0.9 && dr < 0.6) col = mix(col, ${glslMark('annulus')}, 0.9);
    }
  }
  oColor = vec4(col, 1.0);
}
`;
}

export const FINAL = header + tonemap + `
uniform sampler2D uHDR;
uniform vec2 uRes;
uniform float uBloom;
uniform float uFrame;
out vec4 oColor;
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec3 c = textureLod(uHDR, uv, 0.0).rgb;
  vec3 bl = vec3(0.0);
  float w = 0.0;
  for (int l = 1; l <= 6; l++) {
    float wl = 1.0/float(l);
    bl += wl*max(textureLod(uHDR, uv, float(l)).rgb - 0.85, 0.0);   // only physically bright pixels bloom
    w += wl;
  }
  c += uBloom*bl/w;
  vec2 q = uv - 0.5;
  c *= 1.0 - 0.28*dot(q, q);                                       // gentle vignette
  vec3 o = toSRGB(aces(c));
  o += (ign2(gl_FragCoord.xy + uFrame*7.0) - 0.5)/255.0;           // dither against banding
  oColor = vec4(o, 1.0);
}
`;

/** Fallback for GPUs without float render targets: trace, shade and tone map per pixel. */
export function directProgram(metric = 'kn') {
  return header + METRICS[metric] + integrator + EMISSION.trace + trace + noise + color + sky + EMISSION.shade + shadeCore + tonemap + `
uniform float uExpo;
uniform float uFrame;
out vec4 oColor;
void main(){
  vec4 g0, g1, g2;
  traceRay(gl_FragCoord.xy, g0, g1, g2);
  vec3 c = toSRGB(aces(shadeTexel(g0, g1, g2)*uExpo));
  oColor = vec4(c + (ign2(gl_FragCoord.xy + uFrame*7.0) - 0.5)/255.0, 1.0);
}
`;
}
