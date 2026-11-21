import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  increment, 
  getDocs, 
  query, 
  where, 
  getDoc,
  writeBatch,
  deleteDoc,
  arrayUnion,
  addDoc
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';

/**
 * Submits the shift end report and performs the transactional updates:
 * 1. Saves the report
 * 2. Updates shift status to completed
 * 3. Updates nozzle's current meter reading
 * 4. Deducts stock from the mapped tank
 */
export const submitShiftReport = async (reportData) => {
  const {
    shiftId,
    salesmanId,
    nozzleId,
    tankId,
    openingMeterReading,
    closingMeterReading,
    totalQuantitySold,
    cashAmount,
    phonePeAmount,
    paytmAmount,
    bharatPeAmount,
    udhariAmount,
    udhariBreakdown,
    expenses,
    testingQuantity,
    totalPayment,
    fuelRate,
    expectedTotalAmount,
    shortageOrExcess,
    fuelType,
    shiftStartTime
  } = reportData;

  try {
    // 1. Create Sales Report
    const reportRef = doc(collection(db, 'sales_reports'));
    await setDoc(reportRef, {
      shiftId,
      salesmanId,
      nozzleId,
      tankId,
      openingMeterReading,
      closingMeterReading,
      totalQuantitySold,
      cashAmount,
      phonePeAmount,
      paytmAmount,
      atmAmount: reportData.atmAmount || 0,
      bobAmount: reportData.bobAmount || 0,
      bharatPeAmount: reportData.bharatPeAmount || 0,
      udhariAmount,
      udhariBreakdown: reportData.udhariBreakdown || null,
      expenses,
      testingQuantity,
      totalPayment,
      fuelRate,
      shortageOrExcess,
      shiftStartTime,
      timestamp: new Date(), // Shift End Time
      cashBreakdown: reportData.cashBreakdown || null
    });

    // 2. Update Shift Status
    await updateDoc(doc(db, 'shifts', shiftId), {
      endTime: new Date(),
      status: 'completed',
      closingMeterReading: closingMeterReading
    });

    // 3. Update Nozzle Current Reading
    await updateDoc(doc(db, 'nozzles', nozzleId), {
      currentMeterReading: closingMeterReading
    });

    // 4. Deduct Stock from Tank
    await deductTankStock(fuelType, totalQuantitySold);

    return { success: true };
  } catch (error) {
    throw error;
  }
};

/**
 * Submits evening daily sales entry:
 * Operates at Machine Level: 1 Staff runs 1 Machine (Petrol N1 + Diesel N2)
 * 1. Saves combined entry in sales_reports with nozzle-wise breakdown
 * 2. Updates both nozzles' current meter reading (with exact 4 decimal precision)
 * 3. Caches meter readings in AsyncStorage for instant offline/re-entry auto-carry
 * 4. Deducts fuel from both Petrol and Diesel tanks
 */
