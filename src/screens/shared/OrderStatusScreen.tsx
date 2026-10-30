import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { AppScreen } from '../../components/AppScreen';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getOrder,
  updateOrderStatus,
  recordOrderPayment,
  reviseOrderAmount,
  assignOrderStaff,
  fetchInvoicePaymentSummary,
  generateIdempotencyKey,
  reportBankUpiPayment,
  Order,
  OrderItem,
  InternalStatus,
  PaymentMethod,
  InvoicePaymentSummary,
} from '../../api/orders';
import { fetchUsers, StaffUser } from '../../api/users';
import { getDisplayName } from '../../utils/displayName';
import { ApiError } from '../../api/client';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';

type OrderStatusRoute = RouteProp<{ OrderStatus: { orderId: string } }, 'OrderStatus'>;

const STATUS_SEQUENCE: InternalStatus[] = ['picked_up', 'washing', 'ironing', 'ready', 'out_for_delivery', 'delivered'];
const STAGE_LABELS = ['Picked', 'Processing', 'Ready', 'Delivered'];

// Maps the 6-value internal_status enum onto the mockup's 4-stage track.
const stageIndexForStatus = (status: InternalStatus): number => {
  if (status === 'picked_up') return 0;
  if (status === 'washing' || status === 'ironing') return 1;
  if (status === 'ready' || status === 'out_for_delivery') return 2;
  return 3; // delivered (or cancelled, shown as complete/terminal)
};

const nextStatusLabel: Partial<Record<InternalStatus, string>> = {
  picked_up: 'Processing',
  washing: 'Ironing',
  ironing: 'Ready',
  ready: 'Out for Delivery',
  out_for_delivery: 'Delivered',
};

// Client ask (2026-10-14): Dry Cleaning and Wash & Fold take noticeably
// longer than Ironing — mirrors invoiceService.ts's getTurnaroundText on the
// backend (same wording, computed client-side here since this screen
// already has order.orderItems in hand).
const getTurnaroundText = (items: OrderItem[]): string =>
  items.some((item) => item.serviceType === 'wash_fold' || item.serviceType === 'dry_clean')
    ? 'Dry Cleaning and Wash & Fold — expected delivery in 4 to 5 business working days.'
    : 'Turnaround time is typically 24–48 hours from pickup.';

// CLAUDE.md "Payment marking — real gap": the four confirmed payment modes,
// bundled into the same "mark Delivered" action for daily customers —
// monthly-billing customers are settled via the ledger instead (see
// orderService.ts's recordPayment, which 400s if attempted for one).
const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'net_banking', label: 'Net Banking' },
  { value: 'credit_card', label: 'Credit Card' },
];

