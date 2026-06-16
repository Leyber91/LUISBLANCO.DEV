import { customAnimate } from './gsapAnimations.js';

export function addAuroraEffect() {
    const aurora = document.querySelector('.aurora-overlay');
    customAnimate.from(aurora, {
        backgroundPosition: '0% 50%',
        duration: 10,
        ease: 'linear',
        repeat: -1,
        yoyo: true
    });
}