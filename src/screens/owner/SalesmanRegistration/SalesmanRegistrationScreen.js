import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, FlatList, TouchableOpacity, Modal } from 'react-native';
import { setDoc, doc, collection, query, where, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import CustomInput from '../../../components/CustomInput';
import CustomButton from '../../../components/CustomButton';
import CustomAlert from '../../../components/CustomAlert';
import Toast from 'react-native-toast-message';
import Icon from '@expo/vector-icons/Ionicons';

export default function SalesmanRegistrationScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [salesmen, setSalesmen] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  
  const [selectedSalesman, setSelectedSalesman] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [updating, setUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSalesmen(list);
      setListLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleRegister = async () => {
    if (!name || !email || !phone) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    if (phone.length < 6) {
      Alert.alert('Error', 'Phone number must be at least 6 digits to be used as a password.');
      return;
    }

    setLoading(true);
    try {
      const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: phone.trim(), returnSecureToken: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error.message || 'Failed to create user');
      }

      const uid = data.localId;

      await setDoc(doc(db, 'users', uid), {
        uid: uid,
        name: name,
        email: email.trim(),
        phone: phone.trim(),
        role: 'salesman',
        createdAt: new Date()
      });

      Alert.alert('Success', 'Salesman registered successfully!');
      setName('');
      setEmail('');
      setPhone('');
    } catch (error) {
      console.error(error);
      Alert.alert('Registration Failed', error.message);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (item) => {
    setSelectedSalesman(item);
    setEditName(item.name);
    setEditEmail(item.email);
    setEditPhone(item.phone);
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleUpdateSalesman = async () => {
    if (!editName || !editEmail || !editPhone) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'All fields are required.' });
      return;
    }
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'users', selectedSalesman.id), {
        name: editName,
        email: editEmail.trim(),
        phone: editPhone.trim()
      });
      Toast.show({ type: 'success', text1: 'Success', text2: 'Salesman details updated!' });
      setIsEditing(false);
      
      // Update selectedSalesman locally to reflect changes immediately in the modal
      setSelectedSalesman({
        ...selectedSalesman,
        name: editName,
        email: editEmail.trim(),
        phone: editPhone.trim()
      });
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Error', text2: error.message });
    } finally {
      setUpdating(false);
    }
  };

  const renderHeader = () => (
    <View style={{ marginBottom: 20 }}>
      <Text style={styles.title}>Manage Staff</Text>
      <Text style={styles.subtitle}>Register new staff or view existing salesmen.</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Register New Salesman</Text>
        <CustomInput
          label="Full Name"
          placeholder="Enter Salesman Name"
          leftIcon="person-outline"
          value={name}
          onChangeText={setName}
        />
        <CustomInput
          label="Email Address"
          placeholder="Enter Email Address"
          leftIcon="mail-outline"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <CustomInput
          label="Phone Number (Password)"
          placeholder="Enter 10-digit Phone Number"
          leftIcon="call-outline"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <CustomButton 
          title="REGISTER SALESMAN" 
          onPress={handleRegister} 
          loading={loading}
          type="primary"
          style={{ marginTop: 10 }}
        />
      </View>

      <Text style={[styles.title, { marginTop: 30, fontSize: 20, textAlign: 'left' }]}>
        Registered Salesmen
      </Text>
    </View>
  );

  const renderSalesman = ({ item }) => (
    <View style={styles.listItem}>
      <View style={styles.listInfo}>
        <Text style={styles.listName}>{item.name}</Text>
        <Text style={styles.listPhone}>{item.phone}</Text>
      </View>
      <TouchableOpacity style={styles.viewBtn} onPress={() => openDetails(item)}>
        <Text style={styles.viewBtnText}>View</Text>
        <Icon name="chevron-forward" size={16} color="#fff" />
      </TouchableOpacity>
    </View>
  );

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
          ListEmptyComponent={<Text style={styles.emptyText}>No salesmen registered yet.</Text>}
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
              <Text style={styles.modalTitle}>{isEditing ? 'Edit Salesman' : 'Salesman Details'}</Text>
              <TouchableOpacity onPress={() => {
                setModalVisible(false);
                setIsEditing(false);
              }}>
                <Icon name="close-circle" size={28} color="#d32f2f" />
              </TouchableOpacity>
            </View>

            {selectedSalesman && !isEditing && (
              <View style={styles.modalContent}>
                <View style={styles.detailRow}>
                  <Icon name="person" size={20} color="#003C8F" />
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{selectedSalesman.name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Icon name="call" size={20} color="#2E7D32" />
                  <Text style={styles.detailLabel}>Phone:</Text>
                  <Text style={styles.detailValue}>{selectedSalesman.phone}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Icon name="mail" size={20} color="#FF6F00" />
                  <Text style={styles.detailLabel}>Email:</Text>
                  <Text style={styles.detailValue}>{selectedSalesman.email}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Icon name="calendar" size={20} color="#777" />
                  <Text style={styles.detailLabel}>Joined:</Text>
                  <Text style={styles.detailValue}>
                    {selectedSalesman.createdAt?.toDate ? selectedSalesman.createdAt.toDate().toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
                
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF6F00' }]} onPress={() => setIsEditing(true)}>
                    <Icon name="create-outline" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#d32f2f' }]} onPress={() => setAlertVisible(true)}>
                    <Icon name="trash-outline" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {selectedSalesman && isEditing && (
              <View style={styles.modalContent}>
                <CustomInput label="Full Name" value={editName} onChangeText={setEditName} />
                <CustomInput label="Phone Number" value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
                <CustomInput label="Email Address" value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" />
                
                <View style={styles.actionRow}>
                  <CustomButton 
                    title="CANCEL" 
                    onPress={() => setIsEditing(false)} 
                    type="secondary"
                    style={{ flex: 1, marginRight: 5 }}
                  />
                  <CustomButton 
                    title="SAVE" 
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
                title="CLOSE" 
                onPress={() => setModalVisible(false)} 
                type="secondary"
                style={{ marginTop: 20 }}
              />
            )}
          </View>
        </View>
      </Modal>
      
      <CustomAlert
        visible={alertVisible}
        title="Delete Salesman"
        message={`Are you sure you want to completely delete ${selectedSalesman?.name}? This action cannot be undone.`}
        isDestructive={true}
        cancelText="Cancel"
        confirmText="Delete"
        loading={isDeleting}
        onCancel={() => setAlertVisible(false)}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await deleteDoc(doc(db, 'users', selectedSalesman.id));
            Toast.show({ type: 'success', text1: 'Deleted', text2: `${selectedSalesman.name} has been removed.` });
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
  container: { flex: 1, padding: 20, backgroundColor: '#f5f7fa' },
  title: { fontSize: 24, fontWeight: '900', color: '#003C8F', textAlign: 'center', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  
  listItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, alignItems: 'center', elevation: 2, borderLeftWidth: 4, borderLeftColor: '#003C8F' },
  listInfo: { flex: 1 },
  listName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  listPhone: { fontSize: 13, color: '#666', marginTop: 4 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF6F00', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  viewBtnText: { color: '#fff', fontWeight: 'bold', marginRight: 5, fontSize: 12 },
  emptyText: { textAlign: 'center', color: '#888', fontStyle: 'italic', marginTop: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContainer: { width: '100%', backgroundColor: '#fff', borderRadius: 15, padding: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#003C8F' },
  modalContent: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  detailLabel: { fontSize: 14, color: '#777', width: 60, marginLeft: 10, fontWeight: '600' },
  detailValue: { fontSize: 16, fontWeight: 'bold', color: '#333', flex: 1 },
  actionRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#ddd' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, marginHorizontal: 10 },
  actionBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 5 }
});
