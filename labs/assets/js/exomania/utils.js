// File: assets/js/exomania/utils.js

/**
 * Utility functions for Exomania
 * This file contains functions to calculate planetary properties such as density,
 * gravity, escape velocity, and to determine the planet type based on available data.
 */

/**
 * Constants for astronomical calculations
 */
const EARTH_RADIUS_METERS = 6371000; // Earth's radius in meters
const EARTH_MASS_KG = 5.972e24;      // Earth's mass in kilograms
const G_CONST = 6.67430e-11;         // Gravitational constant in m^3 kg^-1 s^-2

/**
 * Calculate the density of a planet.
 * @param {number} massEarthMasses - Mass of the planet in Earth masses.
 * @param {number} radiusEarthRadii - Radius of the planet in Earth radii.
 * @returns {number} Density in kg/m^3.
 */
export function calculateDensity(massEarthMasses, radiusEarthRadii) {
  if (!massEarthMasses || !radiusEarthRadii) {
    return null;
  }

  // Convert mass and radius to SI units
  const massKg = massEarthMasses * EARTH_MASS_KG;
  const radiusMeters = radiusEarthRadii * EARTH_RADIUS_METERS;

  // Calculate volume
  const volume = (4 / 3) * Math.PI * Math.pow(radiusMeters, 3);

  // Calculate density
  const density = massKg / volume; // kg/m^3

  return density;
}

/**
 * Determine if a planet is a gas giant based on its density.
 * Uses a smooth transition rather than a categorical threshold.
 * @param {object} planetData - Planet data object.
 * @returns {boolean} True if the planet is considered a gas giant.
 */
export function isGasGiant(planetData) {
  const density = calculateDensity(planetData.pl_masse, planetData.pl_rade);
  if (density === null) return false;

  // Use a threshold with a smooth transition
  const lowerThreshold = 2000; // kg/m^3
  const upperThreshold = 4000; // kg/m^3

  if (density < lowerThreshold) {
    return true; // Definitely a gas giant
  } else if (density > upperThreshold) {
    return false; // Definitely a rocky planet
  } else {
    // Smooth transition between rocky and gas giant
    const mixFactor = (density - lowerThreshold) / (upperThreshold - lowerThreshold);
    return mixFactor < 0.5;
  }
}

/**
 * Calculate the surface gravity of a planet.
 * @param {object} planetData - Planet data object.
 * @returns {number} Surface gravity in m/s^2.
 */
export function calculateGravity(planetData) {
  if (!planetData.pl_masse || !planetData.pl_rade) {
    return 9.8; // Default to Earth's gravity
  }

  // Convert mass and radius to SI units
  const massKg = planetData.pl_masse * EARTH_MASS_KG;
  const radiusMeters = planetData.pl_rade * EARTH_RADIUS_METERS;

  // Calculate gravity
  const gravity = (G_CONST * massKg) / Math.pow(radiusMeters, 2);

  return gravity; // m/s^2
}

/**
 * Calculate the escape velocity of a planet.
 * @param {object} planetData - Planet data object.
 * @returns {number} Escape velocity in m/s.
 */
export function calculateEscapeVelocity(planetData) {
  if (!planetData.pl_masse || !planetData.pl_rade) {
    return 11186; // Default to Earth's escape velocity in m/s
  }

  // Convert mass and radius to SI units
  const massKg = planetData.pl_masse * EARTH_MASS_KG;
  const radiusMeters = planetData.pl_rade * EARTH_RADIUS_METERS;

  // Calculate escape velocity
  const escapeVelocity = Math.sqrt((2 * G_CONST * massKg) / radiusMeters);

  return escapeVelocity; // m/s
}

/**
 * Calculate the scale height of a planet's atmosphere.
 * @param {object} planetData - Planet data object.
 * @returns {number} Scale height in meters.
 */
export function calculateScaleHeight(planetData) {
  // Constants
  const R_SPECIFIC = 287.05; // Specific gas constant for dry air in J/(kg·K)

  // Calculate gravity
  const gravity = calculateGravity(planetData);

  // Use equilibrium temperature or default to Earth's average temperature
  const temperature = planetData.pl_eqt || 288; // Kelvin

  // Approximate scale height
  const scaleHeight = (R_SPECIFIC * temperature) / gravity;

  return scaleHeight; // meters
}

/**
 * Determine the planet type based on various properties.
 * @param {object} planetData - Planet data object.
 * @returns {number} Planet type identifier (0: rocky, 1: gas giant, 2: ice, 3: lava).
 */
