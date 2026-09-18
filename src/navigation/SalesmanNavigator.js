import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardScreen from '../screens/salesman/Dashboard/DashboardScreen';
import ShiftStartScreen from '../screens/salesman/ShiftStart/ShiftStartScreen';
import ShiftEndScreen from '../screens/salesman/ShiftEnd/ShiftEndScreen';
import HistoryScreen from '../screens/salesman/History/HistoryScreen';

const Tab = createBottomTabNavigator();

export default function SalesmanNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#FF6F00' }, // IOCL Orange
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarActiveTintColor: '#003C8F', // IOCL Blue
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Start Shift') {
            iconName = focused ? 'play-circle' : 'play-circle-outline';
          } else if (route.name === 'End Shift') {
            iconName = focused ? 'stop-circle' : 'stop-circle-outline';
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
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Start Shift" component={ShiftStartScreen} />
      <Tab.Screen name="End Shift" component={ShiftEndScreen} />
    </Tab.Navigator>
  );
}
