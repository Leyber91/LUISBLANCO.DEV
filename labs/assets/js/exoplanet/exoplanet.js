/* ============================================================
   exoplanet.js — a ray-traced procedural exoplanet with a real
   single-scattering atmosphere, seen through a starship viewport.

   Raw WebGL1, one full-screen fragment shader (no Three.js).
   Per pixel: intersect a unit sphere; shade a procedural surface
   (domain-warped continents, ridged mountains, climate biomes,
   ocean glint, clouds, ice caps, night lights, gas-giant bands,
   lava rifts); then integrate a Rayleigh+Mie atmospheric shell
   (true scale height -> visible thickness; blue day-limb; red
   terminator; outer halo) using an analytic Chapman optical
   depth. A blackbody host star lights one hemisphere and is
   drawn as a real disk sized by its angular diameter, so you can
   orbit to find it — or drop to the surface and watch it hang in
   the alien sky.

   Physics per planet is computed in data.js (deterministic).
   Performance: octave LOD by apparent size + coherent uniform
   gates for gas giants / airless worlds.

   Units: planet radius = 1.
   API: new Exoplanet(canvas); .load(params); .start()/.stop();
        .set(k,v); .surface(on); drag to orbit, wheel to zoom.
   ?still (window.__EXO_STILL__) renders a single frame.
   ============================================================ */

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;
uniform vec3  uFwd;
uniform float uFov;
uniform float uExposure;

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

uniform int   uType;
uniform int   uIsGasGiant;
uniform int   uSteam;
uniform int   uSurfaceMode;  // 1 when the camera is on/inside the world
uniform float uSeed;
uniform float uSpin;
uniform float uSeaLevel;
uniform float uContFreq;
uniform float uMtnFreq;
uniform float uBump;
uniform float uTempBias;
uniform float uIceCap;
uniform float uLife;
uniform float uCloud;
uniform float uBandFreq;
uniform vec3  uColA;
uniform vec3  uColB;
uniform vec3  uColC;
uniform float uSurfAlbedo;
uniform float uEmiss;
uniform vec3  uEmissColor;

// atmosphere
uniform float uAtmR;
uniform float uHr;
uniform vec3  uBetaR;
uniform float uBetaM;
uniform float uMieG;
uniform float uHaze;
uniform vec3  uSkyTint;
uniform float uHasAtmo;
uniform float uScatter;

// perf LOD
uniform int   uOctaves;
uniform float uLastAmp;

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
  float gr  = ang / aR;
  float bloom = 4.0*exp(-gr*gr*0.5) + 1.5*exp(-gr*1.0) + 0.5/(1.0 + gr*gr*8.0);
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
  float R_OUT = mix(2.6, 4.0, act);
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

// ---------- background: starfield + nebula + the host star ----------
vec3 background(vec3 dir){
  vec3 d = normalize(dir);
  vec3 col = vec3(0.0);
  for(int k=0;k<2;k++){
    float sc = 240.0 + float(k)*470.0;
    vec3 id = floor(d*sc);
    float h = hash(id);
    if(h > 0.984){
      vec3 cell = (id+0.5)/sc;
      float dd = 1.0 - clamp(length(normalize(cell)-d)*sc*0.9, 0.0, 1.0);
      float star = pow(dd, 6.0) * (h-0.984)/0.016;
      vec3 tint = mix(vec3(0.8,0.86,1.0), vec3(1.0,0.86,0.62), hash(id+7.0));
      col += star*tint*1.4;
    }
  }
  float n  = fbm3(d*3.0 + 11.0);
  float n2 = fbm3(d*6.0 - 4.0);
  vec3 neb = mix(vec3(0.012,0.02,0.04), vec3(0.045,0.022,0.065), n2);
  neb += vec3(0.09,0.045,0.012)*pow(n,4.0);
  neb += vec3(0.01,0.04,0.08)*pow(n2,4.0);
  col += neb*0.55*uBgBright;
  col += renderStar(d);
  return col;
}

