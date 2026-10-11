// Guarda la suscripción de notificaciones push de un admin.
// Solo un admin con sesión iniciada puede suscribirse: así nadie de afuera recibe los avisos de pedidos.
import { DB_URL, getFirebaseToken } from './_pedido.js';
import { emailDeSesion, esAdmin, tokenDeSesion } from './_admin.js';

function suscripcionValida(s) {
  return s && typeof s === 'object'
    && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const email = await emailDeSesion(tokenDeSesion(req));
    if (!email) return res.status(401).json({ error: 'Iniciá sesión como admin' });

    const fbToken = await getFirebaseToken();
    if (!(await esAdmin(email, fbToken))) return res.status(403).json({ error: 'Solo admins' });

    const subscription = req.body;
    if (!suscripcionValida(subscription)) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }
    const limpia = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      admin: email
    };

    const key = Buffer.from(subscription.endpoint).toString('base64url').slice(0, 40);
    await fetch(`${DB_URL}/push_subscriptions/${key}.json`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(limpia)
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('save-push-subscription error:', e.message);
    res.status(500).json({ error: 'No se pudo guardar la suscripción' });
  }
}
