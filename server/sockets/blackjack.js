import { tableManager } from '../lobby/TableManager.js';
import { BlackjackGame, PHASES } from '../game/BlackjackGame.js';
import { GAME_TYPES, NEXT_ROUND_DELAY_MS } from '../utils/constants.js';
import { User } from '../models/User.js';
import { recordGameHistory, deltaToResult } from '../utils/gameHistory.js';

const tableRoom = (id) => `table:${id}`;

// Per-table timers — keyed by table id so we never schedule duplicates.
const pendingNextRound = new Map();
const bettingTimers = new Map();
const actionTimers = new Map();

function syncTimers(io, table) {
  syncBettingTimer(io, table);
  syncActionTimer(io, table);
}

export function registerBlackjackHandlers(io, socket) {
  socket.on('bj:bet', (payload, ack) => handle(io, socket, ack, (g) => g.placeBet(socket.data.userId, payload?.amount)));
  socket.on('bj:sitOut', (_p, ack) => handle(io, socket, ack, (g) => g.sitOut(socket.data.userId)));
  socket.on('bj:hit', (_p, ack) => handle(io, socket, ack, (g) => g.hit(socket.data.userId)));
  socket.on('bj:stand', (_p, ack) => handle(io, socket, ack, (g) => g.stand(socket.data.userId)));
  socket.on('bj:double', (_p, ack) => handle(io, socket, ack, (g) => g.double(socket.data.userId)));
}

// When a player joins a Blackjack table, attach a game if there isn't one and
// open the betting window so they can play immediately.
export function ensureBlackjackGame(io, table) {
  if (table.gameType !== GAME_TYPES.BLACKJACK) return;
  if (!table.game) table.game = new BlackjackGame(table);
  if (table.game.phase === PHASES.IDLE) {
    table.game.startBetting();
  }
  syncTimers(io, table);
  emitState(io, table);
}

// Called from the lobby graceful-disconnect path. The player is still seated;
// we just want to keep the hand moving if it was their turn.
export function handleBlackjackDisconnect(io, table, playerId) {
  if (table.gameType !== GAME_TYPES.BLACKJACK || !table.game) return;
  const activeIdx = table.game.activeSeatIdx;
  const active = activeIdx !== null ? table.players[activeIdx] : null;
  if (active && active.id === playerId) {
    table.game.forceStand();
    if (table.game.phase === PHASES.SETTLE) afterSettle(io, table);
    else { syncTimers(io, table); emitState(io, table); }
  } else {
    syncTimers(io, table);
    emitState(io, table);
  }
}

// Called from the lobby leave handler so the game can advance past leavers.
// `player` is the HumanPlayer that was just removed from the seats — used to
// persist the forfeit bet so the DB reflects the post-bet balance.
export function handleBlackjackLeave(io, table, playerId, player) {
  if (table.gameType !== GAME_TYPES.BLACKJACK || !table.game) return;
  if (player && player.currentBet > 0) {
    User.findByIdAndUpdate(playerId, { balance: player.balance }).catch((err) =>
      console.error('Forfeit-balance persist failed:', err.message)
    );
    for (const sid of io.sockets.adapter.rooms.get(tableRoom(table.id)) || []) {
      const s = io.sockets.sockets.get(sid);
      if (s && s.data.userId === playerId) s.data.balance = player.balance;
    }
  }
  const wasSettle = table.game.phase === PHASES.SETTLE;
  table.game.handlePlayerLeave(playerId);
  if (!wasSettle && table.game.phase === PHASES.SETTLE) afterSettle(io, table);
  else { syncTimers(io, table); emitState(io, table); }
  if (table.occupiedSeats.length === 0) {
    table.game.phase = PHASES.IDLE;
    cancelNextRound(table.id);
    cancelBettingTimer(table.id);
    cancelActionTimer(table.id);
  }
}

