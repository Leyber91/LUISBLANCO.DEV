// File: assets/js/exomania/controls.js

export function setupControls(camera, domElement, planetMesh) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraPosition = { x: 0, y: 0, z: 0 };
    let zoomLevel = 1;
    const MAX_ZOOM = 10;
    const MIN_ZOOM = 0.1;
  
    // Event Listeners
    domElement.addEventListener('mousedown', onMouseDown, false);
    domElement.addEventListener('mousemove', onMouseMove, false);
    domElement.addEventListener('mouseup', onMouseUp, false);
    domElement.addEventListener('wheel', onMouseWheel, { passive: false });
  
    // Touch Event Listeners for Mobile Support
    domElement.addEventListener('touchstart', onTouchStart, false);
    domElement.addEventListener('touchmove', onTouchMove, false);
    domElement.addEventListener('touchend', onMouseUp, false);
  
    function onMouseDown(event) {
      isDragging = true;
      previousMousePosition = {
        x: event.clientX,
        y: event.clientY,
      };
    }
  
    function onMouseMove(event) {
      if (isDragging) {
        const deltaMove = {
          x: event.clientX - previousMousePosition.x,
          y: event.clientY - previousMousePosition.y,
        };
  
        if (event.buttons === 1) { // Left mouse button: rotate planet
          if (planetMesh) {
            const rotationSpeed = 0.002;
            planetMesh.rotation.y += deltaMove.x * rotationSpeed;
            planetMesh.rotation.x += deltaMove.y * rotationSpeed;
          }
        } else if (event.buttons === 2) { // Right mouse button: move camera
          const moveSpeed = 0.005;
          camera.position.x -= deltaMove.x * moveSpeed * zoomLevel;
          camera.position.y += deltaMove.y * moveSpeed * zoomLevel;
        }
  
        previousMousePosition = {
          x: event.clientX,
          y: event.clientY,
        };
      }
    }
  
    function onMouseUp(event) {
      isDragging = false;
    }
  
    function onMouseWheel(event) {
      event.preventDefault();
      const zoomSensitivity = 0.01; // Increased from 0.0005 to 0.001 for faster zoom
      const zoomDelta = Math.sign(event.deltaY) * zoomSensitivity; // Removed negative sign to correct direction
      
      zoomLevel *= (1 - zoomDelta); // Changed addition to subtraction to invert zoom direction
      zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));
      
      const zoomFactor = 1 - zoomDelta; // Changed addition to subtraction to match zoom direction
      camera.position.multiplyScalar(zoomFactor);
    }
  
    // Touch Handlers
    function onTouchStart(event) {
      if (event.touches.length === 1) {
        isDragging = true;
        previousMousePosition = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      } else if (event.touches.length === 2) {
        // Initialize pinch-to-zoom
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        previousTouchDistance = Math.hypot(
          touch1.clientX - touch2.clientX,
          touch1.clientY - touch2.clientY
        );
      }
    }
  
    function onTouchMove(event) {
      if (isDragging && planetMesh && event.touches.length === 1) {
        const deltaMove = {
          x: event.touches[0].clientX - previousMousePosition.x,
          y: event.touches[0].clientY - previousMousePosition.y,
        };
  
        const rotationSpeed = 0.002;
        planetMesh.rotation.y += deltaMove.x * rotationSpeed;
        planetMesh.rotation.x += deltaMove.y * rotationSpeed;
  
        previousMousePosition = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      } else if (event.touches.length === 2) {
        // Handle pinch-to-zoom
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentTouchDistance = Math.hypot(
          touch1.clientX - touch2.clientX,
          touch1.clientY - touch2.clientY
        );
        
        const zoomDelta = (currentTouchDistance - previousTouchDistance) * 0.02; // Increased from 0.01 to 0.02 for faster zoom
        zoomLevel *= (1 - zoomDelta); // Changed addition to subtraction to match mouse wheel zoom direction
        zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));
        
        const zoomFactor = 1 - zoomDelta; // Changed addition to subtraction to match zoom direction
        camera.position.multiplyScalar(zoomFactor);
        
        previousTouchDistance = currentTouchDistance;
      }
    }
  
    // Prevent context menu from appearing on right-click
    domElement.addEventListener('contextmenu', (event) => event.preventDefault());
  
    // Return an object with methods to manipulate the controls externally
    return {
      setZoomLevel: (newZoomLevel) => {
        zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoomLevel));
        camera.position.setLength(zoomLevel * camera.position.length());
      },
      getZoomLevel: () => zoomLevel,
      resetView: () => {
        zoomLevel = 1;
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        if (planetMesh) {
          planetMesh.rotation.set(0, 0, 0);
        }
      }
    };
  }