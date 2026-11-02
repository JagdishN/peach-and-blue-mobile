import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { NivenxaFooter } from './BrandComponents';
import { radii, spacing } from '../theme/theme';

interface FormSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// Shared bottom-sheet for every Add/Edit form.
//
// Layout: the ScrollView must NOT be given `flex: 1`. Yoga resolves a
// positive `flex` to flexBasis 0 (yoga/node/Node.cpp processFlexBasis), and
// the card has no height of its own (it sizes to content), so the ScrollView
// collapsed to 0 height — the sheet "opened" as just a dimmed backdrop.
// Instead the ScrollView keeps its built-in flexGrow/flexShrink with an auto
// basis (= content height), and the card is allowed to shrink, so a short
// form sizes to its content and a long one is capped and scrolls.
//
// Android: under SDK 57's enforced edge-to-edge, RN's Modal window draws
// under both system bars (ReactModalHostView.kt), and adjustResize no longer
// shrinks content for the keyboard — so top/bottom insets and keyboard
// avoidance are handled here explicitly, on both platforms.
export const FormSheet: React.FC<FormSheetProps> = ({ visible, onClose, children }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.overlay, { paddingTop: insets.top + spacing.xl }]}
      >
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
        {/* The keyboard already covers the nav-bar area while it's open —
            keeping the inset then would leave an empty gap above it. */}
        <View style={[styles.footerWrap, { paddingBottom: keyboardVisible ? 0 : insets.bottom }]}>
          <NivenxaFooter />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(14,33,66,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    flexShrink: 1,
    // react-native-web's flexbox min-height:auto floor would otherwise stop
    // the card shrinking below its content (see AppScreen.tsx `body`).
    minHeight: 0,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
  },
  scroll: {
    minHeight: 0,
  },
  content: {
    padding: spacing.lg,
  },
  footerWrap: {
    backgroundColor: '#0E2142',
  },
});
