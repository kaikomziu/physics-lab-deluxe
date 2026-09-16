// PHYSICS LAB DELUXE - 9つの物理法則モード定義
const COLORS = ["#ff6b6b", "#4dd2ff", "#ffd166", "#8ee38a", "#c792ea", "#ff9f6b", "#6bffcf", "#ff6bd6"];

function stdMat(color, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.45, metalness: 0.12 }, extra || {}));
}
function sphereMesh(r, color, extra) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), stdMat(color, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function boxMesh(sx, sy, sz, color, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), stdMat(color, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sphereBody(mass, r, pos, material) {
  const b = new CANNON.Body({ mass, shape: new CANNON.Sphere(r), position: new CANNON.Vec3(pos.x, pos.y, pos.z || 0), material: material || Physics.matDefault });
  b.linearDamping = 0.01;
  Physics.planarize(b);
  return b;
}
function boxBody(mass, hx, hy, hz, pos, angle, material) {
  const b = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), position: new CANNON.Vec3(pos.x, pos.y, pos.z || 0), material: material || Physics.matDefault });
  b.linearDamping = 0.01;
  Physics.planarize(b);
  if (angle) b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), angle);
  return b;
}
function staticBody(shape, pos, angle, material) {
  const b = new CANNON.Body({ mass: 0, shape, position: new CANNON.Vec3(pos.x, pos.y, pos.z || 0), material: material || Physics.matGround });
  if (angle) b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), angle);
  return b;
}
function addGround(y) {
  y = y === undefined ? -4.7 : y;
  const halfW = 9;
  const body = staticBody(new CANNON.Box(new CANNON.Vec3(halfW, 0.3, 1.6)), { x: 0, y });
  const mesh = boxMesh(halfW * 2, 0.6, 1.6, 0x6b8f4e);
  mesh.position.set(0, y, 0);
  return Physics.addBody(body, mesh, { pickable: false });
}
function randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

const Modes = [];

// ---------------- 1. 二重振り子 ----------------
Modes.push({
  id: "pendulum2",
  name: "二重振り子",
  formula: "θ₁, θ₂ の運動方程式は非線形で、初期値のわずかな差が指数的に拡大する(カオス)",
  desc: "2本の腕で繋がった振り子。角度をほんの少しだけずらした複製を並べて放つと、数秒後には全く違う動きになる。ドラッグしておもりをつまみ、離すと実際にその速度で振れる。",
  values: { count: 3, len1: 2.0, len2: 2.0, mass: 1.3, gravity: 9.82 },
  controls: [
    { key: "count", label: "振り子の数", min: 1, max: 6, step: 1, rebuild: true },
    { key: "len1", label: "腕の長さ①", min: 0.8, max: 3, step: 0.1, rebuild: true },
    { key: "len2", label: "腕の長さ②", min: 0.8, max: 3, step: 0.1, rebuild: true },
    { key: "mass", label: "おもりの重さ", min: 0.4, max: 4, step: 0.1, rebuild: true },
    { key: "gravity", label: "重力の強さ", min: 1, max: 25, step: 0.5, apply: (m, v) => { Physics.world.gravity.set(0, -v, 0); } },
  ],
  buttons: [{ label: "初期角度に戻す", action: (m) => window.PhysApp.loadMode(m) }],
  trails: true,
  setup(mode) {
    const v = mode.values;
    Physics.world.gravity.set(0, -v.gravity, 0);
    const anchorPos = { x: 0, y: 4 };
    const anchor = staticBody(new CANNON.Sphere(0.06), anchorPos);
    Physics.addBody(anchor, sphereMesh(0.09, 0x333333), { pickable: false });
    for (let i = 0; i < v.count; i++) {
      const off = i * 0.045;
      const color = COLORS[i % COLORS.length];
      const th1 = Math.PI * 0.62 + off;
      const th2 = Math.PI * 0.5 + off * 1.4;
      const p1 = { x: anchorPos.x + v.len1 * Math.sin(th1), y: anchorPos.y - v.len1 * Math.cos(th1) };
      const p2 = { x: p1.x + v.len2 * Math.sin(th2), y: p1.y - v.len2 * Math.cos(th2) };
      const b1 = sphereBody(v.mass, 0.34, p1);
      const b2 = sphereBody(v.mass * 0.85, 0.3, p2);
      Physics.addConstraint(new CANNON.DistanceConstraint(anchor, b1, v.len1));
      Physics.addConstraint(new CANNON.DistanceConstraint(b1, b2, v.len2));
      const e1 = Physics.addBody(b1, sphereMesh(0.34, color));
      const e2 = Physics.addBody(b2, sphereMesh(0.3, color), { trail: true, trailColor: color });
      Physics.addRod(anchor, b1, color);
      Physics.addRod(b1, b2, color);
    }
  },
});

