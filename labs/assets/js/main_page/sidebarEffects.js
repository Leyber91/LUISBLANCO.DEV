export function addSidebarBlockHoverEffects() {
    const sidebarBlocks = document.querySelectorAll('.sidebar-block');

    sidebarBlocks.forEach((block) => {
        block.addEventListener('mouseover', () => {
            customAnimate.from(block, {
                duration: 0.3,
                scale: '1.05',
                boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
                backgroundColor: 'rgba(255,255,255,0.1)',
                ease: 'ease-out'
            });
        });

        block.addEventListener('mouseout', () => {
            customAnimate.from(block, {
                duration: 0.3,
                scale: '1',
                boxShadow: '0 5px 10px rgba(0,0,0,0.2)',
                backgroundColor: 'rgba(255,255,255,0)',
                ease: 'ease-in'
            });
        });

        block.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-block.active').forEach((activeBlock) => {
                activeBlock.classList.remove('active');
            });
            block.classList.add('active');
            customAnimate.from(block, {
                duration: 0.3,
                backgroundColor: 'rgba(255,255,255,0.2)',
                ease: 'ease-out'
            });
        });
    });
}

export function addInteractiveSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleButton = document.getElementById('toggle-sidebar');

    toggleButton.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('open');
        toggleButton.setAttribute('aria-expanded', isOpen);

        if (isOpen) {
            customAnimate.from(sidebar, {
                duration: 0.5,
                x: '-100%',
                boxShadow: '10px 0 20px rgba(0,0,0,0.2)',
                ease: 'ease-out'
            });
        } else {
            customAnimate.to(sidebar, {
                duration: 0.5,
                x: '-100%',
                boxShadow: '0 0 0 rgba(0,0,0,0)',
                ease: 'ease-in'
            });
        }
    });

    // Handle Sidebar Block Selection with Zoom-Out/Warp Effect
    const sidebarLinks = document.querySelectorAll('.sidebar-link');

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');

            // Warp out animation
            customAnimate.to(document.querySelector('main'), {
                duration: 0.5,
                scale: '0.9',
                ease: 'ease-in',
                onComplete: () => {
                    window.location.href = href;
                }
            });

            // Close the sidebar after clicking a link
            sidebar.classList.remove('open');
            customAnimate.to(sidebar, {
                duration: 0.5,
                x: '-100%',
                boxShadow: '0 0 0 rgba(0,0,0,0)',
                ease: 'ease-in'
            });
            toggleButton.setAttribute('aria-expanded', false);
        });
    });
}
