// ---------- AGENCIAS SHALOM ----------
// Buscador de agencias en el Resumen de Pedido. La lista sale de Supabase (tabla
// shalom_agencias, se actualiza cada lunes desde shalom.com.pe/agencias).
// Al elegir una agencia:  Dirección = "SHALOM: <NOMBRE> - <DIRECCIÓN OFICIAL>"  y  Distrito = "Agencia".
// La dirección oficial es para la guía de remisión; la etiqueta imprime solo "SHALOM: <NOMBRE>".
//
// · Se abre solo cuando la IA trae un pedido Shalom (Distrito "Agencia" / Dirección "SHALOM: ...")
//   o con el botón 🚚 junto a Dirección. Sugiere a partir de lo que escribió el cliente y, si
//   compartió su ubicación (campo Ubicación), ordena por cercanía.
// · Tamaño: con las medidas de productos calcula el paquete del carrito (RPC shalom_admision) y
//   marca las agencias que NO lo reciben (p. ej. las mini-micro solo aceptan hasta paquete M).
// · Link para el cliente: erp.buypal.com.pe/agencia/<código> (RPC shalom_link_crear). Lo que el
//   cliente elige se recoge por conversation_id (RPC shalom_link_eleccion) y se llena solo.
//
// Este archivo es IDÉNTICO en los 4 tomadores (babypal, buypal, sento, strenko).
// Ganchos en app.js:  autocompletarCampos → ShalomAgencias.revisar()
//                     enviarPedido        → ShalomAgencias.confirmarEnvio()
(function () {
  const SUPA_URL = 'https://fxwndndaabyktruigxal.supabase.co';
  // Llave publicable: solo puede LEER shalom_agencias y llamar a las funciones shalom_* de arriba
  const SUPA_KEY = 'sb_publishable_SneWwcbXYItpg1dIyjT0Kw_CinL31Jd';
  const ERP_LINK = 'https://erp.buypal.com.pe/agencia/';
  const CACHE = 'shalom_agencias_v2';
  const CACHE_MS = 12 * 3600 * 1000;
  const MAX_SUGERENCIAS = 6;
  const TIENDA = window.SHALOM_TIENDA ||
    ((location.pathname + ' ' + location.hostname).toLowerCase().match(/babypal|buypal|sento|strenko/) || ['buypal'])[0];
  const conversacion = () => Number(new URLSearchParams(location.search).get('conversation_id')) || null;

  // Palabras que no ayudan a distinguir una agencia de otra
  const VACIAS = new Set(('shalom shalon agencia agencias sede por la el los las de del en a al que esta cerca mas ' +
    'cercana cercano av avenida jr jiron calle ca nro n no mz lt y o frente ref referencia altura cuadra cdra cdras lado ' +
    'costado para envio enviar mandar porfa favor quiero recojo recoger provincia departamento distrito dpto co ' +
    'me mi su se lo una un con sin ahi alli hay donde queda').split(' '));
  const PAQUETES = { XXS: '15×10×10 cm, 250 g', XS: '20×15×12 cm, 500 g', S: '30×20×12 cm, 2 kg', M: '30×24×20 cm, 5 kg', L: '42×30×23 cm, 10 kg' };

  let agencias = null;     // filas + índice de búsqueda
  let idf = {};
  let cargando = null;
  let elegida = null;
  let elegidaPorCliente = false;
  let cerradoPorUsuario = false;
  let escribiendoNosotros = false;
  let admision = { firma: null, paquete: null, agencias: {} };   // tamaño del carrito actual
  let link = { url: '', estado: null };
  let sondeo = null;

  const $ = id => document.getElementById(id);
  const quitarTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => quitarTildes(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = s => norm(s).split(' ').filter(t => t && !VACIAS.has(t) && (t.length >= 3 || /^\d{2,}$/.test(t)));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s/(.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

  const minus = s => s.charAt(0).toLowerCase() + s.slice(1);
  const textoDireccion = a => a.direccion ? `SHALOM: ${a.nombre} - ${a.direccion}` : `SHALOM: ${a.nombre}`;
  const estadoDe = a => (a && admision.agencias[String(a.ter_id)]) || 'si';

  function rpc(nombre, args) {
    return fetch(`${SUPA_URL}/rest/v1/rpc/${nombre}`, {
      method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }

  // ---------- Datos ----------
  function leerCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.d) && c.d.length > 100) return c.d;
    } catch (e) { /* sin almacenamiento: se descarga */ }
    return null;
  }
  function cargar() {
    if (agencias) return Promise.resolve(agencias);
    if (cargando) return cargando;
    const cache = leerCache();
    if (cache) { indexar(cache); return Promise.resolve(agencias); }
    const url = `${SUPA_URL}/rest/v1/shalom_agencias?select=ter_id,nombre,direccion,lugar,departamento,provincia,zona,` +
      `latitud,longitud,categoria,categoria_recibe,max_paquete,max_kg,max_m3,puntospro&activa=eq.true&recibe=eq.true&order=nombre&limit=3000`;
    cargando = fetch(url, { headers: { apikey: SUPA_KEY } })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* lleno o bloqueado */ }
        indexar(d);
        return agencias;
      })
      .catch(err => { cargando = null; console.warn('Agencias Shalom no disponibles:', err.message); return null; });
    return cargando;
  }
  function indexar(lista) {
    const df = {};
    agencias = lista.map(a => {
      const partesLugar = String(a.lugar || '').split('/');
      const campos = [
        [tokens(a.nombre), 4],
        [tokens([a.zona, a.provincia, partesLugar[2]].join(' ')), 3],
        [tokens(a.departamento), 1.5],
        [tokens(a.direccion), 1],
      ];
      new Set(campos.flatMap(c => c[0])).forEach(t => { df[t] = (df[t] || 0) + 1; });
      return Object.assign({}, a, { _campos: campos, _nombre: norm(a.nombre), _compacto: norm(a.nombre).replace(/ /g, '') });
    });
    const n = agencias.length;
    idf = {};
    Object.keys(df).forEach(t => { idf[t] = Math.log(1 + n / df[t]); });
  }

  // Carrito actual → [{sku, cantidad}] (state y cantidadDe son de app.js)
  function itemsCarrito() {
    try {
      const cart = (typeof state !== 'undefined' && Array.isArray(state.cart)) ? state.cart : [];
      const cant = typeof cantidadDe === 'function' ? cantidadDe : (it => Number(it.cantidad) || 1);
      return cart.filter(it => it && it.sku).map(it => ({ sku: String(it.sku), cantidad: cant(it) }));
    } catch (e) { return []; }
  }
  /** Calcula (una vez por carrito) el paquete y qué agencias no lo reciben. */
  function revisarTamano() {
    const items = itemsCarrito();
    const firma = JSON.stringify(items);
    if (firma === admision.firma) return Promise.resolve(admision);
    admision = { firma, paquete: null, agencias: {} };
    if (!items.length) return Promise.resolve(admision);
    return rpc('shalom_admision', { p_items: items })
      .then(r => { if (admision.firma === firma) { admision.paquete = r && r.paquete; admision.agencias = (r && r.agencias) || {}; } return admision; })
      .catch(err => { console.warn('Tamaño del pedido no disponible:', err.message); return admision; });
  }

  // ---------- Búsqueda ----------
  function casi(q, t) {   // una letra de diferencia (wichazao ~ wichanzao)
    if (Math.abs(q.length - t.length) > 1) return false;
    let i = 0, j = 0, dif = 0;
    while (i < q.length && j < t.length) {
      if (q[i] === t[j]) { i++; j++; continue; }
      if (++dif > 1) return false;
      if (q.length > t.length) i++; else if (t.length > q.length) j++; else { i++; j++; }
    }
    return dif + (q.length - i) + (t.length - j) <= 1;
  }
  function parecido(q, t) {
    if (q === t) return 1;
    if (q.length >= 5 && casi(q, t)) return 0.75;
    if (q.length >= 4 && t.startsWith(q)) return 0.5;   // "chincha" no debe ganarle a la provincia Chincha con "Chinchaysuyo"
    return 0;
  }
  function coordsUbicacion() {
    const v = String(($('campoUbicacion') || {}).value || '');
    const m = v.match(/[?&](?:q|query|ll)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)/) || v.match(/@(-?\d{1,2}\.\d+),(-?\d{2,3}\.\d+)/) ||
      v.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{2,3}\.\d{3,})/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  }
  function km(a, p) {
    if (!p || !a.latitud || !a.longitud) return null;
    const R = 6371, r = x => x * Math.PI / 180;
    const dLat = r(a.latitud - p.lat), dLng = r(a.longitud - p.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(p.lat)) * Math.cos(r(a.latitud)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function buscar(texto) {
    if (!agencias) return [];
    const qs = [...new Set(tokens(texto))];
    const frase = norm(texto);
    const fraseCompacta = frase.replace(/ /g, '');
    const punto = coordsUbicacion();
    const res = [];
    for (const a of agencias) {
      let suma = 0, cubiertas = 0;
      for (const q of qs) {
        let mejor = 0;
        for (const [ts, peso] of a._campos) {
          for (const t of ts) {
            const p = parecido(q, t);
            if (p) mejor = Math.max(mejor, p * peso * (idf[t] || 1));
          }
        }
        if (mejor) { suma += mejor; cubiertas++; }
      }
      // Nombre completo dentro del texto ("tingo maria leoncio prado", "ovalo papal")
      if (a._nombre.length >= 5 && (' ' + frase + ' ').includes(' ' + a._nombre + ' ')) suma += 12;
      // ...o escrito pegado ("LaTinguiña")
      else if (a._compacto.length >= 7 && fraseCompacta.includes(a._compacto)) suma += 10;
      const d = km(a, punto);
      let puntaje = qs.length ? suma * (0.4 + cubiertas / qs.length) : 0;
      if (d !== null) puntaje += qs.length ? 4 * Math.exp(-d / 20) : 100 - Math.min(d, 99);
      if (puntaje > 0) res.push({ a, puntaje, d });
    }
    res.sort((x, y) => y.puntaje - x.puntaje);
    return res.slice(0, MAX_SUGERENCIAS);
  }

  // ---------- Textos de tamaño ----------
  function recibeTxt(a) {
    if (a.max_paquete) return `Recibe hasta paquete ${a.max_paquete}` + (PAQUETES[a.max_paquete] ? ` (${PAQUETES[a.max_paquete]})` : '');
    // Micro: en ventanilla rechazan piezas de más de 1 m aunque el volumen quepa (ver shalom_admite)
    if (a.max_kg) return `Recibe hasta ${a.max_kg} kg` + (a.max_m3 ? ` / ${a.max_m3} m³` : '') + (a.max_m3 && a.max_m3 <= 0.12 ? ', piezas de hasta 1 m' : '');
    return a.categoria_recibe ? 'Recibe: ' + String(a.categoria_recibe).toLowerCase() : 'Sin dato de tamaño';
  }
  function paqueteTxt(p) {
    if (!p) return '';
    const m = p.medidas || [];
    const nombre = p.paquete === 'XL' ? 'más grande que paquete L' : 'paquete ' + p.paquete;
    return `📦 Pedido: <b>${esc(nombre)}</b>` + (m[0] ? ` (${m.join('×')} cm, ${p.kg} kg)` : '') +
      (p.sin_medidas && p.sin_medidas.length ? ` · <span class="shalom-warn">sin medidas: ${esc(p.sin_medidas.join(', '))}</span>` : '');
  }

  // ---------- Interfaz ----------
  function estilos() {
    if ($('shalomEstilos')) return;
    const st = document.createElement('style');
    st.id = 'shalomEstilos';
    st.textContent = `
      .shalom-panel{border:1px solid rgba(34,197,94,.45);background:rgba(34,197,94,.06);border-radius:8px;padding:7px;margin:0 0 8px;font-size:11px}
      .shalom-head{display:flex;align-items:center;gap:6px;font-weight:800;margin-bottom:5px}
      .shalom-head .x{margin-left:auto;background:none;border:0;color:inherit;opacity:.7;cursor:pointer;font-size:13px}
      .shalom-panel input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:inherit;font-size:12px}
      .shalom-paq{margin:0 0 5px;line-height:1.35}
      .shalom-lista{margin-top:5px;max-height:230px;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px}
      .shalom-item{display:block;width:100%;text-align:left;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;cursor:pointer;font-size:11px;line-height:1.35;overflow-wrap:anywhere;box-sizing:border-box}
      .shalom-item:hover,.shalom-item:focus{border-color:#22c55e;background:rgba(34,197,94,.12);outline:none}
      .shalom-item.no{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.07)}
      .shalom-item.no b{text-decoration:line-through;text-decoration-color:rgba(239,68,68,.8)}
      .shalom-item b{font-size:12px}
      .shalom-tag{display:inline-block;font-size:9px;font-weight:800;padding:0 5px;border-radius:8px;margin-left:4px;vertical-align:1px;background:#22c55e;color:#000}
      .shalom-tag.pro{background:#f59e0b}
      .shalom-tag.km{background:rgba(255,255,255,.15);color:inherit}
      .shalom-tag.no{background:#ef4444;color:#fff}
      .shalom-tag.lim{background:#f59e0b;color:#000}
      .shalom-sub{opacity:.75}
      .shalom-no{color:#f87171;font-weight:700}
      .shalom-warn{color:#fbbf24;font-weight:700}
      .shalom-vacio{opacity:.7;padding:4px 2px}
      .shalom-elegida{display:flex;gap:6px;align-items:flex-start}
      .shalom-elegida .txt{flex:1}
      .shalom-elegida button,.shalom-btn,.shalom-link button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:inherit;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:10px;white-space:nowrap}
      .shalom-btn{margin-left:4px;padding:0 5px;font-size:10px;vertical-align:1px}
      .shalom-link{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,255,255,.15)}
      .shalom-link input{flex:1;min-width:140px;font-size:10px;padding:3px 6px}
      .shalom-link .estado{opacity:.8;width:100%}`;
    document.head.appendChild(st);
  }
  function panel() {
    let p = $('shalomPanel');
    if (p) return p;
    const campos = $('camposPedido');
    if (!campos) return null;
    estilos();
    p = document.createElement('div');
    p.id = 'shalomPanel';
    p.className = 'shalom-panel';
    p.hidden = true;
    p.innerHTML = `
      <div class="shalom-head">🚚 Agencia Shalom <span id="shalomInfo" class="shalom-sub" style="font-weight:400"></span>
        <button type="button" class="x" id="shalomCerrar" title="Cerrar">✕</button></div>
      <div id="shalomPaquete" class="shalom-paq"></div>
      <div id="shalomElegida"></div>
      <div id="shalomBusqueda">
        <input id="shalomBuscar" placeholder="Buscar: ciudad, nombre de la agencia o calle…" autocomplete="off">
        <div id="shalomLista" class="shalom-lista"></div>
      </div>
      <div class="shalom-link">
        <button type="button" id="shalomLinkBtn" title="El cliente elige su agencia en un mapa; aquí se llena sola">🔗 Link para que el cliente elija</button>
        <button type="button" id="shalomMsgBtn" hidden title="Copia solo la dirección del link, sin la frase">🔗 Copiar solo el link</button>
        <input id="shalomLinkUrl" readonly hidden>
        <div id="shalomLinkEstado" class="estado"></div>
      </div>`;
    campos.parentNode.insertBefore(p, campos);
    $('shalomCerrar').addEventListener('click', () => { cerradoPorUsuario = true; p.hidden = true; pararSondeo(); });
    $('shalomBuscar').addEventListener('input', e => pintarLista(e.target.value, false));
    $('shalomBuscar').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const b = $('shalomLista').querySelector('.shalom-item'); if (b) b.click(); }
    });
    $('shalomLinkBtn').addEventListener('click', crearLink);
    $('shalomMsgBtn').addEventListener('click', () => {
      const b = $('shalomMsgBtn');
      copiar(link.url).then(ok => {
        b.textContent = ok ? '✅ Link copiado' : '❌ No se pudo copiar';
        setTimeout(() => { b.textContent = '🔗 Copiar solo el link'; }, 3000);
      });
    });
    $('shalomLinkUrl').addEventListener('focus', e => e.target.select());
    return p;
  }
  function pintarPaquete() {
    const box = $('shalomPaquete');
    if (box) box.innerHTML = paqueteTxt(admision.paquete);
  }
  function pintarLista(texto, desdeCliente) {
    const lista = $('shalomLista');
    if (!lista) return;
    if (!agencias) { lista.innerHTML = '<div class="shalom-vacio">Cargando agencias…</div>'; return; }
    const res = buscar(texto);
    const punto = coordsUbicacion();
    $('shalomInfo').textContent = punto ? '· ordenado por cercanía a la ubicación del cliente' : '';
    if (!res.length) {
      lista.innerHTML = `<div class="shalom-vacio">${texto.trim() ? 'Sin coincidencias. Prueba con la ciudad o el distrito.' : 'Escribe la ciudad, el distrito o el nombre de la agencia.'}</div>`;
      return;
    }
    // "Sugerida" = la mejor que SÍ recibe el pedido
    const iSug = desdeCliente ? res.findIndex(r => estadoDe(r.a) !== 'no') : -1;
    lista.innerHTML = res.map((r, i) => {
      const a = r.a, est = estadoDe(a);
      const lugar = [...new Set(String(a.lugar || '').split('/').map(s => s.trim()).filter(s => s && s !== a.nombre))].map(titulo).join(' / ');
      const tamano = est === 'no' ? `<div class="shalom-no">❌ No recibe este pedido · ${esc(minus(recibeTxt(a)))}</div>`
        : est === 'limite' ? `<div class="shalom-warn">⚠️ Pedido al límite · ${esc(minus(recibeTxt(a)))}</div>`
        : `<div class="shalom-sub">${esc(recibeTxt(a))}</div>`;
      return `<button type="button" class="shalom-item${est === 'no' ? ' no' : ''}" data-i="${i}">
        <b>${esc(a.nombre)}</b>${i === iSug ? '<span class="shalom-tag">Sugerida</span>' : ''}${est === 'no' ? '<span class="shalom-tag no">No recibe</span>' : ''}${est === 'limite' ? '<span class="shalom-tag lim">Al límite</span>' : ''}${a.puntospro ? '<span class="shalom-tag pro">Punto PRO</span>' : ''}${r.d !== null ? `<span class="shalom-tag km">${r.d < 10 ? r.d.toFixed(1) : Math.round(r.d)} km</span>` : ''}
        <div class="shalom-sub">${esc(lugar)}</div>
        <div>${esc(titulo(a.direccion))}</div>
        ${tamano}
      </button>`;
    }).join('');
    lista.querySelectorAll('.shalom-item').forEach(b => b.addEventListener('click', () => elegir(res[Number(b.dataset.i)].a)));
  }
  function pintarElegida() {
    const box = $('shalomElegida'), busq = $('shalomBusqueda');
    if (!box) return;
    if (!elegida) { box.innerHTML = ''; busq.hidden = false; return; }
    busq.hidden = true;
    const est = estadoDe(elegida);
    box.innerHTML = `<div class="shalom-elegida"><div class="txt">✅ <b>SHALOM: ${esc(elegida.nombre)}</b>${elegidaPorCliente ? '<span class="shalom-tag">Elegida por el cliente</span>' : ''}<br>
      <span class="shalom-sub">${esc(titulo(elegida.direccion))}</span><br>
      ${est === 'no' ? `<span class="shalom-no">❌ Esta agencia NO recibe este pedido (${esc(minus(recibeTxt(elegida)))})</span>`
        : est === 'limite' ? `<span class="shalom-warn">⚠️ Pedido al límite de lo que recibe (${esc(minus(recibeTxt(elegida)))})</span>`
        : `<span class="shalom-sub">${esc(recibeTxt(elegida))}</span>`}</div>
      <button type="button" id="shalomCambiar">Cambiar</button></div>`;
    $('shalomCambiar').addEventListener('click', () => {
      elegida = null; elegidaPorCliente = false; pintarElegida();
      const q = $('shalomBuscar'); q.focus(); pintarLista(q.value, false);
    });
  }
  function elegir(a, porCliente) {
    if (!porCliente && estadoDe(a) === 'no' &&
        !confirm(`❌ ${a.nombre} no recibe este pedido.\n${recibeTxt(a)}.\n\nEn ventanilla lo rechazarían. ¿Elegirla igual?`)) return;
    elegida = a;
    elegidaPorCliente = !!porCliente;
    escribiendoNosotros = true;
    const dir = $('campoDireccion'), dis = $('campoDistrito');
    if (dir) { dir.value = textoDireccion(a); dir.style.borderColor = 'rgba(34,197,94,.6)'; }
    if (dis) { dis.value = 'Agencia'; dis.style.borderColor = 'rgba(34,197,94,.6)'; }
    escribiendoNosotros = false;
    pintarElegida();
  }

  // ---------- Link para el cliente ----------
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).then(() => true).catch(() => copiarViejo(texto));
    }
    return Promise.resolve(copiarViejo(texto));
  }
  function copiarViejo(texto) {   // el iframe de Chatwoot a veces bloquea el portapapeles moderno
    const t = document.createElement('textarea');
    t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    t.remove();
    return ok;
  }
  const mensajeLink = () => `📍 Elige aquí la agencia Shalom donde recogerás tu pedido (solo te mostramos las que reciben su tamaño):\n${link.url}`;
  function crearLink() {
    const conv = conversacion();
    const items = itemsCarrito();
    const btn = $('shalomLinkBtn');
    if (!conv) { alert('Abre el tomador desde la conversación de Chatwoot para generar el link.'); return; }
    if (!items.length) { alert('Agrega primero los productos: el link muestra solo las agencias que reciben el tamaño del pedido.'); return; }
    btn.disabled = true; btn.textContent = 'Generando…';
    rpc('shalom_link_crear', { p_conversation_id: conv, p_tienda: TIENDA, p_items: items })
      .then(token => {
        link.url = ERP_LINK + token;
        const inp = $('shalomLinkUrl'); inp.hidden = false; inp.value = link.url;
        $('shalomMsgBtn').hidden = false;
        // Frase para el cliente + link, lista para pegar en el chat ("Copiar solo el link" para lo demás)
        return copiar(mensajeLink()).then(ok => {
          btn.textContent = ok ? '✅ Mensaje con link copiado' : '🔗 Copia el link de al lado';
          if (!ok) inp.select();
          setTimeout(() => { btn.textContent = '🔗 Nuevo link'; }, 4000);
          estadoLink('Link generado. Cuando el cliente elija, la agencia se llena sola aquí.');
          iniciarSondeo();
        });
      })
      .catch(err => { alert('No se pudo generar el link: ' + err.message); btn.textContent = '🔗 Link para que el cliente elija'; })
      .finally(() => { btn.disabled = false; });
  }
  function estadoLink(t) { const e = $('shalomLinkEstado'); if (e) e.textContent = t; }
  /** Pregunta si el cliente ya eligió (por conversation_id). Si eligió, la aplica. */
  function revisarEleccion() {
    const conv = conversacion();
    if (!conv) return Promise.resolve(null);
    return rpc('shalom_link_eleccion', { p_conversation_id: conv }).then(r => {
      link.estado = r;
      const e = r && r.elegida;
      if (e && agencias && (!elegida || elegida.ter_id !== e.ter_id)) {
        const a = agencias.find(x => x.ter_id === e.ter_id);
        // Solo se aplica sola si el agente no eligió otra a mano después
        if (a && (!elegida || elegidaPorCliente)) {
          const p = panel(); if (p) p.hidden = false;
          elegir(a, true);
          estadoLink(`El cliente eligió ${a.nombre} (${new Date(e.elegido_en).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}).`);
        } else if (a) {
          estadoLink(`El cliente eligió ${a.nombre}, pero aquí hay otra agencia elegida a mano.`);
        }
      } else if (!e && r) {
        estadoLink(r.abierto ? '👀 El cliente abrió el link, aún no elige.' : r.pendiente ? '⏳ Link enviado, el cliente aún no lo abre.' : '');
      }
      if (e || !(r && r.pendiente)) pararSondeo();
      return r;
    }).catch(() => null);
  }
  function iniciarSondeo() {
    pararSondeo();
    sondeo = setInterval(() => {
      const p = $('shalomPanel');
      if (!p || p.hidden || document.hidden) return;
      revisarEleccion();
    }, 8000);
  }
  function pararSondeo() { if (sondeo) { clearInterval(sondeo); sondeo = null; } }

  // ---------- Apertura ----------
  // Texto que escribió el cliente: lo que la IA puso tras "SHALOM:"
  function textoCliente() {
    return String(($('campoDireccion') || {}).value || '').replace(/^\s*shalo[mn]\s*:?\s*/i, '');
  }
  function pareceShalom() {
    const dir = String(($('campoDireccion') || {}).value || '');
    const dis = String(($('campoDistrito') || {}).value || '');
    return /shalo[mn]/i.test(dir) || (/^\s*agencia\s*$/i.test(dis) && !/olva|palomino|marvisur|flores|cruz del sur/i.test(dir));
  }
  function coincideOficial(dir) {
    const d = String(dir || '').replace(/\s+/g, ' ').trim().toUpperCase();
    return (agencias || []).find(a => { const t = textoDireccion(a).toUpperCase(); return d === t || d.startsWith(t + ' '); }) || null;
  }

  function abrir(desdeCliente) {
    const p = panel();
    if (!p) return;
    p.hidden = false;
    Promise.all([cargar(), revisarTamano()]).then(() => {
      pintarPaquete();
      const ya = coincideOficial(($('campoDireccion') || {}).value);
      if (ya) { elegida = ya; pintarElegida(); }
      else {
        pintarElegida();
        const q = $('shalomBuscar');
        if (desdeCliente && !q.value) q.value = textoCliente();
        pintarLista(q.value, desdeCliente && !!q.value.trim());
        if (!agencias) $('shalomLista').innerHTML = '<div class="shalom-vacio">No se pudo cargar la lista de agencias. Escribe la dirección a mano.</div>';
      }
      return revisarEleccion().then(r => { if (r && r.pendiente && !(r.elegida)) iniciarSondeo(); });
    });
  }

  /** Tras el autocompletado de la IA: si es pedido Shalom (o el cliente ya eligió por link), abre el buscador. */
  function revisar() {
    if (cerradoPorUsuario || elegida) return;
    if (pareceShalom()) { abrir(true); return; }
    // El cliente pudo haber elegido por link aunque la IA no detectara Shalom
    cargar().then(() => revisarEleccion());
  }

  /** Antes de subir: avisa si es Shalom y la agencia no salió de la lista, o si no recibe el pedido. */
  function confirmarEnvio() {
    const dir = String(($('campoDireccion') || {}).value || '');
    if (!/shalo[mn]/i.test(dir) || !agencias) return true;
    const a = coincideOficial(dir);
    if (!a) {
      return confirm('⚠️ La agencia Shalom no se eligió de la lista.\n\nLa guía de remisión necesita la dirección oficial de la agencia ' +
        '(usa el buscador 🚚 sobre los campos).\n\n¿Subir el pedido igual?');
    }
    if (estadoDe(a) === 'no') {
      return confirm(`❌ ${a.nombre} no recibe este pedido (${minus(recibeTxt(a))}).\nEn ventanilla lo rechazarían.\n\n¿Subir el pedido igual?`);
    }
    return true;
  }

  function iniciar() {
    const dir = $('campoDireccion'), dis = $('campoDistrito');
    if (!dir) return;
    estilos();
    // Botón 🚚 junto a la etiqueta "Dirección"
    const label = dir.previousElementSibling;
    if (label && label.tagName === 'LABEL' && !$('shalomAbrir')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'shalomAbrir'; b.className = 'shalom-btn'; b.title = 'Elegir agencia Shalom'; b.textContent = '🚚 Shalom';
      b.addEventListener('click', () => { cerradoPorUsuario = false; abrir(pareceShalom()); setTimeout(() => $('shalomBuscar') && !elegida && $('shalomBuscar').focus(), 50); });
      label.appendChild(b);
    }
    const alEscribir = () => {
      if (escribiendoNosotros) return;
      if (elegida && !coincideOficial(dir.value)) { elegida = null; elegidaPorCliente = false; pintarElegida(); }
      if (!elegida && !cerradoPorUsuario && pareceShalom() && $('shalomPanel') && $('shalomPanel').hidden) abrir(true);
    };
    dir.addEventListener('input', alEscribir);
    if (dis) dis.addEventListener('input', alEscribir);
    // Si cambia el carrito con el panel abierto, se recalcula el tamaño al volver a mirarlo
    document.addEventListener('click', e => {
      const p = $('shalomPanel');
      if (!p || p.hidden || p.contains(e.target)) return;
      const antes = admision.firma;
      setTimeout(() => revisarTamano().then(() => {
        if (admision.firma === antes) return;
        pintarPaquete(); if (elegida) pintarElegida(); else pintarLista($('shalomBuscar').value, false);
      }), 300);
    });
    cargar();   // en segundo plano: cuando se abra el resumen ya está lista
  }

  window.ShalomAgencias = { revisar, confirmarEnvio, buscar: t => cargar().then(() => buscar(t)), revisarTamano };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
