import { GoogleGenAI } from '@google/genai';
import store from '../config/store.js';

/**
 * Agentic Gemini client with:
 * - Dynamic system prompt based on user-defined goals
 * - Per-contact conversation history with TTL
 * - Function calling for registration and data collection
 */
export class GeminiAgent {
  constructor() {
    this._client = null;
    this._histories = new Map(); // phone → { messages[], lastActivity }
    this._historyTTL = 30 * 60 * 1000; // 30 minutes

    // Cleanup expired histories every 5 minutes
    setInterval(() => this._cleanupHistories(), 5 * 60 * 1000);
  }

  _getClient() {
    const apiKey = store.getDecryptedApiKey();
    if (!apiKey) return null;

    // Recreate client if key changed
    if (!this._client || this._lastKey !== apiKey) {
      this._client = new GoogleGenAI({ apiKey });
      this._lastKey = apiKey;
    }
    return this._client;
  }

  _buildSystemPrompt(context) {
    const { agentGoals, agentPersonality, registrationFields, pushName } = context;

    const fieldsDescription = (registrationFields || [])
      .map(f => `- ${f.name}: ${f.label} (${f.type}${f.required ? ', obrigatório' : ''})`)
      .join('\n');

    return `${agentPersonality || 'Você é um assistente prestativo.'}

${agentGoals ? `## Seus Objetivos\n${agentGoals}` : ''}

## Contexto
- Você é o assistente virtual do Briefapp.Zap
- O usuário está falando com você via WhatsApp
- O nome do usuário é: ${pushName || 'Não informado'}
- Responda sempre em português brasileiro
- Seja conciso e use emojis moderadamente
- NUNCA invente informações que você não tem

## Ações e Ferramentas Disponíveis
Você tem ferramentas especiais para efetuar ações no chatbot:
1. **iniciar_cadastro**: Use se o usuário explicitamente pedir para se cadastrar, ou se você precisar começar o fluxo guiado pergunta-pergunta para coletar informações dele.
2. **salvar_dados**: Use quando o usuário já informou os dados cadastrais na própria conversa de forma espontânea (ex: 'meu nome é João e meu email é joao@email.com'). Salve os campos fornecidos.
3. **remover_whitelist**: Use se o usuário pedir para cancelar o atendimento automático, falar com um humano, sair da lista ou se a conversa for concluída.

## Campos de Cadastro Disponíveis
${fieldsDescription || 'Nenhum campo configurado.'}

## Regras
1. Nunca compartilhe informações sensíveis
2. Se não souber algo, diga que não sabe
3. Mantenha respostas curtas (máximo 500 caracteres)
4. Ao chamar uma ferramenta/função, sempre explique o que está fazendo em texto (ex: 'Certo, estou salvando seus dados no sistema' ou 'Iniciando seu cadastro...').
5. Use formatação WhatsApp: *negrito*, _itálico_, ~tachado~`;
  }

  _getHistory(phone) {
    const entry = this._histories.get(phone);
    if (entry && Date.now() - entry.lastActivity < this._historyTTL) {
      return entry.messages;
    }
    return [];
  }

  _addToHistory(phone, role, text) {
    if (!this._histories.has(phone)) {
      this._histories.set(phone, { messages: [], lastActivity: Date.now() });
    }
    const entry = this._histories.get(phone);
    entry.messages.push({ role, parts: [{ text }] });
    entry.lastActivity = Date.now();

    // Keep last 20 messages per contact
    if (entry.messages.length > 20) {
      entry.messages = entry.messages.slice(-20);
    }
  }

  _cleanupHistories() {
    const now = Date.now();
    for (const [phone, entry] of this._histories) {
      if (now - entry.lastActivity > this._historyTTL) {
        this._histories.delete(phone);
      }
    }
  }

  /**
   * Chat with the Gemini agent.
   * Returns { text: string, action?: string }
   */
  async chat(phone, userMessage, context) {
    const client = this._getClient();
    if (!client) {
      return { text: '🤖 Configuração de IA pendente. Por favor, configure a chave da API nas configurações.' };
    }

    try {
      const config = store.getRawConfig();
      const systemPrompt = this._buildSystemPrompt(context);
      const history = this._getHistory(phone);

      // Add user message to history
      this._addToHistory(phone, 'user', userMessage);

      // Dynamically build properties schema for registrationFields
      const propertiesSchema = {};
      const requiredFields = [];
      if (context.registrationFields) {
        for (const field of context.registrationFields) {
          propertiesSchema[field.name] = {
            type: 'STRING',
            description: `Valor para o campo de cadastro '${field.label}'`
          };
          if (field.required) {
            requiredFields.push(field.name);
          }
        }
      }

      const tools = [
        {
          functionDeclarations: [
            {
              name: 'iniciar_cadastro',
              description: 'Inicia o fluxo passo-a-passo de cadastro para coletar os dados obrigatórios do usuário.',
              parameters: {
                type: 'OBJECT',
                properties: {}
              }
            },
            {
              name: 'salvar_dados',
              description: 'Salva os dados cadastrais informados pelo usuário de uma só vez na conversa espontânea.',
              parameters: {
                type: 'OBJECT',
                properties: propertiesSchema,
                required: requiredFields
              }
            },
            {
              name: 'remover_whitelist',
              description: 'Remove este contato da whitelist, interrompendo o atendimento automático por IA e desativando o chatbot para ele.',
              parameters: {
                type: 'OBJECT',
                properties: {}
              }
            }
          ]
        }
      ];

      const response = await client.models.generateContent({
        model: config.geminiModel || 'gemini-3.5-flash',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 500,
          temperature: 0.7,
          topP: 0.9,
          tools: tools
        }
      });

      const responseText = response.text || '🤖 Desculpe, não consegui processar sua mensagem.';

      // Add response to history
      this._addToHistory(phone, 'model', responseText);

      // Check if response has function calls
      const functionCalls = response.functionCalls || [];
      if (functionCalls.length > 0) {
        const call = functionCalls[0];
        console.log(`[Gemini] Agent requested tool execution: ${call.name}`, call.args);

        if (call.name === 'iniciar_cadastro') {
          return {
            text: responseText,
            action: 'start_registration'
          };
        }

        if (call.name === 'remover_whitelist') {
          store.removeFromWhitelistByPhone(phone);
          return {
            text: responseText,
            action: 'remove_whitelist'
          };
        }

        if (call.name === 'salvar_dados') {
          store.saveContact(phone, call.args);
          // Auto-whitelist upon LLM tool data save
          if (!store.isWhitelisted(phone)) {
            store.addToWhitelist(phone, call.args.nome || 'Cadastro via IA');
            console.log(`[Gemini] 🛡️ Contato ${phone} adicionado à Whitelist após salvar_dados.`);
          }
          return {
            text: responseText,
            action: 'save_data',
            data: call.args
          };
        }
      }

      return { text: responseText };

    } catch (err) {
      console.error(`[Gemini] Error for ${phone}:`, err.message);

      if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('401')) {
        return { text: '⚠️ A chave da API Gemini é inválida. Por favor, verifique nas configurações.' };
      }

      if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        return { text: '⏳ Muitas requisições. Por favor, aguarde um momento e tente novamente.' };
      }

      return { text: '🤖 Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em instantes.' };
    }
  }

  /**
   * Test the API key connection.
   */
  async testConnection() {
    const client = this._getClient();
    if (!client) {
      return { success: false, error: 'API key not configured' };
    }

    try {
      const config = store.getRawConfig();
      const response = await client.models.generateContent({
        model: config.geminiModel || 'gemini-2.0-flash-lite',
        contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
        config: { maxOutputTokens: 10 }
      });

      return {
        success: true,
        model: config.geminiModel || 'gemini-2.0-flash-lite',
        response: response.text
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}
