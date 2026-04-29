import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../game/Card.js';
import { PokerHand, HAND_RANKS } from '../game/PokerHand.js';

function c(s) {
  // "As" → ace of spades, "Th" → ten of hearts, "2c" → two of clubs
  const rankChar = s.slice(0, -1);
  const suitChar = s.slice(-1);
  const suitMap = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
  const rankMap = { T: '10' };
  return new Card(rankMap[rankChar] || rankChar, suitMap[suitChar]);
}

function hand(holeStrs, communityStrs = []) {
  const h = new PokerHand();
  for (const s of holeStrs) h.addCard(c(s));
  return h.calculateScore(communityStrs.map(c));
}

describe('PokerHand.calculateScore (override)', () => {
  it('royal flush', () => {
    const r = hand(['As', 'Ks'], ['Qs', 'Js', 'Ts', '2c', '3d']);
    assert.equal(r.rank, 'ROYAL_FLUSH');
    assert.equal(r.value, HAND_RANKS.ROYAL_FLUSH);
  });

  it('straight flush', () => {
    const r = hand(['9s', '8s'], ['7s', '6s', '5s', '2c', '3d']);
    assert.equal(r.rank, 'STRAIGHT_FLUSH');
    assert.equal(r.kickers[0], 9);
  });

  it('four of a kind beats full house', () => {
    const quads = hand(['As', 'Ah'], ['Ad', 'Ac', 'Kd', '2c', '3d']);
    const fh = hand(['As', 'Ah'], ['Ad', 'Kc', 'Kd', '2c', '3d']);
    assert.equal(quads.rank, 'FOUR_OF_A_KIND');
    assert.equal(fh.rank, 'FULL_HOUSE');
    assert.ok(PokerHand.compare(quads, fh) > 0);
  });

  it('full house', () => {
    const r = hand(['As', 'Ah'], ['Ad', 'Kc', 'Kd', '2c', '3s']);
    assert.equal(r.rank, 'FULL_HOUSE');
    assert.deepEqual(r.kickers, [14, 13]);
  });

  it('flush', () => {
    const r = hand(['As', '5s'], ['8s', '4s', '2s', 'Kc', '3d']);
    assert.equal(r.rank, 'FLUSH');
  });

  it('straight (broadway)', () => {
    const r = hand(['As', 'Kh'], ['Qd', 'Jc', 'Ts', '2c', '3d']);
    assert.equal(r.rank, 'STRAIGHT');
    assert.equal(r.kickers[0], 14);
  });

  it('straight (wheel A-2-3-4-5)', () => {
    const r = hand(['As', '2h'], ['3d', '4c', '5s', 'Kc', '7d']);
    assert.equal(r.rank, 'STRAIGHT');
    assert.equal(r.kickers[0], 5);
  });

  it('three of a kind', () => {
    const r = hand(['As', 'Ah'], ['Ad', 'Kc', 'Qd', '2c', '3s']);
    assert.equal(r.rank, 'THREE_OF_A_KIND');
  });

  it('two pair with kicker tiebreak', () => {
    const a = hand(['As', 'Ah'], ['Kd', 'Kc', '5s', '2c', '3d']);
    const b = hand(['As', 'Ah'], ['Kd', 'Kc', '4s', '2c', '3d']);
    assert.equal(a.rank, 'TWO_PAIR');
    assert.equal(b.rank, 'TWO_PAIR');
    assert.ok(PokerHand.compare(a, b) > 0);
  });

  it('one pair', () => {
    const r = hand(['As', 'Ah'], ['Kd', 'Qc', 'Js', '2c', '3d']);
    assert.equal(r.rank, 'PAIR');
  });

  it('high card', () => {
    const r = hand(['As', 'Kh'], ['9d', '7c', '5s', '3c', '2d']);
    assert.equal(r.rank, 'HIGH_CARD');
  });

  it('flush beats straight', () => {
    const flush = hand(['As', '5s'], ['8s', '4s', '2s', 'Kc', '3d']);
    const straight = hand(['As', 'Kh'], ['Qd', 'Jc', 'Ts', '2c', '3d']);
    assert.ok(PokerHand.compare(flush, straight) > 0);
  });

  it('higher pair wins', () => {
    const aces = hand(['As', 'Ah'], ['9d', '7c', '5s', '3c', '2d']);
    const kings = hand(['Ks', 'Kh'], ['9d', '7c', '5s', '3c', '2d']);
    assert.ok(PokerHand.compare(aces, kings) > 0);
  });
});
