// Configuración Firebase - Sendera
const firebaseConfig = {
  apiKey: "AIzaSyBp7XddXbOGYTzZD8qusj5MXH-LNdox5gc",
  authDomain: "sendera-34791.firebaseapp.com",
  databaseURL: "https://sendera-34791-default-rtdb.firebaseio.com",
  projectId: "sendera-34791",
  storageBucket: "sendera-34791.firebasestorage.app",
  messagingSenderId: "24955587211",
  appId: "1:24955587211:web:9877c020c3aea4fe21228e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
