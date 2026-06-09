export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const body = req.body;

  const items = body.items.map(item => ({
    title: `${item.nombre} - ${item.variante}`,
    quantity: item.qty,
    unit_price: item.precio,
    currency_id: 'UYU'
  }));

  // Agregar envío si corresponde
  if (body.envio && body.envio.costo > 0) {
    items.push({
      title: `Envío - ${body.envio.label}`,
      quantity: 1,
      unit_price: body.envio.costo,
      currency_id: 'UYU'
    });
  }

  const preference = {
    items,
    payer: {
      name: body.cliente,
      phone: { number: body.celular }
    },
    back_urls: {
      success: 'https://www.senderauy.com?pago=ok',
      failure: 'https://www.senderauy.com?pago=error',
      pending: 'https://www.senderauy.com?pago=pendiente'
    },
    auto_return: 'approved',
    statement_descriptor: 'SENDERA'
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

  return res.status(200).json({
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point
  });
}
