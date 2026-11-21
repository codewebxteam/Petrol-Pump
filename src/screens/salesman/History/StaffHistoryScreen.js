import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView,
  TextInput 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import Icon from '@expo/vector-icons/Ionicons';
import { generateAndSharePdf } from '../../../utils/generatePdfReceipt';

export default function StaffHistoryScreen() {
  const [entries, setEntries] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  // Staff Filter Selection: 'ALL' or staff.id
  const [selectedStaffId, setSelectedStaffId] = useState('ALL');
  const [selectedStaffName, setSelectedStaffName] = useState('All Staff');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Sales Reports
  useEffect(() => {
    const q = query(
      collection(db, 'sales_reports'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setEntries(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching staff history:", error);
      setLoading(false);
    });

    return unsub;
  }, []);

  // 2. Fetch Salesmen from Users Collection
  useEffect(() => {
    const qUsers = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setStaffUsers(list);
    }, (err) => console.warn('Error fetching salesmen:', err.message));

    return unsubUsers;
  }, []);

  // 3. Compile unique staff list from registered users + sales reports
  const staffOptions = useMemo(() => {
    const map = new Map();

    // From registered salesmen
    staffUsers.forEach(u => {
      map.set(u.id, {
        id: u.id,
        name: u.name || 'Staff'
      });
    });

    // From sales reports (captures historical or custom staff names)
    entries.forEach(r => {
      const sId = r.salesmanId;
      const sName = r.salesmanName;
      if (sId && !map.has(sId)) {
        map.set(sId, { id: sId, name: sName || 'Staff' });
      } else if (!sId && sName && !map.has(sName)) {
        map.set(sName, { id: sName, name: sName });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [staffUsers, entries]);

  // 4. Filter entries based on selected staff and optional search
  const filteredEntries = useMemo(() => {
    return entries.filter(item => {
      // Staff filter
      if (selectedStaffId !== 'ALL') {
        const matchesId = item.salesmanId === selectedStaffId;
        const matchesName = item.salesmanName && selectedStaffName && 
          item.salesmanName.trim().toLowerCase() === selectedStaffName.trim().toLowerCase();
        if (!matchesId && !matchesName) return false;
      }

      // Search query filter (machine, date, or notes)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mName = (item.machineName || item.machineId || '').toLowerCase();
        const sName = (item.salesmanName || '').toLowerCase();
        if (!mName.includes(q) && !sName.includes(q)) return false;
      }

      return true;
    });
  }, [entries, selectedStaffId, selectedStaffName, searchQuery]);

  // 5. Summary statistics for the filtered selection
  const stats = useMemo(() => {
    let totalLiters = 0;
    let totalExpected = 0;
    let totalCollection = 0;
    let totalShortageOrExcess = 0;

    filteredEntries.forEach(item => {
      totalLiters += Number(item.totalQuantitySold || item.quantitySold || 0);
      totalExpected += Number(item.expectedTotalAmount || item.expectedAmount || 0);
      totalCollection += Number(item.totalPayment || 0);
      totalShortageOrExcess += Number(item.shortageOrExcess || 0);
    });

    return {
      shiftsCount: filteredEntries.length,
      totalLiters,
      totalExpected,
      totalCollection,
      totalShortageOrExcess
    };
  }, [filteredEntries]);

  const handleSelectStaff = (id, name) => {
    setSelectedStaffId(id);
    setSelectedStaffName(name);
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleDownloadPdf = async (item) => {
    try {
      const payload = {
        staffName: item.salesmanName || 'Staff',
        machineName: item.machineName || item.machineId || 'Machine',
        petrolNozzleId: item.petrolNozzleId || 'N1',
        dieselNozzleId: item.dieselNozzleId || 'N2',
        petrolOpening: String(item.petrolOpeningMeter || item.openingMeterReading || '0.0000'),
        petrolClosing: String(item.petrolClosingMeter || item.closingMeterReading || '0.0000'),
        petrolTesting: Number(item.petrolTesting || 0),
        petrolNetSold: Number(item.petrolQuantitySold || (item.fuelType === 'Petrol' ? item.quantitySold : 0) || 0),
        petrolRate: Number(item.petrolRate || (item.fuelType === 'Petrol' ? item.fuelRate : 0) || 0),
        petrolExpected: Number(item.petrolExpectedAmount || (item.fuelType === 'Petrol' ? item.expectedAmount : 0) || 0),
        dieselOpening: String(item.dieselOpeningMeter || '0.0000'),
        dieselClosing: String(item.dieselClosingMeter || '0.0000'),
        dieselTesting: Number(item.dieselTesting || 0),
        dieselNetSold: Number(item.dieselQuantitySold || (item.fuelType === 'Diesel' ? item.quantitySold : 0) || 0),
        dieselRate: Number(item.dieselRate || (item.fuelType === 'Diesel' ? item.fuelRate : 0) || 0),
        dieselExpected: Number(item.dieselExpectedAmount || (item.fuelType === 'Diesel' ? item.expectedAmount : 0) || 0),
        totalMobilAmount: Number(item.totalMobilAmount || 0),
        totalMobilQty: Number(item.totalMobilQty || 0),
        mobilEntries: item.mobilEntries || [],
        totalLitersSold: Number(item.totalQuantitySold || item.quantitySold || 0),
        totalExpectedAmount: Number(item.expectedTotalAmount || item.expectedAmount || 0),
        cashAmt: Number(item.cashAmount || 0),
        cashNotesAmt: Number(item.cashNotesAmount || 0),
        coinsAmt: Number(item.coinsAmount || 0),
        digitalAmt: Number(item.onlineAmount || 0) || (Number(item.phonePeAmount || 0) + Number(item.paytmAmount || 0) + Number(item.atmAmount || 0) + Number(item.bobAmount || 0) + Number(item.bharatPeAmount || 0)),
        digitalEntries: item.digitalPaymentsBreakdown || [],
        udhariAmt: Number(item.udhariAmount || 0),
        udhariBreakdown: item.udhariBreakdown || [],
        expenseAmt: Number(item.expenses || 0),
        expenseBreakdown: item.expenseBreakdown || [],
        totalCollection: Number(item.totalPayment || 0),
        shortageOrExcess: Number(item.shortageOrExcess || 0),
        udhariReturnTotal: Number(item.udhariReturnAmount || 0),
        udhariReturnEntries: item.udhariReturnDetails || [],
        entryDate: item.timestamp?.toDate ? item.timestamp.toDate() : (item.entryDate?.toDate ? item.entryDate.toDate() : new Date())
      };

      await generateAndSharePdf(payload);
    } catch (err) {
      console.error('Download PDF error:', err);
    }
  };

  const renderItem = ({ item }) => {
    const dateObj = item.timestamp?.toDate 
      ? item.timestamp.toDate() 
      : (item.entryDate?.toDate ? item.entryDate.toDate() : (item.timestamp ? new Date(item.timestamp) : null));

    const dateStr = dateObj
      ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : 'Today';
    const timeStr = dateObj
      ? dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : '';

    const isPetrolAndDiesel = item.entryType === 'machine_daily_entry' || (item.petrolQuantitySold !== undefined && item.dieselQuantitySold !== undefined);
    const isExpanded = expandedId === item.id;
    const shortageOrExcess = Number(item.shortageOrExcess || 0);
    const isShortage = shortageOrExcess < -0.01;
    const isExcess = shortageOrExcess > 0.01;

    // Border color: Navy for dual fuel, Orange for petrol, Cyan for diesel
    const cardBorderColor = isPetrolAndDiesel 
      ? '#003C8F' 
      : (item.fuelType === 'Petrol' ? '#FF6F00' : '#0284C7');

    return (
      <View style={[styles.card, { borderLeftColor: cardBorderColor }]}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => toggleExpand(item.id)}>
          {/* Card Top Row */}
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="calendar-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
                <Text style={styles.dateText}>{dateStr} {timeStr ? `• ${timeStr}` : ''}</Text>
              </View>
              <Text style={styles.staffNameText}>
                👤 {item.salesmanName || 'Staff Member'}
              </Text>
            </View>

            <View style={styles.badge}>
              <Icon name="speedometer-outline" size={13} color="#003C8F" style={{ marginRight: 4 }} />
              <Text style={styles.badgeText}>
                {item.machineName || item.machineId || item.nozzleId || 'Machine'}
              </Text>
            </View>
          </View>

          {/* Key 3 Metrics Row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Sold</Text>
              <Text style={styles.summaryValue}>
                {Number(item.totalQuantitySold || item.quantitySold || 0).toFixed(2)} L
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Expected</Text>
              <Text style={styles.summaryValue}>
                ₹{Number(item.expectedTotalAmount || item.expectedAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Collection</Text>
              <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                ₹{Number(item.totalPayment || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>

          {/* Shortage / Excess / Balanced Status Banner */}
          <View style={[
            styles.statusBox, 
            isShortage 
              ? styles.statusBoxShortage 
              : isExcess 
                ? styles.statusBoxExcess 
                : styles.statusBoxBalanced
          ]}>
            <Icon 
              name={isShortage ? "alert-circle" : isExcess ? "information-circle" : "checkmark-circle"} 
              size={15} 
              color={isShortage ? '#DC2626' : isExcess ? '#2563EB' : '#15803D'} 
              style={{ marginRight: 6 }} 
            />
            <Text style={[
              styles.statusText, 
              { color: isShortage ? '#DC2626' : isExcess ? '#1E40AF' : '#15803D' }
            ]}>
              {isShortage 
                ? `Shortage: -₹${Math.abs(shortageOrExcess).toFixed(2)}` 
                : isExcess 
                  ? `Excess: +₹${shortageOrExcess.toFixed(2)}` 
                  : 'Balanced (₹0.00)'}
            </Text>
          </View>

          {/* Actions Row: PDF button & Expand toggle */}
          <View style={styles.cardActionsRow}>
            <TouchableOpacity 
              style={styles.downloadPdfBtn} 
              onPress={() => handleDownloadPdf(item)}
              activeOpacity={0.7}
            >
              <Icon name="document-text-outline" size={15} color="#003C8F" />
              <Text style={styles.downloadPdfBtnText}>PDF Receipt</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.expandRow}
              onPress={() => toggleExpand(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.expandText}>
                {isExpanded ? 'Hide Details' : 'View Full Details'}
              </Text>
              <Icon 
                name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                size={16} 
                color="#003C8F" 
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Detailed Breakdown (Expandable) */}
        {isExpanded && (
          <View style={styles.detailsContainer}>
            {isPetrolAndDiesel ? (
              <>
                {/* Petrol Section */}
                <View style={[styles.fuelSectionBox, { borderColor: '#FFD8A8' }]}>
                  <View style={styles.fuelSectionHeaderRow}>
                    <View style={[styles.fuelDot, { backgroundColor: '#FF6F00' }]} />
                    <Text style={[styles.fuelSectionHeader, { color: '#C2410C' }]}>
                      Petrol ({item.petrolNozzleId || 'N1'} ➔ Tank 1)
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Opening Meter:</Text>
                    <Text style={styles.detailValue}>{item.petrolOpeningMeter || '0.0000'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Closing Meter:</Text>
                    <Text style={styles.detailValue}>{item.petrolClosingMeter || '0.0000'}</Text>
                  </View>
                  {Number(item.petrolTesting) > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Testing (Returned to Tank 1):</Text>
                      <Text style={[styles.detailValue, { color: '#0284C7' }]}>
                        {item.petrolTesting} L
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Net Sold:</Text>
                    <Text style={[styles.detailValue, { color: '#C2410C' }]}>
                      {Number(item.petrolQuantitySold || 0).toFixed(4)} L (@ ₹{item.petrolRate}/L)
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Expected Amount:</Text>
                    <Text style={[styles.detailValue, { color: '#0F172A' }]}>
                      ₹{Number(item.petrolExpectedAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>

                {/* Diesel Section */}
                <View style={[styles.fuelSectionBox, { marginTop: 8, borderColor: '#BAE6FD' }]}>
                  <View style={styles.fuelSectionHeaderRow}>
                    <View style={[styles.fuelDot, { backgroundColor: '#0284C7' }]} />
                    <Text style={[styles.fuelSectionHeader, { color: '#0369A1' }]}>
                      Diesel ({item.dieselNozzleId || 'N2'} ➔ Tank 2)
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Opening Meter:</Text>
                    <Text style={styles.detailValue}>{item.dieselOpeningMeter || '0.0000'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Closing Meter:</Text>
                    <Text style={styles.detailValue}>{item.dieselClosingMeter || '0.0000'}</Text>
                  </View>
                  {Number(item.dieselTesting) > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Testing (Returned to Tank 2):</Text>
                      <Text style={[styles.detailValue, { color: '#0284C7' }]}>
                        {item.dieselTesting} L
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Net Sold:</Text>
                    <Text style={[styles.detailValue, { color: '#0369A1' }]}>
                      {Number(item.dieselQuantitySold || 0).toFixed(4)} L (@ ₹{item.dieselRate}/L)
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Expected Amount:</Text>
                    <Text style={[styles.detailValue, { color: '#0F172A' }]}>
                      ₹{Number(item.dieselExpectedAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.fuelSectionBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nozzle:</Text>
                  <Text style={styles.detailValue}>{item.nozzleId || 'N1'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Opening Meter:</Text>
                  <Text style={styles.detailValue}>{item.openingMeterReading || '0.0000'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Closing Meter:</Text>
                  <Text style={styles.detailValue}>{item.closingMeterReading || '0.0000'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Fuel Rate:</Text>
                  <Text style={styles.detailValue}>₹{item.fuelRate}/L</Text>
                </View>
              </View>
            )}

            {/* Mobil Sale Details */}
            {Number(item.totalMobilAmount || 0) > 0 && (
              <View style={[styles.fuelSectionBox, { borderColor: '#DDD6FE', backgroundColor: '#FAF5FF', marginTop: 10 }]}>
                <View style={styles.detailRow}>
                  <Text style={[styles.fuelTitle, { color: '#7C3AED' }]}>
                    🛢️ मोबिल बिक्री (Mobil Sale):
                  </Text>
                  <Text style={[styles.detailValue, { color: '#7C3AED', fontWeight: 'bold' }]}>
                    ₹{Number(item.totalMobilAmount).toLocaleString('en-IN')} ({item.totalMobilQty || item.mobilEntries?.length || 1} pcs)
                  </Text>
                </View>
                {item.mobilEntries && item.mobilEntries.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    {item.mobilEntries.map((m, mi) => (
                      <Text key={mi} style={{ fontSize: 11, color: '#6B7280', marginBottom: 2 }}>
                        • {m.packSize || 'मोबिल'}: {m.quantity || 1} Pcs — ₹{m.amount}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.divider} />

            {/* Payment Collection Details */}
            <Text style={styles.subSectionTitle}>Payment Collection Breakdown</Text>

            {/* Cash */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Cash Collection:</Text>
              <Text style={styles.detailValue}>
                ₹{Number(item.cashAmount || 0).toLocaleString('en-IN')}
                {Number(item.coinsAmount) > 0 ? ` (Notes: ₹${item.cashNotesAmount || ((item.cashAmount || 0) - item.coinsAmount)} • Coins: ₹${item.coinsAmount})` : ''}
              </Text>
            </View>

            {/* Digital */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Digital & QR Payments:</Text>
              <Text style={[styles.detailValue, { color: '#003C8F' }]}>
                ₹{Number(item.onlineAmount || 0) || (Number(item.phonePeAmount || 0) + Number(item.paytmAmount || 0) + Number(item.atmAmount || 0) + Number(item.bobAmount || 0) + Number(item.bharatPeAmount || 0))}
              </Text>
            </View>

            {item.digitalPaymentsBreakdown && item.digitalPaymentsBreakdown.length > 0 && (
              <View style={styles.digitalListContainer}>
                {item.digitalPaymentsBreakdown.map((d, i) => (
                  <Text key={i} style={styles.digitalSubItemText}>
                    • {d.name}: <Text style={{ fontWeight: 'bold' }}>₹{d.amount}</Text>
                  </Text>
                ))}
              </View>
            )}

            {/* Credit / Udhari */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Credit (Udhari):</Text>
              <Text style={styles.detailValue}>
                ₹{Number(item.udhariAmount || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {item.udhariBreakdown && item.udhariBreakdown.length > 0 && (
              <View style={[styles.digitalListContainer, { borderLeftColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
                {item.udhariBreakdown.map((u, i) => (
                  <Text key={i} style={[styles.digitalSubItemText, { color: '#92400E' }]}>
                    • {u.customerName || 'Customer'}: <Text style={{ fontWeight: 'bold' }}>₹{u.amount}</Text> {u.vehicleNumber ? `(${u.vehicleNumber})` : ''}
                  </Text>
                ))}
              </View>
            )}

            {/* Pump Expenses */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Pump Operating Expenses:</Text>
              <Text style={[styles.detailValue, { color: '#DC2626' }]}>
                ₹{Number(item.expenses || 0).toLocaleString('en-IN')}
              </Text>
            </View>

            {item.expenseBreakdown && item.expenseBreakdown.length > 0 && (
              <View style={[styles.digitalListContainer, { borderLeftColor: '#DC2626', backgroundColor: '#FEF2F2' }]}>
                {item.expenseBreakdown.map((exp, i) => (
                  <Text key={i} style={[styles.digitalSubItemText, { color: '#991B1B' }]}>
                    • {exp.reason || 'Expense'}: <Text style={{ fontWeight: 'bold' }}>₹{exp.amount}</Text> {exp.notes ? `(${exp.notes})` : ''}
                  </Text>
                ))}
              </View>
            )}

            {/* Udhari Returns (if any) */}
            {Number(item.udhariReturnAmount) > 0 && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Udhari Returns Collected:</Text>
                <Text style={[styles.detailValue, { color: '#15803D' }]}>
                  +₹{Number(item.udhariReturnAmount).toLocaleString('en-IN')}
                </Text>
              </View>
            )}

            {/* Large Download Button */}
            <TouchableOpacity 
              style={styles.downloadPdfBtnLarge} 
              onPress={() => handleDownloadPdf(item)}
              activeOpacity={0.8}
            >
              <Icon name="cloud-download-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.downloadPdfBtnLargeText}>Download / Share PDF Receipt</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.container}>
        {/* Top Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerIconWrap}>
            <Icon name="time" size={24} color="#003C8F" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Staff Shift History</Text>
          </View>
        </View>

        {/* Staff Selector Horizontal Bar */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Select Staff Member:</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.staffScrollContent}
          >
            {/* All Staff Chip */}
            <TouchableOpacity
              style={[
                styles.staffChip,
                selectedStaffId === 'ALL' && styles.staffChipActive
              ]}
              onPress={() => handleSelectStaff('ALL', 'All Staff')}
              activeOpacity={0.7}
            >
              <Icon 
                name="people" 
                size={15} 
                color={selectedStaffId === 'ALL' ? '#fff' : '#003C8F'} 
                style={{ marginRight: 5 }} 
              />
              <Text style={[
                styles.staffChipText,
                selectedStaffId === 'ALL' && styles.staffChipTextActive
              ]}>
                All Staff ({entries.length})
              </Text>
            </TouchableOpacity>

            {/* Individual Staff Chips */}
            {staffOptions.map((s) => {
              const isSelected = selectedStaffId === s.id;
              // Count entries for this staff
              const staffCount = entries.filter(e => 
                e.salesmanId === s.id || 
                (e.salesmanName && e.salesmanName.trim().toLowerCase() === s.name.trim().toLowerCase())
              ).length;

              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.staffChip,
                    isSelected && styles.staffChipActive
                  ]}
                  onPress={() => handleSelectStaff(s.id, s.name)}
                  activeOpacity={0.7}
                >
                  <Icon 
                    name="person" 
                    size={14} 
                    color={isSelected ? '#fff' : '#475569'} 
                    style={{ marginRight: 5 }} 
                  />
                  <Text style={[
                    styles.staffChipText,
                    isSelected && styles.staffChipTextActive
                  ]}>
                    {s.name} ({staffCount})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Summary Hero Stats Bar */}
        <View style={styles.heroStatsCard}>
          <View style={styles.heroStatsTop}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon 
                name={selectedStaffId === 'ALL' ? "people-circle-outline" : "person-circle-outline"} 
                size={22} 
                color="#003C8F" 
                style={{ marginRight: 6 }} 
              />
              <Text style={styles.heroStatsTitle}>
                {selectedStaffName}
              </Text>
            </View>
            <View style={styles.heroCountBadge}>
              <Text style={styles.heroCountBadgeText}>
                {stats.shiftsCount} {stats.shiftsCount === 1 ? 'Shift' : 'Shifts'}
              </Text>
            </View>
          </View>

          <View style={styles.heroStatsGrid}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Fuel Sold</Text>
              <Text style={styles.heroStatVal}>{stats.totalLiters.toFixed(1)} L</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Total Collection</Text>
              <Text style={[styles.heroStatVal, { color: '#15803D' }]}>
                ₹{stats.totalCollection.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatLabel}>Shortage/Excess</Text>
              <Text style={[
                styles.heroStatVal, 
                { color: stats.totalShortageOrExcess < -0.01 ? '#DC2626' : (stats.totalShortageOrExcess > 0.01 ? '#2563EB' : '#15803D') }
              ]}>
                {stats.totalShortageOrExcess < -0.01 
                  ? `-₹${Math.abs(stats.totalShortageOrExcess).toFixed(0)}` 
                  : (stats.totalShortageOrExcess > 0.01 ? `+₹${stats.totalShortageOrExcess.toFixed(0)}` : '₹0')}
              </Text>
            </View>
          </View>
        </View>

        {/* Entries List */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#003C8F" />
            <Text style={styles.loadingText}>Loading shift history...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredEntries}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 30 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Icon name="document-text-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No Shift Entries Found</Text>
                <Text style={styles.emptySub}>
                  {selectedStaffId !== 'ALL' 
                    ? `No daily entries recorded for ${selectedStaffName} yet.` 
                    : 'No daily entries recorded yet.'}
                </Text>
                {selectedStaffId !== 'ALL' && (
                  <TouchableOpacity 
                    style={styles.viewAllBtn} 
                    onPress={() => handleSelectStaff('ALL', 'All Staff')}
                  >
                    <Text style={styles.viewAllBtnText}>Show All Staff History</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#F8FAFC' 
  },
  container: { 
    flex: 1, 
    padding: 14 
  },

  // Top Header Card
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#003C8F'
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16
  },

  // Staff Filter Section
  filterSection: {
    marginBottom: 12
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6
  },
  staffScrollContent: {
    paddingVertical: 2
  },
  staffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 2
  },
  staffChipActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  staffChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  staffChipTextActive: {
    color: '#FFFFFF'
  },

  // Hero Summary Stats Bar
  heroStatsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  heroStatsTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  heroStatsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A'
  },
  heroCountBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  heroCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#003C8F'
  },
  heroStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center'
  },
  heroStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0'
  },
  heroStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B'
  },
  heroStatVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2
  },

  // Entry Cards
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B'
  },
  staffNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#003C8F'
  },

  // 3-Metric Summary Row
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9'
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1
  },
  summaryLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700'
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2
  },

  // Status Banner
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1
  },
  statusBoxShortage: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  statusBoxExcess: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD'
  },
  statusBoxBalanced: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC'
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800'
  },

  // Card Actions Row
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  downloadPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  downloadPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F',
    marginLeft: 4
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4
  },
  expandText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F',
    marginRight: 4
  },

  // Expandable Details
  detailsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
    marginTop: 4
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B'
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B'
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8
  },
  fuelSectionBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  fuelSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  fuelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  fuelSectionHeader: {
    fontSize: 12,
    fontWeight: '800'
  },
  digitalListContainer: {
    backgroundColor: '#F0F9FF',
    padding: 8,
    borderRadius: 8,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#003C8F'
  },
  digitalSubItemText: {
    fontSize: 11,
    color: '#0369A1',
    marginVertical: 2
  },
  downloadPdfBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
    elevation: 2
  },
  downloadPdfBtnLargeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF'
  },

  // Loading & Empty States
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12
  },
  emptySub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18
  },
  viewAllBtn: {
    backgroundColor: '#003C8F',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 14
  },
  viewAllBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700'
  }
});
