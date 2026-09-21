import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { db } from '../../../services/firebase';
import {
  getMonthKey,
  getPreviousMonthKey,
  formatMonthLabel,
  saveMonthlyCommissionRate,
  getMonthlyCommissionRate
} from '../../../services/dbServices';

// Helper to determine if an expense is a staff salary advance
const isSalaryAdvance = (e) => {
  if (!e) return false;
  if (e.type === 'salary') return true;
  const r = (e.reason || '').toLowerCase();
  const n = (e.notes || '').toLowerCase();
  return (
    r.includes('salary') || r.includes('advance') || r.includes('वेतन') || r.includes('एडवांस') ||
    n.includes('salary') || n.includes('advance') || n.includes('वेतन') || n.includes('एडवांस')
  );
};

export default function ProfitCalculator() {
  const currentMonthKey = useMemo(() => getMonthKey(), []);
  const previousMonthKey = useMemo(() => getPreviousMonthKey(), []);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [petrolRate, setPetrolRate] = useState('');
  const [dieselRate, setDieselRate] = useState('');
  const [isSavingRates, setIsSavingRates] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Firestore real-time data
  const [salesList, setSalesList] = useState([]);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [salesmenMap, setSalesmenMap] = useState({});

  // Collapsible detailed breakdowns
  const [showStaffBreakdown, setShowStaffBreakdown] = useState(false);
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState(false);

  // 1. Subscribe to Firestore data
  useEffect(() => {
    const unsubSales = onSnapshot(collection(db, 'sales_reports'), (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setSalesList(list);
    }, (err) => console.warn('Sales fetch error in profit calc:', err.message));

    const unsubSalary = onSnapshot(collection(db, 'staff_salary_advances'), (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setSalaryAdvances(list);
    }, (err) => console.warn('Salary advances fetch error in profit calc:', err.message));

    const unsubUsers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'salesman')), (snapshot) => {
      const map = {};
      snapshot.forEach((doc) => {
        map[doc.id] = doc.data().name || 'Staff';
      });
      setSalesmenMap(map);
    }, (err) => console.warn('Users fetch error in profit calc:', err.message));

    return () => {
      unsubSales();
      unsubSalary();
      unsubUsers();
    };
  }, []);

  // 2. Load Commission Rates whenever selectedMonth changes
  useEffect(() => {
    let isMounted = true;
    const loadRates = async () => {
      setLoadingConfig(true);
      try {
        const config = await getMonthlyCommissionRate(selectedMonth);
        if (isMounted) {
          if (config && (config.petrolRate !== undefined || config.dieselRate !== undefined)) {
            setPetrolRate(config.petrolRate ? String(config.petrolRate) : '');
            setDieselRate(config.dieselRate ? String(config.dieselRate) : '');
          } else {
            // Check if current month has rates we can prefill as default
            const currentConfig = await getMonthlyCommissionRate(currentMonthKey);
            if (isMounted && currentConfig) {
              setPetrolRate(currentConfig.petrolRate ? String(currentConfig.petrolRate) : '');
              setDieselRate(currentConfig.dieselRate ? String(currentConfig.dieselRate) : '');
            } else {
              setPetrolRate('');
              setDieselRate('');
            }
          }
        }
      } catch (err) {
        console.warn('Error loading commission config:', err.message);
      } finally {
        if (isMounted) setLoadingConfig(false);
      }
    };

    loadRates();
    return () => {
      isMounted = false;
    };
  }, [selectedMonth, currentMonthKey]);

  // 3. Available Month Keys (Current, Last month, and any months found in reports)
  const availableMonths = useMemo(() => {
    const set = new Set();
    set.add(currentMonthKey);
    set.add(previousMonthKey);

    // Also add past 6 months to make jumping back easy
    const now = new Date();
    for (let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(getMonthKey(d));
    }

    salesList.forEach((item) => {
      const d = item.timestamp?.toDate ? item.timestamp.toDate() : (item.timestamp ? new Date(item.timestamp) : null);
      if (d && !isNaN(d.getTime())) {
        set.add(getMonthKey(d));
      }
    });

    return Array.from(set).sort().reverse();
  }, [salesList, currentMonthKey, previousMonthKey]);

  // Quick navigation: prev / next month
  const handleShiftMonth = (direction) => {
    const parts = selectedMonth.split('-');
    if (parts.length === 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const targetDate = new Date(y, m + direction, 1);
      setSelectedMonth(getMonthKey(targetDate));
    }
  };

  // 4. Save Commission Rates for Selected Month
  const handleSaveRates = async () => {
    const pNum = parseFloat(petrolRate) || 0;
    const dNum = parseFloat(dieselRate) || 0;

    if (pNum < 0 || dNum < 0) {
      Toast.show({ type: 'error', text1: 'Invalid Rate', text2: 'Commission rate cannot be negative.' });
      return;
    }

    setIsSavingRates(true);
    try {
      await saveMonthlyCommissionRate(selectedMonth, { petrolRate: pNum, dieselRate: dNum });
      Toast.show({
        type: 'success',
        text1: 'Commission Saved! ✅',
        text2: `${formatMonthLabel(selectedMonth)}: Petrol ₹${pNum}/L • Diesel ₹${dNum}/L`
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Save Failed', text2: error.message });
    } finally {
      setIsSavingRates(false);
    }
  };

  // 5. Monthly Calculations
  const calculations = useMemo(() => {
    let petrolSold = 0;
    let dieselSold = 0;
    const shiftOperatingExpenses = [];
    const shiftSalaryAdvances = [];

    // Filter sales reports belonging to selectedMonth
    salesList.forEach((item) => {
      const d = item.timestamp?.toDate ? item.timestamp.toDate() : (item.timestamp ? new Date(item.timestamp) : null);
      if (!d || isNaN(d.getTime())) return;

      const itemMonth = getMonthKey(d);
      if (itemMonth !== selectedMonth) return;

      // Fuel Liters Sold
      const pQty = Number(item.petrolQuantitySold ?? (item.fuelType === 'Petrol' ? item.totalQuantitySold : 0) ?? 0);
      const dQty = Number(item.dieselQuantitySold ?? (item.fuelType === 'Diesel' ? item.totalQuantitySold : 0) ?? 0);
      petrolSold += pQty;
      dieselSold += dQty;

      // Extract shift expenses breakdown
      const staffName = salesmenMap[item.salesmanId] || item.salesmanName || 'Staff';
      const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

      if (item.expenseBreakdown && Array.isArray(item.expenseBreakdown) && item.expenseBreakdown.length > 0) {
        item.expenseBreakdown.forEach((exp, idx) => {
          const amt = Number(exp.amount || 0);
          if (amt <= 0) return;

          if (isSalaryAdvance(exp)) {
            shiftSalaryAdvances.push({
              id: `${item.id}_${idx}`,
              reportId: item.id,
              recipient: exp.salesmanName || staffName,
              amount: amt,
              notes: exp.notes || exp.reason || 'Salary Advance',
              dateStr: dateFormatted,
              machineName: item.machineName || item.machineId || 'Machine'
            });
          } else {
            shiftOperatingExpenses.push({
              id: `${item.id}_${idx}`,
              reason: exp.reason || 'Operating Expense',
              amount: amt,
              dateStr: dateFormatted,
              staffName,
              machineName: item.machineName || item.machineId || 'Machine'
            });
          }
        });
      } else if (Number(item.expenses || 0) > 0) {
        // Fallback if no breakdown array was stored
        shiftOperatingExpenses.push({
          id: `${item.id}_direct`,
          reason: 'Shift Operating Expense',
          amount: Number(item.expenses),
          dateStr: dateFormatted,
          staffName,
          machineName: item.machineName || item.machineId || 'Machine'
        });
      }
    });

    // Extract staff salary advances from staff_salary_advances collection (deduplicating against shift entries)
    const allSalaryAdvancesList = [...shiftSalaryAdvances];

    salaryAdvances.forEach((adv) => {
      const advMonth = adv.monthKey || (adv.timestamp?.toDate ? getMonthKey(adv.timestamp.toDate()) : null);
      if (advMonth !== selectedMonth) return;

      const amt = Number(adv.amount || 0);
      if (amt <= 0) return;

      // Avoid double counting if already captured from shift expenseBreakdown
      const alreadyCaptured = adv.reportId && allSalaryAdvancesList.some(
        (x) => x.reportId === adv.reportId && Math.abs(x.amount - amt) < 0.01
      );

      if (!alreadyCaptured) {
        const advDate = adv.timestamp?.toDate
          ? adv.timestamp.toDate()
          : (adv.timestamp ? new Date(adv.timestamp) : new Date());
        allSalaryAdvancesList.push({
          id: adv.id,
          recipient: adv.salesmanName || salesmenMap[adv.salesmanId] || 'Staff',
          amount: amt,
          notes: adv.notes || adv.reason || 'Salary Advance',
          dateStr: advDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          machineName: adv.machineName || '-'
        });
      }
    });

    const totalStaffAdvanceAmount = allSalaryAdvancesList.reduce((acc, curr) => acc + curr.amount, 0);
    const totalOperatingExpenseAmount = shiftOperatingExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    const totalDeductions = totalStaffAdvanceAmount + totalOperatingExpenseAmount;

    const pRateNum = parseFloat(petrolRate) || 0;
    const dRateNum = parseFloat(dieselRate) || 0;

    const petrolGrossMargin = petrolSold * pRateNum;
    const dieselGrossMargin = dieselSold * dRateNum;
    const totalGrossCommission = petrolGrossMargin + dieselGrossMargin;

    const netProfit = totalGrossCommission - totalDeductions;

    return {
      petrolSold,
      dieselSold,
      totalFuelSold: petrolSold + dieselSold,
      petrolGrossMargin,
      dieselGrossMargin,
      totalGrossCommission,
      totalStaffAdvanceAmount,
      totalOperatingExpenseAmount,
      totalDeductions,
      netProfit,
      shiftOperatingExpenses,
      allSalaryAdvancesList
    };
  }, [salesList, salaryAdvances, selectedMonth, salesmenMap, petrolRate, dieselRate]);

  const isCurrentMonth = selectedMonth === currentMonthKey;
  const isPreviousMonth = selectedMonth === previousMonthKey;
  const netProfitValue = calculations.netProfit;
  const isProfitPositive = netProfitValue >= 0;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 50 }}
    >
      {/* 1. Header Banner */}
      <View style={styles.headerCard}>
        <View style={styles.headerIconWrap}>
          <Icon name="calculator" size={24} color="#003C8F" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Profit Calculator (मुनाफा)</Text>
          <Text style={styles.headerSubtitle}>
            Monthly commission margin minus staff salary & operating expenses.
          </Text>
        </View>
      </View>

      {/* 2. Month Selector Bar */}
      <View style={styles.monthCard}>
        <View style={styles.monthNavRow}>
          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => handleShiftMonth(-1)}
            activeOpacity={0.7}
          >
            <Icon name="chevron-back" size={20} color="#003C8F" />
            <Text style={styles.monthNavBtnText}>Prev</Text>
          </TouchableOpacity>

          <View style={styles.monthCurrentCenter}>
            <Text style={styles.monthCurrentText}>
              📅 {formatMonthLabel(selectedMonth)}
            </Text>
            {isCurrentMonth && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>This Month</Text>
              </View>
            )}
            {isPreviousMonth && (
              <View style={[styles.currentBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.currentBadgeText, { color: '#B45309' }]}>Last Month</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.monthNavBtn}
            onPress={() => handleShiftMonth(1)}
            activeOpacity={0.7}
          >
            <Text style={styles.monthNavBtnText}>Next</Text>
            <Icon name="chevron-forward" size={20} color="#003C8F" />
          </TouchableOpacity>
        </View>

        {/* Quick Month Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthPillsScroll}>
          {availableMonths.map((m) => {
            const isSel = m === selectedMonth;
            const isCurr = m === currentMonthKey;
            const isPrev = m === previousMonthKey;

            return (
              <TouchableOpacity
                key={m}
                style={[styles.monthChip, isSel && styles.monthChipActive]}
                onPress={() => setSelectedMonth(m)}
              >
                <Text style={[styles.monthChipText, isSel && styles.monthChipTextActive]}>
                  {formatMonthLabel(m)} {isCurr ? '• Now' : isPrev ? '• Last' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Fuel Commission Setting Inputs */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Icon name="options-outline" size={20} color="#003C8F" />
          <Text style={styles.cardTitle}>Set Commission Rate (प्रति लीटर कमीशन)</Text>
        </View>
        <Text style={styles.cardSubtitle}>
          Enter profit commission per liter for {formatMonthLabel(selectedMonth)}. Calculations update live:
        </Text>

        {loadingConfig ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#003C8F" />
            <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>Loading rates...</Text>
          </View>
        ) : (
          <View>
            <View style={styles.rateInputsRow}>
              {/* Petrol Commission Input */}
              <View style={[styles.rateInputBox, { borderColor: '#FF6F00' }]}>
                <View style={styles.rateInputHeader}>
                  <View style={[styles.dot, { backgroundColor: '#FF6F00' }]} />
                  <Text style={[styles.rateInputLabel, { color: '#C2410C' }]}>
                    Petrol Commission
                  </Text>
                </View>
                <View style={styles.inputPrefixWrap}>
                  <Text style={styles.inputRupee}>₹</Text>
                  <TextInput
                    style={styles.rateTextInput}
                    value={petrolRate}
                    onChangeText={setPetrolRate}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 3.00"
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.inputSuffix}>/ L</Text>
                </View>
              </View>

              {/* Diesel Commission Input */}
              <View style={[styles.rateInputBox, { borderColor: '#003C8F' }]}>
                <View style={styles.rateInputHeader}>
                  <View style={[styles.dot, { backgroundColor: '#003C8F' }]} />
                  <Text style={[styles.rateInputLabel, { color: '#003C8F' }]}>
                    Diesel Commission
                  </Text>
                </View>
                <View style={styles.inputPrefixWrap}>
                  <Text style={styles.inputRupee}>₹</Text>
                  <TextInput
                    style={styles.rateTextInput}
                    value={dieselRate}
                    onChangeText={setDieselRate}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 2.10"
                    placeholderTextColor="#94A3B8"
                  />
                  <Text style={styles.inputSuffix}>/ L</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.saveRateBtn}
              onPress={handleSaveRates}
              disabled={isSavingRates}
              activeOpacity={0.8}
            >
              {isSavingRates ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="checkmark-done" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveRateBtnText}>
                    Save Rates for {formatMonthLabel(selectedMonth)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 4. NET PROFIT SHOWCASE HERO CARD */}
      <View style={[styles.heroProfitCard, isProfitPositive ? styles.heroProfitPositive : styles.heroProfitNegative]}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {isProfitPositive ? '✅ NET PROFIT (शुद्ध मुनाफा)' : '⚠️ NET LOSS (घाटा)'}
            </Text>
          </View>
          <Text style={styles.heroMonthTag}>{formatMonthLabel(selectedMonth)}</Text>
        </View>

        <Text style={[styles.heroAmount, isProfitPositive ? styles.heroAmountPositive : styles.heroAmountNegative]}>
          {isProfitPositive ? '+' : ''}₹{Math.abs(netProfitValue).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          })}
        </Text>

        <Text style={styles.heroEquationText}>
          Gross Commission (₹{calculations.totalGrossCommission.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
          {' - '}
          Staff & Expenses (₹{calculations.totalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
        </Text>
      </View>

      {/* 5. Summary Grid (4 High Impact Cards) */}
      <View style={styles.summaryGrid}>
        {/* Petrol Gross Commission */}
        <View style={[styles.gridCard, { borderLeftColor: '#FF6F00' }]}>
          <View style={styles.gridCardHeader}>
            <Text style={styles.gridCardTitle}>⛽ Petrol Margin</Text>
            <Text style={[styles.gridCardValue, { color: '#C2410C' }]}>
              ₹{calculations.petrolGrossMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <Text style={styles.gridCardSub}>
            Sold: <Text style={{ fontWeight: '700' }}>{calculations.petrolSold.toFixed(1)} L</Text>
            {' • Rate: '}
            <Text style={{ fontWeight: '700' }}>₹{parseFloat(petrolRate) || 0}/L</Text>
          </Text>
        </View>

        {/* Diesel Gross Commission */}
        <View style={[styles.gridCard, { borderLeftColor: '#003C8F' }]}>
          <View style={styles.gridCardHeader}>
            <Text style={styles.gridCardTitle}>🛢️ Diesel Margin</Text>
            <Text style={[styles.gridCardValue, { color: '#003C8F' }]}>
              ₹{calculations.dieselGrossMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <Text style={styles.gridCardSub}>
            Sold: <Text style={{ fontWeight: '700' }}>{calculations.dieselSold.toFixed(1)} L</Text>
            {' • Rate: '}
            <Text style={{ fontWeight: '700' }}>₹{parseFloat(dieselRate) || 0}/L</Text>
          </Text>
        </View>

        {/* Staff Salary Advances */}
        <View style={[styles.gridCard, { borderLeftColor: '#B45309' }]}>
          <View style={styles.gridCardHeader}>
            <Text style={styles.gridCardTitle}>👨‍💼 Staff Salary / Advances</Text>
            <Text style={[styles.gridCardValue, { color: '#B45309' }]}>
              - ₹{calculations.totalStaffAdvanceAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <Text style={styles.gridCardSub}>
            Total Advances: <Text style={{ fontWeight: '700' }}>{calculations.allSalaryAdvancesList.length} records</Text>
          </Text>
        </View>

        {/* Pump Operating Expenses */}
        <View style={[styles.gridCard, { borderLeftColor: '#DC2626' }]}>
          <View style={styles.gridCardHeader}>
            <Text style={styles.gridCardTitle}>🧾 Pump Operating Expenses</Text>
            <Text style={[styles.gridCardValue, { color: '#DC2626' }]}>
              - ₹{calculations.totalOperatingExpenseAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
          <Text style={styles.gridCardSub}>
            Total Expenses: <Text style={{ fontWeight: '700' }}>{calculations.shiftOperatingExpenses.length} entries</Text>
          </Text>
        </View>
      </View>

      {/* 6. Itemized Breakdown Accordions (Simple & Easy for Owner to Audit) */}

      {/* Staff Salary Advances Section */}
      <View style={styles.breakdownBox}>
        <TouchableOpacity
          style={styles.breakdownHeaderBtn}
          onPress={() => setShowStaffBreakdown(!showStaffBreakdown)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Icon name="people" size={20} color="#B45309" style={{ marginRight: 8 }} />
            <Text style={styles.breakdownHeaderTitle}>
              Staff Salary Advances Details ({calculations.allSalaryAdvancesList.length})
            </Text>
          </View>
          <Text style={styles.breakdownHeaderTotal}>
            ₹{calculations.totalStaffAdvanceAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Icon
            name={showStaffBreakdown ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#64748B"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        {showStaffBreakdown && (
          <View style={styles.breakdownContent}>
            {calculations.allSalaryAdvancesList.length === 0 ? (
              <Text style={styles.emptyBreakdownText}>
                No staff salary advances taken in {formatMonthLabel(selectedMonth)}.
              </Text>
            ) : (
              calculations.allSalaryAdvancesList.map((adv) => (
                <View key={adv.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemRowTitle}>{adv.recipient}</Text>
                    <Text style={styles.itemRowSub}>
                      {adv.dateStr} • {adv.notes} {adv.machineName ? `(${adv.machineName})` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.itemRowAmount, { color: '#B45309' }]}>
                    ₹{adv.amount.toFixed(0)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>

      {/* Operating Expenses Section */}
      <View style={[styles.breakdownBox, { marginTop: 12 }]}>
        <TouchableOpacity
          style={styles.breakdownHeaderBtn}
          onPress={() => setShowExpenseBreakdown(!showExpenseBreakdown)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Icon name="receipt" size={20} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={styles.breakdownHeaderTitle}>
              Operating Expenses Details ({calculations.shiftOperatingExpenses.length})
            </Text>
          </View>
          <Text style={[styles.breakdownHeaderTotal, { color: '#DC2626' }]}>
            ₹{calculations.totalOperatingExpenseAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Icon
            name={showExpenseBreakdown ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#64748B"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        {showExpenseBreakdown && (
          <View style={styles.breakdownContent}>
            {calculations.shiftOperatingExpenses.length === 0 ? (
              <Text style={styles.emptyBreakdownText}>
                No operating expenses logged in {formatMonthLabel(selectedMonth)}.
              </Text>
            ) : (
              calculations.shiftOperatingExpenses.map((exp) => (
                <View key={exp.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemRowTitle}>{exp.reason}</Text>
                    <Text style={styles.itemRowSub}>
                      {exp.dateStr} • By: {exp.staffName} ({exp.machineName})
                    </Text>
                  </View>
                  <Text style={[styles.itemRowAmount, { color: '#DC2626' }]}>
                    ₹{exp.amount.toFixed(0)}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 14
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#003C8F'
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16
  },
  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  monthNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF'
  },
  monthNavBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F'
  },
  monthCurrentCenter: {
    alignItems: 'center'
  },
  monthCurrentText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A'
  },
  currentBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 2
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D'
  },
  monthPillsScroll: {
    marginTop: 10
  },
  monthChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  monthChipActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  monthChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  monthChipTextActive: {
    color: '#FFFFFF'
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 6
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 16
  },
  rateInputsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  rateInputBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    marginHorizontal: 3
  },
  rateInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5
  },
  rateInputLabel: {
    fontSize: 11,
    fontWeight: '800'
  },
  inputPrefixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    height: 42
  },
  inputRupee: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 4
  },
  rateTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 0
  },
  inputSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginLeft: 4
  },
  saveRateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4
  },
  saveRateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  heroProfitCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    borderWidth: 1.5
  },
  heroProfitPositive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC'
  },
  heroProfitNegative: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  heroBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    elevation: 1
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#15803D'
  },
  heroMonthTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569'
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  heroAmountPositive: {
    color: '#15803D'
  },
  heroAmountNegative: {
    color: '#DC2626'
  },
  heroEquationText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 6,
    fontWeight: '600'
  },
  summaryGrid: {
    marginBottom: 10
  },
  gridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  gridCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  gridCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B'
  },
  gridCardValue: {
    fontSize: 16,
    fontWeight: '900'
  },
  gridCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4
  },
  breakdownBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  breakdownHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8FAFC'
  },
  breakdownHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155'
  },
  breakdownHeaderTotal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#B45309'
  },
  breakdownContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF'
  },
  emptyBreakdownText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 12,
    fontStyle: 'italic'
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  itemRowTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A'
  },
  itemRowSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2
  },
  itemRowAmount: {
    fontSize: 13,
    fontWeight: '900'
  }
});
