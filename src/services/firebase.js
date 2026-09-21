import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyA4KNzKStW_yj_Dajq-qdj0ju4KkOCZ-Is",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "petrolpump-management.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "petrolpump-management",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "petrolpump-management.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "175319868192",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:175319868192:web:5d7caf946e9a4422852d45",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-T4XWLB96N5",
};

// Log to check if env variables are actually loaded (will show in terminal)
console.log("Firebase API Key Loaded:", firebaseConfig.apiKey ? "YES" : "NO");

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Ensure Auth works correctly in React Native
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  // If initializeAuth fails (e.g. already initialized), fallback to getAuth
  auth = getAuth(app);
}

export const db = getFirestore(app);
export { auth, firebaseConfig };
export default app;
