import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../game/Player.js';
import { HumanPlayer } from '../game/HumanPlayer.js';
import { DealerPlayer } from '../game/DealerPlayer.js';
import { BlackjackHand } from '../game/BlackjackHand.js';
import { Card } from '../game/Card.js';

describe('Player encapsulation', () => {
  it('balance is read-only via getter — direct assignment is rejected', () => {
    const p = new Player({ id: '1', username: 'a', balance: 100 });
    assert.equal(p.balance, 100);
    // ESM modules run in strict mode → assigning to a getter-only property throws.
    assert.throws(() => { p.balance = 999; }, TypeError);
    assert.equal(p.balance, 100);
  });

  it('placeBet decrements, win increments', () => {
    const p = new Player({ id: '1', username: 'a', balance: 100 });
    p.placeBet(40);
    assert.equal(p.balance, 60);
    p.win(80);
    assert.equal(p.balance, 140);
  });

  it('over-bet throws', () => {
    const p = new Player({ id: '1', username: 'a', balance: 10 });
    assert.throws(() => p.placeBet(20));
  });
});

describe('HumanPlayer extends Player', () => {
  it('inherits balance behavior, adds socketId', () => {
    const h = new HumanPlayer({ id: '1', username: 'a', balance: 50, socketId: 'sock' });
    assert.ok(h instanceof Player);
    assert.equal(h.socketId, 'sock');
    h.placeBet(20);
    assert.equal(h.balance, 30);
  });
});

describe('DealerPlayer.shouldHit (override)', () => {
  it('hits on 16, stands on 17', () => {
    const d = new DealerPlayer();
    d.hand = new BlackjackHand();
    d.hand.addCard(new Card('K', 'spades'));
    d.hand.addCard(new Card('6', 'hearts')); // 16
    assert.equal(d.shouldHit(), true);

    d.hand.clear();
    d.hand.addCard(new Card('K', 'spades'));
    d.hand.addCard(new Card('7', 'hearts')); // 17
    assert.equal(d.shouldHit(), false);
  });

  it('stands on soft 17 (house rule of this table)', () => {
    const d = new DealerPlayer();
    d.hand = new BlackjackHand();
    d.hand.addCard(new Card('A', 'spades'));
    d.hand.addCard(new Card('6', 'hearts')); // soft 17
    assert.equal(d.shouldHit(), false);
  });
});
