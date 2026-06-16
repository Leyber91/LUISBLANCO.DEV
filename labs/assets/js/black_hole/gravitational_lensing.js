/**
 * Advanced Gravitational Lensing for Black Hole Simulation
 * 
 * This module creates and manages a highly realistic gravitational lensing effect
 * that warps spacetime around the black hole, simulating the extreme bending of light
 * due to intense gravitational fields. It integrates seamlessly with the accretion disk 
 * and dynamic starfield to provide an immersive and scientifically-inspired experience.
 * 
 * Dependencies:
 * - THREE.js
 */

import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.1/dist/esm/simplex-noise.js';
// gravitational_lensing.js


/**
 * Advanced Gravitational Lensing using Kerr Metric Approximation
 * 
 * This module provides functions to calculate gravitational lensing effects
 * based on an approximation of the Kerr metric, accounting for black hole spin.
 * 
 * Dependencies:
 * - THREE.js
 */

export function calculateKerrLensing(position, cameraPosition, blackHole) {
  // Constants
  const G = 6.67430e-11; // Gravitational constant
  const c = 299792458; // Speed of light in m/s
  const M = blackHole.mass; // Mass of the black hole in kg
  const a = blackHole.spinParameter; // Spin parameter (0 <= a <= G*M/c^2)
  
  // Calculate distance from black hole
  const r = position.length();

  // Avoid division by zero
  if (r === 0) return position.clone();

  // Unit vectors
  const rHat = position.clone().normalize();
  const cameraDir = cameraPosition.clone().sub(position).normalize();

  // Frame dragging effect
  const frameDraggingStrength = (2 * G * M * a) / (c * c * r * r * r);
  const frameDragging = new THREE.Vector3().crossVectors(rHat, cameraDir).multiplyScalar(frameDraggingStrength);

  // Lensing strength based on Kerr metric approximation
  const lensingStrength = (4 * G * M) / (c * c * r);

  // Apply lensing
  const lensedPosition = position.clone().add(frameDragging.multiplyScalar(lensingStrength));

  return lensedPosition;
}

