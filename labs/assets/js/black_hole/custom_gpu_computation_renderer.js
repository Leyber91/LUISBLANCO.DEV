// custom_gpu_computation_renderer.js



class CustomGPUComputationRenderer {
  constructor(width, height, renderer, params = {}) {
    this.width = width;
    this.height = height;
    this.renderer = renderer;

    // Create data texture for positions
    this.positionTexture = this.createDataTexture();

    // Initialize render target for positions
    this.positionRenderTarget = this.createRenderTarget(this.positionTexture);

    // Setup scene and camera for rendering
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.camera.position.z = 1;

    // Define shader material for position updates
    this.positionMaterial = this.createPositionMaterial(params);

    // Create a quad to render the position shader
    this.positionQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.positionMaterial);
    this.scene.add(this.positionQuad);
  }

  /**
   * Creates an empty data texture with random initial positions.
   */
  createDataTexture() {
    const size = this.width * this.height;
    const data = new Float32Array(4 * size);
    for (let i = 0; i < size; i++) {
      data[i * 4 + 0] = THREE.MathUtils.randFloatSpread(120); // X position
      data[i * 4 + 1] = THREE.MathUtils.randFloatSpread(120); // Y position
      data[i * 4 + 2] = THREE.MathUtils.randFloatSpread(120); // Z position
      data[i * 4 + 3] = 1.0; // Unused
    }
    const texture = new THREE.DataTexture(data, this.width, this.height, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Creates a WebGLRenderTarget.
   */
  createRenderTarget(initialTexture) {
    return new THREE.WebGLRenderTarget(this.width, this.height, {
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      stencilBuffer: false,
      depthBuffer: false,
    });
  }

  /**
   * Creates the shader material for position updates.
   */
  createPositionMaterial(params) {
    const {
      G = 1.0,
      blackHoleMass = 1000.0,
      eventHorizonRadius = 3.0,
      respawnRadius = 60.0,
    } = params;

    const fragmentShader = `
      precision highp float;
      uniform sampler2D positionTexture;
      uniform float delta;
      uniform float G;
      uniform float blackHoleMass;
      uniform float eventHorizonRadius;
      uniform float respawnRadius;

      varying vec2 vUv;

      // Simple hash function for randomness
      float rand(vec2 co){
          return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / vec2(${this.width.toFixed(1)}, ${this.height.toFixed(1)});
        
        // Retrieve current position
        vec3 position = texture2D(positionTexture, uv).xyz;

        // Calculate vector towards black hole (assumed at origin)
        vec3 direction = -position;
        float distance = length(direction) + 0.0001; // Prevent division by zero
        float distanceSq = distance * distance;

        // Normalize direction
        vec3 normDir = direction / distance;

        // Calculate gravitational acceleration
        float accelerationMagnitude = (G * blackHoleMass) / distanceSq;
        vec3 acceleration = normDir * accelerationMagnitude;

        // Update position based on acceleration
        position += acceleration * delta;

        // Check if particle crosses the event horizon
        if (distance < eventHorizonRadius) {
          // Respawn particle at a random position outside the event horizon
          float theta = rand(uv * delta) * 2.0 * 3.14159265359;
          float phi = acos(2.0 * rand(uv * delta + 1.0) - 1.0);
          float r = rand(uv * delta + 2.0) * (respawnRadius - eventHorizonRadius) + eventHorizonRadius + 5.0;

          // Convert to Cartesian coordinates
          position = vec3(
            r * sin(phi) * cos(theta),
            r * sin(phi) * sin(theta),
            r * cos(phi)
          );
        }

        // Output updated position
        gl_FragColor = vec4(position, 1.0);
      }
    `;

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        positionTexture: { value: null }, // To be set externally
        delta: { value: 0.016 }, // Initial delta time
        G: { value: G },
        blackHoleMass: { value: blackHoleMass },
        eventHorizonRadius: { value: eventHorizonRadius },
        respawnRadius: { value: respawnRadius },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthWrite: false,
      depthTest: false,
      transparent: false,
    });

    return material;
  }

  /**
   * Sets uniforms for the shader.
   */
  setUniforms({ delta, G, blackHoleMass, eventHorizonRadius, respawnRadius }) {
    this.positionMaterial.uniforms.delta.value = delta;
    this.positionMaterial.uniforms.G.value = G;
    this.positionMaterial.uniforms.blackHoleMass.value = blackHoleMass;
    this.positionMaterial.uniforms.eventHorizonRadius.value = eventHorizonRadius;
    this.positionMaterial.uniforms.respawnRadius.value = respawnRadius;
  }

  /**
   * Performs the computation step.
   */
  compute() {
    // Render the shader to update positions
    this.renderer.setRenderTarget(this.positionRenderTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  /**
   * Retrieves the updated position texture.
   */
  getPositionTexture() {
    return this.positionRenderTarget.texture;
  }

  /**
   * Dispose function to clean up resources.
   */
  dispose() {
    this.positionMaterial.dispose();
    this.positionRenderTarget.dispose();
    this.scene.remove(this.positionQuad);
  }
}

export { CustomGPUComputationRenderer };
