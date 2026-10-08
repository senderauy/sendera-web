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

// Foto de una variante de producto: base64, https o rutas del sitio; cualquier otra cosa no se muestra
function fotoVariante(v) {
  const f = String((v && ((v.fotos && v.fotos[0]) || v.foto)) || '').trim();
  if (/^(data:image\/[a-z+.-]+;base64,|https:\/\/|\/)/i.test(f)) return f;
  // Rutas cargadas sin barra inicial (img/...) se buscan desde la raíz de la tienda
  return /^[\w-][\w\-./]*$/.test(f) && !f.includes('..') ? '/' + f : '';
}

// Las fotos guardadas en base64 se convierten una sola vez en una dirección corta del navegador (blob:),
// así una lista con muchas miniaturas no repite la imagen entera en cada fila
const fotosLivianas = new Map();
function fotoLiviana(f) {
  f = String(f || '');
  if (!f.startsWith('data:')) return f;
  if (!fotosLivianas.has(f)) {
    let url = '';
    try {
      const coma = f.indexOf(',');
      const bin = atob(f.slice(coma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([bytes], { type: f.slice(5, coma).split(';')[0] || 'image/jpeg' }));
    } catch (e) { url = ''; }
    fotosLivianas.set(f, url);
  }
  return fotosLivianas.get(f);
}

// Celular en formato internacional para wa.me, igual que en el servidor: 099 123 456 → 59899123456
function celularWA(celular) {
  const d = String(celular ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('598')) return d;
  return '598' + (d.startsWith('0') ? d.slice(1) : d);
}

function logout() {
  firebase.auth().signOut().then(() => location.replace('login.html'));
}
