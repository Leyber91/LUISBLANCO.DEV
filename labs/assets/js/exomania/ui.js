// File: assets/js/exomania/ui.js

import { planetsData } from './planet.js';

/**
 * Sets up the user interface by initializing event listeners and generating the initial planet carousel.
 * @param {Function} loadPlanetCallback - Callback function to handle planet selection.
 * @param {Array} data - Array of planet data.
 */
export function setupUI(loadPlanetCallback, data) {
  const loadMoreButton = document.querySelector('.load-more-button');
  if (!loadMoreButton) {
    console.error('Load More button not found.');
    return;
  }

  loadMoreButton.addEventListener('click', () => {
    generatePlanetCarousel(data, loadPlanetCallback);
  });

  generatePlanetCarousel(data, loadPlanetCallback);
}

/**
 * Generates the planet carousel with a specified number of random planets.
 * @param {Array} data - Array of planet data.
 * @param {Function} loadPlanetCallback - Callback function to handle planet selection.
 */
export function generatePlanetCarousel(data, loadPlanetCallback) {
  const carousel = document.getElementById('planet-carousel');
  if (!carousel) {
    console.error('Planet carousel element not found.');
    return;
  }
  carousel.innerHTML = '';

  const randomPlanets = getRandomPlanetsFromData(data, 10);

  randomPlanets.forEach(planetData => {
    const card = createPlanetCard(planetData, loadPlanetCallback);
    carousel.appendChild(card);
  });
}

/**
 * Creates a planet card element.
 * @param {Object} planetData - Data of the planet.
 * @param {Function} loadPlanetCallback - Callback function to handle planet selection.
 * @returns {HTMLElement} - The created planet card element.
 */
function createPlanetCard(planetData, loadPlanetCallback) {
  const card = document.createElement('div');
  card.classList.add('carousel-item');

  card.innerHTML = `
    <h3>${sanitizeHTML(planetData.pl_name)}</h3>
    <p>Host Star: ${sanitizeHTML(planetData.hostname)}</p>
  `;

  card.addEventListener('click', () => {
    loadPlanetCallback(planetData);
  });

  return card;
}

/**
 * Retrieves a specified number of unique random planets from the data.
 * @param {Array} data - Array of planet data.
 * @param {number} num - Number of random planets to retrieve.
 * @returns {Array} - Array of random planet data.
 */
function getRandomPlanetsFromData(data, num) {
  const planets = [];
  const usedIndices = new Set();
  const maxPlanets = Math.min(num, data.length);

  while (planets.length < maxPlanets) {
    const randomIndex = Math.floor(Math.random() * data.length);
    if (!usedIndices.has(randomIndex)) {
      usedIndices.add(randomIndex);
      planets.push(data[randomIndex]);
    }
  }

  return planets;
}

/**
 * Updates the planet information in the control panel.
 * @param {Object} planetData - Data of the selected planet.
 */
export function updatePlanetInfo(planetData) {
  const planetInfo = document.getElementById('planet-info');
  if (!planetInfo) {
    console.error('Planet info element not found.');
    return;
  }

  planetInfo.innerHTML = `
    <h2>${sanitizeHTML(planetData.pl_name)}</h2>
    <p><strong>Host Star:</strong> ${sanitizeHTML(planetData.hostname)}</p>
    <p><strong>Distance from Earth:</strong> ${formatValue(planetData.sy_dist, 'parsecs')}</p>
    <p><strong>Orbital Period:</strong> ${formatValue(planetData.pl_orbper, 'days')}</p>
    <p><strong>Semi-Major Axis:</strong> ${formatValue(planetData.pl_orbsmax, 'AU')}</p>
    <p><strong>Planet Radius:</strong> ${formatValue(planetData.pl_rade, 'Earth radii')}</p>
    <p><strong>Planet Mass:</strong> ${formatValue(planetData.pl_masse, 'Earth masses')}</p>
    <p><strong>Equilibrium Temperature:</strong> ${formatValue(planetData.pl_eqt, 'K')}</p>
    <p><strong>Stellar Effective Temperature:</strong> ${formatValue(planetData.st_teff, 'K')}</p>
  `;
}

/**
 * Formats a value with its corresponding unit.
 * @param {number|null} value - The numerical value to format.
 * @param {string} unit - The unit of the value.
 * @returns {string} - The formatted value with unit or 'N/A' if invalid.
 */
export function formatValue(value, unit) {
  return value !== null && !isNaN(value) ? `${parseFloat(value).toFixed(2)} ${unit}` : 'N/A';
}

/**
 * Sanitizes a string to prevent Cross-Site Scripting (XSS) attacks.
 * @param {string} str - The string to sanitize.
 * @returns {string} - The sanitized string.
 */
function sanitizeHTML(str) {
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
}