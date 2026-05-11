// auth.js
// Handles all Firebase Authentication operations.
// Exports functions consumed by app.js and ui.js.
// NEVER stores passwords anywhere — Firebase Auth handles them.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, setDoc, getDoc, collection,
  query, where, getDocs, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { auth, db } from "./firebase.js";

// ─── Validation helpers ───────────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(username) {
  if (!username || typeof username !== "string") return "Username is required.";
  const u = username.trim();
  if (u.length < 3)  return "Username must be at least 3 characters.";
  if (u.length > 20) return "Username must be 20 characters or fewer.";
  if (!USERNAME_RE.test(u)) return "Only letters, numbers, and underscores allowed.";
  return null; // valid
}

export function validatePassword(password) {
  if (!password) return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null; // valid
}

// ─── Username uniqueness check ────────────────────────────────────────────────

export async function isUsernameTaken(username) {
  const q = query(
    collection(db, "users"),
    where("usernameLower", "==", username.trim().toLowerCase()),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

// ─── Sign up ──────────────────────────────────────────────────────────────────

export async function signUp(email, password, username) {
  // 1. Client-side validation
  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);

  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  // 2. Uniqueness check
  const taken = await isUsernameTaken(username);
  if (taken) throw new Error("That username is already taken. Pick another.");

  // 3. Create Firebase Auth account
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const user = credential.user;

  // 4. Set display name on the Auth profile (username, not email)
  await updateProfile(user, { displayName: username.trim() });

  // 5. Write user profile to Firestore — NO password stored
  await setDoc(doc(db, "users", user.uid), {
    uid:           user.uid,
    username:      username.trim(),
    usernameLower: username.trim().toLowerCase(), // for uniqueness queries
    email:         email.trim().toLowerCase(),
    createdAt:     serverTimestamp(),
  });

  return user;
}

// ─── Log in ───────────────────────────────────────────────────────────────────

export async function logIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

// ─── Log out ──────────────────────────────────────────────────────────────────

export async function logOut() {
  await signOut(auth);
}

// ─── Get stored user profile (username etc.) from Firestore ──────────────────

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// ─── Auth state listener ──────────────────────────────────────────────────────
// Calls onSignedIn(user, profile) or onSignedOut() whenever auth state changes.
// Returns the unsubscribe function.

export function listenAuthState(onSignedIn, onSignedOut) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await getUserProfile(user.uid);
      onSignedIn(user, profile);
    } else {
      onSignedOut();
    }
  });
}

// ─── Friendly error messages for Firebase Auth error codes ───────────────────

export function friendlyAuthError(error) {
  const map = {
    "auth/email-already-in-use":    "An account with that email already exists.",
    "auth/invalid-email":           "That email address is invalid.",
    "auth/weak-password":           "Password is too weak.",
    "auth/user-not-found":          "No account found with that email.",
    "auth/wrong-password":          "Incorrect password.",
    "auth/invalid-credential":      "Incorrect email or password.",
    "auth/too-many-requests":       "Too many attempts. Try again later.",
    "auth/network-request-failed":  "Network error. Check your connection.",
    "auth/user-disabled":           "This account has been disabled.",
  };
  return map[error.code] || error.message || "Something went wrong.";
}
