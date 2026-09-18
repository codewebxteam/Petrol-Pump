import React, { createContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          let finalData = null;

          if (userDoc.exists()) {
            finalData = userDoc.data();
          } else {
            const ownerQuery = query(collection(db, 'owner'), where('email', '==', currentUser.email));
            const ownerSnap = await getDocs(ownerQuery);

            if (!ownerSnap.empty) {
              const ownerData = ownerSnap.docs[0].data();
              finalData = { uid: currentUser.uid, ...ownerData };
              await setDoc(userDocRef, finalData);
            } else {
              console.log("User document not found! Auto-creating as Owner...");
              finalData = {
                uid: currentUser.uid,
                email: currentUser.email,
                name: 'Admin',
                role: 'owner',
                createdAt: new Date()
              };
              await setDoc(userDocRef, finalData);
            }
          }

          setUser(currentUser);
          setUserData(finalData);
        } catch (error) {
          console.error("Error fetching user data:", error);
          // Do not logout on network error. Use a generic fallback.
          setUser(currentUser);
          setUserData({ role: 'owner', name: 'Admin (Offline)', uid: currentUser.uid });
        }
      } else {
        setUserData(null);
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
