export function addStarfieldBackground() {
    const starfield = document.querySelector('.starfield');
    const stars = document.createElement('div');
    stars.classList.add('stars');

    for (let i = 0; i < 100; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        star.style.top = `${Math.random() * 100}%`;
        star.style.left = `${Math.random() * 100}%`;
        star.style.width = `${Math.random() * 2 + 1}px`;
        star.style.height = `${Math.random() * 2 + 1}px`;
        stars.appendChild(star);
    }

    starfield.appendChild(stars);
}