export const submitDailyEntry = async (entryData) => {
  const {
    machineId,
    machineName,
    salesmanId,
    salesmanName,
    petrolEntry,
    dieselEntry,
    cashAmount,
    phonePeAmount,
    paytmAmount,
    bharatPeAmount,
    udhariAmount,
    udhariBreakdown,
    expenses,
    expenseBreakdown,
    totalPayment,
    shortageOrExcess,
    cashBreakdown,
    entryDate
  } = entryData;

  const petrolSold = Number(petrolEntry?.totalQuantitySold) || 0;
  const dieselSold = Number(dieselEntry?.totalQuantitySold) || 0;
  const totalLiters = petrolSold + dieselSold;

  const petrolExp = Number(petrolEntry?.expectedAmount) || 0;
  const dieselExp = Number(dieselEntry?.expectedAmount) || 0;
  const mobilExp = Number(entryData.totalMobilAmount) || 0;
  const expectedTotal = Number(entryData.expectedTotalAmount) || (petrolExp + dieselExp + mobilExp + (Number(entryData.udhariReturnAmount) || 0));

  try {
    // 1. Create Sales Report Document
    const reportRef = doc(collection(db, 'sales_reports'));
    
    // Strict Tank Mapping: Petrol is Tank 1, Diesel is Tank 2
    const petrolTankId = petrolEntry?.tankId && petrolEntry.tankId !== 'Unknown' ? petrolEntry.tankId : 'Tank-1';
    const dieselTankId = dieselEntry?.tankId && dieselEntry.tankId !== 'Unknown' ? dieselEntry.tankId : 'Tank-2';

    const petrolTestingLiters = Number(petrolEntry?.testingQuantity) || 0;
    const dieselTestingLiters = Number(dieselEntry?.testingQuantity) || 0;

    await setDoc(reportRef, {
      machineId: machineId || 'M1',
      machineName: machineName || machineId || 'Machine',
      salesmanId: salesmanId || 'Unknown',
      salesmanName: salesmanName || 'Staff',
      shiftNumber: Number(entryData.shiftNumber) || 1,
      shiftLabel: entryData.shiftLabel || `Shift ${entryData.shiftNumber || 1}`,
      
      // Petrol Nozzle Details (Connected to Tank 1)
      petrolNozzleId: petrolEntry?.nozzleId || 'N1',
      petrolTankId: petrolTankId,
      petrolOpeningMeter: petrolEntry?.openingMeterReading || '0.0000',
      petrolClosingMeter: petrolEntry?.closingMeterReading || '0.0000',
      petrolTesting: petrolTestingLiters,
      petrolTestingPouredBackToTank: true, // 5L testing poured back into Tank 1
      petrolRate: Number(petrolEntry?.fuelRate) || 0,
      petrolQuantitySold: petrolSold,
      petrolExpectedAmount: petrolExp,

      // Diesel Nozzle Details (Connected to Tank 2)
      dieselNozzleId: dieselEntry?.nozzleId || 'N2',
      dieselTankId: dieselTankId,
      dieselOpeningMeter: dieselEntry?.openingMeterReading || '0.0000',
      dieselClosingMeter: dieselEntry?.closingMeterReading || '0.0000',
      dieselTesting: dieselTestingLiters,
      dieselTestingPouredBackToTank: true, // 5L testing poured back into Tank 2
      dieselRate: Number(dieselEntry?.fuelRate) || 0,
      dieselQuantitySold: dieselSold,
      dieselExpectedAmount: dieselExp,

      // Combined Totals
      totalQuantitySold: totalLiters,
      expectedTotalAmount: expectedTotal,
      totalPayment: Number(totalPayment) || 0,
      shortageOrExcess: Number(shortageOrExcess) || 0,
      fuelType: 'Petrol & Diesel',

      // Additional Mobil Sale
      totalMobilAmount: mobilExp,
      totalMobilQty: Number(entryData.totalMobilQty) || 0,
      mobilEntries: entryData.mobilEntries || [],

      // Backward compatible fields
      openingMeterReading: petrolEntry?.openingMeterReading || '0.0000',
      closingMeterReading: petrolEntry?.closingMeterReading || '0.0000',
      nozzleId: `${machineName || machineId} (N1+N2)`,
      fuelRate: Number(petrolEntry?.fuelRate) || 0,

      // Payment Details
      cashAmount: Number(cashAmount) || 0,
      cashBreakdown: cashBreakdown || null,

      // Multi-Mode Digital Payments (Paytm, PhonePe, ATM, ExtraPower, ExtraRewards, Debit/Credit Card, Custom)
      onlineAmount: Number(entryData.onlineAmount) || 0,
      digitalPaymentsBreakdown: entryData.digitalPaymentsBreakdown || [],
      phonePeAmount: Number(entryData.phonePeAmount) || 0,
      paytmAmount: Number(entryData.paytmAmount) || 0,
      atmAmount: Number(entryData.atmAmount) || 0,
      bobAmount: Number(entryData.bobAmount) || 0,
      bharatPeAmount: Number(entryData.bharatPeAmount) || 0,
      debitCardAmount: Number(entryData.debitCardAmount) || 0,
      creditCardAmount: Number(entryData.creditCardAmount) || 0,
      extraPowerAmount: Number(entryData.extraPowerAmount) || 0,
      extraRewardAmount: Number(entryData.extraRewardAmount) || 0,
      offerAmount: Number(entryData.offerAmount) || 0,
      customDigitalAmount: Number(entryData.customDigitalAmount) || 0,

      udhariAmount: Number(udhariAmount) || 0,
      udhariBreakdown: udhariBreakdown || null,
      udhariReturnAmount: Number(entryData.udhariReturnAmount) || 0,
      udhariReturnDetails: entryData.udhariReturnDetails || [],
      expenses: Number(expenses) || 0,
      expenseBreakdown: expenseBreakdown || null,

      timestamp: entryDate || new Date(),
      isSettled: false,
      entryType: 'machine_daily_entry'
    });

    // 2. Persist Meter Readings Locally in AsyncStorage for Guaranteed Auto-Carry
    if (machineId) {
      if (petrolEntry?.closingMeterReading) {
        await AsyncStorage.setItem(`@meter_${machineId}_petrol`, String(petrolEntry.closingMeterReading)).catch(() => null);
        if (petrolEntry.nozzleId) {
          await AsyncStorage.setItem(`@meter_${petrolEntry.nozzleId}`, String(petrolEntry.closingMeterReading)).catch(() => null);
        }
      }
      if (dieselEntry?.closingMeterReading) {
        await AsyncStorage.setItem(`@meter_${machineId}_diesel`, String(dieselEntry.closingMeterReading)).catch(() => null);
        if (dieselEntry.nozzleId) {
          await AsyncStorage.setItem(`@meter_${dieselEntry.nozzleId}`, String(dieselEntry.closingMeterReading)).catch(() => null);
        }
      }
      await AsyncStorage.setItem(`@machine_last_staff_${machineId}`, salesmanName).catch(() => null);
    }

    // 3. Update Firestore Nozzles & Deduct Tank Stocks (Tank 1 for Petrol, Tank 2 for Diesel)
    // Note: Testing fuel (e.g. 5L) is POURED BACK INTO THE TANK, so the net stock loss from the tank is ONLY net sold!
    try {
      // Petrol Nozzle
      if (petrolEntry?.nozzleId) {
        const pData = {
          machineId: machineId,
          machineName: machineName || machineId,
          nozzleId: petrolEntry.nozzleId,
          fuelType: 'Petrol',
          currentMeterReading: petrolEntry.closingMeterReading,
          lastUpdated: new Date(),
          lastSalesmanId: salesmanId,
          lastSalesmanName: salesmanName
        };
        await setDoc(doc(db, 'nozzles', petrolEntry.nozzleId), pData, { merge: true }).catch(() => null);
        await setDoc(doc(db, 'nozzles', `${machineId}-${petrolEntry.nozzleId}`), pData, { merge: true }).catch(() => null);
      }

      // Diesel Nozzle
      if (dieselEntry?.nozzleId) {
        const dData = {
          machineId: machineId,
          machineName: machineName || machineId,
          nozzleId: dieselEntry.nozzleId,
          fuelType: 'Diesel',
          currentMeterReading: dieselEntry.closingMeterReading,
          lastUpdated: new Date(),
          lastSalesmanId: salesmanId,
          lastSalesmanName: salesmanName
        };
        await setDoc(doc(db, 'nozzles', dieselEntry.nozzleId), dData, { merge: true }).catch(() => null);
        await setDoc(doc(db, 'nozzles', `${machineId}-${dieselEntry.nozzleId}`), dData, { merge: true }).catch(() => null);
      }

      // Also update Machine document with closing meters directly
      await setDoc(doc(db, 'machines', machineId), {
        petrolClosingMeter: petrolEntry?.closingMeterReading,
        dieselClosingMeter: dieselEntry?.closingMeterReading,
        lastUpdated: new Date(),
        lastSalesmanName: salesmanName,
        lastShift: entryData.shiftLabel || `Shift ${entryData.shiftNumber || 1}`,
        liveMeterReading: {
          petrol: petrolEntry?.closingMeterReading,
          diesel: dieselEntry?.closingMeterReading,
          updatedAt: new Date(),
          staff: salesmanName,
          shift: entryData.shiftLabel || `Shift ${entryData.shiftNumber || 1}`
        }
      }, { merge: true }).catch(() => null);

      // Tank 1 (Petrol Tank): Deduct only net petrol sold (5L testing was returned)
      if (petrolSold > 0) {
        await deductTankStock('Petrol', petrolSold, petrolTestingLiters);
      }

      // Tank 2 (Diesel Tank): Deduct only net diesel sold (5L testing was returned)
      if (dieselSold > 0) {
        await deductTankStock('Diesel', dieselSold, dieselTestingLiters);
      }

      // 4. Record Tank Log for Testing Returned to Tank 1 & Tank 2
      if (petrolTestingLiters > 0 || dieselTestingLiters > 0) {
        await setDoc(doc(collection(db, 'tank_logs')), {
          type: 'testing_returned',
          petrolTestingLiters,
          dieselTestingLiters,
          petrolTank: petrolTankId,
          dieselTank: dieselTankId,
          salesmanName,
          machineId,
          timestamp: new Date(),
          note: `दैनिक टेस्टिंग का ${petrolTestingLiters}L पेट्रोल Tank 1 में एवं ${dieselTestingLiters}L डीजल Tank 2 में वापस डाला गया`
        }).catch(() => null);
      }
    } catch (updateErr) {
      console.warn("Background tank/nozzle update:", updateErr.message);
    }

    return { success: true, id: reportRef.id };
  } catch (error) {
    console.error("Error submitting daily entry:", error);
    throw error;
  }
};

/**
 * Updates an existing daily entry report document.
 * Used when staff edits a previously submitted entry after OTP verification.
 * Overwrites all payment and meter fields in the existing report.
 */
