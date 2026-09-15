/* 知识图谱：自包含力导向布局（canvas，无外部依赖） */
(function () {
  var canvas = document.getElementById("graph-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var tip = document.getElementById("graph-tooltip");
  var chipsBox = document.getElementById("graph-chips");
  var countsEl = document.getElementById("graph-counts");

  var COLORS = { chapter: "#5BA47E", concept: "#C99544", case: "#4FA3B5", person: "#C06565" };
  var LABELS = { chapter: "章节", concept: "概念", case: "案例与机构", person: "人物" };
  var TYPE_BADGE = { chapter: "type-章节", concept: "type-概念", case: "type-案例", person: "type-人物" };

  var nodes = [], links = [], byId = {};
  var view = { x: 0, y: 0, k: 1 };
  var alpha = 1, dragging = null, panning = null, moved = 0, hover = null;
  var activeTypes = { chapter: true, concept: true, case: true, person: true };
  var adjacency = {};
  var W = 0, H = 0, DPR = Math.max(1, window.devicePixelRatio || 1);

  function resize() {
    var r = canvas.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
  }

  function radius(n) {
    if (n.type === "chapter") return 13;
    return 5 + Math.sqrt(Math.min(n.count, 130)) * 1.25;
  }

  function restLen(w) { return 150 + 700 / (w + 6); }

  function seed() {
    // 章节按大圆均匀铺开作为骨架；词条出生在它最强章节的外围
    var chapters = nodes.filter(function (n) { return n.type === "chapter"; });
    var R = 560;
    chapters.forEach(function (c, i) {
      var a = (i / chapters.length) * Math.PI * 2 - Math.PI / 2;
      c.x = Math.cos(a) * R; c.y = Math.sin(a) * R;
      c.vx = 0; c.vy = 0; c.fx = c.x; c.fy = c.y;  // 章节固定为锚点
    });
    nodes.forEach(function (n) {
      if (n.type === "chapter") return;
      var anchor = null, bw = -1;
      links.forEach(function (l) {
        if (l.a === n && l.b.type === "chapter" && l.w > bw) { bw = l.w; anchor = l.b; }
        if (l.b === n && l.a.type === "chapter" && l.w > bw) { bw = l.w; anchor = l.a; }
      });
      var cx = anchor ? anchor.fx : 0, cy = anchor ? anchor.fy : 0;
      var a = Math.random() * Math.PI * 2, d = 170 + Math.random() * 230;
      n.x = cx * 0.72 + Math.cos(a) * d;  // 略向中心收拢，避免超出锚圈
      n.y = cy * 0.72 + Math.sin(a) * d;
      n.vx = 0; n.vy = 0;
    });
    alpha = 1;
  }

  function tick() {
    var act = nodes.filter(function (n) { return activeTypes[n.type] && n.type !== "chapter"; });
    var chapters = nodes.filter(function (n) { return n.type === "chapter" && activeTypes.chapter; });
    if (alpha > 0.012) {
      // 斥力：普通节点之间
      for (var i = 0; i < act.length; i++) {
        for (var j = i + 1; j < act.length; j++) {
          var a = act[i], b = act[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy; if (d2 < 100) d2 = 100;
          if (d2 > 1000000) continue;
          var f = 5200 / d2, d = Math.sqrt(d2);
          var fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        // 与章节锚点的斥力（防止压在锚点上）
        for (var c = 0; c < chapters.length; c++) {
          var ch = chapters[c], t = act[i];
          var ddx = t.x - ch.x, ddy = t.y - ch.y;
          var dd2 = ddx * ddx + ddy * ddy; if (dd2 < 100) dd2 = 100;
          var ff = 7000 / dd2, dd = Math.sqrt(dd2);
          t.vx += (ddx / dd) * ff; t.vy += (ddy / dd) * ff;
        }
      }
      // 弹簧
      links.forEach(function (l) {
        if (!activeTypes[l.a.type] || !activeTypes[l.b.type]) return;
        var dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
        var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        var f = (d - restLen(l.w)) * 0.02 * Math.min(l.w, 12) / 4;
        var fx = (dx / d) * f, fy = (dy / d) * f;
        l.a.vx += fx; l.a.vy += fy; l.b.vx -= fx; l.b.vy -= fy;
      });
      // 轻微向心，防止游离；章节节点钉在锚点
      act.forEach(function (n) {
        n.vx -= n.x * 0.0012;
        n.vy -= n.y * 0.0012;
        n.vx *= 0.85; n.vy *= 0.85;
        var sp = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (sp > 10) { n.vx *= 10 / sp; n.vy *= 10 / sp; }
        if (n !== dragging) { n.x += n.vx; n.y += n.vy; }
      });
      chapters.forEach(function (n) { n.x = n.fx; n.y = n.fy; });
      alpha *= 0.993;
    }
    if (dragging) {
      dragging.x = dragPos.wx; dragging.y = dragPos.wy; dragging.vx = dragging.vy = 0;
      if (dragging.fx !== undefined) { dragging.fx = dragPos.wx; dragging.fy = dragPos.wy; }
    }
  }

  function sx(n) { return n.x * view.k + view.x; }
  function sy(n) { return n.y * view.k + view.y; }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var hl = hover ? adjacency[hover.id] || {} : null;
    // 连边
    links.forEach(function (l) {
      if (!activeTypes[l.a.type] || !activeTypes[l.b.type]) return;
      var dim = hl && l.a !== hover && l.b !== hover && !hl[l.a.id] && !hl[l.b.id];
      ctx.strokeStyle = dim ? "rgba(184,134,11,.05)" : "rgba(212,168,67,.26)";
      ctx.lineWidth = Math.min(l.w, 25) * 0.07 + 0.5;
      ctx.beginPath();
      ctx.moveTo(sx(l.a), sy(l.a));
      ctx.lineTo(sx(l.b), sy(l.b));
      ctx.stroke();
    });
    // 节点（先画词条，章节最后画在最上层）
    [0, 1].forEach(function (pass) {
      nodes.forEach(function (n) {
        var isCh = n.type === "chapter";
        if ((pass === 1) !== isCh) return;
        if (!activeTypes[n.type]) return;
        var r = radius(n) * Math.max(view.k, 0.55);
        var dim = hl && n !== hover && !hl[n.id];
        ctx.globalAlpha = dim ? 0.16 : 1;
        if (isCh) {  // 章节画成金色描边的方印
          ctx.beginPath();
          ctx.arc(sx(n), sy(n), r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(26,35,50,.96)";
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#D4A843";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sx(n), sy(n), r, 0, Math.PI * 2);
          ctx.fillStyle = COLORS[n.type];
          ctx.fill();
        }
        if (n === hover) {
          ctx.strokeStyle = "#F3E1B0"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(sx(n), sy(n), r + 5, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
    });
    // 标签：章节始终显示；词条按缩放/频次/悬停显示
    var showAll = view.k >= 1.6;
    ctx.textAlign = "center";
    nodes.forEach(function (n) {
      if (!activeTypes[n.type]) return;
      var near = hl && (n === hover || hl[n.id]);
      var isCh = n.type === "chapter";
      if (!isCh && !showAll && n.count < 45 && !near) return;
      var dim = hl && !near;
      ctx.font = (isCh ? "700 " : "500 ") +
                 Math.round(isCh ? 13.5 : 11.5) + "px 'Noto Serif SC','PingFang SC',serif";
      ctx.fillStyle = dim ? "rgba(27,27,24,.16)"
        : (isCh ? "#F5E3B0" : "rgba(255,248,238,.94)");
      ctx.shadowColor = "rgba(10,14,22,.95)"; ctx.shadowBlur = isCh ? 5 : 3;
      var r = radius(n) * Math.max(view.k, 0.55);
      ctx.fillText(n.name, sx(n), sy(n) - r - 6);
      ctx.shadowBlur = 0;
    });
  }

  function frame() { tick(); draw(); requestAnimationFrame(frame); }

  /* ---------- 坐标变换 ---------- */
  function toWorld(px, py) { return { x: (px - view.x) / view.k, y: (py - view.y) / view.k }; }
  var dragPos = { wx: 0, wy: 0 };

  function hit(px, py) {
    var w = toWorld(px, py), best = null, bd = 1e9;
    nodes.forEach(function (n) {
      if (!activeTypes[n.type]) return;
      var dx = n.x - w.x, dy = n.y - w.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < radius(n) + 7 / view.k && d < bd) { bd = d; best = n; }
    });
    return best;
  }

  function evPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", function (e) {
    var p = evPos(e);
    canvas.setPointerCapture(e.pointerId);
    moved = 0;
    var n = hit(p.x, p.y);
    if (n) { dragging = n; var w = toWorld(p.x, p.y); dragPos.wx = w.x; dragPos.wy = w.y; alpha = Math.max(alpha, 0.35); }
    else { panning = { x: p.x, y: p.y, vx: view.x, vy: view.y }; }
  });
  canvas.addEventListener("pointermove", function (e) {
    var p = evPos(e);
    if (dragging) {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      var w = toWorld(p.x, p.y); dragPos.wx = w.x; dragPos.wy = w.y; alpha = Math.max(alpha, 0.3);
    } else if (panning) {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      view.x = panning.vx + (p.x - panning.x);
      view.y = panning.vy + (p.y - panning.y);
    } else {
      var n = hit(p.x, p.y);
      if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "grab"; }
      if (n) {
        tip.style.display = "block";
        tip.innerHTML = "<b>" + n.name + "</b>" +
          '<span class="type-badge ' + TYPE_BADGE[n.type] + '">' + LABELS[n.type] + "</span>" +
          (n.type === "chapter" ? "" : "<i>全书提及 " + n.count + " 次</i>") +
          "<em>点击进入 →</em>";
        var tw = tip.offsetWidth;
        tip.style.left = Math.min(p.x + 14, W - tw - 10) + "px";
        tip.style.top = Math.max(p.y - 10, 6) + "px";
      } else tip.style.display = "none";
    }
  });
  function pointerEnd(e) {
    if (dragging && moved < 5 && hover === dragging) {
      window.location.href = dragging.url;
    }
    dragging = null; panning = null;
  }
  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", function () { dragging = null; panning = null; });
  canvas.addEventListener("pointerleave", function () { hover = null; tip.style.display = "none"; });
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = evPos(e);
    var k2 = Math.min(4, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.0012)));
    view.x = p.x - (p.x - view.x) * (k2 / view.k);
    view.y = p.y - (p.y - view.y) * (k2 / view.k);
    view.k = k2;
  }, { passive: false });

  /* ---------- 控件 ---------- */
  function zoomBy(f) {
    var k2 = Math.min(4, Math.max(0.25, view.k * f));
    view.x = W / 2 - (W / 2 - view.x) * (k2 / view.k);
    view.y = H / 2 - (H / 2 - view.y) * (k2 / view.k);
    view.k = k2;
  }
  document.getElementById("g-zoom-in").onclick = function () { zoomBy(1.3); };
  document.getElementById("g-zoom-out").onclick = function () { zoomBy(1 / 1.3); };
  document.getElementById("g-relayout").onclick = function () { seed(); fitView(); };
  document.getElementById("g-fit").onclick = fitView;

  function fitView() {
    var act = nodes.filter(function (n) { return activeTypes[n.type]; });
    if (!act.length) return;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    act.forEach(function (n) {
      var r = radius(n) + 24;  // 给标签留边
      x0 = Math.min(x0, n.x - r); y0 = Math.min(y0, n.y - r);
      x1 = Math.max(x1, n.x + r); y1 = Math.max(y1, n.y + r);
    });
    var pad = 30;
    view.k = Math.min((W - pad * 2) / Math.max(x1 - x0, 1), (H - pad * 2) / Math.max(y1 - y0, 1), 2.2);
    view.x = W / 2 - ((x0 + x1) / 2) * view.k;
    view.y = H / 2 - ((y0 + y1) / 2) * view.k;
  }

  function buildChips() {
    chipsBox.innerHTML = "";
    Object.keys(LABELS).forEach(function (ty) {
      var cnt = nodes.filter(function (n) { return n.type === ty; }).length;
      var chip = document.createElement("button");
      chip.className = "graph-chip" + (activeTypes[ty] ? " on" : "");
      chip.innerHTML = '<i style="background:' + COLORS[ty] + '"></i>' + LABELS[ty] +
        '<b>' + cnt + "</b>";
      chip.onclick = function () {
        activeTypes[ty] = !activeTypes[ty];
        chip.classList.toggle("on", activeTypes[ty]);
        alpha = Math.max(alpha, 0.5);
      };
      chipsBox.appendChild(chip);
    });
  }

  /* ---------- 启动 ---------- */
  fetch("graph-data.json").then(function (r) { return r.json(); }).then(function (data) {
    nodes = data.nodes;
    byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; n.vx = 0; n.vy = 0; });
    links = data.links.map(function (l) {
      return { a: byId[l.s], b: byId[l.t], w: l.w, kind: l.kind };
    });
    adjacency = {};
    links.forEach(function (l) {
      (adjacency[l.a.id] = adjacency[l.a.id] || {})[l.b.id] = 1;
      (adjacency[l.b.id] = adjacency[l.b.id] || {})[l.a.id] = 1;
    });
    countsEl.textContent = nodes.length + " 个节点 · " + links.length + " 条连边";
    resize();
    buildChips();
    seed();
    for (var i = 0; i < 160; i++) tick();  // 预热收敛
    fitView();
    frame();
  });
  window.addEventListener("resize", function () { resize(); draw(); });
})();
