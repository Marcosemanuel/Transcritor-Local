import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { config } from "./config.js";

const STT_URL = config.sttEndpoint;
const OLLAMA_URL = process.env.OLLAMA_ENDPOINT || "http://localhost:11434/api/tags";

const isWindows = process.platform === "win32";

async function httpOk(url, timeoutMs = 2000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(id);
  }
}

function resolvePython() {
  if (isWindows) {
    const venvPy = path.join(process.cwd(), ".venv", "Scripts", "python.exe");
    if (fs.existsSync(venvPy)) return venvPy;
  }
  return "python";
}

async function ensureStt() {
  const healthy = await httpOk(STT_URL.replace("/inference", "/health"));
  if (healthy) return true;

  const py = resolvePython();
  const sttPath = path.join(process.cwd(), "stt_server.py");
  const child = spawn(py, [sttPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // aguarda até 20s pelo health
  const maxWaitMs = 20000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await httpOk(STT_URL.replace("/inference", "/health"))) return true;
    await delay(500);
  }
  return false;
}

async function warnOllama() {
  const ok = await httpOk(OLLAMA_URL, 1500);
  if (!ok) {
    console.error("[WARN] Ollama não está respondendo em", OLLAMA_URL);
  }
}

// bootstrap
(async () => {
  const sttReady = await ensureStt();
  if (!sttReady) {
    console.error("[ERRO] STT não inicializou. Verifique stt_server.py e dependências.");
    process.exit(1);
  }

  await warnOllama();

  // carrega a TUI
  await import("./app.js");
})();
