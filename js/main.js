// PHYSICS LAB DELUXE - UI配線・入力(ドラッグでつまんで放す)・メインループ
(() => {
  const wrap = document.getElementById("canvas-wrap");
  const container = document.getElementById("canvas-container");
  const trailCanvas = document.getElementById("trail-canvas");
  const trailCtx = trailCanvas.getContext("2d");

  Render.init(container);

  let currentMode = null;
  let paused = false;
  let timeScale = 1;

  function loadMode(mode) {
    currentMode = mode;
    Physics.clearAll();
    mode.setup(mode);
    renderTabs();
    renderInfo(mode);
    renderControls(mode);
    renderButtons(mode);
  }

  function renderTabs() {
    const box = document.getElementById("mode-tabs");
    box.innerHTML = "";
    for (const m of Modes) {
      const b = document.createElement("button");
      b.className = "tab-btn" + (m === currentMode ? " active" : "");
      b.textContent = m.name;
      b.onclick = () => loadMode(m);
      box.appendChild(b);
    }
  }

  function renderInfo(mode) {
    document.getElementById("mode-name").textContent = mode.name;
    document.getElementById("mode-simple").textContent = "🌟 " + mode.simple;
    document.getElementById("mode-formula").textContent = mode.formula;
    document.getElementById("mode-desc").textContent = mode.desc;
  }

  function fmtVal(v) {
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }

  function renderControls(mode) {
    const box = document.getElementById("mode-controls");
    box.innerHTML = "";
    for (const c of mode.controls) {
      const row = document.createElement("div");
      row.className = "ctrl-row";
      const val = mode.values[c.key];
      row.innerHTML =
        '<label>' + c.label + ' <span class="val">' + fmtVal(val) + (c.unit || "") + '</span></label>' +
        '<input type="range" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + val + '">';
      const input = row.querySelector("input");
      const span = row.querySelector(".val");
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        mode.values[c.key] = v;
        span.textContent = fmtVal(v) + (c.unit || "");
        if (!c.rebuild && c.apply) c.apply(mode, v);
      });
      if (c.rebuild) {
        input.addEventListener("change", () => loadMode(mode));
      }
      box.appendChild(row);
    }
  }

  function renderButtons(mode) {
    const box = document.getElementById("mode-buttons");
    box.innerHTML = "";
    for (const b of mode.buttons || []) {
      const btn = document.createElement("button");
      btn.className = "act-btn";
      btn.textContent = b.label;
      btn.onclick = () => b.action(mode);
      box.appendChild(btn);
    }
  }

  window.PhysApp = { loadMode };

  // ---- 上部の共通コントロール ----
  const timescaleInput = document.getElementById("timescale");
  timescaleInput.addEventListener("input", () => { timeScale = parseFloat(timescaleInput.value); });
  const pauseBtn = document.getElementById("pause-btn");
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "▶" : "⏸";
  });
  const panelToggle = document.getElementById("panel-toggle");
  const sidePanel = document.getElementById("side-panel");
  panelToggle.addEventListener("click", () => sidePanel.classList.toggle("open"));

  // ---- ドラッグしてつまむ→離すと実際の速度で飛ぶ(全モード共通の操作) ----
  const PICK_RADIUS = 0.6;
  let dragEntry = null;
  let dragHistory = [];

  function pick(worldPos) {
    let best = null, bestD = PICK_RADIUS;
    for (const e of Physics.linked) {
      if (!e.pickable) continue;
      const dx = e.body.position.x - worldPos.x, dy = e.body.position.y - worldPos.y;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function onDown(clientX, clientY) {
    const w = Render.screenToWorld(clientX, clientY);
    const e = pick(w);
    if (!e) return;
    dragEntry = e;
    e.body.type = CANNON.Body.KINEMATIC;
    e.body.velocity.set(0, 0, 0);
    e.body.angularVelocity.set(0, 0, 0);
    dragHistory = [{ x: w.x, y: w.y, t: performance.now() }];
  }
  function onMove(clientX, clientY) {
    if (!dragEntry) return;
    const w = Render.screenToWorld(clientX, clientY);
    dragEntry.body.position.x = w.x;
    dragEntry.body.position.y = w.y;
    dragHistory.push({ x: w.x, y: w.y, t: performance.now() });
    if (dragHistory.length > 6) dragHistory.shift();
  }
  function onUp() {
    if (!dragEntry) return;
    let vx = 0, vy = 0;
    if (dragHistory.length >= 2) {
      const a = dragHistory[0], b = dragHistory[dragHistory.length - 1];
      const dt = Math.max(1, b.t - a.t) / 1000;
      vx = (b.x - a.x) / dt;
      vy = (b.y - a.y) / dt;
      const sp = Math.hypot(vx, vy);
      const maxSp = 22;
      if (sp > maxSp) { vx = (vx / sp) * maxSp; vy = (vy / sp) * maxSp; }
    }
    dragEntry.body.type = CANNON.Body.DYNAMIC;
    dragEntry.body.velocity.set(vx, vy, 0);
    dragEntry.body.wakeUp();
    dragEntry = null;
    dragHistory = [];
  }

  wrap.addEventListener("pointerdown", (ev) => {
    wrap.setPointerCapture(ev.pointerId);
    onDown(ev.clientX, ev.clientY);
  });
  wrap.addEventListener("pointermove", (ev) => onMove(ev.clientX, ev.clientY));
  wrap.addEventListener("pointerup", onUp);
  wrap.addEventListener("pointercancel", onUp);

  // ---- 軌跡の描画(2Dオーバーレイ) ----
  function resizeTrailCanvas() {
    trailCanvas.width = wrap.clientWidth;
    trailCanvas.height = wrap.clientHeight;
  }
  window.addEventListener("resize", resizeTrailCanvas);
  resizeTrailCanvas();

  function drawTrails() {
    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    if (!currentMode || !currentMode.trails) return;
    for (const e of Physics.linked) {
      if (!e.trail || e.trail.length < 2) continue;
      trailCtx.beginPath();
      for (let i = 0; i < e.trail.length; i++) {
        const p = Render.worldToScreen(e.trail[i].x, e.trail[i].y);
        if (i === 0) trailCtx.moveTo(p.px, p.py);
        else trailCtx.lineTo(p.px, p.py);
      }
      trailCtx.strokeStyle = e.trailColor;
      trailCtx.globalAlpha = 0.5;
      trailCtx.lineWidth = 2;
      trailCtx.stroke();
    }
    trailCtx.globalAlpha = 1;
  }

  // ---- メインループ ----
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    try {
      if (!paused) Physics.step(dt, timeScale);
      Render.render();
      drawTrails();
    } catch (err) {
      console.error("loop error, resetting current mode", err);
      loadMode(currentMode || Modes[0]);
    }
    requestAnimationFrame(loop);
  }

  loadMode(Modes[0]);
  requestAnimationFrame(loop);
})();
