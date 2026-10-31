import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AppScreen } from '../../components/AppScreen';
import { PriceChip } from '../../components/PriceChip';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchReconciliationExceptions,
  fetchUnmatchedProviderPayments,
  ReconciliationException,
  UnmatchedProviderPayment,
} from '../../api/reconciliation';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';

// Payment Reconciliation investigation views (2026-10-31) — READ-ONLY by
// deliberate design: "Implement read-only investigation views first. Any
// allocation, refund, or financial correction action requires a separately
// reviewed design." No resolve/mark-reviewed buttons here yet, even though
// the backend already supports them safely (routes/payments.ts) — that's a
// follow-up, not this screen.
//
// Admin-only, same reasoning as CustomerOutstandingScreen.tsx — reachable
// only from the admin-only Ledger tab, so there's no separate role check
// here.

const EXCEPTION_TYPE_LABELS: Record<ReconciliationException['exceptionType'], string> = {
  overpayment: 'Overpayment',
  duplicate_utr: 'Duplicate UTR',
  cancellation_uncertain: 'Link Cancellation Uncertain',
  monthly_billing_anomaly: 'Monthly-Billing Anomaly',
};

// Deliberately never says "Reconciled" — per the explicit instruction not
// to imply that updating a record's status here allocates money or
// otherwise financially reconciles anything. "Reviewed" is the only claim
// these labels make.
const exceptionStatusLabel = (status: ReconciliationException['status']): string => {
  if (status === 'open') return 'Open — Needs Review';
  if (status === 'resolved_refunded') return 'Reviewed — Noted as Refunded';
  if (status === 'resolved_credited') return 'Reviewed — Noted as Credited';
  return 'Reviewed — Other';
};

const unmatchedStatusLabel = (status: UnmatchedProviderPayment['status']): string => {
  if (status === 'unresolved') return 'Unresolved — Needs Review';
  if (status === 'resolved') return 'Reviewed — Matched Manually';
  return 'Reviewed — Ignored';
};

const rupees = (paise: number): number => Math.round(paise) / 100;

export const PaymentReconciliationScreen: React.FC = () => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [exceptions, setExceptions] = useState<ReconciliationException[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedProviderPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exceptionRows, unmatchedRows] = await Promise.all([
        fetchReconciliationExceptions('all'),
        fetchUnmatchedProviderPayments('all'),
      ]);
      setExceptions(exceptionRows);
      setUnmatched(unmatchedRows);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <AppScreen>
        <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xxl }} />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll={false}>
      <View style={styles.appbar}>
        <Text style={styles.title}>Payment Reconciliation</Text>
        <Text style={styles.subtitle}>Investigation only</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            This screen is for investigation only. It never moves money, allocates a payment, or changes any invoice
            balance. A record's status here only reflects whether an admin has reviewed it.
          </Text>
        </View>

        <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Payment Exceptions ({exceptions.length})</Text>
          {exceptions.length === 0 ? (
            <Text style={styles.empty}>No payment exceptions on record.</Text>
          ) : (
            exceptions.map((exc) => (
              <View key={exc.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>{EXCEPTION_TYPE_LABELS[exc.exceptionType] ?? exc.exceptionType}</Text>
                    <Text style={styles.cardSub}>
                      {exc.invoice ? `Invoice ${exc.invoice.invoiceNumber} · Order ${exc.invoice.orderId}` : 'No invoice matched'}
                    </Text>
                    {exc.customer && (
                      <Text style={styles.cardSub}>
                        {exc.customer.fullName} · {exc.customer.phoneNumber}
                      </Text>
                    )}
                  </View>
                  <PriceChip amount={rupees(exc.excessPaise)} />
                </View>

                <Text style={styles.cardSub}>
                  Collected ₹{rupees(exc.collectedPaise)} · Allocated ₹{rupees(exc.allocatedPaise)} · Excess ₹
                  {rupees(exc.excessPaise)}
                </Text>

                {exc.relatedPayments.length > 0 && (
                  <Text style={styles.cardSub}>
                    Razorpay Payment ID{exc.relatedPayments.length > 1 ? 's' : ''}:{' '}
                    {exc.relatedPayments.map((p) => p.razorpayPaymentId ?? '(cash/bank UPI)').join(', ')}
                  </Text>
                )}

                <Text style={styles.cardSub}>{new Date(exc.createdAt).toLocaleString()}</Text>

                <View style={[styles.statusPill, exc.status === 'open' ? styles.statusOpen : styles.statusReviewed]}>
                  <Text style={styles.statusPillText}>{exceptionStatusLabel(exc.status)}</Text>
                </View>
                {exc.resolutionNotes && <Text style={styles.notesText}>Note: {exc.resolutionNotes}</Text>}
              </View>
            ))
          )}

          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Unmatched Payments ({unmatched.length})</Text>
          {unmatched.length === 0 ? (
            <Text style={styles.empty}>No unmatched provider payments on record.</Text>
          ) : (
            unmatched.map((row) => (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>Razorpay Payment ID: {row.razorpayPaymentId}</Text>
                    <Text style={styles.cardSub}>No invoice could be matched to this payment</Text>
                    {row.razorpayPaymentLinkId && (
                      <Text style={styles.cardSub}>Payment Link ID: {row.razorpayPaymentLinkId}</Text>
                    )}
                  </View>
                  <PriceChip amount={rupees(row.amountPaise)} />
                </View>

                <Text style={styles.cardSub}>{new Date(row.createdAt).toLocaleString()}</Text>

                <View style={[styles.statusPill, row.status === 'unresolved' ? styles.statusOpen : styles.statusReviewed]}>
                  <Text style={styles.statusPillText}>{unmatchedStatusLabel(row.status)}</Text>
                </View>
                {row.resolutionNotes && <Text style={styles.notesText}>Note: {row.resolutionNotes}</Text>}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </AppScreen>
  );
};

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: { backgroundColor: colors.chrome, padding: spacing.lg, paddingBottom: 14 },
    title: { fontFamily: fonts.headingSemiBold, fontWeight: '600', fontSize: typography.screenHeading, color: colors.cream },
    subtitle: { fontSize: typography.secondary, color: '#C8A67B', marginTop: 2 },
    body: { flex: 1, padding: 14, minHeight: 0 },
    disclaimer: {
      backgroundColor: colors.warningBg,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    disclaimerText: { fontSize: typography.secondary, color: colors.navyText },
    listScroll: { flex: 1, minHeight: 0 },
    sectionTitle: { fontSize: typography.sectionHeading, fontWeight: '600', color: colors.navyText, marginBottom: spacing.sm },
    card: { backgroundColor: colors.peachCard, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 12, marginBottom: 10 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardTitleWrap: { flex: 1, marginRight: spacing.sm },
    cardTitle: { fontSize: typography.cardHeading, fontWeight: '700', color: colors.navyText },
    cardSub: { fontSize: typography.secondary, color: colors.muted, marginTop: 3 },
    empty: { fontSize: typography.body, color: colors.muted, marginBottom: spacing.lg, textAlign: 'center' },
    statusPill: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: 10, marginTop: spacing.sm },
    statusOpen: { backgroundColor: colors.warningBg },
    statusReviewed: { backgroundColor: colors.successBg },
    statusPillText: { fontSize: typography.caption, fontWeight: '700', color: colors.navyText },
    notesText: { fontSize: typography.secondary, color: colors.navyDeep, marginTop: spacing.xs, fontStyle: 'italic' },
  });
