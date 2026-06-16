// New File: assets/js/exomania/spaceshipWindow.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function createSpaceshipWindow(scene, camera, renderer) {
  // Create a semi-transparent window frame
  const windowGeometry = new THREE.PlaneGeometry(4, 2.5);
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
    opacity: 0.5,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
  windowMesh.position.set(0, 0, -5); // Position it in front of the camera
  camera.add(windowMesh);
  scene.add(camera);
  
  return windowMesh;
}