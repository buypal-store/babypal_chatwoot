// avisos.js — Mensajes del tomador dibujados en la misma página (01/11/2026).
// El panel de pedidos de Chatwoot abre el tomador en un iframe con sandbox SIN allow-modals: ahí el navegador ignora
// alert() y confirm() sin avisar (confirm devuelve false al instante). Desde agosto los asesores no veían "Pedido subido",
// los errores, ni las preguntas, y las preguntas se cancelaban solas: el pedido no se subía y nadie sabía por qué.
// · alert(texto) queda reemplazado aquí: ✅ = franja verde que se va sola; lo demás = franja que queda hasta cerrarla.
// · Para preguntar: `if (!(await Avisos.preguntar('¿…?'))) return;` (Enter = Sí, Esc = No).
(function () {
  'use strict';
  const BASE = 'font:14px/1.4 system-ui,sans-serif;color:#e5e7eb;';
  let franja = null, reloj = null;

  function cerrarFranja() { clearTimeout(reloj); if (franja) { franja.remove(); franja = null; } }

  function mostrar(texto) {
    const msg = String(texto == null ? '' : texto);
    const ok = /^\s*✅/.test(msg);
    const error = /^\s*(❌|🔒)/.test(msg);
    cerrarFranja();
    franja = document.createElement('div');
    franja.setAttribute('role', ok ? 'status' : 'alert');
    franja.style.cssText = BASE + 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10000;' +
      'width:calc(100% - 20px);max-width:560px;box-sizing:border-box;padding:12px 40px 12px 14px;border-radius:10px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.45);white-space:pre-wrap;max-height:60vh;overflow:auto;user-select:text;' +
      (ok ? 'background:#14532d;border:1px solid #22c55e;' : error ? 'background:#7f1d1d;border:1px solid #f87171;'
        : 'background:#78350f;border:1px solid #fbbf24;');
    franja.textContent = msg;
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.title = 'Cerrar';
    x.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:0;color:inherit;font-size:16px;cursor:pointer;padding:4px';
    x.onclick = cerrarFranja;
    franja.appendChild(x);
    document.body.appendChild(franja);
    if (ok) reloj = setTimeout(cerrarFranja, 5000);
  }

  // Pregunta Sí/No dentro de la página. Devuelve una promesa con true (Sí) o false (No).
  function preguntar(texto) {
    return new Promise(resolve => {
      const fondo = document.createElement('div');
      fondo.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
      const caja = document.createElement('div');
      caja.setAttribute('role', 'dialog');
      caja.style.cssText = BASE + 'width:100%;max-width:440px;background:#111827;border:1px solid #fbbf24;border-radius:12px;padding:18px;box-shadow:0 16px 40px rgba(0,0,0,.5)';
      const p = document.createElement('div');
      p.style.cssText = 'white-space:pre-wrap;margin-bottom:16px;max-height:55vh;overflow:auto';
      p.textContent = String(texto == null ? '' : texto);
      const fila = document.createElement('div');
      fila.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
      const boton = (txt, fondoColor, color) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
        b.style.cssText = 'padding:9px 18px;border-radius:8px;border:0;font-weight:600;cursor:pointer;background:' + fondoColor + ';color:' + color; return b; };
      const no = boton('No', '#374151', '#e5e7eb'), si = boton('Sí', '#22c55e', '#0b0f14');
      const fin = r => { document.removeEventListener('keydown', teclas, true); fondo.remove(); resolve(r); };
      const teclas = e => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fin(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); }
      };
      no.onclick = () => fin(false);
      si.onclick = () => fin(true);
      fila.append(no, si);
      caja.append(p, fila);
      fondo.appendChild(caja);
      document.body.appendChild(fondo);
      document.addEventListener('keydown', teclas, true);
      si.focus();
    });
  }

  window.Avisos = { mostrar, preguntar, cerrar: cerrarFranja };
  window.alert = mostrar;
})();
