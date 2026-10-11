// Quién está usando el panel: valida la sesión de Firebase del navegador y que el mail esté en la lista de admins.
// (Los archivos de /api que empiezan con "_" no se publican como endpoint.)
import { DB_URL } from './_pedido.js';

// Clave pública de la app web de Firebase (la misma de firebase-config.js; no es secreta)
const FIREBASE_WEB_API_KEY = 'AIzaSyBp7XddXbOGYTzZD8qusj5MXH-LNdox5gc';

// Valida el token de sesión de Firebase y devuelve el email verificado, o null
export async function emailDeSesion(idToken) {
  if (!idToken) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!res.ok) return null;
  const usuario = (await res.json())?.users?.[0];
  return usuario?.email && usuario.emailVerified ? String(usuario.email).toLowerCase() : null;
}

// ¿Ese mail está en la lista de admins? (las claves de la base no admiten puntos: se guardan con comas)
export async function esAdmin(email, fbToken) {
  const clave = encodeURIComponent(String(email).replace(/\./g, ','));
  const res = await fetch(`${DB_URL}/admins/${clave}.json`, {
    headers: { 'Authorization': `Bearer ${fbToken}` }
  });
  return (await res.json()) === true;
}

// Token de sesión que manda el panel en la cabecera "Authorization: Bearer …"
export function tokenDeSesion(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}
