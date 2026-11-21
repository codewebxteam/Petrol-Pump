import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
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
  collection
} from 'firebase/firestore';
import { syncAndConsolidateTanks, updateTankStockManual } from '../../../services/dbServices';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { db } from '../../../services/firebase';
import CustomAlert from '../../../components/CustomAlert';
import CustomButton from '../../../components/CustomButton';
import ScrollableModal from '../../../components/ScrollableModal';

export default function AddStockScreen() {
  const [tanks, setTanks] = useState([]);
  const [recentAdditions, setRecentAdditions] = useState([]);
  const [selectedTankId, setSelectedTankId] = useState('');

  // Stock Edit Modal State (Admin Stock / Dip Adjustment)
  const [showStockEditModal, setShowStockEditModal] = useState(false);
  const [editTank1Liters, setEditTank1Liters] = useState('');
  const [editTank1Dip, setEditTank1Dip] = useState('');
  const [editTank2Liters, setEditTank2Liters] = useState('');
  const [editTank2Dip, setEditTank2Dip] = useState('');
  const [savingStockEdit, setSavingStockEdit] = useState(false);

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

  // 1. Subscribe to Tanks Collection & Onload Deliveries
  useEffect(() => {
    syncAndConsolidateTanks().catch(() => null);

    // Subscribe to Tanks
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

    // 2. Subscribe to Recent Fuel Deliveries (Only from tank_logs with Liters & Dip in CM)
    const unsubLogs = onSnapshot(collection(db, 'tank_logs'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data.type === 'addition') {
          const p = Number(data.petrolAdded || data.petrolLiters || 0);
          const dL = Number(data.dieselAdded || data.dieselLiters || 0);
          const tot = Number(data.totalAdded || data.addedLiters || (p + dL) || 0);
          const hasDip = Boolean(data.petrolDip || data.dieselDip);

          // Keep only deliveries that have Liters AND Dip (CM)
          if ((p > 0 || dL > 0 || tot > 0) && hasDip) {
            list.push({
              id: d.id,
              ...data,
              petrolAdded: p,
              dieselAdded: dL,
              totalAdded: tot,
              source: data.source || 'onload'
            });
          }
        }
      });

      list.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      setRecentAdditions(list.slice(0, 30));
    }, (error) => {
      console.warn("Firestore tank_logs error:", error.message);
    });

    return () => {
      unsubTanks();
      unsubLogs();
    };
  }, []);

  // Canonical default tanks (Strictly deduplicates so Tank-1 and Tank 1 never create 4 tanks)
  const effectiveTanks = useMemo(() => {
    const map = new Map();
    (tanks || []).forEach(t => {
      const isD = t.id === 'Tank-2' || t.fuelType === 'Diesel' || String(t.id).includes('2');
      const canonicalKey = isD ? 'Tank-2' : (t.id === 'Tank-1' || String(t.id).includes('1') ? 'Tank-1' : t.id);
      if (!map.has(canonicalKey) || t.id === 'Tank-1' || t.id === 'Tank-2') {
        map.set(canonicalKey, {
          ...t,
          id: canonicalKey,
          tankId: isD ? 'Tank 2 (Diesel - HSD)' : 'Tank 1 (Petrol - MS)',
          name: isD ? 'Tank 2 (Diesel)' : 'Tank 1 (Petrol)',
          fuelType: isD ? 'Diesel' : 'Petrol'
        });
      }
    });

    const uniqueList = Array.from(map.values());
    if (uniqueList.length > 0) return uniqueList;
    return [
      { id: 'Tank-1', tankId: 'Tank 1 (Petrol - MS)', name: 'Tank 1 (Petrol)', fuelType: 'Petrol', petrolStock: 0, stock: 0, dieselStock: 0 },
      { id: 'Tank-2', tankId: 'Tank 2 (Diesel - HSD)', name: 'Tank 2 (Diesel)', fuelType: 'Diesel', petrolStock: 0, dieselStock: 0, stock: 0 }
    ];
  }, [tanks]);

  const currentTankId = selectedTankId || effectiveTanks[0]?.id || 'Tank-1';

  // Open Admin Stock Edit Modal
  const handleOpenStockEdit = () => {
    const t1 = effectiveTanks.find(t => t.id === 'Tank-1' || t.fuelType === 'Petrol' || String(t.id).includes('1'));
    const t2 = effectiveTanks.find(t => t.id === 'Tank-2' || t.fuelType === 'Diesel' || String(t.id).includes('2'));
    const s1 = parseFloat(t1?.petrolStock !== undefined ? t1.petrolStock : (t1?.stock || 0));
    const s2 = parseFloat(t2?.dieselStock !== undefined ? t2.dieselStock : (t2?.stock || 0));
    setEditTank1Liters(s1 ? s1.toFixed(0) : '0');
    setEditTank1Dip(t1?.dipReading ? String(t1.dipReading).replace(/[^0-9.]/g, '') : '');
    setEditTank2Liters(s2 ? s2.toFixed(0) : '0');
    setEditTank2Dip(t2?.dipReading ? String(t2.dipReading).replace(/[^0-9.]/g, '') : '');
    setShowStockEditModal(true);
  };

  // Save Admin Stock Edit
  const handleSaveStockEdit = async () => {
    const pVal = parseFloat(editTank1Liters);
    const dVal = parseFloat(editTank2Liters);

    if (isNaN(pVal) || pVal < 0 || isNaN(dVal) || dVal < 0) {
      Toast.show({ 
        type: 'error', 
        text1: 'त्रुटि', 
        text2: 'कृपया दोनों टैंकों का वैध स्टॉक (Liters) दर्ज करें।' 
      });
      return;
    }

    setSavingStockEdit(true);
    try {
      await updateTankStockManual({
        tankId: 'Tank-1',
        liters: pVal,
        dipReading: editTank1Dip,
        reason: 'Master Config Stock Edit',
        adjustedBy: 'Owner / Admin'
      });

      await updateTankStockManual({
        tankId: 'Tank-2',
        liters: dVal,
        dipReading: editTank2Dip,
        reason: 'Master Config Stock Edit',
        adjustedBy: 'Owner / Admin'
      });

      Toast.show({ 
        type: 'success', 
        text1: 'टैंक स्टॉक अपडेट हुआ ✅', 
        text2: `Tank 1: ${pVal}L (${editTank1Dip || '-'} cm) | Tank 2: ${dVal}L (${editTank2Dip || '-'} cm)` 
      });
      setShowStockEditModal(false);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    } finally {
      setSavingStockEdit(false);
    }
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

  // Revert / Delete an accidental Fuel Addition
  const handleConfirmRevertAddition = (item) => {
    setAdditionToRevert(item);
    setRevertAlertVisible(true);
  };

  const executeRevertAddition = async () => {
    if (!additionToRevert) return;
    setIsRevertingAddition(true);

    try {
      const item = additionToRevert;
      const pL = Number(item.petrolAdded || item.petrolLiters || 0);
      const dL = Number(item.dieselAdded || item.dieselLiters || 0);
      const tot = Number(item.totalAdded || item.addedLiters || (pL + dL) || 0);

      // Rollback Petrol from Tank-1
      if (pL > 0) {
        await setDoc(doc(db, 'tanks', 'Tank-1'), {
          id: 'Tank-1',
          name: 'Tank 1 (Petrol)',
          fuelType: 'Petrol',
          petrolStock: increment(-pL),
          stock: increment(-pL),
          lastUpdated: new Date()
        }, { merge: true }).catch(() => null);
        await deleteDoc(doc(db, 'tanks', 'Tank 1')).catch(() => null);
      }

      // Rollback Diesel from Tank-2
      if (dL > 0) {
        await setDoc(doc(db, 'tanks', 'Tank-2'), {
          id: 'Tank-2',
          name: 'Tank 2 (Diesel)',
          fuelType: 'Diesel',
          dieselStock: increment(-dL),
          stock: increment(-dL),
          lastUpdated: new Date()
        }, { merge: true }).catch(() => null);
        await deleteDoc(doc(db, 'tanks', 'Tank 2')).catch(() => null);
      }

      // If single tank
      if (pL === 0 && dL === 0 && tot > 0 && item.tankId) {
        const isD = item.fuelType === 'Diesel';
        await setDoc(doc(db, 'tanks', item.tankId), {
          stock: increment(-tot),
          [isD ? 'dieselStock' : 'petrolStock']: increment(-tot),
          lastUpdated: new Date()
        }, { merge: true }).catch(() => null);
      }

      // Delete log
      await deleteDoc(doc(db, 'tank_logs', item.id)).catch(() => null);
      await deleteDoc(doc(db, 'sample_labels', item.id)).catch(() => null);

      Toast.show({
        type: 'success',
        text1: 'डिलीवरी हटाई गई',
        text2: 'स्टॉक रोलबैक कर दिया गया है।'
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

  const confirmDeleteTank = async () => {
    if (!tankToDelete) return;
    setIsDeletingTank(true);
    try {
      await deleteDoc(doc(db, 'tanks', tankToDelete));
      Toast.show({ type: 'success', text1: 'Tank Deleted', text2: 'The storage tank has been removed.' });
      if (selectedTankId === tankToDelete) {
        setSelectedTankId(effectiveTanks.find(t => t.id !== tankToDelete)?.id || '');
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setIsDeletingTank(false);
      setAlertVisible(false);
      setTankToDelete(null);
    }
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
            <Text style={styles.headerTitle}>Storage Tanks & Fuel Inventory</Text>
            <Text style={styles.headerSub}>Manage underground tanks, view stock levels and Onload deliveries</Text>
          </View>
        </View>

        {/* Section 1: Interactive Tank Level Cards */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Tank Inventory Status</Text>
          <TouchableOpacity style={styles.newTankPillBtn} onPress={() => setModalVisible(true)}>
            <Icon name="add-circle" size={15} color="#003C8F" style={{ marginRight: 4 }} />
            <Text style={styles.newTankPillBtnText}>Add Tank</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tanksGrid}>
          {effectiveTanks.map((tank) => {
            const isDiesel = tank.id === 'Tank-2' || tank.fuelType === 'Diesel' || String(tank.tankId || tank.id).toLowerCase().includes('diesel') || String(tank.id).includes('2');
            const isSelected = tank.id === currentTankId;
            const stockVal = parseFloat(
              (isDiesel ? tank.dieselStock : tank.petrolStock) !== undefined 
                ? (isDiesel ? tank.dieselStock : tank.petrolStock) 
                : (tank.stock !== undefined ? tank.stock : 0)
            );
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
                  
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {/* Direct Stock Edit Pencil Button on Card */}
                    <TouchableOpacity 
                      onPress={handleOpenStockEdit}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.cardMiniEditBtn}
                    >
                      <Icon name="create-outline" size={15} color="#003C8F" />
                    </TouchableOpacity>

                    {tank.id !== 'Tank-1' && tank.id !== 'Tank-2' && (
                      <TouchableOpacity onPress={() => handleDeleteTank(tank.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Icon name="trash-outline" size={15} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
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

                {tank.dipReading ? (
                  <Text style={styles.cardDipText}>📏 Dip: {tank.dipReading}</Text>
                ) : null}

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
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 2: Live Recent Fuel Additions & Deliveries (From Onload) */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <View>
            <Text style={styles.sectionTitle}>Recent Tanker Deliveries</Text>
            <Text style={styles.sectionSubTitle}>Onload द्वारा अनलोड हुए ईंधन की लाइव हिस्ट्री (Delivery History)</Text>
          </View>
        </View>

        {recentAdditions.length === 0 ? (
          <View style={styles.emptyAdditionsBox}>
            <Icon name="receipt-outline" size={40} color="#CBD5E1" />
            <Text style={styles.emptyAdditionsTitle}>No Recent Fuel Additions</Text>
            <Text style={styles.emptyAdditionsSub}>Onload से लॉरी अनलोड होते ही उसका पूरा विवरण यहाँ दिखाई देगा।</Text>
          </View>
        ) : (
          recentAdditions.map((item) => {
            const pL = Number(item.petrolAdded || item.petrolLiters || 0);
            const dL = Number(item.dieselAdded || item.dieselLiters || 0);
            const totalL = Number(item.totalAdded) || (pL + dL) || Number(item.addedLiters) || 0;
            const dateStr = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : (item.sampleDate ? `${item.sampleDate} ${item.sampleTime || ''}` : 'N/A');

            return (
              <View 
                key={item.id} 
                style={[
                  styles.additionCard, 
                  { borderLeftColor: (pL > 0 && dL > 0) ? '#0F766E' : (dL > 0 ? '#003C8F' : '#FF6F00') }
                ]}
              >
                <View style={styles.additionCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    {pL > 0 && (
                      <View style={[styles.additionBadge, { backgroundColor: '#FFF3E0' }]}>
                        <Icon name="flame" size={13} color="#FF6F00" style={{ marginRight: 3 }} />
                        <Text style={[styles.additionBadgeText, { color: '#FF6F00' }]}>MS (Petrol)</Text>
                      </View>
                    )}
                    {dL > 0 && (
                      <View style={[styles.additionBadge, { backgroundColor: '#E0EDFF' }]}>
                        <Icon name="water" size={13} color="#003C8F" style={{ marginRight: 3 }} />
                        <Text style={[styles.additionBadgeText, { color: '#003C8F' }]}>HSD (Diesel)</Text>
                      </View>
                    )}
                    {pL === 0 && dL === 0 && (
                      <View style={[styles.additionBadge, { backgroundColor: '#F1F5F9' }]}>
                        <Text style={[styles.additionBadgeText, { color: '#475569' }]}>Fuel Addition</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity 
                    onPress={() => handleConfirmRevertAddition(item)}
                    style={styles.revertBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="trash-outline" size={17} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                {/* Liters Added Highlight */}
                <View style={styles.additionMainRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.additionLitersLabel}>DELIVERY QUANTITY (अनलोड मात्रा)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
                      {pL > 0 && (
                        <Text style={[styles.additionLitersValue, { color: '#FF6F00', fontSize: 16 }]}>
                          MS: +{pL.toLocaleString('en-IN')} L{item.petrolDip ? ` (${String(item.petrolDip).includes('cm') ? String(item.petrolDip).trim() : `${String(item.petrolDip).trim()} cm`})` : ''}
                        </Text>
                      )}
                      {dL > 0 && (
                        <Text style={[styles.additionLitersValue, { color: '#003C8F', fontSize: 16 }]}>
                          HSD: +{dL.toLocaleString('en-IN')} L{item.dieselDip ? ` (${String(item.dieselDip).includes('cm') ? String(item.dieselDip).trim() : `${String(item.dieselDip).trim()} cm`})` : ''}
                        </Text>
                      )}
                      {pL === 0 && dL === 0 && totalL > 0 && (
                        <Text style={[styles.additionLitersValue, { color: '#003C8F', fontSize: 16 }]}>
                          +{totalL.toLocaleString('en-IN')} L
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Details Grid */}
                <View style={styles.additionDetailsGrid}>
                  {(item.tankerNumber || item.tankLorryNo) && (item.tankerNumber !== 'N/A' && item.tankLorryNo !== 'N/A') ? (
                    <View style={styles.detailItem}>
                      <Icon name="bus-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>TT: <Text style={styles.detailBold}>{item.tankerNumber || item.tankLorryNo}</Text></Text>
                    </View>
                  ) : null}

                  {(item.invoiceNumber || item.invoiceNo) && (item.invoiceNumber !== 'N/A' && item.invoiceNo !== 'N/A') ? (
                    <View style={styles.detailItem}>
                      <Icon name="receipt-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>Inv: <Text style={styles.detailBold}>{item.invoiceNumber || item.invoiceNo}</Text></Text>
                    </View>
                  ) : null}

                  {item.driverName && item.driverName !== 'N/A' ? (
                    <View style={styles.detailItem}>
                      <Icon name="person-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>Driver: <Text style={styles.detailBold}>{item.driverName}</Text></Text>
                    </View>
                  ) : null}

                  {(item.supplier || item.supplyLocation) ? (
                    <View style={styles.detailItem}>
                      <Icon name="business-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                      <Text style={styles.detailText}>{item.supplyLocation || item.supplier}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Footer with Source & Date */}
                <View style={styles.additionFooter}>
                  <Text style={styles.footerDateText}>{dateStr}</Text>
                  <Text style={styles.footerOperatorText}>Source: Onload Decanting</Text>
                </View>
              </View>
            );
          })
        )}

      </ScrollView>

      {/* Modal for Creating New Tank */}
      <ScrollableModal visible={isModalVisible} onRequestClose={() => setModalVisible(false)}>
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
        />

        <Text style={styles.modalLabel}>Select Fuel Type</Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={newTankFuelType}
            onValueChange={(val) => setNewTankFuelType(val)}
          >
            <Picker.Item label="Petrol (MS)" value="Petrol" />
            <Picker.Item label="Diesel (HSD)" value="Diesel" />
          </Picker>
        </View>

        <CustomButton
          title={creatingTank ? "Creating Tank..." : "Create Tank"}
          onPress={handleAddNewTank}
          loading={creatingTank}
          style={{ marginTop: 12 }}
        />
      </ScrollableModal>

      {/* Modal for Direct Stock Edit / Dip Adjustment */}
      <ScrollableModal visible={showStockEditModal} onRequestClose={() => setShowStockEditModal(false)}>
        <View style={styles.stockModalHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.stockModalIconCircle}>
              <Icon name="create" size={20} color="#003C8F" />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.stockModalTitle}>टैंक स्टॉक / Dip सुधार</Text>
              <Text style={styles.stockModalSubtitle}>Live Stock & Dip Reading Edit</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowStockEditModal(false)}>
            <Icon name="close-circle" size={24} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Tank 1 (Petrol) Edit */}
        <View style={styles.stockModalTankSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Icon name="flame" size={16} color="#E65100" style={{ marginRight: 6 }} />
            <Text style={styles.stockModalTankTitle}>Tank 1 (Petrol - MS)</Text>
          </View>
          <View style={styles.stockModalRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.stockModalFieldLabel}>स्टॉक (Liters) *</Text>
              <TextInput
                style={styles.stockModalInput}
                value={editTank1Liters}
                onChangeText={setEditTank1Liters}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.stockModalFieldLabel}>Dip (cm)</Text>
              <TextInput
                style={styles.stockModalInput}
                value={editTank1Dip}
                onChangeText={setEditTank1Dip}
                keyboardType="numeric"
                placeholder="उदा. 142.5"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>
        </View>

        {/* Tank 2 (Diesel) Edit */}
        <View style={[styles.stockModalTankSection, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Icon name="water" size={16} color="#003C8F" style={{ marginRight: 6 }} />
            <Text style={[styles.stockModalTankTitle, { color: '#003C8F' }]}>Tank 2 (Diesel - HSD)</Text>
          </View>
          <View style={styles.stockModalRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.stockModalFieldLabel}>स्टॉक (Liters) *</Text>
              <TextInput
                style={styles.stockModalInput}
                value={editTank2Liters}
                onChangeText={setEditTank2Liters}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94A3B8"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.stockModalFieldLabel}>Dip (cm)</Text>
              <TextInput
                style={styles.stockModalInput}
                value={editTank2Dip}
                onChangeText={setEditTank2Dip}
                keyboardType="numeric"
                placeholder="उदा. 158.0"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.stockModalBtnRow}>
          <TouchableOpacity 
            style={styles.stockModalCancelBtn} 
            onPress={() => setShowStockEditModal(false)}
            disabled={savingStockEdit}
          >
            <Text style={styles.stockModalCancelBtnText}>रद्द करें</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.stockModalSaveBtn} 
            onPress={handleSaveStockEdit}
            disabled={savingStockEdit}
          >
            {savingStockEdit ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.stockModalSaveBtnText}>सुधार सेव करें (Save)</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollableModal>

      {/* Delete Confirmation Alert */}
      <CustomAlert
        visible={alertVisible}
        title="Delete Tank"
        message={`Are you sure you want to permanently delete "${tankToDelete}"? This cannot be undone.`}
        confirmText={isDeletingTank ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDeleteTank}
        onCancel={() => setAlertVisible(false)}
      />

      {/* Revert Fuel Addition Confirmation Alert */}
      <CustomAlert
        visible={revertAlertVisible}
        title="Revert Delivery"
        message={additionToRevert ? `Are you sure you want to delete this delivery entry and deduct stock from the tank?` : ''}
        confirmText={isRevertingAddition ? "Reverting..." : "Yes, Revert"}
        cancelText="Cancel"
        type="danger"
        onConfirm={executeRevertAddition}
        onCancel={() => setRevertAlertVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0EDFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#003C8F'
  },
  headerSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B'
  },
  sectionSubTitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  newTankPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0EDFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  newTankPillBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F'
  },
  tanksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14
  },
  tankCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  tankCardSelected: {
    borderWidth: 2
  },
  tankCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  fuelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  fuelPillText: {
    fontSize: 11,
    fontWeight: '800'
  },
  cardMiniEditBtn: {
    padding: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  tankCardName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6
  },
  stockValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4
  },
  stockValueNumber: {
    fontSize: 22,
    fontWeight: '900'
  },
  stockValueUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B'
  },
  cardDipText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '700',
    marginBottom: 6
  },
  tankProgressBarTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4
  },
  tankProgressBarFill: {
    height: '100%',
    borderRadius: 3
  },
  tankProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4
  },
  tankProgressText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B'
  },

  // Recent Tanker Deliveries Section
  emptyAdditionsBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  emptyAdditionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8
  },
  emptyAdditionsSub: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4
  },
  additionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  additionCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  additionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  additionBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  revertBtn: {
    padding: 4
  },
  additionMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  additionLitersLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase'
  },
  additionLitersValue: {
    fontSize: 15,
    fontWeight: '900'
  },
  additionDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  detailText: {
    fontSize: 11.5,
    color: '#475569'
  },
  detailBold: {
    fontWeight: '700',
    color: '#1E293B'
  },
  additionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: '#E2E8F0'
  },
  footerDateText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600'
  },
  footerOperatorText: {
    fontSize: 10.5,
    color: '#003C8F',
    fontWeight: '700'
  },

  // Modal Styles (Add Tank)
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#fff',
    marginBottom: 12
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4
  },
  pickerBox: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 16
  },

  // Stock Edit Modal Styles
  stockModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
    marginBottom: 14
  },
  stockModalIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0EDFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stockModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A'
  },
  stockModalSubtitle: {
    fontSize: 10.5,
    color: '#64748B'
  },
  stockModalTankSection: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12
  },
  stockModalTankTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C2410C'
  },
  stockModalRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  stockModalFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4
  },
  stockModalInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700'
  },
  stockModalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0'
  },
  stockModalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  stockModalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569'
  },
  stockModalSaveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#003C8F',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stockModalSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff'
  }
});
