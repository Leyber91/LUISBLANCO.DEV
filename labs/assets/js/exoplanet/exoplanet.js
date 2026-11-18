/* ============================================================
   exoplanet.js — a ray-traced procedural exoplanet seen through a
   starship viewport.

   Raw WebGL1, one full-screen fragment shader (no Three.js).

   WHAT THE PICTURE IS MADE OF
   A world is one of seven looks, chosen from its numbers in
   data.js (lookOf): seas and bare land under cloud, a thin-air
   desert, an unbroken cloud deck, an ice shell, airless cratered
   rock, a molten day side, or cloud tops with no surface under
   them. Each look is one material below.

   HOW THE IMAGE IS FORMED
   - Light: Lambert's cosine from a star that is a disc, so the
     terminator is as soft as the star is wide in that sky. Dusty
     regolith is shaded by the Lommel-Seeliger law mixed 0.6 with
     Lambert's. Nothing lights a night side but its own heat.
   - Air: single scattering, Rayleigh and haze, integrated along
     each ray with a Chapman air mass toward the star. Each look
     has a vertical optical depth (Earth's, for a temperate
     world; chosen for the others, see data.js air). The shell is
     not drawn to scale: a thin one is stretched so that it
     covers a pixel (Earth's 4 times, Jupiter's 11), between
     0.0025 and 0.03 radii per e-folding. The vertical depth is
     kept; slant paths through a stretched shell are shorter than
     the true ones, so twilight is brighter and bluer than it
     would be. Nothing paints a ring: the blue limb, the red
     terminator and the thin line over the horizon are what the
     integral gives.
   - Heat: a molten or airless rock, or the cloud tops of a fluid
     world, whose hottest point is above 750 K gives its own
     light, by Wien's law per channel, as bright against the
     starlight as a surface in equilibrium with its star.
   - Film: a filmic curve, then the sRGB transfer. No bloom on the
     planet, no vignette, no nebula. The stars behind are faint,
     because a camera exposed for a sunlit world sees few. From
     orbit every world is exposed for its own star's light and
     by the same amount, so a dark world is dark. On the ground
     the exposure follows the light on the ground, as an eye
     does, by up to six times.

   The host star is a disc of its angular size, never drawn under
   0.004 rad (a quarter of a degree) so that it stays visible:
   from the orbit of Jupiter the Sun would be drawn 4.5 times too
   wide. You can orbit to find it, or land and see it in the sky.

   Performance: octave LOD by apparent size. The shader is built
   in pieces, each only when it is first needed: one orbit
   program per look, and the ground program when the visitor
   lands. Chrome kept the built programs on the test machine (a
   second build took under a second); other browsers may not.

   Units: planet radius = 1.
   API: new Exoplanet(canvas); .load(params); .start()/.stop();
        .set(k,v); .surface(on); drag to orbit, wheel to zoom.
   ?still (window.__EXO_STILL__) renders a single frame.
   ============================================================ */

import { HOME, orbitDir, pitchMax, touchTurns } from './orbit.js';

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform vec2  uShift;        // principal-point offset in pixels: centres the world in the free column
uniform float uTime;
uniform vec3  uCam;
uniform vec3  uFwd;
uniform float uFov;
uniform float uExposure;
uniform float uRaw;          // 1: skip the film and write the linear picture (tools/dev/planet_sheet.html measures it)

uniform vec3  uLightDir;
uniform vec3  uStarColor;
uniform vec3  uStarSurf;     // vivid blackbody for the star disk
uniform float uStarAngle;
uniform float uStarActivity; // flares / prominences (high for red dwarfs)
uniform float uStarSpots;    // starspot coverage
uniform float uStarTeff;     // effective temperature (K) — convection/chromosphere driver
uniform vec3  uStarSpin;     // unit spin axis — corona streamer/plume morphology
uniform float uLightMul;
uniform float uBgBright;

uniform int   uType;         // the look: 0 temperate · 1 fluid · 2 ice · 3 molten · 4 airless · 5 desert · 6 shrouded (read on the ground; from orbit the look is compiled in, see EXO_LOOK)
uniform int   uIsGasGiant;
uniform int   uLocked;       // 1: one face always to the star
uniform int   uSurfaceMode;  // 1 on the ground, 2 on a low pass: both hold the horizon level
uniform float uSeed;
uniform float uSpin;
uniform float uSeaLevel;
uniform float uContFreq;
uniform float uMtnFreq;
uniform float uBump;
uniform float uTempBias;
uniform float uIceCap;
uniform float uLife;
uniform vec3 uPlant;   // the cover's albedo when uLife > 0 (life.js, the rules' colour for this star)
uniform float uCloud;
uniform float uBandFreq;
uniform float uBandContrast; // how hard the belts and zones differ
uniform float uStorm;        // strength of the one long-lived oval
uniform float uCrater;       // how much impact cratering the ground keeps
uniform vec3  uColA;         // the look's bright ground or cloud
uniform vec3  uColB;         // its dark ground or cloud
uniform vec3  uColC;         // an accent: frost, fresh ejecta, a storm
uniform vec3  uGlow;         // thermal light of a surface at uGlowT (a white sunlit surface = 1)
uniform float uGlowT;        // kelvin; 0 when the world is too cool to glow
uniform float uTsub;         // temperature of the hottest point
uniform float uTnight;       // and of the coldest

// atmosphere
uniform float uAtmR;         // top of the drawn shell
uniform float uHvis;         // drawn scale height (planet radii)
uniform vec3  uTauR;         // vertical Rayleigh optical depth at 610, 550, 465 nm
uniform float uTauM;         // vertical optical depth of haze
uniform vec3  uHazeCol;      // what the haze scatters
uniform float uMieG;
uniform float uHasAtmo;

// perf LOD
uniform int   uOctaves;
uniform float uLastAmp;

// procedural explorable surface (radially-displaced unit sphere)
uniform float uAmp;          // relief amplitude (planet radii)
uniform int   uTerrStyle;    // 0 rocky/mtn · 1 dune · 2 glacier · 3 lava · 4 cratered
uniform float uSeaY;         // sea height in relief units (-1 = no sea)
uniform float uTfreeze;      // snow-line driver
uniform float uGRel;         // surface gravity (Earth=1) — high g flattens relief
uniform int   uMarchSteps;
uniform int   uShadowSteps;

#define PI 3.14159265359

// ---------- noise ----------
float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
// LOD fbm: octave count from uniform, last octave crossfaded (no pop on zoom)
float fbm(vec3 p){
  float a=0.5, s=0.0;
  for(int i=0;i<8;i++){
    if(i>=uOctaves) break;
    float amp = (i==uOctaves-1) ? a*uLastAmp : a;
    s += amp*vnoise(p);
    p = p*2.03+1.1; a*=0.5;
  }
  return s;
}
float fbm3(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+1.1; a*=0.5; } return s; }
float ridged(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ float n=1.0-abs(vnoise(p)*2.0-1.0); s+=a*n*n; p=p*2.07+0.7; a*=0.5; } return s; }
// single domain warp -> continents (was a triple warp ~9 fbm)
float terrain(vec3 p){
  vec3 q = vec3(fbm3(p+1.7), fbm3(p+9.2), fbm3(p+4.3));
  return fbm(p + 2.5*q);
}
mat3 rotY(float a){ float s=sin(a), c=cos(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }

// ============================================================================
// VOLUMETRIC HOST STAR (exomania-volumetric-star research workflow).
// Star-local ray reconstruction -> analytic shell/photosphere intersects ->
// front-to-back emission-absorption march through a 3D corona+chromosphere
// density field. Streamers / prominences / coronal holes EMERGE from the field
// and parallax for real as the camera orbits. Allen K-corona radial law;
// current-sheet helmet streamers; Teff + activity drive the morphology.
// ============================================================================
const vec3 HALPHA = vec3(1.0, 0.16, 0.13);          // 656.3 nm chromosphere/prominence red

// interleaved-gradient noise — jitter the march start to kill banding
float ign(vec2 px){ return fract(52.9829189*fract(dot(px, vec2(0.06711056,0.00583715)))); }

// the star's OWN fixed-octave fbm — NOT fbm() (that is gated by the planet's uOctaves LOD)
float sfbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+1.1; a*=0.5; } return s; }

// Allen/Baumbach K-corona electron density, renormalized to n(1)=1
float neRadial(float r){ return 0.653*pow(r,-16.0) + 0.339*pow(r,-6.0) + 0.0079*pow(r,-1.5); }

// 3D density/emission field (star-local R*). .x = white corona + chromosphere, .y = H-alpha plasma
vec2 starDensity(vec3 p, float r, vec3 A, float mag, float act, float conv){
  vec3  u    = p / r;
  float lat2 = dot(u, A) * dot(u, A);
  float nR   = neRadial(r);
  // helmet streamers along a tilted, fbm-warped current sheet
  float zc   = dot(p, A);
  vec3  perp = p - A*zc;
  float warp = 0.30*(sfbm(0.6*perp + 13.0)*2.0 - 1.0);
  float dSheet = abs(zc - warp*r);
  float w    = 0.06*r + 0.05;
  float beltW= mix(0.20, 1.0, act);
  float belt = 1.0 - smoothstep(0.0, beltW, lat2);
  float streak = ridged(p*7.0 + A*2.0);
  streak = mix(streak, streak*streak, act);
  float streamer = (3.0 + 5.0*act) * belt * exp(-(dSheet*dSheet)/(w*w)) * (0.45 + 0.85*streak);
  // coronal holes (polar depletion when quiet) + polar plumes
  float hole  = mix(mix(0.12, 1.0, smoothstep(0.55, 0.80, 1.0 - lat2)), 1.0, act);
  float plume = smoothstep(0.50, 0.85, lat2) * (0.5 + 0.5*ridged(8.0*u + A*4.0)) * exp(-(r-1.0)/0.5);
  float turb  = 1.0 + 0.28*(sfbm(2.5*p) - 0.5);
  float corona = nR * hole * turb * (1.0 + mag*(streamer + 0.6*plume));
  // chromosphere thin red shell
  float chromo = 0.0;
  if(r < 1.05){ chromo = exp(-(r-1.0)/0.012) * (0.5 + 0.5*sfbm(p*60.0)) * conv; }
  // prominence loops standing off the limb on the closed-field belt
  float promH = mix(0.05, 0.40, act);
  float prom  = belt * smoothstep(0.55, 0.82, ridged(p*5.5 + A*0.4))
              * smoothstep(1.0, 1.0+promH, r) * smoothstep(1.0+promH+0.05, 1.0, r)
              * mag * (0.5 + 0.6*clamp(uStarSpots,0.0,1.0));
  return vec2(max(corona, 0.0), max(chromo + 3.0*prom, 0.0));
}

