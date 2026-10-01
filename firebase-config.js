// Configuración Firebase - Sendera
const firebaseConfig = {
  apiKey: "AIzaSyBp7XddXbOGYTzZD8qusj5MXH-LNdox5gc",
  authDomain: "www.senderauy.com",
  databaseURL: "https://sendera-34791-default-rtdb.firebaseio.com",
  projectId: "sendera-34791",
  storageBucket: "sendera-34791.firebasestorage.app",
  messagingSenderId: "24955587211",
  appId: "1:24955587211:web:9877c020c3aea4fe21228e"
};

firebase.initializeApp(firebaseConfig);
// Auth antes que database: así la base espera la sesión guardada y no arranca sin permisos
if (firebase.auth) firebase.auth();
const db = firebase.database();
