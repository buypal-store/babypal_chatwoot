
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_TGbgo-sVm6R7EMGGVAkrztMQ6RxtqAb-9YYJj5lTBlNMG-SU9lseA9a7bT_d8sWTvo0-fXV4xlUH/pub?gid=642137454&single=true&output=csv";

const RUBRO_TIENDA = "BABYPAL";   // esta es la tienda de este repo

// 👇 ACÁ PODÉS PONER LAS IMÁGENES MANUALES (SKU: ruta de la imagen)
const IMAGENES_MANUALES = {
   "COMBO-BAÑERA-PLEGABLE-BEBE-AZUL" : "imagenes/combo-bano.jpg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-ROSA" : "imagenes/combo-bano.jpg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-FUCSIA" : "imagenes/combo-bano.jpg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-GRIS" : "imagenes/combo-bano.jpg",
   "COMBO-PARANTE-BAÑERA-AZUL": "imagenes/combo-parante-banera-azul.jpeg",
   "COMBO-PARANTE-BAÑERA-ROSADO": "imagenes/combo-parante-banera-rosado.jpeg",
   "PIGEON-TETINA-SS (0+)": "imagenes/pigeon-tetina-ss-0.jpeg",
   "PIGEON-TETINA-S (+1)": "imagenes/pigeon-tetina-s-1.jpeg",
   "PIGEON-TETINA-M (+3)": "imagenes/pigeon-tetina-m-3.jpeg",
   "PIGEON-TETINA-L (+6)": "imagenes/pigeon-tetina-l-6.jpeg",
   "PIGEON-TETINA-LL (+9)": "imagenes/pigeon-tetina-ll-9.jpeg",
   "PIGEON-TETINA-LLL (+15)": "imagenes/pigeon-tetina-lll-15.jpeg",
   "BAÑERA-PLEGABLE-BEBE-AZUL": "imagenes/banera-plegable-bebe-azul.jpeg",
   "BAÑERA-PLEGABLE-BEBE-ROSADO": "imagenes/banera-plegable-bebe-rosado.jpeg",
   "BAÑERA-PLEGABLE-BEBE-GRIS": "imagenes/banera-plegable-bebe-gris.jpeg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-ROSA": "imagenes/combo-banera-plegable-bebe-rosa.jpeg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-FUCSIA": "imagenes/combo-banera-plegable-bebe-fucsia.jpeg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-AZUL": "imagenes/combo-banera-plegable-bebe-azul.jpeg",
   "COMBO-BAÑERA-PLEGABLE-BEBE-GRIS": "imagenes/combo-banera-plegable-bebe-gris.jpeg",
   "RANGER DUAL LENS - 5MP": "imagenes/ranger-dual-lens-5mp.jpeg",
};

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
          p.rubro.toUpperCase() === RUBRO_TIENDA &&
          p.nombre
      );

    // 🔁 Acá se reemplazan las imágenes si el SKU está en IMAGENES_MANUALES
    window.productosData.forEach(prod => {
      if (IMAGENES_MANUALES[prod.sku]) {
        prod.imagen = IMAGENES_MANUALES[prod.sku];
      }
    });

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
