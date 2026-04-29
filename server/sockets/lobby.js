import { tableManager } from '../lobby/TableManager.js';
import { HumanPlayer } from '../game/HumanPlayer.js';
import { GAME_TYPES } from '../utils/constants.js';
import {
  ensureBlackjackGame,
  handleBlackjackLeave,
  handleBlackjackDisconnect
} from './blackjack.js';
import {
  ensurePokerGame,
  handlePokerLeave,
  handlePokerDisconnect
} from './poker.js';

const LOBBY_ROOM = 'lobby';
const tableRoom = (id) => `table:${id}`;

// Grace window before a disconnected player is actually evicted from their seat.
// Lets users tab away or refresh without losing their bet/turn.
const DISCONNECT_GRACE_MS = 30_000;

// key = `${tableId}:${userId}` — single timer per seated user.
const graceTimers = new Map();

export function registerLobbyHandlers(io, socket) {
  socket.join(LOBBY_ROOM);
  socket.emit('table:list', tableManager.list());

  socket.on('table:join', ({ tableId } = {}, ack) => {
    try {
      const table = tableManager.get(tableId);
      if (!table) return ack?.({ ok: false, error: 'Table not found' });

      // Already seated → reattach socket and clear any in-flight grace timer
      // (e.g. after a refresh or brief network blip).
      const seated = table.findPlayer(socket.data.userId);
      if (seated) {
        socket.data.tableId = tableId;
        socket.join(tableRoom(tableId));
        if (seated.disconnected) {
          seated.disconnected = false;
          if (typeof seated.attachSocket === 'function') seated.attachSocket(socket.id);
          cancelGraceTimer(tableId, socket.data.userId);
          emitGameState(io, table);
        }
        return ack?.({ ok: true, tableId });
      }
      if (table.isFull) return ack?.({ ok: false, error: 'Table is full' });

      const player = new HumanPlayer({
        id: socket.data.userId,
        username: socket.data.username,
        balance: socket.data.balance,
        socketId: socket.id
      });
      table.seatPlayer(player);
      socket.data.tableId = tableId;
      socket.join(tableRoom(tableId));
      io.to(LOBBY_ROOM).emit('table:list', tableManager.list());
      io.to(tableRoom(tableId)).emit('table:state', table.toJSON());
      if (table.gameType === GAME_TYPES.BLACKJACK) ensureBlackjackGame(io, table);
      else if (table.gameType === GAME_TYPES.POKER) ensurePokerGame(io, table);
      ack?.({ ok: true, tableId });
    } catch (err) {
      ack?.({ ok: false, error: err.message });
    }
  });

  // Explicit leave (button click) — immediate forfeit, no grace window.
  socket.on('table:leave', () => leaveTable(io, socket));

  // Socket dropped (refresh, tab close, network blip). Keep them seated and
  // start the grace timer; the seat is freed only if they don't return in time.
  socket.on('disconnect', () => beginGracefulDisconnect(io, socket));
}

function beginGracefulDisconnect(io, socket) {
  const tableId = socket.data.tableId;
  if (!tableId) return;
  const table = tableManager.get(tableId);
  if (!table) return;
  const userId = socket.data.userId;
  const player = table.findPlayer(userId);
  if (!player) return;

  player.disconnected = true;
  if (typeof player.detachSocket === 'function') player.detachSocket();

  // Auto-action if it's their turn so other players don't sit waiting.
  if (table.gameType === GAME_TYPES.BLACKJACK) handleBlackjackDisconnect(io, table, userId);
  else if (table.gameType === GAME_TYPES.POKER) handlePokerDisconnect(io, table, userId);

  scheduleGraceTimer(io, tableId, userId);
}

function scheduleGraceTimer(io, tableId, userId) {
  cancelGraceTimer(tableId, userId);
  const key = graceKey(tableId, userId);
  const t = setTimeout(() => {
    graceTimers.delete(key);
    finalizeDisconnect(io, tableId, userId);
  }, DISCONNECT_GRACE_MS);
  graceTimers.set(key, t);
}

function cancelGraceTimer(tableId, userId) {
  const key = graceKey(tableId, userId);
  const t = graceTimers.get(key);
  if (t) { clearTimeout(t); graceTimers.delete(key); }
}

function graceKey(tableId, userId) { return `${tableId}:${userId}`; }

// Called when the grace window expires without a reconnect — actually evict.
function finalizeDisconnect(io, tableId, userId) {
  const table = tableManager.get(tableId);
  if (!table) return;
  const player = table.findPlayer(userId);
  if (!player) return;
  // If they reconnected via a different code path and cleared the flag, abort.
  if (!player.disconnected) return;
  removeFromTable(io, table, userId);
}

function leaveTable(io, socket) {
  const tableId = socket.data.tableId;
  if (!tableId) return;
  cancelGraceTimer(tableId, socket.data.userId);
  removeFromTable(io, tableManager.get(tableId), socket.data.userId);
  socket.leave(tableRoom(tableId));
  socket.data.tableId = null;
}

function removeFromTable(io, table, userId) {
  if (!table) return;
  // Capture the player BEFORE removing — game-specific handlers need the
  // player object (e.g. to persist a forfeit bet to the DB).
  const player = table.findPlayer(userId);
  table.removePlayer(userId);
  if (table.gameType === GAME_TYPES.BLACKJACK) handleBlackjackLeave(io, table, userId, player);
  else if (table.gameType === GAME_TYPES.POKER) handlePokerLeave(io, table, userId, player);
  io.to(LOBBY_ROOM).emit('table:list', tableManager.list());
  io.to(tableRoom(table.id)).emit('table:state', table.toJSON());
}

function emitGameState(io, table) {
  if (!table.game) return;
  if (table.gameType === GAME_TYPES.POKER) {
    // Poker filters per-socket so players only see their own hole cards.
    const room = io.sockets.adapter.rooms.get(tableRoom(table.id));
    if (!room) return;
    for (const sid of room) {
      const s = io.sockets.sockets.get(sid);
      if (s) s.emit('game:state', table.game.getState(s.data.userId));
    }
  } else {
    io.to(tableRoom(table.id)).emit('game:state', table.game.getState());
  }
}
