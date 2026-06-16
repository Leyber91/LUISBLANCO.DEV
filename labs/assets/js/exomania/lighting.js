// File: assets/js/exomania/lighting.js

// Import necessary modules
import { temperatureToColor, calculateLuminosity } from './utils.js'; // Import utility functions

/**
 * Sets up the lighting in the scene to simulate the host star's illumination,
 * including realistic corona, solar flares, and coronal mass ejections (CMEs).
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {object} planetData - Data of the planet to determine star properties.
 * @returns {object} An object containing all lighting elements.
 */
/**
 * Sets up the lighting in the scene to simulate the host star's illumination,
 * including realistic corona, solar flares, and coronal mass ejections (CMEs).
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {object} planetData - Data of the planet to determine star properties.
 * @returns {object} An object containing all lighting elements.
 */
/**
 * Sets up the lighting in the scene to simulate the host star's illumination,
 * including realistic corona, solar flares, and coronal mass ejections (CMEs).
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {object} planetData - Data of the planet to determine star properties.
 * @returns {object} An object containing all lighting elements.
 */
export function setupLighting(scene, planetData) {
    // Calculate star properties
    const starTemp = planetData.st_teff || 5778; // Effective temperature in Kelvin
    const starLuminosity = calculateLuminosity(planetData); // Relative to the Sun

    // Map temperature to color
    const starColor = temperatureToColor(starTemp);

    // Create a group to hold all lighting elements
    const lightingGroup = new THREE.Group();

    // 1. Directional Light to simulate star light
    const directionalLight = new THREE.DirectionalLight(starColor, starLuminosity);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = false; // Shadows may not be necessary for distant stars
    lightingGroup.add(directionalLight);

    // 2. Enhanced Lens Flare
    const lensFlare = createEnhancedLensFlare(starColor);
    lensFlare.position.copy(directionalLight.position);
    lightingGroup.add(lensFlare);

    // 3. Star Corona
    const corona = createStarCorona(starColor); // Use enhanced function
    corona.position.copy(directionalLight.position);
    lightingGroup.add(corona);

    // 4. Solar Flares
    const numFlares = 10; // Adjust as needed for realism
    const solarFlares = createSolarFlares(starColor, numFlares); // Pass numFlares
    corona.add(solarFlares); // Attach to corona for relative positioning

    // 5. Coronal Mass Ejections (CMEs)
    const cmEs = createCoronalMassEjections(starColor);
    corona.add(cmEs); // Attach to corona for relative positioning

    // Add the lighting group to the scene
    scene.add(lightingGroup);

    // Return all lighting elements for future updates
    return {
        directionalLight: directionalLight,
        lensFlare: lensFlare,
        corona: corona,
        solarFlares: solarFlares,
        cmEs: cmEs,
        lightingGroup: lightingGroup,
    };
}




/**
 * Updates the lighting based on new planet data.
 * @param {object} lighting - Object containing all lighting elements.
 * @param {object} planetData - Data of the new planet.
 */
export function updateLighting(lighting, planetData) {
    if (!lighting || !lighting.directionalLight) return;

    const starTemp = planetData.st_teff || 5778; // Effective temperature in Kelvin
    const starLuminosity = calculateLuminosity(planetData); // Relative to the Sun

    // Map temperature to color
    const starColor = temperatureToColor(starTemp);

    // Update directional light color and intensity
    lighting.directionalLight.color.copy(starColor);
    lighting.directionalLight.intensity = starLuminosity;

    // Update lens flare color
    if (lighting.lensFlare) {
        updateEnhancedLensFlare(lighting.lensFlare, starColor);
    }

    // Update corona color
    if (lighting.corona && lighting.corona.material.uniforms.color) {
        lighting.corona.material.uniforms.color.value.copy(starColor);
    }

    // Update solar flares color
    if (lighting.solarFlares) {
        lighting.solarFlares.children.forEach(flare => {
            if (flare.material && flare.material.uniforms && flare.material.uniforms.color) {
                flare.material.uniforms.color.value.copy(starColor);
            } else if (flare.material) {
                // For ShaderMaterial and SpriteMaterial, you can directly set the color
                flare.material.color.copy(starColor);
            }
        });
    }

    // Update CMEs color
    if (lighting.cmEs) {
        lighting.cmEs.children.forEach(cme => {
            if (cme.material && cme.material.uniforms && cme.material.uniforms.color) {
                cme.material.uniforms.color.value.copy(starColor);
            } else if (cme.material) {
                // For PointsMaterial, you can directly set the color
                cme.material.color.copy(starColor);
            }
        });
    }
}


