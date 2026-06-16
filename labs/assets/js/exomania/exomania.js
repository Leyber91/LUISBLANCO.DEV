// File: assets/js/exomania/exomania.js

/**
 * Exomania Main Application Script
 * This script initializes the application, loads exoplanet data,
 * sets up the scene, handles user interactions, and manages the animation loop.
 * 
 * Dependencies:
 * - THREE.js library
 * - Exomania modules: scene.js, controls.js, planet.js, ui.js, lighting.js, atmosphere.js, clouds.js, utils.js, spaceshipWindow.js
 */

// Import necessary modules and functions
import { setupScene } from './scene.js';
import { setupControls } from './controls.js';
import { loadExoplanetData, createPlanetMesh } from './planet.js';
import { setupUI, generatePlanetCarousel, updatePlanetInfo } from './ui.js';
import { setupLighting, updateLighting, updateLightingElements } from './lighting.js';
import { createAtmosphere } from './atmosphere.js';
import { createClouds } from './clouds.js';
import { calculateCameraDistance, getPlanetType } from './utils.js';
import { createSpaceshipWindow } from './spaceshipWindow.js';

// Global variables
let scene, camera, renderer;         // Three.js essentials
let planetMesh = null;              // Current planet mesh
let cloudMesh = null;               // Cloud mesh (if applicable)
let lighting = {};                  // Lighting elements
let controls = null;                // Custom controls
let planetDataArray = [];           // Array of exoplanet data
let currentPlanetData = null;       // Data of the currently displayed planet
let loadingOverlay = null;          // Loading overlay element
let lastFrameTime = performance.now(); // Last frame time for deltaTime calculation

/**
 * Initialize the Exomania application
 */
function init() {
    // Show the loading overlay
    showLoading(true);

    // Set up the Three.js scene, camera, and renderer
    const sceneSetup = setupScene();
    scene = sceneSetup.scene;
    camera = sceneSetup.camera;
    renderer = sceneSetup.renderer;

    // Position the camera further away initially
    camera.position.set(0, 0, 10);

    // Set up the lighting in the scene with default star data
    lighting = setupLighting(scene, { st_teff: 5778, pl_masse: 1.0, pl_rade: 1.0 }); // Default star data

    // Load exoplanet data from JSON file
    loadExoplanetData().then(data => {
        planetDataArray = data;

        // Set up the user interface components
        setupUI(loadPlanet, data);

        // Generate the initial planet carousel with random planets
        generatePlanetCarousel(data, loadPlanet);

        // Hide the loading overlay
        showLoading(false);
    }).catch(error => {
        console.error('Error loading exoplanet data:', error);
        showLoading(false);
        displayErrorMessage('Failed to load exoplanet data. Please try again later.');
    });

    // Start the animation loop
    animate();
}

/**
 * Load and display the selected planet
 * @param {object} planetData - Data of the planet to load
 */
function loadPlanet(planetData) {
    // Show the loading overlay
    showLoading(true);

    // Remove the existing planet mesh from the scene
    if (planetMesh) {
        scene.remove(planetMesh);
        disposeHierarchy(planetMesh);
        planetMesh = null;
    }

    // Remove existing cloud mesh if any
    if (cloudMesh) {
        scene.remove(cloudMesh);
        disposeHierarchy(cloudMesh);
        cloudMesh = null;
    }

    // Create a new planet mesh based on the selected planet data
    planetMesh = createPlanetMesh(planetData);

    if (!planetMesh) {
        console.error('Failed to create planet mesh.');
        showLoading(false);
        displayErrorMessage('Failed to create the selected planet.');
        return;
    }

    // Add the planet mesh to the scene
    scene.add(planetMesh);

    // Update the current planet data
    currentPlanetData = planetData;

    // Update the planet information panel
    updatePlanetInfo(planetData);

    // Calculate appropriate camera distance based on planet size
    const cameraDistance = calculateCameraDistance(planetData);

    // Position the camera further away
    camera.position.set(0, 0, cameraDistance * 10);
    camera.lookAt(planetMesh.position);

    // Update lighting based on the host star's properties
    updateLighting(lighting, planetData);

    // Add atmosphere effects if the planet has an atmosphere
    if (hasAtmosphere(planetData)) {
        createAtmosphere(planetMesh, planetData);
    }

    // Add cloud layer if applicable
    if (hasClouds(planetData)) {
        cloudMesh = createClouds(planetMesh, planetData);
        if (cloudMesh) {
            scene.add(cloudMesh);
        } else {
            console.warn('Cloud mesh was not created due to previous errors.');
        }
    }

    // Set up controls for user interaction
    controls = setupControls(camera, renderer.domElement, planetMesh);

    // Hide the loading overlay
    showLoading(false);
}

