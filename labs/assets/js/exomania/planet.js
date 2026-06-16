// File: assets/js/exomania/planet.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { createPlanetMaterial } from './materials/shaderMaterial.js';

export let planetsData = [];

// Load exoplanet data from JSON
export function loadExoplanetData() {
  return fetch('../exoplanet_data.json') // Ensure the correct path to your data file
    .then(response => response.json())
    .then(data => {
      planetsData = data;
      return data;
    })
    .catch(error => {
      console.error('Error loading exoplanet data:', error);
      return [];
    });
}

// Create planet mesh with enhanced shaders and detailed geometry
export function createPlanetMesh(planetData) {
  // Create an icosahedron geometry with increased subdivisions
  const radius = planetData.pl_rade ? planetData.pl_rade * 1 : 1.0;
  const subdivisions = 150; // Increase subdivisions for higher resolution
  const geometry = new THREE.IcosahedronGeometry(radius, subdivisions);

  // Create custom shader material based on planet conditions
  const material = createPlanetMaterial(planetData);

  // Create the planet mesh
  const planetMesh = new THREE.Mesh(geometry, material);
  planetMesh.castShadow = true;
  planetMesh.receiveShadow = true;

  // Optional: Add user-defined properties for further interactions
  planetMesh.userData = {
    name: planetData.pl_name,
    temperature: planetData.pl_eqt,
    hasAtmosphere: planetData.pl_hasatm,
  };

  return planetMesh;
}
