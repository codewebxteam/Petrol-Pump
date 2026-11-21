import 'react-native-gesture-handler'; // इसे सबसे ऊपर ही रखना
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigation from './src/navigation/AppNavigation';
import { AuthProvider } from './src/context/AuthContext';
import Toast from 'react-native-toast-message';

// Keep the native splash screen visible while loading resources
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Show our branded logo screen for ~1.2s to provide a seamless branded experience
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } catch (e) {
        console.warn('Splash prepare warning:', e);
      } finally {
        await SplashScreen.hideAsync().catch(() => {});
        setIsAppReady(true);
      }
    }
    prepare();
  }, []);

  if (!isAppReady) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <View style={styles.splashContent}>
          <View style={styles.logoWrapper}>
            <Image
              source={require('./assets/pump-logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>इंडियनऑयल पेट्रोल पंप</Text>
          <Text style={styles.brandSubtitle}>दैनिक बिक्री एवं स्टॉक प्रबंधन</Text>
          <ActivityIndicator size="large" color="#FF6F00" style={{ marginTop: 24 }} />
        </View>
        <View style={styles.splashFooter}>
          <Text style={styles.footerText}>सुरक्षित एवं डिजिटल प्रबंधन प्रणाली</Text>
        </View>
      </View>
    );
  }

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#003C8F" />
        <NavigationContainer>
          <AppNavigation />
        </NavigationContainer>
        <Toast />
      </SafeAreaProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  splashContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFF3E0'
  },
  logoImage: {
    width: 110,
    height: 110
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginTop: 8
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4
  },
  splashFooter: {
    paddingBottom: 30
  },
  footerText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600'
  }
});