import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', '..', '..', 'data');
const CONFIG_PATH = join(DATA_DIR, 'config.json');
const CONTACTS_PATH = join(DATA_DIR, 'contacts.json');
const LID_MAP_PATH = join(DATA_DIR, 'lid_map.json');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// ── Default config schema ──
const DEFAULT_CONFIG = {
  geminiApiKey: '',
  geminiModel: 'gemini-3.5-flash',
  agentGoals: '',
  agentPersonality: 'Você é um assistente prestativo e amigável do Briefapp.Zap. Responda de forma clara e concisa.',
  keywords: [
    { id: '1', keyword: 'oi', response: 'Olá! 👋 Bem-vindo ao Briefapp.Zap! Como posso ajudar?', active: true, startsDialog: true },
    { id: '2', keyword: 'menu', response: 'Aqui estão as opções:\n1️⃣ Informações\n2️⃣ Cadastro\n3️⃣ Falar com atendente', active: true, startsDialog: false }
  ],
  registrationFields: [
    { id: '1', name: 'nome', label: 'Nome Completo', type: 'text', required: true, order: 0 },
    { id: '2', name: 'email', label: 'E-mail', type: 'email', required: true, order: 1 },
    { id: '3', name: 'telefone', label: 'Telefone', type: 'phone', required: false, order: 2 }
  ],
  whitelist: [],
  sessions: []
};

// ── Encryption helpers ──
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), 'utf-8');
  }
  // Generate a deterministic key from machine-specific data
  const keyPath = join(DATA_DIR, '.encryption_key');
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, 'utf-8'), 'hex');
  }
  const key = randomBytes(32);
  ensureDir(DATA_DIR);
  writeFileSync(keyPath, key.toString('hex'), 'utf-8');
  return key;
}

function encrypt(text) {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const key = getEncryptionKey();
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch {
    return '';
  }
}

// ── File helpers ──
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readJSON(filePath, defaultValue) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Corrupted file, return default
  }
  return defaultValue;
}

function writeJSON(filePath, data) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Config Store ──
class ConfigStore {
  constructor() {
    ensureDir(DATA_DIR);
    this._config = null;
    this._contacts = null;
  }

  // ── Config ──
  getConfig() {
    if (!this._config) {
      this._config = { ...DEFAULT_CONFIG, ...readJSON(CONFIG_PATH, {}) };
    }
    return { ...this._config, geminiApiKey: this._config.geminiApiKey ? '••••••••' : '' };
  }

  getRawConfig() {
    if (!this._config) {
      this._config = { ...DEFAULT_CONFIG, ...readJSON(CONFIG_PATH, {}) };
    }
    return this._config;
  }

  getDecryptedApiKey() {
    const raw = this.getRawConfig();
    return decrypt(raw.geminiApiKey);
  }

  updateConfig(updates) {
    const current = this.getRawConfig();

    // Encrypt API key if being updated
    if (updates.geminiApiKey && updates.geminiApiKey !== '••••••••') {
      updates.geminiApiKey = encrypt(updates.geminiApiKey);
    } else {
      delete updates.geminiApiKey; // Don't overwrite with masked value
    }

    this._config = { ...current, ...updates };
    writeJSON(CONFIG_PATH, this._config);
    return this.getConfig();
  }

  // ── Keywords ──
  getKeywords() {
    return this.getRawConfig().keywords || [];
  }

  addKeyword(keyword, response, startsDialog = false) {
    const config = this.getRawConfig();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const newKeyword = { id, keyword: keyword.toLowerCase().trim(), response, active: true, startsDialog };
    config.keywords = [...(config.keywords || []), newKeyword];
    this._config = config;
    writeJSON(CONFIG_PATH, config);
    return newKeyword;
  }

  updateKeyword(id, updates) {
    const config = this.getRawConfig();
    config.keywords = (config.keywords || []).map(k =>
      k.id === id ? { ...k, ...updates } : k
    );
    this._config = config;
    writeJSON(CONFIG_PATH, config);
    return config.keywords.find(k => k.id === id);
  }

