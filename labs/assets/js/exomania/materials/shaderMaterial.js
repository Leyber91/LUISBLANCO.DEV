// File: assets/js/exomania/materials/shaderMaterial.js

/**
 * Shader Material for Exomania Planets
 * 
 * This module defines a customizable shader material for rendering exoplanets
 * with realistic terrains, lighting, and atmospheric effects. The shader adapts
 * its appearance based on the planet's type and properties provided in the
 * planetData object. Enhancements include expanded color palettes, increased
 * texture variety, and support for multiple planet variations.
 * 
 * Dependencies:
 * - THREE.js library
 * - Utility functions from utils.js
 */


import { isGasGiant, calculateGravity, calculateDensity, getPlanetType } from '../utils.js';

// GLSL Shader Chunks for Noise and Utility Functions
const shaderChunks = `
    //
    // GLSL Noise Functions and Utilities
    // Author: Ian McEwan, Ashima Arts (Modified for Aether 212)
    //

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

    vec3 permute(vec3 x) {
      return mod289(((x * 34.0) + 1.0) * x);
    }

    // Faster version of inverse square root
    vec4 taylorInvSqrt(vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }

    vec3 taylorInvSqrt(vec3 r) {
      return vec3(
        1.79284291400159 - 0.85373472095314 * r.x,
        1.79284291400159 - 0.85373472095314 * r.y,
        1.79284291400159 - 0.85373472095314 * r.z
      );
    }

    // Simplex noise function (snoise)
    float snoise(vec3 v) {
      const vec2  C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

      // First corner
      vec3 i  = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      // Other corners
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      // x0 = x0 - 0.0 + 0.0 * C
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;

      // Permutations
      i = mod289(i);
      vec4 p = permute(permute(permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

      // Gradients
      float n_ = 1.0 / 7.0; // N=7
      vec3  ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );

      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );

      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

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
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                    dot(p2,x2), dot(p3,x3) ) );
    }

    // Fractal Brownian Motion (fbm) for smoother terrain
    float fbm(vec3 position) {
      float total = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;

      for (int i = 0; i < 5; i++) { // 5 octaves for detail
        total += amplitude * snoise(position * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }

      return total;
    }

    // Ridged Multifractal Noise for mountainous terrain
    float ridgedMF(vec3 position, float lacunarity, float gain, int octaves) {
      float sum = 0.0;
      float frequency = 1.0;
      float amplitude = 0.5;
      float prev = 1.0;
      for (int i = 0; i < octaves; i++) {
        float n = abs(snoise(position * frequency));
        n = 1.0 - n;
        n = n * n;
        sum += n * amplitude * prev;
        prev = n;
        frequency *= lacunarity;
        amplitude *= gain;
      }
      return sum;
    }

    // Turbulence function for additional noise
    float turbulence(vec3 position) {
      float t = -0.5;
      for (int i = 1; i <= 5; i++) {
        float power = pow(2.0, float(i));
        t += abs(snoise(position * power)) / power;
      }
      return t;
    }

    // Calculate normals based on noise derivatives
    vec3 calculateNormal(vec3 position, float elevationScale) {
      float epsilon = 0.0001;
      float nx = fbm(position + vec3(epsilon, 0.0, 0.0)) - fbm(position - vec3(epsilon, 0.0, 0.0));
      float ny = fbm(position + vec3(0.0, epsilon, 0.0)) - fbm(position - vec3(0.0, epsilon, 0.0));
      float nz = fbm(position + vec3(0.0, 0.0, epsilon)) - fbm(position - vec3(0.0, 0.0, epsilon));

      vec3 normal = normalize(vec3(nx, ny, nz));
      return normal;
    }

    // Simple atmospheric scattering model
    vec3 atmosphericScattering(vec3 viewDir, vec3 normal, vec3 lightDir, vec3 baseColor) {
      float cosTheta = dot(normal, viewDir);
      float rayleigh = pow(1.0 - cosTheta, 2.5);
      vec3 scatteredLight = vec3(0.5, 0.6, 0.7) * rayleigh;
      return mix(baseColor, scatteredLight, 0.5);
    }
`;

// Vertex Shader Code
const vertexShader = `
    varying vec3 vNormal;        // Interpolated normal vector
    varying vec3 vPosition;      // Vertex position in world space
    varying float vElevation;    // Elevation value for displacement mapping
    varying vec2 vUv;            // UV coordinates for texture mapping

    uniform float elevationScale;  // Scale factor for terrain elevation
    uniform float time;            // Time uniform for animations
    uniform int planetType;        // Type of planet (0: rocky, 1: gas giant, etc.)
    uniform float gravity;         // Surface gravity

    ${shaderChunks} // Include all shader functions

    void main() {
      vUv = uv;                                   // Pass UV coordinates to fragment shader

      // Generate elevation based on planet type and temperature
      float elevation = 0.0;
      vec3 noisePosition = position * 2.0 + time * 0.05;

      if (planetType == 0) {
        // Rocky planet terrain
        elevation = fbm(noisePosition) * elevationScale;
        elevation = pow(elevation, 0.8); // Apply smoothing
        elevation = clamp(elevation, -0.05, 0.05); // Limit elevation
      } else if (planetType == 1) {
        // Gas giant banding
        elevation = sin(position.y * 10.0 + fbm(noisePosition)) * 0.01;
      } else if (planetType == 2) {
        // Icy planet mountains
        elevation = ridgedMF(noisePosition, 2.0, 0.5, 5) * elevationScale;
        elevation = clamp(elevation, -0.05, 0.05);
      } else if (planetType == 3) {
        // Lava planet flows
        elevation = fbm(noisePosition * 3.0) * elevationScale * 0.5;
        elevation = clamp(elevation, -0.05, 0.05);
      }

      vElevation = elevation;                     // Pass elevation to fragment shader

      // Displace vertex position along the normal vector
      vec3 displacedPosition = position + normal * elevation;

      // Transform position and normal to world space
      vPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
      vNormal = normalize(normalMatrix * normal);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
`;