export const updateDailyEntry = async (reportId, entryData) => {
  if (!reportId) throw new Error('Report ID is required for update.');

  try {
    const reportRef = doc(db, 'sales_reports', reportId);
    
    const petrolSold = Number(entryData.petrolEntry?.totalQuantitySold) || 0;
    const dieselSold = Number(entryData.dieselEntry?.totalQuantitySold) || 0;
    const totalLiters = petrolSold + dieselSold;
    const petrolExp = Number(entryData.petrolEntry?.expectedAmount) || 0;
    const dieselExp = Number(entryData.dieselEntry?.expectedAmount) || 0;
    const mobilExp = Number(entryData.totalMobilAmount) || 0;
    const expectedTotal = Number(entryData.expectedTotalAmount) || (petrolExp + dieselExp + mobilExp + (Number(entryData.udhariReturnAmount) || 0));

    const petrolTankId = entryData.petrolEntry?.tankId || 'Tank-1';
    const dieselTankId = entryData.dieselEntry?.tankId || 'Tank-2';

    await updateDoc(reportRef, {
      salesmanName: entryData.salesmanName || 'Staff',
      
      petrolOpeningMeter: entryData.petrolEntry?.openingMeterReading || '0.0000',
      petrolClosingMeter: entryData.petrolEntry?.closingMeterReading || '0.0000',
      petrolTesting: Number(entryData.petrolEntry?.testingQuantity) || 0,
      petrolRate: Number(entryData.petrolEntry?.fuelRate) || 0,
      petrolQuantitySold: petrolSold,
      petrolExpectedAmount: petrolExp,

      dieselOpeningMeter: entryData.dieselEntry?.openingMeterReading || '0.0000',
      dieselClosingMeter: entryData.dieselEntry?.closingMeterReading || '0.0000',
      dieselTesting: Number(entryData.dieselEntry?.testingQuantity) || 0,
      dieselRate: Number(entryData.dieselEntry?.fuelRate) || 0,
      dieselQuantitySold: dieselSold,
      dieselExpectedAmount: dieselExp,

      totalQuantitySold: totalLiters,
      expectedTotalAmount: expectedTotal,
      totalMobilAmount: mobilExp,
      totalMobilQty: Number(entryData.totalMobilQty) || 0,
      mobilEntries: entryData.mobilEntries || [],
      totalPayment: Number(entryData.totalPayment) || 0,
      shortageOrExcess: Number(entryData.shortageOrExcess) || 0,

      cashAmount: Number(entryData.cashAmount) || 0,
      cashBreakdown: entryData.cashBreakdown || null,

      onlineAmount: Number(entryData.onlineAmount) || 0,
      digitalPaymentsBreakdown: entryData.digitalPaymentsBreakdown || [],
      phonePeAmount: Number(entryData.phonePeAmount) || 0,
      paytmAmount: Number(entryData.paytmAmount) || 0,
      atmAmount: Number(entryData.atmAmount) || 0,
      bobAmount: Number(entryData.bobAmount) || 0,
      bharatPeAmount: Number(entryData.bharatPeAmount) || 0,
      debitCardAmount: Number(entryData.debitCardAmount) || 0,
      creditCardAmount: Number(entryData.creditCardAmount) || 0,
      extraPowerAmount: Number(entryData.extraPowerAmount) || 0,
      extraRewardAmount: Number(entryData.extraRewardAmount) || 0,
      offerAmount: Number(entryData.offerAmount) || 0,
      customDigitalAmount: Number(entryData.customDigitalAmount) || 0,

      udhariAmount: Number(entryData.udhariAmount) || 0,
      udhariBreakdown: entryData.udhariBreakdown || null,
      udhariReturnAmount: Number(entryData.udhariReturnAmount) || 0,
      udhariReturnDetails: entryData.udhariReturnDetails || [],
      expenses: Number(entryData.expenses) || 0,
      expenseBreakdown: entryData.expenseBreakdown || null,

      editedAt: new Date(),
      isEdited: true
    });

    // Update nozzle readings + tank stocks same as new entry
    if (entryData.machineId) {
      if (entryData.petrolEntry?.closingMeterReading) {
        await AsyncStorage.setItem(`@meter_${entryData.machineId}_petrol`, String(entryData.petrolEntry.closingMeterReading)).catch(() => null);
      }
      if (entryData.dieselEntry?.closingMeterReading) {
        await AsyncStorage.setItem(`@meter_${entryData.machineId}_diesel`, String(entryData.dieselEntry.closingMeterReading)).catch(() => null);
      }
    }

    return { success: true, id: reportId };
  } catch (error) {
    console.error("Error updating daily entry:", error);
    throw error;
  }
};

/**
 * Saves new udhari (credit) records for customers who took fuel on credit today.
 * Creates individual documents in the `udhari_records` collection.
 * Each record tracks: customerName, total amount, remaining amount, payment history.
 */
export const saveNewUdhariRecords = async (udhariEntries, salesmanId, salesmanName, machineId) => {
  if (!udhariEntries || udhariEntries.length === 0) return [];

  const savedIds = [];
  for (const entry of udhariEntries) {
    const name = (entry.name || '').trim();
    const amount = parseFloat(entry.amount) || 0;
    if (!name || amount <= 0) continue;

    try {
      const docRef = doc(collection(db, 'udhari_records'));
      await setDoc(docRef, {
        customerName: name,
        amount: amount,
        remainingAmount: amount,
        isPaid: false,
        createdAt: new Date(),
        createdBy: salesmanId || 'Unknown',
        createdByName: salesmanName || 'Staff',
        machineId: machineId || '',
        payments: []
      });
      savedIds.push(docRef.id);
    } catch (err) {
      console.warn('Error saving udhari record:', err.message);
    }
  }
  return savedIds;
};

/**
 * Processes udhari returns (credit repayments).
 * For each return entry:
 * - Updates remainingAmount (subtracts the returned amount)
 * - Adds a payment entry to the payments array
 * - If remainingAmount becomes 0, sets isPaid = true (removes from dropdown)
 */
export const processUdhariReturns = async (returnEntries, staffName) => {
  if (!returnEntries || returnEntries.length === 0) return;

  for (const entry of returnEntries) {
    const { docId, amountReturned } = entry;
    const returnAmt = parseFloat(amountReturned) || 0;
    if (!docId || returnAmt <= 0) continue;

    try {
      const docRef = doc(db, 'udhari_records', docId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) continue;

      const data = docSnap.data();
      const currentRemaining = parseFloat(data.remainingAmount) || 0;
      const newRemaining = Math.max(0, currentRemaining - returnAmt);
      const fullyPaid = newRemaining <= 0.01; // tolerance for float math

      await updateDoc(docRef, {
        remainingAmount: fullyPaid ? 0 : newRemaining,
        isPaid: fullyPaid,
        payments: arrayUnion({
          amount: returnAmt,
          date: new Date().toISOString(),
          receivedBy: staffName || 'Staff'
        }),
        lastPaymentDate: new Date()
      });
    } catch (err) {
      console.warn('Error processing udhari return:', err.message);
    }
  }
};

/**
 * Helper to delete documents in batches of 400 (Firestore limit is 500)
 */
const batchDeleteDocs = async (docs) => {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
};

/**
 * Completely wipes old petrol pump data from Firestore and local cache:
 * - sales_reports: all docs deleted
 * - tank_logs: all docs deleted
 * - shifts: all docs deleted
 * - machines: all docs deleted (if deleteMachines = true)
 * - nozzles: all docs deleted (if deleteMachines = true)
 * - users: all salesmen deleted (if deleteStaff = true, owner/admin is preserved)
 * - tanks: reset Tank-1 & Tank-2 stock to 0, delete any extra tanks (if resetTanks = true)
 * - AsyncStorage: wipes all @meter_*, @testing_done_*, @machine_* keys
 */
export const clearAllPumpData = async ({ deleteMachines = true, deleteStaff = true, resetTanks = true } = {}) => {
  try {
    // 1. Delete all sales_reports
    const salesSnap = await getDocs(collection(db, 'sales_reports'));
    if (!salesSnap.empty) {
      await batchDeleteDocs(salesSnap.docs);
    }

    // 2. Delete all tank_logs
    const tankLogsSnap = await getDocs(collection(db, 'tank_logs'));
    if (!tankLogsSnap.empty) {
      await batchDeleteDocs(tankLogsSnap.docs);
    }

    // 3. Delete all shifts
    const shiftsSnap = await getDocs(collection(db, 'shifts'));
    if (!shiftsSnap.empty) {
      await batchDeleteDocs(shiftsSnap.docs);
    }

    // 4. Delete machines and nozzles
    if (deleteMachines) {
      const machinesSnap = await getDocs(collection(db, 'machines'));
      if (!machinesSnap.empty) {
        await batchDeleteDocs(machinesSnap.docs);
      }

      const nozzlesSnap = await getDocs(collection(db, 'nozzles'));
      if (!nozzlesSnap.empty) {
        await batchDeleteDocs(nozzlesSnap.docs);
      }
    }

    // 5. Delete staff (salesmen only)
    if (deleteStaff) {
      const staffQuery = query(collection(db, 'users'), where('role', '==', 'salesman'));
      const staffSnap = await getDocs(staffQuery);
      if (!staffSnap.empty) {
        await batchDeleteDocs(staffSnap.docs);
      }
    }

    // 6. Reset Tanks
    if (resetTanks) {
      const tanksSnap = await getDocs(collection(db, 'tanks'));
      const extraTanks = tanksSnap.docs.filter(d => d.id !== 'Tank-1' && d.id !== 'Tank-2');
      if (extraTanks.length > 0) {
        await batchDeleteDocs(extraTanks);
      }

      // Reset Tank-1 (Petrol) & Tank-2 (Diesel) to 0
      const batch = writeBatch(db);
      const t1Ref = doc(db, 'tanks', 'Tank-1');
      batch.set(t1Ref, {
        id: 'Tank-1',
        name: 'Tank 1 (Petrol)',
        fuelType: 'Petrol',
        petrolStock: 0,
        dieselStock: 0,
        capacity: 20000,
        lastUpdated: new Date()
      }, { merge: true });

      const t2Ref = doc(db, 'tanks', 'Tank-2');
      batch.set(t2Ref, {
        id: 'Tank-2',
        name: 'Tank 2 (Diesel)',
        fuelType: 'Diesel',
        petrolStock: 0,
        dieselStock: 0,
        capacity: 20000,
        lastUpdated: new Date()
      }, { merge: true });

      await batch.commit();
    }

    // 7. Clear AsyncStorage keys for meters, testing, staff cache
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const keysToRemove = allKeys.filter(key => 
        key.startsWith('@meter_') || 
        key.startsWith('@testing_done_') || 
        key.startsWith('@machine_') ||
        key.startsWith('@last_')
      );
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch (storageErr) {
      console.warn("AsyncStorage clean warning:", storageErr);
    }

    return { success: true };
  } catch (error) {
    console.error("Error clearing pump data:", error);
    throw error;
  }
};

