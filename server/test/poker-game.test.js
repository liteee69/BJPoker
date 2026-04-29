import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from '../game/PokerTable.js';
import { PokerGame, PHASES } from '../game/PokerGame.js';
import { HumanPlayer } from '../game/HumanPlayer.js';

function makeTable() {
  return new PokerTable({ id: 't1', name: 'Test' });
}

function seat(table, id, balance = 1000) {
  const p = new HumanPlayer({ id, username: id, balance, socketId: 's' + id });
  table.seatPlayer(p);
  return p;
}

// Helper: find the player at the active seat.
function activePlayer(game) {
  return game.table.players[game.activeSeatIdx];
}

describe('PokerGame — hand setup and blinds', () => {
  it('refuses to start with fewer than 2 players', () => {
    const t = makeTable();
    seat(t, 'alice');
    const g = new PokerGame(t);
    assert.equal(g.startHand(), false);
    assert.equal(g.phase, PHASES.IDLE);
  });

  it('three-handed: posts SB and BB to left of dealer, UTG acts first', () => {
    const t = makeTable();
    const a = seat(t, 'alice');   // seat 0 (dealer)
    const b = seat(t, 'bob');     // seat 1 (SB)
    const c = seat(t, 'carol');   // seat 2 (BB)
    const g = new PokerGame(t);
    g.startHand();
    assert.equal(g.phase, PHASES.PREFLOP);
    assert.equal(b.balance, 995); // posted 5
    assert.equal(c.balance, 990); // posted 10
    assert.equal(a.balance, 1000);
    assert.equal(g.pot, 15);
    assert.equal(g.currentBet, 10);
    // UTG with 3 players wraps back to dealer (alice).
    assert.equal(activePlayer(g).id, 'alice');
    assert.equal(a.hand.size, 2);
    assert.equal(b.hand.size, 2);
    assert.equal(c.hand.size, 2);
  });

  it('heads-up: dealer is SB and acts first preflop', () => {
    const t = makeTable();
    const a = seat(t, 'alice');   // seat 0 (dealer = SB)
    const b = seat(t, 'bob');     // seat 1 (BB)
    const g = new PokerGame(t);
    g.startHand();
    assert.equal(g.headsUp, true);
    assert.equal(a.balance, 995); // SB
    assert.equal(b.balance, 990); // BB
    assert.equal(activePlayer(g).id, 'alice');
  });
});

describe('PokerGame — preflop action flow (3-handed)', () => {
  let t, a, b, c, g;
  beforeEach(() => {
    t = makeTable();
    a = seat(t, 'alice');   // dealer
    b = seat(t, 'bob');     // SB
    c = seat(t, 'carol');   // BB
    g = new PokerGame(t);
    g.startHand();
  });

  it('UTG fold + SB fold awards uncontested pot to BB', () => {
    g.fold('alice');
    assert.equal(g.phase, PHASES.PREFLOP);
    g.fold('bob');
    assert.equal(g.phase, PHASES.SHOWDOWN);
    assert.equal(c.balance, 1005); // started 1000, posted 10, won 15 = 1005
    const carolResult = g.results.find((r) => r.playerId === 'carol');
    assert.equal(carolResult.won, true);
    assert.equal(carolResult.payout, 15);
    assert.equal(carolResult.rank, 'UNCONTESTED');
  });

  it('all call → BB checks → flop is dealt', () => {
    g.call('alice');           // alice calls 10
    g.call('bob');             // bob calls 5 more (total 10)
    assert.equal(g.phase, PHASES.PREFLOP);
    g.check('carol');          // BB option
    assert.equal(g.phase, PHASES.FLOP);
    assert.equal(g.communityCards.length, 3);
    assert.equal(g.currentBet, 0);
    assert.equal(g.pot, 30);
    // Postflop action starts at SB (bob, seat 1).
    assert.equal(activePlayer(g).id, 'bob');
  });

  it('raise reopens the round so prior callers must act again', () => {
    g.call('alice');           // alice calls 10
    g.raise('bob', 30);        // bob raises to 30
    assert.equal(g.currentBet, 30);
    assert.equal(g.minRaise, 20);
    // Action moves to carol (BB)
    assert.equal(activePlayer(g).id, 'carol');
    g.fold('carol');
    // alice must act again
    assert.equal(activePlayer(g).id, 'alice');
    g.call('alice');           // 20 more
    assert.equal(g.phase, PHASES.FLOP);
    assert.equal(g.pot, 70);   // 30+30+10
  });

  it('rejects raise below currentBet + minRaise', () => {
    assert.throws(() => g.raise('alice', 15), /Minimum raise/);
  });

  it('rejects check when there is something to call', () => {
    assert.throws(() => g.check('alice'), /Cannot check/);
  });

  it('rejects out-of-turn actions', () => {
    assert.throws(() => g.fold('bob'), /Not your turn/);
  });
});

