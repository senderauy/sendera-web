import webpush from 'web-push';
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

const VAPID_PUBLIC_KEY = 'BA4NqXXi5tqqH2ZT6Yg8mx35MAAC_EJRgo-7-JpynTGImlQua3mAcryr4hNPlh0kIFjeMWxUJtmQXoOrmbxmMOQ';

webpush.setVapidDetails(
  'mailto:edgardott1990@gmail.com',
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { cliente, total, envio } = req.body;
  const fbToken = await getFirebaseToken();
  const subsRes = await fetch(`${DB_URL}/push_subscriptions.json`, {
    headers: { 'Authorization': `Bearer ${fbToken}` }
  });
  const subscriptions = Object.values((await subsRes.json()) || {});
  if (subscriptions.length === 0) return res.status(200).json({ ok: true, sent: 0 });

  const payload = JSON.stringify({
    title: '🛍️ Nuevo pedido Sendera',
    body: `${cliente} · $${total} · ${envio}`,
    icon: '/img/logo.png'
  });

  let sent = 0;
  const errors = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload, { urgency: 'high', TTL: 3600 });
      sent++;
    } catch(e) {
      console.error('Web push error:', e.statusCode, e.body);
      errors.push({ statusCode: e.statusCode, body: e.body });
    }
  }

  return res.status(200).json({ ok: true, sent, errors });
}
