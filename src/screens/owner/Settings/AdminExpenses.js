import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { 
  addAdminExpense, 
  deleteAdminExpense, 
  getMonthKey, 
  getLocalDateString,
  formatMonthLabel 
} from '../../../services/dbServices';

const CATEGORIES = [
  {
    id: 'Personal Bank',
    label: 'Personal Bank',
    hindiLabel: 'पर्सनल बैंक में भेजा',
    icon: 'business-outline',
    color: '#4F46E5', // Indigo
    bgColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    example: 'उदा. 50,000 to Personal Bank'
  },
  {
    id: 'IOCL',
    label: 'IOCL',
    hindiLabel: 'IOCL में ट्रांसफर (इंडेन्ट / डीडी)',
    icon: 'flame-outline',
    color: '#003C8F', // IOCL Navy Blue
    bgColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    example: 'उदा. 1,00,000 to IOCL'
  },
  {
    id: 'Extra Expenses',
    label: 'Extra Expenses',
    hindiLabel: 'अतिरिक्त पंप खर्च / मेंटेनेंस',
    icon: 'receipt-outline',
    color: '#EA580C', // Orange / Amber
    bgColor: '#FFF7ED',
    borderColor: '#FED7AA',
    example: 'उदा. 1,000 to Extra Expenses'
  }
];

const PAYMENT_MODES = ['NetBanking', 'UPI', 'Cash', 'Cheque', 'RTGS / NEFT'];
const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000, 100000];

