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

async function fbGet(path, token) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return res.json();
}

async function fbPost(path, data, token) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function fbDelete(path, token) {
  await fetch(`${DB_URL}/${path}.json`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

export default async function handler(req, res) {
  // MercadoPago envía GET para verificar el endpoint al registrarlo
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { type, data } = req.body;

    // Solo procesar notificaciones de pago
    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ ok: true });
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

    // Obtener detalles del pago desde MercadoPago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();

    // Solo guardar si el pago fue aprobado
    if (payment.status !== 'approved') {
      return res.status(200).json({ ok: true, status: payment.status });
    }

    const externalRef = payment.external_reference;
    if (!externalRef) {
      return res.status(200).json({ ok: true, msg: 'sin external_reference' });
    }

    const fbToken = await getFirebaseToken();

    // Leer orden temporal
    const orderTemp = await fbGet(`pedidos_temp/${externalRef}`, fbToken);
    if (!orderTemp) {
      return res.status(200).json({ ok: true, msg: 'pedido_temp no encontrado' });
    }

    // Verificar que no se guardó ya (evitar duplicados por reintentos de MP)
    const existingCheck = await fbGet(`pedidos_mp_ids/${data.id}`, fbToken);
    if (existingCheck) {
      return res.status(200).json({ ok: true, msg: 'pago ya procesado' });
    }

    // Guardar pedido confirmado
    const pedido = {
      fecha: orderTemp.fecha || new Date().toISOString(),
      cliente: orderTemp.cliente,
      celular: orderTemp.celular,
      productos: orderTemp.productos,
      envio: orderTemp.envio,
      total: orderTemp.total,
      estado: 'confirmado',
      mp_id: String(data.id),
      metodo_pago: 'mercadopago'
    };

    await fbPost('pedidos', pedido, fbToken);

    // Marcar pago como procesado para evitar duplicados
    await fetch(`${DB_URL}/pedidos_mp_ids/${data.id}.json`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(true)
    });

    // Eliminar orden temporal y carrito abandonado
    await fbDelete(`pedidos_temp/${externalRef}`, fbToken);
    if (orderTemp.carritoId) {
      await fbDelete(`carritos_abandonados/${orderTemp.carritoId}`, fbToken);
    }

    // Enviar notificación push
    try {
      const tokens = await fbGet('fcm_tokens', fbToken);
      const tokenList = tokens ? Object.values(tokens) : [];
      if (tokenList.length > 0) {
        await fetch('https://www.senderauy.com/api/notify-pedido', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente: pedido.cliente,
            total: pedido.total.toLocaleString(),
            envio: pedido.envio,
            tokens: tokenList
          })
        });
      }
    } catch (e) {
      console.error('Error enviando notificación push:', e);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Error en mp-webhook:', e);
    return res.status(200).json({ ok: true }); // Siempre 200 para que MP no reintente indefinidamente
  }
}
