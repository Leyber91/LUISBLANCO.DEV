const COLORS = {
    background: '#000011',
    accent: '#00ccff',
    hover: '#ff33cc',
    neonBlue: '#3333ff',
    neonPurple: '#9933ff'
};

function animateBlackHole(canvas) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let time = 0;

    function draw() {
        // Clear canvas with background color
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Black hole
        const blackHoleRadius = 40;
        ctx.beginPath();
        ctx.arc(centerX, centerY, blackHoleRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'black';
        ctx.fill();

        // Accretion disk
        const diskRadius = 100;
        const diskWidth = 30;
        ctx.beginPath();
        ctx.arc(centerX, centerY, diskRadius, 0, Math.PI * 2);
        const diskGradient = ctx.createRadialGradient(centerX, centerY, diskRadius - diskWidth, centerX, centerY, diskRadius + diskWidth);
        diskGradient.addColorStop(0, 'rgba(51, 51, 255, 0)'); // COLORS.neonBlue with 0 alpha
        diskGradient.addColorStop(0.5, COLORS.neonBlue);
        diskGradient.addColorStop(1, 'rgba(153, 51, 255, 0)'); // COLORS.neonPurple with 0 alpha
        ctx.strokeStyle = diskGradient;
        ctx.lineWidth = diskWidth;
        ctx.stroke();

        // Gravitational lensing effect
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const lensRadius = 160;
        const lensGradient = ctx.createRadialGradient(centerX, centerY, blackHoleRadius, centerX, centerY, lensRadius);
        lensGradient.addColorStop(0, 'rgba(0, 204, 255, 0.8)'); // COLORS.accent with 0.8 alpha
        lensGradient.addColorStop(1, 'rgba(0, 204, 255, 0)'); // COLORS.accent with 0 alpha
        ctx.fillStyle = lensGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, lensRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Rotating light effect
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const lightRadius = 180;
        ctx.translate(centerX, centerY);
        ctx.rotate(time);
        const lightGradient = ctx.createLinearGradient(-lightRadius, 0, lightRadius, 0);
        lightGradient.addColorStop(0, 'rgba(153, 51, 255, 0)'); // COLORS.neonPurple with 0 alpha
        lightGradient.addColorStop(0.5, 'rgba(153, 51, 255, 0.3)'); // COLORS.neonPurple with 0.3 alpha
        lightGradient.addColorStop(1, 'rgba(153, 51, 255, 0)'); // COLORS.neonPurple with 0 alpha
        ctx.fillStyle = lightGradient;
        ctx.fillRect(-lightRadius, -10, lightRadius * 2, 20);
        ctx.restore();

        time += 0.01;
        requestAnimationFrame(draw);
    }

    draw();
}

function animateDimensionalTest(canvas) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let time = 0;

    function draw() {
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tesseract
        const size = 100;
        const rotation = time * 0.5;

        function drawCube(offset) {
            ctx.beginPath();
            ctx.moveTo(centerX + Math.cos(rotation) * size + offset, centerY + Math.sin(rotation) * size + offset);
            ctx.lineTo(centerX + Math.cos(rotation + Math.PI/2) * size + offset, centerY + Math.sin(rotation + Math.PI/2) * size + offset);
            ctx.lineTo(centerX + Math.cos(rotation + Math.PI) * size + offset, centerY + Math.sin(rotation + Math.PI) * size + offset);
            ctx.lineTo(centerX + Math.cos(rotation + 3*Math.PI/2) * size + offset, centerY + Math.sin(rotation + 3*Math.PI/2) * size + offset);
            ctx.closePath();
            ctx.strokeStyle = COLORS.neonBlue;
            ctx.stroke();
        }

        drawCube(0);
        drawCube(20);

        // Connecting lines
        for (let i = 0; i < 4; i++) {
            const angle = rotation + i * Math.PI/2;
            ctx.beginPath();
            ctx.moveTo(centerX + Math.cos(angle) * size, centerY + Math.sin(angle) * size);
            ctx.lineTo(centerX + Math.cos(angle) * size + 20, centerY + Math.sin(angle) * size + 20);
            ctx.strokeStyle = COLORS.neonPurple;
            ctx.stroke();
        }

        time += 0.02;
        requestAnimationFrame(draw);
    }

    draw();
}

function animateExomania(canvas) {
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let time = 0;

    function draw() {
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Star
        ctx.beginPath();
        ctx.arc(centerX, centerY, 20, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.accent;
        ctx.fill();

        // Exoplanets
        const planets = [
            { radius: 60, size: 8, color: COLORS.neonBlue, speed: 1, moons: 1 },
            { radius: 100, size: 12, color: COLORS.neonPurple, speed: 0.7, moons: 2 },
            { radius: 140, size: 6, color: COLORS.hover, speed: 0.5, moons: 0 }
        ];

        planets.forEach((planet, index) => {
            const angle = time * planet.speed;
            const x = centerX + Math.cos(angle) * planet.radius;
            const y = centerY + Math.sin(angle) * planet.radius;

            // Planet
            ctx.beginPath();
            ctx.arc(x, y, planet.size, 0, Math.PI * 2);
            ctx.fillStyle = planet.color;
            ctx.fill();

            // Orbit
            ctx.beginPath();
            ctx.arc(centerX, centerY, planet.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, 0.1)`;
            ctx.stroke();

            // Moons
            for (let i = 0; i < planet.moons; i++) {
                const moonAngle = angle * 2 + (i * Math.PI);
                const moonX = x + Math.cos(moonAngle) * (planet.size + 10);
                const moonY = y + Math.sin(moonAngle) * (planet.size + 10);
                
                ctx.beginPath();
                ctx.arc(moonX, moonY, 2, 0, Math.PI * 2);
                ctx.fillStyle = COLORS.accent;
                ctx.fill();
            }
        });

        time += 0.02;
        requestAnimationFrame(draw);
    }

    draw();
}

export function initializeProjectAnimations() {
    animateBlackHole(document.getElementById('blackHoleCanvas'));
    animateDimensionalTest(document.getElementById('dimensionalTestCanvas'));
    animateExomania(document.getElementById('exomaniaCanvas'));
}