// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "X402Core",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "X402Core", targets: ["X402Core"])
    ],
    dependencies: [
        // Vetted libsecp256k1 bindings (EVM signing). CryptoKit covers P-256
        // (Secure Enclave) and Curve25519/Ed25519 (Solana) natively.
        .package(url: "https://github.com/GigaBitcoin/secp256k1.swift.git", from: "0.18.0")
    ],
    targets: [
        .target(
            name: "X402Core",
            dependencies: [
                .product(name: "P256K", package: "secp256k1.swift")
            ]
        ),
        .testTarget(name: "X402CoreTests", dependencies: ["X402Core"])
    ]
)
