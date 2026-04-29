import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import { connectDB } from './db.js';
import authRoutes from './routes/auth.js';
import { socketAuth } from './sockets/auth.js';
import { registerLobbyHandlers } from './sockets/lobby.js';
import { registerBlackjackHandlers } from './sockets/blackjack.js';
import { registerPokerHandlers } from './sockets/poker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);

io.use(socketAuth);
io.on('connection', (socket) => {
  console.log(`socket connected: ${socket.id} (user=${socket.data.username})`);
  registerLobbyHandlers(io, socket);
  registerBlackjackHandlers(io, socket);
  registerPokerHandlers(io, socket);
  socket.on('disconnect', () => console.log(`socket disconnected: ${socket.id}`));
});

async function start() {
  if (MONGO_URI) {
    try {
      await connectDB(MONGO_URI);
    } catch (err) {
      console.error('MongoDB connection failed:', err.message);
      console.error('Server will continue without DB. Set MONGO_URI to enable persistence.');
    }
  } else {
    console.warn('MONGO_URI not set — running without database.');
  }
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

start();
