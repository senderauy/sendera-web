// Fotos de la tienda con dirección propia.
//
// /api/foto?h=<huella>  Foto guardada aparte en imagenes/<huella> (así se guardan desde el panel).
//                       La huella sale del contenido de la foto: si la foto cambia, cambia la dirección,
//                       por eso se puede guardar un año en la memoria de Vercel y del navegador.
//
// /api/foto?p=<producto>&v=<color>&n=<número de foto>  Forma vieja, la que usa el catálogo de Meta
//                       para fotos guardadas dentro del producto. Si la foto ya se guardó aparte, la sirve igual.
import { DB_URL } from './_pedido.js';

const ID_PRODUCTO = /^[A-Za-z0-9_-]{1,64}$/;
const HUELLA = /^[a-f0-9]{32}$/;
const FOTO_APARTE = /^\/api\/foto\?h=([a-f0-9]{32})$/;
const SITIO = 'https://www.senderauy.com';

// Manda la foto guardada como texto base64 (solo formatos de foto comunes: nunca SVG ni otra cosa)
function mandarBase64(res, foto, cache) {
  const base64 = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(foto || '').trim());
  if (!base64) return false;
  res.setHeader('Content-Type', base64[1]);
  res.setHeader('Cache-Control', cache);
  res.status(200).send(Buffer.from(base64[2], 'base64'));
  return true;
}

async function fotoAparte(res, huella) {
  let foto;
  try {
    // Cada foto se puede leer sola sin clave; la lista entera no
    const r = await fetch(`${DB_URL}/imagenes/${huella}.json`);
    if (!r.ok) throw new Error(String(r.status));
    foto = await r.json();
  } catch (e) {
    console.error('foto: no se pudo leer la imagen', huella, e.message);
    return res.status(502).send('No se pudo leer la foto');
  }
  if (mandarBase64(res, foto, 'public, max-age=31536000, s-maxage=31536000, immutable')) return;
  return res.status(404).send('Sin foto');
}

// /api/foto?portada=compu|celular  La foto grande del inicio. Se cambia desde el panel (admin/portada.html):
//                       si hay una guardada en portada/<lado>, lleva a esa; si no, a la foto original.
//                       Se guarda pocos minutos en la memoria, así un cambio se ve enseguida.
const PORTADA_ORIGINAL = { compu: '/img/hero-desktop-rio.webp', celular: '/img/hero-mobile.webp' };

async function portada(res, lado) {
  let guardada = '';
  try {
    const r = await fetch(`${DB_URL}/portada/${lado}.json`);
    if (r.ok) guardada = String((await r.json()) || '');
  } catch (e) {
    console.error('foto: no se pudo leer la portada', e.message);
  }
  const aparte = FOTO_APARTE.exec(guardada);
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  return res.redirect(302, aparte ? `/api/foto?h=${aparte[1]}` : PORTADA_ORIGINAL[lado]);
}

export default async function handler(req, res) {
  if (req.query?.portada !== undefined) {
    const lado = String(req.query.portada);
    if (!Object.hasOwn(PORTADA_ORIGINAL, lado)) return res.status(400).send('Foto no válida');
    return portada(res, lado);
  }
  const h = String(req.query?.h || '');
  if (!req.query?.p && HUELLA.test(h)) return fotoAparte(res, h);

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

  // La foto ya se guardó aparte: se sirve directo
  const aparte = FOTO_APARTE.exec(foto);
  if (aparte) return fotoAparte(res, aparte[1]);
  if (mandarBase64(res, foto, 'public, max-age=86400, s-maxage=31536000, immutable')) return;
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
