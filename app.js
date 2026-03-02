import React, { useState, useEffect, useRef, createElement as e } from 'react';
import { render, Box, Text, useInput } from 'ink';
import fs from 'fs';
import { Orchestrator } from './orchestrator.js';
import { config } from './config.js';

process.on('uncaughtException', err => fs.writeFileSync('crash.log', 'UE: ' + err.stack + '\n', { flag: 'a' }));
process.on('unhandledRejection', err => fs.writeFileSync('crash.log', 'UR: ' + err.stack + '\n', { flag: 'a' }));

const contentOptions = [
  { key: '1', id: 'aula', label: 'Aula / Curso' },
  { key: '2', id: 'reuniao', label: 'Reunião' },
  { key: '3', id: 'entrevista', label: 'Entrevista' },
  { key: '4', id: 'nota', label: 'Nota rápida' },
  { key: '5', id: 'default', label: 'Genérico' },
];

const Header = ({ systemStatus, mode, isPaused }) => e(Box, { borderStyle: "single", borderColor: "cyan", padding: 1, width: "100%", justifyContent: "space-between" },
    e(Text, { bold: true, color: "cyan" }, `Transcrição Ativa[${mode === 'sistema' ? 'SISTEMA PC' : 'MICROFONE'}]`),
    e(Text, { color: isPaused ? 'yellow' : (systemStatus.includes('ERRO') ? 'red' : 'green') }, isPaused ? "PAUSADO" : systemStatus)
);

const TranscriptionPanel = ({ committed, partial }) => e(Box, { borderStyle: "round", borderColor: "white", padding: 1, width: "100%", minHeight: 10, flexDirection: "column" },
    e(Text, { bold: true, color: "green" }, "Texto Transcrito (Whisper Local):"),
    e(Text, null,
        e(Text, { color: "white" }, committed),
        committed.length > 0 && partial.length > 0 ? " " : "",
        e(Text, { color: "gray", dimColor: true }, partial)
    )
);

const ControlsBox = () => e(Box, { borderStyle: "bold", borderColor: "blue", padding: 1, width: "100%", justifyContent: "center", gap: 3 },
    e(Text, { bold: true, color: "yellow" }, "P = Play / Pause"),
    e(Text, { bold: true, color: "green" }, "F = Finish (Escolher Formatação)")
);

