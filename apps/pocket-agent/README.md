# Pocket Agent

The reference app: x402 payments signed by **native-custody keys** — the
private key lives in the iOS Keychain (via X402Core), and JavaScript only
ever sees public keys and signatures, bridged over JSI by a Nitro module.

Current milestone build (Solana devnet):

```
App.tsx → react-native-x402 (PolicyGuard + hardening)
        → @allowkit/agent-wallet/bridge → @x402/svm (official scheme)
        → NativeSolanaSigner (kit TransactionPartialSigner)
        → Nitro HybridObject (specs/X402Signer.nitro.ts)
        → HybridX402Signer.swift → X402Core (Keychain ed25519)
```

## Run it

```bash
# host terminal 1 — the paid endpoint
cd ../first-payment && npm run seller

# host terminal 2 — metro
npm start

# host terminal 3 — build & launch (or use Xcode)
npm run ios
```

Fund the wallet address shown on screen with devnet USDC
(https://faucet.circle.com → Solana Devnet), then tap **Pay $0.01**.

## Native build notes

- Nitro codegen: `../../node_modules/.bin/nitrogen` regenerates
  `nitrogen/generated` after editing `specs/*.nitro.ts`; then
  `bundle exec ruby ios/add_nitro_files.rb && bundle exec pod install`
  (with `LANG=en_US.UTF-8`).
- `ios/X402Signer/` holds a VENDORED copy of X402Core trimmed to
  ed25519 + Keychain + Secure Enclave. secp256k1 (EVM) remains in the SPM
  package (`native/x402-core-swift`) until libsecp256k1 is vendored for
  CocoaPods — that lands with the EVM-native milestone.
- On-device inference (react-native-litert-lm / react-native-leap driving the
  payments as agent tool-calls) is the next Pocket Agent phase.
