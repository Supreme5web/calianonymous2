// app.js
// Orchestrator — imports from auth.js, firestore.js, ui.js.
// No Firebase SDK calls happen here directly.
// No rendering logic lives here — that's ui.js.

import { listenAuthState, logOut, signUp, logIn, friendlyAuthError } from "./auth.js";
import {
  subscribePosts, subscribeComments,
  createPost, createComment, toggleLike, fetchUserLikes,
} from "./firestore.js";
import {
  showToast, setConnectionStatus, setComposerAuthState,
  renderUserRail, renderFeed, renderDrawer,
  openDrawer, closeDrawer,
  showAuthModal, closeAuthModal,
  setAuthSubmitHandler, setAuthFormLoading,
  showAuthError, clearAuthError,
} from "./ui.js";

// ─── App state ────────────────────────────────────────────────────────────────

let currentUser    = null;
let currentProfile = null;
let posts          = [];
let commentsByPost = {};
let likedPostIds   = new Set();
let activeFilter   = "all";
let searchTerm     = "";
let openPostId     = "";
let feedLoading    = true;
let selectedImage  = "";
let unsubPosts     = null;
let unsubComments  = null;

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const postTextEl     = document.getElementById("postText");
const photoInputEl   = document.getElementById("photoInput");
const imagePreviewEl = document.getElementById("imagePreview");
const publishBtn     = document.getElementById("publishButton");
const charCountEl    = document.getElementById("charCount");
const searchInputEl  = document.getElementById("searchInput");
const menuBtn        = document.querySelector(".menu-button");
const sidebarBdrop   = document.querySelector(".sidebar-backdrop");
const filterBtns     = document.querySelectorAll("[data-filter]");
const drawerForm     = document.getElementById("drawerCommentForm");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mergeData() {
  posts = posts.map((p) => ({
    ...p,
    comments: commentsByPost[p.id] || [],
    liked:    likedPostIds.has(p.id),
  }));
}

function repaint() {
  renderFeed({ posts, loading: feedLoading, activeFilter, searchTerm, currentUser, onAction: handlePostAction });
}

async function refreshLikes() {
  if (!currentUser) { likedPostIds = new Set(); return; }
  likedPostIds = await fetchUserLikes(posts.map((p) => p.id), currentUser.uid);
}

// ─── Auth state ───────────────────────────────────────────────────────────────

listenAuthState(
  async (user, profile) => {
    currentUser    = user;
    currentProfile = profile;
    setComposerAuthState(user, profile);
    renderUserRail(user, profile, handleLogout);
    await refreshLikes();
    mergeData();
    repaint();
  },
  () => {
    currentUser    = null;
    currentProfile = null;
    likedPostIds   = new Set();
    setComposerAuthState(null, null);
    renderUserRail(null, null, null);
    mergeData();
    repaint();
  },
);

setAuthSubmitHandler(async (form) => {
  clearAuthError();
  setAuthFormLoading(true);
  const mode     = form.elements.mode?.value;
  const email    = form.elements.email?.value?.trim();
  const password = form.elements.password?.value;
  const username = form.elements.username?.value?.trim();
  try {
    if (mode === "signup") {
      await signUp(email, password, username);
      showToast("Account created! Welcome.");
    } else {
      await logIn(email, password);
      showToast("Signed in.");
    }
    closeAuthModal();
  } catch (err) {
    showAuthError(friendlyAuthError(err));
  } finally {
    setAuthFormLoading(false);
  }
});

