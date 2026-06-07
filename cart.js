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

function getStock(id) {
  return stockCache[id] !== undefined ? stockCache[id] : 999;
}

// Escuchar cambios de stock en Firebase en tiempo real
if (typeof db !== 'undefined') {
  db.ref('stock').on('value', snapshot => {
    const data = snapshot.val() || {};
    Object.keys(data).forEach(id => { stockCache[id] = data[id]; });
    checkStockOnLoad();
  });
}

let cart = [];

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
      alert('No hay más unidades disponibles de este producto.');
      return;
    }
    if (existing) {
      existing.qty++;
    } else {
      existing = { name, variant, price, qty: 1 };
      cart.push(existing);
    }
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
  } else {
    qtyNum.style.display = 'none';
    minusBtn.style.display = 'none';
  }

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

function updateEnvio() {
  const subtotal = getTotal();
  const envio = getEnvio();
  const total = subtotal + envio.costo;

  document.getElementById('cart-subtotal').textContent = '$' + subtotal.toLocaleString();
  document.getElementById('cart-total').textContent = '$' + total.toLocaleString();

  const envioRow = document.getElementById('envio-row');
  if (envio.tipo === 'montevideo') {
    envioRow.style.display = 'flex';
    document.getElementById('cart-envio-label').textContent = '$200';
  } else {
    envioRow.style.display = 'none';
  }

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

function updateCartUI() {
  const count = cart.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-count').style.display = count > 0 ? 'flex' : 'none';

  const itemsEl = document.getElementById('cart-items');
  if (cart.length === 0) {
    itemsEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
  } else {
    itemsEl.innerHTML = cart.map((item, i) => `
      <div class="cart-item">
        <div class="cart-item-info">
          <span class="cart-item-name">${item.name}</span>
          <span class="cart-item-variant">${item.variant}</span>
        </div>
        <div class="cart-item-controls">
          <button onclick="changeQty(${i}, -1)">−</button>
          <span>${item.qty}</span>
          <button onclick="changeQty(${i}, 1)">+</button>
        </div>
        <div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div>
        <button class="cart-item-remove" onclick="removeFromCart(${i})">✕</button>
      </div>
    `).join('');
  }

  const subtotal = getTotal();
  const envio = getEnvio();
  document.getElementById('cart-subtotal').textContent = '$' + subtotal.toLocaleString();
  document.getElementById('cart-total').textContent = '$' + (subtotal + envio.costo).toLocaleString();
}

function showCartNotification() {
  const btn = document.getElementById('cart-btn');
  btn.classList.add('cart-bounce');
  setTimeout(() => btn.classList.remove('cart-bounce'), 400);
}

function toggleCart() {
  const modal = document.getElementById('cart-modal');
  modal.classList.toggle('open');
}

function closeCart() {
  document.getElementById('cart-modal').classList.remove('open');
}

function sendOrder() {
  const name = document.getElementById('customer-name').value.trim();
  const phone = document.getElementById('customer-phone').value.trim();

  if (!name || !phone) {
    alert('Por favor completá tu nombre y celular.');
    return;
  }

  if (cart.length === 0) {
    alert('Tu carrito está vacío.');
    return;
  }

  const envio = getEnvio();
  if (!envio.tipo) {
    alert('Por favor seleccioná un método de envío.');
    return;
  }

  // Validar y armar detalle de envío
  let envioDetalle = '';
  if (envio.tipo === 'montevideo') {
    const dir = document.getElementById('envio-direccion').value.trim();
    if (!dir) { alert('Por favor ingresá tu dirección de entrega.'); return; }
    envioDetalle = `📍 Montevideo · $200\nDirección: ${dir}`;
  } else if (envio.tipo === 'interior') {
    const ciudad = document.getElementById('envio-ciudad').value.trim();
    if (!ciudad) { alert('Por favor ingresá tu ciudad o localidad.'); return; }
    const interiorTipo = document.querySelector('input[name="interior-tipo"]:checked');
    if (!interiorTipo) { alert('Por favor indicá si retirás en agencia o necesitás entrega a domicilio.'); return; }
    if (interiorTipo.value === 'agencia') {
      envioDetalle = `🚛 Interior · ${ciudad} · Retiro en agencia`;
    } else {
      const domicilio = document.getElementById('envio-domicilio-interior').value.trim();
      if (!domicilio) { alert('Por favor ingresá tu dirección de entrega.'); return; }
      envioDetalle = `🚛 Interior · ${ciudad} · Entrega a domicilio: ${domicilio}`;
    }
  } else if (envio.tipo === 'pickup') {
    envioDetalle = `🏡 A coordinar retiro · Cordón`;
  }

  const lines = cart.map(i => `• ${i.name} - ${i.variant} x${i.qty} → $${(i.price * i.qty).toLocaleString()}`).join('\n');
  const subtotal = getTotal();
  const total = (subtotal + envio.costo).toLocaleString();

  const message = encodeURIComponent(
    `🛍️ *Nuevo pedido Sendera*\n\n` +
    `${lines}\n\n` +
    `Subtotal: $${subtotal.toLocaleString()}\n` +
    `📦 Envío: ${envioDetalle}\n` +
    `*Total: $${total}*\n\n` +
    `👤 Cliente: ${name}\n` +
    `📱 Celular: ${phone}\n\n` +
    `_Pedido recibido desde sendera.uy_`
  );

  // Guardar pedido en Firebase
  if (typeof db !== 'undefined') {
    const envioData = getEnvio();
    const pedido = {
      fecha: new Date().toISOString(),
      cliente: name,
      celular: phone,
      productos: cart.map(i => ({ nombre: i.name, variante: i.variant, qty: i.qty, precio: i.price })),
      envio: envioData ? envioData.label : '—',
      total: getTotal() + (envioData ? envioData.costo : 0),
      estado: 'pendiente'
    };
    db.ref('pedidos').push(pedido);
  }

  WHATSAPP_NUMBERS.forEach((num, i) => {
    setTimeout(() => {
      window.open(`https://wa.me/${num}?text=${message}`, '_blank');
    }, i * 800);
  });

  // Reset
  cart = [];
  updateCartUI();
  document.getElementById('customer-name').value = '';
  document.getElementById('customer-phone').value = '';
  closeCart();
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
        qtyControl.innerHTML = '<span style="font-size:0.72rem;color:#e74c3c;letter-spacing:0.08em;text-transform:uppercase;padding:8px 6px;">Sin stock</span>';
      }
    }
  });
}

// Close on outside click
document.addEventListener('click', function(e) {
  const modal = document.getElementById('cart-modal');
  const btn = document.getElementById('cart-btn');
  if (modal.classList.contains('open') && !modal.contains(e.target) && !btn.contains(e.target)) {
    closeCart();
  }
});

updateCartUI();
window.addEventListener('load', checkStockOnLoad);
