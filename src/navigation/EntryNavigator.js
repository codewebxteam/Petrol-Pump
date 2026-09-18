import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ShiftEntryMenu from '../screens/owner/ShiftEntry/ShiftEntryMenu';
import ShiftStartScreen from '../screens/salesman/ShiftStart/ShiftStartScreen';
import ShiftEndScreen from '../screens/salesman/ShiftEnd/ShiftEndScreen';

const Stack = createNativeStackNavigator();

export default function EntryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EntryMenu" component={ShiftEntryMenu} />
      <Stack.Screen name="StartShift" component={ShiftStartScreen} />
      <Stack.Screen name="EndShift" component={ShiftEndScreen} />
    </Stack.Navigator>
  );
}
