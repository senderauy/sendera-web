import { getFirebaseToken, calcularPedido, PedidoInvalido } from './_pedido.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const body = req.body || {};

  // El monto a cobrar se calcula en el servidor con los precios reales (no con los que manda el navegador)
  let pedido;
  try {
    const fbToken = await getFirebaseToken();
    pedido = await calcularPedido(body, fbToken);
  } catch (e) {
    if (e instanceof PedidoInvalido) return res.status(400).json({ status: 'rejected', error: e.message });
    console.error('process-payment: error calculando el pedido:', e);
    return res.status(500).json({ status: 'error', error: 'No se pudo procesar el pago. Intentá de nuevo.' });
  }

  const payment = {
    transaction_amount: pedido.total,
    token: body.token,
    description: pedido.items.map(i => `${i.nombre} x${i.qty}`).join(', ').slice(0, 250),
    installments: parseInt(body.installments, 10) || 1,
    payment_method_id: body.payment_method_id,
    issuer_id: body.issuer_id,
    payer: {
      email: body.payer_email,
      identification: {
        type: body.payer_doc_type || 'CI',
        number: body.payer_doc_number || ''
      }
    },
    additional_info: {
      items: pedido.items.map(i => ({
        id: i.nombre,
        title: `${i.nombre} - ${i.variante}`,
        quantity: i.qty,
        unit_price: i.precio
      })),
      payer: {
        first_name: String(body.cliente || '').slice(0, 80),
        phone: { number: String(body.celular || '').slice(0, 30) }
      }
    },
    statement_descriptor: 'SENDERA',
    external_reference: `sendera-${Date.now()}`
  };

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `sendera-${Date.now()}-${Math.random()}`
    },
    body: JSON.stringify(payment)
  });

  const data = await response.json();

  return res.status(200).json({
    status: data.status,
    status_detail: data.status_detail,
    id: data.id,
    total: pedido.total,
    error: data.message || null
  });
}
