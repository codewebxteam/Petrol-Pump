import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import { AuthContext } from '../../../context/AuthContext';
import Icon from '@expo/vector-icons/Ionicons';

export default function DashboardScreen({ navigation }) {
  const { user, userData } = useContext(AuthContext);
  const [activeShift, setActiveShift] = useState(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'shifts'), 
      where('salesmanId', '==', user.uid),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveShift({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setActiveShift(null);
      }
    });
    return unsub;
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.userName}>{userData?.name || 'Salesman'}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Icon name="log-out-outline" size={24} color="#d32f2f" />
          </TouchableOpacity>
        </View>

        {/* Status Indicator */}
        <View style={styles.statusBadgeContainer}>
          <View style={[styles.statusDot, { backgroundColor: activeShift ? '#10B981' : '#6B7280' }]} />
          <Text style={styles.statusBadgeText}>
            {activeShift ? 'Currently on duty' : 'Currently off duty'}
          </Text>
        </View>

        {/* Main Status Card */}
        <View style={styles.card}>
          {activeShift ? (
            <>
              <View style={styles.cardHeader}>
                <Icon name="play-circle" size={28} color="#FF6F00" />
                <Text style={styles.statusActive}>Active Shift</Text>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.detailRow}>
                <Icon name="git-network-outline" size={20} color="#003C8F" />
                <Text style={styles.detailText}>Nozzle ID:</Text>
                <Text style={styles.detailValue}>{activeShift.nozzleId}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <Icon name="time-outline" size={20} color="#003C8F" />
                <Text style={styles.detailText}>Started at:</Text>
                <Text style={styles.detailValue}>{activeShift.startTime?.toDate?.().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) || 'N/A'}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <Icon name="speedometer-outline" size={20} color="#003C8F" />
                <Text style={styles.detailText}>Opening Meter:</Text>
                <Text style={styles.detailValue}>{activeShift.openingMeterReading}</Text>
              </View>

              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#d32f2f', marginTop: 25 }]} onPress={() => navigation.navigate('End Shift')}>
                <Icon name="stop-circle-outline" size={22} color="#fff" style={{marginRight: 8}} />
                <Text style={styles.actionBtnText}>END SHIFT</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.cardHeader}>
                <Icon name="pause-circle" size={28} color="#888" />
                <Text style={styles.statusInactive}>No Active Shift</Text>
              </View>
              
              <View style={styles.divider} />
              
              <Text style={styles.inactiveDesc}>
                You have not started your shift yet. Start your shift to begin recording sales.
              </Text>
              
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10B981', marginTop: 25 }]} onPress={() => navigation.navigate('Start Shift')}>
                <Icon name="play-circle-outline" size={22} color="#fff" style={{marginRight: 8}} />
                <Text style={styles.actionBtnText}>START SHIFT</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { padding: 20 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 10,
    marginTop: 10
  },
  greeting: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  userName: { fontSize: 28, fontWeight: '900', color: '#003C8F', letterSpacing: 0.5 },
  logoutBtn: { backgroundColor: '#FFEBEE', padding: 10, borderRadius: 50 },
  
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 25,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusBadgeText: { fontSize: 13, fontWeight: 'bold', color: '#4B5563' },

  card: { 
    backgroundColor: '#fff', 
    padding: 25, 
    borderRadius: 20, 
    elevation: 5, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statusActive: { fontSize: 22, fontWeight: 'bold', color: '#FF6F00', marginLeft: 10 },
  statusInactive: { fontSize: 22, fontWeight: 'bold', color: '#6B7280', marginLeft: 10 },
  
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
  
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  detailText: { fontSize: 15, color: '#6B7280', marginLeft: 10, flex: 1 },
  detailValue: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  
  inactiveDesc: { textAlign: 'center', color: '#6B7280', fontSize: 15, lineHeight: 22 },

  actionBtn: { 
    flexDirection: 'row',
    padding: 16, 
    borderRadius: 12, 
    width: '100%', 
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, letterSpacing: 1 }
});