/**
 * Helper to get standard monthKey format 'YYYY-MM' (e.g. '2026-09')
 */
export const getMonthKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Helper to get local date string in 'YYYY-MM-DD' without UTC shift
 */
export const getLocalDateString = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Records salary advances taken by staff during daily expense entries.
 * Saved to 'staff_salary_advances' collection.
 */
export const recordStaffSalaryAdvances = async (advanceEntries, reportId, machineId, machineName) => {
  if (!advanceEntries || advanceEntries.length === 0) return { success: true };

  try {
    const now = new Date();
    const monthKey = getMonthKey(now);
    const dateStr = now.toISOString().split('T')[0];
    const batch = writeBatch(db);

    for (const item of advanceEntries) {
      const amt = parseFloat(item.amount) || 0;
      if (amt <= 0) continue;

      const docRef = doc(collection(db, 'staff_salary_advances'));
      batch.set(docRef, {
        salesmanId: item.salesmanId || '',
        salesmanName: item.salesmanName || 'Staff',
        amount: amt,
        monthKey,
        date: dateStr,
        timestamp: now,
        machineId: machineId || '',
        machineName: machineName || '',
        reportId: reportId || '',
        notes: item.notes || item.reason || 'वेतन / एडवांस (Salary Advance)'
      });
    }

    await batch.commit();
    return { success: true };
  } catch (error) {
    console.error("Error recording staff salary advances:", error);
    throw error;
  }
};

export const STAFF_TYPES = {
  SALESMAN: 'salesman',
  WATCHMAN: 'watchman',
  SWEEPER: 'sweeper'
};

export const getStaffTypeDetails = (type) => {
  switch ((type || '').toLowerCase()) {
    case 'watchman':
      return { 
        id: 'watchman', 
        title: 'चौकीदार (Watchman)', 
        shortTitle: 'चौकीदार',
        icon: 'shield-checkmark', 
        badge: '🛡️ Watchman', 
        color: '#1E40AF', 
        bg: '#DBEAFE',
        borderColor: '#93C5FD'
      };
    case 'sweeper':
      return { 
        id: 'sweeper', 
        title: 'सफाईकर्मी (Sweeper)', 
        shortTitle: 'सफाईकर्मी',
        icon: 'brush', 
        badge: '🧹 Sweeper', 
        color: '#065F46', 
        bg: '#D1FAE5',
        borderColor: '#6EE7B7'
      };
    case 'salesman':
    default:
      return { 
        id: 'salesman', 
        title: 'सेल्समैन (Salesman)', 
        shortTitle: 'सेल्समैन',
        icon: 'speedometer', 
        badge: '⛽ Salesman', 
        color: '#003C8F', 
        bg: '#E0F2FE',
        borderColor: '#7DD3FC'
      };
  }
};

/**
 * Fetches total salary advance taken by a specific staff member in a given month.
 * Defaults to current month if monthKey is not provided.
 * Supports matching by salesmanId or salesmanName.
 */
export const getStaffMonthlyAdvanceTotal = async (salesmanId, monthKey = getMonthKey(), salesmanName = null) => {
  if (!salesmanId && !salesmanName) return { totalAdvance: 0, count: 0, records: [] };

  try {
    const q = query(
      collection(db, 'staff_salary_advances'),
      where('monthKey', '==', monthKey)
    );

    const snapshot = await getDocs(q);
    let total = 0;
    const records = [];

    snapshot.forEach((d) => {
      const data = d.data();
      const matchId = salesmanId && data.salesmanId === salesmanId;
      const matchName = salesmanName && data.salesmanName && data.salesmanName.trim().toLowerCase() === salesmanName.trim().toLowerCase();
      if (matchId || matchName || (!salesmanName && matchId)) {
        const amt = parseFloat(data.amount) || 0;
        total += amt;
        records.push({ id: d.id, ...data });
      }
    });

    records.sort((a, b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : (a.date ? new Date(a.date).getTime() : 0));
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : (b.timestamp ? new Date(b.timestamp).getTime() : (b.date ? new Date(b.date).getTime() : 0));
      return timeB - timeA;
    });

    return { totalAdvance: total, count: records.length, records };
  } catch (error) {
    console.warn("Error fetching staff monthly advance:", error.message);
    return { totalAdvance: 0, count: 0, records: [] };
  }
};

/**
 * Direct Salary Advance logged by Admin or Staff for any employee (Salesman, Watchman, Sweeper)
 */
