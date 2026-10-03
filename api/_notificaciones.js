// Envío de confirmaciones al cliente (WhatsApp y email) y notificaciones push a los admins.
// Solo se usa desde el servidor (webhooks y /api/confirmar-pedido): ya no hay endpoints públicos
// que manden mensajes con datos que elige quien llama.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import webpush from 'web-push';
import { DB_URL } from './_pedido.js';

const PHONE_NUMBER_ID = '1159269003943325';
const VAPID_PUBLIC_KEY = 'BA4NqXXi5tqqH2ZT6Yg8mx35MAAC_EJRgo-7-JpynTGImlQua3mAcryr4hNPlh0kIFjeMWxUJtmQXoOrmbxmMOQ';
const AVISO_AUTOMATICO = '⚠️ Este es un mensaje automático. Para consultas escribinos al 095 290 959.';

function texto(v, max = 500) {
  return String(v ?? '').slice(0, max);
}

function escaparHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function normalizarCelular(raw) {
  const digitos = String(raw ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('598')) return digitos;
  if (digitos.startsWith('0')) return '598' + digitos.slice(1);
  return '598' + digitos;
}

function mensajeEnvio(envio) {
  const e = String(envio || '').toLowerCase();
  if (e.includes('interior')) return 'Te avisaremos cuando sea despachado. 📦';
  if (e.includes('pick up') || e.includes('retiro')) return 'Nos contactamos para coordinar el retiro. 🏔️';
  if (e.includes('montevideo')) return 'Nos contactamos para coordinar la entrega. 🚴';
  return '';
}

export function lineasProductos(productos) {
  return (Array.isArray(productos) ? productos : [])
    .slice(0, 30)
    .map(p => `• ${texto(p?.nombre, 80)} - ${texto(p?.variante, 80)} x${parseInt(p?.qty, 10) || 1}`)
    .join('\n');
}

// WhatsApp automático de confirmación (plantilla aprobada por Meta "confirmacion_pedido")
export async function enviarWhatsAppConfirmacion({ celular, cliente, productos, total, envio }) {
  const token = process.env.WHATSAPP_TOKEN;
  const to = normalizarCelular(celular);
  if (!token || !/^\d{8,15}$/.test(to)) return false;
  const envioTxt = mensajeEnvio(envio);
  const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: 'confirmacion_pedido',
        language: { code: 'es' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: texto(cliente || 'Cliente', 80) },
            { type: 'text', text: texto(productos || '—', 900) },
            { type: 'text', text: texto(total || '0', 30) },
            { type: 'text', text: (envioTxt ? envioTxt + ' | ' : '') + AVISO_AUTOMATICO }
          ]
        }]
      }
    })
  });
  if (!res.ok) {
    console.error('WhatsApp confirmación: la API respondió', res.status);
    return false;
  }
  return true;
}

// Email de confirmación (Resend). Todo lo que viene del pedido se escapa antes de ir al HTML.
export async function enviarEmailConfirmacion({ email, cliente, productos, total, envio }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = texto(email, 120).trim();
  if (!apiKey || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) return false;

  const productosHtml = String(productos || '')
    .split('\n')
    .filter(Boolean)
    .map(l => `<li style="padding:4px 0;color:#6b5f54">${escaparHtml(l.replace('• ', ''))}</li>`)
    .join('');
  const envioTxt = mensajeEnvio(envio);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f2ede6;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2ede6;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1.5px solid #e8dfd2">
        <tr>
          <td style="background:#3a3026;padding:32px;text-align:center">
            <p style="margin:0;font-size:22px;letter-spacing:0.2em;color:#fff;font-weight:300">SENDERA</p>
            <p style="margin:6px 0 0;font-size:11px;letter-spacing:0.12em;color:#b8a898;text-transform:uppercase">Confirmación de pedido</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px">
            <p style="margin:0 0 8px;font-size:18px;color:#3a3026;font-weight:600">Hola ${escaparHtml(texto(cliente, 80))}! 👋</p>
            <p style="margin:0 0 28px;font-size:14px;color:#7a6e62;line-height:1.6">Tu pedido está en preparación. Gracias por elegirnos.</p>
            <div style="background:#faf8f4;border-radius:10px;padding:20px 24px;margin-bottom:24px;border:1px solid #e8dfd2">
              <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#9a8f82;font-weight:600">Productos</p>
              <ul style="margin:0;padding-left:16px;list-style:disc">${productosHtml}</ul>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="font-size:13px;color:#9a8f82">Envío</td>
                <td align="right" style="font-size:13px;color:#3a3026;font-weight:500">${escaparHtml(texto(envio || '—', 200))}</td>
              </tr>
              <tr><td colspan="2" style="height:10px"></td></tr>
              <tr>
                <td style="font-size:16px;color:#3a3026;font-weight:600">Total</td>
                <td align="right" style="font-size:22px;color:#507a3a;font-weight:700">$${escaparHtml(texto(total, 30))}</td>
              </tr>
            </table>
            ${envioTxt ? `<p style="margin:0 0 28px;font-size:13px;color:#507a3a;background:#f0faf4;border-radius:8px;padding:12px 16px;border:1px solid #b8dba8">${escaparHtml(envioTxt)}</p>` : ''}
            <p style="margin:0;font-size:13px;color:#9a8f82;line-height:1.6">Cualquier consulta respondenos por WhatsApp o Instagram.<br/>¡Muchas gracias! 🏔️</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f2ede6;padding:20px 40px;text-align:center;border-top:1px solid #e8dfd2">
            <p style="margin:0;font-size:11px;color:#9a8f82;letter-spacing:0.08em">www.senderauy.com</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Sendera <pedidos@senderauy.com>',
      to: [to],
      subject: '✅ Tu pedido está en preparación — Sendera',
      html
    })
  });
  if (!res.ok) {
    console.error('Email confirmación: Resend respondió', res.status);
    return false;
  }
  return true;
}

// Notificación push a los admins. Las suscripciones que ya no existen (404/410) se borran solas.
export async function notificarAdmins({ cliente, total, envio }, fbToken) {
  if (!process.env.VAPID_PRIVATE_KEY) return 0;
  webpush.setVapidDetails('mailto:edgardott1990@gmail.com', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

  const res = await fetch(`${DB_URL}/push_subscriptions.json`, {
    headers: { 'Authorization': `Bearer ${fbToken}` }
  });
  const subs = (await res.json()) || {};
  const payload = JSON.stringify({
    title: '🛍️ Nuevo pedido Sendera',
    body: `${texto(cliente, 80)} · $${texto(total, 30)} · ${texto(envio, 100)}`,
    icon: '/img/logo.png'
  });

  let enviadas = 0;
  for (const [clave, sub] of Object.entries(subs)) {
    try {
      await webpush.sendNotification(sub, payload, { urgency: 'high', TTL: 3600 });
      enviadas++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        // El navegador ya no tiene esa suscripción: se borra para no reintentar en cada pedido
        await fetch(`${DB_URL}/push_subscriptions/${encodeURIComponent(clave)}.json`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${fbToken}` }
        }).catch(() => {});
      } else {
        console.error('Web push error:', e.statusCode);
      }
    }
  }
  return enviadas;
}
