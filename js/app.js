/* ==========================================
   CATÁLOGO DE ESCALERAS – LÓGICA COMPLETA
   (sin guante automático, con botón regalo manual)
   ========================================== */

const state = {
  cart: [],
  cartSeq: 0,
  finalTotal: 0
};

const el = (id) => document.getElementById(id);

function formatPEN(n) {
  return `S/ ${Math.round(Number(n) || 0)}`;
}

// ---------- RENDERIZAR PRODUCTOS ----------
function renderGrid() {
  const grid = el("productGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const productos = window.productosData || [];
  productos.forEach((prod, index) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-img">
        <img src="${prod.imagen || 'assets/images/placeholder.jpg'}" alt="${prod.nombre || 'Escalera'}">
      </div>
      <div class="card-body">
        <div class="card-name">${prod.nombre || 'Escalera'}</div>
        <div class="card-meta">
          <span class="sku-display">${prod.sku || ''}</span>
          <div class="price">${formatPEN(prod.precio)}</div>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn small btn-agregar" data-index="${index}">Agregar</button>
      </div>
    `;
    grid.appendChild(card);
  });

  // Eventos de los botones "Agregar" (SOLO el producto, sin regalo automático)
  document.querySelectorAll('.btn-agregar').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const index = parseInt(this.dataset.index);
      const prod = productos[index];

      state.cart.push({
        cartId: ++state.cartSeq,
        sku: prod.sku,
        nombre: prod.nombre || 'Escalera',
        precio: Number(prod.precio) || 0,
        type: 'escalera'
      });

      actualizarContador();
      this.textContent = '✓ Agregado';
      setTimeout(() => { this.textContent = 'Agregar'; }, 600);
    });
  });
}

// ---------- CONTADOR DEL CARRITO ----------
function actualizarContador() {
  const contador = el("contadorCarrito");
  if (!contador) return;
  const total = state.cart.length;
  contador.textContent = total;
  contador.style.display = total === 0 ? 'none' : 'inline-flex';
}

function vaciarCarrito() {
  state.cart = [];
  state.finalTotal = 0;
  actualizarContador();
}

// ---------- MODAL RESUMEN ----------
function abrirResumen() {
  if (state.cart.length === 0) {
    alert('🛒 No hay productos en el pedido');
    return;
  }
  renderResumen();
  el("summaryModal").classList.remove("hidden");
}

function cerrarResumen() {
  el("summaryModal").classList.add("hidden");
}

// Alternar regalo en un producto del carrito
function toggleRegalo(cartId) {
  const item = state.cart.find(i => i.cartId === cartId);
  if (!item) return;

  if (item.regaloOriginalPrice !== undefined) {
    // Restaurar precio original
    item.precio = item.regaloOriginalPrice;
    delete item.regaloOriginalPrice;
  } else {
    // Convertir en regalo (guardar precio actual)
    if (item.precio > 0) {
      item.regaloOriginalPrice = item.precio;
      item.precio = 0;
    }
  }

  // Resetear el precio final al nuevo subtotal
  const nuevoSubtotal = state.cart.reduce((sum, i) => sum + i.precio, 0);
  state.finalTotal = nuevoSubtotal;

  // Re-renderizar el resumen con los cambios
  renderResumen();
}

function renderResumen() {
  const lines = el("summaryLines");
  if (!lines) return;
  lines.innerHTML = "";

  const subtotal = state.cart.reduce((sum, item) => sum + item.precio, 0);

  // Tabla de productos con columna de regalo
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginBottom = "16px";
  table.innerHTML = `
    <thead>
      <tr style="border-bottom:2px solid var(--border);">
        <th style="padding:8px; text-align:left; color:var(--muted);">SKU</th>
        <th style="padding:8px; text-align:left; color:var(--muted);">Producto</th>
        <th style="padding:8px; text-align:right; color:var(--muted);">Precio</th>
        <th style="padding:8px; text-align:center; color:var(--muted);">🎁</th>
      </tr>
    </thead>
    <tbody id="resumenTablaBody"></tbody>
  `;
  lines.appendChild(table);

  const tbody = table.querySelector("#resumenTablaBody");
  state.cart.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="padding:6px 8px; border-bottom:1px solid var(--border); font-size:11px; color:var(--muted);">${item.sku}</td>
      <td style="padding:6px 8px; border-bottom:1px solid var(--border);">${item.nombre}</td>
      <td style="padding:6px 8px; border-bottom:1px solid var(--border); text-align:right; font-weight:700;">${formatPEN(item.precio)}</td>
      <td style="padding:6px 8px; border-bottom:1px solid var(--border); text-align:center;">
        <button class="btn-regalo-toggle" data-cart-id="${item.cartId}" style="cursor:pointer; font-size:16px; background:none; border:none;" title="Alternar regalo">${item.precio === 0 ? '🎁' : '🎁'}</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  // Asignar eventos a los botones de regalo
  document.querySelectorAll('.btn-regalo-toggle').forEach(btn => {
    btn.addEventListener('click', function(e) {
      const cartId = parseInt(this.dataset.cartId);
      toggleRegalo(cartId);
    });
  });

  // Totales
  const totalBlock = document.createElement("div");
  totalBlock.className = "summary-totals";
  totalBlock.innerHTML = `
    <div class="row discount" style="justify-content: space-between; margin-bottom: 12px;">
      <span style="font-weight:600;">Subtotal</span>
      <span style="font-weight:700;">${formatPEN(subtotal)}</span>
    </div>
    <div class="row discount" style="align-items: center; margin-bottom: 12px;">
      <span style="font-weight:600;">Precio final</span>
      <input type="number" id="inputPrecioFinal" class="campo-pedido" 
             value="${state.finalTotal || subtotal}" step="1" min="0"
             style="width:120px; text-align:right; font-weight:700;">
    </div>
    <div class="divider"></div>
    <div class="row final" style="justify-content: space-between;">
      <span style="font-weight:800;">TOTAL FINAL</span>
      <span id="resumenFinal" style="color:var(--accent); font-weight:900; font-size:20px;">
        ${formatPEN(state.finalTotal || subtotal)}
      </span>
    </div>
  `;
  lines.appendChild(totalBlock);

  // Sincronizar input con total final
  const inputFinal = el("inputPrecioFinal");
  if (inputFinal) {
    inputFinal.addEventListener("input", function () {
      const val = Math.round(Number(this.value) || 0);
      state.finalTotal = val;
      if (el("resumenFinal")) {
        el("resumenFinal").textContent = formatPEN(val);
      }
    });
  }

  const btnContinuar = el("btnIrPedidoFinal");
  if (btnContinuar) {
    btnContinuar.onclick = () => {
      cerrarResumen();
      abrirPedidoFinal();
    };
  }
}

// ---------- MODAL PEDIDO FINAL ----------
function abrirPedidoFinal() {
  if (state.cart.length === 0) {
    alert('🛒 No hay productos en el pedido');
    return;
  }
  const subtotal = state.cart.reduce((sum, item) => sum + item.precio, 0);
  const totalFinal = state.finalTotal || subtotal;
  if (el("campoMonto")) el("campoMonto").value = totalFinal;
  renderTablaPedidoFinal();
  el("pedidoModal").classList.remove("hidden");

  // Valores por defecto
  if (el("campoMedio") && !el("campoMedio").value) el("campoMedio").value = "BP";
  if (el("campoTipo") && !el("campoTipo").value) el("campoTipo").value = "Menor";
  if (el("campoTurno") && !el("campoTurno").value) el("campoTurno").value = "T";
  if (el("campoEstado") && !el("campoEstado").value) el("campoEstado").value = "Entregado";

  cargarDatosDesdeN8n();
}

function cerrarPedidoFinal() {
  el("pedidoModal").classList.add("hidden");
}

function renderTablaPedidoFinal() {
  const tbody = el("tablaPedidoBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  let total = 0;

  state.cart.forEach(item => {
    total += item.precio;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="font-size:10px; color:var(--muted);">${item.sku}</td>
      <td>${item.nombre}</td>
      <td style="text-align:right; font-weight:700;">${formatPEN(item.precio)}</td>
    `;
    tbody.appendChild(row);
  });

  const subtotal = state.cart.reduce((sum, item) => sum + item.precio, 0);
  const totalFinal = state.finalTotal || subtotal;

  if (el("tablaPedidoTotal")) el("tablaPedidoTotal").textContent = formatPEN(totalFinal);
  if (el("campoMonto")) el("campoMonto").value = totalFinal;
}