// ---------- surface climate colour (temperate worlds) ----------
vec3 landColor(float e, float lat, float moist){
  float warm = clamp(uTempBias + 0.15 - lat*1.05 - e*0.55, 0.0, 1.0);
  vec3 desert=vec3(0.62,0.48,0.26), savanna=vec3(0.45,0.42,0.18),
       grass=vec3(0.12,0.26,0.09), forest=vec3(0.05,0.16,0.05),
       jungle=vec3(0.04,0.20,0.06), tundra=vec3(0.34,0.34,0.30), rock=vec3(0.26,0.22,0.18);
  vec3 hot = mix(desert, jungle, smoothstep(0.3,0.75,moist));
  vec3 mid = mix(savanna, mix(grass,forest,smoothstep(0.4,0.8,moist)), smoothstep(0.2,0.6,moist));
  vec3 cold= mix(tundra, grass*0.7+vec3(0.05), smoothstep(0.5,0.85,moist));
  vec3 col = mix(cold, mid, smoothstep(0.25,0.55,warm));
  col = mix(col, hot, smoothstep(0.55,0.85,warm));
  col = mix(col, rock, smoothstep(0.5,0.78,e));
  return col;
}

// ---------- lit surface (no atmosphere) ----------
vec3 shadeSurface(vec3 pos, vec3 rd){
  vec3 n = normalize(pos);
  vec3 V = -rd;
  vec3 L = normalize(uLightDir);
  float ang = uTime*uSpin;
  vec3 sp = rotY(ang)*n;
  float lat = abs(n.y);
  float sl = clamp(uLightMul, 0.65, 1.5);   // surface light: tempered so hot worlds keep colour

  if(uIsGasGiant == 1){
    // wavy sheared bands (turbulent latitude) at two scales
    float warp = fbm(sp*3.0 + uSeed) - 0.5;
    float lat2 = n.y + 0.10*warp;
    float bands = pow(0.5 + 0.5*sin(lat2*uBandFreq), 1.7);
    float fine  = 0.5 + 0.5*sin(lat2*uBandFreq*2.3 + (fbm(sp*5.0+uSeed)-0.5)*6.0);
    vec3 albedo = mix(uColA, uColB, bands);
    albedo = mix(albedo, mix(uColA, uColB, 0.5), fine*0.3);
    // fine turbulent curl detail riding the bands
    float turb = fbm(vec3(sp.x*10.0, sp.y*24.0, sp.z*10.0) + uTime*0.03);
    albedo = mix(albedo, uColC, smoothstep(0.6,0.92,turb)*0.28);
    // a couple of storm ovals with bright cores
    float st1 = smoothstep(0.965,0.995, dot(normalize(sp), normalize(vec3(0.7,-0.35,0.6))));
    float st2 = smoothstep(0.975,0.997, dot(normalize(sp), normalize(vec3(-0.55,0.3,0.78))));
    albedo = mix(albedo, uColC*1.2+0.05, st1*0.7);
    albedo = mix(albedo, mix(uColA, vec3(1.0), 0.3), st2*0.55);
    albedo *= 1.0 - 0.3*smoothstep(0.55,1.0,lat);                // pole darkening
    albedo = mix(albedo, vec3(dot(albedo,vec3(0.33))), uHaze*0.6); // haze greys it out
    albedo *= (0.10 + uSurfAlbedo*1.6);                          // reflectivity (hot Jupiters dark)
    float ndl = dot(n,L);
    float day = smoothstep(-0.12,0.25,ndl);
    return albedo*(0.05 + day*1.0)*sl;
  }

  float cont = terrain(sp*uContFreq + uSeed);
  float land = smoothstep(uSeaLevel, uSeaLevel+0.02, cont);
  float mtn  = ridged(sp*uMtnFreq + uSeed*1.7);
  float h = cont + land*mtn*0.35;
  float e = clamp((h-uSeaLevel)/max(1.0-uSeaLevel,0.001), 0.0, 1.0);

  // 4-tap tetrahedron normal (vs 6-tap) from a cheap fbm
  vec2 kk = vec2(1.0,-1.0); float eps=0.02; float F=uContFreq*1.6;
  vec3 g = kk.xyy*fbm((sp+kk.xyy*eps)*F+uSeed) + kk.yyx*fbm((sp+kk.yyx*eps)*F+uSeed)
         + kk.yxy*fbm((sp+kk.yxy*eps)*F+uSeed) + kk.xxx*fbm((sp+kk.xxx*eps)*F+uSeed);
  vec3 nb = normalize(n - uBump*land*(g - dot(g,n)*n));

  float specMask=0.0;
  vec3 albedo;
  if(uType==0){
    float moist = fbm(sp*1.6+30.0+uSeed);
    if(cont<uSeaLevel && uSteam==0){
      float depth=clamp((uSeaLevel-cont)/max(uSeaLevel,0.001),0.0,1.0);
      albedo = mix(uColA, uColA*0.35, pow(depth,0.7));
      specMask = 1.0;
    } else {
      albedo = landColor(e,lat,moist);
    }
    float ice = smoothstep(uIceCap,uIceCap+0.12,lat)+smoothstep(0.74,0.95,e);
    albedo = mix(albedo, vec3(0.92,0.95,1.0), clamp(ice,0.0,1.0));
    albedo *= (0.55 + uSurfAlbedo*1.5);
  } else if(uType==2){
    albedo = mix(uColA, uColB, cont);
    float fis = fbm(sp*8.0+uSeed);
    albedo = mix(albedo, vec3(0.3,0.46,0.6), smoothstep(0.55,0.62,fis)*0.4);
    specMask = 0.4;
  } else {
    vec3 crust = mix(uColA, uColB, cont);
    float c1 = 1.0 - smoothstep(0.0,0.05, abs(fbm(sp*4.0+uSeed)-0.5));
    float c2 = 1.0 - smoothstep(0.0,0.03, abs(fbm(sp*9.0+uSeed+3.0+uTime*0.06)-0.5));
    albedo = mix(crust, uColC, clamp(c1*0.85+c2*0.6,0.0,1.0));
  }

  float ndl = dot(nb,L);
  float day = smoothstep(-0.08,0.22,ndl);
  vec3 col = albedo*(0.04 + day*1.06)*sl;

  vec3 hlf = normalize(L+V);
  float gl = pow(max(dot(nb,hlf),0.0),200.0)*specMask*day;
  col += uStarColor*gl*1.6*sl;

  if(uCloud>0.0){
    vec3 cA=rotY(ang*1.25)*n;
    float cl=smoothstep(0.55,0.78, fbm(cA*3.0+21.0))*uCloud;
    col *= 1.0-0.2*cl*day;
    col = mix(col, vec3(0.96)*(0.04+day)*sl, cl);
  }
  float night=1.0-day;
  if(uType==0){
    float onLand=step(uSeaLevel,cont);
    float grid=pow(fbm(sp*40.0+70.0+uSeed),6.0);
    col += vec3(1.0,0.82,0.45)*onLand*grid*smoothstep(0.85,0.4,lat)*uLife*night*2.2;
  }
  // aurora: thin curtains in an oval ring around the magnetic poles, night side,
  // driven by atmosphere + stellar-wind strength (active stars -> brighter aurorae)
  if(uHasAtmo > 0.05 && uType != 1){
    float ringC = uIceCap*0.85 + 0.12;
    float ovalN = (fbm(vec3(sp.x*4.0, 0.0, sp.z*4.0)) - 0.5)*0.06;
    float band = exp(-pow((lat - ringC - ovalN)/0.06, 2.0));     // narrow auroral oval
    float curtains = pow(smoothstep(0.45,0.78, fbm(vec3(sp.x*34.0, sp.y*5.0, sp.z*34.0) + uTime*0.5)), 2.0);
    float aur = band * curtains * night * uHasAtmo * (0.25 + uStarActivity*1.2);
    vec3 auroraCol = mix(vec3(0.10,0.95,0.45), vec3(0.55,0.2,0.95), smoothstep(0.0,0.05,lat-ringC));
    col += auroraCol * aur * 1.3;
  }
  return col;
}

