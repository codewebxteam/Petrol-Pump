import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../../../services/firebase';
import * as ImagePicker from 'expo-image-picker';
import { uploadMultipleImagesToImageKit } from '../../../services/imagekitService';
import ImageViewerModal from '../../../components/ImageViewerModal';
import ScrollableModal from '../../../components/ScrollableModal';
import { 
  processFuelOnload, 
  updateTankStockManual, 
  syncAndConsolidateTanks,
  updateSavedOnloadSlip,
  deleteSavedOnloadSlip
} from '../../../services/dbServices';
import { generateAndShareSampleLabelPdf } from '../../../utils/generateSampleLabelPdf';

export default function OnloadScreen() {
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [submitting, setSubmitting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Live Tanks State
  const [tanks, setTanks] = useState([]);
  const [savedLabels, setSavedLabels] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Stock Edit Modal State
  const [showStockEditModal, setShowStockEditModal] = useState(false);
  const [editTank1Liters, setEditTank1Liters] = useState('');
  const [editTank1Dip, setEditTank1Dip] = useState('');
  const [editTank2Liters, setEditTank2Liters] = useState('');
  const [editTank2Dip, setEditTank2Dip] = useState('');
  const [savingStockEdit, setSavingStockEdit] = useState(false);

  // --- 1. Fuel Onload / Decanting Data (New Requirement) ---
  const [petrolLiters, setPetrolLiters] = useState('');
  const [petrolDip, setPetrolDip] = useState('');
  const [dieselLiters, setDieselLiters] = useState('');
  const [dieselDip, setDieselDip] = useState('');

  // --- 2. EXACT Original Sample Label Data (Annexure S-2) ---
  const [supplyLocation, setSupplyLocation] = useState('Baitalpur');
  const [divisionRegion, setDivisionRegion] = useState('Baitalpur');
  const [retailOutletName, setRetailOutletName] = useState('Baijnath');
  const [retailOutletAddress, setRetailOutletAddress] = useState('');
  const [oilCompany, setOilCompany] = useState('IOCL');

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

  // Live density difference calculation
  const cDensityNum = parseFloat(challanDensity);
  const lDensityNum = parseFloat(lorryDensity);
  const densityDiff = (!isNaN(cDensityNum) && !isNaN(lDensityNum)) 
    ? parseFloat((lDensityNum - cDensityNum).toFixed(2)) 
    : null;
  const isDensityPermissible = densityDiff !== null && Math.abs(densityDiff) <= 3.0;

  // --- 3. Edit Saved Slip States ---
  const [editingSlipId, setEditingSlipId] = useState(null);
  const [showEditSlipModal, setShowEditSlipModal] = useState(false);
  const [editingSlipItem, setEditingSlipItem] = useState(null);
  const [savingSlipEdit, setSavingSlipEdit] = useState(false);

  // Edit Modal form fields
  const [editTankLorryNo, setEditTankLorryNo] = useState('');
  const [editInvoiceNo, setEditInvoiceNo] = useState('');
  const [editProduct, setEditProduct] = useState('');
  const [editPetrolLiters, setEditPetrolLiters] = useState('');
  const [editPetrolDip, setEditPetrolDip] = useState('');
  const [editDieselLiters, setEditDieselLiters] = useState('');
  const [editDieselDip, setEditDieselDip] = useState('');
  const [editAdjustTankStock, setEditAdjustTankStock] = useState(true);

  const [editSupplyLocation, setEditSupplyLocation] = useState('Baitalpur');
  const [editDivisionRegion, setEditDivisionRegion] = useState('Baitalpur');
  const [editRetailOutletName, setEditRetailOutletName] = useState('Baijnath');
  const [editRetailOutletAddress, setEditRetailOutletAddress] = useState('');
  const [editOilCompany, setOilCompanyEdit] = useState('IOCL');
  const [editSourceOfSample, setEditSourceOfSample] = useState('');
  const [editSampleDate, setEditSampleDate] = useState('');
  const [editSampleTime, setEditSampleTime] = useState('');

  const [editChallanDensity, setEditChallanDensity] = useState('');
  const [editLorryDensity, setEditLorryDensity] = useState('');
  const [editRoTankNo, setEditRoTankNo] = useState('');
  const [editAluminumSealNos, setEditAluminumSealNos] = useState('');
  const [editWoodenBoxSealNos, setEditWoodenBoxSealNos] = useState('');

  const [editDealerRepName, setEditDealerRepName] = useState('Baijnath');
  const [editPlaceAndDate, setEditPlaceAndDate] = useState('');
  const [editDriverName, setEditDriverName] = useState('');
  const [editTransporterName, setEditTransporterName] = useState('');
  const [editOilCompanyFooter, setEditOilCompanyFooter] = useState('IOCL');

  const [editExistingImages, setEditExistingImages] = useState([]);
  const [editNewSelectedImages, setEditNewSelectedImages] = useState([]);

  // Live density difference calculation for Edit Modal
  const editCDensityNum = parseFloat(editChallanDensity);
  const editLDensityNum = parseFloat(editLorryDensity);
  const editDensityDiff = (!isNaN(editCDensityNum) && !isNaN(editLDensityNum)) 
    ? parseFloat((editLDensityNum - editCDensityNum).toFixed(2)) 
    : null;
  const isEditDensityPermissible = editDensityDiff !== null && Math.abs(editDensityDiff) <= 3.0;

  // Auto-healing & Subscriptions
  useEffect(() => {
    // Auto-heal negative or duplicate tanks on mount
    syncAndConsolidateTanks().catch(() => null);

    // Subscribe to Tanks
    const unsubTanks = onSnapshot(collection(db, 'tanks'), (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setTanks(list);
    }, (err) => console.warn("Tanks listener error:", err.message));

    // Subscribe to Sample Labels (Saved Slips)
    const qSamples = query(
      collection(db, 'sample_labels'), 
      orderBy('timestamp', 'desc'), 
      limit(50)
    );
    const unsubSamples = onSnapshot(qSamples, (snapshot) => {
      const list = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setSavedLabels(list);
      setLoadingHistory(false);
    }, (err) => {
      console.warn("Sample labels listener error:", err.message);
      setLoadingHistory(false);
    });

    return () => {
      unsubTanks();
      unsubSamples();
    };
  }, []);

  // Compute canonical Tank 1 (Petrol) & Tank 2 (Diesel)
  const tank1Data = useMemo(() => {
    const t = tanks.find(x => x.id === 'Tank-1' || x.tankId === 'Tank-1' || String(x.name || x.fuelType || '').toLowerCase().includes('petrol') || String(x.id).includes('1'));
    const stockVal = parseFloat(t?.petrolStock !== undefined ? t.petrolStock : (t?.stock !== undefined ? t.stock : 0)) || 0;
    return {
      id: t?.id || 'Tank-1',
      name: t?.name || 'Tank 1 (Petrol - MS)',
      fuelType: 'Petrol',
      stock: Math.max(0, stockVal),
      dip: t?.dipReading || null
    };
  }, [tanks]);

  const tank2Data = useMemo(() => {
    const t = tanks.find(x => x.id === 'Tank-2' || x.tankId === 'Tank-2' || String(x.name || x.fuelType || '').toLowerCase().includes('diesel') || String(x.id).includes('2'));
    const stockVal = parseFloat(t?.dieselStock !== undefined ? t.dieselStock : (t?.stock !== undefined ? t.stock : 0)) || 0;
    return {
      id: t?.id || 'Tank-2',
      name: t?.name || 'Tank 2 (Diesel - HSD)',
      fuelType: 'Diesel',
      stock: Math.max(0, stockVal),
      dip: t?.dipReading || null
    };
  }, [tanks]);

  // Open Stock Edit Modal prefilled
  const handleOpenStockEdit = () => {
    setEditTank1Liters(tank1Data.stock.toFixed(0));
    setEditTank1Dip(tank1Data.dip ? String(tank1Data.dip).replace(/[^0-9.]/g, '') : '');
    setEditTank2Liters(tank2Data.stock.toFixed(0));
    setEditTank2Dip(tank2Data.dip ? String(tank2Data.dip).replace(/[^0-9.]/g, '') : '');
    setShowStockEditModal(true);
  };

  // Save Direct Stock / Dip Adjustment
  const handleSaveStockEdit = async () => {
    const pVal = parseFloat(editTank1Liters);
    const dVal = parseFloat(editTank2Liters);

    if (isNaN(pVal) || pVal < 0 || isNaN(dVal) || dVal < 0) {
      Toast.show({ 
        type: 'error', 
        text1: 'त्रुटि', 
        text2: 'कृपया दोनों टैंकों का वैध स्टॉक (Liters) दर्ज करें।' 
      });
      return;
    }

    setSavingStockEdit(true);
    try {
      await updateTankStockManual({
        tankId: 'Tank-1',
        liters: pVal,
        dipReading: editTank1Dip,
        reason: 'Direct Stock / Dip Edit from Onload Screen',
        adjustedBy: 'Staff'
      });

      await updateTankStockManual({
        tankId: 'Tank-2',
        liters: dVal,
        dipReading: editTank2Dip,
        reason: 'Direct Stock / Dip Edit from Onload Screen',
        adjustedBy: 'Staff'
      });

      Toast.show({ 
        type: 'success', 
        text1: 'टैंक स्टॉक अपडेट हुआ ✅', 
        text2: `Tank 1: ${pVal}L (${editTank1Dip || '-'} cm) | Tank 2: ${dVal}L (${editTank2Dip || '-'} cm)` 
      });
      setShowStockEditModal(false);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: err.message });
    } finally {
      setSavingStockEdit(false);
    }
  };

  // Reset form to defaults
  const handleResetForm = () => {
    Alert.alert(
      'Reset Form?',
      'क्या आप दर्ज की गई सभी जानकारी खाली करना चाहते हैं?',
      [
        { text: 'रद्द करें (Cancel)', style: 'cancel' },
        {
          text: 'रीसेट (Reset)',
          style: 'destructive',
          onPress: () => {
            setPetrolLiters('');
            setPetrolDip('');
            setDieselLiters('');
            setDieselDip('');
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
            setSelectedImages([]);
          }
        }
      ]
    );
  };

  // Photo handlers for Onload / Sample Lorry
  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'कैमरा उपयोग की अनुमति आवश्यक है।');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedImages(prev => [
          ...prev,
          {
            uri: asset.uri,
            base64: asset.base64,
            fileName: `onload_${Date.now()}.jpg`
          }
        ]);
      }
    } catch (err) {
      console.warn('Camera error:', err);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'गैलरी उपयोग की अनुमति आवश्यक है।');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImgs = result.assets.map((asset, idx) => ({
          uri: asset.uri,
          base64: asset.base64,
          fileName: `onload_${Date.now()}_${idx}.jpg`
        }));
        setSelectedImages(prev => [...prev, ...newImgs]);
      }
    } catch (err) {
      console.warn('Gallery error:', err);
    }
  };

  const handleRemoveImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Generate Exact Annexure S-2 PDF & Save Onload
  const handleGeneratePdf = async () => {
    const pL = parseFloat(petrolLiters) || 0;
    const dL = parseFloat(dieselLiters) || 0;

    // 100% IDENTICAL Payload as in SampleLabelScreen.js
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
      dealerRepName: dealerRepName || 'Baijnath',
      placeAndDate: placeAndDate || `Baitalpur, ${sampleDate}`,
      driverName,
      transporterName,
      oilCompanyFooter,
      // Fuel onload addition data
      petrolLiters: pL,
      petrolDip,
      dieselLiters: dL,
      dieselDip
    };

    setGeneratingPdf(true);
    try {
      // Upload optional images if attached (preserving existing URLs if editing)
      let uploadedUrls = [];
      if (selectedImages.length > 0) {
        const existingUrls = selectedImages
          .filter(img => img.isExisting || (typeof img === 'string') || (img.uri && (img.uri.startsWith('http://') || img.uri.startsWith('https://'))))
          .map(img => typeof img === 'string' ? img : img.uri);
        const newImages = selectedImages.filter(img => !img.isExisting && (!img.uri || (!img.uri.startsWith('http://') && !img.uri.startsWith('https://'))));

        if (newImages.length > 0) {
          setUploadingImages(true);
          try {
            const freshUrls = await uploadMultipleImagesToImageKit(newImages, '/onload_samples');
            uploadedUrls = [...existingUrls, ...freshUrls];
          } catch (uploadErr) {
            console.warn('Optional image upload failed, proceeding with onload:', uploadErr);
            uploadedUrls = existingUrls;
          } finally {
            setUploadingImages(false);
          }
        } else {
          uploadedUrls = existingUrls;
        }
      }

      const fullPayload = {
        ...payload,
        imageUrls: uploadedUrls
      };

      // 1. IMMEDIATELY Generate & Share Annexure S-2 PDF (100% identical)
      const res = await generateAndShareSampleLabelPdf(fullPayload);

      // 2. Save record & update tanks if liters entered OR update existing slip
      if (editingSlipId) {
        await updateSavedOnloadSlip(editingSlipId, fullPayload, true);
        setEditingSlipId(null);
        Toast.show({
          type: 'success',
          text1: 'स्लिप अपडेट हुई ✅',
          text2: 'सेव्ड स्लिप का डेटा सफलतापूर्वक अपडेट हो गया!'
        });
        setSelectedImages([]);
      } else {
        await processFuelOnload(fullPayload);

        if (res.success) {
          Toast.show({
            type: 'success',
            text1: 'Sample Label PDF Ready!',
            text2: (pL > 0 || dL > 0)
              ? `PDF Ready • टैंकों में स्टॉक जुड़ा (${pL > 0 ? `+${pL}L MS ` : ''}${dL > 0 ? `+${dL}L HSD` : ''})${uploadedUrls.length > 0 ? ` • ${uploadedUrls.length} फ़ोटो सेव` : ''}`
              : 'Annexure S-2 generated successfully.'
          });
          setSelectedImages([]);
        }
      }
    } catch (error) {
      console.error('Error generating PDF / saving onload:', error);
      Alert.alert('Error', error.message || 'Failed to generate Sample Label.');
    } finally {
      setGeneratingPdf(false);
      setUploadingImages(false);
    }
  };

  // Reprint / Share Saved Slip
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

  // --- Handlers for Editing Saved Slips ---
  const handleOpenEditModal = (item) => {
    setEditingSlipItem(item);
    setEditTankLorryNo(item.tankLorryNo || item.tankerNumber || '');
    setEditInvoiceNo(item.invoiceNo || item.invoiceNumber || '');
    setEditProduct(item.product || 'MS / HSD');
    setEditPetrolLiters(item.petrolLiters !== undefined && item.petrolLiters !== null ? String(item.petrolLiters) : '');
    setEditPetrolDip(item.petrolDip ? String(item.petrolDip).replace(/[^0-9.]/g, '') : '');
    setEditDieselLiters(item.dieselLiters !== undefined && item.dieselLiters !== null ? String(item.dieselLiters) : '');
    setEditDieselDip(item.dieselDip ? String(item.dieselDip).replace(/[^0-9.]/g, '') : '');
    setEditAdjustTankStock(true);

    setEditSupplyLocation(item.supplyLocation || 'Baitalpur');
    setEditDivisionRegion(item.divisionRegion || 'Baitalpur');
    setEditRetailOutletName(item.retailOutletName || 'Baijnath');
    setEditRetailOutletAddress(item.retailOutletAddress || '');
    setOilCompanyEdit(item.oilCompany || 'IOCL');
    setEditSourceOfSample(item.sourceOfSample || 'Tank Lorry Nozzle / Delivery Hose');
    setEditSampleDate(item.sampleDate || defaultDateStr);
    setEditSampleTime(item.sampleTime || defaultTimeStr);

    setEditChallanDensity(item.challanDensity ? String(item.challanDensity) : '');
    setEditLorryDensity(item.lorryDensity ? String(item.lorryDensity) : '');
    setEditRoTankNo(item.roTankNo || '');
    setEditAluminumSealNos(item.aluminumSealNos || '');
    setEditWoodenBoxSealNos(item.woodenBoxSealNos || '');

    setEditDealerRepName(item.dealerRepName || 'Baijnath');
    setEditPlaceAndDate(item.placeAndDate || `Baitalpur, ${item.sampleDate || defaultDateStr}`);
    setEditDriverName(item.driverName || '');
    setEditTransporterName(item.transporterName || '');
    setEditOilCompanyFooter(item.oilCompanyFooter || 'IOCL');

    setEditExistingImages(Array.isArray(item.imageUrls) ? [...item.imageUrls] : []);
    setEditNewSelectedImages([]);
    setShowEditSlipModal(true);
  };

  const handleEditTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'कैमरा उपयोग की अनुमति आवश्यक है।');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.7,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setEditNewSelectedImages(prev => [
          ...prev,
          {
            uri: asset.uri,
            base64: asset.base64,
            fileName: `onload_edit_${Date.now()}.jpg`
          }
        ]);
      }
    } catch (err) {
      console.warn('Edit Camera error:', err);
    }
  };

  const handleEditPickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'गैलरी उपयोग की अनुमति आवश्यक है।');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImgs = result.assets.map((asset, idx) => ({
          uri: asset.uri,
          base64: asset.base64,
          fileName: `onload_edit_${Date.now()}_${idx}.jpg`
        }));
        setEditNewSelectedImages(prev => [...prev, ...newImgs]);
      }
    } catch (err) {
      console.warn('Edit Gallery error:', err);
    }
  };

  const handleRemoveExistingImage = (index) => {
    setEditExistingImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNewImage = (index) => {
    setEditNewSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveSlipEdit = async (andGeneratePdf = false) => {
    if (!editingSlipItem || !editingSlipItem.id) return;

    setSavingSlipEdit(true);
    try {
      let newlyUploadedUrls = [];
      if (editNewSelectedImages.length > 0) {
        try {
          newlyUploadedUrls = await uploadMultipleImagesToImageKit(editNewSelectedImages, '/onload_samples');
        } catch (uploadErr) {
          console.warn('ImageKit upload in edit slip error:', uploadErr);
        }
      }

      const allImages = [...editExistingImages, ...newlyUploadedUrls];
      const pL = parseFloat(editPetrolLiters) || 0;
      const dL = parseFloat(editDieselLiters) || 0;

      const updatedPayload = {
        tankLorryNo: editTankLorryNo.trim(),
        invoiceNo: editInvoiceNo.trim(),
        product: editProduct.trim() || 'MS / HSD',
        petrolLiters: pL,
        petrolDip: editPetrolDip ? `${editPetrolDip.trim()} cm` : '',
        dieselLiters: dL,
        dieselDip: editDieselDip ? `${editDieselDip.trim()} cm` : '',
        supplyLocation: editSupplyLocation.trim() || 'Baitalpur',
        divisionRegion: editDivisionRegion.trim() || 'Baitalpur',
        retailOutletName: editRetailOutletName.trim() || 'Baijnath',
        retailOutletAddress: editRetailOutletAddress.trim() || '',
        oilCompany: editOilCompany.trim() || 'IOCL',
        sourceOfSample: editSourceOfSample.trim() || 'Tank Lorry Nozzle / Delivery Hose',
        sampleDate: editSampleDate.trim(),
        sampleTime: editSampleTime.trim(),
        challanDensity: editChallanDensity.trim(),
        lorryDensity: editLorryDensity.trim(),
        roTankNo: editRoTankNo.trim(),
        aluminumSealNos: editAluminumSealNos.trim(),
        woodenBoxSealNos: editWoodenBoxSealNos.trim(),
        dealerRepName: editDealerRepName.trim() || 'Baijnath',
        placeAndDate: editPlaceAndDate.trim() || `Baitalpur, ${editSampleDate}`,
        driverName: editDriverName.trim(),
        transporterName: editTransporterName.trim(),
        oilCompanyFooter: editOilCompanyFooter.trim() || 'IOCL',
        imageUrls: allImages,
        hasImages: allImages.length > 0
      };

      await updateSavedOnloadSlip(editingSlipItem.id, updatedPayload, editAdjustTankStock);

      Toast.show({
        type: 'success',
        text1: 'स्लिप अपडेट हुई ✅',
        text2: `लॉरी ${editTankLorryNo || 'स्लिप'} का डेटा सुरक्षित हो गया!`
      });

      setShowEditSlipModal(false);

      if (andGeneratePdf) {
        await generateAndShareSampleLabelPdf({
          ...editingSlipItem,
          ...updatedPayload
        });
      }
    } catch (err) {
      console.error('Error saving slip edit:', err);
      Alert.alert('Error', err.message || 'स्लिप अपडेट करने में त्रुटि हुई।');
    } finally {
      setSavingSlipEdit(false);
    }
  };

  const handleLoadIntoMainForm = (item) => {
    setShowEditSlipModal(false);
    setEditingSlipId(item.id);

    setPetrolLiters(item.petrolLiters !== undefined && item.petrolLiters !== null ? String(item.petrolLiters) : '');
    setPetrolDip(item.petrolDip ? String(item.petrolDip).replace(/[^0-9.]/g, '') : '');
    setDieselLiters(item.dieselLiters !== undefined && item.dieselLiters !== null ? String(item.dieselLiters) : '');
    setDieselDip(item.dieselDip ? String(item.dieselDip).replace(/[^0-9.]/g, '') : '');

    setSupplyLocation(item.supplyLocation || 'Baitalpur');
    setDivisionRegion(item.divisionRegion || 'Baitalpur');
    setRetailOutletName(item.retailOutletName || 'Baijnath');
    setRetailOutletAddress(item.retailOutletAddress || '');
    setOilCompany(item.oilCompany || 'IOCL');

    setProduct(item.product || '');
    setSourceOfSample(item.sourceOfSample || '');
    setTankLorryNo(item.tankLorryNo || item.tankerNumber || '');
    setInvoiceNo(item.invoiceNo || item.invoiceNumber || '');

    setSampleDate(item.sampleDate || defaultDateStr);
    setSampleTime(item.sampleTime || defaultTimeStr);

    setChallanDensity(item.challanDensity ? String(item.challanDensity) : '');
    setLorryDensity(item.lorryDensity ? String(item.lorryDensity) : '');

    setRoTankNo(item.roTankNo || '');
    setAluminumSealNos(item.aluminumSealNos || '');
    setWoodenBoxSealNos(item.woodenBoxSealNos || '');

    setDealerRepName(item.dealerRepName || 'Baijnath');
    setPlaceAndDate(item.placeAndDate || `Baitalpur, ${item.sampleDate || defaultDateStr}`);
    setDriverName(item.driverName || '');
    setTransporterName(item.transporterName || '');
    setOilCompanyFooter(item.oilCompanyFooter || 'IOCL');

    if (Array.isArray(item.imageUrls) && item.imageUrls.length > 0) {
      setSelectedImages(item.imageUrls.map(url => ({ uri: url, isExisting: true })));
    } else {
      setSelectedImages([]);
    }

    setActiveTab('new');
    Toast.show({
      type: 'info',
      text1: 'स्लिप मुख्य फॉर्म में लोड हुई 📝',
      text2: 'बदलाव करें और Generate Annexure S-2 PDF दबाएं।'
    });
  };

  const handleCancelEditMode = () => {
    setEditingSlipId(null);
    setPetrolLiters('');
    setPetrolDip('');
    setDieselLiters('');
    setDieselDip('');
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
    setSelectedImages([]);
    Toast.show({
      type: 'info',
      text1: 'एडिट रद्द हुआ',
      text2: 'नया ऑनलोड फॉर्म खाली कर दिया गया है।'
    });
  };

  const handleDeleteSlip = (item) => {
    Alert.alert(
      'स्लिप डिलीट करें?',
      `क्या आप लॉरी ${item.tankLorryNo || item.invoiceNo || 'स्लिप'} को डिलीट करना चाहते हैं?`,
      [
        { text: 'रद्द करें', style: 'cancel' },
        {
          text: 'हाँ, हटाएं',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavedOnloadSlip(item.id);
              Toast.show({
                type: 'success',
                text1: 'स्लिप हटाई गई',
                text2: 'रिकॉर्ड सफलतापूर्वक डिलीट कर दिया गया।'
              });
            } catch (err) {
              Alert.alert('Error', err.message || 'स्लिप डिलीट करने में त्रुटि।');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      {/* 1. Live Tank Inventory Bar with Stock Edit Button */}
      <View style={styles.topTankBar}>
        <View style={styles.tankCardsRow}>
          {/* Tank 1 (Petrol) Card */}
          <View style={[styles.tankMiniCard, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="flame" size={14} color="#E65100" style={{ marginRight: 4 }} />
                <Text style={[styles.tankMiniCardTitle, { color: '#C2410C' }]}>Tank 1 (Petrol)</Text>
              </View>
              {tank1Data.dip ? (
                <Text style={styles.tankMiniDipText}>Dip: {tank1Data.dip}</Text>
              ) : null}
            </View>
            <Text style={[styles.tankMiniStockVal, { color: '#E65100' }]}>
              {tank1Data.stock.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L
            </Text>
          </View>

          {/* Tank 2 (Diesel) Card */}
          <View style={[styles.tankMiniCard, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="water" size={14} color="#003C8F" style={{ marginRight: 4 }} />
                <Text style={[styles.tankMiniCardTitle, { color: '#003C8F' }]}>Tank 2 (Diesel)</Text>
              </View>
              {tank2Data.dip ? (
                <Text style={styles.tankMiniDipText}>Dip: {tank2Data.dip}</Text>
              ) : null}
            </View>
            <Text style={[styles.tankMiniStockVal, { color: '#003C8F' }]}>
              {tank2Data.stock.toLocaleString('en-IN', { maximumFractionDigits: 1 })} L
            </Text>
          </View>
        </View>

        {/* Stock Edit / Dip Adjustment Button */}
        <TouchableOpacity 
          style={styles.stockEditBtn} 
          onPress={handleOpenStockEdit}
          activeOpacity={0.8}
        >
          <Icon name="create-outline" size={15} color="#003C8F" style={{ marginRight: 4 }} />
          <Text style={styles.stockEditBtnText}>Stock Edit / Dip सुधार</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Mode Tabs: New Onload vs History */}
      <View style={styles.tabNavRow}>
        <TouchableOpacity
          style={[styles.tabNavBtn, activeTab === 'new' && styles.tabNavBtnActive]}
          onPress={() => setActiveTab('new')}
          activeOpacity={0.8}
        >
          <Icon 
            name="document-text-outline" 
            size={16} 
            color={activeTab === 'new' ? '#fff' : '#64748B'} 
            style={{ marginRight: 5 }} 
          />
          <Text style={[styles.tabNavBtnText, activeTab === 'new' && styles.tabNavBtnTextActive]}>
            नया ऑनलोड / Sample Slip
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabNavBtn, activeTab === 'history' && styles.tabNavBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.8}
        >
          <Icon 
            name="time-outline" 
            size={16} 
            color={activeTab === 'history' ? '#fff' : '#64748B'} 
            style={{ marginRight: 5 }} 
          />
          <Text style={[styles.tabNavBtnText, activeTab === 'history' && styles.tabNavBtnTextActive]}>
            सेव्ड स्लिप्स ({savedLabels.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Tab Contents */}
      {activeTab === 'new' ? (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={{ flex: 1 }}
        >
          <ScrollView 
            style={styles.formScroll} 
            contentContainerStyle={{ paddingBottom: 160 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Edit Mode Banner when editing an existing saved slip in main form */}
            {editingSlipId && (
              <View style={styles.editModeBanner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={styles.editModeIconWrap}>
                    <Icon name="create" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.editModeTitle}>⚠️ स्लिप एडिट मोड (Editing Saved Slip)</Text>
                    <Text style={styles.editModeSub} numberOfLines={1}>
                      आप पूर्व-दर्ज स्लिप {tankLorryNo || invoiceNo || ''} में बदलाव कर रहे हैं। सबमिट करने पर यह स्लिप अपडेट होगी।
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={handleCancelEditMode}
                >
                  <Text style={styles.cancelEditBtnText}>रद्द करें</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Hero Banner */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroIconWrap}>
                  <Icon name="flask" size={24} color="#003C8F" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.heroBadge}>ANNEXURE - S-2 & TANK ONLOAD</Text>
                  <Text style={styles.heroTitle}>Tank Lorry Decanting & Retention Slip</Text>
                  <Text style={styles.heroSub}>
                    तेल खाली करते समय प्राप्त मात्रा (L & Dip) भरें और ओरिजिनल Annexure S-2 स्लिप बनाएं।
                  </Text>
                </View>
              </View>
            </View>

            {/* --- SECTION 1: FUEL RECEIVED (QUANTITY & DIP) --- */}
            <View style={[styles.sectionCard, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
              <View style={styles.sectionHeaderRow}>
                <Icon name="color-fill-outline" size={18} color="#0284C7" style={{ marginRight: 6 }} />
                <Text style={[styles.sectionTitle, { color: '#0369A1' }]}>
                  1. प्राप्त तेल की मात्रा एवं डिप (Fuel Decanted)
                </Text>
              </View>
              <Text style={styles.sectionSubDesc}>
                गाड़ी से खाली हुआ तेल (Liters) और खाली होने के बाद का डिप (Dip cm) भरें। सेव करते ही यह सीधे Tank 1 व Tank 2 में जुड़ जाएगा।
              </Text>

              {/* Petrol (MS) */}
              <View style={[styles.fuelBlock, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Icon name="flame" size={16} color="#E65100" style={{ marginRight: 4 }} />
                  <Text style={[styles.fuelBlockTitle, { color: '#C2410C' }]}>
                    पेट्रोल (MS) आवक:
                  </Text>
                </View>
                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>मात्रा (Liters):</Text>
                    <TextInput
                      style={styles.input}
                      value={petrolLiters}
                      onChangeText={setPetrolLiters}
                      placeholder="उदा: 4000"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>डिप (Dip cm):</Text>
                    <TextInput
                      style={styles.input}
                      value={petrolDip}
                      onChangeText={setPetrolDip}
                      placeholder="उदा: 145.2"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              {/* Diesel (HSD) */}
              <View style={[styles.fuelBlock, { borderColor: '#BFDBFE', backgroundColor: '#FFFFFF', marginTop: 10 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Icon name="water" size={16} color="#003C8F" style={{ marginRight: 4 }} />
                  <Text style={[styles.fuelBlockTitle, { color: '#003C8F' }]}>
                    डीजल (HSD) आवक:
                  </Text>
                </View>
                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>मात्रा (Liters):</Text>
                    <TextInput
                      style={styles.input}
                      value={dieselLiters}
                      onChangeText={setDieselLiters}
                      placeholder="उदा: 8000"
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>डिप (Dip cm):</Text>
                    <TextInput
                      style={styles.input}
                      value={dieselDip}
                      onChangeText={setDieselDip}
                      placeholder="उदा: 182.0"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* --- SECTION 2: EXACT ORIGINAL SAMPLE LABEL FORM --- */}

            {/* 1. Location & Outlet Info */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Icon name="business-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>2. Outlet & Location Details</Text>
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
                <Text style={styles.sectionTitle}>3. Product & Sample Source</Text>
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
                <Text style={styles.sectionTitle}>4. Tank Lorry, Invoice & Time</Text>
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
                <Text style={styles.sectionTitle}>5. Density at 15°C (kg/m³)</Text>
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
                    Difference: {densityDiff > 0 ? `+${densityDiff}` : densityDiff} kg/m³
                    {isDensityPermissible 
                      ? ' (Within permissible ±3.0 limit ✓)' 
                      : ' (Exceeds permissible limit ⚠️)'}
                  </Text>
                </View>
              )}
            </View>

            {/* 5. Decanted Tank & Plastic Seals */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <Icon name="cube-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>6. Decanted Tank & Plastic Seals</Text>
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
                <Text style={styles.sectionTitle}>7. Driver & Representative Details</Text>
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

            {/* Optional Photos Attachment Section */}
            <View style={styles.photosSectionCard}>
              <View style={styles.photosHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="camera" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.photosSectionTitle}>टैंकर / सैंपल फ़ोटो (Optional Photos Attach)</Text>
                </View>
                <View style={styles.optionalBadge}>
                  <Text style={styles.optionalBadgeText}>वैकल्पिक / Optional</Text>
                </View>
              </View>
              <Text style={styles.photosSectionSub}>
                टैंकर नंबर प्लेट, चालान प्रति, घनत्व/हाइड्रोमीटर या सील की फ़ोटो जोड़ सकते हैं:
              </Text>

              <View style={styles.photoActionRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleTakePhoto}
                  style={[styles.photoActionBtn, { backgroundColor: '#003C8F' }]}
                  disabled={uploadingImages || generatingPdf}
                >
                  <Icon name="camera" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.photoActionBtnText}>कैमरा से लें</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePickFromGallery}
                  style={[styles.photoActionBtn, { backgroundColor: '#059669' }]}
                  disabled={uploadingImages || generatingPdf}
                >
                  <Icon name="images" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.photoActionBtnText}>गैलरी से चुनें</Text>
                </TouchableOpacity>
              </View>

              {/* Thumbnails of selected images */}
              {selectedImages.length > 0 && (
                <View style={styles.selectedThumbsContainer}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={styles.selectedThumbsCount}>
                      चयनित तस्वीरें ({selectedImages.length}):
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedImages([])}>
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>सभी हटाएं</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsScroll}>
                    {selectedImages.map((img, idx) => (
                      <View key={idx} style={styles.thumbWrapper}>
                        <Image source={{ uri: img.uri }} style={styles.thumbImageStyle} resizeMode="cover" />
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleRemoveImage(idx)}
                          style={styles.thumbDeleteBtn}
                        >
                          <Icon name="close" size={13} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Certification Box Preview */}
            <View style={styles.certCard}>
              <Icon name="shield-checkmark" size={18} color="#003C8F" style={{ marginRight: 6, marginTop: 2 }} />
              <Text style={styles.certText}>
                "Certified that empty containers had been rinsed with the products before drawing of samples in my presence and the sample is retained after proper labeling and sealing."
              </Text>
            </View>

            {/* Action Buttons: Clear & Submit */}
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
        </KeyboardAvoidingView>
      ) : (
        /* TAB 2: History of previously generated sample labels */
        <View style={{ flex: 1 }}>
          {loadingHistory ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#003C8F" />
              <Text style={styles.loadingText}>Loading saved sample slips...</Text>
            </View>
          ) : (
            <FlatList
              data={savedLabels}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <Icon name="flask-outline" size={48} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>No Sample Labels Saved</Text>
                  <Text style={styles.emptySub}>
                    अभी तक कोई स्लिप सेव नहीं की गई है।
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const pL = Number(item.petrolLiters || 0);
                const dL = Number(item.dieselLiters || 0);

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

                        {/* Onload Quantities Badge if recorded */}
                        {(pL > 0 || dL > 0) && (
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                            {pL > 0 && (
                              <View style={styles.historyPillPetrol}>
                                <Text style={styles.historyPillPetrolText}>⛽ MS: +{pL}L</Text>
                              </View>
                            )}
                            {dL > 0 && (
                              <View style={styles.historyPillDiesel}>
                                <Text style={styles.historyPillDieselText}>🛢️ HSD: +{dL}L</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: 200 }}>
                        {Array.isArray(item.imageUrls) && item.imageUrls.length > 0 && (
                          <TouchableOpacity
                            style={[styles.reprintBtn, { borderColor: '#059669', backgroundColor: '#ECFDF5' }]}
                            onPress={() => {
                              setViewerImages(item.imageUrls);
                              setViewerIndex(0);
                              setViewerVisible(true);
                            }}
                            activeOpacity={0.7}
                          >
                            <Icon name="images" size={15} color="#059669" />
                            <Text style={[styles.reprintBtnText, { color: '#059669' }]}>({item.imageUrls.length})</Text>
                          </TouchableOpacity>
                        )}

                        {/* Edit Slip Button */}
                        <TouchableOpacity
                          style={[styles.reprintBtn, { borderColor: '#D97706', backgroundColor: '#FFFBEB' }]}
                          onPress={() => handleOpenEditModal(item)}
                          activeOpacity={0.7}
                        >
                          <Icon name="create-outline" size={15} color="#B45309" />
                          <Text style={[styles.reprintBtnText, { color: '#B45309' }]}>सुधारें</Text>
                        </TouchableOpacity>

                        {/* PDF Slip Button */}
                        <TouchableOpacity
                          style={styles.reprintBtn}
                          onPress={() => handleReprintPdf(item)}
                          activeOpacity={0.7}
                        >
                          <Icon name="print-outline" size={15} color="#003C8F" />
                          <Text style={styles.reprintBtnText}>PDF</Text>
                        </TouchableOpacity>

                        {/* Delete Slip Button */}
                        <TouchableOpacity
                          style={[styles.reprintBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2', paddingHorizontal: 8 }]}
                          onPress={() => handleDeleteSlip(item)}
                          activeOpacity={0.7}
                        >
                          <Icon name="trash-outline" size={15} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* 4. Direct Stock Edit Modal */}
      <ScrollableModal
        visible={showStockEditModal}
        onRequestClose={() => setShowStockEditModal(false)}
      >
        <View style={styles.modalHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="construct-outline" size={20} color="#003C8F" style={{ marginRight: 6 }} />
            <Text style={styles.modalTitle}>टैंक स्टॉक एवं डिप सुधार</Text>
          </View>
          <TouchableOpacity onPress={() => setShowStockEditModal(false)}>
            <Icon name="close" size={24} color="#64748B" />
          </TouchableOpacity>
        </View>

        <Text style={styles.modalSubTitle}>
          भौतिक डिप नापने पर या किसी कारणवश टैंक स्टॉक गलत दिख रहा है, तो यहाँ वर्तमान सही लीटर और डिप दर्ज करें।
        </Text>

        {/* Tank 1 Edit */}
        <View style={[styles.modalEditBlock, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}>
          <Text style={[styles.modalEditBlockTitle, { color: '#C2410C' }]}>
            ⛽ Tank 1 (Petrol - MS)
          </Text>
          <View style={styles.rowTwoInputs}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>सही स्टॉक (Liters) *:</Text>
              <TextInput
                style={styles.input}
                value={editTank1Liters}
                onChangeText={setEditTank1Liters}
                keyboardType="numeric"
                placeholder="Liters"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>डिप (Dip cm):</Text>
              <TextInput
                style={styles.input}
                value={editTank1Dip}
                onChangeText={setEditTank1Dip}
                keyboardType="numeric"
                placeholder="Dip in cm"
              />
            </View>
          </View>
        </View>

        {/* Tank 2 Edit */}
        <View style={[styles.modalEditBlock, { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', marginTop: 10 }]}>
          <Text style={[styles.modalEditBlockTitle, { color: '#003C8F' }]}>
            🛢️ Tank 2 (Diesel - HSD)
          </Text>
          <View style={styles.rowTwoInputs}>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>सही स्टॉक (Liters) *:</Text>
              <TextInput
                style={styles.input}
                value={editTank2Liters}
                onChangeText={setEditTank2Liters}
                keyboardType="numeric"
                placeholder="Liters"
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={styles.inputLabel}>डिप (Dip cm):</Text>
              <TextInput
                style={styles.input}
                value={editTank2Dip}
                onChangeText={setEditTank2Dip}
                keyboardType="numeric"
                placeholder="Dip in cm"
              />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <TouchableOpacity
            style={styles.modalCancelBtn}
            onPress={() => setShowStockEditModal(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.modalCancelBtnText}>रद्द करें</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalSaveBtn}
            onPress={handleSaveStockEdit}
            disabled={savingStockEdit}
            activeOpacity={0.8}
          >
            {savingStockEdit ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.modalSaveBtnText}>सुधार सेव करें (Save)</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollableModal>

      {/* 4B. Edit Saved Slip Modal */}
      <Modal
        visible={showEditSlipModal}
        transparent={true}
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => setShowEditSlipModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { maxHeight: '92%', padding: 0 }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', marginBottom: 0 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Icon name="create" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.modalTitle, { color: '#B45309' }]}>सेव्ड स्लिप सुधारें (Edit Slip)</Text>
                  <Text style={styles.modalHeaderSub} numberOfLines={1}>
                    {editTankLorryNo ? `लॉरी: ${editTankLorryNo}` : 'Onload Slip'} • Inv: {editInvoiceNo || 'N/A'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowEditSlipModal(false)} style={{ padding: 4 }}>
                <Icon name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Body */}
            <ScrollView 
              style={{ paddingHorizontal: 16, paddingTop: 12 }} 
              contentContainerStyle={{ paddingBottom: 30 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* SECTION 1: LORRY & INVOICE DETAILS */}
              <View style={styles.editSectionCard}>
                <View style={styles.editSectionHeader}>
                  <Icon name="bus" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.editSectionTitle}>1. लॉरी व इनवॉयस विवरण (Lorry & Invoice)</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>टैंक लॉरी नं. (Lorry No) *:</Text>
                    <TextInput
                      style={styles.input}
                      value={editTankLorryNo}
                      onChangeText={setEditTankLorryNo}
                      placeholder="e.g. UP 53 BT 1234"
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>चालान / इनवॉयस नं. *:</Text>
                    <TextInput
                      style={styles.input}
                      value={editInvoiceNo}
                      onChangeText={setEditInvoiceNo}
                      placeholder="e.g. 00987654"
                    />
                  </View>
                </View>

                {/* Product Chips */}
                <Text style={[styles.inputLabel, { marginTop: 8 }]}>उत्पाद (Product):</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {['MS (Petrol)', 'HSD (Diesel)', 'MS & HSD'].map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setEditProduct(p)}
                      style={[
                        styles.productChip,
                        editProduct === p && styles.productChipActive
                      ]}
                    >
                      <Text style={[styles.productChipText, editProduct === p && styles.productChipTextActive]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* SECTION 2: FUEL ONLOAD LITERS & DIPS */}
              <View style={[styles.editSectionCard, { borderLeftColor: '#059669', borderLeftWidth: 4 }]}>
                <View style={styles.editSectionHeader}>
                  <Icon name="water" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={[styles.editSectionTitle, { color: '#059669' }]}>2. ईंधन ऑनलोड मात्रा (Liters & Dip)</Text>
                </View>

                {/* Petrol (MS) */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.inputLabel}>⛽ पेट्रोल (MS Liters):</Text>
                    <TextInput
                      style={styles.input}
                      value={editPetrolLiters}
                      onChangeText={setEditPetrolLiters}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>डिप (Dip cm):</Text>
                    <TextInput
                      style={styles.input}
                      value={editPetrolDip}
                      onChangeText={setEditPetrolDip}
                      keyboardType="numeric"
                      placeholder="e.g. 150"
                    />
                  </View>
                </View>

                {/* Diesel (HSD) */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.inputLabel}>🛢️ डीजल (HSD Liters):</Text>
                    <TextInput
                      style={styles.input}
                      value={editDieselLiters}
                      onChangeText={setEditDieselLiters}
                      keyboardType="numeric"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>डिप (Dip cm):</Text>
                    <TextInput
                      style={styles.input}
                      value={editDieselDip}
                      onChangeText={setEditDieselDip}
                      keyboardType="numeric"
                      placeholder="e.g. 185"
                    />
                  </View>
                </View>

                {/* Auto Adjust Tank Stock Toggle */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.toggleTitle}>टैंक स्टॉक में स्वतः अंतर समायोजित करें</Text>
                    <Text style={styles.toggleSub}>
                      {editAdjustTankStock 
                        ? 'चालू (ON): लीटर बदलने पर Tank 1 व 2 का स्टॉक भी स्वतः घटेगा/बढ़ेगा।'
                        : 'बंद (OFF): केवल स्लिप में बदलाव होगा, टैंक स्टॉक में कोई परिवर्तन नहीं होगा।'}
                    </Text>
                  </View>
                  <Switch
                    value={editAdjustTankStock}
                    onValueChange={setEditAdjustTankStock}
                    trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                    thumbColor={editAdjustTankStock ? '#16A34A' : '#F1F5F9'}
                  />
                </View>
              </View>

              {/* SECTION 3: DENSITY AT 15°C */}
              <View style={[styles.editSectionCard, { borderLeftColor: '#0284C7', borderLeftWidth: 4 }]}>
                <View style={styles.editSectionHeader}>
                  <Icon name="flask" size={16} color="#0284C7" style={{ marginRight: 6 }} />
                  <Text style={[styles.editSectionTitle, { color: '#0284C7' }]}>3. घनत्व / डेंसिटी 15°C (kg/m³)</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>चालान घनत्व (Challan):</Text>
                    <TextInput
                      style={styles.input}
                      value={editChallanDensity}
                      onChangeText={setEditChallanDensity}
                      keyboardType="numeric"
                      placeholder="e.g. 745.0"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>लॉरी घनत्व (Lorry):</Text>
                    <TextInput
                      style={styles.input}
                      value={editLorryDensity}
                      onChangeText={setEditLorryDensity}
                      keyboardType="numeric"
                      placeholder="e.g. 746.2"
                    />
                  </View>
                </View>

                {/* Density Diff Preview */}
                {editDensityDiff !== null && (
                  <View style={[
                    styles.diffBadge,
                    { backgroundColor: isEditDensityPermissible ? '#F0FDF4' : '#FEF2F2', borderColor: isEditDensityPermissible ? '#86EFAC' : '#FCA5A5' }
                  ]}>
                    <Icon 
                      name={isEditDensityPermissible ? "checkmark-circle" : "alert-circle"} 
                      size={16} 
                      color={isEditDensityPermissible ? "#16A34A" : "#DC2626"} 
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isEditDensityPermissible ? '#15803D' : '#DC2626' }}>
                      अंतर (Δ): {editDensityDiff > 0 ? `+${editDensityDiff}` : editDensityDiff} kg/m³ {isEditDensityPermissible ? '✓ (स्वीकार्य ±3.0)' : '⚠️ (स्वीकार्य सीमा से बाहर)'}
                    </Text>
                  </View>
                )}
              </View>

              {/* SECTION 4: DATE, TIME & LOCATION */}
              <View style={styles.editSectionCard}>
                <View style={styles.editSectionHeader}>
                  <Icon name="calendar" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.editSectionTitle}>4. तारीख, समय व स्थान (Date & Location)</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>तारीख (DD/MM/YYYY):</Text>
                    <TextInput
                      style={styles.input}
                      value={editSampleDate}
                      onChangeText={setEditSampleDate}
                      placeholder="DD/MM/YYYY"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>समय (HH:MM):</Text>
                    <TextInput
                      style={styles.input}
                      value={editSampleTime}
                      onChangeText={setEditSampleTime}
                      placeholder="HH:MM"
                    />
                  </View>
                </View>

                <View style={[styles.rowTwoInputs, { marginTop: 8 }]}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>सप्लाई लोकेशन (डिपो):</Text>
                    <TextInput
                      style={styles.input}
                      value={editSupplyLocation}
                      onChangeText={setEditSupplyLocation}
                      placeholder="e.g. Baitalpur"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>आउटलेट नाम:</Text>
                    <TextInput
                      style={styles.input}
                      value={editRetailOutletName}
                      onChangeText={setEditRetailOutletName}
                      placeholder="e.g. Baijnath"
                    />
                  </View>
                </View>
              </View>

              {/* SECTION 5: SEALS & AUTHORITY */}
              <View style={styles.editSectionCard}>
                <View style={styles.editSectionHeader}>
                  <Icon name="shield-checkmark" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.editSectionTitle}>5. सील व हस्ताक्षर (Seals & Authority)</Text>
                </View>

                <View style={styles.rowTwoInputs}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>एल्यूमिनियम सील नं.:</Text>
                    <TextInput
                      style={styles.input}
                      value={editAluminumSealNos}
                      onChangeText={setEditAluminumSealNos}
                      placeholder="e.g. A-1234, A-1235"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>लकड़ी बॉक्स सील नं.:</Text>
                    <TextInput
                      style={styles.input}
                      value={editWoodenBoxSealNos}
                      onChangeText={setEditWoodenBoxSealNos}
                      placeholder="e.g. W-987"
                    />
                  </View>
                </View>

                <View style={[styles.rowTwoInputs, { marginTop: 8 }]}>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>ड्राइवर का नाम:</Text>
                    <TextInput
                      style={styles.input}
                      value={editDriverName}
                      onChangeText={setEditDriverName}
                      placeholder="Driver Name"
                    />
                  </View>
                  <View style={styles.inputCol}>
                    <Text style={styles.inputLabel}>ट्रांसपोर्टर का नाम:</Text>
                    <TextInput
                      style={styles.input}
                      value={editTransporterName}
                      onChangeText={setEditTransporterName}
                      placeholder="Transporter Name"
                    />
                  </View>
                </View>
              </View>

              {/* SECTION 6: PHOTOS MANAGEMENT */}
              <View style={styles.editSectionCard}>
                <View style={styles.editSectionHeader}>
                  <Icon name="images" size={16} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={styles.editSectionTitle}>
                    6. संलग्न फ़ोटो ({editExistingImages.length + editNewSelectedImages.length})
                  </Text>
                </View>

                {/* Thumbnails row */}
                {(editExistingImages.length > 0 || editNewSelectedImages.length > 0) ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                    {/* Existing Remote Images */}
                    {editExistingImages.map((uri, idx) => (
                      <View key={`exist_${idx}`} style={styles.editThumbWrap}>
                        <Image source={{ uri }} style={styles.editThumbImg} />
                        <TouchableOpacity
                          style={styles.editThumbRemoveBtn}
                          onPress={() => handleRemoveExistingImage(idx)}
                        >
                          <Icon name="close" size={12} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* New Local Images */}
                    {editNewSelectedImages.map((img, idx) => (
                      <View key={`new_${idx}`} style={[styles.editThumbWrap, { borderColor: '#16A34A' }]}>
                        <Image source={{ uri: img.uri }} style={styles.editThumbImg} />
                        <View style={styles.newBadgeMini}>
                          <Text style={styles.newBadgeMiniText}>NEW</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.editThumbRemoveBtn}
                          onPress={() => handleRemoveNewImage(idx)}
                        >
                          <Icon name="close" size={12} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginVertical: 6, fontStyle: 'italic' }}>
                    कोई फ़ोटो संलग्न नहीं है। आप नीचे दिए गए बटनों से फ़ोटो जोड़ सकते हैं।
                  </Text>
                )}

                {/* Add Photo Buttons */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    style={styles.photoAddMiniBtn}
                    onPress={handleEditTakePhoto}
                  >
                    <Icon name="camera" size={14} color="#003C8F" style={{ marginRight: 4 }} />
                    <Text style={styles.photoAddMiniBtnText}>+ कैमरा</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.photoAddMiniBtn}
                    onPress={handleEditPickFromGallery}
                  >
                    <Icon name="image" size={14} color="#003C8F" style={{ marginRight: 4 }} />
                    <Text style={styles.photoAddMiniBtnText}>+ गैलरी</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={{ gap: 8, marginTop: 10 }}>
                {/* 1. Save Changes */}
                <TouchableOpacity
                  style={styles.saveEditModalBtn}
                  onPress={() => handleSaveSlipEdit(false)}
                  disabled={savingSlipEdit}
                  activeOpacity={0.8}
                >
                  {savingSlipEdit ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Icon name="save-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.saveEditModalBtnText}>💾 सुधार सेव करें (Save Changes)</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* 2. Save & Generate PDF */}
                <TouchableOpacity
                  style={[styles.saveEditModalBtn, { backgroundColor: '#059669' }]}
                  onPress={() => handleSaveSlipEdit(true)}
                  disabled={savingSlipEdit}
                  activeOpacity={0.8}
                >
                  <Icon name="print-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveEditModalBtnText}>📄 सेव करें व नया PDF बनाएं</Text>
                </TouchableOpacity>

                {/* 3. Open in Main Form */}
                <TouchableOpacity
                  style={[styles.saveEditModalBtn, { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' }]}
                  onPress={() => handleLoadIntoMainForm(editingSlipItem)}
                  activeOpacity={0.8}
                >
                  <Icon name="open-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
                  <Text style={[styles.saveEditModalBtnText, { color: '#003C8F' }]}>📝 मुख्य फॉर्म में खोलें (Full Form)</Text>
                </TouchableOpacity>

                {/* 4. Cancel */}
                <TouchableOpacity
                  style={styles.cancelEditModalBtn}
                  onPress={() => setShowEditSlipModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelEditModalBtnText}>रद्द करें (Cancel)</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 5. Fullscreen Zoomable Photo Viewer */}
      <ImageViewerModal
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        title="Sample Lorry / Onload Photos"
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },

  // Top Live Tank Bar
  topTankBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  tankCardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8
  },
  tankMiniCard: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1
  },
  tankMiniCardTitle: {
    fontSize: 11.5,
    fontWeight: '700'
  },
  tankMiniDipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B'
  },
  tankMiniStockVal: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2
  },
  stockEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  stockEditBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#003C8F'
  },

  // Tabs
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  tabNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8
  },
  tabNavBtnActive: {
    backgroundColor: '#003C8F'
  },
  tabNavBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B'
  },
  tabNavBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },

  // Form Scroll
  formScroll: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10
  },

  // Hero Card
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#003C8F',
    letterSpacing: 0.5
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2
  },
  heroSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#003C8F'
  },
  sectionSubDesc: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 10,
    lineHeight: 16
  },

  // Fuel Block
  fuelBlock: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1
  },
  fuelBlockTitle: {
    fontSize: 12.5,
    fontWeight: '700'
  },

  // Inputs
  rowTwoInputs: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8
  },
  inputCol: {
    flex: 1
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A'
  },
  inputPrefilled: {
    backgroundColor: '#F1F5F9',
    color: '#0F172A'
  },

  // Product Pills
  productPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6
  },
  productPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center'
  },
  productPillActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  productPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569'
  },
  productPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },

  // Density Diff Badge
  densityDiffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10
  },
  densityDiffOk: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC'
  },
  densityDiffWarn: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5'
  },
  densityDiffText: {
    fontSize: 12,
    fontWeight: '700'
  },

  // Certification Banner
  certCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 14
  },
  certText: {
    flex: 1,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#1E40AF',
    lineHeight: 16
  },

  // Buttons Row
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 40
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginLeft: 6
  },
  generateBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    paddingVertical: 13,
    borderRadius: 10,
    shadowColor: '#003C8F',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
  generateBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF'
  },

  // History Tab Styles
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 10
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    marginTop: 40
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12
  },
  emptySub: {
    fontSize: 12.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 20
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  historyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  historyCardTitle: {
    fontSize: 14,
    fontWeight: '700',
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
  historyPillPetrol: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FED7AA'
  },
  historyPillPetrolText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C2410C'
  },
  historyPillDiesel: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  historyPillDieselText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#003C8F'
  },
  reprintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  reprintBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F',
    marginLeft: 4
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  modalScrollOverlay: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 24
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 500,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#003C8F'
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 16
  },
  modalEditBlock: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1
  },
  modalEditBlockTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 4
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569'
  },
  modalSaveBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#003C8F',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF'
  },

  // Photos Attachment Section
  photosSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 14
  },
  photosHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  photosSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#003C8F'
  },
  optionalBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  optionalBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B'
  },
  photosSectionSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 16
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 10
  },
  photoActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8
  },
  photoActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700'
  },
  selectedThumbsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  selectedThumbsCount: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155'
  },
  thumbsScroll: {
    gap: 8,
    paddingVertical: 4
  },
  thumbWrapper: {
    width: 64,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  thumbImageStyle: {
    width: '100%',
    height: '100%'
  },
  thumbDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Edit Mode Banner (Main Form)
  editModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#F59E0B'
  },
  editModeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  editModeTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#92400E'
  },
  editModeSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 15
  },
  cancelEditBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D97706',
    marginLeft: 8
  },
  cancelEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706'
  },

  // Edit Modal Styles
  modalHeaderSub: {
    fontSize: 11.5,
    color: '#78350F',
    marginTop: 2
  },
  editSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  editSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  editSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  productChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center'
  },
  productChipActive: {
    backgroundColor: '#003C8F',
    borderColor: '#003C8F'
  },
  productChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569'
  },
  productChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  toggleTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A'
  },
  toggleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8
  },
  editThumbWrap: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1'
  },
  editThumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover'
  },
  editThumbRemoveBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center'
  },
  newBadgeMini: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: '#16A34A',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4
  },
  newBadgeMiniText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF'
  },
  photoAddMiniBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  photoAddMiniBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003C8F'
  },
  saveEditModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003C8F',
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  saveEditModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  cancelEditModalBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  cancelEditModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569'
  }
});
