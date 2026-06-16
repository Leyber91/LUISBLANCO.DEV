export function addGlitchEffect() {
    const glitchTexts = document.querySelectorAll('.glitch-text');
    
    glitchTexts.forEach(text => {
        const content = text.textContent;
        text.setAttribute('data-text', content);
        
        text.addEventListener('mouseover', () => {
            text.classList.add('glitch');
            setTimeout(() => {
                text.classList.remove('glitch');
            }, 1000);
        });
    });
}