import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BlackjackTable } from '../game/BlackjackTable.js';
import { BlackjackGame, PHASES } from '../game/BlackjackGame.js';
import { HumanPlayer } from '../game/HumanPlayer.js';

function makeTable() {
  const t = new BlackjackTable({ id: 't1', name: 'Test' });
  return t;
}

function seatPlayer(table, id, balance = 1000) {
  const p = new HumanPlayer({ id, username: id, balance, socketId: 's' + id });
  table.seatPlayer(p);
  return p;
}

describe('BlackjackGame — single player round flow', () => {
  let table, game, alice;

  beforeEach(() => {
    table = makeTable();
    game = new BlackjackGame(table);
    alice = seatPlayer(table, 'alice', 200);
  });

  it('starts in idle, transitions to betting on startBetting', () => {
    assert.equal(game.phase, PHASES.IDLE);
    game.startBetting();
    assert.equal(game.phase, PHASES.BETTING);
    assert.equal(alice.hand.size, 0);
    assert.equal(alice.currentBet, 0);
  });

  it('placeBet locks balance, deals cards, advances to playing', () => {
    game.startBetting();
    game.placeBet('alice', 50);
    assert.equal(alice.balance, 150); // 200 - 50
    assert.equal(alice.currentBet, 50);
    assert.equal(game.phase, PHASES.PLAYING);
    assert.equal(alice.hand.size, 2);
    assert.equal(table.dealer.hand.size, 2);
    assert.equal(game.activeSeatIdx, 0);
  });

  it('rejects bet outside the configured range', () => {
    game.startBetting();
    assert.throws(() => game.placeBet('alice', 9));
    assert.throws(() => game.placeBet('alice', 501));
  });

  it('stand advances past the only player and dealer plays + settles', () => {
    game.startBetting();
    game.placeBet('alice', 50);
    game.stand('alice');
    // After alice stands, dealer plays and we settle.
    assert.equal(game.phase, PHASES.SETTLE);
    assert.equal(game.activeSeatIdx, null);
    assert.equal(game.results.length, 1);
    assert.ok(['win', 'lose', 'push', 'blackjack'].includes(game.results[0].outcome));
  });

  it('hit deals a card; bust auto-advances', () => {
    game.startBetting();
    game.placeBet('alice', 50);
    const before = alice.hand.size;
    // Force a known busting state by hitting until bust or stand.
    let safety = 0;
    while (game.phase === PHASES.PLAYING && safety < 20) {
      game.hit('alice');
      safety++;
    }
    assert.ok(safety < 20, 'should not loop forever');
    // Either she busted (settle), or she still has not — but if hand > 21 she went to settle.
    if (alice.hand.isBust()) {
      assert.equal(game.phase, PHASES.SETTLE);
      assert.equal(game.results[0].outcome, 'lose');
    }
    assert.ok(alice.hand.size > before);
  });

  it('double doubles bet, takes one card, advances', () => {
    game.startBetting();
    game.placeBet('alice', 50);
    // If the deal produced a natural blackjack the round is already over — skip then.
    if (game.phase !== PHASES.PLAYING) return;
    assert.equal(alice.currentBet, 50);
    const cardsBefore = alice.hand.size;
    game.double('alice');
    assert.equal(alice.currentBet, 100);
    assert.equal(alice.hand.size, cardsBefore + 1);
    assert.equal(game.phase, PHASES.SETTLE);
  });

  it('double rejected after a hit', () => {
    game.startBetting();
    game.placeBet('alice', 50);
    if (game.phase !== PHASES.PLAYING) return;
    game.hit('alice');
    if (game.phase === PHASES.PLAYING) {
      assert.throws(() => game.double('alice'));
    }
  });

  it('rejects actions when its not your turn', () => {
    const bob = seatPlayer(table, 'bob', 200);
    game.startBetting();
    game.placeBet('alice', 50);
    game.placeBet('bob', 50);
    // Alice is active first (seat 0).
    assert.equal(game.activeSeatIdx, 0);
    assert.throws(() => game.hit('bob')); // not bob's turn
  });
});

describe('BlackjackGame — late joiners and disconnects', () => {
  it('player joining mid-betting can place a bet without crashing dealInitial', () => {
    const table = makeTable();
    const game = new BlackjackGame(table);
    seatPlayer(table, 'alice', 200);
    game.startBetting();
    // Bob joins AFTER startBetting — his hand is null at this point.
    const bob = seatPlayer(table, 'bob', 200);
    assert.equal(bob.hand, null);
    game.placeBet('alice', 50);
    // Should not throw — placeBet must initialize bob's hand defensively.
    game.placeBet('bob', 50);
    assert.ok(bob.hand);
    assert.equal(bob.hand.size, 2);
  });

  it('round advances when the active player leaves mid-turn', () => {
    const table = makeTable();
    const game = new BlackjackGame(table);
    seatPlayer(table, 'alice', 200);
    seatPlayer(table, 'bob', 200);
    game.startBetting();
    game.placeBet('alice', 50);
    game.placeBet('bob', 50);
    if (game.phase !== PHASES.PLAYING) return; // both got natural BJ — rare
    assert.equal(game.activeSeatIdx, 0); // alice
    // Simulate what the lobby does: remove the player from the seats first.
    table.removePlayer('alice');
    game.handlePlayerLeave('alice');
    // Active seat should advance to bob (or skip to dealer if bob is also done).
    assert.notEqual(game.activeSeatIdx, 0);
  });

  it('round advances when sole active player leaves (goes to dealer)', () => {
    const table = makeTable();
    const game = new BlackjackGame(table);
    seatPlayer(table, 'alice', 200);
    game.startBetting();
    game.placeBet('alice', 50);
    if (game.phase !== PHASES.PLAYING) return;
    table.removePlayer('alice');
    game.handlePlayerLeave('alice');
    // Only player gone → dealer plays → settle.
    assert.equal(game.phase, PHASES.SETTLE);
  });

  it('betting unblocks when the holdup player leaves', () => {
    const table = makeTable();
    const game = new BlackjackGame(table);
    seatPlayer(table, 'alice', 200);
    seatPlayer(table, 'bob', 200);
    game.startBetting();
    game.placeBet('alice', 50);
    assert.equal(game.phase, PHASES.BETTING); // waiting on bob
    table.removePlayer('bob');
    game.handlePlayerLeave('bob');
    // With bob gone, alice's bet alone is enough → deal.
    assert.notEqual(game.phase, PHASES.BETTING);
  });
});

describe('BlackjackGame — multi-player', () => {
  it('all seated players must decide before dealing', () => {
    const table = makeTable();
    seatPlayer(table, 'alice', 200);
    seatPlayer(table, 'bob', 200);
    const game = new BlackjackGame(table);
    game.startBetting();
    game.placeBet('alice', 50);
    assert.equal(game.phase, PHASES.BETTING); // still waiting on bob
    game.sitOut('bob');
    // Bob sat out → alice plays alone.
    assert.equal(game.phase, PHASES.PLAYING);
    assert.equal(game.activeSeatIdx, 0);
  });

  it('rotates active seat in order', () => {
    const table = makeTable();
    seatPlayer(table, 'alice', 200);
    seatPlayer(table, 'bob', 200);
    const game = new BlackjackGame(table);
    game.startBetting();
    game.placeBet('alice', 50);
    game.placeBet('bob', 50);
    assert.equal(game.activeSeatIdx, 0);
    game.stand('alice');
    // After alice stands, active should advance to bob unless bob has BJ.
    if (game.phase === PHASES.PLAYING) {
      assert.equal(game.activeSeatIdx, 1);
    }
  });
});
