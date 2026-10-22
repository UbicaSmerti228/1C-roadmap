"use strict";
// Граф карты: стадии → узлы → подтемы. Силовая раскладка на canvas.
(function(){
const {D, st, esc, rich, I, src, TXT} = window.RM;
const cv = document.getElementById("gcv"), ctx = cv && cv.getContext && cv.getContext("2d");
if(!ctx) return;
let GN = [], GE = [], built = false, run = true, sel = null, drag = null, pan = null, anim = null, loopOn = false;
let cam = {x:0, y:0, z:.8}, C = {};
const RK = {todo:0, learning:1, done:2};

function colors(){
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  C = {bg:v("--graph-bg"), done:v("--done"), learn:v("--learn"), todo:v("--todo"), accent:v("--accent"), text:v("--text"), muted:v("--muted"), faint:v("--faint"), surface:v("--surface-2"), border:v("--border-strong")};
}
function hash(s){ let h = 0; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0) / 4294967295 }
function nStat(n){
  if(n.kind === "sub") return st(n.k);
  let best = "todo", all = true;
  const nodes = n.kind === "node" ? [n.ref] : n.ref.n;
  nodes.forEach(nd => nd.sub.forEach(sb => { const v = st(nd.id + "." + sb.id); if(RK[v] > RK[best]) best = v; if(v !== "done") all = false }));
  return all ? "done" : (best === "todo" ? "todo" : "learning");
}
function build(){
  if(built) return; built = true;
  const byId = {};
  D.forEach((sg, si) => {
    const an = -Math.PI / 2 + si * 2 * Math.PI / D.length;
    const sx = Math.cos(an) * 430 + (hash("Sx" + si) - .5) * 70, sy = Math.sin(an) * 320 + (hash("Sy" + si) - .5) * 70;
    GN.push({id:"S" + si, kind:"stage", label:si + ". " + sg.s, ref:sg, si, r:26, x:sx, y:sy, vx:0, vy:0, fx:null, cx:sx, cy:sy});
    if(si > 0) GE.push({a:"S" + (si - 1), b:"S" + si, len:320, path:true});
    let prev = null;
    sg.n.forEach((nd, ni) => {
      const a2 = an + (ni - (sg.n.length - 1) / 2) * .55;
      const nx = sx + Math.cos(a2) * 180 + (hash(nd.id) - .5) * 90, ny = sy + Math.sin(a2) * 155 + (hash(nd.id + "y") - .5) * 90;
      GN.push({id:"N" + nd.id, kind:"node", label:nd.t, ref:nd, si, r:15, x:nx, y:ny, vx:0, vy:0, fx:null, cx:sx, cy:sy, par:nd.m === "par"});
      GE.push({a:"S" + si, b:"N" + nd.id, len:180, par:nd.m === "par"});
      if(prev) GE.push({a:prev, b:"N" + nd.id, len:190, par:nd.m === "par"});
      prev = "N" + nd.id;
      nd.sub.forEach((sb, k) => {
        const sa = a2 + (k - (nd.sub.length - 1) / 2) * .5, key = nd.id + "." + sb.id;
        const qx = nx + Math.cos(sa) * 95 + (hash(key) - .5) * 56, qy = ny + Math.sin(sa) * 80 + (hash(key + "y") - .5) * 56;
        GN.push({id:"Q" + key, kind:"sub", label:sb.w, ref:nd, sb, k:key, si, r:7.5, x:qx, y:qy, vx:0, vy:0, fx:null, cx:nx, cy:ny, par:nd.m === "par"});
        GE.push({a:"N" + nd.id, b:"Q" + key, len:95, par:nd.m === "par"});
      });
    });
  });
  GN.forEach(n => byId[n.id] = n);
  GE.forEach(e => { e.A = byId[e.a]; e.B = byId[e.b] });
}
function tick(){
  for(let i = 0; i < GN.length; i++){
    const A = GN[i];
    for(let j = i + 1; j < GN.length; j++){
      const B = GN[j]; let dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.sqrt(dx * dx + dy * dy) || .001, m = A.r + B.r + 22, dd = d < m ? m : d;
      let F = 9000 / (dd * dd); if(F > 60) F = 60;
      dx /= d; dy /= d; A.vx -= F * dx; A.vy -= F * dy; B.vx += F * dx; B.vy += F * dy;
    }
  }
  GE.forEach(E => {
    const A = E.A, B = E.B; let dx = B.x - A.x, dy = B.y - A.y;
    const d = Math.sqrt(dx * dx + dy * dy) || .001, F = (d - E.len) * .02;
    dx /= d; dy /= d; A.vx += F * dx; A.vy += F * dy; B.vx -= F * dx; B.vy -= F * dy;
  });
  GN.forEach(A => {
    A.vx += (A.cx - A.x) * .004 - A.x * .0015; A.vy += (A.cy - A.y) * .004 - A.y * .0015;
    A.vx *= .87; A.vy *= .87;
    if(A.fx !== null){ A.x = A.fx; A.y = A.fy; A.vx = 0; A.vy = 0 } else { A.x += A.vx; A.y += A.vy }
  });
}
const col = v => v === "done" ? C.done : v === "learning" ? C.learn : C.todo;
function alpha(hex, a){
  const m = /^#([0-9a-f]{6})$/i.exec(hex); if(!m) return hex;
  const n = parseInt(m[1], 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}
function draw(){
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const W = Math.max(320, r.width || 800), H = Math.max(300, r.height || 480);
  const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
  if(cv.width !== bw || cv.height !== bh){ cv.width = bw; cv.height = bh }
  const g = ctx, t = performance.now() / 1000, small = innerWidth < 640;
  g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.translate(W / 2 + cam.x, H / 2 + cam.y); g.scale(cam.z, cam.z);
  GE.forEach(E => {
    g.beginPath(); g.moveTo(E.A.x, E.A.y); g.lineTo(E.B.x, E.B.y);
    if(E.par){ g.setLineDash([5, 5]); g.strokeStyle = alpha(C.muted, .45); g.lineWidth = 1 }
    else { g.setLineDash([]); g.strokeStyle = alpha(C.accent, E.path ? .45 : .7); g.lineWidth = E.path ? 2.5 : 1.5 }
    g.stroke();
  });
  g.setLineDash([]); g.textAlign = "center";
  GN.forEach(N => {
    const v = nStat(N);
    if(v === "learning" && N.kind === "sub"){
      const p = (Math.sin(t * 3) + 1) / 2;
      g.beginPath(); g.arc(N.x, N.y, N.r + 4 + p * 4, 0, 6.2832);
      g.strokeStyle = alpha(C.learn, .3 + p * .4); g.lineWidth = 2 + (1 - p) * 2; g.stroke();
    }
    g.beginPath(); g.arc(N.x, N.y, N.r, 0, 6.2832);
    g.fillStyle = N === sel ? alpha(C.accent, .25) : v === "done" ? alpha(C.done, .22) : v === "learning" ? alpha(C.learn, .22) : C.surface;
    g.fill(); g.lineWidth = N === sel ? 3 : 2; g.strokeStyle = N === sel ? C.accent : col(v); g.stroke();
    if(N.kind === "stage"){ g.fillStyle = C.text; g.font = "700 13px Inter,system-ui,sans-serif"; g.fillText(String(N.si), N.x, N.y + 4.5) }
    g.fillStyle = v === "todo" ? C.muted : C.text;
    g.font = (N.kind === "stage" ? "700 " + (small ? 14 : 13) : N.kind === "node" ? "600 " + (small ? 13 : 12) : (small ? 11 : 10.5)) + "px Inter,system-ui,sans-serif";
    if(N.kind !== "sub" || cam.z > .55) g.fillText(N.kind === "stage" ? N.ref.s : N.label, N.x, N.y + N.r + 14);
  });
  g.restore();
}
function loop(){
  if(!document.body.classList.contains("gmode")){ loopOn = false; return }
  loopOn = true; if(run){ tick(); tick() } draw(); requestAnimationFrame(loop);
}
function world(px, py){ const r = cv.getBoundingClientRect(), W = r.width || 800, H = r.height || 480; return {x:(px - r.left - W / 2 - cam.x) / cam.z, y:(py - r.top - H / 2 - cam.y) / cam.z} }
function pick(px, py){
  const w = world(px, py); let best = null, bd = 1e9;
  for(let i = GN.length - 1; i >= 0; i--){ const N = GN[i], d = Math.hypot(N.x - w.x, N.y - w.y) - (N.r + 6); if(d < bd){ bd = d; best = N } }
  return bd <= 0 ? best : null;
}
function side(N){
  const P = document.getElementById("gside");
  if(!N){ P.classList.remove("on"); P.innerHTML = ""; return }
  const v = nStat(N);
  let h = '<button class="icon-btn x" data-g="close" aria-label="Закрыть">' + I("x") + "</button><h3>" + esc(N.kind === "stage" ? N.label : N.label) + '</h3><div class="mut">';
  if(N.kind === "stage"){
    const subs = N.ref.n.reduce((a, nd) => a + nd.sub.length, 0), dn = N.ref.n.reduce((a, nd) => a + nd.sub.filter(sb => st(nd.id + "." + sb.id) === "done").length, 0);
    h += "Этап · " + N.ref.n.length + " узлов · " + dn + "/" + subs + " подтем</div><p class=mut>" + esc(N.ref.d) + "</p>";
    if(N.ref.mi) h += '<div class="mile" style="margin-top:10px"><h3>' + I("flag") + esc(N.ref.mi.t) + "</h3><ul>" + N.ref.mi.c.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
  } else if(N.kind === "node"){
    const dn = N.ref.sub.filter(sb => st(N.ref.id + "." + sb.id) === "done").length, hrs = N.ref.sub.reduce((a, sb) => a + sb.h, 0);
    h += (N.par ? "Можно параллельно" : "Строго по порядку") + " · " + dn + "/" + N.ref.sub.length + " подтем · ~" + hrs + " ч</div><p class=mut>" + esc(N.ref.ds) + "</p><div style='display:grid;gap:4px'>" +
      N.ref.sub.map(sb => { const k = N.ref.id + "." + sb.id, s = st(k); return '<button class="now-item" style="background:var(--surface-2)" data-goto="' + k + '"><span class="stt ' + s + '" style="pointer-events:none;width:16px;height:16px"></span><b style="font-size:13.5px">' + esc(sb.w) + "</b></button>" }).join("") + "</div>";
  } else {
    const sb = N.sb, q = window.RM.QZ()[N.k];
    h += "Подтема · ~" + sb.h + " ч · " + TXT[v] + (q ? " · тест " + q.s + "/" + q.n : "") + '</div><p class="mut" style="margin:8px 0 0">' + rich(sb.y) + '</p><div class="task"><b>Задание</b>' + rich(sb.t) + "</div>";
    h += '<div class="st-seg" id="gst">' + ["todo", "learning", "done"].map(x => '<button data-v="' + x + '" class="' + (v === x ? "on" : "") + '">' + TXT[x] + "</button>").join("") + "</div>";
    // тот же главный материал, что и в шаге «Пойми»
    const first = [], m = sb.s && sb[sb.s[0]] && sb[sb.s[0]][+sb.s.slice(1)];
    if(m) first.push(sb.s[0] === "v" ? ['<span class="src">YouTube</span>', m[1], "https://www.youtube.com/watch?v=" + m[0]] : ['<span class="src">' + esc(src(m[1])) + "</span>", m[0], m[1]]);
    if(first.length) h += '<div class="res-g"><h5>' + I("doc") + "С чего начать</h5><ul>" + first.map(x => '<li><a class="lnk" target="_blank" rel="noopener" href="' + esc(x[2]) + '">' + x[0] + '<span class="lt">' + esc(x[1]) + "</span></a></li>").join("") + "</ul></div>";
    h += '<textarea class="note" id="gnote" placeholder="Заметка…">' + esc(window.RM.NT()[N.k] || "") + "</textarea>";
    h += '<div class="row"><button class="btn primary" data-goto="' + N.k + '">Все материалы и тест</button></div>';
  }
  P.innerHTML = h; P.classList.add("on");
  P.querySelector('[data-g="close"]').onclick = () => { sel = null; side(null); draw() };
  if(N.kind !== "sub") return;
  P.querySelectorAll("#gst button").forEach(b => b.onclick = () => { window.RM.setStatus(N.k, b.dataset.v); side(N); draw() });
  const ta = document.getElementById("gnote"); if(ta) ta.oninput = () => window.RM.saveNote(N.k, ta.value);
}
function toCurrent(){
  const T = GN.find(n => n.kind === "sub" && nStat(n) === "learning"); if(!T) return;
  const t0 = performance.now(), from = {...cam}, to = {x:-T.x * 1.1, y:-T.y * 1.1, z:1.1};
  anim = true;
  (function step(){
    const p = Math.min(1, (performance.now() - t0) / 450), e = 1 - Math.pow(1 - p, 3);
    cam = {x:from.x + (to.x - from.x) * e, y:from.y + (to.y - from.y) * e, z:from.z + (to.z - from.z) * e}; draw();
    if(p < 1 && document.body.classList.contains("gmode")) requestAnimationFrame(step); else anim = null;
  })();
  sel = T; side(T);
}
let bound = false;
function bind(){
  if(bound) return; bound = true;
  addEventListener("resize", () => { if(document.body.classList.contains("gmode")) draw() });
  addEventListener("rm-theme", () => { colors(); draw() });
  const ptrs = {}; let pinch = null;
  const pdist = () => { const k = Object.keys(ptrs); if(k.length < 2) return 0; const a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  cv.addEventListener("pointerdown", e => {
    try{ cv.setPointerCapture(e.pointerId) }catch(x){}
    ptrs[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(Object.keys(ptrs).length === 2){ pinch = {d:pdist(), z:cam.z}; if(drag){ drag.n.fx = null; drag = null } pan = null; return }
    const N = pick(e.clientX, e.clientY);
    if(N){ drag = {n:N, sx:e.clientX, sy:e.clientY, mov:false}; N.fx = N.x; N.fy = N.y }
    else pan = {x:e.clientX, y:e.clientY, cx:cam.x, cy:cam.y};
  });
  cv.addEventListener("pointermove", e => {
    if(ptrs[e.pointerId]) ptrs[e.pointerId] = {x:e.clientX, y:e.clientY};
    if(pinch && Object.keys(ptrs).length >= 2){ cam.z = Math.min(3, Math.max(.25, pinch.z * pdist() / pinch.d)); draw(); return }
    if(drag){ const w = world(e.clientX, e.clientY); if(Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 7) drag.mov = true; drag.n.fx = w.x; drag.n.fy = w.y; draw(); return }
    if(pan){ cam.x = pan.cx + e.clientX - pan.x; cam.y = pan.cy + e.clientY - pan.y; draw(); return }
    cv.style.cursor = pick(e.clientX, e.clientY) ? "pointer" : "grab";
  });
  const up = e => {
    delete ptrs[e.pointerId]; if(Object.keys(ptrs).length < 2) pinch = null;
    if(drag){ const d = drag; drag = null; d.n.fx = null; if(!d.mov && e.type === "pointerup"){ sel = d.n; side(d.n) } draw(); return }
    if(pan){ const moved = Math.abs(e.clientX - pan.x) + Math.abs(e.clientY - pan.y); pan = null; if(moved < 6 && e.type === "pointerup"){ sel = null; side(null); draw() } }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), W = r.width, H = r.height, w = world(e.clientX, e.clientY);
    const nz = Math.min(3, Math.max(.25, cam.z * (e.deltaY < 0 ? 1.12 : .89)));
    cam.x = (e.clientX - r.left - W / 2) - w.x * nz; cam.y = (e.clientY - r.top - H / 2) - w.y * nz; cam.z = nz; draw();
  }, {passive:false});
  document.getElementById("gfit").onclick = () => { cam = {x:0, y:0, z:innerWidth < 640 ? .5 : .8}; draw() };
  document.getElementById("gcur").onclick = toCurrent;
  document.getElementById("gstop").onclick = e => { run = !run; e.currentTarget.textContent = run ? "Пауза" : "Пуск"; if(run && !loopOn) requestAnimationFrame(loop) };
}
window.gShow = on => {
  if(!on) return;
  colors(); build(); bind();
  cam = {x:0, y:0, z:innerWidth < 640 ? .5 : .8};
  window.gRefresh(); draw();
  if(!loopOn) requestAnimationFrame(loop);
};
window.gRefresh = () => {
  const b = document.getElementById("gcur"); if(b) b.disabled = !window.RM.stats().learning.length;
  if(sel && document.getElementById("gside").classList.contains("on") && document.body.classList.contains("gmode")) side(sel);
};
})();
