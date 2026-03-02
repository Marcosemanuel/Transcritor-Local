@echo off
echo ==============================================
echo INICIANDO O MOTOR DE TRANSCRIÇÃO (STT) 
echo ==============================================

echo [1] Criando Ambiente Virtual Isolado...
python -m venv .venv

echo [2] Ativando Ambiente e Instalando IA (FastAPI, Whisper)...
call .venv\Scripts\activate
pip install -U pip
pip install fastapi "uvicorn[standard]" python-multipart faster-whisper

echo.
echo ==============================================
echo [3] LIGANDO O SERVIDOR NA PORTA 8090...
echo Deixe esta janela preta aberta, e no Visual Studio Code rode: npm start
echo ==============================================
set STT_PORT=8090
python stt_server.py

pause
