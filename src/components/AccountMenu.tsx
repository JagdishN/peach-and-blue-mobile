import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { radii, spacing } from '../theme/theme';

// Shared account-menu state/logic — extracted out of AppScreen so a screen
// that needs the avatar placed inline in its own header (instead of
// AppScreen's default floating overlay) can drive the same button + dropdown
// without duplicating the open/close/logout/theme-toggle wiring.
export const useAccountMenu = () => {
  const navigation = useNavigation<any>();
  const { mode, toggleMode } = useTheme();
  const { state, signOut } = useAuth();
  const role = state.status === 'signedIn' ? state.user.role : null;
  // Client ask: a profile/avatar icon instead of a hamburger, distinct per
  // role so an admin can tell at a glance which account they're in — shield
  // for elevated (admin) access, plain person for staff.
  const iconName = role === 'admin' ? 'shield-account' : 'account-circle';
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = () => setMenuOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const navigateAbout = () => {
    closeMenu();
    navigation.navigate('Settings');
  };

  const handleLogout = () => {
    closeMenu();
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return { menuOpen, openMenu, closeMenu, iconName, mode, toggleMode, navigateAbout, handleLogout };
};

type AccountMenuState = ReturnType<typeof useAccountMenu>;

interface AccountMenuButtonProps {
  menu: AccountMenuState;
  style?: object;
}

// 44dp visual size (per the Overview-screen header fix) with hitSlop pushing
// the effective touch target past the 48dp minimum, without changing the
// icon/backdrop treatment used everywhere this already appears.
export const AccountMenuButton: React.FC<AccountMenuButtonProps> = ({ menu, style }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel="Account menu"
    style={[styles.button, style]}
    onPress={menu.openMenu}
    hitSlop={8}
  >
    <MaterialCommunityIcons name={menu.iconName as any} size={22} color="#fff" />
  </Pressable>
);

interface AccountMenuModalProps {
  menu: AccountMenuState;
}

export const AccountMenuModal: React.FC<AccountMenuModalProps> = ({ menu }) => {
  const { colors } = useTheme();
  return (
    <Modal visible={menu.menuOpen} transparent animationType="fade" onRequestClose={menu.closeMenu}>
      <Pressable style={styles.menuOverlay} onPress={menu.closeMenu}>
        <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
          <Pressable style={styles.menuItem} onPress={menu.navigateAbout}>
            <MaterialCommunityIcons name="information-outline" size={16} color={colors.navyText} />
            <Text style={[styles.menuItemText, { color: colors.navyText }]}>About</Text>
          </Pressable>
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          {/* Not a Pressable wrapping the Switch — the Switch already has its
              own touch target and onValueChange; wrapping it in an outer
              onPress too would double-toggle on a single tap. */}
          <View style={[styles.menuItem, styles.menuItemSpaceBetween]}>
            <View style={styles.menuItemInner}>
              <MaterialCommunityIcons
                name={menu.mode === 'dark' ? 'weather-night' : 'white-balance-sunny'}
                size={16}
                color={colors.navyText}
              />
              <Text style={[styles.menuItemText, { color: colors.navyText }]}>Dark Mode</Text>
            </View>
            <Switch
              value={menu.mode === 'dark'}
              onValueChange={menu.toggleMode}
              trackColor={{ false: colors.border, true: colors.peachPrimary }}
              thumbColor={colors.white}
            />
          </View>
          <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
          <Pressable style={styles.menuItem} onPress={menu.handleLogout}>
            <MaterialCommunityIcons name="logout" size={16} color={colors.danger} />
            <Text style={[styles.menuItemText, { color: colors.danger }]}>Log Out</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 24, 40, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
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
