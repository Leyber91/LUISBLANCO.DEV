// assets/js/black_hole/particle_system.js

/**
 * Advanced Particle System for Black Hole Simulation with Accretion Disk and Gravitational Lensing
 * 
 * This module creates and manages a highly realistic particle system that visualizes particles forming
 * an accretion disk around a black hole. It incorporates gravitational lensing effects that bend the
 * appearance of the accretion disk and particles over the sphere, similar to the visual effects seen in "Interstellar".
 * The particles' movements are heavily influenced by the black hole's gravity, magnetic fields, and
 * frame dragging, providing an immersive and scientifically inspired experience.
 * 
 * Dependencies:
 * - THREE.js
 */

export function createParticleSystem(scene, blackHole, camera, config) {
  // ======================
  // Configuration Parameters
  // ======================
  // Removed destructuring to allow dynamic access to config properties
  // const { ... } = config; // Removed

  // ======================
  // Create Buffer Geometry for Particles
  // ======================
  const geometry = new THREE.BufferGeometry();

  // Initialize Arrays for Particle Attributes
  const PARTICLE_COUNT = config.PARTICLE_COUNT; // Accessed dynamically
  const positions = new Float32Array(PARTICLE_COUNT * 3);    // Current positions
  const velocities = new Float32Array(PARTICLE_COUNT * 3);   // Current velocities
  const colors = new Float32Array(PARTICLE_COUNT * 3);       // Current colors
  const sizes = new Float32Array(PARTICLE_COUNT);            // Particle sizes
  const lifetimes = new Float32Array(PARTICLE_COUNT);        // Particle lifetimes
  const energies = new Float32Array(PARTICLE_COUNT);         // Particle energies

  // Initialize Circular Buffers for Particle Trails
  const TRAIL_LENGTH = config.TRAIL_LENGTH; // Accessed dynamically
  const trailPositions = new Float32Array(PARTICLE_COUNT * TRAIL_LENGTH * 3);
  const trailSizes = new Float32Array(PARTICLE_COUNT * TRAIL_LENGTH);
  const trailColors = new Float32Array(PARTICLE_COUNT * TRAIL_LENGTH * 3);
  const trailIndices = new Uint16Array(PARTICLE_COUNT * TRAIL_LENGTH);
  const trailCurrentIndex = new Uint16Array(PARTICLE_COUNT).fill(0);

  for (let i = 0; i < PARTICLE_COUNT * TRAIL_LENGTH; i++) {
    trailIndices[i] = i;
  }

  // Temporary Variables for Calculations
  const tempPosition = new THREE.Vector3();
  const tempVelocity = new THREE.Vector3();
  const tempAcceleration = new THREE.Vector3();

  // ======================
  // Initialize Particle Attributes
  // ======================
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    resetParticle(i);
  }

  // ======================
  // Set Attributes to Geometry
  // ======================
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('energy', new THREE.BufferAttribute(energies, 1).setUsage(THREE.DynamicDrawUsage));

  // ======================
  // Trail Geometry using InstancedBufferGeometry for Performance
  // ======================
  const trailGeometry = new THREE.InstancedBufferGeometry();
  const baseTrailGeometry = new THREE.BufferGeometry();
  baseTrailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
  trailGeometry.index = baseTrailGeometry.index;
  trailGeometry.attributes.position = baseTrailGeometry.attributes.position;

  // Instance attributes for trail positions, sizes, and colors
  trailGeometry.setAttribute('instanceStart', new THREE.InstancedBufferAttribute(trailPositions, 3, false).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('instanceSize', new THREE.InstancedBufferAttribute(trailSizes, 1, false).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(trailColors, 3, false).setUsage(THREE.DynamicDrawUsage));

  // ======================
  // Define Shader Material for Trails with Gravitational Lensing
  // ======================
  const trailMaterial = new THREE.ShaderMaterial({
    uniforms: {
      trailTexture: { value: generateTrailTexture() },
      time: { value: 0.0 },
      blackHolePosition: { value: blackHole.position },
      schwarzschildRadius: { value: config.SCHWARZSCHILD_RADIUS },
      uCameraPosition: { value: camera.position },
      backgroundSkybox: { value: scene.background }, // Assuming scene.background is a CubeTexture
      lensingStrength: { value: config.LENSING_STRENGTH || 1.0 },
      focalLength: { value: config.FOCAL_LENGTH || 1.0 },
    },
    vertexShader: `
      uniform vec3 uCameraPosition;
      uniform vec3 blackHolePosition;
      uniform float schwarzschildRadius;
      uniform float lensingStrength;
      uniform float focalLength;
      

      const float PI = 3.14159265358979323846264;

      attribute vec3 instanceStart;
      attribute float instanceSize;
      attribute vec3 instanceColor;
      varying vec3 vColor;

      // Helper function to rotate a point around an axis by an angle
      vec3 rotateAroundAxis(vec3 point, vec3 center, vec3 axis, float angle) {
          vec3 pos = point - center;
          float cosAngle = cos(angle);
          float sinAngle = sin(angle);
          return center + (cosAngle * pos) + (sinAngle * cross(axis, pos)) + ((1.0 - cosAngle) * dot(axis, pos) * axis);
      }
vec3 applyGravitationalLensing(vec3 position) {
    vec3 toCamera = normalize(uCameraPosition - position);
    vec3 toBlackHole = normalize(blackHolePosition - position);
    vec3 displacement = position - blackHolePosition;
    float r = length(displacement);

    if (r > schwarzschildRadius) {
        // Calculate the impact parameter 'b'
        float impactParameter = length(cross(displacement, toCamera)) / length(toCamera);

        // Avoid division by zero
        impactParameter = max(impactParameter, schwarzschildRadius * 0.001);

        // Calculate the deflection angle 'alpha' using a more precise formula
        // For small angles, alpha ≈ (4 * G * M) / (c^2 * b)
        // Assuming normalized units where G = c = 1, alpha ≈ 4 * mass / b
        float alpha = (4.0 * schwarzschildRadius) / impactParameter;

        // Remove or adjust the deflection angle limit
        // alpha = min(alpha, PI / 2.0); // Removed for full 360-degree lensing

        // Calculate the bending axis
        vec3 bendAxis = normalize(cross(toCamera, toBlackHole));
        if (length(bendAxis) < 0.001) {
            // Handle the case when vectors are parallel
            bendAxis = vec3(0.0, 1.0, 0.0);
        }

        // Apply lensing strength and focal length
        alpha *= lensingStrength;
        float focal = focalLength;

        // Rotate the position around the bend axis by the deflection angle scaled by lensing strength
        vec3 lensedPosition = rotateAroundAxis(position, blackHolePosition, bendAxis, alpha * focal);

        return lensedPosition;
    } else {
        return position;
    }
}


      void main() {
          // Declare variables
          vec3 lensedPosition;
          vec4 mvPosition;
          float distanceToCamera;
          float sizeAttenuation;
          
          // Set color
          vColor = instanceColor;

          // Apply gravitational lensing
          lensedPosition = applyGravitationalLensing(instanceStart);
          
          // Calculate model view position
          mvPosition = modelViewMatrix * vec4(lensedPosition, 1.0);
          
          // Calculate distance to camera for size attenuation
          distanceToCamera = -mvPosition.z;
          
          // Apply size attenuation with a minimum size to prevent disappearance
          sizeAttenuation = max(300.0 / distanceToCamera, 0.1);
          gl_PointSize = instanceSize * sizeAttenuation;
          
          // Set final position
          gl_Position = projectionMatrix * mvPosition;
          
          // Optional: Add time-based color variation
          // vColor *= 0.8 + 0.2 * sin(time * 0.01);
          
          // Optional: Add distance-based alpha
          // vColor.a *= smoothstep(100.0, 10.0, distanceToCamera);
      }
    `,
    fragmentShader: `
      uniform sampler2D trailTexture;
      varying vec3 vColor;

      void main() {
        float alpha = texture2D(trailTexture, gl_PointCoord.xy).a;
        gl_FragColor = vec4(vColor, alpha);
        if (gl_FragColor.a < 0.1) discard;
      }
    `,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    transparent: true,
  });

  // ======================
  // Create the Trail System
  // ======================
  const trailSystem = new THREE.Points(trailGeometry, trailMaterial);
  scene.add(trailSystem);

  // ======================
  // Define Shader Material for Particles with Enhanced Gravitational Lensing and Relativistic Effects
  // ======================
 // Inside particle_system.js
 const material = new THREE.ShaderMaterial({
  uniforms: {
    pointTexture: { value: generatePointTexture() },
    time: { value: 0.0 },
    blackHolePosition: { value: blackHole.position },
    schwarzschildRadius: { value: config.SCHWARZSCHILD_RADIUS },
    uCameraPosition: { value: camera.position },
    chromaticFactor: { value: config.chromaticFactor || 0.1 },
    intensityFactor: { value: config.intensityFactor || 1.0 },
    deltaTime: { value: 0.016 }, // Initialize with approximate frame time
    relativisticBeaming: { value: config.relativisticBeaming || 1.0 },
    chromaticAberration: { value: config.chromaticAberration || 0.05 },
    lensingStrength: { value: config.LENSING_STRENGTH || 1.0 }, // Ensure this is present
    focalLength: { value: config.FOCAL_LENGTH || 1.0 },         // Ensure this is present
  },
  vertexShader: `
    uniform vec3 uCameraPosition;
    uniform vec3 blackHolePosition;
    uniform float schwarzschildRadius;
    uniform float chromaticFactor;
    uniform float intensityFactor;
    uniform float deltaTime;
    uniform float relativisticBeaming;
    uniform float chromaticAberration;
    uniform float lensingStrength; // Added
    uniform float focalLength;      // Added

    const float PI = 3.14159265358979323846264;

    attribute float size;
    attribute vec3 customColor;
    attribute float lifetime;
    attribute float energy;
    attribute vec3 velocity;
    varying vec3 vColor;
    varying float vLifetime;

    // Doppler Effect Function
    vec3 applyDopplerShift(vec3 velocity, vec3 direction, vec3 color) {
        float speed = length(velocity);
        float dopplerFactor = sqrt((1.0 + speed) / (1.0 - speed));
        // Shift color based on Doppler factor
        return color * dopplerFactor;
    }

    // Helper function to rotate a point around an axis by an angle
    vec3 rotateAroundAxis(vec3 point, vec3 center, vec3 axis, float angle) {
        vec3 pos = point - center;
        float cosAngle = cos(angle);
        float sinAngle = sin(angle);
        return center + (cosAngle * pos) + (sinAngle * cross(axis, pos)) + ((1.0 - cosAngle) * dot(axis, pos) * axis);
    }

    // Enhanced Gravitational Lensing Function for Full 360-Degree Coverage
    vec3 applyGravitationalLensing(vec3 position) {
        vec3 toCamera = normalize(uCameraPosition - position);
        vec3 toBlackHole = normalize(blackHolePosition - position);
        vec3 displacement = position - blackHolePosition;
        float r = length(displacement);

        if (r > schwarzschildRadius) {
            // Calculate the impact parameter 'b'
            float impactParameter = length(cross(displacement, toCamera)) / length(toCamera);

            // Avoid division by zero
            impactParameter = max(impactParameter, schwarzschildRadius * 0.001);

            // Calculate the deflection angle 'alpha' using a precise formula
            // For relativistic lensing, use alpha ≈ (4 * G * M) / (c^2 * b)
            // Assuming normalized units where G = c = 1
            float alpha = (4.0 * schwarzschildRadius) / impactParameter;

            // Calculate the bending axis
            vec3 bendAxis = normalize(cross(toCamera, toBlackHole));
            if (length(bendAxis) < 0.001) {
                // Handle the case when vectors are parallel
                bendAxis = vec3(0.0, 1.0, 0.0);
            }

            // Apply lensing strength and focal length
            alpha *= lensingStrength;
            float focal = focalLength;

            // Rotate the position around the bend axis by the deflection angle scaled by lensing strength
            vec3 lensedPosition = rotateAroundAxis(position, blackHolePosition, bendAxis, alpha * focal);

            return lensedPosition;
        } else {
            return position;
        }
    }

    void main() {
        // Assign initial color and lifetime
        vColor = customColor;
        vLifetime = lifetime;

        // Assign a wavelength based on energy for chromatic effects
        float wavelength = mix(0.3, 0.7, clamp(energy / 2.0, 0.0, 1.0));

        // Calculate gravitational lensing effect
        vec3 lensedPosition = applyGravitationalLensing(position);

        vec4 mvPosition = modelViewMatrix * vec4(lensedPosition, 1.0);

        // Calculate Doppler Shift based on particle velocity
        vec3 direction = normalize(lensedPosition - blackHolePosition);
        vColor = applyDopplerShift(velocity, direction, customColor);

        // Apply chromatic aberration
        vec3 chromaticOffset = normalize(lensedPosition - uCameraPosition) * chromaticFactor * wavelength * chromaticAberration;
        mvPosition.xyz += chromaticOffset;

        // Modulate intensity based on deflection angle and relativistic beaming
        float distance = length(mvPosition.xyz);
        float deflectionIntensity = intensityFactor * (schwarzschildRadius / distance);
        float beaming = 1.0 + energy * 0.5 + deflectionIntensity * relativisticBeaming;

        // Apply time dilation effect
        float distanceToBlackHole = length(blackHolePosition - lensedPosition);
        float timeDilation = sqrt(1.0 - schwarzschildRadius / distanceToBlackHole);
        vLifetime *= timeDilation;

        // Adjust point size based on beaming and attenuation
        gl_PointSize = size * (300.0 / distance) * beaming;
        gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform sampler2D pointTexture;
    uniform float chromaticAberration;
    varying vec3 vColor;
    varying float vLifetime;

    void main() {
      // Sample the point texture for alpha
      float alpha = texture2D(pointTexture, gl_PointCoord.xy).a;

      // Combine with lifetime-based alpha
      alpha *= vLifetime / 5000.0;

      gl_FragColor = vec4(vColor, alpha);

      // Discard fragments with low alpha to improve performance
      if (gl_FragColor.a < 0.01) discard;
    }
  `,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  transparent: true,
  side: THREE.DoubleSide, // Ensure particles are visible from all angles
});




  // ======================
  // Create the Particle System
  // ======================
  const particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);

  // ======================
  // Helper Functions
  // ======================

  /**
   * Generates a simple circular texture for particles.
   * @returns {THREE.Texture} - The generated point texture.
   */
  function generatePointTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');

    // Draw a circle
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    context.closePath();

    // Create gradient for smooth edges
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fill();

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Generates a simple circular texture for trails.
   * @returns {THREE.Texture} - The generated trail texture.
   */
  function generateTrailTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');

    // Draw a circle
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    context.closePath();

    // Create gradient for smooth edges
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fill();

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Calculates a dipole magnetic field at a given position.
   * @param {THREE.Vector3} position - The position to calculate the magnetic field.
   * @returns {THREE.Vector3} - The magnetic field vector at the position.
   */
  function calculateDipoleField(position) {
    const dipoleMoment = config.BLACK_HOLE_SPIN.clone().multiplyScalar(config.MAGNETIC_FIELD_STRENGTH);
    const r = position.length();
    if (r === 0) return new THREE.Vector3(0, 0, 0); // Prevent division by zero
    const rHat = position.clone().normalize();
    const term1 = rHat.clone().multiplyScalar(3 * rHat.dot(dipoleMoment));
    const term2 = dipoleMoment.clone();
    const magneticField = term1.sub(term2).multiplyScalar(1 / Math.pow(r, 3));
    return magneticField;
  }

  /**
   * Updates the particle system each frame.
   * Applies gravitational and electromagnetic forces, synchrotron radiation,
   * and handles particle lifecycle and energy updates.
   * Also updates particle trails.
   * @param {number} delta - The time elapsed since the last frame (in seconds).
   */
  function updateParticles(delta) {
    const PARTICLE_COUNT = config.PARTICLE_COUNT; // Accessed dynamically
    const SCHWARZSCHILD_RADIUS = config.SCHWARZSCHILD_RADIUS; // Accessed dynamically

    const positionsArray = particleSystem.geometry.attributes.position.array;
    const velocitiesArray = particleSystem.geometry.attributes.velocity.array;
    const lifetimesArray = particleSystem.geometry.attributes.lifetime.array;
    const energiesArray = particleSystem.geometry.attributes.energy.array;
    const colorsArray = particleSystem.geometry.attributes.customColor.array;
    const sizesArray = particleSystem.geometry.attributes.size.array;

    const trailPositionsArray = trailGeometry.attributes.instanceStart.array;
    const trailSizesArray = trailGeometry.attributes.instanceSize.array;
    const trailColorsArray = trailGeometry.attributes.instanceColor.array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const index = i * 3;

      // Current Position Vector
      tempPosition.set(
        positionsArray[index],
        positionsArray[index + 1],
        positionsArray[index + 2]
      );

      // Current Velocity Vector
      tempVelocity.set(
        velocitiesArray[index],
        velocitiesArray[index + 1],
        velocitiesArray[index + 2]
      );

      // Calculate Distance from Black Hole
      const distance = tempPosition.length();

      // Apply General Relativistic Gravitational Acceleration
      if (distance > SCHWARZSCHILD_RADIUS) { // Adjusted distance check
        // Schwarzschild correction factor
        const denom = 1.0 - config.SCHWARZSCHILD_RADIUS / distance;
        const gamma = denom > 0 ? 1.0 / Math.sqrt(denom) : 0.0; // Safeguard against negative values

        const accelerationMagnitude = config.GRAVITATIONAL_CONSTANT / (distance * distance) * gamma;

        // Acceleration Vector (towards black hole)
        tempAcceleration.copy(tempPosition).normalize().multiplyScalar(-accelerationMagnitude);

        // Apply Electromagnetic Force (Lorentz Force: F = q(v × B))
        const magneticField = calculateDipoleField(tempPosition);
        const lorentzForce = tempVelocity.clone().cross(magneticField);

        // Apply Frame Dragging
        const frameDragging = config.BLACK_HOLE_SPIN.clone().cross(tempPosition).multiplyScalar(config.FRAME_DRAGGING_FACTOR);

        // Total Acceleration
        tempAcceleration.add(lorentzForce).add(frameDragging);

        // Apply Viscous Forces to keep particles in the accretion disk plane
        const diskNormal = config.BLACK_HOLE_SPIN.clone();
        const heightAboveDisk = tempPosition.dot(diskNormal);
        const dampingForce = diskNormal.clone().multiplyScalar(-heightAboveDisk * 0.1);
        tempAcceleration.add(dampingForce);

        // Apply Vertical Acceleration Near Event Horizon (if any)
        if (distance < config.LENSING_RADIUS) {
          const normalizedDistance = (config.LENSING_RADIUS - distance) / (config.LENSING_RADIUS - config.SCHWARZSCHILD_RADIUS);
          const verticalAccelerationMagnitude = normalizedDistance * config.VERTICAL_ACCELERATION_FACTOR;

          // Calculate vertical acceleration direction (away from disk plane)
          const verticalDirection = tempPosition.clone().normalize();
          tempAcceleration.add(verticalDirection.multiplyScalar(verticalAccelerationMagnitude));
        }

        // Relativistic Correction: Limit velocity to below the speed of light (c = 1 in normalized units)
        const speed = tempVelocity.length();
        if (speed > 0.99) {
          tempVelocity.multiplyScalar(0.99 / speed);
        }

        // Update Velocity and Position
        tempVelocity.add(tempAcceleration.clone().multiplyScalar(delta));
        tempPosition.add(tempVelocity.clone().multiplyScalar(delta));

        // Synchrotron Radiation: Energy loss proportional to acceleration squared and velocity
        const synchrotronLoss = config.SYNCHROTRON_RADIATION_FACTOR * tempAcceleration.lengthSq() * tempVelocity.length() * delta;
        energiesArray[i] = Math.max(energiesArray[i] - synchrotronLoss, 0.1);

        // Update Color and Size Based on Distance to Black Hole
        const proximityFactor = THREE.MathUtils.smoothstep(distance, config.SCHWARZSCHILD_RADIUS, config.LENSING_RADIUS);
        sizesArray[i] = config.BASE_SIZE * (1.0 + proximityFactor * config.SIZE_INCREASE_FACTOR);

        const energyFactor = THREE.MathUtils.clamp(energiesArray[i] / 2.0, 0, 1);
        const redshiftDenom = 1.0 - config.SCHWARZSCHILD_RADIUS / distance;
        const redshift = redshiftDenom > 0 ? Math.sqrt(redshiftDenom) : 0.0; // Safeguard against negative values

        const colorFactor = proximityFactor;
        const color = new THREE.Color();
        color.setHSL(0.05 + 0.15 * energyFactor * redshift + colorFactor * 0.1, 1.0, 0.5 + colorFactor * 0.5);
        colorsArray[index] = color.r;
        colorsArray[index + 1] = color.g;
        colorsArray[index + 2] = color.b;

        // Decrease Lifetime with Optimized Mechanics
        lifetimesArray[i] -= delta; // Changed from delta * 60 to delta for consistency

        // Update Attributes
        positionsArray[index] = tempPosition.x;
        positionsArray[index + 1] = tempPosition.y;
        positionsArray[index + 2] = tempPosition.z;

        velocitiesArray[index] = tempVelocity.x;
        velocitiesArray[index + 1] = tempVelocity.y;
        velocitiesArray[index + 2] = tempVelocity.z;
      } else {
        // Particle is too close to the black hole; decide to regenerate based on chance
        if (Math.random() < config.PARTICLE_REGEN_CHANCE) {
          resetParticle(i);
        }
        continue;
      }

      // Reset Particle if Lifetime Expired or Energy Too Low
      if (lifetimesArray[i] <= 0 || energiesArray[i] <= 0.1 || isNaN(tempPosition.x)) {
        resetParticle(i);
        continue;
      }

      // Update Trails
      updateTrails(i);
    }

    // Inform Three.js that attributes have been updated
    particleSystem.geometry.attributes.position.needsUpdate = true;
    particleSystem.geometry.attributes.velocity.needsUpdate = true;
    particleSystem.geometry.attributes.lifetime.needsUpdate = true;
    particleSystem.geometry.attributes.energy.needsUpdate = true;
    particleSystem.geometry.attributes.customColor.needsUpdate = true;
    particleSystem.geometry.attributes.size.needsUpdate = true;

    trailGeometry.attributes.instanceStart.needsUpdate = true;
    trailGeometry.attributes.instanceSize.needsUpdate = true;
    trailGeometry.attributes.instanceColor.needsUpdate = true;

    // Update time uniform for shaders
    material.uniforms.time.value += delta;
    trailMaterial.uniforms.time.value += delta;

    // Update uniforms that may change each frame
    material.uniforms.uCameraPosition.value.copy(camera.position);
    trailMaterial.uniforms.uCameraPosition.value.copy(camera.position);
  }

  /**
   * Resets a particle to a new random position and velocity within the accretion disk.
   * @param {number} i - The index of the particle to reset.
   */
  function resetParticle(i) {
    const index = i * 3;

    // Random Initial Position in Cylindrical Coordinates within the Accretion Disk
    const radius = THREE.MathUtils.randFloat(
      config.ACCRETION_DISK_INNER_RADIUS,
      config.ACCRETION_DISK_OUTER_RADIUS * (1 - Math.pow(Math.random(), 3))
    );
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const height = THREE.MathUtils.randFloat(-config.ACCRETION_DISK_HEIGHT / 2, config.ACCRETION_DISK_HEIGHT / 2);

    const x = radius * Math.cos(theta);
    const y = height; // Small height variation for a thin disk
    const z = radius * Math.sin(theta);

    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = z;

    // Calculate Initial Velocity for Circular Orbit in the Accretion Disk Plane
    const orbitalSpeed = Math.sqrt(config.GRAVITATIONAL_CONSTANT / radius) * config.PARTICLE_SPEED_MULTIPLIER;

    const vx = -orbitalSpeed * Math.sin(theta);
    const vy = 0; // Minimal vertical motion
    const vz = orbitalSpeed * Math.cos(theta);

    velocities[index] = vx;
    velocities[index + 1] = vy;
    velocities[index + 2] = vz;

    // Reassign Energy Based on New Velocity with Relativistic Correction
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const energy = speed * (1 + config.RELATIVISTIC_FACTOR);
    energies[i] = energy;

    // Reassign Colors Based on New Energy (Temperature Mapping)
    const energyFactor = THREE.MathUtils.clamp(energy / 2.0, 0, 1);
    const color = new THREE.Color();
    color.setHSL(0.1 + 0.5 * energyFactor, 1.0, 0.5); // From reddish to bluish based on energy
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;

    // Assign Random Size
    sizes[i] = THREE.MathUtils.randFloat(0.5, 2.0);

    // Assign Variable Lifetime
    lifetimes[i] = config.PARTICLE_LIFETIME_BASE + THREE.MathUtils.randFloatSpread(config.PARTICLE_LIFETIME_VARIANCE);

    // Initialize Trails with Current Position
    const TRAIL_LENGTH = config.TRAIL_LENGTH; // Accessed dynamically
    const trailBaseIndex = i * TRAIL_LENGTH * 3;
    const trailSizeBaseIndex = i * TRAIL_LENGTH;
    const trailColorBaseIndex = i * TRAIL_LENGTH * 3;

    for (let t = 0; t < TRAIL_LENGTH; t++) {
      trailPositions[trailBaseIndex + t * 3] = x;
      trailPositions[trailBaseIndex + t * 3 + 1] = y;
      trailPositions[trailBaseIndex + t * 3 + 2] = z;

      trailSizes[trailSizeBaseIndex + t] = sizes[i];

      trailColors[trailColorBaseIndex + t * 3] = color.r;
      trailColors[trailColorBaseIndex + t * 3 + 1] = color.g;
      trailColors[trailColorBaseIndex + t * 3 + 2] = color.b;
    }

    // Reset trail index
    trailCurrentIndex[i] = 0;
  }

  /**
   * Updates the trails for a specific particle using a circular buffer approach.
   * @param {number} i - The index of the particle to update trails for.
   */
  function updateTrails(i) {
    const TRAIL_LENGTH = config.TRAIL_LENGTH; // Accessed dynamically
    const trailIdx = trailCurrentIndex[i];
    const trailBaseIndex = i * TRAIL_LENGTH * 3 + trailIdx * 3;
    const trailSizeBaseIndex = i * TRAIL_LENGTH + trailIdx;
    const trailColorBaseIndex = i * TRAIL_LENGTH * 3 + trailIdx * 3;

    // Add current position to the trail
    trailPositions[trailBaseIndex] = positions[i * 3];
    trailPositions[trailBaseIndex + 1] = positions[i * 3 + 1];
    trailPositions[trailBaseIndex + 2] = positions[i * 3 + 2];

    // Update trail size based on current energy
    trailSizes[trailSizeBaseIndex] = sizes[i] * (energies[i] / 2.0);

    // Update trail color based on current energy
    trailColors[trailColorBaseIndex] = colors[i * 3];
    trailColors[trailColorBaseIndex + 1] = colors[i * 3 + 1];
    trailColors[trailColorBaseIndex + 2] = colors[i * 3 + 2];

    // Increment and wrap the trail index
    trailCurrentIndex[i] = (trailCurrentIndex[i] + 1) % TRAIL_LENGTH;
  }

  /**
   * Removes the particle system and trails from the scene and disposes of their resources.
   */
  function disposeParticleSystem() {
    geometry.dispose();
    material.dispose();
    scene.remove(particleSystem);

    trailGeometry.dispose();
    trailMaterial.dispose();
    scene.remove(trailSystem);
  }

  // ======================
  // Return the Update and Dispose Functions for Integration in the Main Loop
  // ======================
  return {
    update: updateParticles,
    dispose: disposeParticleSystem,
    particleSystem,
    trailSystem,
    material,
    trailMaterial,
  };
}