describe('PokerGame — full hand to showdown', () => {
  it('plays all four streets and resolves a winner', () => {
    const t = makeTable();
    const a = seat(t, 'alice');
    const b = seat(t, 'bob');
    const c = seat(t, 'carol');
    const g = new PokerGame(t);
    g.startHand();
    // Preflop: everyone calls / checks
    g.call('alice');
    g.call('bob');
    g.check('carol');
    assert.equal(g.phase, PHASES.FLOP);
    // Flop: all check
    g.check('bob');
    g.check('carol');
    g.check('alice');
    assert.equal(g.phase, PHASES.TURN);
    // Turn: all check
    g.check('bob');
    g.check('carol');
    g.check('alice');
    assert.equal(g.phase, PHASES.RIVER);
    // River: all check
    g.check('bob');
    g.check('carol');
    g.check('alice');
    assert.equal(g.phase, PHASES.SHOWDOWN);
    assert.equal(g.communityCards.length, 5);
    assert.equal(g.pot, 0);
    // One of them won the 30-pot (or split). Combined balance must equal 3000 minus rake (none).
    const totalBalance = a.balance + b.balance + c.balance;
    assert.equal(totalBalance, 3000);
    // Exactly one or more (split) winners must be present.
    const winners = g.results.filter((r) => r.won);
    assert.ok(winners.length >= 1);
    for (const w of winners) assert.ok(w.payout > 0);
  });

});

describe('PokerGame — heads-up action order', () => {
  it('SB (dealer) calls preflop → BB checks → flop → SB acts first', () => {
    const t = makeTable();
    const a = seat(t, 'alice');   // dealer/SB
    const b = seat(t, 'bob');     // BB
    const g = new PokerGame(t);
    g.startHand();
    assert.equal(activePlayer(g).id, 'alice');
    g.call('alice');             // alice calls 5 more
    assert.equal(activePlayer(g).id, 'bob');
    g.check('bob');              // BB option
    assert.equal(g.phase, PHASES.FLOP);
    assert.equal(activePlayer(g).id, 'alice');  // dealer/SB acts first postflop in HU
  });
});

describe('PokerGame — leaving mid-hand', () => {
  it('player leaves while it is their turn → auto-fold + advance', () => {
    const t = makeTable();
    seat(t, 'alice');
    seat(t, 'bob');
    seat(t, 'carol');
    const g = new PokerGame(t);
    g.startHand();
    // alice is UTG. If alice leaves the table, hand should advance to bob.
    g.handlePlayerLeave('alice');
    assert.ok(!g.playersInHand.has('alice'));
    assert.equal(g.table.players[g.activeSeatIdx].id, 'bob');
  });

  it('all but one leave → uncontested pot to remaining player', () => {
    const t = makeTable();
    seat(t, 'alice');
    seat(t, 'bob');
    seat(t, 'carol');
    const g = new PokerGame(t);
    g.startHand();
    g.handlePlayerLeave('alice');
    g.handlePlayerLeave('bob');
    assert.equal(g.phase, PHASES.SHOWDOWN);
    const carol = g.results.find((r) => r.playerId === 'carol');
    assert.equal(carol.won, true);
  });
});

