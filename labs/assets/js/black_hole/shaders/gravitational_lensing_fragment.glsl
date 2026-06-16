uniform samplerCube skybox;
uniform float time;
uniform vec3 blackHolePosition;
uniform float blackHoleRadius;
uniform float eventHorizonRadius;
uniform float gravitationalConstant;

varying vec3 vWorldPosition;

const float PI = 3.14159265359;

// Function to rotate a vector around an axis by an angle
mat3 rotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat3(
        oc * axis.x * axis.x + c,        oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,        oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c
    );
}

void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    vec3 toBlackHole = normalize(blackHolePosition - cameraPosition);
    float distanceToBlackHole = length(blackHolePosition - vWorldPosition);

    // Calculate gravitational lensing strength based on distance
    float lensStrength = 1.0 - smoothstep(eventHorizonRadius, eventHorizonRadius * 2.5, distanceToBlackHole);
    lensStrength = clamp(lensStrength, 0.0, 1.0);

    // Calculate bending angle using a simplified gravitational lensing formula
    float bendAngle = lensStrength * (PI / 3.0); // Adjust the multiplier for desired bending effect

    // Determine rotation axis
    vec3 rotationAxis = normalize(cross(direction, toBlackHole));
    if (length(rotationAxis) < 0.0001) {
        rotationAxis = vec3(0.0, 1.0, 0.0); // Default axis if vectors are parallel
    }

    // Apply rotation to direction vector
    mat3 rotMat = rotationMatrix(rotationAxis, bendAngle);
    vec3 bentDirection = rotMat * direction;

    // Introduce dynamic distortions (e.g., gravitational waves)
    float distortion = sin(time * 2.0 + length(bentDirection) * 10.0) * 0.01;
    bentDirection.xy += distortion;

    // Fetch color from skybox based on bent direction
    vec4 color = textureCube(skybox, bentDirection);

    // Apply Doppler effect based on the angle between direction and toBlackHole
    float dopplerFactor = 1.0 + dot(direction, toBlackHole) * 0.3;
    color.rgb *= dopplerFactor;

    // Darken the regions near the event horizon to simulate light trapping
    float darkness = smoothstep(eventHorizonRadius * 0.95, eventHorizonRadius, distanceToBlackHole);
    color.rgb *= darkness;

    gl_FragColor = color;
}