/// Enhanced Fragment Shader with Expanded Detail and Variety
const fragmentShader = `
varying vec3 vNormal;        // Interpolated normal vector from vertex shader
varying vec3 vPosition;      // Vertex position in world space
varying float vElevation;    // Elevation value from vertex shader
varying vec2 vUv;            // UV coordinates

uniform vec3 colorDeep;      // Deep water color
uniform vec3 colorShallow;   // Shallow water color
uniform vec3 colorLandLow;   // Low elevation land color
uniform vec3 colorLandHigh;  // High elevation land color
uniform float waterLevel;    // Water level threshold
uniform float specularStrength; // Strength of specular highlights
uniform vec3 lightDirection;    // Direction of the main light source
uniform float time;             // Time uniform for animations
uniform int planetType;         // Type of planet (0: rocky, 1: gas giant, 2: ice, 3: lava)
uniform float atmosphereDensity; // Density of the atmosphere
uniform vec3 atmosphereColor;    // Color of the atmosphere
uniform float waterReflectivity; // Reflectivity factor of water
uniform float waterSpecular;     // Specular highlight intensity for water
uniform float waveAmplitude;     // Amplitude of water waves
uniform float waveFrequency;     // Frequency of water waves
uniform float colorVariation;    // Amount of color variation
uniform float colorNoise;        // Noise factor for color variation
uniform sampler2D planetDataTexture; // Texture containing planet data
uniform int planetDataCount;     // Number of data points in the texture

// Additional Uniforms for Enhanced Details
uniform float cloudCoverage;        // Percentage of cloud coverage
uniform vec3 cloudColor;            // Base color of clouds
uniform float cloudSpeed;           // Speed of cloud movement
uniform float iceCapSize;           // Size of ice caps
uniform vec3 iceCapColor;           // Color of ice caps
uniform float ringOpacity;          // Opacity of planet rings
uniform vec3 ringColor;             // Color of planet rings
uniform float ringThickness;        // Thickness of planet rings
uniform float surfaceRoughness;     // Roughness of the planet's surface
uniform float vegetationDensity;    // Density of vegetation on rocky planets
uniform vec3 vegetationColor;       // Color of vegetation
uniform float volcanicActivity;     // Intensity of volcanic activity on lava planets
uniform vec3 volcanicColor;         // Color of volcanic regions
uniform float auroraIntensity;      // Intensity of auroras on icy planets
uniform vec3 auroraColor;           // Color of auroras
uniform float emissiveIntensity;    // Intensity of emissive features (e.g., lava)
uniform vec3 emissiveColor;         // Color of emissive features

${shaderChunks} // Include all shader functions

const int PALETTE_SIZE = 16;
const int EXTENDED_PALETTE_SIZE = 32; // Increased palette size for more variety

// Function to Retrieve Color from Extended Palette
vec3 getColorFromPalette(int type, float value) {
    int paletteStart = type * EXTENDED_PALETTE_SIZE;
    
    vec3 palettes[128]; // Expanded to support more palettes

    // -----------------------------
    // Define Extended Palettes Below
    // -----------------------------

  // -----------------------------
    // Define Extended Palettes Below
    // -----------------------------

    // Rocky planet palettes (0-31)
    palettes[0] = vec3(0.05, 0.2, 0.05);   // Dark forest
    palettes[1] = vec3(0.6, 0.55, 0.5);    // Sandy desert
    palettes[2] = vec3(0.3, 0.3, 0.3);     // Rocky mountains
    palettes[3] = vec3(0.8, 0.8, 0.8);     // Snowy peaks
    palettes[4] = vec3(0.2, 0.15, 0.1);    // Rich soil
    palettes[5] = vec3(0.7, 0.7, 0.6);     // Dry savanna
    palettes[6] = vec3(0.5, 0.25, 0.1);    // Red desert
    palettes[7] = vec3(0.1, 0.1, 0.1);     // Volcanic rock
    palettes[8] = vec3(0.4, 0.45, 0.35);   // Mossy terrain
    palettes[9] = vec3(0.6, 0.6, 0.5);     // Arid plains
    palettes[10] = vec3(0.2, 0.2, 0.25);   // Slate mountains
    palettes[11] = vec3(0.7, 0.65, 0.6);   // Sandstone cliffs
    palettes[12] = vec3(0.3, 0.35, 0.3);   // Coniferous forests
    palettes[13] = vec3(0.5, 0.5, 0.45);   // Grasslands
    palettes[14] = vec3(0.15, 0.15, 0.2);  // Dark basalt
    palettes[15] = vec3(0.55, 0.5, 0.45);  // Weathered rock
    palettes[16] = vec3(0.25, 0.4, 0.25);  // Lush jungles
    palettes[17] = vec3(0.45, 0.35, 0.3);  // Clay deserts
    palettes[18] = vec3(0.35, 0.35, 0.4);  // Granite peaks
    palettes[19] = vec3(0.85, 0.85, 0.85); // Glacial surfaces
    palettes[20] = vec3(0.25, 0.2, 0.15);  // Fertile valleys
    palettes[21] = vec3(0.65, 0.65, 0.55); // Dusty plateaus
    palettes[22] = vec3(0.55, 0.3, 0.15);  // Rusty terrains
    palettes[23] = vec3(0.15, 0.15, 0.15); // Obsidian plains
    palettes[24] = vec3(0.45, 0.55, 0.45); // Fern-covered hills
    palettes[25] = vec3(0.65, 0.65, 0.5);  // Barren steppes
    palettes[26] = vec3(0.25, 0.25, 0.3);  // Limestone ridges
    palettes[27] = vec3(0.75, 0.7, 0.65);  // Eroded cliffs
    palettes[28] = vec3(0.35, 0.45, 0.4);  // Swampy grounds
    palettes[29] = vec3(0.65, 0.7, 0.6);   // Rolling meadows
    palettes[30] = vec3(0.2, 0.25, 0.3);   // Basaltic seas
    palettes[31] = vec3(0.75, 0.75, 0.7);  // Mottled terrains

    // Gas giant palettes (32-63)
    palettes[32] = vec3(0.8, 0.7, 0.5);    // Beige bands
    palettes[33] = vec3(0.6, 0.4, 0.2);    // Orange storms
    palettes[34] = vec3(0.4, 0.3, 0.2);    // Dark belts
    palettes[35] = vec3(0.9, 0.8, 0.6);    // Light zones
    palettes[36] = vec3(0.7, 0.5, 0.3);    // Turbulent eddies
    palettes[37] = vec3(0.5, 0.4, 0.3);    // Muted bands
    palettes[38] = vec3(0.3, 0.5, 0.7);    // Blue-tinted storms
    palettes[39] = vec3(0.2, 0.3, 0.5);    // Deep blue layers
    palettes[40] = vec3(0.6, 0.6, 0.7);    // Pale striations
    palettes[41] = vec3(0.4, 0.4, 0.6);    // Purple-tinged clouds
    palettes[42] = vec3(0.7, 0.7, 0.8);    // White cloud tops
    palettes[43] = vec3(0.5, 0.5, 0.6);    // Gray storm systems
    palettes[44] = vec3(0.3, 0.4, 0.5);    // Dark blue depths
    palettes[45] = vec3(0.6, 0.5, 0.4);    // Tan cloud layers
    palettes[46] = vec3(0.5, 0.6, 0.7);    // Light blue hazes
    palettes[47] = vec3(0.4, 0.5, 0.4);    // Green-tinted bands
    palettes[48] = vec3(0.85, 0.75, 0.65); // Stormy clouds
    palettes[49] = vec3(0.65, 0.55, 0.45); // Dense atmosphere
    palettes[50] = vec3(0.75, 0.85, 0.75); // High-altitude clouds
    palettes[51] = vec3(0.55, 0.65, 0.55); // Mid-level storms
    palettes[52] = vec3(0.95, 0.85, 0.75); // Upper atmosphere glow
    palettes[53] = vec3(0.45, 0.55, 0.45); // Lower atmosphere layers
    palettes[54] = vec3(0.85, 0.95, 0.85); // Ionized regions
    palettes[55] = vec3(0.35, 0.45, 0.35); // Deep atmospheric layers
    palettes[56] = vec3(0.95, 0.65, 0.55); // Volatile storm regions
    palettes[57] = vec3(0.75, 0.85, 0.95); // Reflective cloud tops
    palettes[58] = vec3(0.55, 0.65, 0.75); // Twilight zones
    palettes[59] = vec3(0.65, 0.75, 0.85); // Radiant auroras
    palettes[60] = vec3(0.45, 0.55, 0.65); // Subtle haze
    palettes[61] = vec3(0.85, 0.75, 0.95); // Ethereal mists
    palettes[62] = vec3(0.55, 0.65, 0.55); // Deep storm systems
    palettes[63] = vec3(0.95, 0.85, 0.95); // Ionized auroras

    // Icy planet palettes (64-95)
    palettes[64] = vec3(0.9, 0.95, 1.0);   // Pure ice
    palettes[65] = vec3(0.7, 0.8, 0.9);    // Blue-tinged ice
    palettes[66] = vec3(0.8, 0.85, 0.9);   // Compacted snow
    palettes[67] = vec3(0.6, 0.7, 0.8);    // Glacial crevasses
    palettes[68] = vec3(0.5, 0.6, 0.7);    // Deep ice fissures
    palettes[69] = vec3(0.75, 0.8, 0.85);  // Frost-covered plains
    palettes[70] = vec3(0.65, 0.7, 0.75);  // Icy mountains
    palettes[71] = vec3(0.85, 0.9, 0.95);  // Fresh snow
    palettes[72] = vec3(0.55, 0.65, 0.7);  // Shadowed ice valleys
    palettes[73] = vec3(0.8, 0.9, 1.0);    // Reflective ice sheets
    palettes[74] = vec3(0.7, 0.75, 0.8);   // Dirty ice
    palettes[75] = vec3(0.6, 0.65, 0.7);   // Methane ice
    palettes[76] = vec3(0.5, 0.55, 0.6);   // Ancient ice layers
    palettes[77] = vec3(0.75, 0.85, 0.9);  // Crystalline ice structures
    palettes[78] = vec3(0.65, 0.75, 0.85); // Subsurface ocean hints
    palettes[79] = vec3(0.7, 0.8, 0.85);   // Fractured ice terrain
    palettes[80] = vec3(0.95, 0.95, 1.0);  // Ultra-pure ice
    palettes[81] = vec3(0.85, 0.9, 0.95);  // Translucent ice
    palettes[82] = vec3(0.75, 0.8, 0.85);  // Brittle ice
    palettes[83] = vec3(0.65, 0.7, 0.75);  // Frosty plains
    palettes[84] = vec3(0.55, 0.6, 0.65);  // Frozen lakes
    palettes[85] = vec3(0.85, 0.9, 0.95);  // Shimmering ice
    palettes[86] = vec3(0.75, 0.85, 0.9);   // Layered ice sheets
    palettes[87] = vec3(0.65, 0.75, 0.8);   // Ice cap highlights
    palettes[88] = vec3(0.95, 0.85, 0.9);   // Frost crystals
    palettes[89] = vec3(0.85, 0.75, 0.8);   // Subglacial lakes
    palettes[90] = vec3(0.75, 0.65, 0.7);   // Ice geysers
    palettes[91] = vec3(0.65, 0.55, 0.6);   // Glacial shadows
    palettes[92] = vec3(0.55, 0.45, 0.5);   // Icy terrain shadows
    palettes[93] = vec3(0.45, 0.35, 0.4);   // Permafrost areas
    palettes[94] = vec3(0.35, 0.25, 0.3);   // Frozen rocky outcrops
    palettes[95] = vec3(0.25, 0.15, 0.2);   // Subzero frost

    // Lava planet palettes (96-127)
    palettes[96] = vec3(1.0, 0.6, 0.0);    // Molten lava
    palettes[97] = vec3(0.9, 0.3, 0.0);    // Cooling lava crust
    palettes[98] = vec3(0.7, 0.2, 0.0);    // Solidified magma
    palettes[99] = vec3(0.5, 0.1, 0.0);    // Volcanic rock
    palettes[100] = vec3(1.0, 0.8, 0.0);   // Sulfur deposits
    palettes[101] = vec3(0.8, 0.4, 0.0);   // Lava tubes
    palettes[102] = vec3(0.6, 0.2, 0.0);   // Cooling pyroclastic flows
    palettes[103] = vec3(1.0, 0.5, 0.0);   // Fresh lava flows
    palettes[104] = vec3(0.4, 0.1, 0.0);   // Charred crust
    palettes[105] = vec3(0.9, 0.6, 0.2);   // Hot spots
    palettes[106] = vec3(0.7, 0.3, 0.1);   // Cooling lava lakes
    palettes[107] = vec3(0.5, 0.2, 0.1);   // Volcanic plains
    palettes[108] = vec3(0.8, 0.3, 0.0);   // Lava fountains
    palettes[109] = vec3(0.6, 0.3, 0.1);   // Solidifying magma chambers
    palettes[110] = vec3(1.0, 0.7, 0.2);   // Erupting volcanoes
    palettes[111] = vec3(0.7, 0.4, 0.1);   // Cooling lava rivers
    palettes[112] = vec3(0.95, 0.55, 0.05); // Molten flows
    palettes[113] = vec3(0.85, 0.45, 0.0);  // Solid crust
    palettes[114] = vec3(0.75, 0.35, 0.0);  // Magma vents
    palettes[115] = vec3(0.65, 0.25, 0.0);  // Basaltic plains
    palettes[116] = vec3(0.55, 0.15, 0.0);  // Obsidian flows
    palettes[117] = vec3(0.45, 0.05, 0.0);  // Ash-covered areas
    palettes[118] = vec3(0.35, 0.0, 0.0);    // Charcoal regions
    palettes[119] = vec3(0.25, 0.0, 0.0);    // Cinder deserts
    palettes[120] = vec3(0.15, 0.0, 0.0);    // Sooty plains
    palettes[121] = vec3(0.05, 0.0, 0.0);    // Carbon-rich areas
    palettes[122] = vec3(1.0, 0.85, 0.3);   // Sulfuric eruptions
    palettes[123] = vec3(0.95, 0.75, 0.25);  // Viscous lava
    palettes[124] = vec3(0.85, 0.65, 0.15);  // Flowing magma
    palettes[125] = vec3(0.75, 0.55, 0.05);  // Molten rock
    palettes[126] = vec3(0.65, 0.45, 0.0);   // Crystallized lava
    palettes[127] = vec3(0.55, 0.35, 0.0);   // Hardened volcanic layers

    // Calculate noise-based palette index
    float noiseValue = fbm(vec3(value * 10.0, 0.0, 0.0));
    int paletteIndex = paletteStart + int(mod(noiseValue * float(EXTENDED_PALETTE_SIZE), float(EXTENDED_PALETTE_SIZE)));
    return palettes[paletteIndex];
}

// Function to Apply Atmospheric Scattering with Enhanced Effects
vec3 applyAtmosphericScattering(vec3 color, vec3 viewDir, vec3 normal, vec3 lightDir) {
    // Calculate the angle between view direction and normal
    float theta = max(dot(viewDir, normal), 0.0);
    
    // Rayleigh scattering (scales with wavelength, more for blue)
    vec3 rayleighCoeff = vec3(5.8e-3, 13.5e-3, 33.1e-3); // Example coefficients
    float rayleigh = pow(1.0 - theta, 2.5);
    
    // Mie scattering (for haze, particles similar in size to wavelength)
    vec3 mieCoeff = vec3(21e-3); // Uniform for simplicity
    float mie = pow(1.0 - theta, 2.0);
    
    // Combined scattering
    vec3 scatteredLight = atmosphereColor * (rayleighCoeff * rayleigh + mieCoeff * mie);
    
    // Add glow effect based on atmosphere density
    float glow = atmosphereDensity * 0.5;
    scatteredLight *= glow;
    
    return mix(color, scatteredLight, glow);
}

// Function to Add Cloud Layers with Dynamic Shadows
vec3 addClouds(vec3 baseColor, vec3 normal, vec3 viewDir) {
    // Generate cloud pattern using FBM with higher frequency for finer details
    float cloudPattern = fbm(vPosition * 1.8 + time * cloudSpeed);
    cloudPattern = smoothstep(0.45, 0.65, cloudPattern);

    // Add multiple cloud layers for depth and variation
    float cloudLayer1 = fbm(vPosition * 2.5 + time * cloudSpeed * 0.9);
    float cloudLayer2 = fbm(vPosition * 3.5 + time * cloudSpeed * 1.3);
    cloudLayer1 = smoothstep(0.55, 0.75, cloudLayer1);
    cloudLayer2 = smoothstep(0.55, 0.75, cloudLayer2);

    // Combine cloud layers with varying opacity
    float clouds = (cloudLayer1 * 0.7 + cloudLayer2 * 0.3);
    clouds = clamp(clouds, 0.0, 1.0);

    // Incorporate shadowing based on cloud density and light direction
    float shadow = max(dot(normal, lightDirection), 0.0);
    shadow = 1.0 - smoothstep(0.0, 1.0, clouds * (1.0 - shadow));

    // Apply shadows to clouds for depth perception
    clouds *= shadow;

    // Blend clouds with base color
    vec3 finalColor = mix(baseColor, cloudColor, clouds * cloudCoverage);

    return finalColor;
}

// Function to Add Ice Caps on Icy Planets with Snowflake Effects
vec3 addIceCaps(vec3 baseColor, vec3 normal) {
    // Determine latitude based on normal vector
    float latitude = abs(normal.y);
    
    // Calculate ice cap presence using smoothstep for gradual transitions
    float iceFactor = smoothstep(0.8, iceCapSize, latitude);

    // Generate snowflake-like patterns using FBM for texture variation
    float snowPattern = fbm(vPosition * 20.0 + time * 0.3);
    snowPattern = smoothstep(0.5, 0.7, snowPattern);

    // Combine ice cap color with snow patterns
    vec3 ice = mix(baseColor, iceCapColor, iceFactor * snowPattern);
    return ice;
}

// Function to Add Planet Rings with Perspective and Lighting
vec3 addRings(vec3 color, vec3 position) {
    // Calculate ring parameters based on planet's position
    float angle = atan(position.z, position.x);
    float radius = length(vec2(position.x, position.z));
    
    // Define ring dimensions (assuming planet radius is 1.0)
    float innerRadius = 1.1;
    float outerRadius = innerRadius + 0.4; // Increased ring thickness for realism

    // Generate ring pattern using smoothstep for sharp edges
    float ringPattern = smoothstep(innerRadius, innerRadius + ringThickness, radius) -
                         smoothstep(outerRadius, outerRadius + ringThickness, radius);
    
    // Add perspective by factoring in the y-component
    float inclination = 0.5; // Adjust for ring tilt
    ringPattern *= 1.0 - abs(position.y) * inclination;
    
    // Apply opacity and color to rings
    ringPattern *= ringOpacity;

    // Blend ring color with planet color
    vec3 finalColor = mix(color, ringColor, ringPattern);
    
    return finalColor;
}

// Function to Add Vegetation on Rocky Planets with Seasonal Variations
vec3 addVegetation(vec3 color, float elevation) {
    // Vegetation appears within certain elevation ranges
    float vegThresholdLow = 0.2;
    float vegThresholdHigh = 0.6;
    float vegetation = smoothstep(vegThresholdLow, vegThresholdHigh, elevation);
    vegetation *= vegetationDensity;

    // Simulate seasonal color changes using time uniform
    float season = sin(time * 0.1) * 0.5 + 0.5; // Varies between 0 and 1
    vec3 seasonalColor = mix(vegetationColor * 0.8, vegetationColor * 1.2, season);
    
    // Blend vegetation color with base color
    vec3 finalColor = mix(color, seasonalColor, vegetation);
    return finalColor;
}

// Function to Add Volcanic Activity on Lava Planets with Emissive Glows
vec3 addVolcanicActivity(vec3 color, float elevation) {
    // Volcanic regions appear at high elevations
    float volcanoThreshold = 0.7;
    float volcanic = smoothstep(volcanoThreshold, volcanoThreshold + 0.1, elevation);
    volcanic *= volcanicActivity;

    // Add emissive glow based on volcanic intensity
    vec3 emissive = emissiveColor * volcanic * emissiveIntensity;

    // Blend volcanic color with base color
    vec3 finalColor = mix(color, volcanicColor, volcanic);

    // Add emissive glow to the final color
    finalColor += emissive;

    return finalColor;
}

// Function to Add Auroras on Icy Planets with Dynamic Animation
vec3 addAuroras(vec3 color, vec3 normal, vec3 viewDir) {
    // Auroras appear near the poles and are view-dependent
    float poleFactor = abs(normal.y);
    float aurora = smoothstep(0.8, 1.0, poleFactor);

    // Calculate angle between view direction and pole for dynamic lighting
    float angle = dot(viewDir, normal);
    aurora *= smoothstep(0.5, 1.0, angle);

    // Animate auroras using time uniform for dynamic movement
    float auroraAnimation = sin(time * 2.0 + vUv.x * 10.0) * 0.5 + 0.5;
    aurora *= auroraAnimation;

    // Blend aurora color with base color
    vec3 finalColor = mix(color, auroraColor, aurora * auroraIntensity);
    return finalColor;
}

// Function to Add Dynamic Emissive Features (e.g., Lava Glows)
vec3 addEmissiveFeatures(vec3 color, vec3 normal) {
    // Emit light based on surface roughness and specific features
    float emissive = max(dot(normal, lightDirection), 0.0) * emissiveIntensity;
    vec3 finalColor = color + emissive * emissiveColor;
    return finalColor;
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(lightDirection);
    vec3 viewDir = normalize(cameraPosition - vPosition);

    // Calculate Lambertian reflectance for diffuse lighting
    float lambertian = max(dot(normal, lightDir), 0.0);

    // Calculate Specular highlights using Blinn-Phong model
    float specular = 0.0;
    if (lambertian > 0.0) {
        vec3 halfDir = normalize(lightDir + viewDir);
        float specAngle = max(dot(halfDir, normal), 0.0);
        specular = pow(specAngle, 64.0) * specularStrength;
    }

    // Initialize base color
    vec3 baseColor;
    float noiseValue = snoise(vPosition * 5.0 + time * 0.1);

    // Determine base color based on planet type and elevation
    if (planetType == 0) { // Rocky planet
        if (vElevation < waterLevel) {
            // Water region
            float waterDepth = (waterLevel - vElevation) / waterLevel;
            waterDepth = clamp(waterDepth, 0.0, 1.0);
            
            // Add wave effects with animated displacement
            float wave = snoise(vPosition * waveFrequency + vec3(0.0, time * 0.5, 0.0));
            wave = clamp(wave, -1.0, 1.0) * waveAmplitude;
            
            // Calculate Fresnel effect for reflections
            float fresnel = pow(1.0 - dot(viewDir, normal), 3.0);
            vec3 reflectColor = vec3(1.0) * fresnel * waterReflectivity;
            
            // Specular highlight on water
            vec3 specularHighlight = vec3(specular) * waterSpecular;
            
            // Blend shallow and deep water colors based on depth
            vec3 waterColor = mix(colorShallow, colorDeep, waterDepth);
            waterColor += wave;
            waterColor = mix(waterColor, reflectColor, fresnel);
            waterColor += specularHighlight;
            
            baseColor = waterColor;
        } else {
            // Land region
            float landHeight = (vElevation - waterLevel) / (1.0 - waterLevel);
            landHeight = clamp(landHeight, 0.0, 1.0);
            
            // Get color from extended palette
            baseColor = getColorFromPalette(planetType, landHeight);
            baseColor += noiseValue * 0.1;
            baseColor = clamp(baseColor, 0.0, 1.0);

            // Add vegetation with seasonal variations
            baseColor = addVegetation(baseColor, landHeight);
        }
    } else if (planetType == 1) { // Gas giant
        // Banding effect using sine waves and noise for dynamic patterns
        float banding = sin(vUv.y * 50.0 + fbm(vPosition * 10.0)) * 0.5 + 0.5;
        baseColor = getColorFromPalette(planetType, banding);
        
        // Add swirling storms with animated noise
        float storm = fbm(vPosition * 20.0 + time * 0.1);
        baseColor = mix(baseColor, vec3(1.0), smoothstep(0.7, 0.9, storm) * 0.3);

        // Add cloud layers with dynamic shadows and movement
        baseColor = addClouds(baseColor, normal, viewDir);
    } else if (planetType == 2) { // Icy planet
        // Base color from ice palette with noise-based variation
        float iceFactor = fbm(vPosition * 3.0 + time * 0.1);
        iceFactor = clamp(iceFactor, 0.0, 1.0);
        baseColor = getColorFromPalette(planetType, iceFactor);
        
        // Add cracks and fissures using high-frequency noise
        float crack = fbm(vPosition * 30.0);
        baseColor = mix(baseColor, vec3(0.2, 0.3, 0.4), smoothstep(0.6, 0.8, crack) * 0.5);
        
        // Add ice caps with snowflake-like patterns
        baseColor = addIceCaps(baseColor, normal);
        
        // Add auroras with dynamic animation
        baseColor = addAuroras(baseColor, normal, viewDir);
    } else if (planetType == 3) { // Lava planet
        // Base color from lava palette with noise-based variation
        float lava = smoothstep(0.8, 1.0, fbm(vPosition * 5.0 + time * 0.5));
        lava = clamp(lava, 0.0, 1.0);
        baseColor = getColorFromPalette(planetType, lava);
        
        // Add glow effects from lava using sine-based animation
        float glow = sin(vUv.x * waveFrequency + time) * 0.5 + 0.5;
        glow = clamp(glow, 0.0, 1.0);
        baseColor += vec3(glow) * 0.2;
        
        // Add cooling lava effect with animated noise
        float cooling = fbm(vPosition * 10.0 - time * 0.2);
        baseColor = mix(baseColor, vec3(0.1, 0.1, 0.1), smoothstep(0.4, 0.6, cooling));

        // Add volcanic activity with emissive glows
        baseColor = addVolcanicActivity(baseColor, lava);
    }

    // Apply color variation for added realism
    baseColor += (noiseValue * 2.0 - 1.0) * colorVariation;
    baseColor = clamp(baseColor, 0.0, 1.0);

    // Calculate final color with Lambertian reflectance and specular highlights
    vec3 color = baseColor * lambertian + vec3(specular);

    // Apply atmospheric scattering for realistic atmospheres
    if (atmosphereDensity > 0.0) {
        color = applyAtmosphericScattering(color, viewDir, normal, lightDir);
    }

    // Apply planet rings if applicable (assuming gas giants can have rings)
    if (planetType == 1) { 
        color = addRings(color, vPosition);
    }

    // Apply data visualization overlays (e.g., markers)
    for (int i = 0; i < planetDataCount; i++) {
        vec4 data = texture2D(planetDataTexture, vec2(float(i) / float(planetDataCount), 0.5));
        vec3 dataPos = data.xyz;
        float dataValue = data.w;
        
        float dist = distance(vPosition, dataPos);
        if (dist < 0.1) {
            float intensity = 1.0 - smoothstep(0.0, 0.1, dist);
            color = mix(color, vec3(1.0, 0.0, 0.0), intensity * dataValue);
        }
    }

    // Final color output with optional emissive features
    gl_FragColor = vec4(color, 1.0);
}

`;


