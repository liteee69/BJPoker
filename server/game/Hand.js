// Base class for all hands. Subclasses override calculateScore().
export class Hand {
  #cards;

  constructor() {
    this.#cards = [];
  }

  get cards() { return [...this.#cards]; }
  get size() { return this.#cards.length; }

  addCard(card) {
    this.#cards.push(card);
    return this;
  }

  clear() {
    this.#cards = [];
    return this;
  }

  // Abstract — must be overridden.
  calculateScore() {
    throw new Error('calculateScore() must be implemented by subclass');
  }

  toJSON() {
    return {
      cards: this.#cards.map((c) => c.toJSON()),
      score: this.calculateScore()
    };
  }
}
