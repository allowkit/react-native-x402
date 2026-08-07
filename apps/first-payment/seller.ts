/**
 * Seller: the OFFICIAL x402 stack (@x402/express middleware + x402.org
 * facilitator), offering ONE endpoint payable on TWO networks —
 * Base Sepolia (EVM) and Solana devnet (SVM). The client picks the rail.
 */
import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { ExactSvmScheme } from '@x402/svm/exact/server';
import { SOLANA_DEVNET_CAIP2 } from '@x402/svm';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { loadOrCreateAccount, loadOrCreateSolanaSigner } from './keys.ts';

const sellerEvm = loadOrCreateAccount('.seller-key');
const sellerSvm = await loadOrCreateSolanaSigner('.seller-solana-key');

const EVM_NETWORK = 'eip155:84532'; // Base Sepolia
const PORT = 4021;

const facilitator = new HTTPFacilitatorClient({ url: 'https://x402.org/facilitator' });
const server = new x402ResourceServer(facilitator)
  .register(EVM_NETWORK, new ExactEvmScheme())
  // No rpcUrl: embedding a recentBlockhash in `extra` breaks stateless
  // requirements matching (fresh blockhash per request); the client resolves
  // its own blockhash instead.
  .register(SOLANA_DEVNET_CAIP2, new ExactSvmScheme());

const app = express();
app.use(
  paymentMiddleware(
    {
      'GET /api/insight': {
        accepts: [
          { scheme: 'exact', price: '$0.01', network: EVM_NETWORK, payTo: sellerEvm.address },
          { scheme: 'exact', price: '$0.01', network: SOLANA_DEVNET_CAIP2, payTo: sellerSvm.address },
        ],
        description: 'One machine-priced insight',
      },
    },
    server
  )
);

app.get('/api/insight', (_req, res) => {
  res.json({
    insight: 'the fee is the product',
    paidAt: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[seller] listening on http://localhost:${PORT}`);
  console.log(`[seller] payTo (Base Sepolia):  ${sellerEvm.address}`);
  console.log(`[seller] payTo (Solana devnet): ${sellerSvm.address}`);
  console.log(`[seller] price: $0.01 USDC on either network, via x402.org facilitator`);
});