vec3 renderStar(vec3 d){
  vec3  S    = normalize(uLightDir);
  float aR   = max(uStarAngle, 1e-3);
  vec3  base = uStarSurf;

  // PSF bloom — computed for EVERY ray and fading smoothly to ~0, so the star's
  // brightness has NO edge. Added BEFORE the shell early-out (which used to return
  // black beyond the corona radius and clip the glow into a circle).
  float ang = acos(clamp(dot(d, S), -1.0, 1.0));
  // glare is a property of the eye or the lens, not of the star: past the disc's edge it falls off
  // over a fixed angle (0.025 rad at most), so a star that fills a third of the sky does not fog all of it
  float gr  = (ang <= aR) ? ang / aR : 1.0 + (ang - aR)/min(aR, 0.025);
  float bloom = 4.0*exp(-gr*gr*0.5) + (1.5*exp(-gr*1.0) + 0.5/(1.0 + gr*gr*8.0))*exp(-ang*1.6);
  vec3  col = base*bloom + base*exp(-ang*ang*3000.0)*0.4;

  // spectral-type gates
  float teff = clamp(uStarTeff, 2400.0, 45000.0);
  float hot  = smoothstep(3000.0, 9000.0, teff);
  float act  = clamp(uStarActivity, 0.0, 1.0);
  float conv = 1.0 - smoothstep(6200.0, 7200.0, teff);
  float mag  = act * conv;

  // 1) star-local ray for the volumetric part (camera at D = 1/sin(angRadius))
  float D  = 1.0 / max(sin(aR), 4e-3);
  vec3  ro = -S * D;
  vec3  rd = d;
  float b  = dot(ro, rd);
  float r2 = dot(ro, ro);

  // 2) outer corona shell intersect — MISS = just the smooth bloom (no black, no edge)
  float R_OUT = min(mix(2.6, 4.0, act), 0.85*D);   // never around the camera: a world inside its star's corona would see all its sky lit
  float discC = b*b - (r2 - R_OUT*R_OUT);
  if(discC < 0.0) return col * uLightMul;
  float hC = sqrt(discC);
  float t0 = max(-b - hC, 0.0);
  float t1 =     -b + hC;

  // 3) photosphere (opaque) analytic stop
  float discP   = b*b - (r2 - 1.0);
  bool  hitDisk = discP > 0.0;
  float tPhoto  = -b - sqrt(max(discP, 0.0));
  float tEnd    = hitDisk ? min(t1, tPhoto) : t1;
  if(tEnd <= t0) return col * uLightMul;

  // spin/dipole frame (decoupled from view -> real parallax)
  vec3 A = uStarSpin;
  if(dot(A,A) < 1e-4) A = vec3(0.0,1.0,0.0);
  if(abs(dot(A,S)) > 0.99) A = abs(S.x) < 0.9 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
  A = normalize(A);

  // 4) volumetric emission-absorption march (LOD steps by apparent size)
  int   STEPS = aR < 0.02 ? 16 : (aR < 0.08 ? 28 : 40);
  float dt  = (tEnd - t0) / float(STEPS);
  float jit = ign(gl_FragCoord.xy + fract(uTime)*17.0);
  float t   = t0 + jit*dt;
  float T   = 1.0;                 // col already holds the bloom; march adds on top
  vec3  corTint = mix(base, vec3(1.0), 0.6);          // K-corona is Thomson-flat (near white)
  float kK = 0.55 * mix(0.25, 1.0, act);
  float kH = 2.2;

  for(int i=0; i<40; i++){
    if(i >= STEPS) break;
    if(t > tEnd || T < 0.01) break;
    vec3  p = ro + rd*t;
    float rr = length(p);
    if(rr < 1.0){ t += dt; continue; }
    vec2  dn = starDensity(p, rr, A, mag, act, conv);
    vec3  emit = (dn.x * corTint * kK) + (dn.y * HALPHA * kH);
    col += T * emit * dt;
    T   *= exp(-dn.y * 4.0 * dt);                      // mild self-extinction (dark filaments)
    t   += dt;
  }

  // 5) opaque photosphere floor: limb-darkened blackbody + granulation + spots + faculae
  if(hitDisk && T > 0.001){
    vec3  ph = ro + rd*tPhoto;
    vec3  n  = normalize(ph);
    float mu = clamp(dot(n, -rd), 0.0, 1.0);
    float gfreq = mix(26.0, 60.0, hot);
    float g1 = sfbm(n*gfreq + vec3(0.0, uTime*0.05, 0.0));
    float g2 = sfbm(n*gfreq*2.3 - vec3(uTime*0.04, 0.0, 0.0));
    float contrast = mix(0.18, 0.07, hot) * conv;
    float gran = 1.0 + contrast*(g1 - 0.5) + contrast*0.4*(g2 - 0.5);
    float latA = dot(n, A);
    float belt = smoothstep(0.05, 0.25, abs(latA)) * (1.0 - smoothstep(0.6, 0.78, abs(latA)));
    float spot = smoothstep(0.62, 0.74, sfbm(n*7.0 + A*3.0)) * clamp(uStarSpots,0.0,1.0) * conv * belt;
    float u  = mix(0.85, 0.42, hot);
    float ld = 1.0 - u*(1.0 - mu);
    vec3  surf = base * gran * ld;
    surf *= mix(vec3(0.92,0.80,0.66), vec3(1.0), mu);
    surf  = mix(surf, surf*vec3(0.55,0.42,0.40), spot);
    surf += base*vec3(1.10,1.05,0.95) * (1.0-mu)*0.22*spot*4.0;
    col += T * surf * 4.5;          // moderate so the limb gradient survives (no flat white plate)
    T = 0.0;
  }

  // bloom was already accumulated up front (so it exists for every ray); corona +
  // photosphere have been added on top. Done.
  return col * uLightMul;
}

// ---------- background: a sparse field of point stars, and the host star ----------
// A camera exposed for a sunlit world records almost no stars. The field is kept faint and
// sparse (about two hundred in view), each star about a pixel wide whatever the zoom.
vec3 hash3(vec3 p){
  p = fract(p*vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx)*p.zyx);
}
vec3 starField(vec3 dir){
  vec3 d = normalize(dir);
  vec3 col = vec3(0.0);
  float px = 1.0/(uFov*uRes.y);                       // one pixel, in radians
  for(int k=0;k<2;k++){
    float sc = 70.0 + float(k)*60.0;
    vec3 id = floor(d*sc);
    vec3 h = hash3(id + float(k)*19.0);
    float keep = (k == 0) ? 0.988 : 0.995;
    if(h.x > keep){
      vec3 c = normalize((id + 0.2 + 0.6*hash3(id + 3.1))/sc);
      float dd = length(c - d)/(1.2*px);
      float mag = (h.x - keep)/(1.0 - keep);
      float b = 0.03 + 0.9*mag*mag*mag*mag;           // few bright, many faint
      vec3 tint = mix(vec3(0.75,0.83,1.0), vec3(1.0,0.84,0.66), h.y);
      col += tint*b*exp(-dd*dd);
    }
  }
  return col*uBgBright*3.0;
}

// ---------- light and air ----------
vec2 raySph(vec3 ro, vec3 rd, float R){
  float b=dot(ro,rd), c=dot(ro,ro)-R*R, d=b*b-c;
  if(d<0.0) return vec2(1.0,-1.0);
  float s=sqrt(d); return vec2(-b-s, -b+s);
}
float phaseR(float mu){ return (3.0/(16.0*PI))*(1.0+mu*mu); }
float phaseM(float mu, float g){
  float g2=g*g;
  return (3.0/(8.0*PI))*((1.0-g2)*(1.0+mu*mu))/((2.0+g2)*pow(max(1.0+g2-2.0*g*mu,1e-4),1.5));
}
// Chapman function: the air mass along a slant path, relative to the vertical one
float chapman(float X, float c){
  float Xs = sqrt(0.5*PI*X);
  if(c >= 0.0) return Xs/((Xs-1.0)*c + 1.0);
  float cc=-c, sh=sqrt(max(1.0-cc*cc,0.0));
  float up = Xs/((Xs-1.0)*cc + 1.0);
  return 2.0*Xs*exp(min(X*(1.0-sh), 60.0)) - up;
}
const float HM_RATIO = 0.6;                            // haze scale height over the gas scale height
const vec3  WIEN = vec3(23587.0, 26160.0, 30942.0);    // h c / (lambda k) at 610, 550 and 465 nm, in kelvin

// the picture's light level. Every world is exposed for its own star's light, as a camera sent
// there would be, so how bright a world reads is its reflectance and nothing else.
float starLight(){ return 1.0; }

// Lambert's cosine for a star that is a disc, not a point: the terminator is as soft as the star is wide
float lambertStar(float c){
  float a = clamp(uStarAngle, 0.004, 0.5);
  if(c >= a) return c;
  if(c <= -a) return 0.0;
  float t = c + a; return t*t/(4.0*a);
}

// starlight left after its slant path down to radius r, where the star stands at zenith cosine cz
vec3 sunTrans(float r, float cz){
  if(uHasAtmo < 0.01) return vec3(1.0);
  float h = max(r - 1.0, 0.0), Hm = uHvis*HM_RATIO;
  if(cz < 0.0 && r*sqrt(max(1.0 - cz*cz, 0.0)) < 1.0) return vec3(0.0);   // the solid world is in the way
  vec3 od = uTauR*exp(-h/uHvis)*chapman(r/uHvis, cz) + vec3(uTauM*exp(-h/Hm)*chapman(r/Hm, cz));
  return exp(-od);
}

// the glow of a surface at temperature T (kelvin): Wien's law per channel, scaled from the hottest point
vec3 glowAt(float T){
  if(uGlowT <= 0.0) return vec3(0.0);
  return uGlow*exp(-WIEN*(1.0/max(T, 150.0) - 1.0/uGlowT));
}
// temperature at a point whose angle from the hottest point has cosine c
float localT(float c){
  if(uLocked == 1) return max(uTsub*pow(max(c, 0.0), 0.25), uTnight);
  return mix(uTnight, uTsub, smoothstep(-0.3, 0.6, c));
}

// Single scattering through the shell, Rayleigh and haze, with the star's own colour as the light.
// The vertical optical depth (uTauR, uTauM) is the look's; the shell is drawn uHvis thick per
// e-folding, so the coefficients are depth over height and the brightness looking straight down does
// not depend on how thick the shell is drawn. Slant paths do: a stretched shell has less air mass
// toward the horizon than the true one. No ring is painted: the limb is what the integral gives.
vec3 atmosphere(vec3 ro, vec3 rd, vec3 bg, bool planetHit, float tSurface){
  if(uHasAtmo < 0.01) return bg;
  vec2 atm = raySph(ro, rd, uAtmR);
  if(atm.x > atm.y || atm.y < 0.0) return bg;
  float t0 = max(atm.x, 0.0);
  float t1 = planetHit ? min(atm.y, tSurface) : atm.y;
  if(t1 <= t0) return bg;

  vec3 L = normalize(uLightDir);
  float H = uHvis, Hm = uHvis*HM_RATIO;
  vec3 bR = uTauR/H; float bM = uTauM/Hm;
  float mu = dot(rd, L);
  float pr = phaseR(mu), pm = phaseM(mu, uMieG);

  const int STEPS = 16;
  float dt = (t1 - t0)/float(STEPS);
  vec3 odv = vec3(0.0), sumR = vec3(0.0), sumM = vec3(0.0);
  for(int i=0;i<STEPS;i++){
    float t = t0 + (float(i)+0.5)*dt;
    vec3 p = ro + rd*t; float r = length(p); float h = max(r-1.0, 0.0);
    float dR = exp(-h/H), dM = exp(-h/Hm);
    vec3 dod = (bR*dR + vec3(bM*dM))*dt;
    odv += 0.5*dod;                                    // optical depth to the middle of the step
    float cz = dot(p/r, L);
    if(!(cz < 0.0 && r*sqrt(max(1.0 - cz*cz, 0.0)) < 1.0)){   // lit: the world is not between this air and the star
      vec3 ods = uTauR*dR*chapman(r/H, cz) + vec3(uTauM*dM*chapman(r/Hm, cz));
      vec3 tr = exp(-(odv + ods));
      sumR += tr*dR*dt; sumM += tr*dM*dt;
    }
    odv += 0.5*dod;
  }
  // a white surface square-on to the star reads 1, so the star's irradiance is pi
  vec3 inscat = PI*uStarColor*starLight()*(bR*pr*sumR + uHazeCol*bM*pm*sumM);
  return bg*exp(-odv) + inscat;
}

#ifndef EXO_SURFACE
// ---------- the seven looks, seen from orbit ----------
// One orbit program is compiled per look (EXO_LOOK, the look's number in data.js LOOKS), and only when
// a world of that look is first drawn. A shader holding all seven took a Direct3D compiler 29 s to
// build on a laptop GPU (measured cold, 2026-11-15); the time grows faster than the code does, so the
// looks are kept apart.
#ifndef EXO_LOOK
#define EXO_LOOK 1
#endif

#if EXO_LOOK == 1
// 1-D value noise: belts and zones of unequal width
float n1(float x){
  float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(hash(vec3(i, 1.7, 4.1)), hash(vec3(i+1.0, 1.7, 4.1)), f);
}

// cloud tops of a world with no surface: zonal belts sheared by turbulence, eddies on the jets,
// and (when the temperature calls for it) one long-lived oval storm
vec3 fluidAlbedo(vec3 sp){
  float w1 = fbm(sp*vec3(2.6,6.0,2.6) + uSeed) - 0.5;
  float w2 = fbm3(sp*vec3(9.0,22.0,9.0) + uSeed*1.3) - 0.5;
  float lat = asin(clamp(sp.y,-1.0,1.0)) + 0.07*w1 + 0.018*w2;
  float x = lat*uBandFreq*0.32 + uSeed;
  float b = 0.62*n1(x) + 0.28*n1(x*2.7+7.0) + 0.10*n1(x*6.1+3.0);
  b = smoothstep(0.30, 0.70, b);
  vec3 mean = mix(uColB, uColA, 0.55);
  vec3 col = mix(uColB, uColA, b);
  float ed = fbm(vec3(sp.x*7.0, lat*30.0, sp.z*7.0) + uSeed*2.1);
  col *= 1.0 + 0.5*(ed - 0.5);
  col = mix(col, uColC, smoothstep(0.62,0.85,ed)*0.3);
  col = mix(mean, col, uBandContrast);
  if(uStorm > 0.0){
    float a = uSeed*1.7;
    vec3 c = normalize(vec3(cos(a)*0.925, -0.38, sin(a)*0.925));
    vec3 e = normalize(cross(vec3(0.0,1.0,0.0), c)); vec3 nn = cross(c, e);
    float qx = dot(sp, e)/0.15, qy = dot(sp, nn)/0.085;
    float q = qx*qx + qy*qy;
    if(dot(sp, c) > 0.0){
      float oval = smoothstep(1.0, 0.55, q);
      float collar = smoothstep(1.5, 1.05, q)*smoothstep(0.7, 1.05, q);
      col = mix(col, uColA, collar*0.6*uStorm);
      col = mix(col, uColC*(0.85 + 0.3*fbm3(sp*38.0 + uSeed)), oval*uStorm);
    }
  }
  col *= 1.0 - 0.22*smoothstep(0.6, 1.0, abs(sp.y));     // darker polar hoods
  return col;
}
#endif

#if EXO_LOOK == 6
// one unbroken cloud deck: faint zonal streaks, nothing else to see
vec3 deckAlbedo(vec3 sp){
  float w = fbm(sp*vec3(1.6,3.5,1.6) + uSeed) - 0.5;
  float s = fbm(vec3(sp.x*2.2, (sp.y + 0.25*w)*7.0, sp.z*2.2) + uSeed*0.61);
  return mix(uColB, uColA, smoothstep(0.3,0.7,s)) * (0.97 + 0.06*fbm3(sp*18.0));
}
#endif

