# Transcritor Local

Aplicação de transcrição local com TUI, STT on-device e formatação via LLM local (Ollama). Focada em rodar offline, sem dependências de nuvem.

## Stack
- Node.js + Ink/React para TUI
- Captura de áudio: SoX (microfone) ou loopback via Python `soundcard`
- STT: FastAPI + Faster-Whisper (CT2) local
- LLM: Ollama (modelo configurável, padrão `qwen2.5:1.5b`)

## Pré-requisitos
- Node 18+
- Python 3.10+ com `pip`
- SoX instalado e no PATH (Windows: `C:\Program Files (x86)\sox-14-4-2` já suportado no código)
- Ollama em execução (para formatação)

## Instalação
```bash
npm install
python -m venv .venv
./.venv/Scripts/activate
pip install -U pip
pip install fastapi "uvicorn[standard]" python-multipart faster-whisper soundcard soundfile
```

## Execução
1) Inicie o STT local:
```bash
./.venv/Scripts/python.exe stt_server.py
```
   - Porta padrão: `8090` (configure via `STT_PORT`).
2) Em outro terminal, rode a TUI:
```bash
npm start
```
   - Variáveis úteis: `STT_ENDPOINT` (override), `OLLAMA_ENDPOINT`, `OLLAMA_MODEL`, `LLM_TIMEOUT_MS`.

## Controles da TUI
- `1`: escutar microfone
- `2`: escutar áudio do sistema (loopback)
- `P`: pausar/retomar captura
- `F`: finalizar e formatar o texto transcrito

## Estrutura
- `app.js`: UI Ink, interage só com o Orchestrator
- `orchestrator.js`: coordena captura, STT, agregação e formatação
- `audioPipeline.js`: captura + envio para STT
- `stt_server.py`: backend FastAPI/Faster-Whisper
- `llmWorker.js`: cliente Ollama para formatação Markdown
- `config.js`: endpoints/timeouts padrão
- `Transcrições/`: saídas `.md`

## Scripts úteis
- `npm start` – inicia a TUI
- `LIGAR_WHISPER.bat` – prepara venv e sobe STT

## Licença
MIT
