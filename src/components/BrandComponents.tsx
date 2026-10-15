import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text } from 'react-native';

// assets/logo-mark.png's own height/width ratio (597/600, cropped tight to
// the artwork's bounding box) — keeps the badge from looking squashed/
// stretched at any display size instead of hardcoding a near-1:1 guess.
const LOGO_ASPECT_RATIO = 597 / 600;

// Nivenxa Technologies attribution URL — CLAUDE.md "Non-negotiables":
// deliberately routes to the software arm specifically (nivenxa.com's
// /technologies path), not the parent NIVENXA brand generally, for
// marketing/lead-generation value. Treated as a firm-wide template decision
// for future client apps, not a Peach & Blue-specific choice.
const NIVENXA_TECHNOLOGIES_URL = 'https://nivenxa.com/technologies';

// Fixed, non-themable Nivenxa Technologies attribution — CLAUDE.md: a
// tappable "Powered by Nivenxa Technologies" footer on every screen (splash
// screen carries the same wording but stays non-interactive — see
// SplashScreen.tsx). Deliberately hardcoded literal hex, not theme tokens
// (not even the "fixed" chrome/cream tokens) — this must always read as the
// app builder's mark, independent of anything Peach & Blue themes, including
// any future rebrand of the app's own palette.
export const NivenxaFooter: React.FC = () => (
  <Pressable
    style={styles.footer}
    onPress={() => Linking.openURL(NIVENXA_TECHNOLOGIES_URL)}
    accessibilityRole="link"
    // The footer bar itself stays a visually subtle 22px strip (original
    // branding requirement), but that's too thin a real tap target on its
    // own — hitSlop pads the actual touchable area beyond the visible bar
    // without growing it on screen.
    hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
  >
    <Text style={styles.footerText}>POWERED BY NIVENXA TECHNOLOGIES</Text>
  </Pressable>
);

interface SplashLogoProps {
  size?: 'large' | 'small';
}

// Real logo artwork (client-supplied) — the badge already carries its own
// "Peach & Blue / Laundry Services" wordmark in the brand's own typeface,
// so this replaces the old hand-styled "Peach" "&" "Blue" Text trio
// (a stand-in from before any real logo source file existed) rather than
// stacking both and showing the name twice.
export const SplashLogo: React.FC<SplashLogoProps> = ({ size = 'large' }) => {
  const isLarge = size === 'large';
  const markSize = isLarge ? 200 : 130;
  return (
    <Image
      source={require('../../assets/logo-mark.png')}
      style={{ width: markSize, height: markSize * LOGO_ASPECT_RATIO }}
      resizeMode="contain"
    />
  );
};

const styles = StyleSheet.create({
  footer: {
    height: 22,
    backgroundColor: '#0E2142',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    color: '#E9CDAC',
    fontSize: 8.5,
    fontWeight: '600',
    letterSpacing: 0.5,
    // Subtle tappability affordance — same convention as the About-page
    // credit (SettingsScreen.tsx), not a new pattern invented here.
    textDecorationLine: 'underline',
  },
});
