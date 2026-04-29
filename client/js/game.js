// Game page — Blackjack renderer for now. Poker takes over in Phase 6.

const params = new URLSearchParams(window.location.search);
const tableId = params.get('tableId');
if (!tableId) window.location.href = '/';

const socket = io();
let me = null;
let lastState = null;
let countdownInterval = null;

const dealerCardsEl = document.getElementById('dealer-cards');
const dealerScoreEl = document.getElementById('dealer-score');
const otherSeatsEl = document.getElementById('other-seats');
const mySeatEl = document.getElementById('my-seat');
const actionsEl = document.getElementById('actions');
const tableNameEl = document.getElementById('table-name');
const phaseBadgeEl = document.getElementById('phase-badge');
const bankEl = document.getElementById('bank');
const resultBanner = document.getElementById('result-banner');
const boardLabelEl = document.getElementById('board-label');

socket.on('connect_error', (err) => {
  if (err.message === 'Not authenticated') window.location.href = '/';
});

socket.on('connect', async () => {
  const r = await fetch('/api/auth/me').then((r) => r.json()).catch(() => null);
  me = r?.user?.id || null;
  socket.emit('table:join', { tableId }, (resp) => {
    if (!resp?.ok) {
      alert(resp?.error || 'Failed to join table');
      window.location.href = '/';
    }
  });
});

socket.on('table:state', (table) => { tableNameEl.textContent = table.name; });
socket.on('game:state', (state) => { lastState = state; render(state); });

document.getElementById('leave-btn').addEventListener('click', () => {
  socket.emit('table:leave');
  window.location.href = '/';
});

function render(state) {
  if (state.gameType === 'poker') {
    document.body.classList.add('poker-mode');
    document.body.classList.remove('blackjack-mode');
    return renderPoker(state);
  }
  document.body.classList.remove('poker-mode');
  document.body.classList.add('blackjack-mode');
  if (state.gameType !== 'blackjack') return;
  boardLabelEl.textContent = 'Dealer';
  phaseBadgeEl.textContent = phaseLabel(state.phase);
  renderDealer(state);
  renderSeats(state);
  renderActions(state);
  renderResults(state);
  if (state.phase !== 'betting' && state.phase !== 'playing') stopCountdown();
}

function phaseLabel(phase) {
  return {
    idle: 'Waiting',
    betting: 'Betting',
    playing: 'Playing',
    dealerTurn: "Dealer's turn",
    settle: 'Settled'
  }[phase] || phase;
}

function renderDealer(state) {
  const cards = state.dealer.cards.length > 0 ? state.dealer.cards.map(cardHtml).join('') : '';
  const scoreClass = state.dealer.score > 21 ? 'score-banner score-banner-big bust'
    : (state.dealer.score === 21 && state.dealer.cards.length === 2 ? 'score-banner score-banner-big bj' : 'score-banner score-banner-big');
  const scoreBlock = state.dealer.cards.length === 0
    ? ''
    : `<div class="${scoreClass}">${state.dealer.score > 21 ? 'BUST · ' : ''}Score: ${state.dealer.score}</div>`;
  dealerCardsEl.innerHTML = `
    <div class="felt-area">
      <div class="name-banner name-banner-big" style="background: linear-gradient(180deg,#1f2937 0%,#0f172a 100%); border-color:#0f172a;">Dealer</div>
      <div style="display:flex; gap:8px; min-height:90px;">${cards}</div>
      ${scoreBlock}
    </div>
  `;
  dealerScoreEl.textContent = '';
}

// ---------- Seats: 5 fixed positions for opponents + big seat at bottom-center ----------

