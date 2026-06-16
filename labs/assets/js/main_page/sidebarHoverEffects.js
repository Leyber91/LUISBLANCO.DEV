export function addSidebarBlockHoverEffects() {
    const sidebarBlocks = document.querySelectorAll('.sidebar-block');

    sidebarBlocks.forEach((block) => {
        block.addEventListener('mouseenter', () => {
            block.style.transform = 'scale(1.05)';
            block.style.transition = 'transform 0.3s ease';
        });

        block.addEventListener('mouseleave', () => {
            block.style.transform = 'scale(1)';
        });
    });
}