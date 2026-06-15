import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync, rmSync } from 'fs';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';
import store from '../config/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSIONS_DIR = join(__dirname, '..', '..', '..', 'data', 'sessions');

const logger = pino({ level: 'silent' });

/**
 * Single WhatsApp connection wrapper around Baileys.
 * Emits: 'qr', 'status', 'message', 'ready', 'close'
 */
export class WhatsAppConnection extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.sock = null;
    this.status = 'disconnected'; // disconnected | connecting | connected | reconnecting
    this.qrCode = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.user = null;
    this._destroyed = false;
    this._messageCount = { sent: 0, received: 0 };
  }

  get sessionDir() {
    return join(SESSIONS_DIR, this.sessionId);
  }

  async connect() {
    if (this._destroyed) return;

    this._setStatus('connecting');

    // Ensure session directory exists
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        logger,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true
      });

      // ── Credential updates ──
      this.sock.ev.on('creds.update', saveCreds);

      // ── Connection updates ──
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCode = await QRCode.toDataURL(qr, {
              width: 300,
              margin: 2,
              color: { dark: '#111318', light: '#FFFFFF' }
            });
            this.emit('qr', { sessionId: this.sessionId, qr: this.qrCode });
          } catch (err) {
            console.error(`[${this.sessionId}] QR generation error:`, err.message);
          }
        }

        if (connection === 'close') {
          this.qrCode = null;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect && this.retryCount < this.maxRetries && !this._destroyed) {
            this.retryCount++;
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
            this._setStatus('reconnecting');
            console.log(`[${this.sessionId}] Reconnecting in ${delay / 1000}s (attempt ${this.retryCount}/${this.maxRetries})`);
            setTimeout(() => this.connect(), delay);
          } else {
            this._setStatus('disconnected');
            if (statusCode === DisconnectReason.loggedOut) {
              console.log(`[${this.sessionId}] Logged out, clearing session`);
              this.clearSession();
            }
            this.emit('close', { sessionId: this.sessionId, reason: statusCode });
          }
        }

        if (connection === 'open') {
          this.retryCount = 0;
          this.qrCode = null;
          this.user = this.sock.user;
          this._setStatus('connected');
          this.emit('ready', {
            sessionId: this.sessionId,
            user: this.user
          });
          console.log(`[${this.sessionId}] Connected as ${this.user?.id}`);
        }
      });

      // ── Incoming messages ──
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          if (!msg.message) continue;

          // Extract text content
          const text = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || msg.message.imageMessage?.caption
            || msg.message.videoMessage?.caption
            || '';

          if (!text.trim()) continue;

          this._messageCount.received++;

          let sender = msg.key.remoteJid;
          
          // Resolve LID to phone JID if possible
          if (sender && sender.endsWith('@lid')) {
            const altJid = msg.key.remoteJidAlt || msg.key.senderPn || msg.senderPn;
            if (altJid) {
              store.saveLidMap(sender, altJid);
              sender = altJid;
            } else {
              // Fallback to signalRepository.lidMapping
              let resolvedPhone = null;
              if (this.sock?.signalRepository?.lidMapping?.getPNForLID) {
                try {
                  resolvedPhone = await this.sock.signalRepository.lidMapping.getPNForLID(sender);
                } catch (err) {
                  // ignore
                }
              }

              if (resolvedPhone) {
                store.saveLidMap(sender, resolvedPhone);
                sender = resolvedPhone.includes('@') ? resolvedPhone : `${resolvedPhone}@s.whatsapp.net`;
              } else {
                const resolved = store.resolveLidToPhone(sender);
                if (resolved) {
                  sender = `${resolved}@s.whatsapp.net`;
                } else {
                  sender = msg.sender || sender;
                }
              }
            }
          }
          
          const pushName = msg.pushName || '';

          console.log(`[WhatsApp:${this.sessionId}] 📨 Msg de ${sender} (${pushName}): "${text.trim()}"`);

          this.emit('message', {
            sessionId: this.sessionId,
            from: sender,
            pushName,
            text: text.trim(),
            timestamp: msg.messageTimestamp,
            raw: msg
          });
        }
      });

      // ── Sync Contacts & LID mappings ──
      this.sock.ev.on('contacts.upsert', (contacts) => {
        for (const contact of contacts) {
          const lid = contact.lid || (contact.id && contact.id.endsWith('@lid') ? contact.id : null);
          const phone = contact.jid || (contact.id && contact.id.endsWith('@s.whatsapp.net') ? contact.id : null);
          if (lid && phone) {
            store.saveLidMap(lid, phone);
          }
        }
      });

      this.sock.ev.on('contacts.update', (contacts) => {
        for (const contact of contacts) {
          const lid = contact.lid || (contact.id && contact.id.endsWith('@lid') ? contact.id : null);
          const phone = contact.jid || (contact.id && contact.id.endsWith('@s.whatsapp.net') ? contact.id : null);
          if (lid && phone) {
            store.saveLidMap(lid, phone);
          }
        }
      });

    } catch (err) {
      console.error(`[${this.sessionId}] Connection error:`, err.message);
      this._setStatus('disconnected');
    }
  }

  async sendMessage(to, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('Not connected');
    }

    // Ensure JID format
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    await this.sock.sendMessage(jid, { text });
    this._messageCount.sent++;
    return true;
  }

  async disconnect() {
    this._destroyed = true;
    if (this.sock) {
      await this.sock.logout().catch(() => {});
      this.sock = null;
    }
    this._setStatus('disconnected');
  }

  clearSession() {
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
    }
  }

  getInfo() {
    return {
      sessionId: this.sessionId,
      status: this.status,
      qrCode: this.qrCode,
      user: this.user ? {
        id: this.user.id,
        name: this.user.name
      } : null,
      messageCount: { ...this._messageCount },
      retryCount: this.retryCount
    };
  }

  _setStatus(status) {
    this.status = status;
    this.emit('status', {
      sessionId: this.sessionId,
      status,
      user: this.user ? { id: this.user.id, name: this.user.name } : null
    });
  }
}
