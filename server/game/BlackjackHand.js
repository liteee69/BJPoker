import { Hand } from './Hand.js';

export class BlackjackHand extends Hand {
  // Override — ace-aware scoring. Aces count 11 unless that would bust, then 1.
  calculateScore() {
    let total = 0;
    let aces = 0;
    for (const card of this.cards) {
      if (card.rank === 'A') {
        aces += 1;
        total += 11;
      } else if (['K', 'Q', 'J'].includes(card.rank)) {
        total += 10;
      } else {
        total += parseInt(card.rank, 10);
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  isBust() { return this.calculateScore() > 21; }

  isBlackjack() {
    return this.size === 2 && this.calculateScore() === 21;
  }

  // "Soft" = an ace is currently counted as 11.
  isSoft() {
    let total = 0;
    let aces = 0;
    for (const card of this.cards) {
      if (card.rank === 'A') { aces += 1; total += 11; }
      else if (['K', 'Q', 'J'].includes(card.rank)) total += 10;
      else total += parseInt(card.rank, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
    return aces > 0;
  }
}
