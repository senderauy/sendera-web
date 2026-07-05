import webpush from 'web-push';

const VAPID_PUBLIC_KEY = 'BA4NqXXi5tqqH2ZT6Yg8mx35MAAC_EJRgo-7-JpynTGImlQua3mAcryr4hNPlh0kIFjeMWxUJtmQXoOrmbxmMOQ';

webpush.setVapidDetails(
  'mailto:edgardott1990@gmail.com',
  VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { cliente, total, envio, subscriptions } = req.body;
  if (!subscriptions || subscriptions.length === 0) return res.status(200).json({ ok: true, sent: 0 });

  const payload = JSON.stringify({
    title: '🛍️ Nuevo pedido Sendera',
    body: `${cliente} · $${total} · ${envio}`,
    icon: '/img/logo.png'
  });

  let sent = 0;
  const errors = [];
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload);
      sent++;
    } catch(e) {
      console.error('Web push error:', e.statusCode, e.body);
      errors.push({ statusCode: e.statusCode, body: e.body });
    }
  }

  return res.status(200).json({ ok: true, sent, errors });
}
