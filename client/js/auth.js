const authView = document.getElementById('auth-view');
const lobbyView = document.getElementById('lobby-view');
const userBar = document.getElementById('user-bar');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const form = document.getElementById('auth-form');
const submitBtn = document.getElementById('auth-submit');
const errorEl = document.getElementById('auth-error');

let mode = 'login';

function setMode(next) {
  mode = next;
  if (mode === 'login') {
    tabLogin.className = 'flex-1 py-2 rounded bg-emerald-600 text-white font-medium';
    tabRegister.className = 'flex-1 py-2 rounded bg-slate-700 text-slate-200 font-medium';
    submitBtn.textContent = 'Log in';
  } else {
    tabRegister.className = 'flex-1 py-2 rounded bg-emerald-600 text-white font-medium';
    tabLogin.className = 'flex-1 py-2 rounded bg-slate-700 text-slate-200 font-medium';
    submitBtn.textContent = 'Create account';
  }
  errorEl.classList.add('hidden');
}

tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function showLoggedIn(user) {
  authView.classList.add('hidden');
  lobbyView.classList.remove('hidden');
  userBar.innerHTML = `
    <span class="text-slate-300">${user.username}</span>
    <span class="px-2 py-1 rounded bg-slate-800 text-emerald-400 font-mono">$${user.balance}</span>
    <button id="logout-btn" class="text-slate-400 hover:text-white">Log out</button>
  `;
  document.getElementById('logout-btn').addEventListener('click', logout);
  window.dispatchEvent(new CustomEvent('auth:ready', { detail: { user } }));
}

function showLoggedOut() {
  authView.classList.remove('hidden');
  lobbyView.classList.add('hidden');
  userBar.innerHTML = '';
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  // Full reload — guarantees a clean DOM/socket state for the next user.
  window.location.reload();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.add('hidden');
  const username = form.username.value.trim();
  const password = form.password.value;
  const res = await fetch(`/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showError(data.error || 'Something went wrong');
    return;
  }
  // Reload so the lobby wiring runs from a fresh state — avoids duplicate
  // listeners stacking up across login/logout cycles.
  window.location.reload();
});

(async function init() {
  const res = await fetch('/api/auth/me');
  if (res.ok) {
    const data = await res.json();
    showLoggedIn(data.user);
  } else {
    showLoggedOut();
  }
})();
