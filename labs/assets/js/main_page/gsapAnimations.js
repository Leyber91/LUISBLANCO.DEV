// Custom animation library
export const customAnimate = {
    from: (element, options) => {
        const startProps = { ...options };
        const endProps = {};
        for (let prop in startProps) {
            if (prop !== 'duration' && prop !== 'ease' && prop !== 'delay') {
                endProps[prop] = getComputedStyle(element)[prop];
                element.style[prop] = startProps[prop];
            }
        }
        setTimeout(() => {
            element.style.transition = `all ${options.duration}s ${options.ease || 'ease'}`;
            for (let prop in endProps) {
                element.style[prop] = endProps[prop];
            }
        }, (options.delay || 0) * 1000);
    }
};

// Custom scroll trigger
export const customScrollTrigger = {
    create: (options) => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    options.onEnter();
                    if (options.once) observer.unobserve(entry.target);
                } else {
                    options.onLeave && options.onLeave();
                }
            });
        }, {
            threshold: options.threshold || 0
        });

        observer.observe(options.trigger);
    }
};

export function initializeCustomAnimations() {
    // Header Animation
    customAnimate.from(document.querySelector('header'), {
        duration: 1.5,
        y: '-100px',
        opacity: '0',
        ease: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' // bounce-like easing
    });

    // Hero Section Animation
    customAnimate.from(document.querySelector('.hero h1'), {
        duration: 2,
        scale: '0.5',
        opacity: '0',
        ease: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', // back-out-like easing
        delay: 0.5
    });

    customAnimate.from(document.querySelector('#blackHole'), {
        duration: 2,
        scale: '0.8',
        opacity: '0',
        ease: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // power2-out-like easing
        delay: 1
    });

    // Project Cards Animation
    document.querySelectorAll('.project-card').forEach(card => {
        customScrollTrigger.create({
            trigger: card,
            onEnter: () => {
                customAnimate.from(card, {
                    duration: 1,
                    y: '50px',
                    opacity: '0',
                    ease: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // power3-out-like easing
                });
            },
            threshold: 0.2,
            once: true
        });
    });

    // Footer Animation
    customAnimate.from(document.querySelector('footer'), {
        duration: 1.5,
        y: '50px',
        opacity: '0',
        ease: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // power2-out-like easing
        delay: 2
    });
}