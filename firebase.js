// firebase.js
// Initialises Firebase using the modular v9 SDK (ESM via CDN).
// Every other module imports { auth, db } from here — never re-initialises.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB4LfmExX9mciWQEdtXAMwR_MLw9y9Ef10",
  authDomain:        "calianonymous-78a5d.firebaseapp.com",
  projectId:         "calianonymous-78a5d",
  storageBucket:     "calianonymous-78a5d.firebasestorage.app",
  messagingSenderId: "520413516794",
  appId:             "1:520413516794:web:f3454c0f21dce34f358a43",
  measurementId:     "G-Y9KTTNNTCY",
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Keep the user signed-in across page reloads / tab closes.
setPersistence(auth, browserLocalPersistence).catch(console.warn);

// Enable offline cache (best-effort — Safari private mode throws).
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code !== "failed-precondition" && err.code !== "unimplemented") {
    console.warn("Firestore offline persistence unavailable:", err.code);
  }
});

// Analytics is optional — ignore if blocked by ad-blockers.
try { getAnalytics(app); } catch { /* noop */ }
