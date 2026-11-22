/* ============================================================
   orthogonal/artifact3d.js: one artifact, drawn live from its
   parts tree with three.js r128 (the global THREE and OrbitControls
   from the script tags orthogonal-catalog.html carries; the same
   two files, the same versions, as md_animation_page.html).

   A working version, not the final look: one primitive for each of
   the fifteen kinds, fills and ink edges in the plate's ladder (each
   material is a place on the ladder, never a colour), fog, and
   blue-white glow on the parts that emit. Gold is the selection and
   nothing else: a press on a part (not a drag) turns its edges gold
   and names it.

   Drag, touch or the arrow keys (with the drawing focused) turn it.
   It turns slowly at rest and holds still under reduced motion, then
   draws only when something changes. The lifecycle is Labs OS's
   mountScene (os/scene.js): paused while the tab is hidden or the
   drawing is off screen, destroyed before another mounts. With no
   WebGL the parts show as a list.
   ============================================================ */
import { mountScene } from '../os/scene.js';
import { boundsOf, partLine } from './catalog-model.js';

const FIT = 5;                       // the artifact is scaled to a sphere of this radius, whatever its size in metres
const DIST = 16;                     // camera distance from the centre
const FOG_DENSITY = 0.028;
const REST_MS = 4000;                // how long after a touch before it turns again
const SPIN = 0.8;                    // OrbitControls autoRotateSpeed, about 45 s a turn
const KEY_STEP = 0.14;               // radians a key turns it

/* The ink ladder (tokens.css): each material takes a place on it and an opacity for its fill. */
const INK = {
  bright: 0xEAF0FB, text: 0xC5CCD8, horizon: 0x9FB3D6, dim: 0x79828F, deep: 0x565D72,
  fill: [0x0B0E13, 0x11161F, 0x18202B],
};
const MATERIAL = {
  glass:   { edge: INK.horizon, fill: INK.fill[1], opacity: 0.35 },
  ceramic: { edge: INK.bright,  fill: INK.fill[2], opacity: 1 },
  wood:    { edge: INK.dim,     fill: INK.fill[1], opacity: 1 },
  bronze:  { edge: INK.text,    fill: INK.fill[2], opacity: 1 },
  stone:   { edge: INK.deep,    fill: INK.fill[0], opacity: 1 },
  fabric:  { edge: INK.horizon, fill: INK.fill[0], opacity: 0.7 },
  bone:    { edge: INK.bright,  fill: INK.fill[1], opacity: 1 },
  living:  { edge: INK.text,    fill: INK.fill[0], opacity: 0.85 },
};
const GLOW = 0xCFE0FF;               // the plate's blue-white

