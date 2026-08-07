import XCTest
@testable import X402Core

final class X402CoreTests: XCTestCase {
    func testCurveIdentifiers() {
        XCTAssertEqual(SoftKeyCurve.secp256k1.rawValue, "secp256k1")
        XCTAssertEqual(SoftKeyCurve.ed25519.rawValue, "ed25519")
    }
}
