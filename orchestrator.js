import { EventEmitter } from 'events';
import { AudioPipeline } from './audioPipeline.js';
import { LLMWorker } from './llmWorker.js';
import { config } from './config.js';

// Orchestrates capture -> STT -> text aggregation -> LLM format
export class Orchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.silenceMs = options.silenceMs || config.silenceMs;
    this.pipelineFactory = options.pipelineFactory || ((onEvent) => new AudioPipeline(onEvent, config.sttEndpoint));
    this.llmWorker = options.llmWorker || new LLMWorker((msg) => this.emit('status', { message: msg, level: 'info' }));
    this.resetState();
  }

  resetState() {
    this.pipeline = null;
    this.committed = '';
    this.partial = '';
    this.full = '';
    this.filename = '';
    this.mode = null;
    this.silenceTimer = null;
  }

  startSession({ mode, filename }) {
    if (!mode || !filename) throw new Error('mode and filename are required');
    this.stop();
    this.filename = filename;
    this.mode = mode;
    this.pipeline = this.pipelineFactory((payload) => this.handlePipelineEvent(payload));
    this.emit('status', { message: 'Ouvindo (Gravando)...', level: 'info' });
    this.pipeline.start(mode);
  }

  pause() {
    if (!this.pipeline) return;
    this.pipeline.pause();
    this.emit('status', { message: 'Pausado. (P) para retomar.', level: 'warning' });
  }

  resume() {
    if (!this.pipeline) return;
    this.pipeline.resume();
    this.emit('status', { message: 'Ouvindo (Gravando)...', level: 'info' });
  }

  stop() {
    if (this.pipeline) {
      this.pipeline.stop();
      this.pipeline = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  async finalize() {
    const finalStr = `${this.full} ${this.partial}`.trim();
    const fname = (this.filename || 'transcricao').trim();
    this.emit('status', { message: 'Finalizando e Processando via LLM...', level: 'info' });
    const result = await this.llmWorker.formatDocument(finalStr, fname);
    this.emit('finalized', result);
    this.resetState();
  }

  handlePipelineEvent(payload) {
    if (!payload || typeof payload !== 'object') return;

    if (payload.type === 'status') {
      this.emit('status', { message: payload.message || 'Status', level: payload.level || 'info' });
      return;
    }

    if (payload.type !== 'transcript') return;

    const text = payload.text;
    const isFinal = payload.is_final;

    if (isFinal) {
      if (text && text.trim() !== '') {
        this.commitText(text);
      } else {
        this.partial = '';
      }
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
    } else {
      if (text && text.trim() !== '') {
        this.partial = text;
        this.emit('text', { committed: this.committed, partial: this.partial });
      }
      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        if (this.partial.trim() !== '') {
          this.commitText(this.partial);
        }
      }, this.silenceMs);
    }
  }

  commitText(txt) {
    const clean = (txt || '').trim();
    if (!clean) return;
    this.committed = this.committed ? `${this.committed} ${clean}` : clean;
    this.full = this.full ? `${this.full} ${clean}` : clean;
    this.partial = '';
    this.emit('text', { committed: this.committed, partial: '' });
  }
}