function renderSeats(state) {
  const myIdx = state.seats.findIndex((s) => s && s.id === me);

  // Opponents at fixed positions (clockwise from self), empty placeholders elsewhere.
  otherSeatsEl.innerHTML = '';
  const totalSeats = state.seats.length;
  for (let pos = 0; pos < OPPONENT_POSITIONS.length; pos++) {
    const opponentIdx = myIdx === -1 ? pos : (myIdx + pos + 1) % totalSeats;
    const opponentSeat = state.seats[opponentIdx];
    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    Object.assign(wrap.style, OPPONENT_POSITIONS[pos]);
    wrap.innerHTML = opponentSeat
      ? bjSmallSeatHtml(opponentSeat, state.activeSeatIdx === opponentIdx)
      : bjEmptySeatHtml();
    otherSeatsEl.appendChild(wrap);
  }

  // Your big seat (or "spectating" placeholder if not seated).
  if (myIdx === -1) {
    mySeatEl.innerHTML = '<div class="text-emerald-300/70 italic">Spectating — wait for an empty seat to free up.</div>';
    return;
  }
  const mySeat = state.seats[myIdx];
  bankEl.textContent = `$${mySeat.balance}`;
  mySeatEl.innerHTML = bjBigSeatHtml(mySeat, state.activeSeatIdx === myIdx);
}

// Fixed opponent positions (used by both Poker and Blackjack), clockwise from the seat
// immediately to your right. Position 0 = next seat clockwise (mid-right), position 4 = seat to your left.
const OPPONENT_POSITIONS = [
  { right: '4%',  top: '55%', transform: 'translateY(-50%)' }, // mid-right
  { right: '18%', top: '5%' },                                   // top-right
  { left: '50%',  top: '0%',  transform: 'translateX(-50%)' },   // top-center
  { left: '18%',  top: '5%' },                                   // top-left
  { left: '4%',   top: '55%', transform: 'translateY(-50%)' }   // mid-left
];

