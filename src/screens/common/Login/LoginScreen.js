import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../services/firebase';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both Email and Password.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      console.error(error);
      Alert.alert('Login Failed', error.message || 'Invalid Email or Password.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image source={require('../../../../assets/pump-logo.png')} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Text style={styles.subtitle}>Pump Management System</Text>

          <View style={styles.portalHeaderContainer}>
            <Text style={styles.portalHeading}>
              👑 Admin Portal
            </Text>
            <Text style={styles.portalSubText}>
              Please login to your account
            </Text>
          </View>

          <CustomInput
            placeholder={"Admin Email Address"}
            leftIcon="mail-outline"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <CustomInput
            placeholder={"Password (min 6 chars)"}
            leftIcon="lock-closed-outline"
            secureTextEntry={true}
            value={password}
            onChangeText={setPassword}
          />

          <CustomButton 
            title={"LOGIN AS ADMIN"} 
            onPress={handleLogin} 
            loading={loading} 
            type={'primary'}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f4f4' },
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', padding: 25, borderRadius: 15, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  logoContainer: { alignItems: 'center', marginBottom: 10 },
  logoImage: { width: 120, height: 120 },
  subtitle: { fontSize: 16, color: '#003C8F', textAlign: 'center', marginBottom: 20, fontWeight: '600' },
  
  portalHeaderContainer: { alignItems: 'center', marginBottom: 20 },
  portalHeading: { fontSize: 22, fontWeight: '900', marginBottom: 5, color: '#003C8F' },
  portalSubText: { fontSize: 13, color: '#888', fontWeight: '500' }
});