/**
 * Creates an enhanced lens flare effect to represent the host star.
 * @param {THREE.Color} color - The color of the star.
 * @returns {THREE.Group} A group containing multiple lens flare sprites.
 */
function createEnhancedLensFlare(color) {
    const flareGroup = new THREE.Group();

    // Parameters for multiple flare layers
    const flareTextures = [
        generateProceduralFlareTexture(color, 256, 256, 0.8),
        generateProceduralFlareTexture(color, 128, 128, 0.6),
        generateProceduralFlareTexture(color, 64, 64, 0.4),
    ];

    flareTextures.forEach((texture, index) => {
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: color,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const sprite = new THREE.Sprite(material);
        const scale = 2.0 + index; // Varying sizes
        sprite.scale.set(scale, scale, 1);
        sprite.position.set(0, 0, 0); // Centered on the star

        flareGroup.add(sprite);
    });

    return flareGroup;
}

/**
 * Updates the enhanced lens flare effect when the star color changes.
 * @param {THREE.Group} flareGroup - The lens flare group containing sprites.
 * @param {THREE.Color} color - The new color of the star.
 */
function updateEnhancedLensFlare(flareGroup, color) {
    flareGroup.children.forEach((sprite, index) => {
        sprite.material.color.copy(color);
        // Regenerate texture with the new color
        const size = 256 / Math.pow(2, index);
        const opacity = 0.8 - index * 0.2;
        const newTexture = generateProceduralFlareTexture(color, size, size, opacity);
        sprite.material.map = newTexture;
        sprite.material.needsUpdate = true;
    });
}

/**
 * Generates a procedural flare texture using canvas.
 * @param {THREE.Color} color - The base color of the flare.
 * @param {number} width - Width of the texture.
 * @param {number} height - Height of the texture.
 * @param {number} opacity - Maximum opacity of the flare.
 * @returns {THREE.CanvasTexture} The generated flare texture.
 */
