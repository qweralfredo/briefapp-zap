import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import apiRoutes from './routes/api.js';
import whatsappRoutes from './routes/whatsapp.js';
import { SessionManager } from './whatsapp/manager.js';
import { MessageHandler } from './whatsapp/handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// ── Session Manager ──
const sessionManager = new SessionManager(io);
app.set('sessionManager', sessionManager);

// ── Message Handler (wires itself to sessionManager events) ──
const messageHandler = new MessageHandler(sessionManager);

// ── API Routes ──
app.use('/api', apiRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ── SPA Fallback ──
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// ── Socket.IO ──
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Send current sessions status on connect
  socket.emit('whatsapp:sessions', sessionManager.getAllSessions());

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// ── Start ──
server.listen(PORT, async () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║                                          ║
  ║   🚀 Briefapp.Zap Server Running        ║
  ║                                          ║
  ║   Local:  http://localhost:${PORT}          ║
  ║                                          ║
  ╚══════════════════════════════════════════╝
  `);

  // Auto-restore saved sessions
  await sessionManager.restoreSessions();
});
