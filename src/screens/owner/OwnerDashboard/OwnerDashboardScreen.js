import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { collection, onSnapshot, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import TankStockCard from '../../../components/TankStockCard';
import Icon from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native'; // Keep if needed

const { width } = Dimensions.get('window');

export default function OwnerDashboardScreen() {
  const [tanks, setTanks] = useState([]);
  const [salesmenCount, setSalesmenCount] = useState(0);
  const [salesmenMap, setSalesmenMap] = useState({});
  const [machineCount, setMachineCount] = useState(0);
  const [nozzleCount, setNozzleCount] = useState(0);
  
  const [todaysSales, setTodaysSales] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [pendingCollection, setPendingCollection] = useState(0);
  const [totalSoldLiters, setTotalSoldLiters] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalUdhari, setTotalUdhari] = useState(0);

  useEffect(() => {
    // 1. Tanks Listener
    const unsubTanks = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setTanks(list);
    });

    // 2. Salesmen Count & Map
    const qUsers = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setSalesmenCount(snapshot.docs.length);
      const map = {};
      snapshot.forEach(doc => {
        map[doc.id] = doc.data().name;
      });
      setSalesmenMap(map);
    });

    // 3. Machines & Nozzles Count
    const unsubMachines = onSnapshot(collection(db, 'machines'), (snapshot) => setMachineCount(snapshot.docs.length));
    const unsubNozzles = onSnapshot(collection(db, 'nozzles'), (snapshot) => setNozzleCount(snapshot.docs.length));

    // 4. Today's Sales Reports
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const qSales = query(
      collection(db, 'sales_reports'),
      where('timestamp', '>=', startOfDay),
      where('timestamp', '<=', endOfDay)
    );
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      const list = [];
      let rev = 0;
      let pending = 0;
      let liters = 0;
      let exp = 0;
      let udh = 0;

      snapshot.forEach(d => {
        const data = d.data();
        list.push({ id: d.id, ...data });
        
        if (data.isSettled) {
          rev += (Number(data.totalPayment) || 0);
          liters += (Number(data.totalQuantitySold) || 0);
          exp += (Number(data.expenses) || 0);
          udh += (Number(data.udhariAmount) || 0);
        } else {
          pending += (Number(data.totalPayment) || 0);
        }
      });
      
      // Sort client-side to avoid needing a composite index if one doesn't exist
      list.sort((a, b) => b.timestamp?.toMillis() - a.timestamp?.toMillis());
      setTodaysSales(list);
      setTotalRevenue(rev);
      setPendingCollection(pending);
      setTotalSoldLiters(liters);
      setTotalExpenses(exp);
      setTotalUdhari(udh);
    });

    return () => {
      unsubTanks();
      unsubUsers();
      unsubMachines();
      unsubNozzles();
      unsubSales();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  const handleSettleCollection = async (docId) => {
    try {
      await updateDoc(doc(db, 'sales_reports', docId), {
        isSettled: true
      });
    } catch (error) {
      console.error('Error settling collection:', error);
    }
  };

  const renderTank = ({ item }) => (
    <View style={styles.tankWrapper}>
      <TankStockCard 
        tankId={item.tankId || item.id} 
        petrolStock={item.petrolStock} 
        dieselStock={item.dieselStock}
        petrolCapacity={item.petrolCapacity || 'N/A'}
        dieselCapacity={item.dieselCapacity || 'N/A'}
      />
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Dashboard</Text>
          <Text style={styles.subGreeting}>Welcome Back, Owner</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Icon name="log-out-outline" size={24} color="#d32f2f" />
        </TouchableOpacity>
      </View>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        {/* Revenue Card */}
        <View style={[styles.metricCard, { backgroundColor: '#FF6F00' }]}>
          <Icon name="cash-outline" size={26} color="#fff" />
          <Text style={styles.metricValue}>₹{totalRevenue.toFixed(2)}</Text>
          <Text style={styles.metricLabel}>Today's Revenue</Text>
        </View>
        
        {/* Pending Collection Card */}
        <View style={[styles.metricCard, { backgroundColor: pendingCollection > 0 ? '#E53935' : '#2E7D32' }]}>
          <Icon name={pendingCollection > 0 ? "alert-circle-outline" : "checkmark-circle-outline"} size={26} color="#fff" />
          <Text style={styles.metricValue}>₹{pendingCollection.toFixed(2)}</Text>
          <Text style={styles.metricLabel}>Pending Collection</Text>
        </View>

        {/* Sales Volume */}
        <View style={[styles.metricCard, { backgroundColor: '#003C8F' }]}>
          <Icon name="water-outline" size={26} color="#fff" />
          <Text style={styles.metricValue}>{totalSoldLiters.toFixed(2)} L</Text>
          <Text style={styles.metricLabel}>Fuel Dispensed</Text>
        </View>

        {/* Expenses Card */}
        <View style={[styles.metricCard, { backgroundColor: '#8E24AA' }]}>
          <Icon name="receipt-outline" size={26} color="#fff" />
          <Text style={styles.metricValue}>₹{totalExpenses.toFixed(2)}</Text>
          <Text style={styles.metricLabel}>Today's Expenses</Text>
        </View>

        {/* Udhari Card */}
        <View style={[styles.metricCard, { backgroundColor: '#F57C00' }]}>
          <Icon name="book-outline" size={26} color="#fff" />
          <Text style={styles.metricValue}>₹{totalUdhari.toFixed(2)}</Text>
          <Text style={styles.metricLabel}>Today's Udhari (Credit)</Text>
        </View>

        {/* Staff & Hardware */}
        <View style={[styles.metricCard, { backgroundColor: '#455A64' }]}>
          <Icon name="people-outline" size={26} color="#fff" />
          <Text style={styles.metricValue}>{salesmenCount}</Text>
          <Text style={styles.metricLabel}>Active Staff</Text>
        </View>
      </View>

      {/* Live Inventory */}
      <View style={styles.sectionHeader}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Icon name="speedometer-outline" size={22} color="#003C8F" style={{marginRight: 8}} />
          <Text style={styles.sectionTitle}>Live Inventory</Text>
        </View>
      </View>
      
      {tanks.length === 0 ? (
        <Text style={styles.emptyText}>No tanks configured.</Text>
      ) : (
        <FlatList 
          data={tanks}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.id}
          renderItem={renderTank}
          contentContainerStyle={{ paddingRight: 20, paddingBottom: 10 }}
        />
      )}

      {/* Hardware Summary */}
      <View style={styles.hardwareSummary}>
        <View style={styles.hardwareItem}>
          <Icon name="hardware-chip-outline" size={26} color="#003C8F" />
          <Text style={styles.hardwareText}>{machineCount} Machines</Text>
        </View>
        <View style={styles.hardwareDivider} />
        <View style={styles.hardwareItem}>
          <Icon name="git-network-outline" size={26} color="#FF6F00" />
          <Text style={styles.hardwareText}>{nozzleCount} Nozzles</Text>
        </View>
      </View>

      {/* Expected Collections */}
      <View style={[styles.sectionHeader, { marginTop: 15 }]}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Icon name="wallet-outline" size={22} color="#E53935" style={{marginRight: 8}} />
          <Text style={styles.sectionTitle}>Expected Collections</Text>
        </View>
      </View>

      {todaysSales.filter(s => !s.isSettled).length === 0 ? (
        <View style={styles.emptySalesCard}>
          <Text style={styles.emptySalesText}>No pending collections.</Text>
        </View>
      ) : (
        todaysSales.filter(s => !s.isSettled).map(sale => (
          <View key={`pending-${sale.id}`} style={styles.pendingCard}>
            <View style={styles.pendingInfo}>
              <Text style={styles.pendingName}>{salesmenMap[sale.salesmanId] || sale.salesmanId}</Text>
              <Text style={styles.pendingTime}>
                Shift ended at {sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
              </Text>
            </View>
            <View style={styles.pendingAction}>
              <Text style={styles.pendingAmount}>₹{Number(sale.totalPayment).toFixed(2)}</Text>
              <TouchableOpacity onPress={() => handleSettleCollection(sale.id)} style={styles.settleBtn}>
                <Icon name="checkmark-circle" size={32} color="#2E7D32" />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Recent Sales List */}
      <View style={[styles.sectionHeader, { marginTop: 15 }]}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <Icon name="list-outline" size={22} color="#003C8F" style={{marginRight: 8}} />
          <Text style={styles.sectionTitle}>Today's Recent Sales</Text>
        </View>
      </View>
      
      {todaysSales.length === 0 ? (
        <View style={styles.emptySalesCard}>
          <Text style={styles.emptySalesText}>No sales recorded today yet.</Text>
        </View>
      ) : (
        todaysSales.slice(0, 5).map(sale => (
          <View key={sale.id} style={styles.recentSaleCard}>
            <View style={styles.saleHeader}>
              <Text style={styles.saleTime}>
                {sale.timestamp?.toDate ? sale.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'N/A'}
              </Text>
              <Text style={styles.saleAmount}>₹{Number(sale.totalPayment).toFixed(2)}</Text>
            </View>
            <View style={styles.saleDetails}>
              <Text style={styles.saleDetailText}>
                <Text style={{fontWeight: 'bold', color: sale.fuelType === 'Petrol' ? '#FF6F00' : '#003C8F'}}>
                  {sale.fuelType || 'Fuel'}
                </Text> 
                {' '}• Nozzle {sale.nozzleId} • {sale.totalQuantitySold} L
              </Text>
              <Text style={styles.saleSalesman}>By: {salesmenMap[sale.salesmanId] || sale.salesmanId}</Text>
            </View>
          </View>
        ))
      )}
      
      <View style={{height: 40}} />
    </ScrollView>
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
    marginBottom: 20,
    marginTop: 10
  },
  greeting: { 
    fontSize: 28, 
    fontWeight: '900', 
    color: '#003C8F',
    letterSpacing: 0.5
  },
  subGreeting: { 
    fontSize: 14, 
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 2
  },
  logoutBtn: { 
    backgroundColor: '#FFEBEE', 
    padding: 10, 
    borderRadius: 50 
  },
  
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 15,
    marginBottom: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    alignItems: 'flex-start'
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    marginBottom: 4
  },
  metricLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600'
  },

  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 15 
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#111827' 
  },
  
  tankWrapper: {
    width: width * 0.75,
    marginRight: 15,
  },
  
  hardwareSummary: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  hardwareItem: {
    alignItems: 'center'
  },
  hardwareText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333'
  },
  hardwareDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#E5E7EB'
  },

  emptyText: {
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 20
  },
  
  emptySalesCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center'
  },
  emptySalesText: {
    color: '#9CA3AF',
    fontStyle: 'italic'
  },
  
  recentSaleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#003C8F'
  },
  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  saleTime: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563'
  },
  saleAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981'
  },
  saleDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  saleDetailText: {
    fontSize: 13,
    color: '#6B7280'
  },
  saleSalesman: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: 'bold',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10
  },
  
  pendingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#E53935'
  },
  pendingInfo: { flex: 1 },
  pendingName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  pendingTime: { fontSize: 12, color: '#888', marginTop: 4 },
  pendingAction: { flexDirection: 'row', alignItems: 'center' },
  pendingAmount: { fontSize: 18, fontWeight: '900', color: '#111827', marginRight: 15 },
  settleBtn: { padding: 5 }
});