function generateProceduralFlareTexture(color, width, height, opacity) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Create radial gradient
    const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        width / 2
    );
    gradient.addColorStop(0, `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity})`);
    gradient.addColorStop(0.2, `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${opacity * 0.6})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // Draw the gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Create and return the texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

/**
 * Creates a star corona effect using a semi-transparent sphere with a custom shader.
 * @param {THREE.Color} color - The color of the corona based on the star's color.
 * @returns {THREE.Mesh} The corona mesh.
 */
/**
 * Creates a highly realistic and dynamically animated star corona.
 * The corona features turbulence, color variations, pulsating intensity,
 * and smooth transitions to mimic natural stellar phenomena.
 * 
 * @param {THREE.Color} color - The base color of the corona, derived from the star's temperature.
 * @param {number} radius - The radius of the corona relative to the star's size.
 * @returns {THREE.Mesh} The corona mesh with advanced shader material.
 */
function createStarCorona(color, radius = 1.05) {
    // Define the geometry slightly larger than the star to envelop it
    const coronaGeometry = new THREE.SphereGeometry(radius, 128, 128); // Higher segments for smoother appearance

    // Define the shader material with advanced features
    const coronaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: color },                        // Base color of the corona
            time: { value: 0 },                             // Time uniform for animations
            turbulenceIntensity: { value: 0.3 },            // Controls the amount of turbulence
            turbulenceScale: { value: 2.0 },                // Controls the scale of turbulence patterns
            pulsateSpeed: { value: 1.5 },                   // Speed of the pulsating effect
            alphaMultiplier: { value: 0.6 },                // Overall transparency of the corona
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vNoise;

            uniform float time;
            uniform float turbulenceIntensity;
            uniform float turbulenceScale;

            // Simplex Noise Function
            // Source: https://github.com/ashima/webgl-noise
            vec3 mod289(vec3 x) {
              return x - floor(x * (1.0 / 289.0)) * 289.0;
            }

            vec4 mod289(vec4 x) {
              return x - floor(x * (1.0 / 289.0)) * 289.0;
            }

            vec4 permute(vec4 x) {
                 return mod289(((x*34.0)+1.0)*x);
            }

            vec4 taylorInvSqrt(vec4 r)
            {
              return 1.79284291400159 - 0.85373472095314 * r;
            }

            float snoise(vec3 v)
              { 
              const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
              const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

              // First corner
              vec3 i  = floor(v + dot(v, C.yyy) );
              vec3 x0 = v - i + dot(i, C.xxx) ;

              // Other corners
              vec3 g = step(x0.yzx, x0.xyz);
              vec3 l = 1.0 - g;
              vec3 i1 = min( g.xyz, l.zxy );
              vec3 i2 = max( g.xyz, l.zxy );

              //   x0 = x0 - 0.0 + 0.0 * C 
              vec3 x1 = x0 - i1 + C.xxx;
              vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
              vec3 x3 = x0 - D.yyy;      // -1.0 + 3.0*C.x = -0.5 = -D.y

              // Permutations
              i = mod289(i); 
              vec4 p = permute( permute( permute( 
                         i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                       + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                       + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

              // Gradients: 7x7 points over a square, mapped onto an octahedron.
              // The ring size 17*17 = 289 is close to a multiple of 49 (49*6=294)
              float n_ = 1.0/7.0; // N=7
              vec3  ns = n_ * D.wyz - D.xzx;

              vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  // mod(p,7*7)

              vec4 x_ = floor(j * ns.z);
              vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

              vec4 x = x_ *ns.x + ns.yyyy;
              vec4 y = y_ *ns.x + ns.yyyy;
              vec4 h = 1.0 - abs(x) - abs(y);

              vec4 b0 = vec4( x.xy, y.xy );
              vec4 b1 = vec4( x.zw, y.zw );

              vec4 s0 = floor(b0)*2.0 + 1.0;
              vec4 s1 = floor(b1)*2.0 + 1.0;
              vec4 sh = -step(h, vec4(0.0));

              vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
              vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

              vec3 p0 = vec3(a0.xy,h.x);
              vec3 p1 = vec3(a0.zw,h.y);
              vec3 p2 = vec3(a1.xy,h.z);
              vec3 p3 = vec3(a1.zw,h.w);

              // Normalise gradients
              vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
              p0 *= norm.x;
              p1 *= norm.y;
              p2 *= norm.z;
              p3 *= norm.w;

              // Mix contributions from the four corners
              vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), 
                                      dot(x2,x2), dot(x3,x3)), 0.0);
              m = m * m;
              return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                            dot(p2,x2), dot(p3,x3) ) );
              }

            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                
                // Apply turbulence using noise
                float noise = snoise(vPosition * turbulenceScale + vec3(time * 0.5));
                vNoise = noise * turbulenceIntensity;
                
                // Modify vertex position based on noise for dynamic corona
                vec3 displacedPosition = position + vNormal * vNoise;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
            }
        `,
        fragmentShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vNoise;

            uniform vec3 color;
            uniform float time;
            uniform float pulsateSpeed;
            uniform float alphaMultiplier;

            void main() {
                // Calculate the angle between the normal and the view direction
                float viewDot = dot(vNormal, normalize(vec3(0.0, 0.0, 1.0)));
                
                // Base intensity based on angle
                float intensity = pow(viewDot, 3.0);
                
                // Add pulsating effect
                intensity *= 0.5 + 0.5 * sin(time * pulsateSpeed);
                
                // Incorporate noise for turbulence
                intensity += vNoise * 0.2;
                intensity = clamp(intensity, 0.0, 1.0);
                
                // Apply color and intensity
                vec3 coronaColor = color * intensity;
                
                // Calculate alpha with smooth transition
                float alpha = intensity * alphaMultiplier * (1.0 - length(vNormal));
                
                gl_FragColor = vec4(coronaColor, alpha);
            }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });

    // Create the corona mesh
    const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
    corona.name = 'StarCorona';
    corona.material.uniforms.time.value = 0;

    return corona;
}

