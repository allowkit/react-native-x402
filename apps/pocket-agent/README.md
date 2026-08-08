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

## Running on a physical device

The simulator cannot execute the strongest path in this stack — biometry-bound
Secure Enclave keys fail there with LocalAuthentication `-1020`
("not supported on iOS Simulator"). Real hardware is required to exercise
enclave attestation.

1. iPhone: **Settings → Privacy & Security → Developer Mode → On** (restarts).
2. Xcode: **Settings → Accounts** — sign in with the Apple ID that owns the
   personal team; then **Signing & Capabilities → Team**. A free personal team
   cannot claim an arbitrary bundle id, hence `com.hughchen.pocketagent`.
3. Build and install:
   ```bash
   xcodebuild -workspace PocketAgent.xcworkspace -scheme PocketAgent \
     -destination 'id=<device-udid>' -derivedDataPath build-device \
     -allowProvisioningUpdates DEVELOPMENT_TEAM=<team> build
   xcrun devicectl device install app --device <device-udid> \
     build-device/Build/Products/Debug-iphoneos/PocketAgent.app
   ```
   (`DEVELOPMENT_TEAM` is passed at build time on purpose — it is not
   committed to this repo.)
4. iPhone: trust the certificate under **General → VPN & Device Management**.
5. The app announces its wallet address to the seller's terminal on launch
   (`/debug/whoami`) — a device build has no shared console with the Mac.
   Fund that address at https://faucet.circle.com (Solana Devnet).

### Three things only real hardware revealed

- **Biometry-bound enclave keys are simulator-forbidden** (`-1020`). The app
  reports its approval mode and degrades to an LAContext boolean in the
  simulator — clearly labelled "weak mode", because JS decides after a boolean.
- **Biometric signing must be async.** A synchronous JSI call blocks the JS
  thread while the OS tries to present the Face ID UI; the watchdog then kills
  the app after 60s. `signEnclaveDigest` returns a `Promise`.
- **`NSFaceIDUsageDescription` is mandatory.** Without it iOS terminates the
  process via TCC the instant Face ID is touched — invisible in the simulator,
  which never reaches that code path.