describe('PokerGame — forceAutoAction (timer expiry)', () => {
  it('auto-folds when there is something to call', () => {
    const t = makeTable();
    seat(t, 'alice');
    seat(t, 'bob');
    seat(t, 'carol');
    const g = new PokerGame(t);
    g.startHand();
    // alice is UTG preflop — owes 10 to call, so auto = fold.
    const activeId = activePlayer(g).id;
    g.forceAutoAction();
    assert.ok(!g.playersInHand.has(activeId));
  });

  it('auto-checks when nothing is owed', () => {
    const t = makeTable();
    seat(t, 'alice');
    seat(t, 'bob');
    seat(t, 'carol');
    const g = new PokerGame(t);
    g.startHand();
    // Drive everyone to the flop where nothing is owed.
    g.call('alice'); g.call('bob'); g.check('carol');
    assert.equal(g.phase, PHASES.FLOP);
    const activeBefore = activePlayer(g).id;
    g.forceAutoAction();
    // The auto-checker should still be in the hand and play has moved on.
    assert.ok(g.playersInHand.has(activeBefore));
    assert.notEqual(activePlayer(g)?.id, activeBefore);
  });
});

describe('PokerGame — all-in', () => {
  it('shorter stack going all-in caps the betting and runs the board out', () => {
    const t = makeTable();
    const a = seat(t, 'alice', 50);   // dealer/SB heads-up
    const b = seat(t, 'bob', 1000);   // BB
    const g = new PokerGame(t);
    g.startHand();
    // Alice (SB) shoves her remaining 45 chips → total 50 in.
    g.allIn('alice');
    assert.ok(g.allInPlayers.has('alice'));
    assert.equal(a.balance, 0);
    // Bob calls — should run out to showdown automatically (no more streets to bet).
    g.call('bob');
    assert.equal(g.phase, PHASES.SHOWDOWN);
    assert.equal(g.communityCards.length, 5);
    // No chips destroyed.
    assert.equal(a.balance + b.balance, 1050);
  });

  it('rejects a raise once anyone is all-in', () => {
    const t = makeTable();
    seat(t, 'alice', 50);
    seat(t, 'bob', 1000);
    seat(t, 'carol', 1000);
    const g = new PokerGame(t);
    g.startHand();
    // alice (UTG with 3) shoves
    g.allIn('alice');
    // bob can only call or fold, not raise
    assert.throws(() => g.raise('bob', 200), /someone is all-in/);
  });
});

describe('PokerGame — getState filtering', () => {
  it('hides hole cards from non-owners during the hand', () => {
    const t = makeTable();
    seat(t, 'alice');
    seat(t, 'bob');
    const g = new PokerGame(t);
    g.startHand();
    const stateForAlice = g.getState('alice');
    const aliceSeat = stateForAlice.seats.find((s) => s && s.id === 'alice');
    const bobSeat = stateForAlice.seats.find((s) => s && s.id === 'bob');
    assert.equal(aliceSeat.hand.cards.length, 2);
    assert.equal(aliceSeat.hand.cards[0].hidden, undefined);
    assert.equal(bobSeat.hand.cards[0].hidden, true);
  });

  it('reveals all non-folded hands at showdown', () => {
    const t = makeTable();
    seat(t, 'alice');
    seat(t, 'bob');
    const g = new PokerGame(t);
    g.startHand();
    // Force hand to showdown by both calling/checking through.
    g.call('alice'); g.check('bob');                  // preflop
    g.check('alice'); g.check('bob');                 // flop
    g.check('alice'); g.check('bob');                 // turn
    g.check('alice'); g.check('bob');                 // river
    assert.equal(g.phase, PHASES.SHOWDOWN);
    const state = g.getState('alice');
    const bobSeat = state.seats.find((s) => s.id === 'bob');
    // Bob did not fold → his cards are revealed.
    assert.equal(bobSeat.hand.cards[0].hidden, undefined);
  });
});