/**
 * Creates highly realistic and dynamic solar flares using custom shaders and animated geometries.
 * @param {THREE.Color} color - The base color of the solar flares, derived from the star's temperature.
 * @param {number} numFlares - The number of solar flares to generate.
 * @returns {THREE.Group} A group containing multiple animated solar flare meshes.
 */
function createSolarFlares(color, numFlares = 20) {
    const flareGroup = new THREE.Group();

    for (let i = 0; i < numFlares; i++) {
        const flare = createSingleSolarFlare(color, i, numFlares);
        flareGroup.add(flare);
    }

    return flareGroup;
}



/**
 * Creates a single, highly realistic and dynamic solar flare mesh using custom shaders.
 * @param {THREE.Color} color - The base color of the flare.
 * @param {number} index - The index of the flare for unique variations.
 * @param {number} numFlares - The total number of flares being created.
 * @returns {THREE.Mesh} The animated solar flare mesh.
 */
function createSingleSolarFlare(color, index, numFlares) {
    // Geometry: PlaneGeometry for better control and performance
    const size = 1.0; // Base size of the flare
    const flareGeometry = new THREE.PlaneGeometry(size, size, 32, 32); // Increased segments for smooth vertex displacement

    // Shader Material with advanced features
    const flareMaterial = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: color },                    // Base color
            time: { value: 0 },                         // Time uniform for animations
            turbulenceIntensity: { value: 0.5 },        // Controls turbulence strength
            turbulenceScale: { value: 3.0 },            // Controls turbulence scale
            pulsateSpeed: { value: 2.0 + Math.random() * 1.0 }, // Random pulsate speed
            opacity: { value: 0.6 },                     // Base opacity
            noiseSeed: { value: Math.random() * 100 },   // Seed for noise variation
        },
        vertexShader: `
            varying vec2 vUv;
            varying float vNoise;
            uniform float time;
            uniform float turbulenceIntensity;
            uniform float turbulenceScale;
            uniform float noiseSeed;

            // Simplex Noise Function
            // Source: https://github.com/ashima/webgl-noise
            vec3 mod289(vec3 x) {
              return x - floor(x * (1.0 / 289.0)) * 289.0;
            }

            vec4 mod289(vec4 x) {
              return x - floor(x * (1.0 / 289.0)) * 289.0;
            }

            vec4 permute(vec4 x) {
                 return mod289(((x*34.0)+1.0)*x);
            }

            vec4 taylorInvSqrt(vec4 r)
            {
              return 1.79284291400159 - 0.85373472095314 * r;
            }

            float snoise(vec3 v)
              { 
              const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
              const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

              // First corner
              vec3 i  = floor(v + dot(v, C.yyy) );
              vec3 x0 = v - i + dot(i, C.xxx) ;

              // Other corners
              vec3 g = step(x0.yzx, x0.xyz);
              vec3 l = 1.0 - g;
              vec3 i1 = min( g.xyz, l.zxy );
              vec3 i2 = max( g.xyz, l.zxy );

              //   x0 = x0 - 0.0 + 0.0 * C 
              vec3 x1 = x0 - i1 + C.xxx;
              vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
              vec3 x3 = x0 - D.yyy;      // -1.0 + 3.0*C.x = -0.5 = -D.y

              // Permutations
              i = mod289(i); 
              vec4 p = permute( permute( permute( 
                         i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                       + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                       + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

              // Gradients: 7x7 points over a square, mapped onto an octahedron.
              // The ring size 17*17 = 289 is close to a multiple of 49 (49*6=294)
              float n_ = 1.0/7.0; // N=7
              vec3  ns = n_ * D.wyz - D.xzx;

              vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  // mod(p,7*7)

              vec4 x_ = floor(j * ns.z);
              vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

              vec4 x = x_ *ns.x + ns.yyyy;
              vec4 y = y_ *ns.x + ns.yyyy;
              vec4 h = 1.0 - abs(x) - abs(y);

              vec4 b0 = vec4( x.xy, y.xy );
              vec4 b1 = vec4( x.zw, y.zw );

              vec4 s0 = floor(b0)*2.0 + 1.0;
              vec4 s1 = floor(b1)*2.0 + 1.0;
              vec4 sh = -step(h, vec4(0.0));

              vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
              vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

              vec3 p0 = vec3(a0.xy,h.x);
              vec3 p1 = vec3(a0.zw,h.y);
              vec3 p2 = vec3(a1.xy,h.z);
              vec3 p3 = vec3(a1.zw,h.w);

              // Normalise gradients
              vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
              p0 *= norm.x;
              p1 *= norm.y;
              p2 *= norm.z;
              p3 *= norm.w;

              // Mix contributions from the four corners
              vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), 
                                      dot(x2,x2), dot(x3,x3)), 0.0);
              m = m * m;
              return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                            dot(p2,x2), dot(p3,x3) ) );
              }

            void main() {
                vUv = uv;
                // Apply turbulence using noise
                float noise = snoise(vec3(position.x, position.y, position.z) * turbulenceScale + vec3(time * 0.3, time * 0.3, 0.0)) * turbulenceIntensity;
                vNoise = noise;

                // Displace vertices along the normal based on noise
                vec3 displacedPosition = position + normalize(normal) * noise;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying float vNoise;

            uniform vec3 color;
            uniform float time;
            uniform float pulsateSpeed;
            uniform float opacity;
            uniform float alphaMultiplier;

            void main() {
                // Base color modulation with noise for dynamic effects
                float brightness = sin(time * pulsateSpeed + vNoise * 5.0) * 0.5 + 0.5;
                vec3 flareColor = color * brightness;

                // Alpha based on brightness and noise
                float alpha = brightness * opacity * (1.0 - vUv.y); // Fade towards the bottom

                // Optional: Add a subtle glow
                float glow = smoothstep(0.95, 1.0, brightness);
                alpha += glow * 0.2;

                gl_FragColor = vec4(flareColor, alpha * alphaMultiplier);
            }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
    });

    // Create the flare mesh
    const flareMesh = new THREE.Mesh(flareGeometry, flareMaterial);
    flareMesh.name = `SolarFlare_${index}`;
    
    // Random rotation for each flare to add variety
    flareMesh.rotation.z = Math.random() * Math.PI * 2;
    
    // Position the flare at a unique location around the star
    const angle = (index / numFlares) * Math.PI * 2 + Math.random() * Math.PI * 0.5; // Evenly spaced with some randomness
    const distance = 1.2 + Math.random() * 0.5; // Slightly outside the corona with variation
    flareMesh.position.set(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        (Math.random() - 0.5) * 0.5 // Slight z-axis variation for depth
    );
    
    // Store initial parameters for animation
    flareMesh.userData = {
        baseScale: 1.0 + Math.random() * 0.5, // Varying base scales
        pulsateSpeed: 1.0 + Math.random() * 2.0, // Varying pulsate speeds
        pulsateAmplitude: 0.2 + Math.random() * 0.3, // Varying pulsate amplitudes
    };
    
    return flareMesh;
}



/**
 * Creates coronal mass ejections (CMEs) using a particle system.
 * @param {THREE.Color} color - The base color of the CMEs.
 * @returns {THREE.Points} The CME particle system.
 */
function createCoronalMassEjections(color) {
    const cmeGroup = new THREE.Group();

    // Parameters for CME particles
    const cmeCount = 1000;
    const cmeGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(cmeCount * 3);
    const velocities = new Float32Array(cmeCount * 3);
    const colors = new Float32Array(cmeCount * 3);
    const lifetimes = new Float32Array(cmeCount);
    const ages = new Float32Array(cmeCount);

    for (let i = 0; i < cmeCount; i++) {
        // Initialize positions at the star's location
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;

        // Random velocity vectors pointing outward
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 2.0 + Math.random() * 3.0;
        velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
        velocities[i * 3 + 2] = Math.cos(phi) * speed;

        // Set color based on star's color
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        // Set lifetime for each particle
        lifetimes[i] = 5.0 + Math.random() * 5.0; // Seconds
        ages[i] = 0.0;
    }

    cmeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    cmeGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    cmeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cmeGeometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    cmeGeometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));

    const cmeMaterial = new THREE.PointsMaterial({
        size: 0.05,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const cmeParticles = new THREE.Points(cmeGeometry, cmeMaterial);
    cmeParticles.name = 'CMEs';

    // Animation function for CMEs
    cmeParticles.userData.update = function (deltaTime) {
        const positions = this.geometry.attributes.position.array;
        const velocities = this.geometry.attributes.velocity.array;
        const ages = this.geometry.attributes.age.array;
        const lifetimes = this.geometry.attributes.lifetime.array;

        for (let i = 0; i < cmeCount; i++) {
            const idx = i * 3;
            positions[idx] += velocities[idx] * deltaTime;
            positions[idx + 1] += velocities[idx + 1] * deltaTime;
            positions[idx + 2] += velocities[idx + 2] * deltaTime;

            // Update age
            ages[i] += deltaTime;

            // Fade out particles based on age
            const alpha = 1.0 - (ages[i] / lifetimes[i]);
            this.material.opacity = Math.max(alpha, 0.0);

            // Reset particles that have exceeded their lifetime
            if (ages[i] >= lifetimes[i]) {
                positions[idx] = 0;
                positions[idx + 1] = 0;
                positions[idx + 2] = 0;

                // Reinitialize velocity
                const theta = Math.random() * 2 * Math.PI;
                const phi = Math.acos(2 * Math.random() - 1);
                const speed = 2.0 + Math.random() * 3.0;
                velocities[idx] = Math.sin(phi) * Math.cos(theta) * speed;
                velocities[idx + 1] = Math.sin(phi) * Math.sin(theta) * speed;
                velocities[idx + 2] = Math.cos(phi) * speed;

                // Reset age
                ages[i] = 0.0;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.age.needsUpdate = true;
    };

    cmeGroup.add(cmeParticles);

    return cmeGroup;
}

/**
 * Updates the positions and animations of all lighting elements.
 * @param {object} lighting - Object containing all lighting elements.
 * @param {number} deltaTime - Time elapsed since the last frame (in seconds).
 */
export function updateLightingElements(lighting, deltaTime) {
    if (!lighting) return;

    // Update corona time uniform for pulsating effect
    if (lighting.corona && lighting.corona.material.uniforms.time) {
        lighting.corona.material.uniforms.time.value += deltaTime;
    }

    // Update solar flares pulsating scale and animation
    if (lighting.solarFlares) {
        lighting.solarFlares.children.forEach(flare => {
            // Increment time uniform for individual flare animations if needed
            if (flare.material.uniforms && flare.material.uniforms.time) {
                flare.material.uniforms.time.value += deltaTime;
            }

            // Optionally, adjust scale based on pulsating amplitude and speed
            const scaleFactor = 1 + flare.userData.pulsateAmplitude * Math.sin(lighting.corona.material.uniforms.time.value * flare.userData.pulsateSpeed);
            flare.scale.set(flare.userData.baseScale * scaleFactor, flare.userData.baseScale * scaleFactor, 1);
        });
    }

    // Update CMEs
    if (lighting.cmEs && lighting.cmEs.userData.update) {
        lighting.cmEs.userData.update(deltaTime);
    }

    // Update lens flare positions if needed (e.g., camera movement)
    if (lighting.lensFlare) {
        // Optionally, animate lens flare flicker or movement
    }
}
