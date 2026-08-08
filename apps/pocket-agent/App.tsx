/**
 * Pocket Agent — milestone build: an x402 payment on Solana devnet signed by
 * a key that lives in the iOS Keychain (native custody, zero JS key bytes).
 *
 * Flow on screen: shows the native wallet address + policy, one button pays
 * $0.01 to the local seller (run `npm run seller` in apps/first-payment on
 * the host Mac), renders the settlement + audit log.
 */
import 'react-native-get-random-values';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createAgentPayments, usdc } from 'react-native-x402';
import { LocalPolicyGuard } from '@allowkit/policy';
import { createOfficialBridge } from '@allowkit/agent-wallet/bridge';
import { nativeSigner } from './src/nativeSigner';
import { createNativeSolanaSigner } from './src/solanaSigner';
import { requestApproval, ensureApprovalKey, approvalMode } from './src/approval';

// The simulator reaches the host Mac at localhost; a physical device needs
// its LAN address (same Wi-Fi). Probe both rather than configure by hand.
const SELLER_HOSTS = ['localhost', '192.168.4.34'];
const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

async function resolveSellerBase(): Promise<string> {
  for (const host of SELLER_HOSTS) {
    const base = `http://${host}:4021`;
    try {
      const res = await fetch(`${base}/api/insight`);
      if (res.status === 402 || res.ok) return base;
    } catch {
      // unreachable from this device — try the next candidate
    }
  }
  throw new Error(`seller unreachable (tried ${SELLER_HOSTS.join(', ')})`);
}

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sellerBase, setSellerBase] = useState<string | null>(null);
  const append = (line: string) => setLog((l) => [...l, line]);

  const world = useMemo(() => {
    const svmSigner = createNativeSolanaSigner();
    const bridge = createOfficialBridge({ svmSigner, networks: [SOLANA_DEVNET] });
    const guard = new LocalPolicyGuard({
      perTxMax: usdc(0.25),
      dailyBudget: usdc(5),
      requireApprovalAbove: usdc(0.1),
    });
    const { fetchWithPayment } = createAgentPayments({
      wallet: bridge.signer,
      policy: { perTxMax: usdc(0.25), dailyBudget: usdc(5), requireApprovalAbove: usdc(0.1) },
      policyGuard: guard,
      codec: bridge.codec,
      onApprovalRequired: async (intent, reason) => {
        setLog((l) => [...l, `ESCALATION: ${reason}`]);
        // The enclave key is biometry-bound: the OS will not produce this
        // signature without fresh Face ID, so the attestation *is* the proof
        // of human approval — and it is bound to this exact payment.
        const result = await requestApproval(intent, reason);
        if (!result) {
          setLog((l) => [...l, 'HUMAN DENIED']);
          return false;
        }
        if (result.mode === 'enclave-attestation') {
          setLog((l) => [
            ...l,
            `HUMAN APPROVED — enclave attestation ${result.attestation.signature.slice(0, 16)}…`,
            `  bound to intent ${result.attestation.intentDigest.slice(0, 16)}…`,
          ]);
        } else {
          setLog((l) => [...l, 'HUMAN APPROVED (OS prompt — weak mode)']);
        }
        return true;
      },
    });
    return { svmSigner, bridge, guard, fetchWithPayment };
  }, []);

  React.useEffect(() => {
    resolveSellerBase()
      .then((base) => {
        setSellerBase(base);
        append(`seller: ${base}`);
      })
      .catch((e) => append(`seller discovery failed: ${(e as Error).message}`));
    ensureApprovalKey();
    append(`approval: ${approvalMode()}`);
  }, []);

  const pay = useCallback(async (path: string = '/api/insight') => {
    if (!sellerBase) {
      append('seller not reachable yet');
      return;
    }
    const url = `${sellerBase}${path}`;
    setBusy(true);
    append('requesting paid endpoint…');
    try {
      const res = await world.fetchWithPayment(url);
      append(`HTTP ${res.status}`);
      if (res.ok) {
        append(`body: ${JSON.stringify(await res.json())}`);
        const settle = world.bridge.getSettlement(res) as { transaction?: string } | undefined;
        if (settle?.transaction) append(`settled: ${settle.transaction.slice(0, 20)}…`);
        append('=== PAYMENT COMPLETE (native-custody signature) ===');
      } else {
        append('payment failed — is the seller running? is the wallet funded?');
      }
    } catch (e) {
      append(`error: ${(e as Error).message}`);
    } finally {
      for (const entry of world.guard.auditLog().slice(-1)) {
        append(`policy: ${entry.decision.toUpperCase()} ${entry.amount} → ${entry.payTo.slice(0, 8)}…`);
      }
      setBusy(false);
    }
  }, [world, sellerBase]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>Pocket Agent</Text>
      <Text style={styles.sub}>x402 · native custody · Solana devnet</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Secure hardware</Text>
        <Text style={styles.mono}>{String(nativeSigner.isSecureHardwareAvailable)}</Text>
        <Text style={styles.label}>Wallet (iOS Keychain, ed25519)</Text>
        <Text style={styles.mono}>{world.svmSigner.address}</Text>
        <Text style={styles.label}>Approval</Text>
        <Text style={styles.mono}>{approvalMode()}</Text>
        <Text style={styles.label}>Policy</Text>
        <Text style={styles.mono}>$0.25/tx · $5/day · approval &gt; $0.10</Text>
      </View>
      <Button title={busy ? 'paying…' : 'Pay $0.01 for an insight'} onPress={() => pay('/api/insight')} disabled={busy} />
      <Button
        title="Pay $0.15 — deep insight (needs approval)"
        onPress={() => pay('/api/deep-insight')}
        disabled={busy}
      />
      <ScrollView style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  sub: { textAlign: 'center', color: '#666', marginBottom: 12 },
  card: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: '#f4f4f6', gap: 2 },
  label: { fontSize: 12, color: '#888', marginTop: 6 },
  mono: { fontFamily: 'Menlo', fontSize: 12 },
  log: { flex: 1, margin: 16 },
  logLine: { fontFamily: 'Menlo', fontSize: 11, marginBottom: 3 },
});