#if EXO_LOOK == 2 || EXO_LOOK == 4 || EXO_LOOK == 5
// impact craters: bowls with raised rims on jittered cells, at up to five sizes, each size about
// 2.3 times the number of the one above (a -2 power law). Returns the slope the craters give the
// ground (xyz, in the world's own frame) and the brightness of fresh ejecta (w).
vec4 craters(vec3 p, int scales){
  vec3 g = vec3(0.0); float bright = 0.0;
  float f = 4.0;
  for(int s=0;s<5;s++){
    if(s >= scales) break;
    vec3 q = p*f + float(s)*13.7 + uSeed;
    vec3 base = floor(q - 0.5);
    for(int i=0;i<8;i++){
      vec3 o = vec3(mod(float(i), 2.0), mod(floor(float(i)*0.5), 2.0), floor(float(i)*0.25));
      vec3 cell = base + o;
      vec3 h = hash3(cell + float(s)*7.0);
      vec3 h2 = hash3(cell + 31.7);
      if(h2.x > 0.78) continue;                            // not every cell holds a crater
      vec3 c = cell + 0.5 + (h - 0.5)*0.5;
      float r = 0.10 + 0.25*h2.y*h2.y;                     // radius in cells: most are small
      vec3 dv = q - c; float d = length(dv);
      float x = d/r;
      if(x < 1.5){
        float slope = (x < 1.0) ? 2.6*x : -2.4*(1.5 - x);  // bowl up to the rim crest, then the outer wall
        g += (dv/max(d, 1e-4))*slope*(0.07 + 0.045*float(s));   // wide basins are shallow, small bowls steep
        if(h2.z > 0.90) bright += (1.0 - smoothstep(0.5, 1.5, x));   // a young crater and its bright blanket
      }
    }
    f *= 2.3;
  }
  return vec4(g, bright);
}
#endif

#if EXO_LOOK == 0
// land with no life assumed: sand, soil and rock sorted by climate. uLife adds a plant cover
// (an illustrative layer; the catalogue pipeline leaves it at 0).
vec3 landColor(float e, float clim, float moist){
  float warm = clamp(uTempBias + 0.25 - clim*0.9 - e*0.45, 0.0, 1.0);
  vec3 soil = uColB*0.62;
  vec3 col = mix(uColA, soil, smoothstep(0.30, 0.62, moist));                 // dry basins pale, wet ground dark
  col = mix(col, uColB, smoothstep(0.45, 0.80, e));                           // bare highlands
  col = mix(col, mix(uColB, vec3(0.22,0.21,0.20), 0.5), smoothstep(0.35, 0.10, warm)*0.6);   // cold ground: grey scree
  if(uLife > 0.0){
    vec3 plant = uPlant * mix(1.0, 0.55, smoothstep(0.4,0.8,moist));   // wet ground's cover darker
    // a thin cover (lichen-like crusts: Kiang et al. 2007 II, conclusion, "given the example of lichens") on dry ground, full on wet, none on high rock; frozen
    // ground is the ice cap's, drawn over it. [ILLUSTRATIVE] uLife is 0 unless the visitor turns life on (life.js)
    col = mix(col, plant, uLife*(0.35 + 0.65*smoothstep(0.2,0.55,moist))*(1.0-smoothstep(0.55,0.8,e)));
  }
  return col;
}
#endif

#if EXO_LOOK == 0 || EXO_LOOK == 2 || EXO_LOOK == 5
// Clouds, at a direction in the clouds' own frame. Warped noise makes weather systems sheared into
// fronts; they are thinned where air sinks. Three circulation cells per hemisphere on a turning world
// (cloud at the equator and the mid-latitudes, clear subtropics); on a locked world, one deck under
// the star. cloudDepth says how deep inside a system a point lies (half at the level that leaves
// uCloud of the sky covered) and hands back the warp; cloudAt turns that into opacity.
float cloudDepth(vec3 q, float clim, out vec3 s, out vec3 w){
  s = q*vec3(1.0,1.8,1.0);
  w = vec3(fbm3(s*2.1+11.0), fbm3(s*2.1+47.0), fbm3(s*2.1+83.0)) - 0.5;
  float base = (fbm(s*2.7 + 2.4*w + uSeed*0.37) - 0.5)/0.115;              // about unit spread
  float rise = (uLocked == 1) ? smoothstep(0.45, 0.0, clim) : 0.5 + 0.5*cos(6.0*asin(clamp(q.y,-1.0,1.0)));
  float cover = clamp(uCloud*(0.5 + 0.9*rise), 0.02, 0.95);
  float z = 2.6*(0.5 - cover);                                             // the level of the noise that this share of the sky lies above
  return smoothstep(z - 0.75, z + 0.75, base);
}
float cloudAt(vec3 q, float clim){
  vec3 s, w;
  float d = cloudDepth(q, clim, s, w);
  // finer noise decides what share of the sky is covered at this depth: cores whole, rims broken into cells and streets
  float er = 0.50*fbm3(s*8.5 + 3.0*w + 5.0) + 0.30*fbm3(s*23.0 + 5.0*w);
  er += (uOctaves >= 6) ? 0.20*fbm3(s*61.0 + 9.0*w) : 0.0875;
  if(uOctaves >= 7) er = 0.82*er + 0.18*fbm3(s*170.0 + 11.0*w);
  float cells = smoothstep(-0.4, 0.6, (er - 0.4375)/0.075 - 1.2*(1.0 - 2.0*d));
  return d*(0.28 + 0.72*cells);                                            // thick cells inside a thin veil that covers the whole system
}
#endif

// ---------- the lit surface, before the air in front of it ----------
vec3 shadeSurface(vec3 pos, vec3 rd){
  vec3 n = normalize(pos);
  vec3 V = -rd;
  vec3 L = normalize(uLightDir);
  float ang = uTime*uSpin;
  vec3 sp = rotY(ang)*n;                                 // this point in the world's own frame
  float cz = dot(n, L);
  float clim = (uLocked == 1) ? 0.5 - 0.5*cz : n.y*n.y;  // 0 warmest .. 1 coldest
  float cs = sqrt(clim);
  vec3 light = uStarColor*starLight()*sunTrans(1.0, cz);

  vec3 albedo = vec3(0.1);
  vec3 nbody = sp;                                       // shading normal, in the world's own frame
  float spec = 0.0, Temit = 0.0;

#if EXO_LOOK == 1
  albedo = fluidAlbedo(sp);
  Temit = localT(dot(n, rotY(0.3)*L));                   // the hot spot rides east of the point under the star
#elif EXO_LOOK == 6
  albedo = deckAlbedo(sp);
#else
  float cont = terrain(sp*uContFreq + uSeed);
  if(uOctaves >= 7) cont += 0.030*(fbm3(sp*uContFreq*22.0 + uSeed) - 0.5) + 0.012*(fbm3(sp*uContFreq*85.0 + uSeed) - 0.5);
  // relief: two 4-tap gradients of a cheap noise, a broad one and a fine one, tilt the normal
  vec2 kk = vec2(1.0,-1.0); float eps = 0.02, F = uContFreq*1.6, e2 = 0.004, F2 = uContFreq*11.0;
  vec3 g = kk.xyy*fbm3((sp+kk.xyy*eps)*F+uSeed) + kk.yyx*fbm3((sp+kk.yyx*eps)*F+uSeed)
         + kk.yxy*fbm3((sp+kk.yxy*eps)*F+uSeed) + kk.xxx*fbm3((sp+kk.xxx*eps)*F+uSeed);
  g += 0.45*(kk.xyy*fbm3((sp+kk.xyy*e2)*F2+uSeed) + kk.yyx*fbm3((sp+kk.yyx*e2)*F2+uSeed)
           + kk.yxy*fbm3((sp+kk.yxy*e2)*F2+uSeed) + kk.xxx*fbm3((sp+kk.xxx*e2)*F2+uSeed))*(eps/e2)*0.25;
  float relief = uBump;

  #if EXO_LOOK == 0
  // seas, bare land, ice where it is cold
  float land = smoothstep(uSeaLevel, uSeaLevel+0.015, cont);
  float mtn  = ridged(sp*uMtnFreq + uSeed*1.7);
  float e = clamp((cont + land*mtn*0.35 - uSeaLevel)/max(1.0-uSeaLevel,0.001), 0.0, 1.0);
  float rise = (uLocked == 1) ? smoothstep(0.45, 0.0, clim) : 0.5 + 0.5*cos(6.0*asin(clamp(sp.y,-1.0,1.0)));
  float moist = 0.62*fbm(sp*2.4+30.0+uSeed) + 0.38*rise;                    // rain falls where the air rises
  float depth = clamp((uSeaLevel - cont)/0.10, 0.0, 1.0);
  vec3 sea = mix(vec3(0.014,0.060,0.085), vec3(0.004,0.013,0.036), pow(depth, 0.6));
  albedo = mix(sea, landColor(e, clim, moist), land);
  float edge = uIceCap + 0.07*(fbm3(sp*7.0+uSeed) - 0.5);
  float ice = smoothstep(edge-0.02, edge+0.03, cs);
  ice = max(ice, land*smoothstep(0.72,0.90,e)*smoothstep(0.9,0.3,uTempBias));     // snow on the heights of a cool world
  albedo = mix(albedo, mix(vec3(0.66,0.72,0.77), vec3(0.82,0.84,0.86), smoothstep(-0.03, 0.05, cont - uSeaLevel)), ice);
  spec = (1.0-land)*(1.0-ice);
  relief *= land;
  #elif EXO_LOOK == 5
  // dust plains and dark provinces, canyon shadows, small frost caps
  float streak = fbm(sp*vec3(5.0,9.0,5.0) + uSeed*0.7);
  albedo = mix(uColB, uColA, clamp(smoothstep(0.34,0.52,cont) + (streak-0.5)*0.45, 0.0, 1.0));
  albedo *= 1.0 - 0.35*smoothstep(0.80, 0.95, ridged(sp*uMtnFreq*0.5 + uSeed*1.7));
  float edge = uIceCap + 0.05*(fbm3(sp*8.0+uSeed) - 0.5);
  albedo = mix(albedo, uColC, smoothstep(edge-0.015, edge+0.02, cs));
  #elif EXO_LOOK == 2
  // an ice shell: plates of old and young ice, long fractures
  albedo = mix(uColB, uColA, smoothstep(0.3,0.7,cont));
  float fr = smoothstep(0.74,0.92, ridged(sp*3.2 + uSeed*1.7))*0.8 + smoothstep(0.80,0.95, ridged(sp*7.5 + uSeed*0.9 + 4.0))*0.5;
  albedo = mix(albedo, uColC, clamp(fr,0.0,1.0)*0.8);
  spec = 0.2; relief *= 0.5;
  #elif EXO_LOOK == 4
  // regolith: bright highlands, dark lava plains in the basins
  albedo = mix(uColA, uColB, smoothstep(0.47,0.66,cont)*0.8) * (0.86 + 0.28*fbm(sp*14.0 + uSeed));
  relief *= 0.25;
  Temit = localT(cz);
  #else
  // molten: the melt is open where the ground is hot enough, and crusts over as it cools
  float Tl = localT(cz);
  float melt = smoothstep(1500.0, 1750.0, Tl);           // open melt above about 1,673 K, where rock stops holding a crust (Kite et al. 2016)
  vec3 fw = vec3(fbm3(sp*3.0+uSeed), fbm3(sp*3.0+uSeed+17.0), fbm3(sp*3.0+uSeed+41.0)) - 0.5;
  float flow = fbm(sp*5.0 + 2.4*fw + uSeed*0.3);         // slow convection in the melt
  float seam = pow(1.0 - abs(2.0*fbm(sp*4.2 + 2.6*fw + uSeed*0.7) - 1.0), 5.0);   // hot seams where it wells up
  float plates = fbm(sp*uContFreq*1.7 + 2.0*fw + uSeed + 5.0);
  float crust = smoothstep(melt*0.9 - 0.10, melt*0.9 + 0.06, plates*0.75 + flow*0.5 - 0.12);
  float crack = 1.0 - smoothstep(0.0, 0.035, abs(fbm3(sp*6.0 + uSeed) - 0.5));
  albedo = mix(uColC, mix(uColA, uColB, cont), crust);
  Temit = Tl*mix(0.90 + 0.16*flow + 0.08*seam, 0.80, crust);
  Temit = max(Temit, crack*crust*smoothstep(800.0, 1200.0, Tl)*1300.0);   // fissures in thin crust show the melt below
  spec = 0.15*(1.0-crust); relief *= crust;
  #endif

  vec3 tilt = relief*(g - dot(g,sp)*sp);
  #if EXO_LOOK == 2 || EXO_LOOK == 4 || EXO_LOOK == 5
  if(uCrater > 0.0){
    int sc = (uOctaves >= 7) ? 5 : (uOctaves >= 5 ? 4 : 3);
    vec4 cr = craters(sp, sc);
    tilt += uCrater*(cr.xyz - dot(cr.xyz,sp)*sp);
    albedo = mix(albedo, min(albedo*1.8, vec3(0.5)), clamp(cr.w,0.0,1.0)*0.6*uCrater);   // fresh ejecta: the same ground, unweathered
  }
  #endif
  nbody = normalize(sp - tilt);
#endif

  vec3 nb = rotY(-ang)*nbody;
  float mu0 = dot(nb, L);
  float irr = lambertStar(mu0) * smoothstep(-uStarAngle-0.01, uStarAngle+0.02, cz);
#if EXO_LOOK == 4
  // dusty regolith reflects by the Lommel-Seeliger law more than by Lambert's: no limb darkening at full phase
  float m0 = max(mu0, 0.0), mv = max(dot(nb, V), 0.0);
  irr = mix(irr, min(irr*2.0/(m0 + mv + 1e-3), 2.0), 0.6);
#endif
  vec3 col = albedo*light*irr;

#if EXO_LOOK == 0 || EXO_LOOK == 2 || EXO_LOOK == 3
  if(spec > 0.0 && cz > 0.0){
    vec3 hlf = normalize(L+V);
    float fres = 0.25 + 2.5*pow(1.0 - max(dot(V,hlf),0.0), 5.0);
    float nh = max(dot(nb,hlf),0.0);
    col += light*(0.55*pow(nh, 420.0) + 0.035*pow(nh, 50.0))*spec*fres;    // a bright core in a wide sheen: a sea is never flat
  }
#endif

#if EXO_LOOK == 0 || EXO_LOOK == 2 || EXO_LOOK == 5
  if(uCloud > 0.0 && uHasAtmo > 0.01){
    mat3 drift = rotY(ang*1.08);                         // the air turns a little faster than the ground
    vec3 cq = drift*n;
    float cl = cloudAt(cq, clim);
    float shade = 0.0;
    if(uOctaves >= 5 && cz > 0.03){
      vec3 Lc = drift*L; vec3 s2, w2;
      shade = 0.85*cloudDepth(normalize(cq + (Lc - cq*dot(Lc,cq))*(0.010/max(cz,0.2))), clim, s2, w2);   // the system between here and the star
    }
    #if EXO_LOOK == 5
    cl *= 0.4;                                           // thin air carries thin cloud
    #endif
    col *= 1.0 - 0.55*shade*(1.0-cl);
    // thick cloud is whiter than thin, and darker where more cloud stands between it and the star
    col = mix(col, vec3(0.72 + 0.24*cl)*light*lambertStar(cz)*(1.0 - 0.32*shade), cl);
  }
#endif

#if EXO_LOOK == 1 || EXO_LOOK == 3 || EXO_LOOK == 4
  if(uGlowT > 0.0) col += glowAt(Temit);
#endif
  return col;
}
#endif