export function getPlanetType(planetData) {
  const density = calculateDensity(planetData.pl_masse, planetData.pl_rade);
  const temp = planetData.pl_eqt || 300; // Default to 300K if temperature is not provided

  if (density !== null && density < 3000) {
    // Likely a gas giant
    return 1;
  } else if (temp < 150) {
    // Likely an icy planet
    return 2;
  } else if (temp > 1000) {
    // Likely a lava planet
    return 3;
  } else {
    // Default to rocky planet
    return 0;
  }
}

/**
 * Determine if the planet likely has an atmosphere.
 * @param {object} planetData - Planet data object.
 * @returns {boolean} True if the planet likely has an atmosphere.
 */
export function hasAtmosphere(planetData) {
  const gravity = calculateGravity(planetData);
  const escapeVelocity = calculateEscapeVelocity(planetData);
  const temp = planetData.pl_eqt || 288; // Default to Earth's average temperature

  // Calculate average molecular speed of gases at the given temperature
  // Using mean molecular weight similar to Earth's atmosphere (~29 g/mol)
  const meanMolecularWeight = 0.029; // kg/mol
  const boltzmannConstant = 1.380649e-23; // J/K
  const avogadroNumber = 6.02214076e23; // mol^-1

  const averageMolecularSpeed = Math.sqrt((8 * boltzmannConstant * temp) / (Math.PI * meanMolecularWeight / avogadroNumber));

  // If escape velocity is significantly higher than average molecular speed, atmosphere is likely retained
  return escapeVelocity > 5 * averageMolecularSpeed;
}

/**
 * Calculate the camera distance based on planet size.
 * @param {object} planetData - Planet data object.
 * @returns {number} Appropriate camera distance.
 */
export function calculateCameraDistance(planetData) {
  const radius = planetData.pl_rade ? planetData.pl_rade * 0.1 : 1.0;
  return radius * 3; // Adjust multiplier as needed
}

/**
 * Map stellar effective temperature to color (blackbody approximation).
 * @param {number} temp - Effective temperature in Kelvin.
 * @returns {THREE.Color} Corresponding color.
 */
export function temperatureToColor(temp) {
  let color = new THREE.Color(0xffffff);
  if (temp <= 3700) {
    color.setRGB(1.0, 0.54, 0.0); // Red-Orange
  } else if (temp <= 5200) {
    color.setRGB(1.0, 0.76, 0.0); // Yellowish
  } else if (temp <= 6000) {
    color.setRGB(1.0, 1.0, 1.0); // White
  } else if (temp <= 7500) {
    color.setRGB(0.7, 0.8, 1.0); // Blue-White
  } else {
    color.setRGB(0.5, 0.5, 1.0); // Blue
  }
  return color;
}

/**
 * Calculate the luminosity of the host star.
 * Uses the Stefan-Boltzmann Law as an approximation.
 * @param {object} planetData - Planet data object.
 * @returns {number} Luminosity relative to the Sun.
 */
export function calculateLuminosity(planetData) {
  const temp = planetData.st_teff || 5778; // Effective temperature in Kelvin
  const radiusSolarRadii = planetData.st_rad || 1; // Stellar radius in solar radii

  // Stefan-Boltzmann constant
  const sigma = 5.670374419e-8; // W·m−2·K−4

  // Convert stellar radius to meters (assuming 1 solar radius = 6.957e8 meters)
  const radiusMeters = radiusSolarRadii * 6.957e8;

  // Calculate luminosity (L = 4πR^2σT^4)
  const luminosity = 4 * Math.PI * Math.pow(radiusMeters, 2) * sigma * Math.pow(temp, 4);

  // Relative to the Sun's luminosity (3.828e26 W)
  const luminosityRelative = luminosity / 3.828e26;

  return luminosityRelative;
}

/**
 * Estimate the planet's albedo based on type.
 * @param {number} planetType - Planet type identifier.
 * @returns {number} Albedo value between 0 and 1.
 */
export function estimateAlbedo(planetType) {
  switch (planetType) {
    case 0: // Rocky planet
      return 0.3; // Similar to Earth
    case 1: // Gas giant
      return 0.5; // Reflective clouds
    case 2: // Icy planet
      return 0.7; // High reflectivity due to ice
    case 3: // Lava planet
      return 0.2; // Darker surface
    default:
      return 0.3; // Default albedo
  }
}

/**
 * Calculate the planet's equilibrium temperature.
 * @param {object} planetData - Planet data object.
 * @returns {number} Equilibrium temperature in Kelvin.
 */
