import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ScrollView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { collection, onSnapshot, addDoc, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import Icon from '@expo/vector-icons/Ionicons';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';

export default function ShiftStartScreen({ navigation }) {
  const [salesmen, setSalesmen] = useState([]);
  const [selectedSalesman, setSelectedSalesman] = useState('');
  
  const [nozzles, setNozzles] = useState([]);
  const [selectedNozzle, setSelectedNozzle] = useState('');
  
  const [openingMeter, setOpeningMeter] = useState('');
  const [lastMeterReading, setLastMeterReading] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch Nozzles
    const unsubNozzles = onSnapshot(collection(db, 'nozzles'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setNozzles(list);
    });

    // Fetch Salesmen (Staff)
    const q = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubSalesmen = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setSalesmen(list);
    });

    return () => {
      unsubNozzles();
      unsubSalesmen();
    };
  }, []);

  const handleNozzleChange = (val) => {
    setSelectedNozzle(val);
    const nz = nozzles.find(n => n.id === val);
    if (nz) {
      const reading = nz.currentMeterReading?.toString() || '0';
      setLastMeterReading(reading);
      setOpeningMeter(reading); // pre-fill
    } else {
      setLastMeterReading(null);
      setOpeningMeter('');
    }
  };

  const handleStartShift = async () => {
    if (!selectedSalesman) {
      Alert.alert('Error', 'Please select a Salesman.');
      return;
    }

    if (!selectedNozzle || !openingMeter) {
      Alert.alert('Error', 'Please select a nozzle and enter the opening meter reading.');
      return;
    }

    if (isNaN(openingMeter) || parseFloat(openingMeter) < 0) {
      Alert.alert('Error', 'Please enter a valid numeric meter reading.');
      return;
    }

    setLoading(true);
    try {
      // Create new shift document
      const shiftRef = await addDoc(collection(db, 'shifts'), {
        salesmanId: selectedSalesman,
        nozzleId: selectedNozzle,
        openingMeterReading: parseFloat(openingMeter),
        startTime: new Date(),
        status: 'active'
      });

      // Update nozzle current reading just to be safe
      await updateDoc(doc(db, 'nozzles', selectedNozzle), {
        currentMeterReading: parseFloat(openingMeter)
      });

      Alert.alert('Success', 'Shift Started Successfully!');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        
        <View style={styles.header}>
          <Icon name="play-circle" size={32} color="#003C8F" />
          <Text style={styles.title}>Start Shift</Text>
        </View>

        <Text style={styles.subtitle}>Select the staff member and nozzle to begin recording sales.</Text>

        <View style={styles.formCard}>
          <Text style={styles.label}>Select Staff / Salesman *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedSalesman}
              onValueChange={(val) => setSelectedSalesman(val)}
              style={styles.picker}
              dropdownIconColor="#003C8F"
              itemStyle={{ color: '#0F172A' }}
              mode="dropdown"
            >
              <Picker.Item label="Select Staff..." value="" color="#64748B" />
              {salesmen.map(s => (
                <Picker.Item key={s.id} label={s.name} value={s.id} color="#0F172A" />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Select Machine / Nozzle *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedNozzle}
              onValueChange={handleNozzleChange}
              style={styles.picker}
              dropdownIconColor="#003C8F"
              itemStyle={{ color: '#0F172A' }}
              mode="dropdown"
            >
              <Picker.Item label="Select Nozzle..." value="" color="#64748B" />
              {nozzles.map(n => (
                <Picker.Item key={n.id} label={`${n.machineName} - ${n.nozzleId} (${n.fuelType || 'Fuel'})`} value={n.id} color="#0F172A" />
              ))}
            </Picker>
          </View>

          {selectedNozzle !== '' && lastMeterReading !== null && (
            <View style={styles.infoBox}>
              <Icon name="information-circle-outline" size={20} color="#003C8F" style={{marginRight: 8}} />
              <Text style={styles.infoText}>
                Last recorded meter for this nozzle is <Text style={{fontWeight: 'bold'}}>{lastMeterReading}</Text> L.
              </Text>
            </View>
          )}

          <CustomInput
            label="Opening Meter Reading *"
            value={openingMeter}
            onChangeText={(text) => setOpeningMeter(text.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="0.00"
            leftIcon="speedometer-outline"
          />

          <View style={{ marginTop: 10 }}>
            <CustomButton 
              title="START SHIFT" 
              onPress={handleStartShift} 
              loading={loading} 
              icon="checkmark-circle-outline"
            />
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { padding: 20 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10,
    marginTop: 10
  },
  title: { 
    fontSize: 26, 
    fontWeight: '900', 
    color: '#003C8F', 
    marginLeft: 10,
    letterSpacing: 0.5
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 25,
    lineHeight: 20
  },
  formCard: { 
    backgroundColor: '#fff', 
    padding: 20, 
    borderRadius: 20, 
    elevation: 4, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  label: { 
    fontSize: 14, 
    color: '#374151', 
    marginBottom: 8, 
    fontWeight: 'bold' 
  },
  pickerContainer: { 
    borderWidth: 1, 
    borderColor: '#D1D5DB', 
    borderRadius: 12, 
    marginBottom: 20, 
    backgroundColor: '#F9FAFB',
    overflow: 'hidden' // ensures picker doesn't overflow border radius on some platforms
  },
  picker: {
    height: 50,
    color: '#0F172A',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#0284C7'
  },
  infoText: {
    color: '#0369A1',
    fontSize: 13,
    flex: 1
  }
});
