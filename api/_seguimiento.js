// Seguimiento del pedido para el cliente.
// El link lleva el id del pedido y un código al azar que solo tiene quien recibió el mail:
// con el id solo no alcanza para ver un pedido.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { randomBytes, timingSafeEqual } from 'crypto';
import { DB_URL } from './_pedido.js';

export const SITIO = 'https://www.senderauy.com';

// Las claves de Firebase (push) son de 20 caracteres de este alfabeto
export const idValido = id => /^[A-Za-z0-9_-]{15,40}$/.test(String(id ?? ''));
export const codigoValido = c => /^[A-Za-z0-9_-]{16,40}$/.test(String(c ?? ''));
export const emailValido = e => String(e ?? '').length <= 120 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(e ?? '').trim());

export const nuevoCodigo = () => randomBytes(12).toString('base64url');

// Foto del comprobante del envío por agencia: se sube desde el panel y queda como /api/foto?h=<huella>.
// Devuelve la huella, o '' si el pedido no tiene una válida.
export function huellaComprobanteEnvio(pedido) {
  const m = /^\/api\/foto\?h=([a-f0-9]{32})$/.exec(String(pedido?.envioComprobante ?? ''));
  return m ? m[1] : '';
}
export const fotoComprobanteEnvio = huella => `${SITIO}/api/foto?h=${huella}`;

export function enlaceSeguimiento(id, codigo) {
  return `${SITIO}/seguimiento?p=${encodeURIComponent(id)}&c=${encodeURIComponent(codigo)}`;
}

// Compara el código guardado con el del link sin dar pistas por el tiempo que tarda
export function mismoCodigo(guardado, recibido) {
  const a = Buffer.from(String(guardado ?? '')), b = Buffer.from(String(recibido ?? ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// Cómo se entrega. El envío se guarda como texto ("Montevideo · $200", "Interior · Por agencia…", "Pick up · Cordón…")
export function entregaDe(envio) {
  const t = String(envio ?? '').toLowerCase();
  // Primero el interior: "Interior · San José · Retiro en agencia" es un envío por agencia, no un retiro en Cordón
  if (t.includes('interior')) return 'interior';
  if (/pick ?up|cord[oó]n|coordinar retiro/.test(t)) return 'retiro';
  if (t.includes('montevideo')) return 'montevideo';
  if (/retir/.test(t)) return 'retiro';
  return 'otro';
}

// En qué parte del recorrido está (los mismos pasos que el panel): 0 recibido, 1 confirmado, 2 en camino, 3 entregado
const PASO_DE_ESTADO = { aprobado: 1, confirmado: 1, camino: 2, entregado: 3 };
export const pasoDe = estado => PASO_DE_ESTADO[estado] || 0;

// Pasos que se le avisan al cliente por mail cuando el panel los marca
const AVISO_DE_ESTADO = { aprobado: 'confirmado', confirmado: 'confirmado', camino: 'camino', entregado: 'entregado' };
export const pasoAvisable = estado => AVISO_DE_ESTADO[estado] || null;

export const primerNombre = cliente => String(cliente ?? '').trim().split(/\s+/)[0].slice(0, 40);

function fb(ruta, token, opciones = {}) {
  return fetch(`${DB_URL}/${ruta}.json`, {
    ...opciones,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
}

// Código del pedido; si todavía no tiene uno, lo crea. Si se crean dos a la vez gana el primero (ETag de Firebase).
export async function asegurarCodigo(id, pedido, token) {
  if (codigoValido(pedido.codigo)) return pedido.codigo;
  const ruta = `pedidos/${id}/codigo`;
  const actual = await fb(ruta, token, { headers: { 'X-Firebase-ETag': 'true' } });
  const etag = actual.headers.get('etag');
  const guardado = await actual.json();
  if (codigoValido(guardado)) return (pedido.codigo = guardado);
  const codigo = nuevoCodigo();
  const res = await fb(ruta, token, { method: 'PUT', body: JSON.stringify(codigo), headers: etag ? { 'if-match': etag } : {} });
  if (res.ok) return (pedido.codigo = codigo);
  const otro = await (await fb(ruta, token)).json();
  if (codigoValido(otro)) return (pedido.codigo = otro);
  throw new Error('No se pudo guardar el código de seguimiento');
}

// Guarda un valor solo si ese lugar está vacío. Si dos llegan juntos gana el primero (ETag de Firebase).
export async function ponerSiVacio(ruta, valor, token) {
  const actual = await fb(ruta, token, { headers: { 'X-Firebase-ETag': 'true' } });
  const etag = actual.headers.get('etag');
  if ((await actual.json()) != null || !etag) return false;
  const res = await fb(ruta, token, { method: 'PUT', body: JSON.stringify(valor), headers: { 'if-match': etag } });
  return res.ok; // 412 = otro lo guardó primero
}

// Anota que al cliente ya se le avisó de este paso. Devuelve false si ya estaba anotado: así el mail no se repite.
export function marcarAviso(id, paso, token) {
  return ponerSiVacio(`pedidos/${id}/avisos/${paso}`, new Date().toISOString(), token);
}

// Si el mail no salió, se borra la marca para que se pueda volver a intentar
export async function desmarcarAviso(id, paso, token) {
  await fb(`pedidos/${id}/avisos/${paso}`, token, { method: 'DELETE' }).catch(() => {});
}

// Anota qué foto del comprobante del envío ya le llegó por mail (si se cambia la foto, la nueva se puede mandar)
export async function anotarComprobanteAvisado(id, huella, token) {
  await fb(`pedidos/${id}/avisos/comprobante`, token, { method: 'PUT', body: JSON.stringify(huella) }).catch(() => {});
}

// Deja anotados los pasos que ya cubrió el mail de confirmación de la compra
export async function anotarAvisos(id, pasos, token) {
  const ahora = new Date().toISOString();
  const datos = Object.fromEntries(pasos.map(p => [p, ahora]));
  await fb(`pedidos/${id}/avisos`, token, { method: 'PATCH', body: JSON.stringify(datos) }).catch(() => {});
}
