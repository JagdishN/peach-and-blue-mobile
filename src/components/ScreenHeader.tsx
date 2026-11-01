import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AccountMenuButton, AccountMenuModal, useAccountMenu } from './AccountMenu';
import { ColorTokens, fonts, radii, spacing, typography } from '../theme/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  // Presence shows a back chevron — pass `() => navigation.goBack()`.
  onBack?: () => void;
  // Extra row(s) rendered below the title row — branch chip, search field,
  // segment control, filter chips, whatever the screen already had there.
  children?: React.ReactNode;
}

// Header consistency (Priority 2, 2026-11-01) — generalizes
// AdminDashboardScreen's existing gear+avatar header (the one screen that
// already did this right) into one reusable piece, so every screen gets
// the same icon size, alignment, top inset, and spacing instead of its own
// hand-rolled copy. A screen using this passes `avatarInHeader` to its own
// AppScreen (same convention AdminDashboardScreen already established) —
// being a normal in-flow child of AppScreen's SafeAreaView is what makes
// the top inset reliable, not anything this component does itself.
export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, subtitle, onBack, children }) => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { state } = useAuth();
  const { colors } = useTheme();
  const styles = useMemoStyles(colors);
  const menu = useAccountMenu();
  const isAdmin = state.status === 'signedIn' && state.user.role === 'admin';
  // No point navigating to Setup from Setup itself.
  const showSettings = isAdmin && route.name !== 'Setup';

  return (
    <View style={styles.appbar}>
      <View style={styles.appbarTopRow}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={22} color={colors.cream} />
          </Pressable>
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.headerIcons}>
          {showSettings && (
            <Pressable
              testID="setup-button"
              accessibilityRole="button"
              accessibilityLabel="Setup"
              style={styles.setupButton}
              onPress={() => navigation.navigate('Setup')}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color="#fff" />
            </Pressable>
          )}
          <AccountMenuButton menu={menu} />
        </View>
      </View>
      {children}
      <AccountMenuModal menu={menu} />
    </View>
  );
};

const useMemoStyles = (colors: ColorTokens) => React.useMemo(() => createStyles(colors), [colors]);

const createStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    appbar: {
      backgroundColor: colors.chrome,
      padding: spacing.lg,
      paddingBottom: 14,
    },
    appbarTopRow: {
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
    // Same reasoning as AdminDashboardScreen's titleWrap: flex:1 so a long
    // title shrinks/wraps first instead of pushing the icons off-screen,
    // including under Android's larger-text accessibility setting.
    titleWrap: {
      flex: 1,
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    headerIcons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    setupButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(16, 24, 40, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
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
  });
