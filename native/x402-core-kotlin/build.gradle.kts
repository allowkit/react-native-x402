// X402Core for Android — custody, signing, and human-approval primitives.
// Standalone library (no React Native dependency); the react-native-x402
// Nitro module wraps these types. Published to Maven Central in Phase 4.
plugins {
    id("com.android.library") version "8.5.0" apply false
    kotlin("android") version "2.0.0" apply false
}

// Phase 1: android library module configuration (minSdk 26, StrongBox where
// available, BiometricPrompt + setUserAuthenticationRequired key binding).
