// assets/js/black_hole/main.js

/**
 * Black Hole Simulation Main Module
 * 
 * [Existing Documentation]
 */

import { CustomOrbitControls } from './custom_orbit_controls.js';
import { createSkybox } from './skybox.js';
import { createGravitationalLensing } from './gravitational_lensing.js';
import { createAccretionDisk } from './accretion_disk.js';
import { createParticleSystem } from './particle_system.js';
import { createEventHorizon } from './event_horizon.js';

document.addEventListener('DOMContentLoaded', () => {
  // ======================
  // Loading Screen Handling
  // ======================
  const loadingScreen = document.getElementById('loading-screen');

  // ======================
  // Scene Setup
  // ======================
  const scene = new THREE.Scene();

  // ======================
  // Camera Configuration
  // ======================
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000 // Increased far clipping plane for large scenes
  );
  camera.position.set(0, 5, 150); // Adjusted camera position for better view

  // ======================
  // Renderer Initialization
  // ======================
  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("animation"),
    antialias: true,
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 1);

  // ======================
  // Custom Orbit Controls
  // ======================
  const controls = new CustomOrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 10;
  controls.maxDistance = 1000; // Increased max distance for zooming out

  // ======================
  // Parent Object for Rotating Elements
  // ======================
  const parentObject = new THREE.Object3D();
  scene.add(parentObject);

  // ======================
  // Create Black Hole Core
  // ======================
  const blackHole = {
    mass: 1.989e30, // Mass of the sun in kg as placeholder
    schwarzschildRadius: (2 * 6.67430e-11 * 1.989e30) / Math.pow(299792458, 2), // Calculated Schwarzschild radius
    spinParameter: new THREE.Vector3(0, 1, 0), // Spin axis
    position: new THREE.Vector3(0, 0, 0),
  };

  const coreGeometry = new THREE.SphereGeometry(blackHole.schwarzschildRadius, 64, 64);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const blackHoleMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  parentObject.add(blackHoleMesh);

  // ======================
  // Procedurally Generated Skybox
  // ======================
  const updateSkybox = createSkybox(scene);

  // ======================
  // Gravitational Lensing
  // ======================
  const { update: updateLensing, material: lensingMaterial } = createGravitationalLensing(scene, camera);

  // ======================
  // Accretion Disk
  // ======================
  const updateAccretionDisk = createAccretionDisk(scene, camera);

  // ======================
  // Configuration Object for Particle System
  // ======================
  const particleConfig = {
    PARTICLE_COUNT: 100000,
    ACCRETION_DISK_OUTER_RADIUS: 160.0,
    ACCRETION_DISK_HEIGHT: 1.0,
    EVENT_HORIZON_RADIUS: 16.0,
    PARTICLE_SPEED_MULTIPLIER: 2.9,
    GRAVITATIONAL_CONSTANT: 0.1,
    PARTICLE_LIFETIME_BASE: 50000,
    PARTICLE_LIFETIME_VARIANCE: 2000,
    MAGNETIC_FIELD_STRENGTH: 0.5,
    SYNCHROTRON_RADIATION_FACTOR: 0.05,
    TRAIL_LENGTH: 50,
    RELATIVISTIC_FACTOR: 0.1,
    VERTICAL_ACCELERATION_FACTOR: 0.0,
    SIZE_INCREASE_FACTOR: 2.0,
    BASE_SIZE: 1.0,
    INWARD_ACCELERATION_FACTOR: 0.05,
    BLACK_HOLE_SPIN: new THREE.Vector3(0, 1, 0).normalize(),
    FRAME_DRAGGING_FACTOR: 0.1,
    LENSING_FACTOR: 40.0,
    LENSING_RADIUS: 20.0,
    SCHWARZSCHILD_RADIUS: 8.0, // EVENT_HORIZON_RADIUS * 2.0
    ACCRETION_DISK_INNER_RADIUS: 8.0 * 1.1, // SCHWARZSCHILD_RADIUS * 1.1
    OUTER_LENSING_LIMIT: 120.0 * 1.1, // ACCRETION_DISK_OUTER_RADIUS * 1.1
    PARTICLE_REGEN_CHANCE: 0.05,
  };

  // ======================
  // Enhanced Particle System
  // ======================
  const particleSystem = createParticleSystem(scene, blackHole, camera, particleConfig);

  // ======================
  // Event Horizon Representation
  // ======================
  const eventHorizon = createEventHorizon(scene, blackHole, camera);

  // ======================
  // Control Variables for Animation
  // ======================
  let isAnimating = true;
  let scale = 1;
  let speed = 0.1; // Reduced initial speed for slower rotation

  // ======================
  // User Interface Elements and Event Listeners
  // ======================
  const toggleAnimationBtn = document.getElementById("toggleAnimation");
  toggleAnimationBtn.addEventListener("click", () => {
    isAnimating = !isAnimating;
    toggleAnimationBtn.textContent = isAnimating ? "Stop Animation" : "Start Animation";
    toggleAnimationBtn.setAttribute('aria-pressed', isAnimating);
  });

  const rangeSize = document.getElementById("rangeSize");
  const handleSizeChange = debounce((e) => {
    scale = e.target.value / 50;
  }, 100);
  rangeSize.addEventListener("input", handleSizeChange);

  const rangeSpeed = document.getElementById("rangeSpeed");
  const handleSpeedChange = debounce((e) => {
    speed = e.target.value * 0.1; // Adjusted multiplier for finer control
  }, 100);
  rangeSpeed.addEventListener("input", handleSpeedChange);

  // ======================
  // Toggle Controls Visibility on Smaller Screens
  // ======================
  const toggleBtn = document.querySelector('.toggle-btn');
  const controlsDiv = document.querySelector('.controls');

  toggleBtn.addEventListener("click", () => {
    controlsDiv.classList.toggle('active');
    toggleBtn.textContent = controlsDiv.classList.contains('active') ? 'Show Controls' : 'Hide Controls';
  });

  // ======================
  // Initialize dat.GUI
  // ======================
  const gui = new dat.GUI();
  
  // Create GUI Folders and Controls
  const particleFolder = gui.addFolder('Particle System');
  particleFolder.add(particleConfig, 'GRAVITATIONAL_CONSTANT', 0.01, 1.0).name('Gravitational Const').onChange((value) => {
    particleConfig.GRAVITATIONAL_CONSTANT = value;
  });
  particleFolder.add(particleConfig, 'PARTICLE_SPEED_MULTIPLIER', 0.1, 5.0).name('Speed Multiplier').onChange((value) => {
    particleConfig.PARTICLE_SPEED_MULTIPLIER = value;
  });
  particleFolder.add(particleConfig, 'MAGNETIC_FIELD_STRENGTH', 0.0, 1.0).name('Magnetic Field').onChange((value) => {
    particleConfig.MAGNETIC_FIELD_STRENGTH = value;
  });
  particleFolder.add(particleConfig, 'SYNCHROTRON_RADIATION_FACTOR', 0.0, 0.1).name('Synchrotron Radiation').onChange((value) => {
    particleConfig.SYNCHROTRON_RADIATION_FACTOR = value;
  });
  particleFolder.add(particleConfig, 'RELATIVISTIC_FACTOR', 0.0, 1.0).name('Relativistic Factor').onChange((value) => {
    particleConfig.RELATIVISTIC_FACTOR = value;
  });
  particleFolder.add(particleConfig, 'VERTICAL_ACCELERATION_FACTOR', 0.0, 1.0).name('Vertical Acceleration').onChange((value) => {
    particleConfig.VERTICAL_ACCELERATION_FACTOR = value;
  });
  particleFolder.add(particleConfig, 'SIZE_INCREASE_FACTOR', 0.0, 5.0).name('Size Increase').onChange((value) => {
    particleConfig.SIZE_INCREASE_FACTOR = value;
  });
  particleFolder.add(particleConfig, 'BASE_SIZE', 0.5, 5.0).name('Base Size').onChange((value) => {
    particleConfig.BASE_SIZE = value;
  });
  particleFolder.add(particleConfig, 'PARTICLE_REGEN_CHANCE', 0.0, 1.0).name('Regen Chance').onChange((value) => {
    particleConfig.PARTICLE_REGEN_CHANCE = value;
  });
  particleFolder.add(particleConfig, 'ACCRETION_DISK_OUTER_RADIUS', 50.0, 200.0).name('Accretion Disk Outer Radius').onChange((value) => {
    particleConfig.ACCRETION_DISK_OUTER_RADIUS = value;
    // Optionally, reinitialize or adjust accretion disk based on new value
  });
  particleFolder.add(particleConfig, 'ACCRETION_DISK_HEIGHT', 0.1, 5.0).name('Accretion Disk Height').onChange((value) => {
    particleConfig.ACCRETION_DISK_HEIGHT = value;
    // Optionally, reinitialize or adjust accretion disk based on new value
  });
  particleFolder.add(particleConfig, 'LENSING_FACTOR', 10.0, 100.0).name('Lensing Factor').onChange((value) => {
    particleConfig.LENSING_FACTOR = value;
    // Optionally, update lensing material based on new value
  });
  particleFolder.add(particleConfig, 'LENSING_RADIUS', 10.0, 50.0).name('Lensing Radius').onChange((value) => {
    particleConfig.LENSING_RADIUS = value;
    // Optionally, update lensing material based on new value
  });
  particleFolder.add(particleConfig, 'TRAIL_LENGTH', 10, 100).name('Trail Length').onChange((value) => {
    particleConfig.TRAIL_LENGTH = value;
    // Optionally, reinitialize trails based on new value
  });
  particleFolder.add(particleConfig, 'FRAME_DRAGGING_FACTOR', 0.0, 1.0).name('Frame Dragging').onChange((value) => {
    particleConfig.FRAME_DRAGGING_FACTOR = value;
    // Optionally, update frame dragging based on new value
  });
  particleFolder.open();

  // ======================
  // Window Resize Handler
  // ======================
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onWindowResize, false);

  // ======================
  // Animation Loop Setup
  // ======================
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (isAnimating) {
      parentObject.rotation.x += speed * delta;
      parentObject.rotation.y += speed * delta;
    }

    parentObject.scale.set(scale, scale, scale);

    // Update all visual components
    updateSkybox(delta);
    updateLensing(delta);
    updateAccretionDisk(delta);

    // Update uniforms for Particle System
    particleSystem.material.uniforms.uCameraPosition.value.copy(camera.position);
    particleSystem.material.uniforms.blackHolePosition.value.copy(blackHole.position);
    particleSystem.trailMaterial.uniforms.uCameraPosition.value.copy(camera.position);
    particleSystem.trailMaterial.uniforms.blackHolePosition.value.copy(blackHole.position);

    // Update Particle System with current config
    particleSystem.update(delta);

    // Update Event Horizon
    eventHorizon.update(delta);

    // Update Controls
    controls.update();

    // Render the Scene
    renderer.render(scene, camera);
  }

  // Start the animation loop after initialization
  animate();

  // ======================
  // Cleanup Function (Optional)
  // ======================
  function disposeSimulation() {
    particleSystem.dispose();
    eventHorizon.mesh.geometry.dispose();
    eventHorizon.mesh.material.dispose();
    // Dispose of other components as needed
  }

  window.disposeSimulation = disposeSimulation;

  // ======================
  // Remove Loading Screen
  // ======================
  // Simulate initialization delay for demonstration
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 3000); // Adjust as needed based on actual initialization time
});

/**
 * Debounce Function to Limit the Rate at Which a Function Can Fire.
 * Useful for improving performance on high-frequency events like 'input'.
 */
function debounce(func, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}
