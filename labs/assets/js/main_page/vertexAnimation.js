// vertexAnimation.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

/**
 * Custom Orbit Controls (Simplified)
 * Provides basic camera controls, allowing users to navigate
 * around the scene with smooth rotations and zooming.
 */
class CustomOrbitControls {
    constructor(camera, domElement, options = {}) {
        this.camera = camera;
        this.domElement = domElement;

        // Configuration Parameters with Defaults
        this.enabled = options.enabled !== undefined ? options.enabled : true;
        this.rotateSpeed = options.rotateSpeed || 0.005;
        this.zoomSpeed = options.zoomSpeed !== undefined ? options.zoomSpeed : 0.3;
        this.minDistance = options.minDistance || 20;
        this.maxDistance = options.maxDistance !== undefined ? options.maxDistance : 200;
        this.dampingFactor = options.dampingFactor || 0.1;

        // Internal State
        this.spherical = new THREE.Spherical();
        this.targetSpherical = new THREE.Spherical();
        this.rotationVelocity = new THREE.Vector2(0, 0);
        this.inertiaDamping = options.inertiaDamping || 0.98;
        this.zoomVelocity = 0;
        this.zoomDamping = options.zoomDamping || 0.90;
        this.mouse = {
            left: { isDown: false, x: 0, y: 0 },
        };
        this.target = new THREE.Vector3(0, 0, 0);

        // Initialize Spherical Coordinates based on Camera Position
        this.updateSpherical();

        // Bind Event Handlers
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onMouseWheel = this.onMouseWheel.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);

        // Add Event Listeners
        this.domElement.addEventListener('mousedown', this.onMouseDown, false);
        this.domElement.addEventListener('mousemove', this.onMouseMove, false);
        this.domElement.addEventListener('mouseup', this.onMouseUp, false);
        this.domElement.addEventListener('wheel', this.onMouseWheel, false);
        this.domElement.addEventListener('contextmenu', this.onContextMenu, false);

        // Bind the update method for external calling
        this.update = this.update.bind(this);
    }

    /**
     * Initialize spherical coordinates based on current camera position
     */
    updateSpherical() {
        const offset = new THREE.Vector3().copy(this.camera.position).sub(this.target);
        this.spherical.setFromVector3(offset);
        this.targetSpherical.copy(this.spherical);
    }

    /**
     * Event handler for mouse down
     */
    onMouseDown(event) {
        if (!this.enabled) return;
        if (event.button === 0) {
            this.mouse.left.isDown = true;
            this.mouse.left.x = event.clientX;
            this.mouse.left.y = event.clientY;
        }
    }

    /**
     * Event handler for mouse move
     */
    onMouseMove(event) {
        if (!this.enabled) return;
        if (this.mouse.left.isDown) {
            const deltaX = event.clientX - this.mouse.left.x;
            const deltaY = event.clientY - this.mouse.left.y;

            this.mouse.left.x = event.clientX;
            this.mouse.left.y = event.clientY;

            this.rotationVelocity.x += deltaX * this.rotateSpeed;
            this.rotationVelocity.y += deltaY * this.rotateSpeed;

            this.rotateCamera(deltaX, deltaY);
        }
    }

    /**
     * Event handler for mouse up
     */
    onMouseUp(event) {
        if (!this.enabled) return;
        if (event.button === 0) {
            this.mouse.left.isDown = false;
        }
    }

    /**
     * Event handler for mouse wheel (zoom)
     */
    onMouseWheel(event) {
        if (!this.enabled) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? 1 : -1;
        this.zoom(delta);
    }

    /**
     * Event handler for context menu (prevent default)
     */
    onContextMenu(event) {
        event.preventDefault();
    }

    /**
     * Rotate the camera based on mouse movement
     */
    rotateCamera(deltaX, deltaY) {
        this.targetSpherical.theta -= deltaX * this.rotateSpeed;
        this.targetSpherical.phi -= deltaY * this.rotateSpeed;

        const EPS = 0.000001;
        this.targetSpherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, this.targetSpherical.phi));
    }

    /**
     * Apply damping and inertia to rotation and zoom
     */
    applyDamping() {
        this.rotationVelocity.multiplyScalar(this.inertiaDamping);
        this.targetSpherical.theta -= this.rotationVelocity.x;
        this.targetSpherical.phi -= this.rotationVelocity.y;

        const EPS = 0.000001;
        this.targetSpherical.phi = Math.max(EPS, Math.min(Math.PI - EPS, this.targetSpherical.phi));

        this.zoomVelocity *= this.zoomDamping;
        this.targetSpherical.radius += this.zoomVelocity;

        this.targetSpherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetSpherical.radius));
    }

    /**
     * Prevent camera from entering the defined distance bounds
     */
    constrainCameraPosition() {
        const distance = this.targetSpherical.radius;
        if (distance < this.minDistance) {
            this.targetSpherical.radius = this.minDistance;
            this.spherical.radius = this.minDistance;
            this.zoomVelocity = 0;
        }
        if (distance > this.maxDistance) {
            this.targetSpherical.radius = this.maxDistance;
            this.spherical.radius = this.maxDistance;
            this.zoomVelocity = 0;
        }
    }

    /**
     * Update the camera position
     */
    update() {
        if (!this.enabled) return;

        this.spherical.theta += (this.targetSpherical.theta - this.spherical.theta) * (1 - this.dampingFactor);
        this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * (1 - this.dampingFactor);
        this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * (1 - this.dampingFactor);

        const offset = new THREE.Vector3().setFromSpherical(this.spherical);
        this.camera.position.copy(offset).add(this.target);

        this.camera.lookAt(this.target);

        this.applyDamping();
        this.constrainCameraPosition();
    }

    /**
     * Dispose the controls and remove event listeners
     */
    dispose() {
        this.domElement.removeEventListener('mousedown', this.onMouseDown, false);
        this.domElement.removeEventListener('mousemove', this.onMouseMove, false);
        this.domElement.removeEventListener('mouseup', this.onMouseUp, false);
        this.domElement.removeEventListener('wheel', this.onMouseWheel, false);
        this.domElement.removeEventListener('contextmenu', this.onContextMenu, false);
    }

    /**
     * Zoom the camera in or out
     */
    zoom(delta) {
        const factor = Math.pow(0.95, this.zoomSpeed);
        if (delta > 0) {
            this.targetSpherical.radius /= factor;
        } else {
            this.targetSpherical.radius *= factor;
        }

        this.targetSpherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetSpherical.radius));
    }

    /**
     * Set the target position for the camera to look at
     */
    setTarget(x, y, z) {
        this.target.set(x, y, z);
    }
}

