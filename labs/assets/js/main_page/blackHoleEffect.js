export function createBlackHoleEffect() {
    const canvas = document.getElementById("blackHole");
    const ctx = canvas.getContext("2d");
  
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  
    const particlesArray = [];
    const particlesCount = 500; // Increased particle count for more detail and liveliness
  
    class Particle {
      constructor() {
        this.reset();
      }
  
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.2; // Even smaller particles for a more subtle and lively effect
        this.speedX = (Math.random() - 0.5) * 0.8;
        this.speedY = (Math.random() - 0.5) * 0.8;
        this.color = `hsl(${Math.random() * 60 + 180}, 100%, ${Math.random() * 40 + 60}%)`; // Brighter and more varied colors
        this.opacity = Math.random() * 0.7 + 0.3; // More varying opacity for depth
        this.life = Math.random() * 100 + 50; // Particle lifespan
      }
  
      update() {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const dx = centerX - this.x;
        const dy = centerY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Dynamic Einstein ring effect
        const ringRadius = 150 + Math.sin(Date.now() * 0.001) * 20; // Pulsating ring
        const gravitationalPull = 0.08 + Math.sin(Date.now() * 0.002) * 0.03; // Varying gravitational pull
        
        if (distance > ringRadius) {
          // Particles outside the ring are pulled towards it
          this.speedX += (dx / distance) * gravitationalPull;
          this.speedY += (dy / distance) * gravitationalPull;
        } else {
          // Particles inside the ring orbit around it
          const angle = Math.atan2(dy, dx);
          const orbitSpeed = 0.03 + Math.random() * 0.02;
          this.speedX = -Math.sin(angle) * orbitSpeed * (ringRadius / distance);
          this.speedY = Math.cos(angle) * orbitSpeed * (ringRadius / distance);
        }
  
        this.x += this.speedX;
        this.y += this.speedY;
  
        // Fade particles as they get closer to the center and lose life
        this.opacity = Math.min(1, (distance / ringRadius) * (this.life / 150));
        this.life--;
  
        if (this.life <= 0 || this.opacity <= 0.1) {
          this.reset();
        }
  
        // Slightly change particle color over time
        const hue = parseInt(this.color.match(/\d+/)[0]);
        this.color = `hsl(${(hue + 0.5) % 360}, 100%, ${Math.random() * 40 + 60}%)`;
      }
  
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = this.color.replace(')', `, ${this.opacity})`).replace('hsl', 'hsla');
        ctx.fill();
      }
    }
  
    function init() {
      for (let i = 0; i < particlesCount; i++) {
        particlesArray.push(new Particle());
      }
    }
  
    function animate() {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
  
      particlesArray.forEach(particle => {
        particle.update();
        particle.draw();
      });
  
      // Draw the Einstein ring
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const ringRadius = 150 + Math.sin(Date.now() * 0.001) * 20;
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + Math.sin(Date.now() * 0.002) * 0.1})`;
      ctx.lineWidth = 2 + Math.sin(Date.now() * 0.003) * 1;
      ctx.stroke();
  
      requestAnimationFrame(animate);
    }
  
    function resizeCanvas() {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
  
    init();
    animate();
}