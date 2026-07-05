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
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    const fbToken = await getFirebaseToken();
    const key = Buffer.from(subscription.endpoint).toString('base64url').slice(0, 40);

    await fetch(`${DB_URL}/push_subscriptions/${key}.json`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${fbToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    res.json({ ok: true });
  } catch (e) {
    console.error('save-push-subscription error:', e);
    res.status(500).json({ error: e.message });
  }
}
