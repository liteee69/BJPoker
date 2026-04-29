import { Player } from './Player.js';

// Stand on all 17 (including soft 17) by default — house rule of this table.
export class DealerPlayer extends Player {
  constructor() {
    super({ id: 'dealer', username: 'Dealer', balance: 0 });
  }

  // Override — automated decision logic. Returns true if dealer should draw another card.
  shouldHit() {
    if (!this.hand) return false;
    return this.hand.calculateScore() < 17;
  }
}
