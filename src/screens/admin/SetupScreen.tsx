import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppScreen } from '../../components/AppScreen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useTheme } from '../../context/ThemeContext';
import { ColorTokens, radii, spacing, typography } from '../../theme/theme';
import type { AdminStackParamList } from '../../navigation/AdminStack';

type Nav = NativeStackNavigationProp<AdminStackParamList>;

// Reached from the Overview header's Setup icon (gear) — holds the two
// admin-config areas moved out of the bottom tab bar (Branches, Staff).
// Both destination screens are the existing, unmodified Branch/Staff
// Management screens; this is just a new entry point to them.
export const SetupScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <AppScreen scroll={false} avatarInHeader>
      <ScreenHeader title="Setup" onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <Pressable style={styles.card} onPress={() => navigation.navigate('Branches')}>
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name="office-building-outline" size={24} color={colors.peachPrimaryDark} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Branches</Text>
            <Text style={styles.cardSub}>Create and manage branches</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        <Pressable style={styles.card} onPress={() => navigation.navigate('Staff')}>
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name="account-cog-outline" size={24} color={colors.peachPrimaryDark} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Staff</Text>
            <Text style={styles.cardSub}>Create staff, assign branches</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>

        {/* Third-party vendor invoice management, spec section 8:
            "Settings/Setup → Vendor Invoices → Vendor Invoice Register →
            Add New/Edit." Internal expense tracking only — fully separate
            from the customer-facing Orders/Catalogue/Customers/Ledger tabs. */}
        <Pressable style={styles.card} onPress={() => navigation.navigate('VendorInvoices')}>
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name="truck-outline" size={24} color={colors.peachPrimaryDark} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Vendor Invoices</Text>
            <Text style={styles.cardSub}>Track third-party vendor expenses</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      </View>
    </AppScreen>
  );
};

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    body: {
      flex: 1,
      padding: 14,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.peachCard,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.lg,
      marginBottom: spacing.sm,
    },
    cardIcon: {
      width: 44,
      height: 44,
      borderRadius: radii.lg,
      backgroundColor: colors.peachBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextWrap: {
      flex: 1,
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
  });
