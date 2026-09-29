import React, { useState } from 'react';
import { TextInput, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';

export default function CustomInput({ label, error, style, inputStyle, secureTextEntry, leftIcon, ...props }) {
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputContainer}>
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            <Icon name={leftIcon} size={20} color="#888" />
          </View>
        )}
        <TextInput
          style={[
            styles.input,
            error ? styles.inputError : null,
            inputStyle,
            secureTextEntry && { paddingRight: 45 }, // Leave space for eye icon
            leftIcon && { paddingLeft: 45 } // Leave space for left icon
          ]}
          placeholderTextColor="#64748B"
          secureTextEntry={isSecure}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity 
            style={styles.eyeIcon} 
            onPress={() => setIsSecure(!isSecure)}
          >
            <Icon 
              name={isSecure ? 'eye-off-outline' : 'eye-outline'} 
              size={22} 
              color="#64748B" 
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
    width: '100%',
  },
  label: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 5,
    fontWeight: 'bold',
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  leftIconContainer: {
    position: 'absolute',
    left: 15,
    height: '100%',
    justifyContent: 'center',
    zIndex: 1,
  },
  input: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    fontSize: 16,
    color: '#0F172A',
    width: '100%',
  },
  inputError: {
    borderColor: '#d32f2f',
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    height: '100%',
    justifyContent: 'center',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 5,
  },
});
