import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ScrollView,
  View,
  StyleSheet,
  Keyboard,
  Platform
} from 'react-native';

/**
 * ScrollableModal
 * A bulletproof modal wrapper that automatically tracks keyboard appearance on Android & iOS.
 * When keyboard opens, it expands bottom padding (keyboardHeight + 80) so that all inputs
 * and buttons can be freely scrolled completely ABOVE the soft keyboard.
 */
export default function ScrollableModal({
  visible,
  onRequestClose,
  children,
  contentStyle,
  animationType = 'fade',
  statusBarTranslucent = false,
  ...props
}) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e?.endCoordinates?.height || 280;
      setKeyboardHeight(h > 0 ? h : 280);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Reset keyboard height when modal closes
  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent={true}
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onRequestClose}
      {...props}
    >
      <View style={styles.modalBackdrop}>
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardHeight > 0
              ? {
                  justifyContent: 'flex-start',
                  paddingTop: 16,
                  paddingBottom: keyboardHeight + 80 // Extra room so inputs scroll well above keyboard
                }
              : {
                  justifyContent: 'center',
                  paddingVertical: 20
                }
          ]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={true}
        >
          <View style={[styles.modalCard, contentStyle]}>
            {children}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)'
  },
  scrollView: {
    flex: 1,
    width: '100%'
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10
  }
});
