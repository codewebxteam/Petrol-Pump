import React, { useState, useEffect, useContext } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView, 
  ActivityIndicator
} from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';
import { updatePassword } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../../../services/firebase';
import { useNavigation } from '@react-navigation/native';
import { AuthContext } from '../../../context/AuthContext';
import Toast from 'react-native-toast-message';

export default function AdminManagement() {
  const navigation = useNavigation();
  const { user, userData, logout } = useContext(AuthContext) || {};
  
  // Change Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Existing Admins List State
  const [adminList, setAdminList] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    // Listen to all admin accounts from Firestore
    const q = query(collection(db, 'users'), where('role', '==', 'owner'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setAdminList(list);
      setLoadingAdmins(false);
    }, (err) => {
      console.warn("Error fetching admin accounts:", err);
      setLoadingAdmins(false);
    });

    return () => unsubscribe();
  }, []);

  // 1. Change Password Handler for Current Admin
  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Invalid Password', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New password and confirm password must match.');
      return;
    }

    const currentAuthUser = auth.currentUser;
    if (!currentAuthUser) {
      Alert.alert('Authentication Required', 'Please sign in with your email and password first to change password.');
      return;
    }

    setChangingPass(true);
    try {
      await updatePassword(currentAuthUser, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      Toast.show({
        type: 'success',
        text1: 'Password Updated',
        text2: 'Your admin password has been successfully updated.'
      });
    } catch (err) {
      console.error("Change password error:", err);
      if (err.code === 'auth/requires-recent-login') {
        Alert.alert(
          'Security Re-authentication Required',
          'For security reasons, please log out and sign in again before updating your password.'
        );
      } else {
        Alert.alert('Error', err.message || 'Unable to update password.');
      }
    } finally {
      setChangingPass(false);
    }
  };

  // 2. Delete Admin Handler (Safety Rule: At least 2 admins must exist)
  const handleDeleteAdmin = (adm) => {
    // Safety check: Cannot delete if only 1 admin exists
    if (adminList.length <= 1) {
      Alert.alert(
        'Cannot Delete Admin',
        'At least one administrator account must always remain active. You must have at least 2 registered admins before you can delete one.'
      );
      return;
    }

    const isCurrentAdmin = auth.currentUser?.email && adm.email && (auth.currentUser.email.toLowerCase() === adm.email.toLowerCase());

    Alert.alert(
      'Confirm Admin Deletion',
      isCurrentAdmin
        ? `⚠️ Warning: You are about to delete your currently logged-in admin account (${adm.email}). Are you sure you want to proceed?`
        : `Are you sure you want to permanently delete administrator "${adm.name || adm.email}" (${adm.email})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(adm.id);
            try {
              await deleteDoc(doc(db, 'users', adm.id));
              Toast.show({
                type: 'success',
                text1: 'Admin Account Deleted',
                text2: `Admin (${adm.email}) has been removed successfully.`
              });
            } catch (err) {
              console.error("Error deleting admin account:", err);
              Alert.alert('Delete Failed', err.message || 'Could not delete admin account.');
            } finally {
              setDeletingId(null);
            }
          }
        }
      ]
    );
  };

  // 5. Logout Handler
  const handleLogoutPress = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out of the Admin Panel?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              if (logout) await logout();
              navigation.reset({
                index: 0,
                routes: [{ name: 'StaffApp' }]
              });
            } catch (err) {
              console.error("Logout error:", err);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.scrollContent} 
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Top Banner */}
      <View style={styles.topCard}>
        <View style={styles.bannerRow}>
          <View style={styles.bannerIconWrap}>
            <Icon name="shield-checkmark" size={24} color="#003C8F" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.bannerTitle}>Admin Security & Password</Text>
            <Text style={styles.bannerSub}>
              Change administrator password and manage active admin accounts
            </Text>
          </View>
        </View>

        <View style={styles.currentAdminBadge}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <View style={styles.onlineDot} />
            <Text style={styles.currentAdminText} numberOfLines={1}>
              Logged In: <Text style={{ fontWeight: 'bold' }}>{auth.currentUser?.email || user?.email || userData?.name || 'Owner'}</Text>
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.topLogoutPill}
            onPress={handleLogoutPress}
            activeOpacity={0.8}
          >
            <Icon name="log-out-outline" size={14} color="#DC2626" style={{ marginRight: 4 }} />
            <Text style={styles.topLogoutPillText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Section 1: Change My Password */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Icon name="key" size={18} color="#D97706" style={{ marginRight: 6 }} />
          <Text style={styles.sectionTitle}>Change Current Password</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Update the password for your currently logged-in admin account:
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>New Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.textInput, { flex: 1, borderWidth: 0, marginBottom: 0 }]}
              placeholder="Min. 6 characters"
              secureTextEntry={!showNewPass}
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TouchableOpacity 
              style={styles.eyeBtn}
              onPress={() => setShowNewPass(!showNewPass)}
            >
              <Icon name={showNewPass ? "eye-off-outline" : "eye-outline"} size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Confirm New Password</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Re-enter new password"
            secureTextEntry={!showNewPass}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        <TouchableOpacity 
          style={[styles.actionBtnPrimary, { backgroundColor: '#D97706' }]} 
          onPress={handleChangePassword}
          disabled={changingPass}
          activeOpacity={0.8}
        >
          {changingPass ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="save-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnText}>UPDATE PASSWORD</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Section 2: Existing Admins List */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Icon name="people" size={18} color="#475569" style={{ marginRight: 6 }} />
          <Text style={styles.sectionTitle}>Active Admin Accounts</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{adminList.length} Active</Text>
          </View>
        </View>

        {adminList.length <= 1 && (
          <Text style={styles.minAdminNote}>
            ℹ️ Note: At least 2 admins are required to enable account deletion.
          </Text>
        )}

        {loadingAdmins ? (
          <ActivityIndicator size="small" color="#003C8F" style={{ marginVertical: 15 }} />
        ) : adminList.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No registered admin accounts found.</Text>
          </View>
        ) : (
          adminList.map((adm, idx) => (
            <View key={adm.id || idx} style={styles.adminItemRow}>
              <View style={styles.adminAvatarCircle}>
                <Text style={styles.adminAvatarLetter}>
                  {(adm.name || adm.email || 'A').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.adminItemName}>{adm.name || 'Admin User'}</Text>
                <Text style={styles.adminItemEmail}>{adm.email}</Text>
              </View>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>ADMIN</Text>
              </View>
              <TouchableOpacity 
                style={[styles.deleteAdminBtn, adminList.length <= 1 && styles.deleteAdminBtnDisabled]}
                onPress={() => handleDeleteAdmin(adm)}
                disabled={deletingId === adm.id}
                activeOpacity={0.7}
              >
                {deletingId === adm.id ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <Icon 
                    name="trash-outline" 
                    size={17} 
                    color={adminList.length <= 1 ? "#94A3B8" : "#DC2626"} 
                  />
                )}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Section 3: Session & Logout */}
      <View style={[styles.sectionCard, { borderColor: '#FEE2E2', backgroundColor: '#FFFDFD' }]}>
        <View style={styles.sectionHeaderRow}>
          <Icon name="log-out-outline" size={18} color="#DC2626" style={{ marginRight: 6 }} />
          <Text style={[styles.sectionTitle, { color: '#DC2626' }]}>Admin Logout</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Safely sign out from the Administrator session and switch back to the Staff interface:
        </Text>

        <TouchableOpacity 
          style={styles.logoutBtn}
          onPress={handleLogoutPress}
          activeOpacity={0.8}
        >
          <Icon name="log-out-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.logoutBtnText}>LOG OUT OF ADMIN PANEL</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 15, paddingBottom: 220 },
  topCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    elevation: 2
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center' },
  bannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  bannerTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  bannerSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  currentAdminBadge: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6
  },
  currentAdminText: { fontSize: 12, color: '#334155' },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    elevation: 1
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 18
  },
  inputGroup: {
    marginBottom: 10
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0F172A'
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#003C8F',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 6
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold'
  },

  adminItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  adminAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#003C8F',
    justifyContent: 'center',
    alignItems: 'center'
  },
  adminAvatarLetter: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  adminItemName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  adminItemEmail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1
  },
  roleBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#003C8F'
  },
  emptyWrap: {
    paddingVertical: 15,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 12,
    color: '#94A3B8'
  },
  countBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 'auto'
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#003C8F'
  },
  minAdminNote: {
    fontSize: 11,
    color: '#64748B',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8
  },
  deleteAdminBtn: {
    padding: 7,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center'
  },
  deleteAdminBtnDisabled: {
    backgroundColor: '#F1F5F9'
  },
  topLogoutPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA'
  },
  topLogoutPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626'
  },
  logoutBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 6
  },
  logoutBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold'
  }
});
