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
  arrayUnion
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
    if (tankId && tankId !== 'Unknown') {
      const fieldToUpdate = fuelType === 'Diesel' ? 'dieselStock' : 'petrolStock';
      await updateDoc(doc(db, 'tanks', tankId), {
        [fieldToUpdate]: increment(-totalQuantitySold)
      });
    }

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
  const expectedTotal = petrolExp + dieselExp;

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
      bharatPeAmount: Number(entryData.bharatPeAmount) || 0,
      atmAmount: Number(entryData.atmAmount) || 0,
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
        await updateDoc(doc(db, 'tanks', petrolTankId), {
          petrolStock: increment(-petrolSold),
          lastTestingReturned: petrolTestingLiters,
          lastUpdated: new Date()
        }).catch(async () => {
          await setDoc(doc(db, 'tanks', petrolTankId), {
            tankId: petrolTankId,
            petrolStock: -petrolSold,
            dieselStock: 0,
            lastTestingReturned: petrolTestingLiters,
            lastUpdated: new Date()
          }, { merge: true }).catch(() => null);
        });
      }

      // Tank 2 (Diesel Tank): Deduct only net diesel sold (5L testing was returned)
      if (dieselSold > 0) {
        await updateDoc(doc(db, 'tanks', dieselTankId), {
          dieselStock: increment(-dieselSold),
          lastTestingReturned: dieselTestingLiters,
          lastUpdated: new Date()
        }).catch(async () => {
          await setDoc(doc(db, 'tanks', dieselTankId), {
            tankId: dieselTankId,
            petrolStock: 0,
            dieselStock: -dieselSold,
            lastTestingReturned: dieselTestingLiters,
            lastUpdated: new Date()
          }, { merge: true }).catch(() => null);
        });
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
    const expectedTotal = petrolExp + dieselExp;

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
      totalPayment: Number(entryData.totalPayment) || 0,
      shortageOrExcess: Number(entryData.shortageOrExcess) || 0,

      cashAmount: Number(entryData.cashAmount) || 0,
      cashBreakdown: entryData.cashBreakdown || null,

      onlineAmount: Number(entryData.onlineAmount) || 0,
      digitalPaymentsBreakdown: entryData.digitalPaymentsBreakdown || [],
      phonePeAmount: Number(entryData.phonePeAmount) || 0,
      paytmAmount: Number(entryData.paytmAmount) || 0,
      bharatPeAmount: Number(entryData.bharatPeAmount) || 0,
      atmAmount: Number(entryData.atmAmount) || 0,
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

/**
 * Fetches total salary advance taken by a specific staff member in a given month.
 * Defaults to current month if monthKey is not provided.
 */
export const getStaffMonthlyAdvanceTotal = async (salesmanId, monthKey = getMonthKey()) => {
  if (!salesmanId) return { totalAdvance: 0, count: 0, records: [] };

  try {
    const q = query(
      collection(db, 'staff_salary_advances'),
      where('salesmanId', '==', salesmanId),
      where('monthKey', '==', monthKey)
    );

    const snapshot = await getDocs(q);
    let total = 0;
    const records = [];

    snapshot.forEach((d) => {
      const data = d.data();
      const amt = parseFloat(data.amount) || 0;
      total += amt;
      records.push({ id: d.id, ...data });
    });

    return { totalAdvance: total, count: records.length, records };
  } catch (error) {
    console.warn("Error fetching staff monthly advance:", error.message);
    return { totalAdvance: 0, count: 0, records: [] };
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

