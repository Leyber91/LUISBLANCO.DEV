// assets/js/black_hole/ring.js

/**
 * Creates and manages the accretion disk (ring) around the black hole.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {Object} blackHole - The black hole object containing position and properties.
 * @param {THREE.Camera} camera - The camera in the scene.
 * @param {Object} config - Configuration parameters.
 * @returns {Object} - An object with update and dispose methods.
 */

import { gravitationalLensingGLSL } from './sharedShaders.js';

export function createRing(scene, blackHole, camera, config) {
    // ======================
    // Define Shader Material for the Ring
    // ======================
    const ringVertexShader = `
        precision highp float;

        uniform vec3 uCameraPosition;
        uniform vec3 blackHolePosition;
        uniform float schwarzschildRadius;
        uniform float time;
        uniform vec3 ringColor; // Added uniform for color
        // Added uniforms
        uniform float G_CONSTANT;
        uniform float blackHoleMass;
        uniform float cSpeed;
        uniform float lensingFactor;
        ${gravitationalLensingGLSL}

        varying vec3 vColor;
        varying float vAlpha;

        void main() {
            // Apply gravitational lensing to vertex positions
            vec3 lensedPosition = applyGravitationalLensing(position);
            vec4 mvPosition = modelViewMatrix * vec4(lensedPosition, 1.0);
            
            // Set gl_Position
            gl_Position = projectionMatrix * mvPosition;

            // Pass color and alpha to fragment shader
            vColor = ringColor;
            vAlpha = 1.0 - smoothstep(schwarzschildRadius, ${config.LENSING_RADIUS}.0, length(lensedPosition - blackHolePosition));
        }
    `;

    const ringFragmentShader = `
        precision highp float;

        uniform sampler2D ringTexture;
        uniform float chromaticFactor;
        varying vec3 vColor;
        varying float vAlpha;
        // Added uniforms
        uniform float G_CONSTANT;
        uniform float blackHoleMass;
        uniform float cSpeed;

        void main() {
            // Apply chromatic aberration
            float offset = chromaticFactor / 1000.0;

            // Sample the texture with offsets for RGB channels
            float r = texture2D(ringTexture, gl_PointCoord.xy + vec2(offset, 0.0)).r;
            float g = texture2D(ringTexture, gl_PointCoord.xy).g;
            float b = texture2D(ringTexture, gl_PointCoord.xy - vec2(offset, 0.0)).b;

            vec4 texColor = vec4(r, g, b, texture2D(ringTexture, gl_PointCoord.xy).a);
            vec4 finalColor = vec4(vColor, vAlpha) * texColor;

            // Discard fragments with low alpha
            if (finalColor.a < 0.1) discard;

            gl_FragColor = finalColor;
        }
    `;

    // ======================
    // Create Ring Geometry
    // ======================
    const ringGeometry = new THREE.RingGeometry(
        config.ringInnerRadius,
        config.ringOuterRadius,
        config.ringSegments,
        config.ringThetaStart,
        config.ringThetaLength
    );

    // No need to convert to BufferGeometry as RingGeometry already extends BufferGeometry

    // ======================
    // Define Shader Material
    // ======================
    const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
            ringTexture: { value: generateRingTexture() },
            time: { value: 0.0 },
            blackHolePosition: { value: blackHole.position },
            schwarzschildRadius: { value: config.SCHWARZSCHILD_RADIUS },
            uCameraPosition: { value: camera.position },
            chromaticFactor: { value: config.chromaticFactor || 0.05 },
            ringColor: { value: new THREE.Color(0xffaa00) }, // Example color: gold
        },
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        transparent: true,
    });

    // ======================
    // Create the Ring Mesh
    // ======================
    const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    ringMesh.rotation.x = -Math.PI / 2; // Rotate to lie in the XZ plane
    scene.add(ringMesh);

    // ======================
    // Helper Function to Generate Ring Texture
    // ======================
    function generateRingTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');

        // Create radial gradient
        const gradient = context.createRadialGradient(
            size / 2,
            size / 2,
            0,
            size / 2,
            size / 2,
            size / 2
        );
        gradient.addColorStop(0, 'rgba(255, 215, 0, 1)'); // Gold color at center
        gradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.8)'); // Darker orange
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)'); // Transparent at edges

        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);

        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Updates the ring each frame.
     * @param {number} delta - Time elapsed since last frame.
     */
    function updateRing(delta) {
        ringMaterial.uniforms.time.value += delta;
        ringMaterial.uniforms.uCameraPosition.value.copy(camera.position);
    }

    /**
     * Disposes of the ring resources.
     */
    function disposeRing() {
        ringGeometry.dispose();
        ringMaterial.dispose();
        scene.remove(ringMesh);
    }

    // ======================
    // Return Update and Dispose Functions
    // ======================
    return {
        mesh: ringMesh,
        update: updateRing,
        dispose: disposeRing,
    };
}
