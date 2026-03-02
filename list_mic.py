import ctypes
from ctypes import wintypes

winmm = ctypes.windll.winmm
num_devs = winmm.waveInGetNumDevs()

class WAVEINCAPS(ctypes.Structure):
    _fields_ = [
        ("wMid", wintypes.WORD),
        ("wPid", wintypes.WORD),
        ("vDriverVersion", wintypes.DWORD),
        ("szPname", ctypes.c_char * 32),
        ("dwFormats", wintypes.DWORD),
        ("wChannels", wintypes.WORD),
        ("wReserved1", wintypes.WORD),
    ]

for i in range(num_devs):
    caps = WAVEINCAPS()
    result = winmm.waveInGetDevCapsA(i, ctypes.pointer(caps), ctypes.sizeof(caps))
    if result == 0:
        print(f"Index {i}: {caps.szPname.decode('ascii', errors='ignore')}")
