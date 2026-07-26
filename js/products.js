// === Catálogo Strenko — se alimenta solo desde el Google Sheet ===
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_TGbgo-sVm6R7EMGGVAkrztMQ6RxtqAb-9YYJj5lTBlNMG-SU9lseA9a7bT_d8sWTvo0-fXV4xlUH/pub?gid=642137454&single=true&output=csv";

const RUBRO_TIENDA = "BABYPAL";   // esta es la tienda de este repo

// A=SKU  B=Nombre  C=Categoria  D=Precio  E=Stock  F=Linea/Rubro
const COL = { sku: 0, nombre: 1, categoria: 2, precio: 3, stock: 4, rubro: 5 };

async function cargarProductos() {
  try {
    const csv   = await (await fetch(CSV_URL)).text();
    const filas = parseCSV(csv);
    const datos = filas.slice(1);

    window.productosData = datos
      .filter(f => f[COL.sku]?.trim())
      .map(f => ({
        sku:       f[COL.sku].trim(),
        nombre:    (f[COL.nombre]    || "").trim(),
        categoria: (f[COL.categoria] || "").trim(),
        precio:    Number(f[COL.precio]) || 0,
        stock:     Number(f[COL.stock]) || 0,
        rubro:     (f[COL.rubro]     || "").trim(),
        imagen:    `imagenes/${f[COL.sku].trim()}.jpeg`,
      }))
      .filter(p =>
        p.rubro.toUpperCase() === RUBRO_TIENDA &&  // solo Strenko
        p.nombre &&
        p.stock > 0
      );

    // ← LA CLAVE: re-inyecta los productos custom y VUELVE a pintar la grilla
    if (typeof cargarProductosCustom === "function") cargarProductosCustom();
    if (typeof renderGrid === "function") renderGrid();
  } catch (e) {
    console.error("No se pudo cargar el catálogo:", e);
  }
}

// Parser CSV que respeta comas y saltos de línea dentro de comillas
function parseCSV(texto) {
  const filas = []; let campo = "", fila = [], comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else {
      if (c === '"') comillas = true;
      else if (c === ",")  { fila.push(campo); campo = ""; }
      else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
      else if (c !== "\r") campo += c;
    }
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Inicia vacío para que init() de app.js no falle mientras llega el Sheet
window.productosData = window.productosData || [];
cargarProductos();
