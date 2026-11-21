import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, 
  Modal, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
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
  getMonthKey,
  addDirectSalaryAdvance,
  getStaffTypeDetails,
  syncDefaultDigitalPaymentModes,
  addPermanentDigitalPaymentMode,
  deletePermanentDigitalPaymentMode,
  DEFAULT_PERMANENT_DIGITAL_MODES
} from '../../../services/dbServices';
import { generateAndSharePdf } from '../../../utils/generatePdfReceipt';
import { 
  createEditRequest, 
  verifyEditOtp, 
  findTodayEntry, 
  getTodayMachineEntries,
  findEntryForDate,
  getMachineEntriesForDate,
  getSubmittedReportsForDate
} from '../../../utils/otpHelper';
import DateTimePicker from '@react-native-community/datetimepicker';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import ScrollableModal from '../../../components/ScrollableModal';
import Icon from '@expo/vector-icons/Ionicons';

// Fixed 4 Digital / Bank Payment Modes
export const FIXED_DIGITAL_MODES = [
  { id: 'paytm', modeId: 'paytm', name: 'Paytm (पेटीएम)', icon: 'wallet-outline', color: '#00B9F5' },
  { id: 'phonepe', modeId: 'phonepe', name: 'PhonePe (फोनपे)', icon: 'phone-portrait-outline', color: '#5F259F' },
  { id: 'atm', modeId: 'atm', name: 'ATM / POS स्वाइप', icon: 'card-outline', color: '#003C8F' },
  { id: 'bob', modeId: 'bob', name: 'BOB Bank (बैंक ऑफ बड़ौदा)', icon: 'business-outline', color: '#EA580C' }
];

export const createDefaultDigitalEntries = () => [
  { id: 'paytm', modeId: 'paytm', name: 'Paytm (पेटीएम)', icon: 'wallet-outline', color: '#00B9F5', amount: '' },
  { id: 'phonepe', modeId: 'phonepe', name: 'PhonePe (फोनपे)', icon: 'phone-portrait-outline', color: '#5F259F', amount: '' },
  { id: 'atm', modeId: 'atm', name: 'ATM / POS स्वाइप', icon: 'card-outline', color: '#003C8F', amount: '' },
  { id: 'bob', modeId: 'bob', name: 'BOB Bank (बैंक ऑफ बड़ौदा)', icon: 'business-outline', color: '#EA580C', amount: '' }
];

export const mergeDigitalEntriesWithBreakdown = (breakdown = [], entry = {}, masterModes = null) => {
  const modesList = (masterModes && masterModes.length > 0) ? masterModes : createDefaultDigitalEntries();
  const baseEntries = modesList.map(mode => {
    let amt = '';
    const found = (breakdown || []).find(b => b.modeId === mode.modeId || b.id === mode.id);
    if (found && found.amount !== undefined && found.amount !== null && found.amount !== '') {
      amt = String(found.amount);
    } else if ((mode.modeId === 'paytm' || mode.id === 'paytm') && entry.paytmAmount) {
      amt = String(entry.paytmAmount);
    } else if ((mode.modeId === 'phonepe' || mode.id === 'phonepe') && entry.phonePeAmount) {
      amt = String(entry.phonePeAmount);
    } else if ((mode.modeId === 'atm' || mode.id === 'atm') && entry.atmAmount) {
      amt = String(entry.atmAmount);
    } else if ((mode.modeId === 'bob' || mode.id === 'bob') && entry.bobAmount) {
      amt = String(entry.bobAmount);
    }
    return { ...mode, amount: amt };
  });

  // Preserve any additional digital modes previously saved in breakdown
  const extraEntries = (breakdown || []).filter(b => 
    !baseEntries.some(m => m.id === b.id || m.modeId === b.modeId)
  ).map(b => ({
    id: b.id || `mode_${Date.now()}_${Math.random()}`,
    modeId: b.modeId || b.id || 'custom',
    name: b.name || 'Other Digital',
    icon: b.icon || 'card-outline',
    color: b.color || '#0F766E',
    amount: b.amount ? String(b.amount) : '',
    isFixed: false
  }));

  return [...baseEntries, ...extraEntries];
};

