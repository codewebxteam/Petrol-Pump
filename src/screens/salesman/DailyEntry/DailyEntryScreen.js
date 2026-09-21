import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, 
  SafeAreaView, Modal, KeyboardAvoidingView, Platform, TextInput 
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { 
  submitDailyEntry, 
  saveNewUdhariRecords, 
  processUdhariReturns, 
  updateDailyEntry,
  recordStaffSalaryAdvances,
  getStaffMonthlyAdvanceTotal,
  getMonthKey
} from '../../../services/dbServices';
import { generateAndSharePdf } from '../../../utils/generatePdfReceipt';
import { createEditRequest, verifyEditOtp, findTodayEntry } from '../../../utils/otpHelper';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import Icon from '@expo/vector-icons/Ionicons';

// Preset Non-Cash / Digital Payment Modes (ATM, UPI, Fleet, Cards, Offers)
const PRESET_PAYMENT_MODES = [
  { id: 'paytm', name: 'Paytm (पेटीएम)', icon: 'wallet-outline', color: '#00B9F5' },
  { id: 'phonepe', name: 'PhonePe (फोनपे)', icon: 'phone-portrait-outline', color: '#5F259F' },
  { id: 'atm', name: 'ATM / POS स्वाइप', icon: 'card-outline', color: '#003C8F' },
  { id: 'extrapower', name: 'ExtraPower (फ्लीट कार्ड)', icon: 'speedometer-outline', color: '#FF6F00' },
  { id: 'extrareward', name: 'ExtraReward (XTRARewards)', icon: 'gift-outline', color: '#EA580C' },
  { id: 'debit_card', name: 'Debit Card (डेबिट कार्ड)', icon: 'card-outline', color: '#0284C7' },
  { id: 'credit_card', name: 'Credit Card (क्रेडिट कार्ड)', icon: 'card-outline', color: '#7C3AED' },
  { id: 'gpay', name: 'Google Pay (GPay)', icon: 'logo-google', color: '#4285F4' },
  { id: 'offer', name: 'Offer / Voucher (छूट)', icon: 'pricetag-outline', color: '#16A34A' },
  { id: 'bharatpe', name: 'BharatPe / QR', icon: 'qr-code-outline', color: '#0F766E' }
];

