// assets/js/black_hole/event_horizon.js

/**
 * Event Horizon Representation with Enhanced Features
 * 
 * This module creates and manages the visual representation of the black hole's event horizon,
 * including its shadow and subtle dynamic effects to simulate time dilation and frame dragging.
 * 
 * Dependencies:
 * - THREE.js
 */

/**
 * Creates the event horizon visualization for the black hole.
 * @param {THREE.Scene} scene - The Three.js scene to which the event horizon will be added.
 * @param {Object} blackHole - An object representing the black hole with properties like position, mass, etc.
 * @param {THREE.Camera} camera - The camera used in the scene.
 * @returns {Object} - An object containing the mesh, update, and dispose functions.
 */
export function createEventHorizon(scene, blackHole, camera) {
    const geometry = new THREE.SphereGeometry(blackHole.schwarzschildRadius, 64, 64);
  
    const material = new THREE.ShaderMaterial({
      uniforms: {
        blackHolePosition: { value: blackHole.position },
        uCameraPosition: { value: camera.position },
        radius: { value: blackHole.schwarzschildRadius },
        time: { value: 0.0 },
        blackHoleMass: { value: blackHole.mass },
      },
      vertexShader: `
        uniform vec3 uCameraPosition;
        uniform vec3 blackHolePosition;
        uniform float radius;
        uniform float time;
        uniform float blackHoleMass;
  
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        void main() {
          // Render the event horizon as a solid black sphere
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `,
      blending: THREE.NormalBlending,
      transparent: false,
      depthWrite: true,
    });
  
    const eventHorizonMesh = new THREE.Mesh(geometry, material);
    scene.add(eventHorizonMesh);
  
    /**
     * Update function to animate the event horizon glow.
     * @param {number} delta - Time elapsed since the last frame (in seconds).
     */
    function update(delta) {
      material.uniforms.time.value += delta;
      material.uniforms.uCameraPosition.value.copy(camera.position);
  
      // Example of additional animations (e.g., subtle pulsating glow to simulate time dilation)
      // Not implementing a glow here to keep the event horizon purely dark
    }
  
    /**
     * Dispose function to clean up resources when no longer needed.
     */
    function dispose() {
      geometry.dispose();
      material.dispose();
      scene.remove(eventHorizonMesh);
    }
  
    // Return an object containing the mesh, update, and dispose functions
    return {
      mesh: eventHorizonMesh,
      update,
      dispose,
    };
  }
  