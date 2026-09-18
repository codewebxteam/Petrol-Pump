import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OwnerDashboardScreen from '../screens/owner/OwnerDashboard/OwnerDashboardScreen';
import SettingsScreen from '../screens/owner/Settings/SettingsScreen';
import ReportsScreen from '../screens/owner/Reports/ReportsScreen';
import EntryNavigator from './EntryNavigator';

const Tab = createBottomTabNavigator();

export default function OwnerNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#003C8F' }, // IOCL Blue for owner
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: '#FF6F00', // IOCL Orange
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === 'Entry') {
            iconName = focused ? 'create' : 'create-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Icon name={iconName} size={24} color={color} />;
        },
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 5), // dynamic padding for phone navigation
          paddingTop: 5,
          height: 60 + Math.max(insets.bottom, 0), // dynamic height for phone navigation
          backgroundColor: '#fff',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={OwnerDashboardScreen} />
      <Tab.Screen name="Entry" component={EntryNavigator} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
