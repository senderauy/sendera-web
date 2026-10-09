// Foto de un color con dirección propia: /api/foto?p=<producto>&v=<color>&n=<número de foto>
// Las fotos se guardan en la base como texto base64 y Meta (catálogo) necesita un link de imagen.
// El catálogo agrega &h=<huella de la foto>: si la foto cambia, cambia el link y se vuelve a bajar.
import { DB_URL } from './_pedido.js';

const ID_PRODUCTO = /^[A-Za-z0-9_-]{1,64}$/;
const SITIO = 'https://www.senderauy.com';

export default async function handler(req, res) {
  const p = String(req.query?.p || '');
  const v = Number.parseInt(req.query?.v, 10);
  const n = Number.parseInt(req.query?.n ?? '0', 10);
  if (!ID_PRODUCTO.test(p) || !(v >= 0 && v < 100) || !(n >= 0 && n < 30)) {
    return res.status(400).send('Foto no válida');
  }

  // productos se puede leer sin clave (la tienda lo lee igual); se pide solo ese color
  let variante;
  try {
    const r = await fetch(`${DB_URL}/productos/${p}/variantes/${v}.json`);
    if (!r.ok) throw new Error(String(r.status));
    variante = await r.json();
  } catch (e) {
    console.error('foto: no se pudo leer', p, v, e.message);
    return res.status(502).send('No se pudo leer la foto');
  }

  const fotos = variante && typeof variante === 'object'
    ? (Array.isArray(variante.fotos) && variante.fotos.length ? variante.fotos : (variante.foto ? [variante.foto] : []))
    : [];
  const foto = typeof fotos[n] === 'string' ? fotos[n].trim() : '';
  if (!foto) return res.status(404).send('Sin foto');

  const base64 = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(foto);
  if (base64) {
    res.setHeader('Content-Type', base64[1]);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
    return res.status(200).send(Buffer.from(base64[2], 'base64'));
  }
  // Fotos cargadas como link: se redirige a ese link
  if (/^https:\/\/[^\s"'<>]+$/i.test(foto)) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.redirect(302, foto);
  }
  // Rutas del sitio (img/... o /img/...)
  if (/^\/?[\w-][\w\-./]*$/.test(foto) && !foto.includes('..')) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.redirect(302, `${SITIO}/${foto.replace(/^\//, '')}`);
  }
  return res.status(404).send('Sin foto');
}
