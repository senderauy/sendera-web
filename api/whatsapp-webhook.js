import { GoogleAuth } from 'google-auth-library';
import { createHmac, timingSafeEqual } from 'crypto';

const PHONE_NUMBER_ID = '1159269003943325';
const FIREBASE_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';
const MAX_HISTORY = 10;
const OWNER_PHONE = '59895290959';

let tokenCache = null;

function getFirebaseToken() {
  if (!tokenCache || tokenCache.vence < Date.now()) {
    const promesa = (async () => {
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
    })().catch(e => { tokenCache = null; throw e; });
    tokenCache = { promesa, vence: Date.now() + 50 * 60 * 1000 };
  }
  return tokenCache.promesa;
}

async function fbFetch(path, options = {}) {
  const token = await getFirebaseToken();
  return fetch(`${FIREBASE_URL}/${path}.json`, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${token}` }
  });
}

async function getProductos() {
  try {
    const [res, resStock] = await Promise.all([fbFetch(`productos`), fbFetch(`stock`)]);
    const data = await res.json();
    if (!data) return '';
    // Mismo criterio que la tienda: el stock está en /stock y si falta la variante cuenta como 0
    const stock = resStock.ok ? ((await resStock.json()) || {}) : null;
    const lines = [];
    for (const [prodId, prod] of Object.entries(data)) {
      const nombre = prod.nombre || '';
      for (const [i, v] of Object.entries(prod.variantes || {})) {
        if (!v || typeof v !== 'object') continue;
        const color = v.color || v.nombre || '';
        const precio = v.precio ? `$${v.precio}` : '';
        const sinStock = stock && (stock[v.stockId || `${prodId}-${i}`] ?? 0) <= 0 ? ' [SIN STOCK]' : '';
        lines.push(`- ${nombre}${color ? ' ' + color : ''}${precio ? ' — ' + precio : ''}${sinStock}`);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function getHistorial(from) {
  try {
    const res = await fbFetch(`conversaciones/${from}`);
    const data = await res.json();
    if (!data || !Array.isArray(data)) return [];
    return data.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

async function extractOrderFromConversation(historial) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system: `Analizá esta conversación de WhatsApp de una tienda deportiva uruguaya y extraé los datos de compra. Respondé ÚNICAMENTE con JSON válido, sin texto adicional. Formato: {"cliente":"nombre o Sin nombre","productos":[{"nombre":"nombre producto","variante":"color o talle","qty":1,"precio":0}],"total":0,"metodo_pago":"transferencia o mercadopago","envio":"Envío Montevideo, Envío interior o Pick up Cordón"}. Si no hay datos de compra claros, respondé: {"sinDatos":true}`,
        messages: [{ role: 'user', content: JSON.stringify(historial) }],
      }),
    });
    const data = await response.json();
    const text = (data.content?.[0]?.text || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { sinDatos: true };
  } catch {
    return null;
  }
}

async function saveHistorial(from, historial) {
  try {
    await fbFetch(`conversaciones/${from}`, {
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
- Son CUATRO modelos. Todos livianos, respirables, impermeables, ajuste trasero, talle único
- Sendera Original y Go One More: visera liviana y flexible
- Trail Cap y Sunset Flower: visera corta pero rígida
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
- 30 cm, color negro, para exhibir medallas de carreras y desafíos
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
- NUNCA inventes precios. Los precios SOLO están en la lista de PRODUCTOS Y PRECIOS ACTUALES de arriba. Si un producto no aparece en esa lista con precio, decí: "El precio te lo confirmo, fijate en www.senderauy.com o escribinos al 095 290 959"
- Si algo no está confirmado: "Ese dato prefiero confirmártelo para brindarte la información correcta"
- Si el cliente quiere comprar por acá por WhatsApp, acompañalo: preguntá producto y color, confirmá el pedido, y ofrecé transferencia bancaria como forma de pago.
- Si el cliente quiere pagar con MercadoPago, no se puede completar por WhatsApp. Derivalo: "Para pagar con MercadoPago podés hacerlo por www.senderauy.com, por nuestro Instagram @sendera.uy o escribinos al 095 290 959"
- Si el cliente pregunta cómo comprar en general, mencioná las tres opciones: www.senderauy.com, Instagram @sendera.uy, o directamente por acá (solo transferencia).
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

async function handler(req, res) {
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

    // El número se usa para armar rutas de la base (conversaciones/<número>): solo se aceptan dígitos
    const from = String(message.from || '');
    if (!/^\d{8,15}$/.test(from)) {
      console.error('whatsapp-webhook: número de origen inválido, mensaje descartado');
      return res.status(200).end();
    }

    // Si el cliente manda una imagen, guardar como comprobante en Firebase
    if (message.type === 'image' || message.type === 'document') {
      const mediaId = String(message.image?.id || message.document?.id || '');
      const mimeType = message.image?.mime_type || message.document?.mime_type || 'image/jpeg';
      // El id de un archivo de WhatsApp es numérico; cualquier otra cosa se ignora
      if (/^\d{5,30}$/.test(mediaId)) {
        try {
          const token = process.env.WHATSAPP_TOKEN;
          const infoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const info = await infoRes.json();
          // El token de WhatsApp solo se manda a servidores de Meta
          const hostMedia = (() => { try { return new URL(info.url).hostname; } catch { return ''; } })();
          if (!/(^|\.)(fbsbx\.com|fbcdn\.net|whatsapp\.net|facebook\.com)$/.test(hostMedia)) {
            throw new Error('URL de archivo fuera de Meta, descartada');
          }
          const imgRes = await fetch(info.url, { headers: { 'Authorization': `Bearer ${token}` } });
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const dataUri = `data:${mimeType};base64,${base64}`;
          await fbFetch(`leads_whatsapp/${from}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: from, comprobante: dataUri, tipo: 'comprobante', fechaComprobante: new Date().toISOString() }),
          }).catch(() => {});
          // Intentar crear pedido extrayendo datos de la conversación
          const historialComprobante = await getHistorial(from);
          if (historialComprobante.length > 0) {
            const orderData = await extractOrderFromConversation(historialComprobante);
            if (orderData && !orderData.sinDatos && orderData.productos?.length > 0) {
              await fbFetch(`pedidos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...orderData,
                  celular: from.replace(/^598/, '0'),
                  fecha: new Date().toISOString(),
                  estado: 'pendiente-transferencia',
                  comprobante: dataUri,
                  origen: 'whatsapp',
                }),
              }).catch(() => {});
              // Mover de WhatsApp leads a Pedidos: eliminar el lead
              await fbFetch(`leads_whatsapp/${from}`, { method: 'DELETE' }).catch(() => {});
              // Notificación push igual que los pedidos normales
              try {
                const subsRes = await fbFetch(`push_subscriptions`);
                const subsData = await subsRes.json();
                const subList = subsData ? Object.values(subsData) : [];
                if (subList.length > 0) {
                  await fetch('https://www.senderauy.com/api/notify-pedido', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      cliente: `💬 WhatsApp · ${orderData.cliente || from.replace(/^598/, '0')}`,
                      total: (orderData.total || 0).toLocaleString(),
                      envio: orderData.envio || '—',
                      subscriptions: subList,
                    }),
                  });
                }
              } catch (e) {
                console.error('Error enviando notificación push WhatsApp:', e);
              }
            }
          }
          await sendWhatsAppReply(from, '¡Gracias por enviarnos el comprobante! 🙌 En breve nos comunicamos con vos para coordinar todo.');
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
      await fbFetch(`leads_whatsapp/${from}`, {
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
          await fbFetch(`leads_whatsapp/${from}`, {
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

// ── Verificación de firma de Meta ───────────────────────────────
// Meta firma cada aviso con el "App Secret" de la app (cabecera X-Hub-Signature-256).
// Sin firma válida no se procesa nada: así nadie puede mandar mensajes inventados.
export function firmaValida(cuerpoCrudo, cabecera, secreto) {
  if (!secreto || !cabecera || !cabecera.startsWith('sha256=')) return false;
  const esperada = Buffer.from('sha256=' + createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex'));
  const recibida = Buffer.from(cabecera);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// Adaptador: Vercel entrega el pedido "crudo" (hace falta para verificar la firma)
// y se lo pasamos al handler de siempre con la misma forma req/res.
function respuesta() {
  let status = 200, cuerpo = '';
  const res = {
    status(c) { status = c; return res; },
    end() { return res; },
    send(b) { cuerpo = String(b ?? ''); return res; },
    json(o) { cuerpo = JSON.stringify(o); return res; },
    aResponse() { return new Response(cuerpo, { status }); }
  };
  return res;
}

export async function GET(request) {
  const url = new URL(request.url);
  const res = respuesta();
  await handler({ method: 'GET', query: Object.fromEntries(url.searchParams) }, res);
  return res.aResponse();
}

export async function POST(request) {
  const cuerpoCrudo = await request.text();
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) {
    console.error('whatsapp-webhook: falta WHATSAPP_APP_SECRET; no se procesan mensajes hasta configurarlo');
    return new Response('', { status: 401 });
  }
  if (!firmaValida(cuerpoCrudo, request.headers.get('x-hub-signature-256'), secreto)) {
    // Modo aviso (transitorio): mientras se confirma que WHATSAPP_APP_SECRET es la clave con la que firma Meta,
    // una firma que no coincide se registra pero no corta a Senderita. Para exigir la firma, cargar
    // WHATSAPP_FIRMA_ESTRICTA=1 en Vercel. El número de origen se sigue validando igual (solo dígitos).
    if (process.env.WHATSAPP_FIRMA_ESTRICTA === '1') {
      return new Response('', { status: 401 });
    }
    // Diagnóstico sin datos sensibles: primeros caracteres de las firmas (no revelan la clave),
    // largo del cuerpo y si la firma coincidiría con el JSON re-serializado (cuerpo modificado en el camino)
    const recibida = String(request.headers.get('x-hub-signature-256') || '');
    const calculada = 'sha256=' + createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex');
    let coincideReserializado = false;
    try { coincideReserializado = firmaValida(JSON.stringify(JSON.parse(cuerpoCrudo)), recibida, secreto); } catch {}
    console.warn(`whatsapp-webhook: firma no coincide (modo aviso, se procesa igual) · recibida ${recibida.slice(0, 14)}… · calculada ${calculada.slice(0, 14)}… · largo ${cuerpoCrudo.length} · largo clave ${secreto.length} · coincide re-serializado: ${coincideReserializado}`);
  }
  let body;
  try { body = JSON.parse(cuerpoCrudo); } catch { return new Response('', { status: 400 }); }
  const res = respuesta();
  await handler({ method: 'POST', body }, res);
  return res.aResponse();
}
