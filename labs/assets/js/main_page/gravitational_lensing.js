
document.addEventListener('DOMContentLoaded', () => {
    initializeGravitationalLensing();
});

function initializeGravitationalLensing() {
    const canvas = document.getElementById('blackHole');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Black Hole
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const blackHole = new THREE.Mesh(geometry, material);
    scene.add(blackHole);

    // Accretion Disk
    const diskGeometry = new THREE.RingGeometry(1.2, 2, 32);
    const diskMaterial = new THREE.MeshBasicMaterial({ color: 0xff4500, side: THREE.DoubleSide });
    const accretionDisk = new THREE.Mesh(diskGeometry, diskMaterial);
    accretionDisk.rotation.x = Math.PI / 2;
    scene.add(accretionDisk);

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        blackHole.rotation.y += 0.005;
        accretionDisk.rotation.z += 0.002;
        renderer.render(scene, camera);
    }

    animate();

    // Handle Window Resize
    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
}
