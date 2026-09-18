import 'react-native-gesture-handler'; // इसे सबसे ऊपर ही रखना
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import AppNavigation from './src/navigation/AppNavigation';
import { AuthProvider } from './src/context/AuthContext';
import Toast from 'react-native-toast-message';

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#FF6F00" />
        <NavigationContainer>
          <AppNavigation />
        </NavigationContainer>
        <Toast />
      </SafeAreaProvider>
    </AuthProvider>
  );
}