// ---------- atmosphere (single scattering shell) ----------
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
float chapman(float X, float c){
  float Xs = sqrt(0.5*PI*X);
  if(c >= 0.0) return Xs/((Xs-1.0)*c + 1.0);
  float cc=-c, sh=sqrt(max(1.0-cc*cc,0.0));
  float up = Xs/((Xs-1.0)*cc + 1.0);
  return 2.0*Xs*exp(min(X*(1.0-sh), 60.0)) - up;
}
vec3 atmosphere(vec3 ro, vec3 rd, vec3 bg, bool planetHit, float tSurface){
  vec2 atm = raySph(ro, rd, uAtmR);
  if(atm.x > atm.y) return bg;
  vec3 L = normalize(uLightDir);
  if(uHasAtmo < 0.01){
    if(planetHit){ vec3 n=normalize(ro+rd*tSurface);
      return bg + uStarColor*pow(1.0-max(dot(n,-rd),0.0),8.0)*0.10*uLightMul; }
    return bg;
  }

  // Orbit halo: when the camera is OUTSIDE the shell and the ray misses the planet,
  // draw a clean UNIFORM atmospheric ring by impact parameter — not the two-lobe
  // phase-function halo that reads as a "sock". Visible all the way around.
  bool inside = dot(ro,ro) < uAtmR*uAtmR;
  if(!planetHit && !inside){
    float bb = dot(ro, rd);
    float dca = sqrt(max(dot(ro,ro) - bb*bb, 0.0));        // closest approach to centre
    float ring = pow(clamp(smoothstep(uAtmR, 1.0, dca), 0.0, 1.0), 0.55);
    vec3 graze = normalize(ro + rd*(-bb));
    float lit = 0.32 + 0.68*smoothstep(-0.25, 0.6, dot(graze, normalize(uLightDir)));
    vec3 skyHue = normalize(uBetaR + 1e-3) * uSkyTint * uStarColor;
    vec3 mieHue = uStarColor;                              // forward Mie whitening near the sun
    float fwd = pow(max(dot(rd, normalize(uLightDir)), 0.0), 8.0);
    vec3 rim = skyHue * ring * lit * (0.6 + uScatter*0.03)
             + mieHue * ring * fwd * uHaze * 0.5;
    return bg + rim * uHasAtmo;
  }

  float t0 = max(atm.x, 0.0);
  float t1 = planetHit ? min(atm.y, tSurface) : atm.y;
  if(t1 <= t0) return bg;

  // e-folding capped so the shell always has a real falloff (giants don't wash flat)
  float Hvis = clamp(uHr*50.0, 0.004, 0.06);
  float Hm = Hvis*0.15;
  float mu = dot(rd, L);
  float pr = phaseR(mu), pm = phaseM(mu, uMieG);
  vec3 betaExt = uBetaR + vec3(uBetaM*1.1);
  float lm = clamp(uLightMul, 0.6, 1.6);   // tempered for in-scatter brightness

  const int STEPS = 8;
  float segLen = t1 - t0;
  vec3 sumR = vec3(0.0); float sumM = 0.0, odR = 0.0, odM = 0.0;
  for(int i=0;i<STEPS;i++){
    float fi=(float(i)+0.5)/float(STEPS);
    float t = t0 + segLen*fi*fi;
    float dt = segLen*(2.0*fi/float(STEPS));
    vec3 p = ro+rd*t; float r=length(p); float h=r-1.0;
    float dR=exp(-h/Hvis)*dt, dM=exp(-h/Hm)*dt;
    odR+=dR; odM+=dM;
    vec3 upd=p/r; float cz=dot(upd,L);
    float lodR=Hvis*exp(-h/Hvis)*chapman(r/Hvis,cz);
    float lodM=Hm  *exp(-h/Hm )*chapman(r/Hm ,cz);
    float sun=1.0;
    if(cz<0.0){ vec2 sh=raySph(p,L,1.0); if(sh.y>0.0 && sh.x<sh.y) sun=0.0; }
    vec3 trans = exp(-(uBetaR*(odR+lodR) + betaExt*(odM+lodM))) * sun;
    sumR += trans*dR; sumM += trans.r*dM;
  }
  vec3 inscat = (uBetaR*pr*sumR + vec3(uBetaM*pm*sumM)) * uSkyTint * uStarColor * lm * uScatter;
  inscat += vec3(uBetaM*sumM) * uHaze * uStarColor * lm * 0.6;
  // over the disk, weight in-scatter toward the limb so a thick shell doesn't wash
  // out the whole face — the atmosphere is optically deepest at the edge.
  float rimGlow = 0.0; vec3 ns0 = vec3(0.0);
  if(planetHit){
    ns0 = normalize(ro+rd*tSurface);
    float limb = 1.0 - max(dot(ns0,-rd), 0.0);
    inscat *= mix(0.22, 1.0, limb*limb);
    rimGlow = pow(limb, 3.0);
  }
  vec3 viewTrans = exp(-(uBetaR*odR + betaExt*odM));
  vec3 outc = bg*viewTrans + inscat;
  // continuous airglow rim so the atmosphere reads ALL the way around the limb
  if(planetHit){
    vec3 skyHue = normalize(uBetaR + 1e-3) * uSkyTint * uStarColor;
    outc += skyHue * rimGlow * 0.32 * uHasAtmo * (0.45 + 0.55*lm);
  }
  if(uEmiss>0.001 && planetHit){
    vec3 n=normalize(ro+rd*tSurface);
    float night=1.0-max(dot(n,L),0.0);
    outc += uEmissColor*uEmiss*(0.5+0.5*night);
  }
  return outc;
}

