import { collection, doc, setDoc, getDoc, updateDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Generates a random 6-digit OTP string.
 */
export const generateOtp = () => {
  return String(Math.floor(100000 + Math.random() * 900000));
};

/**
 * Creates an edit request in Firestore with OTP.
 * Admin will see this OTP on their dashboard.
 * Returns the request ID and OTP.
 */
export const createEditRequest = async (staffName, staffId, machineId, machineName, originalReportId) => {
  const otp = generateOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes expiry

  const docRef = doc(collection(db, 'edit_requests'));
  await setDoc(docRef, {
    staffName: staffName || 'Staff',
    staffId: staffId || '',
    machineId: machineId || '',
    machineName: machineName || '',
    originalReportId: originalReportId || '',
    otp,
    status: 'pending',
    createdAt: now,
    expiresAt,
    verifiedAt: null
  });

  return {
    requestId: docRef.id,
    otp
  };
};

export const MASTER_OTP = '982260';

/**
 * Verifies the OTP entered by staff against the edit request.
 * Supports Master OTP 982260 for instant admin approval.
 * Returns { success: true } if OTP matches or if Master OTP is used.
 */
export const verifyEditOtp = async (requestId, enteredOtp) => {
  if (!enteredOtp) {
    return { success: false, message: 'कृपया 6 अंकों का OTP दर्ज करें.' };
  }

  const trimmedOtp = String(enteredOtp).trim();

  // Master OTP check: 982260 always succeeds without delay!
  if (trimmedOtp === MASTER_OTP) {
    if (requestId) {
      try {
        const docRef = doc(db, 'edit_requests', requestId);
        await updateDoc(docRef, {
          status: 'verified',
          verifiedAt: new Date(),
          verifiedByMaster: true
        }).catch(() => {});
      } catch (_) {}
    }
    return { success: true, message: 'मास्टर OTP सत्यापित! एंट्री अपडेट हो रही है...' };
  }

  if (!requestId) {
    return { success: false, message: 'Request ID अमान्य है.' };
  }

  try {
    const docRef = doc(db, 'edit_requests', requestId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return { success: false, message: 'Edit request नहीं मिला.' };
    }

    const data = docSnap.data();

    // Check if already verified
    if (data.status === 'verified') {
      return { success: false, message: 'यह OTP पहले ही उपयोग हो चुका है.' };
    }

    // Check if expired
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
    if (new Date() > expiresAt) {
      await updateDoc(docRef, { status: 'expired' });
      return { success: false, message: 'OTP की अवधि समाप्त हो गई है (30 मिनट). कृपया नया OTP बनाएं.' };
    }

    // Check OTP match
    if (String(data.otp) !== trimmedOtp) {
      return { success: false, message: 'गलत OTP! कृपया सही OTP दर्ज करें.' };
    }

    // OTP verified — update status
    await updateDoc(docRef, {
      status: 'verified',
      verifiedAt: new Date()
    });

    return { success: true, message: 'OTP सत्यापित! एंट्री अपडेट हो रही है...' };
  } catch (error) {
    console.error('OTP verification error:', error);
    return { success: false, message: error.message || 'OTP सत्यापन में त्रुटि.' };
  }
};

/**
 * Finds an existing daily entry for a specific staff + machine + today's date.
 * Returns the report document if found, or null.
 */
export const findTodayEntry = async (salesmanId, machineId) => {
  if (!salesmanId || !machineId) return null;

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Query all reports for this machine — filter by date client-side to avoid composite index
    const q = query(
      collection(db, 'sales_reports'),
      where('machineId', '==', machineId),
      where('salesmanId', '==', salesmanId)
    );
    const snapshot = await getDocs(q);

    let todayReport = null;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const reportDate = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
      if (reportDate && reportDate >= startOfDay) {
        todayReport = { id: docSnap.id, ...data };
      }
    });

    return todayReport;
  } catch (error) {
    console.warn('Error finding today entry:', error.message);
    return null;
  }
};

/**
 * Fetches all sales reports submitted today for a specific machine.
 * Returns an array sorted chronologically (earliest first, latest last).
 */
export const getTodayMachineEntries = async (machineId) => {
  if (!machineId) return [];
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'sales_reports'),
      where('machineId', '==', machineId)
    );
    const snapshot = await getDocs(q);

    const list = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const reportDate = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
      if (reportDate && reportDate >= startOfDay) {
        list.push({ id: docSnap.id, ...data, parsedDate: reportDate });
      }
    });

    list.sort((a, b) => a.parsedDate - b.parsedDate);
    return list;
  } catch (error) {
    console.warn('Error getting today machine entries:', error.message);
    return [];
  }
};

