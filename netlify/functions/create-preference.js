exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const body = JSON.parse(event.body);

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
      success: 'https://sendera-web.netlify.app?pago=ok',
      failure: 'https://sendera-web.netlify.app?pago=error',
      pending: 'https://sendera-web.netlify.app?pago=pendiente'
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

  return {
    statusCode: 200,
    body: JSON.stringify({ init_point: data.init_point, sandbox_init_point: data.sandbox_init_point })
  };
};
