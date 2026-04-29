import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../game/Card.js';
import { BlackjackHand } from '../game/BlackjackHand.js';

function hand(...pairs) {
  const h = new BlackjackHand();
  for (const [rank, suit] of pairs) h.addCard(new Card(rank, suit));
  return h;
}

describe('BlackjackHand.calculateScore (override)', () => {
  it('sums number cards', () => {
    assert.equal(hand(['5', 'spades'], ['7', 'hearts']).calculateScore(), 12);
  });

  it('treats face cards as 10', () => {
    assert.equal(hand(['K', 'spades'], ['Q', 'hearts']).calculateScore(), 20);
  });

  it('A + 9 = 20 (ace as 11)', () => {
    assert.equal(hand(['A', 'spades'], ['9', 'hearts']).calculateScore(), 20);
  });

  it('A + 6 + 8 = 15 (ace switches to 1 after 8)', () => {
    assert.equal(hand(['A', 'spades'], ['6', 'hearts'], ['8', 'clubs']).calculateScore(), 15);
  });

  it('A + A = 12 (one as 11, one as 1)', () => {
    assert.equal(hand(['A', 'spades'], ['A', 'hearts']).calculateScore(), 12);
  });

  it('A + A + 9 = 21', () => {
    assert.equal(hand(['A', 'spades'], ['A', 'hearts'], ['9', 'clubs']).calculateScore(), 21);
  });

  it('detects bust', () => {
    assert.equal(hand(['K', 's'.replace('s', 'spades')], ['Q', 'hearts'], ['5', 'clubs']).calculateScore(), 25);
    assert.equal(hand(['K', 'spades'], ['Q', 'hearts'], ['5', 'clubs']).isBust(), true);
  });

  it('detects natural blackjack', () => {
    assert.equal(hand(['A', 'spades'], ['K', 'hearts']).isBlackjack(), true);
    assert.equal(hand(['A', 'spades'], ['9', 'hearts'], ['A', 'clubs']).isBlackjack(), false);
  });

  it('detects soft hand', () => {
    assert.equal(hand(['A', 'spades'], ['6', 'hearts']).isSoft(), true);
    assert.equal(hand(['A', 'spades'], ['6', 'hearts'], ['8', 'clubs']).isSoft(), false);
  });
});