function handle(io, socket, ack, fn) {
  const tableId = socket.data.tableId;
  const table = tableId ? tableManager.get(tableId) : null;
  if (!table || table.gameType !== GAME_TYPES.BLACKJACK || !table.game) {
    return ack?.({ ok: false, error: 'Not at a Blackjack table' });
  }
  try {
    fn(table.game);
  } catch (err) {
    return ack?.({ ok: false, error: err.message });
  }
  if (table.game.phase === PHASES.SETTLE) {
    afterSettle(io, table);
  } else {
    syncTimers(io, table);
    emitState(io, table);
  }
  ack?.({ ok: true });
}

function emitState(io, table) {
  io.to(tableRoom(table.id)).emit('game:state', table.game.getState());
}

async function afterSettle(io, table) {
  cancelBettingTimer(table.id);
  cancelActionTimer(table.id);
  // Persist updated balances in the background.
  for (const p of table.occupiedSeats) {
    if (p.currentBet === 0) continue;
    User.findByIdAndUpdate(p.id, { balance: p.balance }).catch((err) =>
      console.error('Balance persist failed:', err.message)
    );
    for (const sid of io.sockets.adapter.rooms.get(tableRoom(table.id)) || []) {
      const s = io.sockets.sockets.get(sid);
      if (s && s.data.userId === p.id) s.data.balance = p.balance;
    }
  }
  // Log each settled hand (skip players who sat out — currentBet === 0).
  for (const r of table.game.results) {
    const balanceChange = r.payout - r.bet;
    recordGameHistory({
      userId: r.playerId,
      gameType: GAME_TYPES.BLACKJACK,
      result: deltaToResult(balanceChange),
      balanceChange
    });
  }
  emitState(io, table);
  scheduleNextRound(io, table);
}

function scheduleNextRound(io, table) {
  cancelNextRound(table.id);
  const t = setTimeout(() => {
    pendingNextRound.delete(table.id);
    if (table.occupiedSeats.length === 0) {
      table.game.phase = PHASES.IDLE;
      return;
    }
    table.game.startBetting();
    syncTimers(io, table);
    emitState(io, table);
  }, NEXT_ROUND_DELAY_MS);
  pendingNextRound.set(table.id, t);
}

function cancelNextRound(tableId) {
  const t = pendingNextRound.get(tableId);
  if (t) { clearTimeout(t); pendingNextRound.delete(tableId); }
}

// Keeps the per-table betting timer in sync with the game phase.
// Schedules a setTimeout that fires when bettingDeadline is reached and forces
// any undecided players into sit-out so the round can proceed.
function syncBettingTimer(io, table) {
  if (table.game.phase !== PHASES.BETTING) {
    cancelBettingTimer(table.id);
    return;
  }
  if (bettingTimers.has(table.id)) return; // already scheduled
  const ms = Math.max(0, table.game.bettingDeadline - Date.now());
  const t = setTimeout(() => {
    bettingTimers.delete(table.id);
    if (!table.game || table.game.phase !== PHASES.BETTING) return;
    table.game.forceSitOutUndecided();
    if (table.game.phase === PHASES.SETTLE) afterSettle(io, table);
    else { syncTimers(io, table); emitState(io, table); }
  }, ms);
  bettingTimers.set(table.id, t);
}

function cancelBettingTimer(tableId) {
  const t = bettingTimers.get(tableId);
  if (t) { clearTimeout(t); bettingTimers.delete(tableId); }
}

// Per-turn action timer. Fires when the active player runs out of time → auto-stand.
// Always cancels and reschedules on every sync, since the deadline shifts every
// time the active seat changes.
function syncActionTimer(io, table) {
  cancelActionTimer(table.id);
  if (table.game.phase !== PHASES.PLAYING) return;
  if (table.game.activeSeatIdx === null || table.game.actionDeadline === null) return;
  const ms = Math.max(0, table.game.actionDeadline - Date.now());
  const t = setTimeout(() => {
    actionTimers.delete(table.id);
    if (table.game.phase !== PHASES.PLAYING) return;
    table.game.forceStand();
    if (table.game.phase === PHASES.SETTLE) afterSettle(io, table);
    else { syncTimers(io, table); emitState(io, table); }
  }, ms);
  actionTimers.set(table.id, t);
}

function cancelActionTimer(tableId) {
  const t = actionTimers.get(tableId);
  if (t) { clearTimeout(t); actionTimers.delete(tableId); }
}
