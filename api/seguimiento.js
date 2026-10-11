// Datos del pedido para la página de seguimiento del cliente (seguimiento.html).
// Pide el id del pedido y su código: los dos vienen en el link del mail. Sin el código no muestra nada.
// Solo devuelve lo que el cliente necesita ver: nada de celular, mail ni comprobante.
import { DB_URL, getFirebaseToken } from './_pedido.js';
import { idValido, codigoValido, mismoCodigo, pasoDe, entregaDe, primerNombre } from './_seguimiento.js';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'no-store');

  const id = String(req.query.p || ''), codigo = String(req.query.c || '');
  if (!idValido(id) || !codigoValido(codigo)) return res.status(404).json(NO_ENCONTRADO);

  try {
    const token = await getFirebaseToken();
    const leer = campo => fetch(`${DB_URL}/pedidos/${id}/${campo}.json`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    // Primero el código; después solo los datos que se muestran (el comprobante puede pesar mucho y no se lee)
    if (!mismoCodigo(await leer('codigo'), codigo)) return res.status(404).json(NO_ENCONTRADO);
    const CAMPOS = ['cliente', 'fecha', 'estado', 'envio', 'metodo_pago', 'productos', 'total'];
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
      total: Number(pedido.total) || 0
    });
  } catch (e) {
    console.error('seguimiento error:', e.message);
    return res.status(500).json({ error: 'No se pudo cargar el pedido' });
  }
}
