import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyC-iLxizH1umfeHSUZHLvpAt6XNm21p90Y",
    authDomain: "tanksduel-b90c7.firebaseapp.com",
    projectId: "tanksduel-b90c7",
    storageBucket: "tanksduel-b90c7.firebasestorage.app",
    messagingSenderId: "952596856224",
    appId: "1:952596856224:web:aefd98cf1d768e9169f8c5"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };
