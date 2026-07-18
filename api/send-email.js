export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { to, cliente, productos, total, envio } = req.body;
  if (!to || !cliente) return res.status(400).json({ error: 'Faltan datos' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY no configurado' });

  function envioTexto(e) {
    const s = String(e || '').toLowerCase();
    if (s.includes('interior')) return 'Te avisaremos cuando sea despachado. 📦';
    if (s.includes('pick up') || s.includes('retiro')) return 'Nos contactamos para coordinar el retiro.';
    if (s.includes('montevideo')) return 'Nos contactamos para coordinar la entrega.';
    return '';
  }

  const productosHtml = String(productos || '')
    .split('\n')
    .map(l => `<li style="padding:4px 0;color:#6b5f54">${l.replace('• ', '')}</li>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f2ede6;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2ede6;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1.5px solid #e8dfd2">
        <!-- Header -->
        <tr>
          <td style="background:#3a3026;padding:32px;text-align:center">
            <p style="margin:0;font-size:22px;letter-spacing:0.2em;color:#fff;font-weight:300">SENDERA</p>
            <p style="margin:6px 0 0;font-size:11px;letter-spacing:0.12em;color:#b8a898;text-transform:uppercase">Confirmación de pedido</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px">
            <p style="margin:0 0 8px;font-size:18px;color:#3a3026;font-weight:600">Hola ${cliente}! 👋</p>
            <p style="margin:0 0 28px;font-size:14px;color:#7a6e62;line-height:1.6">Tu pedido está en preparación. Gracias por elegirnos.</p>

            <div style="background:#faf8f4;border-radius:10px;padding:20px 24px;margin-bottom:24px;border:1px solid #e8dfd2">
              <p style="margin:0 0 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#9a8f82;font-weight:600">Productos</p>
              <ul style="margin:0;padding-left:16px;list-style:disc">${productosHtml}</ul>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="font-size:13px;color:#9a8f82">Envío</td>
                <td align="right" style="font-size:13px;color:#3a3026;font-weight:500">${envio || '—'}</td>
              </tr>
              <tr><td colspan="2" style="height:10px"></td></tr>
              <tr>
                <td style="font-size:16px;color:#3a3026;font-weight:600">Total</td>
                <td align="right" style="font-size:22px;color:#507a3a;font-weight:700">$${total}</td>
              </tr>
            </table>

            ${envioTexto(envio) ? `<p style="margin:0 0 28px;font-size:13px;color:#507a3a;background:#f0faf4;border-radius:8px;padding:12px 16px;border:1px solid #b8dba8">${envioTexto(envio)}</p>` : ''}

            <p style="margin:0;font-size:13px;color:#9a8f82;line-height:1.6">Cualquier consulta respondenos por WhatsApp o Instagram.<br/>¡Muchas gracias! 🏔️</p>
          </td>
        </tr>
        <!-- Footer -->
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

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Sendera <pedidos@senderauy.com>',
        to: [to],
        subject: '✅ Tu pedido está en preparación — Sendera',
        html
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', JSON.stringify(data));
      return res.status(500).json({ error: data });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('send-email error:', e);
    return res.status(500).json({ error: e.message });
  }
}
