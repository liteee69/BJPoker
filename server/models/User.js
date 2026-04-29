import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { STARTING_BALANCE } from '../utils/constants.js';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/
  },
  passwordHash: { type: String, required: true },
  balance: { type: Number, default: STARTING_BALANCE, min: 0 },
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    balance: this.balance
  };
};

export const User = mongoose.model('User', userSchema);
