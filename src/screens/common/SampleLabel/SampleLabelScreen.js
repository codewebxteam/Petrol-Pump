import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { generateAndShareSampleLabelPdf } from '../../../utils/generateSampleLabelPdf';

export default function SampleLabelScreen() {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Form state with required prefilled values
  const [supplyLocation, setSupplyLocation] = useState('Baitalpur');
  const [divisionRegion, setDivisionRegion] = useState('Baitalpur');
  const [retailOutletName, setRetailOutletName] = useState('Baijnath');
  const [retailOutletAddress, setRetailOutletAddress] = useState('');
  const [oilCompany, setOilCompany] = useState('IOCL');

  // Other fields empty as requested
  const [product, setProduct] = useState(''); // 'MS', 'HSD', 'MS & HSD'
  const [sourceOfSample, setSourceOfSample] = useState('');
  const [tankLorryNo, setTankLorryNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  
  // Date & Time
  const now = new Date();
  const defaultDateStr = now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const defaultTimeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const [sampleDate, setSampleDate] = useState(defaultDateStr);
  const [sampleTime, setSampleTime] = useState(defaultTimeStr);

  // Density at 15°C
  const [challanDensity, setChallanDensity] = useState('');
  const [lorryDensity, setLorryDensity] = useState('');

  // Tank & Seals
  const [roTankNo, setRoTankNo] = useState('');
  const [aluminumSealNos, setAluminumSealNos] = useState('');
  const [woodenBoxSealNos, setWoodenBoxSealNos] = useState('');

  // Signatures / Authority
  const [dealerRepName, setDealerRepName] = useState('Baijnath');
  const [placeAndDate, setPlaceAndDate] = useState(`Baitalpur, ${defaultDateStr}`);
  const [driverName, setDriverName] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [oilCompanyFooter, setOilCompanyFooter] = useState('IOCL');

  // History state
  const [savedLabels, setSavedLabels] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Live density difference calculation
  const cDensityNum = parseFloat(challanDensity);
  const lDensityNum = parseFloat(lorryDensity);
  const densityDiff = (!isNaN(cDensityNum) && !isNaN(lDensityNum)) 
    ? (lDensityNum - cDensityNum) 
    : null;
  const isDensityPermissible = densityDiff !== null && Math.abs(densityDiff) <= 3.0;

  // Listen to saved sample labels
  useEffect(() => {
    const q = query(
      collection(db, 'sample_labels'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setSavedLabels(list);
      setLoadingHistory(false);
    }, (error) => {
      console.warn('Error fetching sample labels history:', error);
      setLoadingHistory(false);
    });

    return unsub;
  }, []);

  const handleResetForm = () => {
    Alert.alert(
      'Reset Form?',
      'Are you sure you want to clear all entered fields?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setSupplyLocation('Baitalpur');
            setDivisionRegion('Baitalpur');
            setRetailOutletName('Baijnath');
            setRetailOutletAddress('');
            setOilCompany('IOCL');
            setProduct('');
            setSourceOfSample('');
            setTankLorryNo('');
            setInvoiceNo('');
            setSampleDate(defaultDateStr);
            setSampleTime(defaultTimeStr);
            setChallanDensity('');
            setLorryDensity('');
            setRoTankNo('');
            setAluminumSealNos('');
            setWoodenBoxSealNos('');
            setDealerRepName('Baijnath');
            setPlaceAndDate(`Baitalpur, ${defaultDateStr}`);
            setDriverName('');
            setTransporterName('');
            setOilCompanyFooter('IOCL');
          }
        }
      ]
    );
  };

  const handleGeneratePdf = async () => {
    if (!tankLorryNo.trim() && !invoiceNo.trim()) {
      Toast.show({
        type: 'info',
        text1: 'Recommended Info',
        text2: 'Please enter Tank Lorry No. or Invoice No. before generating.'
      });
    }

    const payload = {
      supplyLocation,
      divisionRegion,
      retailOutletName,
      retailOutletAddress,
      oilCompany,
      product: product || 'MS / HSD',
      sourceOfSample: sourceOfSample || 'Tank Lorry Nozzle / Delivery Hose',
      tankLorryNo,
      invoiceNo,
      sampleDate,
      sampleTime,
      challanDensity,
      lorryDensity,
      roTankNo,
      aluminumSealNos,
      woodenBoxSealNos,
      dealerRepName,
      placeAndDate,
      driverName,
      transporterName,
      oilCompanyFooter
    };

    setGeneratingPdf(true);
    try {
      // 1. Generate & Share PDF
      const res = await generateAndShareSampleLabelPdf(payload);

      // 2. Save record to Firestore for audit & reprint
      await addDoc(collection(db, 'sample_labels'), {
        ...payload,
        createdAt: serverTimestamp()
      });

      if (res.success) {
        Toast.show({
          type: 'success',
          text1: 'Sample Label PDF Ready!',
          text2: 'Annexure S-2 generated successfully.'
        });
      }
    } catch (error) {
      console.error('Error in sample label generation:', error);
      Alert.alert('Error', error.message || 'Failed to generate Sample Label.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleReprintPdf = async (item) => {
    setGeneratingPdf(true);
    try {
      await generateAndShareSampleLabelPdf(item);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to reprint PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <View style={styles.container}>
          {/* Top Tabs: New Label | Saved History */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'new' && styles.activeTabBtn]}
              onPress={() => setActiveTab('new')}
              activeOpacity={0.8}
            >
              <Icon 
                name="document-text" 
                size={17} 
                color={activeTab === 'new' ? '#003C8F' : '#64748B'} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[styles.tabBtnText, activeTab === 'new' && styles.activeTabBtnText]}>
                New Sample Label
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'history' && styles.activeTabBtn]}
              onPress={() => setActiveTab('history')}
              activeOpacity={0.8}
            >
              <Icon 
                name="time" 
                size={17} 
                color={activeTab === 'history' ? '#003C8F' : '#64748B'} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[styles.tabBtnText, activeTab === 'history' && styles.activeTabBtnText]}>
                Saved Slips ({savedLabels.length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'new' ? (
            <ScrollView 
              style={{ flex: 1 }} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 220 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header Hero Banner */}
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroIconWrap}>
                    <Icon name="flask" size={24} color="#003C8F" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.heroBadge}>ANNEXURE - S-2</Text>
                    <Text style={styles.heroTitle}>Tank Lorry Retention Sample Label</Text>
                    <Text style={styles.heroSub}>
                      Official retention sample slip drawn at retail outlet during decantation.
                    </Text>
                  </View>
                </View>
              </View>

              {/* 1. Location & Outlet Info (Pre-filled as requested) */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="business-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>1. Outlet & Location Details</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Supply Location (Pre-filled):</Text>
                    <TextInput
                      style={[styles.input, styles.inputPrefilled]}
                      value={supplyLocation}
                      onChangeText={setSupplyLocation}
                      placeholder="Supply Location"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Division / Territory / Region:</Text>
                    <TextInput
                      style={[styles.input, styles.inputPrefilled]}
                      value={divisionRegion}
                      onChangeText={setDivisionRegion}
                      placeholder="Division"
                    />
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>1. Name & Address of Retail Outlet:</Text>
                  <TextInput
                    style={[styles.input, styles.inputPrefilled]}
                    value={retailOutletName}
                    onChangeText={setRetailOutletName}
                    placeholder="Name of Retail Outlet"
                  />
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>2. Name of Oil Company:</Text>
                    <TextInput
                      style={[styles.input, styles.inputPrefilled]}
                      value={oilCompany}
                      onChangeText={setOilCompany}
                      placeholder="IOCL"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Outlet Address / Details:</Text>
                    <TextInput
                      style={styles.input}
                      value={retailOutletAddress}
                      onChangeText={setRetailOutletAddress}
                      placeholder="e.g. Baitalpur, Deoria"
                    />
                  </View>
                </View>
              </View>

              {/* 2. Product & Sample Source */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="color-filter-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>2. Product & Sample Source</Text>
                </View>

                <Text style={styles.inputLabel}>3. Product (MS / HSD):</Text>
                <View style={styles.productPillsRow}>
                  {['MS (Petrol)', 'HSD (Diesel)', 'MS & HSD'].map((p) => {
                    const isSelected = product === p || (p === 'MS (Petrol)' && product === 'MS') || (p === 'HSD (Diesel)' && product === 'HSD');
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.productPill, isSelected && styles.productPillActive]}
                        onPress={() => setProduct(p)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.productPillText, isSelected && styles.productPillTextActive]}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={styles.inputLabel}>4. Source of Sample:</Text>
                  <TextInput
                    style={styles.input}
                    value={sourceOfSample}
                    onChangeText={setSourceOfSample}
                    placeholder="e.g. Tank Lorry Nozzle / Delivery Hose / Manhole"
                  />
                </View>
              </View>

              {/* 3. Tanker, Invoice, Date & Time */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="car-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>3. Tank Lorry, Invoice & Time</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>5. Tank Lorry No.:</Text>
                    <TextInput
                      style={styles.input}
                      value={tankLorryNo}
                      onChangeText={setTankLorryNo}
                      placeholder="e.g. UP 53 BT 1234"
                      autoCapitalize="characters"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Invoice No.:</Text>
                    <TextInput
                      style={styles.input}
                      value={invoiceNo}
                      onChangeText={setInvoiceNo}
                      placeholder="e.g. 09182348"
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>6. Samples Drawn On (Date):</Text>
                    <TextInput
                      style={styles.input}
                      value={sampleDate}
                      onChangeText={setSampleDate}
                      placeholder="DD/MM/YYYY"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>At (Time in Hours):</Text>
                    <TextInput
                      style={styles.input}
                      value={sampleTime}
                      onChangeText={setSampleTime}
                      placeholder="e.g. 14:30"
                    />
                  </View>
                </View>
              </View>

              {/* 4. Density at 15°C */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="speedometer-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>4. Density at 15°C (kg/m³)</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>7a. As in Challan:</Text>
                    <TextInput
                      style={styles.input}
                      value={challanDensity}
                      onChangeText={setChallanDensity}
                      placeholder="e.g. 742.5"
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>7b. Sample from Lorry:</Text>
                    <TextInput
                      style={styles.input}
                      value={lorryDensity}
                      onChangeText={setLorryDensity}
                      placeholder="e.g. 743.0"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                {densityDiff !== null && (
                  <View style={[
                    styles.densityDiffBadge, 
                    isDensityPermissible ? styles.densityDiffOk : styles.densityDiffWarn
                  ]}>
                    <Icon 
                      name={isDensityPermissible ? "checkmark-circle" : "alert-circle"} 
                      size={16} 
                      color={isDensityPermissible ? "#15803D" : "#DC2626"} 
                      style={{ marginRight: 6 }} 
                    />
                    <Text style={[
                      styles.densityDiffText, 
                      { color: isDensityPermissible ? "#15803D" : "#DC2626" }
                    ]}>
                      Difference: {densityDiff > 0 ? `+${densityDiff.toFixed(2)}` : densityDiff.toFixed(2)} kg/m³
                      {isDensityPermissible 
                        ? ' (Within permissible ±3.0 limit ✓)' 
                        : ' (Exceeds permissible limit ⚠️)'}
                    </Text>
                  </View>
                )}
              </View>

              {/* 5. Tank Decanted & Container Seals */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="cube-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>5. Decanted Tank & Plastic Seals</Text>
                </View>

                <View>
                  <Text style={styles.inputLabel}>8. RO Tank No. of Product Decanted:</Text>
                  <TextInput
                    style={styles.input}
                    value={roTankNo}
                    onChangeText={setRoTankNo}
                    placeholder="e.g. Tank 1 (MS) / Tank 2 (HSD)"
                  />
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>9. Seals of Al Container:</Text>
                    <TextInput
                      style={styles.input}
                      value={aluminumSealNos}
                      onChangeText={setAluminumSealNos}
                      placeholder="e.g. AL-9821, AL-9822"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>10. Seals of Wooden Box:</Text>
                    <TextInput
                      style={styles.input}
                      value={woodenBoxSealNos}
                      onChangeText={setWoodenBoxSealNos}
                      placeholder="e.g. WB-4412"
                    />
                  </View>
                </View>
              </View>

              {/* 6. Driver, Transporter & Signatures Info */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Icon name="person-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>6. Driver & Representative Details</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Dealer / Rep Name:</Text>
                    <TextInput
                      style={styles.input}
                      value={dealerRepName}
                      onChangeText={setDealerRepName}
                      placeholder="Baijnath / Manager"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Place & Date:</Text>
                    <TextInput
                      style={styles.input}
                      value={placeAndDate}
                      onChangeText={setPlaceAndDate}
                      placeholder="Baitalpur"
                    />
                  </View>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>T/L Driver Name:</Text>
                    <TextInput
                      style={styles.input}
                      value={driverName}
                      onChangeText={setDriverName}
                      placeholder="Driver Name"
                    />
                  </View>

                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>Transporter's Name:</Text>
                    <TextInput
                      style={styles.input}
                      value={transporterName}
                      onChangeText={setTransporterName}
                      placeholder="Transporter Name"
                    />
                  </View>
                </View>
              </View>

              {/* Certification Box Preview */}
              <View style={styles.certCard}>
                <Icon name="shield-checkmark" size={18} color="#003C8F" style={{ marginRight: 6, marginTop: 2 }} />
                <Text style={styles.certText}>
                  "Certified that empty containers had been rinsed with the products before drawing of samples in my presence and the sample is retained after proper labeling and sealing."
                </Text>
              </View>

              {/* Generate & Reset Buttons */}
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={styles.resetBtn}
                  onPress={handleResetForm}
                  activeOpacity={0.7}
                >
                  <Icon name="refresh-outline" size={18} color="#64748B" />
                  <Text style={styles.resetBtnText}>Clear Form</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.generateBtn}
                  onPress={handleGeneratePdf}
                  disabled={generatingPdf}
                  activeOpacity={0.8}
                >
                  {generatingPdf ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="print-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.generateBtnText}>
                        Generate Annexure S-2 PDF
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            /* TAB 2: History of previously generated sample labels */
            <View style={{ flex: 1 }}>
              {loadingHistory ? (
                <View style={styles.centerLoading}>
                  <ActivityIndicator size="large" color="#003C8F" />
                  <Text style={styles.loadingText}>Loading saved sample labels...</Text>
                </View>
              ) : (
                <FlatList
                  data={savedLabels}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingBottom: 30 }}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <View style={styles.emptyCard}>
                      <Icon name="flask-outline" size={48} color="#94A3B8" />
                      <Text style={styles.emptyTitle}>No Sample Labels Saved</Text>
                      <Text style={styles.emptySub}>
                        When you generate an Annexure S-2 sample slip, it will be safely recorded here for 1-tap reprinting.
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => {
                    return (
                      <View style={styles.historyCard}>
                        <View style={styles.historyCardTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.historyCardTitle}>
                              🚛 {item.tankLorryNo || 'Tank Lorry Slip'}
                            </Text>
                            <Text style={styles.historyCardSub}>
                              Invoice: {item.invoiceNo || 'N/A'} • Product: {item.product || 'MS/HSD'}
                            </Text>
                            <Text style={styles.historyCardDate}>
                              Drawn on: {item.sampleDate || 'Recent'} at {item.sampleTime || ''}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.reprintBtn}
                            onPress={() => handleReprintPdf(item)}
                            activeOpacity={0.7}
                          >
                            <Icon name="share-outline" size={16} color="#003C8F" />
                            <Text style={styles.reprintBtnText}>PDF Slip</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }}
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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

  // Top Tabs
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9
  },
  activeTabBtn: {
    backgroundColor: '#EFF6FF'
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B'
  },
  activeTabBtnText: {
    color: '#003C8F',
    fontWeight: '800'
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#003C8F',
    backgroundColor: '#DBEAFE',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#003C8F'
  },
  heroSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 15
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#003C8F'
  },

  rowTwoInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  inputCol: {
    flex: 1,
    marginHorizontal: 3
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1E293B'
  },
  inputPrefilled: {
    backgroundColor: '#F1F5F9',
    fontWeight: '700',
    color: '#0F172A'
  },

  // Product Pills
  productPillsRow: {
    flexDirection: 'row',
    marginTop: 4
  },
  productPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  productPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  productPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569'
  },
  productPillTextActive: {
    color: '#FFFFFF'
  },

  // Density Diff Badge
  densityDiffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1
  },
  densityDiffOk: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC'
  },
  densityDiffWarn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5'
  },
  densityDiffText: {
    fontSize: 11,
    fontWeight: '700'
  },

  // Certification Box
  certCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 14
  },
  certText: {
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
    flex: 1,
    fontStyle: 'italic'
  },

  // Action Buttons Row
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginRight: 10
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 4
  },
  generateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 3
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3
  },

  // History Card
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2
  },
  historyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  historyCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A'
  },
  historyCardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2
  },
  historyCardDate: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2
  },
  reprintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9
  },
  reprintBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F',
    marginLeft: 4
  },

  centerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10
  },
  emptyCard: {
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
  }
});
