/**
 * Buyer: OUR stack end to end — react-native-x402 umbrella wiring the
 * PolicyGuard, hardening guards, and the official-package bridge.
 *
 *   agent code → fetchWithPayment → PolicyGuard → bridge signer → @x402/evm | @x402/svm
 *
 * Pick the rail:  npm run buyer            (Base Sepolia / EVM)
 *                 npm run buyer:solana     (Solana devnet / SVM)
 */
import { createAgentPayments, usdc } from 'react-native-x402';
import { LocalPolicyGuard } from '@allowkit/policy';
import { SOLANA_DEVNET_CAIP2 } from '@x402/svm';
import { createOfficialBridge } from './bridge.ts';
import { loadOrCreateAccount, loadOrCreateSolanaSigner } from './keys.ts';

const EVM_NETWORK = 'eip155:84532';
const mode = process.env.NETWORK === 'solana' ? 'solana' : 'evm';
const networks = mode === 'solana' ? [SOLANA_DEVNET_CAIP2] : [EVM_NETWORK];

const bridge = createOfficialBridge({
  evmAccount: loadOrCreateAccount('.buyer-key') as never,
  svmSigner: await loadOrCreateSolanaSigner('.buyer-solana-key'),
  networks,
});

const guard = new LocalPolicyGuard({
  perTxMax: usdc(0.25),
  dailyBudget: usdc(5),
  requireApprovalAbove: usdc(0.1),
});

const { fetchWithPayment } = createAgentPayments({
  wallet: bridge.signer,
  policy: { perTxMax: usdc(0.25), dailyBudget: usdc(5), requireApprovalAbove: usdc(0.1) },
  policyGuard: guard,
  codec: bridge.codec,
  onApprovalRequired: async (_intent, reason) => {
    console.log(`[buyer] APPROVAL REQUESTED (${reason}) — auto-approving in demo`);
    return true;
  },
});

console.log(`[buyer] rail: ${mode}  (networks: ${networks.join(', ')})`);
console.log(`[buyer] evm address:    ${bridge.addresses['eip155']}`);
console.log(`[buyer] solana address: ${bridge.addresses['solana']}`);
console.log('[buyer] requesting paid endpoint…');

try {
  const res = await fetchWithPayment('http://localhost:4021/api/insight');
  console.log(`[buyer] response: HTTP ${res.status}`);

  if (res.ok) {
    console.log('[buyer] body:', await res.json());
    const settle = bridge.getSettlement(res);
    if (settle) console.log('[buyer] settlement:', JSON.stringify(settle));
    console.log('\n=== X402 PAYMENT COMPLETE ===');
  } else {
    console.log('[buyer] body:', await res.text());
    const prHeader = res.headers.get('PAYMENT-REQUIRED');
    if (prHeader) {
      try {
        const detail = JSON.parse(Buffer.from(prHeader, 'base64').toString('utf8'));
        console.log('[buyer] server error detail:', detail.error ?? JSON.stringify(detail).slice(0, 200));
      } catch { /* header not base64 JSON — ignore */ }
    }
    const fundAddr = mode === 'solana' ? bridge.addresses['solana'] : bridge.addresses['eip155'];
    const fundNet = mode === 'solana' ? 'Solana Devnet' : 'Base Sepolia';
    console.log(`\n[buyer] Payment did not settle. Most likely cause: no ${fundNet} USDC.`);
    console.log(`[buyer] Fund it (free, ~30s): https://faucet.circle.com → "${fundNet}"`);
    console.log(`[buyer] address: ${fundAddr}`);
  }
} catch (err) {
  console.error('[buyer] error:', (err as Error).message);
  process.exitCode = 1;
}

console.log('\n[buyer] policy audit log:');
for (const entry of guard.auditLog()) {
  console.log(
    `  ${new Date(entry.atMs).toISOString()}  ${entry.decision.toUpperCase()}  ` +
      `${entry.amount} atomic → ${entry.payTo.slice(0, 10)}…  (${entry.resource})` +
      (entry.reason ? `  [${entry.reason}]` : '')
  );
}
