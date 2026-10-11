const WHATSAPP_NUMBERS = ['59895290959', '59899069384'];

// Mapa nombre+variante → ID de stock
const STOCK_MAP = {
  'Go One More-Blanco':        'gom-blanco',
  'Go One More-Rosa':          'gom-rosa',
  'Go One More-Verde':         'gom-verde',
  'Go One More-Violeta':       'gom-violeta',
  'Trail Cap-Azul':            'trail-azul',
  'Trail Cap-Negro':           'trail-negro',
  'Sunset Flower-Rojo / Amarillo': 'sunset-amarillo',
  'Sunset Flower-Gris / Verde':    'sunset-verde',
  'Gorro Lana Montaña-Negro':  'lana-negro',
  'Gorro Lana Montaña-Azul':   'lana-azul',
  'Gorro Lana Montaña-Rosa':   'lana-rosa',
  'Riñonera Sendera-Senderismo · Trekking': 'rinonera-sendera',
  'Riñonera Running-Trail · Running · Celeste': 'rinonera-celeste',
  'Riñonera Running-Trail · Running · Negra':   'rinonera-negra',
  'Medallero RUN-30cm · Acero · Negro': 'medallero',
  'Porta Celular-Running · Trail':      'porta-celular',
};

// Cache de stock en memoria (se llena desde Firebase)
const stockCache = {};
let stockLoaded = false;

function getStock(id) {
  return stockCache[id] !== undefined ? stockCache[id] : 999;
}

// Escuchar cambios de stock en Firebase en tiempo real
if (typeof db !== 'undefined') {
  db.ref('stock').on('value', snapshot => {
    const data = snapshot.val() || {};
    // IDs conocidos arrancan en 0; Firebase los actualiza si existen
    Object.values(STOCK_MAP).forEach(id => { stockCache[id] = 0; });
    Object.keys(data).forEach(id => { stockCache[id] = data[id]; });
    stockLoaded = true;
    checkStockOnLoad();
  });
}

// Píxel de Meta: alguien agregó un color al carrito (el id es el mismo código del catálogo)
function eventoCarritoMeta(id, nombre, color, precio) {
  try {
    if (window.fbq) fbq('track', 'AddToCart', {
      content_ids: id ? [id] : [], content_type: 'product',
      content_name: `${nombre} ${color}`.trim(), value: Number(precio) || 0, currency: 'UYU'
    });
  } catch (e) {}
}

// Precio con el descuento del producto. Mismo cálculo que api/_pedido.js, que es el que cobra
function precioFinal(precio, descuento) {
  const d = Math.min(90, Math.max(0, parseInt(descuento, 10) || 0));
  return Math.round((Number(precio) || 0) * (100 - d) / 100);
}