// ---------------- 2. ニュートンのゆりかご ----------------
Modes.push({
  id: "cradle",
  name: "ニュートンのゆりかご",
  formula: "運動量保存則: m₁v₁ = m₂v₂ (衝突の前後で運動量とエネルギーが保たれる)",
  desc: "端の玉をつまんで持ち上げ、離してみよう。ぶつかった勢いが玉から玉へ伝わり、反対側の端だけが跳ね上がる。",
  values: { count: 5, restitution: 0.92, pullAngle: 45 },
  controls: [
    { key: "count", label: "玉の数", min: 3, max: 9, step: 1, rebuild: true },
    { key: "pullAngle", label: "最初に持ち上げる角度", min: 10, max: 80, step: 5, rebuild: true },
    { key: "restitution", label: "跳ね返り係数(反発)", min: 0.5, max: 1, step: 0.01, apply: (m, val) => { m._live.contact.restitution = val; } },
  ],
  buttons: [{ label: "リセット", action: (m) => window.PhysApp.loadMode(m) }],
  trails: false,
  setup(mode) {
    const v = mode.values;
    Physics.world.gravity.set(0, -9.82, 0);
    const matBall = new CANNON.Material("cradleBall");
    const contact = new CANNON.ContactMaterial(matBall, matBall, { restitution: v.restitution, friction: 0.02 });
    Physics.world.addContactMaterial(contact);
    mode._live = { contact };
    const radius = 0.5;
    const spacing = radius * 2;
    const startX = -((v.count - 1) * spacing) / 2;
    const y = 1.0;
    const stringLen = 3.4;
    for (let i = 0; i < v.count; i++) {
      const x = startX + i * spacing;
      const anchor = staticBody(new CANNON.Sphere(0.05), { x, y: y + stringLen });
      Physics.addBody(anchor, null, { pickable: false });
      let px = x, py = y;
      if (i === 0) {
        const rad = (v.pullAngle * Math.PI) / 180;
        px = x - stringLen * Math.sin(rad);
        py = y + stringLen - stringLen * Math.cos(rad);
      }
      const ball = sphereBody(1, radius, { x: px, y: py }, matBall);
      Physics.addConstraint(new CANNON.DistanceConstraint(anchor, ball, stringLen));
      Physics.addBody(ball, sphereMesh(radius, "#c9c9c9", { metalness: 0.85, roughness: 0.2 }));
      Physics.addRod(anchor, ball, "#999999");
    }
  },
});

