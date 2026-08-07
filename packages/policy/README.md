# @allowkit/policy

Deterministic spending policy for autonomous agents — the single choke point in front of every signer in [react-native-x402](https://github.com/allowkit/react-native-x402).

`LocalPolicyGuard` evaluates every `PaymentIntent` against a declarative schema — per-transaction cap, rolling 24h budget, payee/network allowlists, human-approval threshold — returning `allow | deny | escalate` and appending to an audit log. Policy is enforced *outside the model*: the agent never holds a raw signing function.

```ts
import { LocalPolicyGuard, usdc } from '@allowkit/policy';

const guard = new LocalPolicyGuard({
  perTxMax: usdc(0.25),
  dailyBudget: usdc(5),
  requireApprovalAbove: usdc(0.1),
  payeeAllowlist: ['0xYourKnownSeller…'],
});
```

The TypeScript implementation is the reference; evaluation migrates into native cores (Secure Enclave / StrongBox-backed) so a compromised JS bundle cannot patch the guard — the interface here is frozen so that migration is invisible to consumers. On-chain caps (session-key limits on Base, Swig roles on Solana) are the hard backstop above this layer.

License: FSL-1.1-ALv2 (converts to Apache-2.0 two years after each release — [fsl.software](https://fsl.software)).
