import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, ActivityIndicator, Alert } from 'react-native';
import { collection, query, where, orderBy, getDocs, limit, startAfter, writeBatch, doc } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import Icon from '@expo/vector-icons/Ionicons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SwipeToSettle from '../../../components/SwipeToSettle';

export default function ReportsScreen() {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' or 'additions'
  
  // Single Date Picker State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Data State
  const [salesData, setSalesData] = useState([]);
  const [additionsData, setAdditionsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [salesmenMap, setSalesmenMap] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  
  // Pagination State for Additions only
  const [lastVisible, setLastVisible] = useState(null);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Fetch Data based on Filter
  const fetchData = async () => {
    setLoading(true);
    let start = new Date(selectedDate);
    start.setHours(0, 0, 0, 0);
    
    let end = new Date(selectedDate);
    end.setHours(23, 59, 59, 999);

    try {
      if (activeTab === 'sales') {
        // Fetch ALL sales for the period to calculate summary properly
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
        setHasMore(false); // No pagination needed for accurate summary
      } else {
        const q = query(
          collection(db, 'tank_logs'),
          where('timestamp', '>=', start),
          where('timestamp', '<=', end),
          orderBy('timestamp', 'desc'),
          limit(15)
        );
        const snapshot = await getDocs(q);
        const list = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setAdditionsData(list);
        
        if (snapshot.docs.length > 0) {
          setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
        } else {
          setLastVisible(null);
        }
        setHasMore(snapshot.docs.length === 15);
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

  const fetchMoreData = async () => {
    if (activeTab === 'sales') return; // disabled for sales
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
  }, [activeTab, selectedDate]); 

  // Compute Aggregated Summary
  const summary = useMemo(() => {
    return salesData.reduce((acc, curr) => {
      acc.totalGrossSold += Number(curr.totalQuantitySold || 0);
      if(curr.fuelType === 'Petrol') acc.petrolSold += Number(curr.totalQuantitySold || 0);
      else acc.dieselSold += Number(curr.totalQuantitySold || 0);
      
      acc.expectedTotal += Number(curr.expectedTotalAmount || 0);
      acc.collectedTotal += Number(curr.totalPayment || 0);
      
      acc.cash += Number(curr.cashAmount || 0);
      acc.phonePe += Number(curr.phonePeAmount || 0);
      acc.paytm += Number(curr.paytmAmount || 0);
      acc.bharatPe += Number(curr.bharatPeAmount || 0);
      acc.udhari += Number(curr.udhariAmount || 0);
      acc.expenses += Number(curr.expenses || 0);
      
      acc.testingFuel += Number(curr.testingQuantity || 0);
      
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
    const summary = {};
    salesData.forEach(item => {
      const machineName = item.nozzleId ? item.nozzleId.split('-')[0] : 'Unknown';
      if (!summary[machineName]) {
        summary[machineName] = { totalLiters: 0, expectedAmount: 0, collectedAmount: 0 };
      }
      summary[machineName].totalLiters += Number(item.totalQuantitySold || 0);
      summary[machineName].expectedAmount += Number(item.expectedTotalAmount || 0);
      summary[machineName].collectedAmount += Number(item.totalPayment || 0);
    });
    return Object.entries(summary).map(([name, data]) => ({ name, ...data }));
  }, [salesData]);

  const isDaySettled = salesData.length > 0 && salesData.every(item => item.isSettled === true);

  const handleSettleInBank = async () => {
    Alert.alert(
      "Confirm Settlement",
      `Are you sure you want to mark the collected amount of ₹${summary.collectedTotal.toFixed(0)} as Settled in Bank for this period?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Yes, Settle", 
          onPress: async () => {
            setSettling(true);
            try {
              const batch = writeBatch(db);
              const unSettledDocs = salesData.filter(item => item.isSettled !== true);
              
              unSettledDocs.forEach(item => {
                const shiftRef = doc(db, 'sales_reports', item.id);
                batch.update(shiftRef, { isSettled: true });
              });
              
              await batch.commit();
              
              // Update local state instantly so UI reflects it
              setSalesData(prevData => prevData.map(item => ({ ...item, isSettled: true })));
              Alert.alert("Success", "Amount has been marked as Settled in Bank.");
            } catch (error) {
              console.error("Error settling in bank:", error);
              Alert.alert("Error", "Could not update settlement status.");
            } finally {
              setSettling(false);
            }
          } 
        }
      ]
    );
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

      salesData.forEach((item, index) => {
        const salesmanName = salesmenMap[item.salesmanId] || item.salesmanId;
        const petrolSold = item.fuelType === 'Petrol' ? Number(item.totalQuantitySold || 0).toFixed(2) : '0.00';
        const dieselSold = item.fuelType === 'Diesel' ? Number(item.totalQuantitySold || 0).toFixed(2) : '0.00';
        const testingQty = Number(item.testingQuantity || 0).toFixed(2);
        const shortage = Number(item.shortageOrExcess || 0);
        const shortageStr = shortage < 0 
          ? `<span style="color: #DC2626; font-weight: bold;">₹${Math.abs(shortage).toFixed(2)} (S)</span>` 
          : `<span style="color: #059669; font-weight: bold;">₹${Math.abs(shortage).toFixed(2)} (E)</span>`;

        shiftRows += `
          <tr>
            <td>${index + 1}</td>
            <td>${salesmanName}</td>
            <td>${item.nozzleId} (${item.fuelType})</td>
            <td>${petrolSold}</td>
            <td>${dieselSold}</td>
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
            if (exp.reason && Number(exp.amount) > 0) {
              expenseRows += `
                <tr>
                  <td>${salesmanName}</td>
                  <td>${exp.reason}</td>
                  <td>₹${Number(exp.amount).toFixed(2)}</td>
                </tr>
              `;
            }
          });
        }
      });

      let machineRows = '';
      machineSummary.forEach((m) => {
        machineRows += `
          <div class="grid-item">
            <div class="grid-label">Machine ${m.name}</div>
            <div class="grid-val">${m.totalLiters.toFixed(2)} L <br/><span style="font-size: 12px; color: #555;">(Exp: ₹${m.expectedAmount.toFixed(0)} | Col: ₹${m.collectedAmount.toFixed(0)})</span></div>
          </div>
        `;
      });

      const isNetShortage = summary.shortageOrExcess < 0;
      const netImpactStr = isNetShortage 
        ? `<span style="color: #DC2626;">Net Shortage: ₹${Math.abs(summary.shortageOrExcess).toFixed(2)}</span>` 
        : `<span style="color: #059669;">Net Excess: ₹${Math.abs(summary.shortageOrExcess).toFixed(2)}</span>`;

      const dateStr = selectedDate.toLocaleDateString();

      const settleStatusStr = isDaySettled 
        ? `<div style="background-color: #ECFDF5; border: 1px solid #10B981; color: #059669; padding: 10px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 20px;">✅ Status: Settled in Bank</div>`
        : `<div style="background-color: #FFFBEB; border: 1px solid #F59E0B; color: #D97706; padding: 10px; border-radius: 6px; text-align: center; font-weight: bold; margin-bottom: 20px;">⏳ Status: Pending Settlement</div>`;

      const htmlContent = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; border-bottom: 2px solid #003C8F; padding-bottom: 10px; margin-bottom: 20px; }
              .title { font-size: 24px; font-weight: bold; color: #003C8F; margin: 0; }
              .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
              .date-range { font-size: 16px; font-weight: bold; margin-top: 10px; }
              
              .summary-box { border: 1px solid #ddd; padding: 15px; border-radius: 8px; margin-bottom: 20px; background-color: #f9f9f9; }
              .summary-grid { display: flex; justify-content: space-between; margin-top: 10px; }
              .grid-item { text-align: center; flex: 1; }
              .grid-val { font-size: 18px; font-weight: bold; }
              .grid-label { font-size: 12px; color: #666; }

              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
              th { background-color: #003C8F; color: white; }
              
              .net-impact { font-size: 20px; font-weight: bold; text-align: right; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1 class="title">IndianOil Pump Management</h1>
              <p class="subtitle">Day End Settlement Report</p>
              <p class="date-range">Date: ${dateStr}</p>
            </div>
            
            ${settleStatusStr}

            <div class="summary-box">
              <h3 style="margin-top:0;">Fuel Sales Summary</h3>
              <div class="summary-grid">
                <div class="grid-item"><div class="grid-label">Petrol Sold</div><div class="grid-val" style="color: #FF6F00;">${summary.petrolSold.toFixed(2)} L</div></div>
                <div class="grid-item"><div class="grid-label">Diesel Sold</div><div class="grid-val" style="color: #003C8F;">${summary.dieselSold.toFixed(2)} L</div></div>
                <div class="grid-item"><div class="grid-label">Total Gross Sold</div><div class="grid-val">${summary.totalGrossSold.toFixed(2)} L</div></div>
                <div class="grid-item"><div class="grid-label">Testing Fuel</div><div class="grid-val" style="color: #EAB308;">${summary.testingFuel.toFixed(2)} L</div></div>
              </div>
            </div>
            
            <div class="summary-box">
              <h3 style="margin-top:0;">Machine-Wise Sales</h3>
              <div class="summary-grid" style="flex-wrap: wrap;">
                ${machineRows}
              </div>
            </div>

            <div class="summary-box">
              <h3 style="margin-top:0;">Financial Summary</h3>
              <div class="summary-grid">
                <div class="grid-item"><div class="grid-label">Expected Amount</div><div class="grid-val">₹${summary.expectedTotal.toFixed(2)}</div></div>
                <div class="grid-item"><div class="grid-label">Collected Amount</div><div class="grid-val" style="color: #059669;">₹${summary.collectedTotal.toFixed(2)}</div></div>
              </div>
              <div class="net-impact">${netImpactStr}</div>
            </div>

            <div class="summary-box">
              <h3 style="margin-top:0;">Collection Breakdown</h3>
              <div class="summary-grid" style="flex-wrap: wrap;">
                <div class="grid-item" style="min-width: 30%;"><div class="grid-label">Cash</div><div class="grid-val">₹${summary.cash.toFixed(2)}</div></div>
                <div class="grid-item" style="min-width: 30%;"><div class="grid-label">PhonePe</div><div class="grid-val">₹${summary.phonePe.toFixed(2)}</div></div>
                <div class="grid-item" style="min-width: 30%;"><div class="grid-label">Paytm</div><div class="grid-val">₹${summary.paytm.toFixed(2)}</div></div>
                <div class="grid-item" style="min-width: 30%; margin-top:15px;"><div class="grid-label">BharatPe</div><div class="grid-val">₹${summary.bharatPe.toFixed(2)}</div></div>
                <div class="grid-item" style="min-width: 30%; margin-top:15px;"><div class="grid-label">Udhari</div><div class="grid-val">₹${summary.udhari.toFixed(2)}</div></div>
                <div class="grid-item" style="min-width: 30%; margin-top:15px;"><div class="grid-label">Expenses</div><div class="grid-val">₹${summary.expenses.toFixed(2)}</div></div>
              </div>
            </div>

            <h3>Individual Staff Shifts</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Salesman</th>
                  <th>Nozzle</th>
                  <th>Petrol (L)</th>
                  <th>Diesel (L)</th>
                  <th>Testing (L)</th>
                  <th>Expected (₹)</th>
                  <th>Collected (₹)</th>
                  <th>Shortage/Excess</th>
                </tr>
              </thead>
              <tbody>
                ${shiftRows}
              </tbody>
            </table>
            
            ${udhariRows ? `
            <h3>Udhari (Credit) Details</h3>
            <table>
              <thead>
                <tr>
                  <th>Staff/Salesman</th>
                  <th>Customer/Party Name</th>
                  <th>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${udhariRows}
              </tbody>
            </table>
            ` : ''}

            ${expenseRows ? `
            <h3>Expense Details</h3>
            <table>
              <thead>
                <tr>
                  <th>Staff/Salesman</th>
                  <th>Expense Reason</th>
                  <th>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${expenseRows}
              </tbody>
            </table>
            ` : ''}
            
            <p style="text-align: center; margin-top: 30px; font-size: 10px; color: #888;">Generated by IndianOil Pump Management App</p>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
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
        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardTitle}>Fuel Sales Summary (Liters)</Text>
          <View style={styles.fuelSummaryList}>
            <View style={[styles.fuelSummaryRowBox, {backgroundColor: '#FFF3E0', borderColor: '#FFE0B2'}]}>
              <Text style={styles.fuelSummaryLabel}>Petrol Sold</Text>
              <Text style={[styles.fuelSummaryValue, {color: '#E65100'}]}>{summary.petrolSold.toFixed(2)} L</Text>
            </View>
            <View style={[styles.fuelSummaryRowBox, {backgroundColor: '#E3F2FD', borderColor: '#BBDEFB'}]}>
              <Text style={styles.fuelSummaryLabel}>Diesel Sold</Text>
              <Text style={[styles.fuelSummaryValue, {color: '#0D47A1'}]}>{summary.dieselSold.toFixed(2)} L</Text>
            </View>
            <View style={[styles.fuelSummaryRowBox, {backgroundColor: '#F3F4F6', borderColor: '#E5E7EB'}]}>
              <Text style={styles.fuelSummaryLabel}>Total Gross Sold</Text>
              <Text style={[styles.fuelSummaryValue, {color: '#111827'}]}>{summary.totalGrossSold.toFixed(2)} L</Text>
            </View>
            <View style={[styles.fuelSummaryRowBox, {backgroundColor: '#FEF9C3', borderColor: '#FEF08A'}]}>
              <Text style={styles.fuelSummaryLabel}>Testing Fuel Deducted</Text>
              <Text style={[styles.fuelSummaryValue, {color: '#CA8A04'}]}>{summary.testingFuel.toFixed(2)} L</Text>
            </View>
          </View>
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardTitle}>Machine-Wise Sales</Text>
          {machineSummary.map((m, index) => (
            <View key={index} style={styles.machineSummaryRow}>
              <View style={styles.machineSummaryHeader}>
                <Icon name="hardware-chip" size={20} color="#003C8F" />
                <Text style={styles.machineSummaryName}>{m.name}</Text>
              </View>
              <View style={styles.machineSummaryData}>
                <Text style={styles.machineSummaryLiters}>{m.totalLiters.toFixed(2)} L</Text>
                <Text style={styles.machineSummaryAmount}>
                  Exp: ₹{m.expectedAmount.toFixed(0)} <Text style={{color: '#ccc'}}>|</Text> <Text style={{color: '#059669'}}>Col: ₹{m.collectedAmount.toFixed(0)}</Text>
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardTitle}>Financial Overview</Text>
          <View style={styles.finRow}>
            <View style={styles.finBox}>
              <Text style={styles.finLabel}>Expected Amount</Text>
              <Text style={styles.finValue}>₹{summary.expectedTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.finBox}>
              <Text style={styles.finLabel}>Collected Amount</Text>
              <Text style={[styles.finValue, {color: '#059669'}]}>₹{summary.collectedTotal.toFixed(0)}</Text>
            </View>
          </View>
          
          <View style={[styles.netImpactBox, { backgroundColor: isNetShortage ? '#FEF2F2' : '#ECFDF5', borderColor: isNetShortage ? '#FECACA' : '#A7F3D0' }]}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
               <Icon name={isNetShortage ? "trending-down-outline" : "trending-up-outline"} size={24} color={isNetShortage ? '#DC2626' : '#059669'} />
               <Text style={[styles.netImpactTitle, { color: isNetShortage ? '#DC2626' : '#059669', marginLeft: 8 }]}>
                 {isNetShortage ? 'NET SHORTAGE' : 'NET EXCESS'}
               </Text>
            </View>
            <Text style={[styles.netImpactAmount, { color: isNetShortage ? '#DC2626' : '#059669' }]}>
              ₹{Math.abs(summary.shortageOrExcess).toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardTitle}>Total Collection Breakdown</Text>
          <View style={styles.collectionGrid}>
            <View style={styles.collectionItem}>
              <Icon name="cash-outline" size={18} color="#059669"/>
              <Text style={styles.collectionLabel}>Cash</Text>
              <Text style={styles.collectionAmt}>₹{summary.cash.toFixed(0)}</Text>
            </View>
            <View style={styles.collectionItem}>
              <Icon name="phone-portrait-outline" size={18} color="#6366F1"/>
              <Text style={styles.collectionLabel}>PhonePe</Text>
              <Text style={styles.collectionAmt}>₹{summary.phonePe.toFixed(0)}</Text>
            </View>
            <View style={styles.collectionItem}>
              <Icon name="scan-outline" size={18} color="#0EA5E9"/>
              <Text style={styles.collectionLabel}>Paytm</Text>
              <Text style={styles.collectionAmt}>₹{summary.paytm.toFixed(0)}</Text>
            </View>
            <View style={styles.collectionItem}>
              <Icon name="qr-code-outline" size={18} color="#F59E0B"/>
              <Text style={styles.collectionLabel}>BharatPe</Text>
              <Text style={styles.collectionAmt}>₹{summary.bharatPe.toFixed(0)}</Text>
            </View>
            <View style={styles.collectionItem}>
              <Icon name="book-outline" size={18} color="#EC4899"/>
              <Text style={styles.collectionLabel}>Udhari</Text>
              <Text style={styles.collectionAmt}>₹{summary.udhari.toFixed(0)}</Text>
            </View>
            <View style={styles.collectionItem}>
              <Icon name="receipt-outline" size={18} color="#EF4444"/>
              <Text style={styles.collectionLabel}>Expenses</Text>
              <Text style={styles.collectionAmt}>₹{summary.expenses.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.dashboardSection}>
          <Text style={styles.dashboardTitle}>Bank Settlement</Text>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15}}>
            <View style={{flex: 1, backgroundColor: '#F0FDF4', padding: 15, borderRadius: 10, marginRight: 5, borderWidth: 1, borderColor: '#BBF7D0'}}>
              <Text style={{color: '#166534', fontWeight: 'bold', fontSize: 12}}>Cash Collection</Text>
              <Text style={{color: '#15803D', fontWeight: '900', fontSize: 20}}>₹{summary.cash.toFixed(0)}</Text>
            </View>
            <View style={{flex: 1, backgroundColor: '#EFF6FF', padding: 15, borderRadius: 10, marginLeft: 5, borderWidth: 1, borderColor: '#BFDBFE'}}>
              <Text style={{color: '#1E40AF', fontWeight: 'bold', fontSize: 12}}>Online Collection</Text>
              <Text style={{color: '#1D4ED8', fontWeight: '900', fontSize: 20}}>₹{(summary.phonePe + summary.paytm + summary.bharatPe).toFixed(0)}</Text>
            </View>
          </View>

          {isDaySettled ? (
            <View style={styles.settledBadge}>
              <Icon name="checkmark-circle" size={24} color="#059669" />
              <Text style={styles.settledBadgeText}>Amount Settled in Bank</Text>
            </View>
          ) : (
            <SwipeToSettle onSettle={handleSettleInBank} disabled={settling} />
          )}
        </View>

        <View style={styles.shiftListHeaderContainer}>
          <Text style={styles.shiftListHeader}>Individual Staff Shifts ({salesData.length})</Text>
          <Text style={styles.shiftListSub}>Tap a shift to view full details</Text>
        </View>
      </View>
    );
  };

  const renderSalesCard = ({ item }) => {
    const endTime = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleTimeString([], { timeStyle: 'short' }) : 'N/A';
    const endDate = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString([], { dateStyle: 'medium' }) : 'N/A';
    const startTime = item.shiftStartTime?.toDate ? item.shiftStartTime.toDate().toLocaleTimeString([], { timeStyle: 'short' }) : 'N/A';
    
    const isShortage = (item.shortageOrExcess || 0) < 0;
    const isPetrol = item.fuelType === 'Petrol';
    const isExpanded = expandedId === item.id;
    
    return (
      <View style={[styles.reportCard, { borderLeftColor: isPetrol ? '#FF6F00' : '#003C8F' }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item.id)}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.date}>{endDate}</Text>
              <Text style={styles.timeText}>Start: {startTime}  |  End: {endTime}</Text>
            </View>
            <View style={[styles.fuelBadge, { backgroundColor: isPetrol ? '#FFF3E0' : '#E3F2FD' }]}>
              <Text style={[styles.fuelText, { color: isPetrol ? '#FF6F00' : '#003C8F' }]}>
                {item.fuelType || 'Fuel'}
              </Text>
            </View>
          </View>
          
          <Text style={styles.salesman}>Salesman: {salesmenMap[item.salesmanId] || item.salesmanId}</Text>
          <Text style={styles.salesman}>Tank: {item.tankId} | Nozzle: {item.nozzleId}</Text>
          
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Sold (L)</Text>
              <Text style={styles.statValue}>{Number(item.totalQuantitySold || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Expected (₹)</Text>
              <Text style={styles.statValue}>{Number(item.expectedTotalAmount || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Collected (₹)</Text>
              <Text style={[styles.statValue, {color: '#2E7D32'}]}>{Number(item.totalPayment || 0).toFixed(0)}</Text>
            </View>
          </View>

          <View style={[styles.shortageBox, { backgroundColor: isShortage ? '#ffebee' : '#e8f5e9', marginTop: 5 }]}>
            <Text style={[styles.shortageText, { color: isShortage ? '#d32f2f' : '#2E7D32' }]}>
              {isShortage ? 'Shortage: ' : 'Excess: '} ₹{Math.abs(item.shortageOrExcess || 0).toFixed(2)}
            </Text>
          </View>
          
          <View style={styles.expandToggle}>
            <Text style={styles.expandText}>{isExpanded ? 'Hide Details' : 'View Details'}</Text>
            <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#003C8F" />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Meter Breakdowns */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Meter Readings</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Opening Meter:</Text>
                <Text style={styles.breakdownValue}>{item.openingMeterReading}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Closing Meter:</Text>
                <Text style={styles.breakdownValue}>{item.closingMeterReading}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Testing Fuel:</Text>
                <Text style={styles.breakdownValue}>{item.testingQuantity || 0} L</Text>
              </View>
            </View>

            {/* Collection Breakdowns */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Collection Breakdown</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Cash:</Text>
                <Text style={styles.breakdownValue}>₹{item.cashAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>PhonePe:</Text>
                <Text style={styles.breakdownValue}>₹{item.phonePeAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Paytm:</Text>
                <Text style={styles.breakdownValue}>₹{item.paytmAmount || 0}</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>BharatPe:</Text>
                <Text style={styles.breakdownValue}>₹{item.bharatPeAmount || 0}</Text>
              </View>
            </View>

            {/* Deductions */}
            <View style={[styles.sectionBlock, { borderBottomWidth: 0, marginBottom: 0 }]}>
              <Text style={styles.sectionTitle}>Deductions (Others)</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Credit / Udhari:</Text>
                <Text style={styles.breakdownValue}>₹{item.udhariAmount || 0}</Text>
              </View>
              {item.udhariBreakdown && item.udhariBreakdown.length > 0 && (
                <View style={{ marginLeft: 10, marginBottom: 5 }}>
                  {item.udhariBreakdown.map((udhari, i) => (
                    <Text key={i} style={{ fontSize: 11, color: '#6B7280' }}>- {udhari.name}: ₹{udhari.amount}</Text>
                  ))}
                </View>
              )}
              
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Expenses:</Text>
                <Text style={styles.breakdownValue}>₹{item.expenses || 0}</Text>
              </View>
              {item.expenseBreakdown && item.expenseBreakdown.length > 0 && (
                <View style={{ marginLeft: 10 }}>
                  {item.expenseBreakdown.map((exp, i) => (
                    <Text key={i} style={{ fontSize: 11, color: '#6B7280' }}>- {exp.reason}: ₹{exp.amount}</Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderAdditionCard = ({ item }) => {
    const date = item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : 'N/A';
    return (
      <View style={[styles.reportCard, { borderLeftColor: '#003C8F' }]}>
        <View style={styles.cardHeader}>
          <Text style={styles.date}>{date}</Text>
          <Text style={styles.nozzle}>Tank: {item.tankId}</Text>
        </View>
        <Text style={[styles.salesman, { color: '#003C8F', fontWeight: 'bold' }]}>Fuel Added by Owner</Text>
        
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: '#fff3e0' }]}>
            <Text style={styles.statLabel}>Petrol Added</Text>
            <Text style={[styles.statValue, { color: '#FF6F00' }]}>{item.petrolAdded || 0} L</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#e3f2fd' }]}>
            <Text style={styles.statLabel}>Diesel Added</Text>
            <Text style={[styles.statValue, { color: '#003C8F' }]}>{item.dieselAdded || 0} L</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Day End Settlement Reports</Text>
      
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'sales' && styles.activeTab]}
          onPress={() => setActiveTab('sales')}
        >
          <Text style={[styles.tabText, activeTab === 'sales' && styles.activeTabText]}>Pump Summary</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'additions' && styles.activeTab]}
          onPress={() => setActiveTab('additions')}
        >
          <Text style={[styles.tabText, activeTab === 'additions' && styles.activeTabText]}>Fuel Additions</Text>
        </TouchableOpacity>
      </View>

      {/* Single Calendar Date Picker */}
      <View style={styles.calendarPickerWrapper}>
        <TouchableOpacity style={styles.calendarMainBtn} onPress={() => setShowDatePicker(true)}>
          <Icon name="calendar" size={24} color="#003C8F" />
          <Text style={styles.calendarMainBtnText}>Select Date: {selectedDate.toLocaleDateString()}</Text>
          <Icon name="chevron-down" size={20} color="#003C8F" />
        </TouchableOpacity>
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

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color="#FF6F00" style={{ marginTop: 50 }} />
      ) : (
        <FlatList 
          data={activeTab === 'sales' ? salesData : additionsData}
          keyExtractor={item => item.id}
          ListHeaderComponent={activeTab === 'sales' ? renderSummaryDashboard : null}
          renderItem={activeTab === 'sales' ? renderSalesCard : renderAdditionCard}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No data found for this period.</Text>}
          showsVerticalScrollIndicator={false}
          onEndReached={fetchMoreData}
          onEndReachedThreshold={0.5}
          ListFooterComponent={fetchingMore ? <ActivityIndicator size="small" color="#FF6F00" style={{ marginVertical: 15 }} /> : null}
        />
      )}

      {/* Floating Action Button for PDF Export */}
      {activeTab === 'sales' && salesData.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={generatePDF}>
          <Icon name="download-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f4', padding: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#003C8F', marginBottom: 15, textAlign: 'center' },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', borderRadius: 8, padding: 4, marginBottom: 15 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontWeight: 'bold', color: '#666' },
  activeTabText: { color: '#003C8F' },

  calendarPickerWrapper: { marginBottom: 15 },
  calendarMainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', paddingVertical: 15, borderRadius: 10, borderWidth: 1, borderColor: '#bbdefb' },
  calendarMainBtnText: { fontSize: 16, fontWeight: 'bold', color: '#003C8F', marginHorizontal: 10 },

  emptyText: { textAlign: 'center', marginTop: 50, color: '#888', fontStyle: 'italic' },

  // Dashboard Styles
  dashboardContainer: { marginBottom: 20 },
  dashboardSection: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  dashboardTitle: { fontSize: 16, fontWeight: '800', color: '#1F2937', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 8 },
  
  fuelSummaryList: { flexDirection: 'column' },
  fuelSummaryRowBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  fuelSummaryLabel: { fontSize: 14, color: '#4B5563', fontWeight: 'bold' },
  fuelSummaryValue: { fontSize: 16, fontWeight: '900' },
  
  finRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  finBox: { flex: 1, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, marginHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' },
  finLabel: { fontSize: 12, color: '#6B7280', fontWeight: 'bold' },
  finValue: { fontSize: 18, fontWeight: '900', color: '#111827', marginTop: 4 },
  
  netImpactBox: { padding: 15, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netImpactTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  netImpactAmount: { fontSize: 20, fontWeight: '900' },
  
  machineSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#F3F4F6' },
  machineSummaryHeader: { flexDirection: 'row', alignItems: 'center' },
  machineSummaryName: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginLeft: 8 },
  machineSummaryData: { alignItems: 'flex-end' },
  machineSummaryLiters: { fontSize: 16, fontWeight: '900', color: '#003C8F' },
  machineSummaryAmount: { fontSize: 13, color: '#6B7280', fontWeight: 'bold', marginTop: 2 },

  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  collectionItem: { width: '31%', backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#F3F4F6' },
  collectionLabel: { fontSize: 11, color: '#4B5563', marginTop: 4, fontWeight: '600' },
  collectionAmt: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 2 },

  shiftListHeaderContainer: { marginTop: 10, marginBottom: 10, paddingHorizontal: 5 },
  shiftListHeader: { fontSize: 18, fontWeight: 'bold', color: '#003C8F' },
  shiftListSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },

  // Card Styles
  reportCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#FF6F00' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  date: { fontSize: 14, color: '#333', fontWeight: 'bold' },
  timeText: { fontSize: 12, color: '#777', marginTop: 2 },
  nozzle: { fontSize: 16, fontWeight: 'bold', color: '#003C8F' },
  salesman: { fontSize: 14, marginBottom: 5, color: '#444' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, marginTop: 10 },
  statBox: { flex: 1, backgroundColor: '#f9f9f9', padding: 10, borderRadius: 8, alignItems: 'center', marginHorizontal: 3 },
  statLabel: { fontSize: 11, color: '#666', marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32' },
  shortageBox: { padding: 10, borderRadius: 5, alignItems: 'center' },
  shortageText: { fontSize: 14, fontWeight: 'bold' },
  
  fuelBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  fuelText: { fontSize: 12, fontWeight: '900' },
  
  expandToggle: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  expandText: { color: '#003C8F', fontWeight: 'bold', fontSize: 13, marginRight: 5 },
  expandedContent: { marginTop: 15, backgroundColor: '#F9FAFB', borderRadius: 8, padding: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionBlock: { marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#4B5563', marginBottom: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  breakdownLabel: { color: '#6B7280', fontSize: 13 },
  breakdownValue: { fontWeight: 'bold', color: '#111827', fontSize: 13 },

  // FAB Style
  fab: { position: 'absolute', bottom: 25, right: 20, backgroundColor: '#003C8F', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  
  // Settlement Button
  settleBtn: { backgroundColor: '#003C8F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 8, elevation: 2 },
  settleBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  settledBadge: { backgroundColor: '#ECFDF5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 8, borderWidth: 1, borderColor: '#10B981' },
  settledBadgeText: { color: '#059669', fontSize: 16, fontWeight: 'bold', marginLeft: 8 }
});
