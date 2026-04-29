import { Game } from './Game.js';
import { PokerHand } from './PokerHand.js';
import { POKER_ACTION_WINDOW_MS } from '../utils/constants.js';

export const PHASES = {
  IDLE: 'idle',
  PREFLOP: 'preflop',
  FLOP: 'flop',
  TURN: 'turn',
  RIVER: 'river',
  SHOWDOWN: 'showdown'
};

const BETTING_PHASES = new Set([PHASES.PREFLOP, PHASES.FLOP, PHASES.TURN, PHASES.RIVER]);

// Texas Hold'em phase machine: idle → preflop → flop → turn → river → showdown → idle.
// Single main pot only — no side-pot accounting. A player who can't cover the call must fold.
export class PokerGame extends Game {
  constructor(table) {
    super(table);
    this.phase = PHASES.IDLE;
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;          // highest committed bet THIS round
    this.minRaise = 0;            // minimum legal raise increment
    this.activeSeatIdx = null;
    this.actionDeadline = null;
    this.headsUp = false;         // true if hand started with exactly 2 players
    this.playerBets = new Map();      // id -> chips committed this round
    this.playerTotalBet = new Map();  // id -> chips committed this hand
    this.hasActed = new Set();        // ids that have explicitly acted this round
    this.playersInHand = new Set();   // ids of non-folded players
    this.allInPlayers = new Set();    // ids that committed their entire stack
    this.lastActions = new Map();     // id -> 'fold' | 'check' | 'call' | 'raise' | 'allin'
    this.results = [];
    this.firstHandPlayed = false;
  }

  // Wipe round-level state so the table looks clean between hands. Used by the
  // socket layer when a hand can't continue (e.g. only one player left at the table).
  resetToIdle() {
    this.phase = PHASES.IDLE;
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = 0;
    this.activeSeatIdx = null;
    this.actionDeadline = null;
    this.playerBets.clear();
    this.playerTotalBet.clear();
    this.hasActed.clear();
    this.playersInHand.clear();
    this.allInPlayers.clear();
    this.lastActions.clear();
    this.results = [];
  }

  // Open a new hand. Returns false if not enough seated players.
  startHand() {
    const seated = this.table.occupiedSeats;
    if (seated.length < 2) {
      this.phase = PHASES.IDLE;
      return false;
    }
    super.start();
    if (this.firstHandPlayed) this.table.rotateDealerButton();
    else this.firstHandPlayed = true;
    this.#ensureDealerOnOccupiedSeat();

    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.table.bigBlind;
    this.playerBets.clear();
    this.playerTotalBet.clear();
    this.hasActed.clear();
    this.playersInHand.clear();
    this.allInPlayers.clear();
    this.lastActions.clear();
    this.results = [];
    this.headsUp = seated.length === 2;

    for (const p of seated) {
      p.hand = new PokerHand();
      p.currentBet = 0;
      this.playersInHand.add(p.id);
      this.playerBets.set(p.id, 0);
      this.playerTotalBet.set(p.id, 0);
    }

    // Deal 2 hole cards, one at a time, starting left of dealer button.
    const dealOrder = this.#orderedSeatsFrom(this.#nextOccupiedSeat(this.table.dealerButtonIdx + 1));
    for (let pass = 0; pass < 2; pass++) {
      for (const idx of dealOrder) this.table.players[idx].hand.addCard(this.deck.draw());
    }

    const pos = this.#blindAndActionPositions();
    this.#commitChips(pos.sb, this.table.smallBlind);
    this.#commitChips(pos.bb, this.table.bigBlind);
    this.currentBet = this.table.bigBlind;

    this.phase = PHASES.PREFLOP;
    this.activeSeatIdx = pos.preflopFirst;
    this.#refreshActionDeadline();
    return true;
  }

  // ---------- Public actions ----------

  fold(playerId) {
    this.#assertActive(playerId, 'fold');
    this.playersInHand.delete(playerId);
    this.hasActed.add(playerId);
    this.lastActions.set(playerId, 'fold');
    if (this.playersInHand.size === 1) {
      this.#awardUncontestedPot();
      return;
    }
    this.#advance();
  }

  check(playerId) {
    this.#assertActive(playerId, 'check');
    const owe = this.currentBet - (this.playerBets.get(playerId) || 0);
    if (owe > 0) throw new Error('Cannot check — you have to call or fold');
    this.hasActed.add(playerId);
    this.lastActions.set(playerId, 'check');
    this.#advance();
  }

