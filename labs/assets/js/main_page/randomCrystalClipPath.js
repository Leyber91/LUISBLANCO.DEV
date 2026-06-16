export function addRandomCrystalClipPath() {
    const elements = document.querySelectorAll('.crystal-clip');

    elements.forEach(element => {
        const clipPaths = [
            'polygon(50% 0%, 0% 100%, 100% 100%)',
            'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
            'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
        ];

        const randomClip = clipPaths[Math.floor(Math.random() * clipPaths.length)];
        element.style.clipPath = randomClip;
    });
}