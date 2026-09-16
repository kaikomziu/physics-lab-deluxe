// PHYSICS LAB DELUXE - Three.js側(見た目は2D固定のオルソグラフィックカメラ)
const Render = (() => {
  const scene = new THREE.Scene();
  let camera, renderer, viewH = 11, viewW = 11;
  let container, canvas;

  function init(el) {
    container = el;
    const aspect = el.clientWidth / el.clientHeight;
    viewW = viewH * aspect;
    camera = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    canvas = renderer.domElement;

    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x30261c, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.05);
    sun.position.set(-6, 10, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(5, -3, 8);
    scene.add(fill);

    window.addEventListener("resize", resize);
    resize();
  }

  function resize() {
    if (!container || !camera || !renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    const aspect = w / h;
    viewW = viewH * aspect;
    camera.left = -viewW / 2; camera.right = viewW / 2;
    camera.top = viewH / 2; camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const x = camera.left + nx * (camera.right - camera.left);
    const y = camera.top - ny * (camera.top - camera.bottom);
    return { x, y };
  }

  function worldToScreen(x, y) {
    const rect = canvas.getBoundingClientRect();
    const nx = (x - camera.left) / (camera.right - camera.left);
    const ny = (camera.top - y) / (camera.top - camera.bottom);
    return { x: rect.left + nx * rect.width, y: rect.top + ny * rect.height, px: nx * rect.width, py: ny * rect.height };
  }

  function render() { renderer.render(scene, camera); }

  return {
    scene,
    get camera() { return camera; },
    get canvas() { return canvas; },
    get viewW() { return viewW; },
    get viewH() { return viewH; },
    init, resize, screenToWorld, worldToScreen, render,
  };
})();
