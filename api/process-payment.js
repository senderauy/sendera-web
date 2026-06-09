export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const body = req.body;

  // Calcular monto total
  const total = body.items.reduce((sum, i) => sum + (i.precio * i.qty), 0)
    + (body.envio?.costo || 0);

  const payment = {
    transaction_amount: total,
    token: body.token,
    description: body.items.map(i => `${i.nombre} x${i.qty}`).join(', '),
    installments: body.installments || 1,
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
      items: body.items.map(i => ({
        id: i.nombre,
        title: `${i.nombre} - ${i.variante}`,
        quantity: i.qty,
        unit_price: i.precio
      })),
      payer: {
        first_name: body.cliente,
        phone: { number: body.celular }
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
    error: data.message || null
  });
}
