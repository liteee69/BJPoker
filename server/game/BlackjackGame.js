import { Game } from './Game.js';
import { BlackjackHand } from './BlackjackHand.js';
import { MIN_BET, MAX_BET, BET_WINDOW_MS, ACTION_WINDOW_MS } from '../utils/constants.js';

export const PHASES = {
  IDLE: 'idle',
  BETTING: 'betting',
  PLAYING: 'playing',
  DEALER_TURN: 'dealerTurn',
  SETTLE: 'settle'
};

// Phase machine: idle → betting → playing → dealerTurn → settle → idle (loop)
export class BlackjackGame extends Game {
  constructor(table) {
    super(table);
    this.phase = PHASES.IDLE;
    this.activeSeatIdx = null;
    this.results = [];
    this.holeCardHidden = true;
    this.bettingDeadline = null;
    this.actionDeadline = null;
    this.decisions = new Map(); // playerId -> 'bet' | 'sitOut' (in betting phase)
  }

  // Open a new betting window — clears state for everyone seated.
  startBetting() {
    super.start(); // bumps roundId, resets+shuffles deck
    this.phase = PHASES.BETTING;
    this.holeCardHidden = true;
    this.results = [];
    this.decisions.clear();
    this.activeSeatIdx = null;
    this.bettingDeadline = Date.now() + BET_WINDOW_MS;
    this.table.dealer.hand = new BlackjackHand();
    for (const player of this.table.occupiedSeats) {
      player.hand = new BlackjackHand();
      player.currentBet = 0;
    }
  }

  // Called when the betting timer expires: anyone who hasn't placed a bet sits out.
  forceSitOutUndecided() {
    if (this.phase !== PHASES.BETTING) return;
    for (const p of this.table.occupiedSeats) {
      if (!this.decisions.has(p.id)) this.decisions.set(p.id, 'sitOut');
    }
    this.#maybeStartDealing();
  }