  deleteKeyword(id) {
    const config = this.getRawConfig();
    config.keywords = (config.keywords || []).filter(k => k.id !== id);
    this._config = config;
    writeJSON(CONFIG_PATH, config);
  }

  findKeywordMatch(text) {
    const keywords = this.getKeywords().filter(k => k.active);
    const normalizedText = text.toLowerCase().trim();
    return keywords.find(k => normalizedText.includes(k.keyword.toLowerCase()));
  }

  // ── Registration Fields ──
  getFields() {
    return this.getRawConfig().registrationFields || [];
  }

  addField(field) {
    const config = this.getRawConfig();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const fields = config.registrationFields || [];
    const newField = {
      id,
      name: field.name,
      label: field.label,
      type: field.type || 'text',
      required: field.required || false,
      order: fields.length
    };
    config.registrationFields = [...fields, newField];
    this._config = config;
    writeJSON(CONFIG_PATH, config);
    return newField;
  }

  updateField(id, updates) {
    const config = this.getRawConfig();
    config.registrationFields = (config.registrationFields || []).map(f =>
      f.id === id ? { ...f, ...updates } : f
    );
    this._config = config;
    writeJSON(CONFIG_PATH, config);
    return config.registrationFields.find(f => f.id === id);
  }

  deleteField(id) {
    const config = this.getRawConfig();
    config.registrationFields = (config.registrationFields || []).filter(f => f.id !== id);
    this._config = config;
    writeJSON(CONFIG_PATH, config);
  }

  // ── Contacts ──
  getContacts() {
    if (!this._contacts) {
      const raw = readJSON(CONTACTS_PATH, []);
      const uniqueContacts = new Map();
      let hasChanges = false;

      for (const c of raw) {
        const normalizedPhone = c.phone.replace(/@.+$/, '').replace(/\D/g, '');
        if (c.phone !== normalizedPhone) {
          hasChanges = true;
        }
        
        const contactId = c.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (!c.id) {
          hasChanges = true;
        }

        const normalizedContact = {
          ...c,
          id: contactId,
          phone: normalizedPhone
        };

        // If duplicate phone, merge them
        if (uniqueContacts.has(normalizedPhone)) {
          hasChanges = true;
          const existing = uniqueContacts.get(normalizedPhone);
          uniqueContacts.set(normalizedPhone, { ...existing, ...normalizedContact });
        } else {
          uniqueContacts.set(normalizedPhone, normalizedContact);
        }
      }

      this._contacts = Array.from(uniqueContacts.values());
      if (hasChanges) {
        writeJSON(CONTACTS_PATH, this._contacts);
      }
    }
    return this._contacts;
  }

  getContact(phone) {
    let normalized = phone.replace(/@.+$/, '').replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    return this.getContacts().find(c => c.phone === normalized);
  }

  saveContact(phone, data) {
    const contacts = this.getContacts();
    let normalized = phone.replace(/@.+$/, '').replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    const idx = contacts.findIndex(c => c.phone === normalized);
    
    let contact;
    if (idx >= 0) {
      contact = {
        ...contacts[idx],
        ...data,
        phone: normalized,
        updatedAt: new Date().toISOString()
      };
      if (!contact.id) {
        contact.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      }
      contacts[idx] = contact;
    } else {
      contact = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        phone: normalized,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      contacts.push(contact);
    }

    this._contacts = contacts;
    writeJSON(CONTACTS_PATH, contacts);
    return contact;
  }

  deleteContact(phone) {
    let normalized = phone.replace(/@.+$/, '').replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    this._contacts = this.getContacts().filter(c => c.phone !== normalized);
    writeJSON(CONTACTS_PATH, this._contacts);
  }

  updateContactNameEverywhere(phone, name) {
    let normalized = phone.replace(/@.+$/, '').replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    
    // 1. Update Whitelist
    const config = this.getRawConfig();
    let whitelistChanged = false;
    config.whitelist = (config.whitelist || []).map(w => {
      const entryPhone = w.phone.replace(/\D/g, '');
      if (entryPhone === normalized) {
        whitelistChanged = true;
        return { ...w, name };
      }
      return w;
    });
    if (whitelistChanged) {
      this._config = config;
      writeJSON(CONFIG_PATH, config);
    }

    // 2. Update Contacts
    const contacts = this.getContacts();
    const idx = contacts.findIndex(c => c.phone === normalized);
    if (idx >= 0) {
      contacts[idx].pushName = name;
      contacts[idx].nome = name;
      contacts[idx].updatedAt = new Date().toISOString();
      this._contacts = contacts;
      writeJSON(CONTACTS_PATH, contacts);
    }
  }

