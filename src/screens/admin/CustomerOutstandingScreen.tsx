import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useFocusEffect, useRoute } from '@react-navigation/native';
import { AppScreen } from '../../components/AppScreen';
import { PriceChip } from '../../components/PriceChip';
import { useTheme } from '../../context/ThemeContext';
import {
  fetchCustomerOutstanding,
  sendPaymentReminder,
  fetchReminderHistory,
  CustomerOutstandingSummary,
  ReminderLogEntry,
} from '../../api/outstanding';
import {
  closeOutstandingBalance,
  fetchInvoiceAdjustments,
  reverseInvoiceAdjustment,
  InvoiceAdjustment,
  ReasonCategory,
  REASON_CATEGORY_LABELS,
} from '../../api/invoiceAdjustments';
import { ApiError } from '../../api/client';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';

const REASON_CATEGORIES: ReasonCategory[] = ['goodwill', 'discount_adjustment', 'billing_correction', 'other'];

// Fresh per close attempt (regenerated whenever the panel opens, not
// reused across a Cancel+retry) — Admin Payment Override spec section 5:
// "Require an idempotency key or equivalent protection against repeated
// confirmation." No crypto/uuid dependency exists in this app yet; this is
// random enough for a single button press's own dedup window.
const generateIdempotencyKey = (): string => `waiver-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type OutstandingRoute = RouteProp<{ CustomerOutstanding: { customerId: string } }, 'CustomerOutstanding'>;

// Outstanding-dues rework, sections 7/10 — "Ledger → Outstanding Payments
// → Customer Details → Send Reminder." This screen is only reachable from
// the admin-only Ledger tab (AdminStack), so there's no separate role
// check here — unlike OrderStatusScreen.tsx, nothing on this screen is
// ever shown to staff at all, not even a disabled version of it.
export const CustomerOutstandingScreen: React.FC = () => {
  const route = useRoute<OutstandingRoute>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [summary, setSummary] = useState<CustomerOutstandingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<ReminderLogEntry[]>([]);

  // Selected invoice IDs for a targeted reminder; empty selection means
  // "combined" (every currently-outstanding invoice) — matches the
  // backend's own default when invoiceIds is omitted.
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);

  // Admin Payment Override — "Close Outstanding Balance." Only one
  // invoice's close panel can be open at a time, same single-panel
  // convention as the reminder section above.
  const [closingInvoiceId, setClosingInvoiceId] = useState<string | null>(null);
  const [closeReasonCategory, setCloseReasonCategory] = useState<ReasonCategory>('goodwill');
  const [closeReason, setCloseReason] = useState('');
  const [closeIdempotencyKey, setCloseIdempotencyKey] = useState(generateIdempotencyKey());
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Reversal — adjustment history is fetched lazily, only for the one
  // invoice currently expanded, not for every closed invoice up front.
  const [expandedClosedInvoiceId, setExpandedClosedInvoiceId] = useState<string | null>(null);
  const [adjustmentsByInvoice, setAdjustmentsByInvoice] = useState<Record<string, InvoiceAdjustment[]>>({});
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);
  const [reversingAdjustmentId, setReversingAdjustmentId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [outstanding, reminderHistory] = await Promise.all([
        fetchCustomerOutstanding(route.params.customerId),
        fetchReminderHistory(route.params.customerId),
      ]);
      setSummary(outstanding);
      setHistory(reminderHistory);
    } finally {
      setLoading(false);
    }
  }, [route.params.customerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleInvoice = (invoiceId: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(invoiceId) ? prev.filter((id) => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  const outstandingInvoices = useMemo(
    () => summary?.invoices.filter((inv) => inv.outstanding > 0) ?? [],
    [summary]
  );

  const reminderTotal = useMemo(() => {
    if (!summary) return 0;
    if (selectedInvoiceIds.length === 0) return summary.totalOutstanding;
    return outstandingInvoices
      .filter((inv) => selectedInvoiceIds.includes(inv.invoiceId))
      .reduce((sum, inv) => sum + inv.outstanding, 0);
  }, [summary, outstandingInvoices, selectedInvoiceIds]);

  const handleSend = async (override: boolean) => {
    setSending(true);
    setSendError(null);
    setSendNotice(null);
    setDuplicateWarning(false);
    try {
      const result = await sendPaymentReminder(
        route.params.customerId,
        selectedInvoiceIds.length > 0 ? selectedInvoiceIds : undefined,
        override
      );
      setSendNotice(
        result.deliveryStatus === 'sent'
          ? 'Reminder sent.'
          : result.deliveryStatus === 'partial'
          ? 'Reminder sent to some numbers — one or more failed.'
          : 'Reminder failed to send to every number on file.'
      );
      load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_REMINDER') {
        setDuplicateWarning(true);
        setSendError(err.message);
      } else {
        setSendError(err instanceof ApiError ? err.message : 'Could not send reminder.');
      }
    } finally {
      setSending(false);
    }
  };

  // All invoices this customer has ever had a waiver on, regardless of
  // current outstanding (0 once fully closed) — so a closed invoice stays
  // visible for reversal rather than disappearing once its balance hits 0.
  const closedInvoices = useMemo(() => summary?.invoices.filter((inv) => inv.waivedAmount > 0) ?? [], [summary]);

  const openClosePanel = (invoiceId: string) => {
    setClosingInvoiceId(invoiceId);
    setCloseReasonCategory('goodwill');
    setCloseReason('');
    setCloseIdempotencyKey(generateIdempotencyKey());
    setCloseError(null);
  };

  const handleConfirmClose = async (invoiceId: string) => {
    if (!closeReason.trim()) {
      setCloseError('A reason is required to close this balance.');
      return;
    }
    setClosing(true);
    setCloseError(null);
    try {
      await closeOutstandingBalance(invoiceId, closeReasonCategory, closeReason.trim(), closeIdempotencyKey);
      setClosingInvoiceId(null);
      await load();
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : 'Could not close this balance.');
    } finally {
      setClosing(false);
    }
  };

  const toggleClosedInvoiceHistory = async (invoiceId: string) => {
    if (expandedClosedInvoiceId === invoiceId) {
      setExpandedClosedInvoiceId(null);
      return;
    }
    setExpandedClosedInvoiceId(invoiceId);
    setReversingAdjustmentId(null);
    setReversalError(null);
    if (!adjustmentsByInvoice[invoiceId]) {
      setLoadingAdjustments(true);
      try {
        const adjustments = await fetchInvoiceAdjustments(invoiceId);
        setAdjustmentsByInvoice((prev) => ({ ...prev, [invoiceId]: adjustments }));
      } finally {
        setLoadingAdjustments(false);
      }
    }
  };

  const handleConfirmReverse = async (invoiceId: string, adjustmentId: string) => {
    if (!reversalReason.trim()) {
      setReversalError('A reason is required to reverse this closure.');
      return;
    }
    setReversing(true);
    setReversalError(null);
    try {
      await reverseInvoiceAdjustment(invoiceId, adjustmentId, reversalReason.trim());
      setReversingAdjustmentId(null);
      setReversalReason('');
      // Refresh both the summary (outstanding is back above 0 now) and this
      // invoice's own adjustment history (shows the reversal just made).
      const [newSummary, adjustments] = await Promise.all([
        fetchCustomerOutstanding(route.params.customerId),
        fetchInvoiceAdjustments(invoiceId),
      ]);
      setSummary(newSummary);
      setAdjustmentsByInvoice((prev) => ({ ...prev, [invoiceId]: adjustments }));
    } catch (err) {
      setReversalError(err instanceof ApiError ? err.message : 'Could not reverse this closure.');
    } finally {
      setReversing(false);
    }
  };

  if (loading) {
    return (
      <AppScreen>
        <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xxl }} />
      </AppScreen>
    );
  }

  if (!summary) {
    return (
      <AppScreen>
        <Text style={styles.error}>Could not load this customer's outstanding balance.</Text>
      </AppScreen>
    );
  }

  const lastReminder = history[0];

  return (
    <AppScreen>
      <View style={styles.appbar}>
        <Text style={styles.title}>Outstanding Payments</Text>
        <Text style={styles.subtitle}>Combined outstanding: ₹{summary.totalOutstanding}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Invoices</Text>
        {outstandingInvoices.length === 0 ? (
          <Text style={styles.empty}>Nothing currently outstanding for this customer.</Text>
        ) : (
          outstandingInvoices.map((inv) => {
            const selected = selectedInvoiceIds.includes(inv.invoiceId);
            const isClosing = closingInvoiceId === inv.invoiceId;
            return (
              <View key={inv.invoiceId} style={[styles.card, selected && styles.cardSelected]}>
                <Pressable onPress={() => toggleInvoice(inv.invoiceId)}>
                  <View style={styles.cardRow}>
                    <View style={styles.cardTitleWrap}>
                      <Text style={styles.cardTitle}>
                        {inv.invoiceNumber} · Order {inv.orderNumber}
                      </Text>
                      <Text style={styles.cardSub}>
                        Invoiced {new Date(inv.invoiceDate).toDateString()}
                        {inv.dueDate ? ` · Due ${new Date(inv.dueDate).toDateString()}` : ''}
                      </Text>
                      <Text style={styles.cardSub}>
                        ₹{inv.originalAmount} total · ₹{inv.collected} collected
                      </Text>
                    </View>
                    <PriceChip amount={inv.outstanding} />
                  </View>
                  <Text style={styles.selectHint}>{selected ? 'Selected for reminder ✓' : 'Tap to select for a specific-invoice reminder'}</Text>
                </Pressable>

                {/* Admin Payment Override, Feature 1 — "On the existing
                    invoice details/payment screen, provide an Admin-only
                    action: Close Outstanding Balance. Display this action
                    only when an invoice has a positive outstanding
                    balance." This screen is already admin-only-reachable
                    end to end (see the file header comment), so no extra
                    role check is needed here. */}
                {!isClosing ? (
                  <Pressable style={styles.closeBalanceLink} onPress={() => openClosePanel(inv.invoiceId)}>
                    <Text style={styles.closeBalanceLinkText}>Close Outstanding Balance</Text>
                  </Pressable>
                ) : (
                  <View style={styles.closePanel}>
                    <Text style={styles.closePanelTitle}>Close Outstanding Balance</Text>
                    <Text style={styles.cardSub}>Invoice {inv.invoiceNumber}</Text>
                    <Text style={styles.cardSub}>Original amount: ₹{inv.originalAmount}</Text>
                    <Text style={styles.cardSub}>Total verified payments: ₹{inv.collected}</Text>
                    <Text style={styles.closePanelOutstanding}>Outstanding to be closed: ₹{inv.outstanding}</Text>

                    <Text style={styles.fieldLabel}>Reason</Text>
                    <View style={styles.chipRow}>
                      {REASON_CATEGORIES.map((category) => (
                        <Pressable
                          key={category}
                          style={[styles.chip, closeReasonCategory === category && styles.chipActive]}
                          onPress={() => setCloseReasonCategory(category)}
                        >
                          <Text style={[styles.chipText, closeReasonCategory === category && styles.chipTextActive]}>
                            {REASON_CATEGORY_LABELS[category]}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <TextInput
                      style={styles.reasonInput}
                      value={closeReason}
                      onChangeText={setCloseReason}
                      placeholder="Explain why this balance is being closed"
                      placeholderTextColor={colors.muted}
                      multiline
                    />

                    <Text style={styles.closePanelWarning}>
                      ₹{inv.outstanding} will be waived from this invoice. This does not record an additional payment. The
                      outstanding balance will be closed.
                    </Text>

                    {closeError && <Text style={styles.error}>{closeError}</Text>}

                    <Pressable
                      style={[styles.advanceButton, closing && styles.advanceButtonDisabled]}
                      onPress={() => handleConfirmClose(inv.invoiceId)}
                      disabled={closing}
                    >
                      {closing ? <ActivityIndicator color={colors.white} /> : <Text style={styles.advanceButtonText}>Confirm Closure</Text>}
                    </Pressable>
                    <Pressable style={styles.secondaryButton} onPress={() => setClosingInvoiceId(null)} disabled={closing}>
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}

        {closedInvoices.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Closed Invoices</Text>
            {closedInvoices.map((inv) => {
              const expanded = expandedClosedInvoiceId === inv.invoiceId;
              const adjustments = adjustmentsByInvoice[inv.invoiceId] ?? [];
              return (
                <View key={inv.invoiceId} style={styles.card}>
                  <Pressable onPress={() => toggleClosedInvoiceHistory(inv.invoiceId)}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardTitleWrap}>
                        <Text style={styles.cardTitle}>
                          {inv.invoiceNumber} · Order {inv.orderNumber}
                        </Text>
                        <Text style={styles.cardSub}>
                          ₹{inv.originalAmount} total · ₹{inv.collected} collected · ₹{inv.waivedAmount} waived
                        </Text>
                      </View>
                      <Text style={styles.closedTag}>{inv.outstanding > 0 ? 'Partially Closed' : 'Closed with Adjustment'}</Text>
                    </View>
                    <Text style={styles.selectHint}>{expanded ? 'Hide history' : 'Tap to view adjustment history'}</Text>
                  </Pressable>

                  {expanded && (
                    <View style={styles.closePanel}>
                      {loadingAdjustments ? (
                        <ActivityIndicator color={colors.peachPrimary} />
                      ) : adjustments.length === 0 ? (
                        <Text style={styles.cardSub}>No adjustment history found.</Text>
                      ) : (
                        adjustments.map((adj) => (
                          <View key={adj.id} style={styles.adjustmentRow}>
                            <Text style={styles.cardSub}>
                              ₹{adj.amount} waived ({REASON_CATEGORY_LABELS[adj.reasonCategory]}) by {adj.createdBy.fullName} on{' '}
                              {new Date(adj.createdAt).toDateString()}
                            </Text>
                            <Text style={styles.cardSub}>Reason: {adj.reason}</Text>

                            {adj.reversedAt ? (
                              <Text style={styles.reversedTag}>
                                Reversed by {adj.reversedBy?.fullName} on {new Date(adj.reversedAt).toDateString()} — {adj.reversalReason}
                              </Text>
                            ) : reversingAdjustmentId === adj.id ? (
                              <>
                                <TextInput
                                  style={styles.reasonInput}
                                  value={reversalReason}
                                  onChangeText={setReversalReason}
                                  placeholder="Why is this closure being reversed?"
                                  placeholderTextColor={colors.muted}
                                  multiline
                                />
                                {reversalError && <Text style={styles.error}>{reversalError}</Text>}
                                <Pressable
                                  style={[styles.advanceButton, reversing && styles.advanceButtonDisabled]}
                                  onPress={() => handleConfirmReverse(inv.invoiceId, adj.id)}
                                  disabled={reversing}
                                >
                                  {reversing ? (
                                    <ActivityIndicator color={colors.white} />
                                  ) : (
                                    <Text style={styles.advanceButtonText}>Confirm Reversal</Text>
                                  )}
                                </Pressable>
                                <Pressable
                                  style={styles.secondaryButton}
                                  onPress={() => {
                                    setReversingAdjustmentId(null);
                                    setReversalReason('');
                                  }}
                                  disabled={reversing}
                                >
                                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                                </Pressable>
                              </>
                            ) : (
                              <Pressable
                                style={styles.closeBalanceLink}
                                onPress={() => {
                                  setReversingAdjustmentId(adj.id);
                                  setReversalReason('');
                                  setReversalError(null);
                                }}
                              >
                                <Text style={styles.closeBalanceLinkText}>Reverse this closure</Text>
                              </Pressable>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        {outstandingInvoices.length > 0 && (
          <View style={styles.revisionCard}>
            <Text style={styles.sectionTitle}>Send Reminder</Text>
            <Text style={styles.cardSub}>
              {selectedInvoiceIds.length === 0
                ? `Combined — every outstanding invoice (₹${reminderTotal})`
                : `${selectedInvoiceIds.length} invoice${selectedInvoiceIds.length === 1 ? '' : 's'} selected (₹${reminderTotal})`}
            </Text>
            <View style={styles.previewBox}>
              {/* Matches the REAL approved payment_reminder template
                  exactly — {{1}} name, {{2}} total, no itemized lines, no
                  button (client decision, 2026-10-30: ship on the
                  existing template rather than hold for a Meta
                  resubmission). The itemized breakdown above is what the
                  admin sees in-app; the WhatsApp message itself is just
                  this. */}
              <Text style={styles.previewText}>
                "Hello [customer name], this is a payment reminder from Peach & Blue. Your outstanding balance is ₹{reminderTotal}."
              </Text>
            </View>

            {lastReminder && (
              <Text style={styles.cardSub}>Last reminder: {new Date(lastReminder.sentAt).toDateString()} ({lastReminder.deliveryStatus})</Text>
            )}

            {sendError && <Text style={styles.error}>{sendError}</Text>}
            {sendNotice && <Text style={styles.notice}>{sendNotice}</Text>}

            <Pressable style={[styles.advanceButton, sending && styles.advanceButtonDisabled]} onPress={() => handleSend(false)} disabled={sending}>
              {sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.advanceButtonText}>Send Reminder</Text>}
            </Pressable>

            {duplicateWarning && (
              <Pressable style={styles.secondaryButton} onPress={() => handleSend(true)} disabled={sending}>
                <Text style={styles.secondaryButtonText}>Send Anyway</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </AppScreen>
  );
};

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: { backgroundColor: colors.chrome, padding: spacing.lg, paddingBottom: 14, marginHorizontal: -14, marginTop: -14 },
    title: { fontFamily: fonts.headingSemiBold, fontWeight: '600', fontSize: typography.screenHeading, color: colors.cream },
    subtitle: { fontSize: typography.secondary, color: '#C8A67B', marginTop: 2 },
    body: { paddingTop: spacing.lg },
    sectionTitle: { fontSize: typography.sectionHeading, fontWeight: '600', color: colors.navyText, marginBottom: spacing.sm },
    card: { backgroundColor: colors.peachCard, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 12, marginBottom: 10 },
    cardSelected: { borderColor: colors.peachPrimary, borderWidth: 2 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitleWrap: { flex: 1, marginRight: spacing.sm },
    cardTitle: { fontSize: typography.cardHeading, fontWeight: '700', color: colors.navyText },
    cardSub: { fontSize: typography.secondary, color: colors.muted, marginTop: 3 },
    selectHint: { fontSize: typography.caption, color: colors.peachPrimary, marginTop: spacing.xs },
    empty: { fontSize: typography.body, color: colors.muted, marginTop: spacing.lg, textAlign: 'center' },
    error: { color: colors.danger, fontSize: typography.secondary, marginBottom: spacing.sm },
    notice: {
      fontSize: typography.secondary,
      color: colors.navyText,
      backgroundColor: colors.warningBg,
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    previewBox: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, marginVertical: spacing.sm },
    previewText: { fontSize: typography.secondary, color: colors.navyDeep, fontStyle: 'italic' },
    revisionCard: { backgroundColor: colors.peachCard, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 13, marginTop: spacing.lg },
    advanceButton: { backgroundColor: colors.peachPrimary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.xs },
    advanceButtonDisabled: { opacity: 0.7 },
    advanceButtonText: { color: colors.white, fontWeight: '700', fontSize: typography.button },
    secondaryButton: { borderWidth: 1.5, borderColor: colors.navyDeep, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
    secondaryButtonText: { color: colors.navyDeep, fontWeight: '700', fontSize: typography.button },
    closeBalanceLink: { marginTop: spacing.sm, alignSelf: 'flex-start' },
    closeBalanceLinkText: { fontSize: typography.caption, color: colors.danger, fontWeight: '700', textDecorationLine: 'underline' },
    closePanel: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginTop: spacing.sm,
    },
    closePanelTitle: { fontSize: typography.cardHeading, fontWeight: '700', color: colors.navyText, marginBottom: 2 },
    closePanelOutstanding: { fontSize: typography.body, fontWeight: '700', color: colors.danger, marginTop: spacing.xs },
    closePanelWarning: {
      fontSize: typography.secondary,
      color: colors.navyDeep,
      fontStyle: 'italic',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    fieldLabel: { fontSize: typography.caption, fontWeight: '700', color: colors.navyText, marginTop: spacing.sm, marginBottom: spacing.xs },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.pill,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.peachBg,
    },
    chipActive: { backgroundColor: colors.peachPrimary, borderColor: colors.peachPrimary },
    chipText: { fontSize: typography.caption, color: colors.navyText },
    chipTextActive: { color: colors.white, fontWeight: '700' },
    reasonInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginTop: spacing.sm,
      minHeight: 60,
      textAlignVertical: 'top',
      color: colors.navyText,
      fontSize: typography.secondary,
    },
    closedTag: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: colors.navyDeep,
      backgroundColor: colors.warningBg,
      borderRadius: radii.sm,
      paddingVertical: 3,
      paddingHorizontal: spacing.xs,
    },
    adjustmentRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
    reversedTag: { fontSize: typography.caption, color: colors.muted, marginTop: spacing.xs, fontStyle: 'italic' },
  });
