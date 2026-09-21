import React, { useContext } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import StaffNavigator from './StaffNavigator';
import LoginScreen from '../screens/common/Login/LoginScreen';
import OwnerNavigator from './OwnerNavigator';
import { AuthContext } from '../context/AuthContext';

const Stack = createNativeStackNavigator();

export default function AppNavigation() {
  return (
    <Stack.Navigator 
      initialRouteName="StaffApp"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="StaffApp" component={StaffNavigator} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OwnerApp" component={OwnerNavigator} />
    </Stack.Navigator>
  );
}