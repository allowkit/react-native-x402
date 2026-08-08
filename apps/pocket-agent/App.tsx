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

const SELLER = 'http://localhost:4021/api/insight';
const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

export default function App() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
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
      onApprovalRequired: async (_i, reason) => {
        setLog((l) => [...l, `ESCALATION: ${reason}`]);
        // The BiometricGate: OS-level Face ID / passcode. The agent cannot
        // approve itself — only a fresh human authentication resolves true.
        const approved = await nativeSigner.authenticate(
          `Approve this payment? (${reason})`
        );
        setLog((l) => [...l, approved ? 'HUMAN APPROVED (biometric)' : 'HUMAN DENIED']);
        return approved;
      },
    });
    return { svmSigner, bridge, guard, fetchWithPayment };
  }, []);

  const pay = useCallback(async (url: string = SELLER) => {
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
  }, [world]);

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
        <Text style={styles.label}>Policy</Text>
        <Text style={styles.mono}>$0.25/tx · $5/day · approval &gt; $0.10</Text>
      </View>
      <Button title={busy ? 'paying…' : 'Pay $0.01 for an insight'} onPress={() => pay()} disabled={busy} />
      <Button
        title="Pay $0.15 — deep insight (needs approval)"
        onPress={() => pay('http://localhost:4021/api/deep-insight')}
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
