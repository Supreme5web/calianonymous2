const storageKey = "cali-anonymous-posts-v1";

const fallbackPosts = [
  {
    id: "post-sunset",
    alias: "Anonymous Sunset",
    time: "4m",
    category: "photos",
    mood: "glowing",
    text: "The sky did the cinematic thing and nobody in my group looked up. Posting here so it counts.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=82",
    likes: 384,
    comments: ["That is a lockscreen waiting to happen.", "Cali sunsets stay undefeated."],
    liked: false,
    saved: false,
  },
  {
    id: "post-signal",
    alias: "Anonymous Signal",
    time: "12m",
    category: "confessions",
    mood: "messy",
    text: "I told everyone I was staying in tonight, then got dressed like the main character and left through the side gate.",
    image: "",
    likes: 219,
    comments: ["Respectfully iconic.", "Side gate behavior is always a plot twist."],
    liked: true,
    saved: false,
  },
  {
    id: "post-neon",
    alias: "Anonymous Neon",
    time: "27m",
    category: "local",
    mood: "hungry",
    text: "Tiny taco truck on the corner near the record store. No sign, just smoke and perfect salsa. You are welcome.",
    image:
      "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?auto=format&fit=crop&w=1200&q=82",
    likes: 641,
    comments: ["Drop coordinates without dropping coordinates.", "I know the one. Keep it lowkey."],
    liked: false,
    saved: false,
  },
];

const feed = document.querySelector("#feed");
const postText = document.querySelector("#postText");
const photoInput = document.querySelector("#photoInput");
const imagePreview = document.querySelector("#imagePreview");
const publishButton = document.querySelector("#publishButton");
const moodButton = document.querySelector("#moodButton");
const charCount = document.querySelector("#charCount");
const searchInput = document.querySelector("#searchInput");
const filterButtons = document.querySelectorAll("[data-filter]");
const notificationsButton = document.querySelector("#notificationsButton");
const firebaseStatus = document.querySelector("#firebaseStatus");
const firebaseHelp = document.querySelector("#firebaseHelp");
const commentDrawer = document.querySelector("#commentDrawer");
const drawerPost = document.querySelector("#drawerPost");
const drawerComments = document.querySelector("#drawerComments");
const drawerCommentForm = document.querySelector("#drawerCommentForm");
const toast = document.querySelector("#toast");

let posts = loadPosts();
let selectedImage = "";
let activeFilter = "all";
let searchTerm = "";
let openPostId = "";
let usingFirebase = false;
let unsubscribePosts = null;
let unsubscribeComments = null;
let firebaseBasePosts = [];
let firebaseCommentsByPost = {};
let firebaseReady = false;
const moods = ["glowing", "messy", "soft", "wild", "lowkey", "electric"];
let moodIndex = 0;

function loadPosts() {
  try {
    const saved = localStorage.getItem(storageKey);
    return normalizePosts(saved ? JSON.parse(saved) : fallbackPosts);
  } catch {
    return normalizePosts(fallbackPosts);
  }
}

function savePosts() {
  if (usingFirebase) return;

  try {
    localStorage.setItem(storageKey, JSON.stringify(posts));
  } catch {
    showToast("Storage is full, but the app is still running");
  }
}

function setFirebaseStatus(status, message, help = "") {
  firebaseStatus.className = `firebase-status ${status}`;
  firebaseStatus.querySelector("span").textContent = message;
  const icon = firebaseStatus.querySelector("i");
  icon.dataset.lucide = status === "ready" ? "wifi" : status === "error" ? "triangle-alert" : "loader";
  firebaseHelp.hidden = !help;
  firebaseHelp.innerHTML = help;
  window.lucide?.createIcons();
}

function normalizePosts(source) {
  return source.map((post) => ({
    ...post,
    comments: Array.isArray(post.comments) ? post.comments : [],
    liked: Boolean(post.liked),
    saved: Boolean(post.saved),
  }));
}

function groupCommentsByPost(comments) {
  return comments.reduce((groups, comment) => {
    if (!comment.postId) return groups;
    if (!groups[comment.postId]) groups[comment.postId] = [];
    groups[comment.postId].push(comment);
    return groups;
  }, {});
}

function mergeFirebaseData() {
  posts = firebaseBasePosts.map((post) => ({
    ...post,
    comments: firebaseCommentsByPost[post.id] || [],
  }));
}

