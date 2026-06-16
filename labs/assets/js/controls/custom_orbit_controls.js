// custom_orbit_controls.js

/**
 * Simplified Custom Orbit Controls for Black Hole Simulation
 * 
 * This class provides basic camera controls, allowing users to navigate
 * around a black hole with smooth rotations and zooming.
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
    this.zoomSpeed = options.zoomSpeed !== undefined ? options.zoomSpeed : 0.3; // Further reduced from 0.5
    this.minDistance = options.minDistance || 5; // Increased to prevent too close zoom
    this.maxDistance = options.maxDistance !== undefined ? options.maxDistance : 500; // Adjusted as needed
    this.dampingFactor = options.dampingFactor || 0.1; // For smooth damping

    // Internal State
    this.spherical = new THREE.Spherical();
    this.targetSpherical = new THREE.Spherical();

    // Rotation Inertia
    this.rotationVelocity = new THREE.Vector2(0, 0);
    this.inertiaDamping = options.inertiaDamping || 0.98; // Increased for smoother decay

    // Zoom Inertia
    this.zoomVelocity = 0;
    this.zoomDamping = options.zoomDamping || 0.90; // Increased damping

    // Input States
    this.mouse = {
      left: { isDown: false, x: 0, y: 0 },
    };

    // Black Hole Parameters
    this.target = new THREE.Vector3(0, 0, 0);

    // Initialize Spherical Coordinates based on Camera Position
    this.updateSpherical();

    // Bind Event Handlers
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);

    // Add Event Listeners
    this.domElement.addEventListener('mousedown', this.onMouseDown, false);
    this.domElement.addEventListener('mousemove', this.onMouseMove, false);
    this.domElement.addEventListener('mouseup', this.onMouseUp, false);
    this.domElement.addEventListener('wheel', this.onMouseWheel, false);
    this.domElement.addEventListener('contextmenu', this.onContextMenu, false);

    // Bind the update method for external calling
    this.update = this.update.bind(this);
  }

  /**
   * Initialize spherical coordinates based on current camera position
   */
  updateSpherical() {
    const offset = new THREE.Vector3().copy(this.camera.position).sub(this.target);
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
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 : -1;
    this.zoom(delta);
  }

  /**
   * Event handler for context menu (prevent default)
   */
  onContextMenu(event) {
    event.preventDefault();
  }

  /**
   * Rotate the camera based on mouse movement
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
   * Prevent camera from entering the defined distance bounds
   */
  constrainCameraPosition() {
    const distance = this.targetSpherical.radius;
    if (distance < this.minDistance) {
      this.targetSpherical.radius = this.minDistance;
      this.spherical.radius = this.minDistance;
      this.zoomVelocity = 0;
    }
    if (distance > this.maxDistance) {
      this.targetSpherical.radius = this.maxDistance;
      this.spherical.radius = this.maxDistance;
      this.zoomVelocity = 0;
    }
  }

  /**
   * Update the camera position
   */
  update() {
    if (!this.enabled) return;

    // Interpolate spherical coordinates towards target
    this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * (1 - this.dampingFactor);
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * (1 - this.dampingFactor);
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * (1 - this.dampingFactor);

    // Convert spherical coordinates back to Cartesian coordinates
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(offset).add(this.target);

    // Ensure the camera is always looking at the target (cube center)
    this.camera.lookAt(this.target);

    // Apply damping and inertia
    this.applyDamping();

    // Constrain camera position
    this.constrainCameraPosition();
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
  }

  /**
   * Zoom the camera in or out
   */
  zoom(delta) {
    const factor = Math.pow(0.95, this.zoomSpeed);
    if (delta > 0) {
      this.targetSpherical.radius /= factor;
    } else {
      this.targetSpherical.radius *= factor;
    }

    this.targetSpherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetSpherical.radius));
  }

  /**
   * Set the target position for the camera to look at
   */
  setTarget(x, y, z) {
    this.target.set(x, y, z);
  }
}