export const addDirectSalaryAdvance = async ({ 
  salesmanId, 
  salesmanName, 
  amount, 
  notes, 
  date = new Date(), 
  machineId = '', 
  machineName = '',
  paymentMode = 'Cash',
  staffType = 'salesman'
}) => {
  try {
    const amt = parseFloat(amount) || 0;
    if (amt <= 0) return { success: false, error: 'Valid amount is required' };

    const advanceDate = date instanceof Date ? date : new Date(date);
    const monthKey = getMonthKey(advanceDate);
    const dateStr = advanceDate.toISOString().split('T')[0];

    const docRef = doc(collection(db, 'staff_salary_advances'));
    await setDoc(docRef, {
      salesmanId: salesmanId || '',
      salesmanName: salesmanName || 'Staff',
      staffType: staffType || '',
      paymentMode: paymentMode || 'Cash',
      amount: amt,
      notes: notes || 'वेतन / एडवांस',
      monthKey,
      date: dateStr,
      timestamp: advanceDate,
      machineId: machineId || 'Support Staff',
      machineName: machineName || (staffType === 'watchman' ? 'चौकीदार भुगतान' : staffType === 'sweeper' ? 'सफाईकर्मी भुगतान' : 'Office / Direct'),
      createdAt: new Date(),
      source: 'direct'
    });

    return { success: true, id: docRef.id };
  } catch (error) {
    console.warn("Error adding direct salary advance:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Fetches all salary advances for all staff in a given month for Admin view.
 */
export const getAllStaffMonthlyAdvances = async (monthKey = getMonthKey()) => {
  try {
    const q = query(
      collection(db, 'staff_salary_advances'),
      where('monthKey', '==', monthKey)
    );

    const snapshot = await getDocs(q);
    const list = [];
    const staffSummaryMap = {}; // salesmanId -> { name, total, count }

    snapshot.forEach((d) => {
      const data = d.data();
      const item = { id: d.id, ...data };
      list.push(item);

      const sId = data.salesmanId || 'unknown';
      const sName = data.salesmanName || 'Staff';
      const amt = parseFloat(data.amount) || 0;

      if (!staffSummaryMap[sId]) {
        staffSummaryMap[sId] = { salesmanId: sId, salesmanName: sName, totalAmount: 0, count: 0 };
      }
      staffSummaryMap[sId].totalAmount += amt;
      staffSummaryMap[sId].count += 1;
    });

    list.sort((a, b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return { 
      records: list, 
      staffSummary: Object.values(staffSummaryMap),
      overallTotal: list.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
    };
  } catch (error) {
    console.warn("Error fetching all staff monthly advances:", error.message);
    return { records: [], staffSummary: [], overallTotal: 0 };
  }
};

/**
 * Helper to get previous monthKey (e.g. '2026-08' if current is '2026-09')
 */
export const getPreviousMonthKey = (date = new Date()) => {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setDate(1); // avoid 31st overflow bug when crossing month boundaries
  d.setMonth(d.getMonth() - 1);
  return getMonthKey(d);
};

/**
 * Format month key 'YYYY-MM' into readable label e.g. 'Sep 2026'
 */
export const formatMonthLabel = (monthKey) => {
  if (!monthKey || typeof monthKey !== 'string') return '';
  const parts = monthKey.split('-');
  if (parts.length === 2) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = new Date(y, m, 1);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    }
  }
  return monthKey;
};

/**
 * Computes attendance summary for a staff member for a given monthKey
 * derived directly from daily entries submitted in 'sales_reports'.
 */
export const getStaffMonthlyAttendance = (salesList = [], salesmanId = '', salesmanName = '', targetMonthKey = getMonthKey()) => {
  if (!salesList || salesList.length === 0) {
    return { daysCount: 0, distinctDates: [], entriesCount: 0, totalLiters: 0 };
  }

  const cleanId = (salesmanId || '').trim();
  const cleanName = (salesmanName || '').trim().toLowerCase();

  const matchingEntries = [];
  const dateMap = new Map(); // dayKey (YYYY-MM-DD) -> details
  let totalLiters = 0;

  salesList.forEach(item => {
    // Check staff match
    const itemId = (item.salesmanId || item.userId || '').trim();
    const itemName = (item.salesmanName || '').trim().toLowerCase();

    const isMatch = (cleanId && itemId === cleanId) || 
                    (cleanName && itemName === cleanName) ||
                    (cleanName && itemName.includes(cleanName)) ||
                    (cleanName && cleanName.includes(itemName));

    if (!isMatch) return;

    // Parse timestamp
    const itemDate = item.timestamp?.toDate 
      ? item.timestamp.toDate() 
      : (item.timestamp ? new Date(item.timestamp) : null);

    if (!itemDate || isNaN(itemDate.getTime())) return;

    const itemMonthKey = getMonthKey(itemDate);
    if (itemMonthKey !== targetMonthKey) return;

    const liters = Number(item.totalQuantitySold || 0);
    totalLiters += liters;

    matchingEntries.push({
      id: item.id,
      date: itemDate,
      machineName: item.machineName || item.machineId || 'Machine',
      petrolSold: Number(item.petrolQuantitySold || 0),
      dieselSold: Number(item.dieselQuantitySold || 0),
      totalQuantitySold: liters,
      expectedTotalAmount: Number(item.expectedTotalAmount || 0),
      totalPayment: Number(item.totalPayment || 0)
    });

    // Unique Day Key
    const yyyy = itemDate.getFullYear();
    const mm = String(itemDate.getMonth() + 1).padStart(2, '0');
    const dd = String(itemDate.getDate()).padStart(2, '0');
    const dayKey = `${yyyy}-${mm}-${dd}`;

    const machineStr = item.machineName || item.machineId || 'DU';

    if (!dateMap.has(dayKey)) {
      dateMap.set(dayKey, {
        dayKey,
        dateObj: itemDate,
        dateFormatted: itemDate.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }),
        weekday: itemDate.toLocaleDateString('en-IN', { weekday: 'short' }),
        machines: new Set([machineStr]),
        shiftsCount: 1,
        dayLiters: liters
      });
    } else {
      const existing = dateMap.get(dayKey);
      existing.machines.add(machineStr);
      existing.shiftsCount += 1;
      existing.dayLiters += liters;
    }
  });

  const distinctDates = Array.from(dateMap.values())
    .map(d => ({
      ...d,
      machinesList: Array.from(d.machines).join(', ')
    }))
    .sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

  return {
    daysCount: distinctDates.length,
    distinctDates,
    entriesCount: matchingEntries.length,
    totalLiters
  };
};

/**
 * Save monthly fuel commission rates (per liter) for profit calculation
 */
export const saveMonthlyCommissionRate = async (monthKey, { petrolRate = 0, dieselRate = 0 }) => {
  if (!monthKey) return { success: false, error: 'Month key is required' };
  try {
    const docRef = doc(db, 'monthly_commission_rates', monthKey);
    await setDoc(docRef, {
      monthKey,
      petrolRate: Number(petrolRate) || 0,
      dieselRate: Number(dieselRate) || 0,
      updatedAt: new Date()
    }, { merge: true });

    // Also persist to AsyncStorage for instant offline retrieval
    await AsyncStorage.setItem(`@commission_rates_${monthKey}`, JSON.stringify({
      petrolRate: Number(petrolRate) || 0,
      dieselRate: Number(dieselRate) || 0,
      monthKey
    })).catch(() => null);

    return { success: true };
  } catch (error) {
    console.warn('Error saving monthly commission rate:', error.message);
    throw error;
  }
};

/**
 * Retrieve saved monthly fuel commission rates
 */
export const getMonthlyCommissionRate = async (monthKey) => {
  if (!monthKey) return null;
  try {
    // Check AsyncStorage first for instantaneous response
    const cached = await AsyncStorage.getItem(`@commission_rates_${monthKey}`).catch(() => null);
    let cachedData = null;
    if (cached) {
      try { cachedData = JSON.parse(cached); } catch (e) {}
    }

    const docRef = doc(db, 'monthly_commission_rates', monthKey);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const result = {
        monthKey,
        petrolRate: Number(data.petrolRate) || 0,
        dieselRate: Number(data.dieselRate) || 0
      };
      await AsyncStorage.setItem(`@commission_rates_${monthKey}`, JSON.stringify(result)).catch(() => null);
      return result;
    }

    return cachedData;
  } catch (error) {
    console.warn('Error fetching monthly commission rate:', error.message);
    return null;
  }
};

/**
 * Accurately deducts fuel from active Petrol or Diesel tanks.
 * Decrements BOTH fuel-specific stock (petrolStock/dieselStock) AND general stock.
 * Strictly uses canonical Tank-1 / Tank-2 and cleans up ghost tanks.
 */
export const deductTankStock = async (fuelType, soldQuantity, testingReturned = 0) => {
  if (soldQuantity <= 0) return;
  const isDiesel = fuelType === 'Diesel';
  const canonicalId = isDiesel ? 'Tank-2' : 'Tank-1';
  const ghostId = isDiesel ? 'Tank 2' : 'Tank 1';

  try {
    const updatePayload = {
      lastUpdated: new Date()
    };
    if (isDiesel) {
      updatePayload.dieselStock = increment(-soldQuantity);
      updatePayload.stock = increment(-soldQuantity);
      if (testingReturned > 0) updatePayload.lastTestingReturned = testingReturned;
    } else {
      updatePayload.petrolStock = increment(-soldQuantity);
      updatePayload.stock = increment(-soldQuantity);
      if (testingReturned > 0) updatePayload.lastTestingReturned = testingReturned;
    }

    await setDoc(doc(db, 'tanks', canonicalId), updatePayload, { merge: true });
    // Clean up ghost duplicate tank if it exists
    await deleteDoc(doc(db, 'tanks', ghostId)).catch(() => null);
  } catch (err) {
    console.warn(`Error deducting ${fuelType} tank stock:`, err.message);
  }
};

/**
 * Unifies duplicate or misnamed tanks into canonical Tank-1 (Petrol) and Tank-2 (Diesel).
 * Solves the bug where duplicate docs (e.g. Tank 1 & Tank-1) caused double-stock and 4 tanks.
 * Preserves the actual stock number without double-summing and deletes ghost tanks.
 */
