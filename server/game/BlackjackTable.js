import { Table } from './Table.js';
import { DealerPlayer } from './DealerPlayer.js';
import { GAME_TYPES } from '../utils/constants.js';

export class BlackjackTable extends Table {
  constructor({ id, name }) {
    super({ id, name, maxSeats: 6 });
    this.gameType = GAME_TYPES.BLACKJACK;
    this.dealer = new DealerPlayer();
  }

  toJSON() {
    return {
      ...super.toJSON(),
      gameType: this.gameType,
      dealer: this.dealer.toJSON()
    };
  }
}
