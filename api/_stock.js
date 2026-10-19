// Cuando un pedido de la tienda pasa a ser venta (pago aprobado o confirmado por un admin), sus productos se
// descuentan del stock. Una sola vez por pedido: queda anotado en pedidos/<id>/stock_descontado con qué se
// descontó, así el panel lo puede devolver si el pedido se borra. Los pedidos de prueba no tocan el stock.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { DB_URL } from './_pedido.js';
import { ponerSiVacio } from './_seguimiento.js';

const ESTADOS_DE_VENTA = ['aprobado', 'confirmado', 'camino', 'entregado'];
const texto = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;

function fb(ruta, token, opciones = {}) {
  return fetch(`${DB_URL}/${ruta}.json`, {
    ...opciones,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
}

// Código de stock de cada producto + color, por nombre (los pedidos de Mercado Pago solo traen nombre y color)
export function codigosDeStock(productos) {
  const mapa = new Map();
  for (const [pid, p] of Object.entries(productos || {})) {
    if (!p || typeof p !== 'object') continue;
    const variantes = Array.isArray(p.variantes) ? p.variantes : Object.values(p.variantes || {});
    variantes.forEach((v, i) => {
      if (!v || typeof v !== 'object') return;
      mapa.set(`${texto(p.nombre)}\u0000${texto(v.nombre)}`, v.stockId || `${pid}-${i}`);
    });
  }
  return mapa;
}

// Resta con el ETag de Firebase: si dos ventas llegan juntas, ninguna pisa a la otra
async function restar(id, cantidad, token) {
  for (let intento = 0; intento < 6; intento++) {
    const leido = await fb(`stock/${id}`, token, { headers: { 'X-Firebase-ETag': 'true' } });
    const etag = leido.headers.get('etag');
    const antes = Number(await leido.json()) || 0;
    const despues = Math.max(0, antes - cantidad);
    const escrito = await fb(`stock/${id}`, token, { method: 'PUT', body: JSON.stringify(despues), headers: { 'if-match': etag } });
    if (escrito.ok) return antes - despues;   // lo que de verdad se restó (no baja de 0)
  }
  throw new Error(`No se pudo descontar el stock de ${id}`);
}

export async function descontarStock({ id, pedido, token }) {
  if (!pedido || typeof pedido !== 'object' || pedido.prueba || !ESTADOS_DE_VENTA.includes(pedido.estado)) return null;
  // Se marca antes de tocar nada: si el aviso llega dos veces, el segundo no descuenta de nuevo
  if (!(await ponerSiVacio(`pedidos/${id}/stock_descontado`, { fecha: new Date().toISOString() }, token))) return null;

  const catalogo = await (await fb('productos', token)).json();
  const codigos = codigosDeStock(catalogo);
  const validos = new Set(codigos.values());
  const cantidades = {};
  for (const item of Array.isArray(pedido.productos) ? pedido.productos : []) {
    const porId = ID_VALIDO.test(String(item?.id || '')) && validos.has(item.id) ? item.id : '';
    const codigo = porId || codigos.get(`${texto(item?.nombre ?? item?.name)}\u0000${texto(item?.variante ?? item?.variant)}`);
    const qty = Math.min(50, Math.max(1, parseInt(item?.qty, 10) || 1));
    if (codigo) cantidades[codigo] = (cantidades[codigo] || 0) + qty;
  }
  const descontado = {};
  for (const [codigo, qty] of Object.entries(cantidades)) {
    const resto = await restar(codigo, qty, token);
    if (resto > 0) descontado[codigo] = resto;
  }
  await fb(`pedidos/${id}/stock_descontado`, token, {
    method: 'PUT', body: JSON.stringify({ fecha: new Date().toISOString(), items: descontado })
  });
  return descontado;
}