// Shared by both stacks. The admin-only amount-revision card (Section D)
// renders below the status track when user.role === 'admin' — staff never
// see it, keeping "staff-visible parts only" true without a second screen.
export const OrderStatusScreen: React.FC = () => {
  const route = useRoute<OrderStatusRoute>();
  const { state } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = state.status === 'signedIn' ? state.user : null;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revisedAmount, setRevisedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [revising, setRevising] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // Admin-only "reassign staff" control (CLAUDE.md "Staff-scoped order
  // visibility" edge case, resolved) — staff list for the order's own
  // branch, filtered to role 'staff' client-side since there's no
  // role-filtering query param on GET /users.
  const [branchStaff, setBranchStaff] = useState<StaffUser[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // CLAUDE.md "Payment marking" — CHANGED (2026-10-30, client request):
  // delivery and payment are now two independent staff actions, not one
  // bundled "Mark Delivered & Payment Received" button — a customer may not
  // pay at the moment of delivery. recordingPayment/paymentError are kept
  // separate from updating/error (the status-advance action) so the two
  // actions' loading/error states don't bleed into each other.
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  // Payment-safety review section 6/12: an optional staff-entered partial
  // amount (blank = pay the full outstanding balance, preserving the old
  // one-tap UX), the invoice's live outstanding-balance summary, and a
  // per-attempt idempotency key — regenerated after every submission
  // (success or failure) so a genuinely NEW tap never accidentally reuses a
  // key from a request that already went through.
  const [partialAmount, setPartialAmount] = useState('');
  const [paymentSummary, setPaymentSummary] = useState<InvoicePaymentSummary | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey());

  // Payment-safety review section 7 (Static Bank UPI Workflow, Stage A) —
  // a separate report, not routed through recordOrderPayment, since this
  // doesn't mark the order paid immediately (stays pending until an admin
  // verifies it against the real bank account).
  const [bankUpiAmount, setBankUpiAmount] = useState('');
  const [bankUpiUtr, setBankUpiUtr] = useState('');
  const [reportingBankUpi, setReportingBankUpi] = useState(false);
  const [bankUpiError, setBankUpiError] = useState<string | null>(null);
  const [bankUpiNotice, setBankUpiNotice] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOrder(route.params.orderId);
      setOrder(result);
      setRevisedAmount(result.finalAmount);
    } catch (err) {
      setError('Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [route.params.orderId]);

  const loadPaymentSummary = useCallback(async () => {
    try {
      const summary = await fetchInvoicePaymentSummary(route.params.orderId);
      setPaymentSummary(summary);
    } catch {
      // No invoice yet, or summary genuinely unavailable — the card below
      // just falls back to showing nothing rather than an error; payment
      // recording itself doesn't depend on this having loaded.
      setPaymentSummary(null);
    }
  }, [route.params.orderId]);

  useEffect(() => {
    loadOrder();
    loadPaymentSummary();
  }, [loadOrder, loadPaymentSummary]);

  useEffect(() => {
    if (user?.role === 'admin' && order?.customer.branchId) {
      fetchUsers(order.customer.branchId)
        .then((users) => setBranchStaff(users.filter((u) => u.role === 'staff')))
        .catch(() => setBranchStaff([]));
    }
  }, [user?.role, order?.customer.branchId]);

  const handleAssignStaff = async (staffId: string) => {
    if (!order) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const updated = await assignOrderStaff(order.id, staffId);
      setOrder(updated);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : 'Could not reassign this order.');
    } finally {
      setAssigning(false);
    }
  };

  // A daily-billing order can have payment recorded once it's Delivered,
  // not before (client request, 2026-10-30) — payment and delivery are
  // still separate actions (the customer may not pay at the exact moment
  // of delivery), but the Record Payment card itself only appears once
  // internalStatus reaches 'delivered'. Reads order.billingMode (this
  // order's own snapshot from creation time), NOT order.customer.billingMode
  // — CLAUDE.md "Monthly billing retroactivity — RESOLVED": the customer's
  // current setting can have changed since this order was created, and
  // must not retroactively change how this specific order is settled.
  const canRecordPayment =
    order?.internalStatus === 'delivered' && order?.billingMode !== 'monthly_billing' && order?.paymentStatus !== 'paid';

  const handleAdvanceStatus = async () => {
    if (!order) return;
    const currentIndex = STATUS_SEQUENCE.indexOf(order.internalStatus);
    const next = STATUS_SEQUENCE[currentIndex + 1];
    if (!next) return;

    setUpdating(true);
    setError(null);
    try {
      const updated = await updateOrderStatus(order.id, next);
      setOrder(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally {
      setUpdating(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!order || !selectedPaymentMethod) return;

    const amount = partialAmount.trim() ? Number(partialAmount) : undefined;
    if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
      setPaymentError('Enter a valid amount, or leave it blank to record the full outstanding balance.');
      return;
    }

    setRecordingPayment(true);
    setPaymentError(null);
    setPaymentNotice(null);
    try {
      const result = await recordOrderPayment(order.id, selectedPaymentMethod, { amount, idempotencyKey });
      setOrder(result.order);
      setPaymentSummary(result.paymentSummary);
      setSelectedPaymentMethod(null);
      setPartialAmount('');
      if (result.overpayment) {
        setPaymentNotice(
          'This payment was more than the outstanding balance — the excess has been logged for admin review, not lost.'
        );
      }
    } catch (err) {
      setPaymentError(err instanceof ApiError ? err.message : 'Could not record payment.');
    } finally {
      setRecordingPayment(false);
      // Always issue a fresh key after a submission completes (success or
      // failure) — a genuinely new tap must never accidentally reuse a key
      // from a request that already went through.
      setIdempotencyKey(generateIdempotencyKey());
    }
  };

  const handleReportBankUpi = async () => {
    if (!order) return;
    const amount = Number(bankUpiAmount);
    if (!bankUpiAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setBankUpiError('Enter a valid amount.');
      return;
    }
    if (!bankUpiUtr.trim()) {
      setBankUpiError('Enter the UTR/reference number from the transfer.');
      return;
    }

    setReportingBankUpi(true);
    setBankUpiError(null);
    setBankUpiNotice(null);
    try {
      await reportBankUpiPayment(order.id, amount, bankUpiUtr.trim());
      setBankUpiAmount('');
      setBankUpiUtr('');
      setBankUpiNotice('Reported — this will show as paid once an admin verifies it against the bank account.');
    } catch (err) {
      setBankUpiError(err instanceof ApiError ? err.message : 'Could not report this payment.');
    } finally {
      setReportingBankUpi(false);
    }
  };

  const handleRevise = async () => {
    if (!order) return;
    if (!revisedAmount || !reason) {
      setRevisionError('Revised amount and reason are both required.');
      return;
    }

    setRevising(true);
    setRevisionError(null);
    try {
      const updated = await reviseOrderAmount(order.id, Number(revisedAmount), reason);
      setOrder(updated);
      setReason('');
    } catch (err) {
      setRevisionError(err instanceof ApiError ? err.message : 'Could not save this revision.');
    } finally {
      setRevising(false);
    }
  };

  if (loading) {
    return (
      <AppScreen>
        <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xxl }} />
      </AppScreen>
    );
  }

  if (!order) {
    return (
      <AppScreen>
        <Text style={styles.error}>{error ?? 'Order not found.'}</Text>
      </AppScreen>
    );
  }

  const stageIndex = stageIndexForStatus(order.internalStatus);
  const nextLabel = nextStatusLabel[order.internalStatus];

  return (
    <AppScreen>
      <View style={styles.appbar}>
        <Text style={styles.title}>Order #{order.orderNumber}</Text>
        <Text style={styles.subtitle}>
          {order.customer.locationLabel} · {order.customer.fullName}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Internal Progress</Text>

        <View style={styles.track}>
          {STAGE_LABELS.map((_, i) => (
            <React.Fragment key={i}>
              <View style={[styles.dot, i < stageIndex && styles.dotDone, i === stageIndex && styles.dotNow]} />
              {i < STAGE_LABELS.length - 1 && <View style={[styles.line, i < stageIndex && styles.lineDone]} />}
            </React.Fragment>
          ))}
        </View>
        <View style={styles.trackLabels}>
          {STAGE_LABELS.map((label) => (
            <Text key={label} style={styles.trackLabel}>
              {label}
            </Text>
          ))}
        </View>

        <Text style={styles.hint}>{getTurnaroundText(order.orderItems)}</Text>

        {order.paymentStatus === 'paid' && (
          <Text style={styles.hint}>
            Payment received{order.paymentMethod ? ` · ${PAYMENT_METHOD_OPTIONS.find((o) => o.value === order.paymentMethod)?.label ?? order.paymentMethod}` : ''}
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {nextLabel && (
          <Pressable style={[styles.advanceButton, updating && styles.advanceButtonDisabled]} onPress={handleAdvanceStatus} disabled={updating}>
            {updating ? <ActivityIndicator color={colors.white} /> : <Text style={styles.advanceButtonText}>Mark as {nextLabel}</Text>}
          </Pressable>
        )}

        {/* CLAUDE.md "Payment marking" — independent of delivery status
            (client request, 2026-10-30): the customer may not pay at the
            moment of delivery, so this is its own action, not gated on
            marking the order delivered. */}
        {canRecordPayment && (
          <View style={styles.revisionCard}>
            <Text style={styles.sectionTitle}>Record Payment</Text>

            {/* Payment-safety review section 12, "Invoice Payment
                Summary" — shows what's actually been collected and
                allocated so far, not just a flat paid/unpaid flag. */}
            {paymentSummary && (
              <View style={styles.summaryBox}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Collected so far</Text>
                  <Text style={styles.summaryValue}>₹{paymentSummary.collected}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Outstanding</Text>
                  <Text style={[styles.summaryValue, styles.summaryOutstanding]}>₹{paymentSummary.outstanding}</Text>
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>Payment Method</Text>
            <View style={styles.toggleRow}>
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.toggle, selectedPaymentMethod === option.value && styles.toggleActive]}
                  onPress={() => setSelectedPaymentMethod(option.value)}
                >
                  <Text
                    style={[styles.toggleText, selectedPaymentMethod === option.value && styles.toggleTextActive]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Amount (leave blank for the full outstanding balance)</Text>
            <TextInput
              style={styles.field}
              value={partialAmount}
              onChangeText={setPartialAmount}
              keyboardType="decimal-pad"
              placeholder={paymentSummary ? `₹${paymentSummary.outstanding}` : undefined}
              placeholderTextColor={colors.muted}
            />

            {paymentError && <Text style={styles.error}>{paymentError}</Text>}
            {paymentNotice && <Text style={styles.notice}>{paymentNotice}</Text>}

            <Pressable
              style={[
                styles.advanceButton,
                (recordingPayment || !selectedPaymentMethod) && styles.advanceButtonDisabled,
              ]}
              onPress={handleRecordPayment}
              disabled={recordingPayment || !selectedPaymentMethod}
            >
              {recordingPayment ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.advanceButtonText}>Record Payment</Text>
              )}
            </Pressable>

            {/* Payment-safety review section 7, Static Bank UPI Workflow
                Stage A — a separate, explicitly two-stage flow: this does
                NOT mark the order paid, it stays pending until an admin
                verifies it against the real bank account. */}
            <View style={styles.bankUpiDivider} />
            <Text style={styles.fieldLabel}>Or report a direct bank UPI transfer (static QR)</Text>
            <TextInput
              style={styles.field}
              value={bankUpiAmount}
              onChangeText={setBankUpiAmount}
              keyboardType="decimal-pad"
              placeholder="Amount received"
              placeholderTextColor={colors.muted}
            />
            <TextInput
              style={styles.field}
              value={bankUpiUtr}
              onChangeText={setBankUpiUtr}
              placeholder="UTR / reference number"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
            />
            {bankUpiError && <Text style={styles.error}>{bankUpiError}</Text>}
            {bankUpiNotice && <Text style={styles.notice}>{bankUpiNotice}</Text>}
            <Pressable
              style={[styles.secondaryButton, reportingBankUpi && styles.advanceButtonDisabled]}
              onPress={handleReportBankUpi}
              disabled={reportingBankUpi}
            >
              {reportingBankUpi ? (
                <ActivityIndicator color={colors.navyDeep} />
              ) : (
                <Text style={styles.secondaryButtonText}>Report Bank Transfer</Text>
              )}
            </Pressable>
          </View>
        )}

        {user?.role === 'admin' && (
          <View style={styles.revisionCard}>
            <Text style={styles.sectionTitle}>Assigned Staff</Text>

            <View style={styles.toggleRow}>
              {branchStaff.map((staffMember) => (
                <Pressable
                  key={staffMember.id}
                  style={[styles.toggle, order.staffId === staffMember.id && styles.toggleActive]}
                  onPress={() => handleAssignStaff(staffMember.id)}
                  disabled={assigning}
                >
                  <Text style={[styles.toggleText, order.staffId === staffMember.id && styles.toggleTextActive]}>
                    {getDisplayName(staffMember.fullName)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {branchStaff.length === 0 && <Text style={styles.hint}>No staff accounts found for this branch.</Text>}
            {assigning && <ActivityIndicator color={colors.peachPrimary} />}
            {assignError && <Text style={styles.error}>{assignError}</Text>}
          </View>
        )}

        {user?.role === 'admin' && order.internalStatus !== 'delivered' && (
          <View style={styles.revisionCard}>
            <Text style={styles.sectionTitle}>Revise Final Amount</Text>

            <Text style={styles.fieldLabel}>Estimated (at pickup)</Text>
            <Text style={styles.readOnlyField}>₹{order.estimatedAmount}</Text>

            <Text style={styles.fieldLabel}>Revised Amount</Text>
            <TextInput
              style={styles.field}
              value={revisedAmount}
              onChangeText={setRevisedAmount}
              keyboardType="decimal-pad"
            />

            <Text style={styles.fieldLabel}>Reason (sent to customer)</Text>
            <TextInput
              style={styles.field}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Saree needed stain treatment"
              placeholderTextColor={colors.muted}
              multiline
            />

            {revisionError && <Text style={styles.error}>{revisionError}</Text>}

            <Pressable style={[styles.advanceButton, revising && styles.advanceButtonDisabled]} onPress={handleRevise} disabled={revising}>
              {revising ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.advanceButtonText}>Save & Notify via WhatsApp</Text>
              )}
            </Pressable>
          </View>
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
      marginHorizontal: -14,
      marginTop: -14,
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
      paddingTop: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.sectionHeading,
      fontWeight: '600',
      color: colors.navyText,
      marginBottom: spacing.sm,
    },
    track: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: colors.border,
    },
    dotDone: {
      backgroundColor: colors.success,
    },
    dotNow: {
      backgroundColor: colors.peachPrimary,
    },
    line: {
      flex: 1,
      height: 2,
      backgroundColor: colors.border,
    },
    lineDone: {
      backgroundColor: colors.success,
    },
    trackLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    trackLabel: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: colors.muted,
    },
    error: {
      color: colors.danger,
      fontSize: typography.secondary,
      marginBottom: spacing.sm,
    },
    advanceButton: {
      backgroundColor: colors.peachPrimary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    advanceButtonDisabled: {
      opacity: 0.7,
    },
    advanceButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: typography.button,
    },
    revisionCard: {
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: 13,
      marginTop: spacing.lg,
    },
    fieldLabel: {
      fontSize: typography.formLabel,
      fontWeight: '700',
      color: colors.navyText,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    readOnlyField: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: typography.formValue,
      color: colors.muted,
    },
    field: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: typography.formValue,
      color: colors.navyDeep,
      fontWeight: '700',
    },
    toggleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.xs,
    },
    toggle: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      borderWidth: 1.5,
      borderColor: colors.navyDeep,
    },
    toggleActive: {
      backgroundColor: colors.chrome,
      borderColor: colors.chrome,
    },
    toggleText: {
      fontSize: typography.button,
      fontWeight: '700',
      color: colors.navyDeep,
    },
    toggleTextActive: {
      color: colors.cream,
    },
    hint: {
      fontSize: typography.secondary,
      color: colors.muted,
    },
    notice: {
      fontSize: typography.secondary,
      color: colors.navyText,
      backgroundColor: colors.warningBg,
      borderRadius: radii.sm,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    summaryBox: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    summaryLabel: {
      fontSize: typography.secondary,
      color: colors.muted,
    },
    summaryValue: {
      fontSize: typography.secondary,
      fontWeight: '700',
      color: colors.navyText,
    },
    summaryOutstanding: {
      color: colors.peachPrimary,
    },
    bankUpiDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    secondaryButton: {
      borderWidth: 1.5,
      borderColor: colors.navyDeep,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    secondaryButtonText: {
      color: colors.navyDeep,
      fontWeight: '700',
      fontSize: typography.button,
    },
  });
