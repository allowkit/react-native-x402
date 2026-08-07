# first-payment

Phase 0 milestone: a real x402 payment on **Base Sepolia**, where the buyer is
the full allowkit stack and the seller is the **official** x402 middleware —
so the client is proven against the canonical implementation, not a mock.

```
buyer.ts ──▶ react-native-x402 (umbrella)
              └─ PolicyGuard (allow/deny/escalate + audit log)
              └─ hardening guards (quote binding, freshness, replay refusal)
              └─ bridge.ts ──▶ @x402/core client + @x402/evm ExactEvmScheme
                                (official protocol encoding + EIP-3009 signing)
seller.ts ──▶ @x402/express paymentMiddleware ──▶ x402.org facilitator
```

## Run it

```bash
# terminal 1 — seller ($0.01 per call, official middleware)
npm run seller

# terminal 2 — buyer (allowkit stack)
npm run buyer
```

First run generates throwaway testnet keys (`.buyer-key` / `.seller-key`,
gitignored). The buyer will reach the facilitator and be rejected with
`invalid_exact_evm_insufficient_balance` — fund the printed buyer address with
testnet USDC (free): https://faucet.circle.com → network **Base Sepolia** →
paste the buyer address, then re-run `npm run buyer`.

On success you get HTTP 200, the paid JSON body, the settlement response
(transaction hash), and the policy audit log showing the ALLOW decision.
