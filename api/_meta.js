// Compras a Meta desde el servidor (API de conversiones), para que la campaña mida ventas reales:
//   · tarjeta aprobada al momento (Bricks o vuelta de Mercado Pago): apenas se confirma el pedido
//   · transferencia o efectivo: recién cuando el panel lo marca confirmado (antes no hay plata)
//   · los pedidos de prueba de un admin (pedido.prueba) no se mandan
// Se manda una sola vez por pedido (pedidos/<id>/meta_compra) y con el mismo id que usa el píxel del
// navegador (eventID), así Meta no la cuenta dos veces.
// Hace falta META_CAPI_TOKEN en Vercel (Administrador de eventos → Configuración → API de conversiones).
// Con META_TEST_CODE, las compras aparecen en "Probar eventos" y no cuentan para la campaña.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { createHash } from 'crypto';
import { DB_URL } from './_pedido.js';
import { SITIO, ponerSiVacio } from './_seguimiento.js';

const PIXEL = '1022921806923646';
const ESTADOS_DE_VENTA = ['aprobado', 'confirmado', 'camino', 'entregado'];

const sha = v => createHash('sha256').update(v).digest('hex');
const limpio = (v, max = 300) => String(v ?? '').trim().slice(0, max);

function celularUY(c) {
  const d = String(c ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('598')) return d;
  return '598' + (d.startsWith('0') ? d.slice(1) : d);
}

export const esVentaReal = estado => ESTADOS_DE_VENTA.includes(String(estado || ''));

// Manda la compra si corresponde. Devuelve true si salió, false si no correspondía o ya se había mandado.
export async function enviarCompraMeta({ id, pedido, token }) {
  const accessToken = process.env.META_CAPI_TOKEN;
  if (!accessToken || !pedido || pedido.prueba || !esVentaReal(pedido.estado)) return false;
  const total = Number(pedido.total) || 0;
  if (!(total > 0)) return false;
  // Una sola vez por pedido (si dos avisos llegan juntos, gana el primero)
  if (!(await ponerSiVacio(`pedidos/${id}/meta_compra`, new Date().toISOString(), token))) return false;

  const meta = pedido.meta && typeof pedido.meta === 'object' ? pedido.meta : {};
  const email = limpio(pedido.email, 120).toLowerCase();
  const cel = celularUY(pedido.celular);
  const nombre = limpio(pedido.cliente, 80).toLowerCase().split(/\s+/);
  const user_data = {
    ...(email ? { em: [sha(email)] } : {}),
    ...(cel ? { ph: [sha(cel)] } : {}),
    ...(nombre[0] ? { fn: [sha(nombre[0])] } : {}),
    ...(nombre.length > 1 ? { ln: [sha(nombre[nombre.length - 1])] } : {}),
    country: [sha('uy')],
    external_id: [sha(email || cel || id)],
    ...(/^fb\.\d\.\d+\.[\w.-]+$/.test(meta.fbp || '') ? { fbp: meta.fbp } : {}),
    ...(/^fb\.\d\.\d+\.[\w.-]+$/.test(meta.fbc || '') ? { fbc: meta.fbc } : {}),
    ...(meta.ip ? { client_ip_address: limpio(meta.ip, 60) } : {}),
    ...(meta.ua ? { client_user_agent: limpio(meta.ua, 400) } : {})
  };
  const productos = Array.isArray(pedido.productos) ? pedido.productos : Object.values(pedido.productos || {});
  const ids = productos.map(p => limpio(p && p.id, 64)).filter(v => /^[A-Za-z0-9_-]{1,64}$/.test(v));
  const evento = {
    event_name: 'Purchase',
    event_time: Math.floor((Date.parse(pedido.fecha) || Date.now()) / 1000),
    event_id: id,
    action_source: 'website',
    event_source_url: `${SITIO}/checkout.html`,
    user_data,
    custom_data: {
      currency: 'UYU',
      value: total,
      content_type: 'product',
      ...(ids.length ? { content_ids: ids } : {}),
      num_items: productos.reduce((s, p) => s + (parseInt(p && p.qty, 10) || 1), 0),
      order_id: id
    }
  };
  // Meta no acepta compras de hace más de 7 días: si se confirma tarde, va con la hora de ahora
  if (Date.now() / 1000 - evento.event_time > 6 * 24 * 3600) evento.event_time = Math.floor(Date.now() / 1000);

  const cuerpo = { data: [evento], ...(process.env.META_TEST_CODE ? { test_event_code: process.env.META_TEST_CODE } : {}) };
  const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  if (!r.ok) {
    const { error } = await r.json().catch(() => ({}));
    console.error('Meta compra: respondió', r.status, error?.code ?? '', limpio(error?.message, 200));
    // Se borra la marca para poder reintentar en el próximo cambio de estado
    await fetch(`${DB_URL}/pedidos/${id}/meta_compra.json`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
    return false;
  }
  return true;
}