// ---------- inside a gas giant: there is no surface, only deepening cloud ----------
#ifdef EXO_SURFACE
vec3 gasInterior(vec3 ro, vec3 rd){
  vec3 L = normalize(uLightDir);
  vec3 up = normalize(ro);
  float elev = dot(rd, up);                 // -1 straight down (abyss) .. +1 high sky
  float sun  = max(dot(rd, L), 0.0);
  vec3 deep = uColA * 0.05;                  // crushing dark depths
  vec3 deck = uColB * 0.9;                   // lit cloud deck
  vec3 high = mix(uColC, uStarColor, 0.35) * 1.1;
  vec3 col = mix(deep, deck, smoothstep(-0.6, 0.06, elev));
  col = mix(col, high, smoothstep(0.06, 0.75, elev));
  // wavy horizontal cloud bands (layers), drifting
  float w = fbm(rd*5.0 + vec3(uTime*0.04, 0.0, 0.0));
  float bands = 0.5 + 0.5*sin(elev*36.0 + w*5.0 + uTime*0.05);
  col = mix(col, uColA, pow(bands, 2.0)*0.22*smoothstep(-0.4, 0.4, elev));
  // billowing cloud masses near eye level
  float cl = fbm(rd*8.0 + vec3(0.0, uTime*0.03, 0.0));
  col = mix(col, high*1.1, smoothstep(0.55, 0.85, cl)*smoothstep(-0.25, 0.35, elev)*0.35);
  // the sun, only diffusely scattered through deep haze (no hard disk down here)
  col += uStarColor * pow(sun, 4.0) * 0.5 * smoothstep(-0.2, 0.5, elev);
  col += uStarColor * pow(sun, 40.0) * 0.7 * smoothstep(0.1, 0.5, elev);
  col *= 0.7 + 0.5*smoothstep(-0.3, 0.6, dot(up, L));   // day/night side of the deck
  return col * starLight();
}

// ======================================================================
// PROCEDURAL EXPLORABLE SURFACE — radially-displaced unit sphere.
// The "ground" is length(p) == 1.0 + amp*H(normalize(p)), in the SAME
// radius=1 space as the orbit ball, so raySph, atmosphere and renderStar are
// shared. The ground itself is its own field (planetH), not the one the orbit
// view draws: what is land from orbit is not yet the land you stand on.
// All loops are constant-bounded with break -> valid WebGL1 GLSL ES 1.00.
// ======================================================================

// per-planet world BASIS: seed -> fixed 3D rotation (NOT a translation, so
// two worlds are genuinely different topologies, not shifted continents).
mat3 seedBasis(){
  float s = uSeed;
  float a=fract(s*0.1031)*6.2831853, b=fract(s*0.1107+0.33)*6.2831853, c=fract(s*0.0973+0.71)*6.2831853;
  float sa=sin(a),ca=cos(a),sb=sin(b),cb=cos(b),sc=sin(c),cc=cos(c);
  mat3 Rx=mat3(1.,0.,0., 0.,ca,-sa, 0.,sa,ca);
  mat3 Ry=mat3(cb,0.,sb, 0.,1.,0., -sb,0.,cb);
  mat3 Rz=mat3(cc,-sc,0., sc,cc,0., 0.,0.,1.);
  return Rz*Ry*Rx;
}

// LOD'd value-noise FBM: octave count is an ARGUMENT (falls with distance).
float fbmN(vec3 p, int oct, float lastAmp){
  float a=0.5, s=0.0;
  for(int i=0;i<9;i++){ if(i>=oct) break;
    float amp=(i==oct-1)?a*lastAmp:a; s+=amp*vnoise(p); p=p*2.03+1.1; a*=0.5; }
  return s;
}
// LOD'd ridged: octave-capped so distance octave saving is not defeated.
float ridgedN(vec3 p, int oct){
  float a=0.5, s=0.0;
  for(int i=0;i<6;i++){ if(i>=oct) break;
    float n=1.0-abs(vnoise(p)*2.0-1.0); s+=a*n*n; p=p*2.07+0.7; a*=0.5; }
  return s;
}

// science-driven height. d = unit direction on the sphere; dist = sample's
// distance from the eye (drives LOD). Same signal at every scale => the
// continent (oct3) IS the rock (oct9): seamless infinite-detail zoom.
float planetH(vec3 d, float dist){
  mat3 W = seedBasis();
  vec3 wd = W*d;
  // distance-driven octaves (dist = TRUE distance from the eye, see planetDE):
  // near foreground gets oct~8-9, the horizon falls to ~5 -> detail where it reads.
  float fo = clamp(9.0 - log2(max(dist,1e-5)*100.0), 2.0, 9.0);
  int   oct = int(ceil(fo));
  float lastAmp = clamp(fo - floor(fo), 0.0, 1.0); if(lastAmp==0.0) lastAmp=1.0;
  // GLSL ES 1.00 has no int min/max overloads -> clamp octaves manually
  int   wOct = oct-3; if(wOct<1) wOct=1;       // domain warp is itself LOD'd
  int   mtOct = oct; if(mtOct>7) mtOct=7;      // mountain ridge cap
  int   glOct = oct; if(glOct>4) glOct=4;      // glacier ridge cap
  int   dtOct = oct; if(dtOct>5) dtOct=5;      // fine-detail cap

  // regional elevation trend (gentle, sets highlands vs basins across the patch)
  float tf = uContFreq*5.0;
  vec3 p = wd*tf;
  vec3 q = vec3(fbmN(p+1.7,wOct,1.0), fbmN(p+9.2,wOct,1.0), fbmN(p+4.3,wOct,1.0));
  float trend = fbmN(p + 1.5*q, oct, lastAmp);
  float uplift = smoothstep(0.18, 0.62, trend);
  // primary mountains at VIEW scale: mf is high so the dominant (high-amplitude)
  // low octaves are already mountain-WIDTH in the frame. ridged + squared ->
  // sharp crests, deep valleys. This is what makes the relief read as 3D.
  // Some ridges EVERYWHERE (no dead-flat landing site), more on the highlands.
  float mf = uMtnFreq*7.0;
  float rn = clamp(ridgedN(wd*mf, mtOct)/1.35, 0.0, 1.0);
  float mtn = (0.40 + 0.60*uplift) * rn * rn;
  // fine surface roughness (rocks/scree), centred so it adds and removes
  float detail = fbmN(wd*mf*4.0, dtOct, 1.0) - 0.5;
  float h = trend*0.30 + mtn*0.62 + detail*0.06;
  // incised erosion channels on the slopes
  float carve = ridgedN(wd*mf*1.8+5.0, dtOct);
  h -= carve*carve*0.07*uplift;
  // ---- per-style morphology (frame-constant uTerrStyle -> no divergence) ----
  if(uTerrStyle==1){                     // DUNE: transverse ripple fields on flats
    float wv = sin(dot(wd.xz, vec2(13.0,8.0))*8.0 + fbmN(wd*4.0,3,1.0)*8.0);
    h += abs(wv)*0.06*(1.0-uplift);
  } else if(uTerrStyle==2){              // GLACIER: ice sheet smooths the relief
    h = mix(0.5, h, 0.5) + 0.04*ridgedN(wd*mf*0.7, glOct);
  } else if(uTerrStyle==4){              // CRATERED: overlapping impact bowls
    float b0 = ridgedN(wd*mf*0.5, 3);
    float b1 = ridgedN(wd*mf*1.3+3.0, 3);
    h -= 0.20*smoothstep(0.55,0.9,b0) + 0.12*smoothstep(0.6,0.92,b1);
  }
  return clamp(h, -0.25, 1.0);           // <=1 keeps peaks under the camera ceiling
}

// MATERIAL at the hit — science palette ONLY (no green default / no uLife).
vec3 surfaceMaterial(vec3 P, vec3 N){
  float ampE = uAmp/sqrt(max(uGRel,0.3));
  float H = clamp((length(P)-1.0)/max(ampE,1e-5), -1.0, 1.0);
  float e = clamp(H, 0.0, 1.0);
  float slope = 1.0 - clamp(dot(N, normalize(P)), 0.0, 1.0);
  vec3 rock = mix(uColB, uColA, slope*0.8);
  vec3 reg  = uColA;
  vec3 alb  = mix(reg, rock, smoothstep(0.4,0.62,slope));
  float strata = fract(H*8.0 + fbm3(P*2.0)*0.3);
  float band = smoothstep(0.0,0.04,strata)*smoothstep(0.08,0.04,strata);
  alb = mix(alb, alb*0.55, band*smoothstep(0.45,0.7,slope));
  float snowLine = mix(0.85, 0.25, uTfreeze);            // the colder the world, the lower its snow
  float snow = smoothstep(snowLine, snowLine+0.12, e) * smoothstep(0.0, 0.15, uTfreeze) * smoothstep(0.6,0.3,slope);
  alb = mix(alb, vec3(0.90,0.93,0.98), clamp(snow,0.0,1.0));
  if(uTerrStyle==2) alb = mix(alb, vec3(0.80,0.87,0.96), 0.55);
  if(uTerrStyle==3){
    float lava = smoothstep(0.15, -0.15, H);     // molten crust pools in the lows
    alb = mix(alb, vec3(0.05,0.035,0.03), lava); // dark cooled basalt around it
  }
  if(uType==6) alb = mix(vec3(0.11,0.09,0.075), vec3(0.16,0.13,0.10), slope);   // under a cloud deck: basalt plains
  return alb;
}

// The level a liquid stands at where the eye is: the sea, or on a molten world the melt, which
// rises with the ground's temperature. Set once per pixel in surfaceView, before the march.
float gLevel = -1.0;

// distance estimator: radial displacement of the unit sphere. A liquid clamps
// flat (max(H, level)) so basins don't march a bed under it.
float planetDE(vec3 p){
  float r = length(p);
  vec3 d = p / r;
  float h = max(planetH(d, length(p-uCam)), gLevel);  // LOD by true eye distance; flat liquid
  float amp = uAmp / sqrt(max(uGRel,0.3));     // high-g worlds flatter (isostasy)
  return r - (1.0 + amp*h);
}

// analytic-bracketed under-relaxed sphere-trace. Returns t of hit, -1 on miss.
float marchSurface(vec3 ro, vec3 rd, out vec3 hitP){
  float amp = uAmp / sqrt(max(uGRel,0.3));
  vec2 bo = raySph(ro, rd, 1.0 + amp);          // relief shell (free far-skip)
  if(bo.x > bo.y) return -1.0;                  // misses planet entirely -> sky
  float t = max(bo.x, 0.0), tFar = bo.y;
  t += ign(gl_FragCoord.xy)*0.0008;             // start dither (banding -> noise)
  for(int i=0;i<160;i++){                        // CONSTANT bound + break
    if(i>=uMarchSteps || t>tFar) break;
    vec3 p = ro + rd*t;
    float d = planetDE(p);
    if(d < 0.0008*t){ hitP = p; return t; }      // screen-space eps => constant cost
    t += max(d*0.6, t*0.0025 + 0.0008);          // under-relax + growth floor
  }
  return -1.0;
}

