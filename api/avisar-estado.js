// El panel avisa acá cuando un admin cambia el estado de un pedido.
// Si el cliente dejó su mail, le llega un mail con el estado nuevo y el link para seguir el pedido.
// Solo para admins con sesión iniciada, y una sola vez por cada paso (confirmado, en camino, entregado).
import { DB_URL, getFirebaseToken } from './_pedido.js';
import { emailDeSesion, esAdmin, tokenDeSesion } from './_admin.js';
import { enviarEmailEstado, lineasProductos } from './_notificaciones.js';
import {
  idValido, emailValido, pasoAvisable, asegurarCodigo, enlaceSeguimiento, marcarAviso, desmarcarAviso
} from './_seguimiento.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const id = String(req.body?.pedidoId || '');
  if (!idValido(id)) return res.status(400).json({ error: 'Pedido inválido' });

  try {
    const email = await emailDeSesion(tokenDeSesion(req));
    if (!email) return res.status(401).json({ error: 'Iniciá sesión como admin' });
    const token = await getFirebaseToken();
    if (!(await esAdmin(email, token))) return res.status(403).json({ error: 'Solo admins' });

    const pedido = await (await fetch(`${DB_URL}/pedidos/${id}.json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })).json();
    if (!pedido || typeof pedido !== 'object') return res.status(404).json({ error: 'Pedido no encontrado' });

    const paso = pasoAvisable(pedido.estado);
    if (!paso) return res.status(200).json({ ok: true, enviado: false, motivo: 'estado' });
    if (!emailValido(pedido.email)) return res.status(200).json({ ok: true, enviado: false, motivo: 'sin-mail' });
    if (!(await marcarAviso(id, paso, token))) return res.status(200).json({ ok: true, enviado: false, motivo: 'ya-avisado' });

    let enviado = false;
    try {
      const enlace = enlaceSeguimiento(id, await asegurarCodigo(id, pedido, token));
      enviado = await enviarEmailEstado({
        email: pedido.email,
        cliente: pedido.cliente,
        paso,
        envio: String(pedido.envio || '—'),
        metodoPago: pedido.metodo_pago,
        productos: lineasProductos(pedido.productos),
        total: (Number(pedido.total) || 0).toLocaleString('es-UY'),
        enlace
      });
    } finally {
      // Si el mail no salió se borra la marca, así la próxima vez que se cambie el estado se intenta de nuevo
      if (!enviado) await desmarcarAviso(id, paso, token);
    }
    if (!enviado) return res.status(502).json({ ok: false, enviado: false, motivo: 'mail' });
    return res.status(200).json({ ok: true, enviado: true, email: pedido.email });
  } catch (e) {
    console.error('avisar-estado error:', e.message);
    return res.status(500).json({ error: 'No se pudo avisar al cliente' });
  }
}
