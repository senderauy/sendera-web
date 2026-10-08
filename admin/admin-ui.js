// Panel de Sendera: barra lateral, menú del celular, avisos y confirmaciones propias.
// Cada página del admin lo carga después de admin-auth.js; el menú se arma acá para que sea igual en todas.
(function () {
  const PAGINAS = [
    ['dashboard.html', 'Inicio', 'house'],
    ['pedidos.html', 'Pedidos', 'package'],
    ['productos.html', 'Productos', 'tag'],
    ['stock.html', 'Stock', 'boxes'],
    null,
    ['colecciones.html', 'Colecciones', 'layers'],
    ['lookbook.html', 'Lookbook', 'image'],
    ['finanzas.html', 'Finanzas', 'wallet']
  ];
  const ANALYTICS = 'https://analytics.google.com';
  const actual = location.pathname.split('/').pop() || 'dashboard.html';
  const contador = href => href === 'pedidos.html' ? '<span class="sa-contador" data-sa-pendientes hidden></span>' : '';
  const activo = href => href === actual ? ' class="activo" aria-current="page"' : '';

  function armar() {
    document.body.classList.add('sa');

    const lateral = document.createElement('aside');
    lateral.className = 'sa-lateral';
    lateral.setAttribute('aria-label', 'Menú del panel');
    lateral.innerHTML = `
      <a class="sa-marca" href="dashboard.html"><img src="/img/logo-crema.png" alt="Sendera" /></a>
      <nav class="sa-nav">
        ${PAGINAS.map(p => p
          ? `<a href="${p[0]}"${activo(p[0])}><i data-lucide="${p[2]}"></i>${p[1]}${contador(p[0])}</a>`
          : '<div class="sa-separador"></div>').join('')}
        <a href="${ANALYTICS}" target="_blank" rel="noopener"><i data-lucide="chart-line"></i>Analytics<i data-lucide="external-link" class="sa-externo"></i></a>
      </nav>
      <div class="sa-cuenta">
        <span class="sa-avatar" data-sa-inicial>S</span>
        <div><b>Sendera</b><span data-sa-mail></span></div>
        <button type="button" onclick="logout()" aria-label="Salir"><i data-lucide="log-out"></i></button>
      </div>`;

    const tope = document.createElement('header');
    tope.className = 'sa-tope';
    tope.innerHTML = '<a href="dashboard.html"><img src="/img/logo-crema.png" alt="Sendera" /></a><span class="sa-avatar" data-sa-inicial>S</span>';

    const enMas = ['colecciones.html', 'lookbook.html', 'finanzas.html'].includes(actual);
    const barra = document.createElement('nav');
    barra.className = 'sa-barra';
    barra.setAttribute('aria-label', 'Menú');
    barra.innerHTML = PAGINAS.slice(0, 4)
      .map(p => `<a href="${p[0]}"${activo(p[0])}><i data-lucide="${p[2]}"></i>${p[1]}${contador(p[0])}</a>`).join('') +
      `<button type="button" data-sa-mas${enMas ? ' class="activo"' : ''}><i data-lucide="ellipsis"></i>Más</button>`;

    const velo = document.createElement('div');
    velo.className = 'sa-velo';
    const hoja = document.createElement('div');
    hoja.className = 'sa-hoja';
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-label', 'Más secciones');
    hoja.innerHTML = '<div class="sa-agarre"></div>' +
      PAGINAS.slice(5).map(p => `<a href="${p[0]}"><i data-lucide="${p[2]}"></i>${p[1]}</a>`).join('') +
      `<a href="${ANALYTICS}" target="_blank" rel="noopener"><i data-lucide="chart-line"></i>Analytics</a>
       <button type="button" class="salir" onclick="logout()"><i data-lucide="log-out"></i>Salir</button>`;

    const aviso = document.createElement('div');
    aviso.className = 'sa-aviso';
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = '<i data-lucide="circle-check"></i><span></span>';

    const dialogo = document.createElement('dialog');
    dialogo.className = 'sa-dialogo';
    // Marca propia: una página puede tener otros diálogos con el mismo estilo
    dialogo.setAttribute('data-sa-confirmar', '');
    dialogo.innerHTML = '<h3></h3><p></p><div class="sa-acciones"><button type="button" class="sa-boton-sec" data-sa-no>Cancelar</button><button type="button" class="sa-boton" data-sa-si></button></div>';

    document.body.prepend(lateral, tope);
    document.body.append(barra, velo, hoja, aviso, dialogo);

    const mostrarHoja = si => { hoja.classList.toggle('abierta', si); velo.classList.toggle('visible', si); };
    barra.querySelector('[data-sa-mas]').addEventListener('click', () => mostrarHoja(true));
    velo.addEventListener('click', () => mostrarHoja(false));

    panel.pendientes(ultimosPendientes);
    panel.iconos();
    if (window.firebase && firebase.auth) {
      firebase.auth().onAuthStateChanged(u => {
        if (!u || !u.email) return;
        document.querySelectorAll('[data-sa-mail]').forEach(e => { e.textContent = u.email; });
        document.querySelectorAll('[data-sa-inicial]').forEach(e => { e.textContent = u.email[0].toUpperCase(); });
      });
    }
  }

  let ocultarAviso = null;
  // Los datos pueden llegar antes de que exista el menú: se guarda el número y se muestra al armarlo
  let ultimosPendientes = 0;
  const panel = window.panel = {
    iconos() { if (window.lucide) window.lucide.createIcons(); },

    aviso(texto, error = false) {
      const a = document.querySelector('.sa-aviso');
      if (!a) return;
      a.classList.toggle('error', error);
      a.innerHTML = `<i data-lucide="${error ? 'circle-alert' : 'circle-check'}"></i><span></span>`;
      a.querySelector('span').textContent = texto;
      panel.iconos();
      a.classList.add('visible');
      clearTimeout(ocultarAviso);
      ocultarAviso = setTimeout(() => a.classList.remove('visible'), 2600);
    },

    // Reemplaza a confirm(): devuelve una promesa con true si se confirma
    confirmar({ titulo, texto = '', boton = 'Confirmar', peligro = false }) {
      const d = document.querySelector('dialog[data-sa-confirmar]');
      d.querySelector('h3').textContent = titulo;
      const p = d.querySelector('p');
      p.textContent = texto;
      p.hidden = !texto;
      const si = d.querySelector('[data-sa-si]');
      si.textContent = boton;
      si.classList.toggle('peligro', peligro);
      d.showModal();
      return new Promise(resolver => {
        const cerrar = r => { d.close(); resolver(r); };
        d.querySelector('[data-sa-no]').onclick = () => cerrar(false);
        si.onclick = () => cerrar(true);
        d.oncancel = e => { e.preventDefault(); cerrar(false); };
      });
    },

    pendientes(n) {
      ultimosPendientes = n;
      document.querySelectorAll('[data-sa-pendientes]').forEach(e => { e.textContent = n; e.hidden = !n; });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armar);
  else armar();
})();
