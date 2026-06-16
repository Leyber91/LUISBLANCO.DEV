export function addEnhancedParallaxEffect() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    let ticking = false;

    function handleParallax() {
        const scrollTop = window.pageYOffset;
        parallaxElements.forEach(element => {
            const speed = parseFloat(element.getAttribute('data-parallax'));
            const yPos = -(scrollTop * speed);
            element.style.transform = `translateY(${yPos}px)`;
        });
        ticking = false;
    }

    function onScroll() {
        if (!ticking) {
            window.requestAnimationFrame(handleParallax);
            ticking = true;
        }
    }

    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', handleParallax);
    handleParallax();
}
