import { Card } from './Card.js';
import { SUITS, RANKS } from '../utils/constants.js';

export class Deck {
  #cards;

  constructor() {
    this.#cards = Deck.#buildStandard();
  }

  static #buildStandard() {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(new Card(rank, suit));
      }
    }
    return cards;
  }

  get size() { return this.#cards.length; }

  reset() { this.#cards = Deck.#buildStandard(); }

  shuffle() {
    // Fisher-Yates
    for (let i = this.#cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.#cards[i], this.#cards[j]] = [this.#cards[j], this.#cards[i]];
    }
    return this;
  }

  draw(n = 1) {
    if (n > this.#cards.length) throw new Error('Not enough cards in deck');
    if (n === 1) return this.#cards.pop();
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.#cards.pop());
    return out;
  }
}
