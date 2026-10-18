# Atlas persistent voice implementation plan
> For agentic workers: execute natively using superpowers:executing-plans.

Goal: one forehead tap starts Anders and the same conversation follows workspace navigation.
Architecture: extract the accepted session hook, mount once in the authenticated Atlas runtime, display a nonmodal/minimizable panel. Reuse the shared conversation and existing server tool/approval paths.
Tech stack: existing Next/React, WebAudio/worklet/Silero, governed ElevenLabs.
Spec: docs/superpowers/specs/2026-10-17-atlas-persistent-voice-design.md

Global constraints: no mount/URL auto-start; unchanged voice authority/cost caps; no paid probes; no new dependencies; no scope rebinding on navigation.

Review focus: stale input after thread switch; navigation during tool/TTS events; first tap before voice lookup completes; duplicate taps during permission prompts; build and costs available while minimized without restarting input.

- [x] Add native real-audio tests for measured star click, route continuity and cancel/restart; observe failures against production base.
- [ ] Extract useAtlasVoiceSession from voice-trial, preserving the accepted lifecycle and trial UI. Expose start/toggle/stop/correction, state and text submission. Add synchronous opening guard and voice-lookup readiness.
- [ ] Mount hook in runtime using the shared controller, selected project only for a new conversation, and existing navigation/tool event interpretation. Add panel, minimization, build and authorized project/cost links. Fix mobile face hit geometry; route all voice controls through activate.
- [ ] Test shared spoken turns across navigation, build opening, cancellation, signout, permissions and thread replacement. Run focused unit/type checks and accepted voice Native suite with frozen source.
- [ ] Fresh independent code review, resolve findings, run required CI, normal merge and exact-production verification.
