// File: assets/js/exomania/clouds.js

import { noiseFunctions } from './materials/shaderChunks.js';
import { getPlanetType } from './utils.js';

/**
 * Creates a dynamic cloud layer around the planet mesh.
 * @param {THREE.Mesh} planetMesh - The mesh of the planet.
 * @param {object} planetData - Data of the planet to determine cloud properties.
 * @returns {THREE.Mesh} The cloud mesh added to the planet.
 */
export function createClouds(planetMesh, planetData) {
  // Clone the planet's geometry to use for the clouds
  const cloudGeometry = planetMesh.geometry.clone();

  // Calculate planet radius safely
  let planetRadius = 1;
  if (planetMesh.geometry.boundingSphere && planetMesh.geometry.boundingSphere.radius) {
    planetRadius = planetMesh.geometry.boundingSphere.radius;
  } else if (planetData.pl_rade) {
    planetRadius = planetData.pl_rade * 0.1;
  }

  // Determine planet type
  const planetType = getPlanetType(planetData);

  // Define uniforms for the shader material
  const uniforms = {
    time: { value: 0.0 },
    cloudSpeed: { value: 0.02 },
    cloudCoverage: { value: 0.5 },
    cloudDensity: { value: 0.5 },
    cloudColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
    planetRadius: { value: planetRadius },
    cameraPosition: { value: new THREE.Vector3() },
    multiLayerNoiseScale: { value: 3.0 },
    multiLayerNoiseStrength: { value: 0.3 },
  };

  adjustCloudProperties(uniforms, planetData);

  // Vertex shader code
  const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      vWorldPosition = (modelMatrix * vec4(position + normal * 0.01, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.01, 1.0);
    }
  `;

  // Fragment shader code
  const fragmentShader = `
    uniform float time;
    uniform float cloudSpeed;
    uniform float cloudCoverage;
    uniform float cloudDensity;
    uniform vec3 cloudColor;
    uniform float multiLayerNoiseScale;
    uniform float multiLayerNoiseStrength;

    varying vec3 vWorldPosition;
    varying vec2 vUv;

    ${noiseFunctions}

    void main() {
      // Base layered noise for clouds
      vec3 noisePos = vWorldPosition * multiLayerNoiseScale + vec3(time * cloudSpeed);
      float baseNoise = fbm(noisePos);

      // Apply cloud coverage and density
      float cloudMask = smoothstep(cloudCoverage - 0.1, cloudCoverage + 0.1, baseNoise) * cloudDensity;
      
      // Calculate transparency based on view angle for soft edges
      float viewAngle = dot(normalize(vWorldPosition - cameraPosition), normalize(vWorldPosition));
      float alpha = pow(1.0 - viewAngle, 3.0) * cloudMask;
      
      // Set the fragment color
      vec3 finalColor = cloudColor * cloudMask;
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `;

  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false,
  });

  // Create the cloud mesh
  const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);

  // Scale the cloud mesh slightly larger than the planet mesh
  const cloudScale = 1.01; // Adjust as needed for desired cloud height
  cloudMesh.scale.set(cloudScale, cloudScale, cloudScale);

  // Add the cloud mesh to the planet mesh
  planetMesh.add(cloudMesh);

  // Update function to animate clouds and keep uniforms updated
  cloudMesh.userData.update = (deltaTime, camera) => {
    if (!camera || !camera.position) {
      console.error('Camera is undefined or missing position in cloudMesh.userData.update');
      return;
    }

    cloudMaterial.uniforms.time.value += deltaTime;
    cloudMaterial.uniforms.cameraPosition.value.copy(camera.position);
  };

  return cloudMesh;
}

/**
 * Adjusts cloud properties based on planet data.
 * @param {object} uniforms - The uniforms object for the cloud shader.
 * @param {object} planetData - Data of the planet to determine cloud properties.
 */
function adjustCloudProperties(uniforms, planetData) {
  // Adjust cloud coverage based on planet type
  const planetType = getPlanetType(planetData);
  switch (planetType) {
    case 0: // Rocky planet
      uniforms.cloudCoverage.value = 0.3;
      uniforms.cloudColor.value.setRGB(0.9, 0.9, 0.9);
      break;
    case 1: // Gas giant
      uniforms.cloudCoverage.value = 0.8;
      uniforms.cloudColor.value.setRGB(0.8, 0.8, 1.0);
      break;
    case 2: // Ice planet
      uniforms.cloudCoverage.value = 0.6;
      uniforms.cloudColor.value.setRGB(0.95, 0.95, 1.0);
      break;
    case 3: // Lava planet
      uniforms.cloudCoverage.value = 0.2;
      uniforms.cloudColor.value.setRGB(0.8, 0.6, 0.4);
      break;
    default:
      uniforms.cloudCoverage.value = 0.5;
      uniforms.cloudColor.value.setRGB(1.0, 1.0, 1.0);
  }

  // Adjust cloud density based on planet's atmosphere
  if (planetData.pl_hasatm === 'Y') {
    uniforms.cloudDensity.value = 0.7;
  } else {
    uniforms.cloudDensity.value = 0.3;
  }

  // Adjust cloud speed based on planet's rotation period (if available)
  if (planetData.pl_rotper) {
    uniforms.cloudSpeed.value = 0.02 / planetData.pl_rotper;
  }

  // Adjust multi-layer noise based on planet's mass (if available)
  if (planetData.pl_masse) {
    uniforms.multiLayerNoiseScale.value = 3.0 + (planetData.pl_masse / 100);
    uniforms.multiLayerNoiseStrength.value = 0.3 + (planetData.pl_masse / 1000);
  }
}