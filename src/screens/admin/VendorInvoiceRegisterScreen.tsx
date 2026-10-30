import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppScreen } from '../../components/AppScreen';
import { NivenxaFooter } from '../../components/BrandComponents';
import { PriceChip } from '../../components/PriceChip';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { fetchBranches, Branch } from '../../api/branches';
import {
  fetchVendorInvoices,
  createVendorInvoice,
  updateVendorInvoice,
  voidVendorInvoice,
  VendorInvoice,
  VendorInvoiceSummary,
  VendorServiceType,
  VendorPaymentStatus,
  VENDOR_SERVICE_TYPES,
  VENDOR_SERVICE_TYPE_LABELS,
} from '../../api/vendorInvoices';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';
import type { AdminStackParamList } from '../../navigation/AdminStack';

type Nav = NativeStackNavigationProp<AdminStackParamList>;

type StatusFilter = 'all' | VendorPaymentStatus;

interface FormState {
  vendorName: string;
  description: string;
  serviceType: VendorServiceType;
  amount: string;
  paymentDone: boolean;
  branchId: string | null; // null = global/no branch
}

const emptyForm: FormState = {
  vendorName: '',
  description: '',
  serviceType: 'wash_fold',
  amount: '',
  paymentDone: false,
  branchId: null,
};

