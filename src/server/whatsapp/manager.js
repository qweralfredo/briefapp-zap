import { WhatsAppConnection } from './connection.js';
import { EventEmitter } from 'events';
import store from '../config/store.js';

/**
 * Session pool manager — manages multiple WhatsApp connections.
 * Persists session IDs to config store so they auto-reconnect on restart.
 * Bridges connections to Socket.IO for real-time frontend updates.
 */
export class SessionManager extends EventEmitter {
  constructor(io) {
    super();
    this.io = io;
    this.sessions = new Map(); // sessionId → WhatsAppConnection
  }

  /**
   * Restore all previously saved sessions on server startup.
   * Uses stored auth state (data/sessions/{id}/) — no QR scan needed if session was active.
   */
  async restoreSessions() {
    const savedSessions = store.getSessions();
    if (savedSessions.length === 0) {
      console.log('[SessionManager] Nenhuma sessão salva para restaurar.');
      return;
    }

    console.log(`[SessionManager] 🔄 Restaurando ${savedSessions.length} sessão(ões) salva(s)...`);

    for (const session of savedSessions) {
      try {
        console.log(`[SessionManager] → Reconectando sessão "${session.id}" (${session.name || 'sem nome'})...`);
        await this.createSession(session.id, { skipPersist: true });
      } catch (err) {
        console.error(`[SessionManager] ❌ Falha ao restaurar sessão "${session.id}":`, err.message);
      }
    }
  }

  /**
   * Create and start a new WhatsApp session.
   * @param {string} sessionId
   * @param {object} opts - { skipPersist: boolean } - skip saving to store (used during restore)
   */
  async createSession(sessionId, opts = {}) {
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId);
      if (existing.status === 'connected') {
        return existing.getInfo();
      }
      // Remove stale connection (but keep persisted entry)
      await this._removeConnection(sessionId);
    }

    const connection = new WhatsAppConnection(sessionId);

    // Forward events to Socket.IO
    connection.on('qr', (data) => {
      this.io.emit('whatsapp:qr', data);
      this.emit('qr', data);
    });

    connection.on('status', (data) => {
      this.io.emit('whatsapp:status', data);
      this.emit('status', data);
    });

    connection.on('ready', (data) => {
      this.io.emit('whatsapp:ready', data);
      this.emit('ready', data);
      console.log(`[SessionManager] ✅ Sessão "${sessionId}" conectada com sucesso.`);
    });

    connection.on('message', (data) => {
      this.io.emit('whatsapp:message', data);
      this.emit('message', data);
    });

    connection.on('close', (data) => {
      this.io.emit('whatsapp:close', data);
      this.emit('close', data);
    });

    this.sessions.set(sessionId, connection);
    await connection.connect();

    // Persist session ID to config store (so it auto-reconnects on restart)
    if (!opts.skipPersist) {
      store.addSession(sessionId);
      console.log(`[SessionManager] 💾 Sessão "${sessionId}" salva para reconexão automática.`);
    }

    return connection.getInfo();
  }

  /**
   * Remove and disconnect a session permanently (also removes from persistent store).
   */
  async removeSession(sessionId) {
    await this._removeConnection(sessionId);
    store.removeSession(sessionId);
    console.log(`[SessionManager] 🗑️ Sessão "${sessionId}" removida permanentemente.`);
    this.io.emit('whatsapp:status', {
      sessionId,
      status: 'disconnected',
      user: null
    });
  }

  /**
   * Internal: disconnect a session without removing from persistent store.
   */
  async _removeConnection(sessionId) {
    const connection = this.sessions.get(sessionId);
    if (connection) {
      await connection.disconnect();
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Get session info by ID.
   */
  getSession(sessionId) {
    const connection = this.sessions.get(sessionId);
    return connection ? connection.getInfo() : null;
  }

  /**
   * Get all sessions info.
   */
  getAllSessions() {
    const sessions = [];
    for (const [, connection] of this.sessions) {
      sessions.push(connection.getInfo());
    }
    return sessions;
  }

  /**
   * Send a message through a specific session.
   */
  async sendMessage(sessionId, to, text) {
    const connection = this.sessions.get(sessionId);
    if (!connection) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return connection.sendMessage(to, text);
  }

  /**
   * Get aggregated stats.
   */
  getStats() {
    let totalSent = 0;
    let totalReceived = 0;
    let connectedCount = 0;

    for (const [, conn] of this.sessions) {
      const info = conn.getInfo();
      totalSent += info.messageCount.sent;
      totalReceived += info.messageCount.received;
      if (info.status === 'connected') connectedCount++;
    }

    return {
      totalSessions: this.sessions.size,
      connectedSessions: connectedCount,
      totalSent,
      totalReceived
    };
  }
}
