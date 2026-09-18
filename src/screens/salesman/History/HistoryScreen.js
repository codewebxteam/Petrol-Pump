import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { collection, query, where, getDocs, limit, startAfter, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { AuthContext } from '../../../context/AuthContext';
import Icon from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';

const FILTER_TYPES = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  WEEK: 'Last 7 Days',
  CUSTOM: 'Custom Date'
};

export default function HistoryScreen() {
  const { user } = useContext(AuthContext);
  const [activeFilter, setActiveFilter] = useState(FILTER_TYPES.TODAY);
  
  // Custom Date State
  const [customDate, setCustomDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null); // Track which card is expanded

  // Pagination State
  const [lastVisible, setLastVisible] = useState(null);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    let start = new Date();
    let end = new Date();
    
    if (activeFilter === FILTER_TYPES.TODAY) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (activeFilter === FILTER_TYPES.YESTERDAY) {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (activeFilter === FILTER_TYPES.WEEK) {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (activeFilter === FILTER_TYPES.CUSTOM) {
      start = new Date(customDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(customDate);
      end.setHours(23, 59, 59, 999);
    }

    try {
      // NOTE: This query requires a composite index on [salesmanId, timestamp].
      const q = query(
        collection(db, 'sales_reports'),
        where('salesmanId', '==', user.uid),
        where('timestamp', '>=', start),
        where('timestamp', '<=', end),
        orderBy('timestamp', 'desc'),
        limit(15)
      );

      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setHistoryData(list);
      
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      } else {
        setLastVisible(null);
      }
      setHasMore(snapshot.docs.length === 15);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreData = async () => {
    if (!hasMore || fetchingMore || loading || !lastVisible || !user) return;

    setFetchingMore(true);
    let start = new Date();
    let end = new Date();
    
    if (activeFilter === FILTER_TYPES.TODAY) {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (activeFilter === FILTER_TYPES.YESTERDAY) {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    } else if (activeFilter === FILTER_TYPES.WEEK) {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (activeFilter === FILTER_TYPES.CUSTOM) {
      start = new Date(customDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(customDate);
      end.setHours(23, 59, 59, 999);
    }

    try {
      const q = query(
        collection(db, 'sales_reports'),
        where('salesmanId', '==', user.uid),
        where('timestamp', '>=', start),
        where('timestamp', '<=', end),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisible),
        limit(15)
      );

      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      
      setHistoryData([...historyData, ...list]);
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMore(snapshot.docs.length === 15);
    } catch (error) {
      console.error("Error fetching more history:", error);
    } finally {
      setFetchingMore(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeFilter, customDate, user]);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderHistoryCard = ({ item }) => {
    const endTime = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString([], { timeStyle: 'short' }) : 'N/A';
    const endDate = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString([], { dateStyle: 'medium' }) : 'N/A';
    const startTime = item.shiftStartTime?.toDate ? item.shiftStartTime.toDate().toLocaleTimeString([], { timeStyle: 'short' }) : 'N/A';
    
    const isShortage = (item.shortageOrExcess || 0) < 0;
    const isPetrol = item.fuelType === 'Petrol';
    const isExpanded = expandedId === item.id;
    
    return (
      <View style={[styles.historyCard, { borderLeftColor: isPetrol ? '#FF6F00' : '#003C8F' }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item.id)}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.dateText}>{endDate}</Text>
              <Text style={styles.timeText}>Started: {startTime}  |  Ended: {endTime}</Text>
            </View>
            <View style={[styles.fuelBadge, { backgroundColor: isPetrol ? '#FFF3E0' : '#E3F2FD' }]}>
              <Text style={[styles.fuelText, { color: isPetrol ? '#FF6F00' : '#003C8F' }]}>
                {item.fuelType || 'Fuel'}
              </Text>
            </View>
          </View>
          
          <View style={styles.detailsRow}>
            <View style={styles.detailCol}>
              <Text style={styles.label}>Nozzle</Text>
              <Text style={styles.value}>{item.nozzleId}</Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.label}>Sold (L)</Text>
              <Text style={styles.value}>{Number(item.totalQuantitySold || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.detailCol}>
              <Text style={styles.label}>Collected</Text>
              <Text style={[styles.value, {color: '#2E7D32'}]}>₹{Number(item.totalPayment || 0).toFixed(0)}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Expected: ₹{Number(item.expectedTotalAmount || 0).toFixed(2)}</Text>
            
            <View style={[styles.shortageBox, { backgroundColor: isShortage ? '#FFEBEE' : '#E8F5E9' }]}>
              <Text style={[styles.shortageText, { color: isShortage ? '#C62828' : '#2E7D32' }]}>
                {isShortage ? 'Shortage: ' : 'Excess: '} ₹{Math.abs(item.shortageOrExcess || 0).toFixed(2)}
              </Text>
            </View>
          </View>
          
          <View style={styles.expandToggle}>
            <Text style={styles.expandText}>{isExpanded ? 'Hide Details' : 'View Details'}</Text>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#003C8F" />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Meter Breakdowns */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Meter Readings</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Opening Meter:</Text>
                <Text style={styles.breakdownValue}>{item.openingMeterReading}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Closing Meter:</Text>
                <Text style={styles.breakdownValue}>{item.closingMeterReading}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Testing Fuel:</Text>
                <Text style={styles.breakdownValue}>{item.testingQuantity || 0} L</Text>
              </View>
            </View>

            {/* Collection Breakdowns */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Collection Breakdown</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Cash:</Text>
                <Text style={styles.breakdownValue}>₹{item.cashAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>PhonePe:</Text>
                <Text style={styles.breakdownValue}>₹{item.phonePeAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Paytm:</Text>
                <Text style={styles.breakdownValue}>₹{item.paytmAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>BharatPe:</Text>
                <Text style={styles.breakdownValue}>₹{item.bharatPeAmount || 0}</Text>
              </View>
            </View>

            {/* Deductions */}
            <View style={[styles.sectionBlock, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <Text style={styles.sectionTitle}>Deductions (Others)</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Credit / Udhari:</Text>
                <Text style={styles.breakdownValue}>₹{item.udhariAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Expenses:</Text>
                <Text style={styles.breakdownValue}>₹{item.expenses || 0}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Icon name="time" size={28} color="#003C8F" />
          <Text style={styles.title}>My Shift History</Text>
        </View>

        {/* Filters */}
        <View style={styles.filterContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={Object.values(FILTER_TYPES)}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.filterChip, activeFilter === item && styles.activeFilterChip]}
                onPress={() => setActiveFilter(item)}
              >
                <Text style={[styles.filterText, activeFilter === item && styles.activeFilterText]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Custom Date Picker */}
        {activeFilter === FILTER_TYPES.CUSTOM && (
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowPicker(true)}>
            <Icon name="calendar-outline" size={20} color="#003C8F" />
            <Text style={styles.datePickerText}>Selected: {customDate.toDateString()}</Text>
          </TouchableOpacity>
        )}

        {showPicker && (
          <DateTimePicker
            value={customDate}
            mode="date"
            display="default"
            maximumDate={new Date()} // Can't pick future date for history
            onChange={(event, date) => {
              setShowPicker(false);
              if (date) setCustomDate(date);
            }}
          />
        )}

        {/* List */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF6F00" />
          </View>
        ) : (
          <FlatList 
            data={historyData}
            keyExtractor={item => item.id}
            renderItem={renderHistoryCard}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Icon name="document-text-outline" size={60} color="#9CA3AF" />
                <Text style={styles.emptyText}>No shifts found for this date.</Text>
              </View>
            }
            onEndReached={fetchMoreData}
            onEndReachedThreshold={0.5}
            ListFooterComponent={fetchingMore ? <ActivityIndicator size="small" color="#FF6F00" style={{ marginVertical: 15 }} /> : null}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { flex: 1, padding: 15 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 15,
    marginTop: 5
  },
  title: { 
    fontSize: 24, 
    fontWeight: '900', 
    color: '#111827', 
    marginLeft: 10 
  },
  
  filterContainer: { marginBottom: 15 },
  filterChip: { 
    backgroundColor: '#fff', 
    paddingHorizontal: 16, 
    paddingVertical: 8, 
    borderRadius: 20, 
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 1,
  },
  activeFilterChip: { 
    backgroundColor: '#FF6F00',
    borderColor: '#FF6F00'
  },
  filterText: { fontSize: 13, color: '#4B5563', fontWeight: 'bold' },
  activeFilterText: { color: '#fff' },

  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  datePickerText: {
    marginLeft: 10,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E3A8A'
  },

  historyCard: { 
    backgroundColor: '#fff', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 15, 
    elevation: 3,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3
  },
  cardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 12
  },
  dateText: { fontSize: 14, color: '#111827', fontWeight: 'bold', marginBottom: 2 },
  timeText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  fuelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  fuelText: { fontSize: 12, fontWeight: '900' },
  
  detailsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    marginBottom: 10
  },
  detailCol: { flex: 1 },
  label: { fontSize: 12, color: '#9CA3AF', marginBottom: 2 },
  value: { fontSize: 16, fontWeight: '900', color: '#111827' },
  
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 10 },
  
  footerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  footerLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  shortageBox: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  shortageText: { fontSize: 13, fontWeight: 'bold' },

  expandToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6'
  },
  expandText: {
    color: '#003C8F',
    fontWeight: 'bold',
    fontSize: 13,
    marginRight: 5
  },
  expandedContent: {
    marginTop: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB'
  },
  sectionBlock: {
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB'
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563',
    marginBottom: 8
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  breakdownLabel: {
    color: '#6B7280',
    fontSize: 13
  },
  breakdownValue: {
    fontWeight: 'bold',
    color: '#111827',
    fontSize: 13
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 50 },
  emptyText: { color: '#9CA3AF', fontSize: 16, marginTop: 10, fontWeight: '500' }
});