function pokerEmptySeatHtml() {
  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px; opacity:0.45;">
      <div style="display:flex; gap:3px;">
        <div style="width:38px; height:54px; border:2px dashed rgba(255,255,255,0.3); border-radius:6px; background:rgba(0,0,0,0.15);"></div>
        <div style="width:38px; height:54px; border:2px dashed rgba(255,255,255,0.3); border-radius:6px; background:rgba(0,0,0,0.15);"></div>
      </div>
      <div class="balance-banner" style="background:linear-gradient(180deg,#666,#333); color:#bbb; border-color:#444;">--</div>
      <div class="name-banner name-banner-small" style="background:linear-gradient(180deg,#444,#222); border-color:#555; color:#aaa;">Empty</div>
    </div>
  `;
}

function bjScoreBadge(seat, big = false) {
  const cards = seat.hand?.cards;
  if (!cards || cards.length === 0) return '';
  const score = seat.hand.score;
  const isBust = score > 21;
  const isBJ = score === 21 && cards.length === 2;
  const cls = isBust ? 'bust' : (isBJ ? 'bj' : '');
  const sizeCls = big ? 'score-banner-big' : '';
  const text = isBust ? `BUST · ${score}` : (isBJ ? `BLACKJACK!` : `Score: ${score}`);
  return `<div class="score-banner ${sizeCls} ${cls}">${text}</div>`;
}

function bjBubbleHtml(seat) {
  if (seat.decision === 'sitOut') return `<div class="action-bubble fold">Sit Out</div>`;
  if (seat.decision === 'bet' && seat.currentBet > 0) return `<div class="action-bubble">Bet $${seat.currentBet}</div>`;
  return '';
}

function bjSmallSeatHtml(seat, isActive) {
  const handCards = seat.hand?.cards;
  const cards = (handCards && handCards.length > 0) ? handCards.map(miniCardHtml).join('') : '';
  const sittingOut = seat.decision === 'sitOut';
  const chips = seat.currentBet > 0 ? chipStackHtml(seat.currentBet) : '';
  const activeClass = isActive ? 'poker-active' : '';
  const scoreBadge = bjScoreBadge(seat, false);
  const bubble = bjBubbleHtml(seat);
  const seatOpacity = seat.disconnected ? 0.5 : (sittingOut ? 0.45 : 1);
  return `
    <div class="${activeClass}" style="display:flex; flex-direction:column; align-items:center; gap:4px; opacity:${seatOpacity};">
      <div style="display:flex; gap:8px; align-items:flex-end; min-height:54px;">
        <div style="display:flex; gap:3px;">${cards}</div>
        ${chips}
      </div>
      ${scoreBadge}
      <div class="balance-banner">$${seat.balance}</div>
      <div class="name-banner name-banner-small">${escapeHtml(seat.username)}</div>
      ${bubble}
      ${offlineBadge(seat)}
    </div>
  `;
}

function bjBigSeatHtml(seat, isActive) {
  const handCards = seat.hand?.cards || [];
  const cards = handCards.length > 0 ? handCards.map(cardHtml).join('') : '';
  const sittingOut = seat.decision === 'sitOut';
  const chips = seat.currentBet > 0 ? chipStackHtml(seat.currentBet) : '';
  const activeClass = isActive ? 'poker-active' : '';
  const scoreBadge = bjScoreBadge(seat, true);
  const bubble = bjBubbleHtml(seat);
  const seatOpacity = sittingOut ? 0.5 : 1;
  return `
    <div class="${activeClass}" style="display:flex; flex-direction:column; align-items:center; gap:6px; opacity:${seatOpacity};">
      <div style="display:flex; gap:14px; align-items:flex-end; min-height:90px;">
        <div style="display:flex; gap:6px;">${cards}</div>
        ${chips}
      </div>
      ${scoreBadge}
      <div class="balance-banner balance-banner-big">$${seat.balance}</div>
      <div class="name-banner name-banner-big" style="background: linear-gradient(180deg,#facc15 0%,#a16207 100%); color:#3a2700; border-color:#7a4a00;">
        ${escapeHtml(seat.username)} (you)
      </div>
      ${bubble}
    </div>
  `;
}

// "Offline" pill rendered under a seat while a player is disconnected within the
// reconnect grace window. Hidden for the local user (their own card always shows them online).
function offlineBadge(seat) {
  if (!seat.disconnected) return '';
  if (seat.id === me) return '';
  return '<div class="action-bubble fold" style="background:#475569; border-color:#334155; color:#e2e8f0;">Offline…</div>';
}

// Empty-seat placeholder for blackjack — no card-shaped boxes, just the faded name banner.
function bjEmptySeatHtml() {
  return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px; opacity:0.4; min-height:54px; justify-content:flex-end;">
      <div class="name-banner name-banner-small" style="background:linear-gradient(180deg,#444,#222); border-color:#555; color:#aaa;">Empty</div>
    </div>
  `;
}

// ---------- Actions ----------

function renderActions(state) {
  actionsEl.innerHTML = '';
  if (state.phase === 'betting') return renderBetting(state);
  if (state.phase === 'playing') return renderPlaying(state);
  if (state.phase === 'settle') {
    actionsEl.innerHTML = '<p class="text-emerald-200">Next round in 5 seconds…</p>';
    return;
  }
  if (state.phase === 'dealerTurn') {
    actionsEl.innerHTML = '<p class="text-emerald-200">Dealer is playing…</p>';
    return;
  }
  actionsEl.innerHTML = '<p class="text-emerald-300/70">Waiting for players…</p>';
}

function mySeat(state) {
  return state.seats.find((s) => s && s.id === me) || null;
}

