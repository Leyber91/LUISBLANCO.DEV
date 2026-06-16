export function addTryverseSection() {
    const tryverseSection = document.createElement('section');
    tryverseSection.classList.add('tryverse', 'hidden');
    tryverseSection.innerHTML = `
        <h2 class="glitch-text" data-text="The Tryverse">The Tryverse</h2>
        <p>Enter the Tryverse, where we explore alternative realities based on the events of the current timeline. Experience two unique dimensions: one where reality is even better than it is now, and another where everything takes a darker turn. Let's dive into these fascinating worlds and discover how small events can drastically change the course of history.</p>
    `;
    document.querySelector('main').appendChild(tryverseSection);
}