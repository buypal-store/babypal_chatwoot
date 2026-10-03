// ---------- AGENCIAS SHALOM ----------
// Buscador de agencias en el Resumen de Pedido. La lista sale de Supabase (tabla
// shalom_agencias, se actualiza cada lunes desde shalom.com.pe/agencias).
// Al elegir una agencia:  Dirección = "SHALOM: <NOMBRE> - <DIRECCIÓN OFICIAL>"  y  Distrito = "Agencia".
// La dirección oficial es para la guía de remisión; la etiqueta imprime solo "SHALOM: <NOMBRE>".
//
// Se abre solo cuando la IA trae un pedido Shalom (Distrito "Agencia" / Dirección "SHALOM: ...")
// o con el botón 🚚 junto a Dirección. Sugiere a partir de lo que escribió el cliente y, si
// compartió su ubicación (campo Ubicación), ordena por cercanía.
//
// Ganchos en app.js:  autocompletarCampos → ShalomAgencias.revisar()
//                     enviarPedido        → ShalomAgencias.confirmarEnvio()
(function () {
  const SUPA_URL = 'https://fxwndndaabyktruigxal.supabase.co';
  // Llave publicable: con ella solo se puede LEER shalom_agencias (y las vistas web_*)
  const SUPA_KEY = 'sb_publishable_SneWwcbXYItpg1dIyjT0Kw_CinL31Jd';
  const CACHE = 'shalom_agencias_v1';
  const CACHE_MS = 12 * 3600 * 1000;
  const MAX_SUGERENCIAS = 6;

  // Palabras que no ayudan a distinguir una agencia de otra
  const VACIAS = new Set(('shalom shalon agencia agencias sede por la el los las de del en a al que esta cerca mas ' +
    'cercana cercano av avenida jr jiron calle ca nro n no mz lt y o frente ref referencia altura cuadra cdra cdras lado ' +
    'costado para envio enviar mandar porfa favor quiero recojo recoger provincia departamento distrito dpto co ' +
    'me mi su se lo una un con sin ahi alli hay donde queda').split(' '));

  let agencias = null;     // [{...fila, _campos:[[tokens], peso], _todo}]
  let idf = {};
  let cargando = null;
  let elegida = null;
  let cerradoPorUsuario = false;
  let escribiendoNosotros = false;

  const $ = id => document.getElementById(id);
  const quitarTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => quitarTildes(String(s || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = s => norm(s).split(' ').filter(t => t && !VACIAS.has(t) && (t.length >= 3 || /^\d{2,}$/.test(t)));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const titulo = s => String(s || '').toLowerCase().replace(/(^|[\s/(.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

  const textoDireccion = a => a.direccion ? `SHALOM: ${a.nombre} - ${a.direccion}` : `SHALOM: ${a.nombre}`;

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
      `latitud,longitud,categoria_recibe,puntospro&activa=eq.true&recibe=eq.true&order=nombre&limit=3000`;
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
      .shalom-lista{margin-top:5px;max-height:230px;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:4px}
      .shalom-item{display:block;width:100%;text-align:left;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:inherit;cursor:pointer;font-size:11px;line-height:1.35;overflow-wrap:anywhere;box-sizing:border-box}
      .shalom-item:hover,.shalom-item:focus{border-color:#22c55e;background:rgba(34,197,94,.12);outline:none}
      .shalom-item b{font-size:12px}
      .shalom-tag{display:inline-block;font-size:9px;font-weight:800;padding:0 5px;border-radius:8px;margin-left:4px;vertical-align:1px;background:#22c55e;color:#000}
      .shalom-tag.pro{background:#f59e0b}
      .shalom-tag.km{background:rgba(255,255,255,.15);color:inherit}
      .shalom-sub{opacity:.75}
      .shalom-vacio{opacity:.7;padding:4px 2px}
      .shalom-elegida{display:flex;gap:6px;align-items:flex-start}
      .shalom-elegida .txt{flex:1}
      .shalom-elegida button,.shalom-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);color:inherit;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:10px;white-space:nowrap}
      .shalom-btn{margin-left:4px;padding:0 5px;font-size:10px;vertical-align:1px}`;
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
      <div id="shalomElegida"></div>
      <div id="shalomBusqueda">
        <input id="shalomBuscar" placeholder="Buscar: ciudad, nombre de la agencia o calle…" autocomplete="off">
        <div id="shalomLista" class="shalom-lista"></div>
      </div>`;
    campos.parentNode.insertBefore(p, campos);
    $('shalomCerrar').addEventListener('click', () => { cerradoPorUsuario = true; p.hidden = true; });
    $('shalomBuscar').addEventListener('input', e => pintarLista(e.target.value, false));
    $('shalomBuscar').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const b = $('shalomLista').querySelector('.shalom-item'); if (b) b.click(); }
    });
    return p;
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
    lista.innerHTML = res.map((r, i) => {
      const a = r.a;
      const lugar = [...new Set(String(a.lugar || '').split('/').map(s => s.trim()).filter(s => s && s !== a.nombre))].map(titulo).join(' / ');
      return `<button type="button" class="shalom-item" data-i="${i}">
        <b>${esc(a.nombre)}</b>${i === 0 && desdeCliente ? '<span class="shalom-tag">Sugerida</span>' : ''}${a.puntospro ? '<span class="shalom-tag pro">Punto PRO</span>' : ''}${r.d !== null ? `<span class="shalom-tag km">${r.d < 10 ? r.d.toFixed(1) : Math.round(r.d)} km</span>` : ''}
        <div class="shalom-sub">${esc(lugar)}</div>
        <div>${esc(titulo(a.direccion))}</div>
        ${a.categoria_recibe ? `<div class="shalom-sub">Recibe ${esc(String(a.categoria_recibe).toLowerCase())}</div>` : ''}
      </button>`;
    }).join('');
    lista.querySelectorAll('.shalom-item').forEach(b => b.addEventListener('click', () => elegir(res[Number(b.dataset.i)].a)));
  }
  function pintarElegida() {
    const box = $('shalomElegida'), busq = $('shalomBusqueda');
    if (!box) return;
    if (!elegida) { box.innerHTML = ''; busq.hidden = false; return; }
    busq.hidden = true;
    box.innerHTML = `<div class="shalom-elegida"><div class="txt">✅ <b>SHALOM: ${esc(elegida.nombre)}</b><br>
      <span class="shalom-sub">${esc(titulo(elegida.direccion))}</span></div>
      <button type="button" id="shalomCambiar">Cambiar</button></div>`;
    $('shalomCambiar').addEventListener('click', () => {
      elegida = null; pintarElegida();
      const q = $('shalomBuscar'); q.focus(); pintarLista(q.value, false);
    });
  }
  function elegir(a) {
    elegida = a;
    escribiendoNosotros = true;
    const dir = $('campoDireccion'), dis = $('campoDistrito');
    if (dir) { dir.value = textoDireccion(a); dir.style.borderColor = 'rgba(34,197,94,.6)'; }
    if (dis) { dis.value = 'Agencia'; dis.style.borderColor = 'rgba(34,197,94,.6)'; }
    escribiendoNosotros = false;
    pintarElegida();
  }

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
    cargar().then(() => {
      const ya = coincideOficial(($('campoDireccion') || {}).value);
      if (ya) { elegida = ya; pintarElegida(); return; }
      pintarElegida();
      const q = $('shalomBuscar');
      if (desdeCliente && !q.value) q.value = textoCliente();
      pintarLista(q.value, desdeCliente && !!q.value.trim());
      if (!agencias) $('shalomLista').innerHTML = '<div class="shalom-vacio">No se pudo cargar la lista de agencias. Escribe la dirección a mano.</div>';
    });
  }

  /** Tras el autocompletado de la IA: si es pedido Shalom, abre el buscador con sugerencias. */
  function revisar() {
    if (cerradoPorUsuario || elegida) return;
    if (pareceShalom()) abrir(true);
  }

  /** Antes de subir: avisa si es Shalom y la agencia no salió de la lista. */
  function confirmarEnvio() {
    const dir = String(($('campoDireccion') || {}).value || '');
    if (!/shalo[mn]/i.test(dir) || !agencias || coincideOficial(dir)) return true;
    return confirm('⚠️ La agencia Shalom no se eligió de la lista.\n\nLa guía de remisión necesita la dirección oficial de la agencia ' +
      '(usa el buscador 🚚 sobre los campos).\n\n¿Subir el pedido igual?');
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
      if (elegida && !coincideOficial(dir.value)) { elegida = null; pintarElegida(); }
      if (!elegida && !cerradoPorUsuario && pareceShalom() && $('shalomPanel') && $('shalomPanel').hidden) abrir(true);
    };
    dir.addEventListener('input', alEscribir);
    if (dis) dis.addEventListener('input', alEscribir);
    cargar();   // en segundo plano: cuando se abra el resumen ya está lista
  }

  window.ShalomAgencias = { revisar, confirmarEnvio, buscar: t => cargar().then(() => buscar(t)) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