// ---------------- 3. バネ(単振動) ----------------
Modes.push({
  id: "spring",
  name: "バネ(単振動)",
  formula: "フックの法則: F = -kx  →  周期 T = 2π√(m/k)",
  desc: "おもりをドラッグして引っぱり、離すとバネの力で上下に振動する。バネ定数kを強くすると速く、質量を重くするとゆっくり揺れる。",
  values: { k: 40, damping: 1.0, mass: 1.4, gravity: 9.82 },
  controls: [
    { key: "k", label: "バネ定数 k", min: 5, max: 150, step: 5, apply: (m, val) => { m._live.spring.stiffness = val; } },
    { key: "damping", label: "減衰", min: 0, max: 5, step: 0.1, apply: (m, val) => { m._live.spring.damping = val; } },
    { key: "mass", label: "おもりの質量", min: 0.3, max: 4, step: 0.1, rebuild: true },
    { key: "gravity", label: "重力の強さ", min: 0, max: 20, step: 0.5, apply: (m, val) => { Physics.world.gravity.set(0, -val, 0); } },
  ],
  buttons: [{ label: "引っぱって離す", action: (m) => { const b = m._live.bobEntry.body; b.position.y -= 1.6; b.velocity.set(0, 0, 0); } }],
  trails: false,
  setup(mode) {
    const v = mode.values;
    Physics.world.gravity.set(0, -v.gravity, 0);
    const anchorPos = { x: 0, y: 4.2 };
    const anchor = staticBody(new CANNON.Sphere(0.07), anchorPos);
    Physics.addBody(anchor, boxMesh(1.2, 0.18, 0.3, 0x555555), { pickable: false });
    const restLength = 2.0;
    const bobBody = sphereBody(v.mass, 0.38, { x: 0, y: anchorPos.y - restLength });
    const spring = new CANNON.Spring(anchor, bobBody, {
      restLength, stiffness: v.k, damping: v.damping,
      localAnchorA: new CANNON.Vec3(0, 0, 0), localAnchorB: new CANNON.Vec3(0, 0, 0),
    });
    Physics.onForce(() => spring.applyForce());
    const bobEntry = Physics.addBody(bobBody, sphereMesh(0.38, "#ffcf4d"));
    Physics.addSpringVisual(anchor, bobBody, "#ffcf4d");
    mode._live = { spring, bobEntry };
  },
});

// ---------------- 4. 放物運動 ----------------
Modes.push({
  id: "projectile",
  name: "放物運動",
  formula: "x = v₀cosθ·t,  y = v₀sinθ·t − ½gt²",
  desc: "角度と初速を決めて発射。空気抵抗を強くすると軌道が失速して短くなる。重力を弱くすると月面のように遠くまで飛ぶ。",
  values: { angle: 50, speed: 11, gravity: 9.82, drag: 0 },
  controls: [
    { key: "angle", label: "発射角度", min: 0, max: 90, step: 1, unit: "°", apply: (m, val) => { m._live.launcher.rotation.z = (val * Math.PI) / 180; } },
    { key: "speed", label: "初速", min: 2, max: 25, step: 0.5, apply: () => {} },
    { key: "gravity", label: "重力の強さ", min: 1, max: 25, step: 0.5, apply: (m, val) => { Physics.world.gravity.set(0, -val, 0); } },
    { key: "drag", label: "空気抵抗", min: 0, max: 2, step: 0.05, apply: () => {} },
  ],
  buttons: [
    { label: "発射 🚀", action: (m) => fireProjectile(m) },
    { label: "全部消す", action: (m) => { for (let i = m._live.balls.length - 1; i >= 0; i--) Physics.removeBody(m._live.balls[i]); m._live.balls = []; } },
  ],
  trails: true,
  setup(mode) {
    const v = mode.values;
    Physics.world.gravity.set(0, -v.gravity, 0);
    addGround(-4.7);
    const basePos = { x: -Math.min(6.5, Render.viewW * 0.38), y: -4.1 };
    const launcher = boxMesh(1.0, 0.3, 0.3, 0xff7a3d);
    launcher.position.set(basePos.x, basePos.y, 0);
    launcher.rotation.z = (v.angle * Math.PI) / 180;
    Physics.addDecor(launcher);
    mode._live = { launcher, basePos, balls: [] };
    Physics.onForce((dt) => {
      const drag = mode.values.drag;
      if (drag <= 0) return;
      for (const e of mode._live.balls) {
        const b = e.body;
        const sp = Math.hypot(b.velocity.x, b.velocity.y);
        if (sp > 0.01) b.applyForce(new CANNON.Vec3(-b.velocity.x * drag * sp, -b.velocity.y * drag * sp, 0), b.position);
      }
    });
    Physics.onStep(() => {
      for (let i = mode._live.balls.length - 1; i >= 0; i--) {
        const e = mode._live.balls[i];
        if (e.body.position.y < -9 || Math.abs(e.body.position.x) > 12) {
          Physics.removeBody(e);
          mode._live.balls.splice(i, 1);
        }
      }
    });
  },
});
function fireProjectile(mode) {
  const v = mode.values;
  const rad = (v.angle * Math.PI) / 180;
  const bp = mode._live.basePos;
  const tipX = bp.x + Math.cos(rad) * 0.9, tipY = bp.y + Math.sin(rad) * 0.9;
  const body = sphereBody(0.35, 0.28, { x: tipX, y: tipY });
  body.velocity.set(Math.cos(rad) * v.speed, Math.sin(rad) * v.speed, 0);
  const color = randColor();
  const e = Physics.addBody(body, sphereMesh(0.28, color), { trail: true, trailColor: color });
  mode._live.balls.push(e);
}