export function calculateEquilibriumTemperature(planetData) {
  const luminosityRelative = calculateLuminosity(planetData);
  const semiMajorAxisAU = planetData.pl_orbsmax || 1; // Default to 1 AU

  // Estimate albedo based on planet type
  const planetType = getPlanetType(planetData);
  const albedo = estimateAlbedo(planetType);

  // Calculate equilibrium temperature
  const temp = 278 * Math.pow(luminosityRelative, 0.25) * Math.pow(semiMajorAxisAU, -0.5) * Math.pow(1 - albedo, 0.25);

  return temp; // Kelvin
}

/**
 * Generate a procedural seed based on planet data.
 * @param {object} planetData - Planet data object.
 * @returns {number} Seed value.
 */
export function generateSeed(planetData) {
  // Simple hash function based on planet name
  let hash = 0;
  const name = planetData.pl_name || 'Unknown';
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

/**
 * Normalize a value between 0 and 1 based on min and max values.
 * @param {number} value - The value to normalize.
 * @param {number} min - Minimum value.
 * @param {number} max - Maximum value.
 * @returns {number} Normalized value between 0 and 1.
 */
export function normalize(value, min, max) {
  return (value - min) / (max - min);
}

/**
 * Clamp a value between min and max.
 * @param {number} value - The value to clamp.
 * @param {number} min - Minimum value.
 * @param {number} max - Maximum value.
 * @returns {number} Clamped value.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate a random color based on a seed.
 * @param {number} seed - Seed value.
 * @returns {THREE.Color} Generated color.
 */
export function generateColor(seed) {
  const x = Math.sin(seed) * 10000;
  const r = clamp((x - Math.floor(x)), 0, 1);

  const y = Math.sin(seed + 1) * 10000;
  const g = clamp((y - Math.floor(y)), 0, 1);

  const z = Math.sin(seed + 2) * 10000;
  const b = clamp((z - Math.floor(z)), 0, 1);

  return new THREE.Color(r, g, b);
}

/**
 * Convert parsecs to light-years.
 * @param {number} parsecs - Distance in parsecs.
 * @returns {number} Distance in light-years.
 */
export function parsecsToLightYears(parsecs) {
  return parsecs * 3.26156;
}

/**
 * Convert astronomical units to kilometers.
 * @param {number} au - Distance in astronomical units.
 * @returns {number} Distance in kilometers.
 */
export function auToKilometers(au) {
  return au * 149597870.7; // 1 AU = 149,597,870.7 km
}

/**
 * Format a large number with SI prefixes.
 * @param {number} num - The number to format.
 * @returns {string} Formatted number with SI prefix.
 */
export function formatNumberSI(num) {
  const SI_SYMBOL = ['', 'k', 'M', 'G', 'T', 'P', 'E'];

  // Determine SI index
  const tier = Math.log10(Math.abs(num)) / 3 | 0;

  if (tier == 0) return num.toString();

  const suffix = SI_SYMBOL[tier];
  const scale = Math.pow(10, tier * 3);

  const scaled = num / scale;

  return scaled.toFixed(1) + suffix;
}

/**
 * Convert temperature from Kelvin to Celsius.
 * @param {number} kelvin - Temperature in Kelvin.
 * @returns {number} Temperature in Celsius.
 */
export function kelvinToCelsius(kelvin) {
  return kelvin - 273.15;
}

/**
 * Determine if a value is valid (not null or NaN).
 * @param {number} value - The value to check.
 * @returns {boolean} True if the value is valid.
 */
export function isValid(value) {
  return value !== null && !isNaN(value);
}

// File: assets/js/exomania/utils.js

/**
 * Calculate the scale height of a planet's atmosphere.
 * @param {object} planetData - Planet data object.
 * @returns {number} Scale height in meters.
 */

  
  /**
   * Calculate the atmosphere color based on planet data.
   * @param {object} planetData - Planet data object.
   * @returns {THREE.Color} Atmosphere color.
   */
  export function calculateAtmosphereColor(planetData) {
    // Placeholder implementation; you can customize this based on atmospheric composition
    const temp = planetData.pl_eqt || 288; // Kelvin
    let color = new THREE.Color(0x93cfef); // Default blueish color
  
    // Adjust color based on temperature (hotter planets might have a different hue)
    if (temp > 500) {
      color.setHSL(0.1, 0.7, 0.6); // Reddish hue for hot planets
    } else if (temp < 200) {
      color.setHSL(0.6, 0.5, 0.7); // Bluish hue for cold planets
    }
  
    return color;
  }
  