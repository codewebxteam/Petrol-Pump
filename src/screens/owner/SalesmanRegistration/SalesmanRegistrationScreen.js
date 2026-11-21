import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, TouchableOpacity, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { setDoc, doc, collection, query, where, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { 
  getMonthKey, 
  getPreviousMonthKey, 
  formatMonthLabel, 
  getStaffMonthlyAttendance,
  addDirectSalaryAdvance,
  getStaffTypeDetails
} from '../../../services/dbServices';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import CustomAlert from '../../../components/CustomAlert';
import ScrollableModal from '../../../components/ScrollableModal';
import Toast from 'react-native-toast-message';
import Icon from '@expo/vector-icons/Ionicons';

export default function SalesmanRegistrationScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [staffType, setStaffType] = useState('salesman'); // 'salesman' | 'watchman' | 'sweeper'
  const [loading, setLoading] = useState(false);
  
  const [salesmen, setSalesmen] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState('all'); // 'all' | 'salesman' | 'watchman' | 'sweeper'

  // Attendance & Advances Data
  const [allSales, setAllSales] = useState([]);
  const [salaryAdvances, setSalaryAdvances] = useState([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(getMonthKey());
  
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStaffType, setEditStaffType] = useState('salesman');
  const [updating, setUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Direct Advance State inside Modal
  const [showDirectAdvanceModal, setShowDirectAdvanceModal] = useState(false);
  const [advanceAmt, setAdvanceAmt] = useState('');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);
  
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
        role: 'salesman', // role == 'salesman' ensures all firestore queries & rules load this staff
        staffType: staffType, // 'salesman' | 'watchman' | 'sweeper'
        createdAt: new Date()
      });

      const roleObj = getStaffTypeDetails(staffType);
      Alert.alert('Success ✅', `${roleObj.badge} "${name.trim()}" registered successfully!`);
      setName('');
      setPhone('');
      setStaffType('salesman');
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
    setEditStaffType(item.staffType || 'salesman');
    setIsEditing(false);
    setShowDirectAdvanceModal(false);
    setAdvanceAmt('');
    setAdvanceNotes('');
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
        phone: editPhone.trim(),
        staffType: editStaffType
      });
      Toast.show({ type: 'success', text1: 'Success', text2: 'Staff details updated successfully!' });
      setIsEditing(false);
      
      setSelectedSalesman({
        ...selectedSalesman,
        name: editName.trim(),
        phone: editPhone.trim(),
        staffType: editStaffType
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveDirectAdvance = async () => {
    if (!selectedSalesman) return;
    const amt = parseFloat(advanceAmt);
    if (!amt || amt <= 0) {
      Toast.show({ type: 'error', text1: 'गलत राशि', text2: 'कृपया 0 से अधिक वैध राशि दर्ज करें।' });
      return;
    }
    setSavingAdvance(true);
    try {
      const res = await addDirectSalaryAdvance({
        salesmanId: selectedSalesman.id,
        salesmanName: selectedSalesman.name,
        amount: amt,
        notes: advanceNotes.trim() || 'वेतन / एडवांस भुगतान',
        date: new Date()
      });
      if (res.success) {
        Toast.show({ 
          type: 'success', 
          text1: 'एडवांस दर्ज हुआ ✅', 
          text2: `₹${amt.toFixed(0)} ${selectedSalesman.name} के खाते में दर्ज किया गया!` 
        });
        setAdvanceAmt('');
        setAdvanceNotes('');
        setShowDirectAdvanceModal(false);
      } else {
        Toast.show({ type: 'error', text1: 'Error', text2: res.error || 'Failed to save' });
      }
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    } finally {
      setSavingAdvance(false);
    }
  };

  const filteredSalesmen = salesmen.filter(s => 
    staffFilter === 'all' ? true : (s.staffType || 'salesman') === staffFilter
  );

  const renderHeader = () => (
    <View style={{ marginBottom: 15 }}>
      <Text style={styles.title}>Staff & Team Management</Text>
      <Text style={styles.subtitle}>Register Salesmen, Watchmen & Sweepers, and track monthly attendance & advances.</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Register New Staff</Text>

        {/* Staff Role Selector */}
        <Text style={styles.inputSectionLabel}>स्टाफ का पद / Role *</Text>
        <View style={styles.roleSelectorRow}>
          {[
            { key: 'salesman', label: 'सेल्समैन', icon: 'speedometer', badge: '⛽ Salesman' },
            { key: 'watchman', label: 'चौकीदार', icon: 'shield-checkmark', badge: '🛡️ Watchman' },
            { key: 'sweeper', label: 'सफाईकर्मी', icon: 'brush', badge: '🧹 Sweeper' }
          ].map(r => (
            <TouchableOpacity
              key={r.key}
              style={[styles.roleSelectPill, staffType === r.key && styles.roleSelectPillActive]}
              onPress={() => setStaffType(r.key)}
              activeOpacity={0.7}
            >
              <Icon 
                name={r.icon} 
                size={14} 
                color={staffType === r.key ? '#fff' : '#003C8F'} 
                style={{ marginRight: 4 }} 
              />
              <Text style={[styles.roleSelectPillText, staffType === r.key && styles.roleSelectPillTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <CustomInput
          label="Full Name *"
          placeholder="e.g. Ramu Yadav"
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

      {/* Filter Tabs for Registered Staff */}
      <View style={styles.filterTabsRow}>
        {[
          { key: 'all', label: `सभी (${salesmen.length})` },
          { key: 'salesman', label: `⛽ सेल्समैन (${salesmen.filter(s => (s.staffType || 'salesman') === 'salesman').length})` },
          { key: 'watchman', label: `🛡️ चौकीदार (${salesmen.filter(s => s.staffType === 'watchman').length})` },
          { key: 'sweeper', label: `🧹 सफाईकर्मी (${salesmen.filter(s => s.staffType === 'sweeper').length})` }
        ].map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterTabPill, staffFilter === f.key && styles.filterTabPillActive]}
            onPress={() => setStaffFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterTabPillText, staffFilter === f.key && styles.filterTabPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Month Filter Section for Registered Staff */}
      <View style={styles.monthHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.registeredTitle}>
            Registered Staff ({filteredSalesmen.length})
          </Text>
          <Text style={styles.registeredSubtitle}>
            Attendance & Advances for {formatMonthLabel(selectedMonthKey)}
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
    const isSalesmanRole = (item.staffType || 'salesman') === 'salesman';
    const typeInfo = getStaffTypeDetails(item.staffType);
    const att = getStaffMonthlyAttendance(allSales, item.id, item.name, selectedMonthKey);
    const advTotal = salaryAdvances
      .filter(a => ((a.salesmanId === item.id) || (a.salesmanName && item.name && a.salesmanName.trim().toLowerCase() === item.name.trim().toLowerCase())) && (a.monthKey || getMonthKey()) === selectedMonthKey)
      .reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

    return (
      <View style={[styles.listItem, { borderLeftColor: typeInfo.color }]}>
        <View style={styles.listInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <Text style={styles.listName}>{item.name}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeInfo.bg, borderColor: typeInfo.borderColor }]}>
              <Text style={[styles.typeBadgeText, { color: typeInfo.color }]}>{typeInfo.badge}</Text>
            </View>
          </View>
          <Text style={styles.listPhone}>📞 {item.phone}</Text>
          
          <View style={styles.staffBadgeRow}>
            {isSalesmanRole ? (
              <View style={styles.staffAttBadge}>
                <Icon name="calendar-outline" size={11} color="#003C8F" style={{ marginRight: 3 }} />
                <Text style={styles.staffAttBadgeText}>{att.daysCount} Days Present</Text>
              </View>
            ) : (
              <View style={[styles.staffAttBadge, { backgroundColor: typeInfo.bg, borderColor: typeInfo.borderColor }]}>
                <Icon name={typeInfo.icon} size={11} color={typeInfo.color} style={{ marginRight: 3 }} />
                <Text style={[styles.staffAttBadgeText, { color: typeInfo.color }]}>{typeInfo.shortTitle} ड्यूटी</Text>
              </View>
            )}

            <View style={[styles.staffAdvBadge, advTotal > 0 ? styles.staffAdvBadgeActive : {}]}>
              <Icon name="wallet-outline" size={11} color={advTotal > 0 ? '#B45309' : '#64748B'} style={{ marginRight: 3 }} />
              <Text style={[styles.staffAdvBadgeText, advTotal > 0 ? { color: '#B45309', fontWeight: '800' } : {}]}>
                ₹{advTotal.toFixed(0)} Adv
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity 
          style={[styles.viewBtn, { backgroundColor: typeInfo.color }]} 
          onPress={() => openDetails(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.viewBtnText}>{isSalesmanRole ? 'Attendance' : 'हिसाब / Adv'}</Text>
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
          data={filteredSalesmen}
          keyExtractor={item => item.id}
          renderItem={renderSalesman}
          ListHeaderComponent={renderHeader()}
          contentContainerStyle={{ paddingBottom: 220 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyText}>No staff members found.</Text>}
        />
      )}

      <ScrollableModal
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{isEditing ? 'Edit Staff Details' : 'Staff Profile & Advances'}</Text>
          <TouchableOpacity onPress={() => {
            setModalVisible(false);
            setIsEditing(false);
            setShowDirectAdvanceModal(false);
          }}>
            <Icon name="close-circle" size={28} color="#d32f2f" />
          </TouchableOpacity>
        </View>

            {selectedSalesman && !isEditing && (() => {
              const staffTypeInfo = getStaffTypeDetails(selectedSalesman.staffType);
              const isSalesmanRole = (selectedSalesman.staffType || 'salesman') === 'salesman';
              const modalAtt = getStaffMonthlyAttendance(allSales, selectedSalesman.id, selectedSalesman.name, selectedMonthKey);
              const modalAdvances = salaryAdvances.filter(a => 
                ((a.salesmanId === selectedSalesman.id) || (a.salesmanName && selectedSalesman.name && a.salesmanName.trim().toLowerCase() === selectedSalesman.name.trim().toLowerCase())) && 
                (a.monthKey || getMonthKey()) === selectedMonthKey
              );
              modalAdvances.sort((a, b) => {
                const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
                const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
                return timeB - timeA;
              });
              const modalAdvTotal = modalAdvances.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);

              return (
                <View style={styles.modalContent}>
                  {/* Basic Details with Badge */}
                  <View style={styles.detailRow}>
                    <Icon name="person" size={18} color="#003C8F" />
                    <Text style={styles.detailLabel}>Name:</Text>
                    <Text style={styles.detailValue}>{selectedSalesman.name}</Text>
                    <View style={[styles.typeBadge, { backgroundColor: staffTypeInfo.bg, borderColor: staffTypeInfo.borderColor, marginLeft: 'auto' }]}>
                      <Text style={[styles.typeBadgeText, { color: staffTypeInfo.color }]}>{staffTypeInfo.badge}</Text>
                    </View>
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
                    {isSalesmanRole ? (
                      <>
                        <View style={styles.modalAttCard}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Icon name="calendar" size={14} color="#003C8F" />
                            <Text style={styles.modalAttCardLabel}> Days Present</Text>
                          </View>
                          <Text style={styles.modalAttCardVal}>{modalAtt.daysCount} Days</Text>
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
                      </>
                    ) : (
                      <View style={[styles.modalAdvCard, { flex: 1, backgroundColor: '#FFFBEB' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Icon name="wallet" size={16} color="#B45309" />
                            <Text style={[styles.modalAdvCardLabel, { fontSize: 13, fontWeight: '800' }]}> इस महीने कुल वेतन/एडवांस भुगतान</Text>
                          </View>
                          <View style={[styles.typeBadge, { backgroundColor: staffTypeInfo.bg, borderColor: staffTypeInfo.borderColor }]}>
                            <Text style={[styles.typeBadgeText, { color: staffTypeInfo.color }]}>{staffTypeInfo.shortTitle}</Text>
                          </View>
                        </View>
                        <Text style={[styles.modalAdvCardVal, { fontSize: 24, marginVertical: 4 }]}>₹{modalAdvTotal.toFixed(0)}</Text>
                        <Text style={styles.modalAdvCardSub}>
                          कुल {modalAdvances.length} बार में पैसा लिया गया ({formatMonthLabel(selectedMonthKey)})
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Direct Advance Button & Form for Admin */}
                  {!showDirectAdvanceModal ? (
                    <TouchableOpacity 
                      style={styles.directAdvanceToggleBtn}
                      onPress={() => setShowDirectAdvanceModal(true)}
                      activeOpacity={0.8}
                    >
                      <Icon name="add-circle" size={16} color="#92400E" style={{ marginRight: 5 }} />
                      <Text style={styles.directAdvanceToggleBtnText}>
                        + {selectedSalesman.name} को नया एडवांस / पैसा दें
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.directAdvanceBox}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.directAdvanceBoxTitle}>
                          💵 नया एडवांस भुगतान ({selectedSalesman.name})
                        </Text>
                        <TouchableOpacity onPress={() => setShowDirectAdvanceModal(false)}>
                          <Icon name="close" size={20} color="#92400E" />
                        </TouchableOpacity>
                      </View>
                      <CustomInput
                        placeholder="एडवांस राशि (₹) *"
                        value={advanceAmt}
                        onChangeText={setAdvanceAmt}
                        keyboardType="numeric"
                        leftIcon="cash-outline"
                      />
                      <CustomInput
                        placeholder="कारण / टिप्पणी (उदा: राशन, घर खर्च)"
                        value={advanceNotes}
                        onChangeText={setAdvanceNotes}
                        leftIcon="document-text-outline"
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <CustomButton
                          title="रद्द करें"
                          onPress={() => setShowDirectAdvanceModal(false)}
                          type="secondary"
                          style={{ flex: 1 }}
                        />
                        <CustomButton
                          title="जमा करें (Save)"
                          onPress={handleSaveDirectAdvance}
                          loading={savingAdvance}
                          type="primary"
                          style={{ flex: 1.5 }}
                        />
                      </View>
                    </View>
                  )}

                  {/* Scrollable Advance Breakdown ("kb kb ur kitna liye hain") */}
                  <ScrollView style={{ maxHeight: 220, marginTop: 10 }} showsVerticalScrollIndicator={false}>
                    {/* Salary Advance Breakdown */}
                    <View style={[styles.modalDatesContainer, { borderColor: '#FDE68A' }]}>
                      <View style={[styles.modalDatesHeader, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                        <Icon name="cash-outline" size={14} color="#B45309" style={{ marginRight: 4 }} />
                        <Text style={[styles.modalDatesTitle, { color: '#92400E' }]}>
                          कब-कब और कितना लिया (Total: ₹{modalAdvTotal.toFixed(0)})
                        </Text>
                      </View>
                      {modalAdvances.length === 0 ? (
                        <Text style={[styles.modalDatesEmpty, { color: '#92400E' }]}>
                          इस महीने में कोई एडवांस नहीं लिया गया है।
                        </Text>
                      ) : (
                        modalAdvances.map((adv, idx) => {
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
                        })
                      )}
                    </View>

                    {/* Salesman Attendance Dates List (Only for Salesman) */}
                    {isSalesmanRole && (
                      <View style={[styles.modalDatesContainer, { marginTop: 10 }]}>
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
                
                {/* Staff Role Selector in Edit Mode */}
                <Text style={styles.inputSectionLabel}>पद / Staff Role *</Text>
                <View style={styles.roleSelectorRow}>
                  {[
                    { key: 'salesman', label: 'सेल्समैन', icon: 'speedometer', badge: '⛽ Salesman' },
                    { key: 'watchman', label: 'चौकीदार', icon: 'shield-checkmark', badge: '🛡️ Watchman' },
                    { key: 'sweeper', label: 'सफाईकर्मी', icon: 'brush', badge: '🧹 Sweeper' }
                  ].map(r => (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.roleSelectPill, editStaffType === r.key && styles.roleSelectPillActive]}
                      onPress={() => setEditStaffType(r.key)}
                      activeOpacity={0.7}
                    >
                      <Icon 
                        name={r.icon} 
                        size={14} 
                        color={editStaffType === r.key ? '#fff' : '#003C8F'} 
                        style={{ marginRight: 4 }} 
                      />
                      <Text style={[styles.roleSelectPillText, editStaffType === r.key && styles.roleSelectPillTextActive]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

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
      </ScrollableModal>
      
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalScrollOverlay: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16, paddingVertical: 24 },
  modalContainer: { width: '100%', maxWidth: 500, backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
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
  actionBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 12 },

  // Role selector & badges
  inputSectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4
  },
  roleSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  roleSelectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  roleSelectPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  roleSelectPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#003C8F'
  },
  roleSelectPillTextActive: {
    color: '#FFFFFF'
  },
  filterTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10
  },
  filterTabPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  filterTabPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  filterTabPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  filterTabPillTextActive: {
    color: '#FFFFFF'
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  directAdvanceToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 10
  },
  directAdvanceToggleBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E'
  },
  directAdvanceBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    borderRadius: 10,
    marginTop: 10
  },
  directAdvanceBoxTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 8
  }
});

