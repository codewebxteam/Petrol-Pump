import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator, 
  RefreshControl,
  Modal
} from 'react-native';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { 
  getMonthKey, 
  getPreviousMonthKey, 
  formatMonthLabel, 
  getStaffMonthlyAttendance 
} from '../../../services/dbServices';
import { AuthContext } from '../../../context/AuthContext';
import TankStockCard from '../../../components/TankStockCard';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';

const { width } = Dimensions.get('window');

export default function OwnerDashboardScreen({ navigation }) {
  const { logout } = useContext(AuthContext);

  // Raw Firestore Data
  const [tanks, setTanks] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [salesmenMap, setSalesmenMap] = useState({});
  const [machines, setMachines] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [allSales, setAllSales] = useState([]);
  const [editRequests, setEditRequests] = useState([]);

  const fallbackMachines = [
    { id: 'DU1', name: 'DU1', petrolNozzle: 'N1', dieselNozzle: 'N2' },
    { id: 'DU2', name: 'DU2', petrolNozzle: 'N3', dieselNozzle: 'N4' },
    { id: 'DU3', name: 'DU3', petrolNozzle: 'N5', dieselNozzle: 'N6' }
  ];
  const effectiveMachines = machines.length > 0 ? machines : fallbackMachines;
  
  // Staff Salary / Advance States
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [selectedAdvanceMonth, setSelectedAdvanceMonth] = useState(getMonthKey());
  const [selectedStaffAdvanceDetails, setSelectedStaffAdvanceDetails] = useState(null); // for staff modal details
  
  // Dedicated Staff Attendance & Advance Modal State (Active Staff Click)
  const [selectedStaffModal, setSelectedStaffModal] = useState(null);
  const [staffModalMonth, setStaffModalMonth] = useState(getMonthKey());
  
  // UI & Filter States
  const [timeFilter, setTimeFilter] = useState('today'); // 'today', 'yesterday', 'week', 'month'
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Tanks Listener
    const unsubTanks = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setTanks(list);
    }, (error) => {
      console.warn("Firestore snapshot error (tanks):", error.message);
    });

    // 2. Salesmen / Staff Listener
    const qUsers = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const list = [];
      const map = {};
      snapshot.forEach(d => {
        const data = d.data();
        list.push({ id: d.id, ...data });
        map[d.id] = data.name || 'Staff';
      });
      setSalesmen(list);
      setSalesmenMap(map);
    }, (error) => {
      console.warn("Firestore snapshot error (users):", error.message);
    });

    // 3. Machines Listener
    const unsubMachines = onSnapshot(collection(db, 'machines'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setMachines(list);
    }, (error) => {
      console.warn("Firestore snapshot error (machines):", error.message);
    });

    // 4. Nozzles Listener
    const unsubNozzles = onSnapshot(collection(db, 'nozzles'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setNozzles(list);
    }, (error) => {
      console.warn("Firestore snapshot error (nozzles):", error.message);
    });

    // 5. All Sales Reports Listener (client-side sorted to avoid missing composite index)
    const unsubSales = onSnapshot(collection(db, 'sales_reports'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });

      list.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      setAllSales(list);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.warn("Firestore snapshot error (sales):", error.message);
      setLoading(false);
      setRefreshing(false);
    });

    // 6. Active Edit OTP Requests Listener
    const qEdit = query(collection(db, 'edit_requests'), where('status', '==', 'pending'));
    const unsubEdit = onSnapshot(qEdit, (snapshot) => {
      const list = [];
      snapshot.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      setEditRequests(list);
    }, (error) => {
      console.warn("Firestore snapshot error (edit_requests):", error.message);
    });

    // 7. Staff Salary Advances Listener
    const unsubSalary = onSnapshot(collection(db, 'staff_salary_advances'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setSalaryAdvances(list);
    }, (error) => {
      console.warn("Firestore snapshot error (staff_salary_advances):", error.message);
    });

    return () => {
      unsubTanks();
      unsubUsers();
      unsubMachines();
      unsubNozzles();
      unsubSales();
      unsubEdit();
      unsubSalary();
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'StaffApp' }]
      });
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  const handleSettleCollection = async (docId) => {
    try {
      await updateDoc(doc(db, 'sales_reports', docId), {
        isSettled: true,
        settledAt: new Date()
      });
      Toast.show({
        type: 'success',
        text1: 'Collection Settled',
        text2: 'This sales report has been marked as settled.'
      });
    } catch (error) {
      console.error('Error settling collection:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    }
  };

  const handleRejectOtp = async (reqId) => {
    try {
      await updateDoc(doc(db, 'edit_requests', reqId), {
        status: 'rejected',
        rejectedAt: new Date()
      });
      Toast.show({
        type: 'info',
        text1: 'OTP Request Rejected',
        text2: 'Staff can no longer use this OTP to edit.'
      });
    } catch (error) {
      console.error('Error rejecting OTP:', error);
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    }
  };

  // Filter Sales based on Time Range
  const filteredSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (timeFilter === 'today') {
      return allSales.filter(s => {
        const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp || 0);
        return d >= startOfToday && d <= endOfToday;
      });
    }

    if (timeFilter === 'yesterday') {
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const endOfYesterday = new Date(endOfToday);
      endOfYesterday.setDate(endOfYesterday.getDate() - 1);
      return allSales.filter(s => {
        const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp || 0);
        return d >= startOfYesterday && d <= endOfYesterday;
      });
    }

    if (timeFilter === 'week') {
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - 7);
      return allSales.filter(s => {
        const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp || 0);
        return d >= startOfWeek && d <= endOfToday;
      });
    }

    if (timeFilter === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return allSales.filter(s => {
        const d = s.timestamp?.toDate ? s.timestamp.toDate() : new Date(s.timestamp || 0);
        return d >= startOfMonth && d <= endOfToday;
      });
    }

    return allSales;
  }, [allSales, timeFilter]);

  // Aggregate Metrics Computed from Filtered Sales
  const metrics = useMemo(() => {
    let revenue = 0;
    let pending = 0;
    let totalLiters = 0;
    let petrolLiters = 0;
    let petrolRev = 0;
    let dieselLiters = 0;
    let dieselRev = 0;
    let cash = 0;
    let online = 0;
    let cards = 0;
    let fleet = 0;
    let udhari = 0;
    let expenses = 0;
    let shortageExcess = 0;

    filteredSales.forEach(s => {
      const payment = Number(s.totalPayment) || 0;
      const expected = Number(s.expectedTotalAmount) || payment;
      const pLiters = Number(s.petrolQuantitySold) || 0;
      const pExp = Number(s.petrolExpectedAmount) || 0;
      const dLiters = Number(s.dieselQuantitySold) || 0;
      const dExp = Number(s.dieselExpectedAmount) || 0;
      const totLiters = Number(s.totalQuantitySold) || (pLiters + dLiters);

      revenue += expected;
      totalLiters += totLiters;
      petrolLiters += pLiters;
      petrolRev += pExp;
      dieselLiters += dLiters;
      dieselRev += dExp;

      cash += Number(s.cashAmount) || 0;
      
      // Online / UPI
      const upiAmt = (Number(s.onlineAmount) || 0) + 
                     (Number(s.phonePeAmount) || 0) + 
                     (Number(s.paytmAmount) || 0) + 
                     (Number(s.bharatPeAmount) || 0);
      online += upiAmt;

      // Card / POS
      const cardAmt = (Number(s.atmAmount) || 0) + 
                      (Number(s.debitCardAmount) || 0) + 
                      (Number(s.creditCardAmount) || 0);
      cards += cardAmt;

      // Fleet
      const fleetAmt = (Number(s.extraPowerAmount) || 0) + 
                       (Number(s.extraRewardAmount) || 0) +
                       (Number(s.offerAmount) || 0) +
                       (Number(s.customDigitalAmount) || 0);
      fleet += fleetAmt;

      udhari += Number(s.udhariAmount) || 0;
      expenses += Number(s.expenses) || 0;
      shortageExcess += Number(s.shortageOrExcess) || 0;

      if (!s.isSettled) {
        pending += payment;
      }
    });

    return {
      count: filteredSales.length,
      revenue,
      pending,
      totalLiters,
      petrolLiters,
      petrolRev,
      dieselLiters,
      dieselRev,
      cash,
      online,
      cards,
      fleet,
      totalDigital: online + cards + fleet,
      udhari,
      expenses,
      shortageExcess
    };
  }, [filteredSales]);

  // Distinct Months available for Salary Advance filtering
  const availableAdvanceMonths = useMemo(() => {
    const monthsSet = new Set();
    const currentM = getMonthKey();
    monthsSet.add(currentM);

    salaryAdvances.forEach(item => {
      if (item.monthKey) monthsSet.add(item.monthKey);
    });

    return Array.from(monthsSet).sort().reverse();
  }, [salaryAdvances]);

  // Aggregate Staff Salary Advances for the selected month
  const salaryAdvanceSummary = useMemo(() => {
    const filtered = salaryAdvances.filter(item => (item.monthKey || getMonthKey()) === selectedAdvanceMonth);
    const staffMap = {};

    filtered.forEach(item => {
      const sId = item.salesmanId || 'unknown';
      const sName = item.salesmanName || salesmenMap[sId] || 'Staff';
      const amt = parseFloat(item.amount) || 0;

      if (!staffMap[sId]) {
        staffMap[sId] = {
          salesmanId: sId,
          salesmanName: sName,
          totalAmount: 0,
          entries: []
        };
      }
      staffMap[sId].totalAmount += amt;
      staffMap[sId].entries.push(item);
    });

    const staffList = Object.values(staffMap).sort((a, b) => b.totalAmount - a.totalAmount);
    const grandTotal = staffList.reduce((acc, curr) => acc + curr.totalAmount, 0);

    return {
      staffList,
      grandTotal,
      totalCount: filtered.length
    };
  }, [salaryAdvances, selectedAdvanceMonth, salesmenMap]);

  // Attendance & Advances for Selected Staff in Staff Modal
  const staffModalAttendance = useMemo(() => {
    if (!selectedStaffModal) return { daysCount: 0, distinctDates: [], entriesCount: 0, totalLiters: 0 };
    return getStaffMonthlyAttendance(allSales, selectedStaffModal.id, selectedStaffModal.name, staffModalMonth);
  }, [allSales, selectedStaffModal, staffModalMonth]);

  const staffModalAdvances = useMemo(() => {
    if (!selectedStaffModal) return { totalAmount: 0, entries: [] };
    const filtered = salaryAdvances.filter(item => {
      const matchId = (item.salesmanId === selectedStaffModal.id);
      const matchName = (item.salesmanName && selectedStaffModal.name && item.salesmanName.trim().toLowerCase() === selectedStaffModal.name.trim().toLowerCase());
      const matchMonth = (item.monthKey || getMonthKey()) === staffModalMonth;
      return (matchId || matchName) && matchMonth;
    });
    const total = filtered.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    return { totalAmount: total, entries: filtered };
  }, [salaryAdvances, selectedStaffModal, staffModalMonth]);

  // Strictly Separate Tank 1 (Petrol) and Tank 2 (Diesel)
  const effectiveTanks = useMemo(() => {
    const t1FromDb = tanks.find(t => t.id === 'Tank-1' || t.tankId === 'Tank-1' || t.id?.includes('1') || t.fuelType === 'Petrol');
    const t2FromDb = tanks.find(t => t.id === 'Tank-2' || t.tankId === 'Tank-2' || t.id?.includes('2') || t.fuelType === 'Diesel');

    const tank1 = {
      id: 'Tank-1',
      tankId: 'Tank 1',
      tankName: 'Tank 1 (Petrol - MS)',
      fuelType: 'Petrol',
      stock: t1FromDb?.petrolStock !== undefined ? t1FromDb.petrolStock : (t1FromDb?.stock !== undefined ? t1FromDb.stock : 0),
      capacity: t1FromDb?.petrolCapacity || t1FromDb?.capacity || 20000,
      lastTestingReturned: t1FromDb?.lastTestingReturned || 5
    };

    const tank2 = {
      id: 'Tank-2',
      tankId: 'Tank 2',
      tankName: 'Tank 2 (Diesel - HSD)',
      fuelType: 'Diesel',
      stock: t2FromDb?.dieselStock !== undefined ? t2FromDb.dieselStock : (t2FromDb?.stock !== undefined ? t2FromDb.stock : 0),
      capacity: t2FromDb?.dieselCapacity || t2FromDb?.capacity || 20000,
      lastTestingReturned: t2FromDb?.lastTestingReturned || 5
    };

    return [tank1, tank2];
  }, [tanks]);

  const renderTank = ({ item }) => (
    <View style={styles.tankWrapper}>
      <TankStockCard 
        tankId={item.tankId} 
        tankName={item.tankName}
        fuelType={item.fuelType}
        stock={item.stock}
        capacity={item.capacity}
        lastTestingReturned={item.lastTestingReturned}
      />
    </View>
  );

  return (
    <>
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#003C8F']} />}
    >

      {/* Active Staff Edit OTP Requests */}
      {editRequests.length > 0 && (
        <View style={styles.otpSection}>
          <View style={styles.otpSectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.otpPulseBadge}>
                <Icon name="key" size={16} color="#B45309" />
              </View>
              <Text style={styles.otpSectionTitle}>
                🔐 Staff Edit Requests ({editRequests.length})
              </Text>
            </View>
            <Text style={styles.otpSectionSub}>Share this OTP with staff</Text>
          </View>

          {editRequests.map((req) => (
            <View key={req.id} style={styles.otpCard}>
              <View style={styles.otpCardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.otpStaffName}>👤 {req.staffName}</Text>
                  <Text style={styles.otpMachineName}>⛽ {req.machineName}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.otpRejectBtn}
                  onPress={() => handleRejectOtp(req.id)}
                >
                  <Text style={styles.otpRejectText}>Reject</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.otpCodeBox}>
                <Text style={styles.otpCodeLabel}>VERIFICATION OTP</Text>
                <Text style={styles.otpCodeValue}>{req.otp}</Text>
                <Text style={styles.otpExpiresText}>Expires in 30 mins</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 2. Time Range Filter Pills */}
      <View style={styles.filterRow}>
        <TouchableOpacity 
          style={[styles.filterPill, timeFilter === 'today' && styles.activeFilterPill]} 
          onPress={() => setTimeFilter('today')}
        >
          <Text style={[styles.filterPillText, timeFilter === 'today' && styles.activeFilterPillText]}>
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterPill, timeFilter === 'yesterday' && styles.activeFilterPill]} 
          onPress={() => setTimeFilter('yesterday')}
        >
          <Text style={[styles.filterPillText, timeFilter === 'yesterday' && styles.activeFilterPillText]}>
            Yesterday
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterPill, timeFilter === 'week' && styles.activeFilterPill]} 
          onPress={() => setTimeFilter('week')}
        >
          <Text style={[styles.filterPillText, timeFilter === 'week' && styles.activeFilterPillText]}>
            Last 7 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterPill, timeFilter === 'month' && styles.activeFilterPill]} 
          onPress={() => setTimeFilter('month')}
        >
          <Text style={[styles.filterPillText, timeFilter === 'month' && styles.activeFilterPillText]}>
            This Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. PROMINENT FUEL SOLD BREAKDOWN (Petrol vs Diesel Liters) */}
      <View style={styles.sectionCardHighlighted}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="speedometer" size={22} color="#003C8F" style={{ marginRight: 8 }} />
            <Text style={styles.sectionTitleBold}>Fuel Dispensed (Sales Volume)</Text>
          </View>
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>
              {timeFilter === 'today' ? 'Today' : timeFilter === 'yesterday' ? 'Yesterday' : timeFilter === 'week' ? '7 Days' : 'This Month'}
            </Text>
          </View>
        </View>

        {/* Two Large Fuel Volume Cards */}
        <View style={styles.fuelVolumeGrid}>
          {/* Petrol Volume Card */}
          <View style={[styles.fuelVolumeCard, { borderColor: '#FF6F00' }]}>
            <View style={styles.fuelCardTop}>
              <View style={[styles.fuelIconBadge, { backgroundColor: '#FFF3E0' }]}>
                <Icon name="flame" size={20} color="#FF6F00" />
              </View>
              <View style={[styles.tankPill, { backgroundColor: '#FF6F00' }]}>
                <Text style={styles.tankPillText}>Tank 1 (MS)</Text>
              </View>
            </View>
            <Text style={styles.fuelTypeName}>Petrol Sold</Text>
            <Text style={[styles.fuelVolumeNumber, { color: '#FF6F00' }]}>
              {metrics.petrolLiters.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <Text style={styles.literUnit}>L</Text>
            </Text>
            <View style={styles.fuelAmountRow}>
              <Text style={styles.fuelAmountLabel}>Amount:</Text>
              <Text style={styles.fuelAmountVal}>₹{metrics.petrolRev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          </View>

          {/* Diesel Volume Card */}
          <View style={[styles.fuelVolumeCard, { borderColor: '#003C8F' }]}>
            <View style={styles.fuelCardTop}>
              <View style={[styles.fuelIconBadge, { backgroundColor: '#E3F2FD' }]}>
                <Icon name="water" size={20} color="#003C8F" />
              </View>
              <View style={[styles.tankPill, { backgroundColor: '#003C8F' }]}>
                <Text style={styles.tankPillText}>Tank 2 (HSD)</Text>
              </View>
            </View>
            <Text style={styles.fuelTypeName}>Diesel Sold</Text>
            <Text style={[styles.fuelVolumeNumber, { color: '#003C8F' }]}>
              {metrics.dieselLiters.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <Text style={styles.literUnit}>L</Text>
            </Text>
            <View style={styles.fuelAmountRow}>
              <Text style={styles.fuelAmountLabel}>Amount:</Text>
              <Text style={styles.fuelAmountVal}>₹{metrics.dieselRev.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          </View>
        </View>

        {/* Combined Total Volume Strip */}
        <View style={styles.totalVolumeStrip}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="water-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
            <Text style={styles.totalVolumeLabel}>Total Fuel Dispensed:</Text>
          </View>
          <Text style={styles.totalVolumeVal}>{metrics.totalLiters.toFixed(2)} L</Text>
        </View>
      </View>

      {/* 4. Financial & Collection KPI Cards */}
      <View style={styles.metricsGrid}>
        {/* Total Sales */}
        <View style={[styles.metricCard, { backgroundColor: '#003C8F' }]}>
          <View style={styles.metricHeader}>
            <Icon name="cash-outline" size={22} color="#fff" />
            <View style={styles.badgeMini}>
              <Text style={styles.badgeMiniText}>{metrics.count} Entries</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>₹{metrics.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={styles.metricLabel}>Total Sales (Revenue)</Text>
        </View>

        {/* Total Fuel Sold */}
        <View style={[styles.metricCard, { backgroundColor: '#0F766E' }]}>
          <View style={styles.metricHeader}>
            <Icon name="speedometer-outline" size={22} color="#fff" />
            <View style={styles.badgeMini}>
              <Text style={styles.badgeMiniText}>Fuel Volume</Text>
            </View>
          </View>
          <Text style={styles.metricValue}>{metrics.totalLiters.toFixed(2)} L</Text>
          <Text style={styles.metricLabel}>Total Fuel Sold</Text>
        </View>
      </View>

      {/* 5. Payment Modes Breakdown Card */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="wallet-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>Payment Modes Breakdown</Text>
          </View>
          <Text style={styles.sectionBadgeText}>{timeFilter === 'today' ? "Today's Collection" : timeFilter === 'yesterday' ? "Yesterday's Collection" : timeFilter === 'week' ? "Last 7 Days" : "This Month's Collection"}</Text>
        </View>

        <View style={styles.paymentBreakdownGrid}>
          {/* Cash */}
          <View style={[styles.paymentBox, { borderLeftColor: '#16A34A' }]}>
            <Text style={styles.paymentBoxLabel}>💵 Cash</Text>
            <Text style={[styles.paymentBoxVal, { color: '#16A34A' }]}>₹{metrics.cash.toFixed(2)}</Text>
          </View>

          {/* Online / UPI */}
          <View style={[styles.paymentBox, { borderLeftColor: '#7C3AED' }]}>
            <Text style={styles.paymentBoxLabel}>📱 UPI (PhonePe / Paytm)</Text>
            <Text style={[styles.paymentBoxVal, { color: '#7C3AED' }]}>₹{metrics.online.toFixed(2)}</Text>
          </View>

          {/* Cards / POS */}
          <View style={[styles.paymentBox, { borderLeftColor: '#0284C7' }]}>
            <Text style={styles.paymentBoxLabel}>💳 Cards / POS Swipe</Text>
            <Text style={[styles.paymentBoxVal, { color: '#0284C7' }]}>₹{metrics.cards.toFixed(2)}</Text>
          </View>

          {/* Fleet / Rewards */}
          <View style={[styles.paymentBox, { borderLeftColor: '#EA580C' }]}>
            <Text style={styles.paymentBoxLabel}>⛽ Fleet / ExtraPower</Text>
            <Text style={[styles.paymentBoxVal, { color: '#EA580C' }]}>₹{metrics.fleet.toFixed(2)}</Text>
          </View>

          {/* Credit / Udhari */}
          <View style={[styles.paymentBox, { borderLeftColor: '#D97706' }]}>
            <Text style={styles.paymentBoxLabel}>📒 Credit (Udhari)</Text>
            <Text style={[styles.paymentBoxVal, { color: '#D97706' }]}>₹{metrics.udhari.toFixed(2)}</Text>
          </View>

          {/* Expenses */}
          <View style={[styles.paymentBox, { borderLeftColor: '#DC2626' }]}>
            <Text style={styles.paymentBoxLabel}>🧾 Expenses</Text>
            <Text style={[styles.paymentBoxVal, { color: '#DC2626' }]}>₹{metrics.expenses.toFixed(2)}</Text>
          </View>
        </View>

        {/* Shortage or Excess Notice */}
        <View style={[
          styles.shortageRow, 
          { backgroundColor: metrics.shortageExcess < 0 ? '#FEF2F2' : '#F0FDF4' }
        ]}>
          <Icon 
            name={metrics.shortageExcess < 0 ? "alert-circle" : "checkmark-circle"} 
            size={18} 
            color={metrics.shortageExcess < 0 ? "#DC2626" : "#16A34A"} 
          />
          <Text style={[
            styles.shortageText, 
            { color: metrics.shortageExcess < 0 ? "#DC2626" : "#16A34A" }
          ]}>
            {metrics.shortageExcess < 0 
              ? `Total Shortage: -₹${Math.abs(metrics.shortageExcess).toFixed(2)}` 
              : `Total Excess: +₹${metrics.shortageExcess.toFixed(2)}`
            }
          </Text>
        </View>
      </View>

      {/* 6. Live Tank Stock (Tank 1: Petrol • Tank 2: Diesel) */}
      <View style={styles.sectionHeaderRowTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="speedometer-outline" size={22} color="#003C8F" style={{ marginRight: 8 }} />
          <Text style={styles.sectionMainTitle}>Live Tank Inventory</Text>
        </View>
      </View>

      <FlatList 
        data={effectiveTanks}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        renderItem={renderTank}
        contentContainerStyle={{ paddingBottom: 10 }}
      />

      {/* 7. Dispenser Machines & Live Meters Overview */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="hardware-chip-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>Machines & Live Meters ({effectiveMachines.length} Machines)</Text>
          </View>
        </View>

        {effectiveMachines.map((m, idx) => {
          const match = String(m.name || m.id || '').match(/\d+/);
          const num = match ? parseInt(match[0], 10) : (idx + 1);
          const pNz = m.petrolNozzle || `N${(num - 1) * 2 + 1}`;
          const dNz = m.dieselNozzle || `N${(num - 1) * 2 + 2}`;

          // Find the latest submitted sale for this machine (allSales is sorted latest first)
          const latestSale = allSales.find(s => 
            s.machineId === m.id || 
            s.machineName === m.name || 
            s.machineName === m.id || 
            s.machineId === m.name ||
            (m.name && s.machineName && s.machineName.toLowerCase() === m.name.toLowerCase())
          );

          const pDoc = nozzles.find(n => (n.machineId === m.id || n.machineName === m.id) && (n.fuelType === 'Petrol' || n.nozzleId === pNz));
          const dDoc = nozzles.find(n => (n.machineId === m.id || n.machineName === m.id) && (n.fuelType === 'Diesel' || n.nozzleId === dNz));

          const pMeter = latestSale?.petrolEntry?.closingMeterReading || 
                         latestSale?.petrolClosingMeter || 
                         pDoc?.currentMeterReading || 
                         m.petrolClosingMeter || 
                         '0.0000';

          const dMeter = latestSale?.dieselEntry?.closingMeterReading || 
                         latestSale?.dieselClosingMeter || 
                         dDoc?.currentMeterReading || 
                         m.dieselClosingMeter || 
                         '0.0000';

          const staffName = latestSale ? (salesmenMap[latestSale.salesmanId] || latestSale.salesmanName || 'Staff') : null;

          return (
            <View key={m.id || idx} style={styles.machineRow}>
              <View style={styles.machineBadge}>
                <Text style={styles.machineBadgeText}>{m.name || m.id}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={styles.nozzleMeterRow}>
                  <View style={[styles.fuelDot, { backgroundColor: '#FF6F00' }]} />
                  <Text style={styles.nozzleLabel}>{pNz} (Petrol):</Text>
                  <Text style={styles.meterVal}>{pMeter}</Text>
                </View>
                <View style={[styles.nozzleMeterRow, { marginTop: 4 }]}>
                  <View style={[styles.fuelDot, { backgroundColor: '#003C8F' }]} />
                  <Text style={styles.nozzleLabel}>{dNz} (Diesel):</Text>
                  <Text style={styles.meterVal}>{dMeter}</Text>
                </View>
                {latestSale && (
                  <Text style={{ fontSize: 10, color: '#16A34A', fontWeight: '600', marginTop: 4 }}>
                    🟢 Live Closing Reading • {staffName}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* 8. Active Staff Overview */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="people-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>Active Staff ({salesmen.length} Salesmen)</Text>
          </View>
          <Text style={{ fontSize: 11, color: '#64748B' }}>Tap staff for Attendance & Adv</Text>
        </View>

        {salesmen.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No staff registered yet.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
            {salesmen.map((s) => {
              const currentAtt = getStaffMonthlyAttendance(allSales, s.id, s.name, getMonthKey());
              const currentAdvTotal = salaryAdvances
                .filter(a => ((a.salesmanId === s.id) || (a.salesmanName && s.name && a.salesmanName.trim().toLowerCase() === s.name.trim().toLowerCase())) && (a.monthKey || getMonthKey()) === getMonthKey())
                .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

              return (
                <TouchableOpacity 
                  key={s.id} 
                  style={styles.staffChip}
                  onPress={() => {
                    setSelectedStaffModal(s);
                    setStaffModalMonth(getMonthKey());
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.staffAvatar}>
                    <Icon name="person" size={18} color="#003C8F" />
                  </View>
                  <View style={{ marginLeft: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.staffName}>{s.name || 'Salesman'}</Text>
                      <Icon name="chevron-forward" size={12} color="#94A3B8" style={{ marginLeft: 3 }} />
                    </View>
                    <Text style={styles.staffPhone}>{s.phone || 'No phone'}</Text>
                    
                    {/* Quick Badges: Attendance & Advance */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={styles.staffChipAttBadge}>
                        <Icon name="calendar-outline" size={10} color="#003C8F" style={{ marginRight: 3 }} />
                        <Text style={styles.staffChipAttText}>{currentAtt.daysCount} Days</Text>
                      </View>
                      {currentAdvTotal > 0 && (
                        <View style={styles.staffChipAdvBadge}>
                          <Text style={styles.staffChipAdvText}>₹{currentAdvTotal.toFixed(0)} Adv</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* 8.5 Staff Salary / Advance Tracker (Owner View with Month Filter) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="wallet-outline" size={20} color="#B45309" style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>Staff Salary / Advances</Text>
          </View>
          <View style={styles.advanceTotalBadge}>
            <Text style={styles.advanceTotalBadgeText}>
              Total: ₹{salaryAdvanceSummary.grandTotal.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Month Selector Pills */}
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.monthSelectorLabel}>Select Month:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2 }}>
            {availableAdvanceMonths.map((m) => {
              const isSelected = m === selectedAdvanceMonth;
              const dateObj = new Date(m + '-01');
              const monthLabel = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleString('en-IN', { month: 'short', year: 'numeric' })
                : m;

              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.monthPill, isSelected && styles.monthPillActive]}
                  onPress={() => setSelectedAdvanceMonth(m)}
                >
                  <Icon 
                    name="calendar-outline" 
                    size={13} 
                    color={isSelected ? '#fff' : '#64748B'} 
                    style={{ marginRight: 4 }} 
                  />
                  <Text style={[styles.monthPillText, isSelected && styles.monthPillTextActive]}>
                    {monthLabel} {m === getMonthKey() ? '(Current)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Staff Advance List */}
        {salaryAdvanceSummary.staffList.length === 0 ? (
          <View style={styles.emptyAdvanceBox}>
            <Icon name="checkmark-circle-outline" size={28} color="#16A34A" />
            <Text style={styles.emptyAdvanceText}>
              No salary advance taken by any staff this month.
            </Text>
          </View>
        ) : (
          salaryAdvanceSummary.staffList.map((st) => (
            <TouchableOpacity
              key={st.salesmanId}
              style={styles.staffAdvanceCard}
              onPress={() => setSelectedStaffAdvanceDetails(st)}
              activeOpacity={0.7}
            >
              <View style={styles.staffAdvanceTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.staffAdvanceAvatar}>
                    <Icon name="person" size={16} color="#B45309" />
                  </View>
                  <View style={{ marginLeft: 8 }}>
                    <Text style={styles.staffAdvanceName}>{st.salesmanName}</Text>
                    <Text style={styles.staffAdvanceCount}>{st.entries.length} advance(s) taken</Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.staffAdvanceAmount}>₹{st.totalAmount.toFixed(0)}</Text>
                  <Text style={styles.viewSlipLink}>View Details ➔</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>


      {/* 10. Recent Sales Reports Feed */}
      <View style={styles.sectionHeaderRowTop}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="list-outline" size={22} color="#003C8F" style={{ marginRight: 8 }} />
          <Text style={styles.sectionMainTitle}>Recent Sales Transactions</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Reports')}>
          <Text style={styles.linkText}>View All Reports ➔</Text>
        </TouchableOpacity>
      </View>
      
      {filteredSales.length === 0 ? (
        <View style={styles.emptySalesCard}>
          <Icon name="receipt-outline" size={32} color="#94A3B8" />
          <Text style={styles.emptySalesText}>No sales recorded for this period.</Text>
        </View>
      ) : (
        filteredSales.slice(0, 6).map(sale => (
          <View key={sale.id} style={styles.recentSaleCard}>
            <View style={styles.saleHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.saleMachinePill}>
                  <Text style={styles.saleMachineText}>{sale.machineName || sale.machineId || 'Machine'}</Text>
                </View>
                <Text style={styles.saleTime}>
                  {sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </Text>
              </View>
              <Text style={styles.saleAmount}>₹{Number(sale.expectedTotalAmount || sale.totalPayment || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.saleDetails}>
              <Text style={styles.saleDetailText}>
                ⛽ {Number(sale.petrolQuantitySold || 0).toFixed(2)} L  •  🛢️ {Number(sale.dieselQuantitySold || 0).toFixed(2)} L
              </Text>
              <Text style={styles.saleSalesman}>
                {salesmenMap[sale.salesmanId] || sale.salesmanName || 'Staff'}
              </Text>
            </View>
          </View>
        ))
      )}
      
      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Staff Salary Advance Details Modal */}
    <Modal
      visible={!!selectedStaffAdvanceDetails}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setSelectedStaffAdvanceDetails(null)}
    >
      <View style={styles.advanceModalOverlay}>
        <View style={styles.advanceModalContent}>
          <View style={styles.advanceModalHeader}>
            <View>
              <Text style={styles.advanceModalTitle}>
                {selectedStaffAdvanceDetails?.salesmanName || 'Staff'} - Salary / Advances
              </Text>
              <Text style={styles.advanceModalSubtitle}>
                Month: {selectedAdvanceMonth} • Total: ₹{selectedStaffAdvanceDetails?.totalAmount?.toFixed(0) || '0'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedStaffAdvanceDetails(null)}>
              <Icon name="close-circle" size={26} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 380, marginTop: 10 }} showsVerticalScrollIndicator={false}>
            {selectedStaffAdvanceDetails?.entries?.map((entry, index) => {
              const entryDate = entry.timestamp?.toDate
                ? entry.timestamp.toDate()
                : (entry.timestamp ? new Date(entry.timestamp) : new Date());
              const dateFormatted = entryDate.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              });
              const timeFormatted = entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <View key={entry.id || index} style={styles.advanceEntryRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon name="calendar-outline" size={13} color="#003C8F" />
                      <Text style={styles.advanceEntryDate}> {dateFormatted} at {timeFormatted}</Text>
                    </View>
                    <Text style={styles.advanceEntryMachine}>
                      Machine: <Text style={{ fontWeight: '700', color: '#334155' }}>{entry.machineName || entry.machineId || 'DU1'}</Text>
                    </Text>
                    {entry.notes ? (
                      <Text style={styles.advanceEntryNotes}>
                        Notes: "{entry.notes}"
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.advanceEntryAmountWrap}>
                    <Text style={styles.advanceEntryAmount}>₹{parseFloat(entry.amount || 0).toFixed(0)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.advanceModalCloseBtn}
            onPress={() => setSelectedStaffAdvanceDetails(null)}
          >
            <Text style={styles.advanceModalCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Dedicated Staff Attendance & Advance Detail Modal (Active Staff Click) */}
    <Modal
      visible={!!selectedStaffModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setSelectedStaffModal(null)}
    >
      <View style={styles.staffModalOverlay}>
        <View style={styles.staffModalContent}>
          {/* Modal Header */}
          <View style={styles.staffModalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.staffModalAvatar}>
                <Icon name="person" size={22} color="#003C8F" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.staffModalTitle}>{selectedStaffModal?.name || 'Staff'}</Text>
                <Text style={styles.staffModalSubtitle}>📞 {selectedStaffModal?.phone || 'No phone'}</Text>
              </View>
            </View>
            <TouchableOpacity 
              onPress={() => setSelectedStaffModal(null)} 
              style={styles.staffModalCloseIcon}
            >
              <Icon name="close-circle" size={26} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Month Selector Tabs (Current Month vs Previous Month vs Older) */}
          <View style={styles.staffModalMonthRow}>
            <Text style={styles.staffModalMonthLabel}>Select Month:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
              {/* Option 1: Current Month */}
              <TouchableOpacity
                style={[styles.staffModalMonthPill, staffModalMonth === getMonthKey() && styles.staffModalMonthPillActive]}
                onPress={() => setStaffModalMonth(getMonthKey())}
              >
                <Icon 
                  name="calendar-outline" 
                  size={12} 
                  color={staffModalMonth === getMonthKey() ? '#fff' : '#003C8F'} 
                  style={{ marginRight: 4 }} 
                />
                <Text style={[styles.staffModalMonthPillText, staffModalMonth === getMonthKey() && styles.staffModalMonthPillTextActive]}>
                  {formatMonthLabel(getMonthKey())} (This Month)
                </Text>
              </TouchableOpacity>

              {/* Option 2: Previous Month (1 month pahle) */}
              <TouchableOpacity
                style={[styles.staffModalMonthPill, staffModalMonth === getPreviousMonthKey() && styles.staffModalMonthPillActive]}
                onPress={() => setStaffModalMonth(getPreviousMonthKey())}
              >
                <Icon 
                  name="time-outline" 
                  size={12} 
                  color={staffModalMonth === getPreviousMonthKey() ? '#fff' : '#003C8F'} 
                  style={{ marginRight: 4 }} 
                />
                <Text style={[styles.staffModalMonthPillText, staffModalMonth === getPreviousMonthKey() && styles.staffModalMonthPillTextActive]}>
                  {formatMonthLabel(getPreviousMonthKey())} (Last Month)
                </Text>
              </TouchableOpacity>

              {/* Older available months if any */}
              {availableAdvanceMonths
                .filter(m => m !== getMonthKey() && m !== getPreviousMonthKey())
                .map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.staffModalMonthPill, staffModalMonth === m && styles.staffModalMonthPillActive]}
                    onPress={() => setStaffModalMonth(m)}
                  >
                    <Text style={[styles.staffModalMonthPillText, staffModalMonth === m && styles.staffModalMonthPillTextActive]}>
                      {formatMonthLabel(m)}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>

          {/* 2 Big Highlight Stat Cards: Attendance & Advance */}
          <View style={styles.staffModalStatCardsRow}>
            {/* Attendance Card */}
            <View style={styles.staffModalStatCardAtt}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Icon name="calendar" size={15} color="#003C8F" />
                <Text style={styles.staffModalStatCardTitle}> Days Present</Text>
              </View>
              <Text style={styles.staffModalStatCardValAtt}>
                {staffModalAttendance.daysCount} <Text style={{ fontSize: 13, fontWeight: 'normal' }}>Din</Text>
              </Text>
              <Text style={styles.staffModalStatCardSub}>
                {staffModalAttendance.entriesCount} shifts • {staffModalAttendance.totalLiters.toFixed(0)} L sold
              </Text>
            </View>

            {/* Advance Card */}
            <View style={styles.staffModalStatCardAdv}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Icon name="wallet" size={15} color="#B45309" />
                <Text style={[styles.staffModalStatCardTitle, { color: '#92400E' }]}> Salary Advance</Text>
              </View>
              <Text style={styles.staffModalStatCardValAdv}>
                ₹{staffModalAdvances.totalAmount.toFixed(0)}
              </Text>
              <Text style={[styles.staffModalStatCardSub, { color: '#B45309' }]}>
                {staffModalAdvances.entries.length} payment(s) taken
              </Text>
            </View>
          </View>

          {/* Scrollable Sections: Attendance Dates & Advance Slips */}
          <ScrollView style={{ maxHeight: 350, marginTop: 10 }} showsVerticalScrollIndicator={false}>
            {/* Section A: Attendance Dates ("kis kis date ko daily entry diye ho") */}
            <View style={styles.staffModalSectionBox}>
              <View style={styles.staffModalSectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="checkbox-outline" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.staffModalSectionTitle}>
                    Daily Entry Dates ({staffModalAttendance.daysCount} Days in {formatMonthLabel(staffModalMonth)})
                  </Text>
                </View>
              </View>

              {staffModalAttendance.distinctDates.length === 0 ? (
                <View style={styles.staffModalEmptyBox}>
                  <Icon name="calendar-outline" size={26} color="#94A3B8" />
                  <Text style={styles.staffModalEmptyText}>
                    No daily entry submitted by {selectedStaffModal?.name} in {formatMonthLabel(staffModalMonth)}.
                  </Text>
                </View>
              ) : (
                <View style={{ padding: 10 }}>
                  <Text style={styles.staffModalHintText}>
                    Iss mahine me in dates ko staff ne daily entry submit ki hai:
                  </Text>
                  {staffModalAttendance.distinctDates.map((item, idx) => (
                    <View key={item.dayKey || idx} style={styles.attendanceDayRow}>
                      <View style={styles.attendanceDayBadge}>
                        <Text style={styles.attendanceDayNum}>{idx + 1}</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.attendanceDayDate}>{item.dateFormatted}</Text>
                          <View style={styles.attendanceWeekdayPill}>
                            <Text style={styles.attendanceWeekdayText}>{item.weekday}</Text>
                          </View>
                        </View>
                        <Text style={styles.attendanceDayMachine}>
                          Machine: <Text style={{ fontWeight: '700', color: '#1E293B' }}>{item.machinesList}</Text>
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.attendanceDayLiters}>
                          {item.dayLiters > 0 ? `${item.dayLiters.toFixed(1)} L` : 'Shift Logged'}
                        </Text>
                        <Text style={styles.attendanceDayShiftCount}>
                          {item.shiftsCount} shift{item.shiftsCount > 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Section B: Salary Advances List */}
            <View style={[styles.staffModalSectionBox, { marginTop: 14 }]}>
              <View style={[styles.staffModalSectionHeader, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="cash-outline" size={16} color="#B45309" style={{ marginRight: 6 }} />
                  <Text style={[styles.staffModalSectionTitle, { color: '#92400E' }]}>
                    Salary Advances Taken (Total: ₹{staffModalAdvances.totalAmount.toFixed(0)})
                  </Text>
                </View>
              </View>

              {staffModalAdvances.entries.length === 0 ? (
                <View style={styles.staffModalEmptyBox}>
                  <Icon name="checkmark-circle-outline" size={26} color="#16A34A" />
                  <Text style={[styles.staffModalEmptyText, { color: '#15803D' }]}>
                    No salary advance taken in {formatMonthLabel(staffModalMonth)}.
                  </Text>
                </View>
              ) : (
                <View style={{ padding: 10 }}>
                  {staffModalAdvances.entries.map((entry, idx) => {
                    const entryDate = entry.timestamp?.toDate
                      ? entry.timestamp.toDate()
                      : (entry.timestamp ? new Date(entry.timestamp) : new Date());
                    const dateFormatted = entryDate.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    });

                    return (
                      <View key={entry.id || idx} style={styles.advanceItemRowModal}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.advanceItemDateModal}>📅 {dateFormatted}</Text>
                          <Text style={styles.advanceItemNotesModal}>
                            {entry.notes || 'Salary Advance'} {entry.machineName ? `• ${entry.machineName}` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.advanceItemAmtModal}>₹{parseFloat(entry.amount || 0).toFixed(0)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.staffModalCloseBtn}
            onPress={() => setSelectedStaffModal(null)}
          >
            <Text style={styles.staffModalCloseBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F8F9FA', 
    padding: 15 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16,
    marginTop: 6
  },
  greeting: { 
    fontSize: 26, 
    fontWeight: '900', 
    color: '#003C8F',
    letterSpacing: 0.5
  },
  subGreeting: { 
    fontSize: 12, 
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconBtn: { 
    backgroundColor: '#EEF2F6', 
    padding: 8, 
    borderRadius: 10 
  },
  
  // Filter Row
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8
  },
  activeFilterPill: {
    backgroundColor: '#003C8F',
    elevation: 2
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B'
  },
  activeFilterPillText: {
    color: '#fff'
  },

  // Highlighted Fuel Dispensed Section
  sectionCardHighlighted: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#003C8F'
  },
  sectionTitleBold: {
    fontSize: 16,
    fontWeight: '900',
    color: '#003C8F'
  },
  filterBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  filterBadgeText: {
    color: '#003C8F',
    fontSize: 11,
    fontWeight: 'bold'
  },

  fuelVolumeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 12
  },
  fuelVolumeCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5
  },
  fuelCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  fuelIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tankPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  tankPillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  fuelTypeName: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '700'
  },
  fuelVolumeNumber: {
    fontSize: 22,
    fontWeight: '900',
    marginVertical: 4
  },
  literUnit: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B'
  },
  fuelAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2
  },
  fuelAmountLabel: {
    fontSize: 11,
    color: '#64748B',
    marginRight: 4
  },
  fuelAmountVal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B'
  },

  totalVolumeStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  totalVolumeLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E40AF'
  },
  totalVolumeVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#003C8F'
  },

  // Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  metricCard: {
    width: '48.5%',
    borderRadius: 14,
    padding: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  badgeMini: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  badgeMiniText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold'
  },
  metricSubTag: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: 'bold'
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 2
  },
  metricLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600'
  },

  // Section Card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 15,
    marginBottom: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8
  },
  sectionHeaderRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 6
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  sectionMainTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B'
  },
  linkText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003C8F'
  },

  // Payment Breakdown
  paymentBreakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  paymentBox: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 4
  },
  paymentBoxLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4
  },
  paymentBoxVal: {
    fontSize: 15,
    fontWeight: 'bold'
  },

  shortageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 6
  },
  shortageText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6
  },

  tankWrapper: {
    width: width * 0.78,
    marginRight: 12
  },

  // Machines & Meters
  machineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  machineBadge: {
    backgroundColor: '#003C8F',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8
  },
  machineBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13
  },
  nozzleMeterRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  fuelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  nozzleLabel: {
    fontSize: 12,
    color: '#475569',
    width: 75
  },
  meterVal: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A'
  },

  // Staff Chips
  staffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  staffAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  staffName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  staffPhone: {
    fontSize: 11,
    color: '#64748B'
  },

  // Pending Cards
  pendingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  pendingInfo: { flex: 1 },
  pendingName: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  pendingTime: { fontSize: 11, color: '#64748B', marginTop: 3 },
  pendingAction: { flexDirection: 'row', alignItems: 'center' },
  pendingAmount: { fontSize: 16, fontWeight: '900', color: '#DC2626', marginRight: 10 },
  settleBtn: { padding: 4 },

  // Recent Sales Cards
  recentSaleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#003C8F',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  saleMachinePill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 8
  },
  saleMachineText: {
    color: '#1E40AF',
    fontSize: 11,
    fontWeight: 'bold'
  },
  saleTime: {
    fontSize: 12,
    color: '#64748B'
  },
  saleAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A'
  },
  saleDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  saleDetailText: {
    fontSize: 12,
    color: '#475569'
  },
  saleSalesman: {
    fontSize: 11,
    color: '#003C8F',
    fontWeight: 'bold',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8
  },

  emptyCard: {
    padding: 16,
    alignItems: 'center'
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic'
  },
  emptySalesCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  emptySalesText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 6
  },

  // OTP Section Styles
  otpSection: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    elevation: 2
  },
  otpSectionHeader: {
    marginBottom: 10
  },
  otpPulseBadge: {
    backgroundColor: '#FEF3C7',
    padding: 5,
    borderRadius: 8,
    marginRight: 6
  },
  otpSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E'
  },
  otpSectionSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2
  },
  otpCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  otpCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  otpStaffName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B'
  },
  otpMachineName: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  otpRejectBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  otpRejectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626'
  },
  otpCodeBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center'
  },
  otpCodeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 1
  },
  otpCodeValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#92400E',
    letterSpacing: 8,
    marginVertical: 2
  },
  otpExpiresText: {
    fontSize: 10,
    color: '#D97706',
    fontStyle: 'italic'
  },

  // Staff Salary / Advance Owner Section Styles
  advanceTotalBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  advanceTotalBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309'
  },
  monthSelectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  monthPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B'
  },
  monthPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  emptyAdvanceBox: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0'
  },
  emptyAdvanceText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center'
  },
  staffAdvanceCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  staffAdvanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  staffAdvanceAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D'
  },
  staffAdvanceName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B'
  },
  staffAdvanceCount: {
    fontSize: 11,
    color: '#78350F',
    marginTop: 2
  },
  staffAdvanceAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#DC2626'
  },
  viewSlipLink: {
    fontSize: 11,
    color: '#003C8F',
    fontWeight: '700',
    marginTop: 2
  },

  // Modal Styles for Staff Salary Advance Details
  advanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  advanceModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  advanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12
  },
  advanceModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B'
  },
  advanceModalSubtitle: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '700',
    marginTop: 2
  },
  advanceEntryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  advanceEntryDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#003C8F'
  },
  advanceEntryMachine: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  advanceEntryNotes: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 2
  },
  advanceEntryAmountWrap: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8
  },
  advanceEntryAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626'
  },
  advanceModalCloseBtn: {
    backgroundColor: '#003C8F',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16
  },
  advanceModalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  },

  // Staff Chip Badges
  staffChipAttBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  staffChipAttText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#003C8F'
  },
  staffChipAdvBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginLeft: 4
  },
  staffChipAdvText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309'
  },

  // Staff Attendance & Advance Modal
  staffModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end'
  },
  staffModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '90%'
  },
  staffModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  staffModalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  staffModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#003C8F'
  },
  staffModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  staffModalCloseIcon: {
    padding: 4
  },
  staffModalMonthRow: {
    marginTop: 10,
    marginBottom: 6
  },
  staffModalMonthLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4
  },
  staffModalMonthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  staffModalMonthPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  staffModalMonthPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#003C8F'
  },
  staffModalMonthPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  staffModalStatCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  staffModalStatCardAtt: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  staffModalStatCardAdv: {
    flex: 1,
    backgroundColor: '#FFFDF7',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  staffModalStatCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#003C8F',
    textTransform: 'uppercase'
  },
  staffModalStatCardValAtt: {
    fontSize: 22,
    fontWeight: '900',
    color: '#003C8F',
    marginVertical: 2
  },
  staffModalStatCardValAdv: {
    fontSize: 22,
    fontWeight: '900',
    color: '#B45309',
    marginVertical: 2
  },
  staffModalStatCardSub: {
    fontSize: 10.5,
    color: '#64748B'
  },
  staffModalSectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  staffModalSectionHeader: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  staffModalSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A'
  },
  staffModalEmptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16
  },
  staffModalEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6
  },
  staffModalHintText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8
  },
  attendanceDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  attendanceDayBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  attendanceDayNum: {
    fontSize: 11,
    fontWeight: '800',
    color: '#003C8F'
  },
  attendanceDayDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  attendanceWeekdayPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6
  },
  attendanceWeekdayText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569'
  },
  attendanceDayMachine: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  attendanceDayLiters: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A'
  },
  attendanceDayShiftCount: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1
  },
  advanceItemRowModal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7'
  },
  advanceItemDateModal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B'
  },
  advanceItemNotesModal: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2
  },
  advanceItemAmtModal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#B45309'
  },
  staffModalCloseBtn: {
    backgroundColor: '#003C8F',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14
  },
  staffModalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700'
  }
});
