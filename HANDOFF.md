# BJPoker — Session Handoff

> When Aleksandr says "read HANDOFF.md and continue", load this file and resume from "Where we left off" without re-reading the entire codebase.

## Project
Blackjack + Texas Hold'em multiplayer web platform for a uni OOP module.
Stack: vanilla JS + Tailwind CDN client · Node.js + Express + Socket.IO · MongoDB Atlas (Mongoose).
Repo: `/Users/kudr/Desktop/BJPoker` · Run: `npm run dev` · Tests: `npm test`.

## Phase status
- [x] **Phase 1** — Bootstrap (Express + Socket.IO + Mongo)
- [x] **Phase 2** — Auth (JWT cookie, register/login)
- [x] **Phase 3** — Core OOP classes + unit tests
- [x] **Phase 4** — Lobby (sockets-based table list/create/join)
- [x] **Phase 5** — Blackjack end-to-end (betting, hit/stand/double, settle, timers, persist)
- [x] **Phase 6** — Texas Hold'em end-to-end
  - 6a: PokerGame engine + 16 unit tests
  - 6b: Sockets + multiplayer browser flow (15s timer, auto-check, all-in run-out, no side pots)
  - 6c: Poker UI polish (felt, ribbon banners, gold balance, dealer pip, chip stacks, action bubbles, fixed 5 opponent positions, empty placeholders)
- [x] **Phase 5b** — Applied poker visual design to blackjack while preserving blackjack rules
- [x] **Phase 7 (just done)** — GameHistory log per round + graceful disconnect mid-hand. Refill flow intentionally skipped (not wanted)
- [ ] **Phase 8** — Deploy: Tailwind CDN → standalone CLI build, push to Render with WebSocket support, Atlas env vars, smoke test

## Where we left off (2026-04-28)
Finished Phase 7 — refill skipped, GameHistory + graceful disconnect both shipped.

**GameHistory log**
- New `GameHistory` model (userId, gameType, result win|loss|draw, balanceChange, timestamp; indexed on userId+timestamp).
- `recordGameHistory()` helper is fire-and-forget (logs but never blocks game flow).
- Blackjack: logs every settled hand from `afterSettle`. `balanceChange = payout - bet`. Sit-outs naturally skipped (not in `results`).
- Poker: logs every showdown contributor from `afterShowdown`. Mid-hand joiners skipped (`netChange === 0 && !won`). Folded players who paid blinds correctly recorded as 'loss'.

**Graceful disconnect**
- `HumanPlayer.disconnected` flag (default false).
- Lobby `socket.on('disconnect')` no longer evicts immediately. Marks player.disconnected=true, schedules a 30s grace timer, runs auto-action if it was their turn (forceStand for bj, forceAutoAction for poker).
- `table:join` already-seated branch clears the flag, cancels the timer, reattaches socket. Refresh / brief network drop = seat preserved.
- Explicit `table:leave` (button click) still uses immediate-forfeit path.
- 30s expiry → existing `removeFromTable` runs (forfeit bet persisted, leave-handler dispatches per game).
- Client: opacity dim + "Offline…" pill below opponents' seats while flag is set. Local user's own seat doesn't show the badge.

All 72 server tests pass. User browser-verified end-to-end and confirmed everything good.

## Files most recently touched
- `server/models/GameHistory.js` — new model
- `server/utils/gameHistory.js` — new `recordGameHistory()` + `deltaToResult()` helpers
- `server/sockets/blackjack.js` — log writer in `afterSettle`; new `handleBlackjackDisconnect()` (auto-stand if active)
- `server/sockets/poker.js` — log writer in `afterShowdown`; new `handlePokerDisconnect()` (auto-action if active)
- `server/sockets/lobby.js` — rewritten: 30s grace timer keyed by `${tableId}:${userId}`, `beginGracefulDisconnect()` separate from explicit `table:leave`, reconnect path clears flag
- `server/game/HumanPlayer.js` — `disconnected` flag
- `server/game/BlackjackGame.js` / `PokerGame.js` — `disconnected` surfaced in seat state
- `client/js/game.js` — opacity dim + new `offlineBadge()`; both bj and poker seat renderers

## Pending / known questions
- May still need more compaction at 100% zoom on small laptops — user can tell me to shrink cards or felt further if it's still tight.
- Refill flow at $0 was intentionally skipped — if user later wants it, `REFILL_AMOUNT = 200` is already in `server/utils/constants.js`.
- Tailwind CDN warning still in console; switch to standalone build is a Phase 8 task.
- Phase 8 (deploy) is the only remaining phase.

## Conventions to remember
- ES6 `class`, file name === class name, all game logic server-side, never emit raw class instances.
- Socket events: `verb:noun` (client→server), `noun:updated` / `game:state` (server→client).
- Per-table `Map<tableId, Timeout>` pattern for timers; cancel + reschedule on every state sync.
- Each socket gets a personalized `getState(forUserId)` so hole cards stay private.
- Poker: no side pots — once anyone is all-in, raises are blocked and remaining streets auto-deal to showdown.

## How to resume
1. `cd /Users/kudr/Desktop/BJPoker && npm run dev`
2. If MongoDB Atlas refuses the connection, check the IP whitelist (Network Access in Atlas) — current IP can change between sessions.
3. Open the table in browser; user reports symptoms or names the next phase.
4. If user says "Phase 8, go" → switch Tailwind CDN to standalone build first, then deploy to Render with WebSocket support and Atlas env vars.

## Session log
- **2026-04-27** — Applied poker visual design to blackjack; fixed timer refresh on hit, removed blackjack card placeholders, trimmed layout density. Established this HANDOFF.md workflow.
- **2026-04-28** — Phase 7: shipped GameHistory log per round (bj + poker) and graceful disconnect mid-hand (30s grace timer, auto-action on turn, "Offline…" pill in UI, refresh-safe seat preservation). Refill flow skipped per user. All 72 tests pass. User browser-verified end-to-end.
