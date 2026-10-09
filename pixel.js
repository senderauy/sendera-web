// Píxel de Meta para las páginas que no lo traen en el HTML (producto y pago).
// Mide productos vistos, carritos y compras para los anuncios de catálogo.
// Los content_ids son los mismos códigos de color del catálogo (api/catalogo.js).
if (!window.fbq) {
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1022921806923646');
  fbq('track', 'PageView');
}