// 4-tap tetrahedron normal of the FULL DE (must diff ridges, not plains).
vec3 surfaceNormal(vec3 p, float t){
  vec2 k = vec2(1.0,-1.0);
  float e = max(0.0006*t, 0.00012);
  return normalize( k.xyy*planetDE(p+k.xyy*e) + k.yyx*planetDE(p+k.yyx*e)
                  + k.yxy*planetDE(p+k.yxy*e) + k.xxx*planetDE(p+k.xxx*e) );
}

// IQ soft shadow: short low-detail march toward the star.
float surfaceShadow(vec3 P, vec3 L){
  if(uShadowSteps<=0) return 1.0;
  float res=1.0, t=0.004;
  for(int j=0;j<24;j++){
    if(j>=uShadowSteps) break;
    float d = planetDE(P + L*t);
    if(d < 0.0004) return 0.0;
    res = min(res, 14.0*d/t);
    t += max(d*0.7, 0.004);
    if(t > 0.5) break;
  }
  return clamp(res,0.0,1.0);
}

// the sky under an unbroken cloud deck: a dim dome in the deck's own colour, brighter overhead
vec3 overcast(vec3 ro, vec3 rd){
  vec3 up = normalize(ro);
  float day = smoothstep(-0.2, 0.4, dot(up, normalize(uLightDir)));
  // the deck passes the red end of the light best
  return uStarColor*starLight()*uHazeCol*vec3(1.0,0.74,0.46)*mix(0.10, 0.20, clamp(dot(rd, up), 0.0, 1.0))*day;
}

// standing water, before the sky is mirrored in it: a dark body under the star, and the star's glitter.
// Gives back the mirror direction R and the share of the sky the surface reflects (Fresnel), F.
vec3 seaBody(vec3 rd, vec3 P, float t, float bed, out vec3 R, out float F){
  vec3 L = normalize(uLightDir);
  vec3 up = normalize(P);
  vec3 wv = vec3(fbm3(P*900.0 + uTime*0.3), fbm3(P*900.0 + 31.0 - uTime*0.2), fbm3(P*900.0 + 57.0)) - 0.5;
  vec3 N = normalize(up + (wv - up*dot(wv,up))*0.16/(1.0 + t*40.0));      // the sea state, smoothed away with distance
  float czP = dot(up, L);
  vec3 star = uStarColor*starLight();
  vec3 sunL = star*sunTrans(length(P), czP);
  F = 0.02 + 0.98*pow(1.0 - clamp(dot(-rd, N), 0.0, 1.0), 5.0);
  R = reflect(rd, N); R = normalize(R + up*max(0.0, 0.02 - dot(R, up)));   // a mirror never shows the ground behind it
  float depth = clamp((gLevel - bed)/0.10, 0.0, 1.0);                    // the bed under the water
  vec3 body = mix(vec3(0.020,0.075,0.085), vec3(0.004,0.014,0.036), sqrt(depth));
  vec3 amb = star*(0.5*uTauR + 0.4*uTauM*uHazeCol)*smoothstep(-0.25, 0.3, czP)*uHasAtmo;
  float rl = max(dot(R, L), 0.0);
  return body*(sunL*max(czP, 0.0) + amb)*(1.0 - F) + sunL*F*(6.0*pow(rl, 700.0) + 0.5*pow(rl, 70.0));
}

// open melt: it gives its own light by its temperature; slow convection mottles it and cooler rafts of crust ride on it
vec3 meltBody(vec3 P){
  vec3 up = normalize(P);
  float czP = dot(up, normalize(uLightDir));
  vec3 fw = vec3(fbm3(P*300.0+uSeed), fbm3(P*300.0+uSeed+17.0), fbm3(P*300.0+uSeed+41.0)) - 0.5;
  float flow = fbm3(P*520.0 + 2.4*fw + uTime*0.02);
  float seam = pow(1.0 - abs(2.0*fbm3(P*420.0 + 2.6*fw) - 1.0), 5.0);
  float raft = smoothstep(0.50, 0.60, fbm3(P*260.0 + 1.5*fw + 9.0));
  float Te = localT(czP)*mix(0.90 + 0.16*flow + 0.08*seam, 0.78, raft);
  return mix(uColC, uColA, raft)*uStarColor*starLight()*sunTrans(length(P), czP)*max(czP, 0.0) + glowAt(Te);
}

// the ground under the star and the sky
vec3 groundBody(vec3 ro, vec3 P, float t){
  vec3 L = normalize(uLightDir);
  vec3 N   = surfaceNormal(P, t);
  vec3 alb = surfaceMaterial(P, N);
  float ndl = max(dot(N, L), 0.0);
  float sh  = (ndl>0.0) ? surfaceShadow(P + N*0.0008, L) : 0.0;
  float czP = dot(normalize(P), L);
  vec3 star = uStarColor*starLight();
  vec3 sunL = star*sunTrans(length(P), czP);
  // light from the sky: the share of the beam the air scatters down, bluer than the beam
  vec3 amb = star*(0.5*uTauR + 0.4*uTauM*uHazeCol)*smoothstep(-0.25, 0.3, czP)*uHasAtmo;
  if(uType==6){ sunL = vec3(0.0); amb = overcast(ro, normalize(P))*1.2; }   // the deck hides the star: all light is diffuse
  amb *= 0.55 + 0.45*clamp(dot(N, normalize(P)), 0.0, 1.0);                   // a slope sees less of the sky than a plain
  vec3 col = alb * (sunL*ndl*sh + amb);
  if(uTerrStyle==3 && uGlowT > 0.0){           // dark basalt crust + bright molten fissures
    float ampE=uAmp/sqrt(max(uGRel,0.3));
    float H=(length(P)-1.0)/max(ampE,1e-5);
    float crackn=fbm3(P*9.0+uTime*0.05);
    float cracks=smoothstep(0.035,0.0,abs(crackn-0.5));  // thin glowing fissure lines only
    float pools =smoothstep(-0.12,-0.30,H);              // molten only in the deepest pools
    float lava=clamp(max(cracks, pools), 0.0, 1.0);
    float pulse=0.6+0.4*fbm3(P*5.0+uTime*0.2);
    col *= mix(1.0, 0.45, smoothstep(0.4,0.0,H));        // char/darken the low crust
    col += glowAt(max(localT(czP)*1.06, 1300.0))*lava*pulse;
  }
  return col;
}

// THE surface renderer. ro,rd in radius=1 space (eye just above the relief cap).
// Every ray makes one pass through the air, whatever it met: the sky itself on a miss, the mirrored
// sky on a liquid, and on ground the light of the air along the horizon, into which distance fades it.
vec3 surfaceView(vec3 ro, vec3 rd){
  vec3 L = normalize(uLightDir);
  vec3 up = normalize(ro);
  gLevel = uSeaY;
  if(uType==3) gLevel = mix(-0.40, 0.22, smoothstep(1500.0, 1750.0, localT(dot(up, L))));
  vec3 P; float t = marchSurface(ro, rd, P);
  bool miss = t < 0.0;

  vec3 col = vec3(0.0), skyDir = rd;
  float F = 0.0;
  if(miss){
    if(uType != 6) col = renderStar(rd);                 // under an unbroken deck there is no star to see
  } else {
    vec3 rh = rd - up*dot(rd, up);
    skyDir = (length(rh) > 1e-4) ? normalize(rh) : rd;
    float bed = 1.0;
    if(gLevel > -0.5) bed = planetH(normalize(P), t);
    if(bed <= gLevel && uType == 3) col = meltBody(P);
    else if(bed <= gLevel) col = seaBody(rd, P, t, bed, skyDir, F);
    else col = groundBody(ro, P, t);
  }

  vec3 sky = (uType==6) ? overcast(ro, skyDir) : atmosphere(ro, skyDir, miss ? col : vec3(0.0), false, 0.0);
  if(miss) return (uType==6) ? sky : sky + starField(rd)*exp(-90.0*dot(sky, vec3(0.2126,0.7152,0.0722)));   // a bright sky drowns the faint stars
  col += sky*F;                                          // the sky a liquid mirrors
  if(uHasAtmo < 0.01) return col;                        // no air: crisp to the horizon
  // aerial perspective: over the path the ground fades into the air's light, each channel by its own optical depth
  float hEye = max(length(ro) - 1.0, 0.0), Hm = uHvis*HM_RATIO;
  vec3 keep = exp(-(uTauR/uHvis*exp(-hEye/uHvis) + vec3(uTauM/Hm*exp(-hEye/Hm)))*t);
  return col*keep + sky*(1.0 - keep);
}

#endif
// film: exposure, a filmic curve (the widely used rational fit to the ACES reference tone curve), sRGB transfer
vec3 film(vec3 c){
  if(uRaw > 0.5) return clamp(c, 0.0, 1.0);            // for measurement: the linear picture, a white sunlit surface = 1
  c *= uExposure;
  c = clamp((c*(2.51*c + 0.03))/(c*(2.43*c + 0.59) + 0.14), 0.0, 1.0);
  return mix(12.92*c, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes - uShift)/uRes.y;
  vec3 ro = uCam;
  vec3 fwd = normalize(uFwd);
  // on the surface, level the horizon to the planet's radial up; in orbit use world Y
  vec3 wup = (uSurfaceMode >= 1) ? normalize(uCam)
           : (abs(fwd.y) > 0.99 ? vec3(0.0,0.0,1.0) : vec3(0.0,1.0,0.0));
  if(abs(dot(fwd, wup)) > 0.99) wup = abs(fwd.y) > 0.99 ? vec3(0.0,0.0,1.0) : vec3(0.0,1.0,0.0);
  vec3 rgt = normalize(cross(fwd, wup));
  vec3 upv = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x*rgt + uv.y*upv + uFov*fwd);

#ifdef EXO_SURFACE
  // SURFACE program (compiled on demand): the camera is on/inside the world.
  // a gas giant has no surface to stand on — descend into the cloud deck instead
  if(uIsGasGiant == 1){
    gl_FragColor = vec4(film(gasInterior(ro, rd)), 1.0); return;
  }
  // a rocky/ice/lava/airless world: sphere-trace the displaced-unit-sphere terrain
  gl_FragColor = vec4(film(surfaceView(ro, rd)), 1.0);
#else
  // ORBIT program (compiled at start-up): the default deep-field view.
  vec2 ps = raySph(ro, rd, 1.0);
  bool planetHit = (ps.x <= ps.y) && (ps.x > 0.0);
  float tS = ps.x;

  // one pass through the air for every ray: in front of the world, or in front of the star
  vec3 behind;
  if(planetHit) behind = shadeSurface(ro + rd*tS, rd); else behind = renderStar(rd);
  vec3 col = atmosphere(ro, rd, behind, planetHit, tS);
  if(!planetHit) col += starField(rd)*exp(-90.0*dot(col, vec3(0.2126,0.7152,0.0722)));   // a bright sky drowns the faint stars

  gl_FragColor = vec4(film(col), 1.0);