/**
 * Initializes the Welcome Animation.
 * @param {string} canvasId - The ID of the canvas element.
 */
export function initializeWelcomeAnimation(canvasId) {
    // Get the canvas element
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with ID '${canvasId}' not found.`);
        return;
    }

    // Renderer and Scene Setup
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0008);

    // Camera Setup
    const camera = new THREE.PerspectiveCamera(
        60,
        canvas.clientWidth / canvas.clientHeight,
        0.1,
        1000
    );
    camera.position.z = 50;

    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Responsive resizing
    window.addEventListener('resize', () => {
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
    });

    // Custom Orbit Controls
    const controls = new CustomOrbitControls(camera, renderer.domElement, {
        rotateSpeed: 0.005,
        zoomSpeed: 0.5,
        minDistance: 20,
        maxDistance: 200,
    });

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1);
    camera.add(pointLight);
    scene.add(camera);

    // Universe Parameters
    const universeGroup = new THREE.Group();
    scene.add(universeGroup);

    // Planet Data
    const planets = [];
    const planetColors = [0xff6347, 0x1e90ff, 0x32cd32]; // Tomato, DodgerBlue, LimeGreen
    const planetPositions = [
        { x: -30, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 30, y: 0, z: 0 },
    ];

    // Create Planets
    planetPositions.forEach((pos, index) => {
        const geometry = new THREE.SphereGeometry(5, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: planetColors[index],
        });
        const planet = new THREE.Mesh(geometry, material);
        planet.position.set(pos.x, pos.y, pos.z);
        planet.userData = { index: index };
        planet.castShadow = true;
        planet.receiveShadow = true;
        universeGroup.add(planet);
        planets.push(planet);

        // Add labels as sprites
        const label = createTextSprite(`Planet ${index + 1}`, {
            fontsize: 32,
            borderThickness: 1,
            borderColor: { r: 255, g: 255, b: 255, a: 1.0 },
            backgroundColor: { r: 0, g: 0, b: 0, a: 0.5 },
            textColor: { r: 255, g: 255, b: 255, a: 1.0 },
        });
        label.position.set(0, 6, 0);
        planet.add(label);
    });

    /**
     * Creates a text sprite for labeling.
     * @param {string} message - The text to display.
     * @param {object} parameters - Parameters for the text sprite.
     * @returns {THREE.Sprite} - The created text sprite.
     */
    function createTextSprite(message, parameters = {}) {
        const fontface = parameters.fontface || 'Arial';
        const fontsize = parameters.fontsize || 18;
        const borderThickness = parameters.borderThickness || 4;
        const borderColor = parameters.borderColor || { r: 0, g: 0, b: 0, a: 1.0 };
        const backgroundColor = parameters.backgroundColor || { r: 255, g: 255, b: 255, a: 1.0 };
        const textColor = parameters.textColor || { r: 0, g: 0, b: 0, a: 1.0 };

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = `${fontsize}px ${fontface}`;

        // Calculate size
        const metrics = context.measureText(message);
        const textWidth = metrics.width;

        // Background
        context.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`;
        context.fillRect(
            borderThickness / 2,
            borderThickness / 2,
            textWidth + borderThickness,
            fontsize * 1.4 + borderThickness
        );

        // Text
        context.fillStyle = `rgba(${textColor.r},${textColor.g},${textColor.b},${textColor.a})`;
        context.fillText(message, borderThickness, fontsize + borderThickness);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(10, 5, 1.0);

        return sprite;
    }

    // Starfield Background
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 10000;
    const starVertices = [];
    for (let i = 0; i < starCount; i++) {
        const x = THREE.MathUtils.randFloatSpread(2000);
        const y = THREE.MathUtils.randFloatSpread(2000);
        const z = THREE.MathUtils.randFloatSpread(2000);
        starVertices.push(x, y, z);
    }
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0x888888 });
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);

    // Raycaster for Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onMouseClick(event) {
        // Calculate mouse position in normalized device coordinates
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(planets);

        if (intersects.length > 0) {
            const clickedPlanet = intersects[0].object;
            zoomIntoPlanet(clickedPlanet);
            showPlanetInfo(clickedPlanet.userData.index);
        }
    }

    function zoomIntoPlanet(planet) {
        controls.setTarget(planet.position.x, planet.position.y, planet.position.z);
        // Smooth zoom animation
        const targetRadius = 10;
        const zoomDuration = 2; // seconds
        const zoomStart = controls.targetSpherical.radius;
        const zoomEnd = targetRadius;
        let zoomStartTime = null;

        function animateZoom(timestamp) {
            if (!zoomStartTime) zoomStartTime = timestamp;
            const elapsed = (timestamp - zoomStartTime) / 1000; // Convert to seconds
            const progress = Math.min(elapsed / zoomDuration, 1);
            controls.targetSpherical.radius = THREE.MathUtils.lerp(zoomStart, zoomEnd, progress);
            controls.update();

            if (progress < 1) {
                requestAnimationFrame(animateZoom);
            }
        }
        requestAnimationFrame(animateZoom);
    }

    canvas.addEventListener('click', onMouseClick);

    // Animated Celestial Events: Meteor Shower
    const meteors = [];
    const meteorGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const meteorMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    function createMeteorShower() {
        if (Math.random() > 0.98) {
            const meteor = new THREE.Mesh(meteorGeometry, meteorMaterial);
            meteor.position.set(
                THREE.MathUtils.randFloatSpread(200),
                100,
                THREE.MathUtils.randFloatSpread(200)
            );
            meteor.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                - (Math.random() * 0.5 + 0.1),
                (Math.random() - 0.5) * 0.2
            );
            scene.add(meteor);
            meteors.push(meteor);
        }

        meteors.forEach((meteor, index) => {
            meteor.position.add(meteor.velocity);
            if (meteor.position.y < -50) {
                scene.remove(meteor);
                meteors.splice(index, 1);
            }
        });
    }

    // Narrative Journey: Text Overlay
    function showPlanetInfo(index) {
        // Display narrative or information about the planet
        alert(`You have selected Planet ${index + 1}. This planet is known for its...`);
    }

    // Customizable Themes
    const themes = {
        Galactic: {
            backgroundColor: 0x000011,
            starColor: 0x8888ff,
            ambientLightColor: 0x4444ff,
        },
        Mystical: {
            backgroundColor: 0x110011,
            starColor: 0xff88ff,
            ambientLightColor: 0xff44ff,
        },
        Futuristic: {
            backgroundColor: 0x001111,
            starColor: 0x88ffff,
            ambientLightColor: 0x44ffff,
        },
    };

    function applyTheme(themeName) {
        const theme = themes[themeName];
        scene.fog.color.setHex(theme.backgroundColor);
        renderer.setClearColor(theme.backgroundColor, 1);

        starsMaterial.color.setHex(theme.starColor);
        ambientLight.color.setHex(theme.ambientLightColor);
    }

    // Theme Selection UI (Assuming you have a select element with ID 'themeSelector')
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.addEventListener('change', (event) => {
            applyTheme(event.target.value);
        });
    }

    // Parallax Effect
    let parallaxYOffset = 0;

    function handleParallax() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        parallaxYOffset = scrollTop;
    }

    function onScroll() {
        handleParallax();
    }

    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', handleParallax);
    // Initialize parallax positions on load
    handleParallax();

    // Animation Loop
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);

        const delta = clock.getDelta();

        // Rotate Planets
        planets.forEach(planet => {
            planet.rotation.y += 0.01 * delta;
        });

        // Update Meteors
        createMeteorShower();

        // Update Controls
        controls.update();

        // Apply Parallax Effect to Camera Position
        camera.position.y = -parallaxYOffset * 0.05; // Adjust multiplier to control effect

        renderer.render(scene, camera);
    }
    animate();
}

