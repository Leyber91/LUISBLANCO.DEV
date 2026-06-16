export function addParallaxEffect() {
    const parallaxElements = document.querySelectorAll('[data-parallax]');
    let ticking = false;

    function handleParallax() {
        const scrollTop = window.pageYOffset;
        const windowWidth = window.innerWidth;

        parallaxElements.forEach(element => {
            let speed = parseFloat(element.getAttribute('data-parallax'));

            // Adjust speed based on screen width
            if (windowWidth < 480) {
                speed *= 0.5; // Reduce speed for small screens
            }

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
    // Initialize parallax positions on load
    handleParallax();
}
