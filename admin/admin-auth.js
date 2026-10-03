// Oculta el panel hasta confirmar que la sesión es de un admin
document.documentElement.style.visibility = 'hidden';

// Las claves de la base no admiten puntos, por eso el mail se guarda con comas
function claveAdmin(email) {
  return (email || '').toLowerCase().replace(/\./g, ',');
}

firebase.auth().onAuthStateChanged(async user => {
  if (!user || !user.emailVerified) return location.replace('login.html');
  const snap = await db.ref('admins/' + claveAdmin(user.email)).once('value').catch(() => null);
  if (!snap || snap.val() !== true) {
    await firebase.auth().signOut();
    return location.replace('login.html');
  }
  document.documentElement.style.visibility = '';
});

// ── Mostrar datos que escriben los clientes sin que se ejecute código ──
// Todo lo que viene de pedidos, reseñas, carritos o WhatsApp pasa por acá antes de ir a innerHTML.
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Para pasar un valor como argumento dentro de onclick="...": queda como texto JS entre comillas
function jsArg(valor) {
  return esc(JSON.stringify(String(valor ?? '')));
}

// Solo deja pasar imágenes guardadas como data:image/... (comprobantes); cualquier otra cosa se descarta
function imgSegura(valor) {
  const v = String(valor || '');
  return /^data:image\/(png|jpe?g|gif|webp|heic|heif);base64,[A-Za-z0-9+/=\s]+$/i.test(v) ? v : '';
}

// Números que se muestran con formato: si no es un número válido se muestra 0
function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function logout() {
  firebase.auth().signOut().then(() => location.replace('login.html'));
}
