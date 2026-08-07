/**
 * One-time devnet setup: the exact SVM scheme emits a bare TransferChecked,
 * so the SELLER's USDC associated token account must already exist (real
 * sellers have one; a fresh keypair doesn't). This script airdrops devnet SOL
 * to the seller and creates its USDC ATA (idempotent — safe to re-run).
 */
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
  lamports,
  pipe,
} from '@solana/kit';
import { getCreateAssociatedTokenIdempotentInstructionAsync } from '@solana-program/token';
import { USDC_DEVNET_ADDRESS } from '@x402/svm';
import { loadOrCreateSolanaSigner } from './keys.ts';

const rpc = createSolanaRpc('https://api.devnet.solana.com');
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.devnet.solana.com');
const seller = await loadOrCreateSolanaSigner('.seller-solana-key');

console.log('[setup] seller:', seller.address);

const balance = await rpc.getBalance(seller.address).send();
if (Number(balance.value) < 5_000_000) {
  console.log('[setup] airdropping 0.5 devnet SOL to seller…');
  const sig = await rpc.requestAirdrop(seller.address, lamports(500_000_000n)).send();
  console.log('[setup] airdrop sig:', sig);
  // wait for it to land
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const b = await rpc.getBalance(seller.address).send();
    if (Number(b.value) >= 5_000_000) break;
  }
}
console.log('[setup] seller SOL:', Number((await rpc.getBalance(seller.address).send()).value) / 1e9);

const ix = await getCreateAssociatedTokenIdempotentInstructionAsync({
  payer: seller,
  mint: USDC_DEVNET_ADDRESS,
  owner: seller.address,
});

const { value: blockhash } = await rpc.getLatestBlockhash().send();
const tx = await signTransactionMessageWithSigners(
  pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(seller, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([ix], m)
  )
);

await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(tx, { commitment: 'confirmed' });
console.log('[setup] seller USDC ATA created (tx:', getSignatureFromTransaction(tx), ')');
