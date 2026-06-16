// assets/js/main_page/scripts.js

import { addWelcomeSection } from './welcomeSection.js';
import { addTryverseSection } from './tryverseSection.js';
import { addParallaxEffect } from './parallaxEffect.js'; // Corrected import
import { initializeCustomAnimations } from './gsapAnimations.js';
import { addSidebarBlockHoverEffects } from './sidebarHoverEffects.js';
import { addIntersectionObserver } from './intersectionObserver.js';
import { addInteractiveSidebar } from './interactiveSidebar.js';
import { addTouchSwipeFunctionality } from './touchSwipe.js';
import { addRandomCrystalClipPath } from './randomCrystalClipPath.js';
import { createBlackHoleEffect } from './blackHoleEffect.js';
import { addStarfieldBackground } from './starfieldBackground.js';
import { addGlitchEffect } from './glitchEffect.js';
import { addShootingStars } from './shootingStars.js';
import { addAuroraEffect } from './auroraEffect.js';
import { addSoundControls } from './soundControls.js';
import { initializeTryverseAnimation, initializeWelcomeAnimation } from './vertexAnimation.js';
import { initializeCarousel } from './carousel.js';
import { initializeProjectAnimations } from './projectAnimations.js';

document.addEventListener('DOMContentLoaded', () => {
    addWelcomeSection();
    addTryverseSection();
    addParallaxEffect();
    initializeCustomAnimations();
    addSidebarBlockHoverEffects();
    addIntersectionObserver();
    addInteractiveSidebar();
    addTouchSwipeFunctionality();
    addRandomCrystalClipPath();
    createBlackHoleEffect();
    addStarfieldBackground();
    addGlitchEffect();
    addShootingStars();
    addAuroraEffect();
    
    addSoundControls();
    initializeCarousel();
    initializeProjectAnimations();

    // Initialize vertex animations for welcome sections

    initializeTryverseAnimation('tryverseCanvas');
    initializeWelcomeAnimation('welcomeCanvas');

    // Initialize parallax effect
});