function renderBetting(state) {
  const my = mySeat(state);
  if (!my) {
    actionsEl.innerHTML = '<p class="text-emerald-300/70">Spectating…</p>';
    return;
  }
  const timer = state.bettingDeadline
    ? `<span id="bet-timer" class="ml-3 px-2 py-1 rounded bg-emerald-950/60 text-yellow-300 font-mono text-sm">--s</span>`
    : '';
  if (my.decision) {
    actionsEl.innerHTML = `
      <div class="flex items-center">
        <p class="text-emerald-200">${my.decision === 'sitOut' ? 'Sitting this round out.' : `Bet placed: $${my.currentBet}. Waiting for others…`}</p>
        ${timer}
      </div>
    `;
    if (state.bettingDeadline) startCountdown(state.bettingDeadline, 'bet-timer');
    return;
  }
  actionsEl.innerHTML = `
    <div class="flex flex-col items-center gap-2">
      <div class="flex items-center gap-3 flex-wrap justify-center">
        <span class="text-emerald-200 text-sm">Bet (10–500):</span>
        <input id="bet-amount" type="number" min="10" max="500" step="10" value="50"
               class="w-28 px-3 py-2 rounded bg-emerald-950 border border-emerald-700 text-white" />
        <button id="bet-btn" class="poker-action-btn">Place Bet</button>
        <button id="sitout-btn" class="poker-action-btn fold">Sit Out</button>
        ${timer}
      </div>
      <p id="bet-error" class="text-red-300 text-sm hidden"></p>
    </div>
  `;
  document.getElementById('bet-btn').addEventListener('click', () => {
    const amount = Number(document.getElementById('bet-amount').value);
    socket.emit('bj:bet', { amount }, ackHandler('bet-error'));
  });
  document.getElementById('sitout-btn').addEventListener('click', () => {
    socket.emit('bj:sitOut', {}, ackHandler('bet-error'));
  });
  if (state.bettingDeadline) startCountdown(state.bettingDeadline);
}

function renderPlaying(state) {
  const isMyTurn = state.activeSeatIdx !== null && state.seats[state.activeSeatIdx]?.id === me;
  const timer = state.actionDeadline
    ? `<span id="action-timer" class="px-2 py-1 rounded bg-red-950/60 text-yellow-300 font-mono text-sm">--s</span>`
    : '';
  if (!isMyTurn) {
    const active = state.activeSeatIdx !== null ? state.seats[state.activeSeatIdx] : null;
    actionsEl.innerHTML = `
      <div class="flex items-center gap-3">
        <p class="text-emerald-200">Waiting on ${active ? escapeHtml(active.username) : 'next player'}…</p>
        ${timer}
      </div>
    `;
    if (state.actionDeadline) startCountdown(state.actionDeadline, 'action-timer');
    return;
  }
  const my = mySeat(state);
  const canDouble = my && my.hand && my.hand.cards.length === 2 && my.balance >= my.currentBet;
  actionsEl.innerHTML = `
    <div class="flex flex-col items-center gap-2">
      <div class="flex items-center gap-3 flex-wrap justify-center">
        <button id="hit-btn" class="poker-action-btn">Hit</button>
        <button id="stand-btn" class="poker-action-btn fold">Stand</button>
        <button id="double-btn" class="poker-action-btn allin" ${canDouble ? '' : 'disabled'}>Double ×2</button>
        ${timer}
      </div>
      <p id="action-error" class="text-red-300 text-sm hidden"></p>
    </div>
  `;
  document.getElementById('hit-btn').addEventListener('click', () => socket.emit('bj:hit', {}, ackHandler('action-error')));
  document.getElementById('stand-btn').addEventListener('click', () => socket.emit('bj:stand', {}, ackHandler('action-error')));
  if (canDouble) {
    document.getElementById('double-btn').addEventListener('click', () => socket.emit('bj:double', {}, ackHandler('action-error')));
  }
  if (state.actionDeadline) startCountdown(state.actionDeadline, 'action-timer');
}

// ---------- Results: only your own ----------

