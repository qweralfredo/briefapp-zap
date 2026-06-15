import { Router } from 'express';

const router = Router();

// All WhatsApp session management goes through the SessionManager
// which is set on app via app.set('sessionManager', manager)

router.get('/sessions', (req, res) => {
  const manager = req.app.get('sessionManager');
  res.json(manager.getAllSessions());
});

router.post('/sessions', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const manager = req.app.get('sessionManager');
    const info = await manager.createSession(sessionId);
    res.status(201).json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sessions/:id', (req, res) => {
  const manager = req.app.get('sessionManager');
  const info = manager.getSession(req.params.id);
  if (!info) return res.status(404).json({ error: 'Session not found' });
  res.json(info);
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const manager = req.app.get('sessionManager');
    await manager.removeSession(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sessions/:id/send', async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: 'to and text are required' });
    }
    const manager = req.app.get('sessionManager');
    await manager.sendMessage(req.params.id, to, text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
