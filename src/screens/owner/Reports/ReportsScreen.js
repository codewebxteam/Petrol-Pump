import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ActivityIndicator, Alert } from 'react-native';
import { collection, query, where, orderBy, getDocs, limit, startAfter } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '@expo/vector-icons/Ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { generateAndSharePdf } from '../../../utils/generatePdfReceipt';

export default function ReportsScreen() {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' or 'additions'
  const [additionsViewMode, setAdditionsViewMode] = useState('day'); // 'day' or 'month'
  
  // Date Picker State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Data State
  const [salesData, setSalesData] = useState([]);
  const [salaryAdvancesData, setSalaryAdvancesData] = useState([]);
  const [additionsData, setAdditionsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salesmenMap, setSalesmenMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  
  // Pagination State for Additions only
  const [lastVisible, setLastVisible] = useState(null);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const isSalaryAdvance = (e) => {
    if (!e) return false;
    if (e.type === 'salary') return true;
    const r = (e.reason || '').toLowerCase();
    const n = (e.notes || '').toLowerCase();
    return (
      r.includes('salary') || r.includes('advance') || r.includes('वेतन') || r.includes('एडवांस') ||
      n.includes('salary') || n.includes('advance') || n.includes('वेतन') || n.includes('एडवांस')
    );
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const changeDateByDays = (days) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(next);
  };

  const isToday = useMemo(() => {
    const today = new Date();
    return (
      selectedDate.getDate() === today.getDate() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getFullYear() === today.getFullYear()
    );
  }, [selectedDate]);

  // Fetch Data based on Filter
  const fetchData = async () => {
    setLoading(true);
    let start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    
    let end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    try {
      if (activeTab === 'sales') {
        const q = query(
          collection(db, 'sales_reports'),
          where('timestamp', '>=', start),
          where('timestamp', '<=', end),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const list = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setSalesData(list);
        setHasMore(false);

        // Fetch salary advances logged directly or linked to this day
        try {
          const monthKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
          const localDayStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
          const utcDayStr = selectedDate.toISOString().split('T')[0];

          const advQ = query(
            collection(db, 'staff_salary_advances'),
            where('monthKey', '==', monthKey)
          );
          const advSnap = await getDocs(advQ);
          const advList = [];
          advSnap.forEach(d => {
            const data = d.data();
            const docDate = data.date || (data.timestamp?.toDate ? data.timestamp.toDate().toISOString().split('T')[0] : '');
            const ts = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
            const matchesDay = docDate === localDayStr || docDate === utcDayStr || (ts && ts >= start && ts <= end);
            if (matchesDay) {
              advList.push({ id: d.id, ...data });
            }
          });
          setSalaryAdvancesData(advList);
        } catch (advErr) {
          console.warn("Error fetching staff salary advances:", advErr);
          setSalaryAdvancesData([]);
        }
      } else {
        let q;
        if (additionsViewMode === 'month') {
          const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 0, 0, 0, 0);
          const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999);
          q = query(
            collection(db, 'tank_logs'),
            where('timestamp', '>=', startOfMonth),
            where('timestamp', '<=', endOfMonth),
            orderBy('timestamp', 'desc'),
            limit(100)
          );
        } else {
          q = query(
            collection(db, 'tank_logs'),
            where('timestamp', '>=', start),
            where('timestamp', '<=', end),
            orderBy('timestamp', 'desc'),
            limit(50)
          );
        }

        try {
          const snapshot = await getDocs(q);
          const list = [];
          snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
          list.sort((a, b) => {
            const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
            const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
            return timeB - timeA;
          });
          setAdditionsData(list);
          setLastVisible(null);
          setHasMore(false);
        } catch (qErr) {
          console.warn("Falling back to client-side filtered tank_logs:", qErr.message);
          const snapAll = await getDocs(query(collection(db, 'tank_logs'), limit(100)));
          const list = [];
          snapAll.forEach(doc => {
            const data = doc.data();
            const ts = data.timestamp?.toDate ? data.timestamp.toDate() : (data.timestamp ? new Date(data.timestamp) : null);
            if (ts) {
              if (additionsViewMode === 'month') {
                const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 0, 0, 0, 0);
                const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59, 999);
                if (ts >= startOfMonth && ts <= endOfMonth) list.push({ id: doc.id, ...data });
              } else {
                if (ts >= start && ts <= end) list.push({ id: doc.id, ...data });
              }
            }
          });
          list.sort((a, b) => {
            const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
            const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
            return timeB - timeA;
          });
          setAdditionsData(list);
          setLastVisible(null);
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchSalesmen = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'salesman'));
        const snap = await getDocs(q);
        const map = {};
        snap.forEach(doc => {
          map[doc.id] = doc.data().name;
        });
        setSalesmenMap(map);
      } catch (err) {
        console.error("Error fetching salesmen map:", err);
      }
    };
    fetchSalesmen();
  }, []);

  const handleDownloadReportPdf = async (item) => {
    const pdfData = {
      staffName: salesmenMap[item.salesmanId] || item.salesmanName || 'Staff',
      machineName: item.machineName || item.machineId || 'Dispenser',
      petrolNozzleId: item.petrolEntry?.nozzleId || (item.fuelType === 'Petrol' ? item.nozzleId : 'N1'),
      dieselNozzleId: item.dieselEntry?.nozzleId || (item.fuelType === 'Diesel' ? item.nozzleId : 'N2'),
      petrolOpening: item.petrolOpeningMeter || item.petrolEntry?.openingMeterReading || item.openingMeterReading || '0.0000',
      petrolClosing: item.petrolClosingMeter || item.petrolEntry?.closingMeterReading || item.closingMeterReading || '0.0000',
      petrolTesting: item.petrolTesting || item.petrolEntry?.testingQuantity || (item.fuelType === 'Petrol' ? item.testingQuantity : 0) || 0,
      petrolNetSold: item.petrolQuantitySold || item.petrolEntry?.totalQuantitySold || (item.fuelType === 'Petrol' ? item.totalQuantitySold : 0) || 0,
      petrolRate: item.petrolRate || item.petrolEntry?.fuelRate || 0,
      petrolExpected: item.petrolExpectedAmount || item.petrolEntry?.expectedAmount || 0,
      dieselOpening: item.dieselOpeningMeter || item.dieselEntry?.openingMeterReading || '0.0000',
      dieselClosing: item.dieselClosingMeter || item.dieselEntry?.closingMeterReading || '0.0000',
      dieselTesting: item.dieselTesting || item.dieselEntry?.testingQuantity || (item.fuelType === 'Diesel' ? item.testingQuantity : 0) || 0,
      dieselNetSold: item.dieselQuantitySold || item.dieselEntry?.totalQuantitySold || (item.fuelType === 'Diesel' ? item.totalQuantitySold : 0) || 0,
      dieselRate: item.dieselRate || item.dieselEntry?.fuelRate || 0,
      dieselExpected: item.dieselExpectedAmount || item.dieselEntry?.expectedAmount || 0,
      totalLitersSold: item.totalQuantitySold || (Number(item.petrolQuantitySold || 0) + Number(item.dieselQuantitySold || 0)) || 0,
      totalExpectedAmount: item.expectedTotalAmount || ((Number(item.petrolExpectedAmount || 0)) + (Number(item.dieselExpectedAmount || 0))),
      cashAmt: item.cashAmount || 0,
      digitalAmt: item.onlineAmount || 0,
      digitalEntries: item.digitalPaymentsBreakdown || [],
      udhariAmt: item.udhariAmount || 0,
      udhariBreakdown: item.udhariBreakdown || [],
      expenseAmt: item.expenses || 0,
      expenseBreakdown: (item.expenseBreakdown || []).map(e => ({
        ...e,
        salesmanName: e.salesmanName || (e.salesmanId ? salesmenMap[e.salesmanId] : null) || salesmenMap[item.salesmanId] || item.salesmanName || 'Staff'
      })),
      totalCollection: item.totalPayment || 0,
      shortageOrExcess: item.shortageOrExcess || 0,
      udhariReturnTotal: item.udhariReturnAmount || 0,
      udhariReturnEntries: item.udhariReturnDetails || [],
      entryDate: item.timestamp?.toDate ? item.timestamp.toDate() : (item.timestamp ? new Date(item.timestamp) : new Date())
    };
    await generateAndSharePdf(pdfData);
  };

  const fetchMoreData = async () => {
    if (activeTab === 'sales') return;
    if (!hasMore || fetchingMore || loading || !lastVisible) return;

    setFetchingMore(true);
    let start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    
    let end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    try {
      const q = query(
        collection(db, 'tank_logs'),
        where('timestamp', '>=', start),
        where('timestamp', '<=', end),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisible),
        limit(15)
      );
      const snapshot = await getDocs(q);
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      
      setAdditionsData([...additionsData, ...list]);
      if (snapshot.docs.length > 0) {
        setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMore(snapshot.docs.length === 15);
    } catch (error) {
      console.error("Error fetching more reports:", error);
    } finally {
      setFetchingMore(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, selectedDate, additionsViewMode]); 

  // Compute Aggregated Summary for Sales
  const summary = useMemo(() => {
    return salesData.reduce((acc, curr) => {
      const petrolSold = Number(curr.petrolQuantitySold || (curr.fuelType === 'Petrol' ? curr.totalQuantitySold : 0) || 0);
      const dieselSold = Number(curr.dieselQuantitySold || (curr.fuelType === 'Diesel' ? curr.totalQuantitySold : 0) || 0);
      
      acc.petrolSold += petrolSold;
      acc.dieselSold += dieselSold;
      acc.totalGrossSold += (petrolSold + dieselSold || Number(curr.totalQuantitySold || 0));

      acc.expectedTotal += Number(curr.expectedTotalAmount || 0);
      acc.collectedTotal += Number(curr.totalPayment || 0);

      acc.cash += Number(curr.cashAmount || 0);
      acc.phonePe += Number(curr.phonePeAmount || 0);
      acc.paytm += Number(curr.paytmAmount || 0);
      acc.bharatPe += Number(curr.bharatPeAmount || 0);
      acc.udhari += Number(curr.udhariAmount || 0);
      acc.expenses += Number(curr.expenses || 0);
      
      acc.testingFuel += Number(curr.testingQuantity || 0) + Number(curr.petrolTesting || 0) + Number(curr.dieselTesting || 0);
      
      acc.shortageOrExcess += Number(curr.shortageOrExcess || 0);
      return acc;
    }, { 
      totalGrossSold: 0, petrolSold: 0, dieselSold: 0, testingFuel: 0,
      expectedTotal: 0, collectedTotal: 0, 
      cash: 0, phonePe: 0, paytm: 0, bharatPe: 0, udhari: 0, expenses: 0, 
      shortageOrExcess: 0 
    });
  }, [salesData]);

  const machineSummary = useMemo(() => {
    const sm = {};
    salesData.forEach(item => {
      const machineName = item.machineName || (item.nozzleId ? item.nozzleId.split(' ')[0] : (item.machineId || 'Dispenser'));
      if (!sm[machineName]) {
        sm[machineName] = { 
          name: machineName,
          petrolSold: 0,
          dieselSold: 0,
          petrolTesting: 0,
          dieselTesting: 0,
          totalLiters: 0, 
          expectedAmount: 0, 
          collectedAmount: 0 
        };
      }
      const pSold = Number(item.petrolQuantitySold ?? (item.fuelType === 'Petrol' ? item.totalQuantitySold : 0) ?? 0);
      const dSold = Number(item.dieselQuantitySold ?? (item.fuelType === 'Diesel' ? item.totalQuantitySold : 0) ?? 0);
      const pTest = Number(item.petrolTesting ?? (item.fuelType === 'Petrol' ? item.testingQuantity : 0) ?? 0);
      const dTest = Number(item.dieselTesting ?? (item.fuelType === 'Diesel' ? item.testingQuantity : 0) ?? 0);

      sm[machineName].petrolSold += pSold;
      sm[machineName].dieselSold += dSold;
      sm[machineName].petrolTesting += pTest;
      sm[machineName].dieselTesting += dTest;
      sm[machineName].totalLiters += (pSold + dSold) || Number(item.totalQuantitySold || 0);
      sm[machineName].expectedAmount += Number(item.expectedTotalAmount || 0);
      sm[machineName].collectedAmount += Number(item.totalPayment || 0);
    });
    return Object.values(sm);
  }, [salesData]);

  // Extract all itemized Udhari entries across all shifts
  const allUdhariEntries = useMemo(() => {
    const list = [];
    salesData.forEach(item => {
      const salesman = salesmenMap[item.salesmanId] || item.salesmanName || 'Staff';
      if (item.udhariBreakdown && Array.isArray(item.udhariBreakdown)) {
        item.udhariBreakdown.forEach(u => {
          if (u.name && Number(u.amount) > 0) {
            list.push({ ...u, salesman });
          }
        });
      }
    });
    return list;
  }, [salesData, salesmenMap]);

  // Extract all itemized Salary Advance entries across all shifts & direct logs
  const allSalaryAdvanceEntries = useMemo(() => {
    const list = [];
    const seenKeys = new Set();

    // 1. From salesData shifts expenseBreakdown
    salesData.forEach(item => {
      const shiftStaff = salesmenMap[item.salesmanId] || item.salesmanName || 'Staff';
      if (item.expenseBreakdown && Array.isArray(item.expenseBreakdown)) {
        item.expenseBreakdown.forEach((e, idx) => {
          const amt = Number(e.amount || 0);
          if (amt > 0 && isSalaryAdvance(e)) {
            const recipientName = e.salesmanName || (e.salesmanId ? salesmenMap[e.salesmanId] : null) || shiftStaff;
            const key = `${item.id}_${e.id || idx}_${amt}`;
            seenKeys.add(key);
            list.push({
              id: key,
              recipientName,
              amount: amt,
              notes: e.notes || e.reason || 'Salary Advance',
              shiftStaff,
              machineName: item.machineName || item.machineId || 'Machine',
              reportId: item.id,
              source: 'shift'
            });
          }
        });
      }
    });

    // 2. From staff_salary_advances collection (e.g. direct advances or standalone)
    salaryAdvancesData.forEach(adv => {
      const amt = Number(adv.amount || 0);
      if (amt <= 0) return;
      const alreadyCaptured = adv.reportId && list.some(x => x.reportId === adv.reportId && Math.abs(x.amount - amt) < 0.01);
      if (!alreadyCaptured) {
        const recipientName = adv.salesmanName || (adv.salesmanId ? salesmenMap[adv.salesmanId] : null) || 'Staff';
        list.push({
          id: adv.id,
          recipientName,
          amount: amt,
          notes: adv.notes || adv.reason || 'Salary Advance',
          shiftStaff: adv.salesmanName || 'Direct Advance',
          machineName: adv.machineName || '-',
          reportId: adv.reportId || '',
          source: 'direct'
        });
      }
    });

    return list;
  }, [salesData, salaryAdvancesData, salesmenMap]);

  // Extract all itemized General Operating Expense entries across all shifts
  const allExpenseEntries = useMemo(() => {
    const list = [];
    salesData.forEach(item => {
      const salesman = salesmenMap[item.salesmanId] || item.salesmanName || 'Staff';
      if (item.expenseBreakdown && Array.isArray(item.expenseBreakdown)) {
        item.expenseBreakdown.forEach(e => {
          const amt = Number(e.amount || 0);
          if (amt > 0 && !isSalaryAdvance(e)) {
            list.push({
              ...e,
              reason: e.reason || 'Pump Operating Expense',
              amount: amt,
              salesman
            });
          }
        });
      }
    });
    return list;
  }, [salesData, salesmenMap]);

  const totalSalaryAdvanceAmount = useMemo(() => {
    return allSalaryAdvanceEntries.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  }, [allSalaryAdvanceEntries]);

  const totalOperatingExpenseAmount = useMemo(() => {
    return allExpenseEntries.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  }, [allExpenseEntries]);

  // Compute Summary for Fuel Additions
  const additionsSummary = useMemo(() => {
    let petrolLiters = 0;
    let dieselLiters = 0;
    let tankerCount = 0;
    let testingReturnedLiters = 0;

    additionsData.forEach(item => {
      if (item.type === 'testing_returned') {
        testingReturnedLiters += Number(item.petrolTestingLiters || 0) + Number(item.dieselTestingLiters || 0);
      } else {
        tankerCount += 1;
        const pQty = Number(item.petrolAdded || (item.fuelType === 'Petrol' ? item.addedLiters : 0) || 0);
        const dQty = Number(item.dieselAdded || (item.fuelType === 'Diesel' ? item.addedLiters : 0) || 0);
        petrolLiters += pQty;
        dieselLiters += dQty;
      }
    });

    return {
      petrolLiters,
      dieselLiters,
      tankerCount,
      testingReturnedLiters
    };
  }, [additionsData]);

  const isDaySettled = salesData.length > 0 && salesData.every(item => item.isSettled === true);

  // Generate and Share PDF for Fuel Additions Ledger
  const generateAdditionsPDF = async () => {
    try {
      if (additionsData.length === 0) {
        Alert.alert("Info", "No fuel addition data available to export.");
        return;
      }

      let rowsHtml = '';
      let sNo = 1;
      additionsData.forEach(item => {
        if (item.type === 'testing_returned') return;
        const isDiesel = item.fuelType === 'Diesel' || item.dieselAdded > 0;
        const liters = item.addedLiters || (isDiesel ? item.dieselAdded : item.petrolAdded) || 0;
        const dateStr = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : (item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN') : 'N/A');

        rowsHtml += `
          <tr>
            <td style="text-align: center;">${sNo++}</td>
            <td>${dateStr}</td>
            <td><strong>${item.tankId || 'Tank'}</strong></td>
            <td style="color: ${isDiesel ? '#003C8F' : '#EA580C'}; font-weight: bold;">${item.fuelType || (isDiesel ? 'Diesel' : 'Petrol')}</td>
            <td><strong>${item.tankerNumber || 'N/A'}</strong></td>
            <td>${item.invoiceNumber || 'N/A'}</td>
            <td>${item.driverName || 'N/A'}</td>
            <td>${item.driverPhone || 'N/A'}</td>
            <td>${item.supplier || 'IOCL Baitalpur Depot'}</td>
            <td style="text-align: right; font-weight: bold;">${parseFloat(liters).toLocaleString('en-IN')} L</td>
            <td>${item.operatorName || '—'}</td>
          </tr>
        `;
      });

      const monthYearStr = selectedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const dateHeading = additionsViewMode === 'month' 
        ? `Fuel Deliveries Ledger - This Month (${monthYearStr})` 
        : `Fuel Deliveries Ledger - ${selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Fuel Addition Ledger</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #1E293B; }
            .header { text-align: center; border-bottom: 2px solid #003C8F; padding-bottom: 12px; margin-bottom: 16px; }
            .company { font-size: 22px; font-weight: 900; color: #003C8F; margin: 0; }
            .sub { font-size: 13px; color: #64748B; margin-top: 4px; }
            .title { font-size: 16px; font-weight: bold; color: #0F172A; margin-top: 10px; }
            .summary-cards { display: flex; justify-content: space-between; margin-bottom: 16px; gap: 10px; }
            .card { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 6px; }
            .card-label { font-size: 11px; color: #64748B; font-weight: bold; }
            .card-val { font-size: 16px; font-weight: 900; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
            th { background-color: #003C8F; color: white; padding: 8px 6px; text-align: left; font-weight: bold; }
            td { padding: 8px 6px; border-bottom: 1px solid #E2E8F0; }
            tr:nth-child(even) { background-color: #F8FAFC; }
            .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="company">BAIJNATH PETROLEUM</h1>
            <div class="sub">Indian Oil Dealer (IOCL) • Retail Outlet, Baitalpur</div>
            <div class="title">${dateHeading}</div>
          </div>

          <div class="summary-cards">
            <div class="card" style="border-left: 4px solid #FF6F00;">
              <div class="card-label">TOTAL PETROL (MS)</div>
              <div class="card-val" style="color: #FF6F00;">${additionsSummary.petrolLiters.toLocaleString('en-IN')} L</div>
            </div>
            <div class="card" style="border-left: 4px solid #003C8F;">
              <div class="card-label">TOTAL DIESEL (HSD)</div>
              <div class="card-val" style="color: #003C8F;">${additionsSummary.dieselLiters.toLocaleString('en-IN')} L</div>
            </div>
            <div class="card" style="border-left: 4px solid #0284C7;">
              <div class="card-label">TOTAL FUEL DELIVERED</div>
              <div class="card-val" style="color: #0284C7;">${(additionsSummary.petrolLiters + additionsSummary.dieselLiters).toLocaleString('en-IN')} L</div>
            </div>
            <div class="card" style="border-left: 4px solid #10B981;">
              <div class="card-label">TANKER DELIVERIES</div>
              <div class="card-val" style="color: #10B981;">${additionsSummary.tankerCount}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: center;">S.No</th>
                <th>Date & Time</th>
                <th>Tank</th>
                <th>Fuel</th>
                <th>Tanker TT No.</th>
                <th>Challan / Inv</th>
                <th>Driver Name</th>
                <th>Driver Mobile</th>
                <th>Depot</th>
                <th style="text-align: right;">Quantity</th>
                <th>Received By</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            Generated on ${new Date().toLocaleString('en-IN')} • Official Fuel Inventory & Stock Unloading Ledger
          </div>
        </body>
        </html>
      `;

      const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });
      let shareUri = uri;
      try {
        const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (baseDir && base64) {
          const destUri = `${baseDir}Fuel_Deliveries_${Date.now()}.pdf`;
          await FileSystem.writeAsStringAsync(destUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          shareUri = destUri;
        }
      } catch (fsErr) {
        console.warn('FileSystem additions report write warning:', fsErr);
      }

      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } else {
          await Print.printAsync({ html });
        }
      } catch (shareError) {
        console.warn('Sharing error, falling back to printAsync:', shareError);
        await Print.printAsync({ html });
      }
    } catch (err) {
      console.error("Error generating additions PDF:", err);
      Alert.alert("Error", "Could not export fuel additions PDF: " + err.message);
    }
  };

  const generatePDF = async () => {
    try {
      if (salesData.length === 0) {
        Alert.alert("Info", "No sales data available to generate report.");
        return;
      }
      
      let shiftRows = '';
      let udhariRows = '';
      let expenseRows = '';
      let salaryAdvanceRows = '';

      allSalaryAdvanceEntries.forEach(adv => {
        salaryAdvanceRows += `
          <tr>
            <td><strong>${adv.recipientName}</strong></td>
            <td>${adv.shiftStaff} (${adv.machineName})</td>
            <td>${adv.notes || 'Salary Advance'}</td>
            <td style="font-weight: bold; color: #B45309;">₹${Number(adv.amount).toFixed(2)}</td>
          </tr>
        `;
      });

      salesData.forEach((item, index) => {
        const salesmanName = salesmenMap[item.salesmanId] || item.salesmanName || item.salesmanId;
        const pSold = Number(item.petrolQuantitySold ?? (item.fuelType === 'Petrol' ? item.totalQuantitySold : 0) ?? 0);
        const dSold = Number(item.dieselQuantitySold ?? (item.fuelType === 'Diesel' ? item.totalQuantitySold : 0) ?? 0);
        const pTesting = Number(item.petrolTesting ?? (item.fuelType === 'Petrol' ? item.testingQuantity : 0) ?? 0);
        const dTesting = Number(item.dieselTesting ?? (item.fuelType === 'Diesel' ? item.testingQuantity : 0) ?? 0);
        const testingQty = (pTesting + dTesting || Number(item.testingQuantity || 0)).toFixed(2);
        const shortage = Number(item.shortageOrExcess || 0);
        const shortageStr = shortage < 0 
          ? `<span style="color: #DC2626; font-weight: bold;">₹${Math.abs(shortage).toFixed(2)} (S)</span>` 
          : `<span style="color: #059669; font-weight: bold;">₹${Math.abs(shortage).toFixed(2)} (E)</span>`;

        shiftRows += `
          <tr>
            <td>${index + 1}</td>
            <td>${salesmanName}</td>
            <td>${item.machineName || item.machineId || 'Machine'} (${item.petrolNozzleId || 'N1'}+${item.dieselNozzleId || 'N2'})</td>
            <td>${pSold.toFixed(2)}</td>
            <td>${dSold.toFixed(2)}</td>
            <td>${testingQty}</td>
            <td>₹${Number(item.expectedTotalAmount || 0).toFixed(2)}</td>
            <td>₹${Number(item.totalPayment || 0).toFixed(2)}</td>
            <td>${shortageStr}</td>
          </tr>
        `;

        if (item.udhariBreakdown && item.udhariBreakdown.length > 0) {
          item.udhariBreakdown.forEach(udhari => {
            if (udhari.name && Number(udhari.amount) > 0) {
              udhariRows += `
                <tr>
                  <td>${salesmanName}</td>
                  <td>${udhari.name}</td>
                  <td>₹${Number(udhari.amount).toFixed(2)}</td>
                </tr>
              `;
            }
          });
        }

        if (item.expenseBreakdown && item.expenseBreakdown.length > 0) {
          item.expenseBreakdown.forEach(exp => {
            if (!isSalaryAdvance(exp) && Number(exp.amount) > 0) {
              expenseRows += `
                <tr>
                  <td>${salesmanName}</td>
                  <td>${exp.reason || 'Pump Expense'}</td>
                  <td>₹${Number(exp.amount).toFixed(2)}</td>
                </tr>
              `;
            }
          });
        }
      });

      // Build Machine / Dispenser Unit Breakdown Table (DU1, DU2, etc.)
      let totalMachinePetrol = 0;
      let totalMachineDiesel = 0;
      let totalMachineTesting = 0;
      let totalMachineVolume = 0;
      let totalMachineExpected = 0;
      let totalMachineCollected = 0;

      let machineTableRows = '';
      if (machineSummary && machineSummary.length > 0) {
        machineSummary.forEach((m) => {
          const testTotal = (m.petrolTesting || 0) + (m.dieselTesting || 0);
          const mVariance = (m.collectedAmount || 0) - (m.expectedAmount || 0);
          totalMachinePetrol += (m.petrolSold || 0);
          totalMachineDiesel += (m.dieselSold || 0);
          totalMachineTesting += testTotal;
          totalMachineVolume += (m.totalLiters || 0);
          totalMachineExpected += (m.expectedAmount || 0);
          totalMachineCollected += (m.collectedAmount || 0);

          const mVarianceBadge = Math.abs(mVariance) < 1 
            ? `<span style="color: #059669; font-weight: 600;">₹0.00</span>` 
            : mVariance < 0
            ? `<span style="color: #DC2626; font-weight: 700;">-₹${Math.abs(mVariance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
            : `<span style="color: #16A34A; font-weight: 700;">+₹${mVariance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;

          machineTableRows += `
            <tr>
              <td style="font-weight: 700; color: #003C8F; padding: 9px 10px;">
                <div style="font-size: 13px;">Dispenser ${m.name}</div>
                <div style="font-size: 10px; color: #64748B; font-weight: normal;">Dual Nozzle Unit</div>
              </td>
              <td style="text-align: right; color: #EA580C; font-weight: 700; padding: 9px 10px;">
                ${(m.petrolSold || 0).toFixed(2)} L
                ${(m.petrolTesting || 0) > 0 ? `<br/><span style="font-size: 9px; color: #92400E; font-weight: normal;">(Test: ${(m.petrolTesting).toFixed(1)}L)</span>` : ''}
              </td>
              <td style="text-align: right; color: #0284C7; font-weight: 700; padding: 9px 10px;">
                ${(m.dieselSold || 0).toFixed(2)} L
                ${(m.dieselTesting || 0) > 0 ? `<br/><span style="font-size: 9px; color: #92400E; font-weight: normal;">(Test: ${(m.dieselTesting).toFixed(1)}L)</span>` : ''}
              </td>
              <td style="text-align: right; color: #92400E; font-weight: 600; padding: 9px 10px;">
                ${testTotal > 0 ? `${testTotal.toFixed(2)} L` : '-'}
              </td>
              <td style="text-align: right; font-weight: 800; color: #0F172A; font-size: 13px; padding: 9px 10px;">
                ${(m.totalLiters || 0).toFixed(2)} L
              </td>
              <td style="text-align: right; color: #334155; font-weight: 600; padding: 9px 10px;">
                ₹${(m.expectedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td style="text-align: right; font-weight: 700; color: #15803D; padding: 9px 10px;">
                ₹${(m.collectedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td style="text-align: right; padding: 9px 10px;">
                ${mVarianceBadge}
              </td>
            </tr>
          `;
        });
      } else {
        machineTableRows = `
          <tr>
            <td colspan="8" style="text-align: center; color: #64748B; padding: 14px;">No dispenser data recorded for this date.</td>
          </tr>
        `;
      }

      const totalMachineVariance = totalMachineCollected - totalMachineExpected;
      const totalMachineVarianceBadge = Math.abs(totalMachineVariance) < 1
        ? `<span style="color: #059669; font-weight: 700;">₹0.00</span>`
        : totalMachineVariance < 0
        ? `<span style="color: #DC2626; font-weight: 800;">-₹${Math.abs(totalMachineVariance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`
        : `<span style="color: #16A34A; font-weight: 800;">+₹${totalMachineVariance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;

      const isNetShortage = summary.shortageOrExcess < 0;
      const isNetBalanced = Math.abs(summary.shortageOrExcess) < 1;

      const dateStr = selectedDate.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });

      const generationTimestamp = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const settleStatusStr = isDaySettled 
        ? `<div class="settle-pill settled">
             <span class="status-icon">✓</span>
             <span><strong>BANK STATUS: SETTLED</strong> — All collections reconciled and deposited into bank account.</span>
           </div>`
        : `<div class="settle-pill pending">
             <span class="status-icon">⏳</span>
             <span><strong>BANK STATUS: PENDING</strong> — Cash and digital collections awaiting day-end deposit reconciliation.</span>
           </div>`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <title>IndianOil Operations & Audit Report - ${dateStr}</title>
            <style>
              @page {
                size: A4 portrait;
                margin: 12mm 12mm 14mm 12mm;
              }
              * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
                padding: 0; 
                margin: 0; 
                color: #1E293B; 
                background-color: #FFFFFF;
                font-size: 12px;
                line-height: 1.45;
              }

              /* Corporate Header */
              .corp-header {
                border-bottom: 3px solid #003C8F;
                padding-bottom: 12px;
                margin-bottom: 14px;
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
              }
              .corp-brand-block {
                flex: 1;
              }
              .corp-brand-tag {
                display: inline-block;
                background-color: #EA580C;
                color: #FFFFFF;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.8px;
                text-transform: uppercase;
                padding: 2px 8px;
                border-radius: 4px;
                margin-bottom: 5px;
              }
              .corp-title { 
                font-size: 22px; 
                font-weight: 900; 
                color: #003C8F; 
                margin: 0; 
                letter-spacing: -0.3px;
              }
              .corp-subtitle { 
                font-size: 12px; 
                color: #64748B; 
                margin-top: 3px; 
                font-weight: 500;
              }
              .corp-meta-block {
                text-align: right;
              }
              .corp-date-badge {
                background-color: #EFF6FF;
                border: 1px solid #BFDBFE;
                color: #1E40AF;
                padding: 5px 12px;
                border-radius: 6px;
                font-weight: 700;
                font-size: 12px;
                display: inline-block;
              }
              .corp-timestamp {
                font-size: 10px;
                color: #94A3B8;
                margin-top: 4px;
              }

              /* Settlement Pill */
              .settle-pill {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 14px;
                border-radius: 8px;
                margin-bottom: 14px;
                font-size: 11px;
              }
              .settle-pill.settled {
                background-color: #ECFDF5;
                border: 1px solid #A7F3D0;
                color: #065F46;
              }
              .settle-pill.pending {
                background-color: #FFFBEB;
                border: 1px solid #FDE68A;
                color: #92400E;
              }
              .status-icon {
                font-size: 14px;
                font-weight: bold;
              }

              /* KPI Cards Grid */
              .kpi-grid {
                display: flex;
                gap: 10px;
                margin-bottom: 14px;
              }
              .kpi-card {
                flex: 1;
                background-color: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 8px;
                padding: 10px 12px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.02);
              }
              .kpi-card.highlight-petrol {
                border-top: 3px solid #EA580C;
              }
              .kpi-card.highlight-diesel {
                border-top: 3px solid #0284C7;
              }
              .kpi-card.highlight-revenue {
                border-top: 3px solid #003C8F;
              }
              .kpi-card.highlight-variance {
                border-top: 3px solid ${isNetBalanced ? '#059669' : (isNetShortage ? '#DC2626' : '#16A34A')};
              }
              .kpi-label {
                font-size: 10px;
                font-weight: 700;
                color: #64748B;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
              }
              .kpi-val {
                font-size: 18px;
                font-weight: 900;
                color: #0F172A;
              }
              .kpi-sub {
                font-size: 9.5px;
                color: #64748B;
                margin-top: 2px;
              }

              /* Section Card */
              .section-card {
                background-color: #FFFFFF;
                border: 1px solid #CBD5E1;
                border-radius: 8px;
                margin-bottom: 14px;
                overflow: hidden;
                page-break-inside: avoid;
              }
              .section-header {
                background-color: #F1F5F9;
                border-bottom: 1px solid #CBD5E1;
                padding: 8px 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
              }
              .section-header-title {
                font-size: 12px;
                font-weight: 800;
                color: #003C8F;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin: 0;
              }
              .section-badge {
                font-size: 10px;
                font-weight: 700;
                background-color: #E2E8F0;
                color: #334155;
                padding: 2px 8px;
                border-radius: 10px;
              }

              /* Modern Tables */
              table.data-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
              }
              table.data-table th {
                background-color: #003C8F;
                color: #FFFFFF;
                padding: 8px 10px;
                font-weight: 700;
                text-align: left;
                font-size: 10.5px;
                letter-spacing: 0.3px;
                border-bottom: 2px solid #002766;
              }
              table.data-table td {
                padding: 8px 10px;
                border-bottom: 1px solid #E2E8F0;
                font-size: 11px;
              }
              table.data-table tr:nth-child(even) {
                background-color: #F8FAFC;
              }
              table.data-table tr.total-row td {
                background-color: #F1F5F9;
                font-weight: 800;
                border-top: 2px solid #CBD5E1;
                border-bottom: 2px solid #CBD5E1;
                color: #0F172A;
              }

              /* Payment Ledger Grid */
              .payment-ledger-grid {
                display: flex;
                flex-wrap: wrap;
                padding: 10px 12px;
                gap: 10px;
              }
              .payment-pill {
                flex: 1 1 calc(33.333% - 10px);
                background-color: #F8FAFC;
                border: 1px solid #E2E8F0;
                border-radius: 6px;
                padding: 8px 10px;
              }
              .payment-pill-title {
                font-size: 10px;
                font-weight: 700;
                color: #64748B;
                text-transform: uppercase;
              }
              .payment-pill-amount {
                font-size: 15px;
                font-weight: 800;
                color: #0F172A;
                margin-top: 2px;
              }
              .payment-pill-sub {
                font-size: 9px;
                color: #94A3B8;
              }

              /* Sign-off Block */
              .signoff-section {
                margin-top: 22px;
                padding-top: 14px;
                border-top: 1px solid #CBD5E1;
                page-break-inside: avoid;
              }
              .signoff-grid {
                display: flex;
                justify-content: space-between;
                gap: 20px;
                margin-top: 40px;
              }
              .signoff-box {
                flex: 1;
                text-align: center;
                border-top: 1.5px dashed #64748B;
                padding-top: 6px;
              }
              .signoff-role {
                font-size: 11px;
                font-weight: 800;
                color: #0F172A;
              }
              .signoff-note {
                font-size: 9.5px;
                color: #64748B;
                margin-top: 2px;
              }

              .footer-disclaimer {
                text-align: center;
                font-size: 9.5px;
                color: #94A3B8;
                margin-top: 18px;
                padding-top: 10px;
                border-top: 1px solid #E2E8F0;
              }
            </style>
          </head>
          <body>
            <!-- Corporate Header -->
            <div class="corp-header">
              <div class="corp-brand-block">
                <span class="corp-brand-tag">IndianOil RO Audit</span>
                <h1 class="corp-title">Retail Outlet Operations & Audit</h1>
                <div class="corp-subtitle">Automated Dispenser Meter Reconcile & Daily Revenue Report</div>
              </div>
              <div class="corp-meta-block">
                <div class="corp-date-badge">📅 ${dateStr}</div>
                <div class="corp-timestamp">Generated: ${generationTimestamp}</div>
              </div>
            </div>

            <!-- Settlement Status Banner -->
            ${settleStatusStr}

            <!-- Executive KPI Summary Cards -->
            <div class="kpi-grid">
              <div class="kpi-card highlight-petrol">
                <div class="kpi-label">Petrol (MS) Sold</div>
                <div class="kpi-val" style="color: #EA580C;">${summary.petrolSold.toFixed(2)} L</div>
                <div class="kpi-sub">Testing deducted from gross</div>
              </div>

              <div class="kpi-card highlight-diesel">
                <div class="kpi-label">Diesel (HSD) Sold</div>
                <div class="kpi-val" style="color: #0284C7;">${summary.dieselSold.toFixed(2)} L</div>
                <div class="kpi-sub">Testing deducted from gross</div>
              </div>

              <div class="kpi-card highlight-revenue">
                <div class="kpi-label">Expected Revenue</div>
                <div class="kpi-val">₹${summary.expectedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                <div class="kpi-sub">Gross Meter Sales Value</div>
              </div>

              <div class="kpi-card highlight-variance">
                <div class="kpi-label">Net Variance</div>
                <div class="kpi-val" style="color: ${isNetBalanced ? '#059669' : (isNetShortage ? '#DC2626' : '#16A34A')};">
                  ${isNetBalanced ? '₹0.00' : (isNetShortage ? `-₹${Math.abs(summary.shortageOrExcess).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : `+₹${summary.shortageOrExcess.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`)}
                </div>
                <div class="kpi-sub">${isNetBalanced ? 'Exact match' : (isNetShortage ? 'Shortage vs Meter' : 'Excess vs Meter')}</div>
              </div>
            </div>

            <!-- Section 1: Dispenser Unit Breakdown (DU1, DU2 Fuel Sales Audit) -->
            <div class="section-card">
              <div class="section-header">
                <h3 class="section-header-title">1. Dispenser Unit Breakdown (DU1, DU2 Fuel Sales Audit)</h3>
                <span class="section-badge">${machineSummary.length} Dispenser Units</span>
              </div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Dispenser Unit</th>
                    <th style="text-align: right;">Petrol (MS)</th>
                    <th style="text-align: right;">Diesel (HSD)</th>
                    <th style="text-align: right;">Testing (L)</th>
                    <th style="text-align: right;">Total Net Sold</th>
                    <th style="text-align: right;">Expected (₹)</th>
                    <th style="text-align: right;">Collected (₹)</th>
                    <th style="text-align: right;">Variance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${machineTableRows}
                  <tr class="total-row">
                    <td>TOTAL ALL DISPENSERS</td>
                    <td style="text-align: right; color: #EA580C;">${totalMachinePetrol.toFixed(2)} L</td>
                    <td style="text-align: right; color: #0284C7;">${totalMachineDiesel.toFixed(2)} L</td>
                    <td style="text-align: right; color: #92400E;">${totalMachineTesting.toFixed(2)} L</td>
                    <td style="text-align: right; color: #0F172A; font-size: 13px;">${totalMachineVolume.toFixed(2)} L</td>
                    <td style="text-align: right;">₹${totalMachineExpected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: right; color: #15803D;">₹${totalMachineCollected.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: right;">${totalMachineVarianceBadge}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Section 2: Revenue & Payment Realization Ledger -->
            <div class="section-card">
              <div class="section-header">
                <h3 class="section-header-title">2. Revenue & Payment Realization Ledger</h3>
                <span class="section-badge">Total: ₹${summary.collectedTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div class="payment-ledger-grid">
                <div class="payment-pill">
                  <div class="payment-pill-title">💵 Cash Collection</div>
                  <div class="payment-pill-amount">₹${summary.cash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub">Cash drawer / physical currency</div>
                </div>
                <div class="payment-pill">
                  <div class="payment-pill-title">📱 PhonePe UPI</div>
                  <div class="payment-pill-amount">₹${summary.phonePe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub">Direct digital QR settlement</div>
                </div>
                <div class="payment-pill">
                  <div class="payment-pill-title">📱 Paytm UPI</div>
                  <div class="payment-pill-amount">₹${summary.paytm.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub">Direct digital QR settlement</div>
                </div>
                <div class="payment-pill">
                  <div class="payment-pill-title">📱 BharatPe UPI</div>
                  <div class="payment-pill-amount">₹${summary.bharatPe.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub">Direct digital QR settlement</div>
                </div>
                <div class="payment-pill">
                  <div class="payment-pill-title">📖 Customer Udhari (Khata)</div>
                  <div class="payment-pill-amount">₹${summary.udhari.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub">Signed credit ledger slips</div>
                </div>
                <div class="payment-pill">
                  <div class="payment-pill-title">🧾 Operating Expenses</div>
                  <div class="payment-pill-amount" style="color: #DC2626;">₹${totalOperatingExpenseAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub">Pump tea, generator, maintenance</div>
                </div>
                <div class="payment-pill" style="background-color: #FFFDF7; border-color: #FDE68A;">
                  <div class="payment-pill-title" style="color: #92400E;">💼 Staff Salary & Advances</div>
                  <div class="payment-pill-amount" style="color: #B45309;">₹${totalSalaryAdvanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  <div class="payment-pill-sub" style="color: #B45309;">Staff Salary & Advances</div>
                </div>
              </div>
            </div>

            <!-- Section 3: Staff Shift Logs & Nozzle Meter Breakdown -->
            <div class="section-card">
              <div class="section-header">
                <h3 class="section-header-title">3. Individual Staff Shifts & Nozzle Meter Audits</h3>
                <span class="section-badge">${salesData.length} Verified Shifts</span>
              </div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width: 25px;">#</th>
                    <th>Salesman</th>
                    <th>Dispenser & Nozzles</th>
                    <th style="text-align: right;">Petrol (L)</th>
                    <th style="text-align: right;">Diesel (L)</th>
                    <th style="text-align: right;">Testing (L)</th>
                    <th style="text-align: right;">Expected (₹)</th>
                    <th style="text-align: right;">Collected (₹)</th>
                    <th style="text-align: right;">Variance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${shiftRows}
                </tbody>
              </table>
            </div>

            <!-- Section 4: Staff Salary & Advances Itemized (Conditional) -->
            ${salaryAdvanceRows ? `
            <div class="section-card">
              <div class="section-header">
                <h3 class="section-header-title" style="color: #B45309;">4. Staff Salary & Advance Payments Audit</h3>
                <span class="section-badge" style="background-color: #FEF3C7; color: #92400E;">Total: ₹${totalSalaryAdvanceAmount.toLocaleString('en-IN')}</span>
              </div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Staff / Employee Name</th>
                    <th>Shift Staff (Machine)</th>
                    <th>Purpose / Notes</th>
                    <th style="text-align: right;">Advance Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${salaryAdvanceRows}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Section 5: Customer Udhari Ledger (Conditional) -->
            ${udhariRows ? `
            <div class="section-card">
              <div class="section-header">
                <h3 class="section-header-title" style="color: #7E22CE;">Customer Credit / Udhari (Khata) Itemized Slips</h3>
                <span class="section-badge" style="background-color: #F3E8FF; color: #6B21A8;">Total: ₹${summary.udhari.toLocaleString('en-IN')}</span>
              </div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Authorized By (Salesman)</th>
                    <th>Customer / Party Name</th>
                    <th style="text-align: right;">Credit Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${udhariRows}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Section 6: Operating Expenses (Conditional) -->
            ${expenseRows ? `
            <div class="section-card">
              <div class="section-header">
                <h3 class="section-header-title" style="color: #DC2626;">Pump Operating Expenses Itemized Breakdown</h3>
                <span class="section-badge" style="background-color: #FEE2E2; color: #991B1B;">Total: ₹${totalOperatingExpenseAmount.toLocaleString('en-IN')}</span>
              </div>
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Salesman / Cashier</th>
                    <th>Expense Description</th>
                    <th style="text-align: right;">Paid Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${expenseRows}
                </tbody>
              </table>
            </div>
            ` : ''}

            <!-- Official Sign-off & Audit Seal -->
            <div class="signoff-section">
              <div style="font-size: 11px; font-weight: 800; color: #003C8F; text-transform: uppercase; letter-spacing: 0.5px;">
                Official Audit & Reconciliation Verification
              </div>
              <div class="signoff-grid">
                <div class="signoff-box">
                  <div class="signoff-role">Shift In-Charge / Salesman</div>
                  <div class="signoff-note">Nozzle meter & collection verified</div>
                </div>
                <div class="signoff-box">
                  <div class="signoff-role">Station Manager / Cashier</div>
                  <div class="signoff-note">Bank cash & digital accounts verified</div>
                </div>
                <div class="signoff-box">
                  <div class="signoff-role">Proprietor / Auditor</div>
                  <div class="signoff-note">Final day-end audit approved</div>
                </div>
              </div>

              <div class="footer-disclaimer">
                This document is an electronically compiled audit record generated by IndianOil Pump Management App.<br/>
                All volume calculations are net of mandatory testing allowances and reconciled against digital nozzle pulse counters.
              </div>
            </div>
          </body>
        </html>
      `;

      const { uri, base64 } = await Print.printToFileAsync({ html: htmlContent, base64: true });
      let shareUri = uri;
      try {
        const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (baseDir && base64) {
          const destUri = `${baseDir}Audit_Report_${Date.now()}.pdf`;
          await FileSystem.writeAsStringAsync(destUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          shareUri = destUri;
        }
      } catch (fsErr) {
        console.warn('FileSystem report write warning:', fsErr);
      }

      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(shareUri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } else {
          await Print.printAsync({ html: htmlContent });
        }
      } catch (shareError) {
        console.warn('Sharing error, falling back to printAsync:', shareError);
        await Print.printAsync({ html: htmlContent });
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      Alert.alert("Error", "Could not generate PDF report.");
    }
  };

  const renderSummaryDashboard = () => {
    if (salesData.length === 0) return null;
    const isNetShortage = summary.shortageOrExcess < 0;
    
    return (
      <View style={styles.dashboardContainer}>
        {/* Official Paper Document Header */}
        <View style={styles.reportDocHeader}>
          <View style={styles.docHeaderTopRow}>
            <View style={styles.docSealBadge}>
              <Icon name="shield-checkmark" size={14} color="#003C8F" style={{ marginRight: 4 }} />
              <Text style={styles.docSealText}>OFFICIAL DAILY AUDIT REPORT</Text>
            </View>
            <Text style={styles.docIdText}>
              #REP-{selectedDate.getFullYear()}{String(selectedDate.getMonth() + 1).padStart(2, '0')}{String(selectedDate.getDate()).padStart(2, '0')}
            </Text>
          </View>

          <Text style={styles.docStationTitle}>INDIANOIL RETAIL OUTLET</Text>
          <Text style={styles.docSubTitle}>Daily Fuel Dispense & Financial Reconciliation Statement</Text>
          
          <View style={styles.docMetaRow}>
            <Text style={styles.docMetaText}>
              <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>Audit Date: </Text>
              {selectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
            <View style={styles.docStatusPill}>
              <Text style={styles.docStatusPillText}>
                ✓ {salesData.length} Shifts Reconciled
              </Text>
            </View>
          </View>

          {/* Prominent Export Official PDF Button */}
          <TouchableOpacity 
            style={styles.docExportPdfBtn} 
            onPress={generatePDF}
            activeOpacity={0.85}
          >
            <Icon name="cloud-download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.docExportPdfBtnText}>Download / Share Official PDF Report</Text>
          </TouchableOpacity>
        </View>

        {/* Section 1: Executive KPI Financial Statement */}
        <View style={styles.reportSectionCard}>
          <View style={styles.sectionTitleRow}>
            <Icon name="stats-chart" size={18} color="#003C8F" style={{ marginRight: 8 }} />
            <Text style={styles.sectionHeaderTitle}>1. Executive Financial & Volume Summary</Text>
          </View>

          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Expected Billing</Text>
              <Text style={styles.kpiValue}>₹{summary.expectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</Text>
              <Text style={styles.kpiSub}>Based on pump nozzle meters</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Realized Collection</Text>
              <Text style={[styles.kpiValue, { color: '#15803D' }]}>
                ₹{summary.collectedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </Text>
              <Text style={styles.kpiSub}>All cash, digital & credit</Text>
            </View>
          </View>

          {/* Variance Ledger Row */}
          <View style={[
            styles.varianceBanner,
            isNetShortage ? styles.varianceBannerShortage : styles.varianceBannerExcess
          ]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon
                name={isNetShortage ? 'alert-circle' : 'checkmark-circle'}
                size={20}
                color={isNetShortage ? '#DC2626' : '#15803D'}
                style={{ marginRight: 8 }}
              />
              <Text style={[
                styles.varianceTitle,
                { color: isNetShortage ? '#DC2626' : '#15803D' }
              ]}>
                {isNetShortage ? 'NET RECONCILIATION SHORTAGE' : (summary.shortageOrExcess > 0 ? 'NET RECONCILIATION EXCESS' : '100% BALANCED')}
              </Text>
            </View>
            <Text style={[
              styles.varianceAmount,
              { color: isNetShortage ? '#DC2626' : '#15803D' }
            ]}>
              {isNetShortage ? '-' : (summary.shortageOrExcess > 0 ? '+' : '')}₹{Math.abs(summary.shortageOrExcess).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* Section 2: Fuel Volume Ledger Table */}
        <View style={styles.reportSectionCard}>
          <View style={styles.sectionTitleRow}>
            <Icon name="water" size={18} color="#003C8F" style={{ marginRight: 8 }} />
            <Text style={styles.sectionHeaderTitle}>2. Fuel Dispense & Nozzle Audit</Text>
          </View>

          <View style={styles.tableWrap}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableColHeader, { flex: 1.5 }]}>Fuel Product</Text>
              <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'right' }]}>Sold (L)</Text>
              <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'right' }]}>Testing (L)</Text>
              <Text style={[styles.tableColHeader, { flex: 1.2, textAlign: 'right' }]}>Net Billed</Text>
            </View>

            {/* Petrol Row */}
            <View style={styles.tableBodyRow}>
              <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.fuelDot, { backgroundColor: '#EA580C' }]} />
                <Text style={styles.tableCellMain}>Petrol (MS)</Text>
              </View>
              <Text style={[styles.tableCellNum, { flex: 1, color: '#EA580C' }]}>
                {summary.petrolSold.toFixed(2)}
              </Text>
              <Text style={[styles.tableCellNum, { flex: 1, color: '#64748B' }]}>
                {salesData.reduce((acc, c) => acc + Number(c.petrolTesting || 0), 0).toFixed(2)}
              </Text>
              <Text style={[styles.tableCellBold, { flex: 1.2 }]}>
                {summary.petrolSold.toFixed(2)} L
              </Text>
            </View>

            {/* Diesel Row */}
            <View style={[styles.tableBodyRow, { backgroundColor: '#F8FAFC' }]}>
              <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center' }}>
                <View style={[styles.fuelDot, { backgroundColor: '#0284C7' }]} />
                <Text style={styles.tableCellMain}>Diesel (HSD)</Text>
              </View>
              <Text style={[styles.tableCellNum, { flex: 1, color: '#0284C7' }]}>
                {summary.dieselSold.toFixed(2)}
              </Text>
              <Text style={[styles.tableCellNum, { flex: 1, color: '#64748B' }]}>
                {salesData.reduce((acc, c) => acc + Number(c.dieselTesting || 0), 0).toFixed(2)}
              </Text>
              <Text style={[styles.tableCellBold, { flex: 1.2 }]}>
                {summary.dieselSold.toFixed(2)} L
              </Text>
            </View>

            {/* Total Row */}
            <View style={styles.tableTotalRow}>
              <Text style={[styles.tableTotalText, { flex: 1.5 }]}>Total Fuel Volume</Text>
              <Text style={[styles.tableTotalText, { flex: 1, textAlign: 'right' }]}>{summary.totalGrossSold.toFixed(2)}</Text>
              <Text style={[styles.tableTotalSub, { flex: 1, textAlign: 'right' }]}>-{summary.testingFuel.toFixed(2)}</Text>
              <Text style={[styles.tableTotalHighlight, { flex: 1.2, textAlign: 'right' }]}>
                {summary.totalGrossSold.toFixed(2)} L
              </Text>
            </View>
          </View>

          {/* Machine Wise Details Sub-table */}
          {machineSummary.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.subSectionTitle}>Dispenser / Machine Breakdown (DU1, DU2):</Text>
              {machineSummary.map((m, idx) => (
                <View key={idx} style={styles.machineCardModern}>
                  <View style={styles.machineCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.machineIconBadge}>
                        <Icon name="hardware-chip" size={15} color="#003C8F" />
                      </View>
                      <Text style={styles.machineCardTitle}>Machine {m.name}</Text>
                    </View>
                    <View style={styles.machineTotalBadge}>
                      <Text style={styles.machineTotalBadgeText}>{m.totalLiters.toFixed(2)} L Total</Text>
                    </View>
                  </View>

                  <View style={styles.machineFuelsRow}>
                    <View style={styles.machineFuelCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <View style={[styles.fuelDot, { backgroundColor: '#EA580C' }]} />
                        <Text style={styles.machineFuelColLabel}>Petrol (MS)</Text>
                      </View>
                      <Text style={[styles.machineFuelColVal, { color: '#EA580C' }]}>{m.petrolSold.toFixed(2)} L</Text>
                      {m.petrolTesting > 0 && (
                        <Text style={styles.machineFuelColSub}>Test: {m.petrolTesting.toFixed(1)} L</Text>
                      )}
                    </View>

                    <View style={styles.machineFuelDivider} />

                    <View style={styles.machineFuelCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <View style={[styles.fuelDot, { backgroundColor: '#0284C7' }]} />
                        <Text style={styles.machineFuelColLabel}>Diesel (HSD)</Text>
                      </View>
                      <Text style={[styles.machineFuelColVal, { color: '#0284C7' }]}>{m.dieselSold.toFixed(2)} L</Text>
                      {m.dieselTesting > 0 && (
                        <Text style={styles.machineFuelColSub}>Test: {m.dieselTesting.toFixed(1)} L</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.machineRevenueStrip}>
                    <Text style={styles.machineRevenueText}>
                      Exp: <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>₹{m.expectedAmount.toLocaleString('en-IN')}</Text>  •  Col: <Text style={{ fontWeight: 'bold', color: '#15803D' }}>₹{m.collectedAmount.toLocaleString('en-IN')}</Text>
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Section 3: Payment Accounts Ledger */}
        <View style={styles.reportSectionCard}>
          <View style={styles.sectionTitleRow}>
            <Icon name="wallet" size={18} color="#003C8F" style={{ marginRight: 8 }} />
            <Text style={styles.sectionHeaderTitle}>3. Revenue & Payment Realization Ledger</Text>
          </View>

          <View style={styles.paymentGrid}>
            <View style={styles.paymentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="cash" size={16} color="#15803D" />
                <Text style={styles.paymentCardLabel}>Cash Collection</Text>
              </View>
              <Text style={styles.paymentCardAmount}>₹{summary.cash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={styles.paymentCardNote}>Settled via Cash Management</Text>
            </View>

            <View style={styles.paymentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="qr-code" size={16} color="#6366F1" />
                <Text style={styles.paymentCardLabel}>UPI (PhonePe)</Text>
              </View>
              <Text style={styles.paymentCardAmount}>₹{summary.phonePe.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={styles.paymentCardNote}>Digital direct credit</Text>
            </View>

            <View style={styles.paymentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="scan" size={16} color="#0EA5E9" />
                <Text style={styles.paymentCardLabel}>UPI (Paytm)</Text>
              </View>
              <Text style={styles.paymentCardAmount}>₹{summary.paytm.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={styles.paymentCardNote}>Digital direct credit</Text>
            </View>

            <View style={styles.paymentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="phone-portrait" size={16} color="#D97706" />
                <Text style={styles.paymentCardLabel}>UPI (BharatPe)</Text>
              </View>
              <Text style={styles.paymentCardAmount}>₹{summary.bharatPe.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={styles.paymentCardNote}>Digital direct credit</Text>
            </View>

            <View style={styles.paymentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="book" size={16} color="#9333EA" />
                <Text style={styles.paymentCardLabel}>Customer Udhari</Text>
              </View>
              <Text style={styles.paymentCardAmount}>₹{summary.udhari.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={styles.paymentCardNote}>Credit book ledger</Text>
            </View>
 
            <View style={styles.paymentCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="receipt" size={16} color="#DC2626" />
                <Text style={styles.paymentCardLabel}>Operating Expenses</Text>
              </View>
              <Text style={styles.paymentCardAmount}>₹{totalOperatingExpenseAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={styles.paymentCardNote}>Tea, generator, pump</Text>
            </View>

            <View style={[styles.paymentCard, { backgroundColor: '#FFFDF7', borderColor: '#FDE68A' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="briefcase" size={16} color="#B45309" />
                <Text style={[styles.paymentCardLabel, { color: '#92400E' }]}>Salary Advances</Text>
              </View>
              <Text style={[styles.paymentCardAmount, { color: '#B45309' }]}>₹{totalSalaryAdvanceAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              <Text style={[styles.paymentCardNote, { color: '#B45309' }]}>Staff Salary / Advance</Text>
            </View>
          </View>
        </View>

        {/* Section 4: Customer Credit (Udhari) Itemized Audit (If any) */}
        {allUdhariEntries.length > 0 && (
          <View style={styles.reportSectionCard}>
            <View style={styles.sectionTitleRow}>
              <Icon name="book-outline" size={18} color="#9333EA" style={{ marginRight: 8 }} />
              <Text style={styles.sectionHeaderTitle}>4. Credit (Udhari) Itemized Audit</Text>
            </View>
            <View style={styles.itemizedList}>
              {allUdhariEntries.map((item, idx) => (
                <View key={idx} style={styles.itemizedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemizedPartyName}>{item.name}</Text>
                    <Text style={styles.itemizedStaffName}>Authorized by: {item.salesman}</Text>
                  </View>
                  <Text style={styles.itemizedAmount}>₹{Number(item.amount || 0).toLocaleString('en-IN')}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Section 5: Pump Operating Expenses Itemized Audit (If any) */}
        {allExpenseEntries.length > 0 && (
          <View style={styles.reportSectionCard}>
            <View style={styles.sectionTitleRow}>
              <Icon name="receipt-outline" size={18} color="#DC2626" style={{ marginRight: 8 }} />
              <Text style={styles.sectionHeaderTitle}>5. Operating Expenses Itemized Audit</Text>
            </View>
            <View style={styles.itemizedList}>
              {allExpenseEntries.map((item, idx) => (
                <View key={idx} style={styles.itemizedRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemizedPartyName}>{item.reason || 'Expense'}</Text>
                    <Text style={styles.itemizedStaffName}>Paid by: {item.salesman}</Text>
                  </View>
                  <Text style={[styles.itemizedAmount, { color: '#DC2626' }]}>
                    ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Section 6: Staff Salary & Advance Payments Audit (If any) */}
        {allSalaryAdvanceEntries.length > 0 && (
          <View style={styles.reportSectionCard}>
            <View style={styles.sectionTitleRow}>
              <Icon name="briefcase-outline" size={18} color="#B45309" style={{ marginRight: 8 }} />
              <Text style={styles.sectionHeaderTitle}>
                {allExpenseEntries.length > 0 ? '6. Staff Salary & Advance Payments Audit' : '5. Staff Salary & Advance Payments Audit'}
              </Text>
            </View>
            <View style={styles.itemizedList}>
              {allSalaryAdvanceEntries.map((item, idx) => (
                <View key={idx} style={styles.salaryItemRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.salaryStaffBadge}>
                        <Text style={styles.salaryStaffBadgeText}>
                          {(item.recipientName || 'S').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.itemizedPartyName}>{item.recipientName}</Text>
                    </View>
                    <Text style={styles.itemizedStaffName}>
                      {item.notes ? `${item.notes} • ` : ''}Shift: {item.shiftStaff} {item.machineName !== '-' ? `(${item.machineName})` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.itemizedAmount, { color: '#B45309' }]}>
                      ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.salaryTagText}>Salary Advance</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Staff Shifts Section Header */}
        <View style={styles.shiftsSectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="people" size={20} color="#003C8F" style={{ marginRight: 8 }} />
            <Text style={styles.shiftsHeaderTitle}>Staff Shift Audits ({salesData.length})</Text>
          </View>
          <Text style={styles.shiftsHeaderSub}>Individual verified shift receipts & nozzle meter readings</Text>
        </View>
      </View>
    );
  };

  const renderSalesCard = ({ item }) => {
    const endTime = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString([], { timeStyle: 'short' }) : 'N/A';
    const endDate = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString([], { dateStyle: 'medium' }) : 'N/A';
    const startTime = item.shiftStartTime?.toDate ? item.shiftStartTime.toDate().toLocaleTimeString([], { timeStyle: 'short' }) : 'N/A';
    
    const isShortage = (item.shortageOrExcess || 0) < 0;
    const isExpanded = expandedId === item.id;

    // Staff & Machine details
    const staffName = salesmenMap[item.salesmanId] || item.salesmanName || item.salesmanId || 'Staff';
    const machineName = item.machineName || item.machineId || 'Dispenser';

    // Petrol Details (Tank 1, N1)
    const pNozzle = item.petrolNozzleId || item.nozzleId || 'N1';
    const pTank = item.petrolTankId || 'Tank-1';
    const pOpening = String(item.petrolOpeningMeter || item.openingMeterReading || '0.0000');
    const pClosing = String(item.petrolClosingMeter || item.closingMeterReading || '0.0000');
    const pTesting = Number(item.petrolTesting ?? (item.fuelType === 'Petrol' ? item.testingQuantity : 0) ?? 0);
    const pSold = Number(item.petrolQuantitySold ?? (item.fuelType === 'Petrol' ? item.totalQuantitySold : 0) ?? 0);
    const pRate = Number(item.petrolRate || (item.fuelType === 'Petrol' ? item.fuelRate : 0) || 0);
    const pExpected = Number(item.petrolExpectedAmount ?? (pSold * pRate) ?? 0);
    const pMeterDiff = Math.max(0, parseFloat(pClosing) - parseFloat(pOpening));

    // Diesel Details (Tank 2, N2)
    const dNozzle = item.dieselNozzleId || 'N2';
    const dTank = item.dieselTankId || 'Tank-2';
    const dOpening = String(item.dieselOpeningMeter || '0.0000');
    const dClosing = String(item.dieselClosingMeter || '0.0000');
    const dTesting = Number(item.dieselTesting ?? (item.fuelType === 'Diesel' ? item.testingQuantity : 0) ?? 0);
    const dSold = Number(item.dieselQuantitySold ?? (item.fuelType === 'Diesel' ? item.totalQuantitySold : 0) ?? 0);
    const dRate = Number(item.dieselRate || (item.fuelType === 'Diesel' ? item.fuelRate : 0) || 0);
    const dExpected = Number(item.dieselExpectedAmount ?? (dSold * dRate) ?? 0);
    const dMeterDiff = Math.max(0, parseFloat(dClosing) - parseFloat(dOpening));

    // Total Testing & Shift Totals
    const totalTesting = pTesting + dTesting || Number(item.testingQuantity || 0);
    const totalLitersSold = Number(item.totalQuantitySold || (pSold + dSold)) || 0;
    const totalExpectedAmount = Number(item.expectedTotalAmount || (pExpected + dExpected)) || 0;
    const totalPayment = Number(item.totalPayment || 0);
    const shortageOrExcess = Number(item.shortageOrExcess || 0);

    // Payment breakdown
    const cashNotesAmt = Number(item.cashNotesAmount || 0);
    const coinsAmt = Number(item.coinsAmount || 0);
    const cashAmt = Number(item.cashAmount || (cashNotesAmt + coinsAmt)) || 0;
    const onlineAmt = Number(item.onlineAmount || 0) || (Number(item.phonePeAmount || 0) + Number(item.paytmAmount || 0) + Number(item.bharatPeAmount || 0));
    const udhariAmt = Number(item.udhariAmount || 0);
    const expenseAmt = Number(item.expenses || 0);

    const shiftSalaryAdvances = (item.expenseBreakdown || []).filter(e => isSalaryAdvance(e) && Number(e.amount || 0) > 0);
    const shiftGeneralExpenses = (item.expenseBreakdown || []).filter(e => !isSalaryAdvance(e) && Number(e.amount || 0) > 0);
    const shiftSalaryTotal = shiftSalaryAdvances.reduce((s, e) => s + Number(e.amount || 0), 0);
    const shiftGeneralTotal = shiftGeneralExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    return (
      <View style={styles.reportCard}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item.id)}>
          {/* Card Header */}
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.staffNameText}>
                {staffName}
              </Text>
              <Text style={styles.timeText}>
                Machine: <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>{machineName}</Text> • {startTime !== 'N/A' ? `Shift: ${startTime} – ${endTime}` : `Logged: ${endTime}`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.fuelBadgeSmall, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
                <Text style={[styles.fuelTextSmall, { color: '#EA580C' }]}>Petrol ({pNozzle})</Text>
              </View>
              <View style={[styles.fuelBadgeSmall, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE', marginLeft: 4 }]}>
                <Text style={[styles.fuelTextSmall, { color: '#0284C7' }]}>Diesel ({dNozzle})</Text>
              </View>
            </View>
          </View>
          
          {/* Fuel Volumes & Testing Summary Strip */}
          <View style={styles.shiftFuelStatsRow}>
            <View style={styles.shiftFuelBox}>
              <Text style={styles.shiftFuelLabel}>⛽ Petrol Sold</Text>
              <Text style={[styles.shiftFuelVal, { color: '#EA580C' }]}>{pSold.toFixed(2)} L</Text>
              <Text style={styles.shiftFuelSub}>Test: {pTesting.toFixed(1)} L</Text>
            </View>
            <View style={styles.shiftFuelBox}>
              <Text style={styles.shiftFuelLabel}>🛢️ Diesel Sold</Text>
              <Text style={[styles.shiftFuelVal, { color: '#0284C7' }]}>{dSold.toFixed(2)} L</Text>
              <Text style={styles.shiftFuelSub}>Test: {dTesting.toFixed(1)} L</Text>
            </View>
            <View style={styles.shiftFuelBox}>
              <Text style={styles.shiftFuelLabel}>📊 Total Sold</Text>
              <Text style={[styles.shiftFuelVal, { color: '#0F172A' }]}>{totalLitersSold.toFixed(2)} L</Text>
              <Text style={styles.shiftFuelSub}>Test: {totalTesting.toFixed(1)} L</Text>
            </View>
          </View>

          {/* Financial Summary Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Expected (₹)</Text>
              <Text style={styles.statValue}>₹{totalExpectedAmount.toFixed(0)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Collected (₹)</Text>
              <Text style={[styles.statValue, { color: '#15803D' }]}>₹{totalPayment.toFixed(0)}</Text>
            </View>
            <View style={[
              styles.statBox,
              { backgroundColor: isShortage ? '#FEF2F2' : '#F0FDF4', borderColor: isShortage ? '#FECACA' : '#BBF7D0' }
            ]}>
              <Text style={[styles.statLabel, { color: isShortage ? '#DC2626' : '#15803D', fontWeight: 'bold' }]}>
                {isShortage ? 'Shortage' : 'Excess'}
              </Text>
              <Text style={[styles.statValue, { color: isShortage ? '#DC2626' : '#15803D' }]}>
                {isShortage ? '-' : '+'}₹{Math.abs(shortageOrExcess).toFixed(0)}
              </Text>
            </View>
          </View>
          
          <View style={styles.expandToggle}>
            <Text style={styles.expandText}>{isExpanded ? 'Hide Full Shift Breakdown' : 'View Full Shift Breakdown (Meters & Testing)'}</Text>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#003C8F" />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* 1. Petrol Dispenser Audit Block */}
            <View style={styles.fuelAuditBlock}>
              <View style={styles.fuelAuditTitleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.fuelDot, { backgroundColor: '#EA580C' }]} />
                  <Text style={styles.fuelAuditTitle}>Petrol (MS) – Nozzle {pNozzle} • {pTank}</Text>
                </View>
                <View style={[styles.fuelBadgeSmall, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
                  <Text style={[styles.fuelTextSmall, { color: '#EA580C' }]}>Rate: ₹{pRate.toFixed(2)}/L</Text>
                </View>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Opening Meter Reading:</Text>
                <Text style={styles.breakdownValueMono}>{pOpening}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Closing Meter Reading:</Text>
                <Text style={styles.breakdownValueMono}>{pClosing}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Meter Difference (Gross):</Text>
                <Text style={styles.breakdownValue}>{pMeterDiff.toFixed(2)} L</Text>
              </View>
              
              {/* Testing Deduction Highlight */}
              <View style={styles.testingBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="flask-outline" size={15} color="#B45309" style={{ marginRight: 6 }} />
                  <Text style={styles.testingBannerText}>Testing Fuel Deducted:</Text>
                </View>
                <Text style={styles.testingBannerVal}>-{pTesting.toFixed(2)} Liters</Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { fontWeight: 'bold', color: '#1E293B' }]}>Net Billed Petrol Volume:</Text>
                <Text style={[styles.breakdownValue, { color: '#EA580C', fontSize: 13 }]}>{pSold.toFixed(2)} Liters</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { fontWeight: 'bold', color: '#1E293B' }]}>Petrol Expected Amount:</Text>
                <Text style={[styles.breakdownValue, { color: '#0F172A', fontSize: 13 }]}>₹{pExpected.toFixed(2)}</Text>
              </View>
            </View>

            {/* 2. Diesel Dispenser Audit Block */}
            <View style={styles.fuelAuditBlock}>
              <View style={styles.fuelAuditTitleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.fuelDot, { backgroundColor: '#0284C7' }]} />
                  <Text style={styles.fuelAuditTitle}>Diesel (HSD) – Nozzle {dNozzle} • {dTank}</Text>
                </View>
                <View style={[styles.fuelBadgeSmall, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                  <Text style={[styles.fuelTextSmall, { color: '#0284C7' }]}>Rate: ₹{dRate.toFixed(2)}/L</Text>
                </View>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Opening Meter Reading:</Text>
                <Text style={styles.breakdownValueMono}>{dOpening}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Closing Meter Reading:</Text>
                <Text style={styles.breakdownValueMono}>{dClosing}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Meter Difference (Gross):</Text>
                <Text style={styles.breakdownValue}>{dMeterDiff.toFixed(2)} L</Text>
              </View>
              
              {/* Testing Deduction Highlight */}
              <View style={styles.testingBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="flask-outline" size={15} color="#B45309" style={{ marginRight: 6 }} />
                  <Text style={styles.testingBannerText}>Testing Fuel Deducted:</Text>
                </View>
                <Text style={styles.testingBannerVal}>-{dTesting.toFixed(2)} Liters</Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { fontWeight: 'bold', color: '#1E293B' }]}>Net Billed Diesel Volume:</Text>
                <Text style={[styles.breakdownValue, { color: '#0284C7', fontSize: 13 }]}>{dSold.toFixed(2)} Liters</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { fontWeight: 'bold', color: '#1E293B' }]}>Diesel Expected Amount:</Text>
                <Text style={[styles.breakdownValue, { color: '#0F172A', fontSize: 13 }]}>₹{dExpected.toFixed(2)}</Text>
              </View>
            </View>

            {/* Total Shift Testing Summary */}
            <View style={styles.totalTestingBanner}>
              <Icon name="flask" size={16} color="#B45309" style={{ marginRight: 6 }} />
              <Text style={styles.totalTestingText}>
                Total Shift Testing: <Text style={{ fontWeight: '900' }}>{totalTesting.toFixed(2)} L</Text> (Petrol: {pTesting.toFixed(2)} L • Diesel: {dTesting.toFixed(2)} L poured back to tanks)
              </Text>
            </View>

            {/* 3. Realized Collections */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Realized Collections</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Cash Collected:</Text>
                <Text style={[styles.breakdownValue, { color: '#15803D' }]}>
                  ₹{cashAmt.toLocaleString('en-IN')} {coinsAmt > 0 ? `(Notes: ₹${cashNotesAmt}, Coins: ₹${coinsAmt})` : ''}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Digital / Online Payments:</Text>
                <Text style={[styles.breakdownValue, { color: '#0284C7' }]}>₹{onlineAmt.toLocaleString('en-IN')}</Text>
              </View>
              {Number(item.phonePeAmount || 0) > 0 && (
                <Text style={styles.subDetailText}>  • PhonePe: ₹{item.phonePeAmount}</Text>
              )}
              {Number(item.paytmAmount || 0) > 0 && (
                <Text style={styles.subDetailText}>  • Paytm: ₹{item.paytmAmount}</Text>
              )}
              {Number(item.bharatPeAmount || 0) > 0 && (
                <Text style={styles.subDetailText}>  • BharatPe: ₹{item.bharatPeAmount}</Text>
              )}
              {(Number(item.atmAmount || 0) + Number(item.debitCardAmount || 0) + Number(item.creditCardAmount || 0)) > 0 && (
                <Text style={styles.subDetailText}>  • ATM / Card Swipes: ₹{Number(item.atmAmount || 0) + Number(item.debitCardAmount || 0) + Number(item.creditCardAmount || 0)}</Text>
              )}
            </View>

            {/* 4. Deductions (Udhari & Expenses & Staff Salary Advances) */}
            <View style={[styles.sectionBlock, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <Text style={styles.sectionTitle}>Customer Credit & Deductions</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Customer Credit / Udhari:</Text>
                <Text style={[styles.breakdownValue, { color: '#9333EA' }]}>₹{udhariAmt.toLocaleString('en-IN')}</Text>
              </View>
              {item.udhariBreakdown && item.udhariBreakdown.length > 0 && (
                <View style={{ marginLeft: 10, marginBottom: 6 }}>
                  {item.udhariBreakdown.map((udhari, i) => (
                    <Text key={i} style={{ fontSize: 11, color: '#6B7280' }}>• {udhari.name}: ₹{udhari.amount}</Text>
                  ))}
                </View>
              )}
              
              {/* Pump Operating Expenses (if any) */}
              {(shiftGeneralTotal > 0 || (expenseAmt > 0 && shiftSalaryAdvances.length === 0)) && (
                <View style={{ marginBottom: 6 }}>
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Shift Operating Expenses:</Text>
                    <Text style={[styles.breakdownValue, { color: '#DC2626' }]}>
                      ₹{(shiftGeneralTotal || expenseAmt).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {(shiftGeneralExpenses.length > 0 ? shiftGeneralExpenses : (item.expenseBreakdown || [])).map((exp, i) => (
                    <Text key={i} style={{ fontSize: 11, color: '#6B7280', marginLeft: 10 }}>
                      • {exp.reason || 'Operating Expense'}: ₹{exp.amount}
                    </Text>
                  ))}
                </View>
              )}

              {/* Staff Salary Advances (if any) */}
              {shiftSalaryAdvances.length > 0 && (
                <View style={styles.advanceCardMini}>
                  <View style={styles.breakdownRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon name="briefcase-outline" size={14} color="#B45309" style={{ marginRight: 5 }} />
                      <Text style={[styles.breakdownLabel, { color: '#92400E', fontWeight: 'bold' }]}>Staff Salary Advance:</Text>
                    </View>
                    <Text style={[styles.breakdownValue, { color: '#B45309' }]}>
                      ₹{shiftSalaryTotal.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {shiftSalaryAdvances.map((exp, i) => {
                    const recipient = exp.salesmanName || (exp.salesmanId ? salesmenMap[exp.salesmanId] : null) || staffName;
                    return (
                      <Text key={i} style={styles.advanceMiniItem}>
                        💼 <Text style={{ fontWeight: 'bold', color: '#78350F' }}>{recipient}</Text>: ₹{Number(exp.amount || 0).toLocaleString('en-IN')}
                        {exp.notes ? ` (${exp.notes})` : (exp.reason ? ` (${exp.reason})` : '')}
                      </Text>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Individual PDF Receipt Download */}
            <TouchableOpacity 
              style={styles.downloadPdfBtn}
              onPress={() => handleDownloadReportPdf(item)}
            >
              <Icon name="document-text-outline" size={18} color="#003C8F" />
              <Text style={styles.downloadPdfBtnText}>Download Shift Receipt PDF</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderAdditionsSummaryDashboard = () => {
    return (
      <View style={styles.additionsSummaryBox}>
        <View style={styles.additionsSummaryHeader}>
          <View>
            <Text style={styles.additionsSummaryTitle}>Fuel Deliveries & Tank Inventory</Text>
            <Text style={styles.additionsSummarySub}>
              {additionsViewMode === 'month' ? `Viewing all deliveries in ${selectedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}` : `Deliveries logged for ${selectedDate.toLocaleDateString('en-IN')}`}
            </Text>
          </View>
          <View style={styles.viewModeToggleRow}>
            <TouchableOpacity 
              style={[styles.modePill, additionsViewMode === 'day' && styles.modePillActive]}
              onPress={() => setAdditionsViewMode('day')}
            >
              <Text style={[styles.modePillText, additionsViewMode === 'day' && styles.modePillTextActive]}>Day</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modePill, additionsViewMode === 'month' && styles.modePillActive]}
              onPress={() => setAdditionsViewMode('month')}
            >
              <Text style={[styles.modePillText, additionsViewMode === 'month' && styles.modePillTextActive]}>This Month</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.additionsSummaryGrid}>
          <View style={[styles.additionSumCard, { borderLeftColor: '#FF6F00' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="flame" size={14} color="#FF6F00" style={{ marginRight: 4 }} />
              <Text style={styles.additionSumLabel}>Petrol (MS) Added</Text>
            </View>
            <Text style={[styles.additionSumVal, { color: '#FF6F00' }]}>
              {additionsSummary.petrolLiters.toLocaleString('en-IN')} L
            </Text>
          </View>

          <View style={[styles.additionSumCard, { borderLeftColor: '#003C8F' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="water" size={14} color="#003C8F" style={{ marginRight: 4 }} />
              <Text style={styles.additionSumLabel}>Diesel (HSD) Added</Text>
            </View>
            <Text style={[styles.additionSumVal, { color: '#003C8F' }]}>
              {additionsSummary.dieselLiters.toLocaleString('en-IN')} L
            </Text>
          </View>
        </View>

        <View style={[styles.additionsSummaryGrid, { marginTop: 8 }]}>
          <View style={[styles.additionSumCard, { borderLeftColor: '#10B981' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="bus-outline" size={14} color="#10B981" style={{ marginRight: 4 }} />
              <Text style={styles.additionSumLabel}>Tankers Unloaded</Text>
            </View>
            <Text style={[styles.additionSumVal, { color: '#10B981' }]}>
              {additionsSummary.tankerCount} Deliveries
            </Text>
          </View>

          <View style={[styles.additionSumCard, { borderLeftColor: '#0284C7' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="color-fill-outline" size={14} color="#0284C7" style={{ marginRight: 4 }} />
              <Text style={styles.additionSumLabel}>Total Fuel Delivered</Text>
            </View>
            <Text style={[styles.additionSumVal, { color: '#0284C7' }]}>
              {(additionsSummary.petrolLiters + additionsSummary.dieselLiters).toLocaleString('en-IN')} L
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderAdditionCard = ({ item }) => {
    const isTestingReturn = item.type === 'testing_returned';
    const isDiesel = item.fuelType === 'Diesel' || item.dieselAdded > 0;
    const dateStr = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : (item.timestamp ? new Date(item.timestamp).toLocaleString('en-IN') : 'N/A');

    if (isTestingReturn) {
      return (
        <View style={[styles.additionCard, { borderLeftColor: '#8B5CF6' }]}>
          <View style={styles.additionCardTop}>
            <View style={[styles.additionBadge, { backgroundColor: '#F3E8FF' }]}>
              <Icon name="refresh-circle-outline" size={16} color="#8B5CF6" style={{ marginRight: 4 }} />
              <Text style={[styles.additionBadgeText, { color: '#8B5CF6' }]}>Shift Testing Returned to Tanks</Text>
            </View>
            <Text style={styles.additionDateText}>{dateStr}</Text>
          </View>
          <Text style={styles.additionSalesmanText}>
            Staff: <Text style={{ fontWeight: 'bold', color: '#1E293B' }}>{item.salesmanName || 'Staff'}</Text> • Machine: {item.machineId || 'DU1'}
          </Text>
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: '#FFF7ED' }]}>
              <Text style={styles.statLabel}>Petrol Testing Poured Back</Text>
              <Text style={[styles.statValue, { color: '#EA580C' }]}>{item.petrolTestingLiters || 0} L</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: '#EFF6FF' }]}>
              <Text style={styles.statLabel}>Diesel Testing Poured Back</Text>
              <Text style={[styles.statValue, { color: '#003C8F' }]}>{item.dieselTestingLiters || 0} L</Text>
            </View>
          </View>
        </View>
      );
    }

    const liters = item.addedLiters || (isDiesel ? item.dieselAdded : item.petrolAdded) || 0;

    return (
      <View style={[styles.additionCard, { borderLeftColor: isDiesel ? '#003C8F' : '#FF6F00' }]}>
        <View style={styles.additionCardTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.additionBadge, { backgroundColor: isDiesel ? '#E0EDFF' : '#FFF3E0' }]}>
              <Icon name={isDiesel ? 'water' : 'flame'} size={14} color={isDiesel ? '#003C8F' : '#FF6F00'} style={{ marginRight: 4 }} />
              <Text style={[styles.additionBadgeText, { color: isDiesel ? '#003C8F' : '#FF6F00' }]}>
                {isDiesel ? 'Diesel (HSD)' : 'Petrol (MS)'}
              </Text>
            </View>
            <Text style={styles.additionTankLabel}>{item.tankId || item.tankName || 'Tank'}</Text>
          </View>
          <Text style={styles.additionDateText}>{dateStr}</Text>
        </View>

        {/* Quantity */}
        <View style={styles.additionMainRow}>
          <View>
            <Text style={styles.additionLitersLabel}>UNLOADED QUANTITY</Text>
            <Text style={[styles.additionLitersValue, { color: isDiesel ? '#003C8F' : '#FF6F00' }]}>
              +{parseFloat(liters).toLocaleString('en-IN')} L
            </Text>
          </View>
          <View style={styles.additionTypePill}>
            <Text style={styles.additionTypePillText}>Stock Delivery</Text>
          </View>
        </View>

        {/* Delivery Details - Clean 2-Column Grid */}
        <View style={styles.additionInfoBox}>
          {/* Row 1: Tanker TT & Challan / Inv */}
          <View style={styles.additionInfoRow}>
            <View style={styles.additionInfoCol}>
              <View style={styles.infoLabelRow}>
                <Icon name="bus" size={12} color="#0284C7" style={{ marginRight: 5 }} />
                <Text style={styles.infoFieldLabel}>TANKER TT NO.</Text>
              </View>
              <Text style={styles.infoFieldValue} numberOfLines={1}>
                {item.tankerNumber && item.tankerNumber !== 'N/A' ? item.tankerNumber : '—'}
              </Text>
            </View>
            <View style={styles.additionColDivider} />
            <View style={styles.additionInfoCol}>
              <View style={styles.infoLabelRow}>
                <Icon name="receipt" size={12} color="#059669" style={{ marginRight: 5 }} />
                <Text style={styles.infoFieldLabel}>CHALLAN / INV</Text>
              </View>
              <Text style={styles.infoFieldValue} numberOfLines={1}>
                {item.invoiceNumber && item.invoiceNumber !== 'N/A' ? item.invoiceNumber : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.additionRowDivider} />

          {/* Row 2: Driver Name & Phone */}
          <View style={styles.additionInfoRow}>
            <View style={styles.additionInfoCol}>
              <View style={styles.infoLabelRow}>
                <Icon name="person" size={12} color="#6366F1" style={{ marginRight: 5 }} />
                <Text style={styles.infoFieldLabel}>DRIVER NAME</Text>
              </View>
              <Text style={styles.infoFieldValue} numberOfLines={1}>
                {item.driverName && item.driverName !== 'N/A' ? item.driverName : '—'}
              </Text>
            </View>
            <View style={styles.additionColDivider} />
            <View style={styles.additionInfoCol}>
              <View style={styles.infoLabelRow}>
                <Icon name="call" size={12} color="#D97706" style={{ marginRight: 5 }} />
                <Text style={styles.infoFieldLabel}>DRIVER MOBILE</Text>
              </View>
              <Text style={styles.infoFieldValue} numberOfLines={1}>
                {item.driverPhone && item.driverPhone !== 'N/A' ? item.driverPhone : '—'}
              </Text>
            </View>
          </View>

          {/* Optional Row 3: Depot & Dip/Density */}
          {(item.supplier || item.dipReading || item.density) ? (
            <>
              <View style={styles.additionRowDivider} />
              <View style={styles.additionInfoRow}>
                {item.supplier ? (
                  <View style={[styles.additionInfoCol, { flex: 1 }]}>
                    <View style={styles.infoLabelRow}>
                      <Icon name="business" size={12} color="#64748B" style={{ marginRight: 5 }} />
                      <Text style={styles.infoFieldLabel}>SUPPLY DEPOT</Text>
                    </View>
                    <Text style={styles.infoFieldValue} numberOfLines={1}>{item.supplier}</Text>
                  </View>
                ) : null}

                {(item.dipReading || item.density) ? (
                  <>
                    {item.supplier ? <View style={styles.additionColDivider} /> : null}
                    <View style={styles.additionInfoCol}>
                      <View style={styles.infoLabelRow}>
                        <Icon name="speedometer" size={12} color="#0F766E" style={{ marginRight: 5 }} />
                        <Text style={styles.infoFieldLabel}>DIP / DENSITY</Text>
                      </View>
                      <Text style={styles.infoFieldValue} numberOfLines={1}>
                        {[item.dipReading ? `Dip: ${item.dipReading}` : null, item.density ? `Den: ${item.density}` : null].filter(Boolean).join(' • ') || '—'}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
            </>
          ) : null}
        </View>

        {/* Footer */}
        <View style={styles.additionCardFooter}>
          <Text style={styles.footerOperatorText}>Received by: <Text style={{ fontWeight: 'bold' }}>{item.operatorName || '—'}</Text></Text>
          {item.note && <Text style={styles.additionNoteText}>Note: {item.note}</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topHeaderTitle}>Daily Audit Report</Text>
          <Text style={styles.topHeaderSub}>Official pump sales & financial ledger</Text>
        </View>
        {activeTab === 'sales' && salesData.length > 0 && (
          <TouchableOpacity style={styles.topExportBtn} onPress={generatePDF} activeOpacity={0.8}>
            <Icon name="cloud-download-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.topExportBtnText}>Export PDF</Text>
          </TouchableOpacity>
        )}
        {activeTab === 'additions' && additionsData.length > 0 && (
          <TouchableOpacity style={[styles.topExportBtn, { backgroundColor: '#059669' }]} onPress={generateAdditionsPDF} activeOpacity={0.8}>
            <Icon name="cloud-download-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.topExportBtnText}>Export PDF</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'sales' && styles.activeTab]}
          onPress={() => setActiveTab('sales')}
        >
          <Icon name="newspaper-outline" size={16} color={activeTab === 'sales' ? '#003C8F' : '#64748B'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'sales' && styles.activeTabText]}>Daily Audit Report</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'additions' && styles.activeTab]}
          onPress={() => setActiveTab('additions')}
        >
          <Icon name="water-outline" size={16} color={activeTab === 'additions' ? '#003C8F' : '#64748B'} style={{ marginRight: 6 }} />
          <Text style={[styles.tabText, activeTab === 'additions' && styles.activeTabText]}>Fuel Additions</Text>
        </TouchableOpacity>
      </View>

      {/* Date Switcher Bar with Prev / Date / Next / Today */}
      <View style={styles.dateNavigatorBar}>
        <TouchableOpacity
          style={styles.dateNavArrowBtn}
          onPress={() => changeDateByDays(-1)}
          activeOpacity={0.7}
        >
          <Icon name="chevron-back" size={20} color="#003C8F" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.dateCenterBtn} 
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.8}
        >
          <Icon name="calendar-outline" size={18} color="#003C8F" style={{ marginRight: 8 }} />
          <Text style={styles.dateCenterBtnText}>
            {selectedDate.toLocaleDateString('en-IN', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </Text>
          <Icon name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 6 }} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateNavArrowBtn}
          onPress={() => changeDateByDays(1)}
          activeOpacity={0.7}
        >
          <Icon name="chevron-forward" size={20} color="#003C8F" />
        </TouchableOpacity>

        {!isToday && (
          <TouchableOpacity
            style={styles.todayQuickBtn}
            onPress={() => setSelectedDate(new Date())}
            activeOpacity={0.8}
          >
            <Text style={styles.todayQuickBtnText}>Today</Text>
          </TouchableOpacity>
        )}
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {/* Report Content List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#003C8F" />
          <Text style={styles.loadingText}>Loading Daily Audit Report...</Text>
        </View>
      ) : (
        <FlatList 
          data={activeTab === 'sales' ? salesData : additionsData}
          keyExtractor={item => item.id}
          ListHeaderComponent={activeTab === 'sales' ? renderSummaryDashboard : renderAdditionsSummaryDashboard}
          renderItem={activeTab === 'sales' ? renderSalesCard : renderAdditionCard}
          contentContainerStyle={{ paddingBottom: 30 }}
          ListEmptyComponent={
            <View style={styles.emptyDocWrap}>
              <Icon name={activeTab === 'sales' ? "document-text-outline" : "water-outline"} size={54} color="#CBD5E1" />
              <Text style={styles.emptyDocTitle}>
                {activeTab === 'sales' ? 'No Audit Records Found' : 'No Fuel Deliveries Found'}
              </Text>
              <Text style={styles.emptyDocSub}>
                {activeTab === 'sales' 
                  ? `No shift sales reports were logged on ${selectedDate.toLocaleDateString('en-IN')}.`
                  : additionsViewMode === 'month' 
                    ? `No tanker deliveries found in ${selectedDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`
                    : `No fuel tanker deliveries were logged on ${selectedDate.toLocaleDateString('en-IN')}.`
                }
              </Text>
              {activeTab === 'additions' && additionsViewMode === 'day' && (
                <TouchableOpacity 
                  style={styles.switchModeEmptyBtn}
                  onPress={() => setAdditionsViewMode('month')}
                >
                  <Icon name="calendar-outline" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.switchModeEmptyBtnText}>View This Month's Deliveries</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          showsVerticalScrollIndicator={false}
          onEndReached={fetchMoreData}
          onEndReachedThreshold={0.5}
          ListFooterComponent={fetchingMore ? <ActivityIndicator size="small" color="#003C8F" style={{ marginVertical: 15 }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingTop: 10
  },

  // Top Header
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  topHeaderTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#003C8F',
    letterSpacing: 0.3
  },
  topHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  topExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#003C8F',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    elevation: 2
  },
  topExportBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },

  // Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8
  },
  activeTab: {
    backgroundColor: '#fff',
    elevation: 2
  },
  tabText: {
    fontWeight: '700',
    fontSize: 13,
    color: '#64748B'
  },
  activeTabText: {
    color: '#003C8F'
  },

  // Date Navigator Bar
  dateNavigatorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1
  },
  dateNavArrowBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#EFF6FF'
  },
  dateCenterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6
  },
  dateCenterBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  todayQuickBtn: {
    backgroundColor: '#003C8F',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 6
  },
  todayQuickBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold'
  },

  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500'
  },

  emptyDocWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 14,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  emptyDocTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155',
    marginTop: 10
  },
  emptyDocSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18
  },

  // Official Paper Document Header
  reportDocHeader: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3
  },
  docHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  docSealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  docSealText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#003C8F',
    letterSpacing: 0.5
  },
  docIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B'
  },
  docStationTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5
  },
  docSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10
  },
  docMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  docMetaText: {
    fontSize: 12,
    color: '#475569'
  },
  docStatusPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0'
  },
  docStatusPillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#15803D'
  },
  docExportPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 14,
    elevation: 2
  },
  docExportPdfBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.3
  },

  // Report Section Cards
  dashboardContainer: {
    marginBottom: 10
  },
  reportSectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 12
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B'
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B',
    textTransform: 'uppercase'
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4
  },
  kpiSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2
  },

  // Variance Banner
  varianceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 4
  },
  varianceBannerShortage: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA'
  },
  varianceBannerExcess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0'
  },
  varianceTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  varianceAmount: {
    fontSize: 16,
    fontWeight: '900'
  },

  // Table Layout for Fuel
  tableWrap: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1'
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    textTransform: 'uppercase'
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  fuelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  tableCellMain: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  tableCellNum: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  },
  tableCellBold: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right'
  },
  tableTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1.5,
    borderTopColor: '#BFDBFE'
  },
  tableTotalText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#003C8F'
  },
  tableTotalSub: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#CA8A04'
  },
  tableTotalHighlight: {
    fontSize: 14,
    fontWeight: '900',
    color: '#003C8F'
  },

  // Machine breakdown
  subSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 6
  },
  machineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  machineNameText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  machineLitersText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#003C8F'
  },
  machineAmountText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },

  // Payment Grid
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  paymentCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  paymentCardLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#334155',
    marginLeft: 6
  },
  paymentCardAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 6
  },
  paymentCardNote: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2
  },

  // Itemized Audit
  itemizedList: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden'
  },
  itemizedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#fff'
  },
  itemizedPartyName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  itemizedStaffName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  itemizedAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A'
  },

  // Shifts Section Header
  shiftsSectionHeader: {
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 10
  },
  shiftsHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#003C8F'
  },
  shiftsHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },

  // Shift Report Card
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  staffNameText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  date: {
    fontSize: 13,
    color: '#333',
    fontWeight: 'bold'
  },
  timeText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  fuelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8
  },
  fuelText: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9'
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0F172A'
  },
  shortageBox: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 4
  },
  shortageText: {
    fontSize: 13,
    fontWeight: 'bold'
  },
  expandToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  expandText: {
    color: '#003C8F',
    fontWeight: 'bold',
    fontSize: 12,
    marginRight: 4
  },
  expandedContent: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  sectionBlock: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  breakdownLabel: {
    color: '#64748B',
    fontSize: 12
  },
  breakdownValue: {
    fontWeight: 'bold',
    color: '#1E293B',
    fontSize: 12
  },
  downloadPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#003C8F',
    borderRadius: 8,
    paddingVertical: 9,
    marginTop: 8
  },
  downloadPdfBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003C8F',
    marginLeft: 6
  },

  // Dual Fuel Badges & Stats
  fuelBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  fuelTextSmall: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  shiftFuelStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  shiftFuelBox: {
    flex: 1,
    alignItems: 'center'
  },
  shiftFuelLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginBottom: 2
  },
  shiftFuelVal: {
    fontSize: 14,
    fontWeight: '900'
  },
  shiftFuelSub: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2
  },

  // Fuel Audit Block
  fuelAuditBlock: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  fuelAuditTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  fuelAuditTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  breakdownValueMono: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: 'bold',
    fontSize: 13,
    color: '#0F172A'
  },

  // Testing Deduction Banner
  testingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  testingBannerText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#92400E'
  },
  testingBannerVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#B45309'
  },

  totalTestingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  totalTestingText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1
  },
  subDetailText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },

  // Addition Card Styles
  additionsSummaryBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  additionsSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 10
  },
  additionsSummaryTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A'
  },
  additionsSummarySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  modePillActive: {
    backgroundColor: '#003C8F'
  },
  modePillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748B'
  },
  modePillTextActive: {
    color: '#fff'
  },
  additionsSummaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  additionSumCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4
  },
  additionSumLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B'
  },
  additionSumVal: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3
  },
  switchModeEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 14
  },
  switchModeEmptyBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#003C8F'
  },

  additionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#003C8F',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2
  },
  additionCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  additionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  additionBadgeText: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  additionTankLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#334155',
    marginLeft: 8
  },
  additionDateText: {
    fontSize: 11,
    color: '#94A3B8'
  },
  additionSalesmanText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 6
  },
  additionMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
    marginBottom: 8
  },
  additionLitersLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5
  },
  additionLitersValue: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2
  },
  additionAmountValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2
  },
  additionTypePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  additionTypePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  additionInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 6,
  },
  additionInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  additionInfoCol: {
    flex: 1,
  },
  additionColDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
    height: 28,
    marginHorizontal: 10,
  },
  additionRowDivider: {
    height: 1,
    backgroundColor: '#EDF2F7',
    marginVertical: 6,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  infoFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  infoFieldValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  additionCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC'
  },
  footerOperatorText: {
    fontSize: 11,
    color: '#64748B'
  },
  additionNoteText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic'
  },

  // Salary Advance Styles
  salaryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
    backgroundColor: '#FFFDF7'
  },
  salaryStaffBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  salaryStaffBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#B45309'
  },
  salaryTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2
  },
  advanceCardMini: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 8,
    marginTop: 4,
    marginBottom: 6
  },
  advanceMiniItem: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 4,
    marginLeft: 6
  },

  // Dispenser Unit (DU1, DU2) Breakdown Card Styles
  machineCardModern: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  machineCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8
  },
  machineIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  machineCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A'
  },
  machineTotalBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12
  },
  machineTotalBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  machineFuelsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  machineFuelCol: {
    flex: 1,
    alignItems: 'center'
  },
  machineFuelDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E2E8F0'
  },
  machineFuelColLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 4
  },
  machineFuelColVal: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2
  },
  machineFuelColSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1
  },
  machineRevenueStrip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    alignItems: 'center'
  },
  machineRevenueText: {
    fontSize: 11,
    color: '#64748B'
  }
});
