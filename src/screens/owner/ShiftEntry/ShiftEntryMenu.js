import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';

export default function ShiftEntryMenu({ navigation }) {
  return (
    <SafeAreaView style={{flex: 1, backgroundColor: '#F8F9FA'}}>
      <View style={{padding: 20, justifyContent: 'center', flex: 1}}>
        <Text style={{fontSize: 24, fontWeight: 'bold', color: '#003C8F', marginBottom: 30, textAlign: 'center'}}>Shift Entry</Text>
        
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('StartShift')}>
          <Icon name="play-circle" size={40} color="#4CAF50" />
          <Text style={styles.text}>Start Shift</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('EndShift')}>
          <Icon name="stop-circle" size={40} color="#F44336" />
          <Text style={styles.text}>End Shift</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 20,
    flexDirection: 'row', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
  },
  text: {
    fontSize: 20, fontWeight: 'bold', marginLeft: 20, color: '#333'
  }
});
