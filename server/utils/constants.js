export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const SUIT_SYMBOL = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

export const STARTING_BALANCE = 1000;
export const MIN_BET = 10;
export const MAX_BET = 500;
export const REFILL_AMOUNT = 200;

export const GAME_TYPES = {
  BLACKJACK: 'blackjack',
  POKER: 'poker'
};

export const TABLES_PER_TYPE = 5;

export const BET_WINDOW_MS = 20_000;
export const ACTION_WINDOW_MS = 10_000;        // blackjack per-turn timer
export const POKER_ACTION_WINDOW_MS = 15_000;  // poker per-turn timer
export const NEXT_ROUND_DELAY_MS = 5_000;
