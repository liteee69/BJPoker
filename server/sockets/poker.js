import { tableManager } from '../lobby/TableManager.js';
import { PokerGame, PHASES } from '../game/PokerGame.js';
import { GAME_TYPES, NEXT_ROUND_DELAY_MS } from '../utils/constants.js';
import { User } from '../models/User.js';
import { recordGameHistory, deltaToResult } from '../utils/gameHistory.js';

const tableRoom = (id) => `table:${id}`;

// Per-table timers — keyed by table id so we never schedule duplicates.
const actionTimers = new Map();
const pendingNextHand = new Map();

export function registerPokerHandlers(io, socket) {
  socket.on('pk:fold', (_p, ack) => handle(io, socket, ack, (g) => g.fold(socket.data.userId)));
  socket.on('pk:check', (_p, ack) => handle(io, socket, ack, (g) => g.check(socket.data.userId)));
  socket.on('pk:call', (_p, ack) => handle(io, socket, ack, (g) => g.call(socket.data.userId)));
  socket.on('pk:raise', (payload, ack) => handle(io, socket, ack, (g) => g.raise(socket.data.userId, payload?.raiseTo)));
  socket.on('pk:allin', (_p, ack) => handle(io, socket, ack, (g) => g.allIn(socket.data.userId)));
}

// When a player joins a Poker table, attach a game if there isn't one and start a hand
// once at least 2 are seated.
export function ensurePokerGame(io, table) {
  if (table.gameType !== GAME_TYPES.POKER) return;
  if (!table.game) table.game = new PokerGame(table);
  if (table.game.phase === PHASES.IDLE && table.occupiedSeats.length >= 2) {
    table.game.startHand();
  }
  syncActionTimer(io, table);
  emitPokerState(io, table);
}

// Called from the lobby graceful-disconnect path. The player is still seated;
// auto-action if they hold the turn so the hand keeps moving.
export function handlePokerDisconnect(io, table, playerId) {
  if (table.gameType !== GAME_TYPES.POKER || !table.game) return;
  const activeIdx = table.game.activeSeatIdx;
  const active = activeIdx !== null ? table.players[activeIdx] : null;
  if (active && active.id === playerId) {
    table.game.forceAutoAction();
    if (table.game.phase === PHASES.SHOWDOWN) afterShowdown(io, table);
    else { syncActionTimer(io, table); emitPokerState(io, table); }
  } else {
    syncActionTimer(io, table);
    emitPokerState(io, table);
  }
}

// Called from the lobby leave handler.
export function handlePokerLeave(io, table, playerId, player) {
  if (table.gameType !== GAME_TYPES.POKER || !table.game) return;
  // Persist the leaver's current balance so a forfeited bet sticks in the DB.
  if (player) {
    User.findByIdAndUpdate(playerId, { balance: player.balance }).catch((err) =>
      console.error('Forfeit-balance persist failed:', err.message)
    );
    for (const sid of io.sockets.adapter.rooms.get(tableRoom(table.id)) || []) {
      const s = io.sockets.sockets.get(sid);
      if (s && s.data.userId === playerId) s.data.balance = player.balance;
    }
  }
  const wasShowdown = table.game.phase === PHASES.SHOWDOWN;
  table.game.handlePlayerLeave(playerId);
  if (!wasShowdown && table.game.phase === PHASES.SHOWDOWN) afterShowdown(io, table);
  else { syncActionTimer(io, table); emitPokerState(io, table); }
  if (table.occupiedSeats.length === 0) {
    table.game.resetToIdle();
    cancelActionTimer(table.id);
    cancelNextHand(table.id);
  }
}

function handle(io, socket, ack, fn) {
  const tableId = socket.data.tableId;
  const table = tableId ? tableManager.get(tableId) : null;
  if (!table || table.gameType !== GAME_TYPES.POKER || !table.game) {
    return ack?.({ ok: false, error: 'Not at a Poker table' });
  }
  try {
    fn(table.game);
  } catch (err) {
    return ack?.({ ok: false, error: err.message });
  }
  if (table.game.phase === PHASES.SHOWDOWN) afterShowdown(io, table);
  else { syncActionTimer(io, table); emitPokerState(io, table); }
  ack?.({ ok: true });
}

// Send each socket the state filtered for *their* userId so they only see their own
// hole cards (or all hands at showdown).
function emitPokerState(io, table) {
  if (!table.game) return;
  const room = io.sockets.adapter.rooms.get(tableRoom(table.id));
  if (!room) return;
  for (const sid of room) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    s.emit('game:state', table.game.getState(s.data.userId));
  }
}

async function afterShowdown(io, table) {
  cancelActionTimer(table.id);
  for (const p of table.occupiedSeats) {
    User.findByIdAndUpdate(p.id, { balance: p.balance }).catch((err) =>
      console.error('Balance persist failed:', err.message)
    );
    for (const sid of io.sockets.adapter.rooms.get(tableRoom(table.id)) || []) {
      const s = io.sockets.sockets.get(sid);
      if (s && s.data.userId === p.id) s.data.balance = p.balance;
    }
  }
  // Log each player who put chips in this hand. Skip rows with netChange === 0
  // AND zero contribution — those are seats that sat out (e.g. joined post-deal).
  for (const r of table.game.results) {
    if (r.netChange === 0 && !r.won) continue;
    recordGameHistory({
      userId: r.playerId,
      gameType: GAME_TYPES.POKER,
      result: deltaToResult(r.netChange),
      balanceChange: r.netChange
    });
  }
  emitPokerState(io, table);
  scheduleNextHand(io, table);
}

function scheduleNextHand(io, table) {
  cancelNextHand(table.id);
  const t = setTimeout(() => {
    pendingNextHand.delete(table.id);
    if (table.occupiedSeats.length < 2) {
      // Wipe community cards / pot / results so a single seated player sees a clean
      // table while waiting for someone else to join.
      table.game.resetToIdle();
      emitPokerState(io, table);
      return;
    }
    table.game.startHand();
    syncActionTimer(io, table);
    emitPokerState(io, table);
  }, NEXT_ROUND_DELAY_MS);
  pendingNextHand.set(table.id, t);
}

function cancelNextHand(tableId) {
  const t = pendingNextHand.get(tableId);
  if (t) { clearTimeout(t); pendingNextHand.delete(tableId); }
}

// Per-turn action timer — fires when the active player runs out of time → auto-fold.
function syncActionTimer(io, table) {
  cancelActionTimer(table.id);
  if (!table.game) return;
  if (table.game.phase === PHASES.IDLE || table.game.phase === PHASES.SHOWDOWN) return;
  if (table.game.activeSeatIdx === null || table.game.actionDeadline === null) return;
  const ms = Math.max(0, table.game.actionDeadline - Date.now());
  const t = setTimeout(() => {
    actionTimers.delete(table.id);
    if (!table.game) return;
    if (table.game.phase === PHASES.IDLE || table.game.phase === PHASES.SHOWDOWN) return;
    table.game.forceAutoAction();
    if (table.game.phase === PHASES.SHOWDOWN) afterShowdown(io, table);
    else { syncActionTimer(io, table); emitPokerState(io, table); }
  }, ms);
  actionTimers.set(table.id, t);
}

function cancelActionTimer(tableId) {
  const t = actionTimers.get(tableId);
  if (t) { clearTimeout(t); actionTimers.delete(tableId); }
}
