export function addDoodleAnimations() {
    // Example using SVG.js for doodle animations
    const draw = SVG().addTo('#welcome-doodle').size(300, 300);
    
    const doodle = draw.path('M10 10 H 90 V 90 H 10 Z').fill('none').stroke({ width: 2, color: '#ff6347' });
    
    doodle.animate(2000, '<>').plot('M10 10 C 20 20, 40 20, 50 10').loop();
}