async function handleLogout() {
  await logOut();
  showToast("Signed out.");
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

async function startSubscriptions() {
  setConnectionStatus("connecting", "Connecting to live feed");
  unsubPosts = subscribePosts(
    async (freshPosts) => {
      feedLoading = false;
      posts = freshPosts;
      await refreshLikes();
      mergeData();
      repaint();
      if (openPostId) renderDrawer(posts.find((x) => x.id === openPostId), currentUser);
      setConnectionStatus("ready", "Live feed connected");
    },
    () => {
      feedLoading = false;
      setConnectionStatus("error", "Live feed unavailable");
      showToast("Could not load posts");
      repaint();
    },
  );
  unsubComments = subscribeComments(
    (freshComments) => {
      commentsByPost = freshComments.reduce((acc, c) => {
        if (!c.postId) return acc;
        (acc[c.postId] = acc[c.postId] || []).push(c);
        return acc;
      }, {});
      mergeData();
      repaint();
      if (openPostId) renderDrawer(posts.find((x) => x.id === openPostId), currentUser);
    },
    () => showToast("Could not load comments"),
  );
}

// ─── Post actions ─────────────────────────────────────────────────────────────

async function handlePostAction(post, action, value) {
  if (action === "like") {
    if (!currentUser) { showAuthModal("login"); return; }
    const wasLiked = likedPostIds.has(post.id);
    if (wasLiked) { likedPostIds.delete(post.id); post.likes = Math.max(0, post.likes - 1); }
    else          { likedPostIds.add(post.id);    post.likes += 1; }
    post.liked = !wasLiked;
    repaint();
    try {
      await toggleLike(post.id, currentUser.uid, wasLiked);
    } catch {
      if (wasLiked) { likedPostIds.add(post.id);    post.likes += 1; }
      else          { likedPostIds.delete(post.id); post.likes = Math.max(0, post.likes - 1); }
      post.liked = wasLiked;
      repaint();
      showToast("Could not update like");
    }
    return;
  }
  if (action === "comments") {
    openPostId = post.id;
    renderDrawer(post, currentUser);
    openDrawer();
    drawerForm?.elements?.comment?.focus();
    return;
  }
  if (action === "comment") {
    if (!currentUser) { showAuthModal("login"); return; }
    const text = (value || "").trim();
    if (!text) return;
    try {
      await createComment({ postId: post.id, uid: currentUser.uid, username: currentProfile?.username || "anon", text });
    } catch {
      showToast("Could not add comment");
    }
  }
}

// ─── Publish post ─────────────────────────────────────────────────────────────

async function publishPost() {
  if (!currentUser) { showAuthModal("login"); return; }
  const text = postTextEl.value.trim();
  if (!text && !selectedImage) { postTextEl.focus(); return; }
  publishBtn.disabled = true;
  publishBtn.querySelector("span").textContent = "Posting…";
  try {
    await createPost({
      uid: currentUser.uid, username: currentProfile?.username || "anon",
      text: text || "Shared a photo.", image: selectedImage,
      category: selectedImage ? "photos" : "confessions", mood: "lowkey",
    });
    postTextEl.value = ""; selectedImage = ""; photoInputEl.value = "";
    imagePreviewEl.hidden = true; imagePreviewEl.innerHTML = "";
    charCountEl.textContent = "0";
    showToast("Posted.");
  } catch (err) {
    console.error("Posting failed:", err);
    showToast("Could not publish right now");
  } finally {
    publishBtn.disabled = false;
    publishBtn.querySelector("span").textContent = "Post";
  }
}

// ─── Image upload ─────────────────────────────────────────────────────────────

photoInputEl?.addEventListener("change", async (e) => {
  const [file] = e.target.files;
  if (!file) return;
  if (!currentUser) { showAuthModal("login"); return; }
  showToast("Compressing image…");
  try {
    selectedImage = await compressImage(file);
    if (!selectedImage) return;
    imagePreviewEl.innerHTML = `<img src="${selectedImage}" alt="Preview" />`;
    imagePreviewEl.hidden = false;
  } catch { showToast("Could not read that image"); }
});

// ─── Listeners ────────────────────────────────────────────────────────────────

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter;
    filterBtns.forEach((b) => b.classList.toggle("active", b.dataset.filter === activeFilter));
    repaint();
  });
});

searchInputEl?.addEventListener("input", (e) => { searchTerm = e.target.value.trim(); repaint(); });
postTextEl?.addEventListener("input", () => { charCountEl.textContent = postTextEl.value.length; });
publishBtn?.addEventListener("click", publishPost);

function runNav(action) {
  if (action === "feed") {
    posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    searchTerm = ""; searchInputEl.value = ""; activeFilter = "all";
    filterBtns.forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
    repaint(); window.scrollTo({ top: 0, behavior: "smooth" }); return;
  }
  if (action === "hot")      { posts.sort((a, b) => b.likes - a.likes); repaint(); showToast("Hottest posts"); return; }
  if (action === "gallery")  { activeFilter = "photos"; filterBtns.forEach((b) => b.classList.toggle("active", b.dataset.filter === "photos")); repaint(); return; }
  if (action === "comments") {
    const top = [...posts].sort((a, b) => b.comments.length - a.comments.length)[0];
    if (top) { openPostId = top.id; renderDrawer(top, currentUser); openDrawer(); } return;
  }
  if (action === "create") {
    if (!currentUser) { showAuthModal("login"); return; }
    postTextEl?.focus(); postTextEl?.scrollIntoView({ behavior: "smooth", block: "center" }); return;
  }
}

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-nav]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active"); runNav(btn.dataset.nav);
    document.body.classList.remove("sidebar-open");
  });
});

document.querySelectorAll(".mobile-nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mobile-nav button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active"); runNav(btn.dataset.mobileNav);
  });
});

menuBtn?.addEventListener("click", () => document.body.classList.add("sidebar-open"));
sidebarBdrop?.addEventListener("click", () => document.body.classList.remove("sidebar-open"));

document.querySelectorAll("[data-close-comments]").forEach((btn) => {
  btn.addEventListener("click", () => { closeDrawer(); openPostId = ""; });
});

drawerForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const input = drawerForm.elements.comment;
  handlePostAction(posts.find((p) => p.id === openPostId), "comment", input.value);
  drawerForm.reset();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeDrawer(); document.body.classList.remove("sidebar-open"); }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

startSubscriptions();
window.addEventListener("beforeunload", () => { unsubPosts?.(); unsubComments?.(); });

// ─── Image compression ────────────────────────────────────────────────────────

function compressImage(file, maxDim = 720, maxLen = 850000) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { showToast("Choose an image file"); resolve(""); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let b64 = canvas.toDataURL("image/jpeg", 0.72);
      if (b64.length > maxLen) b64 = canvas.toDataURL("image/jpeg", 0.5);
      if (b64.length > maxLen) { showToast("Image too large"); resolve(""); return; }
      resolve(b64);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Load failed")); };
    img.src = url;
  });
}
