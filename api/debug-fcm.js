import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: [
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/firebase.messaging',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();

  const DB_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';
  const dbRes = await fetch(`${DB_URL}/fcm_tokens.json`, { headers: { Authorization: `Bearer ${token}` } });
  const tokens = await dbRes.json();
  const tokenList = tokens ? Object.entries(tokens) : [];

  const projectId = serviceAccount.project_id;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const results = [];
  for (const [key, fcmToken] of tokenList) {
    try {
      const fcmRes = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title: 'Test diagnostico Sendera', body: 'Si ves esto, funciona.' }
          }
        })
      });
      const body = await fcmRes.text();
      results.push({ key, tokenPreview: fcmToken.slice(0, 15) + '...', status: fcmRes.status, ok: fcmRes.ok, body });
    } catch (e) {
      results.push({ key, error: e.message });
    }
  }

  return res.status(200).json({ totalTokens: tokenList.length, results });
}
