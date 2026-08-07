# Security Policy

This project handles cryptographic keys and payment authorizations. We take reports seriously and respond fast.

## Reporting a vulnerability

- Email **security@allowkit.com** with a description, reproduction steps, and impact assessment.
- Please do **not** open public GitHub issues or discuss suspected vulnerabilities in public channels before a fix ships.
- You will receive an acknowledgment within 48 hours and a triage decision within 7 days.
- We follow coordinated disclosure: we ask for up to 90 days to ship a fix before public disclosure, and we will credit reporters (or keep you anonymous, your choice).

## Scope

In scope: everything in `packages/` and `native/` — key handling, policy enforcement, biometric gating, payment payload construction, and the supply chain of published artifacts (npm packages are published with provenance from GitHub Actions).

Out of scope: the x402 protocol specification itself (report upstream at [x402-foundation/x402](https://github.com/x402-foundation/x402)), facilitator services, and third-party wallet providers reachable through adapters.

## Supported versions

Pre-1.0: only the latest published minor receives fixes.