export default function AdminExpenses() {
  const currentMonth = useMemo(() => getMonthKey(), []);
  
  // Real-time Firestore Expenses List
  const [expensesList, setExpensesList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  // Form State
  const [selectedCategory, setSelectedCategory] = useState('Personal Bank');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState('NetBanking');
  const [dateStr, setDateStr] = useState(getLocalDateString());
  const [saving, setSaving] = useState(false);

  // Filter State
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');

  // 1. Subscribe to admin_expenses in real time
  useEffect(() => {
    const qExpenses = query(collection(db, 'admin_expenses'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(
      qExpenses,
      (snapshot) => {
        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        // Sort descending by date, then by timestamp/createdAt
        list.sort((a, b) => {
          const dateComp = (b.date || '').localeCompare(a.date || '');
          if (dateComp !== 0) return dateComp;
          const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.createdAt || 0).getTime();
          const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        });
        setExpensesList(list);
        setLoadingList(false);
      },
      (error) => {
        console.warn('Firestore admin_expenses error:', error.message);
        setLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Distinct Months available in records + current and previous
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    monthSet.add(currentMonth);

    // Compute previous month
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const prevMonth = getMonthKey(d);
    monthSet.add(prevMonth);

    expensesList.forEach((item) => {
      if (item.monthKey) {
        monthSet.add(item.monthKey);
      } else if (item.date) {
        monthSet.add(item.date.slice(0, 7));
      }
    });

    return Array.from(monthSet).sort().reverse();
  }, [expensesList, currentMonth]);

  // Filtered Expenses by selected month & category
  const filteredExpenses = useMemo(() => {
    return expensesList.filter((item) => {
      const itemMonth = item.monthKey || (item.date ? item.date.slice(0, 7) : '');
      const matchMonth = (selectedMonth === 'ALL') || (itemMonth === selectedMonth);
      const matchCategory = (activeCategoryFilter === 'ALL') || (item.category === activeCategoryFilter);
      return matchMonth && matchCategory;
    });
  }, [expensesList, selectedMonth, activeCategoryFilter]);

  // Monthly Metrics Calculation
  const monthlyMetrics = useMemo(() => {
    const monthItems = expensesList.filter((item) => {
      const itemMonth = item.monthKey || (item.date ? item.date.slice(0, 7) : '');
      return (selectedMonth === 'ALL') || (itemMonth === selectedMonth);
    });

    let total = 0;
    let personalBank = 0;
    let iocl = 0;
    let extra = 0;

    monthItems.forEach((item) => {
      const amt = Number(item.amount) || 0;
      total += amt;
      if (item.category === 'Personal Bank') {
        personalBank += amt;
      } else if (item.category === 'IOCL') {
        iocl += amt;
      } else if (item.category === 'Extra Expenses') {
        extra += amt;
      }
    });

    return {
      total,
      personalBank,
      iocl,
      extra,
      count: monthItems.length
    };
  }, [expensesList, selectedMonth]);

  // Handle Save Expense
  const handleSaveExpense = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: 'त्रुटि (Error)',
        text2: 'कृपया वैध राशि (Amount > 0) दर्ज करें।'
      });
      return;
    }

    if (!dateStr || !dateStr.includes('-')) {
      Toast.show({
        type: 'error',
        text1: 'त्रुटि',
        text2: 'कृपया सही दिनांक (YYYY-MM-DD) दर्ज करें।'
      });
      return;
    }

    setSaving(true);
    try {
      await addAdminExpense({
        category: selectedCategory,
        amount: numAmount,
        dateStr,
        notes,
        paymentMode
      });

      Toast.show({
        type: 'success',
        text1: 'खर्च सुरक्षित हुआ ✅',
        text2: `₹${numAmount.toLocaleString('en-IN')} (${selectedCategory}) दर्ज कर दिया गया है।`
      });

      // Reset form fields
      setAmount('');
      setNotes('');
      // Auto-set the viewing month to the month of the added expense
      const addedMonth = dateStr.slice(0, 7);
      setSelectedMonth(addedMonth);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'त्रुटि',
        text2: err.message || 'खर्च सेव करने में विफल।'
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Expense
  const handleDeleteExpense = (expense) => {
    Alert.alert(
      'खर्च हटाएं? (Delete Expense)',
      `क्या आप ₹${Number(expense.amount).toLocaleString('en-IN')} (${expense.category}) का यह रिकॉर्ड हटाना चाहते हैं?`,
      [
        { text: 'रद्द करें (Cancel)', style: 'cancel' },
        {
          text: 'हाँ, हटाएं (Delete)',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAdminExpense(expense.id);
              Toast.show({
                type: 'info',
                text1: 'हटा दिया गया',
                text2: 'खर्च का रिकॉर्ड हटा दिया गया है।'
              });
            } catch (err) {
              Toast.show({
                type: 'error',
                text1: 'Error',
                text2: err.message
              });
            }
          }
        }
      ]
    );
  };

  // Format date helper
  const formatDateDisplay = (dateString, timestamp) => {
    if (!dateString) return 'Recent';
    try {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return d.toLocaleDateString('hi-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

  const activeCategoryMeta = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* 1. Header Banner */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconWrapper}>
            <Icon name="cash" size={26} color="#003C8F" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Add Expenses (खर्च एवं निकासी)</Text>
            <Text style={styles.headerSub}>
              Personal Bank, IOCL Indent, और Extra Expenses का पूरा हिसाब
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Add Expense Form Card */}
      <View style={styles.formCard}>
        <View style={styles.formCardHeader}>
          <Icon name="add-circle" size={18} color="#003C8F" style={{ marginRight: 6 }} />
          <Text style={styles.formCardTitle}>नया खर्च / ट्रांसफर दर्ज करें (New Outflow)</Text>
        </View>

        {/* Step 1: Category Selector (3 Requested Options) */}
        <Text style={styles.fieldLabel}>1. खर्च की श्रेणी चुनें (Select Category) *</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryCard,
                  isSelected && {
                    borderColor: cat.color,
                    backgroundColor: cat.bgColor,
                    borderWidth: 2,
                    elevation: 2
                  }
                ]}
                activeOpacity={0.8}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <View style={styles.categoryCardTop}>
                  <View style={[styles.catIconCircle, { backgroundColor: cat.color + '15' }]}>
                    <Icon name={cat.icon} size={18} color={cat.color} />
                  </View>
                  {isSelected && (
                    <View style={[styles.checkBadge, { backgroundColor: cat.color }]}>
                      <Icon name="checkmark" size={12} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={[styles.categoryTitle, isSelected && { color: cat.color, fontWeight: '900' }]}>
                  {cat.label}
                </Text>
                <Text style={styles.categorySub} numberOfLines={1}>
                  {cat.hindiLabel}
                </Text>
                <Text style={styles.categoryExample} numberOfLines={1}>
                  {cat.example}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Step 2: Amount Input */}
        <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
          2. राशि दर्ज करें (Enter Amount in ₹) *
        </Text>
        <View style={[styles.amountInputContainer, { borderColor: activeCategoryMeta.color }]}>
          <Text style={[styles.currencyPrefix, { color: activeCategoryMeta.color }]}>₹</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={(val) => setAmount(val.replace(/[^0-9.]/g, ''))}
            placeholder="उदा. 50000"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
          />
          {amount ? (
            <TouchableOpacity onPress={() => setAmount('')} style={{ padding: 4 }}>
              <Icon name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Quick Amount Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickAmountScroll}>
          {QUICK_AMOUNTS.map((quickVal) => (
            <TouchableOpacity
              key={quickVal}
              style={styles.quickAmountChip}
              onPress={() => setAmount(String(quickVal))}
            >
              <Text style={styles.quickAmountChipText}>
                +₹{quickVal >= 100000 ? `${quickVal / 100000} Lakh` : quickVal >= 1000 ? `${quickVal / 1000}k` : quickVal}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Step 3: Date & Payment Mode */}
        <View style={styles.twoColRow}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.fieldLabel}>3. दिनांक (Date YYYY-MM-DD)</Text>
            <View style={styles.textInputWrapper}>
              <Icon name="calendar-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.textInputInner}
                value={dateStr}
                onChangeText={setDateStr}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>

          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.fieldLabel}>4. माध्यम (Mode)</Text>
            <View style={styles.textInputWrapper}>
              <Icon name="card-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.textInputInner}
                value={paymentMode}
                onChangeText={setPaymentMode}
                placeholder="उदा. NetBanking / UPI"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </View>
        </View>

        {/* Payment Mode Pills */}
        <View style={styles.modePillRow}>
          {PAYMENT_MODES.map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.modePill,
                paymentMode === mode && styles.activeModePill
              ]}
              onPress={() => setPaymentMode(mode)}
            >
              <Text style={[styles.modePillText, paymentMode === mode && styles.activeModePillText]}>
                {mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Step 4: Notes / Remarks */}
        <Text style={[styles.fieldLabel, { marginTop: 10 }]}>5. विवरण / टिप्पणी (Notes / Description - Optional)</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="उदा. Personal BOB बैंक में ट्रांसफर / IOCL Indent पेमेंट / पंप सफाई खर्च..."
          placeholderTextColor="#94A3B8"
          multiline={true}
          numberOfLines={2}
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: activeCategoryMeta.color }]}
          activeOpacity={0.85}
          onPress={handleSaveExpense}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnText}>
                खर्च सुरक्षित करें (Save Expense)
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 3. Monthly Filter & History Section */}
      <View style={styles.historySectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="calendar" size={18} color="#003C8F" style={{ marginRight: 6 }} />
          <Text style={styles.historySectionTitle}>मासिक खर्च रिकॉर्ड (Monthly Expenses Log)</Text>
        </View>
      </View>

      {/* Month Selector Pills */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.monthScroll}
        contentContainerStyle={{ paddingHorizontal: 2 }}
      >
        <TouchableOpacity
          style={[styles.monthPill, selectedMonth === 'ALL' && styles.activeMonthPill]}
          onPress={() => setSelectedMonth('ALL')}
        >
          <Text style={[styles.monthPillText, selectedMonth === 'ALL' && styles.activeMonthPillText]}>
            🌟 All Months (सभी)
          </Text>
        </TouchableOpacity>

        {availableMonths.map((mKey) => (
          <TouchableOpacity
            key={mKey}
            style={[styles.monthPill, selectedMonth === mKey && styles.activeMonthPill]}
            onPress={() => setSelectedMonth(mKey)}
          >
            <Text style={[styles.monthPillText, selectedMonth === mKey && styles.activeMonthPillText]}>
              {formatMonthLabel(mKey)} {mKey === currentMonth ? '(Current)' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Monthly Summary Cards Grid */}
      <View style={styles.metricsGrid}>
        {/* Total Outflow */}
        <View style={styles.metricCardTotal}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricCardTitleTotal}>कुल खर्च (Total Outflow)</Text>
            <Icon name="wallet" size={18} color="#003C8F" />
          </View>
          <Text style={styles.metricCardValTotal}>
            ₹{monthlyMetrics.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.metricCardSubTotal}>
            {selectedMonth === 'ALL' ? 'All recorded transactions' : formatMonthLabel(selectedMonth)} • {monthlyMetrics.count} Entries
          </Text>
        </View>

        {/* 3 Categories Summary Breakdown */}
        <View style={styles.metricCardsRow}>
          {/* Personal Bank */}
          <TouchableOpacity 
            style={[
              styles.metricCardMini, 
              { borderColor: '#C7D2FE', backgroundColor: '#F5F3FF' },
              activeCategoryFilter === 'Personal Bank' && { borderWidth: 2, borderColor: '#4F46E5' }
            ]}
            onPress={() => setActiveCategoryFilter(activeCategoryFilter === 'Personal Bank' ? 'ALL' : 'Personal Bank')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Icon name="business" size={14} color="#4F46E5" style={{ marginRight: 4 }} />
              <Text style={[styles.metricMiniLabel, { color: '#4F46E5' }]}>Personal Bank</Text>
            </View>
            <Text style={[styles.metricMiniVal, { color: '#4F46E5' }]}>
              ₹{monthlyMetrics.personalBank.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </TouchableOpacity>

          {/* IOCL */}
          <TouchableOpacity 
            style={[
              styles.metricCardMini, 
              { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
              activeCategoryFilter === 'IOCL' && { borderWidth: 2, borderColor: '#003C8F' }
            ]}
            onPress={() => setActiveCategoryFilter(activeCategoryFilter === 'IOCL' ? 'ALL' : 'IOCL')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Icon name="flame" size={14} color="#003C8F" style={{ marginRight: 4 }} />
              <Text style={[styles.metricMiniLabel, { color: '#003C8F' }]}>IOCL</Text>
            </View>
            <Text style={[styles.metricMiniVal, { color: '#003C8F' }]}>
              ₹{monthlyMetrics.iocl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </TouchableOpacity>

          {/* Extra Expenses */}
          <TouchableOpacity 
            style={[
              styles.metricCardMini, 
              { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' },
              activeCategoryFilter === 'Extra Expenses' && { borderWidth: 2, borderColor: '#EA580C' }
            ]}
            onPress={() => setActiveCategoryFilter(activeCategoryFilter === 'Extra Expenses' ? 'ALL' : 'Extra Expenses')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Icon name="receipt" size={14} color="#EA580C" style={{ marginRight: 4 }} />
              <Text style={[styles.metricMiniLabel, { color: '#EA580C' }]}>Extra Exp.</Text>
            </View>
            <Text style={[styles.metricMiniVal, { color: '#EA580C' }]}>
              ₹{monthlyMetrics.extra.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Filter Pills */}
      <View style={styles.categoryFilterRow}>
        <TouchableOpacity
          style={[styles.catFilterPill, activeCategoryFilter === 'ALL' && styles.activeCatFilterPill]}
          onPress={() => setActiveCategoryFilter('ALL')}
        >
          <Text style={[styles.catFilterPillText, activeCategoryFilter === 'ALL' && styles.activeCatFilterPillText]}>
            सभी (All - {monthlyMetrics.count})
          </Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.catFilterPill,
              activeCategoryFilter === cat.id && [styles.activeCatFilterPill, { backgroundColor: cat.color }]
            ]}
            onPress={() => setActiveCategoryFilter(cat.id)}
          >
            <Text style={[styles.catFilterPillText, activeCategoryFilter === cat.id && styles.activeCatFilterPillText]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 4. Transactions List */}
      {loadingList ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#003C8F" />
          <Text style={styles.loadingText}>खर्च रिकॉर्ड लोड हो रहे हैं...</Text>
        </View>
      ) : filteredExpenses.length === 0 ? (
        <View style={styles.emptyStateCard}>
          <Icon name="file-tray-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyStateTitle}>कोई खर्च रिकॉर्ड नहीं मिला</Text>
          <Text style={styles.emptyStateSub}>
            {selectedMonth === 'ALL' 
              ? 'अभी तक कोई खर्च दर्ज नहीं किया गया है।' 
              : `${formatMonthLabel(selectedMonth)} में ${activeCategoryFilter !== 'ALL' ? activeCategoryFilter : ''} का कोई खर्च नहीं है।`}
          </Text>
        </View>
      ) : (
        filteredExpenses.map((item) => {
          const catMeta = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[2];
          return (
            <View key={item.id} style={styles.expenseCard}>
              <View style={styles.expenseCardLeft}>
                <View style={[styles.expenseCatIconBox, { backgroundColor: catMeta.bgColor }]}>
                  <Icon name={catMeta.icon} size={20} color={catMeta.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <View style={[styles.expenseCatBadge, { backgroundColor: catMeta.bgColor, borderColor: catMeta.borderColor }]}>
                      <Text style={[styles.expenseCatBadgeText, { color: catMeta.color }]}>
                        {catMeta.label}
                      </Text>
                    </View>
                    {item.paymentMode ? (
                      <View style={styles.paymentModeBadge}>
                        <Text style={styles.paymentModeBadgeText}>{item.paymentMode}</Text>
                      </View>
                    ) : null}
                  </View>

                  {item.notes ? (
                    <Text style={styles.expenseNotesText} numberOfLines={2}>
                      📝 {item.notes}
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Icon name="calendar-outline" size={12} color="#64748B" />
                    <Text style={styles.expenseDateText}>
                      {' '}{formatDateDisplay(item.date, item.timestamp)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.expenseCardRight}>
                <Text style={[styles.expenseAmountText, { color: catMeta.color }]}>
                  ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteExpense(item)}
                >
                  <Icon name="trash-outline" size={16} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 14
  },

  // Header Banner
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#003C8F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#003C8F'
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },

  // Form Card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2
  },
  formCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8
  },
  formCardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 6
  },

  // Category Selector Grid
  categoryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  categoryCard: {
    width: '31.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0'
  },
  categoryCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  catIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  checkBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B'
  },
  categorySub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1
  },
  categoryExample: {
    fontSize: 8.5,
    color: '#94A3B8',
    marginTop: 3,
    fontStyle: 'italic'
  },

  // Amount Input
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4
  },
  currencyPrefix: {
    fontSize: 22,
    fontWeight: '900',
    marginRight: 6
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    paddingVertical: 6
  },

  // Quick Amount Chips
  quickAmountScroll: {
    marginTop: 8,
    marginBottom: 10
  },
  quickAmountChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  quickAmountChipText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569'
  },

  // Two Column Inputs
  twoColRow: {
    flexDirection: 'row',
    marginBottom: 8
  },
  textInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  textInputInner: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0
  },

  // Payment Mode Pills
  modePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8
  },
  modePill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  activeModePill: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  modePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B'
  },
  activeModePillText: {
    color: '#fff'
  },

  // Notes Input
  notesInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 46,
    marginBottom: 12
  },

  // Save Button
  saveBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold'
  },

  // History Header
  historySectionHeader: {
    marginBottom: 8,
    marginTop: 4
  },
  historySectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  historySectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1
  },

  // Month Scroll
  monthScroll: {
    marginBottom: 12
  },
  monthPill: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  activeMonthPill: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  monthPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  activeMonthPillText: {
    color: '#fff'
  },

  // Metrics Grid
  metricsGrid: {
    marginBottom: 12
  },
  metricCardTotal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 8,
    elevation: 2
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  metricCardTitleTotal: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569'
  },
  metricCardValTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#003C8F',
    marginBottom: 2
  },
  metricCardSubTotal: {
    fontSize: 11,
    color: '#64748B'
  },

  metricCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  metricCardMini: {
    width: '31.5%',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1
  },
  metricMiniLabel: {
    fontSize: 10,
    fontWeight: 'bold'
  },
  metricMiniVal: {
    fontSize: 13,
    fontWeight: '900'
  },

  // Category Filter Row
  categoryFilterRow: {
    flexDirection: 'row',
    marginBottom: 12
  },
  catFilterPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  activeCatFilterPill: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  catFilterPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569'
  },
  activeCatFilterPillText: {
    color: '#fff'
  },

  // Transaction Cards
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1
  },
  expenseCardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 8
  },
  expenseCatIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2
  },
  expenseCatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 2
  },
  expenseCatBadgeText: {
    fontSize: 10,
    fontWeight: 'bold'
  },
  paymentModeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2
  },
  paymentModeBadgeText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B'
  },
  expenseNotesText: {
    fontSize: 11,
    color: '#334155',
    marginTop: 2
  },
  expenseDateText: {
    fontSize: 10.5,
    color: '#64748B'
  },
  expenseCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  expenseAmountText: {
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6
  },
  deleteBtn: {
    padding: 4
  },

  // Loading & Empty States
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B'
  },
  emptyStateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 10
  },
  emptyStateSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4
  }
});

