import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Deck } from '../game/Deck.js';

describe('Deck', () => {
  it('starts with 52 unique cards', () => {
    const d = new Deck();
    assert.equal(d.size, 52);
  });

  it('draw(1) returns a single Card and decrements size', () => {
    const d = new Deck();
    const card = d.draw();
    assert.ok(card.rank);
    assert.ok(card.suit);
    assert.equal(d.size, 51);
  });

  it('draw(n) returns array of n cards', () => {
    const d = new Deck();
    const cards = d.draw(5);
    assert.equal(cards.length, 5);
    assert.equal(d.size, 47);
  });

  it('draw past the deck throws', () => {
    const d = new Deck();
    d.draw(52);
    assert.throws(() => d.draw());
  });

  it('reset rebuilds back to 52', () => {
    const d = new Deck();
    d.draw(10);
    d.reset();
    assert.equal(d.size, 52);
  });

  it('shuffle preserves the same 52 cards', () => {
    const d = new Deck();
    d.shuffle();
    const all = d.draw(52);
    const ids = new Set(all.map((c) => `${c.rank}-${c.suit}`));
    assert.equal(ids.size, 52);
  });
});
