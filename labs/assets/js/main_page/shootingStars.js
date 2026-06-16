export function addShootingStars() {
    setInterval(() => {
        const shootingStar = document.createElement('div');
        shootingStar.classList.add('shooting-star');
        shootingStar.style.top = `${Math.random() * 50}%`;
        shootingStar.style.left = `-100px`;
        shootingStar.style.animationDuration = `${Math.random() * 1 + 0.5}s`;
        document.querySelector('.shooting-stars-container').appendChild(shootingStar);
        
        shootingStar.addEventListener('animationend', () => {
            shootingStar.remove();
        });
    }, 3000); // Every 3 seconds
}