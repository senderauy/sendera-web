import { DB_URL, getFirebaseToken, calcularPedido, PedidoInvalido } from './_pedido.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const body = req.body || {};

  const externalRef = 'sendera-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

  // Precios, envío y descuento se calculan en el servidor: lo que mande el navegador no cuenta
  let fbToken, pedido;
  try {
    fbToken = await getFirebaseToken();
    pedido = await calcularPedido(body, fbToken);
  } catch (e) {
    if (e instanceof PedidoInvalido) return res.status(400).json({ error: e.message });
    console.error('create-preference: error calculando el pedido:', e);
    return res.status(500).json({ error: 'No se pudo procesar el pedido. Intentá de nuevo.' });
  }

  // Mercado Pago no acepta ítems con precio negativo: si hay descuento se cobra como un solo ítem con el total
  const items = pedido.descuento > 0
    ? [{
        title: `Pedido Sendera (descuento ${pedido.codigo})`,
        quantity: 1,
        unit_price: pedido.total,
        currency_id: 'UYU'
      }]
    : [
        ...pedido.items.map(item => ({
          title: `${item.nombre} - ${item.variante}`,
          quantity: item.qty,
          unit_price: item.precio,
          currency_id: 'UYU'
        })),
        ...(pedido.envio.costo > 0 ? [{
          title: `Envío - ${pedido.envio.label}`,
          quantity: 1,
          unit_price: pedido.envio.costo,
          currency_id: 'UYU'
        }] : [])
      ];

  const preference = {
    items,
    payer: {
      name: String(body.cliente || '').slice(0, 80),
      phone: { number: String(body.celular || '').slice(0, 30) }
    },
    back_urls: {
      success: 'https://www.senderauy.com?pago=ok',
      failure: 'https://www.senderauy.com?pago=error',
      pending: 'https://www.senderauy.com?pago=pendiente'
    },
    auto_return: 'approved',
    statement_descriptor: 'SENDERA',
    binary_mode: false,
    external_reference: externalRef,
    notification_url: 'https://www.senderauy.com/api/mp-webhook'
  };

  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(preference)
  });

  const data = await response.json();
  if (!response.ok || !data.init_point) {
    console.error('create-preference: Mercado Pago rechazó la preferencia:', response.status);
    return res.status(502).json({ error: 'No se pudo iniciar el pago. Intentá de nuevo.' });
  }

  // Guardar orden temporal en Firebase para que el webhook la recupere.
  // El total guardado es el calculado acá: el webhook lo compara con lo que realmente se pagó.
  try {
    const orderTemp = {
      cliente: String(body.cliente || '').slice(0, 80),
      celular: String(body.celular || '').slice(0, 30),
      email: String(body.email || '').slice(0, 120),
      productos: pedido.items,
      envio: pedido.envio.label,
      descuento: pedido.descuento,
      codigo: pedido.codigo,
      total: pedido.total,
      fecha: new Date().toISOString(),
      carritoId: String(body.carritoId || '').slice(0, 40),
      preference_id: data.id || ''
    };
    await fetch(`${DB_URL}/pedidos_temp/${externalRef}.json`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${fbToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderTemp)
    });
  } catch (e) {
    console.error('Error guardando pedido_temp:', e);
  }

  return res.status(200).json({
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point,
    total: pedido.total
  });
}
