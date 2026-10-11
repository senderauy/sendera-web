// Carritos abandonados: recordatorio por mail y cierre cuando la persona compra.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { DB_URL, indexarPrecios } from './_pedido.js';
import { cancelarMailProgramado } from './_notificaciones.js';
import { entregaDe } from './_seguimiento.js';

export const COSTO_ENVIO_MONTEVIDEO = 200;   // el mismo que cobra api/_pedido.js

function fb(ruta, token, opciones = {}) {
  return fetch(`${DB_URL}/${ruta}.json`, {
    ...opciones,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
}
export const leer = async (ruta, token) => (await fb(ruta, token)).json();

// Los productos del carrito se toman del catálogo real, con el precio de hoy: nunca lo que mandó el navegador.
// Así el mail solo puede mostrar productos de Sendera.
export function itemsDelCatalogo(itemsCarrito, productos) {
  const precios = indexarPrecios(productos);
  const lista = Array.isArray(itemsCarrito) ? itemsCarrito : Object.values(itemsCarrito || {});
  return lista
    .filter(i => i && typeof i === 'object')
    .slice(0, 30)
    .map(i => {
      const nombre = String(i.nombre ?? '').trim(), variante = String(i.variante ?? '').trim();
      const precio = precios.get(`${nombre}\u0000${variante}`);
      return precio ? { nombre, variante, qty: Math.min(20, Math.max(1, parseInt(i.qty, 10) || 1)), precio } : null;
    })
    .filter(Boolean);
}

// Cómo se entrega, con el texto y el costo de siempre (el texto del carrito lo escribió el navegador)
export function envioDe(texto) {
  const tipo = entregaDe(texto);
  if (tipo === 'montevideo') return { texto: `Montevideo · $${COSTO_ENVIO_MONTEVIDEO}`, costo: COSTO_ENVIO_MONTEVIDEO };
  if (tipo === 'interior') return { texto: 'Interior · Por agencia (a cargo del comprador)', costo: 0 };
  if (tipo === 'retiro') return { texto: 'Pick up · Cordón (con coordinación previa)', costo: 0 };
  return { texto: '', costo: 0 };
}

// El link del mail vuelve a armar el carrito en la tienda: lleva solo productos, cantidades y precios
export function codigoDeCarrito(items) {
  return Buffer.from(JSON.stringify(items.map(i => [i.nombre, i.variante, i.qty, i.precio]))).toString('base64url');
}

// Cuando alguien compra: se cancela el recordatorio que tenía programado y se borran sus carritos abandonados
// (el de esta compra y los que haya dejado antes con el mismo mail)
export async function cerrarCarritos({ carritoId, email }, token) {
  const mail = String(email || '').trim().toLowerCase();
  if (!carritoId && !mail) return 0;
  const todos = (await leer('carritos_abandonados', token)) || {};
  let cerrados = 0;
  for (const [id, c] of Object.entries(todos)) {
    if (!c || typeof c !== 'object') continue;
    if (id !== carritoId && !(mail && String(c.email || '').toLowerCase() === mail)) continue;
    const r = c.recordatorio;
    if (r && r.id && Date.parse(r.para) > Date.now()) {
      await cancelarMailProgramado(r.id).catch(e => console.error('carrito: no se pudo cancelar el recordatorio', e.message));
    }
    await fb(`carritos_abandonados/${id}`, token, { method: 'DELETE' }).catch(() => {});
    cerrados++;
  }
  return cerrados;
}
