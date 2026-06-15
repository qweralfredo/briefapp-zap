import { Router } from 'express';
import store from '../config/store.js';
import { GeminiAgent } from '../ai/gemini.js';

const router = Router();

// ══════════════════════════════════════
// CONFIG
// ══════════════════════════════════════

router.get('/config', (req, res) => {
  try {
    const config = store.getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', (req, res) => {
  try {
    const updated = store.updateConfig(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════
// KEYWORDS
// ══════════════════════════════════════

router.get('/keywords', (req, res) => {
  res.json(store.getKeywords());
});

router.post('/keywords', (req, res) => {
  const { keyword, response, startsDialog } = req.body;
  if (!keyword || !response) {
    return res.status(400).json({ error: 'keyword and response are required' });
  }
  const created = store.addKeyword(keyword, response, !!startsDialog);
  res.status(201).json(created);
});

router.put('/keywords/:id', (req, res) => {
  const updated = store.updateKeyword(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Keyword not found' });
  res.json(updated);
});

router.delete('/keywords/:id', (req, res) => {
  store.deleteKeyword(req.params.id);
  res.status(204).end();
});

// ══════════════════════════════════════
// REGISTRATION FIELDS
// ══════════════════════════════════════

router.get('/fields', (req, res) => {
  res.json(store.getFields());
});

router.post('/fields', (req, res) => {
  const { name, label, type, required } = req.body;
  if (!name || !label) {
    return res.status(400).json({ error: 'name and label are required' });
  }
  const created = store.addField({ name, label, type, required });
  res.status(201).json(created);
});

router.put('/fields/:id', (req, res) => {
  const updated = store.updateField(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Field not found' });
  res.json(updated);
});

router.delete('/fields/:id', (req, res) => {
  store.deleteField(req.params.id);
  res.status(204).end();
});

// ══════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════

router.get('/contacts', (req, res) => {
  res.json(store.getContacts());
});

router.delete('/contacts/:phone', (req, res) => {
  store.deleteContact(decodeURIComponent(req.params.phone));
  res.status(204).end();
});

// ══════════════════════════════════════
// WHITELIST
// ══════════════════════════════════════

router.get('/whitelist', (req, res) => {
  res.json(store.getWhitelist());
});

router.post('/whitelist', (req, res) => {
  const { phone, name } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }
  const created = store.addToWhitelist(phone, name || '');
  if (!created) {
    return res.status(400).json({ error: 'Contact already in whitelist' });
  }
  res.status(201).json(created);
});

router.delete('/whitelist/:id', (req, res) => {
  store.removeFromWhitelist(req.params.id);
  res.status(204).end();
});

// ══════════════════════════════════════
// STATS
// ══════════════════════════════════════

router.get('/stats', (req, res) => {
  const configStats = store.getStats();
  const sessionManager = req.app.get('sessionManager');
  const whatsappStats = sessionManager ? sessionManager.getStats() : {};
  res.json({ ...configStats, ...whatsappStats });
});

// ══════════════════════════════════════
// GEMINI TEST
// ══════════════════════════════════════

router.post('/gemini/test', async (req, res) => {
  const agent = new GeminiAgent();
  const result = await agent.testConnection();
  res.json(result);
});

export default router;