// ---------- inside a gas giant: there is no surface, only deepening cloud ----------
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
  return col * uLightMul;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  vec3 ro = uCam;
  vec3 fwd = normalize(uFwd);
  vec3 wup = abs(fwd.y) > 0.99 ? vec3(0.0,0.0,1.0) : vec3(0.0,1.0,0.0);
  vec3 rgt = normalize(cross(fwd, wup));
  vec3 upv = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x*rgt + uv.y*upv + uFov*fwd);

  // a gas giant has no surface to stand on — descend into the cloud deck instead
  if(uSurfaceMode == 1 && uIsGasGiant == 1){
    vec3 gc = gasInterior(ro, rd);
    gc *= uExposure; gc = gc/(gc+vec3(1.0)); gc = pow(gc, vec3(0.4545));
    gl_FragColor = vec4(gc, 1.0); return;
  }

  vec2 ps = raySph(ro, rd, 1.0);
  bool planetHit = (ps.x <= ps.y) && (ps.x > 0.0);
  float tS = ps.x;

  vec3 col;
  if(planetHit){
    vec3 surf = shadeSurface(ro + rd*tS, rd);
    col = atmosphere(ro, rd, surf, true, tS);
  } else {
    col = atmosphere(ro, rd, background(rd), false, 0.0);
  }

  col *= uExposure;
  col = col/(col+vec3(1.0));
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
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
  camDist: 4.7, yaw: 0.7, pitch: 0.30, fov: 1.5,
  exposure: 1.25, resScale: 0.9,
  lightDir: [-0.15, 0.45, 0.85],
  starColor: [1.0, 0.95, 0.86], starSurf: [1.0, 0.96, 0.9], starAngle: 0.02,
  starActivity: 0.4, starSpots: 0.2, starTeff: 5600, starSpin: [0.0, 1.0, 0.0],
  lightMul: 1.0, bgBright: 1.0,
  type: 0, isGasGiant: 0, steam: 0, seed: 0.0, spin: 0.05,
  seaLevel: 0.5, contFreq: 1.9, mtnFreq: 6.0, bump: 0.14,
  tempBias: 0.5, iceCap: 0.78, life: 0.0, cloud: 0.5, bandFreq: 16.0,
  colA: [0.6,0.5,0.4], colB: [0.78,0.7,0.55], colC: [0.95,0.9,0.8],
  surfAlbedo: 0.3, emiss: 0.0, emissColor: [1.0,0.4,0.1],
  atmR: 1.05, hr: 0.02, betaR: [0.175,0.408,1.0], betaM: 0.2, mieG: 0.76, haze: 0.0,
  skyTint: [0.9,0.95,1.0], hasAtmo: 0.9, scatter: 60.0,
  octaves: 6, lastAmp: 1.0,
};

