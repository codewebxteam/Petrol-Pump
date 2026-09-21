import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal
} from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  writeBatch, 
  addDoc, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../../services/firebase';

const DENOMINATIONS = [500, 200, 100, 50, 20, 10];

export default function CashManagementScreen() {
  const [activeTab, setActiveTab] = useState('deposit'); // 'deposit' | 'history'
  
  // Firestore data
  const [salesReports, setSalesReports] = useState([]);
  const [bankDeposits, setBankDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Selected dates for bank deposit
  const [selectedDates, setSelectedDates] = useState([]);

  // Denomination counts state: { 500: 0, 200: 0, ... }
  const [counts, setCounts] = useState({
    500: '',
    200: '',
    100: '',
    50: '',
    20: '',
    10: ''
  });

  // Optional carrier/depositor name
  const [carrierName, setCarrierName] = useState('');

  // Expanded slip in history
  const [expandedDepositId, setExpandedDepositId] = useState(null);

  // Toggle for physical note denomination counter (closed by default for a clean screen)
  const [showNoteCounter, setShowNoteCounter] = useState(false);

  // Pagination for Deposit History (10 items per page)
  const DEPOSITS_PER_PAGE = 10;
  const [historyPage, setHistoryPage] = useState(1);

  // 1. Listen to Sales Reports for Cash
  useEffect(() => {
    const qSales = collection(db, 'sales_reports');
    const unsubSales = onSnapshot(
      qSales,
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setSalesReports(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching sales reports for cash:', error);
        setLoading(false);
      }
    );

    return unsubSales;
  }, []);

  // 2. Listen to Bank Deposits History
  useEffect(() => {
    const qDeposits = collection(db, 'bank_deposits');
    const unsubDeposits = onSnapshot(
      qDeposits,
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        // Sort descending by timestamp
        list.sort((a, b) => {
          const tA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (new Date(a.timestamp || 0)).getTime();
          const tB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : (new Date(b.timestamp || 0)).getTime();
          return tB - tA;
        });
        setBankDeposits(list);
      },
      (error) => {
        console.error('Error fetching bank deposits:', error);
      }
    );

    return unsubDeposits;
  }, []);

  // 3. Group undeposited cash reports by date
  const { dateGroups, totalUndepositedCash } = useMemo(() => {
    // Filter reports that have cash and haven't been deposited yet
    const undeposited = salesReports.filter((r) => {
      const cash = Number(r.cashAmount) || 0;
      return cash > 0 && !r.isBankDeposited;
    });

    const groups = {};
    let totalCash = 0;

    undeposited.forEach((r) => {
      const cash = Number(r.cashAmount) || 0;
      totalCash += cash;

      // Determine date key
      let dObj = null;
      if (r.timestamp?.toDate) {
        dObj = r.timestamp.toDate();
      } else if (r.timestamp) {
        dObj = new Date(r.timestamp);
      } else if (r.entryDate) {
        dObj = new Date(r.entryDate);
      } else {
        dObj = new Date();
      }

      const dateKey = dObj.toISOString().split('T')[0]; // YYYY-MM-DD
      const displayDate = dObj.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          displayDate,
          totalCash: 0,
          reportIds: [],
          reports: []
        };
      }

      groups[dateKey].totalCash += cash;
      groups[dateKey].reportIds.push(r.id);
      groups[dateKey].reports.push(r);
    });

    // Sort dates ascending (oldest first)
    const sortedKeys = Object.keys(groups).sort();
    const sortedGroups = sortedKeys.map((k) => groups[k]);

    return {
      dateGroups: sortedGroups,
      totalUndepositedCash: totalCash
    };
  }, [salesReports]);

  // Auto-select all pending dates initially or when dates change
  useEffect(() => {
    if (dateGroups.length > 0 && selectedDates.length === 0) {
      setSelectedDates(dateGroups.map((g) => g.dateKey));
    }
  }, [dateGroups]);

  // Target amount to deposit based on selected dates
  const targetDepositAmount = useMemo(() => {
    return dateGroups
      .filter((g) => selectedDates.includes(g.dateKey))
      .reduce((sum, g) => sum + g.totalCash, 0);
  }, [dateGroups, selectedDates]);

  // Selected report IDs to mark as deposited
  const targetReportIds = useMemo(() => {
    const ids = [];
    dateGroups
      .filter((g) => selectedDates.includes(g.dateKey))
      .forEach((g) => ids.push(...g.reportIds));
    return ids;
  }, [dateGroups, selectedDates]);

  // Calculate total counted cash from note denominations
  const { totalCounted, denominationBreakdown } = useMemo(() => {
    let sum = 0;
    const breakdown = {};

    DENOMINATIONS.forEach((denom) => {
      const count = parseInt(counts[denom], 10) || 0;
      const subtotal = count * denom;
      sum += subtotal;
      breakdown[denom] = {
        denom,
        count,
        subtotal
      };
    });

    return { totalCounted: sum, denominationBreakdown: breakdown };
  }, [counts]);

  // Difference between counted cash and target deposit amount
  const difference = totalCounted - targetDepositAmount;
  const isExactMatch = targetDepositAmount > 0 && difference === 0;
  // Settable if notes are counted (> 0) and either excess cash (difference >= 0) or shortage is within ₹9 (difference >= -9)
  const isMatched = targetDepositAmount > 0 && totalCounted > 0 && difference >= -9;

  // Pagination calculations for Deposit History (10 items per page)
  const totalHistoryPages = Math.max(1, Math.ceil(bankDeposits.length / DEPOSITS_PER_PAGE));
  const currentHistoryPage = Math.min(Math.max(1, historyPage), totalHistoryPages);

  const paginatedDeposits = useMemo(() => {
    const startIndex = (currentHistoryPage - 1) * DEPOSITS_PER_PAGE;
    return bankDeposits.slice(startIndex, startIndex + DEPOSITS_PER_PAGE);
  }, [bankDeposits, currentHistoryPage]);

  // Handler to toggle date selection
  const toggleDateSelection = (dateKey) => {
    if (selectedDates.includes(dateKey)) {
      setSelectedDates(selectedDates.filter((d) => d !== dateKey));
    } else {
      setSelectedDates([...selectedDates, dateKey]);
    }
  };

  const selectAllDates = () => {
    if (selectedDates.length === dateGroups.length) {
      setSelectedDates([]);
    } else {
      setSelectedDates(dateGroups.map((g) => g.dateKey));
    }
  };

  // Handler for note count changes
  const handleCountChange = (denom, val) => {
    // Only allow positive integers
    const cleanVal = val.replace(/[^0-9]/g, '');
    setCounts((prev) => ({ ...prev, [denom]: cleanVal }));
  };


  const clearCounts = () => {
    setCounts({
      500: '',
      200: '',
      100: '',
      50: '',
      20: '',
      10: ''
    });
  };

  // Settle to Bank Action
  const handleSettleToBank = () => {
    if (targetDepositAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'No Cash Selected',
        text2: 'Please select at least one date with cash to deposit.'
      });
      return;
    }

    if (!isMatched) {
      Alert.alert(
        'Note Count Required',
        `Physical notes must be counted and within ₹9 of target amount (₹${targetDepositAmount.toLocaleString('en-IN')}) or excess to settle.\n\nCurrent Counted: ₹${totalCounted.toLocaleString('en-IN')}${totalCounted > 0 ? ` (Shortage: ₹${Math.abs(difference).toLocaleString('en-IN')})` : ''}`
      );
      if (!showNoteCounter) setShowNoteCounter(true);
      return;
    }

    const differenceNote = difference > 0
      ? `\n(Includes +₹${difference.toLocaleString('en-IN')} extra cash)`
      : difference < 0
        ? `\n(Includes -₹${Math.abs(difference)} change adjustment)`
        : '';

    Alert.alert(
      'Confirm Bank Deposit',
      `Are you sure you want to settle and deposit ₹${totalCounted.toLocaleString('en-IN')} to the bank?${differenceNote}\n\nThis will reset the in-hand cash for the selected ${selectedDates.length} date(s) to ₹0.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Settle to Bank',
          style: 'default',
          onPress: performBankDeposit
        }
      ]
    );
  };

  const performBankDeposit = async () => {
    setSubmitting(true);
    try {
      // 1. Create a bank_deposits document
      const depositDocRef = await addDoc(collection(db, 'bank_deposits'), {
        amount: totalCounted,
        targetAmount: targetDepositAmount,
        difference: difference,
        datesCovered: selectedDates,
        datesFormatted: dateGroups
          .filter((g) => selectedDates.includes(g.dateKey))
          .map((g) => g.displayDate),
        denominations: counts,
        depositedBy: carrierName.trim() || 'Not Specified',
        salesReportIds: targetReportIds,
        timestamp: new Date(),
        status: 'SETTLED'
      });

      // 2. Batch update sales reports
      const batch = writeBatch(db);
      targetReportIds.forEach((repId) => {
        const repRef = doc(db, 'sales_reports', repId);
        batch.update(repRef, {
          isBankDeposited: true,
          bankDepositId: depositDocRef.id,
          bankDepositedAt: new Date()
        });
      });

      await batch.commit();

      Toast.show({
        type: 'success',
        text1: 'Settled to Bank!',
        text2: `₹${totalCounted.toLocaleString('en-IN')} deposited successfully.`
      });

      // Reset state
      clearCounts();
      setCarrierName('');
      setSelectedDates([]);
      setActiveTab('history');
    } catch (error) {
      console.error('Error depositing to bank:', error);
      Alert.alert('Error', error.message || 'Failed to settle cash to bank.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header Mode Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'deposit' && styles.activeTabBtn]}
          onPress={() => setActiveTab('deposit')}
        >
          <Icon 
            name="cash-outline" 
            size={18} 
            color={activeTab === 'deposit' ? '#003C8F' : '#64748B'} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabBtnText, activeTab === 'deposit' && styles.activeTabBtnText]}>
            Deposit Cash
          </Text>
          {dateGroups.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{dateGroups.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.activeTabBtn]}
          onPress={() => setActiveTab('history')}
        >
          <Icon 
            name="time-outline" 
            size={18} 
            color={activeTab === 'history' ? '#003C8F' : '#64748B'} 
            style={{ marginRight: 6 }} 
          />
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.activeTabBtnText]}>
            Deposit History
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#003C8F" />
          <Text style={styles.loadingText}>Loading cash records...</Text>
        </View>
      ) : activeTab === 'deposit' ? (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 35 }}>
          {/* 1. Cash In Hand Overview Hero Banner */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIconWrap}>
                <Icon name="wallet" size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.heroSubtitle}>Undeposited Cash in Hand</Text>
                <Text style={styles.heroAmount}>
                  ₹{totalUndepositedCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: totalUndepositedCash > 0 ? '#FEF3C7' : '#DCFCE7' }]}>
                <Text style={[styles.statusBadgeText, { color: totalUndepositedCash > 0 ? '#92400E' : '#166534' }]}>
                  {totalUndepositedCash > 0 ? `${dateGroups.length} Day(s) Pending` : 'All Deposited'}
                </Text>
              </View>
            </View>

            {totalUndepositedCash > 0 && (
              <View style={styles.heroInfoStrip}>
                <Icon name="information-circle-outline" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                <Text style={styles.heroInfoText}>
                  Accumulated cash from sales reports waiting to be deposited into bank.
                </Text>
              </View>
            )}
          </View>

          {/* 2. Date-wise Cash Accumulation List */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="calendar-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Date-wise Cash Breakdown</Text>
              </View>
              {dateGroups.length > 1 && (
                <TouchableOpacity onPress={selectAllDates} style={styles.selectAllBtn}>
                  <Text style={styles.selectAllText}>
                    {selectedDates.length === dateGroups.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {dateGroups.length === 0 ? (
              <View style={styles.emptyCard}>
                <Icon name="checkmark-done-circle" size={44} color="#16A34A" />
                <Text style={styles.emptyTitle}>No Cash Pending Deposit</Text>
                <Text style={styles.emptySub}>
                  All previous cash collections have been settled and deposited to the bank.
                </Text>
              </View>
            ) : (
              dateGroups.map((group) => {
                const isSelected = selectedDates.includes(group.dateKey);
                return (
                  <TouchableOpacity
                    key={group.dateKey}
                    style={[styles.dateRow, isSelected && styles.dateRowSelected]}
                    onPress={() => toggleDateSelection(group.dateKey)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.checkboxWrap}>
                      <Icon 
                        name={isSelected ? 'checkbox' : 'square-outline'} 
                        size={22} 
                        color={isSelected ? '#003C8F' : '#94A3B8'} 
                      />
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.dateTitle}>{group.displayDate}</Text>
                      <Text style={styles.dateSub}>
                        {group.reports.length} report(s) • Pending Bank Deposit
                      </Text>
                    </View>

                    <Text style={styles.dateAmount}>
                      ₹{group.totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}

            {dateGroups.length > 0 && (
              <View style={styles.targetTotalRow}>
                <Text style={styles.targetTotalLabel}>Target Cash to Deposit:</Text>
                <Text style={styles.targetTotalVal}>
                  ₹{targetDepositAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          {/* 3. Denomination Note Counter (₹500, ₹200, ₹100, ₹50, ₹20, ₹10) */}
          {/* 3. Denomination Note Counter Toggle & Section */}
          {targetDepositAmount > 0 && (
            <View>
              {/* Clean Toggle Card to Open / Close Note Counter */}
              <TouchableOpacity
                style={[
                  styles.toggleCounterCard,
                  showNoteCounter && styles.toggleCounterCardActive
                ]}
                onPress={() => setShowNoteCounter(!showNoteCounter)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[styles.toggleCounterIconWrap, showNoteCounter && styles.toggleCounterIconWrapActive]}>
                    <Icon 
                      name={showNoteCounter ? "calculator" : "calculator-outline"} 
                      size={20} 
                      color={showNoteCounter ? "#fff" : "#003C8F"} 
                    />
                  </View>
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.toggleCounterTitle}>
                      {showNoteCounter ? 'Physical Note Counter (Open)' : 'Count Physical Notes'}
                    </Text>
                    <Text style={styles.toggleCounterSub}>
                      {showNoteCounter 
                        ? 'Counting active • Tap to close' 
                        : (totalCounted > 0 
                            ? `Counted: ₹${totalCounted.toLocaleString('en-IN')} ${
                                isExactMatch 
                                  ? '(Matched ✓)' 
                                  : isMatched 
                                    ? (difference > 0 ? `(+₹${difference.toLocaleString('en-IN')} Extra ✓)` : `(-₹${Math.abs(difference)} Change ✓)`)
                                    : `(Shortage: -₹${Math.abs(difference).toLocaleString('en-IN')})`
                              }`
                            : 'Mandatory: Tap here to count notes before settling')}
                    </Text>
                  </View>
                </View>
                <Icon 
                  name={showNoteCounter ? 'chevron-up' : 'chevron-down'} 
                  size={20} 
                  color={showNoteCounter ? '#003C8F' : '#64748B'} 
                />
              </TouchableOpacity>

              {/* Note Counter (Only opens when user wants to count) */}
              {showNoteCounter && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon name="cash-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
                      <Text style={styles.sectionTitle}>Physical Note Counter</Text>
                    </View>
                    <TouchableOpacity onPress={clearCounts}>
                      <Text style={styles.clearBtnText}>Clear All</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.counterSubtitle}>
                    Enter the count of each currency note available for deposit:
                  </Text>

                  {/* Denomination Rows */}
                  {DENOMINATIONS.map((denom) => {
                    const item = denominationBreakdown[denom];
                    return (
                      <View key={denom} style={styles.denomRow}>
                        {/* Currency Note Badge */}
                        <View style={[styles.noteBadge, getNoteStyle(denom)]}>
                          <Text style={styles.noteBadgeText}>₹{denom}</Text>
                        </View>

                        {/* Multiplier Label */}
                        <Text style={styles.multiplySign}>×</Text>

                        {/* Input for Count (Clean without +1 +5) */}
                        <TextInput
                          style={styles.denomInput}
                          keyboardType="numeric"
                          placeholder="0"
                          value={counts[denom]}
                          onChangeText={(val) => handleCountChange(denom, val)}
                        />

                        {/* Equals Sign */}
                        <Text style={styles.equalsSign}>=</Text>

                        {/* Subtotal */}
                        <View style={styles.subtotalWrap}>
                          <Text style={styles.subtotalText}>
                            ₹{item.subtotal.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      </View>
                    );
                  })}

                  {/* Total Counted Strip */}
                  <View style={styles.totalCountedStrip}>
                    <Text style={styles.totalCountedLabel}>Total Counted Cash:</Text>
                    <Text style={styles.totalCountedVal}>
                      ₹{totalCounted.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  {/* Match Verification Status Banner */}
                  {isMatched ? (
                    <View style={[
                      styles.matchBanner, 
                      difference !== 0 && { 
                        backgroundColor: difference > 0 ? '#EFF6FF' : '#F0FDF4', 
                        borderColor: difference > 0 ? '#93C5FD' : '#86EFAC' 
                      }
                    ]}>
                      <Icon 
                        name={difference > 0 ? "add-circle" : "checkmark-circle"} 
                        size={24} 
                        color={difference > 0 ? "#2563EB" : "#15803D"} 
                        style={{ marginRight: 8 }} 
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.matchBannerTitle, difference > 0 && { color: '#1E40AF' }]}>
                          {isExactMatch 
                            ? '✓ Amount Matched Exactly!' 
                            : difference > 0 
                              ? `✓ Ready to Settle (+₹${difference.toLocaleString('en-IN')} Extra Cash)` 
                              : `✓ Ready to Settle (-₹${Math.abs(difference)} Change Accepted)`}
                        </Text>
                        <Text style={[styles.matchBannerSub, difference > 0 && { color: '#1D4ED8' }]}>
                          {isExactMatch
                            ? `Total notes count matches the selected cash of ₹${targetDepositAmount.toLocaleString('en-IN')}.`
                            : difference > 0
                              ? `Counted: ₹${totalCounted.toLocaleString('en-IN')} (Target: ₹${targetDepositAmount.toLocaleString('en-IN')}). Extra cash of ₹${difference.toLocaleString('en-IN')} will be deposited into bank.`
                              : `Counted: ₹${totalCounted.toLocaleString('en-IN')} (Target: ₹${targetDepositAmount.toLocaleString('en-IN')}). Shortage of ₹${Math.abs(difference)} is accepted (within ₹10 note limit).`}
                        </Text>
                      </View>
                    </View>
                  ) : difference !== 0 ? (
                    <View style={[styles.mismatchBanner, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                      <Icon 
                        name="alert-circle" 
                        size={24} 
                        color="#DC2626" 
                        style={{ marginRight: 8 }} 
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.mismatchTitle, { color: '#991B1B' }]}>
                          Shortage: ₹{Math.abs(difference).toLocaleString('en-IN')} remaining
                        </Text>
                        <Text style={[styles.mismatchSub, { color: '#B91C1C' }]}>
                          Required: ₹{targetDepositAmount.toLocaleString('en-IN')} • Counted: ₹{totalCounted.toLocaleString('en-IN')} (Must be within ₹9 change or excess)
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}

              {/* Depositor / Carrier Name & Settle to Bank Action */}
              <View style={[styles.sectionCard, { marginTop: showNoteCounter ? 0 : 8 }]}>
                <View style={styles.carrierInputWrap}>
                  <Text style={styles.carrierLabel}>
                    Carried / Deposited By (Optional):
                  </Text>
                  <TextInput
                    style={styles.carrierInput}
                    placeholder="e.g. Rahul Sharma, Ramesh (Manager)"
                    value={carrierName}
                    onChangeText={setCarrierName}
                  />
                </View>

                {/* Settle to Bank Button (Active only when physical notes are counted & matched) */}
                <TouchableOpacity
                  style={[
                    styles.settleBtn,
                    isMatched ? { backgroundColor: '#15803D' } : { backgroundColor: '#94A3B8' }
                  ]}
                  onPress={handleSettleToBank}
                  disabled={!isMatched || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon
                        name={isMatched ? "checkmark-done" : "lock-closed-outline"}
                        size={20}
                        color="#fff"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.settleBtnText}>
                        {isMatched
                          ? `Settle & Deposit ₹${totalCounted.toLocaleString('en-IN')} to Bank`
                          : (showNoteCounter ? 'Count Notes to Settle' : 'Count Notes to Enable Settle')}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {!isMatched && (
                  <TouchableOpacity
                    onPress={() => setShowNoteCounter(true)}
                    activeOpacity={0.7}
                    style={{ marginTop: 10, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>
                      ⚠️ Note count required. Must be within ₹9 of target or excess to settle.
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      ) : (
        /* TAB 2: Deposit History (10 data per page) */
        <FlatList
          data={paginatedDeposits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            bankDeposits.length > 0 ? (
              <View style={styles.historySummaryHeader}>
                <Text style={styles.historySummaryText}>
                  Showing <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>{(currentHistoryPage - 1) * DEPOSITS_PER_PAGE + 1} - {Math.min(currentHistoryPage * DEPOSITS_PER_PAGE, bankDeposits.length)}</Text> of <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>{bankDeposits.length}</Text> deposits (10 per page)
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            totalHistoryPages > 1 ? (
              <View style={styles.paginationContainer}>
                <TouchableOpacity
                  style={[
                    styles.pageNavBtn,
                    currentHistoryPage === 1 && styles.pageNavBtnDisabled
                  ]}
                  onPress={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={currentHistoryPage === 1}
                  activeOpacity={0.7}
                >
                  <Icon
                    name="chevron-back"
                    size={18}
                    color={currentHistoryPage === 1 ? '#94A3B8' : '#003C8F'}
                  />
                  <Text
                    style={[
                      styles.pageNavBtnText,
                      currentHistoryPage === 1 && styles.pageNavBtnTextDisabled
                    ]}
                  >
                    Previous
                  </Text>
                </TouchableOpacity>

                <View style={styles.pageIndicatorWrap}>
                  <Text style={styles.pageIndicatorText}>
                    Page <Text style={{ fontWeight: 'bold', color: '#003C8F' }}>{currentHistoryPage}</Text> of {totalHistoryPages}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.pageNavBtn,
                    currentHistoryPage === totalHistoryPages && styles.pageNavBtnDisabled
                  ]}
                  onPress={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                  disabled={currentHistoryPage === totalHistoryPages}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.pageNavBtnText,
                      currentHistoryPage === totalHistoryPages && styles.pageNavBtnTextDisabled
                    ]}
                  >
                    Next
                  </Text>
                  <Icon
                    name="chevron-forward"
                    size={18}
                    color={currentHistoryPage === totalHistoryPages ? '#94A3B8' : '#003C8F'}
                  />
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Icon name="document-text-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Bank Deposits Yet</Text>
              <Text style={styles.emptySub}>
                When cash is deposited into the bank, records will appear here with full denomination slips.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isExpanded = expandedDepositId === item.id;
            const dateStr = item.timestamp?.toDate
              ? item.timestamp.toDate().toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : 'Recent';

            return (
              <View style={styles.historyCard}>
                <TouchableOpacity
                  style={styles.historyHeader}
                  onPress={() => setExpandedDepositId(isExpanded ? null : item.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.historyIconWrap}>
                    <Icon name="business" size={20} color="#003C8F" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.historyDate}>{dateStr}</Text>
                    <Text style={styles.historyDepositor}>
                      Carrier: <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>{item.depositedBy || 'Not Specified'}</Text>
                    </Text>
                    {item.datesFormatted && (
                      <Text style={styles.historyDatesCovered}>
                        Dates: {item.datesFormatted.join(', ')}
                      </Text>
                    )}
                    {item.difference ? (
                      <Text style={{ fontSize: 11, color: item.difference > 0 ? '#1D4ED8' : '#15803D', marginTop: 2, fontWeight: '500' }}>
                        {item.difference > 0 ? `+₹${item.difference} Extra Cash` : `-₹${Math.abs(item.difference)} Change Adjusted`} (Target: ₹{parseFloat(item.targetAmount || 0).toLocaleString('en-IN')})
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.historyAmount}>
                      ₹{parseFloat(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <View style={styles.settledBadge}>
                      <Text style={styles.settledBadgeText}>✓ Settled</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Expandable Denomination Breakdown Slip */}
                {isExpanded && (
                  <View style={styles.historySlip}>
                    <Text style={styles.historySlipTitle}>Denomination Slip:</Text>
                    <View style={styles.slipGrid}>
                      {DENOMINATIONS.map((d) => {
                        const count = parseInt(item.denominations?.[d], 10) || 0;
                        if (count === 0) return null;
                        return (
                          <View key={d} style={styles.slipRow}>
                            <Text style={styles.slipDenom}>₹{d} × {count}</Text>
                            <Text style={styles.slipSubtotal}>₹{(d * count).toLocaleString('en-IN')}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

// Helper to color-code currency note badges
function getNoteStyle(denom) {
  switch (denom) {
    case 500:
      return { backgroundColor: '#6B7280' }; // Stone grey
    case 200:
      return { backgroundColor: '#EA580C' }; // Bright orange
    case 100:
      return { backgroundColor: '#7C3AED' }; // Lavender purple
    case 50:
      return { backgroundColor: '#0284C7' }; // Cyan blue
    case 20:
      return { backgroundColor: '#D97706' }; // Yellow gold
    case 10:
      return { backgroundColor: '#78350F' }; // Chocolate brown
    default:
      return { backgroundColor: '#003C8F' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa', padding: 15 },

  // Top Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 15
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9
  },
  activeTabBtn: {
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B'
  },
  activeTabBtnText: {
    color: '#003C8F'
  },
  tabBadge: {
    backgroundColor: '#003C8F',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold'
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40
  },
  loadingText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 14
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#003C8F',
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600'
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginTop: 2
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  heroInfoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 10,
    borderRadius: 10,
    marginTop: 12
  },
  heroInfoText: {
    fontSize: 12,
    color: '#003C8F',
    flex: 1,
    fontWeight: '500'
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E293B'
  },
  selectAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 6
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003C8F'
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626'
  },
  counterSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 14
  },

  // Date Rows
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0'
  },
  dateRowSelected: {
    borderColor: '#003C8F',
    backgroundColor: '#EFF6FF'
  },
  checkboxWrap: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  dateTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  dateSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  dateAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#003C8F'
  },

  targetTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0'
  },
  targetTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155'
  },
  targetTotalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#003C8F'
  },

  // Denomination Rows
  denomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  noteBadge: {
    width: 60,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  noteBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900'
  },
  multiplySign: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748B',
    marginHorizontal: 8
  },
  denomInput: {
    width: 85,
    height: 40,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  toggleCounterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  toggleCounterCardActive: {
    borderColor: '#003C8F',
    backgroundColor: '#F0F7FF'
  },
  toggleCounterIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  toggleCounterIconWrapActive: {
    backgroundColor: '#003C8F'
  },
  toggleCounterTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  toggleCounterSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  equalsSign: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748B',
    marginHorizontal: 8
  },
  subtotalWrap: {
    flex: 1,
    alignItems: 'flex-end'
  },
  subtotalText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E293B'
  },

  // Total Counted Strip
  totalCountedStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 14
  },
  totalCountedLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155'
  },
  totalCountedVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E293B'
  },

  // Match / Mismatch Banners
  matchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14
  },
  matchBannerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#15803D'
  },
  matchBannerSub: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2
  },

  mismatchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14
  },
  mismatchTitle: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  mismatchSub: {
    fontSize: 12,
    marginTop: 2
  },

  // Carrier input
  carrierInputWrap: {
    marginBottom: 14
  },
  carrierLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 6
  },
  carrierInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B'
  },

  // Settle Button
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2
  },
  settleBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5
  },

  // Empty Card
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 10
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18
  },

  // History Card
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  historyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  historyDate: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  historyDepositor: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  historyDatesCovered: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: '#15803D'
  },
  settledBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4
  },
  settledBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#166534'
  },

  historySlip: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10
  },
  historySlipTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 6
  },
  slipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  slipRow: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingRight: 8
  },
  slipDenom: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500'
  },
  slipSubtotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B'
  },

  // Deposit History Pagination Styles
  historySummaryHeader: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 6
  },
  historySummaryText: {
    fontSize: 12,
    color: '#64748B'
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1
  },
  pageNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  pageNavBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0'
  },
  pageNavBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#003C8F',
    marginHorizontal: 2
  },
  pageNavBtnTextDisabled: {
    color: '#94A3B8'
  },
  pageIndicatorWrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  pageIndicatorText: {
    fontSize: 13,
    color: '#475569'
  }
});
