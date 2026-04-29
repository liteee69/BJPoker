# Blackjack & Poker — OOP Card Game Platform

## Project Overview

A multiplayer browser-based card game platform (Blackjack + Poker) with real-time table joining,
fictional currency, and a strong OOP architecture for university grading.

**Module:** Object-Oriented Programming
**Stack:** Vanilla JS · Node.js + Express · Socket.IO · MongoDB + Mongoose

---

## Workflow

When the user provides a feature request, bug fix, or new component to build:

1. **Identify** which layer is affected — frontend UI, game logic class, socket event, or DB model
2. **Locate** the correct file using the project structure below — never put logic in the wrong layer
3. **Implement** the change using ES6 `class` syntax. All game logic stays server-side in `/server/game/`
4. **Check** the following after every change:
   - Does the class hierarchy still make sense? (no broken inheritance)
   - Is the socket event emitting a sanitized plain object (not a raw class instance)?
   - Is the client UI updating correctly from the emitted state?
   - Is the DB balance updated after every round result?
5. **Fix** every issue found before moving on
6. **Re-check** after fixes — at minimum do 2 review passes per feature
7. **Repeat** steps 4–6 until the feature works end-to-end: client action → socket → server class → emit → UI update

Do NOT consider a feature done after one pass. Always verify the full client→server→client loop.

---

## Project Structure

```
/client
  index.html            ← Landing / lobby page
  game.html             ← Game table page
  /css
    style.css
  /js
    /classes            ← Frontend OOP classes (Card rendering, UI components)
    socket.js           ← Socket.IO client logic
    lobby.js
    game.js

/server
  server.js             ← Entry point (Express + Socket.IO setup)
  /game                 ← Core OOP game logic (all logic lives here)
    Card.js
    Deck.js
    Hand.js
    BlackjackHand.js    ← extends Hand
    PokerHand.js        ← extends Hand
    Player.js
    HumanPlayer.js      ← extends Player
    DealerPlayer.js     ← extends Player
    Table.js
    BlackjackTable.js   ← extends Table
    PokerTable.js       ← extends Table
    Game.js
    BlackjackGame.js    ← extends Game
    PokerGame.js        ← extends Game
  /models               ← Mongoose schemas
    User.js
    GameHistory.js
  /routes               ← Express REST routes
    auth.js
    lobby.js
  /sockets              ← Socket.IO event handlers
    blackjack.js
    poker.js
  /utils
    constants.js        ← Suits, ranks, chip values

.env
package.json
```

---

## OOP Class Hierarchy

```
Card
Deck
Hand
  ├── BlackjackHand
  └── PokerHand
Player
  ├── HumanPlayer
  └── DealerPlayer
Table
  ├── BlackjackTable
  └── PokerTable
Game
  ├── BlackjackGame
  └── PokerGame
```

Every class lives in its own file. Inheritance and method overriding must be clearly visible.

---

## Technical Defaults

- ES6 `class` syntax throughout — no constructor functions or prototypes
- `async/await` for all database operations
- `const`/`let` only — no `var`, no global state
- File names must match class names exactly: `BlackjackGame.js` → `class BlackjackGame`
- Socket.IO rooms map 1:1 to `Table` instances on the server
- Never send raw class instances to the client — always emit plain sanitized objects
- 2-space indentation, consistent across all files

---

## Socket.IO Event Naming Convention

```
client → server:   verb:noun       e.g.  join:table  place:bet  player:hit
server → client:   noun:updated    e.g.  game:state  player:balance  table:list
```

---

## Database Models

**User:** `username, passwordHash, balance (default: 1000), createdAt`
**GameHistory:** `userId, gameType (blackjack|poker), result (win|loss|draw), balanceChange, timestamp`

---

## Fictional Currency Rules

- New users start with **1000 chips**
- Min bet: **10 chips** · Max bet: **500 chips**
- Balance cannot go below 0 — offer a free refill to 200 chips for demo purposes
- Balance is always stored in MongoDB and updated server-side after each round

---

## Rules

- Never put game logic in client-side JS — server classes are the single source of truth
- Every new game type must extend `Game`, `Table`, and `Hand` — no standalone logic
- When comparing expected vs actual game behavior, be specific (e.g., "dealer should stand on soft 17 but hits", "flush not detected in 5-card hand")
- Do not add UI features not discussed — match the agreed scope exactly
- Keep code clean but don't over-abstract — clear and readable beats clever

---

## Running the Project

```bash
npm install
npm run dev    # development with nodemon
npm start      # production
```

`.env` required:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/cardgame
JWT_SECRET=your_secret_here
```

---

## University / Grading Checklist

- [ ] Class hierarchy diagram included in the report
- [ ] UML diagram generated from codebase
- [ ] `extends` and `super()` used and highlighted
- [ ] At least one example of method overriding (e.g., `calculateScore()`)
- [ ] Encapsulation demonstrated (private-like properties, getters)
- [ ] Socket.IO rooms tied to Table class instances
- [ ] All game logic server-side only
