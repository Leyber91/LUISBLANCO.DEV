import Stats from 'https://cdnjs.cloudflare.com/ajax/libs/stats.js/r17/Stats.min.js';

// Initialize Stats
const stats = new Stats();
document.body.appendChild(stats.dom);

// Update Stats in Animation Loop
function animate() {
  stats.begin();

  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  if (isAnimating) {
    parentObject.rotation.x += speed * delta;
    parentObject.rotation.y += speed * delta;
  }

  parentObject.scale.set(scale, scale, scale);

  updateAccretionDisk(delta);
  updateLensing(delta);
  updateParticles(delta);

  controls.update();
  renderer.render(scene, camera);

  stats.end();
}

animate();
