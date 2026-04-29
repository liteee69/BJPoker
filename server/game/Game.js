import { Deck } from './Deck.js';

// Base coordinator for a single round. Subclasses implement the phase machine.
export class Game {
  constructor(table) {
    this.table = table;
    this.deck = new Deck();
    this.phase = 'idle';
    this.roundId = 0;
  }

  start() {
    this.roundId += 1;
    this.deck.reset();
    this.deck.shuffle();
  }

  // Override — return the broadcastable game state for the client.
  getState() {
    throw new Error('getState() must be implemented by subclass');
  }
}