  call(playerId) {
    this.#assertActive(playerId, 'call');
    const player = this.table.findPlayer(playerId);
    const owe = this.currentBet - (this.playerBets.get(playerId) || 0);
    if (owe <= 0) throw new Error('Nothing to call — check instead');
    if (player.balance < owe) throw new Error('Insufficient balance to call');
    this.#commitChips(player.seatIndex, owe);
    this.hasActed.add(playerId);
    this.lastActions.set(playerId, 'call');
    this.#advance();
  }

  // raiseTo: target total bet for THIS round. Must be ≥ currentBet + minRaise.
  raise(playerId, raiseTo) {
    this.#assertActive(playerId, 'raise');
    if (this.allInPlayers.size > 0) throw new Error('Cannot raise — someone is all-in');
    const player = this.table.findPlayer(playerId);
    const target = Math.floor(Number(raiseTo));
    if (!Number.isFinite(target)) throw new Error('Invalid raise amount');
    const minTarget = this.currentBet + this.minRaise;
    if (target < minTarget) throw new Error(`Minimum raise is to ${minTarget}`);
    const already = this.playerBets.get(playerId) || 0;
    const delta = target - already;
    if (delta <= 0) throw new Error('Raise must increase your bet');
    if (player.balance < delta) throw new Error('Insufficient balance to raise');
    this.#commitChips(player.seatIndex, delta);
    this.minRaise = target - this.currentBet;
    this.currentBet = target;
    // A raise re-opens the round: everyone except this player must act again.
    this.hasActed.clear();
    this.hasActed.add(playerId);
    this.lastActions.set(playerId, 'raise');
    this.#advance();
  }

  // Shove every chip the player has left into the pot. May act as a raise (if it
  // exceeds currentBet) or as a partial call. Once anyone is all-in, no further
  // raises are allowed and remaining streets run out to showdown automatically.
  allIn(playerId) {
    this.#assertActive(playerId, 'go all-in');
    const player = this.table.findPlayer(playerId);
    if (player.balance <= 0) throw new Error('You have no chips left');
    const before = this.playerBets.get(playerId) || 0;
    const total = before + player.balance;
    this.#commitChips(player.seatIndex, player.balance);
    if (total > this.currentBet) {
      const raiseSize = total - this.currentBet;
      // Full-size all-in raise reopens action; under-min all-in does not.
      if (raiseSize >= this.minRaise) {
        this.minRaise = raiseSize;
        this.hasActed.clear();
      }
      this.currentBet = total;
    }
    this.hasActed.add(playerId);
    this.lastActions.set(playerId, 'allin');
    this.#advance();
  }

  // Auto-action on timer expiry: check if legal, otherwise fold.
  forceAutoAction() {
    if (!BETTING_PHASES.has(this.phase) || this.activeSeatIdx === null) return;
    const p = this.table.players[this.activeSeatIdx];
    if (!p) return;
    const owe = this.currentBet - (this.playerBets.get(p.id) || 0);
    if (owe <= 0) this.check(p.id);
    else this.fold(p.id);
  }

  // Called when a player leaves (or disconnects) mid-hand.
  handlePlayerLeave(playerId) {
    if (!BETTING_PHASES.has(this.phase)) return;
    if (!this.playersInHand.has(playerId)) return;
    this.playersInHand.delete(playerId);
    this.hasActed.add(playerId);
    if (this.playersInHand.size === 1) {
      this.#awardUncontestedPot();
      return;
    }
    const active = this.activeSeatIdx !== null ? this.table.players[this.activeSeatIdx] : null;
    if (!active || active.id === playerId) this.#advance();
  }

  // ---------- Round flow ----------

