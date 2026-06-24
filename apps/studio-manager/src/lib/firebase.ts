import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

// Firebase client config is loaded from environment variables.
// Copy `.env.example` to `.env` and fill it with your own (demo) Firebase
// project values. Client keys ship in the browser bundle anyway, but we keep
// them in env so this public repo never carries a real project's config.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

// Demo staff roster. Admin role is granted by email domain in firestore.rules.
// These are fictional accounts for the public demo — no real PII.
export const INSTRUCTOR_NAMES: Record<string, string> = {
  'maria@demo-yoga.app': 'María López',
  'carlos@demo-yoga.app': 'Carlos Ramírez',
  'lucia@demo-yoga.app': 'Lucía Fernández',
  'sofia@demo-yoga.app': 'Sofía Martínez',
  'admin@demo-yoga.app': 'Admin Demo',
};
