import { BlackjackTable } from '../game/BlackjackTable.js';
import { PokerTable } from '../game/PokerTable.js';
import { TABLES_PER_TYPE } from '../utils/constants.js';

class TableManager {
  #tables = new Map();

  seed() {
    this.#tables.clear();
    for (let i = 1; i <= TABLES_PER_TYPE; i++) {
      const bjId = `blackjack-${i}`;
      this.#tables.set(bjId, new BlackjackTable({ id: bjId, name: `Blackjack Table #${i}` }));
      const pkId = `poker-${i}`;
      this.#tables.set(pkId, new PokerTable({ id: pkId, name: `Poker Table #${i}` }));
    }
  }

  list() { return [...this.#tables.values()].map((t) => t.toJSON()); }
  get(tableId) { return this.#tables.get(tableId) || null; }
}

export const tableManager = new TableManager();
tableManager.seed();