// ---------------- 5. 万有引力・軌道運動 ----------------
Modes.push({
  id: "orbit",
  name: "万有引力・軌道",
  formula: "F = G·M·m / r²  (ニュートンの万有引力の法則)",
  desc: "中心の天体が周りの衛星を引っぱる。衛星をドラッグして放り投げると、速度次第で楕円軌道を描いたり、遠くへ飛んでいったり、中心に落ちたりする。",
  values: { mass: 2600, g: 1.0 },
  controls: [
    { key: "mass", label: "中心天体の質量", min: 500, max: 6000, step: 100, apply: (m, val) => { m._live.M = val; } },
    { key: "g", label: "重力定数 G", min: 0.2, max: 3, step: 0.1, apply: (m, val) => { m._live.G = val; } },
  ],
  buttons: [
    { label: "衛星を追加 🛰️", action: (m) => addSatellite(m) },
    { label: "クリア", action: (m) => { for (let i = m._live.sats.length - 1; i >= 0; i--) Physics.removeBody(m._live.sats[i]); m._live.sats = []; } },
  ],
  trails: true,
  setup(mode) {
    Physics.world.gravity.set(0, 0, 0);
    const v = mode.values;
    const starBody = staticBody(new CANNON.Sphere(0.6), { x: 0, y: 0 });
    Physics.addBody(starBody, sphereMesh(0.6, "#ffd166", { emissive: 0xff9a2e, emissiveIntensity: 0.6 }), { pickable: false });
    mode._live = { M: v.mass, G: v.g, sats: [], star: starBody };
    Physics.onForce(() => {
      const { M, G, sats } = mode._live;
      for (let i = sats.length - 1; i >= 0; i--) {
        const b = sats[i].body;
        const dx = -b.position.x, dy = -b.position.y;
        let r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2) || 0.001;
        if (r < 0.75) { Physics.removeBody(sats[i]); sats.splice(i, 1); continue; }
        if (r2 < 1) r2 = 1;
        const fmag = (G * M * b.mass) / r2 / 300;
        b.applyForce(new CANNON.Vec3((fmag * dx) / r, (fmag * dy) / r, 0), b.position);
      }
    });
    for (let i = 0; i < 2; i++) addSatellite(mode);
  },
});
function addSatellite(mode) {
  const v = mode.values;
  const r = 3 + Math.random() * 2;
  const ang = Math.random() * Math.PI * 2;
  const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
  const body = sphereBody(0.4, 0.22, { x, y });
  const vCirc = Math.sqrt((mode._live.G * mode._live.M) / r / 300) * (0.85 + Math.random() * 0.3);
  const tx = -Math.sin(ang), ty = Math.cos(ang);
  body.velocity.set(tx * vCirc, ty * vCirc, 0);
  const color = randColor();
  const e = Physics.addBody(body, sphereMesh(0.22, color), { trail: true, trailColor: color });
  mode._live.sats.push(e);
}

