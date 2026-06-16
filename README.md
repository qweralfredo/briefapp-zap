<p align="center">
  <img src="logo.png" alt="brief.app.br Logo" width="100" style="border-radius: 16px;" />
</p>

<h1 align="center">brief.app.br — Briefapp.Zap</h1>

<p align="center">
  <strong>Tirando suas ideias do papel diretamente para o WhatsApp 🚀</strong>
</p>

<p align="center">
  Este projeto foi desenvolvido especialmente para os participantes da <strong>Semana Sem Papel</strong> — o desafio definitivo para founders, empreendedores e criadores que querem tirar suas ideias do papel e transformá-las em produtos digitais reais, rápidos e eficientes.
</p>

---

## 🌟 O que é o Briefapp.Zap?

O **Briefapp.Zap** é um MVP (Minimum Viable Product) pronto para uso que permite conectar qualquer ideia de negócio ao **WhatsApp** usando inteligência artificial de ponta (**Google Gemini**). 

Com ele, você pode automatizar o atendimento, validar hipóteses de mercado, capturar leads e interagir com seus clientes de forma humanizada e inteligente, tudo configurável através de um painel web dinâmico e sem precisar alterar o código-fonte.

> [!TIP]
> **Sobre o brief.app:**
> O [brief.app.br](https://brief.app.br/) é uma plataforma de design com inteligência artificial idealizada por **Ana Rovina** e **Alfredo Rosa**, focada em entregar produtos digitais com excelência e velocidade para quem precisa validar e escalar ideias rapidamente.

---

## 🛠️ Recursos Principais

* **🔌 Conexão WhatsApp Instantânea (via Baileys):** Autenticação rápida e segura por QR Code. A sessão é salva localmente e restaurada automaticamente caso o servidor reinicie.
* **🤖 Chatbot Agêntico com Google Gemini:** Chatbot inteligente integrado com a API oficial do Gemini, capaz de se comportar conforme a personalidade e os objetivos definidos para o seu negócio.
* **📝 Fluxo de Cadastro Estruturado (Formulários no Chat):** Defina campos de cadastro (como Nome, E-mail, Empresa, etc.) no painel administrativo. O robô detecta a intenção de cadastro, faz as perguntas em sequência e salva as respostas estruturadas.
* **🛡️ Whitelist de Segurança:** Ideal para a fase de testes da sua ideia. Você define quais números de WhatsApp podem conversar com a IA, evitando consumo inesperado da API.
* **🔑 Gatilhos por Palavra-Chave (Keywords):** Configure palavras-chave (ex: "quero participar", "ajuda") para enviar respostas automáticas pré-definidas, adicionar usuários à whitelist ou iniciar o diálogo inteligente com o Gemini.
* **📊 Painel Admin Web Moderno:** Interface web interativa para gerenciar sessões, configurar chaves de API, monitorar logs do servidor em tempo real e customizar o chatbot.

---

## 🚀 Como isso ajuda no desafio "Semana Sem Papel"?

Durante a **Semana Sem Papel**, o maior objetivo é a validação rápida. O Briefapp.Zap é a ferramenta perfeita para:
1. **Validar Demanda:** Crie um número de atendimento para o seu novo serviço e teste se as pessoas estão interessadas.
2. **Capturar Leads de Forma Interativa:** Substitua formulários chatos por uma conversa fluida no WhatsApp que coleta dados dos clientes.
3. **Atendimento 24/7:** Tenha um agente especialista no seu produto respondendo dúvidas comuns instantaneamente.

---

## ⚙️ Guia de Início Rápido

### 1. Pré-requisitos
* [Node.js](https://nodejs.org/) (versão 18 ou superior) instalado no sistema.
* Uma conta no WhatsApp para conectar.
* Uma chave de API do Gemini (obtida gratuitamente no [Google AI Studio](https://aistudio.google.com/)).

### 2. Instalação das Dependências
Clone o repositório e instale os pacotes necessários na pasta raiz do projeto:
```bash
npm install
```

### 3. Configurando o Ambiente
Copie o arquivo de exemplo de ambiente `.env.example` para `.env`:
```bash
cp .env.example .env
```
Abra o arquivo `.env` e configure a porta (padrão: 3000). Você também pode preencher `GEMINI_API_KEY` e `ENCRYPTION_KEY` aqui, ou configurá-las diretamente pela interface web.

### 4. Executando o Projeto
Inicie o servidor em modo de desenvolvimento (com auto-reload para alterações de código):
```bash
npm run dev
```
O servidor estará rodando em `http://localhost:3000`.

### 5. Conectando e Configurando
1. Abra `http://localhost:3000` no seu navegador.
2. Vá até a seção **Conexão** e aguarde o QR Code carregar.
3. No seu celular, abra o WhatsApp, vá em *Aparelhos conectados* > *Conectar um aparelho* e escaneie o código.
4. Na aba de **Configurações**, configure sua chave do Gemini, dê um objetivo ao robô (ex: *"Você é um assistente de vendas da minha nova hamburgueria artesanal..."*) e clique em salvar.
5. Adicione seu número pessoal na **Whitelist** e mande um *"Oi"* no WhatsApp para começar a testar!

---

## 📂 Estrutura do Código

```text
├── data/                  # Caches de sessão, configurações locais e contatos (ignorado pelo git)
├── src/
│   ├── public/            # Frontend Web (HTML, CSS e Javascript vanila)
│   └── server/
│       ├── ai/            # Integração com a API do Google Gemini
│       ├── config/        # Gerenciamento de persistência local das configurações (store.js)
│       ├── routes/        # Rotas da API REST do painel admin
│       └── whatsapp/      # Conexão Baileys e gerenciamento de sessões/mensagens
├── .env.example           # Modelo de variáveis de ambiente
├── .gitignore             # Regras de exclusão do Git (mantendo credenciais e dados locais seguros)
├── logo.png               # Logotipo oficial do projeto
├── package.json           # Dependências e scripts do Node.js
└── README.md              # Documentação do projeto
```

---

## 🛡️ Segurança de Dados

Todas as chaves de API salvas através da interface web são **criptografadas com AES-256-GCM** localmente antes de serem salvas em disco, garantindo privacidade mesmo que o servidor local seja compartilhado. 

---

## 📄 Licença

Este projeto é de código aberto sob a licença MIT. 

---

<p align="center">
  Feito com ❤️ pela equipe do <a href="https://brief.app.br/">brief.app.br</a> para acelerar a sua jornada de inovação.
</p>
