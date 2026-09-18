import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';

const { width } = Dimensions.get('window');

export default function CustomAlert({ 
  visible, 
  title, 
  message, 
  onCancel, 
  onConfirm, 
  cancelText = "Cancel", 
  confirmText = "Confirm",
  confirmColor = "#003C8F", 
  isDestructive = false,
  loading = false 
}) {
  const confirmBtnColor = isDestructive ? "#E53935" : confirmColor;
  const iconName = isDestructive ? "warning" : "information-circle";
  const iconColor = isDestructive ? "#E53935" : confirmColor;
  const iconBg = isDestructive ? "#FFEBEE" : "#E3F2FD";

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.alertBox}>
          {/* Icon Header */}
          <View style={styles.iconWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
              <Icon name={iconName} size={36} color={iconColor} />
            </View>
          </View>

          {title && <Text style={styles.title}>{title}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={onCancel} 
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: confirmBtnColor }]} 
              onPress={onConfirm} 
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmText}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  alertBox: {
    backgroundColor: '#fff',
    width: width * 0.85,
    borderRadius: 20,
    padding: 25,
    paddingTop: 35,
    elevation: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    alignItems: 'center'
  },
  iconWrapper: {
    position: 'absolute',
    top: -35,
    alignItems: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 4,
    borderColor: '#fff'
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#222',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.5
  },
  message: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
    paddingHorizontal: 10
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  cancelText: {
    color: '#555',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5
  }
});
