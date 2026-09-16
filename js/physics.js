// PHYSICS LAB DELUXE - 3D物理エンジン(Cannon.js)を2D表示に橋渡しするコア
const Physics = (() => {
  const world = new CANNON.World();
  world.solver.iterations = 30;
  world.solver.tolerance = 0.001;
  world.gravity.set(0, -9.82, 0);

  const matDefault = new CANNON.Material("default");
  const matGround = new CANNON.Material("ground");
  world.addContactMaterial(new CANNON.ContactMaterial(matDefault, matGround, {
    friction: 0.3, restitution: 0.4,
  }));
  world.addContactMaterial(new CANNON.ContactMaterial(matDefault, matDefault, {
    friction: 0.2, restitution: 0.6,
  }));

  let linked = [];   // {body, mesh, trail, trailColor, pickable, ...extra}
  let rods = [];     // 剛体棒(直線)の見た目 {a, b, line}
  let springs = [];  // バネのジグザグ見た目 {a, b, line, N}
  let decor = [];    // 物理を持たない飾りメッシュ(水面・発射台など)
  let extraForces = []; // fn(dt) 毎ステップ呼ばれるカスタム力
  let stepHook = null;  // fn(dt) 1描画フレームごとに呼ばれる(掃除処理など)

  // このcannon.jsビルドにlinearFactor/angularFactorは無いため、
  // 毎ステップ後にZ位置・Z速度・XY角速度を0に矯正して平面(2D)に拘束する(planarizeは印だけ)
  function planarize(body) { body.__planar = true; }

  function clampPlanar() {
    for (const e of linked) {
      const b = e.body;
      if (!b.__planar) continue;
      b.position.z = 0;
      b.velocity.z = 0;
      b.angularVelocity.x = 0;
      b.angularVelocity.y = 0;
    }
  }

  function addBody(body, mesh, opts = {}) {
    world.addBody(body);
    if (mesh) Render.scene.add(mesh);
    const entry = Object.assign(
      { body, mesh, trail: opts.trail ? [] : null, trailColor: opts.trailColor || "#ffffff", pickable: opts.pickable !== false },
      opts.extra || {}
    );
    linked.push(entry);
    return entry;
  }

  function removeBody(entry) {
    world.removeBody(entry.body);
    if (entry.mesh) Render.scene.remove(entry.mesh);
    const i = linked.indexOf(entry);
    if (i >= 0) linked.splice(i, 1);
  }

  function addRod(a, b, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineBasicMaterial({ color: color || 0x8a8f98 });
    const line = new THREE.Line(geo, mat);
    Render.scene.add(line);
    const entry = { a, b, line };
    rods.push(entry);
    return entry;
  }

  function addSpringVisual(a, b, color) {
    const N = 14;
    const positions = new Float32Array((N + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: color || 0xffcf4d });
    const line = new THREE.Line(geo, mat);
    Render.scene.add(line);
    const entry = { a, b, line, N };
    springs.push(entry);
    return entry;
  }

  function addDecor(mesh) {
    Render.scene.add(mesh);
    decor.push(mesh);
    return mesh;
  }

  function clearAll() {
    for (let i = linked.length - 1; i >= 0; i--) removeBody(linked[i]);
    for (let i = world.constraints.length - 1; i >= 0; i--) world.removeConstraint(world.constraints[i]);
    for (const r of rods) Render.scene.remove(r.line);
    for (const s of springs) Render.scene.remove(s.line);
    for (const d of decor) Render.scene.remove(d);
    rods = [];
    springs = [];
    decor = [];
    extraForces = [];
    stepHook = null;
  }

  function addConstraint(c) { world.addConstraint(c); return c; }
  function onForce(fn) { extraForces.push(fn); }
  function onStep(fn) { stepHook = fn; }

  function updateLineHelpers() {
    for (const r of rods) {
      const pos = r.line.geometry.attributes.position;
      pos.setXYZ(0, r.a.position.x, r.a.position.y, r.a.position.z);
      pos.setXYZ(1, r.b.position.x, r.b.position.y, r.b.position.z);
      pos.needsUpdate = true;
    }
    for (const s of springs) {
      const pa = s.a.position, pb = s.b.position;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 0.0001;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux; // 進行方向に垂直なベクトル
      const amp = 0.16;
      const pos = s.line.geometry.attributes.position;
      for (let i = 0; i <= s.N; i++) {
        const t = i / s.N;
        let ox = 0, oy = 0;
        if (i > 0 && i < s.N) {
          const dir = (i % 2 === 0) ? 1 : -1;
          ox = px * amp * dir;
          oy = py * amp * dir;
        }
        pos.setXYZ(i, pa.x + dx * t + ox, pa.y + dy * t + oy, 0);
      }
      pos.needsUpdate = true;
    }
  }

  const FIXED_DT = 1 / 60;
  let accumulator = 0;

  function step(dt, timeScale) {
    accumulator += dt * timeScale;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 6) {
      for (const f of extraForces) f(FIXED_DT);
      world.step(FIXED_DT);
      clampPlanar();
      accumulator -= FIXED_DT;
      steps++;
    }
    for (const e of linked) {
      if (e.mesh) {
        e.mesh.position.set(e.body.position.x, e.body.position.y, e.body.position.z);
        e.mesh.quaternion.set(e.body.quaternion.x, e.body.quaternion.y, e.body.quaternion.z, e.body.quaternion.w);
      }
      if (e.trail) {
        e.trail.push({ x: e.body.position.x, y: e.body.position.y });
        if (e.trail.length > 500) e.trail.shift();
      }
    }
    updateLineHelpers();
    if (stepHook) stepHook(dt * timeScale);
  }

  return {
    world, matDefault, matGround,
    get linked() { return linked; },
    planarize, addBody, removeBody, addRod, addSpringVisual, addDecor, clearAll, addConstraint,
    onForce, onStep, step,
  };
})();
