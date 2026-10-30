import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { NivenxaFooter } from './BrandComponents';
import { AccountMenuButton, AccountMenuModal, useAccountMenu } from './AccountMenu';

interface AppScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  backgroundColor?: string;
  contentStyle?: ViewStyle;
  // Set by a screen that places the account-menu avatar inline in its own
  // header (via AccountMenuButton/useAccountMenu directly) instead of using
  // this component's default floating overlay — see AdminDashboardScreen's
  // "Overview" header for why: the floating overlay sits outside this
  // SafeAreaView's normal flex flow, so on some Android devices (status bar
  // height/display-cutout combinations) it isn't reliably positioned below
  // the status bar. A screen that opts in is responsible for rendering its
  // own AccountMenuButton + AccountMenuModal.
  avatarInHeader?: boolean;
}

// Every screen in both the Staff and Admin stacks renders through this
// wrapper so the NIVENXA footer (CLAUDE.md non-negotiable) is a structural
// guarantee rather than something to remember per-screen.
export const AppScreen: React.FC<AppScreenProps> = ({
  children,
  scroll = true,
  backgroundColor,
  contentStyle,
  avatarInHeader = false,
}) => {
  const route = useRoute<any>();
  const { colors } = useTheme();
  const resolvedBackgroundColor = backgroundColor ?? colors.peachBg;
  const Body = scroll ? ScrollView : View;
  // Hidden on Settings itself (already there) and on Login — 'Settings' isn't
  // even registered in the pre-auth stack (RootNavigator only mounts
  // AdminStack/StaffStack, where it lives, once signed in), and "Logout"
  // makes no sense before signing in anyway.
  const hideMenu = route.name === 'Settings' || route.name === 'Login';
  const menu = useAccountMenu();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: resolvedBackgroundColor }]} edges={['top', 'left', 'right']}>
      {!hideMenu && !avatarInHeader && (
        <>
          <AccountMenuButton menu={menu} style={styles.globalSettingsButton} />
          <AccountMenuModal menu={menu} />
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
    zIndex: 10,
    elevation: 4,
  },
});
