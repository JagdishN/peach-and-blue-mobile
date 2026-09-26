import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
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
  const resolvedBackgroundColor = backgroundColor ?? colors.peachBg;
  const Body = scroll ? ScrollView : View;
  const isSettingsScreen = route.name === 'Settings';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: resolvedBackgroundColor }]} edges={['top', 'left', 'right']}>
      {!isSettingsScreen && (
        <Pressable
          accessibilityRole="button"
          style={styles.globalSettingsButton}
          onPress={() => navigation.navigate('Settings')}
          hitSlop={8}
        >
          <Text style={styles.globalSettingsButtonText}>⚙</Text>
        </Pressable>
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
  globalSettingsButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
