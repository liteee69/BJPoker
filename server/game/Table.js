// Base table — manages seat occupancy. Subclasses add game-specific seat counts and rules.
export class Table {
  #players;

  constructor({ id, name, maxSeats }) {
    this.id = id;
    this.name = name;
    this.maxSeats = maxSeats;
    this.#players = new Array(maxSeats).fill(null);
    this.game = null; // current Game instance
  }

  get players() { return [...this.#players]; }
  get occupiedSeats() { return this.#players.filter((p) => p !== null); }
  get isFull() { return this.occupiedSeats.length >= this.maxSeats; }

  firstFreeSeat() {
    return this.#players.findIndex((p) => p === null);
  }

  seatPlayer(player) {
    const idx = this.firstFreeSeat();
    if (idx === -1) throw new Error('Table is full');
    this.#players[idx] = player;
    if ('seatIndex' in player) player.seatIndex = idx;
    return idx;
  }

  removePlayer(playerId) {
    const idx = this.#players.findIndex((p) => p && p.id === playerId);
    if (idx === -1) return false;
    this.#players[idx] = null;
    return true;
  }

  findPlayer(playerId) {
    return this.#players.find((p) => p && p.id === playerId) || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      maxSeats: this.maxSeats,
      players: this.#players.map((p) => (p ? { id: p.id, username: p.username, balance: p.balance } : null))
    };
  }
}
