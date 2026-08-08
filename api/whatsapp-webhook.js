const PHONE_NUMBER_ID = '1159269003943325';
const FIREBASE_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';
const MAX_HISTORY = 10; // mensajes a recordar por conversación

async function getProductos() {
  try {
    const res = await fetch(`${FIREBASE_URL}/productos.json`);
    const data = await res.json();
    if (!data) return '';
    const lines = [];
    for (const prod of Object.values(data)) {
      const nombre = prod.nombre || '';
      const variantes = prod.variantes || [];
      for (const v of variantes) {
        if (!v || typeof v !== 'object') continue;
        const color = v.color || v.nombre || '';
        const precio = v.precio ? `$${v.precio}` : '';
        const stock = v.stock === 0 ? ' [SIN STOCK]' : '';
        lines.push(`- ${nombre}${color ? ' ' + color : ''}${precio ? ' — ' + precio : ''}${stock}`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function getHistorial(from) {
  try {
    const res = await fetch(`${FIREBASE_URL}/conversaciones/${from}.json`);
    const data = await res.json();
    if (!data || !Array.isArray(data)) return [];
    return data.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

async function saveHistorial(from, historial) {
  try {
    await fetch(`${FIREBASE_URL}/conversaciones/${from}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(historial.slice(-MAX_HISTORY)),
    });
  } catch {}
}

async function callClaude(from, texto, productos, historial) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado');

  const systemPrompt = `Sos una persona que trabaja en Sendera, una tienda uruguaya de accesorios para running, trail y trekking. Respondés consultas por WhatsApp de forma natural, como una persona real atendiendo. Corto y directo, máximo 3-4 líneas.

TONO Y ESTILO:
- Hablá bien, con naturalidad, como una persona real atendiendo por WhatsApp
- Usá "vos", "te", "nos" — español rioplatense correcto, sin slang ni modismos exagerados
- Amable y directo, sin ser ni robótico ni demasiado informal
- NUNCA empieces con "¡Hola!" ni "Hola," — el saludo ya lo hizo el mensaje de bienvenida
- NUNCA uses frases de bot: "¡Por supuesto!", "¡Encantado de ayudarte!", "Estoy aquí para ayudarte", "Como asistente de Sendera..."
- Cuando listés productos o info, usá emojis como íconos visuales al inicio de cada línea (🧢 gorros, 🏃 running, 🏔️ montaña, 💰 precio, 🚚 envío, etc.)
- Usá saltos de línea para separar bien los ítems, que se lea fácil en el celular
- No uses asteriscos para negrita (*texto*), usá emojis para destacar
- Respondés corto: si hay muchos productos, mostrá los más relevantes y preguntá qué busca exactamente
- Usá siempre el contexto de la conversación — si el cliente ya dijo de dónde es, no le preguntes de nuevo. Si dijo que es del interior, ya sabés que el envío es por agencia
- Para cerrar una respuesta con una pregunta usá siempre "¿Te interesa alguno en particular?" — nunca "¿Hay alguno que te haya llamado la atención?" ni frases similares
- Cuando menciones talle único, decí solo "son talle único" o "medida universal", nunca agregues "así que te sirven a cualquiera"
- Si no sabés algo, decilo simple: "Eso no te lo puedo confirmar, escribinos al 095 290 959"

PRODUCTOS Y PRECIOS ACTUALES:
${productos}

CARACTERÍSTICAS DE PRODUCTOS:
- Trail Cap y Sendera Original (gorros visera): livianos, visera flexible, impermeables, transpirables
- Go One More y Buff: elásticos, térmicos, multiuso (se usan como cuello, gorro, vincha, pasamontañas, etc.), ideales para running y trail
- Gorro Lana Montaña: gorro de lana para frío
- Riñonera Sendera: para senderismo y trekking
- Riñonera Running: para trail y running, liviana
- Medallero RUN: 30 cm, acero, color negro
- Porta Celular: va en el brazo, talle universal (entra cualquier celular), para running y trail
- Todos los gorros son medida universal (talle único)

ENVÍOS:
- Hacemos envíos a todo el país
- Dentro de Montevideo: $200, entrega a domicilio
- Interior del país: por agencia de transporte, el costo lo paga el comprador
- Pick up gratis en Cordón (Montevideo): con coordinación previa
- Despachamos al día siguiente de la compra en todos los casos (IMPORTANTE: decí siempre "despachamos", nunca "llega" o "entrega al día siguiente" — la llegada al interior depende de la agencia)

POLÍTICA DE CAMBIOS: 15 días de cambio desde la compra.
NO TENEMOS LOCAL FÍSICO: trabajamos 100% online. Las compras se hacen por sendera.uy o por este WhatsApp.
FORMAS DE PAGO: MercadoPago o transferencia bancaria.
SITIO WEB: sendera.uy
INSTAGRAM: @sendera.uy
CONTACTO HUMANO: 095 290 959

Reglas:
- Respondés preguntas sobre productos, precios, envíos y pagos usando la info de arriba.
- Si no sabés algo con certeza, invitá a escribir al 095 290 959.
- Para comprar, dirigí a sendera.uy o al 095 290 959.
- Si preguntan cómo pagar por transferencia, dá estos datos exactos: "Prex: 19467638 — Nombre: Edgardo Torres. Una vez que realices la transferencia, mandanos el comprobante por acá."
- Cuando menciones los métodos de pago decí solo "MercadoPago o transferencia bancaria", sin agregar "por sendera.uy" ni links
- NUNCA inventes otros datos bancarios ni de pago fuera de los de arriba
- No respondas consultas ajenas a Sendera.`;

  const esPrimerMensaje = historial.length === 0;
  historial.push({ role: 'user', content: texto });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages: historial,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude API error: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const reply = data.content?.[0]?.text || '';

  if (reply) {
    historial.push({ role: 'assistant', content: reply });
    await saveHistorial(from, historial);
  }

  return reply;
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
    if (!value || value.statuses) return res.status(200).end();

    const message = value.messages?.[0];
    if (!message || message.type !== 'text') return res.status(200).end();

    const from = message.from;
    const text = message.text?.body;
    if (!from || !text) return res.status(200).end();

    console.log(`WhatsApp incoming from ${from}: ${text}`);

    const [productos, historialPrevio] = await Promise.all([getProductos(), getHistorial(from)]);

    if (historialPrevio.length === 0) {
      const bienvenida = `¡Hola! Gracias por ponerte en contacto con nosotros ✨\n\nSomos Sendera, trabajamos 100% online para que puedas acceder a nuestros productos de forma simple, rápida y segura.\n\n👉 Conocé todo en www.sendera.uy y encontrá lo que necesitás para tu próxima aventura!\n\nCualquier consulta, estamos para ayudarte.`;
      await sendWhatsAppReply(from, bienvenida);
      await saveHistorial(from, [{ role: 'user', content: text }, { role: 'assistant', content: bienvenida }]);
    } else {
      const reply = await callClaude(from, text, productos, historialPrevio);
      if (reply) await sendWhatsAppReply(from, reply);
    }
  } catch (e) {
    console.error('whatsapp-webhook error:', e);
  }

  return res.status(200).end();
}
