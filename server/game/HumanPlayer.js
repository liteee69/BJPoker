import { Player } from './Player.js';

export class HumanPlayer extends Player {
  constructor({ id, username, balance, socketId }) {
    super({ id, username, balance });
    this.socketId = socketId;
    this.seatIndex = null;
    this.currentBet = 0;
    this.disconnected = false;
  }

  attachSocket(socketId) { this.socketId = socketId; }
  detachSocket() { this.socketId = null; }
}
