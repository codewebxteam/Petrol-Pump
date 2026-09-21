import React, { useState, useEffect, useMemo, useContext } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  KeyboardAvoidingView, 
  Platform, 
  Modal,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { 
  doc, 
  setDoc, 
  deleteDoc, 
  increment, 
  onSnapshot, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { db } from '../../../services/firebase';
import { AuthContext } from '../../../context/AuthContext';
import CustomAlert from '../../../components/CustomAlert';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';

export default function AddStockScreen() {
  const { userData } = useContext(AuthContext) || {};
  const [tanks, setTanks] = useState([]);
  const [recentAdditions, setRecentAdditions] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState('');
  
  // Fuel Addition Form State
  const [quantityLiters, setQuantityLiters] = useState('');
  const [tankerNumber, setTankerNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierDepot, setSupplierDepot] = useState('IOCL Baitalpur Depot');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [dipReading, setDipReading] = useState('');
  const [densityReading, setDensityReading] = useState('');
  const isOwner = userData?.role === 'owner';
  const [operatorName, setOperatorName] = useState(isOwner ? 'Owner / Admin' : '');
  const [deliveryDate, setDeliveryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userData?.role === 'owner') {
      setOperatorName('Owner / Admin');
    } else {
      setOperatorName('');
    }
  }, [userData?.role]);

  // Modal State for New Tank
  const [isModalVisible, setModalVisible] = useState(false);
  const [newTankName, setNewTankName] = useState('');
  const [newTankFuelType, setNewTankFuelType] = useState('Petrol');
  const [creatingTank, setCreatingTank] = useState(false);

  // Custom Alert State for Delete Tank
  const [alertVisible, setAlertVisible] = useState(false);
  const [tankToDelete, setTankToDelete] = useState(null);
  const [isDeletingTank, setIsDeletingTank] = useState(false);

  // Custom Alert State for Reverting Fuel Addition
  const [revertAlertVisible, setRevertAlertVisible] = useState(false);
  const [additionToRevert, setAdditionToRevert] = useState(null);
  const [isRevertingAddition, setIsRevertingAddition] = useState(false);

  // 1. Subscribe to Tanks Collection
  useEffect(() => {
    const unsubTanks = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setTanks(list);
      if (list.length > 0 && !selectedTankId) {
        setSelectedTankId(list[0].id);
      }
    }, (error) => {
      console.warn("Firestore tanks error:", error.message);
    });

    // 2. Subscribe to Recent Fuel Deliveries (tank_logs)
    const unsubLogs = onSnapshot(collection(db, 'tank_logs'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data.type === 'addition') {
          list.push({ id: d.id, ...data });
        }
      });
      list.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setRecentAdditions(list.slice(0, 15)); // Keep recent 15
    }, (error) => {
      console.warn("Firestore tank_logs error:", error.message);
    });

    return () => {
      unsubTanks();
      unsubLogs();
    };
  }, []);

  // Canonical default tanks if empty
  const effectiveTanks = useMemo(() => {
    if (tanks.length > 0) return tanks;
    return [
      { id: 'Tank-1', tankId: 'Tank 1 (Petrol - MS)', fuelType: 'Petrol', petrolStock: 18450, stock: 18450, dieselStock: 0 },
      { id: 'Tank-2', tankId: 'Tank 2 (Diesel - HSD)', fuelType: 'Diesel', petrolStock: 0, dieselStock: 22800, stock: 22800 }
    ];
  }, [tanks]);

  const currentTankId = selectedTankId || effectiveTanks[0]?.id || 'Tank-1';
  const activeTank = effectiveTanks.find(t => t.id === currentTankId) || effectiveTanks[0];
  const isDieselSelected = (activeTank?.id === 'Tank-2') || 
                           (activeTank?.fuelType?.toLowerCase() === 'diesel') || 
                           String(activeTank?.tankId || activeTank?.id || '').toLowerCase().includes('diesel') ||
                           String(activeTank?.tankId || activeTank?.id || '').includes('2');

  const handleQuantityChange = (val) => {
    setQuantityLiters(val);
  };

  // Create a New Custom Tank
  const handleAddNewTank = async () => {
    if (!newTankName.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please enter a valid Tank Name.' });
      return;
    }

    const uppercaseName = newTankName.trim().toUpperCase();
    if (tanks.find(t => t.id === uppercaseName || t.tankId === uppercaseName)) {
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
        stock: 0,
        capacity: 20000,
        createdAt: new Date(),
        lastUpdated: new Date()
      });
      
      Toast.show({ type: 'success', text1: 'Tank Created', text2: `Tank "${uppercaseName}" added successfully.` });
      setSelectedTankId(uppercaseName);
      setNewTankName('');
      setModalVisible(false);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setCreatingTank(false);
    }
  };

  // Submit Fuel Addition / Tank Unloading
  const handleUpdateStock = async () => {
    const targetTankId = currentTankId;
    if (!targetTankId) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Please select a tank first.' });
      return;
    }

    const qty = parseFloat(quantityLiters) || 0;
    if (qty <= 0) {
      Toast.show({ 
        type: 'error', 
        text1: 'Invalid Quantity', 
        text2: `Please enter a valid quantity in Liters for ${isDieselSelected ? 'Diesel' : 'Petrol'}.` 
      });
      return;
    }

    const fuelName = isDieselSelected ? 'Diesel' : 'Petrol';

    setLoading(true);
    try {
      // 1. Update Tank Stock in Firestore
      const tankRef = doc(db, 'tanks', targetTankId);
      const updateData = {
        stock: increment(qty),
        lastAddedLiters: qty,
        lastInvoiceNumber: invoiceNumber.trim() || null,
        lastTankerNumber: tankerNumber.trim() || null,
        lastUpdated: new Date()
      };

      if (isDieselSelected) {
        updateData.dieselStock = increment(qty);
      } else {
        updateData.petrolStock = increment(qty);
      }

      await setDoc(tankRef, updateData, { merge: true });

      // If tank has dual key (e.g. Tank-1 and Tank 1), sync canonical representation
      const altId = targetTankId.includes('-') ? targetTankId.replace('-', ' ') : targetTankId.replace(' ', '-');
      if (tanks.some(t => t.id === altId)) {
        await setDoc(doc(db, 'tanks', altId), updateData, { merge: true }).catch(() => null);
      }

      // 2. Record detailed log in tank_logs
      await addDoc(collection(db, 'tank_logs'), {
        type: 'addition',
        tankId: targetTankId,
        tankName: activeTank?.tankName || activeTank?.tankId || targetTankId,
        fuelType: fuelName,
        petrolAdded: isDieselSelected ? 0 : qty,
        dieselAdded: isDieselSelected ? qty : 0,
        tankerNumber: tankerNumber.trim().toUpperCase() || 'N/A',
        invoiceNumber: invoiceNumber.trim().toUpperCase() || 'N/A',
        supplier: supplierDepot.trim() || 'IOCL Baitalpur Depot',
        driverName: driverName.trim() || 'N/A',
        driverPhone: driverPhone.trim() || 'N/A',
        dipReading: dipReading.trim() ? `${dipReading.trim()} cm` : null,
        density: densityReading.trim() ? `${densityReading.trim()} kg/m³` : null,
        operatorName: operatorName.trim() || '',
        note: deliveryNotes.trim() || `Unloaded ${qty} L ${fuelName} into ${targetTankId}`,
        timestamp: deliveryDate,
        createdAt: new Date()
      });

      Toast.show({ 
        type: 'success', 
        text1: 'Fuel Stock Added!', 
        text2: `+${qty} L ${fuelName} added to ${targetTankId} successfully.` 
      });

      // Clear Form Fields
      setQuantityLiters('');
      setInvoiceNumber('');
      setTankerNumber('');
      setDriverName('');
      setDriverPhone('');
      setDipReading('');
      setDensityReading('');
      setDeliveryNotes('');
      setDeliveryDate(new Date());
      if (!isOwner) {
        setOperatorName('');
      }
    } catch (error) {
      console.error("Error adding stock:", error);
      Toast.show({ type: 'error', text1: 'Update Failed', text2: error.message || 'Could not update stock.' });
    } finally {
      setLoading(false);
    }
  };

  // Revert / Delete an accidental Fuel Addition
  const handleConfirmRevertAddition = (item) => {
    setAdditionToRevert(item);
    setRevertAlertVisible(true);
  };

  const executeRevertAddition = async () => {
    if (!additionToRevert) return;
    setIsRevertingAddition(true);
    try {
      const { id, tankId, addedLiters, petrolAdded, dieselAdded, fuelType } = additionToRevert;
      const qtyToDeduct = parseFloat(addedLiters || (fuelType === 'Diesel' ? dieselAdded : petrolAdded) || 0);

      if (qtyToDeduct > 0 && tankId) {
        const isDiesel = fuelType === 'Diesel' || dieselAdded > 0;
        const tankRef = doc(db, 'tanks', tankId);
        const rollbackData = {
          stock: increment(-qtyToDeduct),
          lastUpdated: new Date()
        };
        if (isDiesel) {
          rollbackData.dieselStock = increment(-qtyToDeduct);
        } else {
          rollbackData.petrolStock = increment(-qtyToDeduct);
        }
        await setDoc(tankRef, rollbackData, { merge: true }).catch(() => null);

        // Also check alternate ID
        const altId = tankId.includes('-') ? tankId.replace('-', ' ') : tankId.replace(' ', '-');
        if (tanks.some(t => t.id === altId)) {
          await setDoc(doc(db, 'tanks', altId), rollbackData, { merge: true }).catch(() => null);
        }
      }

      // Delete the log
      await deleteDoc(doc(db, 'tank_logs', id));

      Toast.show({
        type: 'success',
        text1: 'Delivery Reverted',
        text2: `Deducted ${qtyToDeduct} L and removed log entry.`
      });
    } catch (err) {
      console.error("Error reverting addition:", err);
      Toast.show({ type: 'error', text1: 'Revert Failed', text2: err.message });
    } finally {
      setIsRevertingAddition(false);
      setRevertAlertVisible(false);
      setAdditionToRevert(null);
    }
  };

  // Delete a Tank
  const handleDeleteTank = (tankIdToDelete) => {
    setTankToDelete(tankIdToDelete);
    setAlertVisible(true);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* Header Title */}
        <View style={styles.headerBox}>
          <View style={styles.headerIconCircle}>
            <Icon name="water" size={24} color="#003C8F" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.mainTitle}>Fuel Addition & Tank Management</Text>
            <Text style={styles.mainSubTitle}>Record fuel tanker deliveries, invoices, and update tank stock</Text>
          </View>
        </View>

        {/* Section 1: Interactive Tank Level Cards */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Tank Inventory Status</Text>
          <TouchableOpacity style={styles.newTankPillBtn} onPress={() => setModalVisible(true)}>
            <Icon name="add-circle" size={16} color="#003C8F" style={{ marginRight: 4 }} />
            <Text style={styles.newTankPillBtnText}>Add New Tank</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tanksGrid}>
          {effectiveTanks.map((tank) => {
            const isDiesel = tank.id === 'Tank-2' || tank.fuelType === 'Diesel' || String(tank.tankId || tank.id).toLowerCase().includes('diesel') || String(tank.id).includes('2');
            const isSelected = tank.id === currentTankId;
            const stockVal = parseFloat(tank.stock !== undefined ? tank.stock : (isDiesel ? tank.dieselStock : tank.petrolStock) || 0);
            const capacityVal = parseFloat(tank.capacity || (isDiesel ? tank.dieselCapacity : tank.petrolCapacity) || 20000);
            const percent = Math.min(100, Math.max(0, (stockVal / capacityVal) * 100));

            return (
              <TouchableOpacity
                key={tank.id}
                style={[
                  styles.tankCard,
                  { borderColor: isSelected ? (isDiesel ? '#003C8F' : '#FF6F00') : '#E2E8F0' },
                  isSelected && styles.tankCardSelected
                ]}
                onPress={() => setSelectedTankId(tank.id)}
                activeOpacity={0.85}
              >
                <View style={styles.tankCardTop}>
                  <View style={[styles.fuelPill, { backgroundColor: isDiesel ? '#E0EDFF' : '#FFF3E0' }]}>
                    <Icon name={isDiesel ? 'water' : 'flame'} size={14} color={isDiesel ? '#003C8F' : '#FF6F00'} style={{ marginRight: 4 }} />
                    <Text style={[styles.fuelPillText, { color: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                      {isDiesel ? 'Diesel (HSD)' : 'Petrol (MS)'}
                    </Text>
                  </View>
                  
                  {tank.id !== 'Tank-1' && tank.id !== 'Tank-2' && (
                    <TouchableOpacity onPress={() => handleDeleteTank(tank.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Icon name="trash-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.tankCardName}>
                  {tank.id === 'Tank-1' ? 'Tank 1 (Petrol)' : tank.id === 'Tank-2' ? 'Tank 2 (Diesel)' : tank.tankId || tank.id}
                </Text>

                <View style={styles.stockValueRow}>
                  <Text style={[styles.stockValueNumber, { color: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                    {stockVal.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </Text>
                  <Text style={styles.stockValueUnit}> Liters</Text>
                </View>

                {/* Progress Bar */}
                <View style={styles.tankProgressBarTrack}>
                  <View 
                    style={[
                      styles.tankProgressBarFill, 
                      { 
                        width: `${percent}%`, 
                        backgroundColor: isDiesel ? '#003C8F' : '#FF6F00' 
                      }
                    ]} 
                  />
                </View>
                <View style={styles.tankProgressLabels}>
                  <Text style={styles.tankProgressText}>{percent.toFixed(0)}% Full</Text>
                </View>
                
                {isSelected && (
                  <View style={[styles.selectedBanner, { backgroundColor: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                    <Icon name="checkmark-circle" size={12} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.selectedBannerText}>Active for Fuel Delivery</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 2: Fuel Unloading / Stock Addition Form */}
        <View style={styles.formContainer}>
          <View style={styles.formHeaderRow}>
            <View>
              <Text style={styles.formHeaderTitle}>Tanker Delivery & Stock Entry</Text>
              <Text style={styles.formHeaderSub}>
                Unloading into: <Text style={{ fontWeight: '900', color: isDieselSelected ? '#003C8F' : '#FF6F00' }}>
                  {activeTank?.tankName || activeTank?.tankId || currentTankId} ({isDieselSelected ? 'Diesel' : 'Petrol'})
                </Text>
              </Text>
            </View>
            <View style={[styles.fuelBadgeLarge, { backgroundColor: isDieselSelected ? '#003C8F' : '#FF6F00' }]}>
              <Icon name={isDieselSelected ? 'water' : 'flame'} size={18} color="#fff" />
            </View>
          </View>

          {/* Quantity in Liters (Primary Input) */}
          <View style={styles.primaryInputBox}>
            <Text style={styles.inputSectionLabel}>FUEL QUANTITY UNLOADED (LITERS) *</Text>
            <View style={styles.quantityRow}>
              <TextInput
                style={[styles.bigQuantityInput, { borderColor: isDieselSelected ? '#003C8F' : '#FF6F00' }]}
                placeholder="e.g. 5000"
                value={quantityLiters}
                onChangeText={handleQuantityChange}
                keyboardType="numeric"
                placeholderTextColor="#94A3B8"
              />
              <View style={[styles.unitBadge, { backgroundColor: isDieselSelected ? '#E0EDFF' : '#FFF3E0' }]}>
                <Text style={[styles.unitBadgeText, { color: isDieselSelected ? '#003C8F' : '#FF6F00' }]}>LITERS</Text>
              </View>
            </View>
          </View>

          {/* Tanker Truck No & Invoice No in 2-column layout */}
          <View style={styles.inputRowTwoCol}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <CustomInput
                label="Tanker / TT Truck No."
                placeholder="e.g. UP 53 BT 4567"
                value={tankerNumber}
                onChangeText={setTankerNumber}
                autoCapitalize="characters"
                leftIcon="bus-outline"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <CustomInput
                label="Invoice / Challan No."
                placeholder="e.g. IOCL-98421"
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                autoCapitalize="characters"
                leftIcon="receipt-outline"
              />
            </View>
          </View>

          {/* Supplier Oil Depot */}
          <CustomInput
            label="Supplier / Supply Depot"
            placeholder="e.g. IOCL Baitalpur Depot"
            value={supplierDepot}
            onChangeText={setSupplierDepot}
            leftIcon="business-outline"
          />

          {/* Driver Name & Driver Phone Number */}
          <View style={styles.inputRowTwoCol}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <CustomInput
                label="Driver Name"
                placeholder="e.g. Ramesh Kumar"
                value={driverName}
                onChangeText={setDriverName}
                leftIcon="person-outline"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <CustomInput
                label="Driver Phone Number"
                placeholder="e.g. 9876543210"
                value={driverPhone}
                onChangeText={setDriverPhone}
                keyboardType="phone-pad"
                leftIcon="call-outline"
              />
            </View>
          </View>

          {/* Optional Inspection: Dip & Density */}
          <View style={styles.inputRowTwoCol}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <CustomInput
                label="Dip Level (cm)"
                placeholder="e.g. 142.5"
                value={dipReading}
                onChangeText={setDipReading}
                keyboardType="numeric"
                leftIcon="analytics-outline"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <CustomInput
                label="Density @ 15°C (kg/m³)"
                placeholder="e.g. 745.0"
                value={densityReading}
                onChangeText={setDensityReading}
                keyboardType="numeric"
                leftIcon="speedometer-outline"
              />
            </View>
          </View>

          {/* Operator Name & Date */}
          <View style={styles.inputRowTwoCol}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <CustomInput
                label="Received By (Operator)"
                placeholder="e.g. Received By Name (Optional)"
                value={operatorName}
                onChangeText={setOperatorName}
                leftIcon="person-outline"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.fieldHeaderLabel}>Delivery Date</Text>
              <TouchableOpacity 
                style={styles.datePickerBtn}
                onPress={() => setShowDatePicker(true)}
              >
                <Icon name="calendar-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                <Text style={styles.datePickerBtnText}>
                  {deliveryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={deliveryDate}
              mode="date"
              display="default"
              onChange={(event, date) => {
                setShowDatePicker(false);
                if (date) setDeliveryDate(date);
              }}
            />
          )}

          {/* Remarks / Notes */}
          <CustomInput
            label="Remarks / Delivery Notes"
            placeholder="e.g. Chamber 1 & 2 fully unloaded without shortage"
            value={deliveryNotes}
            onChangeText={setDeliveryNotes}
            leftIcon="document-text-outline"
          />

          {/* Submit Button */}
          <CustomButton
            title={loading ? "Updating Tank Stock..." : `+ Unload ${isDieselSelected ? 'Diesel' : 'Petrol'} & Add Stock`}
            onPress={handleUpdateStock}
            loading={loading}
            type={isDieselSelected ? 'primary' : 'warning'}
            style={{ marginTop: 16 }}
          />
        </View>

        {/* Section 3: Live Recent Fuel Additions & Deliveries */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <View>
            <Text style={styles.sectionTitle}>Recent Tanker Deliveries</Text>
            <Text style={styles.sectionSubTitle}>Live ledger of fuel unloadings (tap trash to revert)</Text>
          </View>
        </View>

        {recentAdditions.length === 0 ? (
          <View style={styles.emptyAdditionsBox}>
            <Icon name="receipt-outline" size={40} color="#CBD5E1" />
            <Text style={styles.emptyAdditionsTitle}>No Recent Fuel Additions</Text>
            <Text style={styles.emptyAdditionsSub}>Unload your first fuel tanker using the form above to view live records.</Text>
          </View>
        ) : (
          recentAdditions.map((item) => {
            const isDiesel = item.fuelType === 'Diesel' || item.dieselAdded > 0;
            const liters = item.addedLiters || (isDiesel ? item.dieselAdded : item.petrolAdded) || 0;
            const dateStr = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : 'N/A';

            return (
              <View key={item.id} style={[styles.additionCard, { borderLeftColor: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                <View style={styles.additionCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.additionBadge, { backgroundColor: isDiesel ? '#E0EDFF' : '#FFF3E0' }]}>
                      <Icon name={isDiesel ? 'water' : 'flame'} size={14} color={isDiesel ? '#003C8F' : '#FF6F00'} style={{ marginRight: 4 }} />
                      <Text style={[styles.additionBadgeText, { color: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                        {isDiesel ? 'Diesel (HSD)' : 'Petrol (MS)'}
                      </Text>
                    </View>
                    <Text style={styles.additionTankLabel}>{item.tankId || 'Tank'}</Text>
                  </View>

                  <TouchableOpacity 
                    onPress={() => handleConfirmRevertAddition(item)}
                    style={styles.revertBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                {/* Liters Added Highlight */}
                <View style={styles.additionMainRow}>
                  <View>
                    <Text style={styles.additionLitersLabel}>UNLOADED QUANTITY</Text>
                    <Text style={[styles.additionLitersValue, { color: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                      +{parseFloat(liters).toLocaleString('en-IN')} L
                    </Text>
                  </View>
                </View>

                {/* Details Grid */}
                <View style={styles.additionDetailsGrid}>
                  {item.tankerNumber && item.tankerNumber !== 'N/A' && (
                    <View style={styles.detailItem}>
                      <Icon name="bus-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>TT: <Text style={styles.detailBold}>{item.tankerNumber}</Text></Text>
                    </View>
                  )}

                  {item.invoiceNumber && item.invoiceNumber !== 'N/A' && (
                    <View style={styles.detailItem}>
                      <Icon name="receipt-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>Inv: <Text style={styles.detailBold}>{item.invoiceNumber}</Text></Text>
                    </View>
                  )}

                  {item.driverName && item.driverName !== 'N/A' && (
                    <View style={styles.detailItem}>
                      <Icon name="person-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>Driver: <Text style={styles.detailBold}>{item.driverName}</Text></Text>
                    </View>
                  )}

                  {item.driverPhone && item.driverPhone !== 'N/A' && (
                    <View style={styles.detailItem}>
                      <Icon name="call-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>Mob: <Text style={styles.detailBold}>{item.driverPhone}</Text></Text>
                    </View>
                  )}

                  {item.supplier && (
                    <View style={styles.detailItem}>
                      <Icon name="business-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>{item.supplier}</Text>
                    </View>
                  )}
                </View>

                {/* Footer with Operator & Date */}
                <View style={styles.additionFooter}>
                  <Text style={styles.footerDateText}>{dateStr}</Text>
                  <Text style={styles.footerOperatorText}>Recv: {item.operatorName || '—'}</Text>
                </View>
              </View>
            );
          })
        )}

      </ScrollView>

      {/* Modal for Creating New Tank */}
      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Add New Storage Tank</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="close-circle-outline" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Configure a new underground storage tank (e.g. Tank 3, Tank 4).</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. TANK 3"
              value={newTankName}
              onChangeText={setNewTankName}
              autoCapitalize="characters"
              placeholderTextColor="#94A3B8"
            />

            <Text style={[styles.fieldHeaderLabel, { marginBottom: 8 }]}>Fuel Type:</Text>
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
            
            <CustomButton
              title={creatingTank ? "Creating Tank..." : "Create Tank"}
              onPress={handleAddNewTank}
              loading={creatingTank}
              type="primary"
            />
          </View>
        </View>
      </Modal>

      {/* Delete Tank Confirmation */}
      <CustomAlert
        visible={alertVisible}
        title="Delete Tank"
        message={`Are you sure you want to delete ${tankToDelete}? This cannot be undone.`}
        isDestructive={true}
        cancelText="Cancel"
        confirmText="Delete Tank"
        loading={isDeletingTank}
        onCancel={() => {
          setAlertVisible(false);
          setTankToDelete(null);
        }}
        onConfirm={async () => {
          setIsDeletingTank(true);
          try {
            await deleteDoc(doc(db, 'tanks', tankToDelete));
            Toast.show({ type: 'success', text1: 'Deleted', text2: `Tank ${tankToDelete} was removed.` });
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

      {/* Revert Fuel Addition Confirmation */}
      <CustomAlert
        visible={revertAlertVisible}
        title="Revert Fuel Delivery?"
        message={
          additionToRevert 
            ? `Do you want to revert this entry? ${additionToRevert.addedLiters || additionToRevert.petrolAdded || additionToRevert.dieselAdded} Liters will be automatically deducted from ${additionToRevert.tankId} inventory.`
            : ''
        }
        isDestructive={true}
        cancelText="Keep"
        confirmText="Revert & Deduct"
        loading={isRevertingAddition}
        onCancel={() => {
          setRevertAlertVisible(false);
          setAdditionToRevert(null);
        }}
        onConfirm={executeRevertAddition}
      />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  headerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 14, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
  headerIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0EDFF', alignItems: 'center', justifyContent: 'center' },
  mainTitle: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  mainSubTitle: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 16 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  sectionSubTitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  newTankPillBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE' },
  newTankPillBtnText: { fontSize: 12, fontWeight: 'bold', color: '#003C8F' },

  tanksGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  tankCard: { width: '48.5%', backgroundColor: '#fff', padding: 14, borderRadius: 14, borderWidth: 2, borderColor: '#E2E8F0', elevation: 2, marginBottom: 12 },
  tankCardSelected: { shadowColor: '#003C8F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  tankCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  fuelPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  fuelPillText: { fontSize: 11, fontWeight: 'bold' },
  tankCardName: { fontSize: 15, fontWeight: '900', color: '#1E293B' },

  stockValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6, marginBottom: 8 },
  stockValueNumber: { fontSize: 20, fontWeight: '900' },
  stockValueUnit: { fontSize: 11, color: '#64748B', fontWeight: 'bold' },

  tankProgressBarTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  tankProgressBarFill: { height: '100%', borderRadius: 3 },
  tankProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tankProgressText: { fontSize: 10, color: '#94A3B8', fontWeight: 'bold' },

  selectedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 3, borderRadius: 6 },
  selectedBannerText: { fontSize: 10, color: '#fff', fontWeight: 'bold' },

  formContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 18, elevation: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  formHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 12, marginBottom: 16 },
  formHeaderTitle: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
  formHeaderSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  fuelBadgeLarge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  primaryInputBox: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 14 },
  inputSectionLabel: { fontSize: 11, fontWeight: '900', color: '#475569', marginBottom: 6, letterSpacing: 0.5 },
  quantityRow: { flexDirection: 'row', alignItems: 'center' },
  bigQuantityInput: { flex: 1, height: 48, backgroundColor: '#fff', borderRadius: 10, borderWidth: 2, paddingHorizontal: 14, fontSize: 22, fontWeight: '900', color: '#0F172A' },
  unitBadge: { height: 48, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  unitBadgeText: { fontSize: 13, fontWeight: '900' },

  inputRowTwoCol: { flexDirection: 'row', alignItems: 'center' },
  fieldHeaderLabel: { fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 6, marginLeft: 2 },
  datePickerBtn: { height: 48, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 12 },
  datePickerBtnText: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },

  emptyAdditionsBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyAdditionsTitle: { fontSize: 15, fontWeight: 'bold', color: '#64748B', marginTop: 10 },
  emptyAdditionsSub: { fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 16 },

  additionCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, elevation: 1, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 5, marginBottom: 12 },
  additionCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  additionBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  additionBadgeText: { fontSize: 11, fontWeight: 'bold' },
  additionTankLabel: { fontSize: 13, fontWeight: '900', color: '#334155', marginLeft: 8 },
  revertBtn: { padding: 4 },

  additionMainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: 8, marginBottom: 8 },
  additionLitersLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  additionLitersValue: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  additionAmountValue: { fontSize: 15, fontWeight: '900', color: '#0F172A', marginTop: 2 },

  additionDetailsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  detailItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 4 },
  detailText: { fontSize: 12, color: '#64748B' },
  detailBold: { fontWeight: 'bold', color: '#1E293B' },

  additionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F8FAFC' },
  footerDateText: { fontSize: 11, color: '#94A3B8' },
  footerOperatorText: { fontSize: 11, color: '#64748B', fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { backgroundColor: '#fff', width: '100%', borderRadius: 16, padding: 20, elevation: 5 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#003C8F' },
  modalSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 16 },
  modalInput: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  fuelTypeSelectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1' }
});
