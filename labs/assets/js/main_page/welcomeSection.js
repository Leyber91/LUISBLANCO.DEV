export function addWelcomeSection() {
    const welcomeSection = document.createElement('section');
    welcomeSection.classList.add('welcome', 'hidden');
    welcomeSection.innerHTML = `
        <h2 class="glitch-text" data-text="Welcome to Project Leyber 212">Welcome to Project Leyber 212</h2>
        <p>Project Leyber 212 is a unique and inspiring platform that combines the power of data, artificial intelligence, and human potential to unlock new possibilities for personal growth and global progress. Our mission is to bring together diverse passions and interests, from space science and fitness to the world of data engineering and beyond, all while exploring the limitless potential of our ever-changing reality.</p>
        <p>As we journey through this exciting era of technological revolution, we strive to inspire and empower our audience by sharing valuable insights and knowledge, as well as by providing a glimpse into the fascinating world of alternative realities through our "tryverse" concept. We aim to make these complex subjects approachable, engaging, and visually captivating, to help you discover the incredible potential that lies within you and the world around you.</p>
        <p>Our commitment to staying at the forefront of AI advancements and embracing emerging tools and technologies will ensure that we continue to evolve and grow alongside our audience. Together, we'll navigate this rapidly changing landscape, fostering a community of forward-thinking individuals who embrace progress and seek to make a positive impact in the world.</p>
        <p>Join us on this exciting journey, and let's explore the endless possibilities of the universe and the human spirit. Welcome to Project Leyber 212.</p>
    `;
    document.querySelector('main').appendChild(welcomeSection);
}