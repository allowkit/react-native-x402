# Pocket Agent (demo)

The reference app: an **on-device** model (react-native-litert-lm or
react-native-leap — LFM2.5 / Gemma 4 class) that autonomously researches a task
and pays per-call for the APIs it uses, through `react-native-x402`.

What it demonstrates, on screen:
- a budget top-up flow (onramp) and a live remaining-budget meter
- the agent deciding to call a paid endpoint, and the PolicyGuard allowing it
- an over-threshold call escalating to the biometric approval sheet
- the audit log of every allow / deny / escalate decision

Targets: Android + Solana dApp Store (Seeker) first; iOS TestFlight after org
enrollment. This app is the Colosseum hackathon entry (Sept 28 – Nov 2, 2026).

Lands in Phase 2.
