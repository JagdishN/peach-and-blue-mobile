import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { navigationRef, navigateToOrder } from './src/navigation/navigationRef';
import { SplashScreen } from './src/screens/shared/SplashScreen';
import { registerForPushNotifications } from './src/services/pushNotifications';
import { useFonts } from 'expo-font';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const SPLASH_DURATION_MS = 2000;

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Shown on EVERY cold start, not just first install — CLAUDE.md is explicit
// this is not a one-time onboarding splash. Deliberately no persisted
// "have I shown this before" flag anywhere here. Stays up until the
// 2-second timer has elapsed, the stored-auth-token restore has resolved,
// and the icon fonts used by the tab bar and other vector-icons components
// have finished loading. Otherwise Ionicons glyphs render as empty boxes on
// the installed production app.
function AppContent() {
  const { state } = useAuth();
  const { mode } = useTheme();
  const statusBarStyle = mode === 'dark' ? 'light' : 'dark';
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [iconsLoaded] = useFonts({ ...Ionicons.font, ...MaterialCommunityIcons.font });

  useEffect(() => {
    const timer = setTimeout(() => setSplashElapsed(true), SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  // Registers (or re-registers) this device for push on every transition
  // into a signed-in state — covers both a fresh sign-in and a restored
  // session on reopen. Best-effort: a denied permission or missing EAS
  // project id shouldn't block anything else in the app.
  useEffect(() => {
    if (state.status === 'signedIn') {
      registerForPushNotifications().catch((err) => console.warn('Push registration failed:', err));
    }
  }, [state.status]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const orderId = response.notification.request.content.data?.orderId as string | undefined;
      if (orderId) {
        navigateToOrder(orderId);
      }
    });
    return () => subscription.remove();
  }, []);

  const showSplash = !splashElapsed || state.status === 'loading' || !iconsLoaded;

  if (showSplash) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <SplashScreen />
      </>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style={statusBarStyle} />
      <RootNavigator />
    </NavigationContainer>
  );
}
