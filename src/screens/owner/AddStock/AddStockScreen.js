import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  Modal 
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { doc, setDoc, deleteDoc, increment, onSnapshot, collection, addDoc } from 'firebase/firestore';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { db } from '../../../services/firebase';
import CustomAlert from '../../../components/CustomAlert';

export default function AddStockScreen() {
  const [selectedTankId, setSelectedTankId] = useState('');
  const [petrolQuantity, setPetrolQuantity] = useState('');
  const [dieselQuantity, setDieselQuantity] = useState('');
  const [tanks, setTanks] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal State for New Tank
  const [isModalVisible, setModalVisible] = useState(false);
  const [newTankName, setNewTankName] = useState('');
  const [creatingTank, setCreatingTank] = useState(false);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [tankToDelete, setTankToDelete] = useState(null);
  const [isDeletingTank, setIsDeletingTank] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setTanks(list);
      // Auto-select first tank if available and nothing is selected
      if (list.length > 0 && !selectedTankId) {
        setSelectedTankId(list[0].id);
      }
    });
    return unsub;
  }, []);

  const handleAddNewTank = async () => {
    if (!newTankName.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter a valid Tank Name.' });
      return;
    }

    const uppercaseName = newTankName.trim().toUpperCase();
    
    // Check if it already exists
    if (tanks.find(t => t.id === uppercaseName)) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'A tank with this name already exists.' });
      return;
    }

    setCreatingTank(true);
    try {
      const tankRef = doc(db, 'tanks', uppercaseName);
      await setDoc(tankRef, {
        tankId: uppercaseName,
        petrolStock: 0,
        dieselStock: 0,
        lastUpdated: new Date()
      });
      
      Toast.show({ type: 'success', text1: 'Success', text2: `Tank "${uppercaseName}" created successfully.` });
      setSelectedTankId(uppercaseName); // auto select the newly created tank
      setNewTankName('');
      setModalVisible(false);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setCreatingTank(false);
    }
  };

  const handleUpdateStock = async () => {
    if (!selectedTankId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please select a Tank from the dropdown.' });
      return;
    }

    const pQty = parseFloat(petrolQuantity) || 0;
    const dQty = parseFloat(dieselQuantity) || 0;

    if (pQty === 0 && dQty === 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter at least one valid fuel quantity.' });
      return;
    }
    if (pQty < 0 || dQty < 0) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Quantities cannot be negative.' });
      return;
    }

    setLoading(true);
    try {
      const tankRef = doc(db, 'tanks', selectedTankId);
      const updateData = {
        lastUpdated: new Date()
      };

      if (pQty > 0) updateData.petrolStock = increment(pQty);
      if (dQty > 0) updateData.dieselStock = increment(dQty);

      await setDoc(tankRef, updateData, { merge: true });

      // Create a log of this fuel addition
      await addDoc(collection(db, 'tank_logs'), {
        tankId: selectedTankId,
        type: 'addition',
        petrolAdded: pQty,
        dieselAdded: dQty,
        timestamp: new Date()
      });

      Toast.show({ type: 'success', text1: 'Success', text2: `Stock updated for ${selectedTankId}` });
      setPetrolQuantity('');
      setDieselQuantity('');
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTank = (tankIdToDelete) => {
    setTankToDelete(tankIdToDelete);
    setAlertVisible(true);
  };

  const renderTank = ({ item }) => (
    <View style={styles.tankCard}>
      <View style={styles.tankCardHeader}>
        <Text style={styles.tankTitle}>{item.tankId}</Text>
        <TouchableOpacity onPress={() => handleDeleteTank(item.id)} style={styles.deleteIcon}>
          <Icon name="trash-outline" size={20} color="#d32f2f" />
        </TouchableOpacity>
      </View>
      <View style={styles.stockRow}>
        <Text style={styles.petrolText}>P: {item.petrolStock?.toFixed(2) || '0.00'} L</Text>
      </View>
      <View style={styles.stockRow}>
        <Text style={styles.dieselText}>D: {item.dieselStock?.toFixed(2) || '0.00'} L</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Text style={styles.title}>Manage Tanks & Fuel</Text>
      
      <View style={styles.form}>
        
        {/* Dropdown & Add New Tank Button Row */}
        <View style={styles.tankSelectionRow}>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedTankId}
              onValueChange={(itemValue) => setSelectedTankId(itemValue)}
              style={styles.picker}
            >
              {tanks.length === 0 && <Picker.Item label="No Tanks Found" value="" />}
              {tanks.map(tank => (
                <Picker.Item key={tank.id} label={tank.id} value={tank.id} />
              ))}
            </Picker>
          </View>
          
          <TouchableOpacity 
            style={styles.addNewBtn} 
            onPress={() => setModalVisible(true)}
          >
            <Icon name="add-circle" size={20} color="#fff" />
            <Text style={styles.addNewBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {/* Quantity Inputs */}
        <View style={styles.row}>
          <View style={styles.inputContainer}>
             <Text style={styles.inputLabel}>Petrol (Liters)</Text>
             <TextInput
              style={[styles.input, { borderColor: '#FF6F00' }]}
              placeholder="0.00"
              value={petrolQuantity}
              onChangeText={setPetrolQuantity}
              keyboardType="numeric"
            />
          </View>
          <View style={{ width: 10 }} />
          <View style={styles.inputContainer}>
             <Text style={styles.inputLabel}>Diesel (Liters)</Text>
             <TextInput
              style={[styles.input, { borderColor: '#003C8F' }]}
              placeholder="0.00"
              value={dieselQuantity}
              onChangeText={setDieselQuantity}
              keyboardType="numeric"
            />
          </View>
        </View>
        
        <TouchableOpacity style={styles.button} onPress={handleUpdateStock} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'SAVING...' : 'UPDATE FUEL STOCK'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Current Tank Levels</Text>
      <FlatList 
        data={tanks}
        keyExtractor={item => item.id}
        renderItem={renderTank}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        showsVerticalScrollIndicator={false}
      />

      {/* MODAL FOR CREATING A NEW TANK */}
      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Tank</Text>
            <Text style={styles.modalSubtitle}>Give your new tank a unique name.</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. TANK 3"
              value={newTankName}
              onChangeText={setNewTankName}
              autoCapitalize="characters"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => {
                  setModalVisible(false);
                  setNewTankName('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.modalCreateBtn} 
                onPress={handleAddNewTank}
                disabled={creatingTank}
              >
                <Text style={styles.modalCreateText}>{creatingTank ? 'Creating...' : 'Create Tank'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={alertVisible}
        title="Delete Tank"
        message={`Are you sure you want to delete ${tankToDelete}? This action cannot be undone.`}
        isDestructive={true}
        cancelText="Cancel"
        confirmText="Delete"
        loading={isDeletingTank}
        onCancel={() => {
          setAlertVisible(false);
          setTankToDelete(null);
        }}
        onConfirm={async () => {
          setIsDeletingTank(true);
          try {
            await deleteDoc(doc(db, 'tanks', tankToDelete));
            if (selectedTankId === tankToDelete) {
              setSelectedTankId('');
            }
            Toast.show({ type: 'success', text1: 'Deleted', text2: `${tankToDelete} has been removed.` });
            setAlertVisible(false);
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message });
            setAlertVisible(false);
          } finally {
            setIsDeletingTank(false);
            setTankToDelete(null);
          }
        }}
      />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#003C8F', marginBottom: 15, textAlign: 'center' },
  subtitle: { fontSize: 18, fontWeight: 'bold', marginVertical: 10, color: '#333' },
  
  form: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2, marginBottom: 15 },
  
  tankSelectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  pickerContainer: { flex: 1, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', marginRight: 10, overflow: 'hidden' },
  picker: { height: 50, width: '100%' },
  
  addNewBtn: { backgroundColor: '#FF6F00', flexDirection: 'row', paddingHorizontal: 12, height: 50, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addNewBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 5 },

  row: { flexDirection: 'row', justifyContent: 'space-between' },
  inputContainer: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5, marginLeft: 2 },
  input: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', fontSize: 16 },
  
  button: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 5 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  
  tankCard: { flex: 0.48, backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2, marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
  tankCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  deleteIcon: { padding: 4 },
  tankTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  stockRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 4 },
  petrolText: { fontSize: 14, color: '#FF6F00', fontWeight: 'bold' },
  dieselText: { fontSize: 14, color: '#003C8F', fontWeight: 'bold' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#fff', width: '100%', borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#003C8F', marginBottom: 5 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 15 },
  modalInput: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', fontSize: 16, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalCancelBtn: { padding: 10, marginRight: 10 },
  modalCancelText: { color: '#888', fontWeight: 'bold', fontSize: 16 },
  modalCreateBtn: { backgroundColor: '#003C8F', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  modalCreateText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
