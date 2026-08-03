const PHONE_NUMBER_ID = '1159269003943325';

const SYSTEM_PROMPT = `Sos el asistente virtual de Sendera, una tienda de accesorios outdoor y trekking de Uruguay. Respondés consultas de clientes de manera amable y breve, en español rioplatense (Uruguay). Máximo 3-4 líneas por respuesta.

PRODUCTOS DISPONIBLES:
- Go One More (Blanco, Rosa, Verde, Violeta) — buff/cuello multifunción para running y trail
- Trail Cap (Azul, Negro) — gorra trail running
- Sunset Flower (Rojo/Amarillo, Gris/Verde) — vincha/banda
- Gorro Lana Montaña (Negro, Azul, Rosa) — gorro de lana
- Riñonera Sendera — para senderismo y trekking
- Riñonera Running (Celeste, Negra) — para trail y running
- Medallero RUN — 30 cm, acero, negro
- Porta Celular — para running y trail

ENVÍOS:
- Montevideo: $200, entrega a domicilio
- Interior del país: por agencia, costo a cargo del comprador
- Pick up en Cordón (Montevideo): gratis, con coordinación previa

FORMAS DE PAGO: MercadoPago o transferencia bancaria.
SITIO WEB: sendera.uy (productos y precios actualizados)
CONTACTO HUMANO: 095 290 959

Reglas:
- Si no sabés algo con certeza, invitá a escribir al 095 290 959 o visitar sendera.uy.
- Nunca inventes precios exactos ni stock disponible.
- Para comprar, dirigí a sendera.uy o al 095 290 959.
- No respondas consultas ajenas a Sendera.`;

async function callClaude(text) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude API error: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

async function sendWhatsAppReply(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error('WHATSAPP_TOKEN no configurado');

  const response = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    console.error('WhatsApp reply error:', JSON.stringify(err));
  }
}

export default async function handler(req, res) {
  // Verificación del webhook (Meta lo llama al registrar el endpoint)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).end();
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    // Ignorar actualizaciones de estado (recibido, leído, etc.)
    if (!value || value.statuses) return res.status(200).end();

    const message = value.messages?.[0];
    if (!message || message.type !== 'text') return res.status(200).end();

    const from = message.from;
    const text = message.text?.body;
    if (!from || !text) return res.status(200).end();

    console.log(`WhatsApp incoming from ${from}: ${text}`);

    const reply = await callClaude(text);
    if (reply) await sendWhatsAppReply(from, reply);
  } catch (e) {
    console.error('whatsapp-webhook error:', e);
  }

  return res.status(200).end();
}
