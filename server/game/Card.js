import { SUITS, RANKS, SUIT_SYMBOL } from '../utils/constants.js';

export class Card {
  #rank;
  #suit;

  constructor(rank, suit) {
    if (!RANKS.includes(rank)) throw new Error(`Invalid rank: ${rank}`);
    if (!SUITS.includes(suit)) throw new Error(`Invalid suit: ${suit}`);
    this.#rank = rank;
    this.#suit = suit;
  }

  get rank() { return this.#rank; }
  get suit() { return this.#suit; }
  get color() { return (this.#suit === 'hearts' || this.#suit === 'diamonds') ? 'red' : 'black'; }

  // Numeric rank for comparison/scoring. Ace = 14 (high). Blackjack uses its own scoring.
  get numericRank() {
    if (this.#rank === 'A') return 14;
    if (this.#rank === 'K') return 13;
    if (this.#rank === 'Q') return 12;
    if (this.#rank === 'J') return 11;
    return parseInt(this.#rank, 10);
  }

  // Plain object suitable for sending to the client.
  toJSON() {
    return { rank: this.#rank, suit: this.#suit, symbol: SUIT_SYMBOL[this.#suit], color: this.color };
  }

  toString() { return `${this.#rank}${SUIT_SYMBOL[this.#suit]}`; }
}
