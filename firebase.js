const firebaseConfig = {
  apiKey: "AIzaSyB4LfmExX9mciWQEdtXAMwR_MLw9y9Ef10",
  authDomain: "calianonymous-78a5d.firebaseapp.com",
  projectId: "calianonymous-78a5d",
  storageBucket: "calianonymous-78a5d.firebasestorage.app",
  messagingSenderId: "520413516794",
  appId: "1:520413516794:web:f3454c0f21dce34f358a43",
  measurementId: "G-Y9KTTNNTCY",
};

const firebaseCollections = {
  posts: "posts",
  comments: "comments",
};

const FirebaseStatus = {
  idle: "idle",
  ready: "ready",
  disabled: "disabled",
  error: "error",
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebaseAnalytics = null;
let firebaseUser = null;
let firebaseReadyPromise = null;

function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey) && !firebaseConfig.apiKey.startsWith("YOUR_");
}

function formatFirebaseError(error) {
  if (!error) return "Firebase failed to connect.";
  const code = error.code ? `${error.code}: ` : "";
  return `${code}${error.message || "Firebase failed to connect."}`;
}

function normalizeFirebasePost(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    alias: data.alias || "Anonymous Signal",
    time: data.time || "now",
    category: data.category || "confessions",
    mood: data.mood || "lowkey",
    text: data.text || "",
    image: data.image || "",
    likes: Number(data.likes || 0),
    comments: Array.isArray(data.comments) ? data.comments : [],
    liked: false,
    saved: false,
    createdAt: data.createdAt || null,
  };
}

function normalizeFirebaseComment(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    postId: data.postId,
    text: data.text || "",
    alias: data.alias || "Anonymous reply",
    createdAt: data.createdAt || "",
  };
}

async function initFirebase() {
  if (firebaseReadyPromise) return firebaseReadyPromise;

  firebaseReadyPromise = new Promise(async (resolve) => {
    if (!isFirebaseConfigured()) {
      resolve({ status: FirebaseStatus.disabled, reason: "Firebase config still has placeholders." });
      return;
    }

    if (!window.firebase) {
      resolve({ status: FirebaseStatus.error, reason: "Firebase CDN scripts did not load." });
      return;
    }

    try {
      firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();
      firebaseDb = firebase.firestore();

      try {
        firebaseAnalytics = firebase.analytics?.();
      } catch {
        console.info("Firebase Analytics is unavailable in this browser session.");
      }

      try {
        await firebaseDb.enablePersistence({ synchronizeTabs: true });
      } catch {
        console.info("Firestore offline persistence is unavailable in this browser session.");
      }

      const credential = await firebaseAuth.signInAnonymously();
      firebaseUser = credential.user;
      resolve({ status: FirebaseStatus.ready, user: firebaseUser, app: firebaseApp, analytics: firebaseAnalytics });
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      resolve({ status: FirebaseStatus.error, reason: formatFirebaseError(error), code: error.code || "" });
    }
  });

  return firebaseReadyPromise;
}

window.CaliFirebase = {
  config: firebaseConfig,
  collections: firebaseCollections,
  status: FirebaseStatus.idle,
  isConfigured: isFirebaseConfigured,

  async ready() {
    const result = await initFirebase();
    this.status = result.status;
    return result;
  },

  async subscribePosts(onPosts, onError) {
    const result = await this.ready();
    if (result.status !== FirebaseStatus.ready) return null;

    return firebaseDb
      .collection(firebaseCollections.posts)
      .orderBy("createdAt", "desc")
      .limit(60)
      .onSnapshot(
        (snapshot) => {
          onPosts(snapshot.docs.map(normalizeFirebasePost));
        },
        (error) => {
          console.error("Post subscription failed:", error);
          onError?.(error);
        },
      );
  },

  async subscribeComments(onComments, onError) {
    const result = await this.ready();
    if (result.status !== FirebaseStatus.ready) return null;

    return firebaseDb
      .collection(firebaseCollections.comments)
      .orderBy("createdAt", "asc")
      .limit(600)
      .onSnapshot(
        (snapshot) => {
          onComments(snapshot.docs.map(normalizeFirebaseComment));
        },
        (error) => {
          console.error("Comment subscription failed:", error);
          onError?.(error);
        },
      );
  },

  async createPost(post) {
    const result = await this.ready();
    if (result.status !== FirebaseStatus.ready) {
      throw new Error(result.reason || "Firebase is not connected.");
    }

    const document = {
      alias: post.alias,
      time: "now",
      category: post.category,
      mood: post.mood,
      text: post.text,
      image: post.image || "",
      likes: 0,
      commentCount: 0,
      ownerId: firebaseUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await firebaseDb.collection(firebaseCollections.posts).add(document);
    return { ...post, id: ref.id };
  },

  async createComment(postId, comment) {
    const result = await this.ready();
    if (result.status !== FirebaseStatus.ready) {
      throw new Error(result.reason || "Firebase is not connected.");
    }

    const payload = {
      postId,
      text: comment,
      alias: "Anonymous reply",
      ownerId: firebaseUser.uid,
      createdAt: new Date().toISOString(),
    };

    const batch = firebaseDb.batch();
    const commentRef = firebaseDb.collection(firebaseCollections.comments).doc();
    const postRef = firebaseDb.collection(firebaseCollections.posts).doc(postId);

    batch.set(commentRef, payload);
    batch.update(postRef, {
      commentCount: firebase.firestore.FieldValue.increment(1),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return { id: commentRef.id, ...payload };
  },

  async toggleReaction(postId, reaction) {
    const result = await this.ready();
    if (result.status !== FirebaseStatus.ready) {
      throw new Error(result.reason || "Firebase is not connected.");
    }

    await firebaseDb
      .collection(firebaseCollections.posts)
      .doc(postId)
      .update({
        likes: firebase.firestore.FieldValue.increment(reaction.active ? 1 : -1),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

    return reaction;
  },
};
