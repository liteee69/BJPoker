// Lobby — opens a socket once auth is ready, lets the user pick a game type,
// then renders the 5 tables for that type.

let socket = null;
let allTables = [];
let selectedType = null; // 'blackjack' | 'poker' | null

function connect() {
  if (socket) return socket;
  socket = io();
  socket.on('connect', () => console.log('lobby socket connected', socket.id));
  socket.on('connect_error', (err) => console.error('lobby socket error:', err.message));
  socket.on('table:list', (tables) => {
    allTables = tables;
    if (selectedType) renderTables();
  });
  return socket;
}

function showPicker() {
  selectedType = null;
  document.getElementById('game-picker').classList.remove('hidden');
  document.getElementById('table-section').classList.add('hidden');
}

function showTables(gameType) {
  selectedType = gameType;
  document.getElementById('game-picker').classList.add('hidden');
  document.getElementById('table-section').classList.remove('hidden');
  document.getElementById('table-section-title').textContent =
    gameType === 'blackjack' ? 'Blackjack Tables' : "Texas Hold'em Tables";
  renderTables();
}

function renderTables() {
  const list = document.getElementById('table-list');
  list.innerHTML = '';
  const filtered = allTables.filter((t) => t.gameType === selectedType);
  for (const t of filtered) {
    const occupied = t.players.filter((p) => p !== null).length;
    const min = t.gameType === 'poker' ? `min ${t.minSeats}` : '';
    const full = occupied >= t.maxSeats;
    const btn = full
      ? '<button disabled class="px-3 py-1.5 rounded bg-slate-700 text-slate-400 text-sm font-medium cursor-not-allowed">Full</button>'
      : `<button data-table-id="${t.id}" class="join-btn px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">Join</button>`;
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3';
    row.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="font-medium">${escapeHtml(t.name)}</span>
        <span class="text-slate-400 text-sm">${occupied}/${t.maxSeats} ${min}</span>
      </div>
      ${btn}
    `;
    list.appendChild(row);
  }
  list.querySelectorAll('.join-btn').forEach((btn) => {
    btn.addEventListener('click', () => joinTable(btn.dataset.tableId));
  });
}

function joinTable(tableId) {
  socket.emit('table:join', { tableId }, (resp) => {
    if (!resp?.ok) {
      alert(resp?.error || 'Failed to join');
      return;
    }
    window.location.href = `/game.html?tableId=${encodeURIComponent(tableId)}`;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

document.querySelectorAll('.game-btn').forEach((btn) => {
  btn.addEventListener('click', () => showTables(btn.dataset.game));
});
document.getElementById('back-btn').addEventListener('click', showPicker);

window.addEventListener('auth:ready', () => connect());