// ---------------- 6. 静電気力(電荷) ----------------
Modes.push({
  id: "charge",
  name: "静電気力",
  formula: "クーロンの法則: F = k·q₁q₂ / r²  (同符号は反発、異符号は引き合う)",
  desc: "赤(＋)同士・青(－)同士は反発し、赤と青は引き合う。ドラッグして好きな場所に放り込んでみよう。",
  values: { k: 6 },
  controls: [{ key: "k", label: "力の強さ", min: 1, max: 15, step: 0.5, apply: (m, val) => { m._live.k = val; } }],
  buttons: [
    { label: "＋ 電荷を追加", action: (m) => addCharge(m, 1) },
    { label: "－ 電荷を追加", action: (m) => addCharge(m, -1) },
    { label: "クリア", action: (m) => { for (let i = m._live.charges.length - 1; i >= 0; i--) Physics.removeBody(m._live.charges[i]); m._live.charges = []; } },
  ],
  trails: false,
  setup(mode) {
    Physics.world.gravity.set(0, 0, 0);
    mode._live = { k: mode.values.k, charges: [] };
    Physics.onForce(() => {
      const { k, charges } = mode._live;
      for (let i = 0; i < charges.length; i++) {
        for (let j = i + 1; j < charges.length; j++) {
          const a = charges[i], b = charges[j];
          const dx = b.body.position.x - a.body.position.x, dy = b.body.position.y - a.body.position.y;
          let r2 = dx * dx + dy * dy;
          if (r2 < 0.16) r2 = 0.16;
          const r = Math.sqrt(r2);
          const ux = -dx / r, uy = -dy / r;
          const coeff = (k * a.charge * b.charge) / r2;
          a.body.applyForce(new CANNON.Vec3(coeff * ux, coeff * uy, 0), a.body.position);
          b.body.applyForce(new CANNON.Vec3(-coeff * ux, -coeff * uy, 0), b.body.position);
        }
      }
    });
    addCharge(mode, 1); addCharge(mode, 1); addCharge(mode, -1);
  },
});
function addCharge(mode, sign) {
  const x = (Math.random() - 0.5) * 6, y = (Math.random() - 0.5) * 4;
  const body = sphereBody(0.5, 0.32, { x, y });
  body.linearDamping = 0.15;
  const color = sign > 0 ? "#ff5c5c" : "#4d9dff";
  const e = Physics.addBody(body, sphereMesh(0.32, color, { emissive: sign > 0 ? 0x661010 : 0x102a66, emissiveIntensity: 0.5 }));
  e.charge = sign;
  mode._live.charges.push(e);
}

// ---------------- 7. 摩擦と傾斜 ----------------
Modes.push({
  id: "friction",
  name: "摩擦と傾斜",
  formula: "動摩擦力: f = μN (μは摩擦係数、Nは垂直抗力)",
  desc: "坂の角度と摩擦係数を変えて、箱がどこまで滑って止まるかを見てみよう。摩擦が小さいほど遠くまで滑る。",
  values: { angle: 25, friction: 0.3, gravity: 9.82 },
  controls: [
    { key: "angle", label: "坂の角度", min: 0, max: 55, step: 1, unit: "°", rebuild: true },
    { key: "friction", label: "摩擦係数 μ", min: 0, max: 1, step: 0.02, apply: (m, val) => { m._live.contact.friction = val; } },
    { key: "gravity", label: "重力の強さ", min: 1, max: 20, step: 0.5, apply: (m, val) => { Physics.world.gravity.set(0, -val, 0); } },
  ],
  buttons: [
    { label: "箱をリセット", action: (m) => window.PhysApp.loadMode(m) },
    { label: "箱を追加", action: (m) => addFrictionBox(m) },
  ],
  trails: false,
  setup(mode) {
    const v = mode.values;
    Physics.world.gravity.set(0, -v.gravity, 0);
    const rad = (v.angle * Math.PI) / 180;
    const rampLen = 10;
    const matRamp = new CANNON.Material("ramp");
    const contact = new CANNON.ContactMaterial(matRamp, Physics.matDefault, { friction: v.friction, restitution: 0.05 });
    Physics.world.addContactMaterial(contact);
    const dir = { x: Math.cos(rad), y: -Math.sin(rad) };
    const normal = { x: Math.sin(rad), y: Math.cos(rad) };
    const centerLeft = { x: -(rampLen / 2) * Math.cos(rad), y: -0.6 + (rampLen / 2) * Math.sin(rad) };
    const surfaceLeft = { x: centerLeft.x + normal.x * 0.25, y: centerLeft.y + normal.y * 0.25 };
    mode._live = { contact, boxes: [], rampAngle: rad, dir, normal, surfaceLeft };
    const rampBody = staticBody(new CANNON.Box(new CANNON.Vec3(rampLen / 2, 0.25, 1.2)), { x: 0, y: -0.6 }, -rad, matRamp);
    Physics.addBody(rampBody, boxMesh(rampLen, 0.5, 1.2, 0x8a7256), { pickable: false });
    addGround(-4.7);
    addFrictionBox(mode);
  },
});
function addFrictionBox(mode) {
  const { surfaceLeft, dir, normal, rampAngle } = mode._live;
  const halfSize = 0.35;
  const inset = 1.0 + Math.random() * 1.2;
  const cx = surfaceLeft.x + dir.x * inset + normal.x * halfSize;
  const cy = surfaceLeft.y + dir.y * inset + normal.y * halfSize;
  const body = boxBody(1, halfSize, halfSize, halfSize, { x: cx, y: cy }, -rampAngle);
  const e = Physics.addBody(body, boxMesh(halfSize * 2, halfSize * 2, halfSize * 2, randColor()));
  mode._live.boxes.push(e);
}

