/**
 * A @solana/kit TransactionSigner whose ed25519 key lives in the iOS
 * Keychain via X402Core — the private key never enters JavaScript.
 *
 * This is what plugs into the official @x402/svm scheme: kit calls
 * `signTransactions`, we hand the compiled message bytes to native,
 * and native returns only the 64-byte signature.
 */
import { address, getBase58Decoder, type Address, type SignatureBytes, type TransactionPartialSigner } from '@solana/kit';
import { nativeSigner, toHex, fromHex } from './nativeSigner';

const ALIAS = 'pocket-agent-solana';

export interface NativeSolanaSigner extends TransactionPartialSigner {
  readonly alias: string;
}

/** Load-or-create the native ed25519 key and wrap it as a kit signer. */
export function createNativeSolanaSigner(): NativeSolanaSigner {
  let pubHex = nativeSigner.softPublicKey(ALIAS);
  if (!pubHex) {
    pubHex = nativeSigner.generateSoftKey(ALIAS, 'ed25519');
  }
  const pubkeyBytes = fromHex(pubHex);
  const addr: Address = address(getBase58Decoder().decode(pubkeyBytes));

  return {
    alias: ALIAS,
    address: addr,
    signTransactions: async (transactions) =>
      transactions.map((tx) => {
        const sigHex = nativeSigner.signSoftMessage(ALIAS, toHex(new Uint8Array(tx.messageBytes)));
        return { [addr]: fromHex(sigHex) as SignatureBytes } as Record<Address, SignatureBytes>;
      }),
  };
}
