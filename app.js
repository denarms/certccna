/* CCNA·Lab — app de estudio interactiva basada en la guía CCNA 200-301 */
(function () {
  'use strict';
  var C = window.CCNA;
  var app = document.getElementById('app');
  var DOMC = ['', 'var(--d1)', 'var(--d2)', 'var(--d3)', 'var(--d4)', 'var(--d5)', 'var(--d6)'];
  var SHORT = ['', 'Fundamentos', 'Acceso a la red', 'Conectividad IP', 'Servicios IP', 'Seguridad', 'Automatización'];

  /* ---------- storage ---------- */
  var KEY = 'ccna-lab-v1';
  var S = { obj: {}, read: {}, q: {}, cards: {}, sub: { solved: 0, streak: 0, best: 0 }, labs: {}, plan: {}, exams: [], last: 1, ex: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) S = Object.assign(S, JSON.parse(raw)); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  var toastT;
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1800); }
  function confirm2(btn, msg, fn) {
    if (btn.dataset.armed) { fn(); return; }
    var orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = msg;
    setTimeout(function () { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = orig; } }, 3000);
  }
  function fmtTime(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  /* ---------- theme ---------- */
  function applyTheme() { if (S.theme) document.documentElement.setAttribute('data-theme', S.theme); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme();
  $('#theme-btn').addEventListener('click', function () {
    var dark = S.theme ? S.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    S.theme = dark ? 'light' : 'dark'; save(); applyTheme();
  });

  /* ---------- progress ---------- */
  function domProgress(d) {
    var tot = d.objectives.length + d.sections.length, done = 0;
    d.objectives.forEach(function (o) { if (S.obj[o.id]) done++; });
    d.sections.forEach(function (s, i) { if (S.read[d.n + '-' + i]) done++; });
    return { done: done, tot: tot, p: pct(done, tot) };
  }
  function objCount() { var n = 0, t = 0; C.domains.forEach(function (d) { d.objectives.forEach(function (o) { t++; if (S.obj[o.id]) n++; }); }); return { n: n, t: t }; }
  function quizStats() { var c = 0, t = 0; Object.keys(S.q).forEach(function (k) { c += S.q[k].c || 0; t += (S.q[k].c || 0) + (S.q[k].w || 0); }); return { c: c, t: t, p: pct(c, t) }; }
  function planDay() { for (var i = 0; i < C.plan.length; i++) if (!S.plan[i]) return i; return C.plan.length; }

  /* ---------- content rendering ---------- */
  function codeHtml(txt) {
    return txt.split('\n').map(function (line) {
      var cm = '', ci = line.search(/(^|\s)!/);
      if (ci >= 0) { cm = line.slice(ci); line = line.slice(0, ci); }
      var m = line.match(/^(\S*?[#>])(\s.*|$)/);
      var out = m ? '<span class="prompt">' + esc(m[1]) + '</span>' + esc(m[2]) : esc(line);
      return out + (cm ? '<span class="cmt">' + esc(cm) + '</span>' : '');
    }).join('\n');
  }
  function codeBlock(txt) { return '<div class="code"><button class="copy" type="button" data-copy>Copiar</button><pre>' + codeHtml(txt) + '</pre></div>'; }
  function tableHtml(rows) {
    var h = '<div class="tbl"><table><thead><tr>' + rows[0].map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.slice(1).forEach(function (r) { h += '<tr>' + r.map(function (c) { return '<td>' + esc(c).replace(/\n/g, '<br>') + '</td>'; }).join('') + '</tr>'; });
    return h + '</tbody></table></div>';
  }
  function blocksHtml(bl) {
    var h = '', inList = false;
    bl.forEach(function (b) {
      if (b.t === 'li') { if (!inList) { h += '<ul>'; inList = true; } h += '<li>' + esc(b.x) + '</li>'; return; }
      if (inList) { h += '</ul>'; inList = false; }
      if (b.t === 'p') h += '<p>' + esc(b.x) + '</p>';
      else if (b.t === 'code') h += codeBlock(b.x);
      else if (b.t === 'table') h += tableHtml(b.rows);
    });
    if (inList) h += '</ul>';
    return h;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]'); if (!b) return;
    var txt = b.parentNode.querySelector('pre').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Comandos copiados'); }, function () { toast('No se pudo copiar'); });
  });

  /* ---------- router ---------- */
  var cleanup = null;
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    $('#top-timer').textContent = '';
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    var r = parts[0] || 'home';
    $$('.nav a').forEach(function (a) { if (a.dataset.r === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var views = { home: vHome, estudio: vStudy, examen: vExam, subnetting: vSubnet, tarjetas: vCards, labs: vLabs, plan: vPlan };
    (views[r] || vHome)(parts.slice(1));
    if (!parts[2]) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ================= HOME ================= */
  function vHome() {
    var oc = objCount(), qs = quizStats(), day = planDay();
    var doms = C.domains.slice().sort(function (a, b) { return b.weight - a.weight || a.n - b.n; });
    var ch = genSubnet();
    var dueCards = allCards().filter(function (c) { return (S.cards[c.key] || 0) < 3; }).length;
    var h = '<main class="wrap">';
    h += '<section class="hero"><div class="stack" style="justify-content:center;gap:16px">' +
      '<div class="eyebrow">200-301 · guía interactiva</div>' +
      '<h1>Conecta cada dominio.<br>Aprueba el CCNA.</h1>' +
      '<p>Apuntes de los 6 dominios, ' + C.questions.length + ' preguntas tipo examen, subnetting ilimitado, ' + allCards().length + ' tarjetas y ' + C.labs.length + ' labs de Packet Tracer. Tu progreso se guarda en este navegador.</p>' +
      '<div class="row"><a class="btn primary" href="#/examen">Iniciar simulacro</a><a class="btn" href="#/estudio/' + S.last + '">Seguir estudiando · D' + S.last + '</a></div></div>';
    h += '<div class="card stack" style="gap:18px"><div class="between"><h2>Tu patch panel</h2><span class="mono muted" style="font-size:13px">' + oc.n + ' / ' + oc.t + ' objetivos</span></div><div class="panel-rack">';
    C.domains.forEach(function (d) {
      var p = domProgress(d);
      h += '<a class="port' + (p.p >= 100 ? ' on' : '') + '" href="#/estudio/' + d.n + '" aria-label="Dominio ' + d.n + ': ' + p.p + '%"><div class="port-slot"><div class="port-fill" style="height:' + Math.max(p.p, 3) + '%;background:' + DOMC[d.n] + '"></div></div><span class="mono" style="font-size:12px">D' + d.n + ' · ' + p.p + '%</span></a>';
    });
    h += '</div><div class="stats"><div class="stat"><b>' + (qs.t ? qs.p + '%' : '—') + '</b><span>acierto en preguntas</span></div><div class="stat"><b>' + S.sub.solved + '</b><span>subredes resueltas</span></div><div class="stat"><b>' + (day >= C.plan.length ? '✓' : 'Paso ' + (day + 1)) + '</b><span>del plan de 2 semanas</span></div></div></div></section>';

    h += '<section class="stack" style="gap:16px"><div class="between"><h2 style="font-size:26px">Dominios del examen</h2><span class="muted" style="font-size:14px">Ordenados por peso en el examen</span></div><div class="grid g-auto">';
    doms.forEach(function (d) {
      var p = domProgress(d);
      var sub = d.objectives.slice(0, 3).map(function (o) { return o.text.split(':')[0]; }).join(' · ');
      h += '<a class="dom-card" href="#/estudio/' + d.n + '"><div class="bar" style="background:' + DOMC[d.n] + '"></div><div class="in"><div class="between mono" style="font-size:13px"><span class="muted">DOMINIO ' + d.n + '</span><b>' + d.weight + '%</b></div><div class="t">' + esc(d.title) + '</div><div style="font-size:14px;color:var(--ink-2)">' + esc(sub) + '</div><div class="meter"><i style="width:' + p.p + '%;background:' + DOMC[d.n] + '"></i></div><div class="mono muted" style="font-size:12px">' + p.done + ' / ' + p.tot + ' completados</div></div></a>';
    });
    h += '</div></section>';

    var next = C.plan[Math.min(day, C.plan.length - 1)];
    h += '<section class="grid g-fit">' +
      '<div class="console stack"><div class="eyebrow">● Plan · ' + (day >= C.plan.length ? 'completado' : 'siguiente paso') + '</div><div style="font-family:var(--f-head);font-size:21px;font-weight:700">' + esc(next) + '</div><a href="#/plan" style="color:var(--led);font-weight:600">Ver plan →</a></div>' +
      '<div class="card stack"><div class="eyebrow">Reto rápido</div><div class="mono" style="font-size:26px;font-weight:600">' + intToIp(ch.ip) + '/' + ch.p + '</div><div style="font-size:14px;color:var(--ink-2)">¿Cuál es la red? Resuélvelo en menos de 30 s.</div>' +
      '<div class="row"><button class="btn sm" type="button" id="reveal-ch">Ver respuesta</button><a class="btn sm" href="#/subnetting">Practicar más →</a></div><div id="ch-ans" class="answer" hidden>' + intToIp(ch.net) + '/' + ch.p + ' · bloque ' + ch.block + '</div></div>' +
      '<div class="card stack"><div class="eyebrow">Tarjetas pendientes</div><div style="font-family:var(--f-head);font-size:26px;font-weight:700">' + dueCards + ' por dominar</div><div style="font-size:14px;color:var(--ink-2)">Números para memorizar, glosario y comandos show</div><a href="#/tarjetas" style="font-weight:600">Repasar →</a></div>' +
      '</section></main>';
    app.innerHTML = h;
    $('#reveal-ch').onclick = function () { $('#ch-ans').hidden = false; };
  }

  /* ================= STUDY ================= */
  function vStudy(args) {
    var n = parseInt(args[0], 10) || 1;
    if (args[0] === 'buscar') return vSearch(decodeURIComponent(args[1] || ''));
    var d = C.domains[n - 1] || C.domains[0];
    S.last = d.n; save();
    var p = domProgress(d);
    var h = '<div class="wrap"><div class="layout"><aside class="side" aria-label="Navegación del estudio">';
    h += '<form id="sform" role="search" style="margin-bottom:8px"><label class="eyebrow" for="sq" style="padding:0 12px 6px;display:block">Buscar en la guía</label><input class="search" id="sq" type="search" placeholder="OSPF, wildcard, DHCP…"></form>';
    h += '<div class="eyebrow">Dominios</div>';
    C.domains.forEach(function (x) {
      var px = domProgress(x);
      h += '<a href="#/estudio/' + x.n + '" class="' + (x.n === d.n ? 'active' : '') + '"><span class="sw" style="background:' + DOMC[x.n] + '"></span>' + x.n + ' · ' + SHORT[x.n] + '<span class="ck">' + px.p + '%</span></a>';
    });
    h += '<div class="eyebrow">En este dominio</div><a href="#/estudio/' + d.n + '/obj">Objetivos</a>';
    d.sections.forEach(function (s, i) { h += '<a href="#/estudio/' + d.n + '/' + i + '">' + esc(s.title.replace(/^(Apuntes|Profundización|Configuración|Caso práctico):\s*/, '')) + (S.read[d.n + '-' + i] ? '<span class="ck">✓</span>' : '') + '</a>'; });
    h += '<a href="#/estudio/' + d.n + '/quiz">Mini-quiz</a></aside><main class="main">';
    h += '<div class="stack" style="gap:8px"><div class="mono" style="font-size:13px;font-weight:600;color:' + DOMC[d.n] + '">DOMINIO ' + d.n + ' · ' + d.weight + '% DEL EXAMEN</div><h1 style="font-size:clamp(30px,4vw,42px)">' + esc(d.title) + '</h1>' +
      '<div class="content" style="font-size:16px;color:var(--ink-2);max-width:680px">' + blocksHtml(d.intro) + '</div>' +
      '<div class="row" style="margin-top:6px"><div class="meter" style="flex:1;max-width:320px"><i id="dprog" style="width:' + p.p + '%;background:' + DOMC[d.n] + '"></i></div><span class="mono muted" id="dprogt" style="font-size:13px">' + p.done + ' / ' + p.tot + '</span><a class="btn sm" href="#/examen/d' + d.n + '">Preguntas del dominio</a></div></div>';
    h += '<section class="card" id="sec-obj"><div class="between" style="margin-bottom:8px"><h2>Objetivos del temario</h2><span class="mono muted" style="font-size:13px" id="objc"></span></div>';
    d.objectives.forEach(function (o) { h += '<label class="objective"><input type="checkbox" data-obj="' + o.id + '"' + (S.obj[o.id] ? ' checked' : '') + '><span><b>' + o.id + '</b>' + esc(o.text) + '</span></label>'; });
    h += '</section>';
    d.sections.forEach(function (s, i) {
      var trap = /^Trampas/.test(s.title), k = d.n + '-' + i;
      h += '<section class="card' + (trap ? ' trap' : '') + '" id="sec-' + i + '"><div class="sec-head" style="margin-bottom:14px"><h2>' + esc(s.title) + '</h2><button type="button" class="btn sm read-btn" data-read="' + k + '" aria-pressed="' + (!!S.read[k]) + '">' + (S.read[k] ? '✓ Leída' : 'Marcar como leída') + '</button></div><div class="content">' + blocksHtml(s.blocks) + '</div></section>';
    });
    h += '<section class="card stack" id="sec-quiz"><div class="between"><h2>Mini-quiz</h2><span class="mono muted" style="font-size:13px">' + d.miniquiz.length + ' preguntas abiertas</span></div><p class="muted" style="margin:0">Responde mentalmente o en papel y luego revela la respuesta.</p>';
    d.miniquiz.forEach(function (m, i) {
      h += '<div style="border-top:1px solid var(--line-2);padding-top:12px" class="stack"><div style="font-weight:500;font-size:16px"><span class="mono muted">' + (i + 1) + '.</span> ' + esc(m.q) + '</div><div><button class="btn sm" type="button" data-reveal>Mostrar respuesta</button></div><div class="answer" hidden>' + esc(m.a) + '</div></div>';
    });
    h += '</section><div class="row" style="justify-content:space-between">' +
      (d.n > 1 ? '<a class="btn" href="#/estudio/' + (d.n - 1) + '">← Dominio ' + (d.n - 1) + '</a>' : '<span></span>') +
      (d.n < 6 ? '<a class="btn primary" href="#/estudio/' + (d.n + 1) + '">Dominio ' + (d.n + 1) + ' →</a>' : '<a class="btn primary" href="#/examen">Ir al examen →</a>') + '</div>';
    h += '</main></div></div>';
    app.innerHTML = h;

    function refresh() {
      var pp = domProgress(d);
      $('#dprog').style.width = pp.p + '%'; $('#dprogt').textContent = pp.done + ' / ' + pp.tot;
      var oc = d.objectives.filter(function (o) { return S.obj[o.id]; }).length;
      $('#objc').textContent = oc + ' / ' + d.objectives.length;
    }
    refresh();
    $$('[data-obj]').forEach(function (cb) { cb.onchange = function () { S.obj[cb.dataset.obj] = cb.checked; save(); refresh(); }; });
    $$('[data-read]').forEach(function (b) {
      b.onclick = function () { var k = b.dataset.read; S.read[k] = !S.read[k]; save(); b.setAttribute('aria-pressed', !!S.read[k]); b.textContent = S.read[k] ? '✓ Leída' : 'Marcar como leída'; refresh(); };
    });
    $$('[data-reveal]').forEach(function (b) { b.onclick = function () { var a = b.parentNode.nextElementSibling; a.hidden = !a.hidden; b.textContent = a.hidden ? 'Mostrar respuesta' : 'Ocultar'; }; });
    $('#sform').onsubmit = function (e) { e.preventDefault(); var q = $('#sq').value.trim(); if (q) location.hash = '#/estudio/buscar/' + encodeURIComponent(q); };
    if (args[1] != null) { var el = $('#sec-' + args[1]); if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); }, 0); }
  }

  function blockText(b) { return b.t === 'table' ? b.rows.map(function (r) { return r.join(' '); }).join(' ') : b.x; }
  function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function vSearch(q) {
    var nq = norm(q), res = [];
    C.domains.forEach(function (d) {
      d.objectives.forEach(function (o) { if (norm(o.text).indexOf(nq) >= 0) res.push({ d: d, href: '#/estudio/' + d.n + '/obj', title: 'Objetivo ' + o.id, txt: o.text }); });
      d.sections.forEach(function (s, i) {
        var t = s.title + ' ' + s.blocks.map(blockText).join(' ');
        var at = norm(t).indexOf(nq);
        if (at >= 0) res.push({ d: d, href: '#/estudio/' + d.n + '/' + i, title: s.title, txt: t.slice(Math.max(0, at - 70), at + 140) });
      });
    });
    C.glossary.forEach(function (g) { if (norm(g.join(' ')).indexOf(nq) >= 0) res.push({ href: '#/tarjetas', title: 'Glosario: ' + g[0], txt: g[1] }); });
    function mark(t) { var i = norm(t).indexOf(nq); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); }
    var h = '<main class="wrap narrow"><a href="#/estudio/' + S.last + '">← Volver al estudio</a><form id="sform" role="search"><label class="eyebrow" for="sq">Buscar en la guía</label><input class="search" id="sq" type="search" value="' + esc(q) + '" style="margin-top:6px"></form><div class="muted">' + res.length + ' resultados para «' + esc(q) + '»</div>';
    res.slice(0, 80).forEach(function (r) {
      h += '<a class="card stack" style="text-decoration:none;color:var(--ink);gap:6px" href="' + r.href + '">' + (r.d ? '<span class="mono" style="font-size:12px;color:' + DOMC[r.d.n] + '">DOMINIO ' + r.d.n + '</span>' : '') + '<b style="font-family:var(--f-head);font-size:17px">' + esc(r.title) + '</b><span style="color:var(--ink-2);font-size:14px">…' + mark(r.txt) + '…</span></a>';
    });
    app.innerHTML = h + '</main>';
    $('#sform').onsubmit = function (e) { e.preventDefault(); var v = $('#sq').value.trim(); if (v) location.hash = '#/estudio/buscar/' + encodeURIComponent(v); };
  }

  /* ================= EXAM ================= */
  var X = null; // running exam
  function vExam(args) {
    if (X && X.running) return renderQ();
    var pre = args[0] && /^d\d$/.test(args[0]) ? args[0] : null;
    if (pre) { startExam(C.questions.filter(function (q) { return q.d === +pre[1]; }), 'Dominio ' + pre[1], true); return; }
    var wrong = C.questions.filter(function (q) { return S.q[q.id] && S.q[q.id].last === 0; });
    var unseen = C.questions.filter(function (q) { return !S.q[q.id]; });
    var qs = quizStats();
    var h = '<main class="wrap narrow"><div class="stack" style="gap:8px"><div class="eyebrow">Banco de ' + C.questions.length + ' preguntas · respuestas y explicación de la guía</div><h1 style="font-size:clamp(30px,4vw,42px)">Examen de práctica</h1><p class="muted" style="margin:0">Como en el examen real, no puedes volver a una pregunta ya respondida. Presupuesto: ~100 s por pregunta.</p></div>';
    h += '<label class="check card" style="padding:16px 20px"><input type="checkbox" id="instant"' + (S.instant === false ? '' : ' checked') + '><span><b>Corrección inmediata</b><br><span class="muted" style="font-size:14px">Muestra si acertaste y el porqué tras cada respuesta. Desactívalo para un simulacro con resultados al final.</span></span></label>';
    h += '<div class="grid g-fit">' +
      '<button class="mode" type="button" data-mode="sim"><span class="eyebrow">20 preguntas · 33 min</span><b>Simulacro aleatorio</b><span class="muted">Mezcla de todos los dominios.</span></button>' +
      '<button class="mode" type="button" data-mode="all"><span class="eyebrow">' + C.questions.length + ' preguntas · 100 min</span><b>Banco completo</b><span class="muted">Todas las preguntas en orden aleatorio.</span></button>' +
      '<button class="mode" type="button" data-mode="unseen"' + (unseen.length ? '' : ' disabled') + '><span class="eyebrow">' + unseen.length + ' preguntas</span><b>Nunca vistas</b><span class="muted">Las que aún no respondiste.</span></button>' +
      '<button class="mode" type="button" data-mode="wrong"' + (wrong.length ? '' : ' disabled') + '><span class="eyebrow">' + wrong.length + ' preguntas</span><b>Solo mis errores</b><span class="muted">Las que fallaste la última vez.</span></button></div>';
    h += '<div class="card stack"><h2>Por dominio</h2><div class="row">';
    C.domains.forEach(function (d) { var c = C.questions.filter(function (q) { return q.d === d.n; }).length; h += '<button class="btn" type="button" data-dom="' + d.n + '"><span class="sw" style="width:10px;height:10px;border-radius:2px;background:' + DOMC[d.n] + '"></span>D' + d.n + ' · ' + c + '</button>'; });
    h += '</div></div>';
    if (S.exams.length || qs.t) {
      h += '<div class="card stack"><div class="between"><h2>Historial</h2><span class="mono muted" style="font-size:13px">acierto global ' + qs.p + '% (' + qs.c + '/' + qs.t + ')</span></div>';
      S.exams.slice(-6).reverse().forEach(function (e) { h += '<div class="between" style="border-top:1px solid var(--line-2);padding-top:10px"><span>' + esc(e.label) + ' <span class="muted mono" style="font-size:12px">' + esc(e.date) + '</span></span><b class="mono" style="color:' + (e.p >= 82 ? 'var(--ok)' : 'var(--bad)') + '">' + e.c + '/' + e.n + ' · ' + e.p + '%</b></div>'; });
      h += '<div class="muted" style="font-size:13px">Referencia: apunta a 82% o más de forma consistente antes de rendir.</div></div>';
    }
    app.innerHTML = h + '</main>';
    $('#instant').onchange = function () { S.instant = this.checked; save(); };
    $$('[data-mode]').forEach(function (b) {
      b.onclick = function () {
        var m = b.dataset.mode;
        if (m === 'sim') startExam(shuffle(C.questions).slice(0, 20), 'Simulacro 20');
        if (m === 'all') startExam(shuffle(C.questions), 'Banco completo');
        if (m === 'unseen') startExam(shuffle(unseen), 'Nunca vistas');
        if (m === 'wrong') startExam(shuffle(wrong), 'Mis errores');
      };
    });
    $$('[data-dom]').forEach(function (b) { b.onclick = function () { var n = +b.dataset.dom; startExam(shuffle(C.questions.filter(function (q) { return q.d === n; })), 'Dominio ' + n); }; });
  }
  function startExam(list, label, fromStudy) {
    if (!list.length) return;
    X = { running: true, list: fromStudy ? shuffle(list) : list, i: 0, ans: [], label: label, instant: S.instant !== false, start: Date.now(), budget: list.length * 100, answered: false };
    if (location.hash !== '#/examen') location.hash = '#/examen'; else renderQ();
  }
  function renderQ() {
    var q = X.list[X.i], n = X.list.length;
    var correct = X.ans.filter(function (a) { return a.ok; }).length;
    var h = '<main class="wrap narrow"><div class="stack" style="gap:10px"><div class="between mono" style="font-size:13px"><span class="muted">PREGUNTA ' + (X.i + 1) + ' DE ' + n + ' · SIN VOLVER ATRÁS</span><span class="muted">' + (X.instant ? correct + ' correctas' : esc(X.label)) + '</span></div><div class="progress" style="grid-template-columns:repeat(' + Math.min(n, 60) + ',minmax(0,1fr))">';
    for (var i = 0; i < Math.min(n, 60); i++) { var a = X.ans[i]; h += '<i class="' + (i === X.i ? 'cur' : a ? (X.instant ? (a.ok ? 'ok' : 'bad') : 'cur') : '') + '"></i>'; }
    h += '</div></div><section class="card stack" style="gap:20px;padding:clamp(20px,4vw,32px)"><div class="row"><span class="chip" style="color:' + DOMC[q.d] + '">DOMINIO ' + q.d + ' · ' + SHORT[q.d].toUpperCase() + '</span><span class="chip">#' + q.id + '</span></div><h1 class="q-stem">' + esc(q.q) + '</h1><div class="opts" id="opts">';
    q.o.forEach(function (o, k) { h += '<button class="opt" type="button" data-k="' + k + '"><span class="k">' + 'abcd'[k] + '</span><span>' + esc(o) + '</span><span class="tag"></span></button>'; });
    h += '</div><div id="fb"></div><div class="row" style="justify-content:space-between"><button class="btn sm" type="button" id="quit">Terminar ahora</button><button class="btn primary" type="button" id="next" disabled>' + (X.i + 1 < n ? 'Siguiente pregunta →' : 'Ver resultados') + '</button></div></section><p class="muted" style="font-size:13px;margin:0">Atajos: teclas 1–4 o a–d para responder, Enter para continuar.</p></main>';
    app.innerHTML = h;
    X.answered = false;
    $$('#opts .opt').forEach(function (b) { b.onclick = function () { answer(+b.dataset.k); }; });
    $('#next').onclick = nextQ;
    $('#quit').onclick = function () { confirm2(this, '¿Seguro? Pulsa otra vez', finish); };
    tick();
  }
  function answer(k) {
    if (X.answered) return;
    X.answered = true;
    var q = X.list[X.i], ok = k === q.a;
    X.ans[X.i] = { id: q.id, k: k, ok: ok };
    var st = S.q[q.id] || { c: 0, w: 0 }; if (ok) st.c++; else st.w++; st.last = ok ? 1 : 0; S.q[q.id] = st; save();
    $$('#opts .opt').forEach(function (b) {
      var bk = +b.dataset.k; b.disabled = true;
      if (X.instant) {
        if (bk === q.a) { b.classList.add('ok'); b.querySelector('.tag').textContent = 'CORRECTA'; }
        else if (bk === k) { b.classList.add('bad'); b.querySelector('.tag').textContent = 'TU RESPUESTA'; }
      } else if (bk === k) b.classList.add('sel');
    });
    if (X.instant) $('#fb').innerHTML = '<div class="why stack" style="gap:6px"><div class="eyebrow">' + (ok ? '✓ Correcto · por qué' : '✗ Incorrecto · por qué') + '</div><div>' + esc(q.why) + '</div></div>';
    var nb = $('#next'); nb.disabled = false; nb.focus();
  }
  function nextQ() { if (!X.answered) return; X.i++; if (X.i >= X.list.length) finish(); else { renderQ(); window.scrollTo(0, 0); } }
  var timerId = null;
  function tick() {
    clearInterval(timerId);
    function upd() {
      if (!X || !X.running) { clearInterval(timerId); return; }
      var left = X.budget - (Date.now() - X.start) / 1000;
      var el = $('#top-timer'); if (el) el.textContent = '⏱ ' + fmtTime(left);
      if (left <= 0) { clearInterval(timerId); toast('Se acabó el tiempo'); finish(); }
    }
    upd(); timerId = setInterval(upd, 1000);
    cleanup = function () { clearInterval(timerId); };
  }
  function finish() {
    clearInterval(timerId); $('#top-timer').textContent = '';
    var n = X.ans.length, c = X.ans.filter(function (a) { return a.ok; }).length, p = pct(c, n), secs = (Date.now() - X.start) / 1000;
    X.running = false;
    if (n) { S.exams.push({ label: X.label, n: n, c: c, p: p, date: new Date().toLocaleDateString('es') }); S.exams = S.exams.slice(-30); save(); }
    var by = {};
    X.ans.forEach(function (a) { var q = C.questions[a.id - 1]; by[q.d] = by[q.d] || { c: 0, n: 0 }; by[q.d].n++; if (a.ok) by[q.d].c++; });
    var h = '<main class="wrap narrow"><section class="console stack" style="gap:16px"><div class="eyebrow">● Resultado · ' + esc(X.label) + '</div><div class="row" style="gap:24px;align-items:flex-end"><div class="score-big">' + p + '%</div><div class="mono" style="color:var(--console-muted)">' + c + ' de ' + n + ' correctas · ' + fmtTime(secs) + '</div></div><div style="color:var(--console-muted)">' + (p >= 82 ? 'Buen nivel. Mantén este porcentaje en varios simulacros antes de rendir.' : 'Repasa los dominios marcados en rojo y vuelve a intentarlo con «Solo mis errores».') + '</div></section>';
    h += '<section class="card stack"><h2>Por dominio</h2>';
    Object.keys(by).sort().forEach(function (d) { var b = by[d], pp = pct(b.c, b.n); h += '<div class="stack" style="gap:6px"><div class="between"><a href="#/estudio/' + d + '">D' + d + ' · ' + SHORT[d] + '</a><span class="mono">' + b.c + '/' + b.n + '</span></div><div class="meter"><i style="width:' + pp + '%;background:' + (pp >= 80 ? 'var(--ok)' : 'var(--bad)') + '"></i></div></div>'; });
    h += '</section>';
    var wr = X.ans.filter(function (a) { return !a.ok; });
    if (wr.length) {
      h += '<section class="card stack"><h2>Para repasar (' + wr.length + ')</h2>';
      wr.forEach(function (a) { var q = C.questions[a.id - 1]; h += '<div class="stack" style="gap:6px;border-top:1px solid var(--line-2);padding-top:12px"><b>' + esc(q.q) + '</b><div style="color:var(--bad-ink)">Tu respuesta: ' + 'abcd'[a.k] + ') ' + esc(q.o[a.k]) + '</div><div style="color:var(--ok-ink)">Correcta: ' + 'abcd'[q.a] + ') ' + esc(q.o[q.a]) + '</div><div class="muted">' + esc(q.why) + '</div></div>'; });
      h += '</section>';
    }
    h += '<div class="row"><button class="btn primary" type="button" id="again">Nuevo examen</button>' + (wr.length ? '<button class="btn" type="button" id="retry">Repetir mis errores</button>' : '') + '</div></main>';
    app.innerHTML = h; window.scrollTo(0, 0);
    $('#again').onclick = function () { X = null; route(); };
    if (wr.length) $('#retry').onclick = function () { startExam(shuffle(wr.map(function (a) { return C.questions[a.id - 1]; })), 'Mis errores'); };
  }

  /* ================= SUBNETTING ================= */
  function ipToInt(s) { var p = s.trim().split('.'); if (p.length !== 4) return null; var n = 0; for (var i = 0; i < 4; i++) { if (!/^\d{1,3}$/.test(p[i]) || +p[i] > 255) return null; n = n * 256 + (+p[i]); } return n >>> 0; }
  function intToIp(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
  function maskOf(p) { return p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0; }
  function genSubnet() {
    var ps = [17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 25, 26, 27, 28, 29, 9, 10, 11, 12, 13, 14, 15, 30];
    var p = ps[rnd(0, ps.length - 1)];
    var f = [10, 172, 192, rnd(1, 223)][rnd(0, 3)];
    if (f === 192 && p < 16) f = 10;
    var s = f === 172 ? rnd(16, 31) : f === 192 ? 168 : rnd(0, 255);
    var ip = ((f << 24) | (s << 16) | (rnd(0, 255) << 8) | rnd(1, 254)) >>> 0;
    var m = maskOf(p), net = (ip & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0;
    var oct = Math.floor(p / 8), mv = 256 - Math.pow(2, 8 - p % 8);
    return { ip: ip, p: p, mask: m, net: net, bc: bc, first: net + 1, last: bc - 1, hosts: Math.pow(2, 32 - p) - 2, oct: oct, mv: mv, block: 256 - mv };
  }
  var SUB = { mode: 'ipv4', cur: null, t0: 0 };
  function vSubnet() {
    var tabs = [['ipv4', 'IPv4: red y hosts'], ['wild', 'Máscara y wildcard'], ['ipv6', 'IPv6'], ['guia', 'Ejercicios de la guía']];
    var h = '<main class="wrap"><div class="between" style="align-items:flex-end"><div class="stack" style="gap:8px"><div class="eyebrow">Ejercicios aleatorios · meta &lt; 30 s</div><h1 style="font-size:clamp(30px,4vw,42px)">Taller de subnetting</h1></div><div class="row" role="group" aria-label="Modo">';
    tabs.forEach(function (t) { h += '<button class="btn" type="button" data-sm="' + t[0] + '" aria-pressed="' + (SUB.mode === t[0]) + '">' + t[1] + '</button>'; });
    h += '</div></div><div id="sub-body"></div>' +
      '<section class="card stack"><h2>Método rápido (de la guía)</h2><ol class="steps"><li>Mira el octeto «interesante» (donde la máscara no es 255 ni 0).</li><li>Tamaño de bloque = 256 − valor de la máscara en ese octeto.</li><li>Las redes empiezan en múltiplos del bloque: la red es el múltiplo inmediatamente inferior.</li><li>Broadcast = siguiente red − 1. Hosts válidos = entre red+1 y broadcast−1.</li><li>Hosts por subred = 2^bits de host − 2. Subredes = 2^bits prestados.</li></ol></section></main>';
    app.innerHTML = h;
    $$('[data-sm]').forEach(function (b) { b.onclick = function () { SUB.mode = b.dataset.sm; SUB.cur = null; vSubnet(); }; });
    ({ ipv4: subIPv4, wild: subWild, ipv6: subIPv6, guia: subGuide })[SUB.mode]();
    var iv = setInterval(function () { var el = $('#sub-time'); if (el && SUB.t0 && !SUB.done) el.textContent = fmtTime((Date.now() - SUB.t0) / 1000); }, 500);
    cleanup = function () { clearInterval(iv); };
  }
  function bitsHtml(p, oct) {
    var h = '<div class="bits" aria-hidden="true">';
    for (var i = 0; i < 32; i++) h += '<i class="' + (i < p ? (Math.floor(i / 8) === oct && p % 8 ? 'x' : 'n') : '') + '"></i>';
    return h + '</div>';
  }
  function streakHtml() { return '<span class="mono muted" style="margin-left:auto">racha ' + S.sub.streak + ' · mejor ' + S.sub.best + ' · <span id="sub-time">0:00</span></span>'; }
  function scored(allOk) {
    SUB.done = true;
    if (allOk) { S.sub.solved++; S.sub.streak++; S.sub.best = Math.max(S.sub.best, S.sub.streak); var t = (Date.now() - SUB.t0) / 1000; toast(t <= 30 ? '¡Correcto en ' + Math.round(t) + ' s!' : 'Correcto · ' + Math.round(t) + ' s (meta 30 s)'); }
    else S.sub.streak = 0;
    save();
  }
  function fieldsForm(fields, id) {
    var h = '<form class="card stack" id="' + id + '" autocomplete="off" style="gap:16px">';
    fields.forEach(function (f) { h += '<label class="field">' + f[1] + '<input name="' + f[0] + '" type="text" inputmode="' + (f[2] || 'decimal') + '" placeholder="' + (f[3] || 'x.x.x.x') + '" spellcheck="false"><span class="fb" hidden></span></label>'; });
    return h + '<div class="row"><button class="btn primary" type="submit">Comprobar</button><button class="btn" type="button" data-new>Nueva</button>' + streakHtml() + '</div><div id="explain"></div></form>';
  }
  function checkFields(form, expect) {
    var all = true;
    Object.keys(expect).forEach(function (k) {
      var inp = form.elements[k], fb = inp.parentNode.querySelector('.fb');
      var v = inp.value.trim().replace(/\s+/g, ''), e = expect[k];
      var ok = typeof e === 'function' ? e(v) : v.toLowerCase() === String(e).toLowerCase();
      inp.classList.toggle('ok', ok); inp.classList.toggle('bad', !ok);
      fb.hidden = ok; if (!ok) fb.textContent = 'Respuesta: ' + (typeof e === 'function' ? e.label : e);
      if (!ok) all = false;
    });
    return all;
  }
  function subIPv4() {
    var c = SUB.cur || (SUB.cur = genSubnet()); SUB.t0 = Date.now(); SUB.done = false;
    var on = ['1.º', '2.º', '3.er', '4.º'][c.oct];
    var h = '<section class="grid g-fit" style="gap:24px"><div class="console stack" style="gap:20px"><div class="eyebrow">● Dirección</div><div class="ip-big">' + intToIp(c.ip) + '<span class="pfx">/' + c.p + '</span></div><div class="stack" style="gap:6px"><div class="mono" style="font-size:12px;color:var(--console-muted)">BITS DE RED · ' + on.toUpperCase() + ' OCTETO ES EL INTERESANTE</div>' + bitsHtml(c.p, c.oct) + '</div>' +
      '<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:12px"><div class="kv"><small>MÁSCARA</small><span id="k-mask">?</span></div><div class="kv"><small>BLOQUE</small><span id="k-block">?</span></div></div><button class="btn sm" type="button" id="hint" style="align-self:flex-start;background:var(--console-2);color:var(--console-ink);border-color:#3A3E45">Pista: mostrar máscara y bloque</button></div>';
    h += fieldsForm([['net', 'Dirección de red'], ['bc', 'Broadcast'], ['first', 'Primer host válido'], ['last', 'Último host válido'], ['hosts', 'Hosts por subred', 'numeric', '2^n − 2']], 'f4') + '</section>';
    $('#sub-body').innerHTML = h;
    $('#hint').onclick = function () { $('#k-mask').textContent = intToIp(c.mask); $('#k-block').textContent = '256 − ' + c.mv + ' = ' + c.block; };
    var f = $('#f4');
    f.onsubmit = function (e) {
      e.preventDefault();
      var ok = checkFields(f, { net: intToIp(c.net), bc: intToIp(c.bc), first: intToIp(c.first), last: intToIp(c.last), hosts: String(c.hosts) });
      $('#hint').click();
      var octv = (c.ip >>> (24 - 8 * c.oct)) & 255, netv = (c.net >>> (24 - 8 * c.oct)) & 255;
      $('#explain').innerHTML = '<div class="why stack" style="gap:6px"><div class="eyebrow">Paso a paso</div><div>/' + c.p + ' → máscara ' + intToIp(c.mask) + '. Octeto interesante: el ' + on + ' (valor ' + c.mv + ').</div><div>Bloque = 256 − ' + c.mv + ' = <b>' + c.block + '</b>. ' + octv + ' cae en el múltiplo ' + netv + ' (siguiente: ' + (netv + c.block) + ').</div><div>Red ' + intToIp(c.net) + ' · broadcast ' + intToIp(c.bc) + ' · hosts 2^' + (32 - c.p) + ' − 2 = ' + c.hosts + '.</div></div>';
      if (!SUB.done) scored(ok);
    };
    f.querySelector('[data-new]').onclick = function () { SUB.cur = null; subIPv4(); };
    f.elements.net.focus({ preventScroll: true });
  }
  function subWild() {
    var c = SUB.cur || (SUB.cur = { p: rnd(8, 30) }); SUB.t0 = Date.now(); SUB.done = false;
    var m = maskOf(c.p), w = (~m) >>> 0;
    var h = '<section class="grid g-fit" style="gap:24px"><div class="console stack" style="gap:20px"><div class="eyebrow">● Prefijo</div><div class="ip-big"><span class="pfx">/' + c.p + '</span></div>' + bitsHtml(c.p, -1) + '<div style="color:var(--console-muted)">Escribe la máscara decimal, la wildcard (como en ACL y OSPF) y cuántos hosts válidos tiene.</div><div class="mono" style="color:var(--console-muted);font-size:13px">Truco: wildcard = 255.255.255.255 − máscara.</div></div>';
    h += fieldsForm([['mask', 'Máscara de subred'], ['wild', 'Wildcard'], ['hosts', 'Hosts válidos', 'numeric', '2^n − 2']], 'fw') + '</section>';
    $('#sub-body').innerHTML = h;
    var f = $('#fw');
    f.onsubmit = function (e) {
      e.preventDefault();
      var hosts = c.p >= 31 ? (c.p === 31 ? 2 : 1) : Math.pow(2, 32 - c.p) - 2;
      var ok = checkFields(f, { mask: intToIp(m), wild: intToIp(w), hosts: String(hosts) });
      if (!SUB.done) scored(ok);
    };
    f.querySelector('[data-new]').onclick = function () { SUB.cur = null; subWild(); };
  }
  function v6full(groups) { return groups.map(function (g) { return ('0000' + g.toString(16)).slice(-4).toUpperCase(); }).join(':'); }
  function v6short(groups) {
    var best = -1, bl = 0;
    for (var i = 0; i < 8;) { if (groups[i] === 0) { var j = i; while (j < 8 && groups[j] === 0) j++; if (j - i > bl && j - i >= 2) { best = i; bl = j - i; } i = j; } else i++; }
    var hx = groups.map(function (g) { return g.toString(16).toUpperCase(); });
    if (best < 0) return hx.join(':');
    return hx.slice(0, best).join(':') + '::' + hx.slice(best + bl).join(':');
  }
  function v6parse(s) {
    s = s.trim(); if (!/^[0-9a-fA-F:]+$/.test(s)) return null;
    var dbl = s.split('::'); if (dbl.length > 2) return null;
    var a = dbl[0] ? dbl[0].split(':') : [], b = dbl.length > 1 && dbl[1] ? dbl[1].split(':') : [];
    if (dbl.length === 1 && a.length !== 8) return null;
    var fill = 8 - a.length - b.length; if (fill < (dbl.length > 1 ? 1 : 0)) return null;
    var all = a.concat(dbl.length > 1 ? new Array(fill).fill('0') : [], b);
    if (all.some(function (g) { return !/^[0-9a-fA-F]{1,4}$/.test(g); })) return null;
    return all.map(function (g) { return parseInt(g, 16); });
  }
  function genV6() {
    var pref = [[0x2001, 0xdb8], [0xfe80, 0], [0x2001, 0xdb8], [0xfd00, rnd(0, 0xff)]][rnd(0, 3)];
    var g = [pref[0], pref[1]];
    for (var i = 2; i < 8; i++) { var r = Math.random(); g.push(r < .35 ? 0 : r < .6 ? rnd(1, 0xff) : r < .75 ? rnd(1, 0xf) : rnd(0x100, 0xffff)); }
    var st = rnd(2, 5), ln = rnd(2, 8 - st); for (var k = st; k < st + ln && k < 8; k++) g[k] = 0;
    if (g[7] === 0) g[7] = rnd(1, 0xff);
    return { g: g, task: Math.random() < .6 ? 'abbr' : 'exp' };
  }
  function subIPv6() {
    var c = SUB.cur || (SUB.cur = genV6()); SUB.t0 = Date.now(); SUB.done = false;
    var full = v6full(c.g), short = v6short(c.g), abbr = c.task === 'abbr';
    var h = '<section class="grid g-fit" style="gap:24px"><div class="console stack" style="gap:20px"><div class="eyebrow">● ' + (abbr ? 'Abrevia al máximo' : 'Expande por completo') + '</div><div class="ip-big" style="font-size:clamp(18px,2.6vw,26px)">' + (abbr ? full : short) + '</div><ul class="steps" style="color:var(--console-muted)"><li>Quita los ceros a la izquierda de cada grupo.</li><li>Reemplaza UNA sola vez la secuencia más larga de grupos 0000 por ::</li><li>Al expandir: 8 grupos de 4 dígitos hexadecimales.</li></ul></div>';
    h += fieldsForm([['a', abbr ? 'Forma abreviada' : 'Forma completa (8 grupos)', 'text', abbr ? '2001:DB8::1' : '2001:0DB8:0000:…']], 'f6') + '</section>';
    $('#sub-body').innerHTML = h;
    var f = $('#f6');
    f.onsubmit = function (e) {
      e.preventDefault();
      var chk;
      if (abbr) { chk = function (v) { return v.toUpperCase() === short; }; chk.label = short; }
      else { chk = function (v) { return /^([0-9a-fA-F]{4}:){7}[0-9a-fA-F]{4}$/.test(v) && v.toUpperCase() === full; }; chk.label = full; }
      var ok = checkFields(f, { a: chk });
      if (!SUB.done) scored(ok);
    };
    f.querySelector('[data-new]').onclick = function () { SUB.cur = null; subIPv6(); };
  }
  function subGuide() {
    SUB.t0 = 0;
    var h = '<section class="card stack"><div class="between"><h2>Ejercicios de la guía</h2><span class="mono muted" style="font-size:13px" id="exc"></span></div><p class="muted" style="margin:0">Resuélvelos en papel, revela la respuesta y marca si lo acertaste.</p>';
    C.exercises.forEach(function (x, i) {
      var st = S.ex[i];
      h += '<div class="stack" style="gap:8px;border-top:1px solid var(--line-2);padding-top:12px"><div style="font-weight:500;font-size:16px"><span class="mono muted">' + (i + 1) + '.</span> ' + esc(x.q) + (st ? ' <span class="chip" style="color:' + (st === 1 ? 'var(--ok)' : 'var(--bad)') + '">' + (st === 1 ? '✓ acertado' : 'a repasar') + '</span>' : '') + '</div><div class="row"><button class="btn sm" type="button" data-rv>Mostrar respuesta</button></div><div class="stack" hidden><div class="answer">' + esc(x.a) + '</div><div class="row"><button class="btn sm" type="button" data-ex="' + i + '" data-v="1">Lo acerté</button><button class="btn sm" type="button" data-ex="' + i + '" data-v="2">Lo fallé</button></div></div></div>';
    });
    h += '</section><section class="card stack"><h2>Ejercicio VLSM</h2><p style="margin:0">' + esc(C.vlsm.prompt) + '</p><div><button class="btn" type="button" id="vl-btn">Mostrar solución</button></div><div id="vl" class="stack" hidden>' + tableHtml(C.vlsm.table) + '<p class="muted" style="margin:0">' + esc(C.vlsm.note) + '</p></div></section>';
    $('#sub-body').innerHTML = h;
    $('#exc').textContent = Object.keys(S.ex).filter(function (k) { return S.ex[k] === 1; }).length + ' / ' + C.exercises.length + ' acertados';
    $$('[data-rv]').forEach(function (b) { b.onclick = function () { var a = b.parentNode.nextElementSibling; a.hidden = !a.hidden; b.textContent = a.hidden ? 'Mostrar respuesta' : 'Ocultar'; }; });
    $$('[data-ex]').forEach(function (b) { b.onclick = function () { S.ex[b.dataset.ex] = +b.dataset.v; save(); subGuide(); }; });
    $('#vl-btn').onclick = function () { var v = $('#vl'); v.hidden = !v.hidden; this.textContent = v.hidden ? 'Mostrar solución' : 'Ocultar solución'; };
  }

  /* ================= FLASHCARDS ================= */
  var DECKS = { num: ['Números para memorizar', C.numbers], glo: ['Glosario de siglas', C.glossary], cmd: ['Comandos show', C.commands] };
  function allCards() { var out = []; Object.keys(DECKS).forEach(function (k) { DECKS[k][1].forEach(function (r, i) { out.push({ key: k + i, deck: k, f: r[0], b: r[1] }); }); }); return out; }
  var FC = { deck: 'num', queue: null, i: 0, flip: false, inv: false };
  function buildQueue() {
    var cards = allCards().filter(function (c) { return FC.deck === 'all' || c.deck === FC.deck; });
    var byBox = [[], [], [], []]; cards.forEach(function (c) { byBox[Math.min(S.cards[c.key] || 0, 3)].push(c); });
    FC.queue = [].concat(shuffle(byBox[0]), shuffle(byBox[1]), shuffle(byBox[2]), shuffle(byBox[3])); FC.i = 0; FC.flip = false;
  }
  function vCards() {
    if (!FC.queue) buildQueue();
    var cards = allCards().filter(function (c) { return FC.deck === 'all' || c.deck === FC.deck; });
    var box = [0, 0, 0, 0]; cards.forEach(function (c) { box[Math.min(S.cards[c.key] || 0, 3)]++; });
    var c = FC.queue[FC.i];
    var h = '<main class="wrap narrow"><div class="stack" style="gap:8px"><div class="eyebrow">Repetición espaciada · 4 cajas</div><h1 style="font-size:clamp(30px,4vw,42px)">Tarjetas</h1></div><div class="row" role="group" aria-label="Mazo">';
    [['num', 'Números'], ['glo', 'Glosario'], ['cmd', 'Comandos'], ['all', 'Todo']].forEach(function (d) { h += '<button class="btn" type="button" data-deck="' + d[0] + '" aria-pressed="' + (FC.deck === d[0]) + '">' + d[1] + '</button>'; });
    h += '<label class="row" style="margin-left:auto;gap:8px;font-size:14px"><input type="checkbox" id="inv"' + (FC.inv ? ' checked' : '') + ' style="width:18px;height:18px">Invertir (respuesta → pregunta)</label></div>';
    h += '<div class="boxes">' + ['Nuevas', 'Caja 1', 'Caja 2', 'Dominadas'].map(function (l, i) { return '<div><b>' + box[i] + '</b><span class="muted" style="font-size:12.5px">' + l + '</span></div>'; }).join('') + '</div>';
    if (c) {
      var front = FC.inv ? c.b : c.f, back = FC.inv ? c.f : c.b;
      h += '<div class="mono muted" style="font-size:13px">' + (FC.i + 1) + ' / ' + FC.queue.length + ' · ' + DECKS[c.deck][0] + '</div><button class="flash' + (FC.flip ? ' flip' : '') + '" type="button" id="flash" aria-label="Girar tarjeta"><div class="flash-in"><div class="face front"><span class="eyebrow">' + (FC.inv ? 'Respuesta' : 'Pregunta') + '</span><div class="big">' + esc(front) + '</div><span class="muted" style="font-size:13px">Toca o pulsa Espacio para girar</span></div><div class="face back"><span class="eyebrow" style="color:var(--led)">' + esc(front) + '</span><div class="ans">' + esc(back) + '</div></div></div></button>';
      h += '<div class="row" style="justify-content:center"><button class="btn" type="button" id="again" ' + (FC.flip ? '' : 'disabled') + '>✗ Repasar <span class="mono muted">1</span></button><button class="btn primary" type="button" id="know" ' + (FC.flip ? '' : 'disabled') + '>✓ Lo sé <span class="mono" style="opacity:.7">2</span></button></div>';
    } else h += '<div class="card stack" style="text-align:center;align-items:center"><h2>¡Mazo completado!</h2><p class="muted" style="margin:0">Vuelve a pasar el mazo para reforzar.</p><button class="btn primary" type="button" id="restart">Empezar de nuevo</button></div>';
    h += '<div class="row" style="justify-content:center"><button class="btn sm" type="button" id="reset-deck">Reiniciar cajas de este mazo</button></div></main>';
    app.innerHTML = h;
    $$('[data-deck]').forEach(function (b) { b.onclick = function () { FC.deck = b.dataset.deck; buildQueue(); vCards(); }; });
    $('#inv').onchange = function () { FC.inv = this.checked; FC.flip = false; vCards(); };
    if (c) {
      $('#flash').onclick = function () { FC.flip = !FC.flip; this.classList.toggle('flip', FC.flip); $('#again').disabled = $('#know').disabled = !FC.flip; };
      $('#again').onclick = function () { rate(false); };
      $('#know').onclick = function () { rate(true); };
    } else $('#restart').onclick = function () { buildQueue(); vCards(); };
    $('#reset-deck').onclick = function () { confirm2(this, '¿Seguro? Pulsa otra vez para reiniciar', resetDeck); };
    function resetDeck() { cards.forEach(function (x) { delete S.cards[x.key]; }); save(); buildQueue(); vCards(); };
  }
  function rate(ok) {
    var c = FC.queue[FC.i]; if (!c || !FC.flip) return;
    S.cards[c.key] = ok ? Math.min((S.cards[c.key] || 0) + 1, 3) : 0; save();
    if (!ok) FC.queue.push(c);
    FC.i++; FC.flip = false; vCards();
  }

  /* ================= LABS ================= */
  function vLabs() {
    var done = C.labs.filter(function (l, i) { return S.labs[i]; }).length;
    var h = '<main class="wrap narrow"><div class="stack" style="gap:8px"><div class="eyebrow">Packet Tracer · ' + done + ' / ' + C.labs.length + ' completados</div><h1 style="font-size:clamp(30px,4vw,42px)">Laboratorios guiados</h1><p class="muted" style="margin:0">' + esc(C.labsIntro.join(' ')) + '</p></div>';
    C.labs.forEach(function (l, i) {
      var m = l.title.match(/^(Lab \d+) — (.*)$/) || [0, 'Lab', l.title];
      h += '<details class="lab card"' + (i === 0 && !done ? ' open' : '') + '><summary><span class="chip">' + esc(m[1]) + '</span><b style="font-family:var(--f-head);font-size:18px" class="' + (S.labs[i] ? 'done-txt' : '') + '">' + esc(m[2]) + '</b>' + (S.labs[i] ? '<span class="mono" style="color:var(--ok);font-size:13px">✓</span>' : '') + '</summary><div class="stack" style="margin-top:16px;gap:14px"><p style="margin:0">' + esc(l.task) + '</p><div><button class="btn sm" type="button" data-sol>Mostrar solución</button></div><div hidden>' + codeBlock(l.code) + '</div><div class="why stack" style="gap:6px"><div class="eyebrow">Verificación</div><div>' + esc(l.verify) + '</div></div><label class="check"><input type="checkbox" data-lab="' + i + '"' + (S.labs[i] ? ' checked' : '') + '><span>Laboratorio completado y verificado</span></label></div></details>';
    });
    h += '<section class="card stack"><h2>Método de troubleshooting para simulaciones</h2><ol class="steps">' + C.trouble.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></section></main>';
    app.innerHTML = h;
    $$('[data-sol]').forEach(function (b) { b.onclick = function () { var s = b.parentNode.nextElementSibling; s.hidden = !s.hidden; b.textContent = s.hidden ? 'Mostrar solución' : 'Ocultar solución'; }; });
    $$('[data-lab]').forEach(function (cb) { cb.onchange = function () { S.labs[cb.dataset.lab] = cb.checked; save(); var o = $$('details.lab').map(function (d) { return d.open; }); vLabs(); $$('details.lab').forEach(function (d, i) { d.open = o[i]; }); }; });
  }

  /* ================= PLAN ================= */
  function vPlan() {
    var sum = C.summary, tbl = sum.filter(function (b) { return b.t === 'table'; })[0];
    var h = '<main class="wrap narrow"><div class="stack" style="gap:8px"><div class="eyebrow">Resumen y plan</div><h1 style="font-size:clamp(30px,4vw,42px)">Plan de repaso final</h1></div>';
    h += '<section class="card stack"><h2>Resumen del examen</h2><div class="content">' + blocksHtml(sum) + '</div></section>';
    h += '<section class="card"><div class="between" style="margin-bottom:6px"><h2>2 semanas</h2><span class="mono muted" style="font-size:13px">' + C.plan.filter(function (p, i) { return S.plan[i]; }).length + ' / ' + C.plan.length + '</span></div>';
    C.plan.forEach(function (p, i) { h += '<label class="check"><input type="checkbox" data-plan="' + i + '"' + (S.plan[i] ? ' checked' : '') + '><span class="' + (S.plan[i] ? 'done-txt' : '') + '">' + esc(p) + '</span></label>'; });
    h += '<div class="why" style="margin-top:12px">' + esc(C.planTip.join(' ')) + '</div></section>';
    h += '<section class="card stack"><h2>Comandos de verificación clave</h2>' + tableHtml([['Comando', 'Para qué']].concat(C.commands)) + '</section>';
    h += '<section class="card stack"><h2>Recursos</h2><ul class="steps">' + C.resources.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><div class="muted" style="font-size:13px">Fuentes: ' + esc(C.sources.join(' · ')) + '</div></section>';
    h += '<section class="card stack"><h2>Datos</h2><p class="muted" style="margin:0">Tu progreso vive solo en este navegador.</p><div class="row"><button class="btn" type="button" id="exp">Exportar progreso</button><label class="btn" for="imp" style="cursor:pointer">Importar progreso</label><input id="imp" type="file" accept="application/json" hidden><button class="btn" type="button" id="wipe">Borrar todo el progreso</button></div></section></main>';
    app.innerHTML = h;
    $$('[data-plan]').forEach(function (cb) { cb.onchange = function () { S.plan[cb.dataset.plan] = cb.checked; save(); cb.nextElementSibling.className = cb.checked ? 'done-txt' : ''; }; });
    $('#exp').onclick = function () { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })); a.download = 'ccna-progreso.json'; a.click(); };
    $('#imp').onchange = function () { var f = this.files[0]; if (!f) return; f.text().then(function (t) { try { S = Object.assign(S, JSON.parse(t)); save(); toast('Progreso importado'); vPlan(); } catch (e) { toast('Archivo no válido'); } }); };
    $('#wipe').onclick = function () { confirm2(this, 'No se puede deshacer: pulsa otra vez', function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }); };
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    var r = location.hash.split('/')[1];
    if (r === 'examen' && X && X.running) {
      var k = '1234'.indexOf(e.key); if (k < 0) k = 'abcd'.indexOf(e.key.toLowerCase());
      if (k >= 0 && !X.answered) { e.preventDefault(); answer(k); }
      else if (e.key === 'Enter' && X.answered && e.target.id !== 'next') { e.preventDefault(); nextQ(); }
    } else if (r === 'tarjetas' && FC.queue && FC.queue[FC.i]) {
      if (e.key === ' ') { e.preventDefault(); var f = $('#flash'); if (f) f.click(); }
      else if (e.key === '1' && FC.flip) rate(false);
      else if (e.key === '2' && FC.flip) rate(true);
    }
  });

  route();
})();