/**
 * Check if the planet has an atmosphere
 * @param {object} planetData - Data of the planet
 * @returns {boolean} True if the planet has an atmosphere
 */
function hasAtmosphere(planetData) {
    // Use the utility function from utils.js
    return planetData && planetData.pl_hasatm === 'Y';
}

/**
 * Check if the planet has clouds
 * @param {object} planetData - Data of the planet
 * @returns {boolean} True if the planet has clouds
 */
function hasClouds(planetData) {
    // Simple heuristic based on planet type or properties
    const planetType = getPlanetType(planetData);
    return planetType === 0 || planetType === 2; // Rocky or icy planets
}
/**
 * Animation loop
 */
function animate() {
  requestAnimationFrame(animate);

  // Calculate deltaTime
  const currentTime = performance.now();
  const deltaTime = (currentTime - lastFrameTime) / 1000; // Convert to seconds
  lastFrameTime = currentTime;

  // Rotate the planet mesh slowly
  if (planetMesh) {
      planetMesh.rotation.y += 0.001 * deltaTime; // Adjust rotation speed as desired

      // Update any animations associated with the planet mesh
      if (planetMesh.userData.update && typeof planetMesh.userData.update === 'function') {
          planetMesh.userData.update(deltaTime, camera); // Pass 'camera' parameter
      }
  }

  // Update cloud mesh rotation if applicable
  if (cloudMesh) {
      cloudMesh.rotation.y += 0.0015 * deltaTime; // Slightly faster than the planet for effect

      // Update any animations associated with the cloud mesh
      if (cloudMesh.userData.update && typeof cloudMesh.userData.update === 'function') {
          cloudMesh.userData.update(deltaTime, camera); // Pass 'camera' parameter
      }
  }

  // Update time-dependent uniforms in the shader material
  if (planetMesh && planetMesh.material.uniforms && planetMesh.material.uniforms.time) {
      planetMesh.material.uniforms.time.value += deltaTime;
  }
  // Update camera position in shader for accurate lighting
  if (planetMesh && planetMesh.material.uniforms && planetMesh.material.uniforms.cameraPosition) {
      planetMesh.material.uniforms.cameraPosition.value.copy(camera.position);
  }

  // Update lighting elements animations
  if (lighting) {
      // Increment the time uniform for the corona
      if (lighting.corona && lighting.corona.material.uniforms.time) {
          lighting.corona.material.uniforms.time.value += deltaTime;
      }

      // Update solar flares animations
      if (lighting.solarFlares) {
          lighting.solarFlares.children.forEach(flare => {
              // Increment time if flare has its own time uniform
              if (flare.material.uniforms && flare.material.uniforms.time) {
                  flare.material.uniforms.time.value += deltaTime;
              }

              // Update scale based on pulsating amplitude and speed
              const scaleFactor = 1 + flare.userData.pulsateAmplitude * Math.sin(lighting.corona.material.uniforms.time.value * flare.userData.pulsateSpeed);
              flare.scale.set(flare.userData.baseScale * scaleFactor, flare.userData.baseScale * scaleFactor, 1);
          });
      }

      // Update CMEs
      if (lighting.cmEs && lighting.cmEs.userData.update) {
          lighting.cmEs.userData.update(deltaTime);
      }

      // Update lens flare positions if needed (e.g., camera movement)
      if (lighting.lensFlare) {
          // Optionally, animate lens flare flicker or movement
      }
  }

  

  // Render the scene
  renderer.render(scene, camera);
}



/**
 * Show or hide the loading overlay
 * @param {boolean} isLoading - True to show the overlay, false to hide
 */
function showLoading(isLoading) {
    if (!loadingOverlay) {
        loadingOverlay = document.getElementById('loading-overlay');
    }
    if (loadingOverlay) {
        loadingOverlay.style.display = isLoading ? 'flex' : 'none';
    }
}

/**
 * Dispose of a mesh and its children to free up memory
 * @param {THREE.Object3D} node - The root node to dispose
 */
function disposeHierarchy(node) {
    node.traverse(child => {
        if (child.geometry) {
            child.geometry.dispose();
        }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
            } else {
                child.material.dispose();
            }
        }
        if (child.texture) {
            child.texture.dispose();
        }
    });
}

/**
 * Display an error message to the user
 * @param {string} message - The error message to display
 */
function displayErrorMessage(message) {
    const errorMessageElement = document.createElement('div');
    errorMessageElement.classList.add('error-message');
    errorMessageElement.textContent = message;
    document.body.appendChild(errorMessageElement);
}

// Initialize the application when the page is loaded
window.addEventListener('DOMContentLoaded', init);
