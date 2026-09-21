import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { setDoc, doc, collection, query, where, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { 
  getMonthKey, 
  getPreviousMonthKey, 
  formatMonthLabel, 
  getStaffMonthlyAttendance 
} from '../../../services/dbServices';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import CustomAlert from '../../../components/CustomAlert';
import Toast from 'react-native-toast-message';
import Icon from '@expo/vector-icons/Ionicons';

export default function SalesmanRegistrationScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [salesmen, setSalesmen] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  // Attendance & Advances Data
  const [allSales, setAllSales] = useState([]);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(getMonthKey());
  
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [updating, setUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);

  useEffect(() => {
    // 1. Staff Users
    const q = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubscribeUsers = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSalesmen(list);
      setListLoading(false);
    });

    // 2. Sales Reports for Attendance
    const unsubSales = onSnapshot(collection(db, 'sales_reports'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setAllSales(list);
    }, (err) => console.warn("Error loading sales in staff mgmt:", err.message));

    // 3. Staff Salary Advances
    const unsubSalary = onSnapshot(collection(db, 'staff_salary_advances'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setSalaryAdvances(list);
    }, (err) => console.warn("Error loading salary advances in staff mgmt:", err.message));

    return () => {
      unsubscribeUsers();
      unsubSales();
      unsubSalary();
    };
  }, []);

  const handleRegister = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Error', 'Please enter both full name and phone number.');
      return;
    }

    setLoading(true);
    try {
      const staffRef = doc(collection(db, 'users'));

      await setDoc(staffRef, {
        uid: staffRef.id,
        name: name.trim(),
        phone: phone.trim(),
        role: 'salesman',
        createdAt: new Date()
      });

      Alert.alert('Success ✅', `Staff member "${name.trim()}" registered successfully!`);
      setName('');
      setPhone('');
    } catch (error) {
      console.error(error);
      Alert.alert('Registration Failed', error.message || 'Failed to add staff member.');
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (item) => {
    setSelectedSalesman(item);
    setEditName(item.name || '');
    setEditPhone(item.phone || '');
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleUpdateSalesman = async () => {
    if (!editName.trim() || !editPhone.trim()) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Name and phone number are required.' });
      return;
    }
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', selectedSalesman.id), {
        name: editName.trim(),
        phone: editPhone.trim()
      });
      Toast.show({ type: 'success', text1: 'Success', text2: 'Staff details updated successfully!' });
      setIsEditing(false);
      
      setSelectedSalesman({
        ...selectedSalesman,
        name: editName.trim(),
        phone: editPhone.trim()
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setUpdating(false);
    }
  };

  const renderHeader = () => (
    <View style={{ marginBottom: 15 }}>
      <Text style={styles.title}>Staff Attendance & Team Management</Text>
      <Text style={styles.subtitle}>Register team members and monitor monthly attendance & salary advances.</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Register New Staff</Text>
        <CustomInput
          label="Full Name *"
          placeholder="e.g. Rahul Kumar"
          leftIcon="person-outline"
          value={name}
          onChangeText={setName}
        />
        <CustomInput
          label="Phone Number *"
          placeholder="Enter 10-digit mobile number"
          leftIcon="call-outline"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <CustomButton 
          title="+ SAVE STAFF" 
          onPress={handleRegister} 
          loading={loading}
          type="primary"
          style={{ marginTop: 10 }}
        />
      </View>

      {/* Month Filter Section for Registered Staff */}
      <View style={styles.monthHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.registeredTitle}>
            Registered Staff ({salesmen.length})
          </Text>
          <Text style={styles.registeredSubtitle}>
            Attendance for {formatMonthLabel(selectedMonthKey)}
          </Text>
        </View>

        <View style={styles.monthToggleRow}>
          <TouchableOpacity
            style={[styles.monthToggleBtn, selectedMonthKey === getMonthKey() && styles.monthToggleBtnActive]}
            onPress={() => setSelectedMonthKey(getMonthKey())}
          >
            <Text style={[styles.monthToggleBtnText, selectedMonthKey === getMonthKey() && styles.monthToggleBtnTextActive]}>
              This Month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.monthToggleBtn, selectedMonthKey === getPreviousMonthKey() && styles.monthToggleBtnActive]}
            onPress={() => setSelectedMonthKey(getPreviousMonthKey())}
          >
            <Text style={[styles.monthToggleBtnText, selectedMonthKey === getPreviousMonthKey() && styles.monthToggleBtnTextActive]}>
              Last Month
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderSalesman = ({ item }) => {
    const att = getStaffMonthlyAttendance(allSales, item.id, item.name, selectedMonthKey);
    const advTotal = salaryAdvances
      .filter(a => ((a.salesmanId === item.id) || (a.salesmanName && item.name && a.salesmanName.trim().toLowerCase() === item.name.trim().toLowerCase())) && (a.monthKey || getMonthKey()) === selectedMonthKey)
      .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

    return (
      <View style={styles.listItem}>
        <View style={styles.listInfo}>
          <Text style={styles.listName}>{item.name}</Text>
          <Text style={styles.listPhone}>📞 {item.phone}</Text>
          
          <View style={styles.staffBadgeRow}>
            <View style={styles.staffAttBadge}>
              <Icon name="calendar-outline" size={11} color="#003C8F" style={{ marginRight: 3 }} />
              <Text style={styles.staffAttBadgeText}>{att.daysCount} Days Present</Text>
            </View>
            <View style={[styles.staffAdvBadge, advTotal > 0 ? styles.staffAdvBadgeActive : {}]}>
              <Icon name="wallet-outline" size={11} color={advTotal > 0 ? '#B45309' : '#64748B'} style={{ marginRight: 3 }} />
              <Text style={[styles.staffAdvBadgeText, advTotal > 0 ? { color: '#B45309' } : {}]}>
                ₹{advTotal.toFixed(0)} Adv
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.viewBtn} onPress={() => openDetails(item)}>
          <Text style={styles.viewBtnText}>Attendance</Text>
          <Icon name="chevron-forward" size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {listLoading ? (
        <ActivityIndicator size="large" color="#003C8F" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={salesmen}
          keyExtractor={item => item.id}
          renderItem={renderSalesman}
          ListHeaderComponent={renderHeader()}
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.emptyText}>No staff members registered yet.</Text>}
        />
      )}

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Staff' : 'Staff Attendance & Advances'}</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setIsEditing(false);
              }}>
                <Icon name="close-circle" size={28} color="#d32f2f" />
              </TouchableOpacity>
            </View>

            {selectedSalesman && !isEditing && (() => {
              const modalAtt = getStaffMonthlyAttendance(allSales, selectedSalesman.id, selectedSalesman.name, selectedMonthKey);
              const modalAdvances = salaryAdvances.filter(a => 
                ((a.salesmanId === selectedSalesman.id) || (a.salesmanName && selectedSalesman.name && a.salesmanName.trim().toLowerCase() === selectedSalesman.name.trim().toLowerCase())) && 
                (a.monthKey || getMonthKey()) === selectedMonthKey
              );
              const modalAdvTotal = modalAdvances.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

              return (
                <View style={styles.modalContent}>
                  {/* Basic Details */}
                  <View style={styles.detailRow}>
                    <Icon name="person" size={18} color="#003C8F" />
                    <Text style={styles.detailLabel}>Name:</Text>
                    <Text style={styles.detailValue}>{selectedSalesman.name}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Icon name="call" size={18} color="#2E7D32" />
                    <Text style={styles.detailLabel}>Phone:</Text>
                    <Text style={styles.detailValue}>{selectedSalesman.phone}</Text>
                  </View>

                  {/* Month Selector in Modal */}
                  <View style={styles.modalMonthPickerRow}>
                    <Text style={styles.modalMonthPickerLabel}>Select Month:</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.modalMonthPill, selectedMonthKey === getMonthKey() && styles.modalMonthPillActive]}
                        onPress={() => setSelectedMonthKey(getMonthKey())}
                      >
                        <Text style={[styles.modalMonthPillText, selectedMonthKey === getMonthKey() && styles.modalMonthPillTextActive]}>
                          {formatMonthLabel(getMonthKey())} (This Month)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalMonthPill, selectedMonthKey === getPreviousMonthKey() && styles.modalMonthPillActive]}
                        onPress={() => setSelectedMonthKey(getPreviousMonthKey())}
                      >
                        <Text style={[styles.modalMonthPillText, selectedMonthKey === getPreviousMonthKey() && styles.modalMonthPillTextActive]}>
                          {formatMonthLabel(getPreviousMonthKey())} (Last Month)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Stat Cards */}
                  <View style={styles.modalStatCardsRow}>
                    <View style={styles.modalAttCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="calendar" size={14} color="#003C8F" />
                        <Text style={styles.modalAttCardLabel}> Days Present</Text>
                      </View>
                      <Text style={styles.modalAttCardVal}>{modalAtt.daysCount} Din</Text>
                      <Text style={styles.modalAttCardSub}>
                        {modalAtt.entriesCount} shifts • {modalAtt.totalLiters.toFixed(0)} L sold
                      </Text>
                    </View>

                    <View style={styles.modalAdvCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="wallet" size={14} color="#B45309" />
                        <Text style={styles.modalAdvCardLabel}> Salary Advance</Text>
                      </View>
                      <Text style={styles.modalAdvCardVal}>₹{modalAdvTotal.toFixed(0)}</Text>
                      <Text style={styles.modalAdvCardSub}>
                        {modalAdvances.length} advance(s) taken
                      </Text>
                    </View>
                  </View>

                  {/* Scrollable Attendance Dates List ("kis kis date ko daily entry diye ho") */}
                  <ScrollView style={{ maxHeight: 220, marginTop: 12 }} showsVerticalScrollIndicator={false}>
                    <View style={styles.modalDatesContainer}>
                      <View style={styles.modalDatesHeader}>
                        <Icon name="list-outline" size={14} color="#003C8F" style={{ marginRight: 4 }} />
                        <Text style={styles.modalDatesTitle}>
                          Daily Entry Dates ({modalAtt.distinctDates.length} Days in {formatMonthLabel(selectedMonthKey)})
                        </Text>
                      </View>

                      {modalAtt.distinctDates.length === 0 ? (
                        <Text style={styles.modalDatesEmpty}>
                          Iss mahine me koi daily entry nahi mili.
                        </Text>
                      ) : (
                        modalAtt.distinctDates.map((d, idx) => (
                          <View key={d.dayKey || idx} style={styles.modalDateItem}>
                            <View style={styles.modalDateIndex}>
                              <Text style={styles.modalDateIndexText}>{idx + 1}</Text>
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.modalDateMain}>{d.dateFormatted}</Text>
                                <Text style={styles.modalDateDay}> ({d.weekday})</Text>
                              </View>
                              <Text style={styles.modalDateSub}>Machine: {d.machinesList}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={styles.modalDateLiters}>
                                {d.dayLiters > 0 ? `${d.dayLiters.toFixed(0)} L` : 'Logged'}
                              </Text>
                              <Text style={styles.modalDateShifts}>{d.shiftsCount} shift</Text>
                            </View>
                          </View>
                        ))
                      )}
                    </View>

                    {/* Salary Advance Breakdown if any */}
                    {modalAdvances.length > 0 && (
                      <View style={[styles.modalDatesContainer, { marginTop: 10, borderColor: '#FDE68A' }]}>
                        <View style={[styles.modalDatesHeader, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                          <Icon name="cash-outline" size={14} color="#B45309" style={{ marginRight: 4 }} />
                          <Text style={[styles.modalDatesTitle, { color: '#92400E' }]}>
                            Advance Slips (Total: ₹{modalAdvTotal.toFixed(0)})
                          </Text>
                        </View>
                        {modalAdvances.map((adv, idx) => {
                          const advDate = adv.timestamp?.toDate
                            ? adv.timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                            : (adv.date || 'Advance');
                          return (
                            <View key={adv.id || idx} style={styles.modalAdvItem}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.modalAdvItemDate}>📅 {advDate}</Text>
                                <Text style={styles.modalAdvItemNotes}>
                                  {adv.notes || 'Salary Advance'} {adv.machineName ? `(${adv.machineName})` : ''}
                                </Text>
                              </View>
                              <Text style={styles.modalAdvItemAmt}>₹{parseFloat(adv.amount || 0).toFixed(0)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </ScrollView>

                  {/* Actions: Edit & Delete */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF6F00' }]} onPress={() => setIsEditing(true)}>
                      <Icon name="create-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Edit Staff</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#d32f2f' }]} onPress={() => setAlertVisible(true)}>
                      <Icon name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            {selectedSalesman && isEditing && (
              <View style={styles.modalContent}>
                <CustomInput label="Full Name" value={editName} onChangeText={setEditName} />
                <CustomInput label="Phone Number" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
                
                <View style={styles.actionRow}>
                  <CustomButton 
                    title="Cancel" 
                    onPress={() => setIsEditing(false)} 
                    type="secondary"
                    style={{ flex: 1, marginRight: 5 }}
                  />
                  <CustomButton 
                    title="Save Changes" 
                    onPress={handleUpdateSalesman} 
                    loading={updating}
                    type="primary"
                    style={{ flex: 1, marginLeft: 5 }}
                  />
                </View>
              </View>
            )}

            {!isEditing && (
              <CustomButton 
                title="Close" 
                onPress={() => setModalVisible(false)} 
                type="secondary"
                style={{ marginTop: 14 }}
              />
            )}
          </View>
        </View>
      </Modal>
      
      <CustomAlert
        visible={alertVisible}
        title="Delete Staff"
        message={`Are you sure you want to delete "${selectedSalesman?.name}"?`}
        isDestructive={true}
        cancelText="Cancel"
        confirmText="Delete"
        loading={isDeleting}
        onCancel={() => setAlertVisible(false)}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await deleteDoc(doc(db, 'users', selectedSalesman.id));
            Toast.show({ type: 'success', text1: 'Deleted', text2: `${selectedSalesman.name} was removed.` });
            setAlertVisible(false);
            setModalVisible(false);
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Error', text2: error.message });
            setAlertVisible(false);
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f7fa' },
  title: { fontSize: 20, fontWeight: '900', color: '#003C8F', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#64748B', textAlign: 'center', marginBottom: 16 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 14, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 5, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 8 },
  
  // Month header row
  monthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10
  },
  registeredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#003C8F'
  },
  registeredSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  monthToggleRow: {
    flexDirection: 'row',
    gap: 6
  },
  monthToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  monthToggleBtnActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  monthToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  monthToggleBtnTextActive: {
    color: '#FFFFFF'
  },

  // List item
  listItem: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    padding: 14, 
    borderRadius: 12, 
    marginBottom: 10, 
    alignItems: 'center', 
    elevation: 2, 
    borderLeftWidth: 4, 
    borderLeftColor: '#003C8F',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  listInfo: { flex: 1 },
  listName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  listPhone: { fontSize: 12, color: '#64748B', marginTop: 2 },
  staffBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6
  },
  staffAttBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  staffAttBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#003C8F'
  },
  staffAdvBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginLeft: 6
  },
  staffAdvBadgeActive: {
    backgroundColor: '#FFFDF7',
    borderColor: '#FDE68A'
  },
  staffAdvBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B'
  },
  viewBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#003C8F', 
    paddingHorizontal: 10, 
    paddingVertical: 7, 
    borderRadius: 8 
  },
  viewBtnText: { color: '#fff', fontWeight: 'bold', marginRight: 4, fontSize: 11 },
  emptyText: { textAlign: 'center', color: '#94A3B8', fontStyle: 'italic', marginTop: 20 },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContainer: { width: '100%', maxHeight: '90%', backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#003C8F' },
  modalContent: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  detailLabel: { fontSize: 13, color: '#64748B', width: 65, marginLeft: 6, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: 'bold', color: '#1E293B', flex: 1 },

  // Modal Month Picker
  modalMonthPickerRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginBottom: 8
  },
  modalMonthPickerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4
  },
  modalMonthPill: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center'
  },
  modalMonthPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  modalMonthPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#003C8F'
  },
  modalMonthPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },

  // Modal Stat Cards
  modalStatCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  modalAttCard: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  modalAttCardLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#003C8F'
  },
  modalAttCardVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#003C8F',
    marginVertical: 2
  },
  modalAttCardSub: {
    fontSize: 9.5,
    color: '#64748B'
  },
  modalAdvCard: {
    flex: 1,
    backgroundColor: '#FFFDF7',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  modalAdvCardLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309'
  },
  modalAdvCardVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#B45309',
    marginVertical: 2
  },
  modalAdvCardSub: {
    fontSize: 9.5,
    color: '#92400E'
  },

  // Modal Dates List
  modalDatesContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  modalDatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  modalDatesTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#003C8F'
  },
  modalDatesEmpty: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    padding: 14,
    fontStyle: 'italic'
  },
  modalDateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  modalDateIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalDateIndexText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#003C8F'
  },
  modalDateMain: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B'
  },
  modalDateDay: {
    fontSize: 11,
    color: '#64748B'
  },
  modalDateSub: {
    fontSize: 10,
    color: '#64748B'
  },
  modalDateLiters: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A'
  },
  modalDateShifts: {
    fontSize: 9.5,
    color: '#64748B'
  },

  // Modal Advance Items
  modalAdvItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7'
  },
  modalAdvItemDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B'
  },
  modalAdvItemNotes: {
    fontSize: 10,
    color: '#92400E'
  },
  modalAdvItemAmt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#B45309'
  },

  actionRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginHorizontal: 8 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 12 }
});