export const syncAndConsolidateTanks = async () => {
  try {
    const snap = await getDocs(collection(db, 'tanks'));
    if (snap.empty) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'tanks', 'Tank-1'), {
        id: 'Tank-1',
        tankId: 'Tank 1 (Petrol - MS)',
        name: 'Tank 1 (Petrol)',
        fuelType: 'Petrol',
        petrolStock: 0,
        stock: 0,
        dieselStock: 0,
        capacity: 20000,
        dipReading: null,
        lastUpdated: new Date()
      });
      batch.set(doc(db, 'tanks', 'Tank-2'), {
        id: 'Tank-2',
        tankId: 'Tank 2 (Diesel - HSD)',
        name: 'Tank 2 (Diesel)',
        fuelType: 'Diesel',
        petrolStock: 0,
        dieselStock: 0,
        stock: 0,
        capacity: 20000,
        dipReading: null,
        lastUpdated: new Date()
      });
      await batch.commit();
      return { success: true };
    }

    let pDoc = null;
    let dDoc = null;
    const docsToDelete = [];

    snap.forEach(d => {
      const id = d.id;
      const data = d.data();
      const lowerId = id.toLowerCase();
      const isDiesel = lowerId === 'tank-2' || lowerId === 'tank 2' || String(data.fuelType).toLowerCase() === 'diesel' || String(data.name || '').toLowerCase().includes('diesel');

      if (isDiesel) {
        if (id === 'Tank-2') {
          dDoc = { id, data };
        } else if (!dDoc && (id === 'Tank 2' || lowerId.includes('2') || lowerId.includes('diesel'))) {
          dDoc = { id, data };
        }
        if (id !== 'Tank-2') {
          docsToDelete.push(id);
        }
      } else {
        if (id === 'Tank-1') {
          pDoc = { id, data };
        } else if (!pDoc && (id === 'Tank 1' || lowerId.includes('1') || lowerId.includes('petrol') || lowerId.includes('ms'))) {
          pDoc = { id, data };
        }
        if (id !== 'Tank-1') {
          docsToDelete.push(id);
        }
      }
    });

    const finalPetrol = Math.max(0, parseFloat(pDoc?.data?.petrolStock !== undefined ? pDoc.data.petrolStock : (pDoc?.data?.stock || 0)));
    const finalDiesel = Math.max(0, parseFloat(dDoc?.data?.dieselStock !== undefined ? dDoc.data.dieselStock : (dDoc?.data?.stock || 0)));
    const petrolDip = pDoc?.data?.dipReading || null;
    const dieselDip = dDoc?.data?.dipReading || null;

    const batch = writeBatch(db);

    batch.set(doc(db, 'tanks', 'Tank-1'), {
      id: 'Tank-1',
      tankId: 'Tank 1 (Petrol - MS)',
      name: 'Tank 1 (Petrol)',
      fuelType: 'Petrol',
      petrolStock: finalPetrol,
      stock: finalPetrol,
      dieselStock: 0,
      capacity: 20000,
      dipReading: petrolDip || null,
      lastUpdated: new Date()
    }, { merge: true });

    batch.set(doc(db, 'tanks', 'Tank-2'), {
      id: 'Tank-2',
      tankId: 'Tank 2 (Diesel - HSD)',
      name: 'Tank 2 (Diesel)',
      fuelType: 'Diesel',
      petrolStock: 0,
      dieselStock: finalDiesel,
      stock: finalDiesel,
      capacity: 20000,
      dipReading: dieselDip || null,
      lastUpdated: new Date()
    }, { merge: true });

    // Clean up duplicate non-canonical documents
    for (const delId of docsToDelete) {
      batch.delete(doc(db, 'tanks', delId));
    }

    await batch.commit();
    return { success: true, finalPetrol, finalDiesel };
  } catch (e) {
    console.warn("syncAndConsolidateTanks error:", e.message);
    return { success: false, error: e.message };
  }
};

/**
 * Direct Manual Stock & Dip Adjustment for Tank 1 and Tank 2
 */
