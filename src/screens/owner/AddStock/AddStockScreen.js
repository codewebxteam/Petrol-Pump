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
  const [newTankFuelType, setNewTankFuelType] = useState('Petrol');
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
        fuelType: newTankFuelType,
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
    const currentTankId = selectedTankId || effectiveTanks[0]?.id;
    if (!currentTankId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please select a tank first.' });
      return;
    }

    const pQty = parseFloat(petrolQuantity) || 0;
    const dQty = parseFloat(dieselQuantity) || 0;

    if (isDieselSelected ? dQty <= 0 : pQty <= 0) {
      Toast.show({ 
        type: 'error', 
        text1: 'Error', 
        text2: `Please enter a valid quantity (Liters) for ${isDieselSelected ? 'Diesel' : 'Petrol'}.` 
      });
      return;
    }

    setLoading(true);
    try {
      const tankRef = doc(db, 'tanks', currentTankId);
      const updateData = {
        lastUpdated: new Date()
      };

      if (!isDieselSelected && pQty > 0) updateData.petrolStock = increment(pQty);
      if (isDieselSelected && dQty > 0) updateData.dieselStock = increment(dQty);

      await setDoc(tankRef, updateData, { merge: true });

      // Create a log of this fuel addition
      await addDoc(collection(db, 'tank_logs'), {
        tankId: currentTankId,
        type: 'addition',
        fuelType: isDieselSelected ? 'Diesel' : 'Petrol',
        petrolAdded: isDieselSelected ? 0 : pQty,
        dieselAdded: isDieselSelected ? dQty : 0,
        addedLiters: isDieselSelected ? dQty : pQty,
        timestamp: new Date(),
        note: `Added ${isDieselSelected ? dQty : pQty} L stock to ${currentTankId} (${isDieselSelected ? 'Diesel' : 'Petrol'})`
      });

      Toast.show({ 
        type: 'success', 
        text1: 'Stock Updated!', 
        text2: `${currentTankId}: Added +${isDieselSelected ? dQty : pQty} L ${isDieselSelected ? 'Diesel' : 'Petrol'}.` 
      });
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

  const effectiveTanks = tanks.length > 0 ? tanks : [
    { id: 'Tank-1', tankId: 'Tank 1 (Petrol - MS)', fuelType: 'Petrol', petrolStock: 18450, dieselStock: 0 },
    { id: 'Tank-2', tankId: 'Tank 2 (Diesel - HSD)', fuelType: 'Diesel', petrolStock: 0, dieselStock: 22800 }
  ];

  const currentTankId = selectedTankId || (effectiveTanks[0]?.id);
  const activeTank = effectiveTanks.find(t => t.id === currentTankId) || effectiveTanks[0];
  const isDieselSelected = (activeTank?.id === 'Tank-2') || 
                           (activeTank?.fuelType?.toLowerCase() === 'diesel') || 
                           String(activeTank?.tankId || activeTank?.id || '').toLowerCase().includes('diesel');

  const renderTank = ({ item }) => {
    const isDiesel = item.id === 'Tank-2' || item.fuelType === 'Diesel' || String(item.tankId || item.id).toLowerCase().includes('diesel');
    return (
      <View style={[styles.tankCard, { borderColor: isDiesel ? '#003C8F' : '#FF6F00', borderWidth: 1.5 }]}>
        <View style={styles.tankCardHeader}>
          <Text style={styles.tankTitle}>{item.id === 'Tank-1' ? 'Tank 1 (Petrol)' : item.id === 'Tank-2' ? 'Tank 2 (Diesel)' : item.tankId || item.id}</Text>
          <TouchableOpacity onPress={() => handleDeleteTank(item.id)} style={styles.deleteIcon}>
            <Icon name="trash-outline" size={20} color="#d32f2f" />
          </TouchableOpacity>
        </View>
        {isDiesel ? (
          <View style={styles.stockRow}>
            <Text style={[styles.dieselText, { fontSize: 16, fontWeight: 'bold' }]}>
              🛢️ Diesel: {parseFloat(item.dieselStock || 0).toFixed(1)} L
            </Text>
          </View>
        ) : (
          <View style={styles.stockRow}>
            <Text style={[styles.petrolText, { fontSize: 16, fontWeight: 'bold' }]}>
              ⛽ Petrol: {parseFloat(item.petrolStock || 0).toFixed(1)} L
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <Text style={styles.title}>Manage Tanks & Fuel</Text>
      
      <View style={styles.form}>
        
        {/* Dropdown & Add New Tank Button Row */}
        <View style={styles.tankSelectionRow}>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedTankId || (effectiveTanks[0]?.id)}
              onValueChange={(itemValue) => {
                setSelectedTankId(itemValue);
                setPetrolQuantity('');
                setDieselQuantity('');
              }}
              style={styles.picker}
            >
              {effectiveTanks.map(tank => (
                <Picker.Item 
                  key={tank.id} 
                  label={tank.id === 'Tank-1' ? 'Tank 1 (Petrol - MS)' : tank.id === 'Tank-2' ? 'Tank 2 (Diesel - HSD)' : tank.tankId || tank.id} 
                  value={tank.id} 
                />
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

        {/* Dynamic Quantity Input based on Selected Tank */}
        {isDieselSelected ? (
          <View style={{ marginBottom: 12 }}>
            <View style={[styles.currentStockBadge, { backgroundColor: '#E3F2FD' }]}>
              <Icon name="water" size={18} color="#003C8F" />
              <Text style={[styles.currentStockText, { color: '#003C8F' }]}>
                Tank 2 (Diesel) | Current Stock: {parseFloat(activeTank?.dieselStock || 0).toFixed(1)} L
              </Text>
            </View>
            <Text style={styles.inputLabel}>Add Diesel Stock (Liters) *</Text>
            <TextInput
              style={[styles.input, { borderColor: '#003C8F', borderWidth: 1.5 }]}
              placeholder="e.g. 5000"
              value={dieselQuantity}
              onChangeText={setDieselQuantity}
              keyboardType="numeric"
            />
          </View>
        ) : (
          <View style={{ marginBottom: 12 }}>
            <View style={[styles.currentStockBadge, { backgroundColor: '#FFF3E0' }]}>
              <Icon name="flame" size={18} color="#FF6F00" />
              <Text style={[styles.currentStockText, { color: '#FF6F00' }]}>
                Tank 1 (Petrol) | Current Stock: {parseFloat(activeTank?.petrolStock || 0).toFixed(1)} L
              </Text>
            </View>
            <Text style={styles.inputLabel}>Add Petrol Stock (Liters) *</Text>
            <TextInput
              style={[styles.input, { borderColor: '#FF6F00', borderWidth: 1.5 }]}
              placeholder="e.g. 5000"
              value={petrolQuantity}
              onChangeText={setPetrolQuantity}
              keyboardType="numeric"
            />
          </View>
        )}
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: isDieselSelected ? '#003C8F' : '#FF6F00' }]} 
          onPress={handleUpdateStock} 
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Updating...' : `+ Add ${isDieselSelected ? 'Diesel' : 'Petrol'} Stock`}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Current Tank Levels</Text>
      <FlatList 
        data={effectiveTanks}
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

            <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Fuel Type:</Text>
            <View style={{ flexDirection: 'row', marginBottom: 20 }}>
              <TouchableOpacity 
                style={[
                  styles.fuelTypeSelectBtn, 
                  newTankFuelType === 'Petrol' && { backgroundColor: '#FF6F00', borderColor: '#FF6F00' }
                ]}
                onPress={() => setNewTankFuelType('Petrol')}
              >
                <Icon name="flame" size={16} color={newTankFuelType === 'Petrol' ? '#fff' : '#FF6F00'} style={{ marginRight: 4 }} />
                <Text style={{ color: newTankFuelType === 'Petrol' ? '#fff' : '#FF6F00', fontWeight: 'bold' }}>Petrol (MS)</Text>
              </TouchableOpacity>
              <View style={{ width: 10 }} />
              <TouchableOpacity 
                style={[
                  styles.fuelTypeSelectBtn, 
                  newTankFuelType === 'Diesel' && { backgroundColor: '#003C8F', borderColor: '#003C8F' }
                ]}
                onPress={() => setNewTankFuelType('Diesel')}
              >
                <Icon name="water" size={16} color={newTankFuelType === 'Diesel' ? '#fff' : '#003C8F'} style={{ marginRight: 4 }} />
                <Text style={{ color: newTankFuelType === 'Diesel' ? '#fff' : '#003C8F', fontWeight: 'bold' }}>Diesel (HSD)</Text>
              </TouchableOpacity>
            </View>
            
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
            Toast.show({ type: 'success', text1: 'Deleted', text2: `Tank ${tankToDelete} was deleted.` });
            if (selectedTankId === tankToDelete) {
              setSelectedTankId('');
            }
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message });
          } finally {
            setAlertVisible(false);
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

  currentStockBadge: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 12 },
  currentStockText: { fontSize: 13, fontWeight: 'bold', marginLeft: 6 },
  fuelTypeSelectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#ddd' },

  row: { flexDirection: 'row', justifyContent: 'space-between' },
  inputContainer: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 5, marginLeft: 2 },
  input: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', fontSize: 16 },
  
  button: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 5 },
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
  modalInput: { backgroundColor: '#f9f9f9', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', fontSize: 16, marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalCancelBtn: { padding: 10, marginRight: 10 },
  modalCancelText: { color: '#888', fontWeight: 'bold', fontSize: 16 },
  modalCreateBtn: { backgroundColor: '#003C8F', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  modalCreateText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
