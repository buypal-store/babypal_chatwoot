/* horario.js — Horario de entrega del pedido (Luis, 09/11/2026).
 *
 * El mismo archivo vive en el ERP (frontend/horario.js: Admin y Despacho) y en cada tomador de pedidos
 * (js/horario.js de buypal_chatwoot, babypal_chatwoot, strenko_buypal y sento_chatwoot). Si se cambia, se copia
 * igual a los cinco.
 *
 * Valor guardado (pedidos.horario): '-10:00' hasta las 10 a. m. · '15:00-' desde las 3 p. m. ·
 * '09:00-13:00' entre las dos · '' cualquier hora. Minutos de 15 en 15. El servidor (api/shared/horario.js) y la
 * base (restricción pedidos_horario_valido) aplican la misma regla.
 *
 * Horario.abrir({ valor, tema, alListo }) abre el selector de ruedas "tipo alarma" con DESDE y HASTA, cada uno con
 * su interruptor. En el tomador se monta solo debajo de Turno (montarTomador).
 */
(function (global) {
  'use strict';
  if (global.Horario) return;

  var HORA = /^([01]\d|2[0-3]):(00|15|30|45)$/;
  function hora(v) {
    var t = String(v == null ? '' : v).trim();
    var m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2] : t;
  }
  function normalizar(entrada) {
    var desde = '', hasta = '';
    if (entrada && typeof entrada === 'object') { desde = hora(entrada.desde); hasta = hora(entrada.hasta); }
    else {
      var t = String(entrada == null ? '' : entrada).trim();
      if (!t || t === '-') return { ok: true, valor: '' };
      var p = t.split('-');
      if (p.length !== 2) return { ok: false, error: 'Horario no válido' };
      desde = hora(p[0]); hasta = hora(p[1]);
    }
    if (!desde && !hasta) return { ok: true, valor: '' };
    if ((desde && !HORA.test(desde)) || (hasta && !HORA.test(hasta))) return { ok: false, error: 'Hora no válida' };
    if (desde === '00:00' || hasta === '00:00') return { ok: false, error: 'Las 12:00 a. m. (medianoche) no sirven como límite.' };
    if (desde && hasta && desde >= hasta) return { ok: false, error: '«Desde» tiene que ser antes que «Hasta».' };
    return { ok: true, valor: desde + '-' + hasta };
  }
  function partes(v) {
    var r = normalizar(v);
    if (!r.ok || !r.valor) return { desde: '', hasta: '' };
    var p = r.valor.split('-');
    return { desde: p[0], hasta: p[1] };
  }
  var aMin = function (h) { var p = h.split(':'); return (+p[0]) * 60 + (+p[1]); };
  var deMin = function (m) { var h = Math.floor(m / 60), mi = m % 60; return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi; };
  function texto12(h, corto) {
    if (!h) return '';
    var p = h.split(':'), H = +p[0], M = +p[1], h12 = ((H + 11) % 12) + 1, mer = H < 12 ? 'a. m.' : 'p. m.';
    return corto && M === 0 ? h12 + ' ' + mer : h12 + ':' + (M < 10 ? '0' : '') + M + ' ' + mer;
  }
  function texto(v, corto) {
    var p = partes(v);
    if (!p.desde && !p.hasta) return 'Cualquier hora';
    if (p.desde && p.hasta) return texto12(p.desde, corto) + ' – ' + texto12(p.hasta, corto);
    return p.desde ? 'Desde ' + texto12(p.desde, corto) : 'Hasta ' + texto12(p.hasta, corto);
  }
  // max: tiene hora máxima · min: solo mínima · rango: las dos · '': cualquier hora
  function clase(v) {
    var p = partes(v);
    return p.desde && p.hasta ? 'rango' : p.hasta ? 'max' : p.desde ? 'min' : '';
  }
  // Para ordenar: primero lo que vence antes (los "hasta"), luego los "desde", al final cualquier hora
  function claveOrden(v) {
    var p = partes(v);
    if (p.hasta) return aMin(p.hasta);
    if (p.desde) return 1440 + aMin(p.desde);
    return 9999;
  }
  // El turno que pide el horario, si choca con el elegido: hasta la 1 p. m. → M; desde las 2 p. m. → T
  function turnoSugerido(v, turno) {
    var p = partes(v), t = String(turno || '').trim().toUpperCase();
    if (p.hasta && aMin(p.hasta) <= 13 * 60 && t !== 'M') return 'M';
    if (p.desde && aMin(p.desde) >= 14 * 60 && t !== 'T') return 'T';
    return null;
  }

  // ---------- Estilos (una sola vez) ----------
  function estilos() {
    if (document.getElementById('hselEstilos')) return;
    var st = document.createElement('style');
    st.id = 'hselEstilos';
    st.textContent = [
      '.hsel-fondo{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;padding:10px}',
      '@media(min-height:700px) and (min-width:700px){.hsel-fondo{align-items:center}}',
      '.hsel{width:100%;max-width:400px;max-height:calc(100vh - 20px);overflow-y:auto;background:var(--hs-bg);color:var(--hs-ink);border:1px solid var(--hs-line);border-radius:18px;padding:14px 14px 12px;box-shadow:0 -10px 40px rgba(0,0,0,.35);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;box-sizing:border-box}',
      '.hsel *{box-sizing:border-box}',
      '.hsel h3{margin:0 0 2px;font-size:15px;font-weight:800}',
      '.hsel-sub{font-size:12px;color:var(--hs-muted);margin-bottom:10px}',
      '.hsel-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}',
      '.hsel-chips button{border:1px solid var(--hs-line);background:var(--hs-chip);color:var(--hs-ink);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}',
      '.hsel-chips button:hover,.hsel-chips button:focus-visible{border-color:var(--hs-acc);outline:none}',
      '.hsel-lims{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}',
      '.hsel-lim{border:1.5px solid var(--hs-line);border-radius:12px;padding:8px 10px;cursor:pointer;background:var(--hs-chip);text-align:left;color:inherit;font-family:inherit;min-width:0}',
      '.hsel-lim.act{border-color:var(--hs-acc);box-shadow:0 0 0 3px var(--hs-acc-s)}',
      '.hsel-l1{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:800;text-transform:uppercase;color:var(--hs-muted);letter-spacing:.03em}',
      '.hsel-l2{font-size:20px;font-weight:800;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.hsel-lim.off .hsel-l2{color:var(--hs-muted);font-size:14px;font-weight:700;padding:4px 0}',
      '.hsel-sw{width:30px;height:17px;border-radius:999px;background:var(--hs-line);position:relative;flex-shrink:0;transition:background .15s}',
      '.hsel-sw::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:left .15s}',
      '.hsel-lim:not(.off) .hsel-sw{background:var(--hs-acc)}',
      '.hsel-lim:not(.off) .hsel-sw::after{left:15px}',
      '.hsel-ruedas{position:relative;display:flex;justify-content:center;gap:4px;height:180px;margin:4px 0 8px;user-select:none;-webkit-user-select:none}',
      '.hsel-ruedas.off{opacity:.3;pointer-events:none}',
      '.hsel-ruedas::before{content:"";position:absolute;left:8%;right:8%;top:72px;height:36px;border-radius:10px;background:var(--hs-acc-s);pointer-events:none}',
      '.hsel-rueda{width:74px;height:180px;overflow-y:scroll;scroll-snap-type:y mandatory;scrollbar-width:none;position:relative;outline:none;-webkit-mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent)}',
      '.hsel-rueda::-webkit-scrollbar{display:none}',
      '.hsel-rueda:focus-visible{box-shadow:inset 0 0 0 2px var(--hs-acc);border-radius:10px}',
      '.hsel-rueda div{height:36px;line-height:36px;text-align:center;font-size:22px;font-weight:700;scroll-snap-align:center;font-variant-numeric:tabular-nums;color:var(--hs-muted);cursor:pointer}',
      '.hsel-rueda div.si{color:var(--hs-ink)}',
      '.hsel-rueda .pad{pointer-events:none}',
      '.hsel-dos{font-size:22px;font-weight:800;line-height:180px}',
      '.hsel-res{font-size:13px;text-align:center;padding:8px;border-radius:10px;background:var(--hs-chip);margin-bottom:10px}',
      '.hsel-res b{color:var(--hs-acc-t)}',
      '.hsel-res.err{background:rgba(239,68,68,.12);color:#ef4444}',
      '.hsel-acc{display:flex;gap:8px}',
      '.hsel-acc button{flex:1;border-radius:10px;padding:10px;font-weight:800;font-size:14px;cursor:pointer;border:1px solid var(--hs-line);background:transparent;color:var(--hs-ink);font-family:inherit}',
      '.hsel-acc .hsel-ok{background:var(--hs-acc);border-color:var(--hs-acc);color:var(--hs-ok-ink)}',
      '.hsel-acc .hsel-ok:disabled{opacity:.4;cursor:not-allowed}',
      '.hsel.tema-tomador{--hs-bg:#111827;--hs-ink:#e5e7eb;--hs-muted:#8b93a3;--hs-line:rgba(255,255,255,.14);--hs-chip:rgba(255,255,255,.05);--hs-acc:#22c55e;--hs-acc-s:rgba(34,197,94,.16);--hs-acc-t:#86efac;--hs-ok-ink:#000}',
      '.hsel.tema-erp{--hs-bg:var(--panel,#13241C);--hs-ink:var(--ink,#E4EFE8);--hs-muted:var(--muted,#8BA697);--hs-line:var(--line-fuerte,#2F4738);--hs-chip:var(--bg,#0E1A15);--hs-acc:var(--acento,#2E9E6B);--hs-acc-s:rgba(46,158,107,.2);--hs-acc-t:var(--acento-d,#37B87C);--hs-ok-ink:#fff}',
      /* Campo del tomador */
      '.hsel-campo{display:flex;align-items:center;justify-content:space-between;gap:4px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;border-color:rgba(34,197,94,.45)!important;font-family:inherit}',
      '.hsel-campo span{overflow:hidden;text-overflow:ellipsis}',
      '.hsel-campo.vacio{color:#9ca3af!important}',
      '.hsel-aviso{grid-column:1/-1;display:flex;align-items:center;gap:8px;background:rgba(250,204,21,.1);border:1px solid rgba(250,204,21,.35);color:#fde68a;border-radius:8px;padding:7px 9px;font-size:11px;line-height:1.35;margin-top:4px}',
      '.hsel-aviso[hidden]{display:none}',
      '.hsel-aviso button{margin-left:auto;flex-shrink:0;background:#facc15;color:#111;border:0;border-radius:6px;padding:5px 8px;font-weight:800;font-size:11px;cursor:pointer;font-family:inherit}'
    ].join('\n');
    document.head.appendChild(st);
  }

  // ---------- Selector tipo alarma ----------
  var HORAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], MINS = [0, 15, 30, 45], ALTO = 36;
  var DEF = { desde: 15 * 60, hasta: 10 * 60 };
  var CHIPS = [['Hasta 10 a. m.', '-10:00'], ['Hasta 12 p. m.', '-12:00'], ['9 a. m. – 1 p. m.', '09:00-13:00'],
               ['Desde 2 p. m.', '14:00-'], ['Desde 3 p. m.', '15:00-'], ['Cualquier hora', '']];
  var abierto = null;

  function abrir(o) {
    o = o || {};
    if (abierto) abierto.cerrar();
    estilos();
    var ini = partes(o.valor);
    var r = { desde: ini.desde ? aMin(ini.desde) : null, hasta: ini.hasta ? aMin(ini.hasta) : null };
    var activo = r.hasta != null && r.desde == null ? 'hasta' : 'desde';
    var previo = document.activeElement;

    var fondo = document.createElement('div');
    fondo.className = 'hsel-fondo';
    fondo.innerHTML =
      '<div class="hsel tema-' + (o.tema === 'erp' ? 'erp' : 'tomador') + '" role="dialog" aria-modal="true" aria-label="Horario de entrega">' +
        '<h3>⏰ Horario de entrega</h3>' +
        '<div class="hsel-sub">¿Desde qué hora y hasta qué hora puede recibir el cliente?</div>' +
        '<div class="hsel-chips">' + CHIPS.map(function (c) { return '<button type="button" data-v="' + c[1] + '">' + c[0] + '</button>'; }).join('') + '</div>' +
        '<div class="hsel-lims">' +
          '<button type="button" class="hsel-lim" data-l="desde"><div class="hsel-l1">Desde <span class="hsel-sw" data-sw="1"></span></div><div class="hsel-l2"></div></button>' +
          '<button type="button" class="hsel-lim" data-l="hasta"><div class="hsel-l1">Hasta <span class="hsel-sw" data-sw="1"></span></div><div class="hsel-l2"></div></button>' +
        '</div>' +
        '<div class="hsel-ruedas">' +
          '<div class="hsel-rueda" data-r="h" tabindex="0" aria-label="Hora"></div><div class="hsel-dos">:</div>' +
          '<div class="hsel-rueda" data-r="m" tabindex="0" aria-label="Minutos"></div>' +
          '<div class="hsel-rueda" data-r="p" tabindex="0" aria-label="a. m. o p. m."></div>' +
        '</div>' +
        '<div class="hsel-res" aria-live="polite"></div>' +
        '<div class="hsel-acc"><button type="button" class="hsel-no">Cancelar</button><button type="button" class="hsel-ok">Listo</button></div>' +
      '</div>';
    document.body.appendChild(fondo);
    var $ = function (s) { return fondo.querySelector(s); };
    var ruedas = { h: $('[data-r=h]'), m: $('[data-r=m]'), p: $('[data-r=p]') };
    var VALS = { h: HORAS.map(String), m: MINS.map(function (x) { return x < 10 ? '0' + x : String(x); }), p: ['a. m.', 'p. m.'] };
    Object.keys(ruedas).forEach(function (k) {
      ruedas[k].innerHTML = '<div class="pad"></div><div class="pad"></div>' +
        VALS[k].map(function (v, i) { return '<div data-i="' + i + '">' + v + '</div>'; }).join('') +
        '<div class="pad"></div><div class="pad"></div>';
    });
    var idx = function (el) { return Math.max(0, Math.min(VALS[el.dataset.r].length - 1, Math.round(el.scrollTop / ALTO))); };
    var marcar = function () {
      Object.keys(ruedas).forEach(function (k) {
        var el = ruedas[k], i = idx(el);
        el.querySelectorAll('[data-i]').forEach(function (d) { d.classList.toggle('si', +d.dataset.i === i); });
      });
    };
    // Poner las ruedas no necesita silenciar su evento de scroll: al terminar,
    // leerRuedas() devuelve el mismo valor que se acaba de poner.
    var ponerRuedas = function (min) {
      var H = Math.floor(min / 60), h12 = ((H + 11) % 12) + 1;
      ruedas.h.scrollTop = HORAS.indexOf(h12) * ALTO;
      ruedas.m.scrollTop = MINS.indexOf(min % 60) * ALTO;
      ruedas.p.scrollTop = (H < 12 ? 0 : 1) * ALTO;
      marcar();
    };
    var leerRuedas = function () {
      var H = HORAS[idx(ruedas.h)] % 12;
      if (idx(ruedas.p) === 1) H += 12;
      return H * 60 + MINS[idx(ruedas.m)];
    };
    var valor = function () { return normalizar({ desde: r.desde != null ? deMin(r.desde) : '', hasta: r.hasta != null ? deMin(r.hasta) : '' }); };
    var pintar = function () {
      fondo.querySelectorAll('.hsel-lim').forEach(function (b) {
        var l = b.dataset.l, on = r[l] != null;
        b.classList.toggle('act', l === activo);
        b.classList.toggle('off', !on);
        b.setAttribute('aria-pressed', String(l === activo));
        b.querySelector('.hsel-l2').textContent = on ? texto12(deMin(r[l])) : 'Sin límite';
      });
      $('.hsel-ruedas').classList.toggle('off', r[activo] == null);
      var v = valor(), res = $('.hsel-res');
      res.classList.toggle('err', !v.ok);
      if (v.ok) { res.innerHTML = 'El cliente recibe: <b></b>'; res.querySelector('b').textContent = texto(v.valor); }
      else res.textContent = v.error;
      $('.hsel-ok').disabled = !v.ok;
    };
    // Con el límite apagado las ruedas quedan atenuadas en su hora sugerida
    // (10:00 a. m. / 3:00 p. m.), no en 1:00 a. m.
    // Hora con que se prende un límite: la sugerida, salvo que choque con el otro
    // (con "hasta las 11", DESDE arranca 2 h antes; con "desde las 4", HASTA 3 h después).
    var porDefecto = function (l) {
      if (l === 'desde' && r.hasta != null && DEF.desde >= r.hasta) return Math.max(15, r.hasta - 120);
      if (l === 'hasta' && r.desde != null && DEF.hasta <= r.desde) return Math.min(23 * 60 + 45, r.desde + 180);
      return DEF[l];
    };
    var enfocar = function (l) { activo = l; ponerRuedas(r[l] != null ? r[l] : porDefecto(l)); pintar(); };

    Object.keys(ruedas).forEach(function (k) {
      var el = ruedas[k], t = null;
      el.addEventListener('scroll', function () {
        marcar();
        clearTimeout(t);
        t = setTimeout(function () {
          if (r[activo] == null) return;
          r[activo] = leerRuedas(); pintar();
        }, 110);
      });
      el.addEventListener('click', function (e) {
        var d = e.target.closest('[data-i]');
        if (d) { el.scrollTop = +d.dataset.i * ALTO; marcar(); if (r[activo] != null) { r[activo] = leerRuedas(); pintar(); } }
      });
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        var i = idx(el) + (e.key === 'ArrowDown' ? 1 : -1);
        el.scrollTop = Math.max(0, Math.min(VALS[k].length - 1, i)) * ALTO;
      });
    });
    fondo.querySelectorAll('.hsel-lim').forEach(function (b) {
      b.addEventListener('click', function (e) {
        var l = b.dataset.l;
        if (r[activo] != null) r[activo] = leerRuedas();
        if (e.target.closest('[data-sw]')) r[l] = r[l] != null ? null : porDefecto(l);
        else if (r[l] == null) r[l] = porDefecto(l);
        enfocar(l);
      });
    });
    fondo.querySelectorAll('.hsel-chips button').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = partes(b.dataset.v);
        r.desde = p.desde ? aMin(p.desde) : null; r.hasta = p.hasta ? aMin(p.hasta) : null;
        enfocar(r.desde != null ? 'desde' : r.hasta != null ? 'hasta' : 'desde');
      });
    });

    var cerrar = function () {
      if (!fondo.parentNode) return;
      fondo.remove(); document.removeEventListener('keydown', teclas, true); abierto = null;
      try { if (previo && previo.focus) previo.focus(); } catch (_) {}
    };
    var listo = function () {
      // Lo que se ve en las ruedas manda: si se tocó Listo justo al terminar de
      // girar (antes de que corriera el evento de scroll), igual se toma.
      if (r[activo] != null) { r[activo] = leerRuedas(); pintar(); }
      var v = valor();
      if (!v.ok) return;
      cerrar();
      if (typeof o.alListo === 'function') o.alListo(v.valor);
    };
    var teclas = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
      if (e.key === 'Enter') {
        // Con el selector abierto, Enter es solo suyo: la pantalla de atrás no
        // lo recibe (Ctrl+Enter del Admin guardaba el pedido con el horario viejo).
        e.preventDefault(); e.stopPropagation();
        var b = e.target && e.target.closest && e.target.closest('.hsel button');
        if (b && !(e.ctrlKey || e.metaKey)) b.click(); else listo();
        return;
      }
      if (e.key === 'Tab') {
        // El foco no sale del selector (es modal)
        var f = [].slice.call(fondo.querySelectorAll('button:not([disabled]),[tabindex="0"]'));
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        if (i === -1 || (e.shiftKey && i === 0) || (!e.shiftKey && i === f.length - 1)) {
          e.preventDefault(); e.stopPropagation();
          f[e.shiftKey ? f.length - 1 : 0].focus();
        }
      }
    };
    $('.hsel-no').addEventListener('click', cerrar);
    $('.hsel-ok').addEventListener('click', listo);
    fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });
    document.addEventListener('keydown', teclas, true);
    abierto = { cerrar: cerrar };
    pintar();
    setTimeout(function () { enfocar(activo); $('.hsel-ok').focus(); }, 0);
    return abierto;
  }

  // ---------- Tomador: el campo HORARIO va debajo de Turno ----------
  function montarTomador() {
    var turno = document.getElementById('campoTurno');
    var grid = document.getElementById('camposPedido');
    if (!turno || !grid || document.getElementById('campoHorario')) return;
    estilos();
    var lab = document.createElement('label');
    lab.textContent = 'Horario'; lab.style.marginTop = '6px'; lab.htmlFor = 'campoHorarioBtn';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'campoHorarioBtn'; btn.className = 'campo-pedido hsel-campo vacio';
    btn.title = 'Desde qué hora y hasta qué hora puede recibir el cliente';
    btn.innerHTML = '<span>Cualquier hora</span>⏰';
    var inp = document.createElement('input');
    inp.type = 'hidden'; inp.id = 'campoHorario'; inp.value = '';
    turno.insertAdjacentElement('afterend', inp);
    turno.insertAdjacentElement('afterend', btn);
    turno.insertAdjacentElement('afterend', lab);
    var aviso = document.createElement('div');
    aviso.className = 'hsel-aviso'; aviso.hidden = true;
    aviso.innerHTML = '<span></span><button type="button"></button>';
    grid.appendChild(aviso);

    var pintar = function () {
      var v = inp.value;
      btn.classList.toggle('vacio', !v);
      btn.querySelector('span').textContent = texto(v);
      btn.title = 'Horario de entrega: ' + texto(v);
      var sug = turnoSugerido(v, turno.value);
      aviso.hidden = !sug;
      if (sug) {
        var p = partes(v);
        aviso.querySelector('span').textContent = sug === 'M'
          ? '⚠ El turno es ' + (turno.value || '—') + ', pero el cliente recibe solo hasta las ' + texto12(p.hasta)
          : '⚠ El turno es ' + (turno.value || '—') + ', pero el cliente recibe desde las ' + texto12(p.desde);
        aviso.querySelector('button').textContent = 'Cambiar a ' + sug;
        aviso.querySelector('button').onclick = function () {
          turno.value = sug;
          turno.dispatchEvent(new Event('change', { bubbles: true }));
        };
      }
    };
    btn.addEventListener('click', function () {
      abrir({ valor: inp.value, tema: 'tomador', alListo: function (v) { inp.value = v; pintar(); } });
    });
    turno.addEventListener('change', pintar);
    pintar();
  }

  global.Horario = { normalizar: normalizar, partes: partes, texto: texto, texto12: texto12, clase: clase,
    claveOrden: claveOrden, turnoSugerido: turnoSugerido, abrir: abrir, montarTomador: montarTomador };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTomador);
  else montarTomador();
})(typeof window !== 'undefined' ? window : this);
