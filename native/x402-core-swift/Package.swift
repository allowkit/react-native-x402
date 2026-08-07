// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "X402Core",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "X402Core", targets: ["X402Core"])
    ],
    targets: [
        .target(name: "X402Core"),
        .testTarget(name: "X402CoreTests", dependencies: ["X402Core"])
    ]
)
