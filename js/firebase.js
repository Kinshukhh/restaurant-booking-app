// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Replace with your web app's Firebase configuration
// Get this from Firebase Console: Project Settings > General > Your Apps > Web App
const firebaseConfig = {
  apiKey: "AIzaSyBaiE5-Og9OUUEagIYnXQSKGRpgdpq1j6Q",
  authDomain: "restranai.firebaseapp.com",
  projectId: "restranai",
  storageBucket: "restranai.firebasestorage.app",
  messagingSenderId: "1070881765272",
  appId: "1:1070881765272:web:4aa22d1367290da6839ded",
  measurementId: "G-FLVZL3BT4Y"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };