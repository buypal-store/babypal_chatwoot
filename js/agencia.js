// ---------- OTRAS AGENCIAS (no Shalom) ----------
// Botón "🚛 Agencia" junto a "🚚 Shalom" sobre el campo Dirección. Sugiere agencias que NO son Shalom
// (Marvisur, Flores, Olva…) con su sede y dirección, para que la guía de remisión salga con la dirección buena.
// Datos: vista herramientas.agencias_externas (se arma sola desde los pedidos ya subidos con distrito "Agencia":
// si una agencia no está, se escribe completa una vez —"Marvisur: Yauyos — Av. Nicolás Arriola 2159"— y
// aparece sola para la próxima). Al elegir: Dirección = "Agencia: Sede — dirección" y Distrito = "Agencia".
// Este archivo es IDÉNTICO en los 4 tomadores. Maqueta de Wendy: tomador_boton_agencia.html (12/10/2026).
(function () {
  const SUPA_URL = 'https://fxwndndaabyktruigxal.supabase.co';
  // La misma llave publicable del buscador Shalom; para esta vista solo tiene lectura
  const SUPA_KEY = 'sb_publishable_SneWwcbXYItpg1dIyjT0Kw_CinL31Jd';
  const CACHE = 'agencias_externas_v1';
  const CACHE_MS = 6 * 3600 * 1000;
  const MAX_SUGERENCIAS = 6;

  let agencias = null;
  let cargando = null;

  const $ = id => document.getElementById(id);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function cargar() {
    if (agencias) return Promise.resolve(agencias);
    if (cargando) return cargando;
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.d) && c.d.length) { agencias = c.d; return Promise.resolve(agencias); }
    } catch (e) { /* sin almacenamiento: se descarga */ }
    const url = `${SUPA_URL}/rest/v1/agencias_externas?select=agencia,sede,veces,ultima_vez&order=veces.desc,ultima_vez.desc&limit=500`;
    // Accept-Profile: la vista vive en el esquema "herramientas", no en public
    cargando = fetch(url, { headers: { apikey: SUPA_KEY, 'Accept-Profile': 'herramientas' } })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        agencias = d.map(a => Object.assign(a, { _texto: norm(a.agencia + ' ' + a.sede) }));
        try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d: agencias })); } catch (e) { /* lleno o bloqueado */ }
        return agencias;
      })
      .catch(err => { cargando = null; console.warn('Otras agencias no disponibles:', err.message); return null; });
    return cargando;
  }

  function buscar(texto) {
    if (!agencias) return [];
    const palabras = norm(texto).split(/\s+/).filter(Boolean);
    return agencias.filter(a => palabras.every(p => a._texto.includes(p))).slice(0, MAX_SUGERENCIAS);
  }

  // ---------- Interfaz (los estilos .shalom-* ya los inyecta shalom.js) ----------
  function textoDireccion(a) { return a.sede ? `${a.agencia}: ${a.sede}` : `${a.agencia}: `; }
  function pintar(texto) {
    const lista = $('agenciaLista');
    if (!lista) return;
    if (!agencias) { lista.innerHTML = '<div class="shalom-vacio">Cargando agencias…</div>'; return; }
    const res = buscar(texto);
    if (!res.length) {
      lista.innerHTML = '<div class="shalom-vacio">Sin coincidencias. Escríbela completa en Dirección, por ejemplo ' +
        '"Marvisur: Yauyos — Av. Nicolás Arriola 2159", y queda guardada para la próxima.</div>';
      return;
    }
    lista.innerHTML = res.map((a, i) => `<button type="button" class="shalom-item" data-i="${i}">
      <b>${esc(a.agencia)}${a.sede ? ' · ' + esc(a.sede.split('—')[0].split(' - ')[0].trim()) : ''}</b>${i === 0 ? '<span class="shalom-tag">Sugerida</span>' : ''}
      <div>${a.sede ? esc(a.sede) : 'Sin dirección guardada todavía'}</div>
      <div class="shalom-sub">Usada ${a.veces} ${a.veces === 1 ? 'vez' : 'veces'} · última ${esc(String(a.ultima_vez || '').split('-').reverse().join('/'))}</div>
    </button>`).join('');
    lista.querySelectorAll('.shalom-item').forEach(b => b.addEventListener('click', () => elegir(res[Number(b.dataset.i)])));
  }
  function elegir(a) {
    const dir = $('campoDireccion'), dis = $('campoDistrito');
    if (dir) { dir.value = textoDireccion(a); dir.style.borderColor = 'rgba(34,197,94,.6)'; }
    if (dis) { dis.value = 'Agencia'; dis.style.borderColor = 'rgba(34,197,94,.6)'; }
    cerrar();
    if (dir && !a.sede) { dir.focus(); dir.setSelectionRange(dir.value.length, dir.value.length); }
  }
  function cerrar() { const p = $('agenciaPanel'); if (p) p.hidden = true; }
  function panel() {
    let p = $('agenciaPanel');
    if (p) return p;
    const campos = $('camposPedido');
    if (!campos) return null;
    p = document.createElement('div');
    p.id = 'agenciaPanel';
    p.className = 'shalom-panel';
    p.hidden = true;
    p.innerHTML = `
      <div class="shalom-head">🚛 Agencia (no Shalom)
        <button type="button" class="x" id="agenciaCerrar" title="Cerrar">✕</button></div>
      <div id="agenciaBusqueda">
        <input id="agenciaBuscar" placeholder="Buscar: Marvisur, Flores, Olva, sede…" autocomplete="off">
        <div id="agenciaLista" class="shalom-lista"></div>
      </div>
      <div class="shalom-sub" style="margin-top:5px">¿No está? Escríbela completa en Dirección ("Agencia: Sede — dirección") y queda guardada para la próxima.</div>`;
    campos.parentNode.insertBefore(p, campos);
    $('agenciaCerrar').addEventListener('click', cerrar);
    $('agenciaBuscar').addEventListener('input', e => pintar(e.target.value));
    $('agenciaBuscar').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const b = $('agenciaLista').querySelector('.shalom-item'); if (b) b.click(); }
    });
    return p;
  }
  function abrir() {
    const p = panel();
    if (!p) return;
    const sh = $('shalomPanel');          // no apilar los dos buscadores
    if (sh) sh.hidden = true;
    p.hidden = false;
    const q = $('agenciaBuscar');
    // Arranca con lo que ya hay en Dirección (si no es Shalom), como sugerencia
    const dir = String(($('campoDireccion') || {}).value || '');
    if (!q.value && dir && !/shalo[mn]/i.test(dir)) q.value = dir.split(/[:—-]/)[0].replace(/^\s*agencia\s*/i, '').trim();
    pintar(q.value);
    cargar().then(d => {
      if (d) { pintar(q.value); return; }
      const l = $('agenciaLista');
      if (l) l.innerHTML = '<div class="shalom-vacio">No se pudo cargar la lista. Escribe la agencia completa en Dirección ("Agencia: Sede — dirección").</div>';
    });
    setTimeout(() => q.focus(), 50);
  }

  function iniciar() {
    const dir = $('campoDireccion');
    if (!dir) return;
    // Botón 🚛 junto al 🚚 de Shalom, en la etiqueta "Dirección" (shalom.js pone el suyo al iniciar)
    const label = dir.previousElementSibling;
    if (label && label.tagName === 'LABEL' && !$('agenciaAbrir')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'agenciaAbrir'; b.className = 'shalom-btn'; b.title = 'Elegir otra agencia (no Shalom)'; b.textContent = '🚛 Agencia';
      b.addEventListener('click', abrir);
      label.appendChild(b);
    }
    cargar();   // en segundo plano: cuando se abra ya está lista
  }

  window.OtrasAgencias = { abrir, buscar: t => cargar().then(() => buscar(t)) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
