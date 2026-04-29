import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'bjp_token';
const TOKEN_TTL = '7d';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

export function readTokenFromCookie(cookies) {
  return cookies?.[COOKIE_NAME] || null;
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const token = readTokenFromCookie(req.cookies);
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });
  const user = await User.findById(payload.sub);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  next();
}

export { COOKIE_NAME };
