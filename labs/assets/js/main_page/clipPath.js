export function addRandomCrystalClipPath() {
    const main = document.querySelector('main');
    const svgNS = "http://www.w3.org/2000/svg";
    const clipPath = document.createElementNS(svgNS, 'clipPath');
    clipPath.setAttribute('id', 'crystal-clip');
    main.appendChild(clipPath);

    const polygon = document.createElementNS(svgNS, 'polygon');
    polygon.setAttribute('points', generateRandomPoints(8).join(' '));
    clipPath.appendChild(polygon);

    gsap.to(polygon, {
        duration: 10,
        attr: { points: generateRandomPoints(8).join(' ') },
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });

    main.style.clipPath = 'url(#crystal-clip)';
}

/* Helper Function to Generate Random Points for Polygon */
function generateRandomPoints(count) {
    const points = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const radius = 0.4 + Math.random() * 0.2;
        const x = 50 + Math.cos(angle) * radius * 100;
        const y = 50 + Math.sin(angle) * radius * 100;
        points.push(`${x},${y}`);
    }
    return points;
}