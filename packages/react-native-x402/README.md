# react-native-x402

**x402 payments for React Native AI agents — spending policy, security hardening, and multichain signing, batteries included.**

Give an in-app agent a budget it cryptographically cannot exceed, then let it pay per-call for APIs over [x402](https://x402.org) (USDC on Base and Solana).

```ts
import { createAgentPayments, usdc } from 'react-native-x402';
import { createOfficialBridge } from '@allowkit/agent-wallet/bridge';

const bridge = createOfficialBridge({ evmAccount, svmSigner, networks: ['eip155:8453'] });

const { fetchWithPayment } = createAgentPayments({
  wallet: bridge.signer,
  codec: bridge.codec,
  policy: { perTxMax: usdc(0.25), dailyBudget: usdc(5), requireApprovalAbove: usdc(0.1) },
  onApprovalRequired: async (intent, reason) => showBiometricSheet(intent, reason),
});

// hand fetchWithPayment to your agent's tools — every payment passes the PolicyGuard
const res = await fetchWithPayment('https://api.example.com/insight');
```

Every payment flows through a single choke point: `PolicyGuard.evaluate → allow | deny | escalate`, with per-call caps, rolling budgets, payee allowlists, human-approval escalation, and an audit log. Protocol encoding and scheme signing delegate to the official `@x402/*` packages — this stack adds the mobile platform layer, never a protocol re-implementation. Client-side hardening (quote binding, freshness windows, replay refusal) follows the 2026 x402 security literature.

**Status: early (0.1.x).** Both rails settle on testnets today (Base Sepolia + Solana devnet — see the [runnable example](https://github.com/allowkit/react-native-x402/tree/main/apps/first-payment) with real settlement txs). Native custody (Secure Enclave / StrongBox via Nitro modules) and biometric key-gating are in active development. Do not hold meaningful funds yet.

Monorepo, design rules, and security policy: [github.com/allowkit/react-native-x402](https://github.com/allowkit/react-native-x402). License: Apache-2.0 (this package).
