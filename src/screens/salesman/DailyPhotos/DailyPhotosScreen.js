import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import Icon from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../../services/firebase';
import { AuthContext } from '../../../context/AuthContext';
import { uploadMultipleImagesToImageKit } from '../../../services/imagekitService';
import { saveDailyPumpPhotos, cleanupOldDailyPhotos, getLocalDateString } from '../../../services/dbServices';
import ImageViewerModal from '../../../components/ImageViewerModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function DailyPhotosScreen() {
  const { user } = useContext(AuthContext);

  // Form State
  const [selectedStaffName, setSelectedStaffName] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [note, setNote] = useState('');
  const [selectedImages, setSelectedImages] = useState([]); // array of { uri, base64 }
  const [uploading, setUploading] = useState(false);

  // History State (Only past 5 days)
  const [todayPhotos, setTodayPhotos] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Fullscreen Viewer State
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerTitle, setViewerTitle] = useState('Daily Pump Photo');

  const todayStr = getLocalDateString();

  // 1. Automatic cleanup of photos older than 5 days & load Staff List
  useEffect(() => {
    // Run cleanup for photos older than 5 days
    cleanupOldDailyPhotos(5).catch(err => {
      console.warn('Auto cleanup photos warning:', err);
    });

    // Fetch staff list from users collection
    const qUsers = query(collection(db, 'users'), where('role', '==', 'salesman'));
    const unsubStaff = onSnapshot(qUsers, (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setStaffList(list);
    }, (err) => {
      console.warn('Staff list listener warning:', err.message);
    });

    return () => unsubStaff();
  }, []);

  // 2. Listen to daily pump photos (filtered to last 5 days)
  useEffect(() => {
    const q = query(
      collection(db, 'daily_pump_photos'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const fiveDaysAgoMs = Date.now() - 5 * 24 * 60 * 60 * 1000;
      const list = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let photoTime = 0;
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

        // Only include photos from past 5 days
        if (photoTime >= fiveDaysAgoMs) {
          list.push({ id: docSnap.id, ...data });
        }
      });

      setTodayPhotos(list);
      setLoadingHistory(false);
    }, (err) => {
      console.warn('Daily photos listener warning:', err.message);
      setLoadingHistory(false);
    });

    return () => unsub();
  }, []);

  // Request Camera & Library Permissions
  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
      const libraryStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!cameraStatus.granted || !libraryStatus.granted) {
        Alert.alert(
          'Permission Required',
          'फ़ोटो खींचने या गैलरी से चुनने के लिए कैमरा और गैलरी अनुमति आवश्यक है।'
        );
        return false;
      }
    }
    return true;
  };

  // Take photo with camera
  const handleTakePhoto = async () => {
    const ok = await requestPermissions();
    if (!ok) return;

    try {
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
            fileName: `pump_${Date.now()}.jpg`
          }
        ]);
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Camera Error', err.message || 'Could not open camera.');
    }
  };

  // Pick photos from gallery
  const handlePickFromGallery = async () => {
    const ok = await requestPermissions();
    if (!ok) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.7,
        base64: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImages = result.assets.map((asset, i) => ({
          uri: asset.uri,
          base64: asset.base64,
          fileName: `pump_${Date.now()}_${i}.jpg`
        }));
        setSelectedImages(prev => [...prev, ...newImages]);
      }
    } catch (err) {
      console.error('Gallery error:', err);
      Alert.alert('Gallery Error', err.message || 'Could not select images.');
    }
  };

  // Remove photo from selection
  const handleRemoveSelectedImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Submit and upload photos
  const handleSubmitPhotos = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('फ़ोटो चुनें', 'कृपया कैमरा या गैलरी से कम से कम 1 फ़ोटो चुनें।');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload all selected images to ImageKit in '/daily_pump_photos'
      const uploadedUrls = await uploadMultipleImagesToImageKit(
        selectedImages,
        '/daily_pump_photos'
      );

      if (uploadedUrls.length === 0) {
        throw new Error('फ़ोटो अपलोड नहीं हो सकी। कृपया इंटरनेट कनेक्शन जांचें।');
      }

      // 2. Save record to Firestore
      // Never auto-write admin account ("Aasish sir"); use staff selection or "स्टाफ"
      const staffName = selectedStaffName.trim() || 'स्टाफ';
      const staffId = user?.uid || '';
      const cleanNote = note.trim();

      await saveDailyPumpPhotos({
        staffId,
        staffName,
        note: cleanNote,
        imageUrls: uploadedUrls,
        dateStr: todayStr
      });

      Toast.show({
        type: 'success',
        text1: 'फ़ोटो अपलोड सफल ✅',
        text2: `${uploadedUrls.length} फ़ोटो सुरक्षित हो गई हैं।`
      });

      // Reset selection
      setSelectedImages([]);
      setNote('');
    } catch (err) {
      console.error('Submit photos error:', err);
      Alert.alert('Upload Error', err.message || 'Failed to upload photos.');
    } finally {
      setUploading(false);
    }
  };

  // Open Fullscreen Viewer for saved history item
  const handleOpenViewer = (images, index = 0, title = 'Pump Photo') => {
    setViewerImages(images);
    setViewerIndex(index);
    setViewerTitle(title);
    setViewerVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Header Notice Banner */}
        <View style={styles.headerCard}>
          <View style={styles.headerIconWrap}>
            <Icon name="camera" size={24} color="#003C8F" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>दैनिक पंप फ़ोटो (Daily Photos)</Text>
          </View>
        </View>

        {/* 1. Photo Attachment Section */}
        <Text style={styles.sectionHeading}>
          1. फ़ोटो चुनें (Add Photos):
        </Text>

        <View style={styles.actionBtnRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleTakePhoto}
            style={[styles.attachBtn, { backgroundColor: '#003C8F' }]}
            disabled={uploading}
          >
            <Icon name="camera" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.attachBtnText}>कैमरा से लें</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handlePickFromGallery}
            style={[styles.attachBtn, { backgroundColor: '#059669' }]}
            disabled={uploading}
          >
            <Icon name="images" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.attachBtnText}>गैलरी से चुनें</Text>
          </TouchableOpacity>
        </View>

        {/* Selected Photos Preview Grid */}
        {selectedImages.length > 0 && (
          <View style={styles.selectedGridWrap}>
            <View style={styles.selectedGridHeader}>
              <Text style={styles.selectedCountText}>
                चयनित फ़ोटो: <Text style={{ fontWeight: '900', color: '#003C8F' }}>{selectedImages.length}</Text>
              </Text>
              <TouchableOpacity onPress={() => setSelectedImages([])}>
                <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>सभी हटाएं</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedGrid}>
              {selectedImages.map((img, idx) => (
                <View key={idx} style={styles.previewThumbBox}>
                  <Image source={{ uri: img.uri }} style={styles.previewThumbImg} resizeMode="cover" />
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => handleRemoveSelectedImage(idx)}
                    style={styles.removeBadge}
                  >
                    <Icon name="close" size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View style={styles.thumbIndexBadge}>
                    <Text style={styles.thumbIndexText}>#{idx + 1}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 2. Staff Name Selector (Optional) */}
        <Text style={[styles.sectionHeading, { marginTop: 14 }]}>
          2. स्टाफ का नाम (Staff Name - Optional):
        </Text>
        <View style={styles.pickerBox}>
          <Picker
            selectedValue={selectedStaffName}
            onValueChange={(val) => setSelectedStaffName(val)}
            style={{ color: '#0F172A', backgroundColor: '#FFFFFF' }}
            dropdownIconColor="#003C8F"
          >
            <Picker.Item label="-- स्टाफ का नाम चुनें (वैकल्पिक) --" value="" color="#64748B" />
            {staffList.map((s) => (
              <Picker.Item key={s.id} label={`👤 ${s.name}`} value={s.name} color="#0F172A" />
            ))}
          </Picker>
        </View>

        {/* 3. Note / Description Input */}
        <Text style={[styles.sectionHeading, { marginTop: 14 }]}>
          3. टिप्पणी (Note):
        </Text>
        <TextInput
          style={styles.noteInput}
          placeholder="टिप्पणी दर्ज करें (वैकल्पिक)..."
          placeholderTextColor="#94A3B8"
          value={note}
          onChangeText={setNote}
          multiline={true}
          numberOfLines={2}
        />

        {/* 4. Upload & Submit Button */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleSubmitPhotos}
          style={[styles.submitBtn, selectedImages.length === 0 && { opacity: 0.6 }]}
          disabled={uploading || selectedImages.length === 0}
        >
          {uploading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>फ़ोटो अपलोड हो रही है...</Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="cloud-upload-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>
                {selectedImages.length > 0
                  ? `अपलोड करें (${selectedImages.length} फ़ोटो)`
                  : 'फ़ोटो अपलोड करें'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 5. Recently Uploaded Gallery */}
        <View style={styles.historySection}>
          <View style={styles.historySectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="time-outline" size={18} color="#003C8F" style={{ marginRight: 6 }} />
              <Text style={styles.historyTitle}>अपलोड की गई तस्वीरें</Text>
            </View>
            <Text style={styles.historyBadge}>{todayPhotos.length} Photos</Text>
          </View>

          {loadingHistory ? (
            <ActivityIndicator size="small" color="#003C8F" style={{ marginVertical: 20 }} />
          ) : todayPhotos.length === 0 ? (
            <View style={styles.emptyHistoryBox}>
              <Icon name="images-outline" size={32} color="#CBD5E1" />
              <Text style={styles.emptyHistoryText}>कोई फ़ोटो नहीं मिली।</Text>
            </View>
          ) : (
            todayPhotos.map(item => {
              const dateText = item.timestamp?.toDate
                ? item.timestamp.toDate().toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })
                : item.dateStr || 'Recent';

              const imgs = Array.isArray(item.imageUrls) ? item.imageUrls : [];
              const displayName = item.staffName && item.staffName !== 'Aasish sir' && item.staffName !== 'Ashish sir' 
                ? item.staffName 
                : 'स्टाफ';

              return (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyCardHeader}>
                    <View>
                      <Text style={styles.historyStaffName}>
                        👤 {displayName}
                      </Text>
                      <Text style={styles.historyDateText}>🕒 {dateText}</Text>
                    </View>
                    <View style={styles.photoCountPill}>
                      <Icon name="images" size={13} color="#003C8F" style={{ marginRight: 4 }} />
                      <Text style={styles.photoCountPillText}>{imgs.length} Photos</Text>
                    </View>
                  </View>

                  {item.note ? (
                    <Text style={styles.historyNoteText}>{item.note}</Text>
                  ) : null}

                  {/* Horizontal Scrollable Thumbnails */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historyThumbRow}>
                    {imgs.map((url, imgIdx) => (
                      <TouchableOpacity
                        key={imgIdx}
                        activeOpacity={0.8}
                        onPress={() => handleOpenViewer(imgs, imgIdx, `${displayName} • ${dateText}`)}
                        style={styles.historyThumbWrap}
                      >
                        <Image source={{ uri: url }} style={styles.historyThumbImg} resizeMode="cover" />
                        <View style={styles.historyZoomHint}>
                          <Icon name="expand" size={12} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Fullscreen Interactive Zoomable Modal */}
      <ImageViewerModal
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        title={viewerTitle}
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
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#003C8F'
  },
  headerSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16
  },
  autoDeleteNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  autoDeleteNoticeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#92400E'
  },
  sectionHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6
  },
  pickerBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 10,
    overflow: 'hidden'
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  attachBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 8,
    elevation: 2
  },
  attachBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700'
  },
  selectedGridWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  selectedGridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  selectedCountText: {
    fontSize: 11.5,
    color: '#475569'
  },
  selectedGrid: {
    gap: 10
  },
  previewThumbBox: {
    width: 76,
    height: 76,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  previewThumbImg: {
    width: '100%',
    height: '100%'
  },
  removeBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center'
  },
  thumbIndexBadge: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    borderRadius: 3
  },
  thumbIndexText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700'
  },
  noteInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#1E293B',
    minHeight: 52
  },
  submitBtn: {
    backgroundColor: '#FF6F00',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    elevation: 3
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  historySection: {
    marginTop: 22,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12
  },
  historySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#003C8F'
  },
  historyBadge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10
  },
  emptyHistoryBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6
  },
  historyCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  historyStaffName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B'
  },
  historyDateText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2
  },
  photoCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  photoCountPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#003C8F'
  },
  historyNoteText: {
    fontSize: 11.5,
    color: '#334155',
    marginVertical: 6,
    fontStyle: 'italic'
  },
  historyThumbRow: {
    gap: 8,
    marginTop: 6
  },
  historyThumbWrap: {
    width: 68,
    height: 68,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  historyThumbImg: {
    width: '100%',
    height: '100%'
  },
  historyZoomHint: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

