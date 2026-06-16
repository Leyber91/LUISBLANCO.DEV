export function addTouchSwipeFunctionality() {
    const sidebar = document.getElementById('sidebar');
    let sidebarIsOpen = false;

    // Ensure jQuery is loaded before using it
    if (typeof $ !== 'undefined') {
        $(document).swipe({
            swipeLeft: function(event, direction, distance, duration, fingerCount) {
                if (sidebarIsOpen) {
                    toggleSidebar();
                }
            },
            swipeRight: function(event, direction, distance, duration, fingerCount) {
                if (!sidebarIsOpen) {
                    toggleSidebar();
                }
            },
            threshold: 75
        });
    } else {
        console.warn('jQuery is not loaded. TouchSwipe functionality will not work.');
    }

    function toggleSidebar() {
        sidebarIsOpen = !sidebarIsOpen;
        const toggleButton = document.getElementById('toggle-sidebar');
        sidebar.classList.toggle('open');
        toggleButton.setAttribute('aria-expanded', sidebarIsOpen);

        if (sidebarIsOpen) {
            gsap.to(sidebar, { 
                left: '0%', 
                duration: 0.5, 
                ease: 'elastic.out(1, 0.7)',
                boxShadow: '10px 0 20px rgba(0,0,0,0.2)'
            });
        } else {
            gsap.to(sidebar, { 
                left: '-250px', 
                duration: 0.5, 
                ease: 'power3.in',
                boxShadow: '0 0 0 rgba(0,0,0,0)'
            });
        }
    }
}