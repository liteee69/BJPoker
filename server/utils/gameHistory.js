import { GameHistory } from '../models/GameHistory.js';

// Map a net chip delta to a result bucket. Used by both bj and poker recorders.
export function deltaToResult(balanceChange) {
  if (balanceChange > 0) return 'win';
  if (balanceChange < 0) return 'loss';
  return 'draw';
}

// Persist a single round outcome. Fire-and-forget — never block game flow on DB.
export function recordGameHistory({ userId, gameType, result, balanceChange }) {
  return GameHistory.create({ userId, gameType, result, balanceChange }).catch((err) =>
    console.error('GameHistory persist failed:', err.message)
  );
}
