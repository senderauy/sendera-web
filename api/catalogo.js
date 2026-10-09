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
      const linkFoto = k => `${SITIO}/api/foto?p=${encodeURIComponent(pid)}&v=${i}&n=${k}&h=${huella(fotos[k])}`;
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

export default async function handler(req, res) {
  try {
    // productos y stock se leen sin clave, igual que la tienda
    const [productos, stock] = await Promise.all(['productos', 'stock'].map(async ruta => {
      const r = await fetch(`${DB_URL}/${ruta}.json`);
      if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
      return r.json();
    }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900');
    return res.status(200).send(aCsv(armarFilas(productos, stock)));
  } catch (e) {
    console.error('catalogo:', e);
    return res.status(502).send('No se pudo armar el catálogo');
  }
}
