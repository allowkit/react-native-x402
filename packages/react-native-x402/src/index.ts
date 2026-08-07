/**
 * react-native-x402 — batteries-included umbrella.
 *
 * Deliberate design: this package does NOT export a raw signer. The only way
 * to pay is through `createAgentPayments`, which wires every signature
 * through the PolicyGuard. Consumers who want to bypass policy must drop to
 * the low-level packages explicitly — that friction is the product.
 */
import {
  createFetchWithPayment,
  PaymentIntent,
  PolicyGuardLike,
} from '@allowkit/x402-client';
import { WalletAdapter } from '@allowkit/agent-wallet';
import { LocalPolicyGuard, PolicySchema, usdc } from '@allowkit/policy';

export { usdc } from '@allowkit/policy';
export type { PolicySchema } from '@allowkit/policy';
export type { PaymentIntent } from '@allowkit/x402-client';
export type { WalletAdapter } from '@allowkit/agent-wallet';

export interface AgentPaymentsConfig {
  wallet: WalletAdapter;
  policy: PolicySchema;
  /** Present the biometric approval sheet; resolve true only on fresh user auth. */
  onApprovalRequired: (intent: PaymentIntent, reason: string) => Promise<boolean>;
  /** Advanced: replace the built-in guard (e.g. native PolicyGuard in Phase 4). */
  policyGuard?: PolicyGuardLike;
}

export interface AgentPayments {
  /** Drop-in fetch that transparently handles HTTP 402. */
  fetchWithPayment: (input: string, init?: RequestInit) => Promise<Response>;
  /** The active guard — read-only access for dashboards/audit UI. */
  guard: PolicyGuardLike;
}

export function createAgentPayments(config: AgentPaymentsConfig): AgentPayments {
  const guard = config.policyGuard ?? new LocalPolicyGuard(config.policy);
  const fetchWithPayment = createFetchWithPayment({
    signer: config.wallet,
    policy: guard,
    onApprovalRequired: config.onApprovalRequired,
  });
  return { fetchWithPayment, guard };
}

/** A sensible starter policy: $0.25 per call, $5/day, approval above $0.10. */
export const defaultPolicy: PolicySchema = {
  perTxMax: usdc(0.25),
  dailyBudget: usdc(5),
  requireApprovalAbove: usdc(0.1),
};
