import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppScreen } from '../../components/AppScreen';
import { useTheme } from '../../context/ThemeContext';
import { ColorTokens, fonts, radii, spacing, typography } from '../../theme/theme';
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
    <AppScreen scroll={false}>
      <View style={styles.appbar}>
        <View style={styles.appbarRow}>
          {/* AdminStack runs with headerShown: false, so there's no native
              back button — same convention as SettingsScreen. */}
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()} hitSlop={8}>
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.cream} />
          </Pressable>
          <Text style={styles.title}>Setup</Text>
        </View>
      </View>

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
    appbar: {
      backgroundColor: colors.chrome,
      padding: spacing.lg,
      paddingBottom: 14,
    },
    appbarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    backButton: {
      width: 28,
      height: 28,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    // flexShrink/flexWrap (here and on appbarRow above): defensive against
    // Android's larger-text accessibility setting multiplying 24sp further
    // next to the fixed-size back button — see StaffManagementScreen.tsx's
    // identical fix for the concrete case this guards against.
    title: {
      flexShrink: 1,
      fontFamily: fonts.headingSemiBold,
      fontWeight: '600',
      fontSize: typography.screenHeading,
      color: colors.cream,
    },
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
