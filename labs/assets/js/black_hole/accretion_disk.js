// accretion_disk.js

/**
 * Enhanced Accretion Disk for Black Hole Simulation
 * 
 * This module creates and manages an advanced accretion disk that visualizes
 * swirling matter around the black hole with dynamic motion, color gradients,
 * Doppler shifting, gravitational redshift, and temperature gradients.
 * It integrates seamlessly with the enhanced particle system and gravitational
 * lensing modules.
 * 
 * Dependencies:
 * - THREE.js (imported via main.js as an ES module)
 */

export function createAccretionDisk(scene, camera) {
  // Configuration Parameters
  const DISK_INNER_RADIUS = 4.0;        // Inner radius of the accretion disk
  const DISK_OUTER_RADIUS = 10.0;       // Outer radius of the accretion disk
  const ROTATION_SPEED = 2000;           // Rotation speed of the accretion disk
  const TURBULENCE_SPEED = 5000;         // Speed of turbulence animation
  const COLOR_BASE = new THREE.Color(0xffaa00); // Base color of the disk

  // Create TorusGeometry for the accretion disk to provide thickness
  const geometry = new THREE.TorusGeometry(
    (DISK_INNER_RADIUS + DISK_OUTER_RADIUS) / 2, // Radius
    (DISK_OUTER_RADIUS - DISK_INNER_RADIUS) / 2, // Tube radius (thickness)
    128,                                         // Increased Radial segments for smoother geometry
    400                                         // Increased Tubular segments for smoother geometry
  );

  // Define Shader Material for the Accretion Disk with Enhanced Visuals
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 },
      rotationSpeed: { value: ROTATION_SPEED },
      turbulenceSpeed: { value: TURBULENCE_SPEED },
      colorBase: { value: COLOR_BASE },
      // Removed cameraPosition as it's not used
    },
    vertexShader: `
      uniform float time;
      uniform float rotationSpeed;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vVelocity;

      void main() {
        // Compute rotation angle around Y-axis
        float angle = time * rotationSpeed;
        float s = sin(angle);
        float c = cos(angle);
        mat4 rotation = mat4(
          c, 0.0, s, 0.0,
          0.0, 1.0, 0.0, 0.0,
          -s, 0.0, c, 0.0,
          0.0, 0.0, 0.0, 1.0
        );

        // Apply rotation to vertex position
        vec4 rotatedPosition = rotation * vec4(position, 1.0);
        vPosition = rotatedPosition.xyz;

        // Calculate normal for lighting
        vNormal = normalize(normalMatrix * normal);

        // Calculate view position for Doppler effect
        vec4 mvPosition = modelViewMatrix * rotatedPosition;
        vViewPosition = -mvPosition.xyz;

        // Calculate velocity vector (tangential) for Doppler shift
        // Velocity is perpendicular to the radial vector in the XZ plane
        vec3 velocity = normalize(vec3(rotatedPosition.z, 0.0, -rotatedPosition.x)) * rotationSpeed;
        vVelocity = velocity;

        // Final position
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float turbulenceSpeed;
      uniform float rotationSpeed;
      uniform vec3 colorBase;
      // Removed: uniform vec3 cameraPosition;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vVelocity;

      // Simplex noise function for turbulence
      // Reference: https://github.com/ashima/webgl-noise
      vec3 mod289(vec3 x) {
        return x - floor(x * (1.0 / 289.0)) * 289.0;
      }

      vec4 mod289(vec4 x) {
        return x - floor(x * (1.0 / 289.0)) * 289.0;
      }

      vec4 permute(vec4 x) {
        return mod289(((x*34.0)+1.0)*x);
      }

      vec4 taylorInvSqrt(vec4 r){
        return 1.79284291400159 - 0.85373472095314 * r;
      }

      float snoise(vec3 v){
        const vec2  C = vec2(1.0/6.0, 1.0/3.0);
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

        // First corner
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        // Other corners
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        // x0 = x0 - 0.0 + 0.0 * C
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
        vec3 x3 = x0 - D.yyy;      // -1.0 + 3.0*C.x = -0.5 = -D.y

        // Permutations
        i = mod289(i);
        vec4 p = permute( permute( permute(
                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                 + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                 + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

        // Gradients: 7x7 points over a cube, mapped onto a 1-octant sphere
        float n_ = 1.0/7.0; // N=7
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,7*7)

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
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                      dot(p2,x2), dot(p3,x3) ) );
      }

      void main() {
        // Calculate UV coordinates based on position
        vec2 uv = vPosition.xz / 10.0 + 0.5; // Normalize position within the torus

        // Distance from center
        float r = length(uv - 0.5);

        // Define disk boundaries with smooth transitions
        float innerEdge = 0.4;
        float outerEdge = 0.5;
        float disk = smoothstep(innerEdge, innerEdge + 0.02, r) - smoothstep(outerEdge, outerEdge + 0.02, r);

        // Turbulence using simplex noise
        float turbulence = snoise(vec3(vPosition.x * 0.05, vPosition.z * 0.05, time * turbulenceSpeed));

        // Temperature Gradient: hotter closer to the black hole
        float temperature = mix(0.6, 1.0, 1.0 - r); // Normalize temperature based on radius

        // Doppler Shifting
        float dopplerFactor = dot(normalize(vViewPosition), normalize(vVelocity));
        float dopplerShift = dopplerFactor * 0.2; // Increased factor for noticeable effect

        // Gravitational Redshift
        float gravitationalShift = 1.0 - (r - innerEdge) / (outerEdge - innerEdge); // Normalize based on radius
        gravitationalShift = clamp(gravitationalShift, 0.0, 1.0); // Ensure within [0,1]

        // Combined Shift
        float totalShift = dopplerShift + gravitationalShift;

        // Color gradient based on temperature and turbulence
        vec3 temperatureColor = mix(vec3(1.0, 0.0, 0.0), colorBase, temperature);
        vec3 color = temperatureColor * (0.5 + 0.5 * turbulence);

        // Apply Doppler and Gravitational Shifts
        color *= clamp(totalShift, 0.8, 1.2); // Clamp to prevent overflow and maintain realism

        // Apply basic lighting based on normal
        float lighting = dot(normalize(vNormal), normalize(vec3(0.0, 1.0, 0.0))) * 0.5 + 0.5;
        color *= lighting;

        // Final color with disk mask
        gl_FragColor = vec4(color * disk, disk);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, // Ensure disk is visible from both sides
  });

  const accretionDisk = new THREE.Mesh(geometry, material);
  accretionDisk.rotation.x = -Math.PI / 2; // Lay flat on the XZ plane
  scene.add(accretionDisk);

  /**
   * Update function for the accretion disk.
   * @param {number} delta - Time elapsed since last frame (in seconds).
   */
  function updateAccretionDisk(delta) {
    material.uniforms.time.value += delta;

    // If you decide to use cameraPosition in the future, ensure it's updated here
    // material.uniforms.cameraPosition.value.copy(camera.position);
  }

  return updateAccretionDisk;
}
