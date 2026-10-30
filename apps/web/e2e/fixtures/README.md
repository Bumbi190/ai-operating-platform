# Voice activity fixture

`voice-question.wav` was generated locally with Windows System.Speech on 2026-10-16 (default installed voice, rate 2): “Can you help me make a plan?” No customer recording or paid provider is used.

The browser fixture sends this waveform through a native MediaStream, AudioContext, AudioWorklet, the deployed resampler, and the actual pinned Silero V5 model. Seeded white room noise is mixed into the input. The quiet case scales speech to 0.015 and noise to 0.0001; normal speech uses 0.4 and noise 0.002. Transcription, chat and returned TTS audio remain simulated. This verifies local detection and lifecycle, not Swedish recognition accuracy, physical mobile playback, or live-provider latency.
