// File: assets/js/exomania/atmosphere.js

import { getPlanetType } from './utils.js';
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * Creates an atmospheric effect around the planet mesh with normal mapping.
 * @param {THREE.Mesh} planetMesh - The mesh of the planet.
 * @param {object} planetData - Data of the planet to determine atmospheric properties.
 * @param {THREE.Camera} camera - The camera to calculate view direction.
 * @returns {THREE.Mesh} - The atmospheric mesh added to the planet.
 */
export function createAtmosphere(planetMesh, planetData, camera) {
  const atmosphereGeometry = planetMesh.geometry.clone();

  // Calculate planet radius safely
  let planetRadius = 1;
  if (planetMesh.geometry.boundingSphere && planetMesh.geometry.boundingSphere.radius) {
    planetRadius = planetMesh.geometry.boundingSphere.radius;
  } else if (planetData.pl_rade) {
    planetRadius = planetData.pl_rade * 0.1;
  }

  const planetType = getPlanetType(planetData);

  // Define uniforms with expanded properties
  const uniforms = {
    atmosphereColor: { value: new THREE.Color(0.5, 0.6, 0.7) },
    planetRadius: { value: planetRadius },
    atmosphereRadius: { value: planetRadius * 1.025 },
    cameraPosition: { value: new THREE.Vector3() },
    atmosphereDensity: { value: 1.0 },
    scatteringCoefficient: { value: 0.05 },
    planetType: { value: planetType },
    time: { value: 0 },
    normalScale: { value: new THREE.Vector2(1, 1) },
    colorGradientStart: { value: new THREE.Color(0.5, 0.6, 0.7) },
    colorGradientEnd: { value: new THREE.Color(0.2, 0.3, 0.4) },
  };

  // Adjust uniforms based on planet type
  switch (planetType) {
    case 0:
      // Rocky Planet atmosphere color gradients
      uniforms.colorGradientStart.value.setHSL(0.3, 0.8, 0.6);
      uniforms.colorGradientEnd.value.setHSL(0.3, 0.5, 0.4);
      break;
    case 1:
      // Gas Giant atmosphere color gradients
      uniforms.colorGradientStart.value.setHSL(0.6, 0.6, 0.7);
      uniforms.colorGradientEnd.value.setHSL(0.6, 0.4, 0.5);
      break;
    case 2:
      // Icy Planet atmosphere color gradients
      uniforms.colorGradientStart.value.setHSL(0.55, 0.5, 0.8);
      uniforms.colorGradientEnd.value.setHSL(0.55, 0.3, 0.6);
      break;
    case 3:
      // Lava Planet atmosphere color gradients
      uniforms.colorGradientStart.value.setHSL(0.05, 0.8, 0.7);
      uniforms.colorGradientEnd.value.setHSL(0.05, 0.6, 0.5);
      break;
    default:
      // Default atmosphere color gradients
      uniforms.colorGradientStart.value.setHSL(0.5, 0.6, 0.7);
      uniforms.colorGradientEnd.value.setHSL(0.5, 0.4, 0.5);
      break;
  }

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
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;

      uniform float planetRadius;
      uniform float atmosphereRadius;

      ${shaderChunks} // Include all shader functions

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
  `;

  // Fragment Shader Code with Enhanced Color Gradients and Texture Variety
  const fragmentShader = `
      uniform vec3 atmosphereColor;
      uniform float planetRadius;
      uniform float atmosphereRadius;
      uniform float atmosphereDensity;
      uniform float scatteringCoefficient;
      uniform int planetType;
      uniform float time;
      uniform vec2 normalScale;
      uniform vec3 colorGradientStart;
      uniform vec3 colorGradientEnd;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;

      ${shaderChunks} // Include all shader functions

      // Simple normal map generation function
      vec3 createSimpleNormalMap(vec2 uv) {
        float noise = snoise(vec3(uv * 10.0, time * 0.1));
        return vec3(noise, noise, 1.0);
      }

      void main() {
        // Calculate view direction
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);

        // Calculate height above planet surface
        float height = length(vWorldPosition) - planetRadius;
        float atmosphereThickness = atmosphereRadius - planetRadius;

        // Generate normal map with enhanced texture
        vec3 normalMap = createSimpleNormalMap(vUv);
        vec3 normal = normalize(vNormal + normalMap * normalScale.x);

        // Calculate atmosphere density based on height
        float density = exp(-height / (atmosphereThickness * atmosphereDensity));

        // Scattering based on view angle
        float cosAngle = dot(normalize(vWorldPosition), viewDir);
        float scattering = pow(1.0 - cosAngle, 3.0) * scatteringCoefficient;

        // Apply color gradient based on height
        vec3 gradientColor = mix(colorGradientStart, colorGradientEnd, height / atmosphereThickness);
        vec3 finalColor = gradientColor;

        // Additional animated effects based on planet type
        if (planetType == 1) { // Gas giant
          finalColor *= 1.0 + 0.2 * sin(vWorldPosition.y * 10.0 + time * 0.1);
        } else if (planetType == 3) { // Lava planet
          finalColor *= 1.0 + 0.1 * sin(vWorldPosition.x * 20.0 + vWorldPosition.y * 20.0 + time * 0.2);
        }

        // Apply normal mapping effect
        float normalEffect = dot(normal, viewDir);
        finalColor *= 1.0 + normalEffect * 0.2;

        // Calculate final intensity
        float intensity = density * scattering;

        gl_FragColor = vec4(finalColor, intensity);
      }
  `;

  // Create ShaderMaterial for Atmosphere
  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.BackSide, // Render the atmosphere on the backside for proper viewing
    transparent: true,
    depthWrite: false,
  });

  // Create Atmosphere Mesh
  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);

  // Scale the atmosphere mesh slightly larger than the planet
  const atmosphereScale = uniforms.atmosphereRadius.value / planetRadius;
  atmosphereMesh.scale.set(atmosphereScale, atmosphereScale, atmosphereScale);

  // Add the atmosphere mesh to the planet
  planetMesh.add(atmosphereMesh);

  // Update function to handle dynamic uniforms
  atmosphereMesh.userData.update = (delta) => {
    if (!camera || !camera.position) {
      console.error('Camera is undefined or missing position in atmosphereMesh.userData.update');
      return;
    }

    // Update camera position uniform
    atmosphereMaterial.uniforms.cameraPosition.value.copy(camera.position);

    // Update time uniform for animations
    atmosphereMaterial.uniforms.time.value += delta;
  };

  return atmosphereMesh;
}
