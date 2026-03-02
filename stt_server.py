from fastapi import FastAPI, Request, Response
from starlette.concurrency import run_in_threadpool
from faster_whisper import WhisperModel
import os
import time
import numpy as np
import threading
import json

app = FastAPI(title="Local Whisper STT MVP")

# QA Metrics
metrics = {"accepted": 0, "rejected_429": 0}

# Generic hotwords context
SESSION_PROMPT = "transcricao de audio, ata de reuniao, palestra, anotacoes, texto corrido, introducao, conclusao, paragrafo, virgula, ponto, exclamacao, interrogacao"

# VAD state
vad_state = {
    "last_voice_ts": time.time(),
    "has_voice_buffer": False,
}

MODEL_NAME = os.getenv("WHISPER_MODEL", "deepdml/faster-whisper-large-v3-turbo-ct2")
MODEL_BACKEND = {"device": None, "compute_type": None}
STT_PORT = int(os.getenv("STT_PORT", "8090"))


def load_model_with_fallback():
    preferred_device = os.getenv("WHISPER_DEVICE", "cuda")
    preferred_compute = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    candidates = [
        (preferred_device, preferred_compute),
        ("cuda", "int8"),
        ("cpu", "int8"),
        ("cpu", "int8_float32"),
        ("cpu", "float32"),
    ]

    tried = set()
    last_error = None
    for device, compute_type in candidates:
        key = (device, compute_type)
        if key in tried:
            continue
        tried.add(key)
        try:
            print(f"Trying Whisper backend device={device} compute_type={compute_type}...")
            loaded_model = WhisperModel(MODEL_NAME, device=device, compute_type=compute_type)
            MODEL_BACKEND["device"] = device
            MODEL_BACKEND["compute_type"] = compute_type
            print(f"STT model loaded on {device} ({compute_type}).")
            return loaded_model
        except Exception as err:
            last_error = err
            print(f"Backend failed {device}/{compute_type}: {err}")

    raise RuntimeError(f"Could not load WhisperModel '{MODEL_NAME}'. Last error: {last_error}")


model = load_model_with_fallback()
stt_lock = threading.Lock()


@app.get("/health")
def health_ping():
    return {
        "ok": True,
        "ts": int(time.time() * 1000),
        "device": MODEL_BACKEND["device"],
        "compute_type": MODEL_BACKEND["compute_type"],
    }


@app.post("/inference")
async def process_audio(request: Request, response: Response):
    handler_start_time = time.time()
    client_t0_ms = request.headers.get("x-client-t0-ms", None)

    try:
        content = await request.body()
    except Exception as e:
        print(f"Error reading body: {e}")
        return {"text": "", "is_final": False, "error": str(e)}

    if len(content) == 0:
        return {"text": "", "is_final": False}

    if not stt_lock.acquire(blocking=False):
        metrics["rejected_429"] += 1
        with open("qa_metrics_py.log", "a") as f:
            f.write(json.dumps({"time": time.time(), "type": "429"}) + "\n")
        response.status_code = 429
        return {"error": "busy"}

    try:
        audio_data = np.frombuffer(content, dtype=np.int16)
        audio_float32 = audio_data.astype(np.float32) / 32768.0

        rms = float(np.sqrt(np.mean(np.square(audio_float32)))) if len(audio_float32) > 0 else 0.0

        is_final = False
        if rms > 0.005:
            vad_state["last_voice_ts"] = time.time()
            vad_state["has_voice_buffer"] = True
        else:
            if vad_state["has_voice_buffer"] and (time.time() - vad_state["last_voice_ts"]) >= 0.85:
                is_final = True
                vad_state["has_voice_buffer"] = False
                vad_state["last_voice_ts"] = time.time()

        mode_str = "final" if is_final else "partial"
        b_size = 4 if is_final else 1
        cond_prev = True if is_final else False

        infer_start_time = time.time()

        def run_transcription():
            segs, _ = model.transcribe(
                audio_float32,
                beam_size=b_size,
                language="pt",
                initial_prompt=SESSION_PROMPT,
                vad_filter=False,
                condition_on_previous_text=cond_prev,
            )
            return " ".join([seg.text for seg in segs]).strip()

        texto_completo = await run_in_threadpool(run_transcription)
        infer_ms = int((time.time() - infer_start_time) * 1000)

        recv_to_send_ms = int((time.time() - handler_start_time) * 1000)

        metrics["accepted"] += 1
        with open("qa_metrics_py.log", "a") as f:
            f.write(
                json.dumps(
                    {
                        "time": time.time(),
                        "type": "STT",
                        "mode": mode_str,
                        "transcribe_ms": infer_ms,
                        "in": len(content),
                    }
                )
                + "\n"
            )

        res_payload = {
            "text": texto_completo if len(texto_completo) > 3 else "",
            "is_final": is_final,
            "mode": mode_str,
            "infer_ms": infer_ms,
            "recv_to_send_ms": recv_to_send_ms,
            "rms": round(rms, 4),
        }
        if client_t0_ms:
            res_payload["client_t0_ms"] = int(client_t0_ms)

        if len(texto_completo) > 3 or is_final:
            print(f"[STT {mode_str.upper()} | {infer_ms}ms | RMS: {rms:.4f}]: {texto_completo}")

        return res_payload

    except Exception as e:
        print(f"Error processing PCM stream: {str(e)}")
        return {"text": "", "is_final": False, "error": str(e)}
    finally:
        stt_lock.release()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("stt_server:app", host="127.0.0.1", port=STT_PORT, log_level="warning")