  #assertActive(playerId, label) {
    if (!BETTING_PHASES.has(this.phase)) throw new Error(`Cannot ${label} now`);
    const p = this.table.players[this.activeSeatIdx];
    if (!p || p.id !== playerId) throw new Error('Not your turn');
    if (!this.playersInHand.has(playerId)) throw new Error('You folded this hand');
  }

  #advance() {
    if (this.playersInHand.size <= 1) {
      this.#awardUncontestedPot();
      return;
    }
    if (this.#bettingRoundComplete()) {
      this.#advancePhase();
      return;
    }
    this.activeSeatIdx = this.#nextActiveContender(this.activeSeatIdx + 1);
    this.#refreshActionDeadline();
  }

  #bettingRoundComplete() {
    for (const id of this.playersInHand) {
      if (this.allInPlayers.has(id)) continue; // all-in players can't act further
      if (!this.hasActed.has(id)) return false;
      if ((this.playerBets.get(id) || 0) !== this.currentBet) return false;
    }
    return true;
  }

  #advancePhase() {
    // Reset round-level bet tracking before dealing the next street.
    this.playerBets.clear();
    for (const id of this.playersInHand) this.playerBets.set(id, 0);
    for (const p of this.table.occupiedSeats) p.currentBet = 0;
    this.currentBet = 0;
    this.minRaise = this.table.bigBlind;
    this.hasActed.clear();
    // Clear non-fold action bubbles when a new street starts. Fold should persist
    // until the hand resolves so opponents can see who's still in.
    for (const [id, action] of this.lastActions) {
      if (action !== 'fold') this.lastActions.delete(id);
    }

    if (this.phase === PHASES.PREFLOP) {
      this.#dealCommunity(3);
      this.phase = PHASES.FLOP;
    } else if (this.phase === PHASES.FLOP) {
      this.#dealCommunity(1);
      this.phase = PHASES.TURN;
    } else if (this.phase === PHASES.TURN) {
      this.#dealCommunity(1);
      this.phase = PHASES.RIVER;
    } else if (this.phase === PHASES.RIVER) {
      this.#showdown();
      return;
    }
    // If 0 or 1 players can still act (rest are all-in), no more betting — run it out.
    const canAct = [...this.playersInHand].filter((id) => !this.allInPlayers.has(id));
    if (canAct.length <= 1) {
      this.#runOutAndShowdown();
      return;
    }
    this.activeSeatIdx = this.#nextActiveContender(this.#blindAndActionPositions().postflopFirst);
    this.#refreshActionDeadline();
  }

  // Deal any remaining community cards then go straight to showdown.
  #runOutAndShowdown() {
    while (this.communityCards.length < 5) {
      if (this.phase === PHASES.FLOP) this.phase = PHASES.TURN;
      else if (this.phase === PHASES.TURN) this.phase = PHASES.RIVER;
      this.communityCards.push(this.deck.draw());
    }
    this.#showdown();
  }

  #dealCommunity(n) {
    for (let i = 0; i < n; i++) this.communityCards.push(this.deck.draw());
  }

  #showdown() {
    this.phase = PHASES.SHOWDOWN;
    this.activeSeatIdx = null;
    this.actionDeadline = null;

    const contenders = [...this.playersInHand]
      .map((id) => this.table.findPlayer(id))
      .filter((p) => p);
    if (contenders.length === 0) return;

    const evaluated = contenders.map((p) => ({
      player: p,
      eval: p.hand.calculateScore(this.communityCards)
    }));
    evaluated.sort((a, b) => PokerHand.compare(b.eval, a.eval));
    const top = evaluated[0].eval;
    const winners = evaluated.filter((e) => PokerHand.compare(e.eval, top) === 0);

    const share = Math.floor(this.pot / winners.length);
    const remainder = this.pot - share * winners.length;
    let remainderGiven = false;
    this.results = evaluated.map(({ player, eval: ev }) => {
      const isWinner = winners.some((w) => w.player.id === player.id);
      let payout = 0;
      if (isWinner) {
        payout = share;
        if (!remainderGiven) { payout += remainder; remainderGiven = true; }
        player.win(payout);
      }
      return {
        playerId: player.id,
        username: player.username,
        rank: ev.rank,
        kickers: ev.kickers,
        cards: ev.cards.map((c) => c.toJSON()),
        won: isWinner,
        payout,
        netChange: payout - (this.playerTotalBet.get(player.id) || 0),
        balance: player.balance
      };
    });
    // Add results for folded players (zero payout, full loss).
    for (const p of this.table.occupiedSeats) {
      if (this.results.some((r) => r.playerId === p.id)) continue;
      this.results.push({
        playerId: p.id,
        username: p.username,
        rank: 'FOLDED',
        kickers: [],
        cards: [],
        won: false,
        payout: 0,
        netChange: -(this.playerTotalBet.get(p.id) || 0),
        balance: p.balance
      });
    }
    this.pot = 0;
  }

  // Everyone folded except one — they take the pot without a showdown.
  #awardUncontestedPot() {
    this.phase = PHASES.SHOWDOWN;
    this.activeSeatIdx = null;
    this.actionDeadline = null;
    const winnerId = [...this.playersInHand][0];
    const winner = winnerId ? this.table.findPlayer(winnerId) : null;
    const payout = this.pot;
    if (winner && payout > 0) winner.win(payout);
    this.results = this.table.occupiedSeats.map((p) => {
      const isWinner = winner && p.id === winner.id;
      return {
        playerId: p.id,
        username: p.username,
        rank: isWinner ? 'UNCONTESTED' : 'FOLDED',
        kickers: [],
        cards: [],
        won: !!isWinner,
        payout: isWinner ? payout : 0,
        netChange: (isWinner ? payout : 0) - (this.playerTotalBet.get(p.id) || 0),
        balance: p.balance
      };
    });
    this.pot = 0;
  }

  #refreshActionDeadline() {
    if (BETTING_PHASES.has(this.phase) && this.activeSeatIdx !== null) {
      this.actionDeadline = Date.now() + POKER_ACTION_WINDOW_MS;
    } else {
      this.actionDeadline = null;
    }
  }

  // ---------- Seat-order helpers ----------

  // Returns the SB / BB / first-to-act positions for both preflop and postflop streets.
  // Heads-up rule: dealer = SB and acts first on every street.
  #blindAndActionPositions() {
    const seats = this.table.players;
    const occupied = seats.map((p, i) => (p ? i : -1)).filter((i) => i !== -1);
    const dIdx = this.table.dealerButtonIdx;
    const dPos = occupied.indexOf(dIdx);
    const at = (offset) => occupied[((dPos + offset) % occupied.length + occupied.length) % occupied.length];
    if (this.headsUp) {
      return { sb: dIdx, bb: at(1), preflopFirst: dIdx, postflopFirst: dIdx };
    }
    return { sb: at(1), bb: at(2), preflopFirst: at(3), postflopFirst: at(1) };
  }

  #commitChips(seatIdx, amount) {
    const p = this.table.players[seatIdx];
    if (!p) return 0;
    const actual = Math.min(p.balance, amount);
    if (actual <= 0) return 0;
    p.placeBet(actual);
    p.currentBet = (p.currentBet || 0) + actual;
    this.playerBets.set(p.id, (this.playerBets.get(p.id) || 0) + actual);
    this.playerTotalBet.set(p.id, (this.playerTotalBet.get(p.id) || 0) + actual);
    this.pot += actual;
    if (p.balance === 0) this.allInPlayers.add(p.id);
    return actual;
  }

  #ensureDealerOnOccupiedSeat() {
    if (this.table.players[this.table.dealerButtonIdx]) return;
    this.table.dealerButtonIdx = this.#nextOccupiedSeat(this.table.dealerButtonIdx + 1);
  }

  #nextOccupiedSeat(from) {
    const seats = this.table.players;
    const n = seats.length;
    for (let i = 0; i < n; i++) {
      const idx = (((from + i) % n) + n) % n;
      if (seats[idx]) return idx;
    }
    return null;
  }

  #nextActiveContender(from) {
    const seats = this.table.players;
    const n = seats.length;
    for (let i = 0; i < n; i++) {
      const idx = (((from + i) % n) + n) % n;
      const p = seats[idx];
      if (p && this.playersInHand.has(p.id) && !this.allInPlayers.has(p.id)) return idx;
    }
    return null;
  }

  #orderedSeatsFrom(from) {
    const seats = this.table.players;
    const n = seats.length;
    const order = [];
    for (let i = 0; i < n; i++) {
      const idx = (from + i) % n;
      if (seats[idx]) order.push(idx);
    }
    return order;
  }

  // ---------- State broadcast ----------

  // forUserId: when provided, that user sees their own hole cards. At showdown all
  // non-folded hands are revealed. Otherwise hole cards show as hidden backs.
  getState(forUserId = null) {
    const reveal = this.phase === PHASES.SHOWDOWN;
    return {
      gameType: 'poker',
      phase: this.phase,
      roundId: this.roundId,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      activeSeatIdx: this.activeSeatIdx,
      actionDeadline: BETTING_PHASES.has(this.phase) ? this.actionDeadline : null,
      community: this.communityCards.map((c) => c.toJSON()),
      dealerButtonIdx: this.table.dealerButtonIdx,
      smallBlind: this.table.smallBlind,
      bigBlind: this.table.bigBlind,
      results: this.results,
      table: this.table.toJSON(),
      seats: this.table.players.map((p) => {
        if (!p) return null;
        const inHand = this.playersInHand.has(p.id);
        const showCards = reveal ? inHand : (forUserId && p.id === forUserId);
        let handView = null;
        if (p.hand && p.hand.size > 0) {
          handView = showCards
            ? { cards: p.hand.cards.map((c) => c.toJSON()) }
            : { cards: Array(p.hand.size).fill({ hidden: true }) };
        }
        return {
          id: p.id,
          username: p.username,
          balance: p.balance,
          currentBet: this.playerBets.get(p.id) || 0,
          totalBet: this.playerTotalBet.get(p.id) || 0,
          folded: !inHand && this.phase !== PHASES.IDLE,
          allIn: this.allInPlayers.has(p.id),
          lastAction: this.lastActions.get(p.id) || null,
          hand: handView,
          disconnected: !!p.disconnected
        };
      })
    };
  }
}