const UNIFORMS = [
  'uRes','uTime','uCam','uFwd','uFov','uExposure',
  'uLightDir','uStarColor','uStarSurf','uStarAngle','uStarActivity','uStarSpots','uStarTeff','uStarSpin','uLightMul','uBgBright',
  'uType','uIsGasGiant','uSteam','uSurfaceMode','uSeed','uSpin','uSeaLevel','uContFreq','uMtnFreq','uBump',
  'uTempBias','uIceCap','uLife','uCloud','uBandFreq','uColA','uColB','uColC',
  'uSurfAlbedo','uEmiss','uEmissColor',
  'uAtmR','uHr','uBetaR','uBetaM','uMieG','uHaze','uSkyTint','uHasAtmo','uScatter',
  'uOctaves','uLastAmp',
];

export class Exoplanet {
  constructor(canvas, config = {}) {
    this.canvas = canvas;
    this.cfg = { ...DEFAULTS, ...config };
    this.still = !!window.__EXO_STILL__;
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
    UNIFORMS.forEach((n) => this.u[n] = gl.getUniformLocation(this.prog, n));

    this._bindPointer();
    this._resize = this._resize.bind(this);
    this._frame = this._frame.bind(this);
    window.addEventListener('resize', this._resize, { passive: true });
    this._resize();
  }

