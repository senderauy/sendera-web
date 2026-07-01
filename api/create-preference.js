import { GoogleAuth } from 'google-auth-library';

const DB_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';

async function getFirebaseToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: [
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const body = req.body;

  const externalRef = 'sendera-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);

  const items = body.items.map(item => ({
    title: `${item.nombre} - ${item.variante}`,
    quantity: parseInt(item.qty) || 1,
    unit_price: parseFloat(item.precio) || 0,
    currency_id: 'UYU'
  }));

  // Agregar envío si corresponde
  if (body.envio && body.envio.costo > 0) {
    items.push({
      title: `Envío - ${body.envio.label}`,
      quantity: 1,
      unit_price: parseFloat(body.envio.costo),
      currency_id: 'UYU'
    });
  }

  const preference = {
    items,
    payer: {
      name: body.cliente,
      phone: { number: String(body.celular) }
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

  // Guardar orden temporal en Firebase para que el webhook la recupere
  try {
    const fbToken = await getFirebaseToken();
    const orderTemp = {
      cliente: body.cliente,
      celular: String(body.celular),
      productos: body.items.map(i => ({ nombre: i.nombre, variante: i.variante, qty: i.qty, precio: i.precio })),
      envio: body.envio?.label || '—',
      total: parseFloat(body.total) || 0,
      fecha: body.fecha || new Date().toISOString(),
      carritoId: body.carritoId || '',
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
    sandbox_init_point: data.sandbox_init_point
  });
}
