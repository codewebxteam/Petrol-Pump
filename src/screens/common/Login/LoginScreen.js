import React, { useState, useContext } from 'react';
import { 
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, 
  Alert, TouchableOpacity, Image, ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../../services/firebase';
import { AuthContext } from '../../../context/AuthContext';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import Icon from '@expo/vector-icons/Ionicons';

export default function LoginScreen({ navigation }) {
  const { loginWithPin, directAdminAccess } = useContext(AuthContext);
  
  const [loginMethod, setLoginMethod] = useState('direct'); // 'direct', 'pin', 'email'
  
  // PIN State
  const [pin, setPin] = useState('1234');
  
  // Email/Pass State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Direct 1-Click Access (Zero Password, Zero Wait)
  const handleDirectAccess = async () => {
    setLoading(true);
    try {
      const res = await directAdminAccess();
      if (res.success) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'OwnerApp' }]
        });
      } else {
        Alert.alert('Error', res.error || 'Direct access failed');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. PIN Login Handler (Super Fast & Reliable)
  const handlePinLogin = async (customPin) => {
    const pinToUse = customPin || pin;
    if (!pinToUse || pinToUse.length < 4) {
      Alert.alert('Required', 'कृपया 4-अंकों का एडमिन पिन दर्ज करें (डिफ़ॉल्ट: 1234)');
      return;
    }

    setLoading(true);
    try {
      const res = await loginWithPin(pinToUse.trim());
      if (res.success) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'OwnerApp' }]
        });
      } else {
        Alert.alert('त्रुटि', res.error || 'अमान्य पिन');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Firebase Email/Password Login Handler
  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'कृपया ईमेल और पासवर्ड दोनों दर्ज करें.');
      return;
    }

    setLoading(true);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('कनेक्शन टाइमआउट: कृपया "डायरेक्ट एडमिन" या "पिन" विकल्प का उपयोग करें.')), 8000)
      );

      await Promise.race([
        signInWithEmailAndPassword(auth, email.trim(), password),
        timeoutPromise
      ]);

      navigation.reset({
        index: 0,
        routes: [{ name: 'OwnerApp' }]
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Login Failed', error.message || 'ईमेल या पासवर्ड गलत है.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
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
              <Text style={styles.backBtnText}>स्टाफ ऐप पर वापस जाएं (Staff App)</Text>
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
                मालिक / प्रबंधक पहुंच (Owner & Manager Access)
              </Text>
            </View>

            {/* Toggle Tabs: Direct vs PIN vs Email */}
            <View style={styles.toggleContainer}>
              <TouchableOpacity 
                style={[styles.toggleBtn, loginMethod === 'direct' && styles.toggleBtnActive]}
                onPress={() => setLoginMethod('direct')}
              >
                <Icon name="flash" size={15} color={loginMethod === 'direct' ? '#fff' : '#003C8F'} style={{marginRight: 4}} />
                <Text style={[styles.toggleText, loginMethod === 'direct' && styles.toggleTextActive]}>
                  1-क्लिक प्रवेश
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toggleBtn, loginMethod === 'pin' && styles.toggleBtnActive]}
                onPress={() => setLoginMethod('pin')}
              >
                <Icon name="keypad" size={15} color={loginMethod === 'pin' ? '#fff' : '#003C8F'} style={{marginRight: 4}} />
                <Text style={[styles.toggleText, loginMethod === 'pin' && styles.toggleTextActive]}>
                  पिन (1234)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toggleBtn, loginMethod === 'email' && styles.toggleBtnActive]}
                onPress={() => setLoginMethod('email')}
              >
                <Icon name="mail" size={15} color={loginMethod === 'email' ? '#fff' : '#003C8F'} style={{marginRight: 4}} />
                <Text style={[styles.toggleText, loginMethod === 'email' && styles.toggleTextActive]}>
                  ईमेल ID
                </Text>
              </TouchableOpacity>
            </View>

            {loginMethod === 'direct' && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.directBox}>
                  <Icon name="checkmark-done-circle" size={32} color="#16A34A" />
                  <Text style={styles.directTitle}>बिना पासवर्ड के तुरंत खोलें</Text>
                  <Text style={styles.directDesc}>
                    यदि आप पंप के मालिक हैं और बिना पासवर्ड या लोडिंग की परेशानी के सीधे डैशबोर्ड देखना चाहते हैं:
                  </Text>
                </View>

                <CustomButton 
                  title="🚀 सीधा एडमिन पैनल खोलें (DIRECT ACCESS)" 
                  onPress={handleDirectAccess} 
                  loading={loading} 
                  type="primary"
                  icon="shield-checkmark-outline"
                  style={{ marginTop: 16 }}
                />

                <TouchableOpacity 
                  style={styles.orPinBtn}
                  onPress={() => {
                    setLoginMethod('pin');
                    handlePinLogin('1234');
                  }}
                >
                  <Text style={styles.orPinText}>या 1234 पिन से तुरंत लॉगिन करें ➔</Text>
                </TouchableOpacity>
              </View>
            )}

            {loginMethod === 'pin' && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.pinInfoBox}>
                  <Icon name="information-circle" size={18} color="#0284C7" />
                  <Text style={styles.pinInfoText}>
                    डिफ़ॉल्ट एडमिन पिन: <Text style={{fontWeight: 'bold'}}>1234</Text> (तुरंत लॉगिन के लिए)
                  </Text>
                </View>

                <CustomInput
                  label="4-अंकों का एडमिन पिन दर्ज करें"
                  placeholder="1234"
                  leftIcon="lock-closed-outline"
                  secureTextEntry={true}
                  value={pin}
                  onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                  maxLength={6}
                />

                <CustomButton 
                  title="पिन से एडमिन पैनल खोलें" 
                  onPress={() => handlePinLogin()} 
                  loading={loading} 
                  type="primary"
                  icon="keypad-outline"
                  style={{ marginTop: 8 }}
                />

                <CustomButton 
                  title="⚡ 1-क्लिक डिफ़ॉल्ट (1234) लॉगिन" 
                  onPress={() => handlePinLogin('1234')} 
                  loading={loading} 
                  type="secondary"
                  icon="flash-outline"
                  style={{ marginTop: 8 }}
                />
              </View>
            )}

            {loginMethod === 'email' && (
              <View style={{ marginTop: 10 }}>
                <CustomInput
                  label="Admin Email Address"
                  placeholder="admin@example.com"
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
                  title="LOGIN WITH EMAIL" 
                  onPress={handleEmailLogin} 
                  loading={loading} 
                  type="primary"
                  icon="log-in-outline"
                  style={{ marginTop: 8 }}
                />
              </View>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
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

  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10
  },
  toggleBtnActive: {
    backgroundColor: '#003C8F',
    elevation: 2
  },
  toggleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003C8F'
  },
  toggleTextActive: {
    color: '#fff'
  },

  pinInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 14
  },
  pinInfoText: {
    fontSize: 12,
    color: '#0369A1',
    marginLeft: 6,
    flex: 1
  },

  directBox: {
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 4
  },
  directTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803D',
    marginTop: 8,
    marginBottom: 4
  },
  directDesc: {
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
    lineHeight: 18
  },
  orPinBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8
  },
  orPinText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#003C8F'
  }
});
