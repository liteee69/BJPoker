import { Hand } from './Hand.js';

export const HAND_RANKS = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
  ROYAL_FLUSH: 9
};

const RANK_NAME = Object.fromEntries(
  Object.entries(HAND_RANKS).map(([k, v]) => [v, k])
);

export class PokerHand extends Hand {
  // Override — evaluates the best 5-card hand from this hand's cards (typically 2 hole)
  // combined with optional community cards.
  calculateScore(community = []) {
    const all = [...this.cards, ...community];
    if (all.length < 5) {
      return { rank: 'HIGH_CARD', value: HAND_RANKS.HIGH_CARD, kickers: [], cards: [] };
    }
    return PokerHand.bestOf(all);
  }

  // Returns an evaluation { rank, value, kickers, cards } for the best 5-card subset.
  static bestOf(cards) {
    let best = null;
    for (const combo of combinations(cards, 5)) {
      const evalResult = evaluate5(combo);
      if (!best || PokerHand.compare(evalResult, best) > 0) best = evalResult;
    }
    return best;
  }

  static compare(a, b) {
    if (a.value !== b.value) return a.value - b.value;
    for (let i = 0; i < a.kickers.length; i++) {
      if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
    }
    return 0;
  }
}

function* combinations(arr, k) {
  const n = arr.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function evaluate5(cards) {
  const ranks = cards.map((c) => c.numericRank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = checkStraight(ranks);

  // Group by rank: [[rank, count], ...] sorted by count desc, then rank desc
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const make = (rankName, kickers) => ({
    rank: rankName,
    value: HAND_RANKS[rankName],
    kickers,
    cards: [...cards]
  });

  if (isFlush && straightHigh !== null) {
    if (straightHigh === 14) return make('ROYAL_FLUSH', [14]);
    return make('STRAIGHT_FLUSH', [straightHigh]);
  }
  if (groups[0][1] === 4) return make('FOUR_OF_A_KIND', [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return make('FULL_HOUSE', [groups[0][0], groups[1][0]]);
  if (isFlush) return make('FLUSH', ranks);
  if (straightHigh !== null) return make('STRAIGHT', [straightHigh]);
  if (groups[0][1] === 3) {
    const kickers = ranks.filter((r) => r !== groups[0][0]).slice(0, 2);
    return make('THREE_OF_A_KIND', [groups[0][0], ...kickers]);
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const high = Math.max(groups[0][0], groups[1][0]);
    const low = Math.min(groups[0][0], groups[1][0]);
    const kicker = ranks.find((r) => r !== high && r !== low);
    return make('TWO_PAIR', [high, low, kicker]);
  }
  if (groups[0][1] === 2) {
    const kickers = ranks.filter((r) => r !== groups[0][0]).slice(0, 3);
    return make('PAIR', [groups[0][0], ...kickers]);
  }
  return make('HIGH_CARD', ranks);
}

function checkStraight(rankDesc) {
  const unique = [...new Set(rankDesc)];
  if (unique.length !== 5) return null;
  if (unique[0] - unique[4] === 4) return unique[0];
  // Wheel: A-5-4-3-2 → high card is 5
  if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
    return 5;
  }
  return null;
}

export { RANK_NAME };