// ---------- ENVIAR PEDIDO A n8n ----------
function enviarPedido() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.precio, 0);
  const totalFinal = state.finalTotal || subtotal;

  const payload = {
    productos: state.cart.map(item => ({
      sku: item.sku,
      nombre: item.nombre,
      precio: item.precio
    })),
    total: totalFinal,
    agente: el("campoAgente")?.value || "",
    reparto: el("campoReparto")?.value || "",
    turno: el("campoTurno")?.value || "T",
    formaPago: el("campoFormaPago")?.value || "",
    pago: el("campoPago")?.value || "",
    boleta: el("campoBoleta")?.value || "",
    observacion: el("campoObservacion")?.value || "",
    comision: el("campoComision")?.value || "",
    ruc: el("campoRUC")?.value || "",
    medio: el("campoMedio")?.value || "BP",
    plataforma: el("campoPlataforma")?.value || "",
    tipo: el("campoTipo")?.value || "Menor",
    dni: el("campoDNI")?.value || "",
    cliente: el("campoCliente")?.value || "",
    celular: el("campoCelular")?.value || "",
    ubicacion: el("campoUbicacion")?.value || "",
    envioCliente: el("campoEnvioCliente")?.value || "",
    direccion: el("campoDireccion")?.value || "",
    distrito: el("campoDistrito")?.value || "",
    zona: el("campoZona")?.value || "",
    cobro: el("campoCobro")?.value || "",
    referencia: el("campoReferencia")?.value || "",
    obs3: el("campoCorreo")?.value || "",
    estado: el("campoEstado")?.value || "Entregado",
    validacion: el("campoValidacion")?.value || "",
    adelanto: el("campoAdelanto")?.value || "",
    conversation_id: new URLSearchParams(window.location.search).get('conversation_id') || "",
    fecha: document.getElementById('campoFecha')?.value || ""
  };

  console.log("📤 Enviando a n8n:", payload);

  fetch('https://n8n.buypal.com.pe/webhook/Subir_pedido_drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (res.ok) {
      alert('✅ Pedido subido correctamente');
      cerrarPedidoFinal();
      vaciarCarrito();
    } else {
      alert('❌ Error al enviar el pedido');
    }
  })
  .catch(err => {
    alert('❌ Error de conexión: ' + err.message);
  });
}

