// Recordatorio de carrito abandonado.
// Cuando el cliente escribe su mail en la página de pago, el checkout avisa acá con el id de su carrito.
// Queda programado (en Resend) un mail para dentro de unas horas con el carrito armado; si compra antes,
// /api/confirmar-pedido o el webhook de Mercado Pago lo cancelan.
// Cuidados para que no se use para mandar mails a cualquiera:
//   · solo carritos recién creados, un recordatorio por carrito
//   · un recordatorio por mail cada 24 horas y un límite por conexión
//   · los productos y precios salen del catálogo, no de lo que mandó el navegador
import { DB_URL, getFirebaseToken } from './_pedido.js';
import { programarRecordatorioCarrito, cancelarMailProgramado, lineasProductos } from './_notificaciones.js';
import { idValido, emailValido, SITIO } from './_seguimiento.js';
import { leer, itemsDelCatalogo, envioDe, codigoDeCarrito, cerrarCarritos } from './_carritos.js';
import { emailDeSesion, esAdmin, tokenDeSesion } from './_admin.js';
import { girarRuleta } from './_ruleta.js';

const HORAS_HASTA_EL_RECORDATORIO = 3;
const VENTANA_MINUTOS = 180;          // el carrito tiene que ser de las últimas 3 horas
const MAX_POR_CONEXION_AL_DIA = 5;
const UN_DIA = 24 * 60 * 60 * 1000;

function fb(ruta, token, opciones = {}) {
  return fetch(`${DB_URL}/${ruta}.json`, {
    ...opciones,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
}

// Límite de recordatorios por conexión en el día (se guarda en una ruta que los clientes no pueden leer ni escribir)
async function dentroDelLimite(ip, token) {
  if (!ip) return true;
  const ruta = `limites_carritos/${ip.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60)}`;
  const ahora = Date.now();
  const dato = (await leer(ruta, token)) || {};
  const recientes = (Array.isArray(dato.envios) ? dato.envios : []).filter(t => ahora - t < UN_DIA);
  if (recientes.length >= MAX_POR_CONEXION_AL_DIA) return false;
  await fb(ruta, token, { method: 'PUT', body: JSON.stringify({ envios: [...recientes, ahora] }) });
  return true;
}

// Desde el panel: borrar un carrito abandonado y cancelar el recordatorio que tenía programado (solo admins)
async function cancelarDesdeElPanel(req, res) {
  const id = String(req.body?.id || '');
  if (!idValido(id)) return res.status(400).json({ error: 'Carrito inválido' });
  const email = await emailDeSesion(tokenDeSesion(req));
  if (!email) return res.status(401).json({ error: 'Iniciá sesión como admin' });
  const token = await getFirebaseToken();
  if (!(await esAdmin(email, token))) return res.status(403).json({ error: 'Solo admins' });
  await cerrarCarritos({ carritoId: id }, token);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');
  // La ruleta del inicio ("Girá y ganá") también pasa por acá: ver api/_ruleta.js
  if (req.body?.accion === 'ruleta') {
    try { return await girarRuleta(req, res); }
    catch (e) { console.error('ruleta:', e.message); return res.status(500).json({ error: 'No se pudo girar. Probá de nuevo.' }); }
  }
  if (req.body?.accion === 'cancelar') {
    try { return await cancelarDesdeElPanel(req, res); }
    catch (e) { console.error('carrito cancelar:', e.message); return res.status(500).json({ error: 'No se pudo cancelar' }); }
  }

  const id = String(req.body?.id || '');
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!idValido(id) || !emailValido(email)) return res.status(400).json({ error: 'Datos inválidos' });

  try {
    const token = await getFirebaseToken();
    const carrito = await leer(`carritos_abandonados/${id}`, token);
    if (!carrito || typeof carrito !== 'object') return res.status(404).json({ error: 'Carrito no encontrado' });
    const creado = Date.parse(carrito.fecha);
    if (!Number.isFinite(creado) || Date.now() - creado > VENTANA_MINUTOS * 60 * 1000) {
      return res.status(200).json({ ok: true, omitido: 'carrito viejo' });
    }
    if (carrito.email === email && carrito.recordatorio) return res.status(200).json({ ok: true, yaProgramado: true });

    // Un recordatorio por mail cada 24 horas: si a ese mail ya le salió uno, no se manda otro;
    // si tenía otro programado (otro carrito), se cancela y vale el más nuevo
    const otros = (await leer('carritos_abandonados', token)) || {};
    for (const [otroId, c] of Object.entries(otros)) {
      if (otroId === id || !c || String(c.email || '').toLowerCase() !== email || !c.recordatorio) continue;
      const para = Date.parse(c.recordatorio.para);
      if (para <= Date.now() && Date.now() - para < UN_DIA) return res.status(200).json({ ok: true, omitido: 'ya se le mandó hoy' });
      if (para > Date.now()) {
        await cancelarMailProgramado(c.recordatorio.id).catch(() => {});
        await fb(`carritos_abandonados/${otroId}/recordatorio`, token, { method: 'DELETE' }).catch(() => {});
      }
    }

    const items = itemsDelCatalogo(carrito.productos, await leer('productos', token));
    if (!items.length) return res.status(200).json({ ok: true, omitido: 'sin productos del catálogo' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (!(await dentroDelLimite(ip, token))) return res.status(429).json({ error: 'Demasiados intentos' });

    // Si el carrito ya tenía un recordatorio para otro mail (lo corrigió), se cancela ese
    if (carrito.recordatorio && carrito.recordatorio.id) await cancelarMailProgramado(carrito.recordatorio.id).catch(() => {});

    const envio = envioDe(carrito.envio);
    const total = items.reduce((s, i) => s + i.precio * i.qty, 0) + envio.costo;
    const cuando = new Date(Date.now() + HORAS_HASTA_EL_RECORDATORIO * 60 * 60 * 1000).toISOString();
    const resendId = await programarRecordatorioCarrito({
      email,
      cliente: carrito.cliente,
      productos: lineasProductos(items),
      envio: envio.texto || '—',
      total: total.toLocaleString('es-UY'),
      enlace: `${SITIO}/?carrito=${codigoDeCarrito(items)}`,
      cuando
    });
    if (!resendId) return res.status(502).json({ error: 'No se pudo programar el recordatorio' });

    await fb(`carritos_abandonados/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify({ email, recordatorio: { id: typeof resendId === 'string' ? resendId : '', para: cuando } })
    });
    return res.status(200).json({ ok: true, para: cuando });
  } catch (e) {
    console.error('carrito error:', e.message);
    return res.status(500).json({ error: 'No se pudo programar el recordatorio' });
  }
}
