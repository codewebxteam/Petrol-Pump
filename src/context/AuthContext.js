import React, { createContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [loading, setLoading] = useState(false); // Non-blocking so app never hangs

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
        setUserData(null);
        setUser(null);
      }
    });

    return unsubscribe;
  }, []);

  // Logout
  const logout = async () => {
    try {
      await firebaseSignOut(auth).catch(() => null);
    } catch (e) {
      console.warn("Logout error:", e);
    } finally {
      setUser(null);
      setUserData(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