const App = () => {
    // Phases: 'source' -> 'naming' -> 'recording' -> 'content' -> 'formatting'
    const [phase, setPhase] = useState('source');

    const [audioMode, setAudioMode] = useState(null); // 'microfone' ou 'sistema'
    const [filename, setFilename] = useState("");
    const [isPaused, setIsPaused] = useState(false);

    const [committedText, setCommittedText] = useState("");
    const [partialText, setPartialText] = useState("");
    const [status, setStatus] = useState("Preparando...");
    const [contentType, setContentType] = useState('default');

    const orchestratorRef = useRef(null);

    // Inicializa orquestrador uma vez
    useEffect(() => {
        const orchestrator = new Orchestrator({ silenceMs: config.silenceMs });
        orchestrator.on('status', ({ message }) => setStatus(message));
        orchestrator.on('text', ({ committed, partial }) => {
            setCommittedText(committed || "");
            setPartialText(partial || "");
        });
        orchestrator.on('finalized', (result) => {
            setStatus(result.success ? "Finalizado com sucesso! Reiniciando..." : (result.reason || "Falha ao finalizar."));
            setCommittedText("");
            setPartialText("");
            setIsPaused(false);
            setAudioMode(null);
            setFilename("");
            setContentType('default');
            setTimeout(() => setPhase('source'), 2500);
        });
        orchestratorRef.current = orchestrator;
        return () => orchestrator.removeAllListeners();
    }, []);

    // Menu Interativo & Digitação (Global Input)
    useInput((input, key) => {
        if (phase === 'source') {
            if (input === '1') { setAudioMode('microfone'); setPhase('naming'); }
            if (input === '2') { setAudioMode('sistema'); setPhase('naming'); }
        }
        else if (phase === 'naming') {
            if (key.return) {
                if (filename.trim().length > 0) {
                    setPhase('recording');
                }
            } else if (key.backspace || key.delete) {
                setFilename(prev => prev.slice(0, -1));
            } else if (input && /^[a-zA-Z0-9_\- ]+$/.test(input)) {
                setFilename(prev => prev + input);
            }
        }
        else if (phase === 'recording') {
            if (input.toLowerCase() === 'p') {
                if (isPaused) {
                    orchestratorRef.current?.resume();
                    setIsPaused(false);
                    setStatus("Ouvindo (Gravando)...");
                } else {
                    orchestratorRef.current?.pause();
                    setIsPaused(true);
                    setStatus("Pausado. (P) para retomar.");
                }
            } else if (input.toLowerCase() === 'f') {
                orchestratorRef.current?.stop();
                setPhase('content');
            }
        }
        else if (phase === 'content') {
            const choice = contentOptions.find(o => o.key === input);
            if (choice) {
                setContentType(choice.id);
                setPhase('formatting');
            }
        }
    });

    useEffect(() => {
        if (phase !== 'recording') return;
        setStatus("Ouvindo (Gravando)...");
        orchestratorRef.current?.startSession({ mode: audioMode, filename: filename.trim() });
        return () => {
          orchestratorRef.current?.stop();
        }
    }, [phase]);

    useEffect(() => {
        if (phase === 'formatting') {
            orchestratorRef.current?.finalize({ contentType });
        }
    }, [phase, contentType]);

    // Renderizações por Fase
    if (phase === 'source') {
        return e(Box, { flexDirection: "column", borderStyle: "round", borderColor: "green", padding: 1, width: 80 },
            e(Text, { bold: true, color: "green", marginBottom: 1 }, "Ferramenta Útil de Transcrição Whisper"),
            e(Text, { color: "white" }, "Pressione ", e(Text, { bold: true, color: "yellow" }, "1"), " 🎙️  Escutar Microfone Diretamente"),
            e(Text, { color: "white" }, "Pressione ", e(Text, { bold: true, color: "cyan" }, "2"), " 🎧  Escutar o Áudio do PC / Mixagem Estéreo")
        );
    }

    if (phase === 'naming') {
        return e(Box, { flexDirection: "column", borderStyle: "round", borderColor: "cyan", padding: 1, width: 80 },
            e(Text, { bold: true, color: "cyan", marginBottom: 1 }, "Qual o nome do arquivo desta sessão?"),
            e(Text, { color: "white" }, "Digite o nome e pressione ENTER: ", e(Text, { bold: true, color: "yellow" }, filename + "█"))
        );
    }

    if (phase === 'content') {
        return e(Box, { flexDirection: "column", borderStyle: "round", borderColor: "magenta", padding: 1, width: 80 },
            e(Text, { bold: true, color: "magenta", marginBottom: 1 }, "Escolha o tipo de conteúdo para formatar:"),
            ...contentOptions.map(opt => e(Text, { key: opt.id, color: "white" }, `${opt.key} - ${opt.label}`))
        );
    }

    if (phase === 'formatting') {
        return e(Box, { flexDirection: "column", borderStyle: "round", borderColor: "magenta", padding: 2, width: 80, alignItems: "center" },
            e(Text, { bold: true, color: "magenta", marginBottom: 1 }, "Finalizando e Processando via LLM..."),
            e(Text, { color: "white" }, status)
        );
    }

    // Phase Recording UI
    return e(Box, { flexDirection: "column", width: 80 },
        e(Header, { systemStatus: status, mode: audioMode, isPaused: isPaused }),
        e(TranscriptionPanel, { committed: committedText, partial: partialText }),
        e(ControlsBox, null)
    );
};

render(e(App, null));
