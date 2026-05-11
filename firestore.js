// firestore.js
// All Firestore read/write operations.
// Likes use a subcollection: posts/{postId}/likes/{uid}
// This makes "one like per user" enforceable in security rules.

import {
  collection, doc, addDoc, getDoc, getDocs,
  setDoc, deleteDoc, updateDoc, onSnapshot,
  query, orderBy, limit, where,
  serverTimestamp, increment, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";

// ─── Collection refs ──────────────────────────────────────────────────────────

const postsCol    = () => collection(db, "posts");
const commentsCol = () => collection(db, "comments");
const likesCol    = (postId) => collection(db, "posts", postId, "likes");
const usersCol    = () => collection(db, "users");

// ─── Normalise raw Firestore docs ─────────────────────────────────────────────

function normalisePost(docSnap) {
  const d = docSnap.data();
  return {
    id:           docSnap.id,
    alias:        d.alias        || "Anonymous",
    authorUid:    d.authorUid    || "",
    time:         d.time         || "now",
    category:     d.category     || "confessions",
    mood:         d.mood         || "lowkey",
    text:         d.text         || "",
    image:        d.image        || "",
    likes:        Number(d.likes || 0),
    commentCount: Number(d.commentCount || 0),
    createdAt:    d.createdAt    || null,
    // runtime-only fields (not in Firestore)
    comments:     [],
    liked:        false,
  };
}

function normaliseComment(docSnap) {
  const d = docSnap.data();
  return {
    id:        docSnap.id,
    postId:    d.postId    || "",
    text:      d.text      || "",
    alias:     d.alias     || "Anonymous",
    authorUid: d.authorUid || "",
    createdAt: d.createdAt || "",
  };
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export function subscribePosts(onPosts, onError) {
  const q = query(postsCol(), orderBy("createdAt", "desc"), limit(60));
  return onSnapshot(q, (snap) => onPosts(snap.docs.map(normalisePost)), onError);
}

export async function createPost({ uid, username, text, image, category, mood }) {
  const payload = {
    authorUid:    uid,
    alias:        username,           // displayed username, never email
    time:         "now",
    category:     category || "confessions",
    mood:         mood     || "lowkey",
    text:         text     || "",
    image:        image    || "",
    likes:        0,
    commentCount: 0,
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp(),
  };
  const ref = await addDoc(postsCol(), payload);
  return { id: ref.id, ...payload, comments: [], liked: false };
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export function subscribeComments(onComments, onError) {
  const q = query(commentsCol(), orderBy("createdAt", "asc"), limit(600));
  return onSnapshot(q, (snap) => onComments(snap.docs.map(normaliseComment)), onError);
}

export async function createComment({ postId, uid, username, text }) {
  const batch = writeBatch(db);

  const commentRef = doc(commentsCol());
  batch.set(commentRef, {
    postId,
    authorUid: uid,
    alias:     username,
    text:      text.trim(),
    createdAt: new Date().toISOString(),
  });

  // Increment commentCount on the parent post
  batch.update(doc(postsCol(), postId), {
    commentCount: increment(1),
    updatedAt:    serverTimestamp(),
  });

  await batch.commit();
  return { id: commentRef.id, postId, alias: username, text: text.trim() };
}

// ─── Likes (subcollection: posts/{postId}/likes/{uid}) ────────────────────────
// One document per user. Document existence = liked.
// Firestore rules enforce that uid in path === request.auth.uid.

export async function getLikeStatus(postId, uid) {
  const snap = await getDoc(doc(likesCol(postId), uid));
  return snap.exists();
}

export async function toggleLike(postId, uid, currentlyLiked) {
  const likeRef  = doc(likesCol(postId), uid);
  const postRef  = doc(postsCol(), postId);
  const batch    = writeBatch(db);

  if (currentlyLiked) {
    batch.delete(likeRef);
    batch.update(postRef, { likes: increment(-1), updatedAt: serverTimestamp() });
  } else {
    batch.set(likeRef, { uid, likedAt: serverTimestamp() });
    batch.update(postRef, { likes: increment(1),  updatedAt: serverTimestamp() });
  }

  await batch.commit();
  return !currentlyLiked;
}

// Fetch like statuses for a list of postIds for the current user.
// Returns a Set of postIds that the user has liked.
export async function fetchUserLikes(postIds, uid) {
  if (!uid || !postIds.length) return new Set();
  const liked = new Set();
  await Promise.all(
    postIds.map(async (postId) => {
      const snap = await getDoc(doc(likesCol(postId), uid));
      if (snap.exists()) liked.add(postId);
    }),
  );
  return liked;
}

// ─── User profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(usersCol(), uid));
  return snap.exists() ? snap.data() : null;
}
