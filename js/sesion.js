// sesion.js — Inicio de sesión con el usuario del ERP (31/10/2026).
// Sin una sesión válida el ERP no entrega los datos del chat ni recibe pedidos: antes cualquiera que leyera la
// dirección en este código (es público) podía pedir los datos de cualquier cliente o subir pedidos falsos.
// · Es el mismo código y contraseña del ERP (erp.buypal.com.pe). Crear la contraseña, cambiarla u olvidarla: en el ERP.
// · La sesión queda guardada en este navegador, la misma para los 4 tomadores, hasta "Salir" o hasta que el
//   administrador cierre los dispositivos del usuario en el ERP (Usuarios).
// · app.js manda SesionERP.token() en el campo "sesion" del cuerpo; si el ERP responde 401, llama a SesionERP.vencida().
(function () {
  'use strict';
  const AUTH = 'https://erp.buypal.com.pe/api/authDB';
  const CLAVE = 'erpSesionTomador';
  let esperando = null;

  const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (_) { return null; } };
  const guardar = s => { try { s ? localStorage.setItem(CLAVE, JSON.stringify(s)) : localStorage.removeItem(CLAVE); } catch (_) { /* sin almacenamiento */ } };
  const post = body => fetch(AUTH, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, d: await r.json().catch(() => ({})) }));

  // Chip abajo a la derecha: quién está conectado y "Salir"
  function pintarUsuario() {
    let chip = document.getElementById('sesionErpChip');
    const s = leer();
    if (!s || !s.token) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'sesionErpChip';
      chip.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:9998;font:12px system-ui,sans-serif;padding:5px 10px;' +
        'border-radius:999px;background:rgba(17,24,39,.9);color:#e5e7eb;border:1px solid rgba(255,255,255,.12);display:flex;gap:8px;align-items:center';
      const nombre = document.createElement('span');
      const salir = document.createElement('a');
      salir.href = '#'; salir.textContent = 'Salir'; salir.style.cssText = 'color:#fca5a5;text-decoration:none';
      // Sin confirm(): el panel de Chatwoot (sandbox sin allow-modals) lo ignora; se confirma con un segundo clic
      salir.onclick = e => { e.preventDefault();
        if (salir.dataset.ok) { window.SesionERP.salir(); return; }
        salir.dataset.ok = '1'; salir.textContent = '¿Salir? Clic otra vez';
        setTimeout(() => { delete salir.dataset.ok; salir.textContent = 'Salir'; }, 4000); };
      chip.append(nombre, salir);
      document.body.appendChild(chip);
    }
    chip.firstChild.textContent = '👤 ' + (s.nombre || s.codigo || '');
  }

  function formulario(aviso) {
    return new Promise(resolve => {
      const fondo = document.createElement('div');
      fondo.id = 'sesionErpFondo';
      fondo.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;' +
        'justify-content:center;padding:16px;font-family:system-ui,sans-serif';
      fondo.innerHTML =
        '<form style="width:100%;max-width:340px;background:#111827;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);' +
        'border-radius:14px;padding:20px;box-shadow:0 16px 40px rgba(0,0,0,.5)">' +
        '<div style="font-size:17px;font-weight:600;margin-bottom:4px">🔒 Inicia sesión</div>' +
        '<div style="font-size:13px;color:#9ca3af;margin-bottom:14px">Con tu código y contraseña del ERP.</div>' +
        '<div data-aviso style="display:none;font-size:13px;color:#fbbf24;margin-bottom:10px"></div>' +
        '<input name="codigo" autocomplete="username" placeholder="Tu código" required ' +
        'style="width:100%;box-sizing:border-box;margin-bottom:8px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0b0f14;color:#e5e7eb;text-transform:uppercase">' +
        '<input name="clave" type="password" autocomplete="current-password" placeholder="Contraseña" required ' +
        'style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0b0f14;color:#e5e7eb">' +
        '<button type="button" style="width:100%;padding:10px;border:0;border-radius:8px;background:#22c55e;color:#0b0f14;font-weight:600;cursor:pointer">Entrar</button>' +
        '<div data-error style="font-size:13px;color:#f87171;margin-top:10px;min-height:1em"></div>' +
        '<div style="font-size:12px;color:#9ca3af;margin-top:6px">¿Primera vez u olvidaste tu contraseña? Entra a ' +
        '<a href="https://erp.buypal.com.pe" target="_blank" rel="noopener" style="color:#86efac">erp.buypal.com.pe</a> y luego vuelve aquí.</div>' +
        '</form>';
      const f = fondo.querySelector('form'), error = fondo.querySelector('[data-error]'), boton = f.querySelector('button');
      if (aviso) { const a = fondo.querySelector('[data-aviso]'); a.textContent = aviso; a.style.display = 'block'; }
      const anterior = leer();
      if (anterior && anterior.codigo) f.codigo.value = anterior.codigo;
      const entrar = async () => {
        if (boton.disabled) return;
        if (!f.codigo.value.trim() || !f.clave.value) { error.textContent = 'Escribe tu código y tu contraseña.'; return; }
        error.textContent = ''; boton.disabled = true; boton.textContent = 'Entrando…';
        try {
          const { status, d } = await post({ accion: 'login', codigo: f.codigo.value.trim().toUpperCase(), password: f.clave.value });
          if (d.ok && d.token) {
            guardar({ token: d.token, codigo: d.codigo, nombre: d.nombre });
            fondo.remove(); pintarUsuario(); resolve(d.token); return;
          }
          error.textContent = d.necesitaCambio ? 'Por seguridad debes cambiar tu contraseña: entra a erp.buypal.com.pe, cámbiala y vuelve aquí.'
            : d.necesitaRegistro ? 'Aún no tienes contraseña: créala en erp.buypal.com.pe y vuelve aquí.'
            : (d.error || ('No se pudo entrar (' + status + ').'));
        } catch (_) {
          error.textContent = 'Sin conexión con el ERP. Intenta de nuevo.';
        }
        boton.disabled = false; boton.textContent = 'Entrar'; f.clave.value = ''; f.clave.focus();
      };
      // 01/11/2026: el panel de pedidos de Chatwoot (iframe con sandbox sin allow-forms) bloquea el envío de formularios,
      // así que "Entrar" y la tecla Enter llaman a entrar() directo, sin submit.
      boton.onclick = entrar;
      f.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); entrar(); } };
      document.body.appendChild(fondo);
      (f.codigo.value ? f.clave : f.codigo).focus();
    });
  }

  window.SesionERP = {
    token: () => (leer() || {}).token || '',
    // Devuelve el token; si no hay sesión, muestra el formulario y espera
    asegurar(aviso) {
      const t = this.token();
      if (t) return Promise.resolve(t);
      if (!esperando) esperando = formulario(aviso).finally(() => { esperando = null; });
      return esperando;
    },
    // El ERP dijo 401: la sesión ya no vale (cerrada, usuario desactivado)
    vencida() {
      const s = leer();
      if (s) guardar({ codigo: s.codigo });   // se recuerda el código para no reescribirlo
      pintarUsuario();
      return this.asegurar('Tu sesión se cerró. Vuelve a entrar.');
    },
    salir() {
      const s = leer();
      if (s && s.token) post({ accion: 'salir', token: s.token }).catch(() => {});
      guardar(s && s.codigo ? { codigo: s.codigo } : null);
      pintarUsuario();
      this.asegurar();
    },
  };

  function iniciar() {
    const s = leer();
    if (!s || !s.token) { window.SesionERP.asegurar(); return; }
    pintarUsuario();
    // Revisa en segundo plano que la sesión siga viva (no frena la carga)
    post({ accion: 'sesion', token: s.token }).then(({ status, d }) => {
      if (status === 401 || d.sesionInvalida) window.SesionERP.vencida();
      else if (d.ok && d.nombre) { guardar({ ...s, nombre: d.nombre }); pintarUsuario(); }
    }).catch(() => { /* sin conexión: se sigue con la sesión guardada */ });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
