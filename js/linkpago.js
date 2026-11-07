// linkpago.js — Link de pago con tarjeta (Mercado Pago) desde el tomador (02/11/2026).
// Reemplaza a los links de Izipay que se armaban a mano en secure.micuentaweb.pe. El ERP (api/linkPagoDB) arma el link
// y el pago se valida solo cuando Mercado Pago lo confirma: en el chat aparece una nota privada "✅ Pago con link…".
// · Pedido ya subido con saldo (p. ej. saldo Shalom tras la guía): el monto es lo que falta según el ERP. Al pagar, el
//   cobro queda Pagado y al cliente le llega su clave sola. Si ya pagó algo por BBVA después de la guía, el vendedor dice
//   si fue para este pedido; puede escribir otro monto (pago en partes, dos tarjetas) (06/11/2026).
// · Antes de subir el pedido: link por el monto que escribas (por defecto, el total del carrito). Cuando pague, al
//   subir el pedido el adelanto sale sugerido con "✓MP" y el pago se enlaza solo al pedido.
// Mismo archivo en los 4 tomadores. Mensajes con Avisos (el panel de Chatwoot bloquea alert/confirm: ver avisos.js).
(function () {
  'use strict';
  const API = 'https://erp.buypal.com.pe/api/linkPagoDB';
  const conv = new URLSearchParams(window.location.search).get('conversation_id') || '';
  const S = (n) => 'S/ ' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
  const CAMPO = 'width:100%;box-sizing:border-box;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#0b0f14;color:#e5e7eb;font-size:14px';
  const BOTON = 'padding:8px 12px;border:0;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap;';
  let fondo = null, reloj = null, ultimo = null, nuevo = null;   // nuevo = el link recién creado (sobrevive al refresco)
  let eleccion = {};   // por pedido: { previos: 'si' | 'no', revisado, monto } (sobrevive al refresco cada 15 s)
  const cuando = t => new Date(t).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const pagos = xs => xs.map(x => S(x.monto) + ' por ' + x.medio + ' el ' + cuando(x.en)).join(' y ');

  async function llamar(cuerpo, reintento) {
    const sesion = window.SesionERP ? await SesionERP.asegurar() : '';
    const r = await fetch(API, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ conversation_id: conv, sesion }, cuerpo)) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && window.SesionERP && !reintento) { await SesionERP.vencida(); return llamar(cuerpo, true); }
    if (!r.ok || !d.ok) throw new Error(d.error || ('Error del ERP (' + r.status + ')'));
    return d;
  }

  function totalCarrito() {
    try {
      const sub = (typeof state !== 'undefined' && state.finalTotal) || subtotalCarrito();
      return Math.round((Number(sub) + Number(envioCliente() || 0)) * 100) / 100;
    } catch (_) { return 0; }
  }

  function el(tag, estilo, texto) { const e = document.createElement(tag); if (estilo) e.style.cssText = estilo; if (texto != null) e.textContent = texto; return e; }

  function copiar(texto) {
    const viejo = () => { const t = el('textarea', 'position:fixed;top:-1000px'); t.value = texto; document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; } t.remove(); return ok; };
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto).then(() => true).catch(viejo);
    return Promise.resolve(viejo());
  }

  // Link recién creado: el texto para pegar, enviar al cliente o copiar
  function pintarLink(caja, d) {
    caja.innerHTML = '';
    caja.style.display = 'block';
    caja.append(el('div', 'font-size:13px;color:#86efac;margin-bottom:6px', (d.repetido ? '♻️ Ya había un link vigente: ' : '✅ Link listo: ') +
      S(d.monto) + (d.pedido ? ' · pedido ' + d.pedido : ' · sin pedido todavía')));
    if (d.anulados) caja.append(el('div', 'font-size:12px;color:#fbbf24;margin-bottom:6px',
      '⚠️ Se anuló el link anterior de este pedido (ya no se puede pagar). Mándale este nuevo al cliente.'));
    if (d.falta && d.monto < d.falta - 0.009) caja.append(el('div', 'font-size:12px;color:#fbbf24;margin-bottom:6px',
      `Este link es por una parte. Cuando lo pague, quedan ${S(d.falta - d.monto)} por pagar: crea ahí el siguiente link. La clave sale cuando complete.`));
    const url = el('input', CAMPO + ';font-size:12px'); url.readOnly = true; url.value = d.url; url.onclick = () => url.select();
    const fila = el('div', 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap');
    const enviar = el('button', BOTON + 'background:#22c55e;color:#0b0f14', '📤 Enviar al cliente');
    const cop = el('button', BOTON + 'background:#1f2937;color:#e5e7eb;border:1px solid rgba(255,255,255,.15)', '📋 Copiar link');
    enviar.type = cop.type = 'button';
    if (d.enviado) { enviar.disabled = true; enviar.textContent = '✅ Enviado'; }
    enviar.onclick = async () => {
      enviar.disabled = true; enviar.textContent = 'Enviando…';
      try { const r = await llamar({ accion: 'asesor_enviar', link: d.id }); d.enviado = true; Avisos.mostrar(r.mensaje || '✅ Link enviado al cliente'); enviar.textContent = '✅ Enviado'; }
      catch (e) { Avisos.mostrar('❌ ' + e.message); enviar.disabled = false; enviar.textContent = '📤 Enviar al cliente'; }
    };
    cop.onclick = async () => { const ok = await copiar(d.url); cop.textContent = ok ? '✅ Copiado' : 'Selecciona y copia'; if (!ok) url.select(); };
    fila.append(enviar, cop);
    caja.append(url, fila);
  }

  async function crear(boton, cuerpo, caja) {
    const antes = boton.textContent;
    boton.disabled = true; boton.textContent = 'Generando…';
    try {
      nuevo = await llamar(Object.assign({ accion: 'asesor_crear' }, cuerpo));
      pintarLink(caja, nuevo); caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); refrescar();
    }
    catch (e) { Avisos.mostrar('❌ ' + e.message); }
    finally { boton.disabled = false; boton.textContent = antes; }
  }

  function pintar(cuerpo, d) {
    cuerpo.innerHTML = '';
    const caja = el('div', 'display:none;margin:4px 0 14px;padding:10px;border-radius:10px;background:#052e16;border:1px solid #166534');
    // 1) Pedidos del chat con saldo
    cuerpo.append(el('div', 'font-size:13px;font-weight:600;margin:4px 0 6px', 'Cobrar el saldo de un pedido'));
    if (!d.pedidos.length) cuerpo.append(el('div', 'font-size:13px;color:#9ca3af;margin-bottom:10px', 'Este chat no tiene pedidos con saldo por cobrar (últimos 15 días).'));
    d.pedidos.forEach(p => cuerpo.append(tarjeta(p, caja)));
    // 2) Antes de subir el pedido
    cuerpo.append(el('div', 'font-size:13px;font-weight:600;margin:14px 0 6px', 'Antes de subir el pedido (pago completo o adelanto)'));
    const fila = el('div', 'display:flex;gap:8px');
    const monto = el('input', CAMPO); monto.inputMode = 'decimal'; monto.placeholder = 'Monto S/';
    const tc = totalCarrito(); if (tc > 0) monto.value = String(tc);
    const b = el('button', BOTON + 'background:#2563eb;color:#fff', '💳 Generar link'); b.type = 'button';
    b.onclick = () => {
      const m = Number(String(monto.value).replace(',', '.'));
      if (!(m >= 1)) { Avisos.mostrar('⚠️ Escribe el monto a cobrar (mínimo S/ 1).'); monto.focus(); return; }
      crear(b, { monto: m }, caja);
    };
    fila.append(monto, b);
    cuerpo.append(fila, el('div', 'font-size:12px;color:#9ca3af;margin:6px 0 12px',
      'Cuando pague, al subir el pedido el adelanto sale sugerido con ✓MP (si pagó todo, súbelo como "Pagado").'), caja);
    if (nuevo) pintarLink(caja, nuevo);
    // 3) Links del chat
    if (d.links.length) {
      cuerpo.append(el('div', 'font-size:13px;font-weight:600;margin:8px 0 6px', 'Links de este chat (3 días)'));
      d.links.forEach(l => {
        const estado = l.estado === 'pagado' ? '✅ Pagado ' + S(l.pagado_monto) : l.estado === 'anulado' ? '🚫 Anulado (se creó otro)'
          : l.estado === 'revertido' ? '↩️ Pago devuelto o desconocido'
          : l.vencido ? '⌛ Vencido' : '⏳ Esperando pago';
        cuerpo.append(el('div', 'font-size:12px;color:#d1d5db;padding:4px 0;border-top:1px solid rgba(255,255,255,.06)',
          `${estado} · ${S(l.monto)}${l.pedido ? ' · ' + l.pedido : ''} · ${l.creado_por || ''} ${new Date(l.creado_en).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`));
      });
    }
  }

  // Un pedido con saldo. Si el cliente ya pagó algo por BBVA después de la guía, el vendedor dice primero si ese pago
  // fue para este pedido; si mandó un comprobante que no se pudo verificar, lo revisa antes. Después elige el monto.
  function tarjeta(p, caja) {
    const e = eleccion[p.pedido] || (eleccion[p.pedido] = { previos: '', revisado: false, monto: '' });
    const t = el('div', 'padding:10px;margin-bottom:8px;border-radius:10px;background:#0b0f14;border:1px solid rgba(255,255,255,.1)');
    const repintar = () => t.replaceWith(tarjeta(p, caja));
    t.append(el('div', 'font-weight:600;font-size:14px', p.pedido + (p.shalom ? ' · Shalom' : '')),
      el('div', 'color:#9ca3af;font-size:12px;margin-bottom:6px', 'Total ' + S(p.total) + (p.adelanto ? ' · adelanto ' + S(p.adelanto) : '') + ' · saldo ' + S(p.cobro)));
    const bbva = p.previos.filter(x => x.bbva), conLink = p.previos.filter(x => !x.bbva);
    if (conLink.length) t.append(el('div', 'font-size:12px;color:#86efac;margin-bottom:6px', '✅ Ya pagó con link ' + pagos(conLink) + ' (ya descontado).'));
    const aviso = (fondo, borde) => el('div', `font-size:13px;padding:8px 10px;margin-bottom:8px;border-radius:8px;background:${fondo};border:1px solid ${borde}`);
    if (p.sinVerificar.length) {
      const a = aviso('#422006', '#a16207');
      a.append(el('div', 'margin-bottom:6px', `⚠️ El cliente mandó un comprobante de ${pagos(p.sinVerificar)} que no se pudo verificar con BBVA. ` +
        'Si ese pago es real, NO le mandes link: le cobrarías dos veces. Pide que validen el pago.'));
      const lab = el('label', 'display:flex;gap:6px;align-items:center;cursor:pointer;font-size:12px');
      const chk = el('input'); chk.type = 'checkbox'; chk.checked = e.revisado;
      chk.onchange = () => { e.revisado = chk.checked; repintar(); };
      lab.append(chk, el('span', '', 'Ya revisé el chat: ese comprobante no es un pago de este pedido'));
      a.append(lab);
      t.append(a);
    }
    if (bbva.length) {
      const a = aviso('#0c1e3a', '#1d4ed8');
      a.append(el('div', 'margin-bottom:4px', `El cliente ya pagó ${pagos(bbva)} después de recibir la guía.`),
        el('div', 'font-weight:600;margin-bottom:6px', '¿Ese pago fue para ESTE pedido? Revisa el chat:'));
      const opcion = (valor, titulo, detalle) => {
        const sel = e.previos === valor;
        const b = el('button', BOTON + 'display:block;width:100%;text-align:left;margin-bottom:6px;white-space:normal;' +
          (sel ? 'background:#2563eb;color:#fff;border:2px solid #93c5fd' : 'background:#111827;color:#e5e7eb;border:1px solid rgba(255,255,255,.2)'));
        b.type = 'button';
        b.append(el('div', '', (sel ? '● ' : '○ ') + titulo), el('div', 'font-weight:400;font-size:12px;opacity:.85', detalle));
        b.onclick = () => { e.previos = valor; e.monto = ''; repintar(); };
        return b;
      };
      a.append(opcion('si', 'Sí, fue para este pedido', `Se descuenta. Falta pagar ${S(p.saldo)}.`),
        opcion('no', 'No, fue de otra compra', `No se descuenta. Falta pagar el saldo completo: ${S(p.saldoSinBBVA)}.`));
      t.append(a);
    }
    if ((bbva.length && !e.previos) || (p.sinVerificar.length && !e.revisado)) {
      t.append(el('div', 'font-size:12px;color:#9ca3af', 'Responde lo de arriba para poder generar el link.'));
      return t;
    }
    const falta = bbva.length && e.previos === 'no' ? p.saldoSinBBVA : p.saldo;
    const base = { pedido: p.pedido, previos: bbva.length ? e.previos : undefined, revisado: p.sinVerificar.length ? true : undefined };
    const todo = el('button', BOTON + 'background:#2563eb;color:#fff;display:block;width:100%;margin-bottom:6px', '💳 Link por lo que falta: ' + S(falta));
    todo.type = 'button';
    todo.onclick = () => crear(todo, base, caja);
    const fila = el('div', 'display:flex;gap:8px;align-items:center');
    const otro = el('input', CAMPO + ';flex:1'); otro.inputMode = 'decimal'; otro.placeholder = 'Otro monto S/ (máx. ' + S(falta) + ')'; otro.value = e.monto;
    otro.oninput = () => { e.monto = otro.value; };
    const b = el('button', BOTON + 'background:#1f2937;color:#e5e7eb;border:1px solid rgba(255,255,255,.15)', 'Crear link'); b.type = 'button';
    b.onclick = () => {
      const m = Number(String(otro.value).replace(',', '.'));
      if (!(m >= 1) || m > falta + 0.009) { Avisos.mostrar(`⚠️ Escribe un monto entre S/ 1 y ${S(falta)}.`); otro.focus(); return; }
      crear(b, Object.assign({ monto: m }, base), caja);
    };
    fila.append(otro, b);
    t.append(todo, fila, el('div', 'font-size:11px;color:#9ca3af;margin-top:4px',
      'Otro monto: si el cliente paga en partes (por ejemplo con dos tarjetas). Crea el primer link y, cuando lo pague, el siguiente por lo que falte.'));
    return t;
  }

  async function refrescar() {
    if (!fondo) return;
    // Mientras el vendedor escribe un monto no se repinta (perdería lo que escribe)
    if (fondo.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const cuerpo = fondo.querySelector('[data-cuerpo]');
    try { ultimo = await llamar({ accion: 'asesor_consultar' }); if (fondo) pintar(cuerpo, ultimo); }
    catch (e) { if (!ultimo) cuerpo.textContent = '❌ ' + e.message; }
  }

  function cerrar() { clearInterval(reloj); if (fondo) fondo.remove(); fondo = null; ultimo = null; nuevo = null; eleccion = {}; }

  function abrir() {
    if (!conv) { Avisos.mostrar('⚠️ Abre el tomador desde una conversación de Chatwoot para generar el link.'); return; }
    cerrar();
    fondo = el('div', 'position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.7);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;font-family:system-ui,sans-serif');
    const tarjeta = el('div', 'width:100%;max-width:480px;background:#111827;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,.5);position:relative');
    const x = el('button', 'position:absolute;top:8px;right:10px;background:none;border:0;color:#9ca3af;font-size:18px;cursor:pointer', '✕'); x.type = 'button'; x.onclick = cerrar;
    const cuerpo = el('div', 'margin-top:8px', 'Cargando…'); cuerpo.dataset.cuerpo = '1';
    tarjeta.append(x, el('div', 'font-size:16px;font-weight:600', '💳 Link de pago con tarjeta'),
      el('div', 'font-size:12px;color:#9ca3af', 'Mercado Pago · el pago se valida solo'), cuerpo);
    fondo.append(tarjeta);
    fondo.onclick = e => { if (e.target === fondo) cerrar(); };
    document.body.appendChild(fondo);
    refrescar();
    reloj = setInterval(refrescar, 15000);   // el ✅ aparece solo cuando el cliente paga
  }

  function boton() {
    const barra = document.querySelector('.top-actions');
    if (!barra || document.getElementById('btnLinkPago')) return;
    const b = document.createElement('button');
    b.id = 'btnLinkPago'; b.type = 'button'; b.className = 'btn ghost'; b.title = 'Link de pago con tarjeta (Mercado Pago)';
    b.textContent = '💳 Link de pago';
    b.onclick = abrir;
    barra.insertBefore(b, barra.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boton); else boton();
  window.LinkPago = { abrir };
})();
