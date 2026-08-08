require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "X402SignerModule"
  s.version      = package["version"]
  s.summary      = "Nitro-bridged native custody for x402 (X402Core: Keychain ed25519 + Secure Enclave)"
  s.homepage     = "https://github.com/allowkit/react-native-x402"
  s.license      = "Apache-2.0"
  s.authors      = { "Hugh Chen" => "seal09@gmail.com" }
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/allowkit/react-native-x402.git" }

  s.source_files = [
    "ios/X402Signer/**/*.swift",
  ]

  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
  }

  load "nitrogen/generated/ios/X402SignerModule+autolinking.rb"
  add_nitrogen_files(s)

  install_modules_dependencies(s)
end