// ---------- CARGAR DATOS DESDE n8n (IA) ----------
async function cargarDatosDesdeN8n() {
  const conversationId = new URLSearchParams(window.location.search).get('conversation_id');
  if (!conversationId) return;

  try {
    const response = await fetch('https://n8n.buypal.com.pe/webhook/Tomar_pedido_IA', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(conversationId) })
    });
    const datos = await response.json();

    if (datos && Object.keys(datos).length > 0) {
      autocompletarCampos(datos);
    }
  } catch (err) {
    console.log('⏳ Reintentando obtener datos de la IA...');
    setTimeout(cargarDatosDesdeN8n, 3000);
  }
}

function autocompletarCampos(datos) {
  const mapeo = {
    nombre: 'campoCliente',
    dni: 'campoDNI',
    numero: 'campoCelular',
    direccion: 'campoDireccion',
    distrito: 'campoDistrito',
    correo: 'campoCorreo',
    agente: 'campoAgente',
    ruc: 'campoRUC',
    comprobante: 'campoBoleta',
    forma_de_pago: 'campoFormaPago',
    live: 'campoPlataforma',
    link_maps: 'campoUbicacion',
    adelanto: 'campoAdelanto',
  };

  Object.entries(datos).forEach(([clave, valor]) => {
    const campoId = mapeo[clave];
    if (campoId) {
      const campo = el(campoId);
      if (campo && !campo.value && valor) {
        campo.value = valor;
        campo.style.borderColor = 'rgba(34,197,94,.4)';
      }
    }
  });
}

// ---------- BÚSQUEDA (por SKU) ----------
function bindSearch() {
  const searchInput = el("searchInput");
  if (!searchInput) return;
  searchInput.addEventListener("input", function (e) {
    const term = e.target.value.trim().toLowerCase();
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
      const skuDisplay = card.querySelector('.sku-display');
      const sku = (skuDisplay?.textContent || '').toLowerCase();
      card.style.display = sku.includes(term) ? '' : 'none';
    });
  });
}

// ---------- INICIALIZACIÓN ----------
function init() {
  renderGrid();
  bindSearch();

  el("btnVerPedido")?.addEventListener("click", abrirResumen);
  el("btnClear")?.addEventListener("click", () => {
    if (confirm("¿Vaciar todo el carrito?")) vaciarCarrito();
  });
  el("summaryClose")?.addEventListener("click", cerrarResumen);
  el("pedidoClose")?.addEventListener("click", cerrarPedidoFinal);
  el("btnEnviarPedido")?.addEventListener("click", enviarPedido);

  const summaryModal = el("summaryModal");
  if (summaryModal) summaryModal.addEventListener("click", (e) => { if (e.target.id === "summaryModal") cerrarResumen(); });
  const pedidoModal = el("pedidoModal");
  if (pedidoModal) pedidoModal.addEventListener("click", (e) => { if (e.target.id === "pedidoModal") cerrarPedidoFinal(); });

  actualizarContador();
  desactivarAutocompletado();

  // Fecha de hoy
  const fechaInput = document.getElementById('campoFecha');
  if (fechaInput) {
    const hoy = new Date();
    const fechaFormateada = hoy.getFullYear() + '-' +
      String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoy.getDate()).padStart(2, '0');
    fechaInput.value = fechaFormateada;
  }
}

// Asignar fecha de hoy al campo (por si acaso)
const fechaInput = document.getElementById('campoFecha');
if (fechaInput) {
  const hoy = new Date();
  const fechaFormateada = hoy.getFullYear() + '-' +
    String(hoy.getMonth() + 1).padStart(2, '0') + '-' +
    String(hoy.getDate()).padStart(2, '0');
  fechaInput.value = fechaFormateada;
}

// ---------- DESACTIVAR SUGERENCIAS DEL NAVEGADOR ----------
function desactivarAutocompletado() {
  document.querySelectorAll('.campo-pedido, #searchInput').forEach(campo => {
    campo.setAttribute('autocomplete', 'off');
    campo.setAttribute('autocomplete', 'new-password'); // truco anti-Chrome
  });
}

document.addEventListener("DOMContentLoaded", init);