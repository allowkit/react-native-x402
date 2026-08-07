/** Persist throwaway testnet keys next to this example so funding survives reruns. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));

export function loadOrCreateAccount(name: '.buyer-key' | '.seller-key') {
  const path = join(here, name);
  let pk: `0x${string}`;
  if (existsSync(path)) {
    pk = readFileSync(path, 'utf8').trim() as `0x${string}`;
  } else {
    pk = generatePrivateKey();
    writeFileSync(path, pk, { mode: 0o600 });
  }
  return privateKeyToAccount(pk);
}