/**
 * Initializes the Tryverse Animation.
 * @param {string} canvasId - The ID of the canvas element.
 */
export function initializeTryverseAnimation(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas with ID '${canvasId}' not found.`);
        return;
    }

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    const scene = new THREE.Scene();

    // Camera Setup
    const camera = new THREE.PerspectiveCamera(
        60,
        canvas.clientWidth / canvas.clientHeight,
        0.1,
        1000
    );
    camera.position.z = 100;

    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Responsive resizing
    window.addEventListener('resize', () => {
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
    });

    // Scroll Handling
    let parallaxYOffset = 0;

    window.addEventListener('scroll', () => {
        parallaxYOffset = window.scrollY;
    });

    // Universe Groups
    const universeGroups = [];
    const universeColors = [0x1e90ff, 0xff6347, 0x32cd32]; // Blue, Red, Green

    /**
     * Creates a complex universe with fractal structures and particle systems.
     * @param {number} color - Hex color value.
     * @param {THREE.Vector3} position - Position of the universe.
     */
    function createUniverse(color, position) {
        const group = new THREE.Group();
        group.position.copy(position);
        scene.add(group);
        universeGroups.push(group);

        // Create a swarm of particles
        const particleSystem = createParticleSystem(color, 50000, 0.03);
        group.add(particleSystem);

        // Energy Tendrils (particle streams)
        const tendrils = createEnergyTendrils(color, 100, 1000);
        group.add(tendrils);

        return group;
    }

    function createParticleSystem(color, count, size) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);

        for (let i = 0; i < count * 3; i += 3) {
            // Create a spherical distribution
            const radius = 20 * (1 + Math.random() * 0.2); // Slight variation in radius
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);

            positions[i] = radius * Math.sin(phi) * Math.cos(theta);
            positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
            positions[i + 2] = radius * Math.cos(phi);

            // Add velocities for movement
            velocities[i] = (Math.random() - 0.5) * 0.05;
            velocities[i + 1] = (Math.random() - 0.5) * 0.05;
            velocities[i + 2] = (Math.random() - 0.5) * 0.05;

            const particleColor = new THREE.Color(color);
            particleColor.setHSL(particleColor.getHSL({ h: 0, s: 0, l: 0 }).h, 0.8, Math.random() * 0.5 + 0.5);
            colors[i] = particleColor.r;
            colors[i + 1] = particleColor.g;
            colors[i + 2] = particleColor.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

        const material = new THREE.PointsMaterial({
            size: size,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.Points(geometry, material);
    }

    function createEnergyTendrils(color, count, points) {
        const group = new THREE.Group();

        for (let i = 0; i < count; i++) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(points * 3);
            const colors = new Float32Array(points * 3);

            for (let j = 0; j < points * 3; j += 3) {
                positions[j] = (Math.random() - 0.5) * 100;
                positions[j + 1] = (Math.random() - 0.5) * 100;
                positions[j + 2] = (Math.random() - 0.5) * 100;

                const particleColor = new THREE.Color(color);
                particleColor.setHSL(particleColor.getHSL({ h: 0, s: 0, l: 0 }).h, 0.8, Math.random() * 0.5 + 0.5);
                colors[j] = particleColor.r;
                colors[j + 1] = particleColor.g;
                colors[j + 2] = particleColor.b;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

            const material = new THREE.PointsMaterial({
                size: 0.05,
                vertexColors: true,
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending,
            });

            const tendril = new THREE.Points(geometry, material);
            group.add(tendril);
        }

        return group;
    }

    // Create Three Universes
    createUniverse(universeColors[0], new THREE.Vector3(-50, 0, 0));
    createUniverse(universeColors[1], new THREE.Vector3(0, 0, 0));
    createUniverse(universeColors[2], new THREE.Vector3(50, 0, 0));

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 50, 50);
    scene.add(directionalLight);

    // Animation Loop
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);

        const time = clock.getElapsedTime();

        universeGroups.forEach((group, index) => {
            // Smooth rotation
            group.rotation.y += 0.0002 * Math.sin(time * 0.3 + index);
            group.rotation.x += 0.0001 * Math.cos(time * 0.2 + index);

            // Subtle pulsation
            const scale = 1 + 0.03 * Math.sin(time * 0.3 + index * Math.PI * 2 / 3);
            group.scale.setScalar(scale);

            // Update particle swarm
            const particles = group.children.find(child => child instanceof THREE.Points);
            if (particles && particles.geometry.attributes.position) {
                const positions = particles.geometry.attributes.position.array;
                const velocities = particles.geometry.attributes.velocity.array;
                for (let i = 0; i < positions.length; i += 3) {
                    // Update position based on velocity
                    positions[i] += velocities[i];
                    positions[i + 1] += velocities[i + 1];
                    positions[i + 2] += velocities[i + 2];

                    // Keep particles within a spherical boundary
                    const distance = Math.sqrt(positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2);
                    if (distance > 22 || distance < 18) {
                        velocities[i] *= -1;
                        velocities[i + 1] *= -1;
                        velocities[i + 2] *= -1;
                    }

                    // Add some randomness to the movement
                    velocities[i] += (Math.random() - 0.5) * 0.01;
                    velocities[i + 1] += (Math.random() - 0.5) * 0.01;
                    velocities[i + 2] += (Math.random() - 0.5) * 0.01;
                }
                particles.geometry.attributes.position.needsUpdate = true;
                particles.geometry.attributes.velocity.needsUpdate = true;
            }

            // Animate energy tendrils
            const tendrils = group.children.find(child => child instanceof THREE.Group);
            if (tendrils) {
                tendrils.children.forEach((tendril) => {
                    const positions = tendril.geometry.attributes.position.array;
                    for (let j = 0; j < positions.length; j += 3) {
                        positions[j] += Math.sin(time * 0.5 + j) * 0.1;
                        positions[j + 1] += Math.cos(time * 0.4 + j) * 0.1;
                        positions[j + 2] += Math.sin(time * 0.3 + j) * 0.1;

                        // Reset particles that move too far away
                        if (Math.abs(positions[j]) > 50 || Math.abs(positions[j + 1]) > 50 || Math.abs(positions[j + 2]) > 50) {
                            positions[j] = (Math.random() - 0.5) * 100;
                            positions[j + 1] = (Math.random() - 0.5) * 100;
                            positions[j + 2] = (Math.random() - 0.5) * 100;
                        }
                    }
                    tendril.geometry.attributes.position.needsUpdate = true;
                });
            }
        });

        // Universe merging effect with easing
        const mergeAmount = (Math.sin(time * 0.1) + 1) * 0.5;
        const easedMerge = mergeAmount * mergeAmount * (3 - 2 * mergeAmount); // Smooth step easing
        universeGroups[0].position.x = -50 + easedMerge * 25;
        universeGroups[2].position.x = 50 - easedMerge * 25;

        // Apply parallax effect based on scroll
        camera.position.y = -parallaxYOffset * 0.03;

        renderer.render(scene, camera);
    }
    animate();
}
