import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder } from 'react-native';
import Icon from '@expo/vector-icons/Ionicons';

const SwipeToSettle = ({ onSettle, disabled }) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const [settled, setSettled] = useState(false);
  const [maxWidth, setMaxWidth] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !settled,
      onMoveShouldSetPanResponder: () => !disabled && !settled,
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (e, gesture) => {
        if (maxWidth > 0 && gesture.dx > maxWidth * 0.75) {
          Animated.spring(pan, {
            toValue: { x: maxWidth, y: 0 },
            useNativeDriver: false
          }).start(() => {
            setSettled(true);
            if (onSettle) onSettle();
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false
          }).start();
        }
      }
    })
  ).current;

  const translateX = pan.x.interpolate({
    inputRange: [0, maxWidth > 0 ? maxWidth : 1],
    outputRange: [0, maxWidth > 0 ? maxWidth : 1],
    extrapolate: 'clamp'
  });

  return (
    <View 
      style={[styles.container, (disabled || settled) && styles.disabled, settled && { backgroundColor: '#D1FAE5' }]}
      onLayout={(e) => {
        // container width minus button width (50) and padding (5)
        setMaxWidth(e.nativeEvent.layout.width - 60);
      }}
    >
      <Text style={[styles.text, settled && { color: '#059669' }]}>
        {settled ? "Successfully Settled" : "Swipe to Settle Amount"}
      </Text>
      
      <Animated.View
        style={[
          styles.button,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        <Icon name={settled ? "checkmark" : "chevron-forward-outline"} size={24} color={settled ? "#059669" : "#003C8F"} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: '#E0F2FE',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginVertical: 10,
    overflow: 'hidden',
    width: '100%'
  },
  text: {
    color: '#0369A1',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 20
  },
  button: {
    height: 50,
    width: 60,
    backgroundColor: '#fff',
    borderRadius: 25,
    position: 'absolute',
    left: 5,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 10
  },
  disabled: {
    opacity: 0.8
  }
});

export default SwipeToSettle;