function renderPosts() {
  const visiblePosts = posts.filter((post) => {
    const matchesFilter = activeFilter === "all" || post.category === activeFilter;
    const commentText = post.comments.map(getCommentText).join(" ");
    const searchable = `${post.alias} ${post.text} ${post.mood} ${commentText}`.toLowerCase();
    return matchesFilter && searchable.includes(searchTerm);
  });

  if (!visiblePosts.length) {
    feed.innerHTML = '<div class="empty-state">No anonymous posts match this view yet.</div>';
    return;
  }

  feed.innerHTML = visiblePosts.map((post) => createPostMarkup(post)).join("");
  bindPostActions();
  window.lucide?.createIcons();
}

function createPostMarkup(post) {
  const image = post.image ? `<img class="post-image" src="${post.image}" alt="Anonymous post image" />` : "";
  const previewComments = post.comments.slice(-2);
  const comments = previewComments.length
    ? previewComments
        .map((comment) => `<div class="comment"><strong>Anonymous reply</strong><span>${escapeHtml(getCommentText(comment))}</span></div>`)
        .join("")
    : '<div class="comment empty-comment"><span>No comments yet. Open the thread and start it.</span></div>';

  return `
    <article class="post-card" data-post-id="${post.id}" data-category="${post.category}">
      <header class="post-head">
        <div class="avatar">${post.alias.slice(-2).toUpperCase()}</div>
        <div>
          <strong>${escapeHtml(post.alias)}</strong>
          <span class="post-time">${post.time} ago - ${escapeHtml(post.mood)}</span>
        </div>
        <button class="icon-button more-button" type="button" aria-label="More options" data-action="more">
          <i data-lucide="more-horizontal"></i>
        </button>
      </header>
      <div class="post-body">
        <p>${escapeHtml(post.text)}</p>
      </div>
      ${image}
      <div class="post-actions">
        <button class="action-button ${post.liked ? "active" : ""}" type="button" data-action="like">
          <i data-lucide="heart"></i><span>${post.likes}</span>
        </button>
        <button class="action-button" type="button" data-action="comments">
          <i data-lucide="message-circle"></i><span>${post.comments.length}</span>
        </button>
        <button class="action-button" type="button" data-action="share">
          <i data-lucide="send"></i><span>Share</span>
        </button>
        <button class="action-button ${post.saved ? "active" : ""}" type="button" aria-label="Save post" data-action="save">
          <i data-lucide="bookmark"></i>
        </button>
      </div>
      <button class="view-comments" type="button" data-action="comments">
        View all ${post.comments.length} anonymous comments
      </button>
      <div class="comment-list">${comments}</div>
      <form class="comment-box">
        <input name="comment" autocomplete="off" maxlength="120" placeholder="Comment anonymously" />
        <button type="submit" aria-label="Send comment"><i data-lucide="send"></i></button>
      </form>
    </article>
  `;
}

function bindPostActions() {
  document.querySelectorAll(".post-card").forEach((card) => {
    const post = posts.find((item) => item.id === card.dataset.postId);
    if (!post) return;

    card.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => handlePostAction(post, button.dataset.action));
    });

    card.querySelector(".comment-box").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.comment;
      addComment(post.id, input.value);
      input.value = "";
    });
  });
}

function handlePostAction(post, action) {
  if (action === "like") {
    if (!firebaseReady) {
      showToast("Firebase is not connected yet");
      return;
    }

    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    window.CaliFirebase?.toggleReaction(post.id, {
      type: "heart",
      active: post.liked,
    });
    renderPosts();
    savePosts();
  }

  if (action === "comments") {
    openComments(post.id);
  }

  if (action === "share") {
    navigator.clipboard?.writeText(`${post.alias}: ${post.text}`).catch(() => {});
    showToast("Post copied for sharing");
  }

  if (action === "save") {
    post.saved = !post.saved;
    savePosts();
    renderPosts();
    showToast(post.saved ? "Post saved" : "Post unsaved");
  }

  if (action === "more") {
    showToast("Anonymous controls coming soon");
  }
}

function openComments(postId) {
  openPostId = postId;
  renderDrawer();
  commentDrawer.classList.add("open");
  commentDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  drawerCommentForm.elements.comment.focus();
}

function closeComments() {
  commentDrawer.classList.remove("open");
  commentDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
  openPostId = "";
}

function renderDrawer() {
  const post = posts.find((item) => item.id === openPostId);
  if (!post) return;

  drawerPost.innerHTML = `
    <div class="drawer-post-head">
      <div class="avatar">${post.alias.slice(-2).toUpperCase()}</div>
      <div>
        <strong>${escapeHtml(post.alias)}</strong>
        <span>${post.time} ago - ${escapeHtml(post.mood)}</span>
      </div>
    </div>
    <p>${escapeHtml(post.text)}</p>
    ${post.image ? `<img src="${post.image}" alt="Anonymous post image" />` : ""}
  `;

  drawerComments.innerHTML = post.comments.length
    ? post.comments
        .map(
          (comment, index) => `
            <div class="drawer-comment">
              <div class="avatar mini">${String(index + 1).padStart(2, "0")}</div>
              <div>
                <strong>Anonymous reply</strong>
                <p>${escapeHtml(getCommentText(comment))}</p>
              </div>
            </div>
          `,
        )
        .join("")
    : '<div class="empty-state">No comments yet. Be the first anonymous reply.</div>';

  window.lucide?.createIcons();
}

function addComment(postId, rawValue) {
  const value = rawValue.trim();
  if (!value) return;

  if (!firebaseReady) {
    showToast("Firebase is not connected yet");
    return;
  }

  const post = posts.find((item) => item.id === postId);
  if (!post) return;

  post.comments.push(value);
  window.CaliFirebase?.createComment(post.id, value);
  renderPosts();
  savePosts();

  if (openPostId === postId) {
    renderDrawer();
    drawerCommentForm.elements.comment.focus();
  }
}

async function publishPost() {
  const text = postText.value.trim();
  if (!text && !selectedImage) {
    postText.focus();
    return;
  }

  if (!firebaseReady) {
    showToast("Firebase is not connected. Check the status message.");
    return;
  }

  const post = {
    id: crypto.randomUUID(),
    alias: createAlias(),
    time: "now",
    category: selectedImage ? "photos" : "confessions",
    mood: moods[moodIndex],
    text: text || "Shared a photo anonymously.",
    image: selectedImage,
    likes: 0,
    comments: [],
    liked: false,
    saved: false,
  };

  publishButton.disabled = true;
  publishButton.querySelector("span").textContent = "Posting";

  try {
    const savedPost = await window.CaliFirebase?.createPost(post);
    posts = [savedPost || post, ...posts.filter((item) => item.id !== post.id)];
    savePosts();
  } catch (error) {
    console.error("Posting failed:", error);
    showToast(error.message || "Post failed. Check Firebase rules.");
    publishButton.disabled = false;
    publishButton.querySelector("span").textContent = "Post";
    return;
  }

  postText.value = "";
  selectedImage = "";
  photoInput.value = "";
  imagePreview.hidden = true;
  imagePreview.innerHTML = "";
  updateCount();
  renderPosts();
  showToast("Posted anonymously");
  publishButton.disabled = false;
  publishButton.querySelector("span").textContent = "Post";
}

function createAlias() {
  const handles = ["Mirage", "Afterglow", "Side Quest", "Low Tide", "Signal", "No Caller ID"];
  return `Anonymous ${handles[Math.floor(Math.random() * handles.length)]}`;
}

function updateCount() {
  charCount.textContent = postText.value.length;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 1800);
}

function getCommentText(comment) {
  return typeof comment === "string" ? comment : comment?.text || "";
}

async function initializeData() {
  renderPosts();
  window.lucide?.createIcons();
  setFirebaseStatus("connecting", "Connecting to Firebase");
  publishButton.disabled = true;

  const result = await window.CaliFirebase?.ready();
  usingFirebase = result?.status === "ready";
  firebaseReady = usingFirebase;

  if (!usingFirebase) {
    const reason = result?.reason || "Firebase is not connected.";
    setFirebaseStatus("error", reason, getFirebaseFix(reason));
    publishButton.disabled = true;
    showToast(reason);
    return;
  }

  setFirebaseStatus("ready", "Firebase connected");
  publishButton.disabled = false;
  showToast("Connected to Firebase");
  unsubscribePosts = await window.CaliFirebase.subscribePosts(
    (firebasePosts) => {
      firebaseBasePosts = normalizePosts(firebasePosts);
      mergeFirebaseData();
      renderPosts();
      if (openPostId) renderDrawer();
    },
    () => showToast("Could not load live posts"),
  );

  unsubscribeComments = await window.CaliFirebase.subscribeComments(
    (firebaseComments) => {
      firebaseCommentsByPost = groupCommentsByPost(firebaseComments);
      mergeFirebaseData();
      renderPosts();
      if (openPostId) renderDrawer();
    },
    () => showToast("Could not load live comments"),
  );
}

