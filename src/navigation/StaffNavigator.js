import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/Ionicons';
import { AuthContext } from '../context/AuthContext';

import DailyEntryScreen from '../screens/salesman/DailyEntry/DailyEntryScreen';
import ReportsScreen from '../screens/owner/Reports/ReportsScreen';
import OnloadScreen from '../screens/common/Onload/OnloadScreen';
import DailyPhotosScreen from '../screens/salesman/DailyPhotos/DailyPhotosScreen';
import StaffHistoryScreen from '../screens/salesman/History/StaffHistoryScreen';

const Tab = createBottomTabNavigator();

export default function StaffNavigator({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, userData } = useContext(AuthContext);

  const handleAdminPress = () => {
    if (user && userData) {
      navigation.navigate('OwnerApp');
    } else {
      navigation.navigate('Login');
    }
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#003C8F' }, // IOCL Blue
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        headerTitle: () => (
          <View style={styles.headerTitleContainer}>
            <Image 
              source={require('../../assets/pump-logo.png')} 
              style={styles.logoIcon} 
              resizeMode="contain" 
            />
            <View>
              <Text style={styles.headerMainText}>IOCL Staff App</Text>
              <Text style={styles.headerSubText}>IndianOil Daily Sales</Text>
            </View>
          </View>
        ),
        headerRight: () => (
          <TouchableOpacity 
            style={styles.adminPortalBtn} 
            onPress={handleAdminPress}
            activeOpacity={0.8}
          >
            <Icon name="shield-checkmark" size={16} color="#003C8F" style={{ marginRight: 4 }} />
            <Text style={styles.adminPortalBtnText}>
              {user && userData ? 'Admin Panel' : 'Admin Login'}
            </Text>
          </TouchableOpacity>
        ),
        tabBarActiveTintColor: '#FF6F00', // IOCL Orange
        tabBarInactiveTintColor: '#64748B',
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'DailyEntry') {
            iconName = focused ? 'create' : 'create-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Onload') {
            iconName = focused ? 'funnel' : 'funnel-outline';
          } else if (route.name === 'DailyPhotos') {
            iconName = focused ? 'camera' : 'camera-outline';
          } else if (route.name === 'StaffHistory') {
            iconName = focused ? 'time' : 'time-outline';
          }
          return <Icon name={iconName} size={22} color={color} />;
        },
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
          height: 62 + Math.max(insets.bottom, 0),
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          elevation: 4
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700'
        }
      })}
    >
      <Tab.Screen 
        name="DailyEntry" 
        component={DailyEntryScreen} 
        options={{ tabBarLabel: 'Daily Entry' }} 
      />
      <Tab.Screen 
        name="Reports" 
        component={ReportsScreen} 
        options={{ tabBarLabel: 'Reports' }} 
      />
      <Tab.Screen 
        name="Onload" 
        component={OnloadScreen} 
        options={{ tabBarLabel: 'Onload' }} 
      />
      <Tab.Screen 
        name="DailyPhotos" 
        component={DailyPhotosScreen} 
        options={{ tabBarLabel: 'Photos' }} 
      />
      <Tab.Screen 
        name="StaffHistory" 
        component={StaffHistoryScreen} 
        options={{ tabBarLabel: 'History' }} 
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#fff'
  },
  headerMainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  headerSubText: {
    color: '#BAE6FD',
    fontSize: 11,
    fontWeight: '500'
  },
  adminPortalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2
  },
  adminPortalBtnText: {
    color: '#003C8F',
    fontWeight: 'bold',
    fontSize: 12
  }
});
