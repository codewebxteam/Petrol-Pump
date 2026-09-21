import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { collection, setDoc, doc, onSnapshot, deleteDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../../services/firebase';
import { clearAllPumpData } from '../../../services/dbServices';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import { Picker } from '@react-native-picker/picker';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import AddStockScreen from '../AddStock/AddStockScreen';
import SalesmanRegistrationScreen from '../SalesmanRegistration/SalesmanRegistrationScreen';
import ProfitCalculator from './ProfitCalculator';
import AdminManagement from './AdminManagement';

// Helper to determine next machine number, name, and nozzles
const calculateNextMachineInfo = (existingMachines = []) => {
  let highestNum = 0;
  existingMachines.forEach(m => {
    const str = String(m.name || m.id || '');
    const match = str.match(/\d+/);
    if (match) {
      const n = parseInt(match[0], 10);
      if (n > highestNum) highestNum = n;
    }
  });
  const nextNum = highestNum + 1;
  const machineName = `DU${nextNum}`;
  const petrolNozzle = `N${(nextNum - 1) * 2 + 1}`;
  const dieselNozzle = `N${(nextNum - 1) * 2 + 2}`;
  return { nextNum, machineName, petrolNozzle, dieselNozzle };
};

export default function SettingsScreen() {
  const [activeMainTab, setActiveMainTab] = useState('system'); // 'system', 'stock', 'staff', 'profit', 'reset'
  const [isResetting, setIsResetting] = useState(false);
  
  const [activeTab, setActiveTab] = useState('machine'); // 'machine' or 'nozzle'
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Data Lists
  const [machines, setMachines] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [salesReports, setSalesReports] = useState([]);
  const [cachedMeters, setCachedMeters] = useState({});

  // Edit Meter Modal State
  const [isEditMeterModalVisible, setIsEditMeterModalVisible] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [editPetrolMeter, setEditPetrolMeter] = useState('');
  const [editDieselMeter, setEditDieselMeter] = useState('');
  const [isSavingMeters, setIsSavingMeters] = useState(false);

  // Machine Form State
  const [newMachineName, setNewMachineName] = useState('');
  const [petrolNozzleId, setPetrolNozzleId] = useState('N1');
  const [dieselNozzleId, setDieselNozzleId] = useState('N2');
  const [petrolInitialMeter, setPetrolInitialMeter] = useState('0.0000');
  const [dieselInitialMeter, setDieselInitialMeter] = useState('0.0000');

  // Nozzle Form State (Optional Fine-tune)
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedNozzleIndex, setSelectedNozzleIndex] = useState(1);
  const [selectedFuelType, setSelectedFuelType] = useState('Petrol');

  // Loading States
  const [isCreatingMachine, setIsCreatingMachine] = useState(false);
  const [isConfiguringNozzle, setIsConfiguringNozzle] = useState(false);

  useEffect(() => {
    const unsubMachines = onSnapshot(collection(db, 'machines'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setMachines(list);
      if (list.length > 0 && !selectedMachineId) {
        setSelectedMachineId(list[0].id);
      }
    }, (error) => {
      console.warn("Firestore snapshot error (machines):", error.message);
    });

    const unsubNozzles = onSnapshot(collection(db, 'nozzles'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setNozzles(list);
    }, (error) => {
      console.warn("Firestore snapshot error (nozzles):", error.message);
    });

    const unsubTanks = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setTanks(list);
    }, (error) => {
      console.warn("Firestore snapshot error (tanks):", error.message);
    });

    const unsubSales = onSnapshot(collection(db, 'sales_reports'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      list.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || a.date || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || b.date || 0).getTime();
        return timeB - timeA;
      });
      setSalesReports(list);
    }, (error) => {
      console.warn("Firestore snapshot error (sales_reports):", error.message);
    });

    const loadCachedMeters = async () => {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const meterKeys = allKeys.filter(k => k.startsWith('@meter_'));
        if (meterKeys.length > 0) {
          const pairs = await AsyncStorage.multiGet(meterKeys);
          const map = {};
          pairs.forEach(([k, v]) => {
            if (v) map[k] = v;
          });
          setCachedMeters(map);
        }
      } catch (e) {
        console.warn("Error loading cached meters:", e);
      }
    };
    loadCachedMeters();

    return () => {
      unsubMachines();
      unsubNozzles();
      unsubTanks();
      unsubSales();
    };
  }, []);

  // Open New Machine Modal with auto-assigned DU and Nozzles
  const handleOpenNewMachineModal = () => {
    const info = calculateNextMachineInfo(machines);
    setIsEditMode(false);
    setActiveTab('machine');
    setNewMachineName(info.machineName);
    setPetrolNozzleId(info.petrolNozzle);
    setDieselNozzleId(info.dieselNozzle);
    setPetrolInitialMeter('0.0000');
    setDieselInitialMeter('0.0000');
    setIsModalVisible(true);
  };

  // Re-calculate nozzles dynamically if user edits the machine name
  const handleMachineNameChange = (text) => {
    setNewMachineName(text);
    const match = text.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > 0) {
        setPetrolNozzleId(`N${(num - 1) * 2 + 1}`);
        setDieselNozzleId(`N${(num - 1) * 2 + 2}`);
      }
    }
  };

  // Save Machine + Auto-Configure Petrol (N1/N3 ➔ Tank 1) & Diesel (N2/N4 ➔ Tank 2)
  const handleCreateMachine = async () => {
    const machineId = newMachineName.trim().toUpperCase();
    if (!machineId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter a machine name (e.g. DU1, DU2).' });
      return;
    }

    const pNozzle = petrolNozzleId || 'N1';
    const dNozzle = dieselNozzleId || 'N2';
    const pMeter = petrolInitialMeter.trim() || '0.0000';
    const dMeter = dieselInitialMeter.trim() || '0.0000';

    setIsCreatingMachine(true);
    try {
      const batch = writeBatch(db);

      // 1. Create / Update Machine document
      const machRef = doc(db, 'machines', machineId);
      batch.set(machRef, {
        id: machineId,
        name: machineId,
        nozzleCount: 2,
        petrolNozzle: pNozzle,
        dieselNozzle: dNozzle,
        petrolTankId: 'Tank-1',
        dieselTankId: 'Tank-2',
        updatedAt: new Date(),
        createdAt: new Date()
      }, { merge: true });

      // 2. Create Petrol Nozzle (Connected strictly to Tank 1)
      const pDocId = `${machineId}-${pNozzle}`;
      const pRef = doc(db, 'nozzles', pDocId);
      batch.set(pRef, {
        id: pDocId,
        machineId: machineId,
        machineName: machineId,
        nozzleId: pNozzle,
        fuelType: 'Petrol',
        tankId: 'Tank-1',
        currentMeterReading: pMeter,
        updatedAt: new Date()
      }, { merge: true });

      // 3. Create Diesel Nozzle (Connected strictly to Tank 2)
      const dDocId = `${machineId}-${dNozzle}`;
      const dRef = doc(db, 'nozzles', dDocId);
      batch.set(dRef, {
        id: dDocId,
        machineId: machineId,
        machineName: machineId,
        nozzleId: dNozzle,
        fuelType: 'Diesel',
        tankId: 'Tank-2',
        currentMeterReading: dMeter,
        updatedAt: new Date()
      }, { merge: true });

      await batch.commit();

      // 4. Cache initial meters to AsyncStorage for offline / instant availability
      await AsyncStorage.setItem(`@meter_${machineId}_petrol`, pMeter).catch(() => null);
      await AsyncStorage.setItem(`@meter_${machineId}_diesel`, dMeter).catch(() => null);
      await AsyncStorage.setItem(`@meter_${pNozzle}`, pMeter).catch(() => null);
      await AsyncStorage.setItem(`@meter_${dNozzle}`, dMeter).catch(() => null);

      Toast.show({ 
        type: 'success', 
        text1: 'Machine Added!', 
        text2: `${machineId}: ${pNozzle} (Petrol • Tank 1) & ${dNozzle} (Diesel • Tank 2)` 
      });

      setIsModalVisible(false);
      setSelectedMachineId(machineId);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsCreatingMachine(false);
    }
  };

  const handleConfigureNozzle = async () => {
    if (!selectedMachineId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Machine must be selected.' });
      return;
    }

    const nozzleIdString = `N${selectedNozzleIndex}`;
    const docId = `${selectedMachineId}-${nozzleIdString}`;

    setIsConfiguringNozzle(true);
    try {
      const tankId = selectedFuelType === 'Petrol' ? 'Tank-1' : 'Tank-2';
      await setDoc(doc(db, 'nozzles', docId), {
        machineId: selectedMachineId,
        machineName: selectedMachineId,
        nozzleId: nozzleIdString,
        fuelType: selectedFuelType,
        tankId: tankId,
        updatedAt: new Date()
      }, { merge: true });

      Toast.show({ type: 'success', text1: 'Success', text2: `${nozzleIdString} (${selectedFuelType}) configured successfully!` });
      setIsModalVisible(false);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsConfiguringNozzle(false);
    }
  };

  const handleDeleteMachine = (machineId) => {
    Alert.alert(
      "Delete Machine",
      `Are you sure you want to delete ${machineId} and both its nozzles?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              // Delete machine document
              await deleteDoc(doc(db, 'machines', machineId));
              
              // Delete associated nozzles
              const q = query(collection(db, 'nozzles'), where('machineId', '==', machineId));
              const querySnapshot = await getDocs(q);
              
              const batch = writeBatch(db);
              querySnapshot.forEach((d) => {
                batch.delete(d.ref);
              });
              await batch.commit();

              Toast.show({ type: 'success', text1: 'Deleted', text2: `${machineId} was deleted successfully.` });
              
              if (selectedMachineId === machineId) {
                setSelectedMachineId('');
              }
            } catch (error) {
              Toast.show({ type: 'error', text1: 'Error', text2: error.message });
            }
          }
        }
      ]
    );
  };

  const confirmFullReset = () => {
    Alert.alert(
      "🚨 Are you sure you want to delete ALL data?",
      "This action is irreversible! All sales reports, machines, nozzles, tank logs, staff records, and meter readings will be permanently erased and the app will be reset to factory defaults.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Delete Everything", 
          style: "destructive",
          onPress: () => handlePerformReset({ deleteMachines: true, deleteStaff: true, resetTanks: true })
        }
      ]
    );
  };

  const confirmReportsReset = () => {
    Alert.alert(
      "📊 Clear Sales Reports Only?",
      "All previous sales reports and tank logs will be deleted. Your machines, nozzles, and staff records will remain intact.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Clear Reports", 
          style: "destructive",
          onPress: () => handlePerformReset({ deleteMachines: false, deleteStaff: false, resetTanks: false })
        }
      ]
    );
  };

  const handlePerformReset = async (options) => {
    setIsResetting(true);
    try {
      await clearAllPumpData(options);
      Toast.show({
        type: 'success',
        text1: 'Reset Completed Successfully!',
        text2: options.deleteMachines ? 'All data cleared. App is reset to factory state.' : 'All past sales reports have been deleted.'
      });
      Alert.alert(
        "Success!",
        options.deleteMachines 
          ? "All historical data has been successfully cleared. The app is ready for fresh entries." 
          : "All past reports have been successfully cleared."
      );
    } catch (error) {
      console.error("Reset error:", error);
      Alert.alert("Error", error.message || "Failed to reset data.");
    } finally {
      setIsResetting(false);
    }
  };

  // Helper to resolve actual meter readings for a machine
  const getMachineMeters = (item) => {
    const match = String(item.name || item.id || '').match(/\d+/);
    const num = match ? parseInt(match[0], 10) : 1;
    const pNz = item.petrolNozzle || `N${(num - 1) * 2 + 1}`;
    const dNz = item.dieselNozzle || `N${(num - 1) * 2 + 2}`;

    // Find the latest submitted sale for this machine
    const latestSale = salesReports.find(s => 
      s.machineId === item.id || 
      s.machineName === item.name || 
      s.machineName === item.id || 
      s.machineId === item.name ||
      (item.name && s.machineName && s.machineName.toLowerCase() === item.name.toLowerCase())
    );

    const pDoc = nozzles.find(n => 
      (n.machineId === item.id || n.machineName === item.id || n.id === `${item.id}-${pNz}` || n.id === pNz) && 
      (n.fuelType === 'Petrol' || n.nozzleId === pNz)
    );

    const dDoc = nozzles.find(n => 
      (n.machineId === item.id || n.machineName === item.id || n.id === `${item.id}-${dNz}` || n.id === dNz) && 
      (n.fuelType === 'Diesel' || n.nozzleId === dNz)
    );

    const pCached = cachedMeters[`@meter_${item.id}_petrol`] || cachedMeters[`@meter_${item.name}_petrol`] || cachedMeters[`@meter_${pNz}`];
    const dCached = cachedMeters[`@meter_${item.id}_diesel`] || cachedMeters[`@meter_${item.name}_diesel`] || cachedMeters[`@meter_${dNz}`];

    const pCandidates = [
      latestSale?.petrolEntry?.closingMeterReading,
      latestSale?.petrolClosingMeter,
      pDoc?.currentMeterReading,
      item.petrolClosingMeter,
      pCached,
      item.petrolInitialMeter,
      pDoc?.initialMeterReading,
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');

    const dCandidates = [
      latestSale?.dieselEntry?.closingMeterReading,
      latestSale?.dieselClosingMeter,
      dDoc?.currentMeterReading,
      item.dieselClosingMeter,
      dCached,
      item.dieselInitialMeter,
      dDoc?.initialMeterReading,
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');

    const pMeter = pCandidates.find(v => String(v) !== '0.0000' && String(v) !== '0' && String(v) !== '0.0') || pCandidates[0] || '0.0000';
    const dMeter = dCandidates.find(v => String(v) !== '0.0000' && String(v) !== '0' && String(v) !== '0.0') || dCandidates[0] || '0.0000';

    return {
      petrolNozzle: pNz,
      dieselNozzle: dNz,
      petrolMeter: String(pMeter),
      dieselMeter: String(dMeter),
      petrolDoc: pDoc,
      dieselDoc: dDoc,
      latestSale
    };
  };

  const handleOpenEditMeter = (machine) => {
    const { petrolMeter, dieselMeter } = getMachineMeters(machine);
    setEditingMachine(machine);
    setEditPetrolMeter(petrolMeter);
    setEditDieselMeter(dieselMeter);
    setIsEditMeterModalVisible(true);
  };

  const handleSaveMeters = async () => {
    if (!editingMachine) return;
    setIsSavingMeters(true);
    try {
      const match = String(editingMachine.name || editingMachine.id || '').match(/\d+/);
      const num = match ? parseInt(match[0], 10) : 1;
      const pNz = editingMachine.petrolNozzle || `N${(num - 1) * 2 + 1}`;
      const dNz = editingMachine.dieselNozzle || `N${(num - 1) * 2 + 2}`;

      const pMeterVal = editPetrolMeter.trim() || '0.0000';
      const dMeterVal = editDieselMeter.trim() || '0.0000';

      // 1. Update machine doc
      await setDoc(doc(db, 'machines', editingMachine.id), {
        petrolClosingMeter: pMeterVal,
        dieselClosingMeter: dMeterVal,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Update nozzle docs for petrol (both N1 and DU1-N1 format)
      await setDoc(doc(db, 'nozzles', pNz), {
        machineId: editingMachine.id,
        machineName: editingMachine.name || editingMachine.id,
        nozzleId: pNz,
        fuelType: 'Petrol',
        tankId: 'Tank 1',
        currentMeterReading: pMeterVal,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await setDoc(doc(db, 'nozzles', `${editingMachine.id}-${pNz}`), {
        machineId: editingMachine.id,
        machineName: editingMachine.name || editingMachine.id,
        nozzleId: pNz,
        fuelType: 'Petrol',
        tankId: 'Tank 1',
        currentMeterReading: pMeterVal,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 3. Update nozzle docs for diesel (both N2 and DU1-N2 format)
      await setDoc(doc(db, 'nozzles', dNz), {
        machineId: editingMachine.id,
        machineName: editingMachine.name || editingMachine.id,
        nozzleId: dNz,
        fuelType: 'Diesel',
        tankId: 'Tank 2',
        currentMeterReading: dMeterVal,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await setDoc(doc(db, 'nozzles', `${editingMachine.id}-${dNz}`), {
        machineId: editingMachine.id,
        machineName: editingMachine.name || editingMachine.id,
        nozzleId: dNz,
        fuelType: 'Diesel',
        tankId: 'Tank 2',
        currentMeterReading: dMeterVal,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 4. Save to AsyncStorage
      await AsyncStorage.multiSet([
        [`@meter_${editingMachine.id}_petrol`, pMeterVal],
        [`@meter_${editingMachine.id}_diesel`, dMeterVal],
        [`@meter_${editingMachine.name || editingMachine.id}_petrol`, pMeterVal],
        [`@meter_${editingMachine.name || editingMachine.id}_diesel`, dMeterVal],
        [`@meter_${pNz}`, pMeterVal],
        [`@meter_${dNz}`, dMeterVal],
      ]);

      // Update local cached state
      setCachedMeters(prev => ({
        ...prev,
        [`@meter_${editingMachine.id}_petrol`]: pMeterVal,
        [`@meter_${editingMachine.id}_diesel`]: dMeterVal,
        [`@meter_${editingMachine.name || editingMachine.id}_petrol`]: pMeterVal,
        [`@meter_${editingMachine.name || editingMachine.id}_diesel`]: dMeterVal,
        [`@meter_${pNz}`]: pMeterVal,
        [`@meter_${dNz}`]: dMeterVal,
      }));

      Toast.show({
        type: 'success',
        text1: 'Meters Updated',
        text2: `${editingMachine.name || editingMachine.id} meter readings saved!`
      });

      setIsEditMeterModalVisible(false);
    } catch (error) {
      console.error("Error saving meter readings:", error);
      Alert.alert("Error", error.message || "Failed to update meter readings.");
    } finally {
      setIsSavingMeters(false);
    }
  };

  const renderMachineCard = ({ item }) => {
    const { petrolNozzle: pNz, dieselNozzle: dNz, petrolMeter, dieselMeter } = getMachineMeters(item);

    return (
      <View style={styles.machineCard}>
        <View style={styles.machineHeader}>
          <Icon name="hardware-chip-outline" size={24} color="#fff" />
          <Text style={styles.machineTitle}>{item.name}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Dual Dispenser (MPD)</Text>
          </View>
          
          {/* Edit Meters Button */}
          <TouchableOpacity 
            onPress={() => handleOpenEditMeter(item)} 
            style={styles.editMeterHeaderBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="create-outline" size={16} color="#fff" />
            <Text style={styles.editMeterHeaderBtnText}>Edit Meter</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleDeleteMachine(item.id)} style={{ marginLeft: 10 }}>
            <Icon name="trash-outline" size={22} color="#ffcccc" />
          </TouchableOpacity>
        </View>

        <View style={styles.nozzleList}>
          {/* Petrol Nozzle */}
          <View style={styles.nozzleRow}>
            <View style={[styles.fuelIndicator, { backgroundColor: '#FF6F00' }]} />
            <Text style={styles.nozzleName}>{pNz}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.nozzleDetail}>
                Fuel: <Text style={{ fontWeight: 'bold', color: '#FF6F00' }}>Petrol ➔ Tank 1</Text>
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.meterPill, { borderColor: '#FED7AA', borderWidth: 1 }]}
              onPress={() => handleOpenEditMeter(item)}
            >
              <Text style={styles.meterPillLabel}>METER</Text>
              <Text style={styles.meterPillValue}>{petrolMeter}</Text>
              <Icon name="create-outline" size={12} color="#C2410C" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          {/* Diesel Nozzle */}
          <View style={styles.nozzleRow}>
            <View style={[styles.fuelIndicator, { backgroundColor: '#003C8F' }]} />
            <Text style={styles.nozzleName}>{dNz}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.nozzleDetail}>
                Fuel: <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>Diesel ➔ Tank 2</Text>
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.meterPill, { borderColor: '#BFDBFE', borderWidth: 1 }]}
              onPress={() => handleOpenEditMeter(item)}
            >
              <Text style={styles.meterPillLabel}>METER</Text>
              <Text style={styles.meterPillValue}>{dieselMeter}</Text>
              <Icon name="create-outline" size={12} color="#1D4ED8" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Main Tabs */}
      <View style={{ marginBottom: 15 }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mainTabScrollContainer}
        >
          <TouchableOpacity 
            style={[styles.mainTab, activeMainTab === 'system' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('system')}
          >
            <Icon name="hardware-chip-outline" size={15} color={activeMainTab === 'system' ? '#003C8F' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.mainTabText, activeMainTab === 'system' && styles.activeMainTabText]}>Machines</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mainTab, activeMainTab === 'stock' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('stock')}
          >
            <Icon name="water-outline" size={15} color={activeMainTab === 'stock' ? '#003C8F' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.mainTabText, activeMainTab === 'stock' && styles.activeMainTabText]}>Tank Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mainTab, activeMainTab === 'staff' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('staff')}
          >
            <Icon name="people-outline" size={15} color={activeMainTab === 'staff' ? '#003C8F' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.mainTabText, activeMainTab === 'staff' && styles.activeMainTabText]}>Staff</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mainTab, activeMainTab === 'profit' && styles.activeMainTab, activeMainTab === 'profit' && { borderColor: '#16A34A', borderWidth: 1 }]}
            onPress={() => setActiveMainTab('profit')}
          >
            <Icon name="calculator" size={15} color={activeMainTab === 'profit' ? '#16A34A' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.mainTabText, activeMainTab === 'profit' && { color: '#16A34A', fontWeight: '900' }]}>Profit Calc 💰</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mainTab, activeMainTab === 'security' && styles.activeMainTab, activeMainTab === 'security' && { borderColor: '#003C8F', borderWidth: 1 }]}
            onPress={() => setActiveMainTab('security')}
          >
            <Icon name="shield-checkmark-outline" size={15} color={activeMainTab === 'security' ? '#003C8F' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.mainTabText, activeMainTab === 'security' && { color: '#003C8F', fontWeight: '900' }]}>Admin Security 🔐</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mainTab, activeMainTab === 'reset' && styles.activeMainTab, activeMainTab === 'reset' && { backgroundColor: '#FEE2E2' }]}
            onPress={() => setActiveMainTab('reset')}
          >
            <Icon name="trash-outline" size={15} color={activeMainTab === 'reset' ? '#DC2626' : '#64748B'} style={{ marginRight: 5 }} />
            <Text style={[styles.mainTabText, activeMainTab === 'reset' && { color: '#DC2626', fontWeight: '900' }]}>Reset Data</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Conditionally Render Content based on Main Tab */}
      {activeMainTab === 'stock' && (
        <View style={{ flex: 1, marginHorizontal: -15, marginBottom: -15 }}>
          <AddStockScreen />
        </View>
      )}
      
      {activeMainTab === 'staff' && (
        <View style={{ flex: 1, marginHorizontal: -15, marginBottom: -15 }}>
          <SalesmanRegistrationScreen />
        </View>
      )}

      {activeMainTab === 'profit' && (
        <View style={{ flex: 1, marginHorizontal: -15, marginBottom: -15 }}>
          <ProfitCalculator />
        </View>
      )}

      {activeMainTab === 'security' && (
        <View style={{ flex: 1, marginHorizontal: -15, marginBottom: -15 }}>
          <AdminManagement />
        </View>
      )}

      {activeMainTab === 'reset' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Header Banner */}
          <View style={styles.resetHeaderBanner}>
            <Icon name="warning" size={36} color="#DC2626" />
            <Text style={styles.resetHeaderTitle}>Data Cleanup & Reset Center (Danger Zone)</Text>
            <Text style={styles.resetHeaderSubtitle}>
              Clean up test or previous data safely to start fresh with daily entries.
            </Text>
          </View>

          {/* Option 1: Complete Wipe / Factory Reset */}
          <View style={styles.resetCard}>
            <View style={styles.resetCardHeader}>
              <View style={[styles.dangerBadge, { backgroundColor: '#DC2626' }]}>
                <Text style={styles.dangerBadgeText}>🚨 Factory Reset (Wipe All Data)</Text>
              </View>
              <Text style={styles.resetCardTitle}>Delete All Historical Data</Text>
              <Text style={styles.resetCardDesc}>
                All data will be completely deleted to reset the app to factory state:
              </Text>
            </View>

            <View style={styles.resetFeatureList}>
              <View style={styles.resetFeatureItem}>
                <Icon name="trash-outline" size={16} color="#DC2626" />
                <Text style={styles.resetFeatureText}>All daily sales & shift reports</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="trash-outline" size={16} color="#DC2626" />
                <Text style={styles.resetFeatureText}>All tank logs & testing fuel records</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="trash-outline" size={16} color="#DC2626" />
                <Text style={styles.resetFeatureText}>All machines (DU1, DU2...) & nozzles (N1, N2...)</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="trash-outline" size={16} color="#DC2626" />
                <Text style={styles.resetFeatureText}>All registered salesman / staff records</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="refresh-outline" size={16} color="#2563EB" />
                <Text style={styles.resetFeatureText}>Reset Tank 1 (Petrol) & Tank 2 (Diesel) stocks to 0</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="refresh-outline" size={16} color="#2563EB" />
                <Text style={styles.resetFeatureText}>Clear all meter reading cache & testing flags</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.resetButton, { backgroundColor: '#DC2626' }]}
              onPress={confirmFullReset}
              disabled={isResetting}
            >
              <Icon name="trash" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.resetButtonText}>Permanently Delete All Data</Text>
            </TouchableOpacity>
          </View>

          {/* Option 2: Clear Sales & Shift Reports Only */}
          <View style={[styles.resetCard, { borderColor: '#FDBA74', marginTop: 16 }]}>
            <View style={styles.resetCardHeader}>
              <View style={[styles.dangerBadge, { backgroundColor: '#EA580C' }]}>
                <Text style={styles.dangerBadgeText}>📊 Clear Reports Only</Text>
              </View>
              <Text style={styles.resetCardTitle}>Delete Sales Reports & Logs Only</Text>
              <Text style={styles.resetCardDesc}>
                Keep machines and staff intact, only delete previous sales records:
              </Text>
            </View>

            <View style={styles.resetFeatureList}>
              <View style={styles.resetFeatureItem}>
                <Icon name="trash-outline" size={16} color="#EA580C" />
                <Text style={styles.resetFeatureText}>All daily sales reports & shifts will be deleted</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="trash-outline" size={16} color="#EA580C" />
                <Text style={styles.resetFeatureText}>All tank logs will be deleted</Text>
              </View>
              <View style={styles.resetFeatureItem}>
                <Icon name="checkmark-circle-outline" size={16} color="#16A34A" />
                <Text style={[styles.resetFeatureText, { color: '#16A34A', fontWeight: 'bold' }]}>Your machines, nozzles, and staff remain safe</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.resetButton, { backgroundColor: '#EA580C' }]}
              onPress={confirmReportsReset}
              disabled={isResetting}
            >
              <Icon name="document-text-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.resetButtonText}>Clear Sales Reports Only</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
      
      {activeMainTab === 'system' && (
        <View style={{ flex: 1 }}>
          {/* Action Button */}
          <View style={styles.actionRowTop}>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#003C8F' }]}
              onPress={handleOpenNewMachineModal}
            >
              <Icon name="add-circle-outline" size={22} color="#fff" style={{marginRight: 6}} />
              <Text style={styles.actionBtnText}>+ Add Machine</Text>
            </TouchableOpacity>
          </View>

          <FlatList 
            data={machines}
            keyExtractor={item => item.id}
            renderItem={renderMachineCard}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={
              <View style={styles.emptyStateBox}>
                <Icon name="hardware-chip-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyStateTitle}>No Machines Found</Text>
                <Text style={styles.emptyStateSub}>
                  Tap "+ Add Machine" above to add your first dispenser machine (e.g. DU1).
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* Loading Overlay Modal for Reset */}
      <Modal transparent={true} visible={isResetting} animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#DC2626" />
            <Text style={styles.loadingTitle}>Clearing Data...</Text>
            <Text style={styles.loadingSubtitle}>Please do not close the app, this may take a few seconds.</Text>
          </View>
        </View>
      </Modal>

      {/* Modal for Creating Machine */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentWrapper}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add New Dispenser Machine</Text>
                <Text style={styles.modalSubTitle}>Auto-Configured: 1 Petrol + 1 Diesel Nozzle</Text>
              </View>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Icon name="close-circle" size={28} color="#d32f2f" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.infoBanner}>
                <Icon name="information-circle-outline" size={18} color="#003C8F" style={{marginRight: 6}} />
                <Text style={styles.infoBannerText}>
                  Each machine is auto-configured with 1 Petrol nozzle (Tank 1) and 1 Diesel nozzle (Tank 2).
                </Text>
              </View>

              {/* Machine Name */}
              <CustomInput 
                label="Machine Name *"
                placeholder="e.g. DU1, DU2, DU3" 
                value={newMachineName} 
                onChangeText={handleMachineNameChange} 
                leftIcon="hardware-chip-outline"
              />

              {/* Auto Configured Nozzles Cards */}
              <View style={styles.nozzlePreviewContainer}>
                <Text style={styles.previewSectionTitle}>Auto-Assigned Nozzles:</Text>
                
                {/* Petrol Nozzle Preview */}
                <View style={[styles.nozzlePreviewCard, { borderColor: '#FF6F00' }]}>
                  <View style={styles.nozzlePreviewHeader}>
                    <View style={[styles.fuelDot, { backgroundColor: '#FF6F00' }]} />
                    <Text style={[styles.nozzlePreviewName, { color: '#FF6F00' }]}>
                      Nozzle {petrolNozzleId}: Petrol (MS)
                    </Text>
                    <View style={[styles.tankBadgeMini, { backgroundColor: '#FFF3E0' }]}>
                      <Text style={{ color: '#E65100', fontSize: 11, fontWeight: 'bold' }}>Tank 1</Text>
                    </View>
                  </View>
                  <CustomInput 
                    label={`Opening Meter Reading (${petrolNozzleId})`}
                    value={petrolInitialMeter}
                    onChangeText={setPetrolInitialMeter}
                    keyboardType="numeric"
                    placeholder="0.0000"
                    leftIcon="speedometer-outline"
                  />
                </View>

                {/* Diesel Nozzle Preview */}
                <View style={[styles.nozzlePreviewCard, { borderColor: '#003C8F', marginTop: 12 }]}>
                  <View style={styles.nozzlePreviewHeader}>
                    <View style={[styles.fuelDot, { backgroundColor: '#003C8F' }]} />
                    <Text style={[styles.nozzlePreviewName, { color: '#003C8F' }]}>
                      Nozzle {dieselNozzleId}: Diesel (HSD)
                    </Text>
                    <View style={[styles.tankBadgeMini, { backgroundColor: '#E3F2FD' }]}>
                      <Text style={{ color: '#003C8F', fontSize: 11, fontWeight: 'bold' }}>Tank 2</Text>
                    </View>
                  </View>
                  <CustomInput 
                    label={`Opening Meter Reading (${dieselNozzleId})`}
                    value={dieselInitialMeter}
                    onChangeText={setDieselInitialMeter}
                    keyboardType="numeric"
                    placeholder="0.0000"
                    leftIcon="speedometer-outline"
                  />
                </View>
              </View>

              <CustomButton 
                title="Save Machine & Nozzles" 
                onPress={handleCreateMachine} 
                loading={isCreatingMachine} 
                type="primary"
                style={{ marginTop: 18, marginBottom: 20 }} 
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal for Editing Machine Meters */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isEditMeterModalVisible}
        onRequestClose={() => setIsEditMeterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentWrapper}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Update Meter Readings</Text>
                <Text style={styles.modalSubTitle}>
                  {editingMachine ? `${editingMachine.name || editingMachine.id} Dispensers` : 'Adjust current nozzle meters'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setIsEditMeterModalVisible(false)}>
                <Icon name="close-circle-outline" size={28} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoBanner}>
              <Icon name="information-circle" size={20} color="#003C8F" style={{ marginRight: 8 }} />
              <Text style={styles.infoBannerText}>
                Set or adjust current meter readings for this machine. Live daily shift entries will advance automatically from these values.
              </Text>
            </View>

            <View style={{ marginTop: 10 }}>
              {/* Petrol Nozzle Meter */}
              <View style={[styles.nozzlePreviewCard, { borderColor: '#FF6F00', marginBottom: 12 }]}>
                <View style={styles.nozzlePreviewHeader}>
                  <View style={[styles.fuelDot, { backgroundColor: '#FF6F00' }]} />
                  <Text style={[styles.nozzlePreviewName, { color: '#FF6F00' }]}>
                    {editingMachine?.petrolNozzle || 'N1'}: Petrol (MS)
                  </Text>
                  <View style={[styles.tankBadgeMini, { backgroundColor: '#FFF3E0' }]}>
                    <Text style={{ color: '#E65100', fontSize: 11, fontWeight: 'bold' }}>Tank 1</Text>
                  </View>
                </View>
                <CustomInput 
                  label="Current Meter Reading"
                  value={editPetrolMeter}
                  onChangeText={setEditPetrolMeter}
                  keyboardType="numeric"
                  placeholder="0.0000"
                  leftIcon="speedometer-outline"
                />
              </View>

              {/* Diesel Nozzle Meter */}
              <View style={[styles.nozzlePreviewCard, { borderColor: '#003C8F' }]}>
                <View style={styles.nozzlePreviewHeader}>
                  <View style={[styles.fuelDot, { backgroundColor: '#003C8F' }]} />
                  <Text style={[styles.nozzlePreviewName, { color: '#003C8F' }]}>
                    {editingMachine?.dieselNozzle || 'N2'}: Diesel (HSD)
                  </Text>
                  <View style={[styles.tankBadgeMini, { backgroundColor: '#E3F2FD' }]}>
                    <Text style={{ color: '#003C8F', fontSize: 11, fontWeight: 'bold' }}>Tank 2</Text>
                  </View>
                </View>
                <CustomInput 
                  label="Current Meter Reading"
                  value={editDieselMeter}
                  onChangeText={setEditDieselMeter}
                  keyboardType="numeric"
                  placeholder="0.0000"
                  leftIcon="speedometer-outline"
                />
              </View>
            </View>

            <CustomButton 
              title="Save Meter Readings" 
              onPress={handleSaveMeters} 
              loading={isSavingMeters} 
              type="primary"
              style={{ marginTop: 20 }} 
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 15 },
  
  // Main Tabs Styles
  mainTabScrollContainer: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4, alignItems: 'center' },
  mainTab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 4 },
  activeMainTab: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  mainTabText: { fontWeight: 'bold', color: '#64748B', fontSize: 13 },
  activeMainTabText: { color: '#003C8F' },

  actionRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 10, elevation: 2 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  emptyStateBox: { alignItems: 'center', justifyContent: 'center', marginTop: 50, padding: 20 },
  emptyStateTitle: { fontSize: 18, fontWeight: 'bold', color: '#475569', marginTop: 10 },
  emptyStateSub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 6, lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContentWrapper: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, elevation: 5, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#003C8F' },
  modalSubTitle: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },
  modalScroll: { width: '100%' },

  infoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', padding: 10, borderRadius: 8, marginBottom: 14, borderWidth: 1, borderColor: '#BFDBFE' },
  infoBannerText: { fontSize: 12, color: '#1E40AF', flex: 1, lineHeight: 16 },

  nozzlePreviewContainer: { marginTop: 10 },
  previewSectionTitle: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 8 },
  nozzlePreviewCard: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1.5 },
  nozzlePreviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fuelDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  nozzlePreviewName: { fontSize: 14, fontWeight: '900', flex: 1 },
  tankBadgeMini: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  machineCard: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 14, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  machineHeader: { backgroundColor: '#003C8F', padding: 14, flexDirection: 'row', alignItems: 'center' },
  machineTitle: { fontSize: 18, fontWeight: '900', color: '#fff', marginLeft: 10, marginRight: 10 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  
  nozzleList: { padding: 12 },
  nozzleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  fuelIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  nozzleName: { fontSize: 16, fontWeight: '900', color: '#1E293B', width: 45 },
  nozzleDetail: { fontSize: 13, color: '#64748B' },
  editMeterHeaderBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginLeft: 'auto' },
  editMeterHeaderBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 },
  meterPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  meterPillLabel: { fontSize: 9, fontWeight: '800', color: '#64748B', marginRight: 4 },
  meterPillValue: { fontSize: 12, color: '#0F172A', fontWeight: 'bold' },
  meterPillText: { fontSize: 11, color: '#334155', fontWeight: 'bold' },

  resetHeaderBanner: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  resetHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#991B1B', marginTop: 8, textAlign: 'center' },
  resetHeaderSubtitle: { fontSize: 12, color: '#B91C1C', textAlign: 'center', marginTop: 4, lineHeight: 18 },
  resetCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#FCA5A5', padding: 16, elevation: 2 },
  resetCardHeader: { marginBottom: 12 },
  dangerBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  dangerBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  resetCardTitle: { fontSize: 17, fontWeight: '900', color: '#1E293B' },
  resetCardDesc: { fontSize: 13, color: '#64748B', marginTop: 4 },
  resetFeatureList: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  resetFeatureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  resetFeatureText: { fontSize: 13, color: '#334155', marginLeft: 8, flex: 1 },
  resetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 10, elevation: 2 },
  resetButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', width: '85%', elevation: 5 },
  loadingTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginTop: 14 },
  loadingSubtitle: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 6 }
});