  placeBet(playerId, amount) {
    if (this.phase !== PHASES.BETTING) throw new Error('Betting is closed');
    const player = this.table.findPlayer(playerId);
    if (!player) throw new Error('Not seated at this table');
    if (this.decisions.has(playerId)) throw new Error('Already decided this round');
    const bet = Math.floor(Number(amount));
    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
      throw new Error(`Bet must be ${MIN_BET}–${MAX_BET}`);
    }
    if (bet > player.balance) throw new Error('Insufficient balance');
    player.placeBet(bet);
    player.currentBet = bet;
    if (!player.hand) player.hand = new BlackjackHand();
    this.decisions.set(playerId, 'bet');
    this.#maybeStartDealing();
  }

  sitOut(playerId) {
    if (this.phase !== PHASES.BETTING) throw new Error('Betting is closed');
    const player = this.table.findPlayer(playerId);
    if (!player) throw new Error('Not seated at this table');
    if (this.decisions.has(playerId)) throw new Error('Already decided this round');
    this.decisions.set(playerId, 'sitOut');
    this.#maybeStartDealing();
  }

  #maybeStartDealing() {
    const seated = this.table.occupiedSeats;
    if (seated.length === 0) return;
    if (seated.every((p) => this.decisions.has(p.id))) {
      this.#dealInitial();
    }
  }

  #dealInitial() {
    const bettingPlayers = this.table.occupiedSeats.filter((p) => p.currentBet > 0);
    if (bettingPlayers.length === 0) {
      // Everyone sat out → just close the round immediately.
      this.phase = PHASES.SETTLE;
      return;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const p of bettingPlayers) p.hand.addCard(this.deck.draw());
      this.table.dealer.hand.addCard(this.deck.draw());
    }
    this.phase = PHASES.PLAYING;
    this.activeSeatIdx = this.#findFirstActiveSeat(0);
    this.#skipFinishedSeats();
    this.#refreshActionDeadline();
  }

  hit(playerId) {
    this.#assertActive(playerId, 'hit');
    const player = this.table.players[this.activeSeatIdx];
    player.hand.addCard(this.deck.draw());
    if (player.hand.isBust()) this.#advance();
    else this.#refreshActionDeadline();
  }

  stand(playerId) {
    this.#assertActive(playerId, 'stand');
    this.#advance();
  }

  // Double-down: only on first action, doubles the bet, takes exactly one card, advances.
  double(playerId) {
    this.#assertActive(playerId, 'double');
    const player = this.table.players[this.activeSeatIdx];
    if (player.hand.size !== 2) throw new Error('Can only double on your first action');
    if (player.balance < player.currentBet) throw new Error('Insufficient balance to double');
    player.placeBet(player.currentBet);
    player.currentBet *= 2;
    player.hand.addCard(this.deck.draw());
    this.#advance();
  }

  // Called when a player leaves the table mid-round (or disconnects).
  // Robust to either ordering: lobby may have already nulled the seat by now.
  handlePlayerLeave(playerId) {
    if (this.phase === PHASES.BETTING) {
      // Leaver may have been the last one we were waiting on.
      this.#maybeStartDealing();
      return;
    }
    if (this.phase === PHASES.PLAYING && this.activeSeatIdx !== null) {
      const seat = this.table.players[this.activeSeatIdx];
      // Advance if the active seat is now empty OR the leaver still occupies it.
      if (!seat || seat.id === playerId) {
        this.#advance();
      }
    }
  }

  #assertActive(playerId, label) {
    if (this.phase !== PHASES.PLAYING) throw new Error(`Cannot ${label}: not in playing phase`);
    const player = this.table.players[this.activeSeatIdx];
    if (!player || player.id !== playerId) throw new Error('Not your turn');
  }

  #advance() {
    const next = this.#findFirstActiveSeat(this.activeSeatIdx + 1);
    if (next === null) {
      this.activeSeatIdx = null;
      this.actionDeadline = null;
      this.#dealerTurn();
      return;
    }
    this.activeSeatIdx = next;
    this.#skipFinishedSeats();
    this.#refreshActionDeadline();
  }

  // Each action (hit/stand/double) refreshes the 10s window.
  #refreshActionDeadline() {
    if (this.phase === PHASES.PLAYING && this.activeSeatIdx !== null) {
      this.actionDeadline = Date.now() + ACTION_WINDOW_MS;
    } else {
      this.actionDeadline = null;
    }
  }

  // Auto-stand the current active player (called by the server on timer expiry).
  forceStand() {
    if (this.phase !== PHASES.PLAYING || this.activeSeatIdx === null) return;
    this.#advance();
  }

  #findFirstActiveSeat(start) {
    const seats = this.table.players;
    for (let i = start; i < seats.length; i++) {
      const p = seats[i];
      if (p && p.currentBet > 0 && !p.hand.isBust()) return i;
    }
    return null;
  }

  // After landing on a seat, if that seat is already done (e.g. natural blackjack),
  // skip to the next.
  #skipFinishedSeats() {
    while (this.activeSeatIdx !== null) {
      const p = this.table.players[this.activeSeatIdx];
      if (!p) { this.#advance(); continue; }
      if (p.hand.isBlackjack()) { this.#advance(); continue; }
      break;
    }
  }

  #dealerTurn() {
    this.phase = PHASES.DEALER_TURN;
    this.holeCardHidden = false;

    // If every player busted, dealer doesn't need to draw.
    const stillIn = this.table.occupiedSeats.some((p) => p.currentBet > 0 && !p.hand.isBust());
    if (stillIn) {
      const dealer = this.table.dealer;
      while (dealer.shouldHit()) dealer.hand.addCard(this.deck.draw());
    }
    this.#settle();
  }

  #settle() {
    this.phase = PHASES.SETTLE;
    const dealerHand = this.table.dealer.hand;
    const dealerScore = dealerHand.calculateScore();
    const dealerBust = dealerHand.isBust();
    const dealerBJ = dealerHand.isBlackjack();

    this.results = [];
    for (const player of this.table.occupiedSeats) {
      if (player.currentBet === 0) continue;
      const score = player.hand.calculateScore();
      const playerBJ = player.hand.isBlackjack();
      let outcome, payout;
      if (player.hand.isBust()) {
        outcome = 'lose';
        payout = 0;
      } else if (playerBJ && !dealerBJ) {
        outcome = 'blackjack';
        payout = Math.floor(player.currentBet * 2.5); // 3:2
      } else if (dealerBJ && !playerBJ) {
        outcome = 'lose';
        payout = 0;
      } else if (dealerBust || score > dealerScore) {
        outcome = 'win';
        payout = player.currentBet * 2;
      } else if (score < dealerScore) {
        outcome = 'lose';
        payout = 0;
      } else {
        outcome = 'push';
        payout = player.currentBet;
      }
      if (payout > 0) player.win(payout);
      this.results.push({
        playerId: player.id,
        username: player.username,
        outcome,
        score,
        bet: player.currentBet,
        payout,
        balance: player.balance
      });
    }
  }

  // Build the broadcastable state. Hole card is hidden during 'playing' phase.
  getState() {
    const dealerCards = this.table.dealer.hand.cards;
    let dealerCardsView, dealerScore;
    if (this.holeCardHidden && dealerCards.length >= 2) {
      dealerCardsView = [dealerCards[0].toJSON(), { hidden: true }];
      const upOnly = new BlackjackHand();
      upOnly.addCard(dealerCards[0]);
      dealerScore = upOnly.calculateScore();
    } else {
      dealerCardsView = dealerCards.map((c) => c.toJSON());
      dealerScore = this.table.dealer.hand.calculateScore();
    }
    return {
      gameType: 'blackjack',
      phase: this.phase,
      roundId: this.roundId,
      activeSeatIdx: this.activeSeatIdx,
      bettingDeadline: this.phase === PHASES.BETTING ? this.bettingDeadline : null,
      actionDeadline: this.phase === PHASES.PLAYING ? this.actionDeadline : null,
      decisions: Object.fromEntries(this.decisions),
      results: this.results,
      dealer: { cards: dealerCardsView, score: dealerScore },
      table: this.table.toJSON(),
      seats: this.table.players.map((p) => {
        if (!p) return null;
        return {
          id: p.id,
          username: p.username,
          balance: p.balance,
          currentBet: p.currentBet || 0,
          hand: p.hand ? p.hand.toJSON() : null,
          decision: this.decisions.get(p.id) || null,
          disconnected: !!p.disconnected
        };
      })
    };
  }
}
