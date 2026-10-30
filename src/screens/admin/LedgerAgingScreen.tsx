import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppScreen } from '../../components/AppScreen';
import { PriceChip } from '../../components/PriceChip';
import { useTheme } from '../../context/ThemeContext';
import { fetchAgingReport, sendReminder, AgingRow } from '../../api/ledger';
import { fetchInvoiceAgingReport, InvoiceAgingRow } from '../../api/outstanding';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';
import type { AdminStackParamList } from '../../navigation/AdminStack';

type Nav = NativeStackNavigationProp<AdminStackParamList>;

// Outstanding-dues rework, section 10: "Adapt this structure to the
// current navigation rather than creating redundant screens" — Monthly
// Billing (the existing, separate running-balance model) and Outstanding
// Payments (the new per-invoice model) live as two segments of this SAME
// Ledger tab, not two new bottom-nav items.
type LedgerSegment = 'monthly_billing' | 'outstanding_payments';

interface CustomerOutstandingSummary {
  customerId: string;
  customerName: string;
  branchName: string;
  totalOutstanding: number;
  invoiceCount: number;
}

export const LedgerAgingScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [segment, setSegment] = useState<LedgerSegment>('monthly_billing');

  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState<string | null>(null);
  const [sentFor, setSentFor] = useState<string | null>(null);

  const [outstandingRows, setOutstandingRows] = useState<InvoiceAgingRow[]>([]);
  const [outstandingLoading, setOutstandingLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchAgingReport());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOutstanding = useCallback(async () => {
    setOutstandingLoading(true);
    try {
      setOutstandingRows(await fetchInvoiceAgingReport());
    } finally {
      setOutstandingLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadOutstanding();
    }, [load, loadOutstanding])
  );

  const handleRemind = async (customerId: string) => {
    setReminding(customerId);
    setSentFor(null);
    try {
      await sendReminder(customerId);
      setSentFor(customerId);
    } finally {
      setReminding(null);
    }
  };

  // Backend returns one row per invoice — group by customer for this
  // dashboard-level list (per-invoice detail lives on the customer's own
  // screen, reached by tapping a card below).
  const customerSummaries = useMemo<CustomerOutstandingSummary[]>(() => {
    const byCustomer = new Map<string, CustomerOutstandingSummary>();
    for (const row of outstandingRows) {
      if (row.outstanding <= 0) continue;
      const existing = byCustomer.get(row.customerId);
      if (existing) {
        existing.totalOutstanding += row.outstanding;
        existing.invoiceCount += 1;
      } else {
        byCustomer.set(row.customerId, {
          customerId: row.customerId,
          customerName: row.customerName,
          branchName: row.branchName,
          totalOutstanding: row.outstanding,
          invoiceCount: 1,
        });
      }
    }
    return Array.from(byCustomer.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [outstandingRows]);

  return (
    <AppScreen scroll={false}>
      <View style={styles.appbar}>
        <Text style={styles.title}>Ledger</Text>
        <View style={styles.segmentRow}>
          <Pressable
            style={[styles.segment, segment === 'monthly_billing' && styles.segmentActive]}
            onPress={() => setSegment('monthly_billing')}
          >
            <Text style={[styles.segmentText, segment === 'monthly_billing' && styles.segmentTextActive]}>
              Monthly Billing
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, segment === 'outstanding_payments' && styles.segmentActive]}
            onPress={() => setSegment('outstanding_payments')}
          >
            <Text style={[styles.segmentText, segment === 'outstanding_payments' && styles.segmentTextActive]}>
              Outstanding Payments
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {segment === 'monthly_billing' ? (
          loading ? (
            <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xl }} />
          ) : rows.length === 0 ? (
            <Text style={styles.empty}>No monthly-billing customers with an outstanding balance.</Text>
          ) : (
            <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
              {rows.map((row) => (
                <View key={row.customerId} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardTitle}>
                        {row.locationLabel} · {row.customerName}
                      </Text>
                      <Text style={styles.cardSub}>{row.daysSinceLastCharge ?? 0} days overdue</Text>
                    </View>
                    <PriceChip amount={row.outstandingBalance} />
                  </View>
                  <Pressable
                    style={[styles.remindButton, reminding === row.customerId && styles.remindButtonDisabled]}
                    onPress={() => handleRemind(row.customerId)}
                    disabled={reminding === row.customerId}
                  >
                    {reminding === row.customerId ? (
                      <ActivityIndicator color={colors.navyDeep} />
                    ) : (
                      <Text style={styles.remindButtonText}>
                        {sentFor === row.customerId ? 'Reminder Sent ✓' : 'Send WhatsApp Reminder'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )
        ) : outstandingLoading ? (
          <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xl }} />
        ) : customerSummaries.length === 0 ? (
          <Text style={styles.empty}>No customers with an outstanding order balance.</Text>
        ) : (
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {customerSummaries.map((summary) => (
              <Pressable
                key={summary.customerId}
                style={styles.card}
                onPress={() => navigation.navigate('CustomerOutstanding', { customerId: summary.customerId })}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>
                      {summary.branchName} · {summary.customerName}
                    </Text>
                    <Text style={styles.cardSub}>
                      {summary.invoiceCount} invoice{summary.invoiceCount === 1 ? '' : 's'} outstanding
                    </Text>
                  </View>
                  <PriceChip amount={summary.totalOutstanding} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </AppScreen>
  );
};

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: {
      backgroundColor: colors.chrome,
      padding: spacing.lg,
      paddingBottom: 14,
    },
    appbarTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    segmentRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    segment: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radii.sm,
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    segmentActive: {
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    segmentText: {
      fontSize: typography.secondary,
      fontWeight: '700',
      color: '#C8A67B',
    },
    segmentTextActive: {
      color: colors.cream,
    },
    settingsButton: {
      width: 28,
      height: 28,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsButtonText: {
      fontSize: 14,
      color: colors.cream,
    },
    title: {
      fontFamily: fonts.headingSemiBold,
      fontWeight: '600',
      fontSize: typography.screenHeading,
      color: colors.cream,
    },
    subtitle: {
      fontSize: typography.secondary,
      color: '#C8A67B',
      marginTop: 2,
    },
    body: {
      flex: 1,
      padding: 14,
      // See AppScreen.tsx's `body` style comment — react-native-web's
      // min-height:auto floor, needed at every nested flex level for the
      // ScrollView below to actually clip+scroll on web.
      minHeight: 0,
    },
    listScroll: {
      flex: 1,
      minHeight: 0,
    },
    card: {
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: 12,
      marginBottom: 10,
    },
    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitleWrap: {
      flex: 1,
      marginRight: spacing.sm,
    },
    cardTitle: {
      fontSize: typography.cardHeading,
      fontWeight: '700',
      color: colors.navyText,
    },
    cardSub: {
      fontSize: typography.secondary,
      color: colors.muted,
      marginTop: 3,
    },
    remindButton: {
      borderWidth: 1.5,
      borderColor: colors.navyDeep,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    remindButtonDisabled: {
      opacity: 0.7,
    },
    remindButtonText: {
      color: colors.navyDeep,
      fontWeight: '700',
      fontSize: typography.button,
    },
    empty: {
      fontSize: typography.body,
      color: colors.muted,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
  });
