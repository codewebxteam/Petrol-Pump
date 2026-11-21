import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, 
  Alert, TouchableOpacity, Image, ScrollView, Modal, ActivityIndicator, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../services/firebase';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import Icon from '@expo/vector-icons/Ionicons';

export default function LoginScreen({ navigation }) {
  // Email/Pass State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot Password Modal State
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  // Firebase Email/Password Login Handler (Production Standard)
  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required Fields', 'Please enter both admin email and password.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);

      navigation.reset({
        index: 0,
        routes: [{ name: 'OwnerApp' }]
      });
    } catch (error) {
      console.error("Login error:", error);
      let errMsg = 'Invalid email or password.';
      if (error.code === 'auth/user-not-found') {
        errMsg = 'This email address is not registered as an administrator.';
      } else if (error.code === 'auth/wrong-password') {
        errMsg = 'Incorrect password. Please verify and try again.';
      } else if (error.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address format.';
      } else if (error.code === 'auth/too-many-requests') {
        errMsg = 'Too many failed attempts. Please try again in a few minutes.';
      }
      Alert.alert('Login Failed', errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Open Forgot Password Modal
  const openForgotPasswordModal = () => {
    setResetEmail(email.trim());
    setForgotModalVisible(true);
  };

  // Send Password Reset Email Handler
  const handleSendPasswordReset = async () => {
    const targetEmail = resetEmail.trim().toLowerCase();
    if (!targetEmail) {
      Alert.alert('Email Required', 'Please enter your registered admin email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address format.');
      return;
    }

    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setForgotModalVisible(false);
      Alert.alert(
        '✅ Password Reset Email Sent',
        `A password reset link has been dispatched to:\n\n${targetEmail}\n\n1. Open your Email Inbox or Spam/Junk folder.\n2. Click the link to set your new password.\n3. Return to this app and log in with your new password.`
      );
    } catch (err) {
      console.error("Forgot password error:", err);
      let errMsg = err.message || 'Could not send reset email.';
      if (err.code === 'auth/user-not-found') {
        errMsg = `No administrator account found with email "${targetEmail}". Please check your email ID.`;
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address format. Please check the entered email.';
      } else if (err.code === 'auth/too-many-requests') {
        errMsg = 'Too many requests. Please wait a few moments before trying again.';
      } else if (err.code === 'auth/network-request-failed') {
        errMsg = 'Network connection error. Please check your internet connection.';
      }
      Alert.alert('Reset Failed', errMsg);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.card}>
            {/* Back to Staff App */}
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={() => {
                if (navigation.canGoBack()) navigation.goBack();
                else navigation.navigate('StaffApp');
              }}
            >
              <Icon name="arrow-back-circle" size={24} color="#003C8F" />
              <Text style={styles.backBtnText}>Back to Staff App</Text>
            </TouchableOpacity>

            <View style={styles.logoContainer}>
              <Image source={require('../../../../assets/pump-logo.png')} style={styles.logoImage} resizeMode="contain" />
            </View>
            <Text style={styles.subtitle}>IOCL Pump Management System</Text>

            <View style={styles.portalHeaderContainer}>
              <Text style={styles.portalHeading}>
                👑 Admin Portal
              </Text>
              <Text style={styles.portalSubText}>
                Owner & Manager Secure Access
              </Text>
            </View>

            <View style={{ marginTop: 10 }}>
              <CustomInput
                label="Admin Email ID"
                placeholder="admin@iocl.com"
                leftIcon="mail-outline"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <CustomInput
                label="Password"
                placeholder="••••••••"
                leftIcon="lock-closed-outline"
                secureTextEntry={true}
                value={password}
                onChangeText={setPassword}
              />

              <CustomButton 
                title="LOGIN AS ADMIN" 
                onPress={handleEmailLogin} 
                loading={loading} 
                type="primary"
                icon="log-in-outline"
                style={{ marginTop: 10 }}
              />

              <TouchableOpacity 
                style={{ marginTop: 16, alignItems: 'center', padding: 6 }}
                onPress={openForgotPasswordModal}
              >
                <Text style={{ color: '#003C8F', fontSize: 13, fontWeight: 'bold' }}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={forgotModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
        statusBarTranslucent={true}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Icon name="key-outline" size={28} color="#003C8F" />
            </View>

            <Text style={styles.modalTitle}>Reset Admin Password</Text>
            <Text style={styles.modalDesc}>
              Enter your registered Administrator Email ID below. A secure password reset link will be sent to your inbox:
            </Text>

            <View style={styles.modalInputWrap}>
              <Icon name="mail-outline" size={18} color="#64748B" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalTextInput}
                placeholder="admin@iocl.com"
                placeholderTextColor="#94A3B8"
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity 
              style={styles.modalSubmitBtn}
              onPress={handleSendPasswordReset}
              disabled={sendingReset}
              activeOpacity={0.8}
            >
              {sendingReset ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="send-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.modalSubmitBtnText}>SEND RESET LINK</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalCancelBtn}
              onPress={() => setForgotModalVisible(false)}
              disabled={sendingReset}
            >
              <Text style={styles.modalCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 100 },
  card: { 
    backgroundColor: '#fff', 
    padding: 24, 
    borderRadius: 20, 
    elevation: 5, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 3 }, 
    shadowOpacity: 0.12, 
    shadowRadius: 6 
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  backBtnText: { color: '#003C8F', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  logoContainer: { alignItems: 'center', marginBottom: 6 },
  logoImage: { width: 80, height: 80 },
  subtitle: { fontSize: 13, color: '#003C8F', textAlign: 'center', marginBottom: 15, fontWeight: '700' },
  
  portalHeaderContainer: { alignItems: 'center', marginBottom: 16 },
  portalHeading: { fontSize: 22, fontWeight: '900', marginBottom: 4, color: '#003C8F' },
  portalSubText: { fontSize: 13, color: '#64748B', fontWeight: '500' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  modalIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center'
  },
  modalDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18
  },
  modalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
    marginBottom: 18
  },
  modalTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A'
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    backgroundColor: '#003C8F',
    borderRadius: 12,
    paddingVertical: 13,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  modalCancelBtn: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  modalCancelBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600'
  }
});