export function createGravitationalLensing(scene, camera) {
  // Vertex Shader: Passes necessary data to Fragment Shader
  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;

    void main() {
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  // Fragment Shader: Implements Gravitational Lensing Effects
  const fragmentShader = `
    precision highp float;
    precision highp int;

    uniform samplerCube skybox;
    uniform sampler2D starField;
    uniform float time;
    uniform vec3 blackHolePosition;
    uniform float schwarzschildRadius;
    uniform vec3 camPosition;
    uniform float lensingFactor;
    uniform float accretionDiskIntensity;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying vec2 vUv;

    // Constants for Ray Marching
    #define MAX_STEPS 150
    #define MAX_DIST 2000.0
    #define EPSILON 0.001

    // Function to create a rotation matrix given an axis and angle
    mat3 rotationMatrix(vec3 axis, float angle) {
      axis = normalize(axis);
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;
      
      return mat3(
        oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
      );
    }

    // Enhanced gravitational lensing function
    vec3 calculateLensing(vec3 rayOrigin, vec3 rayDir) {
      vec3 currentPos = rayOrigin;
      vec3 direction = rayDir;
      float photonSphere = 1.5 * schwarzschildRadius;

      for(int i = 0; i < MAX_STEPS; i++) {
        vec3 toBlackHole = blackHolePosition - currentPos;
        float dist = length(toBlackHole);

        if(dist < schwarzschildRadius) {
          // Inside the event horizon; light cannot escape
          return vec3(0.0);
        }

        // Enhanced bending calculation
        if(dist < photonSphere * 2.0) {
          float bendFactor = lensingFactor * pow(1.0 - dist / (photonSphere * 2.0), 2.0);
          vec3 bendAxis = normalize(cross(direction, toBlackHole));
          direction = normalize(rotationMatrix(bendAxis, bendFactor) * direction);
          
          // Add subtle swirl effect
          float swirlFactor = 0.1 * sin(time * 0.5) * (1.0 - dist / (photonSphere * 2.0));
          direction = normalize(rotationMatrix(normalize(toBlackHole), swirlFactor) * direction);
        }

        // Move the ray forward with adaptive step size
        float stepSize = max(dist * 0.1, EPSILON);
        currentPos += direction * stepSize;

        // Terminate if ray travels beyond maximum distance
        if(length(currentPos - rayOrigin) > MAX_DIST) break;
      }

      return normalize(direction);
    }

    // Enhanced accretion disk simulation
    vec4 simulateAccretionDisk(vec3 position) {
      float dist = length(position - blackHolePosition);
      float diskWidth = schwarzschildRadius * 4.0;
      float innerRadius = schwarzschildRadius * 2.0;
      float outerRadius = schwarzschildRadius * 15.0;
      
      if(abs(position.y - blackHolePosition.y) < diskWidth && dist > innerRadius && dist < outerRadius) {
        float temp = 1.0 - (dist - innerRadius) / (outerRadius - innerRadius);
        
        // Dynamic color based on temperature and time
        vec3 hotColor = vec3(1.0, 0.6, 0.1);
        vec3 coolColor = vec3(0.1, 0.2, 1.0);
        float timeFactor = sin(time * 0.5 + dist * 0.1) * 0.5 + 0.5;
        vec3 diskColor = mix(coolColor, hotColor, temp * timeFactor);
        
        // Add pulsating effect
        float pulse = sin(time * 2.0 + dist * 0.5) * 0.5 + 0.5;
        float intensity = accretionDiskIntensity * pow(temp, 2.0) * (1.0 + pulse * 0.2);
        
        // Add swirl pattern
        float swirl = fract(atan(position.z - blackHolePosition.z, position.x - blackHolePosition.x) / (2.0 * 3.14159) + time * 0.1);
        intensity *= (0.8 + swirl * 0.4);

        return vec4(diskColor * intensity, 1.0);
      }
      
      return vec4(0.0);
    }

    void main() {
      // Initial Ray Direction
      vec3 rayDir = normalize(vWorldPosition - camPosition);
      
      // Apply Enhanced Gravitational Lensing
      vec3 lensedDir = calculateLensing(camPosition, rayDir);
      
      // Chromatic Aberration: Slightly offset the sampling direction for each color channel
      vec3 lensedDirRed = calculateLensing(camPosition, rayDir + vec3(0.001, 0.0, 0.0));
      vec3 lensedDirGreen = calculateLensing(camPosition, rayDir + vec3(0.0, 0.001, 0.0));
      vec3 lensedDirBlue = calculateLensing(camPosition, rayDir + vec3(0.0, 0.0, 0.001));

      // Sample the skybox for each color channel
      vec4 skyColorRed = textureCube(skybox, lensedDirRed);
      vec4 skyColorGreen = textureCube(skybox, lensedDirGreen);
      vec4 skyColorBlue = textureCube(skybox, lensedDirBlue);

      // Combine the color channels to create chromatic aberration effect
      vec4 skyColor = vec4(skyColorRed.r, skyColorGreen.g, skyColorBlue.b, 1.0);
      
      // Simulate enhanced accretion disk
      vec4 diskColor = simulateAccretionDisk(vWorldPosition);
      
      // Combine skybox and accretion disk colors with improved blending
      vec4 finalColor = mix(skyColor, diskColor, diskColor.a * 0.8);
      
      // Apply Gravitational Redshift with more pronounced effect
      float distance = length(blackHolePosition - vWorldPosition);
      float redshift = sqrt(1.0 - (schwarzschildRadius / max(distance, schwarzschildRadius * 1.1)));
      finalColor.rgb *= pow(redshift, 1.5);
      
      // Enhanced color shift near the event horizon
      float proximity = clamp((schwarzschildRadius * 2.0 - distance) / (schwarzschildRadius), 0.0, 1.0);
      finalColor.rgb += vec3(proximity * 0.4, proximity * 0.2, proximity * 0.6);
      
      // Simulate star distortion using the starField texture with dynamic warping
      vec2 starUV = vUv + lensedDir.xy * 0.1 + vec2(sin(time * 0.2 + vUv.x * 10.0), cos(time * 0.2 + vUv.y * 10.0)) * 0.02;
      vec4 starColor = texture2D(starField, starUV);
      finalColor += starColor * (1.0 - proximity) * (1.0 + sin(time + vUv.x * 20.0) * 0.2);
      
      // Add subtle pulsating glow effect
      float glow = sin(time * 2.0) * 0.5 + 0.5;
      finalColor.rgb += vec3(0.1, 0.05, 0.2) * glow * (1.0 - proximity);
      
      // Enhanced edge glow effect
      float edgeFactor = 1.0 - max(0.0, dot(rayDir, vNormal));
      finalColor.rgb += vec3(edgeFactor * 0.3, edgeFactor * 0.1, edgeFactor * 0.4) * (1.0 + sin(time * 3.0) * 0.2);
      
      gl_FragColor = finalColor;
    }
  `;

  // Create a large sphere geometry to encompass the scene for lensing effects
  const geometry = new THREE.SphereGeometry(100, 1024, 1024);

  // Create dynamic star field texture
  const starFieldTexture = createStarFieldTexture();

  // Create ShaderMaterial with enhanced gravitational lensing shader
  const lensingMaterial = new THREE.ShaderMaterial({
    uniforms: {
      skybox: { value: scene.background },
      starField: { value: starFieldTexture },
      time: { value: 0.0 },
      blackHolePosition: { value: new THREE.Vector3(0, 0, 0) },
      schwarzschildRadius: { value: 10.0 }, // Adjust based on simulation scale
      camPosition: { value: camera.position },
      lensingFactor: { value: 5.0 }, // Adjust for stronger or weaker lensing
      accretionDiskIntensity: { value: 2.0 },
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.BackSide, // Render inside of the sphere
    transparent: true,
  });

  const lensingMesh = new THREE.Mesh(geometry, lensingMaterial);
  scene.add(lensingMesh);

  /**
   * Update function for gravitational lensing.
   * @param {number} delta - Time elapsed since last frame (in seconds).
   */
  function updateLensing(delta) {
    lensingMaterial.uniforms.time.value += delta;
    lensingMaterial.uniforms.camPosition.value.copy(camera.position);
    
    // Dynamically adjust lensing factor based on camera distance
    const distToBlackHole = camera.position.length();
    lensingMaterial.uniforms.lensingFactor.value = 5.0 + 10.0 * Math.max(0, 1 - distToBlackHole / 50);
    
    // Pulse the accretion disk intensity for dynamic visuals
    lensingMaterial.uniforms.accretionDiskIntensity.value = 2.0 + Math.sin(lensingMaterial.uniforms.time.value * 0.5) * 0.5;
  }

  return {
    update: updateLensing,
    material: lensingMaterial,
  };
}

/**
 * Generates a dynamic star field texture.
 * Stars are randomly placed with varying brightness and sizes for realism.
 * @returns {THREE.Texture} - The generated star field texture.
 */
function createStarFieldTexture() {
  const size = 2048; // Texture resolution (2048x2048). Adjust based on performance needs.
  const data = new Uint8Array(size * size * 4);

  // Initialize Simplex Noise generator
  const noise2D = createNoise2D();

  // Parameters for nebula generation
  const nebulaScale = 0.005; // Controls the size of nebula features
  const nebulaIntensity = 50; // Controls the overall brightness of the nebula
  const nebulaLayers = 3; // Number of noise layers to combine

  // Parameters for star generation
  const starDensity = 0.0015; // Probability of a star at any given pixel
  const maxStarSize = 3; // Maximum radius of stars in pixels

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Generate multi-layered Simplex Noise for nebula
      let noiseValue = 0;
      for (let layer = 1; layer <= nebulaLayers; layer++) {
        noiseValue += noise2D(x * nebulaScale * layer, y * nebulaScale * layer) / layer;
      }
      noiseValue = Math.max(0, noiseValue * 0.5 + 0.5); // Normalize to [0,1]

      // Nebula color gradients based on noise
      // Example: mix between deep purple and bright blue
      const nebulaColor1 = new THREE.Color(0x2e003e); // Deep purple
      const nebulaColor2 = new THREE.Color(0x0000ff); // Bright blue
      const nebulaColor3 = new THREE.Color(0x1a1aff); // Lighter blue

      let nebulaColor = new THREE.Color();
      nebulaColor.copy(nebulaColor1).lerp(nebulaColor2, noiseValue);
      nebulaColor.lerp(nebulaColor3, noiseValue * noiseValue); // Add more blue based on noise

      // Apply brightness scaling
      nebulaColor.multiplyScalar(nebulaIntensity * noiseValue);

      // Generate stars with controlled distribution
      if (Math.random() < starDensity) {
        const starBrightness = Math.random() * 200 + 55; // Brightness between 55 and 255
        const starColor = new THREE.Color();
        const colorVariation = Math.random() * 0.2; // Slight color variation
        starColor.setHSL(0.6, 0.8, 0.9 + colorVariation); // Blueish to white stars

        const starSize = Math.floor(Math.random() * maxStarSize) + 1; // Star size between 1 and maxStarSize

        // Draw the star as a simple circle
        for (let sy = -starSize; sy <= starSize; sy++) {
          for (let sx = -starSize; sx <= starSize; sx++) {
            const nx = x + sx;
            const ny = y + sy;

            // Boundary check
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              const distance = Math.sqrt(sx * sx + sy * sy);
              if (distance <= starSize) {
                const si = (ny * size + nx) * 4;
                const intensityFactor = 1 - (distance / starSize); // Fade out towards edges

                // Blend star color with nebula background
                data[si] = Math.min(255, Math.floor(starColor.r * starBrightness * intensityFactor) + data[si]);
                data[si + 1] = Math.min(255, Math.floor(starColor.g * starBrightness * intensityFactor) + data[si + 1]);
                data[si + 2] = Math.min(255, Math.floor(starColor.b * starBrightness * intensityFactor) + data[si + 2]);
                data[si + 3] = 255; // Fully opaque
              }
            }
          }
        }
      } else {
        // Set nebula background
        data[i] = Math.floor(nebulaColor.r); // Red channel
        data[i + 1] = Math.floor(nebulaColor.g); // Green channel
        data[i + 2] = Math.floor(nebulaColor.b); // Blue channel
        data[i + 3] = 255; // Fully opaque
      }
    }
  }

  // Create Three.js DataTexture
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
