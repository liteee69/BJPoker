import express from 'express';
import { User } from '../models/User.js';
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth
} from '../middleware/auth.js';

const router = express.Router();

// Express 4 does not catch rejected promises from async handlers.
// Pass them to the error handler so a DB failure returns an error instead of crashing.
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.post('/register', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = await User.findOne({ username });
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({ username, passwordHash });
  const token = signToken(user._id.toString());
  setAuthCookie(res, token);
  res.json({ user: user.toPublicJSON() });
}));

router.post('/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = await User.findOne({ username });
  if (!user || !(await user.verifyPassword(password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken(user._id.toString());
  setAuthCookie(res, token);
  res.json({ user: user.toPublicJSON() });
}));

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
});

export default router;
