# Transcritor Local
Transcrição 100% offline: captura de áudio, STT on-device (Faster-Whisper) e formatação via LLM local (Ollama). Focado em privacidade e operação sem nuvem.

## Destaques
- Totalmente local: nenhum dado sai da máquina.
- Duas fontes de áudio: microfone (SoX) ou loopback do sistema (Python `soundcard`).
- TUI rápida em Ink/React com controles de pausa/finalização.
- Orquestração desacoplada: captura → STT → agregação → formatação Markdown.
- Configurável por variáveis de ambiente (endpoints, modelo, timeouts).

## Arquitetura (alto nível)
```
[Audio (mic/loopback)]
        |
   audioPipeline.js  --HTTP-->  stt_server.py (FastAPI + Faster-Whisper)
        |                            |
        |                     texto parcial/final
        v
  orchestrator.js  --eventos-->  app.js (Ink TUI)
        |
        | texto final
        v
  llmWorker.js --> Ollama --> arquivo .md em Transcrições/
```

## Pré-requisitos
- Node 18+
- Python 3.10+ com `pip`
- SoX instalado e no PATH (Windows: `C:\Program Files (x86)\sox-14-4-2` já suportado)
- Ollama em execução (modelo padrão `qwen2.5:1.5b`, configurável)

## Setup rápido
```bash
npm install
python -m venv .venv
./.venv/Scripts/activate
pip install -U pip
pip install fastapi "uvicorn[standard]" python-multipart faster-whisper soundcard soundfile
```

## Execução
1) Suba o STT local (porta padrão 8090, altere com `STT_PORT`):
```bash
./.venv/Scripts/python.exe stt_server.py
```
2) Em outro terminal, rode a TUI:
```bash
npm start
```

### Variáveis úteis
| Variável            | Padrão                                 | Uso                           |
| ------------------- | -------------------------------------- | ----------------------------- |
| `STT_ENDPOINT`      | `http://localhost:8090/inference`      | Endpoint do STT               |
| `STT_PORT`          | `8090`                                 | Porta do servidor STT         |
| `OLLAMA_ENDPOINT`   | `http://localhost:11434/api/generate`  | Endpoint do Ollama            |
| `OLLAMA_MODEL`      | `qwen2.5:1.5b`                         | Modelo LLM para formatação    |
| `LLM_TIMEOUT_MS`    | `30000`                                | Timeout da chamada ao LLM     |
| `LLM_MAX_RETRIES`   | `2`                                    | Retentativas ao chamar o LLM  |
| `SILENCE_MS`        | `3000`                                 | Timeout de silêncio para commit|

## Controles da TUI
- `1` Microfone
- `2` Áudio do sistema (loopback)
- `P` Pausar/retomar captura
- `F` Finalizar e formatar o texto transcrito

## Estrutura de pastas
- `app.js` — UI Ink, conversa só com o Orchestrator
- `orchestrator.js` — coordena captura, STT, agregação e formatação
- `audioPipeline.js` — captura + envio para STT
- `stt_server.py` — backend FastAPI/Faster-Whisper
- `llmWorker.js` — cliente Ollama para Markdown
- `config.js` — defaults de endpoint/timeout
- `Transcrições/` — saídas `.md`
- `docs/PLAN.md` — plano técnico resumido

## Solução rápida de problemas
- STT indisponível: verifique se a porta 8090 está livre e se `stt_server.py` está rodando.
- SoX não encontrado (Windows): instale e garanta `C:\Program Files (x86)\sox-14-4-2` no PATH.
- Loopback não captura áudio do sistema: confirme suporte a loopback no driver; ajuste `stream_system.py` se necessário.
- LLM sem resposta: valide `ollama serve`, modelo baixado (`ollama pull qwen2.5:1.5b`) e variáveis de endpoint.

## Scripts úteis
- `npm start` — inicia a TUI
- `LIGAR_WHISPER.bat` — prepara venv e sobe o STT em 8090

## Licença
MIT
