/** Typed access to the native X402Signer HybridObject (see specs/X402Signer.nitro.ts). */
import { NitroModules } from 'react-native-nitro-modules';
import type { X402Signer } from '../specs/X402Signer.nitro';

export const nativeSigner: X402Signer =
  NitroModules.createHybridObject<X402Signer>('X402Signer');

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};
