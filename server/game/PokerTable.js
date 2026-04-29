import { Table } from './Table.js';
import { GAME_TYPES } from '../utils/constants.js';

const SMALL_BLIND = 5;
const BIG_BLIND = 10;

export class PokerTable extends Table {
  constructor({ id, name }) {
    super({ id, name, maxSeats: 6 });
    this.minSeats = 2;
    this.gameType = GAME_TYPES.POKER;
    this.dealerButtonIdx = 0;
    this.smallBlind = SMALL_BLIND;
    this.bigBlind = BIG_BLIND;
  }

  rotateDealerButton() {
    const occupied = this.players
      .map((p, i) => (p ? i : -1))
      .filter((i) => i !== -1);
    if (occupied.length === 0) return;
    const currentPos = occupied.indexOf(this.dealerButtonIdx);
    const nextPos = (currentPos + 1) % occupied.length;
    this.dealerButtonIdx = occupied[nextPos];
  }

  toJSON() {
    return {
      ...super.toJSON(),
      gameType: this.gameType,
      minSeats: this.minSeats,
      dealerButtonIdx: this.dealerButtonIdx,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind
    };
  }
}
