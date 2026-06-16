export function addGlitchEffect() {
    const glitchTexts = document.querySelectorAll('.glitch-text');

    glitchTexts.forEach(text => {
        text.addEventListener('mouseenter', () => {
            text.classList.add('glitch-active');
        });

        text.addEventListener('mouseleave', () => {
            text.classList.remove('glitch-active');
        });
    });
}