function getFirebaseFix(reason) {
  const lowerReason = reason.toLowerCase();
  const currentOrigin = window.location.origin === "null" ? "file:// local file" : window.location.origin;

  if (lowerReason.includes("operation-not-allowed")) {
    return "Fix: Firebase Console > Authentication > Sign-in method > enable Anonymous.";
  }

  if (lowerReason.includes("unauthorized-domain") || window.location.protocol === "file:") {
    return `Fix: open this site from a real web URL instead of ${currentOrigin}. Use your deployed host or a local server, then add that domain in Firebase Authentication > Settings > Authorized domains.`;
  }

  if (lowerReason.includes("cdn") || lowerReason.includes("firebase is not defined")) {
    return "Fix: your browser must be able to load Firebase scripts from gstatic.com. Check internet, blockers, or CSP on your host.";
  }

  if (lowerReason.includes("permission-denied")) {
    return "Fix: publish the latest firestore.rules file in Firebase Console > Firestore Database > Rules.";
  }

  return "Fix checklist: enable Anonymous Auth, create Firestore Database, publish firestore.rules, and test from an authorized domain instead of a file URL.";
}

function setFilter(filter) {
  activeFilter = filter;
  filterButtons.forEach((item) => item.classList.toggle("active", item.dataset.filter === filter));
  renderPosts();
}

function runNavAction(action) {
  if (action === "feed") {
    posts = [...posts].sort((first, second) => Number(second.time === "now") - Number(first.time === "now"));
    searchInput.value = "";
    searchTerm = "";
    setFilter("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "hot") {
    posts = [...posts].sort((first, second) => second.likes - first.likes);
    setFilter("all");
    showToast("Showing hottest posts");
    return;
  }

  if (action === "gallery") {
    setFilter("photos");
    showToast("Showing photo posts");
    return;
  }

  if (action === "comments") {
    const mostDiscussed = [...posts].sort((first, second) => second.comments.length - first.comments.length)[0];
    if (mostDiscussed) openComments(mostDiscussed.id);
    return;
  }

  if (action === "create") {
    postText.focus();
    postText.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "settings") {
    showToast("Anonymous mode is on");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

postText.addEventListener("input", updateCount);
publishButton.addEventListener("click", publishPost);

moodButton.addEventListener("click", () => {
  moodIndex = (moodIndex + 1) % moods.length;
  moodButton.querySelector("span").textContent = moods[moodIndex];
});

photoInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  showToast("Compressing image");

  try {
    selectedImage = await compressImageToBase64(file);
    if (!selectedImage) return;
    imagePreview.innerHTML = `<img src="${selectedImage}" alt="Selected upload preview" />`;
    imagePreview.hidden = false;
  } catch (error) {
    console.error("Image compression failed:", error);
    showToast("Could not read that image");
  }
});

searchInput.addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderPosts();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setFilter(button.dataset.filter);
  });
});

document.querySelector(".add-story").addEventListener("click", () => {
  runNavAction("create");
});

document.querySelectorAll(".mobile-nav button").forEach((button, index) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mobile-nav button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    runNavAction(button.dataset.mobileNav);
  });
});

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-nav]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    runNavAction(button.dataset.nav);
  });
});

notificationsButton.addEventListener("click", () => {
  const count = posts.reduce((total, post) => total + post.comments.length, 0);
  showToast(`${count} anonymous comments are live`);
});

document.querySelectorAll("[data-close-comments]").forEach((button) => {
  button.addEventListener("click", closeComments);
});

drawerCommentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addComment(openPostId, drawerCommentForm.elements.comment.value);
  drawerCommentForm.reset();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && commentDrawer.classList.contains("open")) {
    closeComments();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initializeData();
  console.info("Firebase layer ready:", window.CaliFirebase?.collections);
});

window.addEventListener("beforeunload", () => {
  unsubscribePosts?.();
  unsubscribeComments?.();
});

function compressImageToBase64(file) {
  const maxBase64Length = 850000;
  const maxDimension = 720;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file");
      resolve("");
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      let base64 = canvas.toDataURL("image/jpeg", 0.72);

      if (base64.length > maxBase64Length) {
        base64 = canvas.toDataURL("image/jpeg", 0.5);
      }

      if (base64.length > maxBase64Length) {
        showToast("Image is too large for Firestore");
        resolve("");
        return;
      }

      resolve(base64);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image could not be loaded."));
    };

    image.src = objectUrl;
  });
}
