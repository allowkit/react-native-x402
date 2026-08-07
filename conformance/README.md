# Conformance

Shared test vectors that all three surfaces (TypeScript, Swift, Kotlin) must pass.

- `vectors/` will hold JSON vectors for the `exact` scheme on `eip155` (EIP-3009
  typed-data digests → expected signatures for known keys) and `solana`
  (partial-signed transaction layouts, Memo nonce rules), plus PolicyGuard
  decision tables (schema + intent → expected allow/deny/escalate).
- Vectors are sourced from, and contributed back to, the official
  [x402-foundation/x402](https://github.com/x402-foundation/x402) conformance
  suite — mobile-specific vectors are part of this project's upstream work.

Lands in Phase 1.
