const WHATSAPP_NUMBERS = ['59895290959', '59899069384'];

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

  document.getElementById('cart-total').textContent = '$' + getTotal().toLocaleString();
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

  const lines = cart.map(i => `• ${i.name} - ${i.variant} x${i.qty} → $${(i.price * i.qty).toLocaleString()}`).join('\n');
  const total = getTotal().toLocaleString();

  const message = encodeURIComponent(
    `🛍️ *Nuevo pedido Sendera*\n\n` +
    `${lines}\n\n` +
    `*Total: $${total}*\n\n` +
    `👤 Cliente: ${name}\n` +
    `📱 Celular: ${phone}\n\n` +
    `_Pedido recibido desde sendera.uy_`
  );

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

// Close on outside click
document.addEventListener('click', function(e) {
  const modal = document.getElementById('cart-modal');
  const btn = document.getElementById('cart-btn');
  if (modal.classList.contains('open') && !modal.contains(e.target) && !btn.contains(e.target)) {
    closeCart();
  }
});

updateCartUI();