  ok() { return !!this.gl; }
  load(params = {}) { Object.assign(this.cfg, params); if (!this.running) this._draw(); }
  set(key, val) { this.cfg[key] = val; if (!this.running) this._draw(); }
  surface(on) { this.cfg.camMode = on ? 'surface' : 'orbit'; if (!this.running) this._draw(); }

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

  // returns { ro, fwd } for the current camera mode
  _camera() {
    const cfg = this.cfg;
    if (cfg.camMode === 'surface') {
      const L = vnorm(cfg.lightDir);
      let t = vcross(L, [0, 1, 0]);
      if (Math.hypot(t[0], t[1], t[2]) < 1e-3) t = vcross(L, [1, 0, 0]);
      t = vnorm(t);
      // stand so the star sits ~20 deg above the horizon (sin20 ~ 0.34)
      const up = vnorm(vadd(vscale(L, 0.34), vscale(t, 0.94)));
      const ro = vscale(up, 1.03);
      const hd = vnorm(vsub(L, vscale(up, vdot(L, up))));   // star's horizontal bearing
      const fwd = vnorm(vadd(vscale(hd, 0.97), vscale(up, 0.10)));  // just above the horizon
      return { ro, fwd };
    }
    if (cfg.camMode === 'closeorbit') {
      // low orbit: the planet's curved limb fills the lower frame, space above
      const L = vnorm(cfg.lightDir);
      let t = vcross(L, [0, 1, 0]);
      if (Math.hypot(t[0], t[1], t[2]) < 1e-3) t = vcross(L, [1, 0, 0]);
      t = vnorm(t);
      const up = vnorm(vadd(vscale(L, 0.55), vscale(t, 0.84)));   // sub-camera point, day side
      const ro = vscale(up, cfg.closeR || 1.34);
      const hd = vnorm(vsub(L, vscale(up, vdot(L, up))));         // look along the orbit toward the star
      const fwd = vnorm(vsub(vscale(hd, 0.92), vscale(up, 0.40))); // tilt down onto the surface + limb
      return { ro, fwd };
    }
    const { camDist, yaw, pitch } = cfg;
    const ro = [
      camDist * Math.cos(pitch) * Math.cos(yaw),
      camDist * Math.sin(pitch),
      camDist * Math.cos(pitch) * Math.sin(yaw),
    ];
    return { ro, fwd: vnorm(vscale(ro, -1)) };
  }

  // octave LOD from the planet's apparent radius in pixels
  _lod() {
    const cfg = this.cfg;
    if (cfg.camMode === 'surface' || cfg.camMode === 'closeorbit') return { oct: 7, last: 1.0 };
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
    const w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    if (!this.running) this._draw();
  }

  start() { if (!this.gl || this.running) return; if (this.still) { this._draw(); return; } this.running = true; requestAnimationFrame(this._frame); }
  stop() { this.running = false; }
  _frame() { if (!this.running) return; this._draw(); requestAnimationFrame(this._frame); }

