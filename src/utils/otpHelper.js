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
 * Returns start and end Date objects for a given target date.
 */
export const getDayBounds = (targetDate = new Date()) => {
  const d = new Date(targetDate);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { startOfDay, endOfDay };
};

/**
 * Finds an existing daily entry for a specific staff + machine on a given date.
 * Returns the report document if found, or null.
 */
export const findEntryForDate = async (salesmanId, machineId, targetDate = new Date()) => {
  if (!salesmanId || !machineId) return null;

  try {
    const { startOfDay, endOfDay } = getDayBounds(targetDate);

    // Query all reports for this machine and salesman
    const q = query(
      collection(db, 'sales_reports'),
      where('machineId', '==', machineId),
      where('salesmanId', '==', salesmanId)
    );
    const snapshot = await getDocs(q);

    let matchReport = null;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const reportDate = data.timestamp?.toDate 
        ? data.timestamp.toDate() 
        : (data.entryDate?.toDate 
            ? data.entryDate.toDate() 
            : (data.timestamp ? new Date(data.timestamp) : (data.entryDate ? new Date(data.entryDate) : null)));
      if (reportDate && reportDate >= startOfDay && reportDate <= endOfDay) {
        matchReport = { id: docSnap.id, ...data };
      }
    });

    return matchReport;
  } catch (error) {
    console.warn('Error finding entry for date:', error.message);
    return null;
  }
};

/**
 * Backwards compatible findTodayEntry
 */
export const findTodayEntry = async (salesmanId, machineId) => {
  return findEntryForDate(salesmanId, machineId, new Date());
};

/**
 * Fetches all sales reports submitted on a specific date for a machine.
 * Returns an array sorted chronologically (earliest first, latest last).
 */
export const getMachineEntriesForDate = async (machineId, targetDate = new Date()) => {
  if (!machineId) return [];
  try {
    const { startOfDay, endOfDay } = getDayBounds(targetDate);

    const q = query(
      collection(db, 'sales_reports'),
      where('machineId', '==', machineId)
    );
    const snapshot = await getDocs(q);

    const list = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const reportDate = data.timestamp?.toDate 
        ? data.timestamp.toDate() 
        : (data.entryDate?.toDate 
            ? data.entryDate.toDate() 
            : (data.timestamp ? new Date(data.timestamp) : (data.entryDate ? new Date(data.entryDate) : null)));
      if (reportDate && reportDate >= startOfDay && reportDate <= endOfDay) {
        list.push({ id: docSnap.id, ...data, parsedDate: reportDate });
      }
    });

    list.sort((a, b) => a.parsedDate - b.parsedDate);
    return list;
  } catch (error) {
    console.warn('Error getting machine entries for date:', error.message);
    return [];
  }
};

/**
 * Backwards compatible getTodayMachineEntries
 */
export const getTodayMachineEntries = async (machineId) => {
  return getMachineEntriesForDate(machineId, new Date());
};

/**
 * Fetches all reports for a specific date, returning list of salesman IDs and machine IDs with submissions.
 */
export const getSubmittedReportsForDate = async (targetDate = new Date()) => {
  try {
    const { startOfDay, endOfDay } = getDayBounds(targetDate);

    const snapshot = await getDocs(collection(db, 'sales_reports'));
    const reportsForDay = [];
    const submittedSalesmanIds = new Set();
    const submittedMachineIds = new Set();

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const reportDate = data.timestamp?.toDate 
        ? data.timestamp.toDate() 
        : (data.entryDate?.toDate 
            ? data.entryDate.toDate() 
            : (data.timestamp ? new Date(data.timestamp) : (data.entryDate ? new Date(data.entryDate) : null)));
      if (reportDate && reportDate >= startOfDay && reportDate <= endOfDay) {
        reportsForDay.push({ id: docSnap.id, ...data });
        if (data.salesmanId) submittedSalesmanIds.add(data.salesmanId);
        if (data.machineId) submittedMachineIds.add(data.machineId);
      }
    });

    return {
      reports: reportsForDay,
      salesmanIds: Array.from(submittedSalesmanIds),
      machineIds: Array.from(submittedMachineIds)
    };
  } catch (error) {
    console.warn('Error getting submitted reports for date:', error.message);
    return { reports: [], salesmanIds: [], machineIds: [] };
  }
};

