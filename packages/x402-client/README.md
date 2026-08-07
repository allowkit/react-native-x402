# @allowkit/x402-client

The x402 protocol client core of [react-native-x402](https://github.com/allowkit/react-native-x402): the `fetchWithPayment` loop (402 → parse → **policy** → sign → retry), spec-aligned types, and client-side security hardening — quote binding, freshness windows, and replay refusal, per the 2026 x402 audit literature (arXiv 2605.11781, 2607.19545).

Protocol encoding is delegated to a pluggable `X402Codec`; the production codec wraps the official `@x402/core` HTTP utilities (see `@allowkit/agent-wallet/bridge`). This package never re-implements the wire format — it owns the policy choke point.

Most apps should use the batteries-included [`react-native-x402`](https://www.npmjs.com/package/react-native-x402) umbrella instead of this package directly. Use this directly when you bring your own wallet/policy stack and only want the hardened client loop.

License: Apache-2.0.
