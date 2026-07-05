self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nuevo pedido — Sendera', {
      body: data.body || '',
      icon: data.icon || '/img/logo.png',
      badge: '/img/logo.png'
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/admin/pedidos.html'));
});
