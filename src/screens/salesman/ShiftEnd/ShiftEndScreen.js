import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, SafeAreaView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { submitShiftReport } from '../../../services/dbServices';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import Icon from '@expo/vector-icons/Ionicons';

export default function ShiftEndScreen({ navigation }) {
  const [salesmen, setSalesmen] = useState([]);
  const [selectedSalesman, setSelectedSalesman] = useState('');

  const [activeShift, setActiveShift] = useState(null);
  const [nozzleData, setNozzleData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [closingMeter, setClosingMeter] = useState('');
  const [testingQty, setTestingQty] = useState('');
  
  const [online, setOnline] = useState('');
  
  const [onlineBreakdownVisible, setOnlineBreakdownVisible] = useState(false);
  const [onlineBreakdownData, setOnlineBreakdownData] = useState({
    phonePe: '', paytm: '', bharatPe: ''
  });
  const [isOnlineMatched, setIsOnlineMatched] = useState(false);
  const [onlineBreakdownTotal, setOnlineBreakdownTotal] = useState(0);

  const calculateOnlineBreakdownTotal = (data = onlineBreakdownData) => {
    return (parseFloat(data.phonePe) || 0) + (parseFloat(data.paytm) || 0) + (parseFloat(data.bharatPe) || 0);
  };

  const handleOnlineBreakdownChange = (key, value) => {
    const val = sanitizeNumber(value);
    const newData = { ...onlineBreakdownData, [key]: val };
    setOnlineBreakdownData(newData);
    setOnlineBreakdownTotal(calculateOnlineBreakdownTotal(newData));
  };
  
  const [udhariBreakdownVisible, setUdhariBreakdownVisible] = useState(false);
  const [udhariBreakdownData, setUdhariBreakdownData] = useState([{ id: Date.now().toString(), name: '', amount: '' }]);
  const [isUdhariMatched, setIsUdhariMatched] = useState(false);
  
  const calculateUdhariBreakdownTotal = (data = udhariBreakdownData) => {
    return data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleUdhariBreakdownChange = (id, field, value) => {
    const newData = udhariBreakdownData.map(item => {
      if (item.id === id) {
        return { ...item, [field]: field === 'amount' ? sanitizeNumber(value) : value };
      }
      return item;
    });
    setUdhariBreakdownData(newData);
  };

  const addUdhariEntry = () => {
    setUdhariBreakdownData([...udhariBreakdownData, { id: Date.now().toString() + Math.random(), name: '', amount: '' }]);
  };

  const removeUdhariEntry = (id) => {
    setUdhariBreakdownData(udhariBreakdownData.filter(item => item.id !== id));
  };

  const [expenseBreakdownVisible, setExpenseBreakdownVisible] = useState(false);
  const [expenseBreakdownData, setExpenseBreakdownData] = useState([{ id: Date.now().toString(), reason: '', amount: '' }]);
  const [isExpenseMatched, setIsExpenseMatched] = useState(false);
  
  const calculateExpenseBreakdownTotal = (data = expenseBreakdownData) => {
    return data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleExpenseBreakdownChange = (id, field, value) => {
    const newData = expenseBreakdownData.map(item => {
      if (item.id === id) {
        return { ...item, [field]: field === 'amount' ? sanitizeNumber(value) : value };
      }
      return item;
    });
    setExpenseBreakdownData(newData);
  };

  const addExpenseEntry = () => {
    setExpenseBreakdownData([...expenseBreakdownData, { id: Date.now().toString() + Math.random(), reason: '', amount: '' }]);
  };

  const removeExpenseEntry = (id) => {
    setExpenseBreakdownData(expenseBreakdownData.filter(item => item.id !== id));
  };

  const [cash, setCash] = useState('');
  const [udhari, setUdhari] = useState('');
  const [expense, setExpense] = useState('');
  
  // Rate Input State
  const [fuelRate, setFuelRate] = useState('');

  // Cash Breakdown State
  const [cashBreakdownVisible, setCashBreakdownVisible] = useState(false);
  const [breakdownData, setBreakdownData] = useState({
    notes2000: '', notes500: '', notes200: '', notes100: '', notes50: '', notes20: '', notes10: '',
    coins20: '', coins10: '', coins5: '', coins2: '', coins1: ''
  });
  const [isCashMatched, setIsCashMatched] = useState(false);
  const [breakdownTotal, setBreakdownTotal] = useState(0);

  const calculateBreakdownTotal = (data = breakdownData) => {
    let total = 0;
    total += (parseInt(data.notes2000) || 0) * 2000;
    total += (parseInt(data.notes500) || 0) * 500;
    total += (parseInt(data.notes200) || 0) * 200;
    total += (parseInt(data.notes100) || 0) * 100;
    total += (parseInt(data.notes50) || 0) * 50;
    total += (parseInt(data.notes20) || 0) * 20;
    total += (parseInt(data.notes10) || 0) * 10;
    total += (parseInt(data.coins20) || 0) * 20;
    total += (parseInt(data.coins10) || 0) * 10;
    total += (parseInt(data.coins5) || 0) * 5;
    total += (parseInt(data.coins2) || 0) * 2;
    total += (parseInt(data.coins1) || 0) * 1;
    return total;
  };

  const handleBreakdownChange = (key, value) => {
    const val = value.replace(/[^0-9]/g, '');
    const newData = { ...breakdownData, [key]: val };
    setBreakdownData(newData);
    setBreakdownTotal(calculateBreakdownTotal(newData));
  };

  // Fetch Salesmen on Mount
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubSalesmen = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setSalesmen(list);
    });
    return unsubSalesmen;
  }, []);

  // Fetch Active Shift when Salesman is selected
  useEffect(() => {
    if (!selectedSalesman) {
      setActiveShift(null);
      setNozzleData(null);
      return;
    }

    const fetchActiveShift = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'shifts'), 
          where('salesmanId', '==', selectedSalesman),
          where('status', '==', 'active')
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const shiftDoc = querySnapshot.docs[0];
          setActiveShift({ id: shiftDoc.id, ...shiftDoc.data() });
          
          const nzDoc = await getDoc(doc(db, 'nozzles', shiftDoc.data().nozzleId));
          if (nzDoc.exists()) {
            const nzData = nzDoc.data();
            if (nzData.machineId) {
              const machineDoc = await getDoc(doc(db, 'machines', nzData.machineId));
              if (machineDoc.exists()) {
                setNozzleData({ ...nzData, tankId: machineDoc.data().tankId });
              } else {
                setNozzleData(nzData);
              }
            } else {
              setNozzleData(nzData);
            }
            if (nzData.fuelRate) {
              setFuelRate(nzData.fuelRate.toString());
            }
          }
        } else {
          setActiveShift(null);
          setNozzleData(null);
        }
      } catch (err) {
        console.error("Error fetching shift:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchActiveShift();
  }, [selectedSalesman]);

  // Derived Calculations
  const oMeter = activeShift ? activeShift.openingMeterReading : 0;
  const cMeter = parseFloat(closingMeter) || oMeter;
  const testQty = parseFloat(testingQty) || 0;
  
  const grossLiters = Math.max(0, cMeter - oMeter);
  const netSoldLiters = Math.max(0, grossLiters - testQty);
  
  const currentRate = parseFloat(fuelRate) || 0;
  const expectedTotalAmount = netSoldLiters * currentRate;
  
  const cashAmt = parseFloat(cash) || 0;
  const onlineAmt = parseFloat(online) || 0;
  const udhariAmt = parseFloat(udhari) || 0;
  const expenseAmt = parseFloat(expense) || 0;
  
  const totalPayment = cashAmt + onlineAmt;
  const totalCollection = totalPayment + udhariAmt + expenseAmt;
  const shortageOrExcess = totalCollection - expectedTotalAmount;
  const isShortage = shortageOrExcess < 0;

  const handleSubmitReport = async () => {
    if (!closingMeter) {
      Alert.alert('Error', 'Closing Meter Reading is required.');
      return;
    }

    if (!fuelRate) {
      Alert.alert('Error', 'Fuel Rate is required to calculate expected amount.');
      return;
    }

    if (cMeter < oMeter) {
      Alert.alert('Error', 'Closing meter cannot be less than opening meter.');
      return;
    }

    const cashAmt = parseFloat(cash) || 0;
    if (cashAmt > 0 && !isCashMatched) {
      Alert.alert('Error', 'Please complete the cash breakdown to match the entered cash amount.');
      return;
    }

    const onlineAmt = parseFloat(online) || 0;
    if (onlineAmt > 0 && !isOnlineMatched) {
      Alert.alert('Error', 'Please complete the online breakdown to match the entered online amount.');
      return;
    }

    const udhariAmt = parseFloat(udhari) || 0;
    if (udhariAmt > 0 && !isUdhariMatched) {
      Alert.alert('Error', 'Please complete the Udhari breakdown to match the entered Udhari amount.');
      return;
    }

    const expenseAmt = parseFloat(expense) || 0;
    if (expenseAmt > 0 && !isExpenseMatched) {
      Alert.alert('Error', 'Please complete the Expense breakdown to match the entered Expense amount.');
      return;
    }

    setSubmitting(true);
    try {
      await submitShiftReport({
        shiftId: activeShift.id,
        salesmanId: selectedSalesman,
        nozzleId: activeShift.nozzleId,
        tankId: nozzleData?.tankId || 'Unknown',
        fuelType: nozzleData?.fuelType || 'Petrol',
        openingMeterReading: oMeter,
        closingMeterReading: cMeter,
        totalQuantitySold: netSoldLiters,
        cashAmount: cashAmt,
        phonePeAmount: onlineAmt > 0 ? (parseFloat(onlineBreakdownData.phonePe) || 0) : 0,
        paytmAmount: onlineAmt > 0 ? (parseFloat(onlineBreakdownData.paytm) || 0) : 0,
        bharatPeAmount: onlineAmt > 0 ? (parseFloat(onlineBreakdownData.bharatPe) || 0) : 0,
        udhariAmount: udhariAmt,
        expenses: expenseAmt,
        testingQuantity: testQty,
        totalPayment,
        fuelRate: currentRate,
        expectedTotalAmount,
        shortageOrExcess,
        shiftStartTime: activeShift.startTime,
        isSettled: false,
        cashBreakdown: cashAmt > 0 ? breakdownData : null,
        udhariBreakdown: udhariAmt > 0 ? udhariBreakdownData : null,
        expenseBreakdown: expenseAmt > 0 ? expenseBreakdownData : null
      });

      Alert.alert('Success', `Shift Ended! ${netSoldLiters.toFixed(2)} Liters sold.`);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sanitizeNumber = (val) => val.replace(/[^0-9.]/g, '');

  const renderBreakdownInput = (key, label) => (
    <View style={styles.breakdownInputWrapper} key={key}>
      <Text style={styles.breakdownInputLabel}>{label}</Text>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
         <Text style={{marginRight: 5, color: '#555'}}>x</Text>
         <CustomInput 
           keyboardType="numeric" 
           value={breakdownData[key]} 
           onChangeText={(t) => handleBreakdownChange(key, t)} 
           placeholder="0" 
           style={{marginBottom: 0, flex: 1}} 
           inputStyle={{padding: 8, height: 40}}
         />
      </View>
    </View>
  );

  const renderOnlineBreakdownInput = (key, label, icon) => (
    <View style={{marginBottom: 10}} key={key}>
      <CustomInput 
        label={label}
        keyboardType="numeric" 
        value={onlineBreakdownData[key]} 
        onChangeText={(t) => handleOnlineBreakdownChange(key, t)} 
        placeholder="0.00" 
        leftIcon={icon || "phone-portrait-outline"}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        
        <View style={styles.header}>
          <Icon name="stop-circle" size={32} color="#E53935" />
          <Text style={styles.title}>End Shift</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>Select Staff / Salesman *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedSalesman}
              onValueChange={(val) => setSelectedSalesman(val)}
              style={styles.picker}
            >
              <Picker.Item label="Select Staff..." value="" color="#888" />
              {salesmen.map(s => (
                <Picker.Item key={s.id} label={s.name} value={s.id} />
              ))}
            </Picker>
          </View>
        </View>

        {loading && <View style={styles.center}><ActivityIndicator size="large" color="#FF6F00" /></View>}

        {!loading && selectedSalesman && !activeShift && (
          <View style={styles.center}>
            <Icon name="information-circle-outline" size={60} color="#9CA3AF" style={{marginBottom: 10}} />
            <Text style={styles.noShiftText}>No active shift found.</Text>
            <Text style={{color: '#6B7280', marginTop: 10}}>This staff does not have an active shift running.</Text>
          </View>
        )}

        {activeShift && (
          <>
            {/* Info Card */}
            <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Icon name="git-network-outline" size={18} color="#003C8F" />
            <Text style={styles.infoText}>Nozzle: <Text style={{fontWeight:'bold'}}>{activeShift.nozzleId}</Text></Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="speedometer-outline" size={18} color="#003C8F" />
            <Text style={styles.infoText}>Opening Meter: <Text style={{fontWeight:'bold'}}>{oMeter}</Text></Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="pricetag-outline" size={18} color="#003C8F" />
            <Text style={styles.infoText}>System Rate: <Text style={{fontWeight:'bold'}}>₹{nozzleData?.fuelRate || 0}/L</Text></Text>
          </View>
        </View>

        {/* Live Calculation Receipt */}
        <View style={styles.receiptCard}>
          <Text style={styles.receiptHeader}>Live Summary</Text>
          
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Net Sold (Liters)</Text>
            <Text style={styles.receiptValue}>{netSoldLiters.toFixed(2)} L</Text>
          </View>
          
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Expected Amount</Text>
            <Text style={styles.receiptValue}>₹{expectedTotalAmount.toFixed(2)}</Text>
          </View>
          
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Total Collected (inc. Credit)</Text>
            <Text style={styles.receiptValue}>₹{totalCollection.toFixed(2)}</Text>
          </View>
          
          <View style={[styles.shortageBox, { backgroundColor: isShortage ? '#FFEBEE' : '#E8F5E9', borderColor: isShortage ? '#EF5350' : '#66BB6A' }]}>
            <Text style={[styles.shortageText, { color: isShortage ? '#C62828' : '#2E7D32' }]}>
              {isShortage ? 'SHORTAGE' : 'EXCESS'}: ₹{Math.abs(shortageOrExcess).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Section 1: Meter & Rate */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="speedometer" size={20} color="#4B5563" />
            <Text style={styles.sectionTitle}>Shift Details</Text>
          </View>
          <CustomInput label="Today's Rate (₹/L) *" keyboardType="numeric" value={fuelRate} onChangeText={(t) => setFuelRate(sanitizeNumber(t))} leftIcon="pricetag-outline" />
          <CustomInput label="Closing Meter Reading *" keyboardType="numeric" value={closingMeter} onChangeText={(t) => setClosingMeter(sanitizeNumber(t))} leftIcon="keypad-outline" />
          <CustomInput label="Testing Fuel (Liters)" keyboardType="numeric" value={testingQty} onChangeText={(t) => setTestingQty(sanitizeNumber(t))} placeholder="0.00" leftIcon="flask-outline" />
        </View>

        {/* Section 2: Digital Payments */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="phone-portrait-outline" size={20} color="#4B5563" />
            <Text style={styles.sectionTitle}>Digital Payments (UPI)</Text>
          </View>
          <View style={{ position: 'relative' }}>
            <CustomInput label="Online / UPI Collection (₹)" keyboardType="numeric" value={online} 
              onChangeText={(t) => {
                const val = sanitizeNumber(t);
                setOnline(val);
                setIsOnlineMatched(false);
              }} 
              onBlur={() => {
                if (parseFloat(online) > 0 && !isOnlineMatched) {
                  setOnlineBreakdownVisible(true);
                }
              }}
              placeholder="0.00" leftIcon="phone-portrait-outline" 
            />
            {parseFloat(online) > 0 && (
              <View style={styles.breakdownStatus}>
                <Icon name={isOnlineMatched ? "checkmark-circle" : "alert-circle"} size={16} color={isOnlineMatched ? "green" : "red"} />
                <Text style={{color: isOnlineMatched ? "green" : "red", fontSize: 12, marginLeft: 5, flex: 1}}>
                  {isOnlineMatched ? "Online Breakdown Matched" : "Online Breakdown Mismatched"}
                </Text>
                <TouchableOpacity onPress={() => setOnlineBreakdownVisible(true)} style={styles.breakdownBtn}>
                  <Text style={styles.breakdownBtnText}>{isOnlineMatched ? "Edit Breakdown" : "Add Breakdown"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Section 3: Cash & Deductions */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon name="wallet-outline" size={20} color="#4B5563" />
            <Text style={styles.sectionTitle}>Cash & Others</Text>
          </View>
          <View style={{ position: 'relative' }}>
            <CustomInput label="Cash Collection (₹) *" keyboardType="numeric" value={cash} 
              onChangeText={(t) => {
                const val = sanitizeNumber(t);
                setCash(val);
                setIsCashMatched(false);
              }} 
              onBlur={() => {
                if (parseFloat(cash) > 0 && !isCashMatched) {
                  setCashBreakdownVisible(true);
                }
              }}
              placeholder="0.00" leftIcon="cash-outline" 
            />
            {parseFloat(cash) > 0 && (
              <View style={styles.breakdownStatus}>
                <Icon name={isCashMatched ? "checkmark-circle" : "alert-circle"} size={16} color={isCashMatched ? "green" : "red"} />
                <Text style={{color: isCashMatched ? "green" : "red", fontSize: 12, marginLeft: 5, flex: 1}}>
                  {isCashMatched ? "Cash Breakdown Matched" : "Cash Breakdown Mismatched"}
                </Text>
                <TouchableOpacity onPress={() => setCashBreakdownVisible(true)} style={styles.breakdownBtn}>
                  <Text style={styles.breakdownBtnText}>{isCashMatched ? "Edit Breakdown" : "Add Breakdown"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          <View style={{ position: 'relative' }}>
            <CustomInput label="Credit / Udhari (₹)" keyboardType="numeric" value={udhari} 
              onChangeText={(t) => {
                const val = sanitizeNumber(t);
                setUdhari(val);
                setIsUdhariMatched(false);
              }} 
              onBlur={() => {
                if (parseFloat(udhari) > 0 && !isUdhariMatched) {
                  setUdhariBreakdownVisible(true);
                }
              }}
              placeholder="0.00" leftIcon="book-outline" 
            />
            {parseFloat(udhari) > 0 && (
              <View style={styles.breakdownStatus}>
                <Icon name={isUdhariMatched ? "checkmark-circle" : "alert-circle"} size={16} color={isUdhariMatched ? "green" : "red"} />
                <Text style={{color: isUdhariMatched ? "green" : "red", fontSize: 12, marginLeft: 5, flex: 1}}>
                  {isUdhariMatched ? "Udhari Breakdown Matched" : "Udhari Breakdown Mismatched"}
                </Text>
                <TouchableOpacity onPress={() => setUdhariBreakdownVisible(true)} style={styles.breakdownBtn}>
                  <Text style={styles.breakdownBtnText}>{isUdhariMatched ? "Edit Breakdown" : "Add Breakdown"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          <View style={{ position: 'relative' }}>
            <CustomInput label="Expenses (₹)" keyboardType="numeric" value={expense} 
              onChangeText={(t) => {
                const val = sanitizeNumber(t);
                setExpense(val);
                setIsExpenseMatched(false);
              }} 
              onBlur={() => {
                if (parseFloat(expense) > 0 && !isExpenseMatched) {
                  setExpenseBreakdownVisible(true);
                }
              }}
              placeholder="0.00" leftIcon="receipt-outline" 
            />
            {parseFloat(expense) > 0 && (
              <View style={styles.breakdownStatus}>
                <Icon name={isExpenseMatched ? "checkmark-circle" : "alert-circle"} size={16} color={isExpenseMatched ? "green" : "red"} />
                <Text style={{color: isExpenseMatched ? "green" : "red", fontSize: 12, marginLeft: 5, flex: 1}}>
                  {isExpenseMatched ? "Expense Breakdown Matched" : "Expense Breakdown Mismatched"}
                </Text>
                <TouchableOpacity onPress={() => setExpenseBreakdownVisible(true)} style={styles.breakdownBtn}>
                  <Text style={styles.breakdownBtnText}>{isExpenseMatched ? "Edit Breakdown" : "Add Breakdown"}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={{ marginBottom: 40, marginTop: 10 }}>
          <CustomButton title="SUBMIT REPORT" onPress={handleSubmitReport} loading={submitting} type="danger" icon="cloud-upload-outline" />
        </View>
        </>
        )}

        <Modal visible={cashBreakdownVisible} transparent={true} animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Cash Breakdown</Text>
                <TouchableOpacity onPress={() => setCashBreakdownVisible(false)}>
                  <Icon name="close-circle" size={28} color="#d32f2f" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalAmountBanner}>
                <Text style={styles.modalAmountText}>Target Cash: ₹{cashAmt}</Text>
                <Text style={styles.modalAmountText}>Current Total: ₹{breakdownTotal}</Text>
              </View>
              
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.breakdownSectionTitle}>Notes</Text>
                <View style={styles.breakdownGrid}>
                   {renderBreakdownInput('notes2000', '₹2000 Notes')}
                   {renderBreakdownInput('notes500', '₹500 Notes')}
                   {renderBreakdownInput('notes200', '₹200 Notes')}
                   {renderBreakdownInput('notes100', '₹100 Notes')}
                   {renderBreakdownInput('notes50', '₹50 Notes')}
                   {renderBreakdownInput('notes20', '₹20 Notes')}
                   {renderBreakdownInput('notes10', '₹10 Notes')}
                </View>

                <Text style={styles.breakdownSectionTitle}>Coins</Text>
                <View style={styles.breakdownGrid}>
                   {renderBreakdownInput('coins20', '₹20 Coins')}
                   {renderBreakdownInput('coins10', '₹10 Coins')}
                   {renderBreakdownInput('coins5', '₹5 Coins')}
                   {renderBreakdownInput('coins2', '₹2 Coins')}
                   {renderBreakdownInput('coins1', '₹1 Coin')}
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                {breakdownTotal === cashAmt ? (
                  <CustomButton title="SUBMIT BREAKDOWN" onPress={() => {
                    setIsCashMatched(true);
                    setCashBreakdownVisible(false);
                  }} type="primary" />
                ) : (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>Please complete the whole amount match.</Text>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={onlineBreakdownVisible} transparent={true} animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Online Breakdown</Text>
                <TouchableOpacity onPress={() => setOnlineBreakdownVisible(false)}>
                  <Icon name="close-circle" size={28} color="#d32f2f" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalAmountBanner}>
                <Text style={styles.modalAmountText}>Target Online: ₹{parseFloat(online) || 0}</Text>
                <Text style={styles.modalAmountText}>Current Total: ₹{onlineBreakdownTotal}</Text>
              </View>
              
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                 {renderOnlineBreakdownInput('phonePe', 'PhonePe (₹)', 'phone-portrait')}
                 {renderOnlineBreakdownInput('paytm', 'Paytm (₹)', 'phone-portrait')}
                 {renderOnlineBreakdownInput('bharatPe', 'BharatPe (₹)', 'phone-portrait')}
              </ScrollView>

              <View style={styles.modalFooter}>
                {onlineBreakdownTotal === (parseFloat(online) || 0) ? (
                  <CustomButton title="SUBMIT BREAKDOWN" onPress={() => {
                    setIsOnlineMatched(true);
                    setOnlineBreakdownVisible(false);
                  }} type="primary" />
                ) : (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>Please complete the whole amount match.</Text>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={udhariBreakdownVisible} transparent={true} animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Credit / Udhari Breakdown</Text>
                <TouchableOpacity onPress={() => setUdhariBreakdownVisible(false)}>
                  <Icon name="close-circle" size={28} color="#d32f2f" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalAmountBanner}>
                <Text style={styles.modalAmountText}>Target Udhari: ₹{parseFloat(udhari) || 0}</Text>
                <Text style={styles.modalAmountText}>Current Total: ₹{calculateUdhariBreakdownTotal()}</Text>
              </View>
              
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                 {udhariBreakdownData.map((item, index) => (
                   <View key={item.id} style={styles.udhariEntryContainer}>
                     <Text style={styles.udhariEntryTitle}>Entry {index + 1}</Text>
                     <View style={styles.udhariInputRow}>
                       <View style={{flex: 1, marginRight: 10}}>
                         <CustomInput 
                           label="Name / Party" 
                           value={item.name} 
                           onChangeText={(t) => handleUdhariBreakdownChange(item.id, 'name', t)} 
                           placeholder="Enter name" 
                           leftIcon="person-outline"
                         />
                       </View>
                       <View style={{flex: 1}}>
                         <CustomInput 
                           label="Amount (₹)" 
                           keyboardType="numeric" 
                           value={item.amount} 
                           onChangeText={(t) => handleUdhariBreakdownChange(item.id, 'amount', t)} 
                           placeholder="0.00" 
                           leftIcon="cash-outline"
                         />
                       </View>
                     </View>
                     {udhariBreakdownData.length > 1 && (
                       <TouchableOpacity onPress={() => removeUdhariEntry(item.id)} style={styles.removeUdhariBtn}>
                         <Icon name="trash-outline" size={16} color="#EF4444" />
                         <Text style={{color: '#EF4444', marginLeft: 5, fontWeight: 'bold'}}>Remove Entry</Text>
                       </TouchableOpacity>
                     )}
                   </View>
                 ))}
                 
                 <TouchableOpacity onPress={addUdhariEntry} style={styles.addUdhariBtn}>
                   <Icon name="add-circle-outline" size={20} color="#0369A1" />
                   <Text style={{color: '#0369A1', marginLeft: 5, fontWeight: 'bold'}}>Add Another Person</Text>
                 </TouchableOpacity>
              </ScrollView>

              <View style={styles.modalFooter}>
                {calculateUdhariBreakdownTotal() === (parseFloat(udhari) || 0) && udhariBreakdownData.every(i => i.name.trim() !== '' && (parseFloat(i.amount) || 0) > 0) ? (
                  <CustomButton title="SUBMIT BREAKDOWN" onPress={() => {
                    setIsUdhariMatched(true);
                    setUdhariBreakdownVisible(false);
                  }} type="primary" />
                ) : (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>
                      {calculateUdhariBreakdownTotal() !== (parseFloat(udhari) || 0) 
                        ? 'Please complete the whole amount match.' 
                        : 'Please fill name and amount for all entries.'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal visible={expenseBreakdownVisible} transparent={true} animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Expense Breakdown</Text>
                <TouchableOpacity onPress={() => setExpenseBreakdownVisible(false)}>
                  <Icon name="close-circle" size={28} color="#d32f2f" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.modalAmountBanner}>
                <Text style={styles.modalAmountText}>Target Expense: ₹{parseFloat(expense) || 0}</Text>
                <Text style={styles.modalAmountText}>Current Total: ₹{calculateExpenseBreakdownTotal()}</Text>
              </View>
              
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                 {expenseBreakdownData.map((item, index) => (
                   <View key={item.id} style={styles.udhariEntryContainer}>
                     <Text style={styles.udhariEntryTitle}>Expense {index + 1}</Text>
                     <View style={styles.udhariInputRow}>
                       <View style={{flex: 1, marginRight: 10}}>
                         <CustomInput 
                           label="Reason / Item" 
                           value={item.reason} 
                           onChangeText={(t) => handleExpenseBreakdownChange(item.id, 'reason', t)} 
                           placeholder="Enter reason" 
                           leftIcon="clipboard-outline"
                         />
                       </View>
                       <View style={{flex: 1}}>
                         <CustomInput 
                           label="Amount (₹)" 
                           keyboardType="numeric" 
                           value={item.amount} 
                           onChangeText={(t) => handleExpenseBreakdownChange(item.id, 'amount', t)} 
                           placeholder="0.00" 
                           leftIcon="cash-outline"
                         />
                       </View>
                     </View>
                     {expenseBreakdownData.length > 1 && (
                       <TouchableOpacity onPress={() => removeExpenseEntry(item.id)} style={styles.removeUdhariBtn}>
                         <Icon name="trash-outline" size={16} color="#EF4444" />
                         <Text style={{color: '#EF4444', marginLeft: 5, fontWeight: 'bold'}}>Remove Entry</Text>
                       </TouchableOpacity>
                     )}
                   </View>
                 ))}
                 
                 <TouchableOpacity onPress={addExpenseEntry} style={styles.addUdhariBtn}>
                   <Icon name="add-circle-outline" size={20} color="#0369A1" />
                   <Text style={{color: '#0369A1', marginLeft: 5, fontWeight: 'bold'}}>Add Another Expense</Text>
                 </TouchableOpacity>
              </ScrollView>

              <View style={styles.modalFooter}>
                {calculateExpenseBreakdownTotal() === (parseFloat(expense) || 0) && expenseBreakdownData.every(i => i.reason.trim() !== '' && (parseFloat(i.amount) || 0) > 0) ? (
                  <CustomButton title="SUBMIT BREAKDOWN" onPress={() => {
                    setIsExpenseMatched(true);
                    setExpenseBreakdownVisible(false);
                  }} type="primary" />
                ) : (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorBoxText}>
                      {calculateExpenseBreakdownTotal() !== (parseFloat(expense) || 0) 
                        ? 'Please complete the whole amount match.' 
                        : 'Please fill reason and amount for all entries.'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { padding: 15 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 15,
    marginTop: 5
  },
  title: { 
    fontSize: 26, 
    fontWeight: '900', 
    color: '#111827', 
    marginLeft: 10,
    letterSpacing: 0.5
  },
  noShiftText: { fontSize: 20, color: '#374151', fontWeight: 'bold' },
  
  infoCard: { 
    backgroundColor: '#E0F2FE', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#0284C7'
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { fontSize: 14, color: '#0369A1', marginLeft: 8 },

  receiptCard: { 
    backgroundColor: '#1F2937', 
    padding: 20, 
    borderRadius: 16, 
    marginBottom: 25, 
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5
  },
  receiptHeader: { fontSize: 18, fontWeight: 'bold', color: '#F9FAFB', marginBottom: 15, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#374151', paddingBottom: 5 },
  receiptLabel: { color: '#9CA3AF', fontSize: 13 },
  receiptValue: { fontWeight: 'bold', color: '#F3F4F6', fontSize: 15 },
  
  shortageBox: { 
    marginTop: 15, 
    padding: 12, 
    borderRadius: 8, 
    alignItems: 'center',
    borderWidth: 1
  },
  shortageText: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  
  sectionCard: { 
    backgroundColor: '#fff', 
    padding: 20, 
    borderRadius: 16, 
    elevation: 2, 
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#4B5563', marginLeft: 10 },
  formCard: { 
    backgroundColor: '#fff', 
    padding: 20, 
    borderRadius: 20, 
    elevation: 4, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginBottom: 20,
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
    backgroundColor: '#F9FAFB',
    overflow: 'hidden'
  },
  picker: {
    height: 50,
  },
  
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  breakdownInputWrapper: { width: '48%', marginBottom: 10 },
  breakdownInputLabel: { fontSize: 13, fontWeight: 'bold', color: '#444', marginBottom: 2 },
  breakdownSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#003C8F', marginTop: 10, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  modalAmountBanner: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#E0F2FE', padding: 10, borderRadius: 8, marginBottom: 15 },
  modalAmountText: { fontSize: 14, fontWeight: 'bold', color: '#0369A1' },
  modalScroll: { marginBottom: 15 },
  modalFooter: { paddingTop: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  errorBox: { backgroundColor: '#FFEBEE', padding: 12, borderRadius: 8, alignItems: 'center' },
  errorBoxText: { color: '#C62828', fontWeight: 'bold' },
  breakdownStatus: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 8, borderRadius: 8, marginTop: -10, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
  breakdownBtn: { backgroundColor: '#003C8F', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  breakdownBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  
  udhariEntryContainer: { backgroundColor: '#F3F4F6', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  udhariEntryTitle: { fontSize: 14, fontWeight: 'bold', color: '#4B5563', marginBottom: 10 },
  udhariInputRow: { flexDirection: 'row', justifyContent: 'space-between' },
  removeUdhariBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: -5, padding: 5 },
  addUdhariBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#E0F2FE', borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#BAE6FD', borderStyle: 'dashed' }
});