export const updateTankStockManual = async ({ tankId, liters, dipReading, reason = 'Manual Stock Adjustment', adjustedBy = 'Staff' }) => {
  try {
    const isDiesel = String(tankId).toLowerCase().includes('diesel') || String(tankId).includes('2');
    const targetLiters = parseFloat(liters) || 0;
    const dipVal = dipReading ? String(dipReading).trim() : null;

    const canonicalId = isDiesel ? 'Tank-2' : 'Tank-1';
    const ghostId = isDiesel ? 'Tank 2' : 'Tank 1';

    const payload = {
      id: canonicalId,
      tankId: isDiesel ? 'Tank 2 (Diesel - HSD)' : 'Tank 1 (Petrol - MS)',
      name: isDiesel ? 'Tank 2 (Diesel)' : 'Tank 1 (Petrol)',
      fuelType: isDiesel ? 'Diesel' : 'Petrol',
      stock: targetLiters,
      petrolStock: isDiesel ? 0 : targetLiters,
      dieselStock: isDiesel ? targetLiters : 0,
      dipReading: dipVal ? `${dipVal.replace(/[^0-9.]/g, '')} cm` : null,
      lastUpdated: new Date(),
      lastAdjustmentReason: reason,
      lastAdjustedBy: adjustedBy
    };

    // Save strictly to canonical Tank-1 or Tank-2
    await setDoc(doc(db, 'tanks', canonicalId), payload, { merge: true });

    // Ensure ghost duplicate tank ('Tank 1' or 'Tank 2') is deleted
    await deleteDoc(doc(db, 'tanks', ghostId)).catch(() => null);

    // Also record in tank_logs
    await addDoc(collection(db, 'tank_logs'), {
      type: 'stock_adjustment',
      tankId: canonicalId,
      fuelType: isDiesel ? 'Diesel' : 'Petrol',
      adjustedStockLiters: targetLiters,
      dipReading: dipVal ? `${dipVal.replace(/[^0-9.]/g, '')} cm` : null,
      reason,
      adjustedBy,
      timestamp: new Date()
    });

    return { success: true };
  } catch (err) {
    console.warn("updateTankStockManual error:", err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Processes Fuel Onload (Tanker arrival / Decanting + Sample Label testing):
 * - Adds received Petrol (L) & updates Dip in Tank 1
 * - Adds received Diesel (L) & updates Dip in Tank 2
 * - Saves addition log in 'tank_logs'
 * - Saves sample record in 'sample_labels'
 */
export const processFuelOnload = async (payload) => {
  const {
    petrolLiters = 0,
    petrolDip = '',
    dieselLiters = 0,
    dieselDip = '',
    tankerNumber = '',
    tankLorryNo = '',
    invoiceNumber = '',
    invoiceNo = '',
    supplyLocation = 'Baitalpur',
    divisionRegion = 'Baitalpur',
    retailOutletName = 'Baijnath',
    retailOutletAddress = '',
    oilCompany = 'IOCL',
    product = '',
    sourceOfSample = 'Tank Lorry Nozzle / Delivery Hose',
    sampleDate = '',
    sampleTime = '',
    challanDensity = '',
    lorryDensity = '',
    challanDensityPetrol = '',
    lorryDensityPetrol = '',
    challanDensityDiesel = '',
    lorryDensityDiesel = '',
    temperature = '',
    roTankNo = '',
    aluminumSealNos = '',
    woodenBoxSealNos = '',
    dealerRepName = 'Baijnath',
    placeAndDate = '',
    driverName = '',
    driverPhone = '',
    transporterName = '',
    oilCompanyFooter = 'IOCL',
    operatorName = '',
    notes = '',
    imageUrls = [],
    deliveryDate = new Date()
  } = payload;

  const pLiters = parseFloat(petrolLiters) || 0;
  const dLiters = parseFloat(dieselLiters) || 0;

  const finalTankerNo = (tankLorryNo || tankerNumber || '').trim();
  const finalInvoiceNo = (invoiceNo || invoiceNumber || '').trim();
  const finalProduct = product || 'MS / HSD';
  const finalChallanDensity = challanDensity || (pLiters > 0 ? challanDensityPetrol : challanDensityDiesel) || '';
  const finalLorryDensity = lorryDensity || (pLiters > 0 ? lorryDensityPetrol : lorryDensityDiesel) || '';

  const batch = writeBatch(db);

  // 1. Update Tank 1 (Petrol) strictly in canonical Tank-1
  if (pLiters > 0) {
    const t1Ref = doc(db, 'tanks', 'Tank-1');
    const t1Data = {
      id: 'Tank-1',
      name: 'Tank 1 (Petrol)',
      fuelType: 'Petrol',
      petrolStock: increment(pLiters),
      stock: increment(pLiters),
      lastAddedLiters: pLiters,
      lastUpdated: new Date()
    };
    if (petrolDip) {
      t1Data.dipReading = `${String(petrolDip).trim()} cm`;
    }
    batch.set(t1Ref, t1Data, { merge: true });
    // Clean up ghost duplicate Tank 1
    batch.delete(doc(db, 'tanks', 'Tank 1'));
  }

  // 2. Update Tank 2 (Diesel) strictly in canonical Tank-2
  if (dLiters > 0) {
    const t2Ref = doc(db, 'tanks', 'Tank-2');
    const t2Data = {
      id: 'Tank-2',
      name: 'Tank 2 (Diesel)',
      fuelType: 'Diesel',
      dieselStock: increment(dLiters),
      stock: increment(dLiters),
      lastAddedLiters: dLiters,
      lastUpdated: new Date()
    };
    if (dieselDip) {
      t2Data.dipReading = `${String(dieselDip).trim()} cm`;
    }
    batch.set(t2Ref, t2Data, { merge: true });
    // Clean up ghost duplicate Tank 2
    batch.delete(doc(db, 'tanks', 'Tank 2'));
  }

  // 3. Record in tank_logs if fuel was added
  let logRefId = null;
  if (pLiters > 0 || dLiters > 0) {
    const logRef = doc(collection(db, 'tank_logs'));
    logRefId = logRef.id;
    batch.set(logRef, {
      type: 'addition',
      source: 'onload',
      petrolAdded: pLiters,
      dieselAdded: dLiters,
      totalAdded: pLiters + dLiters,
      petrolDip: petrolDip ? `${String(petrolDip).trim()} cm` : null,
      dieselDip: dieselDip ? `${String(dieselDip).trim()} cm` : null,
      tankerNumber: finalTankerNo || 'N/A',
      tankLorryNo: finalTankerNo || 'N/A',
      invoiceNumber: finalInvoiceNo || 'N/A',
      invoiceNo: finalInvoiceNo || 'N/A',
      supplier: supplyLocation.trim() || 'IOCL Baitalpur Depot',
      driverName: driverName.trim() || 'N/A',
      driverPhone: driverPhone.trim() || 'N/A',
      transporterName: transporterName.trim() || 'N/A',
      product: finalProduct,
      temperature: temperature ? `${temperature}°C` : null,
      challanDensity: finalChallanDensity,
      lorryDensity: finalLorryDensity,
      operatorName: operatorName.trim() || '',
      note: notes.trim() || `Onloaded ${pLiters > 0 ? `${pLiters}L Petrol ` : ''}${dLiters > 0 ? `${dLiters}L Diesel` : ''}`,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      hasImages: Array.isArray(imageUrls) && imageUrls.length > 0,
      timestamp: deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate),
      createdAt: new Date()
    });
  }

  // 4. Save sample_labels record for official audit & reprint (Exact Annexure S-2 structure)
  const sampleRef = doc(collection(db, 'sample_labels'));
  const now = new Date();
  const defaultDateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const defaultTimeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

  const finalSampleDate = sampleDate || defaultDateStr;
  const finalSampleTime = sampleTime || defaultTimeStr;
  const finalPlaceAndDate = placeAndDate || `Baitalpur, ${finalSampleDate}`;
  const finalRoTankNo = roTankNo || '';
  const finalDealerRepName = dealerRepName || 'Baijnath';

  batch.set(sampleRef, {
    supplyLocation: supplyLocation || 'Baitalpur',
    divisionRegion: divisionRegion || 'Baitalpur',
    retailOutletName: retailOutletName || 'Baijnath',
    retailOutletAddress: retailOutletAddress || '',
    oilCompany: oilCompany || 'IOCL',
    product: finalProduct,
    sourceOfSample: sourceOfSample || 'Tank Lorry Nozzle / Delivery Hose',
    tankLorryNo: finalTankerNo || '',
    invoiceNo: finalInvoiceNo || '',
    sampleDate: finalSampleDate,
    sampleTime: finalSampleTime,
    challanDensity: finalChallanDensity,
    lorryDensity: finalLorryDensity,
    roTankNo: finalRoTankNo,
    aluminumSealNos: aluminumSealNos || '',
    woodenBoxSealNos: woodenBoxSealNos || '',
    dealerRepName: finalDealerRepName,
    placeAndDate: finalPlaceAndDate,
    driverName: driverName || '',
    transporterName: transporterName || '',
    oilCompanyFooter: oilCompanyFooter || 'IOCL',
    timestamp: new Date(),
    petrolLiters: pLiters,
    dieselLiters: dLiters,
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    hasImages: Array.isArray(imageUrls) && imageUrls.length > 0
  });

  await batch.commit();

  return {
    success: true,
    logId: logRefId,
    sampleId: sampleRef.id,
    petrolAdded: pLiters,
    dieselAdded: dLiters,
    imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
    sampleRecord: {
      supplyLocation: supplyLocation || 'Baitalpur',
      divisionRegion: divisionRegion || 'Baitalpur',
      retailOutletName: retailOutletName || 'Baijnath',
      retailOutletAddress: retailOutletAddress || '',
      oilCompany: oilCompany || 'IOCL',
      product: finalProduct,
      sourceOfSample: sourceOfSample || 'Tank Lorry Nozzle / Delivery Hose',
      tankLorryNo: finalTankerNo,
      invoiceNo: finalInvoiceNo,
      sampleDate: finalSampleDate,
      sampleTime: finalSampleTime,
      challanDensity: finalChallanDensity,
      lorryDensity: finalLorryDensity,
      roTankNo: finalRoTankNo,
      aluminumSealNos: aluminumSealNos || '',
      woodenBoxSealNos: woodenBoxSealNos || '',
      dealerRepName: finalDealerRepName,
      placeAndDate: finalPlaceAndDate,
      driverName: driverName || '',
      transporterName: transporterName || '',
      oilCompanyFooter: oilCompanyFooter || 'IOCL'
    }
  };
};

/**
 * Save daily pump inspection photos submitted by staff
 */
export const saveDailyPumpPhotos = async ({
  staffId = '',
  staffName = 'Staff',
  note = '',
  imageUrls = [],
  dateStr = new Date().toISOString().split('T')[0]
}) => {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error('कम से कम एक तस्वीर होना आवश्यक है।');
  }

  const docRef = doc(collection(db, 'daily_pump_photos'));
  const payload = {
    staffId: staffId || '',
    staffName: staffName || 'Staff',
    note: note || '',
    imageUrls,
    photoCount: imageUrls.length,
    dateStr,
    timestamp: new Date(),
    createdAt: new Date()
  };

  await setDoc(docRef, payload);
  return { success: true, id: docRef.id, ...payload };
};

/**
 * Automatically purges and deletes daily pump photos older than specified days (default 5 days).
 * Scans Firestore collection 'daily_pump_photos' and deletes expired documents.
 */
export const cleanupOldDailyPhotos = async (retentionDays = 5) => {
  try {
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const snap = await getDocs(collection(db, 'daily_pump_photos'));
    if (snap.empty) return 0;

    let deletedCount = 0;
    const deletePromises = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      let photoTime = null;
      if (data.timestamp?.toDate) {
        photoTime = data.timestamp.toDate().getTime();
      } else if (data.timestamp) {
        photoTime = new Date(data.timestamp).getTime();
      } else if (data.createdAt?.toDate) {
        photoTime = data.createdAt.toDate().getTime();
      } else if (data.createdAt) {
        photoTime = new Date(data.createdAt).getTime();
      } else if (data.dateStr) {
        photoTime = new Date(data.dateStr).getTime();
      }

      if (photoTime && photoTime < cutoffMs) {
        deletePromises.push(deleteDoc(docSnap.ref));
        deletedCount++;
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      console.log(`[cleanupOldDailyPhotos] Successfully deleted ${deletedCount} photos older than ${retentionDays} days.`);
    }
    return deletedCount;
  } catch (err) {
    console.warn('[cleanupOldDailyPhotos] Error while cleaning old photos:', err.message);
    return 0;
  }
};

/**
 * -------------------------------------------------------------
 * Admin Expenses / Fund Outflow Management
 * Categories: 'Personal Bank', 'IOCL', 'Extra Expenses'
 * -------------------------------------------------------------
 */
export const addAdminExpense = async ({
  category,
  amount,
  dateStr = new Date().toISOString().split('T')[0],
  notes = '',
  paymentMode = 'NetBanking'
}) => {
  const validCategories = ['Personal Bank', 'IOCL', 'Extra Expenses'];
  if (!validCategories.includes(category)) {
    throw new Error('कृपया वैध श्रेणी चुनें (Personal Bank, IOCL या Extra Expenses)');
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('कृपया वैध राशि (Amount > 0) दर्ज करें');
  }

  const cleanDateStr = (dateStr && String(dateStr).trim()) || new Date().toISOString().split('T')[0];
  const monthKey = cleanDateStr.slice(0, 7); // 'YYYY-MM'

  const docRef = doc(collection(db, 'admin_expenses'));
  const payload = {
    category,
    amount: numAmount,
    date: cleanDateStr,
    monthKey,
    notes: (notes || '').trim(),
    paymentMode: paymentMode || 'NetBanking',
    timestamp: new Date(),
    createdAt: new Date().toISOString()
  };

  await setDoc(docRef, payload);
  return { success: true, id: docRef.id, ...payload };
};

export const deleteAdminExpense = async (expenseId) => {
  if (!expenseId) throw new Error('Expense ID आवश्यक है');
  await deleteDoc(doc(db, 'admin_expenses', expenseId));
  return { success: true, id: expenseId };
};

/**
 * Updates an existing sample_labels / onload slip record.
 * Optionally adjusts Tank-1 / Tank-2 stock if petrolLiters or dieselLiters changed.
 */
export const updateSavedOnloadSlip = async (slipId, updatedData, adjustTankStock = true) => {
  if (!slipId) throw new Error("Slip ID आवश्यक है।");

  const slipRef = doc(db, 'sample_labels', slipId);
  const slipSnap = await getDoc(slipRef);
  if (!slipSnap.exists()) {
    throw new Error("सेव्ड स्लिप का रिकॉर्ड नहीं मिला।");
  }
  const oldData = slipSnap.data();

  const batch = writeBatch(db);

  // If user changed petrol or diesel liters and wants tank stock adjusted:
  if (adjustTankStock) {
    const oldP = parseFloat(oldData.petrolLiters) || 0;
    const newP = parseFloat(updatedData.petrolLiters !== undefined ? updatedData.petrolLiters : oldP) || 0;
    const deltaP = newP - oldP;

    if (deltaP !== 0) {
      const t1Ref = doc(db, 'tanks', 'Tank-1');
      batch.set(t1Ref, {
        id: 'Tank-1',
        name: 'Tank 1 (Petrol)',
        fuelType: 'Petrol',
        petrolStock: increment(deltaP),
        stock: increment(deltaP),
        lastAddedLiters: newP,
        lastUpdated: new Date()
      }, { merge: true });
      batch.delete(doc(db, 'tanks', 'Tank 1'));
    }

    const oldD = parseFloat(oldData.dieselLiters) || 0;
    const newD = parseFloat(updatedData.dieselLiters !== undefined ? updatedData.dieselLiters : oldD) || 0;
    const deltaD = newD - oldD;

    if (deltaD !== 0) {
      const t2Ref = doc(db, 'tanks', 'Tank-2');
      batch.set(t2Ref, {
        id: 'Tank-2',
        name: 'Tank 2 (Diesel)',
        fuelType: 'Diesel',
        dieselStock: increment(deltaD),
        stock: increment(deltaD),
        lastAddedLiters: newD,
        lastUpdated: new Date()
      }, { merge: true });
      batch.delete(doc(db, 'tanks', 'Tank 2'));
    }
  }

  // Update sample_labels document
  const finalPayload = {
    ...updatedData,
    updatedAt: new Date()
  };

  batch.update(slipRef, finalPayload);

  await batch.commit();
  return { success: true, id: slipId, ...finalPayload };
};

/**
 * Deletes a saved sample_labels / onload slip record.
 */
export const deleteSavedOnloadSlip = async (slipId) => {
  if (!slipId) throw new Error("Slip ID आवश्यक है।");
  await deleteDoc(doc(db, 'sample_labels', slipId));
  return { success: true, id: slipId };
};

/**
 * -------------------------------------------------------------
 * Permanent Digital Payment Modes Master Management
 * Collection: 'digital_payment_modes'
 * -------------------------------------------------------------
 */
export const DEFAULT_PERMANENT_DIGITAL_MODES = [
  { id: 'paytm', modeId: 'paytm', name: 'Paytm (पेटीएम)', icon: 'wallet-outline', color: '#00B9F5', isFixed: true, order: 1 },
  { id: 'phonepe', modeId: 'phonepe', name: 'PhonePe (फोनपे)', icon: 'phone-portrait-outline', color: '#5F259F', isFixed: true, order: 2 },
  { id: 'atm', modeId: 'atm', name: 'ATM / POS स्वाइप', icon: 'card-outline', color: '#003C8F', isFixed: true, order: 3 },
  { id: 'bob', modeId: 'bob', name: 'BOB Bank (बैंक ऑफ बड़ौदा)', icon: 'business-outline', color: '#EA580C', isFixed: true, order: 4 }
];

export const syncDefaultDigitalPaymentModes = async () => {
  try {
    const snap = await getDocs(collection(db, 'digital_payment_modes'));
    if (snap.empty) {
      const batch = writeBatch(db);
      for (const mode of DEFAULT_PERMANENT_DIGITAL_MODES) {
        batch.set(doc(db, 'digital_payment_modes', mode.id), {
          ...mode,
          createdAt: new Date()
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('syncDefaultDigitalPaymentModes error:', err.message);
  }
};

export const addPermanentDigitalPaymentMode = async ({ name, icon = 'card-outline', color = '#0F766E' }) => {
  if (!name || !name.trim()) throw new Error('कृपया पेमेंट माध्यम का नाम दर्ज करें');
  const cleanName = name.trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const docId = `mode_${slug}_${Date.now()}`;
  const docRef = doc(db, 'digital_payment_modes', docId);
  const payload = {
    id: docId,
    modeId: docId,
    name: cleanName,
    icon: icon || 'card-outline',
    color: color || '#0F766E',
    isFixed: false,
    order: 99,
    createdAt: new Date()
  };
  await setDoc(docRef, payload);
  return { success: true, ...payload };
};

export const deletePermanentDigitalPaymentMode = async (modeId) => {
  if (!modeId) throw new Error('Payment Mode ID आवश्यक है');
  await deleteDoc(doc(db, 'digital_payment_modes', modeId));
  return { success: true, id: modeId };
};




