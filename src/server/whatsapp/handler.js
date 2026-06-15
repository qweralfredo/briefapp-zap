import store from '../config/store.js';
import { GeminiAgent } from '../ai/gemini.js';

/**
 * Message handler pipeline:
 * 1. Check keywords → send greeting response
 * 2. If no keyword match → send to Gemini Agent
 * 3. If agent requests registration data → collect fields
 */
export class MessageHandler {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.geminiAgent = new GeminiAgent();
    this._registrationState = new Map(); // phone → { currentFieldIdx, data }
    this._activeDialogs = new Set(); // phones currently in AI dialog mode

    // Wire up message events
    this.sessionManager.on('message', (msg) => this.handle(msg));
  }

  async handle(msg) {
    const { sessionId, from, pushName, text } = msg;

    console.log(`[Handler] 📩 Mensagem recebida de ${from} (${pushName || 'sem nome'}): "${text}"`);

    try {
      // Check if contact is whitelisted
      const isWhitelisted = store.isWhitelisted(from);

      // Check keyword match
      const keywordMatch = store.findKeywordMatch(text);

      // Strict enforcement: if NOT whitelisted and there is NO keyword match, ignore the contact completely
      if (!isWhitelisted && !keywordMatch) {
        console.log(`[Handler] ⏸️ Contato fora da Whitelist e sem keyword match → mensagem ignorada de ${from}`);
        return;
      }

      // 1. Check if in registration flow (highest priority)
      const regState = this._registrationState.get(from);
      if (regState) {
        await this._handleRegistration(sessionId, from, text, regState);
        return;
      }

      // 2. Process keyword match
      if (keywordMatch) {
        // Always send the keyword response
        console.log(`[Handler] ✅ Keyword "${keywordMatch.keyword}" → enviando resposta (${keywordMatch.response.length} chars)`);
        await this.sessionManager.sendMessage(sessionId, from, keywordMatch.response);

        // Save contact if new
        if (!store.getContact(from)) {
          store.saveContact(from, { pushName, source: 'keyword' });
        }

        // Automatically add to whitelist if not already there
        if (!store.isWhitelisted(from)) {
          store.addToWhitelist(from, pushName || 'Auto-adicionado');
          console.log(`[Handler] 🛡️ Contato ${from} adicionado automaticamente à Whitelist via keyword "${keywordMatch.keyword}"`);
        }

        // If this keyword starts dialog → activate AI mode
        if (keywordMatch.startsDialog) {
          this._activeDialogs.add(from);
          console.log(`[Handler] 🧠 Keyword "${keywordMatch.keyword}" inicia diálogo → AI ativada para ${from}`);
        }
        return;
      }

      // 3. If contact is whitelisted → send to Gemini
      if (isWhitelisted) {
        const config = store.getRawConfig();
        if (store.getDecryptedApiKey()) {
          console.log(`[Handler] 🤖 Contato na Whitelist → delegando para Gemini AI...`);
          const response = await this.geminiAgent.chat(from, text, {
            pushName,
            agentGoals: config.agentGoals,
            agentPersonality: config.agentPersonality,
            registrationFields: config.registrationFields
          });

          if (response.action === 'start_registration') {
            await this._startRegistration(sessionId, from);
          } else if (response.text) {
            await this.sessionManager.sendMessage(sessionId, from, response.text);
          }
        } else {
          console.log(`[Handler] ⚠️ Sem API key configurada → enviando fallback`);
          await this.sessionManager.sendMessage(
            sessionId,
            from,
            '🤖 Olá! No momento nosso atendimento automático está sendo configurado. Em breve estaremos disponíveis!'
          );
        }

        // Save/update contact
        store.saveContact(from, { pushName, lastMessage: text, lastSeen: new Date().toISOString() });
        return;
      }

      // 4. No keyword match and not whitelisted → ignore
      console.log(`[Handler] ⏸️ Sem keyword match e não está na Whitelist → mensagem ignorada de ${from}`);

    } catch (err) {
      console.error(`[Handler] Error processing message from ${from}:`, err.message);
    }
  }

  async _startRegistration(sessionId, from) {
    const fields = store.getFields();
    if (fields.length === 0) return;

    this._registrationState.set(from, { currentFieldIdx: 0, data: {} });

    const firstField = fields[0];
    await this.sessionManager.sendMessage(
      sessionId,
      from,
      `📝 Vamos iniciar seu cadastro!\n\nPor favor, informe: *${firstField.label}*${firstField.required ? ' (obrigatório)' : ''}`
    );
  }

  async _handleRegistration(sessionId, from, text, state) {
    const fields = store.getFields();
    const currentField = fields[state.currentFieldIdx];

    if (!currentField) {
      this._registrationState.delete(from);
      return;
    }

    // Validate required fields
    if (currentField.required && !text.trim()) {
      await this.sessionManager.sendMessage(
        sessionId,
        from,
        `⚠️ O campo *${currentField.label}* é obrigatório. Por favor, informe:`
      );
      return;
    }

    // Save field value
    state.data[currentField.name] = text.trim();
    state.currentFieldIdx++;

    // Check if more fields
    if (state.currentFieldIdx < fields.length) {
      const nextField = fields[state.currentFieldIdx];
      await this.sessionManager.sendMessage(
        sessionId,
        from,
        `✅ *${currentField.label}* salvo!\n\nAgora informe: *${nextField.label}*${nextField.required ? ' (obrigatório)' : ''}`
      );
    } else {
      // Registration complete
      store.saveContact(from, { ...state.data, registeredAt: new Date().toISOString() });
      this._registrationState.delete(from);

      // Extract registered name
      const registeredName = state.data.nome || state.data.name || state.data.pushName || '';

      // Auto-whitelist upon registration completion
      if (!store.isWhitelisted(from)) {
        store.addToWhitelist(from, registeredName || 'Cadastro Concluído');
        console.log(`[Handler] 🛡️ Contato ${from} adicionado à Whitelist após cadastro finalizado.`);
      }

      // Sync name everywhere (both contacts and whitelist)
      if (registeredName) {
        store.updateContactNameEverywhere(from, registeredName);
      }

      await this.sessionManager.sendMessage(
        sessionId,
        from,
        '✅ Cadastro concluído com sucesso! Obrigado! 🎉'
      );
    }
  }
}
