import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
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
  const { colors } = useTheme();
  const { signOut } = useAuth();
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
            accessibilityLabel="Menu"
            style={styles.globalSettingsButton}
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="menu" size={18} color="#fff" />
          </Pressable>

          <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
            <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
              <View style={styles.menuCard}>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    navigation.navigate('Settings');
                  }}
                >
                  <MaterialCommunityIcons name="information-outline" size={16} color="#17315E" />
                  <Text style={styles.menuItemText}>About</Text>
                </Pressable>
                <View style={styles.menuDivider} />
                <Pressable style={styles.menuItem} onPress={handleLogout}>
                  <MaterialCommunityIcons name="logout" size={16} color="#C24545" />
                  <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Log Out</Text>
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
    minWidth: 150,
    backgroundColor: '#fff',
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
  menuItemText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#17315E',
  },
  menuItemTextDanger: {
    // Matches theme.ts's `danger` token (#C24545, same in both light/dark) —
    // this menu's colors are fixed regardless of theme, same as the ⋮ button
    // and NivenxaFooter, so hardcoded rather than pulled from useTheme().
    color: '#C24545',
  },
  menuDivider: {
    height: 1,
    backgroundColor: 'rgba(16, 24, 40, 0.08)',
    marginHorizontal: spacing.sm,
  },
});
