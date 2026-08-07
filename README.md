# react-native-x402

**x402 payments for mobile: on-device custody, spending policy, and human approval for AI agents.**

The [x402 protocol](https://x402.org) lets clients pay per-call for APIs and services over HTTP 402. The official SDKs cover servers and web clients (TypeScript, Python, Go). This project builds the **mobile platform layer** — the parts that are native code, not JavaScript:

- **On-device keys** — Secure Enclave / StrongBox (P-256) and natively-held secp256k1/ed25519 software keys. Private keys never enter the JS runtime.
- **Spending policy** — per-call caps, rolling budgets, payee/facilitator allowlists, enforced *outside the model* in a single choke point (`PolicyGuard`) that every signature must pass through.
- **Human-in-the-loop** — biometric approval bound to keystore access-control flags: the OS itself refuses to release the over-threshold signing key without fresh Face ID / fingerprint. A compromised JS layer cannot skip the human.
- **Both major x402 networks** — Base (USDC via EIP-3009) and Solana (partial-signed transactions, facilitator as fee payer).
- **Any AI runtime** — payments are exposed as a standard tool call; works with llama.rn, react-native-executorch, @react-native-ai/apple, react-native-litert-lm, react-native-leap, or a cloud model.

> **Status: pre-release scaffold (v0.0.x).** APIs will change. Do not hold meaningful funds with this code yet.

## Packages

| Package | What it is | License |
|---|---|---|
| `@allowkit/x402-client` | Protocol client: 402 handshake, payment construction, security hardening. Thin layer over the official `@x402/*` packages — no protocol re-implementation. | Apache-2.0 |
| `@allowkit/agent-wallet` | Wallet layer: signer interfaces, Nitro-bridged native custody, wallet adapters (CDP, Privy, Turnkey, MWA, local). | FSL-1.1-ALv2 |
| `@allowkit/policy` | `PolicyGuard`, budget accounting, approval escalation. | FSL-1.1-ALv2 |
| `react-native-x402` | Batteries-included umbrella. Policy is default-on; no raw signer is exported. | Apache-2.0 |
| `native/x402-core-swift` | SwiftPM library: SecureSigner, SoftKeySigner, SecureStore, BiometricGate. Usable from any iOS app, no React Native required. | Apache-2.0 |
| `native/x402-core-kotlin` | The same four modules for Android (Keystore / StrongBox / BiometricPrompt). | Apache-2.0 |

FSL packages convert to Apache-2.0 two years after each release ([fsl.software](https://fsl.software)).

## Design rules

1. **Keys never cross the bridge.** JS orchestrates and receives only public keys and signatures.
2. **One choke point.** The only path to any signer is `PolicyGuard.evaluate(intent) → allow | deny | escalate`.
3. **Defense in depth.** Local policy is fine-grained and fast; on-chain caps (session-key limits on Base, Swig roles on Solana) are the hard backstop set looser above it.
4. **Verify what you sign.** Quoted price must equal signed amount; payTo and resource are bound; validity windows enforced; payloads are idempotency-cached. (See the 2026 x402 security literature.)
5. **Reuse the standard.** Protocol encoding comes from the official x402 packages and conformance vectors — this repo adds custody, policy, and platform integration only.

## Security

See [SECURITY.md](SECURITY.md). Please do not open public issues for vulnerabilities.

## License

Per-package — see the table above and each package's `LICENSE` file.
