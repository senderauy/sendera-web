// Catálogo de productos para Meta (anuncios de catálogo en Instagram y Facebook).
// Una fila por color, en el formato CSV que lee el Administrador de ventas de Meta.
// Link para Meta: https://www.senderauy.com/catalogo-meta.csv (Meta lo vuelve a leer solo).
import { createHash } from 'crypto';
import { DB_URL } from './_pedido.js';

const SITIO = 'https://www.senderauy.com';
const MARCA = 'Sendera';
const COLUMNAS = [
  'id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price',
  'link', 'image_link', 'additional_image_link', 'brand', 'color', 'product_type'
];

const texto = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const celda = v => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Huella corta de la foto: si la foto cambia, cambia su link y Meta la vuelve a bajar
const huella = foto => createHash('sha1').update(foto).digest('hex').slice(0, 10);

// Mismo cálculo de descuento que la tienda (precioFinal en cart.js) y el cobro (api/_pedido.js)
const conDescuento = (precio, descuento) => {
  const d = Math.min(90, Math.max(0, parseInt(descuento, 10) || 0));
  return Math.round(precio * (100 - d) / 100);
};

export function armarFilas(productos, stock) {
  const filas = [];
  for (const [pid, p] of Object.entries(productos || {})) {
    if (!p || typeof p !== 'object' || !texto(p.nombre)) continue;
    const variantes = (Array.isArray(p.variantes) ? p.variantes : Object.values(p.variantes || {}))
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v && typeof v === 'object');
    const nombre = texto(p.nombre);
    const frase = texto(p.fraseAnuncio);
    for (const { v, i } of variantes) {
      const precio = Math.round(Number(v.precio) || 0);
      const fotos = (Array.isArray(v.fotos) && v.fotos.length ? v.fotos : (v.foto ? [v.foto] : []))
        .filter(f => typeof f === 'string' && f.trim());
      if (!precio || !fotos.length) continue; // Meta pide precio y foto
      // Mismo código de color que usan el stock, la tienda y el píxel
      const id = v.stockId || `${pid}-${i}`;
      const color = texto(v.nombre);
      const final = conDescuento(precio, p.descuento);
      // Las fotos guardadas aparte ya tienen su dirección (cambia sola si cambia la foto); las viejas usan la del color
      const linkFoto = k => /^\/api\/foto\?h=[a-f0-9]{32}$/.test(fotos[k].trim())
        ? SITIO + fotos[k].trim()
        : `${SITIO}/api/foto?p=${encodeURIComponent(pid)}&v=${i}&n=${k}&h=${huella(fotos[k])}`;
      filas.push({
        id,
        item_group_id: pid,
        title: `${nombre}${variantes.length > 1 && color ? ' ' + color : ''}${frase ? ' | ' + frase : ''}`.slice(0, 150),
        description: (texto(p.descripcion) || `${nombre}${color ? ', color ' + color : ''}.`).slice(0, 5000),
        availability: (Number(stock?.[id]) || 0) > 0 ? 'in stock' : 'out of stock',
        condition: 'new',
        price: `${precio} UYU`,
        sale_price: final < precio ? `${final} UYU` : '',
        link: `${SITIO}/producto.html?id=${encodeURIComponent(pid)}&v=${i}&utm_source=meta&utm_medium=catalogo`,
        image_link: linkFoto(0),
        additional_image_link: fotos.slice(1, 10).map((_, k) => linkFoto(k + 1)).join(','),
        brand: MARCA,
        color,
        product_type: [p.categoria, p.subgrupo].map(texto).filter(Boolean).join(' > ')
      });
    }
  }
  return filas;
}

export function aCsv(filas) {
  return [COLUMNAS.join(','), ...filas.map(f => COLUMNAS.map(c => celda(f[c])).join(','))].join('\n') + '\n';
}

// ── Página de cada producto (/producto.html?id=…&v=…) ─────────────────────
// La página arma el producto con JavaScript, y los robots que revisan los links (Meta, WhatsApp, Google)
// no lo esperan: veían una página vacía, "Sendera | Producto". Acá se le agregan de entrada el nombre,
// la foto, el precio y la descripción del color que se pidió. El resto de la página no cambia.
const escapar = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let paginaBase = null;   // producto-base.html (queda en memoria mientras la función está despierta)
const origenDe = req => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;

async function leerPaginaBase(req) {
  if (paginaBase) return paginaBase;
  const r = await fetch(`${origenDe(req)}/producto-base.html`);
  if (!r.ok) throw new Error('producto-base: ' + r.status);
  return (paginaBase = await r.text());
}

// Los productos y el stock salen de la copia que Vercel ya tiene guardada (/api/catalogo?formato=json, la misma
// que usa la tienda): está en el mismo lugar que esta función y contesta enseguida. Si falla, se le piden a Firebase.
async function productosYStock(origen) {
  try {
    const r = await fetch(`${origen}/api/catalogo?formato=json`);
    if (r.ok) {
      const d = await r.json();
      if (d && d.productos) return d;
    }
  } catch (e) { /* se piden a Firebase */ }
  const [productos, stock] = await Promise.all(['productos', 'stock'].map(ruta =>
    fetch(`${DB_URL}/${ruta}.json`).then(x => (x.ok ? x.json() : null)).catch(() => null)));
  return { productos, stock };
}