function renderResults(state) {
  if (state.phase !== 'settle' || !state.results || state.results.length === 0) {
    resultBanner.classList.add('hidden');
    return;
  }
  const my = state.results.find((r) => r.playerId === me);
  if (!my) {
    resultBanner.classList.add('hidden');
    return;
  }
  const colorMap = {
    win: 'bg-emerald-600 text-white',
    blackjack: 'bg-yellow-400 text-yellow-950',
    push: 'bg-slate-600 text-white',
    lose: 'bg-red-700 text-white'
  };
  const labelMap = { win: 'YOU WIN', blackjack: 'BLACKJACK!', push: 'PUSH', lose: 'YOU LOSE' };
  const sign = (my.outcome === 'win' || my.outcome === 'blackjack') ? '+' : (my.outcome === 'lose' ? '-' : '');
  const amount = my.outcome === 'blackjack'
    ? my.payout - my.bet
    : (my.outcome === 'win' ? my.bet : (my.outcome === 'lose' ? my.bet : 0));
  resultBanner.classList.remove('hidden');
  resultBanner.innerHTML = `
    <div class="inline-block px-6 py-2 rounded-lg text-lg font-bold ${colorMap[my.outcome]}">
      ${labelMap[my.outcome]} ${sign}$${amount}
    </div>
  `;
}

// ---------- Countdown ----------

