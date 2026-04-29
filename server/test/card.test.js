import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../game/Card.js';

describe('Card', () => {
  it('exposes rank, suit, color', () => {
    const c = new Card('A', 'hearts');
    assert.equal(c.rank, 'A');
    assert.equal(c.suit, 'hearts');
    assert.equal(c.color, 'red');
  });

  it('numericRank: A=14, K=13, Q=12, J=11, 10=10, 2=2', () => {
    assert.equal(new Card('A', 'spades').numericRank, 14);
    assert.equal(new Card('K', 'spades').numericRank, 13);
    assert.equal(new Card('Q', 'spades').numericRank, 12);
    assert.equal(new Card('J', 'spades').numericRank, 11);
    assert.equal(new Card('10', 'spades').numericRank, 10);
    assert.equal(new Card('2', 'spades').numericRank, 2);
  });

  it('clubs and spades are black', () => {
    assert.equal(new Card('5', 'clubs').color, 'black');
    assert.equal(new Card('5', 'spades').color, 'black');
  });

  it('rejects invalid rank or suit', () => {
    assert.throws(() => new Card('1', 'hearts'));
    assert.throws(() => new Card('A', 'stars'));
  });

  it('toJSON includes symbol', () => {
    const json = new Card('Q', 'diamonds').toJSON();
    assert.equal(json.rank, 'Q');
    assert.equal(json.suit, 'diamonds');
    assert.equal(json.symbol, '♦');
    assert.equal(json.color, 'red');
  });
});
