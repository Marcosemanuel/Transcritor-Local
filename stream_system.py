import sys
import soundcard as sc
import numpy as np

def stream_audio():
    try:
        default_speaker = sc.default_speaker()
        mics = sc.all_microphones(include_loopback=True)
        
        loopback_mic = None
        for m in mics:
            if m.isloopback and (default_speaker.name in m.name or m.name in default_speaker.name):
                loopback_mic = m
                break
        
        if not loopback_mic:
            loopbacks = [m for m in mics if m.isloopback]
            if loopbacks:
                loopback_mic = loopbacks[0]
            else:
                loopback_mic = sc.default_microphone()

        with loopback_mic.recorder(samplerate=16000, channels=1) as mic:
            while True:
                data = mic.record(numframes=4000) # Lote de 0.25 segundos
                data_int16 = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16)
                sys.stdout.buffer.write(data_int16.tobytes())
                sys.stdout.buffer.flush()
                
    except Exception as e:
        sys.stderr.write(f"Erro: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    stream_audio()
