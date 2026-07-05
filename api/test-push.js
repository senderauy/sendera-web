import { GoogleAuth } from 'google-auth-library';
import webpush from 'web-push';

const DB_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';
const VAPID_PUBLIC_KEY = 'BA4NqXXi5tqqH2ZT6Yg8mx35MAAC_EJRgo-7-JpynTGImlQua3mAcryr4hNPlh0kIFjeMWxUJtmQXoOrmbxmMOQ';

async function getFirebaseToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email']
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

export default async function handler(req, res) {
  try {
    if (!process.env.VAPID_PRIVATE_KEY) {
      return res.json({ error: 'VAPID_PRIVATE_KEY no configurada en Vercel' });
    }

    webpush.setVapidDetails('mailto:edgardott1990@gmail.com', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

    const fbToken = await getFirebaseToken();
    const subsRes = await fetch(`${DB_URL}/push_subscriptions.json`, {
      headers: { 'Authorization': `Bearer ${fbToken}` }
    });
    const subs = await subsRes.json();

    const subList = subs ? Object.values(subs) : [];

    if (subList.length === 0) {
      return res.json({ error: 'No hay suscripciones guardadas en Firebase', subs });
    }

    const results = [];
    for (const sub of subList) {
      try {
        await webpush.sendNotification(sub, JSON.stringify({
          title: '🧪 Prueba Sendera',
          body: 'Si ves esto, las notificaciones funcionan!',
          icon: '/img/logo.png'
        }));
        results.push({ ok: true, endpoint: sub.endpoint?.slice(0, 50) });
      } catch (e) {
        results.push({ ok: false, endpoint: sub.endpoint?.slice(0, 50), status: e.statusCode, body: e.body });
      }
    }

    res.json({ totalSubs: subList.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 500) });
  }
}
