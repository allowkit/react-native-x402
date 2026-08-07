# @allowkit/agent-wallet

The wallet layer of [react-native-x402](https://github.com/allowkit/react-native-x402): signer interfaces, the multichain bridge over the official `@x402` packages, and (in development) Nitro-bridged native custody.

## `@allowkit/agent-wallet/bridge`

`createOfficialBridge` adapts the official x402 client stack to the allowkit `PaymentSigner`/`X402Codec` contracts, for both rails:

- **EVM** (`eip155:*`) — EIP-3009 typed-data signing via `@x402/evm`, from any viem-shaped account (`address` + `signTypedData`)
- **Solana** (`solana:*`) — partial-signed transactions with the facilitator as fee payer via `@x402/svm`, from any `@solana/kit` `TransactionSigner`

It also enforces signer-level quote binding: the accepts array is narrowed to exactly the requirement the PolicyGuard approved, and the signed payload is checked against the approved intent before it leaves the wallet.

## Invariants

Raw private key bytes never cross the JS boundary. The native custody modules (Secure Enclave / StrongBox P-256, natively-held secp256k1/ed25519, keystore-bound biometric gating) implement the `SecureSignerSpec` / `SoftKeySignerSpec` / `SecureStoreSpec` interfaces exported here and land via Nitro modules.

License: FSL-1.1-ALv2 (converts to Apache-2.0 two years after each release — [fsl.software](https://fsl.software)).
