importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBp7XddXbOGYTzZD8qusj5MXH-LNdox5gc",
  authDomain: "sendera-34791.firebaseapp.com",
  databaseURL: "https://sendera-34791-default-rtdb.firebaseio.com",
  projectId: "sendera-34791",
  storageBucket: "sendera-34791.firebasestorage.app",
  messagingSenderId: "24955587211",
  appId: "1:24955587211:web:9877c020c3aea4fe21228e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/img/logo.png',
    badge: '/img/logo.png'
  });
});