/**
 * Creates a ShaderMaterial for a planet based on its data.
 * @param {object} planetData - Data object containing planet properties.
 * @returns {THREE.ShaderMaterial} - Configured ShaderMaterial.
 */
export function createPlanetMaterial(planetData) {
  // Helper function to calculate modulo (GLSL's mod function works differently)
  const mod = (n, m) => ((n % m) + m) % m;

  // Determine planet type
  const planetType = getPlanetType(planetData); // 0: rocky, 1: gas giant, 2: ice, 3: lava

  // Calculate gravity and density (optional, can be used for further adjustments)
  const gravity = calculateGravity(planetData);
  const density = calculateDensity(planetData.pl_masse, planetData.pl_rade);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const randomColor = (baseColor, range) => {
      const color = new THREE.Color(baseColor);
      color.r += (Math.random() - 0.5) * range;
      color.g += (Math.random() - 0.5) * range;
      color.b += (Math.random() - 0.5) * range;
      color.r = clamp(color.r, 0, 1);
      color.g = clamp(color.g, 0, 1);
      color.b = clamp(color.b, 0, 1);
      return color;
  };

  // Define uniforms with initial values
// Define uniforms with initial values
const uniforms = {
  // Existing uniforms
  elevationScale: { value: 0.05 },
  colorDeep: { value: randomColor(new THREE.Color(0x000080), 0.2) },
  colorShallow: { value: randomColor(new THREE.Color(0x1E90FF), 0.2) },
  colorLandLow: { value: randomColor(new THREE.Color(0x228B22), 0.2) },
  colorLandHigh: { value: randomColor(new THREE.Color(0xCCCC99), 0.2) },
  waterLevel: { value: 0.0 },
  specularStrength: { value: 0.5 },
  lightDirection: { value: new THREE.Vector3(1.0, 1.0, 1.0).normalize() },
  time: { value: 0.0 },
  planetType: { value: planetType },
  atmosphereDensity: { value: 0.0 },
  atmosphereColor: { value: randomColor(new THREE.Color(0.5, 0.6, 0.7), 0.2) },
  waterReflectivity: { value: 0.3 },
  waterSpecular: { value: 0.5 },
  waveAmplitude: { value: 0.02 },
  waveFrequency: { value: 2.0 },
  colorVariation: { value: 0.2 },
  colorNoise: { value: 0.1 },
  planetDataTexture: { value: null }, // Assign appropriate texture
  planetDataCount: { value: 0 },      // Set based on data

  // New uniforms for enhanced details
  cameraPosition: { value: new THREE.Vector3() },
  cloudCoverage: { value: 0.0 },
  cloudColor: { value: new THREE.Color(0xffffff) },
  cloudSpeed: { value: 0.0 },
  iceCapSize: { value: 0.0 },
  iceCapColor: { value: new THREE.Color(0xffffff) },
  ringOpacity: { value: 0.0 },
  ringColor: { value: new THREE.Color(0xffffff) },
  ringThickness: { value: 0.0 },
  surfaceRoughness: { value: 1.0 },
  vegetationDensity: { value: 0.0 },
  vegetationColor: { value: new THREE.Color(0x228B22) },
  volcanicActivity: { value: 0.0 },
  volcanicColor: { value: new THREE.Color(0xff4500) },
  auroraIntensity: { value: 0.0 },
  auroraColor: { value: new THREE.Color(0x00ffff) },
  emissiveIntensity: { value: 0.0 },    // Intensity of emissive features
  emissiveColor: { value: new THREE.Color(0xff4500) }, // Color of emissive features

  // Additional uniforms for color accents and bands
  colorAccent1: { value: new THREE.Color(0xffffff) },
  colorAccent2: { value: new THREE.Color(0xffffff) },
  colorBand1: { value: new THREE.Color(0xffffff) },
  colorBand2: { value: new THREE.Color(0xffffff) },
  colorBand3: { value: new THREE.Color(0xffffff) },

  // **Add Missing Uniforms Here**
  // Lava Planet Uniforms
  colorLava1: { value: new THREE.Color(1.0, 0.7, 0.2) },
  colorLava2: { value: new THREE.Color(0.9, 0.4, 0.1) },
  colorLava3: { value: new THREE.Color(0.7, 0.2, 0.0) },

  // Ice Planet Uniforms (if used similarly)
  colorIce1: { value: new THREE.Color(0.9, 0.95, 1.0) },
  colorIce2: { value: new THREE.Color(0.7, 0.8, 0.9) },
  colorIce3: { value: new THREE.Color(0.85, 0.9, 0.95) },
};


  /**
   * Adjust uniforms based on planet type for enhanced realism.
   */
  switch (planetType) {
      case 0:
          // Rocky Planet Adjustments
          uniforms.elevationScale.value = 0.05 + Math.random() * 0.03;
          uniforms.waterLevel.value = -0.02 + Math.random() * 0.04;
          uniforms.specularStrength.value = 0.4 + Math.random() * 0.2;

          {
              const temp = planetData.pl_eqt || 300;
              const tempFactor = THREE.MathUtils.clamp((temp - 200) / 800, 0, 1);
              const composition = planetData.pl_dens || 1.0;

              let baseHue = 0.3 + Math.random() * 0.1;
              if (temp > 500) baseHue = 0.05 + Math.random() * 0.1;
              if (composition > 5) baseHue = 0.6 + Math.random() * 0.1;

              const landColorLow = new THREE.Color().setHSL(baseHue, 0.8, 0.3 + tempFactor * 0.3);
              const landColorMid = new THREE.Color().setHSL(mod(baseHue + 0.05, 1), 0.7, 0.4 + tempFactor * 0.25);
              const landColorHigh = new THREE.Color().setHSL(mod(baseHue + 0.1, 1), 0.6, 0.6 + tempFactor * 0.2);
              uniforms.colorLandLow.value = randomColor(landColorLow, 0.1);
              uniforms.colorLandHigh.value = randomColor(landColorHigh, 0.1);

              // Additional Color Accents
              uniforms.colorAccent1.value = randomColor(new THREE.Color().setHSL(mod(baseHue + 0.2, 1), 0.9, 0.5), 0.1);
              uniforms.colorAccent2.value = randomColor(new THREE.Color().setHSL(mod(baseHue - 0.2, 1), 0.7, 0.6), 0.1);

              uniforms.elevationScale.value = 0.05 + (composition - 1) * 0.01 + Math.random() * 0.02;
              uniforms.waterLevel.value = Math.max(-0.02, -0.05 + tempFactor * 0.03 + Math.random() * 0.02);

              const atmFactor = Math.max(0.0, 1.0 - tempFactor);
              uniforms.atmosphereDensity.value = 0.5 * atmFactor + Math.random() * 0.2;
              uniforms.atmosphereColor.value = randomColor(new THREE.Color().setHSL(baseHue, 0.3, 0.7), 0.1);

              uniforms.specularStrength.value = 0.4 + tempFactor * 0.2 + Math.random() * 0.1;

              uniforms.waterReflectivity.value = 0.3 + tempFactor * 0.2 + Math.random() * 0.1;
              uniforms.waterSpecular.value = 0.5 + tempFactor * 0.3 + Math.random() * 0.1;
              uniforms.waveAmplitude.value = 0.02 + composition * 0.005 + Math.random() * 0.005;
              uniforms.waveFrequency.value = 2.0 + composition * 0.5 + Math.random() * 0.5;

              uniforms.colorVariation.value = 0.3 + tempFactor * 0.2 + Math.random() * 0.1;
              uniforms.colorNoise.value = 0.15 + composition * 0.05 + Math.random() * 0.05;

              // Add Vegetation
              uniforms.vegetationDensity.value = 0.5 + Math.random() * 0.5;
              uniforms.vegetationColor.value = randomColor(new THREE.Color(0x228B22), 0.1);

              // Optional: Add surface roughness based on composition
              uniforms.surfaceRoughness.value = 1.0 + (composition - 1) * 0.2 + Math.random() * 0.3;
          }
          break;

      case 1:
          // Gas Giant Adjustments
          uniforms.elevationScale.value = Math.random() * 0.05; // Increased variation
          uniforms.waterLevel.value = -0.05 + Math.random() * 0.1; // Wider range
          uniforms.specularStrength.value = 0.2 + Math.random() * 0.3; // More varied specular

          {
              const temp = planetData.pl_eqt || 1000;
              const hue1 = Math.random();
              const hue2 = (hue1 + 0.2 + Math.random() * 0.3) % 1.0;
              const hue3 = (hue2 + 0.2 + Math.random() * 0.3) % 1.0;

              uniforms.colorLandLow.value = randomColor(new THREE.Color().setHSL(hue1, 0.7 + Math.random() * 0.3, 0.4 + Math.random() * 0.2), 0.2);
              uniforms.colorLandHigh.value = randomColor(new THREE.Color().setHSL(hue2, 0.6 + Math.random() * 0.3, 0.5 + Math.random() * 0.2), 0.2);

              uniforms.colorBand1.value = randomColor(new THREE.Color().setHSL(hue3, 0.8 + Math.random() * 0.2, 0.4 + Math.random() * 0.2), 0.2);
              uniforms.colorBand2.value = randomColor(new THREE.Color().setHSL((hue1 + 0.5) % 1.0, 0.7 + Math.random() * 0.2, 0.6 + Math.random() * 0.2), 0.2);
              uniforms.colorBand3.value = randomColor(new THREE.Color().setHSL((hue2 + 0.5) % 1.0, 0.6 + Math.random() * 0.2, 0.5 + Math.random() * 0.2), 0.2);
          }

          uniforms.atmosphereDensity.value = 1.8 + Math.random() * 0.7;
          uniforms.atmosphereColor.value = randomColor(new THREE.Color().setHSL(Math.random(), 0.5 + Math.random() * 0.3, 0.6 + Math.random() * 0.2), 0.2);

          uniforms.waterReflectivity.value = Math.random() * 0.2;
          uniforms.waterSpecular.value = Math.random() * 0.2;
          uniforms.waveAmplitude.value = 0.01 + Math.random() * 0.02;
          uniforms.waveFrequency.value = 0.5 + Math.random() * 1.0;

          uniforms.colorVariation.value = 0.5 + Math.random() * 0.3;
          uniforms.colorNoise.value = 0.3 + Math.random() * 0.2;

          // Add Rings
          uniforms.ringOpacity.value = 0.5 + Math.random() * 0.5;
          uniforms.ringColor.value = randomColor(new THREE.Color(0xffffff), 0.2);
          uniforms.ringThickness.value = 0.05 + Math.random() * 0.05;

          // Add Cloud Layers
          uniforms.cloudCoverage.value = 0.3 + Math.random() * 0.5;
          uniforms.cloudColor.value = randomColor(new THREE.Color(0xffffff), 0.2);
          uniforms.cloudSpeed.value = 0.1 + Math.random() * 0.2;

          break;

      case 2:
          // Icy Planet Adjustments
          uniforms.elevationScale.value = 0.02 + Math.random() * 0.02;
          uniforms.waterLevel.value = -0.02 + Math.random() * 0.04;
          uniforms.colorLandLow.value = randomColor(new THREE.Color(0.8, 0.9, 1.0), 0.1);
          uniforms.colorLandHigh.value = randomColor(new THREE.Color(0.6, 0.8, 1.0), 0.1);
          uniforms.specularStrength.value = 0.6 + Math.random() * 0.2;

          uniforms.colorIce1.value = randomColor(new THREE.Color(0.9, 0.95, 1.0), 0.05);
          uniforms.colorIce2.value = randomColor(new THREE.Color(0.7, 0.8, 0.9), 0.05);
          uniforms.colorIce3.value = randomColor(new THREE.Color(0.85, 0.9, 0.95), 0.05);

          uniforms.atmosphereDensity.value = 2.0 + Math.random() * 0.5;
          uniforms.atmosphereColor.value = randomColor(new THREE.Color(0.6, 0.7, 0.8), 0.1);

          uniforms.waterReflectivity.value = 0.4 + Math.random() * 0.1;
          uniforms.waterSpecular.value = 0.6 + Math.random() * 0.1;
          uniforms.waveAmplitude.value = 0.015 + Math.random() * 0.005;
          uniforms.waveFrequency.value = 1.8 + Math.random() * 0.4;

          uniforms.colorVariation.value = 0.15 + Math.random() * 0.1;
          uniforms.colorNoise.value = 0.08 + Math.random() * 0.05;

          // Add Ice Caps
          uniforms.iceCapSize.value = 0.2 + Math.random() * 0.3;
          uniforms.iceCapColor.value = randomColor(new THREE.Color(0xadd8e6), 0.1);

          // Add Auroras
          uniforms.auroraIntensity.value = 0.3 + Math.random() * 0.7;
          uniforms.auroraColor.value = randomColor(new THREE.Color(0x00ffff), 0.2);

          break;

      case 3:
          // Lava Planet Adjustments
          uniforms.elevationScale.value = 0.03 + Math.random() * 0.02;
          uniforms.waterLevel.value = -0.02 + Math.random() * 0.04;
          uniforms.colorLandLow.value = randomColor(new THREE.Color(0.5, 0.1, 0.0), 0.1);
          uniforms.colorLandHigh.value = randomColor(new THREE.Color(1.0, 0.5, 0.0), 0.1);
          uniforms.specularStrength.value = 0.8 + Math.random() * 0.2;

          uniforms.colorLava1.value = randomColor(new THREE.Color(1.0, 0.7, 0.2), 0.1);
          uniforms.colorLava2.value = randomColor(new THREE.Color(0.9, 0.4, 0.1), 0.1);
          uniforms.colorLava3.value = randomColor(new THREE.Color(0.7, 0.2, 0.0), 0.1);

          uniforms.atmosphereDensity.value = 1.0 + Math.random() * 0.5;
          uniforms.atmosphereColor.value = randomColor(new THREE.Color(0.8, 0.3, 0.1), 0.1);

          uniforms.waterReflectivity.value = Math.random() * 0.1;
          uniforms.waterSpecular.value = Math.random() * 0.1;
          uniforms.waveAmplitude.value = Math.random() * 0.01;
          uniforms.waveFrequency.value = Math.random() * 0.5;

          uniforms.colorVariation.value = 0.5 + Math.random() * 0.2;
          uniforms.colorNoise.value = 0.3 + Math.random() * 0.1;

          // Add Volcanic Activity
          uniforms.volcanicActivity.value = Math.random() * 1.0;
          uniforms.volcanicColor.value = randomColor(new THREE.Color(0xff4500), 0.2);

          break;

      default:
          // Default Planet Adjustments
          uniforms.elevationScale.value = 0.05 + Math.random() * 0.02;
          uniforms.waterLevel.value = -0.02 + Math.random() * 0.04;
          uniforms.colorLandLow.value = randomColor(new THREE.Color(0.5, 0.5, 0.5), 0.2);
          uniforms.colorLandHigh.value = randomColor(new THREE.Color(0.7, 0.7, 0.7), 0.2);
          uniforms.specularStrength.value = 0.4 + Math.random() * 0.2;

          uniforms.atmosphereDensity.value = 0.5 + Math.random() * 0.3;
          uniforms.atmosphereColor.value = randomColor(new THREE.Color(0.5, 0.6, 0.7), 0.2);

          uniforms.waterReflectivity.value = 0.3 + Math.random() * 0.2;
          uniforms.waterSpecular.value = 0.5 + Math.random() * 0.2;
          uniforms.waveAmplitude.value = 0.02 + Math.random() * 0.01;
          uniforms.waveFrequency.value = 2.0 + Math.random() * 1.0;

          uniforms.colorVariation.value = 0.2 + Math.random() * 0.1;
          uniforms.colorNoise.value = 0.1 + Math.random() * 0.1;

          // Optional: Add default cloud coverage
          uniforms.cloudCoverage.value = 0.2 + Math.random() * 0.3;
          uniforms.cloudColor.value = randomColor(new THREE.Color(0xffffff), 0.2);
          uniforms.cloudSpeed.value = 0.1 + Math.random() * 0.2;

          break;
  }

  /**
   * Create the ShaderMaterial with defined vertex and fragment shaders.
   */
  const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,       // Ensure vertexShader is defined and includes necessary varyings
      fragmentShader: fragmentShader,   // Use the enhanced fragment shader
      side: THREE.FrontSide,
      transparent: uniforms.atmosphereDensity.value > 0.0,
      depthWrite: false,
  });

  return material;
}