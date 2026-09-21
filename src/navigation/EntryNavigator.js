import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DailyEntryScreen from '../screens/salesman/DailyEntry/DailyEntryScreen';

const Stack = createNativeStackNavigator();

export default function EntryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DailyEntryMain" component={DailyEntryScreen} />
    </Stack.Navigator>
  );
}