  _draw() {
    const gl = this.gl; if (!gl) return;
    const u = this.u, cfg = this.cfg;
    gl.useProgram(this.prog);
    const cam = this._camera();
    const lod = this._lod();

    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, (performance.now() - this.t0) / 1000);
    gl.uniform3fv(u.uCam, cam.ro);
    gl.uniform3fv(u.uFwd, cam.fwd);
    gl.uniform1f(u.uFov, cfg.camMode === 'surface' ? 1.0 : cfg.camMode === 'closeorbit' ? 1.25 : cfg.fov);
    gl.uniform1f(u.uExposure, cfg.exposure);

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
    gl.uniform1i(u.uSteam, cfg.steam | 0);
    gl.uniform1i(u.uSurfaceMode, cfg.camMode === 'surface' ? 1 : 0);
    gl.uniform1f(u.uSeed, cfg.seed);
    gl.uniform1f(u.uSpin, cfg.spin);
    gl.uniform1f(u.uSeaLevel, cfg.seaLevel);
    gl.uniform1f(u.uContFreq, cfg.contFreq);
    gl.uniform1f(u.uMtnFreq, cfg.mtnFreq);
    gl.uniform1f(u.uBump, cfg.bump);
    gl.uniform1f(u.uTempBias, cfg.tempBias);
    gl.uniform1f(u.uIceCap, cfg.iceCap);
    gl.uniform1f(u.uLife, cfg.life);
    gl.uniform1f(u.uCloud, cfg.cloud);
    gl.uniform1f(u.uBandFreq, cfg.bandFreq);
    gl.uniform3fv(u.uColA, cfg.colA);
    gl.uniform3fv(u.uColB, cfg.colB);
    gl.uniform3fv(u.uColC, cfg.colC);
    gl.uniform1f(u.uSurfAlbedo, cfg.surfAlbedo);
    gl.uniform1f(u.uEmiss, cfg.emiss);
    gl.uniform3fv(u.uEmissColor, cfg.emissColor);

    gl.uniform1f(u.uAtmR, cfg.atmR);
    gl.uniform1f(u.uHr, cfg.hr);
    gl.uniform3fv(u.uBetaR, cfg.betaR);
    gl.uniform1f(u.uBetaM, cfg.betaM);
    gl.uniform1f(u.uMieG, cfg.mieG);
    gl.uniform1f(u.uHaze, cfg.haze);
    gl.uniform3fv(u.uSkyTint, cfg.skyTint);
    gl.uniform1f(u.uHasAtmo, cfg.hasAtmo);
    gl.uniform1f(u.uScatter, cfg.scatter);

    gl.uniform1i(u.uOctaves, lod.oct | 0);
    gl.uniform1f(u.uLastAmp, lod.last);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _bindPointer() {
    const cv = this.canvas;
    let down = false, lx = 0, ly = 0;
    const dn = (x, y) => { down = true; lx = x; ly = y; };
    const mv = (x, y) => {
      if (!down) return;
      this.cfg.yaw   -= (x - lx) * 0.006;
      this.cfg.pitch = Math.max(-1.45, Math.min(1.45, this.cfg.pitch + (y - ly) * 0.006));
      lx = x; ly = y;
      if (!this.running) this._draw();
    };
    const up = () => { down = false; };
    cv.addEventListener('mousedown', (e) => dn(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => mv(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);
    cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; dn(t.clientX, t.clientY); }, { passive: true });
    cv.addEventListener('touchmove', (e) => { const t = e.touches[0]; mv(t.clientX, t.clientY); }, { passive: true });
    cv.addEventListener('touchend', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cfg.camDist = Math.max(1.55, Math.min(9.0, this.cfg.camDist + Math.sign(e.deltaY) * 0.2));
      if (!this.running) this._draw();
    }, { passive: false });
  }

  _noWebGL() {
    const m = document.createElement('div');
    m.className = 'exo-nowebgl';
    m.textContent = 'WebGL is required to render the planet.';
    this.canvas?.replaceWith(m);
  }
}
