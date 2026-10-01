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

function logout() {
  firebase.auth().signOut().then(() => location.replace('login.html'));
}
