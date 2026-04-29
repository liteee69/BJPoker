import mongoose from 'mongoose';
import { GAME_TYPES } from '../utils/constants.js';

const gameHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  gameType: {
    type: String,
    required: true,
    enum: [GAME_TYPES.BLACKJACK, GAME_TYPES.POKER]
  },
  result: {
    type: String,
    required: true,
    enum: ['win', 'loss', 'draw']
  },
  balanceChange: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, index: true }
});

gameHistorySchema.index({ userId: 1, timestamp: -1 });

export const GameHistory = mongoose.model('GameHistory', gameHistorySchema);
