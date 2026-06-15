/**
 * Briefapp.Zap — SPA Controller
 * Manages views, Socket.IO events, API calls, and UI state.
 */
class BriefappZap {
  constructor() {
    this.socket = io();
    this.currentView = 'dashboard';
    this.config = {};
    this.recentMessages = [];
    this.contacts = [];
    this.sessionId = 'default';

    this._initNavigation();
    this._initSocket();
    this._initMobileMenu();
    this._loadInitialData();
  }

  // ══════════════════════════════════════
  // NAVIGATION
  // ══════════════════════════════════════

  _initNavigation() {
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.view));
    });

    // Handle hash routing
    window.addEventListener('hashchange', () => {
      const view = location.hash.slice(1) || 'dashboard';
      this.navigateTo(view, false);
    });

    const initialView = location.hash.slice(1) || 'dashboard';
    this.navigateTo(initialView, false);
  }

  navigateTo(view, pushHash = true) {
    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const viewEl = document.getElementById(`view-${view}`);
    if (viewEl) viewEl.classList.add('active');

    // Update nav
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Update title
    const titles = {
      dashboard: 'Dashboard',
      keywords: 'Palavras-Chave',
      registration: 'Campos de Cadastro',
      contacts: 'Contatos',
      whitelist: 'Whitelist',
      settings: 'Configurações'
    };
    document.getElementById('page-title').textContent = titles[view] || 'Dashboard';

    this.currentView = view;
    if (pushHash) location.hash = view;

    // Load view-specific data
    this._loadViewData(view);

    // Close mobile menu
    document.getElementById('sidebar').classList.remove('open');
  }

  _initMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    btn.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  // ══════════════════════════════════════
  // SOCKET.IO
  // ══════════════════════════════════════

  _initSocket() {
    this.socket.on('connect', () => {
      console.log('[Socket.IO] Connected');
    });

    this.socket.on('whatsapp:qr', (data) => {
      this._showQR(data.qr);
      this._updateConnectionStatus('connecting');
    });

    this.socket.on('whatsapp:status', (data) => {
      this._updateConnectionStatus(data.status, data.user);
    });

    this.socket.on('whatsapp:ready', (data) => {
      this._updateConnectionStatus('connected', data.user);
      this._hideQR();
      this.toast('WhatsApp conectado com sucesso!', 'success');
    });

    this.socket.on('whatsapp:message', (data) => {
      this._addRecentMessage(data);
      this._refreshStats();
    });

    this.socket.on('whatsapp:close', () => {
      this._updateConnectionStatus('disconnected');
    });

    this.socket.on('whatsapp:sessions', (sessions) => {
      if (sessions.length > 0) {
        const s = sessions[0];
        this._updateConnectionStatus(s.status, s.user);
        if (s.qrCode) this._showQR(s.qrCode);
      }
    });
  }

  // ══════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════

  async _loadInitialData() {
    try {
      const [config, stats] = await Promise.all([
        this._api('/api/config'),
        this._api('/api/stats')
      ]);
      this.config = config;
      this._updateStats(stats);
      this._populateSettings();
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  }

  async _loadViewData(view) {
    switch (view) {
      case 'keywords':
        await this._loadKeywords();
        break;
      case 'registration':
        await this._loadFields();
        break;
      case 'contacts':
        await this._loadContacts();
        break;
      case 'whitelist':
        await this._loadWhitelist();
        break;
      case 'settings':
        this._populateSettings();
        break;
      case 'dashboard':
        await this._refreshStats();
        break;
    }
  }

  // ══════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════

  async _refreshStats() {
    try {
      const stats = await this._api('/api/stats');
      this._updateStats(stats);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  _updateStats(stats) {
    document.getElementById('stat-sessions').textContent = stats.connectedSessions || 0;
    document.getElementById('stat-received').textContent = stats.totalReceived || 0;
    document.getElementById('stat-sent').textContent = stats.totalSent || 0;
    document.getElementById('stat-contacts').textContent = stats.totalContacts || 0;
  }

  _updateConnectionStatus(status, user) {
    const dot = document.getElementById('sidebar-status-dot');
    const text = document.getElementById('sidebar-status-text');
    const banner = document.getElementById('connection-banner');
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');

    dot.className = `status-dot ${status}`;

    const statusMessages = {
      connected: user ? `Conectado: ${user.name || user.id}` : 'Conectado',
      connecting: 'Conectando...',
      reconnecting: 'Reconectando...',
      disconnected: 'Desconectado'
    };

    text.textContent = statusMessages[status] || 'Desconectado';

    // Banner
    banner.className = `connection-banner ${status}`;
    const bannerIcon = status === 'connected' ? '✅' : status === 'disconnected' ? '⚪' : '🔄';
    banner.innerHTML = `<span class="status-dot ${status}"></span><span>${bannerIcon} ${statusMessages[status]}</span>`;

    // Buttons
    if (status === 'connected') {
      btnConnect.style.display = 'none';
      btnDisconnect.style.display = 'inline-flex';
    } else if (status === 'disconnected') {
      btnConnect.style.display = 'inline-flex';
      btnDisconnect.style.display = 'none';
    }
  }

  _showQR(qrDataUrl) {
    const container = document.getElementById('qr-container');
    const box = document.getElementById('qr-box');
    container.style.display = 'flex';
    box.className = 'qr-code scanning';
    box.innerHTML = `<img src="${qrDataUrl}" alt="QR Code WhatsApp">`;
  }

  _hideQR() {
    const container = document.getElementById('qr-container');
    container.style.display = 'none';
  }

  _addRecentMessage(msg) {
    this.recentMessages.unshift(msg);
    if (this.recentMessages.length > 50) this.recentMessages = this.recentMessages.slice(0, 50);

    const container = document.getElementById('recent-messages');
    const count = document.getElementById('msg-count');
    count.textContent = `${this.recentMessages.length} mensagens`;

    // Build message list
    container.innerHTML = this.recentMessages.slice(0, 10).map(m => `
      <div class="flex items-center gap-3" style="padding: var(--sp-3) 0; border-bottom: 1px solid var(--ink-100);">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--rose-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;">
          ${m.pushName ? m.pushName[0].toUpperCase() : '👤'}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="flex justify-between items-center">
            <strong style="font-size:13px;color:var(--ink-900)">${m.pushName || m.from}</strong>
            <span class="text-xs text-muted">${new Date(m.timestamp * 1000).toLocaleTimeString('pt-BR')}</span>
          </div>
          <p class="text-sm text-muted truncate">${this._escapeHtml(m.text)}</p>
        </div>
      </div>
    `).join('');
  }

  // ══════════════════════════════════════
  // WHATSAPP SESSION
  // ══════════════════════════════════════

  async connectSession() {
    try {
      await this._api('/api/whatsapp/sessions', 'POST', { sessionId: this.sessionId });
      this.toast('Iniciando conexão...', 'success');
    } catch (err) {
      this.toast('Erro ao conectar: ' + err.message, 'error');
    }
  }

  async disconnectSession() {
    try {
      await this._api(`/api/whatsapp/sessions/${this.sessionId}`, 'DELETE');
      this._updateConnectionStatus('disconnected');
      this._hideQR();
      this.toast('Sessão desconectada', 'success');
    } catch (err) {
      this.toast('Erro ao desconectar: ' + err.message, 'error');
    }
  }

  // ══════════════════════════════════════
  // KEYWORDS
  // ══════════════════════════════════════

  async _loadKeywords() {
    try {
      const keywords = await this._api('/api/keywords');
      this._renderKeywordsTable(keywords);
    } catch (err) {
      console.error('Error loading keywords:', err);
    }
  }

  _renderKeywordsTable(keywords) {
    const tbody = document.getElementById('keywords-table-body');
    if (!keywords.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--sp-10)">Nenhuma palavra-chave cadastrada</td></tr>`;
      return;
    }
    tbody.innerHTML = keywords.map(k => `
      <tr>
        <td><strong>${this._escapeHtml(k.keyword)}</strong></td>
        <td class="text-sm" style="max-width:250px">${this._escapeHtml(k.response).substring(0, 80)}${k.response.length > 80 ? '...' : ''}</td>
        <td>${k.startsDialog ? '<span class="badge badge-brand badge-dot">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
        <td>
          <label class="toggle">
            <input type="checkbox" ${k.active ? 'checked' : ''} onchange="app.toggleKeyword('${k.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" onclick="app.editKeyword('${k.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="app.deleteKeyword('${k.id}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  showKeywordModal(keyword = null) {
    const isEdit = !!keyword;
    document.getElementById('modal-title').textContent = isEdit ? 'Editar Palavra-Chave' : 'Nova Palavra-Chave';
    document.getElementById('modal-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">Palavra-Chave</label>
        <input class="input" id="modal-keyword" placeholder="Ex: oi, menu, ajuda" value="${keyword?.keyword || ''}">
        <p class="form-hint">O bot responderá quando a mensagem contiver esta palavra.</p>
      </div>
      <div class="form-group">
        <label class="form-label">Resposta Automática</label>
        <textarea class="input" id="modal-response" rows="4" placeholder="Ex: Olá! Bem-vindo ao Briefapp.Zap!">${keyword?.response || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label flex items-center gap-2">
          <label class="toggle">
            <input type="checkbox" id="modal-starts-dialog" ${keyword?.startsDialog ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          Inicia Diálogo com IA
        </label>
        <p class="form-hint">Quando ativado, esta palavra-chave envia a saudação e ativa o chatbot Gemini para continuar a conversa. Apenas <strong>uma</strong> keyword deve ter essa opção ativa.</p>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="app.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="app.saveKeyword(${isEdit ? `'${keyword.id}'` : 'null'})">${isEdit ? 'Salvar' : 'Criar'}</button>
    `;
    this._openModal();
  }

  async saveKeyword(id) {
    const keyword = document.getElementById('modal-keyword').value;
    const response = document.getElementById('modal-response').value;
    const startsDialog = document.getElementById('modal-starts-dialog').checked;

    if (!keyword || !response) {
      this.toast('Preencha todos os campos', 'error');
      return;
    }

    try {
      if (id) {
        await this._api(`/api/keywords/${id}`, 'PUT', { keyword, response, startsDialog });
      } else {
        await this._api('/api/keywords', 'POST', { keyword, response, startsDialog });
      }
      this.closeModal();
      await this._loadKeywords();
      this.toast('Palavra-chave salva!', 'success');
    } catch (err) {
      this.toast('Erro ao salvar: ' + err.message, 'error');
    }
  }

  async editKeyword(id) {
    const keywords = await this._api('/api/keywords');
    const kw = keywords.find(k => k.id === id);
    if (kw) this.showKeywordModal(kw);
  }

  async toggleKeyword(id, active) {
    await this._api(`/api/keywords/${id}`, 'PUT', { active });
  }

  async deleteKeyword(id) {
    if (!confirm('Tem certeza que deseja excluir esta palavra-chave?')) return;
    await this._api(`/api/keywords/${id}`, 'DELETE');
    await this._loadKeywords();
    this.toast('Palavra-chave excluída', 'success');
  }

  // ══════════════════════════════════════
  // REGISTRATION FIELDS
  // ══════════════════════════════════════

  async _loadFields() {
    try {
      const fields = await this._api('/api/fields');
      this._renderFieldsTable(fields);
    } catch (err) {
      console.error('Error loading fields:', err);
    }
  }

  _renderFieldsTable(fields) {
    const tbody = document.getElementById('fields-table-body');
    if (!fields.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:var(--sp-10)">Nenhum campo cadastrado</td></tr>`;
      return;
    }

    const typeLabels = { text: 'Texto', email: 'E-mail', phone: 'Telefone', cpf: 'CPF', date: 'Data', select: 'Seleção' };
    tbody.innerHTML = fields.map(f => `
      <tr>
        <td><code style="background:var(--ink-100);padding:2px 8px;border-radius:4px;font-size:12px">${this._escapeHtml(f.name)}</code></td>
        <td><strong>${this._escapeHtml(f.label)}</strong></td>
        <td><span class="badge badge-info">${typeLabels[f.type] || f.type}</span></td>
        <td>${f.required ? '<span class="badge badge-brand badge-dot">Sim</span>' : '<span class="badge badge-neutral">Não</span>'}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" onclick="app.editField('${f.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="app.deleteField('${f.id}')">🗑</button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  showFieldModal(field = null) {
    const isEdit = !!field;
    document.getElementById('modal-title').textContent = isEdit ? 'Editar Campo' : 'Novo Campo';
    document.getElementById('modal-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">Nome do Campo (interno)</label>
        <input class="input" id="modal-field-name" placeholder="Ex: nome, email, cpf" value="${field?.name || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Label (exibido ao usuário)</label>
        <input class="input" id="modal-field-label" placeholder="Ex: Nome Completo" value="${field?.label || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <select class="input" id="modal-field-type">
          <option value="text" ${field?.type === 'text' ? 'selected' : ''}>Texto</option>
          <option value="email" ${field?.type === 'email' ? 'selected' : ''}>E-mail</option>
          <option value="phone" ${field?.type === 'phone' ? 'selected' : ''}>Telefone</option>
          <option value="cpf" ${field?.type === 'cpf' ? 'selected' : ''}>CPF</option>
          <option value="date" ${field?.type === 'date' ? 'selected' : ''}>Data</option>
          <option value="select" ${field?.type === 'select' ? 'selected' : ''}>Seleção</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label flex items-center gap-2">
          <label class="toggle">
            <input type="checkbox" id="modal-field-required" ${field?.required ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
          Campo obrigatório
        </label>
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="app.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="app.saveField(${isEdit ? `'${field.id}'` : 'null'})">${isEdit ? 'Salvar' : 'Criar'}</button>
    `;
    this._openModal();
  }

  async saveField(id) {
    const name = document.getElementById('modal-field-name').value;
    const label = document.getElementById('modal-field-label').value;
    const type = document.getElementById('modal-field-type').value;
    const required = document.getElementById('modal-field-required').checked;

    if (!name || !label) {
      this.toast('Preencha nome e label', 'error');
      return;
    }

    try {
      if (id) {
        await this._api(`/api/fields/${id}`, 'PUT', { name, label, type, required });
      } else {
        await this._api('/api/fields', 'POST', { name, label, type, required });
      }
      this.closeModal();
      await this._loadFields();
      this.toast('Campo salvo!', 'success');
    } catch (err) {
      this.toast('Erro ao salvar: ' + err.message, 'error');
    }
  }

  async editField(id) {
    const fields = await this._api('/api/fields');
    const field = fields.find(f => f.id === id);
    if (field) this.showFieldModal(field);
  }

  async deleteField(id) {
    if (!confirm('Tem certeza que deseja excluir este campo?')) return;
    await this._api(`/api/fields/${id}`, 'DELETE');
    await this._loadFields();
    this.toast('Campo excluído', 'success');
  }

  // ══════════════════════════════════════
  // CONTACTS
  // ══════════════════════════════════════

  async _loadContacts() {
    try {
      this.contacts = await this._api('/api/contacts');
      this._renderContactsTable(this.contacts);
    } catch (err) {
      console.error('Error loading contacts:', err);
    }
  }

  _renderContactsTable(contacts) {
    const tbody = document.getElementById('contacts-table-body');
    if (!contacts.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:var(--sp-10)">Nenhum contato cadastrado</td></tr>`;
      return;
    }

    tbody.innerHTML = contacts.map(c => `
      <tr>
        <td><code style="font-size:11px;color:var(--rose-600)">${this._escapeHtml(c.id || '-')}</code></td>
        <td><code style="font-size:12px">${this._escapeHtml(c.phone)}</code></td>
        <td>${this._escapeHtml(c.pushName || c.nome || '-')}</td>
        <td class="text-sm truncate" style="max-width:200px">${this._escapeHtml(c.lastMessage || '-')}</td>
        <td class="text-sm text-muted">${c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '-'}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="app.deleteContact('${encodeURIComponent(c.phone)}')">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  filterContacts(query) {
    const q = query.toLowerCase();
    const filtered = this.contacts.filter(c =>
      (c.phone || '').toLowerCase().includes(q) ||
      (c.pushName || '').toLowerCase().includes(q) ||
      (c.nome || '').toLowerCase().includes(q)
    );
    this._renderContactsTable(filtered);
  }

  async deleteContact(phone) {
    if (!confirm('Excluir contato?')) return;
    await this._api(`/api/contacts/${phone}`, 'DELETE');
    await this._loadContacts();
    this.toast('Contato excluído', 'success');
  }

  exportCSV() {
    if (!this.contacts.length) {
      this.toast('Nenhum contato para exportar', 'warning');
      return;
    }

    const headers = Object.keys(this.contacts[0]);
    const csv = [
      headers.join(','),
      ...this.contacts.map(c => headers.map(h => `"${(c[h] || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `briefapp-zap-contatos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast('CSV exportado!', 'success');
  }

  // ══════════════════════════════════════
  // WHITELIST
  // ══════════════════════════════════════

  async _loadWhitelist() {
    try {
      const whitelist = await this._api('/api/whitelist');
      this._renderWhitelistTable(whitelist);
    } catch (err) {
      console.error('Error loading whitelist:', err);
    }
  }

  _renderWhitelistTable(whitelist) {
    const tbody = document.getElementById('whitelist-table-body');
    if (!whitelist.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:var(--sp-10)">Nenhum número na whitelist</td></tr>`;
      return;
    }
    tbody.innerHTML = whitelist.map(w => `
      <tr>
        <td><code style="font-size:12px">${this._escapeHtml(w.phone)}</code></td>
        <td><strong>${this._escapeHtml(w.name || '-')}</strong></td>
        <td class="text-sm text-muted">${new Date(w.addedAt).toLocaleString('pt-BR')}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="app.deleteWhitelist('${w.id}')">🗑</button>
        </td>
      </tr>
    `).join('');
  }

  showWhitelistModal() {
    document.getElementById('modal-title').textContent = 'Adicionar à Whitelist';
    document.getElementById('modal-body').innerHTML = `
      <div class="form-group">
        <label class="form-label">Número do WhatsApp (com DDD)</label>
        <input class="input" id="modal-whitelist-phone" placeholder="Ex: 5511999999999">
        <p class="form-hint">Digite apenas números, incluindo o código do país (55 para Brasil).</p>
      </div>
      <div class="form-group">
        <label class="form-label">Nome / Descrição (opcional)</label>
        <input class="input" id="modal-whitelist-name" placeholder="Ex: João da Silva - Teste">
      </div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="app.closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="app.saveWhitelist()">Adicionar</button>
    `;
    this._openModal();
  }

  async saveWhitelist() {
    const phoneInput = document.getElementById('modal-whitelist-phone').value;
    const phone = phoneInput.replace(/\D/g, '');
    const name = document.getElementById('modal-whitelist-name').value;

    if (!phone) {
      this.toast('Telefone é obrigatório', 'error');
      return;
    }

    try {
      await this._api('/api/whitelist', 'POST', { phone, name });
      this.closeModal();
      await this._loadWhitelist();
      this.toast('Número adicionado à whitelist!', 'success');
    } catch (err) {
      this.toast('Erro ao adicionar: ' + err.message, 'error');
    }
  }

  async deleteWhitelist(id) {
    if (!confirm('Remover este número da whitelist?')) return;
    try {
      await this._api(`/api/whitelist/${id}`, 'DELETE');
      await this._loadWhitelist();
      this.toast('Número removido da whitelist', 'success');
    } catch (err) {
      this.toast('Erro ao remover: ' + err.message, 'error');
    }
  }

  // ══════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════

  _populateSettings() {
    const c = this.config;
    const apiKeyInput = document.getElementById('input-api-key');
    const goalsInput = document.getElementById('input-agent-goals');
    const personalityInput = document.getElementById('input-agent-personality');
    const modelSelect = document.getElementById('input-gemini-model');

    if (apiKeyInput) apiKeyInput.value = c.geminiApiKey || '';
    if (goalsInput) goalsInput.value = c.agentGoals || '';
    if (personalityInput) personalityInput.value = c.agentPersonality || '';
    if (modelSelect) modelSelect.value = c.geminiModel || 'gemini-2.0-flash-lite';
  }

  toggleApiKeyVisibility() {
    const input = document.getElementById('input-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  async saveApiKey() {
    const key = document.getElementById('input-api-key').value;
    if (!key || key === '••••••••') {
      this.toast('Digite uma chave válida', 'error');
      return;
    }
    try {
      this.config = await this._api('/api/config', 'PUT', { geminiApiKey: key });
      this.toast('Chave salva com sucesso!', 'success');
    } catch (err) {
      this.toast('Erro ao salvar chave', 'error');
    }
  }

  async testGemini() {
    const resultDiv = document.getElementById('gemini-test-result');
    resultDiv.innerHTML = '<div class="flex items-center gap-2"><div class="spinner"></div> Testando conexão...</div>';

    try {
      const result = await this._api('/api/gemini/test', 'POST');
      if (result.success) {
        resultDiv.innerHTML = `<div class="connection-banner connected">✅ Conexão bem-sucedida! Modelo: <strong>${result.model}</strong></div>`;
      } else {
        resultDiv.innerHTML = `<div class="connection-banner disconnected">❌ Falha: ${result.error}</div>`;
      }
    } catch (err) {
      resultDiv.innerHTML = `<div class="connection-banner disconnected">❌ Erro: ${err.message}</div>`;
    }
  }

  async saveAgentConfig() {
    try {
      this.config = await this._api('/api/config', 'PUT', {
        agentGoals: document.getElementById('input-agent-goals').value,
        agentPersonality: document.getElementById('input-agent-personality').value
      });
      this.toast('Configurações do agente salvas!', 'success');
    } catch (err) {
      this.toast('Erro ao salvar', 'error');
    }
  }

  async saveModelConfig() {
    try {
      this.config = await this._api('/api/config', 'PUT', {
        geminiModel: document.getElementById('input-gemini-model').value
      });
      this.toast('Modelo atualizado!', 'success');
    } catch (err) {
      this.toast('Erro ao salvar', 'error');
    }
  }

  // ══════════════════════════════════════
  // MODAL
  // ══════════════════════════════════════

  _openModal() {
    document.getElementById('modal-overlay').classList.add('active');
  }

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
  }

  // ══════════════════════════════════════
  // TOAST
  // ══════════════════════════════════════

  toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ══════════════════════════════════════
  // API HELPER
  // ══════════════════════════════════════

  async _api(url, method = 'GET', body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    if (method === 'DELETE') return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  // ══════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

// Initialize app
const app = new BriefappZap();
