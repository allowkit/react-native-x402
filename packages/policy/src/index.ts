/**
 * @allowkit/policy — deterministic spending policy, enforced OUTSIDE the model.
 *
 * Design rules (see repo README):
 * - This is the single choke point: signers are only reachable through a
 *   PolicyGuard. The agent/LLM never holds a raw signing function.
 * - This TypeScript implementation is Phase-0/1. The evaluation logic
 *   migrates into the native cores (x402-core-swift / -kotlin) in Phase 4 so
 *   a compromised JS bundle cannot patch the guard; the interface is frozen
 *   here so that migration is invisible to consumers.
 * - On-chain caps (session-key limits on Base, Swig roles on Solana) are the
 *   hard backstop ABOVE this layer, set ~2x looser than the local policy.
 */
import {
  PaymentIntent,
  PolicyDecision,
  PolicyGuardLike,
  parseAtomicAmount,
} from '@allowkit/x402-client';

/** Declarative policy. All amounts are atomic units of the budget asset (e.g. USDC 6dp). */
export interface PolicySchema {
  /** Hard per-payment maximum. Payments above this are DENIED outright. */
  perTxMax: bigint;
  /** Rolling 24h budget. Exceeding it denies until the window rolls. */
  dailyBudget: bigint;
  /** Payments above this (but under perTxMax) ESCALATE to human approval. */
  requireApprovalAbove: bigint;
  /** If non-empty, only these payTo addresses may be paid without escalation. */
  payeeAllowlist?: string[];
  /** If non-empty, only these CAIP-2 networks are allowed at all. */
  networkAllowlist?: string[];
}

/** Where budget consumption is remembered. MemoryBudgetStore for dev; back with
 *  native SecureStore in production so counters are tamper-resistant. */
export interface BudgetStore {
  spentSince(sinceMs: number): Promise<bigint>;
  record(amount: bigint, atMs: number): Promise<void>;
}

export class MemoryBudgetStore implements BudgetStore {
  private entries: { amount: bigint; atMs: number }[] = [];

  async spentSince(sinceMs: number): Promise<bigint> {
    return this.entries
      .filter((e) => e.atMs >= sinceMs)
      .reduce((sum, e) => sum + e.amount, 0n);
  }

  async record(amount: bigint, atMs: number): Promise<void> {
    this.entries.push({ amount, atMs });
    // keep only the trailing 48h to bound memory
    const cutoff = atMs - 48 * 3600_000;
    this.entries = this.entries.filter((e) => e.atMs >= cutoff);
  }
}

export interface AuditEntry {
  atMs: number;
  decision: PolicyDecision['kind'];
  reason?: string;
  resource: string;
  network: string;
  payTo: string;
  amount: string;
}

export class LocalPolicyGuard implements PolicyGuardLike {
  private readonly audit: AuditEntry[] = [];

  constructor(
    private readonly schema: PolicySchema,
    private readonly budget: BudgetStore = new MemoryBudgetStore(),
    private readonly now: () => number = Date.now
  ) {}

  auditLog(): readonly AuditEntry[] {
    return this.audit;
  }

  async evaluate(intent: PaymentIntent): Promise<PolicyDecision> {
    const decision = await this.decide(intent);
    const r = intent.requirements;
    this.audit.push({
      atMs: this.now(),
      decision: decision.kind,
      ...(decision.kind === 'allow' ? {} : { reason: decision.reason }),
      resource: intent.resource,
      network: r.network,
      payTo: r.payTo,
      amount: r.amount,
    });
    return decision;
  }

  private async decide(intent: PaymentIntent): Promise<PolicyDecision> {
    const { schema } = this;
    const r = intent.requirements;
    const amount = parseAtomicAmount(r.amount);

    if (schema.networkAllowlist?.length && !schema.networkAllowlist.includes(r.network)) {
      return { kind: 'deny', reason: `network ${r.network} is not allowlisted` };
    }
    if (amount > schema.perTxMax) {
      return { kind: 'deny', reason: `amount ${r.amount} exceeds perTxMax ${schema.perTxMax}` };
    }

    const dayStart = this.now() - 24 * 3600_000;
    const spent = await this.budget.spentSince(dayStart);
    if (spent + amount > schema.dailyBudget) {
      return {
        kind: 'deny',
        reason: `daily budget exhausted (spent ${spent} + ${amount} > ${schema.dailyBudget})`,
      };
    }

    const payeeUnknown =
      schema.payeeAllowlist !== undefined &&
      schema.payeeAllowlist.length > 0 &&
      !schema.payeeAllowlist.includes(r.payTo);
    if (payeeUnknown) {
      return { kind: 'escalate', reason: `payee ${r.payTo} is not on the allowlist` };
    }
    if (amount > schema.requireApprovalAbove) {
      return { kind: 'escalate', reason: `amount ${r.amount} above approval threshold` };
    }

    return { kind: 'allow' };
  }

  async record(intent: PaymentIntent): Promise<void> {
    await this.budget.record(parseAtomicAmount(intent.requirements.amount), this.now());
  }
}

/** Convenience: USDC (6 decimals) helpers so budgets read naturally. */
export const usdc = (dollars: number): bigint => BigInt(Math.round(dollars * 1e6));
