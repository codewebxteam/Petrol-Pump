import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import Icon from '@expo/vector-icons/Ionicons';
import { generateAndSharePdf } from '../../../utils/generatePdfReceipt';

export default function StaffHistoryScreen() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'sales_reports'),
      orderBy('timestamp', 'desc'),
      limit(25)
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
        totalLitersSold: Number(item.totalQuantitySold || item.quantitySold || 0),
        totalExpectedAmount: Number(item.expectedTotalAmount || item.expectedAmount || 0),
        cashAmt: Number(item.cashAmount || 0),
        cashNotesAmt: Number(item.cashNotesAmount || 0),
        coinsAmt: Number(item.coinsAmount || 0),
        digitalAmt: Number(item.onlineAmount || 0) || (Number(item.phonePeAmount || 0) + Number(item.paytmAmount || 0) + Number(item.bharatPeAmount || 0)),
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
    const dateStr = item.timestamp?.toDate 
      ? item.timestamp.toDate().toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' }) 
      : 'आज';
    const timeStr = item.timestamp?.toDate 
      ? item.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      : '';
    const isPetrolAndDiesel = item.entryType === 'machine_daily_entry' || (item.petrolQuantitySold !== undefined && item.dieselQuantitySold !== undefined);
    const isExpanded = expandedId === item.id;
    const isShortage = (item.shortageOrExcess || 0) < 0;

    return (
      <View style={[styles.card, { borderLeftColor: isPetrolAndDiesel ? '#003C8F' : (item.fuelType === 'Petrol' ? '#FF6F00' : '#0284C7') }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpand(item.id)}>
          <View style={styles.cardTop}>
            <View>
              <Text style={styles.dateText}>{dateStr} {timeStr ? `• ${timeStr}` : ''}</Text>
              <Text style={styles.staffNameText}>👤 {item.salesmanName || 'Staff'}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: '#E0F2FE' }]}>
              <Text style={[styles.badgeText, { color: '#0369A1' }]}>
                {item.machineName || item.machineId || item.nozzleId || 'Machine'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>कुल बिक्री (Liters)</Text>
              <Text style={styles.summaryValue}>{Number(item.totalQuantitySold || 0).toFixed(4)} L</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>अपेक्षित (₹)</Text>
              <Text style={styles.summaryValue}>₹{Number(item.expectedTotalAmount || 0).toFixed(0)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>वसूली (₹)</Text>
              <Text style={[styles.summaryValue, { color: '#15803D' }]}>
                ₹{Number(item.totalPayment || 0).toFixed(0)}
              </Text>
            </View>
          </View>

          <View style={[styles.statusBox, { backgroundColor: isShortage ? '#FEF2F2' : '#F0FDF4' }]}>
            <Text style={[styles.statusText, { color: isShortage ? '#DC2626' : '#166534' }]}>
              {isShortage ? 'कमी (Shortage): ' : 'अतिरिक्त (Excess): '} 
              ₹{Math.abs(item.shortageOrExcess || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.cardActionsRow}>
            <TouchableOpacity 
              style={styles.downloadPdfBtn} 
              onPress={() => handleDownloadPdf(item)}
              activeOpacity={0.7}
            >
              <Icon name="document-text-outline" size={16} color="#003C8F" />
              <Text style={styles.downloadPdfBtnText}>📄 PDF रसीद</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.expandRow}
              onPress={() => toggleExpand(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.expandText}>{isExpanded ? 'विवरण छिपाएं' : 'पूरा विवरण देखें'}</Text>
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#003C8F" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.detailsContainer}>
            {isPetrolAndDiesel ? (
              <>
                {/* Petrol Section */}
                <View style={styles.fuelSectionBox}>
                  <Text style={[styles.fuelSectionHeader, { color: '#FF6F00' }]}>⛽ पेट्रोल ({item.petrolNozzleId || 'N1'} ➔ Tank 1)</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>ओपनिंग मीटर:</Text>
                    <Text style={styles.detailValue}>{item.petrolOpeningMeter || '0.0000'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>क्लोजिंग मीटर:</Text>
                    <Text style={styles.detailValue}>{item.petrolClosingMeter || '0.0000'}</Text>
                  </View>
                  {Number(item.petrolTesting) > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>जांच तेल (Testing):</Text>
                      <Text style={[styles.detailValue, { color: '#0369A1' }]}>
                        {item.petrolTesting} L (वापस Tank 1 में डाला गया)
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>बिक्री:</Text>
                    <Text style={[styles.detailValue, { color: '#FF6F00' }]}>
                      {Number(item.petrolQuantitySold || 0).toFixed(4)} L  (@ ₹{item.petrolRate}/L)
                    </Text>
                  </View>
                </View>

                {/* Diesel Section */}
                <View style={[styles.fuelSectionBox, { marginTop: 8 }]}>
                  <Text style={[styles.fuelSectionHeader, { color: '#0284C7' }]}>⛽ डीजल ({item.dieselNozzleId || 'N2'} ➔ Tank 2)</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>ओपनिंग मीटर:</Text>
                    <Text style={styles.detailValue}>{item.dieselOpeningMeter || '0.0000'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>क्लोजिंग मीटर:</Text>
                    <Text style={styles.detailValue}>{item.dieselClosingMeter || '0.0000'}</Text>
                  </View>
                  {Number(item.dieselTesting) > 0 && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>जांच तेल (Testing):</Text>
                      <Text style={[styles.detailValue, { color: '#0369A1' }]}>
                        {item.dieselTesting} L (वापस Tank 2 में डाला गया)
                      </Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>बिक्री:</Text>
                    <Text style={[styles.detailValue, { color: '#0284C7' }]}>
                      {Number(item.dieselQuantitySold || 0).toFixed(4)} L  (@ ₹{item.dieselRate}/L)
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>नोज़ल:</Text>
                  <Text style={styles.detailValue}>{item.nozzleId}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>ओपनिंग मीटर:</Text>
                  <Text style={styles.detailValue}>{item.openingMeterReading}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>क्लोजिंग मीटर:</Text>
                  <Text style={styles.detailValue}>{item.closingMeterReading}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>ईंधन दर:</Text>
                  <Text style={styles.detailValue}>₹{item.fuelRate}/L</Text>
                </View>
              </>
            )}

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>कैश संग्रह:</Text>
              <Text style={styles.detailValue}>
                ₹{item.cashAmount || 0}
                {Number(item.coinsAmount) > 0 ? ` (नोट: ₹${item.cashNotesAmount || ((item.cashAmount || 0) - item.coinsAmount)} • सिक्का: ₹${item.coinsAmount})` : ''}
              </Text>
            </View>

            {/* Digital / Card Payments Breakdown */}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>डिजिटल व कार्ड संग्रह:</Text>
              <Text style={[styles.detailValue, { color: '#003C8F' }]}>
                ₹{(Number(item.onlineAmount || 0) || (Number(item.phonePeAmount || 0) + Number(item.paytmAmount || 0) + Number(item.bharatPeAmount || 0)))}
              </Text>
            </View>

            {item.digitalPaymentsBreakdown && item.digitalPaymentsBreakdown.length > 0 && (
              <View style={styles.digitalListContainer}>
                {item.digitalPaymentsBreakdown.map((d, i) => (
                  <Text key={i} style={styles.digitalSubItemText}>
                    • {d.name}: <Text style={{fontWeight: 'bold'}}>₹{d.amount}</Text>
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>उधारी:</Text>
              <Text style={styles.detailValue}>₹{item.udhariAmount || 0}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>खर्चे:</Text>
              <Text style={styles.detailValue}>₹{item.expenses || 0}</Text>
            </View>

            <TouchableOpacity 
              style={styles.downloadPdfBtnLarge} 
              onPress={() => handleDownloadPdf(item)}
              activeOpacity={0.8}
            >
              <Icon name="cloud-download-outline" size={18} color="#fff" />
              <Text style={styles.downloadPdfBtnLargeText}>इस हिसाब की PDF रसीद डाउनलोड / शेयर करें</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Icon name="time" size={24} color="#003C8F" />
          <Text style={styles.headerTitle}>हालिया दैनिक प्रविष्टियां (Recent Entries)</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#003C8F" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Icon name="document-text-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>कोई प्रविष्टि नहीं मिली (No entries found)</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
  container: { flex: 1, padding: 16 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  headerTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#003C8F', 
    marginLeft: 8 
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  dateText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569'
  },
  staffNameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 2
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold'
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10
  },
  summaryItem: {
    alignItems: 'center'
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600'
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2
  },

  statusBox: {
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8
  },
  statusText: {
    fontSize: 13,
    fontWeight: 'bold'
  },

  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
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
  downloadPdfBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 14
  },
  downloadPdfBtnLargeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 6
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4
  },
  expandText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003C8F',
    marginRight: 4
  },

  detailsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B'
  },
  detailValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E293B'
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 6
  },
  fuelSectionBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  fuelSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6
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

  emptyBox: {
    alignItems: 'center',
    marginTop: 60
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 10
  }
});
