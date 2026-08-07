# License

This repository contains packages under two licenses. Each package directory
contains its own `LICENSE` / `LICENSE.md` file, which is authoritative for the
code in that directory.

| Path | License |
|---|---|
| `packages/x402-client/` | [Apache-2.0](packages/x402-client/LICENSE) |
| `packages/react-native-x402/` | [Apache-2.0](packages/react-native-x402/LICENSE) |
| `native/x402-core-swift/` | [Apache-2.0](native/x402-core-swift/LICENSE) |
| `native/x402-core-kotlin/` | [Apache-2.0](native/x402-core-kotlin/LICENSE) |
| `packages/agent-wallet/` | [FSL-1.1-ALv2](packages/agent-wallet/LICENSE.md) |
| `packages/policy/` | [FSL-1.1-ALv2](packages/policy/LICENSE.md) |
| everything else (docs, examples, conformance vectors, CI) | Apache-2.0 |

## In plain terms

- The **protocol client, umbrella package, and native custody cores are
  Apache-2.0** — use them for anything.
- The **agent-wallet and policy packages are Functional Source License
  (FSL-1.1-ALv2)**: free to use, modify, and redistribute for any purpose
  except offering a competing commercial product or service. Each release
  automatically converts to **Apache-2.0 two years after publication**.
  See [fsl.software](https://fsl.software) for the license text and rationale.

Copyright 2026 Hugh Chen.
