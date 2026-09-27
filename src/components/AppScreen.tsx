import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radii, spacing } from '../theme/theme';
import { NivenxaFooter } from './BrandComponents';

interface AppScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  backgroundColor?: string;
  contentStyle?: ViewStyle;
}

// Every screen in both the Staff and Admin stacks renders through this
// wrapper so the NIVENXA footer (CLAUDE.md non-negotiable) is a structural
// guarantee rather than something to remember per-screen.
export const AppScreen: React.FC<AppScreenProps> = ({ children, scroll = true, backgroundColor, contentStyle }) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, mode, toggleMode } = useTheme();
  const { state, signOut } = useAuth();
  const role = state.status === 'signedIn' ? state.user.role : null;
  // Client ask: a profile/avatar icon instead of a hamburger, distinct per
  // role so an admin can tell at a glance which account they're in — shield
  // for elevated (admin) access, plain person for staff.
  const menuIconName = role === 'admin' ? 'shield-account' : 'account-circle';
  const resolvedBackgroundColor = backgroundColor ?? colors.peachBg;
  const Body = scroll ? ScrollView : View;
  // Hidden on Settings itself (already there) and on Login — 'Settings' isn't
  // even registered in the pre-auth stack (RootNavigator only mounts
  // AdminStack/StaffStack, where it lives, once signed in), and "Logout"
  // makes no sense before signing in anyway.
  const hideMenu = route.name === 'Settings' || route.name === 'Login';
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    setMenuOpen(false);
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: resolvedBackgroundColor }]} edges={['top', 'left', 'right']}>
      {!hideMenu && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account menu"
            style={styles.globalSettingsButton}
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name={menuIconName} size={20} color="#fff" />
          </Pressable>

          <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
            <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
              <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate('Settings');
                  }}
                >
                  <MaterialCommunityIcons name="information-outline" size={16} color={colors.navyText} />
                  <Text style={[styles.menuItemText, { color: colors.navyText }]}>About</Text>
                </Pressable>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                {/* Not a Pressable wrapping the Switch — the Switch already
                    has its own touch target and onValueChange; wrapping it in
                    an outer onPress too would double-toggle on a single tap. */}
                <View style={[styles.menuItem, styles.menuItemSpaceBetween]}>
                  <View style={styles.menuItemInner}>
                    <MaterialCommunityIcons
                      name={mode === 'dark' ? 'weather-night' : 'white-balance-sunny'}
                      size={16}
                      color={colors.navyText}
                    />
                    <Text style={[styles.menuItemText, { color: colors.navyText }]}>Dark Mode</Text>
                  </View>
                  <Switch
                    value={mode === 'dark'}
                    onValueChange={toggleMode}
                    trackColor={{ false: colors.border, true: colors.peachPrimary }}
                    thumbColor={colors.white}
                  />
                </View>
                <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
                <Pressable style={styles.menuItem} onPress={handleLogout}>
                  <MaterialCommunityIcons name="logout" size={16} color={colors.danger} />
                  <Text style={[styles.menuItemText, { color: colors.danger }]}>Log Out</Text>
                </Pressable>
              </View>
            </Pressable>
          </Modal>
        </>
      )}
      {/* keyboardShouldPersistTaps: ScrollView's default ('never') swallows
          the FIRST tap on anything else in here while a TextInput has focus
          and the keyboard is up — it just dismisses the keyboard instead of
          reaching the child, e.g. a Sign In button right below an OTP field
          needing a second tap to actually register. 'handled' lets a tap on
          another touchable go through immediately. No-op on the `scroll`
          false branch, where Body is a plain View. */}
      <Body
        style={styles.body}
        contentContainerStyle={scroll ? [styles.content, contentStyle] : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {scroll ? children : <View style={[styles.content, contentStyle]}>{children}</View>}
      </Body>
      <NivenxaFooter />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    // Without this, react-native-web's CSS flexbox defaults this box's
    // min-height to its content's natural height (the standard flexbox
    // "min-height: auto" floor) — so a screen with a long list inside just
    // grows past the viewport instead of being clipped to it, and any
    // ScrollView further down the tree never gets a bounded box to scroll
    // within. Native (Yoga) doesn't have this floor, so this only ever
    // shows up when running via `expo start --web`.
    minHeight: 0,
  },
  content: {
    padding: 14,
    flexGrow: 1,
    minHeight: 0,
  },
  globalSettingsButton: {
    position: 'absolute',
    top: 16,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(16, 24, 40, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,33,66,0.15)',
  },
  menuCard: {
    position: 'absolute',
    top: 52,
    right: 14,
    minWidth: 190,
    borderRadius: radii.md,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemSpaceBetween: {
    justifyContent: 'space-between',
  },
  menuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuItemText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    marginHorizontal: spacing.sm,
  },
});