const prefersReduced = () => { try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const cssColor = (name, fallback) => {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch { return fallback; }
};

/* ---------- the fifteen primitives: [{ geo, pos?, rot? }] in the part's own frame, size [w, h, d] metres ---------- */
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const scaled = (geo, w, h, d) => { geo.scale(w, h, d); return geo; };

const PRIMITIVES = {
  column: ([w, h, d]) => [{ geo: scaled(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), w, h, d) }],
  plinth: ([w, h, d]) => [
    { geo: box(w, h * 0.6, d), pos: [0, -h * 0.2, 0] },
    { geo: box(w * 0.7, h * 0.4, d * 0.7), pos: [0, h * 0.3, 0] },
  ],
  box: ([w, h, d]) => [{ geo: box(w, h, d) }],
  vessel: ([w, h, d]) => {
    const prof = [[0.001, -0.5], [0.3, -0.5], [0.42, -0.3], [0.5, 0], [0.4, 0.3], [0.24, 0.42], [0.3, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
    return [{ geo: scaled(new THREE.LatheGeometry(prof, 16), w * 2, h, d * 2) }];
  },
  mast: ([w, h, d]) => [{ geo: scaled(new THREE.CylinderGeometry(0.22, 0.5, 1, 12), w, h, d) }],
  mirror: ([w, h, d]) => [{ geo: box(w, h, Math.min(d, Math.max(w, h) * 0.03)) }],
  disc: ([w, h, d]) => [{ geo: scaled(new THREE.CylinderGeometry(0.5, 0.5, 1, 20), w, h, d) }],
  wing: ([w, h, d]) => {
    const geo = box(w, Math.min(h, Math.max(w, d) * 0.06), d);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getX(i) > 0) p.setZ(i, p.getZ(i) * 0.45);   // the tip is narrower than the root
    p.needsUpdate = true;
    return [{ geo }];
  },
  sphere: ([w, h, d]) => [{ geo: scaled(new THREE.SphereGeometry(0.5, 14, 9), w, h, d) }],
  gimbal: ([w, h, d]) => {
    const ring = (k, rot) => ({ geo: scaled(new THREE.TorusGeometry(0.5, 0.03, 5, 28), w * k, h * k, Math.min(w, h) * k), rot });
    return [ring(1, [0, 0, 0]), ring(0.82, [90, 0, 0]), ring(0.64, [0, 90, 0])];
  },
  rotor: ([w, h, d]) => {
    const len = Math.max(w, d) / 2;
    const blades = [0, 90, 180, 270].map((a) => ({ geo: box(len, h, len * 0.14), pos: [Math.cos(a * Math.PI / 180) * len / 2, 0, -Math.sin(a * Math.PI / 180) * len / 2], rot: [0, a, 0] }));
    return [{ geo: scaled(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), len * 0.3, h * 1.6, len * 0.3) }, ...blades];
  },
  shutter: ([w, h, d]) => Array.from({ length: 6 }, (_, i) => ({ geo: box(w, h / 6 * 0.55, d), pos: [0, -h / 2 + h * (i + 0.5) / 6, 0], rot: [28, 0, 0] })),
  dial: ([w, h, d]) => [
    { geo: scaled(new THREE.CylinderGeometry(0.5, 0.5, 1, 24), Math.min(w, h), d, Math.min(w, h)), rot: [90, 0, 0] },
    { geo: box(Math.min(w, h) * 0.04, Math.min(w, h) * 0.4, d * 0.2), pos: [0, Math.min(w, h) * 0.2, d * 0.55], rot: [0, 0, -35], solid: true },
  ],
  pipe: ([w, h, d]) => {
    const s = [w, h, d], ia = s.indexOf(Math.max(w, h, d));
    const others = s.filter((_, i) => i !== ia), r = (others[0] + others[1]) / 2;
    const geo = scaled(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), r, s[ia], r);
    return [{ geo, rot: ia === 0 ? [0, 0, 90] : ia === 2 ? [90, 0, 0] : [0, 0, 0] }];
  },
  lattice: ([w, h, d]) => {
    const t = Math.max(w, h, d) * 0.025, out = [];
    const bar = (sx, sy, sz, x, y, z, rot) => out.push({ geo: box(sx, sy, sz), pos: [x, y, z], rot: rot || [0, 0, 0], solid: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(t, h, t, sx * w / 2, 0, sz * d / 2);            // four uprights
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) bar(w, t, t, 0, sy * h / 2, sz * d / 2);            // eight rails
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) bar(t, t, d, sx * w / 2, sy * h / 2, 0);
    for (const sz of [-1, 1]) {                                                                              // braces on two faces
      const a = Math.atan2(h, w) * 180 / Math.PI;
      bar(Math.hypot(w, h), t, t, 0, 0, sz * d / 2, [0, 0, a]);
      bar(Math.hypot(w, h), t, t, 0, 0, sz * d / 2, [0, 0, -a]);
    }
    bar(w, t, t, 0, 0, 0); bar(t, h, t, 0, 0, 0);
    return out;
  },
};

let haloTexture = null;
function halo() {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(207,224,255,0.9)'); grad.addColorStop(0.35, 'rgba(159,179,214,0.35)'); grad.addColorStop(1, 'rgba(159,179,214,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  haloTexture = new THREE.CanvasTexture(c);
  return haloTexture;
}

/* The group of one part: its primitives, their ink edges, and a halo if it emits. */
function buildPart(part, index, scale, bag) {
  const group = new THREE.Group();
  const m = MATERIAL[part.material], emit = part.emits;
  const edge = new THREE.LineBasicMaterial({ color: emit ? INK.bright : m.edge, transparent: true });
  const fill = new THREE.MeshBasicMaterial({ color: emit ? GLOW : m.fill, transparent: m.opacity < 1 || emit, opacity: emit ? 0.55 : m.opacity, side: THREE.DoubleSide });
  const solid = new THREE.MeshBasicMaterial({ color: emit ? GLOW : m.edge });
  bag.mats.push(edge, fill, solid);
  for (const prim of PRIMITIVES[part.kind](part.size)) {
    const g = new THREE.Group();
    if (prim.pos) g.position.set(...prim.pos);
    if (prim.rot) g.rotation.set(...prim.rot.map((a) => a * Math.PI / 180));
    const mesh = new THREE.Mesh(prim.geo, prim.solid ? solid : fill);
    mesh.userData.part = index;
    g.add(mesh);
    if (!prim.solid) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(prim.geo, 15), edge));
    group.add(g);
    bag.geos.push(prim.geo);
  }
  group.position.set(...part.at);
  group.rotation.set(...part.rot.map((a) => a * Math.PI / 180));
  const wrap = new THREE.Group();
  wrap.add(group);
  if (emit) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.8 }));
    const r = Math.max(...part.size) * 1.1;
    sp.scale.set(r, r, 1);
    sp.position.set(...part.at);
    wrap.add(sp);
    bag.mats.push(sp.material);
  }
  return { wrap, edge, solid };
}

/**
 * Mount an artifact view in `host` (a box CSS sizes, positioned). Returns
 * { setTree(tree), select(i), rotate(dAzimuth, dPolar), canvas, webgl, destroy() }.
 * onSelect(i | null, part | null) is called when the selection changes.
 */