// ---------------- 8. 浮力 ----------------
Modes.push({
  id: "buoyancy",
  name: "浮力",
  formula: "アルキメデスの原理: 浮力 = 流体の密度 × g × 押しのけた体積",
  desc: "液体より密度が小さい玉は浮き、大きい玉は沈む。液体の密度を変えると、浮き沈みの境目が変わる。",
  values: { fluidDensity: 1.2, gravity: 9.82 },
  controls: [
    { key: "fluidDensity", label: "液体の密度", min: 0.2, max: 3, step: 0.05, apply: (m, val) => { m._live.rho = val; } },
    { key: "gravity", label: "重力の強さ", min: 1, max: 20, step: 0.5, apply: (m, val) => { Physics.world.gravity.set(0, -val, 0); } },
  ],
  buttons: [
    { label: "軽い玉(密度0.5)", action: (m) => addBuoyBall(m, 0.5) },
    { label: "重い玉(密度2.5)", action: (m) => addBuoyBall(m, 2.5) },
    { label: "クリア", action: (m) => { for (let i = m._live.balls.length - 1; i >= 0; i--) Physics.removeBody(m._live.balls[i]); m._live.balls = []; } },
  ],
  trails: false,
  setup(mode) {
    Physics.world.gravity.set(0, -mode.values.gravity, 0);
    addGround(-4.7);
    const waterLevel = -1.0;
    const waterBottom = -4.4;
    const waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(18, waterLevel - waterBottom),
      new THREE.MeshBasicMaterial({ color: 0x2f8fd6, transparent: true, opacity: 0.38 })
    );
    waterMesh.position.set(0, (waterLevel + waterBottom) / 2, -0.6);
    Physics.addDecor(waterMesh);
    mode._live = { rho: mode.values.fluidDensity, waterLevel, balls: [], waterMesh };
    Physics.onForce(() => {
      for (const e of mode._live.balls) {
        const b = e.body;
        const bottom = b.position.y - e.radius, top = b.position.y + e.radius;
        const submerged = Math.min(1, Math.max(0, (mode._live.waterLevel - bottom) / (2 * e.radius)));
        if (submerged > 0) {
          const g = -Physics.world.gravity.y;
          const volume = (4 / 3) * Math.PI * Math.pow(e.radius, 3);
          const buoy = mode._live.rho * g * volume * submerged;
          b.applyForce(new CANNON.Vec3(0, buoy, 0), b.position);
          const dragC = 2.0 * submerged;
          b.applyForce(new CANNON.Vec3(-b.velocity.x * dragC, -b.velocity.y * dragC, 0), b.position);
        }
      }
    });
    addBuoyBall(mode, 0.5); addBuoyBall(mode, 2.5);
  },
});
function addBuoyBall(mode, density) {
  const radius = 0.5;
  const volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
  const body = sphereBody(density * volume, radius, { x: (Math.random() - 0.5) * 6, y: 4 });
  const color = density < 1 ? "#8ee38a" : "#ff6b6b";
  const e = Physics.addBody(body, sphereMesh(radius, color));
  e.radius = radius; e.density = density;
  mode._live.balls.push(e);
}