// Texto que viene de afuera (el carrito guardado o el link del mail) se muestra como texto, nunca como HTML
function textoSeguro(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pesos(n) {
  return '$' + (Number(n) || 0).toLocaleString('es-UY');
}

// Solo fotos de la tienda: las guardadas aparte (/api/foto), las de la carpeta img o links https
function fotoValida(f) {
  return typeof f === 'string' && /^(\/api\/foto\?h=[a-f0-9]{32}|img\/[\w.\/-]+|https:\/\/[^\s"'<>]+)$/.test(f) ? f : '';
}

// Productos que conoce la página (todos en el inicio, el que se está viendo en producto), para la foto de cada ítem
const productosCarrito = new Map();

function completarFotosCarrito() {
  let cambio = false;
  cart.forEach(item => {
    if (fotoValida(item.foto)) return;
    const p = productosCarrito.get(item.name);
    const v = p && Object.values(p.variantes || {}).find(v => v && v.nombre === item.variant);
    const foto = v && fotoValida((Array.isArray(v.fotos) && v.fotos[0]) || v.foto);
    if (foto) { item.foto = foto; cambio = true; }
  });
  return cambio;
}

// Si cambió un precio o un descuento desde que se agregó al carrito, lo pone al día
function actualizarPreciosCarrito(productos) {
  let cambio = false;
  productos.forEach(p => { if (p && p.nombre) productosCarrito.set(p.nombre, p); });
  if (completarFotosCarrito()) cambio = true;
  cart.forEach(item => {
    const p = productos.find(p => p && p.nombre === item.name);
    const v = p && Object.values(p.variantes || {}).find(v => v && v.nombre === item.variant);
    if (!v) return;
    const precio = precioFinal(v.precio || p.precio, p.descuento);
    if (precio && precio !== item.price) { item.price = precio; cambio = true; }
  });
  if (cambio) { saveCart(); updateCartUI(); }
}

let cart = (function() {
  // Al volver de Mercado Pago con el pago aprobado (?pago=ok), la compra ya se hizo: carrito vacío
  try {
    if (new URLSearchParams(location.search).get('pago') === 'ok') {
      localStorage.removeItem('sendera_cart');
      localStorage.removeItem('sendera_checkout');
    }
  } catch(e) {}
  try { return JSON.parse(localStorage.getItem('sendera_cart') || '[]'); } catch(e) { return []; }
})();

function saveCart() {
  try { localStorage.setItem('sendera_cart', JSON.stringify(cart)); } catch(e) {}
}

function cardChangeQty(btn, delta) {
  const card = btn.closest('.producto-card');
  const info = card.querySelector('.producto-info');
  const name = info.querySelector('h3').textContent.trim();
  const variant = info.querySelector('.producto-colores').textContent.trim();
  const priceEl = info.querySelector('.precio');
  const price = parseInt(priceEl.textContent.replace(/\D/g, ''));

  const qtyControl = card.querySelector('.qty-control');
  const minusBtn = qtyControl.querySelector('.qty-minus');
  const plusBtn = qtyControl.querySelector('.qty-plus');
  const qtyNum = qtyControl.querySelector('.qty-num');

  let existing = cart.find(i => i.name === name && i.variant === variant);

  if (delta > 0) {
    // Verificar stock disponible
    const stockId = STOCK_MAP[name + '-' + variant];
    const stockDisponible = stockId ? getStock(stockId) : 999;
    const enCarrito = existing ? existing.qty : 0;
    if (enCarrito >= stockDisponible) {
      showCartError('No hay más unidades disponibles de este producto.');
      return;
    }
    if (existing) {
      existing.qty++;
    } else {
      // id: el código del color, el mismo del catálogo de Meta
      existing = { name, variant, price, qty: 1, id: stockId || '' };
      cart.push(existing);
    }
    eventoCarritoMeta(stockId, name, variant, price);
  } else {
    if (existing) {
      existing.qty--;
      if (existing.qty <= 0) {
        cart.splice(cart.indexOf(existing), 1);
        existing = null;
      }
    }
  }

  const qty = existing ? existing.qty : 0;
  if (qty > 0) {
    qtyNum.textContent = qty;
    qtyNum.style.display = 'inline';
    minusBtn.style.display = 'inline-flex';
    if (plusBtn && plusBtn.classList.contains('btn-agregar')) {
      plusBtn.textContent = '+';
      plusBtn.classList.add('btn-agregar--compact');
    }
  } else {
    qtyNum.style.display = 'none';
    minusBtn.style.display = 'none';
    if (plusBtn && plusBtn.classList.contains('btn-agregar')) {
      plusBtn.textContent = 'Agregar al carrito';
      plusBtn.classList.remove('btn-agregar--compact');
    }
  }

  saveCart();
  updateCartUI();
  if (delta > 0) showCartNotification();
}

function addToCart(btn) {
  cardChangeQty(btn, 1);
}

function removeFromCart(index) {
  const item = cart[index];
  if (item.btn) {
    const qtyEl = item.btn.querySelector('.btn-cart-qty');
    qtyEl.textContent = '0';
    qtyEl.style.display = 'none';
  }
  cart.splice(index, 1);
  saveCart();
  updateCartUI();
}

function changeQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) {
    removeFromCart(index);
  } else {
    if (cart[index].btn) {
      const qtyEl = cart[index].btn.querySelector('.btn-cart-qty');
      qtyEl.textContent = cart[index].qty;
      qtyEl.style.display = 'flex';
    }
    saveCart();
    updateCartUI();
  }
}

function getTotal() {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function getEnvio() {
  const sel = document.querySelector('input[name="envio"]:checked');
  if (!sel) return { tipo: null, costo: 0, label: '' };
  if (sel.value === 'montevideo') return { tipo: 'montevideo', costo: 200, label: 'Montevideo · $200' };
  if (sel.value === 'interior')  return { tipo: 'interior',  costo: 0,   label: 'Interior · Por agencia (a cargo del comprador)' };
  if (sel.value === 'pickup')    return { tipo: 'pickup',    costo: 0,   label: 'Pick up · Cordón (con coordinación previa)' };
  return { tipo: null, costo: 0, label: '' };
}

// Totales del pie del carrito (con el envío elegido)
function pintarTotalesCarrito() {
  const subtotal = getTotal();
  const envio = getEnvio();
  document.getElementById('cart-subtotal').textContent = pesos(subtotal);
  document.getElementById('cart-total').textContent = pesos(subtotal + envio.costo);
  const envioRow = document.getElementById('envio-row');
  const textoEnvio = { montevideo: pesos(envio.costo), interior: 'A cargo del comprador', pickup: 'Gratis' }[envio.tipo];
  envioRow.style.display = textoEnvio ? 'flex' : 'none';
  if (textoEnvio) document.getElementById('cart-envio-label').textContent = textoEnvio;
}

function updateEnvio() {
  const envio = getEnvio();
  pintarTotalesCarrito();
  document.querySelector('.carrito .envio-section')?.classList.remove('falta');

  // Mostrar/ocultar campos según opción
  document.getElementById('campos-montevideo').style.display = envio.tipo === 'montevideo' ? 'block' : 'none';
  document.getElementById('campos-interior').style.display  = envio.tipo === 'interior'   ? 'block' : 'none';

  // Limpiar campos al cambiar
  if (envio.tipo !== 'montevideo') document.getElementById('envio-direccion').value = '';
  if (envio.tipo !== 'interior') {
    document.getElementById('envio-ciudad').value = '';
    document.getElementById('envio-domicilio-interior').style.display = 'none';
    document.getElementById('envio-domicilio-interior').value = '';
    document.querySelectorAll('input[name="interior-tipo"]').forEach(r => r.checked = false);
  }
}

function toggleDomicilioInterior() {
  const sel = document.querySelector('input[name="interior-tipo"]:checked');
  const campo = document.getElementById('envio-domicilio-interior');
  campo.style.display = (sel && sel.value === 'domicilio') ? 'block' : 'none';
}

// Escuchar cambios en interior-tipo para mostrar/ocultar domicilio
document.addEventListener('change', function(e) {
  if (e.target.name === 'interior-tipo') toggleDomicilioInterior();
});

function syncCardsWithCart() {
  document.querySelectorAll('.producto-card').forEach(card => {
    const info = card.querySelector('.producto-info');
    if (!info) return;
    const name = (info.querySelector('h3') || {}).textContent?.trim();
    const variant = (info.querySelector('.producto-colores') || {}).textContent?.trim();
    if (!name || !variant) return;

    const qtyControl = card.querySelector('.qty-control');
    if (!qtyControl) return;
    const minusBtn = qtyControl.querySelector('.qty-minus');
    const plusBtn = qtyControl.querySelector('.qty-plus');
    const qtyNum = qtyControl.querySelector('.qty-num');

    const item = cart.find(i => i.name === name && i.variant === variant);
    const qty = item ? item.qty : 0;

    if (qty > 0) {
      if (qtyNum) { qtyNum.textContent = qty; qtyNum.style.display = 'inline'; }
      if (minusBtn) minusBtn.style.display = 'inline-flex';
      if (plusBtn && plusBtn.classList.contains('btn-agregar')) {
        plusBtn.textContent = '+';
        plusBtn.classList.add('btn-agregar--compact');
      }
    } else {
      if (qtyNum) qtyNum.style.display = 'none';
      if (minusBtn) minusBtn.style.display = 'none';
      if (plusBtn && plusBtn.classList.contains('btn-agregar')) {
        plusBtn.textContent = 'Agregar al carrito';
        plusBtn.classList.remove('btn-agregar--compact');
      }
    }
  });
}

function updateCartUI() {
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-count').style.display = count > 0 ? 'flex' : 'none';

  const modal = document.getElementById('cart-modal');
  if (modal) modal.classList.toggle('carrito--vacio', cart.length === 0);
  const cuenta = document.getElementById('carrito-cuenta');
  if (cuenta) cuenta.textContent = count ? `${count} ${count === 1 ? 'producto' : 'productos'}` : '';
  if (completarFotosCarrito()) saveCart();

  const itemsEl = document.getElementById('cart-items');
  if (cart.length === 0) {
    itemsEl.innerHTML = `
      <div class="carrito-vacio">
        ${ICONOS_CARRITO.bolsa}
        <p class="carrito-vacio-titulo">Tu carrito está vacío</p>
        <p class="carrito-vacio-texto">Elegí tus productos y aparecen acá.</p>
        <a class="carrito-vacio-btn" href="index.html#productos" onclick="closeCart()">Ver productos</a>
      </div>`;
  } else {
    itemsEl.innerHTML = cart.map((item, i) => {
      const nombre = textoSeguro(item.name), color = textoSeguro(item.variant);
      const foto = fotoValida(item.foto);
      return `
      <div class="cart-item">
        <div class="cart-item-foto">${foto ? `<img src="${textoSeguro(foto)}" alt="" loading="lazy" decoding="async" />` : ICONOS_CARRITO.bolsa}</div>
        <div class="cart-item-datos">
          <div class="cart-item-fila">
            <span class="cart-item-name">${nombre}</span>
            <button type="button" class="cart-item-remove" onclick="removeFromCart(${i})" aria-label="Quitar ${nombre} ${color}">${ICONOS_CARRITO.basura}</button>
          </div>
          <span class="cart-item-variant">${color}</span>
          <div class="cart-item-fila">
            <div class="cart-item-controls">
              <button type="button" onclick="changeQty(${i}, -1)" aria-label="Uno menos">−</button>
              <span aria-label="Cantidad">${Number(item.qty) || 0}</span>
              <button type="button" onclick="changeQty(${i}, 1)" aria-label="Uno más">+</button>
            </div>
            <span class="cart-item-price">${pesos(item.price * item.qty)}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  pintarTotalesCarrito();
  syncCardsWithCart();
}

function showCartNotification() {
  const btn = document.getElementById('cart-btn');
  if (!btn) return;
  btn.classList.add('cart-bounce');
  setTimeout(() => btn.classList.remove('cart-bounce'), 400);
}

function showCartError(msg) {
  let toast = document.getElementById('cart-error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cart-error-toast';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#c0392b;color:#fff;padding:12px 20px;border-radius:8px;font-size:0.88rem;z-index:9999;text-align:center;max-width:85vw;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;opacity:0;transition:opacity .25s';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

// ── Panel del carrito ─────────────────────────────────────
// En la compu se abre de costado y en el celular sube desde abajo (carrito.css).
// El inicio y la página de producto usan el mismo: el HTML se arma acá.
const ICONOS_CARRITO = {
  cerrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  basura: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  bolsa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  camion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  mapa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  casa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  candado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};

(function montarCarrito() {
  if (document.getElementById('cart-modal')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div id="cart-overlay" class="carrito-fondo" onclick="closeCart()"></div>
  <aside id="cart-modal" class="carrito carrito--vacio" role="dialog" aria-modal="true" aria-labelledby="carrito-titulo" aria-hidden="true">
    <div class="carrito-cabecera">
      <span class="carrito-manija" aria-hidden="true"></span>
      <div>
        <h2 class="carrito-titulo" id="carrito-titulo">Tu carrito</h2>
        <p class="carrito-cuenta" id="carrito-cuenta"></p>
      </div>
      <button type="button" class="carrito-cerrar" onclick="closeCart()" aria-label="Cerrar el carrito">${ICONOS_CARRITO.cerrar}</button>
    </div>
    <div class="carrito-cuerpo">
      <div id="cart-items"></div>
      <section class="envio-section" aria-labelledby="envio-titulo">
        <h3 class="envio-titulo" id="envio-titulo">Envío</h3>
        <div class="envio-card">
          <label class="envio-opcion">
            <input type="radio" name="envio" value="montevideo" onchange="updateEnvio()" />
            ${ICONOS_CARRITO.camion}
            <span class="envio-info"><span class="envio-nombre">Montevideo</span><span class="envio-detalle">Envío a domicilio</span></span>
            <span class="envio-precio">$200</span>
          </label>
          <div class="envio-campos" id="campos-montevideo" style="display:none;">
            <input type="text" class="envio-input" id="envio-direccion" placeholder="Calle, número y apartamento" aria-label="Dirección de entrega" autocomplete="street-address" />
          </div>
        </div>
        <div class="envio-card">
          <label class="envio-opcion">
            <input type="radio" name="envio" value="interior" onchange="updateEnvio()" />
            ${ICONOS_CARRITO.mapa}
            <span class="envio-info"><span class="envio-nombre">Interior</span><span class="envio-detalle">Por agencia, a cargo del comprador</span></span>
          </label>
          <div class="envio-campos" id="campos-interior" style="display:none;">
            <input type="text" class="envio-input" id="envio-ciudad" placeholder="Ciudad o localidad" aria-label="Ciudad o localidad" autocomplete="address-level2" />
            <div class="envio-radio-group">
              <label class="envio-sub"><input type="radio" name="interior-tipo" value="agencia" /> Retiro en agencia</label>
              <label class="envio-sub"><input type="radio" name="interior-tipo" value="domicilio" /> Entrega a domicilio</label>
            </div>
            <input type="text" class="envio-input" id="envio-domicilio-interior" placeholder="Dirección de entrega" aria-label="Dirección de entrega" autocomplete="street-address" style="display:none;" />
          </div>
        </div>
        <div class="envio-card">
          <label class="envio-opcion">
            <input type="radio" name="envio" value="pickup" onchange="updateEnvio()" />
            ${ICONOS_CARRITO.casa}
            <span class="envio-info"><span class="envio-nombre">Retiro en Cordón</span><span class="envio-detalle">Coordinando antes</span></span>
            <span class="envio-precio">Gratis</span>
          </label>
        </div>
      </section>
    </div>
    <div class="carrito-pie">
      <div class="cart-total-row"><span>Subtotal</span><span id="cart-subtotal">$0</span></div>
      <div class="cart-total-row envio-row" id="envio-row" style="display:none;"><span>Envío</span><span id="cart-envio-label"></span></div>
      <div class="cart-total-row total-final"><span>Total</span><span id="cart-total">$0</span></div>
      <button type="button" class="btn-mp" onclick="pagarMP()">${ICONOS_CARRITO.candado} Ir a pagar</button>
      <p class="cart-note">En el siguiente paso elegís cómo pagar.</p>
    </div>
  </aside>`);

  // En el celular se puede cerrar deslizando la hoja hacia abajo desde la cabecera
  const modal = document.getElementById('cart-modal');
  const cabecera = modal.querySelector('.carrito-cabecera');
  let y0 = null, dy = 0;
  cabecera.addEventListener('touchstart', e => {
    if (!matchMedia('(max-width: 640px)').matches) return;
    y0 = e.touches[0].clientY; dy = 0; modal.style.transition = 'none';
  }, { passive: true });
  cabecera.addEventListener('touchmove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    modal.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  cabecera.addEventListener('touchend', () => {
    if (y0 === null) return;
    y0 = null;
    modal.style.transition = '';
    modal.style.transform = '';
    if (dy > 90) closeCart();
  });
})();

let focoAntesDelCarrito = null;

function abrirCarrito() {
  const modal = document.getElementById('cart-modal');
  if (modal.classList.contains('open')) return;
  focoAntesDelCarrito = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('cart-overlay').classList.add('open');
  document.documentElement.classList.add('carrito-abierto');
  setTimeout(() => modal.querySelector('.carrito-cerrar').focus({ preventScroll: true }), 60);
}

function toggleCart() {
  if (document.getElementById('cart-modal').classList.contains('open')) closeCart();
  else abrirCarrito();
}

function closeCart() {
  const modal = document.getElementById('cart-modal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('cart-overlay').classList.remove('open');
  document.documentElement.classList.remove('carrito-abierto');
  if (focoAntesDelCarrito && focoAntesDelCarrito.focus) focoAntesDelCarrito.focus({ preventScroll: true });
  focoAntesDelCarrito = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCart();
});

// Marca lo que falta completar para seguir (con el aviso de abajo)
function senalarFaltante(el, msg) {
  showCartError(msg);
  if (!el) return;
  el.classList.remove('falta');
  void el.offsetWidth;
  el.classList.add('falta');
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (el.tagName === 'INPUT') el.focus({ preventScroll: true });
  setTimeout(() => el.classList.remove('falta'), 2500);
}

// Bloquear productos sin stock al cargar
function checkStockOnLoad() {
  document.querySelectorAll('.producto-card').forEach(card => {
    const info = card.querySelector('.producto-info');
    if (!info) return;
    const name = info.querySelector('h3').textContent.trim();
    const variant = info.querySelector('.producto-colores').textContent.trim();
    const stockId = STOCK_MAP[name + '-' + variant];
    if (!stockId) return;
    const stock = getStock(stockId);
    if (stock === 0) {
      const plusBtn = card.querySelector('.qty-plus');
      const qtyControl = card.querySelector('.qty-control');
      if (plusBtn) plusBtn.disabled = true;
      if (qtyControl) {
        qtyControl.innerHTML = '<span class="sin-stock-label">Sin stock</span>';
      }
      const grid = card.closest('.productos-grid');
      if (grid) grid.appendChild(card);
    }
  });
}

async function pagarMP() {
  if (cart.length === 0) { showCartError('Tu carrito está vacío.'); return; }

  const envio = getEnvio();
  const campo = id => document.getElementById(id);
  if (!envio.tipo) { senalarFaltante(document.querySelector('.carrito .envio-section'), 'Elegí cómo querés recibir tu pedido.'); return; }

  // Validar datos de envío completos
  let envioLabel = envio.label;
  if (envio.tipo === 'montevideo') {
    const dir = campo('envio-direccion').value.trim();
    if (!dir) { senalarFaltante(campo('envio-direccion'), 'Escribí la dirección de entrega.'); return; }
    envioLabel = `Montevideo · $200 · ${dir}`;
  } else if (envio.tipo === 'interior') {
    const ciudad = campo('envio-ciudad').value.trim();
    if (!ciudad) { senalarFaltante(campo('envio-ciudad'), 'Escribí tu ciudad o localidad.'); return; }
    const interiorTipo = document.querySelector('input[name="interior-tipo"]:checked');
    if (!interiorTipo) { senalarFaltante(document.querySelector('.carrito .envio-radio-group'), 'Elegí si retirás en la agencia o te lo llevan a tu casa.'); return; }
    if (interiorTipo.value === 'agencia') {
      envioLabel = `Interior · ${ciudad} · Retiro en agencia`;
    } else {
      const domicilio = campo('envio-domicilio-interior').value.trim();
      if (!domicilio) { senalarFaltante(campo('envio-domicilio-interior'), 'Escribí la dirección de entrega.'); return; }
      envioLabel = `Interior · ${ciudad} · Domicilio: ${domicilio}`;
    }
  }

  // Guardar datos en sessionStorage y redirigir a checkout.html
  const checkoutData = {
    items: cart.map(i => ({ name: i.name, variant: i.variant, qty: i.qty, precio: i.price, id: i.id || STOCK_MAP[i.name + '-' + i.variant] || '', foto: fotoValida(i.foto) })),
    envio: { label: envioLabel, costo: envio.costo, tipo: envio.tipo }
  };
  localStorage.setItem('sendera_checkout', JSON.stringify(checkoutData));
  window.location.href = '/checkout.html';
}

function irAProducto(productId, variantIdx) {
  sessionStorage.setItem('sendera_scroll', window.scrollY);
  window.location.href = `producto.html?id=${productId}&v=${variantIdx}`;
}

updateCartUI();
window.addEventListener('load', checkStockOnLoad);
