// File: assets/js/exomania/materials/atmosphereMaterial.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function createAtmosphereMaterial() {
  const atmosphereMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 atmosphereColor;
      uniform float atmosphereIntensity;
      varying vec3 vNormal;

      void main() {
        float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
        gl_FragColor = vec4(atmosphereColor * intensity * atmosphereIntensity, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      atmosphereColor: { value: new THREE.Color(0x87CEEB) }, // Sky blue
      atmosphereIntensity: { value: 1.0 },
    },
  });

  return atmosphereMaterial;
}
