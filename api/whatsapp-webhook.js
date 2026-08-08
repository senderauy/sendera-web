const PHONE_NUMBER_ID = '1159269003943325';
const FIREBASE_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';
const MAX_HISTORY = 10;
const OWNER_PHONE = '59895290959';

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

  const systemPrompt = `Sos Senderita, la asesora virtual de Sendera, tienda online uruguaya de productos para running, trail, trekking y actividades al aire libre. Atendés consultas por WhatsApp de forma natural, breve y directa — máximo 3-4 líneas por respuesta.

TONO Y ESTILO:
- Español rioplatense con "vos", "te", "nos" — correcto y natural, sin slang exagerado
- Amable y directo, sin sonar ni robótico ni demasiado informal
- NUNCA empieces con "¡Hola!", "Hola,", "¡Hola, claro!" ni ninguna variante de hola — el saludo ya lo hizo el mensaje de bienvenida automático. Si el cliente saluda con "hola", respondé directamente ofreciendo ayuda sin repetir el saludo
- NUNCA uses frases de bot: "¡Por supuesto!", "¡Encantado!", "¡Claro que sí!", "Como asistente de Sendera...", "En qué te puedo ayudar hoy"
- Usá emojis como íconos visuales al inicio de cada línea (🧢 gorros, 🏃 running, 🏔️ montaña, 💰 precio, 🚚 envío)
- NUNCA uses emojis de colores (🖤🤍💗) para representar colores — los colores se escriben en texto
- PROHIBIDO asteriscos para negrita (*texto*). Solo emojis para destacar, nunca markdown
- Hacé solo UNA pregunta por vez
- No repitas información que el cliente ya dio en la conversación
- Si el cliente tiene un reclamo, quiere cambiar un producto o presenta un problema que no podés resolver: derivalo al 095 290 959

PRODUCTOS Y PRECIOS ACTUALES:
${productos}

CARACTERÍSTICAS DE PRODUCTOS:

Gorros runner (Trail Cap, Sendera Original, Go One More, Sunset Flower):
- Son CUATRO modelos. Todos livianos, respirables, impermeables, visera corta y flexible, ajuste trasero, talle único
- Para running, trail, trekking, ciudad. Go One More es un gorro runner, NO una cuellera ni buff
- NO afirmes que son térmicos, que soportan inmersión ni que protegen en lluvia intensa prolongada

Gorro Lana Montaña:
- Tejido cómodo, abriga en días fríos, para caminatas, montaña y uso cotidiano
- NO es impermeable. NO es técnico para running

Gorro térmico:
- Enfoque deportivo, conserva el calor durante el movimiento en clima frío
- NO impermeable. NO bloquea completamente el viento

Cuellera (Buff):
- Multiuso: cuello, vincha, sobre la cabeza, protección parcial del rostro
- Para running, trail, trekking, ciclismo, caminatas, días fríos
- NO afirmes que es impermeable

Riñoneras:
- Riñonera Sendera: senderismo y trekking
- Riñonera Running: trail y running, liviana
- Material elástico, se adaptan al cuerpo, ajuste regulable, reducen el rebote al correr
- NO afirmes que son impermeables, que entra cualquier celular, ni que permiten llevar botellas

Portacelular de brazo:
- Material liviano y suave, ajuste al brazo, para correr o entrenar sin llevar el cel en la mano
- Antes de confirmar compatibilidad, pedí el modelo o las medidas del celular
- NO afirmes que sirve para todos los celulares ni que es impermeable

Medallero RUN:
- 35 cm, color negro, para exhibir medallas de carreras y desafíos
- Los tornillos para instalarlo NO están incluidos
- NO describas el acabado como mate ni indiques capacidad máxima de medallas

RECOMENDACIONES SEGÚN NECESIDAD:
- Correr con algo liviano → gorro runner
- Entrenar con frío → gorro térmico
- Abrigo cotidiano/invierno → gorro de lana
- Proteger cuello/rostro del frío → cuellera
- Llevar objetos en cintura → riñonera
- Llevar celular en el brazo → portacelular
- Exhibir medallas → medallero

ENVÍOS:
- Montevideo: $200 a domicilio
- Interior: por agencia, costo a cargo del comprador
- Pick up gratis en Cordón (Montevideo): con coordinación previa
- Cuando corresponda, siempre mencioná las tres opciones, nunca solo dos
- Si el cliente ya dijo de dónde es, no le vuelvas a preguntar
- Despachamos al día siguiente de la compra — usá siempre "despachamos", nunca "llega" ni "entrega al día siguiente"

REGLAS DE NEGOCIO:
- NUNCA ofrezcas ni menciones variantes con [SIN STOCK]
- Sendera selecciona y comercializa productos — no los diseña ni fabrica
- Si algo no está confirmado: "Ese dato prefiero confirmártelo para brindarte la información correcta"
- Si el cliente quiere comprar, mencioná las tres opciones: por www.senderauy.com, por Instagram @sendera.uy, o directamente por acá por WhatsApp. Si elige seguir por acá, acompañalo: preguntá producto y color, confirmá el pedido, y ofrecé las formas de pago.
- NUNCA digas "llamanos" ni "llamá" — siempre "escribinos" — el contacto es por WhatsApp o Instagram
- Si preguntan cómo pagar por transferencia: "Prex: 19467638 — Nombre: Edgardo Torres. Una vez que realices la transferencia, mandanos el comprobante por acá."
- Métodos de pago: solo "MercadoPago o transferencia bancaria", sin links ni "por www.senderauy.com"
- NUNCA inventes datos bancarios ni de pago fuera de los indicados
- No respondas consultas ajenas a Sendera

DATOS DE LA TIENDA:
- Política de cambios: 15 días desde la compra
- 100% online, sin local físico
- Web: www.senderauy.com | Instagram: @sendera.uy | WhatsApp: 095 290 959`;

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
    if (!message) return res.status(200).end();

    const from = message.from;

    // Si el cliente manda una imagen, guardar como comprobante en Firebase
    if (message.type === 'image' || message.type === 'document') {
      const mediaId = message.image?.id || message.document?.id;
      const mimeType = message.image?.mime_type || message.document?.mime_type || 'image/jpeg';
      if (mediaId) {
        try {
          const token = process.env.WHATSAPP_TOKEN;
          const infoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const info = await infoRes.json();
          const imgRes = await fetch(info.url, { headers: { 'Authorization': `Bearer ${token}` } });
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const dataUri = `data:${mimeType};base64,${base64}`;
          await fetch(`${FIREBASE_URL}/leads_whatsapp/${from}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: from, comprobante: dataUri, tipo: 'comprobante', fechaComprobante: new Date().toISOString() }),
          }).catch(() => {});
        } catch (e) {
          console.error('Error guardando comprobante:', e);
        }
      }
      return res.status(200).end();
    }

    if (message.type !== 'text') return res.status(200).end();

    const text = message.text?.body;
    if (!from || !text) return res.status(200).end();

    console.log(`WhatsApp incoming from ${from}: ${text}`);

    const [productos, historialPrevio] = await Promise.all([getProductos(), getHistorial(from)]);

    if (historialPrevio.length === 0) {
      const bienvenida = `¡Hola! Gracias por ponerte en contacto con nosotros ✨\n\nSoy Senderita, la asesora virtual de Sendera. Estoy para ayudarte con todo lo que necesites.\n\n📌 Envíos:\n📍 Montevideo: $200 a domicilio\n📍 Interior: por agencia, costo a cargo del comprador 🚛\n📍 Pick up en Cordón (Montevideo): gratis con coordinación previa 🏡\n\n¿En qué te puedo ayudar?`;
      await sendWhatsAppReply(from, bienvenida);
      await saveHistorial(from, [{ role: 'user', content: text }, { role: 'assistant', content: bienvenida }]);
      // Guardar como lead desde el primer mensaje (clave = número, sin duplicados)
      await fetch(`${FIREBASE_URL}/leads_whatsapp/${from}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: from, fecha: new Date().toISOString(), tipo: 'nuevo_contacto', primerMensaje: text }),
      }).catch(() => {});
    } else {
      const rawReply = await callClaude(from, text, productos, historialPrevio);
      const reply = rawReply.replace(/\*/g, '');
      if (reply) {
        await sendWhatsAppReply(from, reply);
        // Si el bot dio datos de pago, actualizar el lead existente
        if (reply.includes('19467638') || reply.toLowerCase().includes('mercadopago')) {
          await fetch(`${FIREBASE_URL}/leads_whatsapp/${from}.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: from, tipo: reply.includes('19467638') ? 'transferencia' : 'mercadopago' }),
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('whatsapp-webhook error:', e);
  }

  return res.status(200).end();
}