export function createArtifactView(host, { onSelect = () => {}, reduced = prefersReduced() } = {}) {
  let tree = null, selected = null, webgl = false, api = null;
  const list = document.createElement('ol');
  list.className = 'parts-text';
  list.hidden = true;
  host.append(list);

  const writeList = () => {
    list.replaceChildren(...(tree ? tree.parts : []).map((p, i) => { const li = document.createElement('li'); li.textContent = partLine(p); li.dataset.part = String(i); return li; }));
  };

  const noGL = () => {
    list.hidden = false;
    api = {
      webgl: false, canvas: null,
      setTree(t) { tree = t; selected = null; writeList(); },
      select() {}, rotate() {}, destroy() { list.remove(); },
    };
    return api;
  };

  if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined') return noGL();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch (err) {
    return noGL();
  }
  webgl = true;
  const bg = new THREE.Color(cssColor('--void', '#06080D'));
  renderer.setClearColor(bg, 1);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const canvas = renderer.domElement;
  canvas.className = 'artifact-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const scene = new THREE.Scene();
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, FOG_DENSITY);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 200);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.08;
  controls.minDistance = 9; controls.maxDistance = 38;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = SPIN;
  const home = new THREE.Spherical(DIST, Math.PI / 2 - 0.38, 0.6);
  camera.position.setFromSpherical(home);
  controls.update();

  const root = new THREE.Group();
  scene.add(root);
  let bag = { mats: [], geos: [] }, edges = [], meshes = [];
  const gold = new THREE.Color(cssColor('--accretion', '#D4A24C'));

  let running = true, raf = 0, dirty = true, restTimer = 0;
  const draw = () => { dirty = false; controls.update(); renderer.render(scene, camera); };
  const frame = () => { raf = 0; if (!running) return; draw(); if (!reduced) raf = requestAnimationFrame(frame); };
  const kick = () => { dirty = true; if (running && !raf) raf = requestAnimationFrame(frame); };
  controls.addEventListener('change', () => { dirty = true; if (reduced) kick(); });
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(restTimer); });
  controls.addEventListener('end', () => { clearTimeout(restTimer); if (!reduced) restTimer = setTimeout(() => { controls.autoRotate = true; }, REST_MS); });

  const clear = () => {
    root.clear();
    bag.geos.forEach((g) => g.dispose()); bag.mats.forEach((m) => m.dispose());
    bag = { mats: [], geos: [] }; edges = []; meshes = []; selected = null;
  };

  const paintSelection = () => {
    edges.forEach((e, i) => {
      const hit = i === selected, p = tree.parts[i];
      const base = p.emits ? INK.bright : MATERIAL[p.material].edge;
      e.edge.color.set(hit ? gold : base);
      e.solid.color.set(hit ? gold : (p.emits ? GLOW : MATERIAL[p.material].edge));   // a lattice's bars are solid ink, not edges
    });
    kick();
  };
  const select = (i) => {
    selected = i == null || i < 0 || !tree || i >= tree.parts.length ? null : i;
    if (tree) paintSelection();
    onSelect(selected, selected == null ? null : tree.parts[selected]);
  };

  const setTree = (t) => {
    tree = t; clear(); writeList();
    const { center, radius } = boundsOf(t.parts), s = FIT / radius;
    root.scale.setScalar(s);
    root.position.set(-center[0] * s, -center[1] * s, -center[2] * s);
    t.parts.forEach((p, i) => {
      const { wrap, edge, solid } = buildPart(p, i, s, bag);
      root.add(wrap); edges.push({ edge, solid });
    });
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    camera.position.setFromSpherical(home);
    controls.target.set(0, 0, 0);
    controls.update();
    onSelect(null, null);
    kick();
  };

  const rotate = (dAz, dPol) => {
    const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += dAz;
    sph.phi = Math.min(Math.PI - 0.1, Math.max(0.1, sph.phi + dPol));
    camera.position.copy(controls.target).add(off.setFromSpherical(sph));
    camera.lookAt(controls.target);
    controls.autoRotate = false;
    clearTimeout(restTimer);
    if (!reduced) restTimer = setTimeout(() => { controls.autoRotate = true; }, REST_MS);
    kick();
  };

  /* a press that did not move selects the part under it, or clears the selection */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes, false)[0];
    select(hit ? hit.object.userData.part : null);
  });
  host.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[e.key];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    rotate(k[0], k[1]);
  });

  const size = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    kick();
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  ro?.observe(host);
  size();

  /* the platform's lifecycle: pause while hidden or off screen, one scene on this host at a time */
  const mount = mountScene(host, () => ({
    destroy() {
      running = false; cancelAnimationFrame(raf); clearTimeout(restTimer); ro?.disconnect();
      controls.dispose(); clear();
      renderer.dispose(); renderer.forceContextLoss?.();
      canvas.remove(); list.remove();
    },
    pause() { running = false; cancelAnimationFrame(raf); raf = 0; },
    resume() { running = true; kick(); },
  }), { reducedMotion: reduced });

  api = {
    webgl, canvas, setTree, select, rotate,
    get selected() { return selected; },
    destroy() { mount.destroy(); },
  };
  return api;
}
