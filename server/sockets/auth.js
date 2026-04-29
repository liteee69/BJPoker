import cookie from 'cookie';
import { COOKIE_NAME, verifyToken } from '../middleware/auth.js';
import { User } from '../models/User.js';

// Socket.IO middleware: authenticate via the JWT cookie set by the auth routes.
// Rejects the connection if the user isn't logged in.
export async function socketAuth(socket, next) {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies[COOKIE_NAME];
    if (!token) return next(new Error('Not authenticated'));
    const payload = verifyToken(token);
    if (!payload) return next(new Error('Invalid token'));
    const user = await User.findById(payload.sub);
    if (!user) return next(new Error('User not found'));
    socket.data.userId = user._id.toString();
    socket.data.username = user.username;
    socket.data.balance = user.balance;
    next();
  } catch (err) {
    next(err);
  }
}