export default function DailyEntryScreen({ navigation }) {
  // Staff Selection
  const [salesmen, setSalesmen] = useState([]);
  const [selectedSalesman, setSelectedSalesman] = useState('');

  // Machine Selection
  const [machines, setMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [selectedMachineData, setSelectedMachineData] = useState(null);

  // Firestore Nozzles
  const [nozzlesList, setNozzlesList] = useState([]);

  // Loading & Submitting States
  const [submitting, setSubmitting] = useState(false);

  // 1. Petrol Nozzle (N1) State - Connected to Tank 1
  const [petrolOpeningMeter, setPetrolOpeningMeter] = useState('');
  const [petrolClosingMeter, setPetrolClosingMeter] = useState('');
  const [petrolTestingQty, setPetrolTestingQty] = useState('5'); // Default 5L standard testing
  const [petrolRate, setPetrolRate] = useState('');
  const [petrolAutoLoaded, setPetrolAutoLoaded] = useState(false);

  // 2. Diesel Nozzle State - Connected to Tank 2
  const [dieselOpeningMeter, setDieselOpeningMeter] = useState('');
  const [dieselClosingMeter, setDieselClosingMeter] = useState('');
  const [dieselTestingQty, setDieselTestingQty] = useState('5'); // Default 5L standard testing
  const [dieselRate, setDieselRate] = useState('');
  const [dieselAutoLoaded, setDieselAutoLoaded] = useState(false);

  // Dynamic Nozzle IDs based on Machine (e.g. DU1 -> N1/N2, DU2 -> N3/N4)
  const [currentPetrolNozzleId, setCurrentPetrolNozzleId] = useState('N1');
  const [currentDieselNozzleId, setCurrentDieselNozzleId] = useState('N2');

  // Testing already done today status (hides testing input if already submitted today)
  const [petrolTestingAlreadyDone, setPetrolTestingAlreadyDone] = useState(false);
  const [dieselTestingAlreadyDone, setDieselTestingAlreadyDone] = useState(false);

  // Payment Collections
  const [cash, setCash] = useState('');
  const [coins, setCoins] = useState('');
  const [online, setOnline] = useState('');
  const [udhari, setUdhari] = useState('');
  const [expense, setExpense] = useState('');

  // 1. Multi-Mode Digital & Card Payments State
  const [digitalModalVisible, setDigitalModalVisible] = useState(false);
  const [digitalEntries, setDigitalEntries] = useState([
    { id: 'init_paytm', modeId: 'paytm', name: 'Paytm (पेटीएम)', amount: '' },
    { id: 'init_phonepe', modeId: 'phonepe', name: 'PhonePe (फोनपे)', amount: '' },
    { id: 'init_atm', modeId: 'atm', name: 'ATM / POS स्वाइप', amount: '' }
  ]);
  const [customModeInputVisible, setCustomModeInputVisible] = useState(false);
  const [customModeName, setCustomModeName] = useState('');

  // Calculate Digital Total
  const calculateDigitalTotal = (entries = digitalEntries) => {
    return entries.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleDigitalAmountChange = (id, value) => {
    const val = sanitizeDecimalInput(value);
    const updated = digitalEntries.map(entry => entry.id === id ? { ...entry, amount: val } : entry);
    setDigitalEntries(updated);
    const total = calculateDigitalTotal(updated);
    setOnline(total > 0 ? total.toFixed(2) : '');
  };

  const addPresetPaymentMode = (preset) => {
    // If already exists, don't duplicate mode
    const existing = digitalEntries.find(e => e.modeId === preset.id);
    if (existing) {
      Alert.alert('मौजूद है', `${preset.name} पहले से सूची में है.`);
      return;
    }
    const newEntry = {
      id: `${preset.id}_${Date.now()}`,
      modeId: preset.id,
      name: preset.name,
      amount: ''
    };
    setDigitalEntries([...digitalEntries, newEntry]);
  };

  const addCustomPaymentMode = () => {
    if (!customModeName.trim()) {
      Alert.alert('Required', 'कृपया नए पेमेंट माध्यम का नाम दर्ज करें.');
      return;
    }
    const newEntry = {
      id: `custom_${Date.now()}`,
      modeId: 'custom',
      name: customModeName.trim(),
      amount: '',
      isCustom: true
    };
    setDigitalEntries([...digitalEntries, newEntry]);
    setCustomModeName('');
    setCustomModeInputVisible(false);
  };

  const removeDigitalEntry = (id) => {
    const updated = digitalEntries.filter(entry => entry.id !== id);
    setDigitalEntries(updated);
    const total = calculateDigitalTotal(updated);
    setOnline(total > 0 ? total.toFixed(2) : '');
  };

  // 2. Cash Breakdown
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

  const calculateNotesTotal = (data = breakdownData) => {
    let total = 0;
    total += (parseInt(data.notes2000) || 0) * 2000;
    total += (parseInt(data.notes500) || 0) * 500;
    total += (parseInt(data.notes200) || 0) * 200;
    total += (parseInt(data.notes100) || 0) * 100;
    total += (parseInt(data.notes50) || 0) * 50;
    total += (parseInt(data.notes20) || 0) * 20;
    total += (parseInt(data.notes10) || 0) * 10;
    return total;
  };

  const calculateCoinsBreakdownTotal = (data = breakdownData) => {
    let total = 0;
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

  // 3. Udhari Breakdown
  const [udhariBreakdownVisible, setUdhariBreakdownVisible] = useState(false);
  const [udhariBreakdownData, setUdhariBreakdownData] = useState([{ id: Date.now().toString(), name: '', amount: '' }]);
  const [isUdhariMatched, setIsUdhariMatched] = useState(false);

  // 3B. Udhari Return (Old Credit Repayment)
  const [pendingUdhariCustomers, setPendingUdhariCustomers] = useState([]);
  const [udhariReturnModalVisible, setUdhariReturnModalVisible] = useState(false);
  const [udhariReturnEntries, setUdhariReturnEntries] = useState([]);
  const [selectedReturnCustomer, setSelectedReturnCustomer] = useState('');

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingReportId, setExistingReportId] = useState(null);
  const [existingReportData, setExistingReportData] = useState(null);
  const [isFormClearedForFreshFill, setIsFormClearedForFreshFill] = useState(false);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [editRequestId, setEditRequestId] = useState(null);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const calculateUdhariBreakdownTotal = (data = udhariBreakdownData) => {
    return data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleUdhariBreakdownChange = (id, field, value) => {
    const newData = udhariBreakdownData.map(item => {
      if (item.id === id) {
        return { ...item, [field]: field === 'amount' ? sanitizeDecimalInput(value) : value };
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

  // 3B. Udhari Return Helpers
  const handleSelectReturnCustomer = (docId) => {
    if (!docId) return;
    // Check if already added
    if (udhariReturnEntries.find(e => e.docId === docId)) {
      Alert.alert('पहले से जोड़ा गया', 'यह ग्राहक पहले से वापसी सूची में है.');
      return;
    }
    const customer = pendingUdhariCustomers.find(c => c.docId === docId);
    if (!customer) return;
    setUdhariReturnEntries([
      ...udhariReturnEntries,
      {
        id: `ret_${Date.now()}`,
        docId: customer.docId,
        customerName: customer.customerName,
        totalDue: customer.remainingAmount,
        amountReturned: ''
      }
    ]);
    setSelectedReturnCustomer('');
  };

  const handleReturnAmountChange = (id, value) => {
    const val = sanitizeDecimalInput(value);
    setUdhariReturnEntries(udhariReturnEntries.map(e => 
      e.id === id ? { ...e, amountReturned: val } : e
    ));
  };

  const removeReturnEntry = (id) => {
    setUdhariReturnEntries(udhariReturnEntries.filter(e => e.id !== id));
  };

  const calculateReturnTotal = () => {
    return udhariReturnEntries.reduce((sum, e) => sum + (parseFloat(e.amountReturned) || 0), 0);
  };

  // 4. Expense Breakdown
  const [expenseBreakdownVisible, setExpenseBreakdownVisible] = useState(false);
  const [expenseBreakdownData, setExpenseBreakdownData] = useState([
    { id: Date.now().toString(), type: 'general', reason: '', amount: '', salesmanId: '', salesmanName: '' }
  ]);
  const [isExpenseMatched, setIsExpenseMatched] = useState(false);
  const [staffMonthlyAdvancesMap, setStaffMonthlyAdvancesMap] = useState({});

  const fetchMonthlyAdvanceForStaff = async (staffId) => {
    if (!staffId) return;
    try {
      const res = await getStaffMonthlyAdvanceTotal(staffId);
      setStaffMonthlyAdvancesMap(prev => ({
        ...prev,
        [staffId]: res.totalAdvance
      }));
    } catch (e) {
      console.warn("Error fetching monthly advance for staff:", e);
    }
  };

  const handleOpenExpenseModal = () => {
    setExpenseBreakdownVisible(true);
    const currentStaffId = selectedSalesman;
    if (currentStaffId) {
      fetchMonthlyAdvanceForStaff(currentStaffId);
    }
    expenseBreakdownData.forEach(item => {
      if (item.type === 'salary' && item.salesmanId) {
        fetchMonthlyAdvanceForStaff(item.salesmanId);
      }
    });
  };

  const calculateExpenseBreakdownTotal = (data = expenseBreakdownData) => {
    return data.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleExpenseBreakdownChange = (id, field, value) => {
    const newData = expenseBreakdownData.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: field === 'amount' ? sanitizeDecimalInput(value) : value };
        if (field === 'type' && value === 'salary' && !updated.salesmanId) {
          const sObj = effectiveSalesmen.find(s => s.id === selectedSalesman);
          updated.salesmanId = selectedSalesman || '';
          updated.salesmanName = sObj ? sObj.name : 'Staff';
        }
        return updated;
      }
      return item;
    });
    setExpenseBreakdownData(newData);
  };

  const addExpenseEntry = () => {
    const defaultStaff = effectiveSalesmen.find(s => s.id === selectedSalesman);
    setExpenseBreakdownData([
      ...expenseBreakdownData, 
      { 
        id: Date.now().toString() + Math.random(), 
        type: 'general', 
        reason: '', 
        amount: '',
        salesmanId: selectedSalesman || '',
        salesmanName: defaultStaff ? defaultStaff.name : 'Staff'
      }
    ]);
  };

  const removeExpenseEntry = (id) => {
    setExpenseBreakdownData(expenseBreakdownData.filter(item => item.id !== id));
  };

  // 4-Decimal Utilities
  const sanitizeDecimalInput = (val) => {
    if (!val) return '';
    let cleaned = val.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  };

  const formatTo4Decimals = (val) => {
    if (!val) return '0.0000';
    const num = parseFloat(val);
    if (isNaN(num)) return '0.0000';
    return num.toFixed(4);
  };

  // Fallbacks
  const fallbackSalesmen = [
    { id: 'staff_1', name: 'राहुल कुमार (Rahul Kumar)' },
    { id: 'staff_2', name: 'अमित सिंह (Amit Singh)' },
    { id: 'staff_3', name: 'विकास यादव (Vikas Yadav)' },
    { id: 'staff_4', name: 'संजय वर्मा (Sanjay Verma)' }
  ];

  const fallbackMachines = [
    { id: 'DU1', name: 'DU1', petrolNozzle: 'N1', dieselNozzle: 'N2' },
    { id: 'DU2', name: 'DU2', petrolNozzle: 'N3', dieselNozzle: 'N4' },
    { id: 'DU3', name: 'DU3', petrolNozzle: 'N5', dieselNozzle: 'N6' }
  ];

  const effectiveSalesmen = salesmen.length > 0 ? salesmen : fallbackSalesmen;
  const effectiveMachines = machines.length > 0 ? machines : fallbackMachines;

  // Listeners on Mount
  useEffect(() => {
    const qSalesmen = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubSalesmen = onSnapshot(
      qSalesmen, 
      (snapshot) => {
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        setSalesmen(list);
      },
      (error) => console.warn("Salesmen listener:", error.message)
    );

    const unsubMachines = onSnapshot(
      collection(db, 'machines'),
      (snapshot) => {
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        setMachines(list);
      },
      (error) => console.warn("Machines listener:", error.message)
    );

    const unsubNozzles = onSnapshot(
      collection(db, 'nozzles'),
      (snapshot) => {
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        setNozzlesList(list);
      },
      (error) => console.warn("Nozzles listener:", error.message)
    );

    // Listen for pending (unpaid) udhari records for the return dropdown
    const qUdhari = query(collection(db, 'udhari_records'), where('isPaid', '==', false));
    const unsubUdhari = onSnapshot(
      qUdhari,
      (snapshot) => {
        const list = [];
        snapshot.forEach(d => {
          const data = d.data();
          list.push({
            docId: d.id,
            customerName: data.customerName || 'Unknown',
            amount: data.amount || 0,
            remainingAmount: data.remainingAmount || data.amount || 0,
            createdAt: data.createdAt,
            payments: data.payments || []
          });
        });
        // Sort by name for easy finding
        list.sort((a, b) => a.customerName.localeCompare(b.customerName));
        setPendingUdhariCustomers(list);
      },
      (error) => console.warn("Udhari listener:", error.message)
    );

    return () => {
      unsubSalesmen();
      unsubMachines();
      unsubNozzles();
      unsubUdhari();
    };
  }, []);

  // Helper to check for existing entry today and populate Edit Mode
  const checkEditModeForStaffAndMachine = async (salesmanId, machineId) => {
    if (!salesmanId || !machineId) return;
    try {
      const existingEntry = await findTodayEntry(salesmanId, machineId);
      if (existingEntry) {
        setIsEditMode(true);
        setExistingReportId(existingEntry.id);
        setExistingReportData(existingEntry);

        // Pre-fill meters
        if (existingEntry.petrolOpeningMeter) setPetrolOpeningMeter(String(existingEntry.petrolOpeningMeter));
        if (existingEntry.petrolClosingMeter) setPetrolClosingMeter(String(existingEntry.petrolClosingMeter));
        if (existingEntry.dieselOpeningMeter) setDieselOpeningMeter(String(existingEntry.dieselOpeningMeter));
        if (existingEntry.dieselClosingMeter) setDieselClosingMeter(String(existingEntry.dieselClosingMeter));

        setPetrolTestingQty(String(existingEntry.petrolTesting ?? '5'));
        setDieselTestingQty(String(existingEntry.dieselTesting ?? '5'));
        if (existingEntry.petrolRate) setPetrolRate(String(existingEntry.petrolRate));
        if (existingEntry.dieselRate) setDieselRate(String(existingEntry.dieselRate));

        // Pre-fill payments
        if (existingEntry.cashNotesAmount !== undefined) {
          setCash(String(existingEntry.cashNotesAmount));
        } else if (existingEntry.cashAmount) {
          setCash(String(existingEntry.cashAmount));
        }
        if (existingEntry.coinsAmount !== undefined) {
          setCoins(String(existingEntry.coinsAmount));
        } else {
          setCoins('');
        }
        setOnline(existingEntry.onlineAmount ? String(existingEntry.onlineAmount) : '');
        setUdhari(existingEntry.udhariAmount ? String(existingEntry.udhariAmount) : '');
        setExpense(existingEntry.expenses ? String(existingEntry.expenses) : '');

        if (existingEntry.digitalPaymentsBreakdown && existingEntry.digitalPaymentsBreakdown.length > 0) {
          setDigitalEntries(existingEntry.digitalPaymentsBreakdown);
        }
        if (existingEntry.cashBreakdown) {
          setBreakdownData(existingEntry.cashBreakdown);
          setIsCashMatched(true);
        }
        if (existingEntry.udhariBreakdown && existingEntry.udhariBreakdown.length > 0) {
          setUdhariBreakdownData(existingEntry.udhariBreakdown);
          setIsUdhariMatched(true);
        }
        if (existingEntry.expenseBreakdown && existingEntry.expenseBreakdown.length > 0) {
          setExpenseBreakdownData(existingEntry.expenseBreakdown);
          setIsExpenseMatched(true);
        }

        setIsFormClearedForFreshFill(false);
        Alert.alert(
          '⚠️ आज की एंट्री मिली! (Edit Mode)',
          'इस मशीन पर आज की एंट्री पहले से दर्ज है। पूरा डेटा फॉर्म में लोड हो गया है। आप इसमें बदलाव कर सकते हैं या फ़ॉर्म खाली कर शुरू से भर सकते हैं। सबमिट करने पर Admin से 6-digit OTP लेना होगा।',
          [{ text: 'समझ गया (OK)' }]
        );
      } else {
        setIsEditMode(false);
        setExistingReportId(null);
        setExistingReportData(null);
        setIsFormClearedForFreshFill(false);
      }
    } catch (err) {
      console.warn('Edit check error:', err);
    }
  };

  // Staff chooses to fill from scratch instead of editing pre-filled values
  const handleStartFresh = () => {
    setPetrolClosingMeter('');
    setDieselClosingMeter('');
    setCash('');
    setCoins('');
    setOnline('');
    setUdhari('');
    setExpense('');
    setIsCashMatched(false);
    setIsUdhariMatched(false);
    setIsExpenseMatched(false);
    setBreakdownData({
      notes2000: '', notes500: '', notes200: '', notes100: '', notes50: '', notes20: '', notes10: '',
      coins20: '', coins10: '', coins5: '', coins2: '', coins1: ''
    });
    setDigitalEntries([
      { id: 'init_paytm', modeId: 'paytm', name: 'Paytm (पेटीएम)', amount: '' },
      { id: 'init_phonepe', modeId: 'phonepe', name: 'PhonePe (फोनपे)', amount: '' },
      { id: 'init_atm', modeId: 'atm', name: 'ATM / POS स्वाइप', amount: '' }
    ]);
    setUdhariBreakdownData([{ id: Date.now().toString(), name: '', amount: '' }]);
    setUdhariReturnEntries([]);
    setExpenseBreakdownData([{ id: Date.now().toString(), type: 'general', reason: '', amount: '', salesmanId: '', salesmanName: '' }]);

    setIsFormClearedForFreshFill(true);
    // Notice: existingReportId and isEditMode remain retained so submission strictly requires OTP!
    Alert.alert(
      'फ़ॉर्म खाली किया गया (शुरू से भरें)',
      'सभी क्लोजिंग मीटर और भुगतान फ़ील्ड खाली कर दिए गए हैं। आप शुरू से नया हिसाब भर सकते हैं।\n\nसुरक्षा नियम: चूंकि आज की बिक्री पहले दर्ज हो चुकी है, इसे सबमिट करने पर भी Admin OTP अनिवार्य रहेगा।'
    );
  };

  // Staff can restore the pre-filled data if they change their mind
  const handleRestoreExistingData = () => {
    if (!existingReportData) return;
    const existingEntry = existingReportData;
    if (existingEntry.petrolOpeningMeter) setPetrolOpeningMeter(String(existingEntry.petrolOpeningMeter));
    if (existingEntry.petrolClosingMeter) setPetrolClosingMeter(String(existingEntry.petrolClosingMeter));
    if (existingEntry.dieselOpeningMeter) setDieselOpeningMeter(String(existingEntry.dieselOpeningMeter));
    if (existingEntry.dieselClosingMeter) setDieselClosingMeter(String(existingEntry.dieselClosingMeter));

    setPetrolTestingQty(String(existingEntry.petrolTesting ?? '5'));
    setDieselTestingQty(String(existingEntry.dieselTesting ?? '5'));
    if (existingEntry.petrolRate) setPetrolRate(String(existingEntry.petrolRate));
    if (existingEntry.dieselRate) setDieselRate(String(existingEntry.dieselRate));

    if (existingEntry.cashNotesAmount !== undefined) {
      setCash(String(existingEntry.cashNotesAmount));
    } else if (existingEntry.cashAmount) {
      setCash(String(existingEntry.cashAmount));
    }
    if (existingEntry.coinsAmount !== undefined) {
      setCoins(String(existingEntry.coinsAmount));
    } else {
      setCoins('');
    }
    setOnline(existingEntry.onlineAmount ? String(existingEntry.onlineAmount) : '');
    setUdhari(existingEntry.udhariAmount ? String(existingEntry.udhariAmount) : '');
    setExpense(existingEntry.expenses ? String(existingEntry.expenses) : '');

    if (existingEntry.digitalPaymentsBreakdown && existingEntry.digitalPaymentsBreakdown.length > 0) {
      setDigitalEntries(existingEntry.digitalPaymentsBreakdown);
    }
    if (existingEntry.cashBreakdown) {
      setBreakdownData(existingEntry.cashBreakdown);
      setIsCashMatched(true);
    }
    if (existingEntry.udhariBreakdown && existingEntry.udhariBreakdown.length > 0) {
      setUdhariBreakdownData(existingEntry.udhariBreakdown);
      setIsUdhariMatched(true);
    }
    if (existingEntry.expenseBreakdown && existingEntry.expenseBreakdown.length > 0) {
      setExpenseBreakdownData(existingEntry.expenseBreakdown);
      setIsExpenseMatched(true);
    }
    setIsFormClearedForFreshFill(false);
  };

  // When Machine Changes: Auto-Carry Last Closing Meters!
  const handleMachineChange = async (machineId) => {
    setSelectedMachine(machineId);
    if (!machineId) {
      setSelectedMachineData(null);
      setPetrolOpeningMeter('');
      setDieselOpeningMeter('');
      setPetrolClosingMeter('');
      setDieselClosingMeter('');
      return;
    }

    // Determine default nozzles according to DU1 (N1+N2), DU2 (N3+N4), DU3 (N5+N6)
    const match = String(machineId).match(/\d+/);
    const machNum = match ? parseInt(match[0], 10) : 1;
    const defaultPNozzleId = `N${(machNum - 1) * 2 + 1}`;
    const defaultDNozzleId = `N${(machNum - 1) * 2 + 2}`;

    const mach = effectiveMachines.find(m => m.id === machineId) || { id: machineId, name: machineId };
    setSelectedMachineData(mach);

    const machNozzles = nozzlesList.filter(n => n.machineId === machineId || n.machineName === machineId);
    
    // Petrol nozzle detection
    const pNozzle = machNozzles.find(n => n.fuelType === 'Petrol' || n.nozzleId === (mach.petrolNozzle || defaultPNozzleId)) || {
      id: `${machineId}-${mach.petrolNozzle || defaultPNozzleId}`,
      nozzleId: mach.petrolNozzle || defaultPNozzleId,
      fuelType: 'Petrol',
      fuelRate: '96.72',
      currentMeterReading: '1933.9489'
    };
    const activePNozzleId = mach.petrolNozzle || pNozzle.nozzleId || defaultPNozzleId;
    setCurrentPetrolNozzleId(activePNozzleId);

    // Diesel nozzle detection
    const dNozzle = machNozzles.find(n => n.fuelType === 'Diesel' || n.nozzleId === (mach.dieselNozzle || defaultDNozzleId)) || {
      id: `${machineId}-${mach.dieselNozzle || defaultDNozzleId}`,
      nozzleId: mach.dieselNozzle || defaultDNozzleId,
      fuelType: 'Diesel',
      fuelRate: '89.62',
      currentMeterReading: '2450.1234'
    };
    const activeDNozzleId = mach.dieselNozzle || dNozzle.nozzleId || defaultDNozzleId;
    setCurrentDieselNozzleId(activeDNozzleId);

    try {
      const cachedPetrol = (await AsyncStorage.getItem(`@meter_${machineId}_petrol`)) || (await AsyncStorage.getItem(`@meter_${activePNozzleId}`));
      const cachedDiesel = (await AsyncStorage.getItem(`@meter_${machineId}_diesel`)) || (await AsyncStorage.getItem(`@meter_${activeDNozzleId}`));

      if (cachedPetrol) {
        setPetrolOpeningMeter(formatTo4Decimals(cachedPetrol));
        setPetrolAutoLoaded(true);
      } else if (pNozzle.currentMeterReading !== undefined && pNozzle.currentMeterReading !== null) {
        setPetrolOpeningMeter(formatTo4Decimals(pNozzle.currentMeterReading));
        setPetrolAutoLoaded(true);
      } else {
        setPetrolOpeningMeter('1933.9489');
        setPetrolAutoLoaded(false);
      }

      if (cachedDiesel) {
        setDieselOpeningMeter(formatTo4Decimals(cachedDiesel));
        setDieselAutoLoaded(true);
      } else if (dNozzle.currentMeterReading !== undefined && dNozzle.currentMeterReading !== null) {
        setDieselOpeningMeter(formatTo4Decimals(dNozzle.currentMeterReading));
        setDieselAutoLoaded(true);
      } else {
        setDieselOpeningMeter('2450.1234');
        setDieselAutoLoaded(false);
      }

      setPetrolRate('');
      setDieselRate('');

      setPetrolClosingMeter('');
      setDieselClosingMeter('');

      // Check if testing was already performed today on this machine
      const todayKey = new Date().toISOString().split('T')[0];
      let pTestingDone = false;
      let dTestingDone = false;

      try {
        const cachedTesting = await AsyncStorage.getItem(`@testing_done_${machineId}_${todayKey}`);
        if (cachedTesting === 'true') {
          pTestingDone = true;
          dTestingDone = true;
        } else {
          // Check Firestore reports from today for this machine
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const qReports = query(
            collection(db, 'sales_reports'),
            where('machineId', '==', machineId)
          );
          const querySnapshot = await getDocs(qReports);
          querySnapshot.forEach(docSnap => {
            const rep = docSnap.data();
            const repDate = rep.timestamp?.toDate ? rep.timestamp.toDate() : (rep.timestamp ? new Date(rep.timestamp) : null);
            if (repDate && repDate >= startOfDay) {
              if (Number(rep.petrolTesting) > 0) pTestingDone = true;
              if (Number(rep.dieselTesting) > 0) dTestingDone = true;
            }
          });
        }
      } catch (checkErr) {
        console.warn("Testing check error:", checkErr);
      }

      setPetrolTestingAlreadyDone(pTestingDone);
      setDieselTestingAlreadyDone(dTestingDone);
      setPetrolTestingQty(pTestingDone ? '0' : '5');
      setDieselTestingQty(dTestingDone ? '0' : '5');

      // Check for existing entry today (Edit Mode Detection)
      if (selectedSalesman) {
        await checkEditModeForStaffAndMachine(selectedSalesman, machineId);
      }
    } catch (e) {
      console.warn("Auto-carry reading error:", e);
    }
  };

  // Calculations for Petrol (Tank 1)
  const pOpening = parseFloat(petrolOpeningMeter) || 0;
  const pClosing = parseFloat(petrolClosingMeter) || pOpening;
  const pTesting = parseFloat(petrolTestingQty) || 0;
  const pGross = Math.max(0, pClosing - pOpening);
  const pNetSold = Math.max(0, pGross - pTesting);
  const pRateVal = parseFloat(petrolRate) || 0;
  const pExpected = pNetSold * pRateVal;

  // Calculations for Diesel (Tank 2)
  const dOpening = parseFloat(dieselOpeningMeter) || 0;
  const dClosing = parseFloat(dieselClosingMeter) || dOpening;
  const dTesting = parseFloat(dieselTestingQty) || 0;
  const dGross = Math.max(0, dClosing - dOpening);
  const dNetSold = Math.max(0, dGross - dTesting);
  const dRateVal = parseFloat(dieselRate) || 0;
  const dExpected = dNetSold * dRateVal;

  // Combined Machine Totals
  const totalLitersSold = pNetSold + dNetSold;
  const totalExpectedAmount = pExpected + dExpected;

  // Combined Collections
  const cashNotesAmt = parseFloat(cash) || 0;
  const coinsAmt = parseFloat(coins) || 0;
  const cashAmt = cashNotesAmt + coinsAmt;
  const digitalAmt = parseFloat(online) || 0;
  const udhariAmt = parseFloat(udhari) || 0;
  const expenseAmt = parseFloat(expense) || 0;
  const totalCollection = cashAmt + digitalAmt + udhariAmt + expenseAmt;

  const shortageOrExcess = totalCollection - totalExpectedAmount;
  const isShortage = shortageOrExcess < -0.01;

  // Watch Matchings
  useEffect(() => {
    if (cashNotesAmt > 0) {
      const notesTot = calculateNotesTotal(breakdownData);
      const coinsModalTot = calculateCoinsBreakdownTotal(breakdownData);
      // Matched if notes match cashNotesAmt, or if total breakdown matches total cashAmt
      if (notesTot === cashNotesAmt || (notesTot + coinsModalTot + coinsAmt) === cashAmt || breakdownTotal === cashAmt) {
        setIsCashMatched(true);
      } else {
        setIsCashMatched(false);
      }
    } else if (coinsAmt > 0) {
      // Only coins entered, no notes to match
      setIsCashMatched(true);
    } else {
      setIsCashMatched(false);
    }
  }, [breakdownTotal, cashNotesAmt, coinsAmt, breakdownData, cashAmt]);

  useEffect(() => {
    const total = calculateUdhariBreakdownTotal(udhariBreakdownData);
    if (udhariAmt > 0 && total === udhariAmt) setIsUdhariMatched(true);
    else setIsUdhariMatched(false);
  }, [udhariBreakdownData, udhariAmt]);

  useEffect(() => {
    const total = calculateExpenseBreakdownTotal(expenseBreakdownData);
    if (expenseAmt > 0 && total === expenseAmt) setIsExpenseMatched(true);
    else setIsExpenseMatched(false);
  }, [expenseBreakdownData, expenseAmt]);

  // Check if all required fields are filled so Submit button can be active
  const isFormValid = useMemo(() => {
    // 1. Staff and Machine selected
    if (!selectedSalesman || !selectedMachine) return false;

    // 2. Petrol Meters filled & closing >= opening
    if (!petrolOpeningMeter.trim() || !petrolClosingMeter.trim()) return false;
    const pOp = parseFloat(petrolOpeningMeter);
    const pCl = parseFloat(petrolClosingMeter);
    if (isNaN(pOp) || isNaN(pCl) || pCl < pOp) return false;

    // 3. Diesel Meters filled & closing >= opening
    if (!dieselOpeningMeter.trim() || !dieselClosingMeter.trim()) return false;
    const dOp = parseFloat(dieselOpeningMeter);
    const dCl = parseFloat(dieselClosingMeter);
    if (isNaN(dOp) || isNaN(dCl) || dCl < dOp) return false;

    // Fuel rates must be entered if fuel was sold
    if (pNetSold > 0 && (!petrolRate || parseFloat(petrolRate) <= 0)) return false;
    if (dNetSold > 0 && (!dieselRate || parseFloat(dieselRate) <= 0)) return false;

    // 4. If breakdown required, must be matched
    if (cashNotesAmt > 0 && !isCashMatched) return false;
    if (udhariAmt > 0 && !isUdhariMatched) return false;
    if (expenseAmt > 0) {
      if (!isExpenseMatched) return false;
      const invalidExp = expenseBreakdownData.some(e => {
        const a = parseFloat(e.amount) || 0;
        if (a <= 0) return false;
        if (e.type === 'salary') return !(e.salesmanId || selectedSalesman);
        return !(e.reason || '').trim();
      });
      if (invalidExp) return false;
    }

    // 5. Must have entered some payment collection if fuel was sold
    if (totalLitersSold > 0 && totalCollection <= 0) return false;

    // 6. Expected Amount (Rupees) MUST match Total Collection (Rupees)
    // Rule: "Bhai jbtk Expected amount match nhi hota hai submit button active n krro n bhai mere jb dono match ho jaye tb krro bs rs match krna h . k aage ka nhi krna hai"
    if (totalLitersSold > 0 || totalExpectedAmount > 0) {
      const expRs = Math.floor(totalExpectedAmount);
      const colRs = Math.floor(totalCollection);
      const expRound = Math.round(totalExpectedAmount);
      const colRound = Math.round(totalCollection);
      const matched = (expRs === colRs) || (expRound === colRound);
      if (!matched) return false;
    }

    return true;
  }, [
    selectedSalesman,
    selectedMachine,
    petrolOpeningMeter,
    petrolClosingMeter,
    dieselOpeningMeter,
    dieselClosingMeter,
    petrolRate,
    dieselRate,
    pNetSold,
    dNetSold,
    cashAmt,
    cashNotesAmt,
    coinsAmt,
    isCashMatched,
    udhariAmt,
    isUdhariMatched,
    expenseAmt,
    isExpenseMatched,
    expenseBreakdownData,
    totalLitersSold,
    totalCollection,
    totalExpectedAmount
  ]);

  const getIncompleteFormMessage = () => {
    if (!selectedSalesman) return 'सबमिट करने के लिए कृपया अपना नाम (Staff) चुनें।';
    if (!selectedMachine) return 'सबमिट करने के लिए कृपया मशीन (Machine) चुनें।';
    if (!petrolClosingMeter.trim() || !dieselClosingMeter.trim()) {
      return 'सबमिट करने के लिए कृपया पेट्रोल और डीजल की क्लोजिंग मीटर रीडिंग भरें।';
    }
    const pOp = parseFloat(petrolOpeningMeter) || 0;
    const pCl = parseFloat(petrolClosingMeter) || 0;
    const dOp = parseFloat(dieselOpeningMeter) || 0;
    const dCl = parseFloat(dieselClosingMeter) || 0;
    if (pCl < pOp) return 'पेट्रोल क्लोजिंग मीटर ओपनिंग मीटर से कम नहीं हो सकता।';
    if (dCl < dOp) return 'डीजल क्लोजिंग मीटर ओपनिंग मीटर से कम नहीं हो सकता।';
    if (pNetSold > 0 && (!petrolRate || parseFloat(petrolRate) <= 0)) {
      return 'कृपया पेट्रोल का रेट (₹/L) दर्ज करें।';
    }
    if (dNetSold > 0 && (!dieselRate || parseFloat(dieselRate) <= 0)) {
      return 'कृपया डीजल का रेट (₹/L) दर्ज करें।';
    }
    if (cashNotesAmt > 0 && !isCashMatched) return 'कृपया कैश नोटों की गड्डी का विवरण मैच करें।';
    if (udhariAmt > 0 && !isUdhariMatched) return 'कृपया उधारी ग्राहक और राशि का मिलान करें।';
    if (expenseAmt > 0 && !isExpenseMatched) return 'कृपया खर्चे का विवरण और राशि का मिलान करें।';

    if (totalLitersSold > 0 || totalExpectedAmount > 0) {
      const expRs = Math.floor(totalExpectedAmount);
      const colRs = Math.floor(totalCollection);
      const expRound = Math.round(totalExpectedAmount);
      const colRound = Math.round(totalCollection);
      const matched = (expRs === colRs) || (expRound === colRound);
      if (!matched) {
        const diff = expRs - colRs;
        if (diff > 0) {
          return `⚠️ अपेक्षित राशि (₹${expRs}) और कुल वसूली (₹${colRs}) मैच नहीं हैं। ₹${diff} की कमी है। हिसाब बराबर होने पर ही Submit बटन खुलेगा।`;
        } else {
          return `⚠️ अपेक्षित राशि (₹${expRs}) और कुल वसूली (₹${colRs}) मैच नहीं हैं। ₹${Math.abs(diff)} अधिक है। हिसाब बराबर होने पर ही Submit बटन खुलेगा।`;
        }
      }
    }
    return 'सबमिट करने के लिए कृपया सभी आवश्यक फ़ील्ड (मीटर रीडिंग व भुगतान) भरें।';
  };

  // Helper to build consistent payload for DB submission and PDF generation
  const buildCurrentData = () => {
    const selectedStaffObj = effectiveSalesmen.find(s => s.id === selectedSalesman);
    const staffName = selectedStaffObj ? selectedStaffObj.name : 'Staff';
    const machineName = selectedMachineData?.name || selectedMachine;

    // Filter filled digital modes
    const activeDigitalModes = digitalEntries.filter(e => parseFloat(e.amount) > 0);
    const getModeSum = (mId) => activeDigitalModes.filter(e => e.modeId === mId).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const customSum = activeDigitalModes.filter(e => e.isCustom).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    const validNewUdhari = udhariBreakdownData.filter(e => (e.name || '').trim() && parseFloat(e.amount) > 0);
    const validReturns = udhariReturnEntries.filter(e => parseFloat(e.amountReturned) > 0);
    const returnTotal = calculateReturnTotal();

    const dbPayload = {
      machineId: selectedMachine,
      machineName,
      salesmanId: selectedSalesman,
      salesmanName: staffName,
      
      // Petrol is ALWAYS mapped to Tank 1
      petrolEntry: {
        nozzleId: currentPetrolNozzleId,
        openingMeterReading: petrolOpeningMeter.trim(),
        closingMeterReading: petrolClosingMeter.trim(),
        testingQuantity: pTesting,
        fuelRate: pRateVal,
        totalQuantitySold: pNetSold,
        expectedAmount: pExpected,
        tankId: 'Tank-1'
      },

      // Diesel is ALWAYS mapped to Tank 2
      dieselEntry: {
        nozzleId: currentDieselNozzleId,
        openingMeterReading: dieselOpeningMeter.trim(),
        closingMeterReading: dieselClosingMeter.trim(),
        testingQuantity: dTesting,
        fuelRate: dRateVal,
        totalQuantitySold: dNetSold,
        expectedAmount: dExpected,
        tankId: 'Tank-2'
      },

      cashAmount: cashAmt,
      cashNotesAmount: cashNotesAmt,
      coinsAmount: coinsAmt,
      cashBreakdown: cashAmt > 0 ? breakdownData : null,

      // Multi-Mode Digital Payments
      onlineAmount: digitalAmt,
      digitalPaymentsBreakdown: activeDigitalModes,
      paytmAmount: getModeSum('paytm'),
      phonePeAmount: getModeSum('phonepe'),
      atmAmount: getModeSum('atm'),
      extraPowerAmount: getModeSum('extrapower'),
      extraRewardAmount: getModeSum('extrareward'),
      debitCardAmount: getModeSum('debit_card'),
      creditCardAmount: getModeSum('credit_card'),
      offerAmount: getModeSum('offer'),
      bharatPeAmount: getModeSum('bharatpe'),
      customDigitalAmount: customSum,

      udhariAmount: udhariAmt,
      udhariBreakdown: udhariAmt > 0 ? udhariBreakdownData : null,
      udhariReturnAmount: returnTotal,
      udhariReturnDetails: validReturns.map(e => ({
        docId: e.docId,
        customerName: e.customerName,
        amountReturned: parseFloat(e.amountReturned)
      })),
      expenses: expenseAmt,
      expenseBreakdown: expenseAmt > 0 ? expenseBreakdownData : null,
      totalPayment: totalCollection,
      shortageOrExcess,
      entryDate: new Date()
    };

    const pdfPayload = {
      staffName,
      machineName,
      petrolNozzleId: currentPetrolNozzleId,
      dieselNozzleId: currentDieselNozzleId,
      petrolOpening: petrolOpeningMeter.trim(),
      petrolClosing: petrolClosingMeter.trim(),
      petrolTesting: pTesting,
      petrolNetSold: pNetSold,
      petrolRate: pRateVal,
      petrolExpected: pExpected,
      dieselOpening: dieselOpeningMeter.trim(),
      dieselClosing: dieselClosingMeter.trim(),
      dieselTesting: dTesting,
      dieselNetSold: dNetSold,
      dieselRate: dRateVal,
      dieselExpected: dExpected,
      totalLitersSold,
      totalExpectedAmount,
      cashAmt,
      cashNotesAmt,
      coinsAmt,
      digitalAmt,
      digitalEntries: activeDigitalModes,
      udhariAmt,
      udhariBreakdown: udhariAmt > 0 ? udhariBreakdownData : [],
      expenseAmt,
      expenseBreakdown: expenseAmt > 0 ? expenseBreakdownData : [],
      totalCollection,
      shortageOrExcess,
      udhariReturnTotal: returnTotal,
      udhariReturnEntries: validReturns,
      entryDate: new Date()
    };

    return { staffName, machineName, dbPayload, pdfPayload, activeDigitalModes, validNewUdhari, validReturns, returnTotal };
  };

  const resetFormAfterSubmit = (closingP, closingD) => {
    setPetrolOpeningMeter(closingP || petrolClosingMeter.trim());
    setDieselOpeningMeter(closingD || dieselClosingMeter.trim());
    setPetrolClosingMeter('');
    setDieselClosingMeter('');
    setPetrolTestingQty('5');
    setDieselTestingQty('5');
    setPetrolRate('');
    setDieselRate('');
    setPetrolAutoLoaded(true);
    setDieselAutoLoaded(true);

    setIsEditMode(false);
    setExistingReportId(null);
    setExistingReportData(null);
    setIsFormClearedForFreshFill(false);

    setCash('');
    setCoins('');
    setOnline('');
    setUdhari('');
    setExpense('');
    setIsCashMatched(false);
    setIsUdhariMatched(false);
    setIsExpenseMatched(false);
    setBreakdownData({
      notes2000: '', notes500: '', notes200: '', notes100: '', notes50: '', notes20: '', notes10: '',
      coins20: '', coins10: '', coins5: '', coins2: '', coins1: ''
    });
    setDigitalEntries([
      { id: 'init_paytm', modeId: 'paytm', name: 'Paytm (पेटीएम)', amount: '' },
      { id: 'init_phonepe', modeId: 'phonepe', name: 'PhonePe (फोनपे)', amount: '' },
      { id: 'init_atm', modeId: 'atm', name: 'ATM / POS स्वाइप', amount: '' }
    ]);
    setUdhariBreakdownData([{ id: Date.now().toString(), name: '', amount: '' }]);
    setUdhariReturnEntries([]);
    setExpenseBreakdownData([{ id: Date.now().toString(), type: 'general', reason: '', amount: '', salesmanId: '', salesmanName: '' }]);
  };

  // Form Submit Handler (Normal or triggers OTP modal if in Edit Mode)
  const handleSubmit = async () => {
    if (!selectedSalesman) {
      Alert.alert('आवश्यक (Required)', 'कृपया अपना नाम (Staff Name) चुनें.');
      return;
    }
    if (!selectedMachine) {
      Alert.alert('आवश्यक (Required)', 'कृपया मशीन (Machine) चुनें.');
      return;
    }

    // Meters Validation
    if (!petrolOpeningMeter || isNaN(parseFloat(petrolOpeningMeter))) {
      Alert.alert('पेट्रोल मीटर त्रुटि', 'कृपया पेट्रोल ओपनिंग मीटर दर्ज करें.');
      return;
    }
    if (!petrolClosingMeter || isNaN(parseFloat(petrolClosingMeter))) {
      Alert.alert('पेट्रोल मीटर त्रुटि', 'कृपया पेट्रोल क्लोजिंग मीटर दर्ज करें.');
      return;
    }
    if (pClosing < pOpening) {
      Alert.alert('मीटर त्रुटि', 'पेट्रोल क्लोजिंग मीटर ओपनिंग मीटर से कम नहीं हो सकता.');
      return;
    }

    if (!dieselOpeningMeter || isNaN(parseFloat(dieselOpeningMeter))) {
      Alert.alert('डीजल मीटर त्रुटि', 'कृपया डीजल ओपनिंग मीटर दर्ज करें.');
      return;
    }
    if (!dieselClosingMeter || isNaN(parseFloat(dieselClosingMeter))) {
      Alert.alert('डीजल मीटर त्रुटि', 'कृपया डीजल क्लोजिंग मीटर दर्ज करें.');
      return;
    }
    if (dClosing < dOpening) {
      Alert.alert('मीटर त्रुटि', 'डीजल क्लोजिंग मीटर ओपनिंग मीटर से कम नहीं हो सकता.');
      return;
    }

    if (pNetSold > 0 && (!petrolRate || parseFloat(petrolRate) <= 0)) {
      Alert.alert('रेट आवश्यक', 'कृपया पेट्रोल का रेट (₹/L) दर्ज करें.');
      return;
    }
    if (dNetSold > 0 && (!dieselRate || parseFloat(dieselRate) <= 0)) {
      Alert.alert('रेट आवश्यक', 'कृपया डीजल का रेट (₹/L) दर्ज करें.');
      return;
    }

    if (cashNotesAmt > 0 && !isCashMatched) {
      Alert.alert('विवरण आवश्यक', 'कृपया कैश नोटों की गड्डी का विवरण मैच करें.');
      return;
    }
    if (udhariAmt > 0 && !isUdhariMatched) {
      Alert.alert('विवरण आवश्यक', 'कृपया उधारी ग्राहक और राशि मैच करें.');
      return;
    }
    // Strict Rupee Match Check before submitting
    if (totalLitersSold > 0 || totalExpectedAmount > 0) {
      const expRs = Math.floor(totalExpectedAmount);
      const colRs = Math.floor(totalCollection);
      const expRound = Math.round(totalExpectedAmount);
      const colRound = Math.round(totalCollection);
      if (expRs !== colRs && expRound !== colRound) {
        Alert.alert(
          'हिसाब मैच नहीं है',
          `अपेक्षित कुल राशि: ₹${expRs}\nकुल वसूली: ₹${colRs}\n\nकृपया वसूली और अपेक्षित राशि को बराबर (मैच) करें।`
        );
        return;
      }
    }

    // Safety check: Is there ALREADY an entry submitted today for this machine or staff?
    // Whether in edit mode, or if user chose "शुरू से भरें", or re-entered after submit:
    let targetReportId = existingReportId;
    if (!targetReportId && selectedSalesman && selectedMachine) {
      try {
        const found = await findTodayEntry(selectedSalesman, selectedMachine);
        if (found) {
          targetReportId = found.id;
          setExistingReportId(found.id);
        }
      } catch (err) {
        console.warn('Check today entry in handleSubmit failed:', err);
      }
    }

    // If an entry already exists for today -> Admin OTP is strictly required!
    if (targetReportId || isEditMode) {
      setSubmitting(true);
      try {
        const { staffName, machineName } = buildCurrentData();
        const req = await createEditRequest(staffName, selectedSalesman, selectedMachine, machineName, targetReportId || existingReportId);
        setEditRequestId(req.requestId);
        setExistingReportId(targetReportId || existingReportId);
        setIsEditMode(true);
        setOtpInput('');
        setOtpModalVisible(true);
        Alert.alert(
          '🔐 Admin OTP आवश्यक है',
          'इस मशीन पर आज का हिसाब पहले से दर्ज हो चुका है। डेटा को फिर से सबमिट करने या नया हिसाब दर्ज करने के लिए Admin Dashboard से 6-digit OTP लेना अनिवार्य है।'
        );
      } catch (err) {
        console.error('Create edit request error:', err);
        Alert.alert('त्रुटि', 'OTP अनुरोध बनाने में विफलता: ' + (err.message || ''));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Normal submission (No edit, fresh daily entry)
    setSubmitting(true);
    try {
      const { staffName, machineName, dbPayload, pdfPayload, activeDigitalModes, validNewUdhari, validReturns, returnTotal } = buildCurrentData();

      const submitRes = await submitDailyEntry(dbPayload);
      const reportId = submitRes?.id;

      // Cache that testing was completed today on this machine
      const todayKey = new Date().toISOString().split('T')[0];
      if (pTesting > 0 || dTesting > 0) {
        await AsyncStorage.setItem(`@testing_done_${selectedMachine}_${todayKey}`, 'true').catch(() => null);
      }

      // Save new udhari records to udhari_records collection
      if (validNewUdhari.length > 0) {
        await saveNewUdhariRecords(validNewUdhari, selectedSalesman, staffName, selectedMachine);
      }

      // Process udhari returns (update remaining amounts, mark fully paid)
      if (validReturns.length > 0) {
        await processUdhariReturns(validReturns, staffName);
      }

      // Save salary advance records to staff_salary_advances collection
      const validSalaryAdvances = expenseBreakdownData
        .filter(e => e.type === 'salary' && parseFloat(e.amount) > 0)
        .map(e => ({
          salesmanId: e.salesmanId || selectedSalesman,
          salesmanName: e.salesmanName || staffName,
          amount: parseFloat(e.amount),
          notes: e.reason || 'वेतन / एडवांस'
        }));
      if (validSalaryAdvances.length > 0) {
        await recordStaffSalaryAdvances(validSalaryAdvances, reportId, selectedMachine, machineName);
      }

      const savedClosingP = petrolClosingMeter.trim();
      const savedClosingD = dieselClosingMeter.trim();

      // Immediately generate & download/share the PDF receipt right after DB save!
      await generateAndSharePdf(pdfPayload);

      // Reset the form
      resetFormAfterSubmit(savedClosingP, savedClosingD);

      Alert.alert(
        'सफलतापूर्वक दर्ज हुआ! ✅',
        `स्टाफ: ${staffName}\nमशीन: ${machineName}\n\nडेटाबेस में बिक्री सुरक्षित दर्ज हो गई और PDF रसीद डाउनलोड/शेयर के लिए तैयार हो गई है.`
      );
    } catch (err) {
      console.error(err);
      Alert.alert('सबमिट त्रुटि', err.message || 'सबमिट करने में त्रुटि आई.');
    } finally {
      setSubmitting(false);
    }
  };

  // Verifies the Admin OTP and updates the existing entry in Firestore
  const handleVerifyAndSubmitEdit = async () => {
    if (!otpInput || otpInput.trim().length !== 6) {
      Alert.alert('अमान्य OTP', 'कृपया 6 अंकों का सही OTP दर्ज करें.');
      return;
    }

    setOtpVerifying(true);
    try {
      const verifyRes = await verifyEditOtp(editRequestId, otpInput.trim());
      if (!verifyRes.success) {
        Alert.alert('OTP सत्यापन विफल ❌', verifyRes.message);
        setOtpVerifying(false);
        return;
      }

      // OTP Verified successfully -> Update entry in Firestore
      const { staffName, machineName, dbPayload, pdfPayload, validNewUdhari, validReturns } = buildCurrentData();

      await updateDailyEntry(existingReportId, dbPayload);

      // Save new udhari records if any
      if (validNewUdhari.length > 0) {
        await saveNewUdhariRecords(validNewUdhari, selectedSalesman, staffName, selectedMachine);
      }

      // Process udhari returns if any
      if (validReturns.length > 0) {
        await processUdhariReturns(validReturns, staffName);
      }

      // Save salary advance records to staff_salary_advances collection
      const validSalaryAdvances = expenseBreakdownData
        .filter(e => e.type === 'salary' && parseFloat(e.amount) > 0)
        .map(e => ({
          salesmanId: e.salesmanId || selectedSalesman,
          salesmanName: e.salesmanName || staffName,
          amount: parseFloat(e.amount),
          notes: e.reason || 'वेतन / एडवांस'
        }));
      if (validSalaryAdvances.length > 0) {
        await recordStaffSalaryAdvances(validSalaryAdvances, existingReportId, selectedMachine, machineName);
      }

      const savedClosingP = petrolClosingMeter.trim();
      const savedClosingD = dieselClosingMeter.trim();

      setOtpModalVisible(false);
      setOtpInput('');

      // Immediately generate & download/share the updated PDF receipt right after DB update!
      await generateAndSharePdf(pdfPayload);

      // Reset the form
      resetFormAfterSubmit(savedClosingP, savedClosingD);

      Alert.alert(
        'सफलतापूर्वक संशोधित! ✅',
        `Admin OTP सत्यापित हुआ। डेटाबेस में संशोधित बिक्री अपडेट हो गई और PDF रसीद तैयार हो गई है.`
      );
    } catch (err) {
      console.error('Edit submit error:', err);
      Alert.alert('एडिट त्रुटि', err.message || 'एंट्री अपडेट करने में त्रुटि आई.');
    } finally {
      setOtpVerifying(false);
    }
  };

  // Direct PDF Download / Share button handler
  const handleGeneratePdfDirect = async () => {
    if (!selectedMachine) {
      Alert.alert('मशीन चुनें', 'PDF रसीद बनाने के लिए कृपया पहले मशीन चुनें.');
      return;
    }
    const { pdfPayload } = buildCurrentData();
    await generateAndSharePdf(pdfPayload);
  };

  const renderBreakdownInput = (key, label) => (
    <View style={styles.breakdownInputWrapper} key={key}>
      <Text style={styles.breakdownInputLabel}>{label}</Text>
      <View style={{flexDirection: 'row', alignItems: 'center'}}>
        <Text style={{marginRight: 5, color: '#555', fontWeight: 'bold'}}>x</Text>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Header Banner */}
          <View style={styles.header}>
            <View style={styles.headerIconWrapper}>
              <Icon name="hardware-chip" size={26} color="#fff" />
            </View>
            <View style={{flex: 1, marginLeft: 12}}>
              <Text style={styles.title}>शाम की दैनिक बिक्री एंट्री</Text>
              <Text style={styles.subtitle}>1 Staff • 1 Machine (Petrol Tank 1 & Diesel Tank 2)</Text>
            </View>
          </View>

          {/* 1. Selection Section */}
          <View style={styles.formCard}>
            <Text style={styles.label}>1. अपना नाम चुनें (Select Staff Name) *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedSalesman}
                onValueChange={(val) => {
                  setSelectedSalesman(val);
                  if (val && selectedMachine) {
                    checkEditModeForStaffAndMachine(val, selectedMachine);
                  }
                }}
                style={styles.picker}
              >
                <Picker.Item label="-- स्टाफ का नाम चुनें --" value="" color="#888" />
                {effectiveSalesmen.map(s => (
                  <Picker.Item key={s.id} label={`👤 ${s.name}`} value={s.id} />
                ))}
              </Picker>
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>2. अपनी मशीन चुनें (Select Machine) *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedMachine}
                onValueChange={handleMachineChange}
                style={styles.picker}
              >
                <Picker.Item label="-- डिस्पेंसर मशीन चुनें --" value="" color="#888" />
                {effectiveMachines.map(m => {
                  const match = String(m.name || m.id || '').match(/\d+/);
                  const num = match ? parseInt(match[0], 10) : 1;
                  const pNz = m.petrolNozzle || `N${(num - 1) * 2 + 1}`;
                  const dNz = m.dieselNozzle || `N${(num - 1) * 2 + 2}`;
                  const displayName = m.name || m.id;
                  return (
                    <Picker.Item 
                      key={m.id} 
                      label={`⛽ ${displayName} (${pNz} Petrol • ${dNz} Diesel)`} 
                      value={m.id} 
                    />
                  );
                })}
              </Picker>
            </View>
          </View>

          {/* Edit Mode Notice Banner */}
          {isEditMode && (
            <View style={styles.editModeBanner}>
              <View style={styles.editModeHeader}>
                <View style={styles.editModeIconWrap}>
                  <Icon name="create-outline" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.editModeTitle}>
                    {isFormClearedForFreshFill ? '📝 आज का हिसाब दर्ज है (शुरू से भरें)' : '⚠️ एडिट मोड सक्रिय (Edit Mode Active)'}
                  </Text>
                  <Text style={styles.editModeSub}>
                    {isFormClearedForFreshFill 
                      ? 'फ़ॉर्म खाली है। आप शुरू से नया डेटा भर सकते हैं। सबमिट करने पर Admin OTP लगेगा।'
                      : 'आज की पूर्व-दर्ज बिक्री लोड हो गई है। आप इसमें बदलाव कर सकते हैं या फ़ॉर्म खाली कर शुरू से भर सकते हैं।'}
                  </Text>
                </View>
              </View>

              <View style={styles.editModeNoticeBox}>
                <Icon name="shield-checkmark" size={16} color="#B45309" />
                <Text style={styles.editModeNoticeText}>
                  सुरक्षा नियम: आज का हिसाब पहले से दर्ज है। चाहे आप एडिट करें या शुरू से भरें, सबमिट करने पर Admin Dashboard पर 6-digit OTP जाएगा और OTP अनिवार्य होगा।
                </Text>
              </View>

              {isFormClearedForFreshFill ? (
                <TouchableOpacity style={styles.restoreEditBtn} onPress={handleRestoreExistingData}>
                  <Icon name="refresh-circle-outline" size={18} color="#003C8F" />
                  <Text style={styles.restoreEditBtnText}>🔄 पिछला भरा डेटा पुनः लोड करें</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.cancelEditBtn} onPress={handleStartFresh}>
                  <Icon name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.cancelEditBtnText}>🧹 फ़ॉर्म खाली करें (शुरू से भरें)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {selectedMachine !== '' && (
            <>
              {/* LIVE MACHINE SUMMARY RECEIPT */}
              <View style={styles.receiptCard}>
                <View style={styles.receiptTopRow}>
                  <Text style={styles.receiptHeader}>📊 मशीन लाइव हिसाब (Live Summary)</Text>
                  <View style={styles.machineBadge}>
                    <Text style={styles.machineBadgeText}>{selectedMachineData?.name || selectedMachine}</Text>
                  </View>
                </View>

                {/* Petrol Row */}
                <View style={styles.receiptFuelRow}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <View style={[styles.fuelDot, { backgroundColor: '#FF6F00' }]} />
                    <Text style={styles.fuelLabel}>पेट्रोल ({currentPetrolNozzleId} ➔ Tank 1):</Text>
                  </View>
                  <Text style={styles.fuelValueText}>
                    {pNetSold.toFixed(4)} L  •  <Text style={{color: '#003C8F'}}>₹{pExpected.toFixed(2)}</Text>
                  </Text>
                </View>

                {/* Diesel Row */}
                <View style={styles.receiptFuelRow}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <View style={[styles.fuelDot, { backgroundColor: '#0284C7' }]} />
                    <Text style={styles.fuelLabel}>डीजल ({currentDieselNozzleId} ➔ Tank 2):</Text>
                  </View>
                  <Text style={styles.fuelValueText}>
                    {dNetSold.toFixed(4)} L  •  <Text style={{color: '#003C8F'}}>₹{dExpected.toFixed(2)}</Text>
                  </Text>
                </View>

                <View style={styles.receiptDivider} />

                {/* Total Net Sold */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMainLabel}>कुल ईंधन बिक्री (Total Fuel Sold):</Text>
                  <Text style={styles.receiptMainValue}>{totalLitersSold.toFixed(4)} L</Text>
                </View>

                {/* Total Expected Amount */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMainLabel}>अपेक्षित कुल राशि (Expected Total):</Text>
                  <Text style={[styles.receiptMainValue, { color: '#003C8F', fontSize: 18 }]}>₹{totalExpectedAmount.toFixed(2)}</Text>
                </View>

                {/* Total Collected */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMainLabel}>कुल वसूली (Total Collection):</Text>
                  <Text style={[styles.receiptMainValue, { color: '#16A34A', fontSize: 18 }]}>₹{totalCollection.toFixed(2)}</Text>
                </View>

                {/* Shortage or Excess Badge */}
                <View style={[styles.shortageBox, { backgroundColor: isShortage ? '#FEF2F2' : '#F0FDF4', borderColor: isShortage ? '#F87171' : '#86EFAC' }]}>
                  <Icon name={isShortage ? "alert-circle" : "checkmark-circle"} size={22} color={isShortage ? '#DC2626' : '#16A34A'} />
                  <Text style={[styles.shortageText, { color: isShortage ? '#DC2626' : '#15803D' }]}>
                    {isShortage ? 'कमी (SHORTAGE)' : 'अतिरिक्त (EXCESS)'}: ₹{Math.abs(shortageOrExcess).toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* SECTION A: NOZZLE 1 (PETROL -> TANK 1) */}
              <View style={[styles.sectionCard, { borderLeftColor: '#FF6F00', borderLeftWidth: 5 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Icon name="color-filter" size={20} color="#FF6F00" style={{marginRight: 6}} />
                    <Text style={[styles.sectionTitle, { color: '#FF6F00' }]}>नोज़ल {currentPetrolNozzleId}: पेट्रोल ➔ Tank 1</Text>
                  </View>
                </View>

                {/* Petrol Opening Meter */}
                <CustomInput 
                  label="पेट्रोल ओपनिंग मीटर रीडिंग (Opening Meter) *" 
                  keyboardType="numeric" 
                  value={petrolOpeningMeter} 
                  onChangeText={(t) => setPetrolOpeningMeter(sanitizeDecimalInput(t))} 
                  leftIcon="speedometer-outline" 
                  placeholder="1933.9489"
                />

                {/* Petrol Closing Meter */}
                <View style={{ marginTop: 10 }}>
                  <CustomInput 
                    label="शाम का पेट्रोल क्लोजिंग मीटर (Closing Meter) *" 
                    keyboardType="numeric" 
                    value={petrolClosingMeter} 
                    onChangeText={(t) => setPetrolClosingMeter(sanitizeDecimalInput(t))} 
                    leftIcon="keypad-outline" 
                    placeholder="1955.0000"
                  />
                </View>

                {/* Testing Liters & Rate (Always open and editable) */}
                <View style={styles.twoColumnRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <CustomInput 
                      label="जांच तेल (Testing L)" 
                      keyboardType="numeric" 
                      value={petrolTestingQty} 
                      onChangeText={(t) => setPetrolTestingQty(sanitizeDecimalInput(t))} 
                      leftIcon="flask-outline" 
                      placeholder="उदा. 5 या 10"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <CustomInput 
                      label="पेट्रोल रेट (₹/L) *" 
                      keyboardType="numeric" 
                      value={petrolRate} 
                      onChangeText={(t) => setPetrolRate(sanitizeDecimalInput(t))} 
                      leftIcon="pricetag-outline" 
                      placeholder="उदा. 96.72"
                    />
                  </View>
                </View>

                {/* Information badge if testing was already recorded today */}
                {petrolTestingAlreadyDone && (
                  <View style={styles.testingDoneNotice}>
                    <Icon name="information-circle-outline" size={16} color="#0284C7" />
                    <Text style={[styles.testingDoneText, { color: '#0369A1' }]}>
                      आज इस मशीन पर पहले टेस्टिंग दर्ज हो चुकी है (यदि पुनः टेस्टिंग हुई है तो मात्रा बदलें, अन्यथा 0 L रखें).
                    </Text>
                  </View>
                )}

                {/* Return to Tank Notice */}
                <View style={styles.tankReturnNotice}>
                  <Icon name="arrow-undo-circle" size={16} color="#0369A1" />
                  <Text style={styles.tankReturnText}>
                    {pTesting > 0 ? `${pTesting} L टेस्टिंग का तेल वापस Tank 1 (पेट्रोल) में जुड़ जाएगा.` : 'कोई टेस्टिंग तेल नहीं (0 L).'}
                  </Text>
                </View>

                {/* Petrol Sold Preview */}
                <View style={styles.previewBox}>
                  <Text style={styles.previewText}>
                    पेट्रोल शुद्ध बिक्री: <Text style={{fontWeight: 'bold'}}>{pNetSold.toFixed(4)} L</Text>  |  अपेक्षित: <Text style={{fontWeight: 'bold', color: '#003C8F'}}>₹{pExpected.toFixed(2)}</Text>
                  </Text>
                </View>
              </View>

              {/* SECTION B: NOZZLE 2 (DIESEL -> TANK 2) */}
              <View style={[styles.sectionCard, { borderLeftColor: '#0284C7', borderLeftWidth: 5, marginTop: 14 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Icon name="water" size={20} color="#0284C7" style={{marginRight: 6}} />
                    <Text style={[styles.sectionTitle, { color: '#0284C7' }]}>नोज़ल {currentDieselNozzleId}: डीजल ➔ Tank 2</Text>
                  </View>
                </View>

                {/* Diesel Opening Meter */}
                <CustomInput 
                  label="डीजल ओपनिंग मीटर रीडिंग (Opening Meter) *" 
                  keyboardType="numeric" 
                  value={dieselOpeningMeter} 
                  onChangeText={(t) => setDieselOpeningMeter(sanitizeDecimalInput(t))} 
                  leftIcon="speedometer-outline" 
                  placeholder="2450.1234"
                />

                {/* Diesel Closing Meter */}
                <View style={{ marginTop: 10 }}>
                  <CustomInput 
                    label="शाम का डीजल क्लोजिंग मीटर (Closing Meter) *" 
                    keyboardType="numeric" 
                    value={dieselClosingMeter} 
                    onChangeText={(t) => setDieselClosingMeter(sanitizeDecimalInput(t))} 
                    leftIcon="keypad-outline" 
                    placeholder="2510.0000"
                  />
                </View>

                {/* Testing Liters & Rate (Always open and editable) */}
                <View style={styles.twoColumnRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <CustomInput 
                      label="जांच तेल (Testing L)" 
                      keyboardType="numeric" 
                      value={dieselTestingQty} 
                      onChangeText={(t) => setDieselTestingQty(sanitizeDecimalInput(t))} 
                      leftIcon="flask-outline" 
                      placeholder="उदा. 5 या 10"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <CustomInput 
                      label="डीजल रेट (₹/L) *" 
                      keyboardType="numeric" 
                      value={dieselRate} 
                      onChangeText={(t) => setDieselRate(sanitizeDecimalInput(t))} 
                      leftIcon="pricetag-outline" 
                      placeholder="उदा. 89.62"
                    />
                  </View>
                </View>

                {/* Information badge if testing was already recorded today */}
                {dieselTestingAlreadyDone && (
                  <View style={styles.testingDoneNotice}>
                    <Icon name="information-circle-outline" size={16} color="#0284C7" />
                    <Text style={[styles.testingDoneText, { color: '#0369A1' }]}>
                      आज इस मशीन पर पहले टेस्टिंग दर्ज हो चुकी है (यदि पुनः टेस्टिंग हुई है तो मात्रा बदलें, अन्यथा 0 L रखें).
                    </Text>
                  </View>
                )}

                {/* Return to Tank Notice */}
                <View style={styles.tankReturnNotice}>
                  <Icon name="arrow-undo-circle" size={16} color="#0369A1" />
                  <Text style={styles.tankReturnText}>
                    {dTesting > 0 ? `${dTesting} L टेस्टिंग का तेल वापस Tank 2 (डीजल) में जुड़ जाएगा.` : 'कोई टेस्टिंग तेल नहीं (0 L).'}
                  </Text>
                </View>

                {/* Diesel Sold Preview */}
                <View style={styles.previewBox}>
                  <Text style={styles.previewText}>
                    डीजल शुद्ध बिक्री: <Text style={{fontWeight: 'bold'}}>{dNetSold.toFixed(4)} L</Text>  |  अपेक्षित: <Text style={{fontWeight: 'bold', color: '#003C8F'}}>₹{dExpected.toFixed(2)}</Text>
                  </Text>
                </View>
              </View>

              {/* SECTION C: COMBINED PAYMENT COLLECTIONS */}
              <View style={[styles.sectionCard, { marginTop: 14 }]}>
                <View style={styles.sectionHeader}>
                  <Icon name="wallet" size={20} color="#003C8F" />
                  <Text style={styles.sectionTitle}>मशीन वसूली विवरण (Payments Collected)</Text>
                </View>

                {/* 1. Cash & Coins */}
                <View style={{marginBottom: 16}}>
                  <Text style={styles.inputLabelCustom}>1. कैश संग्रह (Cash & Coins Collected ₹)</Text>
                  
                  <View style={styles.cashInputsRow}>
                    <View style={{flex: 1.15}}>
                      <CustomInput 
                        label="कैश नोट (Notes ₹)" 
                        keyboardType="numeric" 
                        value={cash} 
                        onChangeText={(t) => setCash(sanitizeDecimalInput(t))} 
                        leftIcon="cash-outline" 
                        placeholder="0"
                        style={{marginBottom: 0}}
                      />
                    </View>
                    <View style={{flex: 1}}>
                      <CustomInput 
                        label="सिक्का (₹)" 
                        keyboardType="numeric" 
                        value={coins} 
                        onChangeText={(t) => setCoins(sanitizeDecimalInput(t))} 
                        leftIcon="disc-outline" 
                        placeholder="0"
                        style={{marginBottom: 0}}
                      />
                    </View>
                  </View>

                  {/* Real-time Cash Total Pill Bar */}
                  {(cashNotesAmt > 0 || coinsAmt > 0) && (
                    <View style={styles.cashTotalBar}>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Icon name="wallet" size={15} color="#003C8F" />
                        <Text style={styles.cashTotalBarLabel}>कुल कैश (नोट + सिक्का):</Text>
                      </View>
                      <Text style={styles.cashTotalBarValue}>₹{cashAmt.toFixed(2)}</Text>
                    </View>
                  )}

                  {cashNotesAmt > 0 && (
                    <TouchableOpacity 
                      style={[styles.breakdownBtn, isCashMatched ? styles.btnSuccess : styles.btnWarning, {marginTop: 8}]} 
                      onPress={() => setCashBreakdownVisible(true)}
                    >
                      <Icon name={isCashMatched ? "checkmark-circle" : "alert-circle"} size={16} color="#fff" />
                      <Text style={styles.breakdownBtnText}>
                        {isCashMatched 
                          ? `कैश नोट मैच हुआ (₹${cashNotesAmt} Matched)` 
                          : `कैश नोट विवरण भरें (₹${cashNotesAmt} Match Notes)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 2. Multi-Mode Digital / ATM / Online / Fleet Cards */}
                <View style={{marginBottom: 16}}>
                  <Text style={styles.inputLabelCustom}>2. डिजिटल, कार्ड व ऑनलाइन संग्रह (Digital / ATM / Cards ₹)</Text>
                  <View style={styles.digitalCardBox}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                      <Text style={styles.digitalCardTotalText}>
                        कुल डिजिटल: <Text style={{color: '#003C8F', fontWeight: '900'}}>₹{digitalAmt.toFixed(2)}</Text>
                      </Text>
                      <TouchableOpacity 
                        style={styles.openDigitalBtn}
                        onPress={() => setDigitalModalVisible(true)}
                      >
                        <Icon name="options-outline" size={15} color="#fff" style={{marginRight: 4}} />
                        <Text style={styles.openDigitalBtnText}>माध्यम चुनें / बदलें</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Active Digital Modes Chips Preview */}
                    <View style={styles.chipsContainer}>
                      {digitalEntries.filter(e => parseFloat(e.amount) > 0).length === 0 ? (
                        <Text style={styles.noChipsText}>
                          Paytm, PhonePe, ATM स्वाइप, ExtraPower आदि भरने के लिए ऊपर बटन दबाएं.
                        </Text>
                      ) : (
                        digitalEntries.filter(e => parseFloat(e.amount) > 0).map(item => (
                          <View key={item.id} style={styles.activeChip}>
                            <Text style={styles.activeChipText}>
                              {item.name}: <Text style={{fontWeight: 'bold'}}>₹{item.amount}</Text>
                            </Text>
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                </View>

                {/* 3A. उधारी (Khata ₹) */}
                <View style={{marginBottom: 16}}>
                  <CustomInput 
                    label="3A. उधारी (Khata ₹)" 
                    keyboardType="numeric" 
                    value={udhari} 
                    onChangeText={(t) => setUdhari(sanitizeDecimalInput(t))} 
                    leftIcon="book-outline" 
                    placeholder="0.00"
                  />
                  {udhariAmt > 0 && (
                    <TouchableOpacity 
                      style={[styles.breakdownBtn, isUdhariMatched ? styles.btnSuccess : styles.btnWarning]} 
                      onPress={() => setUdhariBreakdownVisible(true)}
                    >
                      <Icon name={isUdhariMatched ? "checkmark-circle" : "alert-circle"} size={16} color="#fff" />
                      <Text style={styles.breakdownBtnText}>
                        {isUdhariMatched ? 'उधारी विवरण मैच हुआ (Matched)' : 'ग्राहक-वार उधारी नाम भरें'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 3B. उधारी वापसी */}
                <View style={{marginBottom: 16}}>
                  <View style={styles.udhariReturnSection}>
                    <View style={styles.udhariReturnHeader}>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Icon name="arrow-undo-circle" size={18} color="#16A34A" style={{marginRight: 6}} />
                        <Text style={styles.udhariReturnTitle}>3B. उधारी वापसी</Text>
                      </View>
                      {pendingUdhariCustomers.length > 0 && (
                        <View style={styles.pendingCountBadge}>
                          <Text style={styles.pendingCountText}>{pendingUdhariCustomers.length} बकाया</Text>
                        </View>
                      )}
                    </View>

                    {pendingUdhariCustomers.length === 0 ? (
                      <View style={styles.noUdhariBox}>
                        <Icon name="checkmark-circle" size={18} color="#86EFAC" />
                        <Text style={styles.noUdhariText}>कोई बकाया उधारी नहीं है 🎉</Text>
                      </View>
                    ) : (
                      <>
                        {/* Dropdown to select customer */}
                        <Text style={styles.returnDropdownLabel}>बकाया ग्राहक चुनें (Select Pending Customer):</Text>
                        <View style={styles.returnPickerContainer}>
                          <Picker
                            selectedValue={selectedReturnCustomer}
                            onValueChange={handleSelectReturnCustomer}
                            style={styles.picker}
                          >
                            <Picker.Item label="-- ग्राहक चुनें --" value="" color="#888" />
                            {pendingUdhariCustomers
                              .filter(c => !udhariReturnEntries.find(e => e.docId === c.docId))
                              .map(c => (
                                <Picker.Item 
                                  key={c.docId} 
                                  label={`${c.customerName} — बकाया: ₹${c.remainingAmount.toFixed(0)}`} 
                                  value={c.docId} 
                                />
                              ))
                            }
                          </Picker>
                        </View>
                      </>
                    )}

                    {/* Selected Return Entries */}
                    {udhariReturnEntries.length > 0 && (
                      <View style={{marginTop: 10}}>
                        <Text style={styles.returnListLabel}>आज की वापसी सूची:</Text>
                        {udhariReturnEntries.map((entry) => {
                          const returnAmt = parseFloat(entry.amountReturned) || 0;
                          const isFullPay = returnAmt >= entry.totalDue - 0.01;
                          return (
                            <View key={entry.id} style={styles.returnEntryCard}>
                              <View style={styles.returnEntryTop}>
                                <View style={{flex: 1}}>
                                  <Text style={styles.returnCustomerName}>{entry.customerName}</Text>
                                  <Text style={styles.returnDueText}>बकाया: ₹{entry.totalDue.toFixed(0)}</Text>
                                </View>
                                <TouchableOpacity onPress={() => removeReturnEntry(entry.id)} style={styles.removeRowBtn}>
                                  <Icon name="close-circle" size={22} color="#DC2626" />
                                </TouchableOpacity>
                              </View>
                              <View style={styles.returnAmountRow}>
                                <CustomInput 
                                  placeholder="वापसी राशि (₹)" 
                                  keyboardType="numeric" 
                                  value={entry.amountReturned} 
                                  onChangeText={(t) => handleReturnAmountChange(entry.id, t)} 
                                  leftIcon="cash-outline"
                                  style={{marginBottom: 0, flex: 1}} 
                                  inputStyle={{padding: 8, height: 42}}
                                />
                                <TouchableOpacity 
                                  style={styles.fullPayBtn}
                                  onPress={() => handleReturnAmountChange(entry.id, String(entry.totalDue))}
                                >
                                  <Text style={styles.fullPayBtnText}>पूरा भरें</Text>
                                </TouchableOpacity>
                              </View>
                              {returnAmt > 0 && (
                                <View style={[
                                  styles.returnStatusBadge, 
                                  { backgroundColor: isFullPay ? '#F0FDF4' : '#FFFBEB', borderColor: isFullPay ? '#86EFAC' : '#FDE68A' }
                                ]}>
                                  <Icon 
                                    name={isFullPay ? "checkmark-circle" : "time"} 
                                    size={14} 
                                    color={isFullPay ? '#16A34A' : '#D97706'} 
                                  />
                                  <Text style={[
                                    styles.returnStatusText,
                                    { color: isFullPay ? '#15803D' : '#92400E' }
                                  ]}>
                                    {isFullPay 
                                      ? 'पूर्ण भुगतान ✓ (नाम हट जाएगा)' 
                                      : `आंशिक भुगतान — बाकी: ₹${(entry.totalDue - returnAmt).toFixed(0)}`
                                    }
                                  </Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                        <View style={styles.returnTotalBox}>
                          <Text style={styles.returnTotalText}>
                            कुल वापसी: <Text style={{color: '#16A34A', fontWeight: '900'}}>₹{calculateReturnTotal().toFixed(0)}</Text>
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                {/* 4. Expenses */}
                <View style={{marginBottom: 5}}>
                  <CustomInput 
                    label="4. दिन के खर्चे (Pump Expenses ₹)" 
                    keyboardType="numeric" 
                    value={expense} 
                    onChangeText={(t) => setExpense(sanitizeDecimalInput(t))} 
                    leftIcon="receipt-outline" 
                    placeholder="0.00"
                  />
                  {expenseAmt > 0 && (
                    <TouchableOpacity 
                      style={[styles.breakdownBtn, isExpenseMatched ? styles.btnSuccess : styles.btnWarning]} 
                      onPress={handleOpenExpenseModal}
                    >
                      <Icon name={isExpenseMatched ? "checkmark-circle" : "alert-circle"} size={16} color="#fff" />
                      <Text style={styles.breakdownBtnText}>
                        {isExpenseMatched ? 'खर्चा विवरण मैच हुआ (Matched)' : 'खर्च का कारण व विवरण भरें'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* PDF Preview / Share Button */}
              <TouchableOpacity 
                style={styles.pdfDirectBtn} 
                onPress={handleGeneratePdfDirect}
              >
                <Icon name="document-text" size={20} color="#003C8F" />
                <Text style={styles.pdfDirectBtnText}>📄 रसीद प्रिव्यू / PDF डाउनलोड करें</Text>
              </TouchableOpacity>

              {/* Incomplete Form Helper Hint */}
              {!isFormValid && (
                <View style={styles.incompleteFormBox}>
                  <Icon name="information-circle-outline" size={16} color="#B45309" />
                  <Text style={styles.incompleteFormText}>
                    {getIncompleteFormMessage()}
                  </Text>
                </View>
              )}

              {/* FINAL SUBMIT BUTTON */}
              <CustomButton 
                title="Submit" 
                onPress={handleSubmit} 
                loading={submitting} 
                disabled={!isFormValid}
                type={!isFormValid ? "secondary" : (isEditMode ? "warning" : "primary")}
                style={!isFormValid ? styles.submitBtnDisabled : styles.submitBtnActive}
              />
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* 1. Multi-Mode Digital & Cards Modal */}
      <Modal visible={digitalModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>डिजिटल, कार्ड व फ्लीट माध्यम</Text>
                <Text style={styles.modalSubTitle}>Paytm, PhonePe, ATM, ExtraPower, Cards</Text>
              </View>
              <TouchableOpacity onPress={() => setDigitalModalVisible(false)}>
                <Icon name="close-circle" size={26} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Add Presets Grid/Chips */}
            <Text style={styles.presetSectionLabel}>त्वरित जोड़ें (Tap to Add Mode):</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              {PRESET_PAYMENT_MODES.map(preset => (
                <TouchableOpacity 
                  key={preset.id} 
                  style={[styles.presetChip, { borderColor: preset.color }]}
                  onPress={() => addPresetPaymentMode(preset)}
                >
                  <Icon name={preset.icon} size={14} color={preset.color} style={{marginRight: 4}} />
                  <Text style={[styles.presetChipText, { color: preset.color }]}>+ {preset.name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity 
                style={[styles.presetChip, { borderColor: '#003C8F', backgroundColor: '#EFF6FF' }]}
                onPress={() => setCustomModeInputVisible(true)}
              >
                <Icon name="add" size={14} color="#003C8F" style={{marginRight: 2}} />
                <Text style={[styles.presetChipText, { color: '#003C8F', fontWeight: 'bold' }]}>कस्टम माध्यम</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Custom Mode Add Box */}
            {customModeInputVisible && (
              <View style={styles.customAddBox}>
                <TextInput 
                  placeholder="पेमेंट माध्यम का नाम (उदा. Cheque, HPCL)" 
                  value={customModeName} 
                  onChangeText={setCustomModeName} 
                  style={styles.customTextInput}
                />
                <TouchableOpacity style={styles.customAddBtn} onPress={addCustomPaymentMode}>
                  <Text style={styles.customAddBtnText}>जोड़ें</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Active Payment Inputs List */}
            <ScrollView style={{maxHeight: 280, marginTop: 10}} keyboardShouldPersistTaps="handled">
              {digitalEntries.map((item) => (
                <View key={item.id} style={styles.digitalInputRow}>
                  <View style={{flex: 1.8, marginRight: 8}}>
                    <Text style={styles.digitalRowLabel}>{item.name}</Text>
                  </View>
                  <View style={{flex: 1.5, marginRight: 8}}>
                    <CustomInput 
                      placeholder="0.00" 
                      keyboardType="numeric" 
                      value={item.amount} 
                      onChangeText={(t) => handleDigitalAmountChange(item.id, t)} 
                      leftIcon="cash-outline" 
                      style={{marginBottom: 0}}
                      inputStyle={{padding: 8, height: 42}}
                    />
                  </View>
                  {digitalEntries.length > 1 && (
                    <TouchableOpacity onPress={() => removeDigitalEntry(item.id)} style={styles.removeRowBtn}>
                      <Icon name="trash-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterText}>
                कुल डिजिटल संग्रह: <Text style={{color: '#003C8F', fontSize: 16}}>₹{calculateDigitalTotal().toFixed(2)}</Text>
              </Text>
              <CustomButton 
                title="पुष्टि करें एवं सहेजें (Confirm & Save)" 
                onPress={() => setDigitalModalVisible(false)} 
                type="primary"
                icon="checkmark-circle-outline"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Cash Breakdown Modal */}
      <Modal visible={cashBreakdownVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>कैश नोट एवं सिक्के (Cash Denominations)</Text>
              <TouchableOpacity onPress={() => setCashBreakdownVisible(false)}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{maxHeight: 340}}>
              {renderBreakdownInput('notes2000', '₹2000')}
              {renderBreakdownInput('notes500', '₹500')}
              {renderBreakdownInput('notes200', '₹200')}
              {renderBreakdownInput('notes100', '₹100')}
              {renderBreakdownInput('notes50', '₹50')}
              {renderBreakdownInput('notes20', '₹20')}
              {renderBreakdownInput('notes10', '₹10')}
              <View style={styles.divider} />
              {renderBreakdownInput('coins20', '₹20 सिक्का')}
              {renderBreakdownInput('coins10', '₹10 सिक्का')}
              {renderBreakdownInput('coins5', '₹5 सिक्का')}
              {renderBreakdownInput('coins2', '₹2 सिक्का')}
              {renderBreakdownInput('coins1', '₹1 सिक्का')}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterText}>
                नोट: ₹{calculateNotesTotal()} / लक्ष्य: ₹{cashNotesAmt}
                {coinsAmt > 0 ? `  •  सिक्का: ₹${coinsAmt}` : ''}
              </Text>
              <CustomButton 
                title={isCashMatched ? "पुष्टि करें (Confirm)" : "बंद करें (Close)"} 
                onPress={() => setCashBreakdownVisible(false)} 
                type={isCashMatched ? "primary" : "secondary"}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Udhari Breakdown Modal */}
      <Modal visible={udhariBreakdownVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ग्राहक-वार उधारी (Customer Khata)</Text>
              <TouchableOpacity onPress={() => setUdhariBreakdownVisible(false)}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{maxHeight: 340}}>
              {udhariBreakdownData.map((item) => (
                <View key={item.id} style={styles.dynamicRow}>
                  <View style={{flex: 2, marginRight: 8}}>
                    <CustomInput 
                      placeholder="ग्राहक का नाम" 
                      value={item.name} 
                      onChangeText={(t) => handleUdhariBreakdownChange(item.id, 'name', t)} 
                      style={{marginBottom: 0}} 
                    />
                  </View>
                  <View style={{flex: 1.5, marginRight: 8}}>
                    <CustomInput 
                      placeholder="राशि (₹)" 
                      keyboardType="numeric" 
                      value={item.amount} 
                      onChangeText={(t) => handleUdhariBreakdownChange(item.id, 'amount', t)} 
                      style={{marginBottom: 0}} 
                    />
                  </View>
                  {udhariBreakdownData.length > 1 && (
                    <TouchableOpacity onPress={() => removeUdhariEntry(item.id)} style={styles.removeRowBtn}>
                      <Icon name="trash-outline" size={20} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity style={styles.addRowBtn} onPress={addUdhariEntry}>
                <Icon name="add-circle-outline" size={18} color="#003C8F" />
                <Text style={styles.addRowBtnText}>+ नया ग्राहक जोड़ें</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterText}>
                कुल: ₹{calculateUdhariBreakdownTotal(udhariBreakdownData)} / लक्ष्य: ₹{udhariAmt}
              </Text>
              <CustomButton 
                title={isUdhariMatched ? "पुष्टि करें (Confirm)" : "बंद करें (Close)"} 
                onPress={() => setUdhariBreakdownVisible(false)} 
                type={isUdhariMatched ? "primary" : "secondary"}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Expense Breakdown Modal */}
      <Modal visible={expenseBreakdownVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>खर्च का विवरण (Pump Expenses)</Text>
                <Text style={styles.modalSubTitle}>दुकान/पंप का सामान्य खर्च या स्टाफ का वेतन/एडवांस</Text>
              </View>
              <TouchableOpacity onPress={() => setExpenseBreakdownVisible(false)}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {expenseBreakdownData.map((item) => {
                const itemType = item.type || 'general';
                const targetStaffId = item.salesmanId || selectedSalesman;
                const monthlyAdv = staffMonthlyAdvancesMap[targetStaffId] || 0;
                const currentAmt = parseFloat(item.amount) || 0;
                const totalWithCurrent = monthlyAdv + currentAmt;

                return (
                  <View key={item.id} style={styles.expenseItemCard}>
                    {/* Expense Type Selection (General vs Staff Salary) */}
                    <View style={styles.expenseTypePillRow}>
                      <TouchableOpacity
                        style={[styles.expenseTypePill, itemType === 'general' && styles.expenseTypePillActive]}
                        onPress={() => handleExpenseBreakdownChange(item.id, 'type', 'general')}
                      >
                        <Icon 
                          name="receipt-outline" 
                          size={14} 
                          color={itemType === 'general' ? '#003C8F' : '#64748B'} 
                        />
                        <Text style={[styles.expenseTypePillText, itemType === 'general' && styles.expenseTypePillTextActive]}>
                          सामान्य खर्च (General)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.expenseTypePill, itemType === 'salary' && styles.expenseTypePillSalaryActive]}
                        onPress={() => {
                          handleExpenseBreakdownChange(item.id, 'type', 'salary');
                          if (targetStaffId) {
                            fetchMonthlyAdvanceForStaff(targetStaffId);
                          }
                        }}
                      >
                        <Icon 
                          name="person-circle-outline" 
                          size={14} 
                          color={itemType === 'salary' ? '#B45309' : '#64748B'} 
                        />
                        <Text style={[styles.expenseTypePillText, itemType === 'salary' && styles.expenseTypePillSalaryTextActive]}>
                          💼 वेतन / एडवांस (Salary)
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Salary Advance Specific: Staff Picker & Monthly tracker */}
                    {itemType === 'salary' && (
                      <View style={styles.salaryAdvanceBox}>
                        <Text style={styles.salaryStaffLabel}>किस स्टाफ ने वेतन/एडवांस लिया:</Text>
                        <View style={styles.salaryPickerWrap}>
                          <Picker
                            selectedValue={targetStaffId}
                            onValueChange={(val) => {
                              const staffObj = effectiveSalesmen.find(s => s.id === val);
                              handleExpenseBreakdownChange(item.id, 'salesmanId', val);
                              handleExpenseBreakdownChange(item.id, 'salesmanName', staffObj ? staffObj.name : 'Staff');
                              fetchMonthlyAdvanceForStaff(val);
                            }}
                            style={styles.salaryPicker}
                          >
                            {effectiveSalesmen.map((st) => (
                              <Picker.Item key={st.id} label={st.name} value={st.id} />
                            ))}
                          </Picker>
                        </View>

                        {/* Month Advance Status Card */}
                        <View style={styles.monthAdvanceInfoCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Icon name="calendar-outline" size={15} color="#B45309" />
                            <Text style={styles.monthAdvanceInfoTitle}>
                              इस महीने का एडवांस स्टेटस ({new Date().toLocaleString('hi-IN', { month: 'short', year: 'numeric' })}):
                            </Text>
                          </View>
                          <View style={styles.monthAdvanceAmountRow}>
                            <Text style={styles.monthAdvanceOldText}>
                              पहले से लिया गया: <Text style={{ fontWeight: 'bold', color: '#B45309' }}>₹{monthlyAdv.toFixed(0)}</Text>
                            </Text>
                            {currentAmt > 0 && (
                              <Text style={styles.monthAdvanceTotalText}>
                                अभी +₹{currentAmt.toFixed(0)} ➔ कुल: <Text style={{ fontWeight: 'bold', color: '#DC2626' }}>₹{totalWithCurrent.toFixed(0)}</Text>
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Inputs Row: Description & Amount */}
                    <View style={styles.dynamicRow}>
                      <View style={{flex: 2, marginRight: 8}}>
                        <CustomInput 
                          placeholder={itemType === 'salary' ? "टिप्पणी (उदा. त्यौहार/इमरजेंसी एडवांस)" : "कारण (उदा. चाय, जनरेटर डीजल)"} 
                          value={item.reason} 
                          onChangeText={(t) => handleExpenseBreakdownChange(item.id, 'reason', t)} 
                          style={{marginBottom: 0}} 
                        />
                      </View>
                      <View style={{flex: 1.5, marginRight: 8}}>
                        <CustomInput 
                          placeholder="राशि (₹)" 
                          keyboardType="numeric" 
                          value={item.amount} 
                          onChangeText={(t) => handleExpenseBreakdownChange(item.id, 'amount', t)} 
                          style={{marginBottom: 0}} 
                        />
                      </View>
                      {expenseBreakdownData.length > 1 && (
                        <TouchableOpacity onPress={() => removeExpenseEntry(item.id)} style={styles.removeRowBtn}>
                          <Icon name="trash-outline" size={20} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}

              <TouchableOpacity style={styles.addRowBtn} onPress={addExpenseEntry}>
                <Icon name="add-circle-outline" size={18} color="#003C8F" />
                <Text style={styles.addRowBtnText}>+ नया खर्चा / एडवांस जोड़ें</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterText}>
                कुल: ₹{calculateExpenseBreakdownTotal(expenseBreakdownData)} / लक्ष्य: ₹{expenseAmt}
              </Text>
              <CustomButton 
                title={isExpenseMatched ? "पुष्टि करें (Confirm)" : "बंद करें (Close)"} 
                onPress={() => setExpenseBreakdownVisible(false)} 
                type={isExpenseMatched ? "primary" : "secondary"}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* 6. Admin OTP Verification Modal for Edit Mode */}
      <Modal visible={otpModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: 520 }]}>
            <View style={[styles.modalHeader, { borderBottomColor: '#F59E0B' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.modalHeaderIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Icon name="shield-checkmark" size={24} color="#D97706" />
                </View>
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.modalTitle}>Admin OTP सत्यापन</Text>
                  <Text style={styles.modalSubTitle}>एंट्री संशोधन की अनुमति लें</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setOtpModalVisible(false)} disabled={otpVerifying}>
                <Icon name="close-circle" size={26} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <View style={styles.otpInfoBox}>
                <Text style={styles.otpInfoTitle}>🔐 OTP सुरक्षा सत्यापन</Text>
                <Text style={styles.otpInfoDesc}>
                  स्टाफ <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>{effectiveSalesmen.find(s => s.id === selectedSalesman)?.name || 'Staff'}</Text> द्वारा मशीन <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>{selectedMachineData?.name || selectedMachine}</Text> की आज की एंट्री संशोधित की जा रही है।
                </Text>
                <Text style={[styles.otpInfoDesc, { marginTop: 8, color: '#B45309', fontWeight: 'bold' }]}>
                  👉 Admin Dashboard पर 6 अंकों का OTP जनरेट हो चुका है। कृपया Admin/मालिक से OTP पूछकर यहाँ दर्ज करें।
                </Text>
              </View>

              <Text style={styles.otpInputLabel}>6-अंकों का OTP दर्ज करें (Enter 6-Digit OTP) *</Text>
              <TextInput
                style={styles.otpTextInput}
                value={otpInput}
                onChangeText={(t) => setOtpInput(t.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={6}
                autoFocus={true}
                textAlign="center"
              />

              <View style={{ marginTop: 20 }}>
                <CustomButton 
                  title="सत्यापित करें और एंट्री सेव करें" 
                  onPress={handleVerifyAndSubmitEdit} 
                  loading={otpVerifying} 
                  type="primary"
                  icon="checkmark-circle-outline"
                />
                <TouchableOpacity 
                  style={styles.cancelOtpBtn} 
                  onPress={() => setOtpModalVisible(false)}
                  disabled={otpVerifying}
                >
                  <Text style={styles.cancelOtpBtnText}>रद्द करें (Cancel)</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16 },

  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 16,
    backgroundColor: '#003C8F',
    padding: 16,
    borderRadius: 16,
    elevation: 3
  },
  headerIconWrapper: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 12
  },
  title: { fontSize: 18, fontWeight: '900', color: '#fff' },
  subtitle: { fontSize: 12, color: '#BAE6FD', marginTop: 2, fontWeight: '600' },

  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3
  },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  pickerContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden'
  },
  picker: { height: 50 },

  // Receipt Card
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 3
  },
  receiptTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  receiptHeader: { fontSize: 14, fontWeight: '800', color: '#003C8F' },
  machineBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  machineBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#0369A1' },

  receiptFuelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4
  },
  fuelDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  fuelLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  fuelValueText: { fontSize: 13, fontWeight: '700', color: '#1E293B' },

  receiptDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10
  },

  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3
  },
  receiptMainLabel: { fontSize: 13, color: '#64748B', fontWeight: '600' },
  receiptMainValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },

  shortageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10
  },
  shortageText: { fontSize: 14, fontWeight: '900', marginLeft: 8 },

  // Section Cards (Petrol & Diesel)
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  autoCarryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD'
  },
  autoCarryText: {
    fontSize: 10,
    color: '#0369A1',
    fontWeight: '700',
    marginLeft: 3
  },

  twoColumnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10
  },

  tankReturnNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD'
  },
  tankReturnText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600',
    marginLeft: 6
  },

  previewBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  previewText: { fontSize: 12, color: '#475569' },

  // Payment Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  inputLabelCustom: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6
  },
  digitalCardBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  digitalCardTotalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155'
  },
  openDigitalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#003C8F',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  openDigitalBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8
  },
  activeChip: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD'
  },
  activeChipText: {
    fontSize: 11,
    color: '#0369A1',
    fontWeight: '600'
  },
  noChipsText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4
  },

  cashInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  cashTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 8
  },
  cashTotalBarLabel: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '700',
    marginLeft: 6
  },
  cashTotalBarValue: {
    fontSize: 14,
    color: '#003C8F',
    fontWeight: '900'
  },

  breakdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 6
  },
  btnSuccess: { backgroundColor: '#16A34A' },
  btnWarning: { backgroundColor: '#D97706' },
  breakdownBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 6 },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  modalSubTitle: { fontSize: 11, color: '#64748B', marginTop: 2 },

  presetSectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 6
  },
  presetScroll: {
    flexGrow: 0,
    marginBottom: 10
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
    backgroundColor: '#fff'
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700'
  },

  customAddBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 6,
    borderRadius: 10,
    marginBottom: 10
  },
  customTextInput: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 12
  },
  customAddBtn: {
    backgroundColor: '#003C8F',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 6
  },
  customAddBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },

  digitalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    padding: 6,
    borderRadius: 8
  },
  digitalRowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155'
  },

  modalFooter: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12
  },
  modalFooterText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10
  },
  breakdownInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  breakdownInputLabel: { fontSize: 14, fontWeight: '600', color: '#444', width: 90 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  dynamicRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  removeRowBtn: { padding: 8 },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#003C8F',
    borderRadius: 8,
    marginVertical: 10
  },
  addRowBtnText: { color: '#003C8F', fontWeight: 'bold', marginLeft: 6 },
  testingDoneNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginTop: 8,
  },
  testingDoneText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: 'bold',
    marginLeft: 6,
    flex: 1,
  },

  // Udhari Return Section Styles
  udhariReturnSection: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0'
  },
  udhariReturnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  udhariReturnTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D'
  },
  pendingCountBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  pendingCountText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626'
  },
  noUdhariBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 8
  },
  noUdhariText: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
    marginLeft: 6
  },
  returnDropdownLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4
  },
  returnPickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    overflow: 'hidden'
  },
  returnListLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6
  },
  returnEntryCard: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2
  },
  returnEntryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  returnCustomerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B'
  },
  returnDueText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 2
  },
  returnAmountRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  fullPayBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8
  },
  fullPayBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold'
  },
  returnStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 6
  },
  returnStatusText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4
  },
  returnTotalBox: {
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#86EFAC'
  },
  returnTotalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155'
  },

  // Edit Mode Banner Styles
  editModeBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16
  },
  editModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  editModeIconWrap: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 10
  },
  editModeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E'
  },
  editModeSub: {
    fontSize: 12,
    color: '#78350F',
    marginTop: 2
  },
  editModeNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10
  },
  editModeNoticeText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    marginLeft: 6,
    flex: 1
  },
  cancelEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5'
  },
  cancelEditBtnText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '700',
    marginLeft: 6
  },
  restoreEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#93C5FD'
  },
  restoreEditBtnText: {
    fontSize: 13,
    color: '#003C8F',
    fontWeight: '700',
    marginLeft: 6
  },

  // PDF Direct Download Button Styles
  pdfDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#003C8F',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
    marginBottom: 4
  },
  pdfDirectBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003C8F',
    marginLeft: 8
  },

  // OTP Verification Modal Styles
  otpInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16
  },
  otpInfoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6
  },
  otpInfoDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18
  },
  otpInputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8
  },
  otpTextInput: {
    borderWidth: 2,
    borderColor: '#003C8F',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 10,
    color: '#003C8F',
    paddingVertical: 14,
    textAlign: 'center'
  },
  cancelOtpBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8
  },
  cancelOtpBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600'
  },

  // Submit Button Inactive / Active States
  submitBtnDisabled: {
    backgroundColor: '#94A3B8',
    borderColor: '#64748B',
    opacity: 0.6,
    marginTop: 8,
    marginBottom: 40
  },
  submitBtnActive: {
    marginTop: 8,
    marginBottom: 40
  },
  incompleteFormBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 10,
    marginBottom: 4
  },
  incompleteFormText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    marginLeft: 6,
    flex: 1
  },

  // Expense Modal & Salary Advance Styles
  expenseItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  expenseTypePillRow: {
    flexDirection: 'row',
    marginBottom: 8,
    gap: 8
  },
  expenseTypePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF'
  },
  expenseTypePillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#003C8F'
  },
  expenseTypePillSalaryActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706'
  },
  expenseTypePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 4
  },
  expenseTypePillTextActive: {
    color: '#003C8F',
    fontWeight: '700'
  },
  expenseTypePillSalaryTextActive: {
    color: '#92400E',
    fontWeight: '700'
  },
  salaryAdvanceBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  salaryStaffLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4
  },
  salaryPickerWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
    overflow: 'hidden',
    marginBottom: 6
  },
  salaryPicker: {
    height: 44
  },
  monthAdvanceInfoCard: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#D97706'
  },
  monthAdvanceInfoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginLeft: 4
  },
  monthAdvanceAmountRow: {
    marginTop: 4
  },
  monthAdvanceOldText: {
    fontSize: 11,
    color: '#78350F'
  },
  monthAdvanceTotalText: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2
  }
});
