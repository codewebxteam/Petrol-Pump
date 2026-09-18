import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, Modal } from 'react-native';
import { collection, setDoc, doc, onSnapshot, deleteDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import { Picker } from '@react-native-picker/picker';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import AddStockScreen from '../AddStock/AddStockScreen';
import SalesmanRegistrationScreen from '../SalesmanRegistration/SalesmanRegistrationScreen';

export default function SettingsScreen() {
  const [activeMainTab, setActiveMainTab] = useState('system'); // 'system', 'stock', 'staff'
  
  const [activeTab, setActiveTab] = useState('machine'); // 'machine' or 'nozzle'
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Data Lists
  const [machines, setMachines] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [tanks, setTanks] = useState([]);

  // Machine Form State
  const [newMachineName, setNewMachineName] = useState('');
  const [newMachineNozzleCount, setNewMachineNozzleCount] = useState(2);

  // Nozzle Form State
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedNozzleIndex, setSelectedNozzleIndex] = useState(1);
  const [selectedFuelType, setSelectedFuelType] = useState('Petrol');
  const [selectedTankId, setSelectedTankId] = useState(''); // Moved to Machine level

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
    });

    const unsubNozzles = onSnapshot(collection(db, 'nozzles'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setNozzles(list);
    });

    const unsubTanks = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setTanks(list);
      if (list.length > 0 && !selectedTankId) {
        setSelectedTankId(list[0].id);
      }
    });

    return () => {
      unsubMachines();
      unsubNozzles();
      unsubTanks();
    };
  }, []);

  const handleCreateMachine = async () => {
    if (!newMachineName.trim() || !selectedTankId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Machine name and Tank are required.' });
      return;
    }
    const machineId = newMachineName.trim().toUpperCase();
    setIsCreatingMachine(true);
    try {
      if (isEditMode) {
        await setDoc(doc(db, 'machines', machineId), {
          nozzleCount: Number(newMachineNozzleCount),
          tankId: selectedTankId,
          updatedAt: new Date()
        }, { merge: true });
        Toast.show({ type: 'success', text1: 'Success', text2: `${machineId} updated successfully!` });
      } else {
        // 1. Delete old orphaned nozzles for this machine if they exist from a previous setup
        const q = query(collection(db, 'nozzles'), where('machineId', '==', machineId));
        const querySnapshot = await getDocs(q);
        
        const batch = writeBatch(db);
        querySnapshot.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();

        // 2. Create the new fresh machine document
        await setDoc(doc(db, 'machines', machineId), {
          name: machineId,
          nozzleCount: Number(newMachineNozzleCount),
          tankId: selectedTankId,
          createdAt: new Date()
        });
        Toast.show({ type: 'success', text1: 'Success', text2: `${machineId} created successfully!` });
      }
      setNewMachineName('');
      setIsModalVisible(false); // Close modal on success
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
      await setDoc(doc(db, 'nozzles', docId), {
        machineId: selectedMachineId,
        machineName: selectedMachineId,
        nozzleId: nozzleIdString,
        fuelType: selectedFuelType,
        updatedAt: new Date()
      }, { merge: true }); // merge to not overwrite meter readings if they happen to be there

      Toast.show({ type: 'success', text1: 'Success', text2: `${nozzleIdString} configured successfully!` });
      setIsModalVisible(false); // Close modal on success
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsConfiguringNozzle(false);
    }
  };

  const handleDeleteMachine = (machineId) => {
    Alert.alert(
      "Delete Machine",
      `Are you sure you want to delete ${machineId} and all its nozzles?`,
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

              Toast.show({ type: 'success', text1: 'Deleted', text2: `${machineId} deleted successfully.` });
              
              // If deleted machine was selected, reset selection
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

  const handleDeleteNozzle = (nozzle) => {
    Alert.alert(
      "Delete Nozzle",
      `Are you sure you want to delete ${nozzle.nozzleId} from ${nozzle.machineName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'nozzles', nozzle.id));
              Toast.show({ type: 'success', text1: 'Deleted', text2: `${nozzle.nozzleId} deleted successfully.` });
            } catch (error) {
              Toast.show({ type: 'error', text1: 'Error', text2: error.message });
            }
          }
        }
      ]
    );
  };

  // Helper to get number array for dropdowns (e.g. 1 to 10)
  const getNumberArray = (max) => Array.from({ length: max }, (_, i) => i + 1);

  // Get active machine to know its nozzle count
  const activeMachine = machines.find(m => m.id === selectedMachineId);
  const currentNozzleCount = activeMachine ? activeMachine.nozzleCount : 0;

  const handleEditMachineOpen = (machine) => {
    setActiveTab('machine');
    setIsEditMode(true);
    setNewMachineName(machine.name);
    setNewMachineNozzleCount(machine.nozzleCount);
    setSelectedTankId(machine.tankId);
    setSelectedMachineId(machine.id);
    setIsModalVisible(true);
  };

  const handleEditNozzleOpen = (nozzle) => {
    setActiveTab('nozzle');
    setIsEditMode(true);
    setSelectedMachineId(nozzle.machineId);
    setSelectedNozzleIndex(parseInt(nozzle.nozzleId.replace('N', '')));
    setSelectedFuelType(nozzle.fuelType);
    setIsModalVisible(true);
  };

  const renderMachineCard = ({ item }) => {
    // Find nozzles for this machine
    const machineNozzles = nozzles.filter(n => n.machineId === item.id || n.machineName === item.id);
    // Sort nozzles by N1, N2, etc.
    machineNozzles.sort((a, b) => a.nozzleId.localeCompare(b.nozzleId));

    return (
      <View style={styles.machineCard}>
        <View style={styles.machineHeader}>
          <Icon name="hardware-chip-outline" size={24} color="#fff" />
          <Text style={styles.machineTitle}>{item.name}</Text>
          <View style={[styles.badge, { backgroundColor: '#FF6F00', marginRight: 5 }]}>
            <Text style={styles.badgeText}>Tank: {item.tankId}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.nozzleCount} Nozzles</Text>
          </View>
          <TouchableOpacity onPress={() => handleEditMachineOpen(item)} style={{ marginLeft: 'auto' }}>
            <Icon name="create-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteMachine(item.id)} style={{ marginLeft: 15 }}>
            <Icon name="trash-outline" size={22} color="#ffcccc" />
          </TouchableOpacity>
        </View>

        <View style={styles.nozzleList}>
          {machineNozzles.length === 0 ? (
            <Text style={styles.noDataText}>No nozzles configured yet.</Text>
          ) : (
            machineNozzles.map(n => (
              <View key={n.id} style={styles.nozzleRow}>
                <View style={[styles.fuelIndicator, { backgroundColor: n.fuelType === 'Petrol' ? '#FF6F00' : '#003C8F' }]} />
                <Text style={styles.nozzleName}>{n.nozzleId}</Text>
                <Text style={styles.nozzleDetail}>Fuel: <Text style={{fontWeight: 'bold'}}>{n.fuelType || 'Petrol'}</Text></Text>
                <TouchableOpacity onPress={() => handleEditNozzleOpen(n)} style={{ padding: 5, marginRight: 10 }}>
                  <Icon name="create-outline" size={20} color="#003C8F" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteNozzle(n)} style={{ padding: 5 }}>
                  <Icon name="trash-outline" size={20} color="#d32f2f" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Main Tabs */}
      <View style={styles.mainTabContainer}>
        <TouchableOpacity 
          style={[styles.mainTab, activeMainTab === 'system' && styles.activeMainTab]}
          onPress={() => setActiveMainTab('system')}
        >
          <Text style={[styles.mainTabText, activeMainTab === 'system' && styles.activeMainTabText]}>System Config</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, activeMainTab === 'stock' && styles.activeMainTab]}
          onPress={() => setActiveMainTab('stock')}
        >
          <Text style={[styles.mainTabText, activeMainTab === 'stock' && styles.activeMainTabText]}>Manage Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTab, activeMainTab === 'staff' && styles.activeMainTab]}
          onPress={() => setActiveMainTab('staff')}
        >
          <Text style={[styles.mainTabText, activeMainTab === 'staff' && styles.activeMainTabText]}>Staff Mgmt</Text>
        </TouchableOpacity>
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
      
      {activeMainTab === 'system' && (
        <View style={{ flex: 1 }}>
          {/* Action Buttons */}
          <View style={styles.actionRowTop}>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#003C8F' }]}
              onPress={() => { setActiveTab('machine'); setIsEditMode(false); setNewMachineName(''); setIsModalVisible(true); }}
            >
              <Icon name="add-circle-outline" size={20} color="#fff" style={{marginRight: 5}} />
              <Text style={styles.actionBtnText}>New Machine</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#FF6F00' }]}
              onPress={() => { setActiveTab('nozzle'); setIsEditMode(false); setIsModalVisible(true); }}
            >
              <Icon name="git-network-outline" size={20} color="#fff" style={{marginRight: 5}} />
              <Text style={styles.actionBtnText}>Map Nozzle</Text>
            </TouchableOpacity>
          </View>

          <FlatList 
            data={machines}
            keyExtractor={item => item.id}
            renderItem={renderMachineCard}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={<Text style={{textAlign: 'center', color: '#888', marginTop: 50}}>No machines created yet. Click '+ New Machine' to start.</Text>}
          />
        </View>
      )}

      {/* Modal for Forms */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentWrapper}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {activeTab === 'machine' 
                  ? (isEditMode ? 'Edit Machine Settings' : 'Add New Machine') 
                  : (isEditMode ? 'Edit Nozzle' : 'Configure Nozzle')}
              </Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Icon name="close-circle" size={28} color="#d32f2f" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {activeTab === 'machine' ? (
                <View>
            <CustomInput 
              placeholder="Machine Name (e.g. M1)" 
              value={newMachineName} 
              onChangeText={setNewMachineName} 
              editable={!isEditMode}
              style={isEditMode ? { opacity: 0.7 } : {}}
            />
            
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Number of Nozzles</Text>
              <Picker
                selectedValue={newMachineNozzleCount}
                onValueChange={(itemValue) => setNewMachineNozzleCount(itemValue)}
                style={styles.picker}
              >
                {getNumberArray(10).map(num => (
                  <Picker.Item key={num} label={`${num} Nozzles`} value={num} />
                ))}
              </Picker>
            </View>

            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Connect Machine to Tank</Text>
              <Picker
                selectedValue={selectedTankId}
                onValueChange={(itemValue) => setSelectedTankId(itemValue)}
                style={styles.picker}
              >
                {tanks.length === 0 && <Picker.Item label="No Tanks Available" value="" />}
                {tanks.map(tank => (
                  <Picker.Item key={tank.id} label={tank.id} value={tank.id} />
                ))}
              </Picker>
            </View>
            
            <CustomButton title="SAVE MACHINE" onPress={handleCreateMachine} loading={isCreatingMachine} style={{marginTop: 10}} />
          </View>
        ) : (
              <View>
            
            <View style={styles.row}>
              <View style={[styles.pickerContainer, {flex: 1, marginRight: 5}]}>
                <Text style={styles.pickerLabel}>Select Machine</Text>
                <Picker
                  selectedValue={selectedMachineId}
                  onValueChange={(itemValue) => {
                    setSelectedMachineId(itemValue);
                    setSelectedNozzleIndex(1); // reset nozzle index
                  }}
                  style={styles.picker}
                >
                  {machines.length === 0 && <Picker.Item label="No Machines" value="" />}
                  {machines.map(m => (
                    <Picker.Item key={m.id} label={m.name} value={m.id} />
                  ))}
                </Picker>
              </View>

              <View style={[styles.pickerContainer, {flex: 1, marginLeft: 5}]}>
                <Text style={styles.pickerLabel}>Select Nozzle</Text>
                <Picker
                  selectedValue={selectedNozzleIndex}
                  onValueChange={(itemValue) => setSelectedNozzleIndex(itemValue)}
                  style={styles.picker}
                  enabled={currentNozzleCount > 0}
                >
                  {currentNozzleCount === 0 && <Picker.Item label="-" value={1} />}
                  {getNumberArray(currentNozzleCount).map(num => (
                    <Picker.Item key={num} label={`Nozzle ${num}`} value={num} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Fuel Type for this Nozzle</Text>
              <Picker
                selectedValue={selectedFuelType}
                onValueChange={(itemValue) => setSelectedFuelType(itemValue)}
                style={styles.picker}
              >
                <Picker.Item label="Petrol" value="Petrol" />
                <Picker.Item label="Diesel" value="Diesel" />
              </Picker>
            </View>

            <CustomButton title="SAVE NOZZLE" onPress={handleConfigureNozzle} loading={isConfiguringNozzle} style={{marginTop: 10}} />
              </View>
            )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 15 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: '#003C8F', marginBottom: 10, textAlign: 'center' },
  
  // Main Tabs Styles
  mainTabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 4, marginBottom: 15 },
  mainTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  activeMainTab: { backgroundColor: '#fff', elevation: 2 },
  mainTabText: { fontWeight: 'bold', color: '#666', fontSize: 12 },
  activeMainTabText: { color: '#003C8F' },

  actionRowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, marginHorizontal: 5, elevation: 2 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContentWrapper: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 5, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalScroll: { width: '100%' },
  
  pickerContainer: { backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginBottom: 12 },
  pickerLabel: { fontSize: 12, color: '#666', marginLeft: 10, marginTop: 5, fontWeight: 'bold' },
  picker: { height: 50, width: '100%' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  
  machineCard: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 15, elevation: 2 },
  machineHeader: { backgroundColor: '#003C8F', padding: 15, flexDirection: 'row', alignItems: 'center' },
  machineTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 10, flex: 1 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  nozzleList: { padding: 15 },
  noDataText: { fontStyle: 'italic', color: '#888', textAlign: 'center' },
  nozzleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  fuelIndicator: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  nozzleName: { fontSize: 16, fontWeight: 'bold', color: '#333', width: 40 },
  nozzleDetail: { fontSize: 14, color: '#555', flex: 1 }
});
