/**
 * Seller: the OFFICIAL x402 stack (@x402/express middleware + x402.org
 * facilitator), so the buyer side is tested against the canonical
 * implementation, not our own mock.
 */
import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/http';
import { loadOrCreateAccount } from './keys.ts';

const seller = loadOrCreateAccount('.seller-key');
const NETWORK = 'eip155:84532'; // Base Sepolia
const PORT = 4021;

const facilitator = new HTTPFacilitatorClient({ url: 'https://x402.org/facilitator' });
const server = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());

const app = express();
app.use(
  paymentMiddleware(
    {
      'GET /api/insight': {
        accepts: {
          scheme: 'exact',
          price: '$0.01',
          network: NETWORK,
          payTo: seller.address,
        },
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
  console.log(`[seller] payTo (Base Sepolia): ${seller.address}`);
  console.log(`[seller] price: $0.01 USDC via x402.org facilitator`);
});
