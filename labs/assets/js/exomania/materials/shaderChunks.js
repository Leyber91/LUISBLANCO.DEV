// File: assets/js/exomania/materials/shaderChunks.js

/**
 * GLSL Noise Functions and Enhanced Shader Utilities
 * Author: Ian McEwan, Ashima Arts (Modified for Exomania)
 */

/**
 * Combined Noise Functions and Shader Chunks
 * This ensures that all necessary functions are defined before they're used.
 */
export const noiseFunctions = `
    // GLSL Noise Functions

    // Modulo 289 without a division (only multiplications)
    vec3 mod289(vec3 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }
    
    vec4 mod289(vec4 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }
    
    // Permutation polynomial
    vec4 permute(vec4 x) {
      return mod289(((x * 34.0) + 1.0) * x);
    }
    
    // Faster version of inverse square root
    // See: https://en.wikipedia.org/wiki/Fast_inverse_square_root
    vec4 taylorInvSqrt(vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }
    
    // Simplex noise function
    // Returns a value in the range [-1, 1]
    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
      // First corner
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
    
      // Other corners
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
    
      // x0 = x0 - 0.0 + 0.0 * C.xxx;
      // x1 = x0 - i1  + 1.0 * C.xxx;
      // x2 = x0 - i2  + 2.0 * C.xxx;
      // x3 = x0 - 1.0 + 3.0 * C.xxx;
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
    
      // Permutations
      i = mod289(i);
      vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
      // Gradients: 7x7 points over a square, mapped onto an octahedron.
      // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
      float n_ = 1.0 / 7.0; // N=7
      vec3  ns = n_ * D.wyz - D.xzx;
    
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  // mod(p,N*N)
    
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);    // mod(j,N)
    
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
    
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
    
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
    
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
    
      // Normalise gradients
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
    
      // Mix final noise value
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), 
                                   dot(p2,x2), dot(p3,x3)));
    }
    
    // Fractal Brownian Motion (fBm)
    // This function creates more complex and natural-looking noise
    // by summing multiple octaves of simplex noise
    float fbm(vec3 position) {
      float total = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      float maxAmplitude = 0.0;  // Used for normalizing result to -1.0 - 1.0
      const int NUM_OCTAVES = 8;
      
      for (int i = 0; i < NUM_OCTAVES; i++) {
        total += amplitude * snoise(position * frequency);
        maxAmplitude += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
      }
      
      // Normalize result
      return total / maxAmplitude;
    }
    
    // Turbulence - a variant of fBm using absolute value of noise
    float turbulence(vec3 position) {
      float total = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      float maxAmplitude = 0.0;
      const int NUM_OCTAVES = 6;
      
      for (int i = 0; i < NUM_OCTAVES; i++) {
        total += amplitude * abs(snoise(position * frequency));
        maxAmplitude += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
      }
      
      return total / maxAmplitude;
    }
    
    // Ridged multifractal terrain
    float ridgedMF(vec3 position) {
      float total = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      float maxAmplitude = 0.0;
      const int NUM_OCTAVES = 6;
      
      for (int i = 0; i < NUM_OCTAVES; i++) {
        float noiseValue = snoise(position * frequency);
        total += amplitude * (1.0 - abs(noiseValue));
        maxAmplitude += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
      }
      
      return (total / maxAmplitude) * 2.0 - 1.0;
    }
    
    // Enhanced Shader Functions
    
    // Simplified atmospheric scattering functions
    vec3 enhancedAtmosphericScattering(
        vec3 viewDir,
        vec3 normal,
        vec3 lightDir,
        vec3 baseColor,
        float pressure,
        float albedo,
        vec3 composition,
        vec3 rayleighCoeff,
        vec3 mieCoeff
    ) {
        // Simplified Rayleigh and Mie scattering
        float cosTheta = dot(normal, lightDir);
        float rayleigh = pow(1.0 - cosTheta, 2.5);
        float mie = pow(1.0 - cosTheta, 1.5);
    
        vec3 scatteredLight = (rayleighCoeff * rayleigh + mieCoeff * mie) * pressure;
    
        return mix(baseColor, scatteredLight, albedo);
    }
    
    // Dynamic albedo calculation
    float calculateAlbedo(float surfaceTemperature, vec3 composition) {
        // Simple model: higher albedo for icy surfaces, lower for rocky or lava
        if (surfaceTemperature < 250.0) {
            return 0.6; // Icy
        } else if (surfaceTemperature < 1000.0) {
            return 0.3; // Rocky
        } else {
            return 0.1; // Lava
        }
    }
    
    // Elevation adjustment based on gravity
    float adjustElevation(float baseElevation, float gravity) {
        // Higher gravity leads to smoother terrains
        return baseElevation / gravity;
    }
`;


/**
 * Exported Enhanced Shader Chunks
 * These functions handle atmospheric scattering, dynamic albedo, and elevation adjustments.
 */
export const shaderChunks = `
    // Enhanced Shader Functions
    
    // Simplified atmospheric scattering functions
    vec3 enhancedAtmosphericScattering(vec3 viewDir, vec3 normal, vec3 lightDir, vec3 baseColor, float pressure, float albedo, vec3 composition, vec3 rayleighCoeff, vec3 mieCoeff) {
        // Simplified Rayleigh and Mie scattering
        float cosTheta = dot(normal, lightDir);
        float rayleigh = pow(1.0 - cosTheta, 2.5);
        float mie = pow(1.0 - cosTheta, 1.5);
    
        vec3 scatteredLight = (rayleighCoeff * rayleigh + mieCoeff * mie) * pressure;
    
        return mix(baseColor, scatteredLight, albedo);
    }
    
    // Dynamic albedo calculation
    float calculateAlbedo(float surfaceTemperature, vec3 composition) {
        // Simple model: higher albedo for icy surfaces, lower for rocky or lava
        if (surfaceTemperature < 250.0) {
            return 0.6; // Icy
        } else if (surfaceTemperature < 1000.0) {
            return 0.3; // Rocky
        } else {
            return 0.1; // Lava
        }
    }
    
    // Elevation adjustment based on gravity
    float adjustElevation(float baseElevation, float gravity) {
        // Higher gravity leads to smoother terrains
        return baseElevation / gravity;
    }
`;
