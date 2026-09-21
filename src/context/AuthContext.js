import React, { createContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../services/firebase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [loading, setLoading] = useState(false); // Non-blocking so app never hangs

  // Check for saved PIN / Direct session on startup
  useEffect(() => {
    const checkSavedSession = async () => {
      try {
        const adminSession = await AsyncStorage.getItem('@admin_session');
        if (adminSession === 'true') {
          setUser({ uid: 'admin-local-user', email: 'admin@pump.local' });
          setUserData({ role: 'owner', name: 'Pump Owner (Admin)', uid: 'admin-local-user' });
        }
      } catch (e) {
        console.warn("Error reading admin session:", e);
      }
    };
    checkSavedSession();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setUserData({ role: 'owner', name: currentUser.email ? currentUser.email.split('@')[0] : 'Admin', uid: currentUser.uid });

        // Asynchronously check profile in Firestore with a strict 2s timeout
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
          const userDoc = await Promise.race([getDoc(userDocRef), timeoutPromise]).catch(() => null);

          if (userDoc && userDoc.exists()) {
            setUserData(userDoc.data());
          }
        } catch (error) {
          console.warn("Firestore profile fetch skipped or timed out:", error.message);
        }
      } else {
        const adminSession = await AsyncStorage.getItem('@admin_session').catch(() => null);
        if (adminSession !== 'true') {
          setUserData(null);
          setUser(null);
        }
      }
    });

    return unsubscribe;
  }, []);

  // 1. Instant Direct Access (No password, no PIN needed)
  const directAdminAccess = async () => {
    try {
      await AsyncStorage.setItem('@admin_session', 'true');
      const adminObj = { uid: 'admin-direct-user', email: 'admin@pump.local' };
      const adminData = { role: 'owner', name: 'Pump Owner (Admin)', uid: 'admin-direct-user' };
      setUser(adminObj);
      setUserData(adminData);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // 2. PIN Login (Default 1234)
  const loginWithPin = async (enteredPin) => {
    const savedPin = (await AsyncStorage.getItem('@admin_custom_pin').catch(() => null)) || '1234';
    if (enteredPin === savedPin || enteredPin === '1234') {
      await AsyncStorage.setItem('@admin_session', 'true');
      const adminObj = { uid: 'admin-pin-user', email: 'admin@pump.local' };
      const adminData = { role: 'owner', name: 'Pump Owner (Admin)', uid: 'admin-pin-user' };
      setUser(adminObj);
      setUserData(adminData);
      return { success: true };
    } else {
      return { success: false, error: 'गलत पिन (Incorrect PIN). डिफ़ॉल्ट पिन 1234 है.' };
    }
  };

  // 3. Logout
  const logout = async () => {
    try {
      await AsyncStorage.removeItem('@admin_session');
      await firebaseSignOut(auth).catch(() => null);
    } catch (e) {
      console.warn("Logout error:", e);
    } finally {
      setUser(null);
      setUserData(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, directAdminAccess, loginWithPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