export default function DailyEntryScreen({ navigation }) {
  const scrollViewRef = useRef(null);

  // Date Selection State (Today, Yesterday, Custom Date)
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateFilterMode, setDateFilterMode] = useState('today'); // 'today' | 'yesterday' | 'custom'
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submittedSalesmenMap, setSubmittedSalesmenMap] = useState({}); // salesmanId -> [reports]

  // Staff Selection
  const [salesmen, setSalesmen] = useState([]);
  const [selectedSalesman, setSelectedSalesman] = useState('');

  // Support Staff States (Chaukidaar / Sweeper Non-Dispenser Payments)
  const [supportAmt, setSupportAmt] = useState('');
  const [supportPaymentMode, setSupportPaymentMode] = useState('Cash'); // 'Cash' | 'PhonePe' | 'BOB Bank'
  const [supportNotes, setSupportNotes] = useState('');
  const [supportSaving, setSupportSaving] = useState(false);
  const [supportAdvanceHistory, setSupportAdvanceHistory] = useState([]);
  const [supportMonthTotal, setSupportMonthTotal] = useState(0);
  const [supportHistoryLoading, setSupportHistoryLoading] = useState(false);

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
  const [petrolOfficialTestingQty, setPetrolOfficialTestingQty] = useState('0'); // Default 0L official testing
  const [petrolRate, setPetrolRate] = useState('');
  const [petrolAutoLoaded, setPetrolAutoLoaded] = useState(false);

  // 2. Diesel Nozzle State - Connected to Tank 2
  const [dieselOpeningMeter, setDieselOpeningMeter] = useState('');
  const [dieselClosingMeter, setDieselClosingMeter] = useState('');
  const [dieselTestingQty, setDieselTestingQty] = useState('5'); // Default 5L standard testing
  const [dieselOfficialTestingQty, setDieselOfficialTestingQty] = useState('0'); // Default 0L official testing
  const [dieselRate, setDieselRate] = useState('');
  const [dieselAutoLoaded, setDieselAutoLoaded] = useState(false);

  // Dynamic Nozzle IDs based on Machine (e.g. DU1 -> N1/N2, DU2 -> N3/N4)
  const [currentPetrolNozzleId, setCurrentPetrolNozzleId] = useState('N1');
  const [currentDieselNozzleId, setCurrentDieselNozzleId] = useState('N2');

  // Shift Management State (Shift 1, Shift 2, etc. on same machine)
  const [shiftNumber, setShiftNumber] = useState(1);
  const [todayMachineEntries, setTodayMachineEntries] = useState([]);

  // Testing already done today status (hides testing input if already submitted today)
  const [petrolTestingAlreadyDone, setPetrolTestingAlreadyDone] = useState(false);
  const [dieselTestingAlreadyDone, setDieselTestingAlreadyDone] = useState(false);

  // Payment Collections
  const [cash, setCash] = useState('');
  const [coins, setCoins] = useState('');
  const [online, setOnline] = useState('');
  const [udhari, setUdhari] = useState('');
  const [expense, setExpense] = useState('');

  // 1. Multi-Mode Digital & Card Payments State (Synced permanently with Firestore)
  const [digitalModalVisible, setDigitalModalVisible] = useState(false);
  const [digitalEntries, setDigitalEntries] = useState(createDefaultDigitalEntries());
  const [masterDigitalModes, setMasterDigitalModes] = useState(DEFAULT_PERMANENT_DIGITAL_MODES);

  // Permanent Mode Creation Modal
  const [addModeModalVisible, setAddModeModalVisible] = useState(false);
  const [newModeName, setNewModeName] = useState('');
  const [isSavingNewMode, setIsSavingNewMode] = useState(false);

  // Calculate Digital Total
  const calculateDigitalTotal = (entries = digitalEntries) => {
    return entries.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  };

  const handleDigitalAmountChange = (id, value) => {
    const val = sanitizeDecimalInput(value);
    const updated = digitalEntries.map(entry => (entry.id === id || entry.modeId === id) ? { ...entry, amount: val } : entry);
    setDigitalEntries(updated);
    const total = calculateDigitalTotal(updated);
    setOnline(total > 0 ? total.toFixed(2) : '');
  };

  // Add a permanent digital payment channel to Firestore
  const handleSavePermanentMode = async (presetName = '') => {
    const finalName = (presetName || newModeName || '').trim();
    if (!finalName) {
      Alert.alert('नाम आवश्यक है', 'कृपया नए डिजिटल पेमेंट का नाम दर्ज करें (उदा. Google Pay, BharatPe).');
      return;
    }

    setIsSavingNewMode(true);
    try {
      await addPermanentDigitalPaymentMode({ name: finalName });
      Toast.show({
        type: 'success',
        text1: 'पेमेंट माध्यम स्थायी रूप से जोड़ा गया!',
        text2: `'${finalName}' अब ऐप में हमेशा के लिए उपलब्ध रहेगा।`
      });
      setNewModeName('');
      setAddModeModalVisible(false);
    } catch (err) {
      Alert.alert('त्रुटि', err.message || 'पेमेंट माध्यम जोड़ने में विफल.');
    } finally {
      setIsSavingNewMode(false);
    }
  };

  // Permanently delete a digital payment channel from Firestore
  const handleDeletePermanentMode = (modeItem) => {
    Alert.alert(
      'पेमेंट माध्यम स्थायी रूप से हटाएं?',
      `क्या आप '${modeItem.name}' को हमेशा के लिए हटाना चाहते हैं?\n\nयह ऐप के डिजिटल पेमेंट सूची से स्थायी रूप से डिलीट हो जाएगा।`,
      [
        { text: 'रद्द करें', style: 'cancel' },
        {
          text: 'हाँ, स्थायी हटाएं (Delete)',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePermanentDigitalPaymentMode(modeItem.id);
              Toast.show({
                type: 'success',
                text1: 'पेमेंट माध्यम हटाया गया',
                text2: `'${modeItem.name}' को स्थायी रूप से हटा दिया गया है।`
              });
            } catch (err) {
              Alert.alert('त्रुटि', err.message || 'पेमेंट माध्यम हटाने में विफल.');
            }
          }
        }
      ]
    );
  };

  // 2. Cash Breakdown
  const [cashBreakdownVisible, setCashBreakdownVisible] = useState(false);
  const [breakdownData, setBreakdownData] = useState({
    notes500: '', notes200: '', notes100: '', notes50: '', notes20: '', notes10: '',
    coins20: '', coins10: '', coins5: '', coins2: '', coins1: ''
  });
  const [isCashMatched, setIsCashMatched] = useState(false);
  const [breakdownTotal, setBreakdownTotal] = useState(0);

  const calculateBreakdownTotal = (data = breakdownData) => {
    let total = 0;
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
  const [staffMonthlyAdvanceRecordsMap, setStaffMonthlyAdvanceRecordsMap] = useState({});

  const fetchMonthlyAdvanceForStaff = async (staffId) => {
    if (!staffId) return;
    try {
      const sObj = effectiveSalesmen.find(s => s.id === staffId);
      const res = await getStaffMonthlyAdvanceTotal(staffId, getMonthKey(), sObj?.name);
      setStaffMonthlyAdvancesMap(prev => ({
        ...prev,
        [staffId]: res.totalAdvance
      }));
      setStaffMonthlyAdvanceRecordsMap(prev => ({
        ...prev,
        [staffId]: res.records || []
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

  // 5. Additional Mobil / Lubricants Sale State (Optional)
  const [mobilEntries, setMobilEntries] = useState([]);

  const handleAddMobilRow = (presetPack = '') => {
    setMobilEntries(prev => [
      ...prev,
      {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        packSize: presetPack || '',
        quantity: '1',
        amount: ''
      }
    ]);
  };

  const handleUpdateMobilRow = (id, field, value) => {
    setMobilEntries(prev => prev.map(item => {
      if (item.id === id) {
        if (field === 'amount') {
          return { ...item, [field]: sanitizeDecimalInput(value) };
        }
        if (field === 'quantity') {
          return { ...item, [field]: value.replace(/[^0-9]/g, '') };
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleRemoveMobilRow = (id) => {
    setMobilEntries(prev => prev.filter(item => item.id !== id));
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

  const effectiveSalesmen = salesmen;
  const effectiveMachines = machines;

  // Selected Staff Object & Support Staff (Watchman / Sweeper) Detection
  const selectedStaffObj = useMemo(() => {
    return effectiveSalesmen.find(s => s.id === selectedSalesman);
  }, [effectiveSalesmen, selectedSalesman]);

  const isSupportStaff = useMemo(() => {
    if (!selectedStaffObj) return false;
    const t = (selectedStaffObj.staffType || '').toLowerCase();
    const n = (selectedStaffObj.name || '').toLowerCase();
    return t === 'watchman' || t === 'sweeper' || 
           n.includes('चौकीदार') || n.includes('watchman') || n.includes('guard') ||
           n.includes('सफाई') || n.includes('sweeper') || n.includes('स्वीपर');
  }, [selectedStaffObj]);

  // Load Support Staff Monthly Advances ("जहाँ से कितना पैसा लिए हैं वो दिख सके")
  const loadSupportStaffAdvances = async (staffId, targetDate = selectedDate, staffName = selectedStaffObj?.name) => {
    if (!staffId) return;
    setSupportHistoryLoading(true);
    try {
      const monthK = getMonthKey(targetDate);
      const res = await getStaffMonthlyAdvanceTotal(staffId, monthK, staffName);
      setSupportMonthTotal(res.totalAdvance || 0);
      setSupportAdvanceHistory(res.records || []);
    } catch (e) {
      console.warn("Error fetching support staff advance data:", e);
    } finally {
      setSupportHistoryLoading(false);
    }
  };

  // Direct Payment / Wages Save Handler for Support Staff (Chaukidaar / Sweeper)
  const handleSaveSupportPayment = async () => {
    const amt = parseFloat(supportAmt);
    if (!amt || amt <= 0) {
      Alert.alert('अमान्य राशि', 'कृपया भुगतान राशि (0 से अधिक) दर्ज करें।');
      return;
    }

    setSupportSaving(true);
    try {
      const isWatch = (selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार'));
      const staffType = isWatch ? 'watchman' : 'sweeper';
      const staffTitle = isWatch ? 'चौकीदार' : 'सफाईकर्मी';
      const cleanNotes = (supportNotes.trim() || `${staffTitle} मानदेय / मजदूरी`) + ` (माध्यम: ${supportPaymentMode})`;

      const res = await addDirectSalaryAdvance({
        salesmanId: selectedSalesman,
        salesmanName: selectedStaffObj?.name || 'Staff',
        staffType: staffType,
        paymentMode: supportPaymentMode,
        amount: amt,
        notes: cleanNotes,
        date: selectedDate,
        machineId: 'Support Staff',
        machineName: `${staffTitle} भुगतान`
      });

      if (res.success) {
        Alert.alert(
          'भुगतान दर्ज सफल ✅',
          `${selectedStaffObj?.name} (${staffTitle}) को ₹${amt.toLocaleString('en-IN')} का भुगतान सफलतापूर्वक दर्ज कर दिया गया है।\n\nयह आज के खर्चों, दैनिक ऑडिट रिपोर्ट (PDF) और Owner Panel में शामिल हो गया है।`
        );
        setSupportAmt('');
        loadSupportStaffAdvances(selectedSalesman, selectedDate, selectedStaffObj?.name);
      } else {
        Alert.alert('त्रुटि', res.error || 'भुगतान दर्ज नहीं हो सका। कृपया पुनः प्रयास करें।');
      }
    } catch (error) {
      console.error('Error saving support payment:', error);
      Alert.alert('त्रुटि', error.message || 'भुगतान दर्ज करने में समस्या आई।');
    } finally {
      setSupportSaving(false);
    }
  };

  // Automatically sync support staff advances when salesman or date changes
  useEffect(() => {
    if (selectedSalesman && isSupportStaff) {
      setSelectedMachine('');
      const isWatch = (selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार'));
      const defaultNotes = isWatch ? 'चौकीदार मानदेय / मजदूरी' : 'सफाईकर्मी दैनिक मजदूरी';
      setSupportNotes(defaultNotes);
      loadSupportStaffAdvances(selectedSalesman, selectedDate, selectedStaffObj?.name);
    }
  }, [selectedSalesman, isSupportStaff, selectedDate]);

  // Date Utilities & Handlers
  const isDateToday = (d) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const isDateYesterday = (d) => {
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    return d.getDate() === yest.getDate() &&
      d.getMonth() === yest.getMonth() &&
      d.getFullYear() === yest.getFullYear();
  };

  // Clears all entered inputs so previous data is NEVER shown when changing staff or machine
  const resetFormFields = () => {
    setPetrolClosingMeter('');
    setDieselClosingMeter('');
    setPetrolTestingQty('5');
    setPetrolOfficialTestingQty('0');
    setDieselTestingQty('5');
    setDieselOfficialTestingQty('0');
    setPetrolTestingAlreadyDone(false);
    setDieselTestingAlreadyDone(false);
    setPetrolRate('');
    setDieselRate('');
    setPetrolAutoLoaded(false);
    setDieselAutoLoaded(false);

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
      notes500: '', notes200: '', notes100: '', notes50: '', notes20: '', notes10: '',
      coins20: '', coins10: '', coins5: '', coins2: '', coins1: ''
    });
    setBreakdownTotal(0);

    setDigitalEntries((masterDigitalModes || []).map(m => ({ ...m, amount: '' })));
    setMobilEntries([]);
    setUdhariBreakdownData([{ id: Date.now().toString(), name: '', amount: '' }]);
    setUdhariReturnEntries([]);
    setSelectedReturnCustomer('');
    setExpenseBreakdownData([{ id: Date.now().toString(), type: 'general', reason: '', amount: '', salesmanId: '', salesmanName: '' }]);
  };

  // Helper to check for existing entry on target date and populate Edit Mode
  const checkEditModeForStaffAndMachine = async (salesmanId, machineId, targetDate = selectedDate) => {
    if (!salesmanId || !machineId) return;
    try {
      const existingEntry = await findEntryForDate(salesmanId, machineId, targetDate);
      if (existingEntry) {
        setIsEditMode(true);
        setExistingReportId(existingEntry.id);
        setExistingReportData(existingEntry);

        // Pre-fill meters
        if (existingEntry.petrolOpeningMeter) setPetrolOpeningMeter(String(existingEntry.petrolOpeningMeter));
        if (existingEntry.petrolClosingMeter) setPetrolClosingMeter(String(existingEntry.petrolClosingMeter));
        if (existingEntry.dieselOpeningMeter) setDieselOpeningMeter(String(existingEntry.dieselOpeningMeter));
        if (existingEntry.dieselClosingMeter) setDieselClosingMeter(String(existingEntry.dieselClosingMeter));

        setPetrolTestingQty(String(existingEntry.petrolNormalTesting ?? existingEntry.petrolTesting ?? '5'));
        setPetrolOfficialTestingQty(String(existingEntry.petrolOfficialTesting ?? '0'));
        setDieselTestingQty(String(existingEntry.dieselNormalTesting ?? existingEntry.dieselTesting ?? '5'));
        setDieselOfficialTestingQty(String(existingEntry.dieselOfficialTesting ?? '0'));
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
          setDigitalEntries(mergeDigitalEntriesWithBreakdown(existingEntry.digitalPaymentsBreakdown, existingEntry, masterDigitalModes));
        } else if (existingEntry.paytmAmount || existingEntry.phonePeAmount || existingEntry.atmAmount || existingEntry.bobAmount) {
          setDigitalEntries(mergeDigitalEntriesWithBreakdown([], existingEntry, masterDigitalModes));
        } else {
          setDigitalEntries((masterDigitalModes || []).map(m => ({ ...m, amount: '' })));
        }
        if (existingEntry.cashBreakdown) {
          setBreakdownData(existingEntry.cashBreakdown);
          setIsCashMatched(true);
          setBreakdownTotal(calculateBreakdownTotal(existingEntry.cashBreakdown));
        }
        if (existingEntry.udhariBreakdown && existingEntry.udhariBreakdown.length > 0) {
          setUdhariBreakdownData(existingEntry.udhariBreakdown);
          setIsUdhariMatched(true);
        }
        if (existingEntry.expenseBreakdown && existingEntry.expenseBreakdown.length > 0) {
          setExpenseBreakdownData(existingEntry.expenseBreakdown);
          setIsExpenseMatched(true);
        }
        if (existingEntry.mobilEntries && existingEntry.mobilEntries.length > 0) {
          setMobilEntries(existingEntry.mobilEntries.map(e => ({
            id: e.id || Date.now().toString() + Math.random().toString(36).substr(2, 4),
            packSize: e.packSize || '',
            quantity: String(e.quantity || '1'),
            amount: String(e.amount || '')
          })));
        } else if (existingEntry.totalMobilAmount) {
          setMobilEntries([{
            id: Date.now().toString(),
            packSize: 'मोबिल',
            quantity: String(existingEntry.totalMobilQty || '1'),
            amount: String(existingEntry.totalMobilAmount)
          }]);
        } else {
          setMobilEntries([]);
        }

        setIsFormClearedForFreshFill(false);
        const dateStr = targetDate.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        Alert.alert(
          `⚠️ ${dateStr} की एंट्री मिली! (Edit Mode)`,
          `इस मशीन और स्टाफ की ${dateStr} की बिक्री पहले से दर्ज है। पूरा डेटा फॉर्म में लोड हो गया है। आप इसमें बदलाव कर सकते हैं या फ़ॉर्म खाली कर शुरू से भर सकते हैं। सबमिट करने पर Admin से 6-digit OTP लेना होगा।`,
          [{ text: 'समझ गया (OK)' }]
        );
      } else {
        // No existing entry for this staff on this machine: wipe old inputs
        resetFormFields();
      }
    } catch (err) {
      console.warn('Edit check error:', err);
    }
  };

  // When Machine Changes: Auto-Carry Last Closing Meters & Reset Previous Inputs!
  const handleMachineChange = async (machineId, targetDate = selectedDate, staffId = selectedSalesman) => {
    setSelectedMachine(machineId);

    // ALWAYS reset previous user inputs so previous machine's or old data is NEVER shown!
    resetFormFields();

    if (!machineId) {
      setSelectedMachineData(null);
      setPetrolOpeningMeter('');
      setDieselOpeningMeter('');
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
      fuelRate: '',
      currentMeterReading: null
    };
    const activePNozzleId = mach.petrolNozzle || pNozzle.nozzleId || defaultPNozzleId;
    setCurrentPetrolNozzleId(activePNozzleId);

    // Diesel nozzle detection
    const dNozzle = machNozzles.find(n => n.fuelType === 'Diesel' || n.nozzleId === (mach.dieselNozzle || defaultDNozzleId)) || {
      id: `${machineId}-${mach.dieselNozzle || defaultDNozzleId}`,
      nozzleId: mach.dieselNozzle || defaultDNozzleId,
      fuelType: 'Diesel',
      fuelRate: '',
      currentMeterReading: null
    };
    const activeDNozzleId = mach.dieselNozzle || dNozzle.nozzleId || defaultDNozzleId;
    setCurrentDieselNozzleId(activeDNozzleId);

    try {
      // 1. Fetch all entries on target date for this machine to determine Shift Number & Last Closing
      const entriesToday = await getMachineEntriesForDate(machineId, targetDate);
      setTodayMachineEntries(entriesToday);
      const computedShift = entriesToday.length + 1;
      setShiftNumber(computedShift);

      if (entriesToday.length > 0) {
        // Shift 2 or subsequent shift:
        // Automatically take the latest submitted entry's closing meter as opening meter!
        const lastEntry = entriesToday[entriesToday.length - 1];
        if (lastEntry.petrolClosingMeter) {
          setPetrolOpeningMeter(formatTo4Decimals(lastEntry.petrolClosingMeter));
          setPetrolAutoLoaded(true);
        } else {
          setPetrolOpeningMeter('');
          setPetrolAutoLoaded(false);
        }

        if (lastEntry.dieselClosingMeter) {
          setDieselOpeningMeter(formatTo4Decimals(lastEntry.dieselClosingMeter));
          setDieselAutoLoaded(true);
        } else {
          setDieselOpeningMeter('');
          setDieselAutoLoaded(false);
        }

        // In Shift 2+, testing is NOT applicable (testing is done only in morning Shift 1)
        setPetrolTestingAlreadyDone(true);
        setDieselTestingAlreadyDone(true);
        setPetrolTestingQty('0');
        setDieselTestingQty('0');

        // Preload fuel rates from previous shift
        if (lastEntry.petrolRate) setPetrolRate(String(lastEntry.petrolRate));
        if (lastEntry.dieselRate) setDieselRate(String(lastEntry.dieselRate));
      } else {
        // Shift 1 (first shift of the day):
        const cachedPetrol = (await AsyncStorage.getItem(`@meter_${machineId}_petrol`)) || (await AsyncStorage.getItem(`@meter_${activePNozzleId}`));
        const cachedDiesel = (await AsyncStorage.getItem(`@meter_${machineId}_diesel`)) || (await AsyncStorage.getItem(`@meter_${activeDNozzleId}`));

        if (cachedPetrol) {
          setPetrolOpeningMeter(formatTo4Decimals(cachedPetrol));
          setPetrolAutoLoaded(true);
        } else if (pNozzle.currentMeterReading !== undefined && pNozzle.currentMeterReading !== null) {
          setPetrolOpeningMeter(formatTo4Decimals(pNozzle.currentMeterReading));
          setPetrolAutoLoaded(true);
        } else {
          setPetrolOpeningMeter('');
          setPetrolAutoLoaded(false);
        }

        if (cachedDiesel) {
          setDieselOpeningMeter(formatTo4Decimals(cachedDiesel));
          setDieselAutoLoaded(true);
        } else if (dNozzle.currentMeterReading !== undefined && dNozzle.currentMeterReading !== null) {
          setDieselOpeningMeter(formatTo4Decimals(dNozzle.currentMeterReading));
          setDieselAutoLoaded(true);
        } else {
          setDieselOpeningMeter('');
          setDieselAutoLoaded(false);
        }

        setPetrolRate('');
        setDieselRate('');
        setPetrolTestingAlreadyDone(false);
        setDieselTestingAlreadyDone(false);
        setPetrolTestingQty('5');
        setDieselTestingQty('5');
      }

      // 2. Check if this staff already submitted on this machine & date
      if (staffId) {
        await checkEditModeForStaffAndMachine(staffId, machineId, targetDate);
      }
    } catch (e) {
      console.warn("Auto-carry reading error:", e);
    }
  };

  const reloadSubmittedDataForDate = async (targetDate) => {
    try {
      const res = await getSubmittedReportsForDate(targetDate);
      const map = {};
      (res.reports || []).forEach(r => {
        if (r.salesmanId) {
          if (!map[r.salesmanId]) map[r.salesmanId] = [];
          map[r.salesmanId].push(r);
        }
      });
      setSubmittedSalesmenMap(map);

      // Re-check edit mode if staff and machine are already selected
      if (selectedSalesman && selectedMachine) {
        checkEditModeForStaffAndMachine(selectedSalesman, selectedMachine, targetDate);
      }
    } catch (e) {
      console.warn("Error reloading submitted data for date:", e);
    }
  };

  const handleSelectDateMode = (mode) => {
    setDateFilterMode(mode);
    if (mode === 'today') {
      const today = new Date();
      setSelectedDate(today);
      reloadSubmittedDataForDate(today);
      if (selectedMachine) handleMachineChange(selectedMachine, today);
    } else if (mode === 'yesterday') {
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      setSelectedDate(yest);
      reloadSubmittedDataForDate(yest);
      if (selectedMachine) handleMachineChange(selectedMachine, yest);
    } else if (mode === 'custom') {
      setShowDatePicker(true);
    }
  };

  const handleCustomDateChange = (event, date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      if (isDateToday(date)) {
        setDateFilterMode('today');
      } else if (isDateYesterday(date)) {
        setDateFilterMode('yesterday');
      } else {
        setDateFilterMode('custom');
      }
      reloadSubmittedDataForDate(date);
      if (selectedMachine) handleMachineChange(selectedMachine, date);
    }
  };

  const handleSalesmanChange = async (staffId) => {
    setSelectedSalesman(staffId);

    // ALWAYS reset previous user inputs so previous staff's data is NEVER shown!
    resetFormFields();

    if (!staffId) return;

    const sObj = effectiveSalesmen.find(s => s.id === staffId);
    const t = (sObj?.staffType || '').toLowerCase();
    const n = (sObj?.name || '').toLowerCase();
    const isSupp = t === 'watchman' || t === 'sweeper' || 
                   n.includes('चौकीदार') || n.includes('watchman') || n.includes('guard') ||
                   n.includes('सफाई') || n.includes('sweeper') || n.includes('स्वीपर');
    if (isSupp) {
      setSelectedMachine('');
      setSelectedMachineData(null);
      setPetrolOpeningMeter('');
      setDieselOpeningMeter('');
      const defaultNotes = (t === 'watchman' || n.includes('चौकीदार'))
        ? 'चौकीदार मानदेय / मजदूरी'
        : 'सफाईकर्मी दैनिक मजदूरी';
      setSupportNotes(defaultNotes);
      loadSupportStaffAdvances(staffId, selectedDate, sObj?.name);
    } else if (selectedMachine) {
      // Re-run machine change for the currently selected machine with this newly selected staff
      await handleMachineChange(selectedMachine, selectedDate, staffId);
    }
  };

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

    // Load submitted reports for current date
    reloadSubmittedDataForDate(selectedDate);

    const unsubSalesReports = onSnapshot(
      collection(db, 'sales_reports'),
      () => {
        reloadSubmittedDataForDate(selectedDate);
      },
      (error) => console.warn("Sales reports listener:", error.message)
    );

    // Sync & listen to permanent digital payment modes
    syncDefaultDigitalPaymentModes().catch(() => null);
    const unsubPaymentModes = onSnapshot(
      collection(db, 'digital_payment_modes'),
      (snapshot) => {
        let modes = [];
        if (!snapshot.empty) {
          snapshot.forEach(d => modes.push({ id: d.id, ...d.data() }));
          modes.sort((a, b) => (a.order || 99) - (b.order || 99));
        } else {
          modes = DEFAULT_PERMANENT_DIGITAL_MODES;
        }
        setMasterDigitalModes(modes);

        // Keep existing entered amounts while reflecting master list
        setDigitalEntries(prevEntries => {
          return modes.map(m => {
            const found = prevEntries.find(e => e.id === m.id || e.modeId === m.modeId);
            return {
              ...m,
              amount: found ? found.amount : ''
            };
          });
        });
      },
      (error) => console.warn("Payment modes listener error:", error.message)
    );

    return () => {
      unsubSalesmen();
      unsubMachines();
      unsubNozzles();
      unsubUdhari();
      unsubSalesReports();
      unsubPaymentModes();
    };
  }, []);

  // Staff chooses to fill from scratch instead of editing pre-filled values
  const handleStartFresh = () => {
    setPetrolClosingMeter('');
    setDieselClosingMeter('');
    setPetrolOfficialTestingQty('0');
    setDieselOfficialTestingQty('0');
    setCash('');
    setCoins('');
    setOnline('');
    setUdhari('');
    setExpense('');
    setIsCashMatched(false);
    setIsUdhariMatched(false);
    setIsExpenseMatched(false);
    setBreakdownData({
      notes500: '', notes200: '', notes100: '', notes50: '', notes20: '', notes10: '',
      coins20: '', coins10: '', coins5: '', coins2: '', coins1: ''
    });
    setDigitalEntries(masterDigitalModes.map(m => ({ ...m, amount: '' })));
    setMobilEntries([]);
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

    setPetrolTestingQty(String(existingEntry.petrolNormalTesting ?? existingEntry.petrolTesting ?? '5'));
    setPetrolOfficialTestingQty(String(existingEntry.petrolOfficialTesting ?? '0'));
    setDieselTestingQty(String(existingEntry.dieselNormalTesting ?? existingEntry.dieselTesting ?? '5'));
    setDieselOfficialTestingQty(String(existingEntry.dieselOfficialTesting ?? '0'));
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
      setDigitalEntries(mergeDigitalEntriesWithBreakdown(existingEntry.digitalPaymentsBreakdown, existingEntry, masterDigitalModes));
    } else if (existingEntry.paytmAmount || existingEntry.phonePeAmount || existingEntry.atmAmount || existingEntry.bobAmount) {
      setDigitalEntries(mergeDigitalEntriesWithBreakdown([], existingEntry, masterDigitalModes));
    } else {
      setDigitalEntries(masterDigitalModes.map(m => ({ ...m, amount: '' })));
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
    if (existingEntry.mobilEntries && existingEntry.mobilEntries.length > 0) {
      setMobilEntries(existingEntry.mobilEntries.map(e => ({
        id: e.id || Date.now().toString() + Math.random().toString(36).substr(2, 4),
        packSize: e.packSize || '',
        quantity: String(e.quantity || '1'),
        amount: String(e.amount || '')
      })));
    } else if (existingEntry.totalMobilAmount) {
      setMobilEntries([{
        id: Date.now().toString(),
        packSize: 'मोबिल',
        quantity: String(existingEntry.totalMobilQty || '1'),
        amount: String(existingEntry.totalMobilAmount)
      }]);
    } else {
      setMobilEntries([]);
    }
    setIsFormClearedForFreshFill(false);
  };

  // Switch to editing previous shift if staff wants to modify past report
  const handleEditPreviousShift = () => {
    if (todayMachineEntries && todayMachineEntries.length > 0) {
      const lastEntry = todayMachineEntries[todayMachineEntries.length - 1];
      setExistingReportId(lastEntry.id);
      setExistingReportData(lastEntry);
      setIsEditMode(true);
      setShiftNumber(lastEntry.shiftNumber || todayMachineEntries.length);

      if (lastEntry.petrolOpeningMeter) setPetrolOpeningMeter(String(lastEntry.petrolOpeningMeter));
      if (lastEntry.petrolClosingMeter) setPetrolClosingMeter(String(lastEntry.petrolClosingMeter));
      if (lastEntry.dieselOpeningMeter) setDieselOpeningMeter(String(lastEntry.dieselOpeningMeter));
      if (lastEntry.dieselClosingMeter) setDieselClosingMeter(String(lastEntry.dieselClosingMeter));

      setPetrolTestingQty(String(lastEntry.petrolNormalTesting ?? lastEntry.petrolTesting ?? '0'));
      setPetrolOfficialTestingQty(String(lastEntry.petrolOfficialTesting ?? '0'));
      setDieselTestingQty(String(lastEntry.dieselNormalTesting ?? lastEntry.dieselTesting ?? '0'));
      setDieselOfficialTestingQty(String(lastEntry.dieselOfficialTesting ?? '0'));
      if (lastEntry.petrolRate) setPetrolRate(String(lastEntry.petrolRate));
      if (lastEntry.dieselRate) setDieselRate(String(lastEntry.dieselRate));

      if (lastEntry.cashNotesAmount !== undefined) {
        setCash(String(lastEntry.cashNotesAmount));
      } else if (lastEntry.cashAmount) {
        setCash(String(lastEntry.cashAmount));
      }
      if (lastEntry.coinsAmount !== undefined) {
        setCoins(String(lastEntry.coinsAmount));
      } else {
        setCoins('');
      }
      setOnline(lastEntry.onlineAmount ? String(lastEntry.onlineAmount) : '');
      setUdhari(lastEntry.udhariAmount ? String(lastEntry.udhariAmount) : '');
      setExpense(lastEntry.expenses ? String(lastEntry.expenses) : '');

      if (lastEntry.digitalPaymentsBreakdown && lastEntry.digitalPaymentsBreakdown.length > 0) {
        setDigitalEntries(mergeDigitalEntriesWithBreakdown(lastEntry.digitalPaymentsBreakdown, lastEntry, masterDigitalModes));
      } else if (lastEntry.paytmAmount || lastEntry.phonePeAmount || lastEntry.atmAmount || lastEntry.bobAmount) {
        setDigitalEntries(mergeDigitalEntriesWithBreakdown([], lastEntry, masterDigitalModes));
      } else {
        setDigitalEntries(masterDigitalModes.map(m => ({ ...m, amount: '' })));
      }
      if (lastEntry.cashBreakdown) {
        setBreakdownData(lastEntry.cashBreakdown);
        setIsCashMatched(true);
      }
      if (lastEntry.udhariBreakdown && lastEntry.udhariBreakdown.length > 0) {
        setUdhariBreakdownData(lastEntry.udhariBreakdown);
        setIsUdhariMatched(true);
      }
      if (lastEntry.expenseBreakdown && lastEntry.expenseBreakdown.length > 0) {
        setExpenseBreakdownData(lastEntry.expenseBreakdown);
        setIsExpenseMatched(true);
      }
      if (lastEntry.mobilEntries && lastEntry.mobilEntries.length > 0) {
        setMobilEntries(lastEntry.mobilEntries.map(e => ({
          id: e.id || Date.now().toString() + Math.random().toString(36).substr(2, 4),
          packSize: e.packSize || '',
          quantity: String(e.quantity || '1'),
          amount: String(e.amount || '')
        })));
      } else if (lastEntry.totalMobilAmount) {
        setMobilEntries([{
          id: Date.now().toString(),
          packSize: 'मोबिल',
          quantity: String(lastEntry.totalMobilQty || '1'),
          amount: String(lastEntry.totalMobilAmount)
        }]);
      } else {
        setMobilEntries([]);
      }
      setIsFormClearedForFreshFill(false);

      Alert.alert(
        'पिछली शिफ्ट लोड हुई (Edit Mode)',
        `शिफ्ट ${lastEntry.shiftNumber || todayMachineEntries.length} का डेटा लोड कर दिया गया है। बदलाव करके सबमिट करने पर Admin OTP लगेगा।`
      );
    }
  };

  const handleSwitchToNewShift = () => {
    if (selectedMachine) {
      handleMachineChange(selectedMachine, selectedDate, selectedSalesman);
    }
  };

  // Calculations for Petrol (Tank 1)
  const pOpening = parseFloat(petrolOpeningMeter) || 0;
  const pClosing = parseFloat(petrolClosingMeter) || pOpening;
  const pNormalTesting = parseFloat(petrolTestingQty) || 0;
  const pOfficialTesting = parseFloat(petrolOfficialTestingQty) || 0;
  const pTesting = pNormalTesting + pOfficialTesting;
  const pGross = Math.max(0, pClosing - pOpening);
  const pNetSold = Math.max(0, pGross - pTesting);
  const pRateVal = parseFloat(petrolRate) || 0;
  const pExpected = pNetSold * pRateVal;

  // Calculations for Diesel (Tank 2)
  const dOpening = parseFloat(dieselOpeningMeter) || 0;
  const dClosing = parseFloat(dieselClosingMeter) || dOpening;
  const dNormalTesting = parseFloat(dieselTestingQty) || 0;
  const dOfficialTesting = parseFloat(dieselOfficialTestingQty) || 0;
  const dTesting = dNormalTesting + dOfficialTesting;
  const dGross = Math.max(0, dClosing - dOpening);
  const dNetSold = Math.max(0, dGross - dTesting);
  const dRateVal = parseFloat(dieselRate) || 0;
  const dExpected = dNetSold * dRateVal;

  // Combined Machine Totals & Additional Mobil Sales
  const totalLitersSold = pNetSold + dNetSold;
  const totalFuelAmount = pExpected + dExpected;
  const totalMobilAmount = mobilEntries.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const totalMobilQty = mobilEntries.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || (parseFloat(item.amount) > 0 ? 1 : 0)), 0);
  const udhariReturnTotal = calculateReturnTotal();
  const totalExpectedAmount = totalFuelAmount + totalMobilAmount + udhariReturnTotal;

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
    const activeDigitalModes = digitalEntries
      .filter(e => parseFloat(e.amount) > 0)
      .map(e => ({
        ...e,
        name: (e.name && e.name.trim()) ? e.name.trim() : (e.isCustom ? 'Other Digital' : e.name)
      }));
    const getModeSum = (mId) => activeDigitalModes.filter(e => e.modeId === mId).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const customSum = activeDigitalModes.filter(e => e.isCustom).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

    const validNewUdhari = udhariBreakdownData.filter(e => (e.name || '').trim() && parseFloat(e.amount) > 0);
    const validReturns = udhariReturnEntries.filter(e => parseFloat(e.amountReturned) > 0);
    const returnTotal = calculateReturnTotal();

    const activeMobilEntries = mobilEntries
      .filter(e => parseFloat(e.amount) > 0)
      .map(e => ({
        id: e.id,
        packSize: (e.packSize || '').trim() || 'मोबिल',
        quantity: parseInt(e.quantity, 10) || 1,
        amount: parseFloat(e.amount) || 0
      }));
    const finalTotalMobilAmount = activeMobilEntries.reduce((s, e) => s + e.amount, 0);
    const finalTotalMobilQty = activeMobilEntries.reduce((s, e) => s + e.quantity, 0);

    // Compute entry timestamp according to selectedDate
    const submissionDate = new Date(selectedDate);
    const now = new Date();
    if (isDateToday(selectedDate)) {
      submissionDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
      submissionDate.setHours(20, 0, 0);
    }

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
        normalTesting: pNormalTesting,
        officialTesting: pOfficialTesting,
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
        normalTesting: dNormalTesting,
        officialTesting: dOfficialTesting,
        fuelRate: dRateVal,
        totalQuantitySold: dNetSold,
        expectedAmount: dExpected,
        tankId: 'Tank-2'
      },

      // Additional Mobil Sale
      totalMobilAmount: finalTotalMobilAmount,
      totalMobilQty: finalTotalMobilQty,
      mobilEntries: activeMobilEntries,

      petrolTesting: pTesting,
      petrolNormalTesting: pNormalTesting,
      petrolOfficialTesting: pOfficialTesting,
      dieselTesting: dTesting,
      dieselNormalTesting: dNormalTesting,
      dieselOfficialTesting: dOfficialTesting,

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
      bobAmount: getModeSum('bob'),
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
      shiftNumber: (pTesting > 0 || dTesting > 0) ? 1 : 2,
      shiftLabel: (pTesting > 0 || dTesting > 0) ? 'Shift 1' : 'Shift 2',
      entryDate: submissionDate
    };

    const pdfPayload = {
      staffName,
      machineName,
      shiftNumber: (pTesting > 0 || dTesting > 0) ? 1 : 2,
      shiftLabel: (pTesting > 0 || dTesting > 0) ? 'Shift 1' : 'Shift 2',
      petrolNozzleId: currentPetrolNozzleId,
      dieselNozzleId: currentDieselNozzleId,
      petrolOpening: petrolOpeningMeter.trim(),
      petrolClosing: petrolClosingMeter.trim(),
      petrolTesting: pTesting,
      petrolNormalTesting: pNormalTesting,
      petrolOfficialTesting: pOfficialTesting,
      petrolNetSold: pNetSold,
      petrolRate: pRateVal,
      petrolExpected: pExpected,
      dieselOpening: dieselOpeningMeter.trim(),
      dieselClosing: dieselClosingMeter.trim(),
      dieselTesting: dTesting,
      dieselNormalTesting: dNormalTesting,
      dieselOfficialTesting: dOfficialTesting,
      dieselNetSold: dNetSold,
      dieselRate: dRateVal,
      dieselExpected: dExpected,
      totalMobilAmount: finalTotalMobilAmount,
      totalMobilQty: finalTotalMobilQty,
      mobilEntries: activeMobilEntries,
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
      entryDate: submissionDate
    };

    return { staffName, machineName, dbPayload, pdfPayload, activeDigitalModes, validNewUdhari, validReturns, returnTotal };
  };

  const refreshScreenCompletely = () => {
    // 1. Reset staff and machine selections
    setSelectedSalesman('');
    setSelectedMachine('');
    setSelectedMachineData(null);
    setShiftNumber(1);

    // 2. Reset opening meters
    setPetrolOpeningMeter('');
    setDieselOpeningMeter('');

    // 3. Reset all user input form fields
    resetFormFields();

    // 4. Reset support staff fields
    setSupportAmt('');
    setSupportNotes('');

    // 5. Reload submitted reports map for the selected date
    reloadSubmittedDataForDate(selectedDate);

    // 6. Scroll back to top
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  };

  const resetFormAfterSubmit = () => {
    refreshScreenCompletely();
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

    // Admin OTP is strictly required ONLY when explicitly editing an existing submitted report!
    // New shifts (Shift 2, Shift 3, etc.) submit directly without OTP.
    if (isEditMode && existingReportId) {
      setSubmitting(true);
      try {
        const { staffName, machineName } = buildCurrentData();
        const req = await createEditRequest(staffName, selectedSalesman, selectedMachine, machineName, existingReportId);
        setEditRequestId(req.requestId);
        setOtpInput('');
        setOtpModalVisible(true);
        Alert.alert(
          '🔐 Admin OTP आवश्यक है',
          'दर्ज हो चुके हिसाब में बदलाव करने के लिए Admin Dashboard से 6-digit OTP लेना अनिवार्य है।'
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

      // First refresh screen completely & scroll to top
      refreshScreenCompletely();

      // Show clear confirmation alert with PDF share option
      Alert.alert(
        'आपकी एंट्री सबमिट हो गई है! ✅',
        `स्टाफ: ${staffName}\nमशीन: ${machineName}\n\nदैनिक बिक्री डेटा सफलतापूर्वक दर्ज हो गया है और स्क्रीन रीफ्रेश हो गई है।`,
        [
          {
            text: '📄 PDF रसीद देखें / शेयर करें',
            onPress: async () => {
              try {
                await generateAndSharePdf(pdfPayload);
              } catch (pdfErr) {
                console.warn('PDF Share Error:', pdfErr);
              }
            }
          },
          {
            text: 'ठीक है (OK)',
            style: 'default'
          }
        ],
        { cancelable: false }
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

      setOtpModalVisible(false);
      setOtpInput('');

      // Refresh screen completely & scroll to top
      refreshScreenCompletely();

      Alert.alert(
        'आपकी एंट्री संशोधित/सबमिट हो गई है! ✅',
        `Admin OTP सत्यापित हुआ। डेटाबेस में संशोधित बिक्री अपडेट हो गई है और स्क्रीन रीफ्रेश हो गई है।`,
        [
          {
            text: '📄 PDF रसीद देखें / शेयर करें',
            onPress: async () => {
              try {
                await generateAndSharePdf(pdfPayload);
              } catch (pdfErr) {
                console.warn('PDF Share Error:', pdfErr);
              }
            }
          },
          {
            text: 'ठीक है (OK)',
            style: 'default'
          }
        ],
        { cancelable: false }
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

  const renderBreakdownInput = (key, label) => {
    const count = parseInt(breakdownData[key], 10) || 0;
    const unitVal = parseInt(key.replace(/[^0-9]/g, ''), 10) || 0;
    const rowTotal = count * unitVal;

    return (
      <View style={styles.breakdownInputWrapper} key={key}>
        <View style={styles.breakdownLabelBadge}>
          <Text style={styles.breakdownInputLabel}>{label}</Text>
        </View>
        <Text style={styles.breakdownMultiply}>×</Text>
        <View style={styles.breakdownInputContainer}>
          <TextInput
            style={styles.breakdownTextInput}
            keyboardType="numeric"
            value={breakdownData[key]}
            onChangeText={(t) => handleBreakdownChange(key, t)}
            placeholder="0"
            placeholderTextColor="#94A3B8"
            selectTextOnFocus
          />
        </View>
        <Text style={styles.breakdownEqual}>=</Text>
        <View style={styles.breakdownTotalBadge}>
          <Text style={[styles.breakdownTotalText, rowTotal > 0 && { color: '#003C8F' }]}>
            ₹{rowTotal.toLocaleString('en-IN')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent} 
          keyboardShouldPersistTaps="handled"
        >
          
          {/* Header Banner */}
          <View style={styles.header}>
            <View style={styles.headerIconWrapper}>
              <Icon name="hardware-chip" size={26} color="#fff" />
            </View>
            <View style={{flex: 1, marginLeft: 12}}>
              <Text style={styles.title}>दैनिक बिक्री एंट्री</Text>
              <Text style={styles.subtitle}>1 Staff • 1 Machine (Petrol Tank 1 & Diesel Tank 2)</Text>
            </View>
          </View>

          {/* Top Date Selection Card (Today, Yesterday, Last Dates) */}
          <View style={styles.dateSelectorCard}>
            <View style={styles.dateSelectorHeader}>
              <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8}}>
                <Icon name="calendar" size={18} color="#003C8F" style={{marginRight: 6}} />
                <Text style={styles.dateSelectorTitle} numberOfLines={1}>एंट्री की तारीख (Entry Date):</Text>
              </View>
              <Text style={styles.dateDisplayBadge}>
                {selectedDate.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>

            {/* Quick Pills: Today / Yesterday / Other Date */}
            <View style={styles.datePillsRow}>
              <TouchableOpacity
                style={[styles.datePill, dateFilterMode === 'today' && styles.datePillActive]}
                onPress={() => handleSelectDateMode('today')}
              >
                <Icon 
                  name="today" 
                  size={15} 
                  color={dateFilterMode === 'today' ? '#FFFFFF' : '#003C8F'} 
                  style={{marginRight: 4}} 
                />
                <Text style={[styles.datePillText, dateFilterMode === 'today' && styles.datePillTextActive]}>
                  आज (Today)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.datePill, dateFilterMode === 'yesterday' && styles.datePillActive]}
                onPress={() => handleSelectDateMode('yesterday')}
              >
                <Icon 
                  name="play-back" 
                  size={15} 
                  color={dateFilterMode === 'yesterday' ? '#FFFFFF' : '#003C8F'} 
                  style={{marginRight: 4}} 
                />
                <Text style={[styles.datePillText, dateFilterMode === 'yesterday' && styles.datePillTextActive]}>
                  कल (Yesterday)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.datePill, dateFilterMode === 'custom' && styles.datePillActive]}
                onPress={() => handleSelectDateMode('custom')}
              >
                <Icon 
                  name="calendar-number" 
                  size={15} 
                  color={dateFilterMode === 'custom' ? '#FFFFFF' : '#003C8F'} 
                  style={{marginRight: 4}} 
                />
                <Text style={[styles.datePillText, dateFilterMode === 'custom' && styles.datePillTextActive]}>
                  {dateFilterMode === 'custom'
                    ? selectedDate.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' })
                    : 'तारीख चुनें...'}
                </Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={handleCustomDateChange}
              />
            )}
          </View>

          {/* 1. Selection Section */}
          <View style={styles.formCard}>
            <Text style={styles.label}>1. अपना नाम चुनें (Select Staff Name) *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedSalesman}
                onValueChange={(val) => {
                  handleSalesmanChange(val);
                }}
                style={[styles.picker, { color: '#0F172A', backgroundColor: '#FFFFFF' }]}
                dropdownIconColor="#003C8F"
                itemStyle={{ color: '#0F172A', fontSize: 15 }}
                mode="dropdown"
              >
                <Picker.Item 
                  label="-- स्टाफ का नाम चुनें --" 
                  value="" 
                  color="#64748B" 
                  style={{ color: '#64748B', backgroundColor: '#FFFFFF' }}
                />
                {effectiveSalesmen.map(s => {
                  const hasSubmitted = Boolean(submittedSalesmenMap[s.id] && submittedSalesmenMap[s.id].length > 0);
                  const rolePrefix = s.staffType === 'watchman' ? '🛡️ ' : (s.staffType === 'sweeper' ? '🧹 ' : '👤 ');
                  const roleSuffix = s.staffType === 'watchman' ? ' [चौकीदार]' : (s.staffType === 'sweeper' ? ' [सफाईकर्मी]' : '');
                  return (
                    <Picker.Item 
                      key={s.id} 
                      label={hasSubmitted ? `✓ ${s.name}${roleSuffix} (दर्ज / Submitted)` : `${rolePrefix}${s.name}${roleSuffix}`} 
                      value={s.id} 
                      color={hasSubmitted ? '#94A3B8' : '#0F172A'} 
                      style={{ 
                        color: hasSubmitted ? '#94A3B8' : '#0F172A', 
                        backgroundColor: hasSubmitted ? '#F8FAFC' : '#FFFFFF' 
                      }}
                    />
                  );
                })}
              </Picker>
            </View>
            {effectiveSalesmen.length === 0 && (
              <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
                ⚠️ कोई स्टाफ उपलब्ध नहीं है। कृपया पहले Owner App से नया स्टाफ रजिस्टर करें।
              </Text>
            )}
            {selectedSalesman ? (
              <View style={[
                styles.selectedIndicatorBadge,
                submittedSalesmenMap[selectedSalesman]?.length > 0 && { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }
              ]}>
                <Icon 
                  name={submittedSalesmenMap[selectedSalesman]?.length > 0 ? "alert-circle" : "checkmark-circle"} 
                  size={14} 
                  color={submittedSalesmenMap[selectedSalesman]?.length > 0 ? "#D97706" : "#16A34A"} 
                />
                <Text style={styles.selectedIndicatorText}>
                  चयनित स्टाफ: <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>{effectiveSalesmen.find(s => s.id === selectedSalesman)?.name || 'Staff'}</Text>
                  {submittedSalesmenMap[selectedSalesman]?.length > 0 && (
                    <Text style={{ color: '#B45309', fontWeight: 'bold' }}> (⚠️ इस तारीख को डेटा दर्ज है)</Text>
                  )}
                </Text>
              </View>
            ) : null}

            {/* STEP 2: Only shown for regular Salesmen (Machines & Meters) */}
            {!isSupportStaff && (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>2. अपनी मशीन चुनें (Select Machine) *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedMachine}
                    onValueChange={(val) => handleMachineChange(val)}
                    style={[styles.picker, { color: '#0F172A', backgroundColor: '#FFFFFF' }]}
                    dropdownIconColor="#003C8F"
                    itemStyle={{ color: '#0F172A', fontSize: 15 }}
                    mode="dropdown"
                  >
                    <Picker.Item 
                      label="-- डिस्पेंसर मशीन चुनें --" 
                      value="" 
                      color="#64748B" 
                      style={{ color: '#64748B', backgroundColor: '#FFFFFF' }}
                    />
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
                          color="#0F172A"
                          style={{ color: '#0F172A', backgroundColor: '#FFFFFF' }}
                        />
                      );
                    })}
                  </Picker>
                </View>
                {effectiveMachines.length === 0 && (
                  <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
                    ⚠️ कोई मशीन उपलब्ध नहीं है। कृपया पहले Owner App (Settings) से डिस्पेंसर मशीन जोड़ें।
                  </Text>
                )}
                {selectedMachine ? (
                  <View style={styles.selectedIndicatorBadge}>
                    <Icon name="checkmark-circle" size={14} color="#16A34A" />
                    <Text style={styles.selectedIndicatorText}>
                      चयनित मशीन: <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>{effectiveMachines.find(m => m.id === selectedMachine)?.name || selectedMachine}</Text>
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* NON-DISPENSER SUPPORT STAFF PAYMENT CARD (Chaukidaar / Sweeper) */}
          {isSupportStaff && selectedSalesman ? (
            <View style={[styles.sectionCard, { borderLeftColor: (selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार')) ? '#1E40AF' : '#065F46', borderLeftWidth: 5, marginTop: 14 }]}>
              {/* Header */}
              <View style={styles.supportStaffHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Icon 
                    name={(selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार')) ? "shield-checkmark" : "brush"} 
                    size={24} 
                    color={(selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार')) ? "#1E40AF" : "#065F46"} 
                    style={{ marginRight: 8 }} 
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.supportStaffTitle, { color: (selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार')) ? "#1E40AF" : "#065F46" }]}>
                      {(selectedStaffObj?.staffType === 'watchman' || selectedStaffObj?.name?.toLowerCase().includes('चौकीदार')) ? '🛡️ चौकीदार (Watchman) — मजदूरी / मानदेय' : '🧹 सफाईकर्मी (Sweeper) — मजदूरी / वेतन'}
                    </Text>
                    <Text style={styles.supportStaffSub}>
                      गैर-डिस्पेंसर कर्मचारी भुगतान (सीधे खर्चों में दर्ज होगा)
                    </Text>
                  </View>
                </View>
              </View>

              {/* Staff Details Banner */}
              <View style={styles.supportInfoBanner}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.supportInfoName}>{selectedStaffObj?.name}</Text>
                  <Text style={styles.supportInfoDate}>
                    {selectedDate.toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                </View>
                {selectedStaffObj?.phone ? (
                  <Text style={styles.supportInfoPhone}>📱 {selectedStaffObj.phone}</Text>
                ) : null}
              </View>

              {/* Previous Advances / Month Total ("जहाँ से कितना पैसा लिए हैं वो दिख सके") */}
              <View style={styles.supportHistoryBox}>
                <View style={styles.supportHistoryHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="time-outline" size={17} color="#B45309" style={{ marginRight: 5 }} />
                    <Text style={styles.supportHistoryTitle}>इस महीने लिए गए पैसों का हिसाब:</Text>
                  </View>
                  <TouchableOpacity onPress={() => loadSupportStaffAdvances(selectedSalesman, selectedDate, selectedStaffObj?.name)}>
                    <Icon name="refresh-outline" size={16} color="#003C8F" />
                  </TouchableOpacity>
                </View>

                <View style={styles.supportMonthTotalBanner}>
                  <View>
                    <Text style={styles.supportMonthTotalLabel}>इस महीने कुल लिया गया पैसा:</Text>
                    <Text style={styles.supportMonthTotalVal}>₹{supportMonthTotal.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.supportCountBadge}>
                    <Text style={styles.supportCountBadgeText}>{supportAdvanceHistory.length} बार भुगतान</Text>
                  </View>
                </View>

                {/* Itemized List of Past Advances for this staff */}
                {supportHistoryLoading ? (
                  <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#003C8F" />
                  </View>
                ) : supportAdvanceHistory.length === 0 ? (
                  <View style={styles.supportEmptyHistory}>
                    <Icon name="checkmark-done-circle-outline" size={18} color="#16A34A" />
                    <Text style={styles.supportEmptyHistoryText}>इस महीने अभी तक कोई पिछला भुगतान दर्ज नहीं है।</Text>
                  </View>
                ) : (
                  <View style={styles.supportHistoryList}>
                    {supportAdvanceHistory.map((item, idx) => {
                      const dateStr = item.date || (item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString('hi-IN', { day: '2-digit', month: 'short' }) : 'पूर्व भुगतान');
                      return (
                        <View key={item.id || idx} style={styles.supportHistoryRow}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={styles.supportHistoryDate}>📅 {dateStr}</Text>
                              {item.paymentMode ? (
                                <View style={styles.supportHistoryModeBadge}>
                                  <Text style={styles.supportHistoryModeText}>{item.paymentMode}</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.supportHistoryNotes} numberOfLines={1}>
                              {item.notes || 'मजदूरी / मानदेय'}
                            </Text>
                          </View>
                          <Text style={styles.supportHistoryAmt}>₹{Number(item.amount || 0).toLocaleString('en-IN')}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* New Payment Entry Form */}
              <View style={styles.supportEntryForm}>
                <Text style={styles.supportEntryTitle}>💰 नया भुगतान दर्ज करें (Enter Payment):</Text>

                {/* Amount input */}
                <CustomInput 
                  label="भुगतान राशि (Payment Amount ₹) *" 
                  keyboardType="numeric" 
                  value={supportAmt} 
                  onChangeText={(t) => setSupportAmt(sanitizeDecimalInput(t))} 
                  leftIcon="cash-outline" 
                  placeholder="0.00"
                />

                {/* Quick Amount Chips */}
                <View style={styles.quickChipsRow}>
                  {['100', '200', '500', '1000', '2000', '5000'].map(chipVal => (
                    <TouchableOpacity
                      key={chipVal}
                      style={styles.quickChipBtn}
                      onPress={() => {
                        const cur = parseFloat(supportAmt) || 0;
                        setSupportAmt(String(cur + parseInt(chipVal, 10)));
                      }}
                    >
                      <Text style={styles.quickChipText}>+₹{chipVal}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Payment Mode Selector */}
                <Text style={[styles.inputLabelCustom, { marginTop: 12, marginBottom: 6 }]}>
                  भुगतान का माध्यम (Payment Mode):
                </Text>
                <View style={styles.supportModeRow}>
                  {[
                    { id: 'Cash', label: '💵 कैश (Cash)', color: '#16A34A' },
                    { id: 'PhonePe', label: '📱 PhonePe / UPI', color: '#5F259F' },
                    { id: 'BOB Bank', label: '🏦 BOB / Bank', color: '#EA580C' }
                  ].map(m => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setSupportPaymentMode(m.id)}
                      style={[
                        styles.supportModeBtn,
                        supportPaymentMode === m.id && { backgroundColor: m.color, borderColor: m.color }
                      ]}
                    >
                      <Text style={[
                        styles.supportModeBtnText,
                        supportPaymentMode === m.id && { color: '#FFFFFF', fontWeight: 'bold' }
                      ]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes / Reason */}
                <View style={{ marginTop: 12 }}>
                  <CustomInput 
                    label="भुगतान का कारण / विवरण (Notes)" 
                    value={supportNotes} 
                    onChangeText={setSupportNotes} 
                    leftIcon="reader-outline" 
                    placeholder="उदा. दैनिक मजदूरी / चौकीदार मानदेय"
                  />
                </View>

                {/* Notice info */}
                <View style={styles.supportNoticeBanner}>
                  <Icon name="information-circle-outline" size={16} color="#0369A1" />
                  <Text style={styles.supportNoticeText}>
                    यह राशि आज के खर्चों (Expenses) में जुड़ेगी तथा दैनिक ऑडिट रिपोर्ट (PDF) व Owner Dashboard में दिखाई देगी।
                  </Text>
                </View>

                {/* Save Button */}
                <CustomButton 
                  title={supportSaving ? "दर्ज हो रहा है..." : "💾 भुगतान दर्ज करें (Save Payment)"} 
                  onPress={handleSaveSupportPayment} 
                  loading={supportSaving} 
                  disabled={!supportAmt || parseFloat(supportAmt) <= 0 || supportSaving}
                  type={(!supportAmt || parseFloat(supportAmt) <= 0) ? "secondary" : "primary"}
                  style={{ marginTop: 14 }}
                />
              </View>
            </View>
          ) : null}

          {/* Shift Indicator & Selector Card */}
          {selectedMachine !== '' && (
            <View style={[styles.shiftCard, shiftNumber > 1 ? styles.shiftCardShift2 : styles.shiftCardShift1]}>
              <View style={styles.shiftCardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.shiftPill, shiftNumber > 1 ? styles.shiftPillShift2 : styles.shiftPillShift1]}>
                    <Icon name={shiftNumber > 1 ? "moon" : "sunny"} size={14} color={shiftNumber > 1 ? "#7C3AED" : "#D97706"} />
                    <Text style={[styles.shiftPillText, shiftNumber > 1 ? styles.shiftPillTextShift2 : styles.shiftPillTextShift1]}>
                      {shiftNumber === 1 ? 'शिफ्ट 1 (Testing Add)' : 'शिफ्ट 2 (No Testing)'}
                    </Text>
                  </View>
                  <Text style={styles.shiftCardMachineName}>
                    {effectiveMachines.find(m => m.id === selectedMachine)?.name || selectedMachine}
                  </Text>
                </View>
                {shiftNumber > 1 && (
                  <View style={styles.linkedBadge}>
                    <Icon name="link" size={12} color="#0284C7" />
                    <Text style={styles.linkedBadgeText}>मीटर लिंक्ड</Text>
                  </View>
                )}
              </View>

              {/* Shift Selection Buttons (Testing vs No Testing) */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setShiftNumber(1);
                    if (petrolTestingQty === '0' || !petrolTestingQty) setPetrolTestingQty('5');
                    if (dieselTestingQty === '0' || !dieselTestingQty) setDieselTestingQty('5');
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: shiftNumber === 1 ? '#D97706' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#D97706'
                  }}
                >
                  <Icon name="sunny" size={14} color={shiftNumber === 1 ? "#FFFFFF" : "#D97706"} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: shiftNumber === 1 ? "#FFFFFF" : "#D97706" }}>
                    शिफ्ट 1 (Testing Add)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setShiftNumber(2);
                    setPetrolTestingQty('0');
                    setDieselTestingQty('0');
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: shiftNumber === 2 ? '#7C3AED' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#7C3AED'
                  }}
                >
                  <Icon name="moon" size={14} color={shiftNumber === 2 ? "#FFFFFF" : "#7C3AED"} style={{ marginRight: 4 }} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: shiftNumber === 2 ? "#FFFFFF" : "#7C3AED" }}>
                    शिफ्ट 2 (No Testing)
                  </Text>
                </TouchableOpacity>
              </View>

              {shiftNumber > 1 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.shiftInfoText}>
                    ⚡ शिफ्ट 2 में टेस्टिंग तेल नहीं जुड़ेगा (0 L)। ओपनिंग मीटर पिछली शिफ्ट से स्वतः लिंक्ड है।
                  </Text>
                  
                  {!isEditMode && todayMachineEntries.length > 0 && (
                    <TouchableOpacity style={styles.shiftActionBtn} onPress={handleEditPreviousShift}>
                      <Icon name="create-outline" size={14} color="#003C8F" />
                      <Text style={styles.shiftActionBtnText}>
                        यदि पिछली शिफ्ट (शिफ्ट {todayMachineEntries.length}) सुधारनी है, तो यहाँ दबाएँ
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.shiftInfoText}>
                    ☀️ शिफ्ट 1: टेस्टिंग का तेल Tank 1 और Tank 2 में वापस जुड़ेगा।
                  </Text>
                </View>
              )}

              {isEditMode && (
                <TouchableOpacity style={[styles.shiftActionBtn, { borderColor: '#16A34A', backgroundColor: '#F0FDF4', marginTop: 8 }]} onPress={handleSwitchToNewShift}>
                  <Icon name="add-circle-outline" size={14} color="#16A34A" />
                  <Text style={[styles.shiftActionBtnText, { color: '#15803D', fontWeight: 'bold' }]}>
                    ➕ नई शिफ्ट {todayMachineEntries.length + 1} का फॉर्म भरें (New Shift)
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

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

                {/* Mobil Row (if any) */}
                {totalMobilAmount > 0 && (
                  <View style={styles.receiptFuelRow}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <View style={[styles.fuelDot, { backgroundColor: '#7C3AED' }]} />
                      <Text style={styles.fuelLabel}>मोबिल ऑयल ({totalMobilQty} Pcs):</Text>
                    </View>
                    <Text style={styles.fuelValueText}>
                      <Text style={{color: '#7C3AED', fontWeight: 'bold'}}>+₹{totalMobilAmount.toFixed(2)}</Text>
                    </Text>
                  </View>
                )}

                <View style={styles.receiptDivider} />

                {/* Separate Petrol & Diesel Net Sold (Never Combined) */}
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptMainLabel, { color: '#EA580C' }]}>पेट्रोल शुद्ध बिक्री (Petrol MS):</Text>
                  <Text style={[styles.receiptMainValue, { color: '#EA580C' }]}>{pNetSold.toFixed(4)} L</Text>
                </View>
                <View style={styles.receiptRow}>
                  <Text style={[styles.receiptMainLabel, { color: '#003C8F' }]}>डीजल शुद्ध बिक्री (Diesel HSD):</Text>
                  <Text style={[styles.receiptMainValue, { color: '#003C8F' }]}>{dNetSold.toFixed(4)} L</Text>
                </View>

                {/* Fuel Amount Subtotal */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMainLabel}>ईंधन बिक्री राशि (Fuel Sales):</Text>
                  <Text style={styles.receiptMainValue}>₹{totalFuelAmount.toFixed(2)}</Text>
                </View>

                {/* Udhari Return Inflow (if any) */}
                {udhariReturnTotal > 0 && (
                  <View style={styles.receiptRow}>
                    <Text style={[styles.receiptMainLabel, { color: '#15803D' }]}>+ उधारी वापसी प्राप्त (Udhari Received):</Text>
                    <Text style={[styles.receiptMainValue, { color: '#15803D', fontWeight: 'bold' }]}>+₹{udhariReturnTotal.toFixed(2)}</Text>
                  </View>
                )}

                {/* Total Expected Amount */}
                <View style={styles.receiptRow}>
                  <Text style={styles.receiptMainLabel}>अपेक्षित कुल जमा (Expected Total):</Text>
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
                  placeholder="0.00"
                />

                {/* Petrol Closing Meter */}
                <View style={{ marginTop: 10 }}>
                  <CustomInput 
                    label="पेट्रोल क्लोजिंग मीटर (Closing Meter) *" 
                    keyboardType="numeric" 
                    value={petrolClosingMeter} 
                    onChangeText={(t) => setPetrolClosingMeter(sanitizeDecimalInput(t))} 
                    leftIcon="keypad-outline" 
                    placeholder="0.00"
                  />
                </View>

                {/* Testing Section: Daily Testing & Official Testing Side-by-Side */}
                <View style={styles.twoColumnRow}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <CustomInput 
                      label="दैनिक जांच (Testing L)" 
                      keyboardType="numeric" 
                      value={petrolTestingQty} 
                      onChangeText={(t) => setPetrolTestingQty(sanitizeDecimalInput(t))} 
                      leftIcon="flask-outline" 
                      placeholder={shiftNumber === 1 ? "5" : "0"}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <CustomInput 
                      label="ऑफिशियल जांच (Official L)" 
                      keyboardType="numeric" 
                      value={petrolOfficialTestingQty} 
                      onChangeText={(t) => setPetrolOfficialTestingQty(sanitizeDecimalInput(t))} 
                      leftIcon="shield-checkmark-outline" 
                      placeholder="0"
                    />
                  </View>
                </View>

                {/* Petrol Rate */}
                <View style={{ marginTop: 10 }}>
                  <CustomInput 
                    label="पेट्रोल रेट (₹/L) *" 
                    keyboardType="numeric" 
                    value={petrolRate} 
                    onChangeText={(t) => setPetrolRate(sanitizeDecimalInput(t))} 
                    leftIcon="pricetag-outline" 
                    placeholder="0.00"
                  />
                </View>

                {/* Information badge if testing was already recorded today (Shift 1 only) */}
                {shiftNumber === 1 && petrolTestingAlreadyDone && (
                  <View style={styles.testingDoneNotice}>
                    <Icon name="information-circle-outline" size={16} color="#0284C7" />
                    <Text style={[styles.testingDoneText, { color: '#0369A1' }]}>
                      आज इस मशीन पर पहले टेस्टिंग दर्ज हो चुकी है (यदि पुनः टेस्टिंग हुई है तो मात्रा बदलें, अन्यथा 0 L रखें).
                    </Text>
                  </View>
                )}

                {/* Official Testing notice if entered */}
                {pOfficialTesting > 0 && (
                  <View style={[styles.tankReturnNotice, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                    <Icon name="shield-checkmark" size={16} color="#16A34A" />
                    <Text style={[styles.tankReturnText, { color: '#166534' }]}>
                      {`ऑफिशियल जांच दर्ज: ${pOfficialTesting} L (कुल जांच तेल: ${pTesting} L वापस Tank 1 में जुड़ेगा)`}
                    </Text>
                  </View>
                )}

                {/* Return to Tank Notice */}
                {pTesting > 0 && pOfficialTesting === 0 && (
                  <View style={styles.tankReturnNotice}>
                    <Icon name="arrow-undo-circle" size={16} color="#0369A1" />
                    <Text style={styles.tankReturnText}>
                      {`${pTesting} L टेस्टिंग का तेल वापस Tank 1 (पेट्रोल) में जुड़ जाएगा.`}
                    </Text>
                  </View>
                )}

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
                  placeholder="0.00"
                />

                {/* Diesel Closing Meter */}
                <View style={{ marginTop: 10 }}>
                  <CustomInput 
                    label="डीजल क्लोजिंग मीटर (Closing Meter) *" 
                    keyboardType="numeric" 
                    value={dieselClosingMeter} 
                    onChangeText={(t) => setDieselClosingMeter(sanitizeDecimalInput(t))} 
                    leftIcon="keypad-outline" 
                    placeholder="0.00"
                  />
                </View>

                {/* Testing Section: Daily Testing & Official Testing Side-by-Side */}
                <View style={styles.twoColumnRow}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <CustomInput 
                      label="दैनिक जांच (Testing L)" 
                      keyboardType="numeric" 
                      value={dieselTestingQty} 
                      onChangeText={(t) => setDieselTestingQty(sanitizeDecimalInput(t))} 
                      leftIcon="flask-outline" 
                      placeholder={shiftNumber === 1 ? "5" : "0"}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <CustomInput 
                      label="ऑफिशियल जांच (Official L)" 
                      keyboardType="numeric" 
                      value={dieselOfficialTestingQty} 
                      onChangeText={(t) => setDieselOfficialTestingQty(sanitizeDecimalInput(t))} 
                      leftIcon="shield-checkmark-outline" 
                      placeholder="0"
                    />
                  </View>
                </View>

                {/* Diesel Rate */}
                <View style={{ marginTop: 10 }}>
                  <CustomInput 
                    label="डीजल रेट (₹/L) *" 
                    keyboardType="numeric" 
                    value={dieselRate} 
                    onChangeText={(t) => setDieselRate(sanitizeDecimalInput(t))} 
                    leftIcon="pricetag-outline" 
                    placeholder="0.00"
                  />
                </View>

                {/* Information badge if testing was already recorded today (Shift 1 only) */}
                {shiftNumber === 1 && dieselTestingAlreadyDone && (
                  <View style={styles.testingDoneNotice}>
                    <Icon name="information-circle-outline" size={16} color="#0284C7" />
                    <Text style={[styles.testingDoneText, { color: '#0369A1' }]}>
                      आज इस मशीन पर पहले टेस्टिंग दर्ज हो चुकी है (यदि पुनः टेस्टिंग हुई है तो मात्रा बदलें, अन्यथा 0 L रखें).
                    </Text>
                  </View>
                )}

                {/* Official Testing notice if entered */}
                {dOfficialTesting > 0 && (
                  <View style={[styles.tankReturnNotice, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
                    <Icon name="shield-checkmark" size={16} color="#16A34A" />
                    <Text style={[styles.tankReturnText, { color: '#166534' }]}>
                      {`ऑफिशियल जांच दर्ज: ${dOfficialTesting} L (कुल जांच तेल: ${dTesting} L वापस Tank 2 में जुड़ेगा)`}
                    </Text>
                  </View>
                )}

                {/* Return to Tank Notice */}
                {dTesting > 0 && dOfficialTesting === 0 && (
                  <View style={styles.tankReturnNotice}>
                    <Icon name="arrow-undo-circle" size={16} color="#0369A1" />
                    <Text style={styles.tankReturnText}>
                      {`${dTesting} L टेस्टिंग का तेल वापस Tank 2 (डीजल) में जुड़ जाएगा.`}
                    </Text>
                  </View>
                )}

                {/* Diesel Sold Preview */}
                <View style={styles.previewBox}>
                  <Text style={styles.previewText}>
                    डीजल शुद्ध बिक्री: <Text style={{fontWeight: 'bold'}}>{dNetSold.toFixed(4)} L</Text>  |  अपेक्षित: <Text style={{fontWeight: 'bold', color: '#003C8F'}}>₹{dExpected.toFixed(2)}</Text>
                  </Text>
                </View>
              </View>

              {/* SECTION: ADDITIONAL MOBIL (ENGINE OIL / LUBRICANTS) SALE */}
              <View style={[styles.sectionCard, { borderLeftColor: '#7C3AED', borderLeftWidth: 5, marginTop: 14 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                    <Icon name="color-palette-outline" size={20} color="#7C3AED" style={{marginRight: 6}} />
                    <View style={{flex: 1}}>
                      <Text style={[styles.sectionTitle, { color: '#7C3AED' }]}>अतिरिक्त बिक्री: मोबिल ऑयल (Mobil Sale)</Text>
                      <Text style={{fontSize: 11, color: '#64748B'}}>इंजन ऑयल / 2T ऑयल / ल्यूब (वैकल्पिक)</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.addMobilBtn}
                    onPress={() => handleAddMobilRow('')}
                  >
                    <Icon name="add-circle" size={17} color="#fff" style={{marginRight: 4}} />
                    <Text style={styles.addMobilBtnText}>+ मोबिल जोड़ें</Text>
                  </TouchableOpacity>
                </View>

                {/* Empty State or Mobil List */}
                {mobilEntries.length === 0 ? (
                  <View style={styles.emptyMobilBox}>
                    <Icon name="cube-outline" size={32} color="#A78BFA" />
                    <Text style={styles.emptyMobilText}>
                      इस शिफ्ट में यदि कोई मोबिल ऑयल बिका है तो ऊपर '+ मोबिल जोड़ें' दबाएं.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    {mobilEntries.map((mItem, index) => (
                      <View key={mItem.id} style={styles.mobilItemCard}>
                        <View style={styles.mobilItemHeader}>
                          <Text style={styles.mobilItemNumber}>#{index + 1} मोबिल एंट्री</Text>
                          <TouchableOpacity onPress={() => handleRemoveMobilRow(mItem.id)} style={styles.mobilTrashBtn}>
                            <Icon name="trash-outline" size={18} color="#DC2626" />
                          </TouchableOpacity>
                        </View>

                        {/* Row with: Pack Size / Type, Quantity, Amount */}
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
                          <View style={{ flex: 1.8, marginRight: 6 }}>
                            <CustomInput 
                              label="मात्रा (ML / L)" 
                              placeholder="Type ML / L" 
                              value={mItem.packSize} 
                              onChangeText={(val) => handleUpdateMobilRow(mItem.id, 'packSize', val)} 
                              style={{ marginBottom: 0 }}
                              inputStyle={{ height: 44, padding: 8, fontSize: 13 }}
                            />
                          </View>
                          <View style={{ flex: 1.1, marginRight: 6 }}>
                            <CustomInput 
                              label="पीस (Qty)" 
                              keyboardType="numeric" 
                              placeholder="1" 
                              value={mItem.quantity} 
                              onChangeText={(val) => handleUpdateMobilRow(mItem.id, 'quantity', val)} 
                              style={{ marginBottom: 0 }}
                              inputStyle={{ height: 44, padding: 8, textAlign: 'center', fontSize: 13 }}
                            />
                          </View>
                          <View style={{ flex: 1.8 }}>
                            <CustomInput 
                              label="कुल रकम (₹) *" 
                              keyboardType="numeric" 
                              placeholder="0.00" 
                              value={mItem.amount} 
                              onChangeText={(val) => handleUpdateMobilRow(mItem.id, 'amount', val)} 
                              leftIcon="cash-outline"
                              style={{ marginBottom: 0 }}
                              inputStyle={{ height: 44, padding: 8, fontSize: 13 }}
                            />
                          </View>
                        </View>
                      </View>
                    ))}

                    {/* Mobil Total Live Summary */}
                    <View style={styles.mobilTotalBanner}>
                      <Text style={styles.mobilTotalText}>
                        कुल मोबिल बिक्री: <Text style={{fontWeight: 'bold'}}>{totalMobilQty} पीस</Text>  |  रकम: <Text style={{fontWeight: 'bold', color: '#7C3AED'}}>₹{totalMobilAmount.toFixed(2)}</Text>
                      </Text>
                    </View>
                  </View>
                )}
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
                  {udhariReturnTotal > 0 && (
                    <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#BBF7D0', marginBottom: 8}}>
                      <Icon name="information-circle" size={14} color="#16A34A" />
                      <Text style={{fontSize: 11, color: '#15803D', fontWeight: '700', marginLeft: 4}}>
                        उधारी वापसी के ₹{udhariReturnTotal.toFixed(0)} आपके कुल कैश में शामिल हैं।
                      </Text>
                    </View>
                  )}
                  
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

                {/* 2. Multi-Mode Digital & Bank Payments (Direct 4-Mode Breakdown) */}
                <View style={{marginBottom: 16}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
                    <Text style={styles.inputLabelCustom}>2. Digital Payments</Text>
                    <TouchableOpacity 
                      style={styles.openDigitalMiniBtn}
                      onPress={() => setDigitalModalVisible(true)}
                    >
                      <Icon name="options-outline" size={13} color="#003C8F" style={{marginRight: 3}} />
                      <Text style={styles.openDigitalMiniText}>विस्तार सूची</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.digitalDirectCard}>
                    {/* 2x2 Grid of Fixed Modes */}
                    <View style={styles.digitalGridRow}>
                      {/* Paytm */}
                      <View style={styles.digitalGridCol}>
                        <View style={[styles.digitalInputHeader, { borderLeftColor: '#00B9F5' }]}>
                          <Icon name="wallet" size={15} color="#00B9F5" style={{marginRight: 4}} />
                          <Text style={[styles.digitalInputTitle, { color: '#0284C7' }]}>Paytm (पेटीएम)</Text>
                        </View>
                        <CustomInput 
                          keyboardType="numeric" 
                          placeholder="0.00" 
                          value={digitalEntries.find(d => d.id === 'paytm')?.amount || ''} 
                          onChangeText={(v) => handleDigitalAmountChange('paytm', v)}
                          leftIcon="qr-code-outline"
                          style={{ marginBottom: 0 }}
                          inputStyle={{ height: 44, padding: 8, fontSize: 14, fontWeight: '700' }}
                        />
                      </View>

                      {/* PhonePe */}
                      <View style={styles.digitalGridCol}>
                        <View style={[styles.digitalInputHeader, { borderLeftColor: '#5F259F' }]}>
                          <Icon name="phone-portrait" size={15} color="#5F259F" style={{marginRight: 4}} />
                          <Text style={[styles.digitalInputTitle, { color: '#5F259F' }]}>PhonePe (फोनपे)</Text>
                        </View>
                        <CustomInput 
                          keyboardType="numeric" 
                          placeholder="0.00" 
                          value={digitalEntries.find(d => d.id === 'phonepe' || d.id === 'phonePe')?.amount || ''} 
                          onChangeText={(v) => handleDigitalAmountChange('phonepe', v)}
                          leftIcon="qr-code-outline"
                          style={{ marginBottom: 0 }}
                          inputStyle={{ height: 44, padding: 8, fontSize: 14, fontWeight: '700' }}
                        />
                      </View>
                    </View>

                    <View style={[styles.digitalGridRow, { marginTop: 10 }]}>
                      {/* ATM / POS */}
                      <View style={styles.digitalGridCol}>
                        <View style={[styles.digitalInputHeader, { borderLeftColor: '#003C8F' }]}>
                          <Icon name="card" size={15} color="#003C8F" style={{marginRight: 4}} />
                          <Text style={[styles.digitalInputTitle, { color: '#003C8F' }]}>ATM / POS स्वाइप</Text>
                        </View>
                        <CustomInput 
                          keyboardType="numeric" 
                          placeholder="0.00" 
                          value={digitalEntries.find(d => d.id === 'atm')?.amount || ''} 
                          onChangeText={(v) => handleDigitalAmountChange('atm', v)}
                          leftIcon="card-outline"
                          style={{ marginBottom: 0 }}
                          inputStyle={{ height: 44, padding: 8, fontSize: 14, fontWeight: '700' }}
                        />
                      </View>

                      {/* BOB Bank */}
                      <View style={styles.digitalGridCol}>
                        <View style={[styles.digitalInputHeader, { borderLeftColor: '#EA580C' }]}>
                          <Icon name="business" size={15} color="#EA580C" style={{marginRight: 4}} />
                          <Text style={[styles.digitalInputTitle, { color: '#EA580C' }]}>BOB Bank (बड़ौदा)</Text>
                        </View>
                        <CustomInput 
                          keyboardType="numeric" 
                          placeholder="0.00" 
                          value={digitalEntries.find(d => d.id === 'bob')?.amount || ''} 
                          onChangeText={(v) => handleDigitalAmountChange('bob', v)}
                          leftIcon="business-outline"
                          style={{ marginBottom: 0 }}
                          inputStyle={{ height: 44, padding: 8, fontSize: 14, fontWeight: '700' }}
                        />
                      </View>
                    </View>

                    {/* Custom / Added Permanent Digital Payments */}
                    {digitalEntries.filter(d => !d.isFixed).length > 0 && (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
                          अन्य स्थायी डिजिटल माध्यम (Permanent Modes):
                        </Text>
                        {digitalEntries.filter(d => !d.isFixed).map((item) => (
                          <View key={item.id} style={styles.customDigitalRow}>
                            <View style={styles.customDigitalNameCol}>
                              <View style={[styles.digitalInputHeader, { borderLeftColor: item.color || '#0F766E' }]}>
                                <Icon name={item.icon || 'card'} size={15} color={item.color || '#0F766E'} style={{ marginRight: 4 }} />
                                <Text style={[styles.digitalInputTitle, { color: item.color || '#0F766E' }]} numberOfLines={1}>
                                  {item.name}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.customDigitalAmountCol}>
                              <CustomInput 
                                keyboardType="numeric" 
                                placeholder="0.00" 
                                value={item.amount || ''} 
                                onChangeText={(val) => handleDigitalAmountChange(item.id, val)}
                                leftIcon="cash-outline"
                                style={{ marginBottom: 0 }}
                                inputStyle={{ height: 42, padding: 8, fontSize: 13, fontWeight: '700' }}
                              />
                            </View>
                            <TouchableOpacity 
                              style={styles.customDigitalDeleteBtn} 
                              onPress={() => handleDeletePermanentMode(item)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="trash-outline" size={19} color="#DC2626" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Quick Preset Buttons & Permanent Add Button */}
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 }}>
                        स्थायी पेमेंट माध्यम जोड़ें (Click preset to add permanently):
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {['Google Pay', 'BharatPe', 'HDFC QR', 'SBI UPI', 'Cred', 'Axis Bank'].map((pName) => {
                          const alreadyAdded = masterDigitalModes.some(m => m.name.toLowerCase() === pName.toLowerCase());
                          if (alreadyAdded) return null;
                          return (
                            <TouchableOpacity
                              key={pName}
                              style={styles.quickPresetChip}
                              onPress={() => handleSavePermanentMode(pName)}
                            >
                              <Icon name="add" size={13} color="#003C8F" style={{ marginRight: 2 }} />
                              <Text style={styles.quickPresetChipText}>{pName}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <TouchableOpacity 
                        style={styles.addDigitalBtn} 
                        onPress={() => setAddModeModalVisible(true)}
                      >
                        <Icon name="add-circle-outline" size={17} color="#003C8F" style={{ marginRight: 4 }} />
                        <Text style={styles.addDigitalBtnText}>+ नया डिजिटल पेमेंट स्थायी जोड़ें (Permanent Add)</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Digital Live Total Bar */}
                    <View style={styles.digitalLiveTotalBar}>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Icon name="checkmark-circle" size={16} color="#003C8F" style={{marginRight: 4}} />
                        <Text style={styles.digitalLiveTotalLabel}>कुल डिजिटल / बैंक प्राप्ति:</Text>
                      </View>
                      <Text style={styles.digitalLiveTotalVal}>₹{digitalAmt.toFixed(2)}</Text>
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
                            style={[styles.picker, { color: '#0F172A', backgroundColor: '#FFFFFF' }]}
                            dropdownIconColor="#16A34A"
                            itemStyle={{ color: '#0F172A', fontSize: 14 }}
                            mode="dropdown"
                          >
                            <Picker.Item 
                              label="-- ग्राहक चुनें --" 
                              value="" 
                              color="#64748B" 
                              style={{ color: '#64748B', backgroundColor: '#FFFFFF' }}
                            />
                            {pendingUdhariCustomers
                              .filter(c => !udhariReturnEntries.find(e => e.docId === c.docId))
                              .map(c => (
                                <Picker.Item 
                                  key={c.docId} 
                                  label={`${c.customerName} — बकाया: ₹${c.remainingAmount.toFixed(0)}`} 
                                  value={c.docId} 
                                  color="#0F172A"
                                  style={{ color: '#0F172A', backgroundColor: '#FFFFFF' }}
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
                                  placeholder="राशि (₹)" 
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

              {/* 📊 FINAL RECONCILIATION SUMMARY */}
              <View style={styles.reconcileCard}>
                <View style={styles.reconcileCardHeader}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Icon name="calculator" size={20} color="#003C8F" style={{marginRight: 6}} />
                    <Text style={styles.reconcileCardTitle}>अंतिम हिसाब मिलान (Final Reconciliation Ledger)</Text>
                  </View>
                </View>

                {/* Breakdown Summary Grid */}
                <View style={styles.reconcileGrid}>
                  <View style={styles.reconcileRow}>
                    <Text style={styles.reconcileRowLabel}>अपेक्षित कुल बिक्री (Expected Sales):</Text>
                    <Text style={[styles.reconcileRowVal, { color: '#003C8F' }]}>₹{totalExpectedAmount.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.reconcileSubDetail}>
                    (पेट्रोल: ₹{pExpected.toFixed(2)} + डीजल: ₹{dExpected.toFixed(2)}{totalMobilAmount > 0 ? ` + मोबिल: ₹${totalMobilAmount.toFixed(2)}` : ''}{udhariReturnTotal > 0 ? ` + उधारी वापसी: ₹${udhariReturnTotal.toFixed(2)}` : ''})
                  </Text>

                  <View style={[styles.reconcileRow, { marginTop: 8 }]}>
                    <Text style={styles.reconcileRowLabel}>कुल दर्ज वसूली (Total Collection):</Text>
                    <Text style={[styles.reconcileRowVal, { color: '#16A34A' }]}>₹{totalCollection.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.reconcileSubDetail}>
                    (कैश: ₹{cashAmt.toFixed(2)} + डिजिटल: ₹{digitalAmt.toFixed(2)} + उधारी: ₹{udhariAmt.toFixed(2)} - खर्चे: ₹{expenseAmt.toFixed(2)})
                  </Text>
                </View>

                {/* Variance Status Banner */}
                <View style={[
                  styles.reconcileStatusBadge,
                  Math.abs(shortageOrExcess) < 0.01 
                    ? styles.reconcileStatusBalanced 
                    : shortageOrExcess < 0 
                      ? styles.reconcileStatusShortage 
                      : styles.reconcileStatusExcess
                ]}>
                  <Icon 
                    name={Math.abs(shortageOrExcess) < 0.01 ? "checkmark-circle" : (shortageOrExcess < 0 ? "alert-circle" : "information-circle")} 
                    size={22} 
                    color={Math.abs(shortageOrExcess) < 0.01 ? "#15803D" : (shortageOrExcess < 0 ? "#DC2626" : "#0284C7")} 
                  />
                  <View style={{ marginLeft: 8, flex: 1 }}>
                    <Text style={[
                      styles.reconcileStatusTitle,
                      { color: Math.abs(shortageOrExcess) < 0.01 ? "#15803D" : (shortageOrExcess < 0 ? "#DC2626" : "#0284C7") }
                    ]}>
                      {Math.abs(shortageOrExcess) < 0.01 
                        ? '✅ हिसाब 100% बराबर है (Balanced)' 
                        : shortageOrExcess < 0 
                          ? `⚠️ कमी (Shortage): -₹${Math.abs(shortageOrExcess).toFixed(2)}` 
                          : `ℹ️ अतिरिक्त (Excess): +₹${shortageOrExcess.toFixed(2)}`}
                    </Text>
                    <Text style={styles.reconcileStatusSub}>
                      {Math.abs(shortageOrExcess) < 0.01 
                        ? 'मीटर बिक्री और कुल वसूली पूर्णतः संतुलित है।' 
                        : shortageOrExcess < 0 
                          ? 'वसूली बिक्री से कम है। कृपया कैश, डिजिटल, उधारी या खर्चे की जांच करें।' 
                          : 'वसूली बिक्री से अधिक है।'}
                    </Text>
                  </View>
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
      <ScrollableModal
        visible={digitalModalVisible}
        onRequestClose={() => setDigitalModalVisible(false)}
      >
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>डिजिटल एवं बैंक माध्यम</Text>
            <Text style={styles.modalSubTitle}>Paytm, PhonePe, ATM / POS, BOB Bank</Text>
          </View>
          <TouchableOpacity onPress={() => setDigitalModalVisible(false)}>
            <Icon name="close-circle" size={26} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Permanent 4 Payment Modes */}
        <View style={{ marginTop: 10 }}>
          {digitalEntries.filter(d => !d.isCustom).map((item) => (
            <View key={item.id} style={styles.digitalInputRow}>
              <View style={{flex: 1.8, flexDirection: 'row', alignItems: 'center', marginRight: 8}}>
                <View style={{
                  width: 32, 
                  height: 32, 
                  borderRadius: 16, 
                  backgroundColor: `${item.color || '#003C8F'}18`, 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  marginRight: 8
                }}>
                  <Icon name={item.icon || 'card-outline'} size={18} color={item.color || '#003C8F'} />
                </View>
                <Text style={styles.digitalRowLabel}>{item.name}</Text>
              </View>
              <View style={{flex: 1.5}}>
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
            </View>
          ))}

          {/* Custom Permanent Digital Entries in Modal */}
          {digitalEntries.filter(d => !d.isFixed).length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 }}>
                अन्य स्थायी डिजिटल माध्यम (Permanent Modes):
              </Text>
              {digitalEntries.filter(d => !d.isFixed).map((customItem) => (
                <View key={customItem.id} style={[styles.customDigitalRow, { marginBottom: 8 }]}>
                  <View style={{ flex: 1.6, marginRight: 6 }}>
                    <View style={[styles.digitalInputHeader, { borderLeftColor: customItem.color || '#0F766E' }]}>
                      <Icon name={customItem.icon || 'card'} size={15} color={customItem.color || '#0F766E'} style={{ marginRight: 4 }} />
                      <Text style={[styles.digitalInputTitle, { color: customItem.color || '#0F766E' }]} numberOfLines={1}>
                        {customItem.name}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1.3, marginRight: 6 }}>
                    <CustomInput 
                      keyboardType="numeric" 
                      placeholder="0.00" 
                      value={customItem.amount || ''} 
                      onChangeText={(val) => handleDigitalAmountChange(customItem.id, val)}
                      leftIcon="cash-outline" 
                      style={{ marginBottom: 0 }} 
                      inputStyle={{ height: 42, padding: 8, fontSize: 13, fontWeight: '700' }}
                    />
                  </View>
                  <TouchableOpacity 
                    style={styles.customDigitalDeleteBtn} 
                    onPress={() => handleDeletePermanentMode(customItem)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="trash-outline" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Add New Digital Payment Button in Modal */}
          <TouchableOpacity 
            style={[styles.addDigitalBtn, { marginTop: 12 }]} 
            onPress={() => setAddModeModalVisible(true)}
          >
            <Icon name="add-circle-outline" size={18} color="#003C8F" style={{ marginRight: 4 }} />
            <Text style={styles.addDigitalBtnText}>+ नया डिजिटल पेमेंट स्थायी जोड़ें (Permanent Add)</Text>
          </TouchableOpacity>
        </View>

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
      </ScrollableModal>

      {/* Modal to Add New Permanent Payment Mode */}
      <ScrollableModal
        visible={addModeModalVisible}
        onRequestClose={() => setAddModeModalVisible(false)}
      >
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>स्थायी डिजिटल पेमेंट जोड़ें</Text>
            <Text style={styles.modalSubTitle}>Add Permanent Payment Channel</Text>
          </View>
          <TouchableOpacity onPress={() => setAddModeModalVisible(false)}>
            <Icon name="close-circle" size={26} color="#64748B" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 }}>
            1. तुरंत नाम चुनें (Quick Presets) या नीचे लिखें:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {['Google Pay', 'BharatPe', 'HDFC QR', 'SBI UPI', 'Cred', 'Axis Bank', 'Kotak QR'].map((pName) => (
              <TouchableOpacity
                key={pName}
                style={[styles.quickPresetChip, newModeName === pName && { backgroundColor: '#DBEAFE', borderColor: '#2563EB' }]}
                onPress={() => setNewModeName(pName)}
              >
                <Icon name="checkmark" size={13} color={newModeName === pName ? '#2563EB' : '#64748B'} style={{ marginRight: 3 }} />
                <Text style={[styles.quickPresetChipText, newModeName === pName && { color: '#1E40AF', fontWeight: '800' }]}>
                  {pName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <CustomInput
            label="पेमेंट माध्यम का नाम (Payment Mode Name) *"
            placeholder="उदा. Google Pay, BharatPe, HDFC QR"
            value={newModeName}
            onChangeText={setNewModeName}
            leftIcon="card-outline"
          />

          <View style={{ marginTop: 16 }}>
            <CustomButton
              title="स्थायी रूप से सेव करें (Save Permanently)"
              onPress={() => handleSavePermanentMode()}
              loading={isSavingNewMode}
              type="primary"
              icon="checkmark-circle-outline"
            />
          </View>
        </View>
      </ScrollableModal>

      {/* 2. Cash Breakdown Modal */}
      <ScrollableModal
        visible={cashBreakdownVisible}
        onRequestClose={() => setCashBreakdownVisible(false)}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>कैश नोट एवं सिक्के (Cash Denominations)</Text>
          <TouchableOpacity onPress={() => setCashBreakdownVisible(false)}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 8 }}>
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
        </View>

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
      </ScrollableModal>

      {/* 3. Udhari Breakdown Modal */}
      <ScrollableModal
        visible={udhariBreakdownVisible}
        onRequestClose={() => setUdhariBreakdownVisible(false)}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>ग्राहक-वार उधारी (Customer Khata)</Text>
          <TouchableOpacity onPress={() => setUdhariBreakdownVisible(false)}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 8 }}>
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
        </View>

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
      </ScrollableModal>

      {/* 4. Expense Breakdown Modal */}
      <ScrollableModal
        visible={expenseBreakdownVisible}
        onRequestClose={() => setExpenseBreakdownVisible(false)}
      >
        <View style={styles.modalHeader}>
          <View>
            <Text style={styles.modalTitle}>खर्च का विवरण (Pump Expenses)</Text>
            <Text style={styles.modalSubTitle}>दुकान/पंप का सामान्य खर्च या स्टाफ का वेतन/एडवांस</Text>
          </View>
          <TouchableOpacity onPress={() => setExpenseBreakdownVisible(false)}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 8 }}>
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
                            style={[styles.salaryPicker, { color: '#0F172A', backgroundColor: '#FFFBEB' }]}
                            dropdownIconColor="#D97706"
                            itemStyle={{ color: '#0F172A', fontSize: 14, fontWeight: '700' }}
                            mode="dropdown"
                          >
                            <Picker.Item 
                              label="-- स्टाफ चुनें --" 
                              value="" 
                              color="#64748B" 
                              style={{ color: '#64748B', backgroundColor: '#FFFBEB' }}
                            />
                            {effectiveSalesmen.map((st) => {
                              const roleTag = st.staffType === 'watchman' 
                                ? `🛡️ ${st.name} (चौकीदार / Watchman)` 
                                : (st.staffType === 'sweeper' 
                                    ? `🧹 ${st.name} (सफाईकर्मी / Sweeper)` 
                                    : `👤 ${st.name} (सेल्समैन)`);
                              return (
                                <Picker.Item 
                                  key={st.id} 
                                  label={roleTag} 
                                  value={st.id} 
                                  color="#0F172A"
                                  style={{ color: '#0F172A', backgroundColor: '#FFFBEB' }}
                                />
                              );
                            })}
                          </Picker>
                        </View>

                        {/* Selected Staff Badge for 100% clarity */}
                        {targetStaffId ? (() => {
                          const targetStaffObj = effectiveSalesmen.find(s => s.id === targetStaffId);
                          const targetRoleTag = targetStaffObj?.staffType === 'watchman' 
                            ? '🛡️ चौकीदार (Watchman)' 
                            : (targetStaffObj?.staffType === 'sweeper' 
                                ? '🧹 सफाईकर्मी (Sweeper)' 
                                : '⛽ सेल्समैन (Salesman)');
                          return (
                            <View style={styles.salarySelectedStaffBadge}>
                              <Icon name="person" size={14} color="#B45309" />
                              <Text style={styles.salarySelectedStaffText}>
                                चयनित स्टाफ: <Text style={{ fontWeight: '800', color: '#92400E' }}>{targetStaffObj?.name || 'Staff'}</Text>
                                <Text style={{ color: '#B45309', fontWeight: '700' }}> [{targetRoleTag}]</Text>
                              </Text>
                            </View>
                          );
                        })() : null}

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

                          {/* Date-wise breakdown of advances taken this month ("kb kb ur kitna liye hain") */}
                          {staffMonthlyAdvanceRecordsMap[targetStaffId] && staffMonthlyAdvanceRecordsMap[targetStaffId].length > 0 ? (
                            <View style={styles.advanceRecordsDetailBox}>
                              <Text style={styles.advanceRecordsDetailTitle}>
                                📋 कब-कब और कितना लिया ({staffMonthlyAdvanceRecordsMap[targetStaffId].length} बार):
                              </Text>
                              {staffMonthlyAdvanceRecordsMap[targetStaffId].map((rec, rIdx) => {
                                const recDate = rec.timestamp?.toDate 
                                  ? rec.timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                                  : (rec.date || 'Advance');
                                return (
                                  <View key={rec.id || rIdx} style={styles.advanceRecordDetailRow}>
                                    <Text style={styles.advanceRecordDetailDate}>📅 {recDate}</Text>
                                    <Text style={styles.advanceRecordDetailAmt}>₹{parseFloat(rec.amount || 0).toFixed(0)}</Text>
                                    <Text style={styles.advanceRecordDetailNote} numberOfLines={1}>
                                      ({rec.notes || rec.reason || 'एडवांस'})
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          ) : targetStaffId ? (
                            <Text style={styles.advanceRecordsDetailEmpty}>
                              (इस महीने में पहले कोई एडवांस नहीं लिया गया है)
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    )}

                    {/* Inputs Row: Description & Amount */}
                    <View style={styles.dynamicRow}>
                      <View style={{flex: 2, marginRight: 8}}>
                        <CustomInput 
                          placeholder={itemType === 'salary' ? "टिप्पणी" : "कारण"} 
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
            </View>

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
          </ScrollableModal>

      {/* 6. Admin OTP Verification Modal for Edit Mode */}
      <ScrollableModal
        visible={otpModalVisible}
        onRequestClose={() => setOtpModalVisible(false)}
      >
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

        <View style={{ paddingVertical: 10 }}>
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
        </View>
      </ScrollableModal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 220 },

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
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden'
  },
  picker: { 
    height: 52,
    color: '#0F172A',
    backgroundColor: '#FFFFFF'
  },
  selectedIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginTop: 6
  },
  selectedIndicatorText: {
    fontSize: 12,
    color: '#15803D',
    marginLeft: 5
  },

  // Shift Card Styles
  shiftCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  shiftCardShift1: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF5'
  },
  shiftCardShift2: {
    borderColor: '#DDD6FE',
    backgroundColor: '#FAF5FF'
  },
  shiftCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  shiftPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8
  },
  shiftPillShift1: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D'
  },
  shiftPillShift2: {
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD'
  },
  shiftPillText: {
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 5
  },
  shiftPillTextShift1: {
    color: '#B45309'
  },
  shiftPillTextShift2: {
    color: '#6D28D9'
  },
  shiftCardMachineName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B'
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD'
  },
  linkedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
    marginLeft: 4
  },
  shiftInfoText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18
  },
  shiftNoTestingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 6
  },
  shiftNoTestingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    marginLeft: 6
  },
  shiftActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8
  },
  shiftActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F',
    marginLeft: 6
  },

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
    backgroundColor: 'rgba(0,0,0,0.6)'
  },
  modalScrollOverlay: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 24
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10
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
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8
  },
  breakdownLabelBadge: {
    width: 82,
    justifyContent: 'center'
  },
  breakdownInputLabel: { 
    fontSize: 14, 
    fontWeight: '700', 
    color: '#1E293B' 
  },
  breakdownMultiply: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#64748B',
    marginHorizontal: 4
  },
  breakdownInputContainer: {
    width: 80,
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    justifyContent: 'center'
  },
  breakdownTextInput: {
    height: 38,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'center'
  },
  breakdownEqual: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginHorizontal: 4
  },
  breakdownTotalBadge: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  breakdownTotalText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B'
  },
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
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    overflow: 'hidden',
    marginBottom: 6
  },
  salaryPicker: {
    height: 48,
    color: '#0F172A',
    backgroundColor: 'transparent'
  },
  salarySelectedStaffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 8
  },
  salarySelectedStaffText: {
    fontSize: 12,
    color: '#78350F',
    marginLeft: 5
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
  },
  advanceRecordsDetailBox: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A'
  },
  advanceRecordsDetailTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4
  },
  advanceRecordDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#FEF3C7'
  },
  advanceRecordDetailDate: {
    fontSize: 10,
    fontWeight: '700',
    color: '#78350F',
    width: 68
  },
  advanceRecordDetailAmt: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#B45309',
    width: 58
  },
  advanceRecordDetailNote: {
    fontSize: 9.5,
    color: '#92400E',
    flex: 1
  },
  advanceRecordsDetailEmpty: {
    fontSize: 9.5,
    color: '#B45309',
    fontStyle: 'italic',
    marginTop: 4
  },

  // Mobil Sale Styles
  addMobilBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  addMobilBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  emptyMobilBox: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  emptyMobilText: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6
  },
  mobilItemCard: {
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  mobilItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  mobilItemNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED'
  },
  mobilTrashBtn: {
    padding: 4
  },
  presetPackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6
  },
  presetPackChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    marginRight: 6,
    marginBottom: 4
  },
  presetPackChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED'
  },
  presetPackText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6D28D9'
  },
  presetPackTextActive: {
    color: '#FFFFFF'
  },
  mobilTotalBanner: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#D8B4FE',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    alignItems: 'center'
  },
  mobilTotalText: {
    fontSize: 13,
    color: '#581C87',
    fontWeight: '600'
  },

  // Date Selector Styles
  dateSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  dateSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 6
  },
  dateSelectorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flexShrink: 1
  },
  dateDisplayBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#003C8F',
    backgroundColor: '#EFF6FF',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'center'
  },
  datePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  datePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1'
  },
  datePillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F'
  },
  datePillTextActive: {
    color: '#FFFFFF'
  },

  // Support Staff Styles
  supportStaffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  supportStaffTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  supportStaffSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  supportInfoBanner: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12
  },
  supportInfoName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A'
  },
  supportInfoDate: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F'
  },
  supportInfoPhone: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3
  },
  supportHistoryBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  supportHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  supportHistoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E'
  },
  supportMonthTotalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
    marginBottom: 8
  },
  supportMonthTotalLabel: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600'
  },
  supportMonthTotalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B45309'
  },
  supportCountBadge: {
    backgroundColor: '#92400E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12
  },
  supportCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  supportEmptyHistory: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8
  },
  supportEmptyHistoryText: {
    fontSize: 12,
    color: '#15803D',
    marginLeft: 6
  },
  supportHistoryList: {
    marginTop: 4,
    gap: 6
  },
  supportHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  supportHistoryDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  supportHistoryModeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6
  },
  supportHistoryModeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#003C8F'
  },
  supportHistoryNotes: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  supportHistoryAmt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309'
  },
  supportEntryForm: {
    marginTop: 4
  },
  supportEntryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4
  },
  quickChipBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#003C8F'
  },
  supportModeRow: {
    flexDirection: 'row',
    gap: 6
  },
  supportModeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  supportModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569'
  },
  supportNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    padding: 8,
    marginTop: 10
  },
  supportNoticeText: {
    fontSize: 11,
    color: '#0369A1',
    marginLeft: 6,
    flex: 1
  },

  // Direct Digital Grid Styles
  openDigitalMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  openDigitalMiniText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#003C8F'
  },
  digitalDirectCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10
  },
  digitalGridRow: {
    flexDirection: 'row',
    gap: 8
  },
  digitalGridCol: {
    flex: 1
  },
  digitalInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    borderLeftWidth: 3,
    paddingLeft: 4
  },
  digitalInputTitle: {
    fontSize: 11.5,
    fontWeight: '700'
  },
  digitalLiveTotalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 10
  },
  digitalLiveTotalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F'
  },
  digitalLiveTotalVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#003C8F'
  },

  // Final Reconciliation Card Styles
  reconcileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#003C8F',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3
  },
  reconcileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
    marginBottom: 8
  },
  reconcileCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003C8F'
  },
  reconcileGrid: {
    marginBottom: 10
  },
  reconcileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  reconcileRowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B'
  },
  reconcileRowVal: {
    fontSize: 15,
    fontWeight: '900'
  },
  reconcileSubDetail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  reconcileStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1
  },
  reconcileStatusBalanced: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC'
  },
  reconcileStatusShortage: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  reconcileStatusExcess: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD'
  },
  reconcileStatusTitle: {
    fontSize: 13,
    fontWeight: '800'
  },
  reconcileStatusSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1
  },

  // Custom Digital Payment Styles
  customDigitalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 6
  },
  customDigitalNameCol: {
    flex: 1.5,
    marginRight: 6
  },
  customDigitalAmountCol: {
    flex: 1.2,
    marginRight: 6
  },
  customDigitalDeleteBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center'
  },
  addDigitalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  addDigitalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#003C8F',
    marginLeft: 4
  },
  quickPresetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  quickPresetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155'
  }
});
