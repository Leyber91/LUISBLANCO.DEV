import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { calculateGravity, calculateDensity, getPlanetType } from '../utils.js';
import { vertexShader, fragmentShader } from './shaderChunks.js';

export function createPlanetMaterial(planetData) {
    // Helper function to calculate modulo (GLSL's mod function works differently)
    const mod = (n, m) => ((n % m) + m) % m;
  
    // Determine planet type
    const planetType = getPlanetType(planetData); // 0: rocky, 1: gas giant, 2: ice, 3: lava
  
    // Calculate gravity and density (optional, can be used for further adjustments)
    const gravity = calculateGravity(planetData);
    const density = calculateDensity(planetData.pl_masse, planetData.pl_rade);
  
    // Define uniforms with initial values
    const uniforms = {
      elevationScale: { value: 0.05 }, // Initial elevation scale, adjust based on planet type
      colorDeep: { value: new THREE.Color(0x000080) },    // Deep water color (e.g., deep blue)
      colorShallow: { value: new THREE.Color(0x1E90FF) }, // Shallow water color (e.g., dodger blue)
      colorLandLow: { value: new THREE.Color(0x228B22) }, // Low elevation land color (e.g., forest green)
      colorLandHigh: { value: new THREE.Color(0xCCCC99) },// High elevation land color (e.g., sandy brown)
      waterLevel: { value: 0.0 },                       // Water level threshold
      specularStrength: { value: 0.5 },                 // Specular highlight strength
      lightDirection: { value: new THREE.Vector3(1.0, 1.0, 1.0).normalize() }, // Light direction
      time: { value: 0.0 },                              // Time uniform for animations
      planetType: { value: planetType },                 // Planet type identifier
      atmosphereDensity: { value: 0.0 },                 // Atmosphere density
      atmosphereColor: { value: new THREE.Color(0.5, 0.6, 0.7) }, // Atmosphere color
  
      // New uniforms for enhanced water rendering
      waterReflectivity: { value: 0.3 }, // Reflectivity factor of water
      waterSpecular: { value: 0.5 },     // Specular highlight intensity for water
      waveAmplitude: { value: 0.02 },    // Amplitude of water waves
      waveFrequency: { value: 2.0 },     // Frequency of water waves
  
      // New uniforms for enhanced color variety
      colorVariation: { value: 0.2 },    // Amount of color variation
      colorNoise: { value: 0.1 },        // Noise factor for color variation
    };
  
    /**
     * Adjust uniforms based on planet type for realistic rendering.
     */
    switch (planetType) {
      case 0:
        // Rocky Planet Adjustments
        uniforms.elevationScale.value = 0.05; // Smaller elevation for smoother terrain
        uniforms.waterLevel.value = -0.02;    // Water level threshold
        uniforms.specularStrength.value = 0.4; // Moderate specular highlights
  
        // Adjust land colors based on equilibrium temperature and composition
        {
          const temp = planetData.pl_eqt || 300; // Kelvin
          const tempFactor = THREE.MathUtils.clamp((temp - 200) / 800, 0, 1);
          const composition = planetData.pl_dens || 1.0; // Density as proxy for composition
  
          // Determine base hue based on temperature and composition
          let baseHue = 0.3; // Default green-ish hue
          if (temp > 500) baseHue = 0.05; // Shift towards red for hot planets
          if (composition > 5) baseHue = 0.6; // Shift towards blue for metal-rich planets
  
          // Set multiple land colors using gradient-based palette
          const landColorLow = new THREE.Color().setHSL(baseHue, 0.8, 0.3 + tempFactor * 0.3);
          const landColorMid = new THREE.Color().setHSL(mod(baseHue + 0.05, 1), 0.7, 0.4 + tempFactor * 0.25);
          const landColorHigh = new THREE.Color().setHSL(mod(baseHue + 0.1, 1), 0.6, 0.6 + tempFactor * 0.2);
          uniforms.colorLandLow.value.copy(landColorLow);
          uniforms.colorLandHigh.value.copy(landColorHigh);
  
          // Add accent colors for more variety
          uniforms.colorAccent1 = { value: new THREE.Color().setHSL(mod(baseHue + 0.2, 1), 0.9, 0.5) };
          uniforms.colorAccent2 = { value: new THREE.Color().setHSL(mod(baseHue - 0.2, 1), 0.7, 0.6) };
  
          // Adjust terrain features based on composition
          uniforms.elevationScale.value = 0.05 + (composition - 1) * 0.01; // More varied terrain for denser planets
          uniforms.waterLevel.value = Math.max(-0.02, -0.05 + tempFactor * 0.03); // Adjust water level
  
          // Atmosphere settings
          const atmFactor = Math.max(0.0, 1.0 - tempFactor); // Less atmosphere for hotter planets
          uniforms.atmosphereDensity.value = 0.5 * atmFactor;
          uniforms.atmosphereColor.value.setHSL(baseHue, 0.3, 0.7);
  
          // Specular adjustments
          uniforms.specularStrength.value = 0.4 + tempFactor * 0.2; // More reflective for hotter planets
  
          // Water properties based on planet temperature and composition
          uniforms.waterReflectivity.value = 0.3 + tempFactor * 0.2; // Higher reflectivity for hotter planets
          uniforms.waterSpecular.value = 0.5 + tempFactor * 0.3;     // More specular highlights
          uniforms.waveAmplitude.value = 0.02 + composition * 0.005; // Larger waves for denser planets
          uniforms.waveFrequency.value = 2.0 + composition * 0.5;    // Higher frequency for denser planets
  
          // Enhanced color variety
          uniforms.colorVariation.value = 0.3 + tempFactor * 0.2;    // More variation for extreme temperatures
          uniforms.colorNoise.value = 0.15 + composition * 0.05;     // More noise for varied compositions
        }
        break;
  
      case 1:
        // Gas Giant Adjustments
        uniforms.elevationScale.value = 0.0; // No terrain displacement
        uniforms.waterLevel.value = -0.02;    // Irrelevant for gas giants
        uniforms.specularStrength.value = 0.3; // Lower specular highlights
  
        // Set banded colors based on temperature
        {
          const temp = planetData.pl_eqt || 1000; // Kelvin
          const hue = mod(temp / 360.0, 1.0); // Normalize hue
          uniforms.colorLandLow.value.setHSL(hue, 0.8, 0.5);
          uniforms.colorLandHigh.value.setHSL(mod(hue + 0.1, 1.0), 0.8, 0.6);
  
          // Add more band colors for variety
          uniforms.colorBand1 = { value: new THREE.Color().setHSL(mod(hue + 0.15, 1.0), 0.9, 0.45) };
          uniforms.colorBand2 = { value: new THREE.Color().setHSL(mod(hue - 0.1, 1.0), 0.75, 0.65) };
          uniforms.colorBand3 = { value: new THREE.Color().setHSL(mod(hue + 0.2, 1.0), 0.7, 0.7) };
        }
  
        // Atmosphere settings
        uniforms.atmosphereDensity.value = 1.5;
        uniforms.atmosphereColor.value.setHSL(0.6, 0.6, 0.7); // Example color
  
        // Disable water properties for gas giants
        uniforms.waterReflectivity.value = 0.0;
        uniforms.waterSpecular.value = 0.0;
        uniforms.waveAmplitude.value = 0.0;
        uniforms.waveFrequency.value = 0.0;
  
        // Enhanced color variety for gas giants
        uniforms.colorVariation.value = 0.4;    // High variation for complex band structures
        uniforms.colorNoise.value = 0.2;        // More noise for turbulent atmospheres
        break;
  
      case 2:
        // Icy Planet Adjustments
        uniforms.elevationScale.value = 0.02; // Smaller elevation for smoother icy terrain
        uniforms.waterLevel.value = -0.02;    // Water level threshold
        uniforms.colorLandLow.value.setRGB(0.8, 0.9, 1.0); // Icy low land color
        uniforms.colorLandHigh.value.setRGB(0.6, 0.8, 1.0); // Icy high land color
        uniforms.specularStrength.value = 0.6; // Higher specular highlights for ice
  
        // Add more ice color variations
        uniforms.colorIce1 = { value: new THREE.Color(0.9, 0.95, 1.0) }; // Pure white ice
        uniforms.colorIce2 = { value: new THREE.Color(0.7, 0.8, 0.9) };  // Slightly blue ice
        uniforms.colorIce3 = { value: new THREE.Color(0.85, 0.9, 0.95) }; // Pale blue ice
  
        // Atmosphere settings
        uniforms.atmosphereDensity.value = 2.0;
        uniforms.atmosphereColor.value.setRGB(0.6, 0.7, 0.8); // Icy atmosphere color
  
        // Water properties based on icy conditions
        uniforms.waterReflectivity.value = 0.4; // Higher reflectivity for icy water
        uniforms.waterSpecular.value = 0.6;     // More specular highlights
        uniforms.waveAmplitude.value = 0.015;   // Smaller waves for icy water
        uniforms.waveFrequency.value = 1.8;     // Slightly lower frequency
  
        // Enhanced color variety for icy planets
        uniforms.colorVariation.value = 0.15;   // Subtle variations in ice colors
        uniforms.colorNoise.value = 0.08;       // Less noise for smoother ice surfaces
        break;
  
      case 3:
        // Lava Planet Adjustments
        uniforms.elevationScale.value = 0.03; // Slightly higher elevation for lava flows
        uniforms.waterLevel.value = -0.02;    // Irrelevant for lava planets
        uniforms.colorLandLow.value.setRGB(0.5, 0.1, 0.0); // Dark lava color
        uniforms.colorLandHigh.value.setRGB(1.0, 0.5, 0.0); // Glowing lava color
        uniforms.specularStrength.value = 0.8; // Strong specular highlights for molten surfaces
  
        // Add more lava color variations
        uniforms.colorLava1 = { value: new THREE.Color(1.0, 0.7, 0.2) }; // Bright yellow-orange lava
        uniforms.colorLava2 = { value: new THREE.Color(0.9, 0.4, 0.1) }; // Deep orange lava
        uniforms.colorLava3 = { value: new THREE.Color(0.7, 0.2, 0.0) }; // Dark red lava
  
        // Atmosphere settings
        uniforms.atmosphereDensity.value = 1.0;
        uniforms.atmosphereColor.value.setRGB(0.8, 0.3, 0.1); // Fiery atmosphere color
  
        // Disable water properties for lava planets
        uniforms.waterReflectivity.value = 0.0;
        uniforms.waterSpecular.value = 0.0;
        uniforms.waveAmplitude.value = 0.0;
        uniforms.waveFrequency.value = 0.0;
  
        // Enhanced color variety for lava planets
        uniforms.colorVariation.value = 0.5;    // High variation for dynamic lava flows
        uniforms.colorNoise.value = 0.3;        // More noise for turbulent lava surfaces
        break;
  
      default:
        // Default Planet Adjustments
        uniforms.elevationScale.value = 0.05;
        uniforms.waterLevel.value = -0.02;
        uniforms.colorLandLow.value.setRGB(0.5, 0.5, 0.5); // Neutral gray
        uniforms.colorLandHigh.value.setRGB(0.7, 0.7, 0.7); // Light gray
        uniforms.specularStrength.value = 0.4;
  
        // Atmosphere settings
        uniforms.atmosphereDensity.value = 0.5;
        uniforms.atmosphereColor.value.setRGB(0.5, 0.6, 0.7); // Default atmosphere color
  
        // Default water properties
        uniforms.waterReflectivity.value = 0.3;
        uniforms.waterSpecular.value = 0.5;
        uniforms.waveAmplitude.value = 0.02;
        uniforms.waveFrequency.value = 2.0;
  
        // Default color variety
        uniforms.colorVariation.value = 0.2;
        uniforms.colorNoise.value = 0.1;
        break;
    }
  
    /**
     * Create the ShaderMaterial with defined vertex and fragment shaders.
     */
    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      side: THREE.FrontSide,
      transparent: uniforms.atmosphereDensity.value > 0.0, // Enable transparency if atmosphere is present
      depthWrite: false, // Prevent writing depth for transparent materials
    });
  
    return material;
  }
  