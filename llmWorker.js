import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { contentPrompts } from './config.js';

export class LLMWorker {
    constructor(onAlert) {
        this.onAlert = onAlert;
        this.isProcessing = false;
        this.ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
        this.ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b';
        this.requestTimeoutMs = Number(process.env.LLM_TIMEOUT_MS || 30000);
        this.maxRetries = Number(process.env.LLM_MAX_RETRIES || 2);
    }

    buildPrompt(text, variant = 'default') {
        const builder = contentPrompts[variant] || contentPrompts.default;
        return builder(text);
    }

    async formatDocument(text, filename, variant = 'default') {
        if (this.isProcessing) return { success: false, reason: "Processamento simultaneo em andamento." };
        if (!text || text.trim() === '') return { success: false, reason: "Nenhum audio foi falado/captado. Gravacao vazia." };
        this.isProcessing = true;
        this.onAlert("Formatando documento com IA (aguarde ~10s a 15s)...");

        const prompt = this.buildPrompt(text, variant);

        try {
            let response = null;
            let lastError = null;

            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
                try {
                    response = await axios.post(this.ollamaEndpoint, {
                        model: this.ollamaModel,
                        prompt,
                        stream: false,
                        options: {
                            temperature: 0.1
                        }
                    }, {
                        timeout: this.requestTimeoutMs
                    });
                    break;
                } catch (error) {
                    lastError = error;
                    const hasResponse = Boolean(error.response);
                    const statusCode = hasResponse ? error.response.status : null;
                    const retryable = !hasResponse || statusCode >= 500 || error.code === 'ECONNABORTED';

                    if (attempt < this.maxRetries && retryable) {
                        const waitMs = 1000 * (attempt + 1);
                        this.onAlert(`LLM indisponivel, tentativa ${attempt + 2}/${this.maxRetries + 1} em ${waitMs / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, waitMs));
                        continue;
                    }

                    throw lastError;
                }
            }

            const replyText = response?.data?.response?.trim() || '';
            if (!replyText) {
                throw new Error('Resposta vazia do modelo local.');
            }

            const dirName = 'Transcrições';
            await fs.mkdir(dirName, { recursive: true });

            const safeFileName = filename.endsWith('.md') ? filename : `${filename}.md`;
            const filepath = path.join(dirName, safeFileName);

            await fs.writeFile(filepath, replyText, 'utf-8');

            this.onAlert(`Documento estruturado '${safeFileName}' salvo com sucesso.`);
            return { success: true };
        } catch (error) {
            let errReason = `Falha Ollama: ${error.message}`;
            if (error.response && error.response.status === 404) {
                errReason = `Modelo ${this.ollamaModel} nao encontrado. Rode 'ollama pull ${this.ollamaModel}'.`;
            }
            this.onAlert(`[ERRO] ${errReason}`);
            return { success: false, reason: errReason };
        } finally {
            this.isProcessing = false;
        }
    }
}