  // ── Whitelist ──
  getWhitelist() {
    return this.getRawConfig().whitelist || [];
  }

  addToWhitelist(phone, name = '') {
    const config = this.getRawConfig();
    const whitelist = config.whitelist || [];
    let normalized = phone.replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    if (whitelist.find(w => w.phone === normalized)) {
      return null; // already exists
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = { id, phone: normalized, name, addedAt: new Date().toISOString() };
    whitelist.push(entry);
    config.whitelist = whitelist;
    this._config = config;
    writeJSON(CONFIG_PATH, config);
    return entry;
  }

  removeFromWhitelist(id) {
    const config = this.getRawConfig();
    config.whitelist = (config.whitelist || []).filter(w => w.id !== id);
    this._config = config;
    writeJSON(CONFIG_PATH, config);
  }

  removeFromWhitelistByPhone(phone) {
    const config = this.getRawConfig();
    let normalized = phone.replace(/@.+$/, '').replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    config.whitelist = (config.whitelist || []).filter(w => {
      const entryPhone = w.phone.replace(/\D/g, '');
      return !normalized.includes(entryPhone) && !entryPhone.includes(normalized);
    });
    this._config = config;
    writeJSON(CONFIG_PATH, config);
  }

  isWhitelisted(phone) {
    const whitelist = this.getWhitelist();
    let normalized = phone.replace(/@.+$/, '').replace(/\D/g, '');
    const mapped = this.resolveLidToPhone(phone);
    if (mapped) {
      normalized = mapped;
    }
    return whitelist.some(w => normalized.includes(w.phone) || w.phone.includes(normalized));
  }

  // ── Sessions (persistence) ──
  getSessions() {
    return this.getRawConfig().sessions || [];
  }

  addSession(sessionId) {
    const config = this.getRawConfig();
    const sessions = config.sessions || [];
    if (!sessions.find(s => s.id === sessionId)) {
      sessions.push({ id: sessionId, createdAt: new Date().toISOString() });
      config.sessions = sessions;
      this._config = config;
      writeJSON(CONFIG_PATH, config);
    }
  }

  removeSession(sessionId) {
    const config = this.getRawConfig();
    config.sessions = (config.sessions || []).filter(s => s.id !== sessionId);
    this._config = config;
    writeJSON(CONFIG_PATH, config);
  }

  // ── Stats ──
  getStats() {
    return {
      totalContacts: this.getContacts().length,
      totalKeywords: this.getKeywords().length,
      activeKeywords: this.getKeywords().filter(k => k.active).length,
      totalFields: this.getFields().length,
      whitelistCount: this.getWhitelist().length,
      hasApiKey: !!this.getDecryptedApiKey()
    };
  }

  // ── LID Mapping ──
  getLidMap() {
    return readJSON(LID_MAP_PATH, {});
  }

  saveLidMap(lid, phone) {
    const cleanLid = lid.replace(/@.+$/, '').replace(/\D/g, '');
    const cleanPhone = phone.replace(/@.+$/, '').replace(/\D/g, '');
    if (!cleanLid || !cleanPhone) return;

    const map = this.getLidMap();
    if (map[cleanLid] !== cleanPhone) {
      map[cleanLid] = cleanPhone;
      writeJSON(LID_MAP_PATH, map);
      console.log(`[Store] 🛡️ Gravado mapeamento LID: ${cleanLid} ↔ Telefone: ${cleanPhone}`);
    }
  }

  resolveLidToPhone(phoneOrLid) {
    const clean = phoneOrLid.replace(/@.+$/, '').replace(/\D/g, '');
    const map = this.getLidMap();
    return map[clean] || null;
  }
}

// Singleton export
const store = new ConfigStore();
export default store;