async function datosDelProducto(origen, id, nVariante) {
  const { productos, stock } = await productosYStock(origen);
  const p = productos && productos[id];
  if (!p || typeof p !== 'object' || !texto(p.nombre)) return null;
  // Mismo número de color que usa la tienda (la posición en la lista, como en armarFilas)
  const variantes = Array.isArray(p.variantes) ? p.variantes : Object.values(p.variantes || {});
  const i = nVariante >= 0 && nVariante < variantes.length ? nVariante : 0;
  const v = variantes[i] && typeof variantes[i] === 'object' ? variantes[i] : {};
  const fila = armarFilas({ [id]: p }, {}).find(f => f.link.includes(`&v=${i}&`)) || null;
  const precio = Math.round(Number(v.precio || p.precio) || 0);
  const stockId = v.stockId || `${id}-${i}`;
  const enStock = !stock || (Number(stock[stockId]) || 0) > 0;
  const color = texto(v.nombre);
  return {
    titulo: `${texto(p.nombre)}${variantes.length > 1 && color ? ' ' + color : ''}`,
    descripcion: (texto(p.descripcion) || `${texto(p.nombre)}${color ? ', color ' + color : ''}.`).slice(0, 300),
    foto: fila ? fila.image_link : '',
    precio: precio ? conDescuento(precio, p.descuento) : 0,
    enStock,
    link: `${SITIO}/producto.html?id=${encodeURIComponent(id)}&v=${i}`
  };
}

function conDatosDelProducto(html, d) {
  const titulo = `${d.titulo} | ${MARCA}`;
  const precio = d.precio ? `$U ${d.precio.toLocaleString('es-UY')}` : '';
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: d.titulo, description: d.descripcion,
    brand: { '@type': 'Brand', name: MARCA }, url: d.link, ...(d.foto ? { image: d.foto } : {}),
    ...(d.precio ? { offers: { '@type': 'Offer', price: d.precio, priceCurrency: 'UYU', url: d.link,
      availability: d.enStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } } : {})
  };
  const cabeza = [
    `<title>${escapar(titulo)}</title>`,
    `<meta name="description" content="${escapar(d.descripcion)}" />`,
    `<link rel="canonical" href="${escapar(d.link)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:site_name" content="${MARCA}" />`,
    `<meta property="og:title" content="${escapar(titulo)}" />`,
    `<meta property="og:description" content="${escapar([precio, d.descripcion].filter(Boolean).join(' · '))}" />`,
    `<meta property="og:url" content="${escapar(d.link)}" />`,
    d.foto ? `<meta property="og:image" content="${escapar(d.foto)}" />` : '',
    d.precio ? `<meta property="product:price:amount" content="${d.precio}" />\n  <meta property="product:price:currency" content="UYU" />` : '',
    `<meta property="product:availability" content="${d.enStock ? 'in stock' : 'out of stock'}" />`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
  ].filter(Boolean).join('\n  ');
  // Para quien no tiene JavaScript (y los robots): el producto a la vista mientras carga la página
  const sinJs = `<noscript><div style="max-width:520px;margin:100px auto 40px;padding:0 16px;font-family:Montserrat,sans-serif;color:#2a2218">
      ${d.foto ? `<img src="${escapar(d.foto)}" alt="${escapar(d.titulo)}" style="width:100%;border-radius:12px" />` : ''}
      <h1 style="font-size:1.6rem;margin:16px 0 6px">${escapar(d.titulo)}</h1>
      ${precio ? `<p style="font-size:1.2rem;font-weight:600">${escapar(precio)}</p>` : ''}
      <p style="margin-top:10px;line-height:1.5">${escapar(d.descripcion)}</p>
    </div></noscript>`;
  return html
    .replace('<title>Sendera | Producto</title>', cabeza)
    .replace('<div class="product-page" id="product-page">', `<div class="product-page" id="product-page">\n    ${sinJs}`);
}

async function paginaProducto(req, res) {
  const id = String(req.query?.id || '');
  const idValido = /^[A-Za-z0-9_-]{1,64}$/.test(id);
  // La página y los datos del producto se piden a la vez; sin los datos, la página anda igual
  const [html, d] = await Promise.all([
    leerPaginaBase(req),
    idValido
      ? datosDelProducto(origenDe(req), id, Number.parseInt(req.query?.v, 10) || 0)
          .catch(e => { console.error('catalogo pagina:', e.message); return null; })
      : null
  ]);
  const pagina = d ? conDatosDelProducto(html, d) : html;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  return res.status(200).send(pagina);
}

export default async function handler(req, res) {
  if (req.query?.formato === 'pagina') {
    try {
      return await paginaProducto(req, res);
    } catch (e) {
      console.error('catalogo pagina:', e.message);
      // Si no se pudo leer la página, se manda a la copia sin datos (así nunca queda en blanco)
      const q = new URLSearchParams(Object.entries(req.query || {}).filter(([k]) => k !== 'formato').map(([k, v]) => [k, String(v)])).toString();
      return res.redirect(302, '/producto-base.html' + (q ? '?' + q : ''));
    }
  }
  try {
    // productos y stock se leen sin clave, igual que la tienda
    const [productos, stock] = await Promise.all(['productos', 'stock'].map(async ruta => {
      const r = await fetch(`${DB_URL}/${ruta}.json`);
      if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
      return r.json();
    }));
    // La tienda pide los productos acá para mostrarlos enseguida (después se actualizan en vivo con Firebase)
    if (req.query?.formato === 'json') {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=86400');
      return res.status(200).json({ productos: productos || {}, stock: stock || {} });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900');
    return res.status(200).send(aCsv(armarFilas(productos, stock)));
  } catch (e) {
    console.error('catalogo:', e);
    return res.status(502).send('No se pudo armar el catálogo');
  }
}