// ---------------- 9. 自由サンドボックス ----------------
Modes.push({
  id: "sandbox",
  name: "自由サンドボックス",
  formula: "F = ma  (好きな向き・強さの重力を、物体が素直に受けて動く)",
  desc: "丸や四角を降らせて、重力の向きと強さを自由に変えてみよう。ドラッグでつまんで放り投げることもできる。",
  values: { gStrength: 9.82, gAngle: 270 },
  controls: [
    { key: "gStrength", label: "重力の強さ", min: 0, max: 20, step: 0.5, apply: (m, v) => applyGravity(m) },
    { key: "gAngle", label: "重力の向き", min: 0, max: 359, step: 5, unit: "°", apply: (m, v) => applyGravity(m) },
  ],
  buttons: [
    { label: "⚪ 追加", action: (m) => spawnSandShape(m, "sphere") },
    { label: "⬛ 追加", action: (m) => spawnSandShape(m, "box") },
    { label: "💥 吹き飛ばす", action: (m) => blastSandbox(m) },
    { label: "🧹 クリア", action: (m) => { for (let i = m._live.shapes.length - 1; i >= 0; i--) Physics.removeBody(m._live.shapes[i]); m._live.shapes = []; } },
  ],
  trails: false,
  setup(mode) {
    mode._live = { shapes: [] };
    const W = Render.viewW / 2 - 0.3, H = Render.viewH / 2 - 0.3;
    const wallOpts = { pickable: false };
    Physics.addBody(staticBody(new CANNON.Box(new CANNON.Vec3(W, 0.2, 1)), { x: 0, y: -H }), boxMesh(W * 2, 0.4, 1, 0x546073), wallOpts);
    Physics.addBody(staticBody(new CANNON.Box(new CANNON.Vec3(W, 0.2, 1)), { x: 0, y: H }), boxMesh(W * 2, 0.4, 1, 0x546073), wallOpts);
    Physics.addBody(staticBody(new CANNON.Box(new CANNON.Vec3(0.2, H, 1)), { x: -W, y: 0 }), boxMesh(0.4, H * 2, 1, 0x546073), wallOpts);
    Physics.addBody(staticBody(new CANNON.Box(new CANNON.Vec3(0.2, H, 1)), { x: W, y: 0 }), boxMesh(0.4, H * 2, 1, 0x546073), wallOpts);
    applyGravity(mode);
    spawnSandShape(mode, "sphere");
    spawnSandShape(mode, "box");
  },
});
function applyGravity(mode) {
  const v = mode.values;
  const rad = (v.gAngle * Math.PI) / 180;
  Physics.world.gravity.set(Math.cos(rad) * v.gStrength, Math.sin(rad) * v.gStrength, 0);
}
function spawnSandShape(mode, kind) {
  const x = (Math.random() - 0.5) * 6, y = (Math.random() - 0.5) * 2 + 1;
  const color = randColor();
  let body, mesh;
  if (kind === "sphere") {
    const r = 0.3 + Math.random() * 0.25;
    body = sphereBody(1, r, { x, y });
    mesh = sphereMesh(r, color);
  } else {
    const s = 0.5 + Math.random() * 0.3;
    body = boxBody(1, s / 2, s / 2, s / 2, { x, y }, Math.random() * Math.PI);
    mesh = boxMesh(s, s, s, color);
  }
  const e = Physics.addBody(body, mesh);
  mode._live.shapes.push(e);
}
function blastSandbox(mode) {
  for (const e of mode._live.shapes) {
    const ang = Math.random() * Math.PI * 2;
    const mag = 4 + Math.random() * 6;
    e.body.velocity.x += Math.cos(ang) * mag;
    e.body.velocity.y += Math.sin(ang) * mag;
  }
}
