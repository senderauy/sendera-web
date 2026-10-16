// Página de seguimiento del cliente (seguimiento.html).
// Pide el id del pedido y su código: los dos vienen en el link del mail o del WhatsApp. Sin el código no hay nada.
//   GET:  datos del pedido. Solo lo que el cliente necesita ver: nada de celular, mail ni comprobante.
//   POST: la reseña del cliente cuando ya recibió el pedido (una por pedido). Queda esperando aprobación
//         en el panel, marcada como compra verificada.
import { DB_URL, getFirebaseToken } from './_pedido.js';
import {
  idValido, codigoValido, mismoCodigo, pasoDe, entregaDe, primerNombre, ponerSiVacio, huellaComprobanteEnvio
} from './_seguimiento.js';

const NO_ENCONTRADO = { error: 'No encontramos ese pedido' };

function items(productos) {
  const lista = Array.isArray(productos) ? productos : Object.values(productos || {});
  return lista
    .filter(p => p && typeof p === 'object')
    .slice(0, 30)
    .map(p => ({
      nombre: String(p.nombre ?? '').slice(0, 80),
      variante: String(p.variante ?? '').slice(0, 80),
      qty: Math.max(1, parseInt(p.qty, 10) || 1),
      precio: Math.max(0, Number(p.precio) || 0)
    }));
}

// Lee de a un campo del pedido (el comprobante puede pesar mucho y nunca se lee)
function lectorDe(id, token) {
  return campo => fetch(`${DB_URL}/pedidos/${id}/${campo}.json`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());
}

async function verPedido(req, res) {
  const id = String(req.query.p || ''), codigo = String(req.query.c || '');
  if (!idValido(id) || !codigoValido(codigo)) return res.status(404).json(NO_ENCONTRADO);
  const leer = lectorDe(id, await getFirebaseToken());
  if (!mismoCodigo(await leer('codigo'), codigo)) return res.status(404).json(NO_ENCONTRADO);
  const CAMPOS = ['cliente', 'fecha', 'estado', 'envio', 'metodo_pago', 'productos', 'total', 'resena', 'envioComprobante'];
  const valores = await Promise.all(CAMPOS.map(leer));
  const pedido = Object.fromEntries(CAMPOS.map((c, i) => [c, valores[i]]));
  return res.status(200).json({
    nombre: primerNombre(pedido.cliente),
    fecha: String(pedido.fecha || ''),
    estado: String(pedido.estado || ''),
    paso: pasoDe(pedido.estado),
    entrega: entregaDe(pedido.envio),
    envio: String(pedido.envio || '').slice(0, 200),
    metodoPago: String(pedido.metodo_pago || ''),
    productos: items(pedido.productos),
    total: Number(pedido.total) || 0,
    resena: !!pedido.resena,
    // Foto del comprobante del envío por agencia, si ya se subió desde el panel
    comprobanteEnvio: huellaComprobanteEnvio(pedido) ? `/api/foto?h=${huellaComprobanteEnvio(pedido)}` : ''
  });
}

async function dejarResena(req, res) {
  const b = req.body || {};
  const id = String(b.p || ''), codigo = String(b.c || '');
  if (!idValido(id) || !codigoValido(codigo)) return res.status(404).json(NO_ENCONTRADO);
  const estrellas = Number.parseInt(b.estrellas, 10);
  const texto = String(b.texto ?? '').trim();
  const ciudad = String(b.ciudad ?? '').trim().slice(0, 40);
  if (!(estrellas >= 1 && estrellas <= 5)) return res.status(400).json({ error: 'Elegí de 1 a 5 estrellas.' });
  if (!texto) return res.status(400).json({ error: 'Escribí qué te pareció.' });
  if (texto.length > 300) return res.status(400).json({ error: 'La reseña puede tener hasta 300 letras.' });

  const token = await getFirebaseToken();
  const leer = lectorDe(id, token);
  if (!mismoCodigo(await leer('codigo'), codigo)) return res.status(404).json(NO_ENCONTRADO);
  const [estado, cliente] = await Promise.all([leer('estado'), leer('cliente')]);
  if (estado !== 'entregado') return res.status(409).json({ error: 'Vas a poder dejar tu reseña cuando recibas el pedido.' });

  // Una sola reseña por pedido: se reserva el lugar antes de guardarla
  if (!(await ponerSiVacio(`pedidos/${id}/resena`, 'guardando', token))) {
    return res.status(409).json({ error: 'Ya dejaste tu reseña para este pedido. ¡Gracias!' });
  }
  const nombre = String(b.nombre ?? '').trim().slice(0, 40) || primerNombre(cliente) || 'Cliente';
  const resena = { nombre, ciudad, texto, estrellas, fecha: new Date().toISOString(), aprobada: false, compraVerificada: true, pedido: id };
  const r = await fetch(`${DB_URL}/resenas_pendientes.json`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resena)
  });
  if (!r.ok) {
    // Se libera el lugar para que pueda volver a intentarlo
    await fetch(`${DB_URL}/pedidos/${id}/resena.json`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).catch(() => {});
    throw new Error('No se pudo guardar la reseña (' + r.status + ')');
  }
  const { name } = await r.json();
  await fetch(`${DB_URL}/pedidos/${id}/resena.json`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(name || 'enviada')
  }).catch(() => {});
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return await verPedido(req, res);
    if (req.method === 'POST') return await dejarResena(req, res);
    return res.status(405).end();
  } catch (e) {
    console.error('seguimiento error:', e.message);
    return res.status(500).json({ error: req.method === 'POST' ? 'No se pudo enviar la reseña. Probá de nuevo.' : 'No se pudo cargar el pedido' });
  }
}
