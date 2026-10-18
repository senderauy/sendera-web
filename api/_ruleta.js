// Ruleta "Girá y ganá" del inicio: a cambio del mail, un código de descuento de un solo uso.
// El premio lo elige el servidor (el navegador solo anima la rueda hasta el gajo que le dicen).
// Cuidados:
//   · un premio por mail (si vuelve a girar, recibe el mismo código) y un límite por conexión al día
//   · "Casi…" da una sola vuelta más, que siempre tiene premio
//   · el código vence en 48 horas y deja de servir apenas se usa en una compra
// Se guarda en ruleta/<mail> (ruta solo del servidor) y el código en codigos_descuento/<código>.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { randomInt } from 'crypto';
import { DB_URL, getFirebaseToken } from './_pedido.js';
import { emailValido, SITIO } from './_seguimiento.js';
import { enviarEmailRuleta } from './_notificaciones.js';

// Mismo orden que los gajos de la rueda en index.html (el índice es el gajo donde frena)
export const GAJOS = [
  { premio: '5', chance: 22 },
  { premio: 'casi', chance: 8 },
  { premio: '10', chance: 12 },
  { premio: '5', chance: 22 },
  { premio: 'envio', chance: 6 },
  { premio: 'casi', chance: 8 },
  { premio: '10', chance: 12 },
  { premio: '5', chance: 10 }
];
const HORAS_DE_VALIDEZ = 48;
const MAX_POR_CONEXION_AL_DIA = 4;
const UN_DIA = 24 * 60 * 60 * 1000;
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // sin 0/O ni 1/I/L, que se confunden

function fb(ruta, token, opciones = {}) {
  return fetch(`${DB_URL}/${ruta}.json`, {
    ...opciones,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
}
const leer = async (ruta, token) => { const r = await fb(ruta, token); return r.ok ? r.json() : null; };
const claveMail = email => email.replace(/[.#$[\]/]/g, ',').slice(0, 120);

function sortear(sinCasi) {
  const opciones = GAJOS.map((g, i) => ({ ...g, i })).filter(g => !(sinCasi && g.premio === 'casi'));
  let r = randomInt(opciones.reduce((s, g) => s + g.chance, 0));
  for (const g of opciones) { if ((r -= g.chance) < 0) return g; }
  return opciones[0];
}

async function dentroDelLimite(ip, token) {
  if (!ip) return true;
  const ruta = `limites_ruleta/${ip.replace(/[^A-Za-z0-9]/g, '_').slice(0, 60)}`;
  const ahora = Date.now();
  const dato = (await leer(ruta, token)) || {};
  const recientes = (Array.isArray(dato.giros) ? dato.giros : []).filter(t => ahora - t < UN_DIA);
  if (recientes.length >= MAX_POR_CONEXION_AL_DIA) return false;
  await fb(ruta, token, { method: 'PUT', body: JSON.stringify({ giros: [...recientes, ahora] }) });
  return true;
}

// Crea un código que no exista todavía (si se cruzan dos, el ETag de Firebase evita pisar uno)
async function crearCodigo(premio, email, token) {
  const vence = new Date(Date.now() + HORAS_DE_VALIDEZ * 60 * 60 * 1000).toISOString();
  const dato = premio === 'envio'
    ? { tipo: 'envio', descuento: 0 }
    : { tipo: 'porcentaje', descuento: Number(premio) };
  for (let intento = 0; intento < 6; intento++) {
    const codigo = 'SENDERA-' + Array.from({ length: 5 }, () => LETRAS[randomInt(LETRAS.length)]).join('');
    const ruta = `codigos_descuento/${codigo}`;
    const actual = await fb(ruta, token, { headers: { 'X-Firebase-ETag': 'true' } });
    const etag = actual.headers.get('etag');
    if ((await actual.json()) !== null || !etag) continue;
    const r = await fb(ruta, token, {
      method: 'PUT', headers: { 'if-match': etag },
      body: JSON.stringify({ ...dato, activo: true, unUso: true, vence, origen: 'ruleta', email, creado: new Date().toISOString() })
    });
    if (r.ok) return { codigo, vence };
  }
  throw new Error('No se pudo crear un código libre');
}

const respuesta = g => ({ gajo: g.i, premio: g.premio });

export async function girarRuleta(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!emailValido(email)) return res.status(400).json({ error: 'Escribí un mail válido.' });
  const token = await getFirebaseToken();
  const ruta = `ruleta/${claveMail(email)}`;
  const previo = await leer(ruta, token);

  // Ya ganó antes con este mail: se le muestra el mismo premio (no se vuelve a sortear)
  if (previo && previo.codigo) {
    return res.status(200).json({ gajo: previo.gajo, premio: previo.premio, codigo: previo.codigo, vence: previo.vence, repetido: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!previo && !(await dentroDelLimite(ip, token))) return res.status(429).json({ error: 'Ya giraste hoy. Probá mañana.' });

  const yaTuvoCasi = !!(previo && previo.casi);
  const g = sortear(yaTuvoCasi);
  if (g.premio === 'casi') {
    await fb(ruta, token, { method: 'PUT', body: JSON.stringify({ email, casi: true, fecha: new Date().toISOString() }) });
    return res.status(200).json({ ...respuesta(g), otraVuelta: true });
  }

  const { codigo, vence } = await crearCodigo(g.premio, email, token);
  await fb(ruta, token, {
    method: 'PUT',
    body: JSON.stringify({ email, casi: yaTuvoCasi, gajo: g.i, premio: g.premio, codigo, vence, fecha: new Date().toISOString() })
  });
  // El botón del mail trae el código: la tienda lo reconoce en cualquier navegador y lo aplica solo
  await enviarEmailRuleta({ email, premio: g.premio, codigo, vence, enlace: `${SITIO}/?premio=${codigo}` })
    .catch(e => console.error('ruleta mail:', e.message));
  return res.status(200).json({ ...respuesta(g), codigo, vence });
}
