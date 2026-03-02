import sys
import soundcard as sc
import soundfile as sf
import time
import numpy as np

def record_audio(filepath, duration=5):
    try:
        default_speaker = sc.default_speaker()
        mics = sc.all_microphones(include_loopback=True)
        
        # Find the loopback microphone for the default speaker
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

        data = loopback_mic.record(samplerate=16000, numframes=int(16000 * float(duration)), channels=1)
        sf.write(filepath, data, 16000, subtype='PCM_16')
        
        sys.exit(0)
    except Exception as e:
        print(f"Erro: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(1)
    record_audio(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 2.5)
