const PHONE_NUMBER_ID = '1159269003943325';

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('598')) return digits;
  if (digits.startsWith('0')) return '598' + digits.slice(1);
  return '598' + digits;
}

const AVISO_AUTOMATICO = '⚠️ Este es un mensaje automático. Para consultas escribinos al 095 290 959.';

function envioMsg(envio) {
  const e = String(envio || '').toLowerCase();
  let msg = '';
  if (e.includes('interior')) msg = 'Te avisaremos cuando sea despachado. 📦';
  else if (e.includes('pick up') || e.includes('retiro')) msg = 'Nos contactamos para coordinar el retiro. 🏔️';
  else if (e.includes('montevideo')) msg = 'Nos contactamos para coordinar la entrega. 🚴';
  return (msg ? msg + ' | ' : '') + AVISO_AUTOMATICO;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, template, cliente, productos, total, envio } = req.body;
  if (!to || !template) return res.status(400).json({ error: 'Faltan datos' });

  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return res.status(500).json({ error: 'WHATSAPP_TOKEN no configurado' });

  let components;
  if (template === 'confirmacion_pedido') {
    components = [{
      type: 'body',
      parameters: [
        { type: 'text', text: String(cliente || 'Cliente') },
        { type: 'text', text: String(productos || '—') },
        { type: 'text', text: String(total || '0') },
        { type: 'text', text: envioMsg(envio) }
      ]
    }];
  } else if (template === 'carrito_abandonado') {
    components = [{
      type: 'body',
      parameters: [
        { type: 'text', text: String(cliente || 'Cliente') },
        { type: 'text', text: String(productos || '—') },
        { type: 'text', text: String(total || '0') }
      ]
    }];
  } else {
    return res.status(400).json({ error: 'Template desconocido' });
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'template',
        template: {
          name: template,
          language: { code: 'es' },
          components
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('WhatsApp API error:', JSON.stringify(data));
      return res.status(500).json({ error: data });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-whatsapp error:', e);
    return res.status(500).json({ error: e.message });
  }
}
