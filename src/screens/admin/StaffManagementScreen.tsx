import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppScreen } from '../../components/AppScreen';
import { NivenxaFooter } from '../../components/BrandComponents';
import { SanitizedTextInput } from '../../components/SanitizedTextInput';
import { Tag } from '../../components/Tag';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ApiError } from '../../api/client';
import { fetchUsers, createUser, updateUser, deleteUser, StaffUser, UserRole } from '../../api/users';
import { fetchBranches, Branch } from '../../api/branches';
import { getDisplayName } from '../../utils/displayName';
import { ColorTokens, fonts, radii, spacing } from '../../theme/theme';
import type { AdminStackParamList } from '../../navigation/AdminStack';

const UNSCOPED_KEY = '__unscoped__';
type Nav = NativeStackNavigationProp<AdminStackParamList>;

const sanitizeNameInput = (value: string) => value.replace(/[^A-Za-z\s.]/g, '').slice(0, 60);
const sanitizePhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 10);

// Admin-only (CLAUDE.md "Staff/Admin account management" — accounts were
// only ever created by directly seeding the DB; this is the first in-app
// path). Not reachable from the staff navigation stack. List-only for
// existing accounts (no edit/deactivate here — not asked for); the modal is
// create-only.
export const StaffManagementScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { state } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = state.status === 'signedIn' ? state.user : null;

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Branch-scoped admins get their own branch back regardless of this
      // param (enforced server-side) — same pattern as CustomerManagementScreen.
      const [fetchedUsers, fetchedBranches] = await Promise.all([
        fetchUsers(user?.branchId ?? undefined),
        fetchBranches(),
      ]);
      setUsers(fetchedUsers);
      setBranches(fetchedBranches);
    } finally {
      setLoading(false);
    }
  }, [user?.branchId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const branchNameById = useMemo(() => new Map(branches.map((b) => [b.id, b.branchName])), [branches]);

  // Grouped by branch, with an "All Branches" section for unscoped admins
  // (branchId null) — mirrors CustomerManagementScreen's branch grouping.
  const sections = useMemo(() => {
    const byBranch = new Map<string, { label: string; users: StaffUser[] }>();
    for (const u of users) {
      const key = u.branchId ?? UNSCOPED_KEY;
      if (!byBranch.has(key)) {
        byBranch.set(key, { label: u.branchId ? branchNameById.get(u.branchId) ?? 'Unknown Branch' : 'All Branches (Unscoped Admin)', users: [] });
      }
      byBranch.get(key)!.users.push(u);
    }
    return Array.from(byBranch.values());
  }, [users, branchNameById]);

  const openNew = () => {
    setEditingUserId(null);
    setFullName('');
    setPhoneNumber('');
    setRole('staff');
    const attapur = branches.find((b) => b.branchName === 'Attapur');
    setBranchId(user?.branchId ?? attapur?.id ?? branches[0]?.id ?? null);
    setError(null);
    setCreating(true);
  };

  const openEdit = (staff: StaffUser) => {
    setEditingUserId(staff.id);
    setFullName(staff.fullName);
    setPhoneNumber(staff.phoneNumber.replace(/^\+91/, ''));
    setRole(staff.role);
    setBranchId(staff.branchId ?? user?.branchId ?? null);
    setError(null);
    setCreating(true);
  };

  const handleDelete = async (staff: StaffUser) => {
    Alert.alert('Delete staff account', `Delete ${staff.fullName}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUser(staff.id);
            await load();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not delete this account.');
          }
        },
      },
    ]);
  };

  const handleCreate = async () => {
    const trimmedName = fullName.trim();
    if (!trimmedName || !phoneNumber) {
      setError('Name and phone number are required.');
      return;
    }
    if (!/^[A-Za-z][A-Za-z\s.]*$/.test(trimmedName)) {
      setError('Name must contain letters only; only "." and space are allowed as special characters.');
      return;
    }
    if (role === 'staff' && !branchId) {
      setError('A branch is required for a staff account.');
      return;
    }

    const digits = sanitizePhoneInput(phoneNumber);
    let normalizedPhoneNumber = '';
    if (digits.length === 10) {
      normalizedPhoneNumber = `+91${digits}`;
    } else if (digits.length === 12 && digits.startsWith('91')) {
      normalizedPhoneNumber = `+${digits}`;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      normalizedPhoneNumber = `+91${digits.slice(1)}`;
    }

    if (!normalizedPhoneNumber) {
      setError('Phone number must be a valid 10-digit number or include a valid country code.');
      return;
    }

    setPhoneNumber(normalizedPhoneNumber);
    setSaving(true);
    setError(null);
    try {
      if (editingUserId) {
        await updateUser(editingUserId, { fullName: trimmedName, phoneNumber: normalizedPhoneNumber, role, branchId });
      } else {
        await createUser({ fullName: trimmedName, phoneNumber: normalizedPhoneNumber, role, branchId });
      }
      setCreating(false);
      setEditingUserId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : editingUserId ? 'Could not update this account.' : 'Could not create this account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen scroll={false}>
      <View style={styles.appbar}>
        <Text style={styles.title}>Staff & Admin Accounts</Text>
        <Text style={styles.subtitle}>{users.length} total · Admin-only, no passwords (OTP login)</Text>
      </View>

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.peachPrimary} style={{ marginTop: spacing.xl }} />
        ) : users.length === 0 ? (
          <Text style={styles.empty}>No staff or admin accounts yet.</Text>
        ) : (
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.label}>
                <Text style={styles.sectionHeader}>{section.label}</Text>
                {section.users.map((u) => (
                  <View key={u.id} style={styles.card}>
                    <View style={styles.cardRow}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName}>{getDisplayName(u.fullName)}</Text>
                        <Tag
                          label={u.role === 'admin' ? 'Admin' : 'Staff'}
                          bg={u.role === 'admin' ? colors.warningBg : colors.successBg}
                          color={u.role === 'admin' ? colors.warning : colors.success}
                        />
                        {!u.isActive && <Tag label="Inactive" bg={colors.border} color={colors.muted} />}
                      </View>
                    </View>
                    <Text style={styles.cardSub}>{u.phoneNumber}</Text>
                    <View style={styles.actionRow}>
                      <Pressable style={styles.inlineAction} onPress={() => openEdit(u)}>
                        <Text style={styles.inlineActionText}>Edit</Text>
                      </Pressable>
                      <Pressable style={[styles.inlineAction, styles.inlineActionDanger]} onPress={() => handleDelete(u)}>
                        <Text style={styles.inlineActionText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}

        <Pressable style={styles.addButton} onPress={openNew}>
          <Text style={styles.addButtonText}>+ Add Staff / Admin</Text>
        </Pressable>
      </View>

      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingUserId ? 'Edit Staff / Admin' : 'Add Staff / Admin'}</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <SanitizedTextInput
              style={styles.field}
              value={fullName}
              onChangeText={setFullName}
              sanitize={sanitizeNameInput}
              placeholder="Ramesh Kumar"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.fieldLabel}>Phone Number</Text>
            <SanitizedTextInput
              style={styles.field}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              sanitize={sanitizePhoneInput}
              placeholder="9876543210"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>Is Staff</Text>
            <View style={styles.switchRow}>
              <Switch
                value={role === 'staff'}
                onValueChange={(value: boolean) => setRole(value ? 'staff' : 'admin')}
                trackColor={{ false: colors.border, true: colors.peachPrimary }}
                thumbColor={colors.white}
              />
              <Text style={styles.switchLabel}>{role === 'staff' ? 'Staff' : 'Admin'}</Text>
            </View>

            <Text style={styles.fieldLabel}>
              Branch {role === 'admin' && <Text style={styles.hintInline}>(optional — unscoped admin sees all)</Text>}
            </Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={branchId ?? UNSCOPED_KEY}
                onValueChange={(value: string) => setBranchId(value === UNSCOPED_KEY ? null : value)}
                style={styles.picker}
              >
                {role === 'admin' && <Picker.Item label="All Branches" value={UNSCOPED_KEY} />}
                {branches.map((b) => (
                  <Picker.Item key={b.id} label={b.branchName} value={b.id} />
                ))}
              </Picker>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>{editingUserId ? 'Save Changes' : 'Create Account'}</Text>}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => setCreating(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
          <NivenxaFooter />
        </View>
      </Modal>
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
      fontSize: 16,
      color: colors.cream,
    },
    subtitle: {
      fontSize: 10,
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
    sectionHeader: {
      fontSize: 10.5,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      color: colors.muted,
      marginBottom: spacing.xs,
      marginTop: spacing.sm,
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
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      flexShrink: 1,
    },
    userName: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.navyText,
    },
    cardSub: {
      fontSize: 10.5,
      color: colors.muted,
      marginTop: 3,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    inlineAction: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    inlineActionDanger: {
      borderColor: colors.danger,
      backgroundColor: colors.warningBg,
    },
    inlineActionText: {
      color: colors.navyText,
      fontSize: 10,
      fontWeight: '700',
    },
    empty: {
      fontSize: 11,
      color: colors.muted,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
    addButton: {
      backgroundColor: colors.peachPrimary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    addButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 11.5,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(14,33,66,0.4)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      maxHeight: '85%',
    },
    modalTitle: {
      fontFamily: fonts.headingSemiBold,
      fontWeight: '600',
      fontSize: 15,
      color: colors.navyDeep,
      marginBottom: spacing.md,
    },
    fieldLabel: {
      fontSize: 9.5,
      fontWeight: '700',
      color: colors.navyText,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    hintInline: {
      fontSize: 9,
      fontWeight: '400',
      color: colors.muted,
      textTransform: 'none',
    },
    field: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      fontSize: 13,
      color: colors.navyText,
      marginBottom: spacing.xs,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    switchLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.navyText,
    },
    pickerWrap: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      marginBottom: spacing.sm,
      overflow: 'hidden',
    },
    picker: {
      color: colors.navyText,
    },
    error: {
      color: colors.danger,
      fontSize: 11,
      marginBottom: spacing.sm,
    },
    saveButton: {
      backgroundColor: colors.peachPrimary,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    saveButtonDisabled: {
      opacity: 0.7,
    },
    saveButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 12,
    },
    cancelButton: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    cancelButtonText: {
      color: colors.muted,
      fontSize: 11,
    },
  });
