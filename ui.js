// ui.js
// Pure DOM rendering. No Firebase calls happen here.
// Receives data and callbacks from app.js.

// ─── Escape helper ────────────────────────────────────────────────────────────

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;",
  }[c]));
}

// ─── Toast ────────────────────────────────────────────────────────────────────

const toastEl = document.getElementById("toast");
let _toastTimer;

export function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ─── Connection status bar ────────────────────────────────────────────────────

export function setConnectionStatus(status, message) {
  const el = document.getElementById("connectionStatus");
  if (!el) return;
  el.className = `connection-status ${status}`;
  const iconName = status === "ready" ? "wifi" : status === "error" ? "cloud-off" : "loader";
  el.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;
  window.lucide?.createIcons();
}

// ─── Composer auth gate ───────────────────────────────────────────────────────
// Shows/hides the composer textarea + actions based on auth state.

export function setComposerAuthState(user, profile) {
  const avatar   = document.querySelector(".composer .avatar");
  const eyebrow  = document.querySelector(".composer .eyebrow");
  const label    = document.querySelector(".composer-head strong");
  const textarea = document.getElementById("postText");
  const actions  = document.querySelector(".composer-actions");
  const gate     = document.getElementById("composerGate");

  if (user && profile) {
    if (avatar)  avatar.textContent  = profile.username.slice(0, 2).toUpperCase();
    if (eyebrow) eyebrow.textContent = `@${profile.username}`;
    if (label)   label.textContent   = "What's on your mind?";
    if (textarea) textarea.disabled  = false;
    if (actions)  actions.hidden     = false;
    if (gate)     gate.hidden        = true;
  } else {
    if (avatar)  avatar.textContent  = "CA";
    if (eyebrow) eyebrow.textContent = "Anonymous";
    if (label)   label.textContent   = "Sign in to post";
    if (textarea) textarea.disabled  = true;
    if (actions)  actions.hidden     = true;
    if (gate)     gate.hidden        = false;
  }
}

// ─── Rail / topbar user area ──────────────────────────────────────────────────

export function renderUserRail(user, profile, onLogout) {
  const container = document.getElementById("railUser");
  if (!container) return;

  if (user && profile) {
    container.innerHTML = `
      <div class="rail-user">
        <div class="avatar rail-avatar">${escapeHtml(profile.username.slice(0, 2).toUpperCase())}</div>
        <div class="rail-user-info">
          <strong>@${escapeHtml(profile.username)}</strong>
          <span class="post-time">${escapeHtml(user.email)}</span>
        </div>
        <button class="icon-button logout-btn" title="Log out" id="logoutBtn">
          <i data-lucide="log-out"></i>
        </button>
      </div>
    `;
    document.getElementById("logoutBtn")?.addEventListener("click", onLogout);
  } else {
    container.innerHTML = `
      <div class="rail-auth-buttons">
        <button class="post-button full-width" id="railLoginBtn">Log in</button>
        <button class="tool-button full-width" id="railSignupBtn">Create account</button>
      </div>
    `;
    document.getElementById("railLoginBtn")?.addEventListener("click",  () => showAuthModal("login"));
    document.getElementById("railSignupBtn")?.addEventListener("click", () => showAuthModal("signup"));
  }
  window.lucide?.createIcons();
}

// ─── Feed rendering ───────────────────────────────────────────────────────────

export function renderFeed({ posts, loading, activeFilter, searchTerm, currentUser, onAction }) {
  const feed = document.getElementById("feed");
  if (!feed) return;

  if (loading) {
    feed.innerHTML = `
      <div class="empty-state">
        <i data-lucide="loader"></i>
        <strong>Loading the live feed</strong>
        <span>Fresh posts will appear here.</span>
      </div>`;
    window.lucide?.createIcons();
    return;
  }

  const visible = posts.filter((post) => {
    const matchFilter = activeFilter === "all" || post.category === activeFilter;
    const commentText = post.comments.map((c) => (typeof c === "string" ? c : c?.text || "")).join(" ");
    const haystack = `${post.alias} ${post.text} ${post.mood} ${commentText}`.toLowerCase();
    return matchFilter && haystack.includes(searchTerm.toLowerCase());
  });

  if (!visible.length) {
    const msg = posts.length ? "No posts match this view." : "No posts yet. Be the first.";
    const sub = posts.length ? "Try another filter or search." : "Text and photo posts will show up here.";
    feed.innerHTML = `
      <div class="empty-state">
        <i data-lucide="${posts.length ? "search-x" : "sparkles"}"></i>
        <strong>${msg}</strong>
        <span>${sub}</span>
      </div>`;
    window.lucide?.createIcons();
    return;
  }

  feed.innerHTML = visible.map((post) => buildPostCard(post, currentUser)).join("");
  bindPostEvents(feed, posts, currentUser, onAction);
  window.lucide?.createIcons();
}

