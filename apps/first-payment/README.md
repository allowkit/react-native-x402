# first-payment

**Both x402 rails, one client stack.** A seller offers a single endpoint payable
on **Base Sepolia (EVM)** and **Solana devnet (SVM)**; the buyer — the full
allowkit stack — picks the rail and pays $0.01 USDC. The seller runs the
**official** x402 middleware, so the client is proven against the canonical
implementation, not a mock.

```
buyer.ts ──▶ react-native-x402 (umbrella)
              └─ PolicyGuard (allow/deny/escalate + audit log)
              └─ hardening guards (quote binding, freshness, replay refusal)
              └─ bridge.ts ──▶ @x402/core client
                                ├─ @x402/evm  ExactEvmScheme (EIP-3009 typed data)
                                └─ @x402/svm  ExactSvmScheme (partial-signed tx,
                                              facilitator pays gas)
seller.ts ──▶ @x402/express paymentMiddleware ──▶ x402.org facilitator
```

## Run it

```bash
# terminal 1 — seller ($0.01 per call on either network)
npm run seller

# terminal 2 — buyer (allowkit stack)
npm run buyer          # Base Sepolia rail
npm run buyer:solana   # Solana devnet rail
```

First run generates throwaway testnet keys (`.buyer-key`, `.seller-key`,
`.buyer-solana-key`, `.seller-solana-key` — all gitignored).

### Funding (once, free, ~1 minute at https://faucet.circle.com)

- **Base Sepolia** → USDC → the printed **buyer** EVM address
- **Solana Devnet** → USDC → the printed **buyer** Solana address, **and** the
  **seller** Solana address (funding the seller creates its USDC token
  account — see gotcha #2). Alternatively run
  `node --experimental-strip-types setup-solana.ts` when the devnet SOL
  airdrop isn't rate-limited.

On success you get HTTP 200, the paid JSON body, the settlement response with
the transaction hash, and the policy audit log showing the ALLOW decision.

## Solana gotchas we hit (so you don't)

1. **Don't configure the server-side `ExactSvmScheme` with an `rpcUrl`.**
   Doing so embeds a fresh `recentBlockhash` in the requirement's `extra` on
   every request, and the middleware's stateless matcher (advertised `extra`
   must be a subset of the echoed `extra`) then never matches → the retry
   fails with "No matching payment requirements". Omit it; the client
   resolves its own blockhash.
2. **The recipient's USDC associated token account must already exist.** The
   exact scheme emits a bare `TransferChecked` with no ATA creation, so a
   fresh payTo address fails facilitator simulation with
   `transaction_simulation_failed`. Real sellers have token accounts;
   for testing, create one (`setup-solana.ts`) or let the Circle faucet
   create it by funding the address.
