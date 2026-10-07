// Cálculo del pedido en el servidor.
// El navegador solo dice QUÉ se compra (producto, variante, cantidad, tipo de envío y código);
// los precios, el envío y el descuento se calculan acá con los datos reales de Firebase.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { GoogleAuth } from 'google-auth-library';

export const DB_URL = 'https://sendera-34791-default-rtdb.firebaseio.com';

const COSTO_ENVIO_MONTEVIDEO = 200;
const MAX_UNIDADES_POR_ITEM = 20;
const MAX_ITEMS = 30;

export async function getFirebaseToken() {
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
}

async function fbGet(path, token) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`No se pudo leer ${path} (${res.status})`);
  return res.json();
}

// Error que se le puede mostrar al cliente (pedido inválido), distinto de una falla interna
export class PedidoInvalido extends Error {}

function texto(v) {
  return String(v ?? '').trim();
}

// Precio real de cada producto + variante, tal como está cargado en el panel (con el descuento del producto)
function indexarPrecios(productos) {
  const precios = new Map();
  for (const prod of Object.values(productos || {})) {
    if (!prod || typeof prod !== 'object') continue;
    const variantes = Array.isArray(prod.variantes) ? prod.variantes : Object.values(prod.variantes || {});
    // Mismo cálculo que precioFinal() en cart.js: si difieren, la tienda muestra un precio y se cobra otro
    const descuento = Math.min(90, Math.max(0, parseInt(prod.descuento, 10) || 0));
    for (const v of variantes) {
      if (!v || typeof v !== 'object') continue;
      const base = Number(v.precio ?? prod.precio);
      if (!Number.isFinite(base) || base <= 0) continue;
      const precio = Math.round(base * (100 - descuento) / 100);
      precios.set(`${texto(prod.nombre)}\u0000${texto(v.nombre)}`, precio);
    }
  }
  return precios;
}

// Envío: solo Montevideo tiene costo; interior lo paga el comprador en la agencia y el retiro es gratis
function calcularEnvio(envio) {
  const tipo = texto(envio?.tipo).toLowerCase();
  const label = texto(envio?.label).slice(0, 200);
  const esMontevideo = tipo === 'montevideo' || (!tipo && /montevideo/i.test(label));
  return { costo: esMontevideo ? COSTO_ENVIO_MONTEVIDEO : 0, label: label || '—', tipo };
}

/**
 * Recalcula el pedido con precios reales.
 * @param {object} body  cuerpo que manda el checkout (items, envio, codigo)
 * @param {string} token token de Firebase (cuenta de servicio)
 * @returns {{ items, subtotal, envio, descuento, codigo, total }}
 */
export async function calcularPedido(body, token) {
  const itemsIn = Array.isArray(body?.items) ? body.items : [];
  if (!itemsIn.length) throw new PedidoInvalido('El carrito está vacío.');
  if (itemsIn.length > MAX_ITEMS) throw new PedidoInvalido('Demasiados productos en el pedido.');

  const precios = indexarPrecios(await fbGet('productos', token));

  const items = itemsIn.map(i => {
    // El carrito usa name/variant y el checkout nombre/variante: se aceptan los dos
    const nombre = texto(i?.nombre ?? i?.name);
    const variante = texto(i?.variante ?? i?.variant);
    const qty = parseInt(i?.qty, 10);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_UNIDADES_POR_ITEM) {
      throw new PedidoInvalido(`Cantidad inválida para ${nombre}.`);
    }
    const precio = precios.get(`${nombre}\u0000${variante}`);
    if (!precio) throw new PedidoInvalido(`El producto "${nombre} ${variante}" ya no está disponible.`);
    return { nombre, variante, qty, precio };
  });

  const subtotal = items.reduce((s, i) => s + i.precio * i.qty, 0);
  const envio = calcularEnvio(body?.envio);

  // Código de descuento: se valida acá, igual que lo hace el checkout (porcentaje sobre productos + envío, o monto fijo)
  let descuento = 0;
  let codigo = texto(body?.codigo).toUpperCase();
  if (codigo) {
    if (!/^[A-Z0-9_-]{1,40}$/.test(codigo)) throw new PedidoInvalido('Código de descuento inválido.');
    const dato = await fbGet(`codigos_descuento/${encodeURIComponent(codigo)}`, token);
    if (!dato || !dato.activo) throw new PedidoInvalido('El código de descuento no es válido.');
    const valor = Number(dato.descuento) || 0;
    descuento = dato.tipo === 'porcentaje'
      ? Math.round((subtotal + envio.costo) * valor / 100)
      : valor;
    descuento = Math.min(Math.max(0, descuento), subtotal + envio.costo);
  } else {
    codigo = '';
  }

  const total = Math.max(0, subtotal + envio.costo - descuento);
  return { items, subtotal, envio, descuento, codigo, total };
}