function startCountdown(deadline, elementId = 'bet-timer') {
  stopCountdown();
  const tick = () => {
    const ms = Math.max(0, deadline - Date.now());
    const sec = Math.ceil(ms / 1000);
    const el = document.getElementById(elementId);
    if (el) el.textContent = `${sec}s`;
    if (ms <= 0) stopCountdown();
  };
  tick();
  countdownInterval = setInterval(tick, 200);
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// ---------- Helpers ----------

function ackHandler(errorElId) {
  return (resp) => {
    if (resp?.ok) return;
    const el = document.getElementById(errorElId);
    if (el) {
      el.textContent = resp?.error || 'Action failed';
      el.classList.remove('hidden');
    }
  };
}

function cardHtml(c) {
  if (!c || c.hidden) {
    return '<div class="card hidden" style="width:64px;height:90px;border-radius:6px;border:1px solid #7f1d1d;background:repeating-linear-gradient(45deg,#b91c1c,#b91c1c 8px,#7f1d1d 8px,#7f1d1d 16px);flex-shrink:0;display:inline-block;"></div>';
  }
  const colorClass = c.color === 'red' ? 'red' : '';
  return `
    <div class="card ${colorClass}">
      <span class="rank-tl">${c.rank}<br>${c.symbol}</span>
      <span class="suit">${c.symbol}</span>
      <span class="rank-br">${c.rank}<br>${c.symbol}</span>
    </div>
  `;
}

function miniCardHtml(c) {
  if (!c || c.hidden) {
    // Inline styles guarantee visibility regardless of CSS load order / Tailwind reset.
    return '<div class="card card-mini hidden" style="width:38px;height:54px;border-radius:6px;border:1px solid #7f1d1d;background:repeating-linear-gradient(45deg,#b91c1c,#b91c1c 6px,#7f1d1d 6px,#7f1d1d 12px);flex-shrink:0;display:inline-block;"></div>';
  }
  const colorClass = c.color === 'red' ? 'red' : '';
  return `
    <div class="card card-mini ${colorClass}">
      <span class="rank-tl">${c.rank}</span>
      <span class="suit">${c.symbol}</span>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ============================== POKER ==============================

function renderPoker(state) {
  boardLabelEl.textContent = 'Dealer';
  phaseBadgeEl.textContent = pokerPhaseLabel(state.phase);

  // Felt area: pot + community cards inside a single rounded "table" panel.
  const community = state.community.length > 0
    ? state.community.map(cardHtml).join('')
    : Array(5).fill('<div class="card" style="width:64px;height:90px;border:2px dashed rgba(255,255,255,0.2);background:transparent;box-shadow:none;"></div>').join('');
  const potBlock = state.phase === 'idle'
    ? ''
    : `<div class="poker-pot"><div class="poker-pot-icon"></div><span>$${state.pot}</span></div>`;
  dealerCardsEl.innerHTML = `
    <div class="felt-area">
      ${potBlock}
      <div style="display:flex; gap:8px; min-height:90px;">${community}</div>
    </div>
  `;
  dealerScoreEl.textContent = '';

  // Seats: 5 fixed positions for opponents, mapped clockwise from self.
  const myIdx = state.seats.findIndex((s) => s && s.id === me);
  otherSeatsEl.innerHTML = '';
  const totalSeats = state.seats.length;
  const positions = OPPONENT_POSITIONS;
  for (let pos = 0; pos < positions.length; pos++) {
    let opponentIdx, opponentSeat;
    if (myIdx === -1) {
      // Spectator — just render seats 0..n-1 in fixed positions.
      opponentIdx = pos;
    } else {
      // Map fixed position pos to the seat at offset (pos+1) from self, clockwise.
      opponentIdx = (myIdx + pos + 1) % totalSeats;
    }
    opponentSeat = state.seats[opponentIdx];
    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    Object.assign(wrap.style, positions[pos]);
    wrap.innerHTML = opponentSeat
      ? pokerSmallSeatHtml(opponentSeat, state.activeSeatIdx === opponentIdx, state.dealerButtonIdx === opponentIdx)
      : pokerEmptySeatHtml();
    otherSeatsEl.appendChild(wrap);
  }

  if (myIdx === -1) {
    mySeatEl.innerHTML = '<div class="text-emerald-300/70 italic">Spectating — wait for an empty seat to free up.</div>';
  } else {
    const my = state.seats[myIdx];
    bankEl.textContent = `$${my.balance}`;
    mySeatEl.innerHTML = pokerBigSeatHtml(my, state.activeSeatIdx === myIdx, state.dealerButtonIdx === myIdx);
  }

  renderPokerActions(state, myIdx);
  renderPokerResults(state);
  if (state.phase === 'idle' || state.phase === 'showdown') stopCountdown();
}

function pokerPhaseLabel(phase) {
  return {
    idle: 'Waiting',
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown'
  }[phase] || phase;
}

function pokerSmallSeatHtml(seat, isActive, isDealer) {
  const handCards = seat.hand?.cards;
  const cards = (handCards && handCards.length > 0)
    ? handCards.map(miniCardHtml).join('')
    : miniCardHtml({ hidden: true }) + miniCardHtml({ hidden: true });
  const folded = seat.folded;
  const dealerPip = isDealer ? '<span class="dealer-pip">D</span>' : '';
  const bubble = bubbleHtml(seat);
  const chips = seat.currentBet > 0 ? chipStackHtml(seat.currentBet) : '';
  const activeClass = isActive ? 'poker-active' : '';
  const seatOpacity = seat.disconnected ? 0.5 : (folded ? 0.45 : 1);
  return `
    <div class="${activeClass}" style="display:flex; flex-direction:column; align-items:center; gap:4px; opacity:${seatOpacity};">
      <div style="display:flex; gap:8px; align-items:flex-end;">
        <div style="display:flex; gap:3px;">${cards}</div>
        ${chips}
      </div>
      <div class="balance-banner balance-banner">$${seat.balance}</div>
      <div class="name-banner name-banner-small">${escapeHtml(seat.username)}${dealerPip}</div>
      ${bubble}
      ${offlineBadge(seat)}
    </div>
  `;
}

function pokerBigSeatHtml(seat, isActive, isDealer) {
  const handCards = seat.hand?.cards || [];
  const cards = handCards.length > 0
    ? handCards.map(cardHtml).join('')
    : cardHtml({ hidden: true }) + cardHtml({ hidden: true });
  const folded = seat.folded;
  const dealerPip = isDealer ? '<span class="dealer-pip">D</span>' : '';
  const bubble = bubbleHtml(seat);
  const chips = seat.currentBet > 0 ? chipStackHtml(seat.currentBet) : '';
  const activeClass = isActive ? 'poker-active' : '';
  const seatOpacity = folded ? 0.5 : 1;
  return `
    <div class="${activeClass}" style="display:flex; flex-direction:column; align-items:center; gap:6px; opacity:${seatOpacity};">
      <div style="display:flex; gap:14px; align-items:flex-end;">
        <div style="display:flex; gap:6px;">${cards}</div>
        ${chips}
      </div>
      <div class="balance-banner balance-banner-big">$${seat.balance}</div>
      <div class="name-banner name-banner-big" style="background: linear-gradient(180deg,#facc15 0%,#a16207 100%); color:#3a2700; border-color:#7a4a00;">
        ${escapeHtml(seat.username)} (you)${dealerPip}
      </div>
      ${bubble}
    </div>
  `;
}

// Render a small ack bubble (e.g. "Call", "Fold") below the seat for their last action.
function bubbleHtml(seat) {
  const action = seat.lastAction;
  if (!action) return '';
  const labels = { fold: 'Fold', check: 'Check', call: 'Call', raise: 'Raise', allin: 'ALL-IN' };
  const label = labels[action] || action;
  return `<div class="action-bubble ${action}">${label}</div>`;
}

// Render a small stack of chips. Picks colors based on bet size — purely cosmetic.
function chipStackHtml(amount) {
  if (amount <= 0) return '';
  // Pick 3-5 chips spanning denominations.
  const tiers = [
    { min: 1,    cls: 'chip-yellow' },
    { min: 25,   cls: 'chip-blue'   },
    { min: 100,  cls: 'chip-red'    },
    { min: 250,  cls: 'chip-green'  },
    { min: 500,  cls: 'chip-black'  }
  ];
  const visible = tiers.filter((t) => amount >= t.min);
  return `
    <div class="chip-stack" title="$${amount}">
      ${visible.map((t) => `<span class="chip ${t.cls}"></span>`).join('')}
    </div>
  `;
}

function renderPokerActions(state, myIdx) {
  actionsEl.innerHTML = '';
  if (state.phase === 'idle') {
    actionsEl.innerHTML = '<p class="text-emerald-300/70">Waiting for a second player…</p>';
    return;
  }
  if (state.phase === 'showdown') {
    actionsEl.innerHTML = '<p class="text-emerald-200">Next hand in 5 seconds…</p>';
    return;
  }
  // Betting phase
  const isMyTurn = state.activeSeatIdx !== null && state.seats[state.activeSeatIdx]?.id === me;
  const timer = state.actionDeadline
    ? `<span id="action-timer" class="px-2 py-1 rounded bg-red-950/60 text-yellow-300 font-mono text-sm">--s</span>`
    : '';
  if (myIdx === -1) {
    actionsEl.innerHTML = `<p class="text-emerald-300/70">Spectating — wait for the next hand.</p>`;
    return;
  }
  if (!isMyTurn) {
    const active = state.activeSeatIdx !== null ? state.seats[state.activeSeatIdx] : null;
    actionsEl.innerHTML = `
      <div class="flex items-center gap-3">
        <p class="text-emerald-200">Waiting on ${active ? escapeHtml(active.username) : 'next player'}…</p>
        ${timer}
      </div>
    `;
    if (state.actionDeadline) startCountdown(state.actionDeadline, 'action-timer');
    return;
  }
  const my = state.seats[myIdx];
  const owe = state.currentBet - (my.currentBet || 0);
  const canCheck = owe <= 0;
  const minRaiseTo = state.currentBet + state.minRaise;
  const someoneAllIn = state.seats.some((s) => s && s.allIn);
  const canCall = owe > 0 && my.balance >= owe;
  const canRaise = !someoneAllIn && my.balance >= (minRaiseTo - (my.currentBet || 0));
  const canAllIn = my.balance > 0;
  const callLabel = owe > 0 ? `Call $${owe}` : 'Call';
  const allInLabel = `All-In $${my.balance}`;
  actionsEl.innerHTML = `
    <div class="flex flex-col items-center gap-3 w-full">
      <div class="flex items-center gap-3 flex-wrap justify-center">
        <button id="fold-btn" class="poker-action-btn fold">Fold</button>
        <button id="check-btn" class="poker-action-btn" ${canCheck ? '' : 'disabled'}>Check</button>
        <button id="call-btn" class="poker-action-btn" ${canCall ? '' : 'disabled'}>${callLabel}</button>
        <input id="raise-amount" type="number" min="${minRaiseTo}" step="5" value="${minRaiseTo}" ${canRaise ? '' : 'disabled'}
               class="w-24 px-3 py-2 rounded bg-emerald-950 border border-emerald-700 text-white disabled:opacity-50" />
        <button id="raise-btn" class="poker-action-btn" ${canRaise ? '' : 'disabled'}>Raise</button>
        <button id="allin-btn" class="poker-action-btn allin" ${canAllIn ? '' : 'disabled'}>${allInLabel}</button>
        ${timer}
      </div>
      <p id="poker-error" class="text-red-300 text-sm hidden"></p>
    </div>
  `;
  document.getElementById('fold-btn').addEventListener('click', () => socket.emit('pk:fold', {}, ackHandler('poker-error')));
  if (canCheck) document.getElementById('check-btn').addEventListener('click', () => socket.emit('pk:check', {}, ackHandler('poker-error')));
  if (canCall) document.getElementById('call-btn').addEventListener('click', () => socket.emit('pk:call', {}, ackHandler('poker-error')));
  if (canRaise) document.getElementById('raise-btn').addEventListener('click', () => {
    const raiseTo = Number(document.getElementById('raise-amount').value);
    socket.emit('pk:raise', { raiseTo }, ackHandler('poker-error'));
  });
  if (canAllIn) document.getElementById('allin-btn').addEventListener('click', () => socket.emit('pk:allin', {}, ackHandler('poker-error')));
  if (state.actionDeadline) startCountdown(state.actionDeadline, 'action-timer');
}

function renderPokerResults(state) {
  if (state.phase !== 'showdown' || !state.results || state.results.length === 0) {
    resultBanner.classList.add('hidden');
    return;
  }
  const my = state.results.find((r) => r.playerId === me);
  if (!my) { resultBanner.classList.add('hidden'); return; }
  const winners = state.results.filter((r) => r.won);
  const winnerNames = winners.map((w) => `${escapeHtml(w.username)} (${prettyRank(w.rank)})`).join(', ');
  const net = my.netChange;
  let myLabel, color;
  if (my.won) {
    myLabel = net > 0 ? `YOU WIN +$${net}` : 'YOU WIN';
    color = 'bg-emerald-600 text-white';
  } else if (my.rank === 'FOLDED') {
    myLabel = net < 0 ? `FOLDED -$${-net}` : 'FOLDED';
    color = 'bg-slate-600 text-white';
  } else {
    myLabel = `YOU LOSE -$${-net}`;
    color = 'bg-red-700 text-white';
  }
  resultBanner.classList.remove('hidden');
  resultBanner.innerHTML = `
    <div class="inline-block px-6 py-2 rounded-lg text-lg font-bold ${color}">
      ${myLabel}
    </div>
    <div class="mt-1 text-emerald-200 text-sm">Winner: ${winnerNames || '—'}</div>
  `;
}

function prettyRank(rank) {
  return {
    HIGH_CARD: 'High Card',
    PAIR: 'Pair',
    TWO_PAIR: 'Two Pair',
    THREE_OF_A_KIND: 'Trips',
    STRAIGHT: 'Straight',
    FLUSH: 'Flush',
    FULL_HOUSE: 'Full House',
    FOUR_OF_A_KIND: 'Quads',
    STRAIGHT_FLUSH: 'Straight Flush',
    ROYAL_FLUSH: 'Royal Flush',
    UNCONTESTED: 'all folded',
    FOLDED: 'folded'
  }[rank] || rank;
}