function buildPostCard(post, currentUser) {
  const image = post.image
    ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="Post image" />`
    : "";

  const preview = post.comments.slice(-2);
  const commentsHtml = preview.length
    ? preview.map((c) => `
        <div class="comment">
          <strong>${escapeHtml(typeof c === "string" ? "Anonymous" : c.alias || "Anonymous")}</strong>
          <span>${escapeHtml(typeof c === "string" ? c : c.text || "")}</span>
        </div>`).join("")
    : `<div class="comment empty-comment"><span>No comments yet.</span></div>`;

  const likedClass = post.liked ? "active" : "";

  return `
    <article class="post-card" data-post-id="${post.id}" data-category="${escapeHtml(post.category)}">
      <header class="post-head">
        <div class="avatar">${escapeHtml(post.alias.slice(0, 2).toUpperCase())}</div>
        <div>
          <strong>@${escapeHtml(post.alias)}</strong>
          <span class="post-time">${escapeHtml(post.time)} · ${escapeHtml(post.mood)}</span>
        </div>
      </header>
      <div class="post-body"><p>${escapeHtml(post.text)}</p></div>
      ${image}
      <div class="post-actions">
        <button class="action-button like-btn ${likedClass}" type="button" data-action="like" title="${currentUser ? "Like" : "Sign in to like"}">
          <i data-lucide="heart"></i><span>${post.likes}</span>
        </button>
        <button class="action-button" type="button" data-action="comments">
          <i data-lucide="message-circle"></i><span>${post.comments.length}</span>
        </button>
      </div>
      <button class="view-comments" type="button" data-action="comments">
        View all ${post.comments.length} comments
      </button>
      <div class="comment-list">${commentsHtml}</div>
      <form class="comment-box">
        <input name="comment" autocomplete="off" maxlength="140"
               placeholder="${currentUser ? "Comment anonymously" : "Sign in to comment"}"
               ${currentUser ? "" : "disabled"} />
        <button type="submit" aria-label="Send comment" ${currentUser ? "" : "disabled"}>
          <i data-lucide="send"></i>
        </button>
      </form>
    </article>`;
}

function bindPostEvents(feed, posts, currentUser, onAction) {
  feed.querySelectorAll(".post-card").forEach((card) => {
    const post = posts.find((p) => p.id === card.dataset.postId);
    if (!post) return;

    card.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => onAction(post, btn.dataset.action));
    });

    card.querySelector(".comment-box")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.comment;
      onAction(post, "comment", input.value);
      input.value = "";
    });
  });
}

// ─── Comment drawer ───────────────────────────────────────────────────────────

export function renderDrawer(post, currentUser) {
  if (!post) return;

  const drawerPost     = document.getElementById("drawerPost");
  const drawerComments = document.getElementById("drawerComments");
  const drawerForm     = document.getElementById("drawerCommentForm");

  drawerPost.innerHTML = `
    <div class="drawer-post-head">
      <div class="avatar">@${escapeHtml(post.alias.slice(0, 2).toUpperCase())}</div>
      <div>
        <strong>@${escapeHtml(post.alias)}</strong>
        <span>${escapeHtml(post.time)} · ${escapeHtml(post.mood)}</span>
      </div>
    </div>
    <p>${escapeHtml(post.text)}</p>
    ${post.image ? `<img src="${escapeHtml(post.image)}" alt="Post image" />` : ""}
  `;

  drawerComments.innerHTML = post.comments.length
    ? post.comments.map((c, i) => `
        <div class="drawer-comment">
          <div class="avatar mini">${String(i + 1).padStart(2, "0")}</div>
          <div>
            <strong>@${escapeHtml(typeof c === "string" ? "anon" : c.alias || "anon")}</strong>
            <p>${escapeHtml(typeof c === "string" ? c : c.text || "")}</p>
          </div>
        </div>`).join("")
    : `<div class="empty-state"><span>No comments yet.</span></div>`;

  // Lock the drawer comment form if not logged in
  const input  = drawerForm?.elements?.comment;
  const submit = drawerForm?.querySelector("button[type=submit]");
  if (input)  input.disabled  = !currentUser;
  if (submit) submit.disabled = !currentUser;
  if (input)  input.placeholder = currentUser ? "Add an anonymous comment" : "Sign in to comment";

  window.lucide?.createIcons();
}

export function openDrawer() {
  const drawer = document.getElementById("commentDrawer");
  drawer?.classList.add("open");
  drawer?.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
}

export function closeDrawer() {
  const drawer = document.getElementById("commentDrawer");
  drawer?.classList.remove("open");
  drawer?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

// ─── Auth modal ───────────────────────────────────────────────────────────────

export function showAuthModal(mode = "login") {
  let modal = document.getElementById("authModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "authModal";
    modal.className = "auth-modal-overlay";
    document.body.appendChild(modal);
  }
  modal.innerHTML = buildAuthModalHTML(mode);
  modal.hidden = false;
  modal.querySelector(".auth-modal-close")?.addEventListener("click", closeAuthModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeAuthModal(); });
  modal.querySelector("[data-switch-mode]")?.addEventListener("click", () => {
    showAuthModal(mode === "login" ? "signup" : "login");
  });
  modal.querySelector("#authForm")?.addEventListener("submit", handleAuthFormSubmit);
  window.lucide?.createIcons();
}

function buildAuthModalHTML(mode) {
  const isLogin = mode === "login";
  return `
    <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
      <button class="auth-modal-close icon-button" aria-label="Close">
        <i data-lucide="x"></i>
      </button>
      <div class="auth-modal-brand">
        <span class="brand-mark">CA</span>
      </div>
      <h2 id="authModalTitle" class="auth-modal-title">
        ${isLogin ? "Welcome back" : "Join Cali Anonymous"}
      </h2>
      <p class="auth-modal-sub">
        ${isLogin ? "Sign in to post, like, and comment." : "Create your anonymous account."}
      </p>

      <form id="authForm" class="auth-form" novalidate>
        <input type="hidden" name="mode" value="${mode}" />

        ${!isLogin ? `
        <div class="auth-field">
          <label for="authUsername">Username</label>
          <input id="authUsername" name="username" type="text"
                 autocomplete="username" maxlength="20"
                 placeholder="letters, numbers, underscores" required />
          <span class="auth-hint">3–20 chars · letters, numbers, underscores only</span>
        </div>` : ""}

        <div class="auth-field">
          <label for="authEmail">Email</label>
          <input id="authEmail" name="email" type="email"
                 autocomplete="email" placeholder="you@example.com" required />
        </div>

        <div class="auth-field">
          <label for="authPassword">Password</label>
          <div class="password-wrap">
            <input id="authPassword" name="password" type="password"
                   autocomplete="${isLogin ? "current-password" : "new-password"}"
                   placeholder="${isLogin ? "Your password" : "Min 8 chars, 1 uppercase, 1 number"}" required />
            <button type="button" class="password-toggle" aria-label="Show password">
              <i data-lucide="eye"></i>
            </button>
          </div>
          ${!isLogin ? `<span class="auth-hint">Min 8 characters · 1 uppercase letter · 1 number</span>` : ""}
        </div>

        <div id="authError" class="auth-error" hidden></div>

        <button type="submit" class="post-button auth-submit" id="authSubmitBtn">
          <span>${isLogin ? "Sign in" : "Create account"}</span>
        </button>
      </form>

      <p class="auth-switch">
        ${isLogin ? "Don't have an account?" : "Already have an account?"}
        <button type="button" class="auth-link" data-switch-mode>
          ${isLogin ? "Sign up" : "Log in"}
        </button>
      </p>
    </div>
  `;
}

export function closeAuthModal() {
  const modal = document.getElementById("authModal");
  if (modal) modal.hidden = true;
}

// Wire up the password visibility toggle (called after modal renders)
document.addEventListener("click", (e) => {
  if (e.target.closest(".password-toggle")) {
    const wrap  = e.target.closest(".password-wrap");
    const input = wrap?.querySelector("input");
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    const icon = wrap.querySelector("[data-lucide]");
    if (icon) { icon.dataset.lucide = showing ? "eye" : "eye-off"; window.lucide?.createIcons(); }
  }
});

// handleAuthFormSubmit is set from app.js to avoid circular imports
let _authSubmitHandler = null;
export function setAuthSubmitHandler(fn) { _authSubmitHandler = fn; }

function handleAuthFormSubmit(e) {
  e.preventDefault();
  _authSubmitHandler?.(e.currentTarget);
}

export function setAuthFormLoading(loading) {
  const btn  = document.getElementById("authSubmitBtn");
  const span = btn?.querySelector("span");
  if (btn)  btn.disabled = loading;
  if (span) span.textContent = loading ? "Please wait…" : (
    document.querySelector("input[name=mode]")?.value === "login" ? "Sign in" : "Create account"
  );
}

export function showAuthError(message) {
  const el = document.getElementById("authError");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

export function clearAuthError() {
  const el = document.getElementById("authError");
  if (el) el.hidden = true;
}
