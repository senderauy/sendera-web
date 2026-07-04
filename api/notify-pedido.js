import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { cliente, total, envio, tokens } = req.body;
  if (!tokens || tokens.length === 0) return res.status(200).json({ ok: true, sent: 0 });

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });
  const client = await auth.getClient();
  const { token: accessToken } = await client.getAccessToken();

  const projectId = serviceAccount.project_id;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  let sent = 0;
  const errors = [];
  for (const fcmToken of tokens) {
    try {
      const fcmRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: {
              title: String.fromCodePoint(0x1F6CD) + ' Nuevo pedido Sendera',
              body: `${cliente} · $${total} · ${envio}`
            }
          }
        })
      });
      if (fcmRes.ok) {
        sent++;
      } else {
        const errBody = await fcmRes.text();
        console.error('FCM send error:', fcmRes.status, errBody);
        errors.push({ status: fcmRes.status, body: errBody });
      }
    } catch(e) {
      console.error('FCM send exception:', e.message);
      errors.push({ error: e.message });
    }
  }

  return res.status(200).json({ ok: true, sent, errors });
}
