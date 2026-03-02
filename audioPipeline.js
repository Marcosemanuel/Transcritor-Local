import record from 'node-record-lpcm16';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import http from 'http';
import { execSync, spawn } from 'child_process';
import os from 'os';

// P0.9-2 — PROVAR KEEP-ALIVE HTTP
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });


export class AudioPipeline {
    constructor(onTextUpdate, sttEndpoint) {
        this.onTextUpdate = onTextUpdate;
        this.isRecording = false;
        this.chunkCount = 0;
        this.sttEndpoint = sttEndpoint || process.env.STT_ENDPOINT || 'http://localhost:8090/inference';

        // Variáveis de controle de Tráfego e Backpressure (Latest-only)
        this.inFlight = false;
        this.pendingBuffer = null;
        this.pendingLength = 0;
        this.lastSentLength = 0; // NEW: tracking for sliding window step
        this.sentenceBuffer = Buffer.alloc(0);
        this.abortController = null;
        this.isPaused = false;
    }

    emitStatus(message, level = 'info') {
        this.onTextUpdate({ type: 'status', level, message });
    }

    emitTranscript(text, isFinal, mode = 'partial') {
        this.onTextUpdate({ type: 'transcript', text, is_final: isFinal, mode });
    }

    checkSox() {
        try {
            const soxPath = 'C:\\Program Files (x86)\\sox-14-4-2';
            if (fs.existsSync(soxPath) && !process.env.PATH.includes(soxPath)) {
                process.env.PATH = `${soxPath};${process.env.PATH}`;
            }
            execSync('sox --version', { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    }

    // Lógica LATEST-ONLY + Acúmulo P1-4
    async sendLoop() {
        if (this.pendingBuffer === null) return; // Nenhuma novidade

        // Se houver transação anterior e explodimos o gargalo, abortamos silenciosamente (Backpressure Passivo).
        if (this.inFlight) {
            return;
        }

        const chunkToSend = this.pendingBuffer;
        const sentLength = this.pendingLength;
        this.pendingBuffer = null;

        this.inFlight = true;
        this.abortController = new AbortController();

        const ts_start = Date.now();

        try {
            const res = await axios.post(this.sttEndpoint, chunkToSend, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'x-client-t0-ms': ts_start // Header de T0 (P0.9-4)
                },
                httpAgent: httpAgent,
                timeout: 15000, // Timeout hard de 15s por bloco para dar tempo da placa rodar o modelo
                signal: this.abortController.signal
            });

            const rtt_total_ms = Date.now() - ts_start;

            // P0.9-4 — RTT vs Overhead Calculation
            if (res.data && res.data.infer_ms) {
                const infer_ms = res.data.infer_ms;
                const overhead_ms = rtt_total_ms - infer_ms;
            }


            if (res.data) {
                const text = (res.data.text || "").trim();
                const isFinal = res.data.is_final === true;
                const mode = res.data.mode || "partial";

                // P1-4: Se Finalizou a frase validado por RMS, extirpamos do Cache o bloco enviado!
                if (isFinal) {
                    this.sentenceBuffer = this.sentenceBuffer.slice(sentLength);
                    this.lastSentLength = 0;
                } else {
                    this.lastSentLength = sentLength;
                }

                if (text && !text.includes('[BLANK_AUDIO]') && text.length > 2) {
                    this.emitTranscript(text, isFinal, mode);
                } else if (isFinal) {
                    this.emitTranscript("", true, "final");
                }
            }
        } catch (e) {
            const lat = Date.now() - ts_start;

            // Drop ignorado polidamente para timeouts e reset do Python
            if (e.code === 'ECONNREFUSED') {
                this.emitStatus("[ERRO] Backend Whisper indisponível. Verifique o stt_server.py.", "error");
            } else if (e.code === 'ECONNABORTED') {
                this.emitStatus("[ERRO] Timeout no backend de transcrição.", "error");
            } else if (e.response && e.response.status === 429) {
                this.emitStatus("[ERRO] Backend STT ocupado (429).", "error");
            } else if (axios.isCancel(e)) {
            } else {
                this.emitStatus(`[ERRO] Falha no envio para STT: ${e.message}`, "error");
            }
        } finally {
            this.inFlight = false;
            this.abortController = null;

            // Se ainda tem bastante coisa pra processar no buffer da frase longa, retoma com pequeno atraso para não causar um DDoS Local (loop sincrono) ou no caso de um 429!
            if (this.sentenceBuffer.length >= Math.max(16000, this.lastSentLength + 9600)) {
                this.pendingBuffer = Buffer.from(this.sentenceBuffer);
                this.pendingLength = this.sentenceBuffer.length;
                setTimeout(() => {
                    this.sendLoop();
                }, 100);
            }
        }
    }

    start(mode = 'microfone') {
        if (!this.checkSox()) {
            this.emitStatus("[ERRO] SOX ausente no sistema.", "error");
            return;
        }

        this.isRecording = true;
        this.startStreaming(mode);
    }

    startStreaming(mode) {
        if (!this.isRecording) return;

        this.sentenceBuffer = Buffer.alloc(0);
        const MIN_CHUNK_SIZE = 16000; // ~ 500ms 16kHz Mono

        if (mode === 'sistema') {
            this.currentRecordingObj = spawn('.\\.venv\\Scripts\\python.exe', ['stream_system.py']);
        } else {
            const args = [
                '-t', 'waveaudio', 'default',
                '-q', '-b', '16', '-c', '1', '-r', '16000',
                '-t', 'raw', '-'
            ];
            this.currentRecordingObj = spawn('sox', args);
        }

        this.currentRecordingObj.stdout.on('data', (data) => {
            if (this.isPaused) return; // Joga fora bytes acústicos capturados do SOX na Pausa!

            this.sentenceBuffer = Buffer.concat([this.sentenceBuffer, data]);

            // Limit buffer safety OOM (Limite de 16 segundos max hardcappados s/ pausas de voz para nao estourar a RAM)
            if (this.sentenceBuffer.length > 512000) {
                const diff = this.sentenceBuffer.length - 512000;
                this.sentenceBuffer = this.sentenceBuffer.slice(diff);
                this.lastSentLength = Math.max(0, this.lastSentLength - diff);
            }

            if (!this.inFlight && this.sentenceBuffer.length >= Math.max(MIN_CHUNK_SIZE, this.lastSentLength + 9600)) {
                this.pendingBuffer = Buffer.from(this.sentenceBuffer);
                this.pendingLength = this.sentenceBuffer.length;
                this.sendLoop();
            }
        });

        this.currentRecordingObj.stderr.on('data', (data) => {
            const errLog = data.toString().trim();
            if (errLog) {
                // Ignore non-fatal warnings usually dumped by sox to stderr
                if (!errLog.toLowerCase().includes('in: ') && !errLog.toLowerCase().includes('out: ')) {
                    fs.appendFileSync('audio_stderr.log', errLog + '\\n');
                    if (errLog.toLowerCase().includes('error') || errLog.toLowerCase().includes('failed') || errLog.toLowerCase().includes('could not open')) {
                        this.emitStatus(`[ERRO ÁUDIO] ${errLog.slice(0, 100)}`, "error");
                    }
                }
            }
        });

        this.currentRecordingObj.on('close', (code) => {
            if (this.isRecording) {
                this.startStreaming(mode);
            }
        });

        this.currentRecordingObj.on('error', (err) => {
            this.emitStatus(`[ERRO Áudio Stream] Falha ao capturar som: ${err.message}`, "error");
        });
    }

    stop() {
        this.isRecording = false;
        if (this.currentRecordingObj) {
            this.currentRecordingObj.kill();
        }
        if (this.abortController) {
            this.abortController.abort();
        }
        this.pendingBuffer = null;
        this.inFlight = false;
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
        // Zera buffer pra recomeçar captura vocal limpa de ruídos do mudo
        this.sentenceBuffer = Buffer.alloc(0);
        this.lastSentLength = 0;
        this.pendingBuffer = null;
    }
}
