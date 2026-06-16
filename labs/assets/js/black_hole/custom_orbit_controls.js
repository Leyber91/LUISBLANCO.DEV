// custom_orbit_controls.js

/**
 * Enhanced Custom Orbit Controls for Black Hole Simulation
 * 
 * This class provides advanced camera controls, allowing users to navigate
 * around a black hole and its accretion disk with smooth rotations, zooming,
 * and realistic effects like gravitational lensing and camera shake near the event horizon.
 * 
 * Dependencies:
 * - THREE.js (assumed to be included globally via HTML)
 */

export class CustomOrbitControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;

    // Configuration Parameters with Defaults
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.rotateSpeed = options.rotateSpeed || 0.005;
    this.zoomSpeed = options.zoomSpeed || 1.0;
    this.minDistance = options.minDistance || 5;
    this.maxDistance = options.maxDistance || 100;
    this.dampingFactor = options.dampingFactor || 0.1; // For smooth damping

    // Camera Shake Parameters
    this.shakeEnabled = options.shakeEnabled !== undefined ? options.shakeEnabled : true;
    this.shakeIntensityMax = options.shakeIntensityMax || 0.05;
    this.shakeDecay = options.shakeDecay || 0.02;
    this.shakeOffset = new THREE.Vector3();

    // Internal State
    this.spherical = new THREE.Spherical();
    this.targetSpherical = new THREE.Spherical();

    // Rotation Inertia
    this.rotationVelocity = new THREE.Vector2(0, 0);
    this.inertiaDamping = options.inertiaDamping || 0.95;

    // Zoom Inertia
    this.zoomVelocity = 0;
    this.zoomDamping = options.zoomDamping || 0.85;

    // Mouse State
    this.mouse = {
      left: { isDown: false, x: 0, y: 0 },
    };

    // Touch State
    this.touch = {
      isTouching: false,
      touchPoints: [],
      initialPinchDistance: 0,
    };

    // Black Hole Parameters
    this.blackHoleRadius = options.blackHoleRadius || 1;
    this.eventHorizonRadius = options.eventHorizonRadius || 2.5 * this.blackHoleRadius;
    this.accretionDiskInnerRadius = options.accretionDiskInnerRadius || 3 * this.blackHoleRadius;
    this.accretionDiskOuterRadius = options.accretionDiskOuterRadius || 10 * this.blackHoleRadius;

    // Initialize Spherical Coordinates based on Camera Position
    this.updateSpherical();

    // Bind Event Handlers
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);

    // Add Event Listeners
    this.domElement.addEventListener('mousedown', this.onMouseDown, false);
    this.domElement.addEventListener('mousemove', this.onMouseMove, false);
    this.domElement.addEventListener('mouseup', this.onMouseUp, false);
    this.domElement.addEventListener('wheel', this.onMouseWheel, false);
    this.domElement.addEventListener('contextmenu', this.onContextMenu, false);

    // Touch Events for Mobile
    this.domElement.addEventListener('touchstart', this.onTouchStart, false);
    this.domElement.addEventListener('touchmove', this.onTouchMove, false);
    this.domElement.addEventListener('touchend', this.onTouchEnd, false);
    this.domElement.addEventListener('touchcancel', this.onTouchEnd, false);

    // Bind the update method for external calling
    this.update = this.update.bind(this);
  }

  /**
   * Initialize spherical coordinates based on current camera position
   */
  updateSpherical() {
    const target = new THREE.Vector3(0, 0, 0); // Assuming black hole is at origin
    const offset = new THREE.Vector3().copy(this.camera.position).sub(target);
    this.spherical.setFromVector3(offset);
    this.targetSpherical.copy(this.spherical);
  }

  /**
   * Event handler for mouse down
   */
  onMouseDown(event) {
    if (!this.enabled) return;
    if (event.button === 0) { // Left button
      this.mouse.left.isDown = true;
      this.mouse.left.x = event.clientX;
      this.mouse.left.y = event.clientY;
    }
  }

  /**
   * Event handler for mouse move
   */
  onMouseMove(event) {
    if (!this.enabled) return;
    if (this.mouse.left.isDown) {
      const deltaX = event.clientX - this.mouse.left.x;
      const deltaY = event.clientY - this.mouse.left.y;

      this.mouse.left.x = event.clientX;
      this.mouse.left.y = event.clientY;

      // Update rotation velocity for inertia
      this.rotationVelocity.x += deltaX * this.rotateSpeed;
      this.rotationVelocity.y += deltaY * this.rotateSpeed;

      this.rotateCamera(deltaX, deltaY);
    }
  }

  /**
   * Event handler for mouse up
   */
  onMouseUp(event) {
    if (!this.enabled) return;
    if (event.button === 0) { // Left button
      this.mouse.left.isDown = false;
    }
  }

  /**
   * Event handler for mouse wheel (zoom)
   */
  onMouseWheel(event) {
    if (!this.enabled) return;
    event.preventDefault(); // Prevent page scroll
    const delta = (event.deltaY > 0) ? 1 : -1;
    this.zoomVelocity += delta * this.zoomSpeed * 0.1;
  }

  /**
   * Event handler for context menu (prevent default)
   */
  onContextMenu(event) {
    event.preventDefault();
  }

  /**
   * Event handler for touch start
   */
  onTouchStart(event) {
    if (!this.enabled) return;
    if (event.touches.length === 1) {
      // Single touch - rotate
      this.mouse.left.isDown = true;
      this.mouse.left.x = event.touches[0].pageX;
      this.mouse.left.y = event.touches[0].pageY;
    } else if (event.touches.length === 2) {
      // Two fingers - zoom
      this.touch.isTouching = true;
      this.touch.touchPoints = [...event.touches];
      this.touch.initialPinchDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
    }
  }

  /**
   * Event handler for touch move
   */
  onTouchMove(event) {
    if (!this.enabled) return;
    if (event.touches.length === 1 && this.mouse.left.isDown) {
      // Single touch - rotate
      const touch = event.touches[0];
      const deltaX = touch.pageX - this.mouse.left.x;
      const deltaY = touch.pageY - this.mouse.left.y;

      this.mouse.left.x = touch.pageX;
      this.mouse.left.y = touch.pageY;

      // Update rotation velocity for inertia
      this.rotationVelocity.x += deltaX * this.rotateSpeed;
      this.rotationVelocity.y += deltaY * this.rotateSpeed;

      this.rotateCamera(deltaX, deltaY);
    } else if (event.touches.length === 2 && this.touch.isTouching) {
      // Two fingers - zoom
      const currentPinchDistance = this.getTouchDistance(event.touches[0], event.touches[1]);
      const distanceDelta = currentPinchDistance - this.touch.initialPinchDistance;
      this.touch.initialPinchDistance = currentPinchDistance;

      this.zoomVelocity += distanceDelta * this.zoomSpeed * 0.005;
    }
  }

  /**
   * Event handler for touch end/cancel
   */
  onTouchEnd(event) {
    if (!this.enabled) return;
    if (event.touches.length < 1) {
      this.mouse.left.isDown = false;
    }
    if (event.touches.length < 2) {
      this.touch.isTouching = false;
    }
  }

  /**
   * Calculate distance between two touch points
   */
  getTouchDistance(touch1, touch2) {
    const dx = touch2.pageX - touch1.pageX;
    const dy = touch2.pageY - touch1.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Rotate the camera based on mouse/touch movement
   */
  rotateCamera(deltaX, deltaY) {
    // Update target spherical coordinates
    this.targetSpherical.theta -= deltaX * this.rotateSpeed;
    this.targetSpherical.phi -= deltaY * this.rotateSpeed;

    // Clamp phi to prevent the camera from flipping
    const EPS = 0.000001;
    this.targetSpherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, this.targetSpherical.phi));
  }

  /**
   * Apply damping and inertia to rotation and zoom
   */
  applyDamping() {
    // Damping for rotation inertia
    this.rotationVelocity.multiplyScalar(this.inertiaDamping);
    this.targetSpherical.theta -= this.rotationVelocity.x;
    this.targetSpherical.phi -= this.rotationVelocity.y;

    // Clamp phi again
    const EPS = 0.000001;
    this.targetSpherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, this.targetSpherical.phi));

    // Damping for zoom inertia
    this.zoomVelocity *= this.zoomDamping;
    this.targetSpherical.radius += this.zoomVelocity;

    // Clamp radius
    this.targetSpherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetSpherical.radius));
  }

  /**
   * Apply gravitational lensing effect by adjusting camera FOV
   */
  applyGravitationalLensing() {
    const distanceToBlackHole = this.camera.position.length();
    const lensStrength = THREE.MathUtils.clamp(1 - distanceToBlackHole / (5 * this.eventHorizonRadius), 0, 1);

    // Smoothly interpolate FOV based on lensStrength
    const baseFov = 75;
    const maxFov = 120;
    const targetFov = THREE.MathUtils.lerp(baseFov, maxFov, lensStrength);
    this.camera.fov += (targetFov - this.camera.fov) * 0.05; // Smooth transition
    this.camera.updateProjectionMatrix();
  }

  /**
   * Apply camera shake effect when near the event horizon
   * Utilizes Perlin noise for smooth, natural shake
   */
  applyCameraShake(delta) {
    if (!this.shakeEnabled) return;

    const distanceToBlackHole = this.camera.position.length();
    if (distanceToBlackHole < 3 * this.eventHorizonRadius) {
      // Calculate proximity factor
      const proximity = 1 - distanceToBlackHole / (3 * this.eventHorizonRadius);
      const currentShakeIntensity = THREE.MathUtils.lerp(this.shakeOffset.length(), this.shakeIntensityMax * proximity, this.shakeDecay);

      // Apply Perlin noise based shake
      const noiseScale = 10;
      const time = performance.now() / 1000;
      const shakeX = (Math.sin(time * noiseScale) * currentShakeIntensity);
      const shakeY = (Math.cos(time * noiseScale) * currentShakeIntensity);
      const shakeZ = (Math.sin(time * noiseScale * 0.5) * currentShakeIntensity);

      this.shakeOffset.set(shakeX, shakeY, shakeZ);
      this.camera.position.add(this.shakeOffset);
    } else {
      // Gradually reduce shake
      this.shakeOffset.multiplyScalar(1 - this.shakeDecay);
    }
  }

  /**
   * Prevent camera from entering the event horizon or accretion disk
   */
  constrainCameraPosition() {
    const distance = this.targetSpherical.radius;
    if (distance < this.accretionDiskInnerRadius) {
      this.targetSpherical.radius = this.accretionDiskInnerRadius;
      this.spherical.radius = this.accretionDiskInnerRadius;
      this.zoomVelocity = 0;
    }
  }

  /**
   * Update the camera position and other effects
   */
  update() {
    if (!this.enabled) return;

    // Interpolate spherical coordinates towards target
    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * (1 - this.dampingFactor);
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * (1 - this.dampingFactor);
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * (1 - this.dampingFactor);

    // Apply damping and inertia
    this.applyDamping();

    // Constrain camera position
    this.constrainCameraPosition();

    // Convert spherical coordinates back to Cartesian coordinates
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(offset);

    // Ensure the camera is always looking at the black hole center
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    // Apply gravitational lensing effect
    this.applyGravitationalLensing();

    // Apply camera shake if necessary
    this.applyCameraShake();
  }

  /**
   * Dispose the controls and remove event listeners
   */
  dispose() {
    this.domElement.removeEventListener('mousedown', this.onMouseDown, false);
    this.domElement.removeEventListener('mousemove', this.onMouseMove, false);
    this.domElement.removeEventListener('mouseup', this.onMouseUp, false);
    this.domElement.removeEventListener('wheel', this.onMouseWheel, false);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu, false);

    this.domElement.removeEventListener('touchstart', this.onTouchStart, false);
    this.domElement.removeEventListener('touchmove', this.onTouchMove, false);
    this.domElement.removeEventListener('touchend', this.onTouchEnd, false);
    this.domElement.removeEventListener('touchcancel', this.onTouchEnd, false);
  }
}