#endif
}
`;

// ---------- small vec helpers (JS) ----------
const vsub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const vadd = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const vscale = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
const vdot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vcross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const vnorm = (a) => { const l = Math.hypot(a[0],a[1],a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

const DEFAULTS = {
  camMode: 'orbit',
  shift: [0, 0],      // CSS pixels, +x right, +y up
  camDist: 4.7, yaw: HOME.yaw, pitch: HOME.pitch, fov: 1.5,
  exposure: 0.62, resScale: 0.9,
  lightDir: [-0.15, 0.45, 0.85],
  starColor: [1.0, 0.95, 0.86], starSurf: [1.0, 0.96, 0.9], starAngle: 0.02,
  starActivity: 0.4, starSpots: 0.2, starTeff: 5600, starSpin: [0.0, 1.0, 0.0],
  lightMul: 1.0, bgBright: 0.32,
  type: -1, isGasGiant: 0, locked: 0, seed: 0.0, spin: 0.05,   // -1: no world loaded yet
  seaLevel: 0.5, contFreq: 1.9, mtnFreq: 6.0, bump: 0.14,
  tempBias: 0.5, iceCap: 0.89, life: 0.0, plant: [0.05, 0.10, 0.03], cloud: 0.0, bandFreq: 16.0, bandContrast: 0.2, storm: 0.0, crater: 0.0,
  colA: [0.30,0.32,0.36], colB: [0.24,0.26,0.30], colC: [0.40,0.42,0.46],
  glow: [0.0,0.0,0.0], glowT: 0.0, tsub: 300.0, tnight: 250.0,
  atmR: 1.033, hvis: 0.0047, tauR: [0.064,0.097,0.193], tauM: 0.07, hazeCol: [0.96,0.97,1.0], mieG: 0.76,
  hasAtmo: 1.0,
  octaves: 6, lastAmp: 1.0,
  // procedural explorable surface
  amp: 0.0028, terrStyle: 0, seaY: -1.0, tfreeze: 0.2, gRel: 1.0,
  marchSteps: 128, shadowSteps: 16,
};

const UNIFORMS = [
  'uRes','uShift','uTime','uCam','uFwd','uFov','uExposure','uRaw',
  'uLightDir','uStarColor','uStarSurf','uStarAngle','uStarActivity','uStarSpots','uStarTeff','uStarSpin','uLightMul','uBgBright',
  'uType','uIsGasGiant','uLocked','uSurfaceMode','uSeed','uSpin','uSeaLevel','uContFreq','uMtnFreq','uBump',
  'uTempBias','uIceCap','uLife','uPlant','uCloud','uBandFreq','uBandContrast','uStorm','uCrater','uColA','uColB','uColC',
  'uGlow','uGlowT','uTsub','uTnight',
  'uAtmR','uHvis','uTauR','uTauM','uHazeCol','uMieG','uHasAtmo',
  'uOctaves','uLastAmp',
  'uAmp','uTerrStyle','uSeaY','uTfreeze','uGRel','uMarchSteps','uShadowSteps',
];

export class Exoplanet {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.cfg = { ...DEFAULTS, ...config };
    this.still = !!window.__EXO_STILL__;
    this.t0 = performance.now();
    this.running = false;

    this._losses = 0;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' })
            || canvas.getContext('experimental-webgl');
    if (!gl) { this._fail('WebGL is required to render the planet.'); return; }
    this.gl = gl;
    this.renderer = this._rendererInfo(gl);
    // Performance tier. A software rasteriser (SwiftShader, llvmpipe, the Windows basic
    // driver) costs about 330 ms per frame for this shader at 1296x810 (measured
    // 2026-11-11), so a continuous loop would freeze the page: it gets a reduced buffer
    // and renders on demand. Reduced motion also renders on demand, at full resolution.
    this.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(this.renderer);
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onDemand = this.still || this.software || this.reduced;
    if (this.software) this.cfg.resScale = 0.5;
    this.tier = this.software ? 'software' : this.reduced ? 'still' : 'gpu';
    this.stats = { fps: 0, ms: 0, frames: 0 };
    this._ft = [];
    this._anim = null;
    this._visible = true;
    console.info('[exomania] GL renderer:', this.renderer, '· tier', this.tier);

    // This is a heavy single-pass ray-marcher. On a large desktop framebuffer the
    // first frame can outrun the GPU watchdog and the driver drops the context
    // (CONTEXT_LOST_WEBGL) — which is why it can die on desktop yet run on a phone
    // (tiny canvas) and why the lighter Black-Hole shader survives the same buffer.
    // Handle it for real: keep the canvas, rebuild the GL resources when the context
    // comes back, and step the resolution down so the retry is cheaper.
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this._lost(); }, false);
    canvas.addEventListener('webglcontextrestored', () => this._restore(), false);

    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    this._buildGL();   // the shader itself is built later, piece by piece; a build that fails says so then (see _programFor)
    this._bindPointer();
    window.addEventListener('resize', this._resize, { passive: true });
    this._resize();
    // if the context was lost at start-up and never returns, say so (with the GPU id) instead of a silent black frame
    setTimeout(() => { if (this.gl.isContextLost() && !this._failEl) this._fail('The GPU dropped the WebGL context during start-up.'); }, 6000);
  }

  _rendererInfo(gl) {
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || 'unknown');
    } catch (_) { return 'unknown'; }
  }

  /* ---- shader programs ----
     The fragment shader is built in pieces: one orbit program per look, and the ground program.
     Each is built the first time it is needed, never before. Where the browser offers
     KHR_parallel_shader_compile the build runs off the main thread: the page stays live, a notice
     says what is being prepared, and the picture changes when the program is ready. Without the
     extension a build blocks the page; the notice is painted first.
     Cold builds on a laptop GPU under Direct3D 11, measured 2026-11-15: 2.4 s for cloud tops, 4 to
     8 s for the rocky looks, 28 s for the ground (the single program this replaces took 6 s, and
     its ground program 31 s, both blocking). A browser keeps a built program, so a visitor waits once. */
  _source(key) { return (key === 'surface' ? '#define EXO_SURFACE 1\n' : `#define EXO_LOOK ${key | 0}\n`) + FRAG; }

  // start a build: compile and link without asking for the result (asking is what blocks)
  _begin(key) {
    const gl = this.gl;
    const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
    const v = mk(gl.VERTEX_SHADER, VERT), fr = mk(gl.FRAGMENT_SHADER, this._source(key));
    const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, fr);
    gl.bindAttribLocation(p, 0, 'aPos');   // aPos -> location 0 in every program, so one bound buffer drives them all
    gl.linkProgram(p);
    return { p, v, fr };
  }
  // finish a build: read the result (this waits if the build is still running) and look up the uniforms
  _finish({ p, v, fr }) {
    const gl = this.gl;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) console.error(gl.getShaderInfoLog(v) || '', gl.getShaderInfoLog(fr) || '', gl.getProgramInfoLog(p) || '');
      return null;
    }
    const u = {};
    UNIFORMS.forEach((n) => u[n] = gl.getUniformLocation(p, n));
    return { prog: p, u };
  }
  /* The program for a key (a look's number, or 'surface'): { prog, u } when it is ready, null while it
     is being built and null for good if it failed. block = true waits for the build.
     Where the browser cannot build in the background the build will block the page, so the notice is
     given two frames to paint first, as the ground view always did. */
  _programFor(key, block = false) {
    const gl = this.gl;
    if (gl.isContextLost()) return null;                 // nothing can be built or used until the context returns
    let e = this.programs[key];
    if (e === undefined) e = this.programs[key] = { building: this._begin(key) };
    if (e === null || e.prog) return e;
    if (!block) {
      if (this.parallel) {
        if (!gl.getProgramParameter(e.building.p, this.parallel.COMPLETION_STATUS_KHR)) { this._wait(key); return null; }
      } else if (!e.go) {
        this._wait(key);
        if (!e.armed) {
          e.armed = true;
          requestAnimationFrame(() => requestAnimationFrame(() => { e.go = true; this._programFor(key); this.onReady && this.onReady(); this.requestDraw(); }));
        }
        return null;
      }
    }
    e = this.programs[key] = this._finish(e.building);
    if (this._wantKey === key) this._endBuildNote();
    if (!e && !gl.isContextLost()) this._buildFailed(key);
    return e;
  }
  _building(key) { const e = this.programs[key]; return !!e && !!e.building; }
  _ready(key) { const e = this.programs[key]; return !!e && !!e.prog; }
  /* start building a program before it is needed (the page does this for the world it opens on) */
  prepare(key) { if (this.gl && !this.gl.isContextLost() && this.programs[key] === undefined) this.programs[key] = { building: this._begin(key) }; }
  // one program would not build: say which, and carry on with the rest
  _buildFailed(key) {
    this._buildNote = false;
    if (key === 'surface') { this.cfg.camMode = this._fromMode || 'orbit'; this._note('Surface view unavailable on this GPU', true); }
    else this._note('This kind of world cannot be drawn on this GPU', true);
    this.onMode && this.onMode();   // the page's buttons follow the view that is left
  }
  // while a program builds: say what is being prepared, and (where builds run in the background) look
  // again each frame until one is ready. The notice goes when the view stops waiting for a build.
  _wait(key) {
    this._wantKey = key; this._wantAt = performance.now();
    const msg = key !== 'surface' ? 'Preparing this kind of world…' : this.cfg.isGasGiant ? 'Preparing the view into the clouds…' : 'Preparing the ground view…';
    if (!this._buildNote || !this._noteEl || this._noteEl.textContent !== msg) { this._note(msg); this._buildNote = true; }
    if (this._waiting || !this.parallel) return;
    this._waiting = true;
    const tick = () => {
      const gl = this.gl;
      const pending = Object.values(this.programs).filter((e) => e && e.building);
      const ready = !gl.isContextLost() && pending.some((e) => gl.getProgramParameter(e.building.p, this.parallel.COMPLETION_STATUS_KHR));
      if (gl.isContextLost() || !pending.length || ready) {
        this._waiting = false;
        if (!ready) { this._endBuildNote(); return; }
        // finish what is ready, tell the page (thumbnails wait on this), and draw: a running loop draws by itself
        for (const [k, e] of Object.entries(this.programs)) if (e && e.building && gl.getProgramParameter(e.building.p, this.parallel.COMPLETION_STATUS_KHR)) this._programFor(/^\d+$/.test(k) ? +k : k, true);
        this.onReady && this.onReady();
        this.requestDraw();
        if (Object.values(this.programs).some((e) => e && e.building)) this._wait(this._wantKey);   // another is still building
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  _endBuildNote() { if (this._buildNote) { this._buildNote = false; this._clearNote(); } }

  // (re)build GL resources. Run at construction and after a context restore (programs
  // + uniform locations are invalidated on loss). No program is built here: each is
  // built when a world or a view first needs it.
  _buildGL() {
    const gl = this.gl;
    this.programs = {};
    this.prog = null; this.u = null; this._waiting = false;
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    // one fullscreen triangle, shared by every program (aPos is location 0 in each)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return true;
  }

  _lost() {
    // _draw() bails while the context is lost; the rAF loop keeps ticking and self-heals on restore.
    this.prog = null; this.programs = {};
    this._losses += 1;
    this.cfg.resScale = Math.max(0.35, (this.cfg.resScale || 0.9) - 0.2);   // cheaper retry each time
    console.warn('[exomania] WebGL context lost (' + this._losses + ') · GPU:', this.renderer, '· retry resScale', this.cfg.resScale.toFixed(2));
    if (this._losses >= 3) { this.running = false; this._fail('The GPU kept dropping the WebGL context (' + this._losses + ' attempts).'); }
  }

  _restore() {
    if (this._losses >= 3) return;              // gave up — leave the diagnostic up
    if (!this.gl || !this._buildGL()) return;   // programs are rebuilt as _draw asks for them, in the background where possible
    this._clearFail();
    this._resize();
    console.info('[exomania] WebGL context restored');
    if (this.onDemand) { this._draw(); return; }
    if (!this.running) { this.running = true; requestAnimationFrame(this._frame); }   // else the existing loop picks it up
  }

  ok() { return !!this.gl; }
  /* the canvas changed size without the window changing (a page whose sheet holds it): fit the buffer again */
  resize() { this._resize(); }
  /* the view is waiting for a program to be built (a world's look or the ground): the page holds heavy work until it
     is not. A program started early and not yet asked for does not count: nothing waits on it. */
  building() { return !!(this._waiting || this._buildNote); }   // a lost context recovers, and a look that will not build says so when it is asked for
  load(params = {}) { Object.assign(this.cfg, params); this.requestDraw(); }
  /* one draw per animation frame at most, and none while the loop is already drawing */
  requestDraw() {
    if (this.running || this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => {
      this._pending = false;
      if (this.running) return;
      if (this._refined) { this._refined = false; this._setScale(this._baseScale || this.cfg.resScale); }
      this._draw();
      this._scheduleRefine();
    });
  }
  /* software tier: interact on a small buffer, then refine once the view rests */
  _scheduleRefine() {
    if (!this.software || this.still) return;
    clearTimeout(this._refineT);
    this._refineT = setTimeout(() => {
      if (this.running || this._pending) return;
      this._baseScale = this._baseScale || this.cfg.resScale;
      this._refined = true; this._setScale(0.85); this._draw();
    }, 450);
  }
  _setScale(s) {
    this.cfg.resScale = s;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * s)), h = Math.max(1, Math.round(this.canvas.clientHeight * s));
    const k = Math.min(1, 1600 / Math.max(w, h));
    this.canvas.width = Math.max(1, Math.round(w * k)); this.canvas.height = Math.max(1, Math.round(h * k));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  /* ---- public API: framing, camera and render options. Other modules use only these. ---- */
  /* centre the world at a principal-point offset (CSS px) and set its resting distance */
  frame(shift, homeDist) {
    // a camera still at its resting distance follows the new one, however small the change: a page whose layout
    // settles after the world opens (a font arrives) must not leave the camera a hair off home, as if it had been moved
    const atHome = Math.abs((this.cfg.camDist ?? NaN) - (this.cfg.homeDist ?? NaN)) < 1e-9;
    const resetDist = !this._anim && (atHome || Math.abs(homeDist - (this.cfg.homeDist || 0)) > 0.02 * homeDist);
    this.cfg.shift = shift; this.cfg.homeDist = homeDist;
    if (resetDist) this.cfg.camDist = homeDist;
    this.requestDraw();
  }
  get camera() {
    const c = this.cfg;
    return { mode: c.camMode || 'orbit', yaw: c.yaw, pitch: c.pitch, yaw0: HOME.yaw, pitch0: HOME.pitch, dist: c.camDist, homeDist: c.homeDist, fov: c.fov,
      closeR: c.closeR || 1.22, sunElev: c.sunElev ?? 14, lookYaw: c.lookYaw || 0, lookPitch: c.lookPitch || 0,
      shift: c.shift || [0, 0], resScale: c.resScale, moving: !!this._anim };
  }
  /* yaw, pitch, dist (planet radii), lookYaw, lookPitch, sunElev, mode ('orbit' | 'closeorbit') */
  setCamera(p = {}) {
    const c = this.cfg;
    if (p.mode && p.mode !== 'surface') c.camMode = p.mode;
    for (const [k, key] of [['yaw', 'yaw'], ['pitch', 'pitch'], ['dist', 'camDist'], ['lookYaw', 'lookYaw'], ['lookPitch', 'lookPitch'], ['sunElev', 'sunElev']]) {
      if (Number.isFinite(p[k])) c[key] = p[k];
    }
    this.requestDraw();
  }
  /* render options that are not physics: cloud and life (the illustrative layers) */
  /* the same world drawn another way (a scenario of its air, data.js), with the camera where it is. A change of
     look builds that look's program as any world would; until it is ready the last frame stays, under the notice. */
  restyle(params) {
    const A = this._anim;
    if (A && !A.swapped) A.params = { ...A.params, ...params };
    else Object.assign(this.cfg, params);
    this.requestDraw();
  }
  /* whether a world of this look can be drawn without building its program on the page's thread: the browser
     builds in the background, or the program is already built */
  canDraw(look) { return !!this.parallel || this._ready(look | 0); }
  setLayers({ cloud, life, plant } = {}) {
    if (Number.isFinite(cloud)) this.cfg.cloud = cloud;
    if (Number.isFinite(life)) this.cfg.life = life;
    if (Array.isArray(plant) && plant.length === 3 && plant.every(Number.isFinite)) this.cfg.plant = plant;
    this.requestDraw();
  }
  /* draw now, synchronously, for a capture in the same task. A change of world still in flight is
     finished first and the program is waited for, so the picture is the world the page names. */
  render() {
    const A = this._anim;
    if (A && !A.swapped) { Object.assign(this.cfg, A.params); A.swapped = true; A.onSwap && A.onSwap(); }
    if (A) { this.cfg.camDist = this.cfg.homeDist || 4.7; this.cfg.yaw = A.yaw0; this._anim = null; }
    this._block = true; this._draw(); this._block = false;
  }
  get buffer() { return this.canvas.width + 'x' + this.canvas.height; }
  set(key, val) { this.cfg[key] = val; this.requestDraw(); }
  /* land, or leave the ground. The ground program is built on the first landing; until it is ready
     the orbit view stays up under a notice (see _draw and _wait). */
  surface(on) {
    const c = this.cfg;
    if (on && this.programs.surface === null) { this._note('Surface view unavailable on this GPU', true); return; }   // it would not build: stay in the view we have
    if (on && c.camMode !== 'surface') this._fromMode = c.camMode;   // the view to hold while the ground builds, and to return to if it fails
    c.camMode = on ? 'surface' : 'orbit';
    this.requestDraw();
  }

  // returns { ro, fwd } for a camera mode (the one being drawn, which is not cfg.camMode while the ground builds)
  _camera(mode = this.cfg.camMode) {
    const cfg = this.cfg;
    if (mode === 'surface') {
      const L = vnorm(cfg.lightDir);
      let t = vcross(L, [0, 1, 0]);
      if (Math.hypot(t[0], t[1], t[2]) < 1e-3) t = vcross(L, [1, 0, 0]);
      t = vnorm(t);
      // stand where the star sits sunElev degrees above the horizon (time of day; on a
      // tidally locked world, the landing site: substellar, terminator or night side)
      const el = Math.max(-12, Math.min(80, cfg.sunElev ?? 14)) * Math.PI / 180;
      const up = vnorm(vadd(vscale(L, Math.sin(el)), vscale(t, Math.cos(el))));
      // float above the actual relief ceiling (amp/sqrt(g)) so the eye is never
      // buried regardless of landing site; an oblique look-down reveals the
      // procedural relief through shading + the curved horizon + star above it.
      const cap = (cfg.amp || 0.011) / Math.sqrt(Math.max(cfg.gRel || 1, 0.3));
      const ro = vscale(up, 1.0 + cap * 1.2 + 6e-6);
      const hd0 = vnorm(vsub(L, vscale(up, vdot(L, up))));   // star's horizontal bearing
      // look around: yaw about the local vertical, pitch from the default ~18 deg down
      const side = vnorm(vcross(up, hd0)), ly = cfg.lookYaw || 0;
      const hd = vnorm(vadd(vscale(hd0, Math.cos(ly)), vscale(side, Math.sin(ly))));
      const lp = Math.max(-1.2, Math.min(1.2, -0.12 + (cfg.lookPitch || 0)));   // star in frame on arrival
      const fwd = vnorm(vadd(vscale(hd, Math.cos(lp)), vscale(up, Math.sin(lp))));
      return { ro, fwd };
    }
    if (mode === 'closeorbit') {
      // low pass: 0.22 radii up, the horizon level across the frame a little above its middle, the
      // star ahead and out of frame, so its glitter lies on any sea and the air shows as a line on the limb
      const L = vnorm(cfg.lightDir);
      let t = vcross(L, [0, 1, 0]);
      if (Math.hypot(t[0], t[1], t[2]) < 1e-3) t = vcross(L, [1, 0, 0]);
      t = vnorm(t);
      const up = vnorm(vadd(vscale(L, 0.55), vscale(t, 0.84)));   // sub-camera point, day side
      const ro = vscale(up, cfg.closeR || 1.22);
      const hd = vnorm(vsub(L, vscale(up, vdot(L, up))));         // look along the orbit toward the star
      const fwd = vnorm(vsub(vscale(hd, 0.79), vscale(up, 0.615))); // 38 degrees below the horizontal
      return { ro, fwd };
    }
    // orbit: the camera circles in the plane of the star (orbit.js), so a sideways turn reaches the night
    // side with the star beyond the limb
    const ro = vscale(orbitDir(cfg.yaw, cfg.pitch, cfg.lightDir), cfg.camDist);
    return { ro, fwd: vnorm(vscale(ro, -1)) };
  }

  /* How far the exposure opens on the ground: the light the ground returns where the eye stands
     (its mean reflectance under the star at this elevation, plus its own glow if it is hot), against
     the 0.11 an 18% grey returns under a star 38 degrees up, taken to the power 0.75: an eye adapts
     most of the way, and a dim scene should still read as dim. Between 1 and 6 times. */
  _groundExposure() {
    const c = this.cfg;
    const el = Math.max(-12, Math.min(80, c.sunElev ?? 14)) * Math.PI / 180, cz = Math.sin(el);
    const luma = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const albedo = 0.5 * (luma(c.colA) + luma(c.colB));
    let key = c.type === 6 ? 0.13 * 0.15 : albedo * Math.max(cz, 0.06);
    if (c.glowT > 0) {
      const T = c.locked ? Math.max(c.tsub * Math.pow(Math.max(cz, 0), 0.25), c.tnight) : c.tsub;
      const wien = [23587, 26160, 30942];
      key += luma(c.glow.map((g, i) => g * Math.exp(-wien[i] * (1 / Math.max(T, 150) - 1 / c.glowT))));
    }
    return Math.max(1, Math.min(6, Math.pow(0.11 / Math.max(key, 1e-4), 0.75)));
  }

  // octave LOD from the planet's apparent radius in pixels
  _lod(mode = this.cfg.camMode) {
    const cfg = this.cfg;
    if (mode === 'surface' || mode === 'closeorbit') {
      // march/shadow budget scales with resScale (dGPU full / iGPU / mobile)
      const rs = this.still ? 1.0 : cfg.resScale;
      const marchSteps = rs >= 0.85 ? 128 : rs >= 0.7 ? 96 : 80;
      const shadowSteps = rs >= 0.85 ? 16 : 0;
      return { oct: mode === 'closeorbit' ? 8 : 7, last: 1.0, marchSteps, shadowSteps };
    }
    const halfFov = Math.atan(0.5 / cfg.fov);
    const angR = Math.asin(Math.min(1 / cfg.camDist, 1));
    const rpx = (angR / halfFov) * (this.canvas.height / 2);
    const o = Math.max(3, Math.min(7, Math.log2(Math.max(rpx, 1) / 8)));
    const oct = Math.ceil(o);
    const last = oct - Math.floor(o) === 0 ? 1.0 : (o - Math.floor(o));
    return { oct: Math.max(3, oct), last };
  }

  _resize() {
    if (!this.gl) return;
    const scale = this.still ? 1.0 : this.cfg.resScale;
    let w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    let h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    // Cap the long edge. The per-pixel cost is high (procedural surface + analytic
    // atmosphere); on a 2560/4K monitor an uncapped buffer is what can trip the
    // watchdog on the first frame. Bounding it keeps the worst-case frame near what
    // a phone / the Black-Hole shader already survive; CSS upscales to fill.
    const MAXLONG = 1600, long = Math.max(w, h);
    if (long > MAXLONG) { const k = MAXLONG / long; w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k)); }
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    this.requestDraw();
  }

  start() {
    if (!this.gl || this.running) return;
    if (this.onDemand) { this.started = true; this._draw(); return; }
    this.started = true;
    this.running = true; this._last = 0; requestAnimationFrame(this._frame);
  }
  stop() { this.running = false; }
  /* pause the loop while the page is hidden or the canvas is scrolled away */
  setVisible(v) {
    this._visible = v;
    if (this.onDemand || !this.started) return;
    if (v && !this.running) { this.running = true; this._last = 0; requestAnimationFrame(this._frame); }
    if (!v) this.running = false;
  }
  _frame(now) {
    if (!this.running) return;
    if (this._last) this._govern(now - this._last);
    this._last = now;
    this._step(now);
    this._draw();
    requestAnimationFrame(this._frame);
  }
  /* frame-time governor: step the buffer down when frames run long, back up when cheap */
  _govern(dt) {
    const f = this._ft; f.push(dt); if (f.length > 40) f.shift();
    if (f.length < 40) return;
    const sorted = f.slice().sort((x, y) => x - y), med = sorted[20];
    this.stats.ms = med; this.stats.fps = Math.round(1000 / med);
    const rs = this.cfg.resScale;
    if (med > 40 && rs > 0.45) { this.cfg.resScale = Math.max(0.45, rs - 0.15); this._ft = []; this._resize(); }
    else if (med < 14 && rs < 0.9) { this.cfg.resScale = Math.min(0.9, rs + 0.1); this._ft = []; this._resize(); }
  }
  /* camera choreography: a fly-out, a target swap at the far point, a fly-in */
  flyTo(params, { from = null, dur = 1700, onSwap } = {}) {
    const instant = this.onDemand || !this.started;
    if (instant) {
      Object.assign(this.cfg, params);
      this.cfg.camDist = this.cfg.homeDist || 4.7;
      onSwap && onSwap();
      this.requestDraw();
      return;
    }
    const startDist = from ?? this.cfg.camDist;
    const out = this._anim && !this._anim.fromFar ? this._anim : null;   // a second choice while still out: turn there, do not fly further
    this._anim = { t0: performance.now(), dur, startDist, far: out ? out.far : Math.max(16, startDist * 3), params, swapped: false, onSwap,
      yaw0: out ? out.yaw0 : this.cfg.yaw };
  }
  _step(now) {
    const A = this._anim; if (!A) return;
    if (this.gl.isContextLost()) { A.t0 = now - (A.at || 0); return; }   // the move waits for the context, where it was
    const built = (k) => !!this._programFor(k | 0) || this.programs[k | 0] === null;   // ready, or failed for good
    const home = this.cfg.homeDist || 4.7;
    const out = 0.32;   // fraction of the move spent flying out
    // the opening arrival waits for the first world's program: there is nothing to arrive at before it
    if (A.fromFar && this.cfg.type >= 0 && this.cfg.camMode !== 'surface' && !built(this.cfg.type)) { A.t0 = now; this.cfg.camDist = A.far; return; }
    A.at = now - A.t0;
    const t = Math.min(1, (now - A.t0) / A.dur);
    if (t < out && !A.fromFar) {
      const u = t / out, e = u * u * u;
      this.cfg.camDist = A.startDist + (A.far - A.startDist) * e;
    } else {
      if (!A.swapped) {
        // the new world's look may still be building: hold at the far point until it is ready (or has failed)
        const look = A.params.type;
        if (look >= 0 && this.cfg.camMode !== 'surface' && !built(look)) { A.t0 = now - out * A.dur; A.at = out * A.dur; this.cfg.camDist = A.far; return; }
        Object.assign(this.cfg, A.params); A.swapped = true; A.onSwap && A.onSwap();
      }
      const u = A.fromFar ? t : (t - out) / (1 - out), e = 1 - Math.pow(1 - u, 4);
      this.cfg.camDist = A.far + (home - A.far) * e;
      this.cfg.yaw = A.yaw0 + (1 - e) * 0.9;
    }
    if (t >= 1) { this.cfg.camDist = home; this.cfg.yaw = A.yaw0; this._anim = null; }
  }
  /* the opening ignition: start far out and arrive */
  arrive(dur = 2600) {
    if (this.onDemand) return;
    this.cfg.camDist = 34;
    this._anim = { t0: performance.now(), dur, startDist: 34, far: 34, params: {}, swapped: true, fromFar: true, yaw0: this.cfg.yaw };
  }
  /* a square thumbnail of another world, rendered by this same pipeline, then restore */
  snapshot(params, size = 150) {
    if (!this.gl || this.gl.isContextLost()) return null;
    // A look this browser has not built yet: start the build and give no picture now. onReady tells the
    // page when to ask again. (A still frame waits instead: it has one chance to draw.)
    const look = params.type | 0;
    if (!this.still && !this._ready(look)) { if (this.programs[look] !== null) this._programFor(look); return null; }
    const saved = { ...this.cfg };
    Object.assign(this.cfg, params, { shift: [0, 0], camMode: 'orbit', camDist: 4.2, yaw: HOME.yaw, pitch: HOME.pitch });
    this._block = true;
    this._draw();
    const g = this.canvas, side = Math.min(g.width, g.height) * 0.92;
    const c = document.createElement('canvas'); c.width = c.height = size;
    try { c.getContext('2d').drawImage(g, (g.width - side) / 2, (g.height - side) / 2, side, side, 0, 0, size, size); } catch (_) { /* lost */ }
    for (const k of Object.keys(this.cfg)) if (!(k in saved)) delete this.cfg[k];
    Object.assign(this.cfg, saved);
    this._block = false;
    this._draw();
    return c;
  }
  _draw() {
    const gl = this.gl; if (!gl || gl.isContextLost()) return;
    if (!(this.cfg.type >= 0)) return;                    // no world loaded yet: nothing to draw, and nothing worth building
    // Follow camMode every frame: the ground program when it is ready, else the orbit program of the
    // world's look. A still frame, a thumbnail and an export wait for their program; the live view
    // keeps its last frame (or the orbit view, while the ground is building) and switches when it can.
    const block = this.still || !!this._block;
    const cfg = this.cfg, look = cfg.type | 0;
    let entry = cfg.camMode === 'surface' ? this._programFor('surface', block) : null;
    const wantSurface = !!entry;
    // The view drawn: the ground once its program is ready; while it builds, the view the visitor came
    // from, with that view's camera (the ground camera through an orbit program has no level horizon).
    const mode = wantSurface ? 'surface' : cfg.camMode === 'surface' ? (this._fromMode || 'orbit') : cfg.camMode;
    if (!entry) {
      if (cfg.camMode === 'surface' && this._building('surface') && this.programs[look] === undefined) return;   // landing by a link: do not build the orbit view only to cover the wait
      entry = this._programFor(look, block);
    }
    if (!entry) return;
    this.prog = entry.prog; this.u = entry.u;
    const u = this.u;
    gl.useProgram(this.prog);
    const cam = this._camera(mode);
    const lod = this._lod(mode);

    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    const k = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    gl.uniform2f(u.uShift, (cfg.shift[0] || 0) * k, (cfg.shift[1] || 0) * k);
    // cfg.time, when set, fixes the clock: a measurement must show the same face of a spinning world every run
    gl.uniform1f(u.uTime, Number.isFinite(cfg.time) ? cfg.time : (performance.now() - this.t0) / 1000);
    gl.uniform3fv(u.uCam, cam.ro);
    gl.uniform3fv(u.uFwd, cam.fwd);
    gl.uniform1f(u.uFov, mode === 'surface' ? 1.0 : mode === 'closeorbit' ? 1.25 : cfg.fov);
    gl.uniform1f(u.uExposure, cfg.exposure * (wantSurface ? this._groundExposure() : 1));
    gl.uniform1f(u.uRaw, cfg.raw ? 1 : 0);

    gl.uniform3fv(u.uLightDir, cfg.lightDir);
    gl.uniform3fv(u.uStarColor, cfg.starColor);
    gl.uniform3fv(u.uStarSurf, cfg.starSurf);
    gl.uniform1f(u.uStarAngle, cfg.starAngle);
    gl.uniform1f(u.uStarActivity, cfg.starActivity);
    gl.uniform1f(u.uStarSpots, cfg.starSpots);
    gl.uniform1f(u.uStarTeff, cfg.starTeff);
    gl.uniform3fv(u.uStarSpin, cfg.starSpin);
    gl.uniform1f(u.uLightMul, cfg.lightMul);
    gl.uniform1f(u.uBgBright, cfg.bgBright);

    gl.uniform1i(u.uType, cfg.type | 0);
    gl.uniform1i(u.uIsGasGiant, cfg.isGasGiant | 0);
    gl.uniform1i(u.uLocked, cfg.locked | 0);
    gl.uniform1i(u.uSurfaceMode, mode === 'surface' ? 1 : mode === 'closeorbit' ? 2 : 0);   // follow the program actually bound, not just camMode (they differ while the surface program is still compiling / unavailable)
    gl.uniform1f(u.uSeed, cfg.seed);
    gl.uniform1f(u.uSpin, cfg.spin);
    gl.uniform1f(u.uSeaLevel, cfg.seaLevel);
    gl.uniform1f(u.uContFreq, cfg.contFreq);
    gl.uniform1f(u.uMtnFreq, cfg.mtnFreq);
    gl.uniform1f(u.uBump, cfg.bump);
    gl.uniform1f(u.uTempBias, cfg.tempBias);
    gl.uniform1f(u.uIceCap, cfg.iceCap);
    gl.uniform1f(u.uLife, cfg.life);
    gl.uniform3fv(u.uPlant, cfg.plant);
    gl.uniform1f(u.uCloud, cfg.cloud);
    gl.uniform1f(u.uBandFreq, cfg.bandFreq);
    gl.uniform1f(u.uBandContrast, cfg.bandContrast);
    gl.uniform1f(u.uStorm, cfg.storm);
    gl.uniform1f(u.uCrater, cfg.crater);
    gl.uniform3fv(u.uColA, cfg.colA);
    gl.uniform3fv(u.uColB, cfg.colB);
    gl.uniform3fv(u.uColC, cfg.colC);
    gl.uniform3fv(u.uGlow, cfg.glow);
    gl.uniform1f(u.uGlowT, cfg.glowT);
    gl.uniform1f(u.uTsub, cfg.tsub);
    gl.uniform1f(u.uTnight, cfg.tnight);

    // On the ground the relief is drawn several times its true height (data.js amp), so the air is
    // drawn to match: at least four relief heights per e-folding, or the peaks would stand in vacuum.
    // Its optical depth stays the real one.
    const hvis = wantSurface ? Math.max(cfg.hvis, 4 * (cfg.amp || 0.011) / Math.sqrt(Math.max(cfg.gRel || 1, 0.3))) : cfg.hvis;
    gl.uniform1f(u.uAtmR, wantSurface ? 1 + 7 * hvis : cfg.atmR);
    gl.uniform1f(u.uHvis, hvis);
    gl.uniform3fv(u.uTauR, cfg.tauR);
    gl.uniform1f(u.uTauM, cfg.tauM);
    gl.uniform3fv(u.uHazeCol, cfg.hazeCol);
    gl.uniform1f(u.uMieG, cfg.mieG);
    gl.uniform1f(u.uHasAtmo, cfg.hasAtmo);

    gl.uniform1i(u.uOctaves, lod.oct | 0);
    gl.uniform1f(u.uLastAmp, lod.last);

    // procedural explorable surface
    gl.uniform1f(u.uAmp, cfg.amp);
    gl.uniform1i(u.uTerrStyle, cfg.terrStyle | 0);
    gl.uniform1f(u.uSeaY, cfg.seaY);
    gl.uniform1f(u.uTfreeze, cfg.tfreeze);
    gl.uniform1f(u.uGRel, cfg.gRel);
    gl.uniform1i(u.uMarchSteps, (lod.marchSteps ?? cfg.marchSteps) | 0);
    gl.uniform1i(u.uShadowSteps, (lod.shadowSteps ?? cfg.shadowSteps) | 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // a frame is up and nothing has asked to wait for a build for a quarter of a second: the notice goes
    if (this._buildNote && performance.now() - (this._wantAt || 0) > 250) this._endBuildNote();
  }

  _bindPointer() {
    const cv = this.canvas;
    // wide multiplicative zoom range: close skim (1.15) out to a system view where
    // the planet is a speck and the host star sits at its real angular size (60).
    const ZMIN = 1.15, ZMAX = 60.0;
    const redraw = () => { this.requestDraw(); };
    const zoomBy = (factor) => { this.cfg.camDist = Math.max(ZMIN, Math.min(ZMAX, this.cfg.camDist * factor)); redraw(); };
    this.zoomBy = (factor) => { zoomBy(factor); this.onCamera && this.onCamera(); };   // for the page's own keys
    this.engaged = false;   // with wheelNeedsFocus: whether the wheel zooms (the planet has been pressed); the page ends it

    let down = false, lx = 0, ly = 0;
    const dn = (x, y) => { down = true; lx = x; ly = y; };
    // in orbit the pitch stops where orbit.js says, short of the roll the shader makes near the scene's pole
    const tilt = (d) => { const most = pitchMax(this.cfg.lightDir); this.cfg.pitch = Math.max(-most, Math.min(most, this.cfg.pitch + d)); };
    const mv = (x, y) => {
      if (!down) return;
      if (this.cfg.camMode === 'surface') {      // on the ground, drag looks around
        this.cfg.lookYaw = (this.cfg.lookYaw || 0) - (x - lx) * 0.005;
        this.cfg.lookPitch = Math.max(-0.9, Math.min(1.5, (this.cfg.lookPitch || 0) + (y - ly) * 0.004));
      } else {
        this.cfg.yaw   -= (x - lx) * 0.006;
        tilt((y - ly) * 0.006);
      }
      lx = x; ly = y;
      redraw();
    };
    const up = () => { if (down && this.onCamera) this.onCamera(); down = false; };
    // keyboard: arrows orbit (or look around on the ground), + and - zoom
    cv.addEventListener('keydown', (e) => {
      const k = e.key, step = 0.08;
      const surf = this.cfg.camMode === 'surface';
      if (k === 'ArrowLeft' || k === 'ArrowRight') { surf ? (this.cfg.lookYaw = (this.cfg.lookYaw || 0) + (k === 'ArrowLeft' ? step : -step)) : (this.cfg.yaw += k === 'ArrowLeft' ? step : -step); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        if (surf) this.cfg.lookPitch = Math.max(-0.9, Math.min(1.5, (this.cfg.lookPitch || 0) + (k === 'ArrowUp' ? step : -step)));
        else tilt(k === 'ArrowUp' ? step : -step);
      } else if (k === '+' || k === '=') zoomBy(1 / 1.12);
      else if (k === '-' || k === '_') zoomBy(1.12);
      else return;
      e.preventDefault(); redraw(); this.onCamera && this.onCamera();
    });
    cv.addEventListener('mousedown', (e) => { this.engaged = true; dn(e.clientX, e.clientY); });
    window.addEventListener('mousemove', (e) => mv(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);

    // touch: 1 finger orbits, 2 fingers pinch-zoom. Whose a one-finger touch is, the page's or the view's, is
    // decided once it has travelled a little (orbit.js touchTurns): a scroll of the page does not turn the world.
    let pinch = 0, sx = 0, sy = 0, whose = null, pans = false;
    const pdist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    cv.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) { pinch = pdist(e.touches); down = false; whose = false; }
      else { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; whose = null; pans = /pan-y/.test(getComputedStyle(cv).touchAction); }
    }, { passive: true });
    cv.addEventListener('touchmove', (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const d = pdist(e.touches);
        if (pinch > 0 && d > 0) zoomBy(pinch / d);   // spread (d>pinch) -> factor<1 -> zoom in
        pinch = d;
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        if (whose === null) {
          whose = e.cancelable === false ? false : touchTurns(t.clientX - sx, t.clientY - sy, pans);   // not cancelable: the browser is already scrolling
          if (whose) dn(sx, sy);   // the turn counts from where the finger came down
        }
        if (whose) { if (e.cancelable) e.preventDefault(); mv(t.clientX, t.clientY); }
      }
    }, { passive: false });
    cv.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = 0; if (e.touches.length === 0) up(); }, { passive: true });
    cv.addEventListener('touchcancel', () => { pinch = 0; up(); }, { passive: true });   // the browser took the gesture for a scroll

    // as on a map in a page: the wheel zooms once the planet has been pressed, until the page ends it (engaged false);
    // before that it scrolls the page, and onIdleWheel lets the page say how to zoom
    cv.addEventListener('wheel', (e) => {
      if (this.wheelNeedsFocus && !this.engaged) { if (this.onIdleWheel) this.onIdleWheel(e); return; }
      e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12); this.onCamera && this.onCamera();
    }, { passive: false });
  }

  // a soft failure notice OVER the canvas (never replaces it, so a later context
  // restore can clear it and render). Shows the GPU id so the cause is visible.
  _fail(msg) {
    if (this._failEl) { this._failEl.querySelector('.exo-fail-msg').textContent = msg; return; }
    const m = document.createElement('div');
    m.className = 'exo-nowebgl'; m.id = 'exo-fail';
    m.innerHTML = '<div class="exo-fail-card"><div class="exo-fail-msg"></div>'
      + '<div class="exo-fail-gpu">' + (this.renderer ? 'GPU: ' + this.renderer : '') + '</div></div>';
    m.querySelector('.exo-fail-msg').textContent = msg;
    (this.failHost || document.getElementById('exo-stage') || document.body).appendChild(m);
    this._failEl = m;
  }
  _clearFail() { if (this._failEl) { this._failEl.remove(); this._failEl = null; } }

  // a short notice (e.g. "Preparing the ground view"); sticky = it clears itself after a beat. A page that gives
  // the engine a noteHost (a fixed line of its own) gets the words there, where they cover nothing.
  _note(msg, sticky) {
    this._clearNote();
    const n = document.createElement(this.noteHost ? 'span' : 'div');
    n.id = 'exo-note'; n.className = 'exo-note'; n.textContent = msg;
    (this.noteHost || document.getElementById('exo-stage') || document.body).appendChild(n);
    this._noteEl = n;
    this._buildNote = false;
    if (sticky) setTimeout(() => { if (this._noteEl === n) this._clearNote(); }, 3200);   // only its own notice, not a later one
  }
  _clearNote() { if (this._noteEl) { this._noteEl.remove(); this._noteEl = null; } }
}