// Third-party vendor invoice management, spec section 9/10 — the
// "Vendor Invoice Register" (list + summary + filters) and the
// "Create / Edit Vendor Invoice" form share one screen/modal, same
// reusable-component convention BranchesScreen.tsx already establishes
// for a near-identical list+modal shape.
export const VendorInvoiceRegisterScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { state: authState } = useAuth();
  const user = authState.status === 'signedIn' ? authState.user : null;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rows, setRows] = useState<VendorInvoice[]>([]);
  const [summary, setSummary] = useState<VendorInvoiceSummary>({ totalAmount: 0, paidAmount: 0, unpaidAmount: 0 });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [serviceFilter, setServiceFilter] = useState<VendorServiceType | null>(null);

  const [editing, setEditing] = useState<VendorInvoice | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [voidingReason, setVoidingReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  // Unscoped admin can filter/create across every branch; a branch-scoped
  // admin never sees the branch picker at all — the backend already locks
  // their own branchId regardless of what's sent, same precedent as every
  // other branch-scoped admin screen in this app.
  const isUnscopedAdmin = user?.branchId == null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, branchList] = await Promise.all([
        fetchVendorInvoices({
          search: search.trim() || undefined,
          paymentStatus: statusFilter,
          serviceType: serviceFilter ?? undefined,
        }),
        isUnscopedAdmin ? fetchBranches() : Promise.resolve([] as Branch[]),
      ]);
      setRows(result.rows);
      setSummary(result.summary);
      setBranches(branchList);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, serviceFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openNew = () => {
    setEditing('new');
    setForm(emptyForm);
    setError(null);
  };

  const openEdit = (invoice: VendorInvoice) => {
    setEditing(invoice);
    setForm({
      vendorName: invoice.vendorName,
      description: invoice.description ?? '',
      serviceType: invoice.serviceType,
      amount: String(invoice.amount),
      paymentDone: invoice.paymentStatus === 'paid',
      branchId: invoice.branchId,
    });
    setVoidingReason('');
    setError(null);
  };

  const handleSave = async () => {
    const amount = Number(form.amount);
    if (!form.vendorName.trim()) {
      setError('Vendor name is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        vendorName: form.vendorName.trim(),
        description: form.description.trim() || undefined,
        serviceType: form.serviceType,
        amount,
        paymentDone: form.paymentDone,
        branchId: form.branchId,
      };
      if (editing === 'new') {
        await createVendorInvoice(payload);
      } else if (editing) {
        // Spec section 11 ("ON -> OFF requires confirmation") is handled
        // just below, before this function is ever called for that case.
        await updateVendorInvoice(editing.id, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError('Could not save this vendor invoice.');
    } finally {
      setSaving(false);
    }
  };

  const [confirmingUnpaid, setConfirmingUnpaid] = useState(false);

  // Spec section 11: reverting Paid -> Unpaid requires confirmation before
  // the toggle actually takes effect — tapping "Unpaid" while currently
  // Paid shows the confirm box instead of applying immediately; the
  // confirm box's own button is what actually flips the form state.
  const handleTogglePaymentDone = (next: boolean) => {
    if (!next && form.paymentDone) {
      setConfirmingUnpaid(true);
      return;
    }
    setForm({ ...form, paymentDone: next });
  };

  const handleVoid = async () => {
    if (editing === 'new' || !editing) return;
    if (!voidingReason.trim()) {
      setError('A reason is required to void this vendor invoice.');
      return;
    }
    setVoiding(true);
    setError(null);
    try {
      await voidVendorInvoice(editing.id, voidingReason.trim());
      setEditing(null);
      await load();
    } catch (err) {
      setError('Could not void this vendor invoice.');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <AppScreen scroll={false}>
      <View style={styles.appbar}>
        <View style={styles.appbarTopRow}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.cream} />
          </Pressable>
          <Text style={styles.title}>Vendor Invoices</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>₹{summary.totalAmount}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Paid</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>₹{summary.paidAmount}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Unpaid</Text>
            <Text style={[styles.summaryValue, { color: colors.danger }]}>₹{summary.unpaidAmount}</Text>
          </View>
        </View>

        <TextInput
          style={styles.searchField}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by vendor name"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={load}
        />

        <View style={styles.chipRow}>
          {(['all', 'paid', 'unpaid'] as StatusFilter[]).map((status) => (
            <Pressable
              key={status}
              style={[styles.chip, statusFilter === status && styles.chipActive]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.chipText, statusFilter === status && styles.chipTextActive]}>
                {status === 'all' ? 'All' : status === 'paid' ? 'Paid' : 'Unpaid'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chipRow}>
          {VENDOR_SERVICE_TYPES.map((type) => (
            <Pressable
              key={type}
              style={[styles.chip, serviceFilter === type && styles.chipActive]}
              onPress={() => setServiceFilter(serviceFilter === type ? null : type)}
            >
              <Text style={[styles.chipText, serviceFilter === type && styles.chipTextActive]}>
                {VENDOR_SERVICE_TYPE_LABELS[type]}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No vendor invoices match these filters.</Text>
        ) : (
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {rows.map((invoice) => (
              <Pressable key={invoice.id} style={styles.card} onPress={() => openEdit(invoice)}>
                <View style={styles.cardRow}>
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>{invoice.vendorName}</Text>
                    <Text style={styles.cardSub}>{VENDOR_SERVICE_TYPE_LABELS[invoice.serviceType]}</Text>
                    {invoice.description && <Text style={styles.cardSub}>{invoice.description}</Text>}
                    <Text style={styles.cardSub}>
                      {invoice.branch?.branchName ?? 'All branches'} · {new Date(invoice.createdAt).toDateString()}
                    </Text>
                  </View>
                  <View style={styles.cardRightWrap}>
                    <PriceChip amount={invoice.amount} />
                    <Text style={[styles.statusTag, invoice.paymentStatus === 'paid' ? styles.statusPaid : styles.statusUnpaid]}>
                      {invoice.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Pressable style={styles.addButton} onPress={openNew}>
          <Text style={styles.addButtonText}>+ Add New</Text>
        </Pressable>
      </View>

      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{editing === 'new' ? 'New Vendor Invoice' : 'Edit Vendor Invoice'}</Text>

              <Text style={styles.fieldLabel}>Vendor Name</Text>
              <TextInput
                style={styles.field}
                value={form.vendorName}
                onChangeText={(v) => setForm({ ...form, vendorName: v })}
                placeholder="Vendor name"
                placeholderTextColor={colors.muted}
              />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.field, styles.multilineField]}
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                placeholder="Additional work details"
                placeholderTextColor={colors.muted}
                multiline
              />

              <Text style={styles.fieldLabel}>Service Type</Text>
              <View style={styles.chipRow}>
                {VENDOR_SERVICE_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    style={[styles.chip, form.serviceType === type && styles.chipActive]}
                    onPress={() => setForm({ ...form, serviceType: type })}
                  >
                    <Text style={[styles.chipText, form.serviceType === type && styles.chipTextActive]}>
                      {VENDOR_SERVICE_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Amount (₹)</Text>
              <TextInput
                style={styles.field}
                value={form.amount}
                onChangeText={(v) => setForm({ ...form, amount: v })}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />

              {isUnscopedAdmin && (
                <>
                  <Text style={styles.fieldLabel}>Branch (optional)</Text>
                  <View style={styles.chipRow}>
                    <Pressable
                      style={[styles.chip, form.branchId === null && styles.chipActive]}
                      onPress={() => setForm({ ...form, branchId: null })}
                    >
                      <Text style={[styles.chipText, form.branchId === null && styles.chipTextActive]}>All Branches</Text>
                    </Pressable>
                    {branches.map((branch) => (
                      <Pressable
                        key={branch.id}
                        style={[styles.chip, form.branchId === branch.id && styles.chipActive]}
                        onPress={() => setForm({ ...form, branchId: branch.id })}
                      >
                        <Text style={[styles.chipText, form.branchId === branch.id && styles.chipTextActive]}>
                          {branch.branchName}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Payment Done</Text>
              <View style={styles.toggleRow}>
                {[false, true].map((value) => (
                  <Pressable
                    key={String(value)}
                    style={[styles.toggle, form.paymentDone === value && styles.toggleActive]}
                    onPress={() => handleTogglePaymentDone(value)}
                  >
                    <Text style={[styles.toggleText, form.paymentDone === value && styles.toggleTextActive]}>
                      {value ? 'Paid' : 'Unpaid'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {/* Spec section 11: ON -> OFF needs confirmation before it
                  takes effect — the status indicates what Admin has
                  declared, not independent bank verification, so an
                  accidental tap shouldn't silently erase a Paid record. */}
              {confirmingUnpaid && (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmText}>Mark this vendor invoice back to Unpaid? The earlier Paid record stays in its history.</Text>
                  <Pressable
                    style={styles.confirmButton}
                    onPress={() => {
                      setForm({ ...form, paymentDone: false });
                      setConfirmingUnpaid(false);
                    }}
                  >
                    <Text style={styles.confirmButtonText}>Yes, mark Unpaid</Text>
                  </Pressable>
                  <Pressable style={styles.cancelButton} onPress={() => setConfirmingUnpaid(false)}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                </View>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
              </Pressable>

              {editing !== 'new' && (
                <>
                  <View style={styles.secondaryDivider} />
                  <Text style={styles.secondaryLabel}>Void this record</Text>
                  <TextInput
                    style={[styles.field, styles.multilineField]}
                    value={voidingReason}
                    onChangeText={setVoidingReason}
                    placeholder="Reason for voiding (required)"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                  <Pressable style={[styles.voidButton, voiding && styles.saveButtonDisabled]} onPress={handleVoid} disabled={voiding}>
                    {voiding ? <ActivityIndicator color={colors.danger} /> : <Text style={styles.voidButtonText}>Void Vendor Invoice</Text>}
                  </Pressable>
                </>
              )}

              <Pressable style={styles.cancelButton} onPress={() => setEditing(null)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
          <NivenxaFooter />
        </View>
      </Modal>
    </AppScreen>
  );
};

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: { backgroundColor: colors.chrome, padding: spacing.lg, paddingBottom: 14 },
    appbarTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    backButton: { width: 28, height: 28, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    title: { flexShrink: 1, fontFamily: fonts.headingSemiBold, fontWeight: '600', fontSize: typography.screenHeading, color: colors.cream },
    body: { flex: 1, padding: 14, minHeight: 0 },
    summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    summaryCard: { flex: 1, backgroundColor: colors.peachCard, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm, alignItems: 'center' },
    summaryLabel: { fontSize: typography.caption, color: colors.muted },
    summaryValue: { fontSize: typography.cardHeading, fontWeight: '700', color: colors.navyText, marginTop: 2 },
    searchField: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: typography.formValue,
      color: colors.navyText,
      marginBottom: spacing.sm,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: spacing.sm, backgroundColor: colors.peachBg },
    chipActive: { backgroundColor: colors.peachPrimary, borderColor: colors.peachPrimary },
    chipText: { fontSize: typography.caption, color: colors.navyText },
    chipTextActive: { color: colors.white, fontWeight: '700' },
    listScroll: { flex: 1, minHeight: 0 },
    card: { backgroundColor: colors.peachCard, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: 12, marginBottom: 10 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardTitleWrap: { flex: 1, marginRight: spacing.sm },
    cardRightWrap: { alignItems: 'flex-end', gap: spacing.xs },
    cardTitle: { fontSize: typography.cardHeading, fontWeight: '700', color: colors.navyText },
    cardSub: { fontSize: typography.secondary, color: colors.muted, marginTop: 3 },
    statusTag: { fontSize: typography.caption, fontWeight: '700', borderRadius: radii.sm, paddingVertical: 3, paddingHorizontal: spacing.xs },
    statusPaid: { backgroundColor: colors.successBg, color: colors.success },
    statusUnpaid: { backgroundColor: colors.warningBg, color: colors.navyDeep },
    empty: { fontSize: typography.body, color: colors.muted, marginTop: spacing.lg, textAlign: 'center' },
    addButton: { backgroundColor: colors.peachPrimary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
    addButtonText: { color: colors.white, fontWeight: '700', fontSize: typography.button },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(14,33,66,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: spacing.lg, maxHeight: '85%' },
    modalTitle: { fontFamily: fonts.headingSemiBold, fontWeight: '600', fontSize: typography.sectionHeading, color: colors.navyDeep, marginBottom: spacing.md },
    fieldLabel: { fontSize: typography.formLabel, fontWeight: '700', color: colors.navyText, marginBottom: spacing.xs, marginTop: spacing.sm },
    field: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: typography.formValue, color: colors.navyText },
    multilineField: { minHeight: 60, textAlignVertical: 'top' },
    toggleRow: { flexDirection: 'row', gap: spacing.xs },
    toggle: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.sm, borderWidth: 1.5, borderColor: colors.navyDeep },
    toggleActive: { backgroundColor: colors.chrome, borderColor: colors.chrome },
    toggleText: { fontSize: typography.button, fontWeight: '700', color: colors.navyDeep },
    toggleTextActive: { color: colors.cream },
    confirmBox: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm },
    confirmText: { fontSize: typography.secondary, color: colors.navyDeep, marginBottom: spacing.sm },
    confirmButton: { backgroundColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.sm, alignItems: 'center' },
    confirmButtonText: { color: colors.white, fontWeight: '700', fontSize: typography.button },
    error: { color: colors.danger, fontSize: typography.secondary, marginTop: spacing.sm, marginBottom: spacing.sm },
    saveButton: { backgroundColor: colors.peachPrimary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
    saveButtonDisabled: { opacity: 0.7 },
    saveButtonText: { color: colors.white, fontWeight: '700', fontSize: typography.button },
    secondaryDivider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.lg, marginBottom: spacing.sm },
    secondaryLabel: { fontSize: typography.caption, fontWeight: '700', color: colors.muted, marginBottom: spacing.xs, textTransform: 'uppercase' },
    voidButton: { borderWidth: 1.5, borderColor: colors.danger, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
    voidButtonText: { color: colors.danger, fontWeight: '700', fontSize: typography.button },
    cancelButton: { alignItems: 'center', paddingVertical: spacing.sm },
    cancelButtonText: { color: colors.muted, fontSize: typography.secondary },
  });
