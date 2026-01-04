## Architecture Guardrails (Family Voice Bridge) — Vendor-Open + Performance-Focused

### Goal
Minimize user-perceived latency for ZH→EN and EN→ZH voice translation while maintaining deterministic reliability.

### Vendor policy (UPDATED)
1) Vendor choice is OPEN.
   - Cursor should research and propose the best option(s) for:
     - ASR (speech-to-text),
     - Translation (text-to-text),
     - Optional: integrated speech-to-speech realtime.
   - Must present 2–3 options with pros/cons, integration complexity, and latency expectations.

2) Cost constraint (hard requirement)
   - Cursor must only recommend changes that do NOT increase expected cost for typical usage,
     OR must provide a cheaper-tier alternative that meets the latency goal.
   - Cursor must cite current pricing from official sources for any recommended vendor/model.
   - If no option is strictly cost-neutral, propose the lowest-cost speedup path and quantify tradeoffs.

3) Abstraction requirement
   - Implement provider-agnostic interfaces:
     - ASRProvider.transcribe(audio) -> text
     - TranslationProvider.translate(text, src_lang, tgt_lang) -> text
     - (Optional) RealtimeProvider.speech_to_speech(stream_in) -> stream_out
   - Keep existing Student Portal adapters as one implementation, but do not hardcode them.

### Frontend audio & TTS (UPDATED)
1) Default playback strategy
   - Cursor must evaluate Web Speech API TTS vs vendor TTS vs realtime speech-to-speech:
     - Web Speech API is simplest and often low-latency/cost-free.
     - Vendor TTS may reduce “robotic voice” or enable streaming audio chunks.
     - Realtime speech-to-speech may minimize end-to-end latency (but must meet cost constraint).

2) UI progress must not depend on vendor
   - UI must show states: recording → transcribing → translating → playing → waiting-for-respond.
   - These states should be driven by local state machine + backend events (not LLM output).

### Product behavior changes (already approved)
- Partner reply capture is button-gated:
  - After English playback, show “对方回复 / Respond”.
  - Only after click do we start listening for partner reply (10s max).
- English translation replay:
  - Show “重复翻译 / Repeat”.
  - Repeat replays the cached English output instantly (no re-translation on hot path).

### Non-negotiable architecture principles
1) Deterministic flow is NOT controlled by the LLM.
   - State transitions and “what happens next” are code-driven.
2) Hot path vs cold path separation.
   - Hot path: translate + playback ASAP.
   - Cold path: logging/tagging/summaries after playback starts/completes.
3) Streaming-first internal transport.
   - Prefer WebSocket/WebRTC/event-driven streaming between browser and backend to reduce “black box wait.”
4) Bounded context.
   - Keep translation prompts minimal; do not send unbounded history.

### Required measurement plan (so we optimize the right thing)
- Instrument and log per turn:
  - upload_time, asr_time, translation_time, tts_start_delay, time_to_first_audio
- Use these metrics to decide whether to:
  - switch providers/models,
  - enable streaming,
  - change protocol (WebSocket/WebRTC),
  - or restructure hot path.
