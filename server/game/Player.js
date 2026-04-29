// Base player. Subclasses: HumanPlayer, DealerPlayer.
export class Player {
  #balance;

  constructor({ id, username, balance = 0 }) {
    this.id = id;
    this.username = username;
    this.#balance = balance;
    this.hand = null; // assigned by the Game (typed: BlackjackHand or PokerHand)
  }

  get balance() { return this.#balance; }

  placeBet(amount) {
    if (amount <= 0) throw new Error('Bet must be positive');
    if (amount > this.#balance) throw new Error('Insufficient balance');
    this.#balance -= amount;
    return amount;
  }

  win(amount) {
    if (amount < 0) throw new Error('Win amount cannot be negative');
    this.#balance += amount;
    return this.#balance;
  }

  setBalance(amount) { this.#balance = amount; }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      balance: this.#balance,
      hand: this.hand ? this.hand.toJSON() : null
    };
  }
}
