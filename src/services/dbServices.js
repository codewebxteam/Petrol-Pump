import { collection, doc, setDoc, updateDoc, increment, getDocs, query, where, getDoc } from 'firebase/firestore';
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
