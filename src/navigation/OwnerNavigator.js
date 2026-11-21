import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OwnerDashboardScreen from '../screens/owner/OwnerDashboard/OwnerDashboardScreen';
import SettingsScreen from '../screens/owner/Settings/SettingsScreen';
import ReportsScreen from '../screens/owner/Reports/ReportsScreen';
import CashManagementScreen from '../screens/owner/CashManagement/CashManagementScreen';
import OnloadScreen from '../screens/common/Onload/OnloadScreen';

const Tab = createBottomTabNavigator();

export default function OwnerNavigator({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#003C8F' }, // IOCL Blue for owner
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerRight: () => (
          <TouchableOpacity 
            style={styles.switchBtn} 
            onPress={() => navigation.navigate('StaffApp')}
            activeOpacity={0.8}
          >
            <Icon name="swap-horizontal" size={16} color="#003C8F" style={{ marginRight: 4 }} />
            <Text style={styles.switchBtnText}>Staff App</Text>
          </TouchableOpacity>
        ),
        tabBarActiveTintColor: '#FF6F00', // IOCL Orange
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === 'Cash') {
            iconName = focused ? 'cash' : 'cash-outline';
          } else if (route.name === 'Onload') {
            iconName = focused ? 'funnel' : 'funnel-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Icon name={iconName} size={24} color={color} />;
        },
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 5),
          paddingTop: 5,
          height: 60 + Math.max(insets.bottom, 0),
          backgroundColor: '#fff',
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={OwnerDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Cash" component={CashManagementScreen} options={{ title: 'Cash' }} />
      <Tab.Screen name="Onload" component={OnloadScreen} options={{ title: 'Onload', tabBarLabel: 'Onload' }} />
      <Tab.Screen name="Reports" component={ReportsScreen} options={{ title: 'Report' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Master Config' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginRight: 12,
    elevation: 2
  },
  switchBtnText: {
    color: '#003C8F',
    fontWeight: 'bold',
    fontSize: 12
  }
});
