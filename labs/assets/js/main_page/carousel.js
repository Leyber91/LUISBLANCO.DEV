export function initializeCarousel() {
    let slideIndex = 0;
    const slides = document.querySelectorAll('.project-slide');
    const prevButton = document.querySelector('.carousel-controls .prev');
    const nextButton = document.querySelector('.carousel-controls .next');

    function showSlide(n) {
        slides.forEach(slide => slide.classList.remove('active'));
        slideIndex = (n + slides.length) % slides.length;
        slides[slideIndex].classList.add('active');
    }

    prevButton.addEventListener('click', () => showSlide(slideIndex - 1));
    nextButton.addEventListener('click', () => showSlide(slideIndex + 1));

    // Auto-advance carousel
    setInterval(() => showSlide(slideIndex + 1), 5000);

    showSlide(0);
}