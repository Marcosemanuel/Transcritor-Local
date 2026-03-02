# Plano Integrado: Transcrição Clínica Local (Voz-para-Texto MVP)

Este documento descreve a transição do mock simulado para o uso real de microfone no terminal, mantendo a regra **Zero Nuvem**.

## Objetivo

Processar o áudio do microfone padrão do usuário e alimentar a janela deslizante de LLM com transcrições textuais contínuas usando motores abertos de IA sem vazar dados para a nuvem.

## Fases de Implementação

### 1. Desacoplamento do STT (Engine de Speech-to-Text)

A tentativa de compilar extensões nativas C++ dentro do ecossistema Node.js costuma causar falhas massivas. Para isolarmos a camada:

- **Escolha Tecnológica**: Vamos evitar o binding direto em Node. Utilizaremos o **Whisper.cpp Server** rodando em background (port: 8080) ou um script em Python isolado (Faster-Whisper) com as chamadas feitas por HTTP via Node.
- Isso assegura que problemas de compilação da AI de áudio não quebrem o TUI do Ink em React e vice-versa.

### 2. Captura de Áudio em Tempo Real no Node.js

- Instalar e configurar dependência de record de áudio nativa.
- Opção principal: `recordrtc-nodejs` ou `node-record-lpcm16`.
- **Atalho do OS**: No Windows, requere que o pacote `sox` (Sound eXchange) seja exposto no PATH para evitar erro "spawn rec ENOENT".

### 3. Loop de Ingestão e Processamento (Streaming VAD)

Não podemos mandar 1 hora de áudio direto e esperar a transcrição para injetar no Ink.

- Implementar **VAD (Voice Activity Detection)**: Fatiar o fluxo do microfone sempre que houver detecções físicas de silêncio (ex: gaps de 0.5s ou chunks a cada 5 segundos de fala contínua).
- Transmitir a string transcrita resultante desse pedaço de volta ao nosso array base (`simulator.js` se transformará em `app.js`).

### 4. Gestão do Ambiente

- **Dependências Externas Obrigatórias**: Instalar `sox` (necessário no SO) e confirmar pathing C++.
- **Script de Atualização**: Desenvolver script npm que levante o Whisper Daemon em lock e libere `node app.js`.

### 5. Auditoria de Falhas de Permissão TUI

Tratamento sobre o erro de liberação de dispositivo sonoro que ocorre em ambientes locais via permissão restrita de terminal.

---

## Diagrama Simplificado (Final)

[Microfone Físico -> Sox / Record LPCM16]
   -> (Slices de 5 Segundos)
   -> [Whisper.cpp Local API / Transcrição]
   -> (String Output)
   -> [TUI do Ink em React + LLMWorker]
   -> [Ollama Local API]
   -> Alerta renderizado na tela (Se Bater c/ Protocolo)
