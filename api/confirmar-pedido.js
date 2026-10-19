// Después de registrar un pedido (efectivo, transferencia o tarjeta), el checkout avisa acá con el id.
// El servidor lee el pedido de la base (no confía en lo que mande el navegador) y, una sola vez por pedido:
//   · notifica a los admins (push)
//   · le crea el código del link de seguimiento
//   · manda al cliente el WhatsApp automático y el email de confirmación (con el link para seguir el pedido)
// Mercado Pago no pasa por acá: esas confirmaciones las manda el webhook al aprobarse el pago.
import { DB_URL, getFirebaseToken, usarCodigo } from './_pedido.js';
import {
  enviarWhatsAppConfirmacion, enviarEmailConfirmacion, notificarAdmins,
  normalizarCelular, lineasProductos
} from './_notificaciones.js';
import { asegurarCodigo, enlaceSeguimiento, anotarAvisos, idValido } from './_seguimiento.js';
import { cerrarCarritos } from './_carritos.js';
import { enviarCompraMeta } from './_meta.js';
import { descontarStock } from './_stock.js';

const VENTANA_MINUTOS = 15;             // solo pedidos recién creados
const MAX_WHATSAPP_POR_HORA = 3;        // por número de celular, para que no se use para mandar spam
const ESTADOS_CON_CONFIRMACION = ['pendiente-efectivo', 'pendiente-transferencia', 'aprobado'];

async function fb(path, token, options = {}) {
  return fetch(`${DB_URL}/${path}.json`, {
    ...options,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

// Marca el pedido como notificado de forma atómica (ETag de Firebase): si dos pedidos llegan juntos, solo uno gana
async function marcarNotificado(id, token) {
  const ruta = `pedidos/${id}/notificado`;
  const actual = await fb(ruta, token, { headers: { 'X-Firebase-ETag': 'true' } });
  const etag = actual.headers.get('etag');
  if ((await actual.json()) === true || !etag) return false;
  const res = await fb(ruta, token, { method: 'PUT', body: 'true', headers: { 'if-match': etag } });
  return res.ok; // 412 = otro lo marcó primero
}

// Límite de WhatsApp por celular en la última hora (se guarda en una ruta que los clientes no pueden leer ni escribir)
async function dentroDelLimite(celular, token) {
  const ruta = `limites_whatsapp/${celular}`;
  const ahora = Date.now();
  const dato = (await (await fb(ruta, token)).json()) || {};
  const recientes = (Array.isArray(dato.envios) ? dato.envios : []).filter(t => ahora - t < 60 * 60 * 1000);
  if (recientes.length >= MAX_WHATSAPP_POR_HORA) return false;
  await fb(ruta, token, { method: 'PUT', body: JSON.stringify({ envios: [...recientes, ahora] }) });
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const id = String(req.body?.pedidoId || '');
  // Las claves de Firebase (push) son de 20 caracteres de este alfabeto
  if (!/^[A-Za-z0-9_-]{15,40}$/.test(id)) return res.status(400).json({ error: 'Pedido inválido' });

  try {
    const token = await getFirebaseToken();
    const pedido = await (await fb(`pedidos/${id}`, token)).json();
    if (!pedido || typeof pedido !== 'object') return res.status(404).json({ error: 'Pedido no encontrado' });

    const creado = Date.parse(pedido.fecha);
    if (!Number.isFinite(creado) || Date.now() - creado > VENTANA_MINUTOS * 60 * 1000 || creado - Date.now() > 60 * 1000) {
      return res.status(400).json({ error: 'Pedido fuera de tiempo' });
    }
    // Para Meta: la conexión del comprador (la IP solo la ve el servidor) y, si ya está pago, la compra
    const meta = { ...(pedido.meta && typeof pedido.meta === 'object' ? pedido.meta : {}),
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 60),
      ua: String((pedido.meta && pedido.meta.ua) || req.headers['user-agent'] || '').slice(0, 400) };
    await fb(`pedidos/${id}/meta`, token, { method: 'PATCH', body: JSON.stringify({ ip: meta.ip, ua: meta.ua }) }).catch(() => {});
    await enviarCompraMeta({ id, pedido: { ...pedido, meta }, token }).catch(e => console.error('confirmar-pedido Meta:', e.message));
    // Si ya está pago (tarjeta aprobada), sus productos salen del stock (una sola vez por pedido)
    await descontarStock({ id, pedido, token }).catch(e => console.error('confirmar-pedido stock:', e.message));

    if (pedido.metodo_pago === 'mercadopago') return res.status(200).json({ ok: true, omitido: 'mercadopago' });

    if (!(await marcarNotificado(id, token))) return res.status(200).json({ ok: true, yaNotificado: true });

    // Si usó un código de un solo uso (los de la ruleta), deja de servir
    if (pedido.cupon) await usarCodigo(pedido.cupon, token).catch(e => console.error('confirmar-pedido cupón:', e.message));

    // Ya compró: se cancela el recordatorio de carrito que tuviera programado y se borra el carrito abandonado
    const carritoId = String(req.body?.carritoId || '');
    await cerrarCarritos({ carritoId: idValido(carritoId) ? carritoId : '', email: pedido.email }, token)
      .catch(e => console.error('confirmar-pedido carrito:', e.message));

    const total = (Number(pedido.total) || 0).toLocaleString('es-UY');
    const envio = String(pedido.envio || '—');
    await notificarAdmins({ cliente: pedido.cliente, total, envio }, token).catch(e => console.error('confirmar-pedido push:', e.message));

    // Todo pedido queda con su link de seguimiento (el panel también lo puede mandar por WhatsApp)
    let enlace = '';
    try { enlace = enlaceSeguimiento(id, await asegurarCodigo(id, pedido, token)); }
    catch (e) { console.error('confirmar-pedido seguimiento:', e.message); }

    if (ESTADOS_CON_CONFIRMACION.includes(pedido.estado)) {
      const productos = lineasProductos(pedido.productos);
      const celular = normalizarCelular(pedido.celular);
      if (celular && await dentroDelLimite(celular, token)) {
        await enviarWhatsAppConfirmacion({ celular, cliente: pedido.cliente, productos, total, envio, enlace })
          .catch(e => console.error('confirmar-pedido WhatsApp:', e.message));
      }
      if (pedido.email) {
        const enviado = await enviarEmailConfirmacion({ email: pedido.email, cliente: pedido.cliente, productos, total, envio, estado: pedido.estado, enlace })
          .catch(e => { console.error('confirmar-pedido email:', e.message); return false; });
        // Si el pago ya estaba aprobado, este mail ya le contó que está confirmado: no se le repite después
        if (enviado) await anotarAvisos(id, pedido.estado === 'aprobado' ? ['recibido', 'confirmado'] : ['recibido'], token);
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('confirmar-pedido error:', e.message);
    return res.status(500).json({ error: 'No se pudo confirmar' });
  }
}
