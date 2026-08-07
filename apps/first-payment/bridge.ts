/**
 * The bridge between the allowkit client (policy choke point, hardening) and
 * the official @x402 packages (protocol encoding, scheme signing).
 *
 * This is the reference implementation of the "delegate, don't re-implement"
 * rule — it graduates into @allowkit/agent-wallet once stable.
 */
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import type {
  PaymentIntent,
  PaymentRequirements,
  PaymentSigner,
  SignedPayment,
  X402Codec,
} from '@allowkit/x402-client';

type WireAccept = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
};
type WirePaymentRequired = { x402Version: number; accepts: WireAccept[] };

export interface OfficialBridge {
  codec: X402Codec;
  signer: PaymentSigner & { id: string };
  address: string;
}

// account: a viem LocalAccount (address + signTypedData is all the scheme needs)
export function createOfficialBridge(
  account: { address: `0x${string}`; signTypedData: (args: never) => Promise<`0x${string}`> },
  networks: string[]
): OfficialBridge {
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: toClientEvmSigner(account as never) });
  const http = new x402HTTPClient(client);

  const codec: X402Codec = {
    async parseRequirements(response) {
      let body: unknown;
      try {
        body = await response.clone().json();
      } catch {
        body = undefined;
      }
      const pr = http.getPaymentRequiredResponse(
        (name) => response.headers.get(name),
        body
      ) as WirePaymentRequired;
      const accepts: PaymentRequirements[] = pr.accepts
        .filter((a) => a.scheme === 'exact')
        .map((a) => ({
          scheme: 'exact' as const,
          network: a.network,
          asset: a.asset,
          amount: a.amount,
          payTo: a.payTo,
          maxTimeoutSeconds: a.maxTimeoutSeconds,
          extra: a.extra,
          raw: a as unknown as Record<string, unknown>,
        }));
      return { accepts, raw: pr };
    },
    paymentHeaders(signed: SignedPayment) {
      return http.encodePaymentSignatureHeader(signed.payload as never);
    },
  };

  const signer: PaymentSigner & { id: string } = {
    id: 'viem-local',
    supportedNetworks: () => networks,
    payerAddress: async () => account.address,
    async sign(intent: PaymentIntent): Promise<SignedPayment> {
      const pr = intent.rawPaymentRequired as WirePaymentRequired;
      const chosenRaw = (intent.requirements.raw ?? intent.requirements) as unknown as WireAccept;
      // Narrow accepts to exactly what the PolicyGuard approved — the official
      // client can then only sign that one requirement.
      const narrowed = { ...pr, accepts: [chosenRaw] };
      const payload = await client.createPaymentPayload(narrowed as never);
      // Signer-level quote binding: what got signed must be what was approved.
      const accepted = (payload as { accepted: WireAccept }).accepted;
      if (
        accepted.amount !== intent.requirements.amount ||
        accepted.payTo !== intent.requirements.payTo ||
        accepted.network !== intent.requirements.network
      ) {
        throw new Error('signed payload does not match the policy-approved intent');
      }
      return { payload, network: intent.requirements.network, scheme: 'exact' };
    },
  };

  return { codec, signer, address: account.address